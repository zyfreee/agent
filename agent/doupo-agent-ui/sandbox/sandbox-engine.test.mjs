import assert from 'node:assert/strict';
import { createSandboxNodes } from './sandbox-nodes.js';
import { createSandboxLeads } from './sandbox-leads.js';
import { createSandboxGoals } from './sandbox-goals.js';
import { createSandboxEngine } from './sandbox-engine.js';

const scope = { sessionId: 's1', branchId: 'b1' };
const nodes = createSandboxNodes();
const leads = createSandboxLeads();
const goals = createSandboxGoals();
const engine = createSandboxEngine({ nodes, goals, leads, maxProposals: 1, now: () => '2026-01-01T00:00:00.000Z' });

const skipped = engine.advance({ ...scope, day: 1 });
assert.equal(skipped.status, 'skipped');
assert.deepEqual(skipped.missing, ['taskId', 'stateVersion']);
assert.equal(skipped.committed, false);
const badDay = engine.advance({ ...scope, taskId: 't1', stateVersion: 'v1', day: -1 });
assert.equal(badDay.reason, 'insufficient_input');
assert.deepEqual(badDay.missing, ['day']);

nodes.register({ ...scope, id: 'n1', title: '测验', fromDay: 10, toDay: 12 });
nodes.register({ ...scope, id: 'n2', title: '坊市', kind: 'routine', fromDay: 11, toDay: 11 });
leads.add({ ...scope, kind: 'commission', text: '护送商队', source: { name: '商会' }, issuer: '米特尔', deadlineDay: 5 });

const quiet = engine.advance({ ...scope, taskId: 't0', stateVersion: 'v1', day: 3 });
assert.equal(quiet.status, 'empty');
assert.equal(quiet.proposals.length, 0);
assert.equal(quiet.committed, false);

const first = engine.advance({ ...scope, taskId: 't1', stateVersion: 'v1', day: 11 });
assert.equal(first.status, 'partial', '两个候选超出预算一条');
assert.equal(first.proposals.length, 1);
assert.equal(first.budget.dropped, 1);
assert.ok(first.conflicts.some(item => item.reason === 'proposal_budget_exceeded'));
assert.equal(first.openGoals, 0);
assert.equal(first.mode, 'sandbox');
assert.equal(first.inertia, 'medium');

const replay = engine.advance({ ...scope, taskId: 't1', stateVersion: 'v1', day: 11 });
assert.equal(replay.replayed, true);
assert.equal(replay.proposals.length, first.proposals.length);

const stale = engine.advance({ ...scope, taskId: 't1', stateVersion: 'v2', day: 11 });
assert.equal(stale.status, 'stale_or_conflicting_retry');
assert.equal(stale.proposals.length, 0);

const reworked = engine.advance({ ...scope, taskId: 't2', stateVersion: 'v2', day: 12, mode: 'mainline' });
assert.equal(reworked.mode, 'mainline');
assert.ok(reworked.proposals.every(item => item.committed === false));

const unknown = engine.advance({ ...scope, taskId: 't3', stateVersion: 'v2', day: 12, mode: 'nonsense', inertia: 'nonsense' });
assert.equal(unknown.mode, 'mainline');
assert.equal(unknown.inertia, 'medium');

assert.equal(engine.invalidate({ ...scope, taskId: 't1' }), true);
assert.equal(engine.advance({ ...scope, taskId: 't1', stateVersion: 'v1', day: 11 }).replayed, undefined);
engine.clear();
assert.equal(engine.advance({ ...scope, taskId: 't1', stateVersion: 'v1', day: 11 }).replayed, undefined);

const scoped = engine.advance({ sessionId: 's2', branchId: 'b1', taskId: 't9', stateVersion: 'v1', day: 11 });
assert.equal(scoped.proposals.length, 0, '其他会话分支不共享节点');

const bare = createSandboxEngine();
assert.equal(bare.advance({ ...scope, taskId: 't1', stateVersion: 'v1', day: 1 }).status, 'empty');
console.log('sandbox engine tests passed');
