import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { trimToVolume } from './narrative/setting-supply.js';
import { renderMemoryEntries, renderMemoryEntriesDetail } from './memory/memory-ops.js';
import { createCaptureAgents } from './host/scope.js';
import { createImpactRestore } from './impact/impact-injection.js';

// 归一化行尾：Windows 检出（autocrlf）会把源码变 CRLF，源码文本断言按 LF 写，先统一。
const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const extract = (start, end) => {
    const from = source.indexOf(start);
    assert.ok(from >= 0, `extract ${start}`);
    if (end === undefined) return source.slice(from); // 缺省切到文件尾
    const to = source.indexOf(end, from);
    assert.ok(to > from, `extract ${start}`);
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
    const code = extract('async function syncWorldbookIndex(');
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

// OPT-085 旧结算适配器（settleAdjudicator 阶段转发 signal）已随旧回合流水线退役：
// 现役行动结算是生成前一次 complete 调用，由 settleSession 令牌管并发与过期，无阶段信号可转发。

test('OPT-111 decide note rides the user prompt only when the player wrote one', () => {
    const code = extract('function withPlayerNote(', '\nasync function runMemoryRecall');
    const run = runInNewContext(`${code}; withPlayerNote`, {});
    const base = '【人物】…';
    assert.equal(run(base, ''), base, '留空＝没填，提示词原样');
    assert.equal(run(base, '   '), base, '纯空白同样原样');
    const noted = run(base, '让老执事对萧炎起疑');
    assert.match(noted, /^【人物】…/);
    assert.match(noted, /【玩家本轮补充指示】让老执事对萧炎起疑/);
    assert.match(noted, /遵守上面的 JSON 字段/);
    const long = 'x'.repeat(600);
    assert.ok(run(base, long).includes('x'.repeat(500)), '超长想法截到 500 字');
    assert.equal(run(base, null), base, '非字符串按没填处理');
});

test('OPT-023 settlement clips future sections through the shared volume trimmer', async () => {
    const code = extract('async function collectSettleMaterials(', '\n/** 预览不占用');
    // collectSettleMaterials 现在要套楼层正则（异步）：切片放进 AsyncFunction 求值后再调用。
    const run = runInNewContext(`(async () => {\n${code}\n; return collectSettleMaterials; })()`, {
        getHostContext: () => ({ chat: [] }), impactConversation: async () => ({ floors: [] }), settleSettings: () => ({ customCategories: [], resultPrompt: '', promptFor: () => '' }),
        settleStateFromSelf: () => ({}), buildSettleContextState: () => ({}), agentNpcLedger: { list: () => [] }, sandboxModeActive: () => false,
        agentFactsIndex: { stats: () => ({ total: 1 }), matchTokens: () => [{ uid: 1 }], get: () => ({ uid: 1, name: '药材', content: '当前可知\n〔卷04 增补〕\n未来秘密' }) },
        currentVolumeForWorld: () => 1, trimToVolume, buildSettleResultUser: value => JSON.stringify(value), readInjectedChannelTexts: () => [],
        SETTLE_CATEGORIES: [], settleScopeKey: () => 'A', currentSettings: () => ({}), worldDay: () => 1,
    });
    const collect = await run;
    const result = await collect([{ is_user: true, mes: '查看药材' }]); assert.match(result.user, /当前可知/); assert.doesNotMatch(result.user, /未来秘密/);
});

test('OPT-047/048 memory injection records only complete written entries and never failed writes', async () => {
    const code = extract('async function writeMemoryInjectionForPrompt(', '\n/** 手动操作与面板操作共用');
    const entries = [{ id: 'm1', text: 'a'.repeat(120), tier: 'small', day: 1 }, { id: 'm2', text: 'b'.repeat(120), tier: 'small', day: 1 }], records = [], writes = [];
    let writeOk = true;
    const run = runInNewContext(`${code}; writeMemoryInjectionForPrompt`, {
        memorySettings: () => ({ enabled: true, inject: true, injectBudget: 200, recallEnabled: false, decideEnabled: true, decideAuto: true }),
        advancedMode: () => true,
        captureAgentContinuation: () => ({ current: () => true }), memoryRecallCacheKey: () => 'current',
        agentMemoryPromptInjection: { inspect: () => ({ status: 'ready' }), clear() {}, write: value => { writes.push(value.text); return { status: writeOk ? 'injected' : 'error', chars: value.text.length }; } },
        agentMemoryRuntime: { snapshot: () => ({ entries }) }, recallHits: () => entries, renderMemoryEntries, renderMemoryEntriesDetail,
        getHostContext: () => ({ chat: [] }), currentSettings: () => ({}), MEMORY_HEADER: 'HEADER', MEMORY_GUIDE: '', injectionSettings: () => ({}),
        cleanFloorText: async message => (typeof message?.mes === 'string' ? message.mes : ''),
        // 兜底链现在带时间邻近与可选语义检索：切片外依赖桩掉（相似度表恒 null = 纯本地）。
        memoryVectorSim: async () => null, worldDay: () => 1,
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
        advancedMode: () => true,
        cleanFloorEntries: async entries => (Array.isArray(entries) ? entries : []).map(({ role, text }) => ({ role, text })),
        npcRecordRunning: false, lastNpcLedgerFloor: floorMarker, lastNpcLedgerReplyIdentity: identityMarker,
        getHostContext: () => ({ chat }), lastReplyIndex: list => list.length - 1, captureAgentContinuation: () => ({ current: () => true }),
        agentLlmClient: { availableFor: () => true, complete: () => pending.promise },
        buildNpcRecordUser: () => 'u', NPC_RECORD_JSON_SCHEMA: {}, npcLedgerBookLines: () => [], npcPlayerContext: () => '', npcLedgerOverrides: () => ({}),
        parseNpcRecordReply: () => ({ status: 'ok', patches: [{ 姓名: 'A', 好感: 1 }] }),
        agentNpcLedger: { list: () => [], get: () => ({ exp: [] }), recordReply: (payload, context) => { replies.push({ payload, context }); return { status: 'applied', applied: [{ name: 'A' }], created: [], changed: 1, skipped: [], ignored: [], floor: context.floor, replaced: true }; } },
        persistNpcLedger: () => saves.push(1), refreshNpcLedgerPage() {}, setNpcLedgerStatus: value => statuses.push(value), worldDay: () => 1,
        runNpcLedgerExtract() {}, runAutoExpCondense: async () => {}, runNpcConsistencyCheck: async () => {}, adoptNpcRelationsFromResult: () => null, setTimeout,
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
    // 续算凭据已摘进 host/scope.js 工厂：直接喂依赖构造。
    let scope = 'A', epoch = 0, enabled = true, chat = [{ mes: 'before' }];
    const { captureAgentScope: capture } = createCaptureAgents({
        getEpoch: () => epoch, settleScopeKey: () => scope, getContext: () => ({ chat }),
        currentSettings: () => ({ enabled }), lastReplyIndex: list => list.length - 1,
    });
    const owner = capture();
    chat.push({ mes: 'own message' }); chat[0].mes = 'own update'; assert.equal(owner.current(), true);
    scope = 'B'; assert.equal(owner.current(), false); scope = 'A'; epoch += 1; assert.equal(owner.current(), false);
    const fresh = capture(); enabled = false; assert.equal(fresh.current(), false);
});

test('OPT-063 capability probe reads the live host context on every call', () => {
    const code = extract('export function probeAgentCapabilities(', '\nexport function getAgentCapabilities').replace('export function', 'function');
    const probes = [], rendered = [];
    const root = { hidden: false };
    const run = runInNewContext(`${code}; probeAgentCapabilities`, {
        agentCapabilities: null, probeHostCapabilities: options => { probes.push(options); return { status: 'ready', probe: probes.length }; },
        renderCapabilities: value => rendered.push(value), root,
    });
    const first = run(root);
    assert.equal(first.status, 'ready'); assert.equal(root.hidden, false);
    assert.equal(rendered.at(-1)?.probe, 1, '探测结果就地渲染进能力面板');
    const second = run(root);
    assert.equal(probes.length, 2, '每次探测都真跑一次，不吃旧缓存');
    assert.ok(probes.every(item => item === root), '每次探测都带最新宿主上下文');
    assert.equal(rendered.at(-1)?.probe, 2);
});

test('OPT-034 hot replacement invokes the same full disable cleanup', () => {
    const code = extract('if (import.meta.hot) {', '\n/**').replaceAll('import.meta.hot', 'hot');
    let dispose, disabled = 0;
    runInNewContext(code, { hot: { dispose: callback => { dispose = callback; } }, onDisable: () => { disabled += 1; }, agentCoordinator: { clear() {} }, agentModuleRunner: {}, hostContext: null, hostStorage: null });
    dispose(); assert.equal(disabled, 1);
});

test('OPT-028 rejected restore never retains the outgoing chat impact state', () => {
    // 影响库恢复已摘进 impact/impact-injection.js 工厂：喂桩直接构造。
    let previous = true, invalidated = 0;
    const restore = createImpactRestore({
        syncLimits() {}, storage: { impactState: () => ({ status: 'ready', value: {} }) },
        runtime: { restore: () => ({ status: 'rejected', reason: 'duplicate_id' }), reset: () => { previous = false; return { status: 'reset' }; }, apply() {} },
        worldDay: () => 1, injection: { invalidate: () => { invalidated += 1; } },
    });
    assert.equal(restore().status, 'rejected'); assert.equal(previous, false);
    assert.equal(invalidated, 1, '换聊天恢复时上一轮挑选缓存作废');
});

test('OPT-110 decide calls read facts content even after the generation-end channel clear', () => {
    // 行为：factsInjectedLines 优先读通道；通道被生成结束清空后退回选条写入时的正文快照。
    const code = extract("let factsInjectedSnapshot = '';", '/** 人物簿已建档判定');
    // VM 里造的数组带着另一个 realm 的 Array.prototype，deepStrictEqual 会判否，先复制回宿主再比。
    const build = value => {
        const scope = runInNewContext(`${code}; ({ factsInjectedLines, setSnapshot: text => { factsInjectedSnapshot = text; } })`,
            { getHostContext: () => ({ extensionPrompts: { doupo_facts: { value } } }) });
        return { setSnapshot: scope.setSnapshot, lines: () => Array.from(scope.factsInjectedLines()) };
    };
    assert.deepEqual(build(undefined).lines(), [], '通道和快照都空时给空数组');
    assert.deepEqual(build('').lines(), []);
    const empty = build('');
    empty.setSnapshot('#534 萧炎：主角……');
    assert.deepEqual(empty.lines(), ['#534 萧炎：主角……'], '生成结束清空通道后决定调用退回快照');
    const both = build('  本轮选条正文  ');
    both.setSnapshot('上一轮的旧快照');
    assert.deepEqual(both.lines(), ['本轮选条正文'], '通道还有内容时优取通道');
    assert.deepEqual(build('   ').lines(), [], '纯空白通道视同空');
});

test('OPT-110 snapshot lifecycle: captured on injected write, kept through generation-end clear', () => {
    // 写入成功才留快照，且生成结束的通道清空不许把快照一起清掉（决定调用还没跑）。
    assert.match(source, /factsInjectedSnapshot = writeResult\?\.status === 'injected'/, '只有注入成功才更新快照');
    const tail = extract('try { agentPromptInjection.clear(); } catch { /* 清空失败不影响生成 */ }', 'markMemoryLastInjectionCleared');
    assert.ok(!tail.includes('factsInjectedSnapshot'), '生成结束清通道时快照必须保留');
    for (const marker of [
        "if (!settings.enabled) { agentPromptInjection.clear(); factsInjectedSnapshot = '';",
        "if (!input) { agentPromptInjection.clear(); factsInjectedSnapshot = '';",
        "if (!resolved?.text) { agentPromptInjection.clear(); factsInjectedSnapshot = '';",
    ]) assert.ok(source.includes(marker), `该清空的路径要清快照：${marker.slice(0, 40)}`);
    const sandboxBlock = extract('if (sandboxModeActive()) {', 'const writeResult = agentPromptInjection.write({ text: SANDBOX_WORLD_PROMPT');
    assert.ok(sandboxBlock.includes("factsInjectedSnapshot = '';"), '沙盒基线覆盖通道时快照一并清空');
    const chatChange = extract("try { agentPromptInjection.clear(); factsInjectedSnapshot = ''; } catch { /* 切聊天时清空注入 */ }", 'agentWorldPromptInjection');
    assert.ok(chatChange.includes('切聊天时清空注入'), '换聊天时快照清空');
    // 纳戒决定与记忆/影响一致：沙盒口径不拿原著资料。
    const selfBlock = extract('const bookLines = !sandboxModeActive() ? factsInjectedLines() : [];', 'buildSelfDecideUser');
    assert.ok(selfBlock.includes('沙盒口径不注入原著条目'), '纳戒决定沙盒门控已对齐');
});
{
    // 第三批记忆功能：写入查重、重要度评分、相关记忆跳转的接线必须真实存在。
    const runtimeSource = readFileSync(new URL('./memory/memory-runtime.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    assert.match(runtimeSource, /import \{ DEDUP_SIMILARITY, recallKeys, textSimilarity \} from '\.\/memory-retrieve\.js'/, 'runtime 引检索纯函数做写入查重');
    assert.match(runtimeSource, /duplicate_of_\$\{entry\.id\}/, '查重拒绝带旧账编号');
    assert.match(source, /重要度 \$\{Number\.isFinite\(Number\(entry\.importance\)\)/, '列表 meta 带重要度');
    assert.match(source, /相关记忆（共钥匙）/, '详情弹窗有相关记忆节');
    assert.match(source, /links: \[\{ label, onPick \}\]/, '详情弹窗支持可点击 links 行');
}
