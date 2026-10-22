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
        return { ok: true, outcomes };
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
            const actionId = decision.actionId ?? `${coordination.decisionKey}:${decision.npcId}:${method}`;
            const result = actionResolver.resolve({ ...actionDefaults, actionId, attemptId: decision.attemptId ?? actionId, sessionId: coordination.sessionId, branchId: coordination.branchId, stateVersion: coordination.stateVersion, actorId: decision.npcId, intent: { targetId, method, explicit: true, authorizedActions: decision.authorizedActions ?? actionDefaults.authorizedActions }, rules, state });
            if (result.status === 'candidate') candidates.push(result); else rejected.push({ npcId: decision.npcId, reason: result.reason ?? result.status, result });
        }
        return { status: rejected.length ? (candidates.length ? 'partial' : 'needs_review') : 'candidate', candidates, rejected, committed: false };
    }

    function toWorldCandidates({ coordination, worldContext = {}, processes } = {}) {
        const check = assertCoordination(coordination);
        if (!check.ok) return { status: 'blocked', reason: check.reason, candidates: [] };
        object(worldContext, 'worldContext');
        if (!Array.isArray(processes)) throw new TypeError('processes 必须是数组');
        const relevant = check.outcomes.map(outcome => outcome.decision).filter(Boolean).map(decision => ({
            ...decision.process,
            id: decision.process?.id ?? `${coordination.decisionKey}:${decision.npcId}`,
            sessionId: coordination.sessionId,
            branchId: coordination.branchId,
            stateVersion: coordination.stateVersion,
            // NPC 的决定已经在协调阶段完成；只有明确附带 process 才能进入世界候选。
            requiresIndividualDecision: decision.process?.requiresIndividualDecision === true,
        }));
        const allowed = new Set(relevant.map(item => item.id));
        const selected = processes.filter(process => allowed.has(process.id));
        if (!selected.length) return { status: 'needs_review', reason: 'missing_world_process', candidates: [] };
        const result = worldSimulator.advance({ ...worldContext, sessionId: coordination.sessionId, branchId: coordination.branchId, stateVersion: coordination.stateVersion, processes: selected });
        return Object.freeze({ status: result.status, candidates: result.proposals ?? [], conflicts: result.conflicts ?? [], committed: false, result });
    }

    return Object.freeze({ toActionCandidates, toWorldCandidates });
}
