#!/usr/bin/env node
/**
 * 一键演示：从一条玩家消息开始，跑完整条总控链。
 * 运行：node agent/doupo-agent-ui/demo-turn.mjs
 * 不需要联网：模型部分换成内置的固定回答，其余全部走真实模块。
 */
import { createAgentCoordinator } from './core/coordinator.js';
import { createStateStore } from './core/state-store.js';
import { createCommitRecovery } from './core/commit-recovery.js';
import { createQualityGate } from './core/quality-gate.js';
import { createDataContractRegistry } from './core/data-contract.js';
import { createModuleRunner } from './core/module-runner.js';
import { registerAgentModules } from './core/agent-modules.js';
import { createOperationLedger } from './core/operation-ledger.js';
import { createTurnPipeline } from './core/turn-pipeline.js';
import { createTurnStages } from './core/turn-stages.js';
import { createOrchestrator } from './core/orchestrator.js';
import { createInitialState, registerDefaultContracts, summarizeState } from './core/turn-state.js';
import { createFactsLibrary } from './narrative/facts-library.js';
import { createNarrativeGuard } from './narrative/narrative-guard.js';
import { createActionResolver } from './request/action-resolver.js';
import { createRequestClassifier } from './request/request-classifier.js';
import { createRequestRouter } from './request/request-router.js';
import { createWorldSimulator } from './request/world-simulator.js';

const line = title => console.log(`\n=== ${title} ===`);

const registry = createDataContractRegistry({});
registerDefaultContracts(registry);

const facts = createFactsLibrary({});
facts.registerSource({
    id: 'src-canon-1', title: '斗破苍穹·第一章', continuity: '原作', edition: '起点中文网',
    realm: 'canon', provenance: '公开连载正文',
});
facts.registerFact({
    id: 'fact-wutan-xiao', sourceId: 'src-canon-1', subject: '萧家', predicate: '地点',
    text: '萧家坐落在乌坦城，是城中三大家族之一。', location: '乌坦城',
});
facts.registerFact({
    id: 'fact-douqi', sourceId: 'src-canon-1', subject: '斗气', predicate: '设定',
    text: '斗气修炼需要按功法吸纳天地能量，日夜不辍。',
});

const actions = createActionResolver({});
const world = createWorldSimulator({});
const operationLedger = createOperationLedger({});
const stateStore = createStateStore({});
const commitRecovery = createCommitRecovery({ stateStore });
const qualityGate = createQualityGate({ contracts: registry });
const narrativeGuard = createNarrativeGuard({});
const classifier = createRequestClassifier({});

const runner = createModuleRunner({ updateTask: () => {} });
registerAgentModules(runner, { facts, actions, world });

const router = createRequestRouter({
    classifier,
    runner,
    getEnabledModuleIds: () => ['facts-query', 'action-resolve', 'world-advance', 'sandbox-advance'],
    operationLedger,
    commitRecovery,
    getCapabilities: () => ({ status: 'ready', versions: {}, symbols: [], missing: [] }),
});

const stages = createTurnStages({
    runner,
    actions,
    world,
    compose: ({ facts: gathered, changes, outcome }) => ({
        text: [
            outcome && !outcome.startsWith('本轮没有结算') ? outcome : '檐下的铜铃被风吹得轻响，院子里很安静。',
            gathered.length ? `你想起${gathered[0].text}` : '',
            changes.length ? `（本轮状态：${changes.map(change => `${change.targetId}.${change.field} ${change.before}→${change.after}`).join('，')}）` : '',
        ].filter(Boolean).join('\n'),
        claims: gathered.length ? [{ kind: 'fact', text: gathered[0].text, factIds: [gathered[0].id] }] : [{ kind: 'flavor', text: '檐下的铜铃' }],
    }),
    getState: ctx => stateStore.read(ctx)?.state ?? createInitialState(),
    getSourceIds: () => ['src-canon-1'],
    getLimits: () => ({ maxEntries: 8 }),
    getWriter: targetId => registry.get(targetId)?.writer ?? 'actions',
});

const pipeline = createTurnPipeline({
    stages,
    qualityGate,
    narrativeGuard,
    commitRecovery,
    onProgress: progress => {
        if (progress.message) console.log(`  [阶段] ${progress.currentStage ?? '-'} · ${progress.message}`);
    },
});

const coordinator = createAgentCoordinator({ dispatch: () => {} });
const memory = new Map();
const persistence = {
    save: ({ sessionId, branchId }, snapshot) => {
        memory.set(`${sessionId}::${branchId}`, snapshot);
        return { status: 'saved', stateVersion: snapshot?.stateVersion };
    },
    load: ({ sessionId, branchId }) => {
        const snapshot = memory.get(`${sessionId}::${branchId}`);
        return snapshot ? { status: 'loaded', snapshot } : { status: 'empty' };
    },
};

const settings = { enabled: true };
let messageSeq = 0;
const orchestrator = createOrchestrator({
    pipeline, router, coordinator, stateStore, contracts: registry, persistence,
    settings: () => settings,
    interpret: ({ input }) => (input.includes('开挂')
        ? {
            type: 'explicit_action', task: 'explicit_action', explicitAction: true, confidence: 0.9,
            playerAction: { targetId: 'player', method: '开挂' },
            effects: [{ targetId: 'player', field: 'luck', type: 'set', value: 99, reason: '未经登记的气运字段' }],
            outcome: '你想给自己加一点运气。',
        }
        : input.includes('三天')
            ? { type: 'time_advance', task: 'time_advance', explicitAction: true, confidence: 0.9, playerAction: { targetId: 'world', method: '等待' }, effects: [], days: 3, outcome: '三天过去。' }
            : input.includes('运气') || input.includes('修炼')
                ? {
                    type: 'explicit_action', task: 'explicit_action', explicitAction: true, confidence: 0.9,
                    playerAction: { targetId: 'player', method: '修炼' },
                    effects: [
                        { targetId: 'player', field: 'hp', type: 'add', value: -10, reason: '修炼消耗体力' },
                        { targetId: 'player', field: 'douqi', type: 'add', value: 5, reason: '斗气增长' },
                    ],
                    outcome: '你按功法运转斗气，气息比之前更沉了一些。',
                }
                : { type: 'query', task: 'ordinary_interaction', explicitAction: false, confidence: 0.8, effects: [], outcome: '' }),
    deliver: ({ text }) => {
        messageSeq += 1;
        console.log(`  [正文] ${text}`);
        return { ok: true, messageId: `msg-${messageSeq}`, observed: true };
    },
    onEvent: event => console.log(`  [总控] ${event.type}${event.stateVersion ? ` → ${event.stateVersion}` : ''}${event.stage ? ` (${event.stage})` : ''}`),
});

async function run(title, input) {
    line(title);
    console.log(`玩家：${input}`);
    const result = await orchestrator.runTurn({ sessionId: 'demo-chat', branchId: 'main', input });
    if (result.status === 'completed') {
        console.log(`  [结果] 完成 · 版本 ${result.stateVersion} · 变化 ${result.changes.length} 项 · 保存 ${result.persisted}`);
        console.log(`  [状态] ${summarizeState(result.state)}`);
    } else {
        console.log(`  [结果] ${result.status}${result.reason ? ` · ${result.reason}` : ''}${result.stage ? ` · 阶段 ${result.stage}` : ''}`);
    }
    return result;
}

console.log('斗破同人 Agent · 总控完整链路演示');

await run('第 1 轮：资料查询', '萧家');
await run('第 2 轮：明确行动', '我要在院子里运气修炼');
await run('第 3 轮：时间推进', '我在萧家静养，等过了三天再说');
await run('第 4 轮：越权写入被拦', '我想作弊开挂，把运气改成九十九');

line('最终状态');
const final = orchestrator.inspect({ sessionId: 'demo-chat', branchId: 'main' });
console.log(`版本：${final.stateVersion}`);
console.log(summarizeState(final.state));

line('第 5 步：回到第 1 轮之后的状态');
const rolled = await orchestrator.rollback({ sessionId: 'demo-chat', branchId: 'main', targetVersion: 'v1' });
console.log(`  [回退] ${rolled.status} · 目标 v1 · 新版本 ${rolled.stateVersion}`);
console.log(`  [状态] ${summarizeState(rolled.state)}`);
const restored = await orchestrator.rollback({ sessionId: 'demo-chat', branchId: 'main', targetVersion: 'v4' });
console.log(`  [前移] ${restored.status} · 目标 v4 · 新版本 ${restored.stateVersion}`);
console.log(`  [状态] ${summarizeState(restored.state)}`);

console.log('\n演示结束：内容、状态、两道审核、提交与回退都走的是真实代码路径。');
