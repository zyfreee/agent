function requiredText(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}

/** Turns an explicit obstacle into a bounded NPC plan re-evaluation request; it never changes plans by itself. */
export function createNpcPlanReassessment({ autonomyPlanner, maxFacts = 12, onRequest } = {}) {
    if (onRequest !== undefined && typeof onRequest !== 'function') throw new TypeError('onRequest 必须是函数');
    if (!autonomyPlanner || typeof autonomyPlanner.getPlan !== 'function' || typeof autonomyPlanner.adjustPlan !== 'function' || typeof autonomyPlanner.transitionPlan !== 'function') throw new TypeError('autonomyPlanner 接口不完整');
    if (!Number.isInteger(maxFacts) || maxFacts < 1 || maxFacts > 100) throw new RangeError('maxFacts 必须为 1 到 100');
    const pending = new Map();
    const clearedPlans = new Set();
    function notify(result) { try { onRequest?.(structuredClone(result)); } catch { /* audit observer failure cannot alter reassessment */ } }
    function keyOf({ sessionId, branchId, stateVersion, npcId, planId, obstacleId }) { return [sessionId, branchId, stateVersion, npcId, planId, obstacleId].join('\u0000'); }
    function planScopeKey({ sessionId, branchId, stateVersion, npcId, planId, version }) { return [sessionId, branchId, stateVersion, npcId, planId, version].join('\u0000'); }
    function clearForPlan({ sessionId, branchId, stateVersion, npcId, planId, version } = {}) {
        sessionId = requiredText(sessionId, 'sessionId'); branchId = requiredText(branchId, 'branchId'); stateVersion = requiredText(stateVersion, 'stateVersion'); npcId = requiredText(npcId, 'npcId'); planId = requiredText(planId, 'planId');
        const currentPlan = autonomyPlanner.getPlan({ sessionId, branchId, stateVersion, npcId, planId });
        const resolvedVersion = version ?? currentPlan?.version;
        if (!Number.isInteger(resolvedVersion) || resolvedVersion < 1) return { status: 'missing_plan', reason: 'plan_not_found', sessionId, branchId, stateVersion, npcId, planId };
        const planKey = planScopeKey({ sessionId, branchId, stateVersion, npcId, planId, version: resolvedVersion });
        if (clearedPlans.has(planKey)) return { status: 'already_cleared', sessionId, branchId, stateVersion, npcId, planId, version: resolvedVersion, cleared: 0 };
        let cleared = 0;
        for (const [key, item] of pending) {
            if (item.sessionId === sessionId && item.branchId === branchId && item.stateVersion === stateVersion && item.npcId === npcId && item.planId === planId && item.planVersion === resolvedVersion) { pending.delete(key); cleared += 1; }
        }
        clearedPlans.add(planKey);
        const result = { status: 'cleared', sessionId, branchId, stateVersion, npcId, planId, version: resolvedVersion, cleared };
        notify(result);
        return result;
    }
    function request({ sessionId, branchId, stateVersion, npcId, planId, obstacle } = {}) {
        sessionId = requiredText(sessionId, 'sessionId');
        branchId = requiredText(branchId, 'branchId');
        stateVersion = requiredText(stateVersion, 'stateVersion');
        npcId = requiredText(npcId, 'npcId');
        planId = requiredText(planId, 'planId');
        if (!obstacle || typeof obstacle !== 'object' || Array.isArray(obstacle)) throw new TypeError('obstacle 必须是对象');
        const obstacleId = requiredText(obstacle.id, 'obstacle.id');
        const reason = requiredText(obstacle.reason, 'obstacle.reason');
        if (!Array.isArray(obstacle.factIds) || !obstacle.factIds.length || obstacle.factIds.length > maxFacts || obstacle.factIds.some(id => typeof id !== 'string' || !id.trim())) { const result = { status: 'needs_review', reason: 'obstacle_evidence_required', obstacleId, npcId, planId, sessionId, branchId, stateVersion }; notify(result); return result; }
        const factIds = [...new Set(obstacle.factIds.map(id => id.trim()))];
        const plan = autonomyPlanner.getPlan({ sessionId, branchId, stateVersion, npcId, planId });
        if (!plan) { const result = { status: 'missing_plan', reason: 'plan_not_found', obstacleId, npcId, planId, sessionId, branchId, stateVersion }; notify(result); return result; }
        if (plan.status !== 'active' && plan.status !== 'paused' && plan.status !== 'needs_redecision') { const result = { status: 'needs_review', reason: 'plan_not_adjustable', planStatus: plan.status, obstacleId, npcId, planId, sessionId, branchId, stateVersion }; notify(result); return result; }
        if (clearedPlans.has(planScopeKey({ sessionId, branchId, stateVersion, npcId, planId, version: plan.version }))) { const result = { status: 'needs_review', reason: 'plan_scope_cleared', obstacleId, npcId, planId, sessionId, branchId, stateVersion }; notify(result); return result; }
        const key = keyOf({ sessionId, branchId, stateVersion, npcId, planId, obstacleId });
        const existing = pending.get(key);
        if (existing && existing.planVersion === plan.version) { const result = { ...structuredClone(existing), status: 'duplicate_reassessment' }; notify(result); return result; }
        const reassessment = { status: 'needs_redecision', sessionId, branchId, stateVersion, obstacleId, npcId, planId, planVersion: plan.version, reason, evidence: { factIds, summary: reason }, proposed: { currentGoal: plan.goal, nextStatus: 'needs_redecision' } };
        pending.set(key, reassessment);
        notify(reassessment);
        return structuredClone(reassessment);
    }
    function transition({ request: reassessment, status, reason } = {}) {
        if (!reassessment || reassessment.status !== 'needs_redecision') return { status: 'rejected', reason: 'reassessment_not_ready' };
        const current = autonomyPlanner.getPlan({ sessionId: reassessment.sessionId, branchId: reassessment.branchId, stateVersion: reassessment.stateVersion, npcId: reassessment.npcId, planId: reassessment.planId });
        if (!current || current.version !== reassessment.planVersion) { const result = { status: 'needs_review', reason: 'plan_version_changed', currentVersion: current?.version ?? null, reassessmentVersion: reassessment.planVersion, sessionId: reassessment.sessionId, branchId: reassessment.branchId, stateVersion: reassessment.stateVersion, obstacleId: reassessment.obstacleId, npcId: reassessment.npcId, planId: reassessment.planId }; notify(result); return result; }
        const result = autonomyPlanner.transitionPlan({ sessionId: reassessment.sessionId, branchId: reassessment.branchId, stateVersion: reassessment.stateVersion, npcId: reassessment.npcId, planId: reassessment.planId, baseVersion: reassessment.planVersion, status, reason, evidence: reassessment.evidence });
        if (result.status === 'transitioned') { pending.delete(keyOf(reassessment)); if (status === 'completed' || status === 'cancelled') clearForPlan({ ...reassessment, version: result.plan.version }); }
        return result;
    }
    function adjust({ request: reassessment, goal, status = 'needs_redecision' } = {}) {
        if (!reassessment || reassessment.status !== 'needs_redecision') return { status: 'rejected', reason: 'reassessment_not_ready' };
        const current = autonomyPlanner.getPlan({ sessionId: reassessment.sessionId, branchId: reassessment.branchId, stateVersion: reassessment.stateVersion, npcId: reassessment.npcId, planId: reassessment.planId });
        if (!current || current.version !== reassessment.planVersion) { const result = { status: 'needs_review', reason: 'plan_version_changed', currentVersion: current?.version ?? null, reassessmentVersion: reassessment.planVersion, sessionId: reassessment.sessionId, branchId: reassessment.branchId, stateVersion: reassessment.stateVersion, obstacleId: reassessment.obstacleId, npcId: reassessment.npcId, planId: reassessment.planId }; notify(result); return result; }
        const result = autonomyPlanner.adjustPlan({ sessionId: reassessment.sessionId, branchId: reassessment.branchId, stateVersion: reassessment.stateVersion, npcId: reassessment.npcId, planId: reassessment.planId, baseVersion: reassessment.planVersion, reason: reassessment.reason, goal, status, evidence: reassessment.evidence });
        if (result.status === 'adjusted') pending.delete(keyOf(reassessment));
        return result;
    }
    return Object.freeze({ request, adjust, transition, clearForPlan });
}
