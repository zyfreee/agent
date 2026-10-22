function text(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}

function object(value, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} 必须是对象`);
    return value;
}

/** Validates NPC-derived candidates immediately before the existing commit boundary. */
export function createNpcCommitGate({ autonomyPlanner, stateStore, maxCandidates = 20 } = {}) {
    if (!autonomyPlanner || typeof autonomyPlanner.getPlan !== 'function') throw new TypeError('autonomyPlanner 必须提供 getPlan');
    if (!stateStore || typeof stateStore.read !== 'function') throw new TypeError('stateStore 必须提供 read');
    if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 100) throw new RangeError('maxCandidates 必须为 1 到 100');

    function check({ sessionId, branchId, stateVersion, candidates = [] } = {}) {
        sessionId = text(sessionId, 'sessionId'); branchId = text(branchId, 'branchId'); stateVersion = text(stateVersion, 'stateVersion');
        if (!Array.isArray(candidates) || candidates.length > maxCandidates) throw new TypeError('candidates 必须是有界数组');
        const current = stateStore.read({ sessionId, branchId });
        if (!current?.stateVersion) return { status: 'blocked', reason: 'missing_branch', accepted: [], rejected: [] };
        if (current.stateVersion !== stateVersion) return { status: 'stale_state', reason: 'state_version_mismatch', currentVersion: current.stateVersion, accepted: [], rejected: [] };
        const accepted = [];
        const rejected = [];
        const seen = new Set();
        for (const candidate of candidates) {
            object(candidate, 'candidate');
            const npcId = text(candidate.npcId ?? candidate.actorId, 'candidate.npcId');
            const planId = text(candidate.planId, 'candidate.planId');
            const key = `${npcId}\u0000${planId}`;
            if (seen.has(key)) { rejected.push({ npcId, planId, reason: 'duplicate_candidate' }); continue; }
            seen.add(key);
            if (candidate.sessionId !== sessionId || candidate.branchId !== branchId || candidate.stateVersion !== stateVersion) { rejected.push({ npcId, planId, reason: 'candidate_scope_mismatch' }); continue; }
            if (candidate.committed === true) { rejected.push({ npcId, planId, reason: 'already_committed' }); continue; }
            if (!Number.isInteger(candidate.planVersion) || candidate.planVersion < 1) { rejected.push({ npcId, planId, reason: 'missing_plan_version' }); continue; }
            const plan = autonomyPlanner.getPlan({ sessionId, branchId, stateVersion, npcId, planId });
            if (!plan) { rejected.push({ npcId, planId, reason: 'plan_not_found' }); continue; }
            if (plan.version !== candidate.planVersion) { rejected.push({ npcId, planId, reason: 'plan_version_mismatch', currentVersion: plan.version }); continue; }
            if (plan.status !== 'active') { rejected.push({ npcId, planId, reason: 'plan_not_active', planStatus: plan.status }); continue; }
            accepted.push(Object.freeze({ candidate, planVersion: plan.version, planId, npcId }));
        }
        return { status: rejected.length ? (accepted.length ? 'partial' : 'needs_review') : 'ready', accepted, rejected, stateVersion };
    }
    return Object.freeze({ check });
}
