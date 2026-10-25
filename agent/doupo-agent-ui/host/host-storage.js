import { normalizeTheme } from './control-dashboard.js';

const SETTINGS_KEY = 'doupo_agent_ui';
const CHAT_KEY = 'doupo_agent_state';

const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    enableFactsLibrary: true,
    enableActionResolution: true,
    enableWorldProgress: true,
    enableNpcAutonomy: true,
    enablePlayerImpact: true,
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
    }),
    facts: Object.freeze({
        sourceMode: 'registered',
        maxEntries: 12,
        includeUnverified: false,
    }),
    action: Object.freeze({
        requireConfirmation: true,
        maxCandidates: 5,
        showCostPreview: true,
    }),
    world: Object.freeze({
        autoAdvance: false,
        tickMinutes: 30,
        preserveUnconfirmed: true,
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
    status: Object.freeze({
        showHistory: true,
        showCapabilityBadge: true,
    }),
    schemaVersion: 4,
});

function clone(value) {
    return structuredClone(value);
}

function mergeSettings(current = {}) {
    const source = current && typeof current === 'object' ? current : {};
    const nested = ['llm', 'budget', 'ui', 'facts', 'action', 'world', 'npc', 'impact', 'status'];
    const merged = { ...clone(DEFAULT_SETTINGS), ...source };
    for (const key of nested) {
        const incoming = source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) ? source[key] : {};
        merged[key] = { ...clone(DEFAULT_SETTINGS[key]), ...incoming };
    }
    merged.ui.theme = normalizeTheme(merged.ui.theme);
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
        const nested = ['llm', 'budget', 'ui', 'facts', 'action', 'world', 'npc', 'impact', 'status'];
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

    async function clean() {
        const context = contextOf(getContext);
        if (context?.extensionSettings && typeof context.extensionSettings === 'object') delete context.extensionSettings[SETTINGS_KEY];
        if (context?.chatMetadata && typeof context.chatMetadata === 'object') delete context.chatMetadata[CHAT_KEY];
        if (typeof context?.saveSettingsDebounced === 'function') await context.saveSettingsDebounced();
        if (typeof context?.saveMetadata === 'function') await context.saveMetadata();
        return { status: 'cleaned' };
    }

    return Object.freeze({ settings, updateSettings, saveSettings, chatState, saveChatState, clean, keys: Object.freeze({ SETTINGS_KEY, CHAT_KEY }) });
}

export { DEFAULT_SETTINGS };
