import assert from 'node:assert/strict';
import { createModuleRunner } from '../core/module-runner.js';

const updates = [];
const auditEvents = [];
const audit = { record: event => auditEvents.push(event) };
const runner = createModuleRunner({ updateTask: (...args) => updates.push(args), maxModulesPerRun: 3, maxTotalMs: 1000, audit });
const order = [];
runner.register({ id: 'first', run: async ({ input }) => { order.push('first'); return { value: input }; } });
runner.register({ id: 'second', run: async ({ previous }) => { order.push('second'); return previous[0].value.value + 1; } });
assert.deepEqual(runner.list().map(item => item.id), ['first', 'second']);
assert.equal(runner.plan({ taskType: 'ordinary_interaction', requestedModuleIds: ['first'], enabledModuleIds: ['first', 'second'] }).status, 'planned');
assert.equal(runner.plan({ taskType: 'ordinary_interaction', requestedModuleIds: ['first'], enabledModuleIds: [] }).reason, 'module_disabled:first');
assert.equal(runner.plan({ taskType: 'ordinary_interaction', requestedModuleIds: ['first'], enabledModuleIds: ['first'] }).moduleIds[0], 'first');
const success = await runner.execute({ taskId: 'task-1', sessionId: 'session-1', branchId: 'branch-1', stateVersion: 'state-1', moduleIds: ['first', 'second'], input: 4 });
assert.equal(success.ok, true);
assert.deepEqual(order, ['first', 'second']);
assert.equal(success.results[1].value, 5);
assert.equal(success.degraded, false);
assert.equal(auditEvents[5].event, 'candidate_ready');
assert.equal(auditEvents[5].outcome, 'candidate_ready_not_committed');
assert.equal(updates[0][1], 'processing');
assert.deepEqual(auditEvents.slice(0, 5).map(item => item.event), ['task_start', 'stage_start', 'stage_complete', 'stage_start', 'stage_complete']);
assert.deepEqual({ sessionId: auditEvents[0].sessionId, branchId: auditEvents[0].branchId, stateVersion: auditEvents[0].stateVersion }, { sessionId: 'session-1', branchId: 'branch-1', stateVersion: 'state-1' });

await assert.rejects(() => runner.execute({ taskId: 'task-2', moduleIds: ['not-registered'] }), /未登记或未允许调用/);
await assert.rejects(() => runner.execute({ taskId: 'task-3', moduleIds: ['first', 'first'] }), /不允许重复/);

runner.register({ id: 'optional', required: false, run: () => { throw new Error('optional failure'); } });
const optionalStart = auditEvents.length;
const optional = await runner.execute({ taskId: 'task-4', moduleIds: ['optional', 'first'] });
assert.equal(optional.ok, true);
assert.equal(optional.results[0].ok, false);
const optionalAudit = auditEvents.slice(optionalStart);
assert.deepEqual(optionalAudit.map(item => item.event), ['task_start', 'stage_start', 'stage_failed', 'stage_start', 'stage_complete', 'candidate_ready']);
assert.equal(optionalAudit[2].stage, 'optional');
assert.equal(optionalAudit[2].outcome, 'optional_error');
assert.equal(optionalAudit[4].stage, 'first');
assert.equal(optionalAudit[5].event, 'candidate_ready');
assert.equal(optionalAudit[5].outcome, 'completed_with_optional_failures');
assert.equal(optional.degraded, true);

runner.register({ id: 'must-fail', run: () => { throw new Error('boom'); } });
const failed = await runner.execute({ taskId: 'task-5', sessionId: 'session-fail', branchId: 'branch-fail', stateVersion: 'state-fail', moduleIds: ['must-fail'] });
assert.equal(failed.ok, false);
assert.equal(auditEvents.at(-1).event, 'stage_failed');
assert.equal(auditEvents.at(-1).stage, 'must-fail');
assert.equal(failed.reason, 'error');
assert.equal(updates.at(-1)[1], 'failed_unapplied');

runner.register({ id: 'slow', timeoutMs: 5, run: () => new Promise(resolve => setTimeout(() => resolve('late'), 30)) });
const timed = await runner.execute({ taskId: 'task-6', moduleIds: ['slow'] });
assert.equal(timed.reason, 'timeout');

let clock = 0;
const budgetRunner = createModuleRunner({
    updateTask: (...args) => updates.push(args),
    maxModulesPerRun: 3,
    maxTotalMs: 5,
    now: () => clock,
    setTimer: callback => { clock += 11; callback(); return 1; },
    clearTimer: () => {},
});
budgetRunner.register({ id: 'budget-first', timeoutMs: 8, run: () => 'never resolves' });
budgetRunner.register({ id: 'budget-second', run: () => 'must not start' });
const exhausted = await budgetRunner.execute({ taskId: 'task-budget', moduleIds: ['budget-first', 'budget-second'] });
assert.equal(exhausted.ok, false);
assert.equal(exhausted.reason, 'budget_exhausted');
assert.equal(exhausted.results.length, 1);
assert.equal(exhausted.results[0].error.includes('剩余总预算'), true);
assert.throws(() => createModuleRunner({ updateTask() {}, maxTotalMs: 0 }), /maxTotalMs/);

const controller = new AbortController();
controller.abort();
const cancelled = await runner.execute({ taskId: 'task-7', sessionId: 'session-cancel', branchId: 'branch-cancel', stateVersion: 'state-cancel', moduleIds: ['first'], signal: controller.signal });
assert.equal(cancelled.reason, 'aborted');
assert.equal(auditEvents.at(-1).event, 'task_cancelled');
assert.equal(auditEvents.at(-1).outcome, 'aborted_before_stage');

const remove = runner.register({ id: 'temporary', run: () => true });
remove();
await assert.rejects(() => runner.execute({ taskId: 'task-8', moduleIds: ['temporary'] }), /未登记或未允许调用/);
assert.throws(() => runner.register({ id: 'bad_id', run() {} }), /模块 id 格式无效/);
assert.throws(() => runner.register({ id: 'first', run() {} }), /模块已登记/);
const planningRunner = createModuleRunner({ updateTask() {}, maxModulesPerRun: 3 });
planningRunner.register({ id: 'facts', taskTypes: ['explicit_action', 'complex_action'], run: () => ({ ok: true }) });
planningRunner.register({ id: 'actions', taskTypes: ['explicit_action', 'complex_action'], dependsOn: ['facts'], stateChanging: true, run: () => ({ ok: true }) });
const validActionPlan = planningRunner.plan({ taskType: 'explicit_action', requestedModuleIds: ['actions'], enabledModuleIds: ['facts', 'actions'] });
assert.deepEqual(validActionPlan.moduleIds, ['facts', 'actions']);
assert.equal(planningRunner.validatePlan(validActionPlan, { taskType: 'explicit_action', enabledModuleIds: ['facts', 'actions'] }).status, 'validated');
assert.equal(planningRunner.validatePlan({ ...validActionPlan, moduleIds: ['actions'] }, { taskType: 'explicit_action', enabledModuleIds: ['actions'] }).reason, 'module_disabled:facts');
assert.equal(planningRunner.validatePlan(validActionPlan, { taskType: 'ordinary_interaction', enabledModuleIds: ['facts', 'actions'] }).reason, 'task_not_supported:facts');
assert.equal(planningRunner.validatePlan({ ...validActionPlan, moduleIds: ['facts', 'actions', 'facts'] }, { taskType: 'explicit_action', enabledModuleIds: ['facts', 'actions'] }).reason, 'invalid_requested_modules');
assert.equal(planningRunner.validatePlan(validActionPlan, { taskType: 'explicit_action', enabledModuleIds: ['facts'] }).reason, 'module_disabled:actions');
assert.equal(planningRunner.plan({ taskType: 'explicit_action', requestedModuleIds: ['actions'], enabledModuleIds: ['actions'] }).reason, 'module_disabled:facts');
assert.equal(planningRunner.plan({ taskType: 'ordinary_interaction', requestedModuleIds: ['actions'], enabledModuleIds: ['facts', 'actions'] }).reason, 'task_not_supported:actions');
assert.equal(planningRunner.plan({ taskType: 'explicit_action', requestedModuleIds: ['actions'], enabledModuleIds: ['facts'] }).reason, 'module_disabled:actions');
await assert.rejects(() => planningRunner.execute({ taskId: 'unordered', taskType: 'explicit_action', moduleIds: ['actions', 'facts'] }), /依赖未按顺序执行/);
await assert.rejects(() => planningRunner.execute({ taskId: 'readonly', taskType: 'ordinary_interaction', moduleIds: ['facts', 'actions'] }), /不支持任务类型|禁止调用状态变更/);
const approvedRun = await planningRunner.execute({ taskId: 'approved-plan', taskType: 'explicit_action', moduleIds: validActionPlan.moduleIds, plan: validActionPlan, enabledModuleIds: ['facts', 'actions'] });
assert.equal(approvedRun.ok, true);
await assert.rejects(() => planningRunner.execute({ taskId: 'tampered-plan', taskType: 'explicit_action', moduleIds: ['actions'], plan: validActionPlan, enabledModuleIds: ['facts', 'actions'] }), /执行模块与已核准计划不一致/);
await assert.rejects(() => planningRunner.execute({ taskId: 'disabled-plan', taskType: 'explicit_action', moduleIds: ['facts', 'actions'], plan: validActionPlan, enabledModuleIds: ['facts'] }), /执行计划无效：module_disabled:actions/);
assert.throws(() => planningRunner.register({ id: 'unmet', dependsOn: ['missing'], run() {} }), /依赖未登记/);
runner.clear();
assert.deepEqual(runner.list(), []);
console.log('module runner tests passed');
