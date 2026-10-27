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
assert.ok(user.includes('共 2 条：未了结 1、已发酵 0、已收场 1'));
assert.ok(user.includes('#i1'));
assert.ok(user.includes('原著·改写'));
assert.ok(!user.includes('floor-1 '), '太旧的楼层被截掉');
assert.ok(user.includes('floor-12'));
assert.ok(!user.includes('长'.repeat(701)), '单楼正文被截到 700 字');
assert.ok(!user.includes('entry-31'), '世界书条目最多 30 条');
assert.ok(user.includes('entry-30'));
assert.ok(user.includes('最近聊天记录（旧 → 新，共 10 楼）'));

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

const longNote = parseImpactDecision(`{"note":"${'字'.repeat(400)}","ops":[]}`);
assert.equal(longNote.note.length, 300);

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

console.log('impact decide tests passed');
