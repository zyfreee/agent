import assert from 'node:assert/strict';
import { createImpactRuntime } from '../impact/impact-runtime.js';
import { createImpactInjection } from '../impact/impact-injection.js';
import { buildImpactInjectionDetail } from '../impact/impact-ops.js';
import { buildImpactInjectionFromPicksDetail } from '../impact/impact-select.js';

function makeHarness(overrides = {}) {
    const runtime = createImpactRuntime();
    runtime.apply([{ op: 'record', title: '药材涨价', detail: '城中药材一日三涨', target: '乌坦城', weight: 'major', kind: 'direct' }], { source: 'manual', day: 3 });
    const writes = [];
    const channel = {
        inspect: () => ({ status: 'ready' }),
        clear() { writes.push({ cleared: true }); return { status: 'cleared' }; },
        write({ text }, options) { writes.push({ text, options }); return { status: 'injected', text }; },
    };
    const state = { scope: 'chat-a', round: 'round-1', current: true, settings: { enabled: true, inject: true, injectSmart: false, injectBudget: Infinity, injectMaxLines: Infinity } };
    const injection = createImpactInjection({
        capture: () => ({ current: () => state.current }),
        impactSettings: () => state.settings,
        channel,
        runtime,
        worldDay: () => 3,
        getContext: () => ({ chat: [] }),
        conversation: () => ({ draft: '', floors: [] }),
        modelPlan: () => {},
        scopeKey: () => state.scope,
        roundKeyOf: () => state.round,
        currentSettings: () => ({}),
        injectionSettings: () => ({ depth: 4 }),
        pick: async () => ({ status: 'empty', picks: [], note: '' }),
        buildFromPicks: (records, picks, options) => buildImpactInjectionDetail(records, options),
        buildFallback: (records, options) => buildImpactInjectionDetail(records, options),
        registerFailure: () => {},
        renderLibrary: () => {},
        ...overrides,
    });
    return { runtime, writes, state, injection };
}

// 脚本直取：写成独立通道、带上限、记录本轮真正进了正文的编号。
{
    let pickCalls = 0;
    const { writes, injection, state } = makeHarness({
        pick: async () => { pickCalls += 1; return { status: 'ok', picks: [{ ref: 'i1', text: '药材涨价' }], note: '' }; },
    });
    state.settings.injectSmart = false;
    const result = await injection.write({ chat: [{ is_user: true, mes: '开场' }] });
    assert.equal(result.status, 'injected');
    assert.equal(writes.length, 1);
    assert.ok(writes[0].text.startsWith('【世界影响 · 本局世界线】'));
    assert.equal(writes[0].options.depth, 4);
    assert.deepEqual(result.usedIds, ['i1']);
    // 同一轮重 roll：直接复用缓存，不重挑、不改文案。
    const again = await injection.write({ chat: [{ is_user: true, mes: '开场' }] });
    assert.equal(again.status, 'injected');
    assert.equal(pickCalls, 0, '关掉智能挑选时不叫模型');
    assert.equal(writes.length, 2);
    assert.equal(writes[1].text, writes[0].text, '重 roll 复用同一份注入');
}

// P0：挑选期间换了聊天（或换了轮次），回来必须作废，不能把 A 会话挑的内容写进 B。
{
    let scope = 'chat-a';
    const { writes, injection, state } = makeHarness({
        scopeKey: () => scope,
        pick: async () => {
            scope = 'chat-b';
            return { status: 'ok', picks: [{ ref: 'i1', text: '药材涨价' }], note: '' };
        },
        buildFromPicks: (records, picks) => ({ text: '【世界影响 · 本局世界线】\n· 药材涨价', usedIds: ['i1'] }),
    });
    state.settings.injectSmart = true;
    const result = await injection.write({ chat: [{ is_user: true, mes: '换会话' }] });
    assert.equal(result.status, 'stale', '作用域变了就作废');
    assert.equal(writes.length, 0, '作废的挑选不许写通道');
}

// 模型挑选失败：回落到脚本，并记一次失败。
{
    const failures = [];
    const { writes, injection, state } = makeHarness({
        registerFailure: (label, message) => failures.push([label, message]),
        pick: async () => { throw new Error('模型超时'); },
    });
    state.settings.injectSmart = true;
    const result = await injection.write({ chat: [{ is_user: true, mes: '开场' }] });
    assert.equal(result.status, 'injected');
    assert.equal(result.via, 'script');
    assert.equal(failures.length, 1);
    assert.equal(failures[0][0], '世界判定官');
    assert.ok(writes[0].text.includes('药材涨价'));
}

// 判定官撞上了埋下的因：hits 要一起交给注入器，否则正文里看不到“当年那一步还在演”。
{
    const runtime = createImpactRuntime();
    runtime.apply([{
        op: 'record', title: '萧炎身上带着一枚旧护符', detail: '真被逼到绝路时才可能救命', target: '萧炎',
        kind: 'butterfly', weight: 'major', seed: '玩家塞给他的旧护符', trigger: '萧炎被逼到绝路、无路可退',
    }], { source: 'manual', day: 3 });
    const writes = [];
    const seenHits = [];
    const injection = createImpactInjection({
        capture: () => ({ current: () => true }),
        impactSettings: () => ({ enabled: true, inject: true, injectSmart: true, injectBudget: Infinity, injectMaxLines: Infinity }),
        channel: {
            inspect: () => ({ status: 'ready' }),
            clear() { return { status: 'cleared' }; },
            write({ text }, options) { writes.push({ text, options }); return { status: 'injected', text }; },
        },
        runtime: { snapshot: () => runtime.snapshot(), manualVersion: () => 0 },
        worldDay: () => 9,
        getContext: () => ({ chat: [] }),
        conversation: () => ({ draft: '', floors: [] }),
        modelPlan: () => {},
        scopeKey: () => 'chat-a',
        roundKeyOf: () => 'round-hits',
        currentSettings: () => ({}),
        injectionSettings: () => ({ depth: 4 }),
        pick: async () => ({
            status: 'empty', note: '撞上了一条', picks: [],
            hits: [{ ref: 'i1', why: '萧炎被堵在巷子里无路可退，攥着那枚旧护符', evidence: '旧护符烫得抖了一下', text: '旧护符烫得抖了一下。' }],
        }),
        buildFromPicks: (records, picks, options) => { seenHits.push(options.hits?.length ?? 0); return buildImpactInjectionFromPicksDetail(records, picks, options); },
        buildFallback: (records, options) => buildImpactInjectionDetail(records, options),
        registerFailure: () => {},
        renderLibrary: () => {},
    });
    const result = await injection.write({ chat: [{ is_user: true, mes: '撞上了' }] });
    assert.deepEqual(seenHits, [1], 'hits 必须一路传到注入器');
    assert.equal(result.status, 'injected', '只有 hits、没有 picks 也要写进正文');
    assert.match(writes[0].text, /当年埋下的因，这一轮撞上了/);
}

// 模型明确说这一幕用不上：本轮不注入，并清空通道。
{
    const { writes, injection, state } = makeHarness({ pick: async () => ({ status: 'empty', picks: [], note: '这一幕用不上' }) });
    state.settings.injectSmart = true;
    const result = await injection.write({ chat: [{ is_user: true, mes: '开场' }] });
    assert.equal(result.status, 'skipped');
    assert.deepEqual(writes.at(-1), { cleared: true });
}

// 注入历史：只留最近一轮不够用，「这条影响到底写进过正文没有」要看得到过往每一轮。
{
    const { injection, state } = makeHarness({
        pick: async () => ({ status: 'ok', picks: [{ ref: 'i1', text: '药材涨价' }], note: '' }),
    });
    state.settings.injectSmart = true;
    assert.deepEqual(injection.injectedHistory(), [], '还没写过时历史是空的');
    await injection.write({ chat: [{ is_user: true, mes: '第一轮' }] });
    assert.deepEqual(injection.injectedHistory().map(round => round.ids), [['i1']], '写过一轮就记一轮');
    // 换一轮再写：历史累积，不是覆盖。
    state.round = 'round-2';
    await injection.write({ chat: [{ is_user: true, mes: '第二轮' }] });
    const history = injection.injectedHistory();
    assert.equal(history.length, 2, '两轮都留着');
    assert.deepEqual(history.map(round => round.ids), [['i1'], ['i1']]);
    assert.ok(history.every(round => typeof round.at === 'string' && round.at), '每轮带时间戳');
    // 历史是副本：外面改返回值不能污染内部记录。
    history[0].ids.push('i99');
    assert.deepEqual(injection.injectedHistory()[0].ids, ['i1'], '返回值不能改到内部历史');
    // 作废（换会话/重置）时历史一起清，避免把 A 会话的痕迹算到 B 头上。
    injection.invalidate();
    assert.deepEqual(injection.injectedHistory(), [], 'invalidate 要清历史');
}

console.log('impact injection tests passed');
