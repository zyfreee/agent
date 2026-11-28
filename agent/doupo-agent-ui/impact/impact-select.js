/**
 * 世界影响的“开场判定官”：LLM 给出证据、脚本裁决。
 *
 * 每一轮生成前，模型读"世界台账 + 世界线账本 + 埋下的因 + 玩家这一轮的话 + 最近正文"，
 * 回答一个问题——**这一轮有没有撞上以前埋下的那颗种子**。它不判“时间到没到”，
 * 因为世界影响早就不按天推进了：埋下去的东西，只有在某个场合真的被用上，才叫蝴蝶效应。
 *
 * 模型只交证据链（谁、在哪儿、凭什么成立），不交结论：
 *   hits: [{ref, why, evidence, text}]   ref=账本编号，why=为什么这一轮认领了它，
 *                                        evidence=原文里哪句话，text=写进正文的旁白
 * 裁决在本地（judgeImpactHits）：埋线存在且沉底、why 里同时出现"因"和"条件"的关键词、
 * evidence 能在这一轮原文里找到落点、同一条只兑现一次。任一条不满足整条丢弃。
 * 犹豫的一律判不兑现——漏掉一次显形只是继续埋着，错认一次就是骗玩家。
 *
 * 另有 picks：已经摆到明面上的世界变化，这一幕用得上的照旧挑出来。
 *
 * 与记录员（impact-decide.js）分工：
 * - 记录员在生成结束后记账（世界变成了什么样，包括埋下新的因）；
 * - 判定官在生成开始前判断“埋下的因要不要在这一轮显形”，顺带挑几条明面上的变化。
 */

import { buildWorldInjection } from '../world/world-ops.js';
import { buildImpactLedgerLines, IMPACT_HEADER, impactMark, canonLineSummary } from './impact-ops.js';
import { extractJson } from '../host/llm-client.js';

const MAX_LINE_CHARS = 120;
const MAX_NOTE_CHARS = 160;
const MAX_HITS = 2;
/** 判定官交回的 picks 上限：hits 有闸，picks 没有——模型抽风吐 30 条会全量灌进正文提示词。 */
const MAX_PICKS = 12;
const MAX_WHY_CHARS = 120;
const MAX_EVIDENCE_CHARS = 60;

export const IMPACT_INJECT_PROMPT = [
    '你是《斗破苍穹》同人长篇的"世界判定官"。你不上台、不写剧情，每幕开场前只判一件事：**这一轮有没有撞上以前埋下的因**。',
    '所谓蝴蝶效应：玩家很久以前做的一件小事——给了谁一样东西、欠了谁一个人情、说过的某句话——当时没人当回事，现在某个场合正好把它用上了，救了他、害了他、或者把事情推向了另一个方向。你的工作是认出这种“正好”，而不是安排它。',
    '你没有权力让任何事发生。你只能从账本里指认：这一轮的场面，是不是真的认领了某条埋着的因。认不出来就交空清单，这是常态，不是失败。',
    '',
    '【第一步：先看清这一轮是什么场面】',
    '- 【玩家这一轮说】是玩家此刻的动作，最可信；',
    '- 【最近对话】是刚刚写出来的正文，里面的人、物、处境都是真的；',
    '- 【此刻的世界】给出所在城市、时期、名声、通缉、势力动向；',
    '- 【埋着的因】是那些“已经埋进世界、本人还不知道”的种子，每条只给两样：因（什么东西/人情/话）和等（要什么场合才显形）。',
    '- 【记忆里跟这一幕有关的旧事】是同一局真正发生过的事（说过的话、答应过的人情、记下的仇），跟账本不重复，可以当成“因”的另一种来源；',
    '- 【此刻在场的人对玩家什么态度】是人物簿现状，用来判断“这个人在不在场、肯不肯为一个旧交情出手”；',
    '- 【前几轮已经认领过的因】是刚刚用过的桥段，除非这一轮拿出了新东西，不要重复认领。',
    '',
    '【第二步：逐条问，这条因这一轮被认领了吗】',
    '认领要同时满足三件事，缺一条都不许报：',
    '1. **场面对上了**：这一轮确实出现了那条因“等”的处境（人陷入必死之局、两家撕破脸、有人要买那味药……），不是“将来可能会”；',
    '2. **物件对上了**：正文或玩家这一轮的话里，那个东西/人情/话确实在场，不是“应该还在他身上”这种推测；',
    '3. **用途讲得通**：为什么偏偏是它起了作用——它凭什么能救、能坏、能改？讲不通就是巧合，不是蝴蝶效应。',
    '',
    '【第三步：只报能指出原文落点的】',
    '每一条报上来的，都要写清 evidence：从【玩家这一轮说】或【最近对话】里**原样摘一句**（≤60 字），说明这一轮哪里用上了它。摘不出原句，就不要报。',
    '',
    '【不要报】',
    '- 只是气氛像、处境像，但那个东西压根没出现的；',
    '- 只能靠“他大概还带着吧”“过这么久应该用掉了”推测的；',
    '- 已经应验过、已了结、已修复的账；',
    '- 同一轮里两条因抢同一件事的（只报最贴的那一条）。',
    '**宁可判不兑现，也不要猜。** 判错的代价是玩家被硬凑的桥段骗一次，整套机制就不值钱了。',
    '',
    '【另外还要挑几条明面上的变化】',
    '除了埋线，账本里还有“已经发生、世人已经看见”的世界变化。从里面挑这一幕用得上的（与玩家要去的地方、要找的人、要碰的势力直接相关的），改写成一两句旁白：',
    '- 一句话，≤80 字，像说书人顺口交代的环境事实，不是账本摘抄；',
    '- 不要编号、不要"依据/记录/影响/账本/模型"这类词；',
    '- 传闻只能写成"都说/坊间传/有人讲"，不能写成已证实；',
    '- 不写玩家心理、不替玩家做决定、不写角色对话、不推进剧情。',
    '',
    '【账本怎么读】',
    '每行大致是：编号｜第几天｜分量｜状态｜性质｜标题：详情｜对象｜依据｜原著偏移｜源自哪条｜后续；行尾还可能带“手动登记”“已修改（第 N 天）”“关联事件 eX”。',
    '状态：未了结＝世界已经变了、摆在那儿；埋着＝已埋进世界、本人还不知道（这一轮可能被认领）；已应验＝已经显形；已了结/已修复＝不要再挑。',
    '账本里出现“第几天”只是记账时间，跟“什么时候显形”没有任何关系，不要拿天数推算。',
    '',
    '【编号怎么引】',
    '编号原样抄账本里的（写 i3 或 #i3 都行），不许自己编号，不许引用账本里没有的编号；同一条编号只出现一次。',
    '',
    '另外写一句 note（≤120 字）：你判了几条、为什么放过别的。note 只给设置页看，不进正文。',
    '只输出 JSON：{"note":"…","hits":[{"ref":"i7","why":"为什么这一轮认领了它","evidence":"原文原句","text":"写进正文的旁白"}],"picks":[{"ref":"i3","text":"…"}]}。',
    '什么都没认出来就输出 {"note":"这一轮没有撞上埋下的因","hits":[],"picks":[]}。',
].join('\n');

/** 给酒馆结构化输出用的约束；解析端不依赖它，只用来提高严格度。 */
export const IMPACT_INJECT_SCHEMA = Object.freeze({
    type: 'object',
    properties: {
        note: { type: 'string' },
        hits: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    ref: { type: 'string' },
                    why: { type: 'string' },
                    evidence: { type: 'string' },
                    text: { type: 'string' },
                },
                required: ['ref'],
            },
        },
        picks: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    ref: { type: 'string' },
                    text: { type: 'string' },
                },
                required: ['ref', 'text'],
            },
        },
    },
    required: ['hits', 'picks'],
});

function clampInt(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isInteger(num) || num < min || num > max) return fallback;
    return num;
}

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

/** 从“一枚旧护符”里取出能拿去比对的实词：去掉标点与虚词，只留 2 字以上的词。 */
const STOP_WORDS = new Set(['一个', '一枚', '一件', '一句', '一次', '什么', '这个', '那个', '的', '了', '和', '与', '把', '被', '在']);
// 量词/虚字前缀：剥掉“一枚旧护符”里的“一枚”，留下“旧护符”这种真能对上原文的核心词。
const MEASURE = /[枚个件条只张本袋瓶粒块把口门具匹头名位句番次盆箱盒罐串支根面幅片座间家道场回位层圈]/;
const MEASURE_PREFIX = /^(?:[一二两三四五六七八九十几0-9]+|[这那每各某])[枚个件条只张本袋瓶粒块把口门具匹头名位句番次盆箱盒罐串支根面幅片座间家道场回位层圈]$/;
export function seedTokens(value) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return [];
    const STOP = new Set(['一个', '一枚', '一件', '一句', '一次', '什么', '这个', '那个']);
    const MEASURE = '枚个件条只张本袋瓶粒块把口门具匹头名位句番次盆箱盒罐串支根面幅片座间家道场回位层圈';
    const QUANT = '一二两三四五六七八九十几0-9这那每各某';
    const split = value => value.split(/[，。、；：！？\s"'“”‘’（）()《》【】\[\]…—·|｜/\\]+/).filter(Boolean);
    // 在一段里找“X量词”的位置，返回量词下标；找不到 -1。
    const cuoAt = part => {
        for (let at = part.length - 1; at >= 1; at -= 1) {
            if (!MEASURE.includes(part[at])) continue;
            if (QUANT.includes(part[at - 1])) return at;
        }
        return -1;
    };
    const out = [];
    const add = word => {
        const clean = word.replace(/^[的了着过就是]+|[的了着过]+$/g, '');
        if (clean.length >= 2 && !STOP.has(clean) && !out.includes(clean)) out.push(clean);
    };
    // 没有量词可切的长句（“玩家给萧炎的旧护符”），再按虚字切出实词片段：
    // 整句留着当线索没用——原文里不会有人把整句抄一遍，真能对上的是“旧护符”这种物件名。
    const addShards = word => {
        if (!/[的了着过那]/.test(word)) return;
        for (const piece of word.split(/[的了着过那]+/)) {
            const clean = piece.replace(/^[就是]+|[就是]+$/g, '');
            if (clean.length >= 2 && !STOP.has(clean) && !out.includes(clean)) out.push(clean);
        }
    };
    for (const part of split(raw)) {
        // “一枚旧护符”：整截是量词+物件，量词本身不能当线索，只留物件。
        const at = cuoAt(part);
        if (at >= 0 && at < part.length - 1) {
            add(part.slice(at + 1));
            continue;
        }
        add(part);
        addShards(part);
    }
    if (!out.length && raw.length >= 2) out.push(raw);
    return out;
}
/**
 * 证据能不能站住：why 里必须同时出现“因”和“条件”的实词，缺一边就算没对上。
 * 这是把"模型觉得像"变成"文本里确实写了"的唯一办法。
 */
function whyCovers(why, record) {
    const body = text(why);
    if (!body) return false;
    const seedWords = seedTokens(record.seed);
    const triggerWords = seedTokens(record.trigger);
    // 条件这一边常常是整句（“萧炎身陷必死之局”），整句照抄得下来算，含任一半也算；
    // 因这一边必须有实词落地（物件名/人情名/那句原话），不能被“这件事”“那个东西”糊过去。
    const hasSeed = seedWords.some(word => body.includes(word));
    const triggerRaw = text(record.trigger);
    const hasTrigger = (triggerRaw && body.includes(triggerRaw))
        || triggerWords.some(word => body.includes(word))
        || triggerWords.some(word => {
            const half = Math.max(2, Math.floor(word.length / 2));
            for (let at = 0; at + half <= word.length; at += 1) {
                if (body.includes(word.slice(at, at + half))) return true;
            }
            return false;
        });
    return hasSeed && hasTrigger;
}

/**
 * 埋着的因怎么排队：不砍条数，打分。
 *
 * 以前这里硬砍 12 条，排在第 13 位的因永远不会被判定官看到——埋得越久越吃亏，
 * 正是蝴蝶效应最该起作用的那批反而先被埋掉。现在改成算分：
 *   1. 场面对得上（seed/trigger 的实词在这一轮的原文里出现过）最值钱，这是“这一轮真有可能撞上”；
 *   2. 分量重的优先（世界级 > 大事 > 小事）；
 *   3. 埋得久的优先（曝光公平：一直没露面的，往后轮到它的机会该更大）；
 *   4. 露过太多次却一次没撞上的，往后退（光占位置不兑现，说明它大概不是这一场的戏）。
 * 分数只决定“先看谁”，判不判得中仍然是判定官和证据链的事。
 */
export function scoreBuriedRecord(record, { day = 1, sceneText = '', exposure = null } = {}) {
    const scene = text(sceneText);
    const seedWords = seedTokens(record?.seed);
    const triggerWords = seedTokens(record?.trigger);
    const hitCount = word => (scene && word && scene.includes(word) ? 1 : 0);
    const seedHit = seedWords.filter(hitCount).length;
    const triggerHit = triggerWords.filter(hitCount).length;
    // 场面契合：因对上一个实词 +6，条件对上一个 +3——条件本来就写得空，权重低半档。
    const affinity = seedHit * 6 + triggerHit * 3;
    const weightScore = record?.weight === 'world' ? 6 : record?.weight === 'major' ? 4 : 2;
    const buriedDay = Number.isInteger(record?.day) ? record.day : day;
    // 埋得越久越靠前，但封顶 8 天：再久也只是“该轮到它”，不该把新埋的挤光。
    const age = Math.min(8, Math.max(0, day - buriedDay));
    const seen = Number(exposure?.[record?.id] ?? 0);
    // 露过面的往后排，但每轮都露过（≥3 次）就不再加罚，免得一条永远沉底。
    const seenPenalty = Math.min(3, seen) * 1.5;
    const score = affinity + weightScore + age * 0.8 - seenPenalty;
    return { id: text(record?.id), score: Math.round(score * 100) / 100, affinity, seen };
}

/**
 * 按分数给埋着的因排队，全部返回（不截断），由调用方决定给判定官看几条。
 * exposure = { 影响编号: 前几轮被写进【埋着的因】的次数 }，用来做曝光公平。
 */
export function rankBuriedRecords(records, { day = 1, sceneText = '', exposure = null } = {}) {
    const list = Array.isArray(records) ? records : [];
    return list
        .map((record, index) => ({ record, index, ...scoreBuriedRecord(record, { day, sceneText, exposure }) }))
        // 同分时保持账本原序（先埋的在前），不让排序变成另一种随机。
        .sort((a, b) => (b.score - a.score) || (a.index - b.index));
}

/**
 * 裁决：模型交来的每一条“这一轮认领了埋线”，逐条核对，撑不住的丢掉并记原因。
 * 返回 { accepted: [{ref, why, evidence, text, record}], rejected: [{ref, reason}] }。
 */
export function judgeImpactHits(hits, { records = [], corpus = '' } = {}) {
    const byId = new Map((Array.isArray(records) ? records : []).map(record => [record.id, record]));
    const haystack = text(corpus);
    const seen = new Set();
    const accepted = [];
    const rejected = [];
    const list = Array.isArray(hits) ? hits : [];
    for (const item of list) {
        const ref = text(item?.ref).replace(/^#/, '');
        const record = ref ? byId.get(ref) : null;
        if (!ref || !record) { rejected.push({ ref: ref || '(空)', reason: 'no_such_record' }); continue; }
        // 只有“真兑现过”的那一条才算重复；前面被驳回的不代表这条用过，得逐条判。
        if (seen.has(ref)) { rejected.push({ ref, reason: 'duplicate' }); continue; }
        if (record.state !== 'sunk') { rejected.push({ ref, reason: 'not_sunk' }); continue; }
        if (!text(record.seed) || !text(record.trigger)) { rejected.push({ ref, reason: 'no_seed_or_trigger' }); continue; }
        const why = text(item.why).slice(0, MAX_WHY_CHARS);
        if (!whyCovers(why, record)) { rejected.push({ ref, reason: 'why_incomplete' }); continue; }
        const evidence = text(item.evidence).slice(0, MAX_EVIDENCE_CHARS);
        if (!evidence || !haystack.includes(evidence)) { rejected.push({ ref, reason: 'evidence_not_found' }); continue; }
        seen.add(ref);
        accepted.push({ ref, why, evidence, text: text(item.text).slice(0, MAX_LINE_CHARS), record });
        if (accepted.length >= MAX_HITS) break;
    }
    return { accepted, rejected };
}

/** 一屏给判定官看几条埋着的因：不是硬上限，是“这一场最可能有戏的那几条”。 */
export const BURIED_PROMPT_LIMIT = 12;

/**
 * 挑出这一轮摆到判定官面前的埋线：先按分数排队，再取前 N 条。
 * 返回 { lines, ids, hidden }：lines 是账本行，ids 是这次真正“露面”的编号（用来记曝光次数），
 * hidden 是没摆上来的条数。
 */
export function pickBuriedForPrompt(buried = [], { day = 1, sceneText = '', exposure = null, limit = BURIED_PROMPT_LIMIT } = {}) {
    const rows = Array.isArray(buried) ? buried : [];
    const ranked = rankBuriedRecords(rows, { day, sceneText, exposure });
    // 场面命中保底：因/条件在正文里真出现过的埋线，不管综合分多低都排进队头——
    // 否则埋得久的重磅旧线会把“这一幕正要显形的救命稻草”挤出队列，等下一轮场面就错过了。
    const hot = ranked.filter(row => row.affinity > 0);
    const cold = ranked.filter(row => !(row.affinity > 0));
    const ordered = [...hot, ...cold];
    const cap = Number.isInteger(limit) && limit > 0 ? limit : BURIED_PROMPT_LIMIT;
    const shown = ordered.slice(0, cap);
    const lines = shown.map(row => `- #${row.record.id}｜因：${row.record.seed}｜等：${row.record.trigger}｜${row.record.title}${impactMark(row.record)}`);
    const hidden = rows.length - shown.length;
    if (hidden > 0) lines.push(`- （另有 ${hidden} 条埋着的因这一场没浮上来，不是作废，是排到后面了）`);
    return { lines, ids: shown.map(row => row.record.id), hidden };
}

/** 组装判定官的 user 内容：世界此刻 + 账本 + 埋着的因 + 原著节点 + 最近对话 + 玩家这一轮的话。
 *  只返回文本，给调用方与测试用；要拿“这一轮摆上来了哪几条埋线”，用 buildImpactInjectBundle。 */
export function buildImpactInjectUser(options = {}) {
    return buildImpactInjectBundle(options).user;
}

/**
 * 同内容，但多回几样：buriedIds（这一轮真的摆到判定官面前的埋线编号）、buriedHidden（没摆上来的条数）、
 * 外加“共用世界上下文”——记忆里跟这一幕有关的旧事、此刻在场的人对玩家什么态度、前几轮已经认领过哪几条。
 * 曝光计数要按 buriedIds 记，否则“曝光公平”就没有数据源。
 *
 * 为什么要共用上下文：判定官、记录员、结算各自叫一次模型，以前它们互相看不见对方刚知道的事，
 * 同一场戏里 A 知道“这人昨天救过玩家”、B 不知道，判断就会打架。这里把三样公共事实一次讲清。
 */
export function buildImpactInjectBundle({
    snapshot = {}, records = [], floors = [], draft = '', day = 1, canonLines = [],
    exposure = null, buriedLimit = BURIED_PROMPT_LIMIT, memoryLines = [], npcLines = [], claimed = [],
} = {}) {
    const today = clampInt(day, 1, 99999, 1);
    const worldBlock = buildWorldInjection(snapshot, { maxChars: 600 });
    const ledgerRecords = Array.isArray(records) ? records : [];
    const visible = ledgerRecords.filter(record => record.state !== 'sunk');
    const buried = ledgerRecords.filter(record => record.state === 'sunk');
    const ledger = buildImpactLedgerLines(visible, { day: today, maxChars: 1800, maxLines: 30 });
    const counts = {
        active: ledgerRecords.filter(record => record.state === 'active').length,
        sunk: buried.length,
        ripened: ledgerRecords.filter(record => record.state === 'ripened').length,
        closed: ledgerRecords.filter(record => record.state === 'closed' || record.state === 'reverted').length,
    };
    const recent = (Array.isArray(floors) ? floors : [])
        .map(floor => {
            const role = floor?.role === '玩家' ? '玩家' : '角色';
            const body = text(floor?.text);
            return body ? `[${role}] ${body}` : null;
        })
        .filter(Boolean);
    // 埋着的因：只给“因”和“等什么”，不给天数——时间不是判据。
    // 排序按“这一场最可能有戏”，不按编号硬砍：埋得久的、场面对得上的先摆上来。
    const sceneText = [text(draft), ...recent].join('\n');
    const buriedPick = pickBuriedForPrompt(buried, { day: today, sceneText, exposure, limit: buriedLimit });
    const buriedLines = buriedPick.lines;
    const canon = (Array.isArray(canonLines) ? canonLines : []).filter(line => typeof line === 'string' && line.trim());
    const memories = (Array.isArray(memoryLines) ? memoryLines : []).filter(line => typeof line === 'string' && line.trim());
    const npcs = (Array.isArray(npcLines) ? npcLines : []).filter(line => typeof line === 'string' && line.trim());
    // 前几轮已经认领过的因：同一件事不能每轮都被“重新发现”，否则玩家会觉得世界只有一条线。
    const already = (Array.isArray(claimed) ? claimed : []).filter(line => typeof line === 'string' && line.trim());
    const user = [
        '【此刻的世界（既定状态）】',
        worldBlock,
        '',
        `【世界线账本（已经摆在明面上的变化；共 ${ledgerRecords.length} 条：明面 ${counts.active}、埋着 ${counts.sunk}、已应验 ${counts.ripened}、已收场 ${counts.closed}）】`,
        ledger.length ? ledger.map(line => `- ${line}`).join('\n') : '- （明面上还没有变化）',
        '',
        '【埋着的因（已经埋进世界、当事人还不知道；这一轮是否被认领，由你判断）】',
        buried.length ? buriedLines.join('\n') : '- （还没有埋下的因）',
        '',
        ...(memories.length ? ['【记忆里跟这一幕有关的旧事（同一局发生过的事，与账本互不重复）】', ...memories, ''] : []),
        ...(npcs.length ? ['【此刻在场的人对玩家什么态度（人物簿现状）】', ...npcs, ''] : []),
        ...(already.length ? ['【前几轮已经认领过的因（不要重复认领；真要复用，得是这一轮又拿出了新东西）】', ...already, ''] : []),
        ...(canon.length ? ['【原著节点（只用来核对这一轮压在原著哪一段上）】', ...canon, ''] : []),
        `【最近对话（旧 → 新，共 ${recent.length} 楼）】`,
        recent.length ? recent.join('\n') : '- （还没有对话）',
        '',
        '【玩家这一轮说】',
        text(draft) || '（玩家还没有输入）',
        '',
        '请判断这一轮有没有撞上埋着的因（有就写 hits，没有就留空），并挑几条明面上用得上的变化（picks），输出 JSON：{"note":"…","hits":[{"ref":"i7","why":"…","evidence":"原文原句","text":"…"}],"picks":[{"ref":"i3","text":"…"}]}。',
    ].join('\n');
    return { user, buriedIds: buriedPick.ids, buriedHidden: buriedPick.hidden, buriedTotal: buried.length };
}

/**
 * 解析判定结果：只认账本里真实存在、且还没收场的编号；重复编号只留第一条。
 * hits 在这里只做形状清洗，能不能成立由 judgeImpactHits 裁决。
 * 返回 { status: ok|empty|invalid, picks, hits, note, dropped, error? }。
 */
export function parseImpactSelect(raw, { records = [] } = {}) {
    let object;
    try {
        object = extractJson(raw);
    } catch (error) {
        return { status: 'invalid', picks: [], hits: [], note: '', dropped: 0, error: String(error?.message ?? error) };
    }
    if (!object || typeof object !== 'object' || Array.isArray(object)) {
        return { status: 'invalid', picks: [], hits: [], note: '', dropped: 0, error: '挑选结果不是 JSON 对象' };
    }
    const note = text(object.note).slice(0, MAX_NOTE_CHARS);
    const byId = new Map((Array.isArray(records) ? records : []).map(record => [record.id, record]));
    const list = Array.isArray(object.picks) ? object.picks : [];
    const seen = new Set();
    const picks = [];
    let dropped = 0;
    for (const item of list) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) { dropped += 1; continue; }
        const ref = text(item.ref).replace(/^#/, '');
        const body = text(item.text).slice(0, MAX_LINE_CHARS);
        const record = byId.get(ref);
        if (!ref || !body || !record || seen.has(ref)) { dropped += 1; continue; }
        if (record.state === 'closed' || record.state === 'reverted') { dropped += 1; continue; }
        seen.add(ref);
        if (picks.length >= MAX_PICKS) { dropped += 1; continue; }
        picks.push({ ref, text: body });
    }
    const rawHits = Array.isArray(object.hits) ? object.hits : [];
    const hits = rawHits
        .filter(item => item && typeof item === 'object' && !Array.isArray(item))
        .map(item => ({ ref: text(item.ref).replace(/^#/, ''), why: text(item.why), evidence: text(item.evidence), text: text(item.text) }))
        .filter(item => item.ref);
    const total = picks.length + hits.length;
    return { status: total || note ? 'ok' : 'empty', picks, hits, note, dropped };
}

/**
 * 把挑选结果拼成正文注入文本：抬头 + 每条一行，带 ★（世界级）/？（传闻）标记，
 * 埋着的因只在判定通过后才写“已经撞上”，超预算从尾部丢。
 */
export function buildImpactInjectionFromPicks(records = [], picks = [], { maxChars = Infinity, maxLines = Infinity, day = 1, hits = [] } = {}) {
    return buildImpactInjectionFromPicksDetail(records, picks, { maxChars, maxLines, day, hits }).text;
}

/**
 * 与 buildImpactInjectionFromPicks 同内容，但多给一份 usedIds：
 * 正文注入后要能回答“这一轮到底用了哪几条”，设置页才能标“本轮已注入”。
 * 字数/条数默认不限制（用户拍板的口径）：有限正数才截断，不填＝全量注入。
 * hits 是裁决通过的埋线显形，排在前面——那是这一轮真正的高光。
 */
export function buildImpactInjectionFromPicksDetail(records = [], picks = [], { maxChars = Infinity, maxLines = Infinity, day = 1, hits = [] } = {}) {
    const today = clampInt(day, 1, 99999, 1);
    const budget = Number.isFinite(Number(maxChars)) && Number(maxChars) > 0 ? Math.floor(Number(maxChars)) : Infinity;
    const limit = Number.isFinite(Number(maxLines)) && Number(maxLines) > 0 ? Math.floor(Number(maxLines)) : Infinity;
    const byId = new Map((Array.isArray(records) ? records : []).map(record => [record.id, record]));
    const entries = [];
    for (const hit of Array.isArray(hits) ? hits : []) {
        if (entries.length >= limit) break;
        const record = byId.get(text(hit?.ref).replace(/^#/, ''));
        const body = text(hit?.text) || text(hit?.why);
        if (!record || !body) continue;
        if (record.state !== 'sunk') continue;
        entries.push({ id: record.id, line: `· ${impactMark(record)}当年埋下的因，这一轮撞上了：${body}` });
    }
    for (const pick of Array.isArray(picks) ? picks : []) {
        if (entries.length >= limit) break;
        const record = byId.get(text(pick?.ref).replace(/^#/, ''));
        const body = text(pick?.text);
        if (!record || !body) continue;
        if (record.state === 'closed' || record.state === 'reverted' || record.state === 'sunk') continue;
        const ripened = record.state === 'ripened' ? '（已应验）' : '';
        entries.push({ id: record.id, line: `· ${impactMark(record)}${body}${ripened}` });
    }
    // 原著线当前态：被改过的原著走向是既定状态，判定官挑什么都要带着——不然了结过的偏移
    // 会从作者视野里消失，长局里不知不觉写回原著。不带编号：它不是"本轮注入了哪条影响"。
    const canon = canonLineSummary(records, { maxLines: 6 });
    for (let index = 0; index < canon.length; index += 1) {
        if (entries.length >= limit) break;
        if (index === 0) entries.push({ id: '', line: '· 原著线当前态（偏移是既定状态，正文顺着写，不许写回原著）：' });
        entries.push({ id: '', line: `  - ${canon[index]}` });
    }
    if (!entries.length) return { text: '', usedIds: [] };
    const kept = [];
    for (const entry of entries) {
        const next = [IMPACT_HEADER, ...kept.map(item => item.line), entry.line].join('\n');
        if (next.length > budget && kept.length) break;
        kept.push(entry);
    }
    void today;
    return { text: [IMPACT_HEADER, ...kept.map(item => item.line)].join('\n'), usedIds: kept.map(item => item.id).filter(Boolean) };
}
