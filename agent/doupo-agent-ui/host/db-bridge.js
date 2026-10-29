/**
 * 数据库桥：把纳戒/世界台账镜像到「龙血玄黄·数据库」（酒馆助手脚本）的表格里，
 * 并把表格内容回拉成状态（换聊天收养、用户在数据库可视化器里手改后收回）。
 *
 * 与宿主的分工（见 README「数据库桥接」）：
 * - 扩展 runtime 仍是大脑：决定、校验、同楼回滚逻辑一行不改；
 * - 桥只做存储搬运——镜像（写表）与收养（读表），全部经 window.AutoCardUpdaterAPI；
 * - 数据库脚本没装/被关时一切调用静默跳过，面板照旧走 chatMetadata，零回归。
 *
 * 写入失败语义：CRUD 需要"楼层锚点"（数据库在当前聊天至少落过一次存储帧），
 * 全部失败时自动改走 importTableAsJson 全量兜底（它锚定最新 AI 楼层，冷聊天也能落）。
 */

import {
    ALL_TABLE_DEFS,
    applyDesiredToView,
    desiredMemoryRows,
    desiredSelfRows,
    desiredWorldRows,
    memoryStateFromTables,
    mergeBridgeSheets,
    reconcileTables,
    selfStateFromTables,
    worldStateFromTables,
} from './db-tables.js';

const WRITER_FLAG_MS = 30000;
const EXTERNAL_DEBOUNCE_MS = 500;

const DESIRED_BY_KIND = Object.freeze({ self: desiredSelfRows, world: desiredWorldRows, memory: desiredMemoryRows });
const DERIVE_BY_KIND = Object.freeze({ self: selfStateFromTables, world: worldStateFromTables, memory: memoryStateFromTables });

export function createDbBridge({ getSettings } = {}) {
    let status = 'off'; // 'off' | 'missing' | 'ready' | 'error'
    let message = '';
    let ensuredForChat = false;
    let ensuring = null;
    let writingUntil = 0;
    let externalDebounce = null;
    let registeredCallback = null;
    let registeredOn = null;
    let externalHandler = null;

    function enabled() {
        const settings = typeof getSettings === 'function' ? getSettings() : null;
        return !(settings && settings.enableDbBridge === false);
    }

    function locateApi() {
        try {
            if (typeof window === 'undefined') return null;
            const api = window.AutoCardUpdaterAPI ?? window.parent?.AutoCardUpdaterAPI;
            return api && typeof api === 'object' ? api : null;
        } catch {
            return null;
        }
    }

    function markError(text, error) {
        status = 'error';
        message = text;
        if (error) console.warn('[斗破Agent·数据库桥]', text, error);
        else console.warn('[斗破Agent·数据库桥]', text);
    }

    /** 当前聊天确认桥接表都在；缺就 merge 导入（每个聊天至多一次）。 */
    async function ensure() {
        const api = locateApi();
        if (!api) {
            status = 'missing';
            message = '未检测到龙血玄黄·数据库脚本（window.AutoCardUpdaterAPI）';
            return false;
        }
        if (ensuredForChat) return true;
        if (ensuring) return ensuring;
        registerExternalCallback(api);
        ensuring = (async () => {
            try {
                let currentTemplate = null;
                try {
                    currentTemplate = typeof api.getTableTemplate === 'function' ? api.getTableTemplate({ scope: 'chat' }) : null;
                } catch (error) {
                    console.warn('[斗破Agent·数据库桥] 读取当前模板失败，按全量导入处理', error);
                }
                const { template, added } = mergeBridgeSheets(currentTemplate);
                if (!added.length) {
                    ensuredForChat = true;
                    status = 'ready';
                    message = '桥接表就绪';
                    return true;
                }
                const result = await api.importTemplateFromData(template, { scope: 'chat', dataMode: 'merge' });
                if (result?.success) {
                    ensuredForChat = true;
                    status = 'ready';
                    message = `已向当前聊天补 ${added.length} 张桥接表（${added.join('、')}）`;
                    return true;
                }
                markError(result?.message || '桥接表模板导入失败（scope=chat, dataMode=merge）');
                return false;
            } catch (error) {
                markError('桥接表模板导入抛异常', error);
                return false;
            } finally {
                ensuring = null;
            }
        })();
        return ensuring;
    }

    function registerExternalCallback(api) {
        if (!api || typeof api.registerTableUpdateCallback !== 'function') return;
        if (registeredOn === api) return;
        // 数据库脚本重载会换新的 API 实例（旧注册随之作废），按实例身份重挂。
        registeredOn = api;
        registeredCallback = (view, meta) => {
            if (Date.now() < writingUntil) return;
            if (typeof externalHandler !== 'function') return;
            if (externalDebounce) clearTimeout(externalDebounce);
            externalDebounce = setTimeout(() => {
                externalDebounce = null;
                try {
                    externalHandler(view && typeof view === 'object' ? view : null, meta ?? null);
                } catch (error) {
                    console.warn('[斗破Agent·数据库桥] 外部表格变更处理失败', error);
                }
            }, EXTERNAL_DEBOUNCE_MS);
        };
        api.registerTableUpdateCallback(registeredCallback);
    }

    function opSucceeded(result) {
        return result === true || (typeof result === 'number' && result >= 0);
    }

    /**
     * 镜像一份状态到表里。不抛异常：失败记进状态，调用方 fire-and-forget。
     * 返回 { ok, ops, fallback } 供测试与调试。
     */
    async function mirror(kind, snapshot) {
        if (!enabled() || !locateApi()) return { ok: false, skipped: true };
        if (!(await ensure())) return { ok: false, skipped: true };
        const api = locateApi();
        const desiredGroups = DESIRED_BY_KIND[kind](snapshot);
        let view;
        try {
            view = api.exportTableAsJson();
        } catch (error) {
            markError('导出表格数据失败', error);
            return { ok: false };
        }
        const { ops, missingTables } = reconcileTables(view, desiredGroups);
        if (missingTables.length) {
            // ensure 已成功却仍找不到表：模板导入没落住，报错并停手。
            markError(`桥接表缺失：${missingTables.join('、')}（模板导入可能未生效）`);
            return { ok: false, missingTables };
        }
        if (!ops.length) return { ok: true, ops: 0, fallback: false };

        writingUntil = Date.now() + WRITER_FLAG_MS;
        let failures = 0;
        try {
            // 顺序必须保持：deleteRow（原索引从大到小）→ updateRow → insertRow。
            for (const op of ops.filter(op => op.kind === 'deleteRow')) {
                if (!opSucceeded(await api.deleteRow(op.table, op.rowIndex))) failures += 1;
            }
            for (const op of ops.filter(op => op.kind === 'updateRow')) {
                if (!opSucceeded(await api.updateRow(op.table, op.rowIndex, op.data))) failures += 1;
            }
            for (const op of ops.filter(op => op.kind === 'insertRow')) {
                if (!opSucceeded(await api.insertRow(op.table, op.data))) failures += 1;
            }
        } catch (error) {
            failures += 1;
            markError('表格 CRUD 写入抛异常', error);
        } finally {
            const release = () => { writingUntil = 0; };
            setTimeout(release, 0);
        }

        if (!failures) {
            status = 'ready';
            message = `镜像完成（${ops.length} 笔操作）`;
            return { ok: true, ops: ops.length, fallback: false };
        }
        // CRUD 失败最常见于冷聊天没有楼层锚点：改走全量导入兜底（锚定最新 AI 楼层）。
        try {
            const freshView = api.exportTableAsJson();
            const nextView = applyDesiredToView(freshView, desiredGroups);
            const imported = await api.importTableAsJson(JSON.stringify(nextView));
            if (imported === true) {
                status = 'ready';
                message = 'CRUD 受阻，已用全量导入兜底完成镜像';
                return { ok: true, ops: ops.length, fallback: true };
            }
        } catch (error) {
            markError('全量导入兜底抛异常', error);
            return { ok: false, ops: ops.length, fallback: true };
        }
        markError(`有 ${failures} 笔表格写入失败（可能是聊天还没有数据库楼层锚点）`);
        return { ok: false, ops: ops.length, fallback: true };
    }

    /** 从表里收养状态：表里非空才返回，空表返回 null（调用方保留本地状态）。 */
    async function adopt(kind) {
        if (!enabled() || !locateApi()) return null;
        if (!(await ensure())) return null;
        const api = locateApi();
        let view;
        try {
            view = api.exportTableAsJson();
        } catch (error) {
            markError('导出表格数据失败', error);
            return null;
        }
        try {
            const derived = DERIVE_BY_KIND[kind](view);
            if (!derived || derived.empty) return null;
            return derived.state;
        } catch (error) {
            markError('从表格推导状态失败', error);
            return null;
        }
    }

    /** 注册外部表格变更回调（数据库可视化器里手改后触发；我们自己的写入被时间窗屏蔽）。 */
    function onExternalChange(handler) {
        externalHandler = typeof handler === 'function' ? handler : null;
        const api = locateApi();
        if (api) registerExternalCallback(api);
    }

    /** 换聊天/启动时重置：桥接表确认按新聊天重来。 */
    function onChatChanged() {
        ensuredForChat = false;
        ensuring = null;
        message = '';
        if (status !== 'error') status = locateApi() ? 'ready' : 'missing';
        const api = locateApi();
        if (api) registerExternalCallback(api);
    }

    function currentStatus() {
        if (!enabled()) return { status: 'off', message: '数据库桥接已在设置里关闭', enabled: false, api: !!locateApi(), tables: ALL_TABLE_DEFS.length };
        const api = locateApi();
        if (!api) return { status: 'missing', message, enabled: true, api: false, tables: ALL_TABLE_DEFS.length };
        return { status, message, enabled: true, api: true, tables: ALL_TABLE_DEFS.length };
    }

    return Object.freeze({
        mirrorSelf: snapshot => mirror('self', snapshot),
        mirrorWorld: snapshot => mirror('world', snapshot),
        mirrorMemory: snapshot => mirror('memory', snapshot),
        adoptSelf: () => adopt('self'),
        adoptWorld: () => adopt('world'),
        adoptMemory: () => adopt('memory'),
        onExternalChange,
        onChatChanged,
        ensure,
        status: currentStatus,
    });
}
