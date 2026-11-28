import assert from 'node:assert/strict';
import {
    IMPACT_HEADER,
    buildImpactInjection,
    buildImpactInjectionDetail,
    buildImpactLedgerLines,
    impactMark,
    impactAnswers,
    impactThreeQuestions,
    isImpactDecideDue,
    seedLine,
    summarizeImpact,
    effectsSummary,
    canonLineSummary,
} from '../impact/impact-ops.js';

const records = [
    { id: 'i1', day: 12, title: '拍卖场被砸', detail: '青灵丹被当众拍走', target: '乌坦城·拍卖场', kind: 'direct', weight: 'world', certainty: 'certain', evidence: '第 12 楼', canon: '退婚', shift: 'accelerate', state: 'active', ripenDay: null, resolution: '', parent: '', depth: 0 },
    { id: 'i2', day: 14, title: '坊间传闻', detail: '都说加列家族要报复', target: '乌坦城', kind: 'ripple', weight: 'minor', certainty: 'rumor', evidence: '第 18 楼', canon: '', shift: 'none', state: 'active', ripenDay: null, resolution: '', parent: '', depth: 0 },
    { id: 'i3', day: 15, title: '云岚宗过问', detail: '长老派人下山查青灵丹去向', target: '云岚宗', kind: 'butterfly', weight: 'major', certainty: 'certain', evidence: '第 21 楼', canon: '', shift: 'none', state: 'sunk', seed: '青灵丹被拍走的消息', trigger: '云岚宗有人问起丹的来路', resolution: '', parent: 'i1', depth: 1 },
    { id: 'i4', day: 9, title: '旧账', detail: '已经被消化', target: '萧家', kind: 'direct', weight: 'major', certainty: 'certain', evidence: '第 4 楼', canon: '', shift: 'none', state: 'closed', ripenDay: null, resolution: '赔钱了事', parent: '', depth: 0 },
    { id: 'i5', day: 10, title: '云岚宗来人', detail: '长老已经下山', target: '云岚宗', kind: 'butterfly', weight: 'major', certainty: 'certain', evidence: '第 15 楼', canon: '', shift: 'none', state: 'ripened', ripenedDay: 11, resolution: '查到乌坦城', parent: 'i1', depth: 1 },
];

assert.equal(impactMark(records[0]), '★');
assert.equal(impactMark(records[1]), '？');
assert.equal(impactMark({ weight: 'minor', certainty: 'certain' }), '');
assert.equal(impactMark(null), '');

const summary = summarizeImpact(records[3]);
assert.ok(summary.includes('已了结'));
assert.ok(summary.includes('世界级') === false);
assert.ok(summary.includes('大事'));
assert.ok(summary.includes('后续：赔钱了事'));
assert.ok(summarizeImpact(records[0]).includes('原著偏移（加速）：退婚'));
assert.ok(summarizeImpact(records[2]).includes('埋着（因：青灵丹被拍走的消息｜等：云岚宗有人问起丹的来路）'), '埋着的因在摘要里写清因与条件');
assert.equal(seedLine(records[0]), '', '没有因/等的老记录不硬造');
assert.equal(seedLine(records[2]), '因：青灵丹被拍走的消息｜等：云岚宗有人问起丹的来路');

const injection = buildImpactInjection(records, { day: 12 });
assert.ok(injection.startsWith(IMPACT_HEADER));
assert.ok(injection.includes('★'));
assert.ok(injection.includes('？'));
assert.ok(injection.includes('原著·加速'));
assert.ok(injection.indexOf('拍卖场被砸') < injection.indexOf('坊间传闻'));
assert.ok(!injection.includes('旧账'), '已了结的影响不再注入');
assert.ok(injection.includes('云岚宗来人') && injection.includes('（已应验）'), '已应验但没收场的影响继续注入，并标出已应验');
assert.ok(injection.includes('埋着的因（等场面，不按日子）：'), '埋着的因单独一段');
assert.ok(injection.includes('因：青灵丹被拍走的消息｜等：云岚宗有人问起丹的来路'));
assert.ok(!injection.includes('第 22 天') && !injection.includes('就快到了') && !injection.includes('还没发作'), '注入里不再出现倒计时口径');

assert.equal(buildImpactInjection([], { day: 12 }), '');
assert.equal(buildImpactInjection([records[3]], { day: 12 }), '');

const tight = buildImpactInjection(records, { day: 12, maxChars: IMPACT_HEADER.length + 20 });
assert.equal(tight, IMPACT_HEADER, '预算连一条都放不下时只留抬头，不留空标题');

const roomy = buildImpactInjection(records, { day: 12, maxChars: IMPACT_HEADER.length + 90 });
const roomyLines = roomy.split('\n');
assert.equal(roomyLines[0], IMPACT_HEADER);
assert.equal(roomyLines[1], '已发生：');
assert.ok(roomyLines[2].includes('拍卖场被砸'), '够放一条时先放最重要的一条');

// 埋着的因排在明面之后；预算不够时先保住已经发生的。
const buriedHeavy = [records[2], records[0]];
const orderCheck = buildImpactInjection(buriedHeavy, { day: 12 });
assert.ok(orderCheck.indexOf('已发生：') < orderCheck.indexOf('埋着的因'), '已经发生的排前面');

const ledger = buildImpactLedgerLines(records, { day: 12 });
assert.ok(ledger[0].startsWith('#i1'));
assert.ok(ledger[1].startsWith('#i2'), '同是未了结的按分量与天数排');
assert.ok(ledger[2].startsWith('#i3'), '埋着的排在未了结之后');
assert.ok(ledger[3].startsWith('#i5'));
assert.ok(ledger[4].startsWith('#i4'));
assert.ok(ledger[0].includes('依据：第 12 楼'));
assert.ok(ledger[0].includes('原著·加速：退婚'));
assert.ok(ledger[2].includes('埋着（因：青灵丹被拍走的消息｜等：云岚宗有人问起丹的来路）'), '台账里埋着的因带因与条件');
assert.ok(!ledger[2].includes('天起发酵'), '台账里不再写发酵日');
assert.ok(ledger[2].includes('源自：i1'));
assert.ok(ledger[4].includes('后续：赔钱了事'));
assert.equal(buildImpactLedgerLines(records, { day: 12, maxLines: 2 }).length, 2);
assert.deepEqual(buildImpactLedgerLines([], { day: 12 }), []);
assert.deepEqual(buildImpactLedgerLines(null, { day: 12 }), []);

// 撞上的场面要落进台账与三问，后续判定官与面板都能看见。
const hitLedger = buildImpactLedgerLines([{ ...records[2], state: 'ripened', hit: '崖下被围，他掏出那枚护符挡了一下' }]);
assert.ok(hitLedger[0].includes('撞上的场面：崖下被围，他掏出那枚护符挡了一下'));

// 记录节奏：按“上次记账之后又生成了几楼”算，不按消息总数算。
const chat = [
    { is_user: true, mes: '开场' },
    { mes: '第一轮回复' },
    { is_user: true, mes: '第二轮' },
    { mes: '第二轮回复' },
    { is_user: true, mes: '第三轮' },
    { mes: '第三轮回复' },
];
assert.equal(isImpactDecideDue(chat, { every: 1, lastFloor: -1 }), true);
assert.equal(isImpactDecideDue(chat, { every: 3, lastFloor: -1 }), true);
assert.equal(isImpactDecideDue(chat, { every: 2, lastFloor: 1 }), true, '第 1 楼之后又有两楼回复');
assert.equal(isImpactDecideDue(chat, { every: 3, lastFloor: 1 }), false, '第 1 楼之后只有两楼回复，不够三轮');
assert.equal(isImpactDecideDue(chat, { every: 1, lastFloor: 3 }), true, '第 3 楼之后还有一楼回复');
assert.equal(isImpactDecideDue(chat, { every: 3, lastFloor: 3 }), false);
assert.equal(isImpactDecideDue(chat, { every: 3, lastFloor: 5 }), false, '刚记完最后一楼，还没有新一轮');
assert.equal(isImpactDecideDue(chat, { every: 1, lastFloor: 5 }), false);
assert.equal(isImpactDecideDue(chat, { every: 3, lastFloor: 99 }), true, '楼层号超出聊天长度时重新数');
assert.equal(isImpactDecideDue(null, { every: 1 }), false);
assert.equal(isImpactDecideDue([{ is_user: true, mes: '只有玩家' }], { every: 1, lastFloor: -1 }), false);

// OPT-076: importance never suppresses uncertainty, including matters still buried.
for (const weight of ['world', 'major', 'minor']) {
    for (const certainty of ['certain', 'rumor']) {
        const row = { ...records[0], weight, certainty, canon: '' };
        assert.equal(impactMark(row).includes('★'), weight === 'world');
        assert.equal(impactMark(row).includes('？'), certainty === 'rumor');
        assert.equal(buildImpactInjection([row]).includes('？'), certainty === 'rumor');
        assert.match(buildImpactLedgerLines([row])[0], certainty === 'rumor' ? /传闻·未证实/ : /已证实/);
        const sunkRow = { ...row, state: 'sunk', seed: '一枚旧护符', trigger: '萧炎走投无路' };
        assert.equal(buildImpactInjection([sunkRow]).includes('？'), certainty === 'rumor', '埋着的因同样不吞掉可疑标记');
        assert.match(buildImpactLedgerLines([sunkRow])[0], certainty === 'rumor' ? /传闻·未证实/ : /已证实/);
    }
}

// —— 注入字数/条数默认不限制：不传上限时摆到明面上的影响全量进提示词，填了正数才截 ——
{
    const many = Array.from({ length: 12 }, (_, index) => ({
        id: `u${index}`, day: 5, title: `影响${index}`, detail: '情'.repeat(200), target: '乌坦城',
        kind: 'direct', weight: 'major', certainty: 'certain', evidence: `第 ${index + 1} 楼`, canon: '',
        shift: 'none', state: 'active', ripenDay: null, resolution: '', parent: '', depth: 0,
    }));
    const unlimited = buildImpactInjection(many);
    assert.ok(many.every(record => unlimited.includes(record.title)), '不传 maxChars/maxLines 时 12 条全量注入');
    const capped = buildImpactInjection(many, { maxChars: 600 });
    assert.ok(capped.length <= 620, `填了正数才按字数截：${capped.length}`);
    assert.ok(!capped.includes('影响11'), '超预算的留在库里');
}

// —— 三问分解：同一份账按“做了什么 / 对原著 / 以后”重新分组，面板与 /impact why 共用 ——
{
    const picture = [
        { ...records[0], id: 'a1', day: 15, title: '拍卖场被砸', canon: '纳兰嫣然退婚', shift: 'accelerate', state: 'active', ripenDay: null },
        { ...records[0], id: 'a2', day: 16, title: '云岚宗过问', canon: '纳兰嫣然退婚', shift: 'delay', state: 'ripened', materialized: true, outcomeEventId: 'e7' },
        { ...records[0], id: 'a3', day: 17, title: '坊市斗殴', canon: '', state: 'sunk', seed: '当年的旧账', trigger: '两家在坊市撞上' },
        { ...records[0], id: 'a4', day: 12, title: '被撤掉的旧账', canon: '', state: 'reverted', materialized: false },
    ];
    const view = impactThreeQuestions(picture, { day: 17, nodeLabel: node => node.slice(0, 4) });
    assert.equal(view.done.length, 3, '已修复的不进做了什么');
    assert.ok(view.done[0].includes('坊市斗殴'), '最新的排最前');
    assert.ok(!view.done.some(line => line.includes('被撤掉的旧账')));
    assert.equal(view.canon.length, 1, '同一原著节点归成一处');
    assert.ok(view.canon[0].includes('纳兰嫣'));
    assert.ok(view.canon[0].includes('加速'));
    assert.ok(view.canon[0].includes('拍卖场被砸、云岚宗过问'), '同一节点的几条抄在一起');
    assert.equal(view.future.length, 1, '已应验并落成的不算以后');
    assert.ok(view.future[0].includes('埋着') && view.future[0].includes('坊市斗殴'), '以后只留埋着的因');
    assert.ok(view.future[0].includes('当年的旧账'), '以后要写清因是什么');
    assert.ok(!view.future[0].includes('天'), '以后的文案里不出现天数');
    assert.equal(view.sunk, 1);
    assert.equal(view.pending, 1);
    assert.equal(view.soon, 0, '不再有“三日内到期”这个口径');
    assert.equal(view.materialized, 1);

    const empty = impactThreeQuestions([], { day: 3 });
    assert.deepEqual(empty.done, []);
    assert.deepEqual(empty.canon, []);
    assert.deepEqual(empty.future, []);
    assert.equal(empty.pending, 0);
    assert.deepEqual(impactThreeQuestions(null).done, []);
}

// —— impactAnswers：三问是每条影响自己的属性，不是整页汇总 ——
{
    const buried = {
        id: 'i9', title: '药铺断货', detail: '乌坦城的药材被扫空', target: '乌坦城坊市',
        kind: 'direct', weight: 'major', certainty: 'certain', state: 'sunk',
        day: 5, seed: '玩家上次扫空药铺', trigger: '萧炎要买药救师父',
        links: [{ type: 'faction', name: '萧家' }],
        effects: [{ type: 'event', title: '药铺挂出缺货牌' }],
        canon: '三年之约', shift: 'accelerate',
    };
    const answers = impactAnswers(buried, { children: [{ id: 'i10', title: '别家药铺抬价', day: 5 }] });
    assert.ok(answers.done.includes('直接'), '第一问写清了这条影响是什么性质');
    assert.ok(answers.done.includes('大事'), '第一问带分量');
    assert.ok(answers.done.includes('萧家'), '第一问带牵涉');
    assert.ok(answers.canon.includes('三年之约') && answers.canon.includes('加速'), '第二问写清原著节点与偏移');
    assert.ok(answers.future.includes('因：玩家上次扫空药铺'), '第三问写清因');
    assert.ok(answers.future.includes('等：萧炎要买药救师父'), '第三问写清等什么场面');
    assert.ok(answers.future.includes('不按日子算'), '第三问明确否掉时间口径');
    assert.ok(!answers.future.includes('天'), '第三问里不再出现天数');
    assert.ok(answers.future.includes('别家药铺抬价'), '第三问带出了后续余波');
    const noCanon = impactAnswers({ ...buried, canon: '', shift: 'none' });
    assert.equal(noCanon.canon, '', '没牵动原著就是空串，由调用方决定怎么显示');
    const done = impactAnswers({ ...buried, state: 'ripened', materialized: true, outcomeEventId: 'e9', materializedDay: 6, hit: '他在药铺门口被拦下' });
    assert.ok(done.future.includes('e9'), '已落成的第三问指向真实世界事件');
    assert.ok(done.future.includes('撞上的场面：他在药铺门口被拦下'), '落成的说出了撞上的场面');
    const rumor = impactAnswers({ ...buried, state: 'active', certainty: 'rumor' });
    assert.ok(rumor.future.includes('风闻') || rumor.future.includes('风声'), '传闻口径说明只是风声');
    const closed = impactAnswers({ ...buried, state: 'closed' });
    assert.ok(closed.future.includes('了结') || closed.future.includes('收场'), '了结的影响第三问要说清楚不再演');
    assert.ok(impactAnswers({ ...buried, id: 'i11', kind: 'ripple', certainty: 'rumor' }).done.includes('传闻'));
}


// 原著偏移的四段口径：节点｜怎么改｜改成了什么样（canonWhat 有货才写第三段）。
{
    const record = { id: 'i12', day: 6, kind: 'butterfly', weight: 'major', title: '退婚提前了', detail: 'd', target: '乌坦城萧家',
        canon: '三年之约', shift: 'accelerate', canonWhat: '退婚从三年后提前到今年年尾', canonBasis: '玩家当众拿出一封密信' };
    const answers = impactAnswers(record);
    assert.ok(answers.canon.includes('三年之约'), '第二问带节点');
    assert.ok(answers.canon.includes('加速'), '第二问带偏移');
    assert.ok(answers.canon.includes('提前到今年年尾'), '第二问带“改成了什么样”');
    const bare = impactAnswers({ ...record, canonWhat: '' });
    assert.ok(!bare.canon.includes('：'), '没写改了什么就只到“怎么改”，不甩一个空冒号');
}

// 身家后果压成一行：金币、行囊、境界各说各的。
{
    const record = { effects: [
        { type: 'self', field: 'gold', amount: 120 },
        { type: 'self', field: 'gold', amount: -30 },
        { type: 'self', field: 'item', name: '玄铁片', count: 2 },
        { type: 'self', field: 'item', name: '三株药材', count: -1 },
        { type: 'self', field: 'realm', realm: '斗师', stage: '三星' },
    ] };
    const text = effectsSummary(record);
    assert.ok(text.includes('金币+120'), '正向金币带号');
    assert.ok(text.includes('金币-30'), '负向金币照写');
    assert.ok(text.includes('行囊·玄铁片+2'));
    assert.ok(text.includes('行囊·三株药材-1'));
    assert.ok(text.includes('境界→斗师三星'));
}

// —— 原著线当前态：同名节点取最新偏移；修复过的不算；注入里单独成段 ——
{
    const lines = canonLineSummary([
        { id: 'i1', day: 3, canon: '纳兰嫣然退婚', shift: 'alter', canonWhat: '没有退婚', state: 'ripened' },
        { id: 'i2', day: 9, canon: '三年之约', shift: 'avoid', canonWhat: '玩家没去赴约', state: 'closed' },
        { id: 'i3', day: 12, canon: '退婚之事', shift: 'alter', canonWhat: '退婚照旧但加了赌注', state: 'active' },
        { id: 'i4', day: 5, canon: '云岚宗之战', shift: 'accelerate', state: 'reverted' },
        { id: 'i5', day: 15, canon: '云岚宗之战', shift: 'accelerate', canonWhat: '提前开打', state: 'active' },
    ]);
    assert.equal(lines.length, 3, `四条线收拢成三行（云岚宗之战的修复态被剔除）：${JSON.stringify(lines)}`);
    assert.match(lines[0], /^云岚宗之战：已加速——提前开打$/, '不带天数戳与原始编号：那都是记录员/判定官材料的事');
    assert.match(lines.find(line => line.startsWith('纳兰嫣然退婚')), /退婚照旧但加了赌注/, '同名节点取最新一条（第 12 天的盖掉第 3 天的）');
    assert.match(lines.find(line => line.startsWith('三年之约')), /已避过——玩家没去赴约/, '了结过的偏移照样是既成事实');
}
{
    const detail = buildImpactInjectionDetail([
        { id: 'i2', day: 9, title: '避过三年之约', detail: '玩家没去赴约', target: '云岚宗', weight: 'major', canon: '三年之约', shift: 'avoid', canonWhat: '玩家没去赴约', state: 'active' },
    ]);
    assert.match(detail.text, /原著线当前态/, '兜底注入也要带原著线当前态');
    assert.match(detail.text, /已避过——玩家没去赴约/);
}

console.log('impact ops tests passed');

