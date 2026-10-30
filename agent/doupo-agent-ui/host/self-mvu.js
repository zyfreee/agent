/**
 * 纳戒 → MVU 变量同步：把主角档案/境界/金币/剧情日写进 MVU（MagVarUpdate）的
 * stat_data 变量树，给状态栏、EJS 模板和 MVU 生态当只读镜像。
 *
 * 与其它存储的分工：纳戒真账本在扩展（chatMetadata），两个下游各拿一份镜像——
 * 数据库表（db-bridge，可视化/手改回拉/选条召回）和这里的 MVU 变量。
 * 数据库脚本对 MVU 只有读（getMvuData 塞进它的模板上下文），所以写 MVU 的
 * 责任在扩展这边；MVU 主脚本没装/被关时一切调用静默跳过，零回归。
 *
 * 命名空间：stat_data.斗破纳戒（顶层平键，不带点号——MVU 的 setMvuVariable
 * 把名字按路径解释，平键避免歧义）。同步是整体覆盖：该键下的字段以扩展为准。
 */

const NAMESPACE = '斗破纳戒';

function text(value) {
    return typeof value === 'string' ? value : '';
}

/** 纳戒快照 → MVU 载荷（中文键，状态栏/EJS 直接可用；金币/剧情日是数字）。 */
export function buildSelfMvuPayload(self) {
    const state = self && typeof self === 'object' ? self : {};
    const profile = state.profile && typeof state.profile === 'object' ? state.profile : {};
    const realm = state.realm && typeof state.realm === 'object' ? state.realm : {};
    return {
        姓名: text(profile.name),
        性别: text(profile.gender),
        年龄: text(profile.age),
        种族: text(profile.race),
        出身: text(profile.origin),
        所属: text(profile.affiliation),
        斗气属性: text(profile.attribute),
        天赋: text(profile.talent),
        外貌: text(profile.appearance),
        境界: text(realm.realm),
        段位: text(realm.stage),
        金币: Number.isInteger(state.gold) && state.gold > 0 ? state.gold : 0,
        剧情日: Number.isInteger(state.day) && state.day > 0 ? state.day : 1,
        更新时间: text(state.updatedAt),
    };
}

/** 载荷是否有一点内容：全空的纳戒不值得占一次变量写。 */
export function hasSelfMvuContent(payload) {
    if (!payload || typeof payload !== 'object') return false;
    return Object.entries(payload).some(([key, value]) => (key === '金币' || key === '剧情日' ? Number(value) > 0 : text(value).trim()));
}

export function createSelfMvuBridge() {
    let lastError = '';
    let lastSyncAt = '';

    function locateMvu() {
        try {
            const mvu = globalThis.window?.Mvu ?? globalThis.window?.parent?.Mvu;
            return mvu && typeof mvu === 'object' ? mvu : null;
        } catch {
            return null;
        }
    }

    /**
     * 把一份纳戒快照同步进 stat_data.斗破纳戒。不抛异常：失败记进状态，调用方
     * fire-and-forget。返回 { ok, skipped?, wrote?, error? } 供测试与调试。
     *
     * 写法走 MVU 官方的「读帧 → 改帧 → 整帧写回」协议：setMvuVariable 只改内存里的
     * 树、不落盘（源码 an() 只做赋值），必须自己 replaceMvuData 写回该楼变量帧。
     */
    async function sync(self) {
        const mvu = locateMvu();
        if (!mvu || typeof mvu.getMvuData !== 'function'
            || (typeof mvu.replaceMvuData !== 'function' && typeof mvu.setMvuVariable !== 'function')) {
            return { ok: false, skipped: true, reason: 'missing' };
        }
        const payload = buildSelfMvuPayload(self);
        if (!hasSelfMvuContent(payload)) return { ok: true, skipped: true, reason: 'empty' };
        try {
            const data = await mvu.getMvuData({ type: 'message', message_id: 'latest' });
            const tree = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
            if (!tree.stat_data || typeof tree.stat_data !== 'object' || Array.isArray(tree.stat_data)) tree.stat_data = {};
            tree.stat_data[NAMESPACE] = payload;
            if (typeof mvu.replaceMvuData === 'function') {
                await mvu.replaceMvuData(tree, { type: 'message', message_id: 'latest' });
            } else {
                await mvu.setMvuVariable(tree, NAMESPACE, payload, { reason: '斗破Agent纳戒同步' });
            }
            lastError = '';
            lastSyncAt = new Date().toISOString();
            return { ok: true, wrote: true, namespace: NAMESPACE };
        } catch (error) {
            lastError = String(error?.message ?? error).slice(0, 160);
            return { ok: false, error: lastError };
        }
    }

    function status() {
        return { present: !!locateMvu(), namespace: NAMESPACE, lastError, lastSyncAt };
    }

    return Object.freeze({ sync, status });
}
