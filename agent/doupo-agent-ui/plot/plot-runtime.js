/**
 * 剧情账本运行时：保存"这一局的故事要往哪走、埋了哪些还没回收的线"并在校验后修改它。
 * 状态内容：滚动计划（本幕目标 + 下一步走向）、线索账（伏笔/悬念/恩怨）和一份操作流水。
 *
 * 与世界台账的分工是硬边界：世界时钟/事件/任务归世界运转，人物档案归人物簿，
 * 这里只记叙事层的前瞻与未回收线索——正文模型每轮注入的"剧情前瞻"由它生成。
 *
 * 所有修改都走 apply()：单条操作要么通过校验生效，要么带着原因被拒绝，
 * 绝不抛异常打断调用方。运行时自己不拥有时钟：world day 由调用方在 apply/restore
 * 时以 today 喂进来（读世界台账的当前天数），悬置天数、到期判定都按它算。
 */

import { titleSimilarity, SIMILAR_WINDOW_DAYS, SIMILAR_SCORE } from '../core/text-similarity.js';

const KINDS = Object.freeze(['foreshadow', 'suspense', 'conflict']);
export const KIND_LABELS = Object.freeze({ foreshadow: '伏笔', suspense: '悬念', conflict: '恩怨' });
const THREAD_STATUSES = Object.freeze(['open', 'resolved', 'dropped']);

const MAX_PLAN_GOAL = 60;
const MAX_PLAN_NEXT = 120;
const MAX_THREAD_TITLE = 16;
const MAX_THREAD_DETAIL = 200;
const MAX_BASIS_TEXT = 80;
const MAX_OUTCOME_TEXT = 80;
/** addThread 的 dueDays（预期回收窗口）上限，与世界事件同时限同宽。 */
const MAX_THREAD_DAYS = 90;
const MAX_OPEN_THREADS = 12;
const DEFAULT_MAX_THREADS = 40;
const DEFAULT_MAX_LOG = 30;
const DEFAULT_MAX_OPS = 8;
const MAX_ID_TEXT = 12;
const MAX_LOG_TEXT = 300;

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function intIn(value, min, max) {
    const num = Number(value);
    return Number.isInteger(num) && num >= min && num <= max ? num : null;
}

function clampInt(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isInteger(num) || num < min || num > max) return fallback;
    return num;
}

/** 流水摘要里引用长文本时截短，防止一行流水吞掉小半屏。 */
function clipText(value, cap = 24) {
    const body = text(value);
    return body.length > cap ? `${body.slice(0, cap)}…` : body;
}

function initialState(now) {
    return {
        schemaVersion: 1,
        day: null,
        plan: { goal: '', next: '', updatedAt: '' },
        threads: [],
        log: [],
        updatedAt: now(),
    };
}

/** 只保留认识的字段并逐条清洗线索；坏数据丢弃而不是让整份存档作废。 */
function normalizeOneThread(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = text(raw.title);
    if (!title) return null;
    return {
        id: text(raw.id) || 'f1',
        title: title.slice(0, MAX_THREAD_TITLE),
        kind: KINDS.includes(raw.kind) ? raw.kind : 'foreshadow',
        detail: text(raw.detail).slice(0, MAX_THREAD_DETAIL),
        basis: text(raw.basis).slice(0, MAX_BASIS_TEXT),
        day: clampInt(raw.day, 1, 99999, null),
        dueDay: clampInt(raw.dueDay, 1, 99999, null),
        status: THREAD_STATUSES.includes(raw.status) ? raw.status : 'open',
        resolvedDay: clampInt(raw.resolvedDay, 1, 99999, null),
        outcome: text(raw.outcome).slice(0, MAX_OUTCOME_TEXT),
    };
}

function normalizeState(raw, now) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const planSource = source.plan && typeof source.plan === 'object' ? source.plan : {};
    return {
        schemaVersion: 1,
        day: clampInt(source.day, 1, 99999, null),
        plan: {
            goal: text(planSource.goal).slice(0, MAX_PLAN_GOAL),
            next: text(planSource.next).slice(0, MAX_PLAN_NEXT),
            updatedAt: text(planSource.updatedAt),
        },
        threads: (Array.isArray(source.threads) ? source.threads : []).map(normalizeOneThread).filter(Boolean).slice(-DEFAULT_MAX_THREADS),
        log: (Array.isArray(source.log) ? source.log : []).slice(-DEFAULT_MAX_LOG),
        updatedAt: text(source.updatedAt) || now(),
    };
}

export function createPlotRuntime({ maxThreads = DEFAULT_MAX_THREADS, maxLog = DEFAULT_MAX_LOG, maxOps = DEFAULT_MAX_OPS, now = () => new Date().toISOString() } = {}) {
    maxThreads = clampInt(maxThreads, 10, 200, DEFAULT_MAX_THREADS);
    maxLog = clampInt(maxLog, 5, 200, DEFAULT_MAX_LOG);
    maxOps = clampInt(maxOps, 1, 32, DEFAULT_MAX_OPS);
    let state = initialState(now);
    let seq = 0;
    let lastFloor = null; // 最近一次由模型回复落账的楼层：{ floor, undo }，同楼重 roll 时用来回滚

    function openThreads() {
        return state.threads.filter(thread => thread.status === 'open');
    }

    function findThread(id) {
        return state.threads.find(thread => thread.id === id) ?? null;
    }

    function nextId() {
        seq += 1;
        return `f${seq}`;
    }

    /** 开放线索超上限时先清已了结的（正常不会在账上），再清最老的开放线；避免线索被无声挤掉前无限增长。 */
    function prune() {
        if (state.threads.length <= maxThreads) return;
        const rank = thread => (thread.status === 'open' ? 0 : 1) * 1e6 - (thread.day ?? 0);
        const ranked = [...state.threads].sort((a, b) => rank(a) - rank(b));
        const doomed = new Set(ranked.slice(0, state.threads.length - maxThreads).map(thread => thread.id));
        state.threads = state.threads.filter(thread => !doomed.has(thread.id));
    }

    /** 单条操作校验 + 执行；返回结果对象，绝不抛出。undo 是它的反向操作（可为数组），供同楼重 roll 时撤销。 */
    function runOne(op) {
        if (!op || typeof op !== 'object' || Array.isArray(op)) return { ok: false, reason: 'bad_op_shape' };
        const kind = text(op.op);
        if (kind === 'setPlan') {
            const goal = op.goal === undefined ? undefined : text(op.goal).slice(0, MAX_PLAN_GOAL);
            const next = op.next === undefined ? undefined : text(op.next).slice(0, MAX_PLAN_NEXT);
            if (goal === undefined && next === undefined) return { ok: false, reason: 'plan_nothing_to_update' };
            const before = { ...state.plan };
            if (goal !== undefined) state.plan.goal = goal;
            if (next !== undefined) state.plan.next = next;
            state.plan.updatedAt = now();
            const changed = state.plan.goal !== before.goal || state.plan.next !== before.next;
            if (!changed) return { ok: false, reason: 'plan_nothing_to_update' };
            const parts = [];
            if (goal !== undefined) parts.push(`目标 → ${clipText(state.plan.goal, 40) || '（清空）'}`);
            if (next !== undefined) parts.push(`下一步 → ${clipText(state.plan.next, 40) || '（清空）'}`);
            return { ok: true, summary: `剧情计划更新：${parts.join('；')}`, undo: { op: '_setPlanRaw', plan: before } };
        }
        if (kind === 'addThread') {
            const title = text(op.title);
            if (!title) return { ok: false, reason: 'title_missing' };
            if (title.length > MAX_THREAD_TITLE) return { ok: false, reason: 'title_too_long' };
            const basis = text(op.basis);
            if (!basis) return { ok: false, reason: 'basis_missing' };
            if (basis.length > MAX_BASIS_TEXT) return { ok: false, reason: 'basis_too_long' };
            const kindValue = KINDS.includes(op.kind) ? op.kind : 'foreshadow';
            const detail = text(op.detail).slice(0, MAX_THREAD_DETAIL);
            if (openThreads().length >= MAX_OPEN_THREADS) return { ok: false, reason: 'threads_full' };
            if (openThreads().some(thread => thread.title === title)) return { ok: false, reason: 'duplicate_title' };
            const today = state.day ?? 1;
            if (openThreads().some(thread => Math.abs((thread.day ?? today) - today) <= SIMILAR_WINDOW_DAYS
                && titleSimilarity(thread.title, title) >= SIMILAR_SCORE)) return { ok: false, reason: 'duplicate_similar' };
            let dueDay = null;
            if (op.dueDays !== undefined && op.dueDays !== null) {
                const span = intIn(op.dueDays, 1, MAX_THREAD_DAYS);
                if (span === null) return { ok: false, reason: 'bad_days' };
                dueDay = today + span - 1;
            }
            const thread = { id: nextId(), title, kind: kindValue, detail, basis, day: today, dueDay, status: 'open', resolvedDay: null, outcome: '' };
            state.threads.push(thread);
            prune();
            const kindNote = KIND_LABELS[kindValue];
            const dueNote = dueDay !== null ? `，第 ${dueDay} 天前回收` : '';
            return { ok: true, id: thread.id, summary: `线索 +${thread.id}（${kindNote}）「${title}」：${clipText(detail || basis, 40)}（依据：${basis}）${dueNote}`, undo: { op: '_removeThread', id: thread.id } };
        }
        if (kind === 'resolveThread') {
            const thread = findThread(text(op.id));
            if (!thread) return { ok: false, reason: 'thread_not_found' };
            if (thread.status !== 'open') return { ok: false, reason: 'thread_not_open' };
            const outcome = text(op.outcome).slice(0, MAX_OUTCOME_TEXT);
            const before = { ...thread };
            thread.status = 'resolved';
            thread.resolvedDay = state.day ?? null;
            if (outcome) thread.outcome = outcome;
            return { ok: true, id: thread.id, summary: `线索回收 ${thread.id}「${thread.title}」${outcome ? `（交代：${outcome}）` : ''}`, undo: { op: '_setThreadRaw', thread: before } };
        }
        if (kind === 'dropThread') {
            const thread = findThread(text(op.id));
            if (!thread) return { ok: false, reason: 'thread_not_found' };
            if (thread.status !== 'open') return { ok: false, reason: 'thread_not_open' };
            const outcome = text(op.outcome).slice(0, MAX_OUTCOME_TEXT);
            const before = { ...thread };
            thread.status = 'dropped';
            thread.resolvedDay = state.day ?? null;
            if (outcome) thread.outcome = outcome;
            return { ok: true, id: thread.id, summary: `线索作废 ${thread.id}「${thread.title}」${outcome ? `（${outcome}）` : ''}`, undo: { op: '_setThreadRaw', thread: before } };
        }
        if (kind === 'updateThread') {
            const thread = findThread(text(op.id));
            if (!thread) return { ok: false, reason: 'thread_not_found' };
            let detail = thread.detail;
            if (op.detail !== undefined) {
                const next = text(op.detail);
                if (!next) return { ok: false, reason: 'detail_missing' };
                if (next.length > MAX_THREAD_DETAIL) return { ok: false, reason: 'detail_too_long' };
                detail = next;
            }
            let dueDay = thread.dueDay;
            if (op.dueDays !== undefined && op.dueDays !== null) {
                const span = intIn(op.dueDays, 1, MAX_THREAD_DAYS);
                if (span === null) return { ok: false, reason: 'bad_days' };
                dueDay = (state.day ?? thread.day ?? 1) + span - 1;
            }
            if (detail === thread.detail && dueDay === thread.dueDay) return { ok: false, reason: 'thread_nothing_to_update' };
            const before = { ...thread };
            thread.detail = detail;
            thread.dueDay = dueDay;
            return { ok: true, id: thread.id, summary: `线索推进 ${thread.id}「${thread.title}」：${clipText(detail, 40)}`, undo: { op: '_setThreadRaw', thread: before } };
        }
        // 内部撤销操作：只由同楼重 roll 的回滚调用，不写进模型指南。
        if (kind === '_removeThread') {
            const id = text(op.id);
            const before = state.threads.length;
            state.threads = state.threads.filter(thread => thread.id !== id);
            return before === state.threads.length ? { ok: false, reason: 'thread_not_found' } : { ok: true, summary: `撤销线索 ${id}` };
        }
        if (kind === '_setThreadRaw') {
            const thread = normalizeOneThread(op.thread);
            if (!thread) return { ok: false, reason: 'thread_not_found' };
            const at = state.threads.findIndex(item => item.id === thread.id);
            if (at >= 0) state.threads[at] = thread;
            else state.threads.push(thread);
            return { ok: true, summary: `恢复线索 ${thread.id}` };
        }
        if (kind === '_setPlanRaw') {
            const plan = op.plan && typeof op.plan === 'object' ? op.plan : null;
            if (!plan) return { ok: false, reason: 'plan_not_found' };
            state.plan = {
                goal: text(plan.goal).slice(0, MAX_PLAN_GOAL),
                next: text(plan.next).slice(0, MAX_PLAN_NEXT),
                updatedAt: text(plan.updatedAt),
            };
            return { ok: true, summary: '恢复剧情计划' };
        }
        return { ok: false, reason: 'unknown_op' };
    }

    function apply(operations, { source = 'llm', floor = null, today = null } = {}) {
        const floorKey = Number.isInteger(floor) && floor >= 0 ? floor : null;
        const fromModel = source === 'llm' || source === 'decide';
        const dayValue = intIn(today, 1, 99999);
        if (dayValue !== null) state.day = dayValue;
        // 同一楼重新生成（重 roll/换 swipe）：先把上一版指令原样撤销，再执行新指令，避免重复记账。
        if (fromModel && floorKey !== null && lastFloor && lastFloor.floor === floorKey) {
            for (const undo of [...lastFloor.undo].reverse()) runOne(undo);
            state.log.push({ at: now(), source: 'revert', summaries: [`第 ${floorKey + 1} 楼重新生成：已撤销上一版剧情指令`], rejected: 0 });
            state.log = state.log.slice(-maxLog);
        }
        const list = Array.isArray(operations) ? operations.slice(0, maxOps) : [];
        const applied = [];
        const rejected = [];
        const undoSteps = [];
        for (const op of list) {
            const result = runOne(op);
            if (result.ok) {
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
        return { status: rejected.length && !applied.length ? 'rejected' : applied.length ? 'applied' : 'noop', applied, rejected };
    }

    function snapshot() {
        return structuredClone(state);
    }

    function status() {
        const open = openThreads();
        const today = state.day ?? 1;
        return {
            day: state.day,
            plan: { ...state.plan },
            threads: { open: open.length, resolved: state.threads.filter(thread => thread.status === 'resolved').length, dropped: state.threads.filter(thread => thread.status === 'dropped').length, total: state.threads.length },
            overdue: open.filter(thread => thread.dueDay !== null && thread.dueDay < today).length,
        };
    }

    function restore(raw) {
        state = normalizeState(raw, now);
        seq = Math.max(0, ...state.threads.map(thread => Number(String(thread.id).replace(/\D/g, '')) || 0));
        lastFloor = null;
        return { status: 'restored', ...status() };
    }

    function reset() {
        state = initialState(now);
        seq = 0;
        lastFloor = null;
        return { status: 'reset', ...status() };
    }

    /** 不改账、只往流水里记一笔（模型判断无变化、解析失败这类"决定结果"）。 */
    function note(message, { source = 'decide' } = {}) {
        state.log.push({ at: now(), source, summaries: [String(message).slice(0, MAX_LOG_TEXT)], rejected: 0 });
        state.log = state.log.slice(-maxLog);
        return { status: 'noted' };
    }

    return Object.freeze({ apply, snapshot, status, restore, reset, note, config: Object.freeze({ maxThreads, maxLog, maxOps }) });
}
