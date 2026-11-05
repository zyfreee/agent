function text(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}

function object(value, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} 必须是对象`);
    return value;
}

/** Converts coordinated NPC decisions into bounded action/world candidates; never commits state. */
export function createNpcOutcomeBridge({ actionResolver, worldSimulator, maxCandidates = 20 } = {}) {
    if (!actionResolver || typeof actionResolver.resolve !== 'function') throw new TypeError('actionResolver 必须提供 resolve');
    if (!worldSimulator || typeof worldSimulator.advance !== 'function') throw new TypeError('worldSimulator 必须提供 advance');
    if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 100) throw new RangeError('maxCandidates 必须为 1 到 100');

    function assertCoordination(coordination) {
        object(coordination, 'coordination');
        if (coordination.status !== 'coordinated') return { ok: false, reason: 'coordination_not_final' };
        if (!Array.isArray(coordination.outcomes)) throw new TypeError('coordination.outcomes 必须是数组');
        const outcomes = coordination.outcomes.filter(item => item?.status === 'coordinated');
        if (outcomes.length > maxCandidates) return { ok: false, reason: 'candidate_limit' };
        const expanded = outcomes.flatMap(outcome => Array.isArray(outcome.decisions) && outcome.decisions.length > 1 ? outcome.decisions.map(decision => ({ ...outcome, decision })) : [outcome]);
        if (expanded.length > maxCandidates) return { ok: false, reason: 'candidate_limit' };
        return { ok: true, outcomes: expanded };
    }

    function toActionCandidates({ coordination, actionDefaults = {}, rules, state } = {}) {
        const check = assertCoordination(coordination);
        if (!check.ok) return { status: 'blocked', reason: check.reason, candidates: [] };
        object(actionDefaults, 'actionDefaults');
        if (!Array.isArray(rules)) throw new TypeError('rules 必须是数组');
        object(state, 'state');
        const candidates = [];
        const rejected = [];
        for (const outcome of check.outcomes) {
            const decision = outcome.decision;
            if (!decision) { rejected.push({ targetId: outcome.targetId, reason: 'missing_decision' }); continue; }
            const method = decision.method ?? actionDefaults.method;
            if (typeof method !== 'string' || !method.trim()) { rejected.push({ npcId: decision.npcId, reason: 'missing_action_method' }); continue; }
            const targetId = decision.targetId ?? outcome.targetId;
            // 外部带来的 actionId/attemptId 只在该 NPC 自己的名字空间里当缓存键：
            // 两个 NPC 撞同一对 ID 时，全局键会让第二个人拿到第一个人的缓存候选。
            // 原始 ID 保留在 sourceActionId/sourceAttemptId 供追溯，不参与缓存定位。
            const sourceActionId = decision.actionId ?? null;
            const sourceAttemptId = decision.attemptId ?? null;
            const actionId = sourceActionId ? `${decision.npcId}:${sourceActionId}` : `${coordination.decisionKey}:${decision.npcId}:${method}`;
            const result = actionResolver.resolve({ ...actionDefaults, actionId, attemptId: sourceAttemptId ? `${decision.npcId}:${sourceAttemptId}` : actionId, sessionId: coordination.sessionId, branchId: coordination.branchId, stateVersion: coordination.stateVersion, actorId: decision.npcId, intent: { targetId, method, explicit: true, authorizedActions: decision.authorizedActions ?? actionDefaults.authorizedActions }, rules, state });
            if (result.status === 'candidate') candidates.push({ ...result, sourceActionId, sourceAttemptId }); else rejected.push({ npcId: decision.npcId, reason: result.reason ?? result.status, result });
        }
        return { status: rejected.length ? (candidates.length ? 'partial' : 'needs_review') : 'candidate', candidates, rejected, committed: false };
    }

    function toWorldCandidates({ coordination, worldContext = {}, processes } = {}) {
        const check = assertCoordination(coordination);
        if (!check.ok) return { status: 'blocked', reason: check.reason, candidates: [] };
        object(worldContext, 'worldContext');
        if (!Array.isArray(processes)) throw new TypeError('processes 必须是数组');
        const selected = [];
        const seen = new Set();
        const fail = reason => ({ status: 'needs_review', reason, candidates: [] });
        for (const { decision } of check.outcomes) {
            // Never synthesize a process: only an explicit, scope-bound proposal can select one.
            const proposed = decision?.process;
            if (!proposed || typeof proposed !== 'object' || Array.isArray(proposed) || typeof proposed.id !== 'string' || !proposed.id.trim()) continue;
            if (seen.has(proposed.id)) return fail('duplicate_world_process');
            seen.add(proposed.id);
            const scope = { sessionId: coordination.sessionId, branchId: coordination.branchId, stateVersion: coordination.stateVersion };
            const mismatched = process => Object.entries(scope).some(([field, value]) => process[field] !== value) || (process.actorId !== undefined && process.actorId !== decision.npcId) || (process.npcId !== undefined && process.npcId !== decision.npcId);
            if (mismatched({ ...scope, ...proposed })) return fail('world_process_scope_mismatch');
            const matches = processes.filter(process => process?.id === proposed.id);
            if (matches.length > 1) return fail('duplicate_world_process');
            if (!matches.length) continue;
            const process = matches[0];
            if (mismatched(process)) return fail('world_process_scope_mismatch');
            if (Object.entries(proposed).some(([key, value]) => key !== 'actorId' && key !== 'npcId' && JSON.stringify(process[key]) !== JSON.stringify(value))) return fail('world_process_payload_mismatch');
            selected.push({ ...process, ...scope, actorId: decision.npcId });
        }
        if (!selected.length) return fail('missing_world_process');
        const result = worldSimulator.advance({ ...worldContext, sessionId: coordination.sessionId, branchId: coordination.branchId, stateVersion: coordination.stateVersion, processes: selected });
        return Object.freeze({ status: result.status, candidates: result.proposals ?? [], conflicts: result.conflicts ?? [], committed: false, result });
    }

    return Object.freeze({ toActionCandidates, toWorldCandidates });
}
