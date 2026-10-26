// A read-only view over existing audit metadata. Never inspects prompts or model output.
const MODULES = Object.freeze([
    { id: 'facts', title: '原著设定', setting: 'setting.enabled', legacySetting: 'enableFactsLibrary', stage: 'facts-query' },
    { id: 'action', title: '行动结算', setting: 'enableActionResolution', stage: 'action-resolve' },
    { id: 'world', title: '世界运转', setting: 'enableWorldProgress', stage: 'world-advance' },
    { id: 'npc', title: 'NPC 决策', setting: 'enableNpcAutonomy' },
    { id: 'impact', title: '世界影响', setting: 'enablePlayerImpact' },
    { id: 'sandbox', title: '沙盒模式', setting: 'enableSandboxMode', stage: 'sandbox-advance' },
    { id: 'llm', title: '模型与连接' },
]);

const STAGES = Object.freeze({
    stage_start: ['processing', '处理中', '模块已开始运行。'],
    stage_complete: ['completed', '已返回', '模块已返回结果，等待总控统一提交。'],
    stage_failed: ['failed', '失败', '模块未正常返回。'],
    task_cancelled: ['waiting', '已停止', '本次执行已停止，结果不再采用。'],
});
const NPC_EVENTS = Object.freeze({
    npc_plan_reassessment_requested: ['waiting', '等待重新决策', '已发现计划障碍，等待重新决策。'],
    npc_plan_reassessment_duplicate: ['waiting', '已跳过重复请求', '同一障碍的重复决策请求已跳过。'],
    npc_plan_reassessment_blocked: ['failed', '重新决策受阻', '重新决策请求未通过检查。'],
    npc_plan_reassessment_cleared: ['completed', '障碍已解除', '计划障碍已解除，等待下一轮重新评估。'],
    npc_plan_candidates_invalidated: ['waiting', '候选已失效', '聊天历史发生变化，旧计划候选不再采用。'],
});
const FAILURE_REASONS = Object.freeze({
    timeout: '等待超时。', optional_timeout: '可选模块等待超时。',
    error: '执行出现错误，请检查运行反馈。', optional_error: '可选模块执行出现错误。',
    budget_exhausted: '运行预算已用完。',
});
const TASK_LABELS = Object.freeze({
    processing: '处理中', waiting_input: '等待补充', completed_saved: '已完成并保存',
    failed_unapplied: '失败，未生效', save_uncertain: '保存结果待核对',
});

export function normalizeTheme(theme) {
    return ['white', 'black', 'beige'].includes(theme) ? theme : 'black';
}

/** Scope filtering is explicit: an unknown scope shows no cross-chat records. */
export function buildControlDashboard({ settings = {}, records = [], tasks = [], scope, injectionNote } = {}) {
    const matches = item => scope && item.sessionId === scope.sessionId && item.branchId === scope.branchId
        && Array.isArray(scope.taskIds) && scope.taskIds.includes(item.taskId);
    const scopedRecords = records.filter(matches);
    const task = tasks.filter(matches).at(-1);
    const readEnabled = module => {
        const keys = [module.setting, module.legacySetting].filter(Boolean);
        if (!keys.length) return null;
        for (const key of keys) if (settings[key] !== undefined) return settings[key] !== false;
        return true;
    };
    const modules = MODULES.map(module => {
        const enabled = readEnabled(module);
        const record = scopedRecords.filter(item => (module.stage && item.stage === module.stage && STAGES[item.event])
            || (module.id === 'npc' && NPC_EVENTS[item.event])).at(-1);
        const state = record && (module.id === 'npc' ? NPC_EVENTS[record.event] : STAGES[record.event]);
        const idleSummary = module.id === 'facts' && typeof injectionNote === 'string' && injectionNote.trim()
            ? injectionNote
            : module.id === 'llm' ? '本轮还没有发出模型请求。' : '当前会话暂无该功能的运行记录。';
        return {
            id: module.id, title: module.title,
            configuration: enabled === null ? (settings.llm?.useSillyTavernConnection !== false ? '使用酒馆连接' : '使用独立连接')
                : enabled ? (settings.enabled === false ? '已开启 · 总控已暂停' : '已开启') : '已关闭',
            state: state?.[0] ?? 'idle', label: state?.[1] ?? '暂无记录',
            summary: state ? (record.event === 'stage_failed' ? FAILURE_REASONS[record.outcome] ?? state[2] : state[2]) : idleSummary,
            taskId: record?.taskId ?? null,
            timestamp: Number.isFinite(record?.timestamp) ? record.timestamp : null,
        };
    });
    return {
        enabled: settings.enabled !== false,
        taskLabel: task ? TASK_LABELS[task.status] ?? '状态待核对' : '暂无任务',
        taskId: task?.taskId ?? null,
        modules,
    };
}
