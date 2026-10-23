function required(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}

/** Local commit journal; ties state commits to host-message evidence without claiming cross-store atomicity. */
export function createCommitRecovery({ stateStore, maxEntries = 500 } = {}) {
    if (!stateStore || typeof stateStore.commit !== 'function' || typeof stateStore.read !== 'function') throw new TypeError('stateStore 缺少提交/读取接口');
    if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 50000) throw new RangeError('maxEntries 超出范围');
    const journal = new Map();
    const cancelled = new Set();
    function key(sessionId, branchId, commitId) { return `${sessionId}\u0000${branchId}\u0000${commitId}`; }
    function prepare({ sessionId, branchId, baseVersion, commitId, candidate, messageId } = {}) {
        sessionId = required(sessionId, 'sessionId'); branchId = required(branchId, 'branchId'); commitId = required(commitId, 'commitId');
        baseVersion = required(baseVersion, 'baseVersion'); messageId = required(messageId, 'messageId');
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || !candidate.nextState || typeof candidate.nextState !== 'object' || Array.isArray(candidate.nextState)) throw new TypeError('candidate.nextState 必须是对象');
        const id = key(sessionId, branchId, commitId);
        if (journal.has(id)) return { status: 'duplicate_prepare', record: structuredClone(journal.get(id)) };
        if (journal.size >= maxEntries) return { status: 'journal_full' };
        const state = stateStore.read({ sessionId, branchId });
        if (!state || !state.stateVersion) return { status: 'missing_branch' };
        if (state.stateVersion !== baseVersion) return { status: 'stale_state', currentVersion: state.stateVersion };
        const record = { sessionId, branchId, baseVersion, commitId, candidate: structuredClone(candidate), messageId, phase: 'prepared', createdAt: new Date().toISOString() };
        journal.set(id, record);
        return { status: 'prepared', commitId, messageId };
    }
    function markMessage({ sessionId, branchId, commitId, messageId, observed } = {}) {
        sessionId = required(sessionId, 'sessionId'); branchId = required(branchId, 'branchId'); commitId = required(commitId, 'commitId'); messageId = required(messageId, 'messageId');
        const record = journal.get(key(sessionId, branchId, commitId));
        if (!record) return { status: 'missing_journal' };
        if (record.messageId !== messageId) return { status: 'message_mismatch' };
        if (typeof observed !== 'boolean') throw new TypeError('observed 必须是布尔值');
        if (record.phase === 'committed') return { status: 'already_committed', stateVersion: record.result.stateVersion };
        if (record.phase === 'cancelled') return { status: 'cancelled' };
        if (observed) { record.phase = 'message_observed'; record.messageObservedAt = new Date().toISOString(); }
        else if (record.phase === 'message_observed') return { status: 'evidence_conflict' };
        return { status: observed ? 'message_observed' : 'message_absent' };
    }
    function cancel({ sessionId, branchId, commitId } = {}) {
        sessionId = required(sessionId, 'sessionId'); branchId = required(branchId, 'branchId'); commitId = required(commitId, 'commitId');
        const id = key(sessionId, branchId, commitId); const record = journal.get(id);
        if (!record) return { status: 'missing_journal' };
        if (record.phase === 'committed') return { status: 'already_committed' };
        if (record.phase === 'message_observed') return { status: 'save_uncertain', reason: 'message_already_observed' };
        record.phase = 'cancelled'; cancelled.add(id);
        return { status: 'cancelled' };
    }
    function commit({ sessionId, branchId, commitId } = {}) {
        sessionId = required(sessionId, 'sessionId'); branchId = required(branchId, 'branchId'); commitId = required(commitId, 'commitId');
        const id = key(sessionId, branchId, commitId); const record = journal.get(id);
        if (!record) return { status: 'missing_journal' };
        if (cancelled.has(id) || record.phase === 'cancelled') return { status: 'cancelled' };
        if (record.phase === 'committed') return { status: 'duplicate_commit', result: structuredClone(record.result) };
        if (record.phase === 'evidence_conflict') return { status: 'save_uncertain', reason: 'message_evidence_conflict' };
        if (record.phase !== 'message_observed') return { status: 'save_uncertain', reason: 'message_not_verified' };
        const result = stateStore.commit({ sessionId, branchId, baseVersion: record.baseVersion, commitId, candidate: structuredClone(record.candidate), messageId: record.messageId });
        if (result.status !== 'committed') {
            record.phase = 'save_uncertain'; record.lastFailure = result.status;
            return { status: 'save_uncertain', reason: result.status, details: result };
        }
        record.phase = 'committed'; record.result = structuredClone(result); record.committedAt = new Date().toISOString();
        return structuredClone(result);
    }
    function reconcile({ sessionId, branchId, commitId, observedMessageIds } = {}) {
        sessionId = required(sessionId, 'sessionId'); branchId = required(branchId, 'branchId'); commitId = required(commitId, 'commitId');
        const record = journal.get(key(sessionId, branchId, commitId));
        if (!record) return { status: 'missing_journal' };
        if (record.phase === 'committed') return { status: 'committed', result: structuredClone(record.result) };
        if (record.phase === 'cancelled') return { status: 'cancelled' };
        if (!Array.isArray(observedMessageIds) || observedMessageIds.some(id => typeof id !== 'string')) throw new TypeError('observedMessageIds 必须是文本数组');
        const exists = observedMessageIds.includes(record.messageId);
        if (!exists && record.phase === 'message_observed') { record.phase = 'evidence_conflict'; return { status: 'save_uncertain', reason: 'previously_observed_message_missing' }; }
        if (!exists) { record.phase = 'prepared'; return { status: 'message_absent', retryAllowed: true }; }
        record.phase = 'message_observed';
        return { status: 'message_observed', commitAllowed: true };
    }
    function inspect({ sessionId, branchId, commitId } = {}) {
        const record = journal.get(key(required(sessionId, 'sessionId'), required(branchId, 'branchId'), required(commitId, 'commitId')));
        return record ? structuredClone(record) : { status: 'missing_journal' };
    }
    return Object.freeze({ prepare, markMessage, cancel, commit, reconcile, inspect });
}
