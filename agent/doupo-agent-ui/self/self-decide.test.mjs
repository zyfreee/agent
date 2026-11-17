import assert from 'node:assert/strict';
import { buildSelfDecideUser, parseSelfDecision, SELF_DECIDE_PROMPT, SELF_JSON_SCHEMA } from '../self/self-decide.js';

// —— 决定提示词与 schema：脚本解析依赖的契约必须齐 ——
assert.ok(SELF_DECIDE_PROMPT.includes('"note"') && SELF_DECIDE_PROMPT.includes('"ops"'));
assert.ok(SELF_DECIDE_PROMPT.includes('斗之气'), '默认提示词给出境界阶梯');
assert.ok(SELF_DECIDE_PROMPT.includes('addItem'), '炼成后要补记行囊');
assert.ok(SELF_DECIDE_PROMPT.includes('有依据'), '默认提示词要求变化有依据');
for (const op of ['setProfile', 'setRealm', 'setGold', 'addGold', 'addTitle', 'removeTitle', 'addTechnique', 'updateTechnique', 'removeTechnique', 'addSkill', 'updateSkill', 'removeSkill', 'addEquipment', 'updateEquipment', 'removeEquipment', 'addItem', 'updateItem', 'removeItem', 'addRecipe', 'removeRecipe', 'startCraft', 'finishCraft', 'addGoal', 'finishGoal', 'removeGoal']) {
    assert.equal(SELF_JSON_SCHEMA.properties.ops.items.properties.op.enum.includes(op), true, `schema 缺操作 ${op}`);
}
assert.ok(SELF_DECIDE_PROMPT.includes('addEquipment'), '决定提示词必须列出装备栏操作');
assert.ok(SELF_DECIDE_PROMPT.includes('装备栏'), '决定提示词要写明装备栏归属');
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

// 最新楼是决定的正文靶子，字数窗口放宽到 6000，旧楼维持 800——验药、擦装备这类细节
// 段落都在正文的中后段，一刀 800 字账房就看不见了（2026-11-17 实跑：凝气固脉没进 effect）。
{
    const longTail = '甲'.repeat(7000) + '乙'.repeat(3000);
    const headUser = buildSelfDecideUser({
        snapshot,
        floors: [{ role: '玩家', text: '旧楼的短输入' }, { role: '角色', text: longTail }],
    });
    assert.ok(headUser.includes('甲'.repeat(6000)), '最新楼带满 6000 字窗口');
    assert.ok(!headUser.includes('甲'.repeat(6001)), '最新楼不超出 6000 字窗口');
    assert.ok(headUser.includes('旧楼的短输入'), '旧楼照常保留');
    const oldCapped = buildSelfDecideUser({
        snapshot,
        floors: [{ role: '玩家', text: '丙'.repeat(900) }, { role: '角色', text: '新楼' }],
    });
    assert.ok(!oldCapped.includes('丙'.repeat(801)), '旧楼维持 800 字截断');
}

// 空输入也有可读结构
const empty = buildSelfDecideUser({});
assert.ok(empty.includes('- （原著资料本轮还没有注入内容）'));
assert.ok(empty.includes('- （还没有聊天内容）'));

// —— 交卷自检点名：待补条目被正文提到，就点名逼模型先补 update；没提到的/已有详情的不点名 ——
{
    const thin = {
        ...snapshot,
        equipment: [{ id: 'b2', name: '玄重尺·焰陨玄铁', grade: '玄阶' }],
        items: [{ id: 'b5', name: '凝血散', grade: '一品', note: '瓷瓶装' }],
    };
    const mentioned = buildSelfDecideUser({ snapshot: thin, floors: [{ role: '玩家', text: '我把玄重尺·焰陨玄铁擦了一遍' }] });
    assert.ok(mentioned.includes('【交卷自检'), '被提到的待补条目要点名');
    assert.ok(mentioned.includes('玄重尺·焰陨玄铁'), '点名条目名');
    // 点名直接带上 id 与 update 操作名，省掉模型"猜操作猜 id"（2026-11-17 实跑：猜错 id 整条被拒）
    const selfCheckLine = mentioned.split('\n').find(line => line.includes('【交卷自检')) ?? '';
    assert.ok(selfCheckLine.includes('id b2') && selfCheckLine.includes('updateEquipment'), '点名带 id 与操作名');
    // 正文常只写短名不带全名（「玄重尺」vs「玄重尺·焰陨玄铁」），按「·」分段也能认出来
    const shortMention = buildSelfDecideUser({ snapshot: thin, floors: [{ role: '角色', text: '他取下玄重尺擦了擦尺身' }] });
    assert.ok(shortMention.split('\n').some(line => line.includes('【交卷自检') && line.includes('玄重尺·焰陨玄铁')), '短名正文也点得到全名条目');
    assert.ok(!selfCheckLine.includes('凝血散'), '有详情的条目不进自检名单');
    const silent = buildSelfDecideUser({ snapshot: thin, floors: [{ role: '玩家', text: '今晚只修炼，没碰装备' }] });
    assert.ok(!silent.includes('【交卷自检'), '正文没提到的待补条目不点名');
}

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

// 模型单次最多 12 条（手动面板不受限）
const truncated = parseSelfDecision(JSON.stringify({ note: 'n', ops: Array.from({ length: 20 }, (_, index) => ({ op: 'addGold', amount: index })) }));
assert.equal(truncated.ops.length, 12, '一次最多 12 条');

const filtered = parseSelfDecision('{"note":"n","ops":[{"op":"addGold","amount":1},"garbage",{"no_op":true}]}');
assert.equal(filtered.ops.length, 1);
assert.equal(filtered.dropped, 2);

const emptyDecision = parseSelfDecision('{"note":"本轮纳戒无变化","ops":[]}');
assert.equal(emptyDecision.status, 'ok');
assert.equal(emptyDecision.ops.length, 0);

// —— 结算裁定喂料：本轮已判定的行动成败必须进决定喂料，记账不能与判定相悖（BUG 1） ——
const settleUser = buildSelfDecideUser({ snapshot, floors, settleLines: ['- 药铺购凝血草：失败（骰16-2 对难度 11）；一枚金币没能成交'] });
assert.ok(settleUser.includes('【本轮行动结算（生成前已判定，记账须与此一致）】'), '喂料带结算节');
assert.ok(settleUser.includes('药铺购凝血草：失败'));
assert.ok(!buildSelfDecideUser({ snapshot, floors }).includes('【本轮行动结算'), '没有结算时不出这一节');


// —— 详情纪律收紧：六种描述性新增退出宽松分支，至少带一项细节才合法（与 details_missing 同口径） ——
{
    const anyOf = SELF_JSON_SCHEMA.properties.ops.items.anyOf;
    const laxBranch = anyOf.find(branch => branch.required?.length === 1 && branch.required[0] === 'op' && !branch.anyOf);
    for (const op of ['addTechnique', 'addSkill', 'addEquipment', 'addTreasure', 'addItem', 'addRecipe']) {
        assert.equal(laxBranch.properties.op.enum.includes(op), false, );
    }
    assert.equal(laxBranch.properties.op.enum.includes('updateSkill'), true, '修改类不强制详情');
    const detailBranch = anyOf.find(branch => Array.isArray(branch.anyOf));
    assert.ok(detailBranch, '六种新增的细节分支在');
    for (const field of ['effect', 'note', 'grade', 'source', 'progress']) {
        assert.equal(detailBranch.anyOf.some(sub => sub.required?.[0] === field), true, `${field} 可单独撑起细节分支`);
    }
    for (const op of ['addTechnique', 'addSkill', 'addEquipment', 'addTreasure', 'addItem', 'addRecipe']) {
        assert.equal(detailBranch.properties.op.enum.includes(op), true, );
    }
    assert.ok(SELF_DECIDE_PROMPT.includes('整条拒绝'), '决定提示词带拒绝警告');
    assert.ok(SELF_DECIDE_PROMPT.includes('详情待补'), '决定提示词解释待补标记');
    assert.ok(SELF_DECIDE_PROMPT.includes('买卖要两讫'), '决定提示词要求钱货两讫');
    assert.ok(SELF_DECIDE_PROMPT.includes('不要重复入账'), '决定提示词禁止重复记账');
    assert.ok(SELF_DECIDE_PROMPT.includes('交卷前自检'), '决定提示词带交卷自检');
}

console.log('self decide tests passed');
