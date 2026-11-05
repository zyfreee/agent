import assert from 'node:assert/strict';
import { createNpcOutcomeBridge } from '../npc/npc-outcome-bridge.js';
import { createActionResolver } from '../request/action-resolver.js';
import { createWorldSimulator } from '../request/world-simulator.js';
import { createNpcConflictCoordinator } from '../npc/npc-conflict.js';

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
// OPT-056: real guard -> autonomy -> conflict -> both real outcome engines, no defaults.
{
    const { createNpcDecisionGuard } = await import('./npc-decision-guard.js');
    const { createNpcAutonomyPlanner } = await import('./npc-autonomy.js');
    const guard = createNpcDecisionGuard(), planner = createNpcAutonomyPlanner();
    const scope = { sessionId: 'direct', branchId: 'b', stateVersion: 'v', taskId: 't' };
    const requests = planner.plan({ ...scope, event: { id: 'e', type: 'news' }, npcs: [{ id: 'A' }, { id: 'B' }] });
    const processes = requests.candidates.map((candidate, i) => ({ id: `p${i}`, ...scope, actorId: candidate.npcId, targetId: `target${i}`, field: 'alert', dailyDelta: i + 1, status: 'active', ruleVersion: '1' }));
    const decisions = requests.candidates.map((candidate, i) => planner.reviewCandidate({ candidate, decisionGuard: guard,
        permission: { npcId: candidate.npcId, allowed: true, allowedActions: [`target${i}:method${i}`] },
        proposal: { intent: 'action_intent', action: { targetId: `target${i}`, method: `method${i}`, actionId: `a${i}`, attemptId: `try${i}` }, process: processes[i] },
    }).decision);
    const coordinated = coordinator.coordinate({ ...scope, decisionKey: 'dk', decisions });
    assert.equal(coordinated.status, 'coordinated');
    const engine = createNpcOutcomeBridge({ actionResolver: createActionResolver(), worldSimulator: createWorldSimulator() });
    const actions = engine.toActionCandidates({ coordination: coordinated, rules: processes.map((p, i) => ({ id: `rule${i}`, version: '1', targetId: p.targetId, method: `method${i}`, conditions: [], effects: [], elapsed: 0, outcome: 'achieved' })), state: {} });
    assert.equal(actions.status, 'candidate');
    assert.deepEqual(actions.candidates.map(item => [item.actorId, item.method, item.actionId, item.attemptId, item.authorizedAction]), [['A', 'method0', 'A:a0', 'A:try0', 'target0:method0'], ['B', 'method1', 'B:a1', 'B:try1', 'target1:method1']]);
    assert.deepEqual(actions.candidates.map(item => [item.sourceActionId, item.sourceAttemptId]), [['a0', 'try0'], ['a1', 'try1']]);
    const world = engine.toWorldCandidates({ coordination: coordinated, worldContext: { taskId: 'world', fromDay: 1, toDay: 2, state: { target0: { alert: 0 }, target1: { alert: 0 } } }, processes });
    assert.equal(world.status, 'candidate');
    assert.deepEqual(world.candidates.map(item => item.processId), ['p0', 'p1']);
    assert.equal(coordinator.coordinate({ ...scope, decisionKey: 'stale', decisions: [{ ...decisions[0], stateVersion: 'old' }] }).status, 'needs_review');
    const shared = coordinator.coordinate({ ...scope, decisionKey: 'shared', decisions: decisions.map(item => ({ ...item, targetId: 'same' })) });
    assert.equal(shared.outcomes[0].decisions.length, 2, 'same-target agreement retains individual methods');
    const sameActions = createNpcOutcomeBridge({ actionResolver: createActionResolver(), worldSimulator: createWorldSimulator() }).toActionCandidates({ coordination: shared,
        rules: processes.map((p, i) => ({ id: `same${i}`, version: '1', targetId: 'same', method: `method${i}`, conditions: [], effects: [], elapsed: 0, outcome: 'achieved' })), state: {},
    });
    assert.equal(sameActions.candidates.length, 0, 'changed targets are not silently re-authorized');
    assert.equal(sameActions.rejected.length, 2);
    const permitted = coordinator.coordinate({ ...scope, decisionKey: 'same-permitted', decisions: decisions.map((item, i) => ({ ...item, targetId: 'same', authorizedActions: [`same:method${i}`] })) });
    const permittedActions = createNpcOutcomeBridge({ actionResolver: createActionResolver(), worldSimulator: createWorldSimulator() }).toActionCandidates({ coordination: permitted,
        rules: processes.map((p, i) => ({ id: `same${i}`, version: '1', targetId: 'same', method: `method${i}`, conditions: [], effects: [], elapsed: 0, outcome: 'achieved' })), state: {},
    });
    assert.deepEqual(permittedActions.candidates.map(item => item.method), ['method0', 'method1']);
    const paused = guard.review({ ...scope, taskId: 'pause', npcId: 'A', permission: { npcId: 'A', allowed: true }, envelope: { npcId: 'A', knownFactIds: [] }, proposal: { intent: 'action_intent', action: { targetId: 'gate', method: 'guard' }, requiresPlayerResponse: true } });
    // SELF-NPC-R5: identical actionId/attemptId across NPCs must not share resolver cache.
    {
        const shared = createNpcOutcomeBridge({ actionResolver: createActionResolver(), worldSimulator: createWorldSimulator() });
        const sharedScope = { sessionId: 'shared', branchId: 'b', stateVersion: 'v', taskId: 't' };
        const sharedGuard = createNpcDecisionGuard(), sharedPlanner = createNpcAutonomyPlanner();
        const requests = sharedPlanner.plan({ ...sharedScope, event: { id: 'ev', type: 'news' }, npcs: [{ id: 'A' }, { id: 'B' }] });
        const sharedDecisions = requests.candidates.map(candidate => sharedPlanner.reviewCandidate({ candidate, decisionGuard: sharedGuard,
            permission: { npcId: candidate.npcId, allowed: true, allowedActions: [`${candidate.npcId}-target:work`] },
            proposal: { intent: 'action_intent', action: { targetId: `${candidate.npcId}-target`, method: 'work', actionId: 'same', attemptId: 'same' } },
        }).decision);
        const sharedCoordination = coordinator.coordinate({ ...sharedScope, decisionKey: 'd', decisions: sharedDecisions });
        const sharedActions = shared.toActionCandidates({ coordination: sharedCoordination,
            rules: ['A', 'B'].map(npc => ({ id: `${npc}-rule`, version: '1', targetId: `${npc}-target`, method: 'work', conditions: [], effects: [{ type: 'set', field: 'worked', value: true }], outcome: 'achieved', elapsed: 1 })), state: {} });
        assert.equal(sharedActions.status, 'candidate');
        assert.deepEqual(sharedActions.candidates.map(item => item.actorId), ['A', 'B']);
        assert.deepEqual(sharedActions.candidates.map(item => item.authorizedAction), ['A-target:work', 'B-target:work']);
        assert.deepEqual(sharedActions.candidates.map(item => item.targetId), ['A-target', 'B-target']);
        assert.equal(sharedActions.candidates.some(item => item.replayed), false);
        assert.deepEqual(sharedActions.candidates.map(item => [item.sourceActionId, item.sourceAttemptId]), [['same', 'same'], ['same', 'same']]);
        const sameActorRetry = shared.toActionCandidates({ coordination: sharedCoordination,
            rules: ['A', 'B'].map(npc => ({ id: `${npc}-rule`, version: '1', targetId: `${npc}-target`, method: 'work', conditions: [], effects: [], elapsed: 1, outcome: 'achieved' })), state: {} }).candidates;
        assert.deepEqual(sameActorRetry.map(item => [item.actorId, item.replayed]), [['A', true], ['B', true]], 'same NPC same attempt stays idempotent');
    }
    assert.equal(coordinator.coordinate({ ...scope, decisionKey: 'paused', decisions: [paused] }).status, 'needs_review');
}
// OPT-057: synthesized IDs never authorize an absent process; reject scope/owner/duplicates.
{
    let calls = 0;
    const engine = createNpcOutcomeBridge({ actionResolver: { resolve() {} }, worldSimulator: { advance() { calls++; return { status: 'candidate', proposals: [] }; } } });
    const scope = { sessionId: 's', branchId: 'b', stateVersion: 'v' };
    const decision = { npcId: 'A' };
    const coordination = { ...scope, status: 'coordinated', decisionKey: 'd', outcomes: [{ status: 'coordinated', decision }] };
    const invoke = (d, processes) => engine.toWorldCandidates({ coordination: { ...coordination, outcomes: [{ status: 'coordinated', decision: d }] }, processes });
    const process = { id: 'd:A', ...scope, actorId: 'A' };
    assert.equal(invoke(decision, [process]).reason, 'missing_world_process'); assert.equal(calls, 0);
    assert.equal(invoke({ ...decision, process }, [process]).status, 'candidate'); assert.equal(calls, 1);
    for (const change of [{ sessionId: 'x' }, { branchId: 'x' }, { stateVersion: 'x' }, { actorId: 'B' }]) {
        assert.equal(invoke({ ...decision, process: { ...process, ...change } }, [process]).status, 'needs_review');
        assert.equal(invoke({ ...decision, process }, [{ ...process, ...change }]).status, 'needs_review');
    }
    assert.equal(invoke({ ...decision, process }, [process, process]).reason, 'duplicate_world_process');
    assert.equal(engine.toWorldCandidates({ coordination: { ...coordination, outcomes: [0, 1].map(() => ({ status: 'coordinated', decision: { ...decision, process } })) }, processes: [process] }).reason, 'duplicate_world_process');
    assert.equal(calls, 1, 'invalid processes never reach simulator');
}
console.log('NPC outcome bridge tests passed');
