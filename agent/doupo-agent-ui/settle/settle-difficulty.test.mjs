import assert from 'node:assert/strict';
import {
    SETTLE_DIFFICULTIES, SETTLE_DIFFICULTY_LABELS, SETTLE_DIFFICULTY_DC, SETTLE_DICE_SIDES,
    SETTLE_PARTIAL_MARGIN, SETTLE_MODIFIER_MAX, SETTLE_MODIFIER_TOTAL_MAX,
    createSettleDiceRng, normalizeSettleDifficulty, normalizeSettleModifiers,
    adjudicateSettleAction, applySettleDice,
} from './settle-difficulty.js';

let cases = 0;
function test(name, fn) { fn(); cases += 1; }
const sequence = values => { let index = 0; return () => values[Math.min(index++, values.length - 1)]; };
// rng → d20：0.65*20=13.000…2 → die 14；0.30 → die 7；0.25 → die 6；0.0 → die 1；0.995 → die 20。
const die = value => (value - 1) / SETTLE_DICE_SIDES + 0.01;
const gold = (value, extra = {}) => ({ targetId: 'player', field: 'gold', type: 'add', value, allowNegative: value < 0, reason: '明确收支', ...extra });
const attempted = (extra = {}) => ({ id: 'a1', category: 'general', evidence: '买药', dependsOn: [], status: 'success', difficulty: 'standard', outcome: '买到了药', consequences: [], penalties: [], effects: [gold(-10)], ...extra });

test('difficulty ladder and constants keep the BitD-style spread', () => {
    assert.deepEqual([...SETTLE_DIFFICULTIES], ['controlled', 'standard', 'risky', 'desperate']);
    assert.equal(SETTLE_DIFFICULTY_LABELS.desperate, '绝望');
    assert.deepEqual(SETTLE_DIFFICULTY_DC, { controlled: 8, standard: 11, risky: 14, desperate: 17 });
    assert.equal(SETTLE_DICE_SIDES, 20);
    assert.equal(SETTLE_PARTIAL_MARGIN, 4);
    assert.equal(SETTLE_MODIFIER_MAX, 3);
    assert.equal(SETTLE_MODIFIER_TOTAL_MAX, 4);
});

test('declared difficulty must be one of the four tiers, junk falls back to standard', () => {
    for (const value of SETTLE_DIFFICULTIES) assert.equal(normalizeSettleDifficulty(value), value);
    assert.equal(normalizeSettleDifficulty('easy'), 'standard');
    assert.equal(normalizeSettleDifficulty(undefined), 'standard');
    assert.equal(normalizeSettleDifficulty(null), 'standard');
});

test('modifiers need reasons, clamp per entry and in total, and record every adjustment', () => {
    const clean = normalizeSettleModifiers([{ reason: '焚诀加成', value: 2 }]);
    assert.equal(clean.value, 2);
    assert.deepEqual(clean.notes, []);

    const clamped = normalizeSettleModifiers([
        { reason: '天阶斗技', value: 9 },
        { reason: '越级挑战', value: -9 },
        { reason: '', value: 3 },
        { reason: '没有数值', value: Number.NaN },
        null,
    ]);
    assert.equal(clamped.value, 0, '+3 与 -3 相抵');
    assert.equal(clamped.kept.length, 2);
    assert.equal(clamped.notes.length, 5, '两条超限收敛、缺依据、非法数值、非对象各记一条');
    assert.ok(clamped.notes.some(note => note.includes('±3')));
    assert.ok(clamped.notes.some(note => note.includes('缺少依据')));

    const total = normalizeSettleModifiers([{ reason: 'a', value: 3 }, { reason: 'b', value: 3 }]);
    assert.equal(total.value, SETTLE_MODIFIER_TOTAL_MAX, '总计收敛到 +4');
    assert.ok(total.notes.some(note => note.includes('±4')));

    assert.deepEqual(normalizeSettleModifiers('不是数组'), { value: 0, kept: [], notes: [] });
    assert.deepEqual(normalizeSettleModifiers([]), { value: 0, kept: [], notes: [] });
});

test('single adjudication: d20+modifier against DC with nat 1 / nat 20 rules', () => {
    assert.deepEqual(pick(adjudicateSettleAction({ difficulty: 'standard' }, { rng: sequence([die(14)]) })), { die: 14, status: 'success' });
    assert.deepEqual(pick(adjudicateSettleAction({ difficulty: 'standard' }, { rng: sequence([die(7)]) })), { die: 7, status: 'partial' });
    assert.deepEqual(pick(adjudicateSettleAction({ difficulty: 'standard' }, { rng: sequence([die(6)]) })), { die: 6, status: 'failure' });
    assert.deepEqual(pick(adjudicateSettleAction({ difficulty: 'desperate' }, { rng: sequence([die(20)]) })), { die: 20, status: 'success' }, 'nat 20 必成');
    assert.deepEqual(pick(adjudicateSettleAction({ difficulty: 'controlled' }, { rng: sequence([die(1)]) })), { die: 1, status: 'failure' }, 'nat 1 必败');
    assert.deepEqual(pick(adjudicateSettleAction({ difficulty: 'controlled' }, { rng: sequence([die(8)]) })), { die: 8, status: 'success' }, '受控 dc=8');
    assert.deepEqual(pick(adjudicateSettleAction({ difficulty: 'controlled' }, { rng: sequence([die(4)]) })), { die: 4, status: 'partial' }, 'dc-4 边界算部分成功');
    assert.deepEqual(pick(adjudicateSettleAction({ difficulty: 'desperate', modifiers: [{ reason: '族徽令牌', value: 3 }] }, { rng: sequence([die(14)]) })), { die: 14, status: 'success' }, '14+3=17 ≥ 17 边界成功');
    assert.deepEqual(pick(adjudicateSettleAction({ difficulty: 'desperate', modifiers: [{ reason: '族徽令牌', value: 3 }] }, { rng: sequence([die(9)]) })), { die: 9, status: 'failure' }, '9+3=12 < 13 失败');
    assert.deepEqual(pick(adjudicateSettleAction({ difficulty: 'desperate', modifiers: [{ reason: '族徽令牌', value: 4 }] }, { rng: sequence([die(14)]) })), { die: 14, status: 'success' }, '修正收敛后 14+4=18 ≥ 17');

    function pick(result) { return { die: result.die, status: result.status }; }
});

test('applySettleDice without rng is a no-op so legacy paths stay deterministic', () => {
    const action = attempted();
    const result = applySettleDice([action], {});
    assert.equal(result.actions[0], action);
    assert.deepEqual([result.rolled, result.overridden, result.oracle], [0, 0, null]);
});

test('actions without a declared difficulty bypass the dice entirely (old contract)', () => {
    const legacy = attempted({ difficulty: undefined });
    const result = applySettleDice([legacy], { rng: sequence([die(1)]) });
    assert.equal(result.actions[0], legacy);
    assert.equal(result.actions[0].dice, undefined);
    assert.equal(result.rolled, 0);
    assert.equal(result.oracle, null, '没人掷骰就没有波折，变数也不掷');
});

test('dice can only downgrade: failure claim stays failure even on a winning roll', () => {
    const result = applySettleDice([attempted({ status: 'failure', outcome: '没买到' })], { rng: sequence([die(20)]) });
    assert.equal(result.actions[0].status, 'failure', '只降不升');
    assert.equal(result.actions[0].outcome, '没买到');
    assert.equal(result.actions[0].dice.override, false);
    assert.equal(result.overridden, 0);
});

test('partial claim survives a winning roll untouched', () => {
    const action = attempted({ status: 'partial', consequences: ['【耗时·轻】多排队'] });
    const result = applySettleDice([action], { rng: sequence([die(20)]) });
    assert.equal(result.actions[0].status, 'partial');
    assert.deepEqual(result.actions[0].consequences, ['【耗时·轻】多排队'], '未降级不补保底代价');
});

test('downgrade to failure keeps only real costs, swaps the outcome, and keeps the claim for audit', () => {
    const action = attempted({
        outcome: '买到药还多赚了十枚',
        consequences: ['【资源·轻】花了十枚金币', '顺路打听消息'],
        effects: [gold(10, { reason: '倒卖赚的' }), gold(-10)],
    });
    const result = applySettleDice([action], { rng: sequence([die(6)]) });
    const settled = result.actions[0];
    assert.equal(settled.status, 'failure');
    assert.equal(settled.dice.override, true);
    assert.equal(settled.dice.claimedStatus, 'success');
    assert.equal(settled.claimedOutcome, '买到药还多赚了十枚');
    assert.equal(settled.outcome, '判定掷骰不利，此行动未达成预期结果。');
    assert.deepEqual(settled.consequences, []);
    assert.deepEqual(settled.penalties, []);
    assert.deepEqual(settled.effects, [gold(-10)], '支出留下，收益剔除');
    assert.equal(result.overridden, 1);
});

test('downgrade to partial keeps effects but appends the category-specific guaranteed cost', () => {
    const combat = attempted({ id: 'c1', category: 'combat', outcome: '一拳打中', effects: [], evidence: '打了一拳' });
    const result = applySettleDice([combat], { rng: sequence([die(7)]) });
    assert.equal(result.actions[0].status, 'partial');
    assert.deepEqual(result.actions[0].consequences, ['【受伤·轻】负了点轻伤，出手慢了半拍']);
    assert.deepEqual(result.actions[0].penalties, [{ type: 'injury', grade: 'minor', text: '负了点轻伤，出手慢了半拍' }]);
});

test('execution-gated statuses and broken actions never reach the dice', () => {
    const actions = [
        attempted({ id: 'a1', status: 'insufficient', effects: [] }),
        attempted({ id: 'a2', status: 'not_executed', effects: [] }),
        attempted({ id: 'a3', category: 'none' }),
        attempted({ id: 'a4', parseErrors: ['invalid_effect'] }),
    ];
    const result = applySettleDice(actions, { rng: sequence([die(1)]) });
    assert.equal(result.rolled, 0);
    assert.equal(result.overridden, 0);
    assert.equal(result.oracle, null);
    assert.deepEqual(result.actions.map(entry => entry.dice ?? null), [null, null, null, null]);
});

test('combat against a higher-realm opponent floors the difficulty before rolling', () => {
    const npcs = [{ name: '云山', realm: '斗王三星' }, { name: '萧战', realm: '斗者九星' }];
    const desperate = attempted({ id: 'c1', category: 'combat', evidence: '向云山出手', modifiers: [{ reason: '族徽令牌', value: 3 }] });
    const result = applySettleDice([desperate], { rng: sequence([die(14)]), npcs, playerRealm: '斗者三星' });
    assert.equal(result.actions[0].dice.dc, SETTLE_DIFFICULTY_DC.desperate, '高出两个大境界直接绝望档');
    assert.equal(result.actions[0].dice.status, 'success', '绝望档 14+3=17 ≥ 17 成功');

    const same = attempted({ id: 'c2', category: 'combat', evidence: '和萧战切磋' });
    const even = applySettleDice([same], { rng: sequence([die(11)]), npcs, playerRealm: '斗者三星' });
    assert.equal(even.actions[0].dice.dc, SETTLE_DIFFICULTY_DC.standard, '同境界不抬档，11≥11 成功');

    const unknown = attempted({ id: 'c3', category: 'combat', evidence: '向陌生面孔出手' });
    const skip = applySettleDice([unknown], { rng: sequence([die(11)]), npcs, playerRealm: '斗者三星' });
    assert.equal(skip.actions[0].dice.dc, SETTLE_DIFFICULTY_DC.standard, '证据没点名对手就不抬档');

    const vague = attempted({ id: 'c4', category: 'combat', evidence: '向云山出手' });
    const unparseable = applySettleDice([vague], { rng: sequence([die(11)]), npcs: [{ name: '云山', realm: '斗皇' }], playerRealm: '' });
    assert.equal(unparseable.actions[0].dice.dc, SETTLE_DIFFICULTY_DC.standard, '玩家境界认不出时不抬档');
});

test('declared difficulty above the realm floor wins', () => {
    const npcs = [{ name: '云山', realm: '斗师三星' }];
    const action = attempted({ id: 'c1', category: 'combat', evidence: '向云山出手', difficulty: 'desperate' });
    const result = applySettleDice([action], { rng: sequence([die(14)]), npcs, playerRealm: '斗者三星' });
    assert.equal(result.actions[0].dice.dc, SETTLE_DIFFICULTY_DC.desperate, '模型自报绝望档高于风险保底');
});

test('wavered rounds roll the oracle once; clean rounds never do', () => {
    const wavered = applySettleDice([attempted()], { rng: sequence([die(6), 0.1]), oracleChance: 0.25 });
    assert.equal(wavered.oracle.weight, 'minor', '降级后掷变数，0.1 命中');
    assert.ok(wavered.oracle.title);

    const clean = applySettleDice([attempted()], { rng: sequence([die(14), 0.1]), oracleChance: 0.25 });
    assert.equal(clean.oracle, null, '全成功不掷变数');

    const missed = applySettleDice([attempted()], { rng: sequence([die(6), 0.9]), oracleChance: 0.25 });
    assert.equal(missed.oracle, null, '波折但变数没掷中');
});

test('production rng is crypto-backed and stays in [0,1)', () => {
    const rng = createSettleDiceRng();
    for (let index = 0; index < 32; index += 1) {
        const value = rng();
        assert.ok(value >= 0 && value < 1);
    }
    const die = 1 + Math.floor(rng() * SETTLE_DICE_SIDES);
    assert.ok(die >= 1 && die <= SETTLE_DICE_SIDES);
});

console.log(`settle difficulty tests passed (${cases} cases)`);
