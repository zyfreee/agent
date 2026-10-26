import { createInitialState, listWritableFields } from './turn-state.js';

const ROUTE_MESSAGES = {
    needs_clarification: '这一轮还需要你补充一句才能结算。',
    needs_review: '这一轮没有通过路由校验，暂不执行。',
    rejected: '这一轮请求被拒绝。',
};

function needText(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}

/**
 * Turn-level master control. It owns the whole loop:
 * interpret -> authorize -> six-stage pipeline -> deliver -> two-phase commit -> persist.
 * Nothing below it writes state, and nothing above it needs to know the order.
 */
export function createOrchestrator({
    pipeline,
    router,
    coordinator,
    stateStore,
    settings,
    interpret,
    deliver,
    placeholder,
    discardMessage,
    persistence,
    contracts,
    onEvent,
    now = () => Date.now(),
} = {}) {
    if (!pipeline || typeof pipeline.run !== 'function') throw new TypeError('pipeline 必须提供 run');
    if (!router || typeof router.prepare !== 'function') throw new TypeError('router 必须提供 prepare');
    if (!coordinator || typeof coordinator.begin !== 'function') throw new TypeError('coordinator 必须提供 begin');
    if (!stateStore || typeof stateStore.read !== 'function') throw new TypeError('stateStore 必须提供 read');
    if (typeof interpret !== 'function') throw new TypeError('interpret 必须是函数');
    if (typeof deliver !== 'function') throw new TypeError('deliver 必须是函数');

    let sequence = 0;

    function emit(event) {
        try { onEvent?.(event); } catch { /* 观测不能打断回合 */ }
    }

    function settle(taskId, status, fields) {
        try { coordinator.update(taskId, status, fields); } catch { /* 状态已由管线写入时忽略 */ }
    }

    function readScope({ sessionId, branchId }) {
        const record = stateStore.read({ sessionId, branchId });
        if (record?.exists) return record;
        const loaded = persistence?.load?.({ sessionId, branchId });
        if (loaded?.status === 'loaded' && loaded.snapshot?.state) {
            try {
                stateStore.seed({
                    sessionId,
                    branchId,
                    stateVersion: loaded.snapshot.stateVersion ?? 'v1',
                    state: loaded.snapshot.state,
                    history: Array.isArray(loaded.snapshot.history) ? loaded.snapshot.history : [],
                });
                return stateStore.read({ sessionId, branchId });
            } catch { /* 并发已种子化时直接读取 */ }
        }
        stateStore.seed({ sessionId, branchId, stateVersion: 'v1', state: createInitialState() });
        return stateStore.read({ sessionId, branchId });
    }

    /** Public: current committed state for a session/branch. */
    function inspect({ sessionId, branchId } = {}) {
        const record = stateStore.read({ sessionId: needText(sessionId, 'sessionId'), branchId: needText(branchId, 'branchId') });
        return record?.exists ? { status: 'ready', state: record.state, stateVersion: record.stateVersion, history: record.history } : { status: 'empty' };
    }

    /** Public: restore a persisted snapshot into the live state store. */
    function restore({ sessionId, branchId } = {}) {
        sessionId = needText(sessionId, 'sessionId'); branchId = needText(branchId, 'branchId');
        const existing = stateStore.read({ sessionId, branchId });
        if (existing?.exists) return { status: 'present', stateVersion: existing.stateVersion };
        const loaded = persistence?.load?.({ sessionId, branchId });
        if (loaded?.status !== 'loaded' || !loaded.snapshot?.state) return { status: 'empty' };
        stateStore.seed({
            sessionId,
            branchId,
            stateVersion: loaded.snapshot.stateVersion ?? 'v1',
            state: loaded.snapshot.state,
            history: Array.isArray(loaded.snapshot.history) ? loaded.snapshot.history : [],
        });
        return { status: 'restored', stateVersion: loaded.snapshot.stateVersion ?? 'v1' };
    }

    async function runTurn({ sessionId, branchId, input, triggerMessageId, signal } = {}) {
        const currentSettings = settings?.() ?? {};
        if (currentSettings.enabled === false) return { status: 'disabled', message: '总控已关闭，本轮不执行。' };
        sessionId = needText(sessionId, 'sessionId');
        branchId = needText(branchId, 'branchId');
        input = needText(input, 'input');
        if (input.length > 20000) throw new RangeError('input 长度不能超过 20000');

        sequence += 1;
        const taskId = `turn-${now()}-${sequence}`;
        const record = readScope({ sessionId, branchId });
        const stateVersion = record.stateVersion;
        coordinator.begin({ taskId, title: '玩家回合', sessionId, branchId, stateVersion });
        emit({ type: 'turn_started', taskId, sessionId, branchId, stateVersion });

        const wantPlaceholder = currentSettings.ui?.placeholder === true && typeof placeholder === 'function';
        let placeholderMessage = null;
        let placeholderConsumed = false;
        if (wantPlaceholder) {
            try {
                const made = await placeholder({ taskId });
                if (made?.ok) placeholderMessage = made;
            } catch { placeholderMessage = null; }
        }

        let interpretation;
        try {
            interpretation = await interpret({ input, state: record.state, allowedFields: contracts ? listWritableFields(contracts) : [], signal });
        } catch (error) {
            const unavailable = error?.code === 'llm_not_configured';
            settle(taskId, 'failed_unapplied', { message: unavailable ? '还没有配置模型连接，本轮没有执行。' : `回合解析失败：${error?.message ?? error}`, applied: '没有状态变更', nextStep: '在“模型与连接”页面确认连接后重试。' });
            emit({ type: 'turn_failed', taskId, stage: 'interpret', reason: String(error?.message ?? error) });
            return { status: 'unavailable', reason: unavailable ? 'llm_not_configured' : 'interpret_failed', message: String(error?.message ?? error), taskId };
        }

        const request = { requestId: taskId, sessionId, branchId, stateVersion, input, interpretation, playerConfirmed: interpretation.explicitAction === true };
        const routed = router.prepare(request);
        if (routed.status !== 'ready') {
            const waiting = routed.status === 'needs_clarification';
            settle(taskId, waiting ? 'waiting_input' : 'failed_unapplied', {
                message: waiting ? `${ROUTE_MESSAGES.needs_clarification}（${routed.reason ?? '需要补充'}）` : `${ROUTE_MESSAGES[routed.status] ?? '这一轮无法执行'}（${routed.reason ?? routed.status}）`,
                applied: '没有状态变更',
                nextStep: waiting ? '补一句明确的做法或目标，再运行一轮。' : '检查请求分类与启用模块后重试。',
            });
            emit({ type: 'turn_routed_out', taskId, status: routed.status, reason: routed.reason });
            return { status: routed.status, reason: routed.reason, taskId, interpretation, classification: routed.classified };
        }

        try {
        const playerAction = routed.authorization.playerAction;
        const run = await pipeline.run({
            taskId,
            sessionId,
            branchId,
            triggerMessageId: triggerMessageId ?? `input-${now()}`,
            stateVersion,
            playerInput: input,
            allowedPlayerActions: playerAction ? [`${playerAction.targetId}:${playerAction.method}`] : [],
            data: {
                interpretation,
                authorization: routed.authorization,
                plan: routed.plan,
                enabledModuleIds: routed.enabledModuleIds,
                taskType: routed.taskType,
            },
            signal,
        });

        if (run.status !== 'candidate_ready') {
            const issue = (run.quality?.issues ?? []).find(item => item?.code) ?? null;
            const reason = run.error ?? run.narrative?.reason ?? issue?.code ?? run.reason ?? run.status;
            settle(taskId, 'failed_unapplied', {
                message: `这一轮没有提交：${reason}。`,
                applied: '没有状态变更',
                nextStep: '换个说法，或先把对应字段登记进数据合同，再运行一轮。',
            });
            emit({ type: 'turn_rejected', taskId, status: run.status, stage: run.stage ?? null, reason });
            return { status: run.status === 'failed' ? 'failed' : 'rejected', stage: run.stage ?? null, reason, taskId, quality: run.quality, narrative: run.narrative };
        }

        const candidate = run.candidate;
        const text = candidate.stageResults?.compose?.text;
        if (typeof text !== 'string' || !text.trim()) {
            pipeline.cancel(taskId);
            settle(taskId, 'failed_unapplied', { message: '正文为空，本轮没有写入状态。', applied: '没有状态变更', nextStep: '重新运行一轮。' });
            return { status: 'failed', stage: 'compose', reason: 'empty_text', taskId };
        }

        const delivery = await deliver({ text, taskId, messageId: placeholderMessage?.messageId });
        if (delivery?.ok) placeholderConsumed = true;
        if (!delivery?.ok) {
            pipeline.cancel(taskId);
            settle(taskId, 'failed_unapplied', { message: '正文没有送进当前对话，本轮不写入状态。', applied: '没有状态变更', nextStep: '确认酒馆消息接口可用后重试。' });
            emit({ type: 'turn_failed', taskId, stage: 'delivery', reason: delivery?.reason ?? 'delivery_failed' });
            return { status: 'failed', stage: 'delivery', reason: delivery?.reason ?? 'delivery_failed', taskId, text };
        }

        const prepared = pipeline.commitCandidate({ candidate, messageId: delivery.messageId });
        if (prepared?.status !== 'awaiting_message_evidence') {
            emit({ type: 'turn_failed', taskId, stage: 'prepare_commit', reason: prepared?.status ?? 'unknown' });
            return { status: 'failed', stage: 'prepare_commit', reason: prepared?.reason ?? prepared?.status ?? 'prepare_failed', taskId, text, delivery };
        }

        const committed = pipeline.confirmMessageAndCommit({ taskId, messageId: delivery.messageId, observed: delivery.observed !== false });
        const snapshot = stateStore.read({ sessionId, branchId });
        const persisted = persistence?.save?.({ sessionId, branchId }, snapshot);

        if (committed?.status !== 'committed' && committed?.status !== 'duplicate_commit') {
            settle(taskId, 'save_uncertain', {
                message: '正文已经显示，但状态提交需要核对。',
                applied: '正文已显示；状态以实际版本为准',
                nextStep: '再运行一轮前先核对当前状态与消息。',
            });
            emit({ type: 'turn_uncertain', taskId, commit: committed?.status ?? 'unknown' });
            return { status: 'save_uncertain', taskId, text, stateVersion: snapshot?.stateVersion, commit: committed, persisted };
        }

        settle(taskId, 'completed_saved', {
            message: `本轮已提交，状态版本 ${snapshot?.stateVersion ?? '未知'}。`,
            applied: (candidate.acceptedChanges ?? []).length ? `${candidate.acceptedChanges.length} 项状态变化` : '没有状态变化',
            nextStep: '继续对话即可。',
        });
        emit({ type: 'turn_completed', taskId, stateVersion: snapshot?.stateVersion, changes: candidate.acceptedChanges ?? [], persisted: persisted?.status });
        return {
            status: 'completed',
            taskId,
            text,
            changes: candidate.acceptedChanges ?? [],
            state: snapshot?.state ?? null,
            stateVersion: snapshot?.stateVersion ?? null,
            delivery,
            persisted: persisted?.status ?? 'skipped',
        };
        } finally {
            if (placeholderMessage && !placeholderConsumed) {
                try { await discardMessage?.({ messageId: placeholderMessage.messageId }); } catch { /* 占位消息清理失败不影响结果 */ }
            }
        }
    }

    /** Replays an earlier committed version as a new version and persists it. */
    function rollback({ sessionId, branchId, targetVersion, commitId } = {}) {
        sessionId = needText(sessionId, 'sessionId');
        branchId = needText(branchId, 'branchId');
        targetVersion = needText(targetVersion, 'targetVersion');
        readScope({ sessionId, branchId });
        const result = stateStore.rollback({ sessionId, branchId, targetVersion, commitId: commitId ?? `rollback-${now()}` });
        if (result.status !== 'rolled_back') return result;
        const snapshot = stateStore.read({ sessionId, branchId });
        const persisted = persistence?.save?.({ sessionId, branchId }, snapshot);
        emit({ type: 'turn_rolled_back', sessionId, branchId, targetVersion, stateVersion: result.stateVersion });
        return {
            status: 'rolled_back',
            fromVersion: result.fromVersion,
            targetVersion,
            stateVersion: result.stateVersion,
            state: result.state,
            persisted: persisted?.status ?? 'skipped',
        };
    }

    return Object.freeze({ runTurn, inspect, restore, rollback });
}
