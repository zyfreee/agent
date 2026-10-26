const DEFAULT_MAX_PICKS = 6;
const DEFAULT_MAX_ROWS = 120;
const MAX_LOOKUP = 5;

export const SELECT_RULES = [
    '你是《斗破苍穹》同人剧情的事实检索员，只做一件事：判断本轮回复需要哪些原著条目。',
    '',
    '规则：',
    '1. 玩家输入里点到的人名、地名、物品、功法、势力、事件（本名、别名、常用简称都算），只要条目目录里有对应行，必须收进 need，一条都不许漏；“用不用得上”不归你判断，有就必须调。若因此超过 MAX_PICKS 条，按玩家提到的先后顺序取前 MAX_PICKS 条。',
    '2. 除第 1 条外，只选本轮回复必须用到的条目，最多 MAX_PICKS 条。',
    '3. 只是“相关”“大概有用”“可能以后会用”的，一律不选。',
    '4. 会剧透当前进度的条目不要选；玩家这阶段还不知道的事，不算必须用到。',
    '5. 只能从目录里挑，uid 必须原样抄写，不许自己编。',
    '6. 目录里没有合适的条目就返回 {"need":[],"no_match":true}，不要拿相近的凑数。',
    '7. 目录里没有、但你判断本轮必须用到的原著内容（人物、物品、能力、地点等），把它的名字或原文里出现过的关键词写进 "lookup"（最多 5 个，不要编造）；脚本会去全库搜出来再问你一次，卷外条目不会直接注入。',
    '8. 如果能判断剧情进行到第几卷，额外输出 "volume": 整数（1-21）；判断不了就省略，不要猜。',
    '9. 只输出 JSON，不要解释，不要 Markdown 代码块。',
].join('\n');

export const LOOKUP_RULES = [
    '你是《斗破苍穹》同人剧情的事实检索员。脚本按你给的名字，从目录外搜到了一些原著条目，你现在只做一件事：挑出本轮回复必须用到的。',
    '',
    '规则：',
    '1. 玩家输入里点到的候选条目，即使标注「后续卷」，也必须选；有就必须调。',
    '2. 除第 1 条外，只选真正必须用到的，最多 MAX_PICKS 条；只是“相关”“可能有用”的一律不选。',
    '3. uid 只能从候选里原样抄写，不许自己编，也不许选候选以外的条目。',
    '4. 一条都不需要就返回 {"need":[],"no_match":true}。',
    '5. 只输出 JSON，不要解释，不要 Markdown 代码块。',
].join('\n');

/** Chat Completion 的结构化输出约束；模型不支持时由 parseSelection 兜底。 */
export const SELECT_SCHEMA = Object.freeze({
    name: 'FactSelection',
    description: '本轮回复需要引用的原著条目编号',
    strict: true,
    value: Object.freeze({
        $schema: 'http://json-schema.org/draft-04/schema#',
        type: 'object',
        additionalProperties: false,
        required: ['need', 'no_match'],
        properties: {
            need: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['uid', 'why'],
                    properties: {
                        uid: { type: 'integer' },
                        why: { type: 'string' },
                    },
                },
            },
            no_match: { type: 'boolean' },
            volume: { type: 'integer', minimum: 1, maximum: 21 },
            lookup: { type: 'array', items: { type: 'string' } },
        },
    }),
});

function toVolume(value) {
    // Number(null) 是 0、Number('') 也是 0，这里必须显式挡掉，否则“没给卷号”会被当成卷 0。
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function volumeLabel(volume) {
    const parsed = toVolume(volume);
    return parsed === null ? '未知' : `卷${String(parsed).padStart(2, '0')}`;
}

export function buildSelectPrompt({ input, recentTexts = [], volume = null, catalog = [], maxPicks = DEFAULT_MAX_PICKS, rules = SELECT_RULES }) {
    const blocks = [`【当前进度】${volumeLabel(volume)}`];
    const recent = (Array.isArray(recentTexts) ? recentTexts : [])
        .filter(text => typeof text === 'string' && text.trim())
        .slice(-3)
        .map(text => `- ${text.trim().slice(0, 160)}`);
    if (recent.length) blocks.push(`【最近对话】\n${recent.join('\n')}`);
    blocks.push(`【本轮玩家输入】\n${String(input ?? '').trim().slice(0, 400)}`);
    blocks.push(`【可用条目】（uid|类别|标题|摘要）\n${catalog.join('\n') || '（本卷目录为空）'}`);
    const template = typeof rules === 'string' && rules.trim() ? rules : SELECT_RULES;
    const system = template.replaceAll('MAX_PICKS', String(maxPicks));
    const volumeNumber = toVolume(volume);
    return { system, user: blocks.join('\n\n'), meta: { rows: catalog.length, maxPicks, volume: volumeNumber } };
}

function extractJson(reply) {
    const text = typeof reply === 'string' ? reply : '';
    const cleaned = text.replace(/```(?:json)?/giu, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
        return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
        return null;
    }
}

/**
 * 只认目录里的 uid。任何不合格的条目都丢掉并写明原因，不做模糊补全——
 * 补全就是脚本替模型做语义判断，正是这套流程要避免的。
 */
export function parseSelection(reply, { index, volume = null, maxPicks = DEFAULT_MAX_PICKS } = {}) {
    const parsed = extractJson(reply);
    if (!parsed || typeof parsed !== 'object') return { status: 'unparsed', ids: [], entries: [], invalid: [] };

    const rawList = Array.isArray(parsed.need) ? parsed.need : Array.isArray(parsed.ids) ? parsed.ids : [];
    const invalid = [];
    const ids = [];
    const seen = new Set();
    const current = toVolume(volume);

    for (const raw of rawList) {
        const uid = Number(typeof raw === 'object' && raw !== null ? raw.uid : raw);
        if (!Number.isInteger(uid)) { invalid.push({ uid: null, reason: 'bad_uid' }); continue; }
        if (ids.length >= maxPicks) { invalid.push({ uid, reason: 'over_pick' }); continue; }
        if (seen.has(uid)) { invalid.push({ uid, reason: 'duplicate' }); continue; }
        const entry = index?.get?.(uid);
        if (!entry) { invalid.push({ uid, reason: 'unknown_uid' }); continue; }
        if (current !== null && !entry.volumes.includes(current)) { invalid.push({ uid, reason: 'other_volume' }); continue; }
        seen.add(uid);
        ids.push(uid);
    }

    const noMatch = parsed.no_match === true;
    const status = noMatch ? 'no_match' : ids.length ? 'selected' : 'empty';
    const entries = ids.map(uid => index.get(uid)).filter(Boolean);
    // 卷号只是模型顺带给的建议值，越界或缺失都当没给，绝不影响选条结果。
    const suggested = toVolume(parsed.volume);
    const lookup = (Array.isArray(parsed.lookup) ? parsed.lookup : [])
        .map(value => (typeof value === 'string' ? value.trim() : ''))
        .filter(value => value.length >= 2 && value.length <= 40)
        .slice(0, MAX_LOOKUP);
    return { status, ids, entries, invalid, noMatch, lookup, volume: suggested !== null && suggested <= 21 ? suggested : null };
}

/** 卷外候选行的格式和目录一致，多一列卷号，模型才知道会不会剧透。 */
function lookupRow(entry) {
    return `${entry.uid}|${entry.category}|${entry.name}|${entry.volumes.length ? `卷${String(Math.min(...entry.volumes)).padStart(2, '0')}` : '卷未知'}|${entry.summary}`;
}

export function buildLookupPrompt({ input, volume = null, candidates = [], maxPicks = DEFAULT_MAX_PICKS, rules = LOOKUP_RULES }) {
    const blocks = [
        `【当前进度】${volumeLabel(volume)}`,
        `【本轮玩家输入】\n${String(input ?? '').trim().slice(0, 400)}`,
        `【脚本搜到的候选】（uid|类别|标题|卷号|摘要）\n${candidates.map(lookupRow).join('\n') || '（没搜到）'}`,
    ];
    const template = typeof rules === 'string' && rules.trim() ? rules : LOOKUP_RULES;
    return {
        system: template.replaceAll('MAX_PICKS', String(maxPicks)),
        user: blocks.join('\n\n'),
        meta: { candidates: candidates.length, maxPicks },
    };
}

/** 第二次点选只认候选里的 uid，别的 uid 一律当无效——防止模型从全库“回忆”出没搜到的编号。 */
export function parseLookupSelection(reply, { allowedUids, maxPicks = DEFAULT_MAX_PICKS } = {}) {
    const parsed = extractJson(reply);
    if (!parsed || typeof parsed !== 'object') return { status: 'unparsed', ids: [], entries: [], invalid: [], noMatch: false };
    const allowed = allowedUids instanceof Set ? allowedUids : new Set(allowedUids ?? []);
    const rawList = Array.isArray(parsed.need) ? parsed.need : [];
    const ids = [];
    const invalid = [];
    for (const raw of rawList) {
        const uid = Number(typeof raw === 'object' && raw !== null ? raw.uid : raw);
        if (!Number.isInteger(uid)) { invalid.push({ uid: null, reason: 'bad_uid' }); continue; }
        if (ids.length >= maxPicks) { invalid.push({ uid, reason: 'over_pick' }); continue; }
        if (ids.includes(uid)) { invalid.push({ uid, reason: 'duplicate' }); continue; }
        if (!allowed.has(uid)) { invalid.push({ uid, reason: 'not_in_candidates' }); continue; }
        ids.push(uid);
    }
    return { status: ids.length ? 'selected' : (parsed.no_match === true ? 'no_match' : 'empty'), ids, invalid, noMatch: parsed.no_match === true };
}

export function createFactsSelector({ index, complete, maxPicks = DEFAULT_MAX_PICKS, maxRows = DEFAULT_MAX_ROWS, rules = SELECT_RULES, getRules = null, lookupRules = LOOKUP_RULES, getLookupRules = null } = {}) {
    if (!index || typeof index.catalogFor !== 'function') throw new TypeError('index 必须提供 catalogFor');
    if (typeof complete !== 'function') throw new TypeError('complete 必须是函数');

    // 规则允许在设置页里改，每次选条现读，不必重启扩展。
    function currentRules() {
        const live = typeof getRules === 'function' ? getRules() : null;
        return typeof live === 'string' && live.trim() ? live : rules;
    }

    function currentLookupRules() {
        const live = typeof getLookupRules === 'function' ? getLookupRules() : null;
        return typeof live === 'string' && live.trim() ? live : lookupRules;
    }

    async function select({ input, recentTexts = [], volume = null, signal } = {}) {
        const stats = index.stats();
        if (!stats.total) return { status: 'no_index', ids: [], entries: [], invalid: [], meta: { total: 0 } };

        const current = toVolume(volume);
        const built = current === null
            ? { lines: index.fullCatalog({ limit: maxRows }), firstCount: 0, prevCount: 0, truncated: stats.total > maxRows, total: stats.total }
            : index.catalogFor(current, { maxRows });

        // 只认模型结果：脚本不做名字命中、不做自动补选，模型没选就不注入。
        const prompt = buildSelectPrompt({ input, recentTexts, volume: current, catalog: built.lines, maxPicks, rules: currentRules() });
        let raw;
        try {
            raw = await complete({ system: prompt.system, user: prompt.user, jsonSchema: SELECT_SCHEMA, signal });
        } catch (error) {
            return { status: 'failed', ids: [], entries: [], invalid: [], error: error?.message ?? String(error), meta: { ...prompt.meta, total: stats.total } };
        }
        const parsed = parseSelection(raw, { index, volume: current, maxPicks });
        // 卷外通道：只有模型主动给了 lookup 名字、且全库真搜到，才多问一次；否则本轮就一次调用。
        const lookup = parsed.lookup.length
            ? await runLookup({ terms: parsed.lookup, input, current, taken: parsed.ids, signal })
            : null;
        const ids = [];
        for (const uid of parsed.ids) {
            if (ids.length >= maxPicks) break;
            if (!ids.includes(uid)) ids.push(uid);
        }
        for (const uid of lookup?.picked ?? []) {
            if (ids.length >= maxPicks) break;
            if (!ids.includes(uid)) ids.push(uid);
        }
        const entries = ids.map(uid => index.get(uid)).filter(Boolean);
        return {
            ...parsed,
            ids,
            entries,
            lookup,
            secondCall: lookup?.secondCall === true,
            inferredVolume: parsed.volume ?? null,
            meta: { ...prompt.meta, total: stats.total, firstCount: built.firstCount, prevCount: built.prevCount, truncated: built.truncated === true },
        };
    }

    /** 第二次调用：候选由脚本搜，选不选、选哪条由模型定；脚本只做 uid 白名单校验。 */
    async function runLookup({ terms, input, current, taken, signal }) {
        const hits = typeof index.searchByName === 'function' ? index.searchByName(terms, { limit: 12 }) : [];
        const info = {
            requested: terms.slice(),
            hits: hits.map(entry => ({
                uid: entry.uid,
                category: entry.category,
                name: entry.name,
                volumes: Array.isArray(entry.volumes) ? entry.volumes.slice() : [],
            })),
            secondCall: false,
            picked: [],
            note: '',
            error: null,
        };
        if (!hits.length) { info.note = '全库没有搜到这些名字。'; return info; }
        const room = maxPicks - taken.length;
        if (room <= 0) { info.note = '本轮名额已满，没有再问一次。'; return info; }
        const prompt = buildLookupPrompt({ input, volume: current, candidates: hits, maxPicks: room, rules: currentLookupRules() });
        try {
            const reply = await complete({ system: prompt.system, user: prompt.user, jsonSchema: SELECT_SCHEMA, signal });
            const picked = parseLookupSelection(reply, { allowedUids: new Set(hits.map(entry => entry.uid)), maxPicks: room });
            info.secondCall = true;
            info.picked = picked.ids;
            info.status = picked.status;
            info.note = picked.ids.length ? `卷外搜到 ${hits.length} 条，模型选 ${picked.ids.length} 条。` : `卷外搜到 ${hits.length} 条，模型一条没要。`;
        } catch (error) {
            info.error = error?.message ?? String(error);
            info.note = `第二次点选失败：${info.error}`;
        }
        return info;
    }

    return Object.freeze({ select, maxPicks, maxRows });
}
