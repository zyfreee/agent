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

console.log('facts index tests passed');
