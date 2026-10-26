import { normalizeInertia, normalizeMode } from './sandbox-mode.js';

/**
 * 沙盒回合推进器：把节点到点判定、惯性推进、委托到期合成一批有界候选。
 * 只产出候选与状态更新建议；是否发生、是否提交由总控与正式状态写入者决定。
 */
export function createSandboxEngine({ nodes, goals, leads, now = () => new Date().toISOString(), maxProposals = 12 } = {}) {
    if (!Number.isInteger(maxProposals) || maxProposals < 1 || maxProposals > 64) throw new RangeError('maxProposals 必须在 1 到 64 之间');
    const runs = new Map();

    function advance(raw = {}) {
        // 模块调度会把结构化输入原样交给适配器；缺字段时只跳过本轮，不让整条任务失败。
        const missing = [];
        for (const name of ['sessionId', 'branchId', 'taskId', 'stateVersion']) {
            if (typeof raw[name] !== 'string' || !raw[name].trim()) missing.push(name);
        }
        const day = raw.day;
        if (!Number.isInteger(day) || day < 0) missing.push('day');
        if (missing.length) return { status: 'skipped', reason: 'insufficient_input', missing, proposals: [], committed: false, note: '沙盒推进要会话、分支、任务、状态版本和游戏日；缺任一项时本轮不判定，也不篡改正文。' };
        const sessionId = raw.sessionId.trim();
        const branchId = raw.branchId.trim();
        const taskId = raw.taskId.trim();
        const stateVersion = raw.stateVersion.trim();
        const facts = Array.isArray(raw.facts) ? raw.facts : [];
        const slackDays = raw.slackDays ?? 7;
        const kind = normalizeMode(raw.mode ?? 'sandbox');
        const level = normalizeInertia(raw.inertia);
        const key = `${sessionId}\u0000${branchId}\u0000${taskId}`;
        const prior = runs.get(key);
        if (prior) {
            if (prior.stateVersion !== stateVersion || prior.day !== day || prior.mode !== kind || prior.inertia !== level) return { status: 'stale_or_conflicting_retry', taskId, proposals: [], committed: false };
            return { ...structuredClone(prior), replayed: true };
        }
        const nodeResult = nodes?.evaluate ? nodes.evaluate({ sessionId, branchId, day, facts, mode: kind, inertia: level, slackDays }) : { proposals: [], conflicts: [], updates: [] };
        const leadResult = leads?.expire ? leads.expire({ sessionId, branchId, day }) : { proposals: [], updates: [] };
        const merged = [...nodeResult.proposals, ...leadResult.proposals];
        const proposals = merged.slice(0, maxProposals);
        const dropped = merged.length - proposals.length;
        const conflicts = [...(nodeResult.conflicts ?? []), ...(dropped > 0 ? [{ reason: 'proposal_budget_exceeded', dropped }] : [])];
        const result = {
            status: conflicts.length ? (proposals.length ? 'partial' : 'needs_review') : proposals.length ? 'candidate' : 'empty',
            sessionId, branchId, taskId, stateVersion, day, mode: kind, inertia: level,
            proposals, nodeUpdates: nodeResult.updates ?? [], leadUpdates: leadResult.updates ?? [], conflicts,
            budget: { limit: maxProposals, used: proposals.length, dropped },
            openGoals: goals?.activeCount ? goals.activeCount({ sessionId, branchId }) : null,
            committed: false, createdAt: now(),
            note: '候选不等于已发生；须经总控校验与提交后才是正式事实。',
        };
        runs.set(key, result);
        return structuredClone(result);
    }

    function invalidate({ sessionId, branchId, taskId } = {}) { return runs.delete([sessionId, branchId, taskId].join('\u0000')); }
    function clear() { runs.clear(); }
    return Object.freeze({ advance, invalidate, clear });
}
