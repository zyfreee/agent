import assert from 'node:assert/strict';
import { buildSelfDecideUser, parseSelfDecision, SELF_DECIDE_PROMPT, SELF_JSON_SCHEMA } from '../self/self-decide.js';

// —— 决定提示词与 schema：脚本解析依赖的契约必须齐 ——
assert.ok(SELF_DECIDE_PROMPT.includes('"note"') && SELF_DECIDE_PROMPT.includes('"ops"'));
assert.ok(SELF_DECIDE_PROMPT.includes('斗之气'), '默认提示词给出境界阶梯');
assert.ok(SELF_DECIDE_PROMPT.includes('addItem'), '炼成后要补记行囊');
assert.ok(SELF_DECIDE_PROMPT.includes('有依据'), '默认提示词要求变化有依据');
for (const op of ['setProfile', 'setRealm', 'setGold', 'addGold', 'addTitle', 'removeTitle', 'addTechnique', 'updateTechnique', 'removeTechnique', 'addSkill', 'updateSkill', 'removeSkill', 'addItem', 'updateItem', 'removeItem', 'addRecipe', 'removeRecipe', 'startCraft', 'finishCraft', 'addGoal', 'finishGoal', 'removeGoal']) {
    assert.equal(SELF_JSON_SCHEMA.properties.ops.items.properties.op.enum.includes(op), true, `schema 缺操作 ${op}`);
}
assert.deepEqual(SELF_JSON_SCHEMA.required, ['ops']);

// —— 上下文组装：纳戒现状 + 世界书条目 + 聊天记录（旧→新），楼数与每楼长度受限 ——
const snapshot = {
    day: 5,
    profile: { name: '萧炎', gender: '男', age: '15岁' },
    realm: { realm: '斗之气', stage: '三段' },
    gold: 3200,
    titles: [], techniques: [], skills: [], items: [], crafts: [], goals: [],
};
const floors = Array.from({ length: 14 }, (_, index) => ({ role: index % 2 === 0 ? '玩家' : '角色', text: `第${index}楼的内容` }));
const user = buildSelfDecideUser({ snapshot, floors, worldbookLines: ['123|物品|青莲地心火|异火榜第十九'] });
assert.ok(user.includes('【纳戒现状'), user.slice(0, 80));
assert.ok(user.includes('境界：斗之气三段'));
assert.ok(user.includes('金币：3200'));
assert.ok(user.includes('123|物品|青莲地心火|异火榜第十九'));
assert.ok(user.includes('【最近聊天记录（旧 → 新，共 12 楼）】'), '楼数上限 12，最新的留下');
assert.ok(user.includes('第13楼的内容') && user.includes('第2楼的内容'), '保留最新的 12 楼');
assert.ok(!user.includes('第1楼的内容') && !user.includes('第0楼的内容'), '最旧的两楼被裁掉');

// 空输入也有可读结构
const empty = buildSelfDecideUser({});
assert.ok(empty.includes('- （本轮没有命中的世界书条目）'));
assert.ok(empty.includes('- （还没有聊天内容）'));

// —— 解析：正常 / 坏 JSON / 非对象 / 超量截断 / 坏条目过滤 ——
const good = parseSelfDecision('{"note":"主角战斗获胜突破斗者","ops":[{"op":"setRealm","realm":"斗者","stage":"一星"},{"op":"addTitle","text":"乌坦城新星"}]}');
assert.equal(good.status, 'ok');
assert.equal(good.note, '主角战斗获胜突破斗者');
assert.equal(good.ops.length, 2);

const invalid = parseSelfDecision('这不是 JSON');
assert.equal(invalid.status, 'invalid');
assert.ok(invalid.error);

const notObject = parseSelfDecision('[{"op":"addGold","amount":1}]');
assert.equal(notObject.status, 'empty', '数组输入会被对象抽取器截取，落到空决定');

const truncated = parseSelfDecision(JSON.stringify({ note: 'n', ops: Array.from({ length: 20 }, (_, index) => ({ op: 'addGold', amount: index })) }));
assert.equal(truncated.ops.length, 12, '一次最多 12 条');

const filtered = parseSelfDecision('{"note":"n","ops":[{"op":"addGold","amount":1},"garbage",{"no_op":true}]}');
assert.equal(filtered.ops.length, 1);
assert.equal(filtered.dropped, 2);

const emptyDecision = parseSelfDecision('{"note":"本轮纳戒无变化","ops":[]}');
assert.equal(emptyDecision.status, 'ok');
assert.equal(emptyDecision.ops.length, 0);

console.log('self decide tests passed');
