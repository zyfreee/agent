import assert from 'node:assert/strict';
import { readFloorReplay, writeFloorReplay, FLOOR_REPLAY_LIMITS } from './floor-replay.js';

// —— 正常往返 ——
const written = writeFloorReplay({
    opIds: ['op1', 'op2'],
    lastFloor: { floor: 4, undo: [{ op: 'advance', minutes: -90 }], opIds: ['op2'] },
});
assert.equal(written.version, 1);
assert.equal(written.lastFloor.floor, 4);
assert.deepEqual(written.lastFloor.undo, [{ op: 'advance', minutes: -90 }]);
const read = readFloorReplay(written);
assert.deepEqual(read.opIds, ['op1', 'op2']);
assert.deepEqual(read.lastFloor, { floor: 4, undo: [{ op: 'advance', minutes: -90 }], opIds: ['op2'] });
assert.deepEqual(readFloorReplay({ version: 1, opIds: [], lastFloor: null }), { opIds: [], lastFloor: null });

// —— 撤销步骤超上限：整条不存（撤一半比不撤更糟）——
const tooMany = writeFloorReplay({ opIds: [], lastFloor: { floor: 1, undo: Array.from({ length: FLOOR_REPLAY_LIMITS.UNDO_MAX + 1 }, () => ({ op: 'advance', days: -1 })), opIds: [] } });
assert.equal(tooMany.lastFloor, null);
assert.equal(writeFloorReplay({ lastFloor: { floor: 1, undo: [], opIds: [] } }).lastFloor, null, '空撤销步骤不存');

// —— 读回宽容：坏形状一律当没有，不抛 ——
for (const broken of [undefined, null, 0, 'x', [], {}, { version: 2 }, { version: 1, lastFloor: { floor: -1 } }, { version: 1, lastFloor: { floor: 1.5 } }, { version: 1, lastFloor: { floor: 1, undo: 'x' } }, { version: 1, lastFloor: { floor: 1, undo: [null] } }, { version: 1, lastFloor: { floor: 1, undo: [{ op: 3 }] } }]) {
    assert.equal(readFloorReplay(broken), null, `坏基线当没有：${JSON.stringify(broken)}`);
}
// 操作号列表坏掉只是丢掉水位，不影响"能不能撤销"这件事的判断
assert.deepEqual(readFloorReplay({ version: 1, opIds: [1] }), { opIds: [], lastFloor: null });
assert.doesNotThrow(() => readFloorReplay({ version: 1, get lastFloor() { throw new Error('boom'); } }));

// —— 操作号清洗：非字符串剔除、超长截断到上限 ——
const manyIds = writeFloorReplay({ opIds: [...Array.from({ length: FLOOR_REPLAY_LIMITS.OPID_MAX + 5 }, (_, i) => `op${i}`), 42, ''] });
assert.equal(manyIds.opIds.length, FLOOR_REPLAY_LIMITS.OPID_MAX);
assert.equal(manyIds.opIds.includes(42), false);
assert.deepEqual(readFloorReplay({ version: 1, opIds: ['a', 'a'] }), { opIds: [], lastFloor: null }, '重复操作号丢掉水位即可');

console.log('floor replay tests passed');
