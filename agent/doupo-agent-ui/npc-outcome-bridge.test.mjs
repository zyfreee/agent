import assert from 'node:assert/strict';
import { createNpcOutcomeBridge } from './npc-outcome-bridge.js';
import { createActionResolver } from './action-resolver.js';
import { createWorldSimulator } from './world-simulator.js';
import { createNpcConflictCoordinator } from './npc-conflict.js';

const bridge = createNpcOutcomeBridge({ actionResolver: createActionResolver(), worldSimulator: createWorldSimulator() });
const coordinator = createNpcConflictCoordinator();
const coordination = coordinator.coordinate({ sessionId: 's1', branchId: 'b1', stateVersion: 'v1', decisionKey: 'guard', decisions: [{ npcId: 'captain', intent: 'guard', targetId: 'gate', method: 'guard', authority: { allowed: true } }] });
const action = bridge.toActionCandidates({ coordination, actionDefaults: { method: 'guard' }, rules: [{ id: 'guard-rule', version: '1', targetId: 'gate', method: 'guard', conditions: [], effects: [{ type: 'set', field: 'guarded', value: true }], outcome: 'achieved', elapsed: 1 }], state: { gate: { guarded: false } } });
assert.equal(action.status, 'candidate');
assert.equal(action.candidates[0].committed, false);
const unresolved = bridge.toActionCandidates({ coordination: { ...coordination, status: 'needs_review' }, rules: [], state: {} });
assert.equal(unresolved.reason, 'coordination_not_final');
const world = bridge.toWorldCandidates({ coordination: { ...coordination, outcomes: [{ ...coordination.outcomes[0], decision: { ...coordination.outcomes[0].decision, process: { id: 'guard-process' } } }] }, worldContext: { taskId: 't1', fromDay: 1, toDay: 2, state: { gate: { alert: 0 } } }, processes: [{ id: 'guard-process', sessionId: 's1', branchId: 'b1', stateVersion: 'v1', status: 'active', ruleVersion: '1', targetId: 'gate', field: 'alert', dailyDelta: 1 }] });
assert.equal(world.status, 'candidate');
assert.equal(world.candidates[0].committed, false);
console.log('NPC outcome bridge tests passed');
