import assert from 'node:assert/strict';
import {
    IMPACT_HEADER,
    buildImpactInjection,
    buildImpactLedgerLines,
    impactMark,
    isImpactDecideDue,
    summarizeImpact,
} from '../impact/impact-ops.js';

const records = [
    { id: 'i1', day: 12, title: '拍卖场被砸', detail: '青灵丹被当众拍走', target: '乌坦城·拍卖场', kind: 'direct', weight: 'world', certainty: 'certain', evidence: '第 12 楼', canon: '退婚', shift: 'accelerate', state: 'active', ripenDay: null, resolution: '', parent: '', depth: 0 },
    { id: 'i2', day: 14, title: '坊间传闻', detail: '都说加列家族要报复', target: '乌坦城', kind: 'ripple', weight: 'minor', certainty: 'rumor', evidence: '第 18 楼', canon: '', shift: 'none', state: 'active', ripenDay: null, resolution: '', parent: '', depth: 0 },
    { id: 'i3', day: 15, title: '云岚宗过问', detail: '长老派人下山查青灵丹去向', target: '云岚宗', kind: 'butterfly', weight: 'major', certainty: 'certain', evidence: '第 21 楼', canon: '', shift: 'none', state: 'active', ripenDay: 22, resolution: '', parent: 'i1', depth: 1 },
    { id: 'i4', day: 9, title: '旧账', detail: '已经被消化', target: '萧家', kind: 'direct', weight: 'major', certainty: 'certain', evidence: '第 4 楼', canon: '', shift: 'none', state: 'closed', ripenDay: null, resolution: '赔钱了事', parent: '', depth: 0 },
    { id: 'i5', day: 10, title: '云岚宗来人', detail: '长老已经下山', target: '云岚宗', kind: 'butterfly', weight: 'major', certainty: 'certain', evidence: '第 15 楼', canon: '', shift: 'none', state: 'ripened', ripenDay: 11, ripenedDay: 11, resolution: '查到乌坦城', parent: 'i1', depth: 1 },
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

const injection = buildImpactInjection(records, { day: 12 });
assert.ok(injection.startsWith(IMPACT_HEADER));
assert.ok(injection.includes('★'));
assert.ok(injection.includes('？'));
assert.ok(injection.includes('原著·加速'));
assert.ok(injection.indexOf('拍卖场被砸') < injection.indexOf('坊间传闻'));
assert.ok(!injection.includes('旧账'), '已了结的影响不再注入');
assert.ok(injection.includes('云岚宗来人') && injection.includes('（已发酵）'), '已发酵但没收场的影响继续注入，并标出已发酵');
assert.ok(!injection.split('\n').some(line => line.startsWith('· ') && line.includes('云岚宗过问') && line.includes('｜')), '未到发酵日的影响不进正文清单');
assert.ok(injection.includes('还没发作'));
assert.ok(injection.includes('第 22 天'));

assert.equal(buildImpactInjection([], { day: 12 }), '');
assert.equal(buildImpactInjection([records[3]], { day: 12 }), '');

const tight = buildImpactInjection(records, { day: 12, maxChars: IMPACT_HEADER.length + 20 });
assert.equal(tight.split('\n').length, 2, '预算只够一行时保留抬头和第一条');
assert.ok(tight.split('\n')[1].includes('拍卖场被砸'));

const ledger = buildImpactLedgerLines(records, { day: 12 });
assert.ok(ledger[0].startsWith('#i1'));
assert.ok(ledger[1].startsWith('#i3'));
assert.ok(ledger[2].startsWith('#i2'));
assert.ok(ledger[3].startsWith('#i5'));
assert.ok(ledger[4].startsWith('#i4'));
assert.ok(ledger[0].includes('依据：第 12 楼'));
assert.ok(ledger[0].includes('原著·加速：退婚'));
assert.ok(ledger[1].includes('第 22 天起发酵'));
assert.ok(ledger[1].includes('源自：i1'));
assert.ok(ledger[4].includes('后续：赔钱了事'));
assert.equal(buildImpactLedgerLines(records, { day: 12, maxLines: 2 }).length, 2);
assert.deepEqual(buildImpactLedgerLines([], { day: 12 }), []);
assert.deepEqual(buildImpactLedgerLines(null, { day: 12 }), []);

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

console.log('impact ops tests passed');
