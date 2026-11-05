import assert from 'node:assert/strict';
import {
    SETTLE_RESULT_PROMPT, SETTLE_RESULT_JSON_SCHEMA, SETTLE_INJECTION_SOURCES,
    SETTLE_ALLOWED_FIELDS, SETTLE_FIELD_LABELS, SETTLE_CATEGORY_LABELS,
    buildSettleState, buildSettleContextState, buildSettleResultUser,
    parseSettleResult, reviewSettleEffects, renderSettleInjection, compareSettleState,
} from './settle-adjudicate.js';
import { checkEffects } from '../core/settle-categories.js';

let cases = 0;
function test(name, fn) { fn(); cases += 1; }
const state = () => ({ player: { realm: '斗者三星', gold: 120 }, inventory: [
    { id: 'b1', name: '回气丹', category: '丹药', count: 2 },
    { id: 'b2', name: '凝血草', category: '药材', count: 4 },
] });
const gold = (value, extra = {}) => ({ targetId: 'player', field: 'gold', type: 'add', value, allowNegative: value < 0, reason: '明确金币收支', ...extra });
const item = (value, extra = {}) => ({ targetId: 'player', field: 'items', type: 'remove', value, itemId: 'b1', name: '回气丹', category: '丹药', reason: '服用库存中的回气丹', ...extra });
const realm = value => ({ targetId: 'player', field: 'realm', type: 'set', value, reason: '运功修炼' });
const action = (id = 'a1', evidence = '付十金币', extra = {}) => ({ id, category: 'general', evidence, dependsOn: [], status: 'success', outcome: '支付十金币', consequences: [], effects: [gold(-10)], ...extra });
const parsed = actions => parseSettleResult(JSON.stringify({ version: 2, actions, note: '本轮判定' }));
const review = (actions, input = actions.map(entry => entry.evidence).join('，'), snapshot = state(), options = {}) => reviewSettleEffects(parsed(actions), snapshot, { input, ...options });

test('OPT-024 binds evidence to nonoverlapping ordered source occurrences', () => {
    const income = (id, evidence) => action(id, evidence, { effects: [gold(10)], outcome: '获得十金币' });
    const overlap = review([income('a1', '我打工'), income('a2', '打工获得报酬')], '我打工获得报酬');
    assert.equal(overlap.actions.filter(entry => entry.approved).length, 1);
    assert.equal(overlap.expectedState.player.gold, 130, 'forecast only, not a live ledger write');
    const repeats = review([income('a1', '打工'), income('a2', '打工')], '打工；打工');
    assert.equal(repeats.actions.filter(entry => entry.approved).length, 2);
    assert.equal(repeats.expectedState.player.gold, 140);
    assert.deepEqual(repeats.actions.map(entry => entry.evidenceRange), [{ start: 0, end: 2 }, { start: 3, end: 5 }]);
});

// Contract and context budget.
test('exports retain fixed channels/labels while adding actual inventory fields', () => {
    assert.deepEqual(SETTLE_INJECTION_SOURCES.map(source => source.key), ['doupo_world', 'doupo_impact', 'doupo_npc_ledger', 'doupo_self', 'doupo_memory', 'doupo_facts']);
    assert.ok(SETTLE_ALLOWED_FIELDS.some(field => field.field === 'items'));
    assert.ok(!SETTLE_ALLOWED_FIELDS.some(field => field.field === 'location'));
    assert.equal(SETTLE_FIELD_LABELS.hp, '生命');
    assert.equal(SETTLE_FIELD_LABELS.items, '物品');
    assert.equal(SETTLE_CATEGORY_LABELS.cultivation, '修炼判定');
    for (const token of ['只输出 JSON', 'actions', 'evidence', 'dependsOn', 'itemId', 'category', 'allowNegative', '九段/九星圆满', '≤1000', '≤500', '≤300', '≤200', '≤100', '≤50', '24', 'ruleCategory']) assert.ok(SETTLE_RESULT_PROMPT.includes(token), token);
    assert.deepEqual(SETTLE_RESULT_JSON_SCHEMA.required, ['version', 'actions']);
    assert.equal(SETTLE_RESULT_JSON_SCHEMA.properties.actions.maxItems, 6);
    assert.equal(SETTLE_RESULT_JSON_SCHEMA.properties.actions.items.properties.effects.maxItems, 8);
});
test('full snapshot uses runtime snapshot rather than status item counts, never manufactures values or IDs', () => {
    const source = { realm: { realm: '斗者', stage: '三星' }, gold: 0, items: Array.from({ length: 100 }, (_, i) => ({ id: `b${i}`, name: `药材${i}`, category: '药材', count: i + 1 })), techniques: [{ id: 't1', name: '焚诀' }], log: ['not-needed'] };
    const result = buildSettleState(source);
    assert.equal(result.player.realm, '斗者三星');
    assert.equal(result.player.gold, 0);
    assert.equal(result.inventory.length, 100);
    assert.equal(result.inventory[99].id, 'b99');
    assert.equal(result.inventoryKnown, true);
    assert.equal(result.log, undefined);
    result.inventory[0].count = 9;
    result.techniques[0].name = '其他';
    assert.equal(source.items[0].count, 1);
    assert.equal(source.techniques[0].name, '焚诀');
    const unknown = buildSettleState({ items: 5, gold: '120', realm: {} });
    assert.equal(unknown.inventoryKnown, false);
    assert.equal(unknown.player.gold, undefined);
    assert.equal(unknown.player.hp, undefined);
    assert.equal(unknown.player.realm, '');
    assert.equal(buildSettleState({ items: [{ name: '无编号', count: 1 }] }).inventory[0].id, '');
});
test('bounded model snapshot selects late relevant entries, preserves full local state, and warns omissions', () => {
    const source = state();
    source.inventory = Array.from({ length: 500 }, (_, i) => ({ id: `b${i}`, name: `药材${i}号`, category: '药材', count: i + 1 }));
    const before = structuredClone(source);
    const context = buildSettleContextState(source, '消耗药材499号');
    assert.equal(context.inventory[0].id, 'b499');
    assert.equal(context.inventory[0].count, 500);
    assert.ok(context.warnings.some(value => value.includes('未提供')));
    assert.ok(context.itemCategories.includes('药材'));
    assert.ok(JSON.stringify(context).length <= 5000);
    assert.deepEqual(source, before);
    assert.equal(buildSettleState(source).inventory.length, 500);
    const oversized = buildSettleContextState({ inventory: Array.from({ length: 100 }, (_, i) => ({ id: 'x'.repeat(10000), name: `物品${i}`, category: 'c'.repeat(10000), count: 1 })) }, '');
    assert.ok(JSON.stringify(oversized).length <= 5000);
    assert.ok(oversized.warnings.length);
});
test('model user keeps all input through 12000 chars, refuses overflow before request', () => {
    const input = `${'甲'.repeat(11980)}最后付金币买药`;
    const result = buildSettleResultUser({ input, state: state() });
    assert.ok(result.includes(input));
    assert.ok(result.includes('最后付金币买药'));
    assert.ok(result.length <= 30000);
    assert.throws(() => buildSettleResultUser({ input: '甲'.repeat(12001) }), /12000/);
    assert.ok(buildSettleResultUser({ input: '甲'.repeat(12000) }).includes('甲'.repeat(12000)));
});
test('context includes real worldbook content and marks every non-input clipping channel', () => {
    const result = buildSettleResultUser({ input: '服回气丹', state: state(),
        floors: Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? '玩家' : '角色', text: `${i}${'对话'.repeat(300)}` })),
        worldbookLines: [{ name: '回气丹药理', content: '只能回暖气息，不能直接突破。' }, ...Array.from({ length: 20 }, (_, i) => `条目${i}${'设定'.repeat(1000)}`)],
        injections: { doupo_self: '纳戒真实金币120' + 'x'.repeat(1000) },
        customCategories: [{ id: 'craft', name: '炼器', prompt: 'x'.repeat(3000) }],
    });
    assert.ok(result.includes('只能回暖气息，不能直接突破'));
    assert.ok(result.includes('已截断'));
    assert.ok(result.includes('〈记忆〉（本轮没有注入）'));
    assert.ok(result.includes('相关有界快照'));
    assert.ok(result.length <= 30000);
    assert.ok(buildSettleResultUser({}).includes('本轮所有通道都是空的'));
});

// Parser diagnostics, limits and compatibility.
test('extract wrapped final result independently of think blocks and escaped string brackets', () => {
    const data = { version: 2, actions: [action('a1', '付十金币', { outcome: '付费后听见他说："{不是新对象}\\"。' })] };
    const result = parseSettleResult(`<think_nya>示例 {"outcome":"错误"}</think_nya>\n<game>\n\`\`\`json\n${JSON.stringify(data)}\n\`\`\`\n</game>`);
    assert.equal(result.status, 'ok');
    assert.equal(result.actions[0].outcome, data.actions[0].outcome);
    assert.equal(parseSettleResult('不是JSON').status, 'invalid');
    assert.equal(parseSettleResult('[{"outcome":"array"}]').status, 'invalid');
    assert.equal(parseSettleResult('{"version":2}').status, 'invalid');
});
test('legacy single result remains compatible but raw objects cannot inject', () => {
    const raw = { category: 'general', outcome: '支付十金币', effects: [gold(-10)], note: '旧格式' };
    const result = parseSettleResult(JSON.stringify(raw));
    assert.equal(result.version, 1);
    assert.equal(result.actions.length, 1);
    assert.equal(renderSettleInjection(result), '');
    assert.equal(renderSettleInjection(raw), '');
    const reviewed = reviewSettleEffects(result, state());
    assert.equal(reviewed.reviewed, true);
    assert.equal(reviewed.effects.length, 1);
    assert.equal(reviewed.expectedState.player.gold, 110);
    assert.ok(renderSettleInjection(reviewed).includes('金币 -10'));
    assert.equal(reviewSettleEffects(raw, state()).effects.length, 1);
});
test('malformed/foreign effects block their entire action rather than retaining outcome', () => {
    for (const effect of [gold(3, { targetId: 'npc1' }), gold('3'), gold(null), gold(3, { field: 'location' }), gold(3, { type: 'multiply' })]) {
        const result = parsed([action('a1', '买药', { outcome: '秘密成功文案', effects: [gold(-10), effect] })]);
        assert.ok(result.diagnostics.some(row => row.code === 'invalid_effect'));
        assert.equal(result.dropped, 1);
        const reviewed = reviewSettleEffects(result, state(), { input: '买药' });
        assert.equal(reviewed.effects.length, 0);
        assert.equal(reviewed.actions[0].approved, false);
        assert.ok(!reviewed.outcome.includes('秘密成功文案'));
        assert.ok(!renderSettleInjection(reviewed).includes('秘密成功文案'));
    }
});
test('actions over six and total effects over 24 block entire response with diagnostics', () => {
    for (const actions of [Array.from({ length: 7 }, (_, i) => action(`a${i}`, `付${i}金币`)), Array.from({ length: 4 }, (_, i) => action(`a${i}`, `付${i}金币`, { effects: Array.from({ length: 7 }, (_, j) => gold(j + 1)) }))]) {
        const result = parsed(actions);
        assert.equal(result.status, 'invalid');
        assert.ok(result.diagnostics.some(row => row.fatal));
        const reviewed = reviewSettleEffects(result, state(), { input: actions.map(row => row.evidence).join('') });
        assert.equal(reviewed.effects.length, 0);
        assert.equal(reviewed.status, 'blocked');
        assert.ok(reviewed.actions.every(row => !row.approved));
    }
});
test('per-action effect overflow blocks that whole action but not independent later actions', () => {
    const result = review([
        action('a1', '第一份收入', { outcome: '超量尾部成功文案', effects: Array.from({ length: 9 }, (_, i) => gold(i + 1)) }),
        action('a2', '付十金币'),
    ]);
    assert.equal(result.actions[0].approved, false);
    assert.equal(result.actions[1].approved, true);
    assert.equal(result.effects.length, 1);
    assert.equal(result.expectedState.player.gold, 110);
    assert.ok(!renderSettleInjection(result).includes('超量尾部成功文案'));
});
test('empty and invalid results cannot manufacture a successful actionable result', () => {
    assert.equal(renderSettleInjection(reviewSettleEffects(parsed([]), state(), { input: '你好' })), '');
    assert.equal(renderSettleInjection(reviewSettleEffects({ category: 'none', outcome: '纯聊天', effects: [] }, state())), '');
    assert.equal(reviewSettleEffects(parseSettleResult('bad'), state()).status, 'blocked');
    assert.ok(renderSettleInjection(reviewSettleEffects(parseSettleResult('bad'), state())).includes('[blocked]'));
});

// Ordered actions, dependencies and atomic rejection.
test('three actions consume local resources in order and expose only a small expected projection', () => {
    const input = '付十金币，服用回气丹，运功修炼';
    const original = state();
    original.profile = { name: '萧炎', appearance: 'x'.repeat(3000) };
    const before = structuredClone(original);
    const raw = parsed([
        action('pay', '付十金币'),
        action('take', '服用回气丹', { category: 'alchemy', dependsOn: ['pay'], outcome: '服下一枚回气丹，药力回暖', effects: [item(1)], consequences: ['气息渐渐平复'] }),
        action('cultivate', '运功修炼', { category: 'cultivation', dependsOn: ['take'], outcome: '运功后升至斗者四星', effects: [realm('斗者四星')] }),
    ]);
    const originalParsed = structuredClone(raw);
    const result = reviewSettleEffects(raw, original, { input });
    assert.equal(result.status, 'ok');
    assert.equal(result.actions.length, 3);
    assert.deepEqual(result.expectedState, { player: { gold: 110, realm: '斗者四星' }, inventory: [{ id: 'b1', name: '回气丹', category: '丹药', count: 1 }], comparison: { player: ['gold', 'realm'], inventory: ['b1'] } });
    assert.deepEqual(original, before);
    assert.deepEqual(raw, originalParsed);
    assert.ok(JSON.stringify(result.expectedState).length < 400);
    const rendered = renderSettleInjection(result);
    assert.ok(rendered.includes('药力回暖'));
    assert.ok(rendered.includes('物品 回气丹（丹药，ID:b1） -1'));
    assert.ok(rendered.includes('境界 → 斗者四星'));
});
test('whole-action atomicity removes accepted costs when another effect is rejected', () => {
    const result = review([action('buy', '支付十金币买药', { outcome: '秘密购买成功', consequences: ['秘密收益已到账'], effects: [gold(-10), realm('斗者四星')] })]);
    assert.equal(result.effects.length, 0);
    assert.equal(result.actions[0].approved, false);
    assert.deepEqual(result.expectedState.comparison, { player: [], inventory: [] });
    const rendered = renderSettleInjection(result);
    assert.ok(rendered.includes('blocked'));
    assert.ok(!rendered.includes('秘密购买成功'));
    assert.ok(!rendered.includes('秘密收益已到账'));
    assert.ok(!rendered.includes('金币 -10'));
});
test('gold cumulative checks stop overspend and skip dependents, but permit independent actions', () => {
    const result = review([
        action('a1', '支付一百金币', { effects: [gold(-100)], outcome: '支付一百金币' }),
        action('a2', '再付五十金币', { dependsOn: ['a1'], effects: [gold(-50)], outcome: '秘密第二次购买成功' }),
        action('a3', '服用买到的药', { category: 'alchemy', dependsOn: ['a2'], effects: [item(1)], outcome: '秘密服药成功' }),
        action('a4', '原地查看周围', { effects: [], outcome: '看见街巷行人' }),
    ]);
    assert.equal(result.actions[0].approved, true);
    assert.equal(result.actions[1].status, 'insufficient');
    assert.equal(result.actions[2].status, 'not_executed');
    assert.equal(result.actions[3].approved, true);
    assert.equal(result.expectedState.player.gold, 20);
    assert.equal(result.effects.length, 1);
    assert.ok(!renderSettleInjection(result).includes('秘密'));
});
test('failure preserves legitimate cost but blocks dependent success', () => {
    const result = review([
        action('craft', '尝试炼药', { category: 'alchemy', status: 'failure', outcome: '药液烧焦，损失十金币', effects: [gold(-10)] }),
        action('take', '服用成品', { category: 'alchemy', dependsOn: ['craft'], outcome: '秘密服成品', effects: [item(1)] }),
    ]);
    assert.equal(result.actions[0].approved, true);
    assert.equal(result.actions[0].status, 'failure');
    assert.equal(result.actions[1].approved, false);
    assert.equal(result.expectedState.player.gold, 110);
    assert.ok(!renderSettleInjection(result).includes('秘密服成品'));
    assert.equal(review([action('a1', '失败尝试', { status: 'failure', effects: [gold(10)], outcome: '没有完成' })]).effects.length, 0);
});
test('partial dependencies still need actual resources, insufficient/not_executed cannot carry effects', () => {
    const result = review([
        action('a1', '尝试卖药', { status: 'partial', outcome: '仅卖出少量药材', effects: [gold(10)] }),
        action('a2', '再付二百金币', { dependsOn: ['a1'], effects: [gold(-200)], outcome: '完成交易' }),
    ]);
    assert.equal(result.actions[0].approved, true);
    assert.equal(result.actions[1].status, 'insufficient');
    for (const status of ['insufficient', 'not_executed']) assert.equal(review([action('a1', '尝试交易', { status, outcome: '尚未执行', effects: [gold(-1)] })]).effects.length, 0);
    assert.equal(review([action('a1', '尝试交易', { status: 'not_executed', outcome: '交易成功', effects: [] })]).actions[0].approved, false);
});
test('forward/cyclic dependencies, duplicate IDs and repeated evidence are blocked', () => {
    assert.equal(review([action('a1', '先买药', { dependsOn: ['a2'] }), action('a2', '后服药', { dependsOn: ['a1'] })]).effects.length, 0);
    assert.equal(review([action('dup', '第一次付费'), action('dup', '第二次付费')]).effects.length, 0);
    const duplicate = review([action('a1'), action('a2')], '付十金币');
    assert.equal(duplicate.effects.length, 1);
    assert.equal(duplicate.actions[1].approved, false);
    const punctuation = review([action('a1', '付十金币'), action('a2', '付十金币。')], '付十金币。');
    assert.equal(punctuation.actions[1].approved, false);
});
test('v2 evidence must come from the full current input, not fabricated/history evidence', () => {
    const row = action('a1', '历史上买了药');
    assert.equal(review([row], '本轮只是你好').actions[0].approved, false);
    assert.equal(reviewSettleEffects(parsed([row]), state()).actions[0].approved, false);
    assert.equal(review([action()], '甲'.repeat(11000) + '付十金币').actions[0].approved, true);
    assert.equal(review([action('a1', '')], '付十金币').actions[0].approved, false);
});
test('effect signatures and accumulated limits prevent split-entry duplicate/large gold awards', () => {
    assert.equal(review([action('a1', '领取奖励', { effects: [gold(10), gold(10)] })]).effects.length, 0);
    assert.equal(review([action('a1', '领取奖励', { effects: [gold(600), gold(500)] })]).effects.length, 0);
    assert.equal(review([action('a1', '付费', { effects: [gold(-1, { allowNegative: false })] })]).effects.length, 0);
    assert.equal(review([action('a1', '设钱', { effects: [gold(100, { type: 'set' })] })]).effects.length, 0);
    assert.equal(review([action('a1', '收零点五金币', { effects: [gold(0.5)] })]).effects.length, 0);
});

// Actual item IDs/categories, no synthetic assets.
test('item consumption uses real IDs and sequential remaining stock', () => {
    const result = review([
        action('a1', '先吃一枚回气丹', { category: 'alchemy', outcome: '药力回暖', effects: [item(1)] }),
        action('a2', '再吃两枚回气丹', { category: 'alchemy', dependsOn: ['a1'], outcome: '秘密第二次回暖', effects: [item(2)] }),
    ]);
    assert.equal(result.actions[0].approved, true);
    assert.equal(result.actions[1].status, 'insufficient');
    assert.equal(result.expectedState.inventory[0].count, 1);
    assert.ok(!renderSettleInjection(result).includes('秘密第二次回暖'));
});
test('item consumption fails closed for unknown, mismatched and ambiguous IDs/categories', () => {
    for (const effect of [item(1, { itemId: 'invented' }), item(1, { name: '其他丹' }), item(1, { category: '功法' }), item(1, { itemId: '' }), item(0), item(-1), item(0.5)]) assert.equal(review([action('a1', '服药', { category: 'alchemy', outcome: '药力回暖', effects: [effect] })]).actions[0].approved, false);
    const duplicate = state(); duplicate.inventory.push({ ...duplicate.inventory[0] });
    assert.equal(review([action('a1', '服药', { category: 'alchemy', effects: [item(1)] })], '服药', duplicate).effects.length, 0);
});
test('item set/add and zero-count projection remain exact without inventing inventory records', () => {
    const result = review([
        action('a1', '补充回气丹', { effects: [item(2, { type: 'add' })], outcome: '补充回气丹' }),
        action('a2', '清空回气丹', { category: 'alchemy', effects: [item(0, { type: 'set', allowNegative: true })], outcome: '耗尽回气丹' }),
    ]);
    assert.equal(result.effects.length, 2);
    assert.equal(result.expectedState.inventory[0].count, 0);
    assert.equal(result.expectedState.inventory[0].name, '回气丹');
    assert.equal(compareSettleState(result.expectedState, { ...state(), inventory: [state().inventory[1]] }).status, 'matched');
});
test('no-ID acquisition maps only a unique existing identity; genuinely new items stay narrative', () => {
    const result = review([action('a1', '购入回气丹', { outcome: '买到回气丹', effects: [item({ name: '回气丹', category: '丹药', count: 1 }, { itemId: '', name: '', category: '', type: 'add' })] })]);
    assert.equal(result.effects[0].itemId, 'b1');
    assert.equal(result.expectedState.inventory[0].count, 3);
    const fresh = review([action('a1', '付十金币买凝气丸', { outcome: '买到凝气丸', effects: [gold(-10), item({ name: '凝气丸', category: '丹药', count: 1 }, { type: 'add', itemId: '', name: '', category: '' })] })]);
    assert.equal(fresh.actions[0].approved, true);
    assert.equal(fresh.effects.length, 1);
    assert.equal(fresh.expectedState.player.gold, 110);
    assert.deepEqual(fresh.expectedState.inventory, []);
    assert.ok(fresh.actions[0].consequences.some(value => value.includes('仅作文字后果')));
    assert.ok(!JSON.stringify(fresh).includes('new-item-'));
    const invented = review([action('a1', '买药', { outcome: '买到凝气丸', effects: [item(1, { type: 'add', itemId: '', name: '凝气丸' })] })]);
    assert.equal(invented.actions[0].approved, false);
});
test('unknown inventory and malformed records never imply available stock', () => {
    const rows = [action('a1', '服药', { category: 'alchemy', effects: [item(1)], outcome: '药力回暖' })];
    assert.equal(review(rows, '服药', { player: { gold: 120 } }).effects.length, 0);
    assert.equal(review(rows, '服药', { ...state(), inventory: [{ id: 'b1', name: '回气丹', category: '丹药' }] }).effects.length, 0);
});

// Category permissions, unknown statistics and realm invariants.
test('without actual hp/douqi/reputation no precise effects or numeric prose survive', () => {
    for (const field of ['hp', 'douqi', 'reputation']) {
        const result = review([action('a1', '战斗', { category: 'combat', outcome: '秘密胜出', effects: [{ targetId: 'player', field, type: 'add', value: -10, allowNegative: true, reason: '交手' }] })]);
        assert.equal(result.effects.length, 0);
        assert.ok(!renderSettleInjection(result).includes('秘密胜出'));
    }
    for (const outcome of ['生命恢复20点', '斗气 +25', '声望增长50', '生命恢复三成']) assert.equal(review([action('a1', '服药', { category: 'alchemy', outcome, effects: [] })]).actions[0].approved, false, outcome);
    const narrative = review([action('a1', '服药', { category: 'alchemy', outcome: '药力回暖，气息逐渐平复', effects: [item(1)], consequences: ['伤势有所缓解，不代表数值已恢复'] })]);
    assert.equal(narrative.actions[0].approved, true);
});
test('provided actual statistics still obey reused core limits and negative direction', () => {
    const snapshot = { ...state(), player: { ...state().player, hp: 300, douqi: 80, reputation: 0 } };
    const combatEffect = (field, value) => ({ targetId: 'player', field, type: 'add', value, allowNegative: value < 0, reason: '实际交手' });
    assert.equal(review([action('a1', '交手', { category: 'combat', outcome: '受伤倒退', effects: [combatEffect('hp', -120)] })], '交手', snapshot).effects.length, 1);
    assert.equal(review([action('a1', '交手', { category: 'combat', outcome: '气息恢复', effects: [combatEffect('hp', 50)] })], '交手', snapshot).effects.length, 0);
    assert.equal(review([action('a1', '交手', { category: 'combat', outcome: '发动斗技', effects: [combatEffect('douqi', -201)] })], '交手', snapshot).effects.length, 0);
    assert.equal(checkEffects('alchemy', [combatEffect('douqi', 300)], snapshot).effects.length, 1);
    assert.equal(checkEffects('alchemy', [combatEffect('douqi', 301)], snapshot).effects.length, 0);
});
test('realm changes require legal category/canonical current realm and reject jump or invented default', () => {
    for (const category of ['alchemy', 'combat', 'general']) assert.equal(review([action('a1', '运功', { category, effects: [realm('斗者四星')], outcome: '秘密突破' })]).effects.length, 0);
    for (const target of ['斗王二星', '斗者七星', '斗者二星', '任意斗者四星废话']) assert.equal(review([action('a1', '运功', { category: 'cultivation', effects: [realm(target)], outcome: '秘密突破' })]).effects.length, 0);
    assert.equal(review([action('a1', '运功', { category: 'cultivation', effects: [realm('斗者四星')], outcome: '秘密突破' })], '运功', { inventory: [] }).effects.length, 0);
    assert.equal(review([action('a1', '运功', { category: 'cultivation', effects: [realm('斗者六星')], outcome: '升至斗者六星' })]).effects.length, 1);
});
test('realm cumulative limits cannot be bypassed by multiple actions', () => {
    const result = review([
        action('a1', '先运功', { category: 'cultivation', effects: [realm('斗者六星')], outcome: '升至斗者六星' }),
        action('a2', '再冲关', { category: 'cultivation', dependsOn: ['a1'], effects: [realm('斗者九星')], outcome: '秘密跳级成功' }),
    ]);
    assert.equal(result.effects.length, 1);
    assert.equal(result.actions[1].approved, false);
    assert.equal(result.expectedState.player.realm, '斗者六星');
});
test('big realm breakthrough is only from nine stars to next first star for the whole turn', () => {
    const snapshot = { ...state(), player: { ...state().player, realm: '斗者九星' } };
    const result = review([
        action('a1', '先突破', { category: 'cultivation', effects: [realm('斗师一星')], outcome: '突破至斗师一星' }),
        action('a2', '再升星', { category: 'cultivation', dependsOn: ['a1'], effects: [realm('斗师三星')], outcome: '秘密再升星' }),
    ], '先突破再升星', snapshot);
    assert.equal(result.effects.length, 1);
    assert.equal(result.actions[1].approved, false);
    assert.equal(review([action('a1', '突破', { category: 'cultivation', effects: [realm('斗师九星')], outcome: '秘密突破' })], '突破', snapshot).effects.length, 0);
});
test('custom categories are narrative-only unless config explicitly grants a built-in rule category', () => {
    const categories = [{ id: 'craft', name: '炼器判定', prompt: '允许任意realm' }];
    assert.equal(review([action('a1', '炼器', { category: 'craft', effects: [], outcome: '开始锻打器胚' })], '炼器', state(), { customCategories: categories }).actions[0].approved, true);
    assert.equal(review([action('a1', '炼器', { category: 'craft', ruleCategory: 'cultivation', effects: [realm('斗者四星')], outcome: '秘密突破' })], '炼器', state(), { customCategories: categories }).effects.length, 0);
    assert.equal(review([action('a1', '炼器', { category: 'unconfigured', effects: [gold(20)], outcome: '秘密奖励' })]).effects.length, 0);
    const mapped = review([action('a1', '特殊修炼', { category: 'special', effects: [realm('斗者四星')], outcome: '升至斗者四星' })], '特殊修炼', state(), { customCategories: [{ id: 'special', ruleCategory: 'cultivation' }] });
    assert.equal(mapped.effects.length, 1);
});

// Post-generation comparison: no mutation, no automatic bookkeeping.
test('comparison distinguishes no-op, pending, matching and mismatching fields', () => {
    const result = review([action()]);
    assert.equal(compareSettleState(result.expectedState, null).status, 'pending');
    assert.equal(compareSettleState({ player: {}, inventory: [], comparison: { player: [], inventory: [] } }, state()).status, 'not_applicable');
    assert.equal(compareSettleState(null, state()).status, 'not_applicable');
    assert.equal(compareSettleState(result.expectedState, { ...state(), player: { realm: '斗王九星', gold: 110 } }).status, 'matched', 'unrelated changes are not compared');
    const actual = state(); const before = structuredClone(actual);
    const mismatch = compareSettleState(result.expectedState, actual);
    assert.equal(mismatch.status, 'mismatch');
    assert.deepEqual(mismatch.differences, [{ field: 'player.gold', expected: 110, actual: 120 }]);
    assert.deepEqual(actual, before);
});
test('comparison remaps only unique same name/category after runtime rebuilds IDs', () => {
    const result = review([action('a1', '服药', { category: 'alchemy', outcome: '药力回暖', effects: [item(1)] })]);
    const actual = { items: [{ id: 'rebuilt-1', name: '回气丹', category: '丹药', count: 1 }], gold: 120, realm: { realm: '斗者', stage: '三星' } };
    assert.equal(compareSettleState(result.expectedState, actual).status, 'matched');
    assert.equal(compareSettleState(result.expectedState, { ...actual, items: [...actual.items, { ...actual.items[0], id: 'rebuilt-2' }] }).status, 'mismatch');
    assert.equal(compareSettleState(result.expectedState, { ...actual, items: [{ ...actual.items[0], category: '毒物' }] }).status, 'mismatch');
    assert.equal(compareSettleState(result.expectedState, { player: { gold: 120 } }).status, 'mismatch');
});
test('same name/category expected rows cannot both map to a single rebuilt stack', () => {
    const source = state(); source.inventory.push({ id: 'b3', name: '回气丹', category: '丹药', count: 3 });
    const result = review([action('a1', '使用两堆药', { category: 'alchemy', outcome: '药力回暖', effects: [item(1), item(1, { itemId: 'b3' })] })], '使用两堆药', source);
    const comparison = compareSettleState(result.expectedState, { inventory: [{ id: 'new', name: '回气丹', category: '丹药', count: 3 }] });
    assert.equal(comparison.status, 'mismatch');
    assert.ok(comparison.differences.every(row => row.actual === null));
});
test('renderer rejects raw even with approved-looking actions; bounded rendering never silently omits successes', () => {
    assert.equal(renderSettleInjection({ actions: [{ ...action(), approved: true }] }), '');
    const result = review(Array.from({ length: 6 }, (_, index) => action(`a${index}`, `观察${index}`, { effects: [], outcome: `${index}${'安全叙事'.repeat(80)}` })));
    const small = renderSettleInjection(result, { maxChars: 300 });
    assert.ok(small.includes('审核预算保护'));
    assert.ok(small.length <= 300);
    const normal = renderSettleInjection(result);
    assert.ok(normal.length <= 6000);
    assert.ok(normal.includes('[success]'));
});

test('context preserves bounded abilities/NPCs and original omission warnings on repeated projection', () => {
    const source = state();
    source.inventory = Array.from({ length: 100 }, (_, i) => ({ id: `b${i}`, name: `药材${i}号`, category: '药材', count: 1 }));
    source.profile = { name: '萧炎', affiliation: '萧家', appearance: 'x'.repeat(10000) };
    for (const field of ['skills', 'techniques', 'equipment']) source[field] = [{ id: `${field}-1`, name: '吸掌', grade: '玄阶', note: 'x'.repeat(10000) }];
    source.npcs = Array.from({ length: 8 }, (_, i) => ({ name: `人物${i}`, realm: '斗者三星', injury: '轻伤', presence: '在场', privateData: 'not-for-context' }));
    source.npcNote = '人物身体状态按文字理解';
    const first = buildSettleContextState(source, '药材99号和吸掌');
    const second = buildSettleContextState(first, '药材99号和吸掌');
    for (const result of [first, second]) {
        assert.equal(result.inventoryTotal, 100);
        assert.equal(result.inventory[0].id, 'b99');
        assert.equal(result.profile.name, '萧炎');
        assert.equal(result.profile.appearance, undefined);
        assert.equal(result.npcs.length, 6);
        assert.equal(result.npcs[0].privateData, undefined);
        assert.equal(result.npcNote, source.npcNote);
        assert.equal(result.skills[0].name, '吸掌');
        assert.equal(result.equipment[0].name, '吸掌');
        assert.equal(result.techniques[0].name, '吸掌');
        assert.ok(result.warnings.some(value => value.includes('99 条未提供')));
        assert.ok(JSON.stringify(result).length <= 5000);
    }
    const user = buildSettleResultUser({ input: '药材99号和吸掌', state: first });
    assert.ok(user.includes('人物0'));
    assert.ok(user.includes('人物身体状态按文字理解'));
    assert.ok(user.includes('"inventoryTotal":100'));
});
test('all context branches remain bounded with hostile oversized metadata', () => {
    const source = state();
    source.warnings = Array.from({ length: 100 }, (_, i) => `warn${i}${'x'.repeat(3000)}`);
    source.itemCategories = Array.from({ length: 100 }, (_, i) => `cat${i}${'x'.repeat(1000)}`);
    source.skills = Array.from({ length: 100 }, () => ({ id: 'x'.repeat(1000), name: 'y'.repeat(1000), grade: 'z'.repeat(1000), type: 'a'.repeat(1000), progress: 'b'.repeat(1000) }));
    source.npcs = Array.from({ length: 100 }, () => Object.fromEntries(['name', 'realm', 'location', 'injury', 'qi', 'douqi', 'presence'].map(key => [key, 'x'.repeat(5000)])));
    assert.ok(JSON.stringify(buildSettleContextState(source, '')).length <= 5000);
});
test('explicit precision in reverse word order and split actual-stat effects cannot bypass review', () => {
    for (const outcome of ['恢复20点生命', '恢复20斗气', '增加50声望', '生命恢复二十']) assert.equal(review([action('a1', '服药', { outcome, effects: [] })]).actions[0].approved, false, outcome);
    const snapshot = { ...state(), player: { ...state().player, hp: 100 } };
    const effects = [150, 151].map(value => ({ targetId: 'player', field: 'hp', type: 'add', value, reason: '药力' }));
    assert.equal(review([action('a1', '服药', { category: 'alchemy', outcome: '气息回暖', effects })], '服药', snapshot).actions[0].approved, false);
});
test('explicit realm success or precise money prose cannot omit or contradict effects', () => {
    for (const outcome of ['突破到斗王二星', '晋升为斗王二星', '升至斗王二星']) {
        assert.equal(review([action('a1', '运功', { category: 'cultivation', outcome, effects: [] })]).actions[0].approved, false);
        assert.equal(review([action('a1', '运功', { category: 'cultivation', outcome, effects: [realm('斗者四星')] })]).actions[0].approved, false);
    }
    for (const outcome of ['支付50金币', '花费一百枚金币', '获得50金币']) assert.equal(review([action('a1', '交易', { outcome, effects: [] })]).actions[0].approved, false, outcome);
    assert.equal(review([action('a1', '付费', { outcome: '支付50金币', effects: [gold(-10)] })]).actions[0].approved, false);
    assert.equal(review([action('a1', '付费', { outcome: '支付50金币', effects: [gold(-50)] })]).actions[0].approved, true);
    assert.equal(review([action('a1', '运功', { category: 'cultivation', status: 'failure', outcome: '未能突破到斗王二星', effects: [] })]).actions[0].approved, true);
});
test('renderer identifies blocked actions by original ID and original index without raw success text', () => {
    const result = review([
        action('none', '你好', { category: 'none', status: 'not_executed', outcome: '纯聊天', effects: [] }),
        action('blocked-id', '运功', { category: 'general', outcome: '秘密成功文案', effects: [realm('斗者四星')] }),
    ]);
    const rendered = renderSettleInjection(result);
    assert.ok(rendered.includes('2. [blocked-id]'));
    assert.ok(rendered.includes('第2项输入中的尝试/意图'));
    assert.ok(!rendered.includes('秘密成功文案'));
});
test('conflicting nested item identities and projected hidden duplicate names cannot map loosely', () => {
    const conflict = item({ name: '其他丹', category: '丹药', count: 1 }, { type: 'add' });
    assert.equal(review([action('a1', '购入回气丹', { effects: [conflict] })]).effects.length, 0);
    const source = state(); source.inventory.push({ id: 'hidden-other', name: '回气丹', category: '丹药', count: 1 });
    const result = review([action('a1', '服药', { category: 'alchemy', outcome: '药力回暖', effects: [item(1)] })], '服药', source);
    assert.equal(result.expectedState.inventory.length, 1);
    assert.equal(result.expectedState.inventory[0].identityAmbiguous, true);
    const actual = { inventory: [{ id: 'rebuilt', name: '回气丹', category: '丹药', count: 1 }] };
    assert.equal(compareSettleState(result.expectedState, actual).status, 'mismatch');
});

test('reversed evidence cannot fund an earlier expense from a later income', () => {
    const source = state(); source.player.gold = 0;
    const result = review([
        action('a2', '领取一百金币', { outcome: '领款完成', effects: [gold(100)] }),
        action('a1', '支付一百金币', { outcome: '付款完成', effects: [gold(-100)] }),
    ], '先支付一百金币，再领取一百金币', source);
    assert.equal(result.effects.length, 0);
    assert.ok(result.actions.every(entry => !entry.approved));
    assert.ok(result.rejected.every(entry => entry.reason.includes('顺序')));
});
test('depleted inventory keeps its identity for a later return in the same round', () => {
    const source = state(); source.inventory[0].count = 1;
    const result = review([
        action('a1', '交出回气丹', { outcome: '丹药交给掌柜', effects: [item(1)] }),
        action('a2', '取回回气丹', { dependsOn: ['a1'], outcome: '掌柜把原药退还', effects: [item(1, { type: 'add' })] }),
    ], '交出回气丹，然后取回回气丹', source);
    assert.ok(result.actions.every(entry => entry.approved));
    assert.equal(result.expectedState.inventory[0].id, 'b1');
    assert.equal(result.expectedState.inventory[0].count, 1);
    assert.equal(compareSettleState(result.expectedState, source).status, 'matched');
});

test('live model wording 交付金币 cannot hide spending in narrative-only effects', () => {
    const source = state(); source.player.gold = 0;
    const result = review([action('a1', '交五十枚金币押金', { outcome: '交付五十枚金币作为押金，挂拍成功', effects: [] })], '交五十枚金币押金', source);
    assert.equal(result.actions[0].approved, false);
    assert.ok(!renderSettleInjection(result).includes('挂拍成功'));
});

test('tavern trailing variable patches cannot replace the adjudication object', () => {
    const result = parseSettleResult(`<game>${JSON.stringify({ version: 2, actions: [action('a1', '打听', { outcome: '问到了开场时间', effects: [] })] })}</game>\n<UpdateVariable>{"op":"replace","path":"/目标","value":"等待开场"}</UpdateVariable>`);
    assert.equal(result.version, 2);
    assert.equal(result.actions[0].outcome, '问到了开场时间');
});

console.log(`settle adjudicate tests passed (${cases} cases)`);
