import assert from 'node:assert/strict';
import { createFactsIndex } from '../narrative/facts-index.js';
import { createFactsSelector } from '../narrative/facts-select.js';
import { createSettingSupply } from '../narrative/setting-supply.js';
import { createTurnStages } from './turn-stages.js';

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

console.log('facts-pipeline.test.mjs 通过');
