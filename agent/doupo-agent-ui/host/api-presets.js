/**
 * API设置：把一套接口配置（地址/密钥/模型/采样参数/附加参数）存成命名方案，
 * 「模型设置」页各功能直接选方案，不用再逐项手填。附加参数的语义对齐酒馆
 * 「自定义接口 · 附加参数」抽屉（包括主体参数 / 排除主体参数 / 包含请求标头）：
 * 酒馆是服务器端用 js-yaml 解析这三段 YAML，扩展在浏览器里直连接口，解析得自己做——
 * 这里实现一个覆盖酒馆文档全部示例用法的迷你 YAML 解析器（对象、数组、一层嵌套、注释、引号）。
 */

export const API_PRESETS_MAX = 20;
const PRESET_NAME_MAX = 24;

/** 生成方案 id：时间戳 36 进制 + 随机位 + 自增位，避免同一毫秒批量操作撞车。 */
let presetSeq = 0;
function makePresetId() {
    presetSeq = (presetSeq + 1) % 1296;
    return `p${Date.now().toString(36)}${Math.floor(Math.random() * 36).toString(36)}${presetSeq.toString(36)}`;
}

/** 去注释：只在引号外、且 # 前是空白（或行首）时截断，URL/颜色值里的 # 不受影响。 */
function stripComment(line) {
    let quote = '';
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (quote) {
            if (ch === quote) quote = '';
            continue;
        }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if (ch === '#' && (i === 0 || line[i - 1] === ' ' || line[i - 1] === '\t')) return line.slice(0, i);
    }
    return line;
}

/** 标量：引号字符串按字面取值，true/false/null/~ 有语义，其余能转数字就转，转不动就按原文。 */
function parseScalar(raw) {
    const text = String(raw ?? '').trim();
    if (!text) return null;
    if (/^[\[{]/.test(text)) {
        const value = parseYamlBlock(text);
        if (value === null) throw new Error('Unsupported flow value');
        return value;
    }
    if ((/^["']/.test(text) && text.at(-1) !== text[0]) || /^[|>]/.test(text)) throw new Error('Unsupported scalar');
    if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
        return text.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
        return text.slice(1, -1).replace(/''/g, "'");
    }
    if (text === 'true') return true;
    if (text === 'false') return false;
    if (text === 'null' || text === '~') return null;
    if (/^-?\d+$/.test(text)) return Number.parseInt(text, 10);
    if (/^-?\d*\.\d+$/.test(text)) return Number.parseFloat(text);
    return text;
}

/** 键名：去引号后按原文（键不转数字/布尔，接口参数名和标头名都不会是这些）。 */
function keyName(raw) {
    const text = String(raw ?? '').trim();
    if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
        return text.slice(1, -1);
    }
    return text;
}

/** 在引号外找第一个后跟空格（或行尾）的冒号，切成 {key, value}；找不到返回 null。
 *  键里带花括号/方括号/逗号视为残缺 JSON 之类的垃圾行，直接拒绝，免得解析出怪键。 */
function splitKeyValue(content) {
    let quote = '';
    for (let i = 0; i < content.length; i += 1) {
        const ch = content[i];
        if (quote) {
            if (ch === quote) quote = '';
            continue;
        }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if (ch === '{' || ch === '}' || ch === '[' || ch === ']' || ch === ',') return null;
        if (ch === ':' && (i === content.length - 1 || content[i + 1] === ' ')) {
            return { key: keyName(content.slice(0, i)), value: content.slice(i + 1).trim() };
        }
    }
    return null;
}

/**
 * 按缩进递归解析一个块，返回 [值, 消耗到的行号]。
 * 覆盖：`key: value` 对象、`- item` 数组、缩进一层嵌套、`- key: value` 单行列表项。
 * 块标量（`|`/`>` 多行文本）不在覆盖范围——酒馆附加参数的三段示例用不到。
 */
function parseBlock(lines, start, indent) {
    if (start >= lines.length) return [null, start];
    const first = lines[start].content;
    if (first === '-' || first.startsWith('- ')) {
        const array = [];
        let i = start;
        while (i < lines.length && lines[i].indent === indent && (lines[i].content === '-' || lines[i].content.startsWith('- '))) {
            const rest = lines[i].content === '-' ? '' : lines[i].content.slice(2).trim();
            if (rest) {
                const inline = splitKeyValue(rest);
                if (inline) {
                    const item = {};
                    item[inline.key] = parseScalar(inline.value);
                    array.push(item);
                } else {
                    array.push(parseScalar(rest));
                }
                i += 1;
                continue;
            }
            const child = lines[i + 1];
            if (child && child.indent > indent) {
                const [value, next] = parseBlock(lines, i + 1, child.indent);
                array.push(value);
                i = next;
                continue;
            }
            array.push(null);
            i += 1;
        }
        return [array, i];
    }
    const object = {};
    let i = start;
    while (i < lines.length && lines[i].indent === indent) {
        const split = splitKeyValue(lines[i].content);
        if (!split || !split.key) break;
        if (split.value) {
            object[split.key] = parseScalar(split.value);
            i += 1;
            continue;
        }
        const child = lines[i + 1];
        if (child && child.indent > indent) {
            const [value, next] = parseBlock(lines, i + 1, child.indent);
            object[split.key] = value;
            i = next;
            continue;
        }
        object[split.key] = null;
        i += 1;
    }
    // 一行键值都没吃进去（残缺 JSON、纯垃圾行）按解析失败处理，别把空壳对象当配置用。
    if (i === start) return [null, start];
    return [object, i];
}

/** 拆 YAML 流式数组（`['a', 'b']` 这类 JSON.parse 吃不下的）：按引号外的顶层逗号切开逐个转标量。 */
function parseFlowArray(text) {
    const inner = text.slice(1, -1).trim();
    if (!inner) return [];
    const parts = [];
    let quote = '';
    let depth = 0;
    let current = '';
    for (const ch of inner) {
        if (quote) {
            current += ch;
            if (ch === quote) quote = '';
            continue;
        }
        if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
        if (ch === '{' || ch === '[') depth += 1;
        if (ch === '}' || ch === ']') depth -= 1;
        if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue; }
        current += ch;
    }
    if (quote || depth !== 0 || !current.trim()) throw new Error('Malformed flow sequence');
    parts.push(current);
    return parts.map(part => parseScalar(part));
}

/**
 * 解析附加参数里的一段 YAML（兼容 JSON——JSON 本来就是 YAML 子集，酒馆服务端同样吃得下；
 * 单引号/无引号的流式写法 `{top_k: 20}`、`['a','b']` 也顺带支持）。
 * 返回对象/数组；空文本或解析失败返回 null（请求层按“没填附加参数”处理，不报错中断）。
 */
export function parseYamlBlock(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const text = raw.trim();
    if (text.startsWith('{') && text.endsWith('}')) {
        try {
            const parsed = JSON.parse(text);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch { /* 不是 JSON：落回流式对象解析（去掉外层花括号按行解析） */ }
        const inner = text.slice(1, -1).trim();
        if (!inner) return null;
        // Reuse the flow splitter, treating each mapping pair as a quoted scalar.
        try {
            const parts = [];
            let start = 0, depth = 0, quote = '';
            for (let i = 0; i <= inner.length; i++) {
                const ch = inner[i];
                if (quote) { if (ch === quote && inner[i - 1] !== '\\') quote = ''; continue; }
                if (ch === '"' || ch === "'") { quote = ch; continue; }
                if (ch === '{' || ch === '[') depth++;
                if (ch === '}' || ch === ']') depth--;
                if ((ch === ',' && depth === 0) || i === inner.length) { parts.push(inner.slice(start, i).trim()); start = i + 1; }
            }
            if (quote || depth !== 0) return null;
            const object = {};
            for (const part of parts) {
                const pair = splitKeyValue(part);
                if (!pair?.key || !pair.value) return null;
                object[pair.key] = parseScalar(pair.value);
            }
            return object;
        } catch { return null; }
    }
    if (text.startsWith('[') && text.endsWith(']')) {
        try {
            const parsed = JSON.parse(text);
            return Array.isArray(parsed) ? parsed : null;
        } catch {
            try { return parseFlowArray(text); } catch { return null; }
        }
    }
    const lines = text.split(/\r?\n/)
        .map(line => stripComment(line).replace(/\t/g, '  '))
        .map(line => ({ indent: line.length - line.replace(/^ +/, '').length, content: line.trim() }))
        .filter(line => line.content);
    if (!lines.length) return null;
    try {
        const [value, consumed] = parseBlock(lines, 0, lines[0].indent);
        return consumed === lines.length ? value ?? null : null;
    } catch {
        return null;
    }
}

/** 把标头对象的值统一成字符串（fetch 的 Headers 吃字符串；null/undefined 直接丢）。 */
export function headerEntries(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const entries = Object.entries(value)
        .filter(([key, item]) => typeof key === 'string' && key.trim() && item !== null && item !== undefined)
        .map(([key, item]) => [key.trim(), String(item)]);
    return entries.length ? Object.fromEntries(entries) : null;
}

function clampNumber(value, { min, max }) {
    const num = Number(value);
    if (value === '' || value === null || value === undefined || !Number.isFinite(num)) return 0;
    return Math.min(max, Math.max(min, Math.round(num * 100) / 100));
}

function cleanText(value, cap) {
    if (typeof value === 'string') return value.trim().slice(0, cap);
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
}

/** 清洗一个方案：字段补齐、截断、值域收拢；id 缺了现补，坏了返回 null。 */
export function normalizeApiPreset(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 48) : makePresetId();
    return {
        id,
        name: cleanText(raw.name, PRESET_NAME_MAX),
        provider: raw.provider === 'anthropic' || raw.provider === 'openai' ? raw.provider : '',
        baseUrl: cleanText(raw.baseUrl, 300),
        apiKey: cleanText(raw.apiKey, 200),
        model: cleanText(raw.model, 200),
        temperature: clampNumber(raw.temperature, { min: 0, max: 2 }),
        maxTokens: clampNumber(raw.maxTokens, { min: 0, max: 32768 }),
        topP: clampNumber(raw.topP, { min: 0, max: 1 }),
        presencePenalty: clampNumber(raw.presencePenalty, { min: 0, max: 2 }),
        frequencyPenalty: clampNumber(raw.frequencyPenalty, { min: 0, max: 2 }),
        includeBody: cleanText(raw.includeBody, 4000),
        excludeBody: cleanText(raw.excludeBody, 1000),
        headers: cleanText(raw.headers, 2000),
    };
}

/** 清洗方案数组：垃圾条目丢掉、id 去重（撞了重发）、超上限截断；
 *  名字/地址/密钥/模型全空**且没有 id** 的对象（存储里混进来的垃圾）直接丢弃，不生成一排“未命名方案”；
 *  带 id 的是界面里建的正牌方案，全空也要留（玩家正在改名字，见下面的逐条说明）。 */
export function normalizeApiPresets(list) {
    const source = Array.isArray(list) ? list : [];
    const seen = new Set();
    const presets = [];
    for (const raw of source) {
        const preset = normalizeApiPreset(raw);
        if (!preset) continue;
        // 名字/地址/密钥/模型全空：只丢「来路不明」的垃圾（原始条目连 id 都没有）。
        // 界面里新建的方案一保存就带 id，玩家把默认名「新方案」清空、准备改成自己的名字时，
        // 这一条必须留住——否则清空名称的那一次 input 就把整条删掉，接下来填的地址、密钥、
        // 模型全写在一张空表上，切页重画后方案就"消失"了。
        const anonymous = !(raw && typeof raw === 'object' && typeof raw.id === 'string' && raw.id.trim());
        if (anonymous && !preset.name && !preset.baseUrl && !preset.apiKey && !preset.model) continue;
        while (seen.has(preset.id)) preset.id = makePresetId();
        seen.add(preset.id);
        presets.push(preset);
        if (presets.length >= API_PRESETS_MAX) break;
    }
    return presets;
}

/**
 * 方案 → llm-client 的单次覆盖参数。没填接口地址等于方案不可用，返回 null（调用方回落手动配置）。
 * 采样参数 0 ＝不指定（与设置页各卡口径一致）；三段附加参数在这里解析成结构化对象，
 * 请求层只做机械合并，不再关心 YAML。
 */
export function presetToOverrides(preset) {
    const normalized = preset && typeof preset === 'object' ? preset : null;
    if (!normalized || !String(normalized.baseUrl ?? '').trim()) return null;
    const positive = value => {
        const num = Number(value);
        return Number.isFinite(num) && num > 0 ? num : undefined;
    };
    const overrides = {
        connection: 'custom',
        custom: {
            baseUrl: String(normalized.baseUrl).trim(),
            apiKey: String(normalized.apiKey ?? '').trim(),
            provider: normalized.provider === 'anthropic' || normalized.provider === 'openai' ? normalized.provider : '',
            model: String(normalized.model ?? '').trim(),
        },
        model: String(normalized.model ?? '').trim() || undefined,
    };
    const temperature = positive(normalized.temperature);
    if (temperature !== undefined) overrides.temperature = Math.min(2, temperature);
    const maxTokens = Number(normalized.maxTokens);
    if (Number.isInteger(maxTokens) && maxTokens >= 64) overrides.maxTokens = Math.min(32768, maxTokens);
    const topP = positive(normalized.topP);
    if (topP !== undefined && topP <= 1) overrides.topP = topP;
    const presencePenalty = positive(normalized.presencePenalty);
    if (presencePenalty !== undefined) overrides.presencePenalty = Math.min(2, presencePenalty);
    const frequencyPenalty = positive(normalized.frequencyPenalty);
    if (frequencyPenalty !== undefined) overrides.frequencyPenalty = Math.min(2, frequencyPenalty);
    const extraBody = parseYamlBlock(normalized.includeBody);
    if (extraBody && typeof extraBody === 'object' && !Array.isArray(extraBody)) {
        overrides.extraBody = extraBody;
    }
    const excludeBody = parseYamlBlock(normalized.excludeBody);
    if (Array.isArray(excludeBody)) {
        const keys = excludeBody.filter(key => typeof key === 'string' && key.trim()).map(key => key.trim());
        if (keys.length) overrides.excludeBody = keys;
    }
    const headers = headerEntries(parseYamlBlock(normalized.headers));
    if (headers) overrides.headers = headers;
    return overrides;
}
