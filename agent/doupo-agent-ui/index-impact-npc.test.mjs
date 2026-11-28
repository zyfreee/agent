import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

// 世界影响「动到人」的落账：影响落成后不该自己改人物簿，
// 而是把后果攒成人物簿认得的补丁，走人物簿自己的 apply()——
// 这样那道 ±15 的幅度闸、审计、流水、世界影响编号全都照旧生效，不出现第二个写入口。
// 归一化行尾：Windows 检出（autocrlf）会把源码变 CRLF，切片标记按 LF 写，先统一。
const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function extract(start, end) {
    assert.equal(source.split(start).length, 2, `unique entry declaration: ${start}`);
    const from = source.indexOf(start), to = source.indexOf(end, from);
    assert.ok(to > from, `entry boundary: ${end}`);
    return source.slice(from, to);
}

const code = extract('function applyImpactNpcTouches(execution)', '\nfunction runImpactMaterialization()');

function harness({ changed = 1, applied = [{ name: '萧炎' }] } = {}) {
    const calls = [];
    let persisted = 0;
    const api = runInNewContext(`${code}; ({ apply: applyImpactNpcTouches })`, {
        worldDay: () => 16,
        persistNpcLedger: () => { persisted += 1; },
        agentNpcLedger: {
            apply: (payload, context) => {
                calls.push({ payload, context });
                return { status: 'applied', changed, applied, ignored: [], audits: [] };
            },
        },
        console: { warn() { /* 测试里不打印 */ } },
    });
    return { ...api, calls, persisted: () => persisted };
}

await test('IMP-NPC-1 一条影响的每个人物后果都攒成人物簿补丁，并挂上影响编号', () => {
    const h = harness();
    const result = h.apply({
        rows: [{
            id: 'i9',
            npcTouches: [
                { name: '萧炎', favor: 12, attitude: '把你当救命恩人', note: '死巷里救了他一命' },
                { name: '萧宁', favor: -6, appellation: '那个杂役', note: '当众被他落了脸' },
            ],
        }],
    });
    assert.equal(h.calls.length, 1, '只调一次人物簿，批量落账');
    const patches = h.calls[0].payload.人物;
    assert.equal(patches.length, 2);
    assert.equal(patches[0].name, '萧炎');
    assert.equal(patches[0].好感, '+12', '正向好感带 + 号，人物簿按相对值累加');
    assert.equal(patches[0].好感理由, '死巷里救了他一命', '理由截进 15 字以内');
    assert.equal(patches[0].态度, '把你当救命恩人');
    assert.equal(patches[0].世界影响, '影响#i9', '人物簿靠这个键反向看到“被哪条影响动过”');
    assert.equal(patches[1].好感, '-6');
    assert.equal(patches[1].称呼, '那个杂役');
    assert.equal(h.calls[0].context.day, 16);
    assert.equal(result.changed, 1);
    assert.deepEqual(result.names, ['萧炎']);
    assert.equal(h.persisted(), 1, '真改了才落盘');
});

await test('IMP-NPC-2 没有人物后果时不碰人物簿', () => {
    const h = harness();
    const result = h.apply({ rows: [{ id: 'i9', npcTouches: [] }, { id: 'i10' }] });
    assert.equal(h.calls.length, 0, '不该空转一次 apply');
    assert.equal(result.status, 'noop');
    assert.equal(h.persisted(), 0);
});

await test('IMP-NPC-3 人物簿拒绝时如实回报，不假装改成功', () => {
    const h = harness({ changed: 0, applied: [] });
    const result = h.apply({ rows: [{ id: 'i9', npcTouches: [{ name: '萧炎', favor: 3, note: '顺手搭了句话' }] }] });
    assert.equal(result.changed, 0);
    assert.equal(h.persisted(), 0, '没改动就不落盘');
});

await test('IMP-NPC-4 人物簿抛错不拖垮记账主流程', () => {
    const api = runInNewContext(`${code}; ({ apply: applyImpactNpcTouches })`, {
        worldDay: () => 16,
        persistNpcLedger: () => { throw new Error('不该被调用'); },
        agentNpcLedger: { apply: () => { throw new Error('人物簿炸了'); } },
        console: { warn() { /* 静音 */ } },
    });
    const result = api.apply({ rows: [{ id: 'i9', npcTouches: [{ name: '萧炎', favor: 3, note: '随口一句' }] }] });
    assert.equal(result.status, 'error');
    assert.equal(result.changed, 0, '错误要吞掉，影响账本本身已经落成了');
});

console.log('index impact npc tests passed');
