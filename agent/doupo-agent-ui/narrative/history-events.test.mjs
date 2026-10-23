import assert from 'node:assert/strict';
import { createHistoryEventAdapter } from '../narrative/history-events.js';
import { createTurnPipeline } from '../core/turn-pipeline.js';
import { createStateStore } from '../core/state-store.js';
import { createCommitRecovery } from '../core/commit-recovery.js';

const handlers = new Map();
const eventSource = {
    on: (name, fn) => handlers.set(name, [...(handlers.get(name) ?? []), fn]),
    removeListener: (name, fn) => handlers.set(name, (handlers.get(name) ?? []).filter(item => item !== fn)),
    emit: (name, ...args) => { for (const fn of handlers.get(name) ?? []) fn(...args); },
};
const events = { MESSAGE_EDITED: 'edited', MESSAGE_UPDATED: 'updated', MESSAGE_SWIPED: 'swiped', MESSAGE_SWIPE_DELETED: 'swipe_deleted', MESSAGE_DELETED: 'deleted', CHAT_CHANGED: 'chat_changed' };
const pending = createTurnPipeline({ stages: { compose: async ({ signal }) => new Promise(resolve => signal.addEventListener('abort', () => resolve('late'), { once: true })) } });
const input = { sessionId: 'chat-a', branchId: 'branch-a', triggerMessageId: '12', stateVersion: 'v1', playerInput: '行动', allowedPlayerActions: [] };
const run = pending.run({ ...input, taskId: 'pending-12' });
await new Promise(resolve => setTimeout(resolve, 0));
let scope = { sessionId: 'chat-a', branchId: 'branch-a', taskIds: ['pending-12'] };
const unresolved = [];
const invalidated = [];
const invalidatedCandidates = [];
const adapter = createHistoryEventAdapter({ eventSource, eventTypes: events, pipeline: pending, getScope: () => scope, onUnresolved: item => unresolved.push(item), onInvalidated: item => invalidated.push(item), invalidateCandidate: item => { invalidatedCandidates.push(item); return { status: 'invalidated', requestId: item.requestId, reason: item.reason }; } });
assert.deepEqual(adapter.start(), { status: 'active', eventCount: 6 });
assert.equal(adapter.start().status, 'already_active');
eventSource.emit('edited', { messageId: 99 });
assert.equal(pending.inspect('pending-12').status, 'processing');
scope = undefined;
eventSource.emit('edited', { messageId: 12 });
assert.equal(pending.inspect('pending-12').status, 'invalidated');
scope = { sessionId: 'chat-a', branchId: 'branch-a', taskIds: ['pending-12'] };
eventSource.emit('edited', { messageId: 12 });
assert.equal((await run).status, 'invalidated');
assert.deepEqual(adapter.invalidatedTaskIds, ['pending-12']);
assert.equal(invalidated.at(-1).taskId, 'pending-12');
assert.equal(invalidated.at(-1).event, 'MESSAGE_EDITED');
assert.equal(invalidatedCandidates.at(-1).requestId, 'pending-12');
assert.equal(invalidatedCandidates.at(-1).reason, 'trigger_message_changed');
eventSource.emit('updated', {});
assert.equal(pending.inspect('pending-12').status, 'invalidated');
eventSource.emit('deleted', { messageId: '12' });
assert.deepEqual(adapter.invalidatedTaskIds, ['pending-12']);
assert.equal(adapter.stop().status, 'stopped');
assert.equal([...handlers.values()].reduce((count, listeners) => count + listeners.filter(listener => typeof listener === 'function').length, 0), 0);
assert.equal(adapter.start().status, 'active');
adapter.stop();

const candidatePipe = createTurnPipeline({ stages: { adjudicate: () => ({ nextState: { hp: 1 } }) } });
await candidatePipe.run({ ...input, taskId: 'candidate-13', triggerMessageId: '13' });
scope = { sessionId: 'chat-a', branchId: 'branch-a', taskIds: ['candidate-13'] };
const candidateAdapter = createHistoryEventAdapter({ eventSource, eventTypes: events, pipeline: candidatePipe, getScope: () => scope });
candidateAdapter.start();
eventSource.emit('deleted', [13]);
assert.equal(candidatePipe.inspect('candidate-13').status, 'invalidated');
assert.equal(candidatePipe.commitCandidate({ candidate: { taskId: 'candidate-13', sessionId: 'chat-a', branchId: 'branch-a', baseStateVersion: 'v1', stageResults: { adjudicate: { nextState: { hp: 1 } } } }, messageId: 'host-msg' }).reason, 'candidate_invalidated');
candidateAdapter.stop();

const branchPipe = createTurnPipeline({ stages: { compose: async ({ signal }) => new Promise(resolve => signal.addEventListener('abort', () => resolve('late'), { once: true })) } });
const branchRun = branchPipe.run({ ...input, taskId: 'old-branch-task' });
await new Promise(resolve => setTimeout(resolve, 0));
let branchScope = { sessionId: 'chat-a', branchId: 'branch-a', taskIds: ['old-branch-task'] };
const branchAdapter = createHistoryEventAdapter({ eventSource, eventTypes: events, pipeline: branchPipe, getScope: () => branchScope });
branchAdapter.start();
branchScope = { sessionId: 'chat-a', branchId: 'branch-b', taskIds: [] };
eventSource.emit('chat_changed');
assert.deepEqual(branchAdapter.refreshScope(), { status: 'refreshed' });
assert.equal((await branchRun).status, 'invalidated');
assert.deepEqual(branchAdapter.invalidatedTaskIds, ['old-branch-task']);
branchAdapter.stop();

const committedStore = createStateStore(); committedStore.seed({ sessionId: 'chat-a', branchId: 'branch-a', state: { hp: 2 } });
const committedRecovery = createCommitRecovery({ stateStore: committedStore });
const committedPipe = createTurnPipeline({ commitRecovery: committedRecovery, stages: { adjudicate: () => ({ nextState: { hp: 1 } }) } });
const committedResult = await committedPipe.run({ ...input, taskId: 'committed-14', triggerMessageId: '14' });
committedPipe.commitCandidate({ candidate: committedResult.candidate, messageId: 'msg-14' });
committedPipe.confirmMessageAndCommit({ taskId: 'committed-14', messageId: 'msg-14', observed: true });
const committedInvalidation = committedPipe.invalidate('committed-14');
assert.equal(committedInvalidation.status, 'already_committed');
const historyCommitScope = { sessionId: 'chat-a', branchId: 'branch-a', taskIds: ['committed-14'] };
const committedHistoryAdapter = createHistoryEventAdapter({ eventSource, eventTypes: events, pipeline: committedPipe, getScope: () => historyCommitScope, onUnresolved: item => unresolved.push(item) });
committedHistoryAdapter.start();
eventSource.emit('edited', { messageId: 14 });
assert.equal(unresolved.at(-1).event, 'history_changed_after_commit');
committedHistoryAdapter.stop();
assert.equal(committedInvalidation.requires_history_recovery, true);

console.log('history event adapter tests passed');
