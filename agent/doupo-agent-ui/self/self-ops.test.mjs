import assert from 'node:assert/strict';
import { buildSelfInjection, extractOpsBlock, parseOps, stripOpsBlock, SELF_GUIDE, SELF_HEADER } from '../self/self-ops.js';

// —— 指南与抬头：脚本解析依赖的契约必须齐 ——
assert.ok(SELF_GUIDE.includes('```self'), '指南必须给出 fenced 块格式');
assert.ok(SELF_GUIDE.includes('setRealm'), '指南必须列出境界操作');
assert.ok(SELF_GUIDE.includes('startCraft') && SELF_GUIDE.includes('finishCraft'), '指南必须列出制作台操作');
assert.ok(SELF_GUIDE.includes('addItem'), '指南必须写明炼成后补记行囊');
assert.ok(SELF_HEADER.startsWith('【主角纳戒】'));

// —— 注入文本：身份/境界/功法斗技/行囊/目标，一行一类 ——
const snapshot = {
    day: 5,
    profile: { name: '萧炎', gender: '男', age: '15岁', race: '人类', origin: '乌坦城萧家', affiliation: '', talent: '曾经的斗气天才', appearance: '黑色衣袍的清瘦少年' },
    realm: { realm: '斗之气', stage: '三段' },
    gold: 3200,
    titles: ['萧家废物'],
    techniques: [{ id: 't1', name: '焚决', grade: '黄阶低级', progress: '第三层' }],
    skills: [{ id: 's1', name: '八极崩', grade: '黄阶高级' }, { id: 's2', name: '吸掌', grade: '玄阶低级', progress: '入门' }],
    items: [
        { id: 'b1', name: '玄重尺', category: '武器', count: 1, equipped: true },
        { id: 'b2', name: '回气丹', category: '丹药', grade: '一品', count: 3 },
        { id: 'b3', name: '一阶魔核', category: '材料', count: 5 },
    ],
    crafts: [{ id: 'c1', name: '聚气散', craft: '炼药', count: 1, status: 'open', startDay: 4, endDay: 6 }],
    goals: [
        { id: 'g1', text: '三年之约，云岚宗一雪前耻', priority: '主线', due: '三年后', done: false },
        { id: 'g2', text: '凑齐焚决后续功法', priority: '支线', done: true },
        { id: 'g3', text: '在乌坦城站稳脚跟', priority: '支线', done: false },
    ],
};
const injection = buildSelfInjection(snapshot);
assert.ok(injection.includes('身份：萧炎，男，15岁；种族：人类；出身：乌坦城萧家；天赋：曾经的斗气天才'));
assert.ok(injection.includes('境界：斗之气三段'));
assert.ok(injection.includes('金币：3200'));
assert.ok(injection.includes('称号：萧家废物'));
assert.ok(injection.includes('功法：焚决（黄阶低级·第三层）'));
assert.ok(injection.includes('斗技：八极崩（黄阶高级）、吸掌（玄阶低级·入门）'));
assert.ok(injection.includes('装备中：玄重尺'), '装备中的单列');
assert.ok(!injection.includes('玄重尺×1'), '装备中不再进行囊');
assert.ok(injection.includes('行囊：一阶魔核×5、回气丹×3'), '行囊按数量从大到小');
assert.ok(injection.includes('进行中：炼药·聚气散（剩 2 天）'));
assert.ok(injection.includes('目标：★三年之约，云岚宗一雪前耻（三年后）；·在乌坦城站稳脚跟'), '主线排前，已达成的不进');
assert.ok(injection.includes('外貌：黑色衣袍的清瘦少年'));

// 空快照也有可读结构
const empty = buildSelfInjection({});
assert.ok(empty.includes('身份：'), empty);

// —— 预算：超支从末尾整行丢，身份行永远在 ——
const tiny = buildSelfInjection(snapshot, { maxChars: 200 });
assert.ok(tiny.startsWith('身份：萧炎'), tiny);
assert.ok(tiny.length <= 200 || tiny.split('\n').length === 1, tiny);

// —— 指令块：fenced 提取 / 裸行兜底 / 逐行解析 / 剥离 ——
const fenced = extractOpsBlock('剧情前文。\n```self\n{"op":"setRealm","realm":"斗者","stage":"一星"}\n{"op":"addGold","amount":100}\n```\n剧情后文。');
assert.equal(fenced.fenced, true);
const parsed = parseOps(fenced.raw);
assert.equal(parsed.ops.length, 2);
assert.equal(parsed.parseErrors.length, 0);

const bare = extractOpsBlock('剧情。 \n{"op":"addGold","amount":1}\n正文继续。');
assert.equal(bare.fenced, false);
assert.equal(parseOps(bare.raw).ops.length, 1);

const broken = parseOps('{"op":"addGold","amount":1}\n不是JSON\n{"not_op":1}\n{"op":"addItem","name":"回气丹"}');
assert.equal(broken.ops.length, 2);
assert.equal(broken.parseErrors.length, 2, JSON.stringify(broken.parseErrors));

const cleaned = stripOpsBlock('剧情。\n```self\n{"op":"addGold","amount":1}\n```\n');
assert.equal(cleaned, '剧情。');
assert.equal(stripOpsBlock('剧情。\n{"op":"addGold","amount":1}'), '剧情。', '裸行指令也剥掉');
assert.equal(stripOpsBlock('普通正文。'), '普通正文。', '没有指令原样返回');

console.log('self ops tests passed');
