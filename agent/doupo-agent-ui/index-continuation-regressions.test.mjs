import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const extract = (start, end) => {
    assert.equal(source.split(start).length, 2, `unique ${start}`);
    const at = source.indexOf(start), to = source.indexOf(end, at);
    assert.ok(to > at, `end ${end}`);
    return source.slice(at, to);
};
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const prepareCode = extract('async function prepareInjectionForPrompt(', '\n// —— 行动结算·最终判定');
function prepareHarness() {
    const pending = deferred(), writes = [], inputs = [];
    let current = true;
    const channel = { clear() {}, inspect: () => ({ status: 'ready' }), write: value => { writes.push(value); return { status: 'written' }; } };
    const run = runInNewContext(`${prepareCode}; prepareInjectionForPrompt`, {
        captureAgentContinuation: () => ({ current: () => current }), currentSettings: () => ({ enabled: true }),
        writeWorldInjectionForPrompt() {}, writeImpactInjectionForPrompt: async () => {}, writeNpcLedgerInjectionForPrompt() {},
        writeSelfInjectionForPrompt() {}, writeMemoryInjectionForPrompt: async () => {},
        injectionSettings: () => ({ enabled: true, depth: 0, maxChars: 0 }), sandboxModeActive: () => false,
        agentPromptInjection: channel, persistFactsLastInjection() {}, currentAgentScope: () => ({ sessionId: 'A', branchId: 'main' }),
        agentTurnStages: { resolveInjection: request => { inputs.push(request); return pending.promise; } }, lastLookupInfo: null,
        getHostContext: () => ({ chat: [] }),
    });
    return { run, pending, writes, inputs, invalidate: () => { current = false; } };
}
{
    const harness = prepareHarness();
    const task = harness.run({ chat: [{ is_user: true, mes: 'A private input' }, { mes: 'old reply' }] });
    await new Promise(resolve => setImmediate(resolve));
    harness.invalidate(); harness.pending.resolve({ text: 'A private facts' });
    assert.equal((await task).status, 'stale');
    assert.equal(harness.writes.length, 0, 'old facts must never reach current channel');
}
{
    const harness = prepareHarness();
    const task = harness.run({ chat: [{ is_user: true, mes: 'current player input' }, { mes: 'reply1' }, { mes: 'reply2' }] });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(harness.inputs[0]?.input, 'current player input', 'two AI messages must not hide newest player input');
    harness.pending.resolve({ text: 'current facts' });
    assert.equal((await task).status, 'written');
}
{
    const code = extract('async function writeImpactInjectionForPrompt(', '\n/** 上一轮卷外搜索');
    const pending = deferred(), writes = [], snapshot = { version: 1, records: [{ id: 'i1' }] };
    let current = true;
    const run = runInNewContext(`${code}; writeImpactInjectionForPrompt`, {
        captureAgentContinuation: () => ({ current: () => current }), currentSettings: () => ({ enabled: true }),
        impactSettings: () => ({ enabled: true, inject: true, injectSmart: true, injectBudget: 500 }),
        agentImpactPromptInjection: { inspect: () => ({ status: 'ready' }), clear() {}, write: value => { writes.push(value); return { status: 'written' }; } },
        agentImpactRuntime: { snapshot: () => snapshot }, worldDay: () => 1, getHostContext: () => ({ chat: [] }),
        impactConversation: chat => ({ draft: chat[0]?.mes ?? '', floors: chat }), impactModelPlan: () => ({ inject: {} }),
        pickImpactsForPrompt: () => pending.promise, lastImpactInjection: null, lastInjectedIds: [],
        buildImpactInjectionFromPicksDetail: () => ({ text: 'A private impact', usedIds: ['i1'] }),
        buildImpactInjectionDetail: () => ({ text: 'A fallback', usedIds: ['i1'] }), injectionSettings: () => ({ depth: 0 }), renderImpactLibrary() {},
        settleScopeKey: () => 'A', agentWorldRuntime: { snapshot: () => ({ day: 1 }) }, agentContinuationEpoch: 0,
    });
    const task = run({ chat: [{ mes: 'A private story' }] });
    current = false; pending.resolve({ status: 'ok', picks: ['i1'] });
    assert.equal((await task).status, 'stale');
    assert.equal(writes.length, 0, 'old impact selection must not write new chat');
}
{
    const code = extract('function memoryRecallCacheKey(', '\nfunction setMemoryRecallStatus');
    let scope = 'A', memory = { entries: [{ id: 'm1', text: 'old' }] }, settings = { memory: { recallPrompt: 'one' } };
    const key = runInNewContext(`${code}; memoryRecallCacheKey`, {
        settleScopeKey: () => scope, agentContinuationEpoch: 1, currentSettings: () => settings,
        agentMemoryRuntime: { snapshot: () => memory },
    });
    const chat = [{ is_user: true, mes: 'input' }, { mes: 'same length A' }], first = key(chat);
    scope = 'B'; assert.notEqual(key(chat), first, 'cache binds chat scope'); scope = 'A';
    chat[1].mes = 'same length B'; assert.notEqual(key(chat), first, 'cache binds complete scene'); chat[1].mes = 'same length A';
    memory = { entries: [{ id: 'm1', text: 'new' }] }; assert.notEqual(key(chat), first, 'cache binds ledger content');
    memory = { entries: [{ id: 'm1', text: 'old' }] }; settings.memory.recallPrompt = 'two'; assert.notEqual(key(chat), first, 'cache binds selection settings');
}
{
    const code = extract('async function adoptSelfFromDb(', '\n/** 数据库可视化器');
    const pending = deferred(), restores = [], mirrors = [];
    const previous = { items: [], updatedAt: '2026-11-04T00:00:00Z' };
    let current = true;
    const run = runInNewContext(`${code}; adoptSelfFromDb`, {
        captureAgentContinuation: () => ({ current: () => current }), agentDbBridge: { adoptSelf: () => pending.promise },
        agentSelfRuntime: { snapshot: () => previous, restore: value => restores.push(value) },
        sameSelfState: () => false, dbStateAdoptable: () => true,
        preserveUnmappedSelfFields: value => value, persistSelf: () => mirrors.push('persist'), refreshSelfPage() {}, console,
    });
    const task = run(); current = false; pending.resolve({ items: [{ id: 'b1', name: 'A-only' }] }); await task;
    assert.equal(restores.length, 0, 'old DB adoption cannot restore current runtime');
    assert.equal(mirrors.length, 0);
}
{
    const code = extract('function mergeMemoryFromTables(', '\n/** 世界状态跟着聊天走');
    const merge = runInNewContext(`${code}; mergeMemoryFromTables`, { agentMemoryRuntime: { isRetired: () => false } });
    const local = { entries: [{ id: 'm1', text: 'local changed', note: 'hidden' }, { id: 'm3', text: 'local only' }], retiredIds: ['m2'], log: ['local log'] };
    const merged = merge({ entries: [{ id: 'm1', text: 'DB changed' }, { id: 'm2', text: 'retired' }, { id: 'm4', text: 'new DB' }] }, local);
    assert.deepEqual(Array.from(merged.entries, entry => entry.id), ['m1', 'm3', 'm4']);
    assert.equal(merged.entries[0].text, 'DB changed'); assert.equal(merged.entries[0].note, 'hidden');
    assert.deepEqual(merged.retiredIds, local.retiredIds); assert.deepEqual(merged.log, local.log);
}
{
    const code = extract('async function adoptSelfFromDb(', '\n/** 数据库可视化器');
    const restored = [];
    const run = runInNewContext(`${code}; adoptSelfFromDb`, {
        captureAgentContinuation: () => ({ current: () => true }),
        agentDbBridge: { adoptSelf: async () => ({ items: [{ id: 'b1', name: 'DB-only' }], updatedAt: '2026-11-03T00:00:00Z' }) },
        agentSelfRuntime: { snapshot: () => ({ items: [], updatedAt: '2026-11-04T00:00:00Z' }), restore: value => restored.push(value) },
        sameSelfState: () => false, dbStateAdoptable: () => false, preserveUnmappedSelfFields: value => value,
        persistSelf() {}, refreshSelfPage() {}, console,
    });
    assert.equal((await run({ hasLocal: false })).status, 'adopted', 'missing local save must not outrank older valid DB');
    assert.equal(restored[0].items[0].name, 'DB-only');
    assert.equal((await run({ hasLocal: true })).status, 'older', 'existing newer local save remains authoritative');
}
{
    const code = extract('function confirmNpcColdPreview(', '\nfunction discardNpcColdPreview');
    const applied = [], marked = [], preview = { id: 'cold-1', name: 'A', patch: {}, toDay: 3 };
    let valid = false;
    const confirm = runInNewContext(`${code}; confirmNpcColdPreview`, {
        agentNpcColdRuntime: { status: () => ({ previews: [{ ...preview, status: 'pending' }] }),
            validatePreview: () => ({ status: valid ? 'ready' : 'stale' }), mark: (name, value) => marked.push(value) },
        agentNpcLedger: { get: () => ({ version: 2 }) }, applyNpcLedgerPayload: () => { applied.push(1); return { status: 'applied' }; },
        getHostContext: () => ({ chat: [] }), lastReplyIndex: () => 0, persistNpcLedger() {}, persistNpcCold() {}, setNpcLedgerStatus() {}, refreshNpcLedgerPage() {},
    });
    assert.equal(confirm('cold-1').status, 'stale'); assert.equal(applied.length, 0);
    valid = true; assert.equal(confirm('cold-1').status, 'confirmed'); assert.equal(marked[0].previewId, 'cold-1');
}
{
    const code = extract('function confirmExpCondense(', '\n\n/** 取“玩家');
    let replaced = false;
    const confirm = runInNewContext(`${code}; confirmExpCondense`, {
        pendingExpCondense: { name: 'A', entries: [], continuation: { current: () => false }, recordVersion: '{}' },
        agentNpcLedger: { get: () => ({}), replaceExp: () => { replaced = true; } }, setNpcLedgerStatus() {},
    });
    assert.equal(confirm(null, 'A').status, 'stale'); assert.equal(replaced, false);
}
console.log('index continuation regression tests passed');
