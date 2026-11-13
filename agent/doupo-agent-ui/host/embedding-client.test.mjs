import assert from 'node:assert/strict';
import { createEmbeddingClient, embeddingsEndpoint } from './embedding-client.js';

// 1. 端点地址约定：/v1 结尾直接拼 /embeddings，否则补 /v1
assert.equal(embeddingsEndpoint('https://a.com/v1'), 'https://a.com/v1/embeddings');
assert.equal(embeddingsEndpoint('https://a.com/v2/'), 'https://a.com/v2/embeddings');
assert.equal(embeddingsEndpoint('https://a.com'), 'https://a.com/v1/embeddings');
assert.equal(embeddingsEndpoint('https://a.com/'), 'https://a.com/v1/embeddings');
assert.equal(embeddingsEndpoint(''), '');

// 2. 就绪判定：开关 + 地址 + 模型名齐了才算（密钥可选）
const ready = { enabled: true, baseUrl: 'https://a.com/v1', apiKey: 'sekret', model: 'emb-1' };
assert.equal(createEmbeddingClient({ getSettings: () => ready }).available(), true);
assert.equal(createEmbeddingClient({ getSettings: () => ({ enabled: false, baseUrl: 'x', model: 'y' }) }).available(), false, '开关没开不算就绪');
assert.equal(createEmbeddingClient({ getSettings: () => ({ enabled: true, model: 'y' }) }).available(), false, '缺地址不算就绪');
assert.equal(createEmbeddingClient({ getSettings: () => ({ enabled: true, baseUrl: 'x' }) }).available(), false, '缺模型不算就绪');
assert.equal(createEmbeddingClient({ getSettings: () => ({ enabled: true, baseUrl: 'x', model: '' }) }).available(), false, '空模型不算就绪');
assert.equal(createEmbeddingClient({ getSettings: () => ready }).model(), 'emb-1');

// 3. embed：请求形状、鉴权、分批、向量对齐
{
    const calls = [];
    const fetchImpl = async (url, init) => {
        const body = JSON.parse(init.body);
        calls.push({ url, body, headers: init.headers });
        return { ok: true, json: async () => ({ data: body.input.map((input, index) => ({ index, embedding: [input.length, index] })) }) };
    };
    const client = createEmbeddingClient({ getSettings: () => ready, fetchImpl });
    const texts = Array.from({ length: 35 }, (_, i) => `文本${i}甲乙`);
    const { model, vectors } = await client.embed(texts);
    assert.equal(model, 'emb-1');
    assert.equal(vectors.length, 35, '向量与输入一一对齐');
    assert.equal(calls.length, 3, '35 条按 16 一批分 3 次请求');
    assert.deepEqual(calls.map(call => call.body.input.length), [16, 16, 3]);
    for (const call of calls) {
        assert.equal(call.url, 'https://a.com/v1/embeddings');
        assert.equal(call.body.model, 'emb-1');
        assert.equal(call.headers.authorization, 'Bearer sekret', '带密钥走 Bearer');
    }
    assert.deepEqual(vectors[34], [texts[34].length, 2], '第三批向量归位正确');
    // 无密钥不带鉴权头
    const callsNoKey = [];
    const noKey = createEmbeddingClient({
        getSettings: () => ({ ...ready, apiKey: '' }),
        fetchImpl: async (url, init) => { callsNoKey.push(init.headers); return { ok: true, json: async () => ({ data: [{ index: 0, embedding: [1] }] }) }; },
    });
    await noKey.embed(['甲']);
    assert.equal('authorization' in callsNoKey[0], false, '没密钥就不带鉴权头');
    // index 乱序返回也要归位
    const scrambled = createEmbeddingClient({
        getSettings: () => ready,
        fetchImpl: async (url, init) => {
            const input = JSON.parse(init.body).input;
            return { ok: true, json: async () => ({ data: input.map((input2, index) => ({ index: input.length - 1 - index, embedding: [index] })).reverse() }) };
        },
    });
    const reordered = await scrambled.embed(['甲', '乙', '丙']);
    assert.deepEqual(reordered.vectors, [[2], [1], [0]], '乱序 index 按位归位');
}

// 4. 空输入不发请求；未配置直接报错
{
    let called = 0;
    const client = createEmbeddingClient({ getSettings: () => ready, fetchImpl: async () => { called += 1; return { ok: true, json: async () => ({ data: [] }) }; } });
    const empty = await client.embed(['  ', '', null]);
    assert.deepEqual(empty.vectors, [], '全空输入返回空向量');
    assert.equal(called, 0, '空输入不发请求');
    await assert.rejects(
        () => createEmbeddingClient({ getSettings: () => ({ enabled: false }) }).embed(['甲']),
        /未配置/,
        '没配置就调用要报错',
    );
}

// 5. 失败路径：HTTP 错误、响应缺 data、向量数不一致、超时中止
{
    const httpFail = createEmbeddingClient({ getSettings: () => ready, fetchImpl: async () => ({ ok: false, status: 500 }) });
    await assert.rejects(() => httpFail.embed(['甲']), /HTTP 500/);
    const noData = createEmbeddingClient({ getSettings: () => ready, fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
    await assert.rejects(() => noData.embed(['甲']), /data/);
    const mismatch = createEmbeddingClient({ getSettings: () => ready, fetchImpl: async () => ({ ok: true, json: async () => ({ data: [{ index: 0, embedding: [1] }] }) }) });
    await assert.rejects(() => mismatch.embed(['甲', '乙']), /数量与输入不一致/);
    const slow = createEmbeddingClient({
        getSettings: () => ready,
        fetchImpl: (url, init) => new Promise((resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
        timeoutMs: 20,
    });
    await assert.rejects(() => slow.embed(['甲']), /超时/, '超时要中止并报错');
}

console.log('embedding client tests passed');
