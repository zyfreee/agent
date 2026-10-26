const STATES = Object.freeze(['candidate', 'precondition_missing', 'occurred', 'altered', 'expired', 'unreachable']);
const FINAL = new Set(['occurred', 'altered', 'expired', 'unreachable']);
const TRANSITIONS = Object.freeze({
    candidate: Object.freeze(['precondition_missing', 'occurred', 'altered', 'expired', 'unreachable']),
    precondition_missing: Object.freeze(['candidate', 'occurred', 'altered', 'expired', 'unreachable']),
    occurred: Object.freeze([]), altered: Object.freeze([]), expired: Object.freeze([]), unreachable: Object.freeze([]),
});
const KINDS = Object.freeze(['canon', 'routine']);

function need(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}

function needTextList(value, name, limit) {
    if (!Array.isArray(value) || value.length > limit || value.some(item => typeof item !== 'string' || !item.trim())) throw new TypeError(`${name} 必须是不超过 ${limit} 项的非空文本数组`);
    return [...value];
}

/**
 * 原著节点状态机。沙盒下节点不再"到点必演"，而是先查前提：
 * 前提不足记 precondition_missing，窗口过去仍未发生记 expired，玩家介入后记 altered。
 * 本模块只生成候选与状态更新建议，不写正式状态。
 */
export function createSandboxNodes({ maxNodes = 500, now = () => new Date().toISOString() } = {}) {
    if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 5000) throw new RangeError('maxNodes 必须在 1 到 5000 之间');
    const nodes = new Map();

    const scopeOf = ({ sessionId, branchId } = {}) => `${need(sessionId, 'sessionId')}\u0000${need(branchId, 'branchId')}`;

    function register(raw = {}) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('节点必须是对象');
        const id = need(raw.id, '节点 id');
        const sessionId = need(raw.sessionId, 'sessionId');
        const branchId = need(raw.branchId, 'branchId');
        if (nodes.has(id)) throw new Error(`节点 ID 已登记：${id}`);
        if (nodes.size >= maxNodes) return { status: 'blocked', reason: 'node_limit' };
        const kind = raw.kind ?? 'canon';
        if (!KINDS.includes(kind)) throw new TypeError(`不支持的节点类型：${kind}`);
        const fromDay = raw.fromDay;
        const toDay = raw.toDay ?? fromDay;
        if (!Number.isInteger(fromDay) || !Number.isInteger(toDay) || fromDay < 0 || toDay < fromDay) throw new RangeError('节点时间窗口必须是非负整数区间');
        const preconditions = Array.isArray(raw.preconditions) ? raw.preconditions.map(item => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) throw new TypeError('节点前提必须是对象');
            return { factId: need(item.factId, '前提 factId'), present: item.present !== false };
        }) : [];
        if (preconditions.length > 16) throw new RangeError('单个节点前提不得超过 16 条');
        const node = {
            id, sessionId, branchId, kind, title: need(raw.title, '节点标题'),
            fromDay, toDay, preconditions,
            drift: String(raw.drift ?? '').trim().slice(0, 500),
            participants: needTextList(raw.participants ?? [], 'participants', 32),
            interventionPoints: needTextList(raw.interventionPoints ?? [], 'interventionPoints', 16),
            state: 'candidate', registeredAt: now(), history: [],
        };
        nodes.set(id, node);
        return { status: 'registered', node: structuredClone(node) };
    }

    function get(id) {
        const node = nodes.get(id);
        return node ? structuredClone(node) : undefined;
    }

    function list({ sessionId, branchId } = {}) {
        const scope = scopeOf({ sessionId, branchId });
        return [...nodes.values()].filter(node => `${node.sessionId}\u0000${node.branchId}` === scope).map(node => structuredClone(node));
    }

    /**
     * 判定当前应当发生什么。返回候选与冲突，不修改节点状态。
     * 主线口径：到窗口结束即按排期发生。
     * 沙盒口径：强惯性按窗口起点判定，中惯性按窗口结束判定，弱惯性下原著节点不再自动发生（例行过程照旧）。
     */
    function evaluate({ sessionId, branchId, day, facts = [], mode = 'sandbox', inertia = 'medium', slackDays = 7 } = {}) {
        const scope = scopeOf({ sessionId, branchId });
        if (!Number.isInteger(day) || day < 0) throw new RangeError('day 必须是非负整数');
        if (!Number.isInteger(slackDays) || slackDays < 0 || slackDays > 365) throw new RangeError('slackDays 必须在 0 到 365 之间');
        const present = new Set(needTextList(facts, 'facts', 512));
        const out = [];
        const conflicts = [];
        const updates = [];
        for (const node of nodes.values()) {
            if (`${node.sessionId}\u0000${node.branchId}` !== scope) continue;
            if (FINAL.has(node.state)) continue;
            if (day < node.fromDay) continue;
            const missing = node.preconditions.filter(item => present.has(item.factId) !== item.present).map(item => item.factId);
            if (missing.length) {
                conflicts.push({ nodeId: node.id, reason: 'precondition_missing', missing, day });
                if (node.state !== 'precondition_missing') updates.push({ nodeId: node.id, toState: 'precondition_missing', day, reason: 'precondition_missing' });
                continue;
            }
            if (day > node.toDay + slackDays) {
                const update = { nodeId: node.id, toState: 'expired', day, reason: 'window_passed' };
                updates.push(update);
                out.push({ id: `${node.id}@expired@${day}`, nodeId: node.id, kind: node.kind, fromState: node.state, toState: 'expired', day, reason: 'window_passed', committed: false });
                continue;
            }
            const canon = node.kind === 'canon';
            let fires = false;
            let forced = false;
            if (mode === 'mainline') { fires = day >= node.toDay; forced = canon; }
            else if (canon && inertia === 'weak') {
                conflicts.push({ nodeId: node.id, reason: 'weak_inertia_skips_canon', day });
                continue;
            } else if (canon && inertia === 'strong') fires = day >= node.fromDay;
            else fires = day >= node.toDay;
            if (!fires) continue;
            const update = { nodeId: node.id, toState: 'occurred', day, reason: forced ? 'mainline_schedule' : 'inertia' };
            updates.push(update);
            out.push({ id: `${node.id}@occurred@${day}`, nodeId: node.id, kind: node.kind, fromState: node.state, toState: 'occurred', day, drift: node.drift, participants: [...node.participants], forced, reason: update.reason, committed: false });
        }
        const result = {
            status: conflicts.length ? (out.length ? 'partial' : 'needs_review') : 'candidate',
            stateVersionDay: day, day, mode, inertia, proposals: out, conflicts, updates, committed: false,
            note: '仅生成候选与状态更新建议；须经总控校验后由正式状态写入者提交。',
        };
        return structuredClone(result);
    }

    /** 只允许状态机允许的迁移；终态不再接受写入，避免正文把没发生的节点写成已经发生。 */
    function apply({ sessionId, branchId, taskId, stateVersion, updates } = {}) {
        scopeOf({ sessionId, branchId });
        const task = need(taskId, 'taskId');
        const version = need(stateVersion, 'stateVersion');
        if (!Array.isArray(updates) || updates.length > 200) throw new RangeError('updates 必须是有界数组');
        const applied = [];
        const conflicts = [];
        for (const update of updates) {
            const node = update && nodes.get(update.nodeId);
            if (!node) { conflicts.push({ nodeId: update?.nodeId ?? null, reason: 'unknown_node' }); continue; }
            if (node.sessionId !== sessionId || node.branchId !== branchId) { conflicts.push({ nodeId: node.id, reason: 'scope_mismatch' }); continue; }
            const toState = update.toState;
            if (!TRANSITIONS[node.state].includes(toState)) { conflicts.push({ nodeId: node.id, reason: 'illegal_transition', from: node.state, to: toState }); continue; }
            node.state = toState;
            node.history.push({ toState, taskId: task, stateVersion: version, day: update.day ?? null, reason: String(update.reason ?? '').trim().slice(0, 200), at: now() });
            applied.push({ nodeId: node.id, toState });
        }
        return { status: conflicts.length ? (applied.length ? 'partial' : 'rejected') : 'applied', applied, conflicts, committed: false };
    }

    function intervene({ sessionId, branchId, nodeId, day, reason = '玩家介入' } = {}) {
        scopeOf({ sessionId, branchId });
        const node = nodes.get(need(nodeId, 'nodeId'));
        if (!node) return { status: 'rejected', reason: 'unknown_node' };
        if (FINAL.has(node.state)) return { status: 'rejected', reason: 'node_already_settled', state: node.state };
        return { status: 'candidate', committed: false, update: { nodeId: node.id, toState: 'altered', day, reason } };
    }

    function clear() { nodes.clear(); }
    return Object.freeze({ register, get, list, evaluate, apply, intervene, clear, states: STATES });
}

export { STATES as NODE_STATES, TRANSITIONS as NODE_TRANSITIONS, FINAL as NODE_FINAL_STATES };
