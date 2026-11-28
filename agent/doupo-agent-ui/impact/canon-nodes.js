/**
 * 极小的原著节点表：只做“叫法对齐”和面板分组，不参与自动排期。
 *
 * 设计边界（2026-11-25）：
 * - 世界影响记录里的 canon 是自由文本（≤60 字）。同一件事被写成“退婚”“纳兰嫣然退婚”
 *   “嫣然退婚”时，面板会散成三组，记录员下一轮也容易换个叫法。
 * - 这里给主线早期几个稳定节点一个标准名 + 关键词，用来把 canon 文本归到节点上；
 *   未命中的仍按原文显示，不强行编造节点。
 * - 不做“到第 N 天原著节点自动发生”：节点排期需要真实时间轴（斗破是年为单位，聊天是天），
 *   硬排会替玩家改原著，等有明确口径再开。
 */

export const CANON_NODES = Object.freeze([
    Object.freeze({ id: 'n1', name: '纳兰嫣然退婚', arc: '乌坦城', order: 10, keywords: Object.freeze(['退婚', '纳兰嫣然', '嫣然']) }),
    Object.freeze({ id: 'n2', name: '三年之约', arc: '乌坦城', order: 20, keywords: Object.freeze(['三年之约', '三年后', '云岚宗之约']) }),
    Object.freeze({ id: 'n3', name: '魔兽山脉试炼', arc: '魔兽山脉', order: 30, keywords: Object.freeze(['魔兽山脉', '试炼', '小医仙']) }),
    Object.freeze({ id: 'n4', name: '迦南学院招生', arc: '迦南学院', order: 40, keywords: Object.freeze(['迦南学院', '招生', '入学']) }),
    Object.freeze({ id: 'n5', name: '黑角域之行', arc: '黑角域', order: 50, keywords: Object.freeze(['黑角域', '黑角']) }),
    Object.freeze({ id: 'n6', name: '塔戈尔沙漠', arc: '塔戈尔', order: 60, keywords: Object.freeze(['塔戈尔', '沙漠', '青莲地心火']) }),
    Object.freeze({ id: 'n7', name: '蛇人族与美杜莎', arc: '塔戈尔', order: 65, keywords: Object.freeze(['蛇人族', '美杜莎', '蛇人']) }),
    Object.freeze({ id: 'n8', name: '陨落心炎', arc: '迦南内院', order: 70, keywords: Object.freeze(['陨落心炎', '内院', '天焚炼气塔']) }),
    Object.freeze({ id: 'n9', name: '云岚宗之战', arc: '云岚宗', order: 80, keywords: Object.freeze(['云岚宗', '宗门大战']) }),
    Object.freeze({ id: 'n10', name: '药老苏醒', arc: '主线', order: 90, keywords: Object.freeze(['药老', '药尘', '苏醒']) }),
]);

export const CANON_NODE_NAMES = Object.freeze(CANON_NODES.map(node => node.name));

/** 把一条 canon 文本归到节点；命中多个关键词时取最长命中，避免“云岚宗”吃掉“三年之约”。 */
export function matchCanonNode(text) {
    const value = String(text ?? '').trim();
    if (!value) return null;
    let best = null;
    let bestScore = 0;
    for (const node of CANON_NODES) {
        for (const keyword of node.keywords) {
            if (!value.includes(keyword)) continue;
            const score = keyword.length;
            if (score > bestScore) { best = node; bestScore = score; }
        }
    }
    return best;
}

/** 面板上的短标签：命中节点用标准名，没命中就用原文（截短），空值不显示。 */
export function canonNodeLabel(text, maxChars = 12) {
    const node = matchCanonNode(text);
    if (node) return node.name;
    const value = String(text ?? '').trim();
    if (!value) return '';
    return value.length > maxChars ? `${value.slice(0, maxChars)}…` : value;
}

export function canonNodeById(id) {
    return CANON_NODES.find(node => node.id === id) ?? null;
}

/** 给记录员提示词用的一行式节点表：只统一叫法，不排日期。 */
export function canonNodePromptLines() {
    return [...CANON_NODES]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(node => `- ${node.name}（${node.arc}）`);
}
