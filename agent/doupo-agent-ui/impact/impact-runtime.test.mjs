import assert from 'node:assert/strict';
import { createImpactRuntime } from '../impact/impact-runtime.js';

let tick = 0;
const now = () => `2026-01-01T00:00:${String(tick++).padStart(2, '0')}.000Z`;
const runtime = createImpactRuntime({ maxOps: 3, maxChainDepth: 1, now });

const auction = { title: '拍卖场被砸', detail: '萧炎当众拍走三纹青灵丹，加列家族颜面扫地', target: '乌坦城·拍卖场', evidence: '第 12 楼', weight: 'world', kind: 'direct' };

const first = runtime.apply([{ op: 'record', ...auction }], { day: 12, floor: 11 });
assert.equal(first.status, 'applied');
assert.equal(first.applied.length, 1);
assert.equal(first.applied[0].record.id, 'i1');
assert.equal(first.applied[0].record.state, 'active');
assert.equal(first.applied[0].record.day, 12);
assert.equal(first.applied[0].record.floor, 11);
assert.equal(first.applied[0].record.certainty, 'certain');
assert.equal(runtime.status().active, 1);
assert.equal(runtime.status().version, 1);

const missing = runtime.apply([{ op: 'record', title: '   ' }], { day: 12 });
assert.equal(missing.status, 'rejected');
assert.deepEqual(missing.rejected.map(item => item.reason), ['title_missing']);
assert.equal(runtime.apply([{ op: 'record', title: '只有标题' }], { day: 12 }).rejected[0].reason, 'detail_missing');
assert.equal(runtime.apply([{ op: 'record', title: 't', detail: 'd' }], { day: 12 }).rejected[0].reason, 'target_missing');
assert.equal(runtime.apply([{ op: 'record', title: 't', detail: 'd', target: 'x'.repeat(41) }], { day: 12 }).rejected[0].reason, 'target_too_long');
assert.equal(runtime.apply([{ op: 'record', title: 't', detail: 'd', target: 't', ripen: 0 }], { day: 12 }).rejected[0].reason, 'bad_ripen');
assert.equal(runtime.apply([{ op: 'record', title: 't', detail: 'd', target: 't', ripen: 366 }], { day: 12 }).rejected[0].reason, 'bad_ripen');
assert.equal(runtime.apply([{ op: 'spawn' }], { day: 12 }).rejected[0].reason, 'unknown_op');
assert.equal(runtime.apply([{ op: 'record', ...auction }], { day: 12, floor: 11, source: 'manual' }).rejected[0].reason, 'duplicate_record');
// 换一楼但同一天、同一个对象、同一个说法：按“同一件事”挡住，避免模型换楼重复记账。
assert.equal(runtime.apply([{ op: 'record', ...auction }], { day: 12, floor: 12 }).rejected[0].reason, 'duplicate_similar');

// 蝴蝶链：父链只能接 maxChainDepth 层。
const child = runtime.apply([{ op: 'record', title: '加列家族记恨', detail: '家主开始在城里查是谁动的手', target: '加列家族', kind: 'ripple', parent: 'i1' }], { day: 13, floor: 13 });
assert.equal(child.status, 'applied');
assert.equal(child.applied[0].record.depth, 1);
assert.equal(child.applied[0].record.parent, 'i1');
const orphan = runtime.apply([{ op: 'record', title: '无源之果', detail: 'd', target: 't', parent: 'i99' }], { day: 13, floor: 14 });
assert.equal(orphan.rejected[0].reason, 'parent_not_found');
const deep = runtime.apply([{ op: 'record', title: '第三代', detail: 'd', target: 't', parent: child.applied[0].record.id }], { day: 13, floor: 15 });
assert.equal(deep.rejected[0].reason, 'chain_too_deep');

// 发酵日：到点自动翻牌，不用人再点。
const delayed = runtime.apply([{ op: 'record', title: '云岚宗过问', detail: '长老派人下山查青灵丹去向', target: '云岚宗', weight: 'major', ripen: 5 }], { day: 15, floor: 16 });
assert.equal(delayed.applied[0].record.ripenDay, 20);
assert.equal(runtime.pendingRipen(15).length, 1);
assert.equal(runtime.status().due, 0);
const swept = runtime.apply([], { day: 20 });
assert.deepEqual(swept.due, [delayed.applied[0].record.id]);
assert.equal(runtime.pendingRipen(20).length, 0);
assert.equal(runtime.status().ripened, 1);

const ripen = runtime.apply([{ op: 'ripen', ref: 'i1', detail: '加列家族的人开始挨家问话' }], { day: 21 });
assert.equal(ripen.status, 'applied');
assert.equal(runtime.list({ state: 'ripened' }).find(record => record.id === 'i1').resolution, '加列家族的人开始挨家问话');
assert.equal(runtime.apply([{ op: 'ripen', ref: 'i1' }], { day: 21 }).rejected[0].reason, 'already_ripened');
assert.equal(runtime.apply([{ op: 'close', ref: 'i1' }], { day: 22 }).applied[0].record.state, 'closed');
assert.equal(runtime.apply([{ op: 'ripen', ref: 'i1' }], { day: 22 }).rejected[0].reason, 'record_inactive');
assert.equal(runtime.apply([{ op: 'revert', ref: 'i2', detail: '赔钱了事，风波压下去' }], { day: 23 }).applied[0].record.state, 'reverted');
assert.equal(runtime.apply([{ op: 'close', ref: 'i404' }], { day: 23 }).rejected[0].reason, 'record_not_found');

// 同楼重 roll：上一版影响撤销，新一版落地。
const reroll = createImpactRuntime({ now });
reroll.apply([{ op: 'record', title: '旧版本', detail: '第一版正文写成了别的', target: '乌坦城' }], { day: 3, floor: 5 });
const again = reroll.apply([{ op: 'record', title: '新版本', detail: '重新生成后正文改成这样', target: '乌坦城' }], { day: 3, floor: 5 });
assert.equal(again.status, 'applied');
assert.deepEqual(reroll.list().map(record => record.title), ['新版本']);
assert.equal(reroll.status().version, 2);
reroll.apply([{ op: 'record', title: '另一楼', detail: '不受影响', target: '乌坦城' }], { day: 3, floor: 6 });
assert.equal(reroll.status().total, 2);

// 手动登记（source=manual）不做同楼回滚。
reroll.apply([{ op: 'record', title: '手记一', detail: '面板补登', target: '乌坦城' }], { day: 4, floor: 6, source: 'manual' });
reroll.apply([{ op: 'record', title: '手记二', detail: '面板再补一条', target: '乌坦城' }], { day: 4, floor: 6, source: 'manual' });
assert.equal(reroll.list().filter(record => record.title.startsWith('手记')).length, 2);

// 单批上限：多出的操作静默丢掉，不整批失败。
const batch = createImpactRuntime({ maxOps: 3, now });
const clipped = batch.apply([
    { op: 'record', title: 'a', detail: 'd', target: 't' },
    { op: 'record', title: 'b', detail: 'd', target: 't' },
    { op: 'record', title: 'c', detail: 'd', target: 't' },
    { op: 'record', title: 'd', detail: 'd', target: 't' },
], { day: 1 });
assert.equal(clipped.applied.length, 3);
assert.equal(batch.status().total, 3);

// opId 去重：同一条指令重复推送只算一次。
const ided = createImpactRuntime({ now });
ided.apply([{ op: 'record', title: '一次性', detail: 'd', target: 't', opId: 'o1' }], { day: 1 });
const repeat = ided.apply([{ op: 'record', title: '一次性', detail: 'd', target: 't', opId: 'o1' }], { day: 2, floor: 7 });
assert.deepEqual(repeat.duplicate, ['o1']);
assert.equal(ided.status().total, 1);

// 库满：最旧的挪进档案，不删除。
const small = createImpactRuntime({ maxRecords: 3, now });
for (let index = 1; index <= 5; index++) {
    small.apply([{ op: 'record', title: `第${index}件`, detail: 'd', target: 't' }], { day: index });
}
assert.equal(small.status().total, 3);
assert.equal(small.status().archived, 2);
assert.deepEqual(small.list().map(record => record.title), ['第5件', '第4件', '第3件']);

const listed = runtime.list({ weight: 'world' });
assert.ok(listed.length >= 1);
assert.equal(runtime.list({ target: '加列' }).length, 1);
assert.equal(runtime.list({ state: 'closed', limit: 1 }).length, 1, 'limit 只取一条');

const snapshot = runtime.snapshot();
assert.equal(snapshot.records.length, runtime.status().total);
const restored = createImpactRuntime({ now });
restored.restore(snapshot);
assert.equal(restored.status().total, snapshot.records.length);
assert.equal(restored.status().version, snapshot.version);
assert.equal(restored.status().day, snapshot.day);
const garbage = createImpactRuntime({ now });
assert.equal(garbage.restore({ records: [{ title: '' }, null, { title: '幸存', detail: 'd', target: 't', weight: '乱写' }] }).total, 1);
assert.equal(garbage.list()[0].weight, 'minor');
assert.equal(garbage.reset().total, 0);
assert.equal(runtime.note('模型判断本轮无变化').status, 'noted');
assert.equal(runtime.snapshot().log.at(-1).summaries[0], '模型判断本轮无变化');

// 设置页热更新上限：条数即时生效，越界值夹紧而不是抛错。
const tuned = createImpactRuntime({ now });
assert.equal(tuned.config().maxRecords, 0);
assert.equal(tuned.configure({ maxRecords: 2 }).status, 'configured');
for (let index = 1; index <= 3; index++) {
    tuned.apply([{ op: 'record', title: `第${index}件`, detail: 'd', target: 't' }], { day: index });
}
assert.equal(tuned.status().total, 2);
assert.equal(tuned.configure({ maxRecords: -5 }).config.maxRecords, 2, '越界值忽略，保留原上限');
assert.equal(tuned.configure({ maxChainDepth: 99 }).config.maxChainDepth, 4);
assert.equal(tuned.configure('乱写').status, 'rejected');

// 记录节奏按“上次叫记录员的楼层”算：这一轮什么都没记到，也算叫过一次。
const cadence = createImpactRuntime({ now });
assert.equal(cadence.status().decidedFloor, -1);
assert.equal(cadence.apply([], { source: 'decide', floor: 5, day: 1 }).status, 'noop');
assert.equal(cadence.status().decidedFloor, 5);
cadence.apply([{ op: 'record', title: '一', detail: 'd', target: 't' }], { source: 'decide', floor: 7, day: 1 });
assert.equal(cadence.status().decidedFloor, 7);
assert.equal(cadence.apply([], { source: 'manual', floor: 9, day: 1 }).status, 'noop');
assert.equal(cadence.status().decidedFloor, 7, '手动记录不改记录节奏');
const cadenceRestore = createImpactRuntime({ now });
cadenceRestore.restore(cadence.snapshot());
assert.equal(cadenceRestore.status().decidedFloor, 7);
assert.equal(createImpactRuntime({ now }).restore({}).decidedFloor, -1);

// 手动改写一条已经记下的影响：内容可改、发酵安排可清空、状态不被顺手改掉。
const editing = createImpactRuntime({ now });
editing.apply([{ op: 'record', title: '加列家的药材库被烧', detail: '药价上涨', target: '加列家族', weight: 'major', canon: '药材生意', shift: 'alter', ripen: 3 }], { source: 'manual', day: 2 });
const editResult = editing.apply([{ op: 'edit', ref: 'i1', title: '加列家的药材库一夜被烧', detail: '药价翻倍，加列家开始查人', weight: 'world' }], { source: 'manual', day: 2 });
assert.equal(editResult.status, 'applied');
const edited = editing.list()[0];
assert.equal(edited.title, '加列家的药材库一夜被烧');
assert.equal(edited.weight, 'world');
assert.equal(edited.state, 'active');
assert.equal(edited.ripenDay, 5, '只改内容不会动发酵安排');
assert.equal(edited.shift, 'alter', '没传 shift 时保留原偏移');
editing.apply([{ op: 'edit', ref: 'i1', ripen: null }], { source: 'manual', day: 2 });
assert.equal(editing.list()[0].ripenDay, null, '清空天数即取消发酵安排');
assert.equal(editing.apply([{ op: 'edit', ref: 'i9', title: 'x' }], { day: 2 }).rejected[0].reason, 'record_not_found');
assert.equal(editing.apply([{ op: 'edit', ref: 'i1', title: '' }], { day: 2 }).rejected[0].reason, 'title_missing');
assert.equal(editing.apply([{ op: 'edit', ref: 'i1', weight: 'huge' }], { day: 2 }).rejected[0].reason, 'bad_weight');
assert.equal(editing.apply([{ op: 'edit', ref: 'i1', ripen: 0 }], { day: 2 }).rejected[0].reason, 'bad_ripen');
// 已经收场的条目允许改文字（修错别字），但不会因为改写而“复活”。
editing.apply([{ op: 'close', ref: 'i1', detail: '压下消息' }], { day: 3 });
assert.equal(editing.apply([{ op: 'edit', ref: 'i1', title: '加列家压下药材库的事' }], { day: 3 }).status, 'applied');
assert.equal(editing.list()[0].state, 'closed');

// 同一楼重 roll：整批（新增 + 改写）先撤销再重来，不会越改越多。
const rerollEdit = createImpactRuntime({ now });
rerollEdit.apply([{ op: 'record', title: '原样', detail: 'd', target: 't' }], { source: 'decide', floor: 4, day: 1 });
const redo = rerollEdit.apply([
    { op: 'record', title: '重记', detail: 'd2', target: 't' },
    { op: 'edit', ref: 'i2', title: '重记并改写' },
], { source: 'decide', floor: 4, day: 1 });
assert.equal(redo.status, 'applied');
assert.equal(rerollEdit.status().total, 1);
assert.equal(rerollEdit.list()[0].title, '重记并改写');

// 已经应验的影响，改错别字不会把自己改回“未了结”，也不会抹掉发酵日。
const ripenedEdit = createImpactRuntime({ now });
ripenedEdit.apply([{ op: 'record', title: '石桥塌了', detail: '过河要绕路', target: '乌坦城', ripen: 2 }], { source: 'manual', day: 1 });
ripenedEdit.apply([], { source: 'manual', day: 5 });
assert.equal(ripenedEdit.list()[0].state, 'ripened');
ripenedEdit.apply([{ op: 'edit', ref: 'i1', title: '石桥塌了半边' }], { source: 'manual', day: 5 });
assert.equal(ripenedEdit.list()[0].state, 'ripened');
assert.equal(ripenedEdit.list()[0].title, '石桥塌了半边');
assert.equal(ripenedEdit.list()[0].ripenedDay, 3, '发酵日仍是当初应验的那天');
assert.equal(ripenedEdit.list()[0].ripenDay, 3, '排定的发酵日也还在');

// 玩家推动/拖延一件已经记下的影响：负数提前、正数延后；提前到今天就算当场应验。
const timing = createImpactRuntime({ now });
timing.apply([{ op: 'record', title: '云岚宗的人下山', detail: '长老派弟子来查青灵丹', target: '云岚宗', ripen: 10 }], { source: 'manual', day: 2 });
assert.equal(timing.list()[0].ripenDay, 12);
assert.equal(timing.apply([{ op: 'adjust', ref: 'i1', days: -4 }], { source: 'manual', day: 2 }).status, 'applied');
assert.equal(timing.list()[0].ripenDay, 8);
assert.equal(timing.list()[0].edited, true, '调过时间也算改过的账');
assert.equal(timing.status().edited, 1);
assert.equal(timing.apply([{ op: 'adjust', ref: 'i1', days: 5 }], { source: 'manual', day: 3 }).applied[0].record.ripenDay, 13);
assert.equal(timing.apply([{ op: 'adjust', ref: 'i1', days: -99 }], { source: 'manual', day: 3 }).applied[0].record.state, 'ripened', '提前到当天或更早就是当场应验');
assert.equal(timing.apply([{ op: 'adjust', ref: 'i1', days: 1 }], { source: 'manual', day: 4 }).rejected[0].reason, 'already_ripened');
assert.equal(timing.apply([{ op: 'adjust', ref: 'i9', days: 1 }], { source: 'manual', day: 4 }).rejected[0].reason, 'record_not_found');

const noSchedule = createImpactRuntime({ now });
noSchedule.apply([{ op: 'record', title: '城门口贴了告示', detail: 'd', target: '乌坦城' }], { source: 'manual', day: 1 });
assert.equal(noSchedule.apply([{ op: 'adjust', ref: 'i1', days: -1 }], { source: 'manual', day: 1 }).rejected[0].reason, 'no_schedule');
assert.equal(noSchedule.apply([{ op: 'adjust', ref: 'i1', days: 0 }], { source: 'manual', day: 1 }).rejected[0].reason, 'bad_days');
assert.equal(noSchedule.apply([{ op: 'adjust', ref: 'i1', days: 3 }], { source: 'manual', day: 1 }).applied[0].record.ripenDay, 4, '本来没排期的可以往后排');

// 同楼重 roll 必须把 adjust 改过的状态/发酵日/标黄一起撤回。
const timingReroll = createImpactRuntime({ now });
timingReroll.apply([{ op: 'record', title: '原样', detail: 'd', target: 't', ripen: 5 }], { source: 'decide', floor: 2, day: 1 });
timingReroll.apply([{ op: 'adjust', ref: 'i1', days: 3 }], { source: 'decide', floor: 4, day: 1 });
assert.equal(timingReroll.list()[0].ripenDay, 9);
timingReroll.apply([{ op: 'adjust', ref: 'i1', days: -1 }], { source: 'decide', floor: 4, day: 1 });
assert.equal(timingReroll.list()[0].ripenDay, 5, '先撤回上一次调整（6），再按新正文改成 5');
assert.equal(timingReroll.list()[0].edited, true);

// 删除进档案、再从档案找回；库满时不硬塞。
const bin = createImpactRuntime({ now });
bin.apply([{ op: 'record', title: '药老醒了', detail: '戒指里传出声音', target: '纳戒' }], { source: 'manual', day: 1 });
assert.equal(bin.apply([{ op: 'forget', ref: 'i1' }], { source: 'manual', day: 2 }).status, 'applied');
assert.equal(bin.status().total, 0);
assert.equal(bin.status().archived, 1);
assert.equal(bin.archived()[0].archivedReason, 'deleted');
assert.equal(bin.apply([{ op: 'unarchive', ref: 'i1' }], { source: 'manual', day: 2 }).status, 'applied');
assert.equal(bin.status().total, 1);
assert.equal(bin.status().archived, 0);
assert.equal(bin.archived()[0]?.archivedReason ?? '', '', '找回来以后不再是“已删除”');
assert.equal(bin.apply([{ op: 'unarchive', ref: 'i9' }], { source: 'manual', day: 2 }).rejected[0].reason, 'archive_not_found');
assert.equal(bin.apply([{ op: 'forget', ref: 'i9' }], { source: 'manual', day: 2 }).rejected[0].reason, 'record_not_found');

const full = createImpactRuntime({ maxRecords: 1, now });
full.apply([{ op: 'record', title: '一', detail: 'd', target: 't' }], { source: 'manual', day: 1 });
full.apply([{ op: 'record', title: '二', detail: 'd', target: 'u' }], { source: 'manual', day: 2 });
assert.equal(full.archived().length, 1);
assert.equal(full.apply([{ op: 'unarchive', ref: full.archived()[0].id }], { source: 'manual', day: 2 }).rejected[0].reason, 'library_full');

// 与世界台账事件互链 + 换说法去重（时间窗内算同一件事，隔几天可以再记）。
const linked = createImpactRuntime({ now });
linked.apply([{ op: 'record', title: '加列家药材库起火', detail: 'd', target: '加列家族', canon: '药材生意', shift: 'accelerate', eventId: 'e2' }], { source: 'manual', day: 1 });
assert.equal(linked.list()[0].eventId, 'e2');
assert.equal(linked.apply([{ op: 'record', title: '加列家药材库烧了', detail: '换种说法再记一遍', target: '加列家族', canon: '药材生意', shift: 'accelerate' }], { source: 'manual', day: 2 }).rejected[0].reason, 'duplicate_similar');
assert.equal(linked.apply([{ op: 'record', title: '加列家药材库起火', detail: '隔了几天又出事', target: '加列家族', canon: '药材生意', shift: 'accelerate' }], { source: 'manual', day: 5 }).status, 'applied');
assert.equal(linked.apply([{ op: 'record', title: 'x'.repeat(61), detail: 'd', target: 't', eventId: 'e2' }], { source: 'manual', day: 9 }).rejected[0].reason, 'title_too_long');
assert.equal(linked.apply([{ op: 'record', title: 'y', detail: 'd', target: 't', eventId: 'e'.repeat(41) }], { source: 'manual', day: 9 }).rejected[0].reason, 'event_too_long');

// 删楼：被删楼上的账进档案，后面的楼层号整体前移，档案里的楼层也一起前移。
const floors = createImpactRuntime({ now });
floors.apply([
    { op: 'record', title: '第一楼的事', detail: 'd', target: 't', evidence: '第 5 楼' },
    { op: 'record', title: '第六楼的事', detail: 'd', target: 'u' },
], { source: 'manual', day: 1 });
floors.apply([{ op: 'record', title: '第七楼的事', detail: 'd', target: 'v' }], { source: 'decide', floor: 6, day: 1 });
floors.apply([{ op: 'record', title: '待删楼的事', detail: 'd', target: 'w' }], { source: 'decide', floor: 8, day: 1 });
assert.equal(floors.list().find(item => item.title === '待删楼的事').floor, 8);
const dropped = floors.dropFloor(8, { reason: '楼层已删' });
assert.equal(dropped.status, 'applied');
assert.equal(dropped.removed, 1);
assert.equal(floors.list().some(item => item.title === '待删楼的事'), false);
assert.equal(floors.archived()[0].archivedReason, '楼层已删');
// 更高楼层前移：原来第 9 楼（这里没有）与位于第 8 楼之后的不变；删第 8 楼只影响 >8 的。
assert.equal(floors.dropFloor(-1).reason, 'bad_floor');
assert.equal(floors.dropFloor(1.5).reason, 'bad_floor');

const shifting = createImpactRuntime({ now });
shifting.apply([{ op: 'record', title: '第八楼', detail: 'd', target: 'a' }], { source: 'decide', floor: 8, day: 1 });
shifting.apply([{ op: 'record', title: '第九楼', detail: 'd', target: 'b' }], { source: 'decide', floor: 9, day: 1 });
assert.equal(shifting.dropFloor(4).shifted, 2);
assert.equal(shifting.list().find(item => item.title === '第八楼').floor, 7);
assert.equal(shifting.list().find(item => item.title === '第九楼').floor, 8);

// 默认不限条数：连记 260 条也不淘汰。
const unlimited = createImpactRuntime({ now });
for (let index = 1; index <= 260; index++) {
    unlimited.apply([{ op: 'record', title: `第${index}条`, detail: 'd', target: `城${index}` }], { source: 'manual', day: 1 + Math.floor(index / 10) });
}
assert.equal(unlimited.status().total, 260);
assert.equal(unlimited.status().archived, 0);

console.log('impact runtime tests passed');
