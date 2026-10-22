import assert from 'node:assert/strict';
import { createNpcConflictCoordinator } from './npc-conflict.js';
const coordinator = createNpcConflictCoordinator();
const base = { sessionId: 's1', branchId: 'b1', stateVersion: 'v1', decisionKey: 'route', decisions: [
    { npcId: 'captain', intent: 'accept', targetId: 'route', authority: { allowed: true, rank: 10, represents: ['scout'] } },
    { npcId: 'scout', intent: 'refuse', targetId: 'route', authority: { allowed: true, rank: 1 } },
] };
const coordinated = coordinator.coordinate(base);
assert.equal(coordinated.status, 'coordinated');
assert.equal(coordinated.outcomes[0].decision.npcId, 'captain');
assert.equal(coordinated.outcomes[0].authorityOverride, true);
const equal = coordinator.coordinate({ ...base, decisions: base.decisions.map(item => ({ ...item, authority: { ...item.authority, rank: 10, represents: [] } })) });
assert.equal(equal.status, 'needs_review');
assert.equal(equal.outcomes[0].reason, 'conflicting_equal_authority');
const noAuthority = coordinator.coordinate({ ...base, decisions: [{ npcId: 'scout', intent: 'accept', authority: { allowed: false } }] });
assert.equal(noAuthority.status, 'needs_review');
assert.equal(noAuthority.rejected[0].reason, 'missing_decision_authority');
const mismatch = coordinator.coordinate({ ...base, decisions: [{ npcId: 'captain', intent: 'accept', authority: { allowed: true, stateVersion: 'v0' } }] });
assert.equal(mismatch.rejected[0].reason, 'authority_state_mismatch');
console.log('NPC conflict coordinator tests passed');
