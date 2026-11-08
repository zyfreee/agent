import assert from 'node:assert/strict';
import test from 'node:test';
import { createSandboxMode } from './sandbox/sandbox-mode.js';
import { createSandboxWiring } from './sandbox/wiring.js';
import { createCurrentAgentScope } from './host/scope.js';

// 不再切源码：沙盒接线已摘成 sandbox/wiring.js 依赖注入工厂，这里直接喂桩比行为。
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
    const api = createSandboxWiring({
        scopeOf: createCurrentAgentScope({ getContext: context.getHostContext }),
        runtime: context.agentSandboxMode, hostStorage: context.hostStorage, currentSettings: context.currentSettings,
        coordinator: context.agentCoordinator, stateStore: context.agentStateStore,
        invalidateContinuations: context.invalidateAgentContinuations, setSandboxStatus: context.setSandboxStatus,
        messages: context.SANDBOX_MODE_MESSAGES, syncPendingRow: context.syncSandboxPendingRow,
        renderRuntime: context.renderRuntimeMode, getPanel: () => context.document.getElementById(context.SETTINGS_PANEL_ID),
    });
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

test('OPT-065 开关随开随关：存档记录不再钉死口径，restore 保留历史，口径跟开关换向并落存档', async () => {
    const original = createSandboxMode();
    pending(original, scopeA);
    original.confirm({ ...scopeA, taskId: 'latest', stateVersion: 'v-live', reason: 'confirmed before refresh' });
    const h = harness({ data: { unrelated: 7, sandboxMode: original.snapshot(scopeA) } });
    h.settings.enableSandboxMode = false;
    assert.equal(typeof h.api.restoreSandboxFromChat, 'function', 'index must expose its real scoped restore hook');
    await h.api.restoreSandboxFromChat();
    assert.equal(h.runtime.read(scopeA).history[0].reason, 'confirmed before refresh', '沙盒历史跨重载保留');
    assert.equal(await h.api.sandboxModeActive(), false, '开关关了＝主线，聊天存档里的沙盒口径不再拦截');
    assert.equal(h.runtime.read(scopeA).mode, 'mainline', '记录口径随开关换向');
    assert.equal(h.calls.saved.length, 1, '换向立即落存档，重载后不回弹');
    h.settings.enableSandboxMode = true;
    assert.equal(await h.api.sandboxModeActive(), true, '开关再开＝开放世界，立刻生效');
    assert.equal(h.runtime.read(scopeA).mode, 'sandbox');
    assert.equal(h.runtime.read(scopeA).history[0].reason, 'confirmed before refresh', '关了再开，沙盒任务与历史续上');
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
