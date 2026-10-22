const INTENTS = new Set(['accept', 'refuse', 'ask', 'condition', 'wait', 'continue_plan', 'action_intent']);

function nonempty(value, key) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${key} 必须是非空文本`);
    return value.trim();
}

/** Validates a model-proposed NPC decision against an explicitly supplied knowledge/authority envelope. */
export function createNpcDecisionGuard({ maxEvidence = 12, maxPlans = 100 } = {}) {
    if (!Number.isInteger(maxEvidence) || maxEvidence < 1 || maxEvidence > 100) throw new RangeError('maxEvidence 必须为 1 到 100');
    if (!Number.isInteger(maxPlans) || maxPlans < 1 || maxPlans > 10000) throw new RangeError('maxPlans 必须为 1 到 10000');
    const decisions = new Map();
    const plans = new Map();

    function review({ sessionId, branchId, taskId, stateVersion, npcId, permission, envelope, proposal } = {}) {
        sessionId = nonempty(sessionId, 'sessionId'); branchId = nonempty(branchId, 'branchId');
        taskId = nonempty(taskId, 'taskId'); stateVersion = nonempty(stateVersion, 'stateVersion'); npcId = nonempty(npcId, 'npcId');
        if (!permission || permission.npcId !== npcId || permission.allowed !== true) return { status: 'blocked', reason: 'missing_decision_authority', npcId, taskId };
        if (!envelope || envelope.npcId !== npcId || !Array.isArray(envelope.knownFactIds)) throw new TypeError('必须提供与该 NPC 匹配的有效知情范围');
        if (envelope.knownFactIds.length > 10000 || envelope.knownFactIds.some(id => typeof id !== 'string' || !id.trim())) throw new TypeError('knownFactIds 必须是有界文本数组');
        if (permission.allowedIntents !== undefined && (!Array.isArray(permission.allowedIntents) || permission.allowedIntents.some(item => !INTENTS.has(item)))) throw new TypeError('allowedIntents 无效');
        if (permission.allowedIntents && !permission.allowedIntents.includes(proposal?.intent)) return { status: 'blocked', reason: 'intent_not_permitted', npcId, taskId };
        if ((permission.stateVersion && permission.stateVersion !== stateVersion) || (envelope.stateVersion && envelope.stateVersion !== stateVersion)) return { status: 'stale_state', reason: 'authority_or_knowledge_version_mismatch', npcId, taskId };
        if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) throw new TypeError('proposal 必须是对象');
        if (!INTENTS.has(proposal.intent)) return { status: 'needs_review', reason: 'unsupported_intent', npcId, taskId };
        const evidence = Array.isArray(proposal.evidenceFactIds) ? proposal.evidenceFactIds : [];
        if (evidence.length > maxEvidence) return { status: 'needs_review', reason: 'evidence_budget_exceeded', npcId, taskId };
        const allowedFacts = new Set(envelope.knownFactIds);
        const hidden = evidence.filter(id => !allowedFacts.has(id));
        if (hidden.length) return { status: 'rejected', reason: 'out_of_knowledge_scope', npcId, taskId, rejectedFactIds: hidden };
        const key = `${sessionId}\u0000${branchId}\u0000${taskId}\u0000${npcId}`;
        const previous = decisions.get(key);
        if (previous) return { ...structuredClone(previous), replayed: true };
        const base = { sessionId, branchId, taskId, stateVersion, npcId, intent: proposal.intent,
            evidenceFactIds: [...new Set(evidence)], rationale: typeof proposal.rationale === 'string' ? proposal.rationale : '',
            createdAt: typeof proposal.createdAt === 'string' ? proposal.createdAt : null,
            formalFact: false, executed: false, committed: false };
        if (proposal.intent === 'action_intent') {
            if (!proposal.action || typeof proposal.action !== 'object') return { status: 'needs_review', reason: 'action_intent_missing_payload', npcId, taskId };
            const action = { targetId: proposal.action.targetId, method: proposal.action.method };
            if (typeof action.targetId !== 'string' || !action.targetId.trim() || typeof action.method !== 'string' || !action.method.trim()) return { status: 'needs_review', reason: 'invalid_action_intent', npcId, taskId };
            if (permission.allowedActions !== undefined && (!Array.isArray(permission.allowedActions) || permission.allowedActions.length > 100 || permission.allowedActions.some(item => typeof item !== 'string'))) throw new TypeError('allowedActions 必须是有界文本数组');
            const actionKey = `${action.targetId.trim()}:${action.method.trim()}`;
            if (permission.allowedActions && !permission.allowedActions.includes(actionKey)) return { status: 'blocked', reason: 'action_not_permitted', npcId, taskId };
            base.actionIntent = { targetId: action.targetId.trim(), method: action.method.trim() };
            base.authorizedAction = permission.allowedActions ? actionKey : null;
            base.status = proposal.requiresPlayerResponse === true ? 'waiting_player' : 'action_proposed';
            base.pauseBeforeAction = proposal.requiresPlayerResponse === true;
        } else if (proposal.intent === 'condition') {
            if (typeof proposal.condition !== 'string' || !proposal.condition.trim()) return { status: 'needs_review', reason: 'condition_missing', npcId, taskId };
            base.condition = proposal.condition.trim();
            base.status = proposal.requiresPlayerResponse === true ? 'waiting_player' : 'decision_proposed';
            base.pauseBeforeAction = proposal.requiresPlayerResponse === true;
        } else {
            base.status = proposal.requiresPlayerResponse === true ? 'waiting_player' : 'decision_proposed';
            base.pauseBeforeAction = proposal.requiresPlayerResponse === true;
        }
        if (proposal.plan) {
            if (plans.size >= maxPlans && !plans.has(`${sessionId}\u0000${branchId}\u0000${npcId}\u0000${proposal.plan.id}`)) return { status: 'blocked', reason: 'plan_limit', npcId, taskId };
            if (typeof proposal.plan.id !== 'string' || !proposal.plan.id.trim() || typeof proposal.plan.goal !== 'string' || !proposal.plan.goal.trim()) return { status: 'needs_review', reason: 'invalid_plan' };
            const planKey = `${sessionId}\u0000${branchId}\u0000${npcId}\u0000${proposal.plan.id}`;
            const existing = plans.get(planKey);
            if (existing && proposal.plan.baseVersion !== existing.version) return { status: 'needs_review', reason: 'plan_version_conflict', npcId, taskId, planId: proposal.plan.id };
            const nextVersion = (existing?.version ?? 0) + 1;
            const plan = { id: proposal.plan.id, goal: proposal.plan.goal, status: proposal.plan.status ?? 'proposed', version: nextVersion,
                previousGoal: existing?.goal ?? null, formal: false, executed: false };
            plans.set(planKey, plan);
            base.plan = { ...plan };
        }
        decisions.set(key, base);
        return structuredClone(base);
    }

    function getPlan({ sessionId, branchId, npcId, planId } = {}) {
        const plan = plans.get([sessionId, branchId, npcId, planId].join('\u0000'));
        return plan ? { ...plan } : undefined;
    }
    function listPlans({ sessionId, branchId, npcId } = {}) {
        return [...plans.entries()].filter(([key]) => (!sessionId || key.startsWith(`${sessionId}\u0000`)) && (!branchId || key.includes(`\u0000${branchId}\u0000`)) && (!npcId || key.includes(`\u0000${npcId}\u0000`))).map(([, plan]) => ({ ...plan }));
    }
    function clearBranch(sessionId, branchId) {
        const prefix = `${sessionId}\u0000${branchId}\u0000`;
        let removed = 0;
        for (const key of decisions.keys()) if (key.startsWith(prefix)) { decisions.delete(key); removed++; }
        for (const key of plans.keys()) if (key.startsWith(prefix)) plans.delete(key);
        return removed;
    }
    function clear() { decisions.clear(); plans.clear(); }
    return Object.freeze({ review, getPlan, listPlans, clearBranch, clear });
}
