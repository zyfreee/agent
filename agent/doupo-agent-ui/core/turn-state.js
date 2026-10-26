/**
 * Canonical turn state: the small set of fields a turn is allowed to change.
 * Every field is registered as a data contract, so the quality gate can reject
 * any write that was never declared instead of silently accepting free text.
 */
const DEFAULT_OBJECTS = Object.freeze([
    Object.freeze({
        id: 'player',
        kind: 'character',
        name: '玩家角色',
        writer: 'actions',
        readers: ['player', 'ui', 'narrative', 'actions'],
        creator: 'host',
        version: '1',
        fields: Object.freeze([
            Object.freeze({ id: 'hp', type: 'number', defaultValue: 100, required: true }),
            Object.freeze({ id: 'douqi', type: 'number', defaultValue: 10, required: true }),
            Object.freeze({ id: 'gold', type: 'number', defaultValue: 0, required: true }),
            Object.freeze({ id: 'reputation', type: 'number', defaultValue: 0, required: true }),
            Object.freeze({ id: 'realm', type: 'string', defaultValue: '斗之气三段', required: true }),
            Object.freeze({ id: 'location', type: 'string', defaultValue: '乌坦城', required: true }),
        ]),
    }),
    Object.freeze({
        id: 'world',
        kind: 'game-time',
        name: '世界时间',
        writer: 'world',
        readers: ['player', 'ui', 'narrative', 'world'],
        creator: 'host',
        version: '1',
        fields: Object.freeze([
            Object.freeze({ id: 'day', type: 'number', defaultValue: 1, required: true }),
            Object.freeze({ id: 'weather', type: 'string', defaultValue: '晴', required: true }),
            Object.freeze({ id: 'region', type: 'string', defaultValue: '乌坦城', required: true }),
        ]),
    }),
]);

export const DEFAULT_STATE_OBJECTS = DEFAULT_OBJECTS;

/** Registers the writable field contracts once per registry. */
export function registerDefaultContracts(registry) {
    if (!registry || typeof registry.register !== 'function' || typeof registry.get !== 'function') throw new TypeError('registry 必须提供 register/get');
    const registered = [];
    for (const object of DEFAULT_OBJECTS) {
        if (registry.get(object.id)) continue;
        const result = registry.register(structuredClone(object));
        if (result.status === 'registered') registered.push(object.id);
    }
    return { status: 'ready', registered, total: DEFAULT_OBJECTS.length };
}

/** Fresh starting state for a new session/branch. */
export function createInitialState() {
    const state = {};
    for (const object of DEFAULT_OBJECTS) {
        const record = {};
        for (const field of object.fields) {
            if (Object.hasOwn(field, 'defaultValue')) record[field.id] = structuredClone(field.defaultValue);
        }
        state[object.id] = record;
    }
    return state;
}

/** Field list used to constrain the model's proposed effects. */
export function listWritableFields(registry) {
    const fields = [];
    for (const object of DEFAULT_OBJECTS) {
        for (const field of object.fields) {
            const registered = registry?.get?.(object.id);
            if (registry && (!registered || !registered.fields.some(item => item.id === field.id))) continue;
            fields.push({ targetId: object.id, field: field.id, type: field.type, writer: registered?.writer ?? object.writer });
        }
    }
    return fields;
}

/** Human-readable field list for prompts. */
export function describeWritableFields(registry) {
    return listWritableFields(registry).map(item => `${item.targetId}.${item.field}（${item.type}）`).join('、');
}

/** Applies already-approved changes to a copy of the state. */
export function applyChanges(state, changes) {
    const next = structuredClone(state && typeof state === 'object' && !Array.isArray(state) ? state : {});
    for (const change of Array.isArray(changes) ? changes : []) {
        if (!change || typeof change !== 'object') continue;
        const targetId = typeof change.targetId === 'string' ? change.targetId : '';
        const field = typeof change.field === 'string' ? change.field : '';
        if (!targetId || !field) continue;
        const target = next[targetId] && typeof next[targetId] === 'object' && !Array.isArray(next[targetId]) ? next[targetId] : (next[targetId] = {});
        if (change.type === 'remove') delete target[field];
        else if (change.type === 'add') {
            const before = typeof target[field] === 'number' ? target[field] : 0;
            target[field] = before + Number(change.value ?? 0);
        } else target[field] = structuredClone(change.value);
    }
    return next;
}

/** Compact state line used by the narration prompt. */
export function summarizeState(state) {
    const lines = [];
    for (const [targetId, record] of Object.entries(state ?? {})) {
        if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
        const pairs = Object.entries(record).map(([field, value]) => `${field}=${typeof value === 'string' ? value : JSON.stringify(value)}`);
        if (pairs.length) lines.push(`${targetId}: ${pairs.join(', ')}`);
    }
    return lines.join(' | ');
}
