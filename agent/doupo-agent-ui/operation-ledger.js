const TERMINAL = new Set(['failed_unapplied']);
const EVENTS = new Set(['processing', 'waiting_input', 'completed_saved', 'failed_unapplied', 'save_uncertain', 'history_invalidated']);
function validId(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空字符串`);
    return value.trim();
}
/** Bounded in-memory operation ledger; correlation/deduplication only, not durable persistence. */
export function createOperationLedger({ maxRecords = 2000, maxAttempts = 20 } = {}) {
    if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 50000) throw new RangeError('maxRecords 必须在 1 到 50000 之间');
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) throw new RangeError('maxAttempts 必须在 1 到 100 之间');
    const operations = new Map();
    function start({ operationId, sessionId, branchId, triggerMessageId, stateVersion, taskId, timestamp = Date.now() } = {}) {
        operationId = validId(operationId, 'operationId');
        sessionId = validId(sessionId, 'sessionId');
        branchId = validId(branchId, 'branchId');
        triggerMessageId = validId(triggerMessageId, 'triggerMessageId');
        taskId = validId(taskId, 'taskId');
        stateVersion = validId(stateVersion, 'stateVersion');
        if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new TypeError('timestamp 必须是非负安全整数');
        const previous = operations.get(operationId);
        if (previous) {
            if (previous.sessionId !== sessionId || previous.branchId !== branchId || previous.triggerMessageId !== triggerMessageId) throw new Error('operationId 已存在但关联身份不一致');
            if (previous.status === 'failed_unapplied' && previous.attempts >= maxAttempts) return { accepted: false, reason: 'attempt_limit', record: { ...previous } };
            if (previous.status === 'processing' || previous.status === 'waiting_input' || previous.status === 'save_uncertain' || previous.status === 'completed_saved' || previous.attempts >= maxAttempts) return { accepted: false, reason: 'duplicate_operation', record: { ...previous } };
            const record = { ...previous, taskId, stateVersion, attempts: previous.attempts + 1, status: 'processing', updatedAt: timestamp, terminalReason: undefined };
            operations.set(operationId, record);
            return { accepted: true, record: { ...record }, retry: true };
        }
        const record = { operationId, sessionId, branchId, triggerMessageId, taskId, stateVersion, attempts: 1, status: 'processing', createdAt: timestamp, updatedAt: timestamp };
        operations.set(operationId, record);
        while (operations.size > maxRecords) operations.delete(operations.keys().next().value);
        return { accepted: true, record: { ...record }, retry: false };
    }
    function update(operationId, status, { sessionId, branchId, stateVersion, timestamp = Date.now(), reason } = {}) {
        operationId = validId(operationId, 'operationId');
        if (!EVENTS.has(status)) throw new TypeError('不支持的操作状态');
        const current = operations.get(operationId);
        if (!current) return { accepted: false, reason: 'unknown_operation' };
        if (TERMINAL.has(current.status)) return { accepted: false, reason: 'operation_terminal' };
        if (sessionId !== undefined && sessionId !== current.sessionId) return { accepted: false, reason: 'session_mismatch' };
        if (branchId !== undefined && branchId !== current.branchId) return { accepted: false, reason: 'branch_mismatch' };
        if (stateVersion !== undefined && stateVersion !== current.stateVersion) return { accepted: false, reason: 'state_version_mismatch' };
        if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new TypeError('timestamp 必须是非负安全整数');
        const next = { ...current, status, updatedAt: timestamp, terminalReason: TERMINAL.has(status) && typeof reason === 'string' ? reason.slice(0, 240) : undefined };
        operations.set(operationId, next);
        return { accepted: true, record: { ...next } };
    }
    function get(operationId) { const row = operations.get(operationId); return row ? { ...row } : undefined; }
    function list({ sessionId, branchId, limit = 100 } = {}) {
        if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new RangeError('limit 必须在 1 到 500 之间');
        return [...operations.values()].filter(row => sessionId === undefined || row.sessionId === sessionId).filter(row => branchId === undefined || row.branchId === branchId).slice(-limit).reverse().map(row => ({ ...row }));
    }
    function clear() { const count = operations.size; operations.clear(); return count; }
    return Object.freeze({ start, update, get, list, clear });
}
