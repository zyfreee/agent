import assert from 'node:assert/strict';
import { createWorldRuntime, deriveEventTitle, eventIntro, formatClock } from '../world/world-runtime.js';

// —— 基础时钟 ——
assert.equal(formatClock({ day: 1, minute: 480 }), '第 1 天 08:00');
assert.equal(formatClock({ day: 12, minute: 0 }), '第 12 天 00:00');
assert.equal(formatClock({}), '第 1 天 00:00');

const runtime = createWorldRuntime({ now: () => 't0' });

// —— advance：分钟进位到天 ——
let result = runtime.apply([{ op: 'advance', minutes: 90 }], { source: 'llm' });
assert.equal(result.status, 'applied');
assert.equal(result.applied[0].summary.includes('09:30'), true, result.applied[0].summary);
result = runtime.apply([{ op: 'advance', days: 2, minutes: 1000 }]);
assert.equal(runtime.status().clock.day, 4);
assert.equal(runtime.status().clock.minute, 130); // 480+90=570；570+1000=1570 → 第 1+1+2=4 天 02:10
// 精确重算：480+90=570；570+1000=1570 → +1 天 130 分，第 1+1+2=4 天 02:10
assert.equal(formatClock(runtime.snapshot().clock), '第 4 天 02:10');

// —— 越界与坏参数只拒绝不炸 ——
result = runtime.apply([{ op: 'advance', days: 400 }, { op: 'advance' }, { op: 'nope' }, 'garbage']);
assert.equal(result.status, 'rejected');
assert.deepEqual(result.rejected.map(item => item.reason), ['bad_days', 'advance_empty', 'unknown_op', 'bad_op_shape']);
assert.equal(runtime.status().clock.day, 4, '被拒绝的操作不能改动时钟');

// —— addEvent 双域 + resolveEvent + pinEvent ——
result = runtime.apply([
    { op: 'addEvent', scope: 'near', title: '城东连环失窃', text: '城东连着三家铺子夜里失窃', basis: '最近几楼提到的失窃传闻' },
    { op: 'addEvent', scope: 'world', title: '炼药师大会提前', text: '皇室宣布炼药师大会提前', weight: 'major' },
]);
assert.equal(result.status, 'applied');
assert.equal(result.applied[0].summary.includes('依据：最近几楼提到的失窃传闻'), true, result.applied[0].summary);
assert.equal(result.applied[1].summary.includes('依据：'), false, '没有依据就不写');
const snap1 = runtime.snapshot();
assert.equal(snap1.nearEvents.length, 1);
assert.equal(snap1.nearEvents[0].basis, '最近几楼提到的失窃传闻');
assert.equal(snap1.worldEvents[0].basis, '');
assert.equal(snap1.worldEvents[0].weight, 'major');
const nearId = snap1.nearEvents[0].id;
const worldId = snap1.worldEvents[0].id;
result = runtime.apply([{ op: 'resolveEvent', id: nearId }, { op: 'pinEvent', id: worldId, pinned: true }]);
assert.equal(result.applied.length, 2);
assert.equal(runtime.snapshot().nearEvents[0].done, true);
assert.equal(runtime.snapshot().worldEvents[0].pinned, true);
assert.equal(runtime.status().near, 0, '已了结事件不再计入未了结数');

// —— setInfo 与 setClock ——
result = runtime.apply([{ op: 'setInfo', field: 'weather', text: '晴' }, { op: 'setInfo', field: 'nope', text: 'x' }, { op: 'setClock', day: 10, minute: 600, label: '三年之约倒计时' }]);
assert.equal(result.applied.length, 2);
assert.equal(result.rejected[0].reason, 'bad_field');
assert.equal(runtime.status().info.weather, '晴');
assert.equal(runtime.status().clock.day, 10);
assert.equal(runtime.status().clock.label, '三年之约倒计时');

// —— 传闻档与名声/通缉字段 ——
result = runtime.apply([
    { op: 'addEvent', scope: 'near', title: '酒馆异火传闻', text: '酒馆传闻：有人在收异火消息', weight: 'rumor' },
    { op: 'addEvent', scope: 'near', title: '坏档位', text: '坏档位', weight: 'secret' },
    { op: 'setInfo', field: 'reputation', text: '乌坦城小有名气' },
    { op: 'setInfo', field: 'wanted', text: '被米特尔家族记恨' },
]);
assert.equal(result.applied.length, 4, '不认识的档位静默归一，不整条拒绝');
const rumorEvent = runtime.snapshot().nearEvents.find(event => event.text.startsWith('酒馆传闻'));
const normalizedEvent = runtime.snapshot().nearEvents.find(event => event.text === '坏档位');
assert.equal(rumorEvent.weight, 'rumor', '传闻档位要保留');
assert.equal(normalizedEvent.weight, 'minor', '未知档位归一为普通');
assert.equal(runtime.status().info.reputation, '乌坦城小有名气');
assert.equal(runtime.status().info.wanted, '被米特尔家族记恨');

// —— 任务：立/完成/删除/更新，全链路 ——
result = runtime.apply([
    { op: 'addTask', title: '查出城东窃贼的来历', detail: '连日失窃，掌柜悬赏；已知窃贼夜行、身法利落', basis: '药铺掌柜悬赏托付', days: 7 },
], { source: 'decide', floor: 20 });
assert.equal(result.applied.length, 1);
assert.ok(result.applied[0].summary.includes('任务 +t1'), result.applied[0].summary);
assert.ok(result.applied[0].summary.includes(`第 ${runtime.status().clock.day + 6} 天前需完成`), '时限按当前时钟算');
assert.equal(runtime.apply([{ op: 'addTask', title: '查出城东窃贼的来历' }]).rejected[0].reason, 'duplicate_task', '同名进行中任务不重立');
assert.equal(runtime.apply([{ op: 'updateTask', id: 't1', detail: '已锁定嫌疑人是米特尔家的护卫' }]).applied.length, 1);
assert.equal(runtime.snapshot().tasks[0].detail, '已锁定嫌疑人是米特尔家的护卫');
result = runtime.apply([{ op: 'completeTask', id: 't1' }]);
assert.equal(result.applied.length, 1);
const doneTask = runtime.snapshot().tasks.find(task => task.id === 't1');
assert.equal(doneTask.status, 'done');
assert.equal(runtime.apply([{ op: 'completeTask', id: 't1' }]).rejected[0].reason, 'task_already_done');
runtime.apply([{ op: 'addTask', title: '临时任务', detail: '待删' }]);
result = runtime.apply([{ op: 'deleteTask', id: 't2' }]);
assert.equal(result.applied.length, 1);
assert.equal(runtime.snapshot().tasks.some(task => task.id === 't2'), false, '删除即从列表移除');
assert.equal(runtime.apply([{ op: 'completeTask', id: 't2' }]).rejected[0].reason, 'task_not_found');

// —— OPT-067：混合更新须先校验时限，拒绝不能留下详情或流水变化 ——
{
    let tick = 0;
    const tasks = createWorldRuntime({ now: () => `task-${++tick}` });
    tasks.apply([{ op: 'addTask', title: '校验任务', detail: '原详情', days: 7 }]);
    const before = tasks.snapshot();
    for (const days of [0, 91, 1.5, 'bad']) {
        const rejected = tasks.apply([{ op: 'updateTask', id: 't1', detail: '不能落账', days }]);
        assert.equal(rejected.status, 'rejected');
        assert.equal(rejected.rejected[0].reason, 'bad_days');
        assert.deepEqual(tasks.snapshot(), before, `坏时限 ${days} 不能修改任何快照字段`);
    }
    const changed = tasks.apply([{ op: 'updateTask', id: 't1', detail: '新详情', days: '3' }]);
    const after = tasks.snapshot();
    assert.equal(changed.applied.length, 1);
    assert.equal(after.tasks[0].detail, '新详情');
    assert.equal(after.tasks[0].endDay, 3, '沿用 intIn 数字字符串规则');
    assert.equal(after.log.length, before.log.length + 1);
    assert.notEqual(after.updatedAt, before.updatedAt);
    for (const days of [undefined, null]) {
        assert.equal(tasks.apply([{ op: 'updateTask', id: 't1', detail: '新详情', days }]).rejected[0].reason, 'task_nothing_to_update');
        assert.deepEqual(tasks.snapshot(), after, '未提供时限与空时限不应清除旧期限');
    }
}

// —— 任务随存档恢复：详情/来源/状态一字不丢 ——
const taskSaved = JSON.parse(JSON.stringify(runtime.snapshot()));
const taskReloaded = createWorldRuntime({ now: () => 'rt' });
taskReloaded.restore(taskSaved);
const taskBack = taskReloaded.snapshot().tasks.find(task => task.id === 't1');
assert.equal(taskBack.title, '查出城东窃贼的来历');
assert.equal(taskBack.detail, '已锁定嫌疑人是米特尔家的护卫');
assert.equal(taskBack.basis, '药铺掌柜悬赏托付');
assert.equal(taskBack.status, 'done');
assert.equal(taskReloaded.apply([{ op: 'addTask', title: '恢复后立新任务' }]).applied[0].summary.includes('t2'), true, '编号接现存最大值');

// —— 势力：登记/更新/删除，按名字 upsert，存档保留 ——
result = runtime.apply([
    { op: "setFaction", name: "云岚宗", stance: "wary", dynamics: "为退婚一事派使者常驻乌坦城", basis: "本楼使者登门" },
    { op: "setFaction", name: "米特尔家族", stance: "friendly", dynamics: "拍卖行给萧家留了面子", basis: "上楼拍卖会互动" },
], { source: "decide", floor: 30 });
assert.equal(result.applied.length, 2);
assert.ok(result.applied[0].summary.includes('势力登记 云岚宗：警惕'));
result = runtime.apply([{ op: "setFaction", name: "云岚宗", stance: "hostile", dynamics: "因萧炎当众拒婚而震怒", basis: "退婚现场翻脸" }], { source: "decide", floor: 31 });
assert.equal(result.applied.length, 1);
assert.ok(result.applied[0].summary.includes('势力更新 云岚宗：敌对'));
assert.equal(runtime.snapshot().factions.find(f => f.name === '云岚宗').stance, 'hostile');
assert.equal(runtime.apply([{ op: 'setFaction', name: '云岚宗', stance: 'hostile' }]).rejected[0].reason, 'faction_nothing_to_update');
assert.equal(runtime.apply([{ op: 'setFaction', name: '不存在', stance: 'bad' }]).applied[0].summary.includes('中立'), true, '未知档位归一为中立');
runtime.apply([{ op: "deleteFaction", name: "米特尔家族" }]);
assert.equal(runtime.snapshot().factions.some(f => f.name === '米特尔家族'), false);

// —— 势力档案：全档案登记 / 留空保旧 / 仅档案更新不再拒 / 超长截断 ——
result = runtime.apply([{
    op: 'setFaction', name: '云岚宗',
    type: '宗门', level: '加玛帝国一流', leader: '云韵（宗主·斗王）',
    elders: '老宗主云山、大长老云棱', members: '弟子千余，斗王三人',
    location: '云岚宗山门', assets: '宗门产业与传承功法', relations: '世仇萧家；背靠皇室',
}], { source: 'decide', floor: 32 });
assert.equal(result.applied.length, 1);
assert.ok(result.applied[0].summary.includes('首领 云韵（宗主·斗王）'), result.applied[0].summary);
let faction = runtime.snapshot().factions.find(f => f.name === '云岚宗');
assert.equal(faction.type, '宗门');
assert.equal(faction.elders, '老宗主云山、大长老云棱');
assert.equal(faction.relations, '世仇萧家；背靠皇室');
result = runtime.apply([{ op: 'setFaction', name: '云岚宗', leader: '纳兰嫣然（代宗主）' }], { source: 'decide', floor: 33 });
assert.equal(result.applied.length, 1, '仅档案更新不再被 faction_nothing_to_update 误拒');
faction = runtime.snapshot().factions.find(f => f.name === '云岚宗');
assert.equal(faction.leader, '纳兰嫣然（代宗主）');
assert.equal(faction.elders, '老宗主云山、大长老云棱', '没提的字段保持旧值');
assert.equal(faction.stance, 'hostile', '态度没动');
assert.ok(result.applied[0].summary.includes('首领 纳兰嫣然'), result.applied[0].summary);
runtime.apply([{ op: 'setFaction', name: '截断宗', assets: '长'.repeat(300) }]);
assert.equal(runtime.snapshot().factions.find(f => f.name === '截断宗').assets.length, 160, '底蕴守 160 字上限');
assert.equal(runtime.apply([{ op: 'setFaction', name: '截断宗', assets: '' }]).rejected[0].reason, 'faction_nothing_to_update', '空档案字段不算变化也不清旧值');

// —— 人物：登记/更新态度，存档保留 ——
result = runtime.apply([{ op: "setPerson", name: "药老", attitude: "严厉但护短，亦师亦父", basis: "第二楼药老出手相护" }]);
assert.equal(result.applied.length, 1);
result = runtime.apply([{ op: "setPerson", name: "药老", attitude: "因萧炎隐瞒森林经历而起疑", basis: "本楼谎言被看穿" }]);
assert.equal(result.applied.length, 1);
assert.equal(runtime.snapshot().people.find(p => p.name === '药老').attitude, '因萧炎隐瞒森林经历而起疑');
assert.equal(runtime.apply([{ op: 'setPerson', name: '药老', attitude: '因萧炎隐瞒森林经历而起疑' }]).rejected[0].reason, 'person_nothing_to_update');

// —— OPT-067：仅依据变化也落账；真无变化不改日期；raw undo 完整还原人物 ——
{
    let tick = 0;
    const people = createWorldRuntime({ now: () => `person-${++tick}` });
    const person = { op: 'setPerson', name: '药老', attitude: '护短', basis: '旧依据' };
    people.apply([person]);
    people.apply([{ op: 'advance', days: 2 }]);
    const before = people.snapshot();
    const changed = people.apply([{ ...person, basis: ' 新依据 ' }]);
    const after = people.snapshot();
    assert.equal(changed.applied.length, 1, '相同态度、不同依据应成功更新');
    assert.equal(changed.rejected.length, 0);
    assert.deepEqual(after.people[0], { ...before.people[0], basis: '新依据', updatedDay: 3 });
    assert.equal(after.log.length, before.log.length + 1, '依据变化必须留下流水');
    assert.deepEqual(after.log.at(-1).summaries, [changed.applied[0].summary]);
    assert.notEqual(after.updatedAt, before.updatedAt);
    assert.equal(changed.applied[0].undo.op, '_setPersonRaw');
    people.apply([{ op: 'advance', days: 1 }]);
    const beforeNoop = people.snapshot();
    for (const basis of [undefined, '新依据', ' 新依据 ', '   ']) {
        const noop = people.apply([{ ...person, basis }]);
        assert.equal(noop.rejected[0].reason, 'person_nothing_to_update');
        assert.deepEqual(people.snapshot(), beforeNoop, '跨天无变化也不能更新 updatedDay、流水或时间戳');
    }
    assert.equal(people.apply([{ op: 'setPerson', name: '药老', basis: '不能单独省略态度' }]).rejected[0].reason, 'attitude_missing');
    assert.deepEqual(people.snapshot(), beforeNoop, '仍要求提供非空态度');
    assert.equal(people.apply([changed.applied[0].undo], { source: 'revert' }).applied.length, 1);
    assert.deepEqual(people.snapshot().people[0], before.people[0], '直接 raw undo 还原依据与原 updatedDay');
    const normal = people.apply([{ ...person, attitude: '信任', basis: '   ' }]);
    assert.equal(normal.applied.length, 1);
    assert.deepEqual(people.snapshot().people[0], { ...before.people[0], attitude: '信任', updatedDay: 4 }, '正常态度更新仍保留非空旧依据');
    assert.equal(people.apply([normal.applied[0].undo], { source: 'revert' }).applied.length, 1);
    assert.deepEqual(people.snapshot().people[0], before.people[0], '态度变化也可 raw undo');
}

// —— 势力/人物随存档恢复 ——
const socialSaved = JSON.parse(JSON.stringify(runtime.snapshot()));
const socialReloaded = createWorldRuntime({ now: () => "sr" });
socialReloaded.restore(socialSaved);
assert.equal(socialReloaded.snapshot().factions.find(f => f.name === '云岚宗').stance, 'hostile');
assert.equal(socialReloaded.snapshot().factions.find(f => f.name === '云岚宗').leader, '纳兰嫣然（代宗主）', '档案随存档恢复');
assert.equal(socialReloaded.snapshot().people.find(p => p.name === '药老').basis, '本楼谎言被看穿');

// —— 事件地点：登记/清洗/摘要 ——
result = runtime.apply([{ op: "addEvent", scope: "world", title: "皇室武库失窃", text: "皇室武库失窃", location: "帝都" }], { source: "decide", floor: 40 });
assert.equal(result.applied.length, 1);
assert.ok(result.applied[0].summary.includes('地点：帝都'), result.applied[0].summary);
assert.equal(runtime.snapshot().worldEvents.find(event => event.text === '皇室武库失窃').location, '帝都');

// —— 事件短标题：title 必填（缺/超长整条拒绝），老存档仍按正文补；存档往返不许丢 ——
result = runtime.apply([{ op: 'addEvent', scope: 'near', title: '城东连环失窃', text: '城东连着三家铺子夜里失窃，巡卫已经封了街口' }]);
assert.equal(result.applied.length, 1);
assert.ok(result.applied[0].summary.includes('「城东连环失窃」'), result.applied[0].summary);
assert.equal(runtime.snapshot().nearEvents.find(event => event.text === '城东连着三家铺子夜里失窃，巡卫已经封了街口').text, '城东连着三家铺子夜里失窃，巡卫已经封了街口', '正文不受标题影响');
result = runtime.apply([{ op: 'addEvent', scope: 'near', text: '加列家中街设卡盘查，过往行商都要交验货单' }]);
assert.equal(result.rejected.length, 1);
assert.equal(result.rejected[0].reason, 'title_missing', '没给 title 的 addEvent 整条拒绝');
result = runtime.apply([{ op: 'addEvent', scope: 'near', title: '标题'.repeat(9), text: '超长标题的事件' }]);
assert.equal(result.rejected[0].reason, 'title_too_long', '超过 16 字的标题整条拒绝');
result = runtime.apply([{ op: 'addEvent', scope: 'near', title: '加列家中街设卡', text: '加列家中街设卡盘查，过往行商都要交验货单' }]);
assert.equal(result.applied.length, 1);
const titled = runtime.snapshot().nearEvents.find(event => event.text.startsWith('加列家中街'));
assert.equal(titled.title, '加列家中街设卡', '模型给的标题原样保留');
assert.equal(deriveEventTitle(''), '', '空正文不给标题');
assert.equal(deriveEventTitle('没有标点的一长串内容'.repeat(4)).length, 16, '老存档兜底标题也守 16 字上限');
assert.equal(eventIntro('城东连环失窃', '城东连着三家铺子夜里失窃'), '城东连着三家铺子夜里失窃', '标题与正文不同就整段当简介');
assert.equal(eventIntro('坊市开张', '坊市开张，人挤得走不动'), '人挤得走不动', '标题正好是正文首句时简介只留后半句');
assert.equal(eventIntro('迦南学院招生', '迦南学院招生队进了乌坦城，当街考校少年斗气'), '迦南学院招生队进了乌坦城，当街考校少年斗气', '标题只是开头几个字，不能从词中间切开');
assert.equal(eventIntro('萧家护卫队在城外操练', '萧家护卫队在城外操练'), '', '标题就是整段正文时不重复铺');
assert.equal(eventIntro('', '只有正文'), '', '没标题时标题位已经是正文截断，简介留空');
assert.equal(eventIntro('坊市开张', ''), '', '没正文就没简介');
const titleSaved = JSON.parse(JSON.stringify(runtime.snapshot()));
const titleReloaded = createWorldRuntime({ now: () => 'title-time' });
titleReloaded.restore(titleSaved);
assert.equal(titleReloaded.snapshot().nearEvents.find(event => event.id === titled.id).title, '加列家中街设卡', '存档恢复不许丢 title');

// —— 热度计：三档切换/非法档位/同档拒绝/存档保留 ——
assert.equal(runtime.snapshot().tension, 'calm', '开局平静');
result = runtime.apply([{ op: "setTension", level: "rising" }], { source: "decide", floor: 41 });
assert.equal(result.applied.length, 1);
assert.ok(result.applied[0].summary.includes('平静 → 升温'));
assert.equal(runtime.apply([{ op: 'setTension', level: 'rising' }]).rejected[0].reason, 'tension_nothing_to_update');
assert.equal(runtime.apply([{ op: 'setTension', level: 'panic' }]).rejected[0].reason, 'bad_tension');
runtime.apply([{ op: 'setTension', level: 'storm' }]);
const tensionSaved = JSON.parse(JSON.stringify(runtime.snapshot()));
const tensionReloaded = createWorldRuntime({ now: () => "tn" });
tensionReloaded.restore(tensionSaved);
assert.equal(tensionReloaded.snapshot().tension, 'storm', '氛围随存档恢复');

// —— opId 幂等：重放同一批指令不再二次记账 ——
const batch = [{ op: 'addEvent', scope: 'near', title: '重放测试', text: '重放测试', opId: 'tick-1' }];
result = runtime.apply(batch, { source: 'llm' });
assert.equal(result.applied.length, 1);
result = runtime.apply(batch, { source: 'llm' });
assert.equal(result.status, 'noop');
assert.equal(result.duplicate.length, 1);
assert.equal(runtime.snapshot().nearEvents.filter(event => event.text === '重放测试').length, 1);

// —— 时限事件：days 生效、推进到线内仍有效、过线自动了结 ——
result = runtime.apply([{ op: 'addEvent', scope: 'near', title: '比武报名', text: '限期三天的比武报名', days: 3 }]);
assert.equal(result.status, 'applied');
assert.ok(result.applied[0].summary.includes('有效至第'), result.applied[0].summary);
const deadlineEvent = runtime.snapshot().nearEvents.find(event => event.text === '限期三天的比武报名');
assert.equal(deadlineEvent.endDay, runtime.status().clock.day + 2, '记下当天算第 1 天有效');
runtime.apply([{ op: 'advance', days: deadlineEvent.endDay - runtime.status().clock.day }]);
assert.equal(runtime.snapshot().nearEvents.find(event => event.id === deadlineEvent.id).done, false, '有效期内不许提前了结');
result = runtime.apply([{ op: 'advance', days: 1 }]);
assert.deepEqual(result.applied[0].expired, [deadlineEvent.id], '过线即自动了结');
assert.ok(result.applied[0].summary.includes('到期了结 1 件事'), result.applied[0].summary);
assert.equal(runtime.apply([{ op: 'addEvent', scope: 'near', title: '坏时限', text: '坏时限', days: 91 }]).rejected[0].reason, 'bad_days');
// setClock 直接跳进未来也要清扫；没时限的事件不受影响
runtime.apply([{ op: 'addEvent', scope: 'world', title: '短期悬赏', text: '短期悬赏', days: 2 }]);
const bounty = runtime.snapshot().worldEvents.find(event => event.text === '短期悬赏');
runtime.apply([{ op: 'setClock', day: runtime.status().clock.day + 5 }]);
assert.equal(runtime.snapshot().worldEvents.find(event => event.id === bounty.id).done, true, '跳钟后限时事件到期');
assert.ok(runtime.snapshot().log.some(entry => entry.summaries.some(text => text.includes('到期了结'))), '清扫要留流水');

// —— 重 roll 撤销连带到期：旧批次的推进撤销时，被它到期了结的事件复活 ——
runtime.apply([{ op: 'addEvent', scope: 'near', title: '将到期的悬案', text: '将到期的悬案', days: 2 }]);
const coldCase = runtime.snapshot().nearEvents.find(event => event.text === '将到期的悬案');
runtime.apply([{ op: 'advance', days: 5 }], { source: 'llm', floor: 30 });
assert.equal(runtime.snapshot().nearEvents.find(event => event.id === coldCase.id).done, true);
runtime.apply([{ op: 'advance', days: 1 }], { source: 'llm', floor: 30 });
assert.equal(runtime.snapshot().nearEvents.find(event => event.id === coldCase.id).done, false, '撤销要连到期一起回滚');

// —— 同楼重 roll：先撤销上一版指令，再执行新指令，不重复记账 ——
const clockBeforeSwipe = { ...runtime.snapshot().clock };
runtime.apply([
    { op: 'advance', days: 3 },
    { op: 'addEvent', scope: 'near', title: '旧版本事件', text: '旧版本事件' },
    { op: 'setInfo', field: 'weather', text: '晴' },
], { source: 'llm', floor: 7 });
const afterFirst = runtime.snapshot();
assert.equal(afterFirst.nearEvents.some(event => event.text === '旧版本事件'), true);
runtime.apply([
    { op: 'advance', days: 1 },
    { op: 'addEvent', scope: 'world', title: '新版本大事', text: '新版本大事' },
    { op: 'setInfo', field: 'weather', text: '阴' },
], { source: 'llm', floor: 7 });
const afterSwipe = runtime.snapshot();
assert.equal(afterSwipe.nearEvents.some(event => event.text === '旧版本事件'), false, '旧楼的事件应被撤销');
assert.equal(afterSwipe.worldEvents.some(event => event.text === '新版本大事'), true);
assert.equal(afterSwipe.info.weather, '阴');
// 撤销只回滚指令效果：时钟=重roll前时钟 + 新批次的1天，而不是简单还原
assert.equal(afterSwipe.clock.day, clockBeforeSwipe.day + 1, '旧批次推进被撤销、新批次推进生效');
assert.ok(afterSwipe.log.some(entry => entry.source === 'revert'), '撤销要留流水');

// —— 快照隔离：改快照不影响内部 ——
const frozen = runtime.snapshot();
const dayBeforeFreeze = runtime.status().clock.day;
frozen.clock.day = 999;
assert.equal(runtime.status().clock.day, dayBeforeFreeze);

// —— restore 清洗脏存档并接续编号 ——
const dirty = {
    clock: { day: -3, minute: 99999, label: 'x'.repeat(200) },
    info: { weather: 42, location: '乌坦城', hack: 'drop me' },
    nearEvents: [{ id: 'e7', day: 'x', text: '  存档事件  ', basis: '  '.padEnd(90, '长') }, { text: '' }, 'junk'],
    worldEvents: [{ id: 'e9', day: 2, text: '大事', done: true, resolvedDay: 2 }],
    log: 'junk',
};
const restored = runtime.restore(dirty);
assert.equal(restored.clock.day, 1);
assert.equal(restored.clock.minute, 480 % 1440);
assert.equal(runtime.snapshot().info.weather, '', '非字符串信息应被清空');
assert.equal(runtime.snapshot().nearEvents.length, 1);
assert.equal(runtime.snapshot().nearEvents[0].text, '存档事件');
assert.equal(runtime.snapshot().nearEvents[0].basis.length, 80, '超长依据截到 80 字');
assert.equal(runtime.snapshot().nearEvents[0].title, '存档事件', '老存档没有 title 时按正文补短标题');

// —— 存档 roundtrip：名声/通缉度与时间戳不许在恢复时丢失 ——
runtime.apply([{ op: 'setInfo', field: 'reputation', text: '乌坦城小有名气' }, { op: 'setInfo', field: 'wanted', text: '被米特尔家族记恨' }]);
const saved = JSON.parse(JSON.stringify(runtime.snapshot()));
const reloaded = createWorldRuntime({ now: () => 'restore-time' });
reloaded.restore(saved);
const back = reloaded.snapshot();
assert.equal(back.info.reputation, '乌坦城小有名气', '名声要随存档恢复');
assert.equal(back.info.wanted, '被米特尔家族记恨', '通缉度要随存档恢复');
assert.equal(back.updatedAt, saved.updatedAt, '存档时间戳要保留，不能被恢复时刻覆盖');
result = runtime.apply([{ op: 'addEvent', scope: 'near', title: '新事件', text: '新事件' }]);
const ids = runtime.snapshot().nearEvents.map(event => event.id);
assert.ok(ids.some(id => Number(id.slice(1)) > 9), `恢复后编号应接续最大值：${ids.join(',')}`);
assert.equal(runtime.apply([{ op: 'resolveEvent', id: 'e9' }]).applied.length, 1, '已了结事件仍可再次定位');

// —— 上限清理：先清已了结的，再清未置顶最老的，置顶永不丢 ——
const bounded = createWorldRuntime({ maxEvents: 10 });
// 标题带「号」避免撞上 duplicate_similar（双字相似度过线）——这条测的是清理顺序，不是去重。
for (let index = 1; index <= 10; index += 1) {
    bounded.apply([{ op: 'addEvent', scope: 'near', title: `事件${index}号`, text: `事件${index}号`, day: index }]);
}
assert.equal(bounded.apply([{ op: 'resolveEvent', id: 'e1' }, { op: 'pinEvent', id: 'e2', pinned: true }]).applied.length, 2);
// 再塞 4 条触发清理：应依次丢掉 e1（已了结）→ e3 → e4 → e5（未置顶最老）。
for (let index = 11; index <= 14; index += 1) {
    bounded.apply([{ op: 'addEvent', scope: 'near', title: `事件${index}号`, text: `事件${index}号`, day: index }]);
}
assert.equal(bounded.snapshot().nearEvents.length, 10);
const keptIds = bounded.snapshot().nearEvents.map(event => event.id);
assert.ok(!keptIds.includes('e1'), '已了结且未置顶的事件最先清理');
assert.ok(!keptIds.includes('e3') && !keptIds.includes('e5'), '接着清理未置顶的最老事件');
assert.ok(keptIds.includes('e2'), '置顶事件不许被清理');
assert.ok(keptIds.includes('e14'), '最新事件保留');

// —— reset 回到开局 ——
assert.equal(bounded.reset().status, 'reset');
assert.equal(bounded.status().total, 0);
assert.equal(bounded.status().clock.day, 1);

// OPT-068: undo uses the original absolute deadline, including no deadline.
for (const days of [undefined, 2]) {
    const r = createWorldRuntime();
    r.apply([{ op: 'addTask', title: '旧任务', detail: '原详情', days }], { source: 'panel' });
    const before = r.snapshot().tasks[0];
    r.apply([{ op: 'advance', days: 3 }, { op: 'updateTask', id: before.id, detail: '新详情', days: 10 }], { floor: 9 });
    r.apply([], { floor: 9 });
    assert.deepEqual(r.snapshot().tasks[0], before);
}

// OPT-069: stable optional opIds survive same-floor replacement, not cross-floor replay.
{
    const r = createWorldRuntime();
    const op = { op: 'addEvent', title: '旧事件', text: '旧正文', opId: 'stable' };
    r.apply([op], { floor: 3 });
    assert.equal(r.apply([op], { floor: 3 }).status, 'applied');
    assert.equal(r.snapshot().nearEvents.length, 1);
    r.apply([{ ...op, title: '新事件', text: '新正文' }], { floor: 3 });
    assert.equal(r.snapshot().nearEvents[0].text, '新正文');
    assert.deepEqual(r.apply([op], { floor: 4 }).duplicate, ['stable']);
    assert.equal(r.snapshot().nearEvents.length, 1);
}

// —— A1 事件点名：participants 清洗（去重、限量、截长），坏形状当没给 ——
{
    const r = createWorldRuntime();
    r.apply([{ op: 'addEvent', scope: 'near', title: '集市骚动', text: '有人在集市散布异火传闻', participants: ['萧炎', ' 药老 ', '萧炎', '这个名字长得已经超出单个名字的限额', '药老', 42] }]);
    const event = r.snapshot().nearEvents.find(item => item.title === '集市骚动');
    assert.deepEqual(event.participants, ['萧炎', '药老'], '点名去重限量，坏值丢弃');
}

// —— A2 因果链：cause 必须指到已有事件（写错剥离不拒绝）；resolveEvent 的 outcome 落账可恢复 ——
{
    const r = createWorldRuntime();
    const added = r.apply([{ op: 'addEvent', scope: 'near', title: '集市骚动', text: '有人在集市散布异火传闻', participants: ['药老'] }]);
    assert.equal(added.applied.length, 1);
    const rumorId = added.applied[0].id;
    const badCause = r.apply([{ op: 'addEvent', scope: 'near', title: '传闻被戳穿', text: '当众验证后传闻不攻自破', cause: 'e999' }]);
    assert.equal(badCause.applied.length, 1, 'cause 写错不整条拒绝');
    assert.ok(badCause.applied[0].warning.includes('起因编号'), JSON.stringify(badCause.warnings));
    assert.equal(badCause.warnings.length >= 1, true, 'warnings 汇总到批结果');
    assert.equal(r.snapshot().nearEvents.find(item => item.title === '传闻被戳穿').cause, null);
    const goodCause = r.apply([{ op: 'addEvent', scope: 'near', title: '散布者招供', text: '查明传闻是米特尔家族放的假消息', cause: rumorId }]);
    assert.ok(goodCause.applied[0].summary.includes(`起因：${rumorId}`), goodCause.applied[0].summary);
    assert.equal(r.snapshot().nearEvents.find(item => item.title === '散布者招供').cause, rumorId);
    const resolved = r.apply([{ op: 'resolveEvent', id: rumorId, outcome: '验证为假，散布者被扭送' }]);
    assert.ok(resolved.applied[0].summary.includes('结论：验证为假'), resolved.applied[0].summary);
    assert.equal(r.snapshot().nearEvents.find(item => item.id === rumorId).resolvedNote, '验证为假，散布者被扭送');
    // undo 连结论一起恢复
    r.apply([resolved.applied[0].undo], { source: 'revert' });
    const restored = r.snapshot().nearEvents.find(item => item.id === rumorId);
    assert.equal(restored.done, false);
    assert.equal(restored.resolvedNote, '', '了结结论随撤销清空');
}

// —— A3 updateEvent：大事推进阶段/传闻升级，undo 往返，无变化拒绝 ——
{
    const r = createWorldRuntime();
    r.apply([{ op: 'addEvent', scope: 'world', title: '炼药师大会酝酿', text: '各地炼药师收到邀请函', weight: 'minor' }]);
    const id = r.snapshot().worldEvents[0].id;
    const updated = r.apply([{ op: 'updateEvent', id, text: '大会正式开幕，各路高手云集帝都', weight: 'major', days: 10 }]);
    assert.equal(updated.applied.length, 1);
    const event = r.snapshot().worldEvents[0];
    assert.equal(event.text, '大会正式开幕，各路高手云集帝都');
    assert.equal(event.weight, 'major');
    assert.equal(event.endDay, event.day + 9, 'days 以事件登记日重算有效期末');
    assert.ok(updated.applied[0].summary.includes('minor → major'), updated.applied[0].summary);
    r.apply([updated.applied[0].undo], { source: 'revert' });
    const back = r.snapshot().worldEvents[0];
    assert.equal(back.text, '各地炼药师收到邀请函');
    assert.equal(back.weight, 'minor');
    assert.equal(back.endDay, null, '没带时限的事件撤销后仍是无限期');
    assert.equal(r.apply([{ op: 'updateEvent', id }]).rejected[0].reason, 'event_nothing_to_update');
    assert.equal(r.apply([{ op: 'updateEvent', id: 'e999', text: 'x' }]).rejected[0].reason, 'event_not_found');
    assert.equal(r.apply([{ op: 'updateEvent', id, weight: 'secret' }]).rejected[0].reason, 'bad_weight');
}

// —— A4 重复登记防线：同标题 / 近似标题（几天内相似度过线）/ 同文，已了结的不参与 ——
{
    const r = createWorldRuntime();
    r.apply([{ op: 'addEvent', scope: 'near', title: '城东连环失窃', text: '三家铺子夜里失窃', day: 5 }]);
    assert.equal(r.apply([{ op: 'addEvent', scope: 'near', title: '城东连环失窃', text: '换了说法', day: 6 }]).rejected[0].reason, 'duplicate_title');
    assert.equal(r.apply([{ op: 'addEvent', scope: 'near', title: '城东连环失窃案', text: '又换了说法', day: 6 }]).rejected[0].reason, 'duplicate_similar');
    assert.equal(r.apply([{ op: 'addEvent', scope: 'near', title: '完全不同的事', text: '三家铺子夜里失窃', day: 6 }]).rejected[0].reason, 'duplicate_text');
    const later = r.apply([{ op: 'addEvent', scope: 'near', title: '城东连环失窃案', text: '巡卫破了案', day: 9 }]);
    assert.equal(later.applied.length, 1, '过了相似窗口的相似标题放行');
    const r2 = createWorldRuntime();
    r2.apply([{ op: 'addEvent', scope: 'near', title: '旧闻', text: '旧闻内容' }]);
    r2.apply([{ op: 'resolveEvent', id: r2.snapshot().nearEvents[0].id }]);
    assert.equal(r2.apply([{ op: 'addEvent', scope: 'near', title: '旧闻', text: '旧闻内容' }]).applied.length, 1, '已了结事件不再参与去重');
}

// —— A6 跳跃空窗审计：一次跨太多天又没补动向事件就提醒，补了不提醒 ——
{
    const gapped = createWorldRuntime();
    const result = gapped.apply([{ op: 'advance', days: 10 }]);
    assert.deepEqual(result.jumpGap, { from: 1, to: 11 });
    assert.ok(result.warnings.some(item => item.includes('原地等你')), JSON.stringify(result.warnings));
    const covered = createWorldRuntime();
    const ok = covered.apply([{ op: 'advance', days: 8 }, { op: 'addEvent', scope: 'near', title: '闭关期间动向', text: '萧家护卫队巡城两次', day: 4 }]);
    assert.equal(ok.jumpGap, null);
    assert.equal(ok.warnings.length, 0);
    const small = createWorldRuntime();
    assert.equal(small.apply([{ op: 'advance', days: 3 }]).jumpGap, null, '小步推进不提醒');
}

// —— 新字段随存档往返：participants/cause/resolvedNote 恢复不丢，schemaVersion 升到 2 ——
{
    const r = createWorldRuntime();
    r.restore({ schemaVersion: 1, clock: { day: 3, minute: 0 }, nearEvents: [{ id: 'e1', text: '正文', title: '旧档事件', participants: ['萧炎', '云韵', '药老', '第四个名字'], cause: 'e9', resolvedNote: '旧结论' }] });
    const event = r.snapshot().nearEvents[0];
    assert.deepEqual(event.participants, ['萧炎', '云韵', '药老'], '点名限量 3 个');
    assert.equal(event.cause, 'e9');
    assert.equal(event.resolvedNote, '旧结论');
    assert.equal(r.snapshot().schemaVersion, 2);
}

console.log('world runtime tests passed');
