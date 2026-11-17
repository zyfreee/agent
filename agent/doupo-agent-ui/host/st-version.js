/**
 * 酒馆版本门：本扩展适配酒馆 1.14 及以上的官方版本，以及 TauriTavern（TT）重构版。
 *
 * 为什么要在扩展里自己查版本：manifest 的 minimum_client_version 从 1.14.0 才进扩展加载器
 * （1.13 的 extensions.js 不认识它），写在清单里挡不住 1.13 的旧宿主；hooks 激活钩子更是
 * 1.17.0 才接入，1.14–1.16 的宿主不会调 onActivate（入口的自启兜底就是为这几个版本准备的）。
 * 所以加载后自己再查一次 /version，低于下限就提示并停用。
 *
 * TauriTavern（Rust 重构版，window.__TAURITAVERN__ 平台 ABI）：它的 /version 把 pkgVersion
 * 镜像成内嵌前端基线（SILLYTAVERN_COMPAT_VERSION，2026-11 时点 1.19.0，见其 bridge.rs），
 * 版本门天然放行；isTauriTavern() 命中时直接跳过自查，防它将来改 /version 形状或改报
 * 自家版本号时误杀支持的平台。
 *
 * 版本探测失败就放行（返回 null）：特殊代理/测试环境拿不到 /version 时，功能探测
 * （capability-preflight）与各调用的 typeof 守卫仍在兜底，不要把人锁在门外。
 */

/** 支持下限：与仓库根 manifest.json 的 minimum_client_version 保持一致。 */
export const MIN_ST_VERSION = '1.14.0';

/** 三段数字 + 可选尾巴（'1.13'、'1.13.0'、'1.13.0-rc1' 都认；UNKNOWN 之类一律不认）。 */
const VERSION_RE = /^(\d+)\.(\d+)(?:\.(\d+))?(?:[.\-].*)?$/;

/** 版本字符串 → [major, minor, patch]；认不出返回 null。 */
export function parseStVersion(value) {
    const source = typeof value === 'string' ? value.trim() : '';
    const match = VERSION_RE.exec(source);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

/** 逐段比较：a<b 得 -1，相等 0，a>b 得 1。缺段当 0 补齐。 */
export function compareStVersions(a, b) {
    for (let i = 0; i < 3; i += 1) {
        const left = Array.isArray(a) ? Number(a[i] ?? 0) : 0;
        const right = Array.isArray(b) ? Number(b[i] ?? 0) : 0;
        if (left !== right) return left < right ? -1 : 1;
    }
    return 0;
}

/** 版本字符串是否达到支持下限；解析失败一律视为不达标。 */
export function isSupportedStVersion(version) {
    const parsed = parseStVersion(version);
    return parsed !== null && compareStVersions(parsed, parseStVersion(MIN_ST_VERSION)) >= 0;
}

/**
 * 查宿主版本：GET /version 的 pkgVersion 字段（1.13 与 1.19 的响应形状一致，都有它；
 * TauriTavern 同形，pkgVersion 是内嵌前端基线而不是它自己的发行版本）。
 * 不抛异常：拿不到就返回 null，由调用方决定放行。
 */
export async function detectStVersion({ fetchImpl = globalThis.fetch } = {}) {
    if (typeof fetchImpl !== 'function') return null;
    try {
        const response = await fetchImpl('/version', { method: 'GET' });
        if (!response?.ok) return null;
        const data = await response.json();
        const version = typeof data?.pkgVersion === 'string' ? data.pkgVersion : '';
        return parseStVersion(version) ? version : null;
    } catch {
        return null;
    }
}

/**
 * 平台检测：TauriTavern 通过 window.__TAURITAVERN__ 暴露平台 ABI
 * （{ abiVersion, ready, invoke, assets, api, … }，见其 docs/FrontendHostContract.md）。
 * 命中即认定前端基线自带版本兼容（≥1.14），运行时门无需再自查 /version。
 */
export function isTauriTavern(host = globalThis) {
    try {
        const abi = host?.__TAURITAVERN__;
        return abi !== undefined && abi !== null;
    } catch {
        return false;
    }
}
