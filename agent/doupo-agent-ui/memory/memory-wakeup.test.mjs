import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildWakeUpSummary, WAKEUP_HEADER } from './memory-wakeup.js';

const entry = (id, tag, title, day, extra = {}) => ({ id, tier: 'big', text: '正文', title, tag, day, related: ['穆蛇'], aliases: [], weight: 'minor', ...extra });
const world = {
    clock: { day: 97, minute: 720, label: '午时' },
    info: { location: '乌坦城', weather: '晴', era: '斗气大陆', reputation: '', wanted: '' },
    nearEvents: [], worldEvents: [],
    tasks: [{ id: 't1', title: '硝石生意', detail: '和穆蛇合伙', day: 95, status: 'active' }, { id: 't2', title: '旧债', detail: '已结清', day: 90, status: 'done' }, { id: 't3', title: '买药', detail: '给药老备的', day: 96, status: 'active' }],
};
const records = [
    { name: '穆蛇', presence: '在场', importance: '重要', lastFloor: 12 },
    { name: '萧薰儿', presence: '在场', importance: '重要', lastFloor: 20 },
    { name: '乌坦城卫兵', presence: '在场', importance: '不重要', lastFloor: 14 },
    { name: '药老', presence: '不在场', importance: '重要', lastFloor: 30 },
];

await test('OPT-053 full assembly: clock/season/presence/tasks/threads/grudges in one digest', () => {
    const summary = buildWakeUpSummary({
        worldSnapshot: world,
        memorySnapshot: { entries: [entry('m1', 'thread', '魔核到手前的风声', 96), entry('m2', 'grudge', '穆蛇欠的三条命债', 40), entry('m3', '', '无关条目', 99)] },
        npcRecords: records,
    });
    const lines = summary.split('\n');
    assert.equal(lines[0], WAKEUP_HEADER);
    assert.equal(lines[1], '时间：第 97 天·夏季·乌坦城（晴）', '97 天落在 91-180 的夏季区间');
    assert.equal(lines[2], '在场人物：萧薰儿★、穆蛇★、乌坦城卫兵', '重要在前且带 ★，不在场的药老不进名单');
    assert.equal(lines[3], '待办任务：硝石生意（第 95 天接）、买药（第 96 天接）', 'done 任务不进摘要');
    assert.equal(lines[4], '未了线头：魔核到手前的风声');
    assert.equal(lines[5], '旧账恩怨：穆蛇欠的三条命债');
    assert.equal(lines.length, 6);
});

await test('OPT-053 tag sections sort newest first and cap at three, superseded excluded', () => {
    const entries = [
        entry('m1', 'thread', '线头旧', 10),
        entry('m2', 'thread', '线头新', 20),
        entry('m3', 'thread', '线头三', 15),
        entry('m4', 'thread', '线头四', 30),
        entry('m5', 'thread', '线头五', 25),
        entry('m6', 'thread', '被覆盖的线头', 50, { supersededBy: 'm9' }),
    ];
    const summary = buildWakeUpSummary({ memorySnapshot: { entries }, worldSnapshot: {}, npcRecords: [] });
    const line = summary.split('\n').find(item => item.startsWith('未了线头：'));
    assert.equal(line, '未了线头：线头四、线头五、线头新');
    assert.equal(summary.includes('旧账恩怨：'), false, 'no grudge tag means no grudge line');
    assert.equal(summary.split('\n').some(line => line.startsWith('时间：')), false, 'no clock means no time line');
    assert.equal(summary.split('\n').some(line => line.startsWith('在场人物：')), false);
    assert.equal(summary.split('\n').some(line => line.startsWith('待办任务：')), false);
});

await test('OPT-053 budget truncates from the tail and never goes below a floor', () => {
    const entries = Array.from({ length: 10 }, (_, index) => entry(`m${index}`, 'thread', `很长很长的线头标题第${index}条讲述一整段旧事的来龙去脉`, index));
    const summary = buildWakeUpSummary({ memorySnapshot: { entries }, maxChars: 120 });
    assert.equal(summary.length <= 120, true, `truncated to budget, got ${summary.length}`);
    assert.equal(summary.endsWith('…'), true);
    assert.equal(buildWakeUpSummary({ memorySnapshot: { entries }, maxChars: 1 }).length, 80, 'minimum cap keeps the digest readable');
});

await test('OPT-053 empty ledgers return an empty string so nothing gets injected', () => {
    assert.equal(buildWakeUpSummary({}), '');
    assert.equal(buildWakeUpSummary({ worldSnapshot: { clock: { day: 5 } } }).includes('时间：第 5 天'), true, 'clock alone still says the day');
    assert.equal(buildWakeUpSummary({ worldSnapshot: world, memorySnapshot: { entries: [] }, npcRecords: [{ name: '穆蛇', presence: '在场' }] }).includes('在场人物'), true);
});

await test('OPT-053 malformed inputs degrade instead of throwing', () => {
    assert.equal(buildWakeUpSummary({ worldSnapshot: null, memorySnapshot: null, npcRecords: null }), '');
    assert.equal(buildWakeUpSummary({ worldSnapshot: { clock: { day: 'x' } }, npcRecords: [null, 'junk', { presence: '在场' }], memorySnapshot: { entries: [null] } }), '');
});
