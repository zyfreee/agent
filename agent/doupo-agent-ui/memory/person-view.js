/** 按人整合视图（MemPalace Wings/Tunnels 的模拟）：把散在三本账里的同一人
 *  ——记忆（related/aliases 钥匙）、人物簿（档案/好感流水/经历/流水）、世界台账（事件/任务）
 *  ——聚合成一条按世界天排列的时间线。纯函数、零 DOM、确定性，任何输入失败都降级为空视图。
 *  命中判定沿用 npc-cold-runtime 的思路：人名（含别名/称号）对事件正文做包含匹配；
 *  记忆钥匙对档案名做双向包含（"蛇哥"也能接上"蛇人穆蛇"）。 */

import { recallKeys } from './memory-retrieve.js';
import { favorLabel } from '../npc/npc-ledger.js';

/** 时间线来源种类：固定展示序（同类按天排，跨类按这个 rank 稳定）。 */
export const PERSON_VIEW_KINDS = Object.freeze({
    event: '事件',
    task: '任务',
    favor: '好感',
    memory: '记忆',
    exp: '经历',
    log: '流水',
});

const KIND_RANK = Object.freeze(Object.fromEntries(Object.keys(PERSON_VIEW_KINDS).map((kind, index) => [kind, index])));

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function intOr(value, fallback = 0) {
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : fallback;
}

/** 一个人物档案的全部识别名：本名 + 别名 + 称号，去重去空。 */
export function personNames(record) {
    const names = new Set();
    for (const value of [record?.name, ...(Array.isArray(record?.aliases) ? record.aliases : []), ...(Array.isArray(record?.titles) ? record.titles : [])]) {
        const name = text(value);
        if (name) names.add(name);
    }
    return [...names];
}

/** 记忆钥匙 ↔ 档案名：全等永远算命中；否则两边都 ≥2 字才做双向包含，单字名不做模糊。 */
function namesConnect(key, name) {
    const a = key.toLowerCase();
    const b = name.toLowerCase();
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length < 2 || b.length < 2) return false;
    return a.includes(b) || b.includes(a);
}

function entryTouches(entry, names) {
    if (!names.length) return false;
    return recallKeys(entry).some(key => names.some(name => namesConnect(key, name)));
}

function eventTouches(event, names) {
    const body = `${text(event?.title)}；${text(event?.text)}；${text(event?.basis)}`.toLowerCase();
    if (!body) return false;
    return names.some(name => body.includes(name.toLowerCase()));
}

function taskTouches(task, names) {
    const body = `${text(task?.title)}；${text(task?.detail)}`.toLowerCase();
    if (!body) return false;
    return names.some(name => body.includes(name.toLowerCase()));
}

/** 档案摘要一行：身份 · 境界 · 好感 · 态度 · 在场。没有档案（按钥匙兜底）返回空。 */
export function personSummary(record) {
    if (!record) return '';
    const favor = Math.max(-100, Math.min(100, intOr(record.favor, 0)));
    const parts = [
        text(record.identity),
        text(record.realm),
        record.favor !== undefined && record.favor !== null ? `好感 ${favor}（${favorLabel(favor)}）` : '',
        text(record.attitude) ? `态度：${text(record.attitude)}` : '',
        text(record.presence),
    ].filter(Boolean);
    return parts.join(' · ');
}

function memoryItem(entry) {
    const head = text(entry?.title) || text(entry?.text);
    if (!head) return null;
    const covered = text(entry?.supersededBy);
    return {
        day: intOr(entry?.day, 0),
        kind: 'memory',
        text: covered ? `${head}（已替代→${covered}）` : head,
        meta: text(entry?.id),
    };
}

function favorItem(record) {
    const log = Array.isArray(record?.favorLog) ? record.favorLog : [];
    return log.map(item => {
        const delta = intOr(item?.delta, 0);
        const reason = text(item?.reason);
        return {
            day: intOr(item?.day, 0),
            kind: 'favor',
            text: `好感 ${delta > 0 ? '+' : ''}${delta}${reason ? `（${reason}）` : ''}`,
            meta: intOr(item?.floor, 0) ? `第 ${intOr(item.floor)} 楼` : '',
        };
    });
}

function expItem(record) {
    const exp = Array.isArray(record?.exp) ? record.exp : [];
    return exp.map(item => text(item?.text) ? { day: intOr(item?.day, 0), kind: 'exp', text: text(item.text), meta: '' } : null).filter(Boolean);
}

function logItem(record) {
    const log = Array.isArray(record?.log) ? record.log : [];
    return log.map(item => text(item?.text) ? { day: intOr(item?.day, 0), kind: 'log', text: text(item.text), meta: '' } : null).filter(Boolean);
}

function eventItem(worldSnapshot, names) {
    const events = [...(Array.isArray(worldSnapshot?.nearEvents) ? worldSnapshot.nearEvents : []), ...(Array.isArray(worldSnapshot?.worldEvents) ? worldSnapshot.worldEvents : [])];
    return events.filter(event => eventTouches(event, names)).map(event => {
        const done = event.done === true || event.resolvedDay !== null && event.resolvedDay !== undefined;
        const weight = event.weight === 'major' ? '★ ' : (event.weight === 'rumor' ? '传闻：' : '');
        return {
            day: intOr(event?.day, 0),
            kind: 'event',
            text: `${weight}${text(event?.title) || text(event?.text)}${done ? '（已了结）' : ''}`,
            meta: text(event?.id),
        };
    });
}

function taskItem(worldSnapshot, names) {
    const tasks = Array.isArray(worldSnapshot?.tasks) ? worldSnapshot.tasks : [];
    return tasks.filter(task => taskTouches(task, names)).map(task => ({
        day: intOr(task?.day, 0),
        kind: 'task',
        text: `${text(task?.title)}${task.status === 'done' ? '（已完结）' : '（进行中）'}`,
        meta: text(task?.id),
    }));
}

/** 聚合一个人的全部叙事：record 可为 null（此时用 fallbackName 只匹配记忆钥匙）。
 *  timeline 按 day 降序、kind 固定序、文本稳定序排列；limit 截断后仍返回截断前的 counts。 */
export function buildPersonView({ record = null, fallbackName = '', entries = [], worldSnapshot = null, limit = 60 } = {}) {
    const names = record ? personNames(record) : (text(fallbackName) ? [text(fallbackName)] : []);
    const items = [
        ...(Array.isArray(entries) ? entries : []).filter(entry => entryTouches(entry, names)).map(memoryItem).filter(Boolean),
        ...(record ? favorItem(record) : []),
        ...(record ? expItem(record) : []),
        ...(record ? logItem(record) : []),
        ...(names.length ? eventItem(worldSnapshot, names) : []),
        ...(names.length ? taskItem(worldSnapshot, names) : []),
    ];
    const counts = {};
    for (const kind of Object.keys(PERSON_VIEW_KINDS)) counts[kind] = 0;
    for (const item of items) counts[item.kind] += 1;
    items.sort((a, b) => b.day - a.day || KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.text.localeCompare(b.text, 'zh'));
    return {
        names,
        summary: personSummary(record),
        counts,
        total: items.length,
        timeline: items.slice(0, Math.max(1, intOr(limit, 60))),
    };
}
