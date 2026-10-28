import assert from 'node:assert/strict';
import { createSelfRuntime } from '../self/self-runtime.js';

const runtime = createSelfRuntime({ now: () => 't0' });

// —— 身份档案与境界 ——
let result = runtime.apply([
    { op: 'setProfile', field: 'name', text: '萧炎' },
    { op: 'setProfile', field: 'age', text: '15岁' },
    { op: 'setProfile', field: 'appearance', text: '黑色衣袍的清瘦少年'.repeat(20) },
    { op: 'setProfile', field: 'mood', text: '坏字段' },
    { op: 'setRealm', realm: '斗之气', stage: '三段' },
    { op: 'setRealm', realm: '' },
    { op: 'setRealm', realm: 'x'.repeat(20) },
], { source: 'llm', floor: 1, day: 3 });
assert.equal(result.status, 'applied');
assert.deepEqual(result.rejected.map(item => item.reason), ['bad_field', 'realm_missing', 'realm_too_long']);
assert.equal(runtime.status().profile.name, '萧炎');
assert.equal(runtime.status().profile.age, '15岁');
assert.equal(runtime.snapshot().profile.appearance.length, 160, '外貌限长 160');
assert.deepEqual(runtime.status().realm, { realm: '斗之气', stage: '三段' });

// —— 金币与称号 ——
result = runtime.apply([
    { op: 'setGold', amount: 100 },
    { op: 'addGold', amount: 500 },
    { op: 'addGold', amount: -200 },
    { op: 'addGold', amount: 0 },
    { op: 'addGold', amount: -99999 },
    { op: 'addTitle', text: '萧家废物' },
    { op: 'addTitle', text: '萧家废物' },
    { op: 'removeTitle', text: '没有的称号' },
], { source: 'llm', floor: 2, day: 3 });
assert.equal(result.applied.length, 5, JSON.stringify(result));
assert.equal(runtime.status().gold, 0, '金币扣到 0 为下限');
assert.deepEqual(runtime.snapshot().titles, ['萧家废物']);

// —— 功法 / 斗技：新增、去重、修改、删除 ——
result = runtime.apply([
    { op: 'addTechnique', name: '焚决', grade: '黄阶低级', type: '修炼功法', progress: '第三层', source: '药老所赠' },
    { op: 'addTechnique', name: '焚决', progress: '第四层' },
    { op: 'addSkill', name: '八极崩', grade: '黄阶高级', type: '攻击' },
    { op: 'addSkill', name: '' },
], { source: 'llm', floor: 3, day: 4 });
assert.equal(result.applied.length, 2);
assert.equal(result.rejected[0].reason, 'duplicate', '同名功法不重录');
assert.equal(result.rejected[1].reason, 'name_missing');
const techniqueId = runtime.snapshot().techniques[0].id;
result = runtime.apply([
    { op: 'updateTechnique', id: techniqueId, progress: '第四层', grade: '玄阶' },
    { op: 'updateTechnique', id: 't999', progress: 'x' },
], { source: 'llm', floor: 4, day: 4 });
assert.equal(result.applied.length, 1);
assert.equal(runtime.snapshot().techniques[0].progress, '第四层');
assert.equal(runtime.snapshot().techniques[0].grade, '玄阶');

// —— 行囊：合并、消耗、用光移除、装备标记 ——
result = runtime.apply([
    { op: 'addItem', name: '回气丹', category: '丹药', count: 3 },
    { op: 'addItem', name: '回气丹', category: '丹药', count: 2 },
    { op: 'addItem', name: '回气丹', category: '材料', count: 1 },
    { op: 'addItem', name: '玄重尺', category: '武器', count: 1 },
    { op: 'updateItem', id: 'b3', equipped: true },
    { op: 'removeItem', id: 'b1', count: 4 },
    { op: 'removeItem', id: 'b1', count: 1 },
    { op: 'removeItem', id: 'b1' },
], { source: 'llm', floor: 5, day: 5 });
assert.equal(result.applied.length, 7, JSON.stringify(result));
assert.deepEqual(result.rejected.map(item => item.reason), ['id_not_found']);
const bag = runtime.snapshot().items;
assert.equal(bag.find(item => item.name === '回气丹' && item.category === '丹药'), undefined, '扣到 0 移除');
assert.equal(bag.find(item => item.name === '回气丹' && item.category === '材料').count, 1, '不同类别各记各的');
assert.equal(bag.find(item => item.equipped).name, '玄重尺');
result = runtime.apply([{ op: 'updateItem', id: 'b2', count: 0 }], { source: 'llm', floor: 6, day: 5 });
assert.equal(result.applied.length, 1, '数量改 0 等于用光');
assert.equal(runtime.snapshot().items.some(item => item.id === 'b2'), false);

// —— 制作台：开工、时限、出炉 ——
result = runtime.apply([
    { op: 'startCraft', name: '聚气散', craft: '炼药', days: 3 },
    { op: 'startCraft', name: '聚气散', craft: '炼药', days: 3 },
    { op: 'startCraft', name: '玄重铠', craft: '炼器' },
    { op: 'finishCraft', id: 'c1', result: 'fail' },
    { op: 'finishCraft', id: 'c1', result: 'success' },
    { op: 'finishCraft', id: 'c2', result: 'burn' },
], { source: 'llm', floor: 7, day: 10 });
assert.equal(result.applied.length, 3, JSON.stringify(result));
assert.deepEqual(result.rejected.map(item => item.reason), ['duplicate', 'already_finished', 'bad_result']);
const jobs = runtime.snapshot().crafts;
assert.equal(jobs.find(job => job.id === 'c1').status, 'fail');
assert.equal(jobs.find(job => job.id === 'c2').endDay, null, '不带 days 就没有预计完成日');
assert.equal(runtime.status().crafting, 1);
assert.ok(runtime.craftLine(jobs.find(job => job.id === 'c2')).includes('炼器·玄重铠'), runtime.craftLine(jobs[1]));

// —— 目标 ——
result = runtime.apply([
    { op: 'addGoal', text: '三年之约，云岚宗一雪前耻', priority: '主线', due: '三年后' },
    { op: 'addGoal', text: '凑齐焚决后续功法' },
    { op: 'addGoal', text: '' },
    { op: 'finishGoal', id: 'g2' },
    { op: 'removeGoal', id: 'g2' },
    { op: 'removeGoal', id: 'g2' },
], { source: 'llm', floor: 8, day: 11 });
assert.equal(result.applied.length, 4, JSON.stringify(result));
assert.deepEqual(result.rejected.map(item => item.reason), ['text_missing', 'id_not_found']);
const goals = runtime.snapshot().goals;
assert.equal(goals.length, 1);
assert.equal(goals[0].priority, '主线');
assert.equal(runtime.status().goals, 1);

// —— 同楼重 roll：上一版指令先撤销 ——
const before = runtime.snapshot();
result = runtime.apply([{ op: 'addGold', amount: 100 }, { op: 'addTitle', text: '乌坦城新星' }], { source: 'llm', floor: 9, day: 12 });
assert.equal(result.applied.length, 2);
result = runtime.apply([{ op: 'addGold', amount: 1 }], { source: 'llm', floor: 9, day: 12 });
assert.equal(runtime.status().gold, 1, '上一版 +100 已撤销');
assert.equal(runtime.snapshot().titles.includes('乌坦城新星'), false, '上一版称号已撤销');
assert.equal(runtime.journal()[0].source, 'llm');

// —— 撤销恢复保留原编号，发号器同步前进 ——
const techniqueCount = runtime.snapshot().techniques.length;
result = runtime.apply([{ op: 'removeTechnique', id: techniqueId }], { source: 'llm', floor: 10, day: 12 });
assert.equal(runtime.snapshot().techniques.length, techniqueCount - 1);
result = runtime.apply([{ op: 'addSkill', name: '吸掌', grade: '玄阶低级' }], { source: 'llm', floor: 10, day: 12 });
assert.equal(runtime.snapshot().techniques.length, techniqueCount, '重 roll 撤销把功法还了回来');
const skillIds = runtime.snapshot().skills.map(item => item.id);
assert.equal(new Set(skillIds).size, skillIds.length, '编号不重复');

// —— 坏操作只拒绝不炸 ——
result = runtime.apply(['garbage', null, { op: 'nope' }, {}], { source: 'llm' });
assert.equal(result.status, 'rejected');
assert.deepEqual(result.rejected.map(item => item.reason), ['bad_op_shape', 'bad_op_shape', 'unknown_op', 'unknown_op']);

// —— 恢复/重置：坏数据丢弃，发号器对齐 ——
const snapshot = runtime.snapshot();
snapshot.techniques.push({ id: 't7', name: '风之极' });
snapshot.items.push({ name: '' });
snapshot.gold = -5;
const restored = createSelfRuntime({ now: () => 't1' });
const restoredResult = restored.restore(snapshot);
assert.equal(restoredResult.status, 'restored');
assert.equal(restored.snapshot().techniques.some(item => item.id === 't7'), true);
assert.equal(restored.snapshot().gold, 0, '负数金币清洗为 0');
assert.equal(restored.snapshot().items.some(item => item.id === 'b999'), false, '坏条目丢弃');
const followUp = restored.apply([{ op: 'addTechnique', name: '新功法' }], { source: 'llm' });
assert.equal(followUp.applied[0].id, 't8', '发号器跳过恢复进来的编号');
restored.reset();
assert.equal(restored.status().techniques, 0);
assert.equal(restored.snapshot().profile.name, '');

// —— note 只记流水不改状态 ——
assert.equal(restored.note('本轮纳戒无变化。').status, 'noted');
assert.equal(restored.journal()[0].summaries[0], '本轮纳戒无变化。');
assert.equal(restored.status().gold, 0);

console.log('self runtime tests passed');
