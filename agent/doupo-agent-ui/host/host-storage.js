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
    }),
    schemaVersion: 2,
});

function clone(value) {
    return structuredClone(value);
}

function mergeSettings(current = {}) {
    const source = current && typeof current === 'object' ? current : {};
    return {
        ...clone(DEFAULT_SETTINGS),
        ...source,
        llm: { ...clone(DEFAULT_SETTINGS.llm), ...(source.llm && typeof source.llm === 'object' ? source.llm : {}) },
        budget: { ...clone(DEFAULT_SETTINGS.budget), ...(source.budget && typeof source.budget === 'object' ? source.budget : {}) },
        ui: { ...clone(DEFAULT_SETTINGS.ui), ...(source.ui && typeof source.ui === 'object' ? source.ui : {}) },
        schemaVersion: DEFAULT_SETTINGS.schemaVersion,
    };
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
        all[SETTINGS_KEY] = mergeSettings({ ...current, ...(patch && typeof patch === 'object' ? patch : {}) });
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
