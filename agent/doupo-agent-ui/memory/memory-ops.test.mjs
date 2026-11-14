import assert from 'node:assert/strict';
import { buildMemoryInjection, renderMemoryEntries, renderMemoryEntriesDetail, recallHits, recallKeys, findMemoryConflicts, extractOpsBlock, parseOps, stripOpsBlock, MEMORY_GUIDE, MEMORY_HEADER } from './memory-ops.js';

const snapshot = {
    entries: [
        { id: 'm1', tier: 'big', text: '穆蛇当众羞辱过萧炎', quote: '把灵石留下，人可以走。', basis: '第 6 楼', related: ['穆蛇'], aliases: ['穆老大'], weight: 'major', tag: 'grudge', day: 6, note: '' },
        { id: 'm2', tier: 'small', text: '坊市掌柜今天多找了一枚铜板', basis: '第 8 楼', related: ['坊市掌柜'], weight: 'minor', day: 8, note: '' },
        { id: 'm3', tier: 'big', text: '云韵留了半句话', basis: '第 9 楼', related: ['云韵'], weight: 'minor', tag: 'thread', day: 9, note: '' },
        { id: 'm4', tier: 'small', text: '路边吃过一碗面', basis: '第 10 楼', related: ['面摊'], weight: 'minor', day: 10, note: '' },
        { id: 'm5', tier: 'big', text: '穆蛇的旧账要慢慢算', basis: '', related: ['穆蛇'], weight: 'minor', tag: '', day: 2, note: '' },
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
    assert.ok(body.includes('穆蛇的旧账要慢慢算'), '旧记忆同样保留召回权');
    assert.ok(body.indexOf('穆蛇当众羞辱过萧炎') < body.indexOf('穆蛇的旧账要慢慢算'), '关键大记忆排在一般大记忆前面');
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

// 3. 兜底排序：大记忆优先 → 关键优先 → 新的优先（无强度权重）
{
    const many = {
        entries: Array.from({ length: 20 }, (_, i) => ({
            id: `m${i}`, tier: i % 3 === 0 ? 'big' : 'small', text: `条目${i}关于穆蛇的事。`.repeat(6),
            related: ['穆蛇'], weight: i % 5 === 0 ? 'major' : 'minor', day: i + 1, note: '',
        })),
    };
    const hits = recallHits(many, { sceneText: '穆蛇' });
    assert.equal(hits[0].id, 'm15', '大记忆里最新的关键条目排最前（m15=big+major+day16）');
    const smallFirst = hits.find(entry => entry.tier === 'small');
    assert.ok(hits.indexOf(smallFirst) > hits.filter(entry => entry.tier === 'big').length - 1, '大记忆整体排在小记忆前面');
    const tight = buildMemoryInjection(many, { maxChars: 500, sceneText: '穆蛇' });
    const full = buildMemoryInjection(many, { maxChars: 4000, sceneText: '穆蛇' });
    assert.ok(tight.length < full.length, '超预算要裁剪');
    assert.ok(tight.split('\n')[0].includes('[大记忆]'), '裁剪后大记忆仍在最前');
    assert.ok(!tight.includes('条目19关于'), '低优先级的从尾部被丢');
}

// 召回后的详细备注必须带给正文，未命中的记忆仍不注入。
{
    const detailed = { entries: [{ ...snapshot.entries[0], note: '穆蛇约定三日后在北门交割，不得提前。' }] };
    assert.match(buildMemoryInjection(detailed, { sceneText: '穆蛇', maxChars: 4000 }), /三日后在北门交割/);
    assert.equal(buildMemoryInjection(detailed, { sceneText: '云韵', maxChars: 4000 }), '');
    assert.match(renderMemoryEntries(detailed.entries, { maxChars: 4000 }), /三日后在北门交割/);
}

// 4. 矛盾提醒：同钥匙 + 文本高相似（bigram Dice）；跨钥匙不报
{
    const entries = [
        { id: 'a', tier: 'big', text: '穆蛇在坊市当众羞辱了萧炎', related: ['穆蛇'] },
        { id: 'b', tier: 'small', text: '穆蛇在坊市当众羞辱了萧炎一次', related: ['穆蛇'] },
        { id: 'c', tier: 'small', text: '云韵在云岚宗留了半句话没说完', related: ['云韵'] },
        { id: 'd', tier: 'small', text: '完全无关的另一件事', related: ['穆蛇'] },
    ];
    const pairs = findMemoryConflicts(entries);
    assert.ok(pairs.some(pair => (pair.a === 'a' && pair.b === 'b') || (pair.a === 'b' && pair.b === 'a')), '同钥匙高相似要报警');
    assert.ok(!pairs.some(pair => pair.a === 'c' || pair.b === 'c'), '不同钥匙不报');
    assert.ok(!pairs.some(pair => pair.a === 'd' || pair.b === 'd'), '同钥匙但内容不同不报');
}

// 5. recallKeys：related + 别名去重
assert.deepEqual(recallKeys({ related: ['药老', '药尘'], aliases: ['药尘', '老师'] }), ['药老', '药尘', '老师']);

// 5b. 兜底召回升级：词面包含（场景复述记忆内容，钥匙不在场也召回）+ 时间邻近参与排序
{
    const fuzzy = { entries: [{ id: 'm1', tier: 'small', text: '云韵在云岚宗留了半句话', related: ['云韵'], day: 5 }] };
    assert.equal(recallHits(fuzzy, { sceneText: '完全无关的场面' }).length, 0, '词面无关不召回');
    const hits = recallHits(fuzzy, { sceneText: '云韵在云岚宗留了半句话没说完', limit: 5 });
    assert.equal(hits.length, 1, '场景复述记忆内容时按词面包含召回（钥匙没在场也算勾到）');
    // 时间邻近只参与排序不触发：底分再高、离得再近，没场景信号就不进兜底
    assert.deepEqual(recallHits(
        { entries: [{ id: 'm2', tier: 'big', weight: 'major', text: '毫不相干', related: [], day: 9 }] },
        { sceneText: '别的剧情', currentDay: 9 },
    ), [], '纯底分+时间邻近不触发兜底');
    // 被软覆盖的旧账不进兜底
    const covered = { entries: [{ id: 'm3', tier: 'big', text: '旧账', related: ['旧账'], day: 2, supersededBy: 'm4' }] };
    assert.deepEqual(recallHits(covered, { sceneText: '旧账被人提起' }), [], '软覆盖的旧账不进兜底');
}

// 3b. renderMemoryEntries：召回决定选中的显式条目直接渲染，超预算从尾部丢
{
    const picked = [snapshot.entries[0], snapshot.entries[1], snapshot.entries[3]];
    const body = renderMemoryEntries(picked, { maxChars: 4000 });
    assert.ok(body.includes('穆蛇当众羞辱过萧炎') && body.includes('路边吃过一碗面'), '按传入顺序渲染');
    const longEntries = [
        { id: 'm1', tier: 'big', text: '甲'.repeat(90), related: ['甲'], day: 2 },
        { id: 'm2', tier: 'small', text: '乙'.repeat(90), related: ['乙'], day: 3 },
    ];
    const tight = renderMemoryEntries(longEntries, { maxChars: 200 });
    assert.ok(!tight.includes('乙'), '超预算从尾部丢');
    assert.ok(tight.includes('甲'), '至少保住第一条');
    assert.equal(renderMemoryEntries([], { maxChars: 900 }), '', '空列表返回空串');
}

// OPT-047/048: actual accepted entries and envelope-inclusive, whole-line character limits.
{
    const a = snapshot.entries[0];
    const b = snapshot.entries[1];
    const huge = { ...a, id: 'huge', text: '长'.repeat(1000) };
    assert.equal(renderMemoryEntries([huge], { maxChars: 200 }), '', 'one oversized entry must not overflow');
    const aLine = renderMemoryEntries([a], { maxChars: 4000 });
    const bLine = renderMemoryEntries([b], { maxChars: 4000 });
    const prefix = '【记忆】\n';
    const suffix = '\n【结束】';
    const exact = prefix.length + aLine.length + suffix.length;
    assert.deepEqual(renderMemoryEntriesDetail([a], { maxChars: exact, prefix, suffix }), { text: prefix + aLine + suffix, entries: [a], usedIds: [a.id] });
    assert.deepEqual(renderMemoryEntriesDetail([a], { maxChars: exact - 1, prefix, suffix }), { text: '', entries: [], usedIds: [] }, 'do not cut partial entry to fit');
    const pairCap = aLine.length + 1 + bLine.length;
    assert.equal(renderMemoryEntriesDetail([a, b], { maxChars: pairCap }).text, `${aLine}\n${bLine}`);
    assert.deepEqual(renderMemoryEntriesDetail([a, b], { maxChars: pairCap - 1 }).usedIds, [a.id], 'separator charged');
    const inputs = [huge, null, b];
    const before = structuredClone(inputs);
    const later = renderMemoryEntriesDetail(inputs, { maxChars: bLine.length });
    assert.deepEqual(later, { text: bLine, entries: [b], usedIds: [b.id] }, 'oversized early entry does not block later complete entry');
    assert.deepEqual(inputs, before, 'renderer does not mutate supplied entries/list');
    for (const maxChars of [0, 1, 10]) {
        const detail = renderMemoryEntriesDetail([a], { maxChars, prefix, suffix });
        assert.equal(detail.text, '');
        assert.deepEqual(detail.usedIds, []);
    }
    // Infinity＝不限制（设置层把「0＝不限制」换算成 Infinity 传进来）：再长的条目也整条放行。
    assert.deepEqual(renderMemoryEntriesDetail([a, b], { maxChars: Infinity }).usedIds, [a.id, b.id], 'unlimited budget keeps every entry');
    const giant = { ...a, id: 'giant', text: '长'.repeat(5000) };
    assert.equal(renderMemoryEntries([giant], { maxChars: 4000 }), '', 'finite cap still skips oversized entry');
    assert.ok(renderMemoryEntries([giant], { maxChars: Infinity }).includes('长'.repeat(5000)), 'unlimited budget admits oversized entries');
    for (const maxChars of [NaN, -1, 1.5, '200']) assert.equal(renderMemoryEntriesDetail([a], { maxChars }).text, aLine, 'invalid budget defaults safely');
    assert.deepEqual(renderMemoryEntriesDetail([], { prefix, suffix }), { text: '', entries: [], usedIds: [] });
    assert.equal(renderMemoryEntries([a, b], { maxChars: pairCap }), renderMemoryEntriesDetail([a, b], { maxChars: pairCap }).text, 'legacy string wrapper');
}

// 4. 指令块：fenced 提取、逐行解析、坏行跳过、正文剥离
const reply = [
    '剧情正文第一段。',
    '```memory',
    '{"op":"remember","text":"新小记忆","basis":"第 3 楼","related":["穆蛇"]}',
    '这不是 JSON',
    '{"op":"forgetMemory","id":"m5"}',
    '```',
    '剧情正文第二段。',
].join('\n');
const found = extractOpsBlock(reply);
assert.ok(found?.fenced);
const parsed = parseOps(found.raw);
assert.equal(parsed.ops.length, 2);
assert.equal(parsed.parseErrors.length, 1);
assert.equal(parsed.ops[1].op, 'forgetMemory');
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
assert.ok(MEMORY_GUIDE.includes('remember') && !MEMORY_GUIDE.includes('memorize') && !MEMORY_GUIDE.includes('promote(id)'));
assert.ok(MEMORY_GUIDE.includes('自动总结成大记忆'), '指南要写明大记忆由自动总结生成');
assert.ok(MEMORY_GUIDE.includes('related'));
assert.ok(MEMORY_GUIDE.includes('人物簿') && MEMORY_GUIDE.includes('纳戒'));
assert.ok(MEMORY_HEADER.includes('按需召回'));

// —— 完整版/简略版口径（advanced:false）：兜底召回退回旧行为——钥匙整词命中才算，无词面/向量分量 ——
{
    const snapshot = { entries: [{ id: 'm1', tier: 'small', text: '穆蛇在坊市拦路勒索被赶跑了', related: [], day: 5 }] };
    assert.deepEqual(recallHits(snapshot, { sceneText: '穆蛇在坊市拦路勒索，被赶跑了', advanced: false }), [], '旧口径：词面复述不勾（只有钥匙整词命中才算）');
    const withKey = { entries: [{ id: 'm2', tier: 'big', text: '旧账大事', related: ['穆蛇'], day: 2 }] };
    assert.equal(recallHits(withKey, { sceneText: '穆蛇登场', advanced: false }).length, 1, '旧口径：钥匙命中照常勾');
}
