import { normalizeTheme } from './control-dashboard.js';
import { normalizeInertia } from '../sandbox/sandbox-mode.js';

const SETTINGS_KEY = 'doupo_agent_ui';
const CHAT_KEY = 'doupo_agent_state';
const WORLD_KEY = 'doupo_agent_world';

const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    enableFactsLibrary: true,
    enableActionResolution: true,
    enableWorldProgress: true,
    enableNpcAutonomy: true,
    enablePlayerImpact: true,
    enableSandboxMode: false,
    showStatusPanel: true,
    debug: false,
    llm: Object.freeze({
        provider: 'openai-compatible',
        baseUrl: '',
        apiKey: '',
        model: '',
        temperature: 0.7,
        maxTokens: 2048,
        timeoutMs: 60000,
        useSillyTavernConnection: true,
    }),
    budget: Object.freeze({
        maxModules: 8,
        totalTimeoutMs: 90000,
        maxNpcDecisions: 3,
    }),
    ui: Object.freeze({
        compact: false,
        theme: 'black',
        placeholder: false,
        // 旧“扩展自己写正文”入口默认关闭：正文交回酒馆主生成，原著设定只做注入。
        legacyTurn: false,
    }),
    facts: Object.freeze({
        sourceMode: 'registered',
        maxEntries: 12,
        includeUnverified: false,
        // 自动判定的进度卷（面板留空时生效）；面板填了以面板为准。
        currentVolume: null,
        currentVolumeSource: null,
    }),
    action: Object.freeze({
        requireConfirmation: true,
        maxCandidates: 5,
        showCostPreview: true,
    }),
    setting: Object.freeze({
        enabled: true,
        progress: null,
        maxCandidates: 40,
        maxItems: 8,
        injectionBudget: 0,
        worldbook: '',
        entries: Object.freeze([]),
    }),
    injection: Object.freeze({
        enabled: true,
        depth: 0,
        maxChars: 0,
    }),
    prompt: Object.freeze({
        select: '',
        lookup: '',
    }),
    world: Object.freeze({
        autoAdvance: false,
        tickMinutes: 30,
        preserveUnconfirmed: true,
        // 世界事件系统：模型回复里带 world 指令块，脚本核验后记账。
        eventEnabled: true,
        eventInject: true,
        eventBudget: 0, // 0 = 用内置默认（900 字）
        eventGuide: '', // 指令指南正文，留空用内置默认
    }),
    npc: Object.freeze({
        maxCandidates: 3,
        requireConfirmation: true,
        allowConflicts: true,
    }),
    impact: Object.freeze({
        trackResources: true,
        showExplanation: true,
        maxChainDepth: 3,
    }),
    sandbox: Object.freeze({
        inertia: 'medium',
        canonCharactersAutonomous: true,
        allowMidgameSwitch: true,
        playerGoalsEnabled: true,
        maxActiveGoals: 4,
        maxNewObjectsPerTurn: 2,
        nodeWindowSlackDays: 7,
    }),
    status: Object.freeze({
        showHistory: true,
        showCapabilityBadge: true,
    }),
    schemaVersion: 6,
});

function clone(value) {
    return structuredClone(value);
}

function mergeSettings(current = {}) {
    const source = current && typeof current === 'object' ? current : {};
    const nested = ['llm', 'budget', 'ui', 'facts', 'setting', 'injection', 'prompt', 'action', 'world', 'npc', 'impact', 'sandbox', 'status'];
    const merged = { ...clone(DEFAULT_SETTINGS), ...source };
    for (const key of nested) {
        const incoming = source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) ? source[key] : {};
        merged[key] = { ...clone(DEFAULT_SETTINGS[key]), ...incoming };
    }
    merged.ui.theme = normalizeTheme(merged.ui.theme);
    merged.sandbox.inertia = normalizeInertia(merged.sandbox.inertia);
    merged.schemaVersion = DEFAULT_SETTINGS.schemaVersion;
    return merged;
}

function contextOf(getContext) {
    return typeof getContext === 'function' ? getContext() : undefined;
}

/** Small adapter for SillyTavern's durable extension/chat scopes. */
export function createHostStorage({ getContext } = {}) {
    function settings() {
        const context = contextOf(getContext);
        if (!context || typeof context !== 'object') return { status: 'unavailable', value: clone(DEFAULT_SETTINGS) };
        const all = context.extensionSettings && typeof context.extensionSettings === 'object' ? context.extensionSettings : null;
        if (!all) return { status: 'unavailable', value: clone(DEFAULT_SETTINGS) };
        const current = all[SETTINGS_KEY] && typeof all[SETTINGS_KEY] === 'object' ? all[SETTINGS_KEY] : {};
        all[SETTINGS_KEY] = mergeSettings(current);
        return { status: 'ready', value: clone(all[SETTINGS_KEY]) };
    }

    function updateSettings(patch = {}) {
        const context = contextOf(getContext);
        const all = context?.extensionSettings;
        if (!all || typeof all !== 'object') return { status: 'unavailable', value: clone(DEFAULT_SETTINGS) };
        const current = all[SETTINGS_KEY] && typeof all[SETTINGS_KEY] === 'object' ? all[SETTINGS_KEY] : {};
        const incoming = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
        const nested = ['llm', 'budget', 'ui', 'facts', 'setting', 'injection', 'prompt', 'action', 'world', 'npc', 'impact', 'sandbox', 'status'];
        const mergedPatch = { ...current, ...incoming };
        for (const key of nested) {
            if (incoming[key] && typeof incoming[key] === 'object' && !Array.isArray(incoming[key])) {
                mergedPatch[key] = { ...(current[key] && typeof current[key] === 'object' ? current[key] : {}), ...incoming[key] };
            }
        }
        all[SETTINGS_KEY] = mergeSettings(mergedPatch);
        return { status: 'ready', value: clone(all[SETTINGS_KEY]) };
    }

    async function saveSettings() {
        const context = contextOf(getContext);
        if (typeof context?.saveSettingsDebounced !== 'function') return { status: 'unavailable' };
        await context.saveSettingsDebounced();
        return { status: 'saved' };
    }

    function chatState() {
        const context = contextOf(getContext);
        const metadata = context?.chatMetadata;
        if (!metadata || typeof metadata !== 'object') return { status: 'unavailable', value: undefined };
        return { status: 'ready', value: metadata[CHAT_KEY] ? clone(metadata[CHAT_KEY]) : undefined };
    }

    async function saveChatState(value) {
        const context = contextOf(getContext);
        if (!context?.chatMetadata || typeof context.chatMetadata !== 'object') return { status: 'unavailable' };
        context.chatMetadata[CHAT_KEY] = clone(value);
        if (typeof context.saveMetadata !== 'function') return { status: 'changed_not_saved' };
        await context.saveMetadata();
        return { status: 'saved' };
    }

    /** 世界台账：跟着聊天走，换聊天读到的就是那一局的世界。 */
    function worldState() {
        const context = contextOf(getContext);
        const metadata = context?.chatMetadata;
        if (!metadata || typeof metadata !== 'object') return { status: 'unavailable', value: undefined };
        return { status: 'ready', value: metadata[WORLD_KEY] && typeof metadata[WORLD_KEY] === 'object' ? clone(metadata[WORLD_KEY]) : undefined };
    }

    async function saveWorldState(value) {
        const context = contextOf(getContext);
        if (!context?.chatMetadata || typeof context.chatMetadata !== 'object') return { status: 'unavailable' };
        if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'rejected' };
        context.chatMetadata[WORLD_KEY] = clone(value);
        if (typeof context.saveMetadata !== 'function') return { status: 'changed_not_saved' };
        await context.saveMetadata();
        return { status: 'saved' };
    }

    async function clean() {
        const context = contextOf(getContext);
        if (context?.extensionSettings && typeof context.extensionSettings === 'object') delete context.extensionSettings[SETTINGS_KEY];
        if (context?.chatMetadata && typeof context.chatMetadata === 'object') {
            delete context.chatMetadata[CHAT_KEY];
            delete context.chatMetadata[WORLD_KEY];
        }
        if (typeof context?.saveSettingsDebounced === 'function') await context.saveSettingsDebounced();
        if (typeof context?.saveMetadata === 'function') await context.saveMetadata();
        return { status: 'cleaned' };
    }

    return Object.freeze({ settings, updateSettings, saveSettings, chatState, saveChatState, worldState, saveWorldState, clean, keys: Object.freeze({ SETTINGS_KEY, CHAT_KEY, WORLD_KEY }) });
}

export { DEFAULT_SETTINGS };
