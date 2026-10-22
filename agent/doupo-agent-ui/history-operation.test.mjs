import assert from 'node:assert/strict';
import { classifyHistoryOperation, classifyMappedHistoryOperation } from './history-operation.js';

const base = { operationId: 'op-1', sessionId: 'chat-1', branchId: 'branch-1', messageId: '12', stateVersion: 'v3', mappingEvidence: 'host test fixture v1' };
const rewrite = classifyHistoryOperation({ ...base, operation: 'rewrite' });
assert.equal(rewrite.status, 'classified');
assert.equal(rewrite.preservesOutcome, true);
assert.equal(rewrite.preservesRandomResults, true);
assert.equal(rewrite.committed, false);
const reevaluate = classifyHistoryOperation({ ...base, operation: 'reevaluate' });
assert.equal(reevaluate.status, 'classified');
assert.equal(reevaluate.preservesOutcome, false);
assert.equal(reevaluate.preservesRandomResults, false);
for (const operation of ['swipe', 'regenerate', 'MESSAGE_SWIPED', undefined]) {
    assert.deepEqual(classifyHistoryOperation({ ...base, operation }), { status: 'unsupported', reason: 'operation_not_explicitly_mapped' });
}
assert.equal(classifyHistoryOperation({ ...base, operation: 'rewrite', branchId: '' }).reason, 'missing_or_invalid_branchId');
const map = { verified_rewrite: 'rewrite', verified_regenerate: 'reevaluate' };
assert.equal(classifyMappedHistoryOperation({ eventName: 'MESSAGE_SWIPED', eventPayload: { messageId: 12 }, eventMap: map, context: base, mappingEvidence: 'host test fixture v1' }).status, 'unsupported');
assert.equal(classifyMappedHistoryOperation({ eventName: 'verified_rewrite', eventPayload: { messageId: 12 }, eventMap: map, context: base, mappingEvidence: 'host test fixture v1' }).status, 'classified');
assert.equal(classifyMappedHistoryOperation({ eventName: 'verified_rewrite', eventPayload: {}, eventMap: map, context: base, mappingEvidence: 'host test fixture v1' }).reason, 'message_id_unrecognized');
assert.equal(classifyMappedHistoryOperation({ eventName: 'verified_rewrite', eventPayload: { index: 12 }, eventMap: map, context: { ...base, stateVersion: undefined }, mappingEvidence: 'host test fixture v1' }).reason, 'missing_or_invalid_stateVersion');
console.log('history operation classifier tests passed');
