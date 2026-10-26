import assert from 'node:assert/strict';
import { createAgentCoordinator } from '../core/coordinator.js';
import { createStateStore } from '../core/state-store.js';
import { createCommitRecovery } from '../core/commit-recovery.js';
import { createQualityGate } from '../core/quality-gate.js';
import { createDataContractRegistry } from '../core/data-contract.js';
import { createModuleRunner } from '../core/module-runner.js';
import { registerAgentModules } from '../core/agent-modules.js';
import { createOperationLedger } from '../core/operation-ledger.js';
import { createRequestClassifier } from '../request/request-classifier.js';
import { createRequestRouter } from '../request/request-router.js';
import { createFactsLibrary } from '../narrative/facts-library.js';
import { createActionResolver } from '../request/action-resolver.js';
import { createWorldSimulator } from '../request/world-simulator.js';
import { createNarrativeGuard } from '../narrative/narrative-guard.js';
import { createTurnPipeline } from '../core/turn-pipeline.js';
import { createTurnStages } from '../core/turn-stages.js';
import { createOrchestrator } from '../core/orchestrator.js';
import { registerDefaultContracts, createInitialState } from '../core/turn-state.js';

const enabled = ['facts-query', 'action-resolve', 'world-advance'];

function buildHarness({ composeText = '院子里风停了。', deliver } = {}) {
    const contracts = createDataContractRegistry();
    registerDefaultContracts(contracts);
    const coordinator = createAgentCoordinator({ dispatch: () => {} });
    const stateStore = createStateStore();
    const commitRecovery = createCommitRecovery({ stateStore });
    const qualityGate = createQualityGate({ contracts });
    const narrativeGuard = createNarrativeGuard();
    const runner = createModuleRunner({ updateTask: (taskId, status, fields) => coordinator.update(taskId, status, fields) });
    registerAgentModules(runner, {
        facts: createFactsLibrary(),
        actions: createActionResolver(),
        world: createWorldSimulator(),
        sandbox: { advance: async () => ({ status: 'candidate', proposals: [] }) },
    });
    const router = createRequestRouter({
        classifier: createRequestClassifier(),
        runner,
        getEnabledModuleIds: () => enabled,
        operationLedger: createOperationLedger(),
        commitRecovery,
        getCapabilities: () => ({ status: 'ready' }),
    });
    const stages = createTurnStages({
        runner,
        actions: createActionResolver(),
        world: createWorldSimulator(),
        compose: async () => ({ text: composeText, claims: [{ kind: 'flavor', text: '风停了' }] }),
        getState: ctx => stateStore.read({ sessionId: ctx.sessionId, branchId: ctx.branchId }).state ?? {},
        getWriter: targetId => contracts.get(targetId)?.writer ?? 'actions',
    });
    const pipeline = createTurnPipeline({ stages, qualityGate, narrativeGuard, commitRecovery });
    const saved = [];
    const orchestrator = createOrchestrator({
        pipeline,
        router,
        coordinator,
        stateStore,
        contracts,
        settings: () => ({ enabled: true }),
        interpret: async () => interpretation,
        deliver: deliver ?? (async () => ({ ok: true, method: 'test', messageId: '42', observed: true })),
        persistence: { load: () => ({ status: 'empty' }), save: (scope, snapshot) => { saved.push({ scope, snapshot }); return { status: 'saved' }; } },
        now: () => 1000,
    });
    return { orchestrator, stateStore, pipeline, coordinator, saved };
}

const scope = { sessionId: 'chat-a', branchId: 'main' };
let interpretation = { type: 'conversation', task: 'ordinary_interaction', explicitAction: false, playerAction: null, effects: [] };

// 1. 普通对话：跑完整条主链，正文送达，状态版本前进一版。
{
    const { orchestrator, stateStore, saved } = buildHarness();
    const result = await orchestrator.runTurn({ ...scope, input: '我在院子里站了一会儿。' });
    assert.equal(result.status, 'completed');
    assert.equal(result.text, '院子里风停了。');
    assert.deepEqual(result.changes, []);
    assert.equal(result.stateVersion, 'v2');
    assert.equal(saved.length, 1);
    assert.equal(stateStore.read(scope).stateVersion, 'v2');
}

// 2. 明确行动：效果经规则引擎结算，hp 从 100 走到 90，并且真的提交。
{
    interpretation = {
        type: 'explicit_action',
        task: 'explicit_action',
        explicitAction: true,
        playerAction: { targetId: 'player', method: '硬闯练武场' },
        effects: [{ targetId: 'player', field: 'hp', type: 'add', value: -10, allowNegative: true, reason: '被守卫打伤' }],
    };
    const { orchestrator, stateStore } = buildHarness({ composeText: '你被守卫一掌震退。' });
    const result = await orchestrator.runTurn({ ...scope, input: '我要硬闯练武场。' });
    assert.equal(result.status, 'completed');
    assert.equal(result.changes.length, 1);
    assert.equal(result.changes[0].field, 'hp');
    assert.equal(stateStore.read(scope).state.player.hp, 90);
    assert.equal(result.stateVersion, 'v2');
}

// 3. 写未登记字段：质量门拦下，状态一个字节都不动。
{
    interpretation = {
        type: 'explicit_action',
        task: 'explicit_action',
        explicitAction: true,
        playerAction: { targetId: 'player', method: '碰运气' },
        effects: [{ targetId: 'player', field: 'luck', type: 'set', value: 99 }],
    };
    const { orchestrator, stateStore } = buildHarness();
    const result = await orchestrator.runTurn({ ...scope, input: '我试试运气。' });
    assert.equal(result.status, 'rejected');
    assert.equal(result.stage, 'quality_gate');
    assert.equal(stateStore.read(scope).stateVersion, 'v1');
    assert.equal(stateStore.read(scope).state.player.luck, undefined);
}

// 4. 消息送不出去：整轮失败，状态不写。
{
    interpretation = { type: 'conversation', task: 'ordinary_interaction', explicitAction: false, playerAction: null, effects: [] };
    const { orchestrator, stateStore } = buildHarness({ deliver: async () => ({ ok: false, reason: 'no_message_api' }) });
    const result = await orchestrator.runTurn({ ...scope, input: '随便说两句。' });
    assert.equal(result.status, 'failed');
    assert.equal(result.stage, 'delivery');
    assert.equal(stateStore.read(scope).stateVersion, 'v1');
}

// 5. 总控开关关闭：直接不执行。
{
    const { orchestrator } = buildHarness();
    const closed = createOrchestrator;
    assert.equal(typeof closed, 'function');
    const disabledOrchestrator = createOrchestrator({
        pipeline: { run: async () => ({ status: 'failed' }) },
        router: { prepare: () => ({ status: 'ready' }) },
        coordinator: createAgentCoordinator({ dispatch: () => {} }),
        stateStore: createStateStore(),
        settings: () => ({ enabled: false }),
        interpret: async () => ({}),
        deliver: async () => ({ ok: true }),
    });
    const result = await disabledOrchestrator.runTurn({ ...scope, input: '你好。' });
    assert.equal(result.status, 'disabled');
    assert.equal(orchestrator.inspect(scope).status, 'empty');
}

// 6. 说了行动但没给出目标：分类器要求补充，不进入结算。
{
    interpretation = { type: 'explicit_action', task: 'explicit_action', explicitAction: true, playerAction: null, effects: [] };
    const { orchestrator, stateStore } = buildHarness();
    const result = await orchestrator.runTurn({ ...scope, input: '动手吧。' });
    assert.equal(result.status, 'needs_clarification');
    assert.equal(stateStore.read(scope).stateVersion, 'v1');
}

// 7. 初始状态与合同字段一致。
{
    const state = createInitialState();
    assert.equal(state.player.hp, 100);
    assert.equal(state.world.day, 1);
}
