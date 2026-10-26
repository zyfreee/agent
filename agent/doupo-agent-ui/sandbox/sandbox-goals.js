const GOAL_STATES = Object.freeze(['proposed', 'active', 'achieved', 'failed', 'dropped', 'superseded']);
const OPEN_STATES = new Set(['proposed', 'active']);
const TRANSITIONS = Object.freeze({
    proposed: Object.freeze(['active', 'dropped', 'superseded']),
    active: Object.freeze(['achieved', 'failed', 'dropped', 'superseded']),
    achieved: Object.freeze([]), failed: Object.freeze([]), dropped: Object.freeze([]), superseded: Object.freeze([]),
});
const SOURCES = Object.freeze(['player', 'commission', 'self']);

function need(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}

/**
 * 玩家自设目标作为一等状态管理：提出不等于做成，达成不自动发奖，失败也要有依据。
 * 活跃目标有上限，超限时要求玩家取舍，避免无限并列导致正文失衡。
 */
export function createSandboxGoals({ maxActive = 5, now = () => new Date().toISOString() } = {}) {
    if (!Number.isInteger(maxActive) || maxActive < 1 || maxActive > 20) throw new RangeError('maxActive 必须在 1 到 20 之间');
    const goals = new Map();
    let sequence = 0;

    const scopeOf = ({ sessionId, branchId } = {}) => `${need(sessionId, 'sessionId')}\u0000${need(branchId, 'branchId')}`;

    function propose({ sessionId, branchId, description, source = 'player', feasibility, deadlineDay = null, limit } = {}) {
        scopeOf({ sessionId, branchId });
        const text = need(description, '目标描述');
        if (!SOURCES.includes(source)) throw new TypeError(`不支持的目标来源：${source}`);
        if (deadlineDay !== null && (!Number.isInteger(deadlineDay) || deadlineDay < 0)) throw new RangeError('deadlineDay 必须是非负整数或 null');
        if (!feasibility || typeof feasibility !== 'object' || Array.isArray(feasibility)) throw new TypeError('目标必须带可行性检查结果');
        const missing = Array.isArray(feasibility.missing) ? feasibility.missing.map(item => String(item)).slice(0, 8) : [];
        if (feasibility.ok !== true) return { status: 'rejected', reason: 'infeasible', missing, note: '缺少的前提要当场说明，不能让目标空转。' };
        const open = [...goals.values()].filter(goal => goal.sessionId === sessionId && goal.branchId === branchId && OPEN_STATES.has(goal.state));
        const cap = Number.isInteger(limit) && limit > 0 && limit <= 20 ? limit : maxActive;
        if (open.length >= cap) return { status: 'rejected', reason: 'goal_limit_reached', limit: cap, active: open.map(goal => goal.id), suggestion: '请先放弃或完成一条进行中的目标。' };
        const goal = { id: `goal-${++sequence}`, sessionId, branchId, description: text, source, state: 'proposed', deadlineDay, createdAt: now(), evidence: [], history: [] };
        goals.set(goal.id, goal);
        return { status: 'candidate', committed: false, goal: structuredClone(goal) };
    }

    function transition({ goalId, toState, reason = '', evidence = [] } = {}) {
        const goal = goals.get(need(goalId, 'goalId'));
        if (!goal) return { status: 'rejected', reason: 'unknown_goal' };
        if (!GOAL_STATES.includes(toState)) throw new TypeError(`不支持的目标状态：${toState}`);
        if (!TRANSITIONS[goal.state].includes(toState)) return { status: 'rejected', reason: 'illegal_transition', from: goal.state, to: toState };
        if (toState === 'achieved' || toState === 'failed') {
            const ids = Array.isArray(evidence) ? evidence.filter(item => typeof item === 'string' && item.trim()) : [];
            if (!ids.length) return { status: 'rejected', reason: 'evidence_required', note: '达成或失败都要能说出依据。' };
            goal.evidence = ids.slice(0, 16);
        }
        goal.state = toState;
        goal.history.push({ toState, reason: String(reason ?? '').trim().slice(0, 200), at: now() });
        return { status: 'candidate', committed: false, goal: structuredClone(goal) };
    }

    const activate = ({ goalId } = {}) => transition({ goalId, toState: 'active', reason: 'activate' });
    const drop = ({ goalId, reason } = {}) => transition({ goalId, toState: 'dropped', reason });
    const supersede = ({ goalId, replacedBy = '', reason } = {}) => transition({ goalId, toState: 'superseded', reason: replacedBy ? `${reason}${reason ? '；' : ''}被 ${replacedBy} 取代` : reason });
    const resolve = ({ goalId, outcome, evidence, reason } = {}) => {
        if (outcome !== 'achieved' && outcome !== 'failed') throw new TypeError('outcome 只能是 achieved 或 failed');
        return transition({ goalId, toState: outcome, evidence, reason });
    };

    function list({ sessionId, branchId } = {}) {
        const scope = scopeOf({ sessionId, branchId });
        return [...goals.values()].filter(goal => `${goal.sessionId}\u0000${goal.branchId}` === scope).map(goal => structuredClone(goal));
    }

    function activeCount({ sessionId, branchId } = {}) {
        return list({ sessionId, branchId }).filter(goal => OPEN_STATES.has(goal.state)).length;
    }

    function clear() { goals.clear(); sequence = 0; }
    return Object.freeze({ propose, activate, resolve, drop, supersede, transition, list, activeCount, clear, states: GOAL_STATES });
}

export { GOAL_STATES, TRANSITIONS as GOAL_TRANSITIONS };
