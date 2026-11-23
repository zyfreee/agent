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
        // 结构口径：楼层结构 + swipe 状态。mes 内容不进指纹——TavernHelper 生态脚本
        // （「标签补全」思维链标签修复这类）会在生成结束、本凭据捕获之后用 setChatMessages
        // 合法改写最新 AI 楼的正文（2026-11-20 实跑三轮复现，栈直达 TavernHelper iframe 的 lib.js），
        // 内容指纹会把这种改写误判成"聊天被人动过"，世界决定直接 stale，记账链整轮报废。
        // 结构不变（没加楼、没换 swipe、楼层对象没被换掉）就不算新回合；链条执行时读的是最新正文。
        const identity = () => JSON.stringify([chat?.length, reply?.swipe_id, tail?.swipe_id]);
        const captured = identity();
        return { current: () => {
            const parts = {
                enabled: currentSettings().enabled !== false,
                epoch: epoch === getEpoch(),
                scope: scope === settleScopeKey(),
                chatRef: getContext()?.chat === chat,
                floorRef: chat?.[floor] === reply,
                tailRef: chat?.at(-1) === tail,
                identity: identity() === captured,
            };
            const ok = parts.enabled && parts.epoch && parts.scope && parts.chatRef && parts.floorRef && parts.tailRef && parts.identity;
            if (!ok && globalThis.__doupoDebugContinuation === true) {
                try { console.warn(`[doupo-cont-fail] ${JSON.stringify(parts)} nowLen=${chat?.length} nowIdx=${lastReplyIndex(Array.isArray(chat) ? chat : [])} cap=${captured.slice(0, 60)} now=${identity().slice(0, 60)}`); } catch { /* 诊断探针 */ }
            }
            return ok;
        } };
    }

    return { captureAgentScope, captureAgentContinuation };
}
