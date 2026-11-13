const TYPES = new Set(['query', 'conversation', 'explicit_action', 'time_advance', 'due_event', 'historical_operation', 'system_operation', 'unclear']);
const TASKS = new Set(['ordinary_interaction', 'explicit_action', 'complex_action', 'system_operation', 'historical_operation', 'time_advance', 'unclear']);
const EFFECT_TYPES = new Set(['set', 'add', 'remove']);

const INTERPRET_SYSTEM = [
    '你是《斗破苍穹》同人文字游戏的总控解析器。',
    '只输出一个 JSON 对象，不要输出解释、标题或代码块以外的文字。',
    '玩家消息里明确说出口的行为才算 explicit_action；只是聊天、提问、感叹都不算。',
    'effects 只能写下面允许字段表里出现的目标与字段，不要发明新字段。',
].join('\n');

const COMPOSE_SYSTEM = [
    '你是《斗破苍穹》同人文字游戏的叙事者，用中文第二人称写玩家这一轮的所见所感。',
    '只输出一个 JSON 对象：{"text": "正文", "claims": [{"kind": "flavor", "text": "正文里的事实短句"}]}。',
    '正文里出现的客观事实必须有依据：要么来自给定事实列表，要么来自已确认状态变化；没有依据的细节只能写成氛围与猜测。',
    '不要替玩家决定新的行动，不要输出系统提示、选项列表或元信息。',
].join('\n');

const SELECT_SYSTEM = [
    '你是《斗破苍穹》同人文字游戏的设定检索器，只做一件事：从候选设定里挑出这一轮正文真正需要的条目。',
    '只输出一个 JSON 对象，不要输出解释、标题或代码块以外的文字。',
    '候选列表是唯一来源：不许写列表里没有的编号，也不许凭记忆补充原著内容。',
    '宁可少选，不要多选。选错会让正文写出玩家当前不该知道的东西。',
].join('\n');

const tavernSamplingQueues = new WeakMap();
function abortableDelay(ms, signal) {
    return new Promise((resolve, reject) => {
        const finish = () => { signal?.removeEventListener('abort', abort); resolve(); };
        const timer = setTimeout(finish, ms);
        const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new Error('模型请求已取消')); };
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort, { once: true });
    });
}

function needText(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}

/* —— 失败详情：服务商的 400/429/500 几乎都把真实原因写在响应体里（模型名错/额度/内容策略），
 *  只抛「HTTP 400」等于瞎猜。读 body、提原因、密钥打码，详情跟着错误文本走进所有展示面。 —— */
const HTTP_BODY_SNIPPET_MAX = 400;
/** 密钥打码：服务商若在响应体里回显鉴权材料，统一替换成 ***（日志钉死不得出现明文密钥）。 */
function maskSecret(text, secret) {
    const raw = String(text ?? '');
    const key = typeof secret === 'string' && secret.trim() ? secret.trim() : '';
    if (!key || !raw.includes(key)) return raw;
    return raw.split(key).join('***');
}
/** 从错误响应体里提真实原因：优先 JSON 的 error.message/code/type、detail 字段，取不到用原文片段。 */
function extractHttpReason(raw, apiKey) {
    const text = maskSecret(String(raw ?? ''), apiKey);
    const probe = text.trim().slice(0, 2000);
    if (!probe) return '';
    let reason = '';
    try {
        const parsed = JSON.parse(probe);
        const inner = parsed?.error ?? parsed?.detail ?? parsed;
        reason = typeof inner === 'string' ? inner
            : String(inner?.message || inner?.code || inner?.type || (typeof parsed?.detail === 'string' ? parsed.detail : ''));
    } catch { /* 非 JSON 响应体：直接用原文片段 */ }
    return (reason.trim() || probe).slice(0, HTTP_BODY_SNIPPET_MAX);
}
/** 自定义接口的非 2xx 响应 → 带齐状态码/端点/响应原因的错误；详情字段挂在 error 上给体检日志取用。 */
async function httpErrorWithBody(response, url, apiKey) {
    const status = response?.status ?? '未知';
    let raw = '';
    try { raw = String((await response?.text?.()) ?? ''); } catch { /* 响应体读不到就只报状态码 */ }
    const reason = extractHttpReason(raw, apiKey);
    const error = new Error(`模型接口返回 HTTP ${status}${url ? `（POST ${url}）` : ''}${reason ? `：${reason}` : ''}`);
    error.httpStatus = typeof status === 'number' ? status : null;
    error.httpEndpoint = url ?? '';
    error.httpBody = reason;
    return error;
}

/** Pulls the first JSON object out of a model reply, tolerating fences and chatter. */
export function extractJson(raw) {
    if (typeof raw !== 'string' || !raw.trim()) throw new Error('模型没有返回内容');
    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('模型没有返回 JSON 对象');
    try {
        return JSON.parse(text.slice(start, end + 1));
    } catch (error) {
        throw new Error(`模型返回的 JSON 无法解析：${error.message}`);
    }
}

/**
 * 跟随酒馆时的采样参数：酒馆的静默生成没有“温度/top_p/惩罚项”入参，
 * 这些值来自它自己的“聊天补全”设置对象。这里在这一轮调用期间临时换掉、
 * 生成结束立刻还原（不写回设置、不触发保存）。
 * 文本补全的参数来自预设（preset），没有统一的单次入口，所以只处理聊天补全。
 */
function applyTavernSampling(context, { temperature, topP, presencePenalty, frequencyPenalty } = {}) {
    const settings = context?.chatCompletionSettings;
    const mainApi = context?.mainApi;
    const isChatCompletion = mainApi === undefined || mainApi === 'openai';
    if (!isChatCompletion || !settings || typeof settings !== 'object') return () => {};
    const changes = [
        ['temp_openai', temperature],
        ['top_p_openai', topP],
        ['pres_pen_openai', presencePenalty],
        ['freq_pen_openai', frequencyPenalty],
    ].filter(([, value]) => Number.isFinite(value));
    if (!changes.length) return () => {};
    const saved = changes.map(([key]) => [key, settings[key]]);
    for (const [key, value] of changes) settings[key] = value;
    return () => {
        for (const [key, value] of saved) settings[key] = value;
    };
}

function coerce(type, value) {
    if (type === 'number') {
        const number = Number(value);
        return Number.isFinite(number) ? number : undefined;
    }
    if (type === 'string') return typeof value === 'string' || typeof value === 'number' ? String(value).slice(0, 200) : undefined;
    if (type === 'boolean') return typeof value === 'boolean' ? value : undefined;
    return undefined;
}

/** Validates and narrows a model interpretation against the writable field list. */
export function normalizeInterpretation(raw, { allowedFields = [], maxEffects = 8 } = {}) {
    const object = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const allowed = new Map();
    for (const field of Array.isArray(allowedFields) ? allowedFields : []) {
        if (!field || typeof field.targetId !== 'string' || typeof field.field !== 'string') continue;
        allowed.set(`${field.targetId}.${field.field}`, field);
    }
    const type = TYPES.has(object.type) ? object.type : 'unclear';
    const task = TASKS.has(object.task) ? object.task : 'unclear';
    const confidence = Number.isFinite(Number(object.confidence)) ? Math.min(1, Math.max(0, Number(object.confidence))) : null;
    const effects = [];
    let rejectedEffects = 0;
    for (const effect of Array.isArray(object.effects) ? object.effects : []) {
        if (effects.length >= maxEffects) { rejectedEffects++; continue; }
        const targetId = typeof effect?.targetId === 'string' ? effect.targetId.trim() : '';
        const field = typeof effect?.field === 'string' ? effect.field.trim() : '';
        const allowedField = allowed.get(`${targetId}.${field}`);
        if (!allowedField) { rejectedEffects++; continue; }
        const effectType = EFFECT_TYPES.has(effect.type) ? effect.type : 'set';
        const value = coerce(allowedField.type, effect.value);
        if (value === undefined) { rejectedEffects++; continue; }
        effects.push({
            targetId,
            field,
            type: effectType,
            value,
            allowNegative: effect.allowNegative === true,
            reason: String(effect.reason ?? '').slice(0, 200),
        });
    }
    const rawAction = object.playerAction;
    const playerAction = rawAction && typeof rawAction === 'object'
        && typeof rawAction.targetId === 'string' && rawAction.targetId.trim()
        && typeof rawAction.method === 'string' && rawAction.method.trim()
        ? { targetId: rawAction.targetId.trim(), method: rawAction.method.trim() }
        : null;
    const category = typeof object.category === 'string' ? object.category.trim().slice(0, 24) : '';
    const ambiguities = Array.isArray(object.ambiguities) ? object.ambiguities.filter(item => typeof item === 'string' && item.trim()).slice(0, 32) : [];
    const requiredModules = Array.isArray(object.requiredModules) ? object.requiredModules.filter(item => typeof item === 'string' && item.trim()).slice(0, 32) : [];
    const days = Number.isFinite(Number(object.days)) && Number(object.days) > 0 ? Math.min(365, Math.floor(Number(object.days))) : 1;
    return {
        type,
        task,
        confidence,
        explicitAction: object.explicitAction === true,
        playerAction,
        category,
        effects,
        rejectedEffects,
        outcome: typeof object.outcome === 'string' ? object.outcome.slice(0, 500) : '',
        days,
        ambiguities,
        requiredModules,
    };
}

/** 共享的字段表：给 interpret 与类别判定同一份"可写字段 + 当前值"清单。 */
function fieldTable(allowedFields, state) {
    const fields = Array.isArray(allowedFields) ? allowedFields : [];
    const current = field => {
        const value = state && typeof state === 'object' ? state?.[field.targetId]?.[field.field] : undefined;
        return value === undefined ? '未设定' : JSON.stringify(value);
    };
    return fields
        .map(field => `- ${field.targetId}.${field.field}（${field.type}，当前 ${current(field)}${field.writer ? `，写入者 ${field.writer}` : ''}）`)
        .join('\n') || '- （没有可用字段）';
}

export function buildInterpretPrompt({ input, state, allowedFields, categories = [] }) {
    const fieldList = fieldTable(allowedFields, state);
    const customCategories = (Array.isArray(categories) ? categories : [])
        .filter(item => item && typeof item.id === 'string' && item.id.trim() && typeof item.name === 'string' && item.name.trim())
        .slice(0, 12);
    const customLine = customCategories.length
        ? `另有自定义判定类别（行动明显属于它就填它的 id）：${customCategories.map(item => `${item.id}=${item.name.trim()}`).join('、')}；和这些都搭不上才填 general。`
        : '';
    return [
        '请把玩家这一轮的消息解析成下面这个 JSON 结构：',
        '{"type":"query|conversation|explicit_action|time_advance|due_event|historical_operation|system_operation|unclear",',
        ' "task":"ordinary_interaction|explicit_action|complex_action|system_operation|historical_operation|time_advance|unclear",',
        ' "category":"alchemy=丹药相关|cultivation=修炼或冲击境界|combat=战斗伤害|general=其他行动|none=非行动",',
        ' "explicitAction": true/false, "confidence": 0到1, "ambiguities": ["需要玩家补充的点"],',
        ' "requiredModules": [], "playerAction": {"targetId":"目标","method":"动作"} 或 null,',
        ' "effects": [{"targetId":"目标","field":"字段","type":"set|add|remove","value":数值,"reason":"依据"}],',
        ' "outcome": "这一轮结果的一句话", "days": 推进天数（仅时间推进时）}',
        '',
        '可用字段表：',
        fieldList,
        '',
        '规则：effects 只写玩家这个动作直接造成的变化；数值增减用 add，换成新值用 set，删除用 remove。',
        '目标只能填上表里的对象，字段只能填上表里的字段；表里没有的一律不要写。',
        ...(customLine ? [customLine] : []),
        `当前状态：${state && typeof state === 'object' ? JSON.stringify(state) : '{}'}`,
        '',
        `玩家消息：${input}`,
    ].join('\n');
}

/** 类别判定的 user 提示词：类别规则在 system 里，这里带输入、初步提议和字段表。 */
export function buildAdjudicatePrompt({ categoryLabel, input, state, allowedFields, preliminary }) {
    const fieldList = fieldTable(allowedFields, state);
    const prelimLines = (Array.isArray(preliminary) ? preliminary : [])
        .map(effect => `- ${effect?.targetId}.${effect?.field} ${effect?.type} ${JSON.stringify(effect?.value)}${effect?.reason ? `（${effect.reason}）` : ''}`)
        .join('\n') || '- （无初步提议）';
    return [
        `判定类别：${categoryLabel ?? '通用判定'}`,
        `玩家消息：${input}`,
        '解析器的初步提议（仅供参考，可以推翻）：',
        prelimLines,
        '',
        `当前状态：${state && typeof state === 'object' ? JSON.stringify(state) : '{}'}`,
        '可用字段表：',
        fieldList,
        '',
        '请按判定规则复核并输出最终的 {"effects":[…],"outcome":"…"}；规则没让写的一律不写，与初步提议不一致时以你的判定为准。只输出 JSON。',
    ].join('\n');
}

export function buildComposePrompt({ input, injection, facts, changes, state, outcome, taskType }) {
    const factLines = (Array.isArray(facts) ? facts : [])
        .map(fact => `- [${fact.id}] ${fact.text}`)
        .join('\n');
    const settingBlock = typeof injection === 'string' && injection.trim() ? injection.trim() : factLines;
    const changeLines = (Array.isArray(changes) ? changes : [])
        .map(change => `- ${change.targetId}.${change.field}：${JSON.stringify(change.before)} → ${JSON.stringify(change.after)}`)
        .join('\n');
    return [
        `任务类型：${taskType ?? 'ordinary_interaction'}`,
        `玩家消息：${input}`,
        `本轮结果：${outcome || '没有结算行动。'}`,
        `状态变化：\n${changeLines || '- 无'}`,
        `可用设定（正文用到哪条，就把方括号里的编号写进 claims 的 factIds，kind 用 fact）：\n${settingBlock || '- 无（不要编造原著设定，只写对话与已确认状态）'}`,
        `当前状态：${state && typeof state === 'object' ? JSON.stringify(state) : '{}'}`,
        '',
        '写 2 到 5 段正文，控制在 600 字以内。claims 只记录正文里出现的客观事实；',
        '如果某句事实来自上面的设定列表，把它的编号放进 factIds，kind 用 fact；否则 kind 用 flavor 且不要带 factIds。',
        '只有上面列出的设定可以当作事实陈述；没列的设定不要写进正文，也不要凭印象补充。',
        '只输出 JSON。',
    ].join('\n');
}

/**
 * Selection prompt: the model only ranks and labels candidates it was given.
 * The id list is the contract — anything outside it is discarded downstream.
 */
export function buildSettingSelectPrompt({ input, recentTexts, candidates, budget, maxItems, asOf }) {
    const list = (Array.isArray(candidates) ? candidates : [])
        .map(item => `- ${item.id} | ${item.name} | ${item.brief}`)
        .join('\n');
    const recent = (Array.isArray(recentTexts) ? recentTexts : []).filter(item => typeof item === 'string' && item.trim()).slice(-2).join('\n');
    return [
        '从下面的候选设定里，挑出这一轮正文真正需要的条目。',
        '',
        `当前剧情进度（卷）：${Number.isInteger(asOf) ? asOf : '未设定'}`,
        `玩家这一轮的消息：${input}`,
        `最近两轮正文：\n${recent || '- 无'}`,
        '',
        '候选设定（编号 | 名称 | 摘要）：',
        list || '- 无',
        '',
        '只输出 JSON：',
        '{"needs":[{"id":"候选里的编号","layer":"full|summary|mention","why":"一句话理由"}],',
        ' "gaps":["候选里没有、但这一轮明确需要的东西"]}',
        '',
        `规则：最多 ${Number.isInteger(maxItems) && maxItems > 0 ? maxItems : 8} 条，总字数控制在 ${Number.isInteger(budget) && budget > 0 ? budget : 1200} 字以内。`,
        'layer 的含义：full 要完整设定原文（涉及判定、数值、来历），summary 一句话够用（提到即可），mention 只要名字（衬托、旁白）。',
        'id 只能从候选里挑，不许编。只跟这一轮描写有关的才选；纯背景、不会再出现的不要选。',
        '玩家只是打招呼、感慨或延续上一段时，needs 可以是空数组。',
        '拿不准某条是否相关，就不要选，宁可让它进 gaps。',
    ].join('\n');
}

function withTimeout(promise, timeoutMs, signal, onTimeout) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            reject(new Error(`模型请求超过 ${Math.round(timeoutMs / 1000)} 秒未返回`));
            onTimeout?.();
        }, timeoutMs);
        const onAbort = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); reject(new Error('模型请求已取消')); };
        if (signal?.aborted) return onAbort();
        signal?.addEventListener('abort', onAbort, { once: true });
        Promise.resolve(promise).then(
            value => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); resolve(value); },
            error => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); reject(error); },
        );
    });
}

/**
 * 附加参数（对齐酒馆「自定义接口 · 附加参数」三段语义，由 API设置方案带给单次调用）：
 * extraBody 最后展开进请求体（可覆盖标准字段）、excludeBody 删顶层键（最后执行，可删掉附加进来的键）、
 * headers 合并覆盖请求头（可以覆盖 authorization）。只在自定义接口路径生效——
 * 跟随酒馆的静默生成走酒馆自己的管线，这些参数没有落点，忽略。
 */
function readRequestExtras(overrides = {}) {
    const extraBody = overrides.extraBody && typeof overrides.extraBody === 'object' && !Array.isArray(overrides.extraBody)
        ? { ...overrides.extraBody } : null;
    const excludeBody = Array.isArray(overrides.excludeBody)
        ? overrides.excludeBody.filter(key => typeof key === 'string' && key.trim()).map(key => key.trim()) : null;
    const headers = overrides.headers && typeof overrides.headers === 'object' && !Array.isArray(overrides.headers)
        ? Object.fromEntries(Object.entries(overrides.headers)
            .filter(([key, value]) => typeof key === 'string' && key.trim() && value !== null && value !== undefined)
            .map(([key, value]) => [key.trim(), String(value)]))
        : null;
    return { extraBody, excludeBody, headers };
}

function mergeHeaders(target, extra) {
    for (const [name, value] of Object.entries(extra ?? {})) {
        for (const previous of Object.keys(target)) if (previous.toLowerCase() === name.toLowerCase()) delete target[previous];
        target[name] = value;
    }
    return target;
}

function applyRequestExtras(body, headers, extras) {
    if (extras.extraBody) Object.assign(body, extras.extraBody);
    if (extras.excludeBody) for (const key of extras.excludeBody) delete body[key];
    if (extras.headers) mergeHeaders(headers, extras.headers);
}

/** 拉取自定义接口的模型清单：面板上“拉取模型”用它列出可选模型，省得手抄模型名。
 *  headers：API设置方案里的「包含请求标头」（对象），拉模型同样要带上（网关按标头放行的站点不少见）。 */
export async function listModels({ baseUrl = '', apiKey = '', provider = '', headers = null, fetchImpl, signal, timeoutMs = 15000 } = {}) {
    const base = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!base) return { status: 'no_endpoint', models: [], error: '先填接口地址' };
    const fetchFn = fetchImpl ?? globalThis.fetch;
    if (typeof fetchFn !== 'function') return { status: 'failed', models: [], error: '当前环境没有可用的网络请求接口' };
    const isAnthropic = provider === 'anthropic';
    // 大多数接口把 /v1 放在地址里，但也有人只填到域名：两种都照顾，别让人为了拉模型去猜路径。
    const url = /\/v\d+$/.test(base)
        ? `${base}/models`
        : `${base}/v1/models`;
    const authHeaders = {};
    const key = String(apiKey || '').trim();
    if (key) {
        if (isAnthropic) {
            authHeaders['x-api-key'] = key;
            authHeaders['anthropic-version'] = '2023-06-01';
        } else {
            authHeaders.authorization = `Bearer ${key}`;
        }
    }
    const extraHeaders = headers && typeof headers === 'object' && !Array.isArray(headers)
        ? Object.fromEntries(Object.entries(headers)
            .filter(([name, value]) => typeof name === 'string' && name.trim() && value !== null && value !== undefined)
            .map(([name, value]) => [name.trim(), String(value)]))
        : {};
    const requestHeaders = mergeHeaders(authHeaders, extraHeaders);
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) return { status: 'failed', models: [], error: '拉取模型已取消' };
    signal?.addEventListener('abort', abort, { once: true });
    const deadline = Number.isFinite(Number(timeoutMs)) ? Math.max(1, Math.min(600000, Number(timeoutMs))) : 15000;
    try {
        const payload = await withTimeout((async () => {
            const response = await fetchFn(url, { method: 'GET', headers: requestHeaders, signal: controller.signal });
            if (!response?.ok) throw new Error(`接口返回 HTTP ${response?.status ?? '未知'}`);
            return response.json();
        })(), deadline, signal, abort);
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
        const models = rows
            .map(row => (typeof row === 'string' ? row : row?.id || row?.name || ''))
            .filter(Boolean)
            .slice(0, 200);
        return { status: models.length ? 'ok' : 'empty', models };
    } catch (error) {
        return { status: 'failed', models: [], error: `拉取模型失败：${error?.message ?? error}` };
    } finally {
        signal?.removeEventListener('abort', abort);
    }
}

/** Real model client: reuses the Tavern connection by default, or an OpenAI-compatible endpoint. */
export function createLlmClient({ getSettings, getContext, fetchImpl, capture = () => null, isCurrent = () => true } = {}) {
    if (typeof getSettings !== 'function') throw new TypeError('getSettings 必须是函数');

    // 调用体检：每个功能的每次模型调用都记一笔（成功/失败/报错/耗时/模型），
    // 总控页与悬浮球据此显示"哪个功能调没调模型、成没成功"。只记元数据，
    // 提示词与回复正文一概不记，密钥永远不会出现在这里。
    const callLogEntries = [];
    const CALL_LOG_MAX = 80;
    function recordCall(entry) {
        callLogEntries.push(entry);
        if (callLogEntries.length > CALL_LOG_MAX) callLogEntries.splice(0, callLogEntries.length - CALL_LOG_MAX);
        try {
            if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
                window.dispatchEvent(new CustomEvent('dai-calllog', { detail: entry }));
            }
        } catch { /* 无窗口环境忽略 */ }
    }

    /* —— 在途调用跟踪：总控窗实时状态的数据源（label 级，同名并发只记一份）。
     *  complete 起飞时登记、收尾（成功/失败都算）注销；onActivity 把起飞/落地广播给
     *  悬浮球，总控窗开着时就地转圈/打勾，不用轮询。 —— */
    const inFlightLabels = new Set();
    const activityListeners = new Set();
    function notifyActivity(label, phase) {
        for (const listener of activityListeners) {
            try { listener({ label, phase }); } catch { /* 监听器出错不碍调用本身 */ }
        }
    }

    /** 这次调用会走哪条连接、哪个模型——只用来给体检记录署名，无副作用。 */
    function describeConnection(args = {}) {
        const overrides = args.overrides && typeof args.overrides === 'object' ? args.overrides : {};
        const requested = overrides.connection === 'custom' ? 'custom'
            : overrides.connection === 'tavern' ? 'tavern' : null;
        const custom = overrides.custom && typeof overrides.custom === 'object' ? overrides.custom : null;
        const connection = resolveConnection(requested, overrides.model, custom);
        if (!connection) return '未配置';
        if (connection.kind === 'sillytavern') return '酒馆当前模型';
        const model = typeof overrides.model === 'string' && overrides.model.trim() ? overrides.model.trim()
            : (typeof connection.llm?.model === 'string' && connection.llm.model.trim() ? connection.llm.model.trim() : '');
        return model || String(connection.llm?.baseUrl ?? '自定义接口');
    }

    // 静默生成在飞行的深度计数。酒馆对每一次生成（包括这里的静默调用）收尾时都会广播
    // GENERATION_ENDED，监听方要靠这个计数区分“正文真的写完了”和“自己人的小调用结束了”，
    // 否则记账链会被自己的调用反复叫醒，形成自激励循环。
    let quietGenerationDepth = 0;
    // 酒馆的事件可能在 generateQuietPrompt 兑现之后才发出来，收尾后再压一小段缓冲。
    const QUIET_EVENT_GRACE_MS = 500;
    const isQuietBusy = () => quietGenerationDepth > 0;
    const quietIdleListeners = new Set();
    function onQuietIdle(listener) {
        if (typeof listener !== 'function') throw new TypeError('listener 必须是函数');
        quietIdleListeners.add(listener);
        return () => { quietIdleListeners.delete(listener); };
    }
    function notifyQuietIdle() {
        for (const listener of [...quietIdleListeners]) {
            try { Promise.resolve(listener()).catch(() => {}); } catch { /* An observer cannot change completion behavior. */ }
        }
    }

    /**
     * 选连接：hint 是这一次调用自己的要求（记录员/场记可以各自选跟随酒馆或自定义），
     * 没给 hint 才看设置页的全局模式。custom 是这一次调用自带的一套接口参数（地址/密钥/模型），
     * 有不完整的地方就沿用“模型与连接”页填的值。
     * custom 只在这次调用明确要“自定义”时生效——设置页写明这些字段“选自定义才用得上”，
     * 否则残留的地址会把“跟随酒馆”悄悄劫持成直连（真机踩过：纳戒决定跟随酒馆，却被残留
     * 的 decideBaseUrl 拉去自定义端点）。
     */
    function resolveConnection(hint, modelHint, custom) {
        const settings = getSettings() ?? {};
        const llm = settings.llm ?? {};
        const context = getContext?.();
        // 全局统管：开关打开且全局自定义连接配齐了，扩展发起的每一次调用都走这一套——
        // 各功能页里选的"跟随酒馆 / 自定义"连同各自填的地址模型都暂时让位（正文生成是酒馆
        // 自己发的，不经过这里，天然不受影响）。全局没配齐就按原逻辑走，不把人锁在门外。
        if (llm.governAll === true && llm.mode === 'custom'
            && typeof llm.baseUrl === 'string' && llm.baseUrl.trim()
            && typeof llm.model === 'string' && llm.model.trim()) {
            return { kind: 'openai', llm, governed: true, fetchImpl: fetchImpl ?? globalThis.fetch };
        }
        // 这一次调用自带的自定义接口：地址优先用它，密钥/服务商/模型缺哪项就沿用全局。
        const own = hint === 'custom' && custom && typeof custom === 'object' && typeof custom.baseUrl === 'string' && custom.baseUrl.trim()
            ? { ...llm, baseUrl: custom.baseUrl.trim(), apiKey: typeof custom.apiKey === 'string' && custom.apiKey.trim() ? custom.apiKey.trim() : llm.apiKey, provider: custom.provider || llm.provider, model: typeof custom.model === 'string' && custom.model.trim() ? custom.model.trim() : llm.model }
            : null;
        // 设置页的“跟随酒馆 / 自定义”优先；旧版布尔开关只在没写 mode 时兜底。
        const mode = hint === 'custom' || hint === 'tavern' ? hint
            : llm.mode === 'custom' ? 'custom'
                : llm.mode === 'tavern' ? 'tavern'
                    : llm.useSillyTavernConnection === false ? 'custom' : 'tavern';
        const usable = typeof context?.generateQuietPrompt === 'function';
        if (mode === 'tavern' && usable && !own) {
            return { kind: 'sillytavern', context, llm };
        }
        const source = own ?? llm;
        const hasEndpoint = typeof source.baseUrl === 'string' && source.baseUrl.trim()
            && ((typeof source.model === 'string' && source.model.trim()) || (typeof modelHint === 'string' && modelHint.trim()));
        if (hasEndpoint) {
            return { kind: 'openai', llm: source, fetchImpl: fetchImpl ?? globalThis.fetch };
        }
        // 选了“跟随酒馆”，但宿主没有静默生成接口：能拿到上下文就按酒馆连接记账，否则视为未配置。
        if (mode === 'tavern' && context && !own) return { kind: 'sillytavern', context, llm };
        return null;
    }

    function configured() {
        return resolveConnection() !== null;
    }

    /**
     * 按这一次调用自己的连接要求判断可用性：'tavern' 只看宿主有没有静默生成接口，
     * 不拿“全局连接卡配没配”当代理——全局选了自定义但空着时，跟随酒馆这条路照样是通的。
     * 世界决定/记忆决定这类默认跟随酒馆的功能曾经被 configured() 误拦在门口。
     */
    function availableFor(hint) {
        return resolveConnection(hint === 'custom' || hint === 'tavern' ? hint : null) !== null;
    }

    async function completeInner({ system, user, jsonSchema, signal, rawPrompt = false, overrides = {}, owner } = {}) {
        const check = () => { if (signal?.aborted || getSettings()?.enabled === false || !isCurrent(owner)) throw new Error('模型请求已取消'); };
        check();
        // overrides.connection 让单次调用自己选连接：'tavern' = 跟随酒馆，'custom' = 自定义接口。
        const requested = overrides.connection === 'custom' ? 'custom'
            : overrides.connection === 'tavern' ? 'tavern' : null;
        const custom = overrides.custom && typeof overrides.custom === 'object' ? overrides.custom : null;
        const connection = resolveConnection(requested, overrides.model, custom);
        if (!connection) {
            const error = new Error(requested === 'custom'
                ? '这次调用要用的自定义模型还没配好：填上接口地址和模型名（世界影响页的模型设置里），或把它改回跟随酒馆。'
                : '模型连接未配置：请启用“使用酒馆当前连接”，或填写接口地址与模型名称。');
            error.code = requested === 'custom' ? 'llm_custom_not_configured' : 'llm_not_configured';
            throw error;
        }
        const llm = connection.llm ?? {};
        // 全局统管接管时，单次调用的连接与参数选择一并让位。
        if (connection.governed) overrides = {};
        // 单次覆盖：世界决定等调用可以在设置里指定自己的模型与温度（酒馆连接模式下模型沿用当前选择）。
        const temperature = Number.isFinite(Number(overrides.temperature))
            ? Math.min(2, Math.max(0, Number(overrides.temperature)))
            : Number.isFinite(Number(llm.temperature)) ? Number(llm.temperature) : 0.7;
        const maxTokens = Number.isFinite(Number(overrides.maxTokens)) && Number(overrides.maxTokens) > 0
            ? Math.max(64, Math.floor(Number(overrides.maxTokens)))
            : Number.isFinite(Number(llm.maxTokens)) ? Math.max(64, Math.floor(Number(llm.maxTokens))) : 2048;
        const model = typeof overrides.model === 'string' && overrides.model.trim() ? overrides.model.trim() : llm.model;
        // 单次等待上限：优先读「秒」版设置（llm.timeoutSec，1~600 秒），老玩家填过的毫秒版（llm.timeoutMs）继续认，都没有默认 60 秒。
        const timeoutSec = Number(llm.timeoutSec);
        const timeoutMs = Number.isFinite(timeoutSec) && timeoutSec >= 1
            ? Math.min(600, Math.floor(timeoutSec)) * 1000
            : Number.isFinite(Number(llm.timeoutMs)) ? Math.min(600000, Math.max(1000, Math.floor(Number(llm.timeoutMs)))) : 60000;
        // 采样参数：没填（0/空）就不指定，沿用当前连接自己的设置。
        const topP = Number.isFinite(Number(overrides.topP)) && Number(overrides.topP) > 0 && Number(overrides.topP) <= 1
            ? Number(overrides.topP) : undefined;
        const presencePenalty = Number.isFinite(Number(overrides.presencePenalty)) && Number(overrides.presencePenalty) !== 0
            ? Math.min(2, Math.max(-2, Number(overrides.presencePenalty))) : undefined;
        const frequencyPenalty = Number.isFinite(Number(overrides.frequencyPenalty)) && Number(overrides.frequencyPenalty) !== 0
            ? Math.min(2, Math.max(-2, Number(overrides.frequencyPenalty))) : undefined;
        const temperatureSet = Number.isFinite(Number(overrides.temperature)) && Number(overrides.temperature) > 0;
        const maxTokensSet = Number.isFinite(Number(overrides.maxTokens)) && Number(overrides.maxTokens) > 0;
        // 自定义接口路径的兜底：这次调用没指定采样参数时，用“模型与连接”页填的全局值（0 = 不指定）。
        // 跟随酒馆的路径不用全局兜底——酒馆有自己的采样设置，不越权临时改。
        const fallbackNumber = (value, { min, max, exclusiveZero = true }) => {
            const num = Number(value);
            if (!Number.isFinite(num)) return undefined;
            if (exclusiveZero ? num <= 0 : num === 0) return undefined;
            return Math.min(max, Math.max(min, num));
        };
        const effectiveTopP = Number.isFinite(topP) ? topP : fallbackNumber(llm.topP, { min: 0, max: 1 });
        const effectivePresence = Number.isFinite(presencePenalty) ? presencePenalty : fallbackNumber(llm.presencePenalty, { min: -2, max: 2, exclusiveZero: false });
        const effectiveFrequency = Number.isFinite(frequencyPenalty) ? frequencyPenalty : fallbackNumber(llm.frequencyPenalty, { min: -2, max: 2, exclusiveZero: false });

        if (connection.kind === 'sillytavern') {
            // 酒馆文档里的签名是对象形式 generateQuietPrompt({ quietPrompt, jsonSchema })。
            // 早先这里传的是位置参数 (prompt, false, true)，第三个参数 quietToLoud=true
            // 会让静默生成的 JSON 直接落进聊天记录，必须用对象形式。
            // ST 1.19 generateRaw({prompt:messages}) 不拼角色/主聊天预设；仅裁判显式选择。
            if (rawPrompt && typeof connection.context.generateRaw !== 'function') throw new Error('当前酒馆不支持独立提示词生成（generateRaw），本轮裁判未调用');
            const options = rawPrompt
                ? { prompt: [{ role: 'system', content: system }, { role: 'user', content: user }], quietToLoud: false, trimNames: false }
                : { quietPrompt: `${system}\n\n${user}` };
            if (jsonSchema && typeof jsonSchema === 'object') options.jsonSchema = jsonSchema;
            // 输出长度是酒馆官方支持的覆盖项（responseLength）：生成期间临时换，结束自动还原。
            if (maxTokensSet) options.responseLength = maxTokens;
            // 温度/top_p/惩罚项没有单次参数，只能临时改酒馆“聊天补全”的采样设置，生成完立刻还原。
            const shared = connection.context.chatCompletionSettings ?? connection.context;
            const previous = tavernSamplingQueues.get(shared) ?? Promise.resolve();
            let expired = false;
            const request = previous.catch(() => {}).then(async () => {
                if (expired) throw new Error('模型请求已取消');
                check(); // queued work may no longer own this chat/reply
                const restoreSampling = applyTavernSampling(connection.context, {
                    temperature: temperatureSet ? temperature : undefined, topP, presencePenalty, frequencyPenalty,
                });
                quietGenerationDepth += 1;
                try {
                    const reply = await (rawPrompt ? connection.context.generateRaw(options) : connection.context.generateQuietPrompt(options));
                    check();
                    return typeof reply === 'string' ? reply : String(reply?.text ?? '');
                } finally {
                    // Local cancellation cannot cancel an unowned host request. Keep event/sampling ownership until it settles.
                    await abortableDelay(QUIET_EVENT_GRACE_MS);
                    quietGenerationDepth -= 1;
                    restoreSampling();
                    if (quietGenerationDepth === 0) notifyQuietIdle();
                }
            });
            tavernSamplingQueues.set(shared, request.catch(() => {}));
            try { return await withTimeout(request, timeoutMs, signal, () => { expired = true; }); }
            catch (error) {
                expired = true;
                // ST 只抛裸错误（消息常常只有 "Bad Request"，响应体在它自己手里），扩展拿不到更多；
                // 端点上下文挂在错误上，体检日志至少能定位是哪条连接出的错。
                error.httpEndpoint = error?.httpEndpoint ?? '酒馆连接';
                throw error;
            }
        }

        const fetchFn = connection.fetchImpl;
        if (typeof fetchFn !== 'function') throw new Error('当前环境没有可用的网络请求接口');
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        if (signal?.aborted) onAbort();
        else signal?.addEventListener('abort', onAbort, { once: true });
        // Anthropic 兼容接口走 /v1/messages，鉴权头、请求体和返回结构都和 OpenAI 不同。
        const isAnthropic = llm.provider === 'anthropic';
        const base = String(llm.baseUrl).replace(/\/+$/, '');
        const url = isAnthropic
            ? (base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`)
            : `${base}/chat/completions`;
        const headers = { 'content-type': 'application/json' };
        const apiKey = typeof llm.apiKey === 'string' ? llm.apiKey.trim() : '';
        if (apiKey) {
            if (isAnthropic) {
                headers['x-api-key'] = apiKey;
                headers['anthropic-version'] = '2023-06-01';
            } else {
                headers.authorization = `Bearer ${apiKey}`;
            }
        }
        const body = isAnthropic
            ? {
                model: model || undefined,
                max_tokens: maxTokens,
                temperature,
                ...(Number.isFinite(effectiveTopP) ? { top_p: effectiveTopP } : {}),
                system,
                messages: [{ role: 'user', content: user }],
            }
            : {
                model: model || undefined,
                temperature,
                max_tokens: maxTokens,
                ...(Number.isFinite(effectiveTopP) ? { top_p: effectiveTopP } : {}),
                ...(Number.isFinite(effectivePresence) ? { presence_penalty: effectivePresence } : {}),
                ...(Number.isFinite(effectiveFrequency) ? { frequency_penalty: effectiveFrequency } : {}),
                messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
            };
        // 方案带的附加参数最后套用（酒馆同序：先并进主体，再排除，再覆盖标头）。
        applyRequestExtras(body, headers, readRequestExtras(overrides));
        let payload;
        try {
            payload = await withTimeout((async () => {
                const response = await fetchFn(url, {
                    method: 'POST',
                    headers,
                    signal: controller.signal,
                    body: JSON.stringify(body),
                });
                if (!response?.ok) throw await httpErrorWithBody(response, url, apiKey);
                return response.json();
            })(), timeoutMs, signal, () => controller.abort());
        } catch (error) {
            if (error?.name === 'AbortError') throw new Error('模型请求已取消');
            if (error?.httpStatus !== undefined || error?.httpEndpoint) {
                // 已带齐状态码/端点/响应原因的 HTTP 错误：详情就是从响应里读的，不再包一层。
                error.httpEndpoint = error.httpEndpoint || url;
                throw error;
            }
            // 网络失败/超时等没有响应体的错误：包一层原因，端点信息照样带上供体检日志定位。
            const wrapped = new Error(`模型接口请求失败：${error?.message ?? error}`);
            wrapped.httpEndpoint = url;
            throw wrapped;
        } finally {
            signal?.removeEventListener('abort', onAbort);
        }
        const content = isAnthropic
            ? (Array.isArray(payload?.content) ? payload.content.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('') : undefined)
            : payload?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) throw new Error('模型返回内容为空');
        return content;
    }

    /**
     * complete 的体检壳：记一笔"谁在什么时候调了模型、成功没、报错什么、多久、哪个模型"，
     * 然后原样转发给 completeInner。label 由各调用点自报（纳戒决定/世界决定/人物记录…），
     * 没报的记"未标注调用"。抛错原样上抛，调用方的失败处理一行不用改。
     * 空返回重试：自定义接口偶发 HTTP 200 + 空 content、酒馆静默路径也可能带回空串
     * （真机一天踩了三次）——只对"内容为空"重试，其余错误一律原样上抛。
     * 次数与间隔每次调用现读设置（llm.emptyRetry / llm.emptyRetryWait）：
     * 站点有 RPM 限制就把间隔调大，别让重试把额度烧光。
     */
    const EMPTY_RETRY_DEFAULT_COUNT = 1;
    const EMPTY_RETRY_DEFAULT_WAIT_MS = 600;
    /** 空回重试参数现读：次数 0＝不重试、负数/非整数回落默认 1；间隔正数（秒）生效，其余回落默认 0.6 秒。 */
    function emptyRetryPlan() {
        const llm = getSettings()?.llm ?? {};
        const count = Number(llm.emptyRetry);
        const wait = Number(llm.emptyRetryWait);
        return {
            count: Number.isInteger(count) && count >= 0 ? count : EMPTY_RETRY_DEFAULT_COUNT,
            waitMs: Number.isFinite(wait) && wait > 0 ? wait * 1000 : EMPTY_RETRY_DEFAULT_WAIT_MS,
        };
    }
    /** 失败的体检条目：错误文本上限 600（详情化后 body/端点都进文本），另带结构化的
     *  状态码/端点/响应片段（没有就空串）；同时在控制台留一份完整详情方便排查。 */
    function recordFailure({ label, model, ms, error, at }) {
        const message = String(error?.message ?? error).slice(0, 600);
        const status = Number.isFinite(error?.httpStatus) ? error.httpStatus : null;
        const endpoint = typeof error?.httpEndpoint === 'string' && error.httpEndpoint ? error.httpEndpoint : '';
        const body = typeof error?.httpBody === 'string' && error.httpBody ? error.httpBody : '';
        recordCall({ at: at ?? new Date().toISOString(), label, ok: false, model, ms, chars: 0, error: message, status, endpoint, body });
        try { console.warn(`[doupo-agent] 模型调用失败｜${label}｜${message}`, body ? `响应体：${body}` : ''); } catch { /* 控制台不可用忽略 */ }
        return message;
    }
    async function complete(args = {}) {
        args = { ...args, owner: capture() };
        const label = typeof args?.label === 'string' && args.label.trim() ? args.label.trim() : '未标注调用';
        const model = describeConnection(args);
        const startedAt = Date.now();
        let lastError = null;
        const { count, waitMs } = emptyRetryPlan();
        inFlightLabels.add(label);
        notifyActivity(label, 'start');
        try {
            for (let attempt = 0; attempt <= count; attempt++) {
                if (attempt > 0) await abortableDelay(waitMs, args.signal);
                try {
                    const reply = await completeInner(args);
                    if (typeof reply === 'string' && reply.trim()) {
                        recordCall({ at: new Date().toISOString(), label, ok: true, model, ms: Date.now() - startedAt, chars: reply.length, error: attempt > 0 ? `空回重试${attempt}次后成功` : '' });
                        return reply;
                    }
                    lastError = new Error('模型返回内容为空');
                } catch (error) {
                    lastError = error;
                    const message = String(error?.message ?? error);
                    if (!message.includes('内容为空')) {
                        recordFailure({ label, model, ms: Date.now() - startedAt, error });
                        throw error;
                    }
                }
            }
            recordFailure({ label, model, ms: Date.now() - startedAt, error: lastError });
            throw lastError;
        } finally {
            inFlightLabels.delete(label);
            notifyActivity(label, 'end');
        }
    }

    /** 体检读数：每次调用一笔（副本，改不动原件）。 */
    function callLog() {
        return callLogEntries.map(item => ({ ...item }));
    }

    /** 清空体检记录（面板上的"清零"按钮）。 */
    function clearCallLog() {
        callLogEntries.length = 0;
    }

    async function interpret({ input, state, allowedFields, categories, signal, overrides }) {
        needText(input, 'input');
        const raw = await complete({
            system: INTERPRET_SYSTEM,
            user: buildInterpretPrompt({ input, state, allowedFields, categories }),
            signal,
            label: '意图解析',
            ...(overrides && typeof overrides === 'object' ? { overrides } : {}),
        });
        return normalizeInterpretation(extractJson(raw), { allowedFields });
    }

    /** 类别判定：system 是可改的类别规则，输出复用行动单的校验管道。失败直接抛出，由调用方退回初步解析。 */
    async function adjudicateAction({ system, categoryLabel, input, state, allowedFields, preliminary, signal, overrides } = {}) {
        needText(input, 'input');
        if (typeof system !== 'string' || !system.trim()) throw new Error('缺少类别判定提示词');
        const raw = await complete({
            system,
            user: buildAdjudicatePrompt({ categoryLabel, input, state, allowedFields, preliminary }),
            signal,
            label: '行动判定',
            ...(overrides && typeof overrides === 'object' ? { overrides } : {}),
        });
        const normalized = normalizeInterpretation(extractJson(raw), { allowedFields });
        return { effects: normalized.effects, outcome: normalized.outcome, rejectedEffects: normalized.rejectedEffects };
    }

    /**
     * Narrowing step: recall produced a wide candidate list, the model picks
     * from it. Ids outside the list are dropped, never trusted.
     */
    async function selectSettings({ input, recentTexts, candidates, budget, maxItems, asOf, signal, overrides }) {
        needText(input, 'input');
        const list = Array.isArray(candidates) ? candidates : [];
        if (!list.length) return { needs: [], gaps: [], dropped: 0 };
        const allowed = new Set(list.map(item => item.id));
        const raw = await complete({
            system: SELECT_SYSTEM,
            user: buildSettingSelectPrompt({ input, recentTexts, candidates: list, budget, maxItems, asOf }),
            signal,
            label: '设定挑选',
            ...(overrides && typeof overrides === 'object' ? { overrides } : {}),
        });
        let parsed;
        try {
            parsed = extractJson(raw);
        } catch {
            return { needs: [], gaps: [], dropped: 0, error: '设定选择没有返回可解析的 JSON' };
        }
        const cap = Number.isInteger(maxItems) && maxItems > 0 ? maxItems : 8;
        const needs = [];
        let dropped = 0;
        for (const item of Array.isArray(parsed?.needs) ? parsed.needs : []) {
            if (needs.length >= cap) { dropped++; continue; }
            const id = typeof item?.id === 'string' ? item.id.trim() : '';
            if (!allowed.has(id)) { dropped++; continue; }
            const layer = ['full', 'summary', 'mention'].includes(item?.layer) ? item.layer : 'summary';
            needs.push({ id, layer, why: typeof item?.why === 'string' ? item.why.slice(0, 120) : '' });
        }
        const gaps = Array.isArray(parsed?.gaps)
            ? parsed.gaps.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim().slice(0, 120)).slice(0, 8)
            : [];
        return { needs, gaps, dropped };
    }

    async function compose({ input, facts, changes, state, outcome, taskType, signal, overrides }) {
        needText(input, 'input');
        const raw = await complete({
            system: COMPOSE_SYSTEM,
            user: buildComposePrompt({ input, facts, changes, state, outcome, taskType }),
            signal,
            label: '正文撰写',
            ...(overrides && typeof overrides === 'object' ? { overrides } : {}),
        });
        let parsed;
        try {
            parsed = extractJson(raw);
        } catch {
            return { text: raw.trim().slice(0, 20000), claims: [] };
        }
        const text = typeof parsed?.text === 'string' ? parsed.text.trim().slice(0, 20000) : raw.trim().slice(0, 20000);
        return { text, claims: Array.isArray(parsed?.claims) ? parsed.claims : [] };
    }

    return Object.freeze({
        configured, availableFor, interpret, adjudicateAction, selectSettings, compose, complete, callLog, clearCallLog, isQuietBusy, onQuietIdle,
        activeLabels: () => [...inFlightLabels],
        onActivity: listener => {
            if (typeof listener !== 'function') return () => {};
            activityListeners.add(listener);
            return () => activityListeners.delete(listener);
        },
    });
}
