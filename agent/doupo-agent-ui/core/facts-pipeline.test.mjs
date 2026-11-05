import assert from 'node:assert/strict';
import { createFactsIndex } from '../narrative/facts-index.js';
import { createFactsSelector } from '../narrative/facts-select.js';
import { createSettingSupply } from '../narrative/setting-supply.js';
import { createTurnStages } from './turn-stages.js';

// OPT-026/087: exercise the real assembly parser on both injection paths.
for (const fallbackPath of [false, true]) {
    const fixture = createSettingSupply({ countTokens: value => String(value).length });
    fixture.register([{ id: 'volume-fixture', name: '卷段夹具', keys: ['卷段夹具'], phase: 1,
        content: '〔卷01〕\n当前段内容。\n〔卷04 增补〕\n未来段夹具不可注入。' }]);
    const updates = [];
    const actualStages = createTurnStages({ runner: {}, actions: {}, world: {}, compose: async () => ({}), getState: () => ({}),
        settings: fixture, catalogIndex: { stats: () => ({ total: 1 }), guessVolume: () => 4 },
        catalogSelector: { select: async () => { if (fallbackPath) throw new Error('fixture fallback'); return { ids: ['volume-fixture'], inferredVolume: 4 }; } },
        select: async () => ({ needs: [{ id: 'volume-fixture', layer: 'full' }] }),
        getProgress: () => ({ volume: 1, source: 'manual' }), onVolumeInferred: (...args) => updates.push(args),
        getSettingBudget: () => ({ injectionBudget: 2000, maxItems: 8 }),
    });
    const checked = await actualStages.resolveInjection({ input: '卷段夹具' });
    assert.ok(checked.text.includes('当前段内容'), 'actual current-volume fixture remains');
    assert.ok(!checked.text.includes('未来段夹具'), 'future fixture segment is trimmed by a scalar boundary');
    assert.equal(checked.volume.next, 1, 'manual progress remains locked');
    assert.equal(checked.volume.source, 'manual');
    assert.deepEqual(updates, [], 'manual progress never writes automatic suggestions');
}

const BOOK = {
    entries: {
        1041: { uid: 1041, comment: '青莲地心火（物品-青莲地心火）', content: '【物品：青莲地心火】异火榜第十九。', key: ['青莲地心火'] },
        217: { uid: 217, comment: '药尘（药老）（人物-药尘（药老））', content: '【人物：药尘】萧炎戒指里的灵魂体。', key: ['药老', '药尘'] },
    },
};

const index = createFactsIndex({ volumeIndex: { 1041: [2], 217: [1] } });
index.load(BOOK);

const supply = createSettingSupply({ countTokens: text => String(text).length });
supply.register([
    { id: '1041', name: '青莲地心火', content: '【物品：青莲地心火】异火榜第十九。', keys: ['青莲地心火'], phase: 2 },
    { id: '217', name: '药尘', content: '【人物：药尘】萧炎戒指里的灵魂体。', keys: ['药老', '药尘'], phase: 1 },
]);

const asked = [];
const selector = createFactsSelector({
    index,
    complete: async ({ user }) => {
        asked.push(user);
        return JSON.stringify({ need: [{ uid: 1041, why: '玩家问了这团火' }], no_match: false });
    },
});

const stages = createTurnStages({
    runner: { execute: async () => ({ status: 'ok', entries: [] }) },
    actions: {},
    world: {},
    compose: async () => ({ text: '', claims: [] }),
    getState: () => ({}),
    settings: supply,
    catalogIndex: index,
    catalogSelector: selector,
    getSettingBudget: () => ({ maxCandidates: 40, maxItems: 8, injectionBudget: 1200 }),
    getProgress: () => 2,
    getRecentTexts: () => ['那团火到底是什么来路？'],
});

const resolved = await stages.resolveInjection({ input: '药老，这青莲地心火我能炼化吗' });

assert.equal(resolved.status, 'supported', '目录选条应成功注入');
assert.deepEqual(resolved.usedIds, ['1041'], '只注入模型点名的条目，脚本不补选');
assert.ok(resolved.text.includes('异火榜第十九'), '注入内容来自世界书条目正文');
assert.ok(!resolved.text.includes('很后面的剧情'), '不相关的条目不能混进来');
assert.equal(asked.length, 1, '每轮只问模型一次');
assert.ok(asked[0].includes('1041|物品|青莲地心火'), '目录里要带 uid 与类别，模型才能点名');
assert.ok(resolved.note.includes('目录'), '结果要能说清走了目录路径');

// 模型点名了不存在的 uid：丢弃，不猜。
const bad = createFactsSelector({ index, complete: async () => JSON.stringify({ need: [{ uid: 9999, why: '错号' }], no_match: false }) });
const badStages = createTurnStages({
    runner: { execute: async () => ({ status: 'ok', entries: [] }) },
    actions: {},
    world: {},
    compose: async () => ({ text: '', claims: [] }),
    getState: () => ({}),
    settings: supply,
    catalogIndex: index,
    catalogSelector: bad,
    getSettingBudget: () => ({ maxCandidates: 40, maxItems: 8, injectionBudget: 1200 }),
    getProgress: () => 2,
});
const badResolved = await badStages.resolveInjection({ input: '随便问问' });
assert.equal(badResolved.status, 'not_found', '越界 uid 不能被当成有效结果');
assert.equal(badResolved.text, '', '越界 uid 不生成注入文本');

// 目录选条抛错：退回关键字召回，本轮不中断。
const broken = createFactsSelector({ index, complete: async () => { throw new Error('超时'); } });
const fallbackStages = createTurnStages({
    runner: { execute: async () => ({ status: 'ok', entries: [] }) },
    actions: {},
    world: {},
    compose: async () => ({ text: '', claims: [] }),
    getState: () => ({}),
    settings: supply,
    catalogIndex: index,
    catalogSelector: broken,
    getSettingBudget: () => ({ maxCandidates: 40, maxItems: 8, injectionBudget: 1200 }),
    getProgress: () => 2,
});
const fallback = await fallbackStages.resolveInjection({ input: '药老这青莲地心火我能炼化吗' });
assert.ok(['supported', 'not_found'].includes(fallback.status), '选条失败要退回召回而不是直接失败');

// 卷号推进：模型给 4、当前手动 2，一次最多只前进到 3；越界不倒退。
const progressBook = {
    entries: {
        5: { uid: 5, comment: '药老苏醒（故事线-001）', content: '【原著故事线·001：药老苏醒】萧炎在戒指里第一次听见药老的声音。', key: ['药老苏醒'] },
    },
};
const progressIndex = createFactsIndex({ volumeIndex: { 5: [3] } });
progressIndex.load(progressBook);
const progressSupply = createSettingSupply({ countTokens: text => String(text).length });
progressSupply.register([{ id: '5', name: '药老苏醒', content: progressBook.entries[5].content, keys: ['药老苏醒'], phase: 3 }]);
const inferred = [];
const volumeSelector = createFactsSelector({ index: progressIndex, complete: async () => JSON.stringify({ need: [], no_match: true, volume: 4 }) });
const volumeStages = createTurnStages({
    runner: { execute: async () => ({ status: 'ok', entries: [] }) },
    actions: {},
    world: {},
    compose: async () => ({ text: '', claims: [] }),
    getState: () => ({}),
    settings: progressSupply,
    catalogIndex: progressIndex,
    catalogSelector: volumeSelector,
    getSettingBudget: () => ({ maxCandidates: 40, maxItems: 8, injectionBudget: 1200 }),
    getProgress: () => 2,
    onVolumeInferred: (volume, source) => inferred.push([volume, source]),
});
const advanced = await volumeStages.resolveInjection({ input: '药老，你还在吗' });
assert.equal(advanced.volume.source, 'auto', '模型建议的卷号要走自动推进');
assert.equal(advanced.volume.next, 3, '一次最多前进一卷，模型给 4 也要压到 3');
assert.deepEqual(inferred, [[3, 'auto']], '推进后的卷号要能写回设置');

// 只靠故事线标题命中也能推进：输入里出现 4 字以上的故事线标题。
const guessed = [];
const guessStages = createTurnStages({
    runner: { execute: async () => ({ status: 'ok', entries: [] }) },
    actions: {},
    world: {},
    compose: async () => ({ text: '', claims: [] }),
    getState: () => ({}),
    settings: progressSupply,
    catalogIndex: progressIndex,
    catalogSelector: volumeSelector,
    getSettingBudget: () => ({ maxCandidates: 40, maxItems: 8, injectionBudget: 1200 }),
    getProgress: () => 2,
    onVolumeInferred: (volume, source) => guessed.push([volume, source]),
});
const fromText = await guessStages.resolveInjection({ input: '刚才药老苏醒那一段，他说了什么' });
assert.equal(fromText.volume.next, 3, '标题命中同样推进一卷');
assert.deepEqual(guessed, [[3, 'auto']], '标题命中也要写回自动值');
assert.equal(progressIndex.guessVolume('随便聊聊萧炎'), null, '正文里没有故事线标题时不能瞎推');

// 人物簿过滤：人物簿已建档的人物条目不再注入，故事线/物品等其它类别照常。
// 模拟上层判定：档案记的是「药尘」，条目名带括号别名（药尘（药老））也要能拆开对上。
const profiledPredicate = entry => {
    if (entry?.category !== '人物') return false;
    const candidates = [entry?.name, String(entry?.name ?? '').replace(/[（(][^（()）]*[)）]/gu, '').trim()].filter(Boolean);
    return candidates.includes('药尘');
};
// 两条目同卷，避免「other_volume」白名单先拦，保证点名能走到人物簿过滤这一层。
const gateIndex = createFactsIndex({ volumeIndex: { 1041: [2], 217: [2] } });
gateIndex.load(BOOK);
const gateSelector = createFactsSelector({
    index: gateIndex,
    complete: async () => JSON.stringify({ need: [{ uid: 1041, why: '玩家问火' }, { uid: 217, why: '药老也在场' }], no_match: false }),
});
const gateStages = createTurnStages({
    runner: { execute: async () => ({ status: 'ok', entries: [] }) },
    actions: {},
    world: {},
    compose: async () => ({ text: '', claims: [] }),
    getState: () => ({}),
    settings: supply,
    catalogIndex: gateIndex,
    catalogSelector: gateSelector,
    skipProfiledEntry: profiledPredicate,
    getSettingBudget: () => ({ maxCandidates: 40, maxItems: 8, injectionBudget: 1200 }),
    getProgress: () => 2,
});
const gated = await gateStages.resolveInjection({ input: '药老，这青莲地心火我能炼化吗' });
assert.deepEqual(gated.usedIds, ['1041'], '已建档人物条目要从注入里摘掉，物品条目保留');
assert.ok(gated.text.includes('异火榜第十九'), '没建档的条目照常注入');
assert.ok(!gated.text.includes('戒指里的灵魂体'), '已建档人物条目的正文不能混进提示词');
assert.ok(gated.note.includes('药尘'), '状态行要写明跳过了谁');
assert.ok(gated.note.includes('不注入'), '跳过原因要说清是人物簿过滤');

// 点名的全部是已建档人物：本轮不注入，原因写人物簿过滤，而不是误报预算放不下。
const gateAllSelector = createFactsSelector({ index: gateIndex, complete: async () => JSON.stringify({ need: [{ uid: 217, why: '药老' }], no_match: false }) });
const gateAllStages = createTurnStages({
    runner: { execute: async () => ({ status: 'ok', entries: [] }) },
    actions: {},
    world: {},
    compose: async () => ({ text: '', claims: [] }),
    getState: () => ({}),
    settings: supply,
    catalogIndex: gateIndex,
    catalogSelector: gateAllSelector,
    skipProfiledEntry: profiledPredicate,
    getSettingBudget: () => ({ maxCandidates: 40, maxItems: 8, injectionBudget: 1200 }),
    getProgress: () => 2,
});
const gatedAll = await gateAllStages.resolveInjection({ input: '药老在戒指里说话了' });
assert.equal(gatedAll.status, 'not_found', '全被人物簿过滤时本轮不注入');
assert.equal(gatedAll.text, '', '全被过滤时不能带出注入文本');
assert.ok(gatedAll.note.includes('药尘'), '全被过滤时也要点名是哪位');

// 没接 skipProfiledEntry 的实例行为不变：同样点 217 时照旧注入（对照前面 resolved 用例）。
const unGatedSelector = createFactsSelector({ index: gateIndex, complete: async () => JSON.stringify({ need: [{ uid: 217, why: '药老' }], no_match: false }) });
const unGatedStages = createTurnStages({
    runner: { execute: async () => ({ status: 'ok', entries: [] }) },
    actions: {},
    world: {},
    compose: async () => ({ text: '', claims: [] }),
    getState: () => ({}),
    settings: supply,
    catalogIndex: gateIndex,
    catalogSelector: unGatedSelector,
    getSettingBudget: () => ({ maxCandidates: 40, maxItems: 8, injectionBudget: 1200 }),
    getProgress: () => 2,
});
const unGated = await unGatedStages.resolveInjection({ input: '药老在戒指里说话了' });
assert.deepEqual(unGated.usedIds, ['217'], '没接人物簿过滤时行为照旧');

console.log('facts-pipeline.test.mjs 通过');
