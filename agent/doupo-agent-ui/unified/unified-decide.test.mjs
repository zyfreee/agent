import assert from 'node:assert/strict';
import { UNIFIED_DECIDE_PROMPT, UNIFIED_JSON_SCHEMA, buildUnifiedDecideUser, parseUnifiedDecision } from './unified-decide.js';

// ---------- 提示词与 Schema：两侧操作字典齐全，输出格式是三桶 ----------

assert.ok(UNIFIED_DECIDE_PROMPT.includes('"self":{"ops":'), '提示词要写明 self 桶格式');
assert.ok(UNIFIED_DECIDE_PROMPT.includes('"memory":{"ops":'), '提示词要写明 memory 桶格式');
assert.ok(UNIFIED_DECIDE_PROMPT.includes('"cited"'), '提示词要写明 cited 桶格式');
assert.ok(UNIFIED_DECIDE_PROMPT.includes('setProfile'), '纳戒操作字典要在提示词里');
assert.ok(UNIFIED_DECIDE_PROMPT.includes('memorize'), '记忆操作字典要在提示词里');
assert.ok(UNIFIED_DECIDE_PROMPT.includes('related 必写 1-4'), 'related 规则要带上');

const selfItem = UNIFIED_JSON_SCHEMA.properties.self.properties.ops.items;
const memoryItem = UNIFIED_JSON_SCHEMA.properties.memory.properties.ops.items;
assert.ok(selfItem.properties.op.enum.includes('setRealm'), 'self 桶 schema 带纳戒操作枚举');
assert.ok(memoryItem.properties.op.enum.includes('remember'), 'memory 桶 schema 带记忆操作枚举');
assert.equal(UNIFIED_JSON_SCHEMA.properties.cited.type, 'array');

// ---------- parseUnifiedDecision ----------

// 合法输出：三桶齐全，两侧 note 保留
{
    const raw = JSON.stringify({
        note: '比武获胜，与加列奥家怨隙加深',
        self: { note: '收获金币丹药', ops: [{ op: 'addGold', amount: 50 }] },
        memory: { note: '记一条恩怨', ops: [{ op: 'memorize', text: '集市比武击败加列奥家管事', related: ['加列奥'] }] },
        cited: [' m3 ', 'm7', '', 42],
    });
    const decision = parseUnifiedDecision(raw);
    assert.equal(decision.status, 'ok');
    assert.equal(decision.note, '比武获胜，与加列奥家怨隙加深');
    assert.equal(decision.selfNote, '收获金币丹药');
    assert.equal(decision.memoryNote, '记一条恩怨');
    assert.equal(decision.selfOps.length, 1);
    assert.equal(decision.selfOps[0].op, 'addGold');
    assert.equal(decision.memoryOps.length, 1);
    assert.deepEqual(decision.cited, ['m3', 'm7'], 'cited 去空白、丢非字符串');
}

// 代码块包裹 + 前后废话也能抽出来
{
    const raw = '好的，以下是决定：\n```json\n{"note":"n","self":{"ops":[]},"memory":{"ops":[{"op":"remember","text":"买了包子","related":["包子铺"]}]},"cited":[]}\n```\n以上。';
    const decision = parseUnifiedDecision(raw);
    assert.equal(decision.status, 'ok');
    assert.equal(decision.memoryOps.length, 1);
    assert.equal(decision.selfOps.length, 0);
    assert.deepEqual(decision.cited, []);
}

// 单侧是坏的形状：坏条目被滤掉、好条目保留（不整体失败）
{
    const raw = JSON.stringify({
        note: 'n',
        self: { ops: [null, 'x', { op: ' ' }, { op: 'addGold', amount: 1 }] },
        memory: { ops: [{ text: '没有 op 字段' }] },
    });
    const decision = parseUnifiedDecision(raw);
    assert.equal(decision.status, 'ok');
    assert.equal(decision.selfOps.length, 1);
    assert.equal(decision.memoryOps.length, 0);
}

// 全空：状态 empty；非 JSON / 非对象：invalid
assert.equal(parseUnifiedDecision(JSON.stringify({ note: '', self: { ops: [] }, memory: { ops: [] }, cited: [] })).status, 'empty');
assert.equal(parseUnifiedDecision('这不是 JSON').status, 'invalid');
assert.equal(parseUnifiedDecision('[1,2,3]').status, 'invalid');
assert.equal(parseUnifiedDecision('').status, 'invalid');

// ops 超长截到 12 条（不因多而炸）
{
    const ops = Array.from({ length: 20 }, (_, i) => ({ op: 'addTitle', text: `称号${i}` }));
    const decision = parseUnifiedDecision(JSON.stringify({ note: 'n', self: { ops }, memory: { ops: [] }, cited: [] }));
    assert.equal(decision.selfOps.length, 12);
}

// ---------- buildUnifiedDecideUser ----------

const selfSnapshot = {
    schemaVersion: 1, day: 12,
    profile: { name: '萧炎', gender: '男', age: '16', race: '人族', origin: '萧家', affiliation: '', attribute: '', talent: '', appearance: '' },
    realm: { realm: '斗之气', stage: '三段' },
    gold: 120, titles: [], techniques: [], skills: [],
    items: [{ id: 'b1', name: '回气丹', category: '丹药', grade: '一品', count: 2, equipped: false, source: '' }],
    recipes: [], crafts: [], goals: [], log: [], updatedAt: '',
};
const memorySnapshot = {
    schemaVersion: 2,
    entries: [
        { id: 'm3', tier: 'big', text: '与加列奥家在集市结过怨', quote: '', basis: '旧事', related: ['加列奥'], aliases: [], weight: 'major', tag: 'grudge', day: 9, done: false, resolvedDay: null, note: '', recallCount: 1, lastRecallDay: 9 },
    ],
    log: [], updatedAt: '',
};
{
    const user = buildUnifiedDecideUser({
        selfSnapshot,
        memorySnapshot,
        floors: [
            { role: '角色', text: '萧炎在集市与加列奥家管事起了冲突。' },
            { role: '玩家', text: '我盯着他看。' },
        ],
        worldbookLines: ['12|势力|加列奥家族|乌坦城三大家族之一'],
    });
    assert.ok(user.includes('【纳戒现状'), 'user 要带纳戒现状块');
    assert.ok(user.includes('【主角记忆'), 'user 要带本场召回的记忆块');
    assert.ok(user.includes('与加列奥家在集市结过怨'), '命中的旧记忆要出现（给 cited 选题用）');
    assert.ok(user.includes('【世界书资料'), 'user 要带世界书块');
    assert.ok(user.includes('加列奥家族'), '命中的世界书条目要出现');
    assert.ok(user.includes('【最近聊天记录'), 'user 要带聊天块');
    assert.ok(user.includes('[角色] 萧炎在集市与加列奥家管事起了冲突。'), '楼层按角色标注');
    assert.ok(user.includes('[玩家] 我盯着他看。'), '玩家楼层也要标注');
    assert.ok(user.includes('"cited":["m1","m2"]'), '结尾要有输出格式示例');
}

// 没有命中时：记忆块给占位文案、世界书块给占位行
{
    const user = buildUnifiedDecideUser({ selfSnapshot, memorySnapshot: { schemaVersion: 2, entries: [], log: [], updatedAt: '' }, floors: [], worldbookLines: [] });
    assert.ok(user.includes('（本场没有勾起任何旧记忆）'));
    assert.ok(user.includes('（本轮没有命中的世界书条目）'));
    assert.ok(user.includes('（还没有聊天内容）'));
}

console.log('unified-decide.test.mjs 通过');
