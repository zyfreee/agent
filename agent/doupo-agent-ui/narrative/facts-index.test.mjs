import assert from 'node:assert/strict';
import { createFactsIndex, parseComment } from '../narrative/facts-index.js';

// 嵌套括号：正则截取会得到「美杜莎女王（彩鳞）」，正确结果是类别人物、名字带别名。
assert.deepEqual(parseComment('美杜莎女王（彩鳞）（人物-美杜莎女王（彩鳞））'), {
    outer: '美杜莎女王（彩鳞）', category: '人物', name: '美杜莎女王（彩鳞）', seq: null,
});

// 故事线：破折号后是连续序号，名字在外层。
assert.deepEqual(parseComment('别离小医仙，黑岩城立名（故事线-042）'), {
    outer: '别离小医仙，黑岩城立名', category: '故事线', name: '别离小医仙，黑岩城立名', seq: 42,
});

assert.equal(parseComment('没有括号的注释'), null);
assert.equal(parseComment(''), null);
assert.equal(parseComment(undefined), null);

const book = {
    entries: {
        1041: { uid: 1041, comment: '青莲地心火（物品-青莲地心火）', key: ['青莲地心火', '地心火'], content: '【物品：青莲地心火】简介：异火榜第十九，生于塔戈尔沙漠地底。更多正文。' },
        217: { uid: 217, comment: '药老（人物-药尘（药老））', key: ['药老', '药尘'], content: '【人物：药尘】简介：萧炎戒指中的灵魂体，炼药宗师。' },
        42: { uid: 42, comment: '别离小医仙，黑岩城立名（故事线-042）', key: ['小医仙'], content: '故事正文，没有卷标记。' },
        900: { uid: 900, comment: '未解析注释', key: [], content: '卷 07 里提到的东西，靠正文兜底。' },
        901: { uid: 901, comment: '空正文（物品-空）', key: ['空'], content: '' },
    },
};

const index = createFactsIndex({ volumeIndex: { 1041: [2], 217: [1], 42: [5] } });
const cappedPrevIndex = createFactsIndex({ volumeIndex: { 1041: [1, 2], 217: [1, 2] } });
cappedPrevIndex.load(book);
const prevCapped = cappedPrevIndex.catalogFor(2, { maxPrev: 1, maxRows: 100 });
assert.equal(prevCapped.lines.length, 1);
assert.equal(prevCapped.truncated, true, 'OPT-105: prev cap is observable even below row cap');

const loaded = index.load(book);
assert.equal(loaded.total, 4, '空正文条目应被跳过');
assert.equal(loaded.skipped, 1);
assert.equal(loaded.unparsedComment, 1);
assert.deepEqual(loaded.categories, { 物品: 1, 人物: 1, 故事线: 1, 未分类: 1 });

assert.equal(index.categoryOf(217), '人物');
assert.deepEqual(index.volumesOf(1041), [2]);
// 卷索引没覆盖的条目回退到正文里的「卷N」标记。
assert.deepEqual(index.volumesOf(900), [7]);
assert.equal(index.stats().missingVolume, 0);

assert.deepEqual(index.findByName('药老').map(entry => entry.uid), [217]);
assert.equal(index.findByName('不存在').length, 0);

const catalogVolume2 = index.catalog(2);
assert.deepEqual(catalogVolume2, ['1041|物品|青莲地心火|异火榜第十九，生于塔戈尔沙漠地底']);
assert.deepEqual(index.catalog(99), [], '不认识的卷号返回空，不猜');

// 词表命中：全名和派生缩写都要能命中，但只作为候选，不决定取舍。
const tokens = index.matchTokens('药老，这青莲地心火能炼化吗');
assert.equal(tokens[0].uid, 1041);
assert.equal(tokens.some(item => item.uid === 217), true);
assert.deepEqual(index.matchTokens('药老', { volume: 3 }), [], '按卷过滤后不该有结果');
assert.equal(index.matchTokens('').length, 0);

assert.equal(index.get(1041).summary.includes('异火榜第十九'), true);
assert.equal(index.fullCatalog().length, 4);

// 重建后旧条目不能残留。
index.load({ entries: { 1: { uid: 1, comment: '甲（物品-甲）', key: ['甲'], content: '正文' } } });
assert.equal(index.stats().total, 1);
assert.equal(index.get(1041), null);

assert.equal(createFactsIndex().load({}).total, 0);
assert.equal(createFactsIndex().load(null).total, 0);

// —— rankCatalogFor：与本轮词面相关的行置顶，零分行的摘要降级成 —；候选集合与 catalogFor 一致，只排序不取舍。
const rankIndex = createFactsIndex({ volumeIndex: { 10: [2], 11: [2], 12: [2], 13: [1, 2] } });
rankIndex.load({
    entries: {
        10: { uid: 10, comment: '青莲地心火（物品-青莲地心火）', key: ['青莲地心火'], content: '【物品：青莲地心火】简介：异火榜第十九，藏于塔戈尔沙漠。' },
        11: { uid: 11, comment: '云岚宗（势力-云岚宗）', key: ['云岚宗'], content: '【势力：云岚宗】简介：加玛帝国东部的宗门势力。' },
        12: { uid: 12, comment: '萧家（势力-萧家）', key: ['萧家'], content: '【势力：萧家】简介：乌坦城的小家族。' },
        13: { uid: 13, comment: '药尘（人物-药尘）', key: ['药尘'], content: '【人物：药尘】简介：灵魂状态的炼药师。' },
    },
});
const ranked = rankIndex.rankCatalogFor(2, { input: '我想炼化青莲地心火', recentTexts: [] });
assert.equal(ranked.ranked, true);
assert.equal(ranked.firstCount, 3);
assert.equal(ranked.prevCount, 1);
assert.equal(ranked.total, 4);
assert.equal(ranked.scoredFirst, 1, '只有青莲地心火与本轮沾边');
assert.equal(ranked.scoredPrev, 0);
assert.ok(ranked.lines[0].startsWith('10|物品|青莲地心火|异火榜第十九'), '强命中行排第一且摘要保留');
assert.equal(ranked.lines[1], '11|势力|云岚宗|—', '零分行的摘要降级，防目录铺张');
assert.equal(ranked.lines[2], '12|势力|萧家|—');
assert.equal(ranked.lines[3], '13|人物|药尘|卷01 前情', '前情段行式不变');

// 命中来自最近对话也算分，命中行摘要保留。
const viaRecent = rankIndex.rankCatalogFor(2, { input: '', recentTexts: ['云岚宗的人找上门来了'] });
assert.ok(viaRecent.lines[0].startsWith('11|势力|云岚宗|'), '最近对话里的命中照样置顶');
assert.ok(viaRecent.lines[0].includes('加玛帝国'), '命中行摘要保留');
assert.equal(viaRecent.scoredFirst, 1);

// 摘要二字窗也能命中：输入没写全名，但沾了摘要里的词面。
const summaryHit = rankIndex.rankCatalogFor(2, { input: '听说加玛帝国最近不太平', recentTexts: [] });
assert.ok(summaryHit.lines[0].startsWith('11|势力|云岚宗|'), '摘要词面重叠的行也置顶');

// 空输入谈不上相关度：回落 uid 序并保留摘要，不上降级。
const unranked = rankIndex.rankCatalogFor(2, { input: '', recentTexts: [] });
assert.equal(unranked.ranked, false);
assert.ok(unranked.lines[0].startsWith('10|物品|青莲地心火|异火榜第十九'));
assert.ok(unranked.lines[1].startsWith('11|势力|云岚宗|加玛帝国'));
assert.equal(unranked.scoredFirst, 0);
assert.deepEqual(rankIndex.rankCatalogFor(99, { input: '随便' }).lines, [], '不认识的卷号照旧返回空');

// —— searchByName 字符级模糊：变体名（少写/写错一个字）也捞得回候选；毫不沾边的不出。
const fuzzyIndex = createFactsIndex({ volumeIndex: { 1041: [2], 217: [1] } });
fuzzyIndex.load({
    entries: {
        1041: { uid: 1041, comment: '青莲地心火（物品-青莲地心火）', key: ['青莲地心火'], content: '【物品：青莲地心火】简介：异火榜第十九。' },
        217: { uid: 217, comment: '药老（人物-药尘（药老））', key: ['药老', '药尘'], content: '【人物：药尘】简介：戒指中的灵魂体。' },
    },
});
assert.deepEqual(fuzzyIndex.searchByName('青莲地火').map(entry => entry.uid), [1041], '变体名按字符命中率捞回');
assert.deepEqual(fuzzyIndex.searchByName(['青莲地心火']).map(entry => entry.uid), [1041], '全名照旧精确命中');
assert.equal(fuzzyIndex.searchByName('陨落斗帝').length, 0, '毫不沾边的词不出候选');

console.log('facts index tests passed');
