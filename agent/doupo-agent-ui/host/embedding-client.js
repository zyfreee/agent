/**
 * 向量客户端（可选语义检索层）：OpenAI 兼容 `/v1/embeddings` 端点的最小 fetch 客户端。
 *
 * 与 llm-client 的分路 preset 体系刻意分开：酒馆连接做不了 embeddings，语义检索必须
 * 独立端点（LM Studio / vLLM / 各家 embeddings API 都兼容这个形状）。没配置时
 * `available()` 为 false，调用方静默退回纯本地混合检索，整条链路零行为变化。
 *
 * 请求风格照搬 llm-client.listModels：/v1 结尾的地址直接拼 /embeddings，否则补 /v1；
 * 有密钥带 Bearer；AbortController 超时；返回 { model, vectors }，失败抛 Error 由调用方兜底。
 */

const BATCH_SIZE = 16;
const DEFAULT_TIMEOUT_MS = 30000;

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

/** 与 listModels 同款地址约定：/vN 结尾直接接方法名，否则补 /v1。 */
export function embeddingsEndpoint(baseUrl) {
    const base = text(baseUrl).replace(/\/+$/, '');
    if (!base) return '';
    return /\/v\d+$/.test(base) ? `${base}/embeddings` : `${base}/v1/embeddings`;
}

export function createEmbeddingClient({ getSettings = () => ({}), fetchImpl = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    function settings() {
        const raw = getSettings() ?? {};
        return {
            enabled: raw.enabled === true,
            baseUrl: text(raw.baseUrl),
            apiKey: text(raw.apiKey),
            model: text(raw.model),
        };
    }

    /** 语义检索是否就绪：开关 + 地址 + 模型名齐了才算（密钥可选，本地服务常不设防）。 */
    function available() {
        const s = settings();
        return Boolean(s.enabled && s.baseUrl && s.model);
    }

    function model() {
        return settings().model;
    }

    async function requestBatch(fetchFn, s, inputs) {
        const url = embeddingsEndpoint(s.baseUrl);
        if (!url) throw new Error('向量接口地址为空');
        const headers = { 'content-type': 'application/json' };
        if (s.apiKey) headers.authorization = `Bearer ${s.apiKey}`;
        const controller = new AbortController();
        const deadline = Number.isFinite(Number(timeoutMs)) ? Math.max(1, Math.min(600000, Number(timeoutMs))) : DEFAULT_TIMEOUT_MS;
        const timer = setTimeout(() => controller.abort(), deadline);
        try {
            const response = await fetchFn(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({ model: s.model, input: inputs }),
                signal: controller.signal,
            });
            if (!response?.ok) throw new Error(`HTTP ${response?.status ?? '未知'}`);
            const payload = await response.json();
            const rows = Array.isArray(payload?.data) ? payload.data : null;
            if (!rows) throw new Error('响应缺少 data 数组');
            // 端点可能乱序返回：按 index 归位；没有 index 的按原顺序兜底。
            const ordered = rows
                .map((row, position) => ({ embedding: Array.isArray(row?.embedding) ? row.embedding : null, index: Number.isInteger(row?.index) ? row.index : position }))
                .sort((a, b) => a.index - b.index);
            if (ordered.length !== inputs.length || ordered.some(row => !row.embedding)) {
                throw new Error('响应向量数量与输入不一致');
            }
            return ordered.map(row => row.embedding);
        } catch (error) {
            if (error?.name === 'AbortError') throw new Error(`向量请求超时（${deadline}ms）`);
            throw new Error(`向量请求失败：${error?.message ?? error}`);
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * 批量取向量：返回 { model, vectors }，vectors 与传入的非空文本一一对齐。
     * 空输入直接返回空数组；分批串行，任何一批失败整体抛错（调用方兜底降级）。
     */
    async function embed(texts) {
        const s = settings();
        if (!s.enabled || !s.baseUrl || !s.model) throw new Error('向量接口未配置');
        const list = (Array.isArray(texts) ? texts : [texts])
            .map(item => (typeof item === 'string' ? item : ''))
            .filter(item => item.trim());
        if (!list.length) return { model: s.model, vectors: [] };
        const fetchFn = fetchImpl ?? globalThis.fetch;
        if (typeof fetchFn !== 'function') throw new Error('当前环境没有可用的网络请求接口');
        const vectors = [];
        for (let start = 0; start < list.length; start += BATCH_SIZE) {
            const batch = list.slice(start, start + BATCH_SIZE);
            vectors.push(...await requestBatch(fetchFn, s, batch));
        }
        return { model: s.model, vectors };
    }

    return Object.freeze({ available, model, embed });
}
