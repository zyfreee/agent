import assert from 'node:assert/strict';
import {
    SETTLE_CONSEQUENCE_TYPES, SETTLE_CONSEQUENCE_TYPE_LABELS, SETTLE_CONSEQUENCE_GRADES, SETTLE_CONSEQUENCE_GRADE_LABELS,
    normalizeSettleConsequences, SETTLE_PARTIAL_COSTS, partialCostFor, ensurePartialCost,
} from './settle-consequences.js';

let cases = 0;
function test(name, fn) { fn(); cases += 1; }

test('exposes closed type/grade vocabularies with Chinese labels', () => {
    assert.deepEqual([...SETTLE_CONSEQUENCE_TYPES], ['time', 'resource', 'injury', 'reputation', 'grudge', 'exposure', 'misc']);
    assert.equal(SETTLE_CONSEQUENCE_TYPE_LABELS.grudge, '结仇');
    assert.equal(SETTLE_CONSEQUENCE_TYPE_LABELS.exposure, '暴露');
    assert.deepEqual([...SETTLE_CONSEQUENCE_GRADES], ['minor', 'moderate', 'severe']);
    assert.equal(SETTLE_CONSEQUENCE_GRADE_LABELS.severe, '重');
});

test('plain strings pass through unchanged and stay backward compatible', () => {
    const result = normalizeSettleConsequences(['付了药钱', '耽误半天']);
    assert.deepEqual(result.consequences, ['付了药钱', '耽误半天']);
    assert.deepEqual(result.penalties, [
        { type: null, grade: null, text: '付了药钱' },
        { type: null, grade: null, text: '耽误半天' },
    ]);
    assert.deepEqual(result.violations, []);
});

test('structured consequences normalize to prefixed strings with type and grade', () => {
    const result = normalizeSettleConsequences([
        { type: 'grudge', grade: 'moderate', text: '被加列奥家族记住脸了' },
        { type: 'injury', grade: 'minor', text: '擦伤' },
    ]);
    assert.deepEqual(result.consequences, ['【结仇·中】被加列奥家族记住脸了', '【受伤·轻】擦伤']);
    assert.deepEqual(result.penalties, [
        { type: 'grudge', grade: 'moderate', text: '被加列奥家族记住脸了' },
        { type: 'injury', grade: 'minor', text: '擦伤' },
    ]);
    assert.deepEqual(result.violations, []);
});

test('unknown type/grade fall back instead of failing, missing text is a violation', () => {
    const result = normalizeSettleConsequences([
        { type: 'curse', grade: 'extreme', text: '离谱写法' },
        { type: 'time', grade: 'minor' },
        { text: '只有正文' },
        '   ',
        null,
        42,
    ]);
    assert.deepEqual(result.consequences, ['【变故·中】离谱写法', '【变故·中】只有正文']);
    assert.deepEqual(result.penalties, [
        { type: 'misc', grade: 'moderate', text: '离谱写法' },
        { type: 'misc', grade: 'moderate', text: '只有正文' },
    ]);
    assert.equal(result.violations.length, 4, '缺正文/空串/非对象/数字都要记违规');
});

test('long structured text is clipped, not rejected', () => {
    const result = normalizeSettleConsequences([{ type: 'time', grade: 'minor', text: '长'.repeat(400) }]);
    assert.equal(result.consequences[0].length, 300);
    assert.deepEqual(result.violations, []);
});

test('every built-in category has a partial cost with a valid shape', () => {
    for (const key of ['alchemy', 'cultivation', 'combat', 'general', 'default']) {
        const cost = partialCostFor(key);
        assert.ok(SETTLE_CONSEQUENCE_TYPES.includes(cost.type), `${key} type`);
        assert.ok(SETTLE_CONSEQUENCE_GRADES.includes(cost.grade), `${key} grade`);
        assert.ok(cost.text.length > 0 && cost.text.length <= 300, `${key} text`);
    }
    assert.deepEqual(partialCostFor('炼器自定义'), SETTLE_PARTIAL_COSTS.default);
});

test('ensurePartialCost only tops up partial actions without a typed cost', () => {
    const plain = { status: 'partial', category: 'combat', consequences: ['气喘吁吁'], penalties: [] };
    assert.equal(ensurePartialCost(plain), true);
    assert.deepEqual(plain.consequences, ['气喘吁吁', '【受伤·轻】负了点轻伤，出手慢了半拍']);
    assert.deepEqual(plain.penalties, [{ type: 'injury', grade: 'minor', text: '负了点轻伤，出手慢了半拍' }]);

    const typed = { status: 'partial', category: 'alchemy', consequences: [], penalties: [{ type: 'resource', grade: 'minor', text: '药力打折' }] };
    assert.equal(ensurePartialCost(typed), false, '已有结构化代价就不补');
    assert.deepEqual(typed.consequences, []);

    const success = { status: 'success', category: 'combat', consequences: [], penalties: [] };
    assert.equal(ensurePartialCost(success), false);
    assert.deepEqual(success.consequences, []);

    const cultivation = { status: 'partial', category: 'cultivation', consequences: [], penalties: [] };
    ensurePartialCost(cultivation);
    assert.equal(cultivation.consequences[0], '【资源·轻】行功生涩，气机滞涩片刻');

    const unknown = { status: 'partial', category: '炼器', consequences: [], penalties: [] };
    ensurePartialCost(unknown);
    assert.equal(unknown.consequences[0], '【耗时·轻】横生枝节，多耗了些工夫');

    assert.equal(ensurePartialCost(null), false);
    assert.equal(ensurePartialCost({ status: 'failure' }), false);
});

console.log(`settle consequences tests passed (${cases} cases)`);
