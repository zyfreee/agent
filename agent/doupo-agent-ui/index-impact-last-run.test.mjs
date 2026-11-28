import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

// 世界影响最近一轮的三条回执（上次记录 / 落成 / 本幕注入）本该跟着聊天走。
// 原来它们只活在内存变量里，Ctrl+F5 之后面板一律说「还没跑过」，
// 跟账本对不上：账本里明明记过一条，面板却说没记。
// 这组用例盯的就是「写进存档 → 刷新后读回来」这条链路。
const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function extract(start, end) {
    assert.equal(source.split(start).length, 2, `unique entry: ${start}`);
    const from = source.indexOf(start), to = source.indexOf(end, from);
    assert.ok(to > from, `entry boundary: ${end}`);
    return source.slice(from, to);
}

const code = extract('let impactLastRunCache = null;', '\n/** 生成前注入记忆存储');

function harness({ saved = null, live = null } = {}) {
    const book = { status: 'ready', value: saved ? { ...saved } : {} };
    const savedCalls = [];
    const stub = {
        let: null,
        lastImpactResult: null,
        lastMaterializeResult: null,
    };
    const api = runInNewContext(
        `let lastImpactResult = null;\nlet lastMaterializeResult = null;\n${code}
         ;({
             persistImpactLastRun, hydrateImpactLastRun, impactInjectionLastState,
             setRecord: value => { lastImpactResult = value; },
             getRecord: () => lastImpactResult,
             setMaterialize: value => { lastMaterializeResult = value; },
             getMaterialize: () => lastMaterializeResult,
         })`,
        {
            hostStorage: {
                chatState: () => ({ status: book.status, value: { ...book.value } }),
                saveChatState: value => { savedCalls.push(JSON.parse(JSON.stringify(value))); book.value = value; return Promise.resolve(); },
            },
            agentImpactInjection: { lastState: () => live },
            console: { warn() { /* 测试里不打印 */ } },
        },
    );
    return { ...api, book, savedCalls };
}

await test('IMP-LAST-1 记完一轮就把三条回执写进聊天存档', () => {
    const h = harness();
    h.setRecord({ day: 17, applied: [{ id: 'i1' }], rejected: [] });
    h.setMaterialize({ day: 17, rows: [{ status: 'materialized' }], chain: [], threads: [] });
    h.persistImpactLastRun();
    assert.equal(h.savedCalls.length, 1, '写一次存档');
    const saved = h.savedCalls[0].impactLastRun;
    assert.equal(saved.record.day, 17);
    assert.equal(saved.record.applied.length, 1);
    assert.equal(saved.materialize.rows.length, 1);
    assert.equal(saved.injection, null, '还没挑过注入就是 null，不是 {}');
});

await test('IMP-LAST-2 刷新之后从存档读回来，面板不再说「还没跑过」', () => {
    const h = harness({
        saved: {
            impactLastRun: {
                record: { day: 5, applied: [{ id: 'i2' }, { id: 'i3' }], rejected: [] },
                materialize: { day: 5, rows: [], chain: [{ id: 'r1' }], threads: ['线索推进'] },
                injection: null,
            },
        },
    });
    assert.equal(h.getRecord(), null, '刷新后内存是空的');
    h.hydrateImpactLastRun();
    assert.equal(h.getRecord().day, 5, '记录从存档回到内存');
    assert.equal(h.getRecord().applied.length, 2);
    assert.equal(h.getMaterialize().chain.length, 1);
    assert.deepEqual(h.getMaterialize().threads, ['线索推进']);
});

await test('IMP-LAST-3 注入那条读回来要标「已清理」：那段早就随生成结束清空了', () => {
    const h = harness({
        saved: {
            impactLastRun: {
                record: { day: 3, applied: [], rejected: [] },
                materialize: { day: 3, rows: [], chain: [], threads: [] },
                injection: { status: 'injected', via: 'llm', usedIds: ['i1', 'i2'] },
            },
        },
    });
    h.hydrateImpactLastRun();
    const state = h.impactInjectionLastState();
    assert.equal(state.status, 'injected');
    assert.equal(state.cleared, true, '从存档读回来的一定标已清理');
    assert.deepEqual(state.usedIds, ['i1', 'i2'], '条数还要说得出来');
});

await test('IMP-LAST-4 内存里有新的一轮时，以内存为准，不被旧存档盖掉', () => {
    const h = harness({
        saved: { impactLastRun: { record: { day: 1 }, materialize: { day: 1 }, injection: null } },
        live: { status: 'injected', via: 'llm', usedIds: ['i9'] },
    });
    h.hydrateImpactLastRun();
    h.setRecord({ day: 8, applied: [], rejected: [] });
    h.persistImpactLastRun();
    const saved = h.savedCalls[0].impactLastRun;
    assert.equal(saved.record.day, 8, '这一轮的记录优先');
    assert.equal(saved.injection.usedIds[0], 'i9', '注入用这一轮挑的，不是存档里那条');
});

await test('IMP-LAST-5 存档读不到/坏掉都不抛，退回「还没跑过」的干净状态', () => {
    const h = harness();
    h.book.status = 'missing';
    h.hydrateImpactLastRun();
    assert.equal(h.getRecord(), null);
    assert.equal(h.impactInjectionLastState(), null);
});
