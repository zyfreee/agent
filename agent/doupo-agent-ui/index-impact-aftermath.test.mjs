import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

// 余波派生（P1）：一条影响落成后自动长出下一层，两头都写——
// 影响账本里记一条「余波：X」（parent 指回去，面板能回溯），
// 世界台账里再落一条风闻事件（basis 挂余波编号，别人才可能听说、回响才追得到）。
// 允许链式：余波自己落成后还能再长一层，层数由 maxChainDepth 兜住。
// 归一化行尾：Windows 检出（autocrlf）会把源码变 CRLF，切片标记按 LF 写，先统一。
const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function extract(start, end) {
    assert.equal(source.split(start).length, 2, `unique entry declaration: ${start}`);
    const from = source.indexOf(start), to = source.indexOf(end, from);
    assert.ok(to > from, `entry boundary: ${end}`);
    return source.slice(from, to);
}

const code = [
    extract('function impactAftermathWeight(weight)', '\n/**\n * 影响链的'),
    extract('function deriveImpactAftermath(execution)', '\n/**\n * 把影响里「动到人」'),
].join('\n');

function harness({ deriveChain = true, maxChainDepth = 3, existing = [], records = [], worldFails = false } = {}) {
    const recorded = [], events = [];
    let seq = 0;
    const runtime = {
        config: () => ({ maxChainDepth }),
        snapshot: () => ({ records: [...records, ...recorded] }),
        apply: (ops, context) => {
            const op = ops[0];
            assert.equal(op.op, 'record', '余波只走 record');
            seq += 1;
            const record = {
                id: `r${seq}`, title: op.title, detail: op.detail, target: op.target,
                kind: op.kind, weight: op.weight, certainty: op.certainty, parent: op.parent,
                depth: 1, day: context.day,
            };
            recorded.push(record);
            return { status: 'applied', applied: [{ ok: true, record }] };
        },
    };
    const world = {
        apply: (ops, context) => {
            if (worldFails) throw new Error('世界台账炸了');
            events.push({ ops, context });
            return { status: 'applied', applied: [{ ok: true, id: 'e1' }] };
        },
    };
    const api = runInNewContext(`${code}; ({ derive: deriveImpactAftermath })`, {
        impactSettings: () => ({ deriveChain }),
        agentImpactRuntime: runtime,
        agentWorldRuntime: world,
        worldDay: () => 16,
        console: { warn() { /* 静音 */ } },
        existing,
    });
    return { ...api, recorded, events };
}

function row({ id = 'i3', weight = 'major', links = [], parent = '', depth = 0 } = {}) {
    return { status: 'materialized', id, impact: { applied: [{ ok: true, record: { id, title: '药材被截', target: '加列家', weight, links, parent, depth } }] } };
}

await test('ECHO-1 落成后长出一条余波，并在世界台账里落一条风闻', () => {
    const h = harness();
    const created = h.derive({ rows: [row({ links: [{ type: 'person', name: '萧炎' }, { type: 'person', name: '药老' }] })] });
    assert.equal(created.length, 1);
    assert.equal(h.recorded.length, 1);
    const ripple = h.recorded[0];
    assert.match(ripple.title, /^余波：/);
    assert.equal(ripple.parent, 'i3', '父编号指回去，面板才能回溯');
    assert.equal(ripple.certainty, 'rumor', '余波是风闻，不是既成事实');
    assert.equal(ripple.kind, 'ripple');
    assert.equal(ripple.weight, 'minor', '大事的余波降一档：余波不该和本体一样重');

    assert.equal(h.events.length, 1, '余波要进世界台账，否则世界上没人可能听说');
    const [op] = h.events[0].ops;
    assert.equal(op.op, 'addEvent');
    assert.equal(op.weight, 'rumor');
    assert.equal(op.basis, '影响#r1', 'basis 挂余波编号，回响反查得到');
    assert.match(op.title, /^风声：/);
    assert.match(op.text, /^（风闻）/);
    assert.deepEqual(op.participants, ['萧炎', '药老'], '牵涉的人跟着进事件');
    assert.equal(h.events[0].context.source, 'impact');
});

await test('ECHO-2 已经长过一条余波的父影响不再重复长', () => {
    const h = harness({ records: [{ id: 'i3', parent: '', depth: 0 }, { id: 'r9', parent: 'i3' }] });
    const created = h.derive({ rows: [row()] });
    assert.equal(created.length, 0);
    assert.equal(h.recorded.length, 0);
});

await test('ECHO-3 链式：余波自己落成后还能再长一层', () => {
    const h = harness({ maxChainDepth: 3 });
    const created = h.derive({ rows: [row({ id: 'r1', parent: 'i3', depth: 1 })] });
    assert.equal(created.length, 1, '余波也能有下一层');
    assert.equal(h.recorded[0].parent, 'r1');
});

await test('ECHO-4 到层就停，不会自己繁殖', () => {
    const h = harness({ maxChainDepth: 2 });
    const created = h.derive({ rows: [row({ id: 'r2', parent: 'r1', depth: 1 })] });
    assert.equal(created.length, 0, 'depth 1 + 1 >= 2 就到顶');
});

await test('ECHO-5 关掉派生开关就什么都不长', () => {
    const h = harness({ deriveChain: false });
    assert.equal(h.derive({ rows: [row()] }).length, 0);
    assert.equal(h.recorded.length, 0);
    assert.equal(h.events.length, 0);
});

await test('ECHO-6 世界台账写余波时抛错，账本里那条余波照样留下', () => {
    const h = harness({ worldFails: true });
    const created = h.derive({ rows: [row()] });
    assert.equal(created.length, 1, '世界侧失败不算失败，影响账本里的余波还在');
    assert.equal(h.events.length, 0);
});

console.log('impact aftermath tests passed');
