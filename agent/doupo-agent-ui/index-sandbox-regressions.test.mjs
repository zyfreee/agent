import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createSandboxMode } from './sandbox/sandbox-mode.js';

const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const names = ['currentAgentScope', 'sandboxModeActive', 'confirmSandboxSwitch', 'persistSandboxMode', 'restoreSandboxFromChat'];
const extracted = names.map(name => source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`))?.[0]).filter(Boolean);
for (const name of names.slice(0, 3)) assert.ok(extracted.some(code => code.includes(`function ${name}(`)), `actual index function ${name}`);
const scopeA = { sessionId: 'A', branchId: 'main' };
const scopeB = { sessionId: 'B', branchId: 'fork' };
const scopeKey = scope => `${scope.sessionId}|${scope.branchId}`;

function harness({ scope = scopeA, cachedScope = scope, version = 'v-live', tasks = [], data = {}, runtime = createSandboxMode() } = {}) {
    const calls = { saved: [], confirmed: [], invalidated: 0, states: [], statuses: [] };
    const settings = { enableSandboxMode: true, sandbox: { inertia: 'strong', canonCharactersAutonomous: false, allowMidgameSwitch: true } };
    const metadata = { doupo_agent_state: structuredClone(data) };
    const context = {
        structuredClone, Promise, console, agentActiveScope: cachedScope, agentSandboxMode: {
            ...runtime,
            confirm: value => { calls.confirmed.push(structuredClone(value)); return runtime.confirm(value); },
        },
        getHostContext: () => ({ chatId: scope.sessionId, chatMetadata: { ...metadata, branch_id: scope.branchId } }),
        currentSettings: () => settings,
        hostStorage: {
            chatState: () => ({ status: 'ready', value: structuredClone(metadata.doupo_agent_state) }),
            saveChatState: async value => {
                metadata.doupo_agent_state = structuredClone(value);
                calls.saved.push({ scope: scopeKey(scope), value: structuredClone(value) });
                return { status: 'saved' };
            },
        },
        agentCoordinator: { list: () => structuredClone(tasks) },
        agentStateStore: { read: value => { calls.states.push(scopeKey(value)); return { exists: true, stateVersion: version, state: {} }; } },
        invalidateAgentContinuations: () => { calls.invalidated += 1; },
        setSandboxStatus: value => calls.statuses.push(value), syncSandboxPendingRow() {}, renderRuntimeMode() {},
        SETTINGS_PANEL_ID: 'test-panel', document: { getElementById: () => null },
        SANDBOX_MODE_MESSAGES: { unavailable: 'unavailable', switched: 'switched', nothingPending: 'nothingPending', stale: 'stale', failed: 'failed' },
    };
    const exports = names.map(name => `${name}: typeof ${name} === 'function' ? ${name} : undefined`).join(',');
    const api = runInNewContext(`${extracted.join('\n')}\n;({${exports}})`, context);
    return { api, calls, settings, runtime, metadata };
}

function pending(runtime, scope, taskId = 'latest', stateVersion = 'v-live') {
    runtime.sync({ ...scope, enabled: false, inertia: 'medium' });
    runtime.sync({ ...scope, enabled: true, inertia: 'weak', canonCharactersAutonomous: false, taskId, stateVersion });
}

// Real module hooks are already green; these tests exercise only actual index wiring.
test('OPT-065 sandboxModeActive adopts and persists the current scope without a formal record', async () => {
    const h = harness({ scope: scopeB, cachedScope: scopeA, data: { unrelated: { keep: true } } });
    assert.equal(await h.api.sandboxModeActive(), true);
    assert.equal(h.runtime.read(scopeB).status, 'ready', 'settings fallback must establish a formal branch record');
    assert.equal(h.runtime.read(scopeB).inertia, 'strong');
    assert.equal(h.runtime.read(scopeA).status, 'empty', 'cached task scope must not be adopted');
    assert.equal(h.calls.saved.length, 1);
    assert.equal(h.calls.saved[0].scope, scopeKey(scopeB));
    assert.equal(h.calls.saved[0].value.unrelated.keep, true);
    assert.equal(JSON.stringify(h.calls.saved[0].value.sandboxMode), JSON.stringify(h.runtime.snapshot(scopeB)));
});

test('OPT-065 same-scope refresh restores confirmed mode and history before opposing global settings', async () => {
    const original = createSandboxMode();
    pending(original, scopeA);
    original.confirm({ ...scopeA, taskId: 'latest', stateVersion: 'v-live', reason: 'confirmed before refresh' });
    const h = harness({ data: { unrelated: 7, sandboxMode: original.snapshot(scopeA) } });
    h.settings.enableSandboxMode = false;
    assert.equal(typeof h.api.restoreSandboxFromChat, 'function', 'index must expose its real scoped restore hook');
    await h.api.restoreSandboxFromChat();
    assert.equal(await h.api.sandboxModeActive(), true);
    assert.equal(h.runtime.read(scopeA).history[0].reason, 'confirmed before refresh');
    assert.equal(h.runtime.read(scopeA).inertia, 'weak');
    assert.equal(h.runtime.read(scopeA).canonCharactersAutonomous, false);
    assert.equal(h.calls.saved.length, 0, 'restoring confirmed mode must not replace it from settings');
});

test('OPT-066 confirm uses live scope, latest matching task and store version then invalidates and persists', async () => {
    const tasks = [
        { ...scopeB, taskId: 'older', stateVersion: 'old-cache' },
        { ...scopeB, taskId: 'latest', stateVersion: 'stale-task-cache' },
        { ...scopeA, taskId: 'wrong-scope', stateVersion: 'wrong' },
    ];
    const h = harness({ scope: scopeB, cachedScope: scopeA, tasks, data: { unrelated: 9 } });
    pending(h.runtime, scopeB);
    await h.api.confirmSandboxSwitch();
    assert.equal(h.calls.confirmed[0]?.sessionId, 'B', 'confirmation must not use cached agentActiveScope');
    assert.equal(h.calls.confirmed[0]?.branchId, 'fork');
    assert.equal(h.calls.confirmed[0]?.taskId, 'latest');
    assert.equal(h.calls.confirmed[0]?.stateVersion, 'v-live', 'read store now, not task.stateVersion');
    assert.ok(h.calls.states.includes(scopeKey(scopeB)));
    assert.equal(h.runtime.read(scopeB).mode, 'sandbox');
    assert.equal(h.calls.invalidated, 1);
    assert.equal(h.calls.saved.length, 1);
    assert.equal(h.calls.saved[0].value.unrelated, 9);
    assert.equal(JSON.stringify(h.calls.saved[0].value.sandboxMode), JSON.stringify(h.runtime.snapshot(scopeB)));
});

test('OPT-066 advancing live state rejects stale pending switch without invalidate or persistence', async () => {
    const h = harness({ version: 'v2', tasks: [{ ...scopeA, taskId: 'latest', stateVersion: 'v1' }] });
    pending(h.runtime, scopeA, 'latest', 'v1');
    await h.api.confirmSandboxSwitch();
    assert.ok(h.calls.states.includes(scopeKey(scopeA)), 'stale rejection must read the current store version');
    if (h.calls.confirmed.length) assert.equal(h.calls.confirmed[0].stateVersion, 'v2');
    assert.equal(h.runtime.read(scopeA).mode, 'mainline');
    assert.equal(h.calls.invalidated, 0);
    assert.equal(h.calls.saved.length, 0);
});

test('OPT-066 missing live state version cannot authorize confirmation', async () => {
    const missing = harness({ version: null, tasks: [{ ...scopeA, taskId: 'latest', stateVersion: 'v1' }] });
    pending(missing.runtime, scopeA, 'latest', 'v1');
    await missing.api.confirmSandboxSwitch();
    assert.equal(missing.runtime.read(scopeA).mode, 'mainline');
    assert.equal(missing.calls.invalidated, 0);
    assert.equal(missing.calls.saved.length, 0);
});

test('OPT-066 no current-scope task cannot authorize confirmation', async () => {
    const h = harness({ tasks: [{ ...scopeB, taskId: 'other', stateVersion: 'v-live' }] });
    pending(h.runtime, scopeA);
    await h.api.confirmSandboxSwitch();
    assert.equal(h.runtime.read(scopeA).mode, 'mainline');
    assert.equal(h.calls.invalidated, 0);
    assert.equal(h.calls.saved.length, 0);
});
