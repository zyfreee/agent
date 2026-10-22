const REQUIRED = Object.freeze([
    Object.freeze({ id: 'host-context', owner: 'sillytavern', symbol: 'SillyTavern.getContext' }),
    Object.freeze({ id: 'event-source', owner: 'sillytavern', symbol: 'context.eventSource' }),
    Object.freeze({ id: 'event-types', owner: 'sillytavern', symbol: 'context.event_types' }),
]);

function readPath(root, path) {
    return path.split('.').reduce((value, key) => value == null ? undefined : value[key], root);
}

function version(value) {
    return typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value) ? value : null;
}

/** Read-only host capability probe; no host mutation and no remote fallback. */
export function probeHostCapabilities({ root = globalThis, getContext } = {}) {
    const contextGetter = getContext ?? readPath(root, 'SillyTavern.getContext');
    const context = typeof contextGetter === 'function' ? contextGetter() : undefined;
    const symbols = [];
    if (typeof contextGetter === 'function') symbols.push('SillyTavern.getContext');
    if (context && typeof context.eventSource?.on === 'function' && typeof context.eventSource?.removeListener === 'function') symbols.push('context.eventSource');
    if (context?.event_types && typeof context.event_types === 'object') symbols.push('context.event_types');
    const missing = REQUIRED.filter(item => !symbols.includes(item.symbol)).map(item => item.id);
    const tavernVersion = version(context?.version ?? readPath(root, 'SillyTavern.version'));
    return Object.freeze({ status: missing.length ? 'degraded' : 'ready', versions: Object.freeze({ sillytavern: tavernVersion }), symbols: Object.freeze(symbols), missing: Object.freeze(missing), fallback: missing.length ? '仅保留本地候选与状态展示，不监听酒馆历史事件，不声称已连接宿主。' : null });
}

export function getRequiredCapabilities() { return REQUIRED.map(item => ({ ...item, required: true, fallback: null })); }
