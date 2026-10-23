const TASK_STATUSES = ['processing', 'waiting_input', 'completed_saved', 'failed_unapplied', 'save_uncertain'];

function validateDescriptor(descriptor) {
    if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) throw new TypeError('模块登记必须是对象');
    if (typeof descriptor.id !== 'string' || !/^[a-z][a-z0-9-]{1,47}$/.test(descriptor.id)) throw new TypeError('模块 id 格式无效');
    if (typeof descriptor.run !== 'function') throw new TypeError(`模块 ${descriptor.id} 必须提供 run 函数`);
    const timeoutMs = descriptor.timeoutMs ?? 15000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new RangeError('timeoutMs 必须在 1 到 120000 毫秒之间');
    const taskTypes = descriptor.taskTypes ?? ['ordinary_interaction', 'explicit_action', 'complex_action', 'system_operation', 'historical_operation', 'time_advance'];
    const dependsOn = descriptor.dependsOn ?? [];
    if (!Array.isArray(taskTypes) || taskTypes.length > 16 || taskTypes.some(type => typeof type !== 'string' || !/^[a-z][a-z_]{1,31}$/.test(type)) || new Set(taskTypes).size !== taskTypes.length) throw new TypeError('taskTypes 必须是无重复、有限的任务类型数组');
    if (!Array.isArray(dependsOn) || dependsOn.length > 32 || dependsOn.some(id => typeof id !== 'string' || !/^[a-z][a-z0-9-]{1,47}$/.test(id)) || new Set(dependsOn).size !== dependsOn.length || dependsOn.includes(descriptor.id)) throw new TypeError('dependsOn 必须是无重复、有效的模块ID数组');
    if (typeof descriptor.stateChanging !== 'boolean' && descriptor.stateChanging !== undefined) throw new TypeError('stateChanging 必须为布尔值');
    return { id: descriptor.id, run: descriptor.run, timeoutMs, required: descriptor.required !== false, taskTypes: [...taskTypes], dependsOn: [...dependsOn], stateChanging: descriptor.stateChanging === true };
}

/** Creates a bounded, sequential runner over explicitly registered modules only. */
export function createModuleRunner({ updateTask, maxModulesPerRun = 8, maxTotalMs = 90000, setTimer = setTimeout, clearTimer = clearTimeout, now = () => Date.now(), audit } = {}) {
    if (typeof updateTask !== 'function') throw new TypeError('必须提供 updateTask 回调');
    if (!Number.isInteger(maxModulesPerRun) || maxModulesPerRun < 1 || maxModulesPerRun > 32) throw new RangeError('maxModulesPerRun 必须在 1 到 32 之间');
    if (!Number.isInteger(maxTotalMs) || maxTotalMs < 1 || maxTotalMs > 600000) throw new RangeError('maxTotalMs 必须在 1 到 600000 毫秒之间');
    if (typeof now !== 'function') throw new TypeError('now 必须是函数');
    if (audit !== undefined && typeof audit?.record !== 'function') throw new TypeError('audit 必须提供 record 接口');
    const registry = new Map();
    function report(taskId, event, fields = {}) {
        if (!audit) return;
        try { audit.record({ taskId, sessionId: fields.sessionId ?? 'unknown-session', branchId: fields.branchId ?? 'unknown-branch', stateVersion: fields.stateVersion ?? 'unknown-version', event, stage: fields.stage ?? null, outcome: fields.outcome ?? 'unknown' }); } catch { /* 审计不可用不应阻断执行。 */ }
    }

    function register(descriptor) {
        const module = validateDescriptor(descriptor);
        if (registry.has(module.id)) throw new Error(`模块已登记：${module.id}`);
        for (const dependency of module.dependsOn) if (!registry.has(dependency)) throw new Error(`模块依赖未登记：${module.id} -> ${dependency}`);
        registry.set(module.id, module);
        return () => registry.delete(module.id);
    }

    function list() {
        return [...registry.values()].map(({ id, timeoutMs, required, taskTypes, dependsOn, stateChanging }) => ({ id, timeoutMs, required, taskTypes: [...taskTypes], dependsOn: [...dependsOn], stateChanging }));
    }

    function validatePlan(candidate, { taskType, enabledModuleIds } = {}) {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return { status: 'rejected', reason: 'invalid_plan' };
        if (typeof taskType !== 'string' || !/^[a-z][a-z_]{1,31}$/.test(taskType)) return { status: 'rejected', reason: 'invalid_task_type' };
        if (!Array.isArray(enabledModuleIds) || enabledModuleIds.some(id => typeof id !== 'string') || new Set(enabledModuleIds).size !== enabledModuleIds.length) return { status: 'rejected', reason: 'enabled_modules_required' };
        const proposed = candidate.moduleIds;
        if (!Array.isArray(proposed) || proposed.length < 1 || proposed.length > maxModulesPerRun || proposed.some(id => typeof id !== 'string') || new Set(proposed).size !== proposed.length) return { status: 'rejected', reason: 'invalid_requested_modules' };
        const enabled = new Set(enabledModuleIds);
        const ordered = [];
        const visiting = new Set();
        const visited = new Set();
        function visit(id) {
            if (visited.has(id)) return null;
            if (visiting.has(id)) return 'dependency_cycle';
            const module = registry.get(id);
            if (!module) return `module_not_registered:${id}`;
            if (!enabled.has(id)) return `module_disabled:${id}`;
            if (!module.taskTypes.includes(taskType)) return `task_not_supported:${id}`;
            if (module.stateChanging && !['explicit_action', 'complex_action', 'time_advance'].includes(taskType)) return `state_change_not_allowed_for_task:${id}`;
            visiting.add(id);
            for (const dependency of module.dependsOn) {
                const error = visit(dependency);
                if (error) return error;
            }
            visiting.delete(id);
            visited.add(id);
            ordered.push(id);
            return null;
        }
        for (const id of proposed) {
            const error = visit(id);
            if (error) return { status: 'rejected', reason: error };
        }
        if (ordered.length > maxModulesPerRun) return { status: 'rejected', reason: 'module_limit_exceeded', moduleCount: ordered.length };
        return { status: 'validated', taskType, moduleIds: ordered, requestedModuleIds: [...proposed] };
    }

    function plan({ taskType, requestedModuleIds, enabledModuleIds } = {}) {
        if (typeof taskType !== 'string' || !/^[a-z][a-z_]{1,31}$/.test(taskType)) return { status: 'rejected', reason: 'invalid_task_type' };
        if (!Array.isArray(requestedModuleIds) || requestedModuleIds.length < 1 || requestedModuleIds.length > maxModulesPerRun || requestedModuleIds.some(id => typeof id !== 'string') || new Set(requestedModuleIds).size !== requestedModuleIds.length) return { status: 'rejected', reason: 'invalid_requested_modules' };
        if (!Array.isArray(enabledModuleIds) || enabledModuleIds.some(id => typeof id !== 'string') || new Set(enabledModuleIds).size !== enabledModuleIds.length) return { status: 'rejected', reason: 'enabled_modules_required' };
        const validated = validatePlan({ moduleIds: requestedModuleIds }, { taskType, enabledModuleIds });
        return validated.status === 'validated' ? { ...validated, status: 'planned' } : validated;
    }

    function clear() {
        registry.clear();
    }

    async function execute({ taskId, sessionId, branchId, stateVersion, taskType, moduleIds, plan: approvedPlan, enabledModuleIds, input, signal } = {}) {
        if (typeof taskId !== 'string' || !taskId.trim()) throw new TypeError('taskId 必须是非空字符串');
        for (const [value, name] of [[sessionId, 'sessionId'], [branchId, 'branchId'], [stateVersion, 'stateVersion']]) if (value !== undefined && (typeof value !== 'string' || !value.trim())) throw new TypeError(`${name} 必须是非空字符串`);
        if (!Array.isArray(moduleIds) || moduleIds.length < 1 || moduleIds.length > maxModulesPerRun) throw new RangeError(`moduleIds 数量必须在 1 到 ${maxModulesPerRun} 之间`);
        if (new Set(moduleIds).size !== moduleIds.length) throw new Error('moduleIds 不允许重复');
        if (taskType !== undefined && (typeof taskType !== 'string' || !/^[a-z][a-z_]{1,31}$/.test(taskType))) throw new TypeError('taskType 格式无效');
        if (approvedPlan !== undefined) {
            const validation = validatePlan(approvedPlan, { taskType, enabledModuleIds });
            if (validation.status !== 'validated') throw new Error(`执行计划无效：${validation.reason}`);
            if (moduleIds.length !== validation.moduleIds.length || moduleIds.some((id, index) => id !== validation.moduleIds[index])) throw new Error('执行模块与已核准计划不一致');
        }
        const modules = moduleIds.map(id => {
            const module = registry.get(id);
            if (!module) throw new Error(`未登记或未允许调用的模块：${String(id)}`);
            return module;
        });
        if (taskType !== undefined) {
            const included = new Set();
            for (const module of modules) {
                if (!module.taskTypes.includes(taskType)) throw new Error(`模块不支持任务类型：${module.id}/${taskType}`);
                if (module.stateChanging && !['explicit_action', 'complex_action', 'time_advance'].includes(taskType)) throw new Error(`该任务类型禁止调用状态变更模块：${module.id}/${taskType}`);
                for (const dependency of module.dependsOn) if (!included.has(dependency)) throw new Error(`模块依赖未按顺序执行：${module.id} -> ${dependency}`);
                included.add(module.id);
            }
        }

        const results = [];
        report(taskId, 'task_start', { sessionId, branchId, stateVersion, outcome: 'processing' });
        const startedAt = now();
        if (!Number.isFinite(startedAt)) throw new TypeError('now 必须返回有限数字');
        for (const module of modules) {
            const elapsedBefore = Math.max(0, now() - startedAt);
            const remainingMs = maxTotalMs - elapsedBefore;
            if (remainingMs <= 0) {
                updateTask(taskId, 'failed_unapplied', { message: `总控预算耗尽（${maxTotalMs}ms），未启动模块 ${module.id}。`, impact: '执行器未提交正式状态。', applied: '无', nextStep: '缩小模块计划或调整已批准的预算后重试。' });
                report(taskId, 'stage_failed', { stage: module.id, outcome: 'budget_exhausted' });
                return { ok: false, reason: 'budget_exhausted', results, elapsedMs: elapsedBefore };
            }
            if (signal?.aborted) {
                updateTask(taskId, 'failed_unapplied', { message: `任务已停止，模块 ${module.id} 尚未执行。`, impact: '本执行器没有提交正式状态。', applied: '无', nextStep: '核对当前状态后再发起新任务。' });
                report(taskId, 'task_cancelled', { stage: module.id, outcome: 'aborted_before_stage' });
                return { ok: false, reason: 'aborted', results };
            }
            updateTask(taskId, 'processing', { message: `正在运行模块：${module.id}`, elapsedMs: elapsedBefore, budgetRemainingMs: remainingMs });
            report(taskId, 'stage_start', { stage: module.id, outcome: 'processing' });
            let timer;
            let abortHandler;
            const moduleController = new AbortController();
            const abortPromise = signal ? new Promise(resolve => {
                abortHandler = () => {
                    moduleController.abort();
                    resolve({ kind: 'aborted' });
                };
                signal.addEventListener('abort', abortHandler, { once: true });
            }) : new Promise(() => {});
            const timeoutPromise = new Promise(resolve => {
                timer = setTimer(() => {
                    moduleController.abort();
                    resolve({ kind: 'timeout' });
                }, Math.min(module.timeoutMs, remainingMs));
            });

            let outcome;
            try {
                const runPromise = Promise.resolve().then(() => module.run(Object.freeze({ taskId, input, previous: results.map(item => ({ ...item })), signal: moduleController.signal })));
                outcome = await Promise.race([runPromise.then(value => ({ kind: 'result', value }), error => ({ kind: 'error', error })), timeoutPromise, abortPromise]);
            } finally {
                clearTimer(timer);
                if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
            }

            if (outcome.kind === 'aborted') {
                updateTask(taskId, 'failed_unapplied', { message: `任务已取消；模块 ${module.id} 的结果不再采用。`, impact: '取消只停止本地等待/执行器，不保证模块背后的远端工作已终止。', applied: '本执行器没有提交正式状态。', nextStep: '核对外部执行情况与当前状态后再决定是否重试。' });
                report(taskId, 'task_cancelled', { stage: module.id, outcome: 'aborted' });
                return { ok: false, reason: 'aborted', results };
            }
            if (outcome.kind === 'timeout' || outcome.kind === 'error') {
                const error = outcome.kind === 'timeout' ? `超时（单模块${module.timeoutMs}ms/剩余总预算${remainingMs}ms）` : String(outcome.error?.message ?? outcome.error);
                results.push({ moduleId: module.id, ok: false, error });
                if (module.required || (outcome.kind === 'timeout' && remainingMs <= module.timeoutMs)) {
                    updateTask(taskId, 'failed_unapplied', { message: `必要模块 ${module.id} 失败：${error}`, impact: '总控执行器未提交正式状态。', applied: '无正式变更由本执行器提交。', nextStep: '检查模块错误后，以新任务重新执行。' });
                    report(taskId, 'stage_failed', { stage: module.id, outcome: outcome.kind });
                    return { ok: false, reason: outcome.kind === 'timeout' && remainingMs <= module.timeoutMs ? 'budget_exhausted' : outcome.kind, results, elapsedMs: Math.max(0, now() - startedAt) };
                }
                report(taskId, 'stage_failed', { stage: module.id, outcome: `optional_${outcome.kind}` });
                continue;
            }
            results.push({ moduleId: module.id, ok: true, value: outcome.value });
            report(taskId, 'stage_complete', { stage: module.id, outcome: 'completed' });
        }
        const elapsedMs = Math.max(0, now() - startedAt);
        const degraded = results.some(item => item.ok === false);
        report(taskId, 'candidate_ready', { outcome: degraded ? 'completed_with_optional_failures' : 'candidate_ready_not_committed', stage: null });
        return { ok: true, results, elapsedMs, degraded };
    }

    return Object.freeze({ register, list, plan, validatePlan, execute, clear });
}
