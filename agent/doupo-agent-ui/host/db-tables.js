/**
 * 数据库桥接的表结构与纯函数编解码。
 *
 * 纳戒/世界台账的实质状态镜像到「龙血玄黄·数据库」（window.AutoCardUpdaterAPI）的表格里：
 * 表结构在这里定义（uid/表名/表头/DDL 固定），状态↔表格行的互转和差异协调（reconcile）
 * 全部是纯函数，不碰 window/DOM，可离线单测。API 调用见 db-bridge.js。
 *
 * 所有权约定：这些表只由本扩展写。每张表的 initNode/insertNode/updateNode/deleteNode
 * 都是「禁止操作。」，updateConfig.updateFrequency=0 让它们退出数据库自己的 AI 自动
 * 更新调度，双写从根上排除；表头/DDL 改动必须同步改测试。
 */

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
 * keyword 绿光条目逐行一条，触发词取 keywords 里列出的列（逗号分隔多个列名），行里那些列的值
 * 再按逗号切成一个个触发词；人名/地名命中最近楼层就整行注入，模板里的 $1 是该行内容。
 * 这是“数据库的召回把记忆召回出来”的正道：配置跟着表格定义走，数据库脚本一行不用改。
 * 与 updateConfig.updateFrequency=0（AI 禁填）互不相干——导出是展示侧，双写防护照旧。
 */
function memoryExportConfig(entryName, order) {
    return {
        enabled: true,
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
    '纳戒·配方',
    'dp_recipes',
    ['row_id', '编号', '名称', '类别', '品阶', '材料'],
    `CREATE TABLE dp_recipes ( -- 配方表
  row_id INTEGER PRIMARY KEY, -- 行号
  entry_id TEXT NOT NULL, -- 编号
  name TEXT NOT NULL, -- 名称
  craft TEXT, -- 类别
  grade TEXT, -- 品阶
  materials TEXT -- 材料
);`,
    '已掌握配方。只由斗破Agent扩展写入，AI 禁止操作。',
);

const SELF_CRAFTS = defineTable(
    'sheet_dpCrafts',
    '纳戒·炼制台',
    'dp_crafts',
    ['row_id', '编号', '名称', '类别', '开始日', '结束日', '状态', '备注'],
    `CREATE TABLE dp_crafts ( -- 炼制台表
  row_id INTEGER PRIMARY KEY, -- 行号
  entry_id TEXT NOT NULL, -- 编号
  name TEXT NOT NULL, -- 名称
  craft TEXT, -- 类别
  start_day INTEGER, -- 开始日
  end_day INTEGER, -- 结束日
  status TEXT, -- 状态
  note TEXT -- 备注
);`,
    '炼制进度（进行中/成功/失败），日期按世界时钟。只由斗破Agent扩展写入，AI 禁止操作。',
);

const SELF_GOALS = defineTable(
    'sheet_dpGoals',
    '纳戒·目标',
    'dp_goals',
    ['row_id', '编号', '内容', '优先级', '期限', '达成'],
    `CREATE TABLE dp_goals ( -- 目标表
  row_id INTEGER PRIMARY KEY, -- 行号
  entry_id TEXT NOT NULL, -- 编号
  goal_text TEXT NOT NULL, -- 内容
  priority TEXT, -- 优先级
  due TEXT, -- 期限
  done TEXT -- 达成
);`,
    '目标与约定（主线标星在优先级里）。只由斗破Agent扩展写入，AI 禁止操作。',
);

const WORLD_STATE = defineTable(
    'sheet_dpWorldState',
    '世界·现状',
    'dp_world_state',
    ['row_id', '剧情日', '分钟', '时段', '天气', '所在地', '时期', '名声', '通缉度', '更新时间'],
    `CREATE TABLE dp_world_state ( -- 世界现状表
  row_id INTEGER PRIMARY KEY, -- 行号
  story_day INTEGER, -- 剧情日
  minute INTEGER, -- 分钟
  clock_label TEXT, -- 时段
  weather TEXT, -- 天气
  location TEXT, -- 所在地
  era TEXT, -- 时期
  reputation TEXT, -- 名声
  wanted TEXT, -- 通缉度
  updated_at TEXT -- 更新时间
);`,
    '世界时钟+现状五字段，有且仅有一行。只由斗破Agent扩展写入，AI 禁止操作。',
);

const WORLD_EVENTS = defineTable(
    'sheet_dpWorldEvents',
    '世界·事件',
    'dp_world_events',
    ['row_id', '编号', '范围', '日', '内容', '依据', '有效期至', '分量', '置顶', '已了结', '了结日'],
    `CREATE TABLE dp_world_events ( -- 世界事件表
  row_id INTEGER PRIMARY KEY, -- 行号
  entry_id TEXT NOT NULL, -- 编号
  scope TEXT, -- 范围
  day INTEGER, -- 日
  event_text TEXT NOT NULL, -- 内容
  basis TEXT, -- 依据
  end_day INTEGER, -- 有效期至
  weight TEXT, -- 分量
  pinned TEXT, -- 置顶
  done TEXT, -- 已了结
  resolved_day INTEGER -- 了结日
);`,
    '近事/天下事件共表，范围列区分；分量含传闻。只由斗破Agent扩展写入，AI 禁止操作。',
);

const WORLD_TASKS = defineTable(
    'sheet_dpWorldTasks',
    '世界·任务',
    'dp_world_tasks',
    ['row_id', '编号', '标题', '详情', '依据', '接受日', '时限日', '状态', '完成日'],
    `CREATE TABLE dp_world_tasks ( -- 任务表
  row_id INTEGER PRIMARY KEY, -- 行号
  entry_id TEXT NOT NULL, -- 编号
  title TEXT NOT NULL, -- 标题
  detail TEXT, -- 详情
  basis TEXT, -- 依据
  day INTEGER, -- 接受日
  end_day INTEGER, -- 时限日
  status TEXT, -- 状态
  done_day INTEGER -- 完成日
);`,
    '任务清单（进行中/已完成）。只由斗破Agent扩展写入，AI 禁止操作。',
);

const MEMORY_SMALL = defineTable(
    'sheet_dpMemorySmall',
    '小记忆',
    'dp_memory_small',
    ['row_id', '编号', '内容', '引文', '依据', '关联', '别名', '分量', '记于日', '已了结', '了结日', '备注'],
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
  done TEXT, -- 已了结
  resolved_day INTEGER, -- 了结日
  note TEXT -- 备注
);`,
    '小记忆（轻量近事；关联/别名是人名/地名/物名、逗号分隔，是数据库关键词召回的触发词；引文=当时的一句原话）。只由斗破Agent扩展写入，AI 禁止操作。',
    memoryExportConfig('主角近事', 10022),
);

const MEMORY_BIG = defineTable(
    'sheet_dpMemoryBig',
    '大记忆',
    'dp_memory_big',
    ['row_id', '编号', '内容', '引文', '依据', '关联', '别名', '标签', '分量', '记于日', '已了结', '了结日', '备注'],
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
  done TEXT, -- 已了结
  resolved_day INTEGER, -- 了结日
  note TEXT -- 备注
);`,
    '大记忆（值得一直记住的事；标签列=恩怨/情报/伏笔/大事记，可空；关联/别名是人名/地名/物名、逗号分隔，是数据库关键词召回的触发词；引文=当时的一句原话）。只由斗破Agent扩展写入，AI 禁止操作。',
    memoryExportConfig('主角记忆', 10020),
);

export const MEMORY_TABLE_DEFS = Object.freeze([MEMORY_SMALL, MEMORY_BIG]);
const MEMORY_TABLE_BY_TIER = Object.freeze({ small: MEMORY_SMALL, big: MEMORY_BIG });

export const SELF_TABLE_DEFS = Object.freeze([
    SELF_PROFILE, SELF_TITLES, SELF_TECHNIQUES, SELF_SKILLS, SELF_ITEMS,
    SELF_RECIPES, SELF_CRAFTS, SELF_GOALS,
]);
export const WORLD_TABLE_DEFS = Object.freeze([WORLD_STATE, WORLD_EVENTS, WORLD_TASKS]);
export const ALL_TABLE_DEFS = Object.freeze([...SELF_TABLE_DEFS, ...WORLD_TABLE_DEFS, ...MEMORY_TABLE_DEFS]);

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
 * 返回 { template, added, replaced, updated }；existing 为空时返回纯片段。
 */
export function mergeBridgeSheets(existing) {
    const base = existing && typeof existing === 'object' && !Array.isArray(existing)
        ? JSON.parse(JSON.stringify(existing))
        : { mate: { type: 'chatSheets', version: 1 } };
    if (!base.mate || typeof base.mate !== 'object') base.mate = { type: 'chatSheets', version: 1 };
    const fragment = buildBridgeSheets();
    const added = [];
    const addedKeys = [];
    const replaced = [];
    const updated = [];
    for (const def of ALL_TABLE_DEFS) {
        const sameNameKey = Object.keys(base).find(key => key.startsWith('sheet_')
            && normalizeHeaderCell(base[key]?.name) === normalizeHeaderCell(def.name));
        if (sameNameKey) {
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
    return { template: base, added, replaced, updated };
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
const EVENT_SCOPE_LABELS = Object.freeze({ near: '近事', world: '天下' });
const EVENT_WEIGHT_LABELS = Object.freeze({ minor: '轻微', major: '重大', rumor: '传闻' });
const YES = '是';
const NO = '否';

function invert(map) {
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
}
const CRAFT_STATUS_VALUES = invert(CRAFT_STATUS_LABELS);
const EVENT_SCOPE_VALUES = invert(EVENT_SCOPE_LABELS);
const EVENT_WEIGHT_VALUES = invert(EVENT_WEIGHT_LABELS);

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
            rows: entry(state.goals, e => [cell(e.id), cell(e.text), cell(e.priority), cell(e.due), flagCell(e.done)]),
        },
    ];
}

export function desiredWorldRows(world) {
    const state = world && typeof world === 'object' ? world : {};
    const clock = state.clock && typeof state.clock === 'object' ? state.clock : {};
    const info = state.info && typeof state.info === 'object' ? state.info : {};
    const events = [...(Array.isArray(state.nearEvents) ? state.nearEvents : []), ...(Array.isArray(state.worldEvents) ? state.worldEvents : [])]
        .filter(item => item && typeof item === 'object')
        .map(e => [
            cell(e.id), EVENT_SCOPE_LABELS[e.scope] || EVENT_SCOPE_LABELS.near, intCell(e.day), cell(e.text), cell(e.basis),
            dayCell(e.endDay), EVENT_WEIGHT_LABELS[e.weight] || EVENT_WEIGHT_LABELS.minor,
            flagCell(e.pinned), flagCell(e.done), dayCell(e.resolvedDay),
        ]);
    const tasks = (Array.isArray(state.tasks) ? state.tasks : [])
        .filter(item => item && typeof item === 'object')
        .map(t => [
            cell(t.id), cell(t.title), cell(t.detail), cell(t.basis), intCell(t.day), dayCell(t.endDay),
            t.status === 'done' ? '已完成' : '进行中', dayCell(t.doneDay),
        ]);
    return [
        {
            def: WORLD_STATE,
            single: true,
            rows: [[
                intCell(clock.day), intCell(clock.minute), cell(clock.label),
                cell(info.weather), cell(info.location), cell(info.era), cell(info.reputation), cell(info.wanted),
                cell(state.updatedAt),
            ]],
        },
        { def: WORLD_EVENTS, rows: events },
        { def: WORLD_TASKS, rows: tasks },
    ];
}

// ---------- 表格行 → 状态（回拉/收养用） ----------

function sheetRows(tableData, def) {
    if (!tableData || typeof tableData !== 'object') return [];
    for (const key of Object.keys(tableData)) {
        if (!key.startsWith('sheet_')) continue;
        const sheet = tableData[key];
        if (sheet?.name === def.name && Array.isArray(sheet.content)) {
            // 数据行从 1 开始（第 0 行是表头）；只认表头吻合的行，列数不对的丢弃。
            return sheet.content.slice(1).filter(row => Array.isArray(row) && row.length >= def.headers.length);
        }
    }
    return [];
}

function entryId(value, prefix, index) {
    const id = cell(value).trim();
    return id || `${prefix}${index}`;
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
    const goals = sheetRows(tableData, SELF_GOALS).map((row, i) => ({
        id: entryId(row[1], 'g', i + 1), text: cell(row[2]), priority: cell(row[3]) || '支线', due: cell(row[4]), done: readFlag(row[5]),
    }));
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
        titles, techniques, skills, items, recipes, crafts, goals,
        log: [],
        updatedAt: cell(profileRow[14]) || new Date().toISOString(),
    };
    return { ok: true, empty: isEmptySelfState(state), state };
}

function isEmptySelfState(state) {
    return !state.titles.length && !state.techniques.length && !state.skills.length && !state.items.length
        && !state.recipes.length && !state.crafts.length && !state.goals.length
        && Object.values(state.profile).every(value => !value)
        && !state.realm.realm && !state.realm.stage && !state.gold;
}

export function worldStateFromTables(tableData) {
    const worldRows = sheetRows(tableData, WORLD_STATE);
    const clockRow = worldRows[0] || [];
    const events = sheetRows(tableData, WORLD_EVENTS).map((row, i) => ({
        id: entryId(row[1], 'e', i + 1), scope: readLabel(row[2], EVENT_SCOPE_VALUES, 'near'), day: Math.max(1, readInt(row[3], 1)),
        text: cell(row[4]), basis: cell(row[5]), endDay: readDay(row[6]),
        weight: readLabel(row[7], EVENT_WEIGHT_VALUES, 'minor'), pinned: readFlag(row[8]), done: readFlag(row[9]), resolvedDay: readDay(row[10]),
    }));
    const tasks = sheetRows(tableData, WORLD_TASKS).map((row, i) => ({
        id: entryId(row[1], 't', i + 1), title: cell(row[2]), detail: cell(row[3]), basis: cell(row[4]), day: Math.max(1, readInt(row[5], 1)),
        endDay: readDay(row[6]), status: cell(row[7]) === '已完成' ? 'done' : 'active', doneDay: readDay(row[8]),
    }));
    const state = {
        schemaVersion: 1,
        clock: { day: Math.max(1, readInt(clockRow[1], 1)), minute: Math.min(1439, Math.max(0, readInt(clockRow[2], 480))), label: cell(clockRow[3]) },
        info: {
            weather: cell(clockRow[4]), location: cell(clockRow[5]), era: cell(clockRow[6]),
            reputation: cell(clockRow[7]), wanted: cell(clockRow[8]),
        },
        nearEvents: events.filter(e => e.scope === 'near'),
        worldEvents: events.filter(e => e.scope === 'world'),
        tasks,
        log: [],
        updatedAt: cell(clockRow[9]) || new Date().toISOString(),
    };
    return { ok: true, empty: isEmptyWorldState(state), state };
}

function isEmptyWorldState(state) {
    return !state.nearEvents.length && !state.worldEvents.length && !state.tasks.length
        && Object.values(state.info).every(value => !value)
        && (state.clock.day === 1 && state.clock.minute === 480 && !state.clock.label);
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

export function sameWorldState(a, b) {
    return projectGroups(desiredWorldRows(a)) === projectGroups(desiredWorldRows(b));
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
        intCell(entry.day), flagCell(entry.done), dayCell(entry.resolvedDay), cell(entry.note),
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

export function memoryStateFromTables(tableData) {
    const entries = [];
    let seq = 0;
    for (const row of sheetRows(tableData, MEMORY_SMALL)) {
        seq += 1;
        const entry = {
            id: entryId(row[1], 'm', seq), tier: 'small',
            text: cell(row[2]), quote: cell(row[3]), basis: cell(row[4]),
            related: splitNames(row[5]), aliases: splitNames(row[6]),
            tag: '',
            weight: readLabel(row[7], WEIGHT_VALUES, 'minor'),
            day: Math.max(1, readInt(row[8], 1)),
            done: readFlag(row[9]), resolvedDay: readDay(row[10]), note: cell(row[11]),
        };
        if (entry.text) entries.push(entry);
    }
    for (const row of sheetRows(tableData, MEMORY_BIG)) {
        seq += 1;
        const entry = {
            id: entryId(row[1], 'm', seq), tier: 'big',
            text: cell(row[2]), quote: cell(row[3]), basis: cell(row[4]),
            related: splitNames(row[5]), aliases: splitNames(row[6]),
            tag: readLabel(row[7], TIER_TAG_VALUES, ''),
            weight: readLabel(row[8], WEIGHT_VALUES, 'minor'),
            day: Math.max(1, readInt(row[9], 1)),
            done: readFlag(row[10]), resolvedDay: readDay(row[11]), note: cell(row[12]),
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
