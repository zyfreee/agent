import assert from 'node:assert/strict';
import {
    ALL_TABLE_DEFS,
    SELF_TABLE_DEFS,
    WORLD_TABLE_DEFS,
    MEMORY_TABLE_DEFS,
    buildBridgeSheets,
    mergeBridgeSheets,
    sanitizeForeignDdl,
    desiredSelfRows,
    desiredWorldRows,
    desiredMemoryRows,
    reconcileTables,
    selfStateFromTables,
    worldStateFromTables,
    memoryStateFromTables,
    applyDesiredToView,
    sameSelfState,
    sameWorldState,
    sameMemoryState,
} from './db-tables.js';

// ---------- 表定义不变量：表头与 DDL 注释必须一一对应，防止两边漂移 ----------

for (const def of ALL_TABLE_DEFS) {
    const ddlColumns = def.ddl.split('\n')
        .filter(line => !line.trim().startsWith('CREATE') && !line.trim().startsWith(')'))
        .map(line => line.match(/^\s*(\w+)\s+\w+[^,]*,?\s*--\s*(.+)$/))
        .filter(Boolean)
        .map(match => match[2].trim());
    assert.equal(ddlColumns.length, def.headers.length, `${def.name} DDL 注释列数与表头不一致`);
    assert.equal(ddlColumns[0], '行号', `${def.name} 首列注释应为 行号（row_id）`);
    assert.deepEqual(ddlColumns.slice(1), def.headers.slice(1), `${def.name} DDL 注释与表头不对应`);
    assert.equal(def.headers[0], 'row_id', `${def.name} 第一列必须是 row_id`);
    assert.ok(def.key.startsWith('sheet_'), `${def.name} 键必须 sheet_ 开头`);
}

assert.equal(new Set(ALL_TABLE_DEFS.map(def => def.key)).size, ALL_TABLE_DEFS.length, '表键重复');
assert.equal(new Set(ALL_TABLE_DEFS.map(def => def.name)).size, ALL_TABLE_DEFS.length, '表名重复');
assert.equal(SELF_TABLE_DEFS.length, 8);
assert.equal(WORLD_TABLE_DEFS.length, 3);
assert.equal(MEMORY_TABLE_DEFS.length, 2);
assert.equal(new Set(MEMORY_TABLE_DEFS.map(def => def.name)).size, 2);
assert.deepEqual(MEMORY_TABLE_DEFS.map(def => def.name), ['小记忆', '大记忆']);
assert.equal(ALL_TABLE_DEFS.length, 13);

// 模板片段：mate 齐全、节点全部禁止、content 只有表头行、退出数据库自动更新
const fragment = buildBridgeSheets();
assert.equal(fragment.mate.type, 'chatSheets');
assert.equal(fragment.mate.updateConfigUiSentinel, -1, 'mate 必须带新语义标记，导入迁移才不会把 updateFrequency=0 改写掉');
for (const def of ALL_TABLE_DEFS) {
    const sheet = fragment[def.key];
    assert.equal(sheet.name, def.name);
    assert.deepEqual(sheet.content, [def.headers]);
    for (const node of ['initNode', 'insertNode', 'updateNode', 'deleteNode']) {
        assert.equal(sheet.sourceData[node], '禁止操作。', `${def.name} 的 ${node} 必须禁止`);
    }
    assert.ok(sheet.sourceData.ddl.includes(def.englishName));
    assert.equal(sheet.updateConfig.updateFrequency, 0, `${def.name} 必须退出数据库 AI 自动更新`);
    assert.equal(sheet.updateConfig.uiSentinel, -1, `${def.name} 的 updateConfig 需带表级新语义标记`);
    assert.equal(sheet.updateConfig.contextDepth, -1);
}

// 模板合并：外来表不动、桥接表补齐、幂等；新语义标记只在安全时置位
const existing = { mate: { type: 'chatSheets', version: 1 }, sheet_foreign: { name: '别人的表', content: [['a']] } };
const merged = mergeBridgeSheets(existing);
assert.equal(merged.added.length, ALL_TABLE_DEFS.length);
assert.deepEqual(merged.template.sheet_foreign, existing.sheet_foreign);
assert.ok(merged.template[ALL_TABLE_DEFS[0].key]);
assert.equal(merged.template.mate.updateConfigUiSentinel, -1, '合并进无标记模板时应置新语义标记（外来表没有旧语义 0）');
const mergedAgain = mergeBridgeSheets(merged.template);
assert.equal(mergedAgain.added.length, 0, '二次合并不应再补表');
assert.equal(mergedAgain.template.mate.updateConfigUiSentinel, -1, '二次合并保留新语义标记');

// 旧语义模板（外来表 updateConfig 带 0=沿用UI、无 mate 标记）：不能置标记，
// 否则迁移被跳过、旧表的 0 会被新运行时误读成「禁用」。
const legacy = {
    mate: { type: 'chatSheets', version: 1 },
    sheet_legacy: { name: '旧表', content: [['a']], updateConfig: { contextDepth: 0, updateFrequency: 0 } },
};
const mergedLegacy = mergeBridgeSheets(legacy);
assert.equal(mergedLegacy.added.length, ALL_TABLE_DEFS.length);
assert.equal(mergedLegacy.template.mate.updateConfigUiSentinel, undefined, '存在旧语义 0 时不得置新语义标记');
assert.equal(mergedLegacy.template.sheet_legacy.updateConfig.updateFrequency, 0, '外来表 updateConfig 原样保留');

// ---------- 导入包净化：外来表 DDL 注释与表头对齐 ----------

const brokenForeign = {
    mate: { type: 'chatSheets', version: 1 },
    sheet_bad: {
        name: '背包与货币',
        content: [['row_id', '金币', '进度(%)']],
        sourceData: { ddl: 'CREATE TABLE bag ( -- 背包与货币\n  row_id INTEGER PRIMARY KEY, -- 行号\n  gold TEXT, -- 金币\n  progress TEXT, -- 进度（%）\n);' },
        updateConfig: { updateFrequency: 0 },
    },
    sheet_good: {
        name: '好表',
        content: [['row_id', '名字']],
        sourceData: { ddl: 'CREATE TABLE good ( -- 好表\n  row_id INTEGER PRIMARY KEY, -- 行号\n  name TEXT, -- 名字\n);' },
    },
};
const sanitized = sanitizeForeignDdl(brokenForeign);
assert.notEqual(sanitized, brokenForeign, '有需要修复的表时应返回副本');
assert.ok(sanitized.sheet_bad.sourceData.ddl.includes('-- 进度(%)'), '不一致的注释应按表头重建');
assert.ok(!sanitized.sheet_bad.sourceData.ddl.includes('进度（%）'), '全角旧注释不应残留');
assert.ok(sanitized.sheet_bad.sourceData.ddl.includes('CREATE TABLE bag ( -- 背包与货币'), '重建沿用原表名与表说明');
assert.deepEqual(sanitized.sheet_bad.content, brokenForeign.sheet_bad.content, '行内容不动');
assert.equal(sanitized.sheet_bad.updateConfig.updateFrequency, 0, 'updateConfig 不动');
assert.equal(sanitized.sheet_good.sourceData.ddl, brokenForeign.sheet_good.sourceData.ddl, '已对齐的外来表 DDL 原样保留');

const mergedForSanitize = mergeBridgeSheets(JSON.parse(JSON.stringify(brokenForeign)));
const sanitizedMerged = sanitizeForeignDdl(mergedForSanitize.template);
assert.equal(sanitizedMerged.sheet_dpProfile.sourceData.ddl, buildBridgeSheets().sheet_dpProfile.sourceData.ddl, '桥接表 DDL 永不改写');
assert.ok(sanitizedMerged.sheet_bad.sourceData.ddl.includes('-- 进度(%)'), '合并模板里的外来表同样被净化');
const pureBridge = buildBridgeSheets();
assert.equal(sanitizeForeignDdl(pureBridge), pureBridge, '纯桥接片段没有外来表时原样返回');
assert.equal(sanitizeForeignDdl(null), null, '空模板原样返回');

// ---------- 纳戒：状态 → 行 → 表 → 状态 往返 ----------

const sampleSelf = {
    schemaVersion: 1,
    day: 12,
    profile: { name: '萧炎', gender: '男', age: '18', race: '人族', origin: '萧家', affiliation: '迦南学院', attribute: '火', talent: '先前废材', appearance: '黑发黑瞳' },
    realm: { realm: '斗者', stage: '三星' },
    gold: 3200,
    titles: ['乌坦城天才'],
    techniques: [{ id: 't1', name: '焚决', grade: '黄阶低级', type: '修炼功法', progress: '第三层', source: '药老所赠' }],
    skills: [{ id: 's1', name: '八极崩', grade: '黄阶高级', type: '攻击', source: '药老' }],
    items: [
        { id: 'b1', name: '回气丹', category: '丹药', grade: '一品', count: 3, equipped: false, source: '购买' },
        { id: 'b2', name: '玄重尺', category: '武器', grade: '中品', count: 1, equipped: true, source: '家传' },
    ],
    recipes: [{ id: 'r1', name: '回气丹', craft: '炼药', grade: '一品', materials: '凝骨草等' }],
    crafts: [{ id: 'c1', name: '回气散', craft: '炼药', startDay: 10, endDay: 13, status: 'open', note: '缺一味凝骨草' }],
    goals: [{ id: 'g1', text: '三年之约', priority: '主线', due: '三年后', done: false }],
    log: [{ floor: 5, note: '本地流水不进表' }],
    updatedAt: '2026-10-29T00:00:00.000Z',
};

const selfGroups = desiredSelfRows(sampleSelf);
assert.equal(selfGroups.length, SELF_TABLE_DEFS.length);
const selfView = applyDesiredToView({}, selfGroups);
assert.equal(selfView.mate.updateConfigUiSentinel, -1, '冷启动兜底整表导入同样要带新语义标记');
assert.equal(selfView[ALL_TABLE_DEFS[0].key].updateConfig.updateFrequency, 0);
const derivedSelf = selfStateFromTables(selfView);
assert.equal(derivedSelf.empty, false);
assert.ok(sameSelfState(derivedSelf.state, sampleSelf), '纳戒往返应等值（log 不镜像、updatedAt 随镜像走）');
assert.equal(derivedSelf.state.gold, 3200);
assert.equal(derivedSelf.state.day, 12);
assert.equal(derivedSelf.state.profile.attribute, '火', '斗气属性列往返（dp_profile 第 8 列）');
assert.equal(derivedSelf.state.items[1].equipped, true);
assert.equal(derivedSelf.state.items[0].count, 3);
assert.equal(derivedSelf.state.crafts[0].status, 'open');
assert.equal(derivedSelf.state.goals[0].done, false);
assert.deepEqual(derivedSelf.state.log, [], '流水不镜像，收养时由调用方保留');

// 空表判定：全空状态标 empty
const emptySelf = selfStateFromTables(applyDesiredToView({}, desiredSelfRows({
    profile: {}, realm: {}, gold: 0, day: 1, titles: [], techniques: [], skills: [], items: [], recipes: [], crafts: [], goals: [],
})));
assert.equal(emptySelf.empty, true);

// ---------- 世界：状态 → 行 → 表 → 状态 往返 ----------

const sampleWorld = {
    schemaVersion: 1,
    clock: { day: 9, minute: 750, label: '午后' },
    info: { weather: '晴', location: '乌坦城', era: '斗气大陆', reputation: '崭露头角', wanted: '无' },
    nearEvents: [
        { id: 'e1', scope: 'near', day: 8, text: '坊市起了争执', basis: '第 8 楼', endDay: 12, weight: 'minor', pinned: false, done: false, resolvedDay: null },
        { id: 'e3', scope: 'near', day: 6, text: '传闻魔兽袭村', basis: '路人说', endDay: null, weight: 'rumor', pinned: true, done: true, resolvedDay: 8 },
    ],
    worldEvents: [{ id: 'e2', scope: 'world', day: 5, text: '云岚宗集结', basis: '第 5 楼', endDay: 20, weight: 'major', pinned: false, done: false, resolvedDay: null }],
    tasks: [
        { id: 't1', title: '采凝骨草', detail: '坊市外山', basis: '委托', day: 8, endDay: 11, status: 'active', doneDay: null },
        { id: 't2', title: '赴约', detail: '', basis: '', day: 2, endDay: null, status: 'done', doneDay: 4 },
    ],
    log: [],
    updatedAt: '2026-10-29T00:00:00.000Z',
};

const worldGroups = desiredWorldRows(sampleWorld);
assert.equal(worldGroups.length, WORLD_TABLE_DEFS.length);
const worldView = applyDesiredToView({}, worldGroups);
const derivedWorld = worldStateFromTables(worldView);
assert.equal(derivedWorld.empty, false);
assert.ok(sameWorldState(derivedWorld.state, sampleWorld), '世界往返应等值');
assert.equal(derivedWorld.state.nearEvents.length, 2);
assert.equal(derivedWorld.state.worldEvents.length, 1);
assert.equal(derivedWorld.state.nearEvents[1].weight, 'rumor');
assert.equal(derivedWorld.state.nearEvents[1].pinned, true);
assert.equal(derivedWorld.state.nearEvents[1].resolvedDay, 8);
assert.equal(derivedWorld.state.tasks[1].status, 'done');
assert.equal(derivedWorld.state.tasks[1].doneDay, 4);
assert.equal(derivedWorld.state.clock.minute, 750);

// ---------- reconcile：最小差异 ----------

const bridgeOnlyView = buildBridgeSheets(); // 只有表头行

// 1. 空表 + 有状态 → 全部 insertRow
{
    const { ops, missingTables } = reconcileTables(bridgeOnlyView, desiredSelfRows(sampleSelf));
    assert.deepEqual(missingTables, [], '模板片段齐表时不应报缺表');
    assert.equal(ops.filter(op => op.kind === 'insertRow').length, 9, '档案1+称号1+功法1+斗技1+行囊2+配方1+炼制1+目标1');
}

// 2. 档案行更新：只产生一个 updateRow，data 只含变化的列
{
    const view = applyDesiredToView(bridgeOnlyView, desiredSelfRows(sampleSelf));
    const changed = JSON.parse(JSON.stringify(sampleSelf));
    changed.gold = 5000;
    changed.realm = { realm: '斗师', stage: '一星' };
    const { ops } = reconcileTables(view, desiredSelfRows(changed));
    const updates = ops.filter(op => op.kind === 'updateRow');
    assert.equal(updates.length, 1);
    assert.equal(updates[0].rowIndex, 1);
    assert.deepEqual(updates[0].data, { 境界: '斗师', 段位: '一星', 金币: '5000' });
}

// 3. 清单增删改：b1 删除（原索引从大到小）、b2 改数量、b3 新增
{
    const view = applyDesiredToView(bridgeOnlyView, desiredSelfRows(sampleSelf));
    const changed = JSON.parse(JSON.stringify(sampleSelf));
    changed.items = [
        { ...sampleSelf.items[1], count: 2 },
        { id: 'b3', name: '回春草', category: '材料', grade: '', count: 5, equipped: false, source: '采集' },
    ];
    const { ops } = reconcileTables(view, desiredSelfRows(changed));
    const deletes = ops.filter(op => op.kind === 'deleteRow');
    const updates = ops.filter(op => op.kind === 'updateRow');
    const inserts = ops.filter(op => op.kind === 'insertRow');
    assert.deepEqual(deletes, [{ kind: 'deleteRow', table: '纳戒·行囊', rowIndex: 1 }], 'b1 在原索引 1');
    assert.deepEqual(updates, [{ kind: 'updateRow', table: '纳戒·行囊', rowIndex: 1, data: { 数量: '2' } }], 'b2 删 b1 后落到索引 1');
    assert.equal(inserts.length, 1);
    assert.deepEqual(inserts[0].data, { 编号: 'b3', 名称: '回春草', 类别: '材料', 品阶: '', 数量: '5', 装备中: '否', 来源: '采集' });
    // ops 顺序：delete 在 update/insert 之前
    const kinds = ops.map(op => op.kind);
    assert.ok(kinds.indexOf('deleteRow') < kinds.indexOf('updateRow') && kinds.indexOf('updateRow') < kinds.indexOf('insertRow'));
}

// 4. 无变化 → 零操作
{
    const view = applyDesiredToView(bridgeOnlyView, desiredSelfRows(sampleSelf));
    assert.equal(reconcileTables(view, desiredSelfRows(sampleSelf)).ops.length, 0);
}

// 5. 编号为空的手工行不删不碰（挂在行囊表上验证：键=编号列）
{
    const view = applyDesiredToView(bridgeOnlyView, desiredSelfRows(sampleSelf));
    view.sheet_dpItems.content.push(['9', '', '手写物品', '', '', '', '', '']);
    const { ops } = reconcileTables(view, desiredSelfRows(sampleSelf));
    assert.equal(ops.length, 0, '空编号行保留，其余行无变化，应为零操作');
}

// 6. 单行表多余行回收
{
    const view = applyDesiredToView(bridgeOnlyView, desiredWorldRows(sampleWorld));
    view.sheet_dpWorldState.content.push(['2', '9', '750', '午后', '晴', '乌坦城', '斗气大陆', '崭露头角', '无', '2026-10-29T00:00:00.000Z']);
    const { ops } = reconcileTables(view, desiredWorldRows(sampleWorld));
    const deletes = ops.filter(op => op.kind === 'deleteRow');
    assert.deepEqual(deletes, [{ kind: 'deleteRow', table: '世界·现状', rowIndex: 2 }]);
}

// 7. 表缺失要上报（模板没铺成功时桥会停手）
{
    const { missingTables } = reconcileTables({}, desiredWorldRows(sampleWorld));
    assert.deepEqual(missingTables.sort(), ['世界·事件', '世界·现状', '世界·任务'].sort());
}

// 8. sameSelfState / sameWorldState 的口径：log 不参与（不镜像），updatedAt 随镜像走
{
    const a = JSON.parse(JSON.stringify(sampleSelf));
    const b = JSON.parse(JSON.stringify(sampleSelf));
    b.log = [{ floor: 99, note: '不同流水' }];
    assert.ok(sameSelfState(a, b));
    b.gold = 1;
    assert.ok(!sameSelfState(a, b));
    const wa = JSON.parse(JSON.stringify(sampleWorld));
    const wb = JSON.parse(JSON.stringify(sampleWorld));
    wb.log = [{ note: '不同流水' }];
    assert.ok(sameWorldState(wa, wb));
}

// ---------- 记忆：小/大两张表往返 + reconcile ----------

const sampleMemory = {
    schemaVersion: 2,
    entries: [
        { id: 'm1', tier: 'small', text: '穆蛇在坊市被打跑', quote: '把灵石留下。', basis: '第 6 楼', related: ['穆蛇'], aliases: ['穆老大'], weight: 'minor', tag: '', day: 6, done: false, resolvedDay: null, note: '', recallCount: 2, lastRecallDay: 9 },
        { id: 'm2', tier: 'small', text: '掌柜多找了一枚铜板', quote: '', basis: '第 8 楼', related: ['坊市掌柜'], aliases: [], weight: 'minor', day: 8, done: true, resolvedDay: 9, note: '', recallCount: 0, lastRecallDay: null },
        { id: 'm3', tier: 'big', text: '欠药老一条命', quote: '这条命，是老夫捡回来的。', basis: '第 3 楼', related: ['药老'], aliases: ['药尘'], weight: 'major', tag: 'grudge', day: 3, done: false, resolvedDay: null, note: '', recallCount: 5, lastRecallDay: 12 },
        { id: 'm4', tier: 'big', text: '云韵留了半句话', quote: '', basis: '第 9 楼', related: ['云韵'], aliases: [], weight: 'minor', tag: '', day: 9, done: false, resolvedDay: null, note: '', recallCount: 0, lastRecallDay: null },
    ],
    log: [{ note: '流水不镜像' }],
    updatedAt: '2026-10-29T00:00:00.000Z',
};

// 9. 状态 → 行 → 表 → 状态 往返：小/大分流、引文/别名/标签列、了结列都对得上；召回统计不镜像
{
    const groups = desiredMemoryRows(sampleMemory);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].rows.length, 2, '小记忆两条');
    assert.equal(groups[1].rows.length, 2, '大记忆两条');
    const view = applyDesiredToView({}, groups);
    const derived = memoryStateFromTables(view);
    assert.equal(derived.empty, false);
    assert.ok(sameMemoryState(derived.state, sampleMemory), '记忆往返应等值（召回统计不参与）');
    assert.equal(derived.state.entries[0].tier, 'small');
    assert.equal(derived.state.entries[0].quote, '把灵石留下。');
    assert.deepEqual(derived.state.entries[0].aliases, ['穆老大']);
    assert.equal(derived.state.entries[2].tag, 'grudge');
    assert.equal(derived.state.entries[2].weight, 'major');
    assert.equal(derived.state.entries[2].quote, '这条命，是老夫捡回来的。');
    assert.equal(derived.state.entries[1].done, true);
    assert.deepEqual(derived.state.entries[0].related, ['穆蛇']);
}

// 10. 空账判定 + 同表 reconcile（了结一条：updateRow 只动已了结/了结日/备注）
{
    const bridgeView = buildBridgeSheets();
    const empty = memoryStateFromTables(bridgeView);
    assert.equal(empty.empty, true);
    const view = applyDesiredToView(bridgeView, desiredMemoryRows(sampleMemory));
    assert.equal(reconcileTables(view, desiredMemoryRows(sampleMemory)).ops.length, 0, '无变化零操作');
    const changed = JSON.parse(JSON.stringify(sampleMemory));
    changed.entries[0].done = true;
    changed.entries[0].resolvedDay = 14;
    changed.entries[0].note = '此事翻篇';
    const { ops } = reconcileTables(view, desiredMemoryRows(changed));
    assert.deepEqual(ops, [{ kind: 'updateRow', table: '小记忆', rowIndex: 1, data: { 已了结: '是', 了结日: '14', 备注: '此事翻篇' } }]);
    // 层级迁移（转大）：小表删行 + 大表插行
    const promoted = JSON.parse(JSON.stringify(sampleMemory));
    promoted.entries[0].tier = 'big';
    const { ops: tierOps } = reconcileTables(view, desiredMemoryRows(promoted));
    assert.deepEqual(tierOps.filter(op => op.kind === 'deleteRow'), [{ kind: 'deleteRow', table: '小记忆', rowIndex: 1 }]);
    assert.equal(tierOps.filter(op => op.kind === 'insertRow').length, 1);
}

// 11. sameMemoryState 口径：log 不参与，entries 参与
{
    const a = JSON.parse(JSON.stringify(sampleMemory));
    const b = JSON.parse(JSON.stringify(sampleMemory));
    b.log = [{ note: '不同流水' }];
    assert.ok(sameMemoryState(a, b));
    b.entries[0].tier = 'big';
    assert.ok(!sameMemoryState(a, b));
}
