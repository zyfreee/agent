function required(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}
function clone(value) { return structuredClone(value); }

/**
 * In-memory, branch-scoped history checkpoint/recovery boundary.
 * It never writes Tavern messages or durable saves; callers must provide verified snapshots.
 */
export function createHistoryRestore({ stateStore, commitRecovery, maxCheckpoints = 200 } = {}) {
    if (!stateStore || typeof stateStore.read !== 'function' || typeof stateStore.seed !== 'function') throw new TypeError('stateStore 缺少读取/初始化接口');
    if (commitRecovery && typeof commitRecovery.inspect !== 'function') throw new TypeError('commitRecovery 缺少 inspect 接口');
    if (!Number.isInteger(maxCheckpoints) || maxCheckpoints < 1 || maxCheckpoints > 10000) throw new RangeError('maxCheckpoints 必须为 1 到 10000');
    const checkpoints = new Map();
    const checkpointOrder = [];

    function makeKey(sessionId, branchId, checkpointId) { return `${sessionId}\u0000${branchId}\u0000${checkpointId}`; }
    function capture({ sessionId, branchId, checkpointId, messageId, stateVersion, observed, stateSnapshot, historySnapshot } = {}) {
        sessionId = required(sessionId, 'sessionId'); branchId = required(branchId, 'branchId'); checkpointId = required(checkpointId, 'checkpointId');
        messageId = required(messageId, 'messageId'); stateVersion = required(stateVersion, 'stateVersion');
        if (observed !== true) return { status: 'rejected', reason: 'snapshot_not_verified' };
        if (!stateSnapshot || typeof stateSnapshot !== 'object' || Array.isArray(stateSnapshot)) return { status: 'rejected', reason: 'state_snapshot_required' };
        if (historySnapshot !== undefined && !Array.isArray(historySnapshot)) return { status: 'rejected', reason: 'history_snapshot_must_be_array' };
        const live = stateStore.read({ sessionId, branchId });
        if (!live || live.exists === false || typeof live.stateVersion !== 'string') return { status: 'missing_branch' };
        if (live.stateVersion !== stateVersion) return { status: 'stale_state', currentVersion: live.stateVersion };
        if (checkpoints.size >= maxCheckpoints && !checkpoints.has(makeKey(sessionId, branchId, checkpointId))) return { status: 'checkpoint_limit' };
        const checkpoint = { sessionId, branchId, checkpointId, messageId, stateVersion, stateSnapshot: clone(stateSnapshot), historySnapshot: historySnapshot === undefined ? undefined : clone(historySnapshot), capturedAt: new Date().toISOString(), verified: true };
        const key = makeKey(sessionId, branchId, checkpointId);
        if (!checkpoints.has(key)) checkpointOrder.push(key);
        checkpoints.set(key, checkpoint);
        return { status: 'captured', checkpoint: clone(checkpoint) };
    }
    function inspect({ sessionId, branchId, checkpointId } = {}) {
        const checkpoint = checkpoints.get(makeKey(required(sessionId, 'sessionId'), required(branchId, 'branchId'), required(checkpointId, 'checkpointId')));
        return checkpoint ? { status: 'found', checkpoint: clone(checkpoint) } : { status: 'missing_checkpoint' };
    }
    function list({ sessionId, branchId } = {}) {
        sessionId = required(sessionId, 'sessionId'); branchId = required(branchId, 'branchId');
        return checkpointOrder.map(key => checkpoints.get(key)).filter(item => item?.sessionId === sessionId && item.branchId === branchId).map(clone);
    }
    function restore({ sessionId, branchId, checkpointId, expectedCurrentVersion, restoreId, messageObserved, observedMessageIds } = {}) {
        sessionId = required(sessionId, 'sessionId'); branchId = required(branchId, 'branchId'); checkpointId = required(checkpointId, 'checkpointId');
        expectedCurrentVersion = required(expectedCurrentVersion, 'expectedCurrentVersion'); restoreId = required(restoreId, 'restoreId');
        if (messageObserved !== true || !Array.isArray(observedMessageIds) || observedMessageIds.some(id => typeof id !== 'string')) return { status: 'rejected', reason: 'history_evidence_required' };
        const checkpoint = checkpoints.get(makeKey(sessionId, branchId, checkpointId));
        if (!checkpoint) return { status: 'missing_checkpoint' };
        if (!observedMessageIds.includes(checkpoint.messageId)) return { status: 'rejected', reason: 'checkpoint_message_not_observed' };
        const live = stateStore.read({ sessionId, branchId });
        if (!live || live.exists === false || typeof live.stateVersion !== 'string') return { status: 'missing_branch' };
        if (live.stateVersion !== expectedCurrentVersion) return { status: 'stale_state', currentVersion: live.stateVersion };
        // Never overwrite an unresolved two-store commit: recovery must be reconciled first.
        if (commitRecovery) for (const item of live.history ?? []) {
            const journal = commitRecovery.inspect({ sessionId, branchId, commitId: item.commitId });
            if (journal.status !== 'missing_journal' && journal.phase !== 'committed' && journal.phase !== 'cancelled') return { status: 'recovery_required', commitId: item.commitId, phase: journal.phase };
        }
        const restoreCommitId = `restore:${restoreId}`;
        const result = stateStore.commit({ sessionId, branchId, baseVersion: expectedCurrentVersion, commitId: restoreCommitId, messageId: checkpoint.messageId, candidate: { nextState: clone(checkpoint.stateSnapshot), changes: [{ type: 'history_restore', checkpointId, sourceVersion: checkpoint.stateVersion }] } });
        if (result.status !== 'committed') return result;
        return { status: 'restored', checkpointId, previousVersion: result.previousVersion, stateVersion: result.stateVersion, messageId: checkpoint.messageId, historySnapshotAvailable: Array.isArray(checkpoint.historySnapshot), note: '只恢复内存状态候选存储；酒馆消息历史与正式存档未更改。' };
    }
    return Object.freeze({ capture, inspect, list, restore, get size() { return checkpoints.size; } });
}
