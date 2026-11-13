// 原著设定召回与注入的唯一实现：目录选条 →（人物簿过滤）→ 按预算拼正文。
// 旧回合流水线的分类/计划/结算/撰写阶段已随旧架构退役，这里只保留
// resolveInjection 这一条生成拦截器真正使用的路径。
// 注入到主生成提示词里的抬头：告诉模型这段是原著设定，不是玩家发言或聊天记录。
const INJECTION_HEADER = '【原著设定·本轮】以下条目来自世界书，可当作既定事实引用；没有列出的原著细节不要自行编造。';

const lastUsedByBranch = new Map();
const branchKey = ctx => `${ctx.sessionId}\u0000${ctx.branchId}`;

/** Builds the setting recall/select/assemble stage used by the prompt interceptor. */
export function createTurnStages({
    settings = null,
    select = null,
    getSettingBudget = () => ({ maxCandidates: 40, maxItems: 8, injectionBudget: 0 }),
    getProgress = () => null,
    getRecentTexts = () => [],
    onVolumeInferred = null,
    catalogIndex = null,
    catalogSelector = null,
    skipProfiledEntry = null,
} = {}) {
    /**
     * 卷号推进：手动面板锁定时不动，留空时用“模型建议”和“故事线标题命中”两个来源取大者。
     * 只进不退，且一次最多前进一卷——估高了会把后面卷的条目放出来，等于剧透。
     */
    function resolveVolume({ current, suggested, text, source = 'auto' }) {
        const manual = Number.isInteger(current) ? current : null;
        if (source === 'manual' && manual !== null) return { current: manual, next: manual, source: 'manual' };
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
        if (auto === null || auto <= manual) return { current: manual, next: manual, source };
        const next = Math.min(auto, manual + 1);
        return { current: manual, next: next > manual ? advance(next) : manual, source: 'auto' };
    }

    /**
     * 人物簿过滤：把「人物簿已建档的人物条目」从待注入清单里摘出去，
     * 同一个人的信息由人物簿通道负责，原著设定不再重复进提示词。
     * 只认条目本身（category=人物 且上层判定已建档），故事线/势力等条目不受影响。
     */
    function gateProfiledEntries(needs) {
        const list = Array.isArray(needs) ? needs : [];
        if (typeof skipProfiledEntry !== 'function' || !list.length) return { kept: list, skipped: [], note: '' };
        const kept = [];
        const skipped = [];
        for (const item of list) {
            let entry = null;
            try { entry = catalogIndex && typeof catalogIndex.get === 'function' ? catalogIndex.get(item.id) : null; } catch { entry = null; }
            let hit = false;
            if (entry) { try { hit = skipProfiledEntry(entry) === true; } catch { hit = false; } }
            if (hit) skipped.push(entry.name || item.id);
            else kept.push(item);
        }
        const note = skipped.length
            ? `人物簿已建档，${skipped.length} 条人物条目不注入（${skipped.slice(0, 6).join('、')}${skipped.length > 6 ? '等' : ''}）。`
            : '';
        return { kept, skipped, note };
    }

    /**
     * Setting path: script recalls wide, the model narrows, script cuts to budget.
     * Runs whenever a setting supply is registered and non-empty.
     */
    async function gatherSettings(ctx) {
        if (!settings || typeof settings.recall !== 'function') return null;
        if (settings.size() === 0) {
            return { facts: [], visibleFactIds: [], status: 'no_settings', note: '还没有登记原著设定，本轮正文只依据对话与已确认状态。' };
        }
        const budget = typeof getSettingBudget === 'function' ? getSettingBudget(ctx) : null;
        if (!budget) return null;
        const maxCandidates = Number.isInteger(budget.maxCandidates) && budget.maxCandidates > 0 ? Math.min(budget.maxCandidates, 200) : 40;
        const maxItems = Number.isInteger(budget.maxItems) && budget.maxItems > 0 ? budget.maxItems : 8;
        const progress = typeof getProgress === 'function' ? getProgress(ctx) : null;
        const asOf = Number.isInteger(progress) ? progress : (Number.isInteger(progress?.volume) ? progress.volume : null);
        const source = progress?.source === 'manual' ? 'manual' : 'auto';
        // getRecentTexts 允许异步（楼层要套角色卡正则后再给选条模型）；同步返回数组也兼容。
        const recentTexts = typeof getRecentTexts === 'function' ? await getRecentTexts(ctx) : [];
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
                const volume = resolveVolume({ current: asOf, suggested: picked.inferredVolume, text: progressText, source });
                // 人物簿过滤先于 maxItems：被摘掉的名额还能让给后面的条目，不浪费模型点好的选择。
                const gated = gateProfiledEntries((Array.isArray(picked.ids) ? picked.ids : []).map(uid => ({ id: String(uid), layer: 'full' })));
                const needs = gated.kept.slice(0, maxItems);
                const assembled = settings.assemble(needs, { budget: budget.injectionBudget, volume: volume.next });
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
                        ? `目录 ${rows} 行，模型点名 ${needs.length} 条，注入 ${assembled.usedIds.length} 条，约 ${assembled.tokens} 字。${picked.secondCall ? '（含一次卷外搜索）' : ''}${gated.note}`
                        : (picked.noMatch ? '模型判断本轮不需要原著设定。' : (gated.note || '点名的条目都放不进预算，本轮不注入。')),
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
        const gated = gateProfiledEntries(needs);
        needs = gated.kept;
        const volume = resolveVolume({ current: asOf, suggested: null, text: progressText, source });
        const assembled = settings.assemble(needs, { budget: budget.injectionBudget, volume: volume.next });
        if (assembled.usedIds.length) lastUsedByBranch.set(branchKey(ctx), assembled.usedIds.slice());
        const fallbackNote = degradedNote || (assembled.usedIds.length
            ? `召回 ${recall.candidates.length} 条候选，注入 ${assembled.usedIds.length} 条，约 ${assembled.tokens} 字。`
            : '候选都放不进预算，本轮不注入设定。');
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
            volume,
            note: `${fallbackNote}${gated.note}`,
        };
    }

    /**
     * Recall -> select -> assemble for the prompt interceptor: the injection
     * channel needs the text before the main generation starts.
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

    return Object.freeze({ resolveInjection });
}
