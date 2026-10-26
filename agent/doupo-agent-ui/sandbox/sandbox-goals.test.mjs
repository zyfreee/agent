import assert from 'node:assert/strict';
import { createSandboxGoals } from './sandbox-goals.js';

const scope = { sessionId: 's1', branchId: 'b1' };
const goals = createSandboxGoals({ maxActive: 2, now: () => '2026-01-01T00:00:00.000Z' });

assert.throws(() => goals.propose({ ...scope, description: '' }), /目标描述/);
assert.throws(() => goals.propose({ ...scope, description: '找到异火' }), /可行性/);

const infeasible = goals.propose({ ...scope, description: '直接挑战斗圣', feasibility: { ok: false, missing: ['没有任何接触渠道', '实力差距过大'] } });
assert.equal(infeasible.status, 'rejected');
assert.equal(infeasible.reason, 'infeasible');
assert.equal(infeasible.missing.length, 2);

const first = goals.propose({ ...scope, description: '查到净莲妖火的下落', feasibility: { ok: true } });
assert.equal(first.status, 'candidate');
assert.equal(first.committed, false);
assert.equal(first.goal.state, 'proposed');

assert.equal(goals.activate({ goalId: first.goal.id }).goal.state, 'active');
assert.equal(goals.activate({ goalId: first.goal.id }).status, 'rejected');

const second = goals.propose({ ...scope, description: '进入迦南学院', feasibility: { ok: true } });
assert.equal(goals.activate({ goalId: second.goal.id }).goal.state, 'active');
const third = goals.propose({ ...scope, description: '第三件事', feasibility: { ok: true } });
assert.equal(third.reason, 'goal_limit_reached');
assert.deepEqual(third.active, [first.goal.id, second.goal.id]);
assert.equal(goals.activeCount(scope), 2);

assert.equal(goals.resolve({ goalId: first.goal.id, outcome: 'achieved' }).reason, 'evidence_required');
const achieved = goals.resolve({ goalId: first.goal.id, outcome: 'achieved', evidence: ['卷三·交易行对话已确认'] });
assert.equal(achieved.goal.state, 'achieved');
assert.deepEqual(achieved.goal.evidence, ['卷三·交易行对话已确认']);
assert.equal(goals.activeCount(scope), 1);
assert.equal(goals.resolve({ goalId: first.goal.id, outcome: 'failed', evidence: ['x'] }).reason, 'illegal_transition');

assert.throws(() => goals.resolve({ goalId: second.goal.id, outcome: 'cancelled' }), /outcome/);

const dropped = goals.drop({ goalId: second.goal.id, reason: '玩家改主意了' });
assert.equal(dropped.goal.state, 'dropped');
assert.equal(goals.activeCount(scope), 0);

const superseded = goals.supersede({ goalId: second.goal.id, replacedBy: '新目标' });
assert.equal(superseded.status, 'rejected', '已放弃的目标不能再被取代');
const spare = goals.propose({ ...scope, description: '先挂着的事', feasibility: { ok: true } });
const replaced = goals.supersede({ goalId: spare.goal.id, replacedBy: '更紧急的事' });
assert.equal(replaced.goal.state, 'superseded');
assert.match(replaced.goal.history[0].reason, /取代/);

const scoped = goals.propose({ sessionId: 's1', branchId: 'b2', description: '另一个分支的目标', feasibility: { ok: true } });
assert.equal(scoped.status, 'candidate');
assert.equal(goals.list({ sessionId: 's1', branchId: 'b2' }).length, 1);
assert.equal(goals.list(scope).length, 3);

assert.equal(goals.transition({ goalId: 'goal-999', toState: 'active' }).reason, 'unknown_goal');
assert.throws(() => goals.transition({ goalId: first.goal.id, toState: 'weird' }), /目标状态/);

goals.clear();
assert.equal(goals.list(scope).length, 0);
console.log('sandbox goals tests passed');
