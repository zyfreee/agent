import assert from 'node:assert/strict';
import { hashText, cosineSimilarity, createMemoryVectorStore, createMemoryVectorIndex } from './memory-vectors.js';

// 1. 基础工具：hash 稳定且区分文本；cosine 形状不齐/零向量一律 0
assert.equal(hashText('穆蛇在坊市'), hashText('穆蛇在坊市'), '同文本 hash 稳定');
assert.notEqual(hashText('穆蛇在坊市'), hashText('穆蛇在酒馆'), '不同文本 hash 不同');
assert.ok(Math.abs(cosineSimilarity([1, 0], [1, 0]) - 1) < 1e-9, '同向相似度 1');
assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 1e-9, '正交相似度 0');
assert.equal(cosineSimilarity([1], [1, 2]), 0, '维度不齐返回 0');
assert.equal(cosineSimilarity(null, [1, 2]), 0, '坏输入返回 0');
assert.equal(cosineSimilarity([0, 0], [1, 2]), 0, '零向量返回 0');

// 2. 存储（Node 无 IndexedDB → 内存 Map 退化）：按聊天隔离
{
    const store = createMemoryVectorStore({});
    const chat = 'chat-1';
    await store.putMany([
        { key: store.recordKey(chat, 'm1'), chat, id: 'm1', hash: 'h1', model: 'e1', vector: [1, 0] },
        { key: store.recordKey('chat-2', 'm1'), chat: 'chat-2', id: 'm1', hash: 'h2', model: 'e1', vector: [0, 1] },
    ]);
    assert.equal((await store.all(chat)).length, 1, '按聊天隔离读');
    assert.equal((await store.all('chat-9')).length, 0, '没数据的聊天返回空');
    await store.putMany([{ key: store.recordKey(chat, 'm1'), chat, id: 'm1', hash: 'h1b', model: 'e1', vector: [2, 0] }]);
    const rows = await store.all(chat);
    assert.equal(rows.length, 1, '同键覆盖写');
    assert.equal(rows[0].hash, 'h1b');
    await store.clear(chat);
    assert.equal((await store.all(chat)).length, 0, '清空只影响本聊天');
    assert.equal((await store.all('chat-2')).length, 1, '其他聊天不受影响');
}

// 3. sync 差异化补嵌：预算限量、hash/model 失效重嵌、重复调用不再嵌
{
    const store = createMemoryVectorStore({});
    const embedCalls = [];
    const embed = async texts => {
        embedCalls.push([...texts]);
        return { model: 'e1', vectors: texts.map(item => [item.length, 1]) };
    };
    const index = createMemoryVectorIndex({ store, embed, model: () => 'e1', chatKey: () => 'chat-1' });
    const snapshot = { entries: [{ id: 'm1', text: '四个字啦' }, { id: 'm2', text: '三个字' }] };
    const first = await index.sync(snapshot, { budget: 1 });
    assert.equal(first.embedded, 1, '预算限量补嵌');
    assert.equal(first.remaining, 1, '剩下的一条进下一轮');
    assert.deepEqual(embedCalls[0], ['四个字啦'], '按账本顺序取待嵌条目');
    const second = await index.sync(snapshot, { budget: 1 });
    assert.equal(second.embedded, 1);
    const third = await index.sync(snapshot);
    assert.equal(third.embedded, 0, 'hash 齐了不再重嵌');
    assert.equal(third.remaining, 0);
    const stats = await index.stats(snapshot);
    assert.equal(stats.total, 2);
    assert.equal(stats.embedded, 2);
    assert.equal(stats.model, 'e1');
    // 文本变了 → hash 变 → 重嵌这一条
    const changed = { entries: [{ id: 'm1', text: '内容改了' }, { id: 'm2', text: '三个字' }] };
    const reEmbed = await index.sync(changed, { budget: 5 });
    assert.equal(reEmbed.embedded, 1, '只重嵌改文本的那条');
    // 换模型 → 全部重嵌
    const newIndex = createMemoryVectorIndex({ store, embed, model: () => 'e2', chatKey: () => 'chat-1' });
    const switched = await newIndex.sync(changed, { budget: 10 });
    assert.equal(switched.embedded, 2, '换 embedding 模型全量重嵌');
}

// 4. similarities 与 queryVector：查询向量 memo、相似度只含有向量的条目
{
    const store = createMemoryVectorStore({});
    const embed = async texts => ({ model: 'e1', vectors: texts.map(item => [item.length, 1]) });
    const index = createMemoryVectorIndex({ store, embed, model: () => 'e1', chatKey: () => 'chat-1' });
    const snapshot = { entries: [
        { id: 'm1', text: '四个字啦' },
        { id: 'm2', text: '三个字' },
        { id: 'm3', text: '旧账', supersededBy: 'm1' },
    ] };
    await index.sync(snapshot);
    const vector = await index.queryVector('四个字啦');
    assert.deepEqual(vector, [4, 1], '查询向量取回');
    let calls = 0;
    const memoIndex = createMemoryVectorIndex({
        store,
        embed: async texts => { calls += 1; return embed(texts); },
        model: () => 'e1',
        chatKey: () => 'chat-1',
    });
    await memoIndex.queryVector('四个字啦');
    const before = calls;
    await memoIndex.queryVector('四个字啦');
    assert.equal(calls, before, '同文本查询命中 memo 不再调用');
    const sims = await index.similarities(snapshot, vector);
    assert.equal(sims.size, 2, '被覆盖的旧账不进相似度表');
    assert.ok(sims.get('m1') > 0.999, '查询向量与自身向量的相似度接近 1');
    assert.equal((await index.similarities(snapshot, null)).size, 0, '没有查询向量返回空表');
}

// 5. 失败降级：embed 抛错 / 存储抛错都只计统计，绝不抛进召回链
{
    const store = createMemoryVectorStore({});
    const failing = async () => { throw new Error('boom'); };
    const index = createMemoryVectorIndex({ store, embed: failing, model: () => 'e1', chatKey: () => 'chat-2' });
    const result = await index.sync({ entries: [{ id: 'm1', text: '正文' }] });
    assert.equal(result.embedded, 0);
    assert.equal(result.failed, 1, 'embed 失败计入 failed');
    assert.equal(await index.queryVector('正文'), null, 'embed 失败查询返回 null');
    const sims = await index.similarities({ entries: [{ id: 'm1', text: '正文' }] }, [1, 0]);
    assert.equal(sims.size, 0, '没有向量就没有相似度');
    const stats = await index.stats({ entries: [{ id: 'm1', text: '正文' }] });
    assert.equal(stats.embedded, 0, '失败统计不出假数');
    // embed 短返回（向量缺失）：缺向量的条目不入库
    const shortEmbed = async texts => ({ model: 'e1', vectors: texts.slice(0, 1).map(item => [1]) });
    const shortIndex = createMemoryVectorIndex({ store, embed: shortEmbed, model: () => 'e1', chatKey: () => 'chat-3' });
    const shortResult = await shortIndex.sync({ entries: [{ id: 'a', text: '甲' }, { id: 'b', text: '乙' }] });
    assert.equal(shortResult.embedded, 1, '缺向量的条目不入库');
    assert.equal(shortResult.failed, 1);
}

// 6. 边界：没 embed、没模型、被覆盖条目、空账本都安静返回
{
    const index = createMemoryVectorIndex({ store: createMemoryVectorStore({}), embed: null, model: () => 'e1', chatKey: () => 'c' });
    const none = await index.sync({ entries: [{ id: 'm1', text: '正文' }] });
    assert.deepEqual(none, { embedded: 0, remaining: 0, failed: 0, model: 'e1' }, '没 embed 客户端就不干活');
    const noModel = createMemoryVectorIndex({ store: createMemoryVectorStore({}), embed: async texts => ({ model: 'x', vectors: texts.map(() => [1]) }), model: () => '', chatKey: () => 'c' });
    const noModelResult = await noModel.sync({ entries: [{ id: 'm1', text: '正文' }] });
    assert.equal(noModelResult.embedded, 0, '没模型名不干活');
    const supersededOnly = createMemoryVectorIndex({ store: createMemoryVectorStore({}), embed: async texts => ({ model: 'e1', vectors: texts.map(() => [1]) }), model: () => 'e1', chatKey: () => 'c' });
    const skipped = await supersededOnly.sync({ entries: [{ id: 'm9', text: '旧账', supersededBy: 'm10' }] });
    assert.equal(skipped.embedded, 0, '被覆盖的旧账不嵌');
    assert.deepEqual(await supersededOnly.stats({}), { total: 0, embedded: 0, model: 'e1' });
}

console.log('memory vectors tests passed');
