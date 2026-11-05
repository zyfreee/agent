import assert from 'node:assert/strict';
import { createLlmClient, listModels } from './llm-client.js';
const args = { system: 's', user: 'u' };
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

// OPT-002: idle is an edge notification after host settlement, grace and sampling restoration.
{
    const settings = { temp_openai: 0.7 }, gate = defer(), entered = defer();
    const context = { chatCompletionSettings: settings, generateQuietPrompt: async () => { entered.resolve(); await gate.promise; return 'ok'; } };
    const client = createLlmClient({ getSettings: () => ({ llm: { mode: 'tavern' } }), getContext: () => context });
    let notifications = 0, removed = 0, observed;
    const unsubscribe = client.onQuietIdle(() => { notifications++; observed = [client.isQuietBusy(), settings.temp_openai]; });
    const stopRemoved = client.onQuietIdle(() => { removed++; });
    client.onQuietIdle(() => { throw new Error('isolated listener'); });
    client.onQuietIdle(() => Promise.reject(new Error('isolated async listener')));
    await Promise.resolve();
    assert.equal(notifications, 0, 'idle subscription must not auto-fire');
    const controller = new AbortController();
    const pending = client.complete({ ...args, signal: controller.signal, overrides: { temperature: 0.2 } });
    await entered.promise;
    controller.abort();
    await assert.rejects(pending, /取消/);
    assert.equal(notifications, 0, 'local cancellation is not host idle');
    stopRemoved(); gate.resolve();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(notifications, 0, 'grace interval still owns quiet events');
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(notifications, 1);
    assert.deepEqual(observed, [false, 0.7]);
    assert.equal(removed, 0);
    unsubscribe(); unsubscribe();
    await client.complete(args);
    assert.equal(notifications, 1, 'unsubscribe prevents later notifications');
}

// OPT-030: a shared settings region is never owned by two concurrent requests.
{
    const settings = { temp_openai: 0.7 };
    const first = defer();
    const seen = [];
    const context = { mainApi: 'openai', chatCompletionSettings: settings, generateQuietPrompt: async () => { seen.push(settings.temp_openai); if (seen.length === 1) await first.promise; return 'ok'; } };
    const client = createLlmClient({ getSettings: () => ({ llm: { mode: 'tavern' } }), getContext: () => context });
    const a = client.complete({ ...args, overrides: { temperature: 0.2 } });
    const b = client.complete({ ...args, overrides: { temperature: 0.9 } });
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual(seen, [0.2], 'second request must wait for shared sampling ownership');
    first.resolve();
    await Promise.all([a, b]);
    assert.deepEqual(seen, [0.2, 0.9]);
    assert.equal(settings.temp_openai, 0.7);
}

// OPT-077: pre-cancel dispatches nothing; in-flight cancel keeps quiet ownership until settlement.
{
    const gate = defer(); let calls = 0;
    const context = { generateQuietPrompt: async () => { calls++; await gate.promise; return 'ok'; } };
    const client = createLlmClient({ getSettings: () => ({ llm: { mode: 'tavern' } }), getContext: () => context });
    const aborted = new AbortController(); aborted.abort();
    await assert.rejects(client.complete({ ...args, signal: aborted.signal }), /取消/);
    assert.equal(calls, 0);
    const active = new AbortController();
    const pending = client.complete({ ...args, signal: active.signal });
    await new Promise(resolve => setTimeout(resolve, 5));
    active.abort();
    await assert.rejects(pending, /取消/);
    assert.equal(client.isQuietBusy(), true, 'host request still running after local cancellation');
    gate.resolve();
    await new Promise(resolve => setTimeout(resolve, 550));
    assert.equal(client.isQuietBusy(), false);
}
// A queued call whose local deadline expired must never dispatch later.
{
    const gate = defer(); let calls = 0;
    const context = { generateQuietPrompt: async () => { calls++; await gate.promise; return 'ok'; } };
    const client = createLlmClient({ getSettings: () => ({ llm: { mode: 'tavern', timeoutMs: 1000 } }), getContext: () => context });
    const first = client.complete(args);
    const second = client.complete(args);
    await Promise.all([assert.rejects(first, /超过/), assert.rejects(second, /超过/)]);
    gate.resolve();
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.equal(calls, 1, 'timed-out queued call has no dispatch authority');
}

// OPT-078: logical header names override case-insensitively.
{
    let received;
    await listModels({ baseUrl: 'https://fake.invalid', apiKey: 'fake-default', headers: { Authorization: 'Bearer fake-override' },
        fetchImpl: async (url, options) => { received = new Headers(options.headers).get('authorization'); return { ok: true, json: async () => ({ data: [] }) }; },
    });
    assert.equal(received, 'Bearer fake-override');
}

// OPT-080: one deadline covers both fetch headers and response body.
for (const body of [false, true]) {
    const result = await listModels({ baseUrl: 'https://fake.invalid', timeoutMs: 15,
        fetchImpl: async () => body ? { ok: true, json: () => new Promise(() => {}) } : new Promise(() => {}),
    });
    assert.equal(result.status, 'failed');
    assert.match(result.error, /超过|超时/);
}
console.log('llm continuation tests passed');
