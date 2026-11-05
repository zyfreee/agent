import assert from 'node:assert/strict';
import test from 'node:test';
import { createSettingSupply, trimToVolume } from './setting-supply.js';

assert.equal(trimToVolume('当前内容\n〔卷04 增补〕\n未来内容', 1), '当前内容');
assert.equal(trimToVolume('当前内容\n〔卷04 增补〕\n未来内容', 4), '当前内容\n〔卷04 增补〕\n未来内容');
import { createTurnStages } from '../core/turn-stages.js';
import { createLlmClient, buildSettingSelectPrompt } from '../host/llm-client.js';

const supply = createSettingSupply();
const registered = supply.register([
    { id: 'set-qinglian', comment: '异火·青莲地心火（物品-青莲地心火）', content: '异火榜第十九，生于塔戈尔大沙漠地底岩浆。', summary: '异火榜第十九，藏于地底岩浆。', phase: 100 },
    { id: 'set-bone', comment: '骨灵冷火（物品-骨灵冷火）', content: '药老随身携带的异火。', phase: 80 },
    { id: 'set-late', comment: '净莲妖火（物品-净莲妖火）', content: '后期才出现的异火。', phase: 900 },
    { id: 'set-empty', content: '   ' },
]);
assert.equal(registered.added, 3);
assert.equal(registered.skipped, 1);
assert.equal(supply.size(), 3);

// 名称从注释头部取，phase 保留
const listed = supply.list().find(item => item.id === 'set-qinglian');
assert.equal(listed.name, '异火·青莲地心火');
assert.equal(listed.phase, 100);

// 同 id 重复登记按覆盖处理，总数不变
assert.equal(supply.register({ id: 'set-qinglian', comment: '异火·青莲地心火（物品-青莲地心火）', content: '异火榜第十九，生于塔戈尔大沙漠地底岩浆。', summary: '异火榜第十九，藏于地底岩浆。', phase: 100 }).total, 3);

// 精准召回：完整写法
const exact = supply.recall({ input: '青莲地心火到底在哪' });
assert.equal(exact.candidates[0].id, 'set-qinglian');
assert.ok(exact.candidates[0].matchedBy.includes('青莲地心火'), '整名要精确命中');

// 容忍错字：地心炎 vs 地心火
const typo = supply.recall({ input: '青莲地心炎在哪' });
assert.ok(typo.candidates.some(item => item.id === 'set-qinglian'), '错一个字仍要召回');

// 同义与缩写：只写“青莲”也要能进候选
const short = supply.recall({ input: '把青莲拿出来看看' });
assert.ok(short.candidates.some(item => item.id === 'set-qinglian'));

// 无关输入不召回
assert.equal(supply.recall({ input: '你好' }).candidates.length, 0);

// 剧情进度过滤：asOf 100 时 900 卷的条目不召回
const scoped = supply.recall({ input: '净莲妖火 青莲地心火', asOf: 100 });
assert.ok(!scoped.candidates.some(item => item.id === 'set-late'));
assert.ok(scoped.candidates.some(item => item.id === 'set-qinglian'));

// 组装：预算不够时逐级降 layer，放不下就记录被丢的 id
const tight = supply.assemble([{ id: 'set-qinglian', layer: 'full' }], { budget: 16 });
assert.equal(tight.layers[0].layer, 'mention');
assert.match(tight.text, /^\[set-qinglian\] 异火·青莲地心火$/);
const roomy = supply.assemble([{ id: 'set-qinglian', layer: 'full' }], { budget: 400 });
assert.equal(roomy.layers[0].layer, 'full');
assert.match(roomy.text, /生于塔戈尔大沙漠地底岩浆/);
const overBudget = supply.assemble([{ id: 'set-qinglian', layer: 'full' }, { id: 'set-bone', layer: 'full' }], { budget: 1 });
assert.deepEqual(overBudget.usedIds, []);
assert.deepEqual(overBudget.droppedIds, ['set-qinglian', 'set-bone']);

// 生成后对账：正文提到没注入的条目算漂移
const drift = supply.audit('药老抬手，骨灵冷火浮在掌心。', ['set-qinglian'], ['set-qinglian', 'set-bone']);
assert.equal(drift.ok, false);
assert.equal(drift.issues[0].id, 'set-bone');
assert.equal(supply.audit('青莲地心火在掌心跳动。', ['set-qinglian'], ['set-qinglian']).ok, true);
assert.equal(supply.audit('骨灵冷火在掌心跳动。', ['set-bone'], ['set-bone']).ok, true);

// 选择提示词把候选当唯一来源写进去
const selectPrompt = buildSettingSelectPrompt({
    input: '青莲地心炎在哪',
    recentTexts: ['萧炎走进沙漠。'],
    candidates: [{ id: 'set-qinglian', name: '异火·青莲地心火', brief: '藏于地底岩浆' }],
    budget: 1200,
    maxItems: 8,
    asOf: 100,
});
assert.match(selectPrompt, /set-qinglian \| 异火·青莲地心火 \| 藏于地底岩浆/);
assert.match(selectPrompt, /当前剧情进度（卷）：100/);
assert.match(selectPrompt, /id 只能从候选里挑/);

// 模型选出的 id 必须落在候选里
let selectCalls = 0;
const client = createLlmClient({
    getSettings: () => ({ llm: { useSillyTavernConnection: false, baseUrl: 'https://api.example.com/v1', model: 'demo-model' } }),
    fetchImpl: async () => {
        selectCalls += 1;
        return {
            ok: true,
            status: 200,
            json: async () => ({
                choices: [{ message: { content: '{"needs":[{"id":"set-qinglian","layer":"full","why":"玩家问到"},{"id":"set-fake","layer":"full"}],"gaps":["药老在哪"]}' } }],
            }),
        };
    },
});
const picked = await client.selectSettings({ input: '青莲地心火', candidates: [{ id: 'set-qinglian', name: '异火·青莲地心火', brief: '藏于地底岩浆' }], maxItems: 8 });
assert.equal(picked.needs.length, 1);
assert.equal(picked.needs[0].id, 'set-qinglian');
assert.equal(picked.needs[0].layer, 'full');
assert.equal(picked.dropped, 1, '候选外的 id 要被丢掉');
assert.deepEqual(picked.gaps, ['药老在哪']);
const skipped = await client.selectSettings({ input: '青莲地心火', candidates: [] });
assert.equal(skipped.needs.length, 0);
assert.equal(selectCalls, 1, '没有候选就不该发请求');

// 接入回合阶段：召回→选条→注入正文提示词→生成后对账
let composeArgs = null;
const stages = createTurnStages({
    runner: { execute: async () => ({ ok: false, results: [] }) },
    actions: {},
    world: {},
    compose: async args => {
        composeArgs = args;
        return { text: '萧炎握紧拳头，青莲地心火在掌心跳动。', claims: [] };
    },
    getState: () => ({}),
    settings: supply,
    select: async ({ candidates }) => ({ needs: [{ id: candidates[0].id, layer: 'full' }], gaps: [] }),
    getSettingBudget: () => ({ maxCandidates: 40, maxItems: 8, injectionBudget: 400 }),
    getProgress: () => 100,
    getRecentTexts: () => ['萧炎走进沙漠。'],
});
const gatherCtx = {
    taskId: 'task-1',
    sessionId: 'session-1',
    branchId: 'branch-1',
    stateVersion: 'v1',
    playerInput: '青莲地心炎到底在什么地方',
    signal: undefined,
    previous: {},
    data: { taskType: 'ordinary_interaction', plan: { moduleIds: [] } },
};
const gathered = await stages.gather(gatherCtx);
assert.equal(gathered.status, 'supported');
assert.deepEqual(gathered.visibleFactIds, ['set-qinglian']);
assert.match(gathered.injection, /^\[set-qinglian\] 异火·青莲地心火：/);
assert.ok(gathered.settingCandidates >= 1);

const composed = await stages.compose({ ...gatherCtx, previous: { gather: gathered, adjudicate: { changes: [], nextState: {}, approvedChangeIds: [], outcome: '' } } });
assert.equal(composeArgs.injection, gathered.injection, '注入文本必须原样进正文提示词');
assert.equal(composed.settingAudit.ok, true);
assert.match(composed.text, /青莲地心火/);

const drifted = await stages.compose({ ...gatherCtx, previous: { gather: { ...gathered, injection: '', visibleFactIds: [], candidateIds: ['set-bone'] }, adjudicate: { changes: [], nextState: {}, approvedChangeIds: [], outcome: '' } } });
assert.equal(composed.claims.length, 0);
assert.equal(drifted.settingAudit.issues.length, 0, '候选范围外的条目不在本轮对账范围内');

// 没有登记设定时给明确状态，不静默跳过
const emptyStages = createTurnStages({ runner: {}, actions: {}, world: {}, compose: async () => ({ text: 'x' }), getState: () => ({}), settings: createSettingSupply() });
const none = await emptyStages.gather(gatherCtx);
assert.equal(none.status, 'no_settings');
assert.match(none.note, /还没有登记原著设定/);

test('budget fitting retains the accepted summary instead of reconstructing it', () => {
    const fittedSupply = createSettingSupply({ countTokens: text => text.length });
    fittedSupply.register({ id: 'fit', name: '设定', content: `短句。${'很长的后续句子'.repeat(20)}。` });
    const result = fittedSupply.assemble([{ id: 'fit', layer: 'full' }], { budget: 30 });
    assert.deepEqual(result.layers, [{ id: 'fit', layer: 'summary' }]);
    assert.equal(result.text, '[fit] 设定：短句。…');
    assert.equal(result.tokens, result.text.length);
    assert.ok(result.tokens <= result.budget);
});

test('summary and fitted summary cannot expose later-volume sections or summary fallback', () => {
    const volumeSupply = createSettingSupply({ countTokens: text => text.length });
    volumeSupply.register([
        { id: 'vol', name: '设定', content: `〔卷01〕\n简介：当下。${'本卷背景。'.repeat(20)}\n〔卷04 增补〕\n正文：后续秘密。` },
        { id: 'future', name: '后期', content: '〔卷04 增补〕\n正文：后续秘密。', summary: '后续秘密摘要。' },
    ]);
    for (const [layer, budget] of [['summary', 500], ['summary', 45], ['full', 45]]) {
        const result = volumeSupply.assemble([{ id: 'vol', layer }], { volume: 1, budget });
        assert.match(result.text, /当下/);
        assert.doesNotMatch(result.text, /卷04|后续秘密/);
        assert.equal(result.tokens, result.text.length);
        assert.ok(result.tokens <= budget);
    }
    const future = volumeSupply.assemble([{ id: 'future', layer: 'summary' }], { volume: 1, budget: 500 });
    assert.doesNotMatch(future.text, /卷04|后续秘密/);
});

test('token accounting includes separators and measures the entire accepted text', () => {
    const counted = createSettingSupply({ countTokens: text => text.length });
    counted.register([{ id: 'a', name: '甲', content: '正文。' }, { id: 'b', name: '乙', content: '正文。' }]);
    const chosen = [{ id: 'a', layer: 'mention' }, { id: 'b', layer: 'mention' }];
    const exact = counted.assemble(chosen, { budget: 11 });
    assert.equal(exact.text, '[a] 甲\n[b] 乙');
    assert.equal(exact.tokens, 11);
    const tight = counted.assemble(chosen, { budget: 10 });
    assert.deepEqual(tight.usedIds, ['a']);
    assert.deepEqual(tight.droppedIds, ['b']);
    assert.equal(tight.tokens, tight.text.length);
    const rounded = createSettingSupply({ countTokens: text => Math.ceil(text.length / 4) });
    rounded.register([{ id: 'a', name: '甲', content: '正文。' }, { id: 'b', name: '乙', content: '正文。' }]);
    const shared = rounded.assemble(chosen, { budget: 3 });
    assert.deepEqual(shared.usedIds, ['a', 'b'], 'joined token counts need not equal the sum of per-line counts');
    assert.equal(shared.tokens, Math.ceil(shared.text.length / 4));
});

test('fitting uses the supplied token counter, including ellipsis and prefix fallback', () => {
    const countTokens = text => [...text].reduce((total, ch) => total + (ch === '…' ? 5 : 2), 0);
    const counted = createSettingSupply({ countTokens });
    counted.register([
        { id: 's', name: '设定', content: `甲。${'长句'.repeat(50)}。` },
        { id: 'p', name: '设定', content: '没有句号'.repeat(50) },
    ]);
    for (const id of ['s', 'p']) {
        const result = counted.assemble([{ id, layer: 'summary' }], { budget: 60 });
        assert.equal(result.layers[0].layer, 'summary');
        assert.ok(result.text.endsWith('…'));
        assert.equal(result.tokens, countTokens(result.text));
        assert.ok(result.tokens <= 60);
    }
    const ellipsisBoundary = counted.assemble([{ id: 's', layer: 'summary' }], { budget: countTokens('[s] 设定：甲。…') - 1 });
    assert.deepEqual(ellipsisBoundary.layers, [{ id: 's', layer: 'mention' }], 'ellipsis must fit along with the sentence');
});

test('default and unlimited budgets keep full text and preserve volume trimming', () => {
    const unlimited = createSettingSupply({ countTokens: text => text.length });
    unlimited.register({ id: 'all', name: '设定', content: '〔卷01〕\n当前正文。\n〔卷04 增补〕\n后续秘密。' });
    const chosen = [{ id: 'all', layer: 'mention' }];
    for (const budget of [undefined, 0, '', Infinity, -1]) {
        const result = unlimited.assemble(chosen, { budget });
        assert.equal(result.budget, 0);
        assert.deepEqual(result.layers, [{ id: 'all', layer: 'full' }]);
        assert.match(result.text, /后续秘密/);
        assert.equal(result.tokens, result.text.length);
        assert.doesNotMatch(unlimited.assemble(chosen, { budget, volume: 1 }).text, /卷04|后续秘密/);
    }
    assert.match(unlimited.assemble(chosen).text, /后续秘密/);
});

console.log('setting supply tests passed');
