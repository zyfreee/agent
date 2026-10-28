import { applyChanges } from './turn-state.js';
import { checkEffects, resolveCategory } from './settle-categories.js';

const MAX_CLAIMS = 50;
const MAX_CLAIM_TEXT = 2000;
// 注入到主生成提示词里的抬头：告诉模型这段是原著设定，不是玩家发言或聊天记录。
const INJECTION_HEADER = '【原著设定·本轮】以下条目来自世界书，可当作既定事实引用；没有列出的原著细节不要自行编造。';

const OUTCOME_TEXT = {
    achieved: '行动达成',
    partial: '行动部分达成',
    achieved_with_cost: '行动达成，但付出了代价',
    not_achieved: '行动没有达成',
    interrupted: '行动被打断',
};

function needData(ctx) {
    const data = ctx?.data;
    if (!data || typeof data !== 'object') throw new Error('缺少上层路由数据，回合阶段不能单独运行。');
    return data;
}

function needText(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}

function clampClaims(value) {
    return Array.isArray(value) ? value.slice(0, MAX_CLAIMS) : [];
}

/** Builds the six allowlisted turn stages. Every side effect stays behind the pipeline gates. */
export function createTurnStages({
    runner,
    actions,
    world,
    compose,
    getState,
    getSourceIds = () => [],
    getLimits = () => ({ maxEntries: 8 }),
    getWriter = () => 'actions',
    getRules,
    settleAdjudicator = null,
    getWritableFields = () => [],
    getSettleCategories = () => [],
    settings = null,
    select = null,
    getSettingBudget = () => ({ maxCandidates: 40, maxItems: 8, injectionBudget: 0 }),
    getProgress = () => null,
    getRecentTexts = () => [],
    onVolumeInferred = null,
    onSettingDrift = null,
    catalogIndex = null,
    catalogSelector = null,
    now = () => Date.now(),
} = {}) {
    for (const [value, name] of [[runner, 'runner'], [actions, 'actions'], [world, 'world']]) {
        if (!value || typeof value !== 'object') throw new TypeError(`${name} 必须是模块实例`);
    }
    if (typeof compose !== 'function') throw new TypeError('compose 必须是函数');
    if (typeof getState !== 'function') throw new TypeError('getState 必须是函数');

    function readState(ctx) {
        const state = getState(ctx);
        if (!state || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('getState 必须返回状态对象');
        return state;
    }

    async function classify(ctx) {
        const data = needData(ctx);
        const authorization = data.authorization ?? {};
        return {
            task: authorization.task ?? data.taskType ?? null,
            executionMode: authorization.executionMode ?? 'read_only',
            playerAction: authorization.playerAction ?? null,
            confidence: data.interpretation?.confidence ?? null,
            note: '分类与授权在进入阶段前完成，阶段只记录结果。',
        };
    }

    async function plan(ctx) {
        const data = needData(ctx);
        return {
            taskType: data.taskType ?? null,
            moduleIds: [...(data.plan?.moduleIds ?? [])],
            enabledModuleIds: [...(data.enabledModuleIds ?? [])],
            note: '执行计划来自已核准的白名单路由。',
        };
    }

    const lastUsedByBranch = new Map();
    const branchKey = ctx => `${ctx.sessionId}\u0000${ctx.branchId}`;

    /**
     * 卷号推进：手动面板锁定时不动，留空时用“模型建议”和“故事线标题命中”两个来源取大者。
     * 只进不退，且一次最多前进一卷——估高了会把后面卷的条目放出来，等于剧透。
     */
    function resolveVolume({ current, suggested, text }) {
        const manual = Number.isInteger(current) ? current : null;
        const guessed = typeof catalogIndex?.guessVolume === 'function' ? catalogIndex.guessVolume(text) : null;
        const candidates = [suggested, guessed].filter(value => Number.isInteger(value) && value >= 1 && value <= 21);
        const auto = candidates.length ? Math.max(...candidates) : null;
        const advance = next => {
            if (typeof onVolumeInferred === 'function') onVolumeInferred(next, 'auto');
            return next;
        };
        if (manual === null) {
            if (auto === null) return { current: null, next: null, source: 'unknown' };
            return { current: auto, next: advance(auto), source: 'auto' };
        }
        if (auto === null || auto <= manual) return { current: manual, next: manual, source: 'manual' };
        const next = Math.min(auto, manual + 1);
        return { current: manual, next: next > manual ? advance(next) : manual, source: 'auto' };
    }

    /**
     * Setting path: script recalls wide, the model narrows, script cuts to budget.
     * Runs whenever a setting supply is registered and non-empty; the fact
     * library path below stays for structured facts with explicit source scope.
     */
    async function gatherSettings(ctx) {
        if (!settings || typeof settings.recall !== 'function') return null;
        if (settings.size() === 0) {
            return { facts: [], visibleFactIds: [], status: 'no_settings', note: '还没有登记原著设定，本轮正文只依据对话与已确认状态。' };
        }
        const budget = typeof getSettingBudget === 'function' ? getSettingBudget(ctx) : null;
        if (!budget) return null;
        const maxCandidates = Number.isInteger(budget.maxCandidates) && budget.maxCandidates > 0 ? Math.min(budget.maxCandidates, 200) : 40;
        const maxItems = Number.isInteger(budget.maxItems) && budget.maxItems > 0 ? Math.min(budget.maxItems, 24) : 8;
        const asOf = typeof getProgress === 'function' ? getProgress(ctx) : null;
        const recentTexts = typeof getRecentTexts === 'function' ? getRecentTexts(ctx) : [];
        const progressText = [ctx.playerInput, ...(Array.isArray(recentTexts) ? recentTexts : [])].join('\n');
        // 目录选条：先把整卷目录给模型，由它点名 uid，再由脚本按预算取正文。
        // 失败时退回下面的关键字召回，不阻断本轮。
        if (catalogIndex && typeof catalogIndex.stats === 'function' && catalogIndex.stats().total > 0 && typeof catalogSelector?.select === 'function') {
            try {
                const picked = await catalogSelector.select({
                    input: ctx.playerInput,
                    recentTexts,
                    volume: Number.isInteger(asOf) ? asOf : null,
                    signal: ctx.signal,
                });
                const volume = resolveVolume({ current: Number.isInteger(asOf) ? asOf : null, suggested: picked.inferredVolume, text: progressText });
                const needs = (Array.isArray(picked.ids) ? picked.ids : []).slice(0, maxItems).map(uid => ({ id: String(uid), layer: 'full' }));
                const assembled = settings.assemble(needs, { budget: budget.injectionBudget, volume });
                if (assembled.usedIds.length) lastUsedByBranch.set(branchKey(ctx), assembled.usedIds.slice());
                const rows = Number.isInteger(picked.meta?.rows) ? picked.meta.rows : 0;
                return {
                    facts: [],
                    visibleFactIds: assembled.usedIds,
                    injection: assembled.text,
                    status: assembled.usedIds.length ? 'supported' : 'not_found',
                    settingCandidates: rows,
                    candidateIds: needs.map(item => item.id),
                    settingLayers: assembled.layers,
                    settingDroppedIds: assembled.droppedIds,
                    settingsTokens: assembled.tokens,
                    volume,
                    lookup: picked.lookup ?? null,
                    secondCall: picked.secondCall === true,
                    note: assembled.usedIds.length
                        ? `目录 ${rows} 行，模型点名 ${needs.length} 条，注入 ${assembled.usedIds.length} 条，约 ${assembled.tokens} 字。${picked.secondCall ? '（含一次卷外搜索）' : ''}`
                        : (picked.noMatch ? '模型判断本轮不需要原著设定。' : '点名的条目都放不进预算，本轮不注入。'),
                };
            } catch (error) {
                // fall through to keyword recall
            }
        }
        const activeIds = lastUsedByBranch.get(branchKey(ctx)) ?? [];
        const recall = settings.recall({ input: ctx.playerInput, recentTexts, activeIds, asOf, limit: maxCandidates });
        if (!recall.candidates.length) {
            return { facts: [], visibleFactIds: [], status: 'not_found', settingCandidates: 0, note: '本轮输入没有触发任何原著设定候选。' };
        }
        let needs = [];
        let degradedNote = '';
        if (typeof select === 'function') {
            try {
                const picked = await select({
                    input: ctx.playerInput,
                    recentTexts,
                    candidates: recall.candidates,
                    budget: budget.injectionBudget,
                    maxItems,
                    asOf: Number.isInteger(asOf) ? asOf : undefined,
                    signal: ctx.signal,
                });
                needs = Array.isArray(picked?.needs) ? picked.needs : [];
                if (picked?.error) degradedNote = picked.error;
            } catch (error) {
                needs = recall.candidates.slice(0, maxItems).map(item => ({ id: item.id, layer: 'summary' }));
                degradedNote = `设定选择失败，按召回排序降级：${error?.message ?? error}`;
            }
        } else {
            needs = recall.candidates.slice(0, maxItems).map(item => ({ id: item.id, layer: 'summary' }));
            degradedNote = '没有接入设定选择，按召回排序降级。';
        }
        const assembled = settings.assemble(needs, { budget: budget.injectionBudget });
        if (assembled.usedIds.length) lastUsedByBranch.set(branchKey(ctx), assembled.usedIds.slice());
        return {
            facts: [],
            visibleFactIds: assembled.usedIds,
            injection: assembled.text,
            status: assembled.usedIds.length ? 'supported' : 'not_found',
            settingCandidates: recall.candidates.length,
            candidateIds: recall.candidates.map(item => item.id),
            settingLayers: assembled.layers,
            settingDroppedIds: assembled.droppedIds,
            settingsTokens: assembled.tokens,
            volume: resolveVolume({ current: Number.isInteger(asOf) ? asOf : null, suggested: null, text: progressText }),
            note: degradedNote || (assembled.usedIds.length
                ? `召回 ${recall.candidates.length} 条候选，注入 ${assembled.usedIds.length} 条，约 ${assembled.tokens} 字。`
                : '候选都放不进预算，本轮不注入设定。'),
        };
    }

    /**
     * Same recall -> select -> assemble path as the gather stage, exposed for the
     * prompt interceptor: the injection channel needs the text before the main
     * generation starts, without a companion module run or a committed turn.
     */
    async function resolveInjection({ input, recentTexts = [], sessionId = 'current-chat', branchId = 'main', signal } = {}) {
        if (!settings || typeof settings.recall !== 'function') {
            return { status: 'not_configured', text: '', usedIds: [], candidates: [], tokens: 0, note: '没有登记原著设定，本轮不注入。' };
        }
        const ctx = { playerInput: typeof input === 'string' ? input : '', sessionId, branchId, signal, recentTexts };
        const result = await gatherSettings(ctx);
        if (!result) return { status: 'disabled', text: '', usedIds: [], candidates: [], tokens: 0, note: '原著设定注入已关闭。' };
        const body = typeof result.injection === 'string' ? result.injection.trim() : '';
        return {
            status: result.status ?? (body ? 'supported' : 'not_found'),
            text: body ? `${INJECTION_HEADER}\n${body}` : '',
            usedIds: Array.isArray(result.visibleFactIds) ? result.visibleFactIds.slice() : [],
            candidates: Array.isArray(result.candidateIds) ? result.candidateIds.slice() : [],
            tokens: Number.isInteger(result.settingsTokens) ? result.settingsTokens : 0,
            note: result.note ?? '',
            volume: result.volume ?? null,
            lookup: result.lookup ?? null,
            secondCall: result.secondCall === true,
        };
    }

    async function gather(ctx) {
        const data = needData(ctx);
        const settingResult = await gatherSettings(ctx);
        if (settingResult) return settingResult;
        const moduleIds = data.plan?.moduleIds ?? [];
        const wantsFacts = moduleIds.includes('facts-query');
        if (!wantsFacts) return { facts: [], visibleFactIds: [], note: '本轮计划未包含资料查询。' };
        const limits = getLimits();
        const sourceIds = getSourceIds();
        if (!sourceIds.length) {
            return { facts: [], visibleFactIds: [], status: 'needs_scope', note: '还没有登记资料来源，本轮正文只依据对话与已确认状态。' };
        }
        const execution = await runner.execute({
            taskId: ctx.taskId,
            sessionId: ctx.sessionId,
            branchId: ctx.branchId,
            stateVersion: ctx.stateVersion,
            taskType: data.taskType,
            moduleIds: ['facts-query'],
            plan: { status: 'planned', moduleIds: ['facts-query'] },
            enabledModuleIds: data.enabledModuleIds ?? [],
            input: { query: ctx.playerInput, sourceIds, limit: limits.maxEntries, ...(limits.includeUnverified === true ? {} : {}) },
            signal: ctx.signal,
        });
        const entry = execution?.results?.[0];
        if (!execution?.ok || !entry?.ok) {
            return { facts: [], visibleFactIds: [], degraded: true, note: '资料查询没有返回结果，本轮不使用资料事实。' };
        }
        const value = entry.value?.result ?? entry.value ?? {};
        const facts = Array.isArray(value.results) ? value.results.slice(0, limits.maxEntries) : [];
        return {
            facts,
            visibleFactIds: facts.map(item => item?.id).filter(id => typeof id === 'string' && id),
            status: value.status ?? 'unknown',
            note: value.note ?? '',
        };
    }

    function synthesizeRules(ctx, data, effectsSource, customRules) {
        if (customRules) return customRules;
        const effects = Array.isArray(effectsSource) && effectsSource.length ? effectsSource : (Array.isArray(data.interpretation?.effects) ? data.interpretation.effects : []);
        return [{
            id: `turn-${ctx.taskId}`,
            version: '1',
            targetId: data.authorization?.playerAction?.targetId,
            method: data.authorization?.playerAction?.method,
            conditions: [],
            effects: effects.map(effect => ({
                type: effect.type ?? 'set',
                targetId: effect.targetId,
                field: effect.field,
                value: effect.value,
                allowNegative: effect.allowNegative === true,
                reason: typeof effect.reason === 'string' ? effect.reason : undefined,
            })),
            outcome: 'achieved',
            elapsed: 0,
        }];
    }

    function normalizeChanges(ctx, style, rawChanges) {
        return (Array.isArray(rawChanges) ? rawChanges : [])
            .filter(change => change && typeof change.targetId === 'string' && typeof change.field === 'string' && change.after !== undefined)
            .map((change, index) => ({
                id: `chg-${ctx.taskId}-${index}`,
                sessionId: ctx.sessionId,
                branchId: ctx.branchId,
                stateVersion: ctx.stateVersion,
                targetId: change.targetId,
                field: change.field,
                type: 'set',
                value: change.after,
                before: change.before,
                after: change.after,
                reason: typeof change.reason === 'string' ? change.reason : '',
                style,
                writer: getWriter(change.targetId),
            }));
    }

    async function resolveAction(ctx, data, state) {
        const action = data.authorization?.playerAction;
        if (!action || typeof action !== 'object') throw new Error('缺少已确认的玩家行动，不能结算。');
        const interpretation = data.interpretation ?? {};
        const customRules = typeof getRules === 'function'
            ? getRules({ taskType: data.taskType, interpretation, state, taskId: ctx.taskId })
            : null;
        const useCustomRules = Array.isArray(customRules) && customRules.length > 0;
        let effects = Array.isArray(interpretation.effects) ? interpretation.effects : [];
        let described = typeof interpretation.outcome === 'string' && interpretation.outcome.trim() ? interpretation.outcome.trim() : '';
        const notes = [];
        // 分类判定：interpret 给出类别与初步效果，类别提示词再独立判一次；
        // 判定失败或未接入时退回初步效果，不阻断回合。自定义规则路径不经过类别判定。
        // 类别先查内置四类，再查玩家自定义判定（只有名字和提示词，脚本不做类别内复核）。
        const userCategories = Array.isArray(getSettleCategories?.()) ? getSettleCategories() : [];
        const userCategory = userCategories.find(item => item && item.id === interpretation.category
            && typeof item.prompt === 'string' && item.prompt.trim());
        const category = resolveCategory(interpretation.category) ?? (userCategory ? { id: userCategory.id, label: userCategory.name } : null);
        if (!useCustomRules && category && typeof settleAdjudicator === 'function') {
            try {
                const decided = await settleAdjudicator({
                    category: category.id,
                    input: ctx.playerInput,
                    state,
                    allowedFields: getWritableFields(),
                    preliminary: effects,
                });
                if (Array.isArray(decided?.effects)) {
                    effects = decided.effects;
                    if (typeof decided?.outcome === 'string' && decided.outcome.trim()) described = decided.outcome.trim();
                    if (decided.rejectedEffects > 0) notes.push(`类别判定剔除 ${decided.rejectedEffects} 条越界效果`);
                }
            } catch (error) {
                notes.push(`类别判定失败，退回初步解析：${String(error?.message ?? error).slice(0, 100)}`);
            }
        }
        // 类别复核：脚本按类别规则逐条把关，不通过的丢弃；未识别类别不设限（兼容旧解析输出）。
        if (!useCustomRules) {
            const checked = checkEffects(category?.id ?? '', effects, state);
            effects = checked.effects;
            if (checked.rejected.length) notes.push(`类别复核剔除 ${checked.rejected.length} 条：${checked.rejected.slice(0, 3).map(item => item.reason).join('；')}`);
        }
        if (!useCustomRules && !effects.length) throw new Error('模型没有给出可结算的效果，本轮不写入状态。');
        const rules = synthesizeRules(ctx, data, effects, useCustomRules ? customRules : null);
        if (!rules[0]?.effects?.length) throw new Error('结算规则为空，本轮不写入状态。');
        const resolved = actions.resolve({
            actionId: ctx.taskId,
            attemptId: '1',
            sessionId: ctx.sessionId,
            branchId: ctx.branchId,
            stateVersion: ctx.stateVersion,
            actorId: 'player',
            intent: { targetId: action.targetId, method: action.method, explicit: true },
            rules,
            state,
        });
        if (resolved.status !== 'candidate') throw new Error(`行动结算未通过：${resolved.reason ?? resolved.status}`);
        const changes = normalizeChanges(ctx, 'action', resolved.changes);
        if (!changes.length) throw new Error('行动没有产生可写入的变化。');
        return {
            changes,
            nextState: applyChanges(state, changes),
            approvedChangeIds: changes.map(change => change.id),
            outcome: described || OUTCOME_TEXT[resolved.outcome] || '行动已结算',
            ruleOutcome: resolved.outcome,
            elapsed: resolved.elapsed ?? 0,
            note: notes.length ? `变更已由规则引擎计算，等待总控审核。${notes.join(' ')}` : '变更已由规则引擎计算，等待总控审核。',
        };
    }

    async function resolveTime(ctx, data, state) {
        const rawDays = Number(data.interpretation?.days);
        const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(365, Math.floor(rawDays)) : 1;
        const fromDay = Number(state?.world?.day ?? 1);
        const toDay = fromDay + days;
        const advanced = world.advance({ sessionId: ctx.sessionId, branchId: ctx.branchId, taskId: ctx.taskId, stateVersion: ctx.stateVersion, fromDay, toDay, state, processes: [] });
        if (advanced?.status === 'blocked' || advanced?.status === 'stale_or_conflicting_retry' || advanced?.status === 'needs_review') {
            throw new Error(`时间推进未通过：${advanced.status}`);
        }
        const changes = [{
            id: `chg-${ctx.taskId}-day`,
            sessionId: ctx.sessionId,
            branchId: ctx.branchId,
            stateVersion: ctx.stateVersion,
            targetId: 'world',
            field: 'day',
            type: 'set',
            value: toDay,
            before: fromDay,
            after: toDay,
            reason: `推进 ${days} 天`,
            style: 'world',
            writer: getWriter('world'),
        }];
        return {
            changes,
            nextState: applyChanges(state, changes),
            approvedChangeIds: changes.map(change => change.id),
            outcome: `时间推进到第 ${toDay} 天。`,
            note: Array.isArray(advanced?.proposals) && advanced.proposals.length ? `世界模拟另有 ${advanced.proposals.length} 条提案未写入。` : '',
        };
    }

    async function adjudicate(ctx) {
        const data = needData(ctx);
        const state = readState(ctx);
        const taskType = data.taskType;
        if (taskType === 'explicit_action' || taskType === 'complex_action') return resolveAction(ctx, data, state);
        if (taskType === 'time_advance') return resolveTime(ctx, data, state);
        return { changes: [], nextState: state, approvedChangeIds: [], outcome: '本轮没有结算行动。', note: '本轮不改变世界状态。' };
    }

    function sanitizeClaims(rawClaims, visible, approved) {
        const claims = [];
        let dropped = 0;
        for (const claim of clampClaims(rawClaims)) {
            if (!claim || typeof claim !== 'object' || Array.isArray(claim)) { dropped++; continue; }
            const kind = ['flavor', 'fact', 'player-visible'].includes(claim.kind) ? claim.kind : 'flavor';
            const factIds = Array.isArray(claim.factIds) ? claim.factIds.filter(id => typeof id === 'string' && id) : [];
            if (kind === 'fact' && (!factIds.length || factIds.some(id => !visible.has(id)))) { dropped++; continue; }
            const changeId = typeof claim.changeId === 'string' && approved.has(claim.changeId) ? claim.changeId : undefined;
            claims.push({
                kind,
                text: String(claim.text ?? '').slice(0, MAX_CLAIM_TEXT),
                factIds,
                ...(changeId ? { changeId } : {}),
            });
        }
        return { claims, dropped };
    }

    async function compose_(ctx) {
        const data = needData(ctx);
        const adjudicated = ctx.previous?.adjudicate ?? {};
        const gathered = ctx.previous?.gather ?? {};
        const facts = Array.isArray(gathered.facts) ? gathered.facts : [];
        const injection = typeof gathered.injection === 'string' ? gathered.injection : '';
        const changes = Array.isArray(adjudicated.changes) ? adjudicated.changes : [];
        const outcome = typeof adjudicated.outcome === 'string' ? adjudicated.outcome : '';
        let draft;
        try {
            draft = await compose({
                input: ctx.playerInput,
                facts,
                injection,
                changes,
                state: adjudicated.nextState ?? {},
                outcome,
                taskType: data.taskType,
                signal: ctx.signal,
            });
        } catch (error) {
            throw new Error(`正文生成失败：${error?.message ?? error}`);
        }
        const text = typeof draft?.text === 'string' ? draft.text.trim() : '';
        needText(text, '正文');
        const { claims, dropped } = sanitizeClaims(draft?.claims, new Set(gathered.visibleFactIds ?? []), new Set(adjudicated.approvedChangeIds ?? []));
        let settingAudit = null;
        if (settings && typeof settings.audit === 'function' && Array.isArray(gathered.visibleFactIds)) {
            settingAudit = settings.audit(text, gathered.visibleFactIds, Array.isArray(gathered.candidateIds) ? gathered.candidateIds : []);
            if (settingAudit.ok === false && typeof onSettingDrift === 'function') {
                try { onSettingDrift({ taskId: ctx.taskId, sessionId: ctx.sessionId, branchId: ctx.branchId, stateVersion: ctx.stateVersion, issues: settingAudit.issues }); } catch { /* 记录失败不影响回合 */ }
            }
        }
        return { text, claims, claimsDropped: dropped, settingAudit, generatedAt: now() };
    }

    async function validate(ctx) {
        const adjudicated = ctx.previous?.adjudicate ?? {};
        const composed = ctx.previous?.compose ?? {};
        const gathered = ctx.previous?.gather ?? {};
        return {
            changes: Array.isArray(adjudicated.changes) ? adjudicated.changes : [],
            claims: Array.isArray(composed.claims) ? composed.claims : [],
            nextState: adjudicated.nextState,
            visibleFactIds: Array.isArray(gathered.visibleFactIds) ? gathered.visibleFactIds : [],
            note: '回合结果已汇总，等待一致性与事实核验。',
        };
    }

    return Object.freeze({ classify, plan, gather, resolveInjection, adjudicate, compose: compose_, validate });
}
