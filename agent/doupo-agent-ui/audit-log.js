const MAX_LIMIT = 20000;
const EVENTS = new Set(['task_start', 'stage_start', 'stage_complete', 'stage_failed', 'task_cancelled', 'candidate_ready', 'quality_rejected', 'narrative_rejected', 'awaiting_message_evidence', 'commit_complete', 'commit_uncertain', 'npc_plan_reassessment_requested', 'npc_plan_reassessment_duplicate', 'npc_plan_reassessment_blocked', 'npc_plan_reassessment_cleared', 'npc_plan_candidates_invalidated', 'narrative_candidates_invalidated', 'history_changed_after_commit', 'history_candidate_invalidated']);
function text(value, name) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`); return value.trim(); }

/** Bounded, read-only local audit metadata. Does not persist input, prompt, secret, or narrative text. */
export function createAuditLog({ maxEntries = 5000 } = {}) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > MAX_LIMIT) throw new RangeError('maxEntries 必须是 1 到 20000');
    const records = [];
    function record(raw = {}) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('审计事件必须是对象');
        const event = text(raw.event, 'event');
        if (!EVENTS.has(event)) throw new TypeError(`不允许的审计事件：${event}`);
        const item = Object.freeze({ taskId: text(raw.taskId, 'taskId'), sessionId: text(raw.sessionId, 'sessionId'), branchId: text(raw.branchId, 'branchId'), stateVersion: text(raw.stateVersion, 'stateVersion'), event, stage: typeof raw.stage === 'string' ? raw.stage : null, outcome: typeof raw.outcome === 'string' ? raw.outcome : 'unknown', npcId: typeof raw.npcId === 'string' ? raw.npcId : null, planId: typeof raw.planId === 'string' ? raw.planId : null, planVersion: Number.isInteger(raw.planVersion) ? raw.planVersion : null, currentPlanVersion: Number.isInteger(raw.currentPlanVersion) ? raw.currentPlanVersion : null, timestamp: Number.isFinite(raw.timestamp) ? raw.timestamp : Date.now() });
        if (records.length === maxEntries) records.shift();
        records.push(item);
        return { status: 'recorded', count: records.length };
    }
    function list({ taskId, sessionId, branchId, limit = 500 } = {}) {
        if (!Number.isInteger(limit) || limit < 1 || limit > 2000) throw new RangeError('limit 必须是 1 到 2000');
        return records.filter(item => (taskId === undefined || item.taskId === taskId) && (sessionId === undefined || item.sessionId === sessionId) && (branchId === undefined || item.branchId === branchId)).slice(-limit).map(item => ({ ...item }));
    }
    function clear() { const count = records.length; records.length = 0; return count; }
    return Object.freeze({ record, list, clear });
}
