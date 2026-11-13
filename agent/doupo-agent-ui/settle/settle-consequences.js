/**
 * 结构化代价：把"部分成功/失败"的自由文本后果升级为 类型×等级×正文，
 * 参照 Blades in the Dark 的 partial success（成但有代价）模型。
 *
 * 职责边界：只归一化和补齐代价描述，不落账——代价进入正文由正文模型写出来，
 * 真账（好感/世界事件/时间）仍由各域决定链按正文记账，与本模块无耦合。
 * 输入宽容：字符串后果原样保留（兼容旧输出），对象后果校验后转成带前缀的字符串。
 */

export const SETTLE_CONSEQUENCE_TYPES = Object.freeze(['time', 'resource', 'injury', 'reputation', 'grudge', 'exposure', 'misc']);
export const SETTLE_CONSEQUENCE_TYPE_LABELS = Object.freeze({ time: '耗时', resource: '资源', injury: '受伤', reputation: '声望', grudge: '结仇', exposure: '暴露', misc: '变故' });
export const SETTLE_CONSEQUENCE_GRADES = Object.freeze(['minor', 'moderate', 'severe']);
export const SETTLE_CONSEQUENCE_GRADE_LABELS = Object.freeze({ minor: '轻', moderate: '中', severe: '重' });
const MAX_CONSEQUENCE_TEXT = 300;

const typed = value => typeof value === 'string' && SETTLE_CONSEQUENCE_TYPES.includes(value);
const graded = value => typeof value === 'string' && SETTLE_CONSEQUENCE_GRADES.includes(value);
const text = value => typeof value === 'string' ? value.trim() : '';
const clip = (value, limit) => String(value ?? '').slice(0, limit);

/** 结构化后果 → `【结仇·中】正文`；字符串原样通过，缺正文记违规（调用方决定是否阻断）。 */
export function normalizeSettleConsequences(items) {
    const consequences = [];
    const penalties = [];
    const violations = [];
    for (const item of Array.isArray(items) ? items : []) {
        if (typeof item === 'string') {
            const body = text(item);
            if (!body) { violations.push('空字符串后果'); continue; }
            consequences.push(clip(body, MAX_CONSEQUENCE_TEXT));
            penalties.push({ type: null, grade: null, text: clip(body, MAX_CONSEQUENCE_TEXT) });
            continue;
        }
        if (!item || typeof item !== 'object' || Array.isArray(item)) { violations.push('后果不是字符串或对象'); continue; }
        const body = text(item.text);
        if (!body) { violations.push('结构化后果缺少 text 正文'); continue; }
        const type = typed(item.type) ? item.type : 'misc';
        const grade = graded(item.grade) ? item.grade : 'moderate';
        const label = `${SETTLE_CONSEQUENCE_TYPE_LABELS[type]}·${SETTLE_CONSEQUENCE_GRADE_LABELS[grade]}`;
        consequences.push(clip(`【${label}】${body}`, MAX_CONSEQUENCE_TEXT));
        penalties.push({ type, grade, text: clip(body, MAX_CONSEQUENCE_TEXT) });
    }
    return { consequences, penalties, violations };
}

/** partial 的保底代价表：类别没给代价时由脚本补一条轻级，正文必须写出来。 */
export const SETTLE_PARTIAL_COSTS = Object.freeze({
    alchemy: Object.freeze({ type: 'resource', grade: 'minor', text: '药力驳杂，效力打了折扣' }),
    cultivation: Object.freeze({ type: 'resource', grade: 'minor', text: '行功生涩，气机滞涩片刻' }),
    combat: Object.freeze({ type: 'injury', grade: 'minor', text: '负了点轻伤，出手慢了半拍' }),
    general: Object.freeze({ type: 'time', grade: 'minor', text: '横生枝节，多耗了些工夫' }),
    default: Object.freeze({ type: 'time', grade: 'minor', text: '横生枝节，多耗了些工夫' }),
});

/** 类别 key 只认内置四类；自定义类别走 default，不出错。 */
export function partialCostFor(category) {
    return SETTLE_PARTIAL_COSTS[category] ?? SETTLE_PARTIAL_COSTS.default;
}

/** 部分成功必须有可见代价：没有结构化代价就补保底一条。返回是否补了。 */
export function ensurePartialCost(action) {
    if (!action || action.status !== 'partial') return false;
    const hasTyped = Array.isArray(action.penalties) && action.penalties.some(entry => entry?.type);
    if (hasTyped) return false;
    const cost = partialCostFor(action.category);
    const label = `${SETTLE_CONSEQUENCE_TYPE_LABELS[cost.type]}·${SETTLE_CONSEQUENCE_GRADE_LABELS[cost.grade]}`;
    action.consequences = [...(Array.isArray(action.consequences) ? action.consequences : []), `【${label}】${cost.text}`];
    action.penalties = [...(Array.isArray(action.penalties) ? action.penalties : []), { ...cost }];
    return true;
}
