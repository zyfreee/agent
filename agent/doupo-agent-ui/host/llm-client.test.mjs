import assert from 'node:assert/strict';
import {
    buildAdjudicatePrompt,
    buildInterpretPrompt,
    createLlmClient,
    extractJson,
    listModels,
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

// —— 静默飞行标志：酒馆连接调用期间 isQuietBusy 必须为真，收尾后（含事件缓冲）回落 ——
const busySamples = [];
const slowContext = {
    async generateQuietPrompt() {
        busySamples.push(quietClient.isQuietBusy());
        await new Promise(resolve => setTimeout(resolve, 20));
        busySamples.push(quietClient.isQuietBusy());
        return 'ok';
    },
};
const quietClient = createLlmClient({
    getSettings: () => ({ llm: { useSillyTavernConnection: true, timeoutMs: 5000 } }),
    getContext: () => slowContext,
});
assert.equal(quietClient.isQuietBusy(), false, '起飞前标志必须为假');
await quietClient.complete({ system: 's', user: 'u' });
assert.deepEqual(busySamples, [true, true], '调用全程标志为真');
await new Promise(resolve => setTimeout(resolve, 700));
assert.equal(quietClient.isQuietBusy(), false, '收尾加事件缓冲后标志回落');

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

// —— Anthropic 兼容接口：/v1/messages、x-api-key 鉴权、system 独立字段、content 数组拼接 ——
const anthropicCalls = [];
const anthropic = createLlmClient({
    getSettings: () => ({ llm: { mode: 'custom', provider: 'anthropic', baseUrl: 'https://api.anthropic.com/v1/', apiKey: 'ak-x', model: 'claude-demo', temperature: 0.3, maxTokens: 1024 } }),
    getContext: () => null,
    fetchImpl: async (url, options) => {
        anthropicCalls.push({ url, options });
        return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '{"note":"n",' }, { type: 'text', text: '"ops":[]}' }] }) };
    },
});
const anthropicReply = await anthropic.complete({ system: '只输出 JSON', user: '决定世界变化' });
assert.equal(anthropicCalls[0].url, 'https://api.anthropic.com/v1/messages', 'baseUrl 已带 /v1 时不再重复追加');
assert.equal(anthropicCalls[0].options.headers['x-api-key'], 'ak-x');
assert.equal(anthropicCalls[0].options.headers['anthropic-version'], '2023-06-01');
assert.equal(anthropicCalls[0].options.headers.authorization, undefined, 'Anthropic 不用 Bearer');
const anthropicBody = JSON.parse(anthropicCalls[0].options.body);
assert.equal(anthropicBody.model, 'claude-demo');
assert.equal(anthropicBody.system, '只输出 JSON');
assert.equal(anthropicBody.max_tokens, 1024);
assert.equal(anthropicBody.messages.length, 1, 'system 不进 messages');
assert.equal(anthropicReply, '{"note":"n","ops":[]}', 'content 文本块按序拼接');
// baseUrl 不带 /v1 时自动补
await anthropic.complete({ system: 's', user: 'u' });
assert.equal(anthropicCalls[1].url, 'https://api.anthropic.com/v1/messages');

const unconfigured = createLlmClient({ getSettings: () => ({ llm: {} }), getContext: () => null });
assert.equal(unconfigured.configured(), false);
await assert.rejects(() => unconfigured.interpret({ input: '你好' }), /模型连接未配置/);

// —— 类别判定：category 透传、adjudicateAction 复用行动单校验、提示词带类别与初步提议 ——
const categorized = normalizeInterpretation({ type: 'explicit_action', task: 'explicit_action', category: 'alchemy', effects: [] }, { allowedFields });
assert.equal(categorized.category, 'alchemy');
assert.equal(normalizeInterpretation({}, { allowedFields }).category, '');
assert.ok(buildInterpretPrompt({ input: '测试', state: {}, allowedFields }).includes('"category":"alchemy=丹药相关'), 'interpret 提示词要交代 category 取值');
const withCustom = buildInterpretPrompt({ input: '测试', state: {}, allowedFields, categories: [{ id: 'cabc1', name: '炼器判定' }, { id: '', name: '坏条目' }] });
assert.ok(withCustom.includes('cabc1=炼器判定'), '自定义判定要进 interpret 提示词');
assert.ok(withCustom.includes('搭不上才填 general'), '自定义类别要交代兜底规则');
assert.ok(!withCustom.includes('坏条目'), '不完整的自定义条目不进提示词');
assert.ok(!buildInterpretPrompt({ input: '测试', state: {}, allowedFields }).includes('自定义判定类别'), '没有自定义判定时不加那行');
const adjudicatePrompt = buildAdjudicatePrompt({
    categoryLabel: '丹药判定',
    input: '我服下回气丹',
    state: { player: { douqi: 87 } },
    allowedFields,
    preliminary: [{ targetId: 'player', field: 'hp', type: 'add', value: -10, reason: '误判' }],
});
assert.ok(adjudicatePrompt.includes('判定类别：丹药判定'));
assert.ok(adjudicatePrompt.includes('初步提议'));
assert.ok(adjudicatePrompt.includes('player.hp（number，当前 未设定'), '字段表要带当前值');
const adjudicateCalls = [];
const adjudicateFields = [
    { targetId: 'player', field: 'douqi', type: 'number' },
    { targetId: 'player', field: 'realm', type: 'string' },
];
const adjudicating = createLlmClient({
    getSettings: () => ({ llm: { mode: 'custom', baseUrl: 'https://api.example.com/v1', model: 'm1' } }),
    getContext: () => null,
    fetchImpl: async (url, options) => {
        adjudicateCalls.push({ url, options, body: JSON.parse(options.body) });
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"effects":[{"targetId":"player","field":"douqi","type":"add","value":30,"reason":"回气丹"}],"outcome":"斗气提升"}' } }] }) };
    },
});
const decided = await adjudicating.adjudicateAction({
    system: '你是丹药判定器。只输出 JSON。',
    categoryLabel: '丹药判定',
    input: '我服下回气丹',
    state: { player: { douqi: 87 } },
    allowedFields: adjudicateFields,
    preliminary: [],
    overrides: { temperature: 0.2, maxTokens: 512 },
});
assert.deepEqual(decided.effects, [{ targetId: 'player', field: 'douqi', type: 'add', value: 30, allowNegative: false, reason: '回气丹' }]);
assert.equal(decided.outcome, '斗气提升');
assert.equal(adjudicateCalls[0].body.temperature, 0.2, '结算覆盖温度生效');
assert.equal(adjudicateCalls[0].body.max_tokens, 512);
assert.equal(adjudicateCalls[0].body.messages[0].content, '你是丹药判定器。只输出 JSON。');
await assert.rejects(() => adjudicating.adjudicateAction({ system: '', input: 'x' }), /缺少类别判定提示词/);

// —— 单次调用的连接覆盖：记录员/场记可以一个跟随酒馆、一个走自定义接口 ——
const forcedCalls = [];
const forced = createLlmClient({
    getSettings: () => ({ llm: { mode: 'tavern', baseUrl: 'https://api.example.com/v1', apiKey: 'k', model: 'global-model', temperature: 0.9 } }),
    getContext: () => ({ generateQuietPrompt: async () => 'from-tavern' }),
    fetchImpl: async (url, options) => {
        forcedCalls.push({ url, body: JSON.parse(options.body) });
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'from-custom' } }] }) };
    },
});
assert.equal(await forced.complete({ system: 's', user: 'u', overrides: { connection: 'tavern' } }), 'from-tavern', '按酒馆走时不碰自定义接口');
assert.equal(await forced.complete({ system: 's', user: 'u', overrides: { connection: 'custom', model: 'impact-model' } }), 'from-custom', '单次调用可强制走自定义接口');
assert.equal(forcedCalls[0].body.model, 'impact-model');
assert.equal(forcedCalls[0].body.temperature, 0.9, '自定义分支沿用全局温度');

const noEndpoint = createLlmClient({
    getSettings: () => ({ llm: { mode: 'tavern' } }),
    getContext: () => ({ generateQuietPrompt: async () => 'x' }),
});
await assert.rejects(
    () => noEndpoint.complete({ system: 's', user: 'u', overrides: { connection: 'custom', model: 'only-model' } }),
    /自定义模型还没配好/,
);
await assert.rejects(
    () => noEndpoint.complete({ system: 's', user: 'u', overrides: { connection: 'custom', model: 'only-model' } }),
    error => error.code === 'llm_custom_not_configured',
    '自定义连接没配好时要用专属错误码，页面才能给出准确提示',
);

// —— 每次调用自带接口参数：记录员/场记各填各的地址和模型，互不干扰 ——
const ownCalls = [];
const own = createLlmClient({
    getSettings: () => ({ llm: { mode: 'tavern', baseUrl: 'https://global.example/v1', apiKey: 'global-key', model: 'global-model' } }),
    getContext: () => ({ generateQuietPrompt: async () => 'from-tavern' }),
    fetchImpl: async (url, options) => {
        ownCalls.push({ url, headers: options.headers, body: JSON.parse(options.body) });
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'from-own' } }] }) };
    },
});
assert.equal(await own.complete({
    system: 's', user: 'u',
    overrides: { connection: 'custom', model: 'recorder-model', custom: { baseUrl: 'https://own.example/v1/', apiKey: 'own-key', provider: 'openai' } },
}), 'from-own');
assert.equal(ownCalls[0].url, 'https://own.example/v1/chat/completions');
assert.equal(ownCalls[0].body.model, 'recorder-model');
assert.equal(ownCalls[0].headers.authorization, 'Bearer own-key');

// 只给了地址没给密钥：密钥沿用全局，地址用这一次的。
await own.complete({
    system: 's', user: 'u',
    overrides: { connection: 'custom', model: 'picker-model', custom: { baseUrl: 'https://picker.example/v1' } },
});
assert.equal(ownCalls[1].url, 'https://picker.example/v1/chat/completions');
assert.equal(ownCalls[1].headers.authorization, 'Bearer global-key');
assert.equal(ownCalls[1].body.model, 'picker-model');

// —— 拉取模型清单：填了地址就能列出来，省得手抄模型名 ——
const modelCalls = [];
const listed = await listModels({
    baseUrl: 'https://api.example.com/v1/',
    apiKey: 'sk-model',
    fetchImpl: async (url, options) => {
        modelCalls.push({ url, headers: options.headers });
        return { ok: true, status: 200, json: async () => ({ data: [{ id: 'model-a' }, { id: 'model-b' }] }) };
    },
});
assert.equal(listed.status, 'ok');
assert.deepEqual(listed.models, ['model-a', 'model-b']);
assert.equal(modelCalls[0].url, 'https://api.example.com/v1/models', '地址已经带 /v1 时不再重复拼');
assert.equal(modelCalls[0].headers.authorization, 'Bearer sk-model');

const anthropicList = await listModels({
    baseUrl: 'https://api.anthropic.com',
    apiKey: 'ak-model',
    provider: 'anthropic',
    fetchImpl: async (url, options) => {
        modelCalls.push({ url, headers: options.headers });
        return { ok: true, status: 200, json: async () => ({ models: [{ id: 'claude-a' }] }) };
    },
});
assert.equal(anthropicList.models[0], 'claude-a');
assert.equal(modelCalls[1].url, 'https://api.anthropic.com/v1/models');
assert.equal(modelCalls[1].headers['x-api-key'], 'ak-model');
assert.equal(modelCalls[1].headers['anthropic-version'], '2023-06-01');

assert.equal((await listModels({ baseUrl: '' })).status, 'no_endpoint');
const refused = await listModels({
    baseUrl: 'https://api.example.com/v1',
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }),
});
assert.equal(refused.status, 'failed');
assert.match(refused.error, /401/);
// —— 生成参数：跟随酒馆时临时改它的聊天补全采样设置、用完还原；自定义时写进请求体 ——
const tavernSettings = { temp_openai: 0.8, top_p_openai: 0.95, pres_pen_openai: 0.1, freq_pen_openai: 0.2, openai_max_tokens: 1024 };
let seenSampling = null;
let seenResponseLength = null;
const samplingContext = {
    mainApi: 'openai',
    chatCompletionSettings: tavernSettings,
    async generateQuietPrompt(options) {
        seenSampling = {
            temperature: tavernSettings.temp_openai,
            topP: tavernSettings.top_p_openai,
            presence: tavernSettings.pres_pen_openai,
            frequency: tavernSettings.freq_pen_openai,
        };
        seenResponseLength = options?.responseLength ?? null;
        return 'ok';
    },
};
const samplingClient = createLlmClient({
    getSettings: () => ({ llm: { mode: 'tavern' } }),
    getContext: () => samplingContext,
});
await samplingClient.complete({
    system: 's', user: 'u',
    overrides: { connection: 'tavern', temperature: 0.3, topP: 0.6, presencePenalty: 0.4, frequencyPenalty: 0.5, maxTokens: 256 },
});
assert.deepEqual(seenSampling, { temperature: 0.3, topP: 0.6, presence: 0.4, frequency: 0.5 }, '跟随酒馆时这一轮临时改采样参数');
assert.equal(seenResponseLength, 256, '跟随酒馆时用 responseLength 临时覆盖输出长度');
assert.deepEqual(tavernSettings, { temp_openai: 0.8, top_p_openai: 0.95, pres_pen_openai: 0.1, freq_pen_openai: 0.2, openai_max_tokens: 1024 }, '生成结束后把酒馆设置原样还原');

// 0 / 留空 = 不指定：不碰酒馆设置
await samplingClient.complete({ system: 's', user: 'u', overrides: { connection: 'tavern', temperature: 0, maxTokens: 0 } });
assert.equal(seenSampling.temperature, 0.8);
assert.equal(seenResponseLength, null, '没指定输出长度就不覆盖');

// 文本补全没有单次采样入口：只传输出长度，不动设置对象
const textgenSettings = { temp_openai: 0.8 };
let textgenTouched = false;
const textgenContext = {
    mainApi: 'textgenerationwebui',
    chatCompletionSettings: new Proxy(textgenSettings, { set() { textgenTouched = true; return true; } }),
    async generateQuietPrompt() { return 'ok'; },
};
const textgenClient = createLlmClient({ getSettings: () => ({ llm: { mode: 'tavern' } }), getContext: () => textgenContext });
await textgenClient.complete({ system: 's', user: 'u', overrides: { connection: 'tavern', temperature: 0.3, topP: 0.6 } });
assert.equal(textgenTouched, false, '文本补全下不去改聊天补全设置');

const paramCalls = [];
const paramClient = createLlmClient({
    getSettings: () => ({ llm: { mode: 'tavern' } }),
    getContext: () => ({ generateQuietPrompt: async () => 'tavern' }),
    fetchImpl: async (url, options) => {
        paramCalls.push(JSON.parse(options.body));
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
    },
});
await paramClient.complete({
    system: 's', user: 'u',
    overrides: {
        connection: 'custom', model: 'm',
        custom: { baseUrl: 'https://p.example/v1' },
        temperature: 0.25, topP: 0.7, presencePenalty: 0.3, frequencyPenalty: 0.15, maxTokens: 300,
    },
});
assert.equal(paramCalls[0].temperature, 0.25);
assert.equal(paramCalls[0].top_p, 0.7);
assert.equal(paramCalls[0].presence_penalty, 0.3);
assert.equal(paramCalls[0].frequency_penalty, 0.15);
assert.equal(paramCalls[0].max_tokens, 300);

// —— 全局采样兜底：自定义接口调用没指定 top_p/惩罚时用“模型与连接”页的值；0 ＝不指定 ——
const globalSamplingCalls = [];
const globalSamplingClient = createLlmClient({
    getSettings: () => ({ llm: { mode: 'custom', baseUrl: 'https://api.example.com/v1', model: 'm1', topP: 0.9, presencePenalty: 0, frequencyPenalty: -0.5 } }),
    getContext: () => null,
    fetchImpl: async (url, options) => {
        globalSamplingCalls.push(JSON.parse(options.body));
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
    },
});
await globalSamplingClient.complete({ system: 's', user: 'u' });
assert.equal(globalSamplingCalls[0].top_p, 0.9, '全局 top_p 兜底生效');
assert.equal(globalSamplingCalls[0].presence_penalty, undefined, '存在惩罚 0 ＝不指定');
assert.equal(globalSamplingCalls[0].frequency_penalty, -0.5, '负数频率惩罚可用');
await globalSamplingClient.complete({ system: 's', user: 'u', overrides: { topP: 0.5 } });
assert.equal(globalSamplingCalls[1].top_p, 0.5, '单次覆盖优先于全局兜底');

console.log('llm client tests passed');
