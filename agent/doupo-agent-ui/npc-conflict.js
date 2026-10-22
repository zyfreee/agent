function text(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}

function list(value, name) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) throw new TypeError(`${name} 必须是文本数组`);
    return [...new Set(value.map(item => item.trim()))];
}

/** Coordinates already-reviewed NPC intents without treating one NPC as unanimous authority. */
export function createNpcConflictCoordinator({ maxDecisions = 20 } = {}) {
    if (!Number.isInteger(maxDecisions) || maxDecisions < 1 || maxDecisions > 100) throw new RangeError('maxDecisions 必须为 1 到 100');

    function coordinate({ sessionId, branchId, stateVersion, decisionKey, decisions = [] } = {}) {
        sessionId = text(sessionId, 'sessionId');
        branchId = text(branchId, 'branchId');
        stateVersion = text(stateVersion, 'stateVersion');
        decisionKey = text(decisionKey, 'decisionKey');
        if (!Array.isArray(decisions) || decisions.length > maxDecisions) throw new TypeError('decisions 必须是有界数组');
        const seen = new Set();
        const valid = [];
        const rejected = [];
        for (const item of decisions) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) throw new TypeError('decision 必须是对象');
            const npcId = text(item.npcId, 'decision.npcId');
            if (seen.has(npcId)) { rejected.push({ npcId, reason: 'duplicate_npc_decision' }); continue; }
            seen.add(npcId);
            const authority = item.authority;
            if (!authority || authority.allowed !== true) { rejected.push({ npcId, reason: 'missing_decision_authority' }); continue; }
            if (authority.stateVersion && authority.stateVersion !== stateVersion) { rejected.push({ npcId, reason: 'authority_state_mismatch' }); continue; }
            const intents = list(authority.allowedIntents, 'authority.allowedIntents');
            if (intents.length && !intents.includes(item.intent)) { rejected.push({ npcId, reason: 'intent_not_permitted' }); continue; }
            const represents = list(authority.represents, 'authority.represents');
            const rank = authority.rank === undefined ? 0 : authority.rank;
            if (!Number.isInteger(rank) || rank < 0 || rank > 1000) throw new TypeError('authority.rank 必须为 0 到 1000 的整数');
            valid.push({ npcId, intent: text(item.intent, 'decision.intent'), targetId: item.targetId ? text(item.targetId, 'decision.targetId') : null, rank, represents });
        }
        const groups = new Map();
        for (const item of valid) {
            const key = item.targetId ?? decisionKey;
            const group = groups.get(key) ?? [];
            group.push(item); groups.set(key, group);
        }
        const outcomes = [];
        for (const [target, group] of groups) {
            const intents = new Set(group.map(item => item.intent));
            if (intents.size === 1) { outcomes.push({ status: 'coordinated', targetId: target, decision: group[0], participants: group.map(item => item.npcId) }); continue; }
            const highest = Math.max(...group.map(item => item.rank));
            const winners = group.filter(item => item.rank === highest);
            if (winners.length !== 1) { outcomes.push({ status: 'needs_review', reason: 'conflicting_equal_authority', targetId: target, participants: group.map(item => item.npcId) }); continue; }
            const winner = winners[0];
            const covered = new Set([winner.npcId, ...winner.represents]);
            const uncovered = group.filter(item => !covered.has(item.npcId)).map(item => item.npcId);
            outcomes.push(uncovered.length ? { status: 'needs_review', reason: 'authority_scope_incomplete', targetId: target, winner: winner.npcId, uncovered } : { status: 'coordinated', targetId: target, decision: winner, participants: group.map(item => item.npcId), authorityOverride: true });
        }
        const status = rejected.length || outcomes.some(item => item.status === 'needs_review') ? 'needs_review' : 'coordinated';
        return Object.freeze({ status, sessionId, branchId, stateVersion, decisionKey, outcomes, rejected });
    }
    return Object.freeze({ coordinate });
}
