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
console.log('npc-cold-runtime: ok');
