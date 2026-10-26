/**
 * 世界指令通道：把世界状态拼成给模型看的注入文本，并从模型回复里
 * 取出 ```world 代码块解析成受控操作。
 *
 * 约定：模型每轮最多输出一个代码块，块内每行一条 JSON 操作；
 * 脚本逐行解析，坏行跳过并记录，好行交给 world-runtime 校验执行。
 */

import { formatClock } from './world-runtime.js';

const NEAR_LIMIT = 8;
const WORLD_LIMIT = 6;
const DEFAULT_MAX_CHARS = 900;
const DEFAULT_MAX_OPS = 8;
const FENCE_RE = /```world[^\S\n]*\n([\s\S]*?)```/g;
const OP_LINE_RE = /^[ \t]*\{[ \t]*"op"[ \t]*:/;

export const WORLD_HEADER = '【世界现状】以下是世界此刻的既定状态，正文必须与之保持一致；改变它只能靠文末 world 指令。';

export const OPS_GUIDE = [
    '【世界指令通道】若本轮剧情让世界发生了需要记下的变化（时间流逝、身边出现事件、世界大势变化、事件了结、天气/地点/时期更新），在回复的最末尾输出一个 world 代码块，每行一条 JSON：',
    '```world',
    '{"op":"advance","minutes":30}',
    '{"op":"addEvent","scope":"near","text":"城东连着三家铺子夜里失窃","basis":"最近几楼提到的失窃传闻，主角今早又看见巡卫盘查"}',
    '{"op":"addEvent","scope":"world","text":"皇室宣布炼药师大会提前","basis":"上楼贵族宾客的谈话里放出风声","day":6,"weight":"major","days":10}',
    '```',
    '可用操作：advance(days≤365,minutes≤1439)；setClock(day,minute,label)；addEvent(scope:near|world,text≤120字,basis≤80字,day,weight:minor|major,days=有效天数≤90，到期自动了结)；resolveEvent(id)；pinEvent(id)；setInfo(field:weather|location|era,text≤80字)。id 用上面事件列表里的编号。',
    '事件取材规则：事件从最近剧情里有依据地长出来——正在发生的事、玩家行动引出的动静、所在地点此时合理的动态，内容不拘一格（市井琐事、势力动作、传闻都行），但 basis 必须一句话写清它从哪来（哪楼/谁/什么事引出的）；没有依据的事不记，也不要把原著桥段照搬成事件，原著只在正文需要引用时用。有时限的事（限期比武、悬赏、药效、期限任务）务必带上 days，注入列表会显示剩余天数，正文里的时间压力要和它对得上。',
    '没有需要记下的变化就完全不要输出这个区块；正文照常写给玩家看，指令只是记账。',
].join('\n');

function clampInt(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isInteger(num) || num < min || num > max) return fallback;
    return num;
}

function intIn(value, min, max) {
    const num = Number(value);
    return Number.isInteger(num) && num >= min && num <= max ? num : null;
}

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function eventLine(event, today) {
    const mark = event.weight === 'major' ? '★' : '·';
    const pinned = event.pinned ? ' [置顶]' : '';
    const basis = text(event.basis) ? `（依据：${text(event.basis)}）` : '';
    let due = '';
    if (event.endDay !== null && event.endDay !== undefined && event.done !== true) {
        const todayNum = Number.isInteger(today) ? today : 1;
        const left = event.endDay - todayNum + 1;
        due = left > 0 ? `（剩 ${left} 天）` : '（今日到期）';
    }
    return `${mark}(${event.id} 第${event.day}天) ${event.text}${due}${basis}${pinned}`;
}

/** 世界快照 → 注入文本；超预算时优先保住时钟，事件从末尾往上丢。 */
export function buildWorldInjection(snapshot = {}, { maxChars = DEFAULT_MAX_CHARS } = {}) {
    const cap = clampInt(maxChars, 200, 4000, DEFAULT_MAX_CHARS);
    const clock = snapshot.clock ?? {};
    const info = snapshot.info ?? {};
    const lines = [];
    lines.push(`时钟：${formatClock(clock)}${textOr(clock.label, c => `（${c}）`)}`);
    const infoParts = [];
    for (const [field, label] of [['era', '时期'], ['location', '所在地'], ['weather', '天气']]) {
        if (text(info[field])) infoParts.push(`${label}：${info[field]}`);
    }
    if (infoParts.length) lines.push(`现状：${infoParts.join('；')}`);
    const near = (Array.isArray(snapshot.nearEvents) ? snapshot.nearEvents : []).filter(event => event?.done !== true).slice(-NEAR_LIMIT);
    const world = (Array.isArray(snapshot.worldEvents) ? snapshot.worldEvents : []).filter(event => event?.done !== true).slice(-WORLD_LIMIT);
    const today = intIn(clock.day, 1, 99999);
    if (near.length) lines.push(`身边事件（未了结，可被剧情推进或 resolveEvent）：\n${near.map(event => eventLine(event, today)).join('\n')}`);
    if (world.length) lines.push(`世界大事（未了结）：\n${world.map(event => eventLine(event, today)).join('\n')}`);
    let textOut = lines.join('\n');
    while (textOut.length > cap && lines.length > 1) {
        lines.pop();
        textOut = lines.join('\n');
    }
    return textOut;
}

function textOr(value, render) {
    const body = typeof value === 'string' ? value.trim() : '';
    return body ? render(body) : '';
}

/** 从回复里找 world 指令块；找不到 fenced 块时容忍裸行（部分模型不吃代码块语法）。 */
export function extractOpsBlock(reply) {
    const source = typeof reply === 'string' ? reply : '';
    if (!source) return null;
    const fenced = [...source.matchAll(FENCE_RE)];
    if (fenced.length) {
        const body = fenced.at(-1)[1];
        return { raw: body, fenced: true, count: fenced.length };
    }
    const lines = source.split('\n');
    let best = [];
    let current = [];
    for (const line of lines) {
        if (OP_LINE_RE.test(line)) { current.push(line.trim()); continue; }
        if (current.length > best.length) best = current;
        current = [];
    }
    if (current.length > best.length) best = current;
    return best.length ? { raw: best.join('\n'), fenced: false, count: 1 } : null;
}

/** 逐行解析指令块：好行进 ops，坏行进 parseErrors，不因一行坏账整块作废。 */
export function parseOps(raw, { maxOps = DEFAULT_MAX_OPS } = {}) {
    const cap = clampInt(maxOps, 1, 32, DEFAULT_MAX_OPS);
    const lines = typeof raw === 'string' ? raw.split('\n') : [];
    const ops = [];
    const parseErrors = [];
    lines.forEach((line, index) => {
        const body = line.trim();
        if (!body || body.startsWith('```')) return;
        try {
            const parsed = JSON.parse(body);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.op === 'string' && parsed.op.trim()) {
                if (ops.length < cap) ops.push(parsed);
            } else {
                parseErrors.push({ line: index + 1, reason: 'not_an_op' });
            }
        } catch (error) {
            parseErrors.push({ line: index + 1, reason: String(error?.message ?? error) });
        }
    });
    return { ops, parseErrors };
}

/** 把指令块从楼层正文里剥掉，玩家只看到干净的剧情。 */
export function stripOpsBlock(reply) {
    const source = typeof reply === 'string' ? reply : '';
    if (!source) return source;
    let cleaned = source.replace(FENCE_RE, '').replace(/\n{3,}/g, '\n\n');
    const kept = [];
    for (const line of cleaned.split('\n')) {
        if (OP_LINE_RE.test(line)) continue;
        kept.push(line);
    }
    cleaned = kept.join('\n').replace(/[ \t]+$/u, '').replace(/\n{3,}/g, '\n\n');
    return cleaned.trim() === '' ? source : cleaned.trimEnd();
}
