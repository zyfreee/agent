const CERTAINTIES = new Set(['certain', 'conditional', 'speculative']);
const EFFECT_TYPES = new Set(['set', 'add', 'remove']);

function text(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}

/** Creates bounded, branch-scoped impact proposals; it never commits game state. */
export function createImpactEngine({ maxProposals = 40, maxChainDepth = 4 } = {}) {
    if (!Number.isInteger(maxProposals) || maxProposals < 1 || maxProposals > 500) throw new RangeError('maxProposals 必须为 1 到 500');
    if (!Number.isInteger(maxChainDepth) || maxChainDepth < 1 || maxChainDepth > 12) throw new RangeError('maxChainDepth 必须为 1 到 12');
    const proposals = new Map();
    const processedEvents = new Set();

    function submit({ sessionId, branchId, eventId, stateVersion, origin, changes, chainDepth = 1 } = {}) {
        sessionId = text(sessionId, 'sessionId'); branchId = text(branchId, 'branchId');
        eventId = text(eventId, 'eventId'); stateVersion = text(stateVersion, 'stateVersion');
        if (!['player', 'world', 'other'].includes(origin)) throw new TypeError('origin 必须为 player、world 或 other');
        if (!Array.isArray(changes) || changes.length === 0) throw new TypeError('changes 必须是非空数组');
        if (!Number.isInteger(chainDepth) || chainDepth < 1) throw new RangeError('chainDepth 必须是正整数');
        const scope = `${sessionId}\u0000${branchId}\u0000${eventId}`;
        if (processedEvents.has(scope)) return { accepted: false, reason: 'duplicate_event' };
        const available = maxProposals - proposals.size;
        const acceptedChanges = changes.slice(0, Math.max(0, available));
        const skipped = changes.slice(acceptedChanges.length).map(item => item?.id ?? null);
        const ids = new Set();
        const staged = [];
        for (const item of acceptedChanges) {
            const id = text(item?.id, 'proposal id');
            if (ids.has(id) || proposals.has(`${scope}\u0000${id}`)) throw new Error(`proposal id 重复：${id}`);
            ids.add(id);
            if (!CERTAINTIES.has(item.certainty)) throw new TypeError(`certainty 无效：${item.certainty}`);
            if (!EFFECT_TYPES.has(item.effect?.type)) throw new TypeError(`effect.type 无效：${item.effect?.type}`);
            if (item.certainty === 'conditional') {
                if (typeof item.condition !== 'string' || !item.condition.trim()) throw new TypeError('条件性影响必须写明生效条件');
            }
            if (item.certainty === 'speculative' && item.apply === true) throw new Error('推测性影响不能直接应用');
            const targetId = text(item.targetId, 'targetId');
            const field = text(item.effect.field, 'effect.field');
            if (chainDepth > maxChainDepth) throw new RangeError('影响连锁深度超出上限');
            staged.push(Object.freeze({
                id, sessionId, branchId, eventId, stateVersion, origin,
                attributedToPlayer: origin === 'player', targetId, field,
                certainty: item.certainty, condition: item.condition ?? null,
                effect: Object.freeze({ type: item.effect.type, field, value: item.effect.value }),
                rationale: typeof item.rationale === 'string' ? item.rationale : '',
                chainDepth, status: item.certainty === 'speculative' ? 'speculative' : item.certainty === 'conditional' ? 'pending-condition' : 'proposed',
            }));
        }
        for (const item of staged) proposals.set(`${scope}\u0000${item.id}`, item);
        processedEvents.add(scope);
        return { accepted: true, eventScope: scope, proposals: staged.map(item => ({ ...item })), skipped, truncated: skipped.length > 0 };
    }

    function evaluate({ sessionId, branchId, stateVersion, facts = {}, knownConditions = [] } = {}) {
        sessionId = text(sessionId, 'sessionId'); branchId = text(branchId, 'branchId'); stateVersion = text(stateVersion, 'stateVersion');
        const known = new Set(knownConditions);
        const changes = [];
        const pending = [];
        const speculative = [];
        const stale = [];
        for (const [key, proposal] of proposals) {
            if (proposal.sessionId !== sessionId || proposal.branchId !== branchId) continue;
            if (proposal.stateVersion !== stateVersion) { stale.push(proposal.id); continue; }
            if (proposal.certainty === 'speculative') { speculative.push(proposal.id); continue; }
            if (proposal.certainty === 'conditional' && !known.has(proposal.condition)) { pending.push(proposal.id); continue; }
            const oldValue = facts[proposal.targetId]?.[proposal.field];
            let value = proposal.effect.value;
            if (proposal.effect.type === 'add') {
                if (typeof oldValue !== 'number' || typeof value !== 'number') { pending.push(proposal.id); continue; }
                value = oldValue + value;
            }
            changes.push({ proposalId: proposal.id, targetId: proposal.targetId, field: proposal.field, before: oldValue, after: proposal.effect.type === 'remove' ? null : value, effectType: proposal.effect.type, origin: proposal.origin, attributedToPlayer: proposal.attributedToPlayer, rationale: proposal.rationale });
            proposals.set(key, Object.freeze({ ...proposal, status: 'candidate' }));
        }
        return { sessionId, branchId, stateVersion, changes, pending, speculative, stale, requiresCommit: changes.length > 0, committed: false };
    }

    function list({ sessionId, branchId } = {}) {
        return [...proposals.values()].filter(item => (!sessionId || item.sessionId === sessionId) && (!branchId || item.branchId === branchId)).map(item => ({ ...item }));
    }

    function clearBranch(sessionId, branchId) {
        const scopePrefix = `${sessionId}\u0000${branchId}\u0000`;
        let removed = 0;
        for (const [key, item] of proposals) if (key.startsWith(scopePrefix)) { proposals.delete(key); removed++; }
        for (const key of processedEvents) if (key.startsWith(scopePrefix)) processedEvents.delete(key);
        return removed;
    }

    function clear() { proposals.clear(); processedEvents.clear(); }
    return Object.freeze({ submit, evaluate, list, clearBranch, clear });
}
