const ORDER = ['classify', 'plan', 'gather', 'adjudicate', 'compose', 'validate'];
const MAX_OUTPUT_BYTES = 128 * 1024;
const DEFAULT_TOTAL_TIMEOUT_MS = 90000;

function nonEmpty(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}
function clone(value) { return structuredClone(value); }
function sizeOf(value) {
    try { return new TextEncoder().encode(JSON.stringify(value)).length; }
    catch { return Number.POSITIVE_INFINITY; }
}

/** Fixed, allowlisted turn stages. Produces a candidate only; never commits state or sends a Tavern message. */
export function createTurnPipeline({ stages = {}, maxOutputBytes = MAX_OUTPUT_BYTES, maxTotalMs = DEFAULT_TOTAL_TIMEOUT_MS, stageTimeoutMs = {}, qualityGate, narrativeGuard, commitRecovery, onProgress, audit, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    if (!stages || typeof stages !== 'object' || Array.isArray(stages)) throw new TypeError('stages 必须是对象');
    if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 128 || maxOutputBytes > 2 * 1024 * 1024) throw new RangeError('maxOutputBytes 超出范围');
    if (!Number.isInteger(maxTotalMs) || maxTotalMs < 1 || maxTotalMs > 600000) throw new RangeError('maxTotalMs 必须在 1 到 600000 毫秒之间');
    if (!stageTimeoutMs || typeof stageTimeoutMs !== 'object' || Array.isArray(stageTimeoutMs)) throw new TypeError('stageTimeoutMs 必须是阶段超时对象');
    for (const [id, timeout] of Object.entries(stageTimeoutMs)) if (!ORDER.includes(id) || !Number.isInteger(timeout) || timeout < 1 || timeout > 120000) throw new RangeError(`阶段超时配置无效：${id}`);
    const enabled = new Map();
    for (const [id, run] of Object.entries(stages)) {
        if (!ORDER.includes(id)) throw new Error(`未知或不允许的回合阶段：${id}`);
        if (typeof run !== 'function') throw new TypeError(`阶段 ${id} 必须提供函数`);
        enabled.set(id, run);
    }
    for (const [value, method, name] of [[qualityGate, 'review', 'qualityGate'], [narrativeGuard, 'validate', 'narrativeGuard'], [commitRecovery, 'prepare', 'commitRecovery']]) if (value !== undefined && typeof value?.[method] !== 'function') throw new TypeError(`${name} 缺少 ${method} 接口`);
    if (onProgress !== undefined && typeof onProgress !== 'function') throw new TypeError('onProgress 必须是函数');
    if (audit !== undefined && typeof audit?.record !== 'function') throw new TypeError('audit 必须提供 record 接口');
    if (typeof now !== 'function') throw new TypeError('now 必须是函数');
    const tasks = new Map();
    function report(task, extra = {}) {
        task.public.sequence = (task.public.sequence ?? 0) + 1;
        if (audit) {
            const event = extra.event ?? (extra.status === 'failed' ? 'stage_failed' : extra.status === 'cancelled' ? 'task_cancelled' : extra.status === 'candidate_ready' ? 'candidate_ready' : extra.status === 'completed_saved' ? 'commit_complete' : extra.status === 'save_uncertain' ? 'commit_uncertain' : extra.status === 'awaiting_message_evidence' ? 'awaiting_message_evidence' : extra.currentStage ? 'stage_start' : task.public.completedStages?.length ? 'stage_complete' : 'task_start');
            try { audit.record({ taskId: task.public.taskId, sessionId: task.public.sessionId, branchId: task.public.branchId, stateVersion: task.public.stateVersion, event, stage: task.public.currentStage ?? null, outcome: extra.status ?? task.status, timestamp: now() }); } catch { /* Audit availability cannot break processing. */ }
        }
        if (onProgress) {
            try { onProgress({ ...task.public, ...extra }); } catch { /* Observability cannot break task execution. */ }
        }
    }

    function invalidate(taskId, { reason = 'history_changed' } = {}) {
        taskId = nonEmpty(taskId, 'taskId');
        reason = nonEmpty(reason, 'reason');
        const task = tasks.get(taskId);
        if (!task) return { status: 'missing_task' };
        if (task.status === 'committed' || task.status === 'completed_saved') return { status: 'already_committed', requires_history_recovery: true };
        if (task.status === 'awaiting_message_evidence') {
            const cancelled = commitRecovery?.cancel({ sessionId: task.public.sessionId, branchId: task.public.branchId, commitId: taskId });
            if (!cancelled || cancelled.status === 'missing_journal') return { status: 'rejected', reason: 'commit_recovery_unavailable' };
            if (cancelled.status !== 'cancelled') { report(task, { event: 'commit_uncertain', status: 'save_uncertain', outcome: cancelled.status, message: '消息证据已存在，不能安全取消提交。' }); return cancelled; }
        }
        if (task.status === 'cancelled' || task.status === 'failed') return { status: task.status };
        task.controller.abort();
        task.status = 'invalidated'; task.public.status = 'invalidated'; task.public.invalidationReason = reason.slice(0, 120);
        report(task, { status: 'invalidated', message: '任务依据已失效，候选不会提交。', reason: task.public.invalidationReason });
        return { status: 'invalidated' };
    }

    function invalidateNpcPlanVersion({ sessionId, branchId, stateVersion, npcId, planId, previousVersion, currentVersion } = {}) {
        const invalidated = [];
        for (const task of tasks.values()) {
            if (task.status !== 'candidate_ready' && task.status !== 'awaiting_message_evidence') continue;
            const candidate = task.candidate;
            const versions = candidate?.npcPlanVersions ?? candidate?.stageResults?.adjudicate?.npcPlanVersions ?? candidate?.stageResults?.gather?.npcPlanVersions ?? [];
            const affected = Array.isArray(versions) && versions.some(item => {
                const value = typeof item === 'string' ? item : `${item?.npcId ?? ''}:${item?.planId ?? ''}:${item?.version ?? ''}`;
                return value === `${npcId}:${planId}:${previousVersion}`;
            });
            if (!affected || task.public.sessionId !== sessionId || task.public.branchId !== branchId || task.public.stateVersion !== stateVersion) continue;
            if (task.status === 'awaiting_message_evidence') {
                const cancelled = commitRecovery?.cancel({ sessionId, branchId, commitId: task.public.taskId });
                if (!cancelled || (cancelled.status !== 'cancelled' && cancelled.status !== 'save_uncertain')) continue;
                if (cancelled.status === 'save_uncertain') { report(task, { event: 'commit_uncertain', status: 'save_uncertain', outcome: 'npc_plan_changed_after_message', message: 'NPC 计划已变化，但消息证据已存在，提交状态待核对。' }); invalidated.push({ taskId: task.public.taskId, status: 'save_uncertain' }); continue; }
            }
            task.controller.abort(); task.status = 'invalidated'; task.public.status = 'invalidated'; task.public.invalidationReason = 'npc_plan_changed';
            report(task, { status: 'invalidated', event: 'npc_plan_candidates_invalidated', outcome: 'npc_plan_changed', message: `NPC 计划已从版本 ${previousVersion} 变为 ${currentVersion}，候选不再适用。` });
            invalidated.push({ taskId: task.public.taskId, status: 'invalidated' });
        }
        return { status: invalidated.length ? 'invalidated' : 'no_matching_task', invalidated, npcId, planId, previousVersion, currentVersion };
    }

    function cancel(taskId) {
        taskId = nonEmpty(taskId, 'taskId');
        const task = tasks.get(taskId);
        if (!task) return { status: 'missing_task' };
        if (task.status === 'candidate_ready' || task.status === 'failed' || task.status === 'invalidated' || task.status === 'cancelled') return { status: task.status };
        if (task.status === 'awaiting_message_evidence') {
            const result = commitRecovery?.cancel({ sessionId: task.public.sessionId, branchId: task.public.branchId, commitId: taskId });
            if (!result || result.status === 'missing_journal') return { status: 'rejected', reason: 'commit_recovery_unavailable' };
            if (result.status !== 'cancelled') { report(task, { event: 'commit_uncertain', status: 'save_uncertain', outcome: result.status, message: '消息证据已存在，不能安全取消提交。' }); return result; }
        }
        task.controller.abort(); task.status = 'cancelled'; task.public.status = 'cancelled';
        report(task, { status: 'cancelled', message: '任务已取消；尚未提交的结果将被丢弃。' });
        return { status: 'cancelled' };
    }

    async function run({ taskId, sessionId, branchId, triggerMessageId, stateVersion, playerInput, allowedPlayerActions = [], signal } = {}) {
        taskId = nonEmpty(taskId, 'taskId'); sessionId = nonEmpty(sessionId, 'sessionId'); branchId = nonEmpty(branchId, 'branchId');
        triggerMessageId = nonEmpty(triggerMessageId, 'triggerMessageId'); stateVersion = nonEmpty(stateVersion, 'stateVersion');
        if (typeof playerInput !== 'string' || playerInput.length > 50000) throw new TypeError('playerInput 必须是长度不超过 50000 的文本');
        if (!Array.isArray(allowedPlayerActions) || allowedPlayerActions.length > 32 || allowedPlayerActions.some(action => typeof action !== 'string' || action.length > 500)) throw new TypeError('allowedPlayerActions 必须是有界文本数组');
        if (tasks.has(taskId)) return { status: 'duplicate_task', task: clone(tasks.get(taskId).public) };
        const controller = new AbortController();
        const task = { status: 'processing', controller, public: { taskId, sessionId, branchId, triggerMessageId, stateVersion, status: 'processing', completedStages: [], sequence: 0 } };
        tasks.set(taskId, task);
        report(task, { message: '任务已开始。' });
        const forwardAbort = () => controller.abort();
        if (signal?.aborted) controller.abort();
        else signal?.addEventListener('abort', forwardAbort, { once: true });
        const results = Object.create(null);
        const startedAt = now();
        if (!Number.isFinite(startedAt)) throw new TypeError('now 必须返回有限数字');
        try {
            for (const id of ORDER) {
                if (controller.signal.aborted) {
                    if (task.status !== 'invalidated') { task.status = 'cancelled'; task.public.status = 'cancelled'; report(task, { status: 'cancelled', message: '任务已取消，未提交候选。' }); }
                    return { status: task.status, task: clone(task.public) };
                }
                const stage = enabled.get(id);
                if (!stage) continue;
                const elapsedMs = Math.max(0, now() - startedAt);
                const remainingMs = maxTotalMs - elapsedMs;
                if (remainingMs <= 0) {
                    task.status = 'failed'; task.public.status = 'failed'; task.public.failedStage = id;
                    report(task, { message: `总预算耗尽（${maxTotalMs}ms），未启动阶段 ${id}。`, elapsedMs });
                    return { status: 'failed', stage: id, error: 'total_budget_exhausted', elapsedMs, task: clone(task.public) };
                }
                task.public.currentStage = id;
                report(task, { message: `正在处理：${id}`, elapsedMs, budgetRemainingMs: remainingMs });
                const context = Object.freeze({
                    taskId, sessionId, branchId, triggerMessageId, stateVersion,
                    playerInput, allowedPlayerActions: Object.freeze([...allowedPlayerActions]),
                    previous: Object.freeze(clone(results)), signal: controller.signal,
                });
                let timer;
                let outcome;
                const timeoutMs = Math.min(stageTimeoutMs[id] ?? maxTotalMs, remainingMs);
                const timeoutPromise = new Promise(resolve => { timer = setTimer(() => resolve({ kind: 'timeout' }), timeoutMs); });
                let removeAbortListener;
                const abortPromise = new Promise(resolve => {
                    const onAbort = () => resolve({ kind: 'aborted' });
                    if (controller.signal.aborted) onAbort();
                    else {
                        controller.signal.addEventListener('abort', onAbort, { once: true });
                        removeAbortListener = () => controller.signal.removeEventListener('abort', onAbort);
                    }
                });
                try {
                    const stagePromise = Promise.resolve().then(() => stage(context)).then(value => ({ kind: 'result', value }), error => ({ kind: 'error', error }));
                    outcome = await Promise.race([stagePromise, timeoutPromise, abortPromise]);
                } finally { clearTimer(timer); removeAbortListener?.(); }
                if (outcome.kind === 'aborted' || controller.signal.aborted) {
                    if (task.status !== 'invalidated') { task.status = 'cancelled'; task.public.status = 'cancelled'; report(task, { status: 'cancelled', message: '任务已取消，未提交候选。' }); }
                    return { status: task.status, stage: id, task: clone(task.public) };
                }
                if (outcome.kind === 'timeout') {
                    task.status = 'failed'; task.public.status = 'failed'; task.public.failedStage = id;
                    const totalBudget = timeoutMs === remainingMs;
                    const error = totalBudget ? 'total_budget_exhausted' : 'stage_timeout';
                    report(task, { message: totalBudget ? `总预算耗尽于阶段 ${id}。` : `阶段 ${id} 超时。`, elapsedMs: Math.max(0, now() - startedAt) });
                    return { status: 'failed', stage: id, error, elapsedMs: Math.max(0, now() - startedAt), task: clone(task.public) };
                }
                if (outcome.kind === 'error') {
                    const error = String(outcome.error?.message ?? outcome.error);
                    task.status = 'failed'; task.public.status = 'failed'; task.public.failedStage = id; report(task, { message: `阶段 ${id} 失败。` });
                    return { status: 'failed', stage: id, error, task: clone(task.public) };
                }
                const value = outcome.value;
                if (controller.signal.aborted) {
                    task.status = 'cancelled'; task.public.status = 'cancelled'; report(task, { message: '任务已取消，未提交候选。' });
                    return { status: 'cancelled', stage: id, task: clone(task.public) };
                }
                if (value === undefined) {
                    task.status = 'failed'; task.public.status = 'failed'; task.public.failedStage = id; report(task, { message: `阶段 ${id} 未返回结果。` });
                    return { status: 'failed', stage: id, error: 'stage_returned_undefined', task: clone(task.public) };
                }
                if (sizeOf(value) > maxOutputBytes) {
                    task.status = 'failed'; task.public.status = 'failed'; task.public.failedStage = id; report(task, { message: `阶段 ${id} 超出输出上限。` });
                    return { status: 'failed', stage: id, error: 'stage_output_limit', task: clone(task.public) };
                }
                results[id] = clone(value);
                task.public.completedStages.push(id);
                report(task, { message: `已完成：${id}` });
            }
            task.status = 'candidate_ready'; task.public.status = 'candidate_ready'; task.public.currentStage = null;
            const candidate = { taskId, sessionId, branchId, triggerMessageId, baseStateVersion: stateVersion, playerInput, allowedPlayerActions: [...allowedPlayerActions], stageResults: clone(results) };
            if (qualityGate && results.validate?.changes) {
                const quality = qualityGate.review({ sessionId, branchId, stateVersion, allowedPlayerActions, changes: results.validate.changes, claims: results.validate.claims ?? [], visibleFactIds: results.gather?.visibleFactIds ?? [], approvedChangeIds: results.adjudicate?.approvedChangeIds ?? [] });
                candidate.quality = quality;
                if (quality.status !== 'candidate') { task.status = 'failed'; task.public.status = 'failed'; task.public.failedStage = 'quality_gate'; report(task, { event: 'quality_rejected', outcome: 'quality_rejected', message: '候选未通过一致性审核。' }); return { status: 'rejected', stage: 'quality_gate', quality, task: clone(task.public) }; }
                candidate.acceptedChanges = clone(quality.acceptedChanges);
            }
            if (narrativeGuard && results.compose?.text !== undefined) {
                const narrative = narrativeGuard.validate({ sessionId, branchId, taskId, stateVersion, text: results.compose.text, claims: results.compose.claims ?? [], visibleFactIds: results.gather?.visibleFactIds ?? [], approvedChanges: candidate.acceptedChanges ?? [], npcPlanVersions: results.adjudicate?.npcPlanVersions ?? results.gather?.npcPlanVersions ?? [] });
                candidate.narrative = narrative;
                if (narrative.status !== 'candidate') { task.status = 'failed'; task.public.status = 'failed'; task.public.failedStage = 'narrative_guard'; report(task, { event: 'narrative_rejected', outcome: 'narrative_rejected', message: '正文候选未通过事实核验。' }); return { status: 'rejected', stage: 'narrative_guard', narrative, task: clone(task.public) }; }
            }
            task.status = 'candidate_ready'; task.public.status = 'candidate_ready'; task.public.currentStage = null; task.candidate = clone(candidate); report(task, { event: 'candidate_ready', status: 'candidate_ready', outcome: 'candidate_ready_not_committed', message: '候选已准备，尚未提交。' });
            return { status: 'candidate_ready', candidate, task: clone(task.public) };
        } finally {
            signal?.removeEventListener('abort', forwardAbort);
        }
    }

    function commitCandidate({ candidate, messageId } = {}) {
        if (!candidate || typeof candidate !== 'object' || !candidate.taskId || !candidate.sessionId || !candidate.branchId || !candidate.baseStateVersion) return { status: 'rejected', reason: 'invalid_candidate' };
        const task = tasks.get(candidate.taskId);
        if (!task || task.status !== 'candidate_ready') return { status: 'rejected', reason: task?.status === 'invalidated' ? 'candidate_invalidated' : 'task_not_candidate_ready' };
        if (!commitRecovery) return { status: 'unavailable', reason: 'commit_recovery_not_configured' };
        if (task.public.sessionId !== candidate.sessionId || task.public.branchId !== candidate.branchId || task.public.stateVersion !== candidate.baseStateVersion) return { status: 'rejected', reason: 'candidate_scope_mismatch' };
        if (!candidate.stageResults?.adjudicate?.nextState) return { status: 'rejected', reason: 'missing_next_state' };
        const prepared = commitRecovery.prepare({ sessionId: candidate.sessionId, branchId: candidate.branchId, baseVersion: candidate.baseStateVersion, commitId: candidate.taskId, candidate: { nextState: candidate.stageResults.adjudicate.nextState, changes: candidate.acceptedChanges ?? [] }, messageId });
        if (prepared.status !== 'prepared') return prepared;
        task.status = 'awaiting_message_evidence'; task.public.status = 'awaiting_message_evidence'; report(task, { event: 'awaiting_message_evidence', status: 'awaiting_message_evidence', outcome: 'awaiting_message_evidence', message: '等待确认正文消息已在酒馆中可见。' });
        return { status: 'awaiting_message_evidence', taskId: candidate.taskId, messageId };
    }
    function confirmMessageAndCommit({ taskId, messageId, observed } = {}) {
        taskId = nonEmpty(taskId, 'taskId'); const task = tasks.get(taskId);
        if (task?.status === 'invalidated') return { status: 'rejected', reason: 'candidate_invalidated' };
        if (task?.status === 'save_uncertain') return { status: 'rejected', reason: 'commit_uncertain' };
        if (!commitRecovery) return { status: 'unavailable', reason: 'commit_recovery_not_configured' };
        if (task?.status === 'cancelled') return { status: 'cancelled' };
        if (!task || task.status !== 'awaiting_message_evidence') return { status: 'rejected', reason: 'task_not_awaiting_message_evidence' };
        const evidence = commitRecovery.markMessage({ sessionId: task.public.sessionId, branchId: task.public.branchId, commitId: taskId, messageId, observed });
        if (evidence.status !== 'message_observed') return evidence;
        const currentTask = tasks.get(taskId);
        if (!currentTask || currentTask.status !== 'awaiting_message_evidence') return { status: 'cancelled' };
        const result = commitRecovery.commit({ sessionId: task.public.sessionId, branchId: task.public.branchId, commitId: taskId });
        task.status = result.status === 'committed' || result.status === 'duplicate_commit' ? 'committed' : 'save_uncertain';
        task.public.status = task.status;
        report(task, { status: task.status === 'committed' ? 'completed_saved' : 'save_uncertain', event: task.status === 'committed' ? 'commit_complete' : 'commit_uncertain', message: task.status === 'committed' ? '状态提交成功。' : '状态提交结果待核对。' });
        return result;
    }
    function invalidateNpcPlanVersion({ sessionId, branchId, stateVersion, npcId, planId, previousVersion, currentVersion } = {}) {
        const invalidated = [];
        for (const task of tasks.values()) {
            if (task.status !== 'candidate_ready' && task.status !== 'awaiting_message_evidence') continue;
            const versions = task.candidate?.stageResults?.adjudicate?.npcPlanVersions ?? task.candidate?.stageResults?.gather?.npcPlanVersions ?? [];
            const affected = Array.isArray(versions) && versions.some(item => {
                const value = typeof item === 'string' ? item : `${item?.npcId ?? ''}:${item?.planId ?? ''}:${item?.version ?? ''}`;
                return value === `${npcId}:${planId}:${previousVersion}`;
            });
            if (!affected || task.public.sessionId !== sessionId || task.public.branchId !== branchId || task.public.stateVersion !== stateVersion) continue;
            if (task.status === 'awaiting_message_evidence') {
                const cancelled = commitRecovery?.cancel({ sessionId, branchId, commitId: task.public.taskId });
                if (cancelled?.status === 'save_uncertain') { report(task, { event: 'commit_uncertain', status: 'save_uncertain', outcome: 'npc_plan_changed_after_message', message: 'NPC 计划已变化，但消息证据已存在，提交状态待核对。' }); invalidated.push({ taskId: task.public.taskId, status: 'save_uncertain' }); continue; }
                if (cancelled?.status !== 'cancelled') continue;
            }
            task.controller.abort(); task.status = 'invalidated'; task.public.status = 'invalidated'; task.public.invalidationReason = 'npc_plan_changed';
            report(task, { status: 'invalidated', event: 'npc_plan_candidates_invalidated', outcome: 'npc_plan_changed', message: `NPC 计划已从版本 ${previousVersion} 变为 ${currentVersion}，候选不再适用。` });
            invalidated.push({ taskId: task.public.taskId, status: 'invalidated' });
        }
        return { status: invalidated.length ? 'invalidated' : 'no_matching_task', invalidated, npcId, planId, previousVersion, currentVersion };
    }

    function inspect(taskId) {
        taskId = nonEmpty(taskId, 'taskId');
        const task = tasks.get(taskId);
        return task ? clone(task.public) : { status: 'missing_task' };
    }
    function clear() { tasks.clear(); }
    return Object.freeze({ run, cancel, invalidate, invalidateNpcPlanVersion, inspect, commitCandidate, confirmMessageAndCommit, clear, stages: Object.freeze([...enabled.keys()]) });
}
