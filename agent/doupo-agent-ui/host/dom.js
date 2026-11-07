// 最小 DOM 工具：设置面板与悬浮球所有节点的统一入口。
// 独立成模块是为了让“渲染类”逻辑（装备立绘等）能脱离 index.js 被测试直接 import。
export function makeElement(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value) element.textContent = value;
    return element;
}
