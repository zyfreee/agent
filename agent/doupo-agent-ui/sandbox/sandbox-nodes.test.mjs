import assert from 'node:assert/strict';
import { createSandboxNodes } from './sandbox-nodes.js';

const scope = { sessionId: 's1', branchId: 'b1' };
const nodes = createSandboxNodes({ now: () => '2026-01-01T00:00:00.000Z' });

assert.equal(nodes.register({ ...scope, id: 'n1', title: '测验开始', kind: 'canon', fromDay: 10, toDay: 12, preconditions: [{ factId: 'f-sect-open' }], drift: '改由长老主持', participants: ['萧炎'] }).status, 'registered');
assert.throws(() => nodes.register({ ...scope, id: 'n1', title: '重复', fromDay: 1 }), /已登记/);
assert.throws(() => nodes.register({ ...scope, id: 'n2', title: '时间反了', fromDay: 9, toDay: 3 }), /时间窗口/);
assert.throws(() => nodes.register({ ...scope, id: 'n3', title: '类型错', kind: 'weird', fromDay: 1 }), /节点类型/);

assert.equal(nodes.get('n1').state, 'candidate');
assert.equal(nodes.list(scope).length, 1);
assert.equal(nodes.list({ sessionId: 's1', branchId: 'b2' }).length, 0);

const early = nodes.evaluate({ ...scope, day: 5, facts: ['f-sect-open'] });
assert.equal(early.status, 'candidate');
assert.equal(early.proposals.length, 0, '窗口未到的节点不产生候选');

const missing = nodes.evaluate({ ...scope, day: 11, facts: [] });
assert.equal(missing.status, 'needs_review');
assert.deepEqual(missing.conflicts[0].missing, ['f-sect-open']);
assert.equal(missing.conflicts[0].reason, 'precondition_missing');
assert.equal(missing.updates[0].toState, 'precondition_missing');
assert.equal(nodes.get('n1').state, 'candidate', '判定本身不写状态');

const weak = nodes.evaluate({ ...scope, day: 12, facts: ['f-sect-open'], mode: 'sandbox', inertia: 'weak' });
assert.equal(weak.proposals.length, 0);
assert.equal(weak.conflicts[0].reason, 'weak_inertia_skips_canon');

const medium = nodes.evaluate({ ...scope, day: 11, facts: ['f-sect-open'], mode: 'sandbox', inertia: 'medium' });
assert.equal(medium.proposals.length, 0, '中惯性要等窗口结束');
const mediumFires = nodes.evaluate({ ...scope, day: 12, facts: ['f-sect-open'], mode: 'sandbox', inertia: 'medium' });
assert.equal(mediumFires.proposals.length, 1);
assert.equal(mediumFires.proposals[0].toState, 'occurred');
assert.equal(mediumFires.proposals[0].committed, false);
assert.equal(mediumFires.proposals[0].drift, '改由长老主持');

const strong = nodes.evaluate({ ...scope, day: 10, facts: ['f-sect-open'], mode: 'sandbox', inertia: 'strong' });
assert.equal(strong.proposals.length, 1, '强惯性按窗口起点判定');

const mainline = nodes.evaluate({ ...scope, day: 12, facts: ['f-sect-open'], mode: 'mainline', inertia: 'weak' });
assert.equal(mainline.proposals.length, 1);
assert.equal(mainline.proposals[0].forced, true);

const applied = nodes.apply({ ...scope, taskId: 't1', stateVersion: 'v2', updates: [{ nodeId: 'n1', toState: 'occurred', day: 12 }] });
assert.equal(applied.status, 'applied');
assert.equal(nodes.get('n1').state, 'occurred');
assert.equal(nodes.get('n1').history[0].taskId, 't1');

const relive = nodes.apply({ ...scope, taskId: 't2', stateVersion: 'v3', updates: [{ nodeId: 'n1', toState: 'altered', day: 13 }] });
assert.equal(relive.status, 'rejected');
assert.equal(relive.conflicts[0].reason, 'illegal_transition');
assert.equal(nodes.get('n1').state, 'occurred', '终态不得被正文改写成另一种结果');

assert.equal(nodes.intervene({ ...scope, nodeId: 'n1', day: 13 }).status, 'rejected');

nodes.register({ ...scope, id: 'n4', title: '坊市集日', kind: 'routine', fromDay: 20, toDay: 20 });
const routine = nodes.evaluate({ ...scope, day: 20, facts: [], mode: 'sandbox', inertia: 'weak' });
assert.equal(routine.proposals.length, 1, '例行过程不受弱惯性影响');
assert.equal(routine.proposals[0].kind, 'routine');

const expired = nodes.evaluate({ ...scope, day: 40, facts: ['f-sect-open'], mode: 'mainline', inertia: 'medium', slackDays: 7 });
assert.equal(expired.proposals[0].toState, 'expired');
assert.equal(expired.proposals[0].reason, 'window_passed');

nodes.register({ ...scope, id: 'n5', title: '可介入节点', fromDay: 30, toDay: 32, preconditions: [{ factId: 'f-sect-open' }] });
const intervention = nodes.intervene({ ...scope, nodeId: 'n5', day: 30, reason: '玩家提前拆台' });
assert.equal(intervention.status, 'candidate');
assert.equal(intervention.update.toState, 'altered');
assert.equal(nodes.apply({ ...scope, taskId: 't3', stateVersion: 'v4', updates: [intervention.update] }).status, 'applied');

assert.throws(() => nodes.evaluate({ ...scope, day: -1 }), /day/);
assert.throws(() => nodes.evaluate({ ...scope, day: 1, slackDays: 400 }), /slackDays/);
assert.throws(() => nodes.register({ ...scope, id: 'n6', title: '缺前提类型', fromDay: 1, preconditions: [{}] }), /factId/);
console.log('sandbox nodes tests passed');
