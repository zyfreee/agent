import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPersonView, personNames, personSummary, PERSON_VIEW_KINDS } from './person-view.js';

const record = {
    name: '穆蛇', aliases: ['蛇哥'], titles: ['坊市混头'], identity: '佣兵', realm: '斗者九段',
    favor: 25, attitude: '忌惮', presence: '在场',
    favorLog: [{ floor: 9, day: 4, delta: 5, reason: '帮他解围' }, { floor: 3, day: 2, delta: -3, reason: '抢了生意' }],
    exp: [{ text: '被赶出坊市', day: 3, floor: 6 }],
    log: [{ text: '扬言要找回场子', day: 3, floor: 7, src: '冷藏' }],
};
const entry = (id, related, aliases = [], extra = {}) => ({ id, tier: 'small', text: '正文', title: '标题', related, aliases, day: 1, ...extra });
const world = {
    nearEvents: [{ id: 'e1', scope: 'near', day: 5, title: '穆蛇拦路', text: '他在坊市北口勒索', basis: '', weight: 'minor', done: false }],
    worldEvents: [{ id: 'e2', scope: 'world', day: 6, title: '坊市整顿', text: '穆蛇被驱逐出坊市', basis: '玩家举报', weight: 'major', done: true, resolvedDay: 7 }],
    tasks: [{ id: 't1', title: '向穆蛇讨债', detail: '他欠的钱还没还', day: 4, status: 'active' }, { id: 't2', title: '修炼焚诀', detail: '闭关打磨斗气', day: 2, status: 'done' }],
};

await test('personNames merges name/aliases/titles and dedups', () => {
    assert.deepEqual(personNames(record), ['穆蛇', '蛇哥', '坊市混头']);
    assert.deepEqual(personNames(null), []);
    assert.deepEqual(personNames({ name: ' 药老 ', aliases: ['药老', ''] }), ['药老']);
});

await test('OPT-051 memory joins by exact key, alias and bidirectional containment', () => {
    const view = buildPersonView({
        record,
        entries: [
            entry('m1', ['穆蛇']),
            entry('m2', ['坊市'], ['蛇哥']),
            entry('m3', ['蛇人穆蛇']), // 档案名"穆蛇"是钥匙的子串 → 双向包含命中
            entry('m4', ['纳兰嫣然']),
            { ...entry('m5', ['蛇']), day: 2 }, // 单字钥匙只认全等，"蛇"≠"穆蛇"不命中
        ],
    });
    assert.deepEqual(view.timeline.filter(item => item.kind === 'memory').map(item => item.meta), ['m1', 'm2', 'm3']);
});

await test('OPT-051 world events and tasks join by name containment in body text', () => {
    const view = buildPersonView({ record, entries: [], worldSnapshot: world });
    const events = view.timeline.filter(item => item.kind === 'event');
    const tasks = view.timeline.filter(item => item.kind === 'task');
    assert.deepEqual(events.map(item => item.meta), ['e2', 'e1'], 'day desc: world e2 (day 6) before near e1 (day 5)');
    assert.equal(events[0].text.includes('★'), true, 'major event keeps its star');
    assert.equal(events[0].text.includes('已了结'), true);
    assert.deepEqual(tasks.map(item => item.meta), ['t1']);
    assert.equal(tasks[0].text.includes('进行中'), true);
});

await test('OPT-051 ledger streams all land on the timeline with their own days', () => {
    const view = buildPersonView({ record, entries: [entry('m1', ['穆蛇'], [], { day: 6 })], worldSnapshot: world });
    assert.deepEqual(view.timeline.map(item => item.day), [6, 6, 5, 4, 4, 3, 3, 2]);
    const kinds = Object.fromEntries(Object.entries(view.counts).filter(([, count]) => count > 0));
    assert.deepEqual(kinds, { event: 2, task: 1, favor: 2, memory: 1, exp: 1, log: 1 });
    assert.equal(view.total, 8);
    assert.equal(view.summary.includes('好感 25（友善）'), true, 'favor summary uses favorLabel bands');
    assert.equal(view.summary.includes('在场'), true);
});

await test('OPT-051 limit truncates but counts keep full totals', () => {
    const entries = Array.from({ length: 8 }, (_, index) => entry(`m${index}`, ['穆蛇'], [], { day: index + 1 }));
    // 用 fallbackName 隔离：不带档案流，时间线只含这 8 条记忆。
    const view = buildPersonView({ fallbackName: '穆蛇', entries, limit: 3 });
    assert.equal(view.total, 8);
    assert.equal(view.timeline.length, 3);
    assert.equal(view.counts.memory, 8);
    assert.deepEqual(view.timeline.map(item => item.day), [8, 7, 6]);
});

await test('OPT-051 superseded memory stays on the timeline with a marker', () => {
    const view = buildPersonView({ record, entries: [entry('m1', ['穆蛇'], [], { supersededBy: 'm9' })] });
    const memory = view.timeline.find(item => item.kind === 'memory');
    assert.equal(memory.text.includes('已替代→m9'), true);
});

await test('OPT-051 fallback key without a ledger record still matches memory keys exactly', () => {
    const view = buildPersonView({ fallbackName: '陨落心炎', entries: [entry('m1', ['陨落心炎']), entry('m2', ['心火'])], worldSnapshot: world });
    assert.deepEqual(view.timeline.map(item => item.meta), ['m1']);
    assert.equal(view.summary, '', 'no profile means no summary line');
    assert.deepEqual(view.timeline.filter(item => item.kind === 'event'), [], 'no record means no event join');
});

await test('OPT-051 empty inputs degrade to an empty view instead of throwing', () => {
    const view = buildPersonView({ record: null, fallbackName: '', entries: [], worldSnapshot: null });
    assert.deepEqual(view.timeline, []);
    assert.equal(view.total, 0);
    for (const kind of Object.keys(PERSON_VIEW_KINDS)) assert.equal(view.counts[kind], 0);
});

await test('OPT-051 personSummary drops empty rows and rejects bad favors', () => {
    assert.equal(personSummary({ name: '萧薰儿' }), '', 'no filled fields means empty summary');
    assert.equal(personSummary({ name: '萧薰儿', favor: 999, presence: '不在场' }).includes('好感 100'), true, 'favor clamps into scale');
});
