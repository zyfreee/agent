import { titleSimilarity } from '../core/text-similarity.js';

/**
 * 正文事实核验：正文写完后的一次旁路小调用——把正文拆成可验证的原子断言，
 * 对照本轮注入的原著条目与三本台账（世界/纳戒/人物）逐条裁决，只记审计不改账、不拦正文。
 *
 * 车道分工（与 npc-consistency.js 的注释对齐）：
 *   - 那边核「写法合不合人设」（防 OOC）；这里核「事实有没有依据」（防编造）——即退役叙述门留下的车道。
 *   - 名字比对（setting-supply.audit 的 unapproved_setting_use）由接线层直接调用本模块归并落账。
 *
 * 裁决标签取 VeriScore（EMNLP 2024）的三标签口径：supported / contradicted / unverified；
 * 模型无可验断言时输出空 claims（abstain），不产生审计。
 */

const CLAIM_TEXT_MAX = 80;
const CLAIMS_MAX = 12;
const FLOOR_TEXT_MAX = 1600;
const INJECTED_TEXT_MAX = 4000;
const STATUS_LINES_MAX = 1200;

export const VERIFY_JSON_SCHEMA = Object.freeze({
    type: 'object',
    properties: {
        claims: {
            type: 'array', maxItems: CLAIMS_MAX,
            items: {
                type: 'object',
                properties: {
                    text: { type: 'string' },
                    subject: { type: 'string' },
                    predicate: { type: 'string' },
                    value: { type: 'string' },
                    verdict: { type: 'string', enum: ['supported', 'contradicted', 'unverified'] },
                    basis: { type: 'string' },
                },
                required: ['text', 'subject', 'predicate', 'verdict'],
            },
        },
        note: { type: 'string' },
    },
    required: ['claims'],
});

export const VERIFY_PROMPT = `你是这部小说的「事实核验员」。给你本轮注入的原著资料、三本台账的现状行和最近正文，你只做一件事：把正文里**可验证的断言**挑出来，逐条对照给出的证据裁决，只输出 JSON。不改账、不评价文笔、不重写正文。

【哪些算可验证断言】
- 数值与境界：境界/段位、金币与物品数量、炼制进度、天数；
- 关系与立场：好感方向、敌我、在场人物、称呼对应的身份；
- 时序：季节、世界天数、事件先后与剩余时限；
- 物品与归属：行囊里有什么、装备了什么、谁给了谁什么；
- 传闻性质：正文把某条传闻当成已证实的事实来写。

【裁决标签】（每条断言恰好一个）
- supported：给出的证据支持这条断言；
- contradicted：给出的证据与断言明确相反（数值对不上、境界对不上、立场对不上、时序对不上）；
- unverified：证据里没有，或只有传闻（rumor）。

【规矩】
1. text 写**规范化断言**（如「萧炎当前境界为斗者三星」），不要逐字复制正文原句；超过 60 字的断言拆开或丢弃。
2. 只报正文里**明写**的断言；修辞、气氛、心理活动不拆。拿不准就别拆，宁缺毋滥。
3. contradicted 必须有明确相反的证据行；没有就判 unverified，不许脑补证据。
4. basis 写证据出处：原著资料行首方括号里的编号写 entry:<编号>；世界/纳戒/人物现状行写 ledger:world / ledger:self / ledger:npc；证据是传闻写 rumor；给不出写 none。
5. 传闻（rumor）没有证实渠道，只许判 unverified，不许判 contradicted。
6. 正文描述的是"这一轮刚发生的变化"而台账还没记上的，判 supported 或 unverified，不算矛盾——台账由另一路负责补记。
7. 只对主角、在场人物、世界现状下判断；原著角色未登场部分的设定不验。
8. 只输出 JSON，不要解释、不要 Markdown 代码块、不要前后缀。没有可验证断言时输出 {"claims":[]}。

【输出格式】
{"claims":[{"text":"萧炎当前境界为斗者三星","subject":"萧炎","predicate":"境界","value":"斗者三星","verdict":"contradicted","basis":"ledger:self"}]}`;

/** 境界词表：斗气大陆阶梯，快筛数值断言用（含"斗者三星"这类段位后缀）。 */
const REALM_WORDS = ['斗之气', '斗者', '斗师', '大斗师', '斗灵', '斗王', '斗皇', '斗宗', '斗尊', '斗圣', '斗帝'];
const REALM_PATTERN = new RegExp(`(${REALM_WORDS.join('|')})[一二三四五六七八九十]{0,3}(星|段|层)?`);
const QUANTITY_PATTERN = /[0-9一二三四五六七八九十百千万两]+ *(枚|颗|瓶|株|名|位|天|年|万|金币|份|道)/;

function normalizeText(value) {
    return String(value ?? '').replace(/[\s\p{P}\p{S}]/gu, '');
}

/**
 * 生成后快筛：正文命中条目名 / 在册人物名 / 境界段位 / 数量词之一才值得发起核验调用。
 * gate 关闭时全部放行。返回 hits 供面板显示为什么触发。
 */
export function shouldVerify({ text, supplyKeys = [], npcNames = [], gate = true } = {}) {
    const body = typeof text === 'string' ? text : '';
    if (!gate) return { status: 'ok', hits: ['gate_off'] };
    if (!body.trim()) return { status: 'skipped', hits: [] };
    const hits = [];
    for (const key of supplyKeys) {
        if (typeof key === 'string' && key.length >= 2 && body.includes(key)) { hits.push(`entry:${key}`); break; }
    }
    for (const name of npcNames) {
        if (typeof name === 'string' && name.length >= 2 && body.includes(name)) { hits.push(`npc:${name}`); break; }
    }
    if (REALM_PATTERN.test(body)) hits.push('realm');
    if (QUANTITY_PATTERN.test(body)) hits.push('quantity');
    return hits.length ? { status: 'ok', hits } : { status: 'skipped', hits: [] };
}

/**
 * 拼核验材料：最近正文 + 本轮注入的原著资料 + 三本台账现状行。
 * 各段独立截断，总量再压到 maxChars——证据不足时模型按规矩判 unverified。
 */
export function buildVerifyUser({ floors = [], injectedText = '', worldLines = '', selfLines = '', npcLines = '', maxChars = 6000 } = {}) {
    const blocks = [];
    const chatLines = (Array.isArray(floors) ? floors : []).map(floor => {
        const text = typeof floor?.text === 'string' ? floor.text.slice(0, FLOOR_TEXT_MAX) : '';
        return text ? `【${floor.role === '玩家' ? '玩家' : '角色'}】${text}` : '';
    }).filter(Boolean);
    blocks.push(chatLines.length ? `【最近正文】\n${chatLines.join('\n')}` : '【最近正文】\n（空的，输出 {"claims":[]}）');
    const injected = typeof injectedText === 'string' ? injectedText.slice(0, INJECTED_TEXT_MAX) : '';
    blocks.push(injected ? `【原著资料（本轮已注入正文模型的）】\n${injected}` : '【原著资料（本轮已注入正文模型的）】\n（本轮没有注入原著条目）');
    const status = [
        worldLines ? `【世界现状】\n${String(worldLines).slice(0, STATUS_LINES_MAX)}` : '',
        selfLines ? `【纳戒现状】\n${String(selfLines).slice(0, STATUS_LINES_MAX)}` : '',
        npcLines ? `【人物现状】\n${String(npcLines).slice(0, STATUS_LINES_MAX)}` : '',
    ].filter(Boolean);
    if (status.length) blocks.push(status.join('\n\n'));
    else blocks.push('【台账现状】\n（三本台账都不可用；证据不足时按规矩判 unverified）');
    const body = blocks.join('\n\n');
    return body.length > maxChars ? body.slice(0, maxChars) : body;
}

/** 带原因重试：坏 JSON 时把拒绝原因喂回去再试一次（与 npc-recorder 的 buildRecordRetryUser 同款）。 */
export function buildVerifyRetryUser({ user = '', raw = '', reason = '', maxChars = 7000 } = {}) {
    const note = `你上一次的输出无法使用（原因：${String(reason).slice(0, 200)}）。原始输出开头是：${String(raw).slice(0, 200)}。请重新只输出符合格式的 JSON。`;
    const body = `${user}\n\n${note}`;
    return body.length > maxChars ? body.slice(0, maxChars) : body;
}

function stripFence(raw) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) return '';
    const fenced = value.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
    if (fenced && fenced[1]) return fenced[1].trim();
    return value.replace(/^\uFEFF/, '').trim();
}

function sliceJson(value) {
    const start = value.search(/[[{]/);
    if (start < 0) return '';
    const open = value[start];
    const close = open === '[' ? ']' : '}';
    const end = value.lastIndexOf(close);
    if (end <= start) return '';
    return value.slice(start, end + 1);
}

const VERDICTS = new Set(['supported', 'contradicted', 'unverified']);

/**
 * 解析核验回答：只认 {"claims":[...]}；逐条校验（verdict 越界丢弃、text 超 80 字截断、
 * 缺 subject/predicate 丢弃、逐字复制正文原句的丢弃、rumor 判 contradicted 的纠偏为 unverified）。
 */
export function parseVerifyReply(raw, { proseText = '' } = {}) {
    const cleaned = stripFence(raw);
    if (!cleaned) return { status: 'empty', reason: '模型没有返回内容' };
    const json = sliceJson(cleaned);
    if (!json) return { status: 'invalid', reason: '回答里没有 JSON', raw: cleaned.slice(0, 400) };
    let payload;
    try {
        payload = JSON.parse(json);
    } catch (error) {
        return { status: 'invalid', reason: `JSON 解析失败：${error?.message ?? error}`, raw: json.slice(0, 400) };
    }
    if (!Array.isArray(payload?.claims)) return { status: 'invalid', reason: 'JSON 里没有 claims 数组', raw: json.slice(0, 400) };
    const prose = normalizeText(proseText);
    const claims = [];
    let dropped = 0;
    for (const item of payload.claims.slice(0, CLAIMS_MAX)) {
        if (!item || typeof item !== 'object') { dropped += 1; continue; }
        const text = typeof item.text === 'string' ? item.text.trim().slice(0, CLAIM_TEXT_MAX) : '';
        const subject = typeof item.subject === 'string' ? item.subject.trim().slice(0, 40) : '';
        const predicate = typeof item.predicate === 'string' ? item.predicate.trim().slice(0, 20) : '';
        let verdict = item.verdict === 'inconclusive' ? 'unverified' : item.verdict;
        if (!text || !subject || !predicate || !VERDICTS.has(verdict)) { dropped += 1; continue; }
        // 逐字复制正文原句的拒收：审计账本不存正文，断言必须是模型改写的规范化表述。
        if (prose && normalizeText(text).length >= 12 && prose.includes(normalizeText(text))) { dropped += 1; continue; }
        const value = typeof item.value === 'string' ? item.value.trim().slice(0, 60) : '';
        const basis = typeof item.basis === 'string' ? item.basis.trim().slice(0, 80) : 'none';
        // 传闻没有证实渠道：模型违规判 contradicted 时纠偏为 unverified（提示词规矩 5 的兜底）。
        if (verdict === 'contradicted' && /^rumor\b/i.test(basis)) verdict = 'unverified';
        claims.push({ text, subject, predicate, value, verdict, basis });
    }
    return { status: 'ok', claims, dropped, note: typeof payload.note === 'string' ? payload.note.slice(0, 200) : '' };
}

/** 豁免键：同一 subject+predicate+value 的断言标过误报就不再重复记。 */
export function exemptKeyOf(entry) {
    return [entry?.subject ?? '', entry?.predicate ?? '', entry?.value ?? ''].map(part => String(part).trim()).join('|');
}

export function isExemptEntry(entry, exemptions = []) {
    if (!Array.isArray(exemptions)) return false;
    const key = exemptKeyOf(entry);
    if (!key.replace(/\|/g, '')) return false;
    return exemptions.some(item => exemptKeyOf(item) === key);
}

/** 台账上限：entries 200 条 FIFO（误报知识由豁免集单独延续），exemptions 100 条。 */
export const VERIFY_ENTRIES_MAX = 200;
export const VERIFY_EXEMPTIONS_MAX = 100;

export function createVerifyLedger() {
    return { version: 1, seq: 0, entries: [], exemptions: [] };
}

/** 台账整形：外部读入（hydrate）时兜底，坏字段不炸。 */
export function normalizeVerifyLedger(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const entries = Array.isArray(source.entries) ? source.entries.filter(item => item && typeof item === 'object') : [];
    const exemptions = Array.isArray(source.exemptions) ? source.exemptions.filter(item => item && typeof item === 'object') : [];
    return {
        version: 1,
        seq: Number.isInteger(source.seq) && source.seq >= 0 ? source.seq : entries.length,
        entries: entries.slice(-VERIFY_ENTRIES_MAX),
        exemptions: exemptions.slice(-VERIFY_EXEMPTIONS_MAX),
    };
}

/** 把一次核验的 claims 变成台账条目（发号、时间戳、楼层）。 */
export function buildVerifyEntries(claims, { floor = null, kind = 'claim' } = {}, ledger = null) {
    const base = ledger ?? createVerifyLedger();
    const ts = new Date().toISOString();
    let seq = Number.isInteger(base.seq) ? base.seq : 0;
    const list = Array.isArray(claims) ? claims : [];
    return list.map(claim => {
        seq += 1;
        return {
            id: `fc${seq.toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`,
            kind,
            floor: Number.isInteger(floor) ? floor : null,
            ts,
            status: 'open',
            revision: 1,
            ...(kind === 'claim'
                ? { verdict: claim.verdict, subject: claim.subject, predicate: claim.predicate, value: claim.value ?? '', basisRef: claim.basis ?? 'none' }
                : { subject: claim.name ?? claim.subject ?? '', predicate: claim.predicate ?? '', value: claim.value ?? claim.key ?? '', basisRef: claim.id ?? '' }),
            text: String(claim.text ?? claim.key ?? '').slice(0, CLAIM_TEXT_MAX),
        };
    });
}

/** 归并：豁免命中不记；同楼同断言不重记；FIFO 截断。 */
export function mergeVerifyEntries(entries, additions, { exemptions = [], max = VERIFY_ENTRIES_MAX, floor = null } = {}) {
    const merged = [...(Array.isArray(entries) ? entries : [])];
    const floorKey = new Set(merged.filter(item => floor === null || item.floor === floor).map(item => `${item.floor}|${exemptKeyOf(item)}|${item.text}`));
    let added = 0;
    for (const item of Array.isArray(additions) ? additions : []) {
        if (isExemptEntry(item, exemptions)) continue;
        const key = `${item.floor}|${exemptKeyOf(item)}|${item.text}`;
        if (floorKey.has(key)) continue;
        floorKey.add(key);
        merged.push(item);
        added += 1;
    }
    return { entries: merged.slice(-max), added };
}

/** 误报标记：乐观锁（revision 对不上拒绝），只有 open 能翻成 false_positive。 */
export function markEntryFalsePositive(entries, { id, expectedRevision } = {}) {
    const list = Array.isArray(entries) ? entries : [];
    const index = list.findIndex(item => item?.id === id);
    if (index < 0) return { accepted: false, reason: 'unknown_entry', entries: list };
    const entry = list[index];
    if (entry.revision !== expectedRevision) return { accepted: false, reason: 'revision_mismatch', currentRevision: entry.revision, entries: list };
    if (entry.status !== 'open') return { accepted: false, reason: 'already_marked', entries: list };
    const next = [...list];
    next[index] = { ...entry, status: 'false_positive', revision: entry.revision + 1 };
    return { accepted: true, entry: next[index], entries: next };
}

/** 把误报条目的断言键升级成豁免（同键后续不再记）。 */
export function addExemption(exemptions, entry, { max = VERIFY_EXEMPTIONS_MAX } = {}) {
    const list = Array.isArray(exemptions) ? [...exemptions] : [];
    const key = exemptKeyOf(entry);
    if (!key.replace(/\|/g, '')) return { accepted: false, reason: 'empty_key', exemptions: list };
    if (list.some(item => exemptKeyOf(item) === key)) return { accepted: true, changed: false, exemptions: list };
    list.push({ subject: entry.subject ?? '', predicate: entry.predicate ?? '', value: entry.value ?? '' });
    return { accepted: true, changed: true, exemptions: list.slice(-max) };
}

/** 面板读数：开着的矛盾/未证实条目（倒序，最新的在上面）。 */
export function listOpenFindings(ledger, { limit = 50 } = {}) {
    const entries = normalizeVerifyLedger(ledger).entries;
    return entries.filter(item => item.status === 'open').slice(-limit).reverse();
}

/** 与正文的疑似逐字复制判定：解析层拒收用的阈值（normalized 包含即算复制）。 */
export function isVerbatimCopy(claimText, proseText) {
    const claim = normalizeText(claimText);
    if (claim.length < 12) return false;
    const prose = normalizeText(proseText);
    return Boolean(prose) && prose.includes(claim);
}

/** 相似度工具转发：测试与接线层共用同一把尺子。 */
export { titleSimilarity };

export { CLAIM_TEXT_MAX, CLAIMS_MAX, FLOOR_TEXT_MAX, INJECTED_TEXT_MAX, STATUS_LINES_MAX };
