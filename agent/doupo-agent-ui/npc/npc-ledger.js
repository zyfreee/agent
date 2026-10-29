/**
 * 人物簿：NPC 的全信息母库。
 *
 * 一份档案对应一个人，按固定格式存；“变化”由记录员以补丁的形式交上来，
 * 脚本负责合并、累加好感、追加流水——所以这里不叫“写档案”，叫“记账”。
 *
 * 刻意的取舍：
 * - 不核依据、不拦“上帝视角”。用户要的是“模型怎么写就怎么记”，脚本只负责把任意输入
 *   折成同一形状，坏字段单独丢，不整批作废。
 * - 唯一一道幅度闸：单次好感最多 ±10（FAVOR_STEP_MAX），防止一句话把关系写飞。
 * - 好感只记本次增减，累计值由脚本算，模型永远不写绝对值。
 * - 流水只追加不覆盖，档案字段才覆盖。
 * - 注入按“在场 × 重要”四象限分档，不按字数硬塞。
 * - 从世界书抽档时用“只填空”模式：已经记下的字段不动，免得把正文里发生的事盖回设定。
 */

export const NPC_LEDGER_VERSION = 1;
export const FAVOR_MIN = -100;
export const FAVOR_MAX = 100;
export const FAVOR_REASON_MAX = 15;
/** 单次好感幅度上限：一次最多 ±10，防止模型一句话把关系写飞。 */
export const FAVOR_STEP_MAX = 10;

const MAX_TEXT = 300;
const MAX_LIST = 12;
const MAX_OTHERS = 12;
const MAX_THINGS = 16;
const MAX_LOG = 80;
const MAX_FAVOR_LOG = 60;
const MAX_NAME = 40;
/** 经历只收“重大转变”，一条人物一生级别的转折不会太多；满了丢最旧的。 */
const MAX_EXP = 120;
const MAX_EXP_PER_PATCH = 4;

export const PRESENCE_OPTIONS = Object.freeze(['在场', '不在场']);
export const IMPORTANCE_OPTIONS = Object.freeze(['重要', '不重要']);
export const SOURCE_OPTIONS = Object.freeze(['世界书', '手填', '正文']);

/** 好感刻度只给模型和面板看，不参与校验。 */
export const FAVOR_SCALE = Object.freeze([
    Object.freeze({ min: -100, max: -60, label: '死敌' }),
    Object.freeze({ min: -59, max: -20, label: '敌意' }),
    Object.freeze({ min: -19, max: 0, label: '冷淡' }),
    Object.freeze({ min: 1, max: 20, label: '眼熟' }),
    Object.freeze({ min: 21, max: 45, label: '友善' }),
    Object.freeze({ min: 46, max: 70, label: '亲近' }),
    Object.freeze({ min: 71, max: 90, label: '信任' }),
    Object.freeze({ min: 91, max: 100, label: '生死之交' }),
]);

export function favorLabel(value) {
    const number = clampFavor(value);
    if (number === null) return '';
    for (const band of FAVOR_SCALE) if (number >= band.min && number <= band.max) return band.label;
    return '';
}

export const NPC_GROUPS = Object.freeze(['身份', '外貌', '身体', '性格', '对玩家', '社交', '资产', '处境', '秘密', '索引']);

/** 固定格式的唯一出处：面板、提示词、补丁解析都读这张表。 */
export const NPC_FIELDS = Object.freeze([
    Object.freeze({ key: 'aliases', label: '别名', group: '身份', type: 'list' }),
    Object.freeze({ key: 'titles', label: '称号', group: '身份', type: 'list' }),
    Object.freeze({ key: 'gender', label: '性别', group: '身份', type: 'text' }),
    Object.freeze({ key: 'age', label: '年龄', group: '身份', type: 'text' }),
    Object.freeze({ key: 'origin', label: '出身', group: '身份', type: 'text' }),
    Object.freeze({ key: 'identity', label: '身份', group: '身份', type: 'text' }),
    Object.freeze({ key: 'master', label: '师承', group: '身份', type: 'text' }),
    Object.freeze({ key: 'look', label: '真实样貌', group: '外貌', type: 'text' }),
    Object.freeze({ key: 'shownLook', label: '示人样貌', group: '外貌', type: 'text' }),
    Object.freeze({ key: 'clothes', label: '衣着', group: '外貌', type: 'things' }),
    Object.freeze({ key: 'accessories', label: '配饰', group: '外貌', type: 'text' }),
    Object.freeze({ key: 'realm', label: '境界', group: '身体', type: 'text' }),
    Object.freeze({ key: 'qi', label: '气血', group: '身体', type: 'text' }),
    Object.freeze({ key: 'douqi', label: '斗气', group: '身体', type: 'text' }),
    Object.freeze({ key: 'injury', label: '伤势', group: '身体', type: 'text' }),
    Object.freeze({ key: 'hiddenWound', label: '暗伤或封印', group: '身体', type: 'text' }),
    Object.freeze({ key: 'lifespan', label: '寿元余量', group: '身体', type: 'text' }),
    Object.freeze({ key: 'physique', label: '特殊体质', group: '身体', type: 'text' }),
    Object.freeze({ key: 'traits', label: '性格标签', group: '性格', type: 'list' }),
    Object.freeze({ key: 'speech', label: '说话风格', group: '性格', type: 'text' }),
    Object.freeze({ key: 'catchphrase', label: '口头禅', group: '性格', type: 'text' }),
    Object.freeze({ key: 'taboo', label: '雷区', group: '性格', type: 'text' }),
    Object.freeze({ key: 'want', label: '想要什么', group: '性格', type: 'text' }),
    Object.freeze({ key: 'fear', label: '怕什么', group: '性格', type: 'text' }),
    Object.freeze({ key: 'attitude', label: '态度', group: '对玩家', type: 'text' }),
    Object.freeze({ key: 'publicAttitude', label: '人前态度', group: '对玩家', type: 'text' }),
    Object.freeze({ key: 'privateAttitude', label: '私下态度', group: '对玩家', type: 'text' }),
    Object.freeze({ key: 'appellation', label: '当前称呼', group: '对玩家', type: 'text' }),
    Object.freeze({ key: 'stage', label: '关系阶段', group: '对玩家', type: 'text' }),
    Object.freeze({ key: 'others', label: '对他人', group: '社交', type: 'triples' }),
    Object.freeze({ key: 'items', label: '随身物品', group: '资产', type: 'things' }),
    Object.freeze({ key: 'storage', label: '储物容器', group: '资产', type: 'text' }),
    Object.freeze({ key: 'money', label: '货币', group: '资产', type: 'text' }),
    Object.freeze({ key: 'property', label: '产业', group: '资产', type: 'text' }),
    Object.freeze({ key: 'debt', label: '债务', group: '资产', type: 'text' }),
    Object.freeze({ key: 'location', label: '所在位置', group: '处境', type: 'text' }),
    Object.freeze({ key: 'presence', label: '在场', group: '处境', type: 'enum', options: PRESENCE_OPTIONS }),
    Object.freeze({ key: 'doing', label: '正在做什么', group: '处境', type: 'text' }),
    Object.freeze({ key: 'reachable', label: '远程联系', group: '处境', type: 'text' }),
    Object.freeze({ key: 'secret', label: '秘密', group: '秘密', type: 'secret' }),
    Object.freeze({ key: 'importance', label: '重要度', group: '索引', type: 'enum', options: IMPORTANCE_OPTIONS }),
]);

const FIELD_BY_KEY = new Map(NPC_FIELDS.map(field => [field.key, field]));

/** 补丁里能认的键：格式里的中文名 + 常见顺嘴写法。认不出来的键原地忽略。 */
const KEY_ALIASES = new Map([
    ['姓名', 'name'], ['名字', 'name'], ['人物', 'name'], ['name', 'name'], ['npc', 'name'],
    ['别名', 'aliases'], ['别号', 'aliases'], ['外号', 'aliases'], ['aliases', 'aliases'],
    ['称号', 'titles'], ['名号', 'titles'], ['titles', 'titles'],
    ['性别', 'gender'], ['age', 'age'], ['年龄', 'age'], ['年纪', 'age'],
    ['出身', 'origin'], ['来历', 'origin'], ['origin', 'origin'],
    ['身份', 'identity'], ['职位', 'identity'], ['identity', 'identity'],
    ['师承', 'master'], ['师父', 'master'], ['master', 'master'],
    ['样貌', 'look'], ['真实样貌', 'look'], ['相貌', 'look'], ['look', 'look'],
    ['示人样貌', 'shownLook'], ['假貌', 'shownLook'], ['shownLook', 'shownLook'],
    ['衣着', 'clothes'], ['服饰', 'clothes'], ['衣服', 'clothes'], ['clothes', 'clothes'],
    ['配饰', 'accessories'], ['accessories', 'accessories'],
    ['境界', 'realm'], ['修为', 'realm'], ['realm', 'realm'],
    ['气血', 'qi'], ['qi', 'qi'], ['斗气', 'douqi'], ['douqi', 'douqi'],
    ['伤势', 'injury'], ['伤', 'injury'], ['injury', 'injury'],
    ['暗伤', 'hiddenWound'], ['封印', 'hiddenWound'], ['hiddenWound', 'hiddenWound'],
    ['寿元', 'lifespan'], ['寿命', 'lifespan'], ['lifespan', 'lifespan'],
    ['体质', 'physique'], ['特殊体质', 'physique'], ['physique', 'physique'],
    ['性格', 'traits'], ['性格标签', 'traits'], ['traits', 'traits'],
    ['说话风格', 'speech'], ['语气', 'speech'], ['speech', 'speech'],
    ['口头禅', 'catchphrase'], ['catchphrase', 'catchphrase'],
    ['雷区', 'taboo'], ['忌讳', 'taboo'], ['taboo', 'taboo'],
    ['想要什么', 'want'], ['想要', 'want'], ['欲望', 'want'], ['want', 'want'],
    ['怕什么', 'fear'], ['怕', 'fear'], ['恐惧', 'fear'], ['fear', 'fear'],
    ['态度', 'attitude'], ['对玩家态度', 'attitude'], ['attitude', 'attitude'],
    ['人前态度', 'publicAttitude'], ['publicAttitude', 'publicAttitude'],
    ['私下态度', 'privateAttitude'], ['privateAttitude', 'privateAttitude'],
    ['称呼', 'appellation'], ['当前称呼', 'appellation'], ['appellation', 'appellation'],
    ['关系阶段', 'stage'], ['关系', 'stage'], ['stage', 'stage'],
    ['对他人', 'others'], ['others', 'others'],
    ['随身物品', 'items'], ['物品', 'items'], ['items', 'items'],
    ['储物容器', 'storage'], ['storage', 'storage'],
    ['货币', 'money'], ['钱', 'money'], ['money', 'money'],
    ['产业', 'property'], ['property', 'property'],
    ['债务', 'debt'], ['debt', 'debt'],
    ['位置', 'location'], ['所在位置', 'location'], ['所在地', 'location'], ['location', 'location'],
    ['在场', 'presence'], ['是否在场', 'presence'], ['presence', 'presence'],
    ['正在做什么', 'doing'], ['在做什么', 'doing'], ['doing', 'doing'],
    ['远程联系', 'reachable'], ['能否联系', 'reachable'], ['reachable', 'reachable'],
    ['秘密', 'secret'], ['secret', 'secret'],
    ['重要', 'importance'], ['重要度', 'importance'], ['重要性', 'importance'], ['importance', 'importance'],
    ['好感', 'favor'], ['好感度', 'favor'], ['favor', 'favor'],
    ['好感理由', 'favorReason'], ['理由', 'favorReason'], ['favorReason', 'favorReason'],
    ['流水', 'log'], ['经过', 'log'], ['事件', 'log'], ['log', 'log'],
    ['经历', 'exp'], ['重要经历', 'exp'], ['转变', 'exp'], ['心路', 'exp'], ['exp', 'exp'],
    ['设定', 'fields'], ['字段', 'fields'], ['档案', 'fields'], ['fields', 'fields'],
]);

const SKIP_VALUES = new Set(['', '不变', '无变化', '没有变化', '无变化。', '—', '——', '空', 'nil', 'null', 'undefined', 'none']);

function clampFavor(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.max(FAVOR_MIN, Math.min(FAVOR_MAX, Math.round(number)));
}

/** 单次好感只准走这么多：模型一次写 +100 也只会记成 +10，档案不会被一句话带跑。 */
function clampFavorStep(value) {
    const delta = clampFavor(value);
    if (delta === null) return null;
    return Math.max(-FAVOR_STEP_MAX, Math.min(FAVOR_STEP_MAX, delta));
}

/** 字段是不是空的：填空模式靠它判断“该不该覆盖”。 */
export function isEmptyValue(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.values(value).every(item => isEmptyValue(item));
    return false;
}

function text(value, limit = MAX_TEXT) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
        // 对象型字段被塞进纯文本格子时，拼成一行可读文本，不丢信息。
        const parts = [];
        for (const [key, item] of Object.entries(value)) {
            const chunk = typeof item === 'object' && item !== null ? text(item, limit) : String(item ?? '').trim();
            if (chunk) parts.push(`${key}：${chunk}`);
        }
        return parts.join('；').slice(0, limit);
    }
    const raw = String(value).replace(/\s+/g, ' ').trim();
    if (SKIP_VALUES.has(raw.toLowerCase())) return '';
    return raw.slice(0, limit);
}

function list(value) {
    if (value === null || value === undefined) return [];
    const source = Array.isArray(value) ? value : String(value).split(/[、,，;；/|]/);
    const result = [];
    for (const item of source) {
        const part = text(item, 60);
        if (part && !result.includes(part)) result.push(part);
        if (result.length >= MAX_LIST) break;
    }
    return result;
}

function things(value, limit = MAX_THINGS) {
    if (value === null || value === undefined) return [];
    const source = Array.isArray(value) ? value : [value];
    const result = [];
    for (const item of source) {
        if (item === null || item === undefined) continue;
        if (typeof item === 'string') {
            const name = text(item, 60);
            if (name) result.push({ name, detail: '' });
        } else if (typeof item === 'object') {
            const name = text(item.名称 ?? item.名 ?? item.name ?? item.物品, 60);
            const detail = text(item.说明 ?? item.detail ?? item.note, 80);
            if (!name && !detail) continue;
            const entry = { name: name || detail, detail: name ? detail : '' };
            // 衣着记 部位/品阶/状态，随身物品记 数量/来源/是否藏着：表格里定死的子字段，别丢。
            // 中文键（模型写的）和英文键（存档里回读的）都认，否则导来导去会把子字段洗掉。
            const part = text(item.部位 ?? item.part, 20);
            if (part) entry.part = part;
            const grade = text(item.品阶 ?? item.等级 ?? item.品质 ?? item.grade, 20);
            if (grade) entry.grade = grade;
            const state = text(item.状态 ?? item.完好度 ?? item.成色 ?? item.state, 20);
            if (state) entry.state = state;
            const rawCount = item.数量 ?? item.count;
            if (rawCount !== undefined && rawCount !== null && String(rawCount).trim() !== '') {
                entry.count = Number.isFinite(Number(rawCount)) ? Number(rawCount) : text(rawCount, 10);
            }
            const from = text(item.来源 ?? item.source, 20);
            if (from) entry.source = from;
            if (item.藏着 === true || item.隐藏 === true || item.hidden === true) entry.hidden = true;
            result.push(entry);
        }
        if (result.length >= limit) break;
    }
    return result;
}

function triples(value, limit = MAX_OTHERS) {
    if (value === null || value === undefined) return [];
    const source = Array.isArray(value) ? value : [value];
    const result = [];
    for (const item of source) {
        if (typeof item === 'string') {
            const who = text(item, 40);
            if (who) result.push({ who, relation: '', attitude: '' });
        } else if (item && typeof item === 'object') {
            const who = text(item.对方 ?? item.who ?? item.人物 ?? item.name, 40);
            const relation = text(item.关系 ?? item.relation, 40);
            const attitude = text(item.态度 ?? item.attitude, 80);
            if (who || relation || attitude) result.push({ who, relation, attitude });
        }
        if (result.length >= limit) break;
    }
    return result;
}

function secretValue(value) {
    if (value === null || value === undefined) return { hideFrom: '', what: '' };
    if (typeof value === 'string') return { hideFrom: '', what: text(value, MAX_TEXT) };
    if (typeof value !== 'object') return { hideFrom: '', what: text(value, MAX_TEXT) };
    return {
        hideFrom: text(value.瞒着谁 ?? value.hideFrom ?? value.谁, 60),
        what: text(value.瞒什么事 ?? value.瞒什么 ?? value.隐瞒什么 ?? value.what ?? value.内容 ?? value.是什么, MAX_TEXT),
    };
}

function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, Math.round(number)));
}

/** 一条经历：一句“他从此不一样了”的转变 + 世界天数/楼层。 */
function normalizeExpEntry(item) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
        const body = text(item.转变 ?? item.text ?? item.内容 ?? item.事情, 200);
        const day = Number.isFinite(Number(item.day)) ? Number(item.day) : (Number.isFinite(Number(item.天数)) ? Number(item.天数) : null);
        const floor = Number.isInteger(item.floor) ? item.floor : (Number.isInteger(item.楼层) ? item.楼层 : null);
        return { text: body, day, floor };
    }
    return { text: text(item, 200), day: null, floor: null };
}

function normalizeName(value) {
    return text(value, MAX_NAME).replace(/^[\s【\[「『(（]+|[\s】\]」』)）]+$/g, '');
}

export function createEmptyRecord(name, options = {}) {
    const clean = normalizeName(name);
    const source = SOURCE_OPTIONS.includes(options.source) ? options.source : '正文';
    const floor = Number.isInteger(options.floor) ? options.floor : null;
    const record = {
        name: clean,
        aliases: [], titles: [], gender: '', age: '', origin: '', identity: '', master: '',
        look: '', shownLook: '', clothes: [], accessories: '',
        realm: '', qi: '', douqi: '', injury: '', hiddenWound: '', lifespan: '', physique: '',
        traits: [], speech: '', catchphrase: '', taboo: '', want: '', fear: '',
        favor: 0, attitude: '', publicAttitude: '', privateAttitude: '', appellation: '', stage: '',
        others: [], items: [], storage: '', money: '', property: '', debt: '',
        location: '', presence: options.presence === '在场' ? '在场' : '不在场', doing: '', reachable: '',
        secret: { hideFrom: '', what: '' },
        log: [], favorLog: [], exp: [],
        importance: options.importance === '重要' ? '重要' : '不重要',
        source,
        firstFloor: floor,
        lastFloor: floor,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    return record;
}

/** 读旧存档或手改数据时用：缺什么补什么，脏值折成空，绝不抛错。 */
export function normalizeRecord(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const name = normalizeName(input.name ?? input.姓名);
    if (!name) return null;
    const record = createEmptyRecord(name, {
        source: SOURCE_OPTIONS.includes(input.source) ? input.source : '正文',
        floor: Number.isInteger(input.firstFloor) ? input.firstFloor : null,
        presence: input.presence,
        importance: input.importance,
    });
    for (const field of NPC_FIELDS) {
        const value = input[field.key];
        if (value === undefined) continue;
        if (field.type === 'text') record[field.key] = text(value);
        else if (field.type === 'list') record[field.key] = list(value);
        else if (field.type === 'things') record[field.key] = things(value, field.key === 'clothes' ? 8 : MAX_THINGS);
        else if (field.type === 'triples') record[field.key] = triples(value);
        else if (field.type === 'secret') record[field.key] = secretValue(value);
        else if (field.type === 'enum') record[field.key] = field.options.includes(value) ? value : record[field.key];
    }
    const favor = clampFavor(input.favor);
    if (favor !== null) record.favor = favor;
    if (Array.isArray(input.log)) {
        record.log = input.log.map(item => ({
            floor: Number.isInteger(item?.floor) ? item.floor : null,
            day: Number.isFinite(Number(item?.day)) ? Number(item.day) : null,
            text: text(item?.text ?? item, 200),
        })).filter(item => item.text).slice(-MAX_LOG);
    }
    if (Array.isArray(input.favorLog)) {
        record.favorLog = input.favorLog.map(item => ({
            floor: Number.isInteger(item?.floor) ? item.floor : null,
            day: Number.isFinite(Number(item?.day)) ? Number(item.day) : null,
            delta: clampFavor(item?.delta) ?? 0,
            reason: text(item?.reason, FAVOR_REASON_MAX),
        })).slice(-MAX_FAVOR_LOG);
    }
    if (Array.isArray(input.exp)) {
        record.exp = input.exp.map(item => normalizeExpEntry(item)).filter(item => item.text).slice(-MAX_EXP);
    }
    if (Number.isInteger(input.lastFloor)) record.lastFloor = input.lastFloor;
    record.version = Math.max(1, clampNumber(input.version, 1, 1e9, 1));
    if (typeof input.createdAt === 'string') record.createdAt = input.createdAt;
    if (typeof input.updatedAt === 'string') record.updatedAt = input.updatedAt;
    return record;
}

function patchList(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (typeof payload !== 'object') return [];
    for (const key of ['人物', '记录', '档案', 'patches', 'npcs', 'list', 'changes']) {
        if (Array.isArray(payload[key])) return payload[key];
    }
    if (payload.姓名 || payload.name || payload.名字) return [payload];
    return [];
}

/** 把一条“人话补丁”折成 { name, fields, favor, favorReason, log, ... }。 */
export function normalizePatch(raw, context = {}) {
    const input = raw && typeof raw === 'object' ? raw : (typeof raw === 'string' ? { name: raw } : {});
    const result = {
        name: '', fields: {}, favor: null, favorReason: '', log: [], exp: [], presence: null,
        importance: null, source: SOURCE_OPTIONS.includes(context.source) ? context.source : null, ignored: [],
    };
    const absorb = (key, value) => {
        const target = KEY_ALIASES.get(String(key).trim());
        if (!target) { result.ignored.push(String(key)); return; }
        if (target === 'name') { if (!result.name) result.name = normalizeName(value); return; }
        if (target === 'favor') {
            const delta = clampFavorStep(String(value).replace(/^\+/, ''));
            if (delta !== null && delta !== 0) result.favor = delta;
            return;
        }
        if (target === 'favorReason') { result.favorReason = text(value, FAVOR_REASON_MAX); return; }
        if (target === 'log') {
            const entries = Array.isArray(value) ? value : [value];
            for (const entry of entries) {
                const chunk = text(entry, 200);
                if (chunk) result.log.push(chunk);
                if (result.log.length >= 6) break;
            }
            return;
        }
        if (target === 'exp') {
            const entries = Array.isArray(value) ? value : [value];
            for (const entry of entries) {
                const clean = normalizeExpEntry(entry);
                if (clean.text) result.exp.push(clean);
                if (result.exp.length >= MAX_EXP_PER_PATCH) break;
            }
            return;
        }
        if (target === 'fields') {
            if (value && typeof value === 'object' && !Array.isArray(value)) for (const [inner, item] of Object.entries(value)) absorb(inner, item);
            return;
        }
        if (target === 'presence') {
            const flag = typeof value === 'boolean' ? value : /^(在场|是|true|在)$/i.test(String(value).trim());
            const off = typeof value === 'boolean' ? !value : /^(不在场|否|false|不在|离场)$/i.test(String(value).trim());
            if (flag) result.presence = '在场';
            else if (off) result.presence = '不在场';
            return;
        }
        if (target === 'importance') {
            if (typeof value === 'boolean') { result.importance = value ? '重要' : '不重要'; return; }
            const chunk = String(value).trim();
            if (/^(重要|是|true|主角级|关键)$/i.test(chunk)) result.importance = '重要';
            else if (/^(不重要|否|false|路人|龙套)$/i.test(chunk)) result.importance = '不重要';
            return;
        }
        const field = FIELD_BY_KEY.get(target);
        if (!field) return;
        if (field.type === 'text') {
            const chunk = text(value);
            if (chunk) result.fields[field.key] = chunk;
        } else if (field.type === 'list') {
            const items = list(value);
            if (items.length) result.fields[field.key] = items;
        } else if (field.type === 'things') {
            const items = things(value, field.key === 'clothes' ? 8 : MAX_THINGS);
            if (items.length) result.fields[field.key] = items;
        } else if (field.type === 'triples') {
            const items = triples(value);
            if (items.length) result.fields[field.key] = items;
        } else if (field.type === 'secret') {
            const value2 = secretValue(value);
            if (value2.what || value2.hideFrom) result.fields[field.key] = value2;
        } else if (field.type === 'enum') {
            if (field.options.includes(String(value).trim())) result.fields[field.key] = String(value).trim();
        }
    };
    for (const [key, value] of Object.entries(input)) absorb(key, value);
    return result;
}

export function createNpcLedger({ maxRecords = 200, now = () => new Date() } = {}) {
    /** 姓名（规范化小写）→ 档案。主键是姓名，改名不换人，只往 aliases 里加。 */
    const records = new Map();
    let changes = 0;
    let lastChange = null;

    const stamp = () => {
        const value = now();
        return value instanceof Date ? value.toISOString() : String(value);
    };

    function findKey(name) {
        const clean = normalizeName(name);
        if (!clean) return null;
        const direct = clean.toLowerCase();
        if (records.has(direct)) return direct;
        for (const [key, record] of records) {
            if (record.aliases.some(alias => alias.toLowerCase() === direct)) return key;
        }
        return null;
    }

    function get(name) {
        const key = findKey(name);
        return key ? structuredClone(records.get(key)) : null;
    }

    function list(filter = {}) {
        const all = [...records.values()];
        const query = text(filter.query, 60).toLowerCase();
        return all
            .filter(record => {
                if (filter.presence && record.presence !== filter.presence) return false;
                if (filter.importance && record.importance !== filter.importance) return false;
                if (!query) return true;
                const hay = [record.name, ...record.aliases, ...record.titles, record.identity, record.location].join(' ').toLowerCase();
                return hay.includes(query);
            })
            .sort((left, right) => {
                if (left.importance !== right.importance) return left.importance === '重要' ? -1 : 1;
                if ((right.lastFloor ?? -1) !== (left.lastFloor ?? -1)) return (right.lastFloor ?? -1) - (left.lastFloor ?? -1);
                return left.name.localeCompare(right.name, 'zh');
            })
            .map(record => structuredClone(record));
    }

    /** 记账的唯一入口：补丁进，档案出新。 */
    function apply(payload, context = {}) {
        const patches = patchList(payload).map(item => normalizePatch(item, context));
        const floor = Number.isInteger(context.floor) ? context.floor : null;
        const day = Number.isFinite(Number(context.day)) ? Number(context.day) : null;
        const result = { status: 'applied', applied: [], skipped: [], ignored: [], created: [], changed: 0 };
        for (const patch of patches) {
            if (!patch.name) { result.skipped.push({ reason: 'missing_name', ignored: patch.ignored }); continue; }
            for (const key of patch.ignored) if (!result.ignored.includes(key)) result.ignored.push(key);
            // 先按主键、再按别名找人：模型写“萧炎”或写“炎帝”都指向同一份档案。
            const matched = findKey(patch.name);
            let target = null;
            if (!matched) {
                if (records.size >= maxRecords) { result.skipped.push({ name: patch.name, reason: 'ledger_full' }); continue; }
                const record = createEmptyRecord(patch.name, { source: patch.source ?? context.source ?? '正文', floor });
                records.set(record.name.toLowerCase(), record);
                result.created.push(record.name);
                target = record;
            } else {
                target = records.get(matched);
            }
            const fillOnly = context.fillEmpty === true;
            const touched = [];
            for (const [key, value] of Object.entries(patch.fields)) {
                const field = FIELD_BY_KEY.get(key);
                if (!field) continue;
                if (fillOnly && !isEmptyValue(target[key])) continue;
                if (JSON.stringify(target[key]) === JSON.stringify(value)) continue;
                target[key] = value;
                touched.push(field.label);
            }
            if (patch.presence && target.presence !== patch.presence && (!fillOnly || target.presence === '不在场')) { target.presence = patch.presence; touched.push('在场'); }
            if (patch.importance && target.importance !== patch.importance && (!fillOnly || target.importance === '不重要')) { target.importance = patch.importance; touched.push('重要度'); }
            let favorDelta = 0;
            if (patch.favor && !fillOnly) {
                const next = clampFavor(target.favor + patch.favor);
                favorDelta = next - target.favor;
                if (favorDelta !== 0) {
                    target.favor = next;
                    target.favorLog.push({ floor, day, delta: favorDelta, reason: patch.favorReason });
                    if (target.favorLog.length > MAX_FAVOR_LOG) target.favorLog.splice(0, target.favorLog.length - MAX_FAVOR_LOG);
                    touched.push(`好感${favorDelta > 0 ? '+' : ''}${favorDelta}`);
                }
            }
            if (!fillOnly) for (const line of patch.log) target.log.push({ floor, day, text: line });
            if (target.log.length > MAX_LOG) target.log.splice(0, target.log.length - MAX_LOG);
            if (!fillOnly && patch.log.length) touched.push('流水');
            if (!fillOnly) for (const entry of patch.exp) target.exp.push({ ...entry, day: entry.day ?? day, floor: entry.floor ?? floor });
            if (target.exp.length > MAX_EXP) target.exp.splice(0, target.exp.length - MAX_EXP);
            if (!fillOnly && patch.exp.length) touched.push('经历');
            target.lastFloor = floor ?? target.lastFloor;
            if (touched.length) {
                target.version += 1;
                target.updatedAt = stamp();
                changes += 1;
                lastChange = { name: target.name, fields: touched, floor, day, at: target.updatedAt };
                result.changed += 1;
            }
            result.applied.push({ name: target.name, fields: touched, favor: favorDelta, created: result.created.includes(target.name) });
        }
        if (!patches.length) result.status = 'empty';
        if (!result.applied.length && patches.length) result.status = 'ignored';
        return result;
    }

    function remove(name) {
        const key = findKey(name);
        if (!key) return { status: 'not_found' };
        const record = records.get(key);
        records.delete(key);
        changes += 1;
        lastChange = { name: record.name, fields: ['删除'], at: stamp() };
        return { status: 'removed', record };
    }

    /** 全簿经历汇总：[{ name, entries }]，经历页与精简功能从这里读。 */
    function exps() {
        return [...records.values()]
            .filter(record => record.exp.length)
            .map(record => ({ name: record.name, entries: structuredClone(record.exp) }));
    }

    /** 精简写回：用压缩后的经历整体替换这个人的经历清单。 */
    function replaceExp(name, entries) {
        const key = findKey(name);
        if (!key) return { status: 'not_found' };
        const record = records.get(key);
        const clean = (Array.isArray(entries) ? entries : []).map(item => normalizeExpEntry(item)).filter(item => item.text).slice(-MAX_EXP);
        const before = record.exp.length;
        record.exp = clean;
        if (before !== clean.length) {
            record.version += 1;
            record.updatedAt = stamp();
            changes += 1;
            lastChange = { name: record.name, fields: ['经历精简'], at: record.updatedAt };
        }
        return { status: 'replaced', name: record.name, before, after: clean.length };
    }

    /** 信息面板直接改档案：与补丁不同，空值也会写回去（玩家把一格清空就是真清空）。 */
    function setFields(name, fields, { source = '手填' } = {}) {
        const key = findKey(name);
        if (!key) return { status: 'not_found' };
        const record = records.get(key);
        const touched = [];
        for (const [fieldKey, raw] of Object.entries(fields ?? {})) {
            const field = FIELD_BY_KEY.get(fieldKey);
            if (!field) continue;
            let next;
            if (field.type === 'text') next = text(raw);
            else if (field.type === 'list') next = list(raw);
            else if (field.type === 'things') next = things(raw, fieldKey === 'clothes' ? 8 : MAX_THINGS);
            else if (field.type === 'triples') next = triples(raw);
            else if (field.type === 'secret') next = secretValue(raw);
            else if (field.type === 'enum') next = field.options.includes(String(raw ?? '').trim()) ? String(raw).trim() : record[fieldKey];
            if (JSON.stringify(record[fieldKey]) === JSON.stringify(next)) continue;
            record[fieldKey] = next;
            touched.push(field.label);
        }
        if (!touched.length) return { status: 'unchanged', name: record.name };
        record.version += 1;
        record.updatedAt = stamp();
        changes += 1;
        lastChange = { name: record.name, fields: touched, source, at: record.updatedAt };
        return { status: 'updated', name: record.name, fields: touched };
    }

    /** 信息面板加一条经历。 */
    function addExp(name, body, { day = null, floor = null } = {}) {
        const key = findKey(name);
        if (!key) return { status: 'not_found' };
        const clean = normalizeExpEntry({ text: body, day });
        if (!clean.text) return { status: 'empty' };
        const record = records.get(key);
        record.exp.push({ ...clean, floor: Number.isInteger(floor) ? floor : record.lastFloor ?? null });
        if (record.exp.length > MAX_EXP) record.exp.splice(0, record.exp.length - MAX_EXP);
        record.version += 1;
        record.updatedAt = stamp();
        changes += 1;
        lastChange = { name: record.name, fields: ['经历'], at: record.updatedAt };
        return { status: 'added', name: record.name, total: record.exp.length };
    }

    /** 信息面板删一条经历（index 用档案里的原始下标）。 */
    function removeExp(name, index) {
        const key = findKey(name);
        if (!key) return { status: 'not_found' };
        const record = records.get(key);
        const at = Number(index);
        if (!Number.isInteger(at) || at < 0 || at >= record.exp.length) return { status: 'invalid_index' };
        const [removed] = record.exp.splice(at, 1);
        record.version += 1;
        record.updatedAt = stamp();
        changes += 1;
        lastChange = { name: record.name, fields: ['经历'], at: record.updatedAt };
        return { status: 'removed', name: record.name, entry: removed };
    }

    function clear() {
        records.clear();
        changes += 1;
        lastChange = { name: '', fields: ['清空'], at: stamp() };
        return { status: 'cleared' };
    }

    function status() {
        const all = [...records.values()];
        return {
            version: NPC_LEDGER_VERSION,
            total: all.length,
            present: all.filter(record => record.presence === '在场').length,
            important: all.filter(record => record.importance === '重要').length,
            changes,
            lastChange,
            names: all.map(record => record.name),
        };
    }

    function exportAll() {
        return {
            version: NPC_LEDGER_VERSION,
            savedAt: stamp(),
            records: [...records.values()].map(record => structuredClone(record)),
        };
    }

    function load(value) {
        const payload = value && typeof value === 'object' ? value : {};
        const incoming = Array.isArray(payload) ? payload : (Array.isArray(payload.records) ? payload.records : []);
        records.clear();
        let skipped = 0;
        for (const item of incoming) {
            const record = normalizeRecord(item);
            if (!record) { skipped += 1; continue; }
            if (records.size >= maxRecords) { skipped += 1; continue; }
            records.set(record.name.toLowerCase(), record);
        }
        return { status: 'loaded', total: records.size, skipped };
    }

    /** 四象限：在场×重要 全字段；在场×不重要 一行；不在场×重要 一行；不在场×不重要 不注入。 */
    function describe(nameOrRecord, level = 'full') {
        const record = typeof nameOrRecord === 'string' ? get(nameOrRecord) : normalizeRecord(nameOrRecord);
        if (!record) return '';
        if (level === 'brief') return describeBrief(record);
        return describeFull(record);
    }

    function injection({ budget = 900, maxFull = 6, maxBrief = 14, header = NPC_LEDGER_HEADER } = {}) {
        const all = [...records.values()];
        const fullTargets = all.filter(record => record.presence === '在场' && record.importance === '重要');
        const briefTargets = all.filter(record => record.presence === '在场' && record.importance !== '重要');
        const distantTargets = all.filter(record => record.presence !== '在场' && record.importance === '重要');
        const full = fullTargets.slice(0, Math.max(0, maxFull));
        const brief = briefTargets.slice(0, Math.max(0, maxBrief));
        const distant = distantTargets.slice(0, Math.max(0, maxBrief));
        const line = record => (record.importance === '重要' ? describeBrief(record, { distant: record.presence !== '在场' }) : describeLine(record));
        const build = () => {
            const blocks = [];
            if (full.length) blocks.push(full.map(describeFull).join('\n'));
            const rest = [...brief, ...distant].map(line).filter(Boolean);
            if (rest.length) blocks.push(rest.join('\n'));
            return blocks.length ? `${header}\n${blocks.join('\n')}` : '';
        };
        let text2 = build();
        const degraded = [];
        // 超预算就从“最不重要、最久没出现”的整档描述开始降级成一行，而不是硬截断半句话。
        while (text2.length > budget && full.length > 1) {
            const dropped = full.pop();
            degraded.push(dropped.name);
            text2 = build();
        }
        let truncated = false;
        if (text2.length > budget) {
            text2 = text2.slice(0, Math.max(0, budget));
            truncated = true;
        }
        return {
            text: text2,
            chars: text2.length,
            truncated,
            degraded,
            used: [...full, ...brief, ...distant].map(record => record.name),
            counts: { full: full.length, brief: brief.length + distant.length },
        };
    }

    return Object.freeze({
        apply, get, list, remove, clear, status, exportAll, load, describe, injection, exps, replaceExp,
        setFields, addExp, removeExp,
        find: name => (findKey(name) ? true : false),
        names: () => [...records.values()].map(record => record.name),
        missing: nameOrRecord => {
            const record = typeof nameOrRecord === 'string' ? get(nameOrRecord) : normalizeRecord(nameOrRecord);
            if (!record) return [];
            return NPC_FIELDS.filter(field => isEmptyValue(record[field.key])).map(field => field.label);
        },
        fieldLabels: () => NPC_FIELDS.map(field => `${field.label}（${field.group}）`).join('、'),
    });
}

export const NPC_LEDGER_HEADER = '【人物簿·本楼已记】';

/** 一件东西写成一行：名称 + 部位/品阶/状态 或 数量/来源/藏着。 */
function thingText(item) {
    if (typeof item === 'string') return item;
    if (!item || typeof item !== 'object') return '';
    const name = item.name || '';
    const bits = [];
    if (item.count !== undefined && item.count !== '' && item.count !== 1) bits.push(`×${item.count}`);
    for (const part of [item.part, item.grade, item.state, item.source]) if (part) bits.push(part);
    if (item.hidden) bits.push('藏着');
    if (item.detail) bits.push(item.detail);
    return bits.length ? `${name}（${bits.join('·')}）` : name;
}

function joinText(value) {
    if (Array.isArray(value)) return value.map(item => thingText(item)).filter(Boolean).join('、');
    if (value && typeof value === 'object') return thingText(value);
    return text(value);
}

/** “正在做什么”本身常带“在/正在”，拼句子时别再叠一层。 */
function doingText(value) {
    return String(value ?? '').trim().replace(/^(正在|正|在)/, '').trim();
}

function describeFull(record) {    const lines = [];
    const head = [`【${record.name}】`];
    if (record.aliases.length) head.push(`别名：${record.aliases.join('、')}`);
    if (record.titles.length) head.push(`称号：${record.titles.join('、')}`);
    if (record.importance === '重要') head.push('重要人物');
    lines.push(head.join('｜'));
    const identity = [record.gender, record.age, record.identity, record.origin, record.master && `师承${record.master}`].filter(Boolean).join('·');
    if (identity) lines.push(`身份：${identity}`);
    const look = [record.look, record.shownLook && `示人：${record.shownLook}`, record.clothes.length && `衣着：${joinText(record.clothes)}`, record.accessories && `配饰：${record.accessories}`].filter(Boolean).join('｜');
    if (look) lines.push(`外貌：${look}`);
    const body = [record.realm && `修为：${record.realm}`, record.qi && `气血：${record.qi}`, record.douqi && `斗气：${record.douqi}`, record.injury && `伤势：${record.injury}`, record.hiddenWound && `暗伤：${record.hiddenWound}`, record.lifespan && `寿元：${record.lifespan}`, record.physique && `体质：${record.physique}`].filter(Boolean).join('｜');
    if (body) lines.push(body);
    const person = [record.traits.length && `性格：${record.traits.join('、')}`, record.speech && `说话：${record.speech}`, record.catchphrase && `口头禅：${record.catchphrase}`, record.taboo && `雷区：${record.taboo}`, record.want && `想要：${record.want}`, record.fear && `怕：${record.fear}`].filter(Boolean).join('｜');
    if (person) lines.push(person);
    const bond = [`好感 ${record.favor}（${favorLabel(record.favor) || '未定'}）`, record.attitude && `态度：${record.attitude}`, record.publicAttitude && `人前：${record.publicAttitude}`, record.privateAttitude && `私下：${record.privateAttitude}`, record.appellation && `称呼你：「${record.appellation}」`, record.stage && `关系：${record.stage}`].filter(Boolean).join('｜');
    lines.push(bond);
    if (record.others.length) lines.push(`对他人：${record.others.map(item => `${item.who}${item.relation ? `（${item.relation}）` : ''}${item.attitude ? `：${item.attitude}` : ''}`).join('；')}`);
    const assets = [record.items.length && `随身：${joinText(record.items)}`, record.storage && `储物：${record.storage}`, record.money && `货币：${record.money}`, record.property && `产业：${record.property}`, record.debt && `债务：${record.debt}`].filter(Boolean).join('｜');
    if (assets) lines.push(`资产：${assets}`);
    const place = [record.location && `在${record.location}`, record.doing && `正在${doingText(record.doing)}`, record.reachable && `联系：${record.reachable}`].filter(Boolean).join('，');
    if (place) lines.push(`处境：${place}`);
    if (record.secret.what || record.secret.hideFrom) lines.push(`秘密：${record.secret.hideFrom ? `瞒着${record.secret.hideFrom}` : ''}${record.secret.hideFrom && record.secret.what ? '，' : ''}${record.secret.what}`);
    const recent = record.log.slice(-1)[0];
    if (recent) lines.push(`近事：${recent.text}`);
    if (record.exp.length) lines.push(`经历：${record.exp.slice(-3).map(item => `${item.day !== null ? `第${item.day}天` : ''}${item.text}`).join('；')}`);
    return lines.join('\n');
}

function describeBrief(record, options = {}) {
    const parts = [record.name];
    const place = record.presence === '在场' ? (record.location || '在场') : (record.location ? `不在场，在${record.location}` : '不在场');
    parts.push(place);
    if (record.identity) parts.push(record.identity);
    parts.push(`好感 ${record.favor}（${favorLabel(record.favor) || '未定'}）`);
    if (record.appellation) parts.push(`称呼你「${record.appellation}」`);
    if (record.doing) parts.push(`正在${doingText(record.doing)}`);
    if (options.distant === false && record.log.length) parts.push(`近事：${record.log.slice(-1)[0].text}`);
    return parts.join('｜');
}

function describeLine(record) {
    const parts = [record.name, `好感 ${record.favor}`];
    if (record.location) parts.push(`在${record.location}`);
    if (record.doing) parts.push(record.doing);
    return parts.join('｜');
}

export { MAX_LOG, MAX_FAVOR_LOG, FIELD_BY_KEY as NPC_FIELD_INDEX };
