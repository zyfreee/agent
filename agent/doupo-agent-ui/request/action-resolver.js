function required(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}

function clone(value) { return value === undefined ? undefined : structuredClone(value); }

/** Rule-bound action proposal engine. Deliberately never mutates the caller's state. */
export function createActionResolver({ maxTransitions = 100, now = () => new Date().toISOString() } = {}) {
    if (!Number.isInteger(maxTransitions) || maxTransitions < 1 || maxTransitions > 10000) throw new RangeError('maxTransitions 必须为 1 到 10000');
    const settled = new Map();

    function resolve({ actionId, attemptId, sessionId, branchId, stateVersion, actorId, intent, rules, state } = {}) {
        actionId = required(actionId, 'actionId'); attemptId = required(attemptId, 'attemptId');
        sessionId = required(sessionId, 'sessionId'); branchId = required(branchId, 'branchId');
        stateVersion = required(stateVersion, 'stateVersion'); actorId = required(actorId, 'actorId');
        if (typeof intent !== 'object' || !intent || Array.isArray(intent)) throw new TypeError('intent 必须是结构化对象');
        const targetId = required(intent.targetId, 'intent.targetId');
        const method = required(intent.method, 'intent.method');
        if (intent.authorizedActions !== undefined && (!Array.isArray(intent.authorizedActions) || intent.authorizedActions.length > 32 || intent.authorizedActions.some(item => typeof item !== 'string'))) throw new TypeError('authorizedActions 必须是有界文本数组');
        if (intent.authorizedActions && !intent.authorizedActions.includes(`${targetId}:${method}`)) return { status: 'not_executable', reason: 'player_action_not_authorized', actionId, attemptId, changes: [] };
        if (intent.explicit !== true) return { status: 'needs_clarification', reason: 'intent_not_explicit', actionId, attemptId, changes: [], note: '查询可能性或含糊表达不能自动当成已决定执行。' };
        if (!Array.isArray(rules)) throw new TypeError('rules 必须是数组；无明示规则时不猜测成功效果');
        if (!state || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('必须提供经调用方确认的状态快照');
        const key = `${sessionId}\u0000${branchId}\u0000${actionId}\u0000${attemptId}`;
        const previous = settled.get(key);
        if (previous) return { ...clone(previous), replayed: true };
        if (settled.size >= maxTransitions) return { status: 'blocked', reason: 'transition_limit', actionId, attemptId, changes: [] };

        const applicable = rules.filter(rule => rule && rule.targetId === targetId && rule.method === method);
        if (applicable.length === 0) return { status: 'needs_clarification', reason: 'no_matching_rule', actionId, attemptId, changes: [], note: '没有与该目标和方法匹配的已登记规则；需总控补充或请求有限裁定，不编造效果。' };
        if (applicable.length > 1) return { status: 'needs_clarification', reason: 'ambiguous_rules', actionId, attemptId, ruleIds: applicable.map(rule => rule.id), changes: [] };
        const rule = applicable[0];
        if (typeof rule.id !== 'string' || !rule.id.trim() || typeof rule.version !== 'string' || !rule.version.trim() || !Array.isArray(rule.conditions) || !Array.isArray(rule.effects)) throw new TypeError('规则必须包含稳定 id、version 文本、conditions 数组和 effects 数组');
        if (rule.conditions.length > 100 || rule.effects.length > 100) throw new RangeError('规则条件/效果数量超出上限');
        const failures = [];
        for (const condition of rule.conditions) {
            if (!condition || !['gte', 'eq', 'truthy'].includes(condition.op)) return { status: 'needs_clarification', reason: 'unsupported_condition', actionId, attemptId, changes: [], ruleId: rule.id };
            const current = state[condition.targetId ?? actorId]?.[condition.field];
            if (condition.op === 'gte' && !(typeof current === 'number' && current >= condition.value)) failures.push(condition.reason ?? `${condition.targetId ?? actorId}.${condition.field} 不足`);
            else if (condition.op === 'eq' && current !== condition.value) failures.push(condition.reason ?? `${condition.targetId ?? actorId}.${condition.field} 不满足`);
            else if (condition.op === 'truthy' && !current) failures.push(condition.reason ?? `${condition.targetId ?? actorId}.${condition.field} 不具备`);
            else if (!['gte', 'eq', 'truthy'].includes(condition.op)) return { status: 'needs_clarification', reason: 'unsupported_condition', actionId, attemptId, changes: [], ruleId: rule.id };
        }
        if (failures.length) {
            const result = { status: 'not_executable', outcome: 'not_achieved', actionId, attemptId, sessionId, branchId, stateVersion, actorId, targetId, method, ruleId: rule.id, failures, changes: [], elapsed: 0, resolvedAt: now(), committed: false };
            settled.set(key, result);
            return clone(result);
        }
        if (rule.outcome !== 'achieved' && rule.outcome !== 'partial' && rule.outcome !== 'achieved_with_cost' && rule.outcome !== 'not_achieved' && rule.outcome !== 'interrupted') throw new TypeError('规则 outcome 无效');
        const changes = [];
        for (const effect of rule.effects) {
            if (!effect || !['set', 'add', 'remove'].includes(effect.type) || typeof effect.field !== 'string' || !effect.field.trim()) throw new TypeError('effect 必须有受支持的 type 和 field');
            const owner = effect.targetId ?? actorId;
            const before = state[owner]?.[effect.field];
            let after = effect.value;
            if (effect.type === 'add') {
                if (typeof before !== 'number' || typeof effect.value !== 'number') return { status: 'needs_clarification', reason: 'non_numeric_add', actionId, attemptId, changes: [], ruleId: rule.id };
                after = before + effect.value;
            }
            if (effect.type === 'remove') after = null;
            if (typeof after === 'number' && after < 0 && !effect.allowNegative) return { status: 'blocked', reason: 'resource_would_be_negative', actionId, attemptId, changes: [], ruleId: rule.id, field: effect.field };
            changes.push({ targetId: owner, field: effect.field, before, after, type: effect.type, reason: effect.reason ?? '' });
        }
        if (!Number.isFinite(rule.elapsed) || rule.elapsed < 0) throw new TypeError('rule.elapsed 必须是非负有限数字');
        const result = { status: 'candidate', outcome: rule.outcome, actionId, attemptId, sessionId, branchId, stateVersion, actorId, targetId, method, ruleId: rule.id, ruleVersion: rule.version, authorizedAction: intent.authorizedActions ? `${targetId}:${method}` : null, conditionsChecked: clone(rule.conditions), changes, elapsed: rule.elapsed, cost: rule.cost ?? null, resolvedAt: now(), committed: false, note: '这是基于该状态版本的候选结果；须由总控校验版本并交正式状态写入者提交。' };
        settled.set(key, result);
        return clone(result);
    }

    function invalidate({ sessionId, branchId, actionId, attemptId } = {}) {
        const key = [sessionId, branchId, actionId, attemptId].join('\u0000');
        return settled.delete(key);
    }
    function clear() { settled.clear(); }
    return Object.freeze({ resolve, invalidate, clear });
}
