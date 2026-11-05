import assert from 'node:assert/strict';
import { API_PRESETS_MAX, normalizeApiPreset, normalizeApiPresets, parseYamlBlock, presetToOverrides, headerEntries } from './api-presets.js';

// ---------- parseYamlBlock：JSON 透传 ----------
assert.deepEqual(parseYamlBlock('{"top_k": 20}'), { top_k: 20 });
assert.deepEqual(parseYamlBlock('["frequency_penalty"]'), ['frequency_penalty']);
assert.equal(parseYamlBlock(''), null);
assert.equal(parseYamlBlock('   \n  '), null);
assert.equal(parseYamlBlock('{"top_k": 20'), null, '残缺 JSON 且不是合法行结构时安全返回 null');
// YAML 流式写法（JSON.parse 吃不下、酒馆服务端的 js-yaml 吃得下）
assert.deepEqual(parseYamlBlock('{top_k: 20}'), { top_k: 20 });
assert.deepEqual(parseYamlBlock("['frequency_penalty','presence_penalty']"), ['frequency_penalty', 'presence_penalty']);

// ---------- parseYamlBlock：YAML 对象（酒馆「包括主体参数」示例） ----------
assert.deepEqual(parseYamlBlock('top_k: 20\nrepetition_penalty: 1.1'), { top_k: 20, repetition_penalty: 1.1 });
// 值里带 # 不算注释；独立的行内注释要剥掉
assert.deepEqual(parseYamlBlock('stop_reason: "end#turn" # 行内注释'), { stop_reason: 'end#turn' });
// 布尔/引号/负数
assert.deepEqual(parseYamlBlock('stream: false\nname: "my-model"\ntemperature: -0.5\nnote: \'单引号\'\'值\'\'\''), {
    stream: false,
    name: 'my-model',
    temperature: -0.5,
    note: "单引号'值'",
});
// 一层嵌套对象
assert.deepEqual(parseYamlBlock('response_format:\n  type: json_object'), { response_format: { type: 'json_object' } });

// ---------- parseYamlBlock：YAML 数组（「排除主体参数」示例） ----------
assert.deepEqual(parseYamlBlock('- frequency_penalty\n- presence_penalty'), ['frequency_penalty', 'presence_penalty']);
assert.deepEqual(parseYamlBlock('- frequency_penalty'), ['frequency_penalty']);

// ---------- parseYamlBlock：请求标头示例 ----------
assert.deepEqual(parseYamlBlock('CustomHeader: custom-value'), { CustomHeader: 'custom-value' });
assert.deepEqual(parseYamlBlock('X-Title: doupo-agent\nAuthorization: Bearer sk-test'), {
    'X-Title': 'doupo-agent',
    Authorization: 'Bearer sk-test',
});

// OPT-079: consume the whole document; flow values retain their types.
assert.equal(parseYamlBlock('top_k: 20\njunk\ntop_p: 0.9'), null);
assert.deepEqual(parseYamlBlock('{top_k: 20, top_p: 0.9}'), { top_k: 20, top_p: 0.9 });
assert.deepEqual(parseYamlBlock('stop: [a, b]'), { stop: ['a', 'b'] });
for (const raw of ['stop: [a, b', 'x: "unterminated', 'x: |\n  text', 'a: 1\n  dangling: 2']) assert.equal(parseYamlBlock(raw), null, raw);

// ---------- headerEntries ----------
assert.deepEqual(headerEntries({ a: 1, b: null, c: 'x' }), { a: '1', c: 'x' }, '值统一成字符串，空值丢弃');
assert.equal(headerEntries(['a']), null);
assert.equal(headerEntries(null), null);
assert.equal(headerEntries({}), null, '全空对象按“没填标头”处理');

// ---------- normalizeApiPreset ----------
const preset = normalizeApiPreset({ name: '  深修直连  ', baseUrl: ' https://api.example.com/v1 ', apiKey: ' sk-x ', model: 'deepseek-chat', temperature: 0.555, maxTokens: 4096, topP: 0.9, presencePenalty: 1.2, frequencyPenalty: 3, includeBody: 'top_k: 20', excludeBody: '- top_p', headers: 'X-Test: 1' });
assert.equal(preset.name, '深修直连');
assert.equal(preset.baseUrl, 'https://api.example.com/v1');
assert.equal(preset.apiKey, 'sk-x');
assert.equal(preset.temperature, 0.56, '越界值收拢并保留两位小数');
assert.equal(preset.frequencyPenalty, 2, '超上限压回边界');
assert.match(preset.id, /^p[0-9a-z]+$/);
// 全空输入也有完整形状
const blank = normalizeApiPreset({});
assert.equal(blank.name, '');
assert.equal(blank.provider, '');
assert.equal(blank.temperature, 0);
assert.equal(normalizeApiPreset(null), null);
assert.equal(normalizeApiPreset('x'), null);

// ---------- normalizeApiPresets：上限 + id 去重 ----------
const many = Array.from({ length: API_PRESETS_MAX + 5 }, (_, index) => ({ id: `k${index}`, name: `n${index}` }));
const capped = normalizeApiPresets(many);
assert.equal(capped.length, API_PRESETS_MAX);
assert.equal(capped[0].id, 'k0');
assert.equal(normalizeApiPresets([{ id: 'dup', name: 'a' }, { id: 'dup', name: 'b' }]).every(item => new Set(normalizeApiPresets([{ id: 'dup', name: 'a' }, { id: 'dup', name: 'b' }]).map(p => p.id)).size === 2), true, '重复 id 重发不覆盖');
assert.deepEqual(normalizeApiPresets('junk'), []);
// 名字/地址/密钥/模型全空的对象是存储垃圾，直接丢弃；有名字的新建空方案保留
assert.equal(normalizeApiPresets([{ nope: true }]).length, 0);
assert.equal(normalizeApiPresets([{ name: '新方案' }]).length, 1);

// ---------- presetToOverrides：空/不可用 ----------
assert.equal(presetToOverrides(null), null);
assert.equal(presetToOverrides({ name: '只有名字' }), null, '没填接口地址的方案不可用');
assert.equal(presetToOverrides(normalizeApiPreset({ baseUrl: '' })), null);

// ---------- presetToOverrides：完整形状 ----------
const full = presetToOverrides(normalizeApiPreset({
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-x',
    provider: 'openai',
    model: 'deepseek-chat',
    temperature: 0.7,
    maxTokens: 2048,
    topP: 0.9,
    presencePenalty: 0.5,
    frequencyPenalty: 0.5,
    includeBody: 'top_k: 20',
    excludeBody: '- frequency_penalty',
    headers: 'X-Title: doupo',
}));
assert.equal(full.connection, 'custom');
assert.deepEqual(full.custom, { baseUrl: 'https://api.example.com/v1', apiKey: 'sk-x', provider: 'openai', model: 'deepseek-chat' });
assert.equal(full.model, 'deepseek-chat');
assert.equal(full.temperature, 0.7);
assert.equal(full.maxTokens, 2048);
assert.equal(full.topP, 0.9);
assert.equal(full.presencePenalty, 0.5);
assert.equal(full.frequencyPenalty, 0.5);
assert.deepEqual(full.extraBody, { top_k: 20 });
assert.deepEqual(full.excludeBody, ['frequency_penalty']);
assert.deepEqual(full.headers, { 'X-Title': 'doupo' });

// ---------- presetToOverrides：0/空 ＝ 不指定，附加参数解析失败就不带 ----------
const sparse = presetToOverrides(normalizeApiPreset({ baseUrl: 'https://x/v1', temperature: 0, maxTokens: 0, topP: 0, includeBody: '{"top_k": 20', excludeBody: ' junk line ', headers: '' }));
assert.equal(sparse.temperature, undefined);
assert.equal(sparse.maxTokens, undefined);
assert.equal(sparse.topP, undefined);
assert.equal(sparse.model, undefined);
assert.equal(sparse.extraBody, undefined, '解析失败按没填处理，不让一次坏配置打断调用');
assert.equal(sparse.excludeBody, undefined);
assert.equal(sparse.headers, undefined);
// 只有 baseUrl 也能通过（模型名走 custom.model 空串，由 llm-client 的 modelHint 兜底）
assert.equal(sparse.custom.baseUrl, 'https://x/v1');

// ---------- presetToOverrides：anthropic + 排除项盖过附加项由请求层保证，这里只验解析 ----------
const anthropic = presetToOverrides(normalizeApiPreset({ baseUrl: 'https://x/v1', provider: 'anthropic', headers: 'anthropic-version: 2023-07-01' }));
assert.equal(anthropic.custom.provider, 'anthropic');
assert.deepEqual(anthropic.headers, { 'anthropic-version': '2023-07-01' });

console.log('api-presets tests passed');
