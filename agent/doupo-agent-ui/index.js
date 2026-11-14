import { createAgentCoordinator, STATUS_EVENT } from './core/coordinator.js';
import { makeElement } from './host/dom.js';
import { cleanFloorText, cleanFloorEntries, regexHiddenFloorBound } from './host/floor-text.js';
import { roundKeyOf, settleRoundKeyOf, createMemoryRecallCacheKey } from './host/round-key.js';
import { createCurrentAgentScope, createCaptureAgents } from './host/scope.js';
import { createSandboxWiring } from './sandbox/wiring.js';
import { createImpactInjection, createImpactRestore } from './impact/impact-injection.js';

// 作用域与续算凭据（实现在 host/scope.js）：纪元走 getter，续算失效只动 epoch。
const { captureAgentScope, captureAgentContinuation } = createCaptureAgents({
    getEpoch: () => agentContinuationEpoch, settleScopeKey, getContext: getHostContext,
    currentSettings, lastReplyIndex,
});
const currentAgentScope = createCurrentAgentScope({ getContext: getHostContext });
import { renderEquipmentFigure } from './host/equipment-figure.js';
import { createAuditLog } from './core/audit-log.js';
import { createFactsLibrary } from './narrative/facts-library.js';
import { createSettingSupply, trimToVolume } from './narrative/setting-supply.js';
import { VERIFY_PROMPT, VERIFY_JSON_SCHEMA, buildVerifyUser, buildVerifyRetryUser, parseVerifyReply, shouldVerify, buildVerifyEntries, mergeVerifyEntries, markEntryFalsePositive, addExemption, listOpenFindings, normalizeVerifyLedger } from './narrative/verify-claims.js';
import { createImpactRuntime } from './impact/impact-runtime.js';
import { buildImpactInjection, buildImpactInjectionDetail, impactMark, isImpactDecideDue, WEIGHT_LABEL, STATE_LABEL, SHIFT_LABEL } from './impact/impact-ops.js';
import { buildImpactDecideUser, parseImpactDecision, IMPACT_DECIDE_PROMPT, IMPACT_JSON_SCHEMA } from './impact/impact-decide.js';
import { buildImpactInjectUser, buildImpactInjectionFromPicksDetail, parseImpactSelect, IMPACT_INJECT_PROMPT, IMPACT_INJECT_SCHEMA } from './impact/impact-select.js';
import { createNpcDecisionGuard } from './npc/npc-decision-guard.js';
import { createNpcAutonomyPlanner } from './npc/npc-autonomy.js';
import { createNpcPlanReassessment } from './npc/npc-plan-reassessment.js';
import { createNpcConflictCoordinator } from './npc/npc-conflict.js';
import { createNpcCommitGate } from './npc/npc-commit-gate.js';
import { createNpcLedger, normalizePatch, NPC_FIELDS, FAVOR_SCALE, FAVOR_STEP_MAX, favorLabel } from './npc/npc-ledger.js';
import { NPC_RECORD_PROMPT, NPC_RECORD_JSON_SCHEMA, NPC_EXTRACT_PROMPT, buildNpcRecordUser, buildNpcExtractUser, playerContextLine, parseNpcRecordReply, NPC_RECORD_RETRY_SYSTEM_NOTE, buildRecordRetryUser, EXP_CONDENSE_PROMPT, buildExpCondenseUser, parseExpCondenseReply } from './npc/npc-recorder.js';
import { createNpcColdRuntime, filterColdPatches, mapWithLimit } from './npc/npc-cold-runtime.js';
import { createNpcRelations } from './npc/npc-relations.js';
import { GOSSIP_PROMPT, buildGossipUser, GOSSIP_FAVOR_STEP_MAX } from './npc/npc-gossip.js';
import { CONSISTENCY_PROMPT, buildConsistencyUser, parseConsistencyReply } from './npc/npc-consistency.js';
import { NPC_COLD_PROMPT, buildNpcColdUser } from './npc/npc-cold-recorder.js';
import { createSandboxMode } from './sandbox/sandbox-mode.js';
import { SANDBOX_WORLD_PROMPT, buildSandboxDecideNote } from './sandbox/sandbox-world.js';
import { createUiState } from './host/ui-state.js';
import { createStateStore } from './core/state-store.js';
import { chatFloorShape, findDeletedFloor } from './narrative/history-events.js';
import { probeHostCapabilities } from './host/capability-preflight.js';
import { createHostStorage } from './host/host-storage.js';
import { buildControlDashboard, normalizeTheme } from './host/control-dashboard.js';
import { ORB_ITEMS, buildOrbPanels, createOrbState } from './host/orb-hud.js';
import { createTurnStages } from './core/turn-stages.js';
import { createLitePick } from './lite/lite-pick.js';
import { createLiteSettle } from './lite/lite-settle.js';
import { SETTLE_CATEGORIES, resolveCategory } from './core/settle-categories.js';
import { SETTLE_RESULT_PROMPT, SETTLE_INJECTION_SOURCES, buildSettleResultUser, buildSettleRetryUser, buildSettleState, buildSettleContextState, compareSettleState, parseSettleResult, reviewSettleEffects, renderSettleInjection } from './settle/settle-adjudicate.js';
import { createSettleDiceRng, SETTLE_DIFFICULTY_LABELS } from './settle/settle-difficulty.js';
import { createSettleSession, shouldClearSettleOnGenerationEnd } from './settle/settle-session.js';
import { createLlmClient, listModels } from './host/llm-client.js';
import { API_PRESETS_MAX, parseYamlBlock, presetToOverrides } from './host/api-presets.js';
import { createMessageAdapter } from './host/message-adapter.js';
import { createPromptInjection } from './host/prompt-injection.js';
import { stripGlobalDisplayRegexScripts, ensureScopedDisplayRegexScripts, isDoupoCard } from './host/display-regex.js';
import { loadWorldbookEntries, summarizeWorldbookEntries } from './narrative/worldbook-source.js';
import { createFactsIndex } from './narrative/facts-index.js';
import { createFactsSelector, DEFAULT_MAX_PICKS, LOOKUP_RULES, SELECT_RULES } from './narrative/facts-select.js';
import { createWorldRuntime, eventIntro } from './world/world-runtime.js';
import { buildWorldInjection, extractOpsBlock, parseOps, stripOpsBlock, OPS_GUIDE, WORLD_HEADER, seasonOf } from './world/world-ops.js';
import { buildDecideUser, parseDecision, WORLD_DECIDE_PROMPT, DECIDE_JSON_SCHEMA } from './world/world-decide.js';
import { PLOT_DECIDE_PROMPT, PLOT_JSON_SCHEMA, buildPlotDecideUser, parsePlotDecision } from './plot/plot-decide.js';
import { buildPlotInjection, PLOT_HEADER } from './plot/plot-ops.js';
import { createPlotRuntime } from './plot/plot-runtime.js';
import { createSelfRuntime } from './self/self-runtime.js';
import { buildSelfInjection, extractOpsBlock as extractSelfOpsBlock, stripOpsBlock as stripSelfOpsBlock, SELF_GUIDE, SELF_HEADER } from './self/self-ops.js';
import { SELF_DECIDE_PROMPT, SELF_JSON_SCHEMA, buildSelfDecideUser, parseSelfDecision } from './self/self-decide.js';

import { createMemoryRuntime } from './memory/memory-runtime.js';
import { buildMemoryInjection, renderMemoryEntriesDetail, recallHits, recallKeys, findMemoryConflicts, extractOpsBlock as extractMemoryOpsBlock, parseOps as parseMemoryOps, stripOpsBlock as stripMemoryOpsBlock, MEMORY_GUIDE, MEMORY_HEADER } from './memory/memory-ops.js';
import { buildDecideUser as buildMemoryDecideUser, parseDecision as parseMemoryDecision, capRememberOps, MEMORY_DECIDE_PROMPT, MEMORY_JSON_SCHEMA } from './memory/memory-decide.js';
import { buildRecallUser, buildRecallCatalog, parseRecallDecision, recallEntriesFromIds, MEMORY_RECALL_PROMPT, RECALL_JSON_SCHEMA } from './memory/memory-recall.js';
import { relatedMemories } from './memory/memory-retrieve.js';

import { MEMORY_CONSOLIDATE_PROMPT, MEMORY_CONSOLIDATE_JSON_SCHEMA, buildConsolidateUser, parseConsolidation } from './memory/memory-consolidate.js';
import { createEmbeddingClient } from './host/embedding-client.js';
import { createMemoryVectorStore, createMemoryVectorIndex } from './memory/memory-vectors.js';
import { buildPersonView, PERSON_VIEW_KINDS } from './memory/person-view.js';
import { auditMemory } from './memory/memory-audit.js';
import { buildWakeUpSummary } from './memory/memory-wakeup.js';
import { createDbBridge } from './host/db-bridge.js';
import { createSelfMvuBridge } from './host/self-mvu.js';
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
function invalidateAgentContinuations() {
    agentContinuationEpoch += 1;
    worldDecideRunning = selfDecideRunning = memoryDecideRunning = impactDecideRunning = false;
    memoryConsolidateRunning = memoryRecallRunning = npcRecordRunning = npcColdRunning = false;
    verifyRunning = false;
    worldDecidedFloor = selfDecidedFloor = memoryDecidedFloor = null;
    verifyDecidedFloor = null;
    lastImpactDecideIdentity = null;
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
        probeAgentCapabilities();
        void installDisplayRegex();
        mount();
        restoreSandboxFromChat();
        restoreWorldFromChat();
        restorePlotFromChat();
        hydrateVerify();
        restoreImpactFromChat();
        restoreNpcLedgerFromChat();
        restoreNpcColdFromChat();
        restoreSelfFromChat();
        restoreMemoryFromChat();
        // 开局摘要门闩：启动恢复完成后武装，应用启动后的第一条回复交底一次。
        try { wakeUpPendingChatId = String(getHostContext()?.chatId ?? ''); } catch { /* 上下文不可用时保持关闭 */ }
        hydrateFactsLastInjection();
        hydrateMemoryLastInjection();
        hydrateSettleAdjudication();
        // 申报条目开机对齐：变量更新一律由纳戒 API 决定，世界书申报教学条目无条件停用（幂等，已对齐时不落盘）。
        try {
            void setMvuDeclarationEntries(false).then(result => {
                if (result.status === 'error') console.warn('[斗破Agent] 申报条目对齐失败', result.reason);
            });
        } catch { /* 对齐失败不阻断启动，模型惯性吐出的申报块只当普通文本 */ }
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
            resetSettleAdjudication();
            void installDisplayRegex();
            restoreSandboxFromChat();
            try { agentDbBridge.onChatChanged(); } catch { /* 数据库桥不可用时静默跳过 */ }
            try { agentPromptInjection.clear(); factsInjectedSnapshot = ''; } catch { /* 切聊天时清空注入 */ }
            try { agentWorldPromptInjection.clear(); } catch { /* 同上 */ }
            try { agentImpactPromptInjection.clear(); } catch { /* 同上 */ }
            try { agentNpcLedgerInjection.clear(); } catch { /* 同上 */ }
            try { agentSelfPromptInjection.clear(); } catch { /* 同上 */ }
            try { agentWakeUpPromptInjection.clear(); } catch { /* 同上 */ }
            try { agentPlotPromptInjection.clear(); } catch { /* 同上 */ }
            try { restoreWorldFromChat(); } catch { /* 换聊天读不到世界台账时按开局处理 */ }
            try { restorePlotFromChat(); } catch { /* 换聊天读不到剧情账本时按空账开局 */ }
            try { hydrateVerify(); } catch { /* 换聊天读不到核验台账时按空表处理 */ }
            try { restoreImpactFromChat(); } catch { /* 换聊天读不到影响库时按空库开局 */ }
            try { restoreNpcLedgerFromChat(); } catch { /* 换聊天读不到人物簿时按空簿开局 */ }
            try { restoreNpcRelationsFromChat(); } catch { /* 换聊天读不到关系图时按空图开局 */ }
            try { restoreNpcColdFromChat(); } catch { /* 换聊天读不到冷藏台时按空台开局 */ }
            try { restoreSelfFromChat(); } catch { /* 换聊天读不到纳戒时按空戒开局 */ }
            try { restoreMemoryFromChat(); } catch { /* 换聊天读不到记忆时按空账开局 */ }
            // 开局摘要门闩：新聊天武装一次，下一轮生成时交底一次。
            try { wakeUpPendingChatId = String(getHostContext()?.chatId ?? ''); } catch { /* 上下文不可用时保持原状 */ }
            hydrateFactsLastInjection();
            hydrateMemoryLastInjection();
            hydrateSettleAdjudication();
            refreshControlDashboard();
            refreshWorldPage();
            refreshPlotPanel();
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
                if (currentSettings().apiMode === 'lite') {
                    // 简略版：五条记账链并成一次总结算；判定没跑成退回正文指令块降级，
                    // 不再发起任何单路调用。开局纳戒初始化的放行口径与完整版一致。
                    const liteChain = Promise.resolve(agentLiteSettle.run({ source: 'auto' })).then(result => {
                        try { recordAgentAudit({ event: 'turn_lite_settle', outcome: String(result?.status ?? 'unknown') }); } catch { /* 审计失败不影响记账 */ }
                        if (!['unavailable', 'stale', 'failed', 'rejected', 'busy', 'not_configured', 'invalid', 'error', 'no_input', 'no_reply', 'already_decided', 'disabled'].includes(result?.status) && creationInitPending()) clearCreationInitPending();
                        if (['failed', 'invalid', 'no_input'].includes(result?.status)) {
                            try { applyWorldOpsFromLatestReply(); } catch { /* 指令执行失败不影响生成 */ }
                            try { applySelfOpsFromLatestReply(); } catch { /* 指令执行失败不影响生成 */ }
                            try { applyMemoryOpsFromLatestReply(); } catch { /* 指令执行失败不影响生成 */ }
                        }
                    }).catch(() => {});
                    // 正文事实核验排在总结算之后：台账没落地就开核，会把“本轮刚发生的变化”误判成矛盾。
                    scheduleFactCheckAfter([liteChain]);
                } else {
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
                            const replyIdentity = replyIdentityOf(chat, lastReplyIndex(chat));
                            // 同楼重 roll：最新一楼的正文/swipe 变了就重读重算，哪怕记录节奏上还不到。
                            const identityChanged = decidedFloor === chat.length - 1 && lastImpactDecideIdentity !== replyIdentity;
                            if (isImpactDecideDue(chat, { every: impact.decideEvery, lastFloor }) || identityChanged) void Promise.resolve(runImpactDecision({ source: 'auto' })).then(result => { try { recordAgentAudit({ event: 'turn_impact_decide', outcome: String(result?.status ?? 'unknown') }); } catch { /* 审计失败不影响记账 */ } if (!['unavailable', 'stale', 'failed', 'rejected', 'busy', 'not_configured', 'invalid', 'error', 'no_input', 'no_reply'].includes(result?.status)) lastImpactDecideIdentity = replyIdentity; }).catch(() => {});
                        }
                    } catch { /* 记录失败不影响生成 */ }
                    // 纳戒记账，按申报通道分流：inline=模型在正文末尾顺手申报，仲裁器读帧裁决；
                    // independent=扩展另发一次决定请求，正文保持干净——但主回复若已带申报块
                    // （世界书条目没停干净/手动开了），仍走仲裁器兜底，双通道不会重复记账。
                    try {
                        const self = selfLedgerSettings();
                        if (self.enabled) {
                            // 纳戒变量更新一律由纳戒 API 决定：读聊天+账本现状 → 模型出 JSON → 脚本逐条校验落账。
                            // 正文不携带申报块（世界书申报条目由扩展无条件停用）；模型惯性吐出的块只当普通文本，不参与记账。
                            const run = self.decideAuto && self.decideEnabled
                                ? runSelfDecision({ source: 'auto' })
                                : Promise.resolve({ status: 'idle' });
                            const result = await run;
                            if (!continuation.current()) return;
                            if (creationInitPending() && result
                                && !['unavailable', 'stale', 'failed', 'rejected', 'busy', 'not_configured', 'invalid', 'error', 'no_input', 'no_reply'].includes(result.status)) clearCreationInitPending();
                            try { recordAgentAudit({ event: 'turn_self_decide', stage: 'ring-decide', outcome: String(result?.status ?? 'unknown') }); } catch { /* 审计失败不影响记账 */ }
                        }
                    } catch { /* 纳戒记账失败不影响生成 */ }
                    // 记忆依赖纳戒/MVU完成；人物和影响仍可独立并行。
                    if (!continuation.current()) return;
                    try {
                        const memory = memorySettings();
                        if (memory.enabled && memory.decideEnabled && memory.decideAuto) void Promise.resolve(runMemoryDecision({ source: 'auto' })).then(result => { try { recordAgentAudit({ event: 'turn_memory_decide', outcome: String(result?.status ?? 'unknown') }); } catch { /* 审计失败不影响记账 */ } }).catch(() => {});
                    } catch { /* 记账失败不影响生成 */ }
                };
                let accountingChain = null;
                // 世界决定链单独拎出来：人物记账要等它落定（世界钟先走到本轮，人物档案的「第N天」才是本轮的，
                // 实测出现过记录员拿昨天的天数记账），影响/纳戒/记忆仍照旧跟在世界决定后面串行。
                let worldDecisionChain = Promise.resolve();
                if (decide.enabled && decide.auto) {
                    try { worldDecisionChain = Promise.resolve(runWorldDecision({ source: 'auto' })).then(result => { try { recordAgentAudit({ event: 'turn_world_decision', outcome: String(result?.status ?? 'unknown') }); } catch { /* 审计失败不影响记账 */ } }); accountingChain = worldDecisionChain.finally(afterWorld).catch(() => {}); } catch { afterWorld(); accountingChain = Promise.resolve().catch(() => {}); }
                } else {
                    try { applyWorldOpsFromLatestReply(); } catch { /* 指令执行失败不影响生成 */ }
                    try { applySelfOpsFromLatestReply(); } catch { /* 指令执行失败不影响生成 */ }
                    try { applyMemoryOpsFromLatestReply(); } catch { /* 指令执行失败不影响生成 */ }
                    accountingChain = Promise.resolve().then(() => afterWorld()).catch(() => {});
                }
                // 人物簿记账：正文已经落地，记录员读这一轮把人物变化补进档案；排在世界决定之后
                // （世界钟先落定），与影响/纳戒/记忆链并行——世界决定失败也不拦人物记账。
                const ledger = npcLedgerSettings();
                let npcChain = null;
                if (ledger.enabled && ledger.auto) {
                    try { npcChain = worldDecisionChain.catch(() => {}).then(() => Promise.resolve(runNpcLedgerRecord({ source: 'auto' }))).then(result => { try { recordAgentAudit({ event: 'turn_npc_record', outcome: String(result?.status ?? 'unknown') }); } catch { /* 审计失败不影响记账 */ } }).catch(() => {}); } catch { /* 记账失败不影响生成 */ }
                }
                // 正文事实核验排在记账链之后：台账没落地就开核，会把“本轮刚发生的变化”误判成矛盾。
                scheduleFactCheckAfter([accountingChain, npcChain]);
                // 剧情账本同样排在记账链之后：世界账落定才有可信的时钟，计划与线索才不会写成空中楼阁。
                schedulePlotDecideAfter([accountingChain]);
                }
            }
            try { agentPromptInjection.clear(); } catch { /* 清空失败不影响生成 */ }
            persistFactsLastInjection();
            try { agentWorldPromptInjection.clear(); } catch { /* 同上 */ }
            try { agentPlotPromptInjection.clear(); } catch { /* 同上 */ }
            try { agentImpactPromptInjection.clear(); } catch { /* 同上 */ }
            try { agentNpcLedgerInjection.clear(); } catch { /* 同上 */ }
            try { agentSelfPromptInjection.clear(); } catch { /* 同上 */ }
            try { agentMemoryPromptInjection.clear(); } catch { /* 同上 */ }
            try { agentWakeUpPromptInjection.clear(); } catch { /* 同上 */ }
            markMemoryLastInjectionCleared();
            try {
                const cleared = agentActionPromptInjection.clear();
                if (lastSettleAdjudication && lastSettleAdjudication.cleared !== true) recordSettleAdjudication({ ...lastSettleAdjudication, cleared: cleared.status === 'cleared', clearError: cleared.status === 'cleared' ? '' : cleared.reason ?? cleared.status });
            } catch { /* 清理失败不冒充成功 */ }
            try {
                const panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null;
                // 面板即使收着也照常刷新：DOM 更新很便宜，省得用户打开时看到上一轮的旧内容。
                if (panel) { renderFactsStatus(panel); refreshWorldbookStats(panel); refreshWorldPage(panel); refreshPlotPanel(panel); refreshControlDashboard(); try { renderImpactLibrary(panel); } catch { /* 同上 */ } try { refreshNpcLedgerPage(panel); } catch { /* 同上 */ } try { refreshSelfPage(panel); } catch { /* 同上 */ } try { refreshMemoryPage(panel); } catch { /* 同上 */ } }
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
                    agentImpactInjection.invalidate();
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

/** 审计行没带任务名时的兜底：按事件给一句人话（运行日志里不再满屏 unknown-task）。
 *  真正的协调器任务仍用它自己的 id；这里只管各轮管线散落的审计调用。 */
const AUDIT_EVENT_TASKS = Object.freeze({
    turn_lite_settle: '简略总结算',
    turn_impact_decide: '影响记录',
    turn_self_decide: '纳戒决定',
    turn_memory_decide: '记忆决定',
    turn_world_decision: '世界决定',
    turn_npc_record: '人物记录',
    turn_facts_inject: '原著注入',
    turn_settle_adjudicate: '行动判定',
    turn_plot_decision: '剧情决定',
    turn_fact_check: '正文核验',
    turn_pregen_abort: '备料中止',
    turn_mvu_arbitrate: 'MVU 仲裁',
    npc_exp_auto_condense: '经历精简',
    npc_consistency: '一致性体检',
    npc_unbacked_change: '无依据变动',
});

export function recordAgentAudit(raw) {
    const item = raw && typeof raw === 'object' ? raw : {};
    const result = agentAuditLog.record({
        ...item,
        taskId: typeof item.taskId === 'string' && item.taskId.trim()
            ? item.taskId
            : (typeof item.event === 'string' && AUDIT_EVENT_TASKS[item.event]) || 'unknown-task',
        sessionId: typeof item.sessionId === 'string' && item.sessionId.trim() ? item.sessionId : 'unknown-session',
        branchId: typeof item.branchId === 'string' && item.branchId.trim() ? item.branchId : 'unknown-branch',
        stateVersion: typeof item.stateVersion === 'string' && item.stateVersion.trim() ? item.stateVersion : 'unknown-version',
    });
    refreshControlDashboard();
    return result;
}

export const agentCoordinator = createAgentCoordinator();
export const agentAuditLog = createAuditLog();
export const agentFactsLibrary = createFactsLibrary();
export const agentSettingSupply = createSettingSupply();
/** 世界影响库：记录“玩家把这局世界改成了什么样”，跨楼层累积，跟着聊天存档走。 */
export const agentImpactRuntime = createImpactRuntime();
export const agentNpcDecisionGuard = createNpcDecisionGuard();
export const agentNpcAutonomyPlanner = createNpcAutonomyPlanner();
/** 人物簿：NPC 全信息的母库，跟着聊天存档走。决策、正文注入和面板都从这里读。 */
export const agentNpcLedger = createNpcLedger();
/** 冷藏人物推进台：只生成预览，确认后才把补丁交给人物簿。 */
export const agentNpcColdRuntime = createNpcColdRuntime();
/** 全局人物关系图：档案「对他人」的有向边汇总层，对称体检/二跳注入/关系扩散都从这里读。 */
export const agentNpcRelations = createNpcRelations();
export const agentNpcPlanReassessment = createNpcPlanReassessment({ autonomyPlanner: agentNpcAutonomyPlanner, onRequest: result => recordAgentAudit({ taskId: result.obstacleId, sessionId: result.sessionId, branchId: result.branchId, stateVersion: result.stateVersion, event: result.status === 'duplicate_reassessment' ? 'npc_plan_reassessment_duplicate' : result.status === 'needs_redecision' ? 'npc_plan_reassessment_requested' : result.status === 'cleared' ? 'npc_plan_reassessment_cleared' : 'npc_plan_reassessment_blocked', outcome: result.reason ?? result.status }) });
export const agentNpcConflictCoordinator = createNpcConflictCoordinator();
export const agentSandboxMode = createSandboxMode();
export const agentUiState = createUiState();
export const agentStateStore = createStateStore();
export const agentNpcCommitGate = createNpcCommitGate({ autonomyPlanner: agentNpcAutonomyPlanner, stateStore: agentStateStore });
export const agentLlmClient = createLlmClient({ getSettings: () => currentSettings(), getContext: getHostContext, capture: captureAgentContinuation, isCurrent: owner => owner.current() });
export const agentMessageAdapter = createMessageAdapter({ getContext: getHostContext, capture: captureAgentScope, isCurrent: owner => owner.current() });
export const agentPromptInjection = createPromptInjection({ getContext: getHostContext });
/** 世界事件系统：台账（时钟/基础信息/双栏事件）+ 独立的注入通道（key 与原著设定分开，互不清空）。 */
export const agentWorldRuntime = createWorldRuntime({ maxOps: 12 });
export const agentWorldPromptInjection = createPromptInjection({ getContext: getHostContext, key: 'doupo_world' });
/** 剧情账本：滚动计划与线索账（叙事层的长篇一致性），独立的决定与注入通道（doupo_plot）。 */
export const agentPlotRuntime = createPlotRuntime();
export const agentPlotPromptInjection = createPromptInjection({ getContext: getHostContext, key: 'doupo_plot' });
/** 世界影响库的独立注入通道：和世界台账、原著设定分开，谁也不清空谁。 */
export const agentImpactPromptInjection = createPromptInjection({ getContext: getHostContext, key: 'doupo_impact' });
/** 人物簿的独立注入通道：只写“本楼在场/重要人物的档案摘要”，和世界、影响、原著设定三路互不清空。 */
export const agentNpcLedgerInjection = createPromptInjection({ getContext: getHostContext, key: 'doupo_npc_ledger' });
/** 纳戒（主角自身与随身之物）：跟着聊天存档走；决定、注入和面板都从这里读。 */
export const agentSelfRuntime = createSelfRuntime({ maxOps: 12 });
export const agentSelfPromptInjection = createPromptInjection({ getContext: getHostContext, key: 'doupo_self' });
/** 记忆（主角的四类叙事记忆：恩怨/情报/伏笔/大事记）：跟着聊天存档走；与纳戒（状态）、
 *  人物簿（别人）、世界（外界动态）互不重叠，只收"值得长期记住的叙事事实"。 */
export const agentMemoryRuntime = createMemoryRuntime({ maxOps: 12, advancedMode });
export const agentMemoryPromptInjection = createPromptInjection({ getContext: getHostContext, key: 'doupo_memory' });
/** 开局摘要的一次性注入通道：切换/载入聊天后的第一条回复前交底一次，之后清掉（doupo_wakeup）。 */
export const agentWakeUpPromptInjection = createPromptInjection({ getContext: getHostContext, key: 'doupo_wakeup' });
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
/** World-book index (uid -> category/name/volumes/content) and the model-side selector that names uids. */
export const agentFactsIndex = createFactsIndex();

/**
 * API设置方案绑定表：功能组 → 绑定键（存方案 id）。模型设置页每张连接卡顶部的下拉写这里的键；
 * 绑定非空时该功能整套走方案（连接+参数+附加参数）；空/方案被删＝跟随酒馆主连接。
 */
const API_PRESET_BINDINGS = Object.freeze({
    llm: 'llm.apiPreset', // 正文/默认调用（意图解析、正文撰写共用）
    facts: 'setting.apiPreset', // 原著选条/卷外点选
    verify: 'verify.apiPreset', // 正文核验（生成后事实审计）
    settle: 'settle.apiPreset', // 行动结算分类判定（已并入最终判定同一套 API；绑定保留只为删方案时回收旧绑定）
    settleResult: 'settle.resultApiPreset', // 行动结算·判定调用（分类判定与最终判定共用）
    world: 'world.decideApiPreset', // 世界决定
    plot: 'plot.decideApiPreset', // 剧情账本决定
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
    litePick: 'lite.pickApiPreset', // 简略版·素材总挑选（原著/影响/记忆三路合并）
    liteSettle: 'lite.settleApiPreset', // 简略版·总结算（五本账合并）
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
    settings: agentSettingSupply,
    select: args => agentLlmClient.selectSettings({ ...args, overrides: presetOverrides('facts') }),
    catalogIndex: agentFactsIndex,
    catalogSelector: agentFactsSelector,
    // 人物簿已建档的人物条目不再从原著设定重复注入：同一人的信息由人物簿通道负责。
    // （判定函数在 lite 接线块里：skipProfiledNpcEntry，简略版选条也共用。）
    skipProfiledEntry: skipProfiledNpcEntry,
    getSettingBudget: () => {
        const setting = currentSettings().setting ?? {};
        // 沙盒口径不用世界书：设定挑选与按需注入整条停用，即使世界书开关还开着。
        if (setting.enabled === false || sandboxModeActive()) return null;
        return {
            maxCandidates: Number.isInteger(setting.maxCandidates) && setting.maxCandidates > 0 ? setting.maxCandidates : 40,
            maxItems: Number.isInteger(setting.maxItems) && setting.maxItems > 0 ? setting.maxItems : 8,
            // 0 = 不限制（与设置页文案一致）：assemble 对 0/空按“选中几条注几条全文”处理。
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
    getRecentTexts: async () => {
        const chat = getHostContext()?.chat ?? [];
        const raws = [];
        for (let index = chat.length - 1; index >= 0 && raws.length < 2; index -= 1) {
            const message = chat[index];
            if (!message || message.is_user === true || message.is_system === true) continue;
            if (typeof message.mes === 'string' && message.mes.trim()) raws.unshift({ role: '角色', text: message.mes, isUser: false, depth: chat.length - 1 - index });
        }
        const cleaned = await cleanFloorEntries(raws);
        return cleaned.map(floor => floor.text).filter(text => text.trim());
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
        budget: Number.isInteger(world.eventBudget) && world.eventBudget > 0 ? world.eventBudget : 900,
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

/** 剧情账本跟着聊天走：换聊天读那一份，读不到就按空账开局；悬置天数以世界台账的当前天数为准。 */
function restorePlotFromChat() {
    const record = hostStorage?.plotState?.();
    return record?.status === 'ready' && record.value ? agentPlotRuntime.restore(record.value) : agentPlotRuntime.reset();
}

function persistPlot() {
    const snapshot = agentPlotRuntime.snapshot();
    return Promise.resolve(hostStorage?.savePlotState?.(snapshot) ?? { status: 'unavailable' })
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

/** 生成前把剧情前瞻（滚动计划 + 未回收线索）写进独立注入通道；与世界等各路互不清空。 */
function writePlotInjectionForPrompt() {
    const plot = currentSettings().plot ?? {};
    const settings = plotLedgerSettings();
    if (!plot.enabled || !settings.inject) { agentPlotPromptInjection.clear(); return { status: 'disabled' }; }
    const probe = agentPlotPromptInjection.inspect();
    if (probe.status !== 'ready') return probe;
    const body = buildPlotInjection(agentPlotRuntime.snapshot(), { maxChars: settings.budget });
    if (!body) { agentPlotPromptInjection.clear(); return { status: 'empty' }; }
    return agentPlotPromptInjection.write({ text: `${PLOT_HEADER}\n${body}` }, { depth: injectionSettings().depth, maxChars: settings.budget + 200 });
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
        injectBudget: Number.isInteger(self.injectBudget) && self.injectBudget > 0 ? self.injectBudget : 900,
        decideEnabled: self.decideEnabled !== false,
        decideAuto: self.decideAuto !== false,
        maxFloors: Number.isInteger(self.decideMaxFloors) && self.decideMaxFloors > 0 ? Math.min(12, self.decideMaxFloors) : Math.min(12, globalReadFloors()),
        prompt: typeof self.decidePrompt === 'string' && self.decidePrompt.trim() ? self.decidePrompt.trim() : SELF_DECIDE_PROMPT,
        // 绑定了 API设置方案整套走方案；没绑＝跟随酒馆主连接。
        overrides: presetOverrides('self') ?? { connection: 'tavern' },
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
        // 注入/目录预算：0 或没填＝不限制（设置层存 0，用的时候换算成 Infinity）。这是用户拍板的默认口径。
        injectBudget: Number.isInteger(memory.injectBudget) && memory.injectBudget > 0 ? memory.injectBudget : 0,
        decideEnabled: memory.decideEnabled !== false,
        decideAuto: memory.decideAuto !== false,
        consolidateAfter: Number.isInteger(memory.consolidateAfter) && memory.consolidateAfter >= 0 ? Math.min(30, memory.consolidateAfter) : 6,
        // 记忆目录字数预算：召回决定喂给模型的目录上限（混合检索分数序，超预算从尾部丢）；0＝不限制。
        catalogBudget: Number.isInteger(memory.catalogBudget) && memory.catalogBudget > 0 ? memory.catalogBudget : 0,
        // 开局摘要：切聊天后第一条回复前的一次性交底；关掉后完全不注。
        wakeUp: memory.wakeUp !== false,
        wakeUpBudget: Number.isInteger(memory.wakeUpBudget) && memory.wakeUpBudget >= 200 ? Math.min(2000, memory.wakeUpBudget) : 500,
        // 语义检索（可选）：没配置时全链路走纯本地混合检索，零行为变化。
        embedding: {
            enabled: memory.embedding?.enabled === true,
            baseUrl: typeof memory.embedding?.baseUrl === 'string' ? memory.embedding.baseUrl.trim() : '',
            apiKey: typeof memory.embedding?.apiKey === 'string' ? memory.embedding.apiKey.trim() : '',
            model: typeof memory.embedding?.model === 'string' ? memory.embedding.model.trim() : '',
        },
        maxFloors: Number.isInteger(memory.decideMaxFloors) && memory.decideMaxFloors > 0 ? Math.min(12, memory.decideMaxFloors) : Math.min(12, globalReadFloors()),
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

/** 总控「运行口径」行：调用版本（完整版/简略版/进阶版）+ 开放世界/主线 + 世界书通道状态。 */
function renderRuntimeMode(panel) {
    const target = panel?.querySelector('[data-runtime-mode]');
    if (!target) return;
    const modeText = apiMode() === 'advanced' ? '进阶版（完整版管线＋进阶增强）' : apiMode() === 'lite' ? '简略版（合并调用）' : '完整版（每功能一路，进阶增强关闭）';
    const sandbox = sandboxModeActive();
    const record = agentSandboxMode.read(currentAgentScope());
    const recordNote = record.status === 'ready'
        ? `正式记录：${record.mode === 'sandbox' ? '开放世界' : '主线'}${record.mode === 'sandbox' ? `（惯性·${record.inertia === 'strong' ? '强' : record.inertia === 'weak' ? '弱' : '中'}）` : ''}`
        : '正式记录：未建立（按设置开关走）';
    target.textContent = sandbox
        ? `当前口径：${modeText}。开放世界；${recordNote}；世界书通道停用，内置斗气大陆基线注入中，决定喂料不带世界书条目。`
        : `当前口径：${modeText}。主线；${recordNote}；世界书通道照常（开关与预算见「原著设定」页）。`;
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
    syncMemoryVectors(snapshot);
    return result;
}

// ---------- 记忆召回决定：用户输入之后、生成之前，由召回员挑注入哪些记忆 ----------

// ---------- 记忆语义检索（可选）：OpenAI 兼容 embeddings + 向量索引，默认关 ----------
// 与 MemPalace 的可插拔检索层同构：没配置端点时全链路走纯本地混合检索，零行为变化。

const agentEmbeddingClient = createEmbeddingClient({ getSettings: () => memorySettings().embedding });
const agentMemoryVectors = createMemoryVectorIndex({
    store: createMemoryVectorStore({}),
    embed: texts => agentEmbeddingClient.embed(texts),
    model: () => memorySettings().embedding.model,
    chatKey: () => String(getHostContext()?.chatId ?? 'default'),
});

/** 落账后差异化补嵌（fire-and-forget）：语义检索没开/没配齐/不在进阶版就安静跳过，失败不影响记账。 */
function syncMemoryVectors(snapshot = null) {
    try {
        if (!advancedMode() || !memorySettings().embedding.enabled || !agentEmbeddingClient.available()) return;
        void agentMemoryVectors.sync(snapshot ?? agentMemoryRuntime.snapshot(), { budget: 8 }).catch(() => { /* 补嵌失败留给下一轮落账 */ });
    } catch { /* 语义检索永不阻断记账 */ }
}

/** 语义相似度表（Map<编号, 相似度>）：没开/没配齐/不在进阶版/失败一律 null，调用方退回纯本地混合检索。 */
async function memoryVectorSim(snapshot, sceneForQuery) {
    try {
        if (!advancedMode() || !memorySettings().embedding.enabled || !agentEmbeddingClient.available()) return null;
        const queryVector = await agentMemoryVectors.queryVector(sceneForQuery);
        if (!queryVector) return null;
        return await agentMemoryVectors.similarities(snapshot, queryVector);
    } catch {
        return null;
    }
}

/** 召回结果缓存：同一楼（楼层数 + 最新玩家输入 + 账本未变）内重 roll/重注入不重复调用模型。 */
let memoryRecallCache = { key: '', ids: [], note: '' };
let memoryRecallRunning = false;

// 召回缓存键：作用域 + 一轮身份 + 设置 + 记忆账本手改序号（实现在 host/round-key.js）。
const memoryRecallCacheKey = createMemoryRecallCacheKey({ settleScopeKey: () => settleScopeKey(), currentSettings: () => currentSettings(), memoryRuntime: () => agentMemoryRuntime });

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
 * 召回模型挑编号，脚本按编号取条目（坏号跳过）。结果按一轮缓存，重 roll 不重复调用。
 * 失败/关闭/模型忙时返回失败——由注入路径退回关键词兜底，绝不阻塞生成。
 */
/** 玩家在“让模型决定一次”弹窗里交代的方向：拼进用户提示词尾部；留空＝没填，原样返回。 */
function withPlayerNote(user, note) {
    const directive = typeof note === 'string' ? note.trim().slice(0, 500) : '';
    if (!directive) return user;
    return `${user}\n\n【玩家本轮补充指示】${directive}\n（这是玩家本人特别交代的方向，优先纳入考虑；落账仍要遵守上面的 JSON 字段与校验规则，没有依据的不要编。）`;
}

async function runMemoryRecall({ source = 'manual', chat = null, note = '' } = {}) {
    const settings = memorySettings();
    if (!settings.enabled || !settings.inject || !settings.recallEnabled) {
        setMemoryRecallStatus('记忆召回已关闭：先在记忆页打开「启用记忆」和召回开关。');
        return { status: 'disabled' };
    }
    if (memoryRecallRunning) return { status: 'busy' };
    const chatList = Array.isArray(chat) ? chat : (Array.isArray(getHostContext()?.chat) ? getHostContext().chat : []);
    const cacheKey = memoryRecallCacheKey(chatList);
    if (source !== 'manual' && memoryRecallCache.key && memoryRecallCache.key === cacheKey) {
        return { status: memoryRecallCache.ids.length ? 'cached' : 'empty-cached', ids: memoryRecallCache.ids, note: memoryRecallCache.note };
    }
    if (apiMode() === 'lite') {
        // 简略版：召回并进素材总挑选（同轮只调一次模型），这里只取 memory 一节的结果；
        // 失败由总挑选统一登记备料失败，这里返回 empty 让注入安静落空。
        const continuation = captureAgentContinuation();
        memoryRecallRunning = continuation;
        try {
            const pick = await agentLitePick.run({ chat: chatList });
            if (!continuation.current() || cacheKey !== memoryRecallCacheKey(chatList)) return { status: 'stale' };
            if (pick.status === 'failed' || pick.status === 'no_input') return { status: 'empty', ids: [], note: pick.note };
            memoryRecallCache = { key: cacheKey, ids: pick.memory, note: pick.note };
            return { status: pick.memory.length ? 'ok' : 'empty', ids: memoryRecallCache.ids, note: pick.note };
        } catch (error) {
            if (!continuation.current()) return { status: 'stale' };
            return { status: 'failed', reason: String(error?.message ?? error) };
        } finally {
            if (memoryRecallRunning === continuation) memoryRecallRunning = false;
        }
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
        const rawFloors = [];
        for (let cursor = chatList.length - 1; cursor >= 0 && rawFloors.length < settings.maxFloors; cursor -= 1) {
            const message = chatList[cursor];
            if (!message || typeof message.mes !== 'string' || !message.mes.trim()) continue;
            if (message.is_system === true) continue;
            rawFloors.unshift({ role: message.is_user === true ? '玩家' : '角色', text: message.mes, isUser: message.is_user === true, depth: chatList.length - 1 - cursor });
        }
        floors.push(...await cleanFloorEntries(rawFloors));
        if (!floors.length) return { status: 'no_input' };
        // 世界书侧输入：直接复用原著资料本轮注入通道里的现成内容（选条流程的产物），决定调用不自己翻世界书条目。
        const bookLines = !sandboxModeActive() ? factsInjectedLines() : [];
        const snapshot = agentMemoryRuntime.snapshot();
        // 语义检索（可选）：查询向量取相似度表喂给目录排序；没开/失败静默退回纯本地混合检索。
        const vectorSim = await memoryVectorSim(snapshot, floors.map(floor => floor.text ?? '').join('\n'));
        const user = withPlayerNote(buildRecallUser({ snapshot, floors, worldbookLines: bookLines, currentDay: worldDay(), vectorSim, catalogChars: settings.catalogBudget > 0 ? settings.catalogBudget : Infinity, advanced: advancedMode() }), note);
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
        const list = Array.isArray(chat) ? chat : (Array.isArray(getHostContext()?.chat) ? getHostContext()?.chat ?? [] : []);
        const tail = list.slice(-4);
        const cleanedTail = await Promise.all(tail.map((message, offset) => cleanFloorText(message, tail.length - 1 - offset)));
        sceneText = cleanedTail.join('\n');
    } catch { sceneText = ''; }
    // 主路：召回决定。模型明确说"没有要召回的"也算决定过（尊重结果，不再关键词兜底）。
    let recallNote = '';
    let pickedSource = null; // 'recall' | 'keyword'
    let picked = [];
    if (settings.recallEnabled && settings.recallAuto) {
        const recalled = await runMemoryRecall({ source: 'inject', chat });
        // 备料失败要登记：拦截器会因此终止本次正文调用，残缺提示词不去生成。
        if (recalled.status === 'failed' || recalled.status === 'invalid' || recalled.status === 'not_configured') {
            registerPregenFailure('记忆召回', recalled.reason ?? recalled.error ?? recalled.status);
        }
        if (!current()) return { status: 'stale' };
        if (recalled.status === 'ok' || recalled.status === 'empty' || recalled.status === 'cached' || recalled.status === 'empty-cached') {
            pickedSource = 'recall';
            picked = recallEntriesFromIds(agentMemoryRuntime.snapshot(), recalled.ids);
            recallNote = recalled.note || '';
        }
    }
    if (!pickedSource) {
        pickedSource = 'keyword';
        // 兜底也走混合检索：时间邻近参与排序，语义检索开着就叠加相似度表（失败静默退回纯本地）。
        const fallbackVectorSim = await memoryVectorSim(agentMemoryRuntime.snapshot(), sceneText);
        picked = recallHits(agentMemoryRuntime.snapshot(), { sceneText, currentDay: worldDay(), vectorSim: fallbackVectorSim, advanced: advancedMode() });
    }
    if (!current()) return { status: 'stale' };
    // 决定式自动开启时指令指南不进正文提示词（决定模型另行调用），只注入召回结果保住正文一致性。
    const withGuide = !(settings.decideEnabled && settings.decideAuto);
    const guide = typeof currentSettings().memory?.guide === 'string' && currentSettings().memory.guide.trim()
        ? currentSettings().memory.guide.trim()
        : MEMORY_GUIDE;
    const header = recallNote ? `${MEMORY_HEADER}（召回员：${recallNote}）` : MEMORY_HEADER;
    // 预算 0＝不限制：换算成 Infinity 交给渲染与写入器（写入器本就认非有限值不截断）。
    const budget = settings.injectBudget > 0 ? settings.injectBudget + (withGuide ? 1200 : 0) : Infinity;
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

/* 开局摘要（wake-up，MemPalace wake-up 的模拟）：门闩记一个聊天号，启动恢复/换聊天时武装；
 * 写入器命中即销——每次切聊天只在第一条回复前交底一次，之后通道保持空，各常驻通道照常。 */
let wakeUpPendingChatId = null;

function writeWakeUpInjectionForPrompt({ chat } = {}) {
    const settings = memorySettings();
    if (!settings.enabled || !settings.inject || !settings.wakeUp || !advancedMode()) {
        agentWakeUpPromptInjection.clear();
        return;
    }
    const chatId = String(getHostContext()?.chatId ?? '');
    if (wakeUpPendingChatId === null || chatId !== wakeUpPendingChatId) return;
    const floors = Array.isArray(chat) ? chat : getHostContext()?.chat;
    if (!Array.isArray(floors) || floors.length === 0) return; // 空聊天没东西可交底，门闩留给下一次
    wakeUpPendingChatId = null;
    const summary = buildWakeUpSummary({
        worldSnapshot: agentWorldRuntime.snapshot(),
        memorySnapshot: agentMemoryRuntime.snapshot(),
        npcRecords: agentNpcLedger.list(),
        maxChars: settings.wakeUpBudget,
    });
    if (!summary) return;
    agentWakeUpPromptInjection.write({ text: summary, usedIds: [] }, { depth: injectionSettings().depth, maxChars: settings.wakeUpBudget });
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
 * 纳戒决定（变量更新的唯一生成者）：读聊天记录 + 世界书 + 纳戒现状 → 模型决定 →
 * 脚本逐条校验执行 → 结果呈现到面板。每轮生成结束后自动跑；同楼重roll时以楼层
 * 基线为输入（运行时 apply 会先撤销上一版贡献再应用新指令），正文申报块已退役。
 */
async function runSelfDecision({ source = 'auto', note = '' } = {}) {
    const settings = selfLedgerSettings();
    if (!settings.enabled || !settings.decideEnabled) {
        setSelfStatus('纳戒决定已关闭：先在纳戒页打开「启用模型决定」。');
        return { status: 'disabled' };
    }
    if (selfDecideRunning) return { status: 'busy' };
    // 自定义连接有自己的地址和密钥，不依赖全局配置；跟随酒馆才需要先检查全局连接。
    if (settings.overrides.connection !== 'custom' && agentLlmClient.availableFor('tavern') !== true) {
        setSelfDecideStatus('模型连接未配置：先在“模型设置”页选好连接。');
        return { status: 'not_configured' };
    }
    const selfReplyFloor = lastReplyIndex(Array.isArray(getHostContext()?.chat) ? getHostContext().chat : []);
    const selfReplyIdentity = replyIdentityOf(Array.isArray(getHostContext()?.chat) ? getHostContext().chat : [], selfReplyFloor);
    if (source === 'auto') {
        if (selfReplyFloor < 0) return { status: 'no_reply' };
        // 同楼重 roll：正文或 swipe 变了就要重读重算；runtime 的 apply 会先撤销上一版贡献再落新账。
        if (selfDecidedFloor?.floor === selfReplyFloor && selfDecidedFloor.continuation.current()
            && selfDecidedFloor.identity === selfReplyIdentity) return { status: 'already_decided' };
    }
    const continuation = captureAgentContinuation();
    selfDecideRunning = continuation;
    setSelfDecideStatus('模型正在决定纳戒变化……');
    try {
        const context = getHostContext();
        const chat = Array.isArray(context?.chat) ? context.chat : [];
        const floors = [];
        const rawFloors = [];
        for (let cursor = chat.length - 1; cursor >= 0 && rawFloors.length < settings.maxFloors; cursor -= 1) {
            const message = chat[cursor];
            if (!message || typeof message.mes !== 'string' || !message.mes.trim()) continue;
            if (message.is_system === true) continue;
            rawFloors.unshift({ role: message.is_user === true ? '玩家' : '角色', text: message.mes, isUser: message.is_user === true, depth: chat.length - 1 - cursor });
        }
        floors.push(...await cleanFloorEntries(rawFloors));
        if (!floors.length) {
            setSelfDecideStatus('聊天里还没有内容，模型无从决定。');
            return { status: 'no_input' };
        }
        // 世界书侧输入：直接复用原著资料本轮注入通道里的现成内容（选条流程的产物），决定调用不自己翻世界书条目。
        // 沙盒口径不注入原著条目（通道里放的是沙盒基线），同样不给纳戒决定。
        const bookLines = !sandboxModeActive() ? factsInjectedLines() : [];
        // 同楼重roll时以楼层基线为输入（运行时 apply 会先撤销上一版贡献再应用新指令）；
        // 没有基线机制的环境就按当前快照决定。
        let decideSnapshot = agentSelfRuntime.snapshot();
        try { decideSnapshot = agentSelfRuntime.baselineForFloor(selfReplyFloor) ?? decideSnapshot; } catch { /* 无基线按当前快照 */ }
        const raw = await agentLlmClient.complete({
            label: '纳戒决定',
            system: settings.prompt,
            user: withPlayerNote(buildSelfDecideUser({ snapshot: decideSnapshot, floors, worldbookLines: bookLines, settleLines: settleVerdictLinesForDecide() }), note),
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
            selfDecidedFloor = { floor: selfReplyFloor, identity: selfReplyIdentity, continuation };
            persistSelf();
            return { status: 'empty', note: decision.note };
        }
        const result = agentSelfRuntime.apply(decision.ops, { source: 'decide', floor: selfReplyFloor, day: worldDay() });
        persistSelf();
        selfDecidedFloor = { floor: selfReplyFloor, identity: selfReplyIdentity, continuation };
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
        injectBudget: Number.isInteger(impact.injectBudget) && impact.injectBudget > 0 ? impact.injectBudget : 800,
        injectSmart: impact.injectSmart !== false,
        injectMaxLines: Number.isInteger(impact.injectMaxLines) && impact.injectMaxLines > 0 ? Math.min(20, impact.injectMaxLines) : 8,
        injectFloors: Number.isInteger(impact.injectFloors) && impact.injectFloors > 0 ? Math.min(12, impact.injectFloors) : Math.min(12, globalReadFloors()),
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
        decideMaxFloors: Number.isInteger(impact.decideMaxFloors) && impact.decideMaxFloors > 0 ? Math.min(12, impact.decideMaxFloors) : Math.min(12, globalReadFloors()),
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
        budget: Number.isInteger(budget) && budget > 0 ? budget : 900,
        maxFull: Number.isInteger(maxFull) && maxFull > 0 ? Math.min(20, maxFull) : 6,
        floors: Number.isInteger(floors) && floors > 0 ? Math.min(12, floors) : Math.min(12, globalReadFloors()),
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

/** 人物关系图跟着聊天走：换聊天读那一份，读不到就按空图开局。 */
function restoreNpcRelationsFromChat() {
    const record = hostStorage?.npcRelationsState?.();
    if (record?.status === 'ready' && record.value) return agentNpcRelations.restore(record.value);
    return agentNpcRelations.restore({ edges: [] });
}

function persistNpcRelations() {
    return Promise.resolve(hostStorage?.saveNpcRelationsState?.(agentNpcRelations.snapshot()) ?? { status: 'unavailable' })
        .catch(error => ({ status: 'failed', reason: String(error?.message ?? error) }));
}

/**
 * 把关系图的边解析成「档案姓名 → 一跳关系人显示名」的映射：冷藏扫描的事件匹配只认
 * 正文里的名字，别名/称号必须先折回主键姓名才能对上档案。
 */
function buildRelationsByPerson() {
    const records = agentNpcLedger.list();
    const lookup = new Map();
    for (const record of records) {
        for (const key of [record.name, ...record.aliases, ...record.titles]) {
            const clean = String(key ?? '').trim().toLowerCase();
            if (clean && !lookup.has(clean)) lookup.set(clean, record.name);
        }
    }
    const resolve = name => lookup.get(String(name ?? '').trim().toLowerCase()) ?? null;
    const map = {};
    for (const edge of agentNpcRelations.list()) {
        const from = resolve(edge.from);
        const to = resolve(edge.to);
        if (!from || !to || from === to) continue;
        if (!Array.isArray(map[from])) map[from] = [];
        if (!Array.isArray(map[to])) map[to] = [];
        if (!map[from].includes(to)) map[from].push(to);
        if (!map[to].includes(from)) map[to].push(from);
    }
    return map;
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
        floors: Number.isInteger(npc.ledgerFloors) && npc.ledgerFloors > 0 ? Math.min(12, npc.ledgerFloors) : Math.min(12, globalReadFloors()),
        prompt: typeof npc.coldPrompt === 'string' && npc.coldPrompt.trim() ? npc.coldPrompt.trim() : NPC_COLD_PROMPT,
    };
}

function npcColdOverrides(settings) {
    // 绑定了 API设置方案整套走方案；没绑＝跟随酒馆主连接。
    return presetOverrides('npcCold') ?? { connection: 'tavern' };
}

function coldFloors(limit) {
    const chat = Array.isArray(getHostContext()?.chat) ? getHostContext().chat : [];
    return impactConversation(chat, limit).then(result => result.floors);
}

let npcColdRunning = false;
/** 冷藏扫描的并发路数：多人同时推，比串行快几倍；路数放太宽容易顶到接口限流。 */
const NPC_COLD_CONCURRENCY = 3;

async function runNpcColdPreview() {
    const settings = npcColdSettings();
    if (!settings.enabled) { setNpcLedgerStatus('人物簿已关闭，冷藏人物不会推进。'); return { status: 'disabled' }; }
    if (npcColdRunning) return { status: 'busy' };
    if (settings.connection !== 'custom' && agentLlmClient.availableFor('tavern') !== true) {
        setNpcLedgerStatus('还没配好冷藏推进用的模型连接。');
        return { status: 'not_configured' };
    }
    const records = agentNpcLedger.list();
    // 关系一跳扩散：把全局关系图折成「姓名 → 一跳关系人」映射交给扫描，师徒/亲属出事也算牵连。
    const candidates = agentNpcColdRuntime.candidates({ day: worldDay(), records, worldSnapshot: agentWorldRuntime.snapshot(), floors: await coldFloors(settings.floors), relationsByPerson: buildRelationsByPerson() });
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
    const droppedForeign = [];
    try {
        // 有界并行：一次推 3 个人，每人仍带同款重试；结果按候选顺序回填，草稿顺序稳定。
        const results = await mapWithLimit(candidates, NPC_COLD_CONCURRENCY, async candidate => {
            try {
                const coldUser = buildNpcColdUser({ record: candidate.record, fromDay: candidate.fromDay, toDay: candidate.toDay, events: candidate.events, floors: candidate.floors, lastNote: candidate.lastNote });
                const raw = await agentLlmClient.complete({
                    label: '冷藏推进',
                    system: settings.prompt,
                    user: coldUser,
                    jsonSchema: NPC_RECORD_JSON_SCHEMA,
                    overrides: npcColdOverrides(settings),
                });
                if (!continuation.current()) return { status: 'stale' };
                let parsed = parseNpcRecordReply(raw);
                if (parsed.status !== 'ok') {
                    // 与记录员同款：坏输出退回重问一次，仍不行才记失败——草稿模式不会写坏账。
                    const retryRaw = await agentLlmClient.complete({
                        label: '冷藏推进重试',
                        system: settings.prompt + NPC_RECORD_RETRY_SYSTEM_NOTE,
                        user: buildRecordRetryUser({ user: coldUser, raw, reason: parsed.reason }),
                        jsonSchema: NPC_RECORD_JSON_SCHEMA,
                        overrides: npcColdOverrides(settings),
                    });
                    if (!continuation.current()) return { status: 'stale' };
                    const retryParsed = parseNpcRecordReply(retryRaw);
                    if (retryParsed.status === 'ok') parsed = retryParsed;
                }
                if (parsed.status !== 'ok') return { status: 'failed', name: candidate.name };
                // 模型写了名单外的人：丢弃并计数，不再把别人的字段并到目标头上。
                const { kept, droppedNames } = filterColdPatches(parsed.patches, candidate.record);
                const preview = { ...candidate, patch: { 人物: kept } };
                agentNpcColdRuntime.rememberPreview({ id: candidate.id, name: candidate.name, fromDay: candidate.fromDay, toDay: candidate.toDay, previousDay: candidate.previousDay, baseVersion: candidate.record.version, eventIds: candidate.eventIds, patch: preview.patch });
                return { status: 'ok', preview, droppedNames };
            } catch (error) {
                if (!continuation.current()) return { status: 'stale' };
                return { status: 'failed', name: `${candidate.name}（${error?.message ?? error}）` };
            }
        });
        if (!continuation.current()) return { status: 'stale' };
        for (const item of results) {
            if (!item || item.status === 'stale') { if (item) return { status: 'stale' }; continue; }
            if (item.status === 'ok') {
                previews.push(item.preview);
                if (item.droppedNames.length) droppedForeign.push(`${item.preview.name}：${item.droppedNames.join('、')}`);
            } else if (item.status === 'failed') {
                failed.push(item.name);
            }
        }
        persistNpcCold();
    } finally {
        if (npcColdRunning === continuation) npcColdRunning = false;
    }
    setNpcLedgerStatus(`冷藏草稿已生成 ${previews.length} 份${failed.length ? `；失败 ${failed.join('、')}` : ''}${droppedForeign.length ? `；丢弃名单外补丁 ${droppedForeign.join('；')}` : ''}。请逐份确认后才会写回人物簿。`);
    refreshNpcLedgerPage();
    return { status: 'previewed', previews, failed };
}

/** 补丁文本里提到的建档人物（含互写牵连到的）——确认前的撤销快照要把他们都罩住。 */
function namesMentionedInPatch(patch, records) {
    const body = JSON.stringify(patch ?? {}).toLowerCase();
    return (Array.isArray(records) ? records : [])
        .filter(record => [record?.name, ...(record?.aliases ?? []), ...(record?.titles ?? [])]
            .some(name => name && body.includes(String(name).toLowerCase())))
        .map(record => record.name);
}

function confirmNpcColdPreview(id) {
    const wanted = String(id || '').trim();
    const preview = agentNpcColdRuntime.status().previews.find(item => item.id === wanted && item.status === 'pending');
    if (!preview) return { status: 'not_found' };
    const validation = agentNpcColdRuntime.validatePreview(wanted, { recordVersion: agentNpcLedger.get(preview.name)?.version });
    if (validation.status !== 'ready') return validation;
    const patch = preview.patch && typeof preview.patch === 'object' ? preview.patch : { 人物: [] };
    // 撤销快照：确认前把补丁涉及（含互写牵连）的人物整档存一份，只保留最近一次。
    const undoRecords = {};
    for (const name of namesMentionedInPatch(patch, agentNpcLedger.list())) {
        const record = agentNpcLedger.get(name);
        if (record) undoRecords[name] = record;
    }
    // 流水逐条带 src:'冷藏'——档案流水页和不在场活动名单靠它区分“自行活动”与“正文记录”。
    const result = applyNpcLedgerPayload(patch, { source: '冷藏推进', floor: lastReplyIndex(getHostContext()?.chat || []), logSrc: '冷藏' });
    if (!['applied', 'ignored', 'empty'].includes(result.status)) return { status: 'failed', result };
    agentNpcColdRuntime.mark(preview.name, { previewId: wanted, day: preview.toDay, eventIds: preview.eventIds, floor: lastReplyIndex(getHostContext()?.chat || []), status: 'confirmed' });
    if (Object.keys(undoRecords).length) agentNpcColdRuntime.rememberUndo({ previewId: wanted, name: preview.name, day: preview.toDay, previousDay: preview.previousDay, records: undoRecords });
    persistNpcLedger();
    persistNpcCold();
    setNpcLedgerStatus(`已确认 ${preview.name} 的冷藏推进；人物簿已更新。确认错了可以点「撤销上次确认」退回。`);
    refreshNpcLedgerPage();
    return { status: 'confirmed', result };
}

/** 撤销最近一次冷藏确认：人物簿按快照原样退回，游标与草稿状态一并回滚。 */
function undoLastNpcColdConfirm() {
    const undo = agentNpcColdRuntime.getUndo();
    if (!undo) {
        setNpcLedgerStatus('没有可撤销的冷藏确认（只保留最近一次）。');
        return { status: 'nothing_to_undo' };
    }
    const restored = agentNpcLedger.restoreSnapshots(undo.records);
    if (!restored.restored?.length) {
        setNpcLedgerStatus('撤销失败：人物簿里已找不到当时的档案（可能已改名或清空）。');
        return { status: 'failed', restored };
    }
    const rolled = agentNpcColdRuntime.unmark(undo.previewId);
    agentNpcColdRuntime.clearUndo();
    persistNpcLedger();
    persistNpcCold();
    setNpcLedgerStatus(`已撤销 ${undo.name} 的最近一次冷藏确认：档案退回快照，游标回到第 ${rolled.status === 'unmarked' ? rolled.value.lastDay : undo.previousDay} 天，草稿回到待确认。`);
    refreshNpcLedgerPage();
    return { status: 'undone', rolled };
}

function discardNpcColdPreview(id) {
    const result = agentNpcColdRuntime.discard(id);
    persistNpcCold();
    setNpcLedgerStatus('已放弃这份冷藏草稿，人物簿没有变化。');
    refreshNpcLedgerPage();
    return result;
}

/* ── 经历精简的自动触发（reflection）────────────────────────
 * 经历是“重大转变”的追加清单，超过阈值就自动请模型出精简草稿；
 * 草稿停在人物簿页等确认——自动的只是“出草稿”，写回永远要人点头。 */

/** 经历条数越过这条线就自动触发精简（真上限 120，这里提前减负防溢出丢最旧条目）。 */
const NPC_EXP_AUTO_CONDENSE_THRESHOLD = 40;
/** 待确认的自动精简草稿：name → { entries, recordVersion, at }，确认/放弃后清掉。 */
const pendingAutoExpCondense = new Map();

async function runAutoExpCondense(names = []) {
    for (const rawName of names.slice(0, 3)) {
        const name = String(rawName ?? '').trim();
        if (!name || pendingAutoExpCondense.has(name)) continue;
        const group = agentNpcLedger.exps().find(item => item.name === name);
        if (!group || group.entries.length < NPC_EXP_AUTO_CONDENSE_THRESHOLD) continue;
        const settings = npcLedgerSettings();
        if (npcLedgerOverrides(settings, {}, 'npcExp').connection !== 'custom' && agentLlmClient.availableFor('tavern') !== true) break;
        const continuation = captureAgentContinuation();
        const recordVersion = JSON.stringify(agentNpcLedger.get(name));
        try {
            const raw = await agentLlmClient.complete({
                label: '经历精简',
                system: typeof currentSettings().npc?.expCondensePrompt === 'string' && currentSettings().npc.expCondensePrompt.trim()
                    ? currentSettings().npc.expCondensePrompt.trim() : EXP_CONDENSE_PROMPT,
                user: buildExpCondenseUser({ name: group.name, summary: agentNpcLedger.get(name)?.identity ?? '', entries: group.entries }),
                jsonSchema: { type: 'object', properties: { 经历: { type: 'array' } }, required: ['经历'] },
                overrides: npcLedgerOverrides(settings, { temperature: 0.2, maxTokens: 1600 }, 'npcExp'),
            });
            if (!continuation.current()) return;
            const parsed = parseExpCondenseReply(raw);
            if (parsed.status !== 'ok' || recordVersion !== JSON.stringify(agentNpcLedger.get(name))) continue;
            pendingAutoExpCondense.set(name, { entries: parsed.entries, recordVersion, continuation, at: new Date().toISOString() });
            recordAgentAudit({ event: 'npc_exp_auto_condense', outcome: `${name}：${group.entries.length} 条 → 草稿 ${parsed.entries.length} 条，待确认` });
        } catch { /* 精简失败不影响记账主链路 */ }
    }
    if (pendingAutoExpCondense.size) {
        setNpcLedgerStatus(`经历自动精简草稿已备好 ${pendingAutoExpCondense.size} 份（${[...pendingAutoExpCondense.keys()].join('、')}），在人物簿页确认后写回。`);
        try { refreshNpcLedgerPage(); } catch { /* 面板没开时忽略 */ }
    }
}

function confirmAutoExpCondense(name) {
    const clean = String(name ?? '').trim();
    const pending = pendingAutoExpCondense.get(clean);
    if (!pending || !pending.continuation?.current() || pending.recordVersion !== JSON.stringify(agentNpcLedger.get(clean))) {
        pendingAutoExpCondense.delete(clean);
        setNpcLedgerStatus('精简草稿已过期，请手动重跑；当前经历未修改。');
        refreshNpcLedgerPage();
        return { status: 'stale' };
    }
    const result = agentNpcLedger.replaceExp(clean, pending.entries);
    pendingAutoExpCondense.delete(clean);
    if (result.status === 'replaced') {
        persistNpcLedger();
        setNpcLedgerStatus(`${result.name} 的经历已自动精简写回：${result.before} 条 → ${result.after} 条。`);
    } else {
        setNpcLedgerStatus(`精简写回没有成功（${result.status}），经历保持原样。`);
    }
    refreshNpcLedgerPage();
    return result;
}

function discardAutoExpCondense(name) {
    const clean = String(name ?? '').trim();
    pendingAutoExpCondense.delete(clean);
    setNpcLedgerStatus(`已放弃 ${clean} 的自动精简草稿，经历保持原样。`);
    refreshNpcLedgerPage();
    return { status: 'discarded', name: clean };
}

/* ── 传闻触达（gossip）────────────────────────────────────
 * world 的 rumor 事件沿关系图跳一跳：不在场、但与传闻出场人物有一跳边的人会听到；
 * 模型按各自性格出微调补丁（好感限 ±3），先出草稿、逐条确认后走正常落账。 */

let npcGossipRunning = false;

/** 从世界台账收 rumor 事件（未了结的）：传播上限跟氛围走——平静少传、风波多传（calm 2 / rising 3 / storm 4）。 */
function collectRumorEvents() {
    const snapshot = agentWorldRuntime.snapshot();
    const events = [...(snapshot?.nearEvents ?? []), ...(snapshot?.worldEvents ?? [])];
    const rumorLimit = snapshot?.tension === 'storm' ? 4 : snapshot?.tension === 'rising' ? 3 : 2;
    return events.filter(event => event?.weight === 'rumor' && event?.done !== true)
        .map(event => ({ day: Number.isFinite(Number(event.day)) ? Number(event.day) : null, text: String(event.text ?? ''), basis: String(event.basis ?? '') }))
        .filter(event => event.text)
        .slice(0, rumorLimit);
}

/** 挑传闻目标：不在场、且与传闻正文提到的建档人物有一跳边；最多 6 人。 */
function selectGossipTargets(rumors) {
    const records = agentNpcLedger.list();
    const lookup = new Map();
    for (const record of records) {
        for (const key of [record.name, ...record.aliases, ...record.titles]) {
            const clean = String(key ?? '').trim().toLowerCase();
            if (clean && !lookup.has(clean)) lookup.set(clean, record.name);
        }
    }
    const mentioned = new Set();
    for (const rumor of rumors) {
        const body = rumor.text.toLowerCase();
        for (const [key, name] of lookup) if (body.includes(key)) mentioned.add(name);
    }
    if (!mentioned.size) return [];
    const targets = [];
    for (const record of records) {
        if (record.presence === '在场' || targets.length >= 6) continue;
        const heard = [];
        for (const edge of agentNpcRelations.forPerson(record.name)) {
            const other = edge.from === record.name ? edge.to : edge.from;
            if (!mentioned.has(other)) continue;
            for (const rumor of rumors) {
                if (!rumor.text.toLowerCase().includes(other.toLowerCase())) continue;
                heard.push({ from: other, via: `${edge.stance}${edge.relation ? `（${edge.relation}）` : ''}`, rumor: rumor.text });
                if (heard.length >= 3) break;
            }
            if (heard.length >= 3) break;
        }
        if (heard.length) targets.push({ record, heard });
    }
    return targets.slice(0, 6);
}

/** 传闻传播：出草稿弹窗，逐条确认写回；不做自动落账。 */
async function runNpcGossip(panel) {
    const settings = npcLedgerSettings();
    if (!settings.enabled) { setNpcLedgerStatus('人物簿已关闭，传闻不会传播。'); return { status: 'disabled' }; }
    if (npcGossipRunning) return { status: 'busy' };
    if (settings.connection !== 'custom' && agentLlmClient.availableFor('tavern') !== true) {
        setNpcLedgerStatus('还没配好模型连接：先在“模型设置”页选好连接，传闻传播才能跑。');
        return { status: 'not_configured' };
    }
    const rumors = collectRumorEvents();
    if (!rumors.length) { setNpcLedgerStatus('当前没有未了结的传闻事件，没有可传播的传闻。'); return { status: 'no_rumors' }; }
    const targets = selectGossipTargets(rumors);
    if (!targets.length) { setNpcLedgerStatus('传闻里没有牵连到有关系的不在场人物，本轮没有传播目标。'); return { status: 'no_targets' }; }
    const continuation = captureAgentContinuation();
    npcGossipRunning = true;
    setNpcLedgerStatus(`正在把 ${rumors.length} 条传闻传给 ${targets.length} 个不在场人物……`);
    try {
        const raw = await agentLlmClient.complete({
            label: '传闻传播',
            system: GOSSIP_PROMPT,
            user: buildGossipUser({ rumors, targets, day: worldDay() }),
            jsonSchema: NPC_RECORD_JSON_SCHEMA,
            overrides: npcLedgerOverrides(settings, { temperature: 0.4, maxTokens: 1200 }, 'npcLedger'),
        });
        if (!continuation.current()) return { status: 'stale' };
        let parsed = parseNpcRecordReply(raw);
        if (parsed.status !== 'ok') {
            const retryRaw = await agentLlmClient.complete({
                label: '传闻传播重试',
                system: GOSSIP_PROMPT + NPC_RECORD_RETRY_SYSTEM_NOTE,
                user: buildRecordRetryUser({ user: buildGossipUser({ rumors, targets, day: worldDay() }), raw, reason: parsed.reason }),
                jsonSchema: NPC_RECORD_JSON_SCHEMA,
                overrides: npcLedgerOverrides(settings, { temperature: 0.4, maxTokens: 1200 }, 'npcLedger'),
            });
            if (!continuation.current()) return { status: 'stale' };
            const retryParsed = parseNpcRecordReply(retryRaw);
            if (retryParsed.status === 'ok') parsed = retryParsed;
        }
        if (parsed.status !== 'ok') { setNpcLedgerStatus(`传闻补丁读不懂，没有传播：${parsed.reason}`); return { status: 'invalid', reason: parsed.reason }; }
        // 只认目标名单里的人 + 好感压回 ±3：传闻的动静本来就比当面交手小。
        // 补丁保持原始形状（中文键），确认后走 applyNpcLedgerPayload 统一归一化，不在这里预折叠。
        const allowed = new Set(targets.map(target => target.record.name.toLowerCase()));
        const patches = parsed.patches
            .filter(item => {
                const name = String(item?.姓名 ?? item?.name ?? '').trim();
                return name && allowed.has(name.toLowerCase());
            })
            .map(item => {
                const patch = { ...item };
                const favorRaw = Number(patch.好感 ?? patch.favor);
                if (Number.isFinite(favorRaw) && favorRaw !== 0) {
                    patch.好感 = Math.max(-GOSSIP_FAVOR_STEP_MAX, Math.min(GOSSIP_FAVOR_STEP_MAX, Math.round(favorRaw)));
                }
                return patch;
            });
        if (!patches.length) { setNpcLedgerStatus('模型判断这些人对传闻都波澜不惊，没有补丁。'); return { status: 'empty' }; }
        showGossipDrafts(panel, patches);
        setNpcLedgerStatus(`传闻补丁草稿 ${patches.length} 份已出，确认后才会写进人物簿。`);
        return { status: 'previewed', patches };
    } catch (error) {
        if (!continuation.current()) return { status: 'stale' };
        setNpcLedgerStatus(`传闻传播失败：${error?.message ?? error}`);
        return { status: 'failed', reason: String(error?.message ?? error) };
    } finally {
        npcGossipRunning = false;
    }
}

/** 传闻草稿弹窗：每份补丁一张卡，确认即走 applyNpcLedgerPayload(source='传闻') 落账。 */
function showGossipDrafts(panel, patches) {
    const dock = makeElement('div', 'dai-settings-card');
    const head = makeElement('div', 'dai-card-heading');
    head.append(makeElement('b', '', '传闻触达草稿'), makeElement('small', '', '不在场人物经关系人听到了传闻；逐份确认，确认即写进人物簿（流水标「传闻」）。'));
    dock.append(head);
    patches.forEach((patch, index) => {
        const name = String(patch.姓名 ?? patch.name ?? '').trim();
        const favorRaw = Number(patch.好感 ?? patch.favor);
        const favorBit = Number.isFinite(favorRaw) && favorRaw !== 0 ? `，好感 ${favorRaw > 0 ? '+' : ''}${favorRaw}` : '';
        const moodRaw = patch.情绪 ?? patch.mood ?? '';
        const moodBit = typeof moodRaw === 'string' && moodRaw.trim() ? `，情绪 ${moodRaw.trim()}` : '';
        const basis = String(patch.依据 ?? patch.basis ?? '').trim();
        const logLines = (Array.isArray(patch.流水) ? patch.流水 : [patch.流水]).filter(line => typeof line === 'string' && line.trim());
        const card = makeElement('div', 'dai-exp-preview');
        card.append(makeElement('p', 'dai-turn-result', `${name}${favorBit}${moodBit}${basis ? `｜依据：${basis}` : ''}`));
        for (const line of logLines) card.append(makeElement('p', 'dai-exp-entry', `流水：${line}`));
        const attitude = String(patch.态度 ?? patch.attitude ?? '').trim();
        if (attitude) card.append(makeElement('p', 'dai-exp-entry', `态度：${attitude}`));
        const actions = makeElement('div', 'dai-turn-actions');
        const confirm = makeElement('button', 'dai-run-button', '确认写回');
        confirm.type = 'button';
        confirm.dataset.npcGossipConfirm = String(index);
        const discard = makeElement('button', 'dai-secondary-button', '放弃');
        discard.type = 'button';
        discard.dataset.npcGossipDiscard = String(index);
        actions.append(confirm, discard);
        card.append(actions);
        dock.append(card);
    });
    dock.dataset.npcGossipPatches = JSON.stringify(patches);
    const close = makeElement('button', 'dai-secondary-button', '全部关闭');
    close.type = 'button';
    close.dataset.agentModalClose = '';
    dock.append(close);
    openAgentModal(panel, '传闻触达', dock, { wide: true });
}

/* ── 人物一致性体检────────────────────────────────────
 * 正文写完后的旁路小调用：档案 vs 正文，只报违反（OOC）不改账、不拦正文；
 * 自动档查“在场且重要”的前 3 人，手动档查全量在场人物。 */

let lastNpcConsistency = null;
let npcConsistencyRunning = false;

async function runNpcConsistencyCheck({ source = 'manual' } = {}) {
    const settings = npcLedgerSettings();
    if (!settings.enabled) return { status: 'disabled' };
    if (npcConsistencyRunning) return { status: 'busy' };
    if (settings.connection !== 'custom' && agentLlmClient.availableFor('tavern') !== true) {
        if (source === 'manual') setNpcLedgerStatus('还没配好模型连接：先在“模型设置”页选好连接，体检才能跑。');
        return { status: 'not_configured' };
    }
    const chat = Array.isArray(getHostContext()?.chat) ? getHostContext().chat : [];
    const rawFloors = [];
    for (let cursor = chat.length - 1; cursor >= 0 && rawFloors.length < 2; cursor -= 1) {
        const message = chat[cursor];
        if (!message || typeof message.mes !== 'string' || !message.mes.trim() || message.is_system === true) continue;
        rawFloors.unshift({ role: message.is_user === true ? '玩家' : '角色', text: message.mes });
    }
    if (!rawFloors.length) return { status: 'no_floors' };
    const floors = await cleanFloorEntries(rawFloors);
    const presentImportant = agentNpcLedger.list().filter(record => record.presence === '在场');
    const pool = source === 'auto'
        ? presentImportant.filter(record => record.importance === '重要').slice(0, 3)
        : presentImportant.slice(0, 6);
    if (!pool.length) return { status: 'no_targets' };
    const continuation = captureAgentContinuation();
    npcConsistencyRunning = true;
    if (source === 'manual') setNpcLedgerStatus(`正在给 ${pool.length} 个在场人物做一致性体检……`);
    try {
        const raw = await agentLlmClient.complete({
            label: '人物一致性体检',
            system: CONSISTENCY_PROMPT,
            user: buildConsistencyUser({ profiles: pool.map(record => ({ record })), floors, day: worldDay() }),
            jsonSchema: { type: 'object', properties: { 检查: { type: 'array' } }, required: ['检查'] },
            overrides: npcLedgerOverrides(settings, { temperature: 0.2, maxTokens: 1200 }, 'npcLedger'),
        });
        if (!continuation.current()) return { status: 'stale' };
        const parsed = parseConsistencyReply(raw);
        if (parsed.status !== 'ok') {
            if (source === 'manual') setNpcLedgerStatus(`体检输出读不懂：${parsed.reason}`);
            recordAgentAudit({ event: 'npc_consistency', outcome: `invalid:${parsed.reason}` });
            return { status: parsed.status, reason: parsed.reason };
        }
        lastNpcConsistency = { at: new Date().toISOString(), day: worldDay(), source, results: parsed.results };
        const violations = parsed.results.reduce((sum, item) => sum + item.violations.length, 0);
        recordAgentAudit({ event: 'npc_consistency', outcome: `${source}·checked:${pool.length}·violations:${violations}` });
        if (source === 'manual') setNpcLedgerStatus(violations ? `体检完成：发现 ${violations} 处疑似违反档案的描写，详见人物簿页体检卡。` : '体检完成：在场人物的描写都对得上档案。');
        try { refreshNpcLedgerPage(); } catch { /* 面板没开时忽略 */ }
        return { status: 'checked', results: parsed.results, violations };
    } catch (error) {
        if (!continuation.current()) return { status: 'stale' };
        if (source === 'manual') setNpcLedgerStatus(`体检失败：${error?.message ?? error}`);
        return { status: 'failed', reason: String(error?.message ?? error) };
    } finally {
        npcConsistencyRunning = false;
    }
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
    // crossWrite：自行活动（冷藏）的补丁流水提到其他已建档人物时，往对方流水里也记一条。
    const result = agentNpcLedger.apply(payload, { floor, day: worldDay(), source, logSrc, crossWrite: Boolean(logSrc) });
    if (result.status !== 'applied' && result.status !== 'ignored' && result.status !== 'empty') return result;
    if (result.created.length || result.changed || result.crossWritten.length || result.decayedMoods) result.persistence = persistNpcLedger();
    adoptNpcRelationsFromResult(result, source);
    for (const audit of result.audits ?? []) {
        try {
            recordAgentAudit({ event: 'npc_unbacked_change', outcome: `${audit.name}·${audit.kind}${audit.delta ? `·${audit.delta > 0 ? '+' : ''}${audit.delta}` : ''}·无依据` });
        } catch { /* 审计失败不影响落账 */ }
    }
    return result;
}

/**
 * 「对他人」改过的档案交上来的快照收进全局关系图（edges 表）。
 * 记录员 recordReply 主路径不走 applyNpcLedgerPayload，也要调这个——两条落账路共用一个收边口。
 */
function adoptNpcRelationsFromResult(result, source = '正文') {
    if (!result || !Array.isArray(result.relations) || !result.relations.length) return null;
    const edges = [];
    for (const item of result.relations) {
        for (const triple of item.triples ?? []) {
            if (!triple?.who) continue;
            edges.push({ from: item.from, to: triple.who, relation: triple.relation ?? '', attitude: triple.attitude ?? '', day: item.day, floor: item.floor, basis: source === '手填' ? '' : source });
        }
    }
    if (!edges.length) return null;
    const relationResult = agentNpcRelations.upsert(edges);
    if (relationResult.applied.length) {
        result.relationPersistence = persistNpcRelations();
        return relationResult;
    }
    return relationResult;
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
        const rawFloors = [];
        for (let cursor = chat.length - 1; cursor >= 0 && rawFloors.length < settings.floors; cursor -= 1) {
            const message = chat[cursor];
            if (!message || typeof message.mes !== 'string' || !message.mes.trim()) continue;
            if (message.is_system === true) continue;
            rawFloors.unshift({ role: message.is_user === true ? '玩家' : '角色', text: message.mes, isUser: message.is_user === true, depth: chat.length - 1 - cursor });
        }
        floors.push(...await cleanFloorEntries(rawFloors));
        const recordUser = buildNpcRecordUser({
            floors,
            records: agentNpcLedger.list(),
            day: worldDay(),
            worldbookLines: npcLedgerBookLines(floors),
            playerContext: npcPlayerContext(),
        });
        const raw = await agentLlmClient.complete({
            label: '人物记录',
            system: settings.prompt,
            user: recordUser,
            jsonSchema: NPC_RECORD_JSON_SCHEMA,
            overrides: npcLedgerOverrides(settings),
        });
        if (!continuation.current()) return { status: 'stale' };
        let parsed = parseNpcRecordReply(raw);
        // 解析失败自动重试一次：坏输出和拒绝原因退回模型重问（instructor 式 validate-retry），
        // 落账成功率比直接作废高得多；仍失败才放弃这一轮。
        if (parsed.status === 'invalid') {
            setNpcLedgerStatus(`记录员输出读不懂（${parsed.reason}），自动重试一次……`);
            const retryRaw = await agentLlmClient.complete({
                label: '人物记录重试',
                system: settings.prompt + NPC_RECORD_RETRY_SYSTEM_NOTE,
                user: buildRecordRetryUser({ user: recordUser, raw, reason: parsed.reason }),
                jsonSchema: NPC_RECORD_JSON_SCHEMA,
                overrides: npcLedgerOverrides(settings),
            });
            if (!continuation.current()) return { status: 'stale' };
            const retryParsed = parseNpcRecordReply(retryRaw);
            if (retryParsed.status === 'ok') parsed = retryParsed;
            else {
                setNpcLedgerStatus(`记录员重试后仍读不懂，档案没动：${retryParsed.reason}`);
                return { status: 'invalid', reason: retryParsed.reason };
            }
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
        // 记录员主路径也要收关系边：「对他人」改过的档案快照进全局关系图。
        try { adoptNpcRelationsFromResult(result, '正文'); } catch { /* 收边失败不影响落账 */ }
        lastNpcLedgerFloor = index;
        lastNpcLedgerReplyIdentity = replyIdentity;
        persistNpcLedger();
        const words = [];
        if (result.created.length) words.push(`新进 ${result.created.length} 人（${result.created.join('、')}）`);
        if (result.changed) words.push(`更新 ${result.changed} 人`);
        if (result.crossWritten?.length) words.push(`互写 ${result.crossWritten.length} 人`);
        if (result.skipped?.length) words.push(`跳过 ${result.skipped.length} 条`);
        if (result.audits?.length) words.push(`无依据大变动 ${result.audits.length} 处（已记审计）`);
        setNpcLedgerStatus(words.length ? `第 ${index + 1} 楼记完：${words.join('，')}。` : '这一轮没有人物变化。');
        try { refreshNpcLedgerPage(); } catch { /* 面板没开时忽略 */ }
        if (result.created?.length) {
            // 新建的人自动按世界书补全一次（只填空字段；填满或没条目自然收手，之后不再拉该人物的条目）。
            setTimeout(() => { if (continuation.current()) void runNpcLedgerExtract({ names: result.created.slice(0, 4) }); }, 1500);
        }
        // reflection 自动精简：这次写过「经历」且经历条数越过阈值的人，自动出精简草稿（确认后才写回）。
        const condenseNames = [...new Set((result.applied ?? []).filter(item => Array.isArray(item.fields) && item.fields.includes('经历')).map(item => item.name))]
            .filter(name => (agentNpcLedger.get?.(name)?.exp?.length ?? 0) >= NPC_EXP_AUTO_CONDENSE_THRESHOLD);
        if (condenseNames.length) setTimeout(() => { if (continuation.current()) void runAutoExpCondense(condenseNames); }, 2000);
        // 人物一致性体检（进阶版）：旁路小调用，只报违反档案的描写；改过档案的人才值得查。
        if (result.changed && npcLedgerSettings().consistencyAuto !== false && advancedMode()) setTimeout(() => { if (continuation.current()) void runNpcConsistencyCheck({ source: 'auto' }); }, 2500);
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
    // 注入前清一遍到期情绪：三天前的短期情绪不再占档案行；有清掉的就顺手存档。
    try {
        const decayed = agentNpcLedger.decayMoods(worldDay());
        if (decayed.pruned) persistNpcLedger();
    } catch { /* 情绪消散失败不影响注入 */ }
    const built = agentNpcLedger.injection({ budget: settings.budget, maxFull: settings.maxFull });
    // 二跳关系网（进阶版）：在场人物一圈的间接关系（盟友的敌人、师门的仇家）一行带进提示词。
    // 超出注入预算整段放弃——人物档案本身优先。
    if (built.text && Array.isArray(built.used) && built.used.length && settings.relationsInject !== false && advancedMode()) {
        try {
            const hopLines = agentNpcRelations.hopLines(built.used);
            if (hopLines.length) {
                const relationsBlock = `\n【人物关系网】${hopLines.join('；')}`;
                if (built.text.length + relationsBlock.length <= settings.budget + 200) {
                    built.text += relationsBlock;
                    built.chars = built.text.length;
                }
            }
        } catch { /* 关系注入失败不影响人物注入 */ }
    }
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
    // 好感刻度条：-100~100 渐变底 + 金色指针，一眼看出关系冷暖与位置。
    const favorBar = makeElement('span', 'dai-favor-bar');
    const favorMark = makeElement('i');
    favorMark.style.left = `${Math.max(0, Math.min(100, Math.round(((record.favor ?? 0) + 100) / 2)))}%`;
    favorBar.append(favorMark);
    favorBar.title = `好感 ${record.favor}${favorLabel(record.favor) ? `（${favorLabel(record.favor)}）` : ''}`;
    // 情绪 chips：短期情绪 + 剩余天数（三天 TTL），黄点=人物在图谱里的情绪标记同源。
    const moodChips = (Array.isArray(record.moods) ? record.moods : []).slice(0, 3).map(mood => {
        const day = Number(worldDay());
        const remain = Number.isFinite(Number(mood.expiresDay)) && Number.isFinite(day) ? Math.max(0, Number(mood.expiresDay) - day) : null;
        return makeElement('span', 'dai-mood-chip', `${mood.label}${remain !== null ? `·剩${remain}天` : ''}`);
    });
    const meta = makeElement('span', 'dai-npc-card-line is-muted');
    meta.textContent = [
        record.identity,
        [record.gender, record.age].filter(Boolean).join(''),
        record.location ? `@${record.location}` : '',
        favorLabel(record.favor) || '',
    ].filter(Boolean).join(' · ') || '（身份待补）';
    open.append(mark, name, meta, favor, favorBar, ...moodChips);
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
    renderNpcAutoCondenseChips(target);
    renderNpcRelationsCard(target);
    renderNpcConsistencyCard(target);
}

/** 自动精简草稿条：reflection 触发的草稿停在这里，确认/放弃各一枚按钮。 */
function renderNpcAutoCondenseChips(target) {
    const host = target.querySelector('[data-npc-exp-auto]');
    if (!host) return;
    if (!pendingAutoExpCondense.size) { host.replaceChildren(); return; }
    const wrap = makeElement('div', 'dai-turn-actions');
    for (const [name, pending] of pendingAutoExpCondense) {
        const chip = makeElement('span', 'dai-state-strip');
        chip.textContent = `${name} 的经历精简草稿（→ ${pending.entries.length} 条）`;
        const confirm = makeElement('button', 'dai-run-button', '确认写回');
        confirm.type = 'button';
        confirm.dataset.expAutoConfirm = name;
        const discard = makeElement('button', 'dai-secondary-button', '放弃');
        discard.type = 'button';
        discard.dataset.expAutoDiscard = name;
        wrap.append(chip, confirm, discard);
    }
    host.replaceChildren(wrap);
}

/* ── 人物关系网图谱 · 力导向版 ─────────────────────────
 * 参考 d3-force 的仿真模型手写零依赖实现：
 * 斥力（多体逆平方）+ 连线弹簧 + 向心引力 + 速度阻尼 + 碰撞推挤，rAF 逐帧沉降；
 * 自我中心布局：玩家钉在图心，NPC 自组织绕排；
 * 边编码：颜色=立场、粗细=强度、箭头=方向（谁认谁）、药丸标签=关系；
 * 节点=药丸（名字进节点）：金底=玩家、金边=在场、外虚环=重要、角标黄点=有情绪、
 * 虚线=未建档；hover 高亮邻域、拖拽钉住微调、点节点开档案（走面板既有委托）。 */

const NPC_REL_STANCE_COLORS = Object.freeze({
    '血亲': '#b39ddb', '师徒': '#b39ddb', '同门': '#b39ddb',
    '同盟': '#34d399', '友好': '#86efac',
    '中立': '#9ca3af', '警惕': '#fbbf24', '敌对': '#f87171',
});
const NPC_REL_STANCE_KEYS = Object.freeze(Object.keys(NPC_REL_STANCE_COLORS));
const REL_W = 520, REL_H = 340, REL_CX = REL_W / 2, REL_CY = REL_H / 2;
/** 拖拽/沉降后的节点位置按名字记住：面板刷新、开关聊天都不重排。 */
const npcRelGraphPositions = new Map();
const npcRelSim = { nodes: new Map(), alpha: 0, raf: 0, sig: '' };

function relPillWidth(name) {
    return Math.min(104, Math.max(50, [...String(name)].length * 13 + 20));
}

function relEnsureSimNode(def) {
    let node = npcRelSim.nodes.get(def.name);
    if (!node) {
        node = { x: def.x, y: def.y, vx: 0, vy: 0, pinned: !!def.isPlayer, r: def.w / 2 + 6, isPlayer: !!def.isPlayer };
        npcRelSim.nodes.set(def.name, node);
    } else {
        node.r = def.w / 2 + 6;
        if (def.isPlayer) node.pinned = true;
    }
    return node;
}

function relStepPhysics(simNodes, links, alpha) {
    const list = [...simNodes.values()];
    for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
            const p = list[i], q = list[j];
            let dx = q.x - p.x, dy = q.y - p.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 4) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
            const d = Math.sqrt(d2);
            const f = (3600 * alpha) / d2;
            const fx = (dx / d) * f, fy = (dy / d) * f;
            if (!p.pinned) { p.vx -= fx; p.vy -= fy; }
            if (!q.pinned) { q.vx += fx; q.vy += fy; }
        }
    }
    for (const link of links) {
        const dx = link.b.x - link.a.x, dy = link.b.y - link.a.y;
        const d = Math.hypot(dx, dy) || 1;
        const f = (d - link.rest) * 0.08 * alpha;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        if (!link.a.pinned) { link.a.vx += fx; link.a.vy += fy; }
        if (!link.b.pinned) { link.b.vx -= fx; link.b.vy -= fy; }
    }
    for (const node of list) {
        if (node.pinned) { node.vx = 0; node.vy = 0; continue; }
        node.vx += (REL_CX - node.x) * 0.012 * alpha;
        node.vy += (REL_CY - node.y) * 0.014 * alpha;
        node.vx *= 0.8; node.vy *= 0.8;
        node.x = Math.max(54, Math.min(REL_W - 54, node.x + Math.max(-16, Math.min(16, node.vx))));
        node.y = Math.max(36, Math.min(REL_H - 36, node.y + Math.max(-16, Math.min(16, node.vy))));
    }
    for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
            const p = list[i], q = list[j];
            const dx = q.x - p.x, dy = q.y - p.y;
            const d = Math.hypot(dx, dy) || 1;
            const minD = p.r + q.r + 12;
            if (d < minD) {
                const push = (minD - d) / 2;
                const fx = (dx / d) * push, fy = (dy / d) * push;
                if (!p.pinned) { p.x -= fx; p.y -= fy; }
                if (!q.pinned) { q.x += fx; q.y += fy; }
            }
        }
    }
}

/** 二次贝塞尔几何：按节点半径修剪起终点（箭头贴药丸边缘），返回路径与标签锚点。 */
function relEdgeGeometry(ax, ay, bx, by, ra, rb, bow) {
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const cx = (ax + bx) / 2 - (dy / len) * bow, cy = (ay + by) / 2 + (dx / len) * bow;
    const trim = (px, py, r) => {
        const ddx = cx - px, ddy = cy - py;
        const dl = Math.hypot(ddx, ddy) || 1;
        return { x: px + (ddx / dl) * Math.min(r, dl * 0.45), y: py + (ddy / dl) * Math.min(r, dl * 0.45) };
    };
    const s = trim(ax, ay, ra);
    const e = trim(bx, by, rb);
    return {
        d: `M ${s.x.toFixed(1)} ${s.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${e.x.toFixed(1)} ${e.y.toFixed(1)}`,
        mx: 0.25 * s.x + 0.5 * cx + 0.25 * e.x,
        my: 0.25 * s.y + 0.5 * cy + 0.25 * e.y,
    };
}

function relEnsureLoop(update, links, simNodes) {
    if (npcRelSim.raf || npcRelSim.alpha <= 0.02) return;
    const tick = () => {
        npcRelSim.alpha = Math.max(0, npcRelSim.alpha * 0.985);
        relStepPhysics(simNodes, links, Math.max(0.06, npcRelSim.alpha));
        update();
        if (npcRelSim.alpha <= 0.02) { npcRelSim.raf = 0; return; }
        npcRelSim.raf = requestAnimationFrame(tick);
    };
    npcRelSim.raf = requestAnimationFrame(tick);
}

function renderNpcRelationsGraph(target) {
    const host = target.querySelector('[data-npc-relations-graph]');
    if (!host) return;
    if (typeof document === 'undefined') { host.replaceChildren(); return; }
    const records = agentNpcLedger.list().slice(0, 14);
    const edges = agentNpcRelations.list();
    if (!records.length && !edges.length) {
        host.replaceChildren();
        if (npcRelSim.raf) { cancelAnimationFrame(npcRelSim.raf); npcRelSim.raf = 0; }
        return;
    }
    const svgNS = 'http://www.w3.org/2000/svg';
    const playerName = String(getHostContext()?.name1 ?? '').trim() || '玩家';
    const playerActive = edges.some(edge => edge.from === playerName || edge.to === playerName)
        || records.some(record => record.favor !== 0);
    const defsNodes = [];
    const byName = new Map();
    const addDef = def => { byName.set(def.name.toLowerCase(), def); defsNodes.push(def); };
    if (playerActive) addDef({ name: playerName, isPlayer: true, w: relPillWidth(playerName) + 12 });
    for (const record of records) if (!byName.has(record.name.toLowerCase())) addDef({ name: record.name, record, w: relPillWidth(record.name) });
    for (const edge of edges) for (const name of [edge.from, edge.to]) if (!byName.has(name.toLowerCase())) addDef({ name, ghost: true, w: relPillWidth(name) });
    // 初始位置：记住的优先，否则圆周铺开（仿真接手后会自组织）
    const ringCount = defsNodes.filter(def => !def.isPlayer).length;
    let ringIndex = 0;
    for (const def of defsNodes) {
        if (def.isPlayer) { def.x = REL_CX; def.y = REL_CY; }
        else {
            const angle = -Math.PI / 2 + (ringIndex / Math.max(1, ringCount)) * Math.PI * 2;
            const saved = npcRelGraphPositions.get(def.name);
            def.x = saved?.x ?? REL_CX + Math.cos(angle) * 122;
            def.y = saved?.y ?? REL_CY + Math.sin(angle) * 94;
            ringIndex += 1;
        }
    }
    const simNodes = new Map();
    for (const def of defsNodes) {
        const node = relEnsureSimNode(def);
        def.x = node.x; def.y = node.y;
        simNodes.set(def.name, node);
    }
    const links = [];
    for (const edge of edges) {
        const a = simNodes.get(edge.from), b = simNodes.get(edge.to);
        if (a && b) links.push({ a, b, rest: a.pinned || b.pinned ? 98 : 130 });
    }
    const sig = `${records.length}:${edges.length}:${playerActive}`;
    if (sig !== npcRelSim.sig) npcRelSim.alpha = Math.max(npcRelSim.alpha, 0.62);
    npcRelSim.sig = sig;
    if (npcRelSim.raf) { cancelAnimationFrame(npcRelSim.raf); npcRelSim.raf = 0; }
    // ── DOM ──
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${REL_W} ${REL_H}`);
    svg.classList.add('dai-rel-graph-svg');
    const defs = document.createElementNS(svgNS, 'defs');
    const grad = document.createElementNS(svgNS, 'linearGradient');
    grad.setAttribute('id', 'dai-rel-gold');
    grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0'); grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
    for (const [offset, color] of [['0%', '#f8e9b4'], ['55%', '#e3bc55'], ['100%', '#c9962e']]) {
        const stop = document.createElementNS(svgNS, 'stop');
        stop.setAttribute('offset', offset);
        stop.setAttribute('stop-color', color);
        grad.append(stop);
    }
    defs.append(grad);
    NPC_REL_STANCE_KEYS.forEach((stance, index) => {
        const marker = document.createElementNS(svgNS, 'marker');
        marker.setAttribute('id', `dai-rel-arrow-${index}`);
        marker.setAttribute('viewBox', '0 0 10 10');
        marker.setAttribute('refX', '8.5'); marker.setAttribute('refY', '5');
        marker.setAttribute('markerWidth', '6'); marker.setAttribute('markerHeight', '6');
        marker.setAttribute('orient', 'auto-start-reverse');
        const arrow = document.createElementNS(svgNS, 'path');
        arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
        arrow.setAttribute('fill', NPC_REL_STANCE_COLORS[stance]);
        marker.append(arrow);
        defs.append(marker);
    });
    svg.append(defs);
    // 边层
    const edgeEls = [];
    const showLabels = edges.length <= 12;
    for (const edge of edges) {
        const a = simNodes.get(edge.from), b = simNodes.get(edge.to);
        if (!a || !b) continue;
        const color = NPC_REL_STANCE_COLORS[edge.stance] ?? '#9ca3af';
        const stanceIndex = NPC_REL_STANCE_KEYS.indexOf(edge.stance);
        const path = document.createElementNS(svgNS, 'path');
        path.classList.add('dai-rel-edge');
        path.setAttribute('data-stance', edge.stance);
        if (stanceIndex >= 0) path.setAttribute('marker-end', `url(#dai-rel-arrow-${stanceIndex})`);
        svg.append(path);
        const labelText = `${edge.stance}${edge.relation ? `·${edge.relation}` : ''}`;
        const labelG = document.createElementNS(svgNS, 'g');
        labelG.classList.add('dai-rel-elabel');
        if (!showLabels) labelG.classList.add('is-dim');
        const rect = document.createElementNS(svgNS, 'rect');
        const labelW = [...labelText].length * 10.5 + 14;
        rect.setAttribute('x', String(-labelW / 2)); rect.setAttribute('y', '-9.5');
        rect.setAttribute('width', String(labelW)); rect.setAttribute('height', '19'); rect.setAttribute('rx', '9.5');
        rect.setAttribute('fill', 'rgba(16, 13, 8, 0.94)');
        rect.setAttribute('stroke', color);
        rect.setAttribute('stroke-width', '1');
        const text = document.createElementNS(svgNS, 'text');
        text.setAttribute('y', '3.5');
        text.setAttribute('fill', color);
        text.textContent = labelText;
        labelG.append(rect, text);
        svg.append(labelG);
        edgeEls.push({
            from: edge.from, to: edge.to, path, labelG,
            bow: edge.from.toLowerCase() < edge.to.toLowerCase() ? 18 : -18,
        });
    }
    // 节点层（药丸）
    const nodeEls = new Map();
    for (const def of defsNodes) {
        const h = def.isPlayer || def.record?.importance === '重要' ? 30 : 26;
        const g = document.createElementNS(svgNS, 'g');
        g.classList.add('dai-rel-node');
        if (def.isPlayer) g.classList.add('is-player');
        else if (def.ghost) g.classList.add('is-ghost');
        if (def.record) {
            if (def.record.importance === '重要') g.classList.add('is-important');
            if (def.record.presence === '在场') g.classList.add('is-present');
            if (Array.isArray(def.record.moods) && def.record.moods.length) g.classList.add('has-mood');
            g.dataset.npcLedgerOpen = def.name;
            g.setAttribute('role', 'button');
            g.setAttribute('tabindex', '0');
        }
        const rect = document.createElementNS(svgNS, 'rect');
        rect.setAttribute('x', String(-def.w / 2)); rect.setAttribute('y', String(-h / 2));
        rect.setAttribute('width', String(def.w)); rect.setAttribute('height', String(h));
        rect.setAttribute('rx', String(h / 2));
        g.append(rect);
        if (def.record?.importance === '重要' && !def.isPlayer) {
            const ring = document.createElementNS(svgNS, 'rect');
            ring.classList.add('dai-rel-ring');
            ring.setAttribute('x', String(-def.w / 2 - 4)); ring.setAttribute('y', String(-h / 2 - 4));
            ring.setAttribute('width', String(def.w + 8)); ring.setAttribute('height', String(h + 8));
            ring.setAttribute('rx', String(h / 2 + 4));
            g.append(ring);
        }
        const name = document.createElementNS(svgNS, 'text');
        name.classList.add('dai-rel-node-name');
        name.setAttribute('y', '1');
        name.textContent = def.name;
        g.append(name);
        const sub = document.createElementNS(svgNS, 'text');
        sub.classList.add('dai-rel-node-sub');
        sub.setAttribute('y', String(h / 2 + 12));
        sub.textContent = def.isPlayer ? '玩家' : def.ghost ? '未建档' : `好感 ${def.record.favor > 0 ? '+' : ''}${def.record.favor}`;
        g.append(sub);
        if (def.record && Array.isArray(def.record.moods) && def.record.moods.length) {
            const dot = document.createElementNS(svgNS, 'circle');
            dot.classList.add('dai-rel-mood-dot');
            dot.setAttribute('cx', String(def.w / 2 - 2));
            dot.setAttribute('cy', String(-h / 2));
            dot.setAttribute('r', '3.4');
            g.append(dot);
        }
        g.title = def.isPlayer ? `${def.name}（玩家）` : def.ghost ? `${def.name}（未建档）` : `${def.name}｜${def.record.presence}｜好感 ${def.record.favor}${favorLabel(def.record.favor) ? `（${favorLabel(def.record.favor)}）` : ''}｜点开档案，拖动微调`;
        nodeEls.set(def.name, g);
        svg.append(g);
    }
    // hover 高亮邻域
    const adjacency = new Map();
    for (const item of edgeEls) {
        for (const key of [item.from.toLowerCase(), item.to.toLowerCase()]) {
            if (!adjacency.has(key)) adjacency.set(key, []);
            adjacency.get(key).push(item);
        }
    }
    svg.addEventListener('pointerover', event => {
        const g = event.target.closest?.('.dai-rel-node');
        if (!g) return;
        const name = g.querySelector('.dai-rel-node-name')?.textContent ?? '';
        svg.classList.add('is-focus');
        g.classList.add('is-hi');
        for (const item of adjacency.get(name.toLowerCase()) ?? []) {
            item.path.classList.add('is-hi');
            item.labelG.classList.add('is-hi');
            item.labelG.classList.remove('is-dim');
        }
    });
    svg.addEventListener('pointerout', event => {
        if (!event.target.closest?.('.dai-rel-node')) return;
        svg.classList.remove('is-focus');
        svg.querySelectorAll('.is-hi').forEach(el => el.classList.remove('is-hi'));
        for (const item of edgeEls) if (edgeEls.length > 12) item.labelG.classList.add('is-dim');
    });
    // 拖拽：钉住 = 本帧由指针接管，松手交还物理；真拖过就吞 click 防误开档案
    let drag = null;
    let suppressClick = false;
    const svgPoint = event => {
        const rect = svg.getBoundingClientRect();
        return { x: (event.clientX - rect.left) / rect.width * REL_W, y: (event.clientY - rect.top) / rect.height * REL_H };
    };
    const update = () => {
        for (const [name, g] of nodeEls) {
            const s = simNodes.get(name);
            if (s) g.setAttribute('transform', `translate(${s.x.toFixed(1)},${s.y.toFixed(1)})`);
        }
        for (const item of edgeEls) {
            const a = simNodes.get(item.from), b = simNodes.get(item.to);
            if (!a || !b) continue;
            const geo = relEdgeGeometry(a.x, a.y, b.x, b.y, a.r - 4, b.r - 1, item.bow);
            item.path.setAttribute('d', geo.d);
            item.labelG.setAttribute('transform', `translate(${geo.mx.toFixed(1)},${geo.my.toFixed(1)})`);
        }
        for (const [name, s] of simNodes) npcRelGraphPositions.set(name, { x: s.x, y: s.y });
    };
    svg.addEventListener('pointerdown', event => {
        const g = event.target.closest?.('.dai-rel-node');
        if (!g) return;
        const name = g.querySelector('.dai-rel-node-name')?.textContent;
        const sim = name ? simNodes.get(name) : null;
        if (!sim) return;
        const point = svgPoint(event);
        drag = { name, sim, sx: point.x, sy: point.y, moved: false };
        sim.pinned = true;
        svg.setPointerCapture?.(event.pointerId);
    });
    svg.addEventListener('pointermove', event => {
        if (!drag) return;
        const point = svgPoint(event);
        if (!drag.moved && Math.hypot(point.x - drag.sx, point.y - drag.sy) < 4) return;
        drag.moved = true;
        drag.sim.x = Math.max(54, Math.min(REL_W - 54, point.x));
        drag.sim.y = Math.max(36, Math.min(REL_H - 36, point.y));
        drag.sim.vx = 0; drag.sim.vy = 0;
        npcRelSim.alpha = Math.max(npcRelSim.alpha, 0.38);
        update();
        relEnsureLoop(update, links, simNodes);
    });
    const endDrag = () => {
        if (drag) {
            if (!drag.sim.isPlayer) drag.sim.pinned = false;
            if (drag.moved) suppressClick = true;
        }
        drag = null;
    };
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('click', event => {
        if (!suppressClick) return;
        suppressClick = false;
        event.stopPropagation();
        event.preventDefault();
    }, true);
    update();
    host.replaceChildren(svg);
    relEnsureLoop(update, links, simNodes);
}

/** 关系网卡：图谱在上，明细与对称提醒收进折叠条，倒序排最近改过的。 */
function renderNpcRelationsCard(target) {
    const summary = target.querySelector('[data-npc-relations-summary]');
    const list = target.querySelector('[data-npc-relations-list]');
    if (!summary || !list) return;
    const status = agentNpcRelations.status();
    const edges = agentNpcRelations.list();
    const problems = agentNpcRelations.asymmetries();
    summary.textContent = status.total
        ? `关系边 ${status.total} 条${problems.length ? ` · 提醒 ${problems.length} 处` : ''}（存到当前聊天）`
        : '还没有关系边。记录员写「对他人」时自动收边；也可以在补丁里写。';
    renderNpcRelationsGraph(target);
    const items = [];
    for (const problem of problems.slice(0, 4)) {
        items.push(makeElement('p', 'dai-impact-edit', `⚠ ${problem.note}`));
    }
    for (const edge of edges.slice(0, 10)) {
        const dayBit = Number.isFinite(Number(edge.day)) ? `第${Number(edge.day)}天·` : '';
        items.push(makeElement('p', 'dai-impact-item', `${dayBit}${edge.from} —${edge.stance}${edge.relation ? `（${edge.relation}）` : ''}— ${edge.to}${edge.basis ? `｜${edge.basis}` : ''}`));
    }
    if (!items.length) items.push(makeElement('p', 'dai-impact-item', '图谱里还没有连线：记录员在正文里写下某人对某人的关系时，这里会自动长出边。'));
    list.replaceChildren(...items);
}

/** 体检卡：最近一次一致性体检的结果，只展示不拦正文。 */
function renderNpcConsistencyCard(target) {
    const summary = target.querySelector('[data-npc-consistency-summary]');
    const list = target.querySelector('[data-npc-consistency-list]');
    if (!summary || !list) return;
    if (!lastNpcConsistency) {
        summary.textContent = '还没有体检过。点「一致性体检」立即查一次；之后每次记账会自动查在场重要人物。';
        list.replaceChildren();
        return;
    }
    const violations = lastNpcConsistency.results.reduce((sum, item) => sum + item.violations.length, 0);
    summary.textContent = `上次体检：第 ${lastNpcConsistency.day} 天 · ${lastNpcConsistency.source === 'auto' ? '自动' : '手动'} · 发现 ${violations} 处疑似违反`;
    const items = [];
    for (const result of lastNpcConsistency.results) {
        for (const violation of result.violations) {
            items.push(makeElement('p', 'dai-impact-edit', `${result.name}·${violation.field || '人设'}：${violation.problem}${violation.quote ? `｜正文：「${violation.quote}」` : ''}`));
        }
    }
    if (!items.length) items.push(makeElement('p', 'dai-impact-item', '上一轮体检没有发现违反档案的描写。'));
    list.replaceChildren(...items);
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


/** 取“玩家这一轮说的话 + 最近几楼”，给挑选员判断这一幕的情境（默认 6 楼，可在设置里调）。
 *  楼层按主提示词同款口径套角色卡正则（被隐藏的块不进挑选员），因此是异步的。 */
async function impactConversation(chat, limit = 6) {
    const messages = Array.isArray(chat) ? chat : [];
    const want = Number.isInteger(limit) && limit > 0 ? Math.min(12, limit) : 6;
    const raws = [];
    for (let index = messages.length - 1; index >= 0 && raws.length < want; index -= 1) {
        const message = messages[index];
        if (!message || typeof message.mes !== 'string' || !message.mes.trim()) continue;
        if (message.is_system === true) continue;
        raws.unshift({ role: message.is_user === true ? '玩家' : '角色', text: message.mes.trim(), isUser: message.is_user === true, depth: messages.length - 1 - index });
    }
    const cleaned = await cleanFloorEntries(raws);
    const draft = cleaned.findLast(floor => floor.role === '玩家')?.text?.trim() ?? '';
    return { draft, floors: cleaned };
}

// 账本页面分页：库不设上限，页面上先画这么多，点“显示更多”再续，避免一次塞几千条把面板拖慢。
let impactShown = 100;
let impactArchiveShown = 60;
let impactReturnToLedger = false;

/** 叫挑选员：从账本里挑这一幕用得上的影响。失败时返回非 ok，由调用方回落到脚本挑选。 */
async function pickImpactsForPrompt({ snapshot, settings, chat }) {
    const plan = impactModelPlan(settings);
    if (plan.inject.connection !== 'custom' && agentLlmClient.availableFor('tavern') !== true) return { status: 'unavailable' };
    const { draft, floors } = await impactConversation(chat, settings.injectFloors);
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


// 世界影响注入与恢复（实现在 impact/impact-injection.js）：状态收在闭包里，
// 面板与门面通过 injectedIds()/lastState()/invalidate() 读写。
const agentImpactInjection = createImpactInjection({
    capture: captureAgentContinuation, impactSettings, channel: agentImpactPromptInjection,
    runtime: agentImpactRuntime, worldDay, getContext: getHostContext, conversation: impactConversation,
    modelPlan: impactModelPlan, scopeKey: settleScopeKey, roundKeyOf, currentSettings, injectionSettings,
    pick: pickImpactsForPromptByMode, buildFromPicks: buildImpactInjectionFromPicksDetail,
    buildFallback: buildImpactInjectionDetail, registerFailure: registerPregenFailure,
    renderLibrary: renderImpactLibrary,
});
const restoreImpactFromChat = createImpactRestore({
    syncLimits: syncImpactLimits, storage: () => hostStorage, runtime: agentImpactRuntime,
    worldDay, injection: agentImpactInjection,
});

// —— 简略版（lite）合并调用：备料三路并成一次「素材总挑选」，记账五路并成一次「总结算」。——
// 完整版每功能各一路的行为原样保留；apiMode() 决定走哪条路径，切换即时生效。

/** 当前调用版本：'full' = 完整版（每功能一路，进阶增强关闭）；'lite' = 简略版（合并调用，
 *  进阶增强关闭）；'advanced' = 进阶版（完整版逐路管线 + GitHub 系增强）。 */
function apiMode() {
    const mode = currentSettings().apiMode;
    return mode === 'lite' || mode === 'advanced' ? mode : 'full';
}

/** 进阶版口径：GitHub 系增强（骰子/正文核验/一致性体检/关系网注入/开局摘要/剧情决定/
 *  语义向量）只在进阶版生效；完整版/简略版下这些功能整体静默。各功能自己的开关仍然生效。 */
function advancedMode() {
    return apiMode() === 'advanced';
}

/** 功能读取楼层数：手动填了 readFloors 就用它；没填时默认跟随"当前角色卡自带、
 *  提示词侧整楼隐藏"正则的 minDepth（主模型能看几楼，功能调用就默认读几楼），
 *  卡上没有这类正则时回落 8。只看角色脚本，不看全局正则。 */
function globalReadFloors() {
    const value = Number(currentSettings().readFloors);
    if (Number.isInteger(value) && value > 0) return value;
    const context = getHostContext();
    const character = context?.characters?.[context?.characterId];
    const bound = regexHiddenFloorBound(character?.data?.extensions?.regex_scripts);
    return bound ?? 8;
}

/** 决定调用的世界书侧输入：直接拿原著资料本轮注入通道里的现成内容（选条流程的产物），
 *  决定调用自己不再翻世界书条目。生成结束时通道会先被清空、后置决定才开跑，
 *  所以选条写入成功时留一份正文快照，通道读空了就退回快照，保证决定调用真能读到。 */
let factsInjectedSnapshot = '';

function factsInjectedLines() {
    const value = getHostContext()?.extensionPrompts?.doupo_facts?.value;
    const text = (typeof value === 'string' ? value.trim() : '') || factsInjectedSnapshot;
    // 按行拆开再返回：决定调用的 MAX_BOOK_LINES 行数上限要真起作用，整段单元素会让截断形同虚设。
    return text ? text.split('\n').map(line => line.trim()).filter(Boolean) : [];
}

/** 人物簿已建档判定：条目是人物类且名字（含括号别名拆开）已建档时，原著设定不再重复注入。 */
function skipProfiledNpcEntryId(name) {
    return agentNpcLedger.find(name) === true;
}

function skipProfiledNpcEntry(entry) {
    if (entry?.category !== '人物' || !entry?.name) return false;
    const candidates = [entry.name, entry.name.replace(/[（(][^（()）]*[)）]/gu, '').trim()].filter(Boolean);
    return candidates.some(skipProfiledNpcEntryId);
}

/** 原著注入预算（与完整版 getSettingBudget 同源）：0 = 不限制；沙盒/关开关不在 lite 事实路径走到。 */
function liteSettingBudget() {
    const setting = currentSettings().setting ?? {};
    return {
        maxItems: Number.isInteger(setting.maxItems) && setting.maxItems > 0 ? setting.maxItems : 8,
        injectionBudget: Number.isInteger(setting.injectionBudget) && setting.injectionBudget > 0 ? setting.injectionBudget : 0,
    };
}

/** 挑选缓存键（与完整版影响注入签名同口径）：作用域+轮次键+全套设置+两本账的手改序号。 */
const litePickKeyOf = chat => JSON.stringify([
    settleScopeKey(), roundKeyOf(chat), currentSettings(),
    agentMemoryRuntime.manualVersion(), agentImpactRuntime.manualVersion(),
]);

/** 简略版素材总挑选的消费方开关：各功能自己的启用开关，拨了谁提示词里就带谁的路。 */
function litePickConsumers() {
    const settings = currentSettings();
    return {
        facts: settings.setting?.enabled !== false && settings.injection?.enabled !== false && !sandboxModeActive(),
        memory: settings.enableMemoryLedger !== false && settings.memory?.inject !== false
            && settings.memory?.recallEnabled !== false && settings.memory?.recallAuto !== false,
        impact: settings.enablePlayerImpact !== false && settings.impact?.enabled !== false
            && settings.impact?.inject !== false && settings.impact?.injectSmart !== false,
    };
}

/** 简略版总结算的各账闸门：与完整版各记账链同一套启用/自动开关。 */
function liteSettleGates() {
    const world = worldDecideSettings();
    const impact = impactSettings();
    const self = selfLedgerSettings();
    const memory = memorySettings();
    return {
        npc: npcLedgerSettings().enabled,
        world: world.enabled && world.auto,
        impact: impact.enabled && impact.decideEnabled && impact.decideAuto,
        self: self.enabled && self.decideEnabled && self.decideAuto,
        memory: memory.enabled && memory.decideEnabled && memory.decideAuto,
    };
}

const agentLitePick = createLitePick({
    mode: apiMode,
    keyOf: litePickKeyOf,
    worldDay, factsIndex: agentFactsIndex, sandboxActive: () => sandboxModeActive(),
    volumeOf: () => currentVolumeForWorld(),
    impactRecords: () => agentImpactRuntime.snapshot().records,
    memorySnapshot: () => agentMemoryRuntime.snapshot(),
    maxFloors: () => globalReadFloors(),
    maxEntries: () => 12,
    complete: args => agentLlmClient.complete(args),
    overrides: () => presetOverrides('litePick') ?? { connection: 'tavern' },
    onFailure: (channel, reason) => registerPregenFailure(channel, reason),
    consumers: litePickConsumers,
});

/** 影响注入的挑选依赖：简略版取素材总挑选里 impact 一节，完整版照旧单路场记挑选。 */
async function pickImpactsForPromptByMode({ snapshot, settings, chat }) {
    if (apiMode() !== 'lite') return pickImpactsForPrompt({ snapshot, settings, chat });
    const pick = await agentLitePick.run({ chat });
    if (pick.status === 'failed' || pick.status === 'no_input') return { status: 'empty', note: pick.note };
    const known = new Set((snapshot?.records ?? []).map(record => String(record.id)));
    const picks = pick.impact.map(String).filter(id => known.has(id));
    return picks.length ? { status: 'ok', picks } : { status: 'empty', note: pick.note };
}

const agentLiteSettle = createLiteSettle({
    mode: apiMode,
    getContext: getHostContext, lastReplyIndex, capture: captureAgentContinuation,
    available: () => agentLlmClient.availableFor('tavern'),
    complete: args => agentLlmClient.complete(args),
    overrides: () => presetOverrides('liteSettle') ?? { connection: 'tavern' },
    worldDay, factsIndex: agentFactsIndex, sandboxActive: () => sandboxModeActive(),
    volumeOf: () => currentVolumeForWorld(),
    floorsMax: () => Math.max(
        worldDecideSettings().maxFloors, selfLedgerSettings().maxFloors,
        memorySettings().maxFloors, npcLedgerSettings().floors,
    ),
    entriesMax: () => 12, // 原著候选匹配上限：固定默认（旧「世界书条目上限」设置已删除）
    settleLines: settleVerdictLinesForDecide,
    npc: {
        list: () => agentNpcLedger.list(),
        parse: parseNpcRecordReply,
        apply: (patches, context) => agentNpcLedger.recordReply(patches, context),
        persist: persistNpcLedger, refresh: () => refreshNpcLedgerPage(), status: setNpcLedgerStatus,
    },
    world: {
        parse: parseDecision,
        snapshotText: () => buildWorldInjection(agentWorldRuntime.snapshot()),
        apply: (ops, context) => agentWorldRuntime.apply(ops, context),
        note: (text, options) => agentWorldRuntime.note(text, options),
        persist: persistWorld, refresh: () => refreshWorldPage(), status: setWorldDecideStatus,
    },
    impact: {
        parse: parseImpactDecision,
        records: () => agentImpactRuntime.snapshot().records,
        apply: (ops, context) => agentImpactRuntime.apply(ops, context),
        note: (text, options) => agentImpactRuntime.note(text, options),
        persist: persistImpact, refresh: () => renderImpactLibrary(), status: setImpactStatus,
    },
    self: {
        parse: parseSelfDecision,
        snapshot: () => agentSelfRuntime.snapshot(),
        baselineForFloor: floor => agentSelfRuntime.baselineForFloor(floor),
        snapshotText: snapshot => buildSelfInjection(snapshot, { maxChars: 1600, withIds: true }),
        apply: (ops, context) => agentSelfRuntime.apply(ops, context),
        note: (text, options) => agentSelfRuntime.note(text, options),
        persist: persistSelf, refresh: () => refreshSelfPage(), status: setSelfDecideStatus,
    },
    memory: {
        settings: memorySettings,
        snapshot: () => agentMemoryRuntime.snapshot(),
        parse: parseMemoryDecision,
        capOps: capRememberOps,
        apply: (ops, context) => agentMemoryRuntime.apply(ops, context),
        consolidate: args => agentMemoryRuntime.consolidate(args),
        note: (text, options) => agentMemoryRuntime.note(text, options),
        persist: persistMemory, refresh: () => refreshMemoryPage(),
        status: setMemoryDecideStatus, consolidateStatus: setMemoryConsolidateStatus,
    },
    runConsolidation: options => void runMemoryConsolidation(options),
    onNpcCreated: names => void runNpcLedgerExtract({ names }),
    audit: note => recordAgentAudit({ event: 'turn_lite_settle', outcome: note }),
    // 各功能自己的启用/自动开关逐节生效：关了哪个，总结算就不落哪本账（与完整版各链的闸门同口径）。
    gates: liteSettleGates,
});

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
    // 剧情前瞻：滚动方向 + 未回收线索，紧跟世界现状之后，两路互不清空。
    try { writePlotInjectionForPrompt(); } catch { /* 剧情注入失败不影响正文生成 */ }
    try { await agentImpactInjection.write({ chat }); } catch { /* 影响库注入失败不影响正文生成 */ }
    if (!continuation.current()) return { status: 'stale' };
    // 人物档案与影响库同属“这一局已经发生成什么样”，排在原著设定之前写，预算各算各的。
    try { writeNpcLedgerInjectionForPrompt(); } catch { /* 人物簿注入失败不影响正文生成 */ }
    // 纳戒：主角自身状态，与上面四路互不清空、预算各算各的。
    try { writeSelfInjectionForPrompt(); } catch { /* 纳戒注入失败不影响正文生成 */ }
    // 记忆：召回决定（或关键词兜底）挑出的旧记忆，排在纳戒之后；与其它通道互不清空、预算各算各的。
    try { await writeMemoryInjectionForPrompt({ chat }); } catch { /* 记忆注入失败不影响正文生成 */ }
    // 开局摘要：切聊天后的第一条回复前交底一次（门闩没命中就是空操作）。
    try { writeWakeUpInjectionForPrompt({ chat }); } catch { /* 开局摘要失败不影响正文生成 */ }
    if (!continuation.current()) return { status: 'stale' };
    const settings = injectionSettings();
    if (!settings.enabled) { agentPromptInjection.clear(); factsInjectedSnapshot = ''; return { status: 'disabled' }; }
    if (sandboxModeActive()) {
        // 沙盒口径不用世界书：设定挑选整条跳过（少一次模型调用），同一条注入通道改写内置斗气大陆基线。
        const probe = agentPromptInjection.inspect();
        if (probe.status !== 'ready') return probe;
        factsInjectedSnapshot = '';
        const writeResult = agentPromptInjection.write({ text: SANDBOX_WORLD_PROMPT, usedIds: [] }, { depth: settings.depth, maxChars: settings.maxChars });
        persistFactsLastInjection();
        return writeResult;
    }
    const probe = agentPromptInjection.inspect();
    if (probe.status !== 'ready') return probe;
    const messages = Array.isArray(chat) ? chat : (getHostContext()?.chat ?? []);
    let input = '';
    const recent = [];
    {
        let rawInput = null;
        const rawRecents = [];
        for (let index = messages.length - 1; index >= 0; index -= 1) {
            const message = messages[index];
            if (!message || typeof message.mes !== 'string' || !message.mes.trim()) continue;
            if (message.is_user === true) { if (rawInput === null) rawInput = { text: message.mes.trim(), depth: messages.length - 1 - index }; continue; }
            if (message.is_system === true) continue;
            if (rawRecents.length < 2) rawRecents.unshift({ text: message.mes, depth: messages.length - 1 - index });
            if (rawInput !== null && rawRecents.length >= 2) break;
        }
        const [cleanedInput, cleanedRecents] = await Promise.all([
            rawInput ? cleanFloorText({ mes: rawInput.text, is_user: true }, rawInput.depth) : Promise.resolve(''),
            Promise.all(rawRecents.map(entry => cleanFloorText({ mes: entry.text, is_user: false }, entry.depth))),
        ]);
        input = cleanedInput.trim();
        recent.push(...cleanedRecents.filter(text => text.trim()));
    }
    if (!input) { agentPromptInjection.clear(); factsInjectedSnapshot = ''; return { status: 'no_input' }; }
    let resolved = null;
    if (apiMode() === 'lite') {
        // 简略版：原著选条并进素材总挑选（同一次调用），本地按预算组装注入文本。
        // 失败由总挑选统一登记，这里安静返回空——拦截器会因备料失败终止本次正文调用。
        const pick = await agentLitePick.run({ chat: messages });
        if (!continuation.current()) return { status: 'stale' };
        if (!['failed', 'no_input'].includes(pick.status) && pick.facts.length) {
            const budget = liteSettingBudget();
            const needs = pick.facts.map(uid => ({ id: String(uid), layer: 'full' }))
                .filter(item => {
                    const entry = agentFactsIndex.get?.(Number(item.id)) ?? agentFactsIndex.get?.(item.id);
                    return !(entry && skipProfiledNpcEntry(entry));
                })
                .slice(0, budget.maxItems);
            const assembled = agentSettingSupply.assemble(needs, { budget: budget.injectionBudget, volume: null });
            if (assembled.text) resolved = { text: assembled.text, usedIds: assembled.usedIds, note: pick.note };
        }
    } else {
        try {
            resolved = await agentTurnStages.resolveInjection({ input, recentTexts: recent, ...currentAgentScope() });
        } catch (error) {
            // 选条 API 挂了也要登记：拦截器会终止本次正文调用，不能拿没有原著设定的提示词硬生成。
            registerPregenFailure('原著选条', error?.message ?? error);
        }
    }
    if (!continuation.current()) return { status: 'stale' };
    lastLookupInfo = resolved?.lookup ? { ...resolved.lookup, secondCall: resolved.secondCall === true } : null;
    if (!resolved?.text) { agentPromptInjection.clear(); factsInjectedSnapshot = ''; persistFactsLastInjection(); return { status: resolved?.status ?? 'empty' }; }
    const writeResult = agentPromptInjection.write(resolved, { depth: settings.depth, maxChars: settings.maxChars });
    factsInjectedSnapshot = writeResult?.status === 'injected' && typeof resolved?.text === 'string' ? resolved.text.trim() : '';
    persistFactsLastInjection();
    try { recordAgentAudit({ event: 'turn_facts_inject', outcome: String(writeResult?.status ?? 'unknown') }); } catch { /* 审计失败不影响注入 */ }
    return writeResult;
}

// —— 行动结算·最终判定：六路注入都写完后直判本轮行动，结果写进 doupo_action 通道 ——

let lastSettleAdjudication = null;
const settleSession = createSettleSession();
// 难度+骰子判定的随机源：进程级一份；掷骰结果记进行动 dice 字段，可追溯不落盘。
const settleDiceRng = createSettleDiceRng();
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

/** 结算这轮为什么没跑：开关全开但被沙盒口径挡住＝环境不支持（面板明说原因，省得玩家对开关排查）；
 *  开关真的关着＝已关闭。settleEnabled() 为 true 时返回 null。 */
function settleBlockerStatus() {
    if (settleEnabled()) return null;
    const settings = currentSettings();
    const switchesOn = settleExtensionEnabled && settings.enabled !== false
        && settings.enableActionResolution !== false && settleSettings().resultEnabled;
    return switchesOn && sandboxModeActive() ? 'unsupported' : 'disabled';
}

// —— 结算记录：面板「行动结算」卡与悬浮球共用（仿记忆注入的持久化模式） ——

function settleAdjudicationView() {
    return lastSettleAdjudication ? { ...lastSettleAdjudication } : null;
}

/** 给各决定链喂料用的本轮结算裁定行：结算判过成败与后果，决定链就必须照着记，
 *  不能照玩家输入想当然（实测出现过结算判"买药失败"、纳戒决定却记"金币购得"）。
 *  只取本轮已注入的判定；没有结算/已作废时返回空数组（喂料里就不出现这一节）。 */
function settleVerdictLinesForDecide() {
    const record = lastSettleAdjudication;
    if (!record || record.status !== 'injected' || record.cleared) return [];
    const actions = Array.isArray(record.actions) ? record.actions : [];
    const lines = [];
    for (const action of actions) {
        if (!action || typeof action !== 'object') continue;
        const label = String(action.label ?? action.category ?? '行动').slice(0, 30);
        const status = SETTLE_ACTION_STATUS_TEXT[action.status] ?? String(action.status);
        const dice = action.dice && typeof action.dice === 'object' ? action.dice : null;
        const diceText = dice && Number.isFinite(dice.die)
            ? `（骰${dice.die}${Number(dice.modifier) >= 0 ? '+' : ''}${Number(dice.modifier) || 0} 对难度 ${dice.dc ?? '?'}）`
            : '';
        const outcome = String(action.outcome ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
        lines.push(`- ${label}：${status}${diceText}${outcome ? `；${outcome}` : ''}`);
    }
    return lines;
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
            if (action.dice) lines.push(`   判定：骰 ${action.dice.die}${action.dice.modifier >= 0 ? '+' : ''}${action.dice.modifier} 对难度 ${action.dice.dc}（${SETTLE_DIFFICULTY_LABELS[action.dice.difficulty] ?? '常规'}）→ ${SETTLE_ACTION_STATUS_TEXT[action.dice.status] ?? action.dice.status}${action.dice.override ? '（推翻模型判定）' : ''}`);
            for (const consequence of action.consequences ?? []) lines.push(`   后果：${consequence}`);
            for (const effect of action.effects ?? []) {
                const value = effect.type === 'set' ? `→ ${effect.value}` : `${Number(effect.value) >= 0 ? '+' : ''}${effect.value}`;
                lines.push(`   待落账：${effect.name || effect.itemId || effect.field} ${value}`);
            }
            for (const item of action.rejected ?? []) lines.push(`   拒收：${typeof item === 'string' ? item : item.reason ?? '规则未通过'}`);
            if (action.blockedReason) lines.push(`   原因：${action.blockedReason}`);
        }
        if (record.oracle) lines.push(`变数：${record.oracle.title}（${record.oracle.detail}）`);
        if (record.retried) lines.push('本轮经过一次带错重试后判定成功。');
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

/** 同一份只读材料供自动注入与手动预览使用；不在这里触发额外召回调用。
 *  楼层要套角色卡正则（异步），因此本函数也是异步的。 */
async function collectSettleMaterials(chat = null) {
    const sourceChat = Array.isArray(chat) ? chat : (getHostContext()?.chat ?? []);
    const userFloor = sourceChat.findLastIndex(message => message?.is_user === true && typeof message.mes === 'string' && message.mes.trim());
    const input = userFloor >= 0 ? sourceChat[userFloor].mes.trim() : '';
    // 手动重判也只能读到玩家输入为止，不能把该输入的旧AI回复当成既定结果。
    const { floors } = await impactConversation(userFloor >= 0 ? sourceChat.slice(0, userFloor + 1) : [], 6);
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
    const system = `${settings.resultPrompt}\n\n【用户另行配置的类别补充规则，输出格式仍服从 v2】\n${SETTLE_CATEGORIES.filter(category => currentSettings().settle?.prompt?.[category.id]?.trim()).map(category => `${category.id}：${settings.promptFor(category.id)}`).join('\n\n') || '无，采用自适应默认规则'}\n\n【自定义类别，仅叙事扩展，不扩大字段权限】\n${customRules || '无'}\n\n【当前运行契约 v2】一次调用按明确行动输出 version:2、actions 数组；每项有 id/category/evidence/dependsOn/status/outcome/consequences/effects，并附 difficulty 与 modifiers——成败由脚本掷骰裁定（只降不升），你只报风险档位与带依据的修正；consequences 支持对象写法 {type,grade,text}。无真实数值不编精确变化，有文字结果也可 effects:[]。类别旧模板中的单结果格式不覆盖本契约。`;
    if (system.length > 24000) throw new RangeError('结算提示词和自定义规则合计超过 24000 字符；本轮不截断规则、不发起不完整判定');
    const scope = settleScopeKey();
    const liveChat = getHostContext()?.chat ?? [];
    const liveGuard = liveChat.slice(-6).map(message => [message?.is_user, message?.is_system, message?.mes, message?.swipe_id]);
    const fingerprint = JSON.stringify({ scope, user, system, state, overrides: settings.resultOverrides, connection: currentSettings().llm, day: worldDay(), userFloor, liveLength: liveChat.length, liveGuard });
    // npcs 供骰子裁定做战斗最低难度（证据点名的对手境界差抬档），不进本地审核快照。
    return { input, state, settings, user, system, scope, fingerprint, userFloor, chatLength: sourceChat.length, npcs: contextState.npcs ?? [] };
}

/** 预览不占用正文通道；自动生成只写审核后的多行动结果。 */
async function writeSettleAdjudicationForPrompt({ chat = null, force = false, preview = false } = {}) {
    if (preview && agentLlmClient.isQuietBusy()) return { status: 'busy' };
    if (!settleEnabled()) {
        settleSession.invalidate();
        const cleared = agentActionPromptInjection.clear();
        const blocked = settleBlockerStatus();
        recordSettleAdjudication({ status: blocked, actions: [],
            summary: blocked === 'unsupported' ? '沙盒口径下行动结算不参与；切回正式口径后恢复' : '开关已关闭，本轮不调用不注入',
            at: Date.now(), cleared: cleared.status === 'cleared', scope: settleScopeKey() });
        return { status: blocked };
    }
    let token;
    let materials;
    const scope = settleScopeKey();
    try {
        materials = await collectSettleMaterials(chat);
        if (!materials.input) {
            settleSession.invalidate();
            const cleared = agentActionPromptInjection.clear();
            recordSettleAdjudication({ status: 'no_input', actions: [], at: Date.now(), cleared: cleared.status === 'cleared', scope });
            return { status: 'no_input' };
        }
        // 轮次键（结算可见历史＝用户楼层及之前的逐层内容）进会话缓存：重roll或备料重试时
        // 这段没变就直接复用，指纹里的账本漂移（上轮后置链落账）与换 swipe 不再触发重调
        // ——判定属于玩家输入及其上下文，不属于正文。
        const settleRoundChat = Array.isArray(chat) ? chat : (getHostContext()?.chat ?? []);
        const attempt = settleSession.begin({
            scope,
            fingerprint: `${preview ? 'preview' : 'inject'}|${materials.fingerprint}`,
            roundKey: `${preview ? 'preview' : 'inject'}|${settleRoundKeyOf(settleRoundChat, materials.userFloor)}`,
            force,
        });
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
        const fresh = await collectSettleMaterials(chat);
        if (fresh.fingerprint !== materials.fingerprint) {
            settleSession.fail(token);
            recordSettleAdjudication({ status: 'stale', actions: [], summary: '等待期间上下文、状态或规则已变化，旧结果未注入', at: Date.now(), cleared: true, scope });
            return { status: 'stale' };
        }
        let parsed = parseSettleResult(raw);
        // 带错重试（instructor 模式）：坏 JSON/契约缺失把诊断喂回去重判一次；还坏才作废本轮。
        let retried = false;
        if (parsed.status === 'invalid') {
            const retryUser = buildSettleRetryUser(materials.user, parsed);
            if (retryUser && settleSession.isCurrent(token) && settleEnabled() && scope === settleScopeKey()) {
                const retryRaw = await agentLlmClient.complete({ label: '行动结算重试', rawPrompt: true, system: materials.system, user: retryUser, overrides: materials.settings.resultOverrides });
                if (!settleSession.isCurrent(token) || !settleEnabled() || scope !== settleScopeKey()) return { status: 'stale' };
                const retryFresh = await collectSettleMaterials(chat);
                if (retryFresh.fingerprint !== materials.fingerprint) {
                    settleSession.fail(token);
                    recordSettleAdjudication({ status: 'stale', actions: [], summary: '重试期间上下文、状态或规则已变化，旧结果未注入', at: Date.now(), cleared: true, scope });
                    return { status: 'stale' };
                }
                parsed = parseSettleResult(retryRaw);
                retried = parsed.status !== 'invalid';
            }
        }
        if (parsed.status === 'invalid') throw new Error(parsed.error ?? '判定结果不是有效 JSON');
        // 难度+骰子裁定（只降不升，进阶版）在解析归一后、行动审核前应用；战斗对手境界差自动抬最低档，
        // 波折轮掷一次变数 Oracle。进阶版关着或骰子开关关掉＝旧契约行为（不掷骰、无变数、无保底代价）。
        // 降级后的失败/部分成功由既有审核规则照常复核效果。
        const diceOn = settleSettings().diceEnabled !== false && advancedMode();
        const reviewed = reviewSettleEffects(parsed, materials.state, {
            input: materials.input, customCategories: materials.settings.customCategories,
            ...(diceOn ? { dice: { rng: settleDiceRng, npcs: materials.npcs, playerRealm: materials.state?.player?.realm } } : {}),
        });
        const text = renderSettleInjection(reviewed);
        const record = {
            ...reviewed, version: 2, at: Date.now(), scope, userFloor: materials.userFloor, userInput: materials.input,
            ...(retried ? { retried: true } : {}),
            replyBefore: JSON.stringify((getHostContext()?.chat ?? []).slice(materials.userFloor + 1).filter(message => message?.is_user !== true && message?.is_system !== true && message?.mes).map(message => [message.mes, message.swipe_id])),
            reconciliation: { status: reviewed.effects.length ? 'pending' : 'not_applicable', differences: [] },
        };
        const applied = applyResult(record, text);
        if (applied.status === 'write_failed') settleSession.fail(token);
        else settleSession.finish(token, applied);
        return { status: applied.status, actions: reviewed.actions.length, retried };
    } catch (error) {
        // 已被替代或换聊天的请求不能清掉新请求的通道，也不能写入新聊天记录。
        if (scope !== settleScopeKey() || (token && !settleSession.isCurrent(token))) return { status: 'stale' };
        if (token) settleSession.fail(token);
        const cleared = preview ? { status: 'preview' } : agentActionPromptInjection.clear();
        recordSettleAdjudication({ status: 'error', actions: [], summary: `判定失败：${error?.message ?? error}`, at: Date.now(), cleared: cleared.status === 'cleared', scope });
        return { status: 'error', error: String(error?.message ?? error) };
    }
}

// —— 备料失败登记：用户输入后的备料 API（记忆召回/原著选条/场记挑选/行动结算）若失败，
//  直接终止本次正文调用，绝不让残缺提示词去生成；页面上不弹报错，状态看悬浮球总控
//  （失败那路打叉）。重试入口就是再发一次消息或再重roll：已成功的备料走轮次缓存复用，
//  只重调失败的那几路，全部成功才放行正文。每次生成的拦截器开头清空。 ——
let pregenFailures = [];

function registerPregenFailure(channel, reason) {
    pregenFailures.push({ channel, reason: String(reason ?? '').slice(0, 400) });
}

/** SillyTavern calls this global (declared in manifest.json) before every real generation. */
globalThis.doupoFactsInterceptor = async function doupoFactsInterceptor(chat, contextSize, abort, type) {
    if (type === 'quiet') return;
    pregenFailures = [];
    try {
        await prepareInjectionForPrompt({ chat, contextSize });
    } catch (error) {
        try { console.warn(`[${EXTENSION_ID}] 原著设定注入失败`, error); } catch { /* 记录失败不影响生成 */ }
    }
    // 行动结算排在最后：它要读六路通道的当轮文本做上下文，缺了哪路就按空处理，不阻塞生成。
    // 完整版/简略版都走这一条独立判定调用；简略版在它之前只多跑一次素材总挑选。
    if (apiMode() === 'lite') {
        try { await agentLitePick.run({ chat }); } catch { /* 挑选失败已在其内部登记 */ }
    }
    try {
        const settleOutcome = await writeSettleAdjudicationForPrompt({ chat });
        try { recordAgentAudit({ event: 'turn_settle_adjudicate', outcome: `${settleOutcome?.status ?? 'unknown'}${Number.isInteger(settleOutcome?.actions) ? `·${settleOutcome.actions}项` : ''}${settleOutcome?.retried ? '·重试' : ''}` }); } catch { /* 审计失败不影响结算 */ }
        if (settleOutcome?.status === 'error' || settleOutcome?.status === 'write_failed') {
            registerPregenFailure('行动结算', settleOutcome.error ?? settleOutcome.status);
        }
    } catch (error) {
        registerPregenFailure('行动结算', error?.message ?? error);
        try { recordAgentAudit({ event: 'turn_settle_adjudicate', outcome: 'error' }); } catch { /* 审计失败不影响结算 */ }
        try { console.warn(`[${EXTENSION_ID}] 行动结算失败`, error); } catch { /* 记录失败不影响生成 */ }
    }
    // 备料有失败：调用酒馆的 abort 通道直接终止本次正文，页面不弹报错（状态在悬浮球总控看），
    // 等重新生成（再发/重roll）时复用已成功的备料、只重调失败的，全部成功才放行。
    if (pregenFailures.length) {
        const detail = pregenFailures.map(item => `${item.channel}：${item.reason}`).join('；');
        try { recordAgentAudit({ event: 'turn_pregen_abort', outcome: detail.slice(0, 400) }); } catch { /* 审计失败不影响终止 */ }
        try { console.warn(`[${EXTENSION_ID}] 备料失败，已终止本次正文调用：${detail}`); } catch { /* 记录失败不影响终止 */ }
        pregenFailures = [];
        abort(true);
        return;
    }
    pregenFailures = [];
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

/** 某一楼正文的身份指纹：mes + swipe 编号。重 roll / 编辑只变指纹不变楼层号，
 *  各路“生成后”记账用它判断同楼要不要撤回重算（人物簿记录员同款口径）。 */
function replyIdentityOf(chat, index) {
    const list = Array.isArray(chat) ? chat : [];
    const message = index >= 0 ? list[index] : null;
    return JSON.stringify([message?.mes, message?.swipe_id]);
}

function currentVolumeForWorld() {
    const settings = currentSettings();
    const panel = Number.isInteger(settings.setting?.progress) && settings.setting.progress > 0 ? settings.setting.progress : null;
    if (panel !== null) return panel;
    const auto = Number.isInteger(settings.facts?.currentVolume) && settings.facts.currentVolume > 0 ? settings.facts.currentVolume : null;
    return auto;
}

/* ---- 内联 SVG 图标：统一 1.6 描边、currentColor，随主题变色 ----
   字符图标（⌂ ◉ ✧…）退役；orb-hud.js 的 icon 字段保留作无障碍回退文本，
   渲染层一律走这里的手绘线性图标。 */
const DAI_ICON_PATHS = Object.freeze({
    flame: '<path d="M12 3.5c.9 2.4 2.2 3.7 3.4 5.2 1 1.3 1.6 2.5 1.6 4a5 5 0 0 1-10 0c0-1.6.7-3 1.8-4.4.3 1.1.9 1.9 1.9 2.3-.5-2.5.3-4.8 1.3-7.1z"/>',
    ding: '<path d="M5.5 8.5h13"/><path d="M7.5 8.5v4.8a4.2 4.2 0 0 0 4.2 4.2h.6a4.2 4.2 0 0 0 4.2-4.2V8.5"/><path d="M9.2 8.5V5.8M14.8 8.5V5.8"/><path d="M9.6 17.5 8.6 20.6M14.4 17.5l1 3.1M12 17.7v3"/>',
    letter: '<path d="M6 3.6h12v16.2l-3-2.2-3 2.2-3-2.2-3 2.2V3.6z"/><circle cx="12" cy="9.8" r="2.5"/>',
    lotus: '<path d="M12 4.6c1.9 2.3 2.8 4.2 2.8 6a2.8 2.8 0 0 1-5.6 0c0-1.8.9-3.7 2.8-6z"/><path d="M5.8 9.4c2.7.6 4.6 2.3 5.7 5.1-3.2.3-5.3-1.5-5.7-5.1z"/><path d="M18.2 9.4c-2.7.6-4.6 2.3-5.7 5.1 3.2.3 5.3-1.5 5.7-5.1z"/><path d="M8.3 17.8c2.3 1.2 5.1 1.2 7.4 0"/>',
    book: '<path d="M12 6.6C10 5.1 7.4 4.8 4 5.6v12.7c3.4-.8 6-.5 8 1 2-1.5 4.6-1.8 8-1V5.6c-3.4-.8-6-.5-8 1z"/><path d="M12 6.6v12.7"/>',
    balance: '<path d="M12 4.8v13.7"/><path d="M5 7h14"/><path d="M8.7 20.8h6.6"/><path d="M6.6 7l-2.5 5.6M6.6 7l2.5 5.6M4.1 12.6a2.6 2.6 0 0 0 5 0"/><path d="M17.4 7l-2.5 5.6M17.4 7l2.5 5.6M14.9 12.6a2.6 2.6 0 0 0 5 0"/>',
    mountain: '<path d="M3.5 17.5 8 10.5l3.4 5 3-4.3 6.1 6.3"/><circle cx="17.5" cy="6.5" r="2"/>',
    person: '<circle cx="12" cy="8" r="3.3"/><path d="M5.4 19.8a6.6 6.6 0 0 1 13.2 0"/>',
    ledger: '<path d="M4 19.6a2.4 2.4 0 0 1 2.4-2.4H20"/><path d="M6.4 2.8H20v18.4H6.4A2.4 2.4 0 0 1 4 18.8V5.2a2.4 2.4 0 0 1 2.4-2.4z"/><path d="M9.5 7.5h6.5M9.5 11h4.5"/>',
    ring: '<circle cx="12" cy="14.4" r="5.8"/><path d="M12 3l2.5 2.7L12 8.4 9.5 5.7 12 3z"/>',
    slip: '<path d="M9 3.5h6"/><path d="M9.4 5.7h5.2a1.6 1.6 0 0 1 1.6 1.6v10.6a1.6 1.6 0 0 1-1.6 1.6H9.4a1.6 1.6 0 0 1-1.6-1.6V7.3a1.6 1.6 0 0 1 1.6-1.6z"/><path d="M10.6 9.6h2.8M10.6 12.4h2.8M10.6 15.2h2.8"/>',
    ripple: '<path d="M3.8 13.6a8.2 8.2 0 0 1 16.4 0"/><path d="M7 13.6a5 5 0 0 1 10 0"/><path d="M10.2 13.6a1.8 1.8 0 0 1 3.6 0"/><path d="M12 16.8v3.6"/>',
    compass: '<circle cx="12" cy="12" r="8.3"/><path d="M15.4 8.6l-2.1 4.7-4.7 2.1 2.1-4.7 4.7-2.1z"/>',
    snow: '<path d="M12 3.6v16.8"/><path d="M5.4 7.4l13.2 9.2"/><path d="M18.6 7.4L5.4 16.6"/><path d="M9.8 5l2.2 2.2L14.2 5"/><path d="M9.8 19l2.2-2.2 2.2 2.2"/>',
    mirror: '<circle cx="9.3" cy="12" r="5"/><circle cx="14.7" cy="12" r="5"/>',
    brush: '<path d="M17.6 3.4l3 3L9.4 17.6l-4.2 1.2 1.2-4.2L17.6 3.4z"/><path d="M14.8 6.2l3 3"/>',
    gear: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.6"/><path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.4 5.4l1.8 1.8M16.8 16.8l1.8 1.8M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8"/>',
    arrow: '<path d="M4 12h14.5"/><path d="M13.5 6.5 19 12l-5.5 5.5"/>',
    reroll: '<path d="M20.2 12a8.2 8.2 0 1 1-2.6-6"/><path d="M20.2 3.4V8h-4.6"/>',
    plus: '<path d="M12 5.5v13M5.5 12h13"/>',
});
const DAI_ORB_ICON_NAMES = Object.freeze({
    overview: 'ding', world: 'mountain', self: 'ring', memory: 'slip', npcledger: 'ledger',
    cold: 'snow', impact: 'ripple', facts: 'book', settle: 'balance', mirror: 'mirror',
    journal: 'brush', sandbox: 'compass', system: 'gear',
});
function daiIcon(name) {
    const path = DAI_ICON_PATHS[name];
    if (!path) return '';
    return `<svg class="dai-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/** 行动结算页的分类折叠区：一个类别一个 <details>，默认收起，点开改提示词。 */
const SETTLE_CATEGORY_HTML = SETTLE_CATEGORIES.map(category => `
                        <details class="dai-settle-category"><summary><span class="dai-feature-icon" aria-hidden="true">${daiIcon("arrow")}</span><span><b>${category.label}</b><small>${category.summary}</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>规则正文</b><small>模型判定这类行动时收到的 system 规则；保持"只输出 JSON"与 effects 字段名不变，清空恢复内置默认。</small></span><textarea data-setting="settle.prompt.${category.id}" rows="9" spellcheck="false" placeholder="点开后自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-prompt-default="settle:${category.id}">填入默认规则</button><small>${category.hint}</small></div></div></details>`).join('');

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
    return `<details class="dai-settle-category" data-settle-custom-id="${id}"><summary><span class="dai-feature-icon" aria-hidden="true">${daiIcon("plus")}</span><span><b>${name || '未命名判定'}</b><small>自定义判定</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>判定名称</b><small>最多 12 个字；解析器按这个名字给行动归类。</small></span><input type="text" data-settle-custom-field="name" value="${name}" maxlength="12" placeholder="例如：炼器判定"></label><label class="dai-setting-row"><span><b>规则正文</b><small>这类行动的判定规则；保持"只输出 JSON"与 effects 字段名不变。</small></span><textarea data-settle-custom-field="prompt" rows="9" spellcheck="false" placeholder="写这类行动怎么判定">${escapeHtml(category.prompt || '')}</textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-settle-remove-category="${id}">删除这个判定</button><small>改动即时保存；删除不可恢复。</small></div></div></details>`;
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
    return `<details class="dai-settle-category dai-api-preset" data-api-preset-id="${id}"><summary><span class="dai-feature-icon" aria-hidden="true">${daiIcon("letter")}</span><span><b>${text(preset.name || '未命名方案')}</b><small>${preset.tavern === true ? '走酒馆通道' : text(preset.baseUrl || '还没填接口地址')}</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row dai-setting-toggle"><span><b>走酒馆通道</b><small>开：绑定这个方案的功能经由酒馆当前的 API 连接发出，下面的地址、密钥、模型都用不上；关：按下面填的接口直连。</small></span><input type="checkbox" data-api-preset-field="tavern" ${preset.tavern === true ? 'checked' : ''}></label><label class="dai-setting-row"><span><b>方案名称</b><small>「模型设置」页各功能选方案时显示的名字。</small></span><input type="text" data-api-preset-field="name" value="${text(preset.name)}" maxlength="24" placeholder="例如：深修直连"></label><label class="dai-setting-row"><span><b>接口协议</b><small>留空按接口地址自动判断。</small></span><select data-api-preset-field="provider">${providerOption('', '自动判断')}${providerOption('openai', 'OpenAI 兼容')}${providerOption('anthropic', 'Anthropic')}</select></label><label class="dai-setting-row"><span><b>接口地址</b><small>OpenAI 兼容的 Base URL，填到 /v1 为止（同酒馆自定义接口）。</small></span><input type="text" data-api-preset-field="baseUrl" value="${text(preset.baseUrl)}" placeholder="https://api.example.com/v1"></label><label class="dai-setting-row"><span><b>API Key</b><small>只保存到扩展设置，不写入聊天消息。</small></span><input type="password" data-api-preset-field="apiKey" value="${text(preset.apiKey)}" autocomplete="off" placeholder="留空表示不使用密钥"></label><label class="dai-setting-row"><span><b>模型名称</b><small>填好地址后点“拉取模型”，弹出列表里下滑点一个就填上；也可以手填。</small></span><input type="text" data-api-preset-field="model" value="${text(preset.model)}" placeholder="例如 deepseek-chat"></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-api-preset-models="${id}">拉取模型</button><small role="status" data-api-preset-models-status="${id}"></small></div><div class="dai-setting-grid dai-param-grid">${numberRow('temperature', 'Temperature', '0 更稳，2 更发散；0 ＝不指定。', 2, 0.05)}${numberRow('maxTokens', '最大输出 Token', 'tokens；0 ＝不指定。', 32768, 64)}${numberRow('topP', 'top_p', '0–1；0 ＝不指定。', 1, 0.05)}${numberRow('presencePenalty', '存在惩罚', '0–2；0 ＝不指定。', 2, 0.1)}${numberRow('frequencyPenalty', '频率惩罚', '0–2；0 ＝不指定。', 2, 0.1)}</div><label class="dai-setting-row"><span><b>包括主体参数</b><small>YAML 对象，最后并进聊天补全请求体（酒馆附加参数同语义）；例：top_k: 20</small></span><textarea data-api-preset-field="includeBody" rows="3" spellcheck="false" placeholder="top_k: 20">${text(preset.includeBody)}</textarea></label><label class="dai-setting-row"><span><b>排除主体参数</b><small>YAML 数组，最后从请求体删掉这些顶层字段；例：- frequency_penalty</small></span><textarea data-api-preset-field="excludeBody" rows="3" spellcheck="false" placeholder="- frequency_penalty">${text(preset.excludeBody)}</textarea></label><label class="dai-setting-row"><span><b>包含请求标头</b><small>YAML 对象，合并覆盖请求头（可覆盖鉴权头）；例：CustomHeader: custom-value</small></span><textarea data-api-preset-field="headers" rows="3" spellcheck="false" placeholder="CustomHeader: custom-value">${text(preset.headers)}</textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-api-preset-copy="${id}">复制方案</button><button type="button" class="dai-button dai-button-ghost" data-api-preset-remove="${id}">删除方案</button><small>改动即时保存；删除后用到它的功能自动回到跟随酒馆主连接。</small></div></div></details>`;
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
            option.textContent = `${preset.name || '未命名方案'}${preset.tavern === true ? '（走酒馆）' : ''}`;
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
            if (status) status.textContent = '已添加：默认走酒馆通道，要直连就填上接口地址再把「走酒馆通道」关掉。';
        }
        return;
    }
    const presets = (currentSettings().api?.presets ?? []).slice();
    if (presets.length >= API_PRESETS_MAX) {
        if (status) status.textContent = `方案最多 ${API_PRESETS_MAX} 个，先删一个再加。`;
        return;
    }
    presets.push({ name: '新方案', tavern: true, provider: '', baseUrl: '', apiKey: '', model: '', temperature: 0, maxTokens: 0, topP: 0, presencePenalty: 0, frequencyPenalty: 0, includeBody: '', excludeBody: '', headers: '' });
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
    if (status) status.textContent = '已添加：默认走酒馆通道，要直连就填上接口地址再把「走酒馆通道」关掉。';
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

/** 模型选择面板：拉到的模型直接弹成滚动列表，点一条就填进模型名；点模型名输入框可重开。 */
function openModelPicker(card, options) {
    const modelInput = card?.querySelector?.('[data-api-preset-field="model"]');
    if (!modelInput) return;
    const status = card.querySelector('[data-api-preset-models-status]');
    const list = Array.isArray(options) && options.length
        ? options.map(String)
        : (Array.isArray(card.__modelOptions) ? card.__modelOptions.map(String) : []);
    // 没拉过列表就别弹空面板：照实说一句，玩家知道下一步是先点拉取。
    if (!list.length) {
        if (status && !options) status.textContent = '还没有模型列表：先点“拉取模型”拉一次，再点模型名就能选了。';
        return;
    }
    card.__modelOptions = list;
    // 点输入框＝「开⇄收」切换：已开着就摘掉收工；没开就往下弹缓存列表。
    // 重新拉取（带 options）永远换新面板，旧的先摘掉。
    const existing = card.querySelector('[data-model-picker]');
    if (existing && !options) { existing.remove(); return; }
    existing?.remove?.();
    const row = modelInput.closest('.dai-setting-row');
    const picker = document.createElement('div');
    picker.className = 'dai-model-picker';
    picker.dataset.modelPicker = '';
    const head = document.createElement('div');
    head.className = 'dai-model-picker-head';
    const filter = document.createElement('input');
    filter.type = 'text';
    filter.className = 'dai-model-picker-filter';
    filter.placeholder = '筛选模型名，比如 deepseek';
    filter.spellcheck = false;
    const count = document.createElement('small');
    count.className = 'dai-model-picker-count';
    head.append(filter, count);
    const listBox = document.createElement('div');
    listBox.className = 'dai-model-picker-list';
    listBox.setAttribute('role', 'listbox');
    const renderItems = () => {
        const keyword = filter.value.trim().toLowerCase();
        const shown = keyword ? list.filter(model => model.toLowerCase().includes(keyword)) : list;
        listBox.textContent = '';
        for (const model of shown) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'dai-model-picker-item';
            item.dataset.modelValue = model;
            item.textContent = model;
            if (model === modelInput.value.trim()) item.classList.add('is-active');
            listBox.appendChild(item);
        }
        if (!shown.length) {
            const empty = document.createElement('small');
            empty.className = 'dai-model-picker-empty';
            empty.textContent = '没有匹配的模型名：换个词筛，或直接在模型名格里手填。';
            listBox.appendChild(empty);
        }
        count.textContent = `${shown.length} / ${list.length}`;
    };
    renderItems();
    picker.append(head, listBox); // 筛选头与滚动列表挂进面板，缺了这步面板就是空壳。
    filter.addEventListener('input', renderItems);
    listBox.addEventListener('click', event => {
        const item = event.target.closest?.('[data-model-value]');
        if (!item) return;
        modelInput.value = item.dataset.modelValue;
        modelInput.dispatchEvent(new Event('input', { bubbles: true }));
        picker.remove();
        if (status) status.textContent = `已选模型：${item.dataset.modelValue}。`;
    });
    const cleanup = () => {
        picker.remove();
        document.removeEventListener('pointerdown', outside, true);
        document.removeEventListener('keydown', keyClose, true);
    };
    // 点面板外面自动收起（Esc 也行）；模型输入框本身不算外面——点它走切换。
    const outside = event => {
        if (!picker.isConnected) return cleanup();
        if (picker.contains(event.target) || event.target === modelInput) return;
        cleanup();
    };
    const keyClose = event => { if (event.key === 'Escape') cleanup(); };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', keyClose, true);
    if (row) row.after(picker); else modelInput.after(picker);
    listBox.querySelector('.dai-model-picker-item.is-active')?.scrollIntoView?.({ block: 'nearest' });
    picker.scrollIntoView({ block: 'nearest' });
}

/** 方案卡上的“拉取模型”：读这张卡自己填的地址/密钥/协议/请求标头（方案标头一并带上），拉到就弹出选择面板。 */
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
    card.querySelector('[data-model-picker]')?.remove?.(); // 重新拉取：旧面板先收起，拉完弹新的。
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
        if (!result.models.length) {
            if (status) status.textContent = '接口通了但没报模型名，可以直接手填模型名。';
            return;
        }
        openModelPicker(card, result.models);
        if (status) status.textContent = `拉到 ${result.models.length} 个模型，选一个就填上了。`;
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
        maxFloors: Number.isInteger(world.decideMaxFloors) && world.decideMaxFloors > 0 ? Math.min(12, world.decideMaxFloors) : Math.min(12, globalReadFloors()),
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
    const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
    for (const item of applied) rows.push({ text: `✓ ${item.summary}`, ok: true });
    for (const item of rejected) rows.push({ text: `✗ ${item.op}：${item.reason}`, ok: false });
    for (const item of warnings) rows.push({ text: `⚠ ${item}`, ok: false });
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
async function runWorldDecision({ source = 'auto', note = '' } = {}) {
    const settings = worldDecideSettings();
    if (!settings.enabled) {
        setWorldDecideStatus('世界决定已关闭：先在世界页打开「启用模型决定」。');
        return { status: 'disabled' };
    }
    if (worldDecideRunning) return { status: 'busy' };
    // 自定义连接有自己的地址和密钥，不依赖全局配置；跟随酒馆才需要先检查全局连接。
    if (settings.overrides.connection !== 'custom' && agentLlmClient.availableFor('tavern') !== true) {
        setWorldDecideStatus('模型连接未配置：先在“模型设置”页选好连接。');
        return { status: 'not_configured' };
    }
    // auto 模式楼层防重：失败生成/旧楼层不重复决定；manual 按钮不受限。
    const worldReplyFloor = lastReplyIndex(Array.isArray(getHostContext()?.chat) ? getHostContext().chat : []);
    const worldReplyIdentity = replyIdentityOf(Array.isArray(getHostContext()?.chat) ? getHostContext().chat : [], worldReplyFloor);
    if (source === 'auto') {
        if (worldReplyFloor < 0) return { status: 'no_reply' };
        // 同楼重 roll：正文或 swipe 变了就要重读重算；runtime 的 apply 会先撤销上一版贡献再落新账。
        if (worldDecidedFloor?.floor === worldReplyFloor && worldDecidedFloor.continuation.current()
            && worldDecidedFloor.identity === worldReplyIdentity) return { status: 'already_decided' };
    }
    const continuation = captureAgentContinuation();
    worldDecideRunning = continuation;
    setWorldDecideStatus('模型正在决定……');
    try {
        const context = getHostContext();
        const chat = Array.isArray(context?.chat) ? context.chat : [];
        const floors = [];
        const rawFloors = [];
        for (let cursor = chat.length - 1; cursor >= 0 && rawFloors.length < settings.maxFloors; cursor -= 1) {
            const message = chat[cursor];
            if (!message || typeof message.mes !== 'string' || !message.mes.trim()) continue;
            if (message.is_system === true) continue;
            rawFloors.unshift({ role: message.is_user === true ? '玩家' : '角色', text: message.mes, isUser: message.is_user === true, depth: chat.length - 1 - cursor });
        }
        floors.push(...await cleanFloorEntries(rawFloors));
        if (!floors.length) {
            setWorldDecideStatus('聊天里还没有内容，模型无从决定。');
            return { status: 'no_input' };
        }
        // 世界书侧输入：直接复用原著资料本轮注入通道里的现成内容（选条流程的产物），决定调用不自己翻世界书条目。
        // 沙盒口径：世界书整条换血——不带这份注入，改带内置斗气大陆基线。
        const sandbox = sandboxModeActive();
        const bookLines = !sandbox ? factsInjectedLines() : [];
        let user = buildDecideUser({ snapshot: agentWorldRuntime.snapshot(), floors, worldbookLines: bookLines, settleLines: settleVerdictLinesForDecide() });
        if (sandbox) {
            const modeRecord = agentSandboxMode.read(currentAgentScope());
            const sandboxSettings = currentSettings().sandbox;
            const note = buildSandboxDecideNote({
                inertia: modeRecord.status === 'ready' ? modeRecord.inertia : sandboxSettings.inertia,
                canonCharactersAutonomous: modeRecord.status === 'ready' ? modeRecord.canonCharactersAutonomous : sandboxSettings.canonCharactersAutonomous,
            });
            user = `${user}\n${note}\n\n${SANDBOX_WORLD_PROMPT}`;
        }
        user = withPlayerNote(user, note);
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
        worldDecidedFloor = { floor: worldReplyFloor, identity: worldReplyIdentity, continuation };
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

// ---------- 剧情账本（plot）：生成后一次小调用，滚动维护计划与线索账 ----------

/** 剧情账本的连接与参数：结构同世界决定，绑定了方案整套走方案；没绑＝跟随酒馆主连接。 */
function plotLedgerSettings() {
    const plot = currentSettings().plot ?? {};
    return {
        enabled: plot.enabled !== false,
        inject: plot.inject !== false,
        budget: Number.isInteger(plot.injectBudget) && plot.injectBudget > 0 ? plot.injectBudget : 500,
        decideEnabled: plot.decideEnabled !== false,
        decideAuto: plot.decideAuto !== false,
        maxFloors: Number.isInteger(plot.decideMaxFloors) && plot.decideMaxFloors > 0 ? Math.min(12, plot.decideMaxFloors) : Math.min(12, globalReadFloors()),
        prompt: typeof plot.decidePrompt === 'string' && plot.decidePrompt.trim() ? plot.decidePrompt.trim() : PLOT_DECIDE_PROMPT,
        // 绑定了 API设置方案整套走方案；没绑＝跟随酒馆主连接。
        overrides: presetOverrides('plot') ?? { connection: 'tavern' },
    };
}

function setPlotDecideStatus(message) {
    const panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null;
    const target = panel?.querySelector('[data-plot-decide-status]');
    if (target) target.textContent = message;
}

/** 把一次剧情决定的结果呈现到面板：note + 每条操作 ✓生效/✗被拒。 */
function renderPlotDecisionResult(decision, result) {
    const panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null;
    const target = panel?.querySelector('[data-plot-decide-result]');
    if (!target) return;
    const rows = [];
    const note = typeof decision?.note === 'string' && decision.note.trim() ? decision.note.trim() : '（模型没有给说明）';
    rows.push({ text: `模型说明：${note}` });
    const applied = Array.isArray(result?.applied) ? result.applied : [];
    const rejected = Array.isArray(result?.rejected) ? result.rejected : [];
    for (const item of applied) rows.push({ text: `✓ ${item.summary}`, ok: true });
    for (const item of rejected) rows.push({ text: `✗ ${item.op}：${item.reason}`, ok: false });
    if (decision?.dropped > 0) rows.push({ text: `⚠ ${decision.dropped} 条格式坏的被丢弃`, ok: false });
    if (!applied.length && !rejected.length) rows.push({ text: decision?.status === 'empty' ? '模型判断本轮剧情线无变化。' : '模型没有给出可执行的操作。', ok: false });
    target.replaceChildren(...rows.map(row => {
        const item = makeElement('p', 'dai-turn-result');
        if (row.ok === false) item.dataset.ok = 'false';
        item.textContent = row.text;
        return item;
    }));
}

/** 剧情账本卡的账面视图：滚动计划 + 开放线索（悬置天数/超期标记）+ 指令流水。 */
function refreshPlotPanel(panel) {
    const target = panel ?? (typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null);
    if (!target || target.hidden) return;
    const section = target.querySelector('[data-settings-section="world"]');
    if (!section || section.hidden) return;
    const status = agentPlotRuntime.status();
    const snapshot = agentPlotRuntime.snapshot();
    const view = section.querySelector('[data-plot-ledger-view]');
    if (view) {
        const rows = [];
        const planLine = [status.plan.goal ? `本幕目标：${status.plan.goal}` : '', status.plan.next ? `下一步：${status.plan.next}` : ''].filter(Boolean).join('｜');
        rows.push(makeElement('p', 'dai-turn-result', planLine || '还没有滚动计划——剧情决定会自动写出本幕目标与下一步。'));
        const open = (snapshot.threads ?? []).filter(thread => thread.status === 'open');
        const today = status.day ?? 1;
        for (const thread of open) {
            const overdue = thread.dueDay !== null && thread.dueDay !== undefined && thread.dueDay < today;
            const hung = Number.isInteger(thread.day) && today > thread.day ? `，已悬 ${today - thread.day} 天` : '';
            const item = makeElement('p', 'dai-turn-result');
            if (overdue) item.dataset.ok = 'false';
            item.textContent = `◆ ${thread.id}「${thread.title}」${overdue ? '（已超期未回收）' : ''}${hung}：${thread.detail || thread.basis}`;
            rows.push(item);
        }
        if (!open.length) rows.push(makeElement('p', 'dai-turn-result', '开放线索空——正文里埋的钩子、未解的谜、人物恩怨会由剧情决定登记到这里。'));
        view.replaceChildren(...rows);
    }
    const journal = section.querySelector('[data-plot-journal]');
    if (journal) {
        const entries = [...(snapshot.log ?? [])].reverse().slice(0, 6);
        journal.replaceChildren(...(entries.length ? entries.map(entry => {
            const item = makeElement('p', 'dai-turn-result');
            item.append(makeElement('b', '', `${journalSourceLabel(entry.source)}：`), document.createTextNode(entry.summaries.join('；') || '（无变化）'));
            return item;
        }) : [makeElement('p', 'dai-turn-result', '还没有剧情指令执行记录。')]));
    }
}

let plotDecideRunning = false;
// 楼层防重：与世界决定同款——失败生成也会广播 GENERATION_ENDED，auto 决定只对没决定过的 AI 楼层跑一次。
let plotDecidedFloor = null;

/**
 * 剧情决定主入口：读最近聊天 + 世界时钟 + 剧情账本 → 模型决定 → 脚本逐条校验执行 →
 * 结果呈现到面板。生成结束后自动跑（排在世界决定之后），面板按钮可手动跑。
 * 解析失败带错误信息自动重试一次（instructor 式），坏输出不再一票否决整轮决定。
 */
async function runPlotDecision({ source = 'auto', note = '' } = {}) {
    const settings = plotLedgerSettings();
    if (!settings.enabled) {
        setPlotDecideStatus('剧情账本已关闭：先在「世界运转」页打开「启用剧情账本」。');
        return { status: 'disabled' };
    }
    if (!settings.decideEnabled) return { status: 'decide_disabled' };
    if (plotDecideRunning) return { status: 'busy' };
    // 自定义连接有自己的地址和密钥，不依赖全局配置；跟随酒馆才需要先检查全局连接。
    if (settings.overrides.connection !== 'custom' && agentLlmClient.availableFor('tavern') !== true) {
        setPlotDecideStatus('模型连接未配置：先在“模型设置”页选好连接。');
        return { status: 'not_configured' };
    }
    // auto 模式楼层防重：失败生成/旧楼层不重复决定；manual 按钮不受限。
    const plotReplyFloor = lastReplyIndex(Array.isArray(getHostContext()?.chat) ? getHostContext().chat : []);
    const plotReplyIdentity = replyIdentityOf(Array.isArray(getHostContext()?.chat) ? getHostContext().chat : [], plotReplyFloor);
    if (source === 'auto') {
        if (plotReplyFloor < 0) return { status: 'no_reply' };
        if (plotDecidedFloor?.floor === plotReplyFloor && plotDecidedFloor.continuation.current()
            && plotDecidedFloor.identity === plotReplyIdentity) return { status: 'already_decided' };
    }
    const continuation = captureAgentContinuation();
    plotDecideRunning = continuation;
    setPlotDecideStatus('剧情决定中……');
    try {
        const context = getHostContext();
        const chat = Array.isArray(context?.chat) ? context.chat : [];
        const floors = [];
        const rawFloors = [];
        for (let cursor = chat.length - 1; cursor >= 0 && rawFloors.length < settings.maxFloors; cursor -= 1) {
            const message = chat[cursor];
            if (!message || typeof message.mes !== 'string' || !message.mes.trim()) continue;
            if (message.is_system === true) continue;
            rawFloors.unshift({ role: message.is_user === true ? '玩家' : '角色', text: message.mes, isUser: message.is_user === true, depth: chat.length - 1 - cursor });
        }
        floors.push(...await cleanFloorEntries(rawFloors));
        if (!floors.length) {
            setPlotDecideStatus('聊天里还没有内容，模型无从决定。');
            return { status: 'no_input' };
        }
        let user = buildPlotDecideUser({ snapshot: agentPlotRuntime.snapshot(), clockText: agentWorldRuntime.formatClock(), floors, settleLines: settleVerdictLinesForDecide() });
        user = withPlayerNote(user, note);
        // 解析失败带错误重试一次：把 validator 的拒绝原因喂回去，落账成功率比一票否决高得多。
        let decision = null;
        let raw = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            raw = await agentLlmClient.complete({
                label: '剧情决定',
                system: settings.prompt,
                user,
                jsonSchema: PLOT_JSON_SCHEMA,
                overrides: settings.overrides,
            });
            if (!continuation.current()) return { status: 'stale' };
            decision = parsePlotDecision(raw);
            if (decision.status !== 'invalid') break;
            if (attempt === 0) {
                user = `${user}\n\n【重试】上一次输出无法解析：${decision.error}。请重新输出，只给一个 JSON 对象 {"note":"…","ops":[…]}，不要任何其他文字。`;
                setPlotDecideStatus('输出无法解析，带错误重试一次……');
            }
        }
        if (decision.status === 'invalid') {
            setPlotDecideStatus(`模型输出无法解析：${decision.error}`);
            return { status: 'invalid', error: decision.error };
        }
        const result = agentPlotRuntime.apply(decision.ops, { source: 'decide', floor: plotReplyFloor, today: agentWorldRuntime.status().clock.day });
        plotDecidedFloor = { floor: plotReplyFloor, identity: plotReplyIdentity, continuation };
        if (!result.applied.length) agentPlotRuntime.note(decision.note || '模型判断本轮剧情线无变化。', { source: 'decide' });
        persistPlot();
        renderPlotDecisionResult(decision, result);
        setPlotDecideStatus(source === 'auto' ? '生成后自动剧情决定完成。' : '剧情决定完成。');
        refreshPlotPanel();
        return { status: 'ok', decision, result };
    } catch (error) {
        if (!continuation.current()) return { status: 'stale' };
        setPlotDecideStatus(`剧情决定失败：${error?.message ?? error}`);
        return { status: 'failed', reason: String(error?.message ?? error) };
    } finally {
        if (plotDecideRunning === continuation) plotDecideRunning = false;
    }
}

/** 剧情决定排在记账链之后：世界账落定才有可信的时钟与事件，计划才不会写成空中楼阁。
 *  调度时捕获本轮 continuation：等账落定时已经换了聊天/新一轮，这条链就随旧聊天作废，不再起飞。 */
function schedulePlotDecideAfter(chains = []) {
    const settings = plotLedgerSettings();
    if (!advancedMode() || !settings.enabled || !settings.decideEnabled || !settings.decideAuto) return;
    const continuation = captureAgentContinuation();
    const pending = (Array.isArray(chains) ? chains : []).filter(Boolean);
    void Promise.resolve(pending.length ? Promise.allSettled(pending) : Promise.resolve())
        .then(() => {
            if (!continuation.current()) return { status: 'stale' };
            return Promise.resolve(runPlotDecision({ source: 'auto' }));
        })
        .then(result => { try { recordAgentAudit({ event: 'turn_plot_decision', outcome: String(result?.status ?? 'unknown') }); } catch { /* 审计失败不影响记账 */ } })
        .catch(() => {});
}

// ---------- 正文事实核验（verify）：生成后旁路小调用，只记审计不拦正文 ----------

/** 核验的连接与参数：绑定 API 设置方案整套走方案；没绑＝跟随酒馆主连接。 */
function verifySettings() {
    const verify = currentSettings().verify ?? {};
    return {
        enabled: verify.enabled !== false,
        auto: verify.auto !== false,
        gate: verify.gate !== false,
        nameAudit: verify.nameAudit === true,
        prompt: typeof verify.prompt === 'string' && verify.prompt.trim() ? verify.prompt.trim() : VERIFY_PROMPT,
        overrides: presetOverrides('verify') ?? { connection: 'tavern' },
    };
}

let verifyRunning = false;
// 楼层防重：同世界决定，auto 核验只对没核验过的 AI 楼层跑一次。
let verifyDecidedFloor = null;
// 核验台账（内存正本，hydrateVerify 从聊天存档读入，persistVerify 写回）。
let verifyLedger = normalizeVerifyLedger(null);

function setVerifyStatus(message) {
    const panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null;
    const target = panel?.querySelector('[data-verify-status]');
    if (target) target.textContent = message;
}

const VERIFY_VERDICT_LABELS = Object.freeze({ supported: '有据', contradicted: '矛盾', unverified: '无据' });

/** 核验台账流水：开着的条目倒序，每条可标误报；设置页打开与每次核验后都重画。 */
function renderVerifyEntries(panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null) {
    if (!panel) return;
    const target = panel.querySelector('[data-verify-entries]');
    if (!target) return;
    const findings = listOpenFindings(verifyLedger, { limit: 30 });
    if (!findings.length) { target.textContent = '还没有核验记录。'; return; }
    const rows = findings.map(item => {
        const line = makeElement('p', 'dai-turn-result');
        if (item.kind === 'unapproved_setting_use') {
            line.textContent = `⚠ 未授权设定：正文用了没注入的条目「${item.subject}」（命中：${item.value}）· 第 ${item.floor ?? '?'} 楼`;
        } else {
            line.textContent = `${item.verdict === 'contradicted' ? '✗' : '·'} ${VERIFY_VERDICT_LABELS[item.verdict] ?? item.verdict}｜${item.subject}·${item.predicate}${item.value ? `＝${item.value}` : ''}（${item.basisRef}）· 第 ${item.floor ?? '?'} 楼`;
        }
        const button = makeElement('button', 'dai-button dai-button-ghost');
        button.type = 'button';
        button.dataset.verifyFp = item.id;
        button.dataset.verifyFpRevision = String(item.revision ?? 1);
        button.textContent = '误报';
        line.append(' ', button);
        return line;
    });
    target.replaceChildren(...rows);
}

/** 本轮裁决呈现：断言逐条 + 名字比对命中。 */
function renderVerifyResult(claims, nameIssues) {
    const panel = typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null;
    const target = panel?.querySelector('[data-verify-result]');
    if (target) {
        const rows = [];
        for (const claim of claims) rows.push(`${claim.verdict === 'contradicted' ? '✗' : '·'} ${VERIFY_VERDICT_LABELS[claim.verdict] ?? claim.verdict}｜${claim.text}（${claim.basis}）`);
        for (const issue of nameIssues) rows.push(`⚠ 未授权设定：「${issue.name}」（命中：${issue.key}）`);
        if (!rows.length) rows.push('没有可验证断言，本轮无审计。');
        target.replaceChildren(...rows.map(text => {
            const item = makeElement('p', 'dai-turn-result');
            item.textContent = text;
            return item;
        }));
    }
    renderVerifyEntries(panel);
}

function persistVerify() {
    return Promise.resolve(hostStorage?.saveVerifyState?.(verifyLedger) ?? { status: 'unavailable' })
        .catch(error => ({ status: 'failed', reason: String(error?.message ?? error) }));
}

/** 换聊天/启动时读入本聊天的核验台账；读不到就按空表开局。 */
function hydrateVerify() {
    try {
        const record = hostStorage?.verifyState?.();
        verifyLedger = normalizeVerifyLedger(record?.status === 'ready' ? record.value : null);
    } catch {
        verifyLedger = normalizeVerifyLedger(null);
    }
    renderVerifyEntries();
}

/** 台账现状行：世界/纳戒/人物三本账的最小投影，给核验模型当证据；哪本读不到就空着。 */
function verifyEvidenceLines() {
    let world = '';
    try { world = buildWorldInjection(agentWorldRuntime.snapshot(), { maxChars: 700 }); } catch { /* 世界台账不可用不碍核验 */ }
    let self = '';
    try { self = buildSelfInjection(agentSelfRuntime.snapshot(), { maxChars: 400 }); } catch { /* 同上 */ }
    let npc = '';
    try {
        npc = agentNpcLedger.list().slice(0, 14).map(record => {
            const bits = [record?.presence === '不在场' ? '不在场' : '在场', `好感 ${Number(record?.favor ?? 0)}`,
                record?.attitude ? `态度 ${record.attitude}` : '', record?.realm ? `修为 ${record.realm}` : ''].filter(Boolean);
            return `${record?.name || '（未知名）'}（${bits.join('，')}）`;
        }).filter(Boolean).join('；');
    } catch { /* 同上 */ }
    return { world, self, npc };
}

/** 误报标记：revision 乐观锁；翻成功后把断言键升级成豁免并落账，同断言后续不再记。 */
function markVerifyFalsePositive(id, expectedRevision) {
    const marked = markEntryFalsePositive(verifyLedger.entries, { id, expectedRevision: Number(expectedRevision) });
    if (!marked.accepted) {
        setVerifyStatus(`误报标记未生效：${marked.reason ?? '未知原因'}`);
        return { status: marked.reason ?? 'rejected' };
    }
    verifyLedger.entries = marked.entries;
    const exempted = addExemption(verifyLedger.exemptions, marked.entry);
    if (exempted.accepted) verifyLedger.exemptions = exempted.exemptions;
    persistVerify();
    renderVerifyEntries();
    setVerifyStatus('已标记误报；同一断言后续不再记。');
    return { status: 'ok' };
}

/** 核验排程：等记账链（完整版＝世界链＋人物链，简略版＝总结算）落地后再跑——台账没记完就开核，
 *  会把“本轮刚发生的变化”误判成矛盾。 */
function scheduleFactCheckAfter(chains = []) {
    const settings = verifySettings();
    if (!advancedMode() || !settings.enabled || !settings.auto) return;
    // 预快筛：注定跳过的楼层（闲聊、没有可验证特征、名字比对又没开）连排程都不进——
    // 不产生审计事件、不碰存档，也避免后台写入在流程上造成异步污染。
    try {
        const chat = Array.isArray(getHostContext()?.chat) ? getHostContext().chat : [];
        const newest = [...chat].reverse().find(message => message && message.is_user !== true && message.is_system !== true && typeof message.mes === 'string' && message.mes.trim());
        let supplyKeys = [];
        try { supplyKeys = agentSettingSupply.list().flatMap(entry => Array.isArray(entry?.keys) ? entry.keys : []); } catch { /* 库空就只靠台账 */ }
        let npcNames = [];
        try { npcNames = agentNpcLedger.names(); } catch { /* 同上 */ }
        const gate = shouldVerify({ text: newest?.mes ?? '', supplyKeys, npcNames, gate: settings.gate });
        if (gate.status !== 'ok' && !settings.nameAudit) return;
    } catch { /* 预筛失败照常排程，运行时还有一道门 */ }
    const pending = (Array.isArray(chains) ? chains : []).filter(Boolean);
    void Promise.resolve(pending.length ? Promise.allSettled(pending) : Promise.resolve())
        .then(() => Promise.resolve(runFactCheck({ source: 'auto' })))
        .then(result => { try { recordAgentAudit({ event: 'turn_fact_check', outcome: String(result?.status ?? 'unknown') }); } catch { /* 审计失败不影响记账 */ } })
        .catch(() => {});
}

/**
 * 事实核验主入口：① 名字比对（确定性的“未注入条目出现”，零模型调用，每楼都跑）；
 * ② 快筛通过后一次小调用拆断言裁决；③ 豁免命中与同楼重复不记，落账呈现。
 * 手动“核验这一楼”不受楼层防重限制。
 */
async function runFactCheck({ source = 'auto' } = {}) {
    const settings = verifySettings();
    if (!settings.enabled) return { status: 'disabled' };
    if (verifyRunning) return { status: 'busy' };
    if (settings.overrides.connection !== 'custom' && agentLlmClient.availableFor('tavern') !== true) return { status: 'not_configured' };
    const chat = Array.isArray(getHostContext()?.chat) ? getHostContext().chat : [];
    const replyFloor = lastReplyIndex(chat);
    const replyIdentity = replyIdentityOf(chat, replyFloor);
    if (source === 'auto') {
        if (replyFloor < 0) return { status: 'no_reply' };
        if (verifyDecidedFloor?.floor === replyFloor && verifyDecidedFloor.continuation.current()
            && verifyDecidedFloor.identity === replyIdentity) return { status: 'already_decided' };
    }
    const continuation = captureAgentContinuation();
    verifyRunning = continuation;
    // 可观测性：无论结果如何都落 lastRun——否则“跑了没结果”与“根本没跑”无法区分。
    const lastRun = { floor: replyFloor, ts: new Date().toISOString(), status: 'started', claims: 0, nameIssues: 0, reason: '' };
    try {
        const floors = [];
        for (let cursor = chat.length - 1; cursor >= 0 && floors.length < 2; cursor -= 1) {
            const message = chat[cursor];
            if (!message || typeof message.mes !== 'string' || !message.mes.trim()) continue;
            if (message.is_system === true) continue;
            floors.unshift({ role: message.is_user === true ? '玩家' : '角色', text: message.mes, isUser: message.is_user === true, depth: chat.length - 1 - cursor });
        }
        const cleaned = floors.length ? await cleanFloorEntries(floors) : [];
        const newest = [...cleaned].reverse().find(item => item.role !== '玩家') ?? cleaned.at(-1) ?? null;
        const proseText = newest?.text ?? '';
        // ① 名字比对：setting-supply 的确定性审计（旧管线遗留能力）。实跑发现 lore 密集的正文
        // 一楼能命中 40+ 条目名（酒馆原生世界书还在自己注入，正文引用非注入条目是常态），
        // 默认关（verify.nameAudit）；开了才作为确定性车道随核验执行，零模型调用。
        let nameIssues = [];
        if (settings.nameAudit) {
            try {
                const usedIds = Array.isArray(agentPromptInjection.inspect().last?.usedIds) ? agentPromptInjection.inspect().last.usedIds : [];
                if (proseText) nameIssues = agentSettingSupply.audit(proseText, usedIds)?.issues ?? [];
            } catch { /* 名字比对失败不碍断言核验 */ }
        }
        // ② 快筛：闲聊楼层没有可验证断言的特征，不值得一次调用。
        let supplyKeys = [];
        try { supplyKeys = agentSettingSupply.list().flatMap(entry => Array.isArray(entry?.keys) ? entry.keys : []); } catch { /* 库空就只靠台账 */ }
        let npcNames = [];
        try { npcNames = agentNpcLedger.names(); } catch { /* 同上 */ }
        const gate = shouldVerify({ text: proseText, supplyKeys, npcNames, gate: settings.gate });
        if (gate.status !== 'ok' && !nameIssues.length) {
            verifyDecidedFloor = { floor: replyFloor, identity: replyIdentity, continuation };
            lastRun.status = 'skipped';
            return { status: 'skipped' };
        }
        const claims = [];
        if (gate.status === 'ok' && proseText) {
            const evidence = verifyEvidenceLines();
            const user = buildVerifyUser({ floors: cleaned, injectedText: factsInjectedLines(), worldLines: evidence.world, selfLines: evidence.self, npcLines: evidence.npc });
            // rawPrompt：走 generateRaw 独立提示词，不拼角色卡/主聊天预设——证据在 user 里自含，
            // 且避开卡片工具协议（实跑复现：卡片的 soliumbra_reply 工具会把静默生成劫持成
            // tool_calls，generateQuietPrompt 只拿回工具返回值 {}，真正的 JSON 被工具执行器吃掉）。
            const raw = await agentLlmClient.complete({
                label: '正文核验',
                system: settings.prompt,
                user,
                rawPrompt: true,
                jsonSchema: VERIFY_JSON_SCHEMA,
                overrides: settings.overrides,
            });
            if (!continuation.current()) { lastRun.status = 'stale'; return { status: 'stale' }; }
            let parsed = parseVerifyReply(raw, { proseText });
            if (parsed.status === 'invalid') {
                // 带原因重试一次（npc-recorder 同款）。重试去掉 jsonSchema：结构化输出执行器
                // 遇到不认的关键字会把生成约束成 {}（实跑复现），第二次靠提示词契约裸跑。
                const retryRaw = await agentLlmClient.complete({
                    label: '正文核验',
                    system: settings.prompt,
                    user: buildVerifyRetryUser({ user, raw, reason: parsed.reason ?? '' }),
                    rawPrompt: true,
                    overrides: settings.overrides,
                });
                if (!continuation.current()) { lastRun.status = 'stale'; return { status: 'stale' }; }
                parsed = parseVerifyReply(retryRaw, { proseText });
            }
            if (parsed.status !== 'ok') {
                lastRun.status = parsed.status === 'empty' ? 'empty' : 'invalid';
                lastRun.reason = `${String(parsed.reason ?? '').slice(0, 120)}｜原始输出开头：${String(raw).slice(0, 160)}`;
                return { status: lastRun.status, reason: lastRun.reason };
            }
            claims.push(...parsed.claims);
        }
        // ③ 落账：断言条目 + 名字比对条目（发号器在两次 buildVerifyEntries 之间前进，防 id 撞号）。
        const claimEntries = buildVerifyEntries(claims, { floor: replyFloor }, verifyLedger);
        verifyLedger.seq = (Number.isInteger(verifyLedger.seq) ? verifyLedger.seq : 0) + claimEntries.length;
        const nameEntries = buildVerifyEntries(nameIssues.map(issue => ({
            name: issue.name, predicate: '未注入条目', value: issue.key,
            text: `正文出现未注入条目「${issue.name}」（命中：${issue.key}）`, id: issue.id,
        })), { floor: replyFloor, kind: 'unapproved_setting_use' }, verifyLedger);
        verifyLedger.seq = (Number.isInteger(verifyLedger.seq) ? verifyLedger.seq : 0) + nameEntries.length;
        const additions = [...claimEntries, ...nameEntries];
        if (additions.length) {
            const result = mergeVerifyEntries(verifyLedger.entries, additions, { exemptions: verifyLedger.exemptions, floor: replyFloor });
            verifyLedger.entries = result.entries;
        }
        lastRun.status = 'ok';
        lastRun.claims = claims.length;
        lastRun.nameIssues = nameIssues.length;
        verifyDecidedFloor = { floor: replyFloor, identity: replyIdentity, continuation };
        renderVerifyResult(claims, nameIssues);
        setVerifyStatus(source === 'auto'
            ? (claims.length || nameIssues.length ? `核验完成：${claims.length} 条断言，${nameIssues.length} 条名字比对。` : '核验完成：没有可验证断言。')
            : '核验完成。');
        return { status: 'ok', claims: claims.length, nameIssues: nameIssues.length };
    } catch (error) {
        if (!continuation.current()) { lastRun.status = 'stale'; return { status: 'stale' }; }
        lastRun.status = 'failed';
        lastRun.reason = String(error?.message ?? error).slice(0, 200);
        setVerifyStatus(`核验失败：${lastRun.reason}`);
        return { status: 'failed', reason: lastRun.reason };
    } finally {
        if (verifyRunning === continuation) verifyRunning = false;
        // skipped 不落盘：闲聊楼层每楼写存档既浪费也会改变 chatMetadata 形状；歧义只存在于
        // “跑过模型但没结果”（ok/invalid/empty/failed），那几种必落。
        if (lastRun.status !== 'started' && lastRun.status !== 'skipped') {
            verifyLedger.lastRun = { ...lastRun };
            persistVerify();
        }
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
    // 已被软覆盖（supersededBy）的小记忆视为"已被新事覆盖"，不再进总结批。
    const smalls = (Array.isArray(snapshot?.entries) ? snapshot.entries : []).filter(entry => entry.tier === 'small' && !entry.supersededBy);
    return smalls.length >= 1 && smalls.length + 1 >= threshold ? smalls : [];
}

async function runMemoryDecision({ source = 'auto', note = '' } = {}) {
    const settings = memorySettings();
    if (!settings.enabled) {
        setMemoryDecideStatus('记忆记账已关闭：先在记忆页打开「启用记忆」。');
        return { status: 'disabled' };
    }
    if (!settings.decideEnabled) {
        setMemoryDecideStatus('记忆决定已关闭：先在记忆页打开「启用模型决定」。');
        return { status: 'disabled' };
    }
    if (memoryDecideRunning) return { status: 'busy' };
    // 自定义连接有自己的地址和密钥，不依赖全局配置；跟随酒馆才需要先检查全局连接。
    if (settings.overrides.connection !== 'custom' && agentLlmClient.availableFor('tavern') !== true) {
        setMemoryDecideStatus('模型连接未配置：先在"模型设置"页选好连接。');
        return { status: 'not_configured' };
    }
    // auto 模式楼层防重：失败生成/旧楼层不重复决定；manual 按钮不受限。
    const memoryReplyFloor = lastReplyIndex(Array.isArray(getHostContext()?.chat) ? getHostContext().chat : []);
    const memoryReplyIdentity = replyIdentityOf(Array.isArray(getHostContext()?.chat) ? getHostContext().chat : [], memoryReplyFloor);
    if (source === 'auto') {
        if (memoryReplyFloor < 0) return { status: 'no_reply' };
        // 同楼重 roll：正文或 swipe 变了就要重读重算；runtime 的 apply 会先撤销上一版贡献再落新账。
        if (memoryDecidedFloor?.floor === memoryReplyFloor && memoryDecidedFloor.continuation.current()
            && memoryDecidedFloor.identity === memoryReplyIdentity) return { status: 'already_decided' };
    }
    const continuation = captureAgentContinuation();
    memoryDecideRunning = continuation;
    setMemoryDecideStatus('模型正在决定……');
    try {
        const context = getHostContext();
        const chat = Array.isArray(context?.chat) ? context.chat : [];
        const floors = [];
        const rawFloors = [];
        for (let cursor = chat.length - 1; cursor >= 0 && rawFloors.length < settings.maxFloors; cursor -= 1) {
            const message = chat[cursor];
            if (!message || typeof message.mes !== 'string' || !message.mes.trim()) continue;
            if (message.is_system === true) continue;
            rawFloors.unshift({ role: message.is_user === true ? '玩家' : '角色', text: message.mes, isUser: message.is_user === true, depth: chat.length - 1 - cursor });
        }
        floors.push(...await cleanFloorEntries(rawFloors));
        if (!floors.length) {
            setMemoryDecideStatus('聊天里还没有内容，书记官无从下手。');
            return { status: 'no_input' };
        }
        // 总结式记忆：输入只带现有清单与最近聊天，正文总结不需要世界书/召回材料。
        // 整合到期时一次调用两件事：本轮总结 + 把现有小记忆整批提炼成大记忆（consolidate 字段）。
        const snapshotBefore = agentMemoryRuntime.snapshot();
        const consolidateCandidates = smallsForConsolidation(snapshotBefore, settings);
        const user = withPlayerNote(buildMemoryDecideUser({ snapshot: snapshotBefore, floors, consolidateIds: consolidateCandidates.map(entry => entry.id), settleLines: settleVerdictLinesForDecide() }), note);
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
        memoryDecidedFloor = { floor: memoryReplyFloor, identity: memoryReplyIdentity, continuation };
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
    // 已被软覆盖（supersededBy）的小记忆不再进总结批——它们已被新事覆盖，玩家可随时恢复。
    const smalls = agentMemoryRuntime.snapshot().entries.filter(entry => entry.tier === 'small' && !entry.supersededBy);
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
        const result = agentMemoryRuntime.consolidate({ ids: smalls.map(entry => entry.id), big: parsed.big, day: worldDay(), source });
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

// ---------- 模型调用体检：一行摘要 + 空回重试设置 ----------
// 逐路的实时成败在悬浮球总控窗（渠道标记 ✓/✗），失败详情点「上次失败」行或 ✗ 弹卡——
// 设置页不再铺长流水，只留一行统计摘要，观感优先。

/** 体检摘要：本会话调用量 + 失败次数 + 最近失败短摘要；面板开着时有新调用就地刷新。 */
function renderCallSummary(panel) {
    const host = panel?.querySelector('[data-calllog-summary]');
    if (!host) return;
    const update = () => {
        const log = typeof agentLlmClient?.callLog === 'function' ? agentLlmClient.callLog() : [];
        if (!log.length) { host.textContent = '本次会话还没有调用记录。逐路的实时成败看悬浮球总控窗。'; return; }
        const failed = log.filter(item => item?.ok === false);
        const last = failed.at(-1);
        const error = String(last?.error ?? '').trim();
        const briefError = error.length > 60 ? `${error.slice(0, 60)}…` : error;
        host.textContent = `本会话共 ${log.length} 次调用，失败 ${failed.length} 次`
            + (last ? `；最近失败：${last.label ?? '未标注调用'}：${briefError}` : '')
            + '。逐路的实时成败在悬浮球总控窗，失败点那里弹详情卡。';
    };
    update();
    if (!panel.dataset.calllogListening) {
        panel.dataset.calllogListening = '1';
        window.addEventListener('dai-calllog', () => {
            if (activeSettingsPage === 'overview' && document.contains(host)) update();
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

let impactDecideRunning = false;
let lastImpactDecideIdentity = null;
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
async function runImpactDecision({ source = 'auto', note = '' } = {}) {
    const settings = impactSettings();
    if (!settings.enabled || !settings.decideEnabled) {
        setImpactStatus('世界影响记录已关闭：先在影响页打开「启用世界影响库」和决定开关。');
        return { status: 'disabled' };
    }
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
        const rawFloors = [];
        for (let cursor = chat.length - 1; cursor >= 0 && rawFloors.length < settings.decideMaxFloors; cursor -= 1) {
            const message = chat[cursor];
            if (!message || typeof message.mes !== 'string' || !message.mes.trim()) continue;
            if (message.is_system === true) continue;
            rawFloors.unshift({ role: message.is_user === true ? '玩家' : '角色', text: message.mes, isUser: message.is_user === true, depth: chat.length - 1 - cursor });
        }
        floors.push(...await cleanFloorEntries(rawFloors));
        if (!floors.length) {
            setImpactStatus('聊天里还没有内容，记录员无从下手。');
            return { status: 'no_input' };
        }
        // 世界书侧输入：直接复用原著资料本轮注入通道里的现成内容（选条流程的产物），决定调用不自己翻世界书条目。
        // 沙盒口径不用原著资料：影响记录员只看聊天与世界台账。
        const bookLines = !sandboxModeActive() ? factsInjectedLines() : [];
        // 决定要同时看“世界此刻什么样”和“玩家已经改出了什么”：台账给世界，records 给影响库。
        const worldSnapshot = agentWorldRuntime.snapshot();
        const impactSnapshot = agentImpactRuntime.snapshot();
        const raw = await agentLlmClient.complete({
            label: '影响决定',
            system: settings.prompt,
            user: withPlayerNote(buildImpactDecideUser({ snapshot: { ...worldSnapshot, records: impactSnapshot.records }, floors, worldbookLines: bookLines, settleLines: settleVerdictLinesForDecide() }), note),
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

/** Namespaced integration point for the current feature modules. */
export function probeAgentCapabilities(options) {
    agentCapabilities = probeHostCapabilities(options);
    if (root) { renderCapabilities(agentCapabilities); root.hidden = false; }
    return agentCapabilities;
}

export function getAgentCapabilities() { return agentCapabilities; }

export const doupoAgent = Object.freeze({
    coordinator: agentCoordinator,
    facts: agentFactsLibrary,
    factCheck: options => runFactCheck(options),
    factStatus: () => ({ running: Boolean(verifyRunning), lastFloor: verifyDecidedFloor?.floor ?? null, entries: verifyLedger.entries.length, exemptions: verifyLedger.exemptions.length, lastRun: verifyLedger.lastRun ?? null }),
    impacts: agentImpactRuntime,
    impactRuntime: agentImpactRuntime,
    impactInjection: options => agentImpactInjection.write(typeof options === 'object' && options ? options : {}),
    settleAdjudicate: options => writeSettleAdjudicationForPrompt(typeof options === 'object' && options ? options : {}),
    impactDecide: options => runImpactDecision(options),
    impactRestoreFromChat: () => restoreImpactFromChat(),
    impactStatus: () => agentImpactRuntime.status(),
    impactArchived: () => agentImpactRuntime.archived(),
    impactInjectedIds: () => agentImpactInjection.injectedIds(),
    impactLast: () => lastImpactResult,
    npcs: agentNpcDecisionGuard,
    npcAutonomy: agentNpcAutonomyPlanner,
    npcPlanReassessment: agentNpcPlanReassessment,
    npcConflict: agentNpcConflictCoordinator,
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
    npcColdUndo: () => undoLastNpcColdConfirm(),
    npcColdStatus: () => agentNpcColdRuntime.status(),
    npcColdRestoreFromChat: () => restoreNpcColdFromChat(),
    // 全局人物关系图：收边/体检/二跳关系/随聊天存取。
    npcRelations: () => agentNpcRelations.snapshot(),
    npcRelationsUpsert: edges => agentNpcRelations.upsert(edges),
    npcRelationsRemove: name => agentNpcRelations.remove(name),
    npcRelationsAsymmetries: () => agentNpcRelations.asymmetries(),
    npcRelationsHopLines: names => agentNpcRelations.hopLines(names),
    npcRelationsRestore: value => agentNpcRelations.restore(value),
    npcRelationsRestoreFromChat: () => restoreNpcRelationsFromChat(),
    // 传闻触达与一致性体检：都是草稿确认/旁路审计，不自动写账、不拦正文。
    npcGossipRun: panel => runNpcGossip(panel),
    npcConsistencyRun: options => runNpcConsistencyCheck(options),
    npcConsistencyState: () => lastNpcConsistency,
    // 情绪快变量：手动按当前世界天数清一遍到期情绪（注入路径已自动调用）。
    npcDecayMoods: day => agentNpcLedger.decayMoods(day),
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
    worldPersist: () => { persistWorld(); return 'ok'; },
    selfJournal: () => agentSelfRuntime.journal(),
    dbBridgeStatus: () => agentDbBridge.status(),
    dbBridgeAdopt: () => Promise.all([adoptSelfFromDb(), adoptMemoryFromDb()]),
    memoryRuntime: agentMemoryRuntime,
    memoryInjection: writeMemoryInjectionForPrompt,
    wakeUpInjection: writeWakeUpInjectionForPrompt,
    memoryRecall: runMemoryRecall,
    memoryDecide: options => runMemoryDecision(options),
    factsSelect: options => agentFactsSelector.select(options),
    memoryApplyPersisted: operations => applyMemoryOps(operations),
    memoryApplyFromLatestReply: () => applyMemoryOpsFromLatestReply(),
    memoryRestoreFromChat: () => restoreMemoryFromChat(),
    memoryStatus: () => agentMemoryRuntime.status(),
    memorySnapshot: () => agentMemoryRuntime.snapshot(),
    worldRuntime: agentWorldRuntime,
    worldInjection: writeWorldInjectionForPrompt,
    worldApplyFromLatestReply: () => applyWorldOpsFromLatestReply(),
    worldRestoreFromChat: () => restoreWorldFromChat(),
    ui: agentUiState,
    state: agentStateStore,
    capabilities: Object.freeze({ probe: options => probeAgentCapabilities(options), get: () => getAgentCapabilities() }),
    stages: agentTurnStages,
    llm: agentLlmClient,
    messages: agentMessageAdapter,
    audit: agentAuditLog,
    beginTask: task => agentCoordinator.begin(task),
    updateTask: (taskId, status, fields) => agentCoordinator.update(taskId, status, fields),
});

function text(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
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

/** 「让模型决定一次」的想法弹窗：dock 懒挂到面板根部，五个决定/召回/记录按钮共用一份表单。 */
function ensureDecideNoteDock(panel) {
    let dock = panel?.querySelector(':scope > [data-modal-dock="decide-note"]');
    if (dock) return dock;
    dock = makeElement('div', 'dai-modal-dock');
    dock.dataset.modalDock = 'decide-note';
    dock.hidden = true;
    const card = makeElement('div', 'dai-settings-card');
    const head = makeElement('div', 'dai-card-heading');
    const title = makeElement('b', null, '这轮想让模型特别注意什么？');
    const hint = makeElement('small');
    hint.dataset.decideNoteHint = '';
    head.append(title, hint);
    const row = makeElement('label', 'dai-setting-row');
    const small = makeElement('span', null, '想法');
    const smallText = makeElement('small', null, '留空＝按提示词正常决定；填了就作为「玩家本轮补充指示」随提示词一起发给模型。');
    const area = makeElement('textarea');
    area.rows = 5;
    area.spellcheck = false;
    area.maxLength = 500;
    area.placeholder = '例如：让老执事对萧炎起疑；这轮重点检查丹药库存。';
    small.append(smallText);
    row.append(small, area);
    const actions = makeElement('div', 'dai-setting-row dai-setting-actions');
    const run = makeElement('button', 'dai-button', '就这样，跑一次');
    run.type = 'button';
    run.dataset.decideNoteRun = '';
    const cancel = makeElement('button', 'dai-secondary-button', '算了');
    cancel.type = 'button';
    cancel.dataset.agentModalClose = '';
    actions.append(run, cancel);
    card.append(head, row, actions);
    dock.append(card);
    panel.append(dock);
    return dock;
}

/** 打开想法弹窗：run(note) 是点「就这样，跑一次」后真正发起的决定调用。 */
function openDecideNoteModal(panel, { title, hint, placeholder, run } = {}) {
    const dock = ensureDecideNoteDock(panel);
    if (!dock || typeof run !== 'function') return;
    const area = dock.querySelector('textarea');
    const hintElement = dock.querySelector('[data-decide-note-hint]');
    if (hintElement) hintElement.textContent = hint ?? '';
    if (area) {
        area.value = '';
        area.placeholder = placeholder ?? '这轮想让模型特别注意什么？（可留空）';
    }
    dock.__decideRun = note => run(note);
    openAgentModal(panel, title ?? '让模型决定一次', dock);
    area?.focus?.();
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
let orbLlmActivityBound = false;

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
        const ball = makeElement('button', 'dai-orb-ball');
        ball.innerHTML = daiIcon('flame');
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
            const icon = makeElement('button', 'dai-orb-icon');
            icon.innerHTML = daiIcon(DAI_ORB_ICON_NAMES[item.id] ?? '');
            if (!icon.innerHTML) icon.textContent = item.icon;
            icon.type = 'button';
            icon.dataset.orbItem = item.id;
            icon.title = `${item.title} · ${item.hint}`;
            icon.setAttribute('aria-label', `查看${item.title}信息`);
            icon.addEventListener('click', () => { orbState.select(item.id); syncOrbHud(); });
            capsule.append(icon);
        }
        // 系统图标：一键打开 Agent 设置面板（左上角的旧入口已退役）。
        const systemIcon = makeElement('button', 'dai-orb-icon');
        systemIcon.innerHTML = daiIcon(DAI_ORB_ICON_NAMES.system);
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
            // 一层层往回退：先收初始化弹窗，再收详情小卡，再收「全部」副窗，最后才收长条。
            if (orbInitPopElement) { closeOrbSelfInitPopup(); return; }
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
        window.addEventListener('resize', () => { applyOrbPosition(); positionOrbNpcPopup(); positionOrbItemPopup(); positionOrbListPopup(); positionOrbSelfInitPopup(); });
    }
    // 总控窗开着时，任何一路模型调用起飞/落地都就地重画：转圈与打勾不用轮询。
    if (!orbLlmActivityBound) {
        orbLlmActivityBound = true;
        agentLlmClient.onActivity?.(() => {
            if (!orbElement || orbState.collapsed || orbState.panelId !== 'overview') return;
            refreshOpenOrbPanel();
        });
    }
    syncOrbHud();
    applyOrbPosition();
}

function syncOrbHud() {
    if (!orbElement) return;
    // 开放世界随开关存在：开关关＝没有这个功能，图标整个隐藏；开着窗时连窗一起收。
    const sandboxOff = currentSettings().enableSandboxMode !== true;
    if (sandboxOff && orbState.panelId === 'sandbox') orbState.select('sandbox');
    const icons = [...orbElement.querySelectorAll('.dai-orb-icon')];
    const visibleIcons = [];
    icons.forEach(icon => {
        const hidden = icon.dataset.orbItem === 'sandbox' && sandboxOff;
        icon.hidden = hidden;
        if (!hidden) visibleIcons.push(icon);
    });
    visibleIcons.forEach((icon, index) => {
        icon.style.transitionDelay = orbState.collapsed ? '0ms' : `${90 + index * 26}ms`;
        icon.classList.toggle('is-active', orbState.panelId === icon.dataset.orbItem);
    });
    orbElement.dataset.state = orbState.collapsed ? 'collapsed' : 'expanded';
    // 调用版本落在球根上：进阶版的徽章、描边光环等视觉区分走 CSS 的 data-api-mode 钩子。
    orbElement.dataset.apiMode = apiMode();
    const capsule = orbElement.querySelector('.dai-orb-capsule');
    // 收起＝只剩顶上的球；展开＝球帽 + 可见图标 + 底帽，两态都给显式高度，过渡才连得上。
    if (capsule) capsule.style.height = orbState.collapsed ? '3rem' : `${visibleIcons.length * 2.9 + 3.7}rem`;
    orbElement.querySelector('.dai-orb-ball')?.setAttribute('aria-expanded', orbState.collapsed ? 'false' : 'true');
    const panel = orbElement.querySelector('.dai-orb-panel');
    if (!panel) return;
    // 初始化弹窗只属于纳戒窗：收起或换图标都收走。
    if (orbInitPopElement && (orbState.collapsed || orbState.panelId !== 'self')) closeOrbSelfInitPopup();
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

/** 收集各信息窗的只读数据；哪路运行时没就绪就缺哪块，窗里显示“暂无”。 */
function collectOrbData() {
    const settings = currentSettings();
    const safe = getter => { try { return getter(); } catch { return undefined; } };
    const manualVolume = Number.isInteger(settings.setting?.progress) && settings.setting.progress > 0 ? settings.setting.progress : null;
    const autoVolume = Number.isInteger(settings.facts?.currentVolume) && settings.facts.currentVolume > 0 ? settings.facts.currentVolume : null;
    const volume = manualVolume ?? autoVolume;
    return {
        calls: safe(() => agentLlmClient.callLog()) ?? [],
        active: safe(() => agentLlmClient.activeLabels()) ?? [],
        mode: settings.apiMode === 'lite' || settings.apiMode === 'advanced' ? settings.apiMode : 'full',
        // 简略版总控的动态分路：功能开关拨了谁，合并调用的说明文字就带谁。
        litePickParts: (() => { const jobs = safe(litePickConsumers) ?? {}; return [jobs.facts && '原著', jobs.impact && '影响', jobs.memory && '记忆'].filter(Boolean); })(),
        liteSettleParts: (() => { const gatesNow = safe(liteSettleGates) ?? {}; return [gatesNow.npc && '人物', gatesNow.world && '世界', gatesNow.impact && '影响', gatesNow.self && '纳戒', gatesNow.memory && '记忆'].filter(Boolean); })(),
        dashboard: buildControlDashboard({
            settings,
            records: safe(() => agentAuditLog.list({ limit: 2000 })) ?? [],
            tasks: safe(() => agentCoordinator.list()) ?? [],
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
        sandbox: {
            // 开关关＝这个功能不存在（图标都隐藏）；开＝读本局的正式口径记录。
            enabled: settings.enableSandboxMode === true,
            read: safe(() => agentSandboxMode.read(currentAgentScope())),
        },
    };
}

/** 悬浮球信息窗的控制条：每功能一个启用开关，每一路模型调用一个重 roll 按钮。
 *  重跑统一走设置页同款入口（source:'manual' 绕过防重缓存），同楼重 roll 由各 runtime 的
 *  「撤销上一版贡献再落账」机制兜底，不会双份记账。 */
const ORB_PANEL_CONTROLS = Object.freeze({
    facts: { setting: 'setting.enabled', title: '原著设定注入', rerolls: [] },
    settle: { setting: 'enableActionResolution', title: '行动结算', rerolls: [] },
    world: { setting: 'world.eventEnabled', title: '世界运转', rerolls: [['重roll 决定', () => runWorldDecision({ source: 'manual' })]] },
    self: {
        setting: 'enableSelfLedger',
        title: '纳戒',
        rerolls: [['重roll 决定', () => runSelfDecision({ source: 'manual' })]],
        actions: [['初始化', '弹出纳戒初始化：填开局档案，落账并同步 MVU', toggleOrbSelfInitPopup]],
    },
    memory: {
        setting: 'enableMemoryLedger',
        title: '记忆存储',
        rerolls: [
            ['重roll 决定', () => runMemoryDecision({ source: 'manual' })],
            ['重roll 总结', () => runMemoryConsolidation({ source: 'manual' })],
        ],
    },
    npcledger: { setting: 'enableNpcLedger', title: '人物簿', rerolls: [['重记这一楼', () => runNpcLedgerRecord({ source: 'manual' })]] },
    cold: { rerolls: [] },
    impact: { setting: 'enablePlayerImpact', title: '世界影响', rerolls: [['重记这一楼', () => runImpactDecision({ source: 'manual' })]] },
    sandbox: { setting: 'enableSandboxMode', title: '开放世界', rerolls: [] },
});

function readSettingPath(path) {
    return String(path || '').split('.').filter(Boolean).reduce((object, key) => object?.[key], currentSettings());
}

/** 面板顶部的控制条：启用开关 + 每路模型调用的重 roll 按钮（重跑中按钮自锁）。 */
function buildOrbPanelControls(title, id) {
    const control = ORB_PANEL_CONTROLS[id];
    if (!control) return null;
    const strip = makeElement('div', 'dai-orb-actions');
    if (control.setting) {
        const label = makeElement('label', 'dai-orb-switch');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = readSettingPath(control.setting) !== false;
        input.setAttribute('aria-label', `启用${title}`);
        input.addEventListener('change', () => {
            const result = updateSetting(control.setting, input.checked);
            void Promise.resolve(hostStorage.saveSettings()).catch(() => { /* 保存失败下次改动会再试 */ });
            if (result.status !== 'ready') input.checked = !input.checked;
            syncOrbHud();
        });
        label.append(input, makeElement('span', '', '启用'));
        strip.append(label);
    }
    for (const [text, run] of control.rerolls ?? []) {
        const button = makeElement('button', 'dai-orb-action', text);
        button.type = 'button';
        button.title = '对最近一楼重新跑一次这一路模型调用';
        button.addEventListener('click', () => {
            if (button.disabled) return;
            const original = button.textContent;
            button.disabled = true;
            button.textContent = '…';
            void (async () => {
                try { await run(); } catch (error) { console.warn('[doupo-agent] 悬浮球重跑失败：', error?.message ?? error); }
                finally {
                    button.disabled = false;
                    button.textContent = original;
                    syncOrbHud();
                }
            })();
        });
        strip.append(button);
    }
    // actions 与重roll长得一样，但只是开本地弹窗（如纳戒初始化），不去碰模型调用。
    for (const [text, hint, run] of control.actions ?? []) {
        const button = makeElement('button', 'dai-orb-action', text);
        button.type = 'button';
        button.title = hint || text;
        button.addEventListener('click', () => {
            try { run(); } catch (error) { console.warn('[doupo-agent] 悬浮球操作失败：', error?.message ?? error); }
        });
        strip.append(button);
    }
    return strip.children.length ? strip : null;
}

/** 总控窗调用状态记号：在途转圈、✓/✗/无，纯展示，状态值来自 orb-hud 的行投影。 */
function buildOrbCallStatusMark(status) {
    if (status === 'running') return makeElement('span', 'dai-orb-spin');
    const mark = makeElement('span', 'dai-orb-mark', status === 'ok' ? '✓' : status === 'failed' ? '✗' : '无');
    mark.classList.add(`is-${status}`);
    return mark;
}

/**
 * 模块行尾的调用标记组：短名常显（列才对得齐），每个标记悬停能看渠道名+状态详情；
 * 可重roll 的渠道在标记上再挂一枚圆圈箭头——箭头长在谁身上，重跑的就是谁那一路。
 */
function buildOrbRowMarks(marks) {
    const host = makeElement('span', 'dai-orb-row-marks');
    for (const item of Array.isArray(marks) ? marks : []) {
        if (!item || typeof item.status !== 'string') continue;
        const shortName = item.short ?? String(item.label ?? '').replace(/^记忆/, '');
        const chip = makeElement('span', 'dai-orb-channel-mark', shortName);
        chip.title = `${item.label ?? ''}：${item.detail ?? ''}`;
        chip.append(buildOrbCallStatusMark(item.status));
        // 失败的渠道标记可点：弹出该路的详情小卡（手机没有悬停，点击是唯一入口）。
        if (item.status === 'failed') {
            chip.classList.add('is-clickable');
            const time = typeof item.at === 'string' && item.at ? new Date(item.at).toLocaleTimeString() : '';
            chip.addEventListener('click', () => toggleOrbItemPopup({
                kind: 'callfail',
                id: `${item.label ?? '未标注调用'}@${item.at ?? ''}`,
                label: item.label ?? '未标注调用',
                time, model: item.model ?? '',
                status: null, endpoint: item.endpoint ?? '',
                error: item.error ?? item.detail ?? '失败',
                body: item.body ?? '',
            }));
        }
        const reroll = buildOrbMarkReroll(item.reroll);
        if (reroll) chip.append(reroll);
        host.append(chip);
    }
    return host;
}

/** 总控渠道标记上「重roll 圆圈箭头」的执行函数表：id 与 orb-hud 的 MODULE_CHANNELS reroll / LITE_REROLL_ACTIONS 对号。
 *  每一路请求一枚箭头，生成前/生成后的调用都覆盖（选条/召回/挑选决定下一轮正文带什么，重roll＝立刻按当前聊天重挑一遍，
 *  下一次生成前拦截器会照常重跑）；重跑统一走 source:'manual' 绕过防重缓存，同楼重 roll 由各 runtime 撤销上一版再落账；
 *  行动结算例外——手动口径与设置页同款「预览一次（不注入）」，注入仍只发生在生成前拦截器。 */
const ORB_OVERVIEW_REROLLS = Object.freeze({
    world: () => runWorldDecision({ source: 'manual' }),
    self: () => runSelfDecision({ source: 'manual' }),
    memory: () => runMemoryDecision({ source: 'manual' }),
    npc: () => runNpcLedgerRecord({ source: 'manual' }),
    impact: () => runImpactDecision({ source: 'manual' }),
    plot: () => runPlotDecision({ source: 'manual' }),
    facts: () => runFactCheck({ source: 'manual' }),
    action: () => writeSettleAdjudicationForPrompt({ force: true, preview: true }),
    recall: () => runMemoryRecall({ source: 'manual' }),
    factsselect: () => prepareInjectionForPrompt({ chat: getHostContext()?.chat }),
    impactpick: () => { agentImpactInjection.invalidate(); return agentImpactInjection.write({ chat: getHostContext()?.chat }); },
    litepick: () => { agentLitePick.invalidate(); return agentLitePick.run({ chat: getHostContext()?.chat }); },
    litesettle: () => agentLiteSettle.run({ source: 'manual' }),
});

/** 渠道标记上的重roll 圆圈箭头：一键重跑该渠道的模型调用。忙碌态由标记的 running 态数据驱动
 *  （总控窗会被调用活动高频重画，按钮本地状态守不住），在途时禁用并让箭头自转。 */
function buildOrbMarkReroll(reroll) {
    if (!reroll || typeof reroll.id !== 'string') return null;
    const run = ORB_OVERVIEW_REROLLS[reroll.id];
    if (!run) return null;
    const button = makeElement('button', 'dai-orb-mark-reroll');
    button.type = 'button';
    button.title = `${reroll.hint ?? '重roll'}：对最近一楼重跑这一路调用`;
    button.setAttribute('aria-label', reroll.hint ?? '重roll');
    button.innerHTML = daiIcon('reroll');
    if (reroll.busy) {
        button.disabled = true;
        button.classList.add('is-busy');
    }
    button.addEventListener('click', () => {
        if (button.disabled) return;
        button.disabled = true;
        void (async () => {
            try { await run(); } catch (error) { console.warn('[doupo-agent] 总控重roll失败：', error?.message ?? error); }
            finally { syncOrbHud(); }
        })();
    });
    return button;
}

function renderOrbPanel(panel, id) {    const view = buildOrbPanels(collectOrbData())[id];
    if (!view) { panel.hidden = true; return; }
    const heading = makeElement('header', 'dai-orb-panel-head');
    const titleBox = makeElement('div');
    const headTitle = makeElement('b', '', view.title);
    const headIconHtml = daiIcon(DAI_ORB_ICON_NAMES[id] ?? '');
    if (headIconHtml) {
        const headIconHost = document.createElement('span');
        headIconHost.innerHTML = headIconHtml;
        headTitle.prepend(headIconHost.firstChild);
    }
    // 进阶版徽章：总控窗标题旁一枚小牌，信息窗本体另有描边光环（根上的 data-api-mode 出）。
    // 面板自己的 data-api-mode 三个版本都落：简略版的标记槽收窄走这份。
    if (view.apiMode === 'advanced') headTitle.append(makeElement('span', 'dai-orb-mode-badge', '进阶'));
    if (view.apiMode) panel.dataset.apiMode = view.apiMode;
    else delete panel.dataset.apiMode;
    titleBox.append(headTitle, makeElement('small', '', view.summary));
    heading.append(titleBox);
    const close = makeElement('button', 'dai-orb-panel-close', '×');
    close.type = 'button';
    close.title = '关闭信息窗';
    close.setAttribute('aria-label', `关闭${view.title}信息窗`);
    close.addEventListener('click', () => { orbState.select(id); syncOrbHud(); });
    heading.append(close);
    const body = makeElement('div', 'dai-orb-panel-body');
    const controls = buildOrbPanelControls(view.title, id);
    if (controls) body.append(controls);
    for (const row of view.rows) {
        const line = makeElement('p', 'dai-orb-row');
        if (row.tone) line.dataset.tone = row.tone;
        if (row.hint) line.title = row.hint;
        // 带引用的行（如「上次失败」）整行可点：手机没有悬停，点击弹详情小卡。
        if (row.ref) {
            line.classList.add('is-clickable');
            line.tabIndex = 0;
            line.setAttribute('role', 'button');
            line.setAttribute('aria-label', `查看${row.label}详情`);
            line.addEventListener('click', () => toggleOrbItemPopup(row.ref));
            line.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                toggleOrbItemPopup(row.ref);
            });
        }
        const labelSpan = makeElement('span', 'dai-orb-row-label', row.label);
        if (row.status) labelSpan.prepend(buildOrbCallStatusMark(row.status));
        line.append(labelSpan, makeElement('span', 'dai-orb-row-value', row.value));
        if (Array.isArray(row.marks)) line.append(buildOrbRowMarks(row.marks));
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
    if (view?.title) titleBox.append(makeElement('small', 'dai-orb-pop-sub', `${view.title} · 全部`));
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

// —— 悬浮球纳戒初始化弹窗：信息窗控制条上的「初始化」弹出开局档案表单。——
// 设置页「初始化主角档案（MVU）」的同款字段与落账路径（applySelfOps → persistSelf →
// MVU/数据库镜像都由 persistSelf 带走）；留空的项保持原样。弹窗挂在 orbElement 里，
// 点它不算点外面，长条不会因此收起；换图标/收起/Esc 一起收走。——
let orbInitPopElement;

/** 与设置页初始化表单同一份字段清单：key、标签、长度上限；gender 是点选，gold 是数字。 */
const ORB_SELF_INIT_FIELDS = [
    { key: 'name', label: '姓名', max: 24 },
    { key: 'gender', label: '性别', options: ['', '男', '女'] },
    { key: 'age', label: '年龄', max: 12 },
    { key: 'origin', label: '出身', max: 24 },
    { key: 'attribute', label: '斗气属性', max: 12 },
    { key: 'realm', label: '境界', max: 12 },
    { key: 'stage', label: '段位', max: 10 },
    { key: 'gold', label: '金币', kind: 'number' },
];

function closeOrbSelfInitPopup() {
    orbInitPopElement?.remove();
    orbInitPopElement = undefined;
}

function toggleOrbSelfInitPopup() {
    if (orbInitPopElement) closeOrbSelfInitPopup();
    else openOrbSelfInitPopup();
}

/** 打开时按当前账本预填：这弹窗兼作「现在纳戒里有什么」的快改入口，空账本就是空表单。 */
function openOrbSelfInitPopup() {
    if (!orbElement || orbState.panelId !== 'self') return;
    closeOrbListPopup();
    closeOrbItemPopup();
    orbInitPopElement?.remove();
    orbInitPopElement = buildOrbSelfInitPopup();
    orbElement.append(orbInitPopElement);
    positionOrbSelfInitPopup();
    orbInitPopElement.querySelector('input, select')?.focus();
}

function buildOrbSelfInitPopup() {
    const snapshot = agentSelfRuntime.snapshot();
    const current = {
        name: snapshot?.profile?.name ?? '', gender: snapshot?.profile?.gender ?? '',
        age: snapshot?.profile?.age ?? '', origin: snapshot?.profile?.origin ?? '',
        attribute: snapshot?.profile?.attribute ?? '',
        realm: snapshot?.realm?.realm ?? '', stage: snapshot?.realm?.stage ?? '',
        gold: Number.isInteger(snapshot?.gold) && snapshot.gold > 0 ? String(snapshot.gold) : '',
    };
    const pop = makeElement('aside', 'dai-orb-pop dai-orb-pop-init');
    pop.dataset.orbInitPop = 'self';
    const head = makeElement('div', 'dai-orb-pop-head');
    const titleBox = makeElement('div');
    const nameLine = makeElement('div', 'dai-orb-pop-name');
    nameLine.append(makeElement('b', '', '纳戒初始化'), makeElement('small', '', `第 ${snapshot?.day ?? 1} 天`));
    titleBox.append(nameLine);
    titleBox.append(makeElement('small', 'dai-orb-pop-sub', '填开局档案，写入纳戒账本并同步 MVU 与数据库镜像；留空的项保持原样。'));
    const close = makeElement('button', 'dai-orb-pop-close', '×');
    close.type = 'button';
    close.title = '收起纳戒初始化';
    close.setAttribute('aria-label', '收起纳戒初始化');
    close.addEventListener('click', closeOrbSelfInitPopup);
    head.append(titleBox, close);
    const body = makeElement('div', 'dai-orb-pop-init-body');
    const grid = makeElement('div', 'dai-setting-grid');
    for (const field of ORB_SELF_INIT_FIELDS) {
        const row = makeElement('label', 'dai-setting-row');
        const label = makeElement('span');
        label.append(makeElement('b', '', field.label));
        row.append(label);
        let input;
        if (field.options) {
            input = document.createElement('select');
            for (const option of field.options) {
                const opt = document.createElement('option');
                opt.value = option;
                opt.textContent = option || '（不填）';
                input.append(opt);
            }
            input.value = field.options.includes(current[field.key]) ? current[field.key] : '';
        } else {
            input = document.createElement('input');
            input.type = field.kind === 'number' ? 'number' : 'text';
            if (field.kind === 'number') {
                input.min = '0';
                input.max = '9999999';
                input.step = '1';
                input.placeholder = '初始身家';
            } else if (field.max) {
                input.maxLength = field.max;
            }
            if (field.key === 'age') input.placeholder = '如 15 / 十五岁';
            if (field.key === 'origin') input.placeholder = '如 萧家 / 青山镇';
            if (field.key === 'attribute') input.placeholder = '火/风/雷/无属性…';
            if (field.key === 'realm') input.placeholder = '斗之气/斗者…';
            if (field.key === 'stage') input.placeholder = '三段/一星…';
            input.value = current[field.key] ?? '';
        }
        input.dataset.orbInitField = field.key;
        row.append(input);
        grid.append(row);
    }
    body.append(grid);
    const actions = makeElement('div', 'dai-turn-actions dai-orb-init-actions');
    const run = makeElement('button', 'dai-button', '初始化并同步 MVU');
    run.type = 'button';
    const status = makeElement('p', 'dai-turn-result');
    status.setAttribute('role', 'status');
    run.addEventListener('click', () => { void submitOrbSelfInit(pop, run, status); });
    actions.append(run, status);
    body.append(actions);
    pop.append(head, body);
    return pop;
}

/** 表单 → 操作集 → applySelfOps（落账 + persistSelf 存档 + MVU/数据库镜像）→ 状态行回报。 */
async function submitOrbSelfInit(pop, button, status) {
    if (button.disabled) return;
    const read = key => pop.querySelector(`[data-orb-init-field="${key}"]`)?.value?.trim() ?? '';
    const ops = [];
    for (const field of ['name', 'gender', 'age', 'origin', 'attribute']) {
        const text = read(field);
        if (text) ops.push({ op: 'setProfile', field, text });
    }
    const realm = read('realm');
    const stage = read('stage');
    if (realm || stage) ops.push({ op: 'setRealm', realm, stage });
    const gold = Number(read('gold'));
    if (Number.isFinite(gold) && gold > 0) ops.push({ op: 'setGold', amount: Math.floor(gold) });
    if (!ops.length) {
        status.textContent = '先填至少一项再初始化。';
        return;
    }
    button.disabled = true;
    try {
        const result = applySelfOps(ops, { source: 'panel' });
        const saved = result?.persistence ? await Promise.resolve(result.persistence).catch(() => null) : null;
        if (saved && saved.status !== 'saved') {
            status.textContent = '内存已变更，但存档未保存；请直接重试初始化保存。';
            return;
        }
        const applied = (result?.applied ?? []).map(item => item?.summary ?? '').filter(Boolean);
        const rejected = (result?.rejected ?? []).map(item => `${item?.field ?? item?.op ?? '?'}：${item?.reason ?? '未生效'}`);
        status.textContent = applied.length
            ? `已写入 ${applied.length} 项：${applied.join('；')}${rejected.length ? `。未生效：${rejected.join('；')}` : ''}`
            : `未生效：${rejected.join('；') || '原因不明'}`;
        syncOrbHud();
    } catch (error) {
        status.textContent = `初始化失败：${String(error?.message ?? error).slice(0, 140)}`;
    } finally {
        button.disabled = false;
    }
}

function positionOrbSelfInitPopup() {
    positionOrbPopElement(orbInitPopElement);
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
    // 调用失败详情：数据直接骑在 ref 上（体检条目随出随没，不做回查）；手机点失败行/✗ 标记就弹这张卡。
    if (ref.kind === 'callfail') {
        const statusText = [ref.status ? `HTTP ${ref.status}` : '', ref.recovered ? '已恢复' : ''].filter(Boolean).join(' · ');
        return {
            title: ref.label ?? '调用失败',
            sub: [ref.time, ref.model].filter(Boolean).join(' · ') || '调用失败详情',
            groups: [
                { heading: '错误详情', rows: [['状态', statusText], ['端点', popText(ref.endpoint)], ['错误', popText(ref.error)], ['响应体', popText(ref.body)]] },
                { heading: '说明', rows: [['自定义接口', '响应体是服务商返回的真实原因，密钥已自动打码'], ['酒馆连接', 'ST 只抛裸错误、拿不到响应体；完整输出去 F12 控制台看'], ['下一步', '模型名/端点错就改方案绑定，额度或策略问题去服务商后台核对']] },
            ],
        };
    }
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
    orbInitPopElement = undefined;
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

/* ── Agent 能力地图：一屏看全扩展能做什么 ─────────────────
 * 12 个模块一枚图标卡（悬浮球同款图标/名称），绿点=本局启用，灰点=停用；
 * 悬停看一句话说明。纯展示，不改任何设置。 */

const CAPABILITY_ENABLE_KEYS = Object.freeze({
    world: 'enableWorldProgress', self: 'enableSelfLedger', memory: 'enableMemoryLedger',
    npcledger: 'enableNpcLedger', cold: 'enableNpcLedger', impact: 'enablePlayerImpact',
    facts: 'enableFactsLibrary', settle: 'enableActionResolution', mirror: 'enableDbBridge',
    sandbox: 'enableSandboxMode', overview: null, journal: null,
});

function renderAgentCapabilityMap(target) {
    const grid = target?.querySelector?.('[data-agent-capability-grid]');
    if (!grid) return;
    const settings = currentSettings();
    grid.replaceChildren(...ORB_ITEMS.map(item => {
        const key = CAPABILITY_ENABLE_KEYS[item.id] ?? null;
        const enabled = key ? settings?.[key] !== false : true;
        const cell = makeElement('div', `dai-cap-cell${enabled ? ' is-on' : ''}`);
        cell.title = `${item.title}｜${item.hint}${key ? `（开关：${key}）` : ''}`;
        const head = makeElement('div', 'dai-cap-head');
        head.append(makeElement('span', 'dai-cap-icon', item.icon), makeElement('b', '', item.title), makeElement('span', 'dai-cap-dot'));
        cell.append(head, makeElement('small', '', item.hint));
        return cell;
    }));
}

function refreshControlDashboard() {
    if (typeof document === 'undefined') return;
    const panel = document.getElementById(SETTINGS_PANEL_ID);
    if (!panel || panel.hidden) return;
    renderAgentCapabilityMap(panel);
    const list = panel.querySelector('[data-module-list]');
    if (!list) return;
    const view = buildControlDashboard({
        settings: currentSettings(), records: agentAuditLog.list({ limit: 2000 }),
        tasks: agentCoordinator.list(),
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
    followed: '口径已跟随开关换向：开＝开放世界，关＝主线；立即生效并已落存档，沙盒任务与历史保留。',
    cancelled: '已取消本局口径切换，维持原口径。',
    nothingPending: '没有待确认的口径切换。',
});

// 沙盒口径接线（实现在 sandbox/wiring.js）：运行时与宿主存储注入，测试直接喂桩。
const { persistSandboxMode, restoreSandboxFromChat, sandboxModeActive } = createSandboxWiring({
    scopeOf: currentAgentScope, runtime: agentSandboxMode, hostStorage: () => hostStorage, currentSettings,
    coordinator: agentCoordinator, stateStore: agentStateStore, invalidateContinuations: invalidateAgentContinuations,
    setSandboxStatus, messages: SANDBOX_MODE_MESSAGES,
    renderRuntime: renderRuntimeMode, getPanel: () => document.getElementById(SETTINGS_PANEL_ID),
});

function setSandboxStatus(text) {
    const element = document.querySelector(`#${SETTINGS_PANEL_ID} [data-sandbox-status]`);
    if (element) element.textContent = text;
}

/** 把设置面板里的沙盒开关与惯性/自主选项同步到本局口径记录：随开随关，拨了立即换向并落存档。 */
function syncSandboxModeFromSettings() {
    const settings = currentSettings();
    const scope = currentAgentScope();
    if (!scope?.sessionId || !scope?.branchId) {
        setSandboxStatus(SANDBOX_MODE_MESSAGES.unavailable);
        return { status: 'unavailable' };
    }
    // 开关随开随关：口径直接跟随开关换向——不申请、不待确认、不绑定任务。
    // 沙盒的任务与历史原样保留，关了再开能续上；换向立即落存档，下一轮生成按新口径跑。
    try {
        const flipped = agentSandboxMode.followSwitch({
            sessionId: scope.sessionId,
            branchId: scope.branchId,
            sandbox: settings.enableSandboxMode === true,
            inertia: settings.sandbox?.inertia,
            canonCharactersAutonomous: settings.sandbox?.canonCharactersAutonomous,
        });
        void persistSandboxMode();
        setSandboxStatus(SANDBOX_MODE_MESSAGES.followed);
        renderRuntimeMode(document.getElementById(SETTINGS_PANEL_ID));
        return flipped;
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
            if (lastSettleAdjudication) {
                const blocked = settleBlockerStatus();
                recordSettleAdjudication({ ...lastSettleAdjudication,
                    status: blocked ?? 'stale', cleared: cleared.status === 'cleared',
                    summary: blocked === 'unsupported' ? '沙盒口径下行动结算不参与；切回正式口径后恢复' : '设置已变更，旧判定不再约束正文' });
            }
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
        renderCallSummary(panel);
        const cover = panel.querySelector('[data-cover-script-status]');
        if (cover) cover.textContent = probeCoverScriptStatus().text;
    }
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
        ['verify.prompt', VERIFY_PROMPT],
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
    renderVerifyEntries(panel);
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
            <i class="dai-frame-corner is-tl" aria-hidden="true"></i><i class="dai-frame-corner is-tr" aria-hidden="true"></i><i class="dai-frame-corner is-br" aria-hidden="true"></i><i class="dai-frame-corner is-bl" aria-hidden="true"></i>
            <aside class="dai-settings-sidebar">
                <div class="dai-settings-brand"><span class="dai-settings-mark">${daiIcon('flame')}</span><div><strong>斗破苍穹</strong><small>同人 Agent · 控制中枢</small></div></div>
                <nav class="dai-settings-nav" aria-label="Agent 功能页面">
                    <button type="button" class="dai-nav-item is-active" data-settings-page="overview"><span class="dai-nav-icon">${daiIcon('ding')}</span><span><b>总控</b><small>模块简况与外观</small></span></button>
                    <p class="dai-nav-label">功 法</p>
                    <button type="button" class="dai-nav-item" data-settings-page="apis"><span class="dai-nav-icon">${daiIcon('letter')}</span><span><b>API设置</b><small>存好接口方案，各功能直接选</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="hub"><span class="dai-nav-icon">${daiIcon('lotus')}</span><span><b>模型设置</b><small>每一路模型调用的接口与参数</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="facts"><span class="dai-nav-icon">${daiIcon('book')}</span><span><b>原著资料</b><small>事实与资料查询</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="action"><span class="dai-nav-icon">${daiIcon('balance')}</span><span><b>行动结算</b><small>结果与资源变化</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="world"><span class="dai-nav-icon">${daiIcon('mountain')}</span><span><b>世界运转</b><small>时间、事件与世界现状</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="npc"><span class="dai-nav-icon">${daiIcon('person')}</span><span><b>NPC 决策</b><small>人物自主行动</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="npcledger"><span class="dai-nav-icon">${daiIcon('ledger')}</span><span><b>人物簿</b><small>每个人的档案与好感</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="self"><span class="dai-nav-icon">${daiIcon('ring')}</span><span><b>纳戒</b><small>主角自身与随身之物</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="memory"><span class="dai-nav-icon">${daiIcon('slip')}</span><span><b>记忆存储</b><small>小记忆/大记忆，按需召回</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="impact"><span class="dai-nav-icon">${daiIcon('ripple')}</span><span><b>世界影响</b><small>记录世界被改成了什么样</small></span></button>
                    <button type="button" class="dai-nav-item" data-settings-page="sandbox"><span class="dai-nav-icon">${daiIcon('compass')}</span><span><b>开放世界</b><small>开放世界 / 主线双口径</small></span></button>
                    <p class="dai-nav-label">器 关</p>
                    <button type="button" class="dai-nav-item" data-settings-page="runtime"><span class="dai-nav-icon">${daiIcon('gear')}</span><span><b>运行与界面</b><small>预算、反馈和调试</small></span></button>
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
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>Agent 能力地图</b><small>这个扩展替你管着什么：12 个模块一枚一卡，绿点=本局启用、灰点=停用，悬停看说明。详细开关在各模块页与「简单设置」里。</small></div><div class="dai-cap-grid" data-agent-capability-grid></div></div>
                        <p class="dai-dashboard-summary" data-dashboard-summary role="status">暂无任务</p>
                        <div class="dai-module-list" data-module-list></div>
                        <p class="dai-dashboard-note">显示当前会话与分支的任务记录。每次运行都会把结果写进会话状态，刷新页面后仍在。</p>
                        <div class="dai-section-heading"><h3>简单设置</h3></div>
                        <div class="dai-overview-grid"><label class="dai-overview-switch"><span><b>启用 Agent 总控</b><small>关闭后不会运行回合，也不会写入状态。</small></span><input type="checkbox" data-setting="enabled"></label><label class="dai-overview-switch"><span><b>显示运行反馈</b><small>在右下角显示任务状态与失败原因。</small></span><input type="checkbox" data-setting="showStatusPanel"></label><label class="dai-overview-switch"><span><b>显示悬浮球</b><small>屏幕边上的小球，点开拉成长条，可查看各功能的只读信息。</small></span><input type="checkbox" data-setting="showOrb"></label></div>
                        <fieldset class="dai-theme-picker"><legend>界面颜色</legend><label class="dai-theme-option"><input type="radio" name="dai-theme" value="gilt" data-setting="ui.theme"><span class="dai-theme-swatch" data-swatch="gilt" aria-hidden="true"></span><b>暗金</b></label><label class="dai-theme-option"><input type="radio" name="dai-theme" value="graphite" data-setting="ui.theme"><span class="dai-theme-swatch" data-swatch="graphite" aria-hidden="true"></span><b>玄铁</b></label><label class="dai-theme-option"><input type="radio" name="dai-theme" value="parchment" data-setting="ui.theme"><span class="dai-theme-swatch" data-swatch="parchment" aria-hidden="true"></span><b>米纸</b></label></fieldset>
                        <p class="dai-dashboard-note">只改变 Agent 界面，不改变酒馆整体配色。</p>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>运行口径</b><small>沙盒口径不用世界书：世界常识由内置斗气大陆基线承担，决定喂料与世界书条目一并停用；主线口径一切照旧。</small></div><p class="dai-turn-result" data-runtime-mode role="status">打开本页时读取。</p></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>模型调用体检</b><small>本会话调用量与失败统计（可"清零"重计）。主文生成与天之音·时间召回走酒馆本体/数据库脚本，不经过扩展，这里看不到。空回（接口通了但没内容）会按下面两个参数自动重试，改完立即生效。逐路的实时成败与失败详情在悬浮球总控窗——失败行 / ✗ 标记点击弹卡。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>空回重试次数</b><small>模型调用返回空内容时自动再问几次：0 ＝ 不重试（清空输入框会存成 0，等于关掉重试），负数或非整数按默认 1 处理。只对空回重试，报错（限流 429、超时等）仍然立刻上抛。</small></span><input type="number" min="0" step="1" data-setting="llm.emptyRetry" placeholder="默认 1"></label><label class="dai-setting-row"><span><b>重试间隔（秒）</b><small>两次尝试之间等多久。站点有 RPM 限制就把这里调大（比如 15～30），别让重试把额度烧光；0、负数或留空都按默认 0.6 秒。</small></span><input type="number" min="0" step="0.1" data-setting="llm.emptyRetryWait" placeholder="默认 0.6"></label></div><p class="dai-turn-result" data-calllog-summary role="status">打开本页时读取。</p><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-calllog-clear>清零</button></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>卡面脚本</b><small>首楼"开始创建身份"由卡内脚本接管；换设备或换人导入后点不动，多半是它没启用。</small></div><p class="dai-state-strip" data-cover-script-status>还没有检测。</p></div>
                    </section>
                    
                    <section class="dai-settings-page" data-settings-section="apis" role="tabpanel" hidden>
                        <div class="dai-page-heading"><h3>API设置</h3><p>把每套接口配置（地址、密钥、模型、采样参数、附加参数）存成命名方案，「模型设置」页里每个功能直接选一套，不用再逐项手填。每个方案自己决定走不走酒馆通道（卡上的「走酒馆通道」开关）。附加参数与酒馆「自定义接口 · 附加参数」同语义：包括主体参数并进请求体、排除主体参数删字段、包含请求标头覆盖请求头。</p></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>接口方案</b><small>方案只保存在扩展设置里（密钥也是），不进聊天消息；改完方案下一轮调用就生效，不用重启。功能在「模型设置」页绑定方案。</small></div><div data-api-preset-list></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-api-add-preset>＋ 新建 API 设置</button><small role="status" data-api-preset-status>最多 20 个方案。</small></div></div>
                    </section>
                                        <section class="dai-settings-page" data-settings-section="hub" role="tabpanel" hidden>
                        <div class="dai-page-heading"><h3>模型设置</h3><p>扩展会发起的每一次独立模型调用，在这一页只回答一个问题：这个功能用哪套方案。方案（地址、密钥、模型、采样参数、附加参数）在「API设置」页维护，改方案下一轮调用就生效；不绑方案＝跟随酒馆主连接。各功能的提示词不在这一页——到对应功能页里改。</p></div>
                        <div class="dai-settings-card dai-api-mode-card"><div class="dai-card-heading"><b>调用版本</b><small>简略版＝备料三路并成一次「素材总挑选」、记账五路并成一次「总结算」，一轮最多 3 次模型调用（进阶增强关闭）；完整版＝每个功能各一路调用（原有行为，进阶增强关闭）；进阶版＝完整版逐路管线，再叠上全部进阶增强（难度骰子、正文核验、一致性体检、人物关系网、开局摘要、剧情账本决定、语义检索）。切换立即生效，下一轮开始按新版本跑；各版各自记住自己的方案绑定，互不覆盖。</small></div><div class="dai-api-mode-switch" role="radiogroup" aria-label="调用版本"><button type="button" class="dai-api-mode-option" data-api-mode="lite"><b>简略版</b><small>合并调用省次数</small></button><button type="button" class="dai-api-mode-option" data-api-mode="full"><b>完整版</b><small>每功能一路调用</small></button><button type="button" class="dai-api-mode-option" data-api-mode="advanced"><b>进阶版</b><small>完整版＋进阶增强</small></button></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>功能读取楼层数（全局默认）</b><small>各功能的"看最近几楼 / 喂最近几楼"没单独填就用这个。留空或 0＝自动跟随当前角色卡自带的提示词侧"整楼隐藏"正则深度（主模型能看几楼，功能调用就默认读几楼），卡上没有这类正则时回落 8；只看角色脚本，不看全局正则。功能调用读楼层本身会按主提示词同款口径套用角色正则——被隐藏的块（变量块、状态栏占位等）不进功能调用，被整楼隐藏的楼层自动剔除。</small></div><label class="dai-setting-row"><span><b>默认读几楼</b><small>想单独调某个功能，去该功能页填自己的楼数即可，单独填的优先。</small></span><input type="number" min="1" step="1" data-setting="readFloors" placeholder="留空或 0＝跟随角色正则"></label></div>
                        <div data-api-mode-section="advanced" hidden>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>进阶功能一览</b><small>进阶版＝完整版逐路管线，再叠上学 GitHub 仓库的全部增强，只有进阶版生效，切回完整版/简略版整体静默。各卡位置：难度骰子与变数在「行动结算」页；正文核验在「原著资料」页；一致性体检、人物关系网、传播传闻在「人物簿」页；记忆体检、按人整合、开局摘要在「记忆存储」页；剧情账本在「世界运转」页；语义检索在本页下方。每项仍有自己的开关，进阶版只是放行的总闸。</small></div><ul class="dai-status-list"><li><b>记忆混合检索打分</b><span>钥匙/引文/标题/词面/时间邻近/重要度多路合分排序（Generative Agents 三因子）；完整版/简略版退回钥匙整词命中的旧排序</span></li><li><b>记忆写入查重</b><span>共钥匙且词面相似 ≥0.85 的复述在写入时拦住（MemPalace）；旧口径只查同层同文</span></li><li><b>记忆体检</b><span>孤立钥匙、目录覆盖率、疑似矛盾对的纯本地统计卡</span></li><li><b>按人整合＋相关记忆跳转</b><span>跨账本时间线与共钥匙详情跳转（A-MEM）</span></li><li><b>开局摘要（wake-up）</b><span>切聊天后第一条回复前一次跨账本交底，只注一次</span></li><li><b>语义向量检索</b><span>embeddings 端点叠加余弦相似度，失败静默退回纯本地检索</span></li><li><b>难度＋骰子裁定</b><span>模型报风险档位与带依据修正，脚本掷 d20 对难度判成败，只降不升；波折轮掷变数 Oracle，部分成功补结构化保底代价</span></li><li><b>正文核验（VeriScore 三标签）</b><span>生成后旁路小调用把正文拆成断言对照台账裁决，只记审计不拦正文</span></li><li><b>人物一致性体检</b><span>记账后自动对照档案查「写违反人设的地方」，引正文原句作证据</span></li><li><b>人物关系网注入</b><span>在场人物的一跳/二跳关系链一行带进提示词，超预算整段放弃</span></li><li><b>剧情账本决定</b><span>滚动计划与线索账的自动维护调用，排在世界决定之后</span></li></ul></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>语义检索（可选）</b><small>记忆召回与兜底的语义增强：OpenAI 兼容 /v1/embeddings 独立端点（不走酒馆连接、不绑 API 方案——酒馆连接做不了 embeddings）。开启后混合检索在关键词/词面/时间邻近之外叠加语义相似度，同义改述（"陨落心炎"写成"心火"）也能勾回旧账；没配置时全部走纯本地混合检索，零行为变化。向量按聊天存在浏览器 IndexedDB，落账后后台自动补嵌，改文本或换模型会自动重嵌。</small></div><label class="dai-setting-row dai-setting-toggle"><span><b>启用语义检索</b><small>开关在这里，记忆召回决定与关键词兜底自动吃到相似度加成。</small></span><input type="checkbox" data-setting="memory.embedding.enabled"></label><label class="dai-setting-row"><span><b>接口地址</b><small>如 https://api.example.com/v1（/v1 结尾自动接 /embeddings）。</small></span><input type="text" data-setting="memory.embedding.baseUrl" placeholder="https://api.example.com/v1" spellcheck="false"></label><label class="dai-setting-row"><span><b>密钥</b><small>本地服务（LM Studio 等）可留空。</small></span><input type="password" data-setting="memory.embedding.apiKey" spellcheck="false"></label><label class="dai-setting-row"><span><b>向量模型</b><small>如 text-embedding-3-small / embedding-3 / bge-m3；换模型会自动重嵌。</small></span><input type="text" data-setting="memory.embedding.model" spellcheck="false"></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-memory-vector-rebuild>重建本聊天向量</button><small role="status" data-memory-vector-stats>语义检索未开启。</small></div></div>
                        </div>
                        <div data-api-mode-section="full advanced">
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>全局连接（正文与默认调用）</b><small>扩展侧的意图解析、正文撰写、设定挑选等默认调用走哪套；正文由酒馆自己生成，不经过这里。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案（接口、参数、附加参数全按方案来）。</small></span><select data-setting="llm.apiPreset" data-api-preset-select></select></label><label class="dai-setting-row"><span><b>单次等待上限（秒）</b><small>所有扩展调用的超时上限，按秒填：60 就是一分钟；范围 1～600 秒，方案不能覆盖这一项。</small></span><input type="number" min="1" max="600" step="1" data-setting="llm.timeoutSec" placeholder="默认 60"></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>原著设定 · 选条与卷外点选</b><small>每轮生成前“挑哪些原著条目进正文”的独立调用。选条与卷外点选的提示词在「原著资料」页修改。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="setting.apiPreset" data-api-preset-select></select></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>行动结算 · 判定调用</b><small>分类判定与最终判定共用这一套 API：生成前一次调用直判本轮全部行动（旧分类管线也走这套）。判定开关与提示词在「行动结算」页改。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="settle.resultApiPreset" data-api-preset-select></select></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>世界运转 · 模型决定</b><small>世界事件决定调用；决定提示词与降级指令指南在「世界运转」页改。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="world.decideApiPreset" data-api-preset-select></select></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>喂最近几楼聊天</b></span><input type="number" min="1" max="12" step="1" data-setting="world.decideMaxFloors" placeholder="留空或 0＝跟随角色正则"></label></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>剧情账本 · 决定模型</b><small>滚动计划与线索账的维护调用，排在世界决定之后；决定开关与提示词在「世界运转」页改。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="plot.decideApiPreset" data-api-preset-select></select></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>喂最近几楼聊天</b><small>剧情决定自己的一份，与世界决定分开。</small></span><input type="number" min="1" max="12" step="1" data-setting="plot.decideMaxFloors" placeholder="留空或 0＝跟随角色正则"></label></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>正文核验 · 事实审计</b><small>生成后拆断言对照台账的旁路小调用；开关、审计列表与提示词在「原著资料」页改。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="verify.apiPreset" data-api-preset-select></select></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>人物簿 · 记录员</b><small>生成后补人物档案的小调用；记录员提示词在「人物簿」页改，档案抄录与经历精简各有独立连接卡。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="npc.ledgerApiPreset" data-api-preset-select></select></label></div><div class="dai-settings-card"><div class="dai-card-heading"><b>人物簿 · 档案抄录</b><small>按世界书给人物补空字段的小调用（面板「按世界书重抽」也会用到）。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="npc.extractApiPreset" data-api-preset-select></select></label></div><div class="dai-settings-card"><div class="dai-card-heading"><b>人物簿 · 经历精简</b><small>把某人的经历清单压缩成草稿、确认后写回的手动调用。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="npc.expApiPreset" data-api-preset-select></select></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>人物簿 · 冷藏推进员</b><small>给勾选的冷藏人物补世界时间走过那一段的小调用；推进员提示词在「人物簿」页改。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="npc.coldApiPreset" data-api-preset-select></select></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>纳戒 · 决定模型</b><small>纳戒决定是一条独立调用（生成后自动跑或手动“让模型决定一次”）；决定开关与提示词在「纳戒」页改。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="self.decideApiPreset" data-api-preset-select></select></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>喂最近几楼聊天</b><small>纳戒决定自己的一份，与记忆分开。</small></span><input type="number" min="1" max="12" step="1" data-setting="self.decideMaxFloors" placeholder="留空或 0＝跟随角色正则"></label></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>记忆 · 决定模型</b><small>记忆决定专用；召回与总结各有独立连接卡。决定提示词与开关在「记忆存储」页改。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="memory.decideApiPreset" data-api-preset-select></select></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>喂最近几楼聊天</b><small>记忆决定自己的一份，与纳戒分开。</small></span><input type="number" min="1" max="12" step="1" data-setting="memory.decideMaxFloors" placeholder="留空或 0＝跟随角色正则"></label></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>记忆 · 召回模型</b><small>用户输入之后、生成之前，按记忆目录挑要注入的旧记忆；召回提示词与自动开关在「记忆存储」页。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="memory.recallApiPreset" data-api-preset-select></select></label></div><div class="dai-settings-card"><div class="dai-card-heading"><b>记忆 · 总结模型</b><small>小记忆攒够条数总结成一条大记忆；阈值在「记忆存储」页。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="memory.consolidateApiPreset" data-api-preset-select></select></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>世界影响 · 记录员与场记</b><small>生成后记账与生成前挑选的两个调用；提示词在「世界影响」页改。场记不绑方案就跟着记录员走。</small></div><label class="dai-setting-row"><span><b>记录员用哪套API设置</b><small>生成结束后记账的那个。</small></span><select data-setting="impact.decideApiPreset" data-api-preset-select></select></label><label class="dai-setting-row"><span><b>场记用哪套API设置</b><small>生成前挑影响的那个；不绑＝跟记录员同一套。</small></span><select data-setting="impact.injectApiPreset" data-api-preset-select></select></label></div>
                        </div>
                        <div data-api-mode-section="lite" hidden>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>全局（简略版）</b><small>简略版只有两条合并调用，正文仍由酒馆主连接生成；行动结算不合并，仍按「行动结算」页的开关单独调用。切回完整版后，完整版卡片上的绑定原样生效。</small></div><label class="dai-setting-row"><span><b>单次等待上限（秒）</b><small>所有扩展调用的超时上限，按秒填：60 就是一分钟；范围 1～600 秒，方案不能覆盖这一项。</small></span><input type="number" min="1" max="600" step="1" data-setting="llm.timeoutSec" placeholder="默认 60"></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>素材总挑选（生成前一次）</b><small>一次调用挑完三路素材：原著设定条目、世界影响旧账、要召回的旧记忆——判定标准与完整版各路一致。各功能的启用开关关了哪路，提示词里就不带那路；全关时这次调用整轮不发。候选先用脚本按关键词缩圈，模型只在候选里点名，不许编编号。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案（接口、参数、附加参数全按方案来）。</small></span><select data-setting="lite.pickApiPreset" data-api-preset-select></select></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>行动结算 · 判定调用</b><small>简略版里不合并：它必须赶在正文之前判定并写进提示词，而总结算在正文之后，时序接不上。没有可判定的行动时这轮不调用；判定开关与提示词在「行动结算」页改（与完整版共用同一绑定）。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案。</small></span><select data-setting="settle.resultApiPreset" data-api-preset-select></select></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>总结算（生成后一次）</b><small>一次调用记完五本账：人物、世界、影响、纳戒、记忆。脚本仍按节逐条校验落账，坏条目单条丢弃不连累其他账；各功能页的手动按钮照常可用（那是单独调用，不受版本影响）。各功能的启用与自动开关逐节生效：关了哪个功能，提示词里就不带那本账，总结算也不落它。</small></div><label class="dai-setting-row"><span><b>用哪套API设置</b><small>不绑＝跟随酒馆主连接；选方案就整套走方案（接口、参数、附加参数全按方案来）。</small></span><select data-setting="lite.settleApiPreset" data-api-preset-select></select></label></div>
                        </div>
                    </section>
                    <section class="dai-settings-page" data-settings-section="facts" role="tabpanel" hidden>
                        <div class="dai-page-heading"><h3>原著设定</h3><p>把世界书条目变成“按需注入”的设定库：建索引、按卷出目录、模型点名、按预算注入正文提示词。</p></div><div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon" aria-hidden="true">${daiIcon('book')}</span><span><b>启用原著设定注入</b><small>每轮先按本轮输入召回候选，再由模型挑出真正要用的设定，按预算注入正文提示词。</small></span><input type="checkbox" data-setting="setting.enabled"></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>运行状态</b><small>打开这一页时读取，生成结束后也会刷新。</small></div><ul class="dai-status-list" data-facts-status><li><b>状态</b><span>正在读取……</span></li></ul></div><div class="dai-settings-card"><div class="dai-card-heading"><b>检索库状态</b><small>只读世界书，不改原文件；改完世界书后重新导入一次即可。</small></div><p class="dai-turn-result" data-worldbook-stats role="status">还没有导入。</p><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>选择世界书</b><small>扫描到的名字会记住；选过之后刷新酒馆不用重选。</small></span><select data-worldbook-pick><option value="">（尚未选择）</option></select></label><label class="dai-setting-row"><span><b>手动填写</b><small>列表里没有就填世界书面板里的名字。</small></span><input type="text" list="dai-worldbook-options" data-setting="setting.worldbook" placeholder="例如 斗破世界书"></label></div><datalist id="dai-worldbook-options"></datalist><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-agent-worldbook-scan>扫描可选世界书</button><button type="button" class="dai-secondary-button" data-agent-worldbook-import>从世界书导入</button></div><p class="dai-turn-result" data-agent-worldbook-status role="status">还没有导入。</p></div><div class="dai-settings-card"><div class="dai-card-heading"><b>检索库 · 条目浏览</b><small>整库条目在这里翻：按类别/卷过滤、按关键词搜（标题、别名、摘要、正文都算），点行看全文。纯本地过滤，不花模型调用。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>关键词</b></span><input type="text" data-facts-search placeholder="例如 加列家 / 乌坦城 / 萧炎"></label><label class="dai-setting-row"><span><b>类别</b></span><select data-facts-cat><option value="">全部类别</option></select></label><label class="dai-setting-row"><span><b>范围</b></span><select data-facts-scope><option value="volume">当前剧情卷</option><option value="all">全书</option></select></label></div><p class="dai-turn-result" data-facts-browser-status role="status">打开页面后自动列出。</p><div class="dai-facts-browser" data-facts-browser></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>上次注入</b><small>最近一轮实际写进提示词的原著条目；与上面的运行状态分开看。</small></div><div class="dai-facts-injection" data-facts-last-injection role="status">本轮还没有注入过。</div></div><div class="dai-settings-card"><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>当前剧情卷</b><small>自动＝按本轮输入和模型估计；手动选＝锁定这一卷，识别到更后面的卷也会被压回。</small></span><select data-setting="setting.progress"><option value="0">自动判定</option><option value="1">第 1 卷</option><option value="2">第 2 卷</option><option value="3">第 3 卷</option><option value="4">第 4 卷</option><option value="5">第 5 卷</option><option value="6">第 6 卷</option><option value="7">第 7 卷</option><option value="8">第 8 卷</option><option value="9">第 9 卷</option><option value="10">第 10 卷</option><option value="11">第 11 卷</option><option value="12">第 12 卷</option><option value="13">第 13 卷</option><option value="14">第 14 卷</option><option value="15">第 15 卷</option><option value="16">第 16 卷</option><option value="17">第 17 卷</option><option value="18">第 18 卷</option><option value="19">第 19 卷</option><option value="20">第 20 卷</option><option value="21">第 21 卷</option></select></label><label class="dai-setting-row"><span><b>单次注入字数</b><small>0 = 不限制，选中几条就注入几条全文。</small></span><input type="number" min="0" step="100" data-setting="setting.injectionBudget"></label><label class="dai-setting-row"><span><b>单次检索出条目上限</b><small>选条模型单次最多挑几条原著条目（含本卷故事线背景），直接按你填的来，不设天花板；留空默认 8，填 0 或负数也按默认处理。上下文里提到的条目多于上限时按相关度取前几条。改完下一轮选条就生效。</small></span><input type="number" min="1" step="1" data-setting="setting.maxItems" placeholder="默认 8"></label></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>注入通道</b><small data-injection-status role="status">打开这一页时检测。</small></div><div class="dai-setting-grid"><label class="dai-setting-row dai-setting-toggle"><span><b>启用注入</b><small>关闭后不往提示词里写任何原著内容，正文照常生成。</small></span><input type="checkbox" data-setting="injection.enabled"></label><label class="dai-setting-row"><span><b>插入深度</b><small>从最新一楼往回数；0 表示紧贴末尾、离生成最近。</small></span><input type="number" min="0" max="99" step="1" data-setting="injection.depth"></label><label class="dai-setting-row"><span><b>最大字数</b><small>0 = 不截断；填了才在写入时截断。</small></span><input type="number" min="0" step="100" data-setting="injection.maxChars"></label></div></div><details class="dai-settle-category"><summary><span class="dai-feature-icon" aria-hidden="true">${daiIcon("slip")}</span><span><b>选条提示词</b><small>模型判断“本轮要用哪些原著条目”时收到的 system 指令；点开修改，清空恢复内置默认；MAX_PICKS 会换成每条上限。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>规则正文</b><small>改完下一轮生效，不用重启。</small></span><textarea data-setting="prompt.select" rows="9" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-prompt-default>填入默认规则</button><small>默认规则口径：提到的就出、本卷故事线默认带、不许编 uid、只输出 JSON。</small></div></div></details><details class="dai-settle-category"><summary><span class="dai-feature-icon" aria-hidden="true">${daiIcon("slip")}</span><span><b>卷外点选提示词</b><small>模型在目录里找不到、报出名字后，脚本搜到候选再问它一次时用的 system 指令；点开修改，清空恢复内置默认。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>规则正文</b><small>只影响“卷外二次点选”，改完下一轮生效。</small></span><textarea data-setting="prompt.lookup" rows="7" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-prompt-default="lookup">填入默认规则</button><small>默认规则含“只从候选里挑、后续卷默认不选”。</small></div></div></details><div class="dai-settings-card" data-api-mode-section="advanced"><div class="dai-card-heading"><b>正文核验（事实审计）</b><small>生成结束后一次旁路小调用：把正文拆成可验证断言，对照本轮注入条目与三本台账裁决（有据/矛盾/无据），只记审计、不拦正文。排在世界/纳戒/人物记账之后跑。整卡只在进阶版显示；接口在「模型设置」页「正文核验」卡。</small></div><div class="dai-feature-toggle"><span class="dai-feature-icon" aria-hidden="true">${daiIcon('book')}</span><span><b>启用正文核验</b><small>关闭后自动与手动都不再跑。</small></span><input type="checkbox" data-setting="verify.enabled"></div><label class="dai-setting-row dai-setting-toggle"><span><b>每轮生成后自动核验</b><small>关闭后只能点“核验这一楼”手动跑。</small></span><input type="checkbox" data-setting="verify.auto"></label><label class="dai-setting-row dai-setting-toggle"><span><b>快筛（省调用）</b><small>正文命中条目名/人物名/境界/数量才发起调用；关闭则每个 AI 楼层都核。闲聊楼层永不产生核验调用。</small></span><input type="checkbox" data-setting="verify.gate"></label><label class="dai-setting-row dai-setting-toggle"><span><b>名字比对（未注入条目审计）</b><small>正文出现没注入过的条目名就记一条。实跑在设定密集的卡上一楼能记 40+ 条（原生世界书注入的设定被正文引用是常态），默认关；要漂移报告再开。</small></span><input type="checkbox" data-setting="verify.nameAudit"></label><p class="dai-turn-result" data-verify-status role="status">还没有运行。生成结束后会自动核验。</p><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-verify-run>核验这一楼</button></div><div class="dai-world-decide-result" data-verify-result></div><div class="dai-facts-injection" data-verify-entries role="status">还没有核验记录。</div><details class="dai-prompt-fold"><summary><span><b>核验提示词</b><small>核验模型收到的 system 规则；点开修改，清空恢复内置默认。改写时保持“只输出 JSON”与 claims/verdict 字段名不变。</small></span></summary><label class="dai-setting-row"><span><b>规则正文</b><small>三标签裁决、传闻只判无据、断言不抄原句的规矩都在这里，可按玩法改写。</small></span><textarea data-setting="verify.prompt" rows="10" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-verify-default>填入默认规则</button><small>默认规则含“矛盾必须有明确反证、传闻不当事实”。</small></div></details></div></section>
                    <section class="dai-settings-page" data-settings-section="action" role="tabpanel" hidden>
                        <div class="dai-page-heading"><h3>行动结算</h3><p>生成前一次调用直判本轮行动的结果与资源变化，只有审核后的结果进入正文通道。</p></div><div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon" aria-hidden="true">${daiIcon("arrow")}</span><span><b>启用行动结算（总开关）</b><small>关闭后行动不再结算：不判定、不算数值变化；正文照常生成，状态保持原样。</small></span><input type="checkbox" data-setting="enableActionResolution"></div></div><div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon" aria-hidden="true">${daiIcon("balance")}</span><span><b>行动结算注入（生成前直判）</b><small>一次调用按实际行动分别判定，读取相关世界书正文、六路已注入提示词和真账本；有文字后果也正常裁决。只有审核后的结果进入正文通道。生成后仍由原入口记账，并只读核对金币、境界和库存，不会双份扣账。关闭后不调用不注入。</small></span><input type="checkbox" data-setting="settle.resultEnabled"></div><div data-api-mode-section="advanced" hidden><label class="dai-setting-row dai-setting-toggle"><span><b>难度＋骰子裁定（进阶版）</b><small>模型报风险档位（受控/常规/冒险/绝望）与带依据修正（单条 ±3、总计 ±4），脚本掷 d20 对难度判成败，只降不升；对手境界每高一大境界抬一档；波折轮 25% 掷变数 Oracle；部分成功补【类型·等级】结构化保底代价。关闭＝不掷骰，模型怎么判就怎么记。</small></span><input type="checkbox" data-setting="settle.diceEnabled"></label></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button" data-settle-adjudicate-run>手动预览一次（不注入）</button><span class="dai-turn-result" data-settle-result-status role="status">还没有判定过。生成前判定员会直判这一轮的行动结果并注入正文提示词。</span></div><div class="dai-turn-result" data-settle-result>本轮还没有判定结果。</div><details class="dai-settle-category"><summary><span class="dai-feature-icon" aria-hidden="true">${daiIcon("flame")}</span><span><b>判定提示词</b><small>一次调用输出 version:2 与 actions；每项有行动依据、依赖、结果、文字后果和 effects。清空恢复内置默认。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>提示词正文</b></span><textarea data-setting="settle.resultPrompt" rows="9" spellcheck="false"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-prompt-default="settleResult">载入新版多行动模板</button><button type="button" class="dai-button dai-button-ghost" data-settle-follow-default>恢复跟随默认</button><small role="status" data-settle-prompt-warning>自定义原文保留，旧单行动结果可兼容。</small></div></div></details></div><div class="dai-settings-card"><div class="dai-card-heading"><b>类别规则与自定义判定</b><small>生成前一次调用分别裁决多个行动；本页自定义规则作为补充，不会每类再调一次模型。</small></div>${SETTLE_CATEGORY_HTML}<div data-settle-custom-list></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-settle-add-category>＋ 添加自定义判定</button><small role="status" data-settle-custom-status>自定义判定只有名字和提示词：判定走你写的规则，脚本仍做字段白名单把关；最多 8 个。</small></div></div></section>
                    <section class="dai-settings-page" data-settings-section="world" role="tabpanel" hidden>
                        <div class="dai-page-heading"><h3>世界运转</h3><p>世界时间和事件由扩展的独立决定请求自动记账（正文保持干净）；这一页是台账展示和手动控制。添加表单都收进了弹窗，页面只看现状。</p></div>
                        <div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon" aria-hidden="true">${daiIcon("mountain")}</span><span><b>启用世界事件系统</b><small>关闭后不再读模型指令、不再注入世界现状。</small></span><input type="checkbox" data-setting="world.eventEnabled"></div><label class="dai-setting-row dai-setting-toggle"><span><b>注入世界现状</b><small>生成前把时钟、现状和进行中的事件写进提示词。</small></span><input type="checkbox" data-setting="world.eventInject"></label><label class="dai-setting-row"><span><b>现状注入字数上限</b><small>超预算先丢事件，保住时钟；0 为默认 900。</small></span><input type="number" min="0" step="100" data-setting="world.eventBudget"></label></div><div class="dai-settings-card"><div class="dai-card-heading"><b>世界时间与现状</b><small>随每轮生成自动更新；点数值旁的 ✎ 就地修正。</small></div><div class="dai-world-tiles"><div class="dai-world-tile"><span class="dai-world-tile-label">天数</span><b class="dai-world-tile-value" data-world-tile="day">—</b><small class="dai-world-tile-sub" data-world-tile-sub="clock"></small></div><div class="dai-world-tile"><span class="dai-world-tile-label">时期</span><b class="dai-world-tile-value" data-world-tile="era">—</b><button type="button" class="dai-world-tile-edit" data-world-tile-edit="era" title="修改时期">✎</button><span class="dai-world-tile-editor" data-world-tile-editor="era" hidden><input type="text" data-world-info="era" placeholder="如 萧家废物时期"><button type="button" class="dai-secondary-button" data-world-info-set="era">确定</button></span></div><div class="dai-world-tile"><span class="dai-world-tile-label">所在地</span><b class="dai-world-tile-value" data-world-tile="location">—</b><button type="button" class="dai-world-tile-edit" data-world-tile-edit="location" title="修改所在地">✎</button><span class="dai-world-tile-editor" data-world-tile-editor="location" hidden><input type="text" data-world-info="location" placeholder="如 乌坦城"><button type="button" class="dai-secondary-button" data-world-info-set="location">确定</button></span></div><div class="dai-world-tile"><span class="dai-world-tile-label">天气</span><b class="dai-world-tile-value" data-world-tile="weather">—</b><button type="button" class="dai-world-tile-edit" data-world-tile-edit="weather" title="修改天气">✎</button><span class="dai-world-tile-editor" data-world-tile-editor="weather" hidden><input type="text" data-world-info="weather" placeholder="如 晴"><button type="button" class="dai-secondary-button" data-world-info-set="weather">确定</button></span></div><div class="dai-world-tile"><span class="dai-world-tile-label">名声</span><b class="dai-world-tile-value" data-world-tile="reputation">—</b><button type="button" class="dai-world-tile-edit" data-world-tile-edit="reputation" title="修改名声">✎</button><span class="dai-world-tile-editor" data-world-tile-editor="reputation" hidden><input type="text" data-world-info="reputation" placeholder="如 乌坦城小有名气"><button type="button" class="dai-secondary-button" data-world-info-set="reputation">确定</button></span></div><div class="dai-world-tile"><span class="dai-world-tile-label">通缉度</span><b class="dai-world-tile-value" data-world-tile="wanted">—</b><button type="button" class="dai-world-tile-edit" data-world-tile-edit="wanted" title="修改通缉度">✎</button><span class="dai-world-tile-editor" data-world-tile-editor="wanted" hidden><input type="text" data-world-info="wanted" placeholder="如 被米特尔家族记恨"><button type="button" class="dai-secondary-button" data-world-info-set="wanted">确定</button></span></div></div><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-world-advance="1">推进 1 天</button><button type="button" class="dai-secondary-button" data-world-advance="7">推进 7 天</button><input type="number" min="1" max="365" step="1" data-world-days placeholder="天数" aria-label="自定义推进天数"><button type="button" class="dai-secondary-button" data-world-advance-custom>推进</button></div><label class="dai-setting-row"><span><b>改为第几天</b><small>直接设定时钟，用于修正跳变。</small></span><span class="dai-setting-inline"><input type="number" min="1" max="99999" step="1" data-world-setday placeholder="如 30"><button type="button" class="dai-secondary-button" data-world-setday-apply>设定</button></span></label><label class="dai-setting-row"><span><b>世界氛围</b><small>决定模型投放事件的频率和烈度。</small></span><span class="dai-segmented"><span class="dai-world-tension" data-world-tension-display role="status"></span><button type="button" class="dai-segmented-button" data-world-tension="calm">平静</button><button type="button" class="dai-segmented-button" data-world-tension="rising">升温</button><button type="button" class="dai-segmented-button" data-world-tension="storm">风波</button></span></label></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>主角身边的事件</b><small>模型会看到这些并把它们织进剧情；了结后从注入里退场。</small><button type="button" class="dai-impact-edit" data-modal-open="world-event" data-modal-title="登记事件">＋ 登记</button></div><div class="dai-world-events" data-world-events-near></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>世界大事</b><small>大陆层面的事件；重大的会标星，置顶的不参与上限清理。</small></div><div class="dai-world-events" data-world-events-world></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>任务</b><small>模型识别剧情里的目标就立任务；全部任务都在这里。</small><button type="button" class="dai-impact-edit" data-modal-open="world-task" data-modal-title="接下任务">＋ 接任务</button></div><div class="dai-world-tasks" data-world-tasks></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>势力</b><small>与主角有过恩怨往来的势力：一份完整档案（类型/首领/高层/成员/驻地/底蕴/关系）加态度动向，敌对的最先注入。</small><button type="button" class="dai-impact-edit" data-modal-open="world-faction" data-modal-title="登记势力" data-modal-wide="true">＋ 登记</button></div><div class="dai-world-factions" data-world-factions></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>人物</b><small>与主角有交情或恩怨的人物及态度，正文按这里写人物反应。</small><button type="button" class="dai-impact-edit" data-modal-open="world-person" data-modal-title="登记人物">＋ 登记</button></div><div class="dai-world-people" data-world-people></div></div>
                        <div class="dai-modal-dock" data-modal-dock="world-task" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>接一个任务</b><small>模型没立但你想要的，自己记一笔。</small></div><label class="dai-setting-row"><span><b>任务名</b><small>必填，不超过 20 字；列表只显示这一行。</small></span><input type="text" maxlength="20" required data-world-task-title placeholder="例：查出城东窃贼的来历"></label><label class="dai-setting-row"><span><b>详细资料</b><small>目标、背景、现状，写多少都行。</small></span><input type="text" data-world-task-detail placeholder="例：连日失窃，掌柜悬赏；已知窃贼夜行、身法利落"></label><label class="dai-setting-row"><span><b>来源</b><small>这任务从哪来：谁托付、什么契机。</small></span><input type="text" data-world-task-basis placeholder="例：药铺掌柜悬赏托付"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>时限（天）</b><small>留空不限期。</small></span><input type="number" min="1" max="90" step="1" data-world-task-days placeholder="如 7"></label></div><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-world-addtask>接下任务</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div><div class="dai-modal-dock" data-modal-dock="world-faction" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>登记势力</b><small>与主角有恩怨往来的势力；同名直接更新，留空的档案字段保持原值。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>势力名</b></span><input type="text" maxlength="30" data-world-faction-name placeholder="例：云岚宗"></label><label class="dai-setting-row"><span><b>类型</b><small>宗门/家族/帝国/学院/佣兵团/商会/联盟…</small></span><input type="text" maxlength="10" data-world-faction-type placeholder="例：宗门"></label><label class="dai-setting-row"><span><b>态度</b></span><select data-world-faction-stance><option value="hostile">敌对</option><option value="wary">警惕</option><option value="neutral">中立</option><option value="friendly">友好</option><option value="allied">同盟</option></select></label><label class="dai-setting-row"><span><b>首领</b><small>名字 + 称谓境界。</small></span><input type="text" maxlength="30" data-world-faction-leader placeholder="例：云韵（宗主·斗王）"></label></div><label class="dai-setting-row"><span><b>实力档次</b><small>这方势力有多强。</small></span><input type="text" maxlength="20" data-world-faction-level placeholder="例：加玛帝国一流"></label><label class="dai-setting-row"><span><b>高层阵容</b><small>太上长老/大长老/长老/护法/客卿。</small></span><input type="text" maxlength="120" data-world-faction-elders placeholder="例：老宗主云山、大长老云棱、客卿海波东"></label><label class="dai-setting-row"><span><b>成员构成</b><small>规模与强者数量。</small></span><input type="text" maxlength="120" data-world-faction-members placeholder="例：弟子千余，斗王三人"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>驻地/地盘</b></span><input type="text" maxlength="40" data-world-faction-location placeholder="例：云岚宗山门·加玛帝国"></label><label class="dai-setting-row"><span><b>势力关系</b><small>与其他势力的恩怨与依附。</small></span><input type="text" maxlength="160" data-world-faction-relations placeholder="例：世仇萧家；背靠皇室"></label></div><label class="dai-setting-row"><span><b>底蕴与产业</b><small>传承功法、异火、拍卖行、附属势力。</small></span><input type="text" maxlength="160" data-world-faction-assets placeholder="例：镇派功法、名下拍卖行"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>动向</b><small>势力现在在干什么。</small></span><input type="text" data-world-faction-dynamics placeholder="例：为退婚一事派使者常驻乌坦城"></label><label class="dai-setting-row"><span><b>依据</b></span><input type="text" data-world-faction-basis placeholder="例：本楼使者登门"></label></div><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-world-setfaction>登记 / 更新</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div><div class="dai-modal-dock" data-modal-dock="world-person" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>登记人物</b><small>与主角有交情或恩怨的人及态度；同名直接更新。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>人物名</b></span><input type="text" data-world-person-name placeholder="例：药老"></label><label class="dai-setting-row"><span><b>对主角的态度</b></span><input type="text" data-world-person-attitude placeholder="例：严厉但护短，亦师亦父"></label></div><label class="dai-setting-row"><span><b>依据</b></span><input type="text" data-world-person-basis placeholder="例：第二楼药老出手相护"></label><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-world-setperson>登记 / 更新</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div><div class="dai-modal-dock" data-modal-dock="world-event" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>登记事件</b><small>模型漏记时在这里补一笔，格式与模型指令一致。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>范围</b></span><select data-world-add-scope><option value="near">主角身边</option><option value="world">世界大事</option></select></label><label class="dai-setting-row"><span><b>分量</b></span><select data-world-add-weight><option value="minor">普通</option><option value="major">重大</option><option value="rumor">传闻（未证实）</option></select></label></div><label class="dai-setting-row"><span><b>短标题</b><small>必填；列表页只显示这一行。</small></span><input type="text" maxlength="16" required data-world-add-title placeholder="例：城东连环失窃"></label><label class="dai-setting-row"><span><b>事件内容</b><small>一句话说清发生了什么，不拘题材；全文进详情弹窗。</small></span><input type="text" data-world-add-text placeholder="例：城东连着三家铺子夜里失窃"></label><label class="dai-setting-row"><span><b>依据</b><small>它从哪来：哪楼、谁、什么事引出的。</small></span><input type="text" data-world-add-basis placeholder="例：上一楼酒馆闲谈提到的失窃传闻"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>地点</b><small>跨地发生的事写明地点。</small></span><input type="text" maxlength="40" data-world-add-location placeholder="例：乌坦城·城东坊市"></label><label class="dai-setting-row"><span><b>有效期（天）</b><small>留空长期有效；到期自动了结。</small></span><input type="number" min="1" max="90" step="1" data-world-add-days placeholder="如 5"></label></div><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-world-add>登记事件</button><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></div>
                        <details class="dai-settle-category"><summary><span class="dai-feature-icon" aria-hidden="true">${daiIcon("mountain")}</span><span><b>指令指南（降级模式）</b><small>关闭自动决定时随世界现状注入的规则正文；点开修改，清空恢复内置默认。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>规则正文</b><small>事件取材规则、时限要求都写在这里，可按你的玩法改写。</small></span><textarea data-setting="world.eventGuide" rows="9" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-world-guide-default>填入默认规则</button><small>默认规则含“事件要有依据、不照搬原著、时限必带 days”。</small></div></div></details>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>模型决定（LLM 决定脚本执行）</b><small>生成结束后，模型读最近聊天 + 原著资料已注入的原著条目 + 世界台账做一次独立决定，输出严格 JSON，脚本逐条校验执行并显示在这里。决定用的接口与参数在「模型设置」页。</small></div><div class="dai-feature-toggle"><span class="dai-feature-icon" aria-hidden="true">${daiIcon("mountain")}</span><span><b>启用模型决定</b><small>关闭后退回“只认正文指令块”的降级模式。</small></span><input type="checkbox" data-setting="world.decideEnabled"></div><label class="dai-setting-row dai-setting-toggle"><span><b>每轮生成后自动决定</b><small>关闭后只能点“让模型决定一次”手动跑。</small></span><input type="checkbox" data-setting="world.decideAuto"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>喂最近几楼聊天</b></span><input type="number" min="1" max="12" step="1" data-setting="world.decideMaxFloors" placeholder="留空或 0＝跟随角色正则"></label></div><p class="dai-turn-result" data-world-decide-status role="status">还没有运行。生成结束后会自动决定。</p><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-world-decide-run>让模型决定一次</button></div><div class="dai-world-decide-result" data-world-decide-result></div><details class="dai-prompt-fold"><summary><span><b>决定提示词</b><small>模型做决定时收到的 system 规则；点开修改，清空恢复内置默认。改写时保持“只输出 JSON”和操作字段名不变。</small></span></summary><label class="dai-setting-row"><span><b>规则正文</b><small>事件取材、传闻、机遇危机、名声通缉的规则都在这里，可按玩法改写。</small></span><textarea data-setting="world.decidePrompt" rows="10" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-world-decide-default>填入默认规则</button><small>默认规则含“事件要有依据、传闻不当事实、机遇危机偶尔投放”。</small></div></details></div>
                        <div class="dai-settings-card" data-api-mode-section="advanced"><div class="dai-card-heading"><b>剧情账本（长篇一致性）</b><small>滚动计划（本幕目标/下一步走向）+ 线索账（伏笔/悬念/恩怨）。生成后一次小调用读最近聊天和世界时钟滚动维护，生成前把“剧情前瞻”注入正文提示词——正文顺着方向推进、别跟已埋线索唱反调。决定用的接口在「模型设置」页。整卡只在进阶版显示；关闭决定后已记的线索照旧注入。</small></div><div class="dai-feature-toggle"><span class="dai-feature-icon" aria-hidden="true">${daiIcon("compass")}</span><span><b>启用剧情账本</b><small>关闭后不注入、不决定；已记的线索留在聊天存档里。</small></span><input type="checkbox" data-setting="plot.enabled"></div><label class="dai-setting-row dai-setting-toggle"><span><b>注入剧情前瞻</b><small>生成前把滚动方向与未回收线索写进提示词。</small></span><input type="checkbox" data-setting="plot.inject"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>注入字数预算</b><small>超预算先丢线索保计划；0 为默认 500。</small></span><input type="number" min="0" step="100" data-setting="plot.injectBudget"></label><label class="dai-setting-row"><span><b>喂最近几楼聊天</b><small>剧情决定自己的一份。</small></span><input type="number" min="1" max="12" step="1" data-setting="plot.decideMaxFloors" placeholder="留空或 0＝跟随角色正则"></label></div><div class="dai-feature-toggle"><span class="dai-feature-icon" aria-hidden="true">${daiIcon("compass")}</span><span><b>启用剧情决定</b><small>生成后滚动维护计划与线索；关闭后只注入不更新。</small></span><input type="checkbox" data-setting="plot.decideEnabled"></div><label class="dai-setting-row dai-setting-toggle"><span><b>每轮生成后自动决定</b><small>排在世界决定之后跑；关闭后只能点“让模型决定一次”手动跑。</small></span><input type="checkbox" data-setting="plot.decideAuto"></label><p class="dai-turn-result" data-plot-decide-status role="status">还没有运行。生成结束后会自动决定。</p><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-plot-decide-run>让模型决定一次</button></div><div class="dai-world-decide-result" data-plot-decide-result></div><div data-plot-ledger-view role="status"></div><div class="dai-settings-card"><div class="dai-card-heading"><b>剧情指令流水</b><small>最近几批剧情指令的执行结果；重 roll 一楼会先撤销它上一版指令。</small></div><div class="dai-world-journal" data-plot-journal></div></div><details class="dai-prompt-fold"><summary><span><b>决定提示词</b><small>模型做剧情决定时收到的 system 规则；点开修改，清空恢复内置默认。改写时保持“只输出 JSON”和操作字段名不变。</small></span></summary><label class="dai-setting-row"><span><b>规则正文</b><small>计划怎么滚、线索怎么埋怎么收的规矩都在这里，可按玩法改写。</small></span><textarea data-setting="plot.decidePrompt" rows="10" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-plot-decide-default>填入默认规则</button><small>默认规则含“计划从剧情长出来、线索要有依据、回收不硬凑”。</small></div></details></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>世界指令流水</b><small>最近几批指令的执行结果；重 roll 一楼会先撤销它上一版指令。</small></div><div class="dai-world-journal" data-world-journal></div></div>
                                            </section>
                    <section class="dai-settings-page" data-settings-section="npc" role="tabpanel" hidden>
                        <div class="dai-page-heading"><h3>NPC 决策</h3><p>控制相关人物的有限决策候选，不替 NPC 直接越过确认边界。</p></div><div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon" aria-hidden="true">${daiIcon("person")}</span><span><b>启用 NPC 自主决策</b><small>控制人物候选计划是否参与调度。</small></span><input type="checkbox" data-setting="enableNpcAutonomy"></div><label class="dai-setting-row dai-setting-toggle"><span><b>提交前要求确认</b><small>候选计划必须经过确认才可继续。</small></span><input type="checkbox" data-setting="npc.requireConfirmation"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>最多候选计划</b></span><input type="number" min="1" max="20" step="1" data-setting="npc.maxCandidates"></label><label class="dai-setting-row dai-setting-toggle"><span><b>允许人物冲突候选</b><small>保留冲突供上层处理。</small></span><input type="checkbox" data-setting="npc.allowConflicts"></label></div></div></section>
                    <section class="dai-settings-page" data-settings-section="npcledger" role="tabpanel" hidden>
                        <div class="dai-page-heading"><h3>人物簿</h3><p>每个人按同一套格式记账：身份、外貌、修为、性格、对你的好感、资产、处境、秘密和经历流水。正文写完后由“人物记录员”补一笔，下一楼再按“在场 × 重要”决定给正文模型看多少人、看多少细节。点人名看完整档案；重大转变单独记在「人物经历」页。</p></div>
                        <div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon" aria-hidden="true">${daiIcon("ledger")}</span><span><b>启用人物簿</b><small>关闭后不记账、不注入；已经记下的档案仍留在聊天存档里，不会被删。</small></span><input type="checkbox" data-setting="enableNpcLedger"></div><label class="dai-setting-row dai-setting-toggle"><span><b>生成后自动记账</b><small>每轮正文结束后让“人物记录员”读最近两楼，把这一轮的变化记进档案；关掉后只能手动记一次。</small></span><input type="checkbox" data-setting="npc.ledgerAuto"></label><label class="dai-setting-row"><span><b>记账节奏</b><small>每轮都记更像实时，但每轮多一次小调用；每三轮更省，代价是中间两轮的变化要等下次记账才进档。</small></span><select data-setting="npc.ledgerEvery"><option value="1">每轮生成后</option><option value="2">每两轮生成后</option><option value="3">每三轮生成后</option></select></label><label class="dai-setting-row dai-setting-toggle"><span><b>把人物档案写进正文提示词</b><small>关掉后只记账、不告诉正文模型——人物就会“忘了自己身上发生过什么”。</small></span><input type="checkbox" data-setting="npc.ledgerInject"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>注入字数预算</b><small>每轮最多花多少字写人物档案；超了就把最不重要的人先降成一行。</small></span><input type="number" min="0" step="100" data-setting="npc.ledgerBudget"></label><label class="dai-setting-row"><span><b>全字段最多几个人</b><small>“在场且重要”的人按完整档案写，超出这个数就只写一行。</small></span><input type="number" min="1" max="20" step="1" data-setting="npc.ledgerMaxFull"></label><label class="dai-setting-row"><span><b>记录员看最近几楼</b><small>看太少会漏，看太多会慢；留空或 0＝跟随角色正则（主模型能看几楼，记录员就看几楼）。</small></span><input type="number" min="1" max="12" step="1" data-setting="npc.ledgerFloors" placeholder="留空或 0＝跟随角色正则"></label></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>本局人物</b><small>主界面只铺最近活动的 8 个人（点名字开信息面板，行尾小图标=在场/重要/冷藏）；全部人物、筛选和搜索收进「人物总簿」。</small></div><p class="dai-state-strip" data-npc-ledger-summary>还没有载入人物簿。</p><p class="dai-turn-result" data-npc-ledger-status role="status">还没有记账。生成结束后，人物记录员会把这一轮的人物变化写进档案。</p><div data-npc-exp-auto></div><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-modal-open="npc-ledger-browser" data-modal-title="人物总簿">打开人物总簿</button><button type="button" class="dai-secondary-button" data-npc-ledger-run>让记录员记一次</button><button type="button" class="dai-secondary-button" data-npc-ledger-refresh>刷新名单</button><button type="button" class="dai-secondary-button" data-npc-ledger-extract>按世界书补空字段</button><button type="button" class="dai-secondary-button" data-api-mode-section="advanced" data-npc-gossip-run>传播传闻</button><button type="button" class="dai-secondary-button" data-npc-consistency-run>一致性体检</button><button type="button" class="dai-secondary-button" data-modal-open="npc-patch" data-modal-title="记进人物簿">＋ 补一笔</button></div><ul class="dai-status-list dai-npc-grid" data-npc-ledger-recent></ul></div>
                        <div class="dai-settings-card" data-api-mode-section="advanced"><div class="dai-card-heading"><b>人物关系网</b><small>档案「对他人」的有向边汇总：谁认谁是什么关系。金边=在场、黄点=有情绪、虚线=未建档；力导向自动排版（玩家居中），拖动可钉住微调、点节点开档案；箭头=关系的方向。单边强绑定、两边立场打架会列在明细里提醒；进阶版下生成前本楼人物的一跳/二跳关系会随人物注入带进提示词。跟着聊天存档。</small></div><p class="dai-state-strip" data-npc-relations-summary>还没有关系边。</p><div data-npc-relations-graph></div><div class="dai-rel-legend"><span><i style="background:#b39ddb"></i>血亲/师徒/同门</span><span><i style="background:#34d399"></i>同盟</span><span><i style="background:#86efac"></i>友好</span><span><i style="background:#9ca3af"></i>中立</span><span><i style="background:#fbbf24"></i>警惕</span><span><i style="background:#f87171"></i>敌对</span></div><details class="dai-rel-details"><summary>关系明细与提醒</summary><div class="dai-world-events" data-npc-relations-list></div></details><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-npc-relations-refresh>刷新关系网</button></div></div>
                        <div class="dai-settings-card" data-api-mode-section="advanced"><div class="dai-card-heading"><b>一致性体检</b><small>旁路小调用：拿在场人物档案对照最近正文，只报「写违反档案的地方」（说话风格/雷区/称呼/境界/态度方向），不改档案、不拦正文。进阶版下每次记账后自动查在场重要人物，也可手动全量查。</small></div><p class="dai-state-strip" data-npc-consistency-summary>还没有体检过。</p><div class="dai-world-events" data-npc-consistency-list></div></div>
                        <div class="dai-modal-dock" data-modal-dock="npc-ledger-browser" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>人物总簿</b><small>本局全部人物都在这里：筛选、搜索、行尾小图标照常用；点名字打开信息面板。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>只看</b></span><select data-npc-ledger-filter><option value="">全部</option><option value="present">在场的</option><option value="absent">不在场的</option><option value="important">重要的</option></select></label><label class="dai-setting-row"><span><b>搜名字</b><small>姓名、别名、称号都能搜。</small></span><input type="search" data-npc-ledger-search placeholder="如 萧战"></label></div><ul class="dai-status-list dai-npc-grid" data-npc-ledger-list></ul></div><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-agent-modal-close>关闭</button></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>冷藏推进台</b><small>只给勾选的人补世界时间已经走过的那一段；不会自行推进时间，先出草稿，确认后才写回人物簿。勾选在人物行尾的「❄」。</small></div><p class="dai-state-strip" data-npc-cold-summary>当前世界日：第 1 天 · 未选择冷藏人物</p><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-modal-open="npc-cold-bench" data-modal-title="冷藏推进台">打开冷藏推进台</button></div><details class="dai-prompt-fold"><summary><span><b>推进员提示词</b><small>留空使用内置规则；必须保留“先出草稿、只输出 JSON”等边界；点开修改。</small></span></summary><label class="dai-setting-row"><span><b>规则正文</b><small>改完下一轮生效；清空恢复内置默认。</small></span><textarea data-setting="npc.coldPrompt" rows="8" spellcheck="false" placeholder="打开页面会自动铺入当前生效规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-npc-cold-default>填入默认推进规则</button></div></details></div>
                        <div class="dai-modal-dock" data-modal-dock="npc-cold-bench" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>冷藏推进台</b><small>勾选名单、扫描与草稿确认都在这里；先出草稿，确认后才写回。</small></div><ul class="dai-status-list dai-npc-grid" data-npc-cold-bench></ul><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-npc-cold-scan>扫描需要推进的人物</button><button type="button" class="dai-secondary-button" data-npc-cold-undo>撤销上次确认</button><button type="button" class="dai-secondary-button" data-npc-cold-clear>清空冷藏选择</button></div><div data-npc-cold-previews></div></div><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-agent-modal-close>关闭</button></div></div>
                        <details class="dai-settle-category"><summary><span class="dai-feature-icon" aria-hidden="true">${daiIcon("ledger")}</span><span><b>记录员提示词</b><small>人物记录员收到的 system 规则；点开修改，清空恢复内置默认。改写时保持“只输出 JSON”不变。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>规则正文</b><small>好感只记增减、流水只追加、没变化就不写。</small></span><textarea data-setting="npc.ledgerPrompt" rows="9" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-npc-ledger-default>填入默认规则</button><small>默认规则含“好感只记增减、流水只追加、没变化就不写”。</small></div></div></details>
                        <div class="dai-modal-dock" data-modal-dock="npc-patch" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>手动记账</b><small>一条补丁 = 一个人这一轮的变化；认不出的字段会被跳过，不会打断整条补丁。</small></div><label class="dai-setting-row"><span><b>补丁</b><small>例：{"人物":[{"姓名":"萧战","好感":3,"好感理由":"护住族人","态度":"对这个后辈多了几分认可","位置":"萧家议事厅","在场":"在场","流水":["主持族会，压下二长老的质疑"]}]}</small></span><textarea data-npc-ledger-patch rows="7" spellcheck="false" placeholder="粘贴或手写一条补丁"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-npc-ledger-apply>记进人物簿</button><button type="button" class="dai-secondary-button" data-npc-ledger-export>导出全簿</button><button type="button" class="dai-secondary-button" data-npc-ledger-import>导入全簿</button><button type="button" class="dai-secondary-button" data-npc-ledger-clear>清空本局人物簿</button><button type="button" class="dai-secondary-button" data-npc-ledger-extract-all>按世界书重抽：只填空着的字段</button></div></div><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div>
                    </section>
                    <section class="dai-settings-page" data-settings-section="self" role="tabpanel" hidden>
                        <div class="dai-page-heading"><h3>纳戒</h3><p>主角自身与随身之物的总账：身份、境界、功法斗技、装备栏、行囊、制作台、目标约定。生成结束后由决定模型读剧情记账，脚本逐条校验执行；这里也能手动改，与模型走同一套规则。条目点开看完整资料，添加表单收进了弹窗。</p></div>
                        <div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon" aria-hidden="true">${daiIcon("ring")}</span><span><b>启用纳戒</b><small>关闭后不记账、不注入；已记下的内容仍留在聊天存档里。</small></span><input type="checkbox" data-setting="enableSelfLedger"></div><label class="dai-setting-row dai-setting-toggle"><span><b>把纳戒写进正文提示词</b><small>生成前把主角自身状态写进提示词，正文必须与之保持一致。</small></span><input type="checkbox" data-setting="self.inject"></label><label class="dai-setting-row"><span><b>注入字数上限</b><small>超预算从目标、进行中炼制、行囊往上丢，身份境界永远保留；0 为默认 900。</small></span><input type="number" min="0" step="100" data-setting="self.injectBudget"></label><label class="dai-setting-row dai-setting-toggle"><span><b>镜像到龙血玄黄数据库</b><small>把纳戒与世界台账同步写进「龙血玄黄·数据库」的表格（表=账本，面板=前端）；没装该脚本时自动停用，照旧存聊天档案。</small></span><input type="checkbox" data-setting="enableDbBridge"></label><p class="dai-turn-result" data-self-dbbridge></p></div><details class="dai-settle-category"><summary><span class="dai-feature-icon" aria-hidden="true">${daiIcon("flame")}</span><span><b>初始化主角档案（MVU）</b><small>开局填一次，默认收起：写入纳戒账本，并同步 MVU 变量（stat_data.斗破纳戒）与数据库表；留空的项保持原样不动。</small></span></summary><div class="dai-settle-category-body"><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>姓名</b></span><input type="text" data-self-init="name" maxlength="24"></label><label class="dai-setting-row"><span><b>性别</b></span><select data-self-init="gender"><option value="">（不填）</option><option>男</option><option>女</option></select></label><label class="dai-setting-row"><span><b>年龄</b></span><input type="text" data-self-init="age" maxlength="12" placeholder="如 15 / 十五岁"></label><label class="dai-setting-row"><span><b>出身</b></span><input type="text" data-self-init="origin" maxlength="24" placeholder="如 萧家 / 青山镇"></label><label class="dai-setting-row"><span><b>斗气属性</b></span><input type="text" data-self-init="attribute" maxlength="12" placeholder="火/风/雷/无属性…"></label><label class="dai-setting-row"><span><b>境界</b></span><input type="text" data-self-init="realm" maxlength="12" placeholder="斗之气/斗者…"></label><label class="dai-setting-row"><span><b>段位</b></span><input type="text" data-self-init="stage" maxlength="10" placeholder="三段/一星…"></label><label class="dai-setting-row"><span><b>金币</b></span><input type="number" data-self-init="gold" min="0" max="9999999" step="1" placeholder="初始身家"></label></div><div class="dai-turn-actions"><button type="button" class="dai-button" data-self-init-run>初始化并同步 MVU</button><span class="dai-turn-result" data-self-init-status role="status">还没初始化。</span></div></div></details>
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
                        <details class="dai-settle-category"><summary><span class="dai-feature-icon" aria-hidden="true">${daiIcon("ring")}</span><span><b>指令指南（降级模式）</b><small>关闭自动决定时随纳戒现状注入的规则正文；点开修改，清空恢复内置默认。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>规则正文</b><small>操作清单、记账规则（有据可依、不照搬原著、炼成补账）都写在这里，可按你的玩法改写。</small></span><textarea data-setting="self.guide" rows="9" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-self-guide-default>填入默认规则</button><small>默认规则含“只记主角自身、变化要有依据、炼成后补记行囊”。</small></div></div></details>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>模型决定（LLM 决定脚本执行）</b><small>生成结束后，模型读最近聊天 + 原著资料已注入的原著条目 + 纳戒现状做一次独立决定，输出严格 JSON，脚本逐条校验执行并显示在这里。决定用的接口与喂料在「模型设置」页「纳戒 · 决定模型」卡（与记忆决定各自独立）。</small></div><div class="dai-feature-toggle"><span class="dai-feature-icon" aria-hidden="true">${daiIcon("ring")}</span><span><b>启用模型决定</b><small>关闭后退回“只认正文 self 指令块”的降级模式。</small></span><input type="checkbox" data-setting="self.decideEnabled"></div><label class="dai-setting-row dai-setting-toggle"><span><b>每轮生成后自动决定</b><small>关闭后只能点“让模型决定一次”手动跑。</small></span><input type="checkbox" data-setting="self.decideAuto"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>喂最近几楼聊天</b><small>纳戒决定自己的一份（与记忆决定分开）。</small></span><input type="number" min="1" max="12" step="1" data-setting="self.decideMaxFloors" placeholder="留空或 0＝跟随角色正则"></label></div><p class="dai-turn-result" data-self-decide-status role="status">还没有运行。生成结束后会自动决定。</p><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-self-decide-run>让模型决定一次</button><button type="button" class="dai-secondary-button" data-self-reset>清空本局纳戒</button></div><div class="dai-world-decide-result" data-self-decide-result></div><details class="dai-prompt-fold"><summary><span><b>决定提示词</b><small>模型做决定时收到的 system 规则；点开修改，清空恢复内置默认。改写时保持“只输出 JSON”和操作字段名不变。</small></span></summary><label class="dai-setting-row"><span><b>规则正文</b><small>境界阶梯、炼成补账、有据可依的规则都在这里，可按玩法改写。</small></span><textarea data-setting="self.decidePrompt" rows="10" spellcheck="false" placeholder="打开页面会自动铺入当前生效的规则"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-secondary-button" data-self-decide-default>填入默认规则</button><small>默认规则含“境界必须剧情真到位、炼成后补记行囊、无变化不记账”。</small></div></details></div>
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
                        <div class="dai-page-heading"><h3>记忆存储</h3><p>记忆分小记忆（轻量近事）与大记忆（总结出来的长期大事），都永久保存、按需召回——"关联"里的人名/地名出现在最近剧情里才会注入提示词。书记官只记小记忆；小记忆攒够阈值就自动总结成一条大记忆，原条目随之退役。删除只由书记官或你手动做，脚本从不过期任何记忆。</p></div>
                        <div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon" aria-hidden="true">${daiIcon("brush")}</span><span><b>启用记忆存储</b><small>关闭后不记账、不召回；已记下的内容仍留在聊天存档里。</small></span><input type="checkbox" data-setting="enableMemoryLedger"></div><label class="dai-setting-row dai-setting-toggle"><span><b>按需召回进正文提示词</b><small>生成前注入记忆；主路由「召回决定」按目录挑选，没跑成退回关键词匹配。</small></span><input type="checkbox" data-setting="memory.inject"></label><label class="dai-setting-row"><span><b>召回字数上限</b><small>本轮注入的记忆总字数上限；预算内放不下的整条跳过，不会拦腰截断；0 ＝ 不限制（默认）。设了小预算会只装下两三条。</small></span><input type="number" min="0" step="100" data-setting="memory.injectBudget"></label><label class="dai-setting-row dai-setting-toggle"><span><b>自动决定（书记官）</b><small>每轮生成后由模型决定新记忆；关掉后只认正文里的 memory 指令块。</small></span><input type="checkbox" data-setting="memory.decideAuto"></label><label class="dai-setting-row dai-setting-toggle"><span><b>启用记忆决定调用</b><small>关闭后不再发起书记官调用，只走降级指令。</small></span><input type="checkbox" data-setting="memory.decideEnabled"></label><label class="dai-setting-row dai-setting-toggle"><span><b>启用召回决定调用</b><small>关闭后注入退回关键词匹配，不发起召回模型调用。</small></span><input type="checkbox" data-setting="memory.recallEnabled"></label><label class="dai-setting-row dai-setting-toggle"><span><b>生成前自动召回</b><small>用户输入之后、生成之前，召回员按记忆目录+上下文挑要注入的旧记忆；关掉后注入退回关键词匹配。</small></span><input type="checkbox" data-setting="memory.recallAuto"></label><label class="dai-setting-row"><span><b>小记忆攒几条自动总结成大记忆</b><small>书记官只记小记忆；攒够这个数，就自动调一次模型把这批小记忆提炼成一条大记忆，原条目退役。0 = 关闭自动总结；「现在就总结一次」不受阈值限制。</small></span><input type="number" min="0" max="30" step="1" data-setting="memory.consolidateAfter"></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-memory-consolidate>现在就总结一次</button><small role="status" data-memory-consolidate-status></small></div><details class="dai-settle-category"><summary><span class="dai-feature-icon" aria-hidden="true">${daiIcon("brush")}</span><span><b>指令指南（降级模式）</b><small>关闭自动决定时随召回结果注入的规则正文；保持"只输出 JSON"与操作字段名不变，清空恢复内置默认。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>指南正文</b></span><textarea data-setting="memory.guide" rows="9" spellcheck="false"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-memory-guide-default>填入默认指南</button></div></div></details></div><div class="dai-settings-card"><div class="dai-card-heading"><b>记忆总览</b><small>按层统计；注入哪些记忆由「召回决定」按记忆目录+上下文挑选，召回没跑成退回关键词匹配。旧记忆永不作废。排序与按人过滤在「记忆总库」里。</small></div><p class="dai-state-strip" data-memory-overview>还没有载入记忆。</p><p class="dai-turn-result" data-memory-conflicts hidden></p><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-modal-open="memory-browser" data-modal-title="记忆总库">打开记忆总库</button><button type="button" class="dai-secondary-button" data-api-mode-section="advanced" data-modal-open="memory-person" data-modal-title="按人整合">按人整合</button><button type="button" class="dai-secondary-button" data-modal-open="memory-add" data-modal-title="手动登记一条记忆">＋ 手动登记</button></div></div>
                        <div class="dai-settings-card" data-api-mode-section="advanced"><div class="dai-card-heading"><b>记忆体检</b><small>纯本地统计，不发模型调用：疑似重复/矛盾对、认领不到任何台账实体的孤立钥匙（多半是笔误）、当前目录预算下召回员实际可见几条、已被覆盖几条。整卡只在进阶版显示；向量覆盖在「模型设置」页看。</small></div><p class="dai-state-strip" data-memory-audit-stats>打开记忆页时自动体检。</p><div class="dai-world-events" data-memory-audit-list></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>记忆注入</b><small>最近一轮实际进入正文提示词的记忆：来源（召回决定/关键词兜底）、条数与内容；点条目看完整记录。生成结束会标「已清理」。</small></div><p class="dai-state-strip" data-memory-injection-status>还没有注入记录：下一轮生成时由召回决定（或关键词兜底）挑选。</p><div class="dai-world-events" data-memory-injection-list></div><div data-api-mode-section="advanced" hidden><label class="dai-setting-row dai-setting-toggle"><span><b>开局摘要</b><small>切换/载入聊天后的第一条回复前，注入一次跨账本交底（时间·在场人物·待办任务·未了线头·旧账恩怨）；只注一次，生成结束即清。进阶版功能。</small></span><input type="checkbox" data-setting="memory.wakeUp"></label><label class="dai-setting-row"><span><b>开局摘要字数上限</b><small>一次性交底的总字数上限，200-2000；摘要为空（空库空账）时本轮不注。</small></span><input type="number" min="200" max="2000" step="50" data-setting="memory.wakeUpBudget"></label></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>大记忆</b><small>值得一直记住的事；★=关键；召回优先于小记忆。主界面只铺最新 6 条，全部与翻页在「记忆总库」。</small></div><div class="dai-world-events" data-memory-recent-big></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>小记忆</b><small>轻量近事；攒够阈值自动总结成一条大记忆（原条目退役）。主界面只铺最新 8 条，全部与翻页在「记忆总库」。</small></div><div class="dai-world-events" data-memory-recent-small></div></div>
                        <div class="dai-modal-dock" data-modal-dock="memory-browser" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>记忆总库</b><small>全部大记忆与小记忆：排序、按人过滤、翻页都在这里；行内转大/提关键/删除照常用，点行看详情。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>排序</b></span><select data-memory-sort><option value="time">按生成时间</option><option value="weight">按分量（关键优先）</option><option value="tag">按标签分类</option></select></label><label class="dai-setting-row"><span><b>只看关联</b><small>下场对手戏前按人扫一遍旧账。</small></span><select data-memory-person><option value="">全部</option></select></label></div><div class="dai-card-heading"><b>大记忆</b><small>★=关键；召回优先于小记忆。每页固定 6 条，翻页看更多。</small></div><div class="dai-world-events" data-memory-list-big></div><div class="dai-pager" data-memory-pager-big></div><div class="dai-card-heading"><b>小记忆</b><small>轻量近事；攒够阈值自动总结成一条大记忆（原条目退役）。每页固定 8 条，翻页看更多。</small></div><div class="dai-world-events" data-memory-list-small></div><div class="dai-pager" data-memory-pager-small></div></div><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-agent-modal-close>关闭</button></div></div>
                        <div class="dai-modal-dock" data-modal-dock="memory-person" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>按人整合</b><small>选一个人，把他散在三本账里的叙事并成一条时间线：记忆（按关联钥匙命中）、好感流水、人物簿经历与流水、世界事件与任务——按世界天新→旧排列，行首角标标注来源。</small></div><label class="dai-setting-row"><span><b>人物</b><small>人物簿里的人优先；没建人物簿时退回记忆关联里的钥匙。</small></span><select data-memory-person-view><option value="">选一个人</option></select></label><p class="dai-state-strip" data-memory-person-summary hidden></p><div class="dai-world-events" data-memory-person-timeline></div></div><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-agent-modal-close>关闭</button></div></div>
                        
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>模型决定（LLM 决定脚本执行）</b><small>生成结束后，书记官读最近聊天 + 相关世界书条目 + 本场召回的记忆做一次独立决定，输出严格 JSON，脚本逐条校验执行。</small></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button" data-memory-decide-run>手动决定一次</button><span data-memory-decide-status></span></div><div data-memory-decide-result></div><details class="dai-settle-category"><summary><span class="dai-feature-icon" aria-hidden="true">${daiIcon("flame")}</span><span><b>决定提示词</b><small>书记官的 system 指令；保持"只输出 JSON"与操作字段名不变，清空恢复内置默认。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>提示词正文</b></span><textarea data-setting="memory.decidePrompt" rows="9" spellcheck="false"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-memory-decide-default>填入默认提示词</button></div></div></details></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>召回决定（LLM 挑选注入哪些记忆）</b><small>用户输入之后、生成之前，召回员读记忆目录（标题+钥匙）+ 最近聊天 + 世界书命中，挑出本轮要注入的旧记忆编号，脚本执行注入；目录按混合检索分数序排（钥匙/引文/词面/时间邻近/语义），场景勾得越深的排得越靠前；失败或关闭时退回同款混合分数的兜底匹配，不阻塞生成。</small></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button" data-memory-recall-run>手动召回一次</button><span data-memory-recall-status></span></div><div data-memory-recall-result></div><label class="dai-setting-row"><span><b>目录字数上限</b><small>发给召回员的记忆目录总字数；0 ＝ 不限制（默认），账本再大召回员也看得到全部。设了上限时超预算的条目按打分从尾部丢。</small></span><input type="number" min="0" step="500" data-setting="memory.catalogBudget"></label><details class="dai-settle-category"><summary><span class="dai-feature-icon" aria-hidden="true">${daiIcon("flame")}</span><span><b>召回提示词</b><small>召回员的 system 指令；保持"只输出 JSON"与 ids 字段名不变，清空恢复内置默认。</small></span></summary><div class="dai-settle-category-body"><label class="dai-setting-row"><span><b>提示词正文</b></span><textarea data-setting="memory.recallPrompt" rows="9" spellcheck="false"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-memory-recall-default>填入默认提示词</button></div></div></details></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>记忆指令流水</b><small>最近几批指令的执行结果；重 roll 一楼会先撤销它上一版指令。</small></div><div class="dai-world-journal" data-memory-journal></div></div>
                    <div class="dai-modal-dock" data-modal-dock="memory-add" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>手动登记</b><small>书记官漏记时在这里补一笔，校验与模型指令完全一致。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>层级</b></span><select data-memory-new-tier><option value="small">小记忆</option><option value="big">大记忆</option></select></label><label class="dai-setting-row"><span><b>标签（大记忆可选）</b></span><select data-memory-new-tag><option value="">不标</option><option value="grudge">恩怨</option><option value="intel">情报</option><option value="thread">伏笔</option><option value="milestone">大事记</option></select></label><label class="dai-setting-row"><span><b>分量</b></span><select data-memory-new-weight><option value="minor">一般</option><option value="major">关键</option></select></label></div><label class="dai-setting-row"><span><b>短标题</b><small>必填；列表主页只显示这一行。</small></span><input type="text" data-memory-new-title maxlength="14" required></label><label class="dai-setting-row"><span><b>内容</b><small>一句话说清记住了什么、为什么值得记。</small></span><input type="text" data-memory-new-text maxlength="300"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>依据</b><small>从哪来：哪楼/谁/什么事。</small></span><input type="text" data-memory-new-basis maxlength="80"></label><label class="dai-setting-row"><span><b>关联（必填）</b><small>人名/地名/物名，顿号分隔最多 4 个——这是日后按需召回的钥匙。</small></span><input type="text" data-memory-new-related maxlength="140"></label></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>别名（可选）</b><small>同一记忆的其余叫法（药老/药尘），也算召回钥匙。</small></span><input type="text" data-memory-new-aliases maxlength="140"></label><label class="dai-setting-row"><span><b>引文（可选）</b><small>当时的一句原话，召回时以「」带回正文。</small></span><input type="text" data-memory-new-quote maxlength="60"></label></div><label class="dai-setting-row"><span><b>备注（可选）</b><small>细节、背景、后续影响——列表行内只显示内容一句，这些都在详情弹窗里。</small></span><input type="text" data-memory-new-note maxlength="200"></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button" data-memory-add>登记这条记忆</button></div></div><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-agent-modal-close>取消</button></div></div></section>
                    <section class="dai-settings-page" data-settings-section="impact" role="tabpanel" hidden>
                        <div class="dai-page-heading"><h3>世界影响</h3><p>记录你把这局世界改成了什么样：烧掉的据点、得罪的势力、提前发生或没能发生的原著事件。库跟着这份聊天存档走，写进后续每一轮的正文提示词。账本在下面；添加和编辑都走弹窗。</p></div>
                        <div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon" aria-hidden="true">${daiIcon("ripple")}</span><span><b>启用世界影响库</b><small>关掉后不记录、不注入，但已记下的内容仍留在聊天存档里。</small></span><input type="checkbox" data-setting="enablePlayerImpact"></div></div><div class="dai-settings-card"><div class="dai-card-heading"><b>世界线最近变化</b><small data-impact-summary>加载中…</small></div><p class="dai-state-strip" data-impact-stats>本轮还没挑过注入；生成前会自动挑。</p><p class="dai-turn-result" data-impact-decide-status role="status">默认按上面的节奏自动记录；也可以点“现在记录一次”。</p><div class="dai-turn-actions"><button type="button" class="dai-run-button" data-impact-open-ledger>打开世界账本</button><button type="button" class="dai-secondary-button" data-impact-add>＋ 记一条</button><button type="button" class="dai-secondary-button" data-impact-record>现在记录一次</button></div><ul class="dai-impact-list dai-impact-recent" data-impact-recent></ul></div><div class="dai-modal-dock" data-modal-dock="impact-ledger" hidden><div class="dai-settings-card"><div class="dai-card-heading"><b>世界账本</b><small>全部记录都在这里：筛选、搜索、编辑、收场、删除与档案恢复。</small></div><div class="dai-impact-toolbar"><select data-impact-filter aria-label="筛选影响"><option value="all">全部</option><option value="active">未了结</option><option value="ripened">已发酵</option><option value="closed">已了结</option></select><select data-impact-weight aria-label="按分量筛选"><option value="">分量</option><option value="world">世界级</option><option value="major">大事</option><option value="minor">小事</option></select><select data-impact-kind aria-label="按性质筛选"><option value="">性质</option><option value="direct">直接</option><option value="ripple">涟漪</option><option value="butterfly">蝴蝶</option></select><input type="search" data-impact-search placeholder="搜标题、对象或原著" aria-label="搜索影响"><button type="button" class="dai-button dai-button-ghost" data-impact-refresh>刷新</button></div><ul class="dai-impact-list" data-impact-library></ul><details class="dai-impact-archive" data-impact-archive><summary>档案 <small data-impact-archive-count>0 条</small></summary><p class="dai-impact-empty">被删除或因为库满挤出去的旧影响会留在这里，可以恢复。</p><ol class="dai-impact-list" data-impact-archive-list></ol></details><div class="dai-turn-actions"><button type="button" class="dai-secondary-button" data-agent-modal-close>关闭</button></div></div></div>
                        <div class="dai-settings-card"><div class="dai-card-heading"><b>记录与注入</b><small>什么时机记账、怎么进正文；记录员与场记用的接口在「模型设置」页。</small></div><label class="dai-setting-row dai-setting-toggle"><span><b>生成后自动记录</b><small>让“记录模型”在正文生成结束后把这一轮的世界变化写进库；关掉后只剩手动记录。</small></span><input type="checkbox" data-setting="impact.decideAuto"></label><label class="dai-setting-row"><span><b>记录节奏</b><small>每轮都记更细，但每轮多一次模型调用；每三轮记一次更省，代价是中间两轮的改动要等到下次记账才进库。</small></span><select data-setting="impact.decideEvery"><option value="1">每轮生成后</option><option value="3">每三轮生成后</option></select></label><label class="dai-setting-row"><span><b>总览显示最近几条</b><small>总页面只铺最近生成的影响；其余进「世界账本」弹窗看。</small></span><input type="number" min="1" max="20" step="1" data-setting="impact.recentCount"></label><label class="dai-setting-row dai-setting-toggle"><span><b>把世界线写进正文提示词</b><small>已发生、还没收场的影响会作为“本局世界线”随生成发给正文模型。</small></span><input type="checkbox" data-setting="impact.inject"></label><label class="dai-setting-row dai-setting-toggle"><span><b>注入前让模型挑选</b><small>每轮生成前，让“挑选模型”从账本里挑出这一幕真正用得上的影响，并改写成旁白；关掉则按分量和日期直接取，省一次调用。</small></span><input type="checkbox" data-setting="impact.injectSmart"></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>注入字数预算</b><small>每轮最多花多少字描述已改的世界线；超出预算的影响只留在库里。</small></span><input type="number" min="0" step="50" data-setting="impact.injectBudget"></label><label class="dai-setting-row"><span><b>注入前看最近几楼</b><small>挑选模型据此判断这一幕的场面：玩家在哪、身边有谁、要做什么。</small></span><input type="number" min="1" max="12" step="1" data-setting="impact.injectFloors" placeholder="留空或 0＝跟随角色正则"></label></div><label class="dai-setting-row"><span><b>影响链最多接几层</b><small>一条影响还能接出几条后续；超过这个层数就只记录，不再自动接链。</small></span><input type="number" min="0" max="8" step="1" data-setting="impact.maxChainDepth"></label></div>
                        <details class="dai-prompt-fold"><summary><span><b>记录员提示词</b><small>生成结束后记账用的规则；点开才展开。</small></span></summary><label class="dai-setting-row"><span><b>规则正文</b><small>打开页面显示的就是当前生效的全文；清空＝恢复内置默认。改写时保持“只输出 JSON”和操作字段名不变。</small></span><textarea data-setting="impact.prompt" rows="14" spellcheck="false" placeholder="留空使用内置提示词"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-impact-prompt-default="decide">填入内置提示词</button><small>改完下一轮生效，不用重启。</small></div></details>
                        <details class="dai-prompt-fold"><summary><span><b>场记提示词</b><small>生成前挑选并改写影响用的规则；点开才展开。</small></span></summary><label class="dai-setting-row"><span><b>规则正文</b><small>打开页面显示的就是当前生效的全文；清空＝恢复内置默认。改写时保持“只从账本挑、用 #编号”不变。</small></span><textarea data-setting="impact.injectPrompt" rows="12" spellcheck="false" placeholder="留空使用内置提示词"></textarea></label><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button dai-button-ghost" data-impact-prompt-default="inject">填入内置提示词</button><small>默认收起；改完下一轮生效。</small></div></details>
                        <div class="dai-modal-dock" data-modal-dock="impact-form" hidden><div class="dai-settings-card"><div class="dai-impact-form" data-impact-form hidden><input type="hidden" data-impact-field="ref"><div class="dai-impact-form-head"><b data-impact-form-title>记一条世界影响</b><small>手动记的条目和记录员记的一样：会进正文、会发酵，也保留在聊天存档里。</small></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>标题</b></span><input type="text" maxlength="20" data-impact-field="title" placeholder="世界哪一块变了（≤20字）"></label><label class="dai-setting-row"><span><b>对象</b></span><input type="text" maxlength="40" data-impact-field="target" placeholder="哪个地方/势力/规矩"></label></div><label class="dai-setting-row"><span><b>详情</b><small>具体变了什么、有什么能被看见的后果。</small></span><textarea rows="3" maxlength="240" data-impact-field="detail" placeholder="例如：城中药材涨价，加列家族开始暗中追查纵火者"></textarea></label><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>性质</b></span><select data-impact-field="kind"><option value="direct">直接 · 玩家亲手</option><option value="ripple">涟漪 · 旁人因此改主意</option><option value="butterfly">蝴蝶 · 隔了时间才显形</option></select></label><label class="dai-setting-row"><span><b>分量</b></span><select data-impact-field="weight"><option value="minor">小事</option><option value="major">大事</option><option value="world">世界级</option></select></label><label class="dai-setting-row"><span><b>确定性</b></span><select data-impact-field="certainty"><option value="certain">确凿</option><option value="rumor">传闻</option></select></label></div><div class="dai-setting-grid"><label class="dai-setting-row"><span><b>依据</b></span><input type="text" maxlength="120" data-impact-field="evidence" placeholder="哪一楼、哪句话"></label><label class="dai-setting-row"><span><b>对上台账事件</b><small>世界运转里的事件编号，如 e2；没有就留空。</small></span><input type="text" maxlength="40" data-impact-field="eventId" placeholder="例如：e2"></label><label class="dai-setting-row"><span><b>原著节点</b><small>没牵动就留空。</small></span><input type="text" maxlength="60" data-impact-field="canon" placeholder="例如：退婚"></label><label class="dai-setting-row"><span><b>原著偏移</b></span><select data-impact-field="shift"><option value="none">不牵动</option><option value="accelerate">加速</option><option value="delay">延后</option><option value="avoid">避过</option><option value="alter">改写</option></select></label></div><div class="dai-setting-row dai-setting-actions"><button type="button" class="dai-button" data-impact-save>保存</button><button type="button" class="dai-button dai-button-ghost" data-impact-form-close>取消</button><small role="status" data-impact-form-status></small></div></div></div></div>
                    </section>
                    <section class="dai-settings-page" data-settings-section="sandbox" role="tabpanel" hidden>
                        <div class="dai-page-heading"><h3>开放世界</h3><p>开启后进入开放世界口径：不跟随原著剧情、不用世界书，斗气大陆照自己的逻辑运转，任务与传闻就是世界递到玩家手里的方向；关回主线一切照旧。</p><p role="status" data-sandbox-status>开关随开随关：拨了立刻按新口径换向并落存档，下一轮生成就按它跑。</p></div>
                        <div class="dai-settings-card"><div class="dai-feature-toggle"><span class="dai-feature-icon" aria-hidden="true">${daiIcon('compass')}</span><span><b>启用开放世界</b><small>开启＝开放世界口径：不跟剧情、不用世界书，斗气大陆基线注入正文。关闭＝主线口径：原著节点到点发生，玩家只影响过程。</small></span><input type="checkbox" data-setting="enableSandboxMode"></div>
<label class="dai-setting-row"><span><b>世界惯性</b><small>决定原著事件在开放世界里多积极地自行发生。强＝窗口一开始就发生；中＝到窗口结束才发生；弱＝不再自动发生，只留候选。</small></span><select data-setting="sandbox.inertia"><option value="strong">强 · 世界推着走</option><option value="medium">中 · 有人介入才偏离</option><option value="weak">弱 · 不再自动发生</option></select></label><label class="dai-setting-row dai-setting-toggle"><span><b>原著人物保留自主行动</b><small>关闭后原著人物只对玩家作出反应，不再主动推进自身轨迹。</small></span><input type="checkbox" data-setting="sandbox.canonCharactersAutonomous"></label></div>
                    </section>
                    <section class="dai-settings-page" data-settings-section="runtime" role="tabpanel" hidden>
                        <div class="dai-page-heading"><h3>运行与界面</h3><p>这里放全局开关和显示选项。</p></div><div class="dai-settings-card"><div class="dai-card-heading"><b>反馈显示</b><small>控制页面和右下角反馈的显示内容。</small></div><label class="dai-setting-row dai-setting-toggle"><span><b>紧凑界面</b></span><input type="checkbox" data-setting="ui.compact"></label><label class="dai-setting-row dai-setting-toggle"><span><b>先占位再补正文</b><small>等待模型时先在对话里放一条“……”，正文回来后再替换。</small></span><input type="checkbox" data-setting="ui.placeholder"></label></div></section>
                </div>
                <footer class="dai-settings-footer"><span>修改会自动保存到酒馆扩展设置</span><button type="button" class="dai-secondary-button" data-settings-close>完成</button></footer>
            </main>
        </div>`;
    document.body.append(panel);
    /** 调用版本切换：按钮高亮 + 按 `data-api-mode-section`（空格分隔多版本）只显示属于当前版本的卡片。
     *  完整版与进阶版共用逐路连接卡；进阶版另有一组 GitHub 系增强卡（完整版/简略版下整体隐藏）。 */
    function renderApiMode(target = panel) {
        const mode = apiMode();
        for (const button of target.querySelectorAll('[data-api-mode]')) button.classList.toggle('is-active', button.dataset.apiMode === mode);
        for (const section of target.querySelectorAll('[data-api-mode-section]')) {
            const modes = String(section.dataset.apiModeSection ?? '').split(/\s+/).filter(Boolean);
            section.hidden = !modes.includes(mode);
        }
    }
    const selectPage = page => {
        const wanted = page === 'llm' ? 'hub' : page;
        activeSettingsPage = [...panel.querySelectorAll('[data-settings-section]')].some(section => section.dataset.settingsSection === wanted) ? wanted : 'overview';
        for (const item of panel.querySelectorAll('[data-settings-page]')) item.classList.toggle('is-active', item.dataset.settingsPage === activeSettingsPage);
        for (const section of panel.querySelectorAll('[data-settings-section]')) section.hidden = section.dataset.settingsSection !== activeSettingsPage;
        const title = panel.querySelector('[data-settings-title]');
        const selected = panel.querySelector(`[data-settings-page="${activeSettingsPage}"] b`);
        if (title && selected) title.textContent = selected.textContent;
        // 进阶卡片散在各页：每次切页都按当前调用版本重算显隐（不只模型设置页）。
        renderApiMode(panel);
        if (activeSettingsPage === 'overview') {
            renderCallSummary(panel);
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
            renderVerifyEntries(panel);
        }
        if (activeSettingsPage === 'world') refreshWorldPage(panel);
        if (activeSettingsPage === 'memory') refreshMemoryPage(panel);
        if (activeSettingsPage === 'impact') renderImpactLibrary(panel);
        if (activeSettingsPage === 'hub') {
            renderApiMode(panel);
            refreshMemoryVectorStats(panel);
        }
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
        const noteRun = event.target.closest?.('[data-decide-note-run]');
        if (noteRun) {
            const dock = noteRun.closest('[data-modal-dock="decide-note"]');
            const area = dock?.querySelector('textarea');
            const action = dock?.__decideRun;
            if (typeof action === 'function') {
                closeAgentModal(panel);
                void Promise.resolve(action(area?.value ?? '')).catch(() => { /* 决定失败的状态已写进各自页面状态行 */ });
            }
            return;
        }
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
        if (event.target.closest?.('[data-verify-run]')) {
            void Promise.resolve(runFactCheck({ source: 'manual' })).then(result => {
                try { recordAgentAudit({ event: 'turn_fact_check', outcome: String(result?.status ?? 'unknown') }); } catch { /* 审计失败不影响记账 */ }
            }).catch(() => {});
            return;
        }
        const verifyDefault = event.target.closest?.('[data-verify-default]');
        if (verifyDefault) {
            const area = panel.querySelector('[data-setting="verify.prompt"]');
            if (area) {
                area.value = VERIFY_PROMPT;
                area.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return;
        }
        const verifyFp = event.target.closest?.('[data-verify-fp]');
        if (verifyFp) {
            markVerifyFalsePositive(verifyFp.dataset.verifyFp, verifyFp.dataset.verifyFpRevision);
            return;
        }
        if (event.target.closest?.('[data-world-decide-run]')) {
            openDecideNoteModal(panel, {
                title: '让模型决定一次 · 世界运转',
                hint: '决定结果落进世界台账，状态行会回报本次判定。',
                placeholder: '例如：这轮让乌坦城传来炼药师大会的消息。',
                run: note => runWorldDecision({ source: 'manual', note }),
            });
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
        if (event.target.closest?.('[data-plot-decide-run]')) {
            openDecideNoteModal(panel, {
                title: '让模型决定一次 · 剧情账本',
                hint: '决定结果落进剧情账本，状态行会回报本次判定。',
                placeholder: '例如：下一步重点推进异火线索。',
                run: note => runPlotDecision({ source: 'manual', note }),
            });
            return;
        }
        const plotDecideDefault = event.target.closest?.('[data-plot-decide-default]');
        if (plotDecideDefault) {
            const area = panel.querySelector('[data-setting="plot.decidePrompt"]');
            if (area) {
                area.value = PLOT_DECIDE_PROMPT;
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
        // 模型名输入框：点一下重新弹出已拉到的模型列表，不用再点拉取。
        const modelField = event.target.closest?.('[data-api-preset-field="model"]');
        if (modelField) {
            openModelPicker(modelField.closest('.dai-api-preset'));
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
        if (event.target.closest?.('[data-self-decide-run]')) {
            openDecideNoteModal(panel, {
                title: '让模型决定一次 · 纳戒',
                hint: '决定结果直接落进纳戒账本，状态行会回报本次记账。',
                placeholder: '例如：这轮把回气丹用掉两枚；突破后记得更新境界。',
                run: note => runSelfDecision({ source: 'manual', note }),
            });
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
        const memoryUnsupersede = event.target.closest?.('[data-memory-unsupersede]');
        if (memoryUnsupersede) {
            return memoryApplyFromPanel(panel, [{ op: 'unsupersede', id: memoryUnsupersede.dataset.memoryUnsupersede }]);
        }
        const memoryVectorRebuild = event.target.closest?.('[data-memory-vector-rebuild]');
        if (memoryVectorRebuild) {
            const statsTarget = panel.querySelector('[data-memory-vector-stats]');
            const run = async () => {
                try {
                    if (!memorySettings().embedding.enabled || !agentEmbeddingClient.available()) {
                        if (statsTarget) statsTarget.textContent = '语义检索未开启：先填好接口地址与向量模型。';
                        return;
                    }
                    if (statsTarget) statsTarget.textContent = '正在重建向量……';
                    await agentMemoryVectors.clear();
                    const result = await agentMemoryVectors.sync(agentMemoryRuntime.snapshot(), { budget: 40 });
                    if (statsTarget) {
                        statsTarget.textContent = `已重嵌 ${result.embedded} 条${result.remaining ? `，剩 ${result.remaining} 条随后台补嵌` : ''}。`;
                    }
                } catch (error) {
                    if (statsTarget) statsTarget.textContent = `重建失败：${error?.message ?? error}`;
                }
            };
            void run();
            return;
        }
        if (event.target.closest?.('[data-memory-add]')) return memoryAddFromPanel(panel);
        if (event.target.closest?.('[data-memory-decide-run]')) {
            openDecideNoteModal(panel, {
                title: '手动决定一次 · 记忆',
                hint: '书记官读最近聊天与召回材料落账，状态行会回报本次记账。',
                placeholder: '例如：这轮记下与药老约定的炼丹时间。',
                run: note => runMemoryDecision({ source: 'manual', note }),
            });
            return;
        }
        if (event.target.closest?.('[data-memory-recall-run]')) {
            openDecideNoteModal(panel, {
                title: '手动召回一次 · 记忆',
                hint: '召回员按本轮输入挑旧记忆注入，状态行会回报本次注入。',
                placeholder: '例如：把关于异火古籍的旧记忆调出来。',
                run: note => runMemoryRecall({ source: 'manual', note }),
            });
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
        if (event.target.closest?.('[data-calllog-clear]')) {
            agentLlmClient.clearCallLog();
            return renderCallSummary(panel);
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
        if (event.target.closest?.('[data-impact-record]')) {
            openDecideNoteModal(panel, {
                title: '现在记录一次 · 世界影响',
                hint: '记录员读世界台账与最近聊天落账，状态行会回报本次记录。',
                placeholder: '例如：重点记录当铺掌柜对萧炎态度的转变。',
                run: note => runImpactDecision({ source: 'manual', note }),
            });
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
        const gossipRun = event.target.closest?.('[data-npc-gossip-run]');
        if (gossipRun) {
            gossipRun.disabled = true;
            const before = gossipRun.textContent;
            gossipRun.textContent = '传播中……';
            void runNpcGossip(panel).catch(error => setNpcLedgerStatus(`传闻传播失败：${error?.message ?? error}`)).finally(() => {
                gossipRun.disabled = false;
                gossipRun.textContent = before;
            });
            return;
        }
        const gossipConfirm = event.target.closest?.('[data-npc-gossip-confirm]');
        if (gossipConfirm) {
            const dock = gossipConfirm.closest('[data-npc-gossip-patches]');
            let patches = [];
            try { patches = JSON.parse(dock?.dataset.npcGossipPatches ?? '[]'); } catch { patches = []; }
            const patch = patches[Number(gossipConfirm.dataset.npcGossipConfirm)];
            if (!patch) { setNpcLedgerStatus('这份传闻补丁已经不在了。'); return; }
            const result = applyNpcLedgerPayload({ 人物: [patch] }, { source: '传闻', floor: lastReplyIndex(getHostContext()?.chat || []), logSrc: '传闻' });
            if (result.persistence) void awaitPanelPersistence({ persistence: result.persistence }, setNpcLedgerStatus);
            gossipConfirm.closest('.dai-exp-preview')?.remove();
            return;
        }
        const gossipDiscard = event.target.closest?.('[data-npc-gossip-discard]');
        if (gossipDiscard) {
            gossipDiscard.closest('.dai-exp-preview')?.remove();
            setNpcLedgerStatus('已放弃这份传闻补丁，人物簿没有变化。');
            return;
        }
        const consistencyRun = event.target.closest?.('[data-npc-consistency-run]');
        if (consistencyRun) {
            consistencyRun.disabled = true;
            const before = consistencyRun.textContent;
            consistencyRun.textContent = '体检中……';
            void runNpcConsistencyCheck({ source: 'manual' }).catch(error => setNpcLedgerStatus(`体检失败：${error?.message ?? error}`)).finally(() => {
                consistencyRun.disabled = false;
                consistencyRun.textContent = before;
                refreshNpcLedgerPage(panel);
            });
            return;
        }
        const relationsRefresh = event.target.closest?.('[data-npc-relations-refresh]');
        if (relationsRefresh) {
            refreshNpcLedgerPage(panel);
            return;
        }
        const expAutoConfirm = event.target.closest?.('[data-exp-auto-confirm]');
        if (expAutoConfirm) {
            confirmAutoExpCondense(expAutoConfirm.dataset.expAutoConfirm);
            return;
        }
        const expAutoDiscard = event.target.closest?.('[data-exp-auto-discard]');
        if (expAutoDiscard) {
            discardAutoExpCondense(expAutoDiscard.dataset.expAutoDiscard);
            return;
        }
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
        const coldUndo = event.target.closest?.('[data-npc-cold-undo]');
        if (coldUndo) {
            const receipt = undoLastNpcColdConfirm();
            const persistence = receipt?.persistence ?? receipt?.result?.persistence;
            if (persistence) void awaitPanelPersistence({ persistence }, setNpcLedgerStatus);
            return;
        }
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
                if (changed.status === 'removed') {
                    changed.persistence = persistNpcLedger();
                    // 人走了，关系边也清掉：关系图不留指向空档案的悬空边。
                    const removedEdges = agentNpcRelations.remove(operation.name);
                    if (removedEdges.removed) persistNpcRelations();
                }
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
        const modeButton = event.target.closest?.('[data-api-mode]');
        if (modeButton) {
            const wanted = ['lite', 'advanced'].includes(modeButton.dataset.apiMode) ? modeButton.dataset.apiMode : 'full';
            if (currentSettings().apiMode !== wanted) {
                const result = updateSetting('apiMode', wanted);
                void Promise.resolve(hostStorage.saveSettings?.()).catch(() => { /* 保存失败下次启动仍会重存 */ });
                const status = panel.querySelector(`#${SETTINGS_STATUS_ID}`);
                if (status) status.textContent = result.status === 'ready'
                    ? `已切换到${wanted === 'lite' ? '简略版（合并调用）' : wanted === 'advanced' ? '进阶版（完整版管线＋进阶增强）' : '完整版（每功能一路，进阶增强关闭）'}，下一轮开始生效。`
                    : '切换失败：酒馆设置不可用，这次没有保存。';
            }
            renderApiMode(panel);
            refreshControlDashboard();
            // 悬浮球立刻跟上：角标（data-api-mode）与开着的总控窗不等下一次模型活动才换脸。
            syncOrbHud();
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
        // 复选框（走酒馆通道）取 checked 存布尔，文本/下拉取 value。
        const presetField = event.target.closest?.('[data-api-preset-field]');
        if (presetField) {
            const holder = presetField.closest('[data-api-preset-id]');
            if (holder) {
                const field = presetField.dataset.apiPresetField;
                const rawValue = presetField.type === 'checkbox' ? presetField.checked : presetField.value;
                const sequence = ++settingsSaveSequence;
                const result = updateApiPresetField(holder.dataset.apiPresetId, field, rawValue);
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
                if (field === 'tavern') {
                    // 通道切换：摘要与各功能下拉的标记即时跟上
                    const summary = holder.querySelector('summary small');
                    if (summary) {
                        summary.textContent = presetField.checked
                            ? '走酒馆通道'
                            : ((currentSettings().api?.presets ?? []).find(item => item?.id === holder.dataset.apiPresetId)?.baseUrl?.trim() || '还没填接口地址');
                    }
                    renderApiPresetSelects(panel);
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
        if (input.dataset.setting === 'enableSandboxMode' || input.dataset.setting.startsWith('sandbox.')) { syncSandboxModeFromSettings(); syncOrbHud(); }
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
    settingsSaveSequence += 1;
}

export function onEnable() {
    settleExtensionEnabled = true;
    bindHostLifecycle();
    mount();
    probeAgentCapabilities();
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

export function updateAgentTask(taskId, status, fields) {
    return agentCoordinator.update(taskId, status, fields);
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
// 按人整合弹窗当前选中的人：页面本地状态，不进设置。
let memoryPersonViewName = '';

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
        const meta = [tierLabel + tagLabel, `第 ${entry.day} 天`, `#${entry.id}`, `重要度 ${Number.isFinite(Number(entry.importance)) ? entry.importance : (entry.weight === 'major' ? 7 : 4)}`];
        row.append(makeElement('small', 'dai-world-event-basis', meta.join(' · ')));
        if (typeof entry.quote === 'string' && entry.quote.trim()) {
            row.append(makeElement('small', 'dai-world-event-basis', `「${entry.quote.trim()}」`));
        }
        if (typeof entry.supersededBy === 'string' && entry.supersededBy) {
            row.append(makeElement('small', 'dai-world-event-basis', `已替代→${entry.supersededBy}：默认不再进召回目录与注入，账仍保留`));
        }
        // 别名/关联/依据/备注收进详情弹窗，行内只留一句简介。
        if (clash) {
            row.append(makeElement('small', 'dai-world-event-basis', `⚠ 与 ${clash.join('、')} 疑似重复/矛盾，请核对后删除或合并`));
        }
        const actions = makeElement('div', 'dai-world-event-actions');
        if (typeof entry.supersededBy === 'string' && entry.supersededBy) {
            const restore = makeElement('button', 'dai-secondary-button', '恢复');
            restore.type = 'button';
            restore.dataset.memoryUnsupersede = entry.id;
            actions.append(restore);
        }
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
        wireRowDetail(row, panel => { openMemoryEntryDetail(panel, entry); });
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

/** 记忆页整页刷新：总览、体检卡、排序/按人过滤、大/小两层分页清单、矛盾提醒、指令流水、按人整合弹窗。 */
/** 语义检索统计（模型设置页语义检索卡，异步 fire-and-forget）：没开就说明当前走纯本地混合检索。 */
function refreshMemoryVectorStats(panel) {
    const vectorStats = panel?.querySelector?.('[data-memory-vector-stats]');
    if (!vectorStats) return;
    if (!memorySettings().embedding.enabled || !agentEmbeddingClient.available()) {
        vectorStats.textContent = '语义检索未开启（当前走纯本地混合检索）。';
        return;
    }
    vectorStats.textContent = '向量统计中……';
    void agentMemoryVectors.stats(agentMemoryRuntime.snapshot()).then(stats => {
        vectorStats.textContent = `已向量化 ${stats.embedded}/${stats.total}（模型 ${stats.model || '未填'}），落账后后台自动补嵌。`;
    }).catch(() => {
        vectorStats.textContent = '向量统计不可用。';
    });
}

/* ── 记忆体检卡（MemPalace audit 的模拟）：纯本地健康统计，跟 refreshMemoryPage 一起刷。 */

/** 台账实体名全集：人物簿 name/aliases/titles + 世界台账 people/factions + 世界事件/任务文本 +
 *  纳戒物品名——记忆钥匙的"认领"名单。认领面要够宽：地名/物名（药铺、凝血草）出现在
 *  任何一本账里都算有人认得，只有哪个账都对不上的钥匙才报"孤立"（多半是笔误）。 */
function ledgerKnownNames() {
    const names = new Set();
    const push = value => { const name = typeof value === 'string' ? value.trim() : ''; if (name) names.add(name); };
    try {
        for (const record of agentNpcLedger.list()) {
            push(record?.name);
            for (const item of record?.aliases ?? []) push(item);
            for (const item of record?.titles ?? []) push(item);
        }
    } catch { /* 人物簿不可用只影响认领判定，体检照常出其余统计 */ }
    try {
        const world = agentWorldRuntime.snapshot();
        for (const item of world?.people ?? []) push(item?.name);
        for (const item of world?.factions ?? []) push(item?.name);
        push(world?.info?.location);
        push(world?.info?.era);
        for (const event of [...(world?.nearEvents ?? []), ...(world?.worldEvents ?? [])]) {
            push(event?.title);
            push(event?.text);
            push(event?.basis);
        }
        for (const task of world?.tasks ?? []) {
            push(task?.title);
            push(task?.detail);
        }
    } catch { /* 世界台账不可用时同上 */ }
    try {
        const self = agentSelfRuntime.snapshot?.();
        for (const list of Object.values(self ?? {})) {
            if (!Array.isArray(list)) continue;
            for (const item of list) {
                if (item && typeof item === 'object') { push(item?.name); push(item?.title); }
            }
        }
    } catch { /* 纳戒不可用时同上 */ }
    return [...names];
}

function refreshMemoryAuditCard(section, { pairs } = {}) {
    const statsEl = section.querySelector('[data-memory-audit-stats]');
    const listEl = section.querySelector('[data-memory-audit-list]');
    if (!statsEl && !listEl) return;
    const snapshot = agentMemoryRuntime.snapshot();
    const settings = memorySettings();
    const audit = auditMemory({
        snapshot,
        pairs: Array.isArray(pairs) ? pairs : null,
        catalogText: buildRecallCatalog(snapshot, { maxChars: settings.catalogBudget > 0 ? settings.catalogBudget : Infinity }),
        catalogBudget: settings.catalogBudget,
        knownNames: ledgerKnownNames(),
    });
    if (statsEl) {
        statsEl.textContent = [
            `目录可见 ${audit.coverage.cataloged}/${audit.coverage.total}`,
            `疑似矛盾 ${audit.pairs.length} 对`,
            `孤立钥匙 ${audit.deadKeys.length} 个`,
            `已覆盖 ${audit.superseded} 条`,
            audit.major ? `关键 ${audit.major} 条` : '',
        ].filter(Boolean).join(' · ');
    }
    if (!listEl) return;
    const rows = [];
    for (const pair of audit.pairs.slice(0, 4)) {
        const item = makeElement('div', 'dai-world-event');
        item.append(makeElement('b', '', `⚠ ${pair.a} ↔ ${pair.b}`), document.createTextNode(`文本相似 ${Math.round(pair.similarity * 100)}%：核对后在列表里删掉旧的，或用「标记替代」把旧账让给新账。`));
        rows.push(item);
    }
    for (const dead of audit.deadKeys.slice(0, 6)) {
        const item = makeElement('div', 'dai-world-event');
        item.append(makeElement('b', '', `◇ 孤立钥匙「${dead.key}」`), document.createTextNode(`只有 ${dead.ids.join('、')} 在用它，人物簿/纳戒/世界台账里都认领不到——多半是笔误，要么这条记忆是孤本；编辑那条记忆的「关联/别名」即可修正。`));
        rows.push(item);
    }
    if (audit.coverage.total > audit.coverage.cataloged) {
        const item = makeElement('div', 'dai-world-event');
        item.append(makeElement('b', '', `□ ${audit.coverage.total - audit.coverage.cataloged} 条在召回目录里看不见`), document.createTextNode(audit.coverage.budgetChars > 0
            ? `目录预算 ${audit.coverage.budgetChars} 字装不下全部在用记忆，召回员只能看到打分靠前的 ${audit.coverage.cataloged} 条；要更多就把「召回决定」页的目录字数上限调高。`
            : `目录没设字数预算仍然装不下——多半是这几条的编号或层级标记太长被单行保护跳过，把标题改短一点即可。`));
        rows.push(item);
    }
    if (!rows.length) rows.push(makeElement('p', 'dai-turn-result', '账本干净：没有疑似矛盾，也没有孤立钥匙，目录装得下全部在用记忆。'));
    listEl.replaceChildren(...rows);
}

/* ── 按人整合视图（MemPalace Wings/Tunnels 的模拟）：记忆 × 人物簿 × 世界台账并成一条时间线。 */

function renderMemoryPersonView(panel) {
    const target = panel ?? (typeof document !== 'undefined' ? document.getElementById(SETTINGS_PANEL_ID) : null);
    if (!target || target.hidden) return;
    const section = target.querySelector('[data-settings-section="memory"]');
    if (!section || section.hidden) return;
    // 弹窗打开时 dock 被搬进面板级弹层（section 之外），所以按面板作用域找元素，别按 section。
    const select = target.querySelector('[data-memory-person-view]');
    const summaryEl = target.querySelector('[data-memory-person-summary]');
    const timelineEl = target.querySelector('[data-memory-person-timeline]');
    if (!select || !timelineEl) return;
    // 选项：人物簿记录优先（list 已按重要+最近排序）；簿里没人时退回记忆关联钥匙。
    const records = (() => { try { return agentNpcLedger.list(); } catch { return []; } })();
    const options = records.length
        ? records.map(record => ({ value: record.name, label: `${record.name}${record.importance === '重要' ? '（重要）' : ''}` }))
        : (() => {
            const wanted = new Map();
            for (const entry of agentMemoryRuntime.snapshot().entries) for (const key of recallKeys(entry)) wanted.set(key, (wanted.get(key) ?? 0) + 1);
            return [...wanted.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh')).slice(0, 40).map(([key, count]) => ({ value: key, label: `${key}（${count}）` }));
        })();
    const previous = select.value || memoryPersonViewName;
    const current = options.some(option => option.value === previous) ? previous : (options[0]?.value ?? '');
    memoryPersonViewName = current;
    const optionEls = [document.createElement('option')];
    optionEls[0].value = '';
    optionEls[0].textContent = '选一个人';
    for (const option of options) {
        const el = document.createElement('option');
        el.value = option.value;
        el.textContent = option.label;
        optionEls.push(el);
    }
    select.replaceChildren(...optionEls);
    select.value = current;
    if (!select.onchange) select.onchange = () => { memoryPersonViewName = select.value; renderMemoryPersonView(target); };
    const snapshot = agentMemoryRuntime.snapshot();
    const record = records.find(item => item.name === memoryPersonViewName) ?? null;
    const world = (() => { try { return agentWorldRuntime.snapshot(); } catch { return null; } })();
    const view = buildPersonView({ record, fallbackName: record ? '' : memoryPersonViewName, entries: snapshot.entries, worldSnapshot: world, limit: 60 });
    if (summaryEl) {
        summaryEl.hidden = !view.summary;
        if (view.summary) summaryEl.textContent = view.summary;
    }
    const rows = [];
    if (!memoryPersonViewName) rows.push(makeElement('p', 'dai-turn-result', '先选一个人：时间线会把他的记忆、好感流水、经历、世界事件与任务按天并排。'));
    else if (!view.timeline.length) rows.push(makeElement('p', 'dai-turn-result', `${memoryPersonViewName} 名下暂时没有叙事：记忆、人物簿、世界台账里都还没提到这个人。`));
    else {
        let lastDay = null;
        for (const item of view.timeline) {
            if (item.day !== lastDay) {
                lastDay = item.day;
                rows.push(makeElement('div', 'dai-timeline-day', item.day ? `第 ${item.day} 天` : '（无日期）'));
            }
            const row = makeElement('div', 'dai-world-event');
            row.append(makeElement('b', '', `${PERSON_VIEW_KINDS[item.kind] ?? '记录'}｜${item.text}`));
            if (item.meta) row.append(makeElement('small', 'dai-world-event-basis', item.meta));
            rows.push(row);
        }
        if (view.total > view.timeline.length) rows.push(makeElement('p', 'dai-turn-result', `只显示最近 ${view.timeline.length} 条（共 ${view.total} 条），要更早的翻「记忆总库」。`));
    }
    timelineEl.replaceChildren(...rows);
}

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
            ...(status.superseded ? [`已被覆盖 ${status.superseded}`] : []),
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
    // 体检卡复用上面已算好的矛盾对（免一次 O(n²) 重算）；按人整合弹窗跟着页面刷新保持新鲜。
    refreshMemoryAuditCard(section, { pairs });
    renderMemoryPersonView(target);
}

/** 记忆条目详情弹窗：基本信息/关联出处两节 + 共钥匙的相关记忆（A-MEM 链接思路，可点连环跳）。 */
function openMemoryEntryDetail(panel, entry) {
    if (!entry) return;
    const importance = Number.isFinite(Number(entry.importance)) ? Number(entry.importance) : (entry.weight === 'major' ? 7 : 4);
    const tierLabel = agentMemoryRuntime.tierLabels[entry.tier] ?? '记忆';
    const sections = [
        { rows: [['内容', typeof entry.text === 'string' ? entry.text.trim() : ''], ['层级', `${tierLabel}${entry.tag ? ` · ${agentMemoryRuntime.tagLabels[entry.tag] ?? entry.tag}` : ''}`], ['登记', `第 ${entry.day} 天`], ['重要度', `${importance}（分量 ${entry.weight === 'major' ? '关键' : '一般'}）`], ['原文', typeof entry.quote === 'string' ? entry.quote.trim() : '']] },
        { title: '关联与出处', rows: [['别名', Array.isArray(entry.aliases) ? entry.aliases.join('、') : ''], ['关联', Array.isArray(entry.related) ? entry.related.join('、') : ''], ['依据', typeof entry.basis === 'string' ? entry.basis.trim() : ''], ['备注', typeof entry.note === 'string' ? entry.note.trim() : ''], ['覆盖状态', typeof entry.supersededBy === 'string' && entry.supersededBy ? `已被 ${entry.supersededBy} 覆盖（默认不再召回，可点列表里的「恢复」找回）` : '']] },
    ];
    // 相关记忆跳转（A-MEM 共钥匙思路）是进阶版功能：完整版/简略版下详情弹窗不带这一节。
    const links = advancedMode()
        ? relatedMemories(entry, agentMemoryRuntime.snapshot().entries).map(item => ({
            label: `${item.id}｜${(typeof item.title === 'string' && item.title.trim()) || String(item.text ?? '').slice(0, 18)}`,
            onPick: () => openMemoryEntryDetail(panel, item),
        }))
        : [];
    if (links.length) sections.push({ title: '相关记忆（共钥匙）', links });
    openReadonlyDetailModal(panel, capDetailTitle(entry.text), sections);
}

/** 只读详情弹窗：与人物信息面板同一套“标签 + 值”分块观感；空值的行直接不渲染。
 *  section 支持 links: [{ label, onPick }]——渲染成可点击行，点击执行 onPick（相关记忆跳转用）。 */
function openReadonlyDetailModal(panel, title, sections, { wide = false } = {}) {
    const page = makeElement('div', 'dai-npc-read');
    for (const section of Array.isArray(sections) ? sections : []) {
        const rows = (section?.rows ?? []).filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '');
        const links = Array.isArray(section?.links) ? section.links.filter(link => link && typeof link.onPick === 'function') : [];
        if (!rows.length && !links.length) continue;
        const block = makeElement('section', 'dai-profile-group');
        if (section.title) block.append(makeElement('b', 'dai-profile-group-title', section.title));
        for (const [label, value] of rows) {
            const row = makeElement('div', 'dai-profile-row');
            row.append(makeElement('span', 'dai-profile-label', label), makeElement('span', 'dai-profile-value', String(value)));
            block.append(row);
        }
        for (const link of links) {
            const row = makeElement('div', 'dai-profile-row is-clickable');
            row.append(makeElement('span', 'dai-profile-label', '↗'), makeElement('span', 'dai-profile-value', String(link.label ?? '')));
            row.addEventListener('click', () => link.onPick());
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
    agentImpactInjection.invalidate(); // 手动改过库，下一轮重新挑
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
    agentImpactInjection.invalidate();
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
    const injected = new Set(agentImpactInjection.injectedIds());
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
        const lastState = agentImpactInjection.lastState();
        const via = lastState
            ? (lastState.status === 'injected'
                ? `上一轮已注入 ${lastState.usedIds?.length ?? 0} 条（${lastState.via === 'llm' ? '模型挑选' : '按分量直取'}）`
                : lastState.status === 'skipped' ? '上一轮模型判断这一幕用不上旧账，未注入' : '上一轮没有可注入的影响')
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
    const injected = new Set(agentImpactInjection.injectedIds());
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

    push('开关', `注入${settings.setting?.enabled ? '开' : '关'} · 注入通道${settings.injection?.enabled ? '开' : '关'} · 深度 ${settings.injection?.depth ?? 0} · 上限 ${settings.setting?.injectionBudget > 0 ? settings.setting.injectionBudget + " 字" : "不限"}`);

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
