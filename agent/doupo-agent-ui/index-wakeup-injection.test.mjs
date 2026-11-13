import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

// 开局摘要写入器：门闩一次性、聊天号绑定、开关关闭只清空、空聊天不消耗。
// 归一化行尾：Windows 检出（autocrlf）会把源码变 CRLF，切片标记按 LF 写，先统一。
const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function extract(start, end) {
    assert.equal(source.split(start).length, 2, `unique entry declaration: ${start}`);
    const from = source.indexOf(start), to = source.indexOf(end, from);
    assert.ok(to > from, `entry boundary: ${end}`);
    return source.slice(from, to);
}
// 门闩变量 + 写入器是同一段（writeMemoryInjectionForPrompt 结尾、共用横幅之前）。
const code = extract('let wakeUpPendingChatId', '\n/** 手动操作与面板操作共用');

function harness({ chatId = 'chat-A', pending = 'chat-A', settings = {}, summary = '【开局摘要】第 3 天·春季', chat = [{ is_user: true, mes: 'new input' }, { mes: 'old reply' }] } = {}) {
    const writes = [], clears = [];
    // 门闩是 VM 求值作用域里的 let（不挂在沙盒对象上）：在求值代码尾部导出 arm/gate 桥来操纵它。
    const api = runInNewContext(
        `${code}; ({ write: writeWakeUpInjectionForPrompt, arm: value => { wakeUpPendingChatId = value; }, gate: () => wakeUpPendingChatId })`,
        {
            memorySettings: () => ({ enabled: true, inject: true, wakeUp: settings.wakeUp !== false, wakeUpBudget: 500 }),
            advancedMode: () => settings.advanced !== false,
            getHostContext: () => ({ chatId, chat }),
            agentWakeUpPromptInjection: {
                write: value => { writes.push(value); return { status: 'written' }; },
                clear: () => clears.push(1),
            },
            buildWakeUpSummary: () => summary,
            agentWorldRuntime: { snapshot: () => ({}) },
            agentMemoryRuntime: { snapshot: () => ({}) },
            agentNpcLedger: { list: () => [] },
            injectionSettings: () => ({ depth: 4 }),
        },
    );
    api.arm(pending);
    return { ...api, writes, clears };
}

await test('OPT-054 armed gate writes the digest exactly once, then the latch is spent', () => {
    const h = harness();
    h.write({});
    assert.deepEqual(h.writes.map(item => item.text), ['【开局摘要】第 3 天·春季'], 'first generation of the new chat injects once');
    assert.equal(h.gate(), null, 'latch is spent after the write');
    h.write({});
    assert.equal(h.writes.length, 1, 'second generation of the same chat writes nothing');
});

await test('OPT-054 unspent latch passes chatId mismatch through without writing or spending', () => {
    const h = harness({ chatId: 'chat-B', pending: 'chat-A' });
    h.write({});
    assert.deepEqual({ writes: h.writes.length, clears: h.clears.length, gate: h.gate() }, { writes: 0, clears: 0, gate: 'chat-A' });
});

await test('OPT-054 toggle off clears the channel but keeps the latch for later re-enable', () => {
    const h = harness({ settings: { wakeUp: false } });
    h.write({});
    assert.deepEqual({ writes: h.writes.length, clears: h.clears.length, gate: h.gate() }, { writes: 0, clears: 1, gate: 'chat-A' });
});

await test('OPT-054 wake-up is advanced-only: 完整版/简略版下清空通道且不消耗门闩', () => {
    const h = harness({ settings: { advanced: false } });
    h.write({});
    assert.deepEqual({ writes: h.writes.length, clears: h.clears.length, gate: h.gate() }, { writes: 0, clears: 1, gate: 'chat-A' });
});

await test('OPT-054 empty chat leaves the latch armed instead of wasting the one-shot', () => {
    const empty = harness({ chat: [] });
    empty.write({});
    assert.equal(empty.gate(), 'chat-A');
    assert.equal(empty.writes.length, 0);
});

await test('OPT-054 empty digest spends the latch but writes nothing', () => {
    const h = harness({ summary: '' });
    h.write({});
    assert.deepEqual({ writes: h.writes.length, gate: h.gate() }, { writes: 0, gate: null });
});

await test('OPT-054 prepareInjectionForPrompt runs the writer and both teardown sites clear the channel', () => {
    const prepare = extract('async function prepareInjectionForPrompt(', '\n// —— 行动结算·最终判定');
    assert.match(prepare, /writeWakeUpInjectionForPrompt\(\{ chat \}\)/, 'interceptor chain must invoke the wake-up writer');
    assert.match(source, /agentWakeUpPromptInjection\.clear\(\); \} catch \{ \/\* 同上 \*\/ \}[\s\S]*?restoreWorldFromChat/, 'CHAT_CHANGED clears the channel');
    assert.equal(source.split('try { agentWakeUpPromptInjection.clear(); }').length - 1, 2, 'exactly two teardown sites: CHAT_CHANGED + GENERATION_ENDED');
});
