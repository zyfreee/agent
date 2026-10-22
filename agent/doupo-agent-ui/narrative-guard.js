const KINDS = new Set(['flavor', 'fact', 'player-visible']);

function need(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}

/** Validates a structured narrative package against approved, player-visible facts. */
export function createNarrativeGuard({ maxClaims = 50, maxTextLength = 20000 } = {}) {
    if (!Number.isInteger(maxClaims) || maxClaims < 1 || maxClaims > 500) throw new RangeError('maxClaims 必须为 1 到 500');
    if (!Number.isInteger(maxTextLength) || maxTextLength < 1 || maxTextLength > 100000) throw new RangeError('maxTextLength 必须为 1 到 100000');
    const accepted = new Map();

    function validate({ sessionId, branchId, taskId, stateVersion, text, claims, visibleFactIds = [], approvedChanges = [], npcPlanVersions = [] } = {}) {
        sessionId = need(sessionId, 'sessionId'); branchId = need(branchId, 'branchId'); taskId = need(taskId, 'taskId'); stateVersion = need(stateVersion, 'stateVersion');
        if (typeof text !== 'string' || !text.trim()) throw new TypeError('正文必须是非空文本');
        if (text.length > maxTextLength) return { status: 'rejected', reason: 'text_limit', taskId };
        if (!Array.isArray(claims) || claims.length > maxClaims) throw new TypeError('claims 必须是有界数组');
        if (!Array.isArray(visibleFactIds) || !Array.isArray(approvedChanges) || !Array.isArray(npcPlanVersions)) throw new TypeError('visibleFactIds/approvedChanges/npcPlanVersions 必须是数组');
        const planVersions = npcPlanVersions.map(item => typeof item === 'string' ? item : `${item?.npcId ?? ''}:${item?.planId ?? ''}:${item?.version ?? ''}`).filter(Boolean);
        const key = `${sessionId}\u0000${branchId}\u0000${stateVersion}\u0000${taskId}`;
        const previous = accepted.get(key);
        if (previous) return { ...structuredClone(previous), replayed: true };
        const visible = new Set(visibleFactIds.map(String));
        const approved = new Set(approvedChanges.map(item => typeof item === 'string' ? item : item?.id).filter(Boolean).map(String));
        const unknown = [];
        const hidden = [];
        const malformed = [];
        for (const claim of claims) {
            if (!claim || typeof claim !== 'object' || !KINDS.has(claim.kind) || typeof claim.text !== 'string' || !claim.text.trim()) {
                malformed.push(claim?.id ?? null); continue;
            }
            const refs = Array.isArray(claim.factIds) ? claim.factIds.map(String) : [];
            if (claim.kind !== 'flavor' && refs.length === 0) { malformed.push(claim.id ?? null); continue; }
            for (const ref of refs) {
                if (!visible.has(ref) && !approved.has(ref)) hidden.push(ref);
                if (!visible.has(ref) && !approved.has(ref) && claim.kind === 'fact') unknown.push(ref);
            }
        }
        if (malformed.length) return { status: 'rejected', reason: 'malformed_claims', taskId, malformed };
        if (hidden.length) return { status: 'rejected', reason: 'unapproved_or_hidden_fact', taskId, factIds: [...new Set(hidden)] };
        const result = { status: 'candidate', sessionId, branchId, taskId, stateVersion, text, claims: structuredClone(claims), visibleFactIds: [...visible], approvedChangeIds: [...approved], npcPlanVersions: [...new Set(planVersions)], committed: false, playerActionAdded: claims.some(claim => claim.kind === 'fact' && claim.playerAction === true), note: '正文候选通过结构/范围检查，仍需总控确认并提交。' };
        accepted.set(key, result);
        return structuredClone(result);
    }

    function clearBranch(sessionId, branchId) {
        const prefix = `${sessionId}\u0000${branchId}\u0000`;
        let count = 0;
        for (const key of accepted.keys()) if (key.startsWith(prefix)) { accepted.delete(key); count++; }
        return count;
    }
    function invalidateNpcPlanVersion({ sessionId, branchId, stateVersion, npcId, planId, previousVersion } = {}) {
        sessionId = need(sessionId, 'sessionId'); branchId = need(branchId, 'branchId'); stateVersion = need(stateVersion, 'stateVersion'); npcId = need(npcId, 'npcId'); planId = need(planId, 'planId');
        if (!Number.isInteger(previousVersion) || previousVersion < 1) return { status: 'rejected', reason: 'invalid_plan_version', cleared: 0 };
        const fingerprint = `${npcId}:${planId}:${previousVersion}`;
        const taskIds = [];
        for (const [key, candidate] of accepted) {
            if (candidate.sessionId === sessionId && candidate.branchId === branchId && candidate.stateVersion === stateVersion && candidate.npcPlanVersions.includes(fingerprint)) { accepted.delete(key); taskIds.push(candidate.taskId); }
        }
        return { status: taskIds.length ? 'invalidated' : 'no_matching_candidate', reason: 'npc_plan_changed', npcId, planId, planVersion: previousVersion, cleared: taskIds.length, taskIds };
    }
    function clearTask(sessionId, branchId, stateVersion, taskId) {
        sessionId = need(sessionId, 'sessionId'); branchId = need(branchId, 'branchId'); stateVersion = need(stateVersion, 'stateVersion'); taskId = need(taskId, 'taskId');
        const key = `${sessionId}\u0000${branchId}\u0000${stateVersion}\u0000${taskId}`;
        const existed = accepted.delete(key);
        return existed ? 1 : 0;
    }
    function clearStateVersion(sessionId, branchId, stateVersion) {
        sessionId = need(sessionId, 'sessionId'); branchId = need(branchId, 'branchId'); stateVersion = need(stateVersion, 'stateVersion');
        const prefix = `${sessionId}\u0000${branchId}\u0000${stateVersion}\u0000`;
        let count = 0;
        for (const key of accepted.keys()) if (key.startsWith(prefix)) { accepted.delete(key); count++; }
        return count;
    }
    function clear() { accepted.clear(); }
    return Object.freeze({ validate, invalidateNpcPlanVersion, clearTask, clearBranch, clearStateVersion, clear });
}
