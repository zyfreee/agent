import assert from 'node:assert/strict';
import { SETTLE_CATEGORIES, checkEffects, parseRealm, realmStep, resolveCategory } from './settle-categories.js';

// 类别登记完整：四类各有提示词与复核函数。
assert.equal(SETTLE_CATEGORIES.length, 4);
for (const category of SETTLE_CATEGORIES) {
    assert.equal(typeof category.prompt, 'string');
    assert.ok(category.prompt.includes('JSON'), `${category.id} 提示词必须约束只输出 JSON`);
    assert.equal(typeof category.check, 'function', `${category.id} 必须有复核函数`);
}
assert.equal(resolveCategory('alchemy').label, '丹药判定');
assert.equal(resolveCategory('nope'), null);
assert.equal(resolveCategory(''), null);
assert.equal(resolveCategory(undefined), null);

// 境界解析：中文数字、阿拉伯数字、长名优先。
assert.deepEqual(parseRealm('斗之气三段'), { realm: 0, sub: 3 });
assert.deepEqual(parseRealm('斗者1星'), { realm: 1, sub: 1 });
assert.deepEqual(parseRealm('大斗师二星'), { realm: 3, sub: 2 }, '大斗师不能被当成斗师');
assert.deepEqual(parseRealm('斗帝九星'), { realm: 10, sub: 9 });
assert.equal(parseRealm('斗师'), null, '没有段/星数字认不出');
assert.equal(parseRealm('斗之气十段'), null, '超出 1-9 认不出');
assert.equal(parseRealm(''), null);

// 境界推进：同境界限三星，突破须圆满，禁止跳级与倒退。
assert.equal(realmStep('斗之气三段', '斗之气五段').ok, true);
assert.equal(realmStep('斗之气三段', '斗之气七段').ok, false, '同境界一次至多三星');
assert.equal(realmStep('斗之气九段', '斗者一星').ok, true, '九段圆满可突破');
assert.equal(realmStep('斗之气三段', '斗者一星').ok, false, '未圆满不得突破');
assert.equal(realmStep('斗之气九段', '斗师一星').ok, false, '不允许跳越大境界');
assert.equal(realmStep('斗师二星', '斗者九星').ok, false, '境界不能倒退');
assert.equal(realmStep('斗之气三段', '随便写的').ok, false, '认不出的写法拒绝');

const state = { player: { realm: '斗之气三段' } };

// 丹药判定：hp/douqi/gold 限幅内放行，set 与越界、改境界拒绝。
const alchemy = checkEffects('alchemy', [
    { targetId: 'player', field: 'douqi', type: 'add', value: 30 },
    { targetId: 'player', field: 'hp', type: 'set', value: 120 },
    { targetId: 'player', field: 'douqi', type: 'add', value: 500 },
    { targetId: 'player', field: 'realm', type: 'set', value: '斗者一星' },
    { targetId: 'player', field: 'gold', type: 'add', value: -50 },
], state);
assert.deepEqual(alchemy.effects, [
    { targetId: 'player', field: 'douqi', type: 'add', value: 30 },
    { targetId: 'player', field: 'gold', type: 'add', value: -50 },
]);
assert.equal(alchemy.rejected.length, 3);
assert.ok(alchemy.rejected.some(item => item.reason.includes('不直接设定')));
assert.ok(alchemy.rejected.some(item => item.reason.includes('不超过 300')));
assert.ok(alchemy.rejected.some(item => item.reason.includes('突破归修炼判定')));

// 修炼判定：douqi 限幅、境界走阶梯、其他字段拒绝。
const cultivation = checkEffects('cultivation', [
    { targetId: 'player', field: 'douqi', type: 'add', value: 60 },
    { targetId: 'player', field: 'realm', type: 'set', value: '斗之气五段' },
    { targetId: 'player', field: 'realm', type: 'set', value: '斗之气九段' },
    { targetId: 'player', field: 'realm', type: 'set', value: '斗者一星' },
    { targetId: 'player', field: 'hp', type: 'add', value: -10 },
], state);
assert.equal(cultivation.effects.length, 2);
assert.equal(cultivation.rejected.length, 3);
assert.ok(cultivation.rejected.some(item => item.reason.includes('至多推进三星')));
assert.ok(cultivation.rejected.some(item => item.reason.includes('九段/九星圆满')));

// 伤害判定：hp/douqi 只减不增、限幅；名声可小幅变化。
const combat = checkEffects('combat', [
    { targetId: 'player', field: 'hp', type: 'add', value: -80, allowNegative: true },
    { targetId: 'player', field: 'douqi', type: 'add', value: -20, allowNegative: true },
    { targetId: 'player', field: 'hp', type: 'add', value: 30 },
    { targetId: 'player', field: 'hp', type: 'add', value: -900, allowNegative: true },
    { targetId: 'player', field: 'reputation', type: 'add', value: 10 },
    { targetId: 'player', field: 'realm', type: 'set', value: '斗者一星' },
], state);
assert.equal(combat.effects.length, 3);
assert.equal(combat.rejected.length, 3);
assert.ok(combat.rejected.some(item => item.reason.includes('只减不增')));
assert.ok(combat.rejected.some(item => item.reason.includes('伤害不超过 500')));

// 通用判定：gold/reputation/location 放行，hp/douqi/realm 拒绝。
const general = checkEffects('general', [
    { targetId: 'player', field: 'gold', type: 'add', value: -120 },
    { targetId: 'player', field: 'location', type: 'set', value: '魔炎谷' },
    { targetId: 'player', field: 'douqi', type: 'add', value: 5 },
    { targetId: 'player', field: 'realm', type: 'set', value: '斗者一星' },
], state);
assert.equal(general.effects.length, 2);
assert.equal(general.rejected.length, 2);

// 未识别类别不设限（兼容旧的 interpret 输出）。
const passthrough = checkEffects('', [{ targetId: 'player', field: 'hp', type: 'set', value: 1 }], state);
assert.equal(passthrough.effects.length, 1);
assert.equal(passthrough.rejected.length, 0);
// 非数组输入不炸。
assert.deepEqual(checkEffects('alchemy', null, state), { effects: [], rejected: [] });

console.log('settle categories tests passed');
