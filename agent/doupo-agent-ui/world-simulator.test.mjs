import assert from 'node:assert/strict';
import { createWorldSimulator } from './world-simulator.js';

const simulator = createWorldSimulator({ now: () => 'test-time' });
const common = { sessionId: 's1', branchId: 'b1', taskId: 'tick-1', stateVersion: 'v1', fromDay: 0, toDay: 3, state: { market: { stock: 10 }, route: { open: true } } };
const processes = [
  { id: 'delivery', sessionId: 's1', branchId: 'b1', stateVersion: 'v1', status: 'active', ruleVersion: 'r1', targetId: 'market', field: 'stock', dailyDelta: -2, startDay: 0, endDay: 10, reason: '既定运输消耗' },
  { id: 'leader-choice', sessionId: 's1', branchId: 'b1', stateVersion: 'v1', status: 'active', ruleVersion: 'r1', targetId: 'route', field: 'open', dailyDelta: 0, requiresIndividualDecision: true },
  { id: 'stale', sessionId: 's1', branchId: 'b1', stateVersion: 'v0', status: 'active', ruleVersion: 'r1', targetId: 'market', field: 'stock', dailyDelta: 100 },
  { id: 'other-branch', sessionId: 's1', branchId: 'branch-2', stateVersion: 'v1', status: 'active', ruleVersion: 'r1', targetId: 'market', field: 'stock', dailyDelta: 100 },
];
const result = simulator.advance({ ...common, processes });
assert.equal(result.status, 'partial');
assert.equal(result.proposals.length, 1);
assert.equal(result.proposals[0].after, 4);
assert.equal(result.proposals[0].elapsedDays, 3);
assert.equal(result.proposals[0].committed, false);
assert.equal(result.proposals[0].ruleVersion, 'r1');
assert.deepEqual(result.proposals[0].evidenceIds, []);
assert.deepEqual(result.conflicts.map(x => x.reason), ['individual_decision_required', 'state_version_mismatch', 'scope_mismatch']);
assert.equal(simulator.advance({ ...common, processes }).replayed, true);
assert.equal(simulator.advance({ ...common, stateVersion: 'v2', processes }).status, 'stale_or_conflicting_retry');
assert.equal(simulator.advance({ ...common, branchId: 'b2', taskId: 'other', processes }).proposals.length, 0);
assert.throws(() => simulator.advance({ ...common, toDay: 600, processes: [] }), /超出上限/);
assert.throws(() => simulator.advance({ ...common, fromDay: 5, toDay: 4, processes: [] }), /递增/);
const nonnegative = simulator.advance({ ...common, taskId: 'tick-2', state: { market: { stock: 2 } }, processes: [{ ...processes[0], dailyDelta: -2 }] });
assert.equal(nonnegative.status, 'needs_review');
assert.equal(nonnegative.conflicts[0].reason, 'would_be_negative');
const unversioned = simulator.advance({ ...common, taskId: 'tick-3', processes: [{ ...processes[0], ruleVersion: undefined }] });
assert.equal(unversioned.conflicts[0].reason, 'missing_rule_version');
const interval = simulator.advance({ ...common, taskId: 'tick-4', fromDay: 2, toDay: 5, processes: [{ ...processes[0], startDay: 0, endDay: 4, evidenceIds: ['book-chapter-12'] }] });
assert.equal(interval.proposals[0].elapsedDays, 2);
assert.deepEqual(interval.proposals[0].evidenceIds, ['book-chapter-12']);
assert.throws(() => simulator.advance({ ...common, taskId: 'tick-5', processes: [{ ...processes[0], evidenceIds: [''] }] }), /evidenceIds/);
const duplicate = simulator.advance({ ...common, taskId: 'tick-6', processes: [processes[0], { ...processes[0], dailyDelta: -1 }] });
assert.equal(duplicate.status, 'partial');
assert.equal(duplicate.proposals.length, 1);
assert.equal(duplicate.conflicts[0].reason, 'duplicate_process_id');
console.log('world simulator tests passed');
