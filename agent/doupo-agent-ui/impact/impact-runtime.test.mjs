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
// 内容不设上限（用户口径 2026-11-17）：41 字 target 照收
assert.equal(runtime.apply([{ op: 'record', title: 't', detail: 'd', target: 'x'.repeat(41) }], { day: 12 }).applied.length, 1);
assert.equal(runtime.snapshot().records.at(-1).target.length, 41, '超长 target 原样保留');
assert.equal(runtime.apply([{ op: 'record', title: 't', detail: 'd', target: 't', ripen: 0 }], { day: 12 }).rejected[0].reason, 'bad_ripen');
// 世界影响不再按日子推进：写了 ripen 也照收，但不会排期（用户口径 2026-11-25）。
{
    const scheduled = runtime.apply([{ op: 'record', title: 't366', detail: 'd366', target: 't366', ripen: 366 }], { day: 12 });
    assert.equal(scheduled.applied.length, 1, '天数不再有 365 帽，也不再被拒');
    assert.equal(scheduled.applied[0].record.ripenDay, null, '写明的日子也不排期了');
    assert.equal(scheduled.applied[0].record.state, 'active');
}
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
assert.equal(orphan.status, 'applied', '父编号抄错不该整条丢掉，影响本身是好的');
assert.equal(orphan.applied[0].record.parent, '', '接不上的父节点要去掉');
assert.equal(orphan.applied[0].record.depth, 0);
assert.match(orphan.applied[0].summary, /父影响 i99 不存在/, '摘要要说清为什么没接上');
const deep = runtime.apply([{ op: 'record', title: '第三代', detail: 'd', target: 't', parent: child.applied[0].record.id }], { day: 13, floor: 15 });
assert.equal(deep.rejected[0].reason, 'chain_too_deep');

// 埋下的因：写了因和条件就沉底等场面，再怎么走日子也不会自己翻牌（用户口径 2026-11-25）。
const delayed = runtime.apply([{ op: 'record', title: '萧炎收下旧护符', detail: '当时谁也没当回事', target: '萧炎', weight: 'major', seed: '玩家给萧炎的一枚旧护符', trigger: '萧炎被逼到绝境、无路可退' }], { day: 15, floor: 16 });
assert.equal(delayed.applied[0].record.state, 'sunk', '写了因和条件就沉底');
assert.equal(delayed.applied[0].record.ripenDay, null, '沉底的不排期');
assert.equal(runtime.status().sunk, 1);
assert.equal(runtime.status().due, 0);
assert.equal(runtime.pendingRipen(15).length, 1, '沉底的因都在这一份清单里');
assert.match(delayed.applied[0].summary, /埋下（因：玩家给萧炎的一枚旧护符｜等：萧炎被逼到绝境、无路可退）/, '摘要写清因与条件');
const swept = runtime.apply([], { day: 200 });
assert.deepEqual(swept.due, [], '走两百天也不会自己翻牌');
assert.equal(runtime.list().find(record => record.id === delayed.applied[0].record.id).state, 'sunk');
// 没写因和条件的老写法：它就摆在明面上，谁也不排它的期。
assert.equal(runtime.apply([{ op: 'record', title: '只有一样因', detail: 'd', target: 't', seed: '一枚旧护符' }], { day: 15 }).applied[0].record.state, 'active', '因与条件不成对就不沉底');

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

// 手动改写一条已经记下的影响：内容可改、状态不被顺手改掉。
const editing = createImpactRuntime({ now });
editing.apply([{ op: 'record', title: '加列家的药材库被烧', detail: '药价上涨', target: '加列家族', weight: 'major', canon: '药材生意', shift: 'alter' }], { source: 'manual', day: 2 });
const editResult = editing.apply([{ op: 'edit', ref: 'i1', title: '加列家的药材库一夜被烧', detail: '药价翻倍，加列家开始查人', weight: 'world' }], { source: 'manual', day: 2 });
assert.equal(editResult.status, 'applied');
const edited = editing.list()[0];
assert.equal(edited.title, '加列家的药材库一夜被烧');
assert.equal(edited.weight, 'world');
assert.equal(edited.state, 'active');
assert.equal(edited.shift, 'alter', '没传 shift 时保留原偏移');
// 补上因与条件：手改也能把一条明面上的账改回“埋着”。
editing.apply([{ op: 'edit', ref: 'i1', seed: '加列家烧掉的药材库', trigger: '加列家要找补回来' }], { source: 'manual', day: 2 });
assert.equal(editing.list()[0].state, 'sunk', '补上因与条件后沉底');
assert.equal(editing.apply([{ op: 'edit', ref: 'i1', state: 'active' }], { source: 'manual', day: 2 }).applied[0].record.state, 'active', '也能手动捞上来');
editing.apply([{ op: 'edit', ref: 'i1', ripen: null }], { source: 'manual', day: 2 });
assert.equal(editing.list()[0].ripenDay, null, '编辑里写 ripen 也不再排期');
assert.equal(editing.apply([{ op: 'edit', ref: 'i1', ripen: 5 }], { source: 'manual', day: 2 }).applied[0].record.ripenDay, null, '手填天数同样被忽略');
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

// 已经应验的影响，改错别字不会把自己改回“未了结”；应验那天与撞上的场面都留着。
const ripenedEdit = createImpactRuntime({ now });
ripenedEdit.apply([{ op: 'record', title: '萧炎收下旧护符', detail: '当时谁也没当回事', target: '萧炎', seed: '玩家给萧炎的一枚旧护符', trigger: '萧炎被逼到绝境' }], { source: 'manual', day: 1 });
ripenedEdit.apply([{ op: 'ripen', ref: 'i1', detail: '护符挡下致命一击', hit: '他掏出那枚旧护符挡了一记' }], { source: 'manual', day: 5 });
assert.equal(ripenedEdit.list()[0].state, 'ripened');
assert.equal(ripenedEdit.list()[0].hit, '他掏出那枚旧护符挡了一记', '撞上的场面要落库');
ripenedEdit.apply([{ op: 'edit', ref: 'i1', title: '萧炎留着那枚旧护符' }], { source: 'manual', day: 5 });
assert.equal(ripenedEdit.list()[0].state, 'ripened', '改错别字不会把已应验的改回未了结');
assert.equal(ripenedEdit.list()[0].title, '萧炎留着那枚旧护符');
assert.equal(ripenedEdit.list()[0].ripenedDay, 5, '应验日仍是当初应验的那天');
assert.equal(ripenedEdit.list()[0].hit, '他掏出那枚旧护符挡了一记');

// 沉下去 / 捞上来：负数沉底（世人不再谈，等场面），正数或省略捞上来摆回明面。
const timing = createImpactRuntime({ now });
timing.apply([{ op: 'record', title: '云岚宗的人下山', detail: '长老派弟子来查青灵丹', target: '云岚宗' }], { source: 'manual', day: 2 });
assert.equal(timing.list()[0].state, 'active');
assert.equal(timing.apply([{ op: 'adjust', ref: 'i1', days: -1 }], { source: 'manual', day: 2 }).status, 'applied');
assert.equal(timing.list()[0].state, 'sunk', '负数把它沉下去');
assert.equal(timing.list()[0].edited, true, '沉浮也算改过的账');
assert.equal(timing.status().edited, 1);
assert.equal(timing.apply([{ op: 'adjust', ref: 'i1', days: 1 }], { source: 'manual', day: 3 }).applied[0].record.state, 'active', '正数把它捞上来');
assert.equal(timing.apply([{ op: 'adjust', ref: 'i1', state: 'sunk' }], { source: 'manual', day: 3 }).applied[0].record.state, 'sunk', '也可以直接点名要沉底');
assert.equal(timing.apply([{ op: 'adjust', ref: 'i9', days: 1 }], { source: 'manual', day: 4 }).rejected[0].reason, 'record_not_found');

// 同楼重 roll 必须把 adjust 改过的沉浮一起撤回。
const timingReroll = createImpactRuntime({ now });
timingReroll.apply([{ op: 'record', title: '原样', detail: 'd', target: 't' }], { source: 'decide', floor: 2, day: 1 });
timingReroll.apply([{ op: 'adjust', ref: 'i1', days: -1 }], { source: 'decide', floor: 4, day: 1 });
assert.equal(timingReroll.list()[0].state, 'sunk');
timingReroll.apply([{ op: 'adjust', ref: 'i1', days: 1 }], { source: 'decide', floor: 4, day: 1 });
assert.equal(timingReroll.list()[0].state, 'active', '先撤回上一次沉底，再按新正文捞上来');
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
assert.equal(linked.apply([{ op: 'record', title: 'x'.repeat(61), detail: 'd', target: 't', eventId: 'e2' }], { source: 'manual', day: 9 }).applied.length, 1, '长标题照收');
assert.equal(linked.apply([{ op: 'record', title: 'y', detail: 'd', target: 't', eventId: 'e'.repeat(41) }], { source: 'manual', day: 9 }).applied.length, 1, '长事件编号照收');

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

// OPT-028: active and archived records share one stable ID namespace.
for (const keepActive of [false, true]) {
    const r = createImpactRuntime({ now });
    r.apply([{ op: 'record', title: '旧账', detail: 'd', target: '旧城' }], { source: 'manual' });
    r.apply([{ op: 'forget', ref: 'i1' }], { source: 'manual' });
    if (keepActive) r.apply([{ op: 'record', title: '留存', detail: 'd', target: '别城' }], { source: 'manual' });
    for (let pass = 0; pass < 2; pass++) {
        r.restore(r.snapshot());
        r.apply([{ op: 'record', title: `续账${pass}`, detail: 'd', target: `城${pass}` }], { source: 'manual' });
    }
    assert.equal(r.apply([{ op: 'unarchive', ref: 'i1' }], { source: 'manual' }).status, 'applied');
    assert.equal(new Set(r.list().map(row => row.id)).size, r.list().length);
    assert.equal(r.list().find(row => row.id === 'i1').title, '旧账');
    r.apply([{ op: 'record', title: '下游', detail: 'd', target: '新城', parent: 'i1' }], { source: 'manual' });
    assert.equal(r.list().find(row => row.title === '下游').parent, 'i1');
    const before = r.snapshot();
    const collision = { ...before, archive: [{ ...before.records[0], title: '冲突旧档' }] };
    assert.equal(r.restore(collision).reason, 'duplicate_id');
    assert.deepEqual(r.snapshot(), before, 'ambiguous old saves must reject without renumbering references');
}

// OPT-069: the same optional opId replaces one floor but remains deduplicated across floors.
{
    const r = createImpactRuntime({ now });
    const op = { op: 'record', title: '旧版本', detail: 'd', target: 't', opId: 'stable' };
    r.apply([op], { floor: 3 });
    assert.equal(r.apply([op], { floor: 3 }).status, 'applied');
    assert.equal(r.list().length, 1);
    r.apply([{ ...op, title: '新版本' }], { floor: 3 });
    assert.equal(r.list()[0].title, '新版本');
    assert.deepEqual(r.apply([op], { floor: 4 }).duplicate, ['stable']);
    assert.equal(r.list().length, 1);
}

// OPT-070 的替代口径（2026-11-25）：账本不再有“到期自动应验”，所以归档找回只需要原样还原，
// 日子怎么走都不会自己翻牌。这里守的是“找回来不会被错标成已应验”。
{
    const r = createImpactRuntime({ now });
    r.apply([{ op: 'record', title: '归档回来的旧账', detail: 'd', target: 't', seed: '一枚旧护符', trigger: '走投无路' }], { source: 'manual', day: 1 });
    r.apply([{ op: 'forget', ref: 'i1' }], { source: 'manual', day: 1 });
    r.apply([], { source: 'manual', day: 5 });
    assert.deepEqual(r.apply([{ op: 'unarchive', ref: 'i1' }], { source: 'manual', day: 5 }).due, [], '找回来不会因为日子到了就当场应验');
    assert.equal(r.list()[0].state, 'sunk', '埋着的因找回来还是埋着');
    const saved = r.snapshot();
    assert.equal(r.restore(saved).ripened, 0, 'restore 不会因为过期把埋着的因翻成已应验');
    assert.deepEqual(r.apply([], { source: 'manual', day: 5 }).due, []);
    assert.equal(r.list()[0].state, 'sunk');
}

// 旧档迁移：老记录上挂着的 ripenDay 一律降级成“埋着”，不排期、不再自己翻牌。
{
    const r = createImpactRuntime({ now });
    r.restore({
        day: 3,
        records: [{
            id: 'i1', day: 3, floor: 1, title: '老档里的定时炸弹', detail: 'd', target: 't',
            kind: 'butterfly', weight: 'major', certainty: 'certain', state: 'active', ripenDay: 4, latent: true,
        }],
    });
    const row = r.list()[0];
    assert.equal(row.state, 'sunk', '挂着的发酵日被降级成埋着');
    assert.equal(row.ripenDay, null, '日子清掉');
    assert.equal(row.latent, false, '暗排标记一并清掉');
    assert.deepEqual(r.apply([], { day: 99 }).due, [], '走多久都不会自己翻牌');
    assert.equal(r.status().due, 0);
}

// —— 手改序号：manual apply 才递增，模型落账/noop 不动；重roll复用签名靠它区分“谁改了账本”。 ——
{
    const r = createImpactRuntime({ now });
    assert.equal(r.manualVersion(), 0, '初始手改序号为 0');
    r.apply([{ op: 'record', ...auction }], { day: 1, floor: 0, source: 'decide' });
    assert.equal(r.manualVersion(), 0, '模型落账不计手改');
    r.apply([{ op: 'edit', ref: 'i1', title: '手改标题' }], { source: 'manual', day: 1 });
    assert.equal(r.manualVersion(), 1, '手改递增');
    assert.equal(r.apply([], { source: 'manual', day: 1 }).status, 'noop');
    assert.equal(r.manualVersion(), 1, 'noop 不递增');
    r.apply([{ op: 'record', title: '第二条', detail: 'x'.repeat(10), evidence: '第 2 楼' }], { day: 2, floor: 1, source: 'reply' });
    assert.equal(r.manualVersion(), 1, 'reply 落账也不计手改');
    const restored = createImpactRuntime({ now });
    restored.restore(r.snapshot());
    assert.equal(restored.manualVersion(), 1, '存档往返保留手改序号');
    restored.reset();
    assert.equal(restored.manualVersion(), 0, 'reset 归零');
}

// 传闻化：同一条影响能在“确凿/传闻”之间来回换，改过要标黄，快照能还原
const rumorRuntime = createImpactRuntime();
const rumorRec = rumorRuntime.apply([{ op: 'record', title: '药价翻倍', detail: '加列家囤药', target: '乌坦城', kind: 'direct', weight: 'minor' }], { source: 'manual', day: 3 }).applied[0].record;
assert.equal(rumorRec.certainty, 'certain');
const toRumor = rumorRuntime.apply([{ op: 'rumorize', ref: rumorRec.id }], { source: 'manual', day: 4 });
assert.equal(toRumor.status, 'applied');
assert.equal(toRumor.applied[0].record.certainty, 'rumor');
assert.equal(toRumor.applied[0].record.edited, true, '手改过的要标黄');
assert.equal(toRumor.applied[0].record.editedDay, 4);
const backToCertain = rumorRuntime.apply([{ op: 'rumorize', ref: rumorRec.id, certainty: 'certain' }], { source: 'manual', day: 5 });
assert.equal(backToCertain.applied[0].record.certainty, 'certain');
const unchanged = rumorRuntime.apply([{ op: 'rumorize', ref: rumorRec.id, certainty: 'certain' }], { source: 'manual', day: 5 });
assert.equal(unchanged.status, 'rejected', '没变化就不写账');
assert.equal(unchanged.rejected[0].reason, 'certainty_unchanged');
const unknownRef = rumorRuntime.apply([{ op: 'rumorize', ref: 'i99' }], { source: 'manual', day: 5 });
assert.equal(unknownRef.status, 'rejected');
assert.equal(unknownRef.rejected[0].reason, 'record_not_found');

console.log('impact runtime tests passed');

// —— 刷新后重 roll：重放基线跟着存档回来，恢复后仍能撤销上一版 ——
{
    const r = createImpactRuntime({ now });
    r.apply([{ op: 'record', title: '刷新前影响', detail: '旧后果', target: '乌坦城' }], { source: 'decide', floor: 6, day: 1 });
    const saved = r.snapshotWithReplay();
    assert.equal(saved._runtime.version, 1, '存档要带上重放基线');
    assert.equal(saved._runtime.lastFloor.floor, 6);

    const back = createImpactRuntime({ now });
    back.restore(JSON.parse(JSON.stringify(saved)));
    assert.equal(back.snapshot().records.some(record => record.title === '刷新前影响'), true, '刷新后业务状态照旧');
    back.apply([{ op: 'record', title: '刷新后影响', detail: '新后果', target: '乌坦城' }], { source: 'decide', floor: 6, day: 1 });
    const snap = back.snapshot();
    assert.equal(snap.records.some(record => record.title === '刷新前影响'), false, '刷新后同楼重 roll 要撤销旧影响');
    assert.equal(snap.records.some(record => record.title === '刷新后影响'), true, '新正文的影响生效');

    // 旧档没有 _runtime：照旧恢复、只是不能撤销
    const legacy = createImpactRuntime({ now });
    legacy.restore(r.snapshot());
    legacy.apply([{ op: 'record', title: '再来一条', detail: '又一条', target: '乌坦城' }], { source: 'decide', floor: 6, day: 1 });
    assert.equal(legacy.snapshot().records.some(record => record.title === '刷新前影响'), true, '旧档没有基线就不撤销');
}

// —— 埋线不再按分量排期：没写因与条件的涟漪/蝴蝶就摆在明面上，写了的才沉底 ——
{
    const r = createImpactRuntime({ now, autoLatent: true });
    const latent = r.apply([{
        op: 'record', title: '药材一日三涨', detail: '加列家开始囤药，城里药铺跟着抬价', target: '乌坦城', kind: 'ripple', weight: 'major',
        links: [{ type: 'faction', name: '加列家族' }, { type: 'bogus', name: '乱写' }, { type: 'place', name: '乌坦城' }],
        effects: [{ type: 'info', field: 'reputation', value: '加列家压价囤药' }, { type: 'faction', name: '加列家族', stance: 'wary', dynamics: '收紧药材' }],
    }], { source: 'decide', floor: 12, day: 10 }).applied[0].record;
    assert.equal(latent.latent, false, '开关还在也不会自动排潜伏期了');
    assert.equal(latent.ripenDay, null, '分量不再决定天数');
    assert.equal(latent.state, 'active', '没写因与条件就摆在明面上');
    assert.deepEqual(latent.links, [{ type: 'faction', name: '加列家族' }, { type: 'place', name: '乌坦城' }], '未知牵涉类型被清掉');
    assert.equal(latent.effects.length, 2);
    assert.equal(latent.effects[0].field, 'reputation');
    assert.equal(latent.materialized, false);
    assert.equal(latent.outcomeEventId, '');

    const direct = r.apply([{ op: 'record', title: '当场砸了招牌', detail: '萧炎动手', target: '加列家族', kind: 'direct' }], { source: 'manual', day: 10 }).applied[0].record;
    assert.equal(direct.ripenDay, null, 'direct 不排期');
    assert.equal(direct.latent, false);

    const noAuto = createImpactRuntime({ now });
    const manualLatent = noAuto.apply([{ op: 'record', title: '坊间传闻', detail: 'd', target: 't', kind: 'butterfly', weight: 'world' }], { source: 'manual', day: 5 }).applied[0].record;
    assert.equal(manualLatent.ripenDay, null, '开关关闭时也不排期');

    // 走多少天都不会自己翻牌；只有判定官撞上场面、落了 ripen 才算应验。
    r.apply([], { source: 'manual', day: 60 });
    assert.equal(r.list().find(record => record.id === latent.id).state, 'active', '日子到了也不会自动应验');
    assert.equal(r.apply([{ op: 'ripen', ref: latent.id, detail: '药价终于压不住了', hit: '有人在药铺门口吵起来' }], { source: 'reply', day: 60 }).status, 'applied');
    const done = r.apply([{ op: 'materialize', ref: latent.id, eventId: 'e7', detail: '加列家开始囤药' }], { source: 'reply', day: 60 });
    assert.equal(done.status, 'applied');
    const after = r.list().find(record => record.id === latent.id);
    assert.equal(after.materialized, true, '应验后打上标记');
    assert.equal(after.outcomeEventId, 'e7');
    assert.equal(after.resolution, '加列家开始囤药');
    assert.equal(after.hit, '有人在药铺门口吵起来', '撞上的场面留在账上');
    assert.equal(r.apply([{ op: 'materialize', ref: latent.id, eventId: 'e8' }], { day: 21 }).rejected[0].reason, 'already_materialized');
    assert.equal(r.apply([{ op: 'materialize', ref: direct.id, eventId: 'e9' }], { day: 21 }).rejected[0].reason, 'record_not_ripened');

    const saved = r.snapshot();
    const back = createImpactRuntime({ now });
    back.restore(saved);
    const restoredRecord = back.list().find(record => record.id === latent.id);
    assert.equal(restoredRecord.materialized, true);
    assert.equal(restoredRecord.materializedDay, 60);
    assert.equal(restoredRecord.outcomeEventId, 'e7');

    // 手动改写牵涉/后果；清空即取消。
    back.apply([{ op: 'edit', ref: direct.id, links: [{ type: 'person', name: '萧炎' }], effects: [] }], { source: 'manual', day: 21 });
    assert.deepEqual(back.list().find(record => record.id === direct.id).links, [{ type: 'person', name: '萧炎' }]);

    // 上限：牵涉最多 6 条、后果最多 3 条。
    const capped = back.apply([{ op: 'record', title: '一大串牵涉', detail: 'd', target: 't', kind: 'direct', links: Array.from({ length: 8 }, (_, index) => ({ type: 'person', name: `人${index}` })), effects: [{ type: 'info', field: 'wanted', value: '通缉' }, { type: 'info', field: 'reputation', value: '名声' }, { type: 'faction', name: 'a', stance: 'wary' }, { type: 'faction', name: 'b', stance: 'hostile' }] }], { source: 'manual', day: 21 }).applied[0].record;
    assert.equal(capped.links.length, 6);
    assert.equal(capped.effects.length, 3);
}

// 回响（echoes）：落成后这条影响在世界上留下的痕迹，跟着影响一起存、一起读回来。
{
    const r = createImpactRuntime({ now });
    const id = r.apply([{ op: 'record', title: '货栈三株药材', detail: '掌柜不敢卖', target: '乌坦城', kind: 'direct' }], { source: 'manual', day: 10 }).applied[0].record.id;
    r.apply([{ op: 'ripen', ref: id }], { source: 'reply', day: 10 });
    const echoes = [
        { kind: 'thread', id: 'f2', title: '货栈三株药材', day: 10, note: '线索因世界影响推进 f2：到期第 26 天 → 25 天' },
        { kind: 'npc', id: '萧炎', title: '萧炎', day: 10 },
        { kind: 'not-a-kind', id: 'x1', title: '乱写的类型' },
        { kind: 'npc', id: '萧炎', title: '重复的人' },
    ];
    r.apply([{ op: 'materialize', ref: id, eventId: 'e7', detail: '药材到了萧炎手里', echoes }], { source: 'reply', day: 10 });
    const stored = r.list().find(record => record.id === id).echoes;
    assert.equal(stored.length, 3, '未知类型折成 event，同 kind+id 去重');
    assert.equal(stored[0].kind, 'thread');
    assert.equal(stored[1].kind, 'npc');
    assert.equal(stored[1].title, '萧炎', '重复的人只留第一条');
    assert.equal(stored[2].kind, 'event');
    assert.equal(stored[0].note, '线索因世界影响推进 f2：到期第 26 天 → 25 天');
    // 空 note 不写这个键，避免存档里出现一堆空字符串。
    assert.equal('note' in stored[1], false);
    // 存档往返必须带着回响，否则刷新一次就看不见“它把世界改成了什么样”。
    const saved = r.snapshot();
    const back = createImpactRuntime({ now });
    back.restore(saved);
    assert.equal(back.list().find(record => record.id === id).echoes.length, 3, '读档后回响还在');
    // 退回待落成：上次落成的痕迹必须摘掉，否则“还没落成”却挂着世界后果，自相矛盾。
    back.apply([{ op: 'unmaterialize', ref: id }], { source: 'manual', day: 11 });
    assert.equal(back.list().find(record => record.id === id).echoes, undefined, '退回后不留旧回响');
    // 但撤销这一步本身要能还原回响（同楼重 roll 靠它）。
    const undo = back.snapshotWithReplay();
    assert.ok(undo, '快照可回放');
}

// 一条影响本来就没有回响：materialize 之后不能凭空多出 echoes 键。
{
    const r = createImpactRuntime({ now });
    const id = r.apply([{ op: 'record', title: '没有回响的一条', detail: 'd', target: 't', kind: 'direct' }], { source: 'manual', day: 1 }).applied[0].record.id;
    r.apply([{ op: 'ripen', ref: id }], { source: 'reply', day: 1 });
    r.apply([{ op: 'materialize', ref: id, eventId: 'e1' }], { source: 'reply', day: 1 });
    assert.equal(r.list().find(record => record.id === id).echoes, undefined, '没痕迹就不写这个键');
}

// 动玩家身家的后果（self）：金币/行囊/境界，三种都在清洗时钳死幅度、逼着写理由。
{
    const r = createImpactRuntime({ now });
    const one = r.apply([{
        op: 'record',
        title: '救了萧炎一命',
        detail: '死巷里把他捞出来',
        target: '萧炎',
        kind: 'direct',
        effects: [
            { type: 'self', field: 'gold', amount: 120, note: '萧战给的谢礼' },
            { type: 'self', field: 'item', name: '玄铁片', count: 2, note: '货栈里捡的' },
            { type: 'self', field: 'realm', realm: '斗师', stage: '三星', note: '被逼当众突破' },
        ],
    }], { source: 'manual', day: 16 }).applied[0].record;
    assert.equal(one.effects.length, 3, '三种身家后果各留一条');
    assert.equal(one.effects[0].field, 'gold');
    assert.equal(one.effects[0].amount, 120);
    assert.equal(one.effects[1].name, '玄铁片');
    assert.equal(one.effects[1].count, 2);
    assert.equal(one.effects[2].realm, '斗师');
    assert.equal(one.effects[2].stage, '三星');

    // 越界钳边：金币 +9999 → +500；物品 -500 件 → -99；零金额、无理由、无名、乱字段一律丢。
    const two = r.apply([{
        op: 'record',
        title: '第二次写后果',
        detail: 'd',
        target: 't',
        kind: 'direct',
        effects: [
            { type: 'self', field: 'gold', amount: 9999, note: '超上限' },
            { type: 'self', field: 'item', name: '三株药材', count: -500, note: '被抢了' },
        ],
    }], { source: 'manual', day: 17 }).applied[0].record;
    assert.equal(two.effects[0].amount, 500, '金币钳到 +500');
    assert.equal(two.effects[1].count, -99, '物品数量钳到 -99');

    const three = r.apply([{
        op: 'record',
        title: '第三次写后果',
        detail: 'd',
        target: 't2',
        kind: 'direct',
        effects: [
            { type: 'self', field: 'gold', amount: 0, note: '零不算改动' },
            { type: 'self', field: 'gold', amount: 50 },
            { type: 'self', field: 'item', count: 1, note: '没名字' },
            { type: 'self', field: 'realm', note: '没说改到哪个境界' },
            { type: 'self', field: 'unknown', note: '乱写的字段' },
        ],
    }], { source: 'manual', day: 18 }).applied[0].record;
    assert.equal(three.effects.length, 0, '非法项全丢，不留空壳');
}

// 存档往返：self 后果跟着影响一起存下来，读回来还能落账。
{
    const r = createImpactRuntime({ now });
    const id = r.apply([{
        op: 'record',
        title: '带身家后果的一条',
        detail: 'd',
        target: 't',
        kind: 'direct',
        effects: [{ type: 'self', field: 'realm', realm: '斗师', stage: '三星', note: '被逼突破' }],
    }], { source: 'manual', day: 3 }).applied[0].record.id;
    const back = createImpactRuntime({ now });
    back.restore(r.snapshot());
    const loaded = back.list().find(record => record.id === id);
    assert.equal(loaded.effects.length, 1);
    assert.equal(loaded.effects[0].realm, '斗师');
    assert.equal(loaded.effects[0].stage, '三星');
    assert.equal(loaded.effects[0].note, '被逼突破');
}


// 原著偏移拆四段：节点 / 怎么改 / 改成了什么 / 凭什么。
{
    const r = createImpactRuntime({ now });
    const one = r.apply([{
        op: 'record',
        title: '当众拿出密信',
        detail: '退婚的事被提前挑明',
        target: '乌坦城萧家',
        kind: 'butterfly',
        canon: '三年之约',
        shift: 'accelerate',
        canonWhat: '退婚从三年后提前到今年年尾',
        canonBasis: '玩家在第 18 楼把纳兰家的信拍在桌上',
    }], { source: 'manual', day: 18 }).applied[0].record;
    assert.equal(one.canon, '三年之约', '节点名单独一栏');
    assert.equal(one.shift, 'accelerate');
    assert.equal(one.canonWhat, '退婚从三年后提前到今年年尾');
    assert.equal(one.canonBasis, '玩家在第 18 楼把纳兰家的信拍在桌上');

    // 旧档兼容：canon 里塞着“节点｜shift｜改成了什么”一整串，读进来要拆开。
    const legacy = { id: 'i3', day: 6, title: '旧写法的一条', detail: 'd', target: 't', canon: '三年之约｜accelerate｜退婚提前了', shift: 'none' };
    const back = createImpactRuntime({ now });
    back.restore({ records: [legacy], day: 6 });
    const loaded = back.list().find(record => record.id === 'i3');
    assert.equal(loaded.canon, '三年之约');
    assert.equal(loaded.shift, 'accelerate', '旧串里的 shift 要认出来');
    assert.equal(loaded.canonWhat, '退婚提前了', '旧串里的第三段落到 canonWhat');

    // 没牵动节点：shift 归 none，另外两栏不留噪音。
    const none = r.apply([{
        op: 'record', title: '没碰原著的一条', detail: 'd', target: 't', kind: 'direct', shift: 'alter', canonWhat: '写了也不算', canonBasis: '同理',
    }], { source: 'manual', day: 19 }).applied[0].record;
    assert.equal(none.canon, '');
    assert.equal(none.shift, 'none', '没有 canon 就不许挂偏移');
    assert.equal(none.canonWhat, '');
    assert.equal(none.canonBasis, '');

    // 手改也拆：edit 传一整串，落成四段。
    const r2 = createImpactRuntime({ now });
    const id = r2.apply([{ op: 'record', title: '要手改的一条', detail: 'd', target: 't', kind: 'direct' }], { source: 'manual', day: 2 }).applied[0].record.id;
    r2.apply([{ op: 'edit', ref: id, canon: '云岚宗之战｜avoid｜玩家没有去赴约' }], { source: 'manual', day: 3 });
    const edited = r2.list().find(record => record.id === id);
    assert.equal(edited.canon, '云岚宗之战');
    assert.equal(edited.shift, 'avoid');
    assert.equal(edited.canonWhat, '玩家没有去赴约');
}

console.log('impact runtime canon split tests passed');

console.log('impact runtime self effect tests passed');

// —— 同楼重 roll 双倍落账的根治：已落成的影响不随撤销删除 ——
// 已落成记录的后果散在世界/人物簿/纳戒的账本里（好感金币没有幂等闸）；
// 记录一删，duplicate 防重闸就认不出“这件事已经落过账”，重记一条会再落一次。
{
    const rt = createImpactRuntime({ now });
    rt.apply([{ op: 'record', title: '当街救下萧炎', detail: '玩家在死巷里把萧炎捞了出来', target: '萧炎', kind: 'butterfly', weight: 'major' }], { source: 'decide', floor: 5, day: 8 });
    const rid = rt.list({})[0].id;
    rt.apply([{ op: 'ripen', ref: rid, hit: '死巷救人' }], { source: 'reply', day: 8 });
    rt.apply([{ op: 'materialize', ref: rid, detail: '已落成世界事件 e2', eventId: 'e2' }], { source: 'reply', day: 8 });
    assert.equal(rt.list({})[0].materialized, true);

    const reroll = rt.apply([{ op: 'record', title: '当街救下萧炎', detail: '玩家在死巷里把萧炎捞了出来', target: '萧炎', kind: 'butterfly', weight: 'major' }], { source: 'decide', floor: 5, day: 8 });
    const kept = rt.list({}).find(record => record.id === rid);
    assert.ok(kept, '已落成的影响不随同楼重 roll 删除');
    assert.equal(kept.materialized, true, '落成标记原样保留');
    assert.equal(kept.outcomeEventId, 'e2', '事件号保留，/impact forget 还能连事件一起撤');
    assert.ok(reroll.rejected.some(item => item.reason === 'duplicate_record'), '重记同一条被防重闸挡住，不再落第二遍账');

    // 没落成过的记录照旧可撤：这是重 roll 的正常语义——旧版撤掉、新版重记（新编号）。
    const rt2 = createImpactRuntime({ now });
    rt2.apply([{ op: 'record', title: '只是记了一笔', detail: '还没落成', target: '某地', kind: 'direct' }], { source: 'decide', floor: 2, day: 3 });
    const rid2 = rt2.list({})[0].id;
    rt2.apply([{ op: 'record', title: '只是记了一笔', detail: '还没落成', target: '某地', kind: 'direct' }], { source: 'decide', floor: 2, day: 3 });
    const after = rt2.list({});
    assert.equal(after.length, 1, '未落成的记录随同楼重 roll 撤销后由新版重记');
    assert.ok(!after.some(record => record.id === rid2), '旧编号已撤，不会带着旧状态复活');
}

// —— 旧档排期迁移不再产出僵尸埋线：沉底时合成 seed/trigger，保住“能被场面认领”的资格 ——
{
    const rt = createImpactRuntime({ now });
    rt.restore({ records: [{ id: 'i9', day: 4, title: '一枚旧护符', detail: '玩家把护符留在了当铺柜台', target: '乌坦城当铺', kind: 'butterfly', weight: 'minor', state: 'active', ripenDay: 6, seed: '', trigger: '' }], day: 4 });
    rt.apply([], { day: 4 });
    const sunk = rt.list({}).find(record => record.id === 'i9');
    assert.ok(sunk, '迁移不丢账');
    assert.equal(sunk.state, 'sunk', '旧排期记录就地沉底');
    assert.equal(sunk.seed, '一枚旧护符', '缺因时用标题合成');
    assert.equal(sunk.trigger, '玩家把护符留在了当铺柜台', '缺场面时用描述合成');
    assert.equal(sunk.ripenDay, null, '排期标记清掉');
}

console.log('impact runtime reroll-keep and legacy sweep tests passed');

// —— 后果补丁的处境键：剧变（被囚/重伤/突破/死亡）直接改人的现状 ——
{
    const rt = createImpactRuntime({ now });
    rt.apply([{
        op: 'record', title: '云岚宗掳走萧战', detail: '萧战被押往云岚宗', target: '萧战', kind: 'direct', weight: 'major',
        effects: [{ type: 'npc', name: '萧战', favor: -5, attitude: '家人忧惧', injury: '被押走时受了内伤', location: '云岚宗监狱', presence: '不在场', doing: '被囚禁', note: '被掳' }],
    }], { source: 'manual', day: 6 });
    const effects = rt.list({})[0].effects;
    assert.equal(effects.length, 1);
    assert.equal(effects[0].injury, '被押走时受了内伤', '伤势键照收');
    assert.equal(effects[0].presence, '不在场', '在场键只认两个枚举值');
    assert.equal(effects[0].doing, '被囚禁');
    assert.equal(effects[0].location, '云岚宗监狱');
    // 纯看法照旧收；什么实际变动都没有的后果整条丢。
    const dropped = createImpactRuntime({ now });
    dropped.apply([{ op: 'record', title: '空后果一条', detail: 'd', target: 't', effects: [{ type: 'npc', name: '萧炎', favor: 0, note: '其实什么都没变' }] }], { source: 'manual', day: 1 });
    assert.equal(dropped.list({})[0].effects.length, 0, '没有任何实际变动的 npc 后果不落账');
}

// —— 势力剧变在后果层收好形：覆灭/新建都带标记，note 可空 ——
{
    const rt = createImpactRuntime({ now });
    rt.apply([{
        op: 'record', title: '加列家被萧家吞并', detail: '乌坦城势力洗牌', target: '乌坦城', kind: 'direct', weight: 'major',
        effects: [
            { type: 'faction', name: '加列家族', dissolved: true, note: '被吞并' },
            { type: 'faction', name: '乌坦城商会', founded: true, stance: 'friendly', dynamics: '新贵入场', note: '新出现' },
        ],
    }], { source: 'manual', day: 7 });
    const effects = rt.list({})[0].effects;
    assert.equal(effects[0].dissolved, true);
    assert.equal(effects[1].founded, true);
    assert.equal(effects[1].stance, 'friendly');
}

console.log('impact runtime npc situation and faction drama tests passed');
