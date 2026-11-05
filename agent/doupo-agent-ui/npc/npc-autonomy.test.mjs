import assert from 'node:assert/strict';
import { createNpcAutonomyPlanner } from '../npc/npc-autonomy.js';

const planner = createNpcAutonomyPlanner({ maxNpcs: 2 });
const base = { sessionId: 's1', branchId: 'b1', taskId: 'turn-1', stateVersion: 'v1', event: { id: 'bridge-news', type: 'important_message', relatedNpcIds: ['captain', 'scout'], factIds: ['bridge-out'] }, npcs: [
    { id: 'captain', triggerTypes: ['important_message'], goalIds: ['protect_caravan'], knownFactIds: ['bridge-out'] },
    { id: 'scout', triggerTypes: ['important_message'], goalIds: ['report'], knownFactIds: ['bridge-out'] },
    { id: 'unrelated', triggerTypes: ['important_message'], goalIds: ['idle'] },
] };
const result = planner.plan(base);
assert.equal(result.status, 'planned');
assert.deepEqual(result.candidates.map(item => item.npcId), ['captain', 'scout']);
assert.equal(result.candidates[0].status, 'decision_required');
assert.equal(result.candidates[0].executed, false);
assert.deepEqual(result.candidates[0].decisionInput.knownFactIds, ['bridge-out']);
assert.equal(result.skipped.at(-1).reason, 'not_relevant');
const replay = planner.plan(base);
assert.equal(replay.candidates.length, 0);
assert.equal(replay.skipped[0].reason, 'duplicate_trigger');
const limited = createNpcAutonomyPlanner({ maxNpcs: 1 }).plan({ ...base, event: { ...base.event, id: 'new-event' } });
assert.equal(limited.candidates.length, 1);
assert.equal(limited.skipped[0].reason, 'npc_budget_exceeded');
assert.throws(() => planner.plan({ ...base, event: { id: 'bad', type: 'x', relatedNpcIds: [''] } }), /relatedNpcIds/);
const reviewedPlanner = createNpcAutonomyPlanner();
const reviewed = reviewedPlanner.plan({ ...base, event: { ...base.event, id: 'review-event' }, npcs: [base.npcs[0]] });
const reviewedCandidate = reviewed.candidates[0];
const guard = { review(input) { assert.equal(input.npcId, 'captain'); assert.deepEqual(input.envelope.knownFactIds, ['bridge-out']); return { status: 'decision_proposed', npcId: input.npcId, intent: input.proposal.intent }; } };
const accepted = reviewedPlanner.reviewCandidate({ candidate: reviewedCandidate, permission: { npcId: 'captain', allowed: true }, proposal: { intent: 'wait' }, decisionGuard: guard });
assert.equal(accepted.status, 'reviewed');
assert.equal(reviewedPlanner.getDecision({ sessionId: 's1', branchId: 'b1', stateVersion: 'v1', eventId: 'review-event', npcId: 'captain' }).intent, 'wait');
const rejected = reviewedPlanner.reviewCandidate({ candidate: reviewedCandidate, permission: { npcId: 'captain', allowed: true }, proposal: { intent: 'refuse' }, decisionGuard: { review: () => ({ status: 'blocked', reason: 'missing_decision_authority' }) } });
assert.equal(rejected.reason, 'missing_decision_authority');
assert.equal(reviewedPlanner.reviewCandidate({ candidate: { ...reviewedCandidate, eventId: 'expired' }, decisionGuard: guard }).reason, 'unknown_or_expired_candidate');
const changes = [];
const unsubscribe = reviewedPlanner.subscribePlanChanges(change => changes.push(change));
const registered = reviewedPlanner.registerPlan({ sessionId: 's1', branchId: 'b1', stateVersion: 'v1', npcId: 'captain', planId: 'escort', goal: '护送商队' });
assert.equal(registered.status, 'registered');
const unchanged = reviewedPlanner.registerPlan({ sessionId: 's1', branchId: 'b1', stateVersion: 'v1', npcId: 'captain', planId: 'escort', goal: '护送商队', version: 1 });
assert.equal(unchanged.status, 'updated');
const adjusted = reviewedPlanner.adjustPlan({ sessionId: 's1', branchId: 'b1', stateVersion: 'v1', npcId: 'captain', planId: 'escort', baseVersion: 2, reason: '道路封锁', goal: '改走北路', evidence: { factIds: ['bridge-out'], summary: '已确认桥梁损毁' } });
assert.equal(adjusted.status, 'adjusted');
assert.equal(adjusted.plan.lastChange, '道路封锁');
assert.equal(reviewedPlanner.transitionPlan({ sessionId: 's1', branchId: 'b1', stateVersion: 'v1', npcId: 'captain', planId: 'escort', baseVersion: 3, status: 'paused', reason: '等待确认' }).status, 'transitioned');
assert.equal(reviewedPlanner.getPlan({ sessionId: 's1', branchId: 'b1', stateVersion: 'v1', npcId: 'captain', planId: 'escort' }).status, 'paused');
assert.equal(reviewedPlanner.transitionPlan({ sessionId: 's1', branchId: 'b1', stateVersion: 'v1', npcId: 'captain', planId: 'escort', baseVersion: 4, status: 'completed', reason: '护送完成' }).status, 'transitioned');
assert.equal(reviewedPlanner.transitionPlan({ sessionId: 's1', branchId: 'b1', stateVersion: 'v1', npcId: 'captain', planId: 'escort', baseVersion: 5, status: 'active', reason: '不应恢复' }).reason, 'plan_terminal');
assert.equal(changes.length, 5);
assert.equal(changes.at(-1).type, 'status_changed');
assert.equal(unsubscribe(), true);
assert.equal(reviewedPlanner.adjustPlan({ sessionId: 's1', branchId: 'b1', stateVersion: 'v1', npcId: 'captain', planId: 'escort', baseVersion: 1, reason: '旧依据', goal: '错误版本' }).reason, 'plan_version_conflict');
// OPT-055: no public mutator can resurrect terminal plans or write arbitrary states.
for (const terminal of ['completed', 'cancelled']) {
    const planner = createNpcAutonomyPlanner();
    const scope = { sessionId: 's', branchId: 'b', stateVersion: 'v', npcId: 'n', planId: 'p' };
    const events = []; planner.subscribePlanChanges(event => events.push(event));
    planner.registerPlan({ ...scope, goal: 'first' });
    const adjustment = { ...scope, goal: 'second', reason: 'fact', evidence: { factIds: ['f'], summary: 'known' } };
    assert.throws(() => planner.adjustPlan({ ...adjustment, baseVersion: 1, status: 'invalid' }), /status/);
    assert.throws(() => planner.registerPlan({ ...scope, goal: 'bad', status: 'invalid' }), /status/);
    assert.equal(planner.adjustPlan({ ...adjustment, baseVersion: 1, status: 'active' }).status, 'adjusted');
    planner.transitionPlan({ ...scope, baseVersion: 2, status: terminal, reason: 'done' });
    const before = planner.getPlan(scope);
    assert.equal(planner.adjustPlan({ ...adjustment, baseVersion: 3, status: 'active' }).reason, 'plan_terminal');
    assert.equal(planner.transitionPlan({ ...scope, baseVersion: 3, status: 'active', reason: 'reopen' }).reason, 'plan_terminal');
    assert.equal(planner.registerPlan({ ...scope, version: 3, goal: 'reopen' }).reason, 'plan_terminal');
    assert.deepEqual(planner.getPlan(scope), before);
    assert.equal(events.length, 3, 'rejections must not notify or advance versions');
    assert.equal(planner.registerPlan({ ...scope, planId: 'new', goal: 'new plan' }).status, 'registered');
}
console.log('NPC autonomy planner tests passed');
