import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditMemory, catalogedIds } from './memory-audit.js';
import { findMemoryConflicts } from './memory-ops.js';

const entry = (id, related, extra = {}) => ({
    id, tier: 'small', text: '正文', title: '标题', related, aliases: [], day: 1, weight: 'minor', ...extra,
});

await test('OPT-052 isolated keys: single-use and unclaimed by any ledger entity', () => {
    const snapshot = { entries: [
        entry('m1', ['穆蛇']),
        entry('m2', ['穆蛇']), // 共享钥匙不算孤立
        entry('m3', ['陨落心炎']), // 只有一条用、台账认领不到 → 孤立
        entry('m4', ['药老']), // 虽然只有一条用，但人物簿认领了
        entry('m5', ['炎']), // 单字钥匙不做模糊，直接跳过
        entry('m6', ['蛇人穆蛇']), // 与已知名"穆蛇"双向包含 → 认领豁免
    ] };
    const audit = auditMemory({ snapshot, pairs: [], knownNames: ['药老', '穆蛇', '云岚宗'] });
    assert.deepEqual(audit.deadKeys.map(item => item.key), ['陨落心炎']);
    assert.deepEqual(audit.deadKeys[0].ids, ['m3']);
    assert.deepEqual(audit.pairs, [], 'caller-supplied pairs pass through without recompute');
});

await test('OPT-052 pairs default to a real findMemoryConflicts run', () => {
    const text = '穆蛇在坊市拦路勒索，被赶跑了。';
    const snapshot = { entries: [entry('m1', ['穆蛇'], { text }), entry('m2', ['穆蛇'], { text })] };
    const audit = auditMemory({ snapshot });
    assert.equal(audit.pairs.length, 1);
    assert.deepEqual(audit.pairs[0], { a: 'm1', b: 'm2', similarity: 1 });
    assert.deepEqual(auditMemory({ snapshot, pairs: findMemoryConflicts(snapshot.entries) }).pairs, audit.pairs);
});

await test('OPT-052 coverage counts ids parsed from the catalog text against open entries', () => {
    const snapshot = { entries: [
        entry('m1', ['穆蛇']),
        entry('m2', ['云岚宗'], { supersededBy: 'm1' }), // 已覆盖：不进分母
        entry('m3', ['药老']),
        entry('m4', ['坊市']),
    ] };
    const catalogText = '- m1|大|标题（穆蛇）\n- m3|小|标题（药老）\n- m9|小|幽灵条目不算';
    const audit = auditMemory({ snapshot, pairs: [], catalogText, catalogBudget: 4000 });
    assert.deepEqual(audit.coverage, { cataloged: 2, total: 3, budgetChars: 4000 });
    assert.deepEqual(catalogedIds(''), new Set(), 'empty catalog means nothing covered');
    assert.equal(audit.superseded, 1);
    assert.equal(audit.major, 0);
});

await test('OPT-052 major weight and malformed inputs degrade safely', () => {
    const audit = auditMemory({ snapshot: { entries: [entry('m1', ['穆蛇'], { weight: 'major' }), null, entry('m2', ['萧薰儿'], { supersededBy: 'm1' })] }, catalogText: 42, catalogBudget: 'x' });
    assert.equal(audit.major, 1);
    assert.deepEqual(audit.coverage, { cataloged: 0, total: 1, budgetChars: 0 }, 'non-string catalog degrades to zero coverage');
    assert.equal(audit.superseded, 1);
    assert.deepEqual(auditMemory({}).deadKeys, []);
});
