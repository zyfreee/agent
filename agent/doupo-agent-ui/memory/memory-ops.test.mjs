import assert from 'node:assert/strict';
import { buildMemoryInjection, recallHits, recallKeys, findMemoryConflicts, extractOpsBlock, parseOps, stripOpsBlock, MEMORY_GUIDE, MEMORY_HEADER } from './memory-ops.js';

const snapshot = {
    entries: [
        { id: 'm1', tier: 'big', text: '穆蛇当众羞辱过萧炎', quote: '把灵石留下，人可以走。', basis: '第 6 楼', related: ['穆蛇'], aliases: ['穆老大'], weight: 'major', tag: 'grudge', day: 6, done: false, resolvedDay: null, note: '', recallCount: 0, lastRecallDay: null },
        { id: 'm2', tier: 'small', text: '坊市掌柜今天多找了一枚铜板', basis: '第 8 楼', related: ['坊市掌柜'], weight: 'minor', day: 8, done: false, resolvedDay: null, note: '', recallCount: 2, lastRecallDay: 9 },
        { id: 'm3', tier: 'big', text: '云韵留了半句话', basis: '第 9 楼', related: ['云韵'], weight: 'minor', tag: 'thread', day: 9, done: false, resolvedDay: null, note: '', recallCount: 0, lastRecallDay: null },
        { id: 'm4', tier: 'small', text: '路边吃过一碗面', basis: '第 10 楼', related: ['面摊'], weight: 'minor', day: 10, done: false, resolvedDay: null, note: '', recallCount: 0, lastRecallDay: null },
        { id: 'm5', tier: 'big', text: '已报的仇', basis: '', related: ['穆蛇'], weight: 'minor', tag: '', day: 2, done: true, resolvedDay: 5, note: '', recallCount: 1, lastRecallDay: 5 },
    ],
};

// 1. 按需召回：related/别名 整词命中场景的才注入
{
    const body = buildMemoryInjection(snapshot, { maxChars: 4000, sceneText: '穆蛇和坊市掌柜都到了。' });
    assert.ok(body.includes('穆蛇当众羞辱过萧炎'), '命中关联的大记忆被召回');
    assert.ok(body.includes('坊市掌柜今天多找了一枚铜板'), '命中关联的小记忆被召回');
    assert.ok(body.includes('[大记忆]') && body.includes('[小记忆]'), '行内标注层级');
    assert.ok(body.includes('「把灵石留下，人可以走。」'), '引文以「」带回');
    assert.ok(!body.includes('云韵'), '没命中的不召回');
    assert.ok(body.includes('已报的仇'), '旧事（已了结）也保留召回权');
    assert.ok(body.indexOf('穆蛇当众羞辱过萧炎') < body.indexOf('已报的仇'), '未了结的排在旧事前面');
    assert.ok(body.includes('[恩怨]'), '大记忆带标签');
    // 别名也是钥匙：场景里出现"穆老大"同样召回
    assert.ok(recallHits(snapshot, { sceneText: '穆老大来了' }).length === 1, '别名参与召回');
    // 部分字面命中不算命中：只提"坊市"不等于关联"坊市掌柜"，全场没勾到就什么都不注
    const partial = buildMemoryInjection(snapshot, { maxChars: 4000, sceneText: '坊市门口来了人。' });
    assert.equal(partial, '', '按整个关联词匹配，"坊市"≠"坊市掌柜"');
}

// 2. 什么都没勾到 / 没有场景文本 → 空列表/空串（本轮不注记忆）
assert.deepEqual(recallHits(snapshot, { sceneText: '萧炎在后山打坐。' }), []);
assert.equal(buildMemoryInjection(snapshot, { maxChars: 4000, sceneText: '' }), '');
assert.equal(buildMemoryInjection({ entries: [] }, { maxChars: 900, sceneText: '穆蛇来了' }), '');

// 3. 强度排序：大记忆优先 → 关键优先 → 想起过的优先 → 新的优先
{
    const many = {
        entries: Array.from({ length: 20 }, (_, i) => ({
            id: `m${i}`, tier: i % 3 === 0 ? 'big' : 'small', text: `条目${i}关于穆蛇的事。`.repeat(6),
            related: ['穆蛇'], weight: i % 5 === 0 ? 'major' : 'minor', day: i + 1, done: false, resolvedDay: null, note: '',
            recallCount: i % 2, lastRecallDay: i,
        })),
    };
    const hits = recallHits(many, { sceneText: '穆蛇' });
    assert.equal(hits[0].tier, 'big', '大记忆排最前');
    assert.equal(hits[0].weight, 'major', '关键其次');
    assert.ok(hits[0].recallCount >= hits[1].recallCount, '同层同级里想起过的优先');
    const tight = buildMemoryInjection(many, { maxChars: 500, sceneText: '穆蛇' });
    const full = buildMemoryInjection(many, { maxChars: 4000, sceneText: '穆蛇' });
    assert.ok(tight.length < full.length, '超预算要裁剪');
    assert.ok(tight.split('\n')[0].includes('[大记忆]'), '裁剪后大记忆仍在最前');
    assert.ok(!tight.includes('条目19关于'), '低优先级的从尾部被丢');
}

// 4. 矛盾提醒：同钥匙 + 文本高相似（bigram Dice）；跨钥匙不报
{
    const entries = [
        { id: 'a', tier: 'big', text: '穆蛇在坊市当众羞辱了萧炎', related: ['穆蛇'], done: false },
        { id: 'b', tier: 'small', text: '穆蛇在坊市当众羞辱了萧炎一次', related: ['穆蛇'], done: false },
        { id: 'c', tier: 'small', text: '云韵在云岚宗留了半句话没说完', related: ['云韵'], done: false },
        { id: 'd', tier: 'small', text: '完全无关的另一件事', related: ['穆蛇'], done: false },
    ];
    const pairs = findMemoryConflicts(entries);
    assert.ok(pairs.some(pair => (pair.a === 'a' && pair.b === 'b') || (pair.a === 'b' && pair.b === 'a')), '同钥匙高相似要报警');
    assert.ok(!pairs.some(pair => pair.a === 'c' || pair.b === 'c'), '不同钥匙不报');
    assert.ok(!pairs.some(pair => pair.a === 'd' || pair.b === 'd'), '同钥匙但内容不同不报');
}

// 5. recallKeys：related + 别名去重
assert.deepEqual(recallKeys({ related: ['药老', '药尘'], aliases: ['药尘', '老师'] }), ['药老', '药尘', '老师']);

// 3. 优先级：大记忆在前、关键在前、新的在前；超预算从尾部丢
{
    const many = {
        entries: Array.from({ length: 20 }, (_, i) => ({
            id: `m${i}`, tier: i % 3 === 0 ? 'big' : 'small', text: `条目${i}关于穆蛇的事。`.repeat(6),
            related: ['穆蛇'], weight: i % 5 === 0 ? 'major' : 'minor', day: i + 1, done: false, resolvedDay: null, note: '',
        })),
    };
    const full = buildMemoryInjection(many, { maxChars: 4000, sceneText: '穆蛇' });
    const tight = buildMemoryInjection(many, { maxChars: 500, sceneText: '穆蛇' });
    assert.ok(tight.length < full.length, '超预算要裁剪');
    assert.ok(tight.split('\n')[0].includes('[大记忆]'), '大记忆排最前');
    assert.ok(!tight.includes('条目19关于'), '低优先级的从尾部被丢');
}

// 4. 指令块：fenced 提取、逐行解析、坏行跳过、正文剥离
const reply = [
    '剧情正文第一段。',
    '```memory',
    '{"op":"remember","text":"新小记忆","basis":"第 3 楼","related":["穆蛇"]}',
    '这不是 JSON',
    '{"op":"resolveMemory","id":"m5","note":"报了"}',
    '```',
    '剧情正文第二段。',
].join('\n');
const found = extractOpsBlock(reply);
assert.ok(found?.fenced);
const parsed = parseOps(found.raw);
assert.equal(parsed.ops.length, 2);
assert.equal(parsed.parseErrors.length, 1);
assert.equal(parsed.ops[1].op, 'resolveMemory');
const cleaned = stripOpsBlock(reply);
assert.ok(!cleaned.includes('```memory'));
assert.ok(!cleaned.includes('"op":"remember"'));
assert.ok(cleaned.includes('剧情正文第一段'));
assert.ok(cleaned.includes('剧情正文第二段'));

// 裸行兜底（模型不吃代码块语法时）
{
    const bare = ['正文。', '{"op":"remember","text":"裸行小记忆","related":["穆蛇"]}', '更多正文。'].join('\n');
    const found = extractOpsBlock(bare);
    assert.equal(found.fenced, false);
    assert.equal(parseOps(found.raw).ops.length, 1);
    assert.ok(!stripOpsBlock(bare).includes('"op"'));
}

// 5. 指南与抬头：两层分工、召回钥匙、所有权边界
assert.ok(MEMORY_GUIDE.includes('remember') && MEMORY_GUIDE.includes('memorize') && MEMORY_GUIDE.includes('promote'));
assert.ok(MEMORY_GUIDE.includes('related'));
assert.ok(MEMORY_GUIDE.includes('人物簿') && MEMORY_GUIDE.includes('纳戒'));
assert.ok(MEMORY_HEADER.includes('按需召回'));
