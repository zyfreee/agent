import { createAgentCoordinator, STATUS_EVENT } from './core/coordinator.js';
import { createModuleRunner } from './core/module-runner.js';
import { createTurnPipeline } from './core/turn-pipeline.js';
import { createQualityGate } from './core/quality-gate.js';
import { createDataContractRegistry } from './core/data-contract.js';
import { createAuditLog } from './core/audit-log.js';
import { createFactsLibrary } from './narrative/facts-library.js';
import { createSettingSupply } from './narrative/setting-supply.js';
import { createImpactRuntime } from './impact/impact-runtime.js';
import { buildImpactInjection, buildImpactInjectionDetail, impactMark, isImpactDecideDue, WEIGHT_LABEL, STATE_LABEL, SHIFT_LABEL } from './impact/impact-ops.js';
import { buildImpactDecideUser, parseImpactDecision, IMPACT_DECIDE_PROMPT, IMPACT_JSON_SCHEMA } from './impact/impact-decide.js';
import { buildImpactInjectUser, buildImpactInjectionFromPicksDetail, parseImpactSelect, IMPACT_INJECT_PROMPT, IMPACT_INJECT_SCHEMA } from './impact/impact-select.js';
import { createActionResolver } from './request/action-resolver.js';
import { createNpcDecisionGuard } from './npc/npc-decision-guard.js';
import { createNpcAutonomyPlanner } from './npc/npc-autonomy.js';
import { createNpcPlanReassessment } from './npc/npc-plan-reassessment.js';
import { createNpcConflictCoordinator } from './npc/npc-conflict.js';
import { createNpcOutcomeBridge } from './npc/npc-outcome-bridge.js';
import { createNpcCommitGate } from './npc/npc-commit-gate.js';
import { createNpcLedger, NPC_FIELDS, FAVOR_SCALE, FAVOR_STEP_MAX, favorLabel } from './npc/npc-ledger.js';
import { NPC_RECORD_PROMPT, NPC_RECORD_JSON_SCHEMA, NPC_EXTRACT_PROMPT, buildNpcRecordUser, buildNpcExtractUser, playerContextLine, parseNpcRecordReply } from './npc/npc-recorder.js';
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
import { registerDefaultContracts, listWritableFields } from './core/turn-state.js';
import { SETTLE_CATEGORIES, resolveCategory } from './core/settle-categories.js';
import { createLlmClient, listModels } from './host/llm-client.js';
import { createMessageAdapter } from './host/message-adapter.js';
import { createStatePersistence } from './host/state-persistence.js';
import { createPromptInjection } from './host/prompt-injection.js';
import { loadWorldbookEntries, summarizeWorldbookEntries } from './narrative/worldbook-source.js';
import { createFactsIndex } from './narrative/facts-index.js';
import { createFactsSelector, LOOKUP_RULES, SELECT_RULES } from './narrative/facts-select.js';
import { createWorldRuntime } from './world/world-runtime.js';
import { buildWorldInjection, extractOpsBlock, parseOps, stripOpsBlock, OPS_GUIDE, WORLD_HEADER } from './world/world-ops.js';
import { buildDecideUser, parseDecision, WORLD_DECIDE_PROMPT, DECIDE_JSON_SCHEMA } from './world/world-decide.js';

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
        restoreWorldFromChat();
        restoreImpactFromChat();
        restoreNpcLedgerFromChat();
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
            try { agentImpactPromptInjection.clear(); } catch { /* 同上 */ }
            try { agentNpcLedgerInjection.clear(); } catch { /* 同上 */ }
            try { restoreWorldFromChat(); } catch { /* 换聊天读不到世界台账时按开局处理 */ }
            try { restoreImpactFromChat(); } catch { /* 换聊天读不到影响库时按空库开局 */ }
            try { restoreNpcLedgerFromChat(); } catch { /* 换聊天读不到人物簿时按空簿开局 */ }
            try { agentOrchestrator.restore(currentAgentScope()); } catch { /* 未连接酒馆时跳过恢复 */ }
            refreshControlDashboard();
            refreshWorldPage();
            try { renderImpactLibrary(); } catch { /* 面板未挂载时忽略 */ }
            try { refreshNpcLedgerPage(); } catch { /* 同上 */ }
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
            // 生成正常结束才决定/解析；手动停止时最后楼层还是上一轮的，跑了也是白花一次调用。
            if (name === 'GENERATION_ENDED') {
                const decide = worldDecideSettings();
                // 影响库要读“这一轮之后”的世界台账，所以排在决定/执行之后，串行跑。
                const afterWorld = () => {
                    try {
                        const impact = impactSettings();
                        if (!impact.enabled || !impact.decideEnabled || !impact.decideAuto) return;
                        // 记录节奏：1 = 每轮，3 = 每三轮；按“上次记账之后又生成了几楼”算，换聊天/重开也不会乱。
                        const chat = Array.isArray(getHostContext()?.chat) ? getHostContext().chat : [];
                        // 没记到东西也算叫过一次记录员，否则 every=3 会在“连着几轮没变化”后退化成每轮都跑。
                        const decidedFloor = agentImpactRuntime.status().decidedFloor;
                        // 删过楼的话旧楼层号会超出当前聊天：夹到最后一楼，别把“删楼”误判成“一整段都没记过”。
                        const lastFloor = Math.min(decidedFloor, chat.length - 1);
                        if (!isImpactDecideDue(chat, { every: impact.decideEvery, lastFloor })) return;
                        void runImpactDecision({ source: 'auto' });
                    } catch { /* 记录失败不影响生成 */ }
                };
                if (decide.enabled && decide.auto) {
                    try { void Promise.resolve(runWorldDecision({ source: 'auto' })).finally(afterWorld).catch(() => {}); } catch { afterWorld(); }
                } else {
                    try { applyWorldOpsFromLatestReply(); } catch { /* 指令执行失败不影响生成 */ }
                    afterWorld();
                }
                // 人物簿独立记账：正文已经落地，记录员读这一轮把人物变化补进档案。
                // 三条链（世界决定、影响记录、人物记账）互不阻塞，任何一条失败都不影响正文。
                const ledger = npcLedgerSettings();
                if (ledger.enabled && ledger.auto) {
                    try { void runNpcLedgerRecord({ source: 'auto' }); } catch { /* 记账失败不影响生成 */ }
                }
            }
            try { agentPromptInjection.clear(); } catch { /* 清空失败不影响生成 */ }
            try { agentWorldPromptInjection.clear(); } catch { /* 同上 */ }
            try { agentImpactPromptInjection.clear(); } catch { /* 同上 */ }
            try { agentNpcLedgerInjection.clear(); } catch { /* 同上 */ }
            try {
                const panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null;
                if (panel && !panel.hidden) { renderFactsStatus(panel); refreshWorldbookStats(panel); refreshWorldPage(panel); refreshControlDashboard(); try { renderImpactLibrary(panel); } catch { /* 同上 */ } try { refreshNpcLedgerPage(panel); } catch { /* 同上 */ } }
            } catch { /* 面板未挂载时忽略 */ }
        };
        context.eventSource.on(event, handler);
        hostLifecycleBindings.push({ event, handler });
    }
    // 删楼：这一楼记的账进档案，后面楼层的“依据楼层”整体前移，账本不会指错地方。
    const messageDeleted = context.event_types.MESSAGE_DELETED;
    if (typeof messageDeleted === 'string' && messageDeleted) {
        const handler = payload => {
            const index = typeof payload === 'number' ? payload : Number(payload?.index ?? payload?.messageIndex ?? NaN);
            if (!Number.isInteger(index) || index < 0) return;
            try {
                const result = agentImpactRuntime.dropFloor(index, { reason: '楼层已删' });
                if (result.status !== 'applied') return;
                persistImpact();
                lastImpactInjection = null;
                renderImpactLibrary();
                const words = [];
                if (result.removed) words.push(`${result.removed} 条影响进了档案`);
                if (result.shifted) words.push(`${result.shifted} 条依据楼层前移`);
                setImpactStatus(`第 ${index + 1} 楼已删：${words.join('，')}。`);
            } catch { /* 账本没挂载时忽略 */ }
        };
        context.eventSource.on(messageDeleted, handler);
        hostLifecycleBindings.push({ event: messageDeleted, handler });
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
/** 世界影响库：记录“玩家把这局世界改成了什么样”，跨楼层累积，跟着聊天存档走。 */
export const agentImpactRuntime = createImpactRuntime();
export const agentActionResolver = createActionResolver();
export const agentNpcDecisionGuard = createNpcDecisionGuard();
export const agentNpcAutonomyPlanner = createNpcAutonomyPlanner();
/** 人物簿：NPC 全信息的母库，跟着聊天存档走。决策、正文注入和面板都从这里读。 */
export const agentNpcLedger = createNpcLedger();
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
export const agentWorldRuntime = createWorldRuntime({ maxOps: 12 });
export const agentWorldPromptInjection = createPromptInjection({ getContext: getHostContext, key: 'doupo_world' });
/** 世界影响库的独立注入通道：和世界台账、原著设定分开，谁也不清空谁。 */
export const agentImpactPromptInjection = createPromptInjection({ getContext: getHostContext, key: 'doupo_impact' });
/** 人物簿的独立注入通道：只写“本楼在场/重要人物的档案摘要”，和世界、影响、原著设定三路互不清空。 */
export const agentNpcLedgerInjection = createPromptInjection({ getContext: getHostContext, key: 'doupo_npc_ledger' });
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
    settleAdjudicator: async ({ category, input, state, allowedFields, preliminary }) => {
        const settings = settleSettings();
        return agentLlmClient.adjudicateAction({
            system: settings.promptFor(category),
            categoryLabel: resolveCategory(category)?.label ?? '通用判定',
            input,
            state,
            allowedFields,
            preliminary,
            overrides: settings.overrides,
        });
    },
    getWritableFields: () => listWritableFields(agentDataContracts),
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
    // 决定式自动开启时指南不再进正文提示词（决定模型另行调用），只注入世界现状保住正文一致性。
    const withGuide = !(world.decideEnabled !== false && world.decideAuto !== false);
    // 抬头+现状受预算约束，指令指南固定追加不截断（约 600 字，另留余量）。
    return agentWorldPromptInjection.write({ text: withGuide ? `${WORLD_HEADER}\n${body}\n\n${guide}` : `${WORLD_HEADER}\n${body}` }, { depth: injectionSettings().depth, maxChars: settings.budget + (withGuide ? 1200 : 0) });
}

/** 生成参数填 0 或留空＝不指定，沿用当前连接/酒馆自己的设置。 */
function impactParam(value, max = 2) {
    const num = Number(value);
    if (value === '' || value === null || value === undefined) return undefined;
    return Number.isFinite(num) && num > 0 && num <= max ? num : undefined;
}

function impactSettings() {
    const settings = currentSettings();
    const impact = settings.impact ?? {};
    return {
        enabled: settings.enablePlayerImpact !== false && impact.enabled !== false,
        inject: impact.inject !== false,
        injectBudget: Number.isInteger(impact.injectBudget) && impact.injectBudget > 0 ? Math.min(impact.injectBudget, 2000) : 800,
        injectSmart: impact.injectSmart !== false,
        injectMaxLines: Number.isInteger(impact.injectMaxLines) && impact.injectMaxLines > 0 ? Math.min(20, impact.injectMaxLines) : 8,
        injectFloors: Number.isInteger(impact.injectFloors) && impact.injectFloors > 0 ? Math.min(12, impact.injectFloors) : 6,
        injectModel: typeof impact.injectModel === 'string' ? impact.injectModel.trim() : '',
        injectMode: impact.injectMode === 'custom' ? 'custom' : 'tavern',
        injectBaseUrl: typeof impact.injectBaseUrl === 'string' ? impact.injectBaseUrl.trim() : '',
        injectApiKey: typeof impact.injectApiKey === 'string' ? impact.injectApiKey.trim() : '',
        injectProvider: impact.injectProvider === 'anthropic' ? 'anthropic' : impact.injectProvider === 'openai' ? 'openai' : '',
        modelMode: impact.modelMode === 'split' ? 'split' : 'shared',
        injectPrompt: typeof impact.injectPrompt === 'string' && impact.injectPrompt.trim() ? impact.injectPrompt.trim() : IMPACT_INJECT_PROMPT,
        decideEnabled: impact.decideEnabled !== false,
        decideAuto: impact.decideAuto !== false,
        decideEvery: Number.isInteger(Number(impact.decideEvery)) && Number(impact.decideEvery) >= 1 ? Math.min(10, Number(impact.decideEvery)) : 1,
        decideMaxFloors: Number.isInteger(impact.decideMaxFloors) && impact.decideMaxFloors > 0 ? Math.min(12, impact.decideMaxFloors) : 10,
        decideMaxEntries: Number.isInteger(impact.decideMaxEntries) && impact.decideMaxEntries >= 0 ? Math.min(40, impact.decideMaxEntries) : 30,
        decideMode: impact.decideMode === 'custom' ? 'custom' : 'tavern',
        decideModel: typeof impact.decideModel === 'string' ? impact.decideModel.trim() : '',
        decideBaseUrl: typeof impact.decideBaseUrl === 'string' ? impact.decideBaseUrl.trim() : '',
        decideApiKey: typeof impact.decideApiKey === 'string' ? impact.decideApiKey.trim() : '',
        decideProvider: impact.decideProvider === 'anthropic' ? 'anthropic' : impact.decideProvider === 'openai' ? 'openai' : '',
        decideTemperature: impactParam(impact.decideTemperature, 2),
        decideMaxTokens: Number.isInteger(impact.decideMaxTokens) && impact.decideMaxTokens > 0 ? Math.min(32768, impact.decideMaxTokens) : undefined,
        decideTopP: impactParam(impact.decideTopP, 1),
        decidePresencePenalty: impactParam(impact.decidePresencePenalty, 2),
        decideFrequencyPenalty: impactParam(impact.decideFrequencyPenalty, 2),
        injectTemperature: impactParam(impact.injectTemperature, 2),
        injectMaxTokens: Number.isInteger(impact.injectMaxTokens) && impact.injectMaxTokens > 0 ? Math.min(32768, impact.injectMaxTokens) : undefined,
        injectTopP: impactParam(impact.injectTopP, 1),
        injectPresencePenalty: impactParam(impact.injectPresencePenalty, 2),
        injectFrequencyPenalty: impactParam(impact.injectFrequencyPenalty, 2),
        prompt: typeof impact.prompt === 'string' && impact.prompt.trim() ? impact.prompt.trim() : IMPACT_DECIDE_PROMPT,
        // 账本不设上限：注入每轮只挑几条，记多少条都不影响正文。
        maxRecords: 0,
        maxChainDepth: Number.isInteger(impact.maxChainDepth) ? Math.min(8, Math.max(0, impact.maxChainDepth)) : 4,
    };
}

/** 记录员与场记各自用哪套连接和生成参数：shared 时场记完全跟着记录员，split 时各用各的。 */
function impactModelPlan(settings) {
    const decide = {
        connection: settings.decideMode === 'custom' ? 'custom' : 'tavern',
        model: settings.decideModel || '',
        baseUrl: settings.decideBaseUrl || '',
        apiKey: settings.decideApiKey || '',
        provider: settings.decideProvider || '',
        temperature: settings.decideTemperature,
        maxTokens: settings.decideMaxTokens,
        topP: settings.decideTopP,
        presencePenalty: settings.decidePresencePenalty,
        frequencyPenalty: settings.decideFrequencyPenalty,
    };
    if (settings.modelMode !== 'split') return { decide, inject: decide };
    return {
        decide,
        inject: {
            connection: settings.injectMode === 'custom' ? 'custom' : 'tavern',
            model: settings.injectModel || '',
            baseUrl: settings.injectBaseUrl || '',
            apiKey: settings.injectApiKey || '',
            provider: settings.injectProvider || '',
            temperature: settings.injectTemperature,
            maxTokens: settings.injectMaxTokens,
            topP: settings.injectTopP,
            presencePenalty: settings.injectPresencePenalty,
            frequencyPenalty: settings.injectFrequencyPenalty,
        },
    };
}

/** 把一套“自定义连接”打包成 llm-client 能直接用的覆盖参数；跟随酒馆时返回 undefined。 */
function impactCustomConnection(role) {
    if (role.connection !== 'custom') return undefined;
    return {
        baseUrl: role.baseUrl || '',
        apiKey: role.apiKey || '',
        provider: role.provider || '',
        model: role.model || '',
    };
}

/** 设置页改了连锁深度时立刻作用到库上，不用重开聊天。 */
function syncImpactLimits() {
    const settings = impactSettings();
    return agentImpactRuntime.configure({ maxRecords: settings.maxRecords, maxChainDepth: settings.maxChainDepth });
}

/** 现在第几天：影响库按世界台账的时钟记账；台账还没推进就停在第一天。 */
function worldDay() {
    const clock = agentWorldRuntime.snapshot()?.clock;
    return Number.isInteger(clock?.day) && clock.day > 0 ? clock.day : 1;
}

/** 影响库跟聊天走：换聊天读那一份，读不到就按空库开局，并把库内天数对齐世界时钟。 */
function restoreImpactFromChat() {
    syncImpactLimits();
    lastImpactInjection = null; // 换聊天/重读存档后，上一轮挑好的注入作废
    const record = hostStorage?.impactState?.();
    if (record?.status === 'ready' && record.value) return agentImpactRuntime.restore(record.value);
    const result = agentImpactRuntime.reset();
    // 空 apply 只做两件事：把库内天数对齐世界时钟、顺手结算已经过期的发酵日。
    agentImpactRuntime.apply([], { source: 'manual', day: worldDay() });
    return result;
}

function persistImpact() {
    const result = hostStorage?.saveImpactState?.(agentImpactRuntime.snapshot());
    if (result && typeof result.catch === 'function') result.catch(() => { /* 保存失败由下次操作重试 */ });
    return result;
}

/* ── 人物簿 ────────────────────────────────────────────────
 * 一条消息落地后，由“人物记录员”独立读最近两楼 + 在场人物索引，输出补丁；
 * 脚本按补丁改档案（好感只记增减、流水只追加），下一楼生成前按“在场 × 重要”注入摘要。
 * 面板、决策链、正文注入都从这里读同一份档案，谁都不另存一份。
 */

/** 建档先照世界书：用这一轮正文去索引里匹配相关条目，只给编号|类别|标题|摘要，不铺全文。 */
function npcLedgerBookLines(floors) {
    try {
        if (agentFactsIndex.stats().total <= 0) return [];
        const text = floors.map(floor => floor.text).join('\n');
        const hits = agentFactsIndex.matchTokens(text, { limit: 12, volume: currentVolumeForWorld() });
        return hits.map(hit => {
            const entry = agentFactsIndex.get(hit.uid);
            return entry ? `${entry.uid}|${entry.category}|${entry.name}|${entry.summary}` : null;
        }).filter(Boolean);
    } catch {
        // 世界书没索引/被关掉时，只凭正文记账，不影响主流程。
        return [];
    }
}

/** 记录员/抄录员共用的调用参数：连接 + 生成参数，全跟着“人物簿 → 记录员参数”走。 */
function npcLedgerOverrides(settings, patch = {}) {
    return {
        connection: settings.connection,
        custom: settings.connection === 'custom'
            ? { baseUrl: settings.baseUrl, apiKey: settings.apiKey, provider: settings.provider, model: settings.model }
            : undefined,
        model: settings.model || undefined,
        temperature: patch.temperature ?? settings.temperature,
        maxTokens: patch.maxTokens ?? settings.maxTokens,
        topP: settings.topP,
        presencePenalty: settings.presencePenalty,
        frequencyPenalty: settings.frequencyPenalty,
    };
}

/**
 * 玩家此刻的位置/境界：等“个人信息”功能做好，用 setNpcPlayerContextProvider 接进来即可。
 * 没接就返回 null，注入里也不会多出一行。
 */
let npcPlayerContextProvider = null;

export function setNpcPlayerContextProvider(provider) {
    npcPlayerContextProvider = typeof provider === 'function' ? provider : null;
    return { status: npcPlayerContextProvider ? 'connected' : 'cleared' };
}

function npcPlayerContext() {
    try {
        const value = npcPlayerContextProvider ? npcPlayerContextProvider() : null;
        return value && typeof value === 'object' ? value : null;
    } catch {
        return null;
    }
}

/** 按姓名/别名/称号去原著设定库里找这个人的条目；一个都找不到时再拿名字当关键词碰一次。 */
function npcLedgerBookEntries(name, aliases = [], titles = []) {
    try {
        if (agentFactsIndex.stats().total <= 0) return [];
        const found = new Map();
        const keys = [name, ...(Array.isArray(aliases) ? aliases : []), ...(Array.isArray(titles) ? titles : [])]
            .map(item => String(item || '').trim())
            .filter(Boolean);
        for (const key of keys) {
            for (const entry of agentFactsIndex.findByName(key)) found.set(entry.uid, entry);
        }
        if (!found.size) {
            for (const hit of agentFactsIndex.matchTokens(keys.join(' '), { limit: 4, volume: currentVolumeForWorld() })) {
                const entry = agentFactsIndex.get(hit.uid);
                if (entry) found.set(hit.uid, entry);
            }
        }
        return [...found.values()].slice(0, 4);
    } catch {
        return [];
    }
}

/**
 * 按世界书补档案：只填空着的字段，正文里已经记下的东西一个都不动。
 * 设定库里搜不到这个名字就跳过，并在结果里点名。
 */
/** 重抽时不许世界书碰的字段：这些只能由正文记出来，抄档不许回头改。 */
const NPC_EXTRACT_PROTECTED = new Set([
    '好感', '好感理由', '理由', '流水', '称呼', '当前称呼', '关系阶段',
    '态度', '人前态度', '私下态度', '对他人', '关系', '关系列表',
    '位置', '所在位置', '在场', '正在做什么', '重要度', '别名', '称号',
]);

async function runNpcLedgerExtract({ names = null, overwrite = false } = {}) {
    const settings = npcLedgerSettings();
    if (!settings.enabled) { setNpcLedgerStatus('人物簿已关闭，没有重抽。'); return { status: 'disabled' }; }
    if (agentLlmClient.configured() !== true) {
        setNpcLedgerStatus('还没配好模型连接：先在“模型与连接”页选好连接，才能按世界书重抽。');
        return { status: 'not_configured' };
    }
    if (npcRecordRunning) return { status: 'busy' };
    const wanted = Array.isArray(names) && names.length ? names : agentNpcLedger.names();
    const targets = wanted
        .map(name => agentNpcLedger.get(name))
        .filter(record => record && (overwrite || agentNpcLedger.missing(record).length))
        .slice(0, 8);
    if (!targets.length) {
        setNpcLedgerStatus(overwrite ? '这一局还没有人物档案可以重抽。' : '这些人的档案已经填满了，没有空字段要补。');
        return { status: 'nothing_to_fill' };
    }
    npcRecordRunning = true;
    setNpcLedgerStatus(overwrite
        ? `正在按世界书重写 ${targets.length} 个人的档案（好感、流水、态度不动）……`
        : `正在按世界书补 ${targets.length} 个人的档案……`);
    let filled = 0;
    const missed = [];
    const failed = [];
    try {
        for (const record of targets) {
            const entries = npcLedgerBookEntries(record.name, record.aliases, record.titles);
            if (!entries.length) { missed.push(record.name); continue; }
            try {
                const raw = await agentLlmClient.complete({
                    system: NPC_EXTRACT_PROMPT,
                    user: buildNpcExtractUser({
                        record: { ...record, missing: agentNpcLedger.missing(record) },
                        entries,
                        day: worldDay(),
                    }),
                    jsonSchema: NPC_RECORD_JSON_SCHEMA,
                    overrides: npcLedgerOverrides(settings, { temperature: 0.2, maxTokens: 1200 }),
                });
                const parsed = parseNpcRecordReply(raw);
                if (parsed.status !== 'ok' || !parsed.patches.length) { failed.push(record.name); continue; }
                const patches = parsed.patches.map(patch => {
                    const next = { ...patch, 姓名: record.name };
                    if (overwrite) {
                        for (const key of Object.keys(next)) {
                            if (NPC_EXTRACT_PROTECTED.has(key)) delete next[key];
                        }
                    }
                    return next;
                });
                const result = agentNpcLedger.apply(
                    { 人物: patches },
                    { floor: null, day: worldDay(), source: '世界书', fillEmpty: !overwrite },
                );
                if (result.changed) filled += 1;
            } catch (error) {
                failed.push(`${record.name}（${error?.message ?? error}）`);
            }
        }
        if (filled) persistNpcLedger();
    } finally {
        npcRecordRunning = false;
    }
    const bits = [`按世界书补了 ${filled} 个人`];
    if (missed.length) bits.push(`设定库里没找到：${missed.join('、')}`);
    if (failed.length) bits.push(`这次没抽出来：${failed.join('、')}`);
    setNpcLedgerStatus(`${bits.join('；')}。`);
    return { status: 'extracted', filled, missed, failed };
}

/** 记录员这一路用哪套连接、哪些生成参数：全在“人物簿”页可改，留空/0 就沿用全局。 */
function npcLedgerSettings() {
    const settings = currentSettings();
    const npc = settings.npc ?? {};
    const every = Number(npc.ledgerEvery);
    const budget = Number(npc.ledgerBudget);
    const maxFull = Number(npc.ledgerMaxFull);
    const floors = Number(npc.ledgerFloors);
    return {
        enabled: settings.enableNpcLedger !== false,
        auto: npc.ledgerAuto !== false,
        every: Number.isInteger(every) && every >= 1 ? Math.min(10, every) : 1,
        inject: npc.ledgerInject !== false,
        budget: Number.isInteger(budget) && budget > 0 ? Math.min(4000, budget) : 900,
        maxFull: Number.isInteger(maxFull) && maxFull > 0 ? Math.min(20, maxFull) : 6,
        floors: Number.isInteger(floors) && floors > 0 ? Math.min(12, floors) : 2,
        connection: npc.ledgerMode === 'custom' ? 'custom' : 'tavern',
        model: typeof npc.ledgerModel === 'string' ? npc.ledgerModel.trim() : '',
        baseUrl: typeof npc.ledgerBaseUrl === 'string' ? npc.ledgerBaseUrl.trim() : '',
        apiKey: typeof npc.ledgerApiKey === 'string' ? npc.ledgerApiKey.trim() : '',
        provider: npc.ledgerProvider === 'anthropic' ? 'anthropic' : npc.ledgerProvider === 'openai' ? 'openai' : '',
        temperature: impactParam(npc.ledgerTemperature, 2),
        maxTokens: Number.isInteger(npc.ledgerMaxTokens) && npc.ledgerMaxTokens > 0 ? Math.min(32768, npc.ledgerMaxTokens) : undefined,
        topP: impactParam(npc.ledgerTopP, 1),
        presencePenalty: impactParam(npc.ledgerPresencePenalty, 2),
        frequencyPenalty: impactParam(npc.ledgerFrequencyPenalty, 2),
        prompt: typeof npc.ledgerPrompt === 'string' && npc.ledgerPrompt.trim() ? npc.ledgerPrompt.trim() : NPC_RECORD_PROMPT,
    };
}

let lastNpcLedgerFloor = -1;
let lastNpcLedgerStatus = '还没有记账。生成结束后，人物记录员会把这一轮的人物变化写进档案。';
let lastNpcLedgerInjection = null;
let npcLedgerShown = 60;
let npcRecordRunning = false;

/** 人物簿跟着聊天走：换聊天读那一份，读不到就按空簿开局。 */
function restoreNpcLedgerFromChat() {
    lastNpcLedgerInjection = null;
    lastNpcLedgerFloor = -1;
    const record = hostStorage?.npcLedgerState?.();
    if (record?.status === 'ready' && record.value) {
        const result = agentNpcLedger.load(record.value);
        lastNpcLedgerFloor = Number.isInteger(record.value.lastFloor) ? record.value.lastFloor : -1;
        return result;
    }
    return agentNpcLedger.load({ records: [] });
}

function persistNpcLedger() {
    const snapshot = { ...agentNpcLedger.exportAll(), lastFloor: lastNpcLedgerFloor };
    const result = hostStorage?.saveNpcLedgerState?.(snapshot);
    if (result && typeof result.catch === 'function') result.catch(() => { /* 保存失败由下次记账重试 */ });
    return result;
}

function setNpcLedgerStatus(message) {
    lastNpcLedgerStatus = message;
    const panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null;
    const target = panel?.querySelector?.('[data-npc-ledger-status]');
    if (target) target.textContent = message;
}

/** 把“这条补丁”记进人物簿：面板手动记账和模型补丁走同一个入口。 */
function applyNpcLedgerPayload(payload, { source = '手动', floor = null } = {}) {
    const result = agentNpcLedger.apply(payload, { floor, day: worldDay(), source });
    if (result.status !== 'applied' && result.status !== 'ignored' && result.status !== 'empty') return result;
    if (result.created.length || result.changed) persistNpcLedger();
    return result;
}

/**
 * 生成后的记账：读最近几楼 + 人物簿索引，让记录员只写“这一轮发生的变化”。
 * 节奏按“上次记账之后又生成了几楼”算，换聊天/删楼都不会乱。
 */
async function runNpcLedgerRecord({ source = 'auto' } = {}) {
    const settings = npcLedgerSettings();
    if (!settings.enabled) { setNpcLedgerStatus('人物簿已关闭，这一轮没有记账。'); return { status: 'disabled' }; }
    if (npcRecordRunning) return { status: 'busy' };
    const chat = Array.isArray(getHostContext()?.chat) ? getHostContext().chat : [];
    const index = lastReplyIndex(chat);
    if (index < 0) { setNpcLedgerStatus('这一楼还没有正文，记账先跳过。'); return { status: 'no_reply' }; }
    const lastRecorded = Number.isInteger(lastNpcLedgerFloor) ? Math.min(lastNpcLedgerFloor, chat.length - 1) : -1;
    if (source === 'auto' && lastRecorded >= 0 && index - lastRecorded < settings.every) return { status: 'not_due' };
    if (agentLlmClient.configured() !== true) {
        setNpcLedgerStatus('还没配好模型连接：先在“模型与连接”页选好连接，人物记录员才能跑。');
        return { status: 'not_configured' };
    }
    npcRecordRunning = true;
    setNpcLedgerStatus('人物记录员正在读这一轮……');
    try {
        const floors = [];
        for (let cursor = chat.length - 1; cursor >= 0 && floors.length < settings.floors; cursor -= 1) {
            const message = chat[cursor];
            if (!message || typeof message.mes !== 'string' || !message.mes.trim()) continue;
            if (message.is_system === true) continue;
            floors.unshift({ role: message.is_user === true ? '玩家' : '角色', text: message.mes });
        }
        const raw = await agentLlmClient.complete({
            system: settings.prompt,
            user: buildNpcRecordUser({
                floors,
                records: agentNpcLedger.list(),
                day: worldDay(),
                worldbookLines: npcLedgerBookLines(floors),
                playerContext: npcPlayerContext(),
            }),
            jsonSchema: NPC_RECORD_JSON_SCHEMA,
            overrides: npcLedgerOverrides(settings),
        });
        const parsed = parseNpcRecordReply(raw);
        if (parsed.status === 'invalid') {
            setNpcLedgerStatus(`记录员这次的输出读不懂，档案没动：${parsed.reason}`);
            return { status: 'invalid', reason: parsed.reason };
        }
        if (parsed.status === 'empty') {
            lastNpcLedgerFloor = index;
            persistNpcLedger();
            setNpcLedgerStatus('这一轮没有人物变化。');
            return { status: 'empty' };
        }
        const result = applyNpcLedgerPayload(parsed.patches, { source: '正文', floor: index });
        lastNpcLedgerFloor = index;
        persistNpcLedger();
        const words = [];
        if (result.created.length) words.push(`新进 ${result.created.length} 人（${result.created.join('、')}）`);
        if (result.changed) words.push(`更新 ${result.changed} 人`);
        if (result.skipped?.length) words.push(`跳过 ${result.skipped.length} 条`);
        setNpcLedgerStatus(words.length ? `第 ${index + 1} 楼记完：${words.join('，')}。` : '这一轮没有人物变化。');
        try { refreshNpcLedgerPage(); } catch { /* 面板没开时忽略 */ }
        return { status: 'applied', result };
    } catch (error) {
        const message = error?.code === 'llm_custom_not_configured'
            ? '记录员设成了“自定义模型”，但接口地址或模型名还没填全（填在“人物簿 → 记录员参数”里，或改回跟随酒馆）。'
            : `记账失败：${error?.message ?? error}`;
        setNpcLedgerStatus(message);
        return { status: 'failed', reason: String(error?.message ?? error) };
    } finally {
        npcRecordRunning = false;
    }
}

/** 生成前把人物档案写进正文提示词：只写“这一幕用得上的人”，不整本倒出去。 */
function writeNpcLedgerInjectionForPrompt() {
    const settings = npcLedgerSettings();
    if (!settings.enabled || !settings.inject) { agentNpcLedgerInjection.clear(); return { status: 'disabled' }; }
    const probe = agentNpcLedgerInjection.inspect();
    if (probe.status !== 'ready') return probe;
    const built = agentNpcLedger.injection({ budget: settings.budget, maxFull: settings.maxFull });
    lastNpcLedgerInjection = { ...built, at: new Date().toISOString() };
    if (!built.text) { agentNpcLedgerInjection.clear(); return { status: 'empty' }; }
    return agentNpcLedgerInjection.write({ text: built.text }, { depth: injectionSettings().depth, maxChars: settings.budget + 200 });
}

function renderNpcLedgerList(panel) {
    const list = panel?.querySelector?.('[data-npc-ledger-list]');
    if (!list) return;
    const filter = panel.querySelector('[data-npc-ledger-filter]')?.value ?? '';
    const search = (panel.querySelector('[data-npc-ledger-search]')?.value ?? '').trim().toLowerCase();
    const status = agentNpcLedger.status();
    const records = agentNpcLedger.list()
        .filter(record => {
            if (filter === 'present' && record.presence !== '在场') return false;
            if (filter === 'absent' && record.presence === '在场') return false;
            if (filter === 'important' && record.importance !== '重要') return false;
            if (search) {
                const hay = [record.name, ...record.aliases, ...record.titles, record.identity].filter(Boolean).join(' ').toLowerCase();
                if (!hay.includes(search)) return false;
            }
            return true;
        })
        .sort((a, b) => (b.importance === '重要' ? 1 : 0) - (a.importance === '重要' ? 1 : 0) || b.favor - a.favor);
    if (!records.length) {
        list.replaceChildren(makeElement('li', 'dai-impact-empty', status.total ? '这个筛选里没有人物。' : '这一局还没有人物档案。'));
        return;
    }
    const injected = new Set(lastNpcLedgerInjection?.used ?? []);
    list.replaceChildren(...records.slice(0, npcLedgerShown).map(record => {
        const item = makeElement('li', 'dai-impact-item');
        if (injected.has(record.name)) item.classList.add('is-edited');
        const head = makeElement('div', 'dai-impact-item-head');
        head.append(makeElement('span', 'dai-impact-mark', record.presence === '在场' ? '●' : '○'), makeElement('b', '', record.name));
        const actions = makeElement('span', 'dai-impact-actions');
        const presence = makeElement('button', 'dai-impact-edit', record.presence === '在场' ? '改不在场' : '改在场');
        presence.type = 'button';
        presence.dataset.npcLedgerPresence = record.name;
        const importance = makeElement('button', 'dai-impact-edit', record.importance === '重要' ? '降普通' : '标重要');
        importance.type = 'button';
        importance.dataset.npcLedgerImportance = record.name;
        const view = makeElement('button', 'dai-impact-edit', '看全文');
        view.type = 'button';
        view.dataset.npcLedgerView = record.name;
        const edit = makeElement('button', 'dai-impact-edit', '补一笔');
        edit.type = 'button';
        edit.dataset.npcLedgerEdit = record.name;
        const forget = makeElement('button', 'dai-impact-edit is-danger', '删除');
        forget.type = 'button';
        forget.dataset.npcLedgerForget = record.name;
        const reextract = makeElement('button', 'dai-impact-edit', '重抽');
        reextract.type = 'button';
        reextract.dataset.npcLedgerExtract = record.name;
        reextract.title = '按世界书重写这个人的身份/外貌/身体/性格/资产；好感、流水、态度、处境不动。';
        actions.append(presence, importance, reextract, view, edit, forget);
        head.append(actions);
        item.append(head);
        const meta = [record.presence === '在场' ? '在场' : '不在场', record.importance === '重要' ? '重要' : '普通', `好感 ${record.favor}（${favorLabel(record.favor) || '未定'}）`];
        if (record.location) meta.push(record.location);
        if (record.identity) meta.push(record.identity);
        item.append(makeElement('small', 'dai-impact-meta', meta.join(' · ')));
        const detail = makeElement('pre', 'dai-impact-detail', agentNpcLedger.describe(record.name, 'full'));
        detail.hidden = true;
        detail.style.whiteSpace = 'pre-wrap';
        detail.dataset.npcLedgerDetail = record.name;
        item.append(detail);
        return item;
    }));
    if (records.length > npcLedgerShown) {
        const more = makeElement('li', 'dai-impact-item');
        const button = makeElement('button', 'dai-impact-edit', `再显示 ${Math.min(80, records.length - npcLedgerShown)} 个（共 ${records.length} 人）`);
        button.type = 'button';
        button.dataset.npcLedgerMore = '1';
        more.append(button);
        list.append(more);
    }
}

function refreshNpcLedgerPage(panel) {
    const target = panel ?? (typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null);
    if (!target) return;
    const status = agentNpcLedger.status();
    const summary = target.querySelector('[data-npc-ledger-summary]');
    if (summary) {
        summary.textContent = status.total
            ? `本局 ${status.total} 人 · 在场 ${status.present} · 重要 ${status.important} · 记到第 ${lastNpcLedgerFloor >= 0 ? lastNpcLedgerFloor + 1 : 0} 楼`
            : '这一局还没有人物档案。正文里出现第一个人之后，记录员会在这里建档。';
    }
    const statusLine = target.querySelector('[data-npc-ledger-status]');
    if (statusLine) statusLine.textContent = lastNpcLedgerStatus;
    renderNpcLedgerList(target);
}

/** 面板里的“记进人物簿”：接受一条补丁对象、一组补丁，或 { 人物: [...] }。 */
function applyNpcLedgerPatchFromPanel(panel) {
    const area = panel?.querySelector?.('[data-npc-ledger-patch]');
    const raw = typeof area?.value === 'string' ? area.value.trim() : '';
    if (!raw) { setNpcLedgerStatus('补丁栏是空的：先写一条再点记账。'); return { status: 'empty' }; }
    let payload;
    try {
        payload = JSON.parse(raw);
    } catch (error) {
        setNpcLedgerStatus(`补丁不是合法 JSON：${error?.message ?? error}`);
        return { status: 'invalid' };
    }
    const items = Array.isArray(payload) ? payload.length : (Array.isArray(payload?.人物) ? payload.人物.length : (payload && typeof payload === 'object' ? 1 : 0));
    if (!items) { setNpcLedgerStatus('补丁里没有可记的人。'); return { status: 'invalid' }; }
    const result = applyNpcLedgerPayload(payload, { source: '手填' });
    if (!result.applied.length) { setNpcLedgerStatus('这条补丁没有认出的字段，档案没动。'); return result; }
    const words = [];
    if (result.created.length) words.push(`新进 ${result.created.join('、')}`);
    if (result.changed) words.push(`更新 ${result.changed} 人`);
    if (result.ignored.length) words.push(`忽略 ${result.ignored.length} 个字段`);
    setNpcLedgerStatus(`手动记账完成：${words.join('，')}。`);
    if (area) area.value = '';
    refreshNpcLedgerPage(panel);
    return result;
}



/** 取“玩家这一轮说的话 + 最近几楼”，给挑选员判断这一幕的情境（默认 6 楼，可在设置里调）。 */
function impactConversation(chat, limit = 6) {
    const messages = Array.isArray(chat) ? chat : [];
    const want = Number.isInteger(limit) && limit > 0 ? Math.min(12, limit) : 6;
    const floors = [];
    let draft = '';
    for (let index = messages.length - 1; index >= 0 && floors.length < want; index -= 1) {
        const message = messages[index];
        if (!message || typeof message.mes !== 'string' || !message.mes.trim()) continue;
        if (message.is_system === true) continue;
        const body = message.mes.trim();
        if (message.is_user === true && !draft) draft = body;
        floors.unshift({ role: message.is_user === true ? '玩家' : '角色', text: body });
    }
    return { draft, floors };
}

let lastImpactInjection = null; // { signature, text, status, via, usedIds }：同一轮只挑一次，避免拦截器重复调用白花钱
/** 最近一本轮真的进了正文的编号：账本页据此标“本轮已注入”。 */
let lastInjectedIds = [];
// 账本页面分页：库不设上限，页面上先画这么多，点“显示更多”再续，避免一次塞几千条把面板拖慢。
let impactShown = 100;
let impactArchiveShown = 60;

/** 叫挑选员：从账本里挑这一幕用得上的影响。失败时返回非 ok，由调用方回落到脚本挑选。 */
async function pickImpactsForPrompt({ snapshot, settings, chat }) {
    const plan = impactModelPlan(settings);
    if (agentLlmClient.configured() !== true && plan.inject.connection !== 'custom') return { status: 'unavailable' };
    const { draft, floors } = impactConversation(chat, settings.injectFloors);
    const raw = await agentLlmClient.complete({
        system: settings.injectPrompt,
        user: buildImpactInjectUser({ snapshot, records: snapshot.records, floors, draft, day: worldDay() }),
        jsonSchema: IMPACT_INJECT_SCHEMA,
        overrides: {
            connection: plan.inject.connection,
            model: plan.inject.model || undefined,
            custom: impactCustomConnection(plan.inject),
            temperature: plan.inject.temperature,
            maxTokens: plan.inject.maxTokens,
            topP: plan.inject.topP,
            presencePenalty: plan.inject.presencePenalty,
            frequencyPenalty: plan.inject.frequencyPenalty,
        },
    });
    return parseImpactSelect(raw, { records: snapshot.records });
}

/**
 * 生成前把“本局世界线被改成什么样”写进独立通道；库是空的就不占预算。
 * 默认先让模型挑“这一幕用得上”的（LLM 决定），挑不出来或模型不可用就按分量/日期脚本兜底，
 * 保证正文永远拿得到世界线，而不会因为一次接口失败就断掉。
 */
async function writeImpactInjectionForPrompt({ chat } = {}) {
    const settings = impactSettings();
    if (!settings.enabled || !settings.inject) { agentImpactPromptInjection.clear(); return { status: 'disabled' }; }
    const probe = agentImpactPromptInjection.inspect();
    if (probe.status !== 'ready') return probe;
    const snapshot = agentImpactRuntime.snapshot();
    if (!snapshot.records.length) { agentImpactPromptInjection.clear(); return { status: 'empty' }; }
    const day = worldDay();
    // 没传聊天就现取：公开入口（doupoAgent.impactInjection）与真实生成路径必须看同一份对话，
    // 否则“玩家这一轮说了什么”永远为空，挑选员会拿着上一幕的缓存一直用下去。
    const sourceChat = Array.isArray(chat) ? chat : (getHostContext()?.chat ?? []);
    const { draft, floors } = impactConversation(sourceChat);
    const plan = impactModelPlan(settings);
    const signature = [
        snapshot.version, snapshot.records.length, day, settings.injectBudget, settings.injectMaxLines,
        settings.injectSmart ? 'smart' : 'script', `${plan.inject.connection}:${plan.inject.model}`,
        draft.slice(0, 80), floors.length,
    ].join('|');
    if (lastImpactInjection && lastImpactInjection.signature === signature) {
        if (!lastImpactInjection.text) { agentImpactPromptInjection.clear(); return { status: lastImpactInjection.status, via: lastImpactInjection.via, usedIds: [] }; }
        lastInjectedIds = lastImpactInjection.usedIds ?? [];
        try { renderImpactLibrary(); } catch { /* 面板没开就算了 */ }
        return { ...agentImpactPromptInjection.write({ text: lastImpactInjection.text }, { depth: injectionSettings().depth, maxChars: 0 }), usedIds: lastInjectedIds };
    }
    let text = '';
    let usedIds = [];
    let via = 'script';
    let note = '';
    if (settings.injectSmart) {
        try {
            const picked = await pickImpactsForPrompt({ snapshot, settings, chat: sourceChat });
            if (picked.status === 'ok') {
                const detail = buildImpactInjectionFromPicksDetail(snapshot.records, picked.picks, { maxChars: settings.injectBudget, maxLines: settings.injectMaxLines, day });
                text = detail.text;
                usedIds = detail.usedIds;
                via = 'llm';
                note = picked.note;
            } else if (picked.status === 'empty') {
                // 模型明确说“这一幕用不上旧账”：这一轮不注入，而不是硬塞不相干的影响。
                lastImpactInjection = { signature, text: '', status: 'skipped', via: 'llm', note: picked.note, usedIds: [] };
                lastInjectedIds = [];
                agentImpactPromptInjection.clear();
                return { status: 'skipped', via: 'llm', note: picked.note, usedIds: [] };
            }
        } catch { /* 挑选失败回落到脚本挑选，正文不能因此丢掉世界线 */ }
    }
    if (!text) {
        const detail = buildImpactInjectionDetail(snapshot.records, { maxChars: settings.injectBudget, maxLines: 10, day });
        text = detail.text;
        usedIds = detail.usedIds;
    }
    if (!text) {
        lastImpactInjection = { signature, text: '', status: 'empty', via, usedIds: [] };
        lastInjectedIds = [];
        agentImpactPromptInjection.clear();
        return { status: 'empty', via, usedIds: [] };
    }
    lastImpactInjection = { signature, text, status: 'injected', via, note, usedIds };
    lastInjectedIds = usedIds;
    // 预算已在生成文本时截过，这里不再二次截断，免得多出“已按预算截断”的尾巴。
    const written = agentImpactPromptInjection.write({ text }, { depth: injectionSettings().depth, maxChars: 0 });
    try { renderImpactLibrary(); } catch { /* 面板没开就算了 */ }
    return { ...written, usedIds };
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
    try { await writeImpactInjectionForPrompt({ chat }); } catch { /* 影响库注入失败不影响正文生成 */ }
    // 人物档案与影响库同属“这一局已经发生成什么样”，排在原著设定之前写，预算各算各的。
    try { writeNpcLedgerInjectionForPrompt(); } catch { /* 人物簿注入失败不影响正文生成 */ }
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
    const index = lastReplyIndex(chat);
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
    return { status: result.status, applied: result.applied.length, rejected: result.rejected.length, floor: index + 1 };
}

/** 最新一条 AI 楼层的下标；没有返回 -1。 */
function lastReplyIndex(chat) {
    const list = Array.isArray(chat) ? chat : [];
    for (let cursor = list.length - 1; cursor >= 0; cursor -= 1) {
        const message = list[cursor];
        if (!message || typeof message.mes !== 'string' || !message.mes.trim()) continue;
        if (message.is_user === true || message.is_system === true) continue;
        return cursor;
    }
    return -1;
}

function currentVolumeForWorld() {
    const settings = currentSettings();
    const panel = Number.isInteger(settings.setting?.progress) && settings.setting.progress > 0 ? settings.setting.progress : null;
    if (panel !== null) return panel;
    const auto = Number.isInteger(settings.facts?.currentVolume) && settings.facts.currentVolume > 0 ? settings.facts.currentVolume : null;
    return auto;
}

/** 行动结算页的分类折叠区：一个类别一个 <details>，默认收起，点开改提示词。 */
const SETTLE_CATEGORY_HTML = SETTLE_CATEGORIES.map(category => `
                        <details class="dai-settle-category"><summary><span class="dai-feature-icon">➜</span><span><b>${category.label}</b><small>${category.summary}</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>规则正文</b><small>模型判定这类行动时收到的 system 规则；保持"只输出 JSON"与 effects 字段名不变，清空恢复内置默认。</small></span><textarea data-setting="settle.prompt.${category.id}" rows="9" spellcheck="false" placeholder="点开后自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-prompt-default="settle:${category.id}">填入默认规则</button><small>${category.hint}</small></div></div></details>`).join('');

/** 行动结算分类判定的连接与参数：mode 选 custom 时带上一整套自定义接口与采样覆盖。 */
function settleSettings() {
    const settle = currentSettings().settle ?? {};
    const custom = settle.mode === 'custom';
    return {
        overrides: {
            connection: custom ? 'custom' : 'tavern',
            model: typeof settle.model === 'string' && settle.model.trim() ? settle.model.trim() : undefined,
            custom: custom ? {
                baseUrl: typeof settle.baseUrl === 'string' ? settle.baseUrl.trim() : '',
                apiKey: typeof settle.apiKey === 'string' ? settle.apiKey.trim() : '',
                provider: settle.provider === 'anthropic' ? 'anthropic' : settle.provider === 'openai' ? 'openai' : '',
                model: typeof settle.model === 'string' ? settle.model.trim() : '',
            } : undefined,
            temperature: impactParam(settle.temperature, 2),
            maxTokens: impactParam(settle.maxTokens, 32768),
            topP: impactParam(settle.topP, 1),
            presencePenalty: impactParam(settle.presencePenalty, 2),
            frequencyPenalty: impactParam(settle.frequencyPenalty, 2),
        },
        promptFor: categoryId => {
            const category = resolveCategory(categoryId);
            if (!category) return '';
            const customPrompt = settle?.prompt?.[category.id];
            return typeof customPrompt === 'string' && customPrompt.trim() ? customPrompt.trim() : category.prompt;
        },
    };
}

/** 世界决定的连接与参数：结构同结算，跟酒馆或整套自定义接口，0 ＝不指定。 */
function worldDecideSettings() {
    const world = currentSettings().world ?? {};
    const custom = world.decideMode === 'custom';
    return {
        enabled: world.decideEnabled !== false,
        auto: world.decideAuto !== false,
        maxFloors: Number.isInteger(world.decideMaxFloors) && world.decideMaxFloors > 0 ? Math.min(12, world.decideMaxFloors) : 6,
        maxEntries: Number.isInteger(world.decideMaxEntries) && world.decideMaxEntries >= 0 ? Math.min(40, world.decideMaxEntries) : 12,
        prompt: typeof world.decidePrompt === 'string' && world.decidePrompt.trim() ? world.decidePrompt.trim() : WORLD_DECIDE_PROMPT,
        overrides: {
            connection: custom ? 'custom' : 'tavern',
            model: typeof world.decideModel === 'string' && world.decideModel.trim() ? world.decideModel.trim() : undefined,
            custom: custom ? {
                baseUrl: typeof world.decideBaseUrl === 'string' ? world.decideBaseUrl.trim() : '',
                apiKey: typeof world.decideApiKey === 'string' ? world.decideApiKey.trim() : '',
                provider: world.decideProvider === 'anthropic' ? 'anthropic' : world.decideProvider === 'openai' ? 'openai' : '',
                model: typeof world.decideModel === 'string' ? world.decideModel.trim() : '',
            } : undefined,
            temperature: impactParam(world.decideTemperature, 2),
            maxTokens: impactParam(world.decideMaxTokens, 32768),
            topP: impactParam(world.decideTopP, 1),
            presencePenalty: impactParam(world.decidePresencePenalty, 2),
            frequencyPenalty: impactParam(world.decideFrequencyPenalty, 2),
        },
    };
}

function setWorldDecideStatus(message) {
    const panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null;
    const target = panel?.querySelector('[data-world-decide-status]');
    if (target) target.textContent = message;
}

/** 把一次决定的结果呈现到面板：note + 每条操作 ✓生效/✗被拒。 */
function renderWorldDecisionResult(decision, result) {
    const panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null;
    const target = panel?.querySelector('[data-world-decide-result]');
    if (!target) return;
    const rows = [];
    const note = typeof decision?.note === 'string' && decision.note.trim() ? decision.note.trim() : '（模型没有给说明）';
    rows.push({ text: `模型说明：${note}` });
    const applied = Array.isArray(result?.applied) ? result.applied : [];
    const rejected = Array.isArray(result?.rejected) ? result.rejected : [];
    for (const item of applied) rows.push({ text: `✓ ${item.summary}`, ok: true });
    for (const item of rejected) rows.push({ text: `✗ ${item.op}：${item.reason}`, ok: false });
    if (decision?.dropped > 0) rows.push({ text: `⚠ ${decision.dropped} 条格式坏的被丢弃`, ok: false });
    if (!applied.length && !rejected.length) rows.push({ text: decision?.status === 'empty' ? '模型判断本轮世界无变化。' : '模型没有给出可执行的操作。', ok: false });
    target.replaceChildren(...rows.map(row => {
        const item = makeElement('p', 'dai-turn-result');
        if (row.ok === false) item.dataset.ok = 'false';
        item.textContent = row.text;
        return item;
    }));
}

let worldDecideRunning = false;

/**
 * LLM 决定脚本执行的主入口：读聊天记录 + 世界书 + 世界台账 → 模型决定 →
 * 脚本逐条校验执行 → 结果呈现到面板。生成结束后自动跑，面板按钮可手动跑。
 */
async function runWorldDecision({ source = 'auto' } = {}) {
    const settings = worldDecideSettings();
    if (!settings.enabled) return { status: 'disabled' };
    if (worldDecideRunning) return { status: 'busy' };
    // 自定义连接有自己的地址和密钥，不依赖全局配置；跟随酒馆才需要先检查全局连接。
    if (settings.overrides.connection !== 'custom' && agentLlmClient.configured() !== true) {
        setWorldDecideStatus('模型连接未配置：先在“模型与连接”页选好连接。');
        return { status: 'not_configured' };
    }
    worldDecideRunning = true;
    setWorldDecideStatus('模型正在决定……');
    try {
        const context = getHostContext();
        const chat = Array.isArray(context?.chat) ? context.chat : [];
        const floors = [];
        for (let cursor = chat.length - 1; cursor >= 0 && floors.length < settings.maxFloors; cursor -= 1) {
            const message = chat[cursor];
            if (!message || typeof message.mes !== 'string' || !message.mes.trim()) continue;
            if (message.is_system === true) continue;
            floors.unshift({ role: message.is_user === true ? '玩家' : '角色', text: message.mes });
        }
        if (!floors.length) {
            setWorldDecideStatus('聊天里还没有内容，模型无从决定。');
            return { status: 'no_input' };
        }
        // 世界书侧输入：拿最近聊天去索引里匹配相关条目（只给编号|类别|标题|摘要，不铺全文）。
        const recentText = floors.map(floor => floor.text).join('\n');
        const hits = settings.maxEntries > 0 && agentFactsIndex.stats().total > 0
            ? agentFactsIndex.matchTokens(recentText, { limit: settings.maxEntries, volume: currentVolumeForWorld() })
            : [];
        const bookLines = hits.map(hit => {
            const entry = agentFactsIndex.get(hit.uid);
            return entry ? `${entry.uid}|${entry.category}|${entry.name}|${entry.summary}` : null;
        }).filter(Boolean);
        const user = buildDecideUser({ snapshot: agentWorldRuntime.snapshot(), floors, worldbookLines: bookLines });
        const raw = await agentLlmClient.complete({
            system: settings.prompt,
            user,
            jsonSchema: DECIDE_JSON_SCHEMA,
            overrides: settings.overrides,
        });
        const decision = parseDecision(raw);
        if (decision.status === 'invalid') {
            setWorldDecideStatus(`模型输出无法解析：${decision.error}`);
            return { status: 'invalid', error: decision.error };
        }
        const result = agentWorldRuntime.apply(decision.ops, { source: 'decide', floor: lastReplyIndex(chat) });
        persistWorld();
        if (!result.applied.length) agentWorldRuntime.note(decision.note || '模型判断本轮世界无变化。', { source: 'decide' });
        renderWorldDecisionResult(decision, result);
        setWorldDecideStatus(source === 'auto' ? '生成后自动决定完成。' : '决定完成。');
        refreshWorldPage();
            return { status: 'ok', decision, result };
    } catch (error) {
        setWorldDecideStatus(`决定失败：${error?.message ?? error}`);
        return { status: 'failed', reason: String(error?.message ?? error) };
    } finally {
        worldDecideRunning = false;
    }
}

let impactDecideRunning = false;
let lastImpactResult = null;

function setImpactStatus(message) {
    const panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null;
    const target = panel?.querySelector('[data-impact-decide-status]');
    if (target) target.textContent = message;
}

/**
 * 世界记录员：读“世界台账 + 影响库 + 世界书 + 最近聊天”，判断玩家让世界哪里真的不一样了，
 * 只回一张 JSON 清单；脚本逐条校验落账（impact-runtime），坏条目单独丢弃、不整批作废。
 * 生成结束后自动跑；面板按钮或命名空间也能手动触发。
 */
async function runImpactDecision({ source = 'auto' } = {}) {
    const settings = impactSettings();
    if (!settings.enabled || !settings.decideEnabled) return { status: 'disabled' };
    if (impactDecideRunning) return { status: 'busy' };
    const plan = impactModelPlan(settings);
    if (agentLlmClient.configured() !== true && plan.decide.connection !== 'custom') {
        setImpactStatus('模型连接未配置：先在“模型与连接”页选好连接。');
        return { status: 'not_configured' };
    }
    impactDecideRunning = true;
    try {
        const context = getHostContext();
        const chat = Array.isArray(context?.chat) ? context.chat : [];
        const floors = [];
        for (let cursor = chat.length - 1; cursor >= 0 && floors.length < settings.decideMaxFloors; cursor -= 1) {
            const message = chat[cursor];
            if (!message || typeof message.mes !== 'string' || !message.mes.trim()) continue;
            if (message.is_system === true) continue;
            floors.unshift({ role: message.is_user === true ? '玩家' : '角色', text: message.mes });
        }
        if (!floors.length) {
            setImpactStatus('聊天里还没有内容，记录员无从下手。');
            return { status: 'no_input' };
        }
        const recentText = floors.map(floor => floor.text).join('\n');
        const hits = settings.decideMaxEntries > 0 && agentFactsIndex.stats().total > 0
            ? agentFactsIndex.matchTokens(recentText, { limit: settings.decideMaxEntries, volume: currentVolumeForWorld() })
            : [];
        const bookLines = hits.map(hit => {
            const entry = agentFactsIndex.get(hit.uid);
            return entry ? `${entry.uid}|${entry.category}|${entry.name}|${entry.summary}` : null;
        }).filter(Boolean);
        // 决定要同时看“世界此刻什么样”和“玩家已经改出了什么”：台账给世界，records 给影响库。
        const worldSnapshot = agentWorldRuntime.snapshot();
        const impactSnapshot = agentImpactRuntime.snapshot();
        const raw = await agentLlmClient.complete({
            system: settings.prompt,
            user: buildImpactDecideUser({ snapshot: { ...worldSnapshot, records: impactSnapshot.records }, floors, worldbookLines: bookLines }),
            jsonSchema: IMPACT_JSON_SCHEMA,
            overrides: {
                connection: plan.decide.connection,
                model: plan.decide.model || undefined,
                custom: impactCustomConnection(plan.decide),
                temperature: plan.decide.temperature,
                maxTokens: plan.decide.maxTokens,
                topP: plan.decide.topP,
                presencePenalty: plan.decide.presencePenalty,
                frequencyPenalty: plan.decide.frequencyPenalty,
            },
        });
        const decision = parseImpactDecision(raw);
        if (decision.status === 'invalid') {
            setImpactStatus(`记录员输出无法解析：${decision.error}`);
            return { status: 'invalid', error: decision.error };
        }
        const result = agentImpactRuntime.apply(decision.ops, { source: 'decide', floor: lastReplyIndex(chat), day: worldDay() });
        persistImpact();
        if (!result.applied.length) agentImpactRuntime.note(decision.note || '世界线没有偏移。', { source: 'decide' });
        lastImpactResult = {
            at: new Date().toISOString(),
            source,
            note: decision.note,
            applied: result.applied,
            rejected: result.rejected,
            due: result.due,
            dropped: decision.dropped,
            day: worldDay(),
        };
        const summary = decision.note ? `｜${decision.note}` : '';
        setImpactStatus(result.applied.length
            ? `第 ${worldDay()} 天：记录 ${result.applied.length} 条世界影响${result.due.length ? `，${result.due.length} 条旧影响发酵` : ''}${summary}`
            : `世界线没有新的偏移${summary}`);
        return { status: 'ok', decision, result };
    } catch (error) {
        const message = error?.code === 'llm_custom_not_configured'
            ? '记录员设成了“自定义模型”，但接口地址或模型名还没填全（填在“世界影响 → 记录员与场记的模型”里，或改回跟随酒馆）。'
            : `世界记录失败：${error?.message ?? error}`;
        setImpactStatus(message);
        return { status: 'failed', reason: String(message) };
    } finally {
        impactDecideRunning = false;
        try { renderImpactLibrary(); } catch { /* 面板没开时忽略 */ }
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
    impacts: agentImpactRuntime,
    impactRuntime: agentImpactRuntime,
    impactInjection: options => writeImpactInjectionForPrompt(typeof options === 'object' && options ? options : {}),
    impactDecide: options => runImpactDecision(options),
    impactRestoreFromChat: () => restoreImpactFromChat(),
    impactStatus: () => agentImpactRuntime.status(),
    impactArchived: () => agentImpactRuntime.archived(),
    impactInjectedIds: () => lastInjectedIds.slice(),
    impactLast: () => lastImpactResult,
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
    npcLedger: agentNpcLedger,
    npcLedgerInjection: () => writeNpcLedgerInjectionForPrompt(),
    npcLedgerRecord: options => runNpcLedgerRecord(options),
    npcLedgerApply: (payload, context) => applyNpcLedgerPayload(payload, context),
    npcLedgerStatus: () => ({ ...agentNpcLedger.status(), lastFloor: lastNpcLedgerFloor, last: lastNpcLedgerStatus, injected: lastNpcLedgerInjection?.used ?? [] }),
    npcLedgerRestoreFromChat: () => restoreNpcLedgerFromChat(),
    npcLedgerFields: () => NPC_FIELDS.map(field => ({ key: field.key, label: field.label, group: field.group })),
    npcLedgerExtract: options => runNpcLedgerExtract(options),
    npcLedgerSetPlayerContext: provider => setNpcPlayerContextProvider(provider),
    npcLedgerFavorStep: FAVOR_STEP_MAX,
    npcFavorScale: () => FAVOR_SCALE.map(item => ({ ...item })),
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
        if (path.startsWith('impact.')) syncImpactLimits();
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

function applyLlmModeVisibility(panel, mode) {
    const block = panel?.querySelector('[data-llm-custom]');
    if (block) block.hidden = mode !== 'custom';
}

/** 世界影响两个模型：共用一个模型时收起场记那一行；跟随酒馆时模型名输入框不可用。 */
function applyImpactModelVisibility(panel) {
    if (!panel) return;
    const impact = currentSettings().impact ?? {};
    const split = impact.modelMode === 'split';
    const injectBlock = panel.querySelector('[data-impact-inject-model]');
    if (injectBlock) injectBlock.hidden = !split;
    // 自定义才需要地址/密钥/模型名；跟随酒馆时这几格灰掉，免得以为填了会生效。
    for (const [mode, fields] of [['decide', ['decideBaseUrl', 'decideApiKey', 'decideModel']], ['inject', ['injectBaseUrl', 'injectApiKey', 'injectModel']]]) {
        const custom = impact[`${mode}Mode`] === 'custom';
        for (const name of fields) {
            const input = panel.querySelector(`[data-setting="impact.${name}"]`);
            if (input) input.disabled = !custom;
        }
        const button = panel.querySelector(`[data-impact-models="${mode}"]`);
        if (button) button.disabled = !custom;
    }
}

/** 通用：某个功能的模型设置选了“跟随酒馆”时，地址/密钥/模型名与拉取按钮一起灰掉。 */
function applyFeatureModelVisibility(panel, { modeSetting, fieldNames, buttonAttr }) {
    if (!panel) return;
    const settings = currentSettings();
    const custom = fieldValue(settings, modeSetting) === 'custom';
    for (const name of fieldNames) {
        const input = panel.querySelector(`[data-setting="${name}"]`);
        if (input) input.disabled = !custom;
    }
    const button = panel.querySelector(`[${buttonAttr}]`);
    if (button) button.disabled = !custom;
}

function applySettleModelVisibility(panel) {
    return applyFeatureModelVisibility(panel, {
        modeSetting: 'settle.mode',
        fieldNames: ['settle.baseUrl', 'settle.apiKey', 'settle.model'],
        buttonAttr: 'data-settle-models',
    });
}

function applyWorldDecideModelVisibility(panel) {
    return applyFeatureModelVisibility(panel, {
        modeSetting: 'world.decideMode',
        fieldNames: ['world.decideBaseUrl', 'world.decideApiKey', 'world.decideModel'],
        buttonAttr: 'data-worlddecide-models',
    });
}

/** 拉取自定义接口的模型清单，填进模型名那格的候选列表：填了地址就不用再手抄模型名。 */
async function fetchModelList(panel, { read, status, list, target, button }) {
    const baseUrl = read('BaseUrl');
    if (!baseUrl) {
        if (status) status.textContent = '先填接口地址，再点拉取。';
        return;
    }
    button.disabled = true;
    if (status) status.textContent = '正在拉取模型……';
    try {
        const provider = /anthropic/i.test(baseUrl) ? 'anthropic' : '';
        const result = await listModels({ baseUrl, apiKey: read('ApiKey'), provider });
        if (result.status !== 'ok') {
            if (status) status.textContent = result.error || '接口没给出模型列表，可以直接手填模型名。';
            return;
        }
        if (list) {
            list.textContent = '';
            for (const model of result.models) {
                const option = document.createElement('option');
                option.value = model;
                list.appendChild(option);
            }
        }
        if (target && !target.value) {
            target.value = result.models[0];
            target.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (status) status.textContent = `拉到 ${result.models.length} 个模型，点模型名那一格就能选。`;
    } catch (error) {
        if (status) status.textContent = `拉取失败：${error?.message ?? error}`;
    } finally {
        button.disabled = false;
    }
}

async function fetchImpactModels(panel, role, button) {
    const prefix = role === 'inject' ? 'inject' : 'decide';
    return fetchModelList(panel, {
        read: name => {
            const input = panel.querySelector(`[data-setting="impact.${prefix}${name}"]`);
            return input ? input.value.trim() : '';
        },
        status: panel.querySelector(`[data-impact-models-status="${prefix}"]`),
        list: panel.querySelector(`#dai-impact-models-${prefix}`),
        target: panel.querySelector(`[data-setting="impact.${prefix}Model"]`),
        button,
    });
}

function readSettingInput(panel, path) {
    const input = panel.querySelector(`[data-setting="${path}"]`);
    return input ? input.value.trim() : '';
}

async function fetchSettleModels(panel, button) {
    return fetchModelList(panel, {
        read: name => name === 'Base' ? readSettingInput(panel, 'settle.baseUrl') : readSettingInput(panel, 'settle.apiKey'),
        status: panel.querySelector('[data-settle-models-status]'),
        list: panel.querySelector('#dai-settle-models'),
        target: panel.querySelector('[data-setting="settle.model"]'),
        button,
    });
}

async function fetchWorldDecideModels(panel, button) {
    return fetchModelList(panel, {
        read: name => name === 'Base' ? readSettingInput(panel, 'world.decideBaseUrl') : readSettingInput(panel, 'world.decideApiKey'),
        status: panel.querySelector('[data-worlddecide-models-status]'),
        list: panel.querySelector('#dai-worlddecide-models'),
        target: panel.querySelector('[data-setting="world.decideModel"]'),
        button,
    });
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
    // 可编辑提示词：设置里留空时把"当前生效的内置默认"直接铺进输入框，
    // 玩家看到的就是模型实际收到的规则；改了就存自己的，清空则恢复跟随默认。
    const promptDefaults = new Map([
        ['world.decidePrompt', WORLD_DECIDE_PROMPT],
        ['world.eventGuide', OPS_GUIDE],
        ['prompt.select', SELECT_RULES],
        ['prompt.lookup', LOOKUP_RULES],
        ['impact.prompt', IMPACT_DECIDE_PROMPT],
        ['impact.injectPrompt', IMPACT_INJECT_PROMPT],
        ...SETTLE_CATEGORIES.map(category => [`settle.prompt.${category.id}`, category.prompt]),
    ]);
    for (const [path, fallback] of promptDefaults) {
        const area = panel.querySelector(`[data-setting="${path}"]`);
        if (area && !String(area.value ?? '').trim()) area.value = fallback;
    }
    applyLlmModeVisibility(panel, settings.llm?.mode ?? 'tavern');
    applyImpactModelVisibility(panel);
    applySettleModelVisibility(panel);
    applyWorldDecideModelVisibility(panel);
    applyAppearance(settings);
    refreshControlDashboard();
    renderImpactLibrary(panel);
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
                    <button type="button" class="dai-nav-item" data-settings-page="npcledger"><span class="dai-nav-icon">☰</span><span><b>人物簿</b><small>每个人的档案与好感</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="impact"><span class="dai-nav-icon">⌁</span><span><b>世界影响</b><small>记录世界被改成了什么样</small></span></button>
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
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>请求来源</b><small>选“跟随酒馆”就不用再填密钥；选“自定义”才读下面的接口。</small></div><label class="dai-setting-row"><span><b>用哪个接口</b><small>跟随酒馆＝与正文同一套模型和密钥；自定义＝读下面的地址与密钥。</small></span><select data-setting="llm.mode"><option value="tavern">跟随酒馆当前 API</option><option value="custom">自定义接口</option></select></label><label class="dai-setting-row"><span><b>连接方式</b></span><select data-setting="llm.provider"><option value="openai-compatible">OpenAI 兼容接口</option><option value="anthropic">Anthropic 兼容接口</option><option value="custom">自定义</option></select></label><label class="dai-setting-row"><span><b>接口地址</b><small>独立接口的 Base URL；使用酒馆连接时可留空。</small></span><input type="url" data-setting="llm.baseUrl" placeholder="https://api.example.com/v1"></label><label class="dai-setting-row"><span><b>API Key</b><small>只保存到扩展设置，不写入聊天消息。</small></span><input type="password" data-setting="llm.apiKey" autocomplete="off" placeholder="留空表示不使用独立密钥"></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>生成参数</b><small>留空模型名称时沿用酒馆当前模型。</small></div><label class="dai-setting-row"><span><b>模型名称</b></span><input type="text" data-setting="llm.model" placeholder="沿用酒馆当前模型"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>Temperature</b><small>0 更稳定，2 更发散。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="llm.temperature"></label><label class="dai-setting-row"><span><b>最大输出 Token</b></span><input type="number" min="128" max="32768" step="128" data-setting="llm.maxTokens"></label></div><label class="dai-setting-row"><span><b>请求等待上限（毫秒）</b></span><input type="number" min="1000" max="600000" step="1000" data-setting="llm.timeoutMs"></label></div>
                    </section>
                    <section class="dai-settings-page" data-settings-section="facts" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 02</span><h3>原著设定</h3><p>把世界书条目变成“按需注入”的设定库：建索引、按卷出目录、模型点名、按预算注入正文提示词。</p></div><div class="dai-settings-card"><div class="dai-card-heading"><b>运行状态</b><small>打开这一页时读取，生成结束后也会刷新。</small></div><ul class="dai-status-list" data-facts-status><li><b>状态</b><span>正在读取……</span></li></ul></div><div class="dai-settings-card"><div class="dai-card-heading"><b>模型</b><small>“跟随酒馆”就用酒馆当前 API 和模型；选“自定义”才会读下面几项。</small></div><label class="dai-setting-row"><span><b>用哪个接口</b><small>跟随酒馆＝与正文同一套模型和密钥；自定义＝单独填接口。</small></span><select data-setting="llm.mode"><option value="tavern">跟随酒馆当前 API</option><option value="custom">自定义接口</option></select></label><div class="dai-llm-custom" data-llm-custom hidden><label class="dai-setting-row"><span><b>接口地址</b><small>OpenAI 兼容的 Base URL，填到 /v1 为止。</small></span><input type="url" data-setting="llm.baseUrl" placeholder="https://api.example.com/v1"></label><label class="dai-setting-row"><span><b>API Key</b><small>只保存到扩展设置，不写进聊天记录。</small></span><input type="password" data-setting="llm.apiKey" autocomplete="off" placeholder="留空表示该接口不需要密钥"></label><label class="dai-setting-row"><span><b>模型名称</b><small>自定义接口必填；跟随酒馆时可留空。</small></span><input type="text" data-setting="llm.model" placeholder="例如 deepseek-chat"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>Temperature</b><small>0 更稳，2 更发散。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="llm.temperature"></label><label class="dai-setting-row"><span><b>最大输出 Token</b></span><input type="number" min="128" max="32768" step="128" data-setting="llm.maxTokens"></label><label class="dai-setting-row"><span><b>单次等待上限（毫秒）</b><small>超时就算这一轮选条失败。</small></span><input type="number" min="1000" max="600000" step="1000" data-setting="llm.timeoutMs"></label><label class="dai-setting-row"><span><b>top_p</b><small>0–1；0 ＝不指定，用接口自己的设置。</small></span><input type="number" min="0" max="1" step="0.05" data-setting="llm.topP" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>存在惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="llm.presencePenalty" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>频率惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="llm.frequencyPenalty" placeholder="0 = 不指定"></label></div></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>检索库状态</b><small>只读世界书，不改原文件；改完世界书后重新导入一次即可。</small></div><p class="dai-turn-result" data-worldbook-stats role="status">还没有导入。</p><label class="dai-setting-row"><span><b>世界书名称</b><small>填世界书面板里的名字；点“扫描”可以自动列出可选名称。</small></span><input type="text" list="dai-worldbook-options" data-setting="setting.worldbook" placeholder="例如 斗破世界书"></label><datalist id="dai-worldbook-options"></datalist><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-agent-worldbook-scan>扫描可选世界书</button><button type="button" class="dai-secondary-button" data-agent-worldbook-import>从世界书导入</button></div><p class="dai-turn-result" data-agent-worldbook-status role="status">还没有导入。</p></div><div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">◈</span><span><b>启用原著设定注入</b><small>每轮先按本轮输入召回候选，再由模型挑出真正要用的设定，按预算注入正文提示词。</small></span><input type="checkbox" data-setting="setting.enabled"></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>当前剧情卷</b><small>自动＝按本轮输入和模型估计；手动选＝锁定这一卷，识别到更后面的卷也会被压回。</small></span><select data-setting="setting.progress"><option value="0">自动判定</option><option value="1">第 1 卷</option><option value="2">第 2 卷</option><option value="3">第 3 卷</option><option value="4">第 4 卷</option><option value="5">第 5 卷</option><option value="6">第 6 卷</option><option value="7">第 7 卷</option><option value="8">第 8 卷</option><option value="9">第 9 卷</option><option value="10">第 10 卷</option><option value="11">第 11 卷</option><option value="12">第 12 卷</option><option value="13">第 13 卷</option><option value="14">第 14 卷</option><option value="15">第 15 卷</option><option value="16">第 16 卷</option><option value="17">第 17 卷</option><option value="18">第 18 卷</option><option value="19">第 19 卷</option><option value="20">第 20 卷</option><option value="21">第 21 卷</option></select></label><label class="dai-setting-row"><span><b>单次注入字数</b><small>0 = 不限制，选中几条就注入几条全文。</small></span><input type="number" min="0" max="4000" step="100" data-setting="setting.injectionBudget"></label><label class="dai-setting-row"><span><b>单次最多条目</b></span><input type="number" min="1" max="24" step="1" data-setting="setting.maxItems"></label></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>注入通道</b><small data-injection-status role="status">打开这一页时检测。</small></div><div class="dai-setting-grid"><label class="dai-setting-row dai-setting-toggle"><span><b>启用注入</b><small>关闭后不往提示词里写任何原著内容，正文照常生成。</small></span><input type="checkbox" data-setting="injection.enabled"></label><label class="dai-setting-row"><span><b>插入深度</b><small>从最新一楼往回数；0 表示紧贴末尾、离生成最近。</small></span><input type="number" min="0" max="99" step="1" data-setting="injection.depth"></label><label class="dai-setting-row"><span><b>最大字数</b><small>0 = 不截断；填了才在写入时截断。</small></span><input type="number" min="0" max="8000" step="100" data-setting="injection.maxChars"></label></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>旧版资料查询（已退役）</b><small>新链路不再调用它；保留这几个开关只为对照旧行为，正常使用保持关闭。</small></div><div class="dai-feature-toggle"><span class="dai-feature-icon">▤</span><span><b>启用旧资料查询</b><small>关闭后不会调用 facts-query 模块。</small></span><input type="checkbox" data-setting="enableFactsLibrary"></div><label class="dai-setting-row"><span><b>资料来源</b><small>旧链路只会读取已经登记的项目资料。</small></span><select data-setting="facts.sourceMode"><option value="registered">已登记资料</option><option value="chat">当前聊天上下文</option><option value="both">资料 + 当前聊天</option></select></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>单次最多条目</b></span><input type="number" min="1" max="100" step="1" data-setting="facts.maxEntries"></label><label class="dai-setting-row dai-setting-toggle"><span><b>允许未核验资料</b><small>关闭时只使用已确认事实。</small></span><input type="checkbox" data-setting="facts.includeUnverified"></label></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>选条提示词</b><small>模型判断“本轮要用哪些原著条目”时收到的 system 指令。打开页面显示的就是当前生效的正文，直接改即可；清空则恢复内置默认；MAX_PICKS 会换成每条上限。</small></div><label class="dai-setting-row"><span><b>规则正文</b><small>改完下一轮生效，不用重启。</small></span><textarea data-setting="prompt.select" rows="9" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-prompt-default>填入默认规则</button><small>默认规则含“只选必须用到、不许编 uid、只输出 JSON”。</small></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>卷外点选提示词</b><small>模型在目录里找不到、报出名字后，脚本搜到候选再问它一次时用的 system 指令。打开页面显示的就是当前生效的正文，直接改即可；清空则恢复内置默认。</small></div><label class="dai-setting-row"><span><b>规则正文</b><small>只影响“卷外二次点选”，改完下一轮生效。</small></span><textarea data-setting="prompt.lookup" rows="7" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-prompt-default="lookup">填入默认规则</button><small>默认规则含“只从候选里挑、后续卷默认不选”。</small></div></div></section>
                    <section class="dai-settings-page" data-settings-section="action" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 03</span><h3>行动结算</h3><p>把玩家行动拆成条件、结果和资源变化候选，再决定是否提交。</p></div><div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">➜</span><span><b>启用行动结算（总开关）</b><small>关闭后行动不再结算：不拆条件、不算数值变化，也不再要求确认行动细节；正文照常生成，状态保持原样。</small></span><input type="checkbox" data-setting="enableActionResolution"></div><label class="dai-setting-row dai-setting-toggle"><span><b>提交前要求确认</b><small>只生成候选，不自动写入状态。</small></span><input type="checkbox" data-setting="action.requireConfirmation"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>最多候选结果</b></span><input type="number" min="1" max="20" step="1" data-setting="action.maxCandidates"></label><label class="dai-setting-row dai-setting-toggle"><span><b>显示资源变化预览</b><small>在确认前展示影响范围。</small></span><input type="checkbox" data-setting="action.showCostPreview"></label></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>结算判定的模型</b><small>分类判定（丹药/修炼/伤害/通用）独立调用用的连接与参数。“跟随酒馆”＝直接用酒馆当前连接与模型；“自定义”＝自己填接口地址、密钥、模型名，填好地址点“拉取模型”从列表里选。温度、输出上限、top_p 和两个惩罚项填 0 表示不指定，沿用酒馆或“模型与连接”页；跟随酒馆时这些值只在这一次判定期间临时生效，结束立刻还原。</small></div><label class="dai-setting-row"><span><b>用哪套连接</b><small>跟随酒馆＝与正文同一套；自定义＝下面这几项。</small></span><select data-setting="settle.mode"><option value="tavern">跟随酒馆当前设置</option><option value="custom">自定义模型</option></select></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>接口地址</b><small>选“自定义”才用得上；留空沿用“模型与连接”页。</small></span><input type="text" data-setting="settle.baseUrl" placeholder="https://api.example.com/v1"></label><label class="dai-setting-row"><span><b>接口密钥</b><small>选“自定义”才用得上；留空沿用“模型与连接”页。</small></span><input type="password" data-setting="settle.apiKey" placeholder="留空沿用“模型与连接”页"></label><label class="dai-setting-row"><span><b>模型名</b><small>填好地址后点“拉取模型”挑一个，也可以手填。</small></span><input type="text" data-setting="settle.model" list="dai-settle-models" placeholder="例如 deepseek-chat"><datalist id="dai-settle-models"></datalist></label></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>温度</b><small>0–2；0 ＝不指定。判定求稳可以填 0.2。</small></span><input type="number" min="0" max="2" step="0.05" data-setting="settle.temperature" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>最大输出</b><small>tokens；0 ＝不指定。</small></span><input type="number" min="0" max="32768" step="64" data-setting="settle.maxTokens" placeholder="0 = 不指定"></label></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>top_p</b><small>0–1；0 ＝不指定。</small></span><input type="number" min="0" max="1" step="0.05" data-setting="settle.topP" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>存在惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="settle.presencePenalty" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>频率惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="settle.frequencyPenalty" placeholder="0 = 不指定"></label></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-settle-models>拉取模型</button><small role="status" data-settle-models-status></small></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>分类判定与提示词</b><small>行动解析先定类别（丹药/修炼/伤害/通用），再由对应类别的提示词独立判一次，脚本按类别规则逐条复核。点开一类修改它的规则；改完下一轮生效，不用重启。</small></div>${SETTLE_CATEGORY_HTML}</div></section>
                    <section class="dai-settings-page" data-settings-section="world" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 04</span><h3>世界运转</h3><p>世界时间和事件由模型在正文末尾下指令、脚本核验后记账；这一页是台账展示和手动控制。</p></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>世界时间与现状</b><small>随每轮生成自动更新；也可在这里手动调整。</small></div><p class="dai-state-strip" data-world-time>还没有载入世界。</p><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-world-advance="1">推进 1 天</button><button type="button" class="dai-secondary-button" data-world-advance="7">推进 7 天</button><input type="number" min="1" max="365" step="1" data-world-days placeholder="天数" aria-label="自定义推进天数"><button type="button" class="dai-secondary-button" data-world-advance-custom>推进</button></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>改为第几天</b><small>直接设定时钟，用于修正跳变。</small></span><input type="number" min="1" max="99999" step="1" data-world-setday placeholder="如 30"></label><button type="button" class="dai-secondary-button" data-world-setday-apply>设定</button></div></div><div class="dai-card-heading" style="margin-top:0.5rem;"><b>世界信息</b><small>时期、所在地、天气由剧情更新；名声/通缉度随玩家行为变化，都可手动修正。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>时期</b></span><input type="text" data-world-info="era" placeholder="如 萧家废物时期"></label><button type="button" class="dai-secondary-button" data-world-info-set="era">设定</button><label class="dai-setting-row"><span><b>所在地</b></span><input type="text" data-world-info="location" placeholder="如 乌坦城"></label><button type="button" class="dai-secondary-button" data-world-info-set="location">设定</button><label class="dai-setting-row"><span><b>天气</b></span><input type="text" data-world-info="weather" placeholder="如 晴"></label><button type="button" class="dai-secondary-button" data-world-info-set="weather">设定</button><label class="dai-setting-row"><span><b>名声</b><small>行侠立功上涨；留空为清空。</small></span><input type="text" data-world-info="reputation" placeholder="如 乌坦城小有名气"></label><button type="button" class="dai-secondary-button" data-world-info-set="reputation">设定</button><label class="dai-setting-row"><span><b>通缉度</b><small>作恶树敌上涨；留空为清空。</small></span><input type="text" data-world-info="wanted" placeholder="如 被米特尔家族记恨"></label><button type="button" class="dai-secondary-button" data-world-info-set="wanted">设定</button></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>主角身边的事件</b><small>模型会看到这些并把它们织进剧情；了结后从注入里退场。</small></div><div class="dai-world-events" data-world-events-near></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>世界大事</b><small>大陆层面的事件；重大的会标星，置顶的不参与上限清理。</small></div><div class="dai-world-events" data-world-events-world></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>手动登记事件</b><small>模型漏记时在这里补一笔，格式与模型指令一致。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>范围</b></span><select data-world-add-scope><option value="near">主角身边</option><option value="world">世界大事</option></select></label><label class="dai-setting-row"><span><b>分量</b></span><select data-world-add-weight><option value="minor">普通</option><option value="major">重大</option><option value="rumor">传闻（未证实）</option></select></label></div><label class="dai-setting-row"><span><b>事件内容</b><small>一句话说清发生了什么，不拘题材。</small></span><input type="text" data-world-add-text placeholder="例：城东连着三家铺子夜里失窃"></label><label class="dai-setting-row"><span><b>依据</b><small>它从哪来：哪楼、谁、什么事引出的。</small></span><input type="text" data-world-add-basis placeholder="例：上一楼酒馆闲谈提到的失窃传闻"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>有效期（天）</b><small>留空长期有效；到期自动了结。</small></span><input type="number" min="1" max="90" step="1" data-world-add-days placeholder="如 5"></label></div><button type="button" class="dai-secondary-button" data-world-add>登记事件</button></div>
                        <div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">◌</span><span><b>启用世界事件系统</b><small>关闭后不再读模型指令、不再注入世界现状。</small></span><input type="checkbox" data-setting="world.eventEnabled"></div><label class="dai-setting-row dai-setting-toggle"><span><b>注入世界现状</b><small>生成前把时钟、现状和进行中的事件写进提示词。</small></span><input type="checkbox" data-setting="world.eventInject"></label><label class="dai-setting-row"><span><b>现状注入字数上限</b><small>超预算先丢事件，保住时钟；0 为默认 900。</small></span><input type="number" min="0" max="4000" step="100" data-setting="world.eventBudget"></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>指令指南</b><small>降级模式（关闭自动决定）时随现状注入的规则正文。打开页面显示的就是当前生效的正文，直接改即可；清空则恢复内置默认。</small></div><label class="dai-setting-row"><span><b>规则正文</b><small>事件取材规则、时限要求都写在这里，可按你的玩法改写。</small></span><textarea data-setting="world.eventGuide" rows="9" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-world-guide-default>填入默认规则</button><small>默认规则含“事件要有依据、不照搬原著、时限必带 days”。</small></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>模型决定（LLM 决定脚本执行）</b><small>生成结束后，模型读最近聊天 + 相关世界书条目 + 世界台账做一次独立决定，输出严格 JSON，脚本逐条校验执行并显示在这里。</small></div><div class="dai-feature-toggle"><span class="dai-feature-icon">◉</span><span><b>启用模型决定</b><small>关闭后退回“只认正文指令块”的降级模式。</small></span><input type="checkbox" data-setting="world.decideEnabled"></div><label class="dai-setting-row dai-setting-toggle"><span><b>每轮生成后自动决定</b><small>关闭后只能点“让模型决定一次”手动跑。</small></span><input type="checkbox" data-setting="world.decideAuto"></label><label class="dai-setting-row"><span><b>决定用哪套连接</b><small>跟随酒馆＝与正文同一套；“自定义”＝下面这几项，填好地址点“拉取模型”挑模型。</small></span><select data-setting="world.decideMode"><option value="tavern">跟随酒馆当前设置</option><option value="custom">自定义模型</option></select></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>决定接口地址</b><small>选“自定义”才用得上；留空沿用“模型与连接”页。</small></span><input type="text" data-setting="world.decideBaseUrl" placeholder="https://api.example.com/v1"></label><label class="dai-setting-row"><span><b>决定接口密钥</b><small>选“自定义”才用得上；留空沿用“模型与连接”页。</small></span><input type="password" data-setting="world.decideApiKey" placeholder="留空沿用“模型与连接”页"></label><label class="dai-setting-row"><span><b>决定用模型</b><small>填好地址后点“拉取模型”挑一个，也可以手填；跟随酒馆时酒馆静默接口不收模型名。</small></span><input type="text" data-setting="world.decideModel" list="dai-worlddecide-models" placeholder="留空沿用当前模型"><datalist id="dai-worlddecide-models"></datalist></label></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>决定温度</b><small>0–2；0 ＝不指定，沿用酒馆/全局。</small></span><input type="number" min="0" max="2" step="0.05" data-setting="world.decideTemperature" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>决定最大输出</b><small>tokens；0 ＝不指定。</small></span><input type="number" min="0" max="32768" step="64" data-setting="world.decideMaxTokens" placeholder="0 = 不指定"></label></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>决定 top_p</b><small>0–1；0 ＝不指定。</small></span><input type="number" min="0" max="1" step="0.05" data-setting="world.decideTopP" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>决定存在惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="world.decidePresencePenalty" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>决定频率惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="world.decideFrequencyPenalty" placeholder="0 = 不指定"></label></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-worlddecide-models>拉取模型</button><small role="status" data-worlddecide-models-status></small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>喂最近几楼聊天</b></span><input type="number" min="1" max="12" step="1" data-setting="world.decideMaxFloors"></label><label class="dai-setting-row"><span><b>世界书条目上限</b><small>按本轮聊天匹配相关条目，0 = 不带世界书。</small></span><input type="number" min="0" max="40" step="1" data-setting="world.decideMaxEntries"></label></div><p class="dai-turn-result" data-world-decide-status role="status">还没有运行。生成结束后会自动决定。</p><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-world-decide-run>让模型决定一次</button></div><div class="dai-world-decide-result" data-world-decide-result></div><div class="dai-card-heading"><b>决定提示词</b><small>模型做决定时收到的 system 规则。打开页面显示的就是当前生效的正文，直接改即可；清空则恢复内置默认。改写时保持“只输出 JSON”和操作字段名不变。</small></div><label class="dai-setting-row"><span><b>规则正文</b><small>事件取材、传闻、机遇危机、名声通缉的规则都在这里，可按玩法改写。</small></span><textarea data-setting="world.decidePrompt" rows="10" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-world-decide-default>填入默认规则</button><small>默认规则含“事件要有依据、传闻不当事实、机遇危机偶尔投放”。</small></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>世界指令流水</b><small>最近几批指令的执行结果；重 roll 一楼会先撤销它上一版指令。</small></div><div class="dai-world-journal" data-world-journal></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>旧链路（手动结算）</b><small>旧版"面板里点结算"链路的设置，与新事件系统互不干扰。</small></div><div class="dai-feature-toggle"><span class="dai-feature-icon">◌</span><span><b>启用旧链路世界推进</b><small>关闭后不会调用 world-advance 模块。</small></span><input type="checkbox" data-setting="enableWorldProgress"></div><label class="dai-setting-row dai-setting-toggle"><span><b>允许自动推进</b><small>收到时间推进请求时才会生效。</small></span><input type="checkbox" data-setting="world.autoAdvance"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>默认推进分钟数</b></span><input type="number" min="1" max="1440" step="1" data-setting="world.tickMinutes"></label><label class="dai-setting-row dai-setting-toggle"><span><b>保留未确认候选</b><small>不把推测直接当成世界事实。</small></span><input type="checkbox" data-setting="world.preserveUnconfirmed"></label></div></div></section>
                    <section class="dai-settings-page" data-settings-section="npc" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 05</span><h3>NPC 决策</h3><p>控制相关人物的有限决策候选，不替 NPC 直接越过确认边界。</p></div><div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">♙</span><span><b>启用 NPC 自主决策</b><small>控制人物候选计划是否参与调度。</small></span><input type="checkbox" data-setting="enableNpcAutonomy"></div><label class="dai-setting-row dai-setting-toggle"><span><b>提交前要求确认</b><small>候选计划必须经过确认才可继续。</small></span><input type="checkbox" data-setting="npc.requireConfirmation"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>最多候选计划</b></span><input type="number" min="1" max="20" step="1" data-setting="npc.maxCandidates"></label><label class="dai-setting-row dai-setting-toggle"><span><b>允许人物冲突候选</b><small>保留冲突供上层处理。</small></span><input type="checkbox" data-setting="npc.allowConflicts"></label></div></div></section>
                    <section class="dai-settings-page" data-settings-section="npcledger" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 06</span><h3>人物簿</h3><p>每个人一格，按同一套格式记：身份、外貌、修为、性格、对你的好感、称呼、资产、处境、秘密和经历流水。正文写完后由“人物记录员”补一笔，下一楼再按“在场 × 重要”决定给正文模型看多少人、看多少细节。</p></div>
                        <div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">☰</span><span><b>启用人物簿</b><small>关掉后不记账、不注入；已经记下的档案仍留在聊天存档里，不会被删。</small></span><input type="checkbox" data-setting="enableNpcLedger"></div><label class="dai-setting-row dai-setting-toggle"><span><b>生成后自动记账</b><small>每轮正文结束后让“人物记录员”读最近两楼，把这一轮的变化记进档案；关掉后只能手动记一次。</small></span><input type="checkbox" data-setting="npc.ledgerAuto"></label><label class="dai-setting-row"><span><b>记账节奏</b><small>每轮都记更像实时，但每轮多一次小调用；每三轮更省，代价是中间两轮的变化要等下次记账才进档。</small></span><select data-setting="npc.ledgerEvery"><option value="1">每轮生成后</option><option value="2">每两轮生成后</option><option value="3">每三轮生成后</option></select></label><label class="dai-setting-row dai-setting-toggle"><span><b>把人物档案写进正文提示词</b><small>关掉后只记账、不告诉正文模型——人物就会“忘了自己身上发生过什么”。</small></span><input type="checkbox" data-setting="npc.ledgerInject"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>注入字数预算</b><small>每轮最多花多少字写人物档案；超了就把最不重要的人先降成一行。</small></span><input type="number" min="0" max="4000" step="100" data-setting="npc.ledgerBudget"></label><label class="dai-setting-row"><span><b>全字段最多几个人</b><small>“在场且重要”的人按完整档案写，超出这个数就只写一行。</small></span><input type="number" min="1" max="20" step="1" data-setting="npc.ledgerMaxFull"></label><label class="dai-setting-row"><span><b>记录员看最近几楼</b><small>看太少会漏，看太多会慢；两楼通常够判断这一轮谁动了。</small></span><input type="number" min="1" max="12" step="1" data-setting="npc.ledgerFloors"></label><label class="dai-setting-row"><span><b>记账温度</b><small>要稳，0.2~0.4 比较合适；填 0 表示不指定，沿用全局。</small></span><input type="number" min="0" max="2" step="0.05" data-setting="npc.ledgerTemperature"></label></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>记录员参数</b><small>这一路小调用单独用哪套连接、哪些生成参数，都可以自己填；“跟随酒馆”就用“模型与连接”页的设置，填 0 或留空表示不指定。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>用哪套连接</b><small>跟随酒馆＝用当前聊天模型；自定义＝填下面的地址、密钥和模型名。</small></span><select data-setting="npc.ledgerMode"><option value="tavern">跟随酒馆当前设置</option><option value="custom">自定义模型</option></select></label><label class="dai-setting-row"><span><b>接口地址</b><small>选“自定义”才用得上；留空沿用“模型与连接”页。</small></span><input type="text" data-setting="npc.ledgerBaseUrl" placeholder="https://api.example.com/v1"></label><label class="dai-setting-row"><span><b>接口密钥</b><small>选“自定义”才用得上；留空沿用“模型与连接”页。</small></span><input type="password" data-setting="npc.ledgerApiKey" placeholder="留空沿用“模型与连接”页"></label><label class="dai-setting-row"><span><b>接口协议</b><small>留空按接口地址自动判断。</small></span><select data-setting="npc.ledgerProvider"><option value="">自动判断</option><option value="openai">OpenAI 兼容</option><option value="anthropic">Anthropic</option></select></label><label class="dai-setting-row"><span><b>记录员模型</b><small>留空沿用“模型与连接”页的模型。</small></span><input type="text" data-setting="npc.ledgerModel" placeholder="留空沿用当前模型"></label><label class="dai-setting-row"><span><b>最大输出 Token</b><small>0 = 沿用全局上限。</small></span><input type="number" min="0" max="32768" step="64" data-setting="npc.ledgerMaxTokens" placeholder="0 = 不指定"></label></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>top_p</b><small>0 = 不指定。</small></span><input type="number" min="0" max="1" step="0.05" data-setting="npc.ledgerTopP" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>存在惩罚</b><small>0 = 不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="npc.ledgerPresencePenalty" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>频率惩罚</b><small>0 = 不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="npc.ledgerFrequencyPenalty" placeholder="0 = 不指定"></label></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>本局人物</b><small>点“看全文”展开整份档案；点“补一笔”把名字填进下面的手动栏。</small></div><p class="dai-state-strip" data-npc-ledger-summary>还没有载入人物簿。</p><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>只看</b></span><select data-npc-ledger-filter><option value="">全部</option><option value="present">在场的</option><option value="absent">不在场的</option><option value="important">重要的</option></select></label><label class="dai-setting-row"><span><b>搜名字</b><small>姓名、别名、称号都能搜。</small></span><input type="search" data-npc-ledger-search placeholder="如 萧战"></label></div><p class="dai-turn-result" data-npc-ledger-status role="status">还没有记账。生成结束后，人物记录员会把这一轮的人物变化写进档案。</p><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-npc-ledger-run>让记录员记一次</button><button type="button" class="dai-secondary-button" data-npc-ledger-refresh>刷新名单</button><button type="button" class="dai-secondary-button" data-npc-ledger-extract>按世界书重抽</button></div><ul class="dai-status-list" data-npc-ledger-list></ul></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>手动记账</b><small>一条补丁 = 一个人这一轮的变化；认不出的字段会被跳过，不会打断整条补丁。</small></div><label class="dai-setting-row"><span><b>补丁</b><small>例：{"人物":[{"姓名":"萧战","好感":3,"好感理由":"护住族人","态度":"对这个后辈多了几分认可","位置":"萧家议事厅","在场":"在场","流水":["主持族会，压下二长老的质疑"]}]}</small></span><textarea data-npc-ledger-patch rows="7" spellcheck="false" placeholder="粘贴或手写一条补丁"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-npc-ledger-apply>记进人物簿</button><button type="button" class="dai-secondary-button" data-npc-ledger-export>导出全簿</button><button type="button" class="dai-secondary-button" data-npc-ledger-import>导入全簿</button><button type="button" class="dai-secondary-button" data-npc-ledger-clear>清空本局人物簿</button><button type="button" class="dai-secondary-button" data-npc-ledger-extract-all>按世界书重抽：只填空着的字段</button></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>记录员提示词</b><small>人物记录员收到的 system 规则。打开页面显示的就是当前生效的正文，直接改即可；清空则恢复内置默认。改写时保持“只输出 JSON”不变。</small></div><label class="dai-setting-row"><span><b>规则正文</b><small>好感只记增减、流水只追加、没变化就不写。</small></span><textarea data-setting="npc.ledgerPrompt" rows="9" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-npc-ledger-default>填入默认规则</button><small>默认规则含“好感只记增减、流水只追加、没变化就不写”。</small></div></div>
                    </section>
                    <section class="dai-settings-page" data-settings-section="impact" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 07</span><h3>世界影响</h3><p>记录你把这局世界改成了什么样：烧掉的据点、得罪的势力、提前发生或没能发生的原著事件。库跟着这份聊天存档，会写进后续每一轮的正文提示词，而不是只影响一次回复。</p></div><div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">⌁</span><span><b>启用世界影响库</b><small>关掉后不记录、不注入，但已记下的内容仍留在聊天存档里。</small></span><input type="checkbox" data-setting="enablePlayerImpact"></div><label class="dai-setting-row dai-setting-toggle"><span><b>生成后自动记录</b><small>让“记录模型”在正文生成结束后把这一轮的世界变化写进库；关掉后只剩手动记录。</small></span><input type="checkbox" data-setting="impact.decideAuto"></label><label class="dai-setting-row"><span><b>记录节奏</b><small>每轮都记更细，但每轮多一次模型调用；每三轮记一次更省，代价是中间两轮的改动要等到下次记账才进库。</small></span><select data-setting="impact.decideEvery"><option value="1">每轮生成后</option><option value="3">每三轮生成后</option></select></label><label class="dai-setting-row dai-setting-toggle"><span><b>把世界线写进正文提示词</b><small>已发生、还没收场的影响会作为“本局世界线”随生成发给正文模型，让角色和旁白记得世界已经变了。</small></span><input type="checkbox" data-setting="impact.inject"></label><label class="dai-setting-row dai-setting-toggle"><span><b>注入前让模型挑选</b><small>每轮生成前，让“挑选模型”从账本里挑出这一幕真正用得上的影响，并改写成旁白；关掉则按分量和日期直接取，省一次调用。</small></span><input type="checkbox" data-setting="impact.injectSmart"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>注入字数预算</b><small>每轮最多花多少字描述已改的世界线；超出预算的影响只留在库里。</small></span><input type="number" min="0" max="2000" step="50" data-setting="impact.injectBudget"></label><label class="dai-setting-row"><span><b>注入前看最近几楼</b><small>挑选模型据此判断这一幕的场面：玩家在哪、身边有谁、要做什么。看太多会拖慢，6 楼通常够。</small></span><input type="number" min="1" max="12" step="1" data-setting="impact.injectFloors"></label></div><label class="dai-setting-row"><span><b>影响链最多接几层</b><small>一条影响还能接出几条后续；超过这个层数就只记录，不再自动接链。</small></span><input type="number" min="0" max="8" step="1" data-setting="impact.maxChainDepth"></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-impact-record>现在记录一次</button><small role="status" data-impact-decide-status>默认按上面的节奏自动记录；这里不用等下一轮。</small></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>记录员与场记的模型</b><small>默认一个模型干两件事，也可以各用各的。“跟随酒馆”＝直接用酒馆当前连接与模型（酒馆的静默生成接口不收模型名，所以这里点名没用）；“自定义”＝自己填接口地址、密钥、模型名，填好地址点“拉取模型”从列表里选。每套连接下面可以填温度、输出上限、top_p 和两个惩罚项：填 0 表示不指定；跟随酒馆时这些值只在这一次生成期间临时生效，结束立刻还原。</small></div><label class="dai-setting-row"><span><b>用几个模型</b><small>一个模型＝记账和挑选都用同一套；两个模型＝各配各的，互不影响。</small></span><select data-setting="impact.modelMode"><option value="shared">一个模型干两件事</option><option value="split">两个模型分开</option></select></label><div class="dai-setting-grid" data-impact-decide-model><label class="dai-setting-row"><span><b>记录员用哪套</b><small>生成结束后记账的那个。</small></span><select data-setting="impact.decideMode"><option value="tavern">跟随酒馆当前设置</option><option value="custom">自定义模型</option></select></label><label class="dai-setting-row"><span><b>记录员接口地址</b><small>选“自定义”才用得上；留空沿用“模型与连接”页。</small></span><input type="text" data-setting="impact.decideBaseUrl" placeholder="https://api.example.com/v1"></label><label class="dai-setting-row"><span><b>记录员接口密钥</b><small>选“自定义”才用得上；留空沿用“模型与连接”页。</small></span><input type="password" data-setting="impact.decideApiKey" placeholder="留空沿用“模型与连接”页"></label><label class="dai-setting-row"><span><b>记录员模型名</b><small>填好地址后点“拉取模型”挑一个，也可以手填。</small></span><input type="text" data-setting="impact.decideModel" list="dai-impact-models-decide" placeholder="例如 deepseek-chat"><datalist id="dai-impact-models-decide"></datalist></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>记录员温度</b><small>0–2；填 0 ＝不指定，沿用酒馆/全局。跟随酒馆时只在这次生成临时生效，结束还原。</small></span><input type="number" min="0" max="2" step="0.05" data-setting="impact.decideTemperature" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>记录员最大输出</b><small>tokens；0 ＝不指定。跟随酒馆时临时覆盖这一轮的输出长度（文本补全只支持这一项）。</small></span><input type="number" min="0" max="32768" step="64" data-setting="impact.decideMaxTokens" placeholder="0 = 不指定"></label></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>记录员 top_p</b><small>0–1；0 ＝不指定。</small></span><input type="number" min="0" max="1" step="0.05" data-setting="impact.decideTopP" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>记录员存在惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="impact.decidePresencePenalty" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>记录员频率惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="impact.decideFrequencyPenalty" placeholder="0 = 不指定"></label></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-impact-models="decide">拉取模型</button><small role="status" data-impact-models-status="decide"></small></div></div><div class="dai-setting-grid" data-impact-inject-model><label class="dai-setting-row"><span><b>场记用哪套</b><small>生成前挑影响的那个。</small></span><select data-setting="impact.injectMode"><option value="tavern">跟随酒馆当前设置</option><option value="custom">自定义模型</option></select></label><label class="dai-setting-row"><span><b>场记接口地址</b><small>选“自定义”才用得上；留空沿用“模型与连接”页。</small></span><input type="text" data-setting="impact.injectBaseUrl" placeholder="https://api.example.com/v1"></label><label class="dai-setting-row"><span><b>场记接口密钥</b><small>选“自定义”才用得上；留空沿用“模型与连接”页。</small></span><input type="password" data-setting="impact.injectApiKey" placeholder="留空沿用“模型与连接”页"></label><label class="dai-setting-row"><span><b>场记模型名</b><small>填好地址后点“拉取模型”挑一个，也可以手填。</small></span><input type="text" data-setting="impact.injectModel" list="dai-impact-models-inject" placeholder="例如 deepseek-chat"><datalist id="dai-impact-models-inject"></datalist></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>场记温度</b><small>0–2；填 0 ＝不指定。跟随酒馆时只在这次生成临时生效，结束还原。</small></span><input type="number" min="0" max="2" step="0.05" data-setting="impact.injectTemperature" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>场记最大输出</b><small>tokens；0 ＝不指定。跟随酒馆时临时覆盖这一轮的输出长度（文本补全只支持这一项）。</small></span><input type="number" min="0" max="32768" step="64" data-setting="impact.injectMaxTokens" placeholder="0 = 不指定"></label></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>场记 top_p</b><small>0–1；0 ＝不指定。</small></span><input type="number" min="0" max="1" step="0.05" data-setting="impact.injectTopP" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>场记存在惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="impact.injectPresencePenalty" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>场记频率惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="impact.injectFrequencyPenalty" placeholder="0 = 不指定"></label></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-impact-models="inject">拉取模型</button><small role="status" data-impact-models-status="inject"></small></div></div><details class="dai-prompt-fold"><summary><span><b>记录员提示词</b><small>生成结束后记账用的规则；点开才展开。</small></span></summary><label class="dai-setting-row"><span><b>规则正文</b><small>打开页面显示的就是当前生效的全文；清空＝恢复内置默认。改写时保持“只输出 JSON”和操作字段名不变。</small></span><textarea data-setting="impact.prompt" rows="14" spellcheck="false" placeholder="留空使用内置提示词"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-impact-prompt-default="decide">填入内置提示词</button><small>改完下一轮生效，不用重启。</small></div></details><details class="dai-prompt-fold"><summary><span><b>场记提示词</b><small>生成前挑选并改写影响用的规则；点开才展开。</small></span></summary><label class="dai-setting-row"><span><b>规则正文</b><small>打开页面显示的就是当前生效的全文；清空＝恢复内置默认。改写时保持“只从账本挑、用 #编号”不变。</small></span><textarea data-setting="impact.injectPrompt" rows="12" spellcheck="false" placeholder="留空使用内置提示词"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-impact-prompt-default="inject">填入内置提示词</button><small>默认收起；改完下一轮生效。</small></div></details></div><div class="dai-settings-card"><div class="dai-card-heading"><b>世界线账本</b><small data-impact-summary>加载中…</small></div><div class="dai-setting-row dai-setting-actions"><select data-impact-filter aria-label="筛选影响"><option value="all">全部</option><option value="active">未了结</option><option value="ripened">已发酵</option><option value="closed">已了结</option></select><select data-impact-weight aria-label="按分量筛选"><option value="">分量</option><option value="world">世界级</option><option value="major">大事</option><option value="minor">小事</option></select><select data-impact-kind aria-label="按性质筛选"><option value="">性质</option><option value="direct">直接</option><option value="ripple">涟漪</option><option value="butterfly">蝴蝶</option></select><input type="search" data-impact-search placeholder="搜标题、对象或原著" aria-label="搜索影响"><button type="button" class="dai-button dai-button-ghost" data-impact-add>添加一条</button><button type="button" class="dai-button dai-button-ghost" data-impact-refresh>刷新</button></div><div class="dai-impact-form" data-impact-form hidden><input type="hidden" data-impact-field="ref"><div class="dai-impact-form-head"><b data-impact-form-title>记一条世界影响</b><small>手动记的条目和记录员记的一样：会进正文、会发酵，也保留在聊天存档里。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>标题</b></span><input type="text" maxlength="60" data-impact-field="title" placeholder="世界哪一块变了"></label><label class="dai-setting-row"><span><b>对象</b></span><input type="text" maxlength="40" data-impact-field="target" placeholder="哪个地方/势力/规矩"></label></div><label class="dai-setting-row"><span><b>详情</b><small>具体变了什么、有什么能被看见的后果。</small></span><textarea rows="3" maxlength="240" data-impact-field="detail" placeholder="例如：城中药材涨价，加列家族开始暗中追查纵火者"></textarea></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>性质</b></span><select data-impact-field="kind"><option value="direct">直接 · 玩家亲手</option><option value="ripple">涟漪 · 旁人因此改主意</option><option value="butterfly">蝴蝶 · 隔了时间才显形</option></select></label><label class="dai-setting-row"><span><b>分量</b></span><select data-impact-field="weight"><option value="minor">小事</option><option value="major">大事</option><option value="world">世界级</option></select></label><label class="dai-setting-row"><span><b>确定性</b></span><select data-impact-field="certainty"><option value="certain">确凿</option><option value="rumor">传闻</option></select></label><label class="dai-setting-row"><span><b>几天后发酵</b><small>留空＝当场见效。</small></span><input type="number" min="1" max="365" step="1" data-impact-field="ripen"></label><label class="dai-setting-row"><span><b>提前/延后几天</b><small>只在编辑时用：负数提前、正数延后；提前到当天就当场应验。</small></span><input type="number" min="-365" max="365" step="1" data-impact-field="days"></label></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>依据</b></span><input type="text" maxlength="120" data-impact-field="evidence" placeholder="哪一楼、哪句话"></label><label class="dai-setting-row"><span><b>对上台账事件</b><small>世界运转里的事件编号，如 e2；没有就留空。</small></span><input type="text" maxlength="40" data-impact-field="eventId" placeholder="例如：e2"></label><label class="dai-setting-row"><span><b>原著节点</b><small>没牵动就留空。</small></span><input type="text" maxlength="60" data-impact-field="canon" placeholder="例如：退婚"></label><label class="dai-setting-row"><span><b>原著偏移</b></span><select data-impact-field="shift"><option value="none">不牵动</option><option value="accelerate">加速</option><option value="delay">延后</option><option value="avoid">避过</option><option value="alter">改写</option></select></label></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button" data-impact-save>保存</button><button type="button" class="dai-button dai-button-ghost" data-impact-form-close>取消</button><small role="status" data-impact-form-status></small></div></div><ol class="dai-impact-list" data-impact-library></ol><details class="dai-impact-archive" data-impact-archive><summary>档案 <small data-impact-archive-count>0 条</small></summary><p class="dai-impact-empty">被删除或因为库满挤出去的旧影响会留在这里，可以恢复。</p><ol class="dai-impact-list" data-impact-archive-list></ol></details></div></section>
                    <section class="dai-settings-page" data-settings-section="sandbox" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 08</span><h3>沙盒模式</h3><p>开启后不再按原著主线排期，改为先查前提、再看惯性；世界仍在运转，只是不替玩家安排剧情。</p><p role="status" data-sandbox-status>改动会先保存；本局真正切换口径需要在本局内确认。</p></div>
                        <div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">◈</span><span><b>启用沙盒模式</b><small>关闭时按主线口径：原著节点到点发生，玩家只影响过程。</small></span><input type="checkbox" data-setting="enableSandboxMode"></div><label class="dai-setting-row"><span><b>世界惯性</b><small>决定原著节点在沙盒里多积极地自行发生。强＝窗口一开始就发生；中＝到窗口结束才发生；弱＝不再自动发生，只留候选。</small></span><select data-setting="sandbox.inertia"><option value="strong">强 · 世界推着走</option><option value="medium">中 · 有人介入才偏离</option><option value="weak">弱 · 默认不动</option></select></label><label class="dai-setting-row dai-setting-toggle"><span><b>原著人物保留自主行动</b><small>关闭后原著人物只对玩家作出反应，不再主动推进自身轨迹。</small></span><input type="checkbox" data-setting="sandbox.canonCharactersAutonomous"></label><label class="dai-setting-row dai-setting-toggle"><span><b>允许中途切换模式</b><small>切换需要确认，而且只做重新对齐，不倒带已经发生的事实、代价和关系。</small></span><input type="checkbox" data-setting="sandbox.allowMidgameSwitch"></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>玩家目标与探索预算</b><small>沙盒没有主线给方向，目标由玩家自己定；这里只管上限。</small></div><label class="dai-setting-row dai-setting-toggle"><span><b>启用玩家自设目标</b><small>把玩家提出的目标记成状态，而不是只在正文里提一句。</small></span><input type="checkbox" data-setting="sandbox.playerGoalsEnabled"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>最多同时进行目标</b></span><input type="number" min="1" max="10" step="1" data-setting="sandbox.maxActiveGoals"></label><label class="dai-setting-row"><span><b>单回合最多新增对象</b><small>限制一回合内新冒出的线索与目标数量。</small></span><input type="number" min="0" max="8" step="1" data-setting="sandbox.maxNewObjectsPerTurn"></label></div><label class="dai-setting-row"><span><b>节点宽限天数</b><small>节点窗口结束后再等这么多游戏日，仍未发生才记为过期。</small></span><input type="number" min="0" max="60" step="1" data-setting="sandbox.nodeWindowSlackDays"></label></div>
                    </section>
                    <section class="dai-settings-page" data-settings-section="runtime" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">系统 / 09</span><h3>运行与界面</h3><p>这里放全局开关、预算保护和诊断选项。</p></div><div class="dai-settings-card"><div class="dai-card-heading"><b>运行预算</b><small>这是保护上限，不代表模型一定会消耗这些额度。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>单次最多模块数</b></span><input type="number" min="1" max="32" step="1" data-setting="budget.maxModules"></label><label class="dai-setting-row"><span><b>最多 NPC 决策数</b></span><input type="number" min="0" max="20" step="1" data-setting="budget.maxNpcDecisions"></label></div><label class="dai-setting-row"><span><b>总等待上限（毫秒）</b></span><input type="number" min="1000" max="600000" step="1000" data-setting="budget.totalTimeoutMs"></label></div><div class="dai-settings-card"><div class="dai-card-heading"><b>反馈显示</b><small>控制页面和右下角反馈的显示内容。</small></div><label class="dai-setting-row dai-setting-toggle"><span><b>显示历史状态</b></span><input type="checkbox" data-setting="status.showHistory"></label><label class="dai-setting-row dai-setting-toggle"><span><b>显示能力检测提示</b></span><input type="checkbox" data-setting="status.showCapabilityBadge"></label><label class="dai-setting-row dai-setting-toggle"><span><b>紧凑界面</b></span><input type="checkbox" data-setting="ui.compact"></label><label class="dai-setting-row dai-setting-toggle"><span><b>先占位再补正文</b><small>等待模型时先在对话里放一条“……”，正文回来后再替换。</small></span><input type="checkbox" data-setting="ui.placeholder"></label><label class="dai-setting-row dai-setting-toggle"><span><b>调试信息</b><small>只记录本地诊断信息，不记录提示词或密钥。</small></span><input type="checkbox" data-setting="debug"></label></div><div class="dai-settings-card"><div class="dai-card-heading"><b>旧版手动脉冲</b><small>默认关闭：正文由酒馆自己生成，扩展只在生成前注入原著设定。开启后回到“面板里点结算这一轮”的旧链路，两条链路会抢正文，不建议同时用。</small></div><label class="dai-setting-row dai-setting-toggle"><span><b>启用旧版手动脉冲</b><small>仅在需要对照旧行为时打开。</small></span><input type="checkbox" data-setting="ui.legacyTurn"></label></div></section>
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
        if (activeSettingsPage === 'impact') renderImpactLibrary(panel);
        if (activeSettingsPage === 'npcledger') {
            // 打开页面时把当前生效的记录员规则铺进文本框，改完即用，清空则回默认。
            const area = panel.querySelector('[data-setting="npc.ledgerPrompt"]');
            if (area && !area.value.trim()) area.value = currentSettings().npc?.ledgerPrompt || NPC_RECORD_PROMPT;
            refreshNpcLedgerPage(panel);
        }
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
        const infoSet = event.target.closest?.('[data-world-info-set]');
        if (infoSet) {
            const field = infoSet.dataset.worldInfoSet;
            if (!['era', 'location', 'weather', 'reputation', 'wanted'].includes(field)) return;
            const input = panel.querySelector(`[data-world-info="${field}"]`);
            const value = typeof input?.value === 'string' ? input.value.trim() : '';
            if (input) input.value = '';
            return worldApplyFromPanel(panel, [{ op: 'setInfo', field, text: value }]);
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
        if (event.target.closest?.('[data-world-decide-run]')) {
            void runWorldDecision({ source: 'manual' });
            return;
        }
        const decideDefault = event.target.closest?.('[data-world-decide-default]');
        if (decideDefault) {
            const area = panel.querySelector('[data-setting="world.decidePrompt"]');
            if (area) {
                area.value = WORLD_DECIDE_PROMPT;
                area.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return;
        }
        const defaultPrompt = event.target.closest?.('[data-prompt-default]');
        if (defaultPrompt) {
            const which = defaultPrompt.dataset.promptDefault;
            const settleCategory = which.startsWith('settle:') ? resolveCategory(which.slice(7)) : null;
            const area = settleCategory
                ? panel.querySelector(`[data-setting="settle.prompt.${settleCategory.id}"]`)
                : panel.querySelector(`[data-setting="prompt.${which === 'lookup' ? 'lookup' : 'select'}"]`);
            if (area) {
                area.value = settleCategory ? settleCategory.prompt : (which === 'lookup' ? LOOKUP_RULES : SELECT_RULES);
                area.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return;
        }
        const modelFetch = event.target.closest?.('[data-impact-models]');
        if (modelFetch) {
            void fetchImpactModels(panel, modelFetch.dataset.impactModels === 'inject' ? 'inject' : 'decide', modelFetch);
            return;
        }
        const settleFetch = event.target.closest?.('[data-settle-models]');
        if (settleFetch) {
            void fetchSettleModels(panel, settleFetch);
            return;
        }
        const worldDecideFetch = event.target.closest?.('[data-worlddecide-models]');
        if (worldDecideFetch) {
            void fetchWorldDecideModels(panel, worldDecideFetch);
            return;
        }
        const impactPromptDefault = event.target.closest?.('[data-impact-prompt-default]');
        if (impactPromptDefault) {
            const inject = impactPromptDefault.dataset.impactPromptDefault === 'inject';
            const area = panel.querySelector(`[data-setting="${inject ? 'impact.injectPrompt' : 'impact.prompt'}"]`);
            if (area) {
                area.value = inject ? IMPACT_INJECT_PROMPT : IMPACT_DECIDE_PROMPT;
                area.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return;
        }
        const recordButton = event.target.closest?.('[data-impact-record]');
        if (recordButton) {
            recordButton.disabled = true;
            void runImpactDecision({ source: 'manual' }).finally(() => { recordButton.disabled = false; });
            return;
        }
        const refreshButton = event.target.closest?.('[data-impact-refresh]');
        if (refreshButton) { renderImpactLibrary(panel); return; }
        if (event.target.closest?.('[data-impact-more]')) {
            impactShown += 100;
            renderImpactLibrary(panel);
            return;
        }
        if (event.target.closest?.('[data-impact-archive-more]')) {
            impactArchiveShown += 60;
            renderImpactLibrary(panel);
            return;
        }
        if (event.target.closest?.('[data-impact-add]')) { openImpactForm(panel); return; }
        const editButton = event.target.closest?.('[data-impact-edit]');
        if (editButton) {
            const record = agentImpactRuntime.list().find(item => item.id === editButton.dataset.impactEdit);
            if (record) openImpactForm(panel, record);
            return;
        }
        const closeButton = event.target.closest?.('[data-impact-close]');
        if (closeButton) { runImpactOp(panel, { op: 'close', ref: closeButton.dataset.impactClose, resolution: '手动收场' }, `已收场 #${closeButton.dataset.impactClose}。`); return; }
        const revertButton = event.target.closest?.('[data-impact-revert]');
        if (revertButton) { runImpactOp(panel, { op: 'revert', ref: revertButton.dataset.impactRevert, resolution: '手动修复' }, `已标为修复 #${revertButton.dataset.impactRevert}。`); return; }
        const forgetButton = event.target.closest?.('[data-impact-forget]');
        if (forgetButton) { runImpactOp(panel, { op: 'forget', ref: forgetButton.dataset.impactForget }, `已删除 #${forgetButton.dataset.impactForget}，可在档案里恢复。`); return; }
        const unarchiveButton = event.target.closest?.('[data-impact-unarchive]');
        if (unarchiveButton) { runImpactOp(panel, { op: 'unarchive', ref: unarchiveButton.dataset.impactUnarchive }, `已从档案恢复 #${unarchiveButton.dataset.impactUnarchive}。`); return; }
        if (event.target.closest?.('[data-impact-save]')) { saveImpactForm(panel); return; }
        if (event.target.closest?.('[data-impact-form-close]')) { closeImpactForm(panel); return; }
        const ledgerRun = event.target.closest?.('[data-npc-ledger-run]');
        if (ledgerRun) {
            ledgerRun.disabled = true;
            void runNpcLedgerRecord({ source: 'manual' }).finally(() => { ledgerRun.disabled = false; });
            return;
        }
        if (event.target.closest?.('[data-npc-ledger-refresh]')) { refreshNpcLedgerPage(panel); return; }
        if (event.target.closest?.('[data-npc-ledger-apply]')) { applyNpcLedgerPatchFromPanel(panel); return; }
        if (event.target.closest?.('[data-npc-ledger-export]')) {
            const area = panel.querySelector('[data-npc-ledger-patch]');
            if (area) area.value = JSON.stringify(agentNpcLedger.exportAll(), null, 2);
            return;
        }
        if (event.target.closest?.('[data-npc-ledger-import]')) {
            if (agentNpcLedger.status().total && typeof window !== 'undefined' && typeof window.confirm === 'function'
                && !window.confirm('导入会整体覆盖本局现在的人物簿（现在这些人会被换掉），继续？')) return;
            if (typeof document === 'undefined') return;
            const picker = document.createElement('input');
            picker.type = 'file';
            picker.accept = 'application/json,.json';
            picker.addEventListener('change', async () => {
                const file = picker.files?.[0];
                if (!file) return;
                try {
                    const parsed = JSON.parse(await file.text());
                    const records = Array.isArray(parsed?.records) ? parsed.records : (Array.isArray(parsed) ? parsed : null);
                    if (!records) { setNpcLedgerStatus('这个文件里没有人物簿：要用「导出全簿」得到的那份 JSON。'); return; }
                    const result = agentNpcLedger.load({ records });
                    lastNpcLedgerFloor = -1;
                    persistNpcLedger();
                    setNpcLedgerStatus(`导入了 ${result.total} 人${result.skipped ? `，${result.skipped} 条读不懂跳过` : ''}；下一轮就按新档案注入。`);
                    refreshNpcLedgerPage(panel);
                } catch (error) {
                    setNpcLedgerStatus(`导入失败：${error?.message ?? error}`);
                }
            }, { once: true });
            picker.click();
            return;
        }
        if (event.target.closest?.('[data-npc-ledger-clear]')) {
            if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm('清空本局人物簿？所有已记的人物档案都会消失，这一步不能撤销。')) return;
            agentNpcLedger.clear();
            lastNpcLedgerFloor = -1;
            persistNpcLedger();
            setNpcLedgerStatus('人物簿已清空。');
            refreshNpcLedgerPage(panel);
            return;
        }
        if (event.target.closest?.('[data-npc-ledger-default]')) {
            const area = panel.querySelector('[data-setting="npc.ledgerPrompt"]');
            if (area) {
                area.value = NPC_RECORD_PROMPT;
                area.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return;
        }
        if (event.target.closest?.('[data-npc-ledger-more]')) { npcLedgerShown += 80; renderNpcLedgerList(panel); return; }
        const ledgerView = event.target.closest?.('[data-npc-ledger-view]');
        if (ledgerView) {
            const name = ledgerView.dataset.npcLedgerView;
            const detail = [...panel.querySelectorAll('[data-npc-ledger-detail]')].find(node => node.dataset.npcLedgerDetail === name);
            if (detail) {
                detail.hidden = !detail.hidden;
                ledgerView.textContent = detail.hidden ? '看全文' : '收起';
            }
            return;
        }
        const ledgerExtractAll = event.target.closest?.('[data-npc-ledger-extract-all]');
        if (ledgerExtractAll) {
            ledgerExtractAll.disabled = true;
            const before = ledgerExtractAll.textContent;
            ledgerExtractAll.textContent = '正在补空字段……';
            void runNpcLedgerExtract({})
                .catch(error => setNpcLedgerStatus(`重抽失败：${error?.message ?? error}`))
                .finally(() => {
                    ledgerExtractAll.disabled = false;
                    ledgerExtractAll.textContent = before;
                    refreshNpcLedgerPage(panel);
                });
            return;
        }
        const ledgerExtract = event.target.closest?.('[data-npc-ledger-extract]');
        if (ledgerExtract) {
            const name = ledgerExtract.dataset.npcLedgerExtract;
            if (!name) {
                ledgerExtract.disabled = true;
                const before = ledgerExtract.textContent;
                ledgerExtract.textContent = '正在补空字段……';
                void runNpcLedgerExtract({})
                    .catch(error => setNpcLedgerStatus(`重抽失败：${error?.message ?? error}`))
                    .finally(() => {
                        ledgerExtract.disabled = false;
                        ledgerExtract.textContent = before;
                        refreshNpcLedgerPage(panel);
                    });
                return;
            }
            const ok = typeof window !== 'undefined' && typeof window.confirm === 'function'
                ? window.confirm(`按世界书重写「${name}」的档案？\n身份、外貌、身体、性格、资产会被世界书覆盖；好感、流水、态度、处境不动。`)
                : true;
            if (ok) {
                ledgerExtract.disabled = true;
                const before = ledgerExtract.textContent;
                ledgerExtract.textContent = '重抽中……';
                void runNpcLedgerExtract({ names: [name], overwrite: true })
                    .catch(error => setNpcLedgerStatus(`重抽失败：${error?.message ?? error}`))
                    .finally(() => {
                        ledgerExtract.disabled = false;
                        ledgerExtract.textContent = before;
                        refreshNpcLedgerPage(panel);
                    });
            }
            return;
        }
        const ledgerPresence = event.target.closest?.('[data-npc-ledger-presence]');
        if (ledgerPresence) {
            const record = agentNpcLedger.get(ledgerPresence.dataset.npcLedgerPresence);
            if (record) {
                const next = record.presence === '在场' ? '不在场' : '在场';
                applyNpcLedgerPayload({ 人物: [{ 姓名: record.name, 在场: next }] }, { source: '手动' });
                setNpcLedgerStatus(`${record.name} 记为${next}；下一轮按这个档位写进正文。`);
                refreshNpcLedgerPage(panel);
            }
            return;
        }
        const ledgerImportance = event.target.closest?.('[data-npc-ledger-importance]');
        if (ledgerImportance) {
            const record = agentNpcLedger.get(ledgerImportance.dataset.npcLedgerImportance);
            if (record) {
                const next = record.importance === '重要' ? '不重要' : '重要';
                applyNpcLedgerPayload({ 人物: [{ 姓名: record.name, 重要度: next }] }, { source: '手动' });
                setNpcLedgerStatus(`${record.name} 标为${next === '重要' ? '重要' : '普通'}；重要的人即使不在场也会写一行处境。`);
                refreshNpcLedgerPage(panel);
            }
            return;
        }
        const ledgerEdit = event.target.closest?.('[data-npc-ledger-edit]');
        if (ledgerEdit) {
            const area = panel.querySelector('[data-npc-ledger-patch]');
            if (area) {
                area.value = JSON.stringify({ 人物: [{ 姓名: ledgerEdit.dataset.npcLedgerEdit }] }, null, 2);
                area.focus();
            }
            return;
        }
        const ledgerForget = event.target.closest?.('[data-npc-ledger-forget]');
        if (ledgerForget) {
            const result = agentNpcLedger.remove(ledgerForget.dataset.npcLedgerForget);
            if (result.status === 'removed') {
                persistNpcLedger();
                setNpcLedgerStatus(`已把 ${result.record.name} 的档案删掉。`);
                refreshNpcLedgerPage(panel);
            }
            return;
        }
        const page = event.target.closest?.('[data-settings-page]');
        if (page) selectPage(page.dataset.settingsPage);
    });    panel.addEventListener('input', async event => {
        if (event.target.closest?.('[data-npc-ledger-filter]') || event.target.closest?.('[data-npc-ledger-search]')) { npcLedgerShown = 60; renderNpcLedgerList(panel); return; }
        if (event.target.closest?.('[data-impact-filter]') || event.target.closest?.('[data-impact-weight]') || event.target.closest?.('[data-impact-kind]') || event.target.closest?.('[data-impact-search]')) { impactShown = 100; renderImpactLibrary(panel); return; }
        const input = event.target.closest?.('[data-setting]');
        if (!input || (input.type === 'radio' && !input.checked)) return;
        let value = input.type === 'checkbox' ? input.checked : input.value;
        if (input.type === 'number') value = Number(value);
        // 下拉给的是字符串，写回数值型设置项前先转成数字。
        if (input.tagName === 'SELECT' && input.dataset.setting === 'setting.progress') value = Number(value) || 0;
        if (input.tagName === 'SELECT' && input.dataset.setting === 'impact.decideEvery') value = Number(value) || 1;
        if (input.tagName === 'SELECT' && input.dataset.setting === 'npc.ledgerEvery') value = Number(value) || 1;
        const sequence = ++settingsSaveSequence;
        const result = updateSetting(input.dataset.setting, value);
        if (input.dataset.setting === 'enableSandboxMode' || input.dataset.setting.startsWith('sandbox.')) syncSandboxModeFromSettings();
        if (input.dataset.setting === 'llm.mode') applyLlmModeVisibility(panel, value);
        if (/^impact\.(modelMode|decideMode|injectMode)$/.test(input.dataset.setting)) applyImpactModelVisibility(panel);
        if (input.dataset.setting === 'settle.mode') applySettleModelVisibility(panel);
        if (input.dataset.setting === 'world.decideMode') applyWorldDecideModelVisibility(panel);
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
function journalSourceLabel(source) {
    if (source === 'llm') return '模型';
    if (source === 'decide') return '决定';
    if (source === 'panel') return '面板';
    if (source === 'revert') return '撤销';
    return source;
}

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
        for (const [field, label] of [['era', '时期'], ['location', '所在地'], ['weather', '天气'], ['reputation', '名声'], ['wanted', '通缉度']]) {
            if (status.info[field]) parts.push(`${label}：${status.info[field]}`);
        }
        time.textContent = `${agentWorldRuntime.formatClock()}${parts.length ? ` · ${parts.join(' · ')}` : ''}`;
        for (const input of section.querySelectorAll('[data-world-info]')) {
            const field = input.dataset.worldInfo;
            input.value = typeof status.info[field] === 'string' ? status.info[field] : '';
        }
    }
    renderWorldEventList(section.querySelector('[data-world-events-near]'), snapshot.nearEvents);
    renderWorldEventList(section.querySelector('[data-world-events-world]'), snapshot.worldEvents, { emptyNote: '暂无进行中的世界大事。' });
    const journal = section.querySelector('[data-world-journal]');
    if (journal) {
        const entries = [...snapshot.log].reverse().slice(0, 8);
        journal.replaceChildren(...(entries.length ? entries.map(entry => {
            const item = makeElement('p', 'dai-turn-result');
            item.append(makeElement('b', '', `${journalSourceLabel(entry.source)}：`), document.createTextNode(entry.summaries.join('；') || '（无变化）'));
            return item;
        }) : [makeElement('p', 'dai-turn-result', '还没有世界指令执行记录。生成后模型下的指令会记在这里。')]));
    }
}

const IMPACT_FORM_FIELDS = ['title', 'detail', 'target', 'kind', 'weight', 'certainty', 'evidence', 'eventId', 'canon', 'shift', 'ripen', 'days'];
const IMPACT_REASON_TEXT = {
    title_missing: '请写标题：世界哪一块变了。',
    title_too_long: '标题超过 60 字，删短一点。',
    detail_missing: '请写详情：具体变了什么。',
    detail_too_long: '详情超过 240 字，删短一点。',
    target_missing: '请写对象：哪个地方、势力或规矩。',
    target_too_long: '对象超过 40 字，删短一点。',
    evidence_too_long: '依据超过 120 字，删短一点。',
    canon_too_long: '原著节点超过 60 字，删短一点。',
    event_too_long: '对上台账的事件编号超过 40 字，删短一点。',
    duplicate_record: '同一天、同一对象已经有同名影响，改个标题或换一天。',
    duplicate_similar: '账本里已经有一件很像的事（同一对象、同样的偏移、两天之内）：要改它就用“编辑”，别新开一条。',
    bad_ripen: '发酵天数要填 1–365 的整数。',
    bad_days: '提前/延后天数要填非 0 的整数，负数提前、正数延后。',
    no_schedule: '这条本来没有安排发酵日，没法“提前”；直接编辑它定一个发酵天数。',
    bad_kind: '性质选项不认识。',
    bad_weight: '分量选项不认识。',
    bad_certainty: '确定性选项不认识。',
    bad_shift: '原著偏移选项不认识。',
    record_not_found: '这条影响已经不在了，刷新一下账本。',
    record_inactive: '这条已经了结或修复了，不能再调时间。',
    already_ripened: '这件事已经发酵过了，不能再改发酵日。',
    archive_not_found: '档案里找不到这条，刷新一下。',
    library_full: '库里满了，先删一条或调大库容量再恢复。',
    unknown_op: '操作不认识，刷新页面后重试。',
};

function impactFormField(form, name) {
    return form?.querySelector?.(`[data-impact-field="${name}"]`) ?? null;
}

/** 打开手动记账表单：不传 record 就是新增，传了就是编辑这一条。 */
function openImpactForm(panel, record = null) {
    const form = panel?.querySelector?.('[data-impact-form]');
    if (!form) return { status: 'missing' };
    form.hidden = false;
    form.dataset.ref = record?.id ?? '';
    const today = worldDay();
    // 只有“还排在将来”的发酵安排才算可取消；已经应验过的不因为改文字被撤销。
    form.dataset.originalRipen = Number.isInteger(record?.ripenDay) && record.ripenDay > today ? String(record.ripenDay) : '';
    for (const name of IMPACT_FORM_FIELDS) {
        const field = impactFormField(form, name);
        if (!field) continue;
        if (!record) {
            field.value = name === 'kind' ? 'direct' : name === 'weight' ? 'minor' : name === 'certainty' ? 'certain' : name === 'shift' ? 'none' : '';
            continue;
        }
        if (name === 'ripen') {
            field.value = Number.isInteger(record.ripenDay) && record.ripenDay > today ? String(record.ripenDay - today) : '';
            continue;
        }
        if (name === 'days') { field.value = ''; continue; } // 每次打开都是“这一次要调几天”，不预填旧值
        field.value = record[name] ?? '';
    }
    const title = form.querySelector('[data-impact-form-title]');
    if (title) title.textContent = record ? `编辑 #${record.id}` : '记一条世界影响';
    const status = form.querySelector('[data-impact-form-status]');
    if (status) status.textContent = record
        ? '改完点保存；要推动或拖延它，就在“提前/延后几天”里填数字。'
        : '手动记的条目会立刻进账本，也会进下一轮正文。';
    form.scrollIntoView?.({ block: 'nearest' });
    impactFormField(form, 'title')?.focus?.();
    return { status: 'open' };
}

function closeImpactForm(panel) {
    const form = panel?.querySelector?.('[data-impact-form]');
    if (!form) return { status: 'missing' };
    form.hidden = true;
    form.dataset.ref = '';
    form.dataset.originalRipen = '';
    return { status: 'closed' };
}

/** 读表单并落账：新增走 record，编辑走 edit；校验交给 impact-runtime，页面只翻译拒绝原因。 */
function saveImpactForm(panel) {
    const form = panel?.querySelector?.('[data-impact-form]');
    if (!form) return { status: 'missing' };
    const read = name => (impactFormField(form, name)?.value ?? '').trim();
    const ref = form.dataset.ref || '';
    const status = form.querySelector('[data-impact-form-status]');
    const ripenRaw = read('ripen');
    const daysRaw = read('days');
    const op = {
        op: ref ? 'edit' : 'record',
        ...(ref ? { ref } : {}),
        title: read('title'),
        detail: read('detail'),
        target: read('target'),
        kind: read('kind'),
        weight: read('weight'),
        certainty: read('certainty'),
        evidence: read('evidence'),
        eventId: read('eventId'),
        canon: read('canon'),
        shift: read('shift'),
    };
    // 填了“提前/延后”就以它为准，不再同时改“几天后发酵”，免得两个命令互相打架。
    if (daysRaw && ref) {
        // 交给下面的 adjust 操作
    } else if (ripenRaw) op.ripen = Number(ripenRaw);
    else if (ref && form.dataset.originalRipen) op.ripen = null; // 编辑时把发酵天数清空＝取消这条安排
    const ops = [op];
    if (daysRaw && ref) ops.push({ op: 'adjust', ref, days: Number(daysRaw), detail: `手动把发酵日${Number(daysRaw) < 0 ? '提前' : '延后'}` });
    const result = agentImpactRuntime.apply(ops, { source: 'manual', day: worldDay() });
    if (result.status !== 'applied') {
        const reason = result.rejected?.[0]?.reason ?? 'unknown_op';
        if (status) status.textContent = IMPACT_REASON_TEXT[reason] ?? `保存被拒绝（${reason}）。`;
        return { status: 'rejected', reason };
    }
    persistImpact();
    const id = result.applied[result.applied.length - 1]?.id ?? ref;
    const saved = agentImpactRuntime.list().find(item => item.id === id);
    closeImpactForm(panel);
    // 新条目可能排在页数之外：先把账本整个铺开，滚到它跟前再闪一下，避免“点了保存却像没反应”。
    impactShown = Number.MAX_SAFE_INTEGER;
    // 若当前筛选恰好会把刚存下的这条藏起来，先切回“全部”，否则用户会以为没保存成功。
    const filter = panel?.querySelector?.('[data-impact-filter]');
    if (filter && saved && filter.value !== 'all' && filter.value !== saved.state) filter.value = 'all';
    renderImpactLibrary(panel);
    // 新条目可能排在中段：滚到它跟前、闪一下，避免“点了保存却像没反应”。
    const added = panel?.querySelector?.(`[data-impact-edit="${id}"]`)?.closest?.('.dai-impact-item');
    if (added) {
        added.classList.add('is-fresh');
        added.scrollIntoView?.({ block: 'nearest' });
        setTimeout(() => added.classList.remove('is-fresh'), 1600);
    }
    const pending = saved && saved.state === 'active' && Number.isInteger(saved.ripenDay) && saved.ripenDay > worldDay()
        ? `（第 ${saved.ripenDay} 天起才会进正文）` : '';
    setImpactStatus(ref ? `已改写 #${id}，下一轮正文按新内容注入。` : `已记下 #${id}：${saved?.title ?? read('title')}${pending}`);
    lastImpactInjection = null; // 手动改过库，下一轮重新挑
    return { status: 'applied', id };
}

/** 单条操作（收场/修复/删除/恢复）：走同一条落账路径，失败把原因翻成人话。 */
function runImpactOp(panel, op, successText) {
    const result = agentImpactRuntime.apply([op], { source: 'manual', day: worldDay() });
    if (result.status !== 'applied') {
        const reason = result.rejected?.[0]?.reason ?? 'unknown_op';
        setImpactStatus(IMPACT_REASON_TEXT[reason] ?? `操作被拒绝（${reason}）。`);
        return { status: 'rejected', reason };
    }
    persistImpact();
    lastImpactInjection = null;
    renderImpactLibrary(panel);
    setImpactStatus(successText);
    return { status: 'applied' };
}

/** 档案区：删掉的、或者因为库满挤出去的旧影响，都能从这里恢复。 */
function renderImpactArchive(panel) {
    const list = panel?.querySelector?.('[data-impact-archive-list]');
    if (!list) return;
    const items = agentImpactRuntime.archived();
    const count = panel.querySelector('[data-impact-archive-count]');
    if (count) count.textContent = `${items.length} 条`;
    if (!items.length) {
        list.replaceChildren(makeElement('li', 'dai-impact-empty', '档案是空的。'));
        return;
    }
    list.replaceChildren(...items.slice(0, impactArchiveShown).map(record => {
        const item = makeElement('li', 'dai-impact-item');
        const head = makeElement('div', 'dai-impact-item-head');
        head.append(makeElement('span', 'dai-impact-mark', impactMark(record) || '·'), makeElement('b', '', record.title));
        const restore = makeElement('button', 'dai-impact-edit', '恢复');
        restore.type = 'button';
        restore.dataset.impactUnarchive = record.id;
        head.append(restore);
        item.append(head);
        const reason = record.archivedReason === 'deleted' ? '手动删除'
            : record.archivedReason === '楼层已删' ? '依据楼层被删'
                : '容量清出';
        const meta = [`第 ${record.day} 天`, WEIGHT_LABEL[record.weight] ?? '小事', reason];
        if (record.target) meta.push(record.target);
        item.append(makeElement('small', 'dai-impact-meta', meta.join(' · ')));
        return item;
    }));
    if (items.length > impactArchiveShown) {
        const more = makeElement('li', 'dai-impact-item');
        const button = makeElement('button', 'dai-impact-edit', `再显示 ${Math.min(60, items.length - impactArchiveShown)} 条（档案共 ${items.length} 条）`);
        button.type = 'button';
        button.dataset.impactArchiveMore = '1';
        more.append(button);
        list.append(more);
    }
}

function renderImpactLibrary(panel) {
    const target = panel ?? (typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null);
    const library = target?.querySelector?.('[data-impact-library]');
    if (!library) return;
    const status = agentImpactRuntime.status();
    const filter = target.querySelector('[data-impact-filter]')?.value ?? 'all';
    const weight = target.querySelector('[data-impact-weight]')?.value ?? '';
    const kind = target.querySelector('[data-impact-kind]')?.value ?? '';
    const search = (target.querySelector('[data-impact-search]')?.value ?? '').trim().toLowerCase();
    const all = agentImpactRuntime.list();
    const children = new Map();
    for (const record of all) {
        if (!record.parent) continue;
        if (!children.has(record.parent)) children.set(record.parent, []);
        children.get(record.parent).push(record.id);
    }
    const records = all.filter(record => {
        if (filter !== 'all' && record.state !== filter) return false;
        if (weight && record.weight !== weight) return false;
        if (kind && record.kind !== kind) return false;
        if (search) {
            const hay = [record.title, record.target, record.canon, record.detail, record.eventId].filter(Boolean).join(' ').toLowerCase();
            if (!hay.includes(search)) return false;
        }
        return true;
    });
    const summary = target.querySelector('[data-impact-summary]');
    if (summary) {
        const extra = [`已了结 ${status.closed}`];
        if (status.reverted) extra.push(`修复 ${status.reverted}`);
        if (status.edited) extra.push(`改过 ${status.edited}`);
        if (status.archived) extra.push(`档案 ${status.archived}`);
        summary.textContent = status.total
            ? `第 ${status.day} 天 · 本局 ${status.total} 条 · 未了结 ${status.active} · 已发酵 ${status.ripened} · ${extra.join(' · ')}`
            : '这一局还没有记录。玩家做出会改变世界的事之后，记录员会把它们记在这里。';
    }
    renderImpactArchive(target);
    if (!records.length) {
        library.replaceChildren(makeElement('li', 'dai-impact-empty', status.total ? '这个筛选里没有记录。' : '还没有影响记录。'));
        return;
    }
    const injected = new Set(lastInjectedIds);
    const chatLength = getHostContext()?.chat?.length ?? null;
    library.replaceChildren(...records.slice(0, impactShown).map(record => {
        const item = makeElement('li', 'dai-impact-item');
        if (record.edited) item.classList.add('is-edited');
        const head = makeElement('div', 'dai-impact-item-head');
        head.append(makeElement('span', 'dai-impact-mark', impactMark(record) || '·'), makeElement('b', '', record.title));
        const actions = makeElement('span', 'dai-impact-actions');
        const edit = makeElement('button', 'dai-impact-edit', '编辑');
        edit.type = 'button';
        edit.dataset.impactEdit = record.id;
        actions.append(edit);
        if (record.state === 'active' || record.state === 'ripened') {
            const close = makeElement('button', 'dai-impact-edit', '收场');
            close.type = 'button';
            close.dataset.impactClose = record.id;
            const revert = makeElement('button', 'dai-impact-edit', '修复');
            revert.type = 'button';
            revert.dataset.impactRevert = record.id;
            actions.append(close, revert);
        }
        const forget = makeElement('button', 'dai-impact-edit is-danger', '删除');
        forget.type = 'button';
        forget.dataset.impactForget = record.id;
        actions.append(forget);
        head.append(actions);
        item.append(head);
        const meta = [`第 ${record.day} 天`, WEIGHT_LABEL[record.weight] ?? '小事', STATE_LABEL[record.state] ?? '未了结'];
        if (record.certainty === 'rumor') meta.push('传闻');
        if (record.target) meta.push(record.target);
        if (record.canon) meta.push(`原著·${SHIFT_LABEL[record.shift] ?? '改写'}`);
        if (record.eventId) meta.push(`台账 ${record.eventId}`);
        item.append(makeElement('small', 'dai-impact-meta', meta.join(' · ')));
        const badges = [];
        if (injected.has(record.id)) badges.push('本轮已注入');
        if (record.edited) badges.push(`改过 · 第 ${record.editedDay ?? record.day} 天`);
        if (record.parent) badges.push(`接自 #${record.parent}`);
        const descendants = children.get(record.id);
        if (descendants?.length) badges.push(`引出 ${descendants.map(id => `#${id}`).join('、')}`);
        if (Number.isInteger(record.floor) && chatLength !== null && record.floor >= chatLength) badges.push('依据楼层已删，建议删掉或改写');
        if (badges.length) item.append(makeElement('small', 'dai-impact-badges', badges.join(' · ')));
        if (record.detail) item.append(makeElement('p', 'dai-impact-detail', record.detail));
        if (record.state === 'active' && Number.isInteger(record.ripenDay)) item.append(makeElement('small', 'dai-impact-fate', `第 ${record.ripenDay} 天才会发作`));
        if (record.state === 'ripened') item.append(makeElement('small', 'dai-impact-fate', `第 ${record.ripenedDay ?? record.day} 天发酵${record.resolution ? ` · ${record.resolution}` : ''}`));
        if (record.state === 'closed') item.append(makeElement('small', 'dai-impact-fate', `已了结${record.resolution ? ` · ${record.resolution}` : ''}`));
        if (record.state === 'reverted') item.append(makeElement('small', 'dai-impact-fate', '已被修复/撤销'));
        return item;
    }));
    if (records.length > impactShown) {
        const more = makeElement('li', 'dai-impact-item');
        const button = makeElement('button', 'dai-impact-edit', `再显示 ${Math.min(100, records.length - impactShown)} 条（筛选后共 ${records.length} 条）`);
        button.type = 'button';
        button.dataset.impactMore = '1';
        more.append(button);
        library.append(more);
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
    const volumeCount = Object.keys(stats.volumes ?? {}).length;
    const volumeRange = volumeCount
        ? `${Math.min(...Object.keys(stats.volumes).map(Number))}–${Math.max(...Object.keys(stats.volumes).map(Number))}`
        : '-';
    if (progress === null) {
        push('卷与目录', `未定卷：没手动锁、这一轮也没判定出来 → 目录给全书 ${rowsCount} 行（会看到后面卷）· 卷号取自各条“原著范围”行，共 ${volumeCount} 卷（第 ${volumeRange} 卷）· 缺卷号 ${stats.missingVolume} 条`, 'warn');
    } else {
        const source = manual !== null ? '手动' : '自动';
        const extra = manual !== null && auto !== null ? `，模型/文本判定 ${auto}` : '';
        push('卷与目录', `第 ${progress} 卷（${source}${extra}）· 该卷目录 ${rowsCount} 行 · 全书 ${volumeCount} 卷 · 缺卷号 ${stats.missingVolume} 条`);
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
    const customMode = llm.mode === 'custom';
    const connection = customMode
        ? `自定义接口 · ${llm.baseUrl || '未填地址'} · ${llm.model || '未填模型'}`
        : `跟随酒馆当前 API · ${llm.model || '沿用酒馆模型'}`;
    push('模型', connection, customMode && !(llm.baseUrl && llm.model) ? 'warn' : undefined);
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
    const settingProgress = currentSettings().setting?.progress;
    const manualVolume = Number.isInteger(settingProgress) && settingProgress > 0 ? settingProgress : null;
    const autoVolume = Number.isInteger(currentSettings().facts?.currentVolume) && currentSettings().facts.currentVolume > 0
        ? currentSettings().facts.currentVolume
        : null;
    const progress = manualVolume ?? autoVolume;
    const rowCount = progress === null
        ? agentFactsIndex.fullCatalog({ limit: 160 }).length
        : agentFactsIndex.catalogFor(progress).lines.length;
    const volumeLabel = progress === null ? '未定卷（给全书目录）' : `当前卷 ${progress}`;
    target.textContent = `已索引 ${stats.total} 条｜${categories}｜${stats.missingVolume} 条缺卷号｜${volumeLabel} ${rowCount} 行`;
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