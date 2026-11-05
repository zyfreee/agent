import assert from 'node:assert/strict';
import { createMessageAdapter } from './message-adapter.js';

// OPT-029: neither an undefined return nor a synthetic ID is observation.
for (const method of ['sendMessage', 'executeSlashCommandsWithOptions']) {
    const context = { chat: [], [method]: async () => undefined };
    const receipt = await createMessageAdapter({ getContext: () => context }).deliver({ text: '正文', taskId: 't' });
    assert.equal(receipt.observed, false);
    assert.equal(receipt.messageId, undefined);
}
{
    const context = { chat: [], sendMessage: async () => { context.chat.push({ mes: '正文' }, { mes: '旁人' }); return { index: 0 }; }, saveChat: async () => {} };
    const adapter = createMessageAdapter({ getContext: () => context });
    const sent = await adapter.deliver({ text: '正文' });
    assert.equal(sent.observed, true);
    assert.equal(sent.messageId, '0');
    context.updateMessageBlock = () => { throw new Error('render failed'); };
    context.saveChat = async () => { throw new Error('save failed'); };
    const updated = await adapter.update({ messageId: '0', text: '新文' });
    assert.equal(updated.observed, false);
    assert.equal(updated.rendered, false);
    assert.equal(updated.saved, false);
}
// Scope invalidation during send must not save or observe the new chat.
{
    let owner = 1, saves = 0;
    let context = { chat: [], saveChat: async () => { saves++; }, sendMessage: async () => { owner++; context = { chat: [], saveChat: async () => { saves++; } }; } };
    const adapter = createMessageAdapter({ getContext: () => context, capture: () => owner, isCurrent: token => token === owner });
    const receipt = await adapter.deliver({ text: '旧聊正文' });
    assert.equal(receipt.observed, false);
    assert.equal(saves, 0);
}
// Scope-only owners accept our own insertion; stopped owners dispatch nothing.
{
    const context = { chat: [], addOneMessage: async message => { context.chat.push(message); }, saveChat: async () => {} };
    const adapter = createMessageAdapter({ getContext: () => context, capture: () => context.chat, isCurrent: owner => owner === context.chat });
    assert.equal((await adapter.deliver({ text: 'own message' })).observed, true);
    const stopped = createMessageAdapter({ getContext: () => context, isCurrent: () => false });
    assert.equal((await stopped.deliver({ text: 'blocked' })).observed, false);
    assert.equal(context.chat.length, 1);
}
{
    let enabled = true, saves = 0;
    const context = { chat: [{ mes: 'before' }], updateMessageBlock: async () => { enabled = false; }, saveChat: async () => { saves++; } };
    const adapter = createMessageAdapter({ getContext: () => context, isCurrent: () => enabled });
    assert.equal((await adapter.update({ messageId: '0', text: 'after' })).observed, false);
    assert.equal(saves, 0, 'disabled during rendering must not start a later save');
}
console.log('message-adapter tests passed');
