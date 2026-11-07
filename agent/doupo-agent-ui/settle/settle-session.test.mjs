import assert from 'node:assert/strict';
import { createSettleSession, shouldClearSettleOnGenerationEnd } from './settle-session.js';

const scope = JSON.stringify({ agent: 'player', chat: 'one', branch: 'main' });
const otherScope = JSON.stringify({ agent: 'player', chat: 'two', branch: 'main' });
const context = { scope, fingerprint: JSON.stringify({ user: '修炼', system: '规则', overrides: {}, state: { hp: 100 } }) };
const result = { record: { category: 'cultivation', effects: [] }, text: '本轮判定' };

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

// Model substitute: no timers/network/host. The caller checks ownership before any write.
function request(session, input, pending, commits, liveContext = () => input) {
    const started = session.begin(input);
    assert.equal(started.status, 'started');
    const done = (async () => {
        try {
            const value = await pending.promise;
            if (!session.isCurrent(started.token, liveContext())) return false;
            commits.push(value);
            return session.finish(started.token, value);
        } catch {
            session.fail(started.token);
            return false;
        }
    })();
    return { ...started, done };
}

// Exact duplicate while running is busy, not cached or another token.
{
    const session = createSettleSession();
    const first = session.begin(context);
    assert.equal(first.status, 'started');
    assert.equal(Object.isFrozen(first.token), true);
    assert.equal(first.token.scope, scope);
    assert.equal(first.token.fingerprint, context.fingerprint);
    assert.equal(Number.isInteger(first.token.epoch), true);
    assert.equal(Number.isInteger(first.token.sequence), true);
    assert.throws(() => { first.token.scope = otherScope; }, TypeError);
    assert.deepEqual(session.begin(context), { status: 'busy', token: first.token });
    assert.equal(session.isCurrent(first.token, context), true);
    assert.equal(session.isCurrent(first.token), true);
    assert.equal(session.isCurrent(first.token, { ...context, scope: otherScope }), false);
    assert.equal(session.isCurrent(first.token, { ...context, fingerprint: `${context.fingerprint}!` }), false);
    assert.equal(session.isCurrent({ ...first.token }, context), false, 'a copied token does not own the request');
    assert.equal(createSettleSession().isCurrent(first.token, context), false);
    assert.equal(session.finish({ ...first.token }, result), false);
    assert.equal(session.fail(null), false);
    assert.equal(session.finish(first.token, result), true);
    assert.equal(session.isCurrent(first.token, context), false);
    assert.equal(session.finish(first.token, { text: 'duplicate write' }), false);
    assert.equal(session.fail(first.token), false, 'late failure must not discard a completed cache');
    assert.deepEqual(session.begin({ ...context }), { status: 'cached', ...result });
    assert.equal(session.begin(context).record, result.record);
}

// A resolves after B: it may neither commit nor overwrite B's cache.
{
    const session = createSettleSession();
    const a = deferred();
    const b = deferred();
    const commits = [];
    const requestA = request(session, context, a, commits);
    const contextB = { ...context, fingerprint: `${context.fingerprint}B` };
    const requestB = request(session, contextB, b, commits);
    assert.equal(session.finish(requestA.token, result), false, 'stale finish cannot clear active B');
    assert.equal(session.fail(requestA.token), false, 'stale failure cannot clear active B');
    assert.equal(session.begin(contextB).status, 'busy');
    const valueB = { record: { id: 'B' }, text: 'B' };
    b.resolve(valueB);
    assert.equal(await requestB.done, true);
    a.resolve({ record: { id: 'A' }, text: 'A' });
    assert.equal(await requestA.done, false);
    assert.deepEqual(commits, [valueB]);
    assert.equal(session.finish(requestA.token, result), false);
    assert.deepEqual(session.begin(contextB), { status: 'cached', ...valueB });
}

// Disabling during an outstanding request invalidates ownership; reenable starts afresh.
{
    const session = createSettleSession();
    const pending = deferred();
    const commits = [];
    const running = request(session, context, pending, commits);
    session.invalidate();
    assert.equal(session.isCurrent(running.token, context), false);
    pending.resolve(result);
    assert.equal(await running.done, false);
    assert.deepEqual(commits, []);
    assert.equal(session.finish(running.token, result), false);
    const next = session.begin(context);
    assert.equal(next.status, 'started');
    assert.ok(next.token.epoch > running.token.epoch);
    assert.ok(next.token.sequence > running.token.sequence);
    session.finish(next.token, result);
    session.invalidate();
    assert.equal(session.begin(context).status, 'started', 'invalidate also clears a completed cache');
}

// Force replaces both in-flight and completed duplicates, never returns busy/cached.
{
    const session = createSettleSession();
    const a = deferred();
    const b = deferred();
    const commits = [];
    const old = request(session, context, a, commits);
    const replacement = request(session, { ...context, force: true }, b, commits);
    assert.notEqual(old.token, replacement.token);
    assert.ok(replacement.token.epoch > old.token.epoch);
    a.resolve(result);
    assert.equal(await old.done, false);
    assert.equal(session.begin(context).status, 'busy');
    b.resolve(result);
    assert.equal(await replacement.done, true);
    assert.deepEqual(commits, [result]);
    assert.equal(session.begin(context).status, 'cached');
    const forced = session.begin({ ...context, force: true });
    assert.equal(forced.status, 'started');
    assert.equal(session.begin(context).status, 'busy');
    assert.equal(session.fail(replacement.token), false);
    session.fail(forced.token);
    assert.equal(session.begin(context).status, 'started', 'force never leaves the old cache behind');
}

// Full fingerprints: equal lengths and shared long prefixes must not become cache hits.
{
    const session = createSettleSession();
    const make = field => JSON.stringify({ user: 'u'.repeat(4096), system: 'A', overrides: { mode: 'A' }, state: { hp: 100 }, ...field });
    const initial = { scope, fingerprint: make({}) };
    session.finish(session.begin(initial).token, result);
    assert.equal(session.begin({ ...initial }).status, 'cached', 'identical complete input is cached');
    for (const changed of [{ user: `${'u'.repeat(4095)}v` }, { system: 'B' }, { overrides: { mode: 'B' } }, { state: { hp: 101 } }]) {
        const input = { scope, fingerprint: make(changed) };
        assert.equal(input.fingerprint.length, initial.fingerprint.length);
        const next = session.begin(input);
        assert.equal(next.status, 'started', 'every full input field participates in equality');
        session.finish(next.token, result);
        assert.equal(session.begin(input).status, 'cached');
        const back = session.begin(initial);
        assert.equal(back.status, 'started', 'there is only one cache slot, not a storage layer');
        session.finish(back.token, result);
    }
    const switched = session.begin({ ...initial, scope: otherScope });
    assert.equal(switched.status, 'started', 'a different chat never reuses the same-input cache');
    const old = switched.token;
    const back = session.begin(initial);
    assert.equal(session.isCurrent(old), false, 'a scope switch also replaces running ownership');
    assert.equal(session.isCurrent(back.token), true);
}

// Failures release busy, discard cache, and cannot poison a later success.
{
    const session = createSettleSession();
    session.finish(session.begin(context).token, result);
    const failing = deferred();
    const commits = [];
    const attempt = request(session, { ...context, force: true }, failing, commits);
    failing.reject(new Error('model failed'));
    assert.equal(await attempt.done, false);
    assert.deepEqual(commits, []);
    const next = session.begin(context);
    assert.equal(next.status, 'started');
    assert.equal(session.isCurrent(next.token), true);
    assert.equal(session.fail(attempt.token), false);
    assert.equal(session.finish(next.token, result), true);
    assert.deepEqual(session.begin(context), { status: 'cached', ...result });

    const staleFailure = deferred();
    const old = request(session, { ...context, force: true }, staleFailure, commits);
    const current = session.begin({ ...context, fingerprint: 'new input' });
    session.finish(current.token, result);
    staleFailure.reject(new Error('old model failed late'));
    assert.equal(await old.done, false);
    assert.equal(session.begin({ ...context, fingerprint: 'new input' }).status, 'cached');
}

// Caller-side reassembly guard rejects changed state/context even without a new begin.
{
    const session = createSettleSession();
    const pending = deferred();
    const commits = [];
    let live = context;
    const running = request(session, context, pending, commits, () => live);
    live = { ...context, fingerprint: 'state changed while waiting' };
    pending.resolve(result);
    assert.equal(await running.done, false);
    assert.deepEqual(commits, []);
    assert.equal(session.fail(running.token), true, 'caller may release the rejected request');
    assert.equal(session.begin(live).status, 'started');
}

// Quiet end/stopped events leave delayed work alone; foreground end/stopped invalidate it.
for (const eventType of ['ended', 'stopped']) {
    for (const quietBusy of [false, true]) {
        const session = createSettleSession();
        const pending = deferred();
        const commits = [];
        const running = request(session, context, pending, commits);
        const clear = shouldClearSettleOnGenerationEnd({ quietBusy, eventType });
        assert.equal(clear, !quietBusy);
        if (clear) session.invalidate();
        pending.resolve(result);
        assert.equal(await running.done, quietBusy);
        assert.equal(commits.length, quietBusy ? 1 : 0);
        assert.equal(session.begin(context).status, quietBusy ? 'cached' : 'started');
    }
}
assert.equal(shouldClearSettleOnGenerationEnd({ quietBusy: false, eventType: 'started' }), false);
assert.equal(shouldClearSettleOnGenerationEnd({ quietBusy: false, eventType: 'unknown' }), false);
assert.equal(shouldClearSettleOnGenerationEnd(), false);

// Empty fingerprints are valid strings, but implicit coercion must not merge unrelated inputs.
{
    const session = createSettleSession();
    const empty = { scope: '', fingerprint: '' };
    const first = session.begin(empty);
    assert.throws(() => session.begin({ scope: {}, fingerprint: 'x' }), TypeError);
    assert.throws(() => session.begin({ scope: '', fingerprint: 1 }), TypeError);
    assert.equal(session.isCurrent(first.token), true, 'invalid begin does not replace a valid request');
    assert.equal(session.finish(first.token, { record: null, text: '' }), true);
    assert.deepEqual(session.begin(empty), { status: 'cached', record: null, text: '' });
}

// roundKey 放宽复用：重roll/重试里玩家输入没变就复用已完成判定，指纹里的账本漂移不触发重调。
{
    const session = createSettleSession();
    const first = session.begin({ ...context, roundKey: '[5,"出手"]' });
    assert.equal(first.status, 'started');
    session.finish(first.token, result);
    // 指纹变了（账本/楼层细节漂移）但 roundKey 相同 → 复用，不重调。
    const drifted = { ...context, fingerprint: `${context.fingerprint}drifted`, roundKey: '[5,"出手"]' };
    assert.deepEqual(session.begin(drifted), { status: 'cached', ...result }, '同轮次重roll直接复用，不重调');
    // roundKey 变了（新楼层/改输入）→ 正常重跑。
    const nextRound = session.begin({ ...drifted, roundKey: '[7,"再出手"]' });
    assert.equal(nextRound.status, 'started', '新一轮玩家输入不复用旧判定');
    session.finish(nextRound.token, { record: { id: 'N' }, text: 'N' });
    assert.deepEqual(session.begin({ ...drifted, roundKey: '[7,"再出手"]' }), { status: 'cached', record: { id: 'N' }, text: 'N' });
    // 聊天不同（scope 不同）永不相复用。
    const otherChat = session.begin({ ...context, scope: otherScope, roundKey: '[5,"出手"]' });
    assert.equal(otherChat.status, 'started', '换聊天不复用旧判定');
    // force 无视放宽键。
    session.invalidate();
    const forced = session.begin({ ...context, roundKey: '[5,"出手"]', force: true });
    assert.equal(forced.status, 'started');
    session.finish(forced.token, result);
    assert.equal(session.begin({ ...context, roundKey: '[5,"出手"]', force: true }).status, 'started', 'force 也不走放宽键');
    // 不传 roundKey 的旧调用方行为不变：只认指纹。
    const legacy = session.begin({ ...context, fingerprint: `${context.fingerprint}legacy` });
    assert.equal(legacy.status, 'started');
    session.finish(legacy.token, result);
    assert.equal(session.begin({ ...context, fingerprint: `${context.fingerprint}legacy2` }).status, 'started', '未传 roundKey 时指纹不同即重跑');
}
console.log('settle session tests passed');
