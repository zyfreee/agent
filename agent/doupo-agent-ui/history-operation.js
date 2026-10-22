const ALLOWED_OPERATIONS = new Set(['rewrite', 'reevaluate']);
const DEFAULT_REASONS = Object.freeze({
    rewrite: '表达改写：保留已核准结果与随机结果，只重新组织正文表达。',
    reevaluate: '重新推演：重新生成结果候选；须重新通过状态版本、权限和事实核验。',
});

function nonEmpty(value, label, max = 160) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new TypeError(`${label} 必须是长度不超过 ${max} 的非空文本`);
    return value.trim();
}

/**
 * Classifies only caller-normalized, explicit history actions. It deliberately does not
 * infer SillyTavern event names or payloads, which vary by host version.
 */
export function classifyHistoryOperation({ operation, operationId, sessionId, branchId, messageId, stateVersion, mappingEvidence } = {}) {
    if (!ALLOWED_OPERATIONS.has(operation)) return Object.freeze({ status: 'unsupported', reason: 'operation_not_explicitly_mapped' });
    for (const [value, name] of [[operationId, 'operationId'], [sessionId, 'sessionId'], [branchId, 'branchId'], [messageId, 'messageId'], [stateVersion, 'stateVersion'], [mappingEvidence, 'mappingEvidence']]) {
        try { nonEmpty(value, name); } catch { return Object.freeze({ status: 'needs_review', reason: `missing_or_invalid_${name}` }); }
    }
    return Object.freeze({
        status: 'classified', operation, operationId: operationId.trim(), sessionId: sessionId.trim(),
        branchId: branchId.trim(), messageId: messageId.trim(), baseStateVersion: stateVersion.trim(),
        mappingEvidence: mappingEvidence.trim(),
        preservesOutcome: operation === 'rewrite',
        preservesRandomResults: operation === 'rewrite',
        reason: DEFAULT_REASONS[operation], committed: false,
    });
}

/** Applies a host-verified event mapping without guessing unknown operation names. */
export function classifyMappedHistoryOperation({ eventName, eventPayload, eventMap, context, mappingEvidence } = {}) {
    if (!eventMap || typeof eventMap !== 'object' || Array.isArray(eventMap)) return Object.freeze({ status: 'unsupported', reason: 'event_map_required' });
    const operation = eventMap[eventName];
    if (!ALLOWED_OPERATIONS.has(operation)) return Object.freeze({ status: 'unsupported', reason: 'event_not_mapped' });
    if (!eventPayload || typeof eventPayload !== 'object' || Array.isArray(eventPayload)) return Object.freeze({ status: 'needs_review', reason: 'event_payload_unrecognized' });
    const messageId = eventPayload.messageId ?? eventPayload.message_id ?? eventPayload.index;
    if (typeof messageId !== 'string' && !(Number.isSafeInteger(messageId) && messageId >= 0)) return Object.freeze({ status: 'needs_review', reason: 'message_id_unrecognized' });
    if (!context || typeof context !== 'object') return Object.freeze({ status: 'needs_review', reason: 'context_required' });
    return classifyHistoryOperation({ operation, operationId: context.operationId, sessionId: context.sessionId, branchId: context.branchId, messageId: String(messageId), stateVersion: context.stateVersion, mappingEvidence });
}
