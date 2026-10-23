const DEFAULT_MAX_NPCS = 8;
const DEFAULT_MAX_FACTS = 12;

function requiredText(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}

function boundedTextList(value, name, max) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > max || value.some(item => typeof item !== 'string' || !item.trim())) throw new TypeError(`${name} 必须是有界文本数组`);
    return [...new Set(value.map(item => item.trim()))];
}

/** Selects relevant NPC decision requests from a bounded world event; it never executes or commits a decision. */
export function createNpcAutonomyPlanner({ maxNpcs = DEFAULT_MAX_NPCS, maxFacts = DEFAULT_MAX_FACTS } = {}) {
    if (!Number.isInteger(maxNpcs) || maxNpcs < 1 || maxNpcs > 100) throw new RangeError('maxNpcs 必须为 1 到 100');
    if (!Number.isInteger(maxFacts) || maxFacts < 1 || maxFacts > 100) throw new RangeError('maxFacts 必须为 1 到 100');
    const planned = new Set();
    const decisions = new Map();
    const plans = new Map();
    const planListeners = new Set();
    function notifyPlanChange(change) {
        for (const listener of planListeners) {
            try { listener(structuredClone(change)); } catch { /* observer failure cannot alter plan state */ }
        }
    }

    function plan({ sessionId, branchId, taskId, stateVersion, event, npcs = [] } = {}) {
        sessionId = requiredText(sessionId, 'sessionId');
        branchId = requiredText(branchId, 'branchId');
        taskId = requiredText(taskId, 'taskId');
        stateVersion = requiredText(stateVersion, 'stateVersion');
        if (!event || typeof event !== 'object' || Array.isArray(event)) throw new TypeError('event 必须是对象');
        const eventId = requiredText(event.id, 'event.id');
        const eventType = requiredText(event.type, 'event.type');
        const relatedNpcIds = boundedTextList(event.relatedNpcIds, 'event.relatedNpcIds', 100);
        const facts = boundedTextList(event.factIds, 'event.factIds', maxFacts);
        if (!Array.isArray(npcs) || npcs.length > 100) throw new TypeError('npcs 必须是有界数组');
        const related = relatedNpcIds.length ? new Set(relatedNpcIds) : null;
        const selected = [];
        const skipped = [];
        for (const npc of npcs) {
            if (!npc || typeof npc !== 'object' || Array.isArray(npc)) throw new TypeError('NPC 条目必须是对象');
            const npcId = requiredText(npc.id, 'npc.id');
            const triggerTypes = boundedTextList(npc.triggerTypes, 'npc.triggerTypes', 50);
            const relevant = (!related || related.has(npcId)) && (!triggerTypes.length || triggerTypes.includes(eventType));
            if (!relevant) { skipped.push({ npcId, reason: 'not_relevant' }); continue; }
            if (selected.length >= maxNpcs) { skipped.push({ npcId, reason: 'npc_budget_exceeded' }); continue; }
            const key = `${sessionId}\u0000${branchId}\u0000${stateVersion}\u0000${eventId}\u0000${npcId}`;
            if (planned.has(key)) { skipped.push({ npcId, reason: 'duplicate_trigger' }); continue; }
            planned.add(key);
            selected.push({
                npcId, eventId, eventType, taskId, sessionId, branchId, stateVersion,
                reason: typeof npc.relevanceReason === 'string' ? npc.relevanceReason.trim() : 'event_matches_npc_scope',
                decisionInput: Object.freeze({ npcId, goalIds: boundedTextList(npc.goalIds, 'npc.goalIds', 50), knownFactIds: boundedTextList(npc.knownFactIds, 'npc.knownFactIds', maxFacts), eventFactIds: facts, eventType }),
                status: 'decision_required', executed: false, committed: false,
            });
        }
        return Object.freeze({ status: 'planned', eventId, taskId, stateVersion, candidates: structuredClone(selected), skipped, budget: { maxNpcs, selected: selected.length, skipped: skipped.length } });
    }

    /** Reviews an LLM/caller proposal through the existing NPC authority and knowledge guard. */
    function reviewCandidate({ candidate, permission, envelope, proposal, decisionGuard } = {}) {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new TypeError('candidate 必须是对象');
        if (!decisionGuard || typeof decisionGuard.review !== 'function') throw new TypeError('decisionGuard 必须提供 review');
        const key = `${candidate.sessionId}\u0000${candidate.branchId}\u0000${candidate.stateVersion}\u0000${candidate.eventId}\u0000${candidate.npcId}`;
        if (!planned.has(key)) return { status: 'rejected', reason: 'unknown_or_expired_candidate', npcId: candidate.npcId };
        const result = decisionGuard.review({ sessionId: candidate.sessionId, branchId: candidate.branchId, taskId: candidate.taskId, stateVersion: candidate.stateVersion, npcId: candidate.npcId, permission, envelope: envelope ?? { npcId: candidate.npcId, stateVersion: candidate.stateVersion, knownFactIds: candidate.decisionInput.knownFactIds }, proposal });
        if (result.status === 'blocked' || result.status === 'rejected' || result.status === 'stale_state' || result.status === 'needs_review') return { ...result, candidateId: key };
        decisions.set(key, structuredClone(result));
        return { status: 'reviewed', candidateId: key, decision: result };
    }

    function getDecision({ sessionId, branchId, stateVersion, eventId, npcId } = {}) {
        return structuredClone(decisions.get([sessionId, branchId, stateVersion, eventId, npcId].join('\u0000')));
    }

    function registerPlan({ sessionId, branchId, stateVersion, npcId, planId, goal, status = 'active', version = 1 } = {}) {
        const key = [requiredText(sessionId, 'sessionId'), requiredText(branchId, 'branchId'), requiredText(stateVersion, 'stateVersion'), requiredText(npcId, 'npcId'), requiredText(planId, 'planId')].join('\u0000');
        if (typeof goal !== 'string' || !goal.trim()) throw new TypeError('goal 必须是非空文本');
        if (!Number.isInteger(version) || version < 1) throw new TypeError('version 必须是正整数');
        const existing = plans.get(key);
        if (existing && version !== existing.version) return { status: 'needs_review', reason: 'plan_version_conflict', planId, currentVersion: existing.version };
        const next = { sessionId, branchId, stateVersion, npcId, planId, goal: goal.trim(), status, version: existing ? existing.version + 1 : version, formal: false, executed: false, lastChange: null };
        plans.set(key, next);
        notifyPlanChange({ type: existing ? 'updated' : 'registered', plan: next, previousVersion: existing?.version ?? null, currentVersion: next.version });
        return { status: existing ? 'updated' : 'registered', plan: structuredClone(next) };
    }

    function adjustPlan({ sessionId, branchId, stateVersion, npcId, planId, baseVersion, reason, goal, status = 'needs_redecision', evidence } = {}) {
        const key = [sessionId, branchId, stateVersion, npcId, planId].join('\u0000');
        const existing = plans.get(key);
        if (!existing) return { status: 'missing_plan', reason: 'plan_not_found' };
        if (baseVersion !== existing.version) return { status: 'needs_review', reason: 'plan_version_conflict', currentVersion: existing.version };
        if (typeof reason !== 'string' || !reason.trim()) throw new TypeError('reason 必须是非空文本');
        if (typeof goal !== 'string' || !goal.trim()) throw new TypeError('goal 必须是非空文本');
        if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return { status: 'needs_review', reason: 'adjustment_evidence_required', planId, npcId };
        const evidenceIds = boundedTextList(evidence.factIds, 'evidence.factIds', maxFacts);
        const evidenceSummary = requiredText(evidence.summary, 'evidence.summary');
        if (!evidenceIds.length) return { status: 'needs_review', reason: 'adjustment_evidence_fact_required', planId, npcId };
        const next = { ...existing, goal: goal.trim(), status, version: existing.version + 1, lastChange: reason.trim(), lastEvidence: { factIds: evidenceIds, summary: evidenceSummary } };
        plans.set(key, next);
        notifyPlanChange({ type: 'adjusted', previous: existing, plan: next, previousVersion: existing.version, currentVersion: next.version, reason: reason.trim() });
        return { status: 'adjusted', plan: structuredClone(next) };
    }

    function transitionPlan({ sessionId, branchId, stateVersion, npcId, planId, baseVersion, status, reason, evidence } = {}) {
        const key = [requiredText(sessionId, 'sessionId'), requiredText(branchId, 'branchId'), requiredText(stateVersion, 'stateVersion'), requiredText(npcId, 'npcId'), requiredText(planId, 'planId')].join('\u0000');
        const existing = plans.get(key);
        if (!existing) return { status: 'missing_plan', reason: 'plan_not_found' };
        if (baseVersion !== existing.version) return { status: 'needs_review', reason: 'plan_version_conflict', currentVersion: existing.version };
        if (!['active', 'paused', 'needs_redecision', 'completed', 'cancelled'].includes(status)) throw new TypeError('status 不是受支持的计划状态');
        if (existing.status === 'completed' || existing.status === 'cancelled') return { status: 'needs_review', reason: 'plan_terminal', currentStatus: existing.status };
        if (typeof reason !== 'string' || !reason.trim()) throw new TypeError('reason 必须是非空文本');
        const next = { ...existing, status, version: existing.version + 1, lastChange: reason.trim(), lastEvidence: evidence ?? existing.lastEvidence ?? null };
        plans.set(key, next); notifyPlanChange({ type: 'status_changed', previous: existing, plan: next, previousVersion: existing.version, currentVersion: next.version, reason: reason.trim() });
        return { status: 'transitioned', plan: structuredClone(next) };
    }

    function getPlan({ sessionId, branchId, stateVersion, npcId, planId } = {}) {
        return structuredClone(plans.get([sessionId, branchId, stateVersion, npcId, planId].join('\u0000')));
    }
    function subscribePlanChanges(listener) {
        if (typeof listener !== 'function') throw new TypeError('listener 必须是函数');
        planListeners.add(listener);
        return () => planListeners.delete(listener);
    }
    function clear() { planned.clear(); decisions.clear(); plans.clear(); planListeners.clear(); }
    return Object.freeze({ plan, reviewCandidate, getDecision, registerPlan, adjustPlan, transitionPlan, getPlan, subscribePlanChanges, clear });
}
