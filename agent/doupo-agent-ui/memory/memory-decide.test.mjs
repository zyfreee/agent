import assert from 'node:assert/strict';
import { buildDecideUser, capRememberOps, parseDecision, MEMORY_DECIDE_PROMPT, MEMORY_JSON_SCHEMA } from './memory-decide.js';

// 1. 默认提示词契约：只记小记忆（大记忆由总结生成）、召回钥匙、所有权边界、无变化输出
for (const keyword of ['remember', 'forgetMemory', 'related', 'basis', 'quote', 'title', '小记忆', '大记忆', '人物簿', '纳戒', '"note"']) {
    assert.ok(MEMORY_DECIDE_PROMPT.includes(keyword), `默认提示词缺少：${keyword}`);
}
assert.ok(MEMORY_DECIDE_PROMPT.includes('title 必写'), '提示词要写明短标题必填（主页面只显示标题）');
assert.ok(MEMORY_DECIDE_PROMPT.includes('你没有 memorize/promote 这类操作'), '提示词要写明大记忆不归决定管');
assert.ok(!MEMORY_DECIDE_PROMPT.includes('promote(id)'), 'promote 已停用，不该再教模型');
assert.ok(!MEMORY_DECIDE_PROMPT.includes('resolveMemory') && !MEMORY_DECIDE_PROMPT.includes('reopenMemory'), '记忆没有“了结”语义，不该再教模型了结');
assert.ok(MEMORY_DECIDE_PROMPT.includes('永久保存'), '不有过期语义');
assert.ok(!MEMORY_DECIDE_PROMPT.includes('淡出') && !MEMORY_DECIDE_PROMPT.includes('到期'), '不允许出现过期语义');
assert.deepEqual(MEMORY_JSON_SCHEMA.properties.ops.items.properties.op.enum, ['remember', 'forgetMemory']);
assert.deepEqual(MEMORY_JSON_SCHEMA.properties.ops.items.properties.tag.enum, ['grudge', 'intel', 'thread', 'milestone']);
assert.ok('title' in MEMORY_JSON_SCHEMA.properties.ops.items.properties, 'schema 要放行 title 字段');

// 2. user 组装：现有记忆全清单（标题）、最近聊天（旧→新）、总结收尾；不再喂召回/世界书材料
{
    const user = buildDecideUser({
        snapshot: { entries: [{ id: 'm1', tier: 'big', title: '穆蛇之辱', text: '穆蛇当众羞辱主角', weight: 'major', day: 6, related: ['穆蛇'], basis: '', tag: 'grudge', done: false }] },
        floors: [
            { role: '玩家', text: '我在坊市又碰到了穆蛇。' },
            { role: '角色', text: '穆蛇拦住了去路。' },
        ],
    });
    assert.ok(user.includes('穆蛇之辱'), '现有记忆清单要列标题，模型才知道哪些近事已记过');
    assert.ok(!user.includes('穆蛇当众羞辱主角'), '清单只给标题，正文细节不进输入');
    assert.ok(user.indexOf('我在坊市又碰到了穆蛇') < user.indexOf('穆蛇拦住了去路'), '聊天旧→新');
    assert.ok(user.includes('总结对象=最后一楼正文'));
    assert.ok(user.includes('只输出 JSON'));
}

// 未命中/命中语义已废除：现有清单全量给标题，未命中条目细节不进输入；
// 提示词契约改为"总结本轮正文成恰好 1 条小记忆"。
{
    const user = buildDecideUser({
        snapshot: { entries: [{ id: 'm1', tier: 'big', title: '后山旧约', text: '云韵暂居后山静修', weight: 'major', day: 6, related: ['云韵'], basis: '', done: false }] },
        floors: [{ role: '玩家', text: '我在后山打坐。' }],
    });
    assert.ok(user.includes('后山旧约'), '现有记忆清单要列标题');
    assert.ok(!user.includes('云韵暂居后山静修'), '已有记忆的正文细节不进输入');
    assert.ok(MEMORY_DECIDE_PROMPT.includes('恰好 1 条 remember'), '提示词要写明每轮正文总结成恰好一条');
    assert.ok(MEMORY_DECIDE_PROMPT.includes('多余的小记忆会被脚本直接丢弃'), '提示词要写明超量直接丢弃');
    assert.ok(!MEMORY_DECIDE_PROMPT.includes('不必重要才记'), '旧的多记导向要移除');
}

// 楼层截断：最多 12 楼
{
    const floors = Array.from({ length: 20 }, (_, i) => ({ role: '角色', text: `楼${i}。` }));
    const user = buildDecideUser({ snapshot: {}, floors, worldbookLines: [] });
    assert.ok(user.includes('共 12 楼'));
    assert.ok(user.includes('楼19。'), '最后一楼保留');
    assert.ok(!user.includes('[角色] 楼7。'), '只取最近 12 楼，更早的楼层不进输入');
}

// 3. parseDecision：JSON 抽取、坏输出、条目过滤、上限
{
    const good = parseDecision('前言 {"note":"登记恩怨","ops":[{"op":"memorize","text":"新仇","related":["穆蛇"]},{"nonsense":true}],"extra":1} 后记');
    assert.equal(good.status, 'ok');
    assert.equal(good.ops.length, 1, '没有 op 字段的条目被丢弃');
    assert.equal(good.note, '登记恩怨');
    assert.equal(parseDecision('完全不是 JSON').status, 'invalid');
    assert.equal(parseDecision('"只是个字符串"').status, 'invalid');
    const empty = parseDecision('{"note":"本轮无新记忆","ops":[]}');
    assert.equal(empty.status, 'ok', '有 note 无 ops 也是有效决定');
    assert.equal(empty.ops.length, 0);
    const flooded = parseDecision(JSON.stringify({ note: '', ops: Array.from({ length: 30 }, (_, i) => ({ op: 'remember', text: `t${i}`, related: ['x'] })) }));
    assert.equal(flooded.ops.length, 12, '决定最多 12 条');
}

// 每轮小记忆硬上限：remember 只收第 1 条，多余的丢弃；forget 等其他操作不受影响。
{
    const capped = capRememberOps([
        { op: 'remember', text: '第一条', related: ['x'] },
        { op: 'forgetMemory', id: 'm9' },
        { op: 'remember', text: '第二条换个措辞', related: ['x'] },
        { op: 'remember', text: '第三条', related: ['x'] },
    ], 1);
    assert.deepEqual(capped.ops, [
        { op: 'remember', text: '第一条', related: ['x'] },
        { op: 'forgetMemory', id: 'm9' },
    ]);
    assert.equal(capped.dropped, 2, '同轮换措辞的重记被丢弃');
    assert.deepEqual(capRememberOps([], 1), { ops: [], dropped: 0 });
    assert.deepEqual(capRememberOps(undefined, 1), { ops: [], dropped: 0 });
    const big = capRememberOps([{ op: 'remember', text: '唯一一条', related: ['x'] }], 1);
    assert.equal(big.dropped, 0, '单条不受限');
}

// 待整合小记忆输入段 + consolidate 字段透传
{
    const snapshot = { entries: [
        { id: 'm1', tier: 'small', title: '客栈清点', text: '主角清点钱袋', related: ['钱袋'], day: 1 },
        { id: 'm2', tier: 'small', title: '药铺购丹', text: '主角购得回气丹', related: ['回气丹'], day: 1 },
        { id: 'm3', tier: 'big', title: '欠账伏笔', text: '欠独眼商人两枚金币', related: ['独眼商人'], day: 1 },
    ] };
    const user = buildDecideUser({ snapshot, floors: [{ role: '玩家', text: '我去还钱。' }], consolidateIds: ['m1', 'm2'] });
    assert.ok(user.includes('【待整合小记忆'), '整合候选要有专属输入段');
    assert.ok(user.includes('- m1|客栈清点') && user.includes('- m2|药铺购丹'), '候选带编号与标题');
    const pendingSection = user.split('【待整合小记忆')[1] || '';
    assert.ok(pendingSection.includes('- m1|客栈清点') && pendingSection.includes('- m2|药铺购丹'));
    assert.ok(!pendingSection.includes('m3'), '非候选（大记忆）不进待整合段');
    const noConsolidate = buildDecideUser({ snapshot, floors: [{ role: '玩家', text: '我去还钱。' }] });
    assert.ok(!noConsolidate.includes('【待整合小记忆'), '不到阈值就没有整合段');
}
{
    const parsed = parseDecision(JSON.stringify({
        note: '本轮总结并整合',
        ops: [{ op: 'remember', title: '两枚金币清账', text: '主角还清欠账', related: ['独眼商人'], basis: '本轮正文' }],
        consolidate: { ids: ['m1', 'm2', 'mX'], title: '清账与买丹', text: '主角赊丹又还清，期间购得回气丹', related: ['独眼商人'], aliases: ['回气丹'], weight: 'major' },
    }));
    assert.equal(parsed.status, 'ok');
    assert.ok(parsed.consolidate);
    assert.deepEqual(parsed.consolidate.ids, ['m1', 'm2', 'mX'], '编号原样透传，脚本侧再与候选收口');
    assert.equal(parsed.consolidate.title, '清账与买丹');
    assert.equal(parsed.consolidate.weight, 'major');
    const without = parseDecision('{"note":"只总结","ops":[]}');
    assert.equal(without.consolidate, null, '没有待整合就没有该字段');
    const badShape = parseDecision(JSON.stringify({ note: '', ops: [], consolidate: { ids: [] } }));
    assert.equal(badShape.consolidate, null, '缺标题/正文的整合形状不收');
}
