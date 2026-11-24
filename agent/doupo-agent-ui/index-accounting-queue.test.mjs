import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

// 记账链排队/补跑/完成提示都在 bindHostLifecycle 里，切片单独喂桩验证行为：
// ①同一时刻只跑一条链，后到的排队等前一条做完；②静默请求占着时整轮不丢，闲下来补跑；
// ③整轮记完用悬浮球弹一条带差值的提示。
const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const start = 'let accountingQueue = Promise.resolve();';
const end = '\n    if (waitForRender) {';
assert.equal(source.split(start).length, 2, 'unique queue anchor');
const at = source.indexOf(start);
const to = source.indexOf(end, at);
assert.ok(to > at, 'queue block end');
const block = source.slice(at, to);

const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};

function queueHarness({ quiet = false, tally = null } = {}) {
    const toasts = [];
    const retried = [];
    const expired = [];
    const counts = tally ?? { near: 0, world: 0, factions: 0, impact: 0, memory: 0, plot: 0, ring: 0 };
    const state = { quiet };
    const sandbox = {
        agentSelfRuntime: { snapshot: () => ({ items: new Array(counts.ring).fill(null) }) },
        agentWorldRuntime: { status: () => ({ near: counts.near, world: counts.world, factions: counts.factions }) },
        agentImpactRuntime: { status: () => ({ total: counts.impact }) },
        agentMemoryRuntime: { status: () => ({ total: counts.memory }) },
        agentPlotRuntime: { snapshot: () => ({ threads: new Array(counts.plot).fill(null) }) },
        emitOrbToasts: entry => { toasts.push(entry); return entry; },
        // 「想找你」胶囊的过期逻辑在切片外：这里只验它每轮都被叫一次。
        expireReachoutCapsules: () => { expired.push(Date.now()); },
        currentSettings: () => ({ enabled: true }),
        agentLlmClient: { isQuietBusy: () => state.quiet },
        resumeGenerationEnd: () => { retried.push(Date.now()); },
        // 本轮失败登记表是模块级状态（在切片之外）：真身是 let 变量，会被整表重新赋值，
        // 所以要用真 context 读它，不能在沙箱外拿一份旧引用。
        roundFailureLabels: [],
        roundApplyCount: 0,
        setTimeout,
        clearTimeout,
        Number,
        Promise,
        Array,
    };
    const context = createContext(sandbox);
    const api = runInContext(`${block}; ({ enqueueAccountingRound, retryGenerationEndLater, roundToast, settleWithin })`, context);
    return {
        ...api,
        toasts,
        retried,
        expired,
        counts,
        state,
        get failures() { return context.roundFailureLabels; },
        set failures(list) { context.roundFailureLabels = list; },
        get applies() { return context.roundApplyCount; },
        set applies(value) { context.roundApplyCount = value; },
    };
}

// ① 排队：第一条链没做完，第二条不许开始。
{
    const harness = queueHarness();
    const gate = deferred();
    const order = [];
    const first = harness.enqueueAccountingRound(async () => { order.push('first:start'); await gate.promise; order.push('first:end'); });
    const second = harness.enqueueAccountingRound(async () => { order.push('second:start'); });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(order, ['first:start'], '第二条链必须等第一条做完');
    gate.resolve();
    await Promise.all([first, second]);
    assert.deepEqual(order, ['first:start', 'first:end', 'second:start'], '第一条做完才轮到第二条');
}

// ② 补跑：静默请求占着时先记下来，闲下来补跑一次。
{
    const harness = queueHarness({ quiet: true });
    harness.retryGenerationEndLater();
    harness.retryGenerationEndLater(); // 重复登记只能有一个待办
    await new Promise(resolve => setTimeout(resolve, 1700));
    assert.equal(harness.retried.length, 0, '静默请求还占着时不许补跑');
    harness.state.quiet = false;
    await new Promise(resolve => setTimeout(resolve, 5200));
    assert.equal(harness.retried.length, 1, '闲下来要补跑，而且只补一次');
}

// ③ 完成提示：带差值，没有变化也要明说。
{
    const harness = queueHarness();
    harness.roundToast(94, { ...harness.counts });
    harness.counts.memory = 2;
    harness.counts.near = 1;
    harness.roundToast(95, { ...harness.counts, memory: 1, near: 0, world: 0, factions: 0, impact: 0, plot: 0, ring: 0 });
    assert.equal(harness.toasts.length, 2);
    assert.equal(harness.toasts[0].title, '第 95 楼记录完成');
    assert.equal(harness.toasts[0].text, '这一轮没有要改的账。');
    assert.equal(harness.toasts[1].title, '第 96 楼记录完成');
    assert.match(harness.toasts[1].text, /身边事件 \+1/);
    assert.match(harness.toasts[1].text, /记忆 \+1/);
    assert.equal(harness.toasts[1].tone, 'good');
    assert.equal(harness.toasts[1].key, 'round-95');
}

// ④ 本轮有链挂了：不许再报「没有要改的账」，要报哪几环出错、并把已记下的带上。
{
    const harness = queueHarness();
    harness.failures = ['世界运转', '记忆', '世界运转'];
    harness.roundToast(110, { ...harness.counts });
    assert.equal(harness.toasts.length, 1);
    assert.equal(harness.toasts[0].title, '第 111 楼没记完', '三条链全挂时不能报成「记录完成」');
    assert.equal(harness.toasts[0].tone, 'bad');
    assert.equal(harness.toasts[0].icon, 'warn');
    assert.match(harness.toasts[0].text, /世界运转、记忆 出错了/);
    assert.match(harness.toasts[0].text, /这一轮没记成/);
    assert.equal(harness.failures.length, 0, '报过就清空，别把下一轮也染成失败');
    // 部分成功：带上已记下的账
    const partial = queueHarness();
    partial.failures = ['世界影响'];
    partial.counts.memory = 1;
    partial.roundToast(120, { ...partial.counts, memory: 0 });
    assert.equal(partial.toasts[0].tone, 'bad');
    assert.match(partial.toasts[0].text, /世界影响 出错了/);
    assert.match(partial.toasts[0].text, /已记下：记忆 \+1/);
}

// ⑤ 有落账但条目数没变（时间推进/事件更新）：不许报「没有要改的账」。
{
    const harness = queueHarness();
    harness.applies = 3;
    harness.roundToast(130, { ...harness.counts });
    assert.equal(harness.toasts.length, 1);
    assert.equal(harness.toasts[0].tone, 'good');
    assert.equal(harness.toasts[0].text, '更新了 3 处，条目数没变', '只有更新时要说清改了东西，不能说没账可记');
    assert.equal(harness.applies, 0, '报过就清零，别把下一轮也算上');
    // 什么都没落账时仍如实说没有要改的账
    const idle = queueHarness();
    idle.roundToast(140, { ...idle.counts });
    assert.equal(idle.toasts[0].text, '这一轮没有要改的账。');
    assert.equal(idle.expired.length, 1, '每轮结束都要给「想找你」胶囊记一次数');
}

console.log('accounting queue tests passed');
