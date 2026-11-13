import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { createMemoryRuntime } from './memory/memory-runtime.js';
import { sameMemoryState } from './host/db-tables.js';

// Exercise actual entry functions, not copies of the intended adoption algorithm.
// 归一化行尾：Windows 检出（autocrlf）会把源码变 CRLF，源码文本断言按 LF 写，先统一。
const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function extract(start, end) {
    assert.equal(source.split(start).length, 2, `unique entry declaration: ${start}`);
    const from = source.indexOf(start), to = source.indexOf(end, from);
    assert.ok(to > from, `entry boundary: ${end}`);
    return source.slice(from, to);
}
const entryCode = [
    extract('function memoryTableAdoptable(', '\nfunction mergeMemoryFromTables('),
    extract('function mergeMemoryFromTables(', '\n/** 世界状态跟着聊天走'),
    extract('function restoreMemoryFromChat(', '\n/** 总控'),
    extract('async function adoptMemoryFromDb(', '\nfunction persistMemory('),
    extract('function persistMemory(', '\n// ---------- 记忆召回决定'),
].join('\n');
const NOW = () => '2026-11-05T00:00:00.000Z';
const clone = value => structuredClone(value);
const plain = value => JSON.parse(JSON.stringify(value));
const entry = (id, text) => ({ id, text, title: text.slice(0, 14), tier: 'small', related: ['坊市'], aliases: [], day: 1 });
const badMetadata = { retiredSeqRanges: [['3', '2']], externalRetiredIds: [] };
const localState = () => ({
    entries: [entry('m300', '本地保留')], log: [], retiredIds: ['m201'],
    retiredSeqRanges: [['1', '201']], externalRetiredIds: ['m001'], legacy_gap: true, updatedAt: NOW(),
});
// DB-derived frames have entries only: never invent an external tombstone union.
const dbFrame = (...entries) => ({ schemaVersion: 2, entries, log: [], updatedAt: NOW() });
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness({ state = localState(), database = null, record = null, rejectNextRestore = false } = {}) {
    const runtime = createMemoryRuntime({ now: NOW });
    assert.equal(runtime.restore(state).status, 'restored', 'real fixture must be valid');
    const calls = { saves: [], mirrors: [], refreshes: [], restores: [], adoptions: 0, resets: 0 };
    let nextDatabase = database, chatRecord = record, reject = rejectNextRestore;
    let scope = 0;
    const facade = Object.freeze({
        ...runtime,
        // Forward the real read-only predicate, including compact range behavior.
        isRetired: runtime.isRetired,
        restore(candidate) {
            // Deliberate fault seam: a normal DB frame has no tombstone metadata.
            // Reject via the REAL runtime validator, never a fabricated result.
            const input = reject ? { ...candidate, ...badMetadata } : candidate;
            reject = false;
            const result = runtime.restore(input);
            calls.restores.push({ candidate: clone(candidate), result: clone(result) });
            return result;
        },
        reset() { calls.resets += 1; return runtime.reset(); },
    });
    const api = runInNewContext(`${entryCode}\n;({mergeMemoryFromTables, adoptMemoryFromDb, restoreMemoryFromChat})`, {
        agentMemoryRuntime: facade, sameMemoryState, structuredClone, console,
        captureAgentContinuation: () => { const captured = scope; return { current: () => captured === scope }; },
        hostStorage: {
            memoryState: () => chatRecord,
            saveMemoryState: async snapshot => { calls.saves.push(clone(snapshot)); return { status: 'saved' }; },
        },
        agentDbBridge: {
            adoptMemory: async () => { calls.adoptions += 1; return typeof nextDatabase === 'function' ? nextDatabase() : clone(nextDatabase); },
            mirrorMemory: async snapshot => { calls.mirrors.push(clone(snapshot)); return { status: 'mirrored' }; },
        },
        // persistMemory 会顺带请求向量补嵌；语义检索在切片之外，这里桩掉。
        syncMemoryVectors: () => {},
        refreshMemoryPage: () => calls.refreshes.push(runtime.snapshot()),
    });
    return { ...api, runtime, calls, setDatabase(value) { nextDatabase = value; }, switchRecord(value) { scope += 1; chatRecord = value; } };
}

await test('OPT-050 merge filters old m1 covered only by compact ranges, not recent retiredIds', () => {
    const h = harness();
    const current = h.runtime.snapshot();
    assert.equal(current.retiredIds.includes('m1'), false);
    assert.equal(h.runtime.isRetired('m1'), true, 'real compact tombstone fixture');
    const merged = h.mergeMemoryFromTables(dbFrame(entry('m1', '旧帧复活'), entry('m301', '新表条目')), current);
    assert.deepEqual(Array.from(merged.entries, item => item.id), ['m300', 'm301'], 'compact-retired m1 must never reappear in candidate');
});

await test('OPT-050 actual DB adoption cannot resurrect compact-retired m1', async () => {
    const h = harness({ database: dbFrame(entry('m1', '旧帧复活'), entry('m301', '合法新条目')) });
    await h.adoptMemoryFromDb();
    assert.deepEqual(h.runtime.snapshot().entries.map(item => item.id), ['m300', 'm301']);
    assert.equal(h.runtime.isRetired('m1'), true);
});

await test('OPT-050 tombstone-free DB candidate preserves local compact fields and local-only entries', async () => {
    const h = harness({ database: dbFrame(entry('m301', '合法新条目')) });
    const before = h.runtime.snapshot();
    const candidate = h.mergeMemoryFromTables(dbFrame(entry('m301', '合法新条目')), before);
    for (const key of ['retiredIds', 'retiredSeqRanges', 'externalRetiredIds', 'legacy_gap', 'log']) {
        assert.deepEqual(plain(candidate[key]), plain(before[key]), `preserve current ${key} without invented DB metadata`);
    }
    await h.adoptMemoryFromDb();
    const after = h.runtime.snapshot();
    for (const key of ['retiredIds', 'retiredSeqRanges', 'externalRetiredIds', 'legacy_gap']) assert.deepEqual(after[key], before[key]);
    assert.deepEqual(after.entries.map(item => item.id), ['m300', 'm301']);
});

await test('OPT-050 rejected runtime restore in adoption must not persist, refresh or mirror', async () => {
    const h = harness({ database: dbFrame(entry('m301', '拒绝提交')), rejectNextRestore: true });
    const before = h.runtime.snapshot();
    await h.adoptMemoryFromDb();
    assert.equal(h.calls.restores.length, 1);
    assert.equal(h.calls.restores[0].result.status, 'rejected', 'real runtime rejected malformed candidate metadata');
    assert.deepEqual(h.runtime.snapshot(), before, 'failed real restore leaves ledger intact');
    assert.deepEqual({ persist: h.calls.saves.length, refresh: h.calls.refreshes.length, mirror: h.calls.mirrors.length }, { persist: 0, refresh: 0, mirror: 0 });
});

await test('OPT-050 chat restore receiving real rejection must not mirror or persist', async () => {
    const h = harness({ state: { entries: [], retiredIds: [], retiredSeqRanges: [], externalRetiredIds: [], legacy_gap: false } });
    h.switchRecord({ status: 'ready', value: { entries: [entry('m9', '坏存档')], ...badMetadata } });
    const result = h.restoreMemoryFromChat();
    assert.equal(result.status, 'rejected');
    await flush();
    assert.deepEqual({ persist: h.calls.saves.length, refresh: h.calls.refreshes.length, mirror: h.calls.mirrors.length }, { persist: 0, refresh: 0, mirror: 0 });
});

await test('OPT-050 switching to bad-metadata chat must not retain previous chat ledger', async () => {
    const h = harness({ state: { ...localState(), entries: [entry('m300', '前聊天私密旧账')] } });
    h.switchRecord({ status: 'ready', value: { entries: [entry('m9', '新聊天坏存档')], ...badMetadata } });
    assert.equal(h.restoreMemoryFromChat().status, 'rejected');
    await flush();
    assert.deepEqual(h.runtime.snapshot().entries, [], 'invalid new-chat save must fail closed instead of retaining previous-chat facts');
    assert.equal(h.runtime.isRetired('m1'), false, 'previous-chat compact state must not leak either');
});

await test('OPT-050 current chat changes during pending DB read reject stale adoption without effects', async () => {
    let resolve;
    const pending = new Promise(done => { resolve = done; });
    const h = harness({ database: () => pending });
    const task = h.adoptMemoryFromDb();
    h.switchRecord(null);
    const before = h.runtime.snapshot();
    resolve(dbFrame(entry('m301', '过期回包')));
    assert.equal((await task).status, 'stale');
    assert.deepEqual(h.runtime.snapshot(), before);
    assert.equal(h.calls.restores.length + h.calls.saves.length + h.calls.refreshes.length + h.calls.mirrors.length, 0);
});
