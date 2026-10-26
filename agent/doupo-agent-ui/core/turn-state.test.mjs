import assert from 'node:assert/strict';
import { createDataContractRegistry } from './data-contract.js';
import {
    DEFAULT_STATE_OBJECTS,
    applyChanges,
    createInitialState,
    describeWritableFields,
    listWritableFields,
    registerDefaultContracts,
    summarizeState,
} from './turn-state.js';

const registry = createDataContractRegistry({});
const registered = registerDefaultContracts(registry);
assert.equal(registered.status, 'ready');
assert.deepEqual(registered.registered.slice().sort(), ['player', 'world']);
assert.equal(registered.total, 2);
assert.deepEqual(registerDefaultContracts(registry), { status: 'ready', registered: [], total: 2 }, '重复登记必须幂等');

for (const object of DEFAULT_STATE_OBJECTS) {
    assert.ok(registry.get(object.id), `合同没有登记：${object.id}`);
}

const state = createInitialState();
assert.equal(state.player.hp, 100);
assert.equal(state.player.douqi, 10);
assert.equal(state.player.realm, '斗之气三段');
assert.equal(state.world.day, 1);
assert.equal(state.world.weather, '晴');

assert.equal(registry.validateValue({ objectId: 'player', fieldId: 'hp', value: 70, writer: 'actions' }).status, 'accepted');
assert.equal(registry.validateValue({ objectId: 'player', fieldId: 'hp', value: 70, writer: 'world' }).reason, 'not_sole_writer');
assert.equal(registry.validateValue({ objectId: 'player', fieldId: 'hp', value: '很多', writer: 'actions' }).reason, 'type_mismatch');
assert.equal(registry.validateValue({ objectId: 'player', fieldId: 'luck', value: 1, writer: 'actions' }).reason, 'unknown_field');

const fields = listWritableFields(registry);
assert.equal(fields.length, 9);
assert.ok(fields.every(field => field.targetId && field.field && field.type));
assert.match(describeWritableFields(registry), /player\.hp（number）/);

const next = applyChanges(state, [
    { targetId: 'player', field: 'hp', type: 'add', value: -10 },
    { targetId: 'world', field: 'day', type: 'set', value: 2 },
    { targetId: 'player', field: 'gold', type: 'remove' },
]);
assert.equal(next.player.hp, 90);
assert.equal(next.world.day, 2);
assert.equal(Object.hasOwn(next.player, 'gold'), false);
assert.equal(state.player.hp, 100, '原始状态不能被就地改写');

assert.match(summarizeState(next), /player: hp=90/);
console.log('turn state tests passed');
