import assert from 'node:assert/strict';
import { createDataContractRegistry } from './data-contract.js';
const registry = createDataContractRegistry();
const registered = registry.register({ id: 'player-1', kind: 'character', name: '玩家', aliases: ['旅人'], sourceIds: ['origin-choice'], creator: 'player', writer: 'state', readers: ['player', 'ui', 'narrative'], version: 'v1', fields: [
    { id: 'hp', type: 'number', required: true, defaultValue: 10, writer: 'actions' },
    { id: 'secret', type: 'string', required: false, missingMeaning: '未知而非空值' },
    { id: 'optional', type: 'boolean', defaultValue: false },
] });
assert.equal(registered.status, 'registered');
assert.equal(registry.validateValue({ objectId: 'player-1', fieldId: 'hp', value: 8, writer: 'actions', reader: 'ui' }).status, 'accepted');
assert.equal(registry.validateValue({ objectId: 'player-1', fieldId: 'hp', value: 8, writer: 'world' }).reason, 'not_sole_writer');
assert.equal(registry.validateValue({ objectId: 'player-1', fieldId: 'hp', value: '8', writer: 'actions' }).reason, 'type_mismatch');
assert.equal(registry.validateValue({ objectId: 'player-1', fieldId: 'secret', value: '隐藏', reader: 'npc' }).reason, 'reader_not_allowed');
assert.equal(registry.get('player-1').fields[2].defaultValue, false);
assert.throws(() => registry.register({ id: 'bad', kind: 'character', name: '坏数据', creator: 'x', writer: 'state', readers: ['player'], version: 'v1', fields: [{ id: 'x', type: 'number', defaultValue: '0' }] }), /默认值类型/);
assert.throws(() => registry.register({ id: 'player-1', kind: 'character', name: '重复', creator: 'x', writer: 'state', readers: ['player'], version: 'v1' }), /稳定 ID 已登记/);
assert.throws(() => registry.register({ id: 'bad-reader', kind: 'item', name: '物品', creator: 'x', writer: 'state', readers: ['root'], version: 'v1' }), /读取者/);
const migration = registry.migrate({ objectId: 'player-1', fromVersion: 'v0', toVersion: 'v1', mapping: old => ({ ...old, hp: old.health }) });
assert.equal(migration.status, 'registered');
assert.deepEqual(registry.applyMigration({ objectId: 'player-1', fromVersion: 'v0', toVersion: 'v1', data: { health: 4 } }), { status: 'candidate', objectId: 'player-1', fromVersion: 'v0', toVersion: 'v1', data: { health: 4, hp: 4 }, committed: false });
assert.equal(registry.applyMigration({ objectId: 'player-1', fromVersion: 'v2', toVersion: 'v1', data: {} }).reason, 'migration_missing');
console.log('data contract tests passed');
