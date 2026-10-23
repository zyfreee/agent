const INVALIDATE_EVENTS = ['MESSAGE_EDITED', 'MESSAGE_DELETED'];
const UNSCOPED_HISTORY_EVENTS = ['MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_SWIPE_DELETED'];
const SAFE_SCOPE = Object.freeze({ sessionId: null, branchId: null, taskIds: Object.freeze([]) });

function parseMessageIndex(payload) {
    const valid = value => Number.isSafeInteger(value) && value >= 0;
    if (valid(payload)) return payload;
    if (Array.isArray(payload) && valid(payload[0])) return payload[0];
    if (!payload || typeof payload !== 'object') return undefined;
    for (const key of ['messageId', 'message_id', 'index', 'mesId']) if (valid(payload[key])) return payload[key];
    return undefined;
}

/**
 * Connects version-provided event constants to pending turn invalidation.
 * Payload parsing is intentionally limited to numeric message indexes until a target ST runtime is identified.
 */
export function createHistoryEventAdapter({ eventSource, eventTypes, pipeline, getScope, onUnresolved = () => {}, onInvalidated = () => {}, invalidateCandidate = () => ({ status: 'not_configured' }) } = {}) {
    if (!eventSource || typeof eventSource.on !== 'function' || typeof eventSource.removeListener !== 'function') throw new TypeError('eventSource 必须提供 on/removeListener');
    if (!eventTypes || typeof eventTypes !== 'object') throw new TypeError('eventTypes 必须是宿主事件常量对象');
    if (typeof pipeline?.invalidate !== 'function' || typeof pipeline?.inspect !== 'function') throw new TypeError('pipeline 必须提供 invalidate/inspect');
    if (typeof getScope !== 'function') throw new TypeError('getScope 必须是函数');
    if (typeof onUnresolved !== 'function') throw new TypeError('onUnresolved 必须是函数');
    if (typeof onInvalidated !== 'function') throw new TypeError('onInvalidated 必须是函数');
    if (typeof invalidateCandidate !== 'function') throw new TypeError('invalidateCandidate 必须是函数');

    let active = false;
    let currentScope;
    const bindings = [];
    const invalidated = new Set();

    function readScope() {
        const scope = getScope();
        return scope && typeof scope.sessionId === 'string' && typeof scope.branchId === 'string' ? scope : SAFE_SCOPE;
    }

    function onHistoryChanged(eventName, ...args) {
        const isUnscoped = UNSCOPED_HISTORY_EVENTS.includes(eventName);
        const messageIndex = parseMessageIndex(args[0]);
        const current = readScope();
        const previous = currentScope && typeof currentScope.sessionId === 'string' && typeof currentScope.branchId === 'string' ? currentScope : SAFE_SCOPE;
        const scope = current !== SAFE_SCOPE ? current : previous;
        const scopeIsValid = scope !== SAFE_SCOPE;
        const targetTasks = scope.taskIds ?? [];
        for (const taskId of targetTasks) {
            const task = pipeline.inspect(taskId);
            if (!task || task.status === 'missing_task') continue;
            if (scopeIsValid && (task.sessionId !== scope.sessionId || task.branchId !== scope.branchId)) continue;
            if (!scopeIsValid && task.sessionId !== undefined && task.branchId !== undefined && (task.sessionId !== scope.sessionId || task.branchId !== scope.branchId)) continue;
            if (messageIndex === undefined && !isUnscoped) continue;
            if (messageIndex !== undefined && task.triggerMessageId !== String(messageIndex) && task.triggerMessageId !== messageIndex) continue;
            const result = pipeline.invalidate(taskId, { reason: messageIndex === undefined ? 'history_changed_unidentified' : 'trigger_message_changed' });
            if (result.status === 'invalidated') { invalidated.add(taskId); const candidate = invalidateCandidate({ requestId: taskId, reason: messageIndex === undefined ? 'history_changed_unidentified' : 'trigger_message_changed' }); onInvalidated({ taskId, messageIndex, result, candidate, event: eventName }); }
            else if (result.status === 'already_committed') onUnresolved({ taskId, messageIndex, result, event: 'history_changed_after_commit' });
        }
    }

    const handlerByEvent = new Map();

    function onChatChanged(...args) {
        const previous = currentScope;
        const next = getScope();
        if (previous && next && (previous.sessionId !== next.sessionId || previous.branchId !== next.branchId)) {
            for (const taskId of previous.taskIds ?? []) {
                const task = pipeline.inspect(taskId);
                if (!task || task.status === 'missing_task' || task.sessionId !== previous.sessionId || task.branchId !== previous.branchId) continue;
                const result = pipeline.invalidate(taskId, { reason: 'chat_or_branch_changed' });
                if (result.status === 'invalidated') { invalidated.add(taskId); const candidate = invalidateCandidate({ requestId: taskId, reason: 'chat_or_branch_changed' }); onInvalidated({ taskId, messageIndex: undefined, result, candidate, event: 'scope_changed' }); }
                else if (result.status === 'already_committed') onUnresolved({ taskId, messageIndex: undefined, result, event: 'scope_changed_after_commit', args });
            }
        } else if (previous && (!next || typeof next.sessionId !== 'string' || typeof next.branchId !== 'string')) {
            for (const taskId of previous.taskIds ?? []) {
                const task = pipeline.inspect(taskId);
                if (!task || task.status === 'missing_task' || task.sessionId !== previous.sessionId || task.branchId !== previous.branchId) continue;
                const result = pipeline.invalidate(taskId, { reason: 'history_scope_unavailable' });
                if (result.status === 'invalidated') { invalidated.add(taskId); const candidate = invalidateCandidate({ requestId: taskId, reason: 'history_scope_unavailable' }); onInvalidated({ taskId, messageIndex: undefined, result, candidate, event: 'scope_unavailable' }); }
                else if (result.status === 'already_committed') onUnresolved({ taskId, messageIndex: undefined, result, event: 'scope_unavailable_after_commit', args });
            }
        }
        currentScope = next;
    }

    function refreshScope() {
        if (!active) return { status: 'inactive' };
        onChatChanged();
        return { status: 'refreshed' };
    }

    function start() {
        if (active) return { status: 'already_active' };
        active = true;
        currentScope = getScope();
        const seen = new Set();
        for (const name of [...INVALIDATE_EVENTS, ...UNSCOPED_HISTORY_EVENTS]) {
            const eventName = eventTypes[name];
            if (typeof eventName !== 'string' || !eventName || seen.has(eventName)) continue;
            seen.add(eventName);
            const handler = (...args) => onHistoryChanged(name, ...args);
            eventSource.on(eventName, handler);
            bindings.push(eventName);
            handlerByEvent.set(eventName, handler);
        }
        const chatChanged = eventTypes.CHAT_CHANGED;
        if (typeof chatChanged === 'string' && chatChanged && !seen.has(chatChanged)) {
            eventSource.on(chatChanged, onChatChanged);
            bindings.push(chatChanged);
            handlerByEvent.set(chatChanged, onChatChanged);
        }
        return { status: 'active', eventCount: bindings.length };
    }

    function stop() {
        if (!active) return { status: 'inactive' };
        active = false;
        for (const eventName of bindings.splice(0)) {
            const handler = handlerByEvent.get(eventName);
            if (handler) eventSource.removeListener(eventName, handler);
            handlerByEvent.delete(eventName);
        }
        currentScope = undefined;
        return { status: 'stopped' };
    }

    return Object.freeze({ start, stop, refreshScope, get active() { return active; }, get invalidatedTaskIds() { return [...invalidated]; } });
}
