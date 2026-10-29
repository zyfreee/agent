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
import { NPC_RECORD_PROMPT, NPC_RECORD_JSON_SCHEMA, NPC_EXTRACT_PROMPT, buildNpcRecordUser, buildNpcExtractUser, playerContextLine, parseNpcRecordReply, EXP_CONDENSE_PROMPT, buildExpCondenseUser, parseExpCondenseReply } from './npc/npc-recorder.js';
import { createNpcColdRuntime } from './npc/npc-cold-runtime.js';
import { NPC_COLD_PROMPT, buildNpcColdUser } from './npc/npc-cold-recorder.js';
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
import { ORB_ITEMS, buildOrbPanels, createOrbState } from './host/orb-hud.js';
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
import { buildWorldInjection, extractOpsBlock, parseOps, stripOpsBlock, OPS_GUIDE, WORLD_HEADER, seasonOf } from './world/world-ops.js';
import { buildDecideUser, parseDecision, WORLD_DECIDE_PROMPT, DECIDE_JSON_SCHEMA } from './world/world-decide.js';
import { createSelfRuntime } from './self/self-runtime.js';
import { buildSelfInjection, extractOpsBlock as extractSelfOpsBlock, parseOps as parseSelfOps, stripOpsBlock as stripSelfOpsBlock, SELF_GUIDE, SELF_HEADER } from './self/self-ops.js';
import { buildSelfDecideUser, parseSelfDecision, SELF_DECIDE_PROMPT, SELF_JSON_SCHEMA } from './self/self-decide.js';
import { createMemoryRuntime } from './memory/memory-runtime.js';
import { buildMemoryInjection, recallHits, recallKeys, findMemoryConflicts, memoryStrength, extractOpsBlock as extractMemoryOpsBlock, parseOps as parseMemoryOps, stripOpsBlock as stripMemoryOpsBlock, MEMORY_GUIDE, MEMORY_HEADER } from './memory/memory-ops.js';
import { buildDecideUser as buildMemoryDecideUser, parseDecision as parseMemoryDecision, MEMORY_DECIDE_PROMPT, MEMORY_JSON_SCHEMA } from './memory/memory-decide.js';
import { createDbBridge } from './host/db-bridge.js';
import { sameSelfState, sameWorldState, sameMemoryState, selfStateFromTables, worldStateFromTables, memoryStateFromTables } from './host/db-tables.js';

const EXTENSION_ID = 'doupo-agent-ui';
const ROOT_ID = `${EXTENSION_ID}-root`;
const STYLE_ID = `${EXTENSION_ID}-style`;
const CAPABILITY_ID = `${EXTENSION_ID}-capabilities`;
const SETTINGS_BUTTON_ID = `${EXTENSION_ID}-settings-button`;
const SETTINGS_PANEL_ID = `${EXTENSION_ID}-settings-panel`;
const SETTINGS_STATUS_ID = `${EXTENSION_ID}-settings-status`;
const INLINE_SETTINGS_ID = `${EXTENSION_ID}-inline-settings`;
const ORB_ID = `${EXTENSION_ID}-orb`;
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
let orbElement;
let orbState = createOrbState();
let orbDocumentClick;
let orbDocumentKey;

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
        restoreNpcColdFromChat();
        restoreSelfFromChat();
        restoreMemoryFromChat();
        try {
            agentDbBridge.onChatChanged();
            agentDbBridge.onExternalChange(handleExternalTableChange);
        } catch { /* 数据库桥不可用时静默跳过，照旧走本地存档 */ }
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
            try { agentDbBridge.onChatChanged(); } catch { /* 数据库桥不可用时静默跳过 */ }
            try { agentPromptInjection.clear(); } catch { /* 切聊天时清空注入 */ }
            try { agentWorldPromptInjection.clear(); } catch { /* 同上 */ }
            try { agentImpactPromptInjection.clear(); } catch { /* 同上 */ }
            try { agentNpcLedgerInjection.clear(); } catch { /* 同上 */ }
            try { agentSelfPromptInjection.clear(); } catch { /* 同上 */ }
            try { restoreWorldFromChat(); } catch { /* 换聊天读不到世界台账时按开局处理 */ }
            try { restoreImpactFromChat(); } catch { /* 换聊天读不到影响库时按空库开局 */ }
            try { restoreNpcLedgerFromChat(); } catch { /* 换聊天读不到人物簿时按空簿开局 */ }
            try { restoreNpcColdFromChat(); } catch { /* 换聊天读不到冷藏台时按空台开局 */ }
            try { restoreSelfFromChat(); } catch { /* 换聊天读不到纳戒时按空戒开局 */ }
            try { restoreMemoryFromChat(); } catch { /* 换聊天读不到记忆时按空账开局 */ }
            try { agentOrchestrator.restore(currentAgentScope()); } catch { /* 未连接酒馆时跳过恢复 */ }
            refreshControlDashboard();
            refreshWorldPage();
            try { renderImpactLibrary(); } catch { /* 面板未挂载时忽略 */ }
            try { refreshNpcLedgerPage(); } catch { /* 同上 */ }
            try { refreshSelfPage(); } catch { /* 同上 */ }
            try { refreshMemoryPage(); } catch { /* 同上 */ }
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
            // 酒馆对每一次生成收尾都广播这个事件——包括这里记账链自己发起的静默调用。
            // 静默调用还在飞的时候就直接跳过记账，否则链会被自己的调用反复叫醒，无限空转。
            // 真玩家恰好在静默调用飞行中生成正文的情况很少见，漏掉的那一轮会在下一次生成后补记。
            const quietInFlight = typeof agentLlmClient?.isQuietBusy === 'function' && agentLlmClient.isQuietBusy();
            if (name === 'GENERATION_ENDED' && !quietInFlight) {
                const decide = worldDecideSettings();
                // 影响库要读“这一轮之后”的世界台账，所以排在决定/执行之后，串行跑。
                const afterWorld = () => {
                    try {
                        const impact = impactSettings();
                        if (impact.enabled && impact.decideEnabled && impact.decideAuto) {
                            // 记录节奏：1 = 每轮，3 = 每三轮；按“上次记账之后又生成了几楼”算，换聊天/重开也不会乱。
                            const chat = Array.isArray(getHostContext()?.chat) ? getHostContext().chat : [];
                            // 没记到东西也算叫过一次记录员，否则 every=3 会在“连着几轮没变化”后退化成每轮都跑。
                            const decidedFloor = agentImpactRuntime.status().decidedFloor;
                            // 删过楼的话旧楼层号会超出当前聊天：夹到最后一楼，别把“删楼”误判成“一整段都没记过”。
                            const lastFloor = Math.min(decidedFloor, chat.length - 1);
                            if (isImpactDecideDue(chat, { every: impact.decideEvery, lastFloor })) void runImpactDecision({ source: 'auto' });
                        }
                    } catch { /* 记录失败不影响生成 */ }
                    // 纳戒记账也要用”这一轮之后”的世界天数（炼制时限、超期显示），同样排在世界之后，与影响库互不阻塞。
                    try {
                        const self = selfLedgerSettings();
                        if (self.enabled && self.decideEnabled && self.decideAuto) void runSelfDecision({ source: 'auto' });
                    } catch { /* 记账失败不影响生成 */ }
                    // 记忆决定排最后：它要同时看”这一轮之后”的世界天数和前面账本刚落的新账，四条链互不阻塞。
                    try {
                        const memory = memorySettings();
                        if (memory.enabled && memory.decideEnabled && memory.decideAuto) void runMemoryDecision({ source: 'auto' });
                    } catch { /* 记账失败不影响生成 */ }
                };
                if (decide.enabled && decide.auto) {
                    try { void Promise.resolve(runWorldDecision({ source: 'auto' })).finally(afterWorld).catch(() => {}); } catch { afterWorld(); }
                } else {
                    try { applyWorldOpsFromLatestReply(); } catch { /* 指令执行失败不影响生成 */ }
                    try { applySelfOpsFromLatestReply(); } catch { /* 指令执行失败不影响生成 */ }
                    try { applyMemoryOpsFromLatestReply(); } catch { /* 指令执行失败不影响生成 */ }
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
            try { agentSelfPromptInjection.clear(); } catch { /* 同上 */ }
            try { agentMemoryPromptInjection.clear(); } catch { /* 同上 */ }
            try {
                const panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null;
                if (panel && !panel.hidden) { renderFactsStatus(panel); refreshWorldbookStats(panel); refreshWorldPage(panel); refreshControlDashboard(); try { renderImpactLibrary(panel); } catch { /* 同上 */ } try { refreshNpcLedgerPage(panel); } catch { /* 同上 */ } try { refreshSelfPage(panel); } catch { /* 同上 */ } try { refreshMemoryPage(panel); } catch { /* 同上 */ } }
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
/** 冷藏人物推进台：只生成预览，确认后才把补丁交给人物簿。 */
export const agentNpcColdRuntime = createNpcColdRuntime();
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
/** 纳戒（主角自身与随身之物）：跟着聊天存档走；决定、注入和面板都从这里读。 */
export const agentSelfRuntime = createSelfRuntime({ maxOps: 12 });
export const agentSelfPromptInjection = createPromptInjection({ getContext: getHostContext, key: 'doupo_self' });
/** 记忆（主角的四类叙事记忆：恩怨/情报/伏笔/大事记）：跟着聊天存档走；与纳戒（状态）、
 *  人物簿（别人）、世界（外界动态）互不重叠，只收"值得长期记住的叙事事实"。 */
export const agentMemoryRuntime = createMemoryRuntime({ maxOps: 12 });
export const agentMemoryPromptInjection = createPromptInjection({ getContext: getHostContext, key: 'doupo_memory' });
/** 数据库桥：纳戒/世界台账镜像到「龙血玄黄·数据库」的表格里（表=账本，扩展面板=前端）。
 *  数据库脚本没装或被关时全部调用静默跳过，照旧走 chatMetadata，零回归。 */
export const agentDbBridge = createDbBridge({
    getSettings: () => {
        try { return currentSettings(); } catch { return undefined; }
    },
});
/** World-book index (uid -> category/name/volumes/content) and the model-side selector that names uids. */
export const agentFactsIndex = createFactsIndex();
/** 原著选条用哪套连接：设置里选“自定义”才换连接；采样参数在跟随酒馆时也照填。 */
function factsOverrides() {
    const facts = currentSettings().setting ?? {};
    const num = (value, max) => {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? Math.min(max, number) : undefined;
    };
    const signed = value => {
        const number = Number(value);
        return Number.isFinite(number) && number !== 0 ? number : undefined;
    };
    const params = {
        temperature: num(facts.temperature, 2),
        maxTokens: Number.isInteger(facts.maxTokens) && facts.maxTokens > 0 ? Math.min(32768, facts.maxTokens) : undefined,
        topP: num(facts.topP, 1),
        presencePenalty: signed(facts.presencePenalty),
        frequencyPenalty: signed(facts.frequencyPenalty),
    };
    const clean = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined));
    if (facts.mode !== 'custom') {
        return Object.keys(clean).length ? clean : undefined;
    }
    return {
        connection: 'custom',
        custom: {
            baseUrl: typeof facts.baseUrl === 'string' ? facts.baseUrl.trim() : '',
            apiKey: typeof facts.apiKey === 'string' ? facts.apiKey.trim() : '',
            provider: facts.provider === 'anthropic' ? 'anthropic' : facts.provider === 'openai' ? 'openai' : '',
            model: typeof facts.model === 'string' ? facts.model.trim() : '',
        },
        model: typeof facts.model === 'string' && facts.model.trim() ? facts.model.trim() : undefined,
        ...clean,
    };
}
export const agentFactsSelector = createFactsSelector({
    index: agentFactsIndex,
    complete: args => agentLlmClient.complete({ ...args, overrides: factsOverrides() }),
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
            categoryLabel: settings.labelFor(category),
            input,
            state,
            allowedFields,
            preliminary,
            overrides: settings.overrides,
        });
    },
    getWritableFields: () => listWritableFields(agentDataContracts),
    getSettleCategories: () => settleSettings().customCategories,
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
    interpret: args => agentLlmClient.interpret({ ...args, categories: settleSettings().customCategories }),
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

/** 世界状态跟着聊天走：换聊天读那一份，读不到就按开局初始化；随后数据库表里有账就收养（表优先）。 */
function restoreWorldFromChat() {
    const record = hostStorage?.worldState?.();
    const result = record?.status === 'ready' && record.value ? agentWorldRuntime.restore(record.value) : agentWorldRuntime.reset();
    void adoptWorldFromDb();
    return result;
}

/** 数据库表里已有世界台账就收养（表=账本）；保留本地操作流水，表空则不动。 */
async function adoptWorldFromDb() {
    try {
        const state = await agentDbBridge.adoptWorld();
        if (!state || sameWorldState(state, agentWorldRuntime.snapshot())) return;
        const previous = agentWorldRuntime.snapshot();
        agentWorldRuntime.restore({ ...state, log: Array.isArray(previous?.log) ? previous.log : [] });
        persistWorld();
        refreshWorldPage();
    } catch (error) {
        console.warn('[斗破Agent] 数据库世界台账收养失败', error);
    }
}

function persistWorld() {
    const snapshot = agentWorldRuntime.snapshot();
    const result = hostStorage?.saveWorldState?.(snapshot);
    if (result && typeof result.catch === 'function') result.catch(() => { /* 保存失败由下次操作重试 */ });
    void agentDbBridge.mirrorWorld(snapshot).catch(() => { /* 镜像失败记在桥状态里，不阻断记账 */ });
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

/** 纳戒页设置：注入开关/预算 + 决定调用的连接与参数。 */
function selfLedgerSettings() {
    const settings = currentSettings();
    const self = settings.self ?? {};
    return {
        enabled: settings.enableSelfLedger !== false,
        inject: self.inject !== false,
        injectBudget: Number.isInteger(self.injectBudget) && self.injectBudget > 0 ? Math.min(self.injectBudget, 4000) : 900,
        decideEnabled: self.decideEnabled !== false,
        decideAuto: self.decideAuto !== false,
        maxFloors: Number.isInteger(self.decideMaxFloors) && self.decideMaxFloors > 0 ? Math.min(12, self.decideMaxFloors) : 6,
        maxEntries: Number.isInteger(self.decideMaxEntries) && self.decideMaxEntries >= 0 ? Math.min(40, self.decideMaxEntries) : 12,
        prompt: typeof self.decidePrompt === 'string' && self.decidePrompt.trim() ? self.decidePrompt.trim() : SELF_DECIDE_PROMPT,
        overrides: {
            connection: self.decideMode === 'custom' ? 'custom' : 'tavern',
            model: typeof self.decideModel === 'string' && self.decideModel.trim() ? self.decideModel.trim() : undefined,
            custom: {
                baseUrl: typeof self.decideBaseUrl === 'string' ? self.decideBaseUrl.trim() : '',
                apiKey: typeof self.decideApiKey === 'string' ? self.decideApiKey.trim() : '',
                provider: self.decideProvider === 'anthropic' ? 'anthropic' : self.decideProvider === 'openai' ? 'openai' : '',
                model: typeof self.decideModel === 'string' ? self.decideModel.trim() : '',
            },
            temperature: impactParam(self.decideTemperature, 2),
            maxTokens: impactParam(self.decideMaxTokens, 32768),
            topP: impactParam(self.decideTopP, 1),
            presencePenalty: impactParam(self.decidePresencePenalty, 2),
            frequencyPenalty: impactParam(self.decideFrequencyPenalty, 2),
        },
    };
}

/** 纳戒跟着聊天走：换聊天读那一份，读不到就按空戒开局；随后数据库表里有账就收养（表优先）。 */
function restoreSelfFromChat() {
    const record = hostStorage?.selfState?.();
    const result = record?.status === 'ready' && record.value ? agentSelfRuntime.restore(record.value) : agentSelfRuntime.reset();
    void adoptSelfFromDb();
    return result;
}

/** 数据库表里已有纳戒就收养（表=账本）；保留本地操作流水，表空则不动。 */
async function adoptSelfFromDb() {
    try {
        const state = await agentDbBridge.adoptSelf();
        if (!state || sameSelfState(state, agentSelfRuntime.snapshot())) return;
        const previous = agentSelfRuntime.snapshot();
        agentSelfRuntime.restore({ ...state, log: Array.isArray(previous?.log) ? previous.log : [] });
        persistSelf();
        refreshSelfPage();
    } catch (error) {
        console.warn('[斗破Agent] 数据库纳戒收养失败', error);
    }
}

/** 数据库可视化器里的手改回拉：表一变就核对，账不一致就按表收养。 */
function handleExternalTableChange(view) {
    if (!view || typeof view !== 'object') return;
    try {
        const derived = selfStateFromTables(view);
        if (derived && !derived.empty && !sameSelfState(derived.state, agentSelfRuntime.snapshot())) {
            const previous = agentSelfRuntime.snapshot();
            agentSelfRuntime.restore({ ...derived.state, log: Array.isArray(previous?.log) ? previous.log : [] });
            persistSelf();
            refreshSelfPage();
        }
    } catch (error) {
        console.warn('[斗破Agent] 纳戒表格回拉失败', error);
    }
    try {
        const derivedWorld = worldStateFromTables(view);
        if (derivedWorld && !derivedWorld.empty && !sameWorldState(derivedWorld.state, agentWorldRuntime.snapshot())) {
            const previousWorld = agentWorldRuntime.snapshot();
            agentWorldRuntime.restore({ ...derivedWorld.state, log: Array.isArray(previousWorld?.log) ? previousWorld.log : [] });
            persistWorld();
            refreshWorldPage();
        }
    } catch (error) {
        console.warn('[斗破Agent] 世界表格回拉失败', error);
    }
    try {
        const derivedMemory = memoryStateFromTables(view);
        if (derivedMemory && !derivedMemory.empty && !sameMemoryState(derivedMemory.state, agentMemoryRuntime.snapshot())) {
            const previousMemory = agentMemoryRuntime.snapshot();
            agentMemoryRuntime.restore({ ...derivedMemory.state, log: Array.isArray(previousMemory?.log) ? previousMemory.log : [] });
            persistMemory();
            refreshMemoryPage();
        }
    } catch (error) {
        console.warn('[斗破Agent] 记忆表格回拉失败', error);
    }
}

function persistSelf() {
    const snapshot = agentSelfRuntime.snapshot();
    const result = hostStorage?.saveSelfState?.(snapshot);
    if (result && typeof result.catch === 'function') result.catch(() => { /* 保存失败由下次操作重试 */ });
    void agentDbBridge.mirrorSelf(snapshot).catch(() => { /* 镜像失败记在桥状态里，不阻断记账 */ });
    return result;
}

/** 记忆页设置：注入开关/预算 + 决定调用的连接与参数。 */
function memorySettings() {
    const settings = currentSettings();
    const memory = settings.memory ?? {};
    return {
        enabled: settings.enableMemoryLedger !== false,
        inject: memory.inject !== false,
        injectBudget: Number.isInteger(memory.injectBudget) && memory.injectBudget > 0 ? Math.min(memory.injectBudget, 4000) : 800,
        decideEnabled: memory.decideEnabled !== false,
        decideAuto: memory.decideAuto !== false,
        maxFloors: Number.isInteger(memory.decideMaxFloors) && memory.decideMaxFloors > 0 ? Math.min(12, memory.decideMaxFloors) : 6,
        maxEntries: Number.isInteger(memory.decideMaxEntries) && memory.decideMaxEntries >= 0 ? Math.min(40, memory.decideMaxEntries) : 12,
        prompt: typeof memory.decidePrompt === 'string' && memory.decidePrompt.trim() ? memory.decidePrompt.trim() : MEMORY_DECIDE_PROMPT,
        overrides: {
            connection: memory.decideMode === 'custom' ? 'custom' : 'tavern',
            model: typeof memory.decideModel === 'string' && memory.decideModel.trim() ? memory.decideModel.trim() : undefined,
            custom: {
                baseUrl: typeof memory.decideBaseUrl === 'string' ? memory.decideBaseUrl.trim() : '',
                apiKey: typeof memory.decideApiKey === 'string' ? memory.decideApiKey.trim() : '',
                provider: memory.decideProvider === 'anthropic' ? 'anthropic' : memory.decideProvider === 'openai' ? 'openai' : '',
                model: typeof memory.decideModel === 'string' ? memory.decideModel.trim() : '',
            },
            temperature: impactParam(memory.decideTemperature, 2),
            maxTokens: impactParam(memory.decideMaxTokens, 32768),
            topP: impactParam(memory.decideTopP, 1),
            presencePenalty: impactParam(memory.decidePresencePenalty, 2),
            frequencyPenalty: impactParam(memory.decideFrequencyPenalty, 2),
        },
    };
}

/** 记忆跟着聊天走：换聊天读那一份，读不到就按空账开局；随后数据库表里有账就收养（表优先）。 */
function restoreMemoryFromChat() {
    const record = hostStorage?.memoryState?.();
    const result = record?.status === 'ready' && record.value ? agentMemoryRuntime.restore(record.value) : agentMemoryRuntime.reset();
    void adoptMemoryFromDb();
    return result;
}

/** 数据库表里已有记忆就收养（表=账本）；保留本地操作流水，表空则不动。 */
async function adoptMemoryFromDb() {
    try {
        const state = await agentDbBridge.adoptMemory();
        if (!state || sameMemoryState(state, agentMemoryRuntime.snapshot())) return;
        const previous = agentMemoryRuntime.snapshot();
        agentMemoryRuntime.restore({ ...state, log: Array.isArray(previous?.log) ? previous.log : [] });
        persistMemory();
        refreshMemoryPage();
    } catch (error) {
        console.warn('[斗破Agent] 数据库记忆收养失败', error);
    }
}

function persistMemory() {
    const snapshot = agentMemoryRuntime.snapshot();
    const result = hostStorage?.saveMemoryState?.(snapshot);
    if (result && typeof result.catch === 'function') result.catch(() => { /* 保存失败由下次操作重试 */ });
    void agentDbBridge.mirrorMemory(snapshot).catch(() => { /* 镜像失败记在桥状态里，不阻断记账 */ });
    return result;
}

/** 生成前按需召回主角记忆：只有"关联/别名"命中最近剧情的才进提示词，一场戏没勾到就不注。
 *  被召回的记忆由 runtime 记一笔强度（排练效应，越常想起越靠前）；统计只进聊天存档，不镜像数据库。 */
function writeMemoryInjectionForPrompt() {
    const settings = memorySettings();
    if (!settings.enabled || !settings.inject) { agentMemoryPromptInjection.clear(); return { status: 'disabled' }; }
    const probe = agentMemoryPromptInjection.inspect();
    if (probe.status !== 'ready') return probe;
    // 召回钥匙的比对面：最近四楼正文（玩家+AI 都算），命中 related/别名 才召回。
    let sceneText = '';
    try {
        const chat = Array.isArray(getHostContext()?.chat) ? getHostContext().chat : [];
        sceneText = chat.slice(-4).map(message => (typeof message?.mes === 'string' ? message.mes : '')).join('\n');
    } catch { sceneText = ''; }
    const hits = recallHits(agentMemoryRuntime.snapshot(), { sceneText });
    if (!hits.length) { agentMemoryPromptInjection.clear(); return { status: 'empty' }; }
    agentMemoryRuntime.markRecalled(hits.map(entry => entry.id), { day: worldDay() });
    persistMemory();
    const body = buildMemoryInjection(agentMemoryRuntime.snapshot(), { maxChars: settings.injectBudget, sceneText });
    if (!body) { agentMemoryPromptInjection.clear(); return { status: 'empty' }; }
    // 决定式自动开启时指令指南不进正文提示词（决定模型另行调用），只注入召回结果保住正文一致性。
    const withGuide = !(settings.decideEnabled && settings.decideAuto);
    const guide = typeof currentSettings().memory?.guide === 'string' && currentSettings().memory.guide.trim()
        ? currentSettings().memory.guide.trim()
        : MEMORY_GUIDE;
    return agentMemoryPromptInjection.write({ text: withGuide ? `${MEMORY_HEADER}\n${body}\n\n${guide}` : `${MEMORY_HEADER}\n${body}` }, { depth: injectionSettings().depth, maxChars: settings.injectBudget + (withGuide ? 1200 : 0) });
}

/** 手动操作与面板操作共用：落账、存档、刷新页面；天数取世界时钟。 */
function applySelfOps(operations) {
    const result = agentSelfRuntime.apply(operations, { source: 'panel', day: worldDay() });
    persistSelf();
    refreshSelfPage();
    return result;
}

/** 生成前把主角自身状态写进扩展提示词；与世界、影响、人物簿通道互不清空。 */
function writeSelfInjectionForPrompt() {
    const settings = selfLedgerSettings();
    if (!settings.enabled || !settings.inject) { agentSelfPromptInjection.clear(); return { status: 'disabled' }; }
    const probe = agentSelfPromptInjection.inspect();
    if (probe.status !== 'ready') return probe;
    const body = buildSelfInjection(agentSelfRuntime.snapshot(), { maxChars: settings.injectBudget });
    if (!body) { agentSelfPromptInjection.clear(); return { status: 'empty' }; }
    // 决定式自动开启时指令指南不进正文提示词（决定模型另行调用），只注入现状保住正文一致性。
    const withGuide = !(settings.decideEnabled && settings.decideAuto);
    // 指南正文：设置里留空时用内置默认，所见即模型所收。
    const guide = typeof currentSettings().self?.guide === 'string' && currentSettings().self.guide.trim()
        ? currentSettings().self.guide.trim()
        : SELF_GUIDE;
    return agentSelfPromptInjection.write({ text: withGuide ? `${SELF_HEADER}\n${body}\n\n${guide}` : `${SELF_HEADER}\n${body}` }, { depth: injectionSettings().depth, maxChars: settings.injectBudget + (withGuide ? 1200 : 0) });
}

/**
 * 生成结束：从最新一条 AI 楼层里取 self 指令块，交给纳戒核验执行。
 * 同一楼重 roll 时先撤销上一版指令再落新账；指令块从正文剥掉，玩家只看剧情。
 */
function applySelfOpsFromLatestReply() {
    const context = getHostContext();
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    const index = lastReplyIndex(chat);
    if (index < 0) return { status: 'no_reply' };
    if (selfLedgerSettings().enabled === false) return { status: 'disabled' };
    const found = extractSelfOpsBlock(chat[index].mes);
    if (!found) return { status: 'no_ops' };
    const parsed = parseSelfOps(found.raw);
    const result = agentSelfRuntime.apply(parsed.ops, { source: 'llm', floor: index, day: worldDay() });
    persistSelf();
    const cleaned = stripSelfOpsBlock(chat[index].mes);
    if (cleaned !== chat[index].mes) {
        chat[index].mes = cleaned;
        try {
            if (typeof context.updateMessageBlock === 'function') context.updateMessageBlock(index, chat[index]);
            else if (typeof context.renderMessage === 'function') context.renderMessage(index);
        } catch { /* 渲染失败时文本已更新，下次刷新生效 */ }
        try { context.saveChat?.(); } catch { /* 保存失败由宿主自动保存兜底 */ }
    }
    refreshSelfPage();
    return { status: result.status, applied: result.applied.length, rejected: result.rejected.length, floor: index + 1 };
}

/**
 * 生成结束：从最新一条 AI 楼层里取 memory 指令块，交给记忆核验执行（降级模式）。
 * 同一楼重 roll 时先撤销上一版指令再落新账；指令块从正文剥掉，玩家只看剧情。
 */
function applyMemoryOpsFromLatestReply() {
    const context = getHostContext();
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    const index = lastReplyIndex(chat);
    if (index < 0) return { status: 'no_reply' };
    if (memorySettings().enabled === false) return { status: 'disabled' };
    const found = extractMemoryOpsBlock(chat[index].mes);
    if (!found) return { status: 'no_ops' };
    const parsed = parseMemoryOps(found.raw);
    const result = agentMemoryRuntime.apply(parsed.ops, { source: 'llm', floor: index, day: worldDay() });
    persistMemory();
    const cleaned = stripMemoryOpsBlock(chat[index].mes);
    if (cleaned !== chat[index].mes) {
        chat[index].mes = cleaned;
        try {
            if (typeof context.updateMessageBlock === 'function') context.updateMessageBlock(index, chat[index]);
            else if (typeof context.renderMessage === 'function') context.renderMessage(index);
        } catch { /* 渲染失败时文本已更新，下次刷新生效 */ }
        try { context.saveChat?.(); } catch { /* 保存失败由宿主自动保存兜底 */ }
    }
    refreshMemoryPage();
    return { status: result.status, applied: result.applied.length, rejected: result.rejected.length, floor: index + 1 };
}

/** 手动操作与面板操作共用：落账、存档、刷新页面；天数取世界时钟。 */
function applyMemoryOps(operations) {
    const result = agentMemoryRuntime.apply(operations, { source: 'panel', day: worldDay() });
    persistMemory();
    refreshMemoryPage();
    return result;
}

function setSelfStatus(message) {
    const panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null;
    const target = panel?.querySelector('[data-self-status]');
    if (target) target.textContent = message;
}

const SELF_PROFILE_LABELS = Object.freeze({ name: '姓名', gender: '性别', age: '年龄', race: '种族', origin: '出身', affiliation: '所属', attribute: '斗气属性', talent: '天赋', appearance: '外貌' });

function setSelfDecideStatus(message) {
    const panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null;
    const target = panel?.querySelector('[data-self-decide-status]');
    if (target) target.textContent = message;
}

function renderSelfDecisionResult(decision, result) {
    const panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null;
    const target = panel?.querySelector('[data-self-decide-result]');
    if (!target) return;
    const rows = [];
    const note = typeof decision?.note === 'string' && decision.note.trim() ? decision.note.trim() : '（模型没有给说明）';
    rows.push({ text: `模型说明：${note}` });
    const applied = Array.isArray(result?.applied) ? result.applied : [];
    const rejected = Array.isArray(result?.rejected) ? result.rejected : [];
    for (const item of applied) rows.push({ text: `✓ ${item.summary}`, ok: true });
    for (const item of rejected) rows.push({ text: `✗ ${item.op}：${item.reason}`, ok: false });
    if (decision?.dropped > 0) rows.push({ text: `⚠ ${decision.dropped} 条格式坏的被丢弃`, ok: false });
    if (!applied.length && !rejected.length) rows.push({ text: decision?.status === 'empty' ? '模型判断本轮主角自身无变化。' : '模型没有给出可执行的操作。', ok: false });
    target.replaceChildren(...rows.map(row => {
        const item = makeElement('p', 'dai-turn-result');
        if (row.ok === false) item.dataset.ok = 'false';
        item.textContent = row.text;
        return item;
    }));
}

let selfDecideRunning = false;

/**
 * 纳戒决定：读聊天记录 + 世界书 + 纳戒现状 → 模型决定 → 脚本逐条校验执行 →
 * 结果呈现到面板。生成结束后自动跑，面板按钮可手动跑。
 */
async function runSelfDecision({ source = 'auto' } = {}) {
    const settings = selfLedgerSettings();
    if (!settings.enabled || !settings.decideEnabled) return { status: 'disabled' };
    if (selfDecideRunning) return { status: 'busy' };
    // 自定义连接有自己的地址和密钥，不依赖全局配置；跟随酒馆才需要先检查全局连接。
    if (settings.overrides.connection !== 'custom' && agentLlmClient.configured() !== true) {
        setSelfDecideStatus('模型连接未配置：先在“模型设置”页选好连接。');
        return { status: 'not_configured' };
    }
    selfDecideRunning = true;
    setSelfDecideStatus('模型正在决定……');
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
            setSelfDecideStatus('聊天里还没有内容，模型无从决定。');
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
        const user = buildSelfDecideUser({ snapshot: agentSelfRuntime.snapshot(), floors, worldbookLines: bookLines });
        const raw = await agentLlmClient.complete({
            system: settings.prompt,
            user,
            jsonSchema: SELF_JSON_SCHEMA,
            overrides: settings.overrides,
        });
        const decision = parseSelfDecision(raw);
        if (decision.status === 'invalid') {
            setSelfDecideStatus(`模型输出无法解析：${decision.error}`);
            return { status: 'invalid', error: decision.error };
        }
        const result = agentSelfRuntime.apply(decision.ops, { source: 'decide', floor: lastReplyIndex(chat), day: worldDay() });
        persistSelf();
        if (!result.applied.length) agentSelfRuntime.note(decision.note || '模型判断本轮主角自身无变化。', { source: 'decide' });
        renderSelfDecisionResult(decision, result);
        setSelfDecideStatus(source === 'auto' ? '生成后自动决定完成。' : '决定完成。');
        refreshSelfPage();
        return { status: 'ok', decision, result };
    } catch (error) {
        const message = error?.code === 'llm_custom_not_configured'
            ? '纳戒决定设成了“自定义模型”，但接口地址或模型名还没填全（填在“纳戒 → 模型决定”里，或改回跟随酒馆）。'
            : `纳戒决定失败：${error?.message ?? error}`;
        setSelfDecideStatus(message);
        return { status: 'failed', reason: String(message) };
    } finally {
        selfDecideRunning = false;
    }
}

/** 手动登记清单条目：按页签读对应的表单输入，拼成与模型指令同构的操作。 */
function selfCreateFromPanel(panel, list) {
    const values = {};
    for (const input of panel.querySelectorAll(`[data-self-new^="${list}."]`)) {
        values[input.dataset.selfNew.split('.').pop()] = typeof input.value === 'string' ? input.value.trim() : '';
    }
    let op = null;
    if (list === 'techniques') op = { op: 'addTechnique', name: values.name, grade: values.grade, type: values.type, progress: values.progress, source: values.source };
    if (list === 'skills') op = { op: 'addSkill', name: values.name, grade: values.grade, type: values.type, progress: values.progress, source: values.source };
    if (list === 'items') {
        const count = Number(values.count);
        op = { op: 'addItem', name: values.name, category: values.category, grade: values.grade, ...(Number.isInteger(count) && count > 0 ? { count } : {}) };
    }
    if (list === 'recipes') op = { op: 'addRecipe', name: values.name, craft: values.craft, grade: values.grade, materials: values.materials };
    if (list === 'goals') op = { op: 'addGoal', text: values.text, priority: values.priority === '主线' ? '主线' : '支线', due: values.due };
    if (!op) return;
    const result = applySelfOps([op]);
    if (result.applied.length) {
        for (const input of panel.querySelectorAll(`[data-self-new^="${list}."]`)) input.value = '';
        setSelfStatus(result.applied[0].summary + '。');
        closeAgentModal(panel);
    } else {
        setSelfStatus(`未生效：${result.rejected[0]?.reason ?? '无变化'}`);
    }
}

/** 手动开工炼制：名称必填，天数可选。 */
function selfStartCraftFromPanel(panel) {
    const values = {};
    for (const input of panel.querySelectorAll('[data-self-new^="crafts."]')) {
        values[input.dataset.selfNew.split('.').pop()] = typeof input.value === 'string' ? input.value.trim() : '';
    }
    if (!values.name) { setSelfStatus('先写炼制什么再开工。'); return; }
    const count = Number(values.count);
    const days = Number(values.days);
    const result = applySelfOps([{
        op: 'startCraft',
        name: values.name,
        craft: values.craft || '炼药',
        ...(Number.isInteger(count) && count > 0 ? { count } : {}),
        ...(Number.isInteger(days) && days > 0 ? { days } : {}),
        note: values.note,
    }]);
    if (result.applied.length) {
        for (const input of panel.querySelectorAll('[data-self-new^="crafts."]')) input.value = '';
        setSelfStatus(result.applied[0].summary + '。');
        closeAgentModal(panel);
    } else {
        setSelfStatus(`未生效：${result.rejected[0]?.reason ?? '无变化'}`);
    }
}

/** 清单条目的一行：游戏背包式——名字一眼可见，点“详情”弹窗看全部资料。 */
function selfEntryRow({ list, id, label, detail, badges = [], actions = [] }) {
    const row = makeElement('div', 'dai-self-entry');
    const open = makeElement('button', 'dai-self-entry-open');
    open.type = 'button';
    open.dataset.selfDetail = `${list}:${id}`;
    open.title = '查看这条的完整资料';
    open.append(makeElement('b', '', label));
    if (badges.length) open.append(makeElement('span', 'dai-self-entry-badges', badges.join(' · ')));
    if (detail) open.append(makeElement('small', '', detail));
    row.append(open);
    if (actions.length) {
        const wrap = makeElement('div', 'dai-self-entry-actions');
        for (const action of actions) wrap.append(action);
        row.append(wrap);
    }
    return row;
}

function selfActionButton(text, dataset) {
    const button = makeElement('button', 'dai-secondary-button', text);
    button.type = 'button';
    Object.assign(button.dataset, dataset);
    return button;
}

/** 纳戒条目详情弹窗：全部字段固定标签展示 + 这条该有的操作。 */
function openSelfDetailModal(panel, list, id) {
    const snapshot = agentSelfRuntime.snapshot();
    const key = { techniques: 'techniques', skills: 'skills', items: 'items', recipes: 'recipes', crafts: 'crafts', goals: 'goals' }[list];
    const entry = snapshot[key]?.find(item => item.id === id);
    if (!entry) { setSelfStatus('这条已经不在纳戒里了，刷新一下。'); return; }
    const labels = {
        name: '名称', grade: '品级', type: '类型', progress: '进度', source: '来源', note: '备注',
        category: '类别', count: '数量', equipped: '装备中', materials: '材料', craft: '工艺',
        status: '状态', startDay: '开工天', endDay: '预计完工', done: '已达成', priority: '优先级', due: '期限', text: '目标',
    };
    const page = makeElement('div', 'dai-profile');
    const head = makeElement('div', 'dai-profile-head');
    const kindLabel = { techniques: '功法', skills: '斗技', items: '行囊', recipes: '配方', crafts: '炼制', goals: '目标' }[list] ?? list;
    head.append(makeElement('b', 'dai-profile-name', `${kindLabel} · ${entry.name}`));
    page.append(head);
    const rowsOf = {
        techniques: [['name'], ['grade'], ['type'], ['progress'], ['source'], ['note'], ['id', '编号']],
        skills: [['name'], ['grade'], ['type'], ['progress'], ['source'], ['note'], ['id', '编号']],
        items: [['name'], ['category'], ['grade'], ['count'], ['equipped'], ['source'], ['note'], ['id', '编号']],
        recipes: [['name'], ['craft'], ['grade'], ['materials'], ['note'], ['id', '编号']],
        crafts: [['name'], ['craft'], ['count'], ['status'], ['startDay'], ['endDay'], ['note'], ['id', '编号']],
        goals: [['text'], ['priority'], ['due'], ['done'], ['source'], ['note'], ['id', '编号']],
    }[list] ?? [];
    const group = makeElement('section', 'dai-profile-group');
    for (const [field, label] of rowsOf) {
        let shown = entry[field];
        if (field === 'equipped') shown = entry.equipped ? '装备中' : '未装备';
        else if (field === 'done') shown = entry.done ? '已达成' : '进行中';
        else if (field === 'status') shown = entry.status === 'open' ? '炼制中' : entry.status === 'success' ? '炼成' : '炸炉';
        else if (field === 'startDay') shown = entry.startDay !== null && entry.startDay !== undefined ? `第 ${entry.startDay} 天开工` : '';
        else if (field === 'endDay') shown = entry.endDay !== null && entry.endDay !== undefined ? `第 ${entry.endDay} 天` : '';
        const row = makeElement('div', 'dai-profile-row');
        row.append(makeElement('span', 'dai-profile-label', label ?? labels[field] ?? field));
        row.append(makeElement('span', 'dai-profile-value', String(shown ?? '') || '—'));
        group.append(row);
    }
    page.append(group);
    const actions = makeElement('div', 'dai-turn-actions');
    if (list === 'items') {
        const equip = selfActionButton(entry.equipped ? '卸下' : '装备', { selfEquip: entry.id });
        equip.dataset.modalAfter = 'close';
        const remove = selfActionButton('移除', { selfRemove: `items:${entry.id}` });
        remove.dataset.modalAfter = 'close';
        actions.append(equip);
        const countBox = makeElement('span', 'dai-setting-inline');
        const countInput = makeElement('input');
        countInput.type = 'number';
        countInput.min = '0';
        countInput.step = '1';
        countInput.value = String(entry.count ?? 1);
        countInput.dataset.selfCountInput = entry.id;
        countInput.setAttribute('aria-label', `${entry.name} 数量`);
        countBox.append(countInput, selfActionButton('改数量', { selfCountSet: entry.id }));
        actions.append(countBox, remove);
    } else if (list === 'crafts') {
        if (entry.status === 'open') {
            const success = selfActionButton('成丹', { selfFinish: `${entry.id}:success` });
            success.dataset.modalAfter = 'close';
            const fail = selfActionButton('炸炉', { selfFinish: `${entry.id}:fail` });
            fail.dataset.modalAfter = 'close';
            actions.append(success, fail);
        }
    } else if (list === 'goals') {
        if (!entry.done) {
            const finish = selfActionButton('达成', { selfGoalFinish: entry.id });
            finish.dataset.modalAfter = 'close';
            actions.append(finish);
        }
        const remove = selfActionButton('移除', { selfRemove: `goals:${entry.id}` });
        remove.dataset.modalAfter = 'close';
        actions.append(remove);
    } else {
        const remove = selfActionButton('移除', { selfRemove: `${list}:${entry.id}` });
        remove.dataset.modalAfter = 'close';
        actions.append(remove);
    }
    if (actions.childElementCount) page.append(actions);
    openAgentModal(panel, `${kindLabel} · ${entry.name}`, page);
}

function renderSelfEntryList(container, list) {
    if (!container) return;
    const snapshot = agentSelfRuntime.snapshot();
    if (list === 'techniques') {
        const entries = snapshot.techniques;
        container.replaceChildren(...(entries.length ? entries.map(entry => selfEntryRow({
            list,
            id: entry.id,
            label: entry.name,
            badges: [entry.grade, entry.progress].filter(Boolean),
            detail: [entry.type, entry.source, entry.note].filter(Boolean).join(' · '),
        })) : [makeElement('p', 'dai-turn-result', '还没有功法。学会了功法、模型替你记账后都会出现在这里。')]));
        return;
    }
    if (list === 'skills') {
        const entries = snapshot.skills;
        container.replaceChildren(...(entries.length ? entries.map(entry => selfEntryRow({
            list,
            id: entry.id,
            label: entry.name,
            badges: [entry.grade, entry.progress].filter(Boolean),
            detail: [entry.type, entry.source, entry.note].filter(Boolean).join(' · '),
        })) : [makeElement('p', 'dai-turn-result', '还没有斗技。')]));
        return;
    }
    if (list === 'items') {
        const entries = [...snapshot.items].sort((a, b) => (b.equipped === true) - (a.equipped === true) || b.count - a.count);
        container.replaceChildren(...(entries.length ? entries.map(entry => {
            const actions = [];
            const equip = selfActionButton(entry.equipped ? '卸下' : '装备', { selfEquip: entry.id });
            equip.dataset.modalAfter = 'close';
            actions.push(equip);
            return selfEntryRow({
                list,
                id: entry.id,
                label: entry.name,
                badges: [`×${entry.count}`, entry.grade, entry.equipped ? '装备中' : ''].filter(Boolean),
                detail: [entry.category, entry.note].filter(Boolean).join(' · '),
                actions,
            });
        }) : [makeElement('p', 'dai-turn-result', '行囊空空如也。')]));
        return;
    }
    if (list === 'recipes') {
        const entries = snapshot.recipes;
        container.replaceChildren(...(entries.length ? entries.map(entry => selfEntryRow({
            list,
            id: entry.id,
            label: entry.name,
            badges: [entry.grade].filter(Boolean),
            detail: [entry.craft, entry.materials, entry.note].filter(Boolean).join(' · '),
        })) : [makeElement('p', 'dai-turn-result', '还没有掌握配方。')]));
        return;
    }
    if (list === 'crafts') {
        const entries = [...snapshot.crafts].sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || (b.startDay ?? 0) - (a.startDay ?? 0));
        container.replaceChildren(...(entries.length ? entries.map(entry => {
            const actions = [];
            if (entry.status === 'open') {
                const success = selfActionButton('成丹', { selfFinish: `${entry.id}:success` });
                success.dataset.modalAfter = 'close';
                const fail = selfActionButton('炸炉', { selfFinish: `${entry.id}:fail` });
                fail.dataset.modalAfter = 'close';
                actions.push(success, fail);
            }
            return selfEntryRow({
                list,
                id: entry.id,
                label: entry.name,
                badges: [entry.craft || '炼制', agentSelfRuntime.craftLine(entry).split('，').slice(1).join('，')].filter(Boolean),
                detail: `第 ${entry.startDay ?? '?'} 天开工`,
                actions,
            });
        }) : [makeElement('p', 'dai-turn-result', '没有炼制记录。')]));
        return;
    }
    if (list === 'goals') {
        const entries = [...snapshot.goals].sort((a, b) => (a.done === true) - (b.done === true) || (a.priority === '主线' ? 0 : 1) - (b.priority === '主线' ? 0 : 1));
        container.replaceChildren(...(entries.length ? entries.map(entry => {
            const actions = [];
            if (!entry.done) {
                const finish = selfActionButton('达成', { selfGoalFinish: entry.id });
                finish.dataset.modalAfter = 'close';
                actions.push(finish);
            }
            return selfEntryRow({
                list,
                id: entry.id,
                label: `${entry.done ? '[已达成] ' : entry.priority === '主线' ? '★ ' : '· '}${entry.text}`,
                badges: [entry.due].filter(Boolean),
                detail: [entry.source, entry.note].filter(Boolean).join(' · '),
                actions,
            });
        }) : [makeElement('p', 'dai-turn-result', '还没有立下目标。')]));
    }
}

/** 纳戒页整页刷新：主角面板（固定标签）、各清单、流水与编辑表单。 */
function refreshSelfPage(panel) {
    const target = panel ?? (typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null);
    if (!target || target.hidden) return;
    const section = target.querySelector('[data-settings-section="self"]');
    if (!section || section.hidden) return;
    const status = agentSelfRuntime.status();
    const snapshot = agentSelfRuntime.snapshot();
    // —— 主角面板：标签固定，读到了就填，没读到就空着 ——
    for (const row of section.querySelectorAll('[data-self-panel]')) {
        const field = row.dataset.selfPanel;
        let shown = '';
        if (field === 'realm') shown = [snapshot.realm.realm, snapshot.realm.stage].filter(Boolean).join('·');
        else if (field === 'gold') shown = `${snapshot.gold ?? 0} 金币`;
        else if (field === 'titles') shown = snapshot.titles.join('、');
        else shown = typeof snapshot.profile[field] === 'string' ? snapshot.profile[field] : '';
        row.textContent = shown || '—';
        row.classList.toggle('is-empty', !shown);
    }
    const summary = section.querySelector('[data-self-summary]');
    if (summary) {
        const realm = `${status.realm.realm}${status.realm.stage || ''}`;
        summary.textContent = [
            `第 ${status.day} 天`,
            status.profile.name ? `${status.profile.name}` : '（未命名）',
            realm !== '' ? realm : '（无境界）',
            `功法 ${status.techniques}`,
            `斗技 ${status.skills}`,
            `行囊 ${status.items} 件`,
            `炼制中 ${status.crafting}`,
            `目标 ${status.goals}`,
        ].join(' · ');
    }
    for (const input of section.querySelectorAll('[data-self-profile-input]')) {
        input.value = typeof snapshot.profile[input.dataset.selfProfileInput] === 'string' ? snapshot.profile[input.dataset.selfProfileInput] : '';
    }
    const realmInput = section.querySelector('[data-self-realm]');
    if (realmInput) realmInput.value = snapshot.realm.realm ?? '';
    const stageInput = section.querySelector('[data-self-stage]');
    if (stageInput) stageInput.value = snapshot.realm.stage ?? '';
    const goldInput = section.querySelector('[data-self-gold]');
    if (goldInput) goldInput.value = String(snapshot.gold ?? 0);
    const dbBridgeLine = section.querySelector('[data-self-dbbridge]');
    if (dbBridgeLine) {
        const bridge = agentDbBridge.status();
        const labels = { off: '已关闭', missing: '未检测到龙血玄黄·数据库脚本', ready: '已连接', error: '异常' };
        dbBridgeLine.textContent = `数据库桥接：${labels[bridge.status] || bridge.status}${bridge.status === 'error' && bridge.message ? `（${bridge.message}）` : ''}`;
    }
    const titles = section.querySelector('[data-self-titles]');
    if (titles) {
        titles.replaceChildren(...(snapshot.titles.length ? snapshot.titles.map(title => {
            const chip = makeElement('span', 'dai-self-title');
            chip.append(document.createTextNode(title));
            const remove = makeElement('button', 'dai-self-title-remove', '×');
            remove.type = 'button';
            remove.dataset.selfTitleRemove = title;
            remove.setAttribute('aria-label', `移除称号 ${title}`);
            chip.append(remove);
            return chip;
        }) : [makeElement('p', 'dai-turn-result', '还没有称号。')]));
    }
    for (const key of ['techniques', 'skills', 'items', 'recipes', 'crafts', 'goals']) {
        renderSelfEntryList(section.querySelector(`[data-self-list="${key}"]`), key);
    }
    const journal = section.querySelector('[data-self-journal]');
    if (journal) {
        const entries = agentSelfRuntime.journal().slice(0, 8);
        journal.replaceChildren(...(entries.length ? entries.map(entry => {
            const item = makeElement('p', 'dai-turn-result');
            item.append(makeElement('b', '', `${journalSourceLabel(entry.source)}：`), document.createTextNode(entry.summaries.join('；') || '（无变化）'));
            return item;
        }) : [makeElement('p', 'dai-turn-result', '还没有纳戒指令执行记录。生成后模型的决定会记在这里。')]));
    }
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
        setNpcLedgerStatus('还没配好模型连接：先在“模型设置”页选好连接，才能按世界书重抽。');
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

function restoreNpcColdFromChat() {
    const record = hostStorage?.npcColdState?.();
    if (record?.status === 'ready' && record.value) return agentNpcColdRuntime.restore(record.value);
    return agentNpcColdRuntime.reset();
}

function persistNpcCold() {
    const result = hostStorage?.saveNpcColdState?.(agentNpcColdRuntime.snapshot());
    if (result && typeof result.catch === 'function') result.catch(() => { /* 冷藏台下次操作重试 */ });
    return result;
}

function npcColdSettings() {
    const settings = currentSettings();
    const npc = settings.npc ?? {};
    return {
        enabled: settings.enableNpcLedger !== false,
        connection: npc.coldMode === 'custom' ? 'custom' : 'tavern',
        model: typeof npc.coldModel === 'string' ? npc.coldModel.trim() : '',
        baseUrl: typeof npc.coldBaseUrl === 'string' ? npc.coldBaseUrl.trim() : '',
        apiKey: typeof npc.coldApiKey === 'string' ? npc.coldApiKey.trim() : '',
        provider: npc.coldProvider === 'anthropic' ? 'anthropic' : npc.coldProvider === 'openai' ? 'openai' : '',
        temperature: impactParam(npc.coldTemperature, 2),
        maxTokens: Number.isInteger(npc.coldMaxTokens) && npc.coldMaxTokens > 0 ? Math.min(32768, npc.coldMaxTokens) : undefined,
        topP: impactParam(npc.coldTopP, 1),
        presencePenalty: impactParam(npc.coldPresencePenalty, 2),
        frequencyPenalty: impactParam(npc.coldFrequencyPenalty, 2),
        floors: Number.isInteger(npc.ledgerFloors) && npc.ledgerFloors > 0 ? Math.min(12, npc.ledgerFloors) : 2,
        prompt: typeof npc.coldPrompt === 'string' && npc.coldPrompt.trim() ? npc.coldPrompt.trim() : NPC_COLD_PROMPT,
    };
}

function npcColdOverrides(settings) {
    return {
        connection: settings.connection,
        custom: settings.connection === 'custom'
            ? { baseUrl: settings.baseUrl, apiKey: settings.apiKey, provider: settings.provider, model: settings.model }
            : undefined,
        model: settings.model || undefined,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        topP: settings.topP,
        presencePenalty: settings.presencePenalty,
        frequencyPenalty: settings.frequencyPenalty,
    };
}

function coldFloors(limit) {
    const chat = Array.isArray(getHostContext()?.chat) ? getHostContext().chat : [];
    return impactConversation(chat, limit).floors;
}

let npcColdRunning = false;

async function runNpcColdPreview() {
    const settings = npcColdSettings();
    if (!settings.enabled) { setNpcLedgerStatus('人物簿已关闭，冷藏人物不会推进。'); return { status: 'disabled' }; }
    if (npcColdRunning) return { status: 'busy' };
    if (settings.connection !== 'custom' && agentLlmClient.configured() !== true) {
        setNpcLedgerStatus('还没配好冷藏推进用的模型连接。');
        return { status: 'not_configured' };
    }
    const records = agentNpcLedger.list();
    const candidates = agentNpcColdRuntime.candidates({ day: worldDay(), records, worldSnapshot: agentWorldRuntime.snapshot(), floors: coldFloors(settings.floors) });
    // 第一次扫描可能只是建立当天基线；即使没有草稿，也要把这个基线存进当前聊天，避免刷新后把旧事件误当成新事件。
    persistNpcCold();
    if (!candidates.length) {
        setNpcLedgerStatus(`没有需要补的冷藏人物：当前第 ${worldDay()} 天，且没有新的牵连事件。`);
        return { status: 'nothing_due', previews: [] };
    }
    npcColdRunning = true;
    setNpcLedgerStatus(`正在为 ${candidates.length} 个冷藏人物准备推进草稿……`);
    const previews = [];
    const failed = [];
    try {
        for (const candidate of candidates) {
            try {
                const raw = await agentLlmClient.complete({
                    system: settings.prompt,
                    user: buildNpcColdUser({ record: candidate.record, fromDay: candidate.fromDay, toDay: candidate.toDay, events: candidate.events, floors: candidate.floors }),
                    jsonSchema: NPC_RECORD_JSON_SCHEMA,
                    overrides: npcColdOverrides(settings),
                });
                const parsed = parseNpcRecordReply(raw);
                if (parsed.status !== 'ok') { failed.push(candidate.name); continue; }
                const patches = parsed.patches.filter(item => item && typeof item === 'object').map(item => ({ ...item, 姓名: candidate.name }));
                const preview = { ...candidate, patch: { 人物: patches } };
                agentNpcColdRuntime.rememberPreview({ id: candidate.id, name: candidate.name, fromDay: candidate.fromDay, toDay: candidate.toDay, eventIds: candidate.eventIds, patch: preview.patch });
                previews.push(preview);
            } catch (error) {
                failed.push(`${candidate.name}（${error?.message ?? error}）`);
            }
        }
        persistNpcCold();
    } finally {
        npcColdRunning = false;
    }
    setNpcLedgerStatus(`冷藏草稿已生成 ${previews.length} 份${failed.length ? `；失败 ${failed.join('、')}` : ''}。请逐份确认后才会写回人物簿。`);
    refreshNpcLedgerPage();
    return { status: 'previewed', previews, failed };
}

function confirmNpcColdPreview(id) {
    const wanted = String(id || '').trim();
    const preview = agentNpcColdRuntime.status().previews.find(item => item.id === wanted && item.status === 'pending');
    if (!preview) return { status: 'not_found' };
    const patch = preview.patch && typeof preview.patch === 'object' ? preview.patch : { 人物: [] };
    const result = applyNpcLedgerPayload(patch, { source: '冷藏推进', floor: lastReplyIndex(getHostContext()?.chat || []) });
    if (!['applied', 'ignored', 'empty'].includes(result.status)) return { status: 'failed', result };
    agentNpcColdRuntime.mark(preview.name, { day: preview.toDay, eventIds: preview.eventIds, floor: lastReplyIndex(getHostContext()?.chat || []), status: 'confirmed' });
    persistNpcLedger();
    persistNpcCold();
    setNpcLedgerStatus(`已确认 ${preview.name} 的冷藏推进；人物簿已更新。`);
    refreshNpcLedgerPage();
    return { status: 'confirmed', result };
}

function discardNpcColdPreview(id) {
    const result = agentNpcColdRuntime.discard(id);
    persistNpcCold();
    setNpcLedgerStatus('已放弃这份冷藏草稿，人物簿没有变化。');
    refreshNpcLedgerPage();
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
        setNpcLedgerStatus('还没配好模型连接：先在“模型设置”页选好连接，人物记录员才能跑。');
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
    // 一人一张小卡：名字 + 两行摘要 + 好感；行尾只留在场/重要/冷藏三个图标开关。
    list.replaceChildren(...records.slice(0, npcLedgerShown).map(record => {
        const item = makeElement('li', 'dai-npc-card');
        if (injected.has(record.name)) item.classList.add('is-injected');
        if (record.importance === '重要') item.classList.add('is-important');
        const open = makeElement('button', 'dai-npc-card-main');
        open.type = 'button';
        open.dataset.npcLedgerOpen = record.name;
        open.title = '打开这个人的信息面板';
        const mark = makeElement('span', 'dai-npc-card-dot', record.presence === '在场' ? '●' : '○');
        mark.title = record.presence === '在场' ? '在场' : '不在场';
        const name = makeElement('b', 'dai-npc-card-name', record.name);
        const favor = makeElement('span', 'dai-npc-card-favor', `${record.favor > 0 ? '+' : ''}${record.favor}`);
        const line1 = makeElement('span', 'dai-npc-card-line');
        line1.textContent = [record.identity, record.gender, record.age].filter(Boolean).join(' · ') || '（身份待补）';
        const line2 = makeElement('span', 'dai-npc-card-line is-muted');
        line2.textContent = [record.location ? `@${record.location}` : '', favorLabel(record.favor) || '关系未定', record.importance === '重要' ? '重要' : ''].filter(Boolean).join(' · ');
        open.append(mark, name, favor, line1, line2);
        const actions = makeElement('span', 'dai-npc-card-actions');
        const presence = makeElement('button', 'dai-npc-icon-button', record.presence === '在场' ? '离' : '到');
        presence.type = 'button';
        presence.dataset.npcLedgerPresence = record.name;
        presence.title = record.presence === '在场' ? '改不在场' : '改在场';
        const importance = makeElement('button', 'dai-npc-icon-button', record.importance === '重要' ? '★' : '☆');
        importance.type = 'button';
        importance.dataset.npcLedgerImportance = record.name;
        importance.title = record.importance === '重要' ? '降为普通' : '标为重要';
        const coldSelected = agentNpcColdRuntime.status().selected.includes(record.name);
        const cold = makeElement('button', `dai-npc-icon-button${coldSelected ? ' is-active' : ''}`, '❄');
        cold.type = 'button';
        cold.dataset.npcColdToggle = record.name;
        cold.title = coldSelected ? '取消冷藏' : '勾进冷藏推进台';
        actions.append(presence, importance, cold);
        item.append(open, actions);
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

function renderNpcColdPreviews(panel) {
    const target = panel?.querySelector?.('[data-npc-cold-previews]');
    if (!target) return;
    const previews = agentNpcColdRuntime.status().previews.filter(item => item.status === 'pending');
    if (!previews.length) {
        target.replaceChildren(makeElement('p', 'dai-impact-empty', '还没有待确认的冷藏草稿。先勾选人物，再点“扫描需要推进的人物”。'));
        return;
    }
    target.replaceChildren(...previews.map(preview => {
        const item = makeElement('div', 'dai-impact-item');
        const patchItems = Array.isArray(preview.patch?.人物) ? preview.patch.人物 : [];
        const detail = patchItems.length ? JSON.stringify(preview.patch, null, 2) : '模型判断这段时间没有足够依据，确认后只会记下“已检查”，不会改人物档案。';
        item.append(
            makeElement('b', '', `${preview.name}：第 ${preview.fromDay} 天 → 第 ${preview.toDay} 天`),
            makeElement('small', 'dai-impact-meta', `牵连事件 ${preview.eventIds?.length ?? 0} 条 · ${patchItems.length ? '有档案变化草稿' : '没有档案变化'}`),
            makeElement('pre', 'dai-impact-detail', detail),
        );
        const actions = makeElement('div', 'dai-turn-actions');
        const confirm = makeElement('button', 'dai-run-button', '确认写回人物簿');
        confirm.type = 'button';
        confirm.dataset.npcColdConfirm = preview.id;
        const discard = makeElement('button', 'dai-secondary-button', '放弃');
        discard.type = 'button';
        discard.dataset.npcColdDiscard = preview.id;
        actions.append(confirm, discard);
        item.append(actions);
        return item;
    }));
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
    const coldSummary = target.querySelector('[data-npc-cold-summary]');
    if (coldSummary) {
        const cold = agentNpcColdRuntime.status();
        const pending = cold.previews.filter(item => item.status === 'pending').length;
        coldSummary.textContent = `当前世界日：第 ${worldDay()} 天 · 已选 ${cold.selected.length} 人${pending ? ` · 待确认草稿 ${pending} 份` : ''}`;
    }
    renderNpcLedgerList(target);
    renderNpcColdPreviews(target);
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
    closeAgentModal(panel);
    refreshNpcLedgerPage(panel);
    return result;
}

/* ── 人物档案弹窗与经历页 ────────────────────────────────
 * 人物簿列表默认只给一行摘要；点人名弹出完整档案页（全部字段按组展示）。
 * 经历单独一页逐条列出；精简调用让模型把雷同转变合并成少数几条。
 */

/** 弹出某个人的信息面板：字段可直接改，经历单独一页，流水只读。 */
function openNpcProfileModal(panel, name, { tab = 'fields' } = {}) {
    const record = agentNpcLedger.get(name);
    if (!record) return;
    const page = makeElement('div', 'dai-profile');
    page.dataset.npcProfile = record.name;
    const head = makeElement('div', 'dai-profile-head');
    const titleBox = makeElement('div');
    titleBox.append(makeElement('b', 'dai-profile-name', record.name));
    const subs = [];
    if (record.aliases.length) subs.push(`别名：${record.aliases.join('、')}`);
    if (record.titles.length) subs.push(`称号：${record.titles.join('、')}`);
    if (subs.length) titleBox.append(makeElement('small', 'dai-profile-sub', subs.join('　')));
    head.append(titleBox);
    const favor = makeElement('div', 'dai-profile-favor');
    favor.append(makeElement('b', '', `${record.favor > 0 ? '+' : ''}${record.favor}`), makeElement('small', '', favorLabel(record.favor) || '未定'));
    head.append(favor);
    page.append(head);

    const chips = makeElement('div', 'dai-profile-chips');
    chips.append(makeElement('span', 'dai-profile-chip', record.presence === '在场' ? '● 在场' : '○ 不在场'));
    if (record.importance === '重要') chips.append(makeElement('span', 'dai-profile-chip is-accent', '★ 重要'));
    if (record.location) chips.append(makeElement('span', 'dai-profile-chip', `@${record.location}`));
    if (record.identity) chips.append(makeElement('span', 'dai-profile-chip', record.identity));
    page.append(chips);

    const tabBar = makeElement('div', 'dai-npc-tabs');
    const panes = new Map();
    const tabDefs = [
        ['fields', '信息'],
        ['exp', `经历${record.exp.length ? ` ${record.exp.length}` : ''}`],
        ['log', `流水${record.log.length ? ` ${record.log.length}` : ''}`],
    ];
    const buttons = new Map();
    const show = id => {
        for (const [key, button] of buttons) button.classList.toggle('is-active', key === id);
        for (const [key, pane] of panes) pane.hidden = key !== id;
    };
    for (const [id, label] of tabDefs) {
        const button = makeElement('button', 'dai-npc-tab', label);
        button.type = 'button';
        button.addEventListener('click', () => show(id));
        buttons.set(id, button);
        tabBar.append(button);
    }
    page.append(tabBar);

    // —— 信息页：所有字段按组铺成两列，直接改，保存时整份写回 ——
    const fieldsPane = makeElement('div', 'dai-npc-pane');
    const groups = new Map();
    for (const field of NPC_FIELDS) {
        if (!groups.has(field.group)) groups.set(field.group, []);
        groups.get(field.group).push(field);
    }
    for (const [group, fields] of groups) {
        const block = makeElement('section', 'dai-profile-group');
        block.append(makeElement('b', 'dai-profile-group-title', group));
        const form = makeElement('div', 'dai-npc-form');
        form.append(...fields.map(field => npcProfileFieldCell(field, record)));
        block.append(form);
        fieldsPane.append(block);
    }
    const saveBar = makeElement('div', 'dai-turn-actions');
    const save = makeElement('button', 'dai-run-button', '保存信息');
    save.type = 'button';
    save.dataset.npcProfileSave = record.name;
    const status = makeElement('small', 'dai-npc-profile-status');
    status.dataset.npcProfileStatus = record.name;
    saveBar.append(save, status);
    fieldsPane.append(saveBar);

    // —— 经历页：逐条列出 + 手动补一条 + 精简 ——
    const expPane = makeElement('div', 'dai-npc-pane');
    const expList = makeElement('div', 'dai-npc-exp-list');
    if (!record.exp.length) expList.append(makeElement('p', 'dai-impact-empty', '还没有记下重大转变。正文里出现态度反转、立场变更时，记录员会写进这里。'));
    else {
        [...record.exp].reverse().forEach((entry, index) => {
            const originalIndex = record.exp.length - 1 - index;
            const row = makeElement('div', 'dai-npc-exp-row');
            row.append(makeElement('span', 'dai-exp-day', entry.day !== null && entry.day !== undefined ? `第 ${entry.day} 天` : '第 ? 天'));
            row.append(makeElement('span', 'dai-exp-text', entry.text));
            const remove = makeElement('button', 'dai-npc-icon-button is-danger', '×');
            remove.type = 'button';
            remove.title = '删掉这条经历';
            remove.dataset.npcExpRemove = String(originalIndex);
            remove.dataset.npcExpFor = record.name;
            row.append(remove);
            expList.append(row);
        });
    }
    expPane.append(expList);
    const expAdd = makeElement('div', 'dai-npc-exp-add');
    const expText = makeElement('input', 'dai-npc-exp-text-input');
    expText.type = 'text';
    expText.maxLength = 200;
    expText.placeholder = '这个人从此哪里不一样了？';
    expText.dataset.npcExpText = record.name;
    const expDay = makeElement('input', 'dai-npc-exp-day-input');
    expDay.type = 'number';
    expDay.min = '1';
    expDay.max = '99999';
    expDay.placeholder = '第几天';
    expDay.value = String(worldDay());
    expDay.dataset.npcExpDay = record.name;
    const expAddButton = makeElement('button', 'dai-secondary-button', '＋ 加一条');
    expAddButton.type = 'button';
    expAddButton.dataset.npcExpAdd = record.name;
    expAdd.append(expText, expDay, expAddButton);
    expPane.append(expAdd);
    const expActions = makeElement('div', 'dai-turn-actions');
    const condense = makeElement('button', 'dai-secondary-button', '精简经历');
    condense.type = 'button';
    condense.dataset.expCondense = record.name;
    condense.disabled = !record.exp.length;
    expActions.append(condense);
    expPane.append(expActions);

    // —— 流水页：只读，最近 30 条 ——
    const logPane = makeElement('div', 'dai-npc-pane');
    const logList = makeElement('div', 'dai-npc-log-list');
    if (!record.log.length) logList.append(makeElement('p', 'dai-impact-empty', '还没有流水。'));
    else {
        [...record.log].reverse().slice(0, 30).forEach(entry => {
            const row = makeElement('p', 'dai-exp-entry');
            if (entry.day !== null && entry.day !== undefined) row.append(makeElement('span', 'dai-exp-day', `第 ${entry.day} 天`));
            row.append(document.createTextNode(entry.text));
            logList.append(row);
        });
    }
    logPane.append(logList);

    panes.set('fields', fieldsPane);
    panes.set('exp', expPane);
    panes.set('log', logPane);
    for (const pane of panes.values()) page.append(pane);
    show(panes.has(tab) ? tab : 'fields');

    const actions = makeElement('div', 'dai-turn-actions');
    const presence = makeElement('button', 'dai-secondary-button', record.presence === '在场' ? '改不在场' : '改在场');
    presence.type = 'button';
    presence.dataset.npcLedgerPresence = record.name;
    const importance = makeElement('button', 'dai-secondary-button', record.importance === '重要' ? '降普通' : '标重要');
    importance.type = 'button';
    importance.dataset.npcLedgerImportance = record.name;
    const reextract = makeElement('button', 'dai-secondary-button', '按世界书重抽');
    reextract.type = 'button';
    reextract.dataset.npcLedgerExtract = record.name;
    reextract.title = '只补空着的设定字段；好感、流水、态度、处境不动。';
    const edit = makeElement('button', 'dai-secondary-button', '补一笔 JSON');
    edit.type = 'button';
    edit.dataset.npcLedgerEdit = record.name;
    edit.dataset.modalAfter = 'close';
    const forget = makeElement('button', 'dai-secondary-button is-danger', '删除档案');
    forget.type = 'button';
    forget.dataset.npcLedgerForget = record.name;
    actions.append(presence, importance, reextract, edit, forget);
    page.append(actions);
    openAgentModal(panel, `${record.name} · 人物信息`, page, { wide: true });
}

/** 信息面板里的一个字段：标签 + 对应控件；列表/物品/关系用一行一条的竖线格式。 */
function npcProfileFieldCell(field, record) {
    const cell = makeElement('label', 'dai-npc-field');
    const value = record[field.key];
    let control;
    if (field.type === 'enum') {
        control = document.createElement('select');
        for (const option of field.options) {
            const item = document.createElement('option');
            item.value = option;
            item.textContent = option;
            control.append(item);
        }
        control.value = field.options.includes(value) ? value : field.options[0];
    } else if (field.type === 'things' || field.type === 'triples' || field.type === 'secret') {
        control = document.createElement('textarea');
        control.rows = field.type === 'secret' ? 2 : 3;
        control.value = npcProfileFieldText(field, value);
    } else {
        control = document.createElement('input');
        control.type = 'text';
        control.value = Array.isArray(value) ? value.join('、') : String(value ?? '');
    }
    control.dataset.npcField = field.key;
    control.dataset.npcFieldType = field.type;
    control.spellcheck = false;
    cell.append(makeElement('span', 'dai-npc-field-label', field.label), control);
    if (field.type === 'things') {
        cell.append(makeElement('small', 'dai-npc-field-hint', field.key === 'clothes'
            ? '一行一件：名称|部位|品阶|状态'
            : '一行一件：名称|品阶|数量|来源|藏着|说明'));
    } else if (field.type === 'triples') {
        cell.append(makeElement('small', 'dai-npc-field-hint', '一行一人：对方|关系|态度'));
    } else if (field.type === 'secret') {
        cell.append(makeElement('small', 'dai-npc-field-hint', '瞒着谁|瞒什么事'));
    }
    return cell;
}

function npcProfileFieldText(field, value) {
    if (field.type === 'secret') {
        const secret = value && typeof value === 'object' ? value : {};
        return [secret.hideFrom ?? '', secret.what ?? ''].join('|');
    }
    if (field.type === 'triples') {
        return (Array.isArray(value) ? value : []).map(item => [item.who ?? '', item.relation ?? '', item.attitude ?? ''].join('|')).join('\n');
    }
    if (field.type === 'things') {
        return (Array.isArray(value) ? value : []).map(item => field.key === 'clothes'
            ? [item.name ?? '', item.part ?? '', item.grade ?? '', item.state ?? ''].join('|')
            : [item.name ?? '', item.grade ?? '', item.count ?? '', item.source ?? '', item.hidden ? '藏着' : '', item.detail ?? ''].join('|')).join('\n');
    }
    return Array.isArray(value) ? value.join('、') : String(value ?? '');
}

/** 读信息面板并写回：所有字段一起保存，清空就是清空。 */
function saveNpcProfileFields(panel, name) {
    const page = panel?.querySelector?.('[data-npc-profile]');
    if (!page) return { status: 'missing' };
    const fields = {};
    for (const control of page.querySelectorAll('[data-npc-field]')) {
        const key = control.dataset.npcField;
        const type = control.dataset.npcFieldType;
        const raw = typeof control.value === 'string' ? control.value : '';
        if (type === 'things') {
            fields[key] = raw.split(/\n+/).map(line => line.trim()).filter(Boolean).map(line => {
                const parts = line.split('|').map(part => part.trim());
                return key === 'clothes'
                    ? { 名称: parts[0] ?? '', 部位: parts[1] ?? '', 品阶: parts[2] ?? '', 状态: parts[3] ?? '' }
                    : { 名称: parts[0] ?? '', 品阶: parts[1] ?? '', 数量: parts[2] ?? '', 来源: parts[3] ?? '', 藏着: /^(藏着|是|true|1)$/i.test(parts[4] ?? ''), 说明: parts[5] ?? '' };
            });
        } else if (type === 'triples') {
            fields[key] = raw.split(/\n+/).map(line => line.trim()).filter(Boolean).map(line => {
                const parts = line.split('|').map(part => part.trim());
                return { 对方: parts[0] ?? '', 关系: parts[1] ?? '', 态度: parts[2] ?? '' };
            });
        } else if (type === 'secret') {
            const [hideFrom, what] = raw.split('|');
            fields[key] = { 瞒着谁: hideFrom ?? '', 瞒什么: what ?? '' };
        } else {
            fields[key] = raw;
        }
    }
    const result = agentNpcLedger.setFields(name, fields, { source: '手填' });
    const status = page.querySelector('[data-npc-profile-status]');
    if (result.status === 'updated') {
        persistNpcLedger();
        refreshNpcLedgerPage(panel);
        if (status) status.textContent = `已保存：${result.fields.join('、')}`;
        openNpcProfileModal(panel, name, { tab: 'fields' });
    } else if (result.status === 'unchanged') {
        if (status) status.textContent = '没有改动。';
    } else {
        if (status) status.textContent = '保存失败：这个人已经不在人物簿里了。';
    }
    return result;
}

/** 档案弹窗里东西条目的可读文本。 */
function thingTextForProfile(item) {
    if (typeof item === 'string') return item;
    if (!item || typeof item !== 'object') return '';
    const bits = [item.name];
    if (item.count !== undefined && item.count !== '' && item.count !== 1) bits.push(`×${item.count}`);
    for (const part of [item.part, item.grade, item.state, item.source, item.detail]) if (part) bits.push(part);
    if (item.hidden) bits.push('藏着');
    return bits.filter(Boolean).join('·');
}

let pendingExpCondense = null;

/** 经历精简：按人物调模型压缩，先出草稿；确认后才整清单替换写回。 */
async function runExpCondense(panel, name) {
    const who = String(name || '').trim();
    const group = agentNpcLedger.exps().find(item => item.name === who);
    if (!group || !group.entries.length) { setNpcLedgerStatus('这个人还没有经历可精简。'); return; }
    const settings = npcLedgerSettings();
    if (settings.connection !== 'custom' && agentLlmClient.configured() !== true) {
        setNpcLedgerStatus('还没配好模型连接：先在“模型设置”页选好连接，精简才能跑。');
        return;
    }
    setNpcLedgerStatus(`正在请模型精简 ${who} 的经历……`);
    try {
        const raw = await agentLlmClient.complete({
            system: typeof currentSettings().npc?.expCondensePrompt === 'string' && currentSettings().npc.expCondensePrompt.trim()
                ? currentSettings().npc.expCondensePrompt.trim() : EXP_CONDENSE_PROMPT,
            user: buildExpCondenseUser({ name: group.name, summary: agentNpcLedger.get(who)?.identity ?? '', entries: group.entries }),
            jsonSchema: { type: 'object', properties: { 经历: { type: 'array' } }, required: ['经历'] },
            overrides: npcLedgerOverrides(settings, { temperature: 0.2, maxTokens: 1600 }),
        });
        const parsed = parseExpCondenseReply(raw);
        if (parsed.status !== 'ok') {
            setNpcLedgerStatus(`精简输出读不懂，经历没动：${parsed.reason}`);
            return;
        }
        pendingExpCondense = { name: group.name, entries: parsed.entries };
        const preview = makeElement('div', 'dai-exp-preview');
        preview.append(makeElement('p', 'dai-turn-result', `原来 ${group.entries.length} 条 → 精简后 ${parsed.entries.length} 条。确认后整份替换 ${who} 的经历清单。`));
        const before = makeElement('details', 'dai-exp-side');
        before.append(makeElement('summary', '', '精简前'));
        before.append(...group.entries.map(entry => makeElement('p', 'dai-exp-entry', `${entry.day !== null ? `第${entry.day}天·` : ''}${entry.text}`)));
        const after = makeElement('details', 'dai-exp-side');
        after.append(makeElement('summary', '', '精简后'));
        after.open = true;
        after.append(...parsed.entries.map(entry => makeElement('p', 'dai-exp-entry', `${Number.isFinite(Number(entry?.day)) && entry?.day !== null ? `第${Number(entry.day)}天·` : ''}${entry?.text ?? ''}`)));
        preview.append(before, after);
        const actions = makeElement('div', 'dai-turn-actions');
        const confirm = makeElement('button', 'dai-run-button', '确认写回');
        confirm.type = 'button';
        confirm.dataset.expCondenseConfirm = group.name;
        const cancel = makeElement('button', 'dai-secondary-button', '放弃');
        cancel.type = 'button';
        cancel.dataset.agentModalClose = '';
        actions.append(confirm, cancel);
        preview.append(actions);
        openAgentModal(panel, `精简经历 · ${group.name}`, preview, { wide: true });
        setNpcLedgerStatus('精简草稿已出，请确认后写回。');
    } catch (error) {
        setNpcLedgerStatus(`精简失败：${error?.message ?? error}`);
    }
}

function confirmExpCondense(panel, name) {
    const pending = pendingExpCondense;
    if (!pending || pending.name !== name) { setNpcLedgerStatus('没有待写回的精简草稿，先重新精简一次。'); return; }
    const result = agentNpcLedger.replaceExp(pending.name, pending.entries);
    if (result.status === 'replaced') {
        persistNpcLedger();
        setNpcLedgerStatus(`${pending.name} 的经历已精简：${result.before} 条 → ${result.after} 条。`);
    } else {
        setNpcLedgerStatus('写回失败：这个人已经不在人物簿里了。');
    }
    pendingExpCondense = null;
    closeAgentModal(panel);
    refreshNpcLedgerPage(panel);
    if (agentNpcLedger.find(name)) openNpcProfileModal(panel, name, { tab: 'exp' });
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
let impactReturnToLedger = false;

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
    // 纳戒：主角自身状态，与上面四路互不清空、预算各算各的。
    try { writeSelfInjectionForPrompt(); } catch { /* 纳戒注入失败不影响正文生成 */ }
    // 记忆：主角未了结的四类记忆，排在纳戒之后；与其它通道互不清空、预算各算各的。
    try { writeMemoryInjectionForPrompt(); } catch { /* 记忆注入失败不影响正文生成 */ }
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

/** 自定义判定的默认提示词模板：新建时铺进去，玩家按需改写。 */
const SETTLE_CUSTOM_PROMPT_TEMPLATE = [
    '你是《斗破苍穹》同人文字游戏的判定器，只判定这一类行动：（在这里写清你管什么、不管什么）。',
    '只输出一个 JSON 对象：{"effects":[{"targetId":"…","field":"…","type":"set|add|remove","value":数值,"allowNegative":false,"reason":"依据"}],"outcome":"判定结果一句话"}。',
    '可写字段只能从本轮给你的可用字段表里挑；单次增减幅度要有依据，没有依据就不写。',
    '没有需要记下的变化就输出 {"effects":[],"outcome":"本轮无可记变化"}，绝不为凑数而编效果。',
].join('\n');

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/** 一个自定义判定 = 一条可折叠的名称+提示词编辑区。 */
function settleCustomCategoryHtml(category) {
    const name = escapeHtml(category.name || '');
    const id = escapeHtml(category.id || '');
    return `<details class="dai-settle-category" data-settle-custom-id="${id}"><summary><span class="dai-feature-icon">✚</span><span><b>${name || '未命名判定'}</b><small>自定义判定</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>判定名称</b><small>最多 12 个字；解析器按这个名字给行动归类。</small></span><input type="text" data-settle-custom-field="name" value="${name}" maxlength="12" placeholder="例如：炼器判定"></label><label class="dai-setting-row"><span><b>规则正文</b><small>这类行动的判定规则；保持"只输出 JSON"与 effects 字段名不变。</small></span><textarea data-settle-custom-field="prompt" rows="9" spellcheck="false" placeholder="写这类行动怎么判定">${escapeHtml(category.prompt || '')}</textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-settle-remove-category="${id}">删除这个判定</button><small>改动即时保存；删除不可恢复。</small></div></div></details>`;
}

function renderSettleCustomCategories(panel, openId = null) {
    const list = panel?.querySelector('[data-settle-custom-list]');
    if (!list) return;
    const categories = currentSettings().settle?.customCategories ?? [];
    list.innerHTML = categories.map(settleCustomCategoryHtml).join('');
    if (openId) {
        const item = list.querySelector(`[data-settle-custom-id="${CSS.escape(openId)}"]`);
        if (item) {
            item.open = true;
            item.scrollIntoView({ block: 'nearest' });
        }
    }
}

function saveSettleCustomCategories(categories) {
    const result = hostStorage.updateSettings({ settle: { customCategories: categories } });
    if (result.status === 'ready') void Promise.resolve(hostStorage.saveSettings()).catch(() => {});
    return result;
}

function updateSettleCustomCategory(id, patch) {
    const categories = (currentSettings().settle?.customCategories ?? [])
        .map(item => (item?.id === id ? { ...item, ...patch } : item));
    return saveSettleCustomCategories(categories);
}

function addSettleCustomCategory(panel) {
    const categories = (currentSettings().settle?.customCategories ?? []).slice();
    const status = panel?.querySelector('[data-settle-custom-status]');
    if (categories.length >= 8) {
        if (status) status.textContent = '自定义判定最多 8 个，先删一个再加。';
        return;
    }
    const id = `c${Date.now().toString(36)}${Math.floor(Math.random() * 36).toString(36)}`;
    categories.push({ id, name: '新判定', prompt: SETTLE_CUSTOM_PROMPT_TEMPLATE });
    saveSettleCustomCategories(categories);
    renderSettleCustomCategories(panel, id);
    if (status) status.textContent = '已添加：改个名字、写好规则就能用。';
}

function removeSettleCustomCategory(panel, id) {
    if (typeof window !== 'undefined' && !window.confirm('删除这个自定义判定？名字和提示词会一起删掉，不可恢复。')) return;
    saveSettleCustomCategories((currentSettings().settle?.customCategories ?? []).filter(item => item?.id !== id));
    renderSettleCustomCategories(panel);
}

/** 行动结算分类判定的连接与参数：mode 选 custom 时带上一整套自定义接口与采样覆盖。 */
function settleSettings() {
    const settle = currentSettings().settle ?? {};
    const custom = settle.mode === 'custom';
    // 玩家自定义判定：只认 id+名字+提示词齐全的条目；名字最长 12 字，最多 8 个。
    const customCategories = (Array.isArray(settle.customCategories) ? settle.customCategories : [])
        .filter(item => item && typeof item.id === 'string' && item.id.trim()
            && typeof item.name === 'string' && item.name.trim()
            && typeof item.prompt === 'string')
        .slice(0, 8)
        .map(item => ({ id: item.id.trim(), name: item.name.trim().slice(0, 12), prompt: item.prompt }));
    return {
        customCategories,
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
            const builtIn = resolveCategory(categoryId);
            if (builtIn) {
                const override = settle?.prompt?.[builtIn.id];
                return typeof override === 'string' && override.trim() ? override.trim() : builtIn.prompt;
            }
            const userDefined = customCategories.find(item => item.id === categoryId);
            return userDefined && typeof userDefined.prompt === 'string' ? userDefined.prompt.trim() : '';
        },
        labelFor: categoryId => resolveCategory(categoryId)?.label
            ?? customCategories.find(item => item.id === categoryId)?.name
            ?? '自定义判定',
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
        setWorldDecideStatus('模型连接未配置：先在“模型设置”页选好连接。');
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

let memoryDecideRunning = false;

function setMemoryDecideStatus(message) {
    const panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null;
    const target = panel?.querySelector('[data-memory-decide-status]');
    if (target) target.textContent = message;
}

function renderMemoryDecisionResult(decision, result) {
    const panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null;
    const target = panel?.querySelector('[data-memory-decide-result]');
    if (!target) return;
    const rows = [];
    for (const item of result?.applied ?? []) rows.push({ ok: true, text: item.summary });
    for (const item of result?.rejected ?? []) rows.push({ ok: false, text: `${item.op}：${item.reason}` });
    if (result?.duplicate?.length) rows.push({ ok: false, text: `重复跳过：${result.duplicate.join('、')}` });
    const note = document.createElement('p');
    note.className = 'dai-turn-result';
    note.textContent = decision?.note || '（模型没有说明）';
    const list = document.createElement('div');
    for (const row of rows) {
        const line = document.createElement('p');
        line.className = 'dai-turn-result';
        line.textContent = `${row.ok ? '✓' : '✗'} ${row.text}`;
        list.append(line);
    }
    target.replaceChildren(note, list);
}

/**
 * 记忆决定：读"最近聊天 + 相关世界书条目 + 记忆总账"，决定主角新记住了什么、了结了什么；
 * 输出严格 JSON 由脚本逐条校验落账（memory-runtime）。生成结束后自动跑；面板按钮或命名空间也能手动触发。
 */
async function runMemoryDecision({ source = 'auto' } = {}) {
    const settings = memorySettings();
    if (!settings.enabled) return { status: 'disabled' };
    if (!settings.decideEnabled) return { status: 'disabled' };
    if (memoryDecideRunning) return { status: 'busy' };
    // 自定义连接有自己的地址和密钥，不依赖全局配置；跟随酒馆才需要先检查全局连接。
    if (settings.overrides.connection !== 'custom' && agentLlmClient.configured() !== true) {
        setMemoryDecideStatus('模型连接未配置：先在"模型设置"页选好连接。');
        return { status: 'not_configured' };
    }
    memoryDecideRunning = true;
    setMemoryDecideStatus('模型正在决定……');
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
            setMemoryDecideStatus('聊天里还没有内容，书记官无从下手。');
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
        const user = buildMemoryDecideUser({ snapshot: agentMemoryRuntime.snapshot(), floors, worldbookLines: bookLines });
        const raw = await agentLlmClient.complete({
            system: settings.prompt,
            user,
            jsonSchema: MEMORY_JSON_SCHEMA,
            overrides: settings.overrides,
        });
        const decision = parseMemoryDecision(raw);
        if (decision.status === 'invalid') {
            setMemoryDecideStatus(`模型输出无法解析：${decision.error}`);
            return { status: 'invalid', error: decision.error };
        }
        const result = agentMemoryRuntime.apply(decision.ops, { source: 'decide', floor: lastReplyIndex(chat), day: worldDay() });
        persistMemory();
        if (!result.applied.length) agentMemoryRuntime.note(decision.note || '模型判断本轮无新记忆。', { source: 'decide' });
        renderMemoryDecisionResult(decision, result);
        setMemoryDecideStatus(source === 'auto' ? '生成后自动决定完成。' : '决定完成。');
        refreshMemoryPage();
        return { status: 'ok', decision, result };
    } catch (error) {
        setMemoryDecideStatus(`决定失败：${error?.message ?? error}`);
        return { status: 'failed', reason: String(error?.message ?? error) };
    } finally {
        memoryDecideRunning = false;
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
        setImpactStatus('模型连接未配置：先在“模型设置”页选好连接。');
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
    npcColdRuntime: agentNpcColdRuntime,
    npcLedgerExps: () => agentNpcLedger.exps(),
    npcLedgerReplaceExp: (name, entries) => agentNpcLedger.replaceExp(name, entries),
    npcColdSelect: name => { const result = agentNpcColdRuntime.select(name); persistNpcCold(); return result; },
    npcColdDeselect: name => { const result = agentNpcColdRuntime.deselect(name); persistNpcCold(); return result; },
    npcColdPreview: () => runNpcColdPreview(),
    npcColdConfirm: id => confirmNpcColdPreview(id),
    npcColdDiscard: id => discardNpcColdPreview(id),
    npcColdStatus: () => agentNpcColdRuntime.status(),
    npcColdRestoreFromChat: () => restoreNpcColdFromChat(),
    selfRuntime: agentSelfRuntime,
    selfInjection: writeSelfInjectionForPrompt,
    selfDecide: options => runSelfDecision(options),
    selfApply: (payload, context) => agentSelfRuntime.apply(payload, context),
    selfApplyPersisted: operations => applySelfOps(operations),
    selfApplyFromLatestReply: () => applySelfOpsFromLatestReply(),
    selfRestoreFromChat: () => restoreSelfFromChat(),
    selfStatus: () => agentSelfRuntime.status(),
    selfSnapshot: () => agentSelfRuntime.snapshot(),
    selfJournal: () => agentSelfRuntime.journal(),
    dbBridgeStatus: () => agentDbBridge.status(),
    dbBridgeAdopt: () => Promise.all([adoptWorldFromDb(), adoptSelfFromDb(), adoptMemoryFromDb()]),
    memoryRuntime: agentMemoryRuntime,
    memoryInjection: writeMemoryInjectionForPrompt,
    memoryDecide: options => runMemoryDecision(options),
    memoryApplyPersisted: operations => applyMemoryOps(operations),
    memoryApplyFromLatestReply: () => applyMemoryOpsFromLatestReply(),
    memoryRestoreFromChat: () => restoreMemoryFromChat(),
    memoryStatus: () => agentMemoryRuntime.status(),
    memorySnapshot: () => agentMemoryRuntime.snapshot(),
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

/* ── 弹窗：所有“添加 / 编辑 / 看详情”的表单都收进一个居中弹层，页面只留按钮。 ──
 * 停靠（dock）机制：表单平时藏在各页面底部的 data-modal-dock 容器里（display:none），
 * 打开时整块挪进弹窗体，关闭时送回原位。事件委托挂在面板上，挪来挪去不影响绑定。 */
function ensureAgentModal(panel) {
    if (!panel) return null;
    let modal = panel.querySelector(':scope > [data-agent-modal]');
    if (modal) return modal;
    modal = makeElement('div', 'dai-agent-modal');
    modal.hidden = true;
    modal.dataset.agentModal = '';
    const backdrop = makeElement('div', 'dai-agent-modal-backdrop');
    backdrop.dataset.agentModalClose = '';
    const dialog = makeElement('div', 'dai-agent-modal-dialog');
    const head = makeElement('header', 'dai-agent-modal-head');
    const title = makeElement('b', 'dai-agent-modal-title');
    const close = makeElement('button', 'dai-icon-button', '×');
    close.type = 'button';
    close.dataset.agentModalClose = '';
    close.setAttribute('aria-label', '关闭弹窗');
    head.append(title, close);
    const body = makeElement('div', 'dai-agent-modal-body');
    dialog.append(head, body);
    modal.append(backdrop, dialog);
    panel.append(modal);
    return modal;
}

/** 打开弹窗：dock 是要搬进来的那块表单容器；标题显示在弹窗头上。 */
function openAgentModal(panel, title, dock, { wide = false } = {}) {
    const modal = ensureAgentModal(panel);
    if (!modal || !dock) return;
    const body = modal.querySelector('.dai-agent-modal-body');
    // 已有别的弹层开着：先把旧内容送回停靠位并重新藏好，避免表单留在页面底部。
    for (const previous of [...body.children]) {
        if (previous.__dockHome) {
            previous.hidden = true;
            previous.__dockHome.append(previous);
        } else previous.remove();
    }
    if (!dock.__dockHome) dock.__dockHome = dock.parentNode;
    if (dock.parentNode !== body) body.append(dock);
    dock.hidden = false;
    modal.querySelector('.dai-agent-modal-title').textContent = title;
    if (wide) modal.dataset.wide = 'true';
    else delete modal.dataset.wide;
    modal.hidden = false;
    dock.querySelector?.('input, textarea, select')?.focus?.();
}

function closeAgentModal(panel) {
    if (!panel) return;
    const modal = panel.querySelector(':scope > [data-agent-modal]');
    if (!modal || modal.hidden) return false;
    const body = modal.querySelector('.dai-agent-modal-body');
    for (const previous of [...body.children]) {
        // 停靠位是“藏着等下一次打开”的表单：送回后必须重新 hidden，
        // 否则它会以普通卡片的样子留在页面最底部（纳戒各页、世界影响都中过这一枪）。
        if (previous.__dockHome) {
            previous.hidden = true;
            previous.__dockHome.append(previous);
        } else previous.remove();
    }
    modal.hidden = true;
    return true;
}

/** 面板级委托：点 data-modal-open 把对应 dock 搬进弹窗，点关闭/背板送回去。 */
function bindModalActions(panel) {
    panel.addEventListener('click', event => {
        if (event.target.closest?.('[data-agent-modal-close]')) {
            if (closeAgentModal(panel)) event.stopPropagation();
            return;
        }
        const opener = event.target.closest?.('[data-modal-open]');
        if (!opener) return;
        const dock = panel.querySelector(`[data-modal-dock="${CSS.escape(opener.dataset.modalOpen)}"]`);
        if (dock) openAgentModal(panel, opener.dataset.modalTitle || '填写', dock, { wide: opener.dataset.modalWide === 'true' });
    });
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
    refreshOpenOrbPanel();
}

// —— 悬浮球：屏幕边上一颗小球，点开竖直拉长成胶囊长条，点图标弹出只读信息窗。
// 纯逻辑（图标清单/状态机/信息窗投影）在 host/orb-hud.js，这里只管 DOM 与挂载。——

let orbDragMoved = false;
let orbResizeBound = false;

/** 把设置里记下的位置贴到球上；没记过就留在 CSS 默认的右侧。 */
function applyOrbPosition() {
    if (!orbElement || typeof window === 'undefined') return;
    const saved = currentSettings().orb ?? {};
    const x = Number(saved.x);
    const y = Number(saved.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        orbElement.style.left = '';
        orbElement.style.top = '';
        orbElement.style.right = '';
        orbElement.style.bottom = '';
        orbElement.dataset.side = 'right';
        return;
    }
    const width = orbElement.offsetWidth || 48;
    const height = orbElement.offsetHeight || 48;
    const maxX = Math.max(4, window.innerWidth - width - 4);
    const maxY = Math.max(4, window.innerHeight - height - 4);
    const left = Math.min(Math.max(4, x), maxX);
    const top = Math.min(Math.max(4, y), maxY);
    orbElement.style.left = `${Math.round(left)}px`;
    orbElement.style.top = `${Math.round(top)}px`;
    orbElement.style.right = 'auto';
    orbElement.style.bottom = 'auto';
    // 球在左半边时信息窗往右弹，反之往左弹，保证不出屏。
    orbElement.dataset.side = left + width / 2 < window.innerWidth / 2 ? 'left' : 'right';
}

function persistOrbPosition() {
    if (!orbElement) return;
    const rect = orbElement.getBoundingClientRect();
    hostStorage ??= createHostStorage({ getContext: getHostContext });
    const result = hostStorage.updateSettings({ orb: { x: Math.round(rect.left), y: Math.round(rect.top) } });
    if (result.status === 'ready') Promise.resolve(hostStorage.saveSettings()).catch(() => { /* 下次拖动再存 */ });
    applyOrbPosition();
}

/** 按住球就能拖：移动超过 4px 才算拖，松手不触发展开。 */
function bindOrbDrag(ball) {
    let start = null;
    ball.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !orbElement) return;
        const rect = orbElement.getBoundingClientRect();
        start = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
        orbDragMoved = false;
        ball.setPointerCapture?.(event.pointerId);
    });
    ball.addEventListener('pointermove', event => {
        if (!start || start.pointerId !== event.pointerId) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (!start.moved && Math.hypot(dx, dy) < 4) return;
        start.moved = true;
        orbDragMoved = true;
        orbElement.classList.add('is-dragging');
        const width = orbElement.offsetWidth || 48;
        const height = orbElement.offsetHeight || 48;
        const maxX = Math.max(4, window.innerWidth - width - 4);
        const maxY = Math.max(4, window.innerHeight - height - 4);
        const left = Math.min(Math.max(4, start.left + dx), maxX);
        const top = Math.min(Math.max(4, start.top + dy), maxY);
        orbElement.style.left = `${Math.round(left)}px`;
        orbElement.style.top = `${Math.round(top)}px`;
        orbElement.style.right = 'auto';
        orbElement.style.bottom = 'auto';
        orbElement.dataset.side = left + width / 2 < window.innerWidth / 2 ? 'left' : 'right';
        event.preventDefault();
    });
    const finish = event => {
        if (!start || (event?.pointerId !== undefined && start.pointerId !== event.pointerId)) return;
        const moved = start.moved;
        start = null;
        orbElement?.classList.remove('is-dragging');
        ball.releasePointerCapture?.(event?.pointerId);
        if (moved) persistOrbPosition();
    };
    ball.addEventListener('pointerup', finish);
    ball.addEventListener('pointercancel', finish);
}

function mountOrbHud() {
    if (typeof document === 'undefined' || !document.body) return;
    orbElement = document.getElementById(ORB_ID);
    if (!orbElement) {
        orbElement = makeElement('aside', 'dai-orb');
        orbElement.id = ORB_ID;
        const capsule = makeElement('div', 'dai-orb-capsule');
        const ball = makeElement('button', 'dai-orb-ball', '✦');
        ball.type = 'button';
        ball.title = '拖动可以搬家；单击展开 / 收起';
        ball.setAttribute('aria-expanded', 'false');
        bindOrbDrag(ball);
        ball.addEventListener('click', event => {
            // 拖动结束时浏览器仍会补一次 click：这里只吞掉拖动，不让它误触展开。
            if (orbDragMoved) { event.preventDefault(); event.stopPropagation(); return; }
            orbState.toggle();
            syncOrbHud();
        });
        capsule.append(ball);
        for (const item of ORB_ITEMS) {
            const icon = makeElement('button', 'dai-orb-icon', item.icon);
            icon.type = 'button';
            icon.dataset.orbItem = item.id;
            icon.title = `${item.title} · ${item.hint}`;
            icon.setAttribute('aria-label', `查看${item.title}信息`);
            icon.addEventListener('click', () => { orbState.select(item.id); syncOrbHud(); });
            capsule.append(icon);
        }
        const panel = makeElement('section', 'dai-orb-panel');
        panel.hidden = true;
        panel.setAttribute('role', 'region');
        panel.setAttribute('aria-label', 'Agent 功能信息');
        orbElement.append(panel, capsule);
        document.body.append(orbElement);
    }
    if (!orbDocumentClick) {
        orbDocumentClick = event => {
            if (!orbElement || orbState.collapsed || orbElement.contains(event.target)) return;
            orbState.collapse();
            syncOrbHud();
        };
        document.addEventListener('pointerdown', orbDocumentClick, true);
    }
    if (!orbDocumentKey) {
        orbDocumentKey = event => {
            if (event.key !== 'Escape' || !orbElement || orbState.collapsed) return;
            orbState.collapse();
            syncOrbHud();
        };
        document.addEventListener('keydown', orbDocumentKey);
    }
    if (!orbResizeBound) {
        orbResizeBound = true;
        window.addEventListener('resize', () => applyOrbPosition());
    }
    syncOrbHud();
    applyOrbPosition();
}

function syncOrbHud() {
    if (!orbElement) return;
    const icons = [...orbElement.querySelectorAll('.dai-orb-icon')];
    icons.forEach((icon, index) => {
        icon.style.transitionDelay = orbState.collapsed ? '0ms' : `${90 + index * 26}ms`;
        icon.classList.toggle('is-active', orbState.panelId === icon.dataset.orbItem);
    });
    orbElement.dataset.state = orbState.collapsed ? 'collapsed' : 'expanded';
    const capsule = orbElement.querySelector('.dai-orb-capsule');
    // 收起＝只剩顶上的球；展开＝球帽 + 图标 + 底帽，两态都给显式高度，过渡才连得上。
    if (capsule) capsule.style.height = orbState.collapsed ? '3rem' : `${icons.length * 2.9 + 3.7}rem`;
    orbElement.querySelector('.dai-orb-ball')?.setAttribute('aria-expanded', orbState.collapsed ? 'false' : 'true');
    const panel = orbElement.querySelector('.dai-orb-panel');
    if (!panel) return;
    if (orbState.collapsed || !orbState.panelId) {
        panel.hidden = true;
        panel.replaceChildren();
        return;
    }
    panel.hidden = false;
    renderOrbPanel(panel, orbState.panelId);
}

function refreshOpenOrbPanel() {
    if (!orbElement || orbState.collapsed || !orbState.panelId) return;
    const panel = orbElement.querySelector('.dai-orb-panel');
    if (panel && !panel.hidden) renderOrbPanel(panel, orbState.panelId);
}

/** 收集八个信息窗的只读数据；哪路运行时没就绪就缺哪块，窗里显示“暂无”。 */
function collectOrbData() {
    const settings = currentSettings();
    const safe = getter => { try { return getter(); } catch { return undefined; } };
    const manualVolume = Number.isInteger(settings.setting?.progress) && settings.setting.progress > 0 ? settings.setting.progress : null;
    const autoVolume = Number.isInteger(settings.facts?.currentVolume) && settings.facts.currentVolume > 0 ? settings.facts.currentVolume : null;
    const volume = manualVolume ?? autoVolume;
    return {
        dashboard: buildControlDashboard({
            settings,
            records: safe(() => agentAuditLog.list({ limit: 2000 })) ?? [],
            tasks: safe(() => agentCoordinator.list()) ?? [],
            scope: dashboardScope,
            injectionNote: safe(() => agentPromptInjection.inspect().note),
        }),
        world: {
            status: safe(() => agentWorldRuntime.status()),
            snapshot: safe(() => agentWorldRuntime.snapshot()),
            clockText: safe(() => agentWorldRuntime.formatClock()),
        },
        self: { status: safe(() => agentSelfRuntime.status()), snapshot: safe(() => agentSelfRuntime.snapshot()) },
        npcledger: { status: safe(() => agentNpcLedger.status()), records: safe(() => agentNpcLedger.list()) },
        cold: { status: safe(() => agentNpcColdRuntime.status()) },
        impact: { status: safe(() => agentImpactRuntime.status()), records: safe(() => agentImpactRuntime.list({ state: 'active' })) },
        facts: {
            stats: safe(() => agentFactsIndex.stats()),
            worldbook: typeof settings.setting?.worldbook === 'string' ? settings.setting.worldbook.trim() : '',
            volume: { label: volume ? `第 ${volume} 卷（${manualVolume !== null ? '手动' : '自动'}）` : '' },
        },
        sandbox: { read: safe(() => agentSandboxMode.read({ sessionId: agentActiveScope?.sessionId, branchId: agentActiveScope?.branchId })) },
    };
}

function renderOrbPanel(panel, id) {
    const view = buildOrbPanels(collectOrbData())[id];
    if (!view) { panel.hidden = true; return; }
    const heading = makeElement('header', 'dai-orb-panel-head');
    const titleBox = makeElement('div');
    titleBox.append(makeElement('b', '', `${view.icon} ${view.title}`), makeElement('small', '', view.summary));
    heading.append(titleBox);
    const close = makeElement('button', 'dai-orb-panel-close', '×');
    close.type = 'button';
    close.title = '关闭信息窗';
    close.setAttribute('aria-label', `关闭${view.title}信息窗`);
    close.addEventListener('click', () => { orbState.select(id); syncOrbHud(); });
    heading.append(close);
    const body = makeElement('div', 'dai-orb-panel-body');
    for (const row of view.rows) {
        const line = makeElement('p', 'dai-orb-row');
        if (row.tone) line.dataset.tone = row.tone;
        line.append(makeElement('span', 'dai-orb-row-label', row.label), makeElement('span', 'dai-orb-row-value', row.value));
        body.append(line);
    }
    for (const group of view.lists) {
        const block = makeElement('div', 'dai-orb-group');
        block.append(makeElement('b', 'dai-orb-group-title', group.heading));
        if (!group.items.length) {
            block.append(makeElement('p', 'dai-orb-empty', group.empty));
        } else {
            for (const item of group.items) {
                const card = makeElement('div', 'dai-orb-entry');
                card.append(makeElement('b', '', item.head));
                if (item.meta) card.append(makeElement('small', '', item.meta));
                if (item.detail) card.append(makeElement('p', '', item.detail));
                block.append(card);
            }
        }
        body.append(block);
    }
    panel.replaceChildren(heading, body);
}

function disposeOrbHud() {
    if (orbDocumentClick) { document.removeEventListener('pointerdown', orbDocumentClick, true); orbDocumentClick = undefined; }
    if (orbDocumentKey) { document.removeEventListener('keydown', orbDocumentKey); orbDocumentKey = undefined; }
    orbElement = undefined;
    orbState = createOrbState();
}

function applyAppearance(settings = currentSettings()) {
    if (typeof document === 'undefined') return;
    for (const element of [document.getElementById(SETTINGS_PANEL_ID), root]) {
        if (!element) continue;
        element.dataset.theme = normalizeTheme(settings.ui?.theme);
        element.classList.toggle('dai-compact', settings.ui?.compact === true);
    }
    if (orbElement) {
        orbElement.dataset.theme = normalizeTheme(settings.ui?.theme);
        orbElement.hidden = settings.showOrb === false;
        applyOrbPosition();
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
        if (orbElement && path === 'showOrb') orbElement.hidden = result.value.showOrb === false;
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
    // 同一套设置在「模型设置」「模型与提示词」「原著资料」页都有实例，全部一起切换。
    for (const block of panel?.querySelectorAll('[data-llm-custom]') ?? []) block.hidden = mode !== 'custom';
}

/** 世界影响两个模型：共用一个模型时收起场记那一行；跟随酒馆时模型名输入框不可用。功能页与集中页的副本一起切换。 */
function applyImpactModelVisibility(panel) {
    if (!panel) return;
    const impact = currentSettings().impact ?? {};
    const split = impact.modelMode === 'split';
    for (const injectBlock of panel.querySelectorAll('[data-impact-inject-model]')) injectBlock.hidden = !split;
    // 自定义才需要地址/密钥/协议/模型名；跟随酒馆时这几格灰掉，免得以为填了会生效。
    for (const [mode, fields] of [['decide', ['decideBaseUrl', 'decideApiKey', 'decideProvider', 'decideModel']], ['inject', ['injectBaseUrl', 'injectApiKey', 'injectProvider', 'injectModel']]]) {
        const custom = impact[`${mode}Mode`] === 'custom';
        for (const name of fields) {
            for (const input of panel.querySelectorAll(`[data-setting="impact.${name}"]`)) input.disabled = !custom;
        }
        for (const button of panel.querySelectorAll(`[data-impact-models="${mode}"]`)) button.disabled = !custom;
    }
}

/** 通用：某个功能的模型设置选了“跟随酒馆”时，地址/密钥/协议/模型名与拉取按钮一起灰掉，选“自定义”才解禁；
 *  温度等采样参数两种模式都照填，不跟着灰。同名设置在功能页和集中页各有一份，全部一起切换。 */
function applyFeatureModelVisibility(panel, { modeSetting, fieldNames, buttonAttr }) {
    if (!panel) return;
    const settings = currentSettings();
    const custom = fieldValue(settings, modeSetting) === 'custom';
    for (const name of fieldNames) {
        for (const input of panel.querySelectorAll(`[data-setting="${name}"]`)) input.disabled = !custom;
    }
    if (!buttonAttr) return;
    for (const button of panel.querySelectorAll(`[${buttonAttr}]`)) button.disabled = !custom;
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
        fieldNames: ['world.decideBaseUrl', 'world.decideApiKey', 'world.decideProvider', 'world.decideModel'],
        buttonAttr: 'data-worlddecide-models',
    });
}

function applySelfDecideModelVisibility(panel) {
    return applyFeatureModelVisibility(panel, {
        modeSetting: 'self.decideMode',
        fieldNames: ['self.decideBaseUrl', 'self.decideApiKey', 'self.decideProvider', 'self.decideModel'],
        buttonAttr: 'data-selfdecide-models',
    });
}

/** 冷藏推进员：功能页与集中页各有一份设置，选“跟随酒馆”时地址/密钥/协议/模型名一起灰掉。 */
function applyNpcColdModelVisibility(panel) {
    return applyFeatureModelVisibility(panel, {
        modeSetting: 'npc.coldMode',
        fieldNames: ['npc.coldBaseUrl', 'npc.coldApiKey', 'npc.coldProvider', 'npc.coldModel'],
        buttonAttr: 'data-npc-cold-models',
    });
}

/** 人物簿记录员：同样跟随连接模式灰显；这卡没有“拉取模型”按钮，buttonAttr 留空。 */
function applyNpcLedgerModelVisibility(panel) {
    return applyFeatureModelVisibility(panel, {
        modeSetting: 'npc.ledgerMode',
        fieldNames: ['npc.ledgerBaseUrl', 'npc.ledgerApiKey', 'npc.ledgerProvider', 'npc.ledgerModel'],
    });
}

/**
 * 连接模式的统一登记表：模式下拉的 data-setting → 这张卡的灰显切换。
 * 切换连接（input 事件）和整页同步（syncSettingsForm）都查这一张表，两条路不会走出两种结果；
 * 新功能的模型卡在这里补一行就自动接入，不会再出现“选了自定义还灰着”或“跟随酒馆还能改地址”的漏网卡。
 */
const CONNECTION_MODE_TOGGLERS = new Map([
    ['llm.mode', panel => applyLlmModeVisibility(panel, fieldValue(currentSettings(), 'llm.mode') ?? 'tavern')],
    ['setting.mode', applyFactsModelVisibility],
    ['settle.mode', applySettleModelVisibility],
    ['world.decideMode', applyWorldDecideModelVisibility],
    ['self.decideMode', applySelfDecideModelVisibility],
    ['memory.decideMode', applyMemoryDecideModelVisibility],
    ['npc.ledgerMode', applyNpcLedgerModelVisibility],
    ['npc.coldMode', applyNpcColdModelVisibility],
    ['impact.modelMode', applyImpactModelVisibility],
    ['impact.decideMode', applyImpactModelVisibility],
    ['impact.injectMode', applyImpactModelVisibility],
]);

/** 元素或 NodeList 统一成数组：同名设置在功能页与「模型与提示词」页各有一份，状态/候选列表要一起填。 */
function asElementList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value.length === 'number' && typeof value !== 'string') return [...value];
    return [value];
}

/** 拉取自定义接口的模型清单，填进模型名那格的候选列表：填了地址就不用再手抄模型名。 */
async function fetchModelList(panel, { read, status, list, target, button } = {}) {
    const baseUrl = read('BaseUrl');
    if (!baseUrl) {
        for (const item of asElementList(status)) item.textContent = '先填接口地址，再点拉取。';
        return;
    }
    button.disabled = true;
    for (const item of asElementList(status)) item.textContent = '正在拉取模型……';
    try {
        const provider = /anthropic/i.test(baseUrl) ? 'anthropic' : '';
        const result = await listModels({ baseUrl, apiKey: read('ApiKey'), provider });
        if (result.status !== 'ok') {
            for (const item of asElementList(status)) item.textContent = result.error || '接口没给出模型列表，可以直接手填模型名。';
            return;
        }
        for (const listElement of asElementList(list)) {
            listElement.textContent = '';
            for (const model of result.models) {
                const option = document.createElement('option');
                option.value = model;
                listElement.appendChild(option);
            }
        }
        for (const targetInput of asElementList(target)) {
            if (!targetInput.value) {
                targetInput.value = result.models[0];
                targetInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
        for (const item of asElementList(status)) item.textContent = `拉到 ${result.models.length} 个模型，点模型名那一格就能选。`;
    } catch (error) {
        for (const item of asElementList(status)) item.textContent = `拉取失败：${error?.message ?? error}`;
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
        status: panel.querySelectorAll(`[data-impact-models-status="${prefix}"]`),
        list: [panel.querySelector(`#dai-impact-models-${prefix}`), panel.querySelector(`#dai-hub-impact-models-${prefix}`)].filter(Boolean),
        target: panel.querySelectorAll(`[data-setting="impact.${prefix}Model"]`),
        button,
    });
}

function readSettingInput(panel, path) {
    const input = panel.querySelector(`[data-setting="${path}"]`);
    return input ? input.value.trim() : '';
}

async function fetchSettleModels(panel, button) {
    return fetchModelList(panel, {
        read: name => name === 'BaseUrl' ? readSettingInput(panel, 'settle.baseUrl') : readSettingInput(panel, 'settle.apiKey'),
        status: panel.querySelectorAll('[data-settle-models-status]'),
        list: [panel.querySelector('#dai-settle-models'), panel.querySelector('#dai-hub-settle-models')].filter(Boolean),
        target: panel.querySelectorAll('[data-setting="settle.model"]'),
        button,
    });
}

async function fetchWorldDecideModels(panel, button) {
    return fetchModelList(panel, {
        read: name => name === 'BaseUrl' ? readSettingInput(panel, 'world.decideBaseUrl') : readSettingInput(panel, 'world.decideApiKey'),
        status: panel.querySelectorAll('[data-worlddecide-models-status]'),
        list: [panel.querySelector('#dai-worlddecide-models'), panel.querySelector('#dai-hub-worlddecide-models')].filter(Boolean),
        target: panel.querySelectorAll('[data-setting="world.decideModel"]'),
        button,
    });
}

async function fetchSelfDecideModels(panel, button) {
    return fetchModelList(panel, {
        read: name => name === 'BaseUrl' ? readSettingInput(panel, 'self.decideBaseUrl') : readSettingInput(panel, 'self.decideApiKey'),
        status: panel.querySelectorAll('[data-selfdecide-models-status]'),
        list: [panel.querySelector('#dai-selfdecide-models'), panel.querySelector('#dai-hub-selfdecide-models')].filter(Boolean),
        target: panel.querySelectorAll('[data-setting="self.decideModel"]'),
        button,
    });
}

async function fetchFactsModels(panel, button) {
    return fetchModelList(panel, {
        read: name => name === 'BaseUrl' ? readSettingInput(panel, 'setting.baseUrl') : readSettingInput(panel, 'setting.apiKey'),
        status: panel.querySelectorAll('[data-facts-models-status]'),
        list: [panel.querySelector('#dai-facts-models')].filter(Boolean),
        target: panel.querySelectorAll('[data-setting="setting.model"]'),
        button,
    });
}

async function fetchMemoryDecideModels(panel, button) {
    return fetchModelList(panel, {
        read: name => name === 'BaseUrl' ? readSettingInput(panel, 'memory.decideBaseUrl') : readSettingInput(panel, 'memory.decideApiKey'),
        status: panel.querySelectorAll('[data-memorydecide-models-status]'),
        list: [panel.querySelector('#dai-memorydecide-models'), panel.querySelector('#dai-hub-memorydecide-models')].filter(Boolean),
        target: panel.querySelectorAll('[data-setting="memory.decideModel"]'),
        button,
    });
}

async function fetchNpcColdModels(panel, button) {
    return fetchModelList(panel, {
        read: name => name === 'BaseUrl' ? readSettingInput(panel, 'npc.coldBaseUrl') : readSettingInput(panel, 'npc.coldApiKey'),
        status: panel.querySelectorAll('[data-npc-cold-models-status]'),
        list: [panel.querySelector('#dai-npc-cold-models'), panel.querySelector('#dai-hub-npc-cold-models')].filter(Boolean),
        target: panel.querySelectorAll('[data-setting="npc.coldModel"]'),
        button,
    });
}

function applyFactsModelVisibility(panel) {
    return applyFeatureModelVisibility(panel, {
        modeSetting: 'setting.mode',
        fieldNames: ['setting.baseUrl', 'setting.apiKey', 'setting.provider', 'setting.model'],
        buttonAttr: 'data-facts-models',
    });
}

function applyMemoryDecideModelVisibility(panel) {
    return applyFeatureModelVisibility(panel, {
        modeSetting: 'memory.decideMode',
        fieldNames: ['memory.decideBaseUrl', 'memory.decideApiKey', 'memory.decideProvider', 'memory.decideModel'],
        buttonAttr: 'data-memorydecide-models',
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
        ['self.decidePrompt', SELF_DECIDE_PROMPT],
        ['self.guide', SELF_GUIDE],
        ['npc.ledgerPrompt', NPC_RECORD_PROMPT],
        ['npc.coldPrompt', NPC_COLD_PROMPT],
        ...SETTLE_CATEGORIES.map(category => [`settle.prompt.${category.id}`, category.prompt]),
    ]);
    // 同一提示词在功能页与集中页各有一份：每一份都铺当前生效的默认，别只铺第一个。
    for (const [path, fallback] of promptDefaults) {
        for (const area of panel.querySelectorAll(`[data-setting="${path}"]`)) {
            if (area && !String(area.value ?? '').trim()) area.value = fallback;
        }
    }
    // 连接模式的灰显统一查登记表：打开面板、切换模式下拉走的是同一份，行为完全一致。
    for (const toggle of CONNECTION_MODE_TOGGLERS.values()) toggle(panel);
    renderSettleCustomCategories(panel);
    renderWorldbookPicker(panel);
    applyAppearance(settings);
    refreshControlDashboard();
    renderImpactLibrary(panel);
    const status = panel.querySelector(`#${SETTINGS_STATUS_ID}`);
    if (status) status.textContent = hostContext ? '设置会保存到酒馆扩展设置。' : '尚未连接酒馆，当前只展示本地默认值。';
}

let activeSettingsPage = 'overview';
let worldTileOutsideHandler = null;

/** 世界磁贴的就地编辑：点到磁贴以外的任何地方（包括聊天区）就收回。 */
function bindWorldTileOutside(panel) {
    if (typeof document === 'undefined') return;
    if (worldTileOutsideHandler) document.removeEventListener('pointerdown', worldTileOutsideHandler, true);
    worldTileOutsideHandler = event => {
        if (event.target.closest?.('.dai-world-tile')) return;
        for (const editor of panel.querySelectorAll('[data-world-tile-editor]')) editor.hidden = true;
        document.removeEventListener('pointerdown', worldTileOutsideHandler, true);
        worldTileOutsideHandler = null;
    };
    document.addEventListener('pointerdown', worldTileOutsideHandler, true);
}

function closeWorldTileEditors(panel) {
    if (!panel) return;
    for (const editor of panel.querySelectorAll('[data-world-tile-editor]')) editor.hidden = true;
    if (worldTileOutsideHandler) {
        document.removeEventListener('pointerdown', worldTileOutsideHandler, true);
        worldTileOutsideHandler = null;
    }
}

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
                    <button type="button" class="dai-nav-item" data-settings-page="hub"><span class="dai-nav-icon">✧</span><span><b>模型设置</b><small>每一路模型调用的接口与参数</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="facts"><span class="dai-nav-icon">▤</span><span><b>原著资料</b><small>事实与资料查询</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="action"><span class="dai-nav-icon">➜</span><span><b>行动结算</b><small>结果与资源变化</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="world"><span class="dai-nav-icon">◌</span><span><b>世界运转</b><small>时间、事件与世界现状</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="npc"><span class="dai-nav-icon">♙</span><span><b>NPC 决策</b><small>人物自主行动</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="npcledger"><span class="dai-nav-icon">☰</span><span><b>人物簿</b><small>每个人的档案与好感</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="self"><span class="dai-nav-icon">◉</span><span><b>纳戒</b><small>主角自身与随身之物</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="memory"><span class="dai-nav-icon">✎</span><span><b>主角记忆</b><small>小记忆/大记忆，按需召回</small></span></button>
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
                        <div class="dai-overview-grid"><label class="dai-overview-switch"><span><b>启用 Agent 总控</b><small>关闭后不会运行回合，也不会写入状态。</small></span><input type="checkbox" data-setting="enabled"></label><label class="dai-overview-switch"><span><b>显示运行反馈</b><small>在右下角显示任务状态与失败原因。</small></span><input type="checkbox" data-setting="showStatusPanel"></label><label class="dai-overview-switch"><span><b>显示悬浮球</b><small>屏幕边上的小球，点开拉成长条，可查看各功能的只读信息。</small></span><input type="checkbox" data-setting="showOrb"></label></div>
                        <fieldset class="dai-theme-picker"><legend>界面颜色</legend><label class="dai-theme-option"><input type="radio" name="dai-theme" value="white" data-setting="ui.theme"><span class="dai-theme-swatch" data-swatch="white" aria-hidden="true"></span><b>白色</b></label><label class="dai-theme-option"><input type="radio" name="dai-theme" value="black" data-setting="ui.theme"><span class="dai-theme-swatch" data-swatch="black" aria-hidden="true"></span><b>黑色</b></label><label class="dai-theme-option"><input type="radio" name="dai-theme" value="beige" data-setting="ui.theme"><span class="dai-theme-swatch" data-swatch="beige" aria-hidden="true"></span><b>米色</b></label></fieldset>
                        <p class="dai-dashboard-note">只改变 Agent 界面，不改变酒馆整体配色。</p>
                    </section>
                    
                    <section class="dai-settings-page" data-settings-section="hub" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 模型</span><h3>模型设置</h3><p>扩展会发起的每一次独立模型调用，接口与参数都集中在这里：全局连接是所有“跟随酒馆”功能的共用来源；某一路想用单独的模型，就在它的卡片里选“自定义”。各功能的提示词不在这一页——到对应功能页里改。</p></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>全局连接（正文与默认调用）</b><small>“跟随酒馆”＝直接用酒馆当前 API 与模型；“自定义”＝下面这套地址、密钥与参数。这里是所有“跟随酒馆”功能共用的事实来源。</small></div><label class="dai-setting-row"><span><b>用哪个接口</b></span><select data-setting="llm.mode"><option value="tavern">跟随酒馆当前 API</option><option value="custom">自定义接口</option></select></label><div class="dai-llm-custom" data-llm-custom hidden><label class="dai-setting-row"><span><b>连接方式</b></span><select data-setting="llm.provider"><option value="openai-compatible">OpenAI 兼容接口</option><option value="anthropic">Anthropic 兼容接口</option><option value="custom">自定义</option></select></label><label class="dai-setting-row"><span><b>接口地址</b><small>OpenAI 兼容的 Base URL，填到 /v1 为止。</small></span><input type="url" data-setting="llm.baseUrl" placeholder="https://api.example.com/v1"></label><label class="dai-setting-row"><span><b>API Key</b><small>只保存到扩展设置，不写入聊天消息。</small></span><input type="password" data-setting="llm.apiKey" autocomplete="off" placeholder="留空表示不使用独立密钥"></label><label class="dai-setting-row"><span><b>模型名称</b><small>自定义接口必填；跟随酒馆时可留空。</small></span><input type="text" data-setting="llm.model" placeholder="例如 deepseek-chat"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>Temperature</b><small>0 更稳，2 更发散。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="llm.temperature" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>最大输出 Token</b></span><input type="number" min="128" max="32768" step="128" data-setting="llm.maxTokens" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>单次等待上限（毫秒）</b></span><input type="number" min="1000" max="600000" step="1000" data-setting="llm.timeoutMs" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>top_p</b><small>0–1；0 ＝不指定。</small></span><input type="number" min="0" max="1" step="0.05" data-setting="llm.topP" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>存在惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="llm.presencePenalty" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>频率惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="llm.frequencyPenalty" placeholder="0 = 不指定"></label></div></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>原著设定 · 选条与卷外点选</b><small>每轮生成前“挑哪些原著条目进正文”的独立调用。“跟随酒馆”＝直接用酒馆当前连接与模型；选“自定义”才读下面几项。选条与卷外点选的提示词在「原著资料」页修改。</small></div><label class="dai-setting-row"><span><b>用哪套连接</b></span><select data-setting="setting.mode"><option value="tavern">跟随酒馆当前设置</option><option value="custom">自定义模型</option></select></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>接口地址</b><small>选“自定义”才用得上；留空沿用“全局连接”。</small></span><input type="text" data-setting="setting.baseUrl" placeholder="https://api.example.com/v1"></label><label class="dai-setting-row"><span><b>接口密钥</b><small>选“自定义”才用得上。</small></span><input type="password" data-setting="setting.apiKey" autocomplete="off" placeholder="留空沿用“全局连接”"></label><label class="dai-setting-row"><span><b>接口协议</b><small>留空按接口地址自动判断。</small></span><select data-setting="setting.provider"><option value="">自动判断</option><option value="openai">OpenAI 兼容</option><option value="anthropic">Anthropic</option></select></label><label class="dai-setting-row"><span><b>模型名</b><small>选“自定义”才用得上；填好地址点“拉取模型”挑一个。</small></span><input type="text" data-setting="setting.model" placeholder="例如 deepseek-chat"></label></div><div class="dai-setting-grid dai-param-grid"><label class="dai-setting-row"><span><b>温度</b><small>0 = 不指定。</small></span><input type="number" min="0" max="2" step="0.05" data-setting="setting.temperature" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>最大输出</b><small>tokens；0 = 不指定。</small></span><input type="number" min="0" max="32768" step="64" data-setting="setting.maxTokens" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>top_p</b><small>0–1；0 = 不指定。</small></span><input type="number" min="0" max="1" step="0.05" data-setting="setting.topP" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>存在惩罚</b><small>0 = 不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="setting.presencePenalty" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>频率惩罚</b><small>0 = 不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="setting.frequencyPenalty" placeholder="0 = 不指定"></label></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-facts-models>拉取模型</button><small role="status" data-facts-models-status></small></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>行动结算 · 分类判定</b><small>丹药/修炼/伤害/通用各类别独立判定的连接与参数；各类别的判定规则在「行动结算」页改。</small></div><label class="dai-setting-row"><span><b>用哪套连接</b><small>跟随酒馆＝与正文同一套；自定义＝下面这几项。</small></span><select data-setting="settle.mode"><option value="tavern">跟随酒馆当前设置</option><option value="custom">自定义模型</option></select></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>接口地址</b><small>选“自定义”才用得上；留空沿用“全局连接”。</small></span><input type="text" data-setting="settle.baseUrl" placeholder="https://api.example.com/v1"></label><label class="dai-setting-row"><span><b>接口密钥</b><small>选“自定义”才用得上。</small></span><input type="password" data-setting="settle.apiKey" autocomplete="off" placeholder="留空沿用“全局连接”"></label><label class="dai-setting-row"><span><b>模型名</b><small>填好地址后点“拉取模型”挑一个，也可以手填。</small></span><input type="text" data-setting="settle.model" placeholder="例如 deepseek-chat"></label></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>温度</b><small>判定求稳可以填 0.2。</small></span><input type="number" min="0" max="2" step="0.05" data-setting="settle.temperature" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>最大输出</b><small>tokens；0 ＝不指定。</small></span><input type="number" min="0" max="32768" step="64" data-setting="settle.maxTokens" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>top_p</b><small>0–1；0 ＝不指定。</small></span><input type="number" min="0" max="1" step="0.05" data-setting="settle.topP" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>存在惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="settle.presencePenalty" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>频率惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="settle.frequencyPenalty" placeholder="0 = 不指定"></label></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-settle-models>拉取模型</button><small role="status" data-settle-models-status></small></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>世界运转 · 模型决定</b><small>世界事件决定调用的连接与参数；决定提示词与降级指令指南在「世界运转」页改。</small></div><label class="dai-setting-row"><span><b>用哪套连接</b><small>跟随酒馆＝与正文同一套；自定义＝下面这几项。</small></span><select data-setting="world.decideMode"><option value="tavern">跟随酒馆当前设置</option><option value="custom">自定义模型</option></select></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>接口地址</b><small>选“自定义”才用得上；留空沿用“全局连接”。</small></span><input type="text" data-setting="world.decideBaseUrl" placeholder="https://api.example.com/v1"></label><label class="dai-setting-row"><span><b>接口密钥</b><small>选“自定义”才用得上。</small></span><input type="password" data-setting="world.decideApiKey" autocomplete="off" placeholder="留空沿用“全局连接”"></label><label class="dai-setting-row"><span><b>接口协议</b><small>留空按接口地址自动判断。</small></span><select data-setting="world.decideProvider"><option value="">自动判断</option><option value="openai">OpenAI 兼容</option><option value="anthropic">Anthropic</option></select></label><label class="dai-setting-row"><span><b>模型名</b><small>填好地址后点“拉取模型”挑一个，也可以手填。</small></span><input type="text" data-setting="world.decideModel" placeholder="留空沿用当前模型"></label></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>温度</b><small>0–2；0 ＝不指定，沿用酒馆/全局。</small></span><input type="number" min="0" max="2" step="0.05" data-setting="world.decideTemperature" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>最大输出</b><small>tokens；0 ＝不指定。</small></span><input type="number" min="0" max="32768" step="64" data-setting="world.decideMaxTokens" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>top_p</b><small>0–1；0 ＝不指定。</small></span><input type="number" min="0" max="1" step="0.05" data-setting="world.decideTopP" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>存在惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="world.decidePresencePenalty" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>频率惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="world.decideFrequencyPenalty" placeholder="0 = 不指定"></label></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-worlddecide-models>拉取模型</button><small role="status" data-worlddecide-models-status></small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>喂最近几楼聊天</b></span><input type="number" min="1" max="12" step="1" data-setting="world.decideMaxFloors" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>世界书条目上限</b><small>按本轮聊天匹配相关条目，0 = 不带世界书。</small></span><input type="number" min="0" max="40" step="1" data-setting="world.decideMaxEntries" placeholder="0 = 不指定"></label></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>人物簿 · 记录员</b><small>生成后补人物档案的小调用的连接与参数；记录员提示词在「人物簿」页改，经历精简也走这一套连接。</small></div><label class="dai-setting-row"><span><b>用哪套连接</b><small>跟随酒馆＝与正文同一套；自定义＝下面这几项。</small></span><select data-setting="npc.ledgerMode"><option value="tavern">跟随酒馆当前设置</option><option value="custom">自定义模型</option></select></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>接口地址</b><small>选“自定义”才用得上；留空沿用“全局连接”。</small></span><input type="text" data-setting="npc.ledgerBaseUrl" placeholder="https://api.example.com/v1"></label><label class="dai-setting-row"><span><b>接口密钥</b><small>选“自定义”才用得上。</small></span><input type="password" data-setting="npc.ledgerApiKey" autocomplete="off" placeholder="留空沿用“全局连接”"></label><label class="dai-setting-row"><span><b>接口协议</b><small>留空按接口地址自动判断。</small></span><select data-setting="npc.ledgerProvider"><option value="">自动判断</option><option value="openai">OpenAI 兼容</option><option value="anthropic">Anthropic</option></select></label><label class="dai-setting-row"><span><b>记录员模型</b><small>留空沿用“全局连接”的模型。</small></span><input type="text" data-setting="npc.ledgerModel" placeholder="留空沿用当前模型"></label></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>记账温度</b><small>要稳，0.2~0.4 比较合适；0 表示不指定。</small></span><input type="number" min="0" max="2" step="0.05" data-setting="npc.ledgerTemperature" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>最大输出 Token</b><small>0 = 沿用全局上限。</small></span><input type="number" min="0" max="32768" step="64" data-setting="npc.ledgerMaxTokens" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>top_p</b><small>0 = 不指定。</small></span><input type="number" min="0" max="1" step="0.05" data-setting="npc.ledgerTopP" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>存在惩罚</b><small>0 = 不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="npc.ledgerPresencePenalty" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>频率惩罚</b><small>0 = 不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="npc.ledgerFrequencyPenalty" placeholder="0 = 不指定"></label></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>人物簿 · 冷藏推进员</b><small>给勾选的冷藏人物补世界时间走过那一段的小调用的连接与参数；推进员提示词在「人物簿」页改。</small></div><label class="dai-setting-row"><span><b>用哪套连接</b><small>跟随酒馆＝与正文同一套；自定义＝下面这几项。</small></span><select data-setting="npc.coldMode"><option value="tavern">跟随酒馆当前设置</option><option value="custom">自定义模型</option></select></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>接口地址</b><small>选“自定义”才用得上；留空沿用“全局连接”。</small></span><input type="text" data-setting="npc.coldBaseUrl" placeholder="https://api.example.com/v1"></label><label class="dai-setting-row"><span><b>接口密钥</b><small>选“自定义”才用得上。</small></span><input type="password" data-setting="npc.coldApiKey" autocomplete="off" placeholder="留空沿用“全局连接”"></label><label class="dai-setting-row"><span><b>接口协议</b><small>留空按接口地址自动判断。</small></span><select data-setting="npc.coldProvider"><option value="">自动判断</option><option value="openai">OpenAI 兼容</option><option value="anthropic">Anthropic</option></select></label><label class="dai-setting-row"><span><b>推进员模型</b><small>留空沿用“全局连接”的模型。</small></span><input type="text" data-setting="npc.coldModel" placeholder="留空沿用当前模型"></label></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>推进温度</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.05" data-setting="npc.coldTemperature" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>最大输出</b><small>0 ＝不指定。</small></span><input type="number" min="0" max="32768" step="64" data-setting="npc.coldMaxTokens" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>top_p</b><small>0–1；0 ＝不指定。</small></span><input type="number" min="0" max="1" step="0.05" data-setting="npc.coldTopP" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>存在惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="npc.coldPresencePenalty" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>频率惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="npc.coldFrequencyPenalty" placeholder="0 = 不指定"></label></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>纳戒 · 模型决定</b><small>主角自身记账调用的连接与参数；决定提示词与降级指令指南在「纳戒」页改。</small></div><label class="dai-setting-row"><span><b>决定用哪套连接</b><small>跟随酒馆＝与正文同一套；“自定义”＝下面这几项。</small></span><select data-setting="self.decideMode"><option value="tavern">跟随酒馆当前设置</option><option value="custom">自定义模型</option></select></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>决定接口地址</b><small>选“自定义”才用得上；留空沿用“全局连接”。</small></span><input type="text" data-setting="self.decideBaseUrl" placeholder="https://api.example.com/v1"></label><label class="dai-setting-row"><span><b>决定接口密钥</b><small>选“自定义”才用得上。</small></span><input type="password" data-setting="self.decideApiKey" autocomplete="off" placeholder="留空沿用“全局连接”"></label><label class="dai-setting-row"><span><b>接口协议</b><small>留空按接口地址自动判断。</small></span><select data-setting="self.decideProvider"><option value="">自动判断</option><option value="openai">OpenAI 兼容</option><option value="anthropic">Anthropic</option></select></label><label class="dai-setting-row"><span><b>决定用模型</b><small>填好地址后点“拉取模型”挑一个，也可以手填。</small></span><input type="text" data-setting="self.decideModel" placeholder="留空沿用当前模型"></label></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>决定温度</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.05" data-setting="self.decideTemperature" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>决定最大输出</b><small>tokens；0 ＝不指定。</small></span><input type="number" min="0" max="32768" step="64" data-setting="self.decideMaxTokens" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>决定 top_p</b><small>0–1；0 ＝不指定。</small></span><input type="number" min="0" max="1" step="0.05" data-setting="self.decideTopP" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>决定存在惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="self.decidePresencePenalty" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>决定频率惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="self.decideFrequencyPenalty" placeholder="0 = 不指定"></label></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-selfdecide-models>拉取模型</button><small role="status" data-selfdecide-models-status></small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>喂最近几楼聊天</b></span><input type="number" min="1" max="12" step="1" data-setting="self.decideMaxFloors" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>世界书条目上限</b><small>按本轮聊天匹配相关条目，0 = 不带世界书。</small></span><input type="number" min="0" max="40" step="1" data-setting="self.decideMaxEntries" placeholder="0 = 不指定"></label></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>记忆决定 · 书记官</b><small>生成后决定“主角新记住了什么、了结了什么”的独立调用的连接与参数；书记官提示词在「主角记忆」页改。</small></div><label class="dai-setting-row"><span><b>用哪套连接</b><small>跟随酒馆＝与正文同一套；自定义＝下面这几项。</small></span><select data-setting="memory.decideMode"><option value="tavern">跟随酒馆当前设置</option><option value="custom">自定义模型</option></select></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>接口地址</b><small>选“自定义”才用得上；留空沿用“全局连接”。</small></span><input type="text" data-setting="memory.decideBaseUrl" placeholder="https://api.example.com/v1"></label><label class="dai-setting-row"><span><b>接口密钥</b><small>选“自定义”才用得上。</small></span><input type="password" data-setting="memory.decideApiKey" autocomplete="off" placeholder="留空沿用“全局连接”"></label><label class="dai-setting-row"><span><b>接口协议</b><small>留空按接口地址自动判断。</small></span><select data-setting="memory.decideProvider"><option value="">自动判断</option><option value="openai">OpenAI 兼容</option><option value="anthropic">Anthropic</option></select></label><label class="dai-setting-row"><span><b>模型名</b><small>选“自定义”才用得上。</small></span><input type="text" data-setting="memory.decideModel" placeholder="例如 deepseek-chat"></label></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>温度</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.05" data-setting="memory.decideTemperature" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>最大输出</b><small>tokens；0 ＝不指定。</small></span><input type="number" min="0" max="32768" step="64" data-setting="memory.decideMaxTokens" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>top_p</b><small>0–1；0 ＝不指定。</small></span><input type="number" min="0" max="1" step="0.05" data-setting="memory.decideTopP" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>存在惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="memory.decidePresencePenalty" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>频率惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="memory.decideFrequencyPenalty" placeholder="0 = 不指定"></label></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>喂最近几楼聊天</b></span><input type="number" min="1" max="12" step="1" data-setting="memory.decideMaxFloors" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>世界书条目上限</b><small>按本轮聊天匹配相关条目，0 = 不带世界书。</small></span><input type="number" min="0" max="40" step="1" data-setting="memory.decideMaxEntries" placeholder="0 = 不指定"></label></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>世界影响 · 记录员与场记</b><small>生成后记账与生成前挑选的两个模型、连接与参数；记录员与场记的提示词在「世界影响」页改。</small></div><label class="dai-setting-row"><span><b>用几个模型</b><small>一个模型＝记账和挑选都用同一套；两个模型＝各配各的。</small></span><select data-setting="impact.modelMode"><option value="shared">一个模型干两件事</option><option value="split">两个模型分开</option></select></label><label class="dai-setting-row"><span><b>记录员用哪套</b><small>生成结束后记账的那个。</small></span><select data-setting="impact.decideMode"><option value="tavern">跟随酒馆当前设置</option><option value="custom">自定义模型</option></select></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>记录员接口地址</b><small>选“自定义”才用得上；留空沿用“全局连接”。</small></span><input type="text" data-setting="impact.decideBaseUrl" placeholder="https://api.example.com/v1"></label><label class="dai-setting-row"><span><b>记录员接口密钥</b><small>选“自定义”才用得上。</small></span><input type="password" data-setting="impact.decideApiKey" autocomplete="off" placeholder="留空沿用“全局连接”"></label><label class="dai-setting-row"><span><b>接口协议</b><small>留空按接口地址自动判断。</small></span><select data-setting="impact.decideProvider"><option value="">自动判断</option><option value="openai">OpenAI 兼容</option><option value="anthropic">Anthropic</option></select></label><label class="dai-setting-row"><span><b>记录员模型名</b><small>填好地址后点“拉取模型”挑一个。</small></span><input type="text" data-setting="impact.decideModel" placeholder="例如 deepseek-chat"></label></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>记录员温度</b><small>0–2；填 0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.05" data-setting="impact.decideTemperature" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>记录员最大输出</b><small>tokens；0 ＝不指定。</small></span><input type="number" min="0" max="32768" step="64" data-setting="impact.decideMaxTokens" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>记录员 top_p</b><small>0–1；0 ＝不指定。</small></span><input type="number" min="0" max="1" step="0.05" data-setting="impact.decideTopP" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>记录员存在惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="impact.decidePresencePenalty" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>记录员频率惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="impact.decideFrequencyPenalty" placeholder="0 = 不指定"></label></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-impact-models="decide">拉取模型</button><small role="status" data-impact-models-status="decide"></small></div><div class="dai-setting-grid" data-impact-inject-model><label class="dai-setting-row"><span><b>场记用哪套</b><small>生成前挑影响的那个。</small></span><select data-setting="impact.injectMode"><option value="tavern">跟随酒馆当前设置</option><option value="custom">自定义模型</option></select></label><label class="dai-setting-row"><span><b>场记接口地址</b><small>选“自定义”才用得上。</small></span><input type="text" data-setting="impact.injectBaseUrl" placeholder="https://api.example.com/v1"></label><label class="dai-setting-row"><span><b>场记接口密钥</b><small>选“自定义”才用得上。</small></span><input type="password" data-setting="impact.injectApiKey" autocomplete="off" placeholder="留空沿用“全局连接”"></label><label class="dai-setting-row"><span><b>接口协议</b><small>留空按接口地址自动判断。</small></span><select data-setting="impact.injectProvider"><option value="">自动判断</option><option value="openai">OpenAI 兼容</option><option value="anthropic">Anthropic</option></select></label><label class="dai-setting-row"><span><b>场记模型名</b><small>填好地址后点“拉取模型”挑一个。</small></span><input type="text" data-setting="impact.injectModel" placeholder="例如 deepseek-chat"></label></div><div class="dai-setting-grid" data-impact-inject-model><label class="dai-setting-row"><span><b>场记温度</b><small>0–2；填 0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.05" data-setting="impact.injectTemperature" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>场记最大输出</b><small>tokens；0 ＝不指定。</small></span><input type="number" min="0" max="32768" step="64" data-setting="impact.injectMaxTokens" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>场记 top_p</b><small>0–1；0 ＝不指定。</small></span><input type="number" min="0" max="1" step="0.05" data-setting="impact.injectTopP" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>场记存在惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="impact.injectPresencePenalty" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>场记频率惩罚</b><small>0–2；0 ＝不指定。</small></span><input type="number" min="0" max="2" step="0.1" data-setting="impact.injectFrequencyPenalty" placeholder="0 = 不指定"></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-impact-models="inject">拉取模型</button><small role="status" data-impact-models-status="inject"></small></div></div></div>
                    </section>
                    <section class="dai-settings-page" data-settings-section="facts" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 03</span><h3>原著设定</h3><p>把世界书条目变成“按需注入”的设定库：建索引、按卷出目录、模型点名、按预算注入正文提示词。</p></div><div class="dai-settings-card"><div class="dai-card-heading"><b>运行状态</b><small>打开这一页时读取，生成结束后也会刷新。</small></div><ul class="dai-status-list" data-facts-status><li><b>状态</b><span>正在读取……</span></li></ul></div><div class="dai-settings-card"><div class="dai-card-heading"><b>检索库状态</b><small>只读世界书，不改原文件；改完世界书后重新导入一次即可。</small></div><p class="dai-turn-result" data-worldbook-stats role="status">还没有导入。</p><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>选择世界书</b><small>扫描到的名字会记住；选过之后刷新酒馆不用重选。</small></span><select data-worldbook-pick><option value="">（尚未选择）</option></select></label><label class="dai-setting-row"><span><b>手动填写</b><small>列表里没有就填世界书面板里的名字。</small></span><input type="text" list="dai-worldbook-options" data-setting="setting.worldbook" placeholder="例如 斗破世界书"></label></div><datalist id="dai-worldbook-options"></datalist><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-agent-worldbook-scan>扫描可选世界书</button><button type="button" class="dai-secondary-button" data-agent-worldbook-import>从世界书导入</button></div><p class="dai-turn-result" data-agent-worldbook-status role="status">还没有导入。</p></div><div class="dai-settings-card"><div class="dai-card-heading"><b>上次注入</b><small>最近一轮实际写进提示词的原著条目；与上面的运行状态分开看。</small></div><div class="dai-facts-injection" data-facts-last-injection role="status">本轮还没有注入过。</div></div><div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">◈</span><span><b>启用原著设定注入</b><small>每轮先按本轮输入召回候选，再由模型挑出真正要用的设定，按预算注入正文提示词。</small></span><input type="checkbox" data-setting="setting.enabled"></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>当前剧情卷</b><small>自动＝按本轮输入和模型估计；手动选＝锁定这一卷，识别到更后面的卷也会被压回。</small></span><select data-setting="setting.progress"><option value="0">自动判定</option><option value="1">第 1 卷</option><option value="2">第 2 卷</option><option value="3">第 3 卷</option><option value="4">第 4 卷</option><option value="5">第 5 卷</option><option value="6">第 6 卷</option><option value="7">第 7 卷</option><option value="8">第 8 卷</option><option value="9">第 9 卷</option><option value="10">第 10 卷</option><option value="11">第 11 卷</option><option value="12">第 12 卷</option><option value="13">第 13 卷</option><option value="14">第 14 卷</option><option value="15">第 15 卷</option><option value="16">第 16 卷</option><option value="17">第 17 卷</option><option value="18">第 18 卷</option><option value="19">第 19 卷</option><option value="20">第 20 卷</option><option value="21">第 21 卷</option></select></label><label class="dai-setting-row"><span><b>单次注入字数</b><small>0 = 不限制，选中几条就注入几条全文。</small></span><input type="number" min="0" max="4000" step="100" data-setting="setting.injectionBudget"></label><label class="dai-setting-row"><span><b>单次最多条目</b></span><input type="number" min="1" max="24" step="1" data-setting="setting.maxItems"></label></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>注入通道</b><small data-injection-status role="status">打开这一页时检测。</small></div><div class="dai-setting-grid"><label class="dai-setting-row dai-setting-toggle"><span><b>启用注入</b><small>关闭后不往提示词里写任何原著内容，正文照常生成。</small></span><input type="checkbox" data-setting="injection.enabled"></label><label class="dai-setting-row"><span><b>插入深度</b><small>从最新一楼往回数；0 表示紧贴末尾、离生成最近。</small></span><input type="number" min="0" max="99" step="1" data-setting="injection.depth"></label><label class="dai-setting-row"><span><b>最大字数</b><small>0 = 不截断；填了才在写入时截断。</small></span><input type="number" min="0" max="8000" step="100" data-setting="injection.maxChars"></label></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>旧版资料查询（已退役）</b><small>新链路不再调用它；保留这几个开关只为对照旧行为，正常使用保持关闭。</small></div><div class="dai-feature-toggle"><span class="dai-feature-icon">▤</span><span><b>启用旧资料查询</b><small>关闭后不会调用 facts-query 模块。</small></span><input type="checkbox" data-setting="enableFactsLibrary"></div><label class="dai-setting-row"><span><b>资料来源</b><small>旧链路只会读取已经登记的项目资料。</small></span><select data-setting="facts.sourceMode"><option value="registered">已登记资料</option><option value="chat">当前聊天上下文</option><option value="both">资料 + 当前聊天</option></select></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>单次最多条目</b></span><input type="number" min="1" max="100" step="1" data-setting="facts.maxEntries"></label><label class="dai-setting-row dai-setting-toggle"><span><b>允许未核验资料</b><small>关闭时只使用已确认事实。</small></span><input type="checkbox" data-setting="facts.includeUnverified"></label></div></div><details class="dai-settle-category"><summary><span class="dai-feature-icon">▤</span><span><b>选条提示词</b><small>模型判断“本轮要用哪些原著条目”时收到的 system 指令；点开修改，清空恢复内置默认；MAX_PICKS 会换成每条上限。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>规则正文</b><small>改完下一轮生效，不用重启。</small></span><textarea data-setting="prompt.select" rows="9" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-prompt-default>填入默认规则</button><small>默认规则含“只选必须用到、不许编 uid、只输出 JSON”。</small></div></div></details><details class="dai-settle-category"><summary><span class="dai-feature-icon">▤</span><span><b>卷外点选提示词</b><small>模型在目录里找不到、报出名字后，脚本搜到候选再问它一次时用的 system 指令；点开修改，清空恢复内置默认。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>规则正文</b><small>只影响“卷外二次点选”，改完下一轮生效。</small></span><textarea data-setting="prompt.lookup" rows="7" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-prompt-default="lookup">填入默认规则</button><small>默认规则含“只从候选里挑、后续卷默认不选”。</small></div></div></details></section>
                    <section class="dai-settings-page" data-settings-section="action" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 04</span><h3>行动结算</h3><p>把玩家行动拆成条件、结果和资源变化候选，再决定是否提交。</p></div><div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">➜</span><span><b>启用行动结算（总开关）</b><small>关闭后行动不再结算：不拆条件、不算数值变化，也不再要求确认行动细节；正文照常生成，状态保持原样。</small></span><input type="checkbox" data-setting="enableActionResolution"></div><label class="dai-setting-row dai-setting-toggle"><span><b>提交前要求确认</b><small>只生成候选，不自动写入状态。</small></span><input type="checkbox" data-setting="action.requireConfirmation"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>最多候选结果</b></span><input type="number" min="1" max="20" step="1" data-setting="action.maxCandidates"></label><label class="dai-setting-row dai-setting-toggle"><span><b>显示资源变化预览</b><small>在确认前展示影响范围。</small></span><input type="checkbox" data-setting="action.showCostPreview"></label></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>分类判定与提示词</b><small>行动解析先定类别（丹药/修炼/伤害/通用），再由对应类别的提示词独立判一次，脚本按类别规则逐条复核。点开一类修改它的规则；改完下一轮生效，不用重启。</small></div>${SETTLE_CATEGORY_HTML}<div data-settle-custom-list></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-settle-add-category>＋ 添加自定义判定</button><small role="status" data-settle-custom-status>自定义判定只有名字和提示词：判定走你写的规则，脚本仍做字段白名单把关；最多 8 个。</small></div></div></section>
                    <section class="dai-settings-page" data-settings-section="world" role="tabpanel" hidden>
                        <div class="dai-page-heading"><h3>世界运转</h3><p>世界时间和事件由模型在正文末尾下指令、脚本核验后记账；这一页是台账展示和手动控制。添加表单都收进了弹窗，页面只看现状。</p></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>世界时间与现状</b><small>随每轮生成自动更新；点数值旁的 ✎ 就地修正。</small></div><div class="dai-world-tiles"><div class="dai-world-tile"><span class="dai-world-tile-label">天数</span><b class="dai-world-tile-value" data-world-tile="day">—</b><small class="dai-world-tile-sub" data-world-tile-sub="clock"></small></div><div class="dai-world-tile"><span class="dai-world-tile-label">时期</span><b class="dai-world-tile-value" data-world-tile="era">—</b><button type="button" class="dai-world-tile-edit" data-world-tile-edit="era" title="修改时期">✎</button><span class="dai-world-tile-editor" data-world-tile-editor="era" hidden><input type="text" data-world-info="era" placeholder="如 萧家废物时期"><button type="button" class="dai-secondary-button" data-world-info-set="era">确定</button></span></div><div class="dai-world-tile"><span class="dai-world-tile-label">所在地</span><b class="dai-world-tile-value" data-world-tile="location">—</b><button type="button" class="dai-world-tile-edit" data-world-tile-edit="location" title="修改所在地">✎</button><span class="dai-world-tile-editor" data-world-tile-editor="location" hidden><input type="text" data-world-info="location" placeholder="如 乌坦城"><button type="button" class="dai-secondary-button" data-world-info-set="location">确定</button></span></div><div class="dai-world-tile"><span class="dai-world-tile-label">天气</span><b class="dai-world-tile-value" data-world-tile="weather">—</b><button type="button" class="dai-world-tile-edit" data-world-tile-edit="weather" title="修改天气">✎</button><span class="dai-world-tile-editor" data-world-tile-editor="weather" hidden><input type="text" data-world-info="weather" placeholder="如 晴"><button type="button" class="dai-secondary-button" data-world-info-set="weather">确定</button></span></div><div class="dai-world-tile"><span class="dai-world-tile-label">名声</span><b class="dai-world-tile-value" data-world-tile="reputation">—</b><button type="button" class="dai-world-tile-edit" data-world-tile-edit="reputation" title="修改名声">✎</button><span class="dai-world-tile-editor" data-world-tile-editor="reputation" hidden><input type="text" data-world-info="reputation" placeholder="如 乌坦城小有名气"><button type="button" class="dai-secondary-button" data-world-info-set="reputation">确定</button></span></div><div class="dai-world-tile"><span class="dai-world-tile-label">通缉度</span><b class="dai-world-tile-value" data-world-tile="wanted">—</b><button type="button" class="dai-world-tile-edit" data-world-tile-edit="wanted" title="修改通缉度">✎</button><span class="dai-world-tile-editor" data-world-tile-editor="wanted" hidden><input type="text" data-world-info="wanted" placeholder="如 被米特尔家族记恨"><button type="button" class="dai-secondary-button" data-world-info-set="wanted">确定</button></span></div></div><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-world-advance="1">推进 1 天</button><button type="button" class="dai-secondary-button" data-world-advance="7">推进 7 天</button><input type="number" min="1" max="365" step="1" data-world-days placeholder="天数" aria-label="自定义推进天数"><button type="button" class="dai-secondary-button" data-world-advance-custom>推进</button></div><label class="dai-setting-row"><span><b>改为第几天</b><small>直接设定时钟，用于修正跳变。</small></span><span class="dai-setting-inline"><input type="number" min="1" max="99999" step="1" data-world-setday placeholder="如 30"><button type="button" class="dai-secondary-button" data-world-setday-apply>设定</button></span></label><label class="dai-setting-row"><span><b>世界氛围</b><small>决定模型投放事件的频率和烈度。</small></span><span class="dai-segmented"><span class="dai-world-tension" data-world-tension-display role="status"></span><button type="button" class="dai-segmented-button" data-world-tension="calm">平静</button><button type="button" class="dai-segmented-button" data-world-tension="rising">升温</button><button type="button" class="dai-segmented-button" data-world-tension="storm">风波</button></span></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>主角身边的事件</b><small>模型会看到这些并把它们织进剧情；了结后从注入里退场。</small><button type="button" class="dai-impact-edit" data-modal-open="world-event" data-modal-title="登记事件">＋ 登记</button></div><div class="dai-world-events" data-world-events-near></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>世界大事</b><small>大陆层面的事件；重大的会标星，置顶的不参与上限清理。</small></div><div class="dai-world-events" data-world-events-world></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>任务</b><small>模型识别剧情里的目标就立任务；全部任务都在这里。</small><button type="button" class="dai-impact-edit" data-modal-open="world-task" data-modal-title="接下任务">＋ 接任务</button></div><div class="dai-world-tasks" data-world-tasks></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>势力</b><small>与主角有过恩怨往来的势力：态度与动向随剧情更新，敌对的最先注入。</small><button type="button" class="dai-impact-edit" data-modal-open="world-faction" data-modal-title="登记势力">＋ 登记</button></div><div class="dai-world-factions" data-world-factions></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>人物</b><small>与主角有交情或恩怨的人物及态度，正文按这里写人物反应。</small><button type="button" class="dai-impact-edit" data-modal-open="world-person" data-modal-title="登记人物">＋ 登记</button></div><div class="dai-world-people" data-world-people></div></div>
                        <div class="dai-modal-dock" data-modal-dock="world-task" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>接一个任务</b><small>模型没立但你想要的，自己记一笔。</small></div><label class="dai-setting-row"><span><b>任务名</b><small>一句话说清要做什么。</small></span><input type="text" data-world-task-title placeholder="例：查出城东窃贼的来历"></label><label class="dai-setting-row"><span><b>详细资料</b><small>目标、背景、现状，写多少都行。</small></span><input type="text" data-world-task-detail placeholder="例：连日失窃，掌柜悬赏；已知窃贼夜行、身法利落"></label><label class="dai-setting-row"><span><b>来源</b><small>这任务从哪来：谁托付、什么契机。</small></span><input type="text" data-world-task-basis placeholder="例：药铺掌柜悬赏托付"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>时限（天）</b><small>留空不限期。</small></span><input type="number" min="1" max="90" step="1" data-world-task-days placeholder="如 7"></label></div><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-world-addtask>接下任务</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div><div class="dai-modal-dock" data-modal-dock="world-faction" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>登记势力</b><small>与主角有恩怨往来的势力；同名直接更新。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>势力名</b></span><input type="text" data-world-faction-name placeholder="例：云岚宗"></label><label class="dai-setting-row"><span><b>态度</b></span><select data-world-faction-stance><option value="hostile">敌对</option><option value="wary">警惕</option><option value="neutral">中立</option><option value="friendly">友好</option><option value="allied">同盟</option></select></label></div><label class="dai-setting-row"><span><b>动向</b><small>势力现在在干什么。</small></span><input type="text" data-world-faction-dynamics placeholder="例：为退婚一事派使者常驻乌坦城"></label><label class="dai-setting-row"><span><b>依据</b></span><input type="text" data-world-faction-basis placeholder="例：本楼使者登门"></label><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-world-setfaction>登记 / 更新</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div><div class="dai-modal-dock" data-modal-dock="world-person" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>登记人物</b><small>与主角有交情或恩怨的人及态度；同名直接更新。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>人物名</b></span><input type="text" data-world-person-name placeholder="例：药老"></label><label class="dai-setting-row"><span><b>对主角的态度</b></span><input type="text" data-world-person-attitude placeholder="例：严厉但护短，亦师亦父"></label></div><label class="dai-setting-row"><span><b>依据</b></span><input type="text" data-world-person-basis placeholder="例：第二楼药老出手相护"></label><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-world-setperson>登记 / 更新</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div><div class="dai-modal-dock" data-modal-dock="world-event" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>登记事件</b><small>模型漏记时在这里补一笔，格式与模型指令一致。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>范围</b></span><select data-world-add-scope><option value="near">主角身边</option><option value="world">世界大事</option></select></label><label class="dai-setting-row"><span><b>分量</b></span><select data-world-add-weight><option value="minor">普通</option><option value="major">重大</option><option value="rumor">传闻（未证实）</option></select></label></div><label class="dai-setting-row"><span><b>事件内容</b><small>一句话说清发生了什么，不拘题材。</small></span><input type="text" data-world-add-text placeholder="例：城东连着三家铺子夜里失窃"></label><label class="dai-setting-row"><span><b>依据</b><small>它从哪来：哪楼、谁、什么事引出的。</small></span><input type="text" data-world-add-basis placeholder="例：上一楼酒馆闲谈提到的失窃传闻"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>有效期（天）</b><small>留空长期有效；到期自动了结。</small></span><input type="number" min="1" max="90" step="1" data-world-add-days placeholder="如 5"></label></div><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-world-add>登记事件</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div>
                        <div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">◌</span><span><b>启用世界事件系统</b><small>关闭后不再读模型指令、不再注入世界现状。</small></span><input type="checkbox" data-setting="world.eventEnabled"></div><label class="dai-setting-row dai-setting-toggle"><span><b>注入世界现状</b><small>生成前把时钟、现状和进行中的事件写进提示词。</small></span><input type="checkbox" data-setting="world.eventInject"></label><label class="dai-setting-row"><span><b>现状注入字数上限</b><small>超预算先丢事件，保住时钟；0 为默认 900。</small></span><input type="number" min="0" max="4000" step="100" data-setting="world.eventBudget"></label></div>
                        <details class="dai-settle-category"><summary><span class="dai-feature-icon">◌</span><span><b>指令指南（降级模式）</b><small>关闭自动决定时随世界现状注入的规则正文；点开修改，清空恢复内置默认。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>规则正文</b><small>事件取材规则、时限要求都写在这里，可按你的玩法改写。</small></span><textarea data-setting="world.eventGuide" rows="9" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-world-guide-default>填入默认规则</button><small>默认规则含“事件要有依据、不照搬原著、时限必带 days”。</small></div></div></details>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>模型决定（LLM 决定脚本执行）</b><small>生成结束后，模型读最近聊天 + 相关世界书条目 + 世界台账做一次独立决定，输出严格 JSON，脚本逐条校验执行并显示在这里。决定用的接口与参数在「模型设置」页。</small></div><div class="dai-feature-toggle"><span class="dai-feature-icon">◌</span><span><b>启用模型决定</b><small>关闭后退回“只认正文指令块”的降级模式。</small></span><input type="checkbox" data-setting="world.decideEnabled"></div><label class="dai-setting-row dai-setting-toggle"><span><b>每轮生成后自动决定</b><small>关闭后只能点“让模型决定一次”手动跑。</small></span><input type="checkbox" data-setting="world.decideAuto"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>喂最近几楼聊天</b></span><input type="number" min="1" max="12" step="1" data-setting="world.decideMaxFloors"></label><label class="dai-setting-row"><span><b>世界书条目上限</b><small>按本轮聊天匹配相关条目，0 = 不带世界书。</small></span><input type="number" min="0" max="40" step="1" data-setting="world.decideMaxEntries"></label></div><p class="dai-turn-result" data-world-decide-status role="status">还没有运行。生成结束后会自动决定。</p><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-world-decide-run>让模型决定一次</button></div><div class="dai-world-decide-result" data-world-decide-result></div><details class="dai-prompt-fold"><summary><span><b>决定提示词</b><small>模型做决定时收到的 system 规则；点开修改，清空恢复内置默认。改写时保持“只输出 JSON”和操作字段名不变。</small></span></summary><label class="dai-setting-row"><span><b>规则正文</b><small>事件取材、传闻、机遇危机、名声通缉的规则都在这里，可按玩法改写。</small></span><textarea data-setting="world.decidePrompt" rows="10" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-world-decide-default>填入默认规则</button><small>默认规则含“事件要有依据、传闻不当事实、机遇危机偶尔投放”。</small></div></details></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>世界指令流水</b><small>最近几批指令的执行结果；重 roll 一楼会先撤销它上一版指令。</small></div><div class="dai-world-journal" data-world-journal></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>旧链路（手动结算）</b><small>旧版"面板里点结算"链路的设置，与新事件系统互不干扰。</small></div><div class="dai-feature-toggle"><span class="dai-feature-icon">◌</span><span><b>启用旧链路世界推进</b><small>关闭后不会调用 world-advance 模块。</small></span><input type="checkbox" data-setting="enableWorldProgress"></div><label class="dai-setting-row dai-setting-toggle"><span><b>允许自动推进</b><small>收到时间推进请求时才会生效。</small></span><input type="checkbox" data-setting="world.autoAdvance"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>默认推进分钟数</b></span><input type="number" min="1" max="1440" step="1" data-setting="world.tickMinutes"></label><label class="dai-setting-row dai-setting-toggle"><span><b>保留未确认候选</b><small>不把推测直接当成世界事实。</small></span><input type="checkbox" data-setting="world.preserveUnconfirmed"></label></div></div>
                    </section>
                    <section class="dai-settings-page" data-settings-section="npc" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 06</span><h3>NPC 决策</h3><p>控制相关人物的有限决策候选，不替 NPC 直接越过确认边界。</p></div><div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">♙</span><span><b>启用 NPC 自主决策</b><small>控制人物候选计划是否参与调度。</small></span><input type="checkbox" data-setting="enableNpcAutonomy"></div><label class="dai-setting-row dai-setting-toggle"><span><b>提交前要求确认</b><small>候选计划必须经过确认才可继续。</small></span><input type="checkbox" data-setting="npc.requireConfirmation"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>最多候选计划</b></span><input type="number" min="1" max="20" step="1" data-setting="npc.maxCandidates"></label><label class="dai-setting-row dai-setting-toggle"><span><b>允许人物冲突候选</b><small>保留冲突供上层处理。</small></span><input type="checkbox" data-setting="npc.allowConflicts"></label></div></div></section>
                    <section class="dai-settings-page" data-settings-section="npcledger" role="tabpanel" hidden>
                        <div class="dai-page-heading"><h3>人物簿</h3><p>每个人按同一套格式记账：身份、外貌、修为、性格、对你的好感、资产、处境、秘密和经历流水。正文写完后由“人物记录员”补一笔，下一楼再按“在场 × 重要”决定给正文模型看多少人、看多少细节。点人名看完整档案；重大转变单独记在「人物经历」页。</p></div>
                        <div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">☰</span><span><b>启用人物簿</b><small>关闭后不记账、不注入；已经记下的档案仍留在聊天存档里，不会被删。</small></span><input type="checkbox" data-setting="enableNpcLedger"></div><label class="dai-setting-row dai-setting-toggle"><span><b>生成后自动记账</b><small>每轮正文结束后让“人物记录员”读最近两楼，把这一轮的变化记进档案；关掉后只能手动记一次。</small></span><input type="checkbox" data-setting="npc.ledgerAuto"></label><label class="dai-setting-row"><span><b>记账节奏</b><small>每轮都记更像实时，但每轮多一次小调用；每三轮更省，代价是中间两轮的变化要等下次记账才进档。</small></span><select data-setting="npc.ledgerEvery"><option value="1">每轮生成后</option><option value="2">每两轮生成后</option><option value="3">每三轮生成后</option></select></label><label class="dai-setting-row dai-setting-toggle"><span><b>把人物档案写进正文提示词</b><small>关掉后只记账、不告诉正文模型——人物就会“忘了自己身上发生过什么”。</small></span><input type="checkbox" data-setting="npc.ledgerInject"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>注入字数预算</b><small>每轮最多花多少字写人物档案；超了就把最不重要的人先降成一行。</small></span><input type="number" min="0" max="4000" step="100" data-setting="npc.ledgerBudget"></label><label class="dai-setting-row"><span><b>全字段最多几个人</b><small>“在场且重要”的人按完整档案写，超出这个数就只写一行。</small></span><input type="number" min="1" max="20" step="1" data-setting="npc.ledgerMaxFull"></label><label class="dai-setting-row"><span><b>记录员看最近几楼</b><small>看太少会漏，看太多会慢；两楼通常足够判断这一轮谁动了。</small></span><input type="number" min="1" max="12" step="1" data-setting="npc.ledgerFloors"></label></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>本局人物</b><small>一人一张卡；点名字打开这个人的信息面板，所有字段都能直接改，经历也在面板里。</small></div><p class="dai-state-strip" data-npc-ledger-summary>还没有载入人物簿。</p><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>只看</b></span><select data-npc-ledger-filter><option value="">全部</option><option value="present">在场的</option><option value="absent">不在场的</option><option value="important">重要的</option></select></label><label class="dai-setting-row"><span><b>搜名字</b><small>姓名、别名、称号都能搜。</small></span><input type="search" data-npc-ledger-search placeholder="如 萧战"></label></div><p class="dai-turn-result" data-npc-ledger-status role="status">还没有记账。生成结束后，人物记录员会把这一轮的人物变化写进档案。</p><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-npc-ledger-run>让记录员记一次</button><button type="button" class="dai-secondary-button" data-npc-ledger-refresh>刷新名单</button><button type="button" class="dai-secondary-button" data-npc-ledger-extract>按世界书补空字段</button><button type="button" class="dai-secondary-button" data-modal-open="npc-patch" data-modal-title="记进人物簿">＋ 补一笔</button></div><ul class="dai-status-list dai-npc-grid" data-npc-ledger-list></ul></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>冷藏推进台</b><small>只给你勾选的人补世界时间已经走过的那一段；不会自行推进时间，先出草稿，确认后才写回人物簿。人物列表里的“冷藏”按钮就是勾选。</small></div><p class="dai-state-strip" data-npc-cold-summary>当前世界日：第 1 天 · 未选择冷藏人物</p><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-npc-cold-scan>扫描需要推进的人物</button><button type="button" class="dai-secondary-button" data-npc-cold-clear>清空冷藏选择</button></div><div data-npc-cold-previews></div><details class="dai-prompt-fold"><summary><span><b>推进员提示词</b><small>留空使用内置规则；必须保留“先出草稿、只输出 JSON”等边界；点开修改。</small></span></summary><label class="dai-setting-row"><span><b>规则正文</b><small>改完下一轮生效；清空恢复内置默认。</small></span><textarea data-setting="npc.coldPrompt" rows="8" spellcheck="false" placeholder="打开页面会自动铺入当前生效规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-npc-cold-default>填入默认推进规则</button></div></details></div>
                        <details class="dai-settle-category"><summary><span class="dai-feature-icon">☰</span><span><b>记录员提示词</b><small>人物记录员收到的 system 规则；点开修改，清空恢复内置默认。改写时保持“只输出 JSON”不变。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>规则正文</b><small>好感只记增减、流水只追加、没变化就不写。</small></span><textarea data-setting="npc.ledgerPrompt" rows="9" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-npc-ledger-default>填入默认规则</button><small>默认规则含“好感只记增减、流水只追加、没变化就不写”。</small></div></div></details>
                        <div class="dai-modal-dock" data-modal-dock="npc-patch" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>手动记账</b><small>一条补丁 = 一个人这一轮的变化；认不出的字段会被跳过，不会打断整条补丁。</small></div><label class="dai-setting-row"><span><b>补丁</b><small>例：{"人物":[{"姓名":"萧战","好感":3,"好感理由":"护住族人","态度":"对这个后辈多了几分认可","位置":"萧家议事厅","在场":"在场","流水":["主持族会，压下二长老的质疑"]}]}</small></span><textarea data-npc-ledger-patch rows="7" spellcheck="false" placeholder="粘贴或手写一条补丁"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-npc-ledger-apply>记进人物簿</button><button type="button" class="dai-secondary-button" data-npc-ledger-export>导出全簿</button><button type="button" class="dai-secondary-button" data-npc-ledger-import>导入全簿</button><button type="button" class="dai-secondary-button" data-npc-ledger-clear>清空本局人物簿</button><button type="button" class="dai-secondary-button" data-npc-ledger-extract-all>按世界书重抽：只填空着的字段</button></div></div><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div>
                    </section>
                    <section class="dai-settings-page" data-settings-section="self" role="tabpanel" hidden>
                        <div class="dai-page-heading"><h3>纳戒</h3><p>主角自身与随身之物的总账：身份、境界、功法斗技、行囊、制作台、目标约定。生成结束后由决定模型读剧情记账，脚本逐条校验执行；这里也能手动改，与模型走同一套规则。条目点开看完整资料，添加表单收进了弹窗。</p></div>
                        <div class="dai-settings-card">
                            <div class="dai-self-tabs" role="tablist">
                                <button type="button" class="dai-self-tab is-active" data-self-tab="profile">基本信息</button>
                                <button type="button" class="dai-self-tab" data-self-tab="techniques">功法</button>
                                <button type="button" class="dai-self-tab" data-self-tab="skills">斗技</button>
                                <button type="button" class="dai-self-tab" data-self-tab="bag">行囊</button>
                                <button type="button" class="dai-self-tab" data-self-tab="craft">制作台</button>
                                <button type="button" class="dai-self-tab" data-self-tab="goals">目标</button>
                            </div>
                            <p class="dai-state-strip" data-self-summary>还没有载入纳戒。</p>
                            <p class="dai-turn-result" data-self-status role="status">手动改动与模型决定走同一套校验，改完立刻生效并记进流水。</p>
                        </div>
                        <div data-self-pane="profile">
                            <div class="dai-settings-card"><div class="dai-card-heading"><b>主角面板</b><small>标签固定，读到了就填，没读到就空着；正文模型每轮都看得到这些。</small></div><div class="dai-self-panel"><div class="dai-self-panel-row"><span>姓名</span><b data-self-panel="name">—</b></div><div class="dai-self-panel-row"><span>性别</span><b data-self-panel="gender">—</b></div><div class="dai-self-panel-row"><span>年龄</span><b data-self-panel="age">—</b></div><div class="dai-self-panel-row"><span>种族</span><b data-self-panel="race">—</b></div><div class="dai-self-panel-row"><span>出身</span><b data-self-panel="origin">—</b></div><div class="dai-self-panel-row"><span>所属</span><b data-self-panel="affiliation">—</b></div><div class="dai-self-panel-row"><span>斗气属性</span><b data-self-panel="attribute">—</b></div><div class="dai-self-panel-row"><span>天赋</span><b data-self-panel="talent">—</b></div><div class="dai-self-panel-row dai-self-panel-wide"><span>外貌</span><b data-self-panel="appearance">—</b></div><div class="dai-self-panel-row"><span>境界</span><b data-self-panel="realm">—</b></div><div class="dai-self-panel-row"><span>金币</span><b data-self-panel="gold">—</b></div><div class="dai-self-panel-row dai-self-panel-wide"><span>称号</span><b data-self-panel="titles">—</b></div></div><p class="dai-turn-result" data-self-dbbridge></p><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-modal-open="self-profile" data-modal-title="编辑主角档案">编辑档案</button></div></div>
                            <div class="dai-modal-dock" data-modal-dock="self-profile" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>身份档案</b><small>正文模型每轮都会看到这些；年龄由剧情推进更新，不要手填了又让模型改回去。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>姓名</b></span><input type="text" data-self-profile-input="name" placeholder="如 萧炎"></label><button type="button" class="dai-secondary-button" data-self-profile-set="name">设定</button><label class="dai-setting-row"><span><b>性别</b></span><input type="text" data-self-profile-input="gender" placeholder="如 男"></label><button type="button" class="dai-secondary-button" data-self-profile-set="gender">设定</button><label class="dai-setting-row"><span><b>年龄</b></span><input type="text" data-self-profile-input="age" placeholder="如 15岁"></label><button type="button" class="dai-secondary-button" data-self-profile-set="age">设定</button><label class="dai-setting-row"><span><b>种族</b></span><input type="text" data-self-profile-input="race" placeholder="如 人族"></label><button type="button" class="dai-secondary-button" data-self-profile-set="race">设定</button><label class="dai-setting-row"><span><b>出身</b></span><input type="text" data-self-profile-input="origin" placeholder="如 乌坦城萧家"></label><button type="button" class="dai-secondary-button" data-self-profile-set="origin">设定</button><label class="dai-setting-row"><span><b>所属</b></span><input type="text" data-self-profile-input="affiliation" placeholder="如 萧家 / 迦南学院"></label><button type="button" class="dai-secondary-button" data-self-profile-set="affiliation">设定</button><label class="dai-setting-row"><span><b>斗气属性</b><small>火/风/雷/冰/水/土/木/暗/毒/无属性，最多 12 字。</small></span><input type="text" data-self-profile-input="attribute" placeholder="如 火 / 无属性"></label><button type="button" class="dai-secondary-button" data-self-profile-set="attribute">设定</button><label class="dai-setting-row"><span><b>天赋</b></span><input type="text" data-self-profile-input="talent" placeholder="如 曾经的斗气天才"></label><button type="button" class="dai-secondary-button" data-self-profile-set="talent">设定</button><label class="dai-setting-row"><span><b>外貌</b><small>最多 160 字。</small></span><input type="text" data-self-profile-input="appearance" placeholder="黑色衣袍的清瘦少年"></label><button type="button" class="dai-secondary-button" data-self-profile-set="appearance">设定</button></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>境界</b><small>斗之气→斗者→…→斗帝。</small></span><input type="text" data-self-realm placeholder="如 斗者"></label><label class="dai-setting-row"><span><b>段位</b><small>段/星/层。</small></span><input type="text" data-self-stage placeholder="如 三段"></label><button type="button" class="dai-secondary-button" data-self-realm-set>突破</button><label class="dai-setting-row"><span><b>金币</b></span><input type="number" min="0" max="999999999" step="1" data-self-gold placeholder="3200"></label><button type="button" class="dai-secondary-button" data-self-gold-set>设定</button></div><label class="dai-setting-row"><span><b>称号</b><small>写一个加一个；下面的称号点 × 移除。</small></span><input type="text" data-self-title placeholder="如 乌坦城新星"></label><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-self-title-add>加称号</button></div><div class="dai-self-titles" data-self-titles></div></div><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-agent-modal-close>完成</button></div></div>
                            <div class="dai-settings-card"><div class="dai-card-heading"><b>纳戒流水</b><small>最近几批指令的执行结果；重 roll 一楼会先撤销它上一版指令。</small></div><div class="dai-world-journal" data-self-journal></div></div>
                        </div>
                        <div data-self-pane="techniques" hidden>
                            <div class="dai-settings-card"><div class="dai-card-heading"><b>功法</b><small>修炼功法、身法、炼药术都记在这里；点条目看完整资料。</small><button type="button" class="dai-impact-edit" data-modal-open="self-techniques" data-modal-title="登记功法">＋ 添加</button></div><div class="dai-self-entries" data-self-list="techniques"></div></div>
                        </div>
                        <div data-self-pane="skills" hidden>
                            <div class="dai-settings-card"><div class="dai-card-heading"><b>斗技</b><small>攻击、防御、身法、辅助各类战技；点条目看完整资料。</small><button type="button" class="dai-impact-edit" data-modal-open="self-skills" data-modal-title="登记斗技">＋ 添加</button></div><div class="dai-self-entries" data-self-list="skills"></div></div>
                        </div>
                        <div data-self-pane="bag" hidden>
                            <div class="dai-settings-card"><div class="dai-card-heading"><b>行囊</b><small>丹药、材料、武器防具、杂物都在这里；同名同类别自动并账。</small><button type="button" class="dai-impact-edit" data-modal-open="self-items" data-modal-title="放入物品">＋ 添加</button></div><div class="dai-self-entries" data-self-list="items"></div></div>
                        </div>
                        <div data-self-pane="craft" hidden>
                            <div class="dai-settings-card"><div class="dai-card-heading"><b>已掌握配方</b><small>学会的丹方、器谱记在这里；材料清单写关键几味就够。</small><button type="button" class="dai-impact-edit" data-modal-open="self-recipes" data-modal-title="记配方">＋ 添加</button></div><div class="dai-self-entries" data-self-list="recipes"></div></div>
                            <div class="dai-settings-card"><div class="dai-card-heading"><b>炼制进度</b><small>开工后按世界时钟倒数；出炉点“成丹”或“炸炉”。</small><button type="button" class="dai-impact-edit" data-modal-open="self-crafts" data-modal-title="开工炼制">＋ 添加</button></div><div class="dai-self-entries" data-self-list="crafts"></div></div>
                        </div>
                        <div data-self-pane="goals" hidden>
                            <div class="dai-settings-card"><div class="dai-card-heading"><b>目标与约定</b><small>主线排最前并标星；达成后退场，正文模型每轮都看得到没完成的目标。</small><button type="button" class="dai-impact-edit" data-modal-open="self-goals" data-modal-title="立目标">＋ 添加</button></div><div class="dai-self-entries" data-self-list="goals"></div></div>
                        </div>
                        <div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">◉</span><span><b>启用纳戒</b><small>关闭后不记账、不注入；已记下的内容仍留在聊天存档里。</small></span><input type="checkbox" data-setting="enableSelfLedger"></div><label class="dai-setting-row dai-setting-toggle"><span><b>把纳戒写进正文提示词</b><small>生成前把主角自身状态写进提示词，正文必须与之保持一致。</small></span><input type="checkbox" data-setting="self.inject"></label><label class="dai-setting-row"><span><b>注入字数上限</b><small>超预算从目标、进行中炼制、行囊往上丢，身份境界永远保留；0 为默认 900。</small></span><input type="number" min="0" max="4000" step="100" data-setting="self.injectBudget"></label><label class="dai-setting-row dai-setting-toggle"><span><b>镜像到龙血玄黄数据库</b><small>把纳戒与世界台账同步写进「龙血玄黄·数据库」的表格（表=账本，面板=前端）；没装该脚本时自动停用，照旧存聊天档案。</small></span><input type="checkbox" data-setting="enableDbBridge"></label><p class="dai-turn-result" data-self-dbbridge></p></div>
                        <details class="dai-settle-category"><summary><span class="dai-feature-icon">◉</span><span><b>指令指南（降级模式）</b><small>关闭自动决定时随纳戒现状注入的规则正文；点开修改，清空恢复内置默认。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>规则正文</b><small>操作清单、记账规则（有据可依、不照搬原著、炼成补账）都写在这里，可按你的玩法改写。</small></span><textarea data-setting="self.guide" rows="9" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-self-guide-default>填入默认规则</button><small>默认规则含“只记主角自身、变化要有依据、炼成后补记行囊”。</small></div></div></details>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>模型决定（LLM 决定脚本执行）</b><small>生成结束后，模型读最近聊天 + 相关世界书条目 + 纳戒现状做一次独立决定，输出严格 JSON，脚本逐条校验执行并显示在这里。决定用的接口与参数在「模型设置」页。</small></div><div class="dai-feature-toggle"><span class="dai-feature-icon">◉</span><span><b>启用模型决定</b><small>关闭后退回“只认正文 self 指令块”的降级模式。</small></span><input type="checkbox" data-setting="self.decideEnabled"></div><label class="dai-setting-row dai-setting-toggle"><span><b>每轮生成后自动决定</b><small>关闭后只能点“让模型决定一次”手动跑。</small></span><input type="checkbox" data-setting="self.decideAuto"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>喂最近几楼聊天</b></span><input type="number" min="1" max="12" step="1" data-setting="self.decideMaxFloors"></label><label class="dai-setting-row"><span><b>世界书条目上限</b><small>按本轮聊天匹配相关条目，0 = 不带世界书。</small></span><input type="number" min="0" max="40" step="1" data-setting="self.decideMaxEntries"></label></div><p class="dai-turn-result" data-self-decide-status role="status">还没有运行。生成结束后会自动决定。</p><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-self-decide-run>让模型决定一次</button><button type="button" class="dai-secondary-button" data-self-reset>清空本局纳戒</button></div><div class="dai-world-decide-result" data-self-decide-result></div><details class="dai-prompt-fold"><summary><span><b>决定提示词</b><small>模型做决定时收到的 system 规则；点开修改，清空恢复内置默认。改写时保持“只输出 JSON”和操作字段名不变。</small></span></summary><label class="dai-setting-row"><span><b>规则正文</b><small>境界阶梯、炼成补账、有据可依的规则都在这里，可按玩法改写。</small></span><textarea data-setting="self.decidePrompt" rows="10" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-self-decide-default>填入默认规则</button><small>默认规则含“境界必须剧情真到位、炼成后补记行囊、无变化不记账”。</small></div></details></div>
                        <div class="dai-modal-dock" data-modal-dock="self-techniques" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>登记功法</b><small>模型漏记时在这里补一笔。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>名称</b></span><input type="text" data-self-new="techniques.name" placeholder="如 焚决"></label><label class="dai-setting-row"><span><b>品级</b></span><input type="text" data-self-new="techniques.grade" placeholder="黄阶低级 ~ 天阶高级"></label><label class="dai-setting-row"><span><b>类型</b></span><input type="text" data-self-new="techniques.type" placeholder="修炼功法 / 身法 / 炼药术"></label><label class="dai-setting-row"><span><b>进度</b></span><input type="text" data-self-new="techniques.progress" placeholder="如 第三层"></label><label class="dai-setting-row"><span><b>来源</b></span><input type="text" data-self-new="techniques.source" placeholder="如 药老所赠"></label></div><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-self-create="techniques">登记功法</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div>
                        <div class="dai-modal-dock" data-modal-dock="self-skills" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>登记斗技</b></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>名称</b></span><input type="text" data-self-new="skills.name" placeholder="如 八极崩"></label><label class="dai-setting-row"><span><b>品级</b></span><input type="text" data-self-new="skills.grade" placeholder="黄阶低级 ~ 天阶高级"></label><label class="dai-setting-row"><span><b>类型</b></span><input type="text" data-self-new="skills.type" placeholder="攻击 / 防御 / 身法 / 辅助"></label><label class="dai-setting-row"><span><b>熟练度</b></span><input type="text" data-self-new="skills.progress" placeholder="如 小成"></label><label class="dai-setting-row"><span><b>来源</b></span><input type="text" data-self-new="skills.source" placeholder="从哪学来的"></label></div><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-self-create="skills">登记斗技</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div>
                        <div class="dai-modal-dock" data-modal-dock="self-items" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>放入物品</b></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>名称</b></span><input type="text" data-self-new="items.name" placeholder="如 回气丹"></label><label class="dai-setting-row"><span><b>类别</b></span><select data-self-new="items.category"><option value="丹药">丹药</option><option value="材料">材料</option><option value="武器">武器</option><option value="防具">防具</option><option value="杂物">杂物</option><option value="关键物">关键物</option></select></label><label class="dai-setting-row"><span><b>品级</b></span><input type="text" data-self-new="items.grade" placeholder="如 一品"></label><label class="dai-setting-row"><span><b>数量</b></span><input type="number" min="1" max="999999" step="1" data-self-new="items.count" placeholder="1"></label></div><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-self-create="items">放入行囊</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div>
                        <div class="dai-modal-dock" data-modal-dock="self-recipes" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>记配方</b></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>名称</b></span><input type="text" data-self-new="recipes.name" placeholder="如 回气丹"></label><label class="dai-setting-row"><span><b>门类</b></span><select data-self-new="recipes.craft"><option value="炼药">炼药</option><option value="炼器">炼器</option><option value="其他">其他</option></select></label><label class="dai-setting-row"><span><b>品级</b></span><input type="text" data-self-new="recipes.grade" placeholder="如 一品"></label><label class="dai-setting-row"><span><b>材料清单</b></span><input type="text" data-self-new="recipes.materials" placeholder="如 回春草两株、凝气花一株"></label></div><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-self-create="recipes">记配方</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div>
                        <div class="dai-modal-dock" data-modal-dock="self-crafts" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>开工炼制</b></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>名称</b></span><input type="text" data-self-new="crafts.name" placeholder="如 聚气散"></label><label class="dai-setting-row"><span><b>门类</b></span><select data-self-new="crafts.craft"><option value="炼药">炼药</option><option value="炼器">炼器</option><option value="其他">其他</option></select></label><label class="dai-setting-row"><span><b>数量</b></span><input type="number" min="1" max="999999" step="1" data-self-new="crafts.count" placeholder="1"></label><label class="dai-setting-row"><span><b>预计天数</b><small>从今天起算；留空不设期限。</small></span><input type="number" min="1" max="365" step="1" data-self-new="crafts.days" placeholder="如 3"></label><label class="dai-setting-row"><span><b>备注</b></span><input type="text" data-self-new="crafts.note" placeholder="如 缺一味凝骨草"></label></div><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-self-craft-start>开工</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div>
                        <div class="dai-modal-dock" data-modal-dock="self-goals" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>立目标</b></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>目标</b><small>一句话说清要做什么。</small></span><input type="text" data-self-new="goals.text" placeholder="如 三年之约，云岚宗一雪前耻"></label><label class="dai-setting-row"><span><b>优先级</b></span><select data-self-new="goals.priority"><option value="主线">主线</option><option value="支线">支线</option></select></label><label class="dai-setting-row"><span><b>期限</b><small>自由文本。</small></span><input type="text" data-self-new="goals.due" placeholder="如 三年后"></label></div><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-self-create="goals">立目标</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div>
                    </section>
                    <section class="dai-settings-page" data-settings-section="memory" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 12</span><h3>主角记忆</h3><p>记忆分小记忆（轻量近事）与大记忆（值得一直记的事），都永久保存、按需召回——"关联"里的人名/地名出现在最近剧情里才会注入提示词；了结与删除只由书记官或你手动做，脚本从不过期任何记忆。</p></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>记忆总览</b><small>按层统计；召回排序 = 大记忆 → 关键（重要性）→ 强度（被想起的次数）→ 新旧。旧记忆不会被作废，只是排得靠后。</small></div><p class="dai-state-strip" data-memory-overview>还没有载入记忆。</p><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>排序</b></span><select data-memory-sort><option value="time">按生成时间</option><option value="weight">按重要性 / 强度</option></select></label><label class="dai-setting-row"><span><b>只看关联</b><small>下场对手戏前按人扫一遍旧账。</small></span><select data-memory-person><option value="">全部</option></select></label></div><p class="dai-turn-result" data-memory-conflicts hidden></p><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-modal-open="memory-add" data-modal-title="手动登记一条记忆">＋ 手动登记</button></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>大记忆</b><small>值得一直记住的事；★=关键；召回优先于小记忆。每页固定 6 条，翻页看更多。</small></div><div class="dai-world-events" data-memory-list-big></div><div class="dai-pager" data-memory-pager-big></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>小记忆</b><small>轻量近事；分量够了点「提关键」，召回优先级随之提高。每页固定 8 条，翻页看更多。</small></div><div class="dai-world-events" data-memory-list-small></div><div class="dai-pager" data-memory-pager-small></div></div>
                        
                        <div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">✎</span><span><b>启用主角记忆</b><small>关闭后不记账、不召回；已记下的内容仍留在聊天存档里。</small></span><input type="checkbox" data-setting="enableMemoryLedger"></div><label class="dai-setting-row dai-setting-toggle"><span><b>按需召回进正文提示词</b><small>生成前用最近四楼正文比对"关联"，命中的才注入，一场戏没勾到就不注。</small></span><input type="checkbox" data-setting="memory.inject"></label><label class="dai-setting-row"><span><b>召回字数上限</b><small>本场召回的记忆总字数上限；超了从优先级最低的往上丢；0 为默认 900。</small></span><input type="number" min="0" max="4000" step="100" data-setting="memory.injectBudget"></label><label class="dai-setting-row dai-setting-toggle"><span><b>自动决定（书记官）</b><small>每轮生成后由模型决定新记忆与了结；关掉后只认正文里的 memory 指令块。</small></span><input type="checkbox" data-setting="memory.decideAuto"></label><label class="dai-setting-row dai-setting-toggle"><span><b>启用记忆决定调用</b><small>关闭后不再发起书记官调用，只走降级指令。</small></span><input type="checkbox" data-setting="memory.decideEnabled"></label><details class="dai-settle-category"><summary><span class="dai-feature-icon">✎</span><span><b>指令指南（降级模式）</b><small>关闭自动决定时随召回结果注入的规则正文；保持"只输出 JSON"与操作字段名不变，清空恢复内置默认。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>指南正文</b></span><textarea data-setting="memory.guide" rows="9" spellcheck="false"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-memory-guide-default>填入默认指南</button></div></div></details></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>模型决定（LLM 决定脚本执行）</b><small>生成结束后，书记官读最近聊天 + 相关世界书条目 + 本场召回的记忆做一次独立决定，输出严格 JSON，脚本逐条校验执行。</small></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button" data-memory-decide-run>手动决定一次</button><span data-memory-decide-status></span></div><div data-memory-decide-result></div><details class="dai-settle-category"><summary><span class="dai-feature-icon">✦</span><span><b>决定提示词</b><small>书记官的 system 指令；保持"只输出 JSON"与操作字段名不变，清空恢复内置默认。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>提示词正文</b></span><textarea data-setting="memory.decidePrompt" rows="9" spellcheck="false"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-memory-decide-default>填入默认提示词</button></div></div></details></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>记忆指令流水</b><small>最近几批指令的执行结果；重 roll 一楼会先撤销它上一版指令。</small></div><div class="dai-world-journal" data-memory-journal></div></div>
                    <div class="dai-modal-dock" data-modal-dock="memory-add" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>手动登记</b><small>书记官漏记时在这里补一笔，校验与模型指令完全一致。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>层级</b></span><select data-memory-new-tier><option value="small">小记忆</option><option value="big">大记忆</option></select></label><label class="dai-setting-row"><span><b>标签（大记忆可选）</b></span><select data-memory-new-tag><option value="">不标</option><option value="grudge">恩怨</option><option value="intel">情报</option><option value="thread">伏笔</option><option value="milestone">大事记</option></select></label><label class="dai-setting-row"><span><b>分量</b></span><select data-memory-new-weight><option value="minor">一般</option><option value="major">关键</option></select></label></div><label class="dai-setting-row"><span><b>内容</b><small>一句话说清记住了什么、为什么值得记。</small></span><input type="text" data-memory-new-text maxlength="300"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>依据</b><small>从哪来：哪楼/谁/什么事。</small></span><input type="text" data-memory-new-basis maxlength="80"></label><label class="dai-setting-row"><span><b>关联（必填）</b><small>人名/地名/物名，顿号分隔最多 4 个——这是日后按需召回的钥匙。</small></span><input type="text" data-memory-new-related maxlength="140"></label></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>别名（可选）</b><small>同一记忆的其余叫法（药老/药尘），也算召回钥匙。</small></span><input type="text" data-memory-new-aliases maxlength="140"></label><label class="dai-setting-row"><span><b>引文（可选）</b><small>当时的一句原话，召回时以「」带回正文。</small></span><input type="text" data-memory-new-quote maxlength="60"></label></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button" data-memory-add>登记这条记忆</button></div></div><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></section>
                    <section class="dai-settings-page" data-settings-section="impact" role="tabpanel" hidden>
                        <div class="dai-page-heading"><h3>世界影响</h3><p>记录你把这局世界改成了什么样：烧掉的据点、得罪的势力、提前发生或没能发生的原著事件。库跟着这份聊天存档走，写进后续每一轮的正文提示词。账本在下面；添加和编辑都走弹窗。</p></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>世界线最近变化</b><small data-impact-summary>加载中…</small></div><p class="dai-state-strip" data-impact-stats>本轮还没挑过注入；生成前会自动挑。</p><p class="dai-turn-result" data-impact-decide-status role="status">默认按上面的节奏自动记录；也可以点“现在记录一次”。</p><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-impact-open-ledger>打开世界账本</button><button type="button" class="dai-secondary-button" data-impact-add>＋ 记一条</button><button type="button" class="dai-secondary-button" data-impact-record>现在记录一次</button></div><ul class="dai-impact-list dai-impact-recent" data-impact-recent></ul></div><div class="dai-modal-dock" data-modal-dock="impact-ledger" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>世界账本</b><small>全部记录都在这里：筛选、搜索、编辑、收场、删除与档案恢复。</small></div><div class="dai-impact-toolbar"><select data-impact-filter aria-label="筛选影响"><option value="all">全部</option><option value="active">未了结</option><option value="ripened">已发酵</option><option value="closed">已了结</option></select><select data-impact-weight aria-label="按分量筛选"><option value="">分量</option><option value="world">世界级</option><option value="major">大事</option><option value="minor">小事</option></select><select data-impact-kind aria-label="按性质筛选"><option value="">性质</option><option value="direct">直接</option><option value="ripple">涟漪</option><option value="butterfly">蝴蝶</option></select><input type="search" data-impact-search placeholder="搜标题、对象或原著" aria-label="搜索影响"><button type="button" class="dai-button dai-button-ghost" data-impact-refresh>刷新</button></div><ul class="dai-impact-list" data-impact-library></ul><details class="dai-impact-archive" data-impact-archive><summary>档案 <small data-impact-archive-count>0 条</small></summary><p class="dai-impact-empty">被删除或因为库满挤出去的旧影响会留在这里，可以恢复。</p><ol class="dai-impact-list" data-impact-archive-list></ol></details><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-agent-modal-close>关闭</button></div></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>记录与注入</b><small>什么时机记账、怎么进正文；记录员与场记用的接口在「模型设置」页。</small></div><div class="dai-feature-toggle"><span class="dai-feature-icon">⌁</span><span><b>启用世界影响库</b><small>关掉后不记录、不注入，但已记下的内容仍留在聊天存档里。</small></span><input type="checkbox" data-setting="enablePlayerImpact"></div><label class="dai-setting-row dai-setting-toggle"><span><b>生成后自动记录</b><small>让“记录模型”在正文生成结束后把这一轮的世界变化写进库；关掉后只剩手动记录。</small></span><input type="checkbox" data-setting="impact.decideAuto"></label><label class="dai-setting-row"><span><b>记录节奏</b><small>每轮都记更细，但每轮多一次模型调用；每三轮记一次更省，代价是中间两轮的改动要等到下次记账才进库。</small></span><select data-setting="impact.decideEvery"><option value="1">每轮生成后</option><option value="3">每三轮生成后</option></select></label><label class="dai-setting-row"><span><b>总览显示最近几条</b><small>总页面只铺最近生成的影响；其余进「世界账本」弹窗看。</small></span><input type="number" min="1" max="20" step="1" data-setting="impact.recentCount"></label><label class="dai-setting-row dai-setting-toggle"><span><b>把世界线写进正文提示词</b><small>已发生、还没收场的影响会作为“本局世界线”随生成发给正文模型。</small></span><input type="checkbox" data-setting="impact.inject"></label><label class="dai-setting-row dai-setting-toggle"><span><b>注入前让模型挑选</b><small>每轮生成前，让“挑选模型”从账本里挑出这一幕真正用得上的影响，并改写成旁白；关掉则按分量和日期直接取，省一次调用。</small></span><input type="checkbox" data-setting="impact.injectSmart"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>注入字数预算</b><small>每轮最多花多少字描述已改的世界线；超出预算的影响只留在库里。</small></span><input type="number" min="0" max="2000" step="50" data-setting="impact.injectBudget"></label><label class="dai-setting-row"><span><b>注入前看最近几楼</b><small>挑选模型据此判断这一幕的场面：玩家在哪、身边有谁、要做什么。</small></span><input type="number" min="1" max="12" step="1" data-setting="impact.injectFloors"></label></div><label class="dai-setting-row"><span><b>影响链最多接几层</b><small>一条影响还能接出几条后续；超过这个层数就只记录，不再自动接链。</small></span><input type="number" min="0" max="8" step="1" data-setting="impact.maxChainDepth"></label></div>
                        <details class="dai-prompt-fold"><summary><span><b>记录员提示词</b><small>生成结束后记账用的规则；点开才展开。</small></span></summary><label class="dai-setting-row"><span><b>规则正文</b><small>打开页面显示的就是当前生效的全文；清空＝恢复内置默认。改写时保持“只输出 JSON”和操作字段名不变。</small></span><textarea data-setting="impact.prompt" rows="14" spellcheck="false" placeholder="留空使用内置提示词"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-impact-prompt-default="decide">填入内置提示词</button><small>改完下一轮生效，不用重启。</small></div></details>
                        <details class="dai-prompt-fold"><summary><span><b>场记提示词</b><small>生成前挑选并改写影响用的规则；点开才展开。</small></span></summary><label class="dai-setting-row"><span><b>规则正文</b><small>打开页面显示的就是当前生效的全文；清空＝恢复内置默认。改写时保持“只从账本挑、用 #编号”不变。</small></span><textarea data-setting="impact.injectPrompt" rows="12" spellcheck="false" placeholder="留空使用内置提示词"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-impact-prompt-default="inject">填入内置提示词</button><small>默认收起；改完下一轮生效。</small></div></details>
                        <div class="dai-modal-dock" data-modal-dock="impact-form" hidden><div class="dai-settings-card"><div class="dai-impact-form" data-impact-form hidden><input type="hidden" data-impact-field="ref"><div class="dai-impact-form-head"><b data-impact-form-title>记一条世界影响</b><small>手动记的条目和记录员记的一样：会进正文、会发酵，也保留在聊天存档里。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>标题</b></span><input type="text" maxlength="60" data-impact-field="title" placeholder="世界哪一块变了"></label><label class="dai-setting-row"><span><b>对象</b></span><input type="text" maxlength="40" data-impact-field="target" placeholder="哪个地方/势力/规矩"></label></div><label class="dai-setting-row"><span><b>详情</b><small>具体变了什么、有什么能被看见的后果。</small></span><textarea rows="3" maxlength="240" data-impact-field="detail" placeholder="例如：城中药材涨价，加列家族开始暗中追查纵火者"></textarea></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>性质</b></span><select data-impact-field="kind"><option value="direct">直接 · 玩家亲手</option><option value="ripple">涟漪 · 旁人因此改主意</option><option value="butterfly">蝴蝶 · 隔了时间才显形</option></select></label><label class="dai-setting-row"><span><b>分量</b></span><select data-impact-field="weight"><option value="minor">小事</option><option value="major">大事</option><option value="world">世界级</option></select></label><label class="dai-setting-row"><span><b>确定性</b></span><select data-impact-field="certainty"><option value="certain">确凿</option><option value="rumor">传闻</option></select></label></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>依据</b></span><input type="text" maxlength="120" data-impact-field="evidence" placeholder="哪一楼、哪句话"></label><label class="dai-setting-row"><span><b>对上台账事件</b><small>世界运转里的事件编号，如 e2；没有就留空。</small></span><input type="text" maxlength="40" data-impact-field="eventId" placeholder="例如：e2"></label><label class="dai-setting-row"><span><b>原著节点</b><small>没牵动就留空。</small></span><input type="text" maxlength="60" data-impact-field="canon" placeholder="例如：退婚"></label><label class="dai-setting-row"><span><b>原著偏移</b></span><select data-impact-field="shift"><option value="none">不牵动</option><option value="accelerate">加速</option><option value="delay">延后</option><option value="avoid">避过</option><option value="alter">改写</option></select></label></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button" data-impact-save>保存</button><button type="button" class="dai-button dai-button-ghost" data-impact-form-close>取消</button><small role="status" data-impact-form-status></small></div></div></div></div>
                    </section>
                    <section class="dai-settings-page" data-settings-section="sandbox" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 10</span><h3>沙盒模式</h3><p>开启后不再按原著主线排期，改为先查前提、再看惯性；世界仍在运转，只是不替玩家安排剧情。</p><p role="status" data-sandbox-status>改动会先保存；本局真正切换口径需要在本局内确认。</p></div>
                        <div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">◈</span><span><b>启用沙盒模式</b><small>关闭时按主线口径：原著节点到点发生，玩家只影响过程。</small></span><input type="checkbox" data-setting="enableSandboxMode"></div><label class="dai-setting-row"><span><b>世界惯性</b><small>决定原著节点在沙盒里多积极地自行发生。强＝窗口一开始就发生；中＝到窗口结束才发生；弱＝不再自动发生，只留候选。</small></span><select data-setting="sandbox.inertia"><option value="strong">强 · 世界推着走</option><option value="medium">中 · 有人介入才偏离</option><option value="weak">弱 · 默认不动</option></select></label><label class="dai-setting-row dai-setting-toggle"><span><b>原著人物保留自主行动</b><small>关闭后原著人物只对玩家作出反应，不再主动推进自身轨迹。</small></span><input type="checkbox" data-setting="sandbox.canonCharactersAutonomous"></label><label class="dai-setting-row dai-setting-toggle"><span><b>允许中途切换模式</b><small>切换需要确认，而且只做重新对齐，不倒带已经发生的事实、代价和关系。</small></span><input type="checkbox" data-setting="sandbox.allowMidgameSwitch"></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>玩家目标与探索预算</b><small>沙盒没有主线给方向，目标由玩家自己定；这里只管上限。</small></div><label class="dai-setting-row dai-setting-toggle"><span><b>启用玩家自设目标</b><small>把玩家提出的目标记成状态，而不是只在正文里提一句。</small></span><input type="checkbox" data-setting="sandbox.playerGoalsEnabled"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>最多同时进行目标</b></span><input type="number" min="1" max="10" step="1" data-setting="sandbox.maxActiveGoals"></label><label class="dai-setting-row"><span><b>单回合最多新增对象</b><small>限制一回合内新冒出的线索与目标数量。</small></span><input type="number" min="0" max="8" step="1" data-setting="sandbox.maxNewObjectsPerTurn"></label></div><label class="dai-setting-row"><span><b>节点宽限天数</b><small>节点窗口结束后再等这么多游戏日，仍未发生才记为过期。</small></span><input type="number" min="0" max="60" step="1" data-setting="sandbox.nodeWindowSlackDays"></label></div>
                    </section>
                    <section class="dai-settings-page" data-settings-section="runtime" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">系统 / 11</span><h3>运行与界面</h3><p>这里放全局开关、预算保护和诊断选项。</p></div><div class="dai-settings-card"><div class="dai-card-heading"><b>运行预算</b><small>这是保护上限，不代表模型一定会消耗这些额度。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>单次最多模块数</b></span><input type="number" min="1" max="32" step="1" data-setting="budget.maxModules"></label><label class="dai-setting-row"><span><b>最多 NPC 决策数</b></span><input type="number" min="0" max="20" step="1" data-setting="budget.maxNpcDecisions"></label></div><label class="dai-setting-row"><span><b>总等待上限（毫秒）</b></span><input type="number" min="1000" max="600000" step="1000" data-setting="budget.totalTimeoutMs"></label></div><div class="dai-settings-card"><div class="dai-card-heading"><b>反馈显示</b><small>控制页面和右下角反馈的显示内容。</small></div><label class="dai-setting-row dai-setting-toggle"><span><b>显示历史状态</b></span><input type="checkbox" data-setting="status.showHistory"></label><label class="dai-setting-row dai-setting-toggle"><span><b>显示能力检测提示</b></span><input type="checkbox" data-setting="status.showCapabilityBadge"></label><label class="dai-setting-row dai-setting-toggle"><span><b>紧凑界面</b></span><input type="checkbox" data-setting="ui.compact"></label><label class="dai-setting-row dai-setting-toggle"><span><b>先占位再补正文</b><small>等待模型时先在对话里放一条“……”，正文回来后再替换。</small></span><input type="checkbox" data-setting="ui.placeholder"></label><label class="dai-setting-row dai-setting-toggle"><span><b>调试信息</b><small>只记录本地诊断信息，不记录提示词或密钥。</small></span><input type="checkbox" data-setting="debug"></label></div><div class="dai-settings-card"><div class="dai-card-heading"><b>旧版手动脉冲</b><small>默认关闭：正文由酒馆自己生成，扩展只在生成前注入原著设定。开启后回到“面板里点结算这一轮”的旧链路，两条链路会抢正文，不建议同时用。</small></div><label class="dai-setting-row dai-setting-toggle"><span><b>启用旧版手动脉冲</b><small>仅在需要对照旧行为时打开。</small></span><input type="checkbox" data-setting="ui.legacyTurn"></label></div></section>
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
            const coldArea = panel.querySelector('[data-setting="npc.coldPrompt"]');
            if (coldArea && !coldArea.value.trim()) coldArea.value = currentSettings().npc?.coldPrompt || NPC_COLD_PROMPT;
            refreshNpcLedgerPage(panel);
        }
        if (activeSettingsPage === 'self') {
            // 打开页面时把当前生效的决定规则与指令指南铺进文本框，改完即用，清空则回默认。
            for (const area of panel.querySelectorAll('[data-setting="self.decidePrompt"]')) {
                if (!area.value.trim()) area.value = currentSettings().self?.decidePrompt || SELF_DECIDE_PROMPT;
            }
            for (const area of panel.querySelectorAll('[data-setting="self.guide"]')) {
                if (!area.value.trim()) area.value = currentSettings().self?.guide || SELF_GUIDE;
            }
            refreshSelfPage(panel);
        }
        // 同一套设置在多个页面各有一份（模型/提示词在功能页与集中页重复）：切页时全量重同步，保证所见即所存。
        syncSettingsForm();
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
        const tensionButton = event.target.closest?.('[data-world-tension]');
        if (tensionButton) return worldApplyFromPanel(panel, [{ op: 'setTension', level: tensionButton.dataset.worldTension }]);
        const infoSet = event.target.closest?.('[data-world-info-set]');
        if (infoSet) {
            const field = infoSet.dataset.worldInfoSet;
            if (!['era', 'location', 'weather', 'reputation', 'wanted'].includes(field)) return;
            const input = panel.querySelector(`[data-world-info="${field}"]`);
            const value = typeof input?.value === 'string' ? input.value.trim() : '';
            if (input) input.value = '';
            return worldApplyFromPanel(panel, [{ op: 'setInfo', field, text: value }]);
        }
        const tileEdit = event.target.closest?.('[data-world-tile-edit]');
        if (tileEdit) {
            const editor = panel.querySelector(`[data-world-tile-editor="${tileEdit.dataset.worldTileEdit}"]`);
            if (editor) {
                const opening = editor.hidden;
                // 同一时间只开一个编辑条：点另一块的铅笔先把上一块收回。
                for (const other of panel.querySelectorAll('[data-world-tile-editor]')) other.hidden = true;
                editor.hidden = !opening;
                if (opening) {
                    editor.querySelector('input')?.focus();
                    bindWorldTileOutside(panel);
                }
            }
            return;
        }
        if (event.target.closest?.('[data-world-setday-apply]')) {
            const input = panel.querySelector('[data-world-setday]');
            const day = Number(input?.value);
            if (!Number.isInteger(day) || day < 1) return;
            if (input) input.value = '';
            return worldApplyFromPanel(panel, [{ op: 'setClock', day, minute: agentWorldRuntime.status().clock.minute }]);
        }
        const taskComplete = event.target.closest?.('[data-world-task-complete]');
        if (taskComplete) return worldApplyFromPanel(panel, [{ op: 'completeTask', id: taskComplete.dataset.worldTaskComplete }]);
        const taskDelete = event.target.closest?.('[data-world-task-delete]');
        if (taskDelete) return worldApplyFromPanel(panel, [{ op: 'deleteTask', id: taskDelete.dataset.worldTaskDelete }]);
        if (event.target.closest?.('[data-world-addtask]')) return worldAddTaskFromPanel(panel);
        if (event.target.closest?.('[data-world-setfaction]')) return worldSetFactionFromPanel(panel);
        const factionDelete = event.target.closest?.('[data-world-faction-delete]');
        if (factionDelete) return worldApplyFromPanel(panel, [{ op: 'deleteFaction', name: factionDelete.dataset.worldFactionDelete }]);
        if (event.target.closest?.('[data-world-setperson]')) return worldSetPersonFromPanel(panel);
        const personDelete = event.target.closest?.('[data-world-person-delete]');
        if (personDelete) return worldApplyFromPanel(panel, [{ op: 'deletePerson', name: personDelete.dataset.worldPersonDelete }]);
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
        const settleAdd = event.target.closest?.('[data-settle-add-category]');
        if (settleAdd) {
            addSettleCustomCategory(panel);
            return;
        }
        const settleRemove = event.target.closest?.('[data-settle-remove-category]');
        if (settleRemove) {
            removeSettleCustomCategory(panel, settleRemove.dataset.settleRemoveCategory);
            return;
        }
        const worldDecideFetch = event.target.closest?.('[data-worlddecide-models]');
        if (worldDecideFetch) {
            void fetchWorldDecideModels(panel, worldDecideFetch);
            return;
        }
        const factsFetch = event.target.closest?.('[data-facts-models]');
        if (factsFetch) {
            void fetchFactsModels(panel, factsFetch);
            return;
        }
        const memoryDecideFetch = event.target.closest?.('[data-memorydecide-models]');
        if (memoryDecideFetch) {
            void fetchMemoryDecideModels(panel, memoryDecideFetch);
            return;
        }
        const npcColdFetch = event.target.closest?.('[data-npc-cold-models]');
        if (npcColdFetch) {
            void fetchNpcColdModels(panel, npcColdFetch);
            return;
        }
        // —— 纳戒：子页签与手动操作。所有手动改动走 applySelfOps，与模型决定同一套校验。——
        const insideModal = Boolean(event.target.closest?.('.dai-agent-modal'));
        const selfTab = event.target.closest?.('[data-self-tab]');
        if (selfTab) {
            const tab = selfTab.dataset.selfTab;
            for (const item of panel.querySelectorAll('[data-self-tab]')) item.classList.toggle('is-active', item === selfTab);
            for (const pane of panel.querySelectorAll('[data-self-pane]')) pane.hidden = pane.dataset.selfPane !== tab;
            return;
        }
        const selfDetail = event.target.closest?.('[data-self-detail]');
        if (selfDetail) {
            const [list, id] = String(selfDetail.dataset.selfDetail).split(':');
            openSelfDetailModal(panel, list, id);
            return;
        }
        const profileSet = event.target.closest?.('[data-self-profile-set]');
        if (profileSet) {
            const field = profileSet.dataset.selfProfileSet;
            const input = panel.querySelector(`[data-self-profile-input="${field}"]`);
            const value = typeof input?.value === 'string' ? input.value.trim() : '';
            const result = applySelfOps([{ op: 'setProfile', field, text: value }]);
            setSelfStatus(result.applied.length ? `${SELF_PROFILE_LABELS[field] ?? field} 已更新${value ? '' : '（清空）'}。` : `未生效：${result.rejected[0]?.reason ?? '无变化'}`);
            return;
        }
        if (event.target.closest?.('[data-self-realm-set]')) {
            const realm = panel.querySelector('[data-self-realm]')?.value.trim() ?? '';
            const stage = panel.querySelector('[data-self-stage]')?.value.trim() ?? '';
            const result = applySelfOps([{ op: 'setRealm', realm, stage }]);
            setSelfStatus(result.applied.length ? `境界已记为 ${realm}${stage}。` : `未生效：${result.rejected[0]?.reason ?? '无变化'}`);
            return;
        }
        if (event.target.closest?.('[data-self-gold-set]')) {
            const input = panel.querySelector('[data-self-gold]');
            const amount = Number(input?.value);
            if (!Number.isInteger(amount) || amount < 0) { setSelfStatus('金币要填 0 以上的整数。'); return; }
            const result = applySelfOps([{ op: 'setGold', amount }]);
            setSelfStatus(result.applied.length ? `金币已记为 ${amount}。` : `未生效：${result.rejected[0]?.reason ?? '无变化'}`);
            return;
        }
        if (event.target.closest?.('[data-self-title-add]')) {
            const input = panel.querySelector('[data-self-title]');
            const value = typeof input?.value === 'string' ? input.value.trim() : '';
            if (!value) { setSelfStatus('先写称号再加。'); return; }
            const result = applySelfOps([{ op: 'addTitle', text: value }]);
            if (result.applied.length && input) input.value = '';
            setSelfStatus(result.applied.length ? `称号 +${value}。` : `未生效：${result.rejected[0]?.reason ?? '重复或满了'}`);
            return;
        }
        const titleRemove = event.target.closest?.('[data-self-title-remove]');
        if (titleRemove) {
            const value = titleRemove.dataset.selfTitleRemove;
            const result = applySelfOps([{ op: 'removeTitle', text: value }]);
            setSelfStatus(result.applied.length ? `称号 -${value}。` : '这个称号已经不在了。');
            return;
        }
        const selfCreate = event.target.closest?.('[data-self-create]');
        if (selfCreate) {
            selfCreateFromPanel(panel, selfCreate.dataset.selfCreate);
            return;
        }
        if (event.target.closest?.('[data-self-craft-start]')) {
            selfStartCraftFromPanel(panel);
            return;
        }
        const selfRemove = event.target.closest?.('[data-self-remove]');
        if (selfRemove) {
            const [list, id] = String(selfRemove.dataset.selfRemove).split(':');
            const opOf = { techniques: 'removeTechnique', skills: 'removeSkill', items: 'removeItem', recipes: 'removeRecipe', goals: 'removeGoal' };
            const op = opOf[list];
            if (op && id) {
                const result = applySelfOps([{ op, id }]);
                setSelfStatus(result.applied.length ? `已移除 ${id}。` : `未生效：${result.rejected[0]?.reason ?? '编号不存在'}`);
            }
            if (insideModal) closeAgentModal(panel);
            return;
        }
        const selfEquip = event.target.closest?.('[data-self-equip]');
        if (selfEquip) {
            const id = selfEquip.dataset.selfEquip;
            const entry = agentSelfRuntime.snapshot().items.find(item => item.id === id);
            if (!entry) { setSelfStatus('这件物品已经不在行囊里了。'); return; }
            const result = applySelfOps([{ op: 'updateItem', id, equipped: !entry.equipped }]);
            setSelfStatus(result.applied.length ? `${entry.name} 已${entry.equipped ? '卸下' : '装备'}。` : `未生效：${result.rejected[0]?.reason ?? '无变化'}`);
            if (insideModal) closeAgentModal(panel);
            return;
        }
        const selfCountSet = event.target.closest?.('[data-self-count-set]');
        if (selfCountSet) {
            const id = selfCountSet.dataset.selfCountSet;
            const input = panel.querySelector(`[data-self-count-input="${id}"]`);
            const count = Number(input?.value);
            if (!Number.isInteger(count) || count < 0) { setSelfStatus('数量要填 0 以上的整数（0 = 用光移除）。'); return; }
            const result = applySelfOps([{ op: 'updateItem', id, count }]);
            setSelfStatus(result.applied.length ? `${id} 数量已改为 ${count}。` : `未生效：${result.rejected[0]?.reason ?? '编号不存在'}`);
            if (insideModal) closeAgentModal(panel);
            return;
        }
        const selfFinish = event.target.closest?.('[data-self-finish]');
        if (selfFinish) {
            const [id, result] = String(selfFinish.dataset.selfFinish).split(':');
            const outcome = applySelfOps([{ op: 'finishCraft', id, result: result === 'success' ? 'success' : 'fail' }]);
            setSelfStatus(outcome.applied.length ? `${id} 已出炉${result === 'success' ? '；记得把成品放进行囊。' : '（炸炉）。'}` : `未生效：${outcome.rejected[0]?.reason ?? '编号不存在'}`);
            if (insideModal) closeAgentModal(panel);
            return;
        }
        const selfGoalFinish = event.target.closest?.('[data-self-goal-finish]');
        if (selfGoalFinish) {
            const id = selfGoalFinish.dataset.selfGoalFinish;
            const result = applySelfOps([{ op: 'finishGoal', id }]);
            setSelfStatus(result.applied.length ? `目标 ${id} 达成。` : `未生效：${result.rejected[0]?.reason ?? '编号不存在'}`);
            if (insideModal) closeAgentModal(panel);
            return;
        }
        const selfDecideRun = event.target.closest?.('[data-self-decide-run]');
        if (selfDecideRun) {
            selfDecideRun.disabled = true;
            void runSelfDecision({ source: 'manual' }).finally(() => { selfDecideRun.disabled = false; });
            return;
        }
        const selfDecideDefault = event.target.closest?.('[data-self-decide-default]');
        if (selfDecideDefault) {
            const area = panel.querySelector('[data-setting="self.decidePrompt"]');
            if (area) {
                area.value = SELF_DECIDE_PROMPT;
                area.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return;
        }
        const selfGuideDefault = event.target.closest?.('[data-self-guide-default]');
        if (selfGuideDefault) {
            const area = panel.querySelector('[data-setting="self.guide"]');
            if (area) {
                area.value = SELF_GUIDE;
                area.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return;
        }
        const memoryPage = event.target.closest?.('[data-memory-page]');
        if (memoryPage) {
            const tier = memoryPage.dataset.memoryPage === 'big' ? 'big' : 'small';
            const delta = Number(memoryPage.dataset.memoryPageDelta) || 0;
            memoryPages[tier] = Math.max(0, (memoryPages[tier] ?? 0) + delta);
            refreshMemoryPage(panel);
            return;
        }
        const memoryWeight = event.target.closest?.('[data-memory-weight]');
        if (memoryWeight) {
            return memoryApplyFromPanel(panel, [{ op: 'setWeight', id: memoryWeight.dataset.memoryWeight, weight: memoryWeight.dataset.memoryNextWeight }]);
        }
        const memoryPromote = event.target.closest?.('[data-memory-promote]');
        if (memoryPromote) return memoryApplyFromPanel(panel, [{ op: 'promote', id: memoryPromote.dataset.memoryPromote }]);
        const memoryForget = event.target.closest?.('[data-memory-forget]');
        if (memoryForget) return memoryApplyFromPanel(panel, [{ op: 'forgetMemory', id: memoryForget.dataset.memoryForget }]);
        if (event.target.closest?.('[data-memory-add]')) return memoryAddFromPanel(panel);
        if (event.target.closest?.('[data-memory-decide-run]')) {
            void runMemoryDecision({ source: 'manual' });
            return;
        }
        const memoryDecideDefault = event.target.closest?.('[data-memory-decide-default]');
        if (memoryDecideDefault) {
            const area = panel.querySelector('[data-setting="memory.decidePrompt"]');
            if (area) {
                area.value = MEMORY_DECIDE_PROMPT;
                area.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return;
        }
        const memoryGuideDefault = event.target.closest?.('[data-memory-guide-default]');
        if (memoryGuideDefault) {
            const area = panel.querySelector('[data-setting="memory.guide"]');
            if (area) {
                area.value = MEMORY_GUIDE;
                area.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return;
        }
        const selfDecideFetch = event.target.closest?.('[data-selfdecide-models]');
        if (selfDecideFetch) {
            void fetchSelfDecideModels(panel, selfDecideFetch);
            return;
        }
        const selfReset = event.target.closest?.('[data-self-reset]');
        if (selfReset) {
            const ok = typeof window !== 'undefined' && typeof window.confirm === 'function'
                ? window.confirm('清空本局纳戒？主角身份、功法、斗技、行囊、目标全部回到空戒开局；聊天存档里的这份会被覆盖。')
                : true;
            if (ok) {
                agentSelfRuntime.reset();
                persistSelf();
                refreshSelfPage(panel);
                setSelfStatus('纳戒已清空，按空戒开局。');
            }
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
        if (event.target.closest?.('[data-impact-open-ledger]')) { openImpactLedger(panel); return; }
        if (event.target.closest?.('[data-impact-add]')) {
            impactReturnToLedger = Boolean(event.target.closest?.('[data-modal-dock="impact-ledger"]'));
            openImpactForm(panel);
            return;
        }
        const editButton = event.target.closest?.('[data-impact-edit]');
        if (editButton) {
            const record = agentImpactRuntime.list().find(item => item.id === editButton.dataset.impactEdit);
            if (record) {
                impactReturnToLedger = Boolean(editButton.closest?.('[data-modal-dock="impact-ledger"]'));
                openImpactForm(panel, record);
            }
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
        const coldScan = event.target.closest?.('[data-npc-cold-scan]');
        if (coldScan) {
            coldScan.disabled = true;
            const before = coldScan.textContent;
            coldScan.textContent = '扫描中……';
            void runNpcColdPreview().catch(error => setNpcLedgerStatus(`冷藏扫描失败：${error?.message ?? error}`)).finally(() => {
                coldScan.disabled = false;
                coldScan.textContent = before;
                refreshNpcLedgerPage(panel);
            });
            return;
        }
        const coldClear = event.target.closest?.('[data-npc-cold-clear]');
        if (coldClear) {
            agentNpcColdRuntime.clearSelection();
            persistNpcCold();
            setNpcLedgerStatus('已清空冷藏选择；人物档案没有变化。');
            refreshNpcLedgerPage(panel);
            return;
        }
        const coldConfirm = event.target.closest?.('[data-npc-cold-confirm]');
        if (coldConfirm) { confirmNpcColdPreview(coldConfirm.dataset.npcColdConfirm); return; }
        const coldDiscard = event.target.closest?.('[data-npc-cold-discard]');
        if (coldDiscard) { discardNpcColdPreview(coldDiscard.dataset.npcColdDiscard); return; }
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
        if (event.target.closest?.('[data-npc-cold-default]')) {
            // 同一份提示词在「人物簿」页与「模型与提示词」集中页各有一份：每一份都要刷新，
            // 只改第一份会让眼前这个文本框看起来没反应。
            const areas = [...panel.querySelectorAll('[data-setting="npc.coldPrompt"]')];
            for (const area of areas) area.value = NPC_COLD_PROMPT;
            if (areas[0]) areas[0].dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }
        if (event.target.closest?.('[data-npc-ledger-default]')) {
            const areas = [...panel.querySelectorAll('[data-setting="npc.ledgerPrompt"]')];
            for (const area of areas) area.value = NPC_RECORD_PROMPT;
            if (areas[0]) areas[0].dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }
        if (event.target.closest?.('[data-npc-ledger-more]')) { npcLedgerShown += 80; renderNpcLedgerList(panel); return; }
        const npcOpen = event.target.closest?.('[data-npc-ledger-open]');
        if (npcOpen) { openNpcProfileModal(panel, npcOpen.dataset.npcLedgerOpen); return; }
        const npcColdToggle = event.target.closest?.('[data-npc-cold-toggle]');
        if (npcColdToggle) {
            const name = npcColdToggle.dataset.npcColdToggle;
            const result = agentNpcColdRuntime.status().selected.includes(name)
                ? agentNpcColdRuntime.deselect(name)
                : agentNpcColdRuntime.select(name);
            persistNpcCold();
            setNpcLedgerStatus(result.status === 'selected' ? `${name} 已勾进冷藏推进台。` : `${name} 已移出冷藏推进台。`);
            renderNpcLedgerList(panel);
            return;
        }
        const expCondense = event.target.closest?.('[data-exp-condense]');
        if (expCondense) {
            expCondense.disabled = true;
            void runExpCondense(panel, expCondense.dataset.expCondense)
                .catch(error => setNpcLedgerStatus(`精简失败：${error?.message ?? error}`))
                .finally(() => { expCondense.disabled = false; renderNpcLedgerList(panel); });
            return;
        }
        const expConfirm = event.target.closest?.('[data-exp-condense-confirm]');
        if (expConfirm) { confirmExpCondense(panel, expConfirm.dataset.expCondenseConfirm); return; }
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
        const npcProfileSave = event.target.closest?.('[data-npc-profile-save]');
        if (npcProfileSave) { saveNpcProfileFields(panel, npcProfileSave.dataset.npcProfileSave); return; }
        const npcExpAdd = event.target.closest?.('[data-npc-exp-add]');
        if (npcExpAdd) {
            const name = npcExpAdd.dataset.npcExpAdd;
            const textInput = panel.querySelector('[data-npc-exp-text]');
            const dayInput = panel.querySelector('[data-npc-exp-day]');
            const body = typeof textInput?.value === 'string' ? textInput.value.trim() : '';
            if (!body) { if (textInput) textInput.placeholder = '先写一句“从此哪里不一样了”'; return; }
            const day = Number(dayInput?.value);
            const result = agentNpcLedger.addExp(name, body, { day: Number.isInteger(day) && day > 0 ? day : worldDay() });
            if (result.status === 'added') {
                persistNpcLedger();
                refreshNpcLedgerPage(panel);
                openNpcProfileModal(panel, name, { tab: 'exp' });
            }
            return;
        }
        const npcExpRemove = event.target.closest?.('[data-npc-exp-remove]');
        if (npcExpRemove) {
            const name = npcExpRemove.dataset.npcExpFor;
            const result = agentNpcLedger.removeExp(name, Number(npcExpRemove.dataset.npcExpRemove));
            if (result.status === 'removed') {
                persistNpcLedger();
                refreshNpcLedgerPage(panel);
                openNpcProfileModal(panel, name, { tab: 'exp' });
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
                // 档案弹窗里点的：刷新后重开弹窗，看到的就是新档案。
                if (ledgerPresence.closest?.('.dai-agent-modal')) openNpcProfileModal(panel, record.name);
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
                if (ledgerImportance.closest?.('.dai-agent-modal')) openNpcProfileModal(panel, record.name);
            }
            return;
        }
        const ledgerEdit = event.target.closest?.('[data-npc-ledger-edit]');
        if (ledgerEdit) {
            const area = panel.querySelector('[data-npc-ledger-patch]');
            if (area) {
                area.value = JSON.stringify({ 人物: [{ 姓名: ledgerEdit.dataset.npcLedgerEdit }] }, null, 2);
                const dock = panel.querySelector('[data-modal-dock="npc-patch"]');
                if (dock) openAgentModal(panel, `记进人物簿 · ${ledgerEdit.dataset.npcLedgerEdit}`, dock);
                else area.focus();
            }
            return;
        }
        const ledgerForget = event.target.closest?.('[data-npc-ledger-forget]');
        if (ledgerForget) {
            const result = agentNpcLedger.remove(ledgerForget.dataset.npcLedgerForget);
            if (result.status === 'removed') {
                persistNpcLedger();
                setNpcLedgerStatus(`已把 ${result.record.name} 的档案删掉。`);
                closeAgentModal(panel);
                refreshNpcLedgerPage(panel);
            }
            return;
        }
        const page = event.target.closest?.('[data-settings-page]');
        if (page) selectPage(page.dataset.settingsPage);
    });    panel.addEventListener('change', event => {
        const worldbookPick = event.target.closest?.('[data-worldbook-pick]');
        if (worldbookPick) {
            const value = worldbookPick.value;
            const input = panel.querySelector('[data-setting="setting.worldbook"]');
            if (input) input.value = value;
            const result = updateSetting('setting.worldbook', value);
            scheduleWorldbookSync(panel);
            refreshWorldbookStats(panel);
            renderFactsStatus(panel);
            const status = panel.querySelector(`#${SETTINGS_STATUS_ID}`);
            if (status) {
                if (result.status !== 'ready') status.textContent = '酒馆设置不可用，这次选择没有保存。';
                else {
                    status.textContent = '正在保存世界书选择…';
                    void hostStorage.saveSettings().then(saved => {
                        status.textContent = saved.status === 'saved' ? '世界书选择已保存。' : '已修改，但酒馆保存接口不可用。';
                    }).catch(() => { status.textContent = '世界书选择保存失败，请重新选一次。'; });
                }
            }
            return;
        }
        const coldSelect = event.target.closest?.('[data-npc-cold-select]');
        if (!coldSelect) return;
        const name = coldSelect.dataset.npcColdSelect;
        if (coldSelect.checked) agentNpcColdRuntime.select(name);
        else agentNpcColdRuntime.deselect(name);
        persistNpcCold();
        refreshNpcLedgerPage(panel);
    });
    panel.addEventListener('input', async event => {
        if (event.target.closest?.('[data-npc-ledger-filter]') || event.target.closest?.('[data-npc-ledger-search]')) { npcLedgerShown = 60; renderNpcLedgerList(panel); return; }
        if (event.target.closest?.('[data-impact-filter]') || event.target.closest?.('[data-impact-weight]') || event.target.closest?.('[data-impact-kind]') || event.target.closest?.('[data-impact-search]')) { impactShown = 100; renderImpactLibrary(panel); return; }
        // 自定义判定的名称/提示词：不走 data-setting 通道，直接按 id 改数组条目。
        const customField = event.target.closest?.('[data-settle-custom-field]');
        if (customField) {
            const holder = customField.closest('[data-settle-custom-id]');
            if (holder) {
                const field = customField.dataset.settleCustomField;
                const result = updateSettleCustomCategory(holder.dataset.settleCustomId, { [field]: customField.value });
                if (field === 'name') {
                    const title = holder.querySelector('summary b');
                    if (title) title.textContent = customField.value.trim() || '未命名判定';
                }
                const status = panel.querySelector('[data-settle-custom-status]');
                if (status) status.textContent = result.status === 'ready' ? '已保存。' : '设置不可用，本次修改未保存。';
            }
            return;
        }
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
        // 连接模式下拉一换，这张卡的地址/密钥/协议/模型名跟着灰显或解禁：统一查登记表。
        CONNECTION_MODE_TOGGLERS.get(input.dataset.setting)?.(panel);
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
    panel.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        // 先关弹层再关面板：弹窗开着时 ESC 只关弹窗。
        if (closeAgentModal(panel)) { event.stopPropagation(); return; }
        closeSettingsPanel();
    });
    bindModalActions(panel);
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
    mountOrbHud();
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
        document.getElementById(ORB_ID)?.remove();
        document.getElementById(STYLE_ID)?.remove();
    }
    disposeOrbHud();
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

// 卡面脚本跑在酒馆助手的 iframe 里，够不到这个模块的 export：
// 把一个挂载点放到宿主 window 上，卡里才调得到纳戒与人物簿。
function exposeHostBridge() {
    if (typeof window === 'undefined') return;
    try {
        window.doupoAgent = doupoAgent;
        window.dispatchEvent(new CustomEvent('doupo-agent-bridge-ready'));
    } catch (error) {
        console.warn('[斗破] 暴露 doupoAgent 全局失败，卡面脚本将拿不到纳戒接口', error);
    }
}

exposeHostBridge();

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
    const locationInput = panel.querySelector('[data-world-add-location]');
    const body = typeof textInput?.value === 'string' ? textInput.value.trim() : '';
    if (!body) {
        if (textInput) textInput.placeholder = '先写一句事件内容再登记';
        return { status: 'noop' };
    }
    const basis = typeof basisInput?.value === 'string' ? basisInput.value.trim() : '';
    const rawDays = Number(daysInput?.value);
    const days = Number.isInteger(rawDays) && rawDays >= 1 && rawDays <= 90 ? rawDays : undefined;
    const location = typeof locationInput?.value === 'string' ? locationInput.value.trim() : '';
    const result = worldApplyFromPanel(panel, [{ op: 'addEvent', scope: scopeInput?.value ?? 'near', text: body, basis, location, days, weight: weightInput?.value === 'major' ? 'major' : 'minor' }]);
    if (textInput) textInput.value = '';
    if (basisInput) basisInput.value = '';
    if (locationInput) locationInput.value = '';
    if (daysInput) daysInput.value = '';
    if (result?.status !== 'rejected') closeAgentModal(panel);
    return result;
}

/** 手动接任务：标题必填，详情/来源/时限可选；与模型指令同一套校验。 */
function worldAddTaskFromPanel(panel) {
    const titleInput = panel.querySelector('[data-world-task-title]');
    const detailInput = panel.querySelector('[data-world-task-detail]');
    const basisInput = panel.querySelector('[data-world-task-basis]');
    const daysInput = panel.querySelector('[data-world-task-days]');
    const title = typeof titleInput?.value === 'string' ? titleInput.value.trim() : '';
    if (!title) {
        if (titleInput) titleInput.placeholder = '先写一句任务名再接下';
        return { status: 'noop' };
    }
    const rawDays = Number(daysInput?.value);
    const days = Number.isInteger(rawDays) && rawDays >= 1 && rawDays <= 90 ? rawDays : undefined;
    const result = worldApplyFromPanel(panel, [{ op: 'addTask', title, detail: typeof detailInput?.value === 'string' ? detailInput.value.trim() : '', basis: typeof basisInput?.value === 'string' ? basisInput.value.trim() : '', days }]);
    for (const input of [titleInput, detailInput, basisInput, daysInput]) if (input) input.value = '';
    if (result?.status !== 'rejected') closeAgentModal(panel);
    return result;
}
// ── 主角记忆（memory/）：总览、两层清单、手动登记、决定卡；与纳戒页同一套交互惯例 ──

function memoryApplyFromPanel(panel, operations) {
    const result = applyMemoryOps(operations);
    const note = panel?.querySelector('[data-memory-journal]');
    if (note && result.rejected.length) {
        const warn = makeElement('p', 'dai-turn-result');
        warn.textContent = `有 ${result.rejected.length} 条操作被拒绝：${result.rejected.map(item => `${item.op}(${item.reason})`).join('、')}`;
        note.prepend(warn);
    }
    return result;
}

function memoryAddFromPanel(panel) {
    const textInput = panel.querySelector('[data-memory-new-text]');
    const body = typeof textInput?.value === 'string' ? textInput.value.trim() : '';
    if (!body) {
        if (textInput) textInput.placeholder = '先写一句记忆内容再登记';
        return { status: 'noop' };
    }
    const splitNames = value => (value ?? '')
        .split(/[、,，;；\s]+/).map(item => item.trim()).filter(Boolean).slice(0, 4);
    const tier = panel.querySelector('[data-memory-new-tier]')?.value === 'big' ? 'big' : 'small';
    const tag = panel.querySelector('[data-memory-new-tag]')?.value ?? '';
    const result = memoryApplyFromPanel(panel, [{
        op: tier === 'big' ? 'memorize' : 'remember',
        text: body,
        quote: typeof panel.querySelector('[data-memory-new-quote]')?.value === 'string' ? panel.querySelector('[data-memory-new-quote]').value.trim() : '',
        basis: typeof panel.querySelector('[data-memory-new-basis]')?.value === 'string' ? panel.querySelector('[data-memory-new-basis]').value.trim() : '',
        related: splitNames(panel.querySelector('[data-memory-new-related]')?.value),
        aliases: splitNames(panel.querySelector('[data-memory-new-aliases]')?.value),
        weight: panel.querySelector('[data-memory-new-weight]')?.value === 'major' ? 'major' : 'minor',
        tag: tier === 'big' ? tag : undefined,
    }]);
    if (result.rejected.some(item => item.reason === 'related_missing')) {
        const relatedInput = panel.querySelector('[data-memory-new-related]');
        if (relatedInput) relatedInput.placeholder = '关联不能空：它是日后按需召回的钥匙';
    }
    for (const selector of ['[data-memory-new-text]', '[data-memory-new-basis]', '[data-memory-new-related]', '[data-memory-new-aliases]', '[data-memory-new-quote]']) {
        const input = panel.querySelector(selector);
        if (input) input.value = '';
    }
    if (!result.rejected.length) closeAgentModal(panel);
    return result;
}

const MEMORY_PAGE_SIZE = Object.freeze({ big: 6, small: 8 });
const memoryPages = { big: 0, small: 0 };

function renderMemoryEntryList(container, entries, { conflicts = null, tier = 'small', pager = null } = {}) {
    if (!container) return;
    const list = Array.isArray(entries) ? entries : [];
    if (pager) pager.replaceChildren();
    if (!list.length) {
        container.replaceChildren(makeElement('p', 'dai-turn-result', '这一层还没有记忆。'));
        return;
    }
    const pageSize = MEMORY_PAGE_SIZE[tier] ?? 8;
    const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
    const page = Math.min(Math.max(0, memoryPages[tier] ?? 0), pageCount - 1);
    memoryPages[tier] = page;
    const rows = list.slice(page * pageSize, page * pageSize + pageSize).map(entry => {
        const row = makeElement('div', 'dai-world-event dai-memory-card');
        row.dataset.weight = entry.weight === 'major' ? 'major' : 'minor';
        if (entry.done === true) row.dataset.stale = 'true';
        const tierLabel = agentMemoryRuntime.tierLabels[entry.tier] ?? entry.tier;
        const tagLabel = entry.tag ? ` [${agentMemoryRuntime.tagLabels[entry.tag] ?? entry.tag}]` : '';
        const clash = conflicts?.get(entry.id);
        const head = makeElement('div', 'dai-world-event-head');
        const title = makeElement('b', '', `${clash ? '⚠ ' : ''}${entry.weight === 'major' ? '★' : '·'} ${entry.text}`);
        const strength = makeElement('span', 'dai-memory-strength', `强度 ${memoryStrength(entry)}`);
        head.append(title, strength);
        row.append(head);
        const meta = [tierLabel + tagLabel, `第 ${entry.day} 天`, `#${entry.id}`];
        if (entry.done === true) meta.push('旧事');
        if (entry.recallCount) meta.push(`想起过 ${entry.recallCount} 次`);
        row.append(makeElement('small', 'dai-world-event-basis', meta.join(' · ')));
        if (typeof entry.quote === 'string' && entry.quote.trim()) {
            row.append(makeElement('small', 'dai-world-event-basis', `「${entry.quote.trim()}」`));
        }
        if (Array.isArray(entry.aliases) && entry.aliases.length) {
            row.append(makeElement('small', 'dai-world-event-basis', `别名：${entry.aliases.join('、')}`));
        }
        if (Array.isArray(entry.related) && entry.related.length) {
            row.append(makeElement('small', 'dai-world-event-basis', `关联：${entry.related.join('、')}`));
        }
        if (typeof entry.basis === 'string' && entry.basis.trim()) {
            row.append(makeElement('small', 'dai-world-event-basis', `依据：${entry.basis.trim()}`));
        }
        if (typeof entry.note === 'string' && entry.note.trim()) {
            row.append(makeElement('small', 'dai-world-event-basis', `备注：${entry.note.trim()}`));
        }
        if (clash) {
            row.append(makeElement('small', 'dai-world-event-basis', `⚠ 与 ${clash.join('、')} 疑似重复/矛盾，请核对后删除或合并`));
        }
        const actions = makeElement('div', 'dai-world-event-actions');
        if (entry.tier === 'small') {
            const promote = makeElement('button', 'dai-secondary-button', '转大');
            promote.type = 'button';
            promote.dataset.memoryPromote = entry.id;
            actions.append(promote);
        }
        const weight = makeElement('button', 'dai-secondary-button', entry.weight === 'major' ? '降一般' : '提关键');
        weight.type = 'button';
        weight.dataset.memoryWeight = entry.id;
        weight.dataset.memoryNextWeight = entry.weight === 'major' ? 'minor' : 'major';
        actions.append(weight);
        const forget = makeElement('button', 'dai-secondary-button', '删除');
        forget.type = 'button';
        forget.dataset.memoryForget = entry.id;
        actions.append(forget);
        row.append(actions);
        return row;
    });
    container.replaceChildren(...rows);
    if (pager) {
        if (pageCount > 1) {
            const prev = makeElement('button', 'dai-secondary-button', '上一页');
            prev.type = 'button';
            prev.disabled = page <= 0;
            prev.dataset.memoryPage = tier;
            prev.dataset.memoryPageDelta = '-1';
            const label = makeElement('span', 'dai-pager-label', `第 ${page + 1} / ${pageCount} 页 · 共 ${list.length} 条`);
            const next = makeElement('button', 'dai-secondary-button', '下一页');
            next.type = 'button';
            next.disabled = page >= pageCount - 1;
            next.dataset.memoryPage = tier;
            next.dataset.memoryPageDelta = '1';
            pager.replaceChildren(prev, label, next);
        } else {
            pager.replaceChildren(makeElement('span', 'dai-pager-label', `共 ${list.length} 条`));
        }
    }
}

/** 记忆页整页刷新：总览、排序/按人过滤、大/小两层分页清单、矛盾提醒、指令流水。 */
function refreshMemoryPage(panel) {
    const target = panel ?? (typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null);
    if (!target || target.hidden) return;
    const section = target.querySelector('[data-settings-section="memory"]');
    if (!section || section.hidden) return;
    const status = agentMemoryRuntime.status();
    const snapshot = agentMemoryRuntime.snapshot();
    const overview = section.querySelector('[data-memory-overview]');
    if (overview) {
        const labels = agentMemoryRuntime.tierLabels;
        overview.textContent = [
            `共 ${status.total} 条`,
            ...Object.entries(labels).map(([key, label]) => `${label} ${status.byTier[key]?.total ?? 0}`),
        ].join(' · ');
    }
    // 排序与按人过滤都是页面本地状态（不进设置）：时间 = 新的在前；重要性 = 强度高的在前。
    const sortSelect = section.querySelector('[data-memory-sort]');
    if (sortSelect && !sortSelect.onchange) {
        sortSelect.onchange = () => { memoryPages.big = 0; memoryPages.small = 0; refreshMemoryPage(); };
    }
    const sortMode = sortSelect?.value === 'weight' ? 'weight' : 'time';
    const personSelect = section.querySelector('[data-memory-person]');
    if (personSelect) {
        if (!personSelect.onchange) {
            personSelect.onchange = () => { memoryPages.big = 0; memoryPages.small = 0; refreshMemoryPage(); };
        }
        const wanted = new Map();
        for (const entry of snapshot.entries) {
            for (const key of recallKeys(entry)) wanted.set(key, (wanted.get(key) ?? 0) + 1);
        }
        const current = personSelect.value;
        const options = ['<option value="">全部</option>'];
        for (const [key, count] of [...wanted.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'))) {
            options.push(`<option value="${key.replace(/"/g, '&quot;')}">${key}（${count}）</option>`);
        }
        personSelect.replaceChildren();
        personSelect.innerHTML = options.join('');
        if (current && wanted.has(current)) personSelect.value = current;
    }
    const person = typeof personSelect?.value === 'string' ? personSelect.value : '';
    const matchPerson = entry => !person || recallKeys(entry).includes(person);
    const sortEntries = list => {
        const copy = [...list];
        if (sortMode === 'weight') {
            copy.sort((a, b) => (a.done === true) - (b.done === true)
                || memoryStrength(b) - memoryStrength(a)
                || b.day - a.day);
        } else {
            copy.sort((a, b) => b.day - a.day || a.id.localeCompare(b.id, 'zh', { numeric: true }));
        }
        return copy;
    };
    // 旧事（done）不再是“另册”：仍留在大小记忆里、仍可被召回，只标一个“旧事”。
    const all = snapshot.entries.filter(matchPerson);
    const conflicts = new Map();
    const pairs = findMemoryConflicts(snapshot.entries.filter(entry => entry.done !== true));
    for (const pair of pairs) {
        if (!conflicts.has(pair.a)) conflicts.set(pair.a, []);
        if (!conflicts.has(pair.b)) conflicts.set(pair.b, []);
        conflicts.get(pair.a).push(`${pair.b}（${Math.round(pair.similarity * 100)}%）`);
        conflicts.get(pair.b).push(pair.a);
    }
    const conflictStrip = section.querySelector('[data-memory-conflicts]');
    if (conflictStrip) {
        conflictStrip.hidden = pairs.length === 0;
        if (pairs.length) conflictStrip.textContent = `⚠ 疑似重复/矛盾 ${pairs.length} 对：${pairs.map(pair => `${pair.a}↔${pair.b}（${Math.round(pair.similarity * 100)}%）`).join('、')}——核对后删除或合并旧的`;
    }
    renderMemoryEntryList(
        section.querySelector('[data-memory-list-big]'),
        sortEntries(all.filter(entry => entry.tier === 'big')),
        { conflicts, tier: 'big', pager: section.querySelector('[data-memory-pager-big]') },
    );
    renderMemoryEntryList(
        section.querySelector('[data-memory-list-small]'),
        sortEntries(all.filter(entry => entry.tier === 'small')),
        { conflicts, tier: 'small', pager: section.querySelector('[data-memory-pager-small]') },
    );
    const journal = section.querySelector('[data-memory-journal]');
    if (journal) {
        const entries = [...snapshot.log].reverse().slice(0, 8);
        journal.replaceChildren(...(entries.length ? entries.map(entry => {
            const item = makeElement('p', 'dai-turn-result');
            item.append(makeElement('b', '', `${journalSourceLabel(entry.source)}：`), document.createTextNode(entry.summaries.join('；') || '（无变化）'));
            return item;
        }) : [makeElement('p', 'dai-turn-result', '还没有记忆指令。')]));
    }
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
        const where = typeof event.location === 'string' && event.location.trim() ? ` · ${event.location.trim()}` : '';
        head.append(makeElement('small', '', `第 ${event.day} 天 · ${event.id}${where}${due}`));
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

/** 势力登记：同名更新态度/动向，否则新建。 */
function worldSetFactionFromPanel(panel) {
    const nameInput = panel.querySelector('[data-world-faction-name]');
    const stanceInput = panel.querySelector('[data-world-faction-stance]');
    const dynamicsInput = panel.querySelector('[data-world-faction-dynamics]');
    const basisInput = panel.querySelector('[data-world-faction-basis]');
    const name = typeof nameInput?.value === 'string' ? nameInput.value.trim() : '';
    if (!name) {
        if (nameInput) nameInput.placeholder = '先写势力名再登记';
        return { status: 'noop' };
    }
    const result = worldApplyFromPanel(panel, [{ op: 'setFaction', name, stance: stanceInput?.value ?? 'neutral', dynamics: typeof dynamicsInput?.value === 'string' ? dynamicsInput.value.trim() : '', basis: typeof basisInput?.value === 'string' ? basisInput.value.trim() : '' }]);
    for (const input of [nameInput, dynamicsInput, basisInput]) if (input) input.value = '';
    if (result?.status !== 'rejected') closeAgentModal(panel);
    return result;
}

/** 人物态度登记：同名更新态度，否则新建。 */
function worldSetPersonFromPanel(panel) {
    const nameInput = panel.querySelector('[data-world-person-name]');
    const attitudeInput = panel.querySelector('[data-world-person-attitude]');
    const basisInput = panel.querySelector('[data-world-person-basis]');
    const name = typeof nameInput?.value === 'string' ? nameInput.value.trim() : '';
    const attitude = typeof attitudeInput?.value === 'string' ? attitudeInput.value.trim() : '';
    if (!name || !attitude) {
        if (nameInput && !name) nameInput.placeholder = '先写人物名再登记';
        if (attitudeInput && !attitude) attitudeInput.placeholder = '先写态度再登记';
        return { status: 'noop' };
    }
    const result = worldApplyFromPanel(panel, [{ op: 'setPerson', name, attitude, basis: typeof basisInput?.value === 'string' ? basisInput.value.trim() : '' }]);
    for (const input of [nameInput, attitudeInput, basisInput]) if (input) input.value = '';
    if (result?.status !== 'rejected') closeAgentModal(panel);
    return result;
}

/** 势力列表：敌对在前、同盟次之、其余按更新时间。 */
function renderWorldFactionList(container, factions) {
    if (!container) return;
    const list = Array.isArray(factions) ? factions : [];
    if (!list.length) {
        container.replaceChildren(makeElement('p', 'dai-turn-result', '还没有登记势力。剧情里与谁结怨、谁示好，模型会在这里记一笔，也可以自己登记。'));
        return;
    }
    const stanceRank = { hostile: 0, wary: 1, allied: 2, friendly: 3, neutral: 4 };
    const labels = { hostile: '敌对', wary: '警惕', neutral: '中立', friendly: '友好', allied: '同盟' };
    const rows = [...list].sort((a, b) => (stanceRank[a.stance] ?? 2) - (stanceRank[b.stance] ?? 2) || (b.updatedDay ?? 0) - (a.updatedDay ?? 0)).map(faction => {
        const row = makeElement('div', 'dai-world-faction');
        row.dataset.stance = faction.stance ?? 'neutral';
        const head = makeElement('div', 'dai-world-event-head');
        head.append(makeElement('b', '', faction.name));
        head.append(makeElement('span', 'dai-world-stance', labels[faction.stance] ?? '中立'));
        row.append(head);
        if (typeof faction.dynamics === 'string' && faction.dynamics.trim()) row.append(makeElement('p', 'dai-world-task-detail', faction.dynamics.trim()));
        const notes = [];
        if (typeof faction.basis === 'string' && faction.basis.trim()) notes.push(`依据：${faction.basis.trim()}`);
        if (faction.updatedDay) notes.push(`更新于第 ${faction.updatedDay} 天`);
        if (notes.length) row.append(makeElement('small', 'dai-world-event-basis', notes.join(' · ')));
        const actions = makeElement('div', 'dai-world-event-actions');
        const del = makeElement('button', 'dai-secondary-button', '删除');
        del.type = 'button';
        del.dataset.worldFactionDelete = faction.name;
        actions.append(del);
        row.append(actions);
        return row;
    });
    container.replaceChildren(...rows);
}

/** 人物列表：最近更新的在前。 */
function renderWorldPeopleList(container, people) {
    if (!container) return;
    const list = Array.isArray(people) ? people : [];
    if (!list.length) {
        container.replaceChildren(makeElement('p', 'dai-turn-result', '还没有登记人物。剧情里谁对你掏心掏肺、谁恨你入骨，都会记在这里。'));
        return;
    }
    const rows = [...list].sort((a, b) => (b.updatedDay ?? 0) - (a.updatedDay ?? 0)).map(person => {
        const row = makeElement('div', 'dai-world-person');
        const head = makeElement('div', 'dai-world-event-head');
        head.append(makeElement('b', '', person.name));
        head.append(makeElement('small', '', person.updatedDay ? `更新于第 ${person.updatedDay} 天` : ''));
        row.append(head);
        row.append(makeElement('p', 'dai-world-task-detail', person.attitude || '态度未明'));
        if (typeof person.basis === 'string' && person.basis.trim()) row.append(makeElement('small', 'dai-world-event-basis', `依据：${person.basis.trim()}`));
        const actions = makeElement('div', 'dai-world-event-actions');
        const del = makeElement('button', 'dai-secondary-button', '删除');
        del.type = 'button';
        del.dataset.worldPersonDelete = person.name;
        actions.append(del);
        row.append(actions);
        return row;
    });
    container.replaceChildren(...rows);
}

/** 任务列表：进行中在前、已完成在后，全部列出；详情完整展示。 */
function renderWorldTaskList(container, tasks) {
    if (!container) return;
    const list = Array.isArray(tasks) ? tasks : [];
    if (!list.length) {
        container.replaceChildren(makeElement('p', 'dai-turn-result', '还没有任务。剧情里接下目标时，模型会在这里立任务，也可以自己接。'));
        return;
    }
    const today = agentWorldRuntime.status().clock.day;
    const ordered = [...list.filter(task => task.status === 'active'), ...list.filter(task => task.status !== 'active')];
    const rows = ordered.map(task => {
        const row = makeElement('div', 'dai-world-task');
        row.dataset.status = task.status === 'done' ? 'done' : (task.endDay !== null && task.endDay !== undefined && task.endDay < today ? 'overdue' : 'active');
        const head = makeElement('div', 'dai-world-event-head');
        head.append(makeElement('b', '', `${task.status === 'done' ? '✔' : '◆'} ${task.title}`));
        head.append(makeElement('small', '', `第 ${task.day} 天接 · ${task.id}`));
        row.append(head);
        if (typeof task.detail === 'string' && task.detail.trim()) row.append(makeElement('p', 'dai-world-task-detail', task.detail.trim()));
        const notes = [];
        if (task.status === 'done') notes.push(`已完成${task.doneDay ? `于第 ${task.doneDay} 天` : ''}`);
        else if (task.endDay !== null && task.endDay !== undefined) notes.push(task.endDay < today ? '已逾期' : `剩 ${task.endDay - today + 1} 天`);
        if (typeof task.basis === 'string' && task.basis.trim()) notes.push(`来源：${task.basis.trim()}`);
        if (notes.length) row.append(makeElement('small', 'dai-world-event-basis', notes.join(' · ')));
        const actions = makeElement('div', 'dai-world-event-actions');
        if (task.status !== 'done') {
            const done = makeElement('button', 'dai-secondary-button', '完成');
            done.type = 'button';
            done.dataset.worldTaskComplete = task.id;
            actions.append(done);
        }
        const del = makeElement('button', 'dai-secondary-button', '删除');
        del.type = 'button';
        del.dataset.worldTaskDelete = task.id;
        actions.append(del);
        row.append(actions);
        return row;
    });
    container.replaceChildren(...rows);
}

/** 世界页只在可见时重绘：时钟、双栏事件、任务、指令流水。 */
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
    const tensionDisplay = section.querySelector('[data-world-tension-display]');
    if (tensionDisplay) tensionDisplay.textContent = { calm: '平静', rising: '升温（大事酝酿）', storm: '风波（危机频发）' }[snapshot.tension ?? 'calm'] ?? '平静';
    // —— 磁贴：天数/时期/所在地/天气/名声/通缉度各占一块，互不挤在一起 ——
    // data-world-tile 挂在数值节点上，只改它自己的文本，别碰磁贴里的铅笔和编辑框。
    for (const value of section.querySelectorAll('[data-world-tile]')) {
        const field = value.dataset.worldTile;
        if (field === 'day') {
            value.textContent = `第 ${status.clock.day ?? '?'} 天`;
            continue;
        }
        const text = typeof status.info[field] === 'string' ? status.info[field] : '';
        value.textContent = text || '—';
        value.classList.toggle('is-empty', !text);
    }
    const tensionLevel = snapshot.tension ?? 'calm';
    for (const button of section.querySelectorAll('[data-world-tension]')) {
        button.classList.toggle('is-active', button.dataset.worldTension === tensionLevel);
    }
    const clockSub = section.querySelector('[data-world-tile-sub="clock"]');
    if (clockSub) clockSub.textContent = `${agentWorldRuntime.formatClock()}（${seasonOf(agentWorldRuntime.status().clock.day)}季）`;
    // 刷新后编辑框收起，避免旧输入留在磁贴里；编辑按钮再点开即可。
    closeWorldTileEditors(section);
    for (const input of section.querySelectorAll('[data-world-info]')) {
        const field = input.dataset.worldInfo;
        input.value = typeof status.info[field] === 'string' ? status.info[field] : '';
    }
    renderWorldEventList(section.querySelector('[data-world-events-near]'), snapshot.nearEvents);
    renderWorldEventList(section.querySelector('[data-world-events-world]'), snapshot.worldEvents, { emptyNote: '暂无进行中的世界大事。' });
    renderWorldTaskList(section.querySelector('[data-world-tasks]'), snapshot.tasks);
    renderWorldFactionList(section.querySelector('[data-world-factions]'), snapshot.factions);
    renderWorldPeopleList(section.querySelector('[data-world-people]'), snapshot.people);
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

const IMPACT_FORM_FIELDS = ['title', 'detail', 'target', 'kind', 'weight', 'certainty', 'evidence', 'eventId', 'canon', 'shift'];
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

/** 打开手动记账表单（弹窗）：不传 record 就是新增，传了就是编辑这一条。 */
function openImpactForm(panel, record = null) {
    const form = panel?.querySelector?.('[data-impact-form]');
    if (!form) return { status: 'missing' };
    const dock = form.closest('[data-modal-dock]');
    form.hidden = false;
    form.dataset.ref = record?.id ?? '';
    // 只记“世界被改成了什么样”，不排发酵日：新旧影响一律立即生效，能用到时就注入。
    for (const name of IMPACT_FORM_FIELDS) {
        const field = impactFormField(form, name);
        if (!field) continue;
        if (!record) {
            field.value = name === 'kind' ? 'direct' : name === 'weight' ? 'minor' : name === 'certainty' ? 'certain' : name === 'shift' ? 'none' : '';
            continue;
        }
        field.value = record[name] ?? '';
    }
    const title = form.querySelector('[data-impact-form-title]');
    if (title) title.textContent = record ? `编辑 #${record.id}` : '记一条世界影响';
    const status = form.querySelector('[data-impact-form-status]');
    if (status) status.textContent = record
        ? '改完点保存；这条会按新内容进下一轮正文。'
        : '手动记的条目会立刻进账本，也会进下一轮正文。';
    openAgentModal(panel, record ? `编辑世界影响 #${record.id}` : '记一条世界影响', dock ?? form, { wide: true });
    impactFormField(form, 'title')?.focus?.();
    return { status: 'open' };
}

function closeImpactForm(panel) {
    const form = panel?.querySelector?.('[data-impact-form]');
    if (!form) return { status: 'missing' };
    form.hidden = true;
    form.dataset.ref = '';
    impactReturnToLedger = false;
    closeAgentModal(panel);
    return { status: 'closed' };
}

/** 读表单并落账：新增走 record，编辑走 edit；校验交给 impact-runtime，页面只翻译拒绝原因。 */
function saveImpactForm(panel) {
    const form = panel?.querySelector?.('[data-impact-form]');
    if (!form) return { status: 'missing' };
    const read = name => (impactFormField(form, name)?.value ?? '').trim();
    const ref = form.dataset.ref || '';
    const status = form.querySelector('[data-impact-form-status]');
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
    const ops = [op];
    const result = agentImpactRuntime.apply(ops, { source: 'manual', day: worldDay() });
    if (result.status !== 'applied') {
        const reason = result.rejected?.[0]?.reason ?? 'unknown_op';
        if (status) status.textContent = IMPACT_REASON_TEXT[reason] ?? `保存被拒绝（${reason}）。`;
        return { status: 'rejected', reason };
    }
    persistImpact();
    const id = result.applied[result.applied.length - 1]?.id ?? ref;
    const saved = agentImpactRuntime.list().find(item => item.id === id);
    const returnToLedger = impactReturnToLedger;
    impactReturnToLedger = false;
    closeImpactForm(panel);
    // 新条目可能排在页数之外：先把账本整个铺开，滚到它跟前再闪一下，避免“点了保存却像没反应”。
    impactShown = Number.MAX_SAFE_INTEGER;
    // 若当前筛选恰好会把刚存下的这条藏起来，先切回“全部”，否则用户会以为没保存成功。
    const filter = panel?.querySelector?.('[data-impact-filter]');
    if (filter && saved && filter.value !== 'all' && filter.value !== saved.state) filter.value = 'all';
    renderImpactLibrary(panel);
    if (returnToLedger) openImpactLedger(panel);
    // 新条目可能排在中段：滚到它跟前、闪一下，避免“点了保存却像没反应”。
    const highlight = () => {
        const added = panel?.querySelector?.(`[data-impact-edit="${id}"]`)?.closest?.('.dai-impact-item');
        if (!added) return;
        added.classList.add('is-fresh');
        added.scrollIntoView?.({ block: 'nearest' });
        setTimeout(() => added.classList.remove('is-fresh'), 1600);
    };
    highlight();
    if (returnToLedger) setTimeout(highlight, 0);
    setImpactStatus(ref ? `已改写 #${id}，下一轮正文按新内容注入。` : `已记下 #${id}：${saved?.title ?? read('title')}`);
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
        const meta = [WEIGHT_LABEL[record.weight] ?? '小事', reason];
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

/** 一条影响的卡片：标题/状态徽标/详情/对象与出处分三层，不再把所有信息挤在首行。 */
function buildImpactItem(record, { injected = false, children = null, chatLength = null, compact = false } = {}) {
    const item = makeElement('li', `dai-impact-item${compact ? ' is-compact' : ''}`);
    if (record.edited) item.classList.add('is-edited');
    const top = makeElement('div', 'dai-impact-top');
    top.append(makeElement('span', 'dai-impact-mark', impactMark(record) || '·'));
    top.append(makeElement('b', 'dai-impact-title', record.title));
    if (!compact) {
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
        top.append(actions);
    }
    item.append(top);

    const chips = makeElement('div', 'dai-impact-chips');
    chips.append(makeElement('span', `dai-impact-chip is-${record.weight ?? 'minor'}`, WEIGHT_LABEL[record.weight] ?? '小事'));
    chips.append(makeElement('span', 'dai-impact-chip', STATE_LABEL[record.state] ?? '未了结'));
    if (record.certainty === 'rumor') chips.append(makeElement('span', 'dai-impact-chip is-warn', '传闻'));
    if (record.target) chips.append(makeElement('span', 'dai-impact-chip', record.target));
    if (record.canon) chips.append(makeElement('span', 'dai-impact-chip', `原著·${SHIFT_LABEL[record.shift] ?? '改写'}`));
    if (record.eventId) chips.append(makeElement('span', 'dai-impact-chip', `台账 ${record.eventId}`));
    if (record.parent) chips.append(makeElement('span', 'dai-impact-chip', `接自 #${record.parent}`));
    if (children?.length) chips.append(makeElement('span', 'dai-impact-chip', `引出 ${children.map(id => `#${id}`).join('、')}`));
    if (injected) chips.append(makeElement('span', 'dai-impact-chip is-accent', '本轮已注入'));
    if (record.edited) chips.append(makeElement('span', 'dai-impact-chip is-warn', '改过'));
    if (Number.isInteger(record.floor) && chatLength !== null && record.floor >= chatLength) {
        chips.append(makeElement('span', 'dai-impact-chip is-warn', '依据楼层已删，建议删掉或改写'));
    }
    if (chips.childNodes.length) item.append(chips);

    if (record.detail) item.append(makeElement('p', 'dai-impact-detail', record.detail));
    if (record.state === 'ripened') item.append(makeElement('small', 'dai-impact-fate', `已发酵${record.resolution ? ` · ${record.resolution}` : ''}`));
    else if (record.state === 'closed') item.append(makeElement('small', 'dai-impact-fate', `已了结${record.resolution ? ` · ${record.resolution}` : ''}`));
    else if (record.state === 'reverted') item.append(makeElement('small', 'dai-impact-fate', '已被修复/撤销'));
    return item;
}

/** 总览页：只铺最近生成的 N 条（N 可在设置里改），完整账本进弹窗。 */
function renderImpactRecent(panel) {
    const list = panel?.querySelector?.('[data-impact-recent]');
    if (!list) return;
    const configured = Number(currentSettings().impact?.recentCount);
    const limit = Number.isInteger(configured) && configured > 0 ? Math.min(20, configured) : 5;
    const all = agentImpactRuntime.list();
    const recent = [...all]
        .sort((a, b) => (b.day - a.day) || String(b.id).localeCompare(String(a.id), 'zh', { numeric: true }))
        .slice(0, limit);
    if (!recent.length) {
        list.replaceChildren(makeElement('li', 'dai-impact-empty', '还没有影响记录。玩家做出会改变世界的事之后，记录员会把它们记在这里。'));
        return;
    }
    const injected = new Set(lastInjectedIds);
    list.replaceChildren(...recent.map(record => buildImpactItem(record, { injected: injected.has(record.id), compact: true })));
    if (all.length > recent.length) {
        const hint = makeElement('li', 'dai-impact-empty', `只显示最近 ${recent.length} 条（共 ${all.length} 条）；全部记录与筛选在「世界账本」里。`);
        list.append(hint);
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
    // 页面顶部状态行：账本规模 + 上一轮注入走了哪条路、挑了几条，功能一眼可见。
    const statsBox = target?.querySelector?.('[data-impact-stats]');
    if (statsBox) {
        const via = lastImpactInjection
            ? (lastImpactInjection.status === 'injected'
                ? `上一轮已注入 ${Array.isArray(lastInjectedIds) ? lastInjectedIds.length : 0} 条（${lastImpactInjection.via === 'llm' ? '模型挑选' : '按分量直取'}）`
                : lastImpactInjection.status === 'skipped' ? '上一轮模型判断这一幕用不上旧账，未注入' : '上一轮没有可注入的影响')
            : '本轮还没挑过注入；生成前会自动挑。';
        statsBox.textContent = via;
    }
    if (summary) {
        const extra = [`已了结 ${status.closed}`];
        if (status.reverted) extra.push(`修复 ${status.reverted}`);
        if (status.edited) extra.push(`改过 ${status.edited}`);
        if (status.archived) extra.push(`档案 ${status.archived}`);
        summary.textContent = status.total
            ? `本局 ${status.total} 条 · 未了结 ${status.active} · 已发酵 ${status.ripened} · ${extra.join(' · ')}`
            : '这一局还没有记录。玩家做出会改变世界的事之后，记录员会把它们记在这里。';
    }
    renderImpactRecent(target);
    renderImpactArchive(target);
    if (!records.length) {
        library.replaceChildren(makeElement('li', 'dai-impact-empty', status.total ? '这个筛选里没有记录。' : '还没有影响记录。'));
        return;
    }
    const injected = new Set(lastInjectedIds);
    const chatLength = getHostContext()?.chat?.length ?? null;
    library.replaceChildren(...records.slice(0, impactShown).map(record => buildImpactItem(record, {
        injected: injected.has(record.id),
        children: children.get(record.id),
        chatLength,
    })));
    if (records.length > impactShown) {
        const more = makeElement('li', 'dai-impact-item');
        const button = makeElement('button', 'dai-impact-edit', `再显示 ${Math.min(100, records.length - impactShown)} 条（筛选后共 ${records.length} 条）`);
        button.type = 'button';
        button.dataset.impactMore = '1';
        more.append(button);
        library.append(more);
    }
}

/** 打开全量世界账本弹窗；列表、筛选与档案都在弹窗里操作。 */
function openImpactLedger(panel) {
    const dock = panel?.querySelector?.('[data-modal-dock="impact-ledger"]');
    if (!dock) return { status: 'missing' };
    renderImpactLibrary(panel);
    openAgentModal(panel, '世界账本', dock, { wide: true });
    return { status: 'open' };
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
    renderFactsLastInjection(panel);
}

/** 「上次注入」单独一栏：最近一轮挑了哪些条目、多少字、是否还在提示词里。 */
function renderFactsLastInjection(panel) {
    const target = panel?.querySelector?.('[data-facts-last-injection]');
    if (!target) return;
    const last = agentPromptInjection.inspect().last;
    if (!last) {
        target.replaceChildren(makeElement('p', 'dai-impact-empty', '本轮还没有注入过。'));
        return;
    }
    if (last.status === 'failed') {
        target.replaceChildren(makeElement('p', 'dai-impact-empty', `注入失败：${last.reason ?? '未知原因'}`));
        return;
    }
    if (last.status !== 'injected') {
        target.replaceChildren(makeElement('p', 'dai-impact-empty', '没有可注入的条目（本轮未命中）。'));
        return;
    }
    const used = Array.isArray(last.usedIds) ? last.usedIds : [];
    const time = Number.isFinite(last.at) ? new Date(last.at).toLocaleTimeString('zh-CN', { hour12: false }) : '-';
    const head = makeElement('p', 'dai-impact-meta', [
        `已注入 ${used.length} 条`,
        `${last.chars ?? 0} 字`,
        last.truncated ? '已截断' : '',
        time,
        last.cleared ? '已清理' : '仍在提示词里',
    ].filter(Boolean).join(' · '));
    const list = makeElement('div', 'dai-facts-injection-list');
    if (!used.length) list.append(makeElement('p', 'dai-impact-empty', '这轮没有编号返回。'));
    else {
        for (const uid of used) {
            const entry = agentFactsIndex.get(uid);
            list.append(makeElement('span', 'dai-facts-chip', entry ? `#${uid} ${entry.name}` : `#${uid}`));
        }
    }
    target.replaceChildren(head, list);
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

/** 世界书下拉：已保存的名字 + 上次扫描到的清单，刷新后直接选。 */
function renderWorldbookPicker(panel) {
    const select = panel?.querySelector?.('[data-worldbook-pick]');
    if (!select) return;
    const settings = currentSettings().setting ?? {};
    const current = typeof settings.worldbook === 'string' ? settings.worldbook.trim() : '';
    const saved = Array.isArray(settings.worldbookOptions) ? settings.worldbookOptions.map(String) : [];
    const names = [...new Set([...saved, current].map(name => name.trim()).filter(Boolean))];
    const previous = select.value;
    const options = [document.createElement('option')];
    options[0].value = '';
    options[0].textContent = names.length ? '（尚未选择）' : '（先扫描或手动填写）';
    for (const name of names) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        options.push(option);
    }
    select.replaceChildren(...options);
    if (current && names.includes(current)) select.value = current;
    else if (previous && names.includes(previous)) select.value = previous;
    else select.value = '';
}

function rememberWorldbookOptions(panel, names) {
    const unique = [...new Set((Array.isArray(names) ? names : []).map(name => String(name ?? '').trim()).filter(Boolean))];
    const result = hostStorage.updateSettings({ setting: { worldbookOptions: unique } });
    if (result.status === 'ready') Promise.resolve(hostStorage.saveSettings()).catch(() => { /* 下次扫描再存 */ });
    renderWorldbookPicker(panel);
    return unique;
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
    rememberWorldbookOptions(panel, names);
    if (target) target.textContent = `找到 ${names.length} 本世界书，下拉框和输入框里都能直接选（已记住）。`;
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