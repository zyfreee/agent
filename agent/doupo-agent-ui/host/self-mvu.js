/**
 * 纳戒 → MVU 变量同步：把主角档案/境界/功法斗技/装备/目标/金币写进 MVU
 * （MagVarUpdate）的 stat_data 变量树，给状态栏、EJS 模板和 MVU 生态当只读镜像。
 *
 * 与其它存储的分工：纳戒真账本在扩展（chatMetadata），两个下游各拿一份镜像——
 * 数据库表（db-bridge，可视化/手改回拉/选条召回）和这里的 MVU 变量。
 * 数据库脚本对 MVU 只有读（getMvuData 塞进它的模板上下文），所以写 MVU 的
 * 责任在扩展这边；MVU 主脚本没装/被关时一切调用静默跳过，零回归。
 *
 * 剧情日不进这里：世界运转的时钟注入已经带剧情日，两处各管各的，不重复。
 * 命名空间：stat_data.斗破纳戒（顶层平键，不带点号——MVU 的 setMvuVariable
 * 把名字按路径解释，平键避免歧义）。同步是整体覆盖：该键下的字段以扩展为准。
 * 全空纳戒不值得占一次变量写，sync 会按“无内容”跳过。
 */

const NAMESPACE = '斗破纳戒';

function text(value) {
    return typeof value === 'string' ? value : '';
}

/** 清单 → 「名·品级·进度」顿接串：功法斗技装备共用一种拼法；没名字的坏条目整条跳过。 */
function chainOf(list, pick) {
    return (Array.isArray(list) ? list : [])
        .map(item => {
            if (!item || typeof item !== 'object') return '';
            const parts = pick(item);
            if (!text(parts[0])) return '';
            return parts.filter(Boolean).join('·');
        })
        .filter(Boolean)
        .join('、');
}

/** 未完成目标 → 「★短标题（期限）」串，主线排前；已达成的退场不进状态栏。 */
function goalsLine(state) {
    return (Array.isArray(state.goals) ? state.goals : [])
        .filter(goal => goal && typeof goal === 'object' && goal.done !== true)
        .sort((a, b) => (a.priority === '主线' ? 0 : 1) - (b.priority === '主线' ? 0 : 1))
        .map(goal => {
            const head = text(goal.title) || text(goal.text);
            if (!head) return '';
            return `${goal.priority === '主线' ? '★' : '·'}${head}${text(goal.due) ? `（${text(goal.due)}）` : ''}`;
        })
        .filter(Boolean)
        .join('；');
}

/** 行囊（未穿戴）→ 「名×数量」串；数量 1 省略， arbitration 靠这条链原样往返。 */
function bagLine(state) {
    return (Array.isArray(state.items) ? state.items : [])
        .filter(item => item && typeof item === 'object' && item.equipped !== true)
        .map(item => {
            const name = text(item.name);
            if (!name) return '';
            return `${name}${Number.isInteger(item.count) && item.count > 1 ? `×${item.count}` : ''}`;
        })
        .filter(Boolean)
        .join('、');
}

/** 进行中炼制 → 「名[×数量]（剩N天）」串；天数按纳戒日历算，没填期限的不带尾巴。 */
function craftsLine(state) {
    const today = Number.isInteger(state.day) && state.day >= 1 ? state.day : 1;
    return (Array.isArray(state.crafts) ? state.crafts : [])
        .filter(job => job && typeof job === 'object' && job.status === 'open')
        .map(job => {
            const name = text(job.name);
            if (!name) return '';
            const count = Number.isInteger(job.count) && job.count > 1 ? `×${job.count}` : '';
            const tail = Number.isInteger(job.endDay) && job.endDay >= today ? `（剩 ${job.endDay - today + 1} 天）` : '';
            return `${name}${count}${tail}`;
        })
        .filter(Boolean)
        .join('、');
}

/** 称号 → 顿接串。 */
function titlesLine(state) {
    return (Array.isArray(state.titles) ? state.titles : []).map(text).filter(Boolean).join('、');
}

/** 配方按类别拆两条链：丹方（炼药）与器谱（炼器）各自「名·品级」顿接。 */
function recipesLine(state, craft) {
    return chainOf(
        (Array.isArray(state.recipes) ? state.recipes : []).filter(item => text(item?.craft) === craft),
        item => [text(item.name), text(item.grade)],
    );
}

/** 纳戒快照 → MVU 载荷（中文键，状态栏/EJS 直接可用；金币是数字）。
 * 22 字段是模型经 MVU 通道申报纳戒变化的完整清单：链式字段（功法/斗技/装备/行囊/称号/
 * 丹方/器谱/炼制/目标）写「整张新清单」，仲裁器按名对账翻译成运行时操作。载荷含
 * 天材地宝（异火、妖丹、灵矿之类的天材地宝清单），与功法/装备同构。 */
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
        功法: chainOf(state.techniques, item => [text(item.name), text(item.grade), text(item.progress)]),
        斗技: chainOf(state.skills, item => [text(item.name), text(item.grade), text(item.type)]),
        装备: chainOf(state.equipment, item => [text(item.name), text(item.grade), text(item.type)]),
        天材地宝: chainOf(state.treasures, item => [text(item.name), text(item.grade), text(item.type)]),
        行囊: bagLine(state),
        称号: titlesLine(state),
        丹方: recipesLine(state, '炼药'),
        器谱: recipesLine(state, '炼器'),
        炼制: craftsLine(state),
        目标: goalsLine(state),
        金币: Number.isInteger(state.gold) && state.gold > 0 ? state.gold : 0,
        更新时间: text(state.updatedAt),
    };
}

/** 载荷是否有一点内容：全空的纳戒不值得占一次变量写。 */
export function hasSelfMvuContent(payload) {
    if (!payload || typeof payload !== 'object') return false;
    return Object.entries(payload).some(([key, value]) => (key === '金币' ? Number(value) > 0 : text(value).trim()));
}

export function createSelfMvuBridge({ capture = () => null, isCurrent = () => true, getContext } = {}) {
    function targetFor(options) {
        const owner = capture();
        const chat = typeof getContext === 'function' ? getContext()?.chat : null;
        const messageId = options.messageId ?? (Array.isArray(chat) && chat.length ? chat.length - 1 : 'latest');
        return { target: { type: 'message', message_id: messageId }, current: () => isCurrent(owner) && (options.isCurrent?.() ?? true) };
    }
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
    async function sync(self, options = {}) {
        const { target, current } = targetFor(options);
        if (!current()) return { ok: false, skipped: true, reason: 'stale' };
        const mvu = locateMvu();
        if (!mvu || typeof mvu.getMvuData !== 'function'
            || (typeof mvu.replaceMvuData !== 'function' && typeof mvu.setMvuVariable !== 'function')) {
            return { ok: false, skipped: true, reason: 'missing' };
        }
        const payload = buildSelfMvuPayload(self);
        if (!hasSelfMvuContent(payload)) return { ok: true, skipped: true, reason: 'empty' };
        try {
            const data = await mvu.getMvuData(target);
            if (!current()) return { ok: false, skipped: true, reason: 'stale' };
            const tree = data && typeof data === 'object' && !Array.isArray(data) ? structuredClone(data) : {};
            if (!tree.stat_data || typeof tree.stat_data !== 'object' || Array.isArray(tree.stat_data)) tree.stat_data = {};
            tree.stat_data[NAMESPACE] = payload;
            if (typeof mvu.replaceMvuData === 'function') {
                await mvu.replaceMvuData(tree, target);
            } else {
                await mvu.setMvuVariable(tree, NAMESPACE, payload, { reason: '斗破Agent纳戒同步' });
            }
            if (!current()) return { ok: false, skipped: true, reason: 'stale' };
            lastError = '';
            lastSyncAt = new Date().toISOString();
            return { ok: true, wrote: true, namespace: NAMESPACE };
        } catch (error) {
            if (!current()) return { ok: false, skipped: true, reason: 'stale' };
            lastError = String(error?.message ?? error).slice(0, 160);
            return { ok: false, error: lastError };
        }
    }

    /** 读最新楼层的 stat_data.斗破纳戒（仲裁器拿它跟账本投影做差分）。不抛异常。 */
    async function readLatest(options = {}) {
        const { target, current } = targetFor(options);
        if (!current()) return { ok: false, reason: 'stale' };
        const mvu = locateMvu();
        if (!mvu || typeof mvu.getMvuData !== 'function') return { ok: false, reason: 'missing' };
        try {
            const data = await mvu.getMvuData(target);
            if (!current()) return { ok: false, reason: 'stale' };
            const namespace = data && typeof data === 'object' && data.stat_data && typeof data.stat_data === 'object'
                ? data.stat_data[NAMESPACE]
                : null;
            return { ok: true, namespace: namespace && typeof namespace === 'object' ? namespace : null };
        } catch (error) {
            return { ok: false, reason: String(error?.message ?? error).slice(0, 160) };
        }
    }

    function status() {
        return { present: !!locateMvu(), namespace: NAMESPACE, lastError, lastSyncAt };
    }

    return Object.freeze({ sync, readLatest, status });
}
