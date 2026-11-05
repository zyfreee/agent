/**
 * 记忆召回决定：注入哪些记忆由 LLM 挑选，脚本执行注入。
 * 用户输入之后、生成之前，把「记忆目录（编号|层|标题|钥匙）+ 最近聊天（含最新玩家输入）
 * + 命中的世界书条目」交给召回模型，回一批编号；脚本按编号取条目渲染注入，坏号跳过。
 * 召回决定没跑/失败/关着时，由调用方退回关键词兜底（memory-ops.recallHits）。
 *
 * 与 world/self/memory 决定同款约定：只输出一个 JSON；脚本解析坏值丢弃，绝不抛异常。
 */

import { extractJson } from '../host/llm-client.js';
import { recallKeys } from './memory-ops.js';
import { TIER_LABELS } from './memory-runtime.js';

const MAX_IDS = 25;
const MAX_NOTE_CHARS = 300;
const MAX_FLOORS = 12;
const FLOOR_CHARS = 800;
const MAX_BOOK_LINES = 40;
const DEFAULT_CATALOG_CHARS = 4000;

/** 默认召回提示词（system）。改写时保持"只输出 JSON"与 ids 字段名不变，否则脚本解析不到。 */
export const MEMORY_RECALL_PROMPT = [
    '你是这部小说的「记忆召回员」。每次调用你会拿到一份记忆目录、命中的世界书条目和最近聊天；你只做一件事：判断"这一轮正文需要哪些旧账压场"，从目录里挑出该召回的记忆编号，输出能被脚本严格执行的 JSON。',
    '先想清楚你的决定意味着什么：你挑出的每条记忆都会以「正文不得与之矛盾」的方式进入提示词，成为正文模型的硬约束。所以召回的唯一标准是——忘了它，这一轮就会写出矛盾，或错过该回收的时机；而不是"这条好像有点关系"。',
    '只输出一个 JSON 对象：{"note":"一句话说明为什么挑这些","ids":["m12",…]}。不要输出解释、标题或代码块以外的文字。',
    '【读目录】目录里每行是 编号|层|标题（召回钥匙）："大记忆"是长期事实（恩怨/秘密/伏笔/大事），"小记忆"是近一两天的事；括号里的钥匙是人名/地名/物名，用来和本轮登场的人事物对号。只准从目录里挑编号；没在目录里的记忆不存在，绝不编造编号。',
    '【怎么挑】按顺序过三步，别跳：',
    '1. 找钩子：读最近聊天（尤其最后一楼玩家的新输入），列出这一轮正文会出现谁、去哪里、动什么物件，有没有提旧账、旧约、承诺、期限、伏笔。',
    '2. 对钥匙：只有能和钩子对上号的记忆才进候选——人再登场对人的旧账，地重访对地发生过的事，物件再现对它的来历与下落。',
    '3. 逐条自问："如果这条不进提示词，这一轮会不会写矛盾——认错人、用错称谓态度、忘了谁欠谁、重演已经变化的事、错过该回收的伏笔？"不会就丢掉。',
    '【不要召回】内容已在最近聊天里重新演过或明说过的（再注入是重复）；只是同地点/同时间但剧情无关的；纯氛围陪衬、漏了也不影响本轮任何一句话的；同一件事分几条记忆时只取最新的那条（旧阶段已被覆盖）。',
    '【优先带上】双方再登场的恩怨与立场；主角拿到的资源、得到的承诺与期限；埋了还没回收的伏笔；别人对主角的关键态度与禁忌（如"别亮出纳戒"这类一旦忘掉就穿帮的约束）。',
    '数量纪律：最多 25 条，按与本轮剧情的相关度从高到低排；宁缺毋滥，无关的不要凑数——但恩怨与伏笔宁可多带一条，别让主角忘了谁欠谁、埋了什么。目录里挑不出相关的，就输出 {"note":"本轮没有需要召回的旧记忆","ids":[]}。',
    '只输出 JSON。',
].join('\n');

/** 给酒馆 generateQuietPrompt 的结构化输出约束；解析端并不依赖它，只是提高严格度。 */
export const RECALL_JSON_SCHEMA = Object.freeze({
    type: 'object',
    properties: {
        note: { type: 'string' },
        ids: { type: 'array', items: { type: 'string' } },
    },
    required: ['ids'],
});

/**
 * 记忆目录：完整小目录仍按大→小/新→旧；超预算先场景命中，再在各组交替两层。
 * 标题缺了拿 text 顶；只截描述，不截编号，每层至少留一行的空间。
 */
export function buildRecallCatalog(snapshot = {}, { maxChars = DEFAULT_CATALOG_CHARS, sceneText = '' } = {}) {
    const entries = (Array.isArray(snapshot?.entries) ? snapshot.entries : []).filter(Boolean);
    if (!entries.length) return '（记忆库还是空的）';
    const value = Number(maxChars);
    const cap = Number.isSafeInteger(value) && value > 0 ? Math.max(200, value) : DEFAULT_CATALOG_CHARS;
    const big = entries.filter(entry => entry.tier === 'big').sort((a, b) => b.day - a.day);
    const small = entries.filter(entry => entry.tier !== 'big').sort((a, b) => b.day - a.day);
    const lineCap = big.length && small.length ? Math.floor((cap - 1) / 2) : cap;
    const scene = typeof sceneText === 'string' ? sceneText : '';
    const records = [...big, ...small].flatMap(entry => {
        const tier = TIER_LABELS[entry.tier] ?? '记忆';
        const keys = recallKeys(entry);
        const prefix = `- ${entry.id}|${tier}|`;
        if (/[\r\n]/.test(prefix) || prefix.length >= lineCap) return [];
        const label = `${entry.title || entry.text || ''}${keys.length ? `（${keys.join('、')}）` : ''}`.replace(/[\r\n]+/g, ' ');
        const room = lineCap - prefix.length;
        const line = prefix + (label.length > room ? `${label.slice(0, room - 1)}…` : label);
        return [{ line, big: entry.tier === 'big', hit: !!scene && keys.some(key => scene.includes(key)) }];
    });
    const complete = records.map(record => record.line).join('\n');
    if (complete.length <= cap) return complete;
    const ordered = [];
    for (const hit of [true, false]) {
        const large = records.filter(record => record.hit === hit && record.big);
        const little = records.filter(record => record.hit === hit && !record.big);
        for (let i = 0; i < Math.max(large.length, little.length); i++) {
            if (large[i]) ordered.push(large[i]);
            if (little[i]) ordered.push(little[i]);
        }
    }
    const kept = [];
    let used = 0;
    for (const { line } of ordered) {
        const cost = line.length + (kept.length ? 1 : 0);
        if (used + cost > cap) continue;
        kept.push(line);
        used += cost;
    }
    return kept.join('\n');
}

/** 组装发给召回模型的 user 内容：记忆目录 + 最近聊天（旧→新，含最新玩家输入）+ 世界书命中。 */
export function buildRecallUser({ snapshot = {}, floors = [], worldbookLines = [] } = {}) {
    const bookLines = (Array.isArray(worldbookLines) ? worldbookLines : [])
        .filter(line => typeof line === 'string' && line.trim())
        .slice(0, MAX_BOOK_LINES);
    const chat = (Array.isArray(floors) ? floors : [])
        .slice(-MAX_FLOORS)
        .map(floor => {
            const role = floor?.role === '玩家' ? '玩家' : '角色';
            const body = typeof floor?.text === 'string' ? floor.text.trim().slice(0, FLOOR_CHARS) : '';
            return body ? `[${role}] ${body}` : null;
        })
        .filter(Boolean);
    return [
        '【记忆目录（编号|层|标题（钥匙））】',
        buildRecallCatalog(snapshot, { sceneText: chat.join('\n') }),
        '',
        `【命中的世界书条目（共 ${bookLines.length} 条）】`,
        bookLines.length ? bookLines.map(line => `- ${line}`).join('\n') : '- （本轮没有命中的世界书条目）',
        '',
        `【最近聊天记录（旧 → 新，共 ${chat.length} 楼；最后一楼是玩家刚发的新输入）】`,
        chat.length ? chat.join('\n') : '- （还没有聊天内容）',
        '',
        '请按"忘了会写矛盾才召回"的标准过一遍三步筛选，从记忆目录里挑出这一轮要压场的旧记忆（ids），只输出 JSON：{"note":"…","ids":[…]}。',
    ].join('\n');
}

/** 把召回结果对到现有条目上：账里没有的编号丢弃（防模型编号）、重复编号只取一次，顺序保持模型给的相关度序。 */
export function recallEntriesFromIds(snapshot = {}, ids = []) {
    const entries = Array.isArray(snapshot?.entries) ? snapshot.entries : [];
    const byId = new Map(entries.map(entry => [entry.id, entry]));
    const seen = new Set();
    const picked = [];
    for (const id of Array.isArray(ids) ? ids : []) {
        const key = typeof id === 'string' ? id.trim() : '';
        if (!key || seen.has(key)) continue;
        const entry = byId.get(key);
        if (!entry) continue;
        seen.add(key);
        picked.push(entry);
    }
    return picked;
}

/** 解析召回决定：坏 JSON/非对象 → invalid；ids 只留字符串、去重、超量截断。 */
export function parseRecallDecision(raw, { maxIds = MAX_IDS, snapshot } = {}) {
    let object;
    try {
        object = extractJson(raw);
    } catch (error) {
        return { status: 'invalid', ids: [], note: '', dropped: 0, error: String(error?.message ?? error) };
    }
    if (!object || typeof object !== 'object' || Array.isArray(object)) {
        return { status: 'invalid', ids: [], note: '', dropped: 0, error: '召回结果不是 JSON 对象' };
    }
    const note = typeof object.note === 'string' ? object.note.trim().slice(0, MAX_NOTE_CHARS) : '';
    if (!Array.isArray(object.ids)) return { status: 'invalid', ids: [], note, dropped: 0, error: '召回结果缺少 ids 数组' };
    const cap = Number.isInteger(maxIds) && maxIds >= 1 && maxIds <= MAX_IDS ? maxIds : MAX_IDS;
    const known = snapshot === undefined ? null : new Set((Array.isArray(snapshot?.entries) ? snapshot.entries : []).map(entry => entry?.id));
    const seen = new Set();
    const ids = [];
    let dropped = 0;
    for (const item of object.ids) {
        const id = typeof item === 'string' ? item.trim() : '';
        if (!id || seen.has(id) || ids.length >= cap || (known && !known.has(id))) { dropped += 1; continue; }
        seen.add(id);
        ids.push(id);
    }
    if (!ids.length && object.ids.length) return { status: 'invalid', ids, note, dropped, error: '召回编号全部无效' };
    return { status: ids.length ? 'ok' : 'empty', ids, note, dropped };
}
