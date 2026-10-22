import assert from 'node:assert/strict';
import { createQualityGate } from './quality-gate.js';
import { createDataContractRegistry } from './data-contract.js';
const gate = createQualityGate();
const contracts = createDataContractRegistry();
contracts.register({ id: 'player', kind: 'character', name: '玩家', creator: 'player', writer: 'state', readers: ['player', 'ui'], version: 'v1', fields: [{ id: 'hp', type: 'number', writer: 'actions', missingMeaning: '未初始化' }] });
const contractedGate = createQualityGate({ contracts });
const contractedChange = { id: 'hp-1', sessionId: 's', branchId: 'b', stateVersion: 'v1', type: 'set', targetId: 'player', field: 'hp', writer: 'actions', value: 9 };
const base = { sessionId: 's', branchId: 'b', stateVersion: 'v1', allowedPlayerActions: ['door:open'], visibleFactIds: ['f1'], approvedChangeIds: ['c1'] };
const ok = gate.review({ ...base, changes: [{ id: 'c1', sessionId: 's', branchId: 'b', stateVersion: 'v1', type: 'set', targetId: 'door', field: 'open', origin: 'player', playerAction: true, actionTargetId: 'door', actionMethod: 'open' }], claims: [{ id: 'claim-1', kind: 'fact', factIds: ['f1'] }, { id: 'claim-2', kind: 'fact', changeId: 'c1', factIds: ['f1'] }] });
assert.equal(ok.status, 'candidate');
assert.equal(ok.committed, false);
assert.equal(ok.acceptedChanges.length, 1);
const hidden = gate.review({ ...base, changes: [], claims: [{ id: 'h', kind: 'fact', factIds: ['secret'] }] });
assert.equal(hidden.status, 'candidate');
assert.equal(hidden.issues[0].code, 'claim_uses_hidden_fact');
const wrongVersion = gate.review({ ...base, changes: [{ id: 'c2', sessionId: 's', branchId: 'b', stateVersion: 'v0', type: 'set', targetId: 'door', field: 'open' }] });
assert.equal(wrongVersion.status, 'needs_review');
assert.equal(wrongVersion.acceptedChanges.length, 0);
const unauthorized = gate.review({ ...base, changes: [{ id: 'c3', sessionId: 's', branchId: 'b', stateVersion: 'v1', type: 'set', targetId: 'door', field: 'open', origin: 'player', playerAction: true, actionTargetId: 'door', actionMethod: 'break' }] });
assert.equal(unauthorized.issues[0].code, 'player_action_outside_authorization');
const collision = gate.review({ ...base, changes: [
 { id: 'a', sessionId: 's', branchId: 'b', stateVersion: 'v1', type: 'set', targetId: 'player', field: 'hp' },
 { id: 'b', sessionId: 's', branchId: 'b', stateVersion: 'v1', type: 'add', targetId: 'player', field: 'hp' },
] });
assert.equal(collision.issues[0].code, 'multiple_writers_same_field');
assert.throws(() => gate.review({ ...base, changes: [{}], claims: {}, visibleFactIds: [] }), /必须是数组/);
assert.equal(contractedGate.review({ ...base, changes: [contractedChange] }).status, 'candidate');
assert.equal(contractedGate.review({ ...base, changes: [{ ...contractedChange, writer: 'world' }] }).issues[0].code, 'unauthorized_field_writer');
assert.equal(contractedGate.review({ ...base, changes: [{ ...contractedChange, value: '9' }] }).issues[0].code, 'contract_value_invalid');
assert.equal(contractedGate.review({ ...base, changes: [{ ...contractedChange, field: 'mana' }] }).issues[0].code, 'unregistered_contract_field');
console.log('quality gate tests passed');
