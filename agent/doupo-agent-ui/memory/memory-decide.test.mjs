import assert from 'node:assert/strict';
import { buildDecideUser, parseDecision, MEMORY_DECIDE_PROMPT, MEMORY_JSON_SCHEMA } from './memory-decide.js';

// 1. 默认提示词契约：两层分工、四条操作、召回钥匙、所有权边界、无变化输出
for (const keyword of ['remember', 'memorize', 'promote', 'forgetMemory', 'related', 'basis', 'quote', '小记忆', '大记忆', '人物簿', '纳戒', '"note"']) {
    assert.ok(MEMORY_DECIDE_PROMPT.includes(keyword), `默认提示词缺少：${keyword}`);
}
assert.ok(!MEMORY_DECIDE_PROMPT.includes('resolveMemory') && !MEMORY_DECIDE_PROMPT.includes('reopenMemory'), '记忆没有“了结”语义，不该再教模型了结');
assert.ok(MEMORY_DECIDE_PROMPT.includes('永久保存'), '不有过期语义');
assert.ok(!MEMORY_DECIDE_PROMPT.includes('淡出') && !MEMORY_DECIDE_PROMPT.includes('到期'), '不允许出现过期语义');
assert.deepEqual(MEMORY_JSON_SCHEMA.properties.ops.items.properties.op.enum, ['remember', 'memorize', 'promote', 'forgetMemory']);
assert.deepEqual(MEMORY_JSON_SCHEMA.properties.ops.items.properties.tag.enum, ['grudge', 'intel', 'thread', 'milestone']);

// 2. user 组装：本场召回、世界书条目、最近聊天（旧→新）、JSON 收尾
{
    const user = buildDecideUser({
        snapshot: { entries: [{ id: 'm1', tier: 'big', text: '穆蛇之辱', weight: 'major', day: 6, related: ['穆蛇'], basis: '', tag: 'grudge', done: false }] },
        floors: [
            { role: '玩家', text: '我在坊市又碰到了穆蛇。' },
            { role: '角色', text: '穆蛇拦住了去路。' },
        ],
        worldbookLines: ['11|势力|穆蛇|乌坦城地头蛇'],
    });
    assert.ok(user.includes('穆蛇之辱'), 'related 命中聊天文本，记忆被召回给决定模型');
    assert.ok(user.includes('11|势力|穆蛇|乌坦城地头蛇'));
    assert.ok(user.indexOf('我在坊市又碰到了穆蛇') < user.indexOf('穆蛇拦住了去路'), '聊天旧→新');
    assert.ok(user.includes('只输出 JSON'));
}

// related 不命中 → 决定输入里明确标注"没有勾起旧记忆"
{
    const user = buildDecideUser({
        snapshot: { entries: [{ id: 'm1', tier: 'big', text: '云韵之约', weight: 'major', day: 6, related: ['云韵'], basis: '', done: false }] },
        floors: [{ role: '玩家', text: '我在后山打坐。' }],
        worldbookLines: [],
    });
    assert.ok(user.includes('本场没有勾起任何旧记忆'));
    assert.ok(!user.includes('云韵之约'));
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
