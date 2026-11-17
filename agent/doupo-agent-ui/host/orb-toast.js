/**
 * 悬浮球消息弹窗：纳戒、人物簿的每笔改动化作球边一条横向小胶囊，到点自动退场。
 * 纯逻辑与 DOM 无关：条目进出、上限裁剪、到期清算都在这里；渲染与定位在 index.js。
 * 条目形状：{ id, icon, title, text, tone, detail, at, until }——icon 是 daiIcon 图谱名，
 * title 是胶囊里加粗的短主语（如人名），text 是变化本体，tone 决定描边配色。
 */

export const ORB_TOAST_TONES = Object.freeze(['good', 'bad', 'info']);

const DEFAULT_MAX = 6;
const DEFAULT_SECONDS = 8;
const TOAST_TEXT_MAX = 80;

export function createOrbToasts({ max = DEFAULT_MAX, seconds = DEFAULT_SECONDS, now = () => Date.now() } = {}) {
    const entries = [];
    let seq = 0;
    const cap = Math.max(1, Number(max) || DEFAULT_MAX);
    const life = Math.max(1, Number(seconds) || DEFAULT_SECONDS) * 1000;
    /** 一批弹窗入列；text 为空的条目直接丢弃，溢出时从最老的开始挤掉。返回实际入列数。 */
    function push(input) {
        const list = Array.isArray(input) ? input : [input];
        const at = now();
        let added = 0;
        for (const item of list) {
            const text = typeof item?.text === 'string' ? item.text.trim() : '';
            if (!text) continue;
            const title = typeof item?.title === 'string' ? item.title.trim() : '';
            entries.push({
                id: ++seq,
                icon: typeof item?.icon === 'string' && item.icon ? item.icon : 'ring',
                title: title.length > 20 ? `${title.slice(0, 19)}…` : title,
                text: text.length > TOAST_TEXT_MAX ? `${text.slice(0, TOAST_TEXT_MAX - 1)}…` : text,
                tone: ORB_TOAST_TONES.includes(item?.tone) ? item.tone : 'info',
                detail: typeof item?.detail === 'string' ? item.detail.trim() : '',
                at,
                until: at + life,
            });
            added += 1;
        }
        while (entries.length > cap) entries.shift();
        return added;
    }
    /** 清到当前时刻为止已到期的条目，返回剩余条数。 */
    function tick(nowTs = now()) {
        while (entries.length && entries[0].until <= nowTs) entries.shift();
        return entries.length;
    }
    /** 当前该显示的条目快照（先清算再拷贝，渲染层拿到的永远是干净列表）。 */
    function active() {
        tick();
        return entries.slice();
    }
    /** 玩家点了胶囊就提前退场。 */
    function dismiss(id) {
        const index = entries.findIndex(entry => entry.id === id);
        if (index < 0) return false;
        entries.splice(index, 1);
        return true;
    }
    function clear() {
        entries.length = 0;
    }
    /** 最近的到期时刻；没有条目时为 null——渲染层靠它安排下一次清算。 */
    function nextExpiry() {
        if (!entries.length) return null;
        return Math.min(...entries.map(entry => entry.until));
    }
    return Object.freeze({ push, tick, active, dismiss, clear, nextExpiry });
}

/** 人物簿一行的字段标签里，好感已由 delta 单独表达，标签里的「好感+3」不再重复。 */
function dropFavorLabel(field) {
    return typeof field === 'string' && field && !field.startsWith('好感');
}

/**
 * 人物簿 apply / recordReply 结果 → 弹窗条目：同一人一次落账的多个补丁合并成一条胶囊。
 * 好感定 tone（增绿减红），建档换「+」图标并在正文打头。
 */
export function npcLedgerResultToToasts(result, { source = '' } = {}) {
    const applied = Array.isArray(result?.applied) ? result.applied : [];
    const byName = new Map();
    for (const item of applied) {
        if (!item?.name) continue;
        const merged = byName.get(item.name) ?? { name: item.name, favor: 0, created: false, fields: [] };
        merged.favor += Number(item.favor) || 0;
        merged.created = merged.created || item.created === true;
        for (const field of Array.isArray(item.fields) ? item.fields : []) {
            if (dropFavorLabel(field) && !merged.fields.includes(field)) merged.fields.push(field);
        }
        byName.set(item.name, merged);
    }
    const toasts = [];
    for (const merged of byName.values()) {
        const parts = [];
        if (merged.created) parts.push('新档案');
        if (merged.favor) parts.push(`好感 ${merged.favor > 0 ? '+' : ''}${merged.favor}`);
        parts.push(...merged.fields);
        if (!parts.length) continue;
        toasts.push({
            icon: merged.created ? 'plus' : 'person',
            title: merged.name,
            text: parts.join(' · '),
            tone: merged.favor > 0 ? 'good' : merged.favor < 0 ? 'bad' : 'info',
            detail: source,
        });
    }
    return toasts;
}

/** 纳戒操作摘要的语气与图标：金币看正负，境界一律喜，移除红、新增绿、其余中性。 */
const SELF_TOAST_TONE_RULES = Object.freeze([
    { match: summary => summary.startsWith('金币+'), tone: 'good', icon: 'balance' },
    { match: summary => summary.startsWith('金币-'), tone: 'bad', icon: 'balance' },
    { match: summary => summary.startsWith('金币'), tone: 'info', icon: 'balance' },
    { match: summary => summary.startsWith('境界'), tone: 'good', icon: 'flame' },
    { match: summary => summary.startsWith('称号'), tone: 'good', icon: 'letter' },
    { match: summary => summary.startsWith('移除'), tone: 'bad', icon: 'ledger' },
    { match: summary => summary.startsWith('恢复'), tone: 'info', icon: 'arrow' },
    { match: summary => summary.includes(' +'), tone: 'good', icon: 'ring' },
]);

/** 纳戒 apply 结果 → 弹窗条目：一条操作摘要一条胶囊，语音直接用账本现成的 summary。 */
export function selfResultToToasts(result, { source = '' } = {}) {
    const applied = Array.isArray(result?.applied) ? result.applied : [];
    const toasts = [];
    for (const item of applied) {
        const summary = typeof item?.summary === 'string' ? item.summary.trim() : '';
        if (!summary) continue;
        const rule = SELF_TOAST_TONE_RULES.find(entry => entry.match(summary)) ?? { tone: 'info', icon: 'ring' };
        toasts.push({ icon: rule.icon, title: '', text: summary, tone: rule.tone, detail: source });
    }
    return toasts;
}
