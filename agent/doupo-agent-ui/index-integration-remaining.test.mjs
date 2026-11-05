import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { trimToVolume } from './narrative/setting-supply.js';
import { renderMemoryEntries, renderMemoryEntriesDetail } from './memory/memory-ops.js';

const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const extract = (start, end) => {
    const from = source.indexOf(start), to = source.indexOf(end, from);
    assert.ok(from >= 0 && to > from, `extract ${start}`);
    return source.slice(from, to);
};
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('OPT-018 consolidation cannot restore facts changed during model wait', async () => {
    const pending = deferred(), changes = [];
    let state = { entries: [{ id: 'm1', tier: 'small', text: 'original' }] };
    const code = extract('async function runMemoryConsolidation(', '\n// ---------- 模型调用体检');
    const run = runInNewContext(`${code}; runMemoryConsolidation`, {
        memorySettings: () => ({ enabled: true, consolidateAfter: 1, overrides: { connection: 'custom' }, consolidateOverrides: { connection: 'custom' } }),
        memoryConsolidateRunning: false, agentMemoryRuntime: { snapshot: () => structuredClone(state), consolidate: () => { changes.push('consolidate'); return { ok: true }; }, note: () => changes.push('note') },
        captureAgentContinuation: () => ({ current: () => true }), setMemoryConsolidateStatus() {}, buildConsolidateUser: () => 'input', worldDay: () => 1,
        agentLlmClient: { complete: () => pending.promise }, MEMORY_CONSOLIDATE_PROMPT: '', MEMORY_CONSOLIDATE_JSON_SCHEMA: {},
        parseConsolidation: () => ({ status: 'ok', big: {} }), persistMemory: () => changes.push('persist'), refreshMemoryPage() {},
    });
    const task = run(); state.entries[0].text = 'manual correction'; pending.resolve('{}');
    assert.equal((await task).status, 'stale'); assert.deepEqual(changes, []);
});

test('OPT-022/099 only the current shared worldbook request may submit', async () => {
    const code = extract('async function syncWorldbookIndex(', '\nfunction renderTurnExtras');
    const requests = [], indexed = [], status = { textContent: '' };
    let name = 'A';
    const run = runInNewContext(`${code}; ({syncWorldbookIndex, importWorldbookFromPanel})`, {
        worldbookLoadSequence: 0, currentSettings: () => ({ setting: { worldbook: name } }), getHostContext: () => ({}),
        captureAgentContinuation: () => ({ current: () => true }), loadWorldbookEntries: () => { const p = deferred(); requests.push(p); return p.promise; },
        splitPluginEntries: result => ({ data: result.entries, rawData: result.entries, native: [] }),
        agentSettingSupply: { clear() {}, register: () => ({ added: 1 }) }, agentFactsIndex: { load: value => indexed.push(value.entries), stats: () => ({ total: 1 }) },
        lastWorldbookNative: 0, summarizeWorldbookEntries: () => ({}), refreshWorldbookStats() {}, renderFactsStatus() {}, renderFactsBrowser() {}, console, EXTENSION_ID: 'test',
    });
    const old = run.syncWorldbookIndex(); name = 'B'; const current = run.importWorldbookFromPanel({ querySelector: () => status });
    requests[1].resolve({ status: 'ok', entries: [{ id: 'B' }], note: 'B ready' }); await current;
    const currentText = status.textContent;
    requests[0].resolve({ status: 'ok', entries: [{ id: 'A' }], note: 'A ready' });
    assert.equal((await old).status, 'stale'); assert.equal(indexed.filter(entries => entries.length).length, 1); assert.equal(indexed.at(-1)[0].id, 'B'); assert.equal(status.textContent, currentText);
    name = ''; await run.syncWorldbookIndex(); assert.equal(indexed.at(-1).length, 0, 'unset selection clears former book');
});

test('OPT-026/087 entry preserves manual and auto volume provenance', () => {
    const code = extract('    getProgress: () => {', '\n    onVolumeInferred:');
    let settings = { setting: { progress: 2 } };
    const get = runInNewContext(`({${code}}).getProgress`, { currentSettings: () => settings, agentStateStore: { read: () => ({ state: { currentVolume: 3 } }) }, currentAgentScope: () => ({}) });
    assert.equal(JSON.stringify(get()), JSON.stringify({ volume: 2, source: 'manual' }));
    settings = {}; assert.equal(JSON.stringify(get()), JSON.stringify({ volume: 3, source: 'auto' }));
});

test('OPT-085 settlement adapter forwards its stage cancellation signal', async () => {
    const code = extract('    settleAdjudicator: async (', '\n    getWritableFields:');
    let received;
    const run = runInNewContext(`({${code}}).settleAdjudicator`, { settleSettings: () => ({ promptFor: () => '', labelFor: () => '' }), agentLlmClient: { adjudicateAction: value => { received = value; } } });
    const signal = new AbortController().signal;
    await run({ category: 'general', signal }); assert.equal(received.signal, signal);
});

test('OPT-023 settlement clips future sections through the shared volume trimmer', () => {
    const code = extract('function collectSettleMaterials(', '\n/** 预览不占用');
    const run = runInNewContext(`${code}; collectSettleMaterials`, {
        getHostContext: () => ({ chat: [] }), impactConversation: () => ({ floors: [] }), settleSettings: () => ({ customCategories: [], resultPrompt: '', promptFor: () => '' }),
        settleStateFromSelf: () => ({}), buildSettleContextState: () => ({}), agentNpcLedger: { list: () => [] }, sandboxModeActive: () => false,
        agentFactsIndex: { stats: () => ({ total: 1 }), matchTokens: () => [{ uid: 1 }], get: () => ({ uid: 1, name: '药材', content: '当前可知\n〔卷04 增补〕\n未来秘密' }) },
        currentVolumeForWorld: () => 1, trimToVolume, buildSettleResultUser: value => JSON.stringify(value), readInjectedChannelTexts: () => [],
        SETTLE_CATEGORIES: [], settleScopeKey: () => 'A', currentSettings: () => ({}), worldDay: () => 1,
    });
    const result = run([{ is_user: true, mes: '查看药材' }]); assert.match(result.user, /当前可知/); assert.doesNotMatch(result.user, /未来秘密/);
});

test('OPT-047/048 memory injection records only complete written entries and never failed writes', async () => {
    const code = extract('async function writeMemoryInjectionForPrompt(', '\n/** 手动操作与面板操作共用');
    const entries = [{ id: 'm1', text: 'a'.repeat(120), tier: 'small', day: 1 }, { id: 'm2', text: 'b'.repeat(120), tier: 'small', day: 1 }], records = [], writes = [];
    let writeOk = true;
    const run = runInNewContext(`${code}; writeMemoryInjectionForPrompt`, {
        memorySettings: () => ({ enabled: true, inject: true, injectBudget: 200, recallEnabled: false, decideEnabled: true, decideAuto: true }),
        captureAgentContinuation: () => ({ current: () => true }), memoryRecallCacheKey: () => 'current',
        agentMemoryPromptInjection: { inspect: () => ({ status: 'ready' }), clear() {}, write: value => { writes.push(value.text); return { status: writeOk ? 'injected' : 'error', chars: value.text.length }; } },
        agentMemoryRuntime: { snapshot: () => ({ entries }) }, recallHits: () => entries, renderMemoryEntries, renderMemoryEntriesDetail,
        getHostContext: () => ({ chat: [] }), currentSettings: () => ({}), MEMORY_HEADER: 'HEADER', MEMORY_GUIDE: '', injectionSettings: () => ({}),
        recordMemoryLastInjection: value => records.push(value), markMemoryLastInjectionCleared() {},
    });
    await run(); assert.equal(records.at(-1).ids.length, 1); assert.ok(writes.at(-1).length <= 200); assert.equal(records.at(-1).ids[0], 'm1');
    writeOk = false; await run(); assert.notEqual(records.at(-1).status, 'injected'); assert.equal(records.at(-1).ids.length, 0);
});

test('OPT-032 file import launched before a chat switch must not overwrite the new chat ledger', async () => {
    const code = extract('async function importNpcLedgerFile(', '\n/** 把“这条补丁”记进人物簿');
    const loads = [], saves = [], status = [];
    let current = true;
    const deferredFile = deferred();
    const run = runInNewContext(`${code}; importNpcLedgerFile`, {
        captureAgentContinuation: () => ({ current: () => current }), agentNpcLedger: { load: value => { loads.push(value); return { total: 2, skipped: 0 }; } },
        persistNpcLedger: () => saves.push(1), setNpcLedgerStatus: value => status.push(value), refreshNpcLedgerPage() {}, lastNpcLedgerFloor: 3,
    });
    const task = run({ text: () => deferredFile.promise });
    current = false;
    deferredFile.resolve('{"records":[{"姓名":"新聊天的人"}]}');
    await task;
    assert.equal(loads.length, 0, 'switched chats must never receive the old chat import');
    assert.equal(saves.length, 0);
    current = true;
    await run({ text: async () => '{"records":[{"姓名":"本聊天的人"}]}' });
    assert.equal(loads.length, 1); assert.equal(saves.length, 1);
});

test('OPT-051 same-floor rerun replaces the recorded contribution through recordReply', async () => {
    const code = extract('async function runNpcLedgerRecord(', '\n/** 生成前把人物档案写进正文提示词');
    const pending = deferred(), replies = [], saves = [], statuses = [];
    let floorMarker = 1, identityMarker = JSON.stringify(['旧回复', 0]);
    const chat = [{ is_user: true, mes: '问' }, { mes: '旧回复' }];
    const run = runInNewContext(`${code}; runNpcLedgerRecord`, {
        npcLedgerSettings: () => ({ enabled: true, every: 1, floors: 2, connection: 'custom', prompt: '', overrides: {} }),
        npcRecordRunning: false, lastNpcLedgerFloor: floorMarker, lastNpcLedgerReplyIdentity: identityMarker,
        getHostContext: () => ({ chat }), lastReplyIndex: list => list.length - 1, captureAgentContinuation: () => ({ current: () => true }),
        agentLlmClient: { availableFor: () => true, complete: () => pending.promise },
        buildNpcRecordUser: () => 'u', NPC_RECORD_JSON_SCHEMA: {}, npcLedgerBookLines: () => [], npcPlayerContext: () => '', npcLedgerOverrides: () => ({}),
        parseNpcRecordReply: () => ({ status: 'ok', patches: [{ 姓名: 'A', 好感: 1 }] }),
        agentNpcLedger: { list: () => [], recordReply: (payload, context) => { replies.push({ payload, context }); return { status: 'applied', applied: [{ name: 'A' }], created: [], changed: 1, skipped: [], ignored: [], floor: context.floor, replaced: true }; } },
        persistNpcLedger: () => saves.push(1), refreshNpcLedgerPage() {}, setNpcLedgerStatus: value => statuses.push(value), worldDay: () => 1,
        runNpcLedgerExtract() {}, setTimeout,
    });
    const task = run({ source: 'auto' });
    pending.resolve('{}');
    const result = await task;
    assert.equal(result.status, 'applied');
    assert.equal(replies.length, 1);
    assert.equal(replies[0].context.replay, true, 'same-floor rerun must withdraw the previous contribution first');
    assert.equal(replies[0].context.floor, 1);
    assert.equal(saves.length, 1, 'empty or replaced replies must still persist the replay baseline');
    const before = replies.length;
    identityMarker = JSON.stringify(['旧回复', 0]);
    floorMarker = 1;
    assert.equal((await run({ source: 'auto' })).status, 'not_due', 'unchanged reply at the recorded floor is not recorded again');
    assert.equal(replies.length, before);
});

test('OPT-029 scope-only message owner survives own writes but not chat changes', () => {
    const code = extract('function captureAgentScope(', '\nfunction captureAgentContinuation');
    let scope = 'A', epoch = 0, enabled = true, chat = [{ mes: 'before' }];
    const context = { settleScopeKey: () => scope, getHostContext: () => ({ chat }), currentSettings: () => ({ enabled }), get agentContinuationEpoch() { return epoch; } };
    const capture = runInNewContext(`${code}; captureAgentScope`, context), owner = capture();
    chat.push({ mes: 'own message' }); chat[0].mes = 'own update'; assert.equal(owner.current(), true);
    scope = 'B'; assert.equal(owner.current(), false); scope = 'A'; epoch += 1; assert.equal(owner.current(), false);
    const fresh = capture(); enabled = false; assert.equal(fresh.current(), false);
});

test('OPT-063 history integration reads actual host scope rather than cached task scope', () => {
    const code = extract('export function initializeHistoryEvents(', '\nexport const doupoAgent').replace('export function', 'function');
    let scope = { sessionId: 'A', branchId: 'main' }, options;
    const run = runInNewContext(`${code}; initializeHistoryEvents`, {
        agentCapabilities: null, probeHostCapabilities: () => ({}), getHostContext: () => ({ eventSource: {}, event_types: {} }),
        agentHistoryEvents: null, createHistoryEventAdapter: value => { options = value; return { start() {} }; },
        agentTurnPipeline: {}, agentRequestRouter: {}, agentActiveScope: { sessionId: 'A', branchId: 'main', taskIds: ['task-A'] }, currentAgentScope: () => scope,
    });
    run(); assert.equal(options.getScope().sessionId, 'A'); scope = { sessionId: 'B', branchId: 'main' };
    assert.equal(options.getScope().sessionId, 'B'); assert.equal(options.getScope().taskIds.length, 0);
});

test('OPT-034 hot replacement invokes the same full disable cleanup', () => {
    const code = extract('if (import.meta.hot) {', '\n/**').replaceAll('import.meta.hot', 'hot');
    let dispose, disabled = 0;
    runInNewContext(code, { hot: { dispose: callback => { dispose = callback; } }, onDisable: () => { disabled += 1; }, agentCoordinator: { clear() {} }, agentModuleRunner: {}, hostContext: null, hostStorage: null });
    dispose(); assert.equal(disabled, 1);
});

test('OPT-028 rejected restore never retains the outgoing chat impact state', () => {
    const code = extract('function restoreImpactFromChat(', '\nfunction persistImpact');
    let previous = true;
    const run = runInNewContext(`${code}; restoreImpactFromChat`, {
        syncImpactLimits() {}, lastImpactInjection: null, hostStorage: { impactState: () => ({ status: 'ready', value: {} }) },
        agentImpactRuntime: { restore: () => ({ status: 'rejected', reason: 'duplicate_id' }), reset: () => { previous = false; return { status: 'reset' }; }, apply() {} }, worldDay: () => 1,
    });
    assert.equal(run().status, 'rejected'); assert.equal(previous, false);
});
