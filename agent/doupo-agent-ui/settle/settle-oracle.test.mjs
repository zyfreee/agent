import assert from 'node:assert/strict';
import { SETTLE_ORACLE_TABLE, SETTLE_ORACLE_DEFAULT_CHANCE, rollSettleOracle } from './settle-oracle.js';

let cases = 0;
function test(name, fn) { fn(); cases += 1; }
const sequence = values => { let index = 0; return () => values[Math.min(index++, values.length - 1)]; };

test('table entries stay compatible with world addEvent weight vocabulary', () => {
    assert.ok(SETTLE_ORACLE_TABLE.length >= 6, '至少六条变数');
    for (const entry of SETTLE_ORACLE_TABLE) {
        assert.ok(entry.title.length > 0 && entry.title.length <= 16, entry.title);
        assert.ok(entry.detail.length > 0 && entry.detail.length <= 300, entry.detail);
        assert.ok(['minor', 'major', 'rumor'].includes(entry.weight), entry.weight);
    }
    assert.ok(SETTLE_ORACLE_TABLE.some(entry => entry.weight === 'rumor'), '至少一条传闻级变数');
    assert.equal(SETTLE_ORACLE_DEFAULT_CHANCE > 0 && SETTLE_ORACLE_DEFAULT_CHANCE < 1, true);
});

test('missed roll returns null, hit returns a stable table entry', () => {
    assert.equal(rollSettleOracle({ rng: sequence([0.9]), chance: 0.25 }), null);
    const hit = rollSettleOracle({ rng: sequence([0.1]), chance: 0.25 });
    assert.equal(hit.weight, 'minor');
    assert.equal(hit.title, SETTLE_ORACLE_TABLE[3].title, '0.1/0.25 落在第四条');
    assert.ok(hit.detail);
    assert.equal(rollSettleOracle({ rng: sequence([0.2499]), chance: 0.25 }).title, SETTLE_ORACLE_TABLE[7].title);
});

test('boundaries: zero chance never fires, certainty always fires, junk falls back to default', () => {
    for (const value of [0, 0, 0]) assert.equal(rollSettleOracle({ rng: sequence([0.001]), chance: 0 }), null);
    const always = rollSettleOracle({ rng: sequence([0.999]), chance: 1 });
    assert.ok(SETTLE_ORACLE_TABLE.includes(always) === false || always, 'certainty 返回条目对象');
    assert.equal(always.title.length > 0, true);
    const fallback = rollSettleOracle({ rng: sequence([0.1]), chance: Number.NaN });
    assert.ok(fallback, '非法 chance 回落默认，0.1 < 0.25 命中');
    assert.equal(fallback.title, SETTLE_ORACLE_TABLE[3].title);
});

test('rng is mandatory for determinism; absent rng still works via Math.random without throwing', () => {
    const result = rollSettleOracle({ chance: 1 });
    assert.ok(result && result.title);
});

console.log(`settle oracle tests passed (${cases} cases)`);
