const DEFAULT_KEY = 'doupo_facts';
const DEFAULT_MAX_CHARS = 2400;
const MAX_DEPTH = 100;
const MAX_USED_IDS = 24;

function clampDepth(value) {
    const depth = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 0;
    return Math.min(MAX_DEPTH, Math.max(0, depth));
}

function readText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * The only module allowed to place original-work text into the main generation
 * prompt. It writes to SillyTavern's extension prompt container, which is read
 * when the prompt is assembled: the text never enters the chat log, the saved
 * chat file, or the world book.
 *
 * Position is IN_CHAT, depth counts back from the newest message, role is
 * SYSTEM, and scanning is off so the injected text cannot re-trigger world book
 * entries and duplicate itself.
 */
export function createPromptInjection({ getContext, key = DEFAULT_KEY, maxChars = DEFAULT_MAX_CHARS } = {}) {
    if (typeof getContext !== 'function') throw new TypeError('getContext 必须是函数');
    if (typeof key !== 'string' || !key.trim()) throw new TypeError('key 必须是非空文本');

    function channel() {
        let context;
        try { context = getContext(); } catch { return null; }
        if (!context || typeof context.setExtensionPrompt !== 'function') return null;
        const types = context.extension_prompt_types;
        const roles = context.extension_prompt_roles;
        return {
            context,
            position: Number.isInteger(types?.IN_CHAT) ? types.IN_CHAT : 1,
            role: Number.isInteger(roles?.SYSTEM) ? roles.SYSTEM : 0,
        };
    }

    // Latest attempt, kept for the settings page: what went in, how many chars, when.
    let last = null;
    const stamp = () => Date.now();

    /** Cheap probe so the settings page can say why injection is off and what went in last turn. */
    function inspect() {
        const value = channel();
        if (!value) return { status: 'unsupported', key, note: '当前酒馆没有 setExtensionPrompt，本轮无法注入原著设定。', last };
        return {
            status: 'ready',
            key,
            note: '扩展提示词通道可用：注入只进当轮提示词，不写聊天记录。',
            position: value.position,
            role: value.role,
            last,
        };
    }

    /** Must run after every generation: the container is global and would leak into later turns. */
    function clear() {
        const value = channel();
        if (!value) return { status: 'unsupported' };
        try {
            value.context.setExtensionPrompt(key, '', value.position, 0, false, value.role);
            if (last) last = { ...last, cleared: true, clearedAt: stamp() };
            return { status: 'cleared' };
        } catch (error) {
            return { status: 'failed', reason: String(error?.message ?? error) };
        }
    }

    function write(injection = {}, options = {}) {
        const value = channel();
        if (!value) return { status: 'unsupported' };
        const body = readText(injection.text);
        if (!body) {
            clear();
            last = { status: 'empty', at: stamp(), cleared: true };
            return { status: 'empty', key };
        }
        // 上限为 0/空 时不截断：选中几条就写几条，交给上下文窗口自己兜底。
        const capValue = Number(options.maxChars ?? maxChars);
        const unlimited = !Number.isFinite(capValue) || capValue <= 0;
        const cap = unlimited ? Infinity : Math.floor(capValue);
        const truncated = body.length > cap;
        const text = truncated ? `${body.slice(0, cap)}\n[…原著设定已按预算截断]` : body;
        const depth = clampDepth(options.depth);
        try {
            value.context.setExtensionPrompt(key, text, value.position, depth, false, value.role);
        } catch (error) {
            last = { status: 'failed', at: stamp(), reason: String(error?.message ?? error) };
            return { status: 'failed', reason: String(error?.message ?? error) };
        }
        const usedIds = Array.isArray(injection.usedIds) ? injection.usedIds.slice(0, MAX_USED_IDS) : [];
        last = { status: 'injected', at: stamp(), chars: text.length, truncated, depth, usedIds, cleared: false };
        return {
            status: 'injected',
            key,
            chars: text.length,
            truncated,
            depth,
            position: value.position,
            role: value.role,
            usedIds,
        };
    }

    return Object.freeze({ key, inspect, write, clear });
}

export { DEFAULT_KEY as PROMPT_INJECTION_KEY, DEFAULT_MAX_CHARS };
