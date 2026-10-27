/**
 * 世界影响的两种呈现：
 * - 注入：把"玩家已经改出的世界"压成几行，塞进正文提示词，让叙事模型记住这个局已经不是原著了；
 * - 台账：给决定模块看的完整清单，带编号，模型才能对旧影响做"发酵 / 了结 / 修复"。
 *
 * 两者都只读、只排版，不改库；预算到了就从尾部丢行，绝不为了字数把开头截掉。
 */

const WEIGHT_LABEL = Object.freeze({ world: '世界级', major: '大事', minor: '小事' });
const STATE_LABEL = Object.freeze({ active: '未了结', ripened: '已发酵', closed: '已了结', reverted: '已修复' });
const KIND_LABEL = Object.freeze({ direct: '直接', ripple: '涟漪', butterfly: '蝴蝶' });
const SHIFT_LABEL = Object.freeze({ accelerate: '加速', delay: '延后', avoid: '避过', alter: '改写' });
const WEIGHT_RANK = Object.freeze({ world: 0, major: 1, minor: 2 });
const STATE_RANK = Object.freeze({ active: 0, ripened: 1, closed: 2, reverted: 3 });

export const IMPACT_HEADER = '【世界影响 · 本局世界线】';

export { WEIGHT_LABEL, STATE_LABEL, KIND_LABEL, SHIFT_LABEL };

/** 分量标记：★=世界级，？=只是传闻，其余不标。 */
export function impactMark(record) {
    if (!record) return '';
    if (record.weight === 'world') return '★';
    if (record.certainty === 'rumor') return '？';
    return '';
}

/** 面板/日志用的一行完整摘要。 */
export function summarizeImpact(record) {
    if (!record) return '';
    const head = `${impactMark(record)}第 ${record.day} 天｜${WEIGHT_LABEL[record.weight] ?? '小事'}｜${STATE_LABEL[record.state] ?? '未了结'}`;
    const body = record.detail ? `${record.title}：${record.detail}` : record.title;
    const canon = record.canon ? `｜原著偏移（${SHIFT_LABEL[record.shift] ?? '改写'}）：${record.canon}` : '';
    const follow = record.resolution ? `｜后续：${record.resolution}` : '';
    return `${head}｜${body}${canon}${follow}`;
}

function byWeightThenDay(a, b) {
    return (WEIGHT_RANK[a.weight] ?? 1) - (WEIGHT_RANK[b.weight] ?? 1) || b.day - a.day;
}

/** 正文注入用的短行：不带编号、不带依据，只留"世界已经变成什么样"。 */
function injectionLine(record) {
    const ripened = record.state === 'ripened' ? '（已发酵）' : '';
    const canon = record.canon ? `（原著·${SHIFT_LABEL[record.shift] ?? '改写'}）` : '';
    return `· ${impactMark(record)}第 ${record.day} 天｜${WEIGHT_LABEL[record.weight] ?? '小事'}｜${record.title}：${record.detail}${ripened}${canon}`;
}

/**
 * 把影响库压成注入文本。写"还没收场"的影响：未了结的、以及已经发酵但还没了结的
 * （后果已经在世界里应验，正文更该知道）；约好日期但还没到的影响单独一行提醒"要等"，避免正文提前写穿。
 * 库是空的就返回空字符串，调用方据此跳过注入，不留空标题占预算。
 */
export function buildImpactInjection(records, { maxChars = 800, maxLines = 10, day = 1 } = {}) {
    return buildImpactInjectionDetail(records, { maxChars, maxLines, day }).text;
}

/**
 * 注入文本 + 回执：usedIds 是这一轮真的写进正文的那几条，设置页据此标“本轮已注入”。
 * 正文里不出现编号，但调用方需要知道用了谁，所以内容与 id 一起返回。
 */
export function buildImpactInjectionDetail(records, { maxChars = 800, maxLines = 10, day = 1 } = {}) {
    const list = Array.isArray(records) ? records : [];
    const today = Number.isInteger(day) && day > 0 ? day : 1;
    const shown = list
        .filter(record => record && (record.state === 'active' || record.state === 'ripened'))
        .filter(record => record.state === 'ripened' || record.ripenDay === null || record.ripenDay <= today)
        .sort(byWeightThenDay);
    const pending = list
        .filter(record => record && record.state === 'active' && record.ripenDay !== null && record.ripenDay > today)
        .sort((a, b) => a.ripenDay - b.ripenDay);
    if (!shown.length && !pending.length) return { text: '', usedIds: [] };

    const lines = [];
    const usedIds = [];
    let used = IMPACT_HEADER.length;
    const push = line => {
        if (lines.length && used + line.length + 1 > maxChars) return false;
        lines.push(line);
        used += line.length + 1;
        return true;
    };
    for (const record of shown.slice(0, maxLines)) {
        if (!push(injectionLine(record))) break;
        usedIds.push(record.id);
    }
    if (pending.length) {
        const named = pending.slice(0, Math.max(1, maxLines - lines.length));
        const rest = pending.length > named.length ? ` 等 ${pending.length} 件` : '';
        const names = named.map(record => `第 ${record.ripenDay} 天 ${record.title}`);
        if (push(`· 还没发作${rest}：${names.join('；')}`)) usedIds.push(...named.map(record => record.id));
    }
    return { text: [IMPACT_HEADER, ...lines].join('\n'), usedIds };
}

/** 决定模块用的台账行：带编号和状态，模型才能引用旧影响。 */
function ledgerLine(record, day) {
    const parts = [
        `#${record.id}`,
        `第 ${record.day} 天`,
        WEIGHT_LABEL[record.weight] ?? '小事',
        STATE_LABEL[record.state] ?? '未了结',
        record.kind !== 'direct' ? KIND_LABEL[record.kind] : '',
        `${record.title}：${record.detail}`,
    ].filter(Boolean);
    if (record.target) parts.push(`对象：${record.target}`);
    if (record.evidence) parts.push(`依据：${record.evidence}`);
    if (record.canon) parts.push(`原著·${SHIFT_LABEL[record.shift] ?? '改写'}：${record.canon}`);
    if (record.eventId) parts.push(`关联事件：${record.eventId}`);
    if (record.parent) parts.push(`源自：${record.parent}`);
    if (record.state === 'active' && record.ripenDay !== null) {
        parts.push(record.ripenDay > day ? `第 ${record.ripenDay} 天起发酵` : '已到发酵日、尚未发作');
    }
    if (record.resolution) parts.push(`后续：${record.resolution}`);
    if (record.source === 'manual') parts.push('手动登记');
    if (record.edited) parts.push(`已修改${record.editedDay ? `（第 ${record.editedDay} 天）` : ''}`);
    return parts.join('｜');
}

export function buildImpactLedgerLines(records, { maxChars = 1600, maxLines = 30, day = 1 } = {}) {
    const today = Number.isInteger(day) && day > 0 ? day : 1;
    const list = (Array.isArray(records) ? records : [])
        .filter(record => record && record.title)
        .sort((a, b) => (STATE_RANK[a.state] ?? 0) - (STATE_RANK[b.state] ?? 0) || byWeightThenDay(a, b));
    const lines = [];
    let used = 0;
    for (const record of list) {
        if (lines.length >= maxLines) break;
        const line = ledgerLine(record, today);
        if (lines.length && used + line.length + 1 > maxChars) break;
        lines.push(line);
        used += line.length + 1;
    }
    return lines;
}

/**
 * 记录节奏：从"上次叫记录员"的楼层往后数 AI 回复，够“每几轮”才该再叫一次。
 * lastFloor 由影响库的 decidedFloor 提供：没记到东西也算叫过一次，避免干脆每轮都跑。
 */
export function isImpactDecideDue(chat, { every = 1, lastFloor = -1 } = {}) {
    if (!Array.isArray(chat)) return false;
    const step = Number.isInteger(every) && every > 0 ? every : 1;
    let start = Number.isInteger(lastFloor) ? lastFloor + 1 : 0;
    // 楼层号超出当前聊天长度：聊天被倒带/删楼了，宁可重新数一遍，也不要从此再也不记账。
    if (start < 0 || start > chat.length) start = 0;
    let replies = 0;
    for (let index = start; index < chat.length; index++) {
        const message = chat[index];
        if (!message || message.is_user || message.is_system) continue;
        replies += 1;
        if (replies >= step) return true;
    }
    return false;
}
