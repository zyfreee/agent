function text(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}

function clone(value) { return structuredClone(value); }

/** In-memory transactional state boundary. It is an adapter contract, not durable storage. */
export function createStateStore({ maxRecords = 1000 } = {}) {
    if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 100000) throw new RangeError('maxRecords 必须为 1 到 100000');
    const branches = new Map();
    const commits = new Map();

    function keyOf(sessionId, branchId) { return `${sessionId}\u0000${branchId}`; }
    function read({ sessionId, branchId } = {}) {
        const key = keyOf(text(sessionId, 'sessionId'), text(branchId, 'branchId'));
        const record = branches.get(key);
        return record ? clone(record) : { exists: false, sessionId, branchId };
    }
    function seed({ sessionId, branchId, stateVersion = 'v1', state = {} } = {}) {
        sessionId = text(sessionId, 'sessionId'); branchId = text(branchId, 'branchId');
        if (!state || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('state 必须是对象');
        const key = keyOf(sessionId, branchId);
        if (branches.has(key)) throw new Error(`状态分支已存在：${sessionId}/${branchId}`);
        if (branches.size >= maxRecords) throw new Error('状态记录数量已达上限');
        const record = { sessionId, branchId, stateVersion: text(stateVersion, 'stateVersion'), state: clone(state), history: [], updatedAt: new Date().toISOString() };
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
        const version = `v${current.history.length + 2}`;
        const record = { sessionId, branchId, stateVersion: version, state: clone(candidate.nextState), history: [...current.history, { commitId, baseVersion, messageId: messageId ?? null, changes: clone(candidate.changes ?? []), committedAt: new Date().toISOString() }], updatedAt: new Date().toISOString() };
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
        const record = { sessionId, branchId: newBranchId, stateVersion: baseVersion, state: clone(source.state), history: [...source.history], forkedFrom: fromBranchId, updatedAt: new Date().toISOString() };
        branches.set(keyOf(sessionId, newBranchId), record);
        return { status: 'forked', sessionId, branchId: newBranchId, stateVersion: baseVersion };
    }
    function clear() { branches.clear(); commits.clear(); }
    return Object.freeze({ read, seed, begin, commit, fork, clear });
}
