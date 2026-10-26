import assert from 'node:assert/strict';
import {
    buildInterpretPrompt,
    createLlmClient,
    extractJson,
    normalizeInterpretation,
} from './llm-client.js';

assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
assert.deepEqual(extractJson('前情提要 {"a":2} 后记'), { a: 2 });
assert.throws(() => extractJson('没有 JSON'), /模型没有返回 JSON 对象/);
assert.throws(() => extractJson(''), /模型没有返回内容/);
assert.throws(() => extractJson('{坏 json}'), /无法解析/);

const allowedFields = [
    { targetId: 'player', field: 'hp', type: 'number' },
    { targetId: 'player', field: 'realm', type: 'string' },
    { targetId: 'world', field: 'day', type: 'number' },
];
const normalized = normalizeInterpretation({
    type: 'explicit_action',
    task: 'explicit_action',
    explicitAction: true,
    confidence: 0.8,
    playerAction: { targetId: 'player', method: '修炼' },
    effects: [
        { targetId: 'player', field: 'hp', type: 'add', value: '-10', reason: '受伤' },
        { targetId: 'player', field: 'luck', type: 'set', value: 5 },
        { targetId: 'player', field: 'hp', type: 'set', value: '很多' },
    ],
    ambiguities: ['', '要不要'],
    days: 999,
}, { allowedFields });
assert.equal(normalized.type, 'explicit_action');
assert.equal(normalized.explicitAction, true);
assert.deepEqual(normalized.playerAction, { targetId: 'player', method: '修炼' });
assert.equal(normalized.effects.length, 1, '只保留已登记且类型正确的写入');
assert.equal(normalized.effects[0].value, -10);
assert.equal(normalized.rejectedEffects, 2);
assert.deepEqual(normalized.ambiguities, ['要不要']);
assert.equal(normalized.days, 365);
assert.equal(normalizeInterpretation({ type: '随便' }, {}).type, 'unclear');
assert.equal(normalizeInterpretation(null, {}).task, 'unclear');

const many = normalizeInterpretation({
    effects: Array.from({ length: 10 }, () => ({ targetId: 'player', field: 'hp', type: 'add', value: 1 })),
}, { allowedFields, maxEffects: 8 });
assert.equal(many.effects.length, 8);
assert.equal(many.rejectedEffects, 2);

assert.match(buildInterpretPrompt({ input: '我要修炼', state: { player: { hp: 100 } }, allowedFields }), /player\.hp（number，当前 100/);
assert.match(buildInterpretPrompt({ input: '我要修炼', allowedFields: [] }), /没有可用字段/);

let seenPrompt = '';
let seenSchema = null;
const fakeContext = {
    async generateQuietPrompt(options) {
        // 文档签名是对象形式；字符串形式只为兼容旧桩，两者都要认。
        seenPrompt = typeof options === 'string' ? options : options?.quietPrompt ?? '';
        seenSchema = typeof options === 'object' && options !== null ? options.jsonSchema ?? null : null;
        return '```json\n{"type":"explicit_action","task":"explicit_action","explicitAction":true,"playerAction":{"targetId":"player","method":"修炼"},"effects":[{"targetId":"player","field":"hp","type":"add","value":5}]}\n```';
    },
};
const viaTavern = createLlmClient({
    getSettings: () => ({ llm: { useSillyTavernConnection: true, timeoutMs: 5000 } }),
    getContext: () => fakeContext,
});
assert.equal(viaTavern.configured(), true);
const interpreted = await viaTavern.interpret({ input: '我要修炼', state: {}, allowedFields });
assert.match(seenPrompt, /玩家消息：我要修炼/);
assert.equal(interpreted.effects[0].value, 5);

const calls = [];
const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"text":"你盘膝坐下，斗气缓缓流动。","claims":[]}' } }] }) };
};
const viaEndpoint = createLlmClient({
    getSettings: () => ({ llm: { useSillyTavernConnection: false, baseUrl: 'https://api.example.com/v1/', apiKey: 'sk-x', model: 'demo-model' } }),
    getContext: () => null,
    fetchImpl: fakeFetch,
});
const composed = await viaEndpoint.compose({ input: '我要修炼', facts: [], changes: [], state: {}, outcome: '修炼了一会儿' });
assert.equal(composed.text, '你盘膝坐下，斗气缓缓流动。');
assert.equal(calls[0].url, 'https://api.example.com/v1/chat/completions');
assert.equal(calls[0].options.headers.authorization, 'Bearer sk-x');
const body = JSON.parse(calls[0].options.body);
assert.equal(body.model, 'demo-model');
assert.equal(body.messages.length, 2);

const plainText = createLlmClient({
    getSettings: () => ({ llm: { useSillyTavernConnection: false, baseUrl: 'https://api.example.com/v1', model: 'demo-model' } }),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '  你站在院子里，风有点凉。  ' } }] }) }),
});
const fallback = await plainText.compose({ input: '我看看四周' });
assert.equal(fallback.text, '你站在院子里，风有点凉。');
assert.deepEqual(fallback.claims, []);

const failing = createLlmClient({
    getSettings: () => ({ llm: { useSillyTavernConnection: false, baseUrl: 'https://api.example.com/v1', model: 'demo-model' } }),
    fetchImpl: async () => ({ ok: false, status: 401 }),
});
await assert.rejects(() => failing.compose({ input: '你好' }), /HTTP 401/);

const unconfigured = createLlmClient({ getSettings: () => ({ llm: {} }), getContext: () => null });
assert.equal(unconfigured.configured(), false);
await assert.rejects(() => unconfigured.interpret({ input: '你好' }), /模型连接未配置/);
console.log('llm client tests passed');
