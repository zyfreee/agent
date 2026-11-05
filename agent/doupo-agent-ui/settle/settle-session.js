// Request ownership only: callers assemble full fingerprints and recheck live state before commit.
export function createSettleSession() {
    let epoch = 0;
    let sequence = 0;
    let active = null;
    let cached = null;
    const matches = (entry, { scope, fingerprint }) => entry.scope === scope && entry.fingerprint === fingerprint;

    function invalidate() {
        epoch++;
        active = null;
        cached = null;
    }

    function begin({ scope, fingerprint, force = false }) {
        if (typeof scope !== 'string' || typeof fingerprint !== 'string') {
            throw new TypeError('settle scope and fingerprint must be strings');
        }
        const context = { scope, fingerprint };
        if (!force && active && matches(active, context)) return { status: 'busy', token: active };
        if (!force && cached && matches(cached, context)) {
            return { status: 'cached', record: cached.record, text: cached.text };
        }
        invalidate();
        active = Object.freeze({ epoch, sequence: ++sequence, scope, fingerprint });
        return { status: 'started', token: active };
    }

    function isCurrent(token, context) {
        return active !== null && active === token && (!context || matches(active, context));
    }

    function finish(token, { record, text } = {}) {
        if (!isCurrent(token)) return false;
        cached = { scope: token.scope, fingerprint: token.fingerprint, record, text };
        active = null;
        return true;
    }

    function fail(token) {
        if (!isCurrent(token)) return false;
        active = null;
        cached = null;
        return true;
    }

    return { begin, isCurrent, finish, fail, invalidate };
}

// Quiet model requests also emit end events; only a foreground generation clears ownership.
export function shouldClearSettleOnGenerationEnd({ quietBusy, eventType } = {}) {
    return !quietBusy && (eventType === 'ended' || eventType === 'stopped');
}
