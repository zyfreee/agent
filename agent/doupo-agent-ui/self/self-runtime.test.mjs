import assert from 'node:assert/strict';
import { createSelfRuntime } from '../self/self-runtime.js';
import { applyDesiredToView, desiredSelfRows, selfStateFromTables } from '../host/db-tables.js';

// 整栈用光不能留下零数量；刷新、DB 往返和重 roll 都保持实际数量。
for (const [count, take] of [[3, 3], [1, 1], [3, 1], [3, undefined]]) {
    const bagRuntime = createSelfRuntime({ now: () => 'bag' });
    bagRuntime.apply([{ op: 'addItem', name: '益气散', category: '丹药', grade: '一品', count, source: '购买', note: '原备注' }], { source: 'manual' });
    const original = bagRuntime.snapshot().items[0];
    const consumed = bagRuntime.apply([{ op: 'removeItem', id: original.id, ...(take === undefined ? {} : { count: take }) }], { source: 'decide', floor: 1 });
    assert.equal(consumed.status, 'applied');
    const remaining = take === undefined ? 0 : count - take;
    assert.deepEqual(bagRuntime.snapshot().items, remaining ? [{ ...original, count: remaining }] : [], '用光必须整条移除');
    const reloaded = createSelfRuntime();
    reloaded.restore(bagRuntime.snapshot());
    assert.deepEqual(reloaded.snapshot().items, bagRuntime.snapshot().items, '恢复不得复活物品');
    const decoded = selfStateFromTables(applyDesiredToView({}, desiredSelfRows(bagRuntime.snapshot())));
    assert.deepEqual(decoded.state.items.map(item => [item.id, item.count]), remaining ? [[original.id, remaining]] : [], 'DB 往返不得复活物品');
    bagRuntime.apply([], { source: 'decide', floor: 1 });
    assert.deepEqual(bagRuntime.snapshot().items, [original], '撤销保留原编号、数量和全部字段');
}
for (const count of [1, 3]) {
    const bagRuntime = createSelfRuntime({ now: () => 'invalid-bag' });
    bagRuntime.apply([{ op: 'addItem', name: '益气散', count }], { source: 'manual' });
    for (const take of [0, -1, 0.5, count + 1]) {
        const before = bagRuntime.snapshot();
        const rejected = bagRuntime.apply([{ op: 'removeItem', id: before.items[0].id, count: take }], { source: 'manual' });
        assert.equal(rejected.rejected[0]?.reason, 'bad_count');
        assert.deepEqual(bagRuntime.snapshot(), before, '非法消耗连最后一件也不能改动');
    }
}

// 改名可形成同名同类条目，整栈撤销必须恢复原条目而不是并入另一条。
{
    const bagRuntime = createSelfRuntime();
    bagRuntime.apply([{ op: 'addItem', name: '益气散', category: '丹药', count: 3, note: '原备注' }, { op: 'addItem', name: '其他丹', category: '丹药', count: 2, note: '另一备注' }]);
    bagRuntime.apply([{ op: 'updateItem', id: 'b2', name: '益气散' }]);
    const before = bagRuntime.snapshot().items;
    const removed = bagRuntime.apply([{ op: 'removeItem', id: 'b1', count: 3 }]);
    assert.equal(bagRuntime.apply([removed.applied[0].undo], { source: 'manual' }).status, 'applied');
    assert.deepEqual(bagRuntime.snapshot().items, before, '恢复原字段、编号和顺序，不合并同名条目');
    bagRuntime.apply([{ op: 'removeItem', id: 'b1', count: 3 }], { source: 'decide', floor: 9 });
    bagRuntime.apply([], { source: 'decide', floor: 9 });
    assert.deepEqual(bagRuntime.snapshot().items, before, '同楼撤销同样不合并');
}

// 五类清单的混合字段更新：拒绝非法数量时，其他字段和流水也不能变。
for (const kind of ['Technique', 'Skill', 'Equipment', 'Treasure', 'Item']) {
    let tick = 0;
    const guarded = createSelfRuntime({ now: () => `update-${++tick}` });
    const added = guarded.apply([{ op: `add${kind}`, name: '原名称', count: 3 }], { source: 'manual' });
    const id = added.applied[0].id;
    for (const count of [-1, 0.5, 1000000, 'not-a-number']) {
        const before = guarded.snapshot();
        const rejected = guarded.apply([{ op: `update${kind}`, id, name: '不该生效', grade: '玄阶', note: '新备注', equipped: true, count }], { source: 'manual' });
        assert.equal(rejected.rejected[0]?.reason, 'bad_count');
        assert.deepEqual(guarded.snapshot(), before, `${kind} 拒绝更新不得留下字段、日志或时间戳变化`);
    }
    const before = guarded.snapshot();
    assert.equal(guarded.apply([{ op: `update${kind}`, id, name: '长'.repeat(31), count: 2 }], { source: 'manual' }).rejected[0]?.reason, 'name_too_long');
    assert.deepEqual(guarded.snapshot(), before);
    assert.equal(guarded.apply([{ op: `update${kind}`, id, name: '合法名称', count: 2 }], { source: 'manual' }).status, 'applied');
}

// OPT-005/006：撤销必须完整、可预览，失败不提交任何部分结果。
{
    const r = createSelfRuntime({ now: () => 'undo' });
    const empty = r.snapshot().realm;
    r.apply([{ op: 'setRealm', realm: '斗者' }], { floor: 1 });
    const current = r.snapshot();
    assert.deepEqual(r.baselineForFloor(1).realm, empty);
    assert.deepEqual(r.snapshot(), current, '预览不能改账或元数据');
    r.apply([], { floor: 1 });
    assert.deepEqual(r.snapshot().realm, empty, '空境界也要恢复');
    r.apply([{ op: 'addGold', amount: 10, opId: 'floor-gold' }], { floor: 2 });
    r.apply([{ op: 'addGold', amount: 10, opId: 'floor-gold' }], { floor: 2 });
    assert.equal(r.status().gold, 10, '撤回楼层释放自己的 opId');
    r.apply([{ op: 'addGold', amount: 2, opId: 'manual-gold' }], { source: 'manual' });
    r.apply([{ op: 'addGold', amount: 3, opId: 'manual-gold' }], { floor: 3 });
    assert.equal(r.status().gold, 12, '其他来源 opId 不能被释放');
}
for (const [kind, key] of [['Technique', 'techniques'], ['Skill', 'skills'], ['Equipment', 'equipment'], ['Treasure', 'treasures'], ['Item', 'items']]) {
    const r = createSelfRuntime({ now: () => 'zero' });
    r.apply([{ op: `add${kind}`, name: '原名', count: 3, note: '原备注', grade: '玄阶', progress: '十六字进度可完整还原', source: '原来源' }, { op: `add${kind}`, name: '第二条' }], { source: 'manual' });
    const original = r.snapshot()[key];
    r.apply([{ op: `update${kind}`, id: original[0].id, count: 0, name: '不该保留', note: '新备注' }], { floor: 1 });
    r.apply([], { floor: 1 });
    assert.deepEqual(r.snapshot()[key], original, `${kind} 零数量撤销恢复原编号/顺序/全部字段`);
    r.apply([{ op: `remove${kind}`, id: original[0].id }], { floor: 2 });
    r.apply([], { floor: 2 });
    assert.deepEqual(r.snapshot()[key], original, `${kind} 移除撤销也恢复顺序`);
}
{
    const r = createSelfRuntime({ now: () => 'failure' });
    r.apply([{ op: 'addItem', name: '已被手动移除' }, { op: 'addGold', amount: 10 }], { floor: 4 });
    r.apply([{ op: 'removeItem', id: 'b1' }], { source: 'manual' });
    const before = r.snapshot();
    assert.throws(() => r.baselineForFloor(4), error => error.code === 'rollback_failed');
    const stopped = r.apply([{ op: 'addGold', amount: 100 }], { floor: 4, day: 9 });
    assert.equal(stopped.status, 'rejected');
    assert.equal(stopped.rejected[0].reason, 'rollback_failed');
    assert.deepEqual(r.snapshot(), before, '撤销失败不能留部分撤销、日期、流水或新操作');
}

// OPT-005 补充：称号顺序、完整进度文本和满清单被裁剪的旧条目也要回到原样。
{
    const r = createSelfRuntime({ maxSkills: 5, now: () => 'inverse' });
    const progress = '一二三四五六七八九十甲乙丙丁戊己';
    r.apply([{ op: 'addTitle', text: '第一称号' }, { op: 'addTitle', text: '第二称号' }, ...Array.from({ length: 5 }, (_, i) => ({ op: 'addSkill', name: `斗技${i}`, progress }))], { source: 'manual' });
    const before = r.snapshot();
    r.apply([{ op: 'removeTitle', text: '第一称号' }, { op: 'updateSkill', id: 's3', progress: '新进度' }, { op: 'addSkill', name: '会挤掉旧条目' }], { floor: 7 });
    const reloaded = createSelfRuntime({ maxSkills: 5, now: () => 'inverse' });
    assert.equal(reloaded.restore(r.snapshot()).replay, 'restored');
    reloaded.apply([], { floor: 7 });
    assert.deepEqual(reloaded.snapshot().titles, before.titles);
    assert.deepEqual(reloaded.snapshot().skills, before.skills);
}

// OPT-007：保存恢复不能丢同楼逆操作、去重或编号水位；旧档不编造历史。
{
    const r = createSelfRuntime({ now: () => 'save' });
    r.apply([{ op: 'addGoal', title: '旧目标', text: '完成旧目标' }, { op: 'addItem', name: '旧丹', count: 2 }], { source: 'manual' });
    r.apply([{ op: 'addGold', amount: 10, opId: 'old-floor' }, { op: 'addItem', name: '新丹', count: 3 }, { op: 'finishGoal', id: 'g1' }], { floor: 6 });
    r.apply([{ op: 'setProfile', field: 'name', text: '手动改名' }, { op: 'addItem', name: '手动购买', count: 2, opId: 'manual-id' }], { source: 'manual' });
    const loaded = createSelfRuntime({ now: () => 'save' });
    const saved = r.snapshot();
    assert.equal(saved._runtime?.version, 1);
    assert.equal(saved._runtime.lastFloor.floor, 6);
    assert.equal(loaded.restore(JSON.parse(JSON.stringify(saved))).replay, 'restored');
    const next = [{ op: 'addGold', amount: 10, opId: 'old-floor' }, { op: 'addItem', name: '新丹', count: 2 }, { op: 'finishGoal', id: 'g1' }, { op: 'addGold', amount: 5, opId: 'manual-id' }];
    assert.deepEqual(loaded.apply(next, { floor: 6 }), r.apply(next, { floor: 6 }));
    assert.deepEqual(loaded.snapshot(), r.snapshot(), '恢复后同楼与不中断路径完全相等');
    assert.equal(loaded.status().gold, 10);
    assert.equal(loaded.status().profile.name, '手动改名');
    assert.equal(loaded.snapshot().items.find(item => item.name === '手动购买').count, 2);
    assert.equal(loaded.baselineForFloor(6)._runtime, undefined, '业务基线不夹带运行时元数据');
    const watermarked = createSelfRuntime({ now: () => 'save' });
    watermarked.apply([{ op: 'addItem', name: '最高号' }], { source: 'manual' });
    watermarked.apply([{ op: 'removeItem', id: 'b1' }], { source: 'manual' });
    const reloadWatermark = createSelfRuntime();
    reloadWatermark.restore(watermarked.snapshot());
    assert.equal(reloadWatermark.apply([{ op: 'addItem', name: '下一号' }]).applied[0].id, 'b2');
    loaded.reset();
    loaded.apply([{ op: 'addGold', amount: 10, opId: 'old-floor' }], { floor: 6 });
    assert.equal(loaded.status().gold, 10, '重置隔离不同聊天基线');
    const old = createSelfRuntime({ now: () => 'legacy' });
    assert.equal(old.restore({ gold: 3 }).replay, 'unavailable');
    assert.equal(old.snapshot().gold, 3);
    assert.deepEqual(old.baselineForFloor(6).gold, 3, '旧档没有历史时只提供当前账');
    for (const metadata of [{ version: 99 }, { ...saved._runtime, opIds: ['x'.repeat(1025)] }, { ...saved._runtime, seq: { b: -1 } }, { ...saved._runtime, lastFloor: { floor: -1, undo: [], opIds: [] } }, { ...saved._runtime, lastFloor: { floor: 1, undo: Array(33).fill({ op: 'setGold', amount: 0 }), opIds: [] } }, { ...saved._runtime, lastFloor: { floor: 1, undo: [{ op: 'not-an-undo' }], opIds: [] } }]) {
        const malformed = createSelfRuntime({ now: () => 'bad-meta' });
        assert.equal(malformed.restore({ ...saved, _runtime: metadata }).replay, 'invalid');
        assert.equal(malformed.snapshot().gold, saved.gold, '坏元数据不破坏可读业务存档');
        assert.equal(malformed.snapshot()._runtime.lastFloor, null);
    }
}

// OPT-014：穿卸每次只移动一件，所有元数据守恒，失败连编号/流水也不变。
{
    const r = createSelfRuntime({ now: () => 'transfer' });
    r.apply([{ op: 'addItem', name: '玄铁剑', grade: '玄阶', type: '武器', craft: '锻造', progress: '完好', source: '家传', note: '独有刻字', materials: '玄铁', category: '武器', count: 3 }], { source: 'manual' });
    r.apply([{ op: 'addGold', amount: 10, opId: 'floor-money' }], { floor: 3 });
    const before = r.snapshot();
    const original = before.items[0];
    const equipped = r.transferEquipment(original.id, { direction: 'equip', source: 'ui', day: 4 });
    assert.equal(equipped.status, 'applied');
    assert.equal(equipped.applied.length, 1);
    const worn = r.snapshot().equipment[0];
    assert.deepEqual(worn, { ...original, id: 'e1', count: 1, equipped: false });
    assert.deepEqual(r.snapshot().items, [{ ...original, count: 2 }]);
    assert.deepEqual(r.snapshot()._runtime.lastFloor, before._runtime.lastFloor, '手工穿卸不清空楼层撤销');
    assert.deepEqual(r.snapshot()._runtime.opIds, before._runtime.opIds);
    assert.equal(r.snapshot().day, 4);
    assert.equal(r.journal()[0].source, 'ui');
    const rejectUnchanged = (id, direction, reason) => {
        const snapshot = r.snapshot();
        const result = r.transferEquipment(id, { direction, day: 99 });
        assert.equal(result.status, 'rejected');
        assert.equal(result.rejected[0].reason, reason);
        assert.deepEqual(r.snapshot(), snapshot, `${reason} 不得改账/日期/编号/日志/运行时元数据`);
    };
    rejectUnchanged(original.id, 'equip', 'duplicate');
    rejectUnchanged('missing', 'equip', 'id_not_found');
    rejectUnchanged(original.id, 'bad-direction', 'bad_direction');
    assert.equal(r.transferEquipment(worn.id, { direction: 'unequip' }).status, 'applied');
    assert.deepEqual(r.snapshot().items, [original], '卸回完全相同的原栈且不丢字段');
    assert.deepEqual(r.snapshot().equipment, []);
    r.apply([], { floor: 3 });
    assert.equal(r.status().gold, 0, '穿卸后原楼层仍可回滚');
    assert.deepEqual(r.snapshot().items, [original]);
    for (const count of [1, 3]) {
        const legacy = createSelfRuntime({ now: () => 'legacy-transfer' });
        legacy.restore({ equipment: [{ ...original, id: 'e7', count }] });
        const source = legacy.snapshot().equipment[0];
        assert.equal(legacy.transferEquipment(source.id, { direction: 'unequip' }).status, 'applied');
        assert.deepEqual(legacy.snapshot().equipment, count === 1 ? [] : [{ ...source, count: count - 1 }]);
        const moved = legacy.snapshot().items[0];
        assert.deepEqual(moved, { ...source, id: count === 1 ? 'e7' : 'b1', count: 1, equipped: false });
        assert.equal(legacy.snapshot().equipment.reduce((sum, item) => sum + item.count, 0) + legacy.status().items, count);
        const reload = createSelfRuntime();
        reload.restore(legacy.snapshot());
        assert.deepEqual(reload.snapshot().items, legacy.snapshot().items, '恢复不把卸下的一件又迁回装备栏');
    }
    const failure = (raw, id, direction, reason, config = {}) => {
        const guarded = createSelfRuntime({ ...config, now: () => 'failure-transfer' });
        guarded.restore(raw);
        const snapshot = guarded.snapshot();
        assert.equal(guarded.transferEquipment(id, { direction, day: 90 }).rejected[0].reason, reason);
        assert.deepEqual(guarded.snapshot(), snapshot, reason);
    };
    failure({ items: [original], equipment: [{ ...original, id: 'e1', name: '旧剑' }, { ...original, id: 'e2', name: '旧甲' }] }, original.id, 'equip', 'equipment_full', { maxEquipment: 2 });
    failure({ equipment: [{ ...original, id: 'e1', count: 1 }], items: Array.from({ length: 10 }, (_, i) => ({ ...original, id: `b${i + 1}`, name: `其他${i}` })) }, 'e1', 'unequip', 'items_full', { maxItems: 10 });
    failure({ equipment: [{ ...original, id: 'e1', count: 3 }], items: [{ ...original, count: 999999 }] }, 'e1', 'unequip', 'count_overflow');
    failure({ equipment: [{ ...original, id: 'e1', count: 1 }], items: [{ ...original, note: '另一把剑的备注' }] }, 'e1', 'unequip', 'metadata_conflict');
    failure({ items: [original], equipment: [{ ...original, id: original.id, name: '别的装备' }] }, original.id, 'equip', 'id_collision');
    failure({ items: [{ ...original, id: 'e1' }] }, 'e1', 'equip', 'id_collision');
    const fullMerge = createSelfRuntime({ maxItems: 10 });
    fullMerge.restore({ equipment: [{ ...original, id: 'e1', count: 3 }], items: [original, ...Array.from({ length: 9 }, (_, i) => ({ ...original, id: `b${i + 2}`, name: `其他${i}` }))] });
    assert.equal(fullMerge.transferEquipment('e1', { direction: 'unequip' }).status, 'applied', '满行囊仍允许无损合并');
    assert.equal(fullMerge.snapshot().items[0].count, 4);
    assert.equal(fullMerge.snapshot().equipment[0].count, 2);
}

// SELF-NPC-R1：模型新增栈被手动转移后，不能用旧楼逆操作复制已穿的一件。
for (const reload of [false, true]) for (const replay of [false, true]) {
    let r = createSelfRuntime({ now: () => 'transfer-replay' });
    const op = { op: 'addItem', name: 'sword', count: 3, opId: 'floor-item' };
    r.apply([op], { floor: 1 });
    assert.equal(r.transferEquipment('b1', { direction: 'equip' }).status, 'applied');
    if (reload) {
        const saved = JSON.parse(JSON.stringify(r.snapshot()));
        r = createSelfRuntime({ now: () => 'transfer-replay' });
        assert.equal(r.restore(saved).replay, 'restored', '冲突历史被保留而不是清空');
    }
    const before = r.snapshot();
    const result = r.apply(replay ? [op] : [], { floor: 1, day: 88 });
    assert.equal(result.status, 'rejected');
    assert.equal(result.rejected[0].reason, 'rollback_failed');
    assert.deepEqual(r.snapshot(), before, '拒绝连日期、编号和日志也不变');
    assert.equal([...r.snapshot().items, ...r.snapshot().equipment].reduce((sum, item) => sum + item.count, 0), 3);
}

// SELF-NPC-R2：恢复旧式 equipped 迁移改变清单归属时，不谎称原逆操作仍可重放。
{
    const r = createSelfRuntime({ now: () => 'migration-replay' });
    r.apply([{ op: 'addItem', name: 'sword' }], { source: 'manual' });
    r.apply([{ op: 'updateItem', id: 'b1', equipped: true }], { floor: 1 });
    const saved = JSON.parse(JSON.stringify(r.snapshot()));
    const loaded = createSelfRuntime({ now: () => 'migration-replay' });
    assert.equal(loaded.restore(saved).replay, 'invalid');
    assert.equal(loaded.snapshot().items.length, 0);
    assert.equal(loaded.snapshot().equipment[0].id, 'b1', '保留原有旧档归位规则');
    assert.equal(loaded.snapshot()._runtime.lastFloor, null);
    assert.equal(r.apply([], { floor: 1 }).status, 'noop', '不中断路径原本可以撤销');
}

// SELF-NPC-R3：入口与存档读取都支持同一个 opId 长度上限，拒绝必须早于重楼撤销。
for (const length of [1024, 1025]) {
    const r = createSelfRuntime({ now: () => 'opid-boundary' });
    const op = { op: 'addGold', amount: 3, opId: 'x'.repeat(length) };
    const before = r.snapshot();
    const result = r.apply([op], { floor: 1, day: 88 });
    if (length === 1025) {
        assert.equal(result.status, 'rejected');
        assert.equal(result.rejected[0].reason, 'bad_op_id');
        assert.deepEqual(r.snapshot(), before);
        r.apply([{ op: 'addGold', amount: 2 }], { floor: 1 });
        const existing = r.snapshot();
        r.apply([op], { floor: 1, day: 88 });
        assert.deepEqual(r.snapshot(), existing, '坏 ID 不撤销已有楼层');
    } else {
        assert.equal(result.status, 'applied');
        const loaded = createSelfRuntime({ now: () => 'opid-boundary' });
        assert.equal(loaded.restore(JSON.parse(JSON.stringify(r.snapshot()))).replay, 'restored');
        loaded.apply([op], { floor: 1 });
        assert.equal(loaded.status().gold, 3);
    }
}

// SELF-NPC-R4：逆操作逐字段类型、长度、必填和枚举验证，坏元数据不能清空业务字段。
{
    const r = createSelfRuntime({ now: () => 'typed-undo' });
    r.apply([{ op: 'addItem', name: 'sword', note: 'original' }, { op: 'addGoal', title: '目标', text: '内容' }, { op: 'startCraft', name: '丹药' }], { source: 'manual' });
    r.apply([{ op: 'updateItem', id: 'b1', note: 'new' }, { op: 'finishGoal', id: 'g1' }, { op: 'finishCraft', id: 'c1', result: 'success', note: '新备注' }], { floor: 1 });
    const saved = JSON.parse(JSON.stringify(r.snapshot()));
    for (const [index, field, bad] of [
        [0, 'note', true], [0, 'note', 3], [0, 'note', '长'.repeat(121)],
        [0, 'name', true], [0, 'name', ''], [0, 'name', '长'.repeat(31)],
        [0, 'count', true], [0, 'count', '3'], [0, 'count', 0], [0, 'count', 1000000],
        [0, 'equipped', 'false'], [0, 'equipped', 0], [0, 'id', null],
        [0, 'unknown', 'field'], [1, 'done', 'false'], [1, 'done', 0],
        [2, 'status', true], [2, 'status', 'invalid'], [2, 'note', false],
    ]) {
        const broken = structuredClone(saved);
        broken._runtime.lastFloor.undo[index][field] = bad;
        const loaded = createSelfRuntime({ now: () => 'typed-undo' });
        assert.equal(loaded.restore(broken).replay, 'invalid', `${index}.${field}=${String(bad)} 必须拒绝`);
        loaded.apply([], { floor: 1 });
        assert.equal(loaded.snapshot().items[0].note, 'new', '无效逆操作不可执行');
        assert.equal(loaded.snapshot().goals[0].done, true);
        assert.equal(loaded.snapshot().crafts[0].status, 'success');
    }
    for (const undo of [
        { op: 'updateItem', note: 'no-id' }, { op: 'updateItem', id: 'b1' },
        { op: 'updateGoal', id: 'g1' }, { op: 'updateCraft', id: 'c1' },
        { op: 'setGold', amount: '3' }, { op: 'setGold', amount: false },
        { op: '_restoreRealm', realm: true, stage: '' },
        { op: 'setProfile', field: 'name', text: false },
        { op: '_restoreTitle', text: '称号', index: '0' },
    ]) {
        const broken = structuredClone(saved);
        broken._runtime.lastFloor.undo = [undo];
        assert.equal(createSelfRuntime().restore(broken).replay, 'invalid', undo.op);
    }
    const loaded = createSelfRuntime({ now: () => 'typed-undo' });
    assert.equal(loaded.restore(saved).replay, 'restored', '合法逆操作仍接受');
    loaded.apply([], { floor: 1 });
    assert.equal(loaded.snapshot().items[0].note, 'original');
    assert.equal(loaded.snapshot().goals[0].done, false);
    assert.equal(loaded.snapshot().crafts[0].status, 'open');
}

const runtime = createSelfRuntime({ now: () => 't0' });

// —— 身份档案与境界 ——
let result = runtime.apply([
    { op: 'setProfile', field: 'name', text: '萧炎' },
    { op: 'setProfile', field: 'age', text: '15岁' },
    { op: 'setProfile', field: 'appearance', text: '黑色衣袍的清瘦少年'.repeat(20) },
    { op: 'setProfile', field: 'mood', text: '坏字段' },
    { op: 'setRealm', realm: '斗之气', stage: '三段' },
    { op: 'setRealm', realm: '' },
    { op: 'setRealm', realm: 'x'.repeat(20) },
], { source: 'llm', floor: 1, day: 3 });
assert.equal(result.status, 'applied');
assert.deepEqual(result.rejected.map(item => item.reason), ['bad_field', 'realm_missing', 'realm_too_long']);
assert.equal(runtime.status().profile.name, '萧炎');
assert.equal(runtime.status().profile.age, '15岁');
assert.equal(runtime.snapshot().profile.appearance.length, 160, '外貌限长 160');
assert.deepEqual(runtime.status().realm, { realm: '斗之气', stage: '三段' });

// —— 金币与称号 ——
result = runtime.apply([
    { op: 'setGold', amount: 100 },
    { op: 'addGold', amount: 500 },
    { op: 'addGold', amount: -200 },
    { op: 'addGold', amount: 0 },
    { op: 'addGold', amount: -99999 },
    { op: 'addTitle', text: '萧家废物' },
    { op: 'addTitle', text: '萧家废物' },
    { op: 'removeTitle', text: '没有的称号' },
], { source: 'llm', floor: 2, day: 3 });
assert.equal(result.applied.length, 5, JSON.stringify(result));
assert.equal(runtime.status().gold, 0, '金币扣到 0 为下限');
assert.deepEqual(runtime.snapshot().titles, ['萧家废物']);

// —— 功法 / 斗技：新增、去重、修改、删除 ——
result = runtime.apply([
    { op: 'addTechnique', name: '焚决', grade: '黄阶低级', type: '修炼功法', progress: '第三层', source: '药老所赠' },
    { op: 'addTechnique', name: '焚决', progress: '第四层' },
    { op: 'addSkill', name: '八极崩', grade: '黄阶高级', type: '攻击' },
    { op: 'addSkill', name: '' },
], { source: 'llm', floor: 3, day: 4 });
assert.equal(result.applied.length, 2);
assert.equal(result.rejected[0].reason, 'duplicate', '同名功法不重录');
assert.equal(result.rejected[1].reason, 'name_missing');
const techniqueId = runtime.snapshot().techniques[0].id;
result = runtime.apply([
    { op: 'updateTechnique', id: techniqueId, progress: '第四层', grade: '玄阶' },
    { op: 'updateTechnique', id: 't999', progress: 'x' },
], { source: 'llm', floor: 4, day: 4 });
assert.equal(result.applied.length, 1);
assert.equal(runtime.snapshot().techniques[0].progress, '第四层');
assert.equal(runtime.snapshot().techniques[0].grade, '玄阶');

// —— 行囊：合并、消耗、用光移除、装备标记 ——
result = runtime.apply([
    { op: 'addItem', name: '回气丹', category: '丹药', count: 3 },
    { op: 'addItem', name: '回气丹', category: '丹药', count: 2 },
    { op: 'addItem', name: '回气丹', category: '材料', count: 1 },
    { op: 'addItem', name: '玄重尺', category: '武器', count: 1 },
    { op: 'updateItem', id: 'b3', equipped: true },
    { op: 'removeItem', id: 'b1', count: 4 },
    { op: 'removeItem', id: 'b1', count: 1 },
    { op: 'removeItem', id: 'b1' },
], { source: 'llm', floor: 5, day: 5 });
assert.equal(result.applied.length, 7, JSON.stringify(result));
assert.deepEqual(result.rejected.map(item => item.reason), ['id_not_found']);
const bag = runtime.snapshot().items;
assert.equal(bag.find(item => item.name === '回气丹' && item.category === '丹药'), undefined, '扣到 0 移除');
assert.equal(bag.find(item => item.name === '回气丹' && item.category === '材料').count, 1, '不同类别各记各的');
assert.equal(bag.find(item => item.equipped).name, '玄重尺');
result = runtime.apply([{ op: 'updateItem', id: 'b2', count: 0 }], { source: 'llm', floor: 6, day: 5 });
assert.equal(result.applied.length, 1, '数量改 0 等于用光');
assert.equal(runtime.snapshot().items.some(item => item.id === 'b2'), false);

// —— 装备栏：新增、去重、修改、删除、行囊↔装备栏成对移动 ——
result = runtime.apply([
    { op: 'addEquipment', name: '玄重尺', grade: '玄阶中品', type: '武器', source: '家传' },
    { op: 'addEquipment', name: '玄重尺', type: '武器' },
    { op: 'addEquipment', name: '复元甲', grade: '玄阶中品', type: '防具' },
    { op: 'addEquipment', name: '' },
], { source: 'llm', floor: 9, day: 12 });
assert.equal(result.applied.length, 2, JSON.stringify(result));
assert.equal(result.rejected[0].reason, 'duplicate', '同名装备不重录');
assert.equal(result.rejected[1].reason, 'name_missing');
const gearId = runtime.snapshot().equipment[0].id;
assert.ok(gearId.startsWith('e'), '装备发号用 e 前缀');
result = runtime.apply([
    { op: 'updateEquipment', id: gearId, grade: '玄阶高级' },
    { op: 'removeEquipment', id: 'e999' },
], { source: 'llm', floor: 10, day: 12 });
assert.equal(result.applied.length, 1);
assert.equal(runtime.snapshot().equipment[0].grade, '玄阶高级');
assert.equal(runtime.status().equipment, 2);
// 穿上＝行囊移进装备栏（removeItem + addEquipment 一批）；卸下＝反向一批。
result = runtime.apply([{ op: 'addItem', name: '风行履', category: '防具', grade: '黄阶高级' }], { source: 'llm', floor: 11, day: 13 });
const shoeBagId = result.applied[0].id;
result = runtime.apply([
    { op: 'removeItem', id: shoeBagId },
    { op: 'addEquipment', name: '风行履', grade: '黄阶高级', type: '防具' },
], { source: 'llm', floor: 12, day: 13 });
assert.equal(result.applied.length, 2, JSON.stringify(result));
assert.equal(runtime.snapshot().items.some(item => item.name === '风行履'), false, '穿上后行囊里不再有');
assert.equal(runtime.snapshot().equipment.some(item => item.name === '风行履'), true, '装备栏接住');
const shoeId = runtime.snapshot().equipment.find(item => item.name === '风行履').id;
result = runtime.apply([
    { op: 'removeEquipment', id: shoeId },
    { op: 'addItem', name: '风行履', category: '防具', grade: '黄阶高级', count: 1 },
], { source: 'llm', floor: 13, day: 13 });
assert.equal(result.applied.length, 2, JSON.stringify(result));
assert.equal(runtime.snapshot().items.some(item => item.name === '风行履'), true, '卸下放回行囊');

// —— 天材地宝：与装备同构的增删改，同名不重录，id 走 z 前缀 ——
result = runtime.apply([
    { op: 'addTreasure', name: '青莲地心火', grade: '异火榜第十九', type: '异火', source: '塔戈沙漠地底收服' },
], { source: 'llm', floor: 14, day: 14 });
assert.equal(result.applied.length, 1, JSON.stringify(result));
const treasureId = result.applied[0].id;
assert.equal(result.applied[0].summary, `天材地宝 +${treasureId}：青莲地心火·异火榜第十九·异火`);
assert.equal(runtime.status().treasures, 1);
result = runtime.apply([{ op: 'addTreasure', name: '青莲地心火', grade: '异火榜第十九', type: '异火' }], { source: 'llm', floor: 15, day: 14 });
assert.equal(result.rejected.length, 1, '同名天材地宝不重录');
result = runtime.apply([{ op: 'updateTreasure', id: treasureId, note: '已认主' }], { source: 'llm', floor: 16, day: 14 });
assert.equal(result.applied.length, 1, JSON.stringify(result));
assert.equal(runtime.snapshot().treasures[0].note, '已认主');
result = runtime.apply([{ op: 'removeTreasure', id: treasureId }], { source: 'llm', floor: 17, day: 14 });
assert.equal(result.applied.length, 1, JSON.stringify(result));
assert.equal(runtime.status().treasures, 0, '易主离栏');

// —— 制作台：开工、时限、出炉 ——
result = runtime.apply([
    { op: 'startCraft', name: '聚气散', craft: '炼药', days: 3 },
    { op: 'startCraft', name: '聚气散', craft: '炼药', days: 3 },
    { op: 'startCraft', name: '玄重铠', craft: '炼器' },
    { op: 'finishCraft', id: 'c1', result: 'fail' },
    { op: 'finishCraft', id: 'c1', result: 'success' },
    { op: 'finishCraft', id: 'c2', result: 'burn' },
], { source: 'llm', floor: 7, day: 10 });
assert.equal(result.applied.length, 3, JSON.stringify(result));
assert.deepEqual(result.rejected.map(item => item.reason), ['duplicate', 'already_finished', 'bad_result']);
const jobs = runtime.snapshot().crafts;
assert.equal(jobs.find(job => job.id === 'c1').status, 'fail');
assert.equal(jobs.find(job => job.id === 'c2').endDay, null, '不带 days 就没有预计完成日');
assert.equal(runtime.status().crafting, 1);
assert.ok(runtime.craftLine(jobs.find(job => job.id === 'c2')).includes('炼器·玄重铠'), runtime.craftLine(jobs[1]));

// —— 目标：短标题必填 ≤20 字，内容另存；撤销整条恢复（含 done） ——
result = runtime.apply([
    { op: 'addGoal', title: '三年之约雪前耻', text: '三年之约，云岚宗一雪前耻，当众赢回萧家颜面', priority: '主线', due: '三年后' },
    { op: 'addGoal', title: '凑齐焚决后续', text: '凑齐焚决后续功法' },
    { op: 'addGoal', title: '', text: '没标题的目标' },
    { op: 'addGoal', text: '只有正文没有标题' },
    { op: 'addGoal', title: '一二三四五六七八九十甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥', text: '超长标题' },
    { op: 'finishGoal', id: 'g2' },
    { op: 'removeGoal', id: 'g2' },
    { op: 'removeGoal', id: 'g2' },
], { source: 'llm', floor: 8, day: 11 });
assert.equal(result.applied.length, 4, JSON.stringify(result));
assert.deepEqual(result.rejected.map(item => item.reason), ['title_missing', 'title_missing', 'title_too_long', 'id_not_found']);
const goals = runtime.snapshot().goals;
assert.equal(goals.length, 1);
assert.equal(goals[0].priority, '主线');
assert.equal(goals[0].title, '三年之约雪前耻', '短标题原样入库');
assert.equal(goals[0].text, '三年之约，云岚宗一雪前耻，当众赢回萧家颜面', '完整内容与标题分开保存');
assert.equal(runtime.status().goals, 1);
// 移除后再撤销（重 roll 回滚路径）：整条目标原样回来，完成状态不丢。
const goalBefore = goals[0];
runtime.apply([{ op: 'removeGoal', id: goalBefore.id }], { source: 'llm', floor: 11, day: 11 });
assert.equal(runtime.snapshot().goals.length, 0, '目标已移除');
runtime.apply([{ op: '_restoreGoal', entry: { ...goalBefore, done: true } }], { source: 'llm' });
const restoredGoal = runtime.snapshot().goals[0];
assert.equal(restoredGoal.id, goalBefore.id, '撤销恢复保留原编号');
assert.equal(restoredGoal.title, goalBefore.title, '撤销恢复保留短标题');
assert.equal(restoredGoal.text, goalBefore.text, '撤销恢复保留完整内容');
assert.equal(restoredGoal.done, true, '撤销恢复保留完成状态');

// —— 同楼重 roll：上一版指令先撤销 ——
const before = runtime.snapshot();
result = runtime.apply([{ op: 'addGold', amount: 100 }, { op: 'addTitle', text: '乌坦城新星' }], { source: 'llm', floor: 9, day: 12 });
assert.equal(result.applied.length, 2);
result = runtime.apply([{ op: 'addGold', amount: 1 }], { source: 'llm', floor: 9, day: 12 });
assert.equal(runtime.status().gold, 1, '上一版 +100 已撤销');
assert.equal(runtime.snapshot().titles.includes('乌坦城新星'), false, '上一版称号已撤销');
assert.equal(runtime.journal()[0].source, 'llm');

// —— 撤销恢复保留原编号，发号器同步前进 ——
const techniqueCount = runtime.snapshot().techniques.length;
result = runtime.apply([{ op: 'removeTechnique', id: techniqueId }], { source: 'llm', floor: 10, day: 12 });
assert.equal(runtime.snapshot().techniques.length, techniqueCount - 1);
result = runtime.apply([{ op: 'addSkill', name: '吸掌', grade: '玄阶低级' }], { source: 'llm', floor: 10, day: 12 });
assert.equal(runtime.snapshot().techniques.length, techniqueCount, '重 roll 撤销把功法还了回来');
const skillIds = runtime.snapshot().skills.map(item => item.id);
assert.equal(new Set(skillIds).size, skillIds.length, '编号不重复');

// —— 坏操作只拒绝不炸 ——
result = runtime.apply(['garbage', null, { op: 'nope' }, {}], { source: 'llm' });
assert.equal(result.status, 'rejected');
assert.deepEqual(result.rejected.map(item => item.reason), ['bad_op_shape', 'bad_op_shape', 'unknown_op', 'unknown_op']);

// —— 恢复/重置：坏数据丢弃，发号器对齐 ——
const snapshot = runtime.snapshot();
snapshot.techniques.push({ id: 't7', name: '风之极' });
snapshot.items.push({ name: '' });
snapshot.gold = -5;
// 旧档迁移：行囊里 equipped=true 的条目载入时归位装备栏，保留原编号且行囊不再重复。
const legacy = createSelfRuntime({ now: () => 't1' });
const legacyResult = legacy.restore({
    profile: {}, realm: {}, gold: 0, titles: [], techniques: [], skills: [], recipes: [], crafts: [], goals: [],
    items: [
        { id: 'b3', name: '玄重尺', category: '武器', count: 1, equipped: true },
        { id: 'b4', name: '回气丹', category: '丹药', count: 3, equipped: false },
    ],
});
assert.equal(legacyResult.status, 'restored');
assert.deepEqual(legacy.snapshot().equipment.map(item => `${item.id}:${item.name}`), ['b3:玄重尺'], 'equipped 条目迁进装备栏并保留编号');
assert.equal(legacy.snapshot().items.some(item => item.id === 'b3'), false, '行囊里不再留搬迁后的条目');
assert.equal(legacy.status().equipment, 1);
const legacyBag = legacy.apply([{ op: 'addItem', name: '回气丹', category: '丹药', count: 1 }], { source: 'llm' });
assert.notEqual(legacyBag.applied[0].id, 'b3', 'b 号水位要算上迁移条目，行囊补发不重号');
assert.equal(legacyBag.applied[0].id.startsWith('b'), true);
const restored = createSelfRuntime({ now: () => 't1' });
const restoredResult = restored.restore(snapshot);
assert.equal(restoredResult.status, 'restored');
assert.equal(restored.snapshot().techniques.some(item => item.id === 't7'), true);
assert.equal(restored.snapshot().gold, 0, '负数金币清洗为 0');
assert.equal(restored.snapshot().items.some(item => item.id === 'b999'), false, '坏条目丢弃');
const followUp = restored.apply([{ op: 'addTechnique', name: '新功法' }], { source: 'llm' });
assert.equal(followUp.applied[0].id, 't8', '发号器跳过恢复进来的编号');
restored.reset();
assert.equal(restored.status().techniques, 0);
assert.equal(restored.snapshot().profile.name, '');

// —— note 只记流水不改状态 ——
assert.equal(restored.note('本轮纳戒无变化。').status, 'noted');
assert.equal(restored.journal()[0].summaries[0], '本轮纳戒无变化。');
assert.equal(restored.status().gold, 0);

console.log('self runtime tests passed');
