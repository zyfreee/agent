const TASKS = Object.freeze({
    query: ['ordinary_interaction', 'system_operation'],
    action: ['explicit_action', 'complex_action'],
    world: ['time_advance'],
});

function makeAdapter(id, api, method, taskTypes, stateChanging = false, dependsOn = []) {
    return Object.freeze({
        id, taskTypes, stateChanging, dependsOn,
        run: async ({ input }) => {
            if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError(`模块 ${id} 需要结构化 input`);
            const result = await api[method](input);
            return Object.freeze({ moduleId: id, result });
        },
    });
}

/** Explicit allowlist of adapters; deliberately avoids auto-discovering arbitrary object methods. */
export function registerAgentModules(runner, { facts, actions, world } = {}) {
    if (!runner || typeof runner.register !== 'function') throw new TypeError('runner 必须提供 register');
    const registrations = [];
    const adapters = [
        facts && makeAdapter('facts-query', facts, 'query', TASKS.query),
        actions && makeAdapter('action-resolve', actions, 'resolve', TASKS.action, true),
        world && makeAdapter('world-advance', world, 'advance', TASKS.world, true),
    ].filter(Boolean);
    try {
        for (const adapter of adapters) registrations.push(runner.register(adapter));
    } catch (error) {
        for (const unregister of registrations.reverse()) unregister();
        throw error;
    }
    return Object.freeze({ registered: adapters.map(({ id }) => id), dispose() { for (const unregister of registrations.splice(0).reverse()) unregister(); } });
}
