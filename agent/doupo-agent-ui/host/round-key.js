// 一轮身份与缓存键：重 roll 复用备料结果的identity基础。
// 从 index.js 摘成纯模块——roundKeyOf/settleRoundKeyOf 是纯函数，召回键工厂把
// 作用域、设置、账本手改序号作为依赖注入，测试可以直接喂数据。

/** 一轮身份：楼层数 + 最新玩家输入。重 roll 换的只是 AI 楼层内容，这两样不变——
 *  召回缓存与场记挑选签名靠它做到「重 roll 复用备料结果，不重复调用」；玩家改口、
 *  楼层增删、换聊天都会换键，照常重新备料。 */
export function roundKeyOf(chat) {
    const list = Array.isArray(chat) ? chat : [];
    let lastUser = '';
    for (let index = list.length - 1; index >= 0; index -= 1) {
        const message = list[index];
        if (message?.is_user === true && typeof message.mes === 'string' && message.mes.trim()) { lastUser = message.mes.trim(); break; }
    }
    return [list.length, lastUser];
}

/**
 * 结算的轮次键：只取结算真正会读的那段历史（用户楼层及之前）的逐层内容。
 * 重roll换的是用户输入之后的正文——结算从不读它，键不变，直接复用判定；
 * 改历史楼层或改输入则键变，正常重跑。单槽内存缓存，直接存 JSON，不做哈希。
 */
export function settleRoundKeyOf(chat, userFloor) {
    const list = Array.isArray(chat) ? chat : [];
    const visible = list.slice(0, Math.max(0, userFloor + 1));
    return JSON.stringify(visible.map(message => [
        message?.is_user === true,
        message?.is_system === true,
        typeof message?.mes === 'string' ? message.mes : '',
        message?.swipe_id ?? null,
    ]));
}

/**
 * 记忆召回缓存键工厂：键 = 聊天作用域 + 一轮身份 + 设置 + 账本手改序号。
 * 按一轮缓存：同一轮（含重 roll）命中同一份召回结果，零调用零等待；玩家发新消息、
 * 改口、删楼、手改记忆账本、改设置才重新召回。依赖注入，不反向依赖 index.js。
 */
export function createMemoryRecallCacheKey({ settleScopeKey, currentSettings, memoryRuntime }) {
    return function memoryRecallCacheKey(chat) {
        const list = Array.isArray(chat) ? chat : [];
        return JSON.stringify([settleScopeKey(), roundKeyOf(list), currentSettings(), memoryRuntime().manualVersion()]);
    };
}
