import assert from 'node:assert/strict';
import { createWorldRuntime, formatClock } from '../world/world-runtime.js';

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
    { op: 'addEvent', scope: 'near', text: '城东连着三家铺子夜里失窃', basis: '最近几楼提到的失窃传闻' },
    { op: 'addEvent', scope: 'world', text: '皇室宣布炼药师大会提前', weight: 'major' },
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
    { op: 'addEvent', scope: 'near', text: '酒馆传闻：有人在收异火消息', weight: 'rumor' },
    { op: 'addEvent', scope: 'near', text: '坏档位', weight: 'secret' },
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

// —— 人物：登记/更新态度，存档保留 ——
result = runtime.apply([{ op: "setPerson", name: "药老", attitude: "严厉但护短，亦师亦父", basis: "第二楼药老出手相护" }]);
assert.equal(result.applied.length, 1);
result = runtime.apply([{ op: "setPerson", name: "药老", attitude: "因萧炎隐瞒森林经历而起疑", basis: "本楼谎言被看穿" }]);
assert.equal(result.applied.length, 1);
assert.equal(runtime.snapshot().people.find(p => p.name === '药老').attitude, '因萧炎隐瞒森林经历而起疑');
assert.equal(runtime.apply([{ op: 'setPerson', name: '药老', attitude: '因萧炎隐瞒森林经历而起疑' }]).rejected[0].reason, 'person_nothing_to_update');

// —— 势力/人物随存档恢复 ——
const socialSaved = JSON.parse(JSON.stringify(runtime.snapshot()));
const socialReloaded = createWorldRuntime({ now: () => "sr" });
socialReloaded.restore(socialSaved);
assert.equal(socialReloaded.snapshot().factions.find(f => f.name === '云岚宗').stance, 'hostile');
assert.equal(socialReloaded.snapshot().people.find(p => p.name === '药老').basis, '本楼谎言被看穿');

// —— 事件地点：登记/清洗/摘要 ——
result = runtime.apply([{ op: "addEvent", scope: "world", text: "皇室武库失窃", location: "帝都" }], { source: "decide", floor: 40 });
assert.equal(result.applied.length, 1);
assert.ok(result.applied[0].summary.includes('地点：帝都'), result.applied[0].summary);
assert.equal(runtime.snapshot().worldEvents.find(event => event.text === '皇室武库失窃').location, '帝都');

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
const batch = [{ op: 'addEvent', scope: 'near', text: '重放测试', opId: 'tick-1' }];
result = runtime.apply(batch, { source: 'llm' });
assert.equal(result.applied.length, 1);
result = runtime.apply(batch, { source: 'llm' });
assert.equal(result.status, 'noop');
assert.equal(result.duplicate.length, 1);
assert.equal(runtime.snapshot().nearEvents.filter(event => event.text === '重放测试').length, 1);

// —— 时限事件：days 生效、推进到线内仍有效、过线自动了结 ——
result = runtime.apply([{ op: 'addEvent', scope: 'near', text: '限期三天的比武报名', days: 3 }]);
assert.equal(result.status, 'applied');
assert.ok(result.applied[0].summary.includes('有效至第'), result.applied[0].summary);
const deadlineEvent = runtime.snapshot().nearEvents.find(event => event.text === '限期三天的比武报名');
assert.equal(deadlineEvent.endDay, runtime.status().clock.day + 2, '记下当天算第 1 天有效');
runtime.apply([{ op: 'advance', days: deadlineEvent.endDay - runtime.status().clock.day }]);
assert.equal(runtime.snapshot().nearEvents.find(event => event.id === deadlineEvent.id).done, false, '有效期内不许提前了结');
result = runtime.apply([{ op: 'advance', days: 1 }]);
assert.deepEqual(result.applied[0].expired, [deadlineEvent.id], '过线即自动了结');
assert.ok(result.applied[0].summary.includes('到期了结 1 件事'), result.applied[0].summary);
assert.equal(runtime.apply([{ op: 'addEvent', scope: 'near', text: '坏时限', days: 91 }]).rejected[0].reason, 'bad_days');
// setClock 直接跳进未来也要清扫；没时限的事件不受影响
runtime.apply([{ op: 'addEvent', scope: 'world', text: '短期悬赏', days: 2 }]);
const bounty = runtime.snapshot().worldEvents.find(event => event.text === '短期悬赏');
runtime.apply([{ op: 'setClock', day: runtime.status().clock.day + 5 }]);
assert.equal(runtime.snapshot().worldEvents.find(event => event.id === bounty.id).done, true, '跳钟后限时事件到期');
assert.ok(runtime.snapshot().log.some(entry => entry.summaries.some(text => text.includes('到期了结'))), '清扫要留流水');

// —— 重 roll 撤销连带到期：旧批次的推进撤销时，被它到期了结的事件复活 ——
runtime.apply([{ op: 'addEvent', scope: 'near', text: '将到期的悬案', days: 2 }]);
const coldCase = runtime.snapshot().nearEvents.find(event => event.text === '将到期的悬案');
runtime.apply([{ op: 'advance', days: 5 }], { source: 'llm', floor: 30 });
assert.equal(runtime.snapshot().nearEvents.find(event => event.id === coldCase.id).done, true);
runtime.apply([{ op: 'advance', days: 1 }], { source: 'llm', floor: 30 });
assert.equal(runtime.snapshot().nearEvents.find(event => event.id === coldCase.id).done, false, '撤销要连到期一起回滚');

// —— 同楼重 roll：先撤销上一版指令，再执行新指令，不重复记账 ——
const clockBeforeSwipe = { ...runtime.snapshot().clock };
runtime.apply([
    { op: 'advance', days: 3 },
    { op: 'addEvent', scope: 'near', text: '旧版本事件' },
    { op: 'setInfo', field: 'weather', text: '晴' },
], { source: 'llm', floor: 7 });
const afterFirst = runtime.snapshot();
assert.equal(afterFirst.nearEvents.some(event => event.text === '旧版本事件'), true);
runtime.apply([
    { op: 'advance', days: 1 },
    { op: 'addEvent', scope: 'world', text: '新版本大事' },
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

// —— 存档 roundtrip：名声/通缉度与时间戳不许在恢复时丢失 ——
runtime.apply([{ op: 'setInfo', field: 'reputation', text: '乌坦城小有名气' }, { op: 'setInfo', field: 'wanted', text: '被米特尔家族记恨' }]);
const saved = JSON.parse(JSON.stringify(runtime.snapshot()));
const reloaded = createWorldRuntime({ now: () => 'restore-time' });
reloaded.restore(saved);
const back = reloaded.snapshot();
assert.equal(back.info.reputation, '乌坦城小有名气', '名声要随存档恢复');
assert.equal(back.info.wanted, '被米特尔家族记恨', '通缉度要随存档恢复');
assert.equal(back.updatedAt, saved.updatedAt, '存档时间戳要保留，不能被恢复时刻覆盖');
result = runtime.apply([{ op: 'addEvent', scope: 'near', text: '新事件' }]);
const ids = runtime.snapshot().nearEvents.map(event => event.id);
assert.ok(ids.some(id => Number(id.slice(1)) > 9), `恢复后编号应接续最大值：${ids.join(',')}`);
assert.equal(runtime.apply([{ op: 'resolveEvent', id: 'e9' }]).applied.length, 1, '已了结事件仍可再次定位');

// —— 上限清理：先清已了结的，再清未置顶最老的，置顶永不丢 ——
const bounded = createWorldRuntime({ maxEvents: 10 });
for (let index = 1; index <= 10; index += 1) {
    bounded.apply([{ op: 'addEvent', scope: 'near', text: `事件${index}`, day: index }]);
}
assert.equal(bounded.apply([{ op: 'resolveEvent', id: 'e1' }, { op: 'pinEvent', id: 'e2', pinned: true }]).applied.length, 2);
// 再塞 4 条触发清理：应依次丢掉 e1（已了结）→ e3 → e4 → e5（未置顶最老）。
for (let index = 11; index <= 14; index += 1) {
    bounded.apply([{ op: 'addEvent', scope: 'near', text: `事件${index}`, day: index }]);
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

console.log('world runtime tests passed');
