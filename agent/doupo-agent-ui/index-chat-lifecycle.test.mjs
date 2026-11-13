import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { doupoAgent as agent, onActivate, onDisable, onEnable } from './index.js';

const previousHost = globalThis.SillyTavern;
const events = new EventEmitter();
events.makeLast = (event, listener) => { events.removeListener(event, listener); events.on(event, listener); };
const pending = [];
const settings = { enableDbBridge: false, world: { decideAuto: false }, self: { mvuChannel: 'independent' }, memory: { consolidateAfter: 0 }, npc: { ledgerAuto: false }, impact: { decideAuto: false }, plot: { decideAuto: false } };
const context = id => ({ chatId: id, characterId: 0, chat: [{ is_user: false, mes: '萧战在乌坦城。', swipe_id: 0 }], chatMetadata: {}, extensionSettings: { doupo_agent_ui: settings }, eventSource: events, event_types: { CHAT_CHANGED: 'chat', GENERATION_ENDED: 'ended', GENERATION_STARTED: 'started', CHARACTER_MESSAGE_RENDERED: 'rendered' }, saveMetadata() {}, generateQuietPrompt: options => new Promise((resolve, reject) => pending.push({ options, resolve, reject })) });
let active;
const switchChat = chat => { active = chat; events.emit('chat'); };
const flush = () => new Promise(resolve => setImmediate(resolve));
const start = async run => { const before = pending.length; const promise = run(); await flush(); assert.equal(pending.length, before + 1, 'request must reach the mocked host'); return { promise, call: pending.at(-1) }; };
const empty = JSON.stringify({ ops: [], note: '本轮无变化', 人物: [] });
const snapshot = () => JSON.stringify([agent.worldRuntime.snapshot(), agent.selfSnapshot(), agent.memorySnapshot(), agent.npcLedger.list(), agent.impactRuntime.snapshot(), agent.npcColdRuntime.snapshot()]);

try {
    active = context('boot');
    globalThis.SillyTavern = { getContext: () => active };
    onEnable();
    // Real exported entrypoints, real parsers/runtimes/storage, only the host LLM is delayed.
    for (const method of ['selfDecide', 'memoryDecide', 'impactDecide', 'npcLedgerRecord']) {
        switchChat(context(`${method}-A`));
        const old = await start(() => agent[method]({ source: 'manual' }));
        const nextChat = context(`${method}-B`);
        switchChat(nextChat);
        const before = snapshot();
        old.call.resolve(empty);
        assert.equal((await old.promise).status, 'stale', `${method}: discard a reply from another chat`);
        assert.equal(snapshot(), before, `${method}: current runtimes must remain untouched`);
        assert.deepEqual(nextChat.chatMetadata, {}, `${method}: no cross-chat persistence`);

        switchChat(context(`${method}-C`));
        const abandoned = await start(() => agent[method]({ source: 'manual' }));
        switchChat(context(`${method}-D`));
        const current = await start(() => agent[method]({ source: 'manual' }));
        abandoned.call.reject(new Error('old request failed'));
        assert.equal((await abandoned.promise).status, 'stale');
        assert.equal((await agent[method]({ source: 'manual' })).status, 'busy', 'old finally must not release the new request lock');
        current.call.resolve(empty);
        assert.notEqual((await current.promise).status, 'stale', 'unchanged-chat requests still complete');
    }

    const original = context('return-A');
    switchChat(original);
    const returning = await start(() => agent.selfDecide({ source: 'manual' }));
    switchChat(context('return-B'));
    switchChat(original);
    returning.call.resolve(empty);
    assert.equal((await returning.promise).status, 'stale', 'switching away and back invalidates by epoch');
    for (const change of [chat => { chat.chat[0].mes += '（编辑）'; }, chat => { chat.chat[0].swipe_id += 1; }, chat => { chat.chat = []; }, chat => { chat.chatMetadata.branch_id = 'fork'; }]) {
        switchChat(context('edited-reply'));
        const staleReply = await start(() => agent.memoryDecide({ source: 'manual' }));
        const before = snapshot();
        change(active);
        staleReply.call.resolve(empty);
        assert.equal((await staleReply.promise).status, 'stale', 'edited/swiped/deleted/branched reply must be discarded');
        assert.equal(snapshot(), before);
    }

    // Per-floor automatic deduplication belongs to a chat, not a module-global floor number.
    for (const method of ['selfDecide', 'memoryDecide']) {
        for (const id of ['floor-A', 'floor-B']) {
            switchChat(context(`${method}-${id}`));
            const request = await start(() => agent[method]({ source: 'auto' }));
            request.call.resolve(empty);
            await request.promise;
            assert.equal((await agent[method]({ source: 'auto' })).status, 'already_decided');
            active.chat[0].mes += '新的重生成结果';
            active.chat[0].swipe_id += 1;
            const rerolled = await start(() => agent[method]({ source: 'auto' }));
            rerolled.call.resolve(empty);
            assert.notEqual((await rerolled.promise).status, 'already_decided', 'changed reply at the same floor must be accounted');
        }
    }

    // World is intentionally reached through the actual generation lifecycle, not a test-only API.
    settings.world.decideAuto = true;
    settings.enableSandboxMode = true;
    settings.sandbox = { inertia: 'weak', canonCharactersAutonomous: false };
    switchChat(context('world-A'));
    const count = pending.length;
    events.emit('started', 'normal');
    events.emit('ended');
    assert.equal(pending.length, count, 'streaming ended precedes message post-processing');
    active.chat[0].mes += '（宿主后处理）';
    events.emit('rendered', 0);
    await flush();
    assert.equal(pending.length, count + 1);
    const world = pending.at(-1);
    assert.match(world.options.quietPrompt, /世界惯性·弱/);
    assert.match(world.options.quietPrompt, /只对玩家的行动作出反应/);
    switchChat(context('world-B'));
    const before = snapshot();
    world.resolve(empty);
    await new Promise(resolve => setTimeout(resolve, 650));
    assert.equal(snapshot(), before, 'stale world decision must not apply');
    assert.equal(pending.length, count + 1, 'stale afterWorld must not start self/memory calls in the new chat');
    settings.enableSelfLedger = false;
    settings.enableMemoryLedger = false;
    for (const id of ['world-floor-A', 'world-floor-B']) {
        switchChat(context(id));
        const prior = pending.length;
        events.emit('started', 'normal');
        events.emit('rendered', 0);
        assert.equal(pending.length, prior, 'non-streaming render waits for ended');
        events.emit('ended');
        await flush();
        assert.equal(pending.length, prior + 1, 'world floor dedup resets on chat change');
        pending.at(-1).resolve(empty);
        await new Promise(resolve => setTimeout(resolve, 650));
        assert.ok(active.chatMetadata.doupo_agent_world.log.some(item => item.summaries?.includes('本轮无变化')), 'persist includes the no-op note');
    }
    switchChat(context('streaming-final'));
    const streamingCount = pending.length;
    events.emit('started', 'normal');
    events.emit('ended');
    active.chat[0].mes += '（后处理后的最终正文）';
    events.emit('rendered', 0);
    await flush();
    assert.equal(pending.length, streamingCount + 1);
    assert.match(pending.at(-1).options.quietPrompt, /后处理后的最终正文/);
    events.emit('ended');
    events.emit('rendered', 0);
    assert.equal(pending.length, streamingCount + 1, 'duplicate lifecycle events must not launch another chain');
    pending.at(-1).resolve(empty);
    await new Promise(resolve => setTimeout(resolve, 650));
    assert.ok(active.chatMetadata.doupo_agent_world.log.some(item => item.summaries?.includes('本轮无变化')));

    switchChat(context('waiting-for-render'));
    events.emit('started', 'normal');
    events.emit('ended');
    const waitingCount = pending.length;
    switchChat(context('another-chat'));
    events.emit('rendered', 0);
    assert.equal(pending.length, waitingCount, 'a pending render barrier cannot cross chats');
    events.emit('started', 'quiet');
    events.emit('ended');
    events.emit('rendered', 0);
    assert.equal(pending.length, waitingCount, 'quiet generations cannot create a bookkeeping turn');
    settings.enabled = false;
    switchChat(context('master-disabled'));
    const disabledCount = pending.length;
    events.emit('started', 'normal'); events.emit('ended'); events.emit('rendered', 0);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(pending.length, disabledCount, 'disabled master starts no background requests');
    assert.deepEqual(active.chatMetadata, {}, 'disabled master writes no bookkeeping metadata');
    settings.enabled = true;
    switchChat(context('master-in-flight'));
    events.emit('started', 'normal'); events.emit('ended'); events.emit('rendered', 0);
    await flush();
    const inFlight = pending.at(-1), beforeDisabled = snapshot();
    active.extensionSettings.doupo_agent_ui.enabled = false;
    inFlight.resolve(JSON.stringify({ ops: [{ op: 'advance', minutes: 30 }] }));
    await new Promise(resolve => setTimeout(resolve, 650));
    assert.equal(snapshot(), beforeDisabled, 'disabled master rejects late model result');
    settings.enabled = true;
    console.log('index chat isolation behavioral tests passed');
} finally {
    // Never leave an unresolved mocked request, global host, or event listener for other tests.
    pending.forEach(call => call.resolve(empty));
    onDisable();
    if (previousHost === undefined) delete globalThis.SillyTavern;
    else globalThis.SillyTavern = previousHost;
}
