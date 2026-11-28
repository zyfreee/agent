import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    buildImpactInjectUser, buildImpactInjectBundle, buildImpactInjectionFromPicks, buildImpactInjectionFromPicksDetail,
    parseImpactSelect, judgeImpactHits, seedTokens, pickBuriedForPrompt, rankBuriedRecords, IMPACT_INJECT_PROMPT,
} from './impact-select.js';

/** 一条正常的影响记录；只覆盖测试关心的字段。 */
function record(overrides) {
    return {
        id: 'i1',
        day: 3,
        floor: 1,
        title: '加列家的药材库被烧',
        detail: '城中药材涨价，加列家开始查纵火的人',
        target: '加列家族',
        kind: 'direct',
        weight: 'major',
        certainty: 'certain',
        evidence: '第 1 楼',
        canon: '加列家族的药材生意',
        shift: 'alter',
        state: 'active',
        seed: '',
        trigger: '',
        hit: '',
        ripenDay: null,
        ripenedDay: null,
        resolution: '',
        resolvedDay: null,
        parent: null,
        depth: 0,
        source: 'decide',
        ...overrides,
    };
}

const records = [
    record({}),
    record({ id: 'i2', day: 5, title: '云岚宗来人', target: '云岚宗', weight: 'world', canon: '', shift: 'none' }),
    record({ id: 'i3', day: 6, title: '旧账', target: '萧家', weight: 'minor', certainty: 'rumor', state: 'closed', resolution: '赔钱了事', resolvedDay: 7 }),
    record({ id: 'i4', day: 2, title: '修好的桥', target: '乌坦城', state: 'reverted' }),
    record({ id: 'i5', day: 7, title: '坊间传闻', target: '米特尔家族', weight: 'minor', certainty: 'rumor', canon: '', shift: 'none' }),
    record({
        id: 'i7', day: 4, title: '萧炎收下旧护符', detail: '当时谁也没当回事', target: '萧炎',
        state: 'sunk', seed: '玩家给萧炎的一枚旧护符', trigger: '萧炎被逼到绝境、无路可退',
    }),
];

const draft = '萧炎被云岚宗的人逼到崖下，他从怀里掏出那枚旧护符挡了一记。';
const floors = [
    { role: '玩家', text: draft },
    { role: '角色', text: '山风卷着碎石往下落，崖底的血腥味越来越重。' },
];

// —— 提示词：判定官的底线是“宁可判不兑现，也不猜” ——
assert.match(IMPACT_INJECT_PROMPT, /世界判定官/);
assert.match(IMPACT_INJECT_PROMPT, /场面对上/);
assert.match(IMPACT_INJECT_PROMPT, /物件对上/);
assert.match(IMPACT_INJECT_PROMPT, /用途/);
assert.match(IMPACT_INJECT_PROMPT, /原文/);
assert.match(IMPACT_INJECT_PROMPT, /不要拿天数|第几天只是记账时间/);
assert.match(IMPACT_INJECT_PROMPT, /宁可/);

// —— 组装给判定官的内容：世界、明面账本、埋着的因、对话、玩家这一轮的话 ——
const user = buildImpactInjectUser({
    snapshot: {
        clock: { day: 8, minute: 540, label: '上午' },
        info: { weather: '阴', location: '乌坦城', era: '萧家退婚后', reputation: '萧家名声受损', wanted: '无' },
        nearEvents: [],
        worldEvents: [],
    },
    records,
    floors,
    draft,
    day: 8,
    canonLines: ['- 三年之约（纳兰嫣然的婚约）'],
});
assert.match(user, /【此刻的世界（既定状态）】/);
assert.match(user, /【世界线账本（已经摆在明面上的变化；共 6 条：明面 3、埋着 1、已应验 0、已收场 2）】/);
assert.match(user, /#i1｜第 3 天/);
assert.doesNotMatch(user.split('【最近对话')[0].split('【埋着的因')[0], /#i7｜/, '埋着的因不混进明面账本');
assert.match(user, /【埋着的因（已经埋进世界、当事人还不知道；这一轮是否被认领，由你判断）】\n- #i7｜因：玩家给萧炎的一枚旧护符｜等：萧炎被逼到绝境、无路可退｜萧炎收下旧护符/);
assert.doesNotMatch(user, /第 \d+ 天才会发作/, '不再有“第几天才发作”这种说法');
assert.doesNotMatch(user, /【还没发作的安排/, '旧的三段式提醒段已删除');
assert.match(user, /【原著节点（只用来核对这一轮压在原著哪一段上）】\n- 三年之约/);
assert.match(user, /【最近对话（旧 → 新，共 2 楼）】/);
assert.match(user, /\[玩家\] 萧炎被云岚宗的人逼到崖下/);
assert.match(user, /【玩家这一轮说】\n萧炎被云岚宗的人逼到崖下/);
assert.match(user, /"hits":\[\{"ref":"i7","why":"…","evidence":"原文原句"/);

// 空账本也要能组装，不能因为没东西可判断就崩。
const emptyUser = buildImpactInjectUser({ records: [], floors: [], draft: '', day: 1 });
assert.match(emptyUser, /明面上还没有变化/);
assert.match(emptyUser, /（还没有埋下的因）/);
assert.match(emptyUser, /（玩家还没有输入）/);

// —— 实词切分：量词前缀要剥掉，虚词句不要 ——
assert.deepEqual(seedTokens('一枚旧护符'), ['旧护符'], '量词本身不参与比对');
assert.deepEqual(seedTokens('玩家给萧炎的一枚旧护符'), ['旧护符'], '长词里的量词要切掉，只留真物件');
assert.deepEqual(seedTokens(''), []);
assert.deepEqual(seedTokens('的了和'), ['的了和'], '全虚词而长到三字以上就整段留着，宁可宽一点不漏');

// —— 裁决：证据链缺一条都不放过 ——
const goodWhy = '萧炎被逼到绝境、无路可退时，攥着玩家当年给的那枚旧护符挡下致命一击';
const goodEvidence = '他从怀里掏出那枚旧护符挡了一记';
const corpus = [draft, ...floors.map(floor => floor.text)].join('\n');
const judged = judgeImpactHits([
    { ref: '#i7', why: goodWhy, evidence: goodEvidence, text: '崖下的旧护符忽然发烫' },
    { ref: 'i1', why: goodWhy, evidence: goodEvidence },
    { ref: 'i9', why: goodWhy, evidence: goodEvidence },
    { ref: 'i12', why: '感觉会用到', evidence: goodEvidence },
    { ref: 'i11', why: goodWhy, evidence: '正文里根本没有这句' },
    { ref: 'i10', why: goodWhy, evidence: goodEvidence },
], {
    records: records.concat([
        record({ id: 'i10', state: 'sunk', seed: '玩家给萧炎的一枚旧护符', trigger: '萧炎被逼到绝境' }),
        record({ id: 'i11', state: 'sunk', seed: '玩家给萧炎的一枚旧护符', trigger: '萧炎被逼到绝境' }),
        record({ id: 'i12', state: 'sunk', seed: '玩家给萧炎的一枚旧护符', trigger: '萧炎被逼到绝境' }),
    ]),
    corpus,
});
assert.equal(judged.accepted.length, 2, '一幕最多认两条，证据链完整的都算');
assert.deepEqual(judged.accepted.map(item => item.ref), ['i7', 'i10']);
assert.equal(judged.accepted[0].evidence, goodEvidence);
assert.deepEqual(judged.rejected.map(item => [item.ref, item.reason]), [
    ['i1', 'not_sunk'],
    ['i9', 'no_such_record'],
    ['i12', 'why_incomplete'],
    ['i11', 'evidence_not_found'],
]);
// 只写物件、不写场面：不算撞上（这是判定官最容易顺手放水的地方）。
assert.equal(judgeImpactHits([{ ref: 'i7', why: '他身上有那枚旧护符', evidence: goodEvidence }], { records, corpus }).rejected[0].reason, 'why_incomplete');
// 只写场面、不写物件：同样不算。
assert.equal(judgeImpactHits([{ ref: 'i7', why: '萧炎被逼到绝境、无路可退', evidence: goodEvidence }], { records, corpus }).rejected[0].reason, 'why_incomplete');
// 一幕最多认两条：第三条起直接不认，避免一次兑现一整串。
const sunkMany = Array.from({ length: 4 }, (_, index) => record({
    id: `s${index}`, state: 'sunk', seed: '那枚旧护符', trigger: '萧炎被逼到绝境',
}));
assert.equal(judgeImpactHits(sunkMany.map((_, index) => ({ ref: `s${index}`, why: '萧炎被逼到绝境，手里是那枚旧护符', evidence: goodEvidence })), { records: sunkMany, corpus }).accepted.length, 2);

// —— 解析：pick 与 hit 分开清洗，坏 JSON 仍报 invalid ——
const parsed = parseImpactSelect(JSON.stringify({
    note: '这一幕只用到药材和埋下的护符。',
    hits: [{ ref: '#i7', why: goodWhy, evidence: goodEvidence, text: '崖下的旧护符忽然发烫' }],
    picks: [
        { ref: '#i1', text: '城中药材一夜涨了三成，加列家在查放火的人。' },
        { ref: 'i9', text: '账本里没有这一条' },
        { ref: 'i3', text: '已经了结的旧账' },
        { ref: 'i1', text: '重复的编号只留第一条' },
        { ref: 'i2', text: '云岚宗的长老这两天就会到乌坦城。' },
    ],
}), { records });
assert.equal(parsed.status, 'ok');
assert.deepEqual(parsed.picks.map(pick => pick.ref), ['i1', 'i2']);
assert.equal(parsed.dropped, 3);
assert.equal(parsed.hits.length, 1, 'hits 只做形状清洗，裁决留给 judgeImpactHits');
assert.equal(parsed.hits[0].ref, 'i7', '井号被去掉');
assert.match(parsed.note, /护符/);

assert.equal(parseImpactSelect('{"note":"这一轮没有撞上埋下的因","hits":[],"picks":[]}', { records }).status, 'ok', '判定官说了话就算 ok，注入时会按空清单跳过');
assert.equal(parseImpactSelect('{"hits":[],"picks":[]}', { records }).status, 'empty');
assert.equal(parseImpactSelect('{\n  "picks": [\n    {"ref": "i1", "text": "断在这里"', { records }).status, 'invalid');
assert.equal(parseImpactSelect('顺便说一句，这轮不用旧账。', { records }).status, 'invalid');
assert.equal(parseImpactSelect(JSON.stringify({ hits: 'nope', picks: [] }), { records }).hits.length, 0, 'hits 不是数组就当没有');
const longText = '药材'.repeat(200);
const trimmed = parseImpactSelect(JSON.stringify({ picks: [{ ref: 'i1', text: longText }] }), { records });
assert.equal(trimmed.picks[0].text.length, 120, '超长旁白裁到 120');
assert.equal(parseImpactSelect(JSON.stringify({ note: 'n'.repeat(300), picks: [{ ref: 'i1', text: '短句' }] }), { records }).note.length, 160, 'note 裁到 160');

// 挑选条数不设上限（用户口径 2026-11-19）：模型挑几条进几条。
const many = Array.from({ length: 10 }, (_, index) => record({ id: `m${index}`, title: `第 ${index} 件`, target: `对象${index}` }));
const manyParsed = parseImpactSelect(JSON.stringify({ picks: many.map(item => ({ ref: item.id, text: `第 ${item.id} 件的事` })) }), { records: many });
assert.equal(manyParsed.picks.length, 10);

// —— 拼正文注入：撞上的因排最前，明面变化跟在后面 ——
const acceptedHits = judgeImpactHits(
    [{ ref: 'i7', why: goodWhy, evidence: goodEvidence, text: '崖下的旧护符忽然发烫' }],
    { records, corpus },
).accepted;
const injection = buildImpactInjectionFromPicks(records, [
    { ref: 'i1', text: '城中药材一夜涨了三成。' },
    { ref: 'i2', text: '云岚宗的长老还在路上。' },
    { ref: 'i5', text: '米特尔家的人说萧家要倒大霉。' },
], { day: 8, maxChars: 800, maxLines: 8, hits: acceptedHits });
assert.match(injection, /^【世界影响 · 本局世界线】/);
const lines = injection.split('\n');
assert.match(lines[1], /当年埋下的因，这一轮撞上了：崖下的旧护符忽然发烫/, '撞上的因排在最前面');
assert.match(injection, /· 城中药材一夜涨了三成。/);
assert.match(injection, /★云岚宗的长老还在路上。/);
assert.match(injection, /？米特尔家的人说萧家要倒大霉。/);
assert.doesNotMatch(injection, /还没发作|第 9 天/, '注入里不再出现倒计时');

// 已收场的不作为本轮注入行；埋着的因没被裁决通过也不进；但原著线当前态照带（偏移是既定状态）。
assert.doesNotMatch(buildImpactInjectionFromPicks(records, [{ ref: 'i3', text: '旧账' }, { ref: 'i4', text: '修好的桥' }, { ref: 'i7', text: '护符' }], { day: 8 }), /· 旧账|· 修好的桥|· 护符/, '收场的不能作为本轮注入行');
assert.match(buildImpactInjectionFromPicks(records, [], { day: 8 }), /原著线当前态/, '没有挑选时注入里仍带原著线当前态');
// 未经裁决的 hits 直接塞进来不算（buildImpactInjectionFromPicksDetail 只认 sunk 且有正文的）。
assert.doesNotMatch(buildImpactInjectionFromPicksDetail(records, [], { hits: [{ ref: 'i1', text: '硬塞' }] }).text, /硬塞/);

// 预算：字号很紧时只留一条，且一定保留抬头。
const tight = buildImpactInjectionFromPicks(records, [
    { ref: 'i1', text: '城中药材一夜涨了三成，加列家开始挨家盘问，街口的药铺全都关了门。' },
    { ref: 'i5', text: '米特尔家的人说萧家要倒大霉。' },
], { day: 8, maxChars: 60, maxLines: 8 });
assert.equal(tight.split('\n').length, 2);
assert.match(tight.split('\n')[1], /药材/);

// 源码自检：这个模块不该反向依赖扩展入口（避免循环导入）。
const source = await readFile(new URL('./impact-select.js', import.meta.url), 'utf8');
assert.doesNotMatch(source, /from '\.\.\/index\.js'/);
assert.doesNotMatch(source, /ripenDay > today/, '判定官输入里不该再用日子筛埋线');

// OPT-076: model-rephrased picks still carry the record's uncertainty.
for (const weight of ['world', 'major', 'minor']) {
    const row = record({ weight, certainty: 'rumor' });
    const result = buildImpactInjectionFromPicks([row], [{ ref: row.id, text: '有人传信' }]);
    assert.match(result, /？/);
    assert.equal(result.includes('★'), weight === 'world');
}

// OPT-074: inventory size must not become prompt size; buried factors are capped, never pruned.
for (const count of [0, 1, 1000, 10000]) {
    const rows = Array.from({ length: count }, (_, n) => record({
        id: `i${n + 1}`, title: `埋着${n}`, target: '远城', state: 'sunk', seed: `因${n}`, trigger: `条件${n}`,
    }));
    if (count) rows[count - 1] = record({ id: 'relevant', title: '当前城要事', target: '乌坦城', state: 'sunk', seed: '乌坦城缺药', trigger: '有人去药铺抓药' });
    const before = JSON.stringify(rows);
    const value = buildImpactInjectUser({ records: rows, snapshot: { info: { location: '乌坦城' } }, day: 1 });
    const buriedBlock = value.split('【埋着的因（已经埋进世界、当事人还不知道；这一轮是否被认领，由你判断）】\n')[1].split('\n\n')[0];
    assert.ok(buriedBlock.split('\n').filter(line => line.startsWith('- #')).length <= 12, `buried lines ${count}`);
    assert.ok(value.length <= 8000, `total chars ${count}: ${value.length}`);
    // 埋着的因不砍条数、改按分数排队：没摆上来的要明说“不是作废，是排到后面了”。
    if (count > 12) assert.match(buriedBlock, /另有 \d+ 条埋着的因这一场没浮上来，不是作废，是排到后面了/);
    assert.equal(JSON.stringify(rows), before, 'budgeting must never prune persisted inventory');
}

// —— 挑选结果的字数/条数默认不限制：不传上限时全量进提示词，填了正数才截 ——
{
    const many = Array.from({ length: 12 }, (_, index) => record({ id: `u${index}`, title: `影响${index}`, target: '乌坦城' }));
    const picks = many.map(item => ({ ref: item.id, text: `${item.title}：${'评'.repeat(200)}` }));
    const unlimited = buildImpactInjectionFromPicks(many, picks);
    assert.ok(many.every(item => unlimited.includes(item.title)), '不传 maxChars/maxLines 时 12 条全量注入');
    const cappedInjection = buildImpactInjectionFromPicks(many, picks, { maxChars: 800 });
    assert.ok(cappedInjection.length <= 820, `填了正数才按字数截：${cappedInjection.length}`);
    assert.ok(!cappedInjection.includes('影响11'), '放不下的条目整条不进');
}

// —— 埋着的因改“按分数排队”：场面对得上的先露面，露过太多次的往后挪，谁都不许被删 ——
{
    const buried = [
        record({ id: 'b1', title: '旧护符', state: 'sunk', day: 2, seed: '玩家给萧炎的旧护符', trigger: '萧炎被逼到绝境', weight: 'minor' }),
        record({ id: 'b2', title: '药材欠条', state: 'sunk', day: 10, seed: '百草药铺的一张欠条', trigger: '有人上门讨账', weight: 'minor' }),
        record({ id: 'b3', title: '云岚宗令牌', state: 'sunk', day: 3, seed: '云岚宗的令牌', trigger: '有人亮出宗门身份', weight: 'world' }),
    ];
    // 这一场正文里出现了“旧护符”和“绝境”→ b1 的因与条件都对上，理应排第一。
    const scene = '萧炎被逼到绝境，摸出那枚旧护符。';
    const ranked = rankBuriedRecords(buried, { day: 12, sceneText: scene, exposure: {} });
    assert.equal(ranked[0].id, 'b1', '场面对得上的排第一');
    assert.ok(ranked[0].score > ranked[1].score);
    // 排序不改变原数组，也不删任何一条。
    assert.equal(buried.length, 3);
    assert.deepEqual(ranked.map(row => row.id).sort(), ['b1', 'b2', 'b3']);

    // 曝光公平：b1 已经被摆上来 3 次，罚分让它往后挪，但不至于沉底不动。
    const seenMany = rankBuriedRecords(buried, { day: 12, sceneText: scene, exposure: { b1: 3 } });
    assert.ok(seenMany.find(row => row.id === 'b1').score < ranked.find(row => row.id === 'b1').score);
    const seenForever = rankBuriedRecords(buried, { day: 12, sceneText: scene, exposure: { b1: 99 } });
    assert.equal(
        seenForever.find(row => row.id === 'b1').score,
        seenMany.find(row => row.id === 'b1').score,
        '露过 3 次以上不再加罚，免得一条永远沉底',
    );

    // pickBuriedForPrompt：只给前 N 条，剩下的明说“不是作废，是排到后面了”，并回传真正露面的编号。
    const pick = pickBuriedForPrompt(buried, { day: 12, sceneText: scene, exposure: {}, limit: 2 });
    assert.deepEqual(pick.ids, ['b1', 'b3'], 'b1 场面契合、b3 分量重，排在 b2 前面');
    assert.equal(pick.hidden, 1);
    assert.match(pick.lines.join('\n'), /另有 1 条埋着的因这一场没浮上来，不是作废，是排到后面了/);
    assert.match(pick.lines[0], /^\- #b1｜因：玩家给萧炎的旧护符｜等：萧炎被逼到绝境｜/);
    // 空清单不报错。
    assert.deepEqual(pickBuriedForPrompt([], { day: 1 }), { lines: [], ids: [], hidden: 0 });
}

// —— 共用世界上下文：三样公共事实有就出、没有就不占行 ——
{
    const base = {
        snapshot: { info: { location: '乌坦城' }, nearEvents: [], worldEvents: [] },
        records,
        floors,
        draft,
        day: 8,
    };
    const plain = buildImpactInjectBundle(base);
    assert.doesNotMatch(plain.user, /【记忆里跟这一幕有关的旧事/);
    assert.doesNotMatch(plain.user, /【此刻在场的人对玩家什么态度/);
    assert.doesNotMatch(plain.user, /【前几轮已经认领过的因/);
    const full = buildImpactInjectBundle({
        ...base,
        memoryLines: ['- (m1 第2天)[小记忆][恩怨] 玩家欠药铺一个人情'],
        npcLines: ['- 萧炎 · 友善（32） · 紧绷 @乌坦城'],
        claimed: ['- #i7「萧炎收下旧护符」第 6 天被认领'],
        canonLines: ['- 三年之约（卷 6）：退婚之后的三年之约'],
    });
    assert.match(full.user, /【记忆里跟这一幕有关的旧事（同一局发生过的事，与账本互不重复）】\n- \(m1 第2天\)/);
    assert.match(full.user, /【此刻在场的人对玩家什么态度（人物簿现状）】\n- 萧炎 · 友善（32）/);
    assert.match(full.user, /【前几轮已经认领过的因（不要重复认领；真要复用，得是这一轮又拿出了新东西）】/);
    assert.match(full.user, /#i7「萧炎收下旧护符」第 6 天被认领/);
    // 段落顺序：账本 → 埋着的因 → 共用上下文 → 原著节点 → 最近对话 → 玩家这句话
    const order = ['【世界线账本', '【埋着的因', '【记忆里跟这一幕有关的旧事', '【此刻在场的人对玩家什么态度', '【前几轮已经认领过的因', '【原著节点', '【最近对话', '【玩家这一轮说】'];
    const positions = order.map(mark => full.user.indexOf(mark));
    assert.ok(positions.every(at => at >= 0), '每一段都出现');
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, '段落顺序固定');
    // buriedIds 要回传：曝光计数靠它。
    assert.deepEqual(full.buriedIds, ['i7']);
    assert.equal(full.buriedTotal, 1);
}

// —— picks 上限：判定官抽风吐 30 条也只进 12 条，多余的计入 dropped ——
{
    const records = Array.from({ length: 20 }, (_, index) => ({ id: `i${index + 1}`, title: `影响${index}`, detail: 'd', target: 't', state: 'active', day: 1 }));
    const parsed = parseImpactSelect(JSON.stringify({ picks: records.map(record => ({ ref: record.id, text: '这一轮要写进正文' })) }), { records });
    assert.equal(parsed.picks.length, 12, 'picks 有硬上限，不能全量灌进正文');
    assert.equal(parsed.dropped, 8);
}

// —— 场面命中保底：因/条件在正文里出现过的埋线排进队头，不被埋得久的重磅旧线挤出去 ——
{
    const buried = [
        { id: 'i1', title: '很重但场面没对上', seed: '一枚旧护符', trigger: '萧炎被逼到绝境、无路可退', weight: 'world', day: 1, state: 'sunk' },
        { id: 'i2', title: '轻但场面真对上了', seed: '半块玉佩', trigger: '拍卖会上有人认出了它', weight: 'minor', day: 1, state: 'sunk' },
    ];
    const picked = pickBuriedForPrompt(buried, { day: 9, sceneText: '拍卖会上有人认出了它', limit: 1 });
    assert.equal(picked.ids[0], 'i2', '命中场面的埋线保底进队列');
}

// —— 原著线当前态跟着判定路径注入：偏移是既定状态，不带编号（不算"本轮注入了哪条影响"）——
{
    const records = [
        { id: 'i1', title: '避过三年之约', detail: '玩家没去赴约', target: '云岚宗', weight: 'major', canon: '三年之约', shift: 'avoid', canonWhat: '玩家没去赴约', state: 'active', day: 3 },
        { id: 'i2', title: '只是明面一条', detail: '没有碰原著', target: '乌坦城', weight: 'minor', state: 'active', day: 4 },
    ];
    const built = buildImpactInjectionFromPicksDetail(records, [{ ref: 'i2', text: '云岚宗派人下山了' }]);
    assert.match(built.text, /原著线当前态/, '判定路径注入带原著线当前态');
    assert.match(built.text, /已避过——玩家没去赴约/);
    assert.deepEqual(built.usedIds, ['i2'], '原著线行不带编号，usedIds 只算真正注入的影响');
}

console.log('impact select tests passed');
