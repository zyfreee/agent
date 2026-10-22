import assert from 'node:assert/strict';
import { createImpactEngine } from './impact-engine.js';

const engine = createImpactEngine({ maxProposals: 5, maxChainDepth: 3 });
const first = engine.submit({ sessionId: 'save-1', branchId: 'main', eventId: 'player-action-1', stateVersion: 'v1', origin: 'player', changes: [
  { id: 'bridge-damaged', targetId: 'bridge-1', certainty: 'certain', effect: { type: 'set', field: 'condition', value: 'damaged' }, rationale: '结算模块已确认行动结果' },
  { id: 'route-blocked', targetId: 'route-1', certainty: 'conditional', condition: 'inspection-confirms-closure', effect: { type: 'set', field: 'open', value: false }, rationale: '需检查后才封闭' },
  { id: 'rumor-spreads', targetId: 'faction-1', certainty: 'speculative', effect: { type: 'set', field: 'knows', value: true }, rationale: '尚无传播证据' },
] });
assert.equal(first.accepted, true);
assert.equal(first.proposals[0].attributedToPlayer, true);
assert.equal(engine.submit({ sessionId: 'save-1', branchId: 'main', eventId: 'player-action-1', stateVersion: 'v1', origin: 'player', changes: [{ id: 'duplicate', targetId: 'x', certainty: 'certain', effect: { type: 'set', field: 'y', value: true } }] }).reason, 'duplicate_event');
const beforeCondition = engine.evaluate({ sessionId: 'save-1', branchId: 'main', stateVersion: 'v1', facts: {}, knownConditions: [] });
assert.deepEqual(beforeCondition.changes.map(x => x.proposalId), ['bridge-damaged']);
assert.deepEqual(beforeCondition.pending, ['route-blocked']);
assert.deepEqual(beforeCondition.speculative, ['rumor-spreads']);
assert.equal(beforeCondition.committed, false);
const afterCondition = engine.evaluate({ sessionId: 'save-1', branchId: 'main', stateVersion: 'v1', facts: { 'route-1': { open: true } }, knownConditions: ['inspection-confirms-closure'] });
assert.deepEqual(afterCondition.changes.map(x => x.proposalId), ['bridge-damaged', 'route-blocked']);
assert.equal(engine.evaluate({ sessionId: 'save-1', branchId: 'main', stateVersion: 'v2' }).stale.length, 3);
assert.equal(engine.evaluate({ sessionId: 'save-1', branchId: 'other', stateVersion: 'v1' }).changes.length, 0);
const world = engine.submit({ sessionId: 'save-1', branchId: 'main', eventId: 'world-event-1', stateVersion: 'v1', origin: 'world', changes: [{ id: 'market-stock', targetId: 'market', certainty: 'certain', effect: { type: 'add', field: 'stock', value: -1 } }] });
assert.equal(world.proposals[0].attributedToPlayer, false);
assert.equal(engine.evaluate({ sessionId: 'save-1', branchId: 'main', stateVersion: 'v1', facts: { market: { stock: 4 } } }).changes.find(x => x.proposalId === 'market-stock').after, 3);
assert.throws(() => engine.submit({ sessionId: 's', branchId: 'b', eventId: 'e', stateVersion: 'v1', origin: 'player', changes: [{ id: 'bad', targetId: 'x', certainty: 'speculative', apply: true, effect: { type: 'set', field: 'x', value: 1 } }] }), /推测性影响不能直接应用/);
assert.throws(() => engine.submit({ sessionId: 's', branchId: 'b', eventId: 'e2', stateVersion: 'v1', origin: 'player', changes: [{ id: 'bad2', targetId: 'x', certainty: 'conditional', effect: { type: 'set', field: 'x', value: 1 } }] }), /必须写明生效条件/);
assert.throws(() => engine.submit({ sessionId: 's', branchId: 'b', eventId: 'e3', stateVersion: 'v1', origin: 'player', chainDepth: 4, changes: [{ id: 'deep', targetId: 'x', certainty: 'certain', effect: { type: 'set', field: 'x', value: 1 } }] }), /连锁深度超出上限/);
const small = createImpactEngine({ maxProposals: 1 });
const limited = small.submit({ sessionId: 's', branchId: 'b', eventId: 'bounded', stateVersion: 'v1', origin: 'other', changes: [
  { id: 'one', targetId: 'x', certainty: 'certain', effect: { type: 'set', field: 'a', value: 1 } },
  { id: 'two', targetId: 'y', certainty: 'certain', effect: { type: 'set', field: 'b', value: 2 } },
] });
assert.equal(limited.truncated, true);
assert.deepEqual(limited.skipped, ['two']);
assert.equal(small.clearBranch('s', 'b'), 1);
assert.equal(small.submit({ sessionId: 's', branchId: 'b', eventId: 'bounded', stateVersion: 'v1', origin: 'other', changes: [{ id: 'retry', targetId: 'z', certainty: 'certain', effect: { type: 'set', field: 'x', value: 1 } }] }).accepted, true);
console.log('impact engine tests passed');
