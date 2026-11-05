import { createAgentCoordinator, STATUS_EVENT } from './core/coordinator.js';
import { createModuleRunner } from './core/module-runner.js';
import { createTurnPipeline } from './core/turn-pipeline.js';
import { createQualityGate } from './core/quality-gate.js';
import { createDataContractRegistry } from './core/data-contract.js';
import { createAuditLog } from './core/audit-log.js';
import { createFactsLibrary } from './narrative/facts-library.js';
import { createSettingSupply, trimToVolume } from './narrative/setting-supply.js';
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
import { createNpcLedger, normalizePatch, NPC_FIELDS, FAVOR_SCALE, FAVOR_STEP_MAX, favorLabel } from './npc/npc-ledger.js';
import { NPC_RECORD_PROMPT, NPC_RECORD_JSON_SCHEMA, NPC_EXTRACT_PROMPT, buildNpcRecordUser, buildNpcExtractUser, playerContextLine, parseNpcRecordReply, EXP_CONDENSE_PROMPT, buildExpCondenseUser, parseExpCondenseReply } from './npc/npc-recorder.js';
import { createNpcColdRuntime } from './npc/npc-cold-runtime.js';
import { NPC_COLD_PROMPT, buildNpcColdUser } from './npc/npc-cold-recorder.js';
import { createWorldSimulator } from './request/world-simulator.js';
import { createSandboxMode } from './sandbox/sandbox-mode.js';
import { SANDBOX_WORLD_PROMPT, buildSandboxDecideNote } from './sandbox/sandbox-world.js';
import { createUiState } from './host/ui-state.js';
import { createNarrativeGuard } from './narrative/narrative-guard.js';
import { createStateStore } from './core/state-store.js';
import { createCommitRecovery } from './core/commit-recovery.js';
import { createOperationLedger } from './core/operation-ledger.js';
import { createHistoryEventAdapter, chatFloorShape, findDeletedFloor } from './narrative/history-events.js';
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
import { SETTLE_RESULT_PROMPT, SETTLE_INJECTION_SOURCES, buildSettleResultUser, buildSettleState, buildSettleContextState, compareSettleState, parseSettleResult, reviewSettleEffects, renderSettleInjection } from './settle/settle-adjudicate.js';
import { createSettleSession, shouldClearSettleOnGenerationEnd } from './settle/settle-session.js';
import { createLlmClient, listModels } from './host/llm-client.js';
import { API_PRESETS_MAX, parseYamlBlock, presetToOverrides } from './host/api-presets.js';
import { createMessageAdapter } from './host/message-adapter.js';
import { createStatePersistence } from './host/state-persistence.js';
import { createPromptInjection } from './host/prompt-injection.js';
import { stripGlobalDisplayRegexScripts, ensureScopedDisplayRegexScripts, isDoupoCard } from './host/display-regex.js';
import { loadWorldbookEntries, summarizeWorldbookEntries } from './narrative/worldbook-source.js';
import { createFactsIndex } from './narrative/facts-index.js';
import { createFactsSelector, DEFAULT_MAX_PICKS, LOOKUP_RULES, SELECT_RULES } from './narrative/facts-select.js';
import { createWorldRuntime, eventIntro } from './world/world-runtime.js';
import { buildWorldInjection, extractOpsBlock, parseOps, stripOpsBlock, OPS_GUIDE, WORLD_HEADER, seasonOf } from './world/world-ops.js';
import { buildDecideUser, parseDecision, WORLD_DECIDE_PROMPT, DECIDE_JSON_SCHEMA } from './world/world-decide.js';
import { createSelfRuntime } from './self/self-runtime.js';
import { buildSelfInjection, extractOpsBlock as extractSelfOpsBlock, stripOpsBlock as stripSelfOpsBlock, SELF_GUIDE, SELF_HEADER } from './self/self-ops.js';
import { SELF_DECIDE_PROMPT, SELF_JSON_SCHEMA, buildSelfDecideUser, parseSelfDecision } from './self/self-decide.js';

import { createMemoryRuntime } from './memory/memory-runtime.js';
import { buildMemoryInjection, renderMemoryEntriesDetail, recallHits, recallKeys, findMemoryConflicts, extractOpsBlock as extractMemoryOpsBlock, parseOps as parseMemoryOps, stripOpsBlock as stripMemoryOpsBlock, MEMORY_GUIDE, MEMORY_HEADER } from './memory/memory-ops.js';
import { buildDecideUser as buildMemoryDecideUser, parseDecision as parseMemoryDecision, capRememberOps, MEMORY_DECIDE_PROMPT, MEMORY_JSON_SCHEMA } from './memory/memory-decide.js';
import { buildRecallUser, parseRecallDecision, recallEntriesFromIds, MEMORY_RECALL_PROMPT, RECALL_JSON_SCHEMA } from './memory/memory-recall.js';

import { MEMORY_CONSOLIDATE_PROMPT, MEMORY_CONSOLIDATE_JSON_SCHEMA, buildConsolidateUser, parseConsolidation } from './memory/memory-consolidate.js';
import { createDbBridge } from './host/db-bridge.js';
import { createSelfMvuBridge } from './host/self-mvu.js';
import { createMvuArbiter, extractUpdateBlock } from './host/mvu-arbiter.js';
import { sameSelfState, sameMemoryState, selfStateFromTables, memoryStateFromTables, preserveUnmappedSelfFields } from './host/db-tables.js';

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

let agentContinuationEpoch = 0;
let hostQuietIdleUnsubscribe;

// A chat id alone cannot distinguish leaving and returning to the same chat.
// Keep reply identity too: an edit/swipe/delete must not commit an older reading.
function captureAgentScope() {
    const epoch = agentContinuationEpoch;
    const scope = settleScopeKey();
    const chat = getHostContext()?.chat;
    return { current: () => currentSettings().enabled !== false && epoch === agentContinuationEpoch
        && scope === settleScopeKey() && getHostContext()?.chat === chat };
}

function captureAgentContinuation() {
    const epoch = agentContinuationEpoch;
    const scope = settleScopeKey();
    const chat = getHostContext()?.chat;
    const floor = lastReplyIndex(Array.isArray(chat) ? chat : []);
    const reply = chat?.[floor];
    const tail = chat?.at(-1);
    const identity = () => JSON.stringify([chat?.length, reply?.mes, reply?.swipe_id, tail?.mes, tail?.swipe_id]);
    const captured = identity();
    return { current: () => currentSettings().enabled !== false && epoch === agentContinuationEpoch && scope === settleScopeKey()
        && getHostContext()?.chat === chat && chat?.[floor] === reply && chat?.at(-1) === tail && identity() === captured };
}

function invalidateAgentContinuations() {
    agentContinuationEpoch += 1;
    worldDecideRunning = selfDecideRunning = memoryDecideRunning = impactDecideRunning = false;
    memoryConsolidateRunning = memoryRecallRunning = npcRecordRunning = npcColdRunning = false;
    worldDecidedFloor = selfDecidedFloor = memoryDecidedFloor = null;
    pendingExpCondense = null;
}

/** 把「上次注入」记录写进聊天存档：设置面板和悬浮球在任何时候打开都能看到最近一轮的原著注入。 */
function persistFactsLastInjection() {
    try {
        const last = agentPromptInjection.inspect().last;
        if (!last || !hostStorage?.chatState || !hostStorage?.saveChatState) return;
        const state = hostStorage.chatState();
        const value = state?.status === 'ready' && state.value && typeof state.value === 'object' ? { ...state.value } : {};
        value.factsLastInjection = { ...last };
        Promise.resolve(hostStorage.saveChatState(value)).catch(() => { /* 存档失败不影响注入 */ });
    } catch { /* 存档失败不影响注入 */ }
}

/** 从聊天存档恢复「上次注入」记录（换聊天/启动时调用）：内存里没有才恢复，不覆盖更新的一轮。
 * 启动时注入容器必然已被酒馆重置，恢复出的记录一律标「已清理」，别显示成还在提示词里。 */
function hydrateFactsLastInjection() {
    try {
        if (agentPromptInjection.inspect().last) return;
        const state = hostStorage?.chatState?.();
        const record = state?.status === 'ready' ? state.value?.factsLastInjection : undefined;
        if (record) agentPromptInjection.restore({ ...record, cleared: true });
    } catch { /* 恢复失败就当没有记录 */ }
}

/** 楼层显示美化的落位：五条仅显示层正则住角色卡的局部正则（data.extensions.regex_scripts，随卡导出）。
 *  启动/换聊天时：①回收老版本装进全局列表的本扩展脚本（只认 doupo-agent- 前缀 id，用户自己的不动）；
 *  ②当前开着斗破卡就把缺的脚本幂等补进卡的局部正则（writeExtensionField 落盘到卡文件）；
 *  ③首次补装时替这张卡补上局部正则允许位（用户后来在正则面板手动关掉的不强开）。
 *  什么都没变就不落盘不刷新；有变更才保存并刷新一次当前聊天，让已渲染的老楼层立刻套上美化。 */
async function installDisplayRegex() {
    try {
        const context = getHostContext();
        const store = context?.extensionSettings;
        if (!context || !store || !Array.isArray(store.regex)) return;
        let touchedSettings = false;
        let addedScoped = 0;
        const stripped = stripGlobalDisplayRegexScripts(store.regex);
        if (stripped.status === 'ready' && stripped.removed.length) {
            store.regex = stripped.kept;
            touchedSettings = true;
        }
        try {
            const character = resolveCurrentCharacter(context);
            const chid = Array.isArray(context.characters) ? context.characters.indexOf(character) : -1;
            if (character && isDoupoCard(character) && chid >= 0 && typeof context.writeExtensionField === 'function') {
                const existing = character?.data?.extensions?.regex_scripts;
                const result = ensureScopedDisplayRegexScripts(existing);
                if (result.added.length) {
                    await context.writeExtensionField(chid, 'regex_scripts', result.scripts);
                    addedScoped = result.added.length;
                    // 局部正则要允许位才生效；这里是脚本的主人第一次装，顺手替卡补上。
                    const avatar = typeof character.avatar === 'string' ? character.avatar : '';
                    if (avatar && !Array.isArray(store.character_allowed_regex)) store.character_allowed_regex = [];
                    if (avatar && !store.character_allowed_regex.includes(avatar)) {
                        store.character_allowed_regex.push(avatar);
                        touchedSettings = true;
                    }
                }
            }
        } catch { /* 卡片局部同步失败不影响全局回收 */ }
        if (!touchedSettings && !addedScoped) return;
        context.saveSettingsDebounced?.();
        Promise.resolve(context.reloadCurrentChat?.()).catch(() => { /* 刷新失败时下次渲染再生效 */ });
    } catch { /* 显示层失败不影响任何功能 */ }
}

function bindHostLifecycle() {
    hostQuietIdleUnsubscribe?.();
    hostQuietIdleUnsubscribe = undefined;
    const context = getHostContext();
    if (!context?.eventSource || !context.event_types || typeof context.eventSource.on !== 'function') return { status: 'unavailable' };
    hostLifecycleBindings.forEach(({ event, handler }) => context.eventSource.removeListener?.(event, handler));
    hostLifecycleBindings = [];
    const onReady = () => {
        hostContext = getHostContext();
        hostStorage = createHostStorage({ getContext: getHostContext });
        initializeHistoryEvents();
        void installDisplayRegex();
        mount();
        restoreSandboxFromChat();
        restoreWorldFromChat();
        restoreImpactFromChat();
        restoreNpcLedgerFromChat();
        restoreNpcColdFromChat();
        restoreSelfFromChat();
        restoreMemoryFromChat();
        hydrateFactsLastInjection();
        hydrateMemoryLastInjection();
        hydrateSettleAdjudication();
        // 申报通道开机对齐：独立模式要保证世界书申报条目处于停用态（幂等，已对齐时不落盘）。
        try {
            const channel = selfLedgerSettings().mvuChannel;
            void setMvuDeclarationEntries(channel === 'inline').then(result => {
                if (result.status === 'error') console.warn('[斗破Agent] 申报条目对齐失败', result.reason);
            });
        } catch { /* 对齐失败不阻断启动，独立模式有正文块兜底 */ }
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
            invalidateAgentContinuations();
            dashboardScope = undefined;
            resetSettleAdjudication();
            void installDisplayRegex();
            restoreSandboxFromChat();
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
            hydrateFactsLastInjection();
            hydrateMemoryLastInjection();
        hydrateSettleAdjudication();
            try { agentOrchestrator.restore(currentAgentScope()); } catch { /* 未连接酒馆时跳过恢复 */ }
            refreshControlDashboard();
            refreshWorldPage();
            try { renderImpactLibrary(); } catch { /* 面板未挂载时忽略 */ }
            try { refreshNpcLedgerPage(); } catch { /* 同上 */ }
            try { refreshSelfPage(); } catch { /* 同上 */ }
            try { refreshMemoryPage(); } catch { /* 同上 */ }
            void syncWorldbookIndex();
            refreshChatShape();
        };
        context.eventSource.on(chatChanged, handler);
        hostLifecycleBindings.push({ event: chatChanged, handler });
    }
    // ST 1.19 streaming emits ended before MESSAGE_RECEIVED/render post-processing;
    // non-streaming does the reverse. Capture reply identity only after both.
    let completedGeneration = null;
    let resumeGenerationEnd = null;
    let quietLifecycle = false;
    const renderedEvent = context.event_types.CHARACTER_MESSAGE_RENDERED;
    const startedEvent = context.event_types.GENERATION_STARTED;
    const waitForRender = typeof renderedEvent === 'string' && typeof startedEvent === 'string';
    const generationCurrent = turn => turn && turn.epoch === agentContinuationEpoch
        && turn.scope === settleScopeKey() && turn.chat === getHostContext()?.chat;
    const finishGeneration = () => {
        const turn = completedGeneration;
        if (!generationCurrent(turn) || !turn.ended || !turn.rendered || turn.launched
            || turn.reply !== turn.chat[lastReplyIndex(turn.chat)] || agentLlmClient.isQuietBusy()) return;
        turn.launched = true;
        resumeGenerationEnd?.();
    };
    if (waitForRender) {
        hostQuietIdleUnsubscribe = agentLlmClient.onQuietIdle(() => { quietLifecycle = false; queueMicrotask(finishGeneration); });
        const started = (type, options, dryRun) => {
            if (dryRun) return;
            quietLifecycle = type === 'quiet';
            if (quietLifecycle) return;
            invalidateAgentContinuations();
            completedGeneration = { epoch: agentContinuationEpoch, scope: settleScopeKey(), chat: getHostContext()?.chat, ended: false, rendered: false, launched: false };
        };
        const rendered = index => {
            const turn = completedGeneration;
            if (!generationCurrent(turn) || quietLifecycle || turn.launched || index !== lastReplyIndex(turn.chat)) return;
            turn.rendered = true;
            turn.reply = turn.chat[index];
            finishGeneration();
        };
        context.eventSource.on(startedEvent, started);
        // makeLast registers after the installed template's awaited makeFirst handler.
        if (typeof context.eventSource.makeLast === 'function') context.eventSource.makeLast(renderedEvent, rendered);
        else context.eventSource.on(renderedEvent, rendered);
        hostLifecycleBindings.push({ event: startedEvent, handler: started }, { event: renderedEvent, handler: rendered });
    }
    // The prompt container is global: leave one injected turn uncleared and it
    // keeps riding along in every later prompt.
    for (const name of ['GENERATION_ENDED', 'GENERATION_STOPPED']) {
        const event = context.event_types[name];
        if (typeof event !== 'string' || !event) continue;
        const handler = (renderReady = false) => {
            // 生成正常结束才决定/解析；手动停止时最后楼层还是上一轮的，跑了也是白花一次调用。
            // 酒馆对每一次生成收尾都广播这个事件——包括这里记账链自己发起的静默调用。
            // 只登记有 normal started 的最新正文；静默结束只唤醒已登记的待处理轮，不能创建新轮。
            const quietInFlight = typeof agentLlmClient?.isQuietBusy === 'function' && agentLlmClient.isQuietBusy();
            // 静默裁判也广播结束事件，但不拥有正文这一轮的注入容器。
            if (name === 'GENERATION_STOPPED') {
                completedGeneration = null;
                settleSession.invalidate();
                if (lastSettleAdjudication?.status === 'pending') recordSettleAdjudication({ ...lastSettleAdjudication, status: 'stale', summary: '生成已停止，等待中的判定已作废' });
            }
            if (name === 'GENERATION_ENDED' && waitForRender && renderReady !== true) {
                if (quietLifecycle) return;
                if (!generationCurrent(completedGeneration)) return;
                completedGeneration.ended = true;
                finishGeneration();
                return;
            }
            if (!shouldClearSettleOnGenerationEnd({ quietBusy: quietInFlight, eventType: name === 'GENERATION_ENDED' ? 'ended' : 'stopped' })) return;
            if (name === 'GENERATION_ENDED' && !quietInFlight && currentSettings().enabled !== false) {
                const decide = worldDecideSettings();
                // 影响库要读“这一轮之后”的世界台账，所以排在决定/执行之后，串行跑。
                const continuation = captureAgentContinuation();
                const afterWorld = async () => {
                    if (!continuation.current()) return;
                    try {
                        const impact = impactSettings();
                        if (impact.enabled && impact.decideEnabled && impact.decideAuto) {
                            // 记录节奏：1 = 每轮，3 = 每三轮；按“上次记账之后又生成了几楼”算，换聊天/重开也不会乱。
                            const chat = Array.isArray(getHostContext()?.chat) ? getHostContext().chat : [];
                            // 没记到东西也算叫过一次记录员，否则 every=3 会在“连着几轮没变化”后退化成每轮都跑。
                            const decidedFloor = agentImpactRuntime.status().decidedFloor;
                            // 删过楼的话旧楼层号会超出当前聊天：夹到最后一楼，别把“删楼”误判成“一整段都没记过”。
                            const lastFloor = Math.min(decidedFloor, chat.length - 1);
                            if (isImpactDecideDue(chat, { every: impact.decideEvery, lastFloor })) void Promise.resolve(runImpactDecision({ source: 'auto' })).then(result => { try { recordAgentAudit({ event: 'turn_impact_decide', outcome: String(result?.status ?? 'unknown') }); } catch { /* 审计失败不影响记账 */ } }).catch(() => {});
                        }
                    } catch { /* 记录失败不影响生成 */ }
                    // 纳戒记账，按申报通道分流：inline=模型在正文末尾顺手申报，仲裁器读帧裁决；
                    // independent=扩展另发一次决定请求，正文保持干净——但主回复若已带申报块
                    // （世界书条目没停干净/手动开了），仍走仲裁器兜底，双通道不会重复记账。
                    try {
                        const self = selfLedgerSettings();
                        if (self.enabled) {
                            let run;
                            if (self.mvuChannel === 'independent') {
                                const chat = Array.isArray(getHostContext()?.chat) ? getHostContext().chat : [];
                                let replyText = '';
                                for (let cursor = chat.length - 1; cursor >= 0; cursor -= 1) {
                                    const message = chat[cursor];
                                    if (!message || typeof message.mes !== 'string' || !message.mes.trim()) continue;
                                    if (message.is_user === true || message.is_system === true) continue;
                                    replyText = message.mes;
                                    break;
                                }
                                run = extractUpdateBlock(replyText)
                                    ? agentMvuArbiter.runArbitration({ source: 'auto' })
                                    : (self.decideAuto && self.decideEnabled ? runSelfDecision({ source: 'auto' }) : Promise.resolve({ status: 'idle' }));
                            } else {
                                run = agentMvuArbiter.runArbitration({ source: 'auto' });
                            }
                            const result = await run;
                            if (!continuation.current()) return;
                            if (creationInitPending() && result && !['unavailable', 'stale', 'failed', 'rejected'].includes(result.status)) clearCreationInitPending();
                            try { recordAgentAudit({ event: 'turn_mvu_arbitrate', stage: self.mvuChannel, outcome: `${result?.status ?? 'unknown'}${result?.fallback ? '·帧未动兜底' : ''}` }); } catch { /* 审计失败不影响记账 */ }
                        }
                    } catch { /* 纳戒记账失败不影响生成 */ }
                    // 记忆依赖纳戒/MVU完成；人物和影响仍可独立并行。
                    if (!continuation.current()) return;
                    try {
                        const memory = memorySettings();
                        if (memory.enabled && memory.decideEnabled && memory.decideAuto) void Promise.resolve(runMemoryDecision({ source: 'auto' })).then(result => { try { recordAgentAudit({ event: 'turn_memory_decide', outcome: String(result?.status ?? 'unknown') }); } catch { /* 审计失败不影响记账 */ } }).catch(() => {});
                    } catch { /* 记账失败不影响生成 */ }
                };
                if (decide.enabled && decide.auto) {
                    try { void Promise.resolve(runWorldDecision({ source: 'auto' })).then(result => { try { recordAgentAudit({ event: 'turn_world_decision', outcome: String(result?.status ?? 'unknown') }); } catch { /* 审计失败不影响记账 */ } }).finally(afterWorld).catch(() => {}); } catch { afterWorld(); }
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
                    try { void Promise.resolve(runNpcLedgerRecord({ source: 'auto' })).then(result => { try { recordAgentAudit({ event: 'turn_npc_record', outcome: String(result?.status ?? 'unknown') }); } catch { /* 审计失败不影响记账 */ } }).catch(() => {}); } catch { /* 记账失败不影响生成 */ }
                }
            }
            try { agentPromptInjection.clear(); } catch { /* 清空失败不影响生成 */ }
            persistFactsLastInjection();
            try { agentWorldPromptInjection.clear(); } catch { /* 同上 */ }
            try { agentImpactPromptInjection.clear(); } catch { /* 同上 */ }
            try { agentNpcLedgerInjection.clear(); } catch { /* 同上 */ }
            try { agentSelfPromptInjection.clear(); } catch { /* 同上 */ }
            try { agentMemoryPromptInjection.clear(); } catch { /* 同上 */ }
            markMemoryLastInjectionCleared();
            try {
                const cleared = agentActionPromptInjection.clear();
                if (lastSettleAdjudication && lastSettleAdjudication.cleared !== true) recordSettleAdjudication({ ...lastSettleAdjudication, cleared: cleared.status === 'cleared', clearError: cleared.status === 'cleared' ? '' : cleared.reason ?? cleared.status });
            } catch { /* 清理失败不冒充成功 */ }
            try {
                const panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null;
                // 面板即使收着也照常刷新：DOM 更新很便宜，省得用户打开时看到上一轮的旧内容。
                if (panel) { renderFactsStatus(panel); refreshWorldbookStats(panel); refreshWorldPage(panel); refreshControlDashboard(); try { renderImpactLibrary(panel); } catch { /* 同上 */ } try { refreshNpcLedgerPage(panel); } catch { /* 同上 */ } try { refreshSelfPage(panel); } catch { /* 同上 */ } try { refreshMemoryPage(panel); } catch { /* 同上 */ } }
            } catch { /* 面板未挂载时忽略 */ }
            refreshChatShape();
        };
        if (name === 'GENERATION_ENDED') resumeGenerationEnd = () => handler(true);
        context.eventSource.on(event, handler);
        hostLifecycleBindings.push({ event, handler });
    }
    // 删楼：这一楼记的账进档案，后面楼层的“依据楼层”整体前移，账本不会指错地方。
    // 酒馆 MESSAGE_DELETED 的载荷是删后的聊天长度而不是被删的楼层号（1.19.0 实测），
    // 所以靠删前/删后楼层指纹差分定位真被删的那楼；快照不在（刚挂载）才退回旧口径。
    let lastChatShape = [];
    const refreshChatShape = () => {
        const chat = Array.isArray(getHostContext()?.chat) ? getHostContext().chat : [];
        lastChatShape = chat.map(chatFloorShape);
    };
    refreshChatShape();
    const messageDeleted = context.event_types.MESSAGE_DELETED;
    if (typeof messageDeleted === 'string' && messageDeleted) {
        const handler = payload => {
            const chat = Array.isArray(getHostContext()?.chat) ? getHostContext().chat : [];
            const located = findDeletedFloor(lastChatShape, chat.map(chatFloorShape));
            const index = located ?? (Number.isInteger(payload) && payload >= 0 ? payload : Number(payload?.index ?? payload?.messageIndex ?? NaN));
            if (!Number.isInteger(index) || index < 0) { refreshChatShape(); return; }
            try {
                const result = agentImpactRuntime.dropFloor(index, { reason: '楼层已删' });
                if (result.status === 'applied') {
                    persistImpact();
                    lastImpactInjection = null;
                    renderImpactLibrary();
                    const words = [];
                    if (result.removed) words.push(`${result.removed} 条影响进了档案`);
                    if (result.shifted) words.push(`${result.shifted} 条依据楼层前移`);
                    setImpactStatus(`第 ${index + 1} 楼已删：${words.join('，')}。`);
                }
            } catch { /* 账本没挂载时忽略 */ }
            try {
                const memoryResult = agentMemoryRuntime.dropFloor(index);
                if (memoryResult.status === 'applied') {
                    persistMemory();
                    refreshMemoryPage();
                    setMemoryDecideStatus(`第 ${index + 1} 楼已删：对应记忆 ${memoryResult.removed} 条删除，${memoryResult.shifted} 条依据楼层前移。`);
                }
            } catch { /* 账本没挂载时忽略 */ }
            // 不管定位成功与否都把底片换成删后的现状，连环删（/cut 一次删多楼）逐条都能对上。
            refreshChatShape();
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
export const agentLlmClient = createLlmClient({ getSettings: () => currentSettings(), getContext: getHostContext, capture: captureAgentContinuation, isCurrent: owner => owner.current() });
export const agentMessageAdapter = createMessageAdapter({ getContext: getHostContext, capture: captureAgentScope, isCurrent: owner => owner.current() });
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
/** 行动结算·最终判定：生成前判出本轮行动结果写进独立通道（doupo_action），正文必须与判定一致。 */
export const agentActionPromptInjection = createPromptInjection({ getContext: getHostContext, key: 'doupo_action' });
/** 数据库桥：纳戒/世界台账镜像到「龙血玄黄·数据库」的表格里（表=账本，扩展面板=前端）。
 *  数据库脚本没装或被关时全部调用静默跳过，照旧走 chatMetadata，零回归。 */
export const agentDbBridge = createDbBridge({
    getSettings: () => {
        try { return currentSettings(); } catch { return undefined; }
    },
    capture: captureAgentContinuation,
    isCurrent: owner => owner.current(),
});
/** 纳戒 → MVU 变量桥：主角档案/境界/清单链投影到 stat_data.斗破纳戒，
 *  既是只读镜像、也是模型申报变量变化的入口（MVU 通道）。MVU 主脚本没装或被关时静默跳过，零回归。 */
export const agentSelfMvu = createSelfMvuBridge({ capture: captureAgentContinuation, isCurrent: owner => owner.current(), getContext: getHostContext });
/** MVU 仲裁器：模型经 <UpdateVariable> 申报纳戒变化，生成结束后读帧差分、按业务规则裁决，
 *  合法申报翻译成 self-runtime 操作落账，违规申报由下次同步自然写回。 */
export const agentMvuArbiter = createMvuArbiter({
    selfRuntime: agentSelfRuntime,
    selfMvu: agentSelfMvu,
    getContext: () => getHostContext(),
    worldDay: () => worldDay(),
    persistSelf,
    capture: captureAgentContinuation,
    isCurrent: owner => owner.current(),
    waitMs: 1200,
});
/** World-book index (uid -> category/name/volumes/content) and the model-side selector that names uids. */
export const agentFactsIndex = createFactsIndex();

/**
 * API设置方案绑定表：功能组 → 绑定键（存方案 id）。模型设置页每张连接卡顶部的下拉写这里的键；
 * 绑定非空时该功能整套走方案（连接+参数+附加参数）；空/方案被删＝跟随酒馆主连接。
 */
const API_PRESET_BINDINGS = Object.freeze({
    llm: 'llm.apiPreset', // 正文/默认调用（意图解析、正文撰写共用）
    facts: 'setting.apiPreset', // 原著选条/卷外点选
    settle: 'settle.apiPreset', // 行动结算分类判定（已并入最终判定同一套 API；绑定保留只为删方案时回收旧绑定）
    settleResult: 'settle.resultApiPreset', // 行动结算·判定调用（分类判定与最终判定共用）
    world: 'world.decideApiPreset', // 世界决定
    npcLedger: 'npc.ledgerApiPreset', // 人物簿记录员（生成后自动记账）
    npcExtract: 'npc.extractApiPreset', // 人物簿档案抄录（按世界书补空字段）
    npcExp: 'npc.expApiPreset', // 人物簿经历精简
    npcCold: 'npc.coldApiPreset', // 人物簿冷藏推进员
    self: 'self.decideApiPreset', // 纳戒决定（与记忆决定是两条独立调用，各绑各的方案）
    memory: 'memory.decideApiPreset', // 记忆决定
    memoryRecall: 'memory.recallApiPreset', // 记忆召回（生成前挑旧记忆）
    memoryConsolidate: 'memory.consolidateApiPreset', // 记忆总结（小记忆攒批成大记忆）
    impactDecide: 'impact.decideApiPreset', // 世界影响记录员
    impactInject: 'impact.injectApiPreset', // 世界影响场记
});

/** 读一个功能的方案绑定：绑定了且方案还在就转成 llm-client 覆盖，否则 undefined（＝跟随酒馆主连接）。 */
function presetOverrides(group) {
    const path = API_PRESET_BINDINGS[group];
    if (!path) return undefined;
    const id = String(fieldValue(currentSettings(), path) ?? '').trim();
    if (!id) return undefined;
    const preset = (currentSettings().api?.presets ?? []).find(item => item?.id === id);
    return preset ? (presetToOverrides(preset) ?? undefined) : undefined;
}

/** 原著选条用哪套连接：绑定了方案整套走方案；没绑＝跟随酒馆主连接（模型设置页已无手填字段）。 */
function factsOverrides() {
    return presetOverrides('facts');
}
export const agentFactsSelector = createFactsSelector({
    index: agentFactsIndex,
    complete: args => agentLlmClient.complete({ ...args, label: args.label ?? '事实检索', overrides: factsOverrides() }),
    // 设置页里改的选条规则即时生效；留空则用内置默认。
    getRules: () => currentSettings().prompt?.select || SELECT_RULES,
    getLookupRules: () => currentSettings().prompt?.lookup || LOOKUP_RULES,
    // 单次检索出条目上限：设置页数字每次选条现读，不设天花板，留空回落默认 8。
    getMaxPicks: () => {
        const value = Number(currentSettings().setting?.maxItems);
        return Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX_PICKS;
    },
});
export const agentTurnStages = createTurnStages({
    runner: agentModuleRunner,
    actions: agentActionResolver,
    world: agentWorldSimulator,
    // 正文撰写/设定挑选绑定了 API设置方案就整套走方案；没绑定时 overrides 是 undefined，行为与旧版一致。
    compose: args => agentLlmClient.compose({ ...args, overrides: presetOverrides('llm') }),
    settings: agentSettingSupply,
    select: args => agentLlmClient.selectSettings({ ...args, overrides: presetOverrides('facts') }),
    catalogIndex: agentFactsIndex,
    catalogSelector: agentFactsSelector,
    // 人物簿已建档的人物条目不再从原著设定重复注入：同一人的信息由人物簿通道负责。
    // 只拦「人物」类条目；故事线、势力、地点等照常注入。条目名带括号别名时
    // （如「药尘（药老）」）拆开再查，人物簿记的是正文里叫开的名字。
    skipProfiledEntry: entry => {
        if (entry?.category !== '人物' || !entry?.name) return false;
        const candidates = [entry.name, entry.name.replace(/[（(][^（()）]*[)）]/gu, '').trim()].filter(Boolean);
        return candidates.some(name => agentNpcLedger.find(name) === true);
    },
    getSettingBudget: () => {
        const setting = currentSettings().setting ?? {};
        // 沙盒口径不用世界书：设定挑选与按需注入整条停用，即使世界书开关还开着。
        if (setting.enabled === false || sandboxModeActive()) return null;
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
        if (panel !== null) return { volume: panel, source: 'manual' };
        const state = (() => { try { return agentStateStore.read(currentAgentScope()).state ?? {}; } catch { return {}; } })();
        const fromState = Number.isInteger(state.currentVolume) && state.currentVolume > 0 ? state.currentVolume : null;
        if (fromState !== null) return { volume: fromState, source: 'auto' };
        const auto = settings.facts?.currentVolume;
        return Number.isInteger(auto) && auto > 0 ? { volume: auto, source: 'auto' } : null;
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
    settleAdjudicator: async ({ category, input, state, allowedFields, preliminary, signal }) => {
        const settings = settleSettings();
        return agentLlmClient.adjudicateAction({
            system: settings.promptFor(category),
            categoryLabel: settings.labelFor(category),
            input,
            state,
            allowedFields,
            preliminary,
            signal,
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
    interpret: args => agentLlmClient.interpret({ ...args, categories: settleSettings().customCategories, overrides: presetOverrides('llm') }),
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

/** 收养护栏（纳戒）：数据库表是账本的镜像，镜像一旦失败表就冻结在旧状态。
 * 只允许「表时间戳 ≥ 本地时间戳」时收养：表更旧＝镜像失败留下的冻结表，收养会把新账冲回去。
 * 表时间戳缺失（老模板没写、推导拿不到）一律视为不可信，不收养。 */
function dbStateAdoptable(dbUpdatedAt, localUpdatedAt) {
    const dbTime = Date.parse(String(dbUpdatedAt ?? ''));
    const localTime = Date.parse(String(localUpdatedAt ?? ''));
    if (!Number.isFinite(dbTime)) return false;
    if (!Number.isFinite(localTime)) return true;
    return dbTime >= localTime;
}

/** 收养护栏（记忆）：记忆表没有全局时间戳列，改比内容——
 * 表里必须存在「本地没有或文本不同」的记忆才收养；表只是本地的子集（镜像失败冻结的旧表）时不收养。 */
function memoryTableAdoptable(derivedEntries = [], localEntries = [], retiredIds = []) {
    // 数据库存储帧重放会把"已删除/已并入"的行复活成新面孔：凡在本地退役登记里的编号一律不收，
    // 否则一次刷新就会把总结掉的小记忆连本带利认领回真账。
    const retired = new Set(Array.isArray(retiredIds) ? retiredIds : []);
    const localById = new Map(localEntries.map(entry => [entry.id, entry]));
    return derivedEntries.some(entry => {
        if (retired.has(entry.id) || agentMemoryRuntime.isRetired(entry.id)) return false;
        const local = localById.get(entry.id);
        return !local || String(local.text ?? '') !== String(entry.text ?? '');
    });
}

function mergeMemoryFromTables(derived, current) {
    const retired = new Set(current.retiredIds ?? []);
    const entries = new Map((current.entries ?? []).map(entry => [entry.id, entry]));
    for (const entry of derived.entries ?? []) {
        if (!retired.has(entry.id) && !agentMemoryRuntime.isRetired(entry.id)) entries.set(entry.id, { ...entries.get(entry.id), ...entry });
    }
    return { ...current, entries: [...entries.values()] };
}

/** 世界状态跟着聊天走：换聊天读那一份，读不到就按开局初始化。
 * 世界运转不连数据库（只在扩展台账与聊天存档里），也没有镜像/收养/回拉。 */
function restoreWorldFromChat() {
    const record = hostStorage?.worldState?.();
    return record?.status === 'ready' && record.value ? agentWorldRuntime.restore(record.value) : agentWorldRuntime.reset();
}

function persistWorld() {
    const snapshot = agentWorldRuntime.snapshot();
    return Promise.resolve(hostStorage?.saveWorldState?.(snapshot) ?? { status: 'unavailable' })
        .catch(error => ({ status: 'failed', reason: String(error?.message ?? error) }));
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

/**
 * 纳戒决定与记忆决定是两条独立调用（合并决定已退役）：各自绑各自的方案，没绑＝跟随酒馆主连接。
 */
/** 纳戒页设置：注入开关/预算 + 决定开关；决定调用的连接与喂料是纳戒自己的一份（self.decide*）。 */
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
        // 绑定了 API设置方案整套走方案；没绑＝跟随酒馆主连接。
        overrides: presetOverrides('self') ?? { connection: 'tavern' },
        // 申报通道：inline=模型在正文末尾顺手输出变量申报（MVU 解析、仲裁器裁决）；
        // independent=生成结束后扩展另发一次决定请求（正文保持干净）。切换见 setSelfMvuChannel。
        mvuChannel: self.mvuChannel === 'independent' ? 'independent' : 'inline',
    };
}

/** 纳戒跟着聊天走：换聊天读那一份，读不到就按空戒开局；随后数据库表里有账就收养（表优先）。 */
function restoreSelfFromChat() {
    const record = hostStorage?.selfState?.();
    const hasLocal = record?.status === 'ready' && !!record.value;
    const result = hasLocal ? agentSelfRuntime.restore(record.value) : agentSelfRuntime.reset();
    const continuation = captureAgentContinuation();
    void (async () => {
        const adopted = await adoptSelfFromDb({ hasLocal });
        if (!continuation.current() || ['stale', 'failed', 'conflict'].includes(adopted?.status)) return;
        if (!hasLocal && adopted?.status !== 'adopted') return;
        try { await agentSelfMvu.sync(agentSelfRuntime.snapshot()); } catch { /* 恢复失败不清空旧帧 */ }
        if (!continuation.current()) return;
        try { await agentDbBridge.mirrorSelf(agentSelfRuntime.snapshot()); } catch { /* 对账失败留给下次 persist */ }
    })();
    return result;
}

/** 数据库表里已有纳戒就收养（表=账本）；保留本地操作流水，表空则不动。 */
async function adoptSelfFromDb({ hasLocal = true } = {}) {
    const continuation = captureAgentContinuation();
    const captured = JSON.stringify(agentSelfRuntime.snapshot());
    try {
        const state = await agentDbBridge.adoptSelf();
        if (!continuation.current() || captured !== JSON.stringify(agentSelfRuntime.snapshot())) return { status: 'stale' };
        if (!state) return { status: 'empty' };
        const previous = agentSelfRuntime.snapshot();
        if (hasLocal && sameSelfState(state, previous)) return { status: 'unchanged' };
        if (hasLocal && !dbStateAdoptable(state.updatedAt, previous.updatedAt)) return { status: 'older' };
        if (!hasLocal && !Number.isFinite(Date.parse(String(state.updatedAt ?? '')))) return { status: 'untrusted' };
        const merged = preserveUnmappedSelfFields(state, previous);
        agentSelfRuntime.restore({ ...merged, log: Array.isArray(previous?.log) ? previous.log : [] });
        persistSelf();
        refreshSelfPage();
        return { status: 'adopted' };
    } catch (error) {
        console.warn('[斗破Agent] 数据库纳戒收养失败', error);
        return { status: error?.code === 'db_runtime_conflict' ? 'conflict' : 'failed', reason: String(error?.message ?? error) };
    }
}

/** 数据库可视化器里的手改回拉：表一变就核对，账不一致就按表收养。 */
function handleExternalTableChange(view, meta, ownership) {
    if (ownership && !ownership.isCurrent()) return;
    if (!view || typeof view !== 'object') return;
    try {
        const derived = selfStateFromTables(view);
        if (derived && !derived.empty && !sameSelfState(derived.state, agentSelfRuntime.snapshot())) {
            const previous = agentSelfRuntime.snapshot();
            if (dbStateAdoptable(derived.state.updatedAt, previous.updatedAt)) {
                agentSelfRuntime.restore({ ...preserveUnmappedSelfFields(derived.state, previous), log: Array.isArray(previous?.log) ? previous.log : [] });
                persistSelf();
                refreshSelfPage();
            }
        }
    } catch (error) {
        console.warn('[斗破Agent] 纳戒表格回拉失败', error);
    }
    try {
        const derivedMemory = memoryStateFromTables(view);
        if (derivedMemory && !derivedMemory.empty && !sameMemoryState(derivedMemory.state, agentMemoryRuntime.snapshot())) {
            const previousMemory = agentMemoryRuntime.snapshot();
            if (memoryTableAdoptable(derivedMemory.state.entries, previousMemory.entries, previousMemory.retiredIds)) {
                const restored = agentMemoryRuntime.restore(mergeMemoryFromTables(derivedMemory.state, previousMemory));
                if (restored.status === 'rejected') return restored;
                persistMemory();
                refreshMemoryPage();
            }
        }
    } catch (error) {
        console.warn('[斗破Agent] 记忆表格回拉失败', error);
    }
}

function persistSelf() {
    const snapshot = agentSelfRuntime.snapshot();
    reconcileSettleAdjudication(snapshot);
    const result = Promise.resolve(hostStorage?.saveSelfState?.(snapshot) ?? { status: 'unavailable' })
        .catch(error => ({ status: 'failed', reason: String(error?.message ?? error) }));
    void agentDbBridge.mirrorSelf(snapshot).catch(() => { /* 镜像失败记在桥状态里，不阻断记账 */ });
    void agentSelfMvu.sync(snapshot).catch(() => { /* MVU 同步失败记在桥状态里，不阻断记账 */ });
    return result;
}

/** 记忆页设置：注入开关/预算 + 决定开关；决定调用的连接与喂料和纳戒共用一套（memory.decide*）。 */
function memorySettings() {
    const settings = currentSettings();
    const memory = settings.memory ?? {};
    return {
        enabled: settings.enableMemoryLedger !== false,
        inject: memory.inject !== false,
        injectBudget: Number.isInteger(memory.injectBudget) && memory.injectBudget > 0 ? Math.min(memory.injectBudget, 4000) : 800,
        decideEnabled: memory.decideEnabled !== false,
        decideAuto: memory.decideAuto !== false,
        consolidateAfter: Number.isInteger(memory.consolidateAfter) && memory.consolidateAfter >= 0 ? Math.min(30, memory.consolidateAfter) : 6,
        maxFloors: Number.isInteger(memory.decideMaxFloors) && memory.decideMaxFloors > 0 ? Math.min(12, memory.decideMaxFloors) : 6,
        maxEntries: Number.isInteger(memory.decideMaxEntries) && memory.decideMaxEntries >= 0 ? Math.min(40, memory.decideMaxEntries) : 12,
        prompt: typeof memory.decidePrompt === 'string' && memory.decidePrompt.trim() ? memory.decidePrompt.trim() : MEMORY_DECIDE_PROMPT,
        recallEnabled: memory.recallEnabled !== false,
        recallAuto: memory.recallAuto !== false,
        recallPrompt: typeof memory.recallPrompt === 'string' && memory.recallPrompt.trim() ? memory.recallPrompt.trim() : MEMORY_RECALL_PROMPT,
        // 记忆决定、记忆召回、记忆总结是三条独立调用，各绑各的方案；没绑＝跟随酒馆主连接。
        overrides: presetOverrides('memory') ?? { connection: 'tavern' },
        recallOverrides: presetOverrides('memoryRecall') ?? { connection: 'tavern' },
        consolidateOverrides: presetOverrides('memoryConsolidate') ?? { connection: 'tavern' },
    };
}

/** 记忆跟着聊天走：换聊天读那一份，读不到就按空账开局；随后数据库表里有账就收养（表优先）。
 *  收养后立刻对账一次：数据库存储帧重放会把已退役的行复活在表里，赶在注入发生前删掉。 */
function restoreMemoryFromChat() {
    const record = hostStorage?.memoryState?.();
    const empty = agentMemoryRuntime.reset();
    const result = record?.status === 'ready' && record.value ? agentMemoryRuntime.restore(record.value) : empty;
    if (result.status === 'rejected') return result;
    const continuation = captureAgentContinuation();
    void (async () => {
        const adopted = await adoptMemoryFromDb();
        if (!continuation.current() || ['rejected', 'failed', 'stale'].includes(adopted?.status)) return;
        try { await agentDbBridge.mirrorMemory(agentMemoryRuntime.snapshot()); } catch { /* 对账失败留给下次 persist */ }
    })();
    return result;
}

/** 总控「运行口径」行：开放世界/主线 + 世界书通道状态。 */
function renderRuntimeMode(panel) {
    const target = panel?.querySelector('[data-runtime-mode]');
    if (!target) return;
    const sandbox = sandboxModeActive();
    const record = agentSandboxMode.read(currentAgentScope());
    const recordNote = record.status === 'ready'
        ? `正式记录：${record.mode === 'sandbox' ? '开放世界' : '主线'}${record.mode === 'sandbox' ? `（惯性·${record.inertia === 'strong' ? '强' : record.inertia === 'weak' ? '弱' : '中'}）` : ''}`
        : '正式记录：未建立（按设置开关走）';
    target.textContent = sandbox
        ? `当前口径：开放世界。${recordNote}；世界书通道停用，内置斗气大陆基线注入中，决定喂料不带世界书条目。`
        : `当前口径：主线。${recordNote}；世界书通道照常（开关与预算见「原著设定」页）。`;
}

/** 数据库表里已有记忆就收养（表=账本）；保留本地操作流水，表空则不动。 */
async function adoptMemoryFromDb() {
    const continuation = captureAgentContinuation();
    const captured = JSON.stringify(agentMemoryRuntime.snapshot());
    try {
        const state = await agentDbBridge.adoptMemory();
        if (!continuation.current() || captured !== JSON.stringify(agentMemoryRuntime.snapshot())) return { status: 'stale' };
        if (!state || sameMemoryState(state, agentMemoryRuntime.snapshot())) return;
        const previous = agentMemoryRuntime.snapshot();
        if (!memoryTableAdoptable(state.entries, previous.entries, previous.retiredIds)) return;
        const restored = agentMemoryRuntime.restore(mergeMemoryFromTables(state, previous));
        if (restored.status === 'rejected') return restored;
        persistMemory();
        refreshMemoryPage();
        return { status: 'adopted' };
    } catch (error) {
        console.warn('[斗破Agent] 数据库记忆收养失败', error);
        return { status: 'failed', reason: String(error?.message ?? error) };
    }
}

function persistMemory() {
    const snapshot = agentMemoryRuntime.snapshot();
    const result = Promise.resolve(hostStorage?.saveMemoryState?.(snapshot) ?? { status: 'unavailable' })
        .catch(error => ({ status: 'failed', reason: String(error?.message ?? error) }));
    void agentDbBridge.mirrorMemory(snapshot).catch(() => { /* 镜像失败记在桥状态里，不阻断记账 */ });
    return result;
}

// ---------- 记忆召回决定：用户输入之后、生成之前，由召回员挑注入哪些记忆 ----------

/** 召回结果缓存：同一楼（楼层数 + 最新玩家输入 + 账本未变）内重 roll/重注入不重复调用模型。 */
let memoryRecallCache = { key: '', ids: [], note: '' };
let memoryRecallRunning = false;

/** 缓存键：聊天长度 + 最新玩家输入 + 账本更新时间——三者任一变化就重新召回。 */
function memoryRecallCacheKey(chat) {
    const list = Array.isArray(chat) ? chat : [];
    return JSON.stringify([settleScopeKey(), agentContinuationEpoch, agentMemoryRuntime.snapshot(), currentSettings(),
        list.map(message => [message?.is_user, message?.is_system, message?.mes, message?.swipe_id])]);
}

function setMemoryRecallStatus(message) {
    const panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null;
    const target = panel?.querySelector('[data-memory-recall-status]');
    if (target) target.textContent = message;
}

function renderMemoryRecallResult(selection) {
    const panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null;
    const target = panel?.querySelector('[data-memory-recall-result]');
    if (!target) return;
    const note = makeElement('p', 'dai-turn-result', selection?.note || '（召回员没有说明）');
    const list = makeElement('div');
    if (Array.isArray(selection?.ids) && selection.ids.length) {
        list.append(makeElement('p', 'dai-turn-result', `✓ 召回 ${selection.ids.length} 条：${selection.ids.join('、')}`));
    } else {
        list.append(makeElement('p', 'dai-turn-result', '本轮没有需要召回的记忆。'));
    }
    target.replaceChildren(note, list);
}

/**
 * 记忆召回决定：把「记忆目录（标题+钥匙）+ 最近聊天（含最新玩家输入）+ 世界书命中」交给
 * 召回模型挑编号，脚本按编号取条目（坏号跳过）。结果按楼层缓存，重 roll 不重复调用。
 * 失败/关闭/模型忙时返回失败——由注入路径退回关键词兜底，绝不阻塞生成。
 */
async function runMemoryRecall({ source = 'manual', chat = null } = {}) {
    const settings = memorySettings();
    if (!settings.enabled || !settings.inject || !settings.recallEnabled) return { status: 'disabled' };
    if (memoryRecallRunning) return { status: 'busy' };
    const chatList = Array.isArray(chat) ? chat : (Array.isArray(getHostContext()?.chat) ? getHostContext().chat : []);
    const cacheKey = memoryRecallCacheKey(chatList);
    if (source !== 'manual' && memoryRecallCache.key && memoryRecallCache.key === cacheKey) {
        return { status: memoryRecallCache.ids.length ? 'cached' : 'empty-cached', ids: memoryRecallCache.ids, note: memoryRecallCache.note };
    }
    // 自定义连接有自己的地址和密钥，不依赖全局配置；跟随酒馆才需要先检查全局连接。
    if (settings.recallOverrides.connection !== 'custom' && agentLlmClient.availableFor('tavern') !== true) {
        if (source === 'manual') setMemoryRecallStatus('模型连接未配置：先在"模型设置"页选好连接。');
        return { status: 'not_configured' };
    }
    const continuation = captureAgentContinuation();
    memoryRecallRunning = continuation;
    if (source === 'manual') setMemoryRecallStatus('召回员正在挑选……');
    try {
        const floors = [];
        for (let cursor = chatList.length - 1; cursor >= 0 && floors.length < settings.maxFloors; cursor -= 1) {
            const message = chatList[cursor];
            if (!message || typeof message.mes !== 'string' || !message.mes.trim()) continue;
            if (message.is_system === true) continue;
            floors.unshift({ role: message.is_user === true ? '玩家' : '角色', text: message.mes });
        }
        if (!floors.length) return { status: 'no_input' };
        // 世界书侧输入与决定通道同款：拿最近聊天（含最新玩家输入）去索引里匹配相关条目。
        const recentText = floors.map(floor => floor.text).join('\n');
        const hits = !sandboxModeActive() && settings.maxEntries > 0 && agentFactsIndex.stats().total > 0
            ? agentFactsIndex.matchTokens(recentText, { limit: settings.maxEntries, volume: currentVolumeForWorld() })
            : [];
        const bookLines = hits.map(hit => {
            const entry = agentFactsIndex.get(hit.uid);
            return entry ? `${entry.uid}|${entry.category}|${entry.name}|${entry.summary}` : null;
        }).filter(Boolean);
        const snapshot = agentMemoryRuntime.snapshot();
        const user = buildRecallUser({ snapshot, floors, worldbookLines: bookLines });
        const raw = await agentLlmClient.complete({
            label: '记忆召回',
            system: settings.recallPrompt,
            user,
            jsonSchema: RECALL_JSON_SCHEMA,
            overrides: settings.recallOverrides,
        });
        if (!continuation.current() || cacheKey !== memoryRecallCacheKey(chatList)) return { status: 'stale' };
        const decision = parseRecallDecision(raw, { snapshot });
        if (decision.status === 'invalid') {
            if (source === 'manual') setMemoryRecallStatus(`召回输出无法解析：${decision.error}`);
            return { status: 'invalid', error: decision.error };
        }
        const entries = recallEntriesFromIds(snapshot, decision.ids);
        memoryRecallCache = { key: cacheKey, ids: entries.map(entry => entry.id), note: decision.note };
        if (source === 'manual') {
            renderMemoryRecallResult({ ...memoryRecallCache });
            setMemoryRecallStatus(decision.status === 'empty' ? '召回完成：本轮没有需要召回的记忆。' : '召回完成。');
        }
        return { status: decision.status === 'empty' ? 'empty' : 'ok', ids: memoryRecallCache.ids, note: decision.note };
    } catch (error) {
        if (!continuation.current()) return { status: 'stale' };
        if (source === 'manual') setMemoryRecallStatus(`召回失败：${error?.message ?? error}`);
        return { status: 'failed', reason: String(error?.message ?? error) };
    } finally {
        if (memoryRecallRunning === continuation) memoryRecallRunning = false;
    }
}

// ---------- 记忆注入记录：面板「记忆注入」卡与悬浮球共用（仿原著资料的 lastInjection 模式） ----------

const MEMORY_INJECTION_SOURCE_LABELS = Object.freeze({ recall: '召回决定', keyword: '关键词兜底' });
let memoryLastInjectionRecord = null;

function memoryLastInjectionView() {
    return memoryLastInjectionRecord ? { ...memoryLastInjectionRecord } : null;
}

function recordMemoryLastInjection(record) {
    memoryLastInjectionRecord = record && typeof record === 'object' ? { ...record } : null;
    persistMemoryLastInjection();
}

/** 生成结束/关闭开关时通道被清空：记录保留但标「已清理」，别显示成还在提示词里。 */
function markMemoryLastInjectionCleared() {
    if (!memoryLastInjectionRecord || memoryLastInjectionRecord.cleared === true) return;
    memoryLastInjectionRecord = { ...memoryLastInjectionRecord, cleared: true };
    persistMemoryLastInjection();
}

function persistMemoryLastInjection() {
    try {
        if (!hostStorage?.chatState || !hostStorage?.saveChatState) return;
        const state = hostStorage.chatState();
        const value = state?.status === 'ready' && state.value && typeof state.value === 'object' ? { ...state.value } : {};
        value.memoryLastInjection = memoryLastInjectionRecord;
        Promise.resolve(hostStorage.saveChatState(value)).catch(() => { /* 存档失败不影响注入 */ });
    } catch { /* 存档失败不影响注入 */ }
}

/** 换聊天/启动恢复：内存里没有才恢复，恢复出的一律标「已清理」（注入容器必然已被酒馆重置）。 */
function hydrateMemoryLastInjection() {
    try {
        if (memoryLastInjectionRecord) return;
        const state = hostStorage?.chatState?.();
        const record = state?.status === 'ready' ? state.value?.memoryLastInjection : undefined;
        if (record && typeof record === 'object') memoryLastInjectionRecord = { ...record, cleared: true };
    } catch { /* 恢复失败就当没有记录 */ }
}

/** 生成前注入记忆存储：主路由召回决定挑选（用户输入之后跑，缓存内重 roll 不重复调用）；
 *  召回没跑/失败/关闭时退回关键词兜底——最近四楼正文（含最新玩家输入）整词比对"关联/别名"，
 *  跟数据库绿光条目一个思路。注入只读账本，不写任何统计；本轮实际注入的条目记进注入记录。 */
async function writeMemoryInjectionForPrompt({ chat = null } = {}) {
    const settings = memorySettings();
    const continuation = captureAgentContinuation();
    const sourceChat = Array.isArray(chat) ? chat : (getHostContext()?.chat ?? []);
    const captured = memoryRecallCacheKey(sourceChat);
    const current = () => continuation.current() && captured === memoryRecallCacheKey(sourceChat);
    if (!settings.enabled || !settings.inject) { agentMemoryPromptInjection.clear(); markMemoryLastInjectionCleared(); return { status: 'disabled' }; }
    const probe = agentMemoryPromptInjection.inspect();
    if (probe.status !== 'ready') return probe;
    // 关键词兜底的比对面：最近四楼正文（玩家+AI 都算，含最新玩家输入）。
    let sceneText = '';
    try {
        const list = Array.isArray(chat) ? chat : (Array.isArray(getHostContext()?.chat) ? getHostContext().chat : []);
        sceneText = list.slice(-4).map(message => (typeof message?.mes === 'string' ? message.mes : '')).join('\n');
    } catch { sceneText = ''; }
    // 主路：召回决定。模型明确说"没有要召回的"也算决定过（尊重结果，不再关键词兜底）。
    let recallNote = '';
    let pickedSource = null; // 'recall' | 'keyword'
    let picked = [];
    if (settings.recallEnabled && settings.recallAuto) {
        const recalled = await runMemoryRecall({ source: 'inject', chat });
        if (!current()) return { status: 'stale' };
        if (recalled.status === 'ok' || recalled.status === 'empty' || recalled.status === 'cached' || recalled.status === 'empty-cached') {
            pickedSource = 'recall';
            picked = recallEntriesFromIds(agentMemoryRuntime.snapshot(), recalled.ids);
            recallNote = recalled.note || '';
        }
    }
    if (!pickedSource) {
        pickedSource = 'keyword';
        picked = recallHits(agentMemoryRuntime.snapshot(), { sceneText });
    }
    if (!current()) return { status: 'stale' };
    // 决定式自动开启时指令指南不进正文提示词（决定模型另行调用），只注入召回结果保住正文一致性。
    const withGuide = !(settings.decideEnabled && settings.decideAuto);
    const guide = typeof currentSettings().memory?.guide === 'string' && currentSettings().memory.guide.trim()
        ? currentSettings().memory.guide.trim()
        : MEMORY_GUIDE;
    const header = recallNote ? `${MEMORY_HEADER}（召回员：${recallNote}）` : MEMORY_HEADER;
    const budget = settings.injectBudget + (withGuide ? 1200 : 0);
    const detail = renderMemoryEntriesDetail(picked, { maxChars: budget, prefix: `${header}\n`, suffix: withGuide ? `\n\n${guide}` : '' });
    if (!detail.text) {
        const cleared = agentMemoryPromptInjection.clear();
        recordMemoryLastInjection({ status: 'empty', source: pickedSource, note: recallNote, ids: [], entries: [], at: Date.now(), chars: 0, cleared: cleared?.status === 'cleared' });
        return { status: 'empty' };
    }
    const writeResult = agentMemoryPromptInjection.write({ text: detail.text }, { depth: injectionSettings().depth, maxChars: budget });
    const injected = writeResult?.status === 'injected';
    recordMemoryLastInjection({
        status: injected ? 'injected' : 'write_failed',
        source: pickedSource,
        note: recallNote,
        ids: injected ? detail.usedIds : [],
        entries: (injected ? detail.entries : []).map(entry => ({
            id: entry.id, title: entry.title ?? '', text: entry.text ?? '', tier: entry.tier, tag: entry.tag ?? '',
            day: entry.day, weight: entry.weight, quote: entry.quote ?? '', basis: entry.basis ?? '',
            related: Array.isArray(entry.related) ? entry.related : [], aliases: Array.isArray(entry.aliases) ? entry.aliases : [], note: entry.note ?? '',
        })),
        at: Date.now(),
        chars: injected ? writeResult.chars ?? detail.text.length : 0,
        cleared: false,
        reason: injected ? '' : writeResult?.reason ?? writeResult?.status ?? 'write_failed',
    });
    return writeResult;
}

/** 手动操作与面板操作共用：落账、存档、刷新页面；天数取世界时钟。 */
function applySelfOps(operations, context = {}) {
    const source = typeof context?.source === 'string' && context.source.trim() ? context.source.trim() : 'panel';
    const result = agentSelfRuntime.apply(operations, { source, day: worldDay() });
    if (result.applied.length) result.persistence = persistSelf();
    refreshSelfPage();
    // 卡面创建向导提交身份（source='cover'）＝本局初始化点：挂一次“创建后模型初始化”待办，
    // 首轮生成结束后强制跑一次纳戒决定（decideAuto 关着也跑），把身份书里的开局信息补成账。
    if (source === 'cover') markCreationInitPending();
    return result;
}

/* 创建后模型初始化待办：记一个聊天号，换聊天自动失效；决定成功一次即销。 */
let creationInitChatId = '';

function markCreationInitPending() {
    try {
        const context = getHostContext();
        const id = String(context?.chatId ?? context?.chatMetadata?.chat_id ?? '');
        if (id) creationInitChatId = id;
    } catch { /* 取不到聊天号就不挂待办 */ }
}

function creationInitPending() {
    if (!creationInitChatId) return false;
    try {
        const context = getHostContext();
        const id = String(context?.chatId ?? context?.chatMetadata?.chat_id ?? '');
        return !!id && id === creationInitChatId;
    } catch { return false; }
}

function clearCreationInitPending() {
    creationInitChatId = '';
}

/** 生成前把主角自身状态写进扩展提示词；与世界、影响、人物簿通道互不清空。
 *  纳戒指令指南已退役：申报走 MVU 变量通道（世界书条目），正文注入只带现状保住一致性。 */
function writeSelfInjectionForPrompt() {
    const settings = selfLedgerSettings();
    if (!settings.enabled || !settings.inject) { agentSelfPromptInjection.clear(); return { status: 'disabled' }; }
    const probe = agentSelfPromptInjection.inspect();
    if (probe.status !== 'ready') return probe;
    const body = buildSelfInjection(agentSelfRuntime.snapshot(), { maxChars: settings.injectBudget });
    if (!body) { agentSelfPromptInjection.clear(); return { status: 'empty' }; }
    return agentSelfPromptInjection.write({ text: `${SELF_HEADER}\n${body}` }, { depth: injectionSettings().depth, maxChars: settings.injectBudget });
}

/**
 * 生成结束：```self 指令块通道已退役（纳戒申报统一走 MVU 通道，避免双入口重复记账）。
 * 旧楼层或模型惯性残留的指令块只从正文剥掉（玩家看干净剧情），不再落账。
 */
function applySelfOpsFromLatestReply() {
    const context = getHostContext();
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    const index = lastReplyIndex(chat);
    if (index < 0) return { status: 'no_reply' };
    const found = extractSelfOpsBlock(chat[index].mes);
    if (!found) return { status: 'no_ops' };
    const cleaned = stripSelfOpsBlock(chat[index].mes);
    if (cleaned !== chat[index].mes) {
        chat[index].mes = cleaned;
        try {
            if (typeof context.updateMessageBlock === 'function') context.updateMessageBlock(index, chat[index]);
            else if (typeof context.renderMessage === 'function') context.renderMessage(index);
        } catch { /* 渲染失败时文本已更新，下次刷新生效 */ }
        try { context.saveChat?.(); } catch { /* 保存失败由宿主自动保存兜底 */ }
    }
    return { status: 'retired', stripped: true, floor: index + 1 };
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
    if (result.applied.length) result.persistence = persistMemory();
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
// 楼层防重：与世界/记忆决定同款——失败生成也会广播 GENERATION_ENDED，auto 只对没决定过的 AI 楼层跑一次。
let selfDecidedFloor = null;

/**
 * 纳戒决定（独立申报通道）：读聊天记录 + 世界书 + 纳戒现状 → 模型决定 → 脚本逐条
 * 校验执行 → 结果呈现到面板。独立通道模式（self.mvuChannel='independent'）下生成
 * 结束后自动跑；主回复若已带 MVU 申报块则由仲裁器兜底，不重复记账。
 */
async function runSelfDecision({ source = 'auto' } = {}) {
    const settings = selfLedgerSettings();
    if (!settings.enabled || !settings.decideEnabled) return { status: 'disabled' };
    if (selfDecideRunning) return { status: 'busy' };
    // 自定义连接有自己的地址和密钥，不依赖全局配置；跟随酒馆才需要先检查全局连接。
    if (settings.overrides.connection !== 'custom' && agentLlmClient.availableFor('tavern') !== true) {
        setSelfDecideStatus('模型连接未配置：先在“模型设置”页选好连接。');
        return { status: 'not_configured' };
    }
    const selfReplyFloor = lastReplyIndex(Array.isArray(getHostContext()?.chat) ? getHostContext().chat : []);
    if (source === 'auto') {
        if (selfReplyFloor < 0) return { status: 'no_reply' };
        if (selfDecidedFloor?.floor === selfReplyFloor && selfDecidedFloor.continuation.current()) return { status: 'already_decided' };
    }
    const continuation = captureAgentContinuation();
    selfDecideRunning = continuation;
    setSelfDecideStatus('模型正在决定纳戒变化……');
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
            ? agentFactsIndex.matchTokens(recentText, { limit: settings.maxEntries })
            : [];
        const bookLines = hits.map(hit => {
            const entry = agentFactsIndex.get(hit.uid);
            return entry ? `${entry.uid}|${entry.category}|${entry.name}|${entry.summary}` : null;
        }).filter(Boolean);
        const raw = await agentLlmClient.complete({
            label: '纳戒决定',
            system: settings.prompt,
            user: buildSelfDecideUser({ snapshot: agentSelfRuntime.snapshot(), floors, worldbookLines: bookLines }),
            jsonSchema: SELF_JSON_SCHEMA,
            overrides: settings.overrides,
        });
        if (!continuation.current()) return { status: 'stale' };
        const decision = parseSelfDecision(raw);
        if (decision.status === 'invalid') {
            setSelfDecideStatus(`决定无法解析：${decision.error ?? '输出不是约定的 JSON'}`);
            return { status: 'invalid', error: decision.error };
        }
        if (decision.status === 'empty' || !decision.ops.length) {
            agentSelfRuntime.note(decision.note || '本轮纳戒无变化', { source: 'decide' });
            setSelfDecideStatus(decision.note || '本轮纳戒无变化。');
            selfDecidedFloor = { floor: selfReplyFloor, continuation };
            persistSelf();
            return { status: 'empty', note: decision.note };
        }
        const result = agentSelfRuntime.apply(decision.ops, { source: 'decide', floor: selfReplyFloor, day: worldDay() });
        persistSelf();
        selfDecidedFloor = { floor: selfReplyFloor, continuation };
        const summary = [
            ...result.applied.map(item => item.summary),
            ...result.rejected.map(item => `拒绝：${item.op}（${item.reason}）`),
        ].join('；');
        setSelfDecideStatus(`${decision.note || '纳戒已更新'}${summary ? `\n${summary}` : ''}`);
        refreshSelfPage();
        return { status: result.status, applied: result.applied.length, rejected: result.rejected.length, note: decision.note };
    } catch (error) {
        if (!continuation.current()) return { status: 'stale' };
        setSelfDecideStatus(`纳戒决定失败：${String(error?.message ?? error).slice(0, 160)}`);
        return { status: 'error', reason: String(error?.message ?? error) };
    } finally {
        if (selfDecideRunning === continuation) selfDecideRunning = false;
    }
}

// —— 申报通道切换：独立模式要把世界书里的两条申报教学条目停用，正文才会干净 ——

const MVU_DECLARATION_COMMENTS = Object.freeze(['[mvu_update]变量输出格式', '[mvu_update]变量更新规则']);

/** 能力探测：酒馆助手的父窗口就带全套世界书 API（getWorldbookNames/getWorldbook/updateWorldbookWith）；拿不到就降级为手动开关。 */
function tavernWorldbookApi() {
    const th = typeof window !== 'undefined' ? window.TavernHelper : null;
    if (th && typeof th.getWorldbookNames === 'function' && typeof th.getWorldbook === 'function' && typeof th.updateWorldbookWith === 'function') return th;
    return null;
}

async function setMvuDeclarationEntries(enable) {
    try {
        const th = tavernWorldbookApi();
        if (!th) return { status: 'unavailable' };
        const names = th.getWorldbookNames() ?? [];
        for (const name of names) {
            let entries;
            try { entries = await th.getWorldbook(name); } catch { continue; }
            if (!Array.isArray(entries)) continue;
            const matched = entries.some(entry => MVU_DECLARATION_COMMENTS.some(comment => (entry.name || '').includes(comment)));
            if (!matched) continue;
            // 只改目标条目的 enabled，其余原样交回（TH 按部分深合并写回）
            await th.updateWorldbookWith(name, current => (Array.isArray(current) ? current : entries).map(entry => {
                if (!MVU_DECLARATION_COMMENTS.some(comment => (entry.name || '').includes(comment))) return entry;
                return { ...entry, enabled: enable === true };
            }));
            return { status: 'ok', world: name };
        }
        return { status: 'not_found' };
    } catch (error) {
        return { status: 'error', reason: String(error?.message ?? error).slice(0, 160) };
    }
}

/** 通道切换：改设置 + 同步世界书条目启停；失败不阻断（独立模式有正文块兜底）。 */
async function setSelfMvuChannel(channel) {
    const value = channel === 'independent' ? 'independent' : 'inline';
    hostStorage.updateSettings({ self: { mvuChannel: value } });
    try { hostStorage.saveSettings(); } catch { /* 保存失败下次启动还会应用 */ }
    const result = await setMvuDeclarationEntries(value === 'inline');
    if (result.status === 'ok') {
        toastr.info(`纳戒申报通道已切换为${value === 'inline' ? '跟正文申报' : '独立调用'}（世界书申报条目已${value === 'inline' ? '启用' : '停用'}）`);
    } else if (value === 'independent') {
        toastr.warning('已切到独立调用，但世界书申报条目未能自动停用——正文可能仍带申报块（会自动兜底，不会重复记账）。可手动停用「[mvu_update]变量输出格式/更新规则」两条。');
    }
    return result;
}

/** 手动登记清单条目：按页签读对应的表单输入，拼成与模型指令同构的操作。 */
async function selfCreateFromPanel(panel, list) {
    const values = {};
    for (const input of panel.querySelectorAll(`[data-self-new^="${list}."]`)) {
        values[input.dataset.selfNew.split('.').pop()] = typeof input.value === 'string' ? input.value.trim() : '';
    }
    let op = null;
    if (list === 'techniques') op = { op: 'addTechnique', name: values.name, grade: values.grade, type: values.type, progress: values.progress, source: values.source };
    if (list === 'skills') op = { op: 'addSkill', name: values.name, grade: values.grade, type: values.type, progress: values.progress, source: values.source };
    if (list === 'equipment') op = { op: 'addEquipment', name: values.name, grade: values.grade, type: values.type, source: values.source };
    if (list === 'treasures') op = { op: 'addTreasure', name: values.name, grade: values.grade, type: values.type, source: values.source };
    if (list === 'items') {
        const count = Number(values.count);
        op = { op: 'addItem', name: values.name, category: values.category, grade: values.grade, ...(Number.isInteger(count) && count > 0 ? { count } : {}) };
    }
    if (list === 'recipes') op = { op: 'addRecipe', name: values.name, craft: values.craft, grade: values.grade, materials: values.materials };
    if (list === 'goals') op = { op: 'addGoal', title: values.title, text: values.text, priority: values.priority === '主线' ? '主线' : '支线', due: values.due };
    if (!op) return;
    const result = await panelMutation(panel, [op], applySelfOps, persistSelf, setSelfStatus);
    if (result.applied.length) {
        for (const input of panel.querySelectorAll(`[data-self-new^="${list}."]`)) input.value = '';
        setSelfStatus(result.applied[0].summary + '。');
        closeAgentModal(panel);
    } else {
        setSelfStatus(`未生效：${result.rejected[0]?.reason ?? '无变化'}`);
    }
}

/** 手动开工炼制：名称必填，天数可选。 */
async function selfStartCraftFromPanel(panel) {
    const values = {};
    for (const input of panel.querySelectorAll('[data-self-new^="crafts."]')) {
        values[input.dataset.selfNew.split('.').pop()] = typeof input.value === 'string' ? input.value.trim() : '';
    }
    if (!values.name) { setSelfStatus('先写炼制什么再开工。'); return; }
    const count = Number(values.count);
    const days = Number(values.days);
    const operations = [{
        op: 'startCraft',
        name: values.name,
        craft: values.craft || '炼药',
        ...(Number.isInteger(count) && count > 0 ? { count } : {}),
        ...(Number.isInteger(days) && days > 0 ? { days } : {}),
        note: values.note,
    }];
    const result = await panelMutation(panel, operations, applySelfOps, persistSelf, setSelfStatus);
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
    const key = { techniques: 'techniques', skills: 'skills', equipment: 'equipment', treasures: 'treasures', items: 'items', recipes: 'recipes', crafts: 'crafts', goals: 'goals' }[list];
    const entry = snapshot[key]?.find(item => item.id === id);
    if (!entry) { setSelfStatus('这条已经不在纳戒里了，刷新一下。'); return; }
    const labels = {
        name: '名称', grade: '品级', type: '类型', progress: '进度', source: '来源', note: '备注',
        category: '类别', count: '数量', equipped: '装备中', materials: '材料', craft: '工艺',
        status: '状态', startDay: '开工天', endDay: '预计完工', done: '已达成', priority: '优先级', due: '期限', text: '目标', title: '短标题',
    };
    const page = makeElement('div', 'dai-profile');
    const head = makeElement('div', 'dai-profile-head');
    const kindLabel = { techniques: '功法', skills: '斗技', equipment: '装备', treasures: '天材地宝', items: '行囊', recipes: '炼丹', crafts: '炼器', goals: '目标' }[list] ?? list;
    const displayName = list === 'goals' ? (entry.title || entry.text) : entry.name;
    head.append(makeElement('b', 'dai-profile-name', `${kindLabel} · ${displayName}`));
    page.append(head);
    const rowsOf = {
        techniques: [['name'], ['grade'], ['type'], ['progress'], ['source'], ['note'], ['id', '编号']],
        skills: [['name'], ['grade'], ['type'], ['progress'], ['source'], ['note'], ['id', '编号']],
        equipment: [['name'], ['grade'], ['type'], ['source'], ['note'], ['id', '编号']],
        treasures: [['name'], ['grade'], ['type'], ['source'], ['note'], ['id', '编号']],
        items: [['name'], ['category'], ['grade'], ['count'], ['equipped'], ['source'], ['note'], ['id', '编号']],
        recipes: [['name'], ['craft'], ['grade'], ['materials'], ['note'], ['id', '编号']],
        crafts: [['name'], ['craft'], ['count'], ['status'], ['startDay'], ['endDay'], ['note'], ['id', '编号']],
        goals: [['title', '短标题'], ['text', '完整内容'], ['priority'], ['due'], ['done'], ['source'], ['note'], ['id', '编号']],
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
    } else if (list === 'equipment') {
        const unequip = selfActionButton('卸下进行囊', { selfUnequip: entry.id });
        unequip.dataset.modalAfter = 'close';
        const removeGear = selfActionButton('移除', { selfRemove: `equipment:${entry.id}` });
        removeGear.dataset.modalAfter = 'close';
        actions.append(unequip, removeGear);
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
    if (list === 'equipment') {
        const entries = snapshot.equipment;
        container.replaceChildren(...(entries.length ? entries.map(entry => {
            const unequip = selfActionButton('卸下', { selfUnequip: entry.id });
            unequip.dataset.modalAfter = 'close';
            return selfEntryRow({
                list,
                id: entry.id,
                label: entry.name,
                badges: [entry.grade, entry.type].filter(Boolean),
                detail: [entry.source, entry.note].filter(Boolean).join(' · '),
                actions: [unequip],
            });
        }) : [makeElement('p', 'dai-turn-result', '还没有穿戴任何装备。剧情里穿上武器防具、模型替你记账后都会出现在这里。')]));
        return;
    }
    if (list === 'treasures') {
        const entries = snapshot.treasures;
        container.replaceChildren(...(entries.length ? entries.map(entry => selfEntryRow({
            list,
            id: entry.id,
            label: entry.name,
            badges: [entry.grade, entry.type].filter(Boolean),
            detail: [entry.source, entry.note].filter(Boolean).join(' · '),
        })) : [makeElement('p', 'dai-turn-result', '还没有天材地宝。异火、妖丹、灵矿这类天地奇物，剧情里获得后由模型记账归入此栏。')]));
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
        })) : [makeElement('p', 'dai-turn-result', '还没有掌握丹方。')]));
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
        }) : [makeElement('p', 'dai-turn-result', '还没有炼器记录。')]));
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
                label: `${entry.done ? '[已达成] ' : entry.priority === '主线' ? '★ ' : '· '}${entry.title || entry.text}`,
                badges: [entry.due].filter(Boolean),
                detail: [entry.title && entry.text && entry.title !== entry.text ? entry.text : '', entry.source, entry.note].filter(Boolean).join(' · '),
                actions,
            });
        }) : [makeElement('p', 'dai-turn-result', '还没有立下目标。')]));
    }
}

/** 纳戒页整页刷新：主角面板（固定标签）、各清单、流水与编辑表单。 */
// —— 装备人形图：身体各部位就是装备槽，穿戴中的装备按类型挂到对应位置 ——

const BODY_FIGURE_SLOTS = Object.freeze([
    { id: 'head', label: '头部', icon: '👑', match: type => /盔|冠|帽|簪|头巾|面巾|面纱/.test(type) },
    { id: 'accessory', label: '饰品', icon: '📿', match: type => /项链|坠|挂件|佩|饰品/.test(type) },
    { id: 'body', label: '身体', icon: '👘', match: type => /防具|甲|袍|衣|衫|裙|服/.test(type) },
    { id: 'hands', label: '手部', icon: '🧤', match: type => /手套|护腕|手环|臂环|戒指/.test(type) },
    { id: 'waist', label: '腰部', icon: '🎒', match: type => /腰带|腰囊|储物袋/.test(type) },
    { id: 'feet', label: '足部', icon: '👢', match: type => /靴|鞋|足具/.test(type) },
    { id: 'weapon', label: '武器', icon: '⚔️', match: type => /武器/.test(type) },
]);

function bodyFigureSlotOf(item) {
    const type = String(item.type || item.category || '');
    return BODY_FIGURE_SLOTS.find(slot => slot.match(type));
}

/** 品级 → 槽位左缘配色：天阶金、地阶紫、玄阶蓝、黄阶翠、其余带“品”的走灰。 */
function figureGradeClass(grade) {
    const text = String(grade ?? '');
    if (/天阶|天品|帝品|圣品/.test(text)) return 'is-gold';
    if (/地阶|地品|灵器|宝器/.test(text)) return 'is-violet';
    if (/玄阶|玄品/.test(text)) return 'is-azure';
    if (/黄阶|黄品/.test(text)) return 'is-jade';
    if (text.includes('品')) return 'is-dull';
    return '';
}

/** 装备 → 身形槽位图：不画人形，格子就按人身上的位置摆——头在上、身体居中（胸甲位）、
    饰品/武器在肩侧、手/腰在侧下、足在最底；穿戴中的装备名称直接写进对应部位的格子。 */
function renderEquipmentFigure(equipped, { compact = false, onOpen, onEquip } = {}) {
    const bySlot = new Map();
    const loose = [];
    for (const item of Array.isArray(equipped) ? equipped : []) {
        if (!item || typeof item !== 'object') continue;
        const slot = bodyFigureSlotOf(item);
        if (!slot) { loose.push(item); continue; }
        if (!bySlot.has(slot.id)) bySlot.set(slot.id, []);
        bySlot.get(slot.id).push(item);
    }
    const wrap = makeElement('div', `dai-body-figure${compact ? ' dai-body-figure--compact' : ''}`);
    const grid = makeElement('div', 'dai-body-slots');
    const slotCell = (slot, col, row) => {
        const items = bySlot.get(slot.id) ?? [];
        const grade = items.length ? figureGradeClass(items[0].grade) : '';
        const cell = makeElement('div', `dai-body-slot${items.length ? '' : ' is-empty'}${grade ? ` ${grade}` : ''}`);
        cell.dataset.slot = slot.id;
        cell.style.gridColumn = String(col);
        cell.style.gridRow = String(row);
        cell.append(makeElement('small', 'dai-body-slot__label', `${slot.icon} ${slot.label}`));
        if (!items.length) {
            if (onEquip) {
                const add = makeElement('button', 'dai-body-slot__name dai-body-slot__add', '＋ 装备');
                add.type = 'button';
                add.title = `从行囊挑一件${slot.label}穿上`;
                add.addEventListener('click', () => onEquip(slot));
                cell.append(add);
            } else {
                cell.append(makeElement('span', 'dai-body-slot__name', '—'));
            }
            return cell;
        }
        const names = makeElement('span', 'dai-body-slot__items');
        items.forEach(item => {
            // 设置页可点开详情；悬浮球副窗纯展示。
            const name = makeElement(onOpen ? 'button' : 'b', 'dai-body-slot__name', item.name);
            if (onOpen) {
                name.type = 'button';
                name.title = [item.grade, item.type].filter(Boolean).join('·') || item.name;
                name.addEventListener('click', () => onOpen(item));
            }
            names.append(name);
        });
        cell.append(names);
        return cell;
    };
    const slotOf = id => BODY_FIGURE_SLOTS.find(s => s.id === id);
    // 头在上；饰品/身体/武器一排（身体居中＝穿在人身上）；手/腰一排；足在最下。
    grid.append(
        slotCell(slotOf('head'), 2, 1),
        slotCell(slotOf('accessory'), 1, 2),
        slotCell(slotOf('body'), 2, 2),
        slotCell(slotOf('weapon'), 3, 2),
        slotCell(slotOf('hands'), 1, 3),
        slotCell(slotOf('waist'), 2, 3),
        slotCell(slotOf('feet'), 2, 4),
    );
    wrap.append(grid);
    const foot = makeElement('div', 'dai-body-figure__foot');
    const labeled = equipped.filter(item => item && typeof item === 'object');
    foot.textContent = labeled.length
        ? `穿戴中 ${labeled.length} 件${loose.length ? `（另有 ${loose.length} 件类型未定位，列表里看）` : ''}`
        : '还没有穿戴任何装备。';
    wrap.append(foot);
    return wrap;
}

/** 空槽位 → 从行囊挑一件能穿到这个部位的备用装备（类别对口：武器/防具/饰品）。 */
function openSelfEquipPicker(panel, slot) {
    const snapshot = agentSelfRuntime.snapshot();
    const matching = snapshot.items.filter(item => item.equipped !== true)
        .filter(item => ({ '武器': 'weapon', '防具': 'body', '饰品': 'accessory' })[String(item.category ?? '')] === slot.id);
    const page = makeElement('div', 'dai-setting-grid');
    page.append(makeElement('p', 'dai-turn-result', matching.length
        ? `从行囊挑一件穿到「${slot.label}」：`
        : `行囊里没有能穿到「${slot.label}」的备用装备——先在「行囊」页签登记，或在剧情里拿到后再来。`));
    for (const item of matching) {
        const equip = selfActionButton('装备', { selfEquip: item.id });
        equip.dataset.modalAfter = 'close';
        page.append(selfEntryRow({
            list: 'items',
            id: item.id,
            label: item.name,
            badges: [`×${item.count}`, item.grade].filter(Boolean),
            detail: [item.category, item.note].filter(Boolean).join(' · '),
            actions: [equip],
        }));
    }
    openAgentModal(panel, `装备 · ${slot.label}`, page);
}

/** 设置页装备页签的槽位图：点装备名开详情弹窗。 */
function renderSelfBodyFigure(container, snapshot) {
    if (!container) return;
    const panel = container.closest('[data-settings-section="self"]')?.closest(`#${SETTINGS_PANEL_ID}`)
        ?? (typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null);
    const equipped = [
        ...(Array.isArray(snapshot?.equipment) ? snapshot.equipment : []),
        ...(Array.isArray(snapshot?.items) ? snapshot.items : []).filter(item => item.equipped === true),
    ];
    const figure = renderEquipmentFigure(equipped, {
        onOpen: item => openSelfDetailModal(panel, 'equipment', item.id),
        onEquip: slot => openSelfEquipPicker(panel, slot),
    });
    container.replaceChildren(figure);
}

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
            `装备 ${status.equipment}`,
            `天材地宝 ${status.treasures}`,
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
    for (const key of ['techniques', 'skills', 'equipment', 'treasures', 'items', 'recipes', 'crafts', 'goals']) {
        renderSelfEntryList(section.querySelector(`[data-self-list="${key}"]`), key);
    }
    renderSelfBodyFigure(section.querySelector('[data-self-figure]'), snapshot);
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

/** 方案覆盖 → impact 模型计划的一路：形状与手动计划一致，附加参数（extraBody/excludeBody/headers）一并带上。 */
function impactPlanFromPreset(bound) {
    return {
        connection: 'custom',
        model: bound.custom?.model || '',
        baseUrl: bound.custom?.baseUrl || '',
        apiKey: bound.custom?.apiKey || '',
        provider: bound.custom?.provider || '',
        temperature: bound.temperature,
        maxTokens: bound.maxTokens,
        topP: bound.topP,
        presencePenalty: bound.presencePenalty,
        frequencyPenalty: bound.frequencyPenalty,
        extraBody: bound.extraBody,
        excludeBody: bound.excludeBody,
        headers: bound.headers,
    };
}

/** 影响决定/场记挑选两处 complete 调用的附加参数透传：方案没带就是空对象，spread 无痕。 */
function planExtras(role) {
    const extras = {};
    if (role?.extraBody) extras.extraBody = role.extraBody;
    if (Array.isArray(role?.excludeBody) && role.excludeBody.length) extras.excludeBody = role.excludeBody;
    if (role?.headers) extras.headers = role.headers;
    return extras;
}

/** 记录员与场记各自用哪套连接和生成参数：绑定了 API设置方案整套走方案；
 *  场记没绑就完全跟着记录员（原来“一个模型干两件事”的语义，用不绑场记方案表达）。 */
function impactModelPlan(settings) {
    const boundDecide = presetOverrides('impactDecide');
    const decide = boundDecide ? impactPlanFromPreset(boundDecide) : {
        connection: 'tavern',
        model: '',
        baseUrl: '',
        apiKey: '',
        provider: '',
        temperature: undefined,
        maxTokens: undefined,
        topP: undefined,
        presencePenalty: undefined,
        frequencyPenalty: undefined,
    };
    const boundInject = presetOverrides('impactInject');
    const inject = boundInject ? impactPlanFromPreset(boundInject) : decide;
    return { decide, inject };
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
    const result = agentImpactRuntime.reset();
    if (record?.status === 'ready' && record.value) return agentImpactRuntime.restore(record.value);
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

/** 建档先照世界书：用这一轮正文去索引里匹配相关条目，只给编号|类别|标题|摘要，不铺全文。
 *  沙盒口径不用世界书：NPC 常识交给模型自身知识与内置沙盒世界基线。 */
function npcLedgerBookLines(floors) {
    try {
        if (sandboxModeActive() || agentFactsIndex.stats().total <= 0) return [];
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

/** 记录员/抄录员/精简共用的调用参数构造：group 决定绑哪张连接卡，任务级温度/上限补丁叠在方案之上。 */
function npcLedgerOverrides(settings, patch = {}, group = 'npcLedger') {
    // 绑定了 API设置方案整套走方案；档案抄录/经历精简的任务级温度/上限补丁仍叠在方案之上。
    // 没绑＝跟随酒馆主连接（采样参数不指定，沿用酒馆/全局；任务级补丁照给）。
    const bound = presetOverrides(group);
    if (bound) {
        return {
            ...bound,
            temperature: patch.temperature ?? bound.temperature,
            maxTokens: patch.maxTokens ?? bound.maxTokens,
        };
    }
    return {
        connection: 'tavern',
        temperature: patch.temperature,
        maxTokens: patch.maxTokens,
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
    const overrides = npcLedgerOverrides(settings, { temperature: 0.2, maxTokens: 1200 }, 'npcExtract');
    // 同记录员：自定义连接不查全局，自己的地址/模型填了就能跑。
    if (overrides.connection !== 'custom' && agentLlmClient.availableFor('tavern') !== true) {
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
    const continuation = captureAgentContinuation();
    npcRecordRunning = continuation;
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
                    label: '档案抄录',
                    system: NPC_EXTRACT_PROMPT,
                    user: buildNpcExtractUser({
                        record: { ...record, missing: agentNpcLedger.missing(record) },
                        entries,
                        day: worldDay(),
                    }),
                    jsonSchema: NPC_RECORD_JSON_SCHEMA,
                    overrides,
                });
                if (!continuation.current()) return { status: 'stale' };
                const parsed = parseNpcRecordReply(raw);
                if (parsed.status !== 'ok' || !parsed.patches.length) { failed.push(record.name); continue; }
                const allowed = new Set(NPC_FIELDS.filter(field => !NPC_EXTRACT_PROTECTED.has(field.label)).map(field => field.key));
                const patches = parsed.patches.map(patch => {
                    const normalized = normalizePatch(patch, { source: '世界书' });
                    const fields = Object.fromEntries(Object.entries(normalized.fields).filter(([key]) => allowed.has(key)));
                    return { 姓名: record.name, fields };
                });
                const result = agentNpcLedger.apply(
                    { 人物: patches },
                    { floor: null, day: worldDay(), source: '世界书', fillEmpty: !overwrite },
                );
                if (result.changed) filled += 1;
            } catch (error) {
                if (!continuation.current()) return { status: 'stale' };
                failed.push(`${record.name}（${error?.message ?? error}）`);
            }
        }
        if (filled) persistNpcLedger();
    } finally {
        if (npcRecordRunning === continuation) npcRecordRunning = false;
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
        // 绑定了 API设置方案＝自定义连接（守卫只认 connection，方案里自带地址密钥模型）；没绑＝跟随酒馆。
        connection: presetOverrides('npcLedger') ? 'custom' : 'tavern',
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
let lastNpcLedgerReplyIdentity = null;
let lastNpcLedgerStatus = '还没有记账。生成结束后，人物记录员会把这一轮的人物变化写进档案。';
let lastNpcLedgerInjection = null;
let npcLedgerShown = 60;
/** 主界面“本局人物”只铺最近活动的几个人，更多进人物总簿弹窗。 */
const NPC_LEDGER_RECENT_COUNT = 8;
let npcRecordRunning = false;

/** 人物簿跟着聊天走：换聊天读那一份，读不到就按空簿开局。 */
function restoreNpcLedgerFromChat() {
    lastNpcLedgerInjection = null;
    lastNpcLedgerFloor = -1;
    lastNpcLedgerReplyIdentity = null;
    const record = hostStorage?.npcLedgerState?.();
    if (record?.status === 'ready' && record.value) {
        const result = agentNpcLedger.load(record.value);
        lastNpcLedgerFloor = Number.isInteger(record.value.lastFloor) ? record.value.lastFloor : -1;
        lastNpcLedgerReplyIdentity = typeof record.value.lastReplyIdentity === 'string' ? record.value.lastReplyIdentity : null;
        return result;
    }
    return agentNpcLedger.load({ records: [] });
}

function persistNpcLedger() {
    const snapshot = { ...agentNpcLedger.exportAll(), lastFloor: lastNpcLedgerFloor, lastReplyIdentity: lastNpcLedgerReplyIdentity };
    return Promise.resolve(hostStorage?.saveNpcLedgerState?.(snapshot) ?? { status: 'unavailable' })
        .catch(error => ({ status: 'failed', reason: String(error?.message ?? error) }));
}

function restoreNpcColdFromChat() {
    const record = hostStorage?.npcColdState?.();
    if (record?.status === 'ready' && record.value) return agentNpcColdRuntime.restore(record.value);
    return agentNpcColdRuntime.reset();
}

function persistNpcCold() {
    return Promise.resolve(hostStorage?.saveNpcColdState?.(agentNpcColdRuntime.snapshot()) ?? { status: 'unavailable' })
        .catch(error => ({ status: 'failed', reason: String(error?.message ?? error) }));
}

function npcColdSettings() {
    const settings = currentSettings();
    const npc = settings.npc ?? {};
    return {
        enabled: settings.enableNpcLedger !== false,
        // 绑定了 API设置方案＝自定义连接（守卫只认 connection，方案里自带地址密钥模型）；没绑＝跟随酒馆。
        connection: presetOverrides('npcCold') ? 'custom' : 'tavern',
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
    // 绑定了 API设置方案整套走方案；没绑＝跟随酒馆主连接。
    return presetOverrides('npcCold') ?? { connection: 'tavern' };
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
    if (settings.connection !== 'custom' && agentLlmClient.availableFor('tavern') !== true) {
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
    const continuation = captureAgentContinuation();
    npcColdRunning = continuation;
    setNpcLedgerStatus(`正在为 ${candidates.length} 个冷藏人物准备推进草稿……`);
    const previews = [];
    const failed = [];
    try {
        for (const candidate of candidates) {
            try {
                const raw = await agentLlmClient.complete({
                    label: '冷藏推进',
                    system: settings.prompt,
                    user: buildNpcColdUser({ record: candidate.record, fromDay: candidate.fromDay, toDay: candidate.toDay, events: candidate.events, floors: candidate.floors }),
                    jsonSchema: NPC_RECORD_JSON_SCHEMA,
                    overrides: npcColdOverrides(settings),
                });
                if (!continuation.current()) return { status: 'stale' };
                const parsed = parseNpcRecordReply(raw);
                if (parsed.status !== 'ok') { failed.push(candidate.name); continue; }
                const patches = parsed.patches.filter(item => item && typeof item === 'object').map(item => ({ ...item, 姓名: candidate.name }));
                const preview = { ...candidate, patch: { 人物: patches } };
                agentNpcColdRuntime.rememberPreview({ id: candidate.id, name: candidate.name, fromDay: candidate.fromDay, toDay: candidate.toDay, previousDay: candidate.previousDay, baseVersion: candidate.record.version, eventIds: candidate.eventIds, patch: preview.patch });
                previews.push(preview);
            } catch (error) {
                if (!continuation.current()) return { status: 'stale' };
                failed.push(`${candidate.name}（${error?.message ?? error}）`);
            }
        }
        persistNpcCold();
    } finally {
        if (npcColdRunning === continuation) npcColdRunning = false;
    }
    setNpcLedgerStatus(`冷藏草稿已生成 ${previews.length} 份${failed.length ? `；失败 ${failed.join('、')}` : ''}。请逐份确认后才会写回人物簿。`);
    refreshNpcLedgerPage();
    return { status: 'previewed', previews, failed };
}

function confirmNpcColdPreview(id) {
    const wanted = String(id || '').trim();
    const preview = agentNpcColdRuntime.status().previews.find(item => item.id === wanted && item.status === 'pending');
    if (!preview) return { status: 'not_found' };
    const validation = agentNpcColdRuntime.validatePreview(wanted, { recordVersion: agentNpcLedger.get(preview.name)?.version });
    if (validation.status !== 'ready') return validation;
    const patch = preview.patch && typeof preview.patch === 'object' ? preview.patch : { 人物: [] };
    // 流水逐条带 src:'冷藏'——档案流水页和不在场活动名单靠它区分“自行活动”与“正文记录”。
    const result = applyNpcLedgerPayload(patch, { source: '冷藏推进', floor: lastReplyIndex(getHostContext()?.chat || []), logSrc: '冷藏' });
    if (!['applied', 'ignored', 'empty'].includes(result.status)) return { status: 'failed', result };
    agentNpcColdRuntime.mark(preview.name, { previewId: wanted, day: preview.toDay, eventIds: preview.eventIds, floor: lastReplyIndex(getHostContext()?.chat || []), status: 'confirmed' });
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

/** 文件导入整簿：读文件期间可能已经切了聊天——先抓所有权，回来时聊天变了就整单作废，绝不写进新聊天。 */
async function importNpcLedgerFile(file, panel) {
    if (!file) return { status: 'no_file' };
    const continuation = captureAgentContinuation();
    try {
        const parsed = JSON.parse(await file.text());
        if (!continuation.current()) { setNpcLedgerStatus('已经切换聊天，这次导入没有生效。'); return { status: 'stale' }; }
        const records = Array.isArray(parsed?.records) ? parsed.records : (Array.isArray(parsed) ? parsed : null);
        if (!records) { setNpcLedgerStatus('这个文件里没有人物簿：要用「导出全簿」得到的那份 JSON。'); return { status: 'invalid' }; }
        const result = agentNpcLedger.load({ records });
        lastNpcLedgerFloor = -1;
        lastNpcLedgerReplyIdentity = null;
        persistNpcLedger();
        setNpcLedgerStatus(`导入了 ${result.total} 人${result.skipped ? `，${result.skipped} 条读不懂跳过` : ''}；下一轮就按新档案注入。`);
        refreshNpcLedgerPage(panel);
        return { status: 'imported', result };
    } catch (error) {
        if (!continuation.current()) { setNpcLedgerStatus('已经切换聊天，这次导入没有生效。'); return { status: 'stale' }; }
        setNpcLedgerStatus(`导入失败：${error?.message ?? error}`);
        return { status: 'failed', reason: String(error?.message ?? error) };
    }
}

/** 把“这条补丁”记进人物簿：面板手动记账和模型补丁走同一个入口。 */
function applyNpcLedgerPayload(payload, { source = '手动', floor = null, logSrc = null } = {}) {
    // logSrc（'冷藏'＝冷藏推进的自行活动）必须原样带到 ledger.apply，流水标签和 coldTouch 盖章都靠它。
    const result = agentNpcLedger.apply(payload, { floor, day: worldDay(), source, logSrc });
    if (result.status !== 'applied' && result.status !== 'ignored' && result.status !== 'empty') return result;
    if (result.created.length || result.changed) result.persistence = persistNpcLedger();
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
    // 同楼重生成不算“已记过”：正文或 swipe 变了就要先撤回上一份贡献再重记；一字未变才跳过。
    const replyIdentity = JSON.stringify([chat[index]?.mes, chat[index]?.swipe_id]);
    if (source === 'auto' && lastRecorded >= 0) {
        if (index > lastRecorded && index - lastRecorded < settings.every) return { status: 'not_due' };
        if (index === lastRecorded && lastNpcLedgerReplyIdentity === replyIdentity) return { status: 'not_due' };
    }
    // 连接检查只看“跟随酒馆”这条路：记录员选了自定义时，全局连接配没配与它无关，
    // 拿全局 configured() 拦人会把“自己卡配好了、全局空着”的合法配置挡在门外。
    if (settings.connection !== 'custom' && agentLlmClient.availableFor('tavern') !== true) {
        setNpcLedgerStatus('还没配好模型连接：先在“模型设置”页选好连接，人物记录员才能跑。');
        return { status: 'not_configured' };
    }
    const continuation = captureAgentContinuation();
    npcRecordRunning = continuation;
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
            label: '人物记录',
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
        if (!continuation.current()) return { status: 'stale' };
        const parsed = parseNpcRecordReply(raw);
        if (parsed.status === 'invalid') {
            setNpcLedgerStatus(`记录员这次的输出读不懂，档案没动：${parsed.reason}`);
            return { status: 'invalid', reason: parsed.reason };
        }
        if (parsed.status === 'empty') {
            // 重roll成“没有人物变化”也要先撤回上一份贡献；有手动改动挡住时保留原账并明说。
            if (source === 'auto' && lastRecorded >= 0 && index <= lastRecorded) {
                const replaced = agentNpcLedger.recordReply([], { source: '正文', floor: index, day: worldDay(), replay: true });
                if (replaced.status === 'replay_conflict') {
                    setNpcLedgerStatus('这一楼已有手动改动，旧人物贡献保留，未自动清空。');
                    return { status: 'replay_conflict', reason: replaced.reason };
                }
                if (!['applied', 'empty'].includes(replaced.status)) {
                    setNpcLedgerStatus('这一楼的上一份人物贡献没有可靠基线可撤回，已保留；如需修正请用手动记账。');
                }
            }
            lastNpcLedgerFloor = index;
            lastNpcLedgerReplyIdentity = replyIdentity;
            persistNpcLedger();
            setNpcLedgerStatus('这一轮没有人物变化。');
            return { status: 'empty' };
        }
        const replay = source === 'auto' && lastRecorded >= 0 && index <= lastRecorded;
        const result = agentNpcLedger.recordReply(parsed.patches, { source: '正文', floor: index, day: worldDay(), replay });
        if (!['applied', 'ignored', 'empty'].includes(result.status)) {
            setNpcLedgerStatus(`这一轮的人物变化没有落账：${result.reason ?? result.status}`);
            return { status: result.status, reason: result.reason };
        }
        lastNpcLedgerFloor = index;
        lastNpcLedgerReplyIdentity = replyIdentity;
        persistNpcLedger();        const words = [];
        if (result.created.length) words.push(`新进 ${result.created.length} 人（${result.created.join('、')}）`);
        if (result.changed) words.push(`更新 ${result.changed} 人`);
        if (result.skipped?.length) words.push(`跳过 ${result.skipped.length} 条`);
        setNpcLedgerStatus(words.length ? `第 ${index + 1} 楼记完：${words.join('，')}。` : '这一轮没有人物变化。');
        try { refreshNpcLedgerPage(); } catch { /* 面板没开时忽略 */ }
        if (result.created?.length) {
            // 新建的人自动按世界书补全一次（只填空字段；填满或没条目自然收手，之后不再拉该人物的条目）。
            setTimeout(() => { if (continuation.current()) void runNpcLedgerExtract({ names: result.created.slice(0, 4) }); }, 1500);
        }
        return { status: 'applied', result };
    } catch (error) {
        if (!continuation.current()) return { status: 'stale' };
        const message = error?.code === 'llm_custom_not_configured'
            ? '记录员设成了“自定义模型”，但接口地址或模型名还没填全（填在“人物簿 → 记录员参数”里，或改回跟随酒馆）。'
            : `记账失败：${error?.message ?? error}`;
        setNpcLedgerStatus(message);
        return { status: 'failed', reason: String(error?.message ?? error) };
    } finally {
        if (npcRecordRunning === continuation) npcRecordRunning = false;
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

/** 人物簿一行卡：圆点 + 名字 + 一行摘要（截断）+ 好感；行尾在场/重要/冷藏三个小图标横排。 */
function npcLedgerCardRow(record, injected) {
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
    const meta = makeElement('span', 'dai-npc-card-line is-muted');
    meta.textContent = [
        record.identity,
        [record.gender, record.age].filter(Boolean).join(''),
        record.location ? `@${record.location}` : '',
        favorLabel(record.favor) || '',
    ].filter(Boolean).join(' · ') || '（身份待补）';
    open.append(mark, name, meta, favor);
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
    list.replaceChildren(...records.slice(0, npcLedgerShown).map(record => npcLedgerCardRow(record, injected)));
    if (records.length > npcLedgerShown) {
        const more = makeElement('li', 'dai-impact-item');
        const button = makeElement('button', 'dai-impact-edit', `再显示 ${Math.min(80, records.length - npcLedgerShown)} 个（共 ${records.length} 人）`);
        button.type = 'button';
        button.dataset.npcLedgerMore = '1';
        more.append(button);
        list.append(more);
    }
}

/** 主界面最近活动名单：按最近一次流水楼层排新的在前，只铺前几个人，更多进「人物总簿」。 */
function renderNpcLedgerRecent(target) {
    const list = target?.querySelector?.('[data-npc-ledger-recent]');
    if (!list) return;
    const status = agentNpcLedger.status();
    const lastFloorOf = record => record.log.reduce((max, entry) => Math.max(max, Number.isInteger(entry?.floor) ? entry.floor : -1), -1);
    const records = agentNpcLedger.list()
        .sort((a, b) => lastFloorOf(b) - lastFloorOf(a) || (b.importance === '重要' ? 1 : 0) - (a.importance === '重要' ? 1 : 0));
    if (!records.length) {
        list.replaceChildren(makeElement('li', 'dai-impact-empty', '这一局还没有人物档案。正文里出现第一个人之后，记录员会在这里建档。'));
        return;
    }
    const injected = new Set(lastNpcLedgerInjection?.used ?? []);
    list.replaceChildren(...records.slice(0, NPC_LEDGER_RECENT_COUNT).map(record => npcLedgerCardRow(record, injected)));
    if (records.length > NPC_LEDGER_RECENT_COUNT) {
        list.append(makeElement('li', 'dai-impact-empty', `还有 ${records.length - NPC_LEDGER_RECENT_COUNT} 人没有铺出来，点「人物总簿」查看全部。`));
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
    renderNpcLedgerRecent(target);
    renderNpcColdBench(target);
    renderNpcColdPreviews(target);
}

/**
 * 冷藏推进台的已选名单：勾进冷藏的人一行一个（❄＋简况＋标签），
 * 点一行直接弹窗打开这个人的档案流水页——和本局人物、大小记忆是同一套"主页面简短、弹窗看详情"。
 * 「❄ 自行活动」＝档案里有冷藏推进写回的流水；「新」＝那笔活动就在最近一两楼。
 */
function renderNpcColdBench(target) {
    const list = target.querySelector('[data-npc-cold-bench]');
    if (!list) return;
    const selected = agentNpcColdRuntime.status().selected;
    if (!selected.length) {
        list.replaceChildren(makeElement('p', 'dai-impact-empty', '还没有勾选冷藏人物。本局人物列表行尾的「❄」按钮就是勾选。'));
        return;
    }
    const chat = Array.isArray(getHostContext()?.chat) ? getHostContext().chat : [];
    const lastFloor = lastReplyIndex(chat);
    list.replaceChildren(...selected.map(name => {
        const record = agentNpcLedger.get(name);
        if (!record) {
            const pending = makeElement('li', 'dai-npc-card');
            pending.append(makeElement('span', 'dai-npc-card-line is-muted', `${name}：还没有档案，等正文提到后记录员会建档。`));
            return pending;
        }
        const coldEntry = [...record.log].reverse().find(entry => entry.src === '冷藏') ?? null;
        const latest = record.log.at(-1) ?? null;
        const brief = coldEntry?.text || record.doing || latest?.text || '';
        const isNew = Boolean(coldEntry && Number.isInteger(coldEntry.floor) && Number.isInteger(lastFloor) && lastFloor - coldEntry.floor <= 1);
        const item = makeElement('li', 'dai-npc-card');
        const open = makeElement('button', 'dai-npc-card-main');
        open.type = 'button';
        open.dataset.npcLedgerOpen = record.name;
        open.dataset.npcLedgerTab = 'log';
        open.title = '弹窗打开这个人的档案与全部流水';
        const mark = makeElement('span', 'dai-npc-card-dot', '❄');
        mark.title = '冷藏中';
        const nameEl = makeElement('b', 'dai-npc-card-name', record.name);
        const meta = makeElement('span', 'dai-npc-card-line is-muted');
        meta.textContent = [record.location ? `@${record.location}` : '', brief ? brief.slice(0, 26) : '（还没有活动记录）'].filter(Boolean).join(' ');
        open.append(mark, nameEl, meta);
        if (coldEntry) open.append(makeElement('span', 'dai-profile-chip', '自行'));
        if (isNew) open.append(makeElement('span', 'dai-profile-chip is-accent', '新'));
        item.append(open);
        return item;
    }));
}

/** 面板里的“记进人物簿”：接受一条补丁对象、一组补丁，或 { 人物: [...] }。 */
async function applyNpcLedgerPatchFromPanel(panel) {
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
    const result = await panelMutation(panel, payload, value => applyNpcLedgerPayload(value, { source: '手填' }), persistNpcLedger, setNpcLedgerStatus);
    if (['save_failed', 'stale', 'busy', 'pending_save'].includes(result.status)) return result;
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

/** 只读行跳过的字段：它们已经在抬头和角标里展示了（别名/称号在标题下、在场/重要/位置在角标行），编辑表单里照样有。 */
const NPC_READ_SKIP = new Set(['aliases', 'titles', 'presence', 'importance', 'location']);

/** 信息页拆面：一类一页，40 来个字段不再挤一屏；写满一面翻下一面，跟经历/流水一样是页签。 */
const NPC_INFO_BUNDLES = Object.freeze([
    Object.freeze({ id: 'basic', label: '基本', groups: ['身份', '外貌', '身体'] }),
    Object.freeze({ id: 'mind', label: '心性', groups: ['性格', '对玩家', '社交'] }),
    Object.freeze({ id: 'assets', label: '资产', groups: ['资产', '处境', '秘密'] }),
]);

/** 弹出某个人的信息面板：默认只读，右上角铅笔切进编辑；经历单独一页，流水只读。 */
function openNpcProfileModal(panel, name, { tab = 'basic' } = {}) {
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
    const favor = makeElement('div', 'dai-profile-favor');
    favor.append(makeElement('b', '', `${record.favor > 0 ? '+' : ''}${record.favor}`), makeElement('small', '', favorLabel(record.favor) || '未定'));
    const tools = makeElement('div', 'dai-profile-side');
    const editToggle = makeElement('button', 'dai-npc-icon-button', '✎');
    editToggle.type = 'button';
    editToggle.title = '编辑信息';
    editToggle.dataset.npcProfileEdit = record.name;
    tools.append(favor, editToggle);
    head.append(titleBox, tools);
    page.append(head);

    const chips = makeElement('div', 'dai-profile-chips');
    chips.append(makeElement('span', 'dai-profile-chip', record.presence === '在场' ? '● 在场' : '○ 不在场'));
    if (record.importance === '重要') chips.append(makeElement('span', 'dai-profile-chip is-accent', '★ 重要'));
    if (record.location) chips.append(makeElement('span', 'dai-profile-chip', `@${record.location}`));
    if (record.identity) chips.append(makeElement('span', 'dai-profile-chip', record.identity));
    // 冷藏推进改过的不止流水：把最近一次自行活动动过的字段直接亮在头上。
    const coldFields = Array.isArray(record.coldTouch?.fields) ? record.coldTouch.fields : [];
    if (coldFields.length) {
        chips.append(makeElement('span', 'dai-profile-chip is-accent', `❄ 自行改动：${coldFields.slice(0, 4).join('、')}${coldFields.length > 4 ? '…' : ''}`));
    }
    page.append(chips);

    const tabBar = makeElement('div', 'dai-npc-tabs');
    const panes = new Map();
    const tabDefs = [
        ...NPC_INFO_BUNDLES.map(bundle => [bundle.id, bundle.label]),
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

    // —— 信息页拆成基本/心性/资产三面：每一面默认只读，所有字段都占一行——
    // 有内容写内容，没内容空着画“—”，字段一个都不许消失；右上角铅笔整面板切进编辑。——
    const allGroups = new Map();
    for (const field of NPC_FIELDS) {
        if (!allGroups.has(field.group)) allGroups.set(field.group, []);
        allGroups.get(field.group).push(field);
    }
    const infoPanes = [];
    for (const bundle of NPC_INFO_BUNDLES) {
        const pane = makeElement('div', 'dai-npc-pane');
        const readView = makeElement('div', 'dai-npc-read');
        for (const groupName of bundle.groups) {
            const fields = allGroups.get(groupName) ?? [];
            if (!fields.length) continue;
            const block = makeElement('section', 'dai-profile-group');
            block.append(makeElement('b', 'dai-profile-group-title', groupName));
            for (const field of fields) {
                if (NPC_READ_SKIP.has(field.key)) continue;
                const display = npcProfileReadText(field, record[field.key]);
                const row = makeElement('div', 'dai-profile-row');
                if (!display) row.classList.add('is-empty');
                row.append(makeElement('span', 'dai-profile-label', field.label), makeElement('span', 'dai-profile-value', display || '—'));
                // 这个字段是最近一次冷藏自行活动改的，就盖 ❄。
                if (coldFields.includes(field.label)) row.append(makeElement('span', 'dai-profile-chip is-accent', '❄'));
                block.append(row);
            }
            readView.append(block);
        }
        pane.append(readView);
        const editPane = makeElement('div', 'dai-npc-pane');
        editPane.hidden = true;
        for (const groupName of bundle.groups) {
            const fields = allGroups.get(groupName) ?? [];
            if (!fields.length) continue;
            const block = makeElement('section', 'dai-profile-group');
            block.append(makeElement('b', 'dai-profile-group-title', groupName));
            const form = makeElement('div', 'dai-npc-form');
            form.append(...fields.map(field => npcProfileFieldCell(field, record)));
            block.append(form);
            editPane.append(block);
        }
        const saveBar = makeElement('div', 'dai-turn-actions');
        const save = makeElement('button', 'dai-run-button', '保存信息');
        save.type = 'button';
        save.dataset.npcProfileSave = record.name;
        const status = makeElement('small', 'dai-npc-profile-status');
        status.dataset.npcProfileStatus = record.name;
        saveBar.append(save, status);
        editPane.append(saveBar);
        pane.append(editPane);
        infoPanes.push({ read: readView, edit: editPane });
        panes.set(bundle.id, pane);
    }
    const setEditMode = on => {
        for (const item of infoPanes) {
            item.read.hidden = on;
            item.edit.hidden = !on;
        }
        editToggle.textContent = on ? '✕' : '✎';
        editToggle.title = on ? '收起编辑' : '编辑信息';
    };
    editToggle.addEventListener('click', () => setEditMode(infoPanes[0].edit.hidden));

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

    // —— 流水页：只读，最近 30 条；「❄ 自行活动」＝冷藏推进写回的，「新」＝最近一次生成/推进加进来的 ——
    const logPane = makeElement('div', 'dai-npc-pane');
    const logList = makeElement('div', 'dai-npc-log-list');
    const chatFloors = Array.isArray(getHostContext()?.chat) ? getHostContext().chat : [];
    const latestFloor = lastReplyIndex(chatFloors);
    if (!record.log.length) logList.append(makeElement('p', 'dai-impact-empty', '还没有流水。'));
    else {
        [...record.log].reverse().slice(0, 30).forEach(entry => {
            const row = makeElement('p', 'dai-exp-entry');
            if (entry.day !== null && entry.day !== undefined) row.append(makeElement('span', 'dai-exp-day', `第 ${entry.day} 天`));
            if (Number.isInteger(entry.floor)) row.append(makeElement('span', 'dai-exp-day', `第 ${entry.floor + 1} 楼`));
            // src === '冷藏' 的流水是冷藏推进补写的自行活动，标题上就要能和正文记录分开；标签用短词不占行。
            if (entry.src === '冷藏') row.append(makeElement('span', 'dai-profile-chip is-accent', '自行'));
            // 最近一两楼里进来的条目标「新」，一眼看出这一轮/这次推进补了什么。
            if (Number.isInteger(entry.floor) && Number.isInteger(latestFloor) && latestFloor - entry.floor <= 1) row.append(makeElement('span', 'dai-profile-chip is-accent', '新'));
            row.append(document.createTextNode(entry.text));
            logList.append(row);
        });
    }
    logPane.append(logList);

    panes.set('exp', expPane);
    panes.set('log', logPane);
    for (const pane of panes.values()) page.append(pane);
    show(panes.has(tab) ? tab : NPC_INFO_BUNDLES[0].id);

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

/** 只读视图里一个字段的展示文本；空值返回 ''，那一行就不渲染，别拿一排空输入框占地方。 */
function npcProfileReadText(field, value) {
    if (value === null || value === undefined) return '';
    if (field.type === 'things') return (Array.isArray(value) ? value : []).map(thingTextForProfile).filter(Boolean).join('；');
    if (field.type === 'triples') {
        return (Array.isArray(value) ? value : [])
            .map(item => [item.who ?? '', item.relation ?? '', item.attitude ?? ''].filter(Boolean).join('·'))
            .filter(Boolean).join('；');
    }
    if (field.type === 'secret') {
        const secret = value && typeof value === 'object' ? value : {};
        return [secret.hideFrom ? `瞒着${secret.hideFrom}` : '', secret.what ?? ''].filter(Boolean).join('：');
    }
    if (field.type === 'list') return Array.isArray(value) ? value.join('、') : String(value).trim();
    return String(value).trim();
}

/** 读信息面板并写回：所有字段一起保存，清空就是清空。 */
async function saveNpcProfileFields(panel, name) {
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
    const status = page.querySelector('[data-npc-profile-status]');
    const result = await panelMutation(panel, { name, fields }, () => {
        const changed = agentNpcLedger.setFields(name, fields, { source: '手填' });
        if (changed.status === 'updated') changed.persistence = persistNpcLedger();
        return changed;
    }, persistNpcLedger, message => { if (status) status.textContent = message; });
    if (['save_failed', 'stale', 'busy', 'pending_save'].includes(result.status)) return result;
    if (result.status === 'updated') {
        refreshNpcLedgerPage(panel);
        if (status) status.textContent = `已保存：${result.fields.join('、')}`;
        openNpcProfileModal(panel, name, { tab: 'basic' });
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
    const overrides = npcLedgerOverrides(settings, { temperature: 0.2, maxTokens: 1600 }, 'npcExp');
    if (overrides.connection !== 'custom' && agentLlmClient.availableFor('tavern') !== true) {
        setNpcLedgerStatus('还没配好模型连接：先在“模型设置”页选好连接，精简才能跑。');
        return;
    }
    const continuation = captureAgentContinuation();
    const recordVersion = JSON.stringify(agentNpcLedger.get(who));
    const request = {};
    pendingExpCondense = request;
    setNpcLedgerStatus(`正在请模型精简 ${who} 的经历……`);
    try {
        const raw = await agentLlmClient.complete({
            label: '经历精简',
            system: typeof currentSettings().npc?.expCondensePrompt === 'string' && currentSettings().npc.expCondensePrompt.trim()
                ? currentSettings().npc.expCondensePrompt.trim() : EXP_CONDENSE_PROMPT,
            user: buildExpCondenseUser({ name: group.name, summary: agentNpcLedger.get(who)?.identity ?? '', entries: group.entries }),
            jsonSchema: { type: 'object', properties: { 经历: { type: 'array' } }, required: ['经历'] },
            overrides,
        });
        if (!continuation.current() || pendingExpCondense !== request || recordVersion !== JSON.stringify(agentNpcLedger.get(who))) return { status: 'stale' };
        const parsed = parseExpCondenseReply(raw);
        if (parsed.status !== 'ok') {
            setNpcLedgerStatus(`精简输出读不懂，经历没动：${parsed.reason}`);
            return;
        }
        pendingExpCondense = { name: group.name, entries: parsed.entries, continuation, recordVersion };
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
    if (!pending || pending.name !== name || !pending.continuation?.current()
        || pending.recordVersion !== JSON.stringify(agentNpcLedger.get(name))) {
        pendingExpCondense = null;
        setNpcLedgerStatus('精简草稿已过期，请重新生成；当前人物经历未修改。');
        return { status: 'stale' };
    }
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
    if (plan.inject.connection !== 'custom' && agentLlmClient.availableFor('tavern') !== true) return { status: 'unavailable' };
    const { draft, floors } = impactConversation(chat, settings.injectFloors);
    const raw = await agentLlmClient.complete({
        label: '场记挑选',
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
            ...planExtras(plan.inject),
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
    const continuation = captureAgentContinuation();
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
    const signatureOf = () => JSON.stringify([settleScopeKey(), agentContinuationEpoch, agentImpactRuntime.snapshot(),
        agentWorldRuntime.snapshot(), currentSettings(), sourceChat.map(message => [message?.is_user, message?.is_system, message?.mes, message?.swipe_id])]);
    const signature = signatureOf();
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
            if (!continuation.current() || signature !== signatureOf()) return { status: 'stale' };
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
    if (!continuation.current() || signature !== signatureOf()) return { status: 'stale' };
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
    if (currentSettings().enabled === false) return { status: 'disabled' };
    const continuation = captureAgentContinuation();
    // 世界通道先走：它不依赖原著设定的开关与预算，两路互不阻塞。
    try { writeWorldInjectionForPrompt(); } catch { /* 世界注入失败不影响原著设定注入 */ }
    try { await writeImpactInjectionForPrompt({ chat }); } catch { /* 影响库注入失败不影响正文生成 */ }
    if (!continuation.current()) return { status: 'stale' };
    // 人物档案与影响库同属“这一局已经发生成什么样”，排在原著设定之前写，预算各算各的。
    try { writeNpcLedgerInjectionForPrompt(); } catch { /* 人物簿注入失败不影响正文生成 */ }
    // 纳戒：主角自身状态，与上面四路互不清空、预算各算各的。
    try { writeSelfInjectionForPrompt(); } catch { /* 纳戒注入失败不影响正文生成 */ }
    // 记忆：召回决定（或关键词兜底）挑出的旧记忆，排在纳戒之后；与其它通道互不清空、预算各算各的。
    try { await writeMemoryInjectionForPrompt({ chat }); } catch { /* 记忆注入失败不影响正文生成 */ }
    if (!continuation.current()) return { status: 'stale' };
    const settings = injectionSettings();
    if (!settings.enabled) { agentPromptInjection.clear(); return { status: 'disabled' }; }
    if (sandboxModeActive()) {
        // 沙盒口径不用世界书：设定挑选整条跳过（少一次模型调用），同一条注入通道改写内置斗气大陆基线。
        const probe = agentPromptInjection.inspect();
        if (probe.status !== 'ready') return probe;
        const writeResult = agentPromptInjection.write({ text: SANDBOX_WORLD_PROMPT, usedIds: [] }, { depth: settings.depth, maxChars: settings.maxChars });
        persistFactsLastInjection();
        return writeResult;
    }
    const probe = agentPromptInjection.inspect();
    if (probe.status !== 'ready') return probe;
    const messages = Array.isArray(chat) ? chat : (getHostContext()?.chat ?? []);
    let input = '';
    const recent = [];
    for (let index = messages.length - 1; index >= 0 && (!input || recent.length < 2); index -= 1) {
        const message = messages[index];
        if (!message || typeof message.mes !== 'string' || !message.mes.trim()) continue;
        if (message.is_user === true) { if (!input) input = message.mes.trim(); continue; }
        if (message.is_system === true) continue;
        if (recent.length < 2) recent.unshift(message.mes);
    }
    if (!input) { agentPromptInjection.clear(); return { status: 'no_input' }; }
    const resolved = await agentTurnStages.resolveInjection({ input, recentTexts: recent, ...currentAgentScope() });
    if (!continuation.current()) return { status: 'stale' };
    lastLookupInfo = resolved?.lookup ? { ...resolved.lookup, secondCall: resolved.secondCall === true } : null;
    if (!resolved?.text) { agentPromptInjection.clear(); persistFactsLastInjection(); return { status: resolved?.status ?? 'empty' }; }
    const writeResult = agentPromptInjection.write(resolved, { depth: settings.depth, maxChars: settings.maxChars });
    persistFactsLastInjection();
    try { recordAgentAudit({ event: 'turn_facts_inject', outcome: String(writeResult?.status ?? 'unknown') }); } catch { /* 审计失败不影响注入 */ }
    return writeResult;
}

// —— 行动结算·最终判定：六路注入都写完后直判本轮行动，结果写进 doupo_action 通道 ——

let lastSettleAdjudication = null;
const settleSession = createSettleSession();
let settleExtensionEnabled = true;

function settleScopeKey() {
    const context = getHostContext();
    return JSON.stringify({ ...currentAgentScope(), characterId: context?.characterId ?? null });
}

function resetSettleAdjudication() {
    settleSession.invalidate();
    agentActionPromptInjection.clear();
    lastSettleAdjudication = null;
}

function settleEnabled() {
    const settings = currentSettings();
    return settleExtensionEnabled && settings.enabled !== false && settings.enableActionResolution !== false
        && settleSettings().resultEnabled && !sandboxModeActive();
}

// —— 结算记录：面板「行动结算」卡与悬浮球共用（仿记忆注入的持久化模式） ——

function settleAdjudicationView() {
    return lastSettleAdjudication ? { ...lastSettleAdjudication } : null;
}

/** 记一笔并落聊天存档（悬浮球换聊天/重启后仍能看到上一次判定）。 */
function recordSettleAdjudication(record) {
    lastSettleAdjudication = record && typeof record === 'object' ? { ...record } : null;
    persistSettleAdjudication();
    renderSettleResultCard();
    refreshOpenOrbPanel();
}

function persistSettleAdjudication() {
    try {
        if (!hostStorage?.chatState || !hostStorage?.saveChatState) return;
        const state = hostStorage.chatState();
        const value = state?.status === 'ready' && state.value && typeof state.value === 'object' ? { ...state.value } : {};
        value.settleLastAdjudication = lastSettleAdjudication;
        const record = lastSettleAdjudication;
        Promise.resolve(hostStorage.saveChatState(value)).then(result => {
            if (lastSettleAdjudication === record && record) {
                record.persistence = result?.status ?? 'unknown';
                renderSettleResultCard();
            }
        }).catch(() => {
            if (lastSettleAdjudication === record && record) { record.persistence = 'failed'; renderSettleResultCard(); }
        });
    } catch { /* 存档失败不影响判定 */ }
}

/** 换聊天/启动恢复：内存里没有才恢复，恢复出的一律标「已清理」（注入容器必然已被酒馆重置）。 */
function hydrateSettleAdjudication() {
    try {
        if (lastSettleAdjudication) return;
        const state = hostStorage?.chatState?.();
        const record = state?.status === 'ready' ? state.value?.settleLastAdjudication : undefined;
        if (record && typeof record === 'object') { lastSettleAdjudication = { ...record, cleared: true }; renderSettleResultCard(); }
    } catch { /* 恢复失败就当没有记录 */ }
}

/** 只从真账本建审核快照，缺失的生命/斗气量不补假值。 */
function settleStateFromSelf() {
    return buildSettleState(agentSelfRuntime.snapshot());
}

function reconcileSettleAdjudication(snapshot) {
    const record = lastSettleAdjudication;
    if (!record?.expectedState || record.scope !== settleScopeKey() || record.status !== 'injected') return;
    const chat = getHostContext()?.chat ?? [];
    const latestUser = chat.findLastIndex(message => message?.is_user === true);
    const replies = chat.slice(latestUser + 1).filter(message => message?.is_user !== true && message?.is_system !== true && message?.mes);
    if (latestUser !== record.userFloor || chat[latestUser]?.mes?.trim() !== record.userInput || !replies.length) return;
    if (JSON.stringify(replies.map(message => [message.mes, message.swipe_id])) === record.replyBefore) return;
    recordSettleAdjudication({ ...record, reconciliation: compareSettleState(record.expectedState, buildSettleState(snapshot)) });
}

/** 读六路通道的当轮文本（extensionPrompts 里的 value），给判定员做上下文。 */
function readInjectedChannelTexts() {
    const context = getHostContext();
    const prompts = context?.extensionPrompts ?? {};
    const injections = {};
    for (const source of SETTLE_INJECTION_SOURCES) {
        const value = prompts?.[source.key]?.value;
        injections[source.key] = typeof value === 'string' ? value : '';
    }
    return injections;
}

const SETTLE_STATUS_TEXT = { pending: '正在判定', injected: '已注入', preview: '仅预览，未注入', write_failed: '注入失败', error: '判定失败', stale: '已作废', disabled: '已关闭', none: '无需裁决', no_input: '没有玩家输入', busy: '已有同轮判定进行中', unsupported: '注入通道不可用' };
const SETTLE_ACTION_STATUS_TEXT = { success: '成功', partial: '部分成功', failure: '失败', insufficient: '条件不足', not_executed: '未执行' };

function settleResultStatusText() {
    if (!lastSettleAdjudication) return '还没有判定过。每轮一次调用，按实际行动分别裁决。';
    const record = lastSettleAdjudication;
    return `${SETTLE_STATUS_TEXT[record.status] ?? record.status}${record.cleared ? ' · 通道已清理' : ''}${record.summary ? ` · ${record.summary}` : ''}`;
}

function renderSettleResultCard() {
    try {
        const panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null;
        if (!panel) return;
        const status = panel.querySelector('[data-settle-result-status]');
        if (status) status.textContent = settleResultStatusText();
        const warning = panel.querySelector('[data-settle-prompt-warning]');
        if (warning) {
            const custom = currentSettings().settle?.resultPrompt?.trim();
            warning.textContent = custom && custom !== SETTLE_RESULT_PROMPT ? '正在保留并使用自定义提示词：旧单行动格式可兼容，但不会自动获得多行动能力；可显式载入新模板或恢复跟随默认。' : '当前使用自适应多行动模板；系统只计算真账本支持的数值。';
        }
        const box = panel.querySelector('[data-settle-result]');
        if (!box) return;
        const record = lastSettleAdjudication;
        if (!record) { box.textContent = '本轮还没有判定结果。'; return; }
        const time = Number.isFinite(record.at) ? new Date(record.at).toLocaleTimeString('zh-CN', { hour12: false }) : '';
        const actions = Array.isArray(record.actions) ? record.actions : [{ category: record.category, outcome: record.outcome, effects: record.effects, rejected: record.rejected }];
        const lines = [`${SETTLE_STATUS_TEXT[record.status] ?? record.status}${time ? ` · ${time}` : ''}`];
        for (const [index, action] of actions.entries()) {
            const label = action.approved === false ? `${settleSettings().labelFor(action.category)}（未通过复核）` : action.label || settleSettings().labelFor(action.category);
            lines.push(`${index + 1}. ${label} · ${SETTLE_ACTION_STATUS_TEXT[action.status] ?? (action.approved === false ? '未通过复核' : '判定结果')}：${action.outcome || '暂无结果'}`);
            for (const consequence of action.consequences ?? []) lines.push(`   后果：${consequence}`);
            for (const effect of action.effects ?? []) {
                const value = effect.type === 'set' ? `→ ${effect.value}` : `${Number(effect.value) >= 0 ? '+' : ''}${effect.value}`;
                lines.push(`   待落账：${effect.name || effect.itemId || effect.field} ${value}`);
            }
            for (const item of action.rejected ?? []) lines.push(`   拒收：${typeof item === 'string' ? item : item.reason ?? '规则未通过'}`);
            if (action.blockedReason) lines.push(`   原因：${action.blockedReason}`);
        }
        const comparison = record.reconciliation;
        if (comparison) {
            lines.push(`落账核对：${({ pending: '等待生成后记账', matched: '可比对字段一致', mismatch: '与批准结果不一致（未自动修账）', not_applicable: '仅文字后果，无数值可核对' })[comparison.status] ?? '尚未核对'}`);
            for (const item of comparison.differences ?? []) lines.push(`   ${typeof item === 'string' ? item : `${item.label || item.field}：预期 ${JSON.stringify(item.expected)}，实际 ${JSON.stringify(item.actual)}`}`);
        }
        if (record.clearError) lines.push(`通道清理失败：${record.clearError}`);
        if (record.persistence && record.persistence !== 'saved') lines.push(`记录保存状态：${record.persistence}`);
        box.textContent = lines.join('\n');
    } catch { /* 面板未挂载时忽略 */ }
}

/** 同一份只读材料供自动注入与手动预览使用；不在这里触发额外召回调用。 */
function collectSettleMaterials(chat = null) {
    const sourceChat = Array.isArray(chat) ? chat : (getHostContext()?.chat ?? []);
    const userFloor = sourceChat.findLastIndex(message => message?.is_user === true && typeof message.mes === 'string' && message.mes.trim());
    const input = userFloor >= 0 ? sourceChat[userFloor].mes.trim() : '';
    // 手动重判也只能读到玩家输入为止，不能把该输入的旧AI回复当成既定结果。
    const { floors } = impactConversation(userFloor >= 0 ? sourceChat.slice(0, userFloor + 1) : [], 6);
    const settings = settleSettings();
    const state = settleStateFromSelf();
    const contextState = buildSettleContextState(state, input);
    const npcText = `${input}\n${floors.map(floor => floor.text).join('\n')}`;
    const relevantNpcs = agentNpcLedger.list().filter(record => record.presence === '在场' || npcText.includes(record.name));
    contextState.npcs = relevantNpcs.slice(0, 6).map(record => ({
        name: record.name, realm: record.realm, location: record.location, injury: record.injury,
        qi: record.qi, douqi: record.douqi, presence: record.presence,
    }));
    contextState.npcNote = `人物身体状态按文字理解，不是可增减的数值余额；相关人物 ${relevantNpcs.length} 位，最多提供 6 位。`;
    let worldbookLines = [];
    if (!sandboxModeActive() && agentFactsIndex.stats().total > 0) {
        worldbookLines = agentFactsIndex.matchTokens(npcText, { limit: 8, volume: currentVolumeForWorld() })
            .map(hit => agentFactsIndex.get(hit.uid)).filter(Boolean)
            .map(entry => ({ uid: entry.uid, category: entry.category, name: entry.name, content: trimToVolume(entry.content, currentVolumeForWorld()) }));
    }
    const user = buildSettleResultUser({ input, floors, worldbookLines, injections: readInjectedChannelTexts(), state: contextState });
    const customRules = settings.customCategories.map(item => `${item.id}（${item.name}）：${item.prompt}`).join('\n');
    const system = `${settings.resultPrompt}\n\n【用户另行配置的类别补充规则，输出格式仍服从 v2】\n${SETTLE_CATEGORIES.filter(category => currentSettings().settle?.prompt?.[category.id]?.trim()).map(category => `${category.id}：${settings.promptFor(category.id)}`).join('\n\n') || '无，采用自适应默认规则'}\n\n【自定义类别，仅叙事扩展，不扩大字段权限】\n${customRules || '无'}\n\n【当前运行契约 v2】一次调用按明确行动输出 version:2、actions 数组；每项有 id/category/evidence/dependsOn/status/outcome/consequences/effects。无真实数值不编精确变化，有文字结果也可 effects:[]。类别旧模板中的单结果格式不覆盖本契约。`;
    if (system.length > 24000) throw new RangeError('结算提示词和自定义规则合计超过 24000 字符；本轮不截断规则、不发起不完整判定');
    const scope = settleScopeKey();
    const liveChat = getHostContext()?.chat ?? [];
    const liveGuard = liveChat.slice(-6).map(message => [message?.is_user, message?.is_system, message?.mes, message?.swipe_id]);
    const fingerprint = JSON.stringify({ scope, user, system, state, overrides: settings.resultOverrides, connection: currentSettings().llm, day: worldDay(), userFloor, liveLength: liveChat.length, liveGuard });
    return { input, state, settings, user, system, scope, fingerprint, userFloor, chatLength: sourceChat.length };
}

/** 预览不占用正文通道；自动生成只写审核后的多行动结果。 */
async function writeSettleAdjudicationForPrompt({ chat = null, force = false, preview = false } = {}) {
    if (preview && agentLlmClient.isQuietBusy()) return { status: 'busy' };
    if (!settleEnabled()) {
        settleSession.invalidate();
        const cleared = agentActionPromptInjection.clear();
        recordSettleAdjudication({ status: 'disabled', actions: [], summary: '开关已关闭，本轮不调用不注入', at: Date.now(), cleared: cleared.status === 'cleared', scope: settleScopeKey() });
        return { status: 'disabled' };
    }
    let token;
    let materials;
    const scope = settleScopeKey();
    try {
        materials = collectSettleMaterials(chat);
        if (!materials.input) {
            settleSession.invalidate();
            const cleared = agentActionPromptInjection.clear();
            recordSettleAdjudication({ status: 'no_input', actions: [], at: Date.now(), cleared: cleared.status === 'cleared', scope });
            return { status: 'no_input' };
        }
        const attempt = settleSession.begin({ scope, fingerprint: `${preview ? 'preview' : 'inject'}|${materials.fingerprint}`, force });
        if (attempt.status === 'busy') return { status: 'busy' };
        const applyResult = (record, text) => {
            const written = preview ? { status: 'preview' } : text
                ? agentActionPromptInjection.write({ text }, { depth: injectionSettings().depth, maxChars: 0 })
                : agentActionPromptInjection.clear();
            const status = preview ? 'preview' : text ? (written.status === 'injected' ? 'injected' : 'write_failed') : (written.status === 'cleared' ? 'none' : 'write_failed');
            const applied = { ...record, status, chars: written.chars ?? 0, cleared: preview || written.status === 'cleared', clearError: !text && written.status !== 'cleared' && !preview ? written.reason ?? written.status : '', summary: `${record.actions?.length ?? 0} 项行动${written.status === 'failed' ? ` · ${written.reason}` : ''}` };
            recordSettleAdjudication(applied);
            return { record: applied, text, status };
        };
        if (attempt.status === 'cached') return { status: applyResult(attempt.record, attempt.text).status, cached: true };
        token = attempt.token;
        // 正式重判先清旧约束；手动预览不触碰可能正被正文使用的通道。
        const cleared = preview ? { status: 'preview' } : agentActionPromptInjection.clear();
        recordSettleAdjudication({ status: 'pending', actions: [], at: Date.now(), cleared: cleared.status === 'cleared', scope });
        const raw = await agentLlmClient.complete({ label: '行动结算', rawPrompt: true, system: materials.system, user: materials.user, overrides: materials.settings.resultOverrides });
        if (typeof window !== 'undefined') window.__lastSettleRaw = String(raw ?? '');
        if (!settleSession.isCurrent(token) || !settleEnabled() || scope !== settleScopeKey()) return { status: 'stale' };
        const fresh = collectSettleMaterials(chat);
        if (fresh.fingerprint !== materials.fingerprint) {
            settleSession.fail(token);
            recordSettleAdjudication({ status: 'stale', actions: [], summary: '等待期间上下文、状态或规则已变化，旧结果未注入', at: Date.now(), cleared: true, scope });
            return { status: 'stale' };
        }
        const parsed = parseSettleResult(raw);
        if (parsed.status === 'invalid') throw new Error(parsed.error ?? '判定结果不是有效 JSON');
        const reviewed = reviewSettleEffects(parsed, materials.state, { input: materials.input, customCategories: materials.settings.customCategories });
        const text = renderSettleInjection(reviewed);
        const record = {
            ...reviewed, version: 2, at: Date.now(), scope, userFloor: materials.userFloor, userInput: materials.input,
            replyBefore: JSON.stringify((getHostContext()?.chat ?? []).slice(materials.userFloor + 1).filter(message => message?.is_user !== true && message?.is_system !== true && message?.mes).map(message => [message.mes, message.swipe_id])),
            reconciliation: { status: reviewed.effects.length ? 'pending' : 'not_applicable', differences: [] },
        };
        const applied = applyResult(record, text);
        if (applied.status === 'write_failed') settleSession.fail(token);
        else settleSession.finish(token, applied);
        return { status: applied.status, actions: reviewed.actions.length };
    } catch (error) {
        // 已被替代或换聊天的请求不能清掉新请求的通道，也不能写入新聊天记录。
        if (scope !== settleScopeKey() || (token && !settleSession.isCurrent(token))) return { status: 'stale' };
        if (token) settleSession.fail(token);
        const cleared = preview ? { status: 'preview' } : agentActionPromptInjection.clear();
        recordSettleAdjudication({ status: 'error', actions: [], summary: `判定失败：${error?.message ?? error}`, at: Date.now(), cleared: cleared.status === 'cleared', scope });
        return { status: 'error', error: String(error?.message ?? error) };
    }
}

/** SillyTavern calls this global (declared in manifest.json) before every real generation. */
globalThis.doupoFactsInterceptor = async function doupoFactsInterceptor(chat, contextSize, abort, type) {
    if (type === 'quiet') return;
    try {
        await prepareInjectionForPrompt({ chat, contextSize });
    } catch (error) {
        try { console.warn(`[${EXTENSION_ID}] 原著设定注入失败`, error); } catch { /* 记录失败不影响生成 */ }
    }
    // 行动结算排在最后：它要读六路通道的当轮文本做上下文，缺了哪路就按空处理，不阻塞生成。
    try {
        const settleOutcome = await writeSettleAdjudicationForPrompt({ chat });
        try { recordAgentAudit({ event: 'turn_settle_adjudicate', outcome: `${settleOutcome?.status ?? 'unknown'}${Number.isInteger(settleOutcome?.actions) ? `·${settleOutcome.actions}项` : ''}` }); } catch { /* 审计失败不影响结算 */ }
    } catch (error) {
        try { recordAgentAudit({ event: 'turn_settle_adjudicate', outcome: 'error' }); } catch { /* 审计失败不影响结算 */ }
        try { console.warn(`[${EXTENSION_ID}] 行动结算失败`, error); } catch { /* 记录失败不影响生成 */ }
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
    renderSettleResultCard();
}

/** ===== API设置：接口方案（名称/地址/密钥/模型/参数/附加参数）的编辑界面与增删改 ===== */

/** 一个方案 = 一张可折叠编辑卡：基础连接 + 采样参数 + 附加参数（酒馆自定义接口同语义的三段）。 */
function apiPresetHtml(preset) {
    const id = escapeHtml(preset.id);
    const text = value => escapeHtml(String(value ?? ''));
    const providerOption = (value, label) => `<option value="${value}"${preset.provider === value ? ' selected' : ''}>${label}</option>`;
    const numberRow = (name, label, small, max, step) => `<label class="dai-setting-row"><span><b>${label}</b><small>${small}</small></span><input type="number" min="0" max="${max}" step="${step}" data-api-preset-field="${name}" value="${text(preset[name] ?? 0)}"></label>`;
    return `<details class="dai-settle-category dai-api-preset" data-api-preset-id="${id}"><summary><span class="dai-feature-icon">⛓</span><span><b>${text(preset.name || '未命名方案')}</b><small>${text(preset.baseUrl || '还没填接口地址')}</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>方案名称</b><small>「模型设置」页各功能选方案时显示的名字。</small></span><input type="text" data-api-preset-field="name" value="${text(preset.name)}" maxlength="24" placeholder="例如：深修直连"></label><label class="dai-setting-row"><span><b>接口协议</b><small>留空按接口地址自动判断。</small></span><select data-api-preset-field="provider">${providerOption('', '自动判断')}${providerOption('openai', 'OpenAI 兼容')}${providerOption('anthropic', 'Anthropic')}</select></label><label class="dai-setting-row"><span><b>接口地址</b><small>OpenAI 兼容的 Base URL，填到 /v1 为止（同酒馆自定义接口）。</small></span><input type="text" data-api-preset-field="baseUrl" value="${text(preset.baseUrl)}" placeholder="https://api.example.com/v1"></label><label class="dai-setting-row"><span><b>API Key</b><small>只保存到扩展设置，不写入聊天消息。</small></span><input type="password" data-api-preset-field="apiKey" value="${text(preset.apiKey)}" autocomplete="off" placeholder="留空表示不使用密钥"></label><label class="dai-setting-row"><span><b>模型名称</b><small>填好地址后点“拉取模型”挑一个，也可以手填。</small></span><input type="text" data-api-preset-field="model" value="${text(preset.model)}" placeholder="例如 deepseek-chat"></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-api-preset-models="${id}">拉取模型</button><small role="status" data-api-preset-models-status="${id}"></small></div><div class="dai-setting-grid dai-param-grid">${numberRow('temperature', 'Temperature', '0 更稳，2 更发散；0 ＝不指定。', 2, 0.05)}${numberRow('maxTokens', '最大输出 Token', 'tokens；0 ＝不指定。', 32768, 64)}${numberRow('topP', 'top_p', '0–1；0 ＝不指定。', 1, 0.05)}${numberRow('presencePenalty', '存在惩罚', '0–2；0 ＝不指定。', 2, 0.1)}${numberRow('frequencyPenalty', '频率惩罚', '0–2；0 ＝不指定。', 2, 0.1)}</div><label class="dai-setting-row"><span><b>包括主体参数</b><small>YAML 对象，最后并进聊天补全请求体（酒馆附加参数同语义）；例：top_k: 20</small></span><textarea data-api-preset-field="includeBody" rows="3" spellcheck="false" placeholder="top_k: 20">${text(preset.includeBody)}</textarea></label><label class="dai-setting-row"><span><b>排除主体参数</b><small>YAML 数组，最后从请求体删掉这些顶层字段；例：- frequency_penalty</small></span><textarea data-api-preset-field="excludeBody" rows="3" spellcheck="false" placeholder="- frequency_penalty">${text(preset.excludeBody)}</textarea></label><label class="dai-setting-row"><span><b>包含请求标头</b><small>YAML 对象，合并覆盖请求头（可覆盖鉴权头）；例：CustomHeader: custom-value</small></span><textarea data-api-preset-field="headers" rows="3" spellcheck="false" placeholder="CustomHeader: custom-value">${text(preset.headers)}</textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-api-preset-copy="${id}">复制方案</button><button type="button" class="dai-button dai-button-ghost" data-api-preset-remove="${id}">删除方案</button><small>改动即时保存；删除后用到它的功能自动回到跟随酒馆主连接。</small></div></div></details>`;
}

function renderApiPresets(panel, openId = null) {
    const list = panel?.querySelector('[data-api-preset-list]');
    if (!list) return;
    const presets = currentSettings().api?.presets ?? [];
    list.innerHTML = presets.map(apiPresetHtml).join('');
    if (openId) {
        const item = list.querySelector(`[data-api-preset-id="${CSS.escape(openId)}"]`);
        if (item) {
            item.open = true;
            item.scrollIntoView({ block: 'nearest' });
        }
    }
}

function saveApiPresets(presets) {
    const result = hostStorage.updateSettings({ api: { presets } });
    try {
        result.persistence = result.status === 'ready' ? Promise.resolve(hostStorage.saveSettings()).catch(error => ({ status: 'failed', reason: error?.message })) : Promise.resolve({ status: 'unavailable' });
    } catch (error) { result.persistence = Promise.resolve({ status: 'failed', reason: error?.message }); }
    return result;
}

/** 「模型设置」页各功能卡顶部的方案下拉：首项跟随酒馆主连接，其余是方案；绑定值不在列表里（方案被删）回落空。 */
function renderApiPresetSelects(panel) {
    if (!panel) return;
    const presets = currentSettings().api?.presets ?? [];
    for (const select of panel.querySelectorAll('[data-api-preset-select]')) {
        const bound = String(fieldValue(currentSettings(), select.dataset.setting) ?? '');
        select.textContent = '';
        const none = document.createElement('option');
        none.value = '';
        none.textContent = '跟随酒馆主连接（不绑方案）';
        select.appendChild(none);
        for (const preset of presets) {
            const option = document.createElement('option');
            option.value = preset.id;
            option.textContent = preset.name || '未命名方案';
            select.appendChild(option);
        }
        select.value = presets.some(item => item?.id === bound) ? bound : '';
    }
}

/** 方案被删后清掉指向它的功能绑定：这些功能直接回到跟随酒馆主连接，不会拿失效 id 空转。 */
async function clearApiPresetBindings(id) {
    const patch = {};
    for (const path of Object.values(API_PRESET_BINDINGS)) {
        if (fieldValue(currentSettings(), path) !== id) continue;
        const [group, key] = path.split('.');
        patch[group] = { ...(patch[group] ?? {}), [key]: '' };
    }
    if (!Object.keys(patch).length) return { status: 'saved' };
    const result = hostStorage.updateSettings(patch);
    if (result.status !== 'ready') return { status: 'unavailable' };
    try { return await hostStorage.saveSettings(); } catch { return { status: 'failed' }; }
}

async function addApiPreset(panel) {
    const status = panel?.querySelector('[data-api-preset-status]');
    // 上一笔“新建”还没保存成功：这次只重试保存，不再往内存里塞第二份方案。
    if (panel?.__pendingApiSave?.kind === 'add') {
        const pending = panel.__pendingApiSave;
        pending.result.persistence = pending.persist();
        const ok = await awaitPanelPersistence(pending.result, message => { if (status) status.textContent = message; });
        if (ok) {
            panel.__pendingApiSave = null;
            if (status) status.textContent = '已添加：填好地址、密钥和模型，就能在「模型设置」页选它。';
        }
        return;
    }
    const presets = (currentSettings().api?.presets ?? []).slice();
    if (presets.length >= API_PRESETS_MAX) {
        if (status) status.textContent = `方案最多 ${API_PRESETS_MAX} 个，先删一个再加。`;
        return;
    }
    presets.push({ name: '新方案', provider: '', baseUrl: '', apiKey: '', model: '', temperature: 0, maxTokens: 0, topP: 0, presencePenalty: 0, frequencyPenalty: 0, includeBody: '', excludeBody: '', headers: '' });
    const sequence = ++settingsSaveSequence;
    const result = saveApiPresets(presets);
    // 失败重试只补交宿主保存，方案已在内存里，不能重复 push。
    if (panel) panel.__pendingApiSave = { kind: 'add', result, persist: () => Promise.resolve(hostStorage.saveSettings()).catch(error => ({ status: 'failed', reason: error?.message })) };
    const ok = await awaitPanelPersistence(result, message => { if (status && sequence === settingsSaveSequence) status.textContent = message; });
    if (ok && panel?.__pendingApiSave?.kind === 'add') panel.__pendingApiSave = null;
    if (!ok || sequence !== settingsSaveSequence) return;
    const saved = currentSettings().api?.presets ?? [];
    const newId = saved[saved.length - 1]?.id ?? null;
    renderApiPresets(panel, newId);
    renderApiPresetSelects(panel);
    if (status) status.textContent = '已添加：填好地址、密钥和模型，就能在「模型设置」页选它。';
}

async function removeApiPreset(panel, id) {
    if (typeof window !== 'undefined' && !window.confirm('删除这个方案？正在使用它的功能会自动回到跟随酒馆主连接。')) return;
    const status = panel?.querySelector('[data-api-preset-status]');
    const sequence = ++settingsSaveSequence;
    const result = saveApiPresets((currentSettings().api?.presets ?? []).filter(item => item?.id !== id));
    const binding = clearApiPresetBindings(id);
    const saved = await result.persistence;
    const cleared = await binding;
    if (sequence !== settingsSaveSequence) return;
    if (saved.status !== 'saved' || cleared.status !== 'saved') { if (status) status.textContent = '方案已在内存删除，但保存失败；请重试保存。'; return; }
    renderApiPresets(panel);
    renderApiPresetSelects(panel);
    if (status) status.textContent = '方案已删除，绑过它的功能已回到跟随酒馆主连接。';
}

async function copyApiPreset(panel, id) {
    const presets = (currentSettings().api?.presets ?? []).slice();
    const index = presets.findIndex(item => item?.id === id);
    if (index < 0) return;
    const status = panel?.querySelector('[data-api-preset-status]');
    if (presets.length >= API_PRESETS_MAX) {
        if (status) status.textContent = `方案最多 ${API_PRESETS_MAX} 个，先删一个再复制。`;
        return;
    }
    presets.splice(index + 1, 0, { ...presets[index], id: undefined, name: `${presets[index].name || '未命名方案'}（副本）` });
    const sequence = ++settingsSaveSequence;
    const result = saveApiPresets(presets);
    const ok = await awaitPanelPersistence(result, message => { if (status && sequence === settingsSaveSequence) status.textContent = message; });
    if (!ok || sequence !== settingsSaveSequence) return;
    const saved = currentSettings().api?.presets ?? [];
    renderApiPresets(panel, saved[index + 1]?.id ?? null);
    renderApiPresetSelects(panel);
    if (status) status.textContent = '已复制：改个名字、换掉密钥就是一套新方案。';
}

function updateApiPresetField(id, field, value) {
    const presets = currentSettings().api?.presets ?? [];
    // 卡片上那张方案的 id 已经不在表里（被清成垃圾、被别的窗口改掉、或链接到旧渲染）：
    // 这时绝不能拿整表回写——那会把这一次输入悄悄丢掉，界面还报「方案已保存」。
    // 返回 missing 让上层把列表重画一遍，玩家看到的是「这条不在了」，而不是以为存上了。
    if (!presets.some(item => item?.id === id)) return { status: 'missing' };
    return saveApiPresets(presets.map(item => (item?.id === id ? { ...item, [field]: value } : item)));
}

/** 方案卡上的“拉取模型”：读这张卡自己填的地址/密钥/协议/请求标头（方案标头一并带上），候选填进模型输入框。 */
async function fetchApiPresetModels(panel, id) {
    const card = panel?.querySelector(`[data-api-preset-id="${CSS.escape(id)}"]`);
    if (!card) return;
    const status = card.querySelector('[data-api-preset-models-status]');
    const button = card.querySelector('[data-api-preset-models]');
    const read = field => card.querySelector(`[data-api-preset-field="${field}"]`)?.value?.trim() ?? '';
    const baseUrl = read('baseUrl');
    if (!baseUrl) {
        if (status) status.textContent = '先填接口地址，再点拉取。';
        return;
    }
    card.__modelRequest?.abort();
    const controller = new AbortController();
    card.__modelRequest = controller;
    const owner = captureAgentContinuation();
    const current = () => card.isConnected && card.__modelRequest === controller && owner.current();
    const timer = setTimeout(() => controller.abort(), 30000);
    if (button) button.disabled = true;
    if (status) status.textContent = '正在拉取模型……';
    try {
        const result = await listModels({
            baseUrl,
            apiKey: read('apiKey'),
            provider: read('provider') === 'anthropic' ? 'anthropic' : '',
            headers: parseYamlBlock(read('headers')) ?? undefined,
            signal: controller.signal,
        });
        if (!current()) return;
        if (result.status !== 'ok') {
            if (status) status.textContent = result.error || '接口没给出模型列表，可以直接手填模型名。';
            return;
        }
        const modelInput = card.querySelector('[data-api-preset-field="model"]');
        if (modelInput) {
            let datalist = modelInput.list;
            if (!datalist || !datalist.isConnected) {
                datalist = document.createElement('datalist');
                datalist.id = `dai-preset-model-options-${id}`;
                modelInput.after(datalist);
                modelInput.setAttribute('list', datalist.id);
            }
            datalist.textContent = '';
            for (const model of result.models) {
                const option = document.createElement('option');
                option.value = model;
                datalist.appendChild(option);
            }
        }
        if (status) status.textContent = `拉到 ${result.models.length} 个模型，点模型名那一格就能选。`;
    } catch (error) {
        if (current() && status) status.textContent = `拉取失败：${error?.message ?? error}`;
    } finally {
        clearTimeout(timer);
        if (current() && button) button.disabled = false;
    }
}

/** 行动结算分类判定的连接与参数：mode 选 custom 时带上一整套自定义接口与采样覆盖。 */
function settleSettings() {
    const settle = currentSettings().settle ?? {};
    // 玩家自定义判定：只认 id+名字+提示词齐全的条目；名字最长 12 字，最多 8 个。
    const customCategories = (Array.isArray(settle.customCategories) ? settle.customCategories : [])
        .filter(item => item && typeof item.id === 'string' && item.id.trim()
            && typeof item.name === 'string' && item.name.trim()
            && typeof item.prompt === 'string')
        .slice(0, 8)
        .map(item => ({ id: item.id.trim(), name: item.name.trim().slice(0, 12), prompt: item.prompt }));
    return {
        customCategories,
        // 绑定了 API设置方案整套走方案；没绑＝跟随酒馆主连接。
        // 分类判定与最终判定共用一套 API（用户拍板）：旧分类管线也走 resultApiPreset。
        overrides: presetOverrides('settleResult') ?? { connection: 'tavern' },
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
        // 行动结算·最终判定：开关 / 独立方案绑定 / 提示词覆盖。
        resultEnabled: settle.resultEnabled !== false,
        resultOverrides: presetOverrides('settleResult') ?? { connection: 'tavern' },
        resultPrompt: typeof settle.resultPrompt === 'string' && settle.resultPrompt.trim() ? settle.resultPrompt.trim() : SETTLE_RESULT_PROMPT,
    };
}

/** 世界决定的连接与参数：结构同结算，跟酒馆或整套自定义接口，0 ＝不指定。 */
function worldDecideSettings() {
    const world = currentSettings().world ?? {};
    return {
        enabled: world.decideEnabled !== false,
        auto: world.decideAuto !== false,
        maxFloors: Number.isInteger(world.decideMaxFloors) && world.decideMaxFloors > 0 ? Math.min(12, world.decideMaxFloors) : 6,
        maxEntries: Number.isInteger(world.decideMaxEntries) && world.decideMaxEntries >= 0 ? Math.min(40, world.decideMaxEntries) : 12,
        prompt: typeof world.decidePrompt === 'string' && world.decidePrompt.trim() ? world.decidePrompt.trim() : WORLD_DECIDE_PROMPT,
        // 绑定了 API设置方案整套走方案；没绑＝跟随酒馆主连接。
        overrides: presetOverrides('world') ?? { connection: 'tavern' },
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
// 楼层防重：生成失败也会广播 GENERATION_ENDED，auto 决定只对没决定过的 AI 楼层跑一次。
let worldDecidedFloor = null;

/**
 * LLM 决定脚本执行的主入口：读聊天记录 + 世界书 + 世界台账 → 模型决定 →
 * 脚本逐条校验执行 → 结果呈现到面板。生成结束后自动跑，面板按钮可手动跑。
 */
async function runWorldDecision({ source = 'auto' } = {}) {
    const settings = worldDecideSettings();
    if (!settings.enabled) return { status: 'disabled' };
    if (worldDecideRunning) return { status: 'busy' };
    // 自定义连接有自己的地址和密钥，不依赖全局配置；跟随酒馆才需要先检查全局连接。
    if (settings.overrides.connection !== 'custom' && agentLlmClient.availableFor('tavern') !== true) {
        setWorldDecideStatus('模型连接未配置：先在“模型设置”页选好连接。');
        return { status: 'not_configured' };
    }
    // auto 模式楼层防重：失败生成/旧楼层不重复决定；manual 按钮不受限。
    const worldReplyFloor = lastReplyIndex(Array.isArray(getHostContext()?.chat) ? getHostContext().chat : []);
    if (source === 'auto') {
        if (worldReplyFloor < 0) return { status: 'no_reply' };
        if (worldDecidedFloor?.floor === worldReplyFloor && worldDecidedFloor.continuation.current()) return { status: 'already_decided' };
    }
    const continuation = captureAgentContinuation();
    worldDecideRunning = continuation;
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
        // 沙盒口径：世界书整条换血——不带条目，改带内置斗气大陆基线。
        const recentText = floors.map(floor => floor.text).join('\n');
        const sandbox = sandboxModeActive();
        const hits = !sandbox && settings.maxEntries > 0 && agentFactsIndex.stats().total > 0
            ? agentFactsIndex.matchTokens(recentText, { limit: settings.maxEntries, volume: currentVolumeForWorld() })
            : [];
        const bookLines = hits.map(hit => {
            const entry = agentFactsIndex.get(hit.uid);
            return entry ? `${entry.uid}|${entry.category}|${entry.name}|${entry.summary}` : null;
        }).filter(Boolean);
        let user = buildDecideUser({ snapshot: agentWorldRuntime.snapshot(), floors, worldbookLines: bookLines });
        if (sandbox) {
            const modeRecord = agentSandboxMode.read(currentAgentScope());
            const sandboxSettings = currentSettings().sandbox;
            const note = buildSandboxDecideNote({
                inertia: modeRecord.status === 'ready' ? modeRecord.inertia : sandboxSettings.inertia,
                canonCharactersAutonomous: modeRecord.status === 'ready' ? modeRecord.canonCharactersAutonomous : sandboxSettings.canonCharactersAutonomous,
            });
            user = `${user}\n${note}\n\n${SANDBOX_WORLD_PROMPT}`;
        }
        const raw = await agentLlmClient.complete({
            label: '世界决定',
            system: settings.prompt,
            user,
            jsonSchema: DECIDE_JSON_SCHEMA,
            overrides: settings.overrides,
        });
        if (!continuation.current()) return { status: 'stale' };
        const decision = parseDecision(raw);
        if (decision.status === 'invalid') {
            setWorldDecideStatus(`模型输出无法解析：${decision.error}`);
            return { status: 'invalid', error: decision.error };
        }
        const result = agentWorldRuntime.apply(decision.ops, { source: 'decide', floor: worldReplyFloor });
        worldDecidedFloor = { floor: worldReplyFloor, continuation };
        if (!result.applied.length) agentWorldRuntime.note(decision.note || '模型判断本轮世界无变化。', { source: 'decide' });
        persistWorld();
        renderWorldDecisionResult(decision, result);
        setWorldDecideStatus(source === 'auto' ? '生成后自动决定完成。' : '决定完成。');
        refreshWorldPage();
            return { status: 'ok', decision, result };
    } catch (error) {
        if (!continuation.current()) return { status: 'stale' };
        setWorldDecideStatus(`决定失败：${error?.message ?? error}`);
        return { status: 'failed', reason: String(error?.message ?? error) };
    } finally {
        if (worldDecideRunning === continuation) worldDecideRunning = false;
    }
}

let memoryDecideRunning = false;
// 楼层防重：同世界决定，auto 决定只对没决定过的 AI 楼层跑一次。
let memoryDecidedFloor = null;

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
 * 记忆决定：读"最近聊天 + 相关世界书条目 + 记忆总账"，决定主角新记住了什么；
 * 输出严格 JSON 由脚本逐条校验落账（memory-runtime）。生成结束后自动跑；面板按钮或命名空间也能手动触发。
 */
/** 整合到期判定与小记忆候选（与 runMemoryConsolidation 同一口径，但按"本轮再记一条就到阈值"提前一轮备战：
 *  合并调用里，本轮正文的新小记忆落账后也会并入整合批，大记忆不必再等下一次调用）。 */
function smallsForConsolidation(snapshot, settings) {
    const threshold = Number(settings.consolidateAfter);
    if (!Number.isInteger(threshold) || threshold <= 0) return [];
    const smalls = (Array.isArray(snapshot?.entries) ? snapshot.entries : []).filter(entry => entry.tier === 'small');
    return smalls.length >= 1 && smalls.length + 1 >= threshold ? smalls : [];
}

async function runMemoryDecision({ source = 'auto' } = {}) {
    const settings = memorySettings();
    if (!settings.enabled) return { status: 'disabled' };
    if (!settings.decideEnabled) return { status: 'disabled' };
    if (memoryDecideRunning) return { status: 'busy' };
    // 自定义连接有自己的地址和密钥，不依赖全局配置；跟随酒馆才需要先检查全局连接。
    if (settings.overrides.connection !== 'custom' && agentLlmClient.availableFor('tavern') !== true) {
        setMemoryDecideStatus('模型连接未配置：先在"模型设置"页选好连接。');
        return { status: 'not_configured' };
    }
    // auto 模式楼层防重：失败生成/旧楼层不重复决定；manual 按钮不受限。
    const memoryReplyFloor = lastReplyIndex(Array.isArray(getHostContext()?.chat) ? getHostContext().chat : []);
    if (source === 'auto') {
        if (memoryReplyFloor < 0) return { status: 'no_reply' };
        if (memoryDecidedFloor?.floor === memoryReplyFloor && memoryDecidedFloor.continuation.current()) return { status: 'already_decided' };
    }
    const continuation = captureAgentContinuation();
    memoryDecideRunning = continuation;
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
        // 总结式记忆：输入只带现有清单与最近聊天，正文总结不需要世界书/召回材料。
        // 整合到期时一次调用两件事：本轮总结 + 把现有小记忆整批提炼成大记忆（consolidate 字段）。
        const snapshotBefore = agentMemoryRuntime.snapshot();
        const consolidateCandidates = smallsForConsolidation(snapshotBefore, settings);
        const user = buildMemoryDecideUser({ snapshot: snapshotBefore, floors, consolidateIds: consolidateCandidates.map(entry => entry.id) });
        const raw = await agentLlmClient.complete({
            label: '记忆决定',
            system: settings.prompt,
            user,
            jsonSchema: MEMORY_JSON_SCHEMA,
            overrides: settings.overrides,
        });
        if (!continuation.current()) return { status: 'stale' };
        const decision = parseMemoryDecision(raw);
        if (decision.status === 'invalid') {
            setMemoryDecideStatus(`模型输出无法解析：${decision.error}`);
            return { status: 'invalid', error: decision.error };
        }
        const capped = capRememberOps(decision.ops, 1);
        const result = agentMemoryRuntime.apply(capped.ops, { source: 'decide', floor: memoryReplyFloor, day: worldDay() });
        // 合并整合：模型在本次调用里顺带输出了大记忆 → 按候选编号收口（模型多报的编号会被 runtime 过滤），
        // 本轮正文刚落账的新小记忆也并入整合批——"最后一条小记忆"不必再等一次单独调用。
        let mergedConsolidate = null;
        if (consolidateCandidates.length && decision.consolidate) {
            const allowed = new Set(consolidateCandidates.map(entry => entry.id));
            const ids = (decision.consolidate.ids || []).filter(id => allowed.has(id));
            const newSmallIds = (agentMemoryRuntime.snapshot().entries || [])
                .filter(entry => entry.tier === 'small' && entry.floor === memoryReplyFloor)
                .map(entry => entry.id);
            for (const id of newSmallIds) if (!ids.includes(id)) ids.push(id);
            const merged = agentMemoryRuntime.consolidate({ ids, big: decision.consolidate, day: worldDay() });
            if (merged.ok) {
                mergedConsolidate = merged.summary;
                setMemoryConsolidateStatus(`已总结（与正文总结同一次调用）：${merged.summary}`);
            } else {
                agentMemoryRuntime.note(`合并整合没有落账：${merged.reason}（小记忆原样保留，稍后单独再试）`, { source: 'consolidate' });
            }
        }
        memoryDecidedFloor = { floor: memoryReplyFloor, continuation };
        if (!result.applied.length) agentMemoryRuntime.note(decision.note || '模型判断本轮无新记忆。', { source: 'decide' });
        persistMemory();
        renderMemoryDecisionResult(decision, result);
        setMemoryDecideStatus(source === 'auto' ? '生成后自动决定完成。' : '决定完成。');
        refreshMemoryPage();
        void runMemoryConsolidation({ source: 'auto' });
        return { status: 'ok', decision, result };
    } catch (error) {
        if (!continuation.current()) return { status: 'stale' };
        setMemoryDecideStatus(`决定失败：${error?.message ?? error}`);
        return { status: 'failed', reason: String(error?.message ?? error) };
    } finally {
        if (memoryDecideRunning === continuation) memoryDecideRunning = false;
    }
}

// ---------- 记忆总结：小记忆攒够阈值，一次调用提炼成一条大记忆 ----------

let memoryConsolidateRunning = false;

function setMemoryConsolidateStatus(message) {
    const panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null;
    const target = panel?.querySelector('[data-memory-consolidate-status]');
    if (target) target.textContent = message;
}

/**
 * 小记忆 → 大记忆的自动总结。决定（合并/独立）落账后调用，面板按钮可手动触发：
 * 开着（阈值>0）且小记忆攒够阈值时，把这批小记忆整体交给模型提炼成一条大记忆，
 * 原条目退役（转化，不是复制）。失败只记状态与流水，本轮已落账的记忆不受影响。
 * 连接沿用纳戒与记忆共用的那套决定连接（memory.decideMode/decideModel…）。
 */
async function runMemoryConsolidation({ source = 'auto' } = {}) {
    const settings = memorySettings();
    if (!settings.enabled) return { status: 'disabled' };
    if (memoryConsolidateRunning) return { status: 'busy' };
    const capturedMemory = JSON.stringify(agentMemoryRuntime.snapshot());
    const smalls = agentMemoryRuntime.snapshot().entries.filter(entry => entry.tier === 'small');
    if (source === 'auto' && (!settings.consolidateAfter || smalls.length < settings.consolidateAfter)) {
        return { status: 'below_threshold', count: smalls.length, threshold: settings.consolidateAfter };
    }
    if (!smalls.length) {
        if (source === 'manual') setMemoryConsolidateStatus('没有小记忆可总结。');
        return { status: 'nothing_to_consolidate' };
    }
    if (settings.consolidateOverrides.connection !== 'custom' && agentLlmClient.availableFor('tavern') !== true) {
        if (source === 'manual') setMemoryConsolidateStatus('模型连接未配置：先在"模型设置"页选好连接。');
        return { status: 'not_configured' };
    }
    const continuation = captureAgentContinuation();
    memoryConsolidateRunning = continuation;
    setMemoryConsolidateStatus(`正在把 ${smalls.length} 条小记忆总结成一条大记忆……`);
    try {
        const user = buildConsolidateUser({ entries: smalls, day: worldDay() });
        const raw = await agentLlmClient.complete({
            system: MEMORY_CONSOLIDATE_PROMPT,
            user,
            jsonSchema: MEMORY_CONSOLIDATE_JSON_SCHEMA,
            overrides: settings.consolidateOverrides,
            label: '记忆总结',
        });
        if (!continuation.current() || capturedMemory !== JSON.stringify(agentMemoryRuntime.snapshot())) return { status: 'stale' };
        const parsed = parseConsolidation(raw);
        if (parsed.status !== 'ok') {
            agentMemoryRuntime.note(`记忆总结没有解析成功：${parsed.error}（${smalls.length} 条小记忆原样保留）`, { source: 'consolidate' });
            persistMemory();
            setMemoryConsolidateStatus(`总结失败：${parsed.error}。小记忆原样保留，下次再试。`);
            return { status: 'invalid', error: parsed.error };
        }
        const result = agentMemoryRuntime.consolidate({ ids: smalls.map(entry => entry.id), big: parsed.big, day: worldDay() });
        if (!result.ok) {
            agentMemoryRuntime.note(`记忆总结没有落账：${result.reason}（${smalls.length} 条小记忆原样保留）`, { source: 'consolidate' });
            persistMemory();
            setMemoryConsolidateStatus(`总结没落成账：${result.reason}。小记忆原样保留。`);
            return { status: 'rejected', reason: result.reason };
        }
        persistMemory();
        refreshMemoryPage();
        setMemoryConsolidateStatus(`已总结：${result.summary}`);
        return { status: 'ok', ...result };
    } catch (error) {
        if (!continuation.current()) return { status: 'stale' };
        setMemoryConsolidateStatus(`总结调用失败：${error?.message ?? error}`);
        return { status: 'failed', reason: String(error?.message ?? error) };
    } finally {
        if (memoryConsolidateRunning === continuation) memoryConsolidateRunning = false;
    }
}

// ---------- 模型调用体检：每个功能最近一次调模型的结果 ----------

const CALLLOG_FUNCTIONS = Object.freeze([
    ['总管决定', '总管书记官（纳戒+记忆，一次调用）'],
    ['纳戒决定', '纳戒决定（独立调用）'],
    ['记忆决定', '记忆决定（独立调用）'],
    ['记忆召回', '记忆召回（挑选注入哪些记忆）'],
    ['记忆总结', '小记忆总结成大记忆'],
    ['世界决定', '世界主持人'],
    ['影响决定', '世界记录员'],
    ['场记挑选', '场记：挑选本轮注入的影响'],
    ['人物记录', '人物记录员'],
    ['档案抄录', '档案抄录员（按世界书补档案）'],
    ['冷藏推进', '冷藏推进员'],
    ['经历精简', '经历精简'],
    ['事实检索', '事实检索员'],
    ['意图解析', '意图解析'],
    ['行动判定', '行动判定'],
    ['行动结算', '行动结算（生成前直判本轮行动结果并注入）'],
    ['设定挑选', '设定挑选'],
    ['正文撰写', '正文撰写'],
]);

function formatCallDetail(item) {
    if (!item) return '';
    const time = typeof item.at === 'string' ? new Date(item.at).toLocaleTimeString() : '';
    const model = item.model ? ` · ${item.model}` : '';
    if (item.ok === true) return `${time} ✓ ${Math.round(Number(item.ms) || 0)}ms${model}`;
    return `${time} ✗ ${item.error || '失败'}${model ? `（${model}）` : ''}`;
}

/** 体检流水折成每功能一行：最近一次结果 + 次数；没调过的功能也占一行（未调用）。 */
function buildCallLogRows() {
    const log = typeof agentLlmClient?.callLog === 'function' ? agentLlmClient.callLog() : [];
    const byLabel = new Map();
    for (const item of log) {
        const key = typeof item?.label === 'string' && item.label ? item.label : '未标注调用';
        const bucket = byLabel.get(key) ?? { label: key, count: 0, last: null };
        bucket.count += 1;
        bucket.last = item;
        byLabel.set(key, bucket);
    }
    const rows = [];
    for (const [label, title] of CALLLOG_FUNCTIONS) {
        const bucket = byLabel.get(label);
        byLabel.delete(label);
        rows.push({
            label,
            title,
            state: bucket ? (bucket.last?.ok === true ? 'ok' : 'failed') : 'idle',
            count: bucket?.count ?? 0,
            detail: bucket ? formatCallDetail(bucket.last) : '本次会话还没调用过',
        });
    }
    // 名单外冒出来的调用（以后新增的功能）也照实列出。
    for (const [label, bucket] of byLabel) {
        rows.push({ label, title: '（名单外）', state: bucket.last?.ok === true ? 'ok' : 'failed', count: bucket.count, detail: formatCallDetail(bucket.last) });
    }
    return rows;
}

function renderCallLogList(panel) {
    const host = panel?.querySelector('[data-calllog-list]');
    if (!host) return;
    host.replaceChildren(...buildCallLogRows().map(item => {
        const line = document.createElement('p');
        line.className = 'dai-turn-result';
        line.textContent = `${item.state === 'ok' ? '✓' : item.state === 'failed' ? '✗' : '·'} ${item.label}（${item.title}）：${item.detail}${item.state === 'idle' ? '' : `，共 ${item.count} 次`}`;
        return line;
    }));
    // 面板开着时有新调用就自动刷新（llm-client 每记一笔广播一次）。
    if (!panel.dataset.calllogListening) {
        panel.dataset.calllogListening = '1';
        window.addEventListener('dai-calllog', () => {
            if (activeSettingsPage === 'overview' && document.contains(host)) renderCallLogList(panel);
        });
    }
}

/** 当前角色是谁：characterId 有的版本给数字、有的给字符串，一律数字化取；
 *  取不到再问酒馆助手角色仓库要 avatar。 */
function resolveCurrentCharacter(context) {
    const idx = Number(context?.characterId);
    if (Array.isArray(context?.characters) && Number.isInteger(idx) && context.characters[idx]) {
        return context.characters[idx];
    }
    try {
        const pinia = document.querySelector('#tavern_helper')?.__vue_app__?.config?.globalProperties?.$pinia;
        const avatar = pinia?._s?.get('character_setttings')?.avatar;
        if (typeof avatar === 'string' && avatar && Array.isArray(context?.characters)) {
            return context.characters.find(item => item?.avatar === avatar) ?? null;
        }
    } catch { /* 拿不到就认了 */ }
    return null;
}

/** 卡面脚本体检（只读，不代开）：酒馆助手的角色脚本启用弹窗一生只问一次，
 *  点过"取消"就永远静默——这里把"首楼按钮为什么点不动"直接说破。 */
function probeCoverScriptStatus() {
    try {
        // 实时读酒馆上下文：hostContext 是扩展启动时缓存的，开卡前缓存里没有角色信息。
        const context = (typeof window !== 'undefined' ? window.SillyTavern?.getContext?.() : null) ?? getHostContext();
        const character = resolveCurrentCharacter(context);
        if (!character) return { text: '当前没有打开任何角色聊天，等开卡后再看这里。' };
        const scripts = character?.data?.extensions?.tavern_helper?.scripts
            ?? character?.extensions?.tavern_helper?.scripts ?? [];
        if (!Array.isArray(scripts) || !scripts.length) {
            return { text: '这张卡没有内嵌卡面脚本，首楼卡面是纯展示。' };
        }
        const avatar = typeof character?.avatar === 'string' ? character.avatar : '';
        const store = document.querySelector('#tavern_helper')?.__vue_app__?.config?.globalProperties?.$pinia?._s?.get('global_settings') ?? null;
        const enabled = Array.isArray(store?.settings?.script?.enabled?.characters) ? store.settings.script.enabled.characters : null;
        if (enabled === null) {
            return { text: '没找到酒馆助手的全局设置，判断不了脚本启用状态。首楼按钮点不动时，去 酒馆助手 → 脚本库 → 角色脚本 手动打开这张卡的开关。' };
        }
        if (enabled.includes(avatar)) {
            const names = scripts.map(item => item?.name).filter(Boolean).join('、');
            return { text: `已启用（${names}）：首楼创建向导由它接管。` };
        }
        return { text: '未启用——这就是首楼按钮点不动的原因。去 酒馆助手 → 脚本库 → 角色脚本 打开这张卡的开关。注意：酒馆助手只在第一次打开这张卡时弹窗问一次，点过"取消"就永远不会再问，只能手动去开。' };
    } catch (error) {
        return { text: `检测失败：${error?.message ?? error}` };
    }
}

// ---------- 合并决定（方法 A）：纳戒+记忆共用一次调用 ----------

let unifiedDecideRunning = false;

/** 合并决定已退役：纳戒申报统一走 MVU 变量通道（仲裁器自动裁决），记忆走独立决定。
 *  保留函数名只为兼容旧调用点；恒 false 让记忆注入/手动按钮全部回落到独立通道。 */
function unifiedActive() {
    return false;
}

/**
 * 合并决定（已退役）：曾经一次调用同时产出纳戒 ops、记忆 ops 和 cited（本轮用到的旧记忆编号）。
 * 纳戒申报现走 MVU 变量通道（仲裁器自动裁决），记忆走独立决定；函数只保留兼容旧调用点。
 */
async function runUnifiedDecision({ source = 'auto' } = {}) {
    // 合并决定已退役：纳戒走 MVU 变量通道（仲裁器自动裁决），记忆需要时直接走独立决定。
    setSelfDecideStatus('合并决定已退役：纳戒经 MVU 变量通道自动仲裁；需要记忆决定请用记忆页的按钮。');
    return { status: 'retired' };
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
    if (plan.decide.connection !== 'custom' && agentLlmClient.availableFor('tavern') !== true) {
        setImpactStatus('模型连接未配置：先在“模型设置”页选好连接。');
        return { status: 'not_configured' };
    }
    const continuation = captureAgentContinuation();
    impactDecideRunning = continuation;
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
        // 沙盒口径不用世界书：影响记录员只看聊天与世界台账。
        const hits = !sandboxModeActive() && settings.decideMaxEntries > 0 && agentFactsIndex.stats().total > 0
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
            label: '影响决定',
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
                ...planExtras(plan.decide),
            },
        });
        if (!continuation.current()) return { status: 'stale' };
        const decision = parseImpactDecision(raw);
        if (decision.status === 'invalid') {
            setImpactStatus(`记录员输出无法解析：${decision.error}`);
            return { status: 'invalid', error: decision.error };
        }
        const result = agentImpactRuntime.apply(decision.ops, { source: 'decide', floor: lastReplyIndex(chat), day: worldDay() });
        if (!result.applied.length) agentImpactRuntime.note(decision.note || '世界线没有偏移。', { source: 'decide' });
        persistImpact();
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
        if (!continuation.current()) return { status: 'stale' };
        const message = error?.code === 'llm_custom_not_configured'
            ? '记录员设成了“自定义模型”，但接口地址或模型名还没填全（填在“世界影响 → 记录员与场记的模型”里，或改回跟随酒馆）。'
            : `世界记录失败：${error?.message ?? error}`;
        setImpactStatus(message);
        return { status: 'failed', reason: String(message) };
    } finally {
        if (impactDecideRunning === continuation) impactDecideRunning = false;
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
        getScope: () => {
            const scope = currentAgentScope();
            const matches = agentActiveScope?.sessionId === scope.sessionId && agentActiveScope?.branchId === scope.branchId;
            return { ...scope, taskIds: matches ? [...(agentActiveScope.taskIds ?? [])] : [] };
        },
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
    settleAdjudicate: options => writeSettleAdjudicationForPrompt(typeof options === 'object' && options ? options : {}),
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
    selfApplyPersisted: (operations, context) => applySelfOps(operations, context),
    selfApplyFromLatestReply: () => applySelfOpsFromLatestReply(),
    selfRestoreFromChat: () => restoreSelfFromChat(),
    selfStatus: () => agentSelfRuntime.status(),
    selfSnapshot: () => agentSelfRuntime.snapshot(),
    selfMvuStatus: () => agentSelfMvu.status(),
    selfMvuSync: () => agentSelfMvu.sync(agentSelfRuntime.snapshot()),
    mvuArbitrate: () => agentMvuArbiter.runArbitration({ source: 'manual' }),
    worldPersist: () => { persistWorld(); return 'ok'; },
    selfJournal: () => agentSelfRuntime.journal(),
    dbBridgeStatus: () => agentDbBridge.status(),
    dbBridgeAdopt: () => Promise.all([adoptSelfFromDb(), adoptMemoryFromDb()]),
    memoryRuntime: agentMemoryRuntime,
    memoryInjection: writeMemoryInjectionForPrompt,
    memoryRecall: runMemoryRecall,
    memoryDecide: options => runMemoryDecision(options),
    unifiedDecide: options => runUnifiedDecision(options),
    factsSelect: options => agentFactsSelector.select(options),
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
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'dai-agent-modal-title');
    dialog.tabIndex = -1;
    const head = makeElement('header', 'dai-agent-modal-head');
    const title = makeElement('b', 'dai-agent-modal-title');
    title.id = 'dai-agent-modal-title';
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
    if (modal.hidden) modal.__returnFocus = document.activeElement;
    modal.__agentOwner = captureAgentContinuation();
    const npcName = dock.dataset?.npcProfile;
    modal.__agentNpc = npcName ? { name: npcName, snapshot: JSON.stringify(agentNpcLedger.get(npcName)) } : null;
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
    (dock.querySelector?.('input, textarea, select, button') ?? modal.querySelector('.dai-agent-modal-dialog'))?.focus?.();
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
    modal.__agentOwner = null;
    modal.__pendingSave = null;
    if (modal.__returnFocus?.isConnected) modal.__returnFocus.focus?.();
    return true;
}

function agentModalCurrent(panel) {
    const modal = panel?.querySelector?.(':scope > [data-agent-modal]');
    if (!modal || modal.hidden) return true;
    const current = modal.__agentOwner?.current() === true
        && (modal.__pendingSave || !modal.__agentNpc || modal.__agentNpc.snapshot === JSON.stringify(agentNpcLedger.get(modal.__agentNpc.name)));
    if (!current) setNpcLedgerStatus('此表单已过期：聊天或档案已变更，请重新打开后编辑。');
    return Boolean(current);
}

function trapAgentDialogFocus(panel, event) {
    if (event.key !== 'Tab') return;
    const modal = panel.querySelector(':scope > [data-agent-modal]');
    const dialog = modal && !modal.hidden ? modal.querySelector('.dai-agent-modal-dialog') : panel;
    const controls = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]')].filter(el => el.getClientRects().length);
    const first = controls[0] ?? dialog, last = controls.at(-1) ?? dialog;
    if (!dialog.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last) || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
    }
}

async function awaitPanelPersistence(result, report = () => {}, owner = null) {
    if (!owner || owner.current()) report('正在保存到聊天存档…');
    let saved;
    try { saved = await result?.persistence; } catch (error) { saved = { status: 'failed', reason: error?.message }; }
    if (owner && !owner.current()) return false;
    if (saved?.status === 'saved') return true;
    report('内存已变更，但存档未保存。请保留表单并重试保存；不要重复登记。');
    return false;
}

async function panelMutation(panel, operations, apply, persist, report = () => {}) {
    if (!agentModalCurrent(panel)) return { status: 'stale', applied: [], rejected: [] };
    const modal = panel?.querySelector?.(':scope > [data-agent-modal]');
    const holder = modal && !modal.hidden ? modal : panel;
    const owner = modal && !modal.hidden ? modal.__agentOwner : captureAgentContinuation();
    const key = JSON.stringify(operations);
    let pending = holder.__pendingSave;
    // 上一笔回执属于已失效的聊天/轮次：直接作废，绝不能把旧聊天的变更重放到当前账上。
    if (pending && !pending.owner?.current()) { holder.__pendingSave = null; pending = null; }
    if (pending && pending.persist !== persist) { report('上一笔内存变更尚未保存，请先重试原操作。'); return { status: 'pending_save', applied: [], rejected: [] }; }
    if (pending?.busy) return { status: 'busy', applied: [], rejected: [] };
    if (pending && pending.key !== key) { report('草稿已改动，但上一笔尚未保存；请先恢复原输入重试保存。'); return { status: 'pending_save', applied: [], rejected: [] }; }
    if (!pending) {
        const result = apply(operations);
        if (!result.applied?.length && !result.persistence && !['updated', 'added', 'removed', 'selected', 'deselected', 'cleared'].includes(result.status)) return result;
        pending = holder.__pendingSave = { key, result, persist, owner, busy: false };
    } else pending.result.persistence = persist();
    pending.busy = true;
    const saved = await awaitPanelPersistence(pending.result, report, owner);
    pending.busy = false;
    if (!saved) return { ...pending.result, status: owner?.current() ? 'save_failed' : 'stale', applied: [] };
    if (holder.__pendingSave === pending) holder.__pendingSave = null;
    return pending.result;
}

/** 面板级委托：点 data-modal-open 把对应 dock 搬进弹窗，点关闭/背板送回去。 */
function bindModalActions(panel) {
    panel.addEventListener('click', event => {
        if (event.target.closest?.('[data-agent-modal-close]')) {
            // 有未落档的待保存回执时不允许手动关：关了重试上下文就没了，等于悄悄丢掉那笔内存变更。
            const modal = panel.querySelector(':scope > [data-agent-modal]');
            if (modal && !modal.hidden && modal.__pendingSave) return;
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

/** 把设置里记下的位置贴到球上；没记过（x/y 是 null）就留在 CSS 默认的右侧。 */
function applyOrbPosition() {
    if (!orbElement || typeof window === 'undefined') return;
    const saved = currentSettings().orb ?? {};
    // 默认设置里 x/y 是 null：Number(null) 是 0，不能直接当坐标，否则新装的球会被钉到左上角。
    const x = saved.x === null || saved.x === undefined || saved.x === '' ? NaN : Number(saved.x);
    const y = saved.y === null || saved.y === undefined || saved.y === '' ? NaN : Number(saved.y);
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

// ---- 滚轮接力：悬浮层（设置面板/球）里的滚动盒子滑到头后，滚轮要接着往外滚——
// 清单→页面主区→主界面（酒馆聊天区 #chat）。原生滚动链走不通这条路：面板是
// position:fixed 的弹层，往上链到 body 就断了（body 不滚），表现就是“滑到底不动了”。
// 这里自己沿 DOM 由内向外接力：每层吃多少算多少，吃剩的交外层，全链到头才落到主界面。
const SCROLL_RELAY_SELECTOR = '.dai-settings-panel, .dai-orb';
let scrollRelayBound = false;

function wheelDeltaPixels(event) {
    if (event.deltaMode === 1) return event.deltaY * 40;
    if (event.deltaMode === 2) return event.deltaY * window.innerHeight;
    return event.deltaY;
}

function scrollBoxVertical(el) {
    const cs = getComputedStyle(el);
    return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight;
}

function scrollBoxCanTake(el, dy) {
    if (dy > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    return el.scrollTop > 1;
}

function mainInterfaceScroller() {
    const chat = document.getElementById('chat');
    if (chat && chat.scrollHeight > chat.clientHeight) return chat;
    return document.scrollingElement;
}

function relayWheelToInterface(event) {
    if (event.defaultPrevented || event.ctrlKey) return;
    const dy = wheelDeltaPixels(event);
    // 横向滚动（横向清单/相册）不接手，交给原生；主滚向是纵向才接管。
    if (!dy || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const root = event.target?.closest?.(SCROLL_RELAY_SELECTOR);
    if (!root) return;
    // 由内往外收这条链上的纵向滚动盒（含根自己），一次滚量逐层分摊。
    const chain = [];
    for (let node = event.target; node; node = node.parentElement) {
        if (node.nodeType === 1 && scrollBoxVertical(node)) chain.push(node);
        if (node === root) break;
    }
    // 整条链由接力接管，拦掉默认滚动，免得原生再滚一遍内层。
    event.preventDefault();
    let remaining = dy;
    for (const el of chain) {
        if (!remaining) break;
        if (!scrollBoxCanTake(el, remaining)) continue;
        const before = el.scrollTop;
        el.scrollTop += remaining;
        remaining -= el.scrollTop - before;
    }
    if (remaining) {
        const main = mainInterfaceScroller();
        if (main && scrollBoxCanTake(main, remaining)) main.scrollTop += remaining;
    }
}

function bindScrollRelay() {
    if (scrollRelayBound || typeof document === 'undefined') return;
    scrollRelayBound = true;
    // passive:false 才拦得住默认滚动。
    document.addEventListener('wheel', relayWheelToInterface, { passive: false });
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
        // 系统图标：一键打开 Agent 设置面板（左上角的旧入口已退役）。
        const systemIcon = makeElement('button', 'dai-orb-icon', '⚙');
        systemIcon.type = 'button';
        systemIcon.dataset.orbItem = 'system';
        systemIcon.title = 'Agent 系统 · 一点开就出设置面板';
        systemIcon.setAttribute('aria-label', '打开 Agent 系统设置');
        systemIcon.addEventListener('click', () => openSettingsPanel());
        capsule.append(systemIcon);
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
            if (event.key !== 'Escape' || !orbElement) return;
            // 一层层往回退：先收详情小卡，再收「全部」副窗，最后才收长条。
            if (orbNpcPopElement) { closeOrbNpcPopup(); return; }
            if (orbItemPopElement) { closeOrbItemPopup(); return; }
            if (orbListPopElement) { closeOrbListPopup(); return; }
            if (orbState.collapsed) return;
            orbState.collapse();
            syncOrbHud();
        };
        document.addEventListener('keydown', orbDocumentKey);
    }
    if (!orbResizeBound) {
        orbResizeBound = true;
        window.addEventListener('resize', () => { applyOrbPosition(); positionOrbNpcPopup(); positionOrbItemPopup(); positionOrbListPopup(); });
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
    // 小卡只跟着人物簿窗走：收起、关窗或换到别的图标都把它带走。
    if (orbState.collapsed || orbState.panelId !== 'npcledger') closeOrbNpcPopup();
    // 详情小卡与「全部」副窗跟着各自的信息窗走：收起或换图标都收走。
    if (orbItemPopElement && (orbState.collapsed || orbItemPopRef?.panelId !== orbState.panelId)) closeOrbItemPopup();
    if (orbListPopElement && (orbState.collapsed || orbListPopRef?.panelId !== orbState.panelId)) closeOrbListPopup();
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
    // 回合状态事件带来的新数据也要进小卡与副窗：开着就照着最新数据重画。
    const itemRef = orbItemPopElement && orbItemPopRef;
    if (orbListPopElement && orbListPopRef) openOrbListPopup(orbListPopRef.index, orbListPopRef.offset ?? 0);
    if (orbNpcPopElement && orbNpcPopName) openOrbNpcPopup(orbNpcPopName);
    if (itemRef) openOrbItemPopup(itemRef);
}

/** 收集十一个信息窗的只读数据；哪路运行时没就绪就缺哪块，窗里显示“暂无”。 */
function collectOrbData() {
    const settings = currentSettings();
    const safe = getter => { try { return getter(); } catch { return undefined; } };
    const manualVolume = Number.isInteger(settings.setting?.progress) && settings.setting.progress > 0 ? settings.setting.progress : null;
    const autoVolume = Number.isInteger(settings.facts?.currentVolume) && settings.facts.currentVolume > 0 ? settings.facts.currentVolume : null;
    const volume = manualVolume ?? autoVolume;
    return {
        calls: safe(() => agentLlmClient.callLog()) ?? [],
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
        memory: { status: safe(() => agentMemoryRuntime.status()), snapshot: safe(() => agentMemoryRuntime.snapshot()), lastInjection: memoryLastInjectionView() },
        settle: { lastAdjudication: settleAdjudicationView() },
        npcledger: { status: safe(() => agentNpcLedger.status()), records: safe(() => agentNpcLedger.list()) },
        cold: {
            status: safe(() => agentNpcColdRuntime.status()),
            records: safe(() => agentNpcLedger.list()),
            lastFloor: safe(() => lastReplyIndex(Array.isArray(getHostContext()?.chat) ? getHostContext().chat : [])),
        },
        impact: { status: safe(() => agentImpactRuntime.status()), records: safe(() => agentImpactRuntime.list({ state: 'active' })) },
        facts: {
            stats: safe(() => agentFactsIndex.stats()),
            worldbook: typeof settings.setting?.worldbook === 'string' ? settings.setting.worldbook.trim() : '',
            volume: { label: volume ? `第 ${volume} 卷（${manualVolume !== null ? '手动' : '自动'}）` : '' },
            lastInjection: safe(() => agentPromptInjection.inspect().last),
            entryName: uid => { try { return agentFactsIndex.get(uid)?.name ?? `#${uid}`; } catch { return `#${uid}`; } },
        },
        mirror: { bridge: safe(() => agentDbBridge.status()), mvu: safe(() => agentSelfMvu.status()) },
        journal: { records: safe(() => agentAuditLog.list({ limit: 40 })) },
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
    view.lists.forEach((group, index) => {
        const block = makeElement('div', 'dai-orb-group');
        const groupHead = makeElement('div', 'dai-orb-group-head');
        groupHead.append(makeElement('b', 'dai-orb-group-title', group.heading));
        // 主信息窗每栏只摆最新几条，装不下的收进「全部」副窗（副窗自己滚动）。
        if (group.total > group.items.length) {
            const all = makeElement('button', 'dai-orb-group-all', '全部');
            all.type = 'button';
            all.title = `查看全部 ${group.total} 条`;
            all.dataset.orbGroupAll = String(index);
            all.setAttribute('aria-label', `查看全部${group.heading}（${group.total} 条）`);
            all.addEventListener('click', () => toggleOrbListPopup(index));
            groupHead.append(all);
        }
        block.append(groupHead);
        if (!group.items.length) {
            block.append(makeElement('p', 'dai-orb-empty', group.empty));
        } else {
            for (const item of group.items) block.append(buildOrbEntryCard(item));
        }
        body.append(block);
    });
    panel.replaceChildren(heading, body);
}

/** 条目卡：主信息窗与「全部」副窗共用一套长相，带引用的都能点开详情小卡。 */
function buildOrbEntryCard(item) {
    const card = makeElement('div', 'dai-orb-entry');
    card.append(makeElement('b', '', item.head));
    if (item.meta) card.append(makeElement('small', '', item.meta));
    if (item.detail) card.append(makeElement('p', '', item.detail));
    // 带引用的条目都能点开：人物簿弹完整档案小卡，其余按引用弹各自的详情小卡，都贴在信息窗旁。
    if (item.ref) {
        card.classList.add('is-clickable');
        if (item.ref.kind === 'npc') card.dataset.orbNpc = item.ref.id;
        card.title = '点开查看详情';
        card.setAttribute('role', 'button');
        card.tabIndex = 0;
        card.addEventListener('click', () => toggleOrbItemPopup(item.ref));
        card.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            toggleOrbItemPopup(item.ref);
        });
    }
    return card;
}

// —— 悬浮球「全部」副窗：点栏目标题右边的「全部」，在信息窗旁边弹出这一栏的全量清单。
// 副窗自己滚动（长清单不撑破屏幕），条目照样能点开详情小卡；换栏目/收起/Esc 一起收走。——
let orbListPopElement;
let orbListPopRef = null;

function toggleOrbListPopup(index) {
    if (orbListPopRef?.index === index) closeOrbListPopup();
    else openOrbListPopup(index);
}

function closeOrbListPopup() {
    orbListPopElement?.remove();
    orbListPopElement = undefined;
    orbListPopRef = null;
}

/** 按当前栏目的全量条目重画副窗；栏目标题与条数都照最新数据来。 */
function openOrbListPopup(index, offset = 0) {
    if (!orbElement || !orbState.panelId) return;
    const view = buildOrbPanels(collectOrbData())[orbState.panelId];
    const base = view?.lists?.[index];
    const group = base?.getPage ? { ...base, ...base.getPage(offset) } : base;
    if (!group) { closeOrbListPopup(); return; }
    closeOrbItemPopup();
    orbListPopElement?.remove();
    orbListPopElement = buildOrbListPopup(group, view);
    orbListPopRef = { panelId: orbState.panelId, index, offset: group.offset ?? 0 };
    orbElement.append(orbListPopElement);
    positionOrbListPopup();
}

function buildOrbListPopup(group, view) {
    const pop = makeElement('aside', 'dai-orb-pop dai-orb-pop-list');
    pop.dataset.orbListPop = group.heading;
    const head = makeElement('div', 'dai-orb-pop-head');
    const titleBox = makeElement('div');
    const nameLine = makeElement('div', 'dai-orb-pop-name');
    nameLine.append(makeElement('b', '', group.heading), makeElement('small', '', `${group.total} 条`));
    titleBox.append(nameLine);
    if (view?.title) titleBox.append(makeElement('small', 'dai-orb-pop-sub', `${view.icon} ${view.title} · 全部`));
    const close = makeElement('button', 'dai-orb-pop-close', '×');
    close.type = 'button';
    close.title = '收起全部清单';
    close.setAttribute('aria-label', `收起${group.heading}的全部清单`);
    close.addEventListener('click', closeOrbListPopup);
    head.append(titleBox, close);
    pop.append(head);
    // 装备「全部」副窗顶部带一张小型人形图：穿戴中的装备按身体部位挂位。
    if (view?.title === '纳戒' && group.heading === '装备') {
        const snapshot = agentSelfRuntime.snapshot();
        const equipped = [
            ...(Array.isArray(snapshot?.equipment) ? snapshot.equipment : []),
            ...(Array.isArray(snapshot?.items) ? snapshot.items : []).filter(item => item.equipped === true),
        ];
        pop.append(renderEquipmentFigure(equipped, { compact: true }));
    }
    const body = makeElement('div', 'dai-orb-pop-list-body');
    if (!group.all.length) body.append(makeElement('p', 'dai-orb-empty', group.empty));
    else for (const item of group.all) body.append(buildOrbEntryCard(item));
    if (group.getPage) {
        const pager = makeElement('div', 'dai-turn-actions');
        for (const [label, offset, disabled] of [['上一页', Math.max(0, (group.offset ?? 0) - 200), !group.offset], ['下一页', (group.offset ?? 0) + 200, !group.hasMore]]) {
            const button = makeElement('button', 'dai-secondary-button', label);
            button.type = 'button'; button.disabled = disabled;
            button.addEventListener('click', () => openOrbListPopup(orbListPopRef.index, offset));
            pager.append(button);
        }
        pager.append(makeElement('small', '', `第 ${(group.offset ?? 0) + 1}–${(group.offset ?? 0) + group.all.length} / ${group.total} 条`));
        body.append(pager);
    }
    pop.append(body);
    return pop;
}

function positionOrbListPopup() {
    positionOrbPopElement(orbListPopElement);
}

// —— 悬浮球人物小卡：点人物簿信息窗里的一行，贴在信息窗外侧弹出只读小档案。——
// 卡挂在 orbElement 里：点卡不算点外面，长条不会因此收起；换图标/收起/Esc 才关。——
let orbNpcPopElement;
let orbNpcPopName = null;

function toggleOrbNpcPopup(name) {
    if (orbNpcPopName === name) closeOrbNpcPopup();
    else openOrbNpcPopup(name);
}

function closeOrbNpcPopup() {
    orbNpcPopElement?.remove();
    orbNpcPopElement = undefined;
    orbNpcPopName = null;
}

function openOrbNpcPopup(name) {
    if (!orbElement) return;
    const record = agentNpcLedger.get(name);
    if (!record) { closeOrbNpcPopup(); return; }
    closeOrbItemPopup();
    orbNpcPopElement?.remove();
    orbNpcPopElement = buildOrbNpcPopup(record);
    orbNpcPopName = record.name;
    orbElement.append(orbNpcPopElement);
    positionOrbNpcPopup();
}

/** 小卡内容：抬头（名字/好感/别名称号）+ 角标 + 只挑有内容的字段按组列 + 最近经历与流水。 */
function buildOrbNpcPopup(record) {
    const pop = makeElement('aside', 'dai-orb-pop');
    pop.dataset.orbNpcPop = record.name;
    const head = makeElement('div', 'dai-orb-pop-head');
    const titleBox = makeElement('div');
    const nameLine = makeElement('div', 'dai-orb-pop-name');
    nameLine.append(
        makeElement('b', '', record.name),
        makeElement('small', '', `${record.favor > 0 ? '+' : ''}${record.favor} ${favorLabel(record.favor) || '未定'}`),
    );
    titleBox.append(nameLine);
    const subs = [];
    if (record.aliases.length) subs.push(`别名：${record.aliases.join('、')}`);
    if (record.titles.length) subs.push(`称号：${record.titles.join('、')}`);
    if (subs.length) titleBox.append(makeElement('small', 'dai-orb-pop-sub', subs.join('　')));
    head.append(titleBox);
    const close = makeElement('button', 'dai-orb-pop-close', '×');
    close.type = 'button';
    close.title = '收起小卡';
    close.setAttribute('aria-label', `收起${record.name}的小档案`);
    close.addEventListener('click', closeOrbNpcPopup);
    head.append(close);
    pop.append(head);

    const chips = makeElement('div', 'dai-orb-pop-chips');
    chips.append(makeElement('span', 'dai-profile-chip', record.presence === '在场' ? '● 在场' : '○ 不在场'));
    if (record.importance === '重要') chips.append(makeElement('span', 'dai-profile-chip is-accent', '★ 重要'));
    if (record.location) chips.append(makeElement('span', 'dai-profile-chip', `@${record.location}`));
    if (record.identity) chips.append(makeElement('span', 'dai-profile-chip', record.identity));
    pop.append(chips);

    const groups = new Map();
    // 身份已经做成角标，小卡里不再重复一行；设置页大面板保留这行不动。
    const popSkip = new Set([...NPC_READ_SKIP, 'identity']);
    for (const field of NPC_FIELDS) {
        if (popSkip.has(field.key)) continue;
        const display = npcProfileReadText(field, record[field.key]);
        if (!display) continue;
        if (!groups.has(field.group)) groups.set(field.group, []);
        groups.get(field.group).push([field.label, display]);
    }
    for (const [groupName, rows] of groups) {
        const block = makeElement('section', 'dai-orb-pop-group');
        block.append(makeElement('b', '', groupName));
        for (const [label, value] of rows) {
            const line = makeElement('div', 'dai-profile-row');
            line.append(makeElement('span', 'dai-profile-label', label), makeElement('span', 'dai-profile-value', value));
            block.append(line);
        }
        pop.append(block);
    }
    // 近况：最近三条流水（❄＝冷藏自行活动）——主栏目只留一行简况，长内容收在这里。
    if (record.log.length) {
        const block = makeElement('section', 'dai-orb-pop-group');
        block.append(makeElement('b', '', '近况'));
        for (const entryItem of [...record.log].reverse().slice(0, 3)) {
            const line = makeElement('div', 'dai-profile-row');
            const day = entryItem.day !== null && entryItem.day !== undefined ? `第${entryItem.day}天` : '';
            line.append(
                makeElement('span', 'dai-profile-label', day || '—'),
                makeElement('span', 'dai-profile-value', `${entryItem.src === '冷藏' ? '❄ ' : ''}${entryItem.text}`),
            );
            block.append(line);
        }
        pop.append(block);
    }

    if (record.exp.length) {
        const block = makeElement('section', 'dai-orb-pop-group');
        block.append(makeElement('b', '', '经历'));
        for (const item of [...record.exp].reverse().slice(0, 3)) {
            block.append(makeElement('p', 'dai-orb-pop-entry', `${item.day !== null && item.day !== undefined ? `第 ${item.day} 天 · ` : ''}${item.text}`));
        }
        pop.append(block);
    }
    if (record.log.length) {
        const block = makeElement('section', 'dai-orb-pop-group');
        block.append(makeElement('b', '', '流水'));
        for (const item of [...record.log].reverse().slice(0, 3)) {
            block.append(makeElement('p', 'dai-orb-pop-entry', `${item.day !== null && item.day !== undefined ? `第 ${item.day} 天 · ` : ''}${item.text}`));
        }
        pop.append(block);
    }
    return pop;
}

/**
 * 贴着信息窗的外侧放；塞不下就收进视口，宁可压住信息窗也不出屏。
 * 传了 anchor 就贴着那张卡放（详情小卡跟着「全部」副窗走，免得两张卡叠在一起）。
 */
function positionOrbPopElement(pop, anchor) {
    if (!pop || !orbElement || typeof window === 'undefined') return;
    const orbRect = orbElement.getBoundingClientRect();
    const panel = orbElement.querySelector('.dai-orb-panel');
    const panelRect = panel && !panel.hidden ? panel.getBoundingClientRect() : orbRect;
    const anchorRect = anchor && anchor.isConnected ? anchor.getBoundingClientRect() : null;
    const baseRect = anchorRect ?? panelRect;
    const popRect = pop.getBoundingClientRect();
    const margin = 8;
    // 球在右缘时信息窗往左开，小卡再往左一格；球在左缘则相反。
    const panelOnLeft = orbElement.dataset.side !== 'left';
    const left = panelOnLeft ? baseRect.left - popRect.width - margin : baseRect.right + margin;
    const clampedLeft = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - popRect.width - margin));
    const top = Math.min(Math.max(margin, anchorRect ? baseRect.top : orbRect.top), Math.max(margin, window.innerHeight - popRect.height - margin));
    pop.style.left = `${Math.round(clampedLeft)}px`;
    pop.style.top = `${Math.round(top)}px`;
}

function positionOrbNpcPopup() {
    positionOrbPopElement(orbNpcPopElement, orbListPopElement);
}

// —— 悬浮球通用详情小卡：附近事件/世界大事/任务/势力/人物/记忆/影响的条目都能点开，
// 按条目引用回运行时取最新数据，贴在信息窗外侧弹出只读详情；再点同一条收起。——
let orbItemPopElement;
let orbItemPopRef = null;

const ORB_POP_STANCE_LABELS = Object.freeze({ hostile: '敌对', wary: '警惕', neutral: '中立', friendly: '友好', allied: '同盟' });
const ORB_POP_IMPACT_WEIGHT = Object.freeze({ world: '世界级', major: '大事', minor: '小事' });

function popText(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function popDueLabel(endDay, today) {
    if (endDay === null || endDay === undefined) return '';
    return Number(endDay) < Number(today) ? '已逾期' : `剩 ${endDay - today + 1} 天`;
}

function toggleOrbItemPopup(ref) {
    if (ref?.kind === 'npc') { toggleOrbNpcPopup(ref.id); return; }
    const same = orbItemPopRef && ref && orbItemPopRef.kind === ref.kind && orbItemPopRef.id === ref.id && orbItemPopRef.scope === ref.scope;
    if (same) { closeOrbItemPopup(); return; }
    openOrbItemPopup(ref);
}

function closeOrbItemPopup() {
    orbItemPopElement?.remove();
    orbItemPopElement = undefined;
    orbItemPopRef = null;
}

function openOrbItemPopup(ref) {
    if (!orbElement || !ref) return;
    const model = buildOrbItemPopModel(ref);
    if (!model) { closeOrbItemPopup(); return; }
    closeOrbNpcPopup();
    orbItemPopElement?.remove();
    orbItemPopElement = buildOrbItemPopup(model);
    orbItemPopRef = { ...ref, panelId: orbState.panelId };
    orbElement.append(orbItemPopElement);
    positionOrbItemPopup();
}

/** 小卡骨架：抬头（标题/分类 + 关闭）+ 分组的“标签 + 值”行；空值行不渲染。 */
function buildOrbItemPopup(model) {
    const pop = makeElement('aside', 'dai-orb-pop');
    const head = makeElement('div', 'dai-orb-pop-head');
    const titleBox = makeElement('div');
    const nameLine = makeElement('div', 'dai-orb-pop-name');
    nameLine.append(makeElement('b', '', model.title));
    if (model.sub) nameLine.append(makeElement('small', '', model.sub));
    titleBox.append(nameLine);
    const close = makeElement('button', 'dai-orb-pop-close', '×');
    close.type = 'button';
    close.title = '收起小卡';
    close.setAttribute('aria-label', `收起${model.title}的详情小卡`);
    close.addEventListener('click', closeOrbItemPopup);
    head.append(titleBox, close);
    pop.append(head);
    for (const group of model.groups ?? []) {
        const rows = (group?.rows ?? []).filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '');
        if (!rows.length) continue;
        const block = makeElement('section', 'dai-orb-pop-group');
        if (group.heading) block.append(makeElement('b', '', group.heading));
        for (const [label, value] of rows) {
            const line = makeElement('div', 'dai-profile-row');
            line.append(makeElement('span', 'dai-profile-label', label), makeElement('span', 'dai-profile-value', String(value)));
            block.append(line);
        }
        pop.append(block);
    }
    return pop;
}

/** 按条目引用回各运行时取活数据；数据已消失（被删/被归档）就不弹。 */
function buildOrbItemPopModel(ref) {
    if (!ref || typeof document === 'undefined') return null;
    const safe = getter => { try { return getter(); } catch { return undefined; } };
    if (ref.kind === 'event') {
        const snapshot = safe(() => agentWorldRuntime.snapshot());
        const event = [...(snapshot?.nearEvents ?? []), ...(snapshot?.worldEvents ?? [])].find(item => String(item?.id) === ref.id);
        if (!event) return null;
        const today = safe(() => agentWorldRuntime.status()?.clock?.day) ?? 1;
        return {
            title: capDetailTitle(event.title || event.text),
            sub: ref.scope === 'world' ? '世界大事' : '附近事件',
            groups: [
                { rows: [['内容', popText(event.text)], ['级别', event.weight === 'rumor' ? '传闻' : event.weight === 'major' ? '重大 ★' : '普通'], ['登记', `第 ${event.day} 天`], ['地点', popText(event.location)], ['期限', popDueLabel(event.endDay, today)], ['编号', String(event.id ?? '')]] },
                { heading: '依据', rows: [['依据', popText(event.basis)]] },
            ],
        };
    }
    if (ref.kind === 'task') {
        const snapshot = safe(() => agentWorldRuntime.snapshot());
        const task = (snapshot?.tasks ?? []).find(item => String(item?.id) === ref.id);
        if (!task) return null;
        const today = safe(() => agentWorldRuntime.status()?.clock?.day) ?? 1;
        const statusText = task.status === 'done'
            ? `已完成${task.doneDay ? `于第 ${task.doneDay} 天` : ''}`
            : (task.endDay !== null && task.endDay !== undefined ? (Number(task.endDay) < Number(today) ? `已逾期（限第 ${task.endDay} 天前）` : `进行中 · ${popDueLabel(task.endDay, today)}`) : '进行中 · 不限时');
        return {
            title: capDetailTitle(task.title),
            sub: '任务',
            groups: [
                { rows: [['任务', popText(task.title)], ['状态', statusText], ['接取', `第 ${task.day} 天`], ['期限', task.endDay !== null && task.endDay !== undefined ? `第 ${task.endDay} 天` : '不限时'], ['编号', String(task.id ?? '')]] },
                { heading: '详情与来源', rows: [['详情', popText(task.detail)], ['来源', popText(task.basis)]] },
            ],
        };
    }
    if (ref.kind === 'faction') {
        const faction = (safe(() => agentWorldRuntime.snapshot())?.factions ?? []).find(item => item?.name === ref.id);
        if (!faction) return null;
        return {
            title: faction.name,
            sub: popText(faction.type) ? `势力档案 · ${popText(faction.type)}` : '势力档案',
            groups: [
                { rows: [['类型', popText(faction.type)], ['实力档次', popText(faction.level)], ['态度', ORB_POP_STANCE_LABELS[faction.stance] ?? '中立'], ['首领', popText(faction.leader)], ['驻地', popText(faction.location)], ['更新', faction.updatedDay ? `第 ${faction.updatedDay} 天` : '']] },
                { heading: '成员与高层', rows: [['高层阵容', popText(faction.elders)], ['成员构成', popText(faction.members)]] },
                { heading: '底蕴与关系', rows: [['底蕴产业', popText(faction.assets)], ['势力关系', popText(faction.relations)]] },
                { heading: '动向与依据', rows: [['动向', popText(faction.dynamics)], ['依据', popText(faction.basis)]] },
            ],
        };
    }
    if (ref.kind === 'person') {
        const person = (safe(() => agentWorldRuntime.snapshot())?.people ?? []).find(item => item?.name === ref.id);
        if (!person) return null;
        return {
            title: person.name,
            sub: '相关人物',
            groups: [
                { rows: [['态度', popText(person.attitude) || '态度未明'], ['更新', person.updatedDay ? `第 ${person.updatedDay} 天` : '']] },
                { heading: '依据', rows: [['依据', popText(person.basis)]] },
            ],
        };
    }
    if (ref.kind === 'memory') {
        const entry = (safe(() => agentMemoryRuntime.snapshot())?.entries ?? []).find(item => String(item?.id) === ref.id);
        if (!entry) return null;
        const tierLabel = agentMemoryRuntime.tierLabels?.[entry.tier] ?? entry.tier;
        return {
            title: capDetailTitle(entry.title || entry.text),
            sub: ref.tier === 'big' ? '大记忆' : '小记忆',
            groups: [
                { rows: [['标题', popText(entry.title)], ['内容', popText(entry.text)], ['层级', `${tierLabel}${entry.tag ? ` · ${agentMemoryRuntime.tagLabels?.[entry.tag] ?? entry.tag}` : ''}`], ['登记', `第 ${entry.day ?? '?'} 天`], ['原文', popText(entry.quote)]] },
                { heading: '关联与出处', rows: [['别名', Array.isArray(entry.aliases) ? entry.aliases.join('、') : ''], ['关联', Array.isArray(entry.related) ? entry.related.join('、') : ''], ['依据', popText(entry.basis)], ['备注', popText(entry.note)]] },
            ],
        };
    }
    if (ref.kind === 'impact') {
        const record = (safe(() => agentImpactRuntime.list({ state: 'active' })) ?? []).find(item => String(item?.id ?? item?.title) === ref.id);
        if (!record) return null;
        return {
            title: capDetailTitle(record.title),
            sub: '世界影响',
            groups: [
                { rows: [['内容', popText(record.detail)], ['级别', ORB_POP_IMPACT_WEIGHT[record.weight] ?? '小事'], ['记账', `第 ${record.day} 天`], ['目标', popText(record.target)]] },
            ],
        };
    }
    if (ref.kind === 'cold') {
        const preview = (safe(() => agentNpcColdRuntime.status())?.previews ?? []).find(item => String(item?.id) === ref.id);
        if (!preview) return null;
        return {
            title: popText(preview.name) || '冷藏草稿',
            sub: '冷藏推进',
            groups: [
                { rows: [['人物', popText(preview.name)], ['草稿编号', String(preview.id ?? '')], ['状态', '待确认']] },
                { heading: '说明', rows: [['说明', popText(preview.note)]] },
            ],
        };
    }
    if (ref.kind === 'fact') {
        const entry = safe(() => agentFactsIndex.get(ref.id));
        if (!entry) return null;
        return {
            title: popText(entry.name) || `#${ref.id}`,
            sub: '原著资料',
            groups: [
                { rows: [['编号', `#${entry.uid ?? ref.id}`], ['分类', popText(entry.category)], ['卷', Array.isArray(entry.volumes) && entry.volumes.length ? entry.volumes.map(volume => `第 ${volume} 卷`).join('、') : ''], ['别名', Array.isArray(entry.aliases) ? entry.aliases.join('、') : '']] },
                { heading: '内容', rows: [['内容', popText(entry.content)]] },
            ],
        };
    }
    return null;
}

function positionOrbItemPopup() {
    // 从「全部」副窗里点开的详情，贴着副窗再往左一格；副窗没开就照旧贴信息窗。
    positionOrbPopElement(orbItemPopElement, orbListPopElement);
}

function disposeOrbHud() {
    if (orbDocumentClick) { document.removeEventListener('pointerdown', orbDocumentClick, true); orbDocumentClick = undefined; }
    if (orbDocumentKey) { document.removeEventListener('keydown', orbDocumentKey); orbDocumentKey = undefined; }
    orbElement = undefined;
    orbListPopElement = undefined;
    orbListPopRef = null;
    orbNpcPopElement = undefined;
    orbNpcPopName = null;
    orbItemPopElement = undefined;
    orbItemPopRef = null;
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
    unavailable: '当前还没有本局的运行记录：口径记录在本局第一次跑生成流程时建立；设置改动已保存，新开局按它执行。',
    adopted: '本局已按当前设置建立口径记录。',
    unchanged: '本局口径与设置一致。',
    fixed: '本局没有允许中途切换口径，设置改动会在新开局生效。',
    deferred: '设置已保存；本局仍在原口径，切换需要在本局内确认后才生效。',
    failed: '模式记录写入失败，设置已保存，但本局口径未改变。',
    confirmRequired: '本局口径切换已登记，待确认：确认前仍按原口径运行。',
    switched: '本局口径已切换，正式记录已更新；已发生的事实不回退。',
    cancelled: '已取消本局口径切换，维持原口径。',
    nothingPending: '没有待确认的口径切换。',
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
/** 待确认切换的提示条：正式记录与设置口径不一致、且允许中途切换时出现。 */
function syncSandboxPendingRow() {
    const panel = document.getElementById(SETTINGS_PANEL_ID);
    const row = panel?.querySelector('[data-sandbox-pending]');
    if (!row) return;
    const settings = currentSettings();
    const scope = agentActiveScope;
    const record = scope ? agentSandboxMode.read(scope) : { status: 'empty' };
    const desired = settings.enableSandboxMode ? 'sandbox' : 'mainline';
    row.hidden = !(record.status === 'ready' && record.mode !== desired && settings.sandbox.allowMidgameSwitch === true);
}

async function confirmSandboxSwitch() {
    const scope = currentAgentScope();
    const task = agentCoordinator.list().reverse().find(item => item.sessionId === scope.sessionId && item.branchId === scope.branchId);
    const stateVersion = agentStateStore.read(scope)?.stateVersion;
    if (!task?.taskId || typeof stateVersion !== 'string' || !stateVersion.trim()) {
        setSandboxStatus(SANDBOX_MODE_MESSAGES.unavailable);
        return { status: 'unavailable' };
    }
    const result = agentSandboxMode.confirm({ ...scope, taskId: task.taskId, stateVersion, reason: '设置页确认切换' });
    if (result.status === 'switched') {
        invalidateAgentContinuations();
        const saved = await persistSandboxMode();
        setSandboxStatus(saved.status === 'saved' ? SANDBOX_MODE_MESSAGES.switched : SANDBOX_MODE_MESSAGES.failed);
    } else setSandboxStatus(result.reason === 'stale_switch_context' ? '当前任务或状态已变化，请重新申请口径切换。' : SANDBOX_MODE_MESSAGES.nothingPending);
    syncSandboxPendingRow();
    renderRuntimeMode(document.getElementById(SETTINGS_PANEL_ID));
    return result;
}

function cancelSandboxSwitch() {
    const scope = agentActiveScope;
    if (scope) agentSandboxMode.cancelSwitch(scope);
    setSandboxStatus(SANDBOX_MODE_MESSAGES.cancelled);
    syncSandboxPendingRow();
    renderRuntimeMode(document.getElementById(SETTINGS_PANEL_ID));
}
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
        if (!settings.sandbox.allowMidgameSwitch) {
            setSandboxStatus(SANDBOX_MODE_MESSAGES.fixed);
            syncSandboxPendingRow();
            return { status: 'deferred' };
        }
        const task = agentCoordinator.list().reverse().find(item => item.sessionId === scope.sessionId && item.branchId === scope.branchId && typeof item.stateVersion === 'string' && item.stateVersion.trim());
        if (!task || scope.sessionId !== currentAgentScope().sessionId || scope.branchId !== currentAgentScope().branchId) {
            setSandboxStatus(SANDBOX_MODE_MESSAGES.unavailable);
            return { status: 'unavailable' };
        }
        // 请求本局内切换：绑定真实任务与状态版本，等玩家确认后才生效。
        const requested = agentSandboxMode.sync({
            sessionId: scope.sessionId,
            branchId: scope.branchId,
            taskId: task.taskId,
            stateVersion: task.stateVersion,
            enabled: settings.enableSandboxMode,
            inertia: settings.sandbox.inertia,
            canonCharactersAutonomous: settings.sandbox.canonCharactersAutonomous,
            allowMidgameSwitch: true,
        });
        if (requested.status === 'confirmation_required') {
            setSandboxStatus(SANDBOX_MODE_MESSAGES.confirmRequired);
            syncSandboxPendingRow();
            return requested;
        }
        setSandboxStatus(SANDBOX_MODE_MESSAGES.unchanged);
        syncSandboxPendingRow();
        return requested;
        // 上面各分支都已返回。
    }
    try {
        // 口径一致：清掉可能残留的待确认变更（玩家把开关拨回去的情况）。
    agentSandboxMode.cancelSwitch(scope);
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
        if (path === 'enabled') invalidateAgentContinuations();
        if (path.startsWith('setting.')) loadSettingEntries();
        if (path.startsWith('impact.')) syncImpactLimits();
        if (['enabled', 'enableActionResolution', 'enableSandboxMode'].includes(path) || path.startsWith('settle.') || path.startsWith('llm.') || path.startsWith('apiPresets')) {
            settleSession.invalidate();
            const cleared = agentActionPromptInjection.clear();
            if (lastSettleAdjudication) recordSettleAdjudication({ ...lastSettleAdjudication, status: settleEnabled() ? 'stale' : 'disabled', cleared: cleared.status === 'cleared', summary: '设置已变更，旧判定不再约束正文' });
        }
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
    // 每次打开都重画一次总控页：调用体检在长会话里随时长新条目，卡面脚本探测依赖
    // "此刻有没有开卡"，面板是启动时建好的，不能只画启动时那一份。
    if (activeSettingsPage === 'overview') {
        renderCallLogList(panel);
        const cover = panel.querySelector('[data-cover-script-status]');
        if (cover) cover.textContent = probeCoverScriptStatus().text;
    }
    syncSettingsForm();
    syncSandboxPendingRow();
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
        ['settle.resultPrompt', SETTLE_RESULT_PROMPT],
    ]);
    // 同一提示词在功能页与集中页各有一份：每一份都铺当前生效的默认，别只铺第一个。
    for (const [path, fallback] of promptDefaults) {
        for (const area of panel.querySelectorAll(`[data-setting="${path}"]`)) {
            if (area && !String(area.value ?? '').trim()) area.value = fallback;
        }
    }
    renderSettleCustomCategories(panel);
    renderApiPresets(panel);
    renderApiPresetSelects(panel);
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
                    <button type="button" class="dai-nav-item" data-settings-page="apis"><span class="dai-nav-icon">⛓</span><span><b>API设置</b><small>存好接口方案，各功能直接选</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="hub"><span class="dai-nav-icon">✧</span><span><b>模型设置</b><small>每一路模型调用的接口与参数</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="facts"><span class="dai-nav-icon">▤</span><span><b>原著资料</b><small>事实与资料查询</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="action"><span class="dai-nav-icon">➜</span><span><b>行动结算</b><small>结果与资源变化</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="world"><span class="dai-nav-icon">◌</span><span><b>世界运转</b><small>时间、事件与世界现状</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="npc"><span class="dai-nav-icon">♙</span><span><b>NPC 决策</b><small>人物自主行动</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="npcledger"><span class="dai-nav-icon">☰</span><span><b>人物簿</b><small>每个人的档案与好感</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="self"><span class="dai-nav-icon">◉</span><span><b>纳戒</b><small>主角自身与随身之物</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="memory"><span class="dai-nav-icon">✎</span><span><b>记忆存储</b><small>小记忆/大记忆，按需召回</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="impact"><span class="dai-nav-icon">⌁</span><span><b>世界影响</b><small>记录世界被改成了什么样</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="sandbox"><span class="dai-nav-icon">◈</span><span><b>开放世界</b><small>开放世界 / 主线双口径</small></span></button>
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
                        <fieldset class="dai-theme-picker"><legend>界面颜色</legend><label class="dai-theme-option"><input type="radio" name="dai-theme" value="gilt" data-setting="ui.theme"><span class="dai-theme-swatch" data-swatch="gilt" aria-hidden="true"></span><b>玄烬鎏金</b></label><label class="dai-theme-option"><input type="radio" name="dai-theme" value="graphite" data-setting="ui.theme"><span class="dai-theme-swatch" data-swatch="graphite" aria-hidden="true"></span><b>玄铁控制台</b></label><label class="dai-theme-option"><input type="radio" name="dai-theme" value="parchment" data-setting="ui.theme"><span class="dai-theme-swatch" data-swatch="parchment" aria-hidden="true"></span><b>米纸手账</b></label></fieldset>
                        <p class="dai-dashboard-note">只改变 Agent 界面，不改变酒馆整体配色。</p>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>运行口径</b><small>沙盒口径不用世界书：世界常识由内置斗气大陆基线承担，决定喂料与世界书条目一并停用；主线口径一切照旧。</small></div><p class="dai-turn-result" data-runtime-mode role="status">打开本页时读取。</p></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>模型调用体检</b><small>扩展各功能最近一次调模型的结果（本次会话内，可"清零"重计）。主文生成与天之音·时间召回走酒馆本体/数据库脚本，不经过扩展，这里看不到。空回（接口通了但没内容）会按下面两个参数自动重试，改完立即生效。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>空回重试次数</b><small>模型调用返回空内容时自动再问几次：0 ＝ 不重试（清空输入框会存成 0，等于关掉重试），负数或非整数按默认 1 处理。只对空回重试，报错（限流 429、超时等）仍然立刻上抛。</small></span><input type="number" min="0" step="1" data-setting="llm.emptyRetry" placeholder="默认 1"></label><label class="dai-setting-row"><span><b>重试间隔（秒）</b><small>两次尝试之间等多久。站点有 RPM 限制就把这里调大（比如 15～30），别让重试把额度烧光；0、负数或留空都按默认 0.6 秒。</small></span><input type="number" min="0" step="0.1" data-setting="llm.emptyRetryWait" placeholder="默认 0.6"></label></div><div data-calllog-list></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-calllog-refresh>刷新</button><button type="button" class="dai-button dai-button-ghost" data-calllog-clear>清零</button></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>卡面脚本</b><small>首楼"开始创建身份"由卡内脚本接管；换设备或换人导入后点不动，多半是它没启用。</small></div><p class="dai-state-strip" data-cover-script-status>还没有检测。</p></div>
                    </section>
                    
                    <section class="dai-settings-page" data-settings-section="apis" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / API</span><h3>API设置</h3><p>把每套接口配置（地址、密钥、模型、采样参数、附加参数）存成命名方案，「模型设置」页里每个功能直接选一套，不用再逐项手填。附加参数与酒馆「自定义接口 · 附加参数」同语义：包括主体参数并进请求体、排除主体参数删字段、包含请求标头覆盖请求头。</p></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>接口方案</b><small>方案只保存在扩展设置里（密钥也是），不进聊天消息；改完方案下一轮调用就生效，不用重启。功能在「模型设置」页绑定方案。</small></div><div data-api-preset-list></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-api-add-preset>＋ 新建 API 设置</button><small role="status" data-api-preset-status>最多 20 个方案。</small></div></div>
                    </section>
                                        <section class="dai-settings-page" data-settings-section="hub" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 模型</span><h3>模型设置</h3><p>扩展会发起的每一次独立模型调用，在这一页只回答一个问题：这个功能用哪套方案。方案（地址、密钥、模型、采样参数、附加参数）在「API设置」页维护，改方案下一轮调用就生效；不绑方案＝跟随酒馆主连接。各功能的提示词不在这一页——到对应功能页里改。</p></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>全局连接（正文与默认调用）</b><small>扩展侧的意图解析、正文撰写、设定挑选等默认调用走哪套；正文由酒馆自己生成，不经过这里。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案（接口、参数、附加参数全按方案来）。</small></span><select data-setting="llm.apiPreset" data-api-preset-select></select></label><label class="dai-setting-row"><span><b>单次等待上限（毫秒）</b><small>所有扩展调用的超时上限，方案不能覆盖这一项。</small></span><input type="number" min="1000" max="600000" step="1000" data-setting="llm.timeoutMs" placeholder="默认 60000"></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>原著设定 · 选条与卷外点选</b><small>每轮生成前“挑哪些原著条目进正文”的独立调用。选条与卷外点选的提示词在「原著资料」页修改。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="setting.apiPreset" data-api-preset-select></select></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>行动结算 · 判定调用</b><small>分类判定与最终判定共用这一套 API：生成前一次调用直判本轮全部行动（旧分类管线也走这套）。判定开关与提示词在「行动结算」页改。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="settle.resultApiPreset" data-api-preset-select></select></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>世界运转 · 模型决定</b><small>世界事件决定调用；决定提示词与降级指令指南在「世界运转」页改。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="world.decideApiPreset" data-api-preset-select></select></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>喂最近几楼聊天</b></span><input type="number" min="1" max="12" step="1" data-setting="world.decideMaxFloors" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>世界书条目上限</b><small>按本轮聊天匹配相关条目，0 = 不带世界书。</small></span><input type="number" min="0" max="40" step="1" data-setting="world.decideMaxEntries" placeholder="0 = 不指定"></label></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>人物簿 · 记录员</b><small>生成后补人物档案的小调用；记录员提示词在「人物簿」页改，档案抄录与经历精简各有独立连接卡。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="npc.ledgerApiPreset" data-api-preset-select></select></label></div><div class="dai-settings-card"><div class="dai-card-heading"><b>人物簿 · 档案抄录</b><small>按世界书给人物补空字段的小调用（面板「按世界书重抽」也会用到）。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="npc.extractApiPreset" data-api-preset-select></select></label></div><div class="dai-settings-card"><div class="dai-card-heading"><b>人物簿 · 经历精简</b><small>把某人的经历清单压缩成草稿、确认后写回的手动调用。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="npc.expApiPreset" data-api-preset-select></select></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>人物簿 · 冷藏推进员</b><small>给勾选的冷藏人物补世界时间走过那一段的小调用；推进员提示词在「人物簿」页改。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="npc.coldApiPreset" data-api-preset-select></select></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>纳戒 · 决定模型</b><small>纳戒决定是一条独立调用（生成后自动跑或手动“让模型决定一次”）；决定开关与提示词在「纳戒」页改。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="self.decideApiPreset" data-api-preset-select></select></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>喂最近几楼聊天</b><small>纳戒决定自己的一份，与记忆分开。</small></span><input type="number" min="1" max="12" step="1" data-setting="self.decideMaxFloors" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>世界书条目上限</b><small>按本轮聊天匹配相关条目，0 = 不带世界书。</small></span><input type="number" min="0" max="40" step="1" data-setting="self.decideMaxEntries" placeholder="0 = 不指定"></label></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>记忆 · 决定模型</b><small>记忆决定专用；召回与总结各有独立连接卡。决定提示词与开关在「记忆存储」页改。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="memory.decideApiPreset" data-api-preset-select></select></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>喂最近几楼聊天</b><small>记忆决定自己的一份，与纳戒分开。</small></span><input type="number" min="1" max="12" step="1" data-setting="memory.decideMaxFloors" placeholder="0 = 不指定"></label><label class="dai-setting-row"><span><b>世界书条目上限</b><small>按本轮聊天匹配相关条目，0 = 不带世界书。</small></span><input type="number" min="0" max="40" step="1" data-setting="memory.decideMaxEntries" placeholder="0 = 不指定"></label></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>记忆 · 召回模型</b><small>用户输入之后、生成之前，按记忆目录挑要注入的旧记忆；召回提示词与自动开关在「记忆存储」页。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="memory.recallApiPreset" data-api-preset-select></select></label></div><div class="dai-settings-card"><div class="dai-card-heading"><b>记忆 · 总结模型</b><small>小记忆攒够条数总结成一条大记忆；阈值在「记忆存储」页。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="memory.consolidateApiPreset" data-api-preset-select></select></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>世界影响 · 记录员与场记</b><small>生成后记账与生成前挑选的两个调用；提示词在「世界影响」页改。场记不绑方案就跟着记录员走。</small></div><label class="dai-setting-row"><span><b>记录员用哪套API设置</b><small>生成结束后记账的那个。</small></span><select data-setting="impact.decideApiPreset" data-api-preset-select></select></label><label class="dai-setting-row"><span><b>场记用哪套API设置</b><small>生成前挑影响的那个；不绑＝跟记录员同一套。</small></span><select data-setting="impact.injectApiPreset" data-api-preset-select></select></label></div>
                    </section>
                    <section class="dai-settings-page" data-settings-section="facts" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 03</span><h3>原著设定</h3><p>把世界书条目变成“按需注入”的设定库：建索引、按卷出目录、模型点名、按预算注入正文提示词。</p></div><div class="dai-settings-card"><div class="dai-card-heading"><b>运行状态</b><small>打开这一页时读取，生成结束后也会刷新。</small></div><ul class="dai-status-list" data-facts-status><li><b>状态</b><span>正在读取……</span></li></ul></div><div class="dai-settings-card"><div class="dai-card-heading"><b>检索库状态</b><small>只读世界书，不改原文件；改完世界书后重新导入一次即可。</small></div><p class="dai-turn-result" data-worldbook-stats role="status">还没有导入。</p><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>选择世界书</b><small>扫描到的名字会记住；选过之后刷新酒馆不用重选。</small></span><select data-worldbook-pick><option value="">（尚未选择）</option></select></label><label class="dai-setting-row"><span><b>手动填写</b><small>列表里没有就填世界书面板里的名字。</small></span><input type="text" list="dai-worldbook-options" data-setting="setting.worldbook" placeholder="例如 斗破世界书"></label></div><datalist id="dai-worldbook-options"></datalist><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-agent-worldbook-scan>扫描可选世界书</button><button type="button" class="dai-secondary-button" data-agent-worldbook-import>从世界书导入</button></div><p class="dai-turn-result" data-agent-worldbook-status role="status">还没有导入。</p></div><div class="dai-settings-card"><div class="dai-card-heading"><b>检索库 · 条目浏览</b><small>整库条目在这里翻：按类别/卷过滤、按关键词搜（标题、别名、摘要、正文都算），点行看全文。纯本地过滤，不花模型调用。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>关键词</b></span><input type="text" data-facts-search placeholder="例如 加列家 / 乌坦城 / 萧炎"></label><label class="dai-setting-row"><span><b>类别</b></span><select data-facts-cat><option value="">全部类别</option></select></label><label class="dai-setting-row"><span><b>范围</b></span><select data-facts-scope><option value="volume">当前剧情卷</option><option value="all">全书</option></select></label></div><p class="dai-turn-result" data-facts-browser-status role="status">打开页面后自动列出。</p><div class="dai-facts-browser" data-facts-browser></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>上次注入</b><small>最近一轮实际写进提示词的原著条目；与上面的运行状态分开看。</small></div><div class="dai-facts-injection" data-facts-last-injection role="status">本轮还没有注入过。</div></div><div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">◈</span><span><b>启用原著设定注入</b><small>每轮先按本轮输入召回候选，再由模型挑出真正要用的设定，按预算注入正文提示词。</small></span><input type="checkbox" data-setting="setting.enabled"></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>当前剧情卷</b><small>自动＝按本轮输入和模型估计；手动选＝锁定这一卷，识别到更后面的卷也会被压回。</small></span><select data-setting="setting.progress"><option value="0">自动判定</option><option value="1">第 1 卷</option><option value="2">第 2 卷</option><option value="3">第 3 卷</option><option value="4">第 4 卷</option><option value="5">第 5 卷</option><option value="6">第 6 卷</option><option value="7">第 7 卷</option><option value="8">第 8 卷</option><option value="9">第 9 卷</option><option value="10">第 10 卷</option><option value="11">第 11 卷</option><option value="12">第 12 卷</option><option value="13">第 13 卷</option><option value="14">第 14 卷</option><option value="15">第 15 卷</option><option value="16">第 16 卷</option><option value="17">第 17 卷</option><option value="18">第 18 卷</option><option value="19">第 19 卷</option><option value="20">第 20 卷</option><option value="21">第 21 卷</option></select></label><label class="dai-setting-row"><span><b>单次注入字数</b><small>0 = 不限制，选中几条就注入几条全文。</small></span><input type="number" min="0" max="4000" step="100" data-setting="setting.injectionBudget"></label><label class="dai-setting-row"><span><b>单次检索出条目上限</b><small>选条模型单次最多挑几条原著条目（含本卷故事线背景），直接按你填的来，不设天花板；留空默认 8，填 0 或负数也按默认处理。上下文里提到的条目多于上限时按相关度取前几条。改完下一轮选条就生效。</small></span><input type="number" min="1" step="1" data-setting="setting.maxItems" placeholder="默认 8"></label></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>注入通道</b><small data-injection-status role="status">打开这一页时检测。</small></div><div class="dai-setting-grid"><label class="dai-setting-row dai-setting-toggle"><span><b>启用注入</b><small>关闭后不往提示词里写任何原著内容，正文照常生成。</small></span><input type="checkbox" data-setting="injection.enabled"></label><label class="dai-setting-row"><span><b>插入深度</b><small>从最新一楼往回数；0 表示紧贴末尾、离生成最近。</small></span><input type="number" min="0" max="99" step="1" data-setting="injection.depth"></label><label class="dai-setting-row"><span><b>最大字数</b><small>0 = 不截断；填了才在写入时截断。</small></span><input type="number" min="0" max="8000" step="100" data-setting="injection.maxChars"></label></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>旧版资料查询（已退役）</b><small>新链路不再调用它；保留这几个开关只为对照旧行为，正常使用保持关闭。</small></div><div class="dai-feature-toggle"><span class="dai-feature-icon">▤</span><span><b>启用旧资料查询</b><small>关闭后不会调用 facts-query 模块。</small></span><input type="checkbox" data-setting="enableFactsLibrary"></div><label class="dai-setting-row"><span><b>资料来源</b><small>旧链路只会读取已经登记的项目资料。</small></span><select data-setting="facts.sourceMode"><option value="registered">已登记资料</option><option value="chat">当前聊天上下文</option><option value="both">资料 + 当前聊天</option></select></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>单次最多条目</b></span><input type="number" min="1" max="100" step="1" data-setting="facts.maxEntries"></label><label class="dai-setting-row dai-setting-toggle"><span><b>允许未核验资料</b><small>关闭时只使用已确认事实。</small></span><input type="checkbox" data-setting="facts.includeUnverified"></label></div></div><details class="dai-settle-category"><summary><span class="dai-feature-icon">▤</span><span><b>选条提示词</b><small>模型判断“本轮要用哪些原著条目”时收到的 system 指令；点开修改，清空恢复内置默认；MAX_PICKS 会换成每条上限。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>规则正文</b><small>改完下一轮生效，不用重启。</small></span><textarea data-setting="prompt.select" rows="9" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-prompt-default>填入默认规则</button><small>默认规则口径：提到的就出、本卷故事线默认带、不许编 uid、只输出 JSON。</small></div></div></details><details class="dai-settle-category"><summary><span class="dai-feature-icon">▤</span><span><b>卷外点选提示词</b><small>模型在目录里找不到、报出名字后，脚本搜到候选再问它一次时用的 system 指令；点开修改，清空恢复内置默认。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>规则正文</b><small>只影响“卷外二次点选”，改完下一轮生效。</small></span><textarea data-setting="prompt.lookup" rows="7" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-prompt-default="lookup">填入默认规则</button><small>默认规则含“只从候选里挑、后续卷默认不选”。</small></div></div></details></section>
                    <section class="dai-settings-page" data-settings-section="action" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 04</span><h3>行动结算</h3><p>把玩家行动拆成条件、结果和资源变化候选，再决定是否提交。</p></div><div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">➜</span><span><b>启用行动结算（总开关）</b><small>关闭后行动不再结算：不拆条件、不算数值变化，也不再要求确认行动细节；正文照常生成，状态保持原样。</small></span><input type="checkbox" data-setting="enableActionResolution"></div><label class="dai-setting-row dai-setting-toggle"><span><b>提交前要求确认</b><small>只生成候选，不自动写入状态。</small></span><input type="checkbox" data-setting="action.requireConfirmation"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>最多候选结果</b></span><input type="number" min="1" max="20" step="1" data-setting="action.maxCandidates"></label><label class="dai-setting-row dai-setting-toggle"><span><b>显示资源变化预览</b><small>在确认前展示影响范围。</small></span><input type="checkbox" data-setting="action.showCostPreview"></label></div></div><div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">⚖</span><span><b>行动结算注入（生成前直判）</b><small>一次调用按实际行动分别判定，读取相关世界书正文、六路已注入提示词和真账本；有文字后果也正常裁决。只有审核后的结果进入正文通道。生成后仍由原入口记账，并只读核对金币、境界和库存，不会双份扣账。关闭后不调用不注入。</small></span><input type="checkbox" data-setting="settle.resultEnabled"></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button" data-settle-adjudicate-run>手动预览一次（不注入）</button><span class="dai-turn-result" data-settle-result-status role="status">还没有判定过。生成前判定员会直判这一轮的行动结果并注入正文提示词。</span></div><div class="dai-turn-result" data-settle-result>本轮还没有判定结果。</div><details class="dai-settle-category"><summary><span class="dai-feature-icon">✦</span><span><b>判定提示词</b><small>一次调用输出 version:2 与 actions；每项有行动依据、依赖、结果、文字后果和 effects。清空恢复内置默认。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>提示词正文</b></span><textarea data-setting="settle.resultPrompt" rows="9" spellcheck="false"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-prompt-default="settleResult">载入新版多行动模板</button><button type="button" class="dai-button dai-button-ghost" data-settle-follow-default>恢复跟随默认</button><small role="status" data-settle-prompt-warning>自定义原文保留，旧单行动结果可兼容。</small></div></div></details></div><div class="dai-settings-card"><div class="dai-card-heading"><b>类别规则与自定义判定</b><small>生成前一次调用分别裁决多个行动；本页自定义规则作为补充，不会每类再调一次模型。旧分类管线保留，下面的候选确认选项只作用于旧管线，不影响生成前只判不动账的原则。</small></div>${SETTLE_CATEGORY_HTML}<div data-settle-custom-list></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-settle-add-category>＋ 添加自定义判定</button><small role="status" data-settle-custom-status>自定义判定只有名字和提示词：判定走你写的规则，脚本仍做字段白名单把关；最多 8 个。</small></div></div></section>
                    <section class="dai-settings-page" data-settings-section="world" role="tabpanel" hidden>
                        <div class="dai-page-heading"><h3>世界运转</h3><p>世界时间和事件由模型在正文末尾下指令、脚本核验后记账；这一页是台账展示和手动控制。添加表单都收进了弹窗，页面只看现状。</p></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>世界时间与现状</b><small>随每轮生成自动更新；点数值旁的 ✎ 就地修正。</small></div><div class="dai-world-tiles"><div class="dai-world-tile"><span class="dai-world-tile-label">天数</span><b class="dai-world-tile-value" data-world-tile="day">—</b><small class="dai-world-tile-sub" data-world-tile-sub="clock"></small></div><div class="dai-world-tile"><span class="dai-world-tile-label">时期</span><b class="dai-world-tile-value" data-world-tile="era">—</b><button type="button" class="dai-world-tile-edit" data-world-tile-edit="era" title="修改时期">✎</button><span class="dai-world-tile-editor" data-world-tile-editor="era" hidden><input type="text" data-world-info="era" placeholder="如 萧家废物时期"><button type="button" class="dai-secondary-button" data-world-info-set="era">确定</button></span></div><div class="dai-world-tile"><span class="dai-world-tile-label">所在地</span><b class="dai-world-tile-value" data-world-tile="location">—</b><button type="button" class="dai-world-tile-edit" data-world-tile-edit="location" title="修改所在地">✎</button><span class="dai-world-tile-editor" data-world-tile-editor="location" hidden><input type="text" data-world-info="location" placeholder="如 乌坦城"><button type="button" class="dai-secondary-button" data-world-info-set="location">确定</button></span></div><div class="dai-world-tile"><span class="dai-world-tile-label">天气</span><b class="dai-world-tile-value" data-world-tile="weather">—</b><button type="button" class="dai-world-tile-edit" data-world-tile-edit="weather" title="修改天气">✎</button><span class="dai-world-tile-editor" data-world-tile-editor="weather" hidden><input type="text" data-world-info="weather" placeholder="如 晴"><button type="button" class="dai-secondary-button" data-world-info-set="weather">确定</button></span></div><div class="dai-world-tile"><span class="dai-world-tile-label">名声</span><b class="dai-world-tile-value" data-world-tile="reputation">—</b><button type="button" class="dai-world-tile-edit" data-world-tile-edit="reputation" title="修改名声">✎</button><span class="dai-world-tile-editor" data-world-tile-editor="reputation" hidden><input type="text" data-world-info="reputation" placeholder="如 乌坦城小有名气"><button type="button" class="dai-secondary-button" data-world-info-set="reputation">确定</button></span></div><div class="dai-world-tile"><span class="dai-world-tile-label">通缉度</span><b class="dai-world-tile-value" data-world-tile="wanted">—</b><button type="button" class="dai-world-tile-edit" data-world-tile-edit="wanted" title="修改通缉度">✎</button><span class="dai-world-tile-editor" data-world-tile-editor="wanted" hidden><input type="text" data-world-info="wanted" placeholder="如 被米特尔家族记恨"><button type="button" class="dai-secondary-button" data-world-info-set="wanted">确定</button></span></div></div><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-world-advance="1">推进 1 天</button><button type="button" class="dai-secondary-button" data-world-advance="7">推进 7 天</button><input type="number" min="1" max="365" step="1" data-world-days placeholder="天数" aria-label="自定义推进天数"><button type="button" class="dai-secondary-button" data-world-advance-custom>推进</button></div><label class="dai-setting-row"><span><b>改为第几天</b><small>直接设定时钟，用于修正跳变。</small></span><span class="dai-setting-inline"><input type="number" min="1" max="99999" step="1" data-world-setday placeholder="如 30"><button type="button" class="dai-secondary-button" data-world-setday-apply>设定</button></span></label><label class="dai-setting-row"><span><b>世界氛围</b><small>决定模型投放事件的频率和烈度。</small></span><span class="dai-segmented"><span class="dai-world-tension" data-world-tension-display role="status"></span><button type="button" class="dai-segmented-button" data-world-tension="calm">平静</button><button type="button" class="dai-segmented-button" data-world-tension="rising">升温</button><button type="button" class="dai-segmented-button" data-world-tension="storm">风波</button></span></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>主角身边的事件</b><small>模型会看到这些并把它们织进剧情；了结后从注入里退场。</small><button type="button" class="dai-impact-edit" data-modal-open="world-event" data-modal-title="登记事件">＋ 登记</button></div><div class="dai-world-events" data-world-events-near></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>世界大事</b><small>大陆层面的事件；重大的会标星，置顶的不参与上限清理。</small></div><div class="dai-world-events" data-world-events-world></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>任务</b><small>模型识别剧情里的目标就立任务；全部任务都在这里。</small><button type="button" class="dai-impact-edit" data-modal-open="world-task" data-modal-title="接下任务">＋ 接任务</button></div><div class="dai-world-tasks" data-world-tasks></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>势力</b><small>与主角有过恩怨往来的势力：一份完整档案（类型/首领/高层/成员/驻地/底蕴/关系）加态度动向，敌对的最先注入。</small><button type="button" class="dai-impact-edit" data-modal-open="world-faction" data-modal-title="登记势力" data-modal-wide="true">＋ 登记</button></div><div class="dai-world-factions" data-world-factions></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>人物</b><small>与主角有交情或恩怨的人物及态度，正文按这里写人物反应。</small><button type="button" class="dai-impact-edit" data-modal-open="world-person" data-modal-title="登记人物">＋ 登记</button></div><div class="dai-world-people" data-world-people></div></div>
                        <div class="dai-modal-dock" data-modal-dock="world-task" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>接一个任务</b><small>模型没立但你想要的，自己记一笔。</small></div><label class="dai-setting-row"><span><b>任务名</b><small>必填，不超过 20 字；列表只显示这一行。</small></span><input type="text" maxlength="20" required data-world-task-title placeholder="例：查出城东窃贼的来历"></label><label class="dai-setting-row"><span><b>详细资料</b><small>目标、背景、现状，写多少都行。</small></span><input type="text" data-world-task-detail placeholder="例：连日失窃，掌柜悬赏；已知窃贼夜行、身法利落"></label><label class="dai-setting-row"><span><b>来源</b><small>这任务从哪来：谁托付、什么契机。</small></span><input type="text" data-world-task-basis placeholder="例：药铺掌柜悬赏托付"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>时限（天）</b><small>留空不限期。</small></span><input type="number" min="1" max="90" step="1" data-world-task-days placeholder="如 7"></label></div><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-world-addtask>接下任务</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div><div class="dai-modal-dock" data-modal-dock="world-faction" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>登记势力</b><small>与主角有恩怨往来的势力；同名直接更新，留空的档案字段保持原值。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>势力名</b></span><input type="text" maxlength="30" data-world-faction-name placeholder="例：云岚宗"></label><label class="dai-setting-row"><span><b>类型</b><small>宗门/家族/帝国/学院/佣兵团/商会/联盟…</small></span><input type="text" maxlength="10" data-world-faction-type placeholder="例：宗门"></label><label class="dai-setting-row"><span><b>态度</b></span><select data-world-faction-stance><option value="hostile">敌对</option><option value="wary">警惕</option><option value="neutral">中立</option><option value="friendly">友好</option><option value="allied">同盟</option></select></label><label class="dai-setting-row"><span><b>首领</b><small>名字 + 称谓境界。</small></span><input type="text" maxlength="30" data-world-faction-leader placeholder="例：云韵（宗主·斗王）"></label></div><label class="dai-setting-row"><span><b>实力档次</b><small>这方势力有多强。</small></span><input type="text" maxlength="20" data-world-faction-level placeholder="例：加玛帝国一流"></label><label class="dai-setting-row"><span><b>高层阵容</b><small>太上长老/大长老/长老/护法/客卿。</small></span><input type="text" maxlength="120" data-world-faction-elders placeholder="例：老宗主云山、大长老云棱、客卿海波东"></label><label class="dai-setting-row"><span><b>成员构成</b><small>规模与强者数量。</small></span><input type="text" maxlength="120" data-world-faction-members placeholder="例：弟子千余，斗王三人"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>驻地/地盘</b></span><input type="text" maxlength="40" data-world-faction-location placeholder="例：云岚宗山门·加玛帝国"></label><label class="dai-setting-row"><span><b>势力关系</b><small>与其他势力的恩怨与依附。</small></span><input type="text" maxlength="160" data-world-faction-relations placeholder="例：世仇萧家；背靠皇室"></label></div><label class="dai-setting-row"><span><b>底蕴与产业</b><small>传承功法、异火、拍卖行、附属势力。</small></span><input type="text" maxlength="160" data-world-faction-assets placeholder="例：镇派功法、名下拍卖行"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>动向</b><small>势力现在在干什么。</small></span><input type="text" data-world-faction-dynamics placeholder="例：为退婚一事派使者常驻乌坦城"></label><label class="dai-setting-row"><span><b>依据</b></span><input type="text" data-world-faction-basis placeholder="例：本楼使者登门"></label></div><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-world-setfaction>登记 / 更新</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div><div class="dai-modal-dock" data-modal-dock="world-person" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>登记人物</b><small>与主角有交情或恩怨的人及态度；同名直接更新。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>人物名</b></span><input type="text" data-world-person-name placeholder="例：药老"></label><label class="dai-setting-row"><span><b>对主角的态度</b></span><input type="text" data-world-person-attitude placeholder="例：严厉但护短，亦师亦父"></label></div><label class="dai-setting-row"><span><b>依据</b></span><input type="text" data-world-person-basis placeholder="例：第二楼药老出手相护"></label><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-world-setperson>登记 / 更新</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div><div class="dai-modal-dock" data-modal-dock="world-event" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>登记事件</b><small>模型漏记时在这里补一笔，格式与模型指令一致。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>范围</b></span><select data-world-add-scope><option value="near">主角身边</option><option value="world">世界大事</option></select></label><label class="dai-setting-row"><span><b>分量</b></span><select data-world-add-weight><option value="minor">普通</option><option value="major">重大</option><option value="rumor">传闻（未证实）</option></select></label></div><label class="dai-setting-row"><span><b>短标题</b><small>必填；列表页只显示这一行。</small></span><input type="text" maxlength="16" required data-world-add-title placeholder="例：城东连环失窃"></label><label class="dai-setting-row"><span><b>事件内容</b><small>一句话说清发生了什么，不拘题材；全文进详情弹窗。</small></span><input type="text" data-world-add-text placeholder="例：城东连着三家铺子夜里失窃"></label><label class="dai-setting-row"><span><b>依据</b><small>它从哪来：哪楼、谁、什么事引出的。</small></span><input type="text" data-world-add-basis placeholder="例：上一楼酒馆闲谈提到的失窃传闻"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>地点</b><small>跨地发生的事写明地点。</small></span><input type="text" maxlength="40" data-world-add-location placeholder="例：乌坦城·城东坊市"></label><label class="dai-setting-row"><span><b>有效期（天）</b><small>留空长期有效；到期自动了结。</small></span><input type="number" min="1" max="90" step="1" data-world-add-days placeholder="如 5"></label></div><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-world-add>登记事件</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div>
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
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>本局人物</b><small>主界面只铺最近活动的 8 个人（点名字开信息面板，行尾小图标=在场/重要/冷藏）；全部人物、筛选和搜索收进「人物总簿」。</small></div><p class="dai-state-strip" data-npc-ledger-summary>还没有载入人物簿。</p><p class="dai-turn-result" data-npc-ledger-status role="status">还没有记账。生成结束后，人物记录员会把这一轮的人物变化写进档案。</p><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-modal-open="npc-ledger-browser" data-modal-title="人物总簿">打开人物总簿</button><button type="button" class="dai-secondary-button" data-npc-ledger-run>让记录员记一次</button><button type="button" class="dai-secondary-button" data-npc-ledger-refresh>刷新名单</button><button type="button" class="dai-secondary-button" data-npc-ledger-extract>按世界书补空字段</button><button type="button" class="dai-secondary-button" data-modal-open="npc-patch" data-modal-title="记进人物簿">＋ 补一笔</button></div><ul class="dai-status-list dai-npc-grid" data-npc-ledger-recent></ul></div>
                        <div class="dai-modal-dock" data-modal-dock="npc-ledger-browser" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>人物总簿</b><small>本局全部人物都在这里：筛选、搜索、行尾小图标照常用；点名字打开信息面板。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>只看</b></span><select data-npc-ledger-filter><option value="">全部</option><option value="present">在场的</option><option value="absent">不在场的</option><option value="important">重要的</option></select></label><label class="dai-setting-row"><span><b>搜名字</b><small>姓名、别名、称号都能搜。</small></span><input type="search" data-npc-ledger-search placeholder="如 萧战"></label></div><ul class="dai-status-list dai-npc-grid" data-npc-ledger-list></ul></div><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-agent-modal-close>关闭</button></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>冷藏推进台</b><small>只给勾选的人补世界时间已经走过的那一段；不会自行推进时间，先出草稿，确认后才写回人物簿。勾选在人物行尾的「❄」。</small></div><p class="dai-state-strip" data-npc-cold-summary>当前世界日：第 1 天 · 未选择冷藏人物</p><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-modal-open="npc-cold-bench" data-modal-title="冷藏推进台">打开冷藏推进台</button></div><details class="dai-prompt-fold"><summary><span><b>推进员提示词</b><small>留空使用内置规则；必须保留“先出草稿、只输出 JSON”等边界；点开修改。</small></span></summary><label class="dai-setting-row"><span><b>规则正文</b><small>改完下一轮生效；清空恢复内置默认。</small></span><textarea data-setting="npc.coldPrompt" rows="8" spellcheck="false" placeholder="打开页面会自动铺入当前生效规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-npc-cold-default>填入默认推进规则</button></div></details></div>
                        <div class="dai-modal-dock" data-modal-dock="npc-cold-bench" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>冷藏推进台</b><small>勾选名单、扫描与草稿确认都在这里；先出草稿，确认后才写回。</small></div><ul class="dai-status-list dai-npc-grid" data-npc-cold-bench></ul><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-npc-cold-scan>扫描需要推进的人物</button><button type="button" class="dai-secondary-button" data-npc-cold-clear>清空冷藏选择</button></div><div data-npc-cold-previews></div></div><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-agent-modal-close>关闭</button></div></div>
                        <details class="dai-settle-category"><summary><span class="dai-feature-icon">☰</span><span><b>记录员提示词</b><small>人物记录员收到的 system 规则；点开修改，清空恢复内置默认。改写时保持“只输出 JSON”不变。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>规则正文</b><small>好感只记增减、流水只追加、没变化就不写。</small></span><textarea data-setting="npc.ledgerPrompt" rows="9" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-npc-ledger-default>填入默认规则</button><small>默认规则含“好感只记增减、流水只追加、没变化就不写”。</small></div></div></details>
                        <div class="dai-modal-dock" data-modal-dock="npc-patch" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>手动记账</b><small>一条补丁 = 一个人这一轮的变化；认不出的字段会被跳过，不会打断整条补丁。</small></div><label class="dai-setting-row"><span><b>补丁</b><small>例：{"人物":[{"姓名":"萧战","好感":3,"好感理由":"护住族人","态度":"对这个后辈多了几分认可","位置":"萧家议事厅","在场":"在场","流水":["主持族会，压下二长老的质疑"]}]}</small></span><textarea data-npc-ledger-patch rows="7" spellcheck="false" placeholder="粘贴或手写一条补丁"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-npc-ledger-apply>记进人物簿</button><button type="button" class="dai-secondary-button" data-npc-ledger-export>导出全簿</button><button type="button" class="dai-secondary-button" data-npc-ledger-import>导入全簿</button><button type="button" class="dai-secondary-button" data-npc-ledger-clear>清空本局人物簿</button><button type="button" class="dai-secondary-button" data-npc-ledger-extract-all>按世界书重抽：只填空着的字段</button></div></div><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div>
                    </section>
                    <section class="dai-settings-page" data-settings-section="self" role="tabpanel" hidden>
                        <div class="dai-page-heading"><h3>纳戒</h3><p>主角自身与随身之物的总账：身份、境界、功法斗技、装备栏、行囊、制作台、目标约定。生成结束后由决定模型读剧情记账，脚本逐条校验执行；这里也能手动改，与模型走同一套规则。条目点开看完整资料，添加表单收进了弹窗。</p></div>
                        <details class="dai-settle-category"><summary><span class="dai-feature-icon">✦</span><span><b>初始化主角档案（MVU）</b><small>开局填一次，默认收起：写入纳戒账本，并同步 MVU 变量（stat_data.斗破纳戒）与数据库表；留空的项保持原样不动。</small></span></summary><div class="dai-settle-category-body"><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>姓名</b></span><input type="text" data-self-init="name" maxlength="24"></label><label class="dai-setting-row"><span><b>性别</b></span><select data-self-init="gender"><option value="">（不填）</option><option>男</option><option>女</option></select></label><label class="dai-setting-row"><span><b>年龄</b></span><input type="text" data-self-init="age" maxlength="12" placeholder="如 15 / 十五岁"></label><label class="dai-setting-row"><span><b>出身</b></span><input type="text" data-self-init="origin" maxlength="24" placeholder="如 萧家 / 青山镇"></label><label class="dai-setting-row"><span><b>斗气属性</b></span><input type="text" data-self-init="attribute" maxlength="12" placeholder="火/风/雷/无属性…"></label><label class="dai-setting-row"><span><b>境界</b></span><input type="text" data-self-init="realm" maxlength="12" placeholder="斗之气/斗者…"></label><label class="dai-setting-row"><span><b>段位</b></span><input type="text" data-self-init="stage" maxlength="10" placeholder="三段/一星…"></label><label class="dai-setting-row"><span><b>金币</b></span><input type="number" data-self-init="gold" min="0" max="9999999" step="1" placeholder="初始身家"></label></div><div class="dai-turn-actions"><button type="button" class="dai-button" data-self-init-run>初始化并同步 MVU</button><span class="dai-turn-result" data-self-init-status role="status">还没初始化。</span></div></div></details>
                        <div class="dai-settings-card">
                            <div class="dai-self-tabs" role="tablist">
                                <button type="button" class="dai-self-tab is-active" data-self-tab="profile">基本信息</button>
                                <button type="button" class="dai-self-tab" data-self-tab="techniques">功法</button>
                                <button type="button" class="dai-self-tab" data-self-tab="skills">斗技</button>
                                <button type="button" class="dai-self-tab" data-self-tab="equipment">装备</button>
                                <button type="button" class="dai-self-tab" data-self-tab="treasures">天材地宝</button>
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
                        <div data-self-pane="equipment" hidden>
                            <div class="dai-settings-card"><div class="dai-card-heading"><b>装备栏</b><small>穿戴中的武器、防具、饰品；卸下自动放回行囊。点行囊条目的「装备」穿上，或直接点下方空格子里的「＋ 装备」；剧情里穿上装备、模型替你记账后都会出现在这里。</small><button type="button" class="dai-impact-edit" data-modal-open="self-equipment" data-modal-title="登记装备">＋ 添加</button></div><div class="dai-body-figure-wrap" data-self-figure></div><div class="dai-self-entries" data-self-list="equipment"></div></div>
                        </div>
                        <div data-self-pane="treasures" hidden>
                            <div class="dai-settings-card"><div class="dai-card-heading"><b>天材地宝</b><small>异火、妖丹、灵矿、先天灵物之类的天地奇物，与功法装备同级单列；获得要有剧情来源，易主或耗尽就离栏。</small><button type="button" class="dai-impact-edit" data-modal-open="self-treasures" data-modal-title="记录天材地宝">＋ 添加</button></div><div class="dai-self-entries" data-self-list="treasures"></div></div>
                        </div>
                        <div data-self-pane="bag" hidden>
                            <div class="dai-settings-card"><div class="dai-card-heading"><b>行囊</b><small>丹药、材料、武器防具、杂物都在这里；同名同类别自动并账。</small><button type="button" class="dai-impact-edit" data-modal-open="self-items" data-modal-title="放入物品">＋ 添加</button></div><div class="dai-self-entries" data-self-list="items"></div></div>
                        </div>
                        <div data-self-pane="craft" hidden>
                            <div class="dai-settings-card"><div class="dai-card-heading"><b>炼丹</b><small>学会的丹方、器谱记在这里；材料清单写关键几味就够。</small><button type="button" class="dai-impact-edit" data-modal-open="self-recipes" data-modal-title="记丹方">＋ 添加</button></div><div class="dai-forge-scene" aria-hidden="true"><div class="dai-cauldron"><i class="dai-cauldron__ear dai-cauldron__ear--l"></i><i class="dai-cauldron__ear dai-cauldron__ear--r"></i><i class="dai-cauldron__rim"></i><i class="dai-cauldron__body"></i><i class="dai-cauldron__leg dai-cauldron__leg--l"></i><i class="dai-cauldron__leg dai-cauldron__leg--m"></i><i class="dai-cauldron__leg dai-cauldron__leg--r"></i><i class="dai-cauldron__fire"></i><i class="dai-cauldron__bub"></i><i class="dai-cauldron__bub dai-cauldron__bub--2"></i><i class="dai-cauldron__bub dai-cauldron__bub--3"></i></div><div class="dai-forge-scene__caption"><b>丹炉常热</b><small>丹方记好随时开炉；火候按世界时钟倒数，到点出炉。</small></div></div><div class="dai-self-entries" data-self-list="recipes"></div></div>
                            <div class="dai-settings-card"><div class="dai-card-heading"><b>炼器</b><small>开工后按世界时钟倒数；出炉点“成丹”或“炸炉”。</small><button type="button" class="dai-impact-edit" data-modal-open="self-crafts" data-modal-title="开工炼制">＋ 添加</button></div><div class="dai-forge-scene" aria-hidden="true"><div class="dai-anvil"><i class="dai-anvil__horn"></i><i class="dai-anvil__top"></i><i class="dai-anvil__waist"></i><i class="dai-anvil__base"></i><i class="dai-anvil__log"></i><i class="dai-anvil__ember"></i><i class="dai-anvil__spark"></i><i class="dai-anvil__spark dai-anvil__spark--2"></i><i class="dai-anvil__spark dai-anvil__spark--3"></i></div><div class="dai-forge-scene__caption"><b>炉火纯青</b><small>器谱开工一样倒数；出炉在列表里点“成丹 / 炸炉”。</small></div></div><div class="dai-self-entries" data-self-list="crafts"></div></div>
                        </div>
                        <div data-self-pane="goals" hidden>
                            <div class="dai-settings-card"><div class="dai-card-heading"><b>目标与约定</b><small>主线排最前并标星；达成后退场，正文模型每轮都看得到没完成的目标。</small><button type="button" class="dai-impact-edit" data-modal-open="self-goals" data-modal-title="立目标">＋ 添加</button></div><div class="dai-self-entries" data-self-list="goals"></div></div>
                        </div>
                        <div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">◉</span><span><b>启用纳戒</b><small>关闭后不记账、不注入；已记下的内容仍留在聊天存档里。</small></span><input type="checkbox" data-setting="enableSelfLedger"></div><label class="dai-setting-row dai-setting-toggle"><span><b>把纳戒写进正文提示词</b><small>生成前把主角自身状态写进提示词，正文必须与之保持一致。</small></span><input type="checkbox" data-setting="self.inject"></label><label class="dai-setting-row"><span><b>注入字数上限</b><small>超预算从目标、进行中炼制、行囊往上丢，身份境界永远保留；0 为默认 900。</small></span><input type="number" min="0" max="4000" step="100" data-setting="self.injectBudget"></label><label class="dai-setting-row"><span><b>纳戒申报通道</b><small>跟正文：模型在正文末尾顺手输出变量申报（零额外请求）。独立调用：生成结束后扩展另发一次决定请求，正文保持干净；主回复若已带申报块则自动走正文通道兜底，不会重复记账。切换时扩展会同步启停世界书里的两条申报规则条目。</small></span><select data-setting="self.mvuChannel"><option value="inline">跟正文申报（MVU）</option><option value="independent">独立调用（扩展请求）</option></select></label><label class="dai-setting-row dai-setting-toggle"><span><b>镜像到龙血玄黄数据库</b><small>把纳戒与世界台账同步写进「龙血玄黄·数据库」的表格（表=账本，面板=前端）；没装该脚本时自动停用，照旧存聊天档案。</small></span><input type="checkbox" data-setting="enableDbBridge"></label><p class="dai-turn-result" data-self-dbbridge></p></div>
                        <details class="dai-settle-category"><summary><span class="dai-feature-icon">◉</span><span><b>指令指南（降级模式）</b><small>关闭自动决定时随纳戒现状注入的规则正文；点开修改，清空恢复内置默认。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>规则正文</b><small>操作清单、记账规则（有据可依、不照搬原著、炼成补账）都写在这里，可按你的玩法改写。</small></span><textarea data-setting="self.guide" rows="9" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-self-guide-default>填入默认规则</button><small>默认规则含“只记主角自身、变化要有依据、炼成后补记行囊”。</small></div></div></details>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>模型决定（LLM 决定脚本执行）</b><small>生成结束后，模型读最近聊天 + 相关世界书条目 + 纳戒现状做一次独立决定，输出严格 JSON，脚本逐条校验执行并显示在这里。决定用的接口与喂料在「模型设置」页「纳戒 · 决定模型」卡（与记忆决定各自独立）。</small></div><div class="dai-feature-toggle"><span class="dai-feature-icon">◉</span><span><b>启用模型决定</b><small>关闭后退回“只认正文 self 指令块”的降级模式。</small></span><input type="checkbox" data-setting="self.decideEnabled"></div><label class="dai-setting-row dai-setting-toggle"><span><b>每轮生成后自动决定</b><small>关闭后只能点“让模型决定一次”手动跑。</small></span><input type="checkbox" data-setting="self.decideAuto"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>喂最近几楼聊天</b><small>纳戒决定自己的一份（与记忆决定分开）。</small></span><input type="number" min="1" max="12" step="1" data-setting="self.decideMaxFloors"></label><label class="dai-setting-row"><span><b>世界书条目上限</b><small>按本轮聊天匹配相关条目，0 = 不带世界书。</small></span><input type="number" min="0" max="40" step="1" data-setting="self.decideMaxEntries"></label></div><p class="dai-turn-result" data-self-decide-status role="status">还没有运行。生成结束后会自动决定。</p><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-self-decide-run>让模型决定一次</button><button type="button" class="dai-secondary-button" data-self-reset>清空本局纳戒</button></div><div class="dai-world-decide-result" data-self-decide-result></div><details class="dai-prompt-fold"><summary><span><b>决定提示词</b><small>模型做决定时收到的 system 规则；点开修改，清空恢复内置默认。改写时保持“只输出 JSON”和操作字段名不变。</small></span></summary><label class="dai-setting-row"><span><b>规则正文</b><small>境界阶梯、炼成补账、有据可依的规则都在这里，可按玩法改写。</small></span><textarea data-setting="self.decidePrompt" rows="10" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-self-decide-default>填入默认规则</button><small>默认规则含“境界必须剧情真到位、炼成后补记行囊、无变化不记账”。</small></div></details></div>
                        <div class="dai-modal-dock" data-modal-dock="self-techniques" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>登记功法</b><small>模型漏记时在这里补一笔。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>名称</b></span><input type="text" data-self-new="techniques.name" placeholder="如 焚决"></label><label class="dai-setting-row"><span><b>品级</b></span><input type="text" data-self-new="techniques.grade" placeholder="黄阶低级 ~ 天阶高级"></label><label class="dai-setting-row"><span><b>类型</b></span><input type="text" data-self-new="techniques.type" placeholder="修炼功法 / 身法 / 炼药术"></label><label class="dai-setting-row"><span><b>进度</b></span><input type="text" data-self-new="techniques.progress" placeholder="如 第三层"></label><label class="dai-setting-row"><span><b>来源</b></span><input type="text" data-self-new="techniques.source" placeholder="如 药老所赠"></label></div><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-self-create="techniques">登记功法</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div>
                        <div class="dai-modal-dock" data-modal-dock="self-skills" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>登记斗技</b></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>名称</b></span><input type="text" data-self-new="skills.name" placeholder="如 八极崩"></label><label class="dai-setting-row"><span><b>品级</b></span><input type="text" data-self-new="skills.grade" placeholder="黄阶低级 ~ 天阶高级"></label><label class="dai-setting-row"><span><b>类型</b></span><input type="text" data-self-new="skills.type" placeholder="攻击 / 防御 / 身法 / 辅助"></label><label class="dai-setting-row"><span><b>熟练度</b></span><input type="text" data-self-new="skills.progress" placeholder="如 小成"></label><label class="dai-setting-row"><span><b>来源</b></span><input type="text" data-self-new="skills.source" placeholder="从哪学来的"></label></div><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-self-create="skills">登记斗技</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div>
                        <div class="dai-modal-dock" data-modal-dock="self-equipment" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>登记装备</b><small>记的是穿戴中的装备；备用装备放行囊，点行囊条目的"装备"穿上。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>名称</b></span><input type="text" data-self-new="equipment.name" placeholder="如 玄重尺"></label><label class="dai-setting-row"><span><b>品级</b></span><input type="text" data-self-new="equipment.grade" placeholder="黄阶低级 ~ 天阶高级"></label><label class="dai-setting-row"><span><b>类型</b></span><select data-self-new="equipment.type"><option value="武器">武器</option><option value="防具">防具</option><option value="饰品">饰品</option><option value="其他">其他</option></select></label><label class="dai-setting-row"><span><b>来源</b></span><input type="text" data-self-new="equipment.source" placeholder="如 家传 / 药老所赠"></label></div><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-self-create="equipment">登记装备</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div>
                        <div class="dai-modal-dock" data-modal-dock="self-treasures" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>记录天材地宝</b><small>异火、妖丹、灵矿、先天灵物之类的天地奇物。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>名称</b></span><input type="text" data-self-new="treasures.name" placeholder="如 青莲地心火"></label><label class="dai-setting-row"><span><b>品阶</b></span><input type="text" data-self-new="treasures.grade" placeholder="如 异火榜第十九 / 千年灵乳"></label><label class="dai-setting-row"><span><b>类别</b></span><select data-self-new="treasures.type"><option value="异火">异火</option><option value="灵物">灵物</option><option value="矿石">矿石</option><option value="其他">其他</option></select></label><label class="dai-setting-row"><span><b>来源</b></span><input type="text" data-self-new="treasures.source" placeholder="如 塔戈沙漠地底所得"></label></div><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-self-create="treasures">记录</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div>
                        <div class="dai-modal-dock" data-modal-dock="self-items" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>放入物品</b></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>名称</b></span><input type="text" data-self-new="items.name" placeholder="如 回气丹"></label><label class="dai-setting-row"><span><b>类别</b></span><select data-self-new="items.category"><option value="丹药">丹药</option><option value="材料">材料</option><option value="武器">武器</option><option value="防具">防具</option><option value="杂物">杂物</option><option value="关键物">关键物</option></select></label><label class="dai-setting-row"><span><b>品级</b></span><input type="text" data-self-new="items.grade" placeholder="如 一品"></label><label class="dai-setting-row"><span><b>数量</b></span><input type="number" min="1" max="999999" step="1" data-self-new="items.count" placeholder="1"></label></div><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-self-create="items">放入行囊</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div>
                        <div class="dai-modal-dock" data-modal-dock="self-recipes" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>记配方</b></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>名称</b></span><input type="text" data-self-new="recipes.name" placeholder="如 回气丹"></label><label class="dai-setting-row"><span><b>门类</b></span><select data-self-new="recipes.craft"><option value="炼药">炼药</option><option value="炼器">炼器</option><option value="其他">其他</option></select></label><label class="dai-setting-row"><span><b>品级</b></span><input type="text" data-self-new="recipes.grade" placeholder="如 一品"></label><label class="dai-setting-row"><span><b>材料清单</b></span><input type="text" data-self-new="recipes.materials" placeholder="如 回春草两株、凝气花一株"></label></div><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-self-create="recipes">记配方</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div>
                        <div class="dai-modal-dock" data-modal-dock="self-crafts" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>开工炼制</b></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>名称</b></span><input type="text" data-self-new="crafts.name" placeholder="如 聚气散"></label><label class="dai-setting-row"><span><b>门类</b></span><select data-self-new="crafts.craft"><option value="炼药">炼药</option><option value="炼器">炼器</option><option value="其他">其他</option></select></label><label class="dai-setting-row"><span><b>数量</b></span><input type="number" min="1" max="999999" step="1" data-self-new="crafts.count" placeholder="1"></label><label class="dai-setting-row"><span><b>预计天数</b><small>从今天起算；留空不设期限。</small></span><input type="number" min="1" max="365" step="1" data-self-new="crafts.days" placeholder="如 3"></label><label class="dai-setting-row"><span><b>备注</b></span><input type="text" data-self-new="crafts.note" placeholder="如 缺一味凝骨草"></label></div><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-self-craft-start>开工</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div>
                        <div class="dai-modal-dock" data-modal-dock="self-goals" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>立目标</b></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>短标题</b><small>必填，不超过 20 字；列表页只显示这一行。</small></span><input type="text" maxlength="20" required data-self-new="goals.title" placeholder="如 三年之约雪前耻"></label><label class="dai-setting-row"><span><b>完整内容</b><small>不超过 80 字，写清要做什么；与标题别重复。</small></span><input type="text" maxlength="80" data-self-new="goals.text" placeholder="如 三年之约，云岚宗一雪前耻，当众赢回萧家颜面"></label><label class="dai-setting-row"><span><b>优先级</b></span><select data-self-new="goals.priority"><option value="主线">主线</option><option value="支线">支线</option></select></label><label class="dai-setting-row"><span><b>期限</b><small>自由文本。</small></span><input type="text" data-self-new="goals.due" placeholder="如 三年后"></label></div><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-self-create="goals">立目标</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div>
                    </section>
                    <section class="dai-settings-page" data-settings-section="memory" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 12</span><h3>记忆存储</h3><p>记忆分小记忆（轻量近事）与大记忆（总结出来的长期大事），都永久保存、按需召回——"关联"里的人名/地名出现在最近剧情里才会注入提示词。书记官只记小记忆；小记忆攒够阈值就自动总结成一条大记忆，原条目随之退役。删除只由书记官或你手动做，脚本从不过期任何记忆。</p></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>记忆总览</b><small>按层统计；注入哪些记忆由「召回决定」按记忆目录+上下文挑选，召回没跑成退回关键词匹配。旧记忆永不作废。排序与按人过滤在「记忆总库」里。</small></div><p class="dai-state-strip" data-memory-overview>还没有载入记忆。</p><p class="dai-turn-result" data-memory-conflicts hidden></p><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-modal-open="memory-browser" data-modal-title="记忆总库">打开记忆总库</button><button type="button" class="dai-secondary-button" data-modal-open="memory-add" data-modal-title="手动登记一条记忆">＋ 手动登记</button></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>记忆注入</b><small>最近一轮实际进入正文提示词的记忆：来源（召回决定/关键词兜底）、条数与内容；点条目看完整记录。生成结束会标「已清理」。</small></div><p class="dai-state-strip" data-memory-injection-status>还没有注入记录：下一轮生成时由召回决定（或关键词兜底）挑选。</p><div class="dai-world-events" data-memory-injection-list></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>大记忆</b><small>值得一直记住的事；★=关键；召回优先于小记忆。主界面只铺最新 6 条，全部与翻页在「记忆总库」。</small></div><div class="dai-world-events" data-memory-recent-big></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>小记忆</b><small>轻量近事；攒够阈值自动总结成一条大记忆（原条目退役）。主界面只铺最新 8 条，全部与翻页在「记忆总库」。</small></div><div class="dai-world-events" data-memory-recent-small></div></div>
                        <div class="dai-modal-dock" data-modal-dock="memory-browser" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>记忆总库</b><small>全部大记忆与小记忆：排序、按人过滤、翻页都在这里；行内转大/提关键/删除照常用，点行看详情。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>排序</b></span><select data-memory-sort><option value="time">按生成时间</option><option value="weight">按分量（关键优先）</option><option value="tag">按标签分类</option></select></label><label class="dai-setting-row"><span><b>只看关联</b><small>下场对手戏前按人扫一遍旧账。</small></span><select data-memory-person><option value="">全部</option></select></label></div><div class="dai-card-heading"><b>大记忆</b><small>★=关键；召回优先于小记忆。每页固定 6 条，翻页看更多。</small></div><div class="dai-world-events" data-memory-list-big></div><div class="dai-pager" data-memory-pager-big></div><div class="dai-card-heading"><b>小记忆</b><small>轻量近事；攒够阈值自动总结成一条大记忆（原条目退役）。每页固定 8 条，翻页看更多。</small></div><div class="dai-world-events" data-memory-list-small></div><div class="dai-pager" data-memory-pager-small></div></div><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-agent-modal-close>关闭</button></div></div>
                        
                        <div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">✎</span><span><b>启用记忆存储</b><small>关闭后不记账、不召回；已记下的内容仍留在聊天存档里。</small></span><input type="checkbox" data-setting="enableMemoryLedger"></div><label class="dai-setting-row dai-setting-toggle"><span><b>按需召回进正文提示词</b><small>生成前注入记忆；主路由「召回决定」按目录挑选，没跑成退回关键词匹配。</small></span><input type="checkbox" data-setting="memory.inject"></label><label class="dai-setting-row"><span><b>召回字数上限</b><small>本轮注入的记忆总字数上限；超了从尾部丢；0 为默认 900。</small></span><input type="number" min="0" max="4000" step="100" data-setting="memory.injectBudget"></label><label class="dai-setting-row dai-setting-toggle"><span><b>自动决定（书记官）</b><small>每轮生成后由模型决定新记忆；关掉后只认正文里的 memory 指令块。</small></span><input type="checkbox" data-setting="memory.decideAuto"></label><label class="dai-setting-row dai-setting-toggle"><span><b>启用记忆决定调用</b><small>关闭后不再发起书记官调用，只走降级指令。</small></span><input type="checkbox" data-setting="memory.decideEnabled"></label><label class="dai-setting-row dai-setting-toggle"><span><b>启用召回决定调用</b><small>关闭后注入退回关键词匹配，不发起召回模型调用。</small></span><input type="checkbox" data-setting="memory.recallEnabled"></label><label class="dai-setting-row dai-setting-toggle"><span><b>生成前自动召回</b><small>用户输入之后、生成之前，召回员按记忆目录+上下文挑要注入的旧记忆；关掉后注入退回关键词匹配。</small></span><input type="checkbox" data-setting="memory.recallAuto"></label><label class="dai-setting-row"><span><b>小记忆攒几条自动总结成大记忆</b><small>书记官只记小记忆；攒够这个数，就自动调一次模型把这批小记忆提炼成一条大记忆，原条目退役。0 = 关闭自动总结；「现在就总结一次」不受阈值限制。</small></span><input type="number" min="0" max="30" step="1" data-setting="memory.consolidateAfter"></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-memory-consolidate>现在就总结一次</button><small role="status" data-memory-consolidate-status></small></div><details class="dai-settle-category"><summary><span class="dai-feature-icon">✎</span><span><b>指令指南（降级模式）</b><small>关闭自动决定时随召回结果注入的规则正文；保持"只输出 JSON"与操作字段名不变，清空恢复内置默认。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>指南正文</b></span><textarea data-setting="memory.guide" rows="9" spellcheck="false"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-memory-guide-default>填入默认指南</button></div></div></details></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>模型决定（LLM 决定脚本执行）</b><small>生成结束后，书记官读最近聊天 + 相关世界书条目 + 本场召回的记忆做一次独立决定，输出严格 JSON，脚本逐条校验执行。</small></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button" data-memory-decide-run>手动决定一次</button><span data-memory-decide-status></span></div><div data-memory-decide-result></div><details class="dai-settle-category"><summary><span class="dai-feature-icon">✦</span><span><b>决定提示词</b><small>书记官的 system 指令；保持"只输出 JSON"与操作字段名不变，清空恢复内置默认。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>提示词正文</b></span><textarea data-setting="memory.decidePrompt" rows="9" spellcheck="false"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-memory-decide-default>填入默认提示词</button></div></div></details></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>召回决定（LLM 挑选注入哪些记忆）</b><small>用户输入之后、生成之前，召回员读记忆目录（标题+钥匙）+ 最近聊天 + 世界书命中，挑出本轮要注入的旧记忆编号，脚本执行注入；失败或关闭时退回关键词匹配，不阻塞生成。</small></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button" data-memory-recall-run>手动召回一次</button><span data-memory-recall-status></span></div><div data-memory-recall-result></div><details class="dai-settle-category"><summary><span class="dai-feature-icon">✦</span><span><b>召回提示词</b><small>召回员的 system 指令；保持"只输出 JSON"与 ids 字段名不变，清空恢复内置默认。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>提示词正文</b></span><textarea data-setting="memory.recallPrompt" rows="9" spellcheck="false"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-memory-recall-default>填入默认提示词</button></div></div></details></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>记忆指令流水</b><small>最近几批指令的执行结果；重 roll 一楼会先撤销它上一版指令。</small></div><div class="dai-world-journal" data-memory-journal></div></div>
                    <div class="dai-modal-dock" data-modal-dock="memory-add" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>手动登记</b><small>书记官漏记时在这里补一笔，校验与模型指令完全一致。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>层级</b></span><select data-memory-new-tier><option value="small">小记忆</option><option value="big">大记忆</option></select></label><label class="dai-setting-row"><span><b>标签（大记忆可选）</b></span><select data-memory-new-tag><option value="">不标</option><option value="grudge">恩怨</option><option value="intel">情报</option><option value="thread">伏笔</option><option value="milestone">大事记</option></select></label><label class="dai-setting-row"><span><b>分量</b></span><select data-memory-new-weight><option value="minor">一般</option><option value="major">关键</option></select></label></div><label class="dai-setting-row"><span><b>短标题</b><small>必填；列表主页只显示这一行。</small></span><input type="text" data-memory-new-title maxlength="14" required></label><label class="dai-setting-row"><span><b>内容</b><small>一句话说清记住了什么、为什么值得记。</small></span><input type="text" data-memory-new-text maxlength="300"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>依据</b><small>从哪来：哪楼/谁/什么事。</small></span><input type="text" data-memory-new-basis maxlength="80"></label><label class="dai-setting-row"><span><b>关联（必填）</b><small>人名/地名/物名，顿号分隔最多 4 个——这是日后按需召回的钥匙。</small></span><input type="text" data-memory-new-related maxlength="140"></label></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>别名（可选）</b><small>同一记忆的其余叫法（药老/药尘），也算召回钥匙。</small></span><input type="text" data-memory-new-aliases maxlength="140"></label><label class="dai-setting-row"><span><b>引文（可选）</b><small>当时的一句原话，召回时以「」带回正文。</small></span><input type="text" data-memory-new-quote maxlength="60"></label></div><label class="dai-setting-row"><span><b>备注（可选）</b><small>细节、背景、后续影响——列表行内只显示内容一句，这些都在详情弹窗里。</small></span><input type="text" data-memory-new-note maxlength="200"></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button" data-memory-add>登记这条记忆</button></div></div><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></section>
                    <section class="dai-settings-page" data-settings-section="impact" role="tabpanel" hidden>
                        <div class="dai-page-heading"><h3>世界影响</h3><p>记录你把这局世界改成了什么样：烧掉的据点、得罪的势力、提前发生或没能发生的原著事件。库跟着这份聊天存档走，写进后续每一轮的正文提示词。账本在下面；添加和编辑都走弹窗。</p></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>世界线最近变化</b><small data-impact-summary>加载中…</small></div><p class="dai-state-strip" data-impact-stats>本轮还没挑过注入；生成前会自动挑。</p><p class="dai-turn-result" data-impact-decide-status role="status">默认按上面的节奏自动记录；也可以点“现在记录一次”。</p><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-impact-open-ledger>打开世界账本</button><button type="button" class="dai-secondary-button" data-impact-add>＋ 记一条</button><button type="button" class="dai-secondary-button" data-impact-record>现在记录一次</button></div><ul class="dai-impact-list dai-impact-recent" data-impact-recent></ul></div><div class="dai-modal-dock" data-modal-dock="impact-ledger" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>世界账本</b><small>全部记录都在这里：筛选、搜索、编辑、收场、删除与档案恢复。</small></div><div class="dai-impact-toolbar"><select data-impact-filter aria-label="筛选影响"><option value="all">全部</option><option value="active">未了结</option><option value="ripened">已发酵</option><option value="closed">已了结</option></select><select data-impact-weight aria-label="按分量筛选"><option value="">分量</option><option value="world">世界级</option><option value="major">大事</option><option value="minor">小事</option></select><select data-impact-kind aria-label="按性质筛选"><option value="">性质</option><option value="direct">直接</option><option value="ripple">涟漪</option><option value="butterfly">蝴蝶</option></select><input type="search" data-impact-search placeholder="搜标题、对象或原著" aria-label="搜索影响"><button type="button" class="dai-button dai-button-ghost" data-impact-refresh>刷新</button></div><ul class="dai-impact-list" data-impact-library></ul><details class="dai-impact-archive" data-impact-archive><summary>档案 <small data-impact-archive-count>0 条</small></summary><p class="dai-impact-empty">被删除或因为库满挤出去的旧影响会留在这里，可以恢复。</p><ol class="dai-impact-list" data-impact-archive-list></ol></details><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-agent-modal-close>关闭</button></div></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>记录与注入</b><small>什么时机记账、怎么进正文；记录员与场记用的接口在「模型设置」页。</small></div><div class="dai-feature-toggle"><span class="dai-feature-icon">⌁</span><span><b>启用世界影响库</b><small>关掉后不记录、不注入，但已记下的内容仍留在聊天存档里。</small></span><input type="checkbox" data-setting="enablePlayerImpact"></div><label class="dai-setting-row dai-setting-toggle"><span><b>生成后自动记录</b><small>让“记录模型”在正文生成结束后把这一轮的世界变化写进库；关掉后只剩手动记录。</small></span><input type="checkbox" data-setting="impact.decideAuto"></label><label class="dai-setting-row"><span><b>记录节奏</b><small>每轮都记更细，但每轮多一次模型调用；每三轮记一次更省，代价是中间两轮的改动要等到下次记账才进库。</small></span><select data-setting="impact.decideEvery"><option value="1">每轮生成后</option><option value="3">每三轮生成后</option></select></label><label class="dai-setting-row"><span><b>总览显示最近几条</b><small>总页面只铺最近生成的影响；其余进「世界账本」弹窗看。</small></span><input type="number" min="1" max="20" step="1" data-setting="impact.recentCount"></label><label class="dai-setting-row dai-setting-toggle"><span><b>把世界线写进正文提示词</b><small>已发生、还没收场的影响会作为“本局世界线”随生成发给正文模型。</small></span><input type="checkbox" data-setting="impact.inject"></label><label class="dai-setting-row dai-setting-toggle"><span><b>注入前让模型挑选</b><small>每轮生成前，让“挑选模型”从账本里挑出这一幕真正用得上的影响，并改写成旁白；关掉则按分量和日期直接取，省一次调用。</small></span><input type="checkbox" data-setting="impact.injectSmart"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>注入字数预算</b><small>每轮最多花多少字描述已改的世界线；超出预算的影响只留在库里。</small></span><input type="number" min="0" max="2000" step="50" data-setting="impact.injectBudget"></label><label class="dai-setting-row"><span><b>注入前看最近几楼</b><small>挑选模型据此判断这一幕的场面：玩家在哪、身边有谁、要做什么。</small></span><input type="number" min="1" max="12" step="1" data-setting="impact.injectFloors"></label></div><label class="dai-setting-row"><span><b>影响链最多接几层</b><small>一条影响还能接出几条后续；超过这个层数就只记录，不再自动接链。</small></span><input type="number" min="0" max="8" step="1" data-setting="impact.maxChainDepth"></label></div>
                        <details class="dai-prompt-fold"><summary><span><b>记录员提示词</b><small>生成结束后记账用的规则；点开才展开。</small></span></summary><label class="dai-setting-row"><span><b>规则正文</b><small>打开页面显示的就是当前生效的全文；清空＝恢复内置默认。改写时保持“只输出 JSON”和操作字段名不变。</small></span><textarea data-setting="impact.prompt" rows="14" spellcheck="false" placeholder="留空使用内置提示词"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-impact-prompt-default="decide">填入内置提示词</button><small>改完下一轮生效，不用重启。</small></div></details>
                        <details class="dai-prompt-fold"><summary><span><b>场记提示词</b><small>生成前挑选并改写影响用的规则；点开才展开。</small></span></summary><label class="dai-setting-row"><span><b>规则正文</b><small>打开页面显示的就是当前生效的全文；清空＝恢复内置默认。改写时保持“只从账本挑、用 #编号”不变。</small></span><textarea data-setting="impact.injectPrompt" rows="12" spellcheck="false" placeholder="留空使用内置提示词"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-impact-prompt-default="inject">填入内置提示词</button><small>默认收起；改完下一轮生效。</small></div></details>
                        <div class="dai-modal-dock" data-modal-dock="impact-form" hidden><div class="dai-settings-card"><div class="dai-impact-form" data-impact-form hidden><input type="hidden" data-impact-field="ref"><div class="dai-impact-form-head"><b data-impact-form-title>记一条世界影响</b><small>手动记的条目和记录员记的一样：会进正文、会发酵，也保留在聊天存档里。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>标题</b></span><input type="text" maxlength="20" data-impact-field="title" placeholder="世界哪一块变了（≤20字）"></label><label class="dai-setting-row"><span><b>对象</b></span><input type="text" maxlength="40" data-impact-field="target" placeholder="哪个地方/势力/规矩"></label></div><label class="dai-setting-row"><span><b>详情</b><small>具体变了什么、有什么能被看见的后果。</small></span><textarea rows="3" maxlength="240" data-impact-field="detail" placeholder="例如：城中药材涨价，加列家族开始暗中追查纵火者"></textarea></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>性质</b></span><select data-impact-field="kind"><option value="direct">直接 · 玩家亲手</option><option value="ripple">涟漪 · 旁人因此改主意</option><option value="butterfly">蝴蝶 · 隔了时间才显形</option></select></label><label class="dai-setting-row"><span><b>分量</b></span><select data-impact-field="weight"><option value="minor">小事</option><option value="major">大事</option><option value="world">世界级</option></select></label><label class="dai-setting-row"><span><b>确定性</b></span><select data-impact-field="certainty"><option value="certain">确凿</option><option value="rumor">传闻</option></select></label></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>依据</b></span><input type="text" maxlength="120" data-impact-field="evidence" placeholder="哪一楼、哪句话"></label><label class="dai-setting-row"><span><b>对上台账事件</b><small>世界运转里的事件编号，如 e2；没有就留空。</small></span><input type="text" maxlength="40" data-impact-field="eventId" placeholder="例如：e2"></label><label class="dai-setting-row"><span><b>原著节点</b><small>没牵动就留空。</small></span><input type="text" maxlength="60" data-impact-field="canon" placeholder="例如：退婚"></label><label class="dai-setting-row"><span><b>原著偏移</b></span><select data-impact-field="shift"><option value="none">不牵动</option><option value="accelerate">加速</option><option value="delay">延后</option><option value="avoid">避过</option><option value="alter">改写</option></select></label></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button" data-impact-save>保存</button><button type="button" class="dai-button dai-button-ghost" data-impact-form-close>取消</button><small role="status" data-impact-form-status></small></div></div></div></div>
                    </section>
                    <section class="dai-settings-page" data-settings-section="sandbox" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">核心能力 / 10</span><h3>开放世界</h3><p>开启后进入开放世界口径：不跟随原著剧情、不用世界书，斗气大陆照自己的逻辑运转，任务与传闻就是世界递到玩家手里的方向；关回主线一切照旧。</p><p role="status" data-sandbox-status>改动会先保存；本局真正切换口径需要在本局内确认。</p></div>
                        <div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon">◈</span><span><b>启用开放世界</b><small>开启＝开放世界口径：不跟剧情、不用世界书，斗气大陆基线注入正文。关闭＝主线口径：原著节点到点发生，玩家只影响过程。</small></span><input type="checkbox" data-setting="enableSandboxMode"></div>
<div class="dai-sandbox-pending" data-sandbox-pending hidden role="alert"><p><b>本局口径切换待确认</b><small>确认后本局按新口径继续：不回退已发生的事实、代价与关系，只做重新对齐。</small></p><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-sandbox-confirm>确认切换</button><button type="button" class="dai-secondary-button" data-sandbox-cancel>先不切</button></div></div>
<label class="dai-setting-row"><span><b>世界惯性</b><small>决定原著事件在开放世界里多积极地自行发生。强＝窗口一开始就发生；中＝到窗口结束才发生；弱＝不再自动发生，只留候选。</small></span><select data-setting="sandbox.inertia"><option value="strong">强 · 世界推着走</option><option value="medium">中 · 有人介入才偏离</option><option value="weak">弱 · 默认不动</option></select></label><label class="dai-setting-row dai-setting-toggle"><span><b>原著人物保留自主行动</b><small>关闭后原著人物只对玩家作出反应，不再主动推进自身轨迹。</small></span><input type="checkbox" data-setting="sandbox.canonCharactersAutonomous"></label><label class="dai-setting-row dai-setting-toggle"><span><b>允许中途切换模式</b><small>切换需要确认，而且只做重新对齐，不倒带已经发生的事实、代价和关系。</small></span><input type="checkbox" data-setting="sandbox.allowMidgameSwitch"></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>世界推进预算</b><small>开放世界的推进节奏与宽限；目标的载体就是世界运转的任务，这里不再单设。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>单回合最多新增对象</b><small>限制一回合内新冒出的线索与目标数量。</small></span><input type="number" min="0" max="8" step="1" disabled aria-label="单回合新增对象预算暂不可用" title="当前运行链未实现此预算；仅保留旧配置" data-setting="sandbox.maxNewObjectsPerTurn"></label></div><label class="dai-setting-row"><span><b>节点宽限天数</b><small>节点窗口结束后再等这么多游戏日，仍未发生才记为过期。</small></span><input type="number" min="0" max="60" step="1" disabled aria-label="节点宽限暂不可用" title="当前运行链未实现节点窗口；仅保留旧配置" data-setting="sandbox.nodeWindowSlackDays"></label></div></div>
                    </section>
                    <section class="dai-settings-page" data-settings-section="runtime" role="tabpanel" hidden>
                        <div class="dai-page-heading"><span class="dai-page-eyebrow">系统 / 11</span><h3>运行与界面</h3><p>这里放全局开关、预算保护和诊断选项。</p></div><div class="dai-settings-card"><div class="dai-card-heading"><b>运行预算</b><small>这是保护上限，不代表模型一定会消耗这些额度。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>单次最多模块数</b></span><input type="number" min="1" max="32" step="1" data-setting="budget.maxModules"></label><label class="dai-setting-row"><span><b>最多 NPC 决策数</b></span><input type="number" min="0" max="20" step="1" data-setting="budget.maxNpcDecisions"></label></div><label class="dai-setting-row"><span><b>总等待上限（毫秒）</b></span><input type="number" min="1000" max="600000" step="1000" data-setting="budget.totalTimeoutMs"></label></div><div class="dai-settings-card"><div class="dai-card-heading"><b>反馈显示</b><small>控制页面和右下角反馈的显示内容。</small></div><label class="dai-setting-row dai-setting-toggle"><span><b>显示历史状态</b></span><input type="checkbox" data-setting="status.showHistory"></label><label class="dai-setting-row dai-setting-toggle"><span><b>显示能力检测提示</b></span><input type="checkbox" data-setting="status.showCapabilityBadge"></label><label class="dai-setting-row dai-setting-toggle"><span><b>紧凑界面</b></span><input type="checkbox" data-setting="ui.compact"></label><label class="dai-setting-row dai-setting-toggle"><span><b>先占位再补正文</b><small>等待模型时先在对话里放一条“……”，正文回来后再替换。</small></span><input type="checkbox" data-setting="ui.placeholder"></label><label class="dai-setting-row dai-setting-toggle"><span><b>调试信息</b><small>只记录本地诊断信息，不记录提示词或密钥。</small></span><input type="checkbox" data-setting="debug"></label></div><div class="dai-settings-card"><div class="dai-card-heading"><b>旧版手动脉冲</b><small>默认关闭：正文由酒馆自己生成，扩展只在生成前注入原著设定。开启后回到“面板里点结算这一轮”的旧链路，两条链路会抢正文，不建议同时用。</small></div><label class="dai-setting-row dai-setting-toggle"><span><b>启用旧版手动脉冲</b><small>仅在需要对照旧行为时打开。</small></span><input type="checkbox" data-setting="ui.legacyTurn"></label></div></section>
                </div>
                <footer class="dai-settings-footer"><span>修改会自动保存到酒馆扩展设置</span><button type="button" class="dai-secondary-button" data-settings-close>完成</button></footer>
            </main>
        </div>`;
    document.body.append(panel);
    const selectPage = page => {
        const wanted = page === 'llm' ? 'hub' : page;
        activeSettingsPage = [...panel.querySelectorAll('[data-settings-section]')].some(section => section.dataset.settingsSection === wanted) ? wanted : 'overview';
        for (const item of panel.querySelectorAll('[data-settings-page]')) item.classList.toggle('is-active', item.dataset.settingsPage === activeSettingsPage);
        for (const section of panel.querySelectorAll('[data-settings-section]')) section.hidden = section.dataset.settingsSection !== activeSettingsPage;
        const title = panel.querySelector('[data-settings-title]');
        const selected = panel.querySelector(`[data-settings-page="${activeSettingsPage}"] b`);
        if (title && selected) title.textContent = selected.textContent;
        if (activeSettingsPage === 'overview') {
            renderCallLogList(panel);
            renderRuntimeMode(panel);
            const cover = panel.querySelector('[data-cover-script-status]');
            if (cover) cover.textContent = probeCoverScriptStatus().text;
        }
        if (activeSettingsPage === 'facts') {
            const status = panel.querySelector('[data-injection-status]');
            if (status) status.textContent = agentPromptInjection.inspect().note;
            renderFactsStatus(panel);
            refreshWorldbookStats(panel);
            renderFactsBrowser(panel);
        }
        if (activeSettingsPage === 'world') refreshWorldPage(panel);
        if (activeSettingsPage === 'memory') refreshMemoryPage(panel);
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
    panel.addEventListener('click', async event => {
        if (event.target.closest?.('.dai-agent-modal') && !event.target.closest?.('[data-agent-modal-close]') && !agentModalCurrent(panel)) return;
        const manualSelf = operations => panelMutation(panel, operations, applySelfOps, persistSelf, setSelfStatus);
        const close = event.target.closest?.('[data-settings-close]');
        if (close) return closeSettingsPanel();
        const sandboxConfirm = event.target.closest?.('[data-sandbox-confirm]');
        if (sandboxConfirm) return confirmSandboxSwitch();
        const sandboxCancel = event.target.closest?.('[data-sandbox-cancel]');
        if (sandboxCancel) return cancelSandboxSwitch();
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
        if (event.target.closest?.('[data-settle-follow-default]')) {
            const area = panel.querySelector('[data-setting="settle.resultPrompt"]');
            if (area) {
                area.value = '';
                area.dispatchEvent(new Event('input', { bubbles: true }));
            }
            renderSettleResultCard();
            return;
        }
        const defaultPrompt = event.target.closest?.('[data-prompt-default]');
        if (defaultPrompt) {
            const which = defaultPrompt.dataset.promptDefault;
            const settleCategory = which.startsWith('settle:') ? resolveCategory(which.slice(7)) : null;
            const area = settleCategory
                ? panel.querySelector(`[data-setting="settle.prompt.${settleCategory.id}"]`)
                : which === 'settleResult'
                    ? panel.querySelector('[data-setting="settle.resultPrompt"]')
                    : panel.querySelector(`[data-setting="prompt.${which === 'lookup' ? 'lookup' : 'select'}"]`);
            if (area) {
                area.value = settleCategory
                    ? settleCategory.prompt
                    : (which === 'settleResult' ? SETTLE_RESULT_PROMPT : (which === 'lookup' ? LOOKUP_RULES : SELECT_RULES));
                area.dispatchEvent(new Event('input', { bubbles: true }));
            }
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
        // API设置方案：新建/复制/删除/拉取模型，都带着方案 id 定位到具体条目。
        if (event.target.closest?.('[data-api-add-preset]')) {
            addApiPreset(panel);
            return;
        }
        const presetCopy = event.target.closest?.('[data-api-preset-copy]');
        if (presetCopy) {
            copyApiPreset(panel, presetCopy.dataset.apiPresetCopy);
            return;
        }
        const presetRemove = event.target.closest?.('[data-api-preset-remove]');
        if (presetRemove) {
            removeApiPreset(panel, presetRemove.dataset.apiPresetRemove);
            return;
        }
        const presetModels = event.target.closest?.('[data-api-preset-models]');
        if (presetModels) {
            void fetchApiPresetModels(panel, presetModels.dataset.apiPresetModels);
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
            const result = await manualSelf([{ op: 'setProfile', field, text: value }]);
            if (['save_failed', 'stale', 'busy', 'pending_save'].includes(result.status)) return;
            setSelfStatus(result.applied.length ? `${SELF_PROFILE_LABELS[field] ?? field} 已更新${value ? '' : '（清空）'}。` : `未生效：${result.rejected[0]?.reason ?? '无变化'}`);
            return;
        }
        if (event.target.closest?.('[data-self-realm-set]')) {
            const realm = panel.querySelector('[data-self-realm]')?.value.trim() ?? '';
            const stage = panel.querySelector('[data-self-stage]')?.value.trim() ?? '';
            const result = await manualSelf([{ op: 'setRealm', realm, stage }]);
            if (['save_failed', 'stale', 'busy', 'pending_save'].includes(result.status)) return;
            setSelfStatus(result.applied.length ? `境界已记为 ${realm}${stage}。` : `未生效：${result.rejected[0]?.reason ?? '无变化'}`);
            return;
        }
        if (event.target.closest?.('[data-self-gold-set]')) {
            const input = panel.querySelector('[data-self-gold]');
            const amount = Number(input?.value);
            if (!Number.isInteger(amount) || amount < 0) { setSelfStatus('金币要填 0 以上的整数。'); return; }
            const result = await manualSelf([{ op: 'setGold', amount }]);
            if (['save_failed', 'stale', 'busy', 'pending_save'].includes(result.status)) return;
            setSelfStatus(result.applied.length ? `金币已记为 ${amount}。` : `未生效：${result.rejected[0]?.reason ?? '无变化'}`);
            return;
        }
        if (event.target.closest?.('[data-self-title-add]')) {
            const input = panel.querySelector('[data-self-title]');
            const value = typeof input?.value === 'string' ? input.value.trim() : '';
            if (!value) { setSelfStatus('先写称号再加。'); return; }
            const result = await manualSelf([{ op: 'addTitle', text: value }]);
            if (result.applied.length && input) input.value = '';
            if (['save_failed', 'stale', 'busy', 'pending_save'].includes(result.status)) return;
            setSelfStatus(result.applied.length ? `称号 +${value}。` : `未生效：${result.rejected[0]?.reason ?? '重复或满了'}`);
            return;
        }
        const titleRemove = event.target.closest?.('[data-self-title-remove]');
        if (titleRemove) {
            const value = titleRemove.dataset.selfTitleRemove;
            const result = await manualSelf([{ op: 'removeTitle', text: value }]);
            if (['save_failed', 'stale', 'busy', 'pending_save'].includes(result.status)) return;
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
            const opOf = { techniques: 'removeTechnique', skills: 'removeSkill', equipment: 'removeEquipment', items: 'removeItem', treasures: 'removeTreasure', recipes: 'removeRecipe', goals: 'removeGoal' };
            const op = opOf[list];
            if (!op || !id) { setSelfStatus('未移除：清单或编号无效。'); return; }
            if (typeof window === 'undefined' || !window.confirm(`移除 ${list} 中的 ${id}？此操作不能撤销。`)) return;
            const result = await manualSelf([{ op, id }]);
            if (['save_failed', 'stale', 'busy', 'pending_save'].includes(result.status)) return;
            setSelfStatus(result.applied.length ? `已移除 ${id}。` : `未生效：${result.rejected[0]?.reason ?? '编号不存在'}`);
            if (insideModal && result.applied.length) closeAgentModal(panel);
            return;
        }
        const selfEquip = event.target.closest?.('[data-self-equip]');
        if (selfEquip) {
            const id = selfEquip.dataset.selfEquip;
            const entry = agentSelfRuntime.snapshot().items.find(item => item.id === id);
            if (!entry) { setSelfStatus('这件物品已经不在行囊里了。'); return; }
            if (entry.equipped) {
                // 旧档遗留的"装备中"标记：只翻转标记，不动清单归属。
                const result = await manualSelf([{ op: 'updateItem', id, equipped: false }]);
                if (['save_failed', 'stale', 'busy', 'pending_save'].includes(result.status)) return;
            setSelfStatus(result.applied.length ? `${entry.name} 已卸下。` : `未生效：${result.rejected[0]?.reason ?? '无变化'}`);
                if (insideModal) closeAgentModal(panel);
                return;
            }
            const result = agentSelfRuntime.transferEquipment(id, { direction: 'equip', source: 'panel', day: worldDay() });
            if (result.applied.length) {
                result.persistence = persistSelf();
                refreshSelfPage();
                if (!await awaitPanelPersistence(result, setSelfStatus)) return;
            }
            setSelfStatus(result.applied.length ? `${entry.name} 已穿上。` : `未生效：${result.rejected[0]?.reason ?? '无变化'}`);
            if (insideModal && result.applied.length) closeAgentModal(panel);
            return;
        }
        const selfUnequip = event.target.closest?.('[data-self-unequip]');
        if (selfUnequip) {
            const id = selfUnequip.dataset.selfUnequip;
            const entry = agentSelfRuntime.snapshot().equipment.find(item => item.id === id);
            if (!entry) { setSelfStatus('这件装备已经不在装备栏里了。'); return; }
            const result = agentSelfRuntime.transferEquipment(id, { direction: 'unequip', source: 'panel', day: worldDay() });
            if (result.applied.length) {
                result.persistence = persistSelf();
                refreshSelfPage();
                if (!await awaitPanelPersistence(result, setSelfStatus)) return;
            }
            setSelfStatus(result.applied.length ? `${entry.name} 已卸下进行囊。` : `未生效：${result.rejected[0]?.reason ?? '无变化'}`);
            if (insideModal && result.applied.length) closeAgentModal(panel);
            return;
        }
        const selfCountSet = event.target.closest?.('[data-self-count-set]');
        if (selfCountSet) {
            const id = selfCountSet.dataset.selfCountSet;
            const input = panel.querySelector(`[data-self-count-input="${id}"]`);
            const count = Number(input?.value);
            if (!Number.isInteger(count) || count < 0) { setSelfStatus('数量要填 0 以上的整数（0 = 用光移除）。'); return; }
            const result = await manualSelf([{ op: 'updateItem', id, count }]);
            if (['save_failed', 'stale', 'busy', 'pending_save'].includes(result.status)) return;
            setSelfStatus(result.applied.length ? `${id} 数量已改为 ${count}。` : `未生效：${result.rejected[0]?.reason ?? '编号不存在'}`);
            if (insideModal) closeAgentModal(panel);
            return;
        }
        const selfFinish = event.target.closest?.('[data-self-finish]');
        if (selfFinish) {
            const [id, result] = String(selfFinish.dataset.selfFinish).split(':');
            const outcome = await manualSelf([{ op: 'finishCraft', id, result: result === 'success' ? 'success' : 'fail' }]);
            if (['save_failed', 'stale', 'busy', 'pending_save'].includes(outcome.status)) return;
            setSelfStatus(outcome.applied.length ? `${id} 已出炉${result === 'success' ? '；记得把成品放进行囊。' : '（炸炉）。'}` : `未生效：${outcome.rejected[0]?.reason ?? '编号不存在'}`);
            if (insideModal) closeAgentModal(panel);
            return;
        }
        const selfGoalFinish = event.target.closest?.('[data-self-goal-finish]');
        if (selfGoalFinish) {
            const id = selfGoalFinish.dataset.selfGoalFinish;
            const result = await manualSelf([{ op: 'finishGoal', id }]);
            if (['save_failed', 'stale', 'busy', 'pending_save'].includes(result.status)) return;
            setSelfStatus(result.applied.length ? `目标 ${id} 达成。` : `未生效：${result.rejected[0]?.reason ?? '编号不存在'}`);
            if (insideModal) closeAgentModal(panel);
            return;
        }
        const selfDecideRun = event.target.closest?.('[data-self-decide-run]');
        if (selfDecideRun) {
            selfDecideRun.disabled = true;
            // 合并决定开着就走一次调用（纳戒+记忆一起出结果），关了才单跑纳戒。
            const run = unifiedActive() ? runUnifiedDecision({ source: 'manual' }) : runSelfDecision({ source: 'manual' });
            void run.finally(() => { selfDecideRun.disabled = false; });
            return;
        }
        const selfInitRun = event.target.closest?.('[data-self-init-run]');
        if (selfInitRun) {
            const selfSection = panel.querySelector('[data-settings-section="self"]');
            const readInit = key => selfSection?.querySelector(`[data-self-init="${key}"]`)?.value?.trim() ?? '';
            const ops = [];
            for (const field of ['name', 'gender', 'age', 'origin', 'attribute']) {
                const text = readInit(field);
                if (text) ops.push({ op: 'setProfile', field, text });
            }
            const realm = readInit('realm');
            const stage = readInit('stage');
            if (realm || stage) ops.push({ op: 'setRealm', realm, stage });
            const gold = Number(readInit('gold'));
            if (Number.isFinite(gold) && gold > 0) ops.push({ op: 'setGold', amount: Math.floor(gold) });
            const initStatus = panel.querySelector('[data-self-init-status]');
            if (!ops.length) {
                if (initStatus) initStatus.textContent = '先填至少一项再初始化。';
                return;
            }
            const result = await manualSelf(ops);
            if (['save_failed', 'stale', 'busy', 'pending_save'].includes(result.status)) {
                if (initStatus) initStatus.textContent = '内存已变更，但存档未保存；请直接重试初始化保存。';
                return;
            }
            const applied = (result?.applied ?? []).map(item => item?.summary ?? '').filter(Boolean);
            const rejected = (result?.rejected ?? []).map(item => `${item?.field ?? item?.op ?? '?'}：${item?.reason ?? '未生效'}`);
            if (initStatus) initStatus.textContent = applied.length
                ? `已写入 ${applied.length} 项：${applied.join('；')}${rejected.length ? `。未生效：${rejected.join('；')}` : ''}`
                : `未生效：${rejected.join('；') || '原因不明'}`;
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
        if (memoryForget) {
            if (typeof window === 'undefined' || !window.confirm(`删除记忆 ${memoryForget.dataset.memoryForget}？此操作不能撤销。`)) return;
            return memoryApplyFromPanel(panel, [{ op: 'forgetMemory', id: memoryForget.dataset.memoryForget }]);
        }
        if (event.target.closest?.('[data-memory-add]')) return memoryAddFromPanel(panel);
        if (event.target.closest?.('[data-memory-decide-run]')) {
            void (unifiedActive() ? runUnifiedDecision({ source: 'manual' }) : runMemoryDecision({ source: 'manual' }));
            return;
        }
        const memoryRecallRun = event.target.closest?.('[data-memory-recall-run]');
        if (memoryRecallRun) {
            memoryRecallRun.disabled = true;
            void runMemoryRecall({ source: 'manual' }).finally(() => { memoryRecallRun.disabled = false; });
            return;
        }
        const settleAdjudicateRun = event.target.closest?.('[data-settle-adjudicate-run]');
        if (settleAdjudicateRun) {
            settleAdjudicateRun.disabled = true;
            const status = panel.querySelector('[data-settle-result-status]');
            if (status) status.textContent = '判定员正在读这一轮……';
            void writeSettleAdjudicationForPrompt({ force: true, preview: true }).then(result => {
                if (status && result.status === 'busy') status.textContent = '已有模型调用进行中，未启动额外预览。';
            }).finally(() => { settleAdjudicateRun.disabled = false; });
            return;
        }
        if (event.target.closest?.('[data-memory-consolidate]')) {
            void runMemoryConsolidation({ source: 'manual' });
            return;
        }
        const calllogRefresh = event.target.closest?.('[data-calllog-refresh]');
        if (calllogRefresh) return renderCallLogList(panel);
        if (event.target.closest?.('[data-calllog-clear]')) {
            agentLlmClient.clearCallLog();
            return renderCallLogList(panel);
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
        const memoryRecallDefault = event.target.closest?.('[data-memory-recall-default]');
        if (memoryRecallDefault) {
            const area = panel.querySelector('[data-setting="memory.recallPrompt"]');
            if (area) {
                area.value = MEMORY_RECALL_PROMPT;
                area.dispatchEvent(new Event('input', { bubbles: true }));
            }
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
        if (coldConfirm) {
            const receipt = confirmNpcColdPreview(coldConfirm.dataset.npcColdConfirm);
            // 确认本身不在此处校验；只把返回的存档回执翻译成可见反馈，失败不再冒充成功。
            const persistence = receipt?.persistence ?? receipt?.result?.persistence;
            if (persistence) void awaitPanelPersistence({ persistence }, setNpcLedgerStatus);
            return;
        }
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
            picker.addEventListener('change', () => { void importNpcLedgerFile(picker.files?.[0], panel); }, { once: true });
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
        if (npcOpen) { openNpcProfileModal(panel, npcOpen.dataset.npcLedgerOpen, { tab: npcOpen.dataset.npcLedgerTab || 'basic' }); return; }
        const npcColdToggle = event.target.closest?.('[data-npc-cold-toggle]');
        if (npcColdToggle) {
            const name = npcColdToggle.dataset.npcColdToggle;
            const result = agentNpcColdRuntime.status().selected.includes(name)
                ? agentNpcColdRuntime.deselect(name)
                : agentNpcColdRuntime.select(name);
            const saved = await persistNpcCold();
            renderNpcLedgerList(panel);
            if (saved.status !== 'saved') { setNpcLedgerStatus(`${name} 的冷藏勾选已改在内存，但存档未保存；请稍后重新勾一次以恢复保存。`); return; }
            setNpcLedgerStatus(result.status === 'selected' ? `${name} 已勾进冷藏推进台。` : `${name} 已移出冷藏推进台。`);
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
            const result = await panelMutation(panel, { name, body, day: Number.isInteger(day) && day > 0 ? day : worldDay() }, operation => {
                const changed = agentNpcLedger.addExp(operation.name, operation.body, { day: operation.day });
                if (changed.status === 'added') changed.persistence = persistNpcLedger();
                return changed;
            }, persistNpcLedger, setNpcLedgerStatus);
            if (['save_failed', 'stale', 'busy', 'pending_save'].includes(result.status)) return;
            if (result.status === 'added') {
                if (textInput) textInput.value = '';
                refreshNpcLedgerPage(panel);
                openNpcProfileModal(panel, name, { tab: 'exp' });
            }
            return;
        }
        const npcExpRemove = event.target.closest?.('[data-npc-exp-remove]');
        if (npcExpRemove) {
            const name = npcExpRemove.dataset.npcExpFor;
            if (!agentModalCurrent(panel) || typeof window === 'undefined' || !window.confirm(`删除 ${name} 的这条经历？此操作不能撤销。`)) return;
            const result = await panelMutation(panel, { name, index: Number(npcExpRemove.dataset.npcExpRemove) }, operation => {
                const changed = agentNpcLedger.removeExp(operation.name, operation.index);
                if (changed.status === 'removed') changed.persistence = persistNpcLedger();
                return changed;
            }, persistNpcLedger, setNpcLedgerStatus);
            if (['save_failed', 'stale', 'busy', 'pending_save'].includes(result.status)) return;
            if (result.status === 'removed') {
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
                const result = await panelMutation(panel, { 姓名: record.name, 在场: next }, payload => applyNpcLedgerPayload({ 人物: [payload] }, { source: '手动' }), persistNpcLedger, setNpcLedgerStatus);
                if (['save_failed', 'stale', 'busy', 'pending_save'].includes(result.status)) return;
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
                const result = await panelMutation(panel, { 姓名: record.name, 重要度: next }, payload => applyNpcLedgerPayload({ 人物: [payload] }, { source: '手动' }), persistNpcLedger, setNpcLedgerStatus);
                if (['save_failed', 'stale', 'busy', 'pending_save'].includes(result.status)) return;
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
            if (!agentModalCurrent(panel) || typeof window === 'undefined' || !window.confirm(`删除 ${ledgerForget.dataset.npcLedgerForget} 的完整档案和经历？此操作不能撤销。`)) return;
            const result = await panelMutation(panel, { name: ledgerForget.dataset.npcLedgerForget }, operation => {
                const changed = agentNpcLedger.remove(operation.name);
                if (changed.status === 'removed') changed.persistence = persistNpcLedger();
                return changed;
            }, persistNpcLedger, setNpcLedgerStatus);
            if (['save_failed', 'stale', 'busy', 'pending_save'].includes(result.status)) return;
            if (result.status === 'removed') {
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
        if (event.target.closest?.('[data-facts-cat]') || event.target.closest?.('[data-facts-scope]')) { renderFactsBrowser(panel); return; }
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
        if (event.target.closest?.('[data-facts-search]')) { renderFactsBrowser(panel); return; }
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
        // API设置方案的各字段：同样不走 data-setting 通道，按 id 改数组条目并即时保存。
        const presetField = event.target.closest?.('[data-api-preset-field]');
        if (presetField) {
            const holder = presetField.closest('[data-api-preset-id]');
            if (holder) {
                const field = presetField.dataset.apiPresetField;
                const sequence = ++settingsSaveSequence;
                const result = updateApiPresetField(holder.dataset.apiPresetId, field, presetField.value);
                if (result.status === 'missing') {
                    const missingStatus = panel.querySelector('[data-api-preset-status]');
                    if (missingStatus) missingStatus.textContent = '这条方案已经不在了，已按存储重画列表，请重新填一次。';
                    renderApiPresets(panel);
                    renderApiPresetSelects(panel);
                    return;
                }
                if (field === 'name') {
                    const title = holder.querySelector('summary b');
                    if (title) title.textContent = presetField.value.trim() || '未命名方案';
                    renderApiPresetSelects(panel);
                }
                if (field === 'baseUrl') {
                    const summary = holder.querySelector('summary small');
                    if (summary) summary.textContent = presetField.value.trim() || '还没填接口地址';
                }
                const status = panel.querySelector('[data-api-preset-status]');
                const ok = await awaitPanelPersistence(result, message => { if (status && sequence === settingsSaveSequence) status.textContent = message; });
                if (ok && status && sequence === settingsSaveSequence) status.textContent = '方案已保存。';
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
        // 纳戒申报通道切换：同步启停世界书里的申报教学条目（失败不阻断，独立模式有正文块兜底）。
        if (input.dataset.setting === 'self.mvuChannel') void setSelfMvuChannel(value);
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
        trapAgentDialogFocus(panel, event);
        if (event.key !== 'Escape') return;
        // 弹窗里还有没存上的回执：Esc 先不关弹窗，防止丢掉重试上下文。
        const modal = panel.querySelector(':scope > [data-agent-modal]');
        if (modal && !modal.hidden && modal.__pendingSave) { event.stopPropagation(); return; }
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
    createSettingsPanel();
    mountOrbHud();
    bindScrollRelay();
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
    hostQuietIdleUnsubscribe?.();
    hostQuietIdleUnsubscribe = undefined;
    invalidateAgentContinuations();
    settleExtensionEnabled = false;
    resetSettleAdjudication();
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
    settleExtensionEnabled = true;
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
        onDisable();
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

/** 沙盒口径是否生效：正式模式记录优先（中途切换要确认，记录没换口径就没换），没有记录才按设置开关。 */
function persistSandboxMode() {
    const scope = currentAgentScope();
    const saved = hostStorage?.chatState?.();
    const value = saved?.status === 'ready' && saved.value && typeof saved.value === 'object' ? { ...saved.value } : {};
    return Promise.resolve(hostStorage?.saveChatState?.({ ...value, sandboxMode: agentSandboxMode.snapshot(scope) }) ?? { status: 'unavailable' })
        .catch(error => ({ status: 'failed', reason: String(error?.message ?? error) }));
}

function restoreSandboxFromChat() {
    const scope = currentAgentScope();
    const saved = hostStorage?.chatState?.();
    agentSandboxMode.restore(null, scope);
    return agentSandboxMode.restore(saved?.status === 'ready' ? saved.value?.sandboxMode : null, scope);
}

function sandboxModeActive() {
    const scope = currentAgentScope();
    let record = agentSandboxMode.read(scope);
    if (record.status !== 'ready') {
        const saved = hostStorage?.chatState?.();
        if (saved?.status === 'ready' && saved.value?.sandboxMode) {
            const restored = agentSandboxMode.restore(saved.value.sandboxMode, scope);
            if (restored.status === 'rejected') return false;
            record = agentSandboxMode.read(scope);
        }
    }
    if (record.status !== 'ready') {
        const settings = currentSettings();
        record = agentSandboxMode.sync({ ...scope, enabled: settings.enableSandboxMode === true,
            inertia: settings.sandbox?.inertia, canonCharactersAutonomous: settings.sandbox?.canonCharactersAutonomous });
        if (record.status === 'adopted') void persistSandboxMode();
    }
    return record.mode === 'sandbox';
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
    if (result.applied.length) result.persistence = persistWorld();
    refreshWorldPage();
    return result;
}

/** 面板上的手动世界操作与模型指令走同一个台账：先记账、再保存、再刷新页面。 */
async function worldApplyFromPanel(panel, operations) {
    const report = message => {
        const note = panel?.querySelector('[data-world-journal]');
        if (note) note.textContent = message;
    };
    const result = await panelMutation(panel, operations, applyWorldOps, persistWorld, report);
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

async function worldAddFromPanel(panel) {
    const scopeInput = panel.querySelector('[data-world-add-scope]');
    const weightInput = panel.querySelector('[data-world-add-weight]');
    const titleInput = panel.querySelector('[data-world-add-title]');
    const textInput = panel.querySelector('[data-world-add-text]');
    const basisInput = panel.querySelector('[data-world-add-basis]');
    const daysInput = panel.querySelector('[data-world-add-days]');
    const locationInput = panel.querySelector('[data-world-add-location]');
    const body = typeof textInput?.value === 'string' ? textInput.value.trim() : '';
    if (!body) {
        if (textInput) textInput.placeholder = '先写一句事件内容再登记';
        return { status: 'noop' };
    }
    const title = typeof titleInput?.value === 'string' ? titleInput.value.trim() : '';
    if (!title) {
        if (titleInput) titleInput.placeholder = '先起一个短标题再登记';
        return { status: 'noop' };
    }
    const basis = typeof basisInput?.value === 'string' ? basisInput.value.trim() : '';
    const rawDays = String(daysInput?.value ?? '').trim();
    const days = rawDays === '' ? undefined : Number(rawDays);
    daysInput?.setCustomValidity?.('');
    if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > 90)) {
        daysInput?.setCustomValidity?.('时限须为 1–90 的整数，或留空不限期。');
        daysInput?.reportValidity?.();
        daysInput?.focus?.();
        return { status: 'rejected', reason: 'invalid_days' };
    }
    const location = typeof locationInput?.value === 'string' ? locationInput.value.trim() : '';
    const result = await worldApplyFromPanel(panel, [{ op: 'addEvent', scope: scopeInput?.value ?? 'near', title, text: body, basis, location, days, weight: weightInput?.value === 'major' ? 'major' : weightInput?.value === 'rumor' ? 'rumor' : 'minor' }]);
    if (!result.applied?.length || result.rejected?.length) return result;
    for (const input of [titleInput, textInput, basisInput, locationInput, daysInput]) if (input) input.value = '';
    if (result?.status !== 'rejected') closeAgentModal(panel);
    return result;
}

/** 手动接任务：标题必填，详情/来源/时限可选；与模型指令同一套校验。 */
async function worldAddTaskFromPanel(panel) {
    const titleInput = panel.querySelector('[data-world-task-title]');
    const detailInput = panel.querySelector('[data-world-task-detail]');
    const basisInput = panel.querySelector('[data-world-task-basis]');
    const daysInput = panel.querySelector('[data-world-task-days]');
    const title = typeof titleInput?.value === 'string' ? titleInput.value.trim() : '';
    if (!title) {
        if (titleInput) titleInput.placeholder = '先写一句任务名再接下';
        return { status: 'noop' };
    }
    const rawDays = String(daysInput?.value ?? '').trim();
    const days = rawDays === '' ? undefined : Number(rawDays);
    daysInput?.setCustomValidity?.('');
    if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > 90)) {
        daysInput?.setCustomValidity?.('时限须为 1–90 的整数，或留空不限期。');
        daysInput?.reportValidity?.();
        daysInput?.focus?.();
        return { status: 'rejected', reason: 'invalid_days' };
    }
    const result = await worldApplyFromPanel(panel, [{ op: 'addTask', title, detail: typeof detailInput?.value === 'string' ? detailInput.value.trim() : '', basis: typeof basisInput?.value === 'string' ? basisInput.value.trim() : '', days }]);
    if (!result.applied?.length || result.rejected?.length) return result;
    for (const input of [titleInput, detailInput, basisInput, daysInput]) if (input) input.value = '';
    if (result?.status !== 'rejected') closeAgentModal(panel);
    return result;
}
// ── 记忆存储（memory/）：总览、两层清单、手动登记、决定卡；与纳戒页同一套交互惯例 ──

async function memoryApplyFromPanel(panel, operations) {
    const report = message => {
        const note = panel?.querySelector('[data-memory-journal]');
        if (note) note.textContent = message;
    };
    const result = await panelMutation(panel, operations, applyMemoryOps, persistMemory, report);
    const note = panel?.querySelector('[data-memory-journal]');
    if (note && result.rejected.length) {
        const warn = makeElement('p', 'dai-turn-result');
        warn.textContent = `有 ${result.rejected.length} 条操作被拒绝：${result.rejected.map(item => `${item.op}(${item.reason})`).join('、')}`;
        note.prepend(warn);
    }
    return result;
}

async function memoryAddFromPanel(panel) {
    const titleInput = panel.querySelector('[data-memory-new-title]');
    const title = typeof titleInput?.value === 'string' ? titleInput.value.trim() : '';
    if (!title) {
        if (titleInput) titleInput.placeholder = '先起一个短标题再登记';
        return { status: 'noop' };
    }
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
    const result = await memoryApplyFromPanel(panel, [{
        op: tier === 'big' ? 'memorize' : 'remember',
        title,
        text: body,
        quote: typeof panel.querySelector('[data-memory-new-quote]')?.value === 'string' ? panel.querySelector('[data-memory-new-quote]').value.trim() : '',
        note: typeof panel.querySelector('[data-memory-new-note]')?.value === 'string' ? panel.querySelector('[data-memory-new-note]').value.trim() : '',
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
    if (!result.applied?.length || result.rejected.length) return result;
    for (const selector of ['[data-memory-new-title]', '[data-memory-new-text]', '[data-memory-new-basis]', '[data-memory-new-related]', '[data-memory-new-aliases]', '[data-memory-new-quote]', '[data-memory-new-note]']) {
        const input = panel.querySelector(selector);
        if (input) input.value = '';
    }
    if (!result.rejected.length) closeAgentModal(panel);
    return result;
}

const MEMORY_PAGE_SIZE = Object.freeze({ big: 6, small: 8 });
const memoryPages = { big: 0, small: 0 };

/** recent=true：主界面“最新几条”模式——固定第一页、不接分页器，也不动总库的页码状态。 */
function renderMemoryEntryList(container, entries, { conflicts = null, tier = 'small', pager = null, recent = false } = {}) {
    if (!container) return;
    const list = Array.isArray(entries) ? entries : [];
    if (pager) pager.replaceChildren();
    if (!list.length) {
        container.replaceChildren(makeElement('p', 'dai-turn-result', '这一层还没有记忆。'));
        return;
    }
    const pageSize = MEMORY_PAGE_SIZE[tier] ?? 8;
    const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
    const page = recent ? 0 : Math.min(Math.max(0, memoryPages[tier] ?? 0), pageCount - 1);
    if (!recent) memoryPages[tier] = page;
    const rows = list.slice(page * pageSize, page * pageSize + pageSize).map(entry => {
        const row = makeElement('div', 'dai-world-event dai-memory-card');
        row.dataset.weight = entry.weight === 'major' ? 'major' : 'minor';
        const tierLabel = agentMemoryRuntime.tierLabels[entry.tier] ?? entry.tier;
        const tagLabel = entry.tag ? ` [${agentMemoryRuntime.tagLabels[entry.tag] ?? entry.tag}]` : '';
        const clash = conflicts?.get(entry.id);
        const head = makeElement('div', 'dai-world-event-head');
        // 行内只放短标题（老数据没有 title 才回退截断正文），全文进详情弹窗。
        const title = makeElement('b', '', `${clash ? '⚠ ' : ''}${entry.weight === 'major' ? '★' : '·'} ${entry.title ? introText(entry.title, 18) : introText(entry.text, 26)}`);
        head.append(title);
        row.append(head);
        const meta = [tierLabel + tagLabel, `第 ${entry.day} 天`, `#${entry.id}`];
        row.append(makeElement('small', 'dai-world-event-basis', meta.join(' · ')));
        if (typeof entry.quote === 'string' && entry.quote.trim()) {
            row.append(makeElement('small', 'dai-world-event-basis', `「${entry.quote.trim()}」`));
        }
        // 别名/关联/依据/备注收进详情弹窗，行内只留一句简介。
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
        wireRowDetail(row, panel => {
            openReadonlyDetailModal(panel, capDetailTitle(entry.text), [
                { rows: [['内容', typeof entry.text === 'string' ? entry.text.trim() : ''], ['层级', `${tierLabel}${entry.tag ? ` · ${agentMemoryRuntime.tagLabels[entry.tag] ?? entry.tag}` : ''}`], ['登记', `第 ${entry.day} 天`], ['原文', typeof entry.quote === 'string' ? entry.quote.trim() : '']] },
                { title: '关联与出处', rows: [['别名', Array.isArray(entry.aliases) ? entry.aliases.join('、') : ''], ['关联', Array.isArray(entry.related) ? entry.related.join('、') : ''], ['依据', typeof entry.basis === 'string' ? entry.basis.trim() : ''], ['备注', typeof entry.note === 'string' ? entry.note.trim() : '']] },
            ]);
        });
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

/** 「记忆注入」卡：最近一轮实际进入提示词的记忆清单（只读，点行看详情，仿原著资料的注入记录）。 */
function renderMemoryInjectionCard(section) {
    const statusEl = section?.querySelector('[data-memory-injection-status]');
    const listEl = section?.querySelector('[data-memory-injection-list]');
    if (!statusEl || !listEl) return;
    const record = memoryLastInjectionView();
    if (!record) {
        statusEl.textContent = '还没有注入记录：下一轮生成时由召回决定（或关键词兜底）挑选。';
        listEl.replaceChildren();
        return;
    }
    const time = Number.isFinite(record.at) ? new Date(record.at).toLocaleTimeString('zh-CN', { hour12: false }) : '';
    const source = MEMORY_INJECTION_SOURCE_LABELS[record.source] ?? '—';
    const suffix = record.status === 'injected' ? (record.cleared ? '（已随生成结束清理）' : '（仍在提示词里）') : '';
    statusEl.textContent = record.status === 'injected'
        ? `${source} · ${record.ids?.length ?? 0} 条 · ${record.chars ?? 0} 字${time ? ` · ${time}` : ''}${suffix}`
        : `${source} · 本轮没有注入记忆${time ? ` · ${time}` : ''}${suffix}`;
    const entries = Array.isArray(record.entries) ? record.entries : [];
    if (!entries.length) {
        listEl.replaceChildren(makeElement('p', 'dai-turn-result', '本轮没有记忆进入正文提示词。'));
        return;
    }
    const rows = entries.map(entry => {
        const row = makeElement('div', 'dai-world-event dai-memory-card');
        row.dataset.weight = entry.weight === 'major' ? 'major' : 'minor';
        const tierLabel = agentMemoryRuntime.tierLabels[entry.tier] ?? entry.tier;
        const tagLabel = entry.tag ? ` [${agentMemoryRuntime.tagLabels[entry.tag] ?? entry.tag}]` : '';
        const head = makeElement('div', 'dai-world-event-head');
        head.append(makeElement('b', '', `${entry.weight === 'major' ? '★' : '·'} ${entry.title ? introText(entry.title, 18) : introText(entry.text, 26)}`));
        row.append(head);
        row.append(makeElement('small', 'dai-world-event-basis', [tierLabel + tagLabel, `第 ${entry.day} 天`, `#${entry.id}`, '本轮已注入'].join(' · ')));
        if (typeof entry.quote === 'string' && entry.quote.trim()) {
            row.append(makeElement('small', 'dai-world-event-basis', `「${entry.quote.trim()}」`));
        }
        wireRowDetail(row, target => {
            openReadonlyDetailModal(target, capDetailTitle(entry.text), [
                { rows: [['内容', typeof entry.text === 'string' ? entry.text.trim() : ''], ['层级', `${tierLabel}${entry.tag ? ` · ${agentMemoryRuntime.tagLabels[entry.tag] ?? entry.tag}` : ''}`], ['登记', `第 ${entry.day} 天`], ['原文', typeof entry.quote === 'string' ? entry.quote.trim() : '']] },
                { title: '关联与出处', rows: [['别名', Array.isArray(entry.aliases) ? entry.aliases.join('、') : ''], ['关联', Array.isArray(entry.related) ? entry.related.join('、') : ''], ['依据', typeof entry.basis === 'string' ? entry.basis.trim() : ''], ['备注', typeof entry.note === 'string' ? entry.note.trim() : '']] },
            ]);
        });
        return row;
    });
    listEl.replaceChildren(...rows);
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
    renderMemoryInjectionCard(section);
    // 排序与按人过滤都是页面本地状态（不进设置）：时间 = 新的在前；分量 = 关键的在前；标签 = 按标签分组。
    const sortSelect = section.querySelector('[data-memory-sort]');
    if (sortSelect && !sortSelect.onchange) {
        sortSelect.onchange = () => { memoryPages.big = 0; memoryPages.small = 0; refreshMemoryPage(); };
    }
    const sortMode = sortSelect?.value === 'weight' ? 'weight' : (sortSelect?.value === 'tag' ? 'tag' : 'time');
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
        const all = document.createElement('option');
        all.value = '';
        all.textContent = '全部';
        const options = [all];
        for (const [key, count] of [...wanted.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'))) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `${key}（${count}）`;
            options.push(option);
        }
        personSelect.replaceChildren(...options);
        if (current && wanted.has(current)) personSelect.value = current;
    }
    const person = typeof personSelect?.value === 'string' ? personSelect.value : '';
    const matchPerson = entry => !person || recallKeys(entry).includes(person);
    const sortEntries = list => {
        const copy = [...list];
        if (sortMode === 'weight') {
            copy.sort((a, b) => (b.weight === 'major') - (a.weight === 'major') || b.day - a.day);
        } else if (sortMode === 'tag') {
            // 标签分类：恩怨/情报/伏笔/大事记按固定序分组，没标标签的垫底，组内新的在前。
            const order = Object.keys(agentMemoryRuntime.tagLabels);
            const rank = tag => { const index = order.indexOf(tag); return index === -1 ? order.length : index; };
            copy.sort((a, b) => rank(a.tag) - rank(b.tag) || b.day - a.day);
        } else {
            copy.sort((a, b) => b.day - a.day || b.id.localeCompare(a.id, 'zh', { numeric: true }));
        }
        return copy;
    };
    const all = snapshot.entries.filter(matchPerson);
    const conflicts = new Map();
    const pairs = findMemoryConflicts(snapshot.entries);
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
    // 主界面只铺最新的几条（跟随总库当前的排序/按人过滤），更多进「记忆总库」弹窗。
    renderMemoryEntryList(
        section.querySelector('[data-memory-recent-big]'),
        sortEntries(all.filter(entry => entry.tier === 'big')),
        { conflicts, tier: 'big', recent: true },
    );
    renderMemoryEntryList(
        section.querySelector('[data-memory-recent-small]'),
        sortEntries(all.filter(entry => entry.tier === 'small')),
        { conflicts, tier: 'small', recent: true },
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

/** 只读详情弹窗：与人物信息面板同一套“标签 + 值”分块观感；空值的行直接不渲染。 */
function openReadonlyDetailModal(panel, title, sections, { wide = false } = {}) {
    const page = makeElement('div', 'dai-npc-read');
    for (const section of Array.isArray(sections) ? sections : []) {
        const rows = (section?.rows ?? []).filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '');
        if (!rows.length) continue;
        const block = makeElement('section', 'dai-profile-group');
        if (section.title) block.append(makeElement('b', 'dai-profile-group-title', section.title));
        for (const [label, value] of rows) {
            const row = makeElement('div', 'dai-profile-row');
            row.append(makeElement('span', 'dai-profile-label', label), makeElement('span', 'dai-profile-value', String(value)));
            block.append(row);
        }
        page.append(block);
    }
    openAgentModal(panel, title, page, { wide });
}

/** 弹窗标题截断：事件/记忆正文可能很长，标题行只留前 30 字。 */
function capDetailTitle(text) {
    const value = String(text ?? '').trim();
    return value.length > 30 ? `${value.slice(0, 30)}…` : value;
}

/** 行内简介：没有短标题的长内容在行里截断展示，全文只进详情弹窗。 */
function introText(value, cap = 24) {
    const body = String(value ?? '').trim();
    return body.length > cap ? `${body.slice(0, cap)}…` : body;
}

/** 行级点击 → 详情弹窗：行内操作按钮/表单照常工作，点它们不弹窗。 */
function wireRowDetail(row, build, { ignore = 'button' } = {}) {
    row.classList.add('is-clickable');
    row.addEventListener('click', clickEvent => {
        if (clickEvent.target.closest(ignore)) return;
        const panel = typeof document === 'undefined' ? null : document.getElementById(SETTINGS_PANEL_ID);
        if (!panel) return;
        build(panel);
    });
}

function renderWorldEventList(container, events, { emptyNote, scope = 'near' } = {}) {
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
        // 行里放短标题（旧数据没 title 才回退正文截断）；正文只留一句简介，全文点开弹窗看。
        const title = typeof event.title === 'string' && event.title.trim() ? event.title.trim() : '';
        head.append(makeElement('b', '', `${event.weight === 'major' ? '★' : '·'} ${title || introText(event.text, 24)}`));
        const due = event.endDay !== null && event.endDay !== undefined ? ` · 剩 ${Math.max(1, event.endDay - today + 1)} 天` : '';
        const where = typeof event.location === 'string' && event.location.trim() ? ` · ${event.location.trim()}` : '';
        head.append(makeElement('small', '', `第 ${event.day} 天 · ${event.id}${where}${due}`));
        row.append(head);
        // 正文里标题没覆盖的那部分当简介；标题就是正文第一句时只提示后半句，不重复。
        const intro = eventIntro(title, event.text);
        if (intro) row.append(makeElement('small', 'dai-world-event-intro', intro.length > 48 ? `${intro.slice(0, 48)}…` : intro));
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
        wireRowDetail(row, panel => {
            const due = event.endDay !== null && event.endDay !== undefined ? `剩 ${Math.max(1, event.endDay - today + 1)} 天` : '不限时';
            openReadonlyDetailModal(panel, capDetailTitle(title || event.text), [
                { rows: [['标题', title], ['范围', scope === 'world' ? '大陆层面（世界大事）' : '主角身边（附近事件）'], ['内容', typeof event.text === 'string' ? event.text.trim() : ''], ['级别', event.weight === 'major' ? '重大 ★（置顶不参与上限清理）' : event.weight === 'rumor' ? '传闻（未证实）' : '普通'], ['登记', `第 ${event.day} 天`], ['地点', typeof event.location === 'string' ? event.location.trim() : ''], ['期限', due], ['编号', event.id]] },
                { title: '依据', rows: [['依据', typeof event.basis === 'string' ? event.basis.trim() : '']] },
            ]);
        });
        return row;
    });
    container.replaceChildren(...rows);
}

/** 势力登记：同名更新（档案字段留空保持原值），否则新建。 */
async function worldSetFactionFromPanel(panel) {
    const nameInput = panel.querySelector('[data-world-faction-name]');
    const stanceInput = panel.querySelector('[data-world-faction-stance]');
    const name = typeof nameInput?.value === 'string' ? nameInput.value.trim() : '';
    if (!name) {
        if (nameInput) nameInput.placeholder = '先写势力名再登记';
        return { status: 'noop' };
    }
    const value = key => {
        const input = panel.querySelector(`[data-world-faction-${key}]`);
        return typeof input?.value === 'string' ? input.value.trim() : '';
    };
    // 留空的档案字段不进 op：运行时对"提供且非空"才更新，这样手动补档案不会冲掉旧值。
    const op = { op: 'setFaction', name, stance: stanceInput?.value ?? 'neutral', basis: value('basis') };
    for (const key of ['type', 'level', 'leader', 'elders', 'members', 'location', 'assets', 'relations', 'dynamics']) {
        if (value(key)) op[key] = value(key);
    }
    const result = await worldApplyFromPanel(panel, [op]);
    if (!result.applied?.length || result.rejected?.length) return result;
    for (const input of panel.querySelectorAll('[data-world-faction-name], [data-world-faction-type], [data-world-faction-level], [data-world-faction-leader], [data-world-faction-elders], [data-world-faction-members], [data-world-faction-location], [data-world-faction-assets], [data-world-faction-relations], [data-world-faction-dynamics], [data-world-faction-basis]')) {
        input.value = '';
    }
    if (result?.status !== 'rejected') closeAgentModal(panel);
    return result;
}

/** 人物态度登记：同名更新态度，否则新建。 */
async function worldSetPersonFromPanel(panel) {
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
    const result = await worldApplyFromPanel(panel, [{ op: 'setPerson', name, attitude, basis: typeof basisInput?.value === 'string' ? basisInput.value.trim() : '' }]);
    if (!result.applied?.length || result.rejected?.length) return result;
    for (const input of [nameInput, attitudeInput, basisInput]) if (input) input.value = '';
    if (result?.status !== 'rejected') closeAgentModal(panel);
    return result;
}

/** 势力列表：敌对在前、同盟次之、其余按更新时间；行内是档案摘要，点行看全档案，编辑预填弹窗。 */
function renderWorldFactionList(container, factions) {
    if (!container) return;
    const list = Array.isArray(factions) ? factions : [];
    if (!list.length) {
        container.replaceChildren(makeElement('p', 'dai-turn-result', '还没有登记势力。剧情里与谁结怨、谁示好，模型会在这里记一笔，也可以自己登记。'));
        return;
    }
    const stanceRank = { hostile: 0, wary: 1, allied: 2, friendly: 3, neutral: 4 };
    const labels = { hostile: '敌对', wary: '警惕', neutral: '中立', friendly: '友好', allied: '同盟' };
    const trimmed = value => (typeof value === 'string' ? value.trim() : '');
    const rows = [...list].sort((a, b) => (stanceRank[a.stance] ?? 2) - (stanceRank[b.stance] ?? 2) || (b.updatedDay ?? 0) - (a.updatedDay ?? 0)).map(faction => {
        const row = makeElement('div', 'dai-world-faction');
        row.dataset.stance = faction.stance ?? 'neutral';
        const head = makeElement('div', 'dai-world-event-head');
        head.append(makeElement('b', '', faction.name));
        if (trimmed(faction.type)) head.append(makeElement('small', '', trimmed(faction.type)));
        head.append(makeElement('span', 'dai-world-stance', labels[faction.stance] ?? '中立'));
        row.append(head);
        const profile = [
            trimmed(faction.leader) ? `首领：${trimmed(faction.leader)}` : '',
            trimmed(faction.location),
            trimmed(faction.level),
        ].filter(Boolean).join(' · ');
        if (profile) row.append(makeElement('p', 'dai-world-task-detail', introText(profile, 40)));
        if (trimmed(faction.dynamics)) row.append(makeElement('p', 'dai-world-task-detail', introText(faction.dynamics, 30)));
        const notes = [];
        if (trimmed(faction.basis)) notes.push(`依据：${trimmed(faction.basis)}`);
        if (faction.updatedDay) notes.push(`更新于第 ${faction.updatedDay} 天`);
        if (notes.length) row.append(makeElement('small', 'dai-world-event-basis', notes.join(' · ')));
        const actions = makeElement('div', 'dai-world-event-actions');
        const edit = makeElement('button', 'dai-secondary-button', '编辑');
        edit.type = 'button';
        edit.addEventListener('click', () => {
            // 这个闭包不在任何带 panel 的作用域里，按 id 现取面板（取不到就放弃，不报错打断列表渲染）。
            const host = document.getElementById(SETTINGS_PANEL_ID);
            if (!host) return;
            fillWorldFactionDock(host, faction);
            openAgentModal(host, '登记势力', host.querySelector('[data-modal-dock="world-faction"]'), { wide: true });
        });
        const del = makeElement('button', 'dai-secondary-button', '删除');
        del.type = 'button';
        del.dataset.worldFactionDelete = faction.name;
        actions.append(edit, del);
        row.append(actions);
        wireRowDetail(row, panel => {
            openReadonlyDetailModal(panel, capDetailTitle(faction.name), [
                { rows: [['类型', trimmed(faction.type)], ['实力档次', trimmed(faction.level)], ['态度', labels[faction.stance] ?? '中立'], ['首领', trimmed(faction.leader)], ['驻地', trimmed(faction.location)], ['更新', faction.updatedDay ? `第 ${faction.updatedDay} 天` : '']] },
                { title: '成员与高层', rows: [['高层阵容', trimmed(faction.elders)], ['成员构成', trimmed(faction.members)]] },
                { title: '底蕴与关系', rows: [['底蕴产业', trimmed(faction.assets)], ['势力关系', trimmed(faction.relations)]] },
                { title: '动向与依据', rows: [['动向', trimmed(faction.dynamics)], ['依据', trimmed(faction.basis)]] },
            ]);
        });
        return row;
    });
    container.replaceChildren(...rows);
}

/** 编辑势力：把现有档案预填进登记弹窗；留空的字段提交时保持原值（见 worldSetFactionFromPanel）。 */
function fillWorldFactionDock(panel, faction) {
    const set = (key, value) => {
        const input = panel.querySelector(`[data-world-faction-${key}]`);
        if (input) input.value = typeof value === 'string' ? value.trim() : '';
    };
    set('name', faction.name);
    set('type', faction.type);
    set('level', faction.level);
    set('leader', faction.leader);
    set('elders', faction.elders);
    set('members', faction.members);
    set('location', faction.location);
    set('assets', faction.assets);
    set('relations', faction.relations);
    set('dynamics', faction.dynamics);
    set('basis', faction.basis);
    const stance = panel.querySelector('[data-world-faction-stance]');
    if (stance) stance.value = faction.stance ?? 'neutral';
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
        row.append(makeElement('p', 'dai-world-task-detail', introText(person.attitude, 30) || '态度未明'));
        if (typeof person.basis === 'string' && person.basis.trim()) row.append(makeElement('small', 'dai-world-event-basis', `依据：${person.basis.trim()}`));
        const actions = makeElement('div', 'dai-world-event-actions');
        const del = makeElement('button', 'dai-secondary-button', '删除');
        del.type = 'button';
        del.dataset.worldPersonDelete = person.name;
        actions.append(del);
        row.append(actions);
        wireRowDetail(row, panel => {
            openReadonlyDetailModal(panel, person.name, [
                { rows: [['态度', person.attitude || '态度未明'], ['更新', person.updatedDay ? `第 ${person.updatedDay} 天` : '']] },
                { title: '依据', rows: [['依据', typeof person.basis === 'string' ? person.basis.trim() : '']] },
            ]);
        });
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
        head.append(makeElement('b', '', `${task.status === 'done' ? '✔' : '◆'} ${introText(task.title, 30)}`));
        head.append(makeElement('small', '', `第 ${task.day} 天接 · ${task.id}`));
        row.append(head);
        // 详情只在弹窗里展开，行内保持一行简介。
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
        wireRowDetail(row, panel => {
            const statusText = task.status === 'done'
                ? `已完成${task.doneDay ? `于第 ${task.doneDay} 天` : ''}`
                : (task.endDay !== null && task.endDay !== undefined ? (task.endDay < today ? `已逾期（限第 ${task.endDay} 天前）` : `进行中 · 剩 ${task.endDay - today + 1} 天`) : '进行中 · 不限时');
            openReadonlyDetailModal(panel, capDetailTitle(task.title), [
                { rows: [['任务', typeof task.title === 'string' ? task.title.trim() : ''], ['状态', statusText], ['接取', `第 ${task.day} 天`], ['期限', task.endDay !== null && task.endDay !== undefined ? `第 ${task.endDay} 天` : '不限时'], ['编号', task.id]] },
                { title: '详情与来源', rows: [['详情', typeof task.detail === 'string' ? task.detail.trim() : ''], ['来源', typeof task.basis === 'string' ? task.basis.trim() : '']] },
            ]);
        });
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
    renderWorldEventList(section.querySelector('[data-world-events-world]'), snapshot.worldEvents, { emptyNote: '暂无进行中的世界大事。', scope: 'world' });
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
    title_too_long: '标题超过 20 字，删短一点。',
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
async function saveImpactForm(panel) {
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
    const result = await panelMutation(panel, ops, operations => {
        const changed = agentImpactRuntime.apply(operations, { source: 'manual', day: worldDay() });
        if (changed.status === 'applied') changed.persistence = persistImpact();
        return changed;
    }, persistImpact, message => { if (status) status.textContent = message; });
    if (['save_failed', 'stale', 'busy', 'pending_save'].includes(result.status)) return result;
    if (result.status !== 'applied') {
        const reason = result.rejected?.[0]?.reason ?? 'unknown_op';
        if (status) status.textContent = IMPACT_REASON_TEXT[reason] ?? `保存被拒绝（${reason}）。`;
        return { status: 'rejected', reason };
    }
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
    for (const key of ['weight', 'kind', 'search']) {
        const control = panel?.querySelector?.(`[data-impact-${key}]`);
        if (control && saved && (key === 'search' || (control.value && control.value !== saved[key]))) control.value = '';
    }
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
async function runImpactOp(panel, op, successText) {
    const result = await panelMutation(panel, [op], operations => {
        const changed = agentImpactRuntime.apply(operations, { source: 'manual', day: worldDay() });
        if (changed.status === 'applied') changed.persistence = persistImpact();
        return changed;
    }, persistImpact, setImpactStatus);
    if (['save_failed', 'stale', 'busy', 'pending_save'].includes(result.status)) return result;
    if (result.status !== 'applied') {
        const reason = result.rejected?.[0]?.reason ?? 'unknown_op';
        setImpactStatus(IMPACT_REASON_TEXT[reason] ?? `操作被拒绝（${reason}）。`);
        return { status: 'rejected', reason };
    }
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
        wireRowDetail(item, panel => {
            openReadonlyDetailModal(panel, capDetailTitle(record.title), [
                { rows: [
                    ['内容', typeof record.detail === 'string' ? record.detail.trim() : ''],
                    ['状态', `已归档 · ${reason}`],
                    ['级别', WEIGHT_LABEL[record.weight] ?? '小事'],
                    ['记账', Number.isInteger(record.day) ? `第 ${record.day} 天` : ''],
                    ['对象', typeof record.target === 'string' ? record.target.trim() : ''],
                ] },
            ]);
        });
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
    top.append(makeElement('b', 'dai-impact-title', introText(record.title, 30)));
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

    // 行内只留一句截断简介，完整内容与全部元数据点开弹窗看。
    if (record.detail) item.append(makeElement('p', 'dai-impact-detail', introText(record.detail, 40)));
    wireRowDetail(item, panel => {
        openReadonlyDetailModal(panel, capDetailTitle(record.title), [
            { rows: [
                ['内容', typeof record.detail === 'string' ? record.detail.trim() : ''],
                ['级别', WEIGHT_LABEL[record.weight] ?? '小事'],
                ['状态', STATE_LABEL[record.state] ?? '未了结'],
                ['记账', Number.isInteger(record.day) ? `第 ${record.day} 天` : ''],
                ['依据楼层', Number.isInteger(record.floor) ? `第 ${record.floor} 楼` : ''],
                ['对象', typeof record.target === 'string' ? record.target.trim() : ''],
                ['原著处理', record.canon ? (SHIFT_LABEL[record.shift] ?? '改写') : ''],
                ['台账事件', record.eventId ? `#${record.eventId}` : ''],
                ['承接', record.parent ? `#${record.parent}` : ''],
                ['引出', children?.length ? children.map(id => `#${id}`).join('、') : ''],
                ['结果', typeof record.resolution === 'string' ? record.resolution.trim() : ''],
                ['备注', record.certainty === 'rumor' ? '传闻（未证实）' : ''],
            ] },
        ]);
    }, { ignore: 'button, input, textarea, select, .dai-impact-form' });
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

    // 选条这一路用哪套方案：绑定读方案名（模型设置页已无手填字段），没绑＝跟随酒馆主连接。
    const factsBinding = String(fieldValue(settings, 'setting.apiPreset') ?? '');
    const factsPreset = factsBinding ? (settings.api?.presets ?? []).find(item => item?.id === factsBinding) : null;
    push('模型', factsPreset
        ? `方案「${factsPreset.name || '未命名方案'}」· ${factsPreset.baseUrl || '未填地址'} · ${factsPreset.model || '未填模型'}`
        : '跟随酒馆主连接（未绑方案）');

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

/** 检索库浏览一次最多铺多少行；再多的让玩家加关键词或选类别收窄。 */
const FACTS_BROWSER_CAP = 80;

/**
 * 原著资料 · 检索库条目浏览：纯本地过滤，零模型调用。
 * 关键词对 标题/别名/摘要/正文 做包含匹配，类别与卷范围（当前卷/全书）收窄；
 * 点行弹只读详情（编号/类别/卷号/标题/别名/字数 + 全文）。人物簿模式的同款交互。
 */
function renderFactsBrowser(panel) {
    const box = panel?.querySelector('[data-facts-browser]');
    const status = panel?.querySelector('[data-facts-browser-status]');
    if (!box) return;
    const stats = agentFactsIndex.stats();
    if (!stats.total) {
        box.replaceChildren(makeElement('p', 'dai-turn-result', '索引为空：先在上方“从世界书导入”。'));
        if (status) status.textContent = '索引为空。';
        return;
    }
    // 类别下拉照索引实况重建；保留当前选择，别打断正在输入的关键词。
    const catSelect = panel.querySelector('[data-facts-cat]');
    if (catSelect) {
        const previous = catSelect.value;
        const categories = Object.entries(stats.categories ?? {}).sort(([, a], [, b]) => b - a);
        const options = [document.createElement('option')];
        options[0].value = '';
        options[0].textContent = `全部类别（${stats.total}）`;
        for (const [name, count] of categories) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = `${name}（${count}）`;
            options.push(option);
        }
        catSelect.replaceChildren(...options);
        if ([...catSelect.options].some(option => option.value === previous)) catSelect.value = previous;
    }
    const query = text(panel.querySelector('[data-facts-search]')?.value).trim().toLowerCase();
    const category = catSelect?.value ?? '';
    const scope = panel.querySelector('[data-facts-scope]')?.value ?? 'volume';
    const volume = scope === 'volume' ? currentVolumeForWorld() : null;
    let pool = [];
    for (const name of Object.keys(stats.categories ?? {})) {
        if (category && name !== category) continue;
        pool.push(...agentFactsIndex.entriesOfCategory(name));
    }
    if (volume !== null) pool = pool.filter(entry => Array.isArray(entry.volumes) && entry.volumes.includes(volume));
    if (query) {
        pool = pool.filter(entry => entry.name.toLowerCase().includes(query)
            || (Array.isArray(entry.aliases) && entry.aliases.some(alias => String(alias).toLowerCase().includes(query)))
            || String(entry.summary ?? '').toLowerCase().includes(query)
            || String(entry.content ?? '').toLowerCase().includes(query));
    }
    pool.sort((a, b) => a.uid - b.uid);
    const scopeLabel = volume !== null ? `当前卷 ${volume}` : '全书';
    if (status) status.textContent = `命中 ${pool.length} 条（${scopeLabel}${query ? ` · 关键词「${query}」` : ''}）${pool.length > FACTS_BROWSER_CAP ? `，只显示前 ${FACTS_BROWSER_CAP} 条，加关键词或选类别收窄` : ''}。`;
    if (!pool.length) {
        box.replaceChildren(makeElement('p', 'dai-turn-result', '没有命中的条目：换个关键词，或把范围切到“全书”。'));
        return;
    }
    const rows = pool.slice(0, FACTS_BROWSER_CAP).map(entry => {
        const row = makeElement('div', 'dai-world-event');
        const head = makeElement('div', 'dai-world-event-head');
        head.append(makeElement('b', '', entry.name));
        const volumeText = Array.isArray(entry.volumes) && entry.volumes.length ? ` · 卷${entry.volumes.map(item => String(item).padStart(2, '0')).join('、')}` : '';
        head.append(makeElement('small', '', `#${entry.uid} · ${entry.category}${volumeText}`));
        row.append(head);
        if (entry.summary) row.append(makeElement('small', 'dai-world-event-basis', entry.summary));
        wireRowDetail(row, detailPanel => {
            openReadonlyDetailModal(detailPanel, `${entry.category} · ${capDetailTitle(entry.name)}`, [
                { rows: [['编号', `#${entry.uid}`], ['类别', entry.category], ['卷号', Array.isArray(entry.volumes) && entry.volumes.length ? entry.volumes.map(item => `卷${item}`).join('、') : '未标卷'], ['标题', entry.name], ['别名', Array.isArray(entry.aliases) ? entry.aliases.join('、') : ''], ['字数', String(entry.chars ?? '')]] },
                { title: '正文', rows: [['全文', String(entry.content ?? '').trim()]] },
            ]);
        });
        return row;
    });
    box.replaceChildren(...rows);
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

let worldbookLoadSequence = 0;

async function syncWorldbookIndex() {
    const name = typeof currentSettings().setting?.worldbook === 'string' ? currentSettings().setting.worldbook.trim() : '';
    const sequence = ++worldbookLoadSequence;
    const current = () => sequence === worldbookLoadSequence && name === String(currentSettings().setting?.worldbook ?? '').trim();
    agentSettingSupply.clear();
    agentFactsIndex.load({ entries: [] });
    lastWorldbookNative = 0;
    if (!name) return { status: 'unset' };
    try {
        const result = await loadWorldbookEntries(getHostContext(), name);
        if (!current()) return { status: 'stale' };
        if (result.status !== 'ok') return result;
        const split = splitPluginEntries(result);
        agentSettingSupply.clear();
        agentSettingSupply.register(split.data);
        agentFactsIndex.load({ entries: split.rawData });
        lastWorldbookNative = split.native.length;
        return { status: 'ok', indexed: agentFactsIndex.stats().total, native: split.native.length };
    } catch (error) {
        if (!current()) return { status: 'stale' };
        try { console.warn(`[${EXTENSION_ID}] 世界书索引同步失败`, error); } catch { /* 静默失败，不影响生成 */ }
        return { status: 'failed', reason: String(error?.message ?? error) };
    }
}

/** Reads a world book into the setting supply: read-only, ids keep the entry uid. */
async function importWorldbookFromPanel(panel) {
    const target = panel?.querySelector('[data-agent-worldbook-status]');
    const name = typeof currentSettings().setting?.worldbook === 'string' ? currentSettings().setting.worldbook.trim() : '';
    const sequence = ++worldbookLoadSequence;
    const current = () => sequence === worldbookLoadSequence && name === String(currentSettings().setting?.worldbook ?? '').trim();
    agentSettingSupply.clear();
    agentFactsIndex.load({ entries: [] });
    lastWorldbookNative = 0;
    if (!name) { if (target) target.textContent = '先填写世界书名称，再点导入。'; return { status: 'missing_name' }; }
    if (target) target.textContent = `正在读取「${name}」……`;
    try {
        const result = await loadWorldbookEntries(getHostContext(), name);
        if (!current()) return { status: 'stale' };
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
        renderFactsBrowser(panel);
        return { ...result, added };
    } catch (error) {
        if (!current()) return { status: 'stale' };
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