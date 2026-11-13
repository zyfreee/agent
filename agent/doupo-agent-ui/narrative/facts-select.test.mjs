import assert from 'node:assert/strict';
import test from 'node:test';
import { createFactsIndex } from '../narrative/facts-index.js';
import { buildSelectPrompt, createFactsSelector, LOOKUP_RULES, parseLookupSelection, parseSelection, SELECT_RULES, SELECT_SCHEMA } from '../narrative/facts-select.js';

// 选条口径：提到的就出（上下文+输入）、本卷故事线默认带、后续卷仍不选。
assert.ok(SELECT_RULES.includes('玩家输入或最近对话里点到'), '选条规则要覆盖最近对话里提到的条目');
assert.ok(SELECT_RULES.includes('当前卷的故事线是默认背景'), '锁卷就是为了让本卷故事线出场');
assert.ok(!SELECT_RULES.includes('只选本轮回复必须用到的'), '旧的"必须用到"硬门槛要撤掉');
assert.ok(SELECT_RULES.includes('后续卷的故事线'), '防剧透仍要挡后续卷故事线');
assert.ok(LOOKUP_RULES.includes('提到了就要调'), '卷外点选同样按"提到就出"口径');

const book = {
    entries: {
        1041: { uid: 1041, comment: '青莲地心火（物品-青莲地心火）', key: ['青莲地心火'], content: '【物品：青莲地心火】简介：异火榜第十九。' },
        217: { uid: 217, comment: '药老（人物-药尘（药老））', key: ['药老'], content: '【人物：药尘】简介：戒指中的灵魂体。' },
        42: { uid: 42, comment: '别离小医仙，黑岩城立名（故事线-042）', key: ['小医仙'], content: '【原著故事线·042：别离小医仙】正文：她定下行程往西。' },
        88: { uid: 88, comment: '后续才出现的伏笔（故事线-088）', key: ['伏笔'], content: '【原著故事线·088】正文：很后面的剧情。' },
    },
};
const index = createFactsIndex({ volumeIndex: { 1041: [2], 217: [1, 2], 42: [2], 88: [9] } });
index.load(book);

// OPT-062: a valid library UID omitted from the displayed catalog is unauthorized.
const hiddenSelector = createFactsSelector({ index, maxRows: 1, complete: async () => JSON.stringify({ need: [{ uid: 1041 }, { uid: 217 }], no_match: false }) });
const hiddenPicked = await hiddenSelector.select({ input: '目录预算夹具', volume: 2 });
const displayed = new Set(index.catalogFor(2, { maxRows: 1 }).lines.map(line => Number(line.split('|')[0])));
assert.ok(hiddenPicked.ids.every(uid => displayed.has(uid)));
assert.ok(hiddenPicked.invalid.some(row => row.reason === 'not_in_catalog'));

const prompt = buildSelectPrompt({
    input: '药老，这青莲地心火我能炼化吗',
    recentTexts: ['那团火到底是什么来路？', '你连它叫什么都不知道'],
    volume: 2,
    catalog: index.catalogFor(2).lines,
    maxPicks: 6,
});
assert.match(prompt.system, /取前 6 条/);
assert.match(prompt.user, /【当前进度】卷02/);
assert.match(prompt.user, /【最近对话】/);
assert.match(prompt.user, /1041\|物品\|青莲地心火/);
assert.equal(prompt.meta.rows, 3, '卷 2 只有三条，卷 9 的伏笔不能出现');
assert.match(prompt.user, /【本轮玩家输入】\n药老/);

// 目录分两段：本卷首次出现的给摘要，后续卷续篇只给标题。
const catalog2 = index.catalogFor(2);
assert.equal(catalog2.firstCount, 2, '卷 2 首次出现的是青莲地心火与故事线 042');
assert.equal(catalog2.prevCount, 1, '药老卷 1 已出现，这里只算前情');
assert.match(catalog2.lines.join('\n'), /217\|人物\|药尘（药老）\|卷01 前情$/m);
assert.equal(index.catalogFor(9).firstCount, 1);

// 结构化输出约束不要自带类名冲突的字段。
assert.equal(SELECT_SCHEMA.name, 'FactSelection');
assert.equal(SELECT_SCHEMA.value.properties.need.items.properties.uid.type, 'integer');

const ok = parseSelection('```json\n{"need":[{"uid":1041,"why":"问异火"},{"uid":217,"why":"问药老"}],"no_match":false}\n```', { index, volume: 2 });
assert.equal(ok.status, 'selected');
assert.deepEqual(ok.ids, [1041, 217]);
assert.equal(ok.entries[0].name, '青莲地心火');

// 只写编号的简写也认。
assert.deepEqual(parseSelection('{"ids":[1041]}', { index, volume: 2 }).ids, [1041]);

// 自定义接口不发 schema，模型会把目录整行抄进 need（“1041|物品|青莲地心火”）；
// 行首编号要抠得出来，抠出的编号照样过 index 白名单。
const rows = parseSelection('{"need":["1041|物品|青莲地心火","217|人物|药尘（药老）|卷01 前情"],"no_match":false}', { index, volume: 2 });
assert.deepEqual(rows.ids, [1041, 217]);
assert.equal(rows.status, 'selected');
// {uid:"整行文本"} 的包裹写法也要认。
assert.deepEqual(parseSelection('{"need":[{"uid":"217|人物|药尘"}],"no_match":false}', { index, volume: 2 }).ids, [217]);
// 行首不是数字的照样按 bad_uid 丢弃，不做模糊补全。
const junk = parseSelection('{"need":["萧炎"]}', { index, volume: 2 });
assert.deepEqual(junk.ids, []);
assert.equal(junk.invalid[0].reason, 'bad_uid');
// 卷外点选同款兼容：候选行也带类别名，行首编号照抠，白名单照拦。
const lookupRows = parseLookupSelection('{"need":["42|故事线|别离小医仙，黑岩城立名|卷02|她定下行程往西"],"no_match":false}', { allowedUids: [42, 88] });
assert.deepEqual(lookupRows.ids, [42]);
assert.equal(parseLookupSelection('{"need":["88|故事线|伏笔"]}', { allowedUids: [42] }).ids.length, 0);

// 越权与编造的编号一律丢弃，不做模糊补全。
const guarded = parseSelection('{"need":[{"uid":88,"why":"伏笔"},{"uid":9999,"why":"编的"},{"uid":"x"}],"no_match":false}', { index, volume: 2 });
assert.deepEqual(guarded.ids, []);
assert.deepEqual(guarded.invalid.map(item => item.reason), ['other_volume', 'unknown_uid', 'bad_uid']);

const dup = parseSelection('{"need":[{"uid":1041},{"uid":1041}],"no_match":false}', { index });
assert.deepEqual(dup.ids, [1041]);
assert.equal(dup.invalid[0].reason, 'duplicate');

const capped = parseSelection(JSON.stringify({ need: [{ uid: 1041 }, { uid: 217 }, { uid: 42 }] }), { index, volume: 2, maxPicks: 2 });
assert.equal(capped.ids.length, 2);
assert.deepEqual(capped.invalid.map(item => item.reason), ['over_pick']);

assert.equal(parseSelection('{"need":[],"no_match":true}', { index }).status, 'no_match');
assert.equal(parseSelection('{"need":[]}', { index }).status, 'empty');
assert.equal(parseSelection('模型拒绝了这次请求', { index }).status, 'unparsed');
assert.equal(parseSelection(undefined, { index }).status, 'unparsed');

// 端到端：complete 被调用一次，拿到的提示词里没有条目正文。
const calls = [];
const selector = createFactsSelector({
    index,
    maxPicks: 2,
    complete: async ({ system, user, jsonSchema }) => {
        calls.push({ system, user, jsonSchema });
        return '{"need":[{"uid":1041,"why":"异火"}],"no_match":false}';
    },
});
const selected = await selector.select({ input: '青莲地心火怎么炼化', volume: 2 });
assert.equal(selected.status, 'selected');
assert.deepEqual(selected.ids, [1041]);
assert.equal(calls.length, 1);
assert.equal(calls[0].jsonSchema, SELECT_SCHEMA);
assert.equal(calls[0].user.includes('【物品：青莲地心火】'), false, '目录只给标题与 30 字摘要，不带条目正文');

const failing = createFactsSelector({ index, complete: async () => { throw new Error('超时'); } });
assert.equal((await failing.select({ input: 'x', volume: 2 })).status, 'failed');

const emptyIndex = createFactsIndex();
const noIndex = createFactsSelector({ index: emptyIndex, complete: async () => '{}' });
assert.equal((await noIndex.select({ input: 'x' })).status, 'no_index');

// 卷号未知时退到全量目录，并标注被截断。
const fallback = await selector.select({ input: '青莲地心火', volume: null });
assert.equal(fallback.status, 'selected');
assert.equal(fallback.meta.truncated, false);

// 单次检索上限动态读取：设置页数字每次现读，规则文本的 MAX_PICKS 同步替换，超出的截断。
const dynamicCalls = [];
const dynamic = createFactsSelector({
    index,
    getMaxPicks: () => 2,
    complete: async ({ system }) => {
        dynamicCalls.push(system);
        return '{"need":[{"uid":1041,"why":"异火"},{"uid":217,"why":"药老"},{"uid":42,"why":"故事线"}],"no_match":false}';
    },
});
const dynamicPicked = await dynamic.select({ input: '青莲地心火和药老', volume: 2 });
assert.equal(dynamicPicked.status, 'selected');
assert.deepEqual(dynamicPicked.ids, [1041, 217], '模型给了 3 条，按动态上限 2 截断');
assert.match(dynamicCalls.at(-1), /取前 2 条/, '规则文本的 MAX_PICKS 换成动态上限');
assert.equal(dynamicPicked.meta.maxPicks, 2, 'meta 带出本次生效的上限');
// 单次调用自带覆盖：优先生效，这次只留 1 条
const overridePicked = await dynamic.select({ input: '青莲地心火', volume: 2, maxPicks: 1 });
assert.deepEqual(overridePicked.ids, [1041], '单次覆盖上限优先生效');
assert.equal(overridePicked.meta.maxPicks, 1);
// 动态读取非法值（0/负数/非数字）回落默认 8
const broken = createFactsSelector({
    index,
    getMaxPicks: () => 0,
    complete: async () => '{"need":[{"uid":1041,"why":"异火"}],"no_match":false}',
});
const brokenPicked = await broken.select({ input: '青莲地心火', volume: 2 });
assert.equal(brokenPicked.meta.maxPicks, 8, '非法上限回落默认 8');
// 不设天花板：填 40 就是 40，不再钳到 24
const free = createFactsSelector({
    index,
    getMaxPicks: () => 40,
    complete: async ({ system }) => {
        dynamicCalls.push(system);
        return '{"need":[{"uid":1041,"why":"异火"}],"no_match":false}';
    },
});
const freePicked = await free.select({ input: '青莲地心火', volume: 2 });
assert.equal(freePicked.meta.maxPicks, 40, '上限不设天花板，按设置直通');
assert.match(dynamicCalls.at(-1), /取前 40 条/, '规则文本同步换成 40');

// 选条规则可改：设置页写入后每轮现读，MAX_PICKS 占位符要换成当前上限。
const ruleCalls = [];
const customRules = createFactsSelector({
    index,
    maxPicks: 3,
    rules: '内置规则 MAX_PICKS',
    getRules: () => '自定义规则，最多 MAX_PICKS 条',
    complete: async args => { ruleCalls.push(args); return '{"need":[],"no_match":true}'; },
});
const noMatch = await customRules.select({ input: '随便', volume: 2 });
assert.equal(noMatch.status, 'no_match');
assert.equal(ruleCalls[0].system, '自定义规则，最多 3 条');

const blankRules = createFactsSelector({ index, rules: '   ', complete: async args => { ruleCalls.push(args); return '{}'; } });
await blankRules.select({ input: '随便', volume: 2 });
assert.equal(ruleCalls[1].system.includes('事实检索员'), true, '规则留空时回到内置默认');

const withVolume = parseSelection('{"need":[],"no_match":true,"volume":7}', { index, volume: 2 });
assert.equal(withVolume.volume, 7, '模型顺带给的卷号要原样带出来');
assert.equal(parseSelection('{"need":[],"no_match":true,"volume":99}', { index, volume: 2 }).volume, null, '越界卷号当没给');

// 卷外双线：模型给名字 → 脚本搜全库 → 只把候选回给它 → 它点 uid → 与卷内结果合并。
const laneCalls = [];
const lane = createFactsSelector({
    index,
    maxPicks: 3,
    complete: async args => {
        laneCalls.push(args);
        if (laneCalls.length === 1) return '{"need":[{"uid":1041}],"no_match":false,"lookup":["伏笔"]}';
        return '{"need":[{"uid":88,"why":"玩家问的就是它"}],"no_match":false}';
    },
});
const twoLane = await lane.select({ input: '那个伏笔是什么', volume: 2 });
assert.equal(laneCalls.length, 2, '给了名字且搜得到，才发第二次调用');
assert.equal(twoLane.secondCall, true);
assert.deepEqual(twoLane.lookup.requested, ['伏笔']);
assert.equal(twoLane.lookup.hits.length, 1);
assert.deepEqual(twoLane.ids, [1041, 88], '卷内模型点的在前，卷外点选的随后');
assert.match(laneCalls[1].user, /88\|故事线\|后续才出现的伏笔\|卷09/);
assert.equal(laneCalls[1].user.includes('【原著故事线·088】'), false, '第二次也只给目录行，不给正文');

// 全库搜不到 → 不花第二次调用。
let noHitCalls = 0;
const noHit = createFactsSelector({ index, complete: async () => { noHitCalls += 1; return '{"need":[],"no_match":true,"lookup":["根本不存在的玩意儿"]}'; } });
const miss = await noHit.select({ input: 'x', volume: 2 });
assert.equal(noHitCalls, 1, '搜不到就不该再发一次');
assert.equal(miss.lookup.hits.length, 0);
assert.equal(miss.secondCall, false);

// 卷外候选只能从脚本搜出来的 uid 里挑，编的编号一律挡掉。
assert.deepEqual(parseLookupSelection('{"need":[{"uid":88},{"uid":777}]}', { allowedUids: new Set([88]) }).ids, [88]);
assert.equal(parseLookupSelection('{"need":[{"uid":777}]}', { allowedUids: new Set([88]) }).invalid[0].reason, 'not_in_candidates');

// 严格执行模型结果：模型一条没选，脚本就不注入任何条目。
const strictCalls = [];
const strict = createFactsSelector({
    index,
    maxPicks: 3,
    complete: async args => {
        strictCalls.push(args);
        return '{"need":[],"no_match":true}';
    },
});
const strictRun = await strict.select({ input: '药老，这火怎么炼', volume: 2 });
assert.deepEqual(strictRun.ids, [], '模型没选就不注入');
assert.equal(strictCalls[0].user.includes('直接收录'), false, '提示词里不再有强制层说明');

// —— 目录相关度重排接入选条：强命中行置顶进提示词，meta 带出重排标记与命中行数。
const rankedCalls = [];
const rankedSelector = createFactsSelector({
    index,
    complete: async args => {
        rankedCalls.push(args);
        return '{"need":[{"uid":1041,"why":"异火"}],"no_match":false}';
    },
});
const rankedRun = await rankedSelector.select({ input: '青莲地心火怎么炼化', volume: 2 });
assert.equal(rankedRun.status, 'selected');
assert.equal(rankedRun.meta.catalogRanked, true, 'meta 标注目录已按相关度重排');
assert.equal(rankedRun.meta.scoredRows, 1, '命中行计数进 meta');
const rankedUser = rankedCalls[0].user;
assert.ok(rankedUser.indexOf('1041|物品|青莲地心火') < rankedUser.indexOf('42|故事线|'), '强命中行排在零分行前面');

// 旧索引没有 rankCatalogFor 时按旧目录走，行为不变。
const legacyCalls = [];
const legacy = createFactsSelector({
    index: { stats: () => index.stats(), catalogFor: (...args) => index.catalogFor(...args), get: uid => index.get(uid) },
    complete: async args => {
        legacyCalls.push(args);
        return '{"need":[],"no_match":true}';
    },
});
const legacyRun = await legacy.select({ input: 'x', volume: 2 });
assert.equal(legacyRun.status, 'no_match');
assert.equal(legacyRun.meta.catalogRanked, false, '没有 rankCatalogFor 的索引回退原目录');
assert.equal(legacyRun.meta.scoredRows, 0);

test('malformed first-pass replies return unparsed without a lookup call', async () => {
    for (const reply of ['模型拒绝了这次请求', '{"need":[', '', undefined]) {
        let count = 0;
        const malformed = createFactsSelector({ index, complete: async () => { count++; return reply; } });
        const result = await malformed.select({ input: '青莲地心火', volume: 2 });
        assert.equal(result.status, 'unparsed');
        assert.deepEqual(result.ids, []);
        assert.deepEqual(result.entries, []);
        assert.deepEqual(result.invalid, []);
        assert.equal(result.noMatch, false);
        assert.equal(result.lookup, null);
        assert.equal(result.inferredVolume, null);
        assert.equal(result.secondCall, false);
        assert.equal(count, 1);
        assert.deepEqual(parseSelection(reply, { index }), {
            status: 'unparsed', ids: [], entries: [], invalid: [], noMatch: false, lookup: [], volume: null,
        });
    }
});

console.log('facts select tests passed');
