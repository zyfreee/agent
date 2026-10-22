import assert from 'node:assert/strict';
import { createModuleRunner } from './module-runner.js';
import { registerAgentModules } from './agent-modules.js';

const calls = [];
const runner = createModuleRunner({ updateTask() {} });
const registration = registerAgentModules(runner, {
    facts: { query: input => { calls.push(['facts', input.query]); return { status: 'supported', results: [] }; } },
    actions: { resolve: input => { calls.push(['actions', input.actionId]); return { status: 'candidate', committed: false }; } },
    world: { advance: input => { calls.push(['world', input.taskId]); return { status: 'candidate', committed: false }; } },
});
assert.deepEqual(registration.registered, ['facts-query', 'action-resolve', 'world-advance']);
assert.equal(runner.plan({ taskType: 'ordinary_interaction', requestedModuleIds: ['facts-query'], enabledModuleIds: ['facts-query'] }).status, 'planned');
assert.equal(runner.plan({ taskType: 'ordinary_interaction', requestedModuleIds: ['action-resolve'], enabledModuleIds: ['action-resolve'] }).reason, 'task_not_supported:action-resolve');
const plan = runner.plan({ taskType: 'explicit_action', requestedModuleIds: ['action-resolve'], enabledModuleIds: ['action-resolve'] });
const executed = await runner.execute({ taskId: 'adapter-task', taskType: 'explicit_action', moduleIds: plan.moduleIds, plan, enabledModuleIds: ['action-resolve'], input: { actionId: 'a-1' } });
assert.equal(executed.ok, true);
assert.equal(executed.results[0].value.result.committed, false);
assert.deepEqual(calls, [['actions', 'a-1']]);
const disabledActionPlan = runner.plan({ taskType: 'ordinary_interaction', requestedModuleIds: ['facts-query'], enabledModuleIds: ['facts-query'] });
assert.equal(disabledActionPlan.status, 'planned');
const noActionScope = runner.plan({ taskType: 'time_advance', requestedModuleIds: ['world-advance'], enabledModuleIds: ['facts-query', 'world-advance'] });
assert.equal(noActionScope.status, 'planned');
const invalidInput = await runner.execute({ taskId: 'bad-input', taskType: 'ordinary_interaction', moduleIds: ['facts-query'], input: 'raw text' });
assert.equal(invalidInput.ok, false);
assert.match(invalidInput.results[0].error, /需要结构化 input/);
registration.dispose();
assert.deepEqual(runner.list(), []);

const rollbackRunner = createModuleRunner({ updateTask() {} });
rollbackRunner.register({ id: 'facts-query', run() {} });
assert.throws(() => registerAgentModules(rollbackRunner, { facts: { query() {} } }), /模块已登记/);
assert.deepEqual(rollbackRunner.list().map(module => module.id), ['facts-query']);
console.log('agent module adapter tests passed');
