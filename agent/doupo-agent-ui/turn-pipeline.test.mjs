import assert from 'node:assert/strict';
import { createTurnPipeline } from './turn-pipeline.js';
import { createDataContractRegistry } from './data-contract.js';
import { createQualityGate } from './quality-gate.js';
import { createNarrativeGuard } from './narrative-guard.js';
import { createStateStore } from './state-store.js';
import { createCommitRecovery } from './commit-recovery.js';
const calls = [];
const progress = [];
const pipe = createTurnPipeline({ onProgress: item => progress.push(item), stages: {
    classify: async c => { calls.push(['classify', c.playerInput]); return { kind: 'action' }; },
    plan: async c => { calls.push(['plan', c.previous.classify.kind]); return { stages: ['gather', 'adjudicate'] }; },
    gather: async c => { calls.push(['gather', c.previous.plan.stages.length]); return { facts: ['f1'] }; },
    adjudicate: async c => { calls.push(['adjudicate', c.previous.gather.facts[0]]); return { changes: [{ id: 'hp', value: -2 }] }; },
    compose: async c => { calls.push(['compose', c.previous.adjudicate.changes.length]); return { text: '发生了一次变化。' }; },
    validate: async c => { calls.push(['validate', c.previous.compose.text]); return { accepted: true }; },
} });
const input = { taskId: 't1', sessionId: 's', branchId: 'b', triggerMessageId: 'm', stateVersion: 'v1', playerInput: '攻击', allowedPlayerActions: ['攻击'] };
const result = await pipe.run(input);
assert.equal(result.status, 'candidate_ready');
assert.deepEqual(calls.map(x => x[0]), ['classify', 'plan', 'gather', 'adjudicate', 'compose', 'validate']);
assert.equal(result.candidate.baseStateVersion, 'v1');
assert.equal(pipe.inspect('t1').status, 'candidate_ready');
assert.equal(progress[0].status, 'processing');
assert.ok(progress.some(item => item.currentStage === 'classify'));
assert.equal(progress.at(-1).status, 'candidate_ready');
assert.ok(progress.every((item, index) => index === 0 || item.sequence > progress[index - 1].sequence));
assert.equal((await pipe.run(input)).status, 'duplicate_task');

const failed = createTurnPipeline({ stages: { classify: () => ({ kind: 'chat' }), plan: () => { throw new Error('plan failed'); }, gather: () => { throw new Error('must not run'); } } });
const failResult = await failed.run({ ...input, taskId: 't2' });
assert.equal(failResult.stage, 'plan');
assert.deepEqual(failed.inspect('t2').completedStages, ['classify']);

const cancelPipe = createTurnPipeline({ stages: { classify: async ({ signal }) => new Promise(resolve => signal.addEventListener('abort', () => resolve({ late: true }), { once: true })), plan: () => ({}) } });
const pending = cancelPipe.run({ ...input, taskId: 't3' });
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(cancelPipe.cancel('t3').status, 'cancelled');
assert.equal((await pending).status, 'cancelled');
assert.equal(cancelPipe.inspect('t3').status, 'cancelled');
const cancelProgress = [];
let releaseLateStage;
const lateCancelPipe = createTurnPipeline({ onProgress: item => cancelProgress.push(item), stages: {
    classify: () => new Promise(resolve => { releaseLateStage = resolve; }),
    plan: () => ({ mustNotRun: true }),
} });
const latePending = lateCancelPipe.run({ ...input, taskId: 't-late-cancel' });
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(lateCancelPipe.cancel('t-late-cancel').status, 'cancelled');
releaseLateStage({ late: true });
assert.equal((await latePending).status, 'cancelled');
assert.deepEqual(lateCancelPipe.inspect('t-late-cancel').completedStages, []);
assert.equal(lateCancelPipe.inspect('t-late-cancel').status, 'cancelled');
assert.equal(cancelProgress.filter(item => item.status === 'cancelled').length, 2);

const bounded = createTurnPipeline({ stages: { classify: () => 'x'.repeat(500) }, maxOutputBytes: 128 });
assert.equal((await bounded.run({ ...input, taskId: 't4' })).error, 'stage_output_limit');
let timeoutClock = 0;
const timeoutPipe = createTurnPipeline({ maxTotalMs: 100, stageTimeoutMs: { classify: 5 }, now: () => timeoutClock, setTimer: callback => { timeoutClock += 5; callback(); return 1; }, clearTimer: () => {}, stages: { classify: () => new Promise(() => {}), plan: () => ({ unreachable: true }) } });
const timedOut = await timeoutPipe.run({ ...input, taskId: 't-timeout' });
assert.equal(timedOut.error, 'stage_timeout');
assert.equal(timedOut.stage, 'classify');
let pipelineClock = 0;
const budgetPipe = createTurnPipeline({ maxTotalMs: 5, now: () => pipelineClock, setTimer: callback => { pipelineClock += 6; callback(); return 1; }, clearTimer: () => {}, stages: { classify: () => new Promise(() => {}), plan: () => ({ unreachable: true }) } });
const budgetResult = await budgetPipe.run({ ...input, taskId: 't-budget' });
assert.equal(budgetResult.error, 'total_budget_exhausted');
assert.throws(() => createTurnPipeline({ stageTimeoutMs: { arbitrary: 5 } }), /阶段超时配置无效/);
assert.throws(() => createTurnPipeline({ stages: { executeArbitraryCode: () => 1 } }), /未知或不允许/);
const unserializable = createTurnPipeline({ stages: { classify: () => ({ bad: 1n }) } });
assert.equal((await unserializable.run({ ...input, taskId: 't5' })).error, 'stage_output_limit');
const contracts = createDataContractRegistry();
contracts.register({ id: 'player', kind: 'character', name: '玩家', creator: 'player', writer: 'state', readers: ['player', 'ui'], version: 'v1', fields: [{ id: 'hp', type: 'number', writer: 'actions', missingMeaning: '未初始化' }] });
const gate = createQualityGate({ contracts });
const narrative = createNarrativeGuard();
const store = createStateStore(); store.seed({ sessionId: 'commit-s', branchId: 'commit-b', state: { hp: 10 } });
const recovery = createCommitRecovery({ stateStore: store });
const guardedProgress = [];
const guarded = createTurnPipeline({ qualityGate: gate, narrativeGuard: narrative, commitRecovery: recovery, onProgress: event => guardedProgress.push(event), stages: {
    classify: () => ({ kind: 'action' }), plan: () => ({}), gather: () => ({ visibleFactIds: ['f1'] }),
    adjudicate: () => ({ nextState: { hp: 9 }, changes: [{ id: 'hp-1', sessionId: 'commit-s', branchId: 'commit-b', stateVersion: 'v1', type: 'set', targetId: 'player', field: 'hp', writer: 'actions', value: 9 }], approvedChangeIds: ['hp-1'] }),
    compose: () => ({ text: '玩家生命下降。', claims: [{ kind: 'fact', text: '生命下降', factIds: ['f1'] }] }),
    validate: c => ({ changes: c.previous.adjudicate.changes, claims: [] }),
} });
const guardedResult = await guarded.run({ ...input, taskId: 'commit-1', sessionId: 'commit-s', branchId: 'commit-b' });
assert.equal(guardedResult.status, 'candidate_ready');
assert.equal(guarded.commitCandidate({ candidate: guardedResult.candidate, messageId: 'host-msg-1' }).status, 'awaiting_message_evidence');
assert.equal(store.read({ sessionId: 'commit-s', branchId: 'commit-b' }).state.hp, 10);
assert.equal(guarded.confirmMessageAndCommit({ taskId: 'commit-1', messageId: 'host-msg-1', observed: true }).status, 'committed');
assert.equal(store.read({ sessionId: 'commit-s', branchId: 'commit-b' }).state.hp, 9);
assert.equal(guardedProgress.at(-1).status, 'completed_saved');
assert.equal(guardedProgress.at(-1).event, 'commit_complete');
assert.equal(guardedProgress.filter(item => item.event === 'candidate_ready').length, 1);
assert.equal(guardedProgress.filter(item => item.event === 'awaiting_message_evidence').length, 1);
assert.equal(guardedProgress.filter(item => item.event === 'commit_complete').length, 1);
assert.equal(guarded.confirmMessageAndCommit({ taskId: 'commit-1', messageId: 'host-msg-1', observed: true }).reason, 'task_not_awaiting_message_evidence');
assert.equal(guarded.invalidateNpcPlanVersion({ sessionId: 'commit-s', branchId: 'commit-b', stateVersion: 'v1', npcId: 'missing', planId: 'none', previousVersion: 1, currentVersion: 2 }).status, 'no_matching_task');
const cancelledStore = createStateStore(); cancelledStore.seed({ sessionId: 'cancel-commit-s', branchId: 'cancel-commit-b', state: { hp: 7 } });
const cancelledRecovery = createCommitRecovery({ stateStore: cancelledStore });
const cancelBeforeMessage = createTurnPipeline({ commitRecovery: cancelledRecovery, stages: {
    classify: () => ({}), adjudicate: () => ({ nextState: { hp: 6 } }),
} });
const cancelCandidate = await cancelBeforeMessage.run({ ...input, taskId: 'cancel-commit', sessionId: 'cancel-commit-s', branchId: 'cancel-commit-b' });
assert.equal(cancelBeforeMessage.commitCandidate({ candidate: cancelCandidate.candidate, messageId: 'cancel-msg' }).status, 'awaiting_message_evidence');
assert.equal(cancelBeforeMessage.cancel('cancel-commit').status, 'cancelled');
assert.equal(cancelBeforeMessage.confirmMessageAndCommit({ taskId: 'cancel-commit', messageId: 'cancel-msg', observed: true }).status, 'cancelled');
assert.equal(cancelledStore.read({ sessionId: 'cancel-commit-s', branchId: 'cancel-commit-b' }).state.hp, 7);
const uncertainStore = createStateStore(); uncertainStore.seed({ sessionId: 'uncertain-s', branchId: 'uncertain-b', state: { hp: 4 } });
const uncertainRecovery = createCommitRecovery({ stateStore: uncertainStore });
const uncertainPipe = createTurnPipeline({ commitRecovery: uncertainRecovery, stages: { classify: () => ({}), adjudicate: () => ({ nextState: { hp: 3 } }) } });
const uncertainCandidate = await uncertainPipe.run({ ...input, taskId: 'uncertain-commit', sessionId: 'uncertain-s', branchId: 'uncertain-b' });
assert.equal(uncertainPipe.commitCandidate({ candidate: uncertainCandidate.candidate, messageId: 'uncertain-msg' }).status, 'awaiting_message_evidence');
assert.equal(uncertainRecovery.markMessage({ sessionId: 'uncertain-s', branchId: 'uncertain-b', commitId: 'uncertain-commit', messageId: 'uncertain-msg', observed: true }).status, 'message_observed');
assert.equal(uncertainPipe.cancel('uncertain-commit').status, 'save_uncertain');
assert.equal(uncertainPipe.inspect('uncertain-commit').status, 'awaiting_message_evidence');
const npcVersionPipe = createTurnPipeline({ stages: { adjudicate: () => ({ npcPlanVersions: [{ npcId: 'captain', planId: 'escort', version: 1 }], nextState: { hp: 3 } }) } });
const npcCandidate = await npcVersionPipe.run({ ...input, taskId: 'npc-version-task', sessionId: 'npc-s', branchId: 'npc-b', stateVersion: 'v1' });
assert.equal(npcCandidate.status, 'candidate_ready');
assert.equal(npcVersionPipe.invalidateNpcPlanVersion({ sessionId: 'npc-s', branchId: 'npc-b', stateVersion: 'v1', npcId: 'captain', planId: 'escort', previousVersion: 1, currentVersion: 2 }).invalidated[0].status, 'invalidated');
assert.equal(npcVersionPipe.inspect('npc-version-task').status, 'invalidated');
assert.equal(npcVersionPipe.commitCandidate({ candidate: npcCandidate.candidate, messageId: 'npc-msg' }).reason, 'candidate_invalidated');
assert.equal(npcVersionPipe.confirmMessageAndCommit({ taskId: 'npc-version-task', messageId: 'npc-msg', observed: true }).reason, 'candidate_invalidated');
assert.equal(npcVersionPipe.confirmMessageAndCommit({ taskId: 'npc-version-task', messageId: 'npc-msg', observed: true }).reason, 'candidate_invalidated');
const npcAudit = [];
const auditedNpcPipe = createTurnPipeline({ audit: { record: event => npcAudit.push(event) }, stages: { adjudicate: () => ({ npcPlanVersions: [{ npcId: 'captain', planId: 'escort', version: 1 }] }) } });
const auditedCandidate = await auditedNpcPipe.run({ ...input, taskId: 'npc-audit-task', sessionId: 'npc-s', branchId: 'npc-b', stateVersion: 'v1' });
auditedNpcPipe.invalidateNpcPlanVersion({ sessionId: 'npc-s', branchId: 'npc-b', stateVersion: 'v1', npcId: 'captain', planId: 'escort', previousVersion: 1, currentVersion: 2 });
assert.equal(npcAudit.at(-1).event, 'npc_plan_candidates_invalidated');
const invalidatedPipe = createTurnPipeline({ stages: { compose: async ({ signal }) => new Promise(resolve => signal.addEventListener('abort', () => resolve('late text'), { once: true })) } });
const invalidatedPending = invalidatedPipe.run({ ...input, taskId: 'invalidated-run' });
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(invalidatedPipe.invalidate('invalidated-run', { reason: 'trigger_message_edited' }).status, 'invalidated');
const invalidatedResult = await invalidatedPending;
assert.equal(invalidatedResult.status, 'invalidated');
assert.equal(invalidatedResult.task.invalidationReason, 'trigger_message_edited');
assert.equal(invalidatedPipe.inspect('invalidated-run').completedStages.length, 0);
assert.equal(invalidatedPipe.cancel('invalidated-run').status, 'invalidated');
assert.equal(invalidatedPipe.invalidate('invalidated-run', { reason: 'trigger_message_edited' }).status, 'invalidated');
const badPipe = createTurnPipeline({ qualityGate: gate, stages: { validate: () => ({ changes: [{ id: 'bad', sessionId: 's', branchId: 'b', stateVersion: 'v1', type: 'set', targetId: 'player', field: 'missing', value: 1 }] }) } });
const bad = await badPipe.run({ ...input, taskId: 'bad-contract' });
assert.equal(bad.status, 'rejected');
assert.equal(bad.stage, 'quality_gate');
const rejectedProgress = [];
const rejectedPipe = createTurnPipeline({ qualityGate: { review: () => ({ status: 'rejected', acceptedChanges: [] }) }, onProgress: event => rejectedProgress.push(event), stages: { validate: () => ({ changes: [{ id: 'x' }] }) } });
const rejected = await rejectedPipe.run({ ...input, taskId: 'rejected-quality' });
assert.equal(rejected.status, 'rejected');
assert.equal(rejectedProgress.at(-1).event, 'quality_rejected');
console.log('turn pipeline tests passed');
