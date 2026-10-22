const DEFAULT_ROUTE = Object.freeze({
    ordinary_interaction: 'facts-query',
    system_operation: 'facts-query',
    explicit_action: 'action-resolve',
    complex_action: 'action-resolve',
    time_advance: 'world-advance',
});

/** Deterministic bridge from classified requests to an allowlisted, revalidated module plan. */
export function createRequestRouter({ classifier, runner, getEnabledModuleIds, operationLedger, commitRecovery, getCapabilities, npcCommitGate } = {}) {
    if (!classifier || typeof classifier.classify !== 'function') throw new TypeError('classifier 必须提供 classify');
    if (!runner || typeof runner.plan !== 'function' || typeof runner.validatePlan !== 'function' || typeof runner.execute !== 'function') throw new TypeError('runner 接口不完整');
    if (typeof getEnabledModuleIds !== 'function') throw new TypeError('getEnabledModuleIds 必须是函数');
    if (operationLedger !== undefined && (!operationLedger || typeof operationLedger.start !== 'function' || typeof operationLedger.update !== 'function')) throw new TypeError('operationLedger 接口不完整');
    if (commitRecovery !== undefined && (!commitRecovery || typeof commitRecovery.prepare !== 'function' || typeof commitRecovery.markMessage !== 'function' || typeof commitRecovery.commit !== 'function' || typeof commitRecovery.inspect !== 'function')) throw new TypeError('commitRecovery 接口不完整');
    if (getCapabilities !== undefined && typeof getCapabilities !== 'function') throw new TypeError('getCapabilities 必须是函数');
    if (npcCommitGate !== undefined && (!npcCommitGate || typeof npcCommitGate.check !== 'function')) throw new TypeError('npcCommitGate 接口不完整');
    const pendingCandidates = new Map();
    function invalidateNpcPlanCandidates(change) {
        const plan = change?.plan;
        if (!plan) return { status: 'ignored', reason: 'missing_plan' };
        const invalidated = [];
        const reason = plan.status === 'completed' || plan.status === 'cancelled' ? 'npc_plan_terminal' : 'npc_plan_changed';
        const expectedVersion = Number.isInteger(change.previousVersion) ? change.previousVersion : (Number.isInteger(plan.version) ? plan.version : null);
        for (const [requestId, pending] of pendingCandidates) {
            const npcCandidates = pending.execution?.results?.flatMap(item => item?.value?.result?.npcCandidates ?? item?.value?.npcCandidates ?? []) ?? [];
            const affected = npcCandidates.some(candidate => candidate.npcId === plan.npcId && candidate.planId === plan.planId && candidate.sessionId === plan.sessionId && candidate.branchId === plan.branchId && candidate.stateVersion === plan.stateVersion && (expectedVersion === null || candidate.planVersion === expectedVersion));
            if (affected) {
                const result = invalidateCandidate({ requestId, reason, planId: plan.planId, npcId: plan.npcId, planVersion: expectedVersion, currentPlanVersion: plan.version ?? change.currentVersion ?? null });
                invalidated.push({ requestId, result });
            }
        }
        return { status: invalidated.length ? 'invalidated' : 'no_matching_candidate', reason, planId: plan.planId, npcId: plan.npcId, planVersion: expectedVersion, currentPlanVersion: plan.version ?? change.currentVersion ?? null, invalidated };
    }

    function prepare(request) {
        const capabilities = getCapabilities?.() ?? { status: 'unknown' };
        const classified = classifier.classify(request);
        if (classified.status !== 'classified') return { status: classified.status, reason: classified.reason, classified, capabilities };
        if (capabilities.status === 'degraded' && classified.task !== 'ordinary_interaction' && classified.task !== 'system_operation') return { status: 'needs_review', reason: 'host_capability_degraded', classified, capabilities };
        const authorization = Object.freeze({ requestId: classified.requestId, sessionId: classified.sessionId, branchId: classified.branchId, stateVersion: classified.stateVersion, task: classified.task, executionMode: classified.executionMode, playerAction: classified.playerAction ? structuredClone(classified.playerAction) : null });
        const taskType = classified.task;
        const allowedModuleId = DEFAULT_ROUTE[taskType];
        if (!allowedModuleId) return { status: 'needs_review', reason: 'no_safe_default_route', classified, authorization, capabilities };
        const requestedModuleIds = classified.requiredModules.length ? classified.requiredModules : [allowedModuleId];
        if (requestedModuleIds.some(id => id !== allowedModuleId)) return { status: 'needs_review', reason: 'requested_module_outside_task_route', classified, authorization, capabilities };
        const enabledModuleIds = getEnabledModuleIds();
        const plan = runner.plan({ taskType, requestedModuleIds, enabledModuleIds });
        if (plan.status !== 'planned') return { status: 'needs_review', reason: plan.reason, classified, authorization, capabilities, plan };
        return { status: 'ready', classified, authorization, capabilities, taskType, plan, enabledModuleIds: [...enabledModuleIds] };
    }

    function invalidateCandidate({ requestId, reason = 'history_changed', planId, npcId, planVersion, currentPlanVersion } = {}) {
        const pending = pendingCandidates.get(requestId);
        if (!pending) return { status: 'missing_candidate' };
        pendingCandidates.delete(requestId);
        const operation = operationLedger?.get?.(requestId);
        if (operation && operation.status !== 'failed_unapplied') operationLedger.update(requestId, 'history_invalidated', { sessionId: operation.sessionId, branchId: operation.branchId, stateVersion: operation.stateVersion, reason });
        return { status: 'invalidated', requestId, reason, ...(planId ? { planId } : {}), ...(npcId ? { npcId } : {}), ...(planVersion !== undefined && planVersion !== null ? { planVersion } : {}), ...(currentPlanVersion !== undefined && currentPlanVersion !== null ? { currentPlanVersion } : {}) };
    }

    function revalidateCandidate({ requestId } = {}) {
        const capabilities = getCapabilities?.() ?? { status: 'unknown' };
        const pending = pendingCandidates.get(requestId);
        if (!pending) return { status: 'missing_candidate' };
        if (capabilities.status === 'degraded') return { status: 'needs_review', reason: 'host_capability_degraded', capabilities };
        if (operationLedger) {
            const operation = operationLedger.get(requestId);
            if (!operation) return { status: 'missing_operation' };
            if (operation.status !== 'waiting_input') return { status: 'needs_review', reason: 'operation_not_waiting_input', operation };
            if (operation.stateVersion !== pending.authorization.stateVersion || operation.sessionId !== pending.authorization.sessionId || operation.branchId !== pending.authorization.branchId) return { status: 'needs_review', reason: 'operation_context_changed', operation };
        }
        return { status: 'revalidated', requestId, authorization: pending.authorization, execution: pending.execution };
    }

    function prepareCommit({ requestId, messageId, candidate } = {}) {
        const revalidated = revalidateCandidate({ requestId });
        if (revalidated.status !== 'revalidated') return revalidated;
        const pending = pendingCandidates.get(requestId);
        if (!pending) return { status: 'missing_candidate' };
        if (pending.authorization.requestId !== requestId) return { status: 'request_mismatch' };
        if (!commitRecovery) return { status: 'unavailable', reason: 'commit_recovery_not_configured' };
        if (npcCommitGate && Array.isArray(candidate?.npcCandidates)) {
            const gate = npcCommitGate.check({ sessionId: pending.authorization.sessionId, branchId: pending.authorization.branchId, stateVersion: pending.authorization.stateVersion, candidates: candidate.npcCandidates });
            if (gate.status !== 'ready') return { status: gate.status, reason: 'npc_commit_gate_blocked', gate };
        }
        const result = commitRecovery.prepare({ sessionId: pending.authorization.sessionId, branchId: pending.authorization.branchId, baseVersion: pending.authorization.stateVersion, commitId: requestId, candidate, messageId });
        if (result.status === 'prepared') pendingCandidates.delete(requestId);
        return result;
    }

    function confirmMessage({ requestId, messageId, observed } = {}) {
        const capabilities = getCapabilities?.() ?? { status: 'unknown' };
        if (capabilities.status === 'degraded') return { status: 'needs_review', reason: 'host_capability_degraded', capabilities };
        if (!commitRecovery) return { status: 'unavailable', reason: 'commit_recovery_not_configured' };
        const pending = operationLedger?.get?.(requestId);
        if (!pending) return { status: 'missing_operation' };
        return commitRecovery.markMessage({ sessionId: pending.sessionId, branchId: pending.branchId, commitId: requestId, messageId, observed });
    }

    function commitCandidate({ requestId } = {}) {
        const capabilities = getCapabilities?.() ?? { status: 'unknown' };
        if (capabilities.status === 'degraded') return { status: 'needs_review', reason: 'host_capability_degraded', capabilities };
        if (!commitRecovery) return { status: 'unavailable', reason: 'commit_recovery_not_configured' };
        const pending = operationLedger?.get?.(requestId);
        if (!pending) return { status: 'missing_operation' };
        const result = commitRecovery.commit({ sessionId: pending.sessionId, branchId: pending.branchId, commitId: requestId });
        if (result.status === 'committed') operationLedger?.update(requestId, 'completed_saved', { sessionId: pending.sessionId, branchId: pending.branchId, stateVersion: pending.stateVersion, reason: 'candidate_committed' });
        return result;
    }

    async function run({ request, input, taskId, signal, timestamp } = {}) {
        const prepared = prepare(request);
        if (prepared.status !== 'ready') return prepared;
        if (taskId !== prepared.classified.requestId) return { status: 'rejected', reason: 'task_request_id_mismatch', prepared };
        if (!input || typeof input !== 'object' || Array.isArray(input)) return { status: 'rejected', reason: 'structured_module_input_required', prepared };
        const required = prepared.authorization.executionMode === 'action_candidate' ? prepared.authorization.playerAction : null;
        if (required && (input.intent?.targetId !== required.targetId || input.intent?.method !== required.method)) return { status: 'rejected', reason: 'module_input_exceeds_confirmed_action', prepared };
        const validation = runner.validatePlan(prepared.plan, { taskType: prepared.taskType, enabledModuleIds: prepared.enabledModuleIds });
        if (validation.status !== 'validated') return { status: 'needs_review', reason: validation.reason, prepared };
        let operation;
        if (operationLedger) {
            const triggerMessageId = request.triggerMessageId ?? request.messageId ?? prepared.authorization.requestId;
            operation = operationLedger.start({ operationId: prepared.authorization.requestId, sessionId: prepared.authorization.sessionId, branchId: prepared.authorization.branchId, triggerMessageId, stateVersion: prepared.authorization.stateVersion, taskId, timestamp });
            if (!operation.accepted) return { status: 'rejected', reason: operation.reason, prepared, operation };
        }
        const updateLedger = (status, reason) => operationLedger?.update(prepared.authorization.requestId, status, { sessionId: prepared.authorization.sessionId, branchId: prepared.authorization.branchId, stateVersion: prepared.authorization.stateVersion, timestamp, reason });
        const execution = await runner.execute({ taskId, taskType: prepared.taskType, moduleIds: validation.moduleIds, plan: prepared.plan, enabledModuleIds: prepared.enabledModuleIds, input, signal });
        updateLedger(execution.ok ? 'waiting_input' : 'failed_unapplied', execution.ok ? 'candidate_ready_for_commit' : execution.reason ?? 'module_execution_failed');
        if (execution.ok) pendingCandidates.set(prepared.authorization.requestId, { authorization: prepared.authorization, execution });
        return { status: execution.ok ? 'executed' : 'failed', classified: prepared.classified, plan: prepared.plan, operation, execution };
    }

    return Object.freeze({ prepare, run, invalidateCandidate, revalidateCandidate, prepareCommit, confirmMessage, commitCandidate, invalidateNpcPlanCandidates });
}
