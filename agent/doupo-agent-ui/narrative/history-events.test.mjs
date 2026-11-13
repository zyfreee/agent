import assert from 'node:assert/strict';
import test from 'node:test';
import { chatFloorShape, findDeletedFloor } from './history-events.js';

test('chatFloorShape fingerprints role, swipe, send date and body length without storing text', () => {
    const floor = { is_user: false, swipe_id: 2, send_date: '2026-11-10', mes: 'abcdef' };
    assert.equal(chatFloorShape(floor), 'a|2|2026-11-10|6');
    assert.equal(chatFloorShape({ is_user: true, mes: 'x' }), 'u|||1');
    assert.equal(chatFloorShape(null), 'x');
    assert.equal(chatFloorShape('not-an-object'), 'x');
    // 指纹不含正文内容：同长不同文同指纹，正文长度变了才变。
    assert.equal(chatFloorShape({ mes: '123' }), chatFloorShape({ mes: 'abc' }));
});

test('findDeletedFloor locates the deleted index by diffing before/after fingerprints', () => {
    const before = ['a|0|d|5', 'u|0|d|3', 'a|1|d|7', 'u|0|d|2'];
    const after = ['a|0|d|5', 'a|1|d|7', 'u|0|d|2'];
    assert.equal(findDeletedFloor(before, after), 1);
    // 删末楼：前面全对上，游标走到末尾。
    assert.equal(findDeletedFloor(before, before.slice(0, 3)), 3);
    assert.equal(findDeletedFloor(before, before), null, '长度差不是恰好一楼返回 null');
    assert.equal(findDeletedFloor(null, after), null);
    assert.equal(findDeletedFloor(before, after.slice(0, 2)), null, '一次删多楼定位不了，交回调用方兜底');
});
