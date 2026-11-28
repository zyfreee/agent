import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

// 世界影响「动到玩家身家」的落账：影响落成后不该自己改纳戒账本，
// 而是把后果翻译成纳戒认得的那几个 op，走纳戒自己的 apply()——
// 这样金币上限、行囊清单、境界字段、流水与撤销记录全都照旧生效，不出现第二个写入口。
// 归一化行尾：Windows 检出（autocrlf）会把源码变 CRLF，切片标记按 LF 写，先统一。
const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function extract(start, end) {
    assert.equal(source.split(start).length, 2, `unique entry declaration: ${start}`);
    const from = source.indexOf(start), to = source.indexOf(end, from);
    assert.ok(to > from, `entry boundary: ${end}`);
    return source.slice(from, to);
}

const code = extract('function applyImpactSelfTouches(execution)', '\nfunction runImpactMaterialization()');

function harness({ items = [], applied = null, throws = false } = {}) {
    const calls = [];
    const api = runInNewContext(`${code}; ({ apply: applyImpactSelfTouches })`, {
        applySelfOps: (ops, context) => {
            calls.push({ ops, context });
            if (throws) throw new Error('纳戒炸了');
            return { status: 'applied', applied: applied ?? ops.map((op, index) => ({ ok: true, summary: `第${index + 1}笔` })) };
        },
        agentSelfRuntime: { snapshot: () => ({ items }) },
        console: { warn() { /* 测试里不打印 */ } },
    });
    return { ...api, calls };
}

// 沙箱里造的对象原型与宿主不同，deepEqual 会判定“结构相同但不相等”。
// 统一过一遍 JSON，拿回来的就是宿主世界的普通对象。
function plain(value) {
    return JSON.parse(JSON.stringify(value ?? null));
}

await test('IMP-SELF-1 金币按增减翻译成 addGold，依据挂上影响编号', () => {
    const h = harness();
    const result = h.apply({
        rows: [{ id: 'i9', selfTouches: [{ field: 'gold', amount: 120, note: '谢礼' }] }],
    });
    assert.equal(h.calls.length, 1, '一批只调一次纳戒，别每笔开一次流水');
    assert.deepEqual(plain(h.calls[0].ops), [{ op: 'addGold', amount: 120, note: '影响#i9｜谢礼' }]);
    assert.equal(h.calls[0].context.source, 'impact', '纳戒据此不走同楼重 roll 撤销');
    assert.equal(result.changed, 1);
});

await test('IMP-SELF-2 境界直接写纳戒境界，带上小阶', () => {
    const h = harness();
    h.apply({ rows: [{ id: 'i10', selfTouches: [{ field: 'realm', realm: '斗师', stage: '三星', note: '被逼着当众突破' }] }] });
    assert.deepEqual(plain(h.calls[0].ops), [{ op: 'setRealm', realm: '斗师', stage: '三星' }]);
});

await test('IMP-SELF-3 得东西走 addItem，丢东西按行囊里那一条扣、绝不凭空扣', () => {
    const h = harness({
        items: [
            { id: 'r1', name: '三株药材', count: 2 },
            { id: 'r2', name: '回气散', count: 1 },
        ],
    });
    h.apply({
        rows: [{
            id: 'i11',
            selfTouches: [
                { field: 'item', name: '玄铁片', count: 2, note: '货栈里捡的' },
                { field: 'item', name: '三株药材', count: -3, note: '被加列家的人抢了' },
                { field: 'item', name: '影骨草', count: -1, note: '行囊里根本没有' },
            ],
        }],
    });
    const ops = h.calls[0].ops;
    assert.deepEqual(plain(ops[0]), { op: 'addItem', name: '玄铁片', count: 2, note: '影响#i11｜货栈里捡的' });
    // 要扣 3 份，行囊只有 2 份：先扣光那一条，缺口不再硬扣（剩余 1 份没有落点，直接放弃）。
    assert.deepEqual(plain(ops[1]), { op: 'removeItem', id: 'r1', count: 2 });
    assert.equal(ops.length, 2, '行囊里没有的东西不许凭空扣出一条 op');
});

await test('IMP-SELF-4 没有身家后果时不碰纳戒', () => {
    const h = harness();
    const result = h.apply({ rows: [{ id: 'i9', selfTouches: [] }, { id: 'i10' }] });
    assert.equal(h.calls.length, 0, '不该空转一次 apply');
    assert.equal(result.status, 'noop');
});

await test('IMP-SELF-5 纳戒抛错不拖垮记账主流程', () => {
    const h = harness({ throws: true });
    const result = h.apply({ rows: [{ id: 'i9', selfTouches: [{ field: 'gold', amount: 10, note: '一点赏钱' }] }] });
    assert.equal(result.status, 'error');
    assert.equal(result.changed, 0, '错误要吞掉，影响账本本身已经落成了');
});

console.log('index impact self tests passed');
