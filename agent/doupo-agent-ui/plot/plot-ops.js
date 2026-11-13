/**
 * 剧情前瞻注入：把滚动计划与开放线索拼成给正文模型看的注入文本。
 * 与世界、影响、人物簿、纳戒、记忆各路互不清空，预算各算各的；
 * 超预算时优先保住计划行，线索从尾部往上丢——方向感比线索全量更重要。
 */

import { KIND_LABELS } from './plot-runtime.js';

const DEFAULT_MAX_CHARS = 500;

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

export const PLOT_HEADER = '【剧情前瞻】以下是这一局故事的滚动方向与未回收线索，由扩展按剧情自动维护。正文顺着这个方向自然推进，别跟已埋线索唱反调；悬置越久的线索越该找合适的机会推进或回收，回收要顺着剧情来，不要硬转。禁止在正文的任何位置输出指令块、JSON 或数据表。';

/** 单条线索行：编号/埋设天/类型/标题/详情/依据/悬置或超期标记。 */
function threadLine(thread, today) {
    const kind = KIND_LABELS[thread.kind] ?? '线索';
    const basis = text(thread.basis) ? `（依据：${text(thread.basis)}）` : '';
    const detail = text(thread.detail) ? `：${text(thread.detail)}` : '';
    let due = '';
    const plantedDay = Number.isInteger(thread.day) ? thread.day : today;
    if (thread.status === 'open') {
        if (Number.isInteger(thread.dueDay)) {
            due = thread.dueDay < today ? `（已超期未回收）` : `（第 ${thread.dueDay} 天前回收）`;
        }
        if (Number.isInteger(today) && Number.isInteger(plantedDay) && today > plantedDay) {
            const hung = today - plantedDay;
            due = `${due}（已悬 ${hung} 天）`.trim();
        }
    }
    return `◆(${thread.id} 第${plantedDay ?? '?'}天埋·${kind}) 「${text(thread.title)}」${detail}${due}${basis}`;
}

/**
 * 剧情账本快照 → 注入文本。
 * 计划两行永远排最前（超预算也不丢）；线索按悬置越久越靠前，超期置顶，
 * 已回收/作废的不出现。账完全空时返回空串，调用方按空注入清通道。
 */
export function buildPlotInjection(snapshot = {}, { maxChars = DEFAULT_MAX_CHARS } = {}) {
    const cap = Number.isFinite(Number(maxChars)) && Number(maxChars) > 0 ? Math.floor(Number(maxChars)) : DEFAULT_MAX_CHARS;
    const plan = snapshot?.plan ?? {};
    const today = Number.isInteger(snapshot?.day) ? snapshot.day : null;
    const open = (Array.isArray(snapshot?.threads) ? snapshot.threads : [])
        .filter(thread => thread?.status === 'open' && text(thread.title))
        .sort((a, b) => {
            const overdueOf = thread => (Number.isInteger(thread.dueDay) && Number.isInteger(today) && thread.dueDay < today ? 0 : 1);
            if (overdueOf(a) !== overdueOf(b)) return overdueOf(a) - overdueOf(b);
            return (a.day ?? 0) - (b.day ?? 0); // 悬置越久（埋得越早）越靠前
        });
    const lines = [];
    if (text(plan.goal)) lines.push(`本幕目标：${text(plan.goal)}`);
    if (text(plan.next)) lines.push(`下一步：${text(plan.next)}`);
    if (open.length) {
        lines.push('未回收线索（推进用 updateThread、回收用 resolveThread、作废用 dropThread）：');
        for (const thread of open) lines.push(threadLine(thread, today));
    }
    if (!lines.length) return '';
    // 逐行入列 + 栏头不孤：超预算从尾部按条丢，线索清单丢光时栏头一起退场，计划行永远保留。
    const parts = [];
    let inThreads = false;
    for (const line of lines) {
        const isHeader = line.startsWith('未回收线索');
        if (isHeader) inThreads = true;
        parts.push({ text: line, isThread: inThreads && !isHeader, isHeader });
    }
    const joined = () => parts.map(part => part.text).join('\n');
    while (parts.length > 1 && joined().length > cap) {
        const threadPart = [...parts].reverse().find(part => part.isThread);
        if (!threadPart) break; // 只剩计划行和栏头，再丢就要丢方向了
        const at = parts.indexOf(threadPart);
        parts.splice(at, 1);
        const stillHas = parts.some(part => part.isThread);
        if (!stillHas) {
            const headerAt = parts.findIndex(part => part.isHeader && part.text.startsWith('未回收线索'));
            if (headerAt >= 0) parts.splice(headerAt, 1);
        }
    }
    return joined();
}
