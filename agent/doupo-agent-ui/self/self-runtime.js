/**
 * 纳戒运行时：保存一份"主角此刻长什么样、身上有什么"的状态并在校验后修改它。
 *
 * 状态内容：身份档案（姓名/性别/年龄/种族/出身/所属/斗气属性/天赋/外貌）、境界（境界+段位）、
 * 金币、称号、功法、斗技、装备栏（穿戴中的武器防具饰品）、行囊、
 * 制作台（丹方器谱 + 进行中/已完成的炼制）、目标（主线/支线、约定）和一份操作流水。
 *
 * 所有权边界（防双写）：纳戒只记主角自身——境界、功法、斗技、物品、炼制、目标、金币。
 * 世界时钟/名声/通缉在世界台账，NPC 档案与好感在人物簿，纳戒一律不碰。
 *
 * 所有修改都走 apply()：单条操作要么通过校验生效，要么带着原因被拒绝，
 * 绝不抛异常打断调用方。面板手动操作与模型指令走同一条路，规则完全一致。
 */

import { GOAL_TITLE_MAX, normalizeGoal } from './goal-data.js';

const PROFILE_FIELDS = Object.freeze(['name', 'gender', 'age', 'race', 'origin', 'affiliation', 'attribute', 'talent', 'appearance']);
const PRIORITIES = Object.freeze(['主线', '支线']);
const CRAFT_RESULTS = Object.freeze(['success', 'fail']);
const PROFILE_LABELS = Object.freeze({ name: '姓名', gender: '性别', age: '年龄', race: '种族', origin: '出身', affiliation: '所属', attribute: '斗气属性', talent: '天赋', appearance: '外貌' });

const MAX_PROFILE_TEXT = 60;
const MAX_APPEARANCE_TEXT = 160;
const MAX_ATTRIBUTE_TEXT = 12;
const MAX_REALM_TEXT = 12;
const MAX_STAGE_TEXT = 12;
const MAX_NAME_TEXT = 30;
const MAX_GRADE_TEXT = 16;
const MAX_TYPE_TEXT = 12;
const MAX_PROGRESS_TEXT = 16;
const MAX_SOURCE_TEXT = 60;
const MAX_NOTE_TEXT = 120;
const MAX_MATERIALS_TEXT = 160;
const MAX_TITLE_TEXT = 16;
const MAX_GOAL_TEXT = 80;
const MAX_DUE_TEXT = 20;
const MAX_COUNT = 999999;
const MAX_GOLD = 999999999;
const MAX_CRAFT_DAYS = 365;

const DEFAULT_MAX_TECHNIQUES = 40;
const DEFAULT_MAX_SKILLS = 40;
const DEFAULT_MAX_EQUIPMENT = 12;
const DEFAULT_MAX_TREASURES = 12;
const DEFAULT_MAX_ITEMS = 60;
const DEFAULT_MAX_RECIPES = 30;
const DEFAULT_MAX_CRAFTS = 30;
const DEFAULT_MAX_GOALS = 20;
const DEFAULT_MAX_TITLES = 6;
const DEFAULT_MAX_LOG = 40;
const DEFAULT_MAX_OPS = 12;
const OPID_MEMORY = 200;
const MAX_OPID_TEXT = 1024;

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function intIn(value, min, max) {
    const num = Number(value);
    if (!Number.isInteger(num) || num < min || num > max) return null;
    return num;
}

function clampInt(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isInteger(num) || num < min || num > max) return fallback;
    return num;
}

function initialState(now) {
    return {
        schemaVersion: 1,
        day: 1,
        profile: Object.fromEntries(PROFILE_FIELDS.map(field => [field, ''])),
        realm: { realm: '', stage: '' },
        gold: 0,
        titles: [],
        techniques: [],
        skills: [],
        equipment: [],
        treasures: [],
        items: [],
        recipes: [],
        crafts: [],
        goals: [],
        log: [],
        updatedAt: now(),
    };
}

/** 逐条清洗条目；name 缺失整条丢弃，坏字段截断而不是作废。 */
function cleanEntry(raw, idPrefix, seq) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const name = text(raw.name);
    if (!name) return null;
    const count = intIn(raw.count, 1, MAX_COUNT);
    return {
        id: text(raw.id) || `${idPrefix}${seq}`,
        name: name.slice(0, MAX_NAME_TEXT),
        grade: text(raw.grade).slice(0, MAX_GRADE_TEXT),
        type: text(raw.type).slice(0, MAX_TYPE_TEXT),
        craft: text(raw.craft).slice(0, MAX_TYPE_TEXT),
        progress: text(raw.progress).slice(0, MAX_PROGRESS_TEXT),
        source: text(raw.source).slice(0, MAX_SOURCE_TEXT),
        note: text(raw.note).slice(0, MAX_NOTE_TEXT),
        materials: text(raw.materials).slice(0, MAX_MATERIALS_TEXT),
        category: text(raw.category).slice(0, MAX_TYPE_TEXT),
        count: count === null ? 1 : count,
        equipped: raw.equipped === true,
        startDay: clampInt(raw.startDay, 1, 99999, null),
        endDay: clampInt(raw.endDay, 1, 99999, null),
        status: raw.status === 'success' || raw.status === 'fail' ? raw.status : 'open',
        done: raw.done === true,
        priority: PRIORITIES.includes(raw.priority) ? raw.priority : '支线',
        due: text(raw.due).slice(0, MAX_DUE_TEXT),
        text: text(raw.text).slice(0, MAX_GOAL_TEXT),
    };
}

/** 只保留认识的字段并逐条清洗；坏数据丢弃而不是让整份存档作废。 */
function normalizeState(raw, now) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const profileSource = source.profile && typeof source.profile === 'object' ? source.profile : {};
    const realmSource = source.realm && typeof source.realm === 'object' ? source.realm : {};
    const cleanList = (list, prefix) => (Array.isArray(list) ? list : [])
        .map((item, index) => cleanEntry(item, prefix, index + 1))
        .filter(Boolean);
    return {
        schemaVersion: 1,
        day: clampInt(source.day, 1, 99999, 1),
        profile: Object.fromEntries(PROFILE_FIELDS.map(field => [field, text(profileSource[field]).slice(0, field === 'appearance' ? MAX_APPEARANCE_TEXT : field === 'attribute' ? MAX_ATTRIBUTE_TEXT : MAX_PROFILE_TEXT)])),
        realm: {
            realm: text(realmSource.realm).slice(0, MAX_REALM_TEXT),
            stage: text(realmSource.stage).slice(0, MAX_STAGE_TEXT),
        },
        gold: clampInt(source.gold, 0, MAX_GOLD, 0),
        titles: (Array.isArray(source.titles) ? source.titles : []).map(item => text(item).slice(0, MAX_TITLE_TEXT)).filter(Boolean).slice(0, DEFAULT_MAX_TITLES),
        techniques: cleanList(source.techniques, 't'),
        skills: cleanList(source.skills, 's'),
        // 装备栏＝穿戴中的装备；旧档行囊里 equipped=true 的条目载入时自动迁进来（保留原编号），
        // 从此"穿在身上"只有装备栏一个真账，行囊只放没在用的东西。
        equipment: [
            ...cleanList(source.equipment, 'e'),
            ...cleanList(source.items, 'b').filter(item => item.equipped === true).map(({ equipped, ...rest }) => rest),
        ].slice(-DEFAULT_MAX_EQUIPMENT),
        treasures: cleanList(source.treasures, 'z'),
        items: cleanList(source.items, 'b').filter(item => item.equipped !== true),
        recipes: cleanList(source.recipes, 'r'),
        crafts: cleanList(source.crafts, 'c'),
        // 目标走专用归一：title/text 分离、老档补兼容标题、text-only 数据库行不再因缺 name 被丢。
        goals: (Array.isArray(source.goals) ? source.goals : [])
            .map((item, index) => normalizeGoal(item, index + 1))
            .filter(Boolean),
        log: (Array.isArray(source.log) ? source.log : []).slice(-DEFAULT_MAX_LOG),
        updatedAt: text(source.updatedAt) || now(),
    };
}

export function createSelfRuntime({
    maxTechniques = DEFAULT_MAX_TECHNIQUES,
    maxSkills = DEFAULT_MAX_SKILLS,
    maxEquipment = DEFAULT_MAX_EQUIPMENT,
    maxTreasures = DEFAULT_MAX_TREASURES,
    maxItems = DEFAULT_MAX_ITEMS,
    maxRecipes = DEFAULT_MAX_RECIPES,
    maxCrafts = DEFAULT_MAX_CRAFTS,
    maxGoals = DEFAULT_MAX_GOALS,
    maxTitles = DEFAULT_MAX_TITLES,
    maxLog = DEFAULT_MAX_LOG,
    maxOps = DEFAULT_MAX_OPS,
    now = () => new Date().toISOString(),
} = {}) {
    maxTechniques = clampInt(maxTechniques, 5, 200, DEFAULT_MAX_TECHNIQUES);
    maxSkills = clampInt(maxSkills, 5, 200, DEFAULT_MAX_SKILLS);
    maxEquipment = clampInt(maxEquipment, 2, 50, DEFAULT_MAX_EQUIPMENT);
    maxTreasures = clampInt(maxTreasures, 2, 50, DEFAULT_MAX_TREASURES);
    maxItems = clampInt(maxItems, 10, 500, DEFAULT_MAX_ITEMS);
    maxRecipes = clampInt(maxRecipes, 5, 200, DEFAULT_MAX_RECIPES);
    maxCrafts = clampInt(maxCrafts, 5, 200, DEFAULT_MAX_CRAFTS);
    maxGoals = clampInt(maxGoals, 5, 100, DEFAULT_MAX_GOALS);
    maxTitles = clampInt(maxTitles, 2, 20, DEFAULT_MAX_TITLES);
    maxLog = clampInt(maxLog, 5, 200, DEFAULT_MAX_LOG);
    maxOps = clampInt(maxOps, 1, 32, DEFAULT_MAX_OPS);
    let state = initialState(now);
    const seq = { t: 0, s: 0, b: 0, e: 0, z: 0, r: 0, c: 0, g: 0 };
    let opIdMemory = [];
    let lastFloor = null; // 最近一次由模型落账的楼层：{ floor, undo }，同楼重 roll 时用来回滚

    // 每种操作归属的清单；id 前缀 t/s/b/r/c/g 各自独立编号。
    const LIST_OF_KIND = Object.freeze({
        addTechnique: 'techniques', updateTechnique: 'techniques', removeTechnique: 'techniques',
        addSkill: 'skills', updateSkill: 'skills', removeSkill: 'skills',
        addEquipment: 'equipment', updateEquipment: 'equipment', removeEquipment: 'equipment',
        addTreasure: 'treasures', updateTreasure: 'treasures', removeTreasure: 'treasures',
        addItem: 'items', updateItem: 'items', removeItem: 'items',
        addRecipe: 'recipes', removeRecipe: 'recipes',
        startCraft: 'crafts', finishCraft: 'crafts',
        addGoal: 'goals', finishGoal: 'goals', removeGoal: 'goals',
    });
    const ID_PREFIX_OF_KIND = Object.freeze({ addTechnique: 't', addSkill: 's', addEquipment: 'e', addTreasure: 'z', addItem: 'b', addRecipe: 'r', startCraft: 'c', addGoal: 'g' });
    const ENTRY_LABELS = Object.freeze({ techniques: '功法', skills: '斗技', equipment: '装备', treasures: '天材地宝', items: '行囊', recipes: '丹方', crafts: '炼器', goals: '目标' });

    function listKeyOf(kind) {
        return LIST_OF_KIND[kind] ?? null;
    }

    function nextId(kind) {
        const prefix = ID_PREFIX_OF_KIND[kind];
        if (!prefix) return '';
        seq[prefix] += 1;
        return `${prefix}${seq[prefix]}`;
    }

    function findEntry(kind, id) {
        const key = listKeyOf(kind);
        if (!key || !id) return null;
        return state[key]?.find(item => item.id === id) ?? null;
    }

    function prune(key) {
        const cap = { techniques: maxTechniques, skills: maxSkills, equipment: maxEquipment, treasures: maxTreasures, items: maxItems, recipes: maxRecipes, crafts: maxCrafts, goals: maxGoals }[key];
        if (!cap || !state[key] || state[key].length <= cap) return;
        // 从最旧开始丢：纳戒以"手里的"为准，账满时最早登记者先退场。
        state[key] = state[key].slice(state[key].length - cap);
    }

    function rememberOpId(opId) {
        if (!opId) return;
        opIdMemory.push(opId);
        if (opIdMemory.length > OPID_MEMORY) opIdMemory = opIdMemory.slice(-OPID_MEMORY);
    }

    function dayNow() {
        return clampInt(state.day, 1, 99999, 1);
    }

    /** 炼制事项的一行摘要，面板与注入共用。 */
    function craftLine(job) {
        const kind = job.craft || '炼制';
        if (job.status === 'open') {
            const left = job.endDay !== null && job.endDay !== undefined
                ? (job.endDay >= dayNow() ? `，剩 ${job.endDay - dayNow() + 1} 天` : '，已超期')
                : '';
            return `${kind}·${job.name}${job.count > 1 ? `×${job.count}` : ''}${left}${job.note ? `（${job.note}）` : ''}`;
        }
        return `${kind}·${job.name}：${job.status === 'success' ? '炼成' : '失败'}${job.note ? `（${job.note}）` : ''}`;
    }

    /** 单条操作校验 + 执行；返回结果对象，绝不抛出。undo 是它的反向操作，供同楼重 roll 时撤销。 */
    function runOne(op) {
        if (!op || typeof op !== 'object' || Array.isArray(op)) return { ok: false, reason: 'bad_op_shape' };
        const kind = text(op.op);
        // —— 身份档案 ——
        if (kind === 'setProfile') {
            const field = text(op.field);
            if (!PROFILE_FIELDS.includes(field)) return { ok: false, reason: 'bad_field' };
            const cap = field === 'appearance' ? MAX_APPEARANCE_TEXT : field === 'attribute' ? MAX_ATTRIBUTE_TEXT : MAX_PROFILE_TEXT;
            const body = text(op.text).slice(0, cap);
            const before = state.profile[field];
            state.profile[field] = body;
            return { ok: true, summary: `${PROFILE_LABELS[field]}：${before || '（空）'} → ${body || '（空）'}`, undo: { op: 'setProfile', field, text: before } };
        }
        if (kind === 'setRealm') {
            const rawRealm = text(op.realm);
            if (!rawRealm) return { ok: false, reason: 'realm_missing' };
            if (rawRealm.length > MAX_REALM_TEXT) return { ok: false, reason: 'realm_too_long' };
            const stage = text(op.stage ?? '');
            if (stage.length > MAX_STAGE_TEXT) return { ok: false, reason: 'stage_too_long' };
            const before = { ...state.realm };
            state.realm = { realm: rawRealm, stage };
            return { ok: true, summary: `境界：${before.realm || '（空）'}${before.stage || ''} → ${rawRealm}${stage}`, undo: { op: '_restoreRealm', realm: before.realm, stage: before.stage } };
        }
        if (kind === 'setGold') {
            const amount = intIn(op.amount, 0, MAX_GOLD);
            if (amount === null) return { ok: false, reason: 'bad_amount' };
            const before = state.gold;
            state.gold = amount;
            return { ok: true, summary: `金币：${before} → ${amount}`, undo: { op: 'setGold', amount: before } };
        }
        if (kind === 'addGold') {
            const delta = intIn(op.amount, -MAX_GOLD, MAX_GOLD);
            if (delta === null || !delta) return { ok: false, reason: 'bad_amount' };
            const before = state.gold;
            state.gold = Math.min(MAX_GOLD, Math.max(0, before + delta));
            return { ok: true, summary: `金币${delta > 0 ? '+' : ''}${delta}：${before} → ${state.gold}`, undo: { op: 'setGold', amount: before } };
        }
        if (kind === 'addTitle') {
            const body = text(op.text);
            if (!body) return { ok: false, reason: 'text_missing' };
            if (body.length > MAX_TITLE_TEXT) return { ok: false, reason: 'text_too_long' };
            if (state.titles.includes(body)) return { ok: false, reason: 'duplicate' };
            if (state.titles.length >= maxTitles) return { ok: false, reason: 'titles_full' };
            state.titles.push(body);
            return { ok: true, summary: `称号 +${body}`, undo: { op: 'removeTitle', text: body } };
        }
        if (kind === 'removeTitle') {
            const body = text(op.text);
            const at = state.titles.indexOf(body);
            if (!body || at < 0) return { ok: false, reason: 'title_not_found' };
            state.titles.splice(at, 1);
            return { ok: true, summary: `称号 -${body}`, undo: { op: '_restoreTitle', text: body, index: at } };
        }
        // —— 清单新增：功法/斗技/装备/天材地宝/行囊/配方/目标 ——
        if (kind === 'addTechnique' || kind === 'addSkill' || kind === 'addEquipment' || kind === 'addTreasure' || kind === 'addItem' || kind === 'addRecipe' || kind === 'addGoal') {
            if (kind === 'addGoal') {
                // 目标的短标题与完整内容分开：标题必填 ≤20 字（缺/超长整条拒绝），内容另存 ≤80 字。
                const title = text(op.title);
                if (!title) return { ok: false, reason: 'title_missing' };
                if (title.length > GOAL_TITLE_MAX) return { ok: false, reason: 'title_too_long' };
                const body = text(op.text);
                if (!body) return { ok: false, reason: 'text_missing' };
                if (body.length > MAX_GOAL_TEXT) return { ok: false, reason: 'text_too_long' };
                const entry = normalizeGoal({ ...op, title, name: title }, seq.g + 1);
                // 撤销恢复时带原编号；新登记才发新号。恢复原编号时序号计数器同步前进，避免重复发号。
                if (!text(op.id)) entry.id = nextId(kind);
                else seq.g = Math.max(seq.g, Number(String(entry.id).replace(/\D/g, '')) || 0);
                state.goals.push(entry);
                prune('goals');
                const dueNote = entry.due ? `（期限：${entry.due}）` : '';
                return { ok: true, id: entry.id, summary: `目标 +${entry.id}「${entry.title}」（${entry.priority}）：${entry.text}${dueNote}`, undo: { op: 'removeGoal', id: entry.id } };
            }
            const name = text(op.name);
            if (!name) return { ok: false, reason: 'name_missing' };
            if (name.length > MAX_NAME_TEXT) return { ok: false, reason: 'name_too_long' };
            const key = listKeyOf(kind);
            const list = state[key];
            // 行囊同名同类别合并数量；功法/斗技同名进行中不重录。
            const twin = kind === 'addItem'
                ? list.find(item => item.name === name && item.category === text(op.category ?? ''))
                : list.find(item => item.name === name);
            if (twin) {
                if (kind === 'addItem') {
                    const add = intIn(op.count, 1, MAX_COUNT) ?? 1;
                    const before = twin.count;
                    twin.count = Math.min(MAX_COUNT, before + add);
                    return { ok: true, id: twin.id, summary: `行囊 ${twin.name}×${before} → ${twin.count}`, undo: { op: 'updateItem', id: twin.id, count: before } };
                }
                return { ok: false, reason: 'duplicate' };
            }
            const entry = cleanEntry({ ...op, name }, ID_PREFIX_OF_KIND[kind], seq[ID_PREFIX_OF_KIND[kind]] + 1);
            if (!text(op.id)) entry.id = nextId(kind);
            else seq[ID_PREFIX_OF_KIND[kind]] = Math.max(seq[ID_PREFIX_OF_KIND[kind]], Number(String(entry.id).replace(/\D/g, '')) || 0);
            list.push(entry);
            prune(key);
            const pieces = [entry.name];
            if (entry.grade) pieces.push(entry.grade);
            if ((kind === 'addEquipment' || kind === 'addTreasure') && entry.type) pieces.push(entry.type);
            if (kind === 'addItem') pieces.push(`×${entry.count}`);
            if (entry.note) pieces.push(`（${entry.note}）`);
            return { ok: true, id: entry.id, summary: `${ENTRY_LABELS[key]} +${entry.id}：${pieces.join('·')}`, undo: { op: { addTechnique: 'removeTechnique', addSkill: 'removeSkill', addEquipment: 'removeEquipment', addTreasure: 'removeTreasure', addItem: 'removeItem', addRecipe: 'removeRecipe' }[kind], id: entry.id } };
        }
        // —— 清单修改 ——
        if (kind === 'updateTechnique' || kind === 'updateSkill' || kind === 'updateEquipment' || kind === 'updateTreasure' || kind === 'updateItem') {
            const entry = findEntry(kind, text(op.id));
            if (!entry) return { ok: false, reason: 'id_not_found' };
            const before = {};
            const name = op.name === undefined ? undefined : text(op.name);
            if (name && name.length > MAX_NAME_TEXT) return { ok: false, reason: 'name_too_long' };
            const count = op.count === undefined ? undefined : intIn(op.count, 0, MAX_COUNT);
            if (count === null) return { ok: false, reason: 'bad_count' };
            if (name !== undefined && name) {
                before.name = entry.name;
                entry.name = name;
            }
            for (const field of ['grade', 'type', 'craft', 'progress', 'source', 'note', 'materials', 'category']) {
                if (op[field] === undefined) continue;
                const cap = field === 'note' ? MAX_NOTE_TEXT : field === 'materials' ? MAX_MATERIALS_TEXT : field === 'source' ? MAX_SOURCE_TEXT : field === 'grade' ? MAX_GRADE_TEXT : field === 'progress' ? MAX_PROGRESS_TEXT : MAX_TYPE_TEXT;
                before[field] = entry[field];
                entry[field] = text(op[field]).slice(0, cap);
            }
            if (op.equipped !== undefined) {
                before.equipped = entry.equipped;
                entry.equipped = op.equipped === true;
            }
            if (count !== undefined) {
                before.count = entry.count;
                if (count === 0) {
                    // 数量改到 0 等于用光：移除条目，撤销时按原数量恢复。
                    const key = listKeyOf(kind);
                    state[key] = state[key].filter(item => item.id !== entry.id);
                    before.count = before.count || entry.count;
                    const undo = { op: 'addItem', ...structuredClone(entry), count: before.count };
                    delete undo.id;
                    return { ok: true, id: entry.id, summary: `行囊 ${entry.name} 用光移除`, undo };
                }
                entry.count = count;
            }
            if (!Object.keys(before).length) return { ok: false, reason: 'nothing_to_update' };
            const undo = { op: kind, id: entry.id, ...before };
            return { ok: true, id: entry.id, summary: `更新 ${entry.id}：${Object.keys(before).map(field => `${field}=${Array.isArray(entry[field]) ? entry[field] : String(entry[field] ?? '')}`).join('、')}`, undo };
        }
        // —— 清单移除 ——
        if (kind === 'removeTechnique' || kind === 'removeSkill' || kind === 'removeEquipment' || kind === 'removeTreasure' || kind === 'removeItem' || kind === 'removeRecipe' || kind === 'removeGoal') {
            const entry = findEntry(kind, text(op.id));
            if (!entry) return { ok: false, reason: 'id_not_found' };
            const key = listKeyOf(kind);
            // removeItem 带数量是"用掉一部分"：数量扣到 0 才真正移除。
            if (kind === 'removeItem' && op.count !== undefined) {
                const take = intIn(op.count, 1, entry.count);
                if (take === null) return { ok: false, reason: 'bad_count' };
                if (take < entry.count) {
                    const before = entry.count;
                    entry.count -= take;
                    return { ok: true, id: entry.id, summary: `行囊 ${entry.name}×${before} → ${entry.count}`, undo: { op: 'updateItem', id: entry.id, count: before } };
                }
            }
            const index = state[key].indexOf(entry);
            state[key] = state[key].filter(item => item.id !== entry.id);
            const addOpOf = { removeTechnique: 'addTechnique', removeSkill: 'addSkill', removeEquipment: 'addEquipment', removeTreasure: 'addTreasure', removeItem: 'addItem', removeRecipe: 'addRecipe' };
            // 目标与行囊撤销整条恢复，不能走普通新增的同名合并。
            const restoreOp = kind === 'removeGoal'
                ? { op: '_restoreGoal', entry: structuredClone(entry) }
                : kind === 'removeItem' ? { op: '_restoreItem', entry: structuredClone(entry), index }
                    : { op: addOpOf[kind], ...structuredClone(entry) };
            return { ok: true, id: entry.id, summary: `移除 ${entry.id}：${kind === 'removeGoal' ? (entry.title || entry.text) : entry.name}`, undo: restoreOp };
        }
        // —— 制作台 ——
        if (kind === 'startCraft') {
            const name = text(op.name);
            if (!name) return { ok: false, reason: 'name_missing' };
            if (name.length > MAX_NAME_TEXT) return { ok: false, reason: 'name_too_long' };
            const craft = text(op.craft ?? '') || '炼药';
            if (state.crafts.some(job => job.status === 'open' && job.name === name && job.craft === craft)) return { ok: false, reason: 'duplicate' };
            const count = intIn(op.count, 1, MAX_COUNT) ?? 1;
            let endDay = null;
            if (op.days !== undefined && op.days !== null) {
                const span = intIn(op.days, 1, MAX_CRAFT_DAYS);
                if (span === null) return { ok: false, reason: 'bad_days' };
                endDay = dayNow() + span - 1;
            }
            const job = {
                id: nextId('startCraft'),
                name: name.slice(0, MAX_NAME_TEXT),
                craft: craft.slice(0, MAX_TYPE_TEXT),
                type: '', grade: '', progress: '', source: '', materials: '',
                category: '', count, equipped: false,
                note: text(op.note).slice(0, MAX_NOTE_TEXT),
                status: 'open',
                startDay: dayNow(),
                endDay,
                done: false, priority: '支线', due: '', text: '',
            };
            state.crafts.push(job);
            prune('crafts');
            const due = endDay !== null ? `，预计第 ${endDay} 天完成` : '';
            return { ok: true, id: job.id, summary: `开工 ${job.id}：${craft}·${name}${count > 1 ? `×${count}` : ''}${due}`, undo: { op: 'removeCraft', id: job.id } };
        }
        if (kind === 'finishCraft') {
            const job = findEntry(kind, text(op.id));
            if (!job) return { ok: false, reason: 'id_not_found' };
            if (job.status !== 'open') return { ok: false, reason: 'already_finished' };
            if (!CRAFT_RESULTS.includes(op.result)) return { ok: false, reason: 'bad_result' };
            const before = { status: job.status, note: job.note };
            job.status = op.result;
            job.note = text(op.note ?? '') || job.note;
            return { ok: true, id: job.id, summary: craftLine(job), undo: { op: 'updateCraft', id: job.id, ...before } };
        }
        // —— 目标 ——
        if (kind === 'finishGoal') {
            const goal = findEntry(kind, text(op.id));
            if (!goal) return { ok: false, reason: 'id_not_found' };
            const before = goal.done;
            goal.done = true;
            return { ok: true, id: goal.id, summary: `目标达成 ${goal.id}：${goal.title || goal.text}`, undo: { op: 'updateGoal', id: goal.id, done: before } };
        }
        // —— 内部撤销操作：只由同楼重 roll 的回滚调用，不写进模型指南。——
        if (kind === 'removeCraft') {
            const at = state.crafts.findIndex(job => job.id === text(op.id));
            if (at >= 0) { state.crafts.splice(at, 1); return { ok: true, summary: `撤销开工 ${text(op.id)}` }; }
            return { ok: false, reason: 'id_not_found' };
        }
        if (kind === 'updateCraft') {
            const job = state.crafts.find(item => item.id === text(op.id));
            if (!job) return { ok: false, reason: 'id_not_found' };
            if (op.status !== undefined && (op.status === 'open' || CRAFT_RESULTS.includes(op.status))) job.status = op.status;
            if (op.note !== undefined) job.note = text(op.note).slice(0, MAX_NOTE_TEXT);
            return { ok: true, summary: `恢复炼制 ${job.id}` };
        }
        if (kind === 'updateGoal') {
            const goal = state.goals.find(item => item.id === text(op.id));
            if (!goal) return { ok: false, reason: 'id_not_found' };
            if (op.done !== undefined) goal.done = op.done === true;
            return { ok: true, summary: `恢复目标 ${goal.id}` };
        }
        if (kind === '_restoreTitle') {
            const body = text(op.text);
            const index = intIn(op.index, 0, state.titles.length);
            if (!body || body.length > MAX_TITLE_TEXT || index === null || state.titles.includes(body) || state.titles.length >= maxTitles) return { ok: false, reason: 'restore_conflict' };
            state.titles.splice(index, 0, body);
            return { ok: true, summary: `恢复称号 ${body}` };
        }
        if (kind === '_restoreRealm') {
            state.realm = { realm: text(op.realm), stage: text(op.stage) };
            return { ok: true, summary: '恢复境界' };
        }
        if (kind === '_restoreEntries') {
            if (!Object.hasOwn(ENTRY_LABELS, op.key) || !Array.isArray(op.added) || !Array.isArray(op.entries)) return { ok: false, reason: 'bad_restore' };
            const list = state[op.key];
            if (op.added.some(id => !list.some(entry => entry.id === id)) || op.entries.some(({ entry, present }) => list.some(item => item.id === entry.id) !== present)) return { ok: false, reason: 'restore_conflict' };
            state[op.key] = list.filter(entry => !op.added.includes(entry.id) && !op.entries.some(item => item.entry.id === entry.id));
            for (const { entry, index } of op.entries) state[op.key].splice(Math.min(index, state[op.key].length), 0, structuredClone(entry));
            return { ok: true, summary: `恢复${ENTRY_LABELS[op.key]}` };
        }
        if (kind === '_restoreItem') {
            const entry = cleanEntry(op.entry, 'b', seq.b + 1);
            if (!entry || state.items.some(item => item.id === entry.id)) return { ok: false, reason: 'id_not_found' };
            state.items.splice(intIn(op.index, 0, state.items.length) ?? state.items.length, 0, entry);
            seq.b = Math.max(seq.b, Number(String(entry.id).replace(/\D/g, '')) || 0);
            return { ok: true, summary: `恢复行囊 ${entry.id}` };
        }
        // 目标撤销的整条恢复：移除/重 roll 回滚专用，把移除前的完整条目（含 title/done）放回原清单。
        if (kind === '_restoreGoal') {
            const entry = normalizeGoal(op.entry);
            if (!entry || state.goals.some(item => item.id === entry.id)) return { ok: false, reason: 'id_not_found' };
            state.goals.push(entry);
            return { ok: true, summary: `恢复目标 ${entry.id}` };
        }
        return { ok: false, reason: 'unknown_op' };
    }

    // 结构变化按完整条目恢复（包括容量裁剪）；普通字段更新仍只撤回自己改过的字段。
    function runTracked(op) {
        const key = listKeyOf(text(op?.op));
        const before = key ? structuredClone(state[key]) : null;
        const result = runOne(op);
        if (result.ok && before) {
            const after = state[key];
            const added = after.filter(entry => !before.some(item => item.id === entry.id)).map(entry => entry.id);
            const removed = before.filter(entry => !after.some(item => item.id === entry.id));
            if ((added.length || removed.length) && result.undo?.op !== '_restoreItem') {
                const entries = before.flatMap((entry, index) => {
                    const current = after.find(item => item.id === entry.id);
                    return !current || JSON.stringify(current) !== JSON.stringify(entry) ? [{ entry, index, present: Boolean(current) }] : [];
                });
                result.undo = { op: '_restoreEntries', key, added, entries };
            }
        }
        return result;
    }

    function baselineForFloor(floor) {
        if (!lastFloor || lastFloor.floor !== floor) return structuredClone(state);
        const current = state;
        const counters = { ...seq };
        state = structuredClone(state);
        try {
            if (lastFloor.blocked === 'equipment_transfer') throw new Error('transfer_conflict');
            for (const undo of [...lastFloor.undo].reverse()) {
                if (!runOne(undo).ok) throw new Error('rollback_failed');
            }
            return structuredClone(state);
        } catch (cause) {
            const error = new Error('rollback_failed', { cause });
            error.code = 'rollback_failed';
            throw error;
        } finally {
            state = current;
            Object.assign(seq, counters);
        }
    }

    function apply(operations, { source = 'llm', floor = null, day = null } = {}) {
        const floorKey = Number.isInteger(floor) && floor >= 0 ? floor : null;
        const fromModel = source === 'llm' || source === 'decide' || source === 'mvu';
        const list = Array.isArray(operations) ? operations.slice(0, maxOps) : [];
        if (list.some(op => text(op?.opId).length > MAX_OPID_TEXT)) return { status: 'rejected', applied: [], rejected: [{ op: 'apply', reason: 'bad_op_id' }], duplicate: [] };
        // 先在临时副本验证所有撤销，任一步失败都保留当前账、日期、流水和去重记忆。
        if (fromModel && floorKey !== null && lastFloor && lastFloor.floor === floorKey) {
            try { state = baselineForFloor(floorKey); }
            catch { return { status: 'rejected', applied: [], rejected: [{ op: 'revert', reason: 'rollback_failed' }], duplicate: [] }; }
            opIdMemory = opIdMemory.filter(id => !(lastFloor.opIds ?? []).includes(id));
            state.log.push({ at: now(), source: 'revert', summaries: [`第 ${floorKey + 1} 楼重新生成：已撤销上一版纳戒指令`], rejected: 0 });
            state.log = state.log.slice(-maxLog);
        }
        if (Number.isInteger(day) && day >= 1) state.day = Math.min(99999, day);
        const applied = [];
        const rejected = [];
        const undoSteps = [];
        const floorOpIds = [];
        const duplicate = [];
        for (const op of list) {
            const opId = text(op?.opId);
            if (opId && opIdMemory.includes(opId)) {
                duplicate.push(opId);
                continue;
            }
            const result = runTracked(op);
            if (result.ok) {
                rememberOpId(opId);
                if (opId) floorOpIds.push(opId);
                applied.push(result);
                if (result.undo) undoSteps.push(result.undo);
            } else {
                rejected.push({ op: text(op?.op), reason: result.reason });
            }
        }
        if (fromModel && floorKey !== null) lastFloor = { floor: floorKey, undo: undoSteps, opIds: floorOpIds };
        if (applied.length) {
            state.updatedAt = now();
            state.log.push({ at: now(), source, summaries: applied.map(item => item.summary), rejected: rejected.length });
            state.log = state.log.slice(-maxLog);
        }
        return { status: rejected.length && !applied.length ? 'rejected' : applied.length ? 'applied' : 'noop', applied, rejected, duplicate };
    }

    /** 穿卸是独立的手工事务：只转移一件，预检通过后才改两张清单，不调用 restore 清空撤销历史。 */
    function transferEquipment(id, { direction, source = 'manual', day = null } = {}) {
        const reject = reason => ({ status: 'rejected', applied: [], rejected: [{ op: 'transferEquipment', reason }], duplicate: [] });
        if (direction !== 'equip' && direction !== 'unequip') return reject('bad_direction');
        const equip = direction === 'equip';
        const from = equip ? state.items : state.equipment;
        const to = equip ? state.equipment : state.items;
        const matches = from.filter(item => item.id === text(id));
        if (matches.length !== 1) return reject(matches.length ? 'id_collision' : 'id_not_found');
        const entry = matches[0];
        if (intIn(entry.count, 1, MAX_COUNT) === null) return reject('bad_count');
        if (to.some(item => item.id === entry.id)) return reject('id_collision');
        const twins = to.filter(item => item.name === entry.name && (equip || item.category === entry.category));
        if (equip && twins.length) return reject('duplicate');
        const twin = twins[0];
        if (twin) {
            // 同名不同备注/来源/品级等不能静默合并，否则卸下会抹掉物品身世。
            const fields = new Set([...Object.keys(entry), ...Object.keys(twin)]);
            if (twins.length !== 1 || [...fields].some(field => !['id', 'count', 'equipped'].includes(field) && entry[field] !== twin[field])) return reject('metadata_conflict');
            if (intIn(twin.count, 1, MAX_COUNT - 1) === null) return reject('count_overflow');
        } else if (to.length >= (equip ? maxEquipment : maxItems)) return reject(equip ? 'equipment_full' : 'items_full');
        const prefix = equip ? 'e' : 'b';
        const targetId = twin?.id ?? (entry.count === 1 ? entry.id : `${prefix}${seq[prefix] + 1}`);
        if (!twin && [...state.items, ...state.equipment].some(item => item.id === targetId && item !== entry)) return reject('id_collision');
        if (!twin && entry.count > 1 && targetId === entry.id) return reject('id_collision');
        const moved = { ...structuredClone(entry), id: targetId, count: 1, equipped: false };
        const at = now();
        const touchedIds = new Set([entry.id, targetId]);
        const conflicts = lastFloor?.undo.some(undo => {
            if (undo.op === '_restoreEntries' && ['items', 'equipment'].includes(undo.key)) return [...undo.added, ...undo.entries.map(item => item.entry.id)].some(id => touchedIds.has(id));
            return ['updateItem', 'updateEquipment', '_restoreItem'].includes(undo.op) && touchedIds.has(undo.id ?? undo.entry?.id);
        });
        // 从这里开始才提交；保留原栈余量和目标栈元数据，编号也只在成功时消费。
        if (conflicts) lastFloor.blocked = 'equipment_transfer';
        if (entry.count === 1) from.splice(from.indexOf(entry), 1);
        else entry.count -= 1;
        if (twin) twin.count += 1;
        else {
            to.push(moved);
            const match = /^([be])(\d+)$/.exec(targetId);
            if (match) seq[match[1]] = Math.max(seq[match[1]], Number(match[2]));
        }
        if (Number.isInteger(day) && day >= 1) state.day = Math.min(99999, day);
        const summary = `${moved.name}×1${equip ? '穿上' : '卸回行囊'}`;
        state.updatedAt = at;
        state.log.push({ at, source, summaries: [summary], rejected: 0 });
        state.log = state.log.slice(-maxLog);
        return { status: 'applied', applied: [{ ok: true, id: targetId, summary }], rejected: [], duplicate: [] };
    }

    function snapshot() {
        // 仅外围携带可重放元数据，业务 state 与楼层投影不包含它，避免嵌套快照。
        return { ...structuredClone(state), _runtime: structuredClone({ version: 1, seq, opIds: opIdMemory, lastFloor }) };
    }

    function readReplay(raw) {
        const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
        const ids = (value, limit = OPID_MEMORY) => Array.isArray(value) && value.length <= limit && value.every(id => typeof id === 'string' && id.length > 0 && id.length <= MAX_OPID_TEXT) && new Set(value).size === value.length;
        const entry = (value, key) => {
            if (!object(value) || typeof value.id !== 'string' || value.id.length > 1024) return false;
            const cleaned = key === 'goals' ? normalizeGoal(value) : cleanEntry(value, 'b', 1);
            return cleaned && Object.keys(value).length === Object.keys(cleaned).length && Object.keys(cleaned).every(field => value[field] === cleaned[field]);
        };
        const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
        const string = (value, max, required = false) => typeof value === 'string' && value.length <= max && (!required || Boolean(text(value)));
        const shape = (value, required, optional = []) => object(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => [...required, ...optional].includes(key));
        const undo = value => {
            if (!object(value)) return false;
            if (value.op === '_restoreEntries') {
                return shape(value, ['op', 'key', 'added', 'entries']) && Object.hasOwn(ENTRY_LABELS, value.key) && ids(value.added, 1000) && Array.isArray(value.entries) && value.entries.length <= 1000 && value.entries.every(item => shape(item, ['entry', 'index', 'present']) && entry(item.entry, value.key) && integer(item.index, 0, 1000) && typeof item.present === 'boolean');
            }
            if (value.op === '_restoreItem') return shape(value, ['op', 'entry', 'index']) && entry(value.entry, 'items') && integer(value.index, 0, 1000);
            if (value.op === '_restoreGoal') return shape(value, ['op', 'entry']) && entry(value.entry, 'goals');
            if (value.op === '_restoreTitle') return shape(value, ['op', 'text', 'index']) && string(value.text, MAX_TITLE_TEXT, true) && integer(value.index, 0, 20);
            if (value.op === 'setProfile') {
                const cap = value.field === 'appearance' ? MAX_APPEARANCE_TEXT : value.field === 'attribute' ? MAX_ATTRIBUTE_TEXT : MAX_PROFILE_TEXT;
                return shape(value, ['op', 'field', 'text']) && PROFILE_FIELDS.includes(value.field) && string(value.text, cap);
            }
            if (value.op === '_restoreRealm') return shape(value, ['op', 'realm', 'stage']) && string(value.realm, MAX_REALM_TEXT) && string(value.stage, MAX_STAGE_TEXT);
            if (value.op === 'setGold') return shape(value, ['op', 'amount']) && integer(value.amount, 0, MAX_GOLD);
            if (value.op === 'addTitle' || value.op === 'removeTitle') return shape(value, ['op', 'text']) && string(value.text, MAX_TITLE_TEXT, true);
            if (value.op === 'updateGoal') return shape(value, ['op', 'id', 'done']) && string(value.id, 1024, true) && typeof value.done === 'boolean';
            if (value.op === 'updateCraft') return shape(value, ['op', 'id', 'status', 'note']) && string(value.id, 1024, true) && ['open', ...CRAFT_RESULTS].includes(value.status) && string(value.note, MAX_NOTE_TEXT);
            if (!['updateTechnique', 'updateSkill', 'updateEquipment', 'updateTreasure', 'updateItem'].includes(value.op)) return false;
            const caps = { name: MAX_NAME_TEXT, grade: MAX_GRADE_TEXT, type: MAX_TYPE_TEXT, craft: MAX_TYPE_TEXT, progress: MAX_PROGRESS_TEXT, source: MAX_SOURCE_TEXT, note: MAX_NOTE_TEXT, materials: MAX_MATERIALS_TEXT, category: MAX_TYPE_TEXT };
            if (!shape(value, ['op', 'id'], [...Object.keys(caps), 'count', 'equipped']) || !string(value.id, 1024, true) || Object.keys(value).length <= 2) return false;
            return Object.entries(value).every(([field, item]) => {
                if (field === 'op' || field === 'id') return true;
                if (field === 'count') return integer(item, 1, MAX_COUNT);
                if (field === 'equipped') return typeof item === 'boolean';
                return string(item, caps[field], field === 'name');
            });
        };
        try {
            if (!object(raw) || JSON.stringify(raw).length > 1048576 || raw.version !== 1 || !ids(raw.opIds) || !object(raw.seq)) return null;
            if (Object.keys(raw.seq).length !== Object.keys(seq).length || !Object.keys(seq).every(key => Number.isSafeInteger(raw.seq[key]) && raw.seq[key] >= 0)) return null;
            const floor = raw.lastFloor;
            if (floor?.blocked !== undefined && floor.blocked !== 'equipment_transfer') return null;
            if (floor !== null && (!object(floor) || !Number.isSafeInteger(floor.floor) || floor.floor < 0 || !Array.isArray(floor.undo) || floor.undo.length > 32 || !floor.undo.every(undo) || !ids(floor.opIds, 32))) return null;
            return structuredClone(raw);
        } catch { return null; }
    }

    function status() {
        return {
            day: dayNow(),
            realm: { ...state.realm },
            profile: { ...state.profile },
            gold: state.gold,
            titles: state.titles.length,
            techniques: state.techniques.length,
            skills: state.skills.length,
            equipment: state.equipment.length,
            treasures: state.treasures.length,
            items: state.items.reduce((total, item) => total + item.count, 0),
            equipped: state.items.filter(item => item.equipped).length,
            recipes: state.recipes.length,
            crafting: state.crafts.filter(job => job.status === 'open').length,
            goals: state.goals.filter(goal => !goal.done).length,
        };
    }

    function restore(raw) {
        state = normalizeState(raw, now);
        for (const [prefix, list] of [['t', state.techniques], ['s', state.skills], ['b', state.items], ['e', state.equipment], ['z', state.treasures], ['r', state.recipes], ['c', state.crafts], ['g', state.goals]]) {
            seq[prefix] = Math.max(0, ...list.map(item => Number(String(item.id).replace(/\D/g, '')) || 0));
        }
        // 旧档迁移进装备栏的条目沿用 b# 编号：b 号水位要把它们也算进去，行囊补发才不会重号。
        seq.b = Math.max(seq.b, ...state.equipment.map(item => String(item.id).startsWith('b') ? Number(String(item.id).replace(/\D/g, '')) || 0 : 0));
        let replay = readReplay(raw?._runtime);
        const migratedIds = new Set((Array.isArray(raw?.items) ? raw.items : []).filter(item => item?.equipped === true).map(item => text(item.id)));
        if (replay?.lastFloor?.undo.some(undo => {
            if (undo.op === '_restoreEntries' && undo.key === 'items') return [...undo.added, ...undo.entries.map(item => item.entry.id)].some(id => migratedIds.has(id));
            return ['updateItem', '_restoreItem'].includes(undo.op) && migratedIds.has(undo.id ?? undo.entry?.id);
        })) replay = null;
        if (replay) for (const prefix of Object.keys(seq)) seq[prefix] = Math.max(seq[prefix], replay.seq[prefix]);
        opIdMemory = replay?.opIds ?? [];
        lastFloor = replay?.lastFloor ?? null;
        return { status: 'restored', replay: replay ? 'restored' : raw?._runtime === undefined ? 'unavailable' : 'invalid', ...status() };
    }

    function reset() {
        state = initialState(now);
        for (const key of Object.keys(seq)) seq[key] = 0;
        opIdMemory = [];
        lastFloor = null;
        return { status: 'reset', ...status() };
    }

    /** 不改状态、只往流水里记一笔（模型判断无变化、解析失败这类"决定结果"）。 */
    function note(message, { source = 'decide' } = {}) {
        state.log.push({ at: now(), source, summaries: [String(message).slice(0, MAX_NOTE_TEXT)], rejected: 0 });
        state.log = state.log.slice(-maxLog);
        return { status: 'noted' };
    }

    /** 最近几条流水（新→旧），面板"指令流水"直接用。 */
    function journal() {
        return structuredClone(state.log.slice(-12).reverse());
    }

    return Object.freeze({ apply, baselineForFloor, transferEquipment, snapshot, status, restore, reset, note, journal, craftLine, config: Object.freeze({ maxTechniques, maxSkills, maxEquipment, maxTreasures, maxItems, maxRecipes, maxCrafts, maxGoals, maxTitles, maxLog, maxOps }) });
}

export { PROFILE_FIELDS, PRIORITIES };
