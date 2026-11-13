import assert from 'node:assert/strict';
import {
    shouldVerify, buildVerifyUser, buildVerifyRetryUser, parseVerifyReply,
    createVerifyLedger, normalizeVerifyLedger, buildVerifyEntries, mergeVerifyEntries,
    markEntryFalsePositive, addExemption, isExemptEntry, exemptKeyOf,
    listOpenFindings, isVerbatimCopy, VERIFY_ENTRIES_MAX,
} from './verify-claims.js';

// ---------- 快筛 shouldVerify ----------

const prose = '萧炎盘膝而坐，体内的斗之气缓缓流转，三枚回气丹在行囊里安静躺着。云韵站在崖边看着远方。';
const gateOn = shouldVerify({ text: prose, supplyKeys: ['回气丹'], npcNames: ['云韵'], gate: true });
assert.equal(gateOn.status, 'ok');
assert.ok(gateOn.hits.some(hit => hit.startsWith('entry:') || hit.startsWith('npc:') || hit === 'realm' || hit === 'quantity'));
assert.equal(shouldVerify({ text: prose, supplyKeys: [], npcNames: [], gate: true }).status, 'ok', '境界词与数量词应命中');
assert.equal(shouldVerify({ text: '今天天气不错，两人聊了聊天。', supplyKeys: [], npcNames: [], gate: true }).status, 'skipped', '闲聊楼层不该触发');
assert.equal(shouldVerify({ text: '', supplyKeys: ['回气丹'], npcNames: [], gate: true }).status, 'skipped');
const gateOff = shouldVerify({ text: '今天天气不错。', supplyKeys: [], npcNames: [], gate: false });
assert.equal(gateOff.status, 'ok');
assert.deepEqual(gateOff.hits, ['gate_off']);
// 两字以下的 key 不参与快筛（防误触发）
assert.equal(shouldVerify({ text: '他说了句话。', supplyKeys: ['他'], npcNames: [], gate: true }).status, 'skipped');

// ---------- 材料拼装 buildVerifyUser ----------

const user = buildVerifyUser({
    floors: [{ role: '角色', text: '萧炎突破到了斗者三星。' }, { role: '玩家', text: '我继续修炼。' }],
    injectedText: '[11] 青莲地心火：异火榜第十九。',
    worldLines: '第 12 天 · 春 · 氛围平静',
    selfLines: '境界：斗者三星｜金币：120',
    npcLines: '云韵（在场，好感 +6）',
});
assert.match(user, /【最近正文】/);
assert.match(user, /【玩家】我继续修炼/);
assert.match(user, /\[11\] 青莲地心火/);
assert.match(user, /【世界现状】/);
assert.match(user, /【纳戒现状】/);
assert.match(user, /【人物现状】/);
const emptyUser = buildVerifyUser({ floors: [], injectedText: '', worldLines: '', selfLines: '', npcLines: '' });
assert.match(emptyUser, /三本台账都不可用/);
const huge = buildVerifyUser({ floors: [{ role: '角色', text: '长'.repeat(9000) }], injectedText: '短', worldLines: '', selfLines: '', npcLines: '', maxChars: 300 });
assert.ok(huge.length <= 300, '总量超限时截断');

// ---------- 重试材料 buildVerifyRetryUser ----------

const retry = buildVerifyRetryUser({ user: '原始材料', raw: '{"cla', reason: 'JSON 解析失败' });
assert.match(retry, /原始材料/);
assert.match(retry, /重新只输出符合格式的 JSON/);
assert.ok(buildVerifyRetryUser({ user: 'u', raw: 'r'.repeat(500), reason: 'x'.repeat(500), maxChars: 100 }).length <= 100);

// ---------- 解析 parseVerifyReply ----------

const ok = parseVerifyReply('{"claims":[{"text":"萧炎当前境界为斗者三星","subject":"萧炎","predicate":"境界","value":"斗者三星","verdict":"contradicted","basis":"ledger:self"},{"text":"行囊中有三枚回气丹","subject":"行囊","predicate":"数量","value":"三枚回气丹","verdict":"supported","basis":"none"}],"note":"两处"}');
assert.equal(ok.status, 'ok');
assert.equal(ok.claims.length, 2);
assert.equal(ok.claims[0].verdict, 'contradicted');
assert.equal(ok.claims[0].basisRef ?? ok.claims[0].basis, 'ledger:self');
assert.equal(ok.note, '两处');

assert.equal(parseVerifyReply('').status, 'empty');
assert.equal(parseVerifyReply('模型不高兴').status, 'invalid');
assert.equal(parseVerifyReply('{"nope":1}').status, 'invalid');
assert.equal(parseVerifyReply('{"claims":"x"}').status, 'invalid');
assert.equal(parseVerifyReply('```json\n{"claims":[]}\n```').status, 'ok', '围栏 JSON 可解析');

// 越界与缺字段的逐条丢弃
const picky = parseVerifyReply('{"claims":[{"text":"没有主语","verdict":"supported"},{"subject":"萧炎","predicate":"境界","verdict":"supported"},{"text":"断言","subject":"萧炎","predicate":"境界","verdict":"unlikely"},{"text":"inconclusive 归一","subject":"萧炎","predicate":"境界","verdict":"inconclusive"}]}');
assert.equal(picky.status, 'ok');
assert.equal(picky.claims.length, 1);
assert.equal(picky.claims[0].verdict, 'unverified');
assert.equal(picky.dropped, 3);

// 逐字复制正文原句的拒收
const copied = parseVerifyReply('{"claims":[{"text":"萧炎盘膝而坐，体内的斗之气缓缓流转，三枚回气丹在行囊里安静躺着","subject":"萧炎","predicate":"修炼","verdict":"supported"}]}', { proseText: prose });
assert.equal(copied.status, 'ok');
assert.equal(copied.claims.length, 0, '原句照抄的断言不入账');
assert.equal(copied.dropped, 1);
// 超 12 字且是正文原句照抄 → 拒；短于 12 字的原句片段不做复制判定
const copiedLong = parseVerifyReply('{"claims":[{"text":"体内的斗之气缓缓流转，三枚回气丹在行囊里安静躺着","subject":"萧炎","predicate":"修炼","verdict":"supported"}]}', { proseText: prose });
assert.equal(copiedLong.claims.length, 0, '超 12 字的原句照抄拒收');
const short = parseVerifyReply('{"claims":[{"text":"云韵站在崖边","subject":"云韵","predicate":"位置","verdict":"supported"}]}', { proseText: prose });
assert.equal(short.claims.length, 1, '短于 12 字不做复制判定，正常入账');
assert.equal(isVerbatimCopy('今天天气不错', prose), false);
assert.equal(isVerbatimCopy('体内的斗之气缓缓流转，三枚回气丹在行囊里安静躺着', prose), true);
assert.equal(isVerbatimCopy('云韵站在崖边看着远方', prose), false, '不足 12 字不判复制');
assert.equal(isVerbatimCopy('崖边', prose), false, '短文本不判复制');

// 传闻违规判 contradicted 的纠偏
const rumor = parseVerifyReply('{"claims":[{"text":"传闻说云韵已离开帝国","subject":"云韵","predicate":"动向","value":"离开帝国","verdict":"contradicted","basis":"rumor"}]}');
assert.equal(rumor.claims[0].verdict, 'unverified', 'rumor 只能 unverified');
const rumorNone = parseVerifyReply('{"claims":[{"text":"传闻说云韵已离开帝国","subject":"云韵","predicate":"动向","value":"离开帝国","verdict":"unverified","basis":"rumor"}]}');
assert.equal(rumorNone.claims[0].verdict, 'unverified');

// claims 超 12 条截断
const flood = parseVerifyReply(JSON.stringify({ claims: Array.from({ length: 20 }, (_, index) => ({ text: `断言${index}号`, subject: '某', predicate: '项', verdict: 'unverified' })) }));
assert.equal(flood.claims.length, 12);

// ---------- 台账 build / merge / 豁免 / 误报 ----------

const ledger = createVerifyLedger();
assert.equal(ledger.version, 1);
assert.deepEqual(ledger.entries, []);

const claims = [
    { text: '萧炎当前境界为斗者三星', subject: '萧炎', predicate: '境界', value: '斗者三星', verdict: 'contradicted', basis: 'ledger:self' },
    { text: '云韵在场', subject: '云韵', predicate: '在场', value: '是', verdict: 'supported', basis: 'ledger:npc' },
];
const entries = buildVerifyEntries(claims, { floor: 42 }, ledger);
assert.equal(entries.length, 2);
assert.equal(entries[0].floor, 42);
assert.equal(entries[0].status, 'open');
assert.equal(entries[0].revision, 1);
assert.match(entries[0].id, /^fc/);
assert.notEqual(entries[0].id, entries[1].id, '发号器保证 id 唯一');

const merged = mergeVerifyEntries([], entries, { floor: 42 });
assert.equal(merged.added, 2);
assert.equal(mergeVerifyEntries(merged.entries, entries, { floor: 42 }).added, 0, '同楼同断言不重记');

// 豁免：命中不记
const exempt = addExemption([], entries[0], {});
assert.equal(exempt.accepted, true);
assert.equal(isExemptEntry(entries[0], exempt.exemptions), true);
assert.equal(isExemptEntry(entries[1], exempt.exemptions), false);
assert.equal(addExemption(exempt.exemptions, entries[0]).changed, false, '重复豁免幂等');
assert.equal(addExemption([], { subject: '', predicate: '', value: '' }).accepted, false, '空键不豁免');
assert.equal(mergeVerifyEntries([], [entries[0]], { exemptions: exempt.exemptions, floor: 42 }).added, 0, '豁免命中的条目不入账');
assert.equal(exemptKeyOf({ subject: ' 萧炎 ', predicate: '境界', value: ' 斗者三星 ' }), exemptKeyOf({ subject: '萧炎', predicate: '境界', value: '斗者三星' }), '键做 trim 归一');

// 误报标记：revision 乐观锁 + 状态迁移
const marked = markEntryFalsePositive(merged.entries, { id: entries[0].id, expectedRevision: 1 });
assert.equal(marked.accepted, true);
assert.equal(marked.entry.status, 'false_positive');
assert.equal(marked.entry.revision, 2);
assert.equal(markEntryFalsePositive(marked.entries, { id: entries[0].id, expectedRevision: 1 }).reason, 'revision_mismatch');
assert.equal(markEntryFalsePositive(marked.entries, { id: entries[0].id, expectedRevision: 2 }).reason, 'already_marked');
assert.equal(markEntryFalsePositive(marked.entries, { id: 'nope', expectedRevision: 1 }).reason, 'unknown_entry');

// FIFO 截断 + normalize 兜底
const stuffed = mergeVerifyEntries(
    Array.from({ length: VERIFY_ENTRIES_MAX }, (_, index) => ({ id: `old${index}`, kind: 'claim', floor: index, ts: '', status: 'open', revision: 1, subject: 'a', predicate: 'b', value: 'c', basisRef: 'none', text: `t${index}` })),
    entries, { floor: 42 },
);
assert.ok(stuffed.entries.length <= VERIFY_ENTRIES_MAX);
const bad = normalizeVerifyLedger({ entries: 'x', exemptions: 5, seq: -3 });
assert.deepEqual(bad.entries, []);
assert.deepEqual(bad.exemptions, []);
assert.equal(bad.seq, 0);
assert.equal(normalizeVerifyLedger(null).version, 1);

// 开着的问题清单：倒序、只含 open
const findingLedger = { version: 1, seq: 3, entries: [
    { id: 'a', kind: 'claim', status: 'open', subject: 's1', predicate: 'p', value: 'v', text: 't1', floor: 1, ts: '', revision: 1, verdict: 'contradicted', basisRef: 'none' },
    { id: 'b', kind: 'claim', status: 'false_positive', subject: 's2', predicate: 'p', value: 'v', text: 't2', floor: 2, ts: '', revision: 2, verdict: 'contradicted', basisRef: 'none' },
    { id: 'c', kind: 'claim', status: 'open', subject: 's3', predicate: 'p', value: 'v', text: 't3', floor: 3, ts: '', revision: 1, verdict: 'unverified', basisRef: 'rumor' },
], exemptions: [] };
const findings = listOpenFindings(findingLedger);
assert.deepEqual(findings.map(item => item.id), ['c', 'a'], '倒序且只含 open');
assert.equal(listOpenFindings(null).length, 0);

// 非 claim 种类（名字比对条目）的字段映射
const nameUse = buildVerifyEntries([{ name: '美杜莎女王', predicate: '未注入条目', value: '美杜莎', text: '正文提到未注入条目' }], { floor: 7, kind: 'unapproved_setting_use' }, ledger);
assert.equal(nameUse[0].kind, 'unapproved_setting_use');
assert.equal(nameUse[0].subject, '美杜莎女王');
assert.equal(nameUse[0].value, '美杜莎');

console.log('verify-claims.test.mjs: all assertions passed');
