import assert from 'node:assert/strict';
import { createNpcColdRuntime, filterColdPatches, mapWithLimit } from './npc-cold-runtime.js';
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

// 关系一跳扩散：事件没点名本人、但点名了一跳关系人，也算牵连并标注来源。
{
    const cold = createNpcColdRuntime({ now: () => 't0' });
    cold.select('药老');
    const elder = { name: '药老', aliases: ['药尘'], titles: [] };
    // 先建第 4 天基线：第一次扫描只建基线，不产草稿。
    cold.candidates({ day: 4, records: [elder], worldSnapshot: { clock: { day: 4 }, nearEvents: [], worldEvents: [] } });
    // 同一天出现的事件：不点名药老，点名萧炎。
    const snap = { clock: { day: 4 }, nearEvents: [{ id: 'g1', day: 4, text: '萧炎在魔兽山脉连败两名斗者', basis: '传闻' }], worldEvents: [] };
    const none = cold.candidates({ day: 4, records: [elder], worldSnapshot: snap });
    assert.equal(none.length, 0, '没传关系映射时，只提关系人的事件不算牵连');
    const hit = cold.candidates({ day: 4, records: [elder], worldSnapshot: snap, relationsByPerson: { 药老: ['萧炎'] } });
    assert.equal(hit.length, 1, '一跳关系人出现在事件里算牵连');
    assert.deepEqual(hit[0].eventIds, ['g1']);
    assert.ok(hit[0].reason.includes('经关系牵连：萧炎'), '原因里要写明是经谁牵连的');
}

// —— B1 三档匹配：点名（participants）最优先，reason 标「事件点名」 ——
{
    const cold = createNpcColdRuntime({ now: () => 't0' });
    cold.select('药老');
    const elder = { name: '药老', aliases: ['药尘'], titles: [] };
    cold.candidates({ day: 4, records: [elder], worldSnapshot: { clock: { day: 4 }, nearEvents: [], worldEvents: [] } });
    const snap = { clock: { day: 4 }, nearEvents: [{ id: 'p1', day: 4, text: '有人在药铺附近打探消息', participants: ['药老'] }], worldEvents: [] };
    const hit = cold.candidates({ day: 4, records: [elder], worldSnapshot: snap });
    assert.equal(hit.length, 1, '事件点名本人，正文没提也算牵连');
    assert.ok(hit[0].reason.includes('事件点名'), hit[0].reason);
    assert.deepEqual(hit[0].eventIds, ['p1']);
}

// —— B1 长名护栏：事件只写「萧炎鼎」时，不再牵连到「萧炎」 ——
{
    const cold = createNpcColdRuntime({ now: () => 't0' });
    cold.select(['萧炎', '萧炎鼎']);
    const yan = { name: '萧炎', aliases: [], titles: [] };
    const ding = { name: '萧炎鼎', aliases: [], titles: [] };
    const empty = { clock: { day: 2 }, nearEvents: [], worldEvents: [] };
    cold.candidates({ day: 2, records: [yan, ding], worldSnapshot: empty });
    const snap = { clock: { day: 2 }, nearEvents: [{ id: 'x1', day: 2, text: '萧炎鼎当街贩卖劣质丹药被查' }], worldEvents: [] };
    const hits = cold.candidates({ day: 2, records: [yan, ding], worldSnapshot: snap });
    assert.deepEqual(hits.map(item => item.name), ['萧炎鼎'], '短名命中被更长的名字整个盖住，不算独立出现');
}

// —— B2 事件预算：新事件超上限按 major>rumor>minor、同档新的在前挑选 ——
{
    const cold = createNpcColdRuntime({ now: () => 't0' });
    cold.select('甲乙');
    const person = { name: '甲乙', aliases: [], titles: [] };
    cold.candidates({ day: 1, records: [person], worldSnapshot: { clock: { day: 1 }, nearEvents: [], worldEvents: [] } });
    const events = [];
    for (let index = 1; index <= 16; index += 1) {
        events.push({ id: `e${index}`, day: 2, text: `牵连甲乙的第${index}件事`, weight: index <= 3 ? 'major' : index <= 6 ? 'rumor' : 'minor' });
    }
    const snap = { clock: { day: 2 }, nearEvents: events, worldEvents: [] };
    const [candidate] = cold.candidates({ day: 2, records: [person], worldSnapshot: snap });
    assert.equal(candidate.events.length, 12, '单次最多喂 12 条新事件');
    assert.deepEqual(candidate.events.slice(0, 3).map(event => event.weight), ['major', 'major', 'major']);
    assert.deepEqual(candidate.events.slice(3, 6).map(event => event.weight), ['rumor', 'rumor', 'rumor']);
    assert.deepEqual(candidate.events.slice(6).map(event => event.id), ['e7', 'e8', 'e9', 'e10', 'e11', 'e12'], '普通事件按新旧取前 6 条');
}

// —— B3 留痕：确认记一句摘要；放弃的草稿留痕并标明 ——
{
    const cold = createNpcColdRuntime({ now: () => 't0' });
    cold.select('A测试');
    const person = { name: 'A测试', aliases: [], titles: [] };
    cold.candidates({ day: 1, records: [person], worldSnapshot: { clock: { day: 1 }, nearEvents: [], worldEvents: [] } });
    const snap = { clock: { day: 3 }, nearEvents: [{ id: 'n1', day: 2, text: 'A测试被牵连的事件' }], worldEvents: [] };
    const [candidate] = cold.candidates({ day: 3, records: [person], worldSnapshot: snap });
    assert.ok(candidate.lastNote === '', '无留痕时空串');
    cold.rememberPreview({ ...candidate, patch: { 人物: [{ 姓名: 'A测试', 位置: '乌坦城', 流水: ['派人打探消息'] }] } });
    cold.mark('A测试', { previewId: candidate.id, day: 3, eventIds: candidate.eventIds });
    assert.ok(cold.get('A测试').lastNote.includes('位置:乌坦城'), cold.get('A测试').lastNote);
    assert.ok(cold.get('A测试').lastNote.includes('派人打探消息'), '摘要带最后一条流水');
    const cold2 = createNpcColdRuntime({ now: () => 't0' });
    cold2.select('B测试');
    const person2 = { name: 'B测试', aliases: [], titles: [] };
    cold2.candidates({ day: 1, records: [person2], worldSnapshot: { clock: { day: 1 }, nearEvents: [], worldEvents: [] } });
    const snap2 = { clock: { day: 3 }, nearEvents: [{ id: 'n2', day: 2, text: 'B测试被牵连的事件' }], worldEvents: [] };
    const [c2] = cold2.candidates({ day: 3, records: [person2], worldSnapshot: snap2 });
    cold2.rememberPreview({ ...c2, patch: { 人物: [{ 姓名: 'B测试', 好感: 5 }] } });
    cold2.discard(c2.id);
    assert.ok(cold2.get('B测试').lastNote.includes('放弃'), cold2.get('B测试').lastNote);
}

// —— B6 撤销：rememberUndo/unmark/clearUndo 回滚游标与草稿状态 ——
{
    const cold = createNpcColdRuntime({ now: () => 't0' });
    cold.select('C测试');
    const person = { name: 'C测试', version: 1, aliases: [], titles: [] };
    cold.candidates({ day: 1, records: [person], worldSnapshot: { clock: { day: 1 }, nearEvents: [], worldEvents: [] } });
    const snap = { clock: { day: 3 }, nearEvents: [{ id: 'u1', day: 2, text: 'C测试被牵连的事件' }], worldEvents: [] };
    const [candidate] = cold.candidates({ day: 3, records: [person], worldSnapshot: snap });
    cold.rememberPreview({ ...candidate, patch: { 人物: [{ 姓名: 'C测试', 位置: '帝都' }] } });
    cold.rememberUndo({ previewId: candidate.id, name: 'C测试', day: 3, previousDay: 1, records: { C测试: person } });
    cold.mark('C测试', { previewId: candidate.id, day: 3, eventIds: candidate.eventIds });
    assert.equal(cold.get('C测试').lastDay, 3);
    assert.equal(cold.status().previews.find(item => item.id === candidate.id).status, 'confirmed');
    const undo = cold.getUndo();
    assert.equal(undo.previewId, candidate.id);
    assert.equal(undo.records['C测试'].version, 1);
    assert.equal(cold.unmark('cold-999').reason, 'preview_not_confirmed', '未知草稿不能回滚');
    cold.unmark(undo.previewId);
    assert.equal(cold.get('C测试').lastDay, 1, '游标退回 previousDay');
    assert.equal(cold.get('C测试').eventIds.includes('u1'), false, '已见事件号从游标移除');
    assert.equal(cold.status().previews.find(item => item.id === candidate.id).status, 'pending', '草稿回到待确认');
    cold.clearUndo();
    assert.equal(cold.getUndo(), null);
}

// —— B4/B5 助手：有界并发保序；外来补丁丢弃计数 ——
{
    const seen = [];
    const result = await mapWithLimit([1, 2, 3, 4, 5], 2, async value => {
        await new Promise(resolve => setTimeout(resolve, value % 3));
        seen.push(value);
        return value * 10;
    });
    assert.deepEqual(result, [10, 20, 30, 40, 50], '结果按原顺序回填');
    assert.deepEqual([...seen].sort((a, b) => a - b), [1, 2, 3, 4, 5], '每人都被处理过');
    const { kept, droppedNames } = filterColdPatches(
        [{ 姓名: '萧战', 位置: '乌坦城' }, { 姓名: '纳兰嫣然', 好感: 2 }, { 位置: '没写姓名的保留' }],
        { name: '萧战', aliases: [], titles: [] },
    );
    assert.deepEqual(kept.map(item => item.姓名), ['萧战', '萧战'], '姓名缺省视为本人并改写主键');
    assert.deepEqual(droppedNames, ['纳兰嫣然'], '名单外的人被丢弃并计数');
}

// —— B2/B3 注入材料：分块预算装包、留痕段、事件行带点名 ——
{
    const manyEvents = Array.from({ length: 40 }, (_, index) => ({ id: `m${index}`, day: 2, text: `事件正文${index}。`.repeat(50) }));
    const packed = buildNpcColdUser({ record: { name: '萧战' }, fromDay: 1, toDay: 2, events: manyEvents, floors: [] });
    assert.match(packed, /另有 \d+ 条较次要的事件没装进来/, '装不下的整条丢并计数');
    assert.ok(!packed.includes('…【'), '事件行不被拦腰截断');
    const withNote = buildNpcColdUser({ record: { name: '萧战' }, fromDay: 1, toDay: 2, events: [], floors: [], lastNote: '位置:乌坦城；派人打探消息' });
    assert.match(withNote, /【上次冷藏推进留痕】/);
    assert.match(withNote, /派人打探消息/);
    const withParticipants = buildNpcColdUser({ record: { name: '药老' }, fromDay: 1, toDay: 2, events: [{ id: 'p9', day: 2, text: '事件', participants: ['萧炎', '药老'] }], floors: [] });
    assert.match(withParticipants, /（涉及：萧炎、药老）/);
}

console.log('npc-cold-runtime: ok');
