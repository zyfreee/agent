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

function needText(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
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
    const ambiguities = Array.isArray(object.ambiguities) ? object.ambiguities.filter(item => typeof item === 'string' && item.trim()).slice(0, 32) : [];
    const requiredModules = Array.isArray(object.requiredModules) ? object.requiredModules.filter(item => typeof item === 'string' && item.trim()).slice(0, 32) : [];
    const days = Number.isFinite(Number(object.days)) && Number(object.days) > 0 ? Math.min(365, Math.floor(Number(object.days))) : 1;
    return {
        type,
        task,
        confidence,
        explicitAction: object.explicitAction === true,
        playerAction,
        effects,
        rejectedEffects,
        outcome: typeof object.outcome === 'string' ? object.outcome.slice(0, 500) : '',
        days,
        ambiguities,
        requiredModules,
    };
}

export function buildInterpretPrompt({ input, state, allowedFields }) {
    const fields = Array.isArray(allowedFields) ? allowedFields : [];
    const current = field => {
        const value = state && typeof state === 'object' ? state?.[field.targetId]?.[field.field] : undefined;
        return value === undefined ? '未设定' : JSON.stringify(value);
    };
    const fieldList = fields
        .map(field => `- ${field.targetId}.${field.field}（${field.type}，当前 ${current(field)}${field.writer ? `，写入者 ${field.writer}` : ''}）`)
        .join('\n') || '- （没有可用字段）';
    return [
        '请把玩家这一轮的消息解析成下面这个 JSON 结构：',
        '{"type":"query|conversation|explicit_action|time_advance|due_event|historical_operation|system_operation|unclear",',
        ' "task":"ordinary_interaction|explicit_action|complex_action|system_operation|historical_operation|time_advance|unclear",',
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
        `当前状态：${state && typeof state === 'object' ? JSON.stringify(state) : '{}'}`,
        '',
        `玩家消息：${input}`,
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

function withTimeout(promise, timeoutMs, signal) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`模型请求超过 ${timeoutMs}ms 未返回`)), timeoutMs);
        const onAbort = () => { clearTimeout(timer); reject(new Error('模型请求已取消')); };
        if (signal?.aborted) return onAbort();
        signal?.addEventListener('abort', onAbort, { once: true });
        Promise.resolve(promise).then(
            value => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); resolve(value); },
            error => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); reject(error); },
        );
    });
}

/** Real model client: reuses the Tavern connection by default, or an OpenAI-compatible endpoint. */
export function createLlmClient({ getSettings, getContext, fetchImpl } = {}) {
    if (typeof getSettings !== 'function') throw new TypeError('getSettings 必须是函数');

    function resolveConnection() {
        const settings = getSettings() ?? {};
        const llm = settings.llm ?? {};
        const context = getContext?.();
        if (llm.useSillyTavernConnection !== false && typeof context?.generateQuietPrompt === 'function') {
            return { kind: 'sillytavern', context, llm };
        }
        if (typeof llm.baseUrl === 'string' && llm.baseUrl.trim() && typeof llm.model === 'string' && llm.model.trim()) {
            return { kind: 'openai', llm, fetchImpl: fetchImpl ?? globalThis.fetch };
        }
        return null;
    }

    function configured() {
        return resolveConnection() !== null;
    }

    async function complete({ system, user, jsonSchema, signal }) {
        const connection = resolveConnection();
        if (!connection) {
            const error = new Error('模型连接未配置：请启用“使用酒馆当前连接”，或填写接口地址与模型名称。');
            error.code = 'llm_not_configured';
            throw error;
        }
        const llm = connection.llm ?? {};
        const temperature = Number.isFinite(Number(llm.temperature)) ? Number(llm.temperature) : 0.7;
        const maxTokens = Number.isFinite(Number(llm.maxTokens)) ? Math.max(64, Math.floor(Number(llm.maxTokens))) : 2048;
        const timeoutMs = Number.isFinite(Number(llm.timeoutMs)) ? Math.min(600000, Math.max(1000, Math.floor(Number(llm.timeoutMs)))) : 60000;

        if (connection.kind === 'sillytavern') {
            // 酒馆文档里的签名是对象形式 generateQuietPrompt({ quietPrompt, jsonSchema })。
            // 早先这里传的是位置参数 (prompt, false, true)，第三个参数 quietToLoud=true
            // 会让静默生成的 JSON 直接落进聊天记录，必须用对象形式。
            const options = { quietPrompt: `${system}\n\n${user}` };
            if (jsonSchema && typeof jsonSchema === 'object') options.jsonSchema = jsonSchema;
            const reply = await withTimeout(Promise.resolve(connection.context.generateQuietPrompt(options)), timeoutMs, signal);
            return typeof reply === 'string' ? reply : String(reply?.text ?? '');
        }

        const fetchFn = connection.fetchImpl;
        if (typeof fetchFn !== 'function') throw new Error('当前环境没有可用的网络请求接口');
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        if (signal?.aborted) onAbort();
        else signal?.addEventListener('abort', onAbort, { once: true });
        const url = `${String(llm.baseUrl).replace(/\/+$/, '')}/chat/completions`;
        const headers = { 'content-type': 'application/json' };
        if (typeof llm.apiKey === 'string' && llm.apiKey.trim()) headers.authorization = `Bearer ${llm.apiKey.trim()}`;
        let response;
        try {
            response = await withTimeout(fetchFn(url, {
                method: 'POST',
                headers,
                signal: controller.signal,
                body: JSON.stringify({
                    model: llm.model,
                    temperature,
                    max_tokens: maxTokens,
                    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
                }),
            }), timeoutMs, signal);
        } catch (error) {
            if (error?.name === 'AbortError') throw new Error('模型请求已取消');
            throw new Error(`模型接口请求失败：${error?.message ?? error}`);
        } finally {
            signal?.removeEventListener('abort', onAbort);
        }
        if (!response?.ok) throw new Error(`模型接口返回 HTTP ${response?.status ?? '未知'}`);
        const payload = await response.json();
        const content = payload?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) throw new Error('模型返回内容为空');
        return content;
    }

    async function interpret({ input, state, allowedFields, signal }) {
        needText(input, 'input');
        const raw = await complete({ system: INTERPRET_SYSTEM, user: buildInterpretPrompt({ input, state, allowedFields }), signal });
        return normalizeInterpretation(extractJson(raw), { allowedFields });
    }

    /**
     * Narrowing step: recall produced a wide candidate list, the model picks
     * from it. Ids outside the list are dropped, never trusted.
     */
    async function selectSettings({ input, recentTexts, candidates, budget, maxItems, asOf, signal }) {
        needText(input, 'input');
        const list = Array.isArray(candidates) ? candidates : [];
        if (!list.length) return { needs: [], gaps: [], dropped: 0 };
        const allowed = new Set(list.map(item => item.id));
        const raw = await complete({
            system: SELECT_SYSTEM,
            user: buildSettingSelectPrompt({ input, recentTexts, candidates: list, budget, maxItems, asOf }),
            signal,
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

    async function compose({ input, facts, changes, state, outcome, taskType, signal }) {
        needText(input, 'input');
        const raw = await complete({ system: COMPOSE_SYSTEM, user: buildComposePrompt({ input, facts, changes, state, outcome, taskType }), signal });
        let parsed;
        try {
            parsed = extractJson(raw);
        } catch {
            return { text: raw.trim().slice(0, 20000), claims: [] };
        }
        const text = typeof parsed?.text === 'string' ? parsed.text.trim().slice(0, 20000) : raw.trim().slice(0, 20000);
        return { text, claims: Array.isArray(parsed?.claims) ? parsed.claims : [] };
    }

    return Object.freeze({ configured, interpret, selectSettings, compose, complete });
}
