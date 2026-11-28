import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

// P0 的两条硬连线：判定官报上来的命中要过本地证据链，过了就当场兑现。
// 这里把两个函数从 index.js 切出来单独跑——它们本来就只依赖 runtime 和两个门面，
// 不必为了验一行逻辑去模拟整轮生成。
const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function extract(start, end) {
    assert.equal(source.split(start).length, 2, `unique entry: ${start}`);
    const from = source.indexOf(start), to = source.indexOf(end, from);
    assert.ok(to > from, `boundary: ${end}`);
    return source.slice(from, to);
}

const ripenCode = extract('function ripenJudgedHits(hits)', '\n/** 被证据链驳回的命中记在最近一次判定上');
const dropCode = extract('function noteDroppedImpactHits(rejected, rawHits)', '\n\n\n// 世界影响注入与恢复');

function harness() {
    const calls = [];
    const state = { applied: null, throws: false, persisted: 0 };
    const api = runInNewContext(
        `let lastDroppedImpactHits = [];\n${ripenCode}\n${dropCode}\n({ ripen: ripenJudgedHits, note: noteDroppedImpactHits, dropped: () => lastDroppedImpactHits })`,
        {
            agentImpactRuntime: {
                apply: (ops, context) => {
                    calls.push({ ops, context });
                    if (state.throws) throw new Error('账本炸了');
                    return { status: 'applied', applied: state.applied ?? ops.map(() => ({ ok: true })) };
                },
            },
            worldDay: () => 17,
            persistImpact: () => { state.persisted += 1; },
        },
    );
    return { ...api, calls, state };
}

function plain(value) {
    return JSON.parse(JSON.stringify(value ?? null));
}

await test('IMP-JUDGE-1 判定通过的命中当场翻成“应验”，带上场面与凭证', () => {
    const h = harness();
    h.ripen([
        { ref: 'i12', why: '萧炎被堵在死巷，正好用上当年那枚旧护符', evidence: '他把那枚旧护符攥在手里' },
        { ref: '#i13', why: '', evidence: '她认出那块牌子' },
    ]);
    assert.equal(h.calls.length, 1, '一批只调一次账本');
    const ops = plain(h.calls[0].ops);
    assert.equal(ops.length, 2);
    assert.deepEqual(ops[0], { op: 'ripen', ref: 'i12', detail: '萧炎被堵在死巷，正好用上当年那枚旧护符', hit: '他把那枚旧护符攥在手里' });
    assert.equal(ops[1].detail, '这一轮正文里被认领', '没写理由也要有个兜底说法，不能空着');
    assert.equal(h.calls[0].context.source, 'decide');
    assert.equal(h.calls[0].context.day, 17);
    assert.equal(h.state.persisted, 1, '兑现了就要落盘');
});

await test('IMP-JUDGE-2 没有命中就完全不碰账本', () => {
    const h = harness();
    h.ripen([]);
    h.ripen(null);
    assert.equal(h.calls.length, 0);
    assert.equal(h.state.persisted, 0);
});

await test('IMP-JUDGE-3 账本抛错不能拖垮注入（下一轮还能再认领一次）', () => {
    const h = harness();
    h.state.throws = true;
    assert.doesNotThrow(() => h.ripen([{ ref: 'i1', why: 'x', evidence: 'y' }]));
    assert.equal(h.state.persisted, 0);
});

await test('IMP-JUDGE-4 被驳回的命中记下编号、原因与模型原本说的是哪条', () => {
    const h = harness();
    h.note(
        [{ ref: 'i5', reason: 'evidence_not_found' }, { ref: 'i6', reason: 'why_incomplete' }],
        [{ ref: 'i5', text: '货栈三株药材被截' }, { ref: '#i6', text: '萧宁憋着一口气' }, { ref: 'i7', text: '没被驳回的那条' }],
    );
    assert.deepEqual(plain(h.dropped()), [
        { ref: 'i5', reason: 'evidence_not_found', title: '货栈三株药材被截' },
        { ref: 'i6', reason: 'why_incomplete', title: '萧宁憋着一口气' },
    ], '编号前面的 # 要去掉才能对上，找不到标题就留空');
});

await test('IMP-JUDGE-5 驳回记录最多留十条，且会被下一轮整体替换', () => {
    const h = harness();
    const many = Array.from({ length: 14 }, (_, i) => ({ ref: `i${i + 1}`, reason: 'duplicate' }));
    h.note(many, []);
    assert.equal(h.dropped().length, 10);
    h.note([{ ref: 'i99', reason: 'not_sunk' }], []);
    assert.deepEqual(plain(h.dropped()), [{ ref: 'i99', reason: 'not_sunk', title: '' }], '新的一轮要替换旧记录，不能越攒越多');
});
