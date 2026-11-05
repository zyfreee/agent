import assert from 'node:assert/strict';
import { createNpcColdRuntime } from './npc-cold-runtime.js';
import { buildNpcColdUser, NPC_COLD_PROMPT } from './npc-cold-recorder.js';

const runtime = createNpcColdRuntime({ now: () => 't0' });
runtime.select('萧战');
const record = { name: '萧战', aliases: ['萧族长'], titles: [], location: '乌坦城', favor: 3 };
const baseline = { clock: { day: 1 }, nearEvents: [], worldEvents: [] };
assert.deepEqual(runtime.candidates({ day: 1, records: [record], worldSnapshot: baseline }), []);
const snapshot = {
    clock: { day: 3 },
    nearEvents: [{ id: 'e1', day: 2, text: '萧战收到族内急报', basis: '正文' }],
    worldEvents: [{ id: 'e2', day: 1, text: '加玛帝国局势动荡', basis: '世界大事' }],
};
let candidates = runtime.candidates({ day: 3, records: [record], worldSnapshot: snapshot });
assert.equal(candidates.length, 1);
assert.deepEqual(candidates[0].eventIds, ['e1']);
assert.equal(candidates[0].toDay, 3);

runtime.rememberPreview({ id: candidates[0].id, name: '萧战', fromDay: 1, toDay: 3, eventIds: ['e1'], patch: { 人物: [{ 姓名: '萧战', 流水: ['收到急报'] }] } });
assert.equal(runtime.status().previews[0].patch.人物[0].流水[0], '收到急报');
runtime.mark('萧战', { day: 3, eventIds: ['e1'] });
assert.equal(runtime.candidates({ day: 3, records: [record], worldSnapshot: snapshot }).length, 0);

runtime.select('萧炎');
assert.equal(runtime.status().selected.length, 2);
const restored = createNpcColdRuntime({ now: () => 't1' });
restored.restore(runtime.snapshot());
assert.deepEqual(restored.status().selected, ['萧战', '萧炎']);

const user = buildNpcColdUser({ record, fromDay: 3, toDay: 4, events: snapshot.nearEvents, floors: [{ role: '角色', text: '萧战决定派人查探。' }] });
assert.match(user, /【目标人物】/);
assert.match(user, /第 3 天 → 第 4 天/);
assert.match(user, /萧战收到族内急报/);
assert.match(NPC_COLD_PROMPT, /单次最多 ±10/);
// OPT-052: restoring pending IDs cannot overwrite unrelated drafts.
{
    const cold = createNpcColdRuntime();
    const records = [{ name: 'A', version: 2 }, { name: 'B', version: 3 }];
    cold.select(['A', 'B']);
    cold.candidates({ day: 1, records });
    for (const candidate of cold.candidates({ day: 2, records })) cold.rememberPreview(candidate);
    const oldIds = cold.status().previews.map(item => item.id);
    const next = createNpcColdRuntime();
    next.restore(cold.snapshot());
    for (const candidate of next.candidates({ day: 3, records })) next.rememberPreview(candidate);
    assert.equal(new Set(next.status().previews.map(item => item.id)).size, 4);
    assert.ok(oldIds.every(id => next.status().previews.some(item => item.id === id)));
    next.restore(cold.snapshot()); // switching back to this chat is also collision-free
    assert.ok(!oldIds.includes(next.candidates({ day: 4, records })[0].id));
}
// OPT-053: only the applied ID is confirmed; siblings become stale, never confirmed.
for (const chosenDay of [2, 3]) {
    const cold = createNpcColdRuntime();
    const records = [{ name: 'A', version: 4 }];
    cold.select('A'); cold.candidates({ day: 1, records });
    for (const day of [2, 3]) cold.rememberPreview(cold.candidates({ day, records })[0]);
    const drafts = cold.status().previews;
    const chosen = drafts.find(item => item.toDay === chosenDay);
    const other = drafts.find(item => item.id !== chosen.id);
    assert.equal(cold.validatePreview(chosen.id, { recordVersion: 4 }).status, 'ready');
    assert.equal(cold.validatePreview(chosen.id, { recordVersion: 5 }).reason, 'record_version_mismatch');
    assert.equal(cold.mark('A', { day: 9 }).reason, 'ambiguous_preview');
    assert.equal(cold.get('A').lastDay, 1);
    assert.equal(cold.mark('B', { previewId: chosen.id }).status, 'rejected');
    assert.equal(cold.mark('A', { previewId: chosen.id, day: 999 }).status, 'marked');
    assert.equal(cold.get('A').lastDay, chosenDay, 'cursor derives from applied draft, not caller day');
    assert.equal(cold.status().previews.find(item => item.id === chosen.id).status, 'confirmed');
    assert.equal(cold.status().previews.find(item => item.id === other.id).status, 'stale');
    assert.equal(cold.validatePreview(other.id).status, 'stale');
    assert.equal(cold.mark('A', { previewId: chosen.id }).status, 'rejected');
}
{
    const cold = createNpcColdRuntime();
    cold.restore({ sync: { A: { lastDay: 3 } }, previews: [{ id: 'cold-9', name: 'A', fromDay: 1, toDay: 2, status: 'pending' }] });
    assert.equal(cold.validatePreview('cold-9').reason, 'cursor_mismatch');
    cold.restore({ sync: { A: { lastDay: 1 } }, previews: [{ id: 'cold-9', name: 'A', fromDay: 1, toDay: 2, status: 'pending' }] });
    assert.equal(cold.validatePreview('cold-9').status, 'ready', 'legacy draft without record version');
    cold.discard('cold-9');
    assert.equal(cold.mark('A', { previewId: 'cold-9' }).status, 'rejected');
    assert.equal(cold.get('A').lastDay, 1);
}
// OPT-053 closure: confirming one name never touches other names' drafts.
{
    const cold = createNpcColdRuntime();
    const records = [{ name: 'A', version: 2 }, { name: 'B', version: 2 }];
    cold.select(['A', 'B']); cold.candidates({ day: 1, records });
    for (const day of [2, 3]) for (const candidate of cold.candidates({ day, records })) cold.rememberPreview(candidate);
    const aDrafts = cold.status().previews.filter(item => item.name === 'A');
    const bDrafts = cold.status().previews.filter(item => item.name === 'B');
    assert.equal(aDrafts.length, 2); assert.equal(bDrafts.length, 2);
    const chosen = aDrafts[0];
    assert.equal(cold.mark('A', { previewId: chosen.id }).status, 'marked');
    const after = cold.status().previews;
    assert.equal(after.find(item => item.id === chosen.id).status, 'confirmed');
    assert.equal(after.find(item => item.id === aDrafts[1].id).status, 'stale', 'same-name sibling becomes stale');
    for (const draft of bDrafts) {
        assert.equal(after.find(item => item.id === draft.id).status, 'pending', 'other-name draft stays pending');
        assert.equal(cold.validatePreview(draft.id, { recordVersion: 2 }).status, 'ready', 'other-name draft still confirmable');
    }
    assert.equal(cold.mark('B', { previewId: bDrafts[1].id }).status, 'marked', 'other name confirms its own draft afterwards');
    assert.equal(cold.status().previews.find(item => item.id === bDrafts[0].id).status, 'stale');
    assert.equal(cold.status().previews.find(item => item.id === bDrafts[1].id).status, 'confirmed');
}
console.log('npc-cold-runtime: ok');
