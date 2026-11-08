// 沙盒口径的正式接线：作用域读写、存档持久化、生效判定与设置页确认切换。
// 从 index.js 摘出的依赖注入工厂——账本运行时（agentSandboxMode）与宿主存储都由调用方传入，
// 测试可以直接 import 工厂、喂桩、比行为，不再切片源码。

export function createSandboxWiring({
    scopeOf, runtime, hostStorage, currentSettings,
    coordinator, stateStore, invalidateContinuations,
    setSandboxStatus, messages, syncPendingRow, renderRuntime, getPanel,
}) {
    /** 沙盒口径是否生效：正式模式记录优先（中途切换要确认，记录没换口径就没换），没有记录才按设置开关。 */
    async function confirmSandboxSwitch() {
        const scope = scopeOf();
        const task = coordinator.list().reverse().find(item => item.sessionId === scope.sessionId && item.branchId === scope.branchId);
        const stateVersion = stateStore.read(scope)?.stateVersion;
        if (!task?.taskId || typeof stateVersion !== 'string' || !stateVersion.trim()) {
            setSandboxStatus(messages.unavailable);
            return { status: 'unavailable' };
        }
        const result = runtime.confirm({ ...scope, taskId: task.taskId, stateVersion, reason: '设置页确认切换' });
        if (result.status === 'switched') {
            invalidateContinuations();
            const saved = await persistSandboxMode();
            setSandboxStatus(saved.status === 'saved' ? messages.switched : messages.failed);
        } else setSandboxStatus(result.reason === 'stale_switch_context' ? '当前任务或状态已变化，请重新申请口径切换。' : messages.nothingPending);
        syncPendingRow();
        renderRuntime(getPanel());
        return result;
    }

    /** hostStorage 传的是 getter（宿主存储是懒初始化的 let），这里统一取一次真身。 */
    function storage() {
        return typeof hostStorage === 'function' ? hostStorage() : hostStorage;
    }

    function persistSandboxMode() {
        const scope = scopeOf();
        const saved = storage()?.chatState?.();
        const value = saved?.status === 'ready' && saved.value && typeof saved.value === 'object' ? { ...saved.value } : {};
        return Promise.resolve(storage()?.saveChatState?.({ ...value, sandboxMode: runtime.snapshot(scope) }) ?? { status: 'unavailable' })
            .catch(error => ({ status: 'failed', reason: String(error?.message ?? error) }));
    }

    function restoreSandboxFromChat() {
        const scope = scopeOf();
        const saved = storage()?.chatState?.();
        runtime.restore(null, scope);
        return runtime.restore(saved?.status === 'ready' ? saved.value?.sandboxMode : null, scope);
    }

    /** 沙盒口径是否生效：开关随开随关——全局开关是最终裁判，聊天存档只携带沙盒的任务与历史，
     *  不再把口径钉死在某个聊天上。记录口径跟开关不一致时直接换向（不走确认），换向落存档。 */
    function sandboxModeActive() {
        const scope = scopeOf();
        const settings = currentSettings();
        const wantSandbox = settings.enableSandboxMode === true;
        let record = runtime.read(scope);
        if (record.status !== 'ready') {
            const saved = storage()?.chatState?.();
            if (saved?.status === 'ready' && saved.value?.sandboxMode) {
                const restored = runtime.restore(saved.value.sandboxMode, scope);
                if (restored.status === 'rejected') return wantSandbox;
                record = runtime.read(scope);
            }
        }
        const recordMode = record.status === 'ready' ? record.mode : null;
        if (recordMode === (wantSandbox ? 'sandbox' : 'mainline')) return wantSandbox;
        runtime.followSwitch({ ...scope, sandbox: wantSandbox,
            inertia: settings.sandbox?.inertia, canonCharactersAutonomous: settings.sandbox?.canonCharactersAutonomous });
        void persistSandboxMode();
        return wantSandbox;
    }

    return { confirmSandboxSwitch, persistSandboxMode, restoreSandboxFromChat, sandboxModeActive };
}
