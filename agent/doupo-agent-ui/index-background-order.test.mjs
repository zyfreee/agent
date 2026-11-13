import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { doupoAgent as agent, onEnable, onDisable } from './index.js';

const previous = globalThis.SillyTavern;
const events = new EventEmitter(), pending = [], sampling = {};
events.makeLast = (event, handler) => { events.removeListener(event, handler); events.on(event, handler); };
const settings = { enableDbBridge: false, world: { decideAuto: false }, self: { mvuChannel: 'independent' }, memory: { consolidateAfter: 0 }, npc: { ledgerAuto: false }, impact: { decideAuto: false }, plot: { decideAuto: false } };
const makeContext = id => ({ chatId: id, chat: [{ mes: '第一轮正文', is_user: false }], chatMetadata: {}, chatCompletionSettings: sampling,
    extensionSettings: { doupo_agent_ui: settings }, eventSource: events,
    event_types: { CHAT_CHANGED: 'chat', GENERATION_STARTED: 'started', GENERATION_ENDED: 'ended', CHARACTER_MESSAGE_RENDERED: 'rendered' }, saveMetadata() {},
    generateQuietPrompt: options => new Promise(resolve => pending.push({ options, resolve })),
});
let active = makeContext('A');
const flush = () => new Promise(resolve => setImmediate(resolve));
const settle = () => new Promise(resolve => setTimeout(resolve, 650));
const empty = JSON.stringify({ ops: [], note: '无变化' });
const turn = () => { events.emit('started', 'normal'); events.emit('ended'); events.emit('rendered', active.chat.length - 1); };
try {
    globalThis.SillyTavern = { getContext: () => active }; onEnable();
    events.emit('chat'); turn(); await flush();
    assert.equal(pending.length, 1, 'self dispatch starts first');
    await flush(); assert.equal(pending.length, 1, 'memory must wait for self result');
    active.chat.push({ is_user: true, mes: '新的玩家行动' }, { is_user: false, mes: '第二轮当前正文' });
    turn(); pending[0].resolve(empty); await settle(); await flush();
    assert.equal(pending.length, 2, 'newest normal reply is replayed once after quiet settles');
    assert.match(pending[1].options.quietPrompt, /第二轮当前正文/);
    await flush(); assert.equal(pending.length, 2, 'second memory still waits for self');
    pending[1].resolve(empty); await settle(); await flush();
    assert.equal(pending.length, 3, 'memory starts only after current self completes');
    pending[2].resolve(empty); await settle(); await flush();
    events.emit('started', 'quiet'); events.emit('ended'); events.emit('rendered', active.chat.length - 1); await flush();
    assert.equal(pending.length, 3, 'quiet lifecycle never stimulates another bookkeeping chain');
    active.chat.push({ is_user: false, mes: '第三轮' }); turn(); await flush();
    assert.equal(pending.length, 4);
    active.chat.push({ is_user: false, mes: '旧聊天待补轮' }); turn();
    active = makeContext('B'); events.emit('chat'); pending[3].resolve(empty); await settle(); await flush();
    assert.equal(pending.length, 4, 'switching chat discards pending compensation');
    assert.deepEqual(active.chatMetadata, {});
    assert.ok(agent.selfSnapshot());
    // 申报块退役：回复带 <UpdateVariable> 块也只走纳戒决定，永远不分流仲裁器。
    active.chat.push({ is_user: true, mes: '买碗茶' }, { is_user: false, mes: '第四轮正文\n<UpdateVariable><JSONPatch>[{"op":"replace","path":"/斗破纳戒/金币","value":1}]</JSONPatch></UpdateVariable>' });
    turn(); await flush();
    assert.equal(pending.length, 5, 'block-bearing reply must still route to the ring decide, never the arbiter');
    assert.match(pending[4].options.quietPrompt, /第四轮正文/);
    console.log('background latest reply and self-memory order tests passed');
} finally {
    pending.forEach(call => call.resolve(empty)); onDisable();
    if (previous === undefined) delete globalThis.SillyTavern; else globalThis.SillyTavern = previous;
}
