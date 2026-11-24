/**
 * 楼层重放基线（lastFloor + opIds）的存档编解码。
 *
 * 为什么要单独序列化：账本想撤销"上一版正文写进来的东西"，靠的是内存里记着
 * 上一楼做了哪些可逆操作。这份记录过去只活在内存里，一刷新页面、一换聊天就没了，
 * 于是重 roll 的新指令直接叠在旧正文的结果上——旧记录还在。
 *
 * 这里补的是"跟着聊天存档一起落盘"。刻意不塞进 snapshot()：
 * snapshot() 在仓里有几百处调用，其中不少做前后一致性比较
 * （JSON.stringify 对比、assert.deepEqual 对比）和提示词渲染，
 * 多一个每楼都会变的字段会误伤它们。所以只在持久化那条路上单带一份。
 *
 * 读回一律宽容：旧档没有这段、被手改坏、超过长度上限，都当"这次不能撤销"，
 * 不报错、不拦恢复——撤销只是优化，丢了大不了新旧叠加一次。
 */

const REPLAY_BYTES_MAX = 262144; // 单份基线存档上限，防手改档把元数据撑爆
const UNDO_MAX = 64; // 一楼最多记 64 步可逆操作，超了宁可不落盘也不落半份
const OPID_MAX = 200; // 与各账本的 opId 记忆上限对齐
const OPID_TEXT_MAX = 1024; // opId 由模型给，宽一点，别因为一个长 id 丢掉整份水位
const OP_TEXT_MAX = 64;

const isObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

/** 操作号列表：字符串、非空、不重复、不超长。不合法返回 null（调用方按"没有"处理）。 */
function readIds(value) {
    if (!Array.isArray(value) || value.length > OPID_MAX) return null;
    const ok = value.every(id => typeof id === 'string' && id.length > 0 && id.length <= OPID_TEXT_MAX);
    return ok && new Set(value).size === value.length ? structuredClone(value) : null;
}

/** 撤销步骤只做整形检查：具体能不能撤由各账本的 runOne 自己判，坏的那步记 rejected 跳过。 */
function readUndo(value) {
    return isObject(value) && typeof value.op === 'string' && value.op.length > 0 && value.op.length <= OP_TEXT_MAX;
}

/**
 * 读回存档里的重放基线。
 * @returns {{ opIds: string[], lastFloor: null | { floor: number, undo: object[], opIds: string[] } } | null}
 */
export function readFloorReplay(raw) {
    try {
        if (!isObject(raw) || raw.version !== 1) return null;
        if (JSON.stringify(raw).length > REPLAY_BYTES_MAX) return null;
        const opIds = readIds(raw.opIds) ?? [];
        const floor = raw.lastFloor ?? null;
        if (floor === null) return { opIds, lastFloor: null };
        if (!isObject(floor) || !Number.isSafeInteger(floor.floor) || floor.floor < 0) return null;
        if (!Array.isArray(floor.undo) || floor.undo.length > UNDO_MAX || !floor.undo.every(readUndo)) return null;
        const floorOpIds = readIds(floor.opIds) ?? [];
        return { opIds, lastFloor: { floor: floor.floor, undo: structuredClone(floor.undo), opIds: floorOpIds } };
    } catch { return null; }
}

/**
 * 存档用的重放基线。撤销步骤超上限时整条不存：撤一半比不撤更糟。
 * @returns {{ version: 1, opIds: string[], lastFloor: null | { floor: number, undo: object[], opIds: string[] } }}
 */
export function writeFloorReplay({ opIds = [], lastFloor = null } = {}) {
    const undo = Array.isArray(lastFloor?.undo) ? lastFloor.undo : [];
    const keepFloor = Boolean(lastFloor) && Number.isSafeInteger(lastFloor.floor) && lastFloor.floor >= 0 && undo.length > 0 && undo.length <= UNDO_MAX;
    return {
        version: 1,
        opIds: (Array.isArray(opIds) ? opIds : []).filter(id => typeof id === 'string' && id.length > 0).slice(-OPID_MAX),
        lastFloor: keepFloor
            ? { floor: lastFloor.floor, undo: structuredClone(undo), opIds: (Array.isArray(lastFloor.opIds) ? lastFloor.opIds : []).filter(id => typeof id === 'string').slice(-OPID_MAX) }
            : null,
    };
}

export const FLOOR_REPLAY_LIMITS = Object.freeze({ REPLAY_BYTES_MAX, UNDO_MAX, OPID_MAX });
