import { createAgentCoordinator, STATUS_EVENT } from './core/coordinator.js';
import { createModuleRunner } from './core/module-runner.js';
import { createTurnPipeline } from './core/turn-pipeline.js';
import { createQualityGate } from './core/quality-gate.js';
import { createDataContractRegistry } from './core/data-contract.js';
import { createAuditLog } from './core/audit-log.js';
import { createFactsLibrary } from './narrative/facts-library.js';
import { createImpactEngine } from './core/impact-engine.js';
import { createActionResolver } from './request/action-resolver.js';
import { createNpcDecisionGuard } from './npc/npc-decision-guard.js';
import { createNpcAutonomyPlanner } from './npc/npc-autonomy.js';
import { createNpcPlanReassessment } from './npc/npc-plan-reassessment.js';
import { createNpcConflictCoordinator } from './npc/npc-conflict.js';
import { createNpcOutcomeBridge } from './npc/npc-outcome-bridge.js';
import { createNpcCommitGate } from './npc/npc-commit-gate.js';
import { createWorldSimulator } from './request/world-simulator.js';
import { createUiState } from './host/ui-state.js';
import { createNarrativeGuard } from './narrative/narrative-guard.js';
import { createStateStore } from './core/state-store.js';
import { createCommitRecovery } from './core/commit-recovery.js';
import { createOperationLedger } from './core/operation-ledger.js';
import { createHistoryEventAdapter } from './narrative/history-events.js';
import { classifyHistoryOperation, classifyMappedHistoryOperation } from './narrative/history-operation.js';
import { createHistoryRestore } from './narrative/history-restore.js';
import { createRequestClassifier } from './request/request-classifier.js';
import { registerAgentModules } from './core/agent-modules.js';
import { createRequestRouter } from './request/request-router.js';
import { probeHostCapabilities } from './host/capability-preflight.js';
import { createHostStorage } from './host/host-storage.js';
import { buildControlDashboard, normalizeTheme } from './host/control-dashboard.js';

const EXTENSION_ID = 'doupo-agent-ui';
const ROOT_ID = `${EXTENSION_ID}-root`;
const STYLE_ID = `${EXTENSION_ID}-style`;
const CAPABILITY_ID = `${EXTENSION_ID}-capabilities`;
const SETTINGS_BUTTON_ID = `${EXTENSION_ID}-settings-button`;
const SETTINGS_PANEL_ID = `${EXTENSION_ID}-settings-panel`;
const SETTINGS_STATUS_ID = `${EXTENSION_ID}-settings-status`;
const INLINE_SETTINGS_ID = `${EXTENSION_ID}-inline-settings`;
const VALID_STATUSES = new Set([
    'processing',
    'waiting_input',
    'completed_saved',
    'failed_unapplied',
    'save_uncertain',
]);
const LABELS = {
    processing: '处理中',
    waiting_input: '等待补充',
    completed_saved: '已完成并保存',
    failed_unapplied: '失败，未生效',
    save_uncertain: '保存结果待核对',
};

let root;
let unsubscribe;
let currentTaskId;
let agentActiveScope;
let dashboardScope;
let settingsSaveSequence = 0;
let agentCapabilities = Object.freeze({ status: 'unavailable', versions: Object.freeze({ sillytavern: null }), symbols: Object.freeze([]), missing: Object.freeze([]), fallback: '尚未执行宿主能力预检。' });
let hostContext;
let hostStorage;
let hostLifecycleBindings = [];
let inlineSettingsTimer;
let inlineSettingsAttempts = 0;
let inlineSettingsObserver;
let inlineSettingsLoading = false;
let inlineSettingsGeneration = 0;

function getHostContext() {
    try { return globalThis.SillyTavern?.getContext?.(); } catch { return undefined; }
}

function bindHostLifecycle() {
    const context = getHostContext();
    if (!context?.eventSource || !context.event_types || typeof context.eventSource.on !== 'function') return { status: 'unavailable' };
    hostLifecycleBindings.forEach(({ event, handler }) => context.eventSource.removeListener?.(event, handler));
    hostLifecycleBindings = [];
    const onReady = () => {
        hostContext = getHostContext();
        hostStorage = createHostStorage({ getContext: getHostContext });
        initializeHistoryEvents();
        mount();
    };
    for (const name of ['APP_INITIALIZED', 'APP_READY']) {
        const event = context.event_types[name];
        if (typeof event !== 'string' || !event) continue;
        context.eventSource.on(event, onReady);
        hostLifecycleBindings.push({ event, handler: onReady });
    }
    // Use the host-provided constant only; no event payload or chat id is assumed.
    const chatChanged = context.event_types.CHAT_CHANGED;
    if (typeof chatChanged === 'string' && chatChanged) {
        const handler = () => { dashboardScope = undefined; refreshControlDashboard(); };
        context.eventSource.on(chatChanged, handler);
        hostLifecycleBindings.push({ event: chatChanged, handler });
    }
    hostContext = context;
    hostStorage = createHostStorage({ getContext: getHostContext });
    return { status: 'bound', eventCount: hostLifecycleBindings.length };
}

export function recordAgentAudit(raw) {
    const item = raw && typeof raw === 'object' ? raw : {};
    const result = agentAuditLog.record({
        ...item,
        taskId: typeof item.taskId === 'string' && item.taskId.trim() ? item.taskId : 'unknown-task',
        sessionId: typeof item.sessionId === 'string' && item.sessionId.trim() ? item.sessionId : 'unknown-session',
        branchId: typeof item.branchId === 'string' && item.branchId.trim() ? item.branchId : 'unknown-branch',
        stateVersion: typeof item.stateVersion === 'string' && item.stateVersion.trim() ? item.stateVersion : 'unknown-version',
    });
    refreshControlDashboard();
    return result;
}

export const agentCoordinator = createAgentCoordinator();
export const agentAuditLog = createAuditLog();
export const agentOperations = createOperationLedger();
export const agentDataContracts = createDataContractRegistry();
export const agentModuleRunner = createModuleRunner({ updateTask: updateCoordinatorTask, audit: { record: recordAgentAudit } });
export const agentFactsLibrary = createFactsLibrary();
export const agentImpactEngine = createImpactEngine();
export const agentActionResolver = createActionResolver();
export const agentNpcDecisionGuard = createNpcDecisionGuard();
export const agentNpcAutonomyPlanner = createNpcAutonomyPlanner();
export const agentNpcPlanReassessment = createNpcPlanReassessment({ autonomyPlanner: agentNpcAutonomyPlanner, onRequest: result => recordAgentAudit({ taskId: result.obstacleId, sessionId: result.sessionId, branchId: result.branchId, stateVersion: result.stateVersion, event: result.status === 'duplicate_reassessment' ? 'npc_plan_reassessment_duplicate' : result.status === 'needs_redecision' ? 'npc_plan_reassessment_requested' : result.status === 'cleared' ? 'npc_plan_reassessment_cleared' : 'npc_plan_reassessment_blocked', outcome: result.reason ?? result.status }) });
export const agentNpcConflictCoordinator = createNpcConflictCoordinator();
export const agentWorldSimulator = createWorldSimulator();
export const agentNpcOutcomeBridge = createNpcOutcomeBridge({ actionResolver: agentActionResolver, worldSimulator: agentWorldSimulator });
export const agentUiState = createUiState();
export const agentNarrativeGuard = createNarrativeGuard();
export const agentStateStore = createStateStore();
export const agentNpcCommitGate = createNpcCommitGate({ autonomyPlanner: agentNpcAutonomyPlanner, stateStore: agentStateStore });
export const agentCommitRecovery = createCommitRecovery({ stateStore: agentStateStore });
export const agentHistoryRestore = createHistoryRestore({ stateStore: agentStateStore, commitRecovery: agentCommitRecovery });
export const agentRequestClassifier = createRequestClassifier();
export const agentModuleRegistration = registerAgentModules(agentModuleRunner, { facts: agentFactsLibrary, actions: agentActionResolver, world: agentWorldSimulator });
function getEnabledModuleIds() {
    const settings = currentSettings();
    const enabled = new Set();
    if (settings.enableFactsLibrary) enabled.add('facts-query');
    if (settings.enableActionResolution) enabled.add('action-resolve');
    if (settings.enableWorldProgress) enabled.add('world-advance');
    return agentModuleRunner.list().map(module => module.id).filter(id => enabled.has(id));
}

export const agentRequestRouter = createRequestRouter({ classifier: agentRequestClassifier, runner: agentModuleRunner, operationLedger: agentOperations, commitRecovery: agentCommitRecovery, npcCommitGate: agentNpcCommitGate, getCapabilities: () => agentCapabilities, getEnabledModuleIds });
export const unsubscribeNpcPlanChanges = agentNpcAutonomyPlanner.subscribePlanChanges(change => {
    const narrativeResult = agentNarrativeGuard.invalidateNpcPlanVersion({ sessionId: change.plan.sessionId, branchId: change.plan.branchId, stateVersion: change.plan.stateVersion, npcId: change.plan.npcId, planId: change.plan.planId, previousVersion: change.previousVersion });
    if (narrativeResult.status === 'invalidated') for (const taskId of narrativeResult.taskIds) recordAgentAudit({ event: 'narrative_candidates_invalidated', taskId, sessionId: change.plan.sessionId, branchId: change.plan.branchId, stateVersion: change.plan.stateVersion, npcId: change.plan.npcId, planId: change.plan.planId, planVersion: change.previousVersion, currentPlanVersion: change.currentVersion, outcome: narrativeResult.reason });
    const pipelineResult = agentTurnPipeline.invalidateNpcPlanVersion({ sessionId: change.plan.sessionId, branchId: change.plan.branchId, stateVersion: change.plan.stateVersion, npcId: change.plan.npcId, planId: change.plan.planId, previousVersion: change.previousVersion, currentVersion: change.currentVersion });
    if (pipelineResult.status === 'invalidated') for (const item of pipelineResult.invalidated) recordAgentAudit({ event: item.status === 'save_uncertain' ? 'commit_uncertain' : 'npc_plan_candidates_invalidated', taskId: item.taskId, sessionId: change.plan.sessionId, branchId: change.plan.branchId, stateVersion: change.plan.stateVersion, npcId: change.plan.npcId, planId: change.plan.planId, planVersion: change.previousVersion, currentPlanVersion: change.currentVersion, outcome: item.status });
    const result = agentRequestRouter.invalidateNpcPlanCandidates(change);
    if (result.status === 'invalidated') for (const item of result.invalidated) recordAgentAudit({ event: 'npc_plan_candidates_invalidated', taskId: item.requestId, sessionId: change.plan.sessionId, branchId: change.plan.branchId, stateVersion: change.plan.stateVersion, npcId: change.plan.npcId, planId: change.plan.planId, planVersion: item.result.planVersion ?? change.previousVersion, currentPlanVersion: item.result.currentPlanVersion ?? change.currentVersion, outcome: result.reason ?? `plan_${change.type}` });
});
export const agentQualityGate = createQualityGate({ contracts: agentDataContracts });
export const agentTurnPipeline = createTurnPipeline({ qualityGate: agentQualityGate, narrativeGuard: agentNarrativeGuard, commitRecovery: agentCommitRecovery, onProgress: publishPipelineProgress, audit: agentAuditLog });
export let agentHistoryEvents;

function publishPipelineProgress(progress) {
    const lifecycle = agentTurnPipeline.inspect(progress.taskId);
    if (lifecycle.status === 'missing_task') {
        if (!agentCoordinator.get(progress.taskId)) agentCoordinator.begin({ taskId: progress.taskId, sessionId: progress.sessionId, branchId: progress.branchId, stateVersion: progress.stateVersion });
    }
    const status = progress.status === 'awaiting_message_evidence' ? 'save_uncertain' : progress.status === 'committed' ? 'completed_saved' : progress.status === 'failed' || progress.status === 'cancelled' ? 'failed_unapplied' : 'processing';
    const outcome = agentCoordinator.update(progress.taskId, status, { sessionId: progress.sessionId, branchId: progress.branchId, stateVersion: progress.stateVersion, message: progress.message, applied: progress.status === 'committed' ? '内存状态已提交；宿主保存未验证' : '尚未确认正式生效', nextStep: status === 'save_uncertain' ? '核对酒馆中对应消息后再确认' : undefined });
    if (!outcome.accepted && outcome.reason !== 'task_terminal') recordAgentAudit({ taskId: progress.taskId, sessionId: progress.sessionId, branchId: progress.branchId, stateVersion: progress.stateVersion, event: 'stage_failed', stage: progress.currentStage ?? null, outcome: `coordinator_${outcome.reason}` });
}

/** Namespaced integration point for the current feature modules. */
export function probeAgentCapabilities(options) {
    agentCapabilities = probeHostCapabilities(options);
    if (root) { renderCapabilities(agentCapabilities); root.hidden = false; }
    return agentCapabilities;
}

export function getAgentCapabilities() { return agentCapabilities; }

export function initializeHistoryEvents() {
    agentCapabilities = probeHostCapabilities();
    const context = getHostContext();
    if (!context?.eventSource || !context?.event_types) return { status: 'unavailable' };
    agentHistoryEvents?.stop();
    agentHistoryEvents = createHistoryEventAdapter({
        eventSource: context.eventSource,
        eventTypes: context.event_types,
        pipeline: agentTurnPipeline,
        invalidateCandidate: options => agentRequestRouter.invalidateCandidate(options),
        getScope: () => agentActiveScope,
        onUnresolved: result => recordAgentAudit({ taskId: result.taskId, sessionId: agentActiveScope?.sessionId ?? 'unknown-session', branchId: agentActiveScope?.branchId ?? 'unknown-branch', stateVersion: agentActiveScope?.stateVersion ?? 'unknown-version', event: 'history_changed_after_commit', outcome: result.result.status }),
        onInvalidated: result => {
            const sessionId = agentActiveScope?.sessionId;
            const task = agentTurnPipeline.inspect(result.taskId);
            if (task.status !== 'missing_task') agentNarrativeGuard.clearTask(task.sessionId, task.branchId, task.stateVersion, result.taskId);
            const branchId = agentActiveScope?.branchId;
            const operation = agentOperations.list({ sessionId, branchId, limit: 500 }).find(item => item.taskId === result.taskId);
            if (operation) agentOperations.update(operation.operationId, 'history_invalidated', { sessionId, branchId, stateVersion: operation.stateVersion, reason: result.result.reason });
            recordAgentAudit({ taskId: result.taskId, sessionId: sessionId ?? 'unknown-session', branchId: branchId ?? 'unknown-branch', stateVersion: operation?.stateVersion ?? 'unknown-version', event: 'history_candidate_invalidated', outcome: result.result.status });
        },
    });
    return agentHistoryEvents.start();
}

export const doupoAgent = Object.freeze({
    coordinator: agentCoordinator,
    modules: agentModuleRunner,
    moduleRegistration: agentModuleRegistration,
    facts: agentFactsLibrary,
    impacts: agentImpactEngine,
    actions: agentActionResolver,
    npcs: agentNpcDecisionGuard,
    npcAutonomy: agentNpcAutonomyPlanner,
    npcPlanReassessment: agentNpcPlanReassessment,
    npcConflict: agentNpcConflictCoordinator,
    npcOutcome: agentNpcOutcomeBridge,
    npcCommitGate: agentNpcCommitGate,
    reviewNpcCandidate: options => agentNpcAutonomyPlanner.reviewCandidate({ ...options, decisionGuard: agentNpcDecisionGuard }),
    registerNpcPlan: options => agentNpcAutonomyPlanner.registerPlan(options),
    adjustNpcPlan: options => agentNpcAutonomyPlanner.adjustPlan(options),
    transitionNpcPlan: options => agentNpcAutonomyPlanner.transitionPlan(options),
    reassessNpcPlan: options => agentNpcPlanReassessment.request(options),
    transitionNpcReassessment: options => agentNpcPlanReassessment.transition(options),
    clearNpcReassessments: options => agentNpcPlanReassessment.clearForPlan(options),
    getNpcPlan: options => agentNpcAutonomyPlanner.getPlan(options),
    world: agentWorldSimulator,
    ui: agentUiState,
    narrative: agentNarrativeGuard,
    state: agentStateStore,
    commits: agentCommitRecovery,
    historyRestore: agentHistoryRestore,
    requests: agentRequestClassifier,
    router: agentRequestRouter,
    capabilities: Object.freeze({ probe: options => probeAgentCapabilities(options), get: () => getAgentCapabilities() }),
    pipeline: agentTurnPipeline,
    quality: agentQualityGate,
    contracts: agentDataContracts,
    audit: agentAuditLog,
    operations: agentOperations,
    get historyEvents() { return agentHistoryEvents; },
    classifyHistoryOperation,
    classifyMappedHistoryOperation,
    beginTask: task => agentCoordinator.begin(task),
    updateTask: (taskId, status, fields) => agentCoordinator.update(taskId, status, fields),
    plan: options => agentModuleRunner.plan(options),
    validatePlan: (plan, context) => agentModuleRunner.validatePlan(plan, context),
    run: options => agentModuleRunner.execute(options),
    runPlan: async ({ plan, enabledModuleIds, ...options } = {}) => {
        const validation = agentModuleRunner.validatePlan(plan, { taskType: options.taskType, enabledModuleIds });
        if (validation.status !== 'validated') throw new Error(`执行计划无效：${validation.reason}`);
        return agentModuleRunner.execute({ ...options, plan, enabledModuleIds, moduleIds: validation.moduleIds });
    },
    routeRequest: options => agentRequestRouter.prepare(options),
    runRequest: options => agentRequestRouter.run(options),
    invalidateCandidate: options => agentRequestRouter.invalidateCandidate(options),
    invalidateNpcPlanCandidates: change => agentRequestRouter.invalidateNpcPlanCandidates(change),
    revalidateCandidate: options => agentRequestRouter.revalidateCandidate(options),
    prepareCommit: options => agentRequestRouter.prepareCommit(options),
    confirmMessage: options => agentRequestRouter.confirmMessage(options),
    commitCandidate: options => agentRequestRouter.commitCandidate(options),
});

function updateCoordinatorTask(taskId, status, fields) {
    return agentCoordinator.update(taskId, status, fields);
}

function text(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}

function makeElement(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value) element.textContent = value;
    return element;
}

function renderCapabilities(capabilities) {
    if (!root || !capabilities || typeof capabilities !== 'object') return;
    const existing = root.querySelector?.(`#${CAPABILITY_ID}`);
    existing?.remove?.();
    const badge = makeElement('div', `dai-capability dai-capability-${text(capabilities.status, 'unknown')}`);
    badge.id = CAPABILITY_ID;
    badge.setAttribute('role', 'status');
    const label = capabilities.status === 'ready' ? '酒馆能力已检测' : capabilities.status === 'degraded' ? '酒馆能力不完整，已降级' : '酒馆能力未连接';
    badge.textContent = capabilities.fallback ? `${label}：${capabilities.fallback}` : label;
    const details = makeElement('span', 'dai-capability-details');
    const missing = Array.isArray(capabilities.missing) ? capabilities.missing : [];
    const symbols = Array.isArray(capabilities.symbols) ? capabilities.symbols : [];
    details.textContent = `已发现 ${symbols.length} 项能力${missing.length ? `；缺少 ${missing.join('、')}` : ''}`;
    badge.append(document.createTextNode(' '), details);
    root.prepend(badge);
}

function renderStatus(payload) {
    if (!root || !payload || typeof payload !== 'object') return;
    const settings = currentSettings();
    if (!settings.enabled || !settings.showStatusPanel) {
        root.hidden = true;
        return;
    }
    if (!VALID_STATUSES.has(payload.status)) return;

    // Ignore late results from a previous task; explicit new task ids replace the view.
    if (currentTaskId && payload.taskId && payload.taskId !== currentTaskId && payload.replace !== true) return;
    if (payload.replace === true || !currentTaskId || !payload.taskId) currentTaskId = text(payload.taskId, currentTaskId);

    const card = makeElement('section', `dai-card dai-${payload.status}`);
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');

    const heading = makeElement('div', 'dai-heading');
    heading.append(
        makeElement('strong', 'dai-status', LABELS[payload.status]),
        makeElement('span', 'dai-task', text(payload.title, currentTaskId ? `任务 ${currentTaskId}` : 'Agent 任务')),
    );
    card.append(heading);

    const message = text(payload.message);
    if (message) card.append(makeElement('p', 'dai-message', message));

    if (payload.status === 'failed_unapplied' || payload.status === 'save_uncertain') {
        const details = makeElement('ul', 'dai-details');
        const fields = [
            ['影响范围', payload.impact],
            ['已确认生效', payload.applied],
            ['下一步', payload.nextStep],
        ];
        for (const [label, value] of fields) {
            if (typeof value !== 'string' || !value.trim()) continue;
            const item = makeElement('li', '');
            item.append(makeElement('b', '', `${label}：`), document.createTextNode(value));
            details.append(item);
        }
        if (details.childElementCount) card.append(details);
    }

    if (typeof payload.updatedAt === 'string') {
        const time = makeElement('time', 'dai-time', payload.updatedAt);
        card.append(time);
    }

    root.replaceChildren(card);
    renderCapabilities(agentCapabilities);
    root.hidden = false;
}

function handleStatusEvent(event) {
    renderStatus(event?.detail);
    refreshControlDashboard();
}

function applyAppearance(settings = currentSettings()) {
    if (typeof document === 'undefined') return;
    for (const element of [document.getElementById(SETTINGS_PANEL_ID), root]) {
        if (!element) continue;
        element.dataset.theme = normalizeTheme(settings.ui?.theme);
        element.classList.toggle('dai-compact', settings.ui?.compact === true);
    }
}

function refreshControlDashboard() {
    if (typeof document === 'undefined') return;
    const panel = document.getElementById(SETTINGS_PANEL_ID);
    if (!panel || panel.hidden) return;
    const list = panel.querySelector('[data-module-list]');
    if (!list) return;
    const view = buildControlDashboard({
        settings: currentSettings(), records: agentAuditLog.list({ limit: 2000 }),
        tasks: agentCoordinator.list(), scope: dashboardScope,
    });
    const summary = panel.querySelector('[data-dashboard-summary]');
    if (summary) summary.textContent = `总控${view.enabled ? '已开启' : '已暂停'} · 最近任务：${view.taskLabel}${view.taskId ? `（${view.taskId}）` : ''}`;
    const rows = view.modules.map(module => {
        const row = makeElement('article', 'dai-module-row');
        const heading = makeElement('div', 'dai-module-heading');
        const badge = makeElement('span', 'dai-run-badge', module.label);
        badge.dataset.state = module.state;
        heading.append(makeElement('b', '', module.title), badge);
        const summary = makeElement('p', 'dai-module-summary', module.summary);
        const meta = makeElement('div', 'dai-module-meta');
        meta.append(makeElement('small', '', module.configuration));
        if (module.timestamp !== null) {
            const date = new Date(module.timestamp);
            if (Number.isFinite(date.getTime())) {
                const time = makeElement('time', '', date.toLocaleString('zh-CN', { hour12: false }));
                time.dateTime = date.toISOString();
                meta.append(time);
            }
        }
        if (module.taskId) meta.append(makeElement('small', '', `任务：${module.taskId}`));
        const button = makeElement('button', 'dai-secondary-button', '设置');
        button.type = 'button';
        button.dataset.settingsPage = module.id;
        button.setAttribute('aria-label', `打开${module.title}设置`);
        row.append(heading, summary, meta, button);
        return row;
    });
    list.replaceChildren(...rows);
}

function currentSettings() {
    hostStorage ??= createHostStorage({ getContext: getHostContext });
    return hostStorage.settings().value;
}

function updateSetting(path, value) {
    currentSettings();
    const segments = path.split('.').filter(Boolean);
    const patch = {};
    let cursor = patch;
    segments.forEach((segment, index) => {
        if (index === segments.length - 1) cursor[segment] = value;
        else { cursor[segment] = {}; cursor = cursor[segment]; }
    });
    const result = hostStorage.updateSettings(patch);
    if (result.status === 'ready') {
        if (root && (path === 'enabled' || path === 'showStatusPanel')) {
            root.hidden = !(result.value.enabled && result.value.showStatusPanel);
        }
        applyAppearance(result.value);
        refreshControlDashboard();
    }
    return result;
}

function closeSettingsPanel() {
    const panel = document.getElementById(SETTINGS_PANEL_ID);
    if (panel) panel.hidden = true;
    document.getElementById(SETTINGS_BUTTON_ID)?.setAttribute('aria-expanded', 'false');
}

function openSettingsPanel() {
    const panel = document.getElementById(SETTINGS_PANEL_ID);
    if (!panel) return;
    panel.hidden = false;
    document.getElementById(SETTINGS_BUTTON_ID)?.setAttribute('aria-expanded', 'true');
    syncSettingsForm();
    panel.querySelector('[data-settings-close]')?.focus();
}

function fieldValue(settings, path) {
    return path.split('.').reduce((value, key) => value?.[key], settings);
}

function syncSettingsForm() {
    const panel = document.getElementById(SETTINGS_PANEL_ID);
    if (!panel) return;
    const settings = currentSettings();
    for (const input of panel.querySelectorAll('[data-setting]')) {
        const value = fieldValue(settings, input.dataset.setting);
        if (input.type === 'checkbox') input.checked = Boolean(value);
        else if (input.type === 'radio') input.checked = input.value === value;
        else input.value = value == null ? '' : String(value);
    }
    applyAppearance(settings);
    refreshControlDashboard();
    const status = panel.querySelector(`#${SETTINGS_STATUS_ID}`);
    if (status) status.textContent = hostContext ? '设置会保存到酒馆扩展设置。' : '尚未连接酒馆，当前只展示本地默认值。';
}

let activeSettingsPage = 'overview';

function createSettingsPanel() {
    if (document.getElementById(SETTINGS_PANEL_ID)) return;
    const panel = makeElement('section', 'dai-settings-panel');
    panel.id = SETTINGS_PANEL_ID;
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', `${SETTINGS_PANEL_ID}-title`);
    panel.innerHTML = `
        <div class="dai-settings-backdrop" data-settings-close></div>
        <div class="dai-settings-dialog dai-settings-app">
            <aside class="dai-settings-sidebar">
                <div class="dai-settings-brand"><span class="dai-settings-mark">A</span><div><strong>斗破同人 Agent</strong><small>控制中心</small></div></div>
                <nav class="dai-settings-nav" aria-label="Agent 功能页面">
                    <button type="button" class="dai-nav-item is-active" data-settings-page="overview"><span class="dai-nav-icon">⌂</span><span><b>总控</b><small>模块简况与外观</small></span></button>
                    <p class="dai-nav-label">核心能力</p>
                    <button type="button" class="dai-nav-item" data-settings-page="llm"><span class="dai-nav-icon">✦</span><span><b>模型与连接</b><small>LLM 请求配置</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="facts"><span class="dai-nav-icon">▤</span><span><b>原著资料</b><small>事实与资料查询</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="action"><span class="dai-nav-icon">➜</span><span><b>行动结算</b><small>结果与资源变化</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="world"><span class="dai-nav-icon">◌</span><span><b>世界运转</b><small>时间与持续过程</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="npc"><span class="dai-nav-icon">♙</span><span><b>NPC 决策</b><small>人物自主行动</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="impact"><span class="dai-nav-icon">⌁</span><span><b>世界影响</b><small>跨系统变化追踪</small></span></button>
                    <p class="dai-nav-label">系统</p>
                    <button type="button" class="dai-nav-item" data-settings-page="runtime"><span class="dai-nav-icon">⚙</span><span><b>运行与界面</b><small>预算、反馈和调试</small></span></button>
                </nav>
                <div class="dai-sidebar-foot"><span class="dai-status-dot"></span><span>设置会自动保存</span></div>
            </aside>
            <main class="dai-settings-main">
                <header class="dai-settings-header">
                    <div><h2 id="${SETTINGS_PANEL_ID}-title" data-settings-title>总控</h2><p id="${SETTINGS_STATUS_ID}" role="status">${hostContext ? '已连接酒馆设置' : '尚未连接酒馆，当前只展示默认值'}</p></div>
                    <button type="button" class="dai-icon-button" data-settings-close aria-label="关闭设置">×</button>
                </header>
                <div class="dai-settings-body">
                    <section class="dai-settings-page is-active" data-settings-section="overview" role="tabpanel">
                        <div class="dai-page-heading"><h3>模块运行简况</h3><p>查看各项功能最近做了什么，再进入对应页面调整设置。</p></div>
                        <p class="dai-dashboard-summary" data-dashboard-summary role="status">暂无任务</p>
                        <div class="dai-module-list" data-module-list></div>
                        <p class="dai-dashboard-note">仅显示当前会话与分支在本次加载期间的记录；刷新后重新记录。模块“已返回”不代表正式状态已保存。</p>
                        <div class="dai-section-heading"><h3>简单设置</h3></div>
                        <div class="dai-overview-grid"><label class="dai-overview-switch"><span><b>启用 Agent 总控</b><small>保留原有设置，控制后续模块调度。</small></span><input type="checkbox" data-setting="enabled"></label><label class="dai-overview-switch"><span><b>显示运行反馈</b><small>在右下角显示任务状态与失败原因。</small></span><input type="checkbox" data-setting="showStatusPanel"></label></div>
                        <fieldset class="dai-theme-picker"><legend>界面颜色</legend><label class="dai-theme-option"><input type="radio" name="dai-theme" value="white" data-setting="ui.theme"><span class="dai-theme-swatch" data-swatch="white" aria-hidden="true"></span><b>白色</b></label><label class="dai-theme-option"><input type="radio" name="dai-theme" value="black" data-setting="ui.theme"><span class="dai-theme-swatch" data-swatch="black" aria-hidden="true"></span><b>黑色</b></label><label class="dai-theme-option"><input type="radio" name="dai-theme" value="beige" data-setting="ui.theme"><span class="dai-theme-swatch" data-swatch="beige" aria-hidden="true"></span><b>米色</b></label></fieldset>
                        <p class="dai-dashboard-note">只改变 Agent 界面，不改变酒馆整体配色。</p>
                    </section>
                    <section class="dai-settings-page" data-settings-section="llm" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 01</span><h3>模型与连接</h3><p>决定 Agent 从哪里发起模型请求，以及使用什么输出参数。</p></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>请求来源</b><small>优先复用酒馆当前连接，避免重复管理密钥。</small></div><label class="dai-setting-row dai-setting-toggle"><span><b>使用酒馆当前连接</b><small>由 SillyTavern 负责实际模型请求。</small></span><input type="checkbox" data-setting="llm.useSillyTavernConnection"></label><label class="dai-setting-row"><span><b>连接方式</b></span><select data-setting="llm.provider"><option value="openai-compatible">OpenAI 兼容接口</option><option value="anthropic">Anthropic 兼容接口</option><option value="custom">自定义</option></select></label><label class="dai-setting-row"><span><b>接口地址</b><small>独立接口的 Base URL；使用酒馆连接时可留空。</small></span><input type="url" data-setting="llm.baseUrl" placeholder="https://api.example.com/v1"></label><label class="dai-setting-row"><span><b>API Key</b><small>只保存到扩展设置，不写入聊天消息。</small></span><input type="password" data-setting="llm.apiKey" autocomplete="off" placeholder="留空表示不使用独立密钥"></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>生成参数</b><small>留空模型名称时沿用酒馆当前模型。</small></div><label class="dai-setting-row"><span><b>模型名称</b></span><input type="text" data-setting="llm.model" placeholder="沿用酒馆当前模型"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>Temperature</b><small>0 更稳定，2 更发散。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="llm.temperature"></label><label class="dai-setting-row"><span><b>最大输出 Token</b></span><input type="number" min="128" max="32768" step="128" data-setting="llm.maxTokens"></label></div><label class="dai-setting-row"><span><b>请求等待上限（毫秒）</b></span><input type="number" min="1000" max="600000" step="1000" data-setting="llm.timeoutMs"></label></div>
                    </section>
                    <section class="dai-settings-page" data-settings-section="facts" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 02</span><h3>原著资料查询</h3><p>让 Agent 在需要时读取已登记的事实，减少无依据的自由补写。</p></div><div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">▤</span><span><b>启用资料查询</b><small>关闭后不会调用 facts-query 模块。</small></span><input type="checkbox" data-setting="enableFactsLibrary"></div><label class="dai-setting-row"><span><b>资料来源</b><small>初版只读取已经登记的项目资料。</small></span><select data-setting="facts.sourceMode"><option value="registered">已登记资料</option><option value="chat">当前聊天上下文</option><option value="both">资料 + 当前聊天</option></select></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>单次最多条目</b></span><input type="number" min="1" max="100" step="1" data-setting="facts.maxEntries"></label><label class="dai-setting-row dai-setting-toggle"><span><b>允许未核验资料</b><small>关闭时只使用已确认事实。</small></span><input type="checkbox" data-setting="facts.includeUnverified"></label></div></div></section>
                    <section class="dai-settings-page" data-settings-section="action" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 03</span><h3>行动结算</h3><p>把玩家行动拆成条件、结果和资源变化候选，再决定是否提交。</p></div><div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">➜</span><span><b>启用行动结算</b><small>关闭后不会调用 action-resolve 模块。</small></span><input type="checkbox" data-setting="enableActionResolution"></div><label class="dai-setting-row dai-setting-toggle"><span><b>提交前要求确认</b><small>只生成候选，不自动写入状态。</small></span><input type="checkbox" data-setting="action.requireConfirmation"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>最多候选结果</b></span><input type="number" min="1" max="20" step="1" data-setting="action.maxCandidates"></label><label class="dai-setting-row dai-setting-toggle"><span><b>显示资源变化预览</b><small>在确认前展示影响范围。</small></span><input type="checkbox" data-setting="action.showCostPreview"></label></div></div></section>
                    <section class="dai-settings-page" data-settings-section="world" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 04</span><h3>世界运转</h3><p>管理时间推进和持续过程，避免世界状态在没有明确依据时跳变。</p></div><div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">◌</span><span><b>启用世界运转</b><small>关闭后不会调用 world-advance 模块。</small></span><input type="checkbox" data-setting="enableWorldProgress"></div><label class="dai-setting-row dai-setting-toggle"><span><b>允许自动推进</b><small>收到时间推进请求时才会生效。</small></span><input type="checkbox" data-setting="world.autoAdvance"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>默认推进分钟数</b></span><input type="number" min="1" max="1440" step="1" data-setting="world.tickMinutes"></label><label class="dai-setting-row dai-setting-toggle"><span><b>保留未确认候选</b><small>不把推测直接当成世界事实。</small></span><input type="checkbox" data-setting="world.preserveUnconfirmed"></label></div></div></section>
                    <section class="dai-settings-page" data-settings-section="npc" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 05</span><h3>NPC 决策</h3><p>控制相关人物的有限决策候选，不替 NPC 直接越过确认边界。</p></div><div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">♙</span><span><b>启用 NPC 自主决策</b><small>控制人物候选计划是否参与调度。</small></span><input type="checkbox" data-setting="enableNpcAutonomy"></div><label class="dai-setting-row dai-setting-toggle"><span><b>提交前要求确认</b><small>候选计划必须经过确认才可继续。</small></span><input type="checkbox" data-setting="npc.requireConfirmation"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>最多候选计划</b></span><input type="number" min="1" max="20" step="1" data-setting="npc.maxCandidates"></label><label class="dai-setting-row dai-setting-toggle"><span><b>允许人物冲突候选</b><small>保留冲突供上层处理。</small></span><input type="checkbox" data-setting="npc.allowConflicts"></label></div></div></section>
                    <section class="dai-settings-page" data-settings-section="impact" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 06</span><h3>世界影响</h3><p>追踪已经确认的行动如何影响资源、人物和后续世界条件。</p></div><div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">⌁</span><span><b>启用影响追踪</b><small>记录已确认行动的跨系统影响链。</small></span><input type="checkbox" data-setting="enablePlayerImpact"></div><label class="dai-setting-row dai-setting-toggle"><span><b>追踪资源变化</b><small>展示消耗、获得和变化方向。</small></span><input type="checkbox" data-setting="impact.trackResources"></label><label class="dai-setting-row dai-setting-toggle"><span><b>显示影响解释</b><small>在运行反馈中说明变化来源。</small></span><input type="checkbox" data-setting="impact.showExplanation"></label><label class="dai-setting-row"><span><b>最多影响链深度</b><small>防止一次行动展开过长的推导链。</small></span><input type="number" min="1" max="10" step="1" data-setting="impact.maxChainDepth"></label></div></section>
                    <section class="dai-settings-page" data-settings-section="runtime" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">系统 / 07</span><h3>运行与界面</h3><p>这里放全局开关、预算保护和诊断选项。</p></div><div class="dai-settings-card"><div class="dai-card-heading"><b>运行预算</b><small>这是保护上限，不代表模型一定会消耗这些额度。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>单次最多模块数</b></span><input type="number" min="1" max="32" step="1" data-setting="budget.maxModules"></label><label class="dai-setting-row"><span><b>最多 NPC 决策数</b></span><input type="number" min="0" max="20" step="1" data-setting="budget.maxNpcDecisions"></label></div><label class="dai-setting-row"><span><b>总等待上限（毫秒）</b></span><input type="number" min="1000" max="600000" step="1000" data-setting="budget.totalTimeoutMs"></label></div><div class="dai-settings-card"><div class="dai-card-heading"><b>反馈显示</b><small>控制页面和右下角反馈的显示内容。</small></div><label class="dai-setting-row dai-setting-toggle"><span><b>显示历史状态</b></span><input type="checkbox" data-setting="status.showHistory"></label><label class="dai-setting-row dai-setting-toggle"><span><b>显示能力检测提示</b></span><input type="checkbox" data-setting="status.showCapabilityBadge"></label><label class="dai-setting-row dai-setting-toggle"><span><b>紧凑界面</b></span><input type="checkbox" data-setting="ui.compact"></label><label class="dai-setting-row dai-setting-toggle"><span><b>调试信息</b><small>只记录本地诊断信息，不记录提示词或密钥。</small></span><input type="checkbox" data-setting="debug"></label></div></section>
                </div>
                <footer class="dai-settings-footer"><span>修改会自动保存到酒馆扩展设置</span><button type="button" class="dai-secondary-button" data-settings-close>完成</button></footer>
            </main>
        </div>`;
    document.body.append(panel);
    const selectPage = page => {
        activeSettingsPage = page || 'overview';
        for (const item of panel.querySelectorAll('[data-settings-page]')) item.classList.toggle('is-active', item.dataset.settingsPage === activeSettingsPage);
        for (const section of panel.querySelectorAll('[data-settings-section]')) section.hidden = section.dataset.settingsSection !== activeSettingsPage;
        const title = panel.querySelector('[data-settings-title]');
        const selected = panel.querySelector(`[data-settings-page="${activeSettingsPage}"] b`);
        if (title && selected) title.textContent = selected.textContent;
    };
    panel.addEventListener('click', event => {
        const close = event.target.closest?.('[data-settings-close]');
        if (close) return closeSettingsPanel();
        const page = event.target.closest?.('[data-settings-page]');
        if (page) selectPage(page.dataset.settingsPage);
    });
    panel.addEventListener('input', async event => {
        const input = event.target.closest?.('[data-setting]');
        if (!input || (input.type === 'radio' && !input.checked)) return;
        let value = input.type === 'checkbox' ? input.checked : input.value;
        if (input.type === 'number') value = Number(value);
        const sequence = ++settingsSaveSequence;
        const result = updateSetting(input.dataset.setting, value);
        const status = panel.querySelector(`#${SETTINGS_STATUS_ID}`);
        if (result.status !== 'ready') { status.textContent = '酒馆设置不可用，本次修改未保存。'; return; }
        status.textContent = '正在交给酒馆保存…';
        try {
            const saved = await hostStorage.saveSettings();
            if (sequence === settingsSaveSequence) status.textContent = saved.status === 'saved' ? '已交给酒馆保存。' : '已修改，但酒馆保存接口不可用。';
        } catch {
            if (sequence === settingsSaveSequence) status.textContent = '设置保存失败，请重新打开页面核对。';
        }
    });
    panel.addEventListener('keydown', event => { if (event.key === 'Escape') closeSettingsPanel(); });
    selectPage(activeSettingsPage);
    syncSettingsForm();
}

async function loadInlineSettingsTemplate() {
    const context = getHostContext();
    if (typeof context?.renderExtensionTemplateAsync === 'function') {
        try {
            // This is the standard ST template API. The canonical settings.html
            // lives beside manifest.json, matching the example extension layout.
            const html = await context.renderExtensionTemplateAsync('third-party/agent', 'settings');
            if (html) return html;
        } catch (error) {
            // A stale install or a differently named folder can make the host
            // renderer reject. Keep the local entry-module fallback available.
            console.warn(`[${EXTENSION_ID}] 酒馆模板接口不可用，改用相对路径`, error);
        }
    }

    try {
        const response = await fetch(new URL('./settings.html', import.meta.url));
        if (response.ok) return await response.text();
        console.warn(`[${EXTENSION_ID}] settings.html 请求失败：HTTP ${response.status} ${response.url}`);
    } catch (error) {
        console.warn(`[${EXTENSION_ID}] 相对路径模板加载失败`, error);
    }
    return '';
}

async function mountInlineSettings() {
    if (typeof document === 'undefined' || inlineSettingsLoading) return;
    // Follow the example extension: prefer the visible secondary settings drawer.
    const container = document.querySelector('#extensions_settings2') ?? document.querySelector('#extensions_settings');
    if (!container || document.getElementById(INLINE_SETTINGS_ID)) return;

    inlineSettingsLoading = true;
    const generation = inlineSettingsGeneration;
    try {
        const html = await loadInlineSettingsTemplate();
        if (!html || generation !== inlineSettingsGeneration || !document.body) return;
        const wrapper = document.createElement('div');
        wrapper.id = INLINE_SETTINGS_ID;
        wrapper.className = 'dai-inline-settings-host';
        wrapper.innerHTML = html;
        wrapper.querySelector('.dai-inline-open')?.addEventListener('click', openSettingsPanel);
        const status = wrapper.querySelector('.dai-inline-status');
        if (status) status.textContent = hostContext ? '已连接酒馆设置' : '等待酒馆连接';
        container.append(wrapper);
    } finally {
        inlineSettingsLoading = false;
    }
}

function scheduleInlineSettingsMount() {
    if (typeof window === 'undefined') return;
    window.clearTimeout(inlineSettingsTimer);
    inlineSettingsTimer = window.setTimeout(async () => {
        await mountInlineSettings();
        if (!document.getElementById(INLINE_SETTINGS_ID) && inlineSettingsAttempts < 12) {
            inlineSettingsAttempts += 1;
            scheduleInlineSettingsMount();
        }
    }, 250);
}

function observeInlineSettingsContainer() {
    if (inlineSettingsObserver || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    inlineSettingsObserver = new MutationObserver(() => {
        if (!document.getElementById(INLINE_SETTINGS_ID)) scheduleInlineSettingsMount();
    });
    inlineSettingsObserver.observe(document.body, { childList: true, subtree: true });
}

function mountSettingsButton() {
    if (typeof document === 'undefined' || !document.body) return;
    let button = document.getElementById(SETTINGS_BUTTON_ID);
    if (!button) {
        button = makeElement('button', 'dai-settings-button', 'Agent 设置');
        button.id = SETTINGS_BUTTON_ID;
        button.type = 'button';
        button.title = '打开斗破同人 Agent 设置';
        button.setAttribute('aria-controls', SETTINGS_PANEL_ID);
        button.setAttribute('aria-expanded', 'false');
        button.addEventListener('click', openSettingsPanel);
    }
    const host = document.querySelector('#top-bar, #top-bar-items, #extensionsMenu');
    if (host && !host.contains(button)) host.append(button);
    else if (!button.isConnected) document.body.append(button);
    createSettingsPanel();
}

function mount() {
    if (typeof document === 'undefined' || typeof window === 'undefined' || !document.body) return;
    if (!document.getElementById(STYLE_ID)) {
        const link = document.createElement('link');
        link.id = STYLE_ID;
        link.rel = 'stylesheet';
        link.href = new URL('./host/style.css', import.meta.url).href;
        document.head.append(link);
    }

    root = document.getElementById(ROOT_ID);
    if (!root) {
        root = makeElement('aside', 'dai-root');
        root.id = ROOT_ID;
        root.setAttribute('aria-label', 'Agent 运行反馈');
        root.hidden = true;
        document.body.append(root);
    }

    window.removeEventListener(STATUS_EVENT, handleStatusEvent);
    window.addEventListener(STATUS_EVENT, handleStatusEvent);
    mountSettingsButton();
    applyAppearance();
    inlineSettingsAttempts = 0;
    observeInlineSettingsContainer();
    scheduleInlineSettingsMount();
    unsubscribe = () => window.removeEventListener(STATUS_EVENT, handleStatusEvent);
}

export function onActivate() {
    bindHostLifecycle();
    mount();
}

export async function onInstall() {
    bindHostLifecycle();
    hostStorage ??= createHostStorage({ getContext: getHostContext });
    const settings = hostStorage.settings();
    if (settings.status === 'ready') await hostStorage.saveSettings();
}

export async function onUpdate() {
    hostStorage ??= createHostStorage({ getContext: getHostContext });
    const settings = hostStorage.settings();
    if (settings.status === 'ready') await hostStorage.saveSettings();
}

export function onDelete() {
    onDisable();
}

export async function onClean() {
    hostStorage ??= createHostStorage({ getContext: getHostContext });
    return hostStorage.clean();
}

export function onDisable() {
    agentHistoryEvents?.stop();
    const context = hostContext ?? getHostContext();
    for (const { event, handler } of hostLifecycleBindings.splice(0)) context?.eventSource?.removeListener?.(event, handler);
    agentCapabilities = Object.freeze({ status: 'unavailable', versions: Object.freeze({ sillytavern: null }), symbols: Object.freeze([]), missing: Object.freeze([]), fallback: '扩展已停用，尚未连接宿主。' });
    unsubscribe?.();
    unsubscribe = undefined;
    inlineSettingsGeneration += 1;
    inlineSettingsObserver?.disconnect();
    inlineSettingsObserver = undefined;
    if (typeof window !== 'undefined') window.clearTimeout(inlineSettingsTimer);
    if (typeof document !== 'undefined') {
        document.getElementById(ROOT_ID)?.remove();
        document.getElementById(SETTINGS_PANEL_ID)?.remove();
        document.getElementById(SETTINGS_BUTTON_ID)?.remove();
        document.getElementById(INLINE_SETTINGS_ID)?.remove();
        document.getElementById(STYLE_ID)?.remove();
    }
    root = undefined;
    currentTaskId = undefined;
    dashboardScope = undefined;
    settingsSaveSequence += 1;
}

export function onEnable() {
    bindHostLifecycle();
    mount();
    initializeHistoryEvents();
}

function start() {
    onActivate();
    onEnable();
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
}

if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        unsubscribe?.();
        unsubscribe = undefined;
        inlineSettingsGeneration += 1;
        inlineSettingsObserver?.disconnect();
        inlineSettingsObserver = undefined;
        window.clearTimeout(inlineSettingsTimer);
        root?.remove();
        if (typeof document !== 'undefined') {
            document.getElementById(SETTINGS_PANEL_ID)?.remove();
            document.getElementById(SETTINGS_BUTTON_ID)?.remove();
            document.getElementById(INLINE_SETTINGS_ID)?.remove();
            document.getElementById(STYLE_ID)?.remove();
        }
        root = undefined;
        currentTaskId = undefined;
        agentHistoryEvents?.stop();
        agentCoordinator.clear();
        agentModuleRunner.clear?.();
        hostContext = undefined;
        hostStorage = undefined;
        hostLifecycleBindings = [];
    });
}

/**
 * Feed a task update from the extension's future coordinator integration.
 * Accepted statuses: processing, waiting_input, completed_saved, failed_unapplied, save_uncertain.
 */
export function publishAgentStatus(detail) {
    window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail }));
}

// Stable public helpers for the next modules to register and report their work.
export function beginAgentTask(task) {
    if (task?.sessionId && task?.branchId && task?.taskId) {
        const current = agentActiveScope?.sessionId === task.sessionId && agentActiveScope?.branchId === task.branchId ? agentActiveScope.taskIds : [];
        agentActiveScope = { sessionId: task.sessionId, branchId: task.branchId, taskIds: [...new Set([...current, task.taskId])] };
        dashboardScope = agentActiveScope;
    }
    const result = agentCoordinator.begin(task);
    initializeHistoryEvents();
    return result;
}

export function setAgentHistoryScope(scope) {
    if (!scope || typeof scope.sessionId !== 'string' || typeof scope.branchId !== 'string' || !Array.isArray(scope.taskIds) || scope.taskIds.some(id => typeof id !== 'string')) throw new TypeError('scope 必须包含会话、分支和任务 ID 列表');
    agentActiveScope = { sessionId: scope.sessionId, branchId: scope.branchId, taskIds: [...new Set(scope.taskIds)] };
    dashboardScope = agentActiveScope;
    refreshControlDashboard();
    const scopeResult = agentHistoryEvents?.refreshScope?.();
    return { status: 'set', taskCount: agentActiveScope.taskIds.length, scopeResult: scopeResult?.status ?? 'not_listening' };
}

export function updateAgentTask(taskId, status, fields) {
    return agentCoordinator.update(taskId, status, fields);
}

