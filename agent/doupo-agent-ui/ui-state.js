const READ_STATES = new Set(['loading', 'ready', 'empty', 'stale', 'failed']);
const ACTIONS = new Set(['view_task', 'view_location', 'use_item', 'start_action', 'continue_action', 'interrupt_action', 'explain_change']);

function text(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}

/** Stores player-visible projections and safe action intents; it never writes world state. */
export function createUiState({ maxVisibleChanges = 50, maxActions = 100 } = {}) {
    if (!Number.isInteger(maxVisibleChanges) || maxVisibleChanges < 1 || maxVisibleChanges > 500) throw new RangeError('maxVisibleChanges 必须为 1 到 500');
    if (!Number.isInteger(maxActions) || maxActions < 1 || maxActions > 1000) throw new RangeError('maxActions 必须为 1 到 1000');
    const projections = new Map();
    const actionRequests = new Map();
    const terminal = new Set(['completed', 'failed', 'cancelled']);

    function updateProjection({ sessionId, branchId, stateVersion, readState, data = {}, source, visibleFactIds = [], changes = [] } = {}) {
        sessionId = text(sessionId, 'sessionId'); branchId = text(branchId, 'branchId'); stateVersion = text(stateVersion, 'stateVersion');
        if (!READ_STATES.has(readState)) throw new TypeError(`readState 无效：${readState}`);
        if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('data 必须是对象');
        if (!Array.isArray(visibleFactIds) || !Array.isArray(changes)) throw new TypeError('visibleFactIds/changes 必须是数组');
        if (visibleFactIds.length > 10000 || visibleFactIds.some(id => typeof id !== 'string' || !id.trim())) throw new TypeError('visibleFactIds 必须是有界文本数组');
        const key = `${sessionId}\u0000${branchId}`;
        const projection = { sessionId, branchId, stateVersion, readState, data: structuredClone(data), source: source ?? null,
            visibleFactIds: [...new Set(visibleFactIds.map(String))], changes: structuredClone(changes.slice(0, maxVisibleChanges)), truncated: changes.length > maxVisibleChanges };
        projections.set(key, projection);
        return structuredClone(projection);
    }

    function getProjection({ sessionId, branchId } = {}) {
        const item = projections.get(`${sessionId}\u0000${branchId}`);
        return item ? structuredClone(item) : undefined;
    }

    function requestAction({ requestId, sessionId, branchId, stateVersion, action, targetId, payload = {} } = {}) {
        requestId = text(requestId, 'requestId'); sessionId = text(sessionId, 'sessionId'); branchId = text(branchId, 'branchId'); stateVersion = text(stateVersion, 'stateVersion');
        action = text(action, 'action'); targetId = text(targetId, 'targetId');
        if (!ACTIONS.has(action)) return { accepted: false, reason: 'unsupported_action', requestId };
        if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('payload 必须是对象');
        const key = `${sessionId}\u0000${branchId}\u0000${requestId}`;
        const previous = actionRequests.get(key);
        if (previous) return { accepted: false, reason: 'duplicate_request', requestId, existing: structuredClone(previous) };
        if (actionRequests.size >= maxActions) return { accepted: false, reason: 'action_limit', requestId };
        const projection = projections.get(`${sessionId}\u0000${branchId}`);
        if (!projection) return { accepted: false, reason: 'projection_unavailable', requestId };
        if (projection.stateVersion !== stateVersion) return { accepted: false, reason: 'stale_projection', requestId, currentVersion: projection.stateVersion };
        const request = { requestId, sessionId, branchId, stateVersion, action, targetId, payload: structuredClone(payload), status: 'submitted', submitted: true, executed: false };
        actionRequests.set(key, request);
        return { accepted: true, request: structuredClone(request) };
    }

    function markAction(requestId, status, details = {}, scope = {}) {
        requestId = text(requestId, 'requestId');
        if (!['accepted', 'rejected', 'completed', 'failed', 'cancelled'].includes(status)) throw new TypeError(`action status 无效：${status}`);
        if (details === null || typeof details !== 'object' || Array.isArray(details)) throw new TypeError('details 必须是对象');
        const candidates = [...actionRequests.entries()].filter(([, request]) => request.requestId === requestId
            && (!scope.sessionId || request.sessionId === scope.sessionId)
            && (!scope.branchId || request.branchId === scope.branchId));
        if (candidates.length !== 1) return { status: candidates.length ? 'ambiguous_request' : 'unknown_request', requestId };
        const [key, request] = candidates[0];
        if (terminal.has(request.status)) return { status: request.status === status ? 'duplicate_update' : 'terminal_request', requestId, currentStatus: request.status };
        if (request.status === 'submitted' && ['completed', 'failed'].includes(status)) return { status: 'invalid_transition', requestId, currentStatus: request.status };
        if (request.status === 'accepted' && status === 'accepted') return { status: 'duplicate_update', requestId };
        const next = { ...request, status, executed: status === 'completed', details: structuredClone(details) };
        actionRequests.set(key, next);
        return structuredClone(next);
    }

    function clearBranch(sessionId, branchId) {
        const prefix = `${sessionId}\u0000${branchId}`;
        projections.delete(prefix);
        let removed = 0;
        for (const key of actionRequests.keys()) if (key.startsWith(`${prefix}\u0000`)) { actionRequests.delete(key); removed++; }
        return removed;
    }
    function clear() { projections.clear(); actionRequests.clear(); }
    return Object.freeze({ updateProjection, getProjection, requestAction, markAction, clearBranch, clear });
}
