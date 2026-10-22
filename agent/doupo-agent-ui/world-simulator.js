function need(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}

/** Bounded deterministic advancement of caller-supplied processes; emits proposals only. */
export function createWorldSimulator({ maxDaysPerAdvance = 365, maxProcesses = 1000, now = () => new Date().toISOString() } = {}) {
    if (!Number.isInteger(maxDaysPerAdvance) || maxDaysPerAdvance < 1 || maxDaysPerAdvance > 3650) throw new RangeError('maxDaysPerAdvance 必须为 1 到 3650');
    if (!Number.isInteger(maxProcesses) || maxProcesses < 1 || maxProcesses > 10000) throw new RangeError('maxProcesses 必须为 1 到 10000');
    const advances = new Map();

    function advance({ sessionId, branchId, taskId, stateVersion, fromDay, toDay, state, processes } = {}) {
        sessionId = need(sessionId, 'sessionId'); branchId = need(branchId, 'branchId'); taskId = need(taskId, 'taskId'); stateVersion = need(stateVersion, 'stateVersion');
        if (!Number.isInteger(fromDay) || !Number.isInteger(toDay) || fromDay < 0 || toDay < fromDay) throw new RangeError('fromDay/toDay 必须是递增的非负整数');
        if (toDay - fromDay > maxDaysPerAdvance) throw new RangeError('单次游戏时间推进超出上限');
        if (!state || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('state 必须是调用方确认的快照');
        if (!Array.isArray(processes) || processes.length > maxProcesses) throw new RangeError('processes 必须是数组且不超过上限');
        const key = `${sessionId}\u0000${branchId}\u0000${taskId}`;
        const prior = advances.get(key);
        if (prior) {
            if (prior.stateVersion !== stateVersion || prior.fromDay !== fromDay || prior.toDay !== toDay) return { status: 'stale_or_conflicting_retry', taskId, proposals: [] };
            return { ...structuredClone(prior), replayed: true };
        }
        if (advances.size >= maxProcesses) return { status: 'blocked', reason: 'advance_limit', taskId, proposals: [] };
        const proposals = [];
        const conflicts = [];
        const seenProcessIds = new Set();
        for (const process of processes) {
            if (process && typeof process === 'object' && typeof process.id === 'string' && process.id.trim()) {
                if (seenProcessIds.has(process.id)) { conflicts.push({ processId: process.id, reason: 'duplicate_process_id' }); continue; }
                seenProcessIds.add(process.id);
            }
            if (!process || typeof process !== 'object' || typeof process.id !== 'string' || !process.id.trim()) throw new TypeError('每个过程须有 id');
            if (process.status === 'active' && (typeof process.ruleVersion !== 'string' || !process.ruleVersion.trim())) { conflicts.push({ processId: process.id, reason: 'missing_rule_version' }); continue; }
            if (process.evidenceIds !== undefined && (!Array.isArray(process.evidenceIds) || process.evidenceIds.length > 32 || process.evidenceIds.some(id => typeof id !== 'string' || !id.trim()))) throw new TypeError(`过程 ${process.id} 的 evidenceIds 必须是有界文本数组`);
            if (process.sessionId !== sessionId || process.branchId !== branchId) { conflicts.push({ processId: process.id, reason: 'scope_mismatch' }); continue; }
            if (process.stateVersion !== stateVersion) { conflicts.push({ processId: process.id, reason: 'state_version_mismatch' }); continue; }
            const start = Math.max(fromDay, process.startDay ?? fromDay);
            const end = Math.min(toDay, process.endDay ?? toDay);
            if (end <= start) continue;
            if (process.status !== 'active') continue;
            if (process.requiresIndividualDecision === true) { conflicts.push({ processId: process.id, reason: 'individual_decision_required' }); continue; }
            if (!Number.isInteger(process.dailyDelta)) throw new TypeError(`过程 ${process.id} 缺少整数 dailyDelta`);
            const elapsed = end - start;
            const field = need(process.field, 'process.field');
            const targetId = need(process.targetId, 'process.targetId');
            const current = state[targetId]?.[field];
            if (typeof current !== 'number') { conflicts.push({ processId: process.id, reason: 'state_field_missing' }); continue; }
            const amount = elapsed * process.dailyDelta;
            const next = current + amount;
            if (next < 0 && process.allowNegative !== true) { conflicts.push({ processId: process.id, reason: 'would_be_negative', current, amount }); continue; }
            proposals.push({ id: `${taskId}:${process.id}`, processId: process.id, sessionId, branchId, stateVersion, fromDay: start, toDay: end, elapsedDays: elapsed, targetId, field, before: current, after: next, amount, origin: 'world', committed: false, causedByPlayer: process.causedByPlayer === true, ruleVersion: process.ruleVersion, evidenceIds: [...(process.evidenceIds ?? [])], reason: process.reason ?? '' });
        }
        const result = { status: conflicts.length ? (proposals.length ? 'partial' : 'needs_review') : 'candidate', sessionId, branchId, taskId, stateVersion, fromDay, toDay, proposals, conflicts, createdAt: now(), committed: false, note: '仅对明确登记且不需个人决策的过程生成候选；须经总控校验及正式状态写入者提交。' };
        advances.set(key, result);
        return structuredClone(result);
    }
    function invalidate({ sessionId, branchId, taskId } = {}) { return advances.delete([sessionId, branchId, taskId].join('\u0000')); }
    function clear() { advances.clear(); }
    return Object.freeze({ advance, invalidate, clear });
}
