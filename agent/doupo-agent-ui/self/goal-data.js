/**
 * 纳戒目标的纯数据规则：字段约束、新旧两种存档的归一。
 * runtime（新建校验与存档清洗）、数据库桥（表行迁移与解码）、测试共用这一份，
 * 三处口径不漂移。不碰 window/DOM，不依赖其他模块。
 */

/** 目标短标题上限：列表与注入里那一行，新建必填、超长拒绝。 */
export const GOAL_TITLE_MAX = 30;
/** 目标完整内容的上限：与标题分开，标题压不进的内容全放这里。 */
export const GOAL_TEXT_MAX = 80;

const GOAL_DUE_MAX = 20;
const GOAL_SOURCE_MAX = 60;
const GOAL_NOTE_MAX = 120;
const GOAL_NAME_MAX = 30;
/** 兼容标题从正文取第一个分句：遇到这些标点就断。 */
const GOAL_TITLE_BREAK_RE = /[，。；：！？、,.!?;:（(]/;

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * 兼容标题：老目标没有 title 字段，恢复时从正文第一个分句里取一个 ≤20 字的短标题。
 * 只在恢复旧数据时用——新登记必须显式给标题，缺了直接拒绝，不许拿正文顶替。
 */
export function deriveGoalTitle(body) {
    const source = text(body);
    if (!source) return '';
    const [first] = source.split(GOAL_TITLE_BREAK_RE);
    return (text(first) || source).slice(0, GOAL_TITLE_MAX);
}

/**
 * 归一一条目标（恢复路径：聊天存档、数据库解码、撤销恢复共用）。
 * - text 缺失整条丢弃；title 缺失时从正文补一个兼容短标题，正文一字不改；
 * - name 是列表兼容字段，缺了从标题补——数据库解码出的 text-only 目标不再因此被丢；
 * - 编号、优先级、期限、完成状态原样保留；坏字段按各自上限截断而不是作废。
 */
export function normalizeGoal(raw, seq = 1) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const body = text(raw.text);
    if (!body) return null;
    const title = text(raw.title) || deriveGoalTitle(body);
    if (!title) return null;
    return {
        id: text(raw.id) || `g${seq}`,
        title: title.slice(0, GOAL_TITLE_MAX),
        name: (text(raw.name) || title).slice(0, GOAL_NAME_MAX),
        text: body.slice(0, GOAL_TEXT_MAX),
        priority: raw.priority === '主线' ? '主线' : '支线',
        due: text(raw.due).slice(0, GOAL_DUE_MAX),
        done: raw.done === true,
        source: text(raw.source).slice(0, GOAL_SOURCE_MAX),
        note: text(raw.note).slice(0, GOAL_NOTE_MAX),
    };
}
