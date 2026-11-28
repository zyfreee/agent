import assert from 'node:assert/strict';
import { IMPACT_DECIDE_PROMPT, IMPACT_JSON_SCHEMA, buildImpactDecideUser, parseImpactDecision } from '../impact/impact-decide.js';

const snapshot = {
    clock: { day: 12, minute: 480, label: '' },
    info: { weather: '晴', location: '乌坦城', era: '', reputation: '', wanted: '' },
    nearEvents: [],
    worldEvents: [],
    log: [],
    records: [
        { id: 'i1', day: 9, title: '拍卖场被砸', detail: '青灵丹被当众拍走', target: '乌坦城', kind: 'direct', weight: 'major', certainty: 'certain', evidence: '第 9 楼', canon: '退婚', shift: 'alter', state: 'active', ripenDay: null, resolution: '', parent: '', depth: 0 },
        { id: 'i2', day: 10, title: '旧账', detail: '已经被消化', target: '萧家', kind: 'direct', weight: 'minor', certainty: 'certain', evidence: '', canon: '', shift: 'none', state: 'closed', ripenDay: null, resolution: '赔钱了事', parent: '', depth: 0 },
    ],
};

const floors = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 ? '玩家' : '角色',
    text: `floor-${index + 1} ${'长'.repeat(900)}`,
}));
const user = buildImpactDecideUser({
    snapshot,
    floors,
    worldbookLines: Array.from({ length: 35 }, (_, index) => `entry-${index + 1}`),
});
assert.ok(user.includes('世界台账'));
assert.ok(user.includes('世界影响库'));
assert.ok(user.includes('共 2 条：未了结 1、埋着 0、已应验 0、已收场 1'));
assert.ok(user.includes('#i1'));
assert.ok(user.includes('原著·改写'));
// 2026-11-18 用户口径：正文后调用只读「用户输入＋正文」两楼、全文不截——组装层不再有楼数天花板。
assert.ok(user.includes('floor-1 '), '给几楼喂几楼，最旧的也在');
assert.ok(user.includes('floor-12'));
assert.ok(user.includes('长'.repeat(900)), '单楼正文全喂不截断');
// 2026-11-19 用户口径：决定喂料无限制——原著资料有几条给几条。
assert.ok(user.includes('entry-31'), '世界书条目不再截 30 条');
assert.ok(user.includes('entry-35'), '第 35 条也在');
assert.ok(user.includes('最近聊天记录（旧 → 新，共 12 楼）'));

const empty = buildImpactDecideUser({ snapshot: { ...snapshot, records: [] }, floors: [] });
assert.ok(empty.includes('本局还没有记录任何影响'));

const parsed = parseImpactDecision('```json\n{"note":"玩家的动作改了世界","ops":[{"op":"record","title":"新影响"},{"op":"bogus"},{"op":"ripen","ref":"i1"}]}\n```');
assert.equal(parsed.status, 'ok');
assert.equal(parsed.note, '玩家的动作改了世界');
assert.deepEqual(parsed.ops.map(op => op.op), ['record', 'ripen']);
assert.equal(parsed.dropped, 1);

const invalid = parseImpactDecision('我在想这件事该怎么写');
assert.equal(invalid.status, 'invalid');
assert.equal(invalid.ops.length, 0);

const emptyDecision = parseImpactDecision('{"ops":[]}');
assert.equal(emptyDecision.status, 'empty');

// 模型输出 note 限 300（用户口径 2026-11-17：API 输出要限定字数）
const longNote = parseImpactDecision(`{"note":"${'字'.repeat(400)}","ops":[]}`);
assert.equal(longNote.note.length, 300);

// 模型单次最多 6 条（手动面板不受限）
const manyOps = parseImpactDecision(JSON.stringify({ ops: Array.from({ length: 9 }, (_, index) => ({ op: 'record', title: `t${index}` })) }));
assert.equal(manyOps.ops.length, 6);
assert.equal(manyOps.dropped, 0);

assert.ok(IMPACT_DECIDE_PROMPT.includes('世界记录员'));
assert.ok(IMPACT_DECIDE_PROMPT.includes('"op":"record"'));
assert.ok(IMPACT_DECIDE_PROMPT.includes('"op":"adjust"'));
assert.deepEqual(IMPACT_JSON_SCHEMA.properties.ops.items.properties.op.enum, ['record', 'adjust', 'ripen', 'close', 'revert']);
assert.deepEqual(IMPACT_JSON_SCHEMA.properties.ops.items.properties.weight.enum, ['minor', 'major', 'world']);

const adjusted = parseImpactDecision('{"ops":[{"op":"adjust","ref":"i1","days":-3,"detail":"玩家烧了粮仓，事情提前"},{"op":"nope"}]}');
assert.deepEqual(adjusted.ops.map(op => op.op), ['adjust']);
assert.equal(adjusted.ops[0].days, -3);
assert.equal(adjusted.ops[0].ref, 'i1');
assert.equal(adjusted.dropped, 1);

// —— 结算裁定喂料：影响决定必须看到本轮判定的成败（BUG 1） ——
const settleUser = buildImpactDecideUser({ snapshot: { clock: { day: 12 }, records: [] }, floors: [{ role: '角色', text: '正文' }], settleLines: ['- 药铺购凝血草：失败（骰16-2 对难度 11）'] });
assert.ok(settleUser.includes('【本轮行动结算（生成前已判定，影响库只记与判定一致的世界变化）】'), '喂料带结算节');
assert.ok(settleUser.includes('药铺购凝血草'));
assert.ok(!buildImpactDecideUser({ snapshot: { clock: { day: 12 }, records: [] }, floors: [] }).includes('【本轮行动结算'), '没有结算时不出这一节');

// —— 牵涉与后果：schema 允许，解析时按上限截断，别让模型把账本撑爆 ——
assert.ok(IMPACT_DECIDE_PROMPT.includes('牵涉'));
assert.ok(IMPACT_DECIDE_PROMPT.includes('后果'));
const recordSchema = IMPACT_JSON_SCHEMA.properties.ops.items.properties;
assert.ok(recordSchema.links, 'schema 要有 links');
assert.ok(recordSchema.effects, 'schema 要有 effects');
assert.deepEqual(recordSchema.links.items.properties.type.enum, ['faction', 'place', 'person', 'thread', 'canon', 'event']);
assert.deepEqual(recordSchema.effects.items.properties.type.enum, ['event', 'info', 'faction', 'npc', 'self']);
// 五类后果在 schema 里都要有自己字段：npc 的 favor 与 self 的 amount/realm 缺了，
// 结构化输出后端就产不出合法的人物簿/纳戒后果（提示词教了，表不认）。
for (const key of ['favor', 'attitude', 'privateAttitude', 'appellation', 'note', 'injury', 'realm', 'location', 'doing', 'founded', 'dissolved']) {
    assert.ok(recordSchema.effects.items.properties[key], `effects.items 要有 ${key}`);
}
assert.deepEqual(recordSchema.effects.items.properties.presence.enum, ['在场', '不在场']);
for (const key of ['amount', 'count', 'realm', 'stage']) {
    assert.ok(recordSchema.effects.items.properties[key], `effects.items 要有 ${key}`);
}
assert.deepEqual(recordSchema.effects.items.properties.field.enum, ['reputation', 'wanted', 'gold', 'item', 'realm']);

const capped = parseImpactDecision(JSON.stringify({
    ops: [{
        op: 'record', title: '药材涨价', detail: 'd', target: '乌坦城',
        links: Array.from({ length: 8 }, (_, index) => ({ type: 'person', name: `人${index}-${'长'.repeat(40)}` })),
        effects: [
            { type: 'event', title: '长'.repeat(40), text: '长'.repeat(200), scope: 'world', participants: ['a', 'b', 'c', 'd', 'e'] },
            { type: 'info', field: 'reputation', value: '长'.repeat(80) },
            { type: 'faction', name: '加列家族', stance: 'wary', dynamics: '长'.repeat(90) },
            { type: 'faction', name: '萧家', stance: 'friendly' },
        ],
    }],
}));
assert.equal(capped.ops[0].links.length, 6, '牵涉最多 6 条');
assert.equal(capped.ops[0].links[0].name.length, 40);
assert.equal(capped.ops[0].effects.length, 3, '后果最多 3 条');
assert.equal(capped.ops[0].effects[0].title.length, 30);
assert.equal(capped.ops[0].effects[0].text.length, 120);
assert.equal(capped.ops[0].effects[0].participants.length, 3, '参与人最多 3 个');
assert.equal(capped.ops[0].effects[1].value.length, 80);
assert.equal(capped.ops[0].effects[2].dynamics.length, 90);

console.log('impact decide tests passed');
