const STATUS_EVENT = 'doupo-agent:status';
const VALID_STATUSES = new Set([
    'processing',
    'waiting_input',
    'completed_saved',
    'failed_unapplied',
    'save_uncertain',
]);
const TERMINAL_STATUSES = new Set(['completed_saved', 'failed_unapplied']);

/**
 * Creates the first local coordinator boundary. It manages task identity and
 * status transitions only; it does not call a model or persist game state.
 */
export function createAgentCoordinator({ dispatch = detail => window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail })), now = () => new Date().toISOString() } = {}) {
    const tasks = new Map();
    let activeTaskId;

    function emit(task) {
        dispatch({ ...task, updatedAt: now() });
    }

    function begin({ taskId, title = 'Agent 任务', sessionId, branchId, stateVersion } = {}) {
        if (typeof taskId !== 'string' || !taskId.trim()) throw new TypeError('taskId 必须是非空字符串');
        const normalizedTaskId = taskId.trim();
        if (tasks.has(normalizedTaskId)) throw new Error(`taskId 已存在：${normalizedTaskId}`);
        const task = {
            taskId: normalizedTaskId, title, sessionId, branchId, stateVersion,
            status: 'processing', message: '任务已进入处理流程。',
            createdAt: now(), updatedAt: now(), sequence: 0,
        };
        tasks.set(task.taskId, task);
        activeTaskId = task.taskId;
        emit({ ...task, replace: true });
        return task.taskId;
    }

    function update(taskId, status, fields = {}) {
        if (!VALID_STATUSES.has(status)) throw new TypeError(`不支持的任务状态：${status}`);
        const task = tasks.get(taskId);
        if (!task) return { accepted: false, reason: 'unknown_task' };
        if (TERMINAL_STATUSES.has(task.status)) return { accepted: false, reason: 'task_terminal' };
        if (activeTaskId !== taskId) return { accepted: false, reason: 'not_active_task' };
        if (fields.sessionId !== undefined && fields.sessionId !== task.sessionId) return { accepted: false, reason: 'session_mismatch' };
        if (fields.branchId !== undefined && fields.branchId !== task.branchId) return { accepted: false, reason: 'branch_mismatch' };
        if (fields.stateVersion !== undefined && fields.stateVersion !== task.stateVersion) return { accepted: false, reason: 'state_version_mismatch' };

        const next = {
            ...task,
            status,
            message: typeof fields.message === 'string' ? fields.message : task.message,
            impact: typeof fields.impact === 'string' ? fields.impact : undefined,
            applied: typeof fields.applied === 'string' ? fields.applied : undefined,
            nextStep: typeof fields.nextStep === 'string' ? fields.nextStep : undefined,
            sequence: task.sequence + 1,
        };
        tasks.set(taskId, next);
        emit(next);
        return { accepted: true, task: { ...next } };
    }

    function get(taskId) {
        const task = tasks.get(taskId);
        return task ? { ...task } : undefined;
    }

    function list() {
        return [...tasks.values()].map(task => ({ ...task }));
    }

    function clear() {
        tasks.clear();
        activeTaskId = undefined;
    }

    return Object.freeze({ begin, update, get, list, clear });
}

export { STATUS_EVENT };
