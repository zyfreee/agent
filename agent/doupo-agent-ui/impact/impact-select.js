/**
 * 世界影响的“开场挑选”：LLM 决定、脚本把关。
 * 每一轮生成前，模型读"世界台账 + 世界线账本 + 玩家这一轮的话"，
 * 挑出这一幕真正用得上的影响，并改写成旁白式短句；脚本只收账本里真实存在、
 * 且还没收场的编号，按预算截断，写坏的部分整条丢弃。
 *
 * 与记录员（impact-decide.js）分工：
 * - 记录员在生成结束后记账（世界变成了什么样）；
 * - 挑选员在生成开始前选账（这一幕该让说书人知道哪几条）。
 */

import { buildWorldInjection } from '../world/world-ops.js';
import { buildImpactLedgerLines, IMPACT_HEADER, impactMark } from './impact-ops.js';
import { extractJson } from '../host/llm-client.js';

const MAX_PICKS = 8;
const MAX_LINE_CHARS = 120;
const MAX_NOTE_CHARS = 160;
const MAX_FLOORS = 8;
const FLOOR_CHARS = 400;
const DRAFT_CHARS = 600;

export const IMPACT_INJECT_PROMPT = [
    '你是《斗破苍穹》同人长篇的"场记"。你不上台、不写剧情，只做一件事：每一幕开场前，从《世界线账本》里挑出这一幕真正用得上的那几条世界变化，交给说书人。',
    '你挑的是"世界因为玩家变成什么样了"，不是剧情回顾，也不是建议剧情走向。只挑账本上已经记下的条目，用 #编号 指认；绝不新增、绝不改写事实、绝不推测账本没写的后果。',
    '',
    '【先判断这一幕是什么场面，再挑账】',
    '- 把【玩家这一轮说】和【最近对话】合起来看：玩家现在在哪儿、身边有谁、正要做什么、在跟谁较劲、在乎的是什么；',
    '- 再看【此刻的世界】：所在城市、时期、名声、通缉、最近发生的事；',
    '- 然后问自己：哪些已经发生过的世界变化，会在这个场面里被玩家撞上、被旁人提起、或直接影响接下来会发生什么？',
    '- 同一句话在不同场面要挑不同的账：在乌坦城街头和在沙漠深处，能撞上的旧账完全不同；玩家只是聊天感慨，就别搬远处的旧账进来。',
    '',
    '【挑选顺序，从上往下看】',
    '1. 与玩家这一轮要去的地方、要找的人、要碰的势力直接相关的；',
    '2. 与玩家这句话里提到的人、物、地点、事件直接相关的；',
    '3. 正在发酵或刚刚发酵、这一幕应该被世人看见的；',
    '4. 原著主线节点被牵动的（退婚、药老、云岚宗、沙漠、宗门之战……），且这一幕正好压在节点上；',
    '5. 虽然还没到期，但说书人若不知道就会写错的"尚未发作"安排——最多挑一条作提醒。',
    '',
    '【不要挑】',
    '- 已了结、已修复的（账本状态写着"已了结/已修复"）；',
    '- 与这一幕毫无关系的远处旧账；',
    '- 玩家根本没接触过的势力内部的小事；',
    '- 纯气氛描写、重复的同一件事；同一件事不要拆成两条。',
    '宁可少挑，不要凑数；一条都用不上就交空清单。',
    '',
    '【账本怎么读】',
    '每行大致是：编号｜第几天｜分量｜状态｜性质｜标题：详情｜对象｜依据｜原著偏移｜源自哪条｜发酵安排｜后续；行尾还可能带“手动登记”“已修改（第 N 天）”“关联事件 eX”。',
    '状态：未了结＝还没应验；已发酵＝世人已经看见；已了结/已修复＝不要再挑。没到期的安排会在【还没发作的安排】里单列，最多挑一条作提醒。',
    '清单只列最近 30 行：没列出来的账不要硬找，更不要引用不存在的编号；“已发酵”的标记由脚本自动加，你写 text 时不用自己补。',
    '',
    '【编号怎么引】',
    '编号原样抄账本里的（写 i3 或 #i3 都行），不许自己编号，不许引用账本里没有的编号；同一条编号只出现一次。',
    '账本行尾标着“已修改”的条目，以改后的文字为准；标着“手动登记”的也照样算数。',
    '',
    '【每条 text 怎么写】',
    '- 一句话，≤80 字，像说书人顺口交代的环境事实，不是账本摘抄；',
    '- 不要编号、不要"依据/记录/影响/账本/模型"这类词；',
    '- 用世界里的说法：地方、家族、宗门、物价、风向、传言、戒严、人手调动；',
    '- 传闻只能写成"都说/坊间传/有人讲"，不能写成已证实；',
    '- 不写玩家心理、不替玩家做决定、不写角色对话、不推进剧情；',
    '- 已经发生的用"已经/如今/这几天"，没到期的用"再过几天/还没到时候"。',
    '',
    '另外写一句 note（≤120 字）：为什么挑这几条、为什么放过别的。note 只给设置页看，不进正文。',
    '只输出 JSON：{"note":"…","picks":[{"ref":"i3","text":"…"}]}。',
].join('\n');

/** 给酒馆结构化输出用的约束；解析端不依赖它，只用来提高严格度。 */
export const IMPACT_INJECT_SCHEMA = Object.freeze({
    type: 'object',
    properties: {
        note: { type: 'string' },
        picks: {
            type: 'array',
            maxItems: MAX_PICKS,
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
    required: ['picks'],
});

function clampInt(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isInteger(num) || num < min || num > max) return fallback;
    return num;
}

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

/** 组装挑选员的 user 内容：世界此刻 + 账本 + 最近对话 + 玩家这一轮的话。 */
export function buildImpactInjectUser({ snapshot = {}, records = [], floors = [], draft = '', day = 1 } = {}) {
    const today = clampInt(day, 1, 99999, 1);
    const worldBlock = buildWorldInjection(snapshot, { maxChars: 600 });
    const ledgerRecords = Array.isArray(records) ? records : [];
    const ledger = buildImpactLedgerLines(ledgerRecords, { day: today, maxChars: 1800, maxLines: 30 });
    const counts = {
        active: ledgerRecords.filter(record => record.state === 'active').length,
        ripened: ledgerRecords.filter(record => record.state === 'ripened').length,
        closed: ledgerRecords.filter(record => record.state === 'closed' || record.state === 'reverted').length,
    };
    const pending = ledgerRecords.filter(record => record.state === 'active' && record.ripenDay !== null && record.ripenDay > today);
    const recent = (Array.isArray(floors) ? floors : [])
        .slice(-MAX_FLOORS)
        .map(floor => {
            const role = floor?.role === '玩家' ? '玩家' : '角色';
            const body = text(floor?.text).slice(0, FLOOR_CHARS);
            return body ? `[${role}] ${body}` : null;
        })
        .filter(Boolean);
    return [
        '【此刻的世界（既定状态）】',
        worldBlock,
        '',
        `【世界线账本（只能从这些编号里挑；共 ${ledgerRecords.length} 条：未了结 ${counts.active}、已发酵 ${counts.ripened}、已收场 ${counts.closed}）】`,
        ledger.length ? ledger.map(line => `- ${line}`).join('\n') : '- （账本还是空的，这局世界尚未被玩家改动）',
        '',
        '【还没发作的安排（只能提醒，不能写成已经发生）】',
        pending.length
            ? pending.map(record => `- #${record.id}｜第 ${record.ripenDay} 天才会发作｜${record.title}`).join('\n')
            : '- （没有等待发作的事）',
        '',
        `【最近对话（旧 → 新，共 ${recent.length} 楼）】`,
        recent.length ? recent.join('\n') : '- （还没有对话）',
        '',
        '【玩家这一轮说】',
        text(draft).slice(0, DRAFT_CHARS) || '（玩家还没有输入）',
        '',
        '请只从账本里挑这一幕用得上的影响，改写成一两句旁白，输出 JSON：{"note":"…","picks":[{"ref":"i3","text":"…"}]}。一条都用不上就输出 {"note":"这一轮用不上旧账","picks":[]}。',
    ].join('\n');
}

/**
 * 解析挑选结果：只认账本里真实存在、且还没收场的编号；重复编号只留第一条。
 * 返回 { status: ok|empty|invalid, picks: [{ref,text}], note, dropped, error? }。
 */
export function parseImpactSelect(raw, { records = [] } = {}) {
    let object;
    try {
        object = extractJson(raw);
    } catch (error) {
        return { status: 'invalid', picks: [], note: '', dropped: 0, error: String(error?.message ?? error) };
    }
    if (!object || typeof object !== 'object' || Array.isArray(object)) {
        return { status: 'invalid', picks: [], note: '', dropped: 0, error: '挑选结果不是 JSON 对象' };
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
        picks.push({ ref, text: body });
        if (picks.length >= MAX_PICKS) break;
    }
    return { status: picks.length ? 'ok' : 'empty', picks, note, dropped };
}

/**
 * 把挑选结果拼成正文注入文本：抬头 + 每条一行，带 ★（世界级）/？（传闻）标记，
 * 未到发酵日的写成“还没发作”，超预算从尾部丢。
 */
export function buildImpactInjectionFromPicks(records = [], picks = [], { maxChars = 800, maxLines = MAX_PICKS, day = 1 } = {}) {
    return buildImpactInjectionFromPicksDetail(records, picks, { maxChars, maxLines, day }).text;
}

/**
 * 与 buildImpactInjectionFromPicks 同内容，但多给一份 usedIds：
 * 正文注入后要能回答“这一轮到底用了哪几条”，设置页才能标“本轮已注入”。
 */
export function buildImpactInjectionFromPicksDetail(records = [], picks = [], { maxChars = 800, maxLines = MAX_PICKS, day = 1 } = {}) {
    const today = clampInt(day, 1, 99999, 1);
    const budget = clampInt(maxChars, 60, 4000, 800);
    const limit = clampInt(maxLines, 1, 20, MAX_PICKS);
    const byId = new Map((Array.isArray(records) ? records : []).map(record => [record.id, record]));
    const entries = [];
    for (const pick of Array.isArray(picks) ? picks : []) {
        if (entries.length >= limit) break;
        const record = byId.get(text(pick?.ref).replace(/^#/, ''));
        const body = text(pick?.text);
        if (!record || !body) continue;
        if (record.state === 'closed' || record.state === 'reverted') continue;
        const pending = record.state === 'active' && record.ripenDay !== null && record.ripenDay > today;
        const ripened = record.state === 'ripened' ? '（已发酵）' : '';
        entries.push({
            id: record.id,
            line: pending
                ? `· ${impactMark(record)}还没发作（第 ${record.ripenDay} 天）：${body}`
                : `· ${impactMark(record)}${body}${ripened}`,
        });
    }
    if (!entries.length) return { text: '', usedIds: [] };
    const kept = [];
    for (const entry of entries) {
        const next = [IMPACT_HEADER, ...kept.map(item => item.line), entry.line].join('\n');
        if (next.length > budget && kept.length) break;
        kept.push(entry);
    }
    return { text: [IMPACT_HEADER, ...kept.map(item => item.line)].join('\n'), usedIds: kept.map(item => item.id) };
}

export const IMPACT_SELECT_LIMITS = Object.freeze({ maxPicks: MAX_PICKS, maxLineChars: MAX_LINE_CHARS, maxNoteChars: MAX_NOTE_CHARS });
