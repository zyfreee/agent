import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

// 剧情前瞻注入器：只有进阶版才真的写通道。完整版/简略版下剧情决定不跑，账本停在旧的一天，
// 这时候还往提示词里喂前瞻＝喂一份过期账，所以必须清空通道、什么都不写。
// 归一化行尾：Windows 检出（autocrlf）会把源码变 CRLF，切片标记按 LF 写，先统一。
const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function extract(start, end) {
    assert.equal(source.split(start).length, 2, `unique entry declaration: ${start}`);
    const from = source.indexOf(start), to = source.indexOf(end, from);
    assert.ok(to > from, `entry boundary: ${end}`);
    return source.slice(from, to);
}

const code = extract('function writePlotInjectionForPrompt()', '\n/**\n * 纳戒决定与记忆决定是两条独立调用');

function harness({ advanced = true, enabled = true, inject = true, body = '【剧情前瞻】本幕目标：南下乌坦城' } = {}) {
    const writes = [], clears = [];
    const api = runInNewContext(`${code}; ({ write: writePlotInjectionForPrompt })`, {
        advancedMode: () => advanced,
        currentSettings: () => ({ plot: { enabled } }),
        plotLedgerSettings: () => ({ inject, budget: 0 }),
        agentPlotPromptInjection: {
            inspect: () => ({ status: 'ready' }),
            write: value => { writes.push(value); return { status: 'written' }; },
            clear: () => clears.push(1),
        },
        buildPlotInjection: () => body,
        agentPlotRuntime: { snapshot: () => ({ day: 16, threads: [] }) },
        PLOT_HEADER: '【剧情前瞻】',
        injectionSettings: () => ({ depth: 4 }),
    });
    return { ...api, writes, clears };
}

await test('OPT-110 plot injection writes the lookahead only in advanced mode', () => {
    const h = harness();
    assert.deepEqual(h.write(), { status: 'written' });
    assert.equal(h.writes.length, 1);
    assert.match(h.writes[0].text, /^【剧情前瞻】/);
    assert.equal(h.clears.length, 0, 'advanced mode must not clear the channel');
});

await test('OPT-110 full and lite modes clear the channel and write nothing', () => {
    // 沙箱返回的对象原型与宿主不同，逐字段比。
    for (const apiMode of ['full', 'lite']) {
        const h = harness({ advanced: false });
        const result = h.write();
        assert.equal(result.status, 'disabled', `${apiMode} must report disabled`);
        assert.equal(h.writes.length, 0, `${apiMode} must not write`);
        assert.equal(h.clears.length, 1, `${apiMode} must clear the stale channel`);
    }
});

await test('OPT-110 plot switch still wins inside advanced mode', () => {
    const off = harness({ enabled: false });
    const offResult = off.write();
    assert.equal(offResult.status, 'disabled');
    assert.equal(off.writes.length, 0);
    assert.equal(off.clears.length, 1);
    const noInject = harness({ inject: false });
    const noInjectResult = noInject.write();
    assert.equal(noInjectResult.status, 'disabled');
    assert.equal(noInject.writes.length, 0);
});

await test('OPT-110 empty lookahead clears the channel instead of keeping a stale one', () => {
    const h = harness({ body: '' });
    // 沙箱里返回的对象原型与宿主不同，逐字段比，别整对象比 deepStrictEqual。
    const result = h.write();
    assert.equal(result.status, 'empty');
    assert.equal(h.writes.length, 0);
    assert.equal(h.clears.length, 1);
});

await test('OPT-110 the advanced gate sits before any settings read', () => {
    const gate = code.indexOf('if (!advancedMode())');
    const settingsRead = code.indexOf('const plot = currentSettings().plot');
    assert.ok(gate > 0 && gate < settingsRead, 'advanced gate must run before reading settings');
});
