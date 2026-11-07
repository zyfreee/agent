// 会话作用域与续算凭据：从 index.js 摘出的纯接线逻辑，依赖全部注入，测试可直接 import。

/** 当前会话作用域：chatId + 分支；没有 chatId 时落到 'current-chat' 兜底。 */
export function createCurrentAgentScope({ getContext }) {
    return function currentAgentScope() {
        const context = getContext();
        const chatId = typeof context?.chatId === 'string' && context.chatId.trim() ? context.chatId.trim() : '';
        const branchId = typeof context?.chatMetadata?.branch_id === 'string' && context.chatMetadata.branch_id.trim() ? context.chatMetadata.branch_id.trim() : 'main';
        return { sessionId: chatId || 'current-chat', branchId };
    };
}

/**
 * 续算凭据对：captureAgentScope 只认"作用域 + 续算纪元 + 总开关"，
 * captureAgentContinuation 额外认"聊天数组身份 + 捕获楼层/尾楼 + 内容指纹"。
 * 生成链里用它判断"捕获时的现场是否仍然有效"（stale 判定）。
 */
export function createCaptureAgents({ getEpoch, settleScopeKey, getContext, currentSettings, lastReplyIndex }) {
    function captureAgentScope() {
        const epoch = getEpoch();
        const scope = settleScopeKey();
        const chat = getContext()?.chat;
        return { current: () => currentSettings().enabled !== false && epoch === getEpoch()
            && scope === settleScopeKey() && getContext()?.chat === chat };
    }

    function captureAgentContinuation() {
        const epoch = getEpoch();
        const scope = settleScopeKey();
        const chat = getContext()?.chat;
        const floor = lastReplyIndex(Array.isArray(chat) ? chat : []);
        const reply = chat?.[floor];
        const tail = chat?.at(-1);
        const identity = () => JSON.stringify([chat?.length, reply?.mes, reply?.swipe_id, tail?.mes, tail?.swipe_id]);
        const captured = identity();
        return { current: () => currentSettings().enabled !== false && epoch === getEpoch() && scope === settleScopeKey()
            && getContext()?.chat === chat && chat?.[floor] === reply && chat?.at(-1) === tail && identity() === captured };
    }

    return { captureAgentScope, captureAgentContinuation };
}
