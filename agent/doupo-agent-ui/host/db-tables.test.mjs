import assert from 'node:assert/strict';
import {
    ALL_TABLE_DEFS,
    SELF_TABLE_DEFS,
    MEMORY_TABLE_DEFS,
    RETIRED_TABLE_NAMES,
    buildBridgeSheets,
    mergeBridgeSheets,
    sanitizeForeignDdl,
    desiredSelfRows,
    desiredMemoryRows,
    reconcileTables,
    selfStateFromTables,
    memoryStateFromTables,
    applyDesiredToView,
    sameSelfState,
    preserveUnmappedSelfFields,
    sameMemoryState,
} from './db-tables.js';

// OPT-012: DB owns only its projected fields; stable IDs preserve hidden state.
{
    const current = {
        gold: 10, skills: [{ id: 's1', name: '掌法', progress: '熟练', note: '师授' }],
        items: [{ id: 'b1', name: '丹', count: 2, note: '留用' }],
        crafts: [{ id: 'c1', name: '散', count: 7, note: '旧注' }],
        goals: [{ id: 'g1', title: '旧', note: '自定', source: '手动' }],
        _runtime: { version: 1, seq: 4, lastFloor: { floor: 3, undo: [{ op: 'setGold', amount: 0 }] } },
    };
    const projected = { gold: 10, skills: [{ id: 's1', name: '新掌法' }], items: [{ id: 'b1', name: '丹', count: 3 }], crafts: [{ id: 'c1', name: '散', note: 'DB注' }], goals: [{ id: 'g1', title: '新' }] };
    const merged = preserveUnmappedSelfFields(projected, current);
    assert.equal(merged.skills[0].progress, '熟练');
    assert.equal(merged.items[0].note, '留用');
    assert.equal(merged.crafts[0].count, 7);
    assert.equal(merged.crafts[0].note, 'DB注');
    assert.equal(merged.goals[0].source, '手动');
    assert.deepEqual(merged._runtime, current._runtime);
    assert.throws(() => preserveUnmappedSelfFields({ ...projected, gold: 20 }, current), error => error.code === 'db_runtime_conflict');
    assert.equal(current.items[0].count, 2);
}

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
assert.equal(SELF_TABLE_DEFS.length, 10);
assert.equal(MEMORY_TABLE_DEFS.length, 2);
assert.equal(new Set(MEMORY_TABLE_DEFS.map(def => def.name)).size, 2);
assert.deepEqual(MEMORY_TABLE_DEFS.map(def => def.name), ['小记忆', '大记忆']);
assert.equal(ALL_TABLE_DEFS.length, 12);
// 世界运转不连数据库：世界三表不在桥接定义里，只存在于退役名单（合并导入时剔除）
assert.ok(!ALL_TABLE_DEFS.some(def => def.name.startsWith('世界·')), '世界表不得再进桥接定义');
assert.deepEqual([...RETIRED_TABLE_NAMES].sort(), ['世界·事件', '世界·现状', '世界·任务'].sort());

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

// 旧版副本（同名但表头对不上：预设导入或旧结构残留）让位：从包里剔除、按当前键与结构补上；
// 同名且结构一致（脚本导入会重生成拼音键）的原样保留，保证幂等
const staleTemplate = {
    mate: { type: 'chatSheets', version: 1 },
    sheet_na_jie_zhu_jue_dang_an: { name: '纳戒·主角档案', content: [['row_id', '姓名']] },
    sheet_xiao_ji_yi: { name: '小记忆', content: [['row_id', '内容']] },
};
const mergedStale = mergeBridgeSheets(staleTemplate);
assert.equal(mergedStale.replaced.length, 2, '两张表头过期的副本被标记为替换');
assert.equal(mergedStale.added.length, ALL_TABLE_DEFS.length - 2, '其余桥接表全量补上');
assert.ok(!('sheet_na_jie_zhu_jue_dang_an' in mergedStale.template) && !('sheet_xiao_ji_yi' in mergedStale.template), '旧键名副本从包里剔除');
assert.ok(mergedStale.template.sheet_dpProfile && mergedStale.template.sheet_dpMemorySmall, '被替换的表按当前键补上');
const mergedStaleAgain = mergeBridgeSheets(mergedStale.template);
assert.equal(mergedStaleAgain.added.length, 0, '替换后二次合并幂等');
assert.equal(mergedStaleAgain.replaced.length, 0, '替换后无残留副本');
const pinyinTemplate = {
    mate: { type: 'chatSheets', version: 1 },
    sheet_na_jie_zhu_jue_dang_an: {
        name: '纳戒·主角档案',
        content: [ALL_TABLE_DEFS[0].headers.slice()],
        sourceData: { ddl: ALL_TABLE_DEFS[0].ddl },
    },
};
const mergedPinyin = mergeBridgeSheets(pinyinTemplate);
assert.equal(mergedPinyin.replaced.length, 0, '同名同结构的拼音键表视为已有，不替换');
assert.equal(mergedPinyin.added.length, ALL_TABLE_DEFS.length - 1, '其余表照常补上');

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

// 校验器把表头 NFKC 归一后与注释做全等：表头和注释都是全角（原样相等）也会被判不匹配，
// 对齐检查必须按同一条 NFKC 口径判，否则这种表会被漏掉、整包导入连坐拒绝。
const wideForeign = {
    mate: { type: 'chatSheets', version: 1 },
    sheet_wide: {
        name: '全角表',
        content: [['row_id', '背包分类：核心材料', '进度（%）']],
        sourceData: { ddl: 'CREATE TABLE wide ( -- 全角表\n  row_id INTEGER PRIMARY KEY, -- 行号\n  core TEXT, -- 背包分类：核心材料\n  progress TEXT, -- 进度（%）\n);' },
    },
};
const sanitizedWide = sanitizeForeignDdl(wideForeign);
assert.notEqual(sanitizedWide, wideForeign, '全角自洽的表也必须被识别为不对齐');
assert.ok(sanitizedWide.sheet_wide.sourceData.ddl.includes('-- 背包分类:核心材料'), '全角冒号注释应重建为 NFKC 半角');
assert.ok(sanitizedWide.sheet_wide.sourceData.ddl.includes('-- 进度(%)'), '全角括号注释应重建为 NFKC 半角');
assert.deepEqual(sanitizedWide.sheet_wide.content, wideForeign.sheet_wide.content, '全角表的行内容不动');
assert.equal(
    sanitizeForeignDdl(sanitizedWide).sheet_wide.sourceData.ddl,
    sanitizedWide.sheet_wide.sourceData.ddl,
    '重建后的 DDL 按校验器口径已对齐，二次净化不再改写',
);
const cleanForeign = {
    mate: { type: 'chatSheets', version: 1 },
    sheet_en: {
        name: '英文表',
        content: [['row_id', '金币']],
        sourceData: { ddl: 'CREATE TABLE en ( -- 英文表\n  row_id INTEGER PRIMARY KEY, -- 行号\n  gold TEXT, -- 金币\n);' },
    },
};
assert.equal(sanitizeForeignDdl(cleanForeign), cleanForeign, '中文表头配 ASCII 列名（注释对不上）也符合校验器口径，不动');

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
    equipment: [{ id: 'e1', name: '复元甲', grade: '玄阶中品', type: '防具', source: '购置' }],
    treasures: [{ id: 'z1', name: '青莲地心火', grade: '异火榜第十九', type: '异火', source: '塔戈沙漠所得' }],
    items: [
        { id: 'b1', name: '回气丹', category: '丹药', grade: '一品', count: 3, equipped: false, source: '购买' },
        { id: 'b2', name: '玄重尺', category: '武器', grade: '中品', count: 1, equipped: true, source: '家传' },
    ],
    recipes: [{ id: 'r1', name: '回气丹', craft: '炼药', grade: '一品', materials: '凝骨草等' }],
    crafts: [{ id: 'c1', name: '回气散', craft: '炼药', startDay: 10, endDay: 13, status: 'open', note: '缺一味凝骨草' }],
    goals: [
        { id: 'g1', title: '三年之约雪前耻', name: '三年之约雪前耻', text: '三年之约，云岚宗一雪前耻，当众赢回萧家颜面', priority: '主线', due: '三年后', done: false },
        { id: 'g2', text: '凑齐焚决后续功法', priority: '支线', due: '', done: false },
    ],
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
assert.equal(derivedSelf.state.equipment[0].name, '复元甲', '装备栏往返（dp_equipment）');
assert.equal(derivedSelf.state.items[1].equipped, true);
assert.equal(derivedSelf.state.items[0].count, 3);
assert.equal(derivedSelf.state.crafts[0].status, 'open');
assert.equal(derivedSelf.state.goals.length, 2, '两条目标都往返');
assert.equal(derivedSelf.state.goals[0].title, '三年之约雪前耻', '显式短标题走标题列往返');
assert.equal(derivedSelf.state.goals[0].done, false);
assert.equal(derivedSelf.state.goals[1].title, '凑齐焚决后续功法', '无标题老目标解码时从内容补兼容短标题');
assert.deepEqual(derivedSelf.state.log, [], '流水不镜像，收养时由调用方保留');

// 空表判定：全空状态标 empty
const emptySelf = selfStateFromTables(applyDesiredToView({}, desiredSelfRows({
    profile: {}, realm: {}, gold: 0, day: 1, titles: [], techniques: [], skills: [], items: [], recipes: [], crafts: [], goals: [],
})));
assert.equal(emptySelf.empty, true);

// 退役桥接表剔除：旧版世界三表按表名从包里删掉（merge 整包替换 → 聊天模板同步移除），幂等
{
    const legacyTemplate = {
        mate: { type: 'chatSheets', version: 1 },
        sheet_foreign: { name: '背包与货币', content: [['row_id', '金币']] },
        sheet_dpWorldState: { name: '世界·现状', content: [['row_id', '剧情日']] },
        sheet_shi_jian: { name: '世界·事件', content: [['row_id', '编号']] },
        sheet_ren_wu: { name: '世界·任务', content: [['row_id', '编号']] },
    };
    const merged = mergeBridgeSheets(legacyTemplate);
    assert.equal(merged.removed.length, 3, '三张退役世界表被剔除');
    assert.deepEqual([...merged.removed].sort(), ['世界·事件', '世界·现状', '世界·任务'].sort());
    assert.ok(!Object.keys(merged.template).some(key => key.startsWith('sheet_dpWorld')), '退役表不再随包携带');
    assert.ok(merged.template.sheet_foreign, '外来表原样保留');
    assert.equal(merged.added.length, ALL_TABLE_DEFS.length, '现役桥接表照常补上');
    const mergedAgain = mergeBridgeSheets(merged.template);
    assert.equal(mergedAgain.removed.length, 0, '剔除后幂等');
    assert.equal(mergedAgain.added.length, 0);
}

// 旧表名改名升级：配方→炼丹、炼制台→炼器 原位改名，行与表头不动，幂等
{
    const legacyNames = {
        mate: { type: 'chatSheets', version: 1 },
        sheet_dpRecipesOld: {
            name: '纳戒·配方',
            content: [
                ['row_id', '编号', '名称', '类别', '品阶', '材料'],
                ['1', 'r1', '回气丹', '炼药', '一品', '凝骨草等'],
            ],
        },
        sheet_dpCraftsOld: {
            name: '纳戒·炼制台',
            content: [
                ['row_id', '编号', '名称', '类别', '开始日', '结束日', '状态', '备注'],
                ['1', 'c1', '回气散', '炼药', '10', '13', '进行中', '缺一味凝骨草'],
            ],
        },
    };
    const merged = mergeBridgeSheets(legacyNames);
    assert.ok(merged.migrated.includes('纳戒·配方') && merged.migrated.includes('纳戒·炼制台'), '改名要上报 migrated，调用方据此回导模板');
    assert.ok(!merged.replaced.includes('纳戒·炼丹') && !merged.added.includes('纳戒·炼丹'), '改名后按新名命中，不补空表');
    const recipes = Object.values(merged.template).find(sheet => sheet?.name === '纳戒·炼丹');
    const crafts = Object.values(merged.template).find(sheet => sheet?.name === '纳戒·炼器');
    assert.deepEqual(recipes.content[1], ['1', 'r1', '回气丹', '炼药', '一品', '凝骨草等'], '改名不动行');
    assert.deepEqual(crafts.content[1], ['1', 'c1', '回气散', '炼药', '10', '13', '进行中', '缺一味凝骨草']);
    const mergedAgain = mergeBridgeSheets(merged.template);
    assert.deepEqual(mergedAgain.migrated, [], '改名后幂等');
    assert.deepEqual(mergedAgain.added, []);
}

// 旧版目标表原位迁移：merge 时补「标题」列并从内容补兼容短标题，老行一条不丢，幂等
{
    const legacyGoals = {
        mate: { type: 'chatSheets', version: 1 },
        sheet_dpGoalsOld: {
            name: '纳戒·目标',
            content: [
                ['row_id', '编号', '内容', '优先级', '期限', '达成'],
                ['1', 'g1', '三年之约，云岚宗一雪前耻', '主线', '三年后', '否'],
                ['2', 'g2', '凑齐焚决后续功法', '支线', '', ''],
            ],
        },
    };
    const merged = mergeBridgeSheets(legacyGoals);
    assert.ok(!merged.replaced.includes('纳戒·目标'), '旧目标表原位迁移，不整表替换');
    assert.ok(!merged.added.includes('纳戒·目标'), '同名表已在，不补新表');
    assert.deepEqual(merged.migrated, ['纳戒·目标'], '迁移要单独上报，调用方据此回导模板');
    const sheet = Object.values(merged.template).find(sheet => sheet?.name === '纳戒·目标');
    assert.deepEqual(sheet.content[0], ['row_id', '编号', '标题', '内容', '优先级', '期限', '达成'], '原位补「标题」列');
    assert.deepEqual(sheet.content[1], ['1', 'g1', '三年之约', '三年之约，云岚宗一雪前耻', '主线', '三年后', '否'], '老行保留，短标题从内容第一分句补出');
    assert.deepEqual(sheet.content[2], ['2', 'g2', '凑齐焚决后续功法', '凑齐焚决后续功法', '支线', '', '']);
    assert.ok(sheet.sourceData.ddl.includes('goal_title'), 'DDL 随迁移换成新结构，否则整包导入被校验器连坐拒绝');
    const mergedAgain = mergeBridgeSheets(merged.template);
    assert.deepEqual(mergedAgain.migrated, [], '迁移后表头吻合，幂等不再动表');
    assert.deepEqual(mergedAgain.replaced, []);
    assert.deepEqual(mergedAgain.added, []);
    const sheetAgain = Object.values(mergedAgain.template).find(sheet => sheet?.name === '纳戒·目标');
    assert.deepEqual(sheetAgain.content, sheet.content, '重复 merge 行内容一字不动');
}

// 目标表解码容忍旧结构：没跑过迁移的旧表（无标题列、行宽 6）也能读出来
{
    const oldView = {
        sheet_dpGoalsOld: {
            name: '纳戒·目标',
            content: [
                ['row_id', '编号', '内容', '优先级', '期限', '达成'],
                ['1', 'g1', '三年之约，云岚宗一雪前耻', '主线', '三年后', '是'],
                ['2', '', '手工加的行', '支线', '', ''],
            ],
        },
    };
    const decoded = selfStateFromTables(oldView);
    assert.equal(decoded.state.goals.length, 2, '按表头找列，旧宽度行不丢');
    assert.equal(decoded.state.goals[0].id, 'g1');
    assert.equal(decoded.state.goals[0].title, '三年之约', '无标题列时从内容补兼容短标题');
    assert.equal(decoded.state.goals[0].text, '三年之约，云岚宗一雪前耻');
    assert.equal(decoded.state.goals[0].done, true);
    assert.equal(decoded.state.goals[1].id, 'g2', '编号空的行按序补号');
}

// ---------- reconcile：最小差异 ----------

const bridgeOnlyView = buildBridgeSheets(); // 只有表头行

// 1. 空表 + 有状态 → 全部 insertRow
{
    const { ops, missingTables } = reconcileTables(bridgeOnlyView, desiredSelfRows(sampleSelf));
    assert.deepEqual(missingTables, [], '模板片段齐表时不应报缺表');
    assert.equal(ops.filter(op => op.kind === 'insertRow').length, 12, '档案1+称号1+功法1+斗技1+装备1+天材地宝1+行囊2+配方1+炼制1+目标2');
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

// 6. 单行表多余行回收（档案表是单行表：sampleSelf 档案 + 手加的第二行）
{
    const view = applyDesiredToView(bridgeOnlyView, desiredSelfRows(sampleSelf));
    view.sheet_dpProfile.content.push(['2', '别人', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    const { ops } = reconcileTables(view, desiredSelfRows(sampleSelf));
    const deletes = ops.filter(op => op.kind === 'deleteRow');
    assert.deepEqual(deletes, [{ kind: 'deleteRow', table: '纳戒·主角档案', rowIndex: 2 }]);
}

// 7. 表缺失要上报（模板没铺成功时桥会停手）
{
    const { missingTables } = reconcileTables({}, desiredSelfRows(sampleSelf));
    assert.deepEqual(missingTables.sort(), [
        '纳戒·主角档案', '纳戒·称号', '纳戒·功法', '纳戒·斗技', '纳戒·装备',
        '纳戒·天材地宝', '纳戒·行囊', '纳戒·炼丹', '纳戒·炼器', '纳戒·目标',
    ].sort());
}

// 8. sameSelfState 的口径：log 不参与（不镜像），updatedAt 随镜像走
{
    const a = JSON.parse(JSON.stringify(sampleSelf));
    const b = JSON.parse(JSON.stringify(sampleSelf));
    b.log = [{ floor: 99, note: '不同流水' }];
    assert.ok(sameSelfState(a, b));
    b.gold = 1;
    assert.ok(!sameSelfState(a, b));
}

// ---------- 记忆：小/大两张表往返 + reconcile ----------

const sampleMemory = {
    schemaVersion: 2,
    entries: [
        { id: 'm1', tier: 'small', text: '穆蛇在坊市被打跑', quote: '把灵石留下。', basis: '第 6 楼', related: ['穆蛇'], aliases: ['穆老大'], weight: 'minor', tag: '', day: 6, note: '' },
        { id: 'm2', tier: 'small', text: '掌柜多找了一枚铜板', quote: '', basis: '第 8 楼', related: ['坊市掌柜'], aliases: [], weight: 'minor', day: 8, note: '掌柜后来补了钱' },
        { id: 'm3', tier: 'big', text: '欠药老一条命', quote: '这条命，是老夫捡回来的。', basis: '第 3 楼', related: ['药老'], aliases: ['药尘'], weight: 'major', tag: 'grudge', day: 3, note: '' },
        { id: 'm4', tier: 'big', text: '云韵留了半句话', quote: '', basis: '第 9 楼', related: ['云韵'], aliases: [], weight: 'minor', tag: '', day: 9, note: '' },
    ],
    log: [{ note: '流水不镜像' }],
    updatedAt: '2026-10-29T00:00:00.000Z',
};

// 9. 状态 → 行 → 表 → 状态 往返：小/大分流、引文/别名/标签列都对得上；了结列已随概念删除
{
    const groups = desiredMemoryRows(sampleMemory);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].rows.length, 2, '小记忆两条');
    assert.equal(groups[1].rows.length, 2, '大记忆两条');
    const view = applyDesiredToView({}, groups);
    const derived = memoryStateFromTables(view);
    assert.equal(derived.empty, false);
    assert.ok(sameMemoryState(derived.state, sampleMemory), '记忆往返应等值');
    assert.equal(derived.state.entries[0].tier, 'small');
    assert.equal(derived.state.entries[0].quote, '把灵石留下。');
    assert.deepEqual(derived.state.entries[0].aliases, ['穆老大']);
    assert.equal(derived.state.entries[2].tag, 'grudge');
    assert.equal(derived.state.entries[2].weight, 'major');
    assert.equal(derived.state.entries[2].quote, '这条命，是老夫捡回来的。');
    assert.equal(derived.state.entries[1].note, '掌柜后来补了钱');
    assert.equal('done' in derived.state.entries[1], false, '已了结字段不再进出表');
    assert.deepEqual(derived.state.entries[0].related, ['穆蛇']);
}

// 9½. 旧 12 列结构（含已了结/了结日）的表也能正确收养：列位按表头名定位，不写死下标
{
    const view = applyDesiredToView({}, desiredMemoryRows(sampleMemory));
    const legacy = JSON.parse(JSON.stringify(view));
    const smallKey = ALL_TABLE_DEFS.find(def => def.name === '小记忆').key;
    const sheet = legacy[smallKey];
    // 把表头插回已了结/了结日两列（新定义没有），行里补上旧值——模拟数据库里的旧版表
    sheet.content[0] = ['row_id', '编号', '内容', '引文', '依据', '关联', '别名', '分量', '记于日', '已了结', '了结日', '备注'];
    sheet.content[1].splice(9, 0, '否', '');
    sheet.content[2].splice(9, 0, '是', '14');
    const derived = memoryStateFromTables(legacy);
    assert.equal(derived.empty, false);
    const m1 = derived.state.entries.find(entry => entry.id === 'm1');
    const m2 = derived.state.entries.find(entry => entry.id === 'm2');
    assert.equal(m1.note, '', 'm1 备注按表头名读到正确的列');
    assert.equal(m2.note, '掌柜后来补了钱', '备注读的是备注列本身，不是旁边的已了结列');
    assert.equal(m2.text, '掌柜多找了一枚铜板', '正文列不受结构差异影响');
    assert.equal('done' in m2, false, '已了结概念不复活');
}

// 10. 空账判定 + 同表 reconcile（改备注一条：updateRow 只动备注列；了结列已删除）
{
    const bridgeView = buildBridgeSheets();
    const empty = memoryStateFromTables(bridgeView);
    assert.equal(empty.empty, true);
    const view = applyDesiredToView(bridgeView, desiredMemoryRows(sampleMemory));
    assert.equal(reconcileTables(view, desiredMemoryRows(sampleMemory)).ops.length, 0, '无变化零操作');
    const changed = JSON.parse(JSON.stringify(sampleMemory));
    changed.entries[0].note = '后来穆蛇带了人来报复';
    changed.entries[0].weight = 'major';
    const { ops } = reconcileTables(view, desiredMemoryRows(changed));
    assert.deepEqual(ops, [{ kind: 'updateRow', table: '小记忆', rowIndex: 1, data: { 分量: '重大', 备注: '后来穆蛇带了人来报复' } }]);
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

// 12. 记忆表导出配置：小/大记忆都带 keyword 配置（形状保留），但默认关闭——
//     召回由扩展的召回决定负责，绿光条目开着会同一条记忆双份进提示词
{
    const fragment = buildBridgeSheets();
    const small = fragment[ALL_TABLE_DEFS.find(def => def.name === '小记忆').key];
    const big = fragment[ALL_TABLE_DEFS.find(def => def.name === '大记忆').key];
    for (const sheet of [small, big]) {
        assert.equal(sheet.exportConfig.enabled, false, '导出配置默认关闭（防双份注入）');
        assert.equal(sheet.exportConfig.entryType, 'keyword', '关键词召回');
        assert.equal(sheet.exportConfig.keywords, '关联,别名', '触发词列=关联,别名');
        assert.equal(sheet.exportConfig.splitByRow, true, '逐行一条目');
        assert.ok(sheet.exportConfig.injectionTemplate.includes('$1'), '注入模板带行内容占位');
    }
    // 表头不再有已了结/了结日两列（表头在 content 首行）
    const smallHeaders = small.content[0];
    const bigHeaders = big.content[0];
    assert.ok(!smallHeaders.includes('已了结') && !smallHeaders.includes('了结日'), '小记忆表无了结列');
    assert.ok(!bigHeaders.includes('已了结') && !bigHeaders.includes('了结日'), '大记忆表无了结列');
}

// 13. 关联/别名镜像用逗号（数据库触发词拆分只认逗号），读取兼容顿号旧行
{
    const view = applyDesiredToView({}, desiredMemoryRows(sampleMemory));
    const smallRows = view[ALL_TABLE_DEFS.find(def => def.name === '小记忆').key].content;
    const m1 = smallRows.find(row => row[1] === 'm1');
    assert.equal(m1[5], '穆蛇', '关联列逗号连接（单值）');
    assert.equal(m1[6], '穆老大', '别名列逗号连接');
    const derived = memoryStateFromTables(view);
    assert.deepEqual(derived.state.entries[0].related, ['穆蛇']);
    // 顿号旧行也能读回
    const legacy = JSON.parse(JSON.stringify(view));
    const legacyRow = legacy[ALL_TABLE_DEFS.find(def => def.name === '小记忆').key].content.find(row => row[1] === 'm1');
    legacyRow[5] = '穆蛇、坊市';
    const legacyState = memoryStateFromTables(legacy);
    const legacyM1 = legacyState.state.entries.find(entry => entry.id === 'm1');
    assert.deepEqual(legacyM1.related, ['穆蛇', '坊市'], '顿号旧行兼容');
}

// 14. mergeBridgeSheets：同表同表头但导出配置对不上（数据库补了默认关闭）→ 原位刷新算 updated
{
    const existing = JSON.parse(JSON.stringify(buildBridgeSheets()));
    const bigKey = ALL_TABLE_DEFS.find(def => def.name === '大记忆').key;
    existing[bigKey].exportConfig = { enabled: false, entryType: 'constant', keywords: '', entryName: '大记忆', splitByRow: false, preventRecursion: true, injectionTemplate: '', extraIndexEnabled: false, extraIndexEntryName: '大记忆-索引', extraIndexColumns: [], extraIndexColumnModes: {}, extraIndexInjectionTemplate: '', entryPlacement: {}, extraIndexPlacement: {} };
    const merged = mergeBridgeSheets(existing);
    assert.equal(merged.added.length, 0, '表都在不补');
    assert.equal(merged.replaced.length, 0, '表头一致不替换');
    assert.equal(merged.updated.length, 1, '导出配置对不上要刷新');
    assert.equal(merged.updated[0], '大记忆');
    assert.equal(merged.template[bigKey].exportConfig.entryType, 'keyword', '刷新成定义的 keyword 配置');
    assert.equal(merged.template[bigKey].exportConfig.enabled, false, '刷新后仍是定义的默认关闭');
    assert.equal(merged.template[bigKey].exportConfig.keywords, '关联,别名');
    const mergedAgain = mergeBridgeSheets(merged.template);
    assert.equal(mergedAgain.updated.length, 0, '刷新后幂等');
}

// 15. 非记忆表不带导出配置（不污染其他桥接表）
{
    const fragment = buildBridgeSheets();
    const profileKey = ALL_TABLE_DEFS.find(def => def.name === '纳戒·主角档案').key;
    assert.equal(fragment[profileKey].exportConfig, undefined, '纳戒档案表不配导出');
}
