import assert from 'node:assert/strict';

// 「想找你」常驻胶囊：同一个人只挂一条，且两轮（4 楼）没人理就下掉。
// 这段逻辑在 index.js 的 bindHostLifecycle 里，依赖模块级状态与几个外部对象，
// 这里把源码切片出来喂桩，验证 key 与过期行为。
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// 抓 refreshReachoutCapsules / expireReachoutCapsules 与它们依赖的模块级状态。
const stateStart = 'let knownReachoutCapsules = new Set();';
const bodyStart = '/** 角色主动找你 → 常驻胶囊';
const bodyEnd = '/** 冷藏推进 → 常驻胶囊';
const stateAt = source.indexOf(stateStart);
const bodyAt = source.indexOf(bodyStart);
const bodyTo = source.indexOf(bodyEnd);
assert.ok(stateAt > 0, 'state anchor');
assert.ok(bodyAt > stateAt, 'capsule body anchor');
assert.ok(bodyTo > bodyAt, 'capsule body end');

function makeHarness(pendingList = []) {
    const entries = [];
    const queued = [];
    const dequeued = [];
    const ignored = [];
    const sandbox = {
        agentOrbToasts: {
            push: entry => { entries.push(entry); return 1; },
            dismissKey: key => {
                const before = entries.length;
                for (let i = entries.length - 1; i >= 0; i -= 1) if (entries[i].key === key) entries.splice(i, 1);
                return before - entries.length;
            },
        },
        renderOrbToasts: () => {},
        agentNpcReachout: {
            pendingList: () => pendingList,
            markIgnored: id => { ignored.push(id); return { streak: 1 }; },
            dequeue: id => { dequeued.push(id); return { status: 'removed' }; },
        },
        agentNpcLedger: { get: id => ({ name: id }) },
        persistNpcReachout: () => {},
        knownReachoutCapsules: new Set(),
        dismissedReachoutCapsules: new Set(),
        reachoutCapsuleRounds: new Map(),
        Set,
        Map,
        Number,
        String,
        Array,
        Object,
        console,
    };
    const context = createContext(sandbox);
    const block = `${source.slice(stateAt, source.indexOf('\n', stateAt) + 1)}\n${source.slice(bodyAt, bodyTo)}`;
    runInContext(`${block}; globalThis.__api = { refreshReachoutCapsules, expireReachoutCapsules, knownReachoutCapsules, dismissedReachoutCapsules, reachoutCapsuleRounds };`, context);
    return { api: context.__api, entries, dequeued, ignored, context };
}

// ① 同一人有两条排队记录时，只挂一条胶囊（key 按人物名，不按条目 id）。
{
    const h = makeHarness([
        { id: 'reachout-7', npcId: '货栈管事', reason: '翻工簿看出货数不对' },
        { id: 'reachout-9', npcId: '货栈管事', reason: '又来问货数' },
    ]);
    h.api.refreshReachoutCapsules();
    assert.equal(h.entries.length, 1, '同一个人只许挂一条');
    assert.equal(h.entries[0].key, 'reachout:货栈管事', 'key 必须按人物，不按队列条目 id');
    assert.equal(h.entries[0].title, '货栈管事');
}

// ② 刷新多次也不会叠加（key 不变 → 同 key 替换，由 push 语义保证；这里断言 key 稳定）。
{
    const h = makeHarness([{ id: 'reachout-1', npcId: '货栈管事', reason: 'a' }]);
    h.api.refreshReachoutCapsules();
    const firstKey = h.entries[0].key;
    h.api.refreshReachoutCapsules();
    h.api.refreshReachoutCapsules();
    assert.equal(h.entries.every(e => e.key === firstKey), true, '反复刷新 key 不变');
}

// ③ 两轮没人理：胶囊下掉，队列里那条也撤掉（否则刷新又会弹回来）。
{
    const pending = [{ id: 'reachout-3', npcId: '货栈管事', reason: 'a' }];
    const h = makeHarness(pending);
    h.api.refreshReachoutCapsules();
    h.api.expireReachoutCapsules(); // 第 1 轮：记 1 次
    assert.equal(h.dequeued.length, 0, '第一轮还不该下掉');
    assert.equal(h.api.reachoutCapsuleRounds.get('reachout:货栈管事'), 1);
    h.api.expireReachoutCapsules(); // 第 2 轮：到点，下掉
    assert.equal(h.dequeued.length, 1, '两轮没人理要撤队列');
    assert.equal(h.ignored.length, 1, '还要记一次「他没被理」');
    assert.equal(h.entries.length, 0, '胶囊要下掉');
}

// ④ 队列空了就把计数清掉，不留脏状态。
{
    const pending = [];
    const h = makeHarness(pending);
    h.api.reachoutCapsuleRounds.set('reachout:某人', 1);
    h.api.expireReachoutCapsules();
    assert.equal(h.api.reachoutCapsuleRounds.has('reachout:某人'), false, '队列里没这个人了，计数要清掉');
}

console.log('reachout capsule tests passed');
