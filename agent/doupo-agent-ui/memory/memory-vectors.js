/**
 * 记忆向量索引：给混合检索（memory-retrieve.js）提供可选的语义相似度输入。
 *
 * 设计要点（对应 MemPalace 的可插拔检索层）：
 * - store 可注入：浏览器默认 IndexedDB（按聊天隔离，随聊天切换换键）；Node/无 IDB 环境
 *   自动退化为内存 Map（重启后重建，正确性不受影响）。
 * - hash = f(model, 文本)：换模型或改文本自动失效重嵌；sync 按 hash 差异化补嵌，每次限量，
 *   fire-and-forget，绝不阻塞落账。
 * - 任何失败静默降级：embed 抛错、存储失败都只计入统计，绝不把异常抛进召回链。
 */

const SYNC_BUDGET = 8;

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

/** djb2 文本指纹：只为缓存失效判断，不追求抗碰撞。 */
export function hashText(value) {
    const body = typeof value === 'string' ? value : String(value ?? '');
    let hash = 5381;
    for (let i = 0; i < body.length; i++) {
        hash = ((hash << 5) + hash + body.charCodeAt(i)) >>> 0;
    }
    return `h${hash.toString(16)}`;
}

/** 余弦相似度：形状不齐/零向量/非数值一律 0，绝不抛。 */
export function cosineSimilarity(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        const x = Number(a[i]);
        const y = Number(b[i]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
        dot += x * y;
        normA += x * x;
        normB += y * y;
    }
    if (!normA || !normB) return 0;
    return dot / Math.sqrt(normA * normB);
}

/**
 * 向量存储：浏览器默认 IndexedDB（库 doupo-agent-vectors，按 chat 字段建索引）；
 * 无 IndexedDB 时退化内存 Map。所有方法返回 Promise，调用方负责 try/catch。
 */
export function createMemoryVectorStore({ databaseName = 'doupo-agent-vectors', storeName = 'vectors', indexedDB = null } = {}) {
    const memory = new Map();
    let dbPromise = null;
    function backend() {
        return indexedDB ?? (typeof globalThis !== 'undefined' ? globalThis.indexedDB : null) ?? null;
    }
    function open() {
        const factory = backend();
        if (!factory) return null;
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                const request = factory.open(databaseName, 1);
                request.onupgradeneeded = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains(storeName)) {
                        const store = db.createObjectStore(storeName, { keyPath: 'key' });
                        store.createIndex('chat', 'chat', { unique: false });
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error ?? new Error('indexeddb_open_failed'));
            });
        }
        return dbPromise;
    }
    function recordKey(chat, id) {
        return `${chat}\u0000${id}`;
    }
    async function all(chat) {
        const db = await open();
        if (!db) {
            const rows = [];
            for (const record of memory.values()) {
                if (record.chat === chat) rows.push(record);
            }
            return rows;
        }
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const request = transaction.objectStore(storeName).index('chat').getAll(chat);
            request.onsuccess = () => resolve(request.result ?? []);
            request.onerror = () => reject(request.error ?? new Error('indexeddb_read_failed'));
        });
    }
    async function putMany(records) {
        if (!records.length) return;
        const db = await open();
        if (!db) {
            for (const record of records) memory.set(record.key, record);
            return;
        }
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            for (const record of records) store.put(record);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error ?? new Error('indexeddb_write_failed'));
        });
    }
    async function clear(chat) {
        const db = await open();
        if (!db) {
            for (const [key, record] of [...memory.entries()]) {
                if (record.chat === chat) memory.delete(key);
            }
            return;
        }
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName).index('chat');
            const request = store.getAllKeys(chat);
            request.onsuccess = () => {
                const keys = request.result ?? [];
                const objectStore = transaction.objectStore(storeName);
                for (const key of keys) objectStore.delete(key);
            };
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error ?? new Error('indexeddb_clear_failed'));
        });
    }
    return Object.freeze({ all, putMany, clear, recordKey });
}

/**
 * 记忆向量索引：sync 差异化补嵌 / queryVector 查询向量 / similarities 相似度表 / stats 统计。
 * chatKey 是函数（随聊天切换换键）；embed 是 embedding-client.embed；textOf 定制嵌什么文本。
 */
export function createMemoryVectorIndex({ store = null, embed = null, model = () => '', chatKey = () => 'default', textOf = entry => (typeof entry?.text === 'string' ? entry.text : '') } = {}) {
    const vectorStore = store ?? createMemoryVectorStore();
    let chain = Promise.resolve();
    let queryMemo = { hash: '', vector: null };

    function entryHash(entry, modelId) {
        return hashText(`${modelId}\u0000${textOf(entry)}`);
    }

    /**
     * 差异化补嵌：只嵌 hash/model 与存储不一致的条目，单次至多 budget 条。
     * 串行化（chain）防止落账风暴并发重嵌；返回 { embedded, remaining, failed }。
     */
    function sync(snapshot = {}, { budget = SYNC_BUDGET } = {}) {
        const run = chain.catch(() => {}).then(async () => {
            const entries = (Array.isArray(snapshot?.entries) ? snapshot.entries : [])
                .filter(entry => entry && entry.text && !entry.supersededBy);
            const modelId = typeof model === 'function' ? text(model()) : text(model);
            if (!embed || !entries.length || !modelId) {
                return { embedded: 0, remaining: 0, failed: 0, model: modelId };
            }
            const chat = String(chatKey() ?? 'default');
            let stored;
            try {
                stored = new Map((await vectorStore.all(chat)).map(record => [record.id, record]));
            } catch {
                return { embedded: 0, remaining: 0, failed: 0, model: modelId };
            }
            const cap = Number.isInteger(budget) && budget >= 1 ? budget : SYNC_BUDGET;
            const stale = entries
                .filter(entry => {
                    const record = stored.get(entry.id);
                    return !record || record.hash !== entryHash(entry, modelId) || record.model !== modelId;
                });
            if (!stale.length) {
                return { embedded: 0, remaining: 0, failed: 0, model: modelId };
            }
            const pending = stale.slice(0, cap);
            let vectors;
            try {
                ({ vectors } = await embed(pending.map(entry => textOf(entry))));
            } catch {
                return { embedded: 0, remaining: stale.length, failed: pending.length, model: modelId };
            }
            const records = pending.map((entry, position) => ({
                key: vectorStore.recordKey(chat, entry.id),
                chat,
                id: entry.id,
                hash: entryHash(entry, modelId),
                model: modelId,
                vector: vectors[position] ?? null,
            })).filter(record => Array.isArray(record.vector));
            try {
                await vectorStore.putMany(records);
            } catch {
                return { embedded: 0, remaining: stale.length, failed: pending.length, model: modelId };
            }
            return { embedded: records.length, remaining: Math.max(0, stale.length - records.length), failed: pending.length - records.length, model: modelId };
        });
        chain = run.catch(() => {});
        return run;
    }

    /** 查询向量：同文本带 memo（同一轮里目录与兜底共用一次调用）。失败返回 null。 */
    async function queryVector(value) {
        const body = typeof value === 'string' ? value.trim() : '';
        if (!body || !embed) return null;
        const fingerprint = hashText(`${model()}\u0000${body}`);
        if (queryMemo.hash === fingerprint && queryMemo.vector) return queryMemo.vector;
        try {
            const { vectors } = await embed([body]);
            const vector = vectors?.[0] ?? null;
            if (vector) queryMemo = { hash: fingerprint, vector };
            return vector;
        } catch {
            return null;
        }
    }

    /** 相似度表：Map<编号, 余弦相似度>，只含有向量的条目；查询向量为空返回空 Map。 */
    async function similarities(snapshot = {}, query = null) {
        const result = new Map();
        if (!query || !Array.isArray(query)) return result;
        const entries = (Array.isArray(snapshot?.entries) ? snapshot.entries : [])
            .filter(entry => entry && !entry.supersededBy);
        if (!entries.length) return result;
        let stored;
        try {
            stored = new Map((await vectorStore.all(String(chatKey() ?? 'default'))).map(record => [record.id, record]));
        } catch {
            return result;
        }
        for (const entry of entries) {
            const vector = stored.get(entry.id)?.vector;
            if (Array.isArray(vector)) result.set(entry.id, cosineSimilarity(query, vector));
        }
        return result;
    }

    /** 统计：账本总数 vs 已有当前指纹向量的条数（体检与面板用）。 */
    async function stats(snapshot = {}) {
        const entries = (Array.isArray(snapshot?.entries) ? snapshot.entries : [])
            .filter(entry => entry && entry.text && !entry.supersededBy);
        const modelId = typeof model === 'function' ? text(model()) : text(model);
        let embedded = 0;
        if (entries.length && modelId) {
            try {
                const stored = new Map((await vectorStore.all(String(chatKey() ?? 'default'))).map(record => [record.id, record]));
                for (const entry of entries) {
                    const record = stored.get(entry.id);
                    if (record && record.hash === entryHash(entry, modelId)) embedded += 1;
                }
            } catch { /* 存储不可用就报 0 */ }
        }
        return { total: entries.length, embedded, model: modelId };
    }

    /** 清空当前聊天的向量缓存（换 embedding 模型/重建索引用）。 */
    async function clear() {
        try {
            await vectorStore.clear(String(chatKey() ?? 'default'));
        } catch { /* 清不掉就让它自然过期 */ }
        queryMemo = { hash: '', vector: null };
    }

    return Object.freeze({ sync, queryVector, similarities, stats, clear });
}
