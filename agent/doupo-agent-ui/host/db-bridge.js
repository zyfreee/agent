/**
 * 数据库桥：把纳戒/记忆镜像到「龙血玄黄·数据库」（酒馆助手脚本）的表格里，
 * 并把表格内容回拉成状态（换聊天收养、用户在数据库可视化器里手改后收回）。
 * 世界运转不连数据库：世界台账只跟扩展台账与聊天存档走（旧版世界表由
 * mergeBridgeSheets 的退役剔除从聊天模板里移除）。
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
    MEMORY_TABLE_DEFS,
    applyDesiredToView,
    desiredMemoryRows,
    desiredSelfRows,
    memoryStateFromTables,
    mergeBridgeSheets,
    reconcileTables,
    sanitizeForeignDdl,
    selfStateFromTables,
} from './db-tables.js';

const EXTERNAL_DEBOUNCE_MS = 500;

const DESIRED_BY_KIND = Object.freeze({ self: desiredSelfRows, memory: desiredMemoryRows });
const DERIVE_BY_KIND = Object.freeze({ self: selfStateFromTables, memory: memoryStateFromTables });

export function createDbBridge({ getSettings, capture = () => null, isCurrent = () => true } = {}) {
    let status = 'off'; // 'off' | 'missing' | 'ready' | 'error'
    let message = '';
    let ensuredForChat = false;
    let ensuring = null;
    let activeWriters = 0;
    let mirrorQueue = Promise.resolve();
    let externalDebounce = null;
    let registeredCallback = null;
    let registeredOn = null;
    let externalHandler = null;
    let epoch = 0;
    const ownership = () => {
        const token = capture();
        const capturedEpoch = epoch;
        return () => capturedEpoch === epoch && enabled() && isCurrent(token);
    };

    function enabled() {
        const settings = typeof getSettings === 'function' ? getSettings() : null;
        return settings?.enabled !== false && settings?.enableDbBridge !== false;
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
    async function ensure(current = ownership()) {
        if (!current()) return false;
        const api = locateApi();
        if (!api) {
            status = 'missing';
            message = '未检测到龙血玄黄·数据库脚本（window.AutoCardUpdaterAPI）';
            return false;
        }
        if (ensuredForChat) return true;
        if (ensuring) return ensuring;
        registerExternalCallback(api);
        const ensureEpoch = epoch;
        ensuring = (async () => {
            try {
                let currentTemplate = null;
                try {
                    currentTemplate = typeof api.getTableTemplate === 'function' ? api.getTableTemplate({ scope: 'chat' }) : null;
                } catch (error) {
                    console.warn('[斗破Agent·数据库桥] 读取当前模板失败，按全量导入处理', error);
                }
                const { template, added, replaced, updated, removed, migrated } = mergeBridgeSheets(currentTemplate);
                if (!added.length && !replaced.length && !updated.length && !removed.length && !migrated.length) {
                    ensuredForChat = true;
                    status = 'ready';
                    message = '桥接表就绪';
                    return true;
                }
                // 数据库脚本的 merge 导入是整包替换：外来表必须随包携带才能留在聊天模板里，
                // 而它又按「DDL 注释 = 表头（NFKC 归一后）」逐列校验整包——先把对不上的外来表 DDL 按表头重建。
                if (!current()) return false;
                const result = await api.importTemplateFromData(sanitizeForeignDdl(template), { scope: 'chat', dataMode: 'replace' });
                if (!current()) return false;
                if (result?.success) {
                    ensuredForChat = true;
                    status = 'ready';
                    const parts = [];
                    if (added.length) parts.push(`补 ${added.length} 张桥接表（${added.join('、')}）`);
                    if (replaced.length) parts.push(`替换 ${replaced.length} 张旧结构副本（${replaced.join('、')}）`);
                    if (migrated.length) parts.push(`升级 ${migrated.length} 张旧结构表并保留原行（${migrated.join('、')}）`);
                    if (updated.length) parts.push(`刷新 ${updated.length} 张表的导出配置（${updated.join('、')}）`);
                    if (removed.length) parts.push(`移除退役桥接表（${removed.join('、')}）`);
                    message = `已向当前聊天${parts.join('，')}`;
                    return true;
                }
                // 优雅降级：导入被数据库预检拒绝，但十张桥接表本身都已就位（无缺失、无过期结构）时
                // 照样按就绪处理——数据镜像走 CRUD / 全量导入兜底，不依赖模板导入；模板级清理
                // （退役表移除、导出配置刷新）留待数据库侧问题解除后的下次载入自动补做。
                if (!added.length && !replaced.length && !migrated.length) {
                    ensuredForChat = true;
                    status = 'ready';
                    const reason = String(result?.message ?? '').slice(0, 120);
                    message = `桥接表就绪；模板级清理暂被数据库预检拒绝，数据镜像照常（${reason}）`;
                    return true;
                }
                markError(result?.message || '桥接表模板导入失败（scope=chat, dataMode=merge）');
                return false;
            } catch (error) {
                if (current()) markError('桥接表模板导入抛异常', error);
                return false;
            } finally {
                if (ensureEpoch === epoch) ensuring = null;
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
            const current = ownership();
            if (!current() || activeWriters > 0) return;
            if (typeof externalHandler !== 'function') return;
            if (externalDebounce) clearTimeout(externalDebounce);
            externalDebounce = setTimeout(() => {
                externalDebounce = null;
                try {
                    if (current()) externalHandler(view && typeof view === 'object' ? view : null, meta ?? null, { isCurrent: current });
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

    /** 记忆表表头与当前定义不一致（旧版结构，如还带已了结/了结日列）时提示；镜像与收养均已自适应，只是可视化里多两列死列。
     *  按表名找：旧聊天的镜像表 uid 是历史遗留（如 sheet_xiao_ji_yi），不能用当前 def.key 对号。 */
    function memoryTableStructureStale(view) {
        const sheets = view && typeof view === 'object' ? Object.values(view) : [];
        return MEMORY_TABLE_DEFS.some(def => {
            const sheet = sheets.find(item => item && typeof item === 'object' && item.name === def.name);
            const headers = Array.isArray(sheet?.content?.[0]) ? sheet.content[0] : null;
            return !!headers && headers.join('\u0001') !== def.headers.join('\u0001');
        });
    }

    /**
     * 镜像一份状态到表里。不抛异常：失败记进状态，调用方 fire-and-forget。
     * 返回 { ok, ops, fallback } 供测试与调试。
     */
    async function mirror(kind, snapshot, current = ownership()) {
        if (!current() || !locateApi()) return { ok: false, skipped: true };
        if (!(await ensure(current)) || !current()) return { ok: false, skipped: true };
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
        if (!ops.length) {
            status = 'ready';
            message = memoryTableStructureStale(view)
                ? '镜像已同步；记忆表还是旧版表头（含已了结列），可在数据库界面重建表'
                : '镜像已同步（无变化）';
            return { ok: true, ops: 0, fallback: false };
        }

        let failures = 0;
        try {
            // 顺序必须保持：deleteRow（原索引从大到小）→ updateRow → insertRow。
            for (const op of ops.filter(op => op.kind === 'deleteRow')) {
                if (!current()) return { ok: false, stale: true };
                if (!opSucceeded(await api.deleteRow(op.table, op.rowIndex))) failures += 1;
                if (!current()) return { ok: false, stale: true };
            }
            for (const op of ops.filter(op => op.kind === 'updateRow')) {
                if (!current()) return { ok: false, stale: true };
                if (!opSucceeded(await api.updateRow(op.table, op.rowIndex, op.data))) failures += 1;
                if (!current()) return { ok: false, stale: true };
            }
            for (const op of ops.filter(op => op.kind === 'insertRow')) {
                if (!current()) return { ok: false, stale: true };
                if (!opSucceeded(await api.insertRow(op.table, op.data))) failures += 1;
                if (!current()) return { ok: false, stale: true };
            }
        } catch (error) {
            if (!current()) return { ok: false, stale: true };
            failures += 1;
            markError('表格 CRUD 写入抛异常', error);
        }

        if (!failures) {
            status = 'ready';
            message = `镜像完成（${ops.length} 笔操作）${memoryTableStructureStale(view) ? '；记忆表还是旧版表头（含已了结列），可在数据库界面重建表' : ''}`;
            return { ok: true, ops: ops.length, fallback: false };
        }
        // CRUD 失败最常见于冷聊天没有楼层锚点：改走全量导入兜底（锚定最新 AI 楼层）。
        try {
            if (!current()) return { ok: false, stale: true };
            const freshView = api.exportTableAsJson();
            const nextView = applyDesiredToView(freshView, desiredGroups);
            const imported = await api.importTableAsJson(JSON.stringify(nextView));
            if (!current()) return { ok: false, stale: true };
            if (imported === true) {
                status = 'ready';
                message = 'CRUD 受阻，已用全量导入兜底完成镜像';
                return { ok: true, ops: ops.length, fallback: true };
            }
        } catch (error) {
            if (!current()) return { ok: false, stale: true };
            markError('全量导入兜底抛异常', error);
            return { ok: false, ops: ops.length, fallback: true };
        }
        markError(`有 ${failures} 笔表格写入失败（可能是聊天还没有数据库楼层锚点）`);
        return { ok: false, ops: ops.length, fallback: true };
    }

    /** 从表里收养状态：表里非空才返回，空表返回 null（调用方保留本地状态）。 */
    async function adopt(kind) {
        const current = ownership();
        if (!current() || !locateApi()) return null;
        if (!(await ensure(current)) || !current()) return null;
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
        epoch += 1;
        if (externalDebounce) clearTimeout(externalDebounce);
        externalDebounce = null;
        mirrorQueue = Promise.resolve();
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

    function enqueueMirror(kind, snapshot) {
        if (!enabled() || !locateApi()) return Promise.resolve({ ok: false, skipped: true });
        const current = ownership();
        const copy = JSON.parse(JSON.stringify(snapshot ?? {}));
        const task = mirrorQueue.then(async () => {
            if (!current()) return { ok: false, stale: true };
            activeWriters += 1;
            try { return await mirror(kind, copy, current); }
            finally { activeWriters -= 1; }
        });
        mirrorQueue = task.catch(() => {});
        return task;
    }

    return Object.freeze({
        mirrorSelf: snapshot => enqueueMirror('self', snapshot),
        mirrorMemory: snapshot => enqueueMirror('memory', snapshot),
        adoptSelf: () => adopt('self'),
        adoptMemory: () => adopt('memory'),
        onExternalChange,
        onChatChanged,
        ensure,
        status: currentStatus,
    });
}
