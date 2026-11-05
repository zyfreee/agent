import assert from 'node:assert/strict';
import { createStateStore } from '../core/state-store.js';
import { createCommitRecovery } from '../core/commit-recovery.js';

const state = createStateStore();
state.seed({ sessionId: 's', branchId: 'b', stateVersion: 'v1', state: { hp: 10 } });
const recovery = createCommitRecovery({ stateStore: state });
const proposal = { sessionId: 's', branchId: 'b', baseVersion: 'v1', commitId: 'c1', messageId: 'm1', candidate: { nextState: { hp: 7 }, changes: [{ damage: 3 }] } };
assert.equal(recovery.prepare(proposal).status, 'prepared');
assert.equal(recovery.commit({ sessionId: 's', branchId: 'b', commitId: 'c1' }).status, 'save_uncertain');
assert.equal(recovery.markMessage({ sessionId: 's', branchId: 'b', commitId: 'c1', messageId: 'wrong', observed: true }).status, 'message_mismatch');
assert.equal(recovery.markMessage({ sessionId: 's', branchId: 'b', commitId: 'c1', messageId: 'm1', observed: true }).status, 'message_observed');
assert.equal(recovery.commit({ sessionId: 's', branchId: 'b', commitId: 'c1' }).status, 'committed');
assert.equal(state.read({ sessionId: 's', branchId: 'b' }).state.hp, 7);
assert.equal(recovery.commit({ sessionId: 's', branchId: 'b', commitId: 'c1' }).status, 'duplicate_commit');
assert.equal(recovery.cancel({ sessionId: 's', branchId: 'b', commitId: 'c1' }).status, 'already_committed');

state.seed({ sessionId: 's', branchId: 'cancel', stateVersion: 'v1', state: {} });
const cancelRecovery = createCommitRecovery({ stateStore: state });
cancelRecovery.prepare({ ...proposal, branchId: 'cancel', commitId: 'c2', messageId: 'm2' });
assert.equal(cancelRecovery.cancel({ sessionId: 's', branchId: 'cancel', commitId: 'c2' }).status, 'cancelled');
assert.equal(cancelRecovery.commit({ sessionId: 's', branchId: 'cancel', commitId: 'c2' }).status, 'cancelled');
assert.equal(cancelRecovery.reconcile({ sessionId: 's', branchId: 'cancel', commitId: 'c2', observedMessageIds: ['m2'] }).status, 'cancelled');

state.seed({ sessionId: 's', branchId: 'absent', stateVersion: 'v1', state: {} });
const absent = createCommitRecovery({ stateStore: state });
absent.prepare({ ...proposal, branchId: 'absent', commitId: 'c3', messageId: 'm3' });
assert.deepEqual(absent.reconcile({ sessionId: 's', branchId: 'absent', commitId: 'c3', observedMessageIds: [] }), { status: 'message_absent', retryAllowed: true });
assert.equal(absent.commit({ sessionId: 's', branchId: 'absent', commitId: 'c3' }).status, 'save_uncertain');

state.seed({ sessionId: 's', branchId: 'orphan', stateVersion: 'v1', state: {} });
const orphan = createCommitRecovery({ stateStore: state });
orphan.prepare({ ...proposal, branchId: 'orphan', commitId: 'c4', messageId: 'm4' });
orphan.markMessage({ sessionId: 's', branchId: 'orphan', commitId: 'c4', messageId: 'm4', observed: true });
assert.equal(orphan.reconcile({ sessionId: 's', branchId: 'orphan', commitId: 'c4', observedMessageIds: [] }).reason, 'previously_observed_message_missing');
assert.equal(orphan.commit({ sessionId: 's', branchId: 'orphan', commitId: 'c4' }).status, 'save_uncertain');

state.seed({ sessionId: 's', branchId: 'conflict', stateVersion: 'v1', state: {} });
const conflict = createCommitRecovery({ stateStore: state });
conflict.prepare({ ...proposal, branchId: 'conflict', commitId: 'c5', messageId: 'm5' });
conflict.markMessage({ sessionId: 's', branchId: 'conflict', commitId: 'c5', messageId: 'm5', observed: true });
state.commit({ sessionId: 's', branchId: 'conflict', baseVersion: 'v1', commitId: 'outside', candidate: { nextState: {} } });
assert.equal(conflict.commit({ sessionId: 's', branchId: 'conflict', commitId: 'c5' }).reason, 'stale_state');
// OPT-086: terminal records retire into bounded tombstones instead of saturating the journal.
state.seed({ sessionId: 's', branchId: 'saturate', stateVersion: 'v1', state: {} });
const saturate = createCommitRecovery({ stateStore: state, maxEntries: 1 });
assert.equal(saturate.prepare({ ...proposal, branchId: 'saturate', commitId: 'cA1', messageId: 'mA1' }).status, 'prepared');
assert.equal(saturate.cancel({ sessionId: 's', branchId: 'saturate', commitId: 'cA1' }).status, 'cancelled');
assert.equal(saturate.prepare({ ...proposal, branchId: 'saturate', commitId: 'cA2', messageId: 'mA2' }).status, 'prepared');
assert.equal(saturate.prepare({ ...proposal, branchId: 'saturate', commitId: 'cA1', messageId: 'mA1' }).status, 'duplicate_commit');
assert.equal(saturate.prepare({ ...proposal, branchId: 'saturate', commitId: 'cA1', messageId: 'mA1' }).stateVersion, null);
assert.equal(saturate.commit({ sessionId: 's', branchId: 'saturate', commitId: 'cA1' }).status, 'duplicate_commit');

state.seed({ sessionId: 's', branchId: 'retire', stateVersion: 'v1', state: {} });
const retire = createCommitRecovery({ stateStore: state, maxEntries: 1 });
retire.prepare({ ...proposal, branchId: 'retire', commitId: 'cB1', messageId: 'mB1' });
retire.markMessage({ sessionId: 's', branchId: 'retire', commitId: 'cB1', messageId: 'mB1', observed: true });
assert.equal(retire.commit({ sessionId: 's', branchId: 'retire', commitId: 'cB1' }).status, 'committed');
assert.equal(state.read({ sessionId: 's', branchId: 'retire' }).stateVersion, 'v2');
assert.equal(retire.prepare({ ...proposal, branchId: 'retire', commitId: 'cB2', messageId: 'mB2', baseVersion: 'v2' }).status, 'prepared');
const retiredHit = retire.prepare({ ...proposal, branchId: 'retire', commitId: 'cB1', messageId: 'mB1' });
assert.equal(retiredHit.status, 'duplicate_commit');
assert.equal(retiredHit.stateVersion, 'v2');
const retiredCommit = retire.commit({ sessionId: 's', branchId: 'retire', commitId: 'cB1' });
assert.equal(retiredCommit.status, 'duplicate_commit');
assert.equal(retiredCommit.stateVersion, 'v2');

state.seed({ sessionId: 's', branchId: 'uncertain', stateVersion: 'v1', state: {} });
const uncertain = createCommitRecovery({ stateStore: state, maxEntries: 1 });
uncertain.prepare({ ...proposal, branchId: 'uncertain', commitId: 'cC1', messageId: 'mC1' });
uncertain.markMessage({ sessionId: 's', branchId: 'uncertain', commitId: 'cC1', messageId: 'mC1', observed: true });
state.commit({ sessionId: 's', branchId: 'uncertain', baseVersion: 'v1', commitId: 'outside', candidate: { nextState: {} } });
assert.equal(uncertain.commit({ sessionId: 's', branchId: 'uncertain', commitId: 'cC1' }).status, 'save_uncertain');
assert.equal(uncertain.prepare({ ...proposal, branchId: 'uncertain', commitId: 'cC2', messageId: 'mC2' }).status, 'journal_full');
assert.equal(uncertain.inspect({ sessionId: 's', branchId: 'uncertain', commitId: 'cC1' }).phase, 'save_uncertain');

console.log('commit recovery tests passed');
