import assert from 'node:assert/strict';
import { scoreEntries, topCandidates, recallKeys, textSimilarity, relatedMemories, DEDUP_SIMILARITY } from './memory-retrieve.js';

// 0. 共享工具自检（从 memory-ops 迁居至此，旧导入路径由 ops 转发）
assert.deepEqual(recallKeys({ related: ['药老', '药尘'], aliases: ['药尘', '老师'] }), ['药老', '药尘', '老师'], 'related + 别名去重');
assert.equal(textSimilarity('', '随便什么'), 0, '空文本相似度为 0');
assert.ok(textSimilarity('穆蛇在坊市羞辱萧炎', '穆蛇在坊市羞辱了萧炎') > 0.5, '近似文本 Dice 相似度达标');
assert.equal(textSimilarity('穆蛇在坊市', '云韵在后山'), 0, '完全不同的文本相似度为 0');

// 1. 钥匙命中：每个命中钥匙 +2.5，封顶 +5
{
    const entry = { id: 'm1', tier: 'small', text: '三把钥匙的事', related: ['甲', '乙', '丙'], day: 5 };
    const scored = scoreEntries({ entries: [entry] }, { sceneText: '甲乙丙都到场了。' });
    assert.equal(scored[0].score, 5, '三钥匙 7.5 被封顶为 5');
    assert.equal(scored[0].triggered, true, '钥匙命中即触发');
    const one = scoreEntries({ entries: [{ ...entry, related: ['甲'] }] }, { sceneText: '甲到场了。' });
    assert.equal(one[0].score, 2.5, '单钥匙 +2.5');
}

// 2. 引文命中 +3、标题命中 +1.5
{
    const entry = { id: 'm2', tier: 'small', text: '别的事', quote: '把灵石留下，人可以走。', title: '坊市立约', related: [], day: 5 };
    const scored = scoreEntries({ entries: [entry] }, { sceneText: '他把灵石留下，人可以走。然后谈起坊市立约。' });
    assert.equal(scored[0].score, 4.5, '引文 3 + 标题 1.5');
    const shortQuote = scoreEntries({ entries: [{ ...entry, quote: '太短' }] }, { sceneText: '他把太短写进了正文。' });
    assert.ok(shortQuote[0].score < 3, '过短的引文不算逐字回响');
}

// 3. bigram 词面包含：场景复述记忆内容也能触发（钥匙不在场）
{
    const entry = { id: 'm3', tier: 'small', text: '穆蛇在坊市拦路勒索被赶跑了', related: [], day: 5 };
    const verbatim = scoreEntries({ entries: [entry] }, { sceneText: '听说穆蛇在坊市拦路勒索被赶跑了。' });
    assert.equal(verbatim[0].overlap, 1, '逐字复述的包含率是 1');
    assert.equal(verbatim[0].triggered, true, '词面包含触发');
    const paraphrased = scoreEntries({ entries: [entry] }, { sceneText: '昨天穆蛇在坊市拦路勒索，被萧炎赶跑了。' });
    assert.ok(paraphrased[0].overlap > 0.7, '标点打断也让复述拿到高包含率');
    assert.equal(paraphrased[0].triggered, true, '复述触发');
    assert.ok(paraphrased[0].score <= 2.5 && paraphrased[0].score > 0, '词面加分封顶 2.5');
    const miss = scoreEntries({ entries: [entry] }, { sceneText: '云韵在后山静修。' });
    assert.equal(miss[0].triggered, false, '词面无关不触发');
}

// 4. 时间邻近：离当前世界天数越近分越高，45 天外归零；只加分、不触发
{
    const near = { id: 'm4', tier: 'small', text: '无关', related: [], day: 10 };
    const far = { id: 'm5', tier: 'small', text: '无关', related: [], day: 40 };
    const scored = scoreEntries({ entries: [near, far] }, { sceneText: '完全不沾边的话', currentDay: 11 });
    assert.equal(scored[0].entry.id, 'm4', '近事排前');
    assert.ok(scored[0].score > scored[1].score);
    const decayed = scoreEntries({ entries: [near] }, { sceneText: 'x', currentDay: 60 });
    assert.equal(decayed[0].score, 0, '45 天外时间分归零');
    assert.equal(topCandidates({ entries: [near] }, { sceneText: 'x', currentDay: 11 }).length, 0, '只有时间邻近不算触发，兜底不收');
}

// 5. 底分：大记忆 +1.2、关键 +0.8；纯底分不触发
{
    const bigMajor = { id: 'm6', tier: 'big', weight: 'major', text: '毫不相干', related: [], day: 1 };
    const smallMinor = { id: 'm7', tier: 'small', weight: 'minor', text: '也不相干', related: [], day: 1 };
    const scored = scoreEntries({ entries: [smallMinor, bigMajor] }, {});
    assert.equal(scored[0].entry.id, 'm6', '底分让大记忆在前');
    assert.equal(Math.round(scored[0].score * 100) / 100, 2.3, 'big 1.2 + major 0.8 + 重要度默认 7 (+0.3)');
    assert.equal(scored[1].score, 0);
    assert.equal(topCandidates({ entries: [bigMajor] }, { sceneText: '毫无关联的场景文本' }).length, 0, '纯底分不进兜底候选');
}

// 6. superseded（软覆盖）条目整体排除：目录与兜底都看不见
{
    const snap = { entries: [
        { id: 'm8', tier: 'big', text: '旧账', related: ['甲'], day: 3, supersededBy: 'm9' },
        { id: 'm9', tier: 'small', text: '新账', related: ['甲'], day: 4 },
    ] };
    const scored = scoreEntries(snap, { sceneText: '甲在场上' });
    assert.deepEqual(scored.map(item => item.entry.id), ['m9'], '被覆盖的旧账不参与打分');
    assert.deepEqual(topCandidates(snap, { sceneText: '甲在场上' }).map(entry => entry.id), ['m9']);
}

// 7. 向量相似度融合：Map 与对象两种注入形态，起评线 0.35、封顶 +4
{
    const entry = { id: 'mv', tier: 'small', text: '语义相近的事', related: [], day: 5 };
    const mapScore = scoreEntries({ entries: [entry] }, { sceneText: '别的场面', vectorSim: new Map([['mv', 0.9]]) });
    assert.equal(mapScore[0].score, 4, '(0.9-0.35)*10 封顶为 4');
    assert.equal(mapScore[0].triggered, true, '向量命中即触发');
    const objScore = scoreEntries({ entries: [entry] }, { sceneText: '别的场面', vectorSim: { mv: 0.5 } });
    assert.ok(Math.abs(objScore[0].score - 1.5) < 1e-9, '(0.5-0.35)*10 = 1.5');
    const below = scoreEntries({ entries: [entry] }, { sceneText: '别的场面', vectorSim: { mv: 0.3 } });
    assert.equal(below[0].triggered, false, '低于起评线的相似度不算触发');
}

// 8. 排序稳定性：分数相同按 day 新→旧，再按编号新→旧
{
    const snap = { entries: [
        { id: 'm1', tier: 'small', text: '一样', related: [], day: 3 },
        { id: 'm2', tier: 'small', text: '一样', related: [], day: 7 },
    ] };
    const scored = scoreEntries(snap, {});
    assert.deepEqual(scored.map(item => item.entry.id), ['m2', 'm1'], 'day 新的在前');
}

// 9. topCandidates：limit 钳制、空场景返回空、坏 limit 用默认
{
    const entries = Array.from({ length: 20 }, (_, i) => ({
        id: `m${i}`, tier: 'small', text: `条目${i}`, related: [`钥匙${i}`], day: i + 1,
    }));
    const scene = Array.from({ length: 20 }, (_, i) => `钥匙${i}在场上。`).join('');
    assert.equal(topCandidates({ entries }, { sceneText: scene }, { limit: 5 }).length, 5, 'limit 生效');
    assert.equal(topCandidates({ entries }, { sceneText: scene }, { limit: NaN }).length, 12, '坏 limit 回默认 12');
    assert.equal(topCandidates({ entries }, { sceneText: '' }).length, 0, '没场景就没有兜底候选');
    assert.equal(topCandidates({ entries: [] }, { sceneText: '钥匙0在场上' }).length, 0, '空库返回空');
}

// —— 进阶版门控：advanced=false 退回学这些仓库之前的旧行为（完整版/简略版口径） ——
{
    const entry = { id: 'm3', tier: 'small', text: '穆蛇在坊市拦路勒索被赶跑了', related: [], day: 5 };
    const legacy = scoreEntries({ entries: [entry] }, { sceneText: '听说穆蛇在坊市拦路勒索被赶跑了。', advanced: false });
    assert.equal(legacy[0].triggered, false, '旧口径：词面复述不触发（只有钥匙整词命中才算）');
    assert.equal(legacy[0].overlap, 0, '旧口径：词面包含率不计算');
    const keyHit = scoreEntries({ entries: [{ id: 'm4', tier: 'small', text: '别的', related: ['甲'], day: 5 }] }, { sceneText: '甲到场了。', advanced: false });
    assert.equal(keyHit[0].triggered, true, '旧口径：钥匙整词命中触发');
    assert.equal(keyHit[0].score, 0, '旧口径：无加成分量（引文/标题/词面/向量/重要度全部不参与）');
    const order = scoreEntries({ entries: [
        { id: 'm5', tier: 'small', text: '小事', related: ['同钥'], day: 9 },
        { id: 'm6', tier: 'big', text: '大事', related: ['同钥'], day: 2 },
    ] }, { sceneText: '同钥登场。', advanced: false });
    assert.deepEqual(order.map(item => item.entry.id), ['m6', 'm5'], '旧口径排序：大记忆优先 →（平局）day 新→旧（复刻旧 recallHits 排序）');
    const paraphrase = topCandidates({ entries: [entry] }, { sceneText: '昨天穆蛇在坊市拦路勒索，被萧炎赶跑了。', advanced: false });
    assert.deepEqual(paraphrase, [], '旧口径兜底：改述不逐字复述就不勾（无 bigram）');
}


// 14. importance 分量（Generative Agents 检索三因子）：其余相同，重要度决定排序
{
    const base = { id: 'm9', tier: 'small', text: '一件普通的事', related: [], day: 5 };
    const low = scoreEntries({ entries: [{ ...base, importance: 1 }] }, { sceneText: '' });
    const high = scoreEntries({ entries: [{ ...base, importance: 10 }] }, { sceneText: '' });
    assert.equal(Math.round((high[0].score - low[0].score) * 100) / 100, 1.35, '重要度 1→10 相差 9 档 × 0.15');
    const defaulted = scoreEntries({ entries: [{ ...base }] }, { sceneText: '' });
    assert.equal(Math.round((defaulted[0].score - low[0].score) * 100) / 100, 0.6, '无 importance 按 minor 默认 5（中性）算');
}

// 15. relatedMemories：共钥匙连接、排除自身与已覆盖、day 降序、limit 截断
{
    const self = { id: 'm1', tier: 'small', text: '问价', related: ['凝血草', '掌柜'], day: 5 };
    const entries = [
        self,
        { id: 'm2', tier: 'small', text: '讨价', related: ['凝血草'], day: 8 },
        { id: 'm3', tier: 'small', text: '别事', related: ['云岚宗'], day: 9 },
        { id: 'm4', tier: 'small', text: '旧问价', related: ['掌柜'], day: 3, supersededBy: 'm9' },
        { id: 'm5', tier: 'big', text: '药铺线', related: ['凝血草', '药铺'], day: 6 },
    ];
    assert.deepEqual(relatedMemories(self, entries).map(item => item.id), ['m2', 'm5'], '共钥匙、排除自身/已覆盖、新的在前');
    assert.equal(relatedMemories(self, entries, { limit: 1 })[0].id, 'm2', 'limit 截断');
    assert.deepEqual(relatedMemories({ id: 'm7', related: [] }, entries), [], '无钥匙返回空');
    assert.equal(DEDUP_SIMILARITY, 0.85, '查重阈值与 MemPalace 同档');
}

console.log('memory retrieve tests passed');
