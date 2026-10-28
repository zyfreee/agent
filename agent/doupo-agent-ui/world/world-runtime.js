/**
 * 世界运行时：保存一份"世界此刻长什么样"的小状态并在校验后修改它。
 * 状态内容：时钟（天/分钟/时期）、基础信息（天气/位置/时期）、两栏事件
 * （身边事件 near / 世界大事 world）和一份操作流水。
 *
 * 所有修改都走 apply()：单条操作要么通过校验生效，要么带着原因被拒绝，
 * 绝不抛异常打断调用方。面板手动操作与模型指令走同一条路，规则完全一致。
 */

const SCOPES = Object.freeze(['near', 'world']);
const WEIGHTS = Object.freeze(['minor', 'major', 'rumor']);
const INFO_FIELDS = Object.freeze(['weather', 'location', 'era', 'reputation', 'wanted']);
const MAX_EVENT_TEXT = 300;
const MAX_BASIS_TEXT = 80;
const MAX_EVENT_DAYS = 90;
const MAX_TASK_TITLE = 60;
const MAX_TASK_DETAIL = 300;
const MAX_TASKS = 30;
const MAX_INFO_TEXT = 80;
const MAX_LABEL_TEXT = 60;
const MAX_ADVANCE_DAYS = 365;
const MAX_ADVANCE_MINUTES = 1439;
const MINUTE_OF_DAY = 1440;
const DEFAULT_MAX_EVENTS = 60;
const DEFAULT_MAX_LOG = 40;
const DEFAULT_MAX_OPS = 8;
const Opid_MEMORY = 200;

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function intIn(value, min, max) {
    const num = Number(value);
    if (!Number.isInteger(num) || num < min || num > max) return null;
    return num;
}

function clampInt(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isInteger(num) || num < min || num > max) return fallback;
    return num;
}

function pad2(value) {
    return String(value).padStart(2, '0');
}

export function formatClock(clock = {}) {
    const day = intIn(clock.day, 1, 99999) ?? 1;
    const minute = clampInt(clock.minute, 0, MINUTE_OF_DAY - 1, 0);
    return `第 ${day} 天 ${pad2(Math.floor(minute / 60))}:${pad2(minute % 60)}`;
}

function initialState(now) {
    return {
        schemaVersion: 1,
        clock: { day: 1, minute: 480, label: '' },
        info: Object.fromEntries(INFO_FIELDS.map(field => [field, ''])),
        nearEvents: [],
        worldEvents: [],
        tasks: [],
        log: [],
        updatedAt: now(),
    };
}

/** 只保留认识的字段并逐条清洗事件；坏数据丢弃而不是让整份存档作废。 */
function normalizeOneTask(raw, index) {
    if (!raw || typeof raw !== 'object') return null;
    const title = text(raw.title);
    if (!title) return null;
    return {
        id: text(raw.id) || `t${index}`,
        title: title.slice(0, MAX_TASK_TITLE),
        detail: text(raw.detail).slice(0, MAX_TASK_DETAIL),
        basis: text(raw.basis).slice(0, MAX_BASIS_TEXT),
        day: clampInt(raw.day, 1, 99999, 1),
        endDay: clampInt(raw.endDay, 1, 99999, null),
        status: raw.status === 'done' ? 'done' : 'active',
        doneDay: clampInt(raw.doneDay, 1, 99999, null),
    };
}

function normalizeState(raw, now) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const clockSource = source.clock && typeof source.clock === 'object' ? source.clock : {};
    const infoSource = source.info && typeof source.info === 'object' ? source.info : {};
    let seq = 0;
    const cleanEvents = (list, scope) => (Array.isArray(list) ? list : [])
        .map(item => {
            if (!item || typeof item !== 'object') return null;
            const body = text(item.text);
            if (!body) return null;
            seq += 1;
            return {
                id: text(item.id) || `e${seq}`,
                scope,
                day: clampInt(item.day, 1, 99999, 1),
                text: body.slice(0, MAX_EVENT_TEXT),
                basis: text(item.basis).slice(0, MAX_BASIS_TEXT),
                endDay: clampInt(item.endDay, 1, 99999, null),
                weight: WEIGHTS.includes(item.weight) ? item.weight : 'minor',
                pinned: item.pinned === true,
                done: item.done === true,
                resolvedDay: clampInt(item.resolvedDay, 1, 99999, null),
            };
        })
        .filter(Boolean);
    let taskSeq = 0;
    const tasks = (Array.isArray(source.tasks) ? source.tasks : [])
        .map((item, i) => {
            const clean = normalizeOneTask(item, i + 1);
            if (clean) taskSeq = Math.max(taskSeq, Number(String(clean.id).replace(/\D/g, '')) || 0);
            return clean;
        })
        .filter(Boolean)
        .slice(-MAX_TASKS);
    return {
        schemaVersion: 1,
        clock: {
            day: clampInt(clockSource.day, 1, 99999, 1),
            minute: clampInt(clockSource.minute, 0, MINUTE_OF_DAY - 1, 480),
            label: text(clockSource.label).slice(0, MAX_LABEL_TEXT),
        },
        info: Object.fromEntries(INFO_FIELDS.map(field => [field, text(infoSource[field]).slice(0, MAX_INFO_TEXT)])),
        nearEvents: cleanEvents(source.nearEvents, 'near'),
        worldEvents: cleanEvents(source.worldEvents, 'world'),
        tasks,
        log: (Array.isArray(source.log) ? source.log : []).slice(-DEFAULT_MAX_LOG),
        updatedAt: text(source.updatedAt) || now(),
    };
}

/** 置顶且未解决的事件最该留；清理时从"已解决、未置顶、最老"的开始丢。 */
function rankEvent(event) {
    return (event.pinned ? 0 : 1) * 1e6 + (event.done ? 1 : 0) * 1e5 - event.day * 10;
}

export function createWorldRuntime({ maxEvents = DEFAULT_MAX_EVENTS, maxLog = DEFAULT_MAX_LOG, maxOps = DEFAULT_MAX_OPS, now = () => new Date().toISOString() } = {}) {
    maxEvents = clampInt(maxEvents, 10, 200, DEFAULT_MAX_EVENTS);
    maxLog = clampInt(maxLog, 5, 200, DEFAULT_MAX_LOG);
    maxOps = clampInt(maxOps, 1, 32, DEFAULT_MAX_OPS);
    let state = initialState(now);
    let seq = 0;
    let taskSeq = 0;
    let opIdMemory = [];
    let lastFloor = null; // 最近一次由模型回复落账的楼层：{ floor, undo }，同楼重 roll 时用来回滚

    function eventsOf(scope) {
        return scope === 'world' ? state.worldEvents : state.nearEvents;
    }

    function findEvent(id) {
        for (const scope of SCOPES) {
            const hit = eventsOf(scope).find(event => event.id === id);
            if (hit) return hit;
        }
        return null;
    }

    function nextId() {
        seq += 1;
        return `e${seq}`;
    }

    function findTask(id) {
        return state.tasks.find(task => task.id === id) ?? null;
    }

    function nextTaskId() {
        taskSeq += 1;
        return `t${taskSeq}`;
    }

    /** 任务超上限时先清已完成的，再清最老的进行中；避免玩家任务被无声挤掉。 */
    function pruneTasks() {
        if (state.tasks.length <= MAX_TASKS) return;
        const ranked = [...state.tasks].sort((a, b) => (b.status === 'done') - (a.status === 'done') || a.day - b.day);
        const doomed = new Set(ranked.slice(0, state.tasks.length - MAX_TASKS).map(task => task.id));
        state.tasks = state.tasks.filter(task => !doomed.has(task.id));
    }

    function prune(scope) {
        const list = eventsOf(scope);
        if (list.length <= maxEvents) return;
        const doomed = [...list].sort((a, b) => rankEvent(b) - rankEvent(a)).slice(0, list.length - maxEvents).map(event => event.id);
        const keep = new Set(list.map(event => event.id).filter(id => !doomed.includes(id)));
        const kept = list.filter(event => keep.has(event.id));
        if (scope === 'world') state.worldEvents = kept;
        else state.nearEvents = kept;
    }

    function rememberOpId(opId) {
        if (!opId) return;
        opIdMemory.push(opId);
        if (opIdMemory.length > Opid_MEMORY) opIdMemory = opIdMemory.slice(-Opid_MEMORY);
    }

    /** 时钟一动就扫一遍：带时限的事件过线自动了结，返回撤销用的恢复步骤。 */
    function sweepExpired() {
        const restored = [];
        const expired = [];
        for (const scope of SCOPES) {
            for (const event of eventsOf(scope)) {
                if (event.done || event.endDay === null || event.endDay === undefined) continue;
                if (state.clock.day <= event.endDay) continue;
                event.done = true;
                event.resolvedDay = state.clock.day;
                expired.push(event);
                restored.push({ op: '_restoreEvent', id: event.id, done: false, resolvedDay: null });
            }
        }
        return { expired, restored };
    }

    /** 单条操作校验 + 执行；返回结果对象，绝不抛出。undo 是它的反向操作（可为数组），供同楼重 roll 时撤销。 */
    function runOne(op, source) {
        if (!op || typeof op !== 'object' || Array.isArray(op)) return { ok: false, reason: 'bad_op_shape' };
        const kind = text(op.op);
        if (kind === 'advance') {
            const days = op.days === undefined ? 0 : intIn(op.days, 1, MAX_ADVANCE_DAYS);
            const minutes = op.minutes === undefined ? 0 : intIn(op.minutes, 1, MAX_ADVANCE_MINUTES);
            if (op.days !== undefined && days === null) return { ok: false, reason: 'bad_days' };
            if (op.minutes !== undefined && minutes === null) return { ok: false, reason: 'bad_minutes' };
            if (!days && !minutes) return { ok: false, reason: 'advance_empty' };
            const total = state.clock.minute + minutes + days * MINUTE_OF_DAY;
            const addedDays = Math.floor(total / MINUTE_OF_DAY);
            const before = { ...state.clock };
            state.clock.day += addedDays;
            state.clock.minute = total % MINUTE_OF_DAY;
            const swept = sweepExpired();
            const expiryNote = swept.expired.length ? `；到期了结 ${swept.expired.length} 件事（${swept.expired.map(event => event.id).join('、')}）` : '';
            return { ok: true, summary: `时间推进：${formatClock(before)} → ${formatClock(state.clock)}${expiryNote}`, expired: swept.expired.map(event => event.id), undo: [...swept.restored, { op: 'setClock', day: before.day, minute: before.minute, label: before.label }] };
        }
        if (kind === 'setClock') {
            const day = op.day === undefined ? state.clock.day : intIn(op.day, 1, 99999);
            if (day === null) return { ok: false, reason: 'bad_day' };
            const minute = op.minute === undefined ? state.clock.minute : intIn(op.minute, 0, MINUTE_OF_DAY - 1);
            if (minute === null) return { ok: false, reason: 'bad_minute' };
            const label = op.label === undefined ? state.clock.label : text(op.label).slice(0, MAX_LABEL_TEXT);
            const before = { ...state.clock };
            state.clock = { day, minute, label };
            const swept = sweepExpired();
            const expiryNote = swept.expired.length ? `；到期了结 ${swept.expired.length} 件事（${swept.expired.map(event => event.id).join('、')}）` : '';
            return { ok: true, summary: `时钟设置：${formatClock(before)} → ${formatClock(state.clock)}${label ? `（${label}）` : ''}${expiryNote}`, undo: [...swept.restored, { op: 'setClock', day: before.day, minute: before.minute, label: before.label }] };
        }
        if (kind === 'addEvent') {
            const scope = text(op.scope) || 'near';
            if (!SCOPES.includes(scope)) return { ok: false, reason: 'bad_scope' };
            const body = text(op.text);
            if (!body) return { ok: false, reason: 'text_missing' };
            if (body.length > MAX_EVENT_TEXT) return { ok: false, reason: 'text_too_long' };
            const day = op.day === undefined ? state.clock.day : intIn(op.day, 1, 99999);
            if (day === null) return { ok: false, reason: 'bad_day' };
            let endDay = null;
            if (op.days !== undefined && op.days !== null) {
                const span = intIn(op.days, 1, MAX_EVENT_DAYS);
                if (span === null) return { ok: false, reason: 'bad_days' };
                endDay = day + span - 1;
            }
            // 同栏里已有同文进行中的事件就不重记，防止模型一轮里反复登记同一件事。
            if (eventsOf(scope).some(event => !event.done && event.text === body)) return { ok: false, reason: 'duplicate_text' };
            const basis = text(op.basis).slice(0, MAX_BASIS_TEXT);
            const event = { id: nextId(), scope, day, text: body, basis, endDay, weight: WEIGHTS.includes(op.weight) ? op.weight : 'minor', pinned: false, done: false, resolvedDay: null };
            eventsOf(scope).push(event);
            prune(scope);
            const expiryNote = endDay !== null ? `，有效至第 ${endDay} 天` : '';
            return { ok: true, id: event.id, summary: `${scope === 'world' ? '世界大事' : '身边事件'} +${event.id}（第 ${day} 天）：${body}${basis ? `（依据：${basis}）` : ''}${expiryNote}`, undo: { op: '_removeEvent', id: event.id } };
        }
        if (kind === 'resolveEvent') {
            const event = findEvent(text(op.id));
            if (!event) return { ok: false, reason: 'event_not_found' };
            const beforeDone = event.done;
            const beforeResolvedDay = event.resolvedDay;
            event.done = true;
            event.resolvedDay = state.clock.day;
            return { ok: true, id: event.id, summary: `事件了结 ${event.id}：${event.text}`, undo: { op: '_restoreEvent', id: event.id, done: beforeDone, resolvedDay: beforeResolvedDay } };
        }
        if (kind === 'pinEvent') {
            const event = findEvent(text(op.id));
            if (!event) return { ok: false, reason: 'event_not_found' };
            const beforePinned = event.pinned;
            event.pinned = op.pinned !== false;
            return { ok: true, id: event.id, summary: `事件${event.pinned ? '置顶' : '取消置顶'} ${event.id}`, undo: { op: 'pinEvent', id: event.id, pinned: beforePinned } };
        }
        if (kind === 'setInfo') {
            const field = text(op.field);
            if (!INFO_FIELDS.includes(field)) return { ok: false, reason: 'bad_field' };
            const body = text(op.text);
            if (body.length > MAX_INFO_TEXT) return { ok: false, reason: 'info_too_long' };
            const beforeValue = state.info[field];
            state.info[field] = body;
            return { ok: true, summary: `世界信息更新：${field}=${body || '（清空）'}`, undo: { op: 'setInfo', field, text: beforeValue } };
        }
        // ── 任务：模型识别立任务，玩家/模型都能完成与删除 ──
        if (kind === 'addTask') {
            const title = text(op.title);
            if (!title) return { ok: false, reason: 'title_missing' };
            if (title.length > MAX_TASK_TITLE) return { ok: false, reason: 'title_too_long' };
            const detail = text(op.detail).slice(0, MAX_TASK_DETAIL);
            const basis = text(op.basis).slice(0, MAX_BASIS_TEXT);
            if (state.tasks.some(task => task.status === 'active' && task.title === title)) return { ok: false, reason: 'duplicate_task' };
            let endDay = null;
            if (op.days !== undefined && op.days !== null) {
                const span = intIn(op.days, 1, MAX_EVENT_DAYS);
                if (span === null) return { ok: false, reason: 'bad_days' };
                endDay = state.clock.day + span - 1;
            }
            const task = { id: nextTaskId(), title, detail, basis, day: state.clock.day, endDay, status: 'active', doneDay: null };
            state.tasks.push(task);
            pruneTasks();
            return { ok: true, id: task.id, summary: `任务 +${task.id}「${title}」${basis ? `（来源：${basis}）` : ''}${endDay !== null ? `，第 ${endDay} 天前需完成` : ''}`, undo: { op: '_deleteTask', id: task.id } };
        }
        if (kind === 'completeTask') {
            const task = findTask(text(op.id));
            if (!task) return { ok: false, reason: 'task_not_found' };
            if (task.status === 'done') return { ok: false, reason: 'task_already_done' };
            task.status = 'done';
            task.doneDay = state.clock.day;
            return { ok: true, id: task.id, summary: `任务完成 ${task.id}「${task.title}」`, undo: { op: '_reopenTask', id: task.id, doneDay: null } };
        }
        if (kind === 'deleteTask') {
            const id = text(op.id);
            const task = findTask(id);
            if (!task) return { ok: false, reason: 'task_not_found' };
            state.tasks = state.tasks.filter(item => item.id !== id);
            return { ok: true, id, summary: `任务删除 ${id}「${task.title}」`, undo: { op: '_restoreTask', task } };
        }
        if (kind === 'updateTask') {
            const task = findTask(text(op.id));
            if (!task) return { ok: false, reason: 'task_not_found' };
            const beforeDetail = task.detail;
            const beforeEndDay = task.endDay;
            if (op.detail !== undefined) task.detail = text(op.detail).slice(0, MAX_TASK_DETAIL);
            if (op.days !== undefined && op.days !== null) {
                const span = intIn(op.days, 1, MAX_EVENT_DAYS);
                if (span === null) return { ok: false, reason: 'bad_days' };
                task.endDay = state.clock.day + span - 1;
            }
            const changed = task.detail !== beforeDetail || task.endDay !== beforeEndDay;
            if (!changed) return { ok: false, reason: 'task_nothing_to_update' };
            return { ok: true, id: task.id, summary: `任务更新 ${task.id}「${task.title}」`, undo: { op: 'updateTask', id: task.id, detail: beforeDetail } };
        }
        // 内部撤销操作：只由同楼重 roll 的回滚调用，不写进模型指南。
        if (kind === '_deleteTask') {
            const id = text(op.id);
            const before = state.tasks.length;
            state.tasks = state.tasks.filter(item => item.id !== id);
            return { ok: true, summary: `撤销任务 ${id}`, undo: null };
        }
        if (kind === '_reopenTask') {
            const task = findTask(text(op.id));
            if (!task) return { ok: false, reason: 'task_not_found' };
            task.status = 'active';
            task.doneDay = op.doneDay === null || op.doneDay === undefined ? null : intIn(op.doneDay, 1, 99999);
            return { ok: true, summary: `恢复任务 ${task.id}` };
        }
        if (kind === '_restoreTask') {
            const restoredTask = normalizeOneTask(op.task, state.tasks.length + 1);
            if (!restoredTask) return { ok: false, reason: 'task_not_found' };
            if (findTask(restoredTask.id)) restoredTask.id = nextTaskId(); // 删除后同号已被新任务占用，换号避免双份
            state.tasks.push(restoredTask);
            pruneTasks();
            return { ok: true, summary: `恢复任务 ${restoredTask.id}` };
        }
        if (kind === '_removeEvent') {
            const id = text(op.id);
            for (const scope of SCOPES) {
                const list = eventsOf(scope);
                const at = list.findIndex(event => event.id === id);
                if (at >= 0) { list.splice(at, 1); return { ok: true, summary: `撤销新增 ${id}` }; }
            }
            return { ok: false, reason: 'event_not_found' };
        }
        if (kind === '_restoreEvent') {
            const event = findEvent(text(op.id));
            if (!event) return { ok: false, reason: 'event_not_found' };
            event.done = op.done === true;
            event.resolvedDay = op.resolvedDay === null || op.resolvedDay === undefined ? null : intIn(op.resolvedDay, 1, 99999);
            return { ok: true, summary: `恢复事件 ${event.id}` };
        }
        return { ok: false, reason: 'unknown_op' };
    }

    function apply(operations, { source = 'llm', floor = null } = {}) {
        const floorKey = Number.isInteger(floor) && floor >= 0 ? floor : null;
        const fromModel = source === 'llm' || source === 'decide';
        // 同一楼重新生成（重 roll/换 swipe）：先把上一版指令原样撤销，再执行新指令，避免重复记账。
        if (fromModel && floorKey !== null && lastFloor && lastFloor.floor === floorKey) {
            for (const undo of [...lastFloor.undo].reverse()) runOne(undo, 'revert');
            state.log.push({ at: now(), source: 'revert', summaries: [`第 ${floorKey + 1} 楼重新生成：已撤销上一版世界指令`], rejected: 0 });
            state.log = state.log.slice(-maxLog);
        }
        const list = Array.isArray(operations) ? operations.slice(0, maxOps) : [];
        const applied = [];
        const rejected = [];
        const undoSteps = [];
        const duplicate = [];
        for (const op of list) {
            const opId = text(op?.opId);
            if (opId && opIdMemory.includes(opId)) {
                duplicate.push(opId);
                continue;
            }
            const result = runOne(op, source);
            if (result.ok) {
                rememberOpId(opId);
                applied.push(result);
                if (result.undo) {
                    if (Array.isArray(result.undo)) undoSteps.push(...result.undo);
                    else undoSteps.push(result.undo);
                }
            } else {
                rejected.push({ op: text(op?.op), reason: result.reason });
            }
        }
        if (fromModel && floorKey !== null) lastFloor = { floor: floorKey, undo: undoSteps };
        if (applied.length) {
            state.updatedAt = now();
            state.log.push({ at: now(), source, summaries: applied.map(item => item.summary), rejected: rejected.length });
            state.log = state.log.slice(-maxLog);
        }
        return { status: rejected.length && !applied.length ? 'rejected' : applied.length ? 'applied' : 'noop', applied, rejected, duplicate };
    }

    function snapshot() {
        return structuredClone(state);
    }

    function status() {
        return {
            clock: { ...state.clock },
            info: { ...state.info },
            near: state.nearEvents.filter(event => !event.done).length,
            world: state.worldEvents.filter(event => !event.done).length,
            total: state.nearEvents.length + state.worldEvents.length,
            tasks: { active: state.tasks.filter(task => task.status === 'active').length, done: state.tasks.filter(task => task.status === 'done').length, total: state.tasks.length },
        };
    }

    function restore(raw) {
        state = normalizeState(raw, now);
        seq = Math.max(0, ...[...state.nearEvents, ...state.worldEvents].map(event => Number(String(event.id).replace(/\D/g, '')) || 0));
        taskSeq = Math.max(0, ...state.tasks.map(task => Number(String(task.id).replace(/\D/g, '')) || 0));
        opIdMemory = [];
        lastFloor = null;
        return { status: 'restored', ...status() };
    }

    function reset() {
        state = initialState(now);
        seq = 0;
        opIdMemory = [];
        lastFloor = null;
        return { status: 'reset', ...status() };
    }

    /** 不改世界、只往流水里记一笔（模型判断无变化、解析失败这类"决定结果"）。 */
    function note(message, { source = 'decide' } = {}) {
        state.log.push({ at: now(), source, summaries: [String(message).slice(0, MAX_EVENT_TEXT)], rejected: 0 });
        state.log = state.log.slice(-maxLog);
        return { status: 'noted' };
    }

    return Object.freeze({ apply, snapshot, status, restore, reset, note, formatClock: () => formatClock(state.clock), config: Object.freeze({ maxEvents, maxLog, maxOps }) });
}
