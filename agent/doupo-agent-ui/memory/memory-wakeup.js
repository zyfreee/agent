/** 开局摘要（MemPalace wake-up 的模拟）：切换/载入聊天后的第一条回复前，
 *  把散在各账本里的"此刻状态"整合成一次性的交底——时间·地点·在场人物·待办任务·
 *  未了线头·旧账恩怨。纯函数、零 DOM、确定性；空库空账返回空串（不注入）。
 *  各段内容与世界/人物簿/记忆三路的常驻注入有意重叠：开局那一刻它们还没热起来，
 *  这段摘要是唯一交底；写完即被清掉，不占后续轮次。 */

import { seasonOf } from '../world/world-ops.js';

export const WAKEUP_HEADER = '【开局摘要】本聊天刚被载入，续写前先交底：下面的时间、在场人物、待办任务与旧账都是既定状态，正文必须与之保持一致。';

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function intOr(value, fallback = 0) {
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : fallback;
}

function entryHead(entry) {
    return text(entry?.title) || text(entry?.text);
}

/** 摘要正文：各段空则整段省略；全空返回 ''（调用方不注入）。整体按 maxChars 从尾部截断。 */
export function buildWakeUpSummary({ worldSnapshot = {}, memorySnapshot = {}, npcRecords = [], maxChars = 500 } = {}) {
    const lines = [];
    // 时间：世界台账的时钟 + 季节（纯推导）+ 所在地/天气。
    const day = intOr(worldSnapshot?.clock?.day, 0);
    if (day > 0) {
        const where = text(worldSnapshot?.info?.location);
        const weather = text(worldSnapshot?.info?.weather);
        lines.push(`时间：第 ${day} 天·${seasonOf(day)}季${where ? `·${where}` : ''}${weather ? `（${weather}）` : ''}`);
    }
    // 在场人物：人物簿在场记录，重要的带 ★ 垒到前面；最多 6 个名字，只报名不展开档案。
    const present = (Array.isArray(npcRecords) ? npcRecords : [])
        .filter(record => text(record?.name) && text(record?.presence) === '在场')
        .sort((a, b) => (b?.importance === '重要') - (a?.importance === '重要') || intOr(b?.lastFloor, 0) - intOr(a?.lastFloor, 0))
        .slice(0, 6)
        .map(record => `${text(record.name)}${record.importance === '重要' ? '★' : ''}`);
    if (present.length) lines.push(`在场人物：${present.join('、')}`);
    // 待办任务：只取进行中的，最多 3 条。
    const tasks = (Array.isArray(worldSnapshot?.tasks) ? worldSnapshot.tasks : [])
        .filter(task => task?.status === 'active' && text(task?.title))
        .slice(0, 3);
    if (tasks.length) lines.push(`待办任务：${tasks.map(task => `${text(task.title)}（第 ${intOr(task.day)} 天接）`).join('、')}`);
    // 记忆线头与恩怨：未覆盖的伏笔/恩怨标签条目，新的在前，各最多 3 条。
    const open = (Array.isArray(memorySnapshot?.entries) ? memorySnapshot.entries : []).filter(entry => entry && !text(entry.supersededBy));
    const byTag = tag => open
        .filter(entry => entry.tag === tag && entryHead(entry))
        .sort((a, b) => intOr(b?.day, 0) - intOr(a?.day, 0))
        .slice(0, 3)
        .map(entryHead);
    const threads = byTag('thread');
    if (threads.length) lines.push(`未了线头：${threads.join('、')}`);
    const grudges = byTag('grudge');
    if (grudges.length) lines.push(`旧账恩怨：${grudges.join('、')}`);
    if (!lines.length) return '';
    const body = [WAKEUP_HEADER, ...lines].join('\n');
    const cap = Math.max(80, intOr(maxChars, 500));
    return body.length <= cap ? body : `${body.slice(0, cap - 1)}…`;
}
