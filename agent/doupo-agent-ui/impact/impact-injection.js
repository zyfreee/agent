// 世界影响注入：生成前把“本局世界线被改成什么样”写进独立通道；库空不占预算。
// 默认先让判定官判“这一轮撞没撞上埋下的因”，挑不出来或模型不可用就按分量脚本兜底（只取明面账本）。
// 从 index.js 摘成依赖注入工厂：状态（最近一次挑选缓存）收在闭包里，测试直接喂桩比行为。

export function createImpactInjection({
    capture, impactSettings, channel, runtime, worldDay, getContext, conversation, modelPlan,
    scopeKey, roundKeyOf, currentSettings, injectionSettings,
    pick, buildFromPicks, buildFallback, registerFailure, renderLibrary,
}) {
    let last = null; // { signature, text, status, via, usedIds }：按一轮缓存，重 roll 复用不重挑
    let lastIds = []; // 最近一轮真的进了正文的编号：账本页据此标“本轮已注入”
    // 注入历史：前面几轮各写了哪几条。用来回答“这条影响是不是真的进过正文”，
    // 只留最近几轮、只留编号，不存正文，换聊天时跟着作废。
    let history = [];
    const HISTORY_ROUNDS = 12;

    function rememberRound(ids) {
        const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
        if (!list.length) return;
        history.push({ ids: list.slice(), at: new Date().toISOString() });
        if (history.length > HISTORY_ROUNDS) history = history.slice(-HISTORY_ROUNDS);
    }

    async function write({ chat } = {}) {
        const continuation = capture();
        const settings = impactSettings();
        if (!settings.enabled || !settings.inject) { channel.clear(); return { status: 'disabled' }; }
        const probe = channel.inspect();
        if (probe.status !== 'ready') return probe;
        const snapshot = runtime.snapshot();
        if (!snapshot.records.length) { channel.clear(); return { status: 'empty' }; }
        const day = worldDay();
        // 没传聊天就现取：公开入口（doupoAgent.impactInjection）与真实生成路径必须看同一份对话，
        // 否则“玩家这一轮说了什么”永远为空，挑选员会拿着上一幕的缓存一直用下去。
        const sourceChat = Array.isArray(chat) ? chat : (getContext()?.chat ?? []);
        const { draft, floors } = conversation(sourceChat);
        modelPlan(settings);
        // 签名 = 作用域 + 轮次键 + 手改序号：重roll时模型落账（decide/reply）不动手改序号 → 复用挑选；
        // 面板手改账本（manual）序号立刻变 → 同一轮内也强制重挑，注入不再拿旧文案。
        // 作用域必须进签名：换了角色卡/换了聊天，roundKey 可能碰巧相同，缓存一复用就会把
        // 上一个聊天挑的注入写进这一局，等于串档。
        const signatureOf = () => JSON.stringify([scopeKey(), roundKeyOf(sourceChat), currentSettings(), runtime.manualVersion()]);
        const signature = signatureOf();
        if (last && last.signature === signature) {
            if (!last.text) { channel.clear(); return { status: last.status, via: last.via, usedIds: [] }; }
            lastIds = last.usedIds ?? [];
            try { renderLibrary(); } catch { /* 面板没开就算了 */ }
            // 缓存命中也得真的写一遍：通道可能被生成结束清空过，只回状态会让正文里没有这段。
            return { ...channel.write({ text: last.text }, { depth: injectionSettings().depth, maxChars: 0 }), text: last.text, via: last.via, usedIds: lastIds };
        }
        let text = '';
        let usedIds = [];
        let via = 'script';
        let note = '';
        if (settings.injectSmart) {
            try {
                const picked = await pick({ snapshot, settings, chat: sourceChat });
                if (!continuation.current() || signature !== signatureOf()) return { status: 'stale' };
                const hits = Array.isArray(picked.hits) ? picked.hits : [];
                if (picked.status === 'ok' || (picked.status === 'empty' && hits.length)) {
                    const detail = buildFromPicks(snapshot.records, picked.picks ?? [], { maxChars: settings.injectBudget, maxLines: settings.injectMaxLines, day, hits });
                    text = detail.text;
                    usedIds = detail.usedIds;
                    via = 'llm';
                    note = picked.note;
                } else if (picked.status === 'empty') {
                    // 判定官明确说“这一幕没撞上、也没有值得写的”：这一轮不注入，而不是硬塞不相干的影响。
                    last = { signature, text: '', status: 'skipped', via: 'llm', note: picked.note, usedIds: [] };
                    lastIds = [];
                    channel.clear();
                    return { status: 'skipped', via: 'llm', note: picked.note, usedIds: [] };
                }
            } catch (error) {
                registerFailure('世界判定官', error?.message ?? error);
                /* 判定失败回落到脚本挑选；拦截器会因备料失败终止本次正文调用 */
            }
        }
        if (!continuation.current() || signature !== signatureOf()) return { status: 'stale' };
        if (!text) {
            // 兜底挑选跟主路同一份上限口径：不设固定 10 行，设置不限制就全量注入。
            const detail = buildFallback(snapshot.records, { maxChars: settings.injectBudget, maxLines: settings.injectMaxLines, day });
            text = detail.text;
            usedIds = detail.usedIds;
        }
        if (!text) {
            last = { signature, text: '', status: 'empty', via, usedIds: [] };
            lastIds = [];
            channel.clear();
            return { status: 'empty', via, usedIds: [] };
        }
        last = { signature, text, status: 'injected', via, note, usedIds };
        lastIds = usedIds;
        rememberRound(usedIds);
        // 预算已在生成文本时截过，这里不再二次截断，免得多出“已按预算截断”的尾巴。
        const written = channel.write({ text }, { depth: injectionSettings().depth, maxChars: 0 });
        try { renderLibrary(); } catch { /* 面板没开就算了 */ }
        return { ...written, text, via, usedIds };
    }

    return {
        write,
        /** 换聊天/重读存档/手改账本后调用：上一轮挑好的注入作废，下次重新挑。 */
        invalidate() { last = null; lastIds = []; history = []; },
        injectedIds: () => lastIds.slice(),
        /** 注入历史（最近若干轮各写了哪几条），回响面板据此说“这条真进过正文”。 */
        injectedHistory: () => history.map(round => ({ ids: round.ids.slice(), at: round.at })),
        lastState: () => last,
    };
}

/** 影响库跟聊天走：换聊天读那一份，读不到就按空库开局，并把库内天数对齐世界时钟。 */
export function createImpactRestore({ syncLimits, storage, runtime, worldDay, injection }) {
    return function restoreImpactFromChat() {
        syncLimits();
        injection.invalidate(); // 换聊天/重读存档后，上一轮挑好的注入作废
        const host = typeof storage === 'function' ? storage() : storage;
        const record = host?.impactState?.();
        const result = runtime.reset();
        if (record?.status === 'ready' && record.value) return runtime.restore(record.value);
        // 空 apply 只做两件事：把库内天数对齐世界时钟、顺手结算已经过期的发酵日。
        runtime.apply([], { source: 'manual', day: worldDay() });
        return result;
    };
}
