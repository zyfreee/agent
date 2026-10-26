import { createAgentCoordinator, STATUS_EVENT } from './core/coordinator.js';
import { createModuleRunner } from './core/module-runner.js';
import { createTurnPipeline } from './core/turn-pipeline.js';
import { createQualityGate } from './core/quality-gate.js';
import { createDataContractRegistry } from './core/data-contract.js';
import { createAuditLog } from './core/audit-log.js';
import { createFactsLibrary } from './narrative/facts-library.js';
import { createSettingSupply } from './narrative/setting-supply.js';
import { createImpactEngine } from './core/impact-engine.js';
import { createActionResolver } from './request/action-resolver.js';
import { createNpcDecisionGuard } from './npc/npc-decision-guard.js';
import { createNpcAutonomyPlanner } from './npc/npc-autonomy.js';
import { createNpcPlanReassessment } from './npc/npc-plan-reassessment.js';
import { createNpcConflictCoordinator } from './npc/npc-conflict.js';
import { createNpcOutcomeBridge } from './npc/npc-outcome-bridge.js';
import { createNpcCommitGate } from './npc/npc-commit-gate.js';
import { createWorldSimulator } from './request/world-simulator.js';
import { createSandboxMode } from './sandbox/sandbox-mode.js';
import { createSandboxNodes } from './sandbox/sandbox-nodes.js';
import { createSandboxGoals } from './sandbox/sandbox-goals.js';
import { createSandboxLeads } from './sandbox/sandbox-leads.js';
import { createSandboxEngine } from './sandbox/sandbox-engine.js';
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
import { createTurnStages } from './core/turn-stages.js';
import { createOrchestrator } from './core/orchestrator.js';
import { registerDefaultContracts } from './core/turn-state.js';
import { createLlmClient } from './host/llm-client.js';
import { createMessageAdapter } from './host/message-adapter.js';
import { createStatePersistence } from './host/state-persistence.js';
import { createPromptInjection } from './host/prompt-injection.js';
import { loadWorldbookEntries, summarizeWorldbookEntries } from './narrative/worldbook-source.js';
import { createFactsIndex } from './narrative/facts-index.js';
import { createFactsSelector, LOOKUP_RULES, SELECT_RULES } from './narrative/facts-select.js';
import { createWorldRuntime } from './world/world-runtime.js';
import { buildWorldInjection, extractOpsBlock, parseOps, stripOpsBlock, OPS_GUIDE, WORLD_HEADER } from './world/world-ops.js';

const EXTENSION_ID = 'doupo-agent-ui';
const ROOT_ID = `${EXTENSION_ID}-root`;
const STYLE_ID = `${EXTENSION_ID}-style`;
const CAPABILITY_ID = `${EXTENSION_ID}-capabilities`;
const SETTINGS_BUTTON_ID = `${EXTENSION_ID}-settings-button`;
const SETTINGS_PANEL_ID = `${EXTENSION_ID}-settings-panel`;
const SETTINGS_STATUS_ID = `${EXTENSION_ID}-settings-status`;
const INLINE_SETTINGS_ID = `${EXTENSION_ID}-inline-settings`;
const WORLD_BUTTON_ID = `${EXTENSION_ID}-world-button`;
const WORLD_PANEL_ID = `${EXTENSION_ID}-world-panel`;
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
        restoreWorldFromChat();
        void syncWorldbookIndex();
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
        const handler = () => {
            dashboardScope = undefined;
            try { agentPromptInjection.clear(); } catch { /* 切聊天时清空注入 */ }
            try { agentWorldPromptInjection.clear(); } catch { /* 同上 */ }
            try { restoreWorldFromChat(); } catch { /* 换聊天读不到世界台账时按开局处理 */ }
            try { agentOrchestrator.restore(currentAgentScope()); } catch { /* 未连接酒馆时跳过恢复 */ }
            refreshControlDashboard();
            refreshWorldPage();
            refreshWorldOverlay();
            void syncWorldbookIndex();
        };
        context.eventSource.on(chatChanged, handler);
        hostLifecycleBindings.push({ event: chatChanged, handler });
    }
    // The prompt container is global: leave one injected turn uncleared and it
    // keeps riding along in every later prompt.
    for (const name of ['GENERATION_ENDED', 'GENERATION_STOPPED']) {
        const event = context.event_types[name];
        if (typeof event !== 'string' || !event) continue;
        const handler = () => {
            // 生成结束先执行模型留在正文里的世界指令，再清空两路注入，最后刷新界面。
            try { applyWorldOpsFromLatestReply(); } catch { /* 指令执行失败不影响生成 */ }
            try { agentPromptInjection.clear(); } catch { /* 清空失败不影响生成 */ }
            try { agentWorldPromptInjection.clear(); } catch { /* 同上 */ }
            try { refreshWorldOverlay(); } catch { /* 浮层未挂载时忽略 */ }
            try {
                const panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null;
                if (panel && !panel.hidden) { renderFactsStatus(panel); refreshWorldbookStats(panel); refreshWorldPage(panel); refreshControlDashboard(); }
            } catch { /* 面板未挂载时忽略 */ }
        };
        context.eventSource.on(event, handler);
        hostLifecycleBindings.push({ event, handler });
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
export const agentSettingSupply = createSettingSupply();
export const agentImpactEngine = createImpactEngine();
export const agentActionResolver = createActionResolver();
export const agentNpcDecisionGuard = createNpcDecisionGuard();
export const agentNpcAutonomyPlanner = createNpcAutonomyPlanner();
export const agentNpcPlanReassessment = createNpcPlanReassessment({ autonomyPlanner: agentNpcAutonomyPlanner, onRequest: result => recordAgentAudit({ taskId: result.obstacleId, sessionId: result.sessionId, branchId: result.branchId, stateVersion: result.stateVersion, event: result.status === 'duplicate_reassessment' ? 'npc_plan_reassessment_duplicate' : result.status === 'needs_redecision' ? 'npc_plan_reassessment_requested' : result.status === 'cleared' ? 'npc_plan_reassessment_cleared' : 'npc_plan_reassessment_blocked', outcome: result.reason ?? result.status }) });
export const agentNpcConflictCoordinator = createNpcConflictCoordinator();
export const agentWorldSimulator = createWorldSimulator();
export const agentSandboxMode = createSandboxMode();
export const agentSandboxNodes = createSandboxNodes();
export const agentSandboxGoals = createSandboxGoals();
export const agentSandboxLeads = createSandboxLeads();
export const agentSandboxEngine = createSandboxEngine({ nodes: agentSandboxNodes, goals: agentSandboxGoals, leads: agentSandboxLeads });
export const agentNpcOutcomeBridge = createNpcOutcomeBridge({ actionResolver: agentActionResolver, worldSimulator: agentWorldSimulator });
export const agentUiState = createUiState();
export const agentNarrativeGuard = createNarrativeGuard();
export const agentStateStore = createStateStore();
export const agentNpcCommitGate = createNpcCommitGate({ autonomyPlanner: agentNpcAutonomyPlanner, stateStore: agentStateStore });
export const agentCommitRecovery = createCommitRecovery({ stateStore: agentStateStore });
export const agentHistoryRestore = createHistoryRestore({ stateStore: agentStateStore, commitRecovery: agentCommitRecovery });
export const agentRequestClassifier = createRequestClassifier();
export const agentModuleRegistration = registerAgentModules(agentModuleRunner, { facts: agentFactsLibrary, actions: agentActionResolver, world: agentWorldSimulator, sandbox: agentSandboxEngine });
function getEnabledModuleIds() {
    const settings = currentSettings();
    const enabled = new Set();
    if (settings.enableFactsLibrary) enabled.add('facts-query');
    if (settings.enableActionResolution) enabled.add('action-resolve');
    if (settings.enableWorldProgress) enabled.add('world-advance');
    if (settings.enableSandboxMode) enabled.add('sandbox-advance');
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
registerDefaultContracts(agentDataContracts);
export const agentLlmClient = createLlmClient({ getSettings: () => currentSettings(), getContext: getHostContext });
export const agentMessageAdapter = createMessageAdapter({ getContext: getHostContext });
export const agentStatePersistence = createStatePersistence({ getContext: getHostContext });
export const agentPromptInjection = createPromptInjection({ getContext: getHostContext });
/** 世界事件系统：台账（时钟/基础信息/双栏事件）+ 独立的注入通道（key 与原著设定分开，互不清空）。 */
export const agentWorldRuntime = createWorldRuntime();
export const agentWorldPromptInjection = createPromptInjection({ getContext: getHostContext, key: 'doupo_world' });
/** World-book index (uid -> category/name/volumes/content) and the model-side selector that names uids. */
export const agentFactsIndex = createFactsIndex();
export const agentFactsSelector = createFactsSelector({
    index: agentFactsIndex,
    complete: args => agentLlmClient.complete(args),
    // 设置页里改的选条规则即时生效；留空则用内置默认。
    getRules: () => currentSettings().prompt?.select || SELECT_RULES,
    getLookupRules: () => currentSettings().prompt?.lookup || LOOKUP_RULES,
});
export const agentTurnStages = createTurnStages({
    runner: agentModuleRunner,
    actions: agentActionResolver,
    world: agentWorldSimulator,
    compose: args => agentLlmClient.compose(args),
    settings: agentSettingSupply,
    select: args => agentLlmClient.selectSettings(args),
    catalogIndex: agentFactsIndex,
    catalogSelector: agentFactsSelector,
    getSettingBudget: () => {
        const setting = currentSettings().setting ?? {};
        if (setting.enabled === false) return null;
        return {
            maxCandidates: Number.isInteger(setting.maxCandidates) && setting.maxCandidates > 0 ? setting.maxCandidates : 40,
            maxItems: Number.isInteger(setting.maxItems) && setting.maxItems > 0 ? setting.maxItems : 8,
            injectionBudget: Number.isInteger(setting.injectionBudget) && setting.injectionBudget > 0 ? setting.injectionBudget : 0,
        };
    },
    getProgress: () => {
        const settings = currentSettings();
        // 面板填了就是手动锁定，自动化不覆盖；留空才走自动判定。
        const panelValue = settings.setting?.progress;
        const panel = Number.isInteger(panelValue) && panelValue > 0 ? panelValue : null;
        if (panel !== null) return panel;
        const state = (() => { try { return agentStateStore.read(currentAgentScope()).state ?? {}; } catch { return {}; } })();
        const fromState = Number.isInteger(state.currentVolume) && state.currentVolume > 0 ? state.currentVolume : null;
        if (fromState !== null) return fromState;
        const auto = settings.facts?.currentVolume;
        return Number.isInteger(auto) && auto > 0 ? auto : null;
    },
    onVolumeInferred: (volume, source) => {
        if (!Number.isInteger(volume) || volume < 1 || volume > 21) return;
        const result = hostStorage.updateSettings({ facts: { currentVolume: volume, currentVolumeSource: source ?? 'auto' } });
        if (result.status !== 'ready') return;
        Promise.resolve(hostStorage.saveSettings()).catch(() => {});
        refreshFactsStatusCard();
    },
    getRecentTexts: () => {
        const chat = getHostContext()?.chat ?? [];
        const recent = [];
        for (let index = chat.length - 1; index >= 0 && recent.length < 2; index -= 1) {
            const message = chat[index];
            if (!message || message.is_user === true || message.is_system === true) continue;
            if (typeof message.mes === 'string' && message.mes.trim()) recent.unshift(message.mes);
        }
        return recent;
    },
    getState: ctx => agentStateStore.read({ sessionId: ctx.sessionId, branchId: ctx.branchId }).state ?? {},
    onSettingDrift: ({ taskId, sessionId, branchId, stateVersion, issues }) => recordAgentAudit({
        taskId,
        sessionId,
        branchId,
        stateVersion,
        event: 'setting_drift',
        outcome: 'unapproved_setting_use',
        detail: issues.slice(0, 8).map(item => `${item.id}:${item.key}`).join(' '),
    }),
    getSourceIds: () => {
        const facts = currentSettings().facts ?? {};
        return Array.isArray(facts.sourceIds) ? facts.sourceIds : [];
    },
    getLimits: () => {
        const facts = currentSettings().facts ?? {};
        return { maxEntries: Number.isInteger(facts.maxEntries) && facts.maxEntries > 0 ? facts.maxEntries : 8, includeUnverified: facts.includeUnverified === true };
    },
    getWriter: targetId => agentDataContracts.get(targetId)?.writer ?? 'actions',
});
export const agentTurnPipeline = createTurnPipeline({ stages: agentTurnStages, qualityGate: agentQualityGate, narrativeGuard: agentNarrativeGuard, commitRecovery: agentCommitRecovery, onProgress: publishPipelineProgress, audit: agentAuditLog });
export const agentOrchestrator = createOrchestrator({
    pipeline: agentTurnPipeline,
    router: agentRequestRouter,
    coordinator: agentCoordinator,
    stateStore: agentStateStore,
    contracts: agentDataContracts,
    settings: () => currentSettings(),
    interpret: args => agentLlmClient.interpret(args),
    deliver: args => agentMessageAdapter.deliver(args),
    placeholder: args => agentMessageAdapter.deliver({ text: '……', placeholder: true, ...args }),
    discardMessage: args => agentMessageAdapter.discard(args),
    persistence: agentStatePersistence,
    onEvent: event => {
        if (event?.type === 'turn_completed' || event?.type === 'turn_failed' || event?.type === 'turn_uncertain') refreshControlDashboard();
    },
});
function injectionSettings() {
    const injection = currentSettings().injection ?? {};
    return {
        enabled: injection.enabled !== false,
        depth: Number.isInteger(injection.depth) ? injection.depth : 0,
        maxChars: Number.isInteger(injection.maxChars) && injection.maxChars > 0 ? injection.maxChars : 0,
    };
}

function worldEventSettings() {
    const world = currentSettings().world ?? {};
    return {
        enabled: world.eventEnabled !== false,
        inject: world.eventInject !== false,
        budget: Number.isInteger(world.eventBudget) && world.eventBudget > 0 ? Math.min(world.eventBudget, 4000) : 900,
    };
}

/** 世界状态跟着聊天走：换聊天读那一份，读不到就按开局初始化。 */
function restoreWorldFromChat() {
    const record = hostStorage?.worldState?.();
    if (record?.status === 'ready' && record.value) return agentWorldRuntime.restore(record.value);
    return agentWorldRuntime.reset();
}

function persistWorld() {
    const result = hostStorage?.saveWorldState?.(agentWorldRuntime.snapshot());
    if (result && typeof result.catch === 'function') result.catch(() => { /* 保存失败由下次操作重试 */ });
    return result;
}

/** 生成前把世界现状和指令规则写进扩展提示词；与原著设定通道相互独立。 */
function writeWorldInjectionForPrompt() {
    const world = currentSettings().world ?? {};
    const settings = worldEventSettings();
    if (!settings.enabled || !settings.inject) { agentWorldPromptInjection.clear(); return { status: 'disabled' }; }
    const probe = agentWorldPromptInjection.inspect();
    if (probe.status !== 'ready') return probe;
    const guide = typeof world.eventGuide === 'string' && world.eventGuide.trim() ? world.eventGuide.trim() : OPS_GUIDE;
    const body = buildWorldInjection(agentWorldRuntime.snapshot(), { maxChars: settings.budget });
    // 抬头+现状受预算约束，指令指南固定追加不截断（约 600 字，另留余量）。
    return agentWorldPromptInjection.write({ text: `${WORLD_HEADER}\n${body}\n\n${guide}` }, { depth: injectionSettings().depth, maxChars: settings.budget + 1200 });
}

/** 上一轮卷外搜索的现场，只给“运行状态”卡看，不参与逻辑。 */
let lastLookupInfo = null;
/** 最近一次同步时被跳过的“酒馆原生条目”数量，只用于状态展示。 */
let lastWorldbookNative = null;

/**
 * Recall -> model selection -> budget cut, then write into the prompt container.
 * Runs before the main generation, so the reply itself stays with SillyTavern's
 * own generation pipeline and the player's preset and world book still apply.
 */
async function prepareInjectionForPrompt({ chat } = {}) {
    // 世界通道先走：它不依赖原著设定的开关与预算，两路互不阻塞。
    try { writeWorldInjectionForPrompt(); } catch { /* 世界注入失败不影响原著设定注入 */ }
    const settings = injectionSettings();
    if (!settings.enabled) { agentPromptInjection.clear(); return { status: 'disabled' }; }
    const probe = agentPromptInjection.inspect();
    if (probe.status !== 'ready') return probe;
    const messages = Array.isArray(chat) ? chat : [];
    let input = '';
    const recent = [];
    for (let index = messages.length - 1; index >= 0 && recent.length < 2; index -= 1) {
        const message = messages[index];
        if (!message || typeof message.mes !== 'string' || !message.mes.trim()) continue;
        if (message.is_user === true) { if (!input) input = message.mes.trim(); continue; }
        if (message.is_system === true) continue;
        recent.unshift(message.mes);
    }
    if (!input) { agentPromptInjection.clear(); return { status: 'no_input' }; }
    const resolved = await agentTurnStages.resolveInjection({ input, recentTexts: recent, ...currentAgentScope() });
    lastLookupInfo = resolved?.lookup ? { ...resolved.lookup, secondCall: resolved.secondCall === true } : null;
    if (!resolved?.text) { agentPromptInjection.clear(); return { status: resolved?.status ?? 'empty' }; }
    return agentPromptInjection.write(resolved, { depth: settings.depth, maxChars: settings.maxChars });
}

/** SillyTavern calls this global (declared in manifest.json) before every real generation. */
globalThis.doupoFactsInterceptor = async function doupoFactsInterceptor(chat, contextSize, abort, type) {
    if (type === 'quiet') return;
    try {
        await prepareInjectionForPrompt({ chat, contextSize });
    } catch (error) {
        try { console.warn(`[${EXTENSION_ID}] 原著设定注入失败`, error); } catch { /* 记录失败不影响生成 */ }
    }
};

/**
 * 生成结束：从最新一条 AI 楼层里取 world 指令块，交给台账核验执行。
 * 同一楼重 roll 时台账会先撤销上一版指令再落新账；指令块从正文剥掉，玩家只看剧情。
 */
function applyWorldOpsFromLatestReply() {
    const context = getHostContext();
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    let index = -1;
    for (let cursor = chat.length - 1; cursor >= 0; cursor -= 1) {
        const message = chat[cursor];
        if (!message || typeof message.mes !== 'string' || !message.mes.trim()) continue;
        if (message.is_user === true || message.is_system === true) continue;
        index = cursor;
        break;
    }
    if (index < 0) return { status: 'no_reply' };
    if (worldEventSettings().enabled === false) return { status: 'disabled' };
    const found = extractOpsBlock(chat[index].mes);
    if (!found) return { status: 'no_ops' };
    const parsed = parseOps(found.raw);
    const result = agentWorldRuntime.apply(parsed.ops, { source: 'llm', floor: index });
    persistWorld();
    const cleaned = stripOpsBlock(chat[index].mes);
    if (cleaned !== chat[index].mes) {
        chat[index].mes = cleaned;
        try {
            if (typeof context.updateMessageBlock === 'function') context.updateMessageBlock(index, chat[index]);
            else if (typeof context.renderMessage === 'function') context.renderMessage(index);
        } catch { /* 渲染失败时文本已更新，下次刷新生效 */ }
        try { context.saveChat?.(); } catch { /* 保存失败由宿主自动保存兜底 */ }
    }
    refreshWorldPage();
    refreshWorldOverlay();
    return { status: result.status, applied: result.applied.length, rejected: result.rejected.length, floor: index + 1 };
}

/**
 * 游戏内常驻的世界状态浮层：顶栏「世界」按钮点开，不进设置就能看时钟、
 * 现状、两栏事件和最近流水；了结/置顶在这里一键可做，复杂操作跳设置页。
 */
function createWorldOverlay() {
    if (typeof document === 'undefined' || !document.body || document.getElementById(WORLD_PANEL_ID)) return;
    const overlay = makeElement('section', 'dai-settings-panel dai-world-overlay');
    overlay.id = WORLD_PANEL_ID;
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', '世界状态');
    overlay.innerHTML = `
        <div class="dai-settings-backdrop" data-world-overlay-close></div>
        <div class="dai-world-overlay-card">
            <header class="dai-world-overlay-head"><div><small>世界状态</small><strong data-world-overlay-time>还没有载入世界。</strong></div><button type="button" class="dai-icon-button" data-world-overlay-close aria-label="关闭">×</button></header>
            <p class="dai-world-overlay-info" data-world-overlay-info role="status"></p>
            <h4>主角身边</h4><div class="dai-world-events" data-world-overlay-near></div>
            <h4>世界大事</h4><div class="dai-world-events" data-world-overlay-world></div>
            <footer class="dai-world-overlay-foot"><small data-world-overlay-journal>还没有指令流水。</small><button type="button" class="dai-secondary-button" data-world-overlay-settings>世界设置</button></footer>
        </div>`;
    document.body.append(overlay);
    overlay.addEventListener('click', event => {
        if (event.target.closest?.('[data-world-overlay-close]')) {
            overlay.hidden = true;
            return;
        }
        const resolve = event.target.closest?.('[data-world-resolve]');
        if (resolve) return void applyWorldOps([{ op: 'resolveEvent', id: resolve.dataset.worldResolve }]);
        const pin = event.target.closest?.('[data-world-pin]');
        if (pin) return void applyWorldOps([{ op: 'pinEvent', id: pin.dataset.worldPin, pinned: pin.dataset.worldPinned !== 'true' }]);
        if (event.target.closest?.('[data-world-overlay-settings]')) {
            overlay.hidden = true;
            openSettingsPanel();
            const panel = document.getElementById(SETTINGS_PANEL_ID);
            if (panel) {
                const page = panel.querySelector('[data-settings-page="world"]');
                if (page) page.click();
            }
        }
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !overlay.hidden) overlay.hidden = true;
    });
}

function toggleWorldOverlay(force) {
    const overlay = typeof document !== 'undefined' ? document.getElementById(WORLD_PANEL_ID) : null;
    if (!overlay) return;
    const show = typeof force === 'boolean' ? force : overlay.hidden;
    overlay.hidden = !show;
    if (show) refreshWorldOverlay();
}

/** 浮层只在可见时重绘：时钟、现状、双栏事件、最近一条流水。 */
function refreshWorldOverlay() {
    const overlay = typeof document !== 'undefined' ? document.getElementById(WORLD_PANEL_ID) : null;
    if (!overlay || overlay.hidden) return;
    const status = agentWorldRuntime.status();
    const snapshot = agentWorldRuntime.snapshot();
    const time = overlay.querySelector('[data-world-overlay-time]');
    if (time) time.textContent = `${agentWorldRuntime.formatClock()}${status.clock.label ? ` · ${status.clock.label}` : ''}`;
    const info = overlay.querySelector('[data-world-overlay-info]');
    if (info) {
        const parts = [];
        for (const [field, label] of [['era', '时期'], ['location', '所在地'], ['weather', '天气']]) {
            if (status.info[field]) parts.push(`${label}：${status.info[field]}`);
        }
        info.textContent = parts.length ? parts.join(' · ') : '还没有登记时期、所在地或天气。';
    }
    renderWorldEventList(overlay.querySelector('[data-world-overlay-near]'), snapshot.nearEvents);
    renderWorldEventList(overlay.querySelector('[data-world-overlay-world]'), snapshot.worldEvents, { emptyNote: '暂无进行中的世界大事。' });
    const journal = overlay.querySelector('[data-world-overlay-journal]');
    if (journal) {
        const last = snapshot.log.at(-1);
        journal.textContent = last ? `${last.source === 'llm' ? '模型' : last.source === 'panel' ? '面板' : last.source}：${last.summaries.join('；') || '（无变化）'}` : '还没有指令流水。';
    }
}

export let agentHistoryEvents;

function publishPipelineProgress(progress) {
    const lifecycle = agentTurnPipeline.inspect(progress.taskId);
    if (lifecycle.status === 'missing_task') {
        if (!agentCoordinator.get(progress.taskId)) agentCoordinator.begin({ taskId: progress.taskId, sessionId: progress.sessionId, branchId: progress.branchId, stateVersion: progress.stateVersion });
    }
    const status = progress.status === 'awaiting_message_evidence' ? 'save_uncertain' : progress.status === 'committed' ? 'completed_saved' : progress.status === 'failed' || progress.status === 'cancelled' ? 'failed_unapplied' : 'processing';
    const outcome = agentCoordinator.update(progress.taskId, status, { sessionId: progress.sessionId, branchId: progress.branchId, stateVersion: progress.stateVersion, message: progress.message, applied: progress.status === 'committed' ? '状态已提交到当前会话' : '尚未确认生效', nextStep: status === 'save_uncertain' ? '先核对酒馆里的对应消息，再决定是否重新运行一轮。' : undefined });
    if (!outcome.accepted && !['task_terminal', 'not_active_task'].includes(outcome.reason)) recordAgentAudit({ taskId: progress.taskId, sessionId: progress.sessionId, branchId: progress.branchId, stateVersion: progress.stateVersion, event: 'stage_failed', stage: progress.currentStage ?? null, outcome: `coordinator_${outcome.reason}` });
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
    worldRuntime: agentWorldRuntime,
    worldInjection: writeWorldInjectionForPrompt,
    worldApplyFromLatestReply: () => applyWorldOpsFromLatestReply(),
    worldRestoreFromChat: () => restoreWorldFromChat(),
    ui: agentUiState,
    narrative: agentNarrativeGuard,
    state: agentStateStore,
    commits: agentCommitRecovery,
    historyRestore: agentHistoryRestore,
    requests: agentRequestClassifier,
    router: agentRequestRouter,
    capabilities: Object.freeze({ probe: options => probeAgentCapabilities(options), get: () => getAgentCapabilities() }),
    pipeline: agentTurnPipeline,
    stages: agentTurnStages,
    orchestrator: agentOrchestrator,
    llm: agentLlmClient,
    messages: agentMessageAdapter,
    persistence: agentStatePersistence,
    runTurn: options => agentOrchestrator.runTurn(options),
    inspectTurnState: options => agentOrchestrator.inspect(options),
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
        injectionNote: agentPromptInjection.inspect().note,
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

const SANDBOX_MODE_MESSAGES = Object.freeze({
    unavailable: '当前还没有会话或分支标识，模式记录要进入对话后才能建立；设置改动已保存，新开局按它执行。',
    adopted: '本局已按当前设置建立口径记录。',
    unchanged: '本局口径与设置一致。',
    fixed: '本局没有允许中途切换口径，设置改动会在新开局生效。',
    deferred: '设置已保存；本局仍在原口径，切换需要在本局内确认后才生效。',
    failed: '模式记录写入失败，设置已保存，但本局口径未改变。',
});

function setSandboxStatus(text) {
    const element = document.querySelector(`#${SETTINGS_PANEL_ID} [data-sandbox-status]`);
    if (element) element.textContent = text;
}

/**
 * 把设置面板里的沙盒选项同步到正式模式记录。
 * 这里只做“建立/核对”和“指出需要确认”，不代替玩家确认切换：
 * 中途改口径必须绑定当回合的任务与状态版本，属于本局内的确认动作。
 */
function syncSandboxModeFromSettings() {
    const settings = currentSettings();
    const scope = agentActiveScope;
    if (!scope?.sessionId || !scope?.branchId) {
        setSandboxStatus(SANDBOX_MODE_MESSAGES.unavailable);
        return { status: 'unavailable' };
    }
    const desired = settings.enableSandboxMode ? 'sandbox' : 'mainline';
    const record = agentSandboxMode.read({ sessionId: scope.sessionId, branchId: scope.branchId });
    if (record.status === 'ready' && record.mode !== desired) {
        setSandboxStatus(settings.sandbox.allowMidgameSwitch ? SANDBOX_MODE_MESSAGES.deferred : SANDBOX_MODE_MESSAGES.fixed);
        return { status: 'deferred' };
    }
    try {
        const result = agentSandboxMode.sync({
            sessionId: scope.sessionId,
            branchId: scope.branchId,
            enabled: settings.enableSandboxMode,
            inertia: settings.sandbox.inertia,
            canonCharactersAutonomous: settings.sandbox.canonCharactersAutonomous,
            allowMidgameSwitch: settings.sandbox.allowMidgameSwitch,
        });
        setSandboxStatus(result.status === 'adopted' ? SANDBOX_MODE_MESSAGES.adopted : SANDBOX_MODE_MESSAGES.unchanged);
        return result;
    } catch {
        setSandboxStatus(SANDBOX_MODE_MESSAGES.failed);
        return { status: 'failed' };
    }
}

/**
 * Setting entries can be declared in settings today; the worldbook adapter will
 * register straight into agentSettingSupply instead of passing through settings.
 */
export function loadSettingEntries() {
    const entries = currentSettings()?.setting?.entries;
    if (!Array.isArray(entries) || !entries.length) return { added: 0, skipped: 0, total: agentSettingSupply.size() };
    return agentSettingSupply.register(entries);
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
        if (path.startsWith('setting.')) loadSettingEntries();
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
                    <button type="button" class="dai-nav-item" data-settings-page="world"><span class="dai-nav-icon">◌</span><span><b>世界运转</b><small>时间、事件与世界现状</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="npc"><span class="dai-nav-icon">♙</span><span><b>NPC 决策</b><small>人物自主行动</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="impact"><span class="dai-nav-icon">⌁</span><span><b>世界影响</b><small>跨系统变化追踪</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="sandbox"><span class="dai-nav-icon">◈</span><span><b>沙盒模式</b><small>自由探索与主线口径</small></span></button>
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
                        <div class="dai-settings-card dai-turn-card"><div class="dai-card-heading"><b>结算这一轮</b><small>默认正文由酒馆主生成，原著设定在生成前自动注入；这里的手动结算只在打开 ui.legacyTurn 后可用。</small></div><p class="dai-state-strip" data-agent-state>还没有载入状态。</p><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-agent-run>结算这一轮</button><button type="button" class="dai-run-button is-secondary" data-agent-retry hidden>重试上一轮</button></div><p class="dai-turn-result" data-agent-run-result role="status">还没有运行。</p><div class="dai-version-list" data-agent-versions></div></div>
                        <p class="dai-dashboard-note">显示当前会话与分支的任务记录。每次运行都会把结果写进会话状态，刷新页面后仍在。</p>
                        <div class="dai-section-heading"><h3>简单设置</h3></div>
                        <div class="dai-overview-grid"><label class="dai-overview-switch"><span><b>启用 Agent 总控</b><small>关闭后不会运行回合，也不会写入状态。</small></span><input type="checkbox" data-setting="enabled"></label><label class="dai-overview-switch"><span><b>显示运行反馈</b><small>在右下角显示任务状态与失败原因。</small></span><input type="checkbox" data-setting="showStatusPanel"></label></div>
                        <fieldset class="dai-theme-picker"><legend>界面颜色</legend><label class="dai-theme-option"><input type="radio" name="dai-theme" value="white" data-setting="ui.theme"><span class="dai-theme-swatch" data-swatch="white" aria-hidden="true"></span><b>白色</b></label><label class="dai-theme-option"><input type="radio" name="dai-theme" value="black" data-setting="ui.theme"><span class="dai-theme-swatch" data-swatch="black" aria-hidden="true"></span><b>黑色</b></label><label class="dai-theme-option"><input type="radio" name="dai-theme" value="beige" data-setting="ui.theme"><span class="dai-theme-swatch" data-swatch="beige" aria-hidden="true"></span><b>米色</b></label></fieldset>
                        <p class="dai-dashboard-note">只改变 Agent 界面，不改变酒馆整体配色。</p>
                    </section>
                    <section class="dai-settings-page" data-settings-section="llm" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 01</span><h3>模型与连接</h3><p>决定 Agent 从哪里发起模型请求，以及使用什么输出参数。</p></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>请求来源</b><small>优先复用酒馆当前连接，避免重复管理密钥。</small></div><label class="dai-setting-row dai-setting-toggle"><span><b>使用酒馆当前连接</b><small>由 SillyTavern 负责实际模型请求。</small></span><input type="checkbox" data-setting="llm.useSillyTavernConnection"></label><label class="dai-setting-row"><span><b>连接方式</b></span><select data-setting="llm.provider"><option value="openai-compatible">OpenAI 兼容接口</option><option value="anthropic">Anthropic 兼容接口</option><option value="custom">自定义</option></select></label><label class="dai-setting-row"><span><b>接口地址</b><small>独立接口的 Base URL；使用酒馆连接时可留空。</small></span><input type="url" data-setting="llm.baseUrl" placeholder="https://api.example.com/v1"></label><label class="dai-setting-row"><span><b>API Key</b><small>只保存到扩展设置，不写入聊天消息。</small></span><input type="password" data-setting="llm.apiKey" autocomplete="off" placeholder="留空表示不使用独立密钥"></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>生成参数</b><small>留空模型名称时沿用酒馆当前模型。</small></div><label class="dai-setting-row"><span><b>模型名称</b></span><input type="text" data-setting="llm.model" placeholder="沿用酒馆当前模型"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>Temperature</b><small>0 更稳定，2 更发散。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="llm.temperature"></label><label class="dai-setting-row"><span><b>最大输出 Token</b></span><input type="number" min="128" max="32768" step="128" data-setting="llm.maxTokens"></label></div><label class="dai-setting-row"><span><b>请求等待上限（毫秒）</b></span><input type="number" min="1000" max="600000" step="1000" data-setting="llm.timeoutMs"></label></div>
                    </section>
                    <section class="dai-settings-page" data-settings-section="facts" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 02</span><h3>原著设定</h3><p>把世界书条目变成“按需注入”的设定库：建索引、按卷出目录、模型点名、按预算注入正文提示词。</p></div><div class="dai-settings-card"><div class="dai-card-heading"><b>运行状态</b><small>打开这一页时读取，生成结束后也会刷新。</small></div><ul class="dai-status-list" data-facts-status><li><b>状态</b><span>正在读取……</span></li></ul></div><div class="dai-settings-card"><div class="dai-card-heading"><b>模型</b><small>这一页只放最常改的四项；接口地址和密钥在“核心能力 / 01”。</small></div><label class="dai-setting-row dai-setting-toggle"><span><b>使用酒馆当前连接</b><small>关掉才走下面的独立接口。</small></span><input type="checkbox" data-setting="llm.useSillyTavernConnection"></label><label class="dai-setting-row"><span><b>模型名称</b><small>留空沿用酒馆当前模型。</small></span><input type="text" data-setting="llm.model" placeholder="沿用酒馆当前模型"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>Temperature</b></span><input type="number" min="0" max="2" step="0.1" data-setting="llm.temperature"></label><label class="dai-setting-row"><span><b>最大输出 Token</b></span><input type="number" min="128" max="32768" step="128" data-setting="llm.maxTokens"></label></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>检索库状态</b><small>只读世界书，不改原文件；改完世界书后重新导入一次即可。</small></div><p class="dai-turn-result" data-worldbook-stats role="status">还没有导入。</p><label class="dai-setting-row"><span><b>世界书名称</b><small>填世界书面板里的名字；点“扫描”可以自动列出可选名称。</small></span><input type="text" list="dai-worldbook-options" data-setting="setting.worldbook" placeholder="例如 斗破世界书"></label><datalist id="dai-worldbook-options"></datalist><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-agent-worldbook-scan>扫描可选世界书</button><button type="button" class="dai-secondary-button" data-agent-worldbook-import>从世界书导入</button></div><p class="dai-turn-result" data-agent-worldbook-status role="status">还没有导入。</p></div><div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">◈</span><span><b>启用原著设定注入</b><small>每轮先按本轮输入召回候选，再由模型挑出真正要用的设定，按预算注入正文提示词。</small></span><input type="checkbox" data-setting="setting.enabled"></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>当前剧情卷</b><small>填了就是手动锁定；留空交给自动判定（模型估计 + 故事线标题命中，一次最多前进一卷）。</small></span><input type="number" min="1" max="21" step="1" data-setting="setting.progress"></label><label class="dai-setting-row"><span><b>单次注入字数</b><small>0 = 不限制，选中几条就注入几条全文。</small></span><input type="number" min="0" max="4000" step="100" data-setting="setting.injectionBudget"></label><label class="dai-setting-row"><span><b>单次最多条目</b></span><input type="number" min="1" max="24" step="1" data-setting="setting.maxItems"></label></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>注入通道</b><small data-injection-status role="status">打开这一页时检测。</small></div><div class="dai-setting-grid"><label class="dai-setting-row dai-setting-toggle"><span><b>启用注入</b><small>关闭后不往提示词里写任何原著内容，正文照常生成。</small></span><input type="checkbox" data-setting="injection.enabled"></label><label class="dai-setting-row"><span><b>插入深度</b><small>从最新一楼往回数；0 表示紧贴末尾、离生成最近。</small></span><input type="number" min="0" max="99" step="1" data-setting="injection.depth"></label><label class="dai-setting-row"><span><b>最大字数</b><small>0 = 不截断；填了才在写入时截断。</small></span><input type="number" min="0" max="8000" step="100" data-setting="injection.maxChars"></label></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>旧版资料查询（已退役）</b><small>新链路不再调用它；保留这几个开关只为对照旧行为，正常使用保持关闭。</small></div><div class="dai-feature-toggle"><span class="dai-feature-icon">▤</span><span><b>启用旧资料查询</b><small>关闭后不会调用 facts-query 模块。</small></span><input type="checkbox" data-setting="enableFactsLibrary"></div><label class="dai-setting-row"><span><b>资料来源</b><small>旧链路只会读取已经登记的项目资料。</small></span><select data-setting="facts.sourceMode"><option value="registered">已登记资料</option><option value="chat">当前聊天上下文</option><option value="both">资料 + 当前聊天</option></select></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>单次最多条目</b></span><input type="number" min="1" max="100" step="1" data-setting="facts.maxEntries"></label><label class="dai-setting-row dai-setting-toggle"><span><b>允许未核验资料</b><small>关闭时只使用已确认事实。</small></span><input type="checkbox" data-setting="facts.includeUnverified"></label></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>选条提示词</b><small>模型判断“本轮要用哪些原著条目”时收到的 system 指令。留空用内置默认；MAX_PICKS 会换成每条上限。</small></div><label class="dai-setting-row"><span><b>规则正文</b><small>改完下一轮生效，不用重启。</small></span><textarea data-setting="prompt.select" rows="9" spellcheck="false" placeholder="留空 = 内置默认规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-prompt-default>填入默认规则</button><small>默认规则含“只选必须用到、不许编 uid、只输出 JSON”。</small></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>卷外点选提示词</b><small>模型在目录里找不到、报出名字后，脚本搜到候选再问它一次时用的 system 指令。留空用内置默认。</small></div><label class="dai-setting-row"><span><b>规则正文</b><small>只影响“卷外二次点选”，改完下一轮生效。</small></span><textarea data-setting="prompt.lookup" rows="7" spellcheck="false" placeholder="留空 = 内置默认规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-prompt-default="lookup">填入默认规则</button><small>默认规则含“只从候选里挑、后续卷默认不选”。</small></div></div></section>
                    <section class="dai-settings-page" data-settings-section="action" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 03</span><h3>行动结算</h3><p>把玩家行动拆成条件、结果和资源变化候选，再决定是否提交。</p></div><div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">➜</span><span><b>启用行动结算</b><small>关闭后不会调用 action-resolve 模块。</small></span><input type="checkbox" data-setting="enableActionResolution"></div><label class="dai-setting-row dai-setting-toggle"><span><b>提交前要求确认</b><small>只生成候选，不自动写入状态。</small></span><input type="checkbox" data-setting="action.requireConfirmation"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>最多候选结果</b></span><input type="number" min="1" max="20" step="1" data-setting="action.maxCandidates"></label><label class="dai-setting-row dai-setting-toggle"><span><b>显示资源变化预览</b><small>在确认前展示影响范围。</small></span><input type="checkbox" data-setting="action.showCostPreview"></label></div></div></section>
                    <section class="dai-settings-page" data-settings-section="world" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 04</span><h3>世界运转</h3><p>世界时间和事件由模型在正文末尾下指令、脚本核验后记账；这一页是台账展示和手动控制。</p></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>世界时间与现状</b><small>随每轮生成自动更新；也可在这里手动调整。</small></div><p class="dai-state-strip" data-world-time>还没有载入世界。</p><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-world-advance="1">推进 1 天</button><button type="button" class="dai-secondary-button" data-world-advance="7">推进 7 天</button><input type="number" min="1" max="365" step="1" data-world-days placeholder="天数" aria-label="自定义推进天数"><button type="button" class="dai-secondary-button" data-world-advance-custom>推进</button></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>改为第几天</b><small>直接设定时钟，用于修正跳变。</small></span><input type="number" min="1" max="99999" step="1" data-world-setday placeholder="如 30"></label><button type="button" class="dai-secondary-button" data-world-setday-apply>设定</button></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>主角身边的事件</b><small>模型会看到这些并把它们织进剧情；了结后从注入里退场。</small></div><div class="dai-world-events" data-world-events-near></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>世界大事</b><small>大陆层面的事件；重大的会标星，置顶的不参与上限清理。</small></div><div class="dai-world-events" data-world-events-world></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>手动登记事件</b><small>模型漏记时在这里补一笔，格式与模型指令一致。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>范围</b></span><select data-world-add-scope><option value="near">主角身边</option><option value="world">世界大事</option></select></label><label class="dai-setting-row"><span><b>分量</b></span><select data-world-add-weight><option value="minor">普通</option><option value="major">重大</option></select></label></div><label class="dai-setting-row"><span><b>事件内容</b><small>一句话说清发生了什么，不拘题材。</small></span><input type="text" data-world-add-text placeholder="例：城东连着三家铺子夜里失窃"></label><label class="dai-setting-row"><span><b>依据</b><small>它从哪来：哪楼、谁、什么事引出的。</small></span><input type="text" data-world-add-basis placeholder="例：上一楼酒馆闲谈提到的失窃传闻"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>有效期（天）</b><small>留空长期有效；到期自动了结。</small></span><input type="number" min="1" max="90" step="1" data-world-add-days placeholder="如 5"></label></div><button type="button" class="dai-secondary-button" data-world-add>登记事件</button></div>
                        <div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">◌</span><span><b>启用世界事件系统</b><small>关闭后不再读模型指令、不再注入世界现状。</small></span><input type="checkbox" data-setting="world.eventEnabled"></div><label class="dai-setting-row dai-setting-toggle"><span><b>注入世界现状</b><small>生成前把时钟、现状和进行中的事件写进提示词。</small></span><input type="checkbox" data-setting="world.eventInject"></label><label class="dai-setting-row"><span><b>现状注入字数上限</b><small>超预算先丢事件，保住时钟；0 为默认 900。</small></span><input type="number" min="0" max="4000" step="100" data-setting="world.eventBudget"></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>指令指南</b><small>告诉模型何时下指令、怎么写事件的 system 规则。留空用内置默认；改完下一轮生效。</small></div><label class="dai-setting-row"><span><b>规则正文</b><small>事件取材规则、时限要求都写在这里，可按你的玩法改写。</small></span><textarea data-setting="world.eventGuide" rows="9" spellcheck="false" placeholder="留空 = 内置默认规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-world-guide-default>填入默认规则</button><small>默认规则含“事件要有依据、不照搬原著、时限必带 days”。</small></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>世界指令流水</b><small>最近几批指令的执行结果；重 roll 一楼会先撤销它上一版指令。</small></div><div class="dai-world-journal" data-world-journal></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>旧链路（手动结算）</b><small>旧版"面板里点结算"链路的设置，与新事件系统互不干扰。</small></div><div class="dai-feature-toggle"><span class="dai-feature-icon">◌</span><span><b>启用旧链路世界推进</b><small>关闭后不会调用 world-advance 模块。</small></span><input type="checkbox" data-setting="enableWorldProgress"></div><label class="dai-setting-row dai-setting-toggle"><span><b>允许自动推进</b><small>收到时间推进请求时才会生效。</small></span><input type="checkbox" data-setting="world.autoAdvance"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>默认推进分钟数</b></span><input type="number" min="1" max="1440" step="1" data-setting="world.tickMinutes"></label><label class="dai-setting-row dai-setting-toggle"><span><b>保留未确认候选</b><small>不把推测直接当成世界事实。</small></span><input type="checkbox" data-setting="world.preserveUnconfirmed"></label></div></div></section>
                    <section class="dai-settings-page" data-settings-section="npc" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 05</span><h3>NPC 决策</h3><p>控制相关人物的有限决策候选，不替 NPC 直接越过确认边界。</p></div><div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">♙</span><span><b>启用 NPC 自主决策</b><small>控制人物候选计划是否参与调度。</small></span><input type="checkbox" data-setting="enableNpcAutonomy"></div><label class="dai-setting-row dai-setting-toggle"><span><b>提交前要求确认</b><small>候选计划必须经过确认才可继续。</small></span><input type="checkbox" data-setting="npc.requireConfirmation"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>最多候选计划</b></span><input type="number" min="1" max="20" step="1" data-setting="npc.maxCandidates"></label><label class="dai-setting-row dai-setting-toggle"><span><b>允许人物冲突候选</b><small>保留冲突供上层处理。</small></span><input type="checkbox" data-setting="npc.allowConflicts"></label></div></div></section>
                    <section class="dai-settings-page" data-settings-section="impact" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 06</span><h3>世界影响</h3><p>追踪已经确认的行动如何影响资源、人物和后续世界条件。</p></div><div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">⌁</span><span><b>启用影响追踪</b><small>记录已确认行动的跨系统影响链。</small></span><input type="checkbox" data-setting="enablePlayerImpact"></div><label class="dai-setting-row dai-setting-toggle"><span><b>追踪资源变化</b><small>展示消耗、获得和变化方向。</small></span><input type="checkbox" data-setting="impact.trackResources"></label><label class="dai-setting-row dai-setting-toggle"><span><b>显示影响解释</b><small>在运行反馈中说明变化来源。</small></span><input type="checkbox" data-setting="impact.showExplanation"></label><label class="dai-setting-row"><span><b>最多影响链深度</b><small>防止一次行动展开过长的推导链。</small></span><input type="number" min="1" max="10" step="1" data-setting="impact.maxChainDepth"></label></div></section>
                    <section class="dai-settings-page" data-settings-section="sandbox" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 07</span><h3>沙盒模式</h3><p>开启后不再按原著主线排期，改为先查前提、再看惯性；世界仍在运转，只是不替玩家安排剧情。</p><p role="status" data-sandbox-status>改动会先保存；本局真正切换口径需要在本局内确认。</p></div>
                        <div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">◈</span><span><b>启用沙盒模式</b><small>关闭时按主线口径：原著节点到点发生，玩家只影响过程。</small></span><input type="checkbox" data-setting="enableSandboxMode"></div><label class="dai-setting-row"><span><b>世界惯性</b><small>决定原著节点在沙盒里多积极地自行发生。强＝窗口一开始就发生；中＝到窗口结束才发生；弱＝不再自动发生，只留候选。</small></span><select data-setting="sandbox.inertia"><option value="strong">强 · 世界推着走</option><option value="medium">中 · 有人介入才偏离</option><option value="weak">弱 · 默认不动</option></select></label><label class="dai-setting-row dai-setting-toggle"><span><b>原著人物保留自主行动</b><small>关闭后原著人物只对玩家作出反应，不再主动推进自身轨迹。</small></span><input type="checkbox" data-setting="sandbox.canonCharactersAutonomous"></label><label class="dai-setting-row dai-setting-toggle"><span><b>允许中途切换模式</b><small>切换需要确认，而且只做重新对齐，不倒带已经发生的事实、代价和关系。</small></span><input type="checkbox" data-setting="sandbox.allowMidgameSwitch"></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>玩家目标与探索预算</b><small>沙盒没有主线给方向，目标由玩家自己定；这里只管上限。</small></div><label class="dai-setting-row dai-setting-toggle"><span><b>启用玩家自设目标</b><small>把玩家提出的目标记成状态，而不是只在正文里提一句。</small></span><input type="checkbox" data-setting="sandbox.playerGoalsEnabled"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>最多同时进行目标</b></span><input type="number" min="1" max="10" step="1" data-setting="sandbox.maxActiveGoals"></label><label class="dai-setting-row"><span><b>单回合最多新增对象</b><small>限制一回合内新冒出的线索与目标数量。</small></span><input type="number" min="0" max="8" step="1" data-setting="sandbox.maxNewObjectsPerTurn"></label></div><label class="dai-setting-row"><span><b>节点宽限天数</b><small>节点窗口结束后再等这么多游戏日，仍未发生才记为过期。</small></span><input type="number" min="0" max="60" step="1" data-setting="sandbox.nodeWindowSlackDays"></label></div>
                    </section>
                    <section class="dai-settings-page" data-settings-section="runtime" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">系统 / 08</span><h3>运行与界面</h3><p>这里放全局开关、预算保护和诊断选项。</p></div><div class="dai-settings-card"><div class="dai-card-heading"><b>运行预算</b><small>这是保护上限，不代表模型一定会消耗这些额度。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>单次最多模块数</b></span><input type="number" min="1" max="32" step="1" data-setting="budget.maxModules"></label><label class="dai-setting-row"><span><b>最多 NPC 决策数</b></span><input type="number" min="0" max="20" step="1" data-setting="budget.maxNpcDecisions"></label></div><label class="dai-setting-row"><span><b>总等待上限（毫秒）</b></span><input type="number" min="1000" max="600000" step="1000" data-setting="budget.totalTimeoutMs"></label></div><div class="dai-settings-card"><div class="dai-card-heading"><b>反馈显示</b><small>控制页面和右下角反馈的显示内容。</small></div><label class="dai-setting-row dai-setting-toggle"><span><b>显示历史状态</b></span><input type="checkbox" data-setting="status.showHistory"></label><label class="dai-setting-row dai-setting-toggle"><span><b>显示能力检测提示</b></span><input type="checkbox" data-setting="status.showCapabilityBadge"></label><label class="dai-setting-row dai-setting-toggle"><span><b>紧凑界面</b></span><input type="checkbox" data-setting="ui.compact"></label><label class="dai-setting-row dai-setting-toggle"><span><b>先占位再补正文</b><small>等待模型时先在对话里放一条“……”，正文回来后再替换。</small></span><input type="checkbox" data-setting="ui.placeholder"></label><label class="dai-setting-row dai-setting-toggle"><span><b>调试信息</b><small>只记录本地诊断信息，不记录提示词或密钥。</small></span><input type="checkbox" data-setting="debug"></label></div><div class="dai-settings-card"><div class="dai-card-heading"><b>旧版手动脉冲</b><small>默认关闭：正文由酒馆自己生成，扩展只在生成前注入原著设定。开启后回到“面板里点结算这一轮”的旧链路，两条链路会抢正文，不建议同时用。</small></div><label class="dai-setting-row dai-setting-toggle"><span><b>启用旧版手动脉冲</b><small>仅在需要对照旧行为时打开。</small></span><input type="checkbox" data-setting="ui.legacyTurn"></label></div></section>
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
        if (activeSettingsPage === 'facts') {
            const status = panel.querySelector('[data-injection-status]');
            if (status) status.textContent = agentPromptInjection.inspect().note;
            renderFactsStatus(panel);
            refreshWorldbookStats(panel);
        }
        if (activeSettingsPage === 'world') refreshWorldPage(panel);
    };
    panel.addEventListener('click', event => {
        const close = event.target.closest?.('[data-settings-close]');
        if (close) return closeSettingsPanel();
        const runButton = event.target.closest?.('[data-agent-run]');
        if (runButton) return runTurnFromPanel(panel);
        const retryButton = event.target.closest?.('[data-agent-retry]');
        if (retryButton) return runTurnFromPanel(panel, { retry: true });
        const rollbackButton = event.target.closest?.('[data-agent-rollback]');
        if (rollbackButton) return rollbackFromPanel(panel, rollbackButton.dataset.agentRollback);
        const scanButton = event.target.closest?.('[data-agent-worldbook-scan]');
        if (scanButton) return scanWorldbookNames(panel);
        const importButton = event.target.closest?.('[data-agent-worldbook-import]');
        if (importButton) return importWorldbookFromPanel(panel);
        const worldAdvance = event.target.closest?.('[data-world-advance]');
        if (worldAdvance) return worldAdvanceFromPanel(panel, Number(worldAdvance.dataset.worldAdvance));
        if (event.target.closest?.('[data-world-advance-custom]')) {
            const input = panel.querySelector('[data-world-days]');
            const days = Number(input?.value);
            if (!Number.isInteger(days) || days < 1) return;
            if (input) input.value = '';
            return worldAdvanceFromPanel(panel, days);
        }
        if (event.target.closest?.('[data-world-setday-apply]')) {
            const input = panel.querySelector('[data-world-setday]');
            const day = Number(input?.value);
            if (!Number.isInteger(day) || day < 1) return;
            if (input) input.value = '';
            return worldApplyFromPanel(panel, [{ op: 'setClock', day, minute: agentWorldRuntime.status().clock.minute }]);
        }
        if (event.target.closest?.('[data-world-add]')) return worldAddFromPanel(panel);
        const worldResolve = event.target.closest?.('[data-world-resolve]');
        if (worldResolve) return worldApplyFromPanel(panel, [{ op: 'resolveEvent', id: worldResolve.dataset.worldResolve }]);
        const worldPin = event.target.closest?.('[data-world-pin]');
        if (worldPin) return worldApplyFromPanel(panel, [{ op: 'pinEvent', id: worldPin.dataset.worldPin, pinned: worldPin.dataset.worldPinned !== 'true' }]);
        const guideDefault = event.target.closest?.('[data-world-guide-default]');
        if (guideDefault) {
            const area = panel.querySelector('[data-setting="world.eventGuide"]');
            if (area) {
                area.value = OPS_GUIDE;
                area.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return;
        }
        const defaultPrompt = event.target.closest?.('[data-prompt-default]');
        if (defaultPrompt) {
            const which = defaultPrompt.dataset.promptDefault === 'lookup' ? 'lookup' : 'select';
            const area = panel.querySelector(`[data-setting="prompt.${which}"]`);
            if (area) {
                area.value = which === 'lookup' ? LOOKUP_RULES : SELECT_RULES;
                area.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return;
        }
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
        if (input.dataset.setting === 'enableSandboxMode' || input.dataset.setting.startsWith('sandbox.')) syncSandboxModeFromSettings();
        if (input.dataset.setting === 'setting.worldbook') scheduleWorldbookSync(panel);
        if (input.dataset.setting === 'setting.progress') refreshWorldbookStats(panel);
        if (/^(setting|injection|llm)\./.test(input.dataset.setting)) renderFactsStatus(panel);
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
    let worldButton = document.getElementById(WORLD_BUTTON_ID);
    if (!worldButton) {
        worldButton = makeElement('button', 'dai-settings-button', '世界');
        worldButton.id = WORLD_BUTTON_ID;
        worldButton.type = 'button';
        worldButton.title = '查看世界状态：时间、现状与进行中的事件';
        worldButton.setAttribute('aria-controls', WORLD_PANEL_ID);
        worldButton.setAttribute('aria-expanded', 'false');
        worldButton.addEventListener('click', () => toggleWorldOverlay());
    }
    const host = document.querySelector('#top-bar, #top-bar-items, #extensionsMenu');
    for (const item of [button, worldButton]) {
        if (host && !host.contains(item)) host.append(item);
        else if (!item.isConnected) document.body.append(item);
    }
    createSettingsPanel();
    createWorldOverlay();
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
    loadSettingEntries();
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
        document.getElementById(WORLD_BUTTON_ID)?.remove();
        document.getElementById(WORLD_PANEL_ID)?.remove();
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
        document.getElementById(WORLD_BUTTON_ID)?.remove();
        document.getElementById(WORLD_PANEL_ID)?.remove();
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

let lastTurnInput = null;
let lastTurnStatus = null;

function currentAgentScope() {
    const context = getHostContext();
    const chatId = typeof context?.chatId === 'string' && context.chatId.trim() ? context.chatId.trim() : '';
    const branchId = typeof context?.chatMetadata?.branch_id === 'string' && context.chatMetadata.branch_id.trim() ? context.chatMetadata.branch_id.trim() : 'main';
    return { sessionId: chatId || 'current-chat', branchId };
}

const STATE_LABELS = {
    player: { hp: '气血', hpMax: '气血上限', douqi: '斗气', gold: '金币', reputation: '声望', realm: '境界', location: '位置' },
    world: { day: '天数', weather: '天气', region: '区域' },
};

function describeState(record) {
    if (!record?.exists) return '还没有载入状态。';
    const parts = [];
    for (const [targetId, fields] of Object.entries(STATE_LABELS)) {
        for (const [field, label] of Object.entries(fields)) {
            const value = record.state?.[targetId]?.[field];
            if (value === undefined || value === null || value === '') continue;
            parts.push(`${label} ${value}`);
        }
    }
    return `版本 ${record.stateVersion}${parts.length ? ` · ${parts.join(' · ')}` : ''}`;
}

function describeTurnResult(result) {
    if (!result || typeof result !== 'object') return '没有返回结果。';
    switch (result.status) {
        case 'completed': {
            const count = Array.isArray(result.changes) ? result.changes.length : 0;
            return `已完成，状态版本 ${result.stateVersion ?? '未知'}${count ? `，写入 ${count} 项状态变化。` : '，本轮没有状态变化。'}`;
        }
        case 'needs_clarification': return '还需要你补充一句明确的做法或目标。';
        case 'needs_review': return `这一轮没有通过校验：${result.reason ?? '需要复核'}。`;
        case 'disabled': return '总控已关闭，先在“总控”页打开开关。';
        case 'unavailable': return result.message ?? '模型连接不可用。';
        case 'save_uncertain': return '正文已经显示，但状态提交需要核对。';
        case 'missing_input': return '当前对话里还没有玩家消息。';
        case 'failed': return `没有完成：${result.reason ?? result.stage ?? '未知原因'}。`;
        default: return `未执行：${result.reason ?? result.status ?? '未知状态'}`;
    }
}

/** Renders every live value the facts page can show: index, catalog, channel, last injection, model. */
function refreshFactsStatusCard() {
    const panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null;
    if (panel && !panel.hidden) renderFactsStatus(panel);
}

/** 手动操作与浮层操作共用：落账、存档、刷新两处视图（设置页与浮层各自判断是否可见）。 */
function applyWorldOps(operations) {
    const result = agentWorldRuntime.apply(operations, { source: 'panel' });
    persistWorld();
    refreshWorldPage();
    refreshWorldOverlay();
    return result;
}

/** 面板上的手动世界操作与模型指令走同一个台账：先记账、再保存、再刷新页面。 */
function worldApplyFromPanel(panel, operations) {
    const result = applyWorldOps(operations);
    const note = panel?.querySelector('[data-world-journal]');
    if (note && result.rejected.length) {
        const warn = makeElement('p', 'dai-turn-result');
        warn.textContent = `有 ${result.rejected.length} 条操作被拒绝：${result.rejected.map(item => `${item.op}(${item.reason})`).join('、')}`;
        note.prepend(warn);
    }
    return result;
}

function worldAdvanceFromPanel(panel, days) {
    if (!Number.isInteger(days) || days < 1 || days > 365) return { status: 'noop' };
    return worldApplyFromPanel(panel, [{ op: 'advance', days }]);
}

function worldAddFromPanel(panel) {
    const scopeInput = panel.querySelector('[data-world-add-scope]');
    const weightInput = panel.querySelector('[data-world-add-weight]');
    const textInput = panel.querySelector('[data-world-add-text]');
    const basisInput = panel.querySelector('[data-world-add-basis]');
    const daysInput = panel.querySelector('[data-world-add-days]');
    const body = typeof textInput?.value === 'string' ? textInput.value.trim() : '';
    if (!body) {
        if (textInput) textInput.placeholder = '先写一句事件内容再登记';
        return { status: 'noop' };
    }
    const basis = typeof basisInput?.value === 'string' ? basisInput.value.trim() : '';
    const rawDays = Number(daysInput?.value);
    const days = Number.isInteger(rawDays) && rawDays >= 1 && rawDays <= 90 ? rawDays : undefined;
    const result = worldApplyFromPanel(panel, [{ op: 'addEvent', scope: scopeInput?.value ?? 'near', text: body, basis, days, weight: weightInput?.value === 'major' ? 'major' : 'minor' }]);
    if (textInput) textInput.value = '';
    if (basisInput) basisInput.value = '';
    if (daysInput) daysInput.value = '';
    return result;
}

function renderWorldEventList(container, events, { emptyNote } = {}) {
    if (!container) return;
    const active = (Array.isArray(events) ? events : []).filter(event => event?.done !== true);
    if (!active.length) {
        container.replaceChildren(makeElement('p', 'dai-turn-result', emptyNote ?? '暂无进行中的事件。'));
        return;
    }
    const today = agentWorldRuntime.status().clock.day;
    const rows = active.map(event => {
        const row = makeElement('div', 'dai-world-event');
        row.dataset.weight = event.weight === 'major' ? 'major' : 'minor';
        if (event.pinned === true) row.dataset.pinned = 'true';
        const head = makeElement('div', 'dai-world-event-head');
        head.append(makeElement('b', '', `${event.weight === 'major' ? '★' : '·'} ${event.text}`));
        const due = event.endDay !== null && event.endDay !== undefined ? ` · 剩 ${Math.max(1, event.endDay - today + 1)} 天` : '';
        head.append(makeElement('small', '', `第 ${event.day} 天 · ${event.id}${due}`));
        row.append(head);
        if (typeof event.basis === 'string' && event.basis.trim()) {
            row.append(makeElement('small', 'dai-world-event-basis', `依据：${event.basis.trim()}`));
        }
        const actions = makeElement('div', 'dai-world-event-actions');
        const resolve = makeElement('button', 'dai-secondary-button', '了结');
        resolve.type = 'button';
        resolve.dataset.worldResolve = event.id;
        const pin = makeElement('button', 'dai-secondary-button', event.pinned ? '取消置顶' : '置顶');
        pin.type = 'button';
        pin.dataset.worldPin = event.id;
        pin.dataset.worldPinned = event.pinned ? 'true' : 'false';
        actions.append(resolve, pin);
        row.append(actions);
        return row;
    });
    container.replaceChildren(...rows);
}

/** 世界页只在可见时重绘：时钟、双栏事件、指令流水。 */
function refreshWorldPage(panel) {
    const target = panel ?? (typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null);
    if (!target || target.hidden) return;
    const section = target.querySelector('[data-settings-section="world"]');
    if (!section || section.hidden) return;
    const status = agentWorldRuntime.status();
    const snapshot = agentWorldRuntime.snapshot();
    const time = section.querySelector('[data-world-time]');
    if (time) {
        const parts = [];
        if (status.clock.label) parts.push(status.clock.label);
        for (const [field, label] of [['era', '时期'], ['location', '所在地'], ['weather', '天气']]) {
            if (status.info[field]) parts.push(`${label}：${status.info[field]}`);
        }
        time.textContent = `${agentWorldRuntime.formatClock()}${parts.length ? ` · ${parts.join(' · ')}` : ''}`;
    }
    renderWorldEventList(section.querySelector('[data-world-events-near]'), snapshot.nearEvents);
    renderWorldEventList(section.querySelector('[data-world-events-world]'), snapshot.worldEvents, { emptyNote: '暂无进行中的世界大事。' });
    const journal = section.querySelector('[data-world-journal]');
    if (journal) {
        const entries = [...snapshot.log].reverse().slice(0, 8);
        journal.replaceChildren(...(entries.length ? entries.map(entry => {
            const item = makeElement('p', 'dai-turn-result');
            item.append(makeElement('b', '', `${entry.source === 'llm' ? '模型' : entry.source === 'panel' ? '面板' : entry.source}：`), document.createTextNode(entry.summaries.join('；') || '（无变化）'));
            return item;
        }) : [makeElement('p', 'dai-turn-result', '还没有世界指令执行记录。生成后模型下的指令会记在这里。')]));
    }
}

function renderFactsStatus(panel) {
    const target = panel?.querySelector('[data-facts-status]');
    if (!target) return;
    const settings = currentSettings();
    const stats = agentFactsIndex.stats();
    const manualRaw = settings.setting?.progress;
    const manual = Number.isInteger(manualRaw) && manualRaw > 0 ? manualRaw : null;
    const autoRaw = settings.facts?.currentVolume;
    const auto = Number.isInteger(autoRaw) && autoRaw > 0 ? autoRaw : null;
    const progress = manual ?? auto ?? null;
    const rows = [];
    const push = (label, value, tone) => rows.push({ label, value, tone });

    const book = typeof settings.setting?.worldbook === 'string' ? settings.setting.worldbook.trim() : '';
    push('世界书', book || '未填写（点“扫描可选世界书”或手填）', book ? undefined : 'warn');

    if (stats.total) {
        const categories = Object.entries(stats.categories ?? {}).map(([name, count]) => `${name}${count}`).join(' ');
        push('索引', `${stats.total} 条 · ${categories}${lastWorldbookNative ? ` · 酒馆原生 ${lastWorldbookNative} 条未重复接管` : ''}`);
    } else {
        push('索引', '空：还没有导入世界书', 'warn');
    }

    const rowsCount = stats.total
        ? (progress === null ? agentFactsIndex.fullCatalog({ limit: 120 }).length : agentFactsIndex.catalogFor(progress).lines.length)
        : 0;
    if (progress === null) {
        push('卷与目录', `未定卷：全卷目录 ${rowsCount} 行（会看到后面卷的内容）· 缺卷号 ${stats.missingVolume} 条`, 'warn');
    } else {
        const source = manual !== null ? '手动' : '自动';
        const extra = manual !== null && auto !== null ? `，自动判定 ${auto}` : '';
        push('卷与目录', `第 ${progress} 卷（${source}${extra}）· 目录 ${rowsCount} 行 · 缺卷号 ${stats.missingVolume} 条`);
    }

    const channel = agentPromptInjection.inspect();
    push('注入通道', `${channel.note}${channel.status === 'ready' ? `（位置 IN_CHAT=${channel.position}，角色 SYSTEM=${channel.role}）` : ''}`, channel.status === 'ready' ? undefined : 'warn');

    const last = channel.last;
    if (!last) push('上次注入', '本轮还没有注入过');
    else if (last.status === 'injected') {
        const ids = Array.isArray(last.usedIds) && last.usedIds.length ? last.usedIds.join('、') : '无编号';
        const time = Number.isFinite(last.at) ? new Date(last.at).toLocaleTimeString('zh-CN', { hour12: false }) : '-';
        push('上次注入', `已注入 ${ids} · ${last.chars} 字${last.truncated ? '（已截断）' : ''} · ${time}${last.cleared ? ' · 已清理' : ' · 仍在提示词里'}`);
    } else if (last.status === 'failed') push('上次注入', `失败：${last.reason ?? '未知原因'}`, 'warn');
    else push('上次注入', '没有可注入的条目（本轮未命中）');

    if (!lastLookupInfo) push('目录外搜索', '本轮没有用（模型没提目录外的名字）');
    else {
        const asked = Array.isArray(lastLookupInfo.requested) && lastLookupInfo.requested.length
            ? `「${lastLookupInfo.requested.join('、')}」`
            : '（没给名字）';
        const hits = Array.isArray(lastLookupInfo.hits) ? lastLookupInfo.hits.length : 0;
        const picked = Array.isArray(lastLookupInfo.picked) ? lastLookupInfo.picked : [];
        const took = lastLookupInfo.secondCall ? `二次点选 ${picked.length} 条${picked.length ? `（${picked.join('、')}）` : ''}` : (lastLookupInfo.note || '没有发第二次调用');
        push('目录外搜索', `要了${asked} → 全库搜到 ${hits} 条 → ${took}`, lastLookupInfo.error ? 'warn' : undefined);
    }

    const llm = settings.llm ?? {};
    const connection = llm.useSillyTavernConnection === false
        ? `独立接口 · ${llm.model || '未填模型名'}`
        : `酒馆当前连接 · ${llm.model || '沿用酒馆模型'}`;
    push('模型', connection);
    push('生成参数', `温度 ${llm.temperature ?? '默认'} · 输出上限 ${llm.maxTokens ?? '默认'} · 等待 ${llm.timeoutMs ?? '默认'} ms`);
    push('开关', `注入${settings.setting?.enabled ? '开' : '关'} · 旧链路${settings.ui?.legacyTurn ? '开' : '关'} · 注入通道${settings.injection?.enabled ? '开' : '关'} · 深度 ${settings.injection?.depth ?? 0} · 上限 ${settings.setting?.injectionBudget > 0 ? settings.setting.injectionBudget + " 字" : "不限"}`);

    target.replaceChildren(...rows.map(row => {
        const item = document.createElement('li');
        if (row.tone === 'warn') item.dataset.tone = 'warn';
        const label = document.createElement('b');
        label.textContent = row.label;
        const value = document.createElement('span');
        value.textContent = row.value;
        item.append(label, value);
        return item;
    }));
}

let worldbookSyncTimer = null;
let worldbookSyncSequence = 0;

/** Debounced re-index after the world-book name changes in the settings panel. */
function scheduleWorldbookSync(panel) {
    const sequence = ++worldbookSyncSequence;
    if (worldbookSyncTimer !== null) clearTimeout(worldbookSyncTimer);
    worldbookSyncTimer = setTimeout(async () => {
        worldbookSyncTimer = null;
        if (sequence !== worldbookSyncSequence) return;
        const result = await syncWorldbookIndex();
        if (sequence !== worldbookSyncSequence) return;
        const target = panel?.querySelector('[data-agent-worldbook-status]');
        if (target) target.textContent = describeSyncResult(result);
        refreshWorldbookStats(panel);
        renderFactsStatus(panel);
    }, 500);
}

function describeSyncResult(result) {
    if (!result || result.status === 'unset') return '还没填世界书名称。';
    if (result.status === 'ok') return `已同步：索引 ${result.indexed} 条。`;
    if (result.status === 'failed') return `同步失败：${result.reason ?? '未知原因'}`;
    return result.note ?? `同步没有完成：${result.status}`;
}

/** Rewrites the "检索库状态" line from the live index; safe to call before any import. */
function refreshWorldbookStats(panel) {
    const target = panel?.querySelector('[data-worldbook-stats]');
    if (!target) return;
    const stats = agentFactsIndex.stats();
    if (!stats.total) {
        target.textContent = '索引为空：填好世界书名称后点“从世界书导入”，或打开一次聊天让扩展自动同步。';
        return;
    }
    const categories = Object.entries(stats.categories ?? {}).map(([name, count]) => `${name}${count}`).join(' ');
    const progress = Number.isInteger(currentSettings().setting?.progress) ? currentSettings().setting.progress : 1;
    const rows = agentFactsIndex.catalogFor(progress).lines.length;
    target.textContent = `已索引 ${stats.total} 条｜${categories}｜${stats.missingVolume} 条缺卷号｜当前卷 ${progress} 目录 ${rows} 行`;
}

/** Best-effort world-book name discovery; unsupported hosts fall back to manual typing. */
async function listWorldbookNames() {
    const context = getHostContext();
    for (const method of ['getWorldInfoNames', 'getWorldInfoList']) {
        if (typeof context?.[method] !== 'function') continue;
        try {
            const names = await context[method]();
            if (Array.isArray(names)) return names.map(String).filter(Boolean);
        } catch { /* 换下一个探测点 */ }
    }
    const fallback = context?.world_info_names ?? context?.worldInfoNames;
    return Array.isArray(fallback) ? fallback.map(String).filter(Boolean) : [];
}

async function scanWorldbookNames(panel) {
    const target = panel?.querySelector('[data-agent-worldbook-status]');
    const list = panel?.querySelector('#dai-worldbook-options');
    if (target) target.textContent = '正在读取世界书列表……';
    const names = await listWorldbookNames();
    if (!names.length) {
        if (target) target.textContent = '这个酒馆版本没有给出世界书列表，请直接手填名称（世界书面板里显示的那个名字）。';
        return [];
    }
    if (list) {
        list.replaceChildren(...names.map(name => {
            const option = document.createElement('option');
            option.value = name;
            return option;
        }));
    }
    if (target) target.textContent = `找到 ${names.length} 本世界书，输入框里可以直接选。`;
    return names;
}

/** Rebuilds the world-book index from the configured book; silent when the name is unset. */
/**
 * 世界书里启用的条目由酒馆自己注入，插件只接管“关着”的那批明细，
 * 否则同一段设定会从两条路各进一次提示词。
 */
function splitPluginEntries(result) {
    const entries = Array.isArray(result?.entries) ? result.entries : [];
    const data = entries.filter(entry => entry.native !== true);
    const native = entries.filter(entry => entry.native === true);
    const raw = result?.raw && typeof result.raw === 'object' ? result.raw : {};
    const rawData = Object.values(raw).filter(item => item && item.disable === true);
    return { data, native, rawData };
}

async function syncWorldbookIndex() {
    const name = typeof currentSettings().setting?.worldbook === 'string' ? currentSettings().setting.worldbook.trim() : '';
    if (!name) return { status: 'unset' };
    try {
        const result = await loadWorldbookEntries(getHostContext(), name);
        if (result.status !== 'ok') return result;
        const split = splitPluginEntries(result);
        agentSettingSupply.clear();
        agentSettingSupply.register(split.data);
        agentFactsIndex.load({ entries: split.rawData });
        lastWorldbookNative = split.native.length;
        return { status: 'ok', indexed: agentFactsIndex.stats().total, native: split.native.length };
    } catch (error) {
        try { console.warn(`[${EXTENSION_ID}] 世界书索引同步失败`, error); } catch { /* 静默失败，不影响生成 */ }
        return { status: 'failed', reason: String(error?.message ?? error) };
    }
}

/** Reads a world book into the setting supply: read-only, ids keep the entry uid. */
async function importWorldbookFromPanel(panel) {
    const target = panel?.querySelector('[data-agent-worldbook-status]');
    const name = typeof currentSettings().setting?.worldbook === 'string' ? currentSettings().setting.worldbook.trim() : '';
    if (!name) { if (target) target.textContent = '先填写世界书名称，再点导入。'; return { status: 'missing_name' }; }
    if (target) target.textContent = `正在读取「${name}」……`;
    try {
        const result = await loadWorldbookEntries(getHostContext(), name);
        if (result.status !== 'ok') {
            if (target) target.textContent = result.note;
            return result;
        }
        agentSettingSupply.clear();
        const split = splitPluginEntries(result);
        const added = agentSettingSupply.register(split.data);
        agentFactsIndex.load({ entries: split.rawData });
        lastWorldbookNative = split.native.length;
        const summary = summarizeWorldbookEntries(result.entries);
        const indexed = agentFactsIndex.stats();
        const categoryText = Object.entries(indexed.categories ?? {}).map(([name, count]) => `${name}${count}`).join(' ');
        if (target) target.textContent = `${result.note} 插件接管 ${added.added} 条（酒馆已在用的 ${split.native.length} 条跳过），其中 ${summary.withPhase} 条带卷号、${summary.withoutPhase} 条需要手动补卷号；索引 ${indexed.total} 条：${categoryText}${indexed.missingVolume ? `；${indexed.missingVolume} 条没有卷号` : ''}`;
        refreshWorldbookStats(panel);
        renderFactsStatus(panel);
        return { ...result, added };
    } catch (error) {
        if (target) target.textContent = `导入失败：${error?.message ?? error}`;
        return { status: 'failed', reason: String(error?.message ?? error) };
    }
}

function renderTurnExtras(panel) {
    if (!panel) return;
    const record = agentStateStore.read(currentAgentScope());
    const chip = panel.querySelector('[data-agent-state]');
    if (chip) chip.textContent = describeState(record);
    const list = panel.querySelector('[data-agent-versions]');
    if (!list) return;
    list.textContent = '';
    if (!record?.exists) return;
    const seen = new Set();
    const entries = [{ version: record.stateVersion, label: '当前' }];
    for (const item of [...(record.history ?? [])].reverse()) {
        if (!item?.stateVersion || seen.has(item.stateVersion)) continue;
        seen.add(item.stateVersion);
        entries.push({ version: item.stateVersion, label: item.rolledBackTo ? `回到 ${item.rolledBackTo}` : '历史' });
        if (entries.length >= 5) break;
    }
    for (const entry of entries) {
        const button = makeElement('button', 'dai-version-button', entry.version);
        button.type = 'button';
        button.dataset.agentRollback = entry.version;
        button.title = `${entry.label} · 点一下回到这个版本`;
        button.disabled = entry.version === record.stateVersion;
        list.append(button);
    }
}

/** Runs one full turn from the newest player message in the live chat. */
export async function runLatestTurn() {
    const context = getHostContext();
    if (!context) return { status: 'unavailable', message: '还没有连接到酒馆。' };
    const chat = Array.isArray(context.chat) ? context.chat : [];
    let index = -1;
    for (let i = chat.length - 1; i >= 0; i -= 1) {
        if (chat[i]?.is_user && typeof chat[i].mes === 'string' && chat[i].mes.trim()) { index = i; break; }
    }
    if (index < 0) return { status: 'missing_input', message: '当前对话里还没有玩家消息。' };
    return runTurnWithInput(chat[index].mes, String(index));
}

async function runTurnWithInput(input, triggerMessageId) {
    lastTurnInput = { input, triggerMessageId };
    const result = await agentOrchestrator.runTurn({ ...currentAgentScope(), input, triggerMessageId });
    lastTurnStatus = result?.status ?? null;
    return result;
}

async function runTurnFromPanel(panel, { retry = false } = {}) {
    const runButton = panel.querySelector('[data-agent-run]');
    const retryButton = panel.querySelector('[data-agent-retry]');
    const target = panel.querySelector('[data-agent-run-result]');
    if (runButton?.disabled) return;
    if (currentSettings().ui?.legacyTurn !== true) {
        if (target) target.textContent = '正文由酒馆自己生成；原著设定已改为生成前自动注入。要改成“扩展自己写正文”，把 ui.legacyTurn 打开。';
        return;
    }
    const button = retry ? retryButton : runButton;
    if (runButton) runButton.disabled = true;
    if (retryButton) retryButton.disabled = true;
    if (target) target.textContent = retry ? '正在重试上一轮……' : '正在运行这一轮……';
    try {
        const result = retry && lastTurnInput
            ? await runTurnWithInput(lastTurnInput.input, lastTurnInput.triggerMessageId)
            : await runLatestTurn();
        if (target) target.textContent = describeTurnResult(result);
    } catch (error) {
        if (target) target.textContent = `运行失败：${error?.message ?? error}`;
    } finally {
        if (runButton) runButton.disabled = false;
        if (retryButton) {
            retryButton.disabled = false;
            retryButton.hidden = !lastTurnInput || lastTurnStatus === 'completed';
        }
        renderTurnExtras(panel);
        refreshControlDashboard();
    }
}

async function rollbackFromPanel(panel, version) {
    const target = panel.querySelector('[data-agent-run-result]');
    if (!version) return;
    if (target) target.textContent = `正在回到 ${version}……`;
    try {
        const result = await agentOrchestrator.rollback({ ...currentAgentScope(), targetVersion: version });
        if (target) {
            target.textContent = result?.status === 'rolled_back'
                ? `已回到 ${version}，作为新版本 ${result.stateVersion} 提交。`
                : `没有回退：${result?.status ?? '未知原因'}。`;
        }
    } catch (error) {
        if (target) target.textContent = `回退失败：${error?.message ?? error}`;
    } finally {
        renderTurnExtras(panel);
        refreshControlDashboard();
    }
}