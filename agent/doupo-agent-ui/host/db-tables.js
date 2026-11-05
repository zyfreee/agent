/**
 * 数据库桥接的表结构与纯函数编解码。
 *
 * 纳戒与记忆的实质状态镜像到「龙血玄黄·数据库」（window.AutoCardUpdaterAPI）的表格里：
 * 表结构在这里定义（uid/表名/表头/DDL 固定），状态↔表格行的互转和差异协调（reconcile）
 * 全部是纯函数，不碰 window/DOM，可离线单测。API 调用见 db-bridge.js。
 *
 * 分工约定：数据库只连纳戒与记忆——世界运转（时钟/事件/任务）不进数据库，
 * 只跟扩展台账与聊天存档走；旧版本镜像过的三张世界表在合并导入时按表名剔除
 * （见 RETIRED_TABLE_NAMES）。所有权约定：这些表只由本扩展写。每张表的
 * initNode/insertNode/updateNode/deleteNode 都是「禁止操作。」，
 * updateConfig.updateFrequency=0 让它们退出数据库自己的 AI 自动更新调度，
 * 双写从根上排除；表头/DDL 改动必须同步改测试。
 */

import { deriveGoalTitle, normalizeGoal } from '../self/goal-data.js';

const PROHIBIT = '禁止操作。';

/**
 * 桥接表的自动化更新参数：updateFrequency=0 让数据库自己的 AI 填表调度器
 * 完全跳过这些表（update-scheduler 的参与条件是 frequency>0），从根上排除
 * 双写；其余 -1 = 沿用界面全局设置。uiSentinel=-1 是新语义标记，防止导入
 * 迁移把 0 改写回「沿用UI」——前提是 mate.updateConfigUiSentinel 也是 -1。
 */
const UPDATE_CONFIG = Object.freeze({
    uiSentinel: -1,
    contextDepth: -1,
    updateFrequency: 0,
    batchSize: -1,
    skipFloors: -1,
});

/**
 * 给合并后的模板置新语义标记。只有既有模板里不存在「旧语义 0=沿用UI」的表时
 * 才能置位：置位会跳过导入迁移，若旧表还带着 0，会被新运行时误读成「禁用」。
 * 置不了位的场合优雅降级——桥接表的 0 会被迁移改回 -1，退回跟随全局频率，
 * 仍有四节点的「禁止操作。」兜底。
 */
function markNewSentinel(template, addedKeys) {
    if (template.mate?.updateConfigUiSentinel === -1) return template;
    const foreignLegacyZero = Object.keys(template).some(key => {
        if (!key.startsWith('sheet_') || addedKeys.includes(key)) return false;
        const config = template[key]?.updateConfig;
        return config && ['contextDepth', 'updateFrequency', 'batchSize', 'skipFloors'].some(field => config[field] === 0);
    });
    if (!foreignLegacyZero) template.mate.updateConfigUiSentinel = -1;
    return template;
}

/** 单张表定义：headers 与 DDL 注释一一对应（第 0 列固定 row_id）。 */
function defineTable(key, name, englishName, headers, ddl, note, exportConfig) {
    return Object.freeze({
        key, name, englishName, headers, ddl, note,
        exportConfig: exportConfig ? Object.freeze(JSON.parse(JSON.stringify(exportConfig))) : null,
    });
}

/**
 * 记忆表的数据库「导出配置」（exportConfig）：龙血玄黄按每张表自带的这份配置生成世界书条目——
 * keyword 绿光条目逐行一条，触发词取 keywords 里列出的列，人名/地名命中最近楼层就整行注入。
 * 默认关闭（enabled:false）：记忆召回由扩展自己的召回决定负责（memory-recall.js，失败退回
 * 关键词兜底），注入预算与排序都在扩展侧控制；绿光条目开着会同一条记忆双份进提示词。
 * 配置形状保留，需要数据库侧召回时把 enabled 改回 true 即可。
 * 与 updateConfig.updateFrequency=0（AI 禁填）互不相干——导出是展示侧，双写防护照旧。
 */
function memoryExportConfig(entryName, order) {
    return {
        enabled: false,
        splitByRow: true,
        entryType: 'keyword',
        keywords: '关联,别名',
        preventRecursion: true,
        entryName,
        injectionTemplate: `<${entryName}>\n$1\n</${entryName}>`,
        extraIndexEnabled: false,
        extraIndexEntryName: `${entryName}-索引`,
        extraIndexColumns: [],
        extraIndexColumnModes: {},
        extraIndexInjectionTemplate: '',
        entryPlacement: { position: 'at_depth_as_system', depth: 999, order },
        extraIndexPlacement: { position: 'at_depth_as_system', depth: 999, order: order + 1 },
    };
}

const SELF_PROFILE = defineTable(
    'sheet_dpProfile',
    '纳戒·主角档案',
    'dp_profile',
    ['row_id', '姓名', '性别', '年龄', '种族', '出身', '所属', '斗气属性', '天赋', '外貌', '境界', '段位', '金币', '剧情日', '更新时间'],
    `CREATE TABLE dp_profile ( -- 主角档案表
  row_id INTEGER PRIMARY KEY, -- 行号
  char_name TEXT, -- 姓名
  gender TEXT, -- 性别
  age TEXT, -- 年龄
  race TEXT, -- 种族
  origin TEXT, -- 出身
  affiliation TEXT, -- 所属
  attribute TEXT, -- 斗气属性
  talent TEXT, -- 天赋
  appearance TEXT, -- 外貌
  realm TEXT, -- 境界
  stage TEXT, -- 段位
  gold INTEGER, -- 金币
  story_day INTEGER, -- 剧情日
  updated_at TEXT -- 更新时间
);`,
    '主角档案+境界+金币，有且仅有一行。只由斗破Agent扩展写入，AI 禁止操作。',
);

const SELF_TITLES = defineTable(
    'sheet_dpTitles',
    '纳戒·称号',
    'dp_titles',
    ['row_id', '称号'],
    `CREATE TABLE dp_titles ( -- 称号表
  row_id INTEGER PRIMARY KEY, -- 行号
  title TEXT NOT NULL -- 称号
);`,
    '称号清单，一列一称号。只由斗破Agent扩展写入，AI 禁止操作。',
);

const SELF_TECHNIQUES = defineTable(
    'sheet_dpTechniques',
    '纳戒·功法',
    'dp_techniques',
    ['row_id', '编号', '名称', '品阶', '类型', '进度', '来源'],
    `CREATE TABLE dp_techniques ( -- 功法表
  row_id INTEGER PRIMARY KEY, -- 行号
  entry_id TEXT NOT NULL, -- 编号
  name TEXT NOT NULL, -- 名称
  grade TEXT, -- 品阶
  type TEXT, -- 类型
  progress TEXT, -- 进度
  source TEXT -- 来源
);`,
    '功法清单，编号与扩展台账一致。只由斗破Agent扩展写入，AI 禁止操作。',
);

const SELF_SKILLS = defineTable(
    'sheet_dpSkills',
    '纳戒·斗技',
    'dp_skills',
    ['row_id', '编号', '名称', '品阶', '类型', '来源'],
    `CREATE TABLE dp_skills ( -- 斗技表
  row_id INTEGER PRIMARY KEY, -- 行号
  entry_id TEXT NOT NULL, -- 编号
  name TEXT NOT NULL, -- 名称
  grade TEXT, -- 品阶
  type TEXT, -- 类型
  source TEXT -- 来源
);`,
    '斗技清单，编号与扩展台账一致。只由斗破Agent扩展写入，AI 禁止操作。',
);

const SELF_EQUIPMENT = defineTable(
    'sheet_dpEquipment',
    '纳戒·装备',
    'dp_equipment',
    ['row_id', '编号', '名称', '品阶', '类型', '来源'],
    `CREATE TABLE dp_equipment ( -- 装备栏表
  row_id INTEGER PRIMARY KEY, -- 行号
  entry_id TEXT NOT NULL, -- 编号
  name TEXT NOT NULL, -- 名称
  grade TEXT, -- 品阶
  type TEXT, -- 类型
  source TEXT -- 来源
);`,
    '装备栏（穿戴中的武器/防具/饰品），编号与扩展台账一致。只由斗破Agent扩展写入，AI 禁止操作。',
);

const SELF_TREASURES = defineTable(
    'sheet_dpTreasures',
    '纳戒·天材地宝',
    'dp_treasures',
    ['row_id', '编号', '名称', '品阶', '类别', '来源'],
    `CREATE TABLE dp_treasures ( -- 天材地宝表
  row_id INTEGER PRIMARY KEY, -- 行号
  entry_id TEXT NOT NULL, -- 编号
  name TEXT NOT NULL, -- 名称
  grade TEXT, -- 品阶
  type TEXT, -- 类别
  source TEXT -- 来源
);`,
    '天材地宝（异火、妖丹、灵矿、先天灵物之类），编号与扩展台账一致。只由斗破Agent扩展写入，AI 禁止操作。',
);

const SELF_ITEMS = defineTable(
    'sheet_dpItems',
    '纳戒·行囊',
    'dp_items',
    ['row_id', '编号', '名称', '类别', '品阶', '数量', '装备中', '来源'],
    `CREATE TABLE dp_items ( -- 行囊表
  row_id INTEGER PRIMARY KEY, -- 行号
  entry_id TEXT NOT NULL, -- 编号
  name TEXT NOT NULL, -- 名称
  category TEXT, -- 类别
  grade TEXT, -- 品阶
  count INTEGER, -- 数量
  equipped TEXT, -- 装备中
  source TEXT -- 来源
);`,
    '行囊物品，同名同类别在扩展侧已并账。只由斗破Agent扩展写入，AI 禁止操作。',
);

const SELF_RECIPES = defineTable(
    'sheet_dpRecipes',
    '纳戒·炼丹',
    'dp_recipes',
    ['row_id', '编号', '名称', '类别', '品阶', '材料'],
    `CREATE TABLE dp_recipes ( -- 炼丹表
  row_id INTEGER PRIMARY KEY, -- 行号
  entry_id TEXT NOT NULL, -- 编号
  name TEXT NOT NULL, -- 名称
  craft TEXT, -- 类别
  grade TEXT, -- 品阶
  materials TEXT -- 材料
);`,
    '已掌握的丹方与器谱（类别列区分炼药/炼器）。只由斗破Agent扩展写入，AI 禁止操作。',
);

const SELF_CRAFTS = defineTable(
    'sheet_dpCrafts',
    '纳戒·炼器',
    'dp_crafts',
    ['row_id', '编号', '名称', '类别', '开始日', '结束日', '状态', '备注'],
    `CREATE TABLE dp_crafts ( -- 炼器表
  row_id INTEGER PRIMARY KEY, -- 行号
  entry_id TEXT NOT NULL, -- 编号
  name TEXT NOT NULL, -- 名称
  craft TEXT, -- 类别
  start_day INTEGER, -- 开始日
  end_day INTEGER, -- 结束日
  status TEXT, -- 状态
  note TEXT -- 备注
);`,
    '炼丹与炼器的进行中/成功/失败记录，日期按世界时钟。只由斗破Agent扩展写入，AI 禁止操作。',
);

const SELF_GOALS = defineTable(
    'sheet_dpGoals',
    '纳戒·目标',
    'dp_goals',
    ['row_id', '编号', '标题', '内容', '优先级', '期限', '达成'],
    `CREATE TABLE dp_goals ( -- 目标表
  row_id INTEGER PRIMARY KEY, -- 行号
  entry_id TEXT NOT NULL, -- 编号
  goal_title TEXT, -- 标题
  goal_text TEXT NOT NULL, -- 内容
  priority TEXT, -- 优先级
  due TEXT, -- 期限
  done TEXT -- 达成
);`,
    '目标与约定（短标题进列表与注入，完整内容进详情；主线标星在优先级里）。只由斗破Agent扩展写入，AI 禁止操作。',
);

const MEMORY_SMALL = defineTable(
    'sheet_dpMemorySmall',
    '小记忆',
    'dp_memory_small',
    ['row_id', '编号', '内容', '引文', '依据', '关联', '别名', '分量', '记于日', '备注'],
    `CREATE TABLE dp_memory_small ( -- 小记忆表
  row_id INTEGER PRIMARY KEY, -- 行号
  entry_id TEXT NOT NULL, -- 编号
  content TEXT NOT NULL, -- 内容
  quote TEXT, -- 引文
  basis TEXT, -- 依据
  related TEXT, -- 关联
  aliases TEXT, -- 别名
  weight TEXT, -- 分量
  day INTEGER, -- 记于日
  note TEXT -- 备注
);`,
    '小记忆（轻量近事；关联/别名是人名/地名/物名、逗号分隔，是数据库关键词召回的触发词；引文=当时的一句原话）。只由斗破Agent扩展写入，AI 禁止操作。',
    memoryExportConfig('记忆近事', 10022),
);

const MEMORY_BIG = defineTable(
    'sheet_dpMemoryBig',
    '大记忆',
    'dp_memory_big',
    ['row_id', '编号', '内容', '引文', '依据', '关联', '别名', '标签', '分量', '记于日', '备注'],
    `CREATE TABLE dp_memory_big ( -- 大记忆表
  row_id INTEGER PRIMARY KEY, -- 行号
  entry_id TEXT NOT NULL, -- 编号
  content TEXT NOT NULL, -- 内容
  quote TEXT, -- 引文
  basis TEXT, -- 依据
  related TEXT, -- 关联
  aliases TEXT, -- 别名
  tag TEXT, -- 标签
  weight TEXT, -- 分量
  day INTEGER, -- 记于日
  note TEXT -- 备注
);`,
    '大记忆（值得一直记住的事；标签列=恩怨/情报/伏笔/大事记，可空；关联/别名是人名/地名/物名、逗号分隔，是数据库关键词召回的触发词；引文=当时的一句原话）。只由斗破Agent扩展写入，AI 禁止操作。',
    memoryExportConfig('记忆存储', 10020),
);

export const MEMORY_TABLE_DEFS = Object.freeze([MEMORY_SMALL, MEMORY_BIG]);
const MEMORY_TABLE_BY_TIER = Object.freeze({ small: MEMORY_SMALL, big: MEMORY_BIG });

export const SELF_TABLE_DEFS = Object.freeze([
    SELF_PROFILE, SELF_TITLES, SELF_TECHNIQUES, SELF_SKILLS, SELF_EQUIPMENT, SELF_TREASURES, SELF_ITEMS,
    SELF_RECIPES, SELF_CRAFTS, SELF_GOALS,
]);
export const ALL_TABLE_DEFS = Object.freeze([...SELF_TABLE_DEFS, ...MEMORY_TABLE_DEFS]);

/**
 * 退役桥接表（按中文表名认）：旧版本曾把世界运转镜像进数据库，现在世界不连数据库，
 * 这些残留副本在 mergeBridgeSheets 里按名剔除——merge 导入是整包替换，不随包携带
 * 就会从聊天模板里删掉，数据无损失（世界真账本一直在扩展台账与聊天存档里）。
 */
export const RETIRED_TABLE_NAMES = Object.freeze(['世界·现状', '世界·事件', '世界·任务']);

/**
 * 改名过的桥接表（按中文表名认）：配方→炼丹、炼制台→炼器 只是表名升级，
 * 表头与数据不动。merge 时把旧表名原位改成新名并上报 migrated——不改名的话
 * 旧表会当外来表留在聊天里，新表再补一份空的，同一份数据就分家了。
 */
export const RENAMED_TABLE_NAMES = Object.freeze({ '纳戒·配方': '纳戒·炼丹', '纳戒·炼制台': '纳戒·炼器' });

const TABLE_BY_KEY = new Map(ALL_TABLE_DEFS.map(def => [def.key, def]));
const TABLE_BY_NAME = new Map(ALL_TABLE_DEFS.map(def => [def.name, def]));

export function tableDefByKey(key) {
    return TABLE_BY_KEY.get(key) || null;
}

export function tableDefByName(name) {
    return TABLE_BY_NAME.get(name) || null;
}

/** 模板片段：mate + 全部桥接表（仅表头行，数据由镜像写入，不进模板）。 */
export function buildBridgeSheets() {
    const fragment = { mate: { type: 'chatSheets', version: 1, updateConfigUiSentinel: -1 } };
    for (const def of ALL_TABLE_DEFS) {
        fragment[def.key] = {
            uid: def.key,
            name: def.name,
            sourceData: {
                note: def.note,
                initNode: PROHIBIT,
                insertNode: PROHIBIT,
                updateNode: PROHIBIT,
                deleteNode: PROHIBIT,
                ddl: def.ddl,
            },
            updateConfig: { ...UPDATE_CONFIG },
            ...(def.exportConfig ? { exportConfig: JSON.parse(JSON.stringify(def.exportConfig)) } : {}),
            content: [def.headers.slice()],
        };
    }
    return fragment;
}

/**
 * 数据库脚本导入时会按表名转拼音重生成 sheet 键（不保留包里的键），所以桥接表的
 * 身份只能认「表名」：已有同名表且表头与当前定义一致 → 原样保留（幂等）；
 * 同名但表头对不上（旧版结构/预设残留副本）→ 剔除让位，按当前定义补进包里；
 * 同名都没有 → 直接补。merge 导入是整包替换，包里剔除的旧键会从聊天模板删掉，
 * 数据库校验器也不会再因同名连坐拒绝整包。表内容以扩展状态为准，镜像会按当前结构重写。
 * 同名同表头但导出配置对不上（比如数据库补了默认关闭的 exportConfig）→ 原位刷成当前定义，
 * 算进 updated——否则记忆表的关键词召回配置永远送不进已建好的表。
 * 旧版目标表（无「标题」列）→ 原位补列迁移、保住全部老行，算进 migrated；
 * migrated 非空时调用方必须回导模板，迁移才会落进数据库。
 * 返回 { template, added, replaced, updated, removed, migrated }；existing 为空时返回纯片段。
 */
/**
 * 旧版目标表签名（还没有「标题」列）。merge 导入是整包替换：同名表头对不上就整表
 * 剔除再补空新表——不做原位迁移，玩家立过的目标会在升级那一轮全部蒸发。
 */
const LEGACY_GOAL_HEADERS = Object.freeze(['row_id', '编号', '内容', '优先级', '期限', '达成']);

/**
 * 旧版目标表原位升级：在「编号」后插入「标题」列，老行从内容补一个兼容短标题
 * （与存档恢复同一口径）；DDL/节点配置整块换成当前定义——旧 DDL 列数对不上新表头，
 * 不换会被数据库校验器连坐拒绝整包。幂等：迁移后的表头不再命中旧签名，重复 merge
 * 不重复补列。返回是否迁移过。
 */
function migrateLegacyGoalSheet(sheet, fragmentSheet) {
    const headers = Array.isArray(sheet?.content?.[0]) ? sheet.content[0].map(header => String(header)) : [];
    const isLegacy = headers.length === LEGACY_GOAL_HEADERS.length
        && headers.every((header, index) => normalizeHeaderCell(header) === normalizeHeaderCell(LEGACY_GOAL_HEADERS[index]));
    if (!isLegacy) return false;
    const rows = sheet.content.slice(1).filter(row => Array.isArray(row));
    sheet.content = [
        ['row_id', '编号', '标题', '内容', '优先级', '期限', '达成'],
        ...rows.map(row => {
            const cells = row.slice(0, LEGACY_GOAL_HEADERS.length);
            return [...cells.slice(0, 2), deriveGoalTitle(cells[2]), ...cells.slice(2)];
        }),
    ];
    sheet.sourceData = JSON.parse(JSON.stringify(fragmentSheet.sourceData));
    sheet.updateConfig = JSON.parse(JSON.stringify(fragmentSheet.updateConfig));
    if (fragmentSheet.exportConfig) sheet.exportConfig = JSON.parse(JSON.stringify(fragmentSheet.exportConfig));
    else delete sheet.exportConfig;
    return true;
}

export function mergeBridgeSheets(existing) {
    const base = existing && typeof existing === 'object' && !Array.isArray(existing)
        ? JSON.parse(JSON.stringify(existing))
        : { mate: { type: 'chatSheets', version: 1 } };
    if (!base.mate || typeof base.mate !== 'object') base.mate = { type: 'chatSheets', version: 1 };
    const removed = [];
    const migrated = [];
    for (const [key, sheet] of Object.entries(base)) {
        if (!key.startsWith('sheet_')) continue;
        const name = normalizeHeaderCell(sheet?.name);
        if (name && RETIRED_TABLE_NAMES.includes(name)) {
            delete base[key];
            removed.push(sheet.name);
        }
    }
    const fragment = buildBridgeSheets();
    const added = [];
    const addedKeys = [];
    const replaced = [];
    const updated = [];
    // 改名升级：旧表名原位改成新名（表头数据一字不动），上报 migrated 让调用方回导落库。
    for (const sheet of Object.values(base)) {
        if (!sheet || typeof sheet !== 'object' || !sheet.name) continue;
        const newName = RENAMED_TABLE_NAMES[normalizeHeaderCell(sheet.name)];
        if (newName && sheet.name !== newName) {
            migrated.push(sheet.name);
            sheet.name = newName;
        }
    }
    for (const def of ALL_TABLE_DEFS) {
        const sameNameKey = Object.keys(base).find(key => key.startsWith('sheet_')
            && normalizeHeaderCell(base[key]?.name) === normalizeHeaderCell(def.name));
        if (sameNameKey) {
            // 目标表升级走原位迁移（保住全部老行），别让「表头对不上→空表顶掉」吃掉数据。
            if (def === SELF_GOALS && migrateLegacyGoalSheet(base[sameNameKey], fragment[def.key])) migrated.push(def.name);
            const headers = Array.isArray(base[sameNameKey]?.content?.[0])
                ? base[sameNameKey].content[0].map(header => String(header))
                : [];
            const current = headers.length === def.headers.length
                && headers.every((header, index) => normalizeHeaderCell(header) === normalizeHeaderCell(def.headers[index]));
            if (current) {
                const desired = def.exportConfig ? JSON.parse(JSON.stringify(def.exportConfig)) : null;
                if (desired && JSON.stringify(base[sameNameKey].exportConfig ?? null) !== JSON.stringify(desired)) {
                    base[sameNameKey].exportConfig = desired;
                    updated.push(def.name);
                }
                continue;
            }
            delete base[sameNameKey];
            base[def.key] = fragment[def.key];
            replaced.push(def.name);
            continue;
        }
        base[def.key] = fragment[def.key];
        added.push(def.name);
        addedKeys.push(def.key);
    }
    if (addedKeys.length) markNewSentinel(base, addedKeys);
    return { template: base, added, replaced, updated, removed, migrated };
}

// ---------- 导入包净化：外来表 DDL 对齐表头 ----------

/**
 * 数据库脚本导入模板时逐列校验「DDL 注释 = 表头」（首列 row_id 豁免），外来表自己的
 * 标点不一致（如全角「进度（%）」对半角表头「进度(%)」）会把整包导入连坐拒绝。
 * 注意校验器的比较口径：表头先做 NFKC 归一（全角：→半角:、全角（→半角( 等），注释
 * 不归一就做全等比较——所以「表头和注释都是全角」原样相等也会被判不匹配。
 * 这里的对齐检查与 DDL 重建都按同一条 NFKC 口径来，别用「原样 vs 原样」误判成已对齐。
 * 而它的 merge 导入是整包替换：外来表必须随包携带才能留在聊天模板里。
 * 这里只把注释与表头对不上的外来表 DDL 按表头重建——表名、表说明、行内容、
 * updateConfig 一律不动，桥接表本身（DDL 与表头同源生成）永不改写。
 */
export function sanitizeForeignDdl(template) {
    if (!template || typeof template !== 'object' || Array.isArray(template)) return template;
    const bridgeKeys = new Set(ALL_TABLE_DEFS.map(def => def.key));
    const foreignKeys = Object.keys(template).filter(key => key.startsWith('sheet_') && !bridgeKeys.has(key));
    let copied = null;
    for (const key of foreignKeys) {
        const sheet = template[key];
        if (!sheet || typeof sheet !== 'object') continue;
        const ddl = sheet.sourceData?.ddl;
        const headers = Array.isArray(sheet.content?.[0]) ? sheet.content[0].map(header => String(header)) : null;
        if (!headers || headers.length < 2 || typeof ddl !== 'string' || !ddl.trim()) continue;
        if (ddlCommentsAligned(ddl, headers)) continue;
        if (!copied) copied = JSON.parse(JSON.stringify(template));
        copied[key].sourceData.ddl = rebuildDdlFromHeaders(copied[key], headers);
    }
    return copied ?? template;
}

/** 校验器口径的字符串归一：NFKC（全角→半角）后去首尾空白。 */
function normalizeHeaderCell(value) {
    return String(value ?? '').normalize('NFKC').trim();
}

function isAsciiText(value) {
    return /^[\x00-\x7F]*$/.test(value);
}

/**
 * 镜像数据库校验器的逐列判定：归一表头必须等于 DDL 注释或物理列名，
 * 且表头是中文时物理列名必须是 ASCII。任何一列不过就算不对齐。
 */
function ddlCommentsAligned(ddl, headers) {
    const columns = [];
    for (const raw of ddl.split('\n')) {
        const line = raw.trim();
        if (!line || /^CREATE\b/i.test(line) || line.startsWith(')')) continue;
        const at = line.indexOf('--');
        const head = at >= 0 ? line.slice(0, at) : line;
        const name = head.trim().split(/\s+/)[0]?.replace(/[",`\[\]]/g, '').replace(/,\s*$/, '') ?? '';
        const comment = at >= 0 ? line.slice(at + 2).trim().replace(/,\s*$/, '') : '';
        columns.push({ name, comment });
    }
    if (columns.length !== headers.length) return false;
    return headers.slice(1).every((header, index) => {
        const normalized = normalizeHeaderCell(header);
        const column = columns[index + 1];
        if (normalized !== column.name && normalized !== column.comment) return false;
        return isAsciiText(normalized) || isAsciiText(column.name);
    });
}

/** 按表头重建能通过校验的 DDL：沿用原表名与表说明，列名用 c1..cN。 */
function rebuildDdlFromHeaders(sheet, headers) {
    const original = typeof sheet.sourceData?.ddl === 'string' ? sheet.sourceData.ddl : '';
    const nameMatch = original.match(/CREATE TABLE\s+([A-Za-z_][A-Za-z0-9_]*)/);
    const tableName = nameMatch ? nameMatch[1] : 'foreign_sheet';
    const noteMatch = original.match(/\(\s*--\s*(.+)\s*\n/);
    const note = noteMatch ? noteMatch[1].trim() : String(sheet.name ?? tableName);
    const parts = headers.map((header, index) => {
        // 注释写 NFKC 归一后的表头：校验器拿归一表头与注释做全等，原样全角注释过不了。
        const text = index === 0 ? 'row_id INTEGER PRIMARY KEY, -- 行号' : `c${index} TEXT, -- ${normalizeHeaderCell(header).replace(/\s+/g, ' ')}`;
        return index === headers.length - 1 ? `  ${text.replace(/,(\s*--)/, '$1')}` : `  ${text}`;
    });
    return `CREATE TABLE ${tableName} ( -- ${note}\n${parts.join('\n')}\n);`;
}

// ---------- 显示值 ↔ 状态值 ----------

const CRAFT_STATUS_LABELS = Object.freeze({ open: '进行中', success: '成功', fail: '失败' });
const YES = '是';
const NO = '否';

function invert(map) {
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
}
const CRAFT_STATUS_VALUES = invert(CRAFT_STATUS_LABELS);

function cell(value) {
    if (value === null || value === undefined) return '';
    return String(value);
}

function dayCell(value) {
    return Number.isInteger(value) && value > 0 ? String(value) : '';
}

function intCell(value) {
    return Number.isInteger(value) ? value : 0;
}

function flagCell(value) {
    return value ? YES : NO;
}

function readFlag(value) {
    return cell(value) === YES;
}

function readDay(value) {
    const num = Number(value);
    return Number.isInteger(num) && num > 0 ? num : null;
}

function readInt(value, fallback = 0) {
    const num = Number(value);
    return Number.isInteger(num) ? num : fallback;
}

function readLabel(value, valueMap, fallback) {
    return valueMap[cell(value)] ?? fallback;
}

// ---------- 状态 → 期望行（cell 数组，不含 row_id） ----------
// 每张表返回 { def, rows }；单行表 rows 至多一条，清单表按运行时的数组顺序。

export function desiredSelfRows(self) {
    const state = self && typeof self === 'object' ? self : {};
    const profile = state.profile && typeof state.profile === 'object' ? state.profile : {};
    const realm = state.realm && typeof state.realm === 'object' ? state.realm : {};
    const entry = (list, map) => (Array.isArray(list) ? list : []).filter(item => item && typeof item === 'object').map(map);
    return [
        {
            def: SELF_PROFILE,
            single: true,
            rows: [[
                cell(profile.name), cell(profile.gender), cell(profile.age), cell(profile.race),
                cell(profile.origin), cell(profile.affiliation), cell(profile.attribute), cell(profile.talent), cell(profile.appearance),
                cell(realm.realm), cell(realm.stage),
                intCell(state.gold), intCell(state.day), cell(state.updatedAt),
            ]],
        },
        { def: SELF_TITLES, rows: (Array.isArray(state.titles) ? state.titles : []).map(item => [cell(item)]) },
        { def: SELF_TECHNIQUES, rows: entry(state.techniques, e => [cell(e.id), cell(e.name), cell(e.grade), cell(e.type), cell(e.progress), cell(e.source)]) },
        { def: SELF_SKILLS, rows: entry(state.skills, e => [cell(e.id), cell(e.name), cell(e.grade), cell(e.type), cell(e.source)]) },
        { def: SELF_EQUIPMENT, rows: entry(state.equipment, e => [cell(e.id), cell(e.name), cell(e.grade), cell(e.type), cell(e.source)]) },
        { def: SELF_TREASURES, rows: entry(state.treasures, e => [cell(e.id), cell(e.name), cell(e.grade), cell(e.type), cell(e.source)]) },
        {
            def: SELF_ITEMS,
            rows: entry(state.items, e => [cell(e.id), cell(e.name), cell(e.category), cell(e.grade), cell(Number.isInteger(e.count) ? e.count : 1), flagCell(e.equipped), cell(e.source)]),
        },
        { def: SELF_RECIPES, rows: entry(state.recipes, e => [cell(e.id), cell(e.name), cell(e.craft), cell(e.grade), cell(e.materials)]) },
        {
            def: SELF_CRAFTS,
            rows: entry(state.crafts, e => [cell(e.id), cell(e.name), cell(e.craft), dayCell(e.startDay), dayCell(e.endDay), CRAFT_STATUS_LABELS[e.status] || CRAFT_STATUS_LABELS.open, cell(e.note)]),
        },
        {
            def: SELF_GOALS,
            rows: entry(state.goals, e => [cell(e.id), cell(e.title || deriveGoalTitle(e.text)), cell(e.text), cell(e.priority), cell(e.due), flagCell(e.done)]),
        },
    ];
}

// DB rows are a projection, never a full replacement for runtime-owned fields.
export function preserveUnmappedSelfFields(projected, current = {}) {
    const next = structuredClone(projected);
    for (const key of ['techniques', 'skills', 'equipment', 'treasures', 'items', 'recipes', 'crafts', 'goals']) {
        if (!Array.isArray(next[key])) continue;
        const byId = new Map((current[key] ?? []).map(row => [row.id, row]));
        next[key] = next[key].map(row => ({ ...structuredClone(byId.get(row.id) ?? {}), ...row }));
    }
    if (current._runtime) {
        const groups = { Technique: 'techniques', Skill: 'skills', Equipment: 'equipment', Treasure: 'treasures', Item: 'items', Recipe: 'recipes', Craft: 'crafts', Goal: 'goals', Title: 'titles' };
        const touched = new Set();
        let unknown = false;
        for (const undo of current._runtime.lastFloor?.undo ?? []) {
            if (undo.op === 'setGold' || undo.op === 'deltaGold') touched.add('gold');
            else if (undo.op === 'setProfile') touched.add('profile');
            else if (undo.op === '_restoreRealm' || undo.op === 'setRealm') touched.add('realm');
            else if (undo.op === '_restoreEntries' && undo.key) touched.add(undo.key);
            else {
                const suffix = Object.keys(groups).find(name => String(undo.op).endsWith(name));
                if (suffix) touched.add(groups[suffix]);
                else unknown = true;
            }
        }
        const before = desiredSelfRows(current);
        const after = desiredSelfRows(next);
        const keys = ['profile', 'titles', 'techniques', 'skills', 'equipment', 'treasures', 'items', 'recipes', 'crafts', 'goals'];
        const changed = before.some((group, i) => JSON.stringify(group.rows) !== JSON.stringify(after[i].rows)
            && (unknown || touched.has(keys[i]) || (i === 0 && (touched.has('gold') || touched.has('realm')))));
        if (changed) {
            const error = new Error('数据库修改与当前楼层回滚基线冲突，请先结束该楼层再收养');
            error.code = 'db_runtime_conflict';
            throw error;
        }
        next._runtime = structuredClone(current._runtime);
    }
    return next;
}

// ---------- 表格行 → 状态（回拉/收养用） ----------

function findSheet(tableData, def) {
    if (!tableData || typeof tableData !== 'object') return null;
    for (const key of Object.keys(tableData)) {
        if (!key.startsWith('sheet_')) continue;
        const sheet = tableData[key];
        if (sheet?.name === def.name && Array.isArray(sheet.content)) return sheet;
    }
    return null;
}

function sheetRows(tableData, def) {
    const sheet = findSheet(tableData, def);
    if (!sheet) return [];
    // 数据行从 1 开始（第 0 行是表头）；只认表头吻合的行，列数不对的丢弃。
    return sheet.content.slice(1).filter(row => Array.isArray(row) && row.length >= def.headers.length);
}

function entryId(value, prefix, index) {
    const id = cell(value).trim();
    return id || `${prefix}${index}`;
}

/**
 * 目标表解码：按表头找列（有无「标题」列的新旧结构都认，列序不依赖下标），
 * 行再交目标归一器清洗——text-only 的老目标在这里补出标题与 name，不再被丢。
 */
function decodeGoalRows(tableData) {
    const sheet = findSheet(tableData, SELF_GOALS);
    if (!sheet) return [];
    const headers = Array.isArray(sheet.content?.[0]) ? sheet.content[0].map(header => String(header)) : [];
    const at = name => headers.findIndex(header => normalizeHeaderCell(header) === name);
    const titleAt = at('标题');
    const textAt = at('内容');
    if (textAt < 0) return [];
    return sheet.content.slice(1)
        .filter(row => Array.isArray(row))
        .map((row, i) => normalizeGoal({
            id: entryId(row[at('编号')], 'g', i + 1),
            title: titleAt >= 0 ? cell(row[titleAt]) : '',
            text: cell(row[textAt]),
            priority: cell(row[at('优先级')]),
            due: cell(row[at('期限')]),
            done: readFlag(row[at('达成')]),
        }, i + 1))
        .filter(Boolean);
}

export function selfStateFromTables(tableData) {
    const profiles = sheetRows(tableData, SELF_PROFILE);
    const profileRow = profiles[0] || [];
    const titles = sheetRows(tableData, SELF_TITLES).map(row => cell(row[1])).filter(Boolean);
    const techniques = sheetRows(tableData, SELF_TECHNIQUES).map((row, i) => ({
        id: entryId(row[1], 't', i + 1), name: cell(row[2]), grade: cell(row[3]), type: cell(row[4]), progress: cell(row[5]), source: cell(row[6]),
    }));
    const skills = sheetRows(tableData, SELF_SKILLS).map((row, i) => ({
        id: entryId(row[1], 's', i + 1), name: cell(row[2]), grade: cell(row[3]), type: cell(row[4]), source: cell(row[5]),
    }));
    const equipment = sheetRows(tableData, SELF_EQUIPMENT).map((row, i) => ({
        id: entryId(row[1], 'e', i + 1), name: cell(row[2]), grade: cell(row[3]), type: cell(row[4]), source: cell(row[5]),
    }));
    const treasures = sheetRows(tableData, SELF_TREASURES).map((row, i) => ({
        id: entryId(row[1], 'z', i + 1), name: cell(row[2]), grade: cell(row[3]), type: cell(row[4]), source: cell(row[5]),
    }));
    const items = sheetRows(tableData, SELF_ITEMS).map((row, i) => ({
        id: entryId(row[1], 'b', i + 1), name: cell(row[2]), category: cell(row[3]), grade: cell(row[4]),
        count: Math.max(1, readInt(row[5], 1)), equipped: readFlag(row[6]), source: cell(row[7]),
    }));
    const recipes = sheetRows(tableData, SELF_RECIPES).map((row, i) => ({
        id: entryId(row[1], 'r', i + 1), name: cell(row[2]), craft: cell(row[3]), grade: cell(row[4]), materials: cell(row[5]),
    }));
    const crafts = sheetRows(tableData, SELF_CRAFTS).map((row, i) => ({
        id: entryId(row[1], 'c', i + 1), name: cell(row[2]), craft: cell(row[3]),
        startDay: readDay(row[4]), endDay: readDay(row[5]),
        status: readLabel(row[6], CRAFT_STATUS_VALUES, 'open'), note: cell(row[7]),
    }));
    const goals = decodeGoalRows(tableData);
    const state = {
        schemaVersion: 1,
        day: Math.max(1, readInt(profileRow[13], 1)),
        profile: {
            name: cell(profileRow[1]), gender: cell(profileRow[2]), age: cell(profileRow[3]), race: cell(profileRow[4]),
            origin: cell(profileRow[5]), affiliation: cell(profileRow[6]), attribute: cell(profileRow[7]),
            talent: cell(profileRow[8]), appearance: cell(profileRow[9]),
        },
        realm: { realm: cell(profileRow[10]), stage: cell(profileRow[11]) },
        gold: readInt(profileRow[12], 0),
        titles, techniques, skills, equipment, treasures, items, recipes, crafts, goals,
        log: [],
        updatedAt: cell(profileRow[14]) || '',
    };
    return { ok: true, empty: isEmptySelfState(state), state };
}

function isEmptySelfState(state) {
    return !state.titles.length && !state.techniques.length && !state.skills.length && !state.equipment.length && !state.treasures.length && !state.items.length
        && !state.recipes.length && !state.crafts.length && !state.goals.length
        && Object.values(state.profile).every(value => !value)
        && !state.realm.realm && !state.realm.stage && !state.gold;
}

// ---------- 差异协调（reconcile） ----------
// 目标：给定当前表数据视图与期望行，算出最小的一批 CRUD 操作。
// 约定 ops 顺序：先按原索引从大到小 deleteRow，再 updateRow，最后 insertRow（追加不影响已有索引）。
// 清单表按「编号」（第 1 个数据列）对行；单行表固定认第一数据行，多余行删掉。
// 编号为空的历史行不删不碰（可能是用户手加的），由文档说明。

function rowKey(def, row) {
    return cell(row[1]).trim();
}

function cellsChanged(def, currentRow, desiredCells) {
    const patch = {};
    for (let i = 0; i < desiredCells.length; i++) {
        if (cell(currentRow[i + 1]) !== cell(desiredCells[i])) patch[def.headers[i + 1]] = cell(desiredCells[i]);
    }
    return patch;
}

export function reconcileTables(tableData, desiredGroups) {
    const ops = [];
    const missingTables = [];
    for (const group of desiredGroups) {
        const { def, rows, single } = group;
        const current = sheetRows(tableData, def);
        if (!current.length && !sheetExists(tableData, def)) {
            missingTables.push(def.name);
            continue;
        }
        if (single) {
            reconcileSingleRow(def, current, rows[0] || [], ops);
            continue;
        }
        reconcileList(def, current, rows, ops);
    }
    return { ops, missingTables };
}

function sheetExists(tableData, def) {
    if (!tableData || typeof tableData !== 'object') return false;
    for (const key of Object.keys(tableData)) {
        if (key.startsWith('sheet_') && tableData[key]?.name === def.name) return true;
    }
    return false;
}

function reconcileSingleRow(def, current, desiredCells, ops) {
    if (!desiredCells) return;
    if (!current.length) {
        ops.push({ kind: 'insertRow', table: def.name, data: rowData(def, desiredCells) });
        return;
    }
    const patch = cellsChanged(def, current[0], desiredCells);
    if (Object.keys(patch).length) ops.push({ kind: 'updateRow', table: def.name, rowIndex: 1, data: patch });
    // 多余的数据行是结构性错误，从大索引往小删。
    for (let index = current.length; index >= 2; index--) {
        ops.push({ kind: 'deleteRow', table: def.name, rowIndex: index });
    }
}

function reconcileList(def, current, desiredRows, ops) {
    const desiredKeys = new Set(desiredRows.map(cells => rowKey(def, [null, ...cells])));
    // 待删除：编号非空且不在期望集合里。从大到小记录原索引。
    const deleteIndexes = [];
    const survivors = []; // { index(删除后的内容索引), row }
    for (let i = 0; i < current.length; i++) {
        const row = current[i];
        const key = rowKey(def, row);
        if (key && !desiredKeys.has(key)) {
            deleteIndexes.push(i + 1);
        } else {
            survivors.push({ index: 1 + survivors.length, row });
        }
    }
    for (const index of deleteIndexes.reverse()) ops.push({ kind: 'deleteRow', table: def.name, rowIndex: index });
    const survivorByKey = new Map(survivors.map(s => [rowKey(def, s.row), s]));
    for (const cells of desiredRows) {
        const key = rowKey(def, [null, ...cells]);
        const survivor = survivorByKey.get(key);
        if (!survivor) {
            ops.push({ kind: 'insertRow', table: def.name, data: rowData(def, cells) });
            continue;
        }
        const patch = cellsChanged(def, survivor.row, cells);
        if (Object.keys(patch).length) ops.push({ kind: 'updateRow', table: def.name, rowIndex: survivor.index, data: patch });
    }
}

function rowData(def, cells) {
    const data = {};
    for (let i = 0; i < cells.length; i++) data[def.headers[i + 1]] = cell(cells[i]);
    return data;
}

/**
 * 把期望行直接写进一份导出视图的深拷贝（importTableAsJson 冷启动兜底用）。
 * 只动桥接表：同名表写在它现有的键上（脚本导入会重生成键，别另造一份造成同名冲突），
 * 没有才用定义键；数据行 row_id 按 1..n 重排，其余表原样保留。
 */
export function applyDesiredToView(view, desiredGroups) {
    const cloned = JSON.parse(JSON.stringify(view && typeof view === 'object' ? view : {}));
    if (!cloned.mate || typeof cloned.mate !== 'object') cloned.mate = { type: 'chatSheets', version: 1 };
    const targetKeys = [];
    for (const group of desiredGroups) {
        const { def, rows } = group;
        const existingKey = Object.keys(cloned).find(key => key.startsWith('sheet_')
            && normalizeHeaderCell(cloned[key]?.name) === normalizeHeaderCell(def.name));
        const targetKey = existingKey ?? def.key;
        cloned[targetKey] = {
            ...(typeof cloned[targetKey] === 'object' && cloned[targetKey] ? cloned[targetKey] : {}),
            uid: targetKey,
            name: def.name,
            sourceData: {
                note: def.note,
                initNode: PROHIBIT,
                insertNode: PROHIBIT,
                updateNode: PROHIBIT,
                deleteNode: PROHIBIT,
                ddl: def.ddl,
            },
            updateConfig: { ...UPDATE_CONFIG },
            ...(def.exportConfig ? { exportConfig: JSON.parse(JSON.stringify(def.exportConfig)) } : {}),
            content: [def.headers.slice(), ...rows.map((cells, index) => [String(index + 1), ...cells.map(cell)])],
        };
        targetKeys.push(targetKey);
    }
    markNewSentinel(cloned, targetKeys);
    return cloned;
}

// ---------- 状态比较 ----------
// 走期望行投影再比较：与镜像写入的语义完全一致，避免「比较口径≠写入口径」的漂移。

function projectGroups(groups) {
    return JSON.stringify(groups.map(group => ({
        key: group.def.key,
        rows: group.rows.map(cells => cells.map(cell)),
    })));
}

export function sameSelfState(a, b) {
    return projectGroups(desiredSelfRows(a)) === projectGroups(desiredSelfRows(b));
}

// ---------- 记忆：状态 ↔ 表格行（小/大两张表，按 tier 分流） ----------

const WEIGHT_LABELS = Object.freeze({ major: '重大', minor: '一般' });
const WEIGHT_VALUES = invert(WEIGHT_LABELS);
const TIER_TAG_LABELS = Object.freeze({ grudge: '恩怨', intel: '情报', thread: '伏笔', milestone: '大事记' });
const TIER_TAG_VALUES = invert(TIER_TAG_LABELS);

export function desiredMemoryRows(memory) {
    const entries = Array.isArray(memory?.entries) ? memory.entries : [];
    // 关联/别名两列是数据库关键词召回的触发词列：数据库的触发词拆分只认逗号（,，），
    // 所以镜像里用逗号连接（扩展台账内部仍是数组，面板显示不受影响）。
    const baseCells = entry => [
        cell(entry.id), cell(entry.text), cell(entry.quote),
        cell(entry.basis),
        (Array.isArray(entry.related) ? entry.related : []).join(','),
        (Array.isArray(entry.aliases) ? entry.aliases : []).join(','),
    ];
    const tailCells = entry => [
        WEIGHT_LABELS[entry.weight] || WEIGHT_LABELS.minor,
        intCell(entry.day), cell(entry.note),
    ];
    const smallRows = entries.filter(entry => entry.tier === 'small').map(entry => [...baseCells(entry), ...tailCells(entry)]);
    const bigRows = entries.filter(entry => entry.tier === 'big').map(entry => {
        const cells = [...baseCells(entry)];
        cells.push(TIER_TAG_LABELS[entry.tag] || '');
        cells.push(...tailCells(entry));
        return cells;
    });
    return [
        { def: MEMORY_SMALL, rows: smallRows },
        { def: MEMORY_BIG, rows: bigRows },
    ];
}

function splitNames(value) {
    // 兼容历史行：旧镜像用顿号连接，新镜像用逗号（数据库触发词拆分只认逗号）。
    return cell(value).split(/[、,，]/).map(item => item.trim()).filter(Boolean).slice(0, 4);
}

/** 按表头名定位列的读取器：镜像表可能是旧 12 列（含已了结/了结日）或新 10 列，收养读取不写死下标。 */
function memoryColumnReader(tableData, def) {
    const sheet = findSheet(tableData, def);
    const headers = Array.isArray(sheet?.content?.[0]) ? sheet.content[0] : def.headers;
    return {
        cell: (row, name) => {
            const at = headers.indexOf(name);
            return at >= 0 ? row[at] : '';
        },
    };
}

export function memoryStateFromTables(tableData) {
    const entries = [];
    let seq = 0;
    const small = memoryColumnReader(tableData, MEMORY_SMALL);
    for (const row of sheetRows(tableData, MEMORY_SMALL)) {
        seq += 1;
        const entry = {
            id: entryId(small.cell(row, '编号'), 'm', seq), tier: 'small',
            text: cell(small.cell(row, '内容')), quote: cell(small.cell(row, '引文')), basis: cell(small.cell(row, '依据')),
            related: splitNames(small.cell(row, '关联')), aliases: splitNames(small.cell(row, '别名')),
            tag: '',
            weight: readLabel(small.cell(row, '分量'), WEIGHT_VALUES, 'minor'),
            day: Math.max(1, readInt(small.cell(row, '记于日'), 1)),
            note: cell(small.cell(row, '备注')),
        };
        if (entry.text) entries.push(entry);
    }
    const big = memoryColumnReader(tableData, MEMORY_BIG);
    for (const row of sheetRows(tableData, MEMORY_BIG)) {
        seq += 1;
        const entry = {
            id: entryId(big.cell(row, '编号'), 'm', seq), tier: 'big',
            text: cell(big.cell(row, '内容')), quote: cell(big.cell(row, '引文')), basis: cell(big.cell(row, '依据')),
            related: splitNames(big.cell(row, '关联')), aliases: splitNames(big.cell(row, '别名')),
            tag: readLabel(big.cell(row, '标签'), TIER_TAG_VALUES, ''),
            weight: readLabel(big.cell(row, '分量'), WEIGHT_VALUES, 'minor'),
            day: Math.max(1, readInt(big.cell(row, '记于日'), 1)),
            note: cell(big.cell(row, '备注')),
        };
        if (entry.text) entries.push(entry);
    }
    const state = {
        schemaVersion: 2,
        entries,
        log: [],
        updatedAt: new Date().toISOString(),
    };
    return { ok: true, empty: entries.length === 0, state };
}

export function sameMemoryState(a, b) {
    return projectGroups(desiredMemoryRows(a)) === projectGroups(desiredMemoryRows(b));
}
