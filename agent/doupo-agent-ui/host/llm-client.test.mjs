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

// 独立裁判不套主聊天预设，沿用同一酒馆连接和静默生命周期标记。
let rawOptions;
const isolated = createLlmClient({
    getSettings: () => ({ llm: { mode: 'tavern', timeoutMs: 5000 } }),
    getContext: () => ({
        generateQuietPrompt() { throw new Error('裁判不应走角色预设'); },
        generateRaw(options) { rawOptions = options; assert.equal(isolated.isQuietBusy(), true); return '{"version":2,"actions":[]}'; },
    }),
});
assert.equal(await isolated.complete({ rawPrompt: true, system: '裁判规则', user: '本轮行动' }), '{"version":2,"actions":[]}');
assert.deepEqual(rawOptions.prompt, [{ role: 'system', content: '裁判规则' }, { role: 'user', content: '本轮行动' }]);
assert.equal(rawOptions.quietToLoud, false);
assert.equal(rawOptions.trimNames, false);
assert.equal(isolated.isQuietBusy(), false);
await assert.rejects(() => viaTavern.complete({ rawPrompt: true, system: 's', user: 'u' }), /generateRaw/);

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

// —— 回归：设置页写明 baseUrl 等 custom 字段“选自定义才用得上”，跟随酒馆时残留的地址不得劫持连接 ——
const leftoverCalls = [];
const leftover = createLlmClient({
    getSettings: () => ({ llm: { mode: 'tavern', model: 'global-model' } }),
    getContext: () => ({ generateQuietPrompt: async () => 'from-tavern' }),
    fetchImpl: async (url, options) => {
        leftoverCalls.push({ url, body: JSON.parse(options.body) });
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'from-leftover' } }] }) };
    },
});
assert.equal(
    await leftover.complete({
        system: 's',
        user: 'u',
        overrides: { connection: 'tavern', custom: { baseUrl: 'https://api.leftover.example/v1', apiKey: 'sk-leftover', model: 'leftover-model' } },
    }),
    'from-tavern',
    '跟随酒馆时残留的自定义地址不能把调用劫持去自定义端点',
);
assert.equal(leftoverCalls.length, 0, '劫持路径一次都不该发起');

// —— 调用体检：complete 记成功/失败/报错/耗时/模型；错误原样上抛；只记元数据，密钥永不进日志 ——
{
    let hits = 0;
    const probed = createLlmClient({
        getSettings: () => ({ llm: { mode: 'custom', baseUrl: 'https://api.example/v1', apiKey: 'sk-secret', model: 'm1' } }),
        fetchImpl: async () => {
            hits += 1;
            if (hits === 1) return { ok: false, status: 503 };
            return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok-reply' } }] }) };
        },
    });
    await assert.rejects(probed.complete({ system: 's', user: 'u', label: '试验一' }), /HTTP 503/, '失败要原样上抛');
    assert.equal(await probed.complete({ system: 's', user: 'u', overrides: { model: 'm2' }, label: '试验二' }), 'ok-reply');
    const log = probed.callLog();
    assert.equal(log.length, 2);
    assert.equal(log[0].label, '试验一');
    assert.equal(log[0].ok, false);
    assert.match(log[0].error, /503/);
    assert.equal(log[0].model, 'm1');
    assert.equal(log[1].ok, true);
    assert.equal(log[1].chars, 'ok-reply'.length);
    assert.equal(log[1].model, 'm2', '单次覆盖的模型要署名');
    assert.ok(Number.isFinite(log[1].ms) && log[1].ms >= 0);
    const flat = JSON.stringify(log);
    assert.ok(!flat.includes('sk-secret'), '体检记录绝不带密钥');
    assert.ok(!flat.includes('提示词'), '只记元数据，不记提示词');
    await probed.complete({ system: 's', user: 'u' });
    assert.equal(probed.callLog().at(-1).label, '未标注调用', '没报 label 的记成未标注');
    probed.clearCallLog();
    assert.equal(probed.callLog().length, 0, '清零后日志为空');
}

// —— 失败详情：HTTP 错误读响应体提真实原因，密钥打码，状态/端点/响应片段进体检条目 ——
{
    const detail = createLlmClient({
        getSettings: () => ({ llm: { mode: 'custom', baseUrl: 'https://api.example/v1', apiKey: 'sk-secret', model: 'm1' } }),
        fetchImpl: async () => ({
            ok: false, status: 400,
            text: async () => JSON.stringify({ error: { message: 'Invalid model id: gpt-x, key sk-secret leaked back' } }),
        }),
    });
    await assert.rejects(detail.complete({ system: 's', user: 'u', label: '选条' }), /HTTP 400.*Invalid model id/, '错误文本带状态码与服务商真实原因');
    const entry = detail.callLog().at(-1);
    assert.equal(entry.status, 400, '结构化状态码进条目');
    assert.equal(entry.endpoint, 'https://api.example/v1/chat/completions', '端点进条目');
    assert.match(entry.body, /Invalid model id/);
    assert.ok(!entry.body.includes('sk-secret'), '响应体里的密钥打码');
    assert.ok(!JSON.stringify(detail.callLog()).includes('sk-secret'), '日志 JSON 绝不带明文密钥');
    assert.equal(entry.error.includes('***'), true, '错误文本里密钥同样打码');
}
{
    const plain = createLlmClient({
        getSettings: () => ({ llm: { mode: 'custom', baseUrl: 'https://api.example/v1' } }),
        fetchImpl: async () => ({ ok: false, status: 400, text: async () => 'bad gateway plain text' }),
    });
    await assert.rejects(
        plain.complete({ system: 's', user: 'u' }),
        /HTTP 400（POST https:\/\/api\.example\/v1\/chat\/completions）：bad gateway plain text/,
        '非 JSON 响应体用原文片段当原因',
    );
}
{
    // 酒馆路径：ST 只抛裸错误，扩展拿不到状态码与响应体；条目至少标出走的哪条连接
    const tavern = createLlmClient({
        getSettings: () => ({ llm: { mode: 'tavern' } }),
        getContext: () => ({ generateQuietPrompt: async () => { throw new Error('Bad Request'); } }),
    });
    await assert.rejects(tavern.complete({ system: 's', user: 'u', label: '世界决定' }), /Bad Request/, '酒馆路径错误文本原样上抛');
    const entry = tavern.callLog().at(-1);
    assert.equal(entry.endpoint, '酒馆连接', '酒馆路径条目标出走的连接');
    assert.equal(entry.status, null, '酒馆路径拿不到状态码');
    assert.equal(entry.body, '', '酒馆路径没有响应体详情');
}

// —— 在途跟踪：调用中 activeLabels 必须有它，收尾（成功/失败都算）注销；onActivity 播报起飞/落地 ——
{
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let activeDuringCall = null;
    const events = [];
    const tracked = createLlmClient({
        getSettings: () => ({ llm: { mode: 'custom', baseUrl: 'https://api.example/v1', apiKey: 'sk-secret', model: 'm1' } }),
        fetchImpl: async () => {
            activeDuringCall = [...tracked.activeLabels()];
            await gate;
            return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'done' } }] }) };
        },
    });
    tracked.onActivity(event => events.push(`${event.label}:${event.phase}`));
    assert.equal(tracked.activeLabels().length, 0, '起飞前没有在途调用');
    const pending = tracked.complete({ system: 's', user: 'u', label: '纳戒决定' });
    await Promise.resolve();
    assert.deepEqual(activeDuringCall, ['纳戒决定'], '调用中 label 必须在途');
    assert.equal(tracked.activeLabels().length, 1);
    release();
    assert.equal(await pending, 'done');
    assert.equal(tracked.activeLabels().length, 0, '收尾后注销');
    assert.deepEqual(events, ['纳戒决定:start', '纳戒决定:end'], '活动回调按序播报起飞与落地');

    const failEvents = [];
    const failing = createLlmClient({
        getSettings: () => ({ llm: { mode: 'custom', baseUrl: 'https://api.example/v1', apiKey: 'sk-secret', model: 'm1' } }),
        fetchImpl: async () => ({ ok: false, status: 500 }),
    });
    failing.onActivity(event => failEvents.push(event.phase));
    await assert.rejects(failing.complete({ system: 's', user: 'u', label: '世界决定' }), /HTTP 500/, '失败原样上抛');
    assert.deepEqual(failEvents, ['start', 'end'], '失败也要落地注销，不能把 label 卡死在在途表里');
    assert.equal(failing.activeLabels().length, 0, '失败后在途表为空');

    const off = tracked.onActivity(() => { throw new Error('监听器炸了也不许影响调用'); });
    assert.equal(await tracked.complete({ system: 's', user: 'u', label: '记忆决定' }), 'done', '监听器抛错被吞掉，调用照常');
    off();
}

// —— 全局统管：开关一开，扩展发起的所有调用（含跟随酒馆、含各功能自带自定义）都走全局连接 ——
{
    const hits = [];
    const governed = createLlmClient({
        getSettings: () => ({ llm: { mode: 'custom', baseUrl: 'https://global.example/v1', apiKey: 'sk-global', model: 'global-model', governAll: true } }),
        fetchImpl: async (url, options) => {
            hits.push({ url, body: JSON.parse(options.body) });
            return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
        },
    });
    await governed.complete({ system: 's', user: 'u', overrides: { connection: 'tavern' } });
    await governed.complete({ system: 's', user: 'u', overrides: { connection: 'custom', custom: { baseUrl: 'https://other.example/v1', apiKey: 'sk-other', model: 'other-model' } } });
    assert.equal(hits.length, 2, '两次调用都该发出');
    for (const hit of hits) {
        assert.ok(hit.url.startsWith('https://global.example/v1'), `统管后应走全局地址：${hit.url}`);
        assert.equal(hit.body.model, 'global-model', '统管后模型应是全局模型');
    }
    const flat = JSON.stringify(hits);
    assert.ok(!flat.includes('other.example') && !flat.includes('sk-other'), '功能自带的连接在统管期间让位');
    // 全局没配齐（缺模型名）时按原逻辑走，不把人锁在门外
    const fallback = createLlmClient({
        getSettings: () => ({ llm: { mode: 'custom', baseUrl: 'https://global.example/v1', governAll: true } }),
        getContext: () => ({ generateQuietPrompt: async () => 'from-tavern' }),
    });
    assert.equal(await fallback.complete({ system: 's', user: 'u', overrides: { connection: 'tavern' } }), 'from-tavern', '全局没配齐应回落原逻辑');
}

// 全局统管不能把其他方案的模型、附加请求体或认证标头带到全局端点。
{
    let sent;
    const client = createLlmClient({
        getSettings: () => ({ llm: { mode: 'custom', governAll: true, baseUrl: 'https://global.example/v1', apiKey: 'global-only', model: 'global-model' } }),
        fetchImpl: async (url, options) => {
            sent = { url, headers: options.headers, body: JSON.parse(options.body) };
            return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
        },
    });
    await client.complete({ system: 's', user: 'u', overrides: { model: 'preset-model', extraBody: { model: 'extra-model' }, excludeBody: ['messages'], headers: { authorization: 'Bearer preset-only' } } });
    assert.equal(sent.body.model, 'global-model');
    assert.equal(sent.headers.authorization, 'Bearer global-only');
    assert.ok(Array.isArray(sent.body.messages));
}

// 自定义请求的截止时间与取消必须覆盖响应体读取，而不只等 HTTP 响应头。
{
    let fetchSignal;
    const client = createLlmClient({
        getSettings: () => ({ llm: { mode: 'custom', baseUrl: 'https://slow.example/v1', model: 'slow', timeoutMs: 1000 } }),
        fetchImpl: async (_url, options) => {
            fetchSignal = options.signal;
            return { ok: true, json: () => new Promise(() => {}) };
        },
    });
    const result = await Promise.race([
        client.complete({ system: 's', user: 'u' }).then(() => 'unexpected success', error => error.message),
        new Promise(resolve => setTimeout(() => resolve('body read never timed out'), 1500)),
    ]);
    assert.match(result, /超过 1 秒/);
    assert.equal(fetchSignal.aborted, true);
    const controller = new AbortController();
    const cancelled = client.complete({ system: 's', user: 'u', signal: controller.signal });
    await new Promise(resolve => setTimeout(resolve, 0));
    controller.abort();
    const cancellation = await Promise.race([cancelled.then(() => 'unexpected success', error => error.message), new Promise(resolve => setTimeout(() => resolve('body read ignored abort'), 100))]);
    assert.match(cancellation, /取消/);
}

// 「秒」版超时设置优先于老的毫秒字段：timeoutSec: 1 就该 1 秒掐断，不该被 timeoutMs 拖长。
{
    const client = createLlmClient({
        getSettings: () => ({ llm: { mode: 'custom', baseUrl: 'https://slow.example/v1', model: 'slow', timeoutSec: 1, timeoutMs: 999999 } }),
        fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }),
    });
    const result = await Promise.race([
        client.complete({ system: 's', user: 'u' }).then(() => 'unexpected success', error => error.message),
        new Promise(resolve => setTimeout(() => resolve('body read never timed out'), 1600)),
    ]);
    assert.match(result, /超过 1 秒/);
}

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

// —— 瞬时空返回重试：第一返回空、第二次成功 → complete 返回成功，日志只记一笔 ——
const retryCalls = [];
let emptyFirst = true;
const retryClient = createLlmClient({
    getSettings: () => ({ llm: { useSillyTavernConnection: false, baseUrl: 'https://api.example.com/v1', model: 'demo-model' } }),
    fetchImpl: async url => {
        retryCalls.push(url);
        const content = emptyFirst ? '' : '{"text":"重试后有了。","claims":[]}';
        emptyFirst = false;
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
    },
});
const retried = await retryClient.compose({ input: '我看看四周' });
assert.equal(retried.text, '重试后有了。', '空返回自动重试一次后成功');
assert.equal(retryCalls.length, 2, '空返回确实多问了一次');
const retryLog = retryClient.callLog().at(-1);
assert.equal(retryLog.ok, true, '重试成功记成功一笔');
assert.match(retryLog.error, /空回重试1次后成功/, '日志标注这是重试后成功');

// —— 两次都空才真失败；玩家取消不重试 ——
const alwaysEmpty = createLlmClient({
    getSettings: () => ({ llm: { useSillyTavernConnection: false, baseUrl: 'https://api.example.com/v1', model: 'demo-model' } }),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '' } }] }) }),
});
await assert.rejects(alwaysEmpty.complete({ system: 's', user: 'u' }), /模型返回内容为空/, '两次都空才上抛');
assert.equal(alwaysEmpty.callLog().at(-1).ok, false);

// —— 空回重试次数/间隔走设置（llm.emptyRetry / llm.emptyRetryWait），每次调用现读 ——
// 没填设置：按默认重试 1 次，共 2 发（默认间隔 0.6 秒）
let defaultEmptyCalls = 0;
const defaultRetryClient = createLlmClient({
    getSettings: () => ({ llm: { useSillyTavernConnection: false, baseUrl: 'https://api.example.com/v1', model: 'demo-model' } }),
    fetchImpl: async () => {
        defaultEmptyCalls += 1;
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '' } }] }) };
    },
});
await assert.rejects(defaultRetryClient.complete({ system: 's', user: 'u' }), /模型返回内容为空/);
assert.equal(defaultEmptyCalls, 2, '没填设置时空回按默认重试 1 次');

// 填 3、间隔 0.01 秒：一直空也连问 4 发——次数按设置直通，不设天花板
let tripleCalls = 0;
const tripleClient = createLlmClient({
    getSettings: () => ({ llm: { useSillyTavernConnection: false, baseUrl: 'https://api.example.com/v1', model: 'demo-model', emptyRetry: 3, emptyRetryWait: 0.01 } }),
    fetchImpl: async () => {
        tripleCalls += 1;
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '' } }] }) };
    },
});
await assert.rejects(tripleClient.complete({ system: 's', user: 'u' }), /模型返回内容为空/);
assert.equal(tripleCalls, 4, '空回重试 3 次共 4 发，间隔按秒换算');

// 填 2：第三发才给内容 → 成功，日志标注第 2 次重试后成功
const thirdCalls = [];
const thirdTryClient = createLlmClient({
    getSettings: () => ({ llm: { useSillyTavernConnection: false, baseUrl: 'https://api.example.com/v1', model: 'demo-model', emptyRetry: 2, emptyRetryWait: 0.01 } }),
    fetchImpl: async () => {
        thirdCalls.push(1);
        const content = thirdCalls.length >= 3 ? '第三次有了。' : '';
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
    },
});
assert.equal(await thirdTryClient.complete({ system: 's', user: 'u' }), '第三次有了。', '重试次数内拿到内容就成功');
assert.equal(thirdCalls.length, 3);
assert.match(thirdTryClient.callLog().at(-1).error, /空回重试2次后成功/, '日志标注第几次重试后成功');

// 填 0（清空输入框存的就是 0）：不重试，只发 1 发
let zeroCalls = 0;
const zeroRetryClient = createLlmClient({
    getSettings: () => ({ llm: { useSillyTavernConnection: false, baseUrl: 'https://api.example.com/v1', model: 'demo-model', emptyRetry: 0, emptyRetryWait: 0.01 } }),
    fetchImpl: async () => {
        zeroCalls += 1;
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '' } }] }) };
    },
});
await assert.rejects(zeroRetryClient.complete({ system: 's', user: 'u' }), /模型返回内容为空/);
assert.equal(zeroCalls, 1, '空回重试 0 次就是不重试');

// 非法次数（负数/小数）回落默认 1，间隔非法回落 0.6 秒
let invalidCalls = 0;
const invalidRetryClient = createLlmClient({
    getSettings: () => ({ llm: { useSillyTavernConnection: false, baseUrl: 'https://api.example.com/v1', model: 'demo-model', emptyRetry: -2, emptyRetryWait: -1 } }),
    fetchImpl: async () => {
        invalidCalls += 1;
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '' } }] }) };
    },
});
await assert.rejects(invalidRetryClient.complete({ system: 's', user: 'u' }), /模型返回内容为空/);
assert.equal(invalidCalls, 2, '负数次数/间隔回落默认（重试 1 次）');

// —— 附加参数（API设置方案带来）：extraBody 最后展开、excludeBody 删顶层键、headers 覆盖请求头 ——
// 顺序对齐酒馆服务端：先并进主体，再排除（能删掉附加进来的键），最后标头覆盖（可覆盖 authorization）。
const extrasCalls = [];
const extrasClient = createLlmClient({
    getSettings: () => ({ llm: { mode: 'custom', baseUrl: 'https://api.example.com/v1', apiKey: 'sk-x', model: 'demo-model', frequencyPenalty: 0.3, topP: 0.8 } }),
    fetchImpl: async (url, options) => {
        extrasCalls.push({ url, headers: options.headers, body: JSON.parse(options.body) });
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
    },
});
await extrasClient.complete({
    system: 's', user: 'u',
    overrides: {
        extraBody: { top_k: 20, injected: 'yes' },
        excludeBody: ['frequency_penalty', 'injected'],
        headers: { 'X-Gate': 'open', authorization: 'Bearer preset-key' },
    },
});
assert.equal(extrasCalls[0].body.top_k, 20, 'extraBody 并进请求体');
assert.equal(extrasCalls[0].body.injected, undefined, 'excludeBody 能删掉 extraBody 刚附加的键（酒馆同序：排除最后执行）');
assert.equal(extrasCalls[0].body.frequency_penalty, undefined, 'excludeBody 删掉标准采样字段');
assert.equal(extrasCalls[0].body.top_p, 0.8, '没被排除的标准字段保留');
assert.equal(extrasCalls[0].headers['X-Gate'], 'open', '方案标头并进请求头');
assert.equal(extrasCalls[0].headers.authorization, 'Bearer preset-key', '方案标头可覆盖 authorization（酒馆同语义）');
// 坏形状的附加参数直接忽略，不报错
await extrasClient.complete({ system: 's', user: 'u', overrides: { extraBody: 'junk', excludeBody: 'junk', headers: [1, 2] } });
assert.equal(extrasCalls[1].body.top_k, undefined, '坏形状 extraBody 忽略');
assert.equal(extrasCalls[1].headers['X-Gate'], undefined, '坏形状 headers 忽略');

// 跟随酒馆路径忽略附加参数（酒馆自己的管线没有这些落点），正常返回
const extrasTavern = createLlmClient({
    getSettings: () => ({ llm: { mode: 'tavern' } }),
    getContext: () => ({ generateQuietPrompt: async () => 'from-tavern' }),
});
assert.equal(await extrasTavern.complete({ system: 's', user: 'u', overrides: { connection: 'tavern', extraBody: { top_k: 20 }, headers: { 'X-Gate': 'open' } } }), 'from-tavern');

// listModels 带上方案标头
const headerModelCalls = [];
const listedWithHeaders = await listModels({
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-model',
    headers: { 'X-Gate': 'open', empty: null },
    fetchImpl: async (url, options) => {
        headerModelCalls.push({ url, headers: options.headers });
        return { ok: true, status: 200, json: async () => ({ data: [{ id: 'model-a' }] }) };
    },
});
assert.equal(listedWithHeaders.status, 'ok');
assert.equal(headerModelCalls[0].headers['X-Gate'], 'open', '拉模型同样带方案标头');
assert.equal(headerModelCalls[0].headers.authorization, 'Bearer sk-model', '鉴权头保留');

// interpret 透传 overrides（API设置页给“全局连接”绑方案时，意图解析也要走方案）；
// 不传 overrides 时保持旧行为（跟随酒馆）。
const passthroughCalls = [];
const passthrough = createLlmClient({
    getSettings: () => ({ llm: { mode: 'tavern', baseUrl: 'https://global.example/v1', model: 'global-model' } }),
    getContext: () => ({ generateQuietPrompt: async () => '{"type":"unclear","task":"unclear","effects":[]}' }),
    fetchImpl: async (url, options) => {
        passthroughCalls.push({ url, body: JSON.parse(options.body) });
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"type":"unclear","task":"unclear","effects":[]}' } }] }) };
    },
});
await passthrough.interpret({ input: '我看看四周', state: {}, allowedFields: [], overrides: { connection: 'custom', custom: { baseUrl: 'https://alt.example/v1', apiKey: 'alt-key', provider: 'openai' }, model: 'alt-model' } });
assert.equal(passthroughCalls[0].url, 'https://alt.example/v1/chat/completions', 'interpret 的 overrides 生效');
assert.equal(passthroughCalls[0].body.model, 'alt-model');
await passthrough.interpret({ input: '我看看四周', state: {}, allowedFields: [] });
assert.equal(passthroughCalls.length, 1, '不传 overrides 不发起自定义请求');

// 单次 connection: 'tavern' 指定照常生效（方案层是否走酒馆由 presetToOverrides 决定，见 api-presets 测试）
const defaultClient = createLlmClient({
    getSettings: () => ({ llm: { useSillyTavernConnection: true, timeoutMs: 5000 } }),
    getContext: () => ({ generateQuietPrompt: async () => 'from-tavern-default' }),
});
assert.equal(await defaultClient.complete({ system: 's', user: 'u', overrides: { connection: 'tavern' } }), 'from-tavern-default');

console.log('llm client tests passed');
