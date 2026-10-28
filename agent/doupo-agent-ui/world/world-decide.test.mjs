import assert from 'node:assert/strict';
import { buildDecideUser, parseDecision, WORLD_DECIDE_PROMPT, DECIDE_JSON_SCHEMA } from '../world/world-decide.js';

// —— 决定提示词与 schema：脚本解析依赖的契约必须齐 ——
assert.ok(WORLD_DECIDE_PROMPT.includes('"note"') && WORLD_DECIDE_PROMPT.includes('"ops"'));
assert.ok(WORLD_DECIDE_PROMPT.includes('rumor'), '默认提示词必须教传闻用法');
assert.ok(WORLD_DECIDE_PROMPT.includes('reputation') && WORLD_DECIDE_PROMPT.includes('wanted'), '默认提示词必须含名声/通缉');
assert.ok(WORLD_DECIDE_PROMPT.includes('basis'), '默认提示词必须要求事件有依据');
assert.ok(WORLD_DECIDE_PROMPT.includes('addTask') && WORLD_DECIDE_PROMPT.includes('completeTask'), '默认提示词必须含任务操作');
assert.ok(WORLD_DECIDE_PROMPT.includes('不要替玩家立他没答应的事'), '任务规则要防越权立任务');
assert.equal(DECIDE_JSON_SCHEMA.properties.ops.items.properties.op.enum.includes('addEvent'), true);
assert.equal(DECIDE_JSON_SCHEMA.properties.ops.items.properties.weight.enum.includes('rumor'), true);
assert.equal(DECIDE_JSON_SCHEMA.properties.ops.items.properties.op.enum.includes('addTask'), true, 'schema 认任务操作');
assert.ok(DECIDE_JSON_SCHEMA.properties.ops.items.properties.title, 'schema 认任务字段');
assert.deepEqual(DECIDE_JSON_SCHEMA.required, ['ops']);

// —— 上下文组装：台账 + 世界书条目 + 聊天记录（旧→新），楼数与每楼长度受限 ——
const snapshot = {
    clock: { day: 5, minute: 500, label: '三年之约倒计时' },
    info: { era: '萧家废物时期', location: '乌坦城', weather: '晴', reputation: '乌坦城小有名气', wanted: '无' },
    nearEvents: [{ id: 'e3', day: 5, text: '城东连着三家铺子夜里失窃', basis: '最近几楼提到的失窃传闻', weight: 'rumor', done: false }],
    worldEvents: [],
};
const floors = Array.from({ length: 14 }, (_, index) => ({ role: index % 2 === 0 ? '玩家' : '角色', text: `第${index}楼的内容` }));
const user = buildDecideUser({ snapshot, floors, worldbookLines: ['123|物品|青莲地心火|异火榜第十九'] });
assert.ok(user.includes('【世界台账'), user.slice(0, 80));
assert.ok(user.includes('时钟：第 5 天 08:20'));
assert.ok(user.includes('名声：乌坦城小有名气；通缉度：无'), '现状要带名声/通缉');
assert.ok(user.includes('？(e3 第5天) 城东连着三家铺子夜里失窃（传闻·未证实）（依据：'), '传闻事件要带未证实标记');
assert.ok(user.includes('123|物品|青莲地心火|异火榜第十九'));
assert.ok(user.includes('【最近聊天记录（旧 → 新，共 12 楼）】'), '楼数上限 12，最新的留下');
assert.ok(user.includes('第13楼的内容') && user.includes('第2楼的内容'), '保留最新的 12 楼');
assert.ok(!user.includes('第1楼的内容') && !user.includes('第0楼的内容'), '最旧的两楼被裁掉');

// 空输入也有可读结构
const empty = buildDecideUser({});
assert.ok(empty.includes('- （本轮没有命中的世界书条目）'));
assert.ok(empty.includes('- （还没有聊天内容）'));

// —— 解析：正常 / fenced / 坏 JSON / 非对象 / 超量截断 / 坏条目过滤 ——
const good = parseDecision('{"note":"主角夜探案发现场","ops":[{"op":"advance","minutes":60},{"op":"addEvent","scope":"near","text":"巡卫封锁了城东三条街","basis":"失窃传闻升级","weight":"minor","days":2}]}');
assert.equal(good.status, 'ok');
assert.equal(good.note, '主角夜探案发现场');
assert.equal(good.ops.length, 2);
assert.equal(good.ops[1].weight, 'minor');

const fenced = parseDecision('说明文字\n```json\n{"note":"n","ops":[{"op":"resolveEvent","id":"e3"}]}\n```');
assert.equal(fenced.status, 'ok');
assert.equal(fenced.ops[0].id, 'e3');

assert.equal(parseDecision('完全不是 JSON').status, 'invalid');
assert.equal(parseDecision('["数组"]', ).status, 'invalid');
assert.equal(parseDecision('{"ops":[]}').status, 'empty');

const overflow = parseDecision(JSON.stringify({ note: 'x', ops: Array.from({ length: 20 }, () => ({ op: 'advance', days: 1 })) }));
assert.equal(overflow.ops.length, 12, '操作上限 12 条');

const mixed = parseDecision(JSON.stringify({ note: 'n', ops: [{ op: 'advance', days: 1 }, 'junk', { nope: 1 }, { op: 'addEvent', scope: 'near', text: '好条目' }] }));
assert.equal(mixed.ops.length, 2, '坏条目过滤、好条目保留');
assert.equal(mixed.dropped, 2);

console.log('world decide tests passed');
