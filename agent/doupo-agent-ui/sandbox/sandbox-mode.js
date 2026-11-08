const MODES = Object.freeze(['mainline', 'sandbox']);
const INERTIAS = Object.freeze(['strong', 'medium', 'weak']);
const INERTIA_LABELS = Object.freeze({ strong: '强', medium: '中', weak: '弱' });

function need(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}

export function normalizeMode(value) {
    return MODES.includes(value) ? value : 'mainline';
}

export function normalizeInertia(value) {
    return INERTIAS.includes(value) ? value : 'medium';
}

/**
 * 沙盒模式是正式状态记录，不是只写在提示词里的开关：分支、重生成与续聊后必须仍然一致。
 * 首次进入某分支时直接采用当前设置；已存在记录后再改口径必须显式确认，且不回退任何已提交事实。
 */
export function createSandboxMode({ now = () => new Date().toISOString(), maxHistory = 32 } = {}) {
    if (!Number.isInteger(maxHistory) || maxHistory < 1 || maxHistory > 256) throw new RangeError('maxHistory 必须在 1 到 256 之间');
    const records = new Map();
    const pending = new Map();
    const keyOf = ({ sessionId, branchId } = {}) => `${need(sessionId, 'sessionId')}\u0000${need(branchId, 'branchId')}`;

    function read({ sessionId, branchId } = {}) {
        const record = records.get(keyOf({ sessionId, branchId }));
        return record ? { status: 'ready', ...structuredClone(record) } : { status: 'empty' };
    }

    function sync({ sessionId, branchId, taskId, stateVersion, enabled, inertia, canonCharactersAutonomous = true, allowMidgameSwitch = true } = {}) {
        const key = keyOf({ sessionId, branchId });
        const mode = enabled === true ? 'sandbox' : 'mainline';
        const level = normalizeInertia(inertia);
        const autonomous = canonCharactersAutonomous !== false;
        const prior = records.get(key);
        if (!prior) {
            const record = { mode, inertia: level, canonCharactersAutonomous: autonomous, history: [] };
            records.set(key, record);
            return { status: 'adopted', committed: false, ...structuredClone(record) };
        }
        if (prior.mode === mode) {
            pending.delete(key);
            prior.inertia = level;
            prior.canonCharactersAutonomous = autonomous;
            return { status: 'unchanged', committed: false, ...structuredClone(prior) };
        }
        if (allowMidgameSwitch !== true) return { status: 'rejected', reason: 'midgame_switch_disabled', currentMode: prior.mode, requestedMode: mode };
        const change = { from: prior.mode, to: mode, inertia: level, canonCharactersAutonomous: autonomous, taskId: need(taskId, 'taskId'), stateVersion: need(stateVersion, 'stateVersion'), requestedAt: now() };
        pending.set(key, change);
        return { status: 'confirmation_required', committed: false, change: structuredClone(change), note: '切换不会回退已发生的事实、代价与关系，确认后才写入模式记录。' };
    }

    function confirm({ sessionId, branchId, taskId, stateVersion, reason = '' } = {}) {
        const key = keyOf({ sessionId, branchId });
        const change = pending.get(key);
        if (!change) return { status: 'rejected', reason: 'no_pending_switch' };
        if (taskId !== change.taskId || stateVersion !== change.stateVersion) return { status: 'rejected', reason: 'stale_switch_context' };
        const record = records.get(key);
        change.at = now();
        change.reason = String(reason ?? '').trim().slice(0, 200);
        record.mode = change.to;
        record.inertia = change.inertia;
        record.canonCharactersAutonomous = change.canonCharactersAutonomous;
        record.history.push(change);
        if (record.history.length > maxHistory) record.history.splice(0, record.history.length - maxHistory);
        pending.delete(key);
        return { status: 'switched', committed: false, change: structuredClone(change), ...structuredClone(record) };
    }

    function cancelSwitch({ sessionId, branchId } = {}) {
        return { status: pending.delete(keyOf({ sessionId, branchId })) ? 'cancelled' : 'no_pending_switch' };
    }

    /** 开关随开随关：口径直接跟随全局开关换向——不申请、不待确认、不绑定任务。
     *  沙盒历史与惯性参数原样保留（开关关了再开能续上），待确认变更随换向作废。 */
    function followSwitch({ sessionId, branchId, sandbox, inertia, canonCharactersAutonomous = true } = {}) {
        const key = keyOf({ sessionId, branchId });
        const mode = sandbox === true ? 'sandbox' : 'mainline';
        const record = records.get(key);
        if (!record) {
            records.set(key, { mode, inertia: normalizeInertia(inertia), canonCharactersAutonomous: canonCharactersAutonomous !== false, history: [] });
        } else {
            record.mode = mode;
            record.inertia = normalizeInertia(inertia);
            record.canonCharactersAutonomous = canonCharactersAutonomous !== false;
        }
        pending.delete(key);
        return { status: 'ready', ...structuredClone(records.get(key)) };
    }

    /** 供提示词与界面共用的口径说明；不回传历史记录，避免把状态表塞进正文。 */
    function describe({ sessionId, branchId } = {}) {
        const record = records.get(keyOf({ sessionId, branchId }));
        if (!record) return { status: 'empty', mode: 'mainline', inertia: 'medium', text: '' };
        const lines = record.mode === 'sandbox'
            ? ['当前为开放世界口径：不跟随原著剧情、不用世界书，世界照自身逻辑运转；原著节点只是候选，前提成立且无人介入时才发生。',
                `世界惯性：${INERTIA_LABELS[record.inertia]}。`,
                record.canonCharactersAutonomous ? '原著人物保留自主行动，结果不预设。' : '原著人物不主动推进自身轨迹，只对玩家作出反应。']
            : ['当前为主线口径：原著节点按排期发生，玩家只能影响过程。'];
        return { status: 'ready', mode: record.mode, inertia: record.inertia, inertiaLabel: INERTIA_LABELS[record.inertia], canonCharactersAutonomous: record.canonCharactersAutonomous, text: lines.join('') };
    }

    function invalidate({ sessionId, branchId } = {}) {
        const key = keyOf({ sessionId, branchId });
        const removed = records.delete(key);
        pending.delete(key);
        return removed;
    }

    /** Persist only this branch's confirmed state, never another chat or a pending authorization. */
    function snapshot(scope) {
        return { schemaVersion: 1, record: structuredClone(records.get(keyOf(scope)) ?? null) };
    }

    function restore(raw, scope) {
        const key = keyOf(scope);
        if (raw == null || (raw.schemaVersion === 1 && raw.record === null)) {
            records.delete(key);
            pending.delete(key);
            return { status: 'empty' };
        }
        const record = raw?.record;
        if (raw?.schemaVersion !== 1 || !record || !MODES.includes(record.mode)
            || !INERTIAS.includes(record.inertia) || typeof record.canonCharactersAutonomous !== 'boolean'
            || !Array.isArray(record.history) || record.history.some(change => !change || !MODES.includes(change.from)
                || !MODES.includes(change.to) || typeof change.taskId !== 'string' || typeof change.stateVersion !== 'string')) {
            return { status: 'rejected', reason: 'bad_snapshot' };
        }
        records.set(key, { mode: record.mode, inertia: record.inertia,
            canonCharactersAutonomous: record.canonCharactersAutonomous,
            history: structuredClone(record.history.slice(-maxHistory)) });
        pending.delete(key);
        return { status: 'restored', ...structuredClone(records.get(key)) };
    }

    function clear() { records.clear(); pending.clear(); }
    return Object.freeze({ read, sync, confirm, cancelSwitch, followSwitch, describe, invalidate, clear, snapshot, restore, modes: MODES, inertias: INERTIAS });
}

export { MODES as SANDBOX_MODES, INERTIAS as SANDBOX_INERTIAS, INERTIA_LABELS as SANDBOX_INERTIA_LABELS };
