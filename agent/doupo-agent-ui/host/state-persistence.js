const CHAT_KEY = 'doupo_agent_state';

/**
 * Keeps the last committed turn snapshot next to the chat it belongs to, so a
 * page refresh or chat switch restores the same branch instead of starting over.
 */
export function createStatePersistence({ getContext } = {}) {
    if (typeof getContext !== 'function') throw new TypeError('getContext 必须是函数');

    function slotOf({ sessionId, branchId }) {
        return `${sessionId}|${branchId}`;
    }

    function load({ sessionId, branchId } = {}) {
        const context = getContext();
        if (!context) return { status: 'unavailable' };
        const bucket = context.chatMetadata?.[CHAT_KEY];
        const entry = bucket?.[slotOf({ sessionId, branchId })];
        if (!entry || typeof entry !== 'object') return { status: 'empty' };
        return { status: 'loaded', snapshot: structuredClone(entry) };
    }

    function save({ sessionId, branchId } = {}, snapshot) {
        const context = getContext();
        if (!context) return { status: 'unavailable' };
        if (!snapshot || typeof snapshot !== 'object') return { status: 'rejected', reason: 'invalid_snapshot' };
        const metadata = context.chatMetadata && typeof context.chatMetadata === 'object' ? context.chatMetadata : (context.chatMetadata = {});
        const bucket = metadata[CHAT_KEY] && typeof metadata[CHAT_KEY] === 'object' ? metadata[CHAT_KEY] : (metadata[CHAT_KEY] = {});
        bucket[slotOf({ sessionId, branchId })] = {
            stateVersion: snapshot.stateVersion ?? 'v1',
            versionIndex: Number.isInteger(snapshot.versionIndex) ? snapshot.versionIndex : undefined,
            state: structuredClone(snapshot.state ?? {}),
            baseVersion: typeof snapshot.baseVersion === 'string' ? snapshot.baseVersion : undefined,
            baseState: snapshot.baseState && typeof snapshot.baseState === 'object' ? structuredClone(snapshot.baseState) : undefined,
            history: Array.isArray(snapshot.history) ? structuredClone(snapshot.history.slice(-40)) : [],
            savedAt: new Date().toISOString(),
        };
        try {
            context.saveMetadata?.();
            return { status: 'saved' };
        } catch (error) {
            return { status: 'failed', reason: String(error?.message ?? error) };
        }
    }

    function remove({ sessionId, branchId } = {}) {
        const context = getContext();
        const bucket = context?.chatMetadata?.[CHAT_KEY];
        if (!bucket) return { status: 'empty' };
        delete bucket[slotOf({ sessionId, branchId })];
        try { context.saveMetadata?.(); } catch { /* 下次保存会一并写回 */ }
        return { status: 'removed' };
    }

    return Object.freeze({ load, save, remove, key: CHAT_KEY });
}
