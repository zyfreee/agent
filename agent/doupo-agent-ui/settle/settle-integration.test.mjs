import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

// Import the real entry point, but isolate its singletons from other lifecycle tests.
// Host calls are memory-only; any accidental network fallback fails this test.
const globalKeys = ['SillyTavern', 'fetch', 'doupoFactsInterceptor', 'document', 'window'];
const originalGlobals = new Map(globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const events = new EventEmitter();
const sourceKeys = ['doupo_world', 'doupo_impact', 'doupo_npc_ledger', 'doupo_self', 'doupo_memory', 'doupo_facts'];
const input = '我支付十枚金币。';
const successOutcome = '测试批准支付完成。';
const pendingReplies = [];
const requests = [];
let context;
let entry;
let selfBefore;
let fixtureSequence = 0;
let networkCalls = 0;

function deferred() {
    let resolve;
    const promise = new Promise(yes => { resolve = yes; });
    return { promise, resolve };
}

function reply({ evidence = input, category = 'general', outcome = successOutcome, effects } = {}) {
    return JSON.stringify({ version: 2, actions: [{
        id: 'a1', category, evidence, dependsOn: [], status: 'success', outcome,
        consequences: [], effects: effects ?? [{ targetId: 'player', field: 'gold', type: 'add', value: -10, allowNegative: true, reason: '实际支付' }],
    }] });
}

function fixture({ user = input, history = '掌柜报出了价钱。' } = {}) {
    const host = {
        chatId: `settle-integration-${++fixtureSequence}`,
        chatMetadata: { branch_id: 'main' },
        chat: [{ is_user: false, mes: history }, { is_user: true, mes: user }],
        extensionSettings: { doupo_agent_ui: {
            enabled: true, enableActionResolution: true, enableSandboxMode: false,
            enableFactsLibrary: false, enableWorldProgress: false, enablePlayerImpact: false,
            enableNpcLedger: false, enableSelfLedger: false, enableMemoryLedger: false,
            enableDbBridge: false, world: { decideEnabled: false, decideAuto: false },
            npc: { ledgerAuto: false }, memory: { decideEnabled: false, decideAuto: false },
            llm: { mode: 'tavern', useSillyTavernConnection: true, emptyRetry: 0, timeoutMs: 2000 },
            settle: { resultEnabled: true },
        } },
        extensionPrompts: Object.fromEntries(sourceKeys.map(key => [key, { value: `本轮上下文：${key}` }])),
        eventSource: events,
        event_types: { GENERATION_ENDED: 'ended', GENERATION_STOPPED: 'stopped' },
        extension_prompt_types: { IN_CHAT: 1 },
        extension_prompt_roles: { SYSTEM: 0 },
        writes: [], calls: [], saves: 0, rejectActionWrite: false,
        model: () => reply({ evidence: user }),
        setExtensionPrompt(key, text, position, depth, scan, role) {
            this.writes.push({ key, text, position, depth, scan, role });
            if (this.rejectActionWrite && key === 'doupo_action' && text) throw new Error('test prompt write rejected');
            this.extensionPrompts[key] = { value: text };
        },
        async saveMetadata() { this.saves++; },
        generateRaw(options) {
            assert.equal(options.quietToLoud, false);
            assert.equal(options.trimNames, false);
            assert.deepEqual(options.prompt.map(message => message.role), ['system', 'user']);
            return this.generateQuietPrompt({ quietPrompt: options.prompt.map(message => message.content).join('\n\n') });
        },
        generateQuietPrompt(options) {
            assert.equal(typeof options, 'object');
            assert.equal(typeof options.quietPrompt, 'string');
            this.calls.push(options);
            return this.model(options);
        },
    };
    context = host;
    entry.agentSelfRuntime.restore({ realm: { realm: '斗者', stage: '三星' }, gold: 100, items: [] });
    return host;
}

function delayModel(host) {
    const response = deferred();
    const entered = deferred();
    pendingReplies.push(response);
    host.model = options => { entered.resolve(options); return response.promise; };
    return { response, entered };
}

function adjudicate(options = {}) {
    const promise = entry.doupoAgent.settleAdjudicate(options);
    requests.push(promise);
    return promise;
}

function record(host) { return host.chatMetadata.doupo_agent_state?.settleLastAdjudication; }
function actionText(host) { return host.extensionPrompts.doupo_action?.value ?? ''; }
function sourceTexts(host) { return Object.fromEntries(sourceKeys.map(key => [key, host.extensionPrompts[key]?.value])); }

try {
    for (const key of ['document', 'window']) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: undefined });
    Object.defineProperty(globalThis, 'SillyTavern', { configurable: true, writable: true, value: { getContext: () => context } });
    Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: async () => {
        networkCalls++;
        throw new Error('network is forbidden in settle integration tests');
    } });
    entry = await import('../index.js?settle-integration-test');
    assert.equal(typeof entry.doupoAgent?.settleAdjudicate, 'function', 'exercise the actual exported public entry');
    selfBefore = entry.agentSelfRuntime.snapshot();
    fixture();
    entry.onEnable();
    assert.equal(events.listenerCount('ended'), 1);
    assert.equal(events.listenerCount('stopped'), 1);

    // Both global and action feature switches bypass the model, even with force.
    for (const key of ['enabled', 'enableActionResolution']) {
        const host = fixture();
        host.extensionSettings.doupo_agent_ui[key] = false;
        assert.equal((await adjudicate({ force: true })).status, 'disabled');
        assert.equal(host.calls.length, 0);
        assert.equal(actionText(host), '');
        assert.equal(record(host).status, 'disabled');
        host.extensionSettings.doupo_agent_ui[key] = true;
        assert.equal((await adjudicate()).status, 'injected');
        assert.equal(host.calls.length, 1, 'reenabling does not reuse disabled state');
    }

    // Re-adjudicating an existing turn must not feed its already-generated answer back as evidence.
    {
        const host = fixture();
        host.chat.push({ is_user: false, mes: '旧答复标记：商队备用金足够支付，交易成功。' });
        assert.equal((await adjudicate({ force: true, preview: true })).status, 'preview');
        assert.ok(!host.calls[0].quietPrompt.includes('旧答复标记'), 'exclude answers after the selected player input');
    }

    // A genuine repeat reuses the result and rewrites the real prompt channel.
    {
        const host = fixture();
        const before = entry.agentSelfRuntime.snapshot();
        assert.equal((await adjudicate({ force: true })).status, 'injected');
        const approvedText = actionText(host);
        assert.match(approvedText, new RegExp(successOutcome));
        assert.equal(record(host).status, 'injected');
        assert.equal(record(host).actions[0].approved, true);
        assert.ok(host.saves > 0);
        assert.deepEqual(entry.agentSelfRuntime.snapshot(), before, 'adjudication must not apply predicted account effects');
        host.extensionPrompts.doupo_action.value = '';
        const cached = await adjudicate();
        assert.equal(cached.cached, true);
        assert.equal(cached.status, 'injected');
        assert.equal(host.calls.length, 1);
        assert.equal(actionText(host), approvedText);
        assert.match(host.calls[0].quietPrompt, /本轮上下文：doupo_memory/);
    }

    // Same-length changes after a shared prefix are not a cache hit.
    {
        const host = fixture({ history: `${'相同旧文'.repeat(60)}甲` });
        await adjudicate({ force: true });
        const originalLength = host.chat[0].mes.length;
        host.chat[0].mes = `${'相同旧文'.repeat(60)}乙`;
        assert.equal(host.chat[0].mes.length, originalLength);
        const changed = await adjudicate();
        assert.notEqual(changed.cached, true);
        assert.equal(changed.status, 'injected');
        assert.equal(host.calls.length, 2);
        assert.notEqual(host.calls[0].quietPrompt, host.calls[1].quietPrompt);
        assert.match(host.calls[1].quietPrompt, /乙/);
    }

    // Live state/rule changes invalidate the exact materials captured before await.
    for (const change of ['gold', 'inventory', 'resultPrompt']) {
        const host = fixture();
        const delayed = delayModel(host);
        const running = adjudicate({ force: true });
        await delayed.entered.promise;
        if (change === 'resultPrompt') {
            host.extensionSettings.doupo_agent_ui.settle.resultPrompt = '规则已改变；仍只输出 actions v2 JSON。';
        } else {
            const updated = entry.agentSelfRuntime.snapshot();
            if (change === 'gold') updated.gold = 95;
            else updated.items = [{ id: 'existing-item', name: '药草', category: '材料', count: 2 }];
            entry.agentSelfRuntime.restore(updated);
        }
        delayed.response.resolve(reply());
        assert.equal((await running).status, 'stale', `${change} changed while the model was waiting`);
        assert.equal(record(host).status, 'stale');
        assert.equal(actionText(host), '');
        assert.equal(host.writes.some(write => write.key === 'doupo_action' && write.text), false);
        const retry = await adjudicate();
        assert.equal(retry.status, 'injected');
        assert.notEqual(retry.cached, true);
        assert.equal(host.calls.length, 2);
    }

    // Manual preview must not inject its numerical prediction or claim it was applied.
    {
        const host = fixture();
        const before = entry.agentSelfRuntime.snapshot();
        assert.equal((await adjudicate({ force: true, preview: true })).status, 'preview');
        assert.equal(record(host).status, 'preview');
        assert.equal(record(host).reconciliation.status, 'pending');
        assert.equal(record(host).expectedState.player.gold, 90);
        assert.equal(actionText(host), '');
        assert.equal(host.writes.some(write => write.key === 'doupo_action' && write.text), false);
        assert.deepEqual(entry.agentSelfRuntime.snapshot(), before);
        assert.equal((await adjudicate({ preview: true })).cached, true);
        assert.equal(host.calls.length, 1);
        assert.equal((await adjudicate()).status, 'injected', 'preview cache cannot skip a real injection request');
        assert.equal(host.calls.length, 2);
    }

    // Existing persisted self operations trigger read-only reconciliation after a new reply.
    {
        const host = fixture();
        await adjudicate({ force: true });
        assert.equal(typeof entry.doupoAgent.selfApplyPersisted, 'function');
        assert.equal(record(host).reconciliation.status, 'pending');
        entry.doupoAgent.selfApplyPersisted([{ op: 'setGold', amount: 95 }], { source: 'integration' });
        assert.equal(record(host).reconciliation.status, 'pending', 'manual edits without a new reply are not evidence of applied effects');
        host.chat.push({ is_user: false, mes: '掌柜接过十枚金币。', swipe_id: 0 });
        entry.doupoAgent.selfApplyPersisted([{ op: 'setGold', amount: 90 }], { source: 'integration' });
        assert.equal(record(host).reconciliation.status, 'matched');
        assert.equal(host.chatMetadata.doupo_agent_self.gold, 90);
        entry.doupoAgent.selfApplyPersisted([{ op: 'setGold', amount: 85 }], { source: 'integration' });
        assert.equal(record(host).reconciliation.status, 'mismatch');
        assert.ok(record(host).reconciliation.differences.length > 0);
        assert.equal(entry.agentSelfRuntime.snapshot().gold, 85, 'comparison must never silently repair the real account');
        assert.equal(host.chatMetadata.doupo_agent_self.gold, 85);
        assert.equal(host.calls.length, 1, 'reconciliation does not ask a model');
    }

    // Quiet ENDED during the request and its real post-reply grace cannot clear six channels.
    {
        const host = fixture();
        const delayed = delayModel(host);
        const sources = sourceTexts(host);
        const running = adjudicate({ force: true });
        await delayed.entered.promise;
        assert.equal(entry.agentLlmClient.isQuietBusy(), true);
        let writeCount = host.writes.length;
        events.emit('ended');
        assert.equal(host.writes.length, writeCount);
        assert.deepEqual(sourceTexts(host), sources);
        delayed.response.resolve(reply());
        // Flush the reply continuation without sleeping past the implementation's grace.
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(entry.agentLlmClient.isQuietBusy(), true);
        writeCount = host.writes.length;
        events.emit('ended');
        assert.equal(host.writes.length, writeCount);
        assert.deepEqual(sourceTexts(host), sources);
        assert.equal((await running).status, 'injected');
        assert.equal(entry.agentLlmClient.isQuietBusy(), false);
        assert.deepEqual(sourceTexts(host), sources);
        assert.equal(host.calls.length, 1, 'quiet end must not wake another model chain');
    }

    // Without CHAT_CHANGED, the fresh scope guard still rejects an old chat's response.
    {
        const hostA = fixture();
        const delayed = delayModel(hostA);
        const runningA = adjudicate({ force: true });
        await delayed.entered.promise;
        const hostB = fixture(); // mutable getContext switches silently; no event is emitted.
        const metadataB = structuredClone(hostB.chatMetadata);
        const promptsB = structuredClone(hostB.extensionPrompts);
        const writesA = hostA.writes.length;
        delayed.response.resolve(reply({ outcome: 'A专属结果不得写入B。' }));
        assert.equal((await runningA).status, 'stale');
        assert.deepEqual(hostB.chatMetadata, metadataB);
        assert.deepEqual(hostB.extensionPrompts, promptsB);
        assert.equal(hostB.writes.length, 0);
        assert.equal(hostA.writes.length, writesA);
        assert.equal((await adjudicate({ force: true })).status, 'injected');
        assert.equal(hostB.calls.length, 1);
        assert.doesNotMatch(actionText(hostB), /A专属结果/);
    }

    // An old request arriving after B succeeds cannot overwrite B's record or prompt.
    {
        const hostA = fixture();
        const delayed = delayModel(hostA);
        const runningA = adjudicate({ force: true });
        await delayed.entered.promise;
        const hostB = fixture();
        assert.equal((await adjudicate({ force: true })).status, 'injected');
        const metadataB = structuredClone(hostB.chatMetadata);
        const promptsB = structuredClone(hostB.extensionPrompts);
        const writesB = hostB.writes.length;
        delayed.response.resolve(reply({ outcome: '晚回A不能覆盖B。' }));
        assert.equal((await runningA).status, 'stale');
        assert.deepEqual(hostB.chatMetadata, metadataB);
        assert.deepEqual(hostB.extensionPrompts, promptsB);
        assert.equal(hostB.writes.length, writesB);
        assert.equal((await adjudicate()).cached, true);
    }

    // A setter error is observable as write_failed, never a successful injection/cache.
    {
        const host = fixture();
        host.rejectActionWrite = true;
        assert.equal((await adjudicate({ force: true })).status, 'write_failed');
        assert.equal(record(host).status, 'write_failed');
        assert.equal(actionText(host), '');
        assert.equal(entry.agentActionPromptInjection.inspect().last.status, 'failed');
        host.rejectActionWrite = false;
        const retry = await adjudicate();
        assert.equal(retry.status, 'injected');
        assert.notEqual(retry.cached, true);
        assert.equal(host.calls.length, 2);
    }

    // Script review must replace an impossible success with a blocked constraint.
    {
        const user = '我盘膝修炼，直接突破到斗王二星。';
        const host = fixture({ user });
        const before = entry.agentSelfRuntime.snapshot();
        const fabricatedSuccess = '越级测试专用：已成功跨越数个大境界并获得神力。';
        host.model = () => reply({ evidence: user, category: 'cultivation', outcome: fabricatedSuccess,
            effects: [{ targetId: 'player', field: 'realm', type: 'set', value: '斗王二星', reason: '模型声称直接突破' }],
        });
        const verdict = await adjudicate({ force: true });
        assert.equal(verdict.status, 'injected', 'safe blocked guidance may itself be injected');
        assert.equal(record(host).actions[0].approved, false);
        assert.deepEqual(record(host).effects, []);
        assert.deepEqual(record(host).actions[0].effects, []);
        assert.ok(record(host).rejected.length > 0);
        assert.match(actionText(host), /blocked|未完成|不得宣称成功/);
        assert.doesNotMatch(actionText(host), new RegExp(fabricatedSuccess));
        assert.notEqual(record(host).actions[0].status, 'success');
        assert.deepEqual(entry.agentSelfRuntime.snapshot(), before);
    }

    // A real user STOPPED invalidates a deferred adjudication even while quiet is busy.
    {
        const host = fixture();
        const delayed = delayModel(host);
        const running = adjudicate({ force: true });
        await delayed.entered.promise;
        assert.equal(entry.agentLlmClient.isQuietBusy(), true);
        events.emit('stopped');
        delayed.response.resolve(reply());
        assert.equal((await running).status, 'stale');
        assert.equal(actionText(host), '');
        assert.notEqual(record(host)?.status, 'injected');
        assert.equal((await adjudicate()).status, 'injected', 'a stopped request does not stay busy');
        assert.equal(host.calls.length, 2);
    }

    // Disable last: delayed completion may neither inject nor rewrite the disabled record.
    {
        const host = fixture();
        const delayed = delayModel(host);
        const running = adjudicate({ force: true });
        await delayed.entered.promise;
        entry.onDisable();
        const disabledMetadata = structuredClone(host.chatMetadata);
        const writes = host.writes.length;
        delayed.response.resolve(reply());
        assert.equal((await running).status, 'stale');
        assert.equal(host.writes.length, writes);
        assert.equal(actionText(host), '');
        assert.deepEqual(host.chatMetadata, disabledMetadata);
        assert.equal((await adjudicate({ force: true })).status, 'disabled');
        assert.equal(host.calls.length, 1);
    }
    assert.equal(networkCalls, 0);
} finally {
    try {
        entry?.onDisable();
        for (const pending of pendingReplies) pending.resolve(reply());
        await Promise.allSettled(requests);
        if (selfBefore) entry.agentSelfRuntime.restore(selfBefore);
        assert.equal(events.listenerCount('ended'), 0);
        assert.equal(events.listenerCount('stopped'), 0);
    } finally {
        events.removeAllListeners();
        for (const [key, descriptor] of originalGlobals) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    }
}
console.log('settle integration wiring tests passed');
