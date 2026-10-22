const SETTINGS_KEY = 'doupo_agent_ui';
const CHAT_KEY = 'doupo_agent_state';

const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    enableWorldProgress: true,
    enableNpcAutonomy: true,
    debug: false,
    schemaVersion: 1,
});

function clone(value) {
    return structuredClone(value);
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
        all[SETTINGS_KEY] = { ...clone(DEFAULT_SETTINGS), ...current };
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

    return Object.freeze({ settings, saveSettings, chatState, saveChatState, clean, keys: Object.freeze({ SETTINGS_KEY, CHAT_KEY }) });
}

export { DEFAULT_SETTINGS };
