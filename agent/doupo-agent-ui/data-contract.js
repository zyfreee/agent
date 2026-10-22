const KINDS = new Set(['character', 'location', 'faction', 'item', 'resource', 'ability', 'rule', 'task', 'storyline', 'event', 'action', 'game-time', 'world-change', 'fact', 'source', 'session', 'branch']);
const WRITERS = new Set(['facts', 'npcs', 'world', 'actions', 'impacts', 'state', 'coordinator', 'player', 'host']);
const READERS = new Set(['player', 'npc', 'world', 'actions', 'narrative', 'ui', 'coordinator', 'host']);
const VALUE_TYPES = new Set(['string', 'number', 'boolean', 'object', 'array', 'null']);

function need(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}

/** Runtime registry for stable object/field contracts; validates metadata only, not host persistence. */
export function createDataContractRegistry({ maxObjects = 2000 } = {}) {
    if (!Number.isInteger(maxObjects) || maxObjects < 1 || maxObjects > 20000) throw new RangeError('maxObjects 超出范围');
    const objects = new Map();
    const migrations = new Map();
    function register(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('合同对象必须是对象');
        const id = need(raw.id, 'id'); const kind = need(raw.kind, 'kind');
        if (!KINDS.has(kind)) throw new TypeError(`不支持的对象 kind：${kind}`);
        if (objects.has(id)) throw new Error(`稳定 ID 已登记：${id}`);
        if (objects.size >= maxObjects) return { status: 'blocked', reason: 'object_limit' };
        const name = need(raw.name, 'name'); const writer = need(raw.writer, 'writer');
        if (!WRITERS.has(writer)) throw new TypeError(`writer 未登记：${writer}`);
        if (!Array.isArray(raw.readers) || raw.readers.length < 1 || raw.readers.length > READERS.size || raw.readers.some(reader => !READERS.has(reader)) || new Set(raw.readers).size !== raw.readers.length) throw new TypeError('readers 必须是唯一且已登记的读取者数组');
        const version = need(raw.version, 'version');
        const fields = raw.fields ?? [];
        if (!Array.isArray(fields) || fields.length > 200) throw new TypeError('fields 必须是有界数组');
        const fieldNames = new Set();
        const normalizedFields = fields.map(field => {
            if (!field || typeof field !== 'object' || Array.isArray(field)) throw new TypeError('字段合同必须是对象');
            const fieldId = need(field.id, 'field.id');
            if (fieldNames.has(fieldId)) throw new Error(`字段 ID 重复：${fieldId}`);
            fieldNames.add(fieldId);
            if (!VALUE_TYPES.has(field.type)) throw new TypeError(`字段 ${fieldId} type 无效`);
            if (field.defaultValue !== undefined && (field.defaultValue === null ? 'null' : Array.isArray(field.defaultValue) ? 'array' : typeof field.defaultValue) !== field.type) throw new TypeError(`字段 ${fieldId} 默认值类型不匹配`);
            const hasDefault = Object.hasOwn(field, 'defaultValue');
            if (!hasDefault && typeof field.missingMeaning !== 'string') throw new TypeError(`字段 ${fieldId} 缺少缺失含义`);
            const fieldWriter = field.writer ?? writer;
            if (!WRITERS.has(fieldWriter)) throw new TypeError(`字段 ${fieldId} writer 未登记`);
            return Object.freeze({ id: fieldId, type: field.type, required: field.required === true, hasDefault, ...(hasDefault ? { defaultValue: structuredClone(field.defaultValue) } : {}), missingMeaning: field.missingMeaning ?? null, writer: fieldWriter });
        });
        const record = Object.freeze({ id, kind, name, aliases: Object.freeze((raw.aliases ?? []).map(value => need(value, 'alias'))), sourceIds: Object.freeze((raw.sourceIds ?? []).map(value => need(value, 'sourceId'))), creator: need(raw.creator, 'creator'), writer, readers: Object.freeze([...raw.readers]), version, fields: Object.freeze(normalizedFields) });
        objects.set(id, record);
        return { status: 'registered', object: structuredClone(record) };
    }
    function get(id) { const item = objects.get(id); return item ? structuredClone(item) : undefined; }
    function validateValue({ objectId, fieldId, value, writer, reader } = {}) {
        objectId = need(objectId, 'objectId'); fieldId = need(fieldId, 'fieldId');
        const object = objects.get(objectId);
        if (!object) return { status: 'rejected', reason: 'unknown_object' };
        const field = object.fields.find(item => item.id === fieldId);
        if (!field) return { status: 'rejected', reason: 'unknown_field' };
        if (writer !== undefined && writer !== field.writer) return { status: 'rejected', reason: 'not_sole_writer', expectedWriter: field.writer };
        if (reader !== undefined && !object.readers.includes(reader)) return { status: 'rejected', reason: 'reader_not_allowed' };
        const actualType = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== field.type) return { status: 'rejected', reason: 'type_mismatch', expected: field.type, actual: actualType };
        return { status: 'accepted', objectId, fieldId, value: structuredClone(value), version: object.version, writer: field.writer };
    }
    function migrate({ objectId, fromVersion, toVersion, mapping } = {}) {
        objectId = need(objectId, 'objectId'); fromVersion = need(fromVersion, 'fromVersion'); toVersion = need(toVersion, 'toVersion');
        const object = objects.get(objectId);
        if (!object) return { status: 'rejected', reason: 'unknown_object' };
        if (object.version !== toVersion) return { status: 'rejected', reason: 'target_version_not_current', currentVersion: object.version };
        if (typeof mapping !== 'function') throw new TypeError('mapping 必须是显式本地迁移函数');
        const key = `${objectId}\u0000${fromVersion}\u0000${toVersion}`;
        if (migrations.has(key)) return { status: 'rejected', reason: 'migration_already_registered' };
        migrations.set(key, mapping);
        return { status: 'registered', objectId, fromVersion, toVersion };
    }
    function applyMigration({ objectId, fromVersion, toVersion, data } = {}) {
        objectId = need(objectId, 'objectId'); fromVersion = need(fromVersion, 'fromVersion'); toVersion = need(toVersion, 'toVersion');
        const fn = migrations.get(`${objectId}\u0000${fromVersion}\u0000${toVersion}`);
        if (!fn) return { status: 'rejected', reason: 'migration_missing' };
        const migrated = fn(structuredClone(data));
        if (!migrated || typeof migrated !== 'object' || Array.isArray(migrated)) return { status: 'rejected', reason: 'invalid_migration_result' };
        return { status: 'candidate', objectId, fromVersion, toVersion, data: structuredClone(migrated), committed: false };
    }
    function list() { return [...objects.values()].map(item => structuredClone(item)); }
    function clear() { objects.clear(); migrations.clear(); }
    return Object.freeze({ register, get, validateValue, migrate, applyMigration, list, clear });
}
