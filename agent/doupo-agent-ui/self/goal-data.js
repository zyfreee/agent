/**
 * 纳戒目标的纯数据规则：字段约束、新旧两种存档的归一。
 * runtime（新建校验与存档清洗）、数据库桥（表行迁移与解码）、测试共用这一份，
 * 三处口径不漂移。不碰 window/DOM，不依赖其他模块。
 */

/** 兼容标题从正文取第一个分句：遇到这些标点就断。 */
const GOAL_TITLE_BREAK_RE = /[，。；：！？、,.!?;:（(]/;

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * 兼容标题：老目标没有 title 字段，恢复时从正文第一个分句里取一个短标题。
 * 只在恢复旧数据时用——新登记必须显式给标题，缺了直接拒绝，不许拿正文顶替。
 */
export function deriveGoalTitle(body) {
    const source = text(body);
    if (!source) return '';
    const [first] = source.split(GOAL_TITLE_BREAK_RE);
    return text(first) || source;
}

/**
 * 归一一条目标（恢复路径：聊天存档、数据库解码、撤销恢复共用）。
 * - text 缺失整条丢弃；title 缺失时从正文补一个兼容短标题，正文一字不改；
 * - name 是列表兼容字段，缺了从标题补——数据库解码出的 text-only 目标不再因此被丢；
 * - 编号、优先级、期限、完成状态原样保留；内容不设字数上限——上限只有模型输出本身
 *   （用户口径 2026-11-17：正文里讲多细，账里就存多长，扩展不再砍）。
 */
export function normalizeGoal(raw, seq = 1) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const body = text(raw.text);
    if (!body) return null;
    const title = text(raw.title) || deriveGoalTitle(body);
    if (!title) return null;
    return {
        id: text(raw.id) || `g${seq}`,
        title,
        name: text(raw.name) || title,
        text: body,
        priority: raw.priority === '主线' ? '主线' : '支线',
        due: text(raw.due),
        done: raw.done === true,
        // 获得日（账本天数）：登记时由 runtime 补盖；存档/数据库行里带了就原样保留。
        day: Number.isInteger(raw.day) && raw.day >= 1 && raw.day <= 99999 ? raw.day : null,
        source: text(raw.source),
        note: text(raw.note),
    };
}
