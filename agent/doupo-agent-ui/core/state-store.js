function text(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}

function clone(value) { return structuredClone(value); }

function versionIndex(version) {
    const match = typeof version === 'string' ? /^v(\d+)$/.exec(version.trim()) : null;
    return match ? Number(match[1]) : 1;
}

/** Branch-scoped transactional state boundary used by the turn orchestrator. */
export function createStateStore({ maxRecords = 1000 } = {}) {
    if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 100000) throw new RangeError('maxRecords 必须为 1 到 100000');
    const branches = new Map();
    const commits = new Map();

    function keyOf(sessionId, branchId) { return `${sessionId}\u0000${branchId}`; }
    function read({ sessionId, branchId } = {}) {
        const key = keyOf(text(sessionId, 'sessionId'), text(branchId, 'branchId'));
        const record = branches.get(key);
        return record ? { ...clone(record), exists: true } : { exists: false, sessionId, branchId };
    }
    function seed({ sessionId, branchId, stateVersion = 'v1', state = {}, history = [], baseVersion, baseState } = {}) {
        sessionId = text(sessionId, 'sessionId'); branchId = text(branchId, 'branchId');
        if (!state || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('state 必须是对象');
        if (!Array.isArray(history)) throw new TypeError('history 必须是数组');
        const key = keyOf(sessionId, branchId);
        if (branches.has(key)) throw new Error(`状态分支已存在：${sessionId}/${branchId}`);
        if (branches.size >= maxRecords) throw new Error('状态记录数量已达上限');
        const normalizedVersion = text(stateVersion, 'stateVersion');
        const record = { sessionId, branchId, stateVersion: normalizedVersion, versionIndex: versionIndex(normalizedVersion), baseVersion: typeof baseVersion === 'string' && baseVersion.trim() ? baseVersion.trim() : normalizedVersion, state: clone(state), baseState: baseState && typeof baseState === 'object' ? clone(baseState) : clone(state), history: clone(history), updatedAt: new Date().toISOString() };
        branches.set(key, record);
        return clone(record);
    }
    function begin({ sessionId, branchId, baseVersion, commitId, candidate } = {}) {
        sessionId = text(sessionId, 'sessionId'); branchId = text(branchId, 'branchId'); baseVersion = text(baseVersion, 'baseVersion'); commitId = text(commitId, 'commitId');
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new TypeError('candidate 必须是对象');
        const key = keyOf(sessionId, branchId); const current = branches.get(key);
        if (!current) return { status: 'missing_branch', commitId };
        if (commits.has(`${key}\u0000${commitId}`)) return { status: 'duplicate_commit', commitId, result: clone(commits.get(`${key}\u0000${commitId}`)) };
        if (current.stateVersion !== baseVersion) return { status: 'stale_state', commitId, currentVersion: current.stateVersion };
        return { status: 'ready', commitId, sessionId, branchId, baseVersion, candidate: clone(candidate) };
    }
    function commit({ sessionId, branchId, baseVersion, commitId, candidate, messageId } = {}) {
        const prepared = begin({ sessionId, branchId, baseVersion, commitId, candidate });
        if (prepared.status !== 'ready') return prepared;
        if (!candidate.nextState || typeof candidate.nextState !== 'object' || Array.isArray(candidate.nextState)) return { status: 'rejected', reason: 'missing_next_state', commitId };
        const key = keyOf(sessionId, branchId); const current = branches.get(key);
        const nextIndex = Number.isInteger(current.versionIndex) ? current.versionIndex + 1 : current.history.length + 2;
        const version = `v${nextIndex}`;
        const record = { sessionId, branchId, stateVersion: version, versionIndex: nextIndex, state: clone(candidate.nextState), baseVersion: current.baseVersion ?? baseVersion, baseState: current.baseState ?? null, history: [...current.history, { commitId, baseVersion, stateVersion: version, messageId: messageId ?? null, changes: clone(candidate.changes ?? []), state: clone(candidate.nextState), committedAt: new Date().toISOString() }], updatedAt: new Date().toISOString() };
        branches.set(key, record);
        const result = { status: 'committed', commitId, sessionId, branchId, previousVersion: baseVersion, stateVersion: version, messageId: messageId ?? null };
        commits.set(`${key}\u0000${commitId}`, result);
        return clone(result);
    }
    function fork({ sessionId, fromBranchId, newBranchId, baseVersion } = {}) {
        sessionId = text(sessionId, 'sessionId'); fromBranchId = text(fromBranchId, 'fromBranchId'); newBranchId = text(newBranchId, 'newBranchId'); baseVersion = text(baseVersion, 'baseVersion');
        const source = branches.get(keyOf(sessionId, fromBranchId));
        if (!source) return { status: 'missing_branch' };
        if (source.stateVersion !== baseVersion) return { status: 'stale_state', currentVersion: source.stateVersion };
        if (branches.has(keyOf(sessionId, newBranchId))) return { status: 'branch_exists' };
        const record = { sessionId, branchId: newBranchId, stateVersion: baseVersion, versionIndex: versionIndex(baseVersion), state: clone(source.state), baseVersion: source.baseVersion ?? baseVersion, baseState: source.baseState ? clone(source.baseState) : null, history: [...source.history], forkedFrom: fromBranchId, updatedAt: new Date().toISOString() };
        branches.set(keyOf(sessionId, newBranchId), record);
        return { status: 'forked', sessionId, branchId: newBranchId, stateVersion: baseVersion };
    }
    /** Replays an earlier state as a new version; history is never rewritten. */
    function rollback({ sessionId, branchId, targetVersion, commitId, messageId } = {}) {
        sessionId = text(sessionId, 'sessionId'); branchId = text(branchId, 'branchId'); targetVersion = text(targetVersion, 'targetVersion'); commitId = text(commitId, 'commitId');
        const key = keyOf(sessionId, branchId);
        const current = branches.get(key);
        if (!current) return { status: 'missing_branch' };
        if (commits.has(`${key}\u0000${commitId}`)) return { status: 'duplicate_commit', commitId, result: clone(commits.get(`${key}\u0000${commitId}`)) };
        let sourceState = null;
        if (current.stateVersion === targetVersion) sourceState = current.state;
        if (!sourceState) {
            const entry = current.history.find(item => item?.stateVersion === targetVersion && item?.state);
            if (entry) sourceState = entry.state;
        }
        if (!sourceState && current.baseVersion === targetVersion && current.baseState) sourceState = current.baseState;
        if (!sourceState) return { status: 'unknown_version', targetVersion };
        const nextIndex = (Number.isInteger(current.versionIndex) ? current.versionIndex : current.history.length + 1) + 1;
        const version = `v${nextIndex}`;
        const record = {
            sessionId, branchId, stateVersion: version, versionIndex: nextIndex,
            state: clone(sourceState), baseVersion: current.baseVersion ?? current.stateVersion, baseState: current.baseState ?? null,
            history: [...current.history, { commitId, baseVersion: current.stateVersion, stateVersion: version, messageId: messageId ?? null, changes: [], state: clone(sourceState), rolledBackTo: targetVersion, committedAt: new Date().toISOString() }],
            updatedAt: new Date().toISOString(),
        };
        branches.set(key, record);
        const result = { status: 'rolled_back', commitId, sessionId, branchId, fromVersion: current.stateVersion, targetVersion, stateVersion: version, state: clone(sourceState) };
        commits.set(`${key}\u0000${commitId}`, result);
        return clone(result);
    }
    function clear() { branches.clear(); commits.clear(); }
    return Object.freeze({ read, seed, begin, commit, fork, rollback, clear });
}
