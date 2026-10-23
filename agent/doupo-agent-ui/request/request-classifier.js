const TYPES = new Set(['query', 'conversation', 'explicit_action', 'time_advance', 'due_event', 'historical_operation', 'system_operation', 'unclear']);
const TASKS = new Set(['ordinary_interaction', 'explicit_action', 'complex_action', 'system_operation', 'historical_operation', 'time_advance', 'unclear']);
const MODES = new Set(['read_only', 'proposal', 'action_candidate', 'history_review', 'clarification']);
const MAX_LABELS = 32;

function text(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}

/** Deterministic safety gate for an upstream LLM's structured request interpretation. */
export function createRequestClassifier({ maxLabels = MAX_LABELS } = {}) {
    if (!Number.isInteger(maxLabels) || maxLabels < 1 || maxLabels > 128) throw new RangeError('maxLabels 必须为 1 到 128');
    function classify({ requestId, sessionId, branchId, stateVersion, input, interpretation, playerConfirmed = false } = {}) {
        requestId = text(requestId, 'requestId');
        sessionId = text(sessionId, 'sessionId');
        branchId = text(branchId, 'branchId');
        stateVersion = text(stateVersion, 'stateVersion');
        if (typeof input !== 'string' || !input.trim()) throw new TypeError('input 必须是非空文本');
        if (!interpretation || typeof interpretation !== 'object' || Array.isArray(interpretation)) throw new TypeError('interpretation 必须是结构化对象');
        const { type, task, confidence = null, explicitAction = false, playerAction = null, ambiguities = [], requiredModules = [] } = interpretation;
        if (!TYPES.has(type) || !TASKS.has(task)) return { status: 'needs_review', reason: 'unsupported_classification', requestId, sessionId, branchId, stateVersion };
        if (confidence !== null && (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1)) return { status: 'rejected', reason: 'invalid_confidence', requestId };
        if (!Array.isArray(ambiguities) || ambiguities.length > maxLabels || ambiguities.some(item => typeof item !== 'string' || !item.trim())) return { status: 'rejected', reason: 'invalid_ambiguities', requestId };
        if (!Array.isArray(requiredModules) || requiredModules.length > maxLabels || requiredModules.some(item => typeof item !== 'string' || !item.trim())) return { status: 'rejected', reason: 'invalid_required_modules', requestId };
        if (playerAction !== null && (typeof playerAction !== 'object' || Array.isArray(playerAction))) return { status: 'rejected', reason: 'invalid_player_action', requestId };
        const base = { requestId, sessionId, branchId, stateVersion, type, task, confidence, ambiguities: [...ambiguities], requiredModules: [...new Set(requiredModules)] };
        if (ambiguities.length) return { ...base, status: 'needs_clarification', executionMode: 'clarification', reason: 'material_ambiguity' };
        if (task === 'unclear' || type === 'unclear') return { ...base, status: 'needs_clarification', executionMode: 'clarification', reason: 'unclassified_request' };
        if ((type === 'query' || type === 'conversation') && task !== 'ordinary_interaction') return { ...base, status: 'needs_review', reason: 'inconsistent_type_and_task' };
        if ((type === 'explicit_action' || type === 'time_advance' || type === 'due_event') && !['explicit_action', 'complex_action', 'time_advance'].includes(task)) return { ...base, status: 'needs_review', reason: 'inconsistent_type_and_task' };
        if (task === 'historical_operation' || type === 'historical_operation') return { ...base, status: 'needs_review', executionMode: 'history_review', reason: 'history_operation_requires_verified_mapping' };
        if (task === 'system_operation' || type === 'system_operation') return { ...base, status: 'classified', executionMode: 'read_only', playerAction: null, note: '只识别请求类别；具体系统操作必须由已登记的安全处理器完成。' };
        if (task === 'explicit_action' || task === 'complex_action' || type === 'explicit_action' || type === 'time_advance' || type === 'due_event') {
            if (explicitAction !== true || !playerConfirmed || !playerAction) return { ...base, status: 'needs_clarification', executionMode: 'clarification', reason: 'player_action_confirmation_required' };
            return { ...base, status: 'classified', executionMode: task === 'time_advance' || type === 'time_advance' || type === 'due_event' ? 'proposal' : 'action_candidate', playerAction: structuredClone(playerAction), note: '分类结果允许进入候选流程，不等于行动已执行或结算。' };
        }
        if (!['query', 'conversation'].includes(type) || task !== 'ordinary_interaction') return { ...base, status: 'needs_review', reason: 'inconsistent_type_and_task' };
        return { ...base, status: 'classified', executionMode: 'read_only', playerAction: null };
    }
    return Object.freeze({ classify });
}
