/**
 * 纳戒运行时：保存一份"主角此刻长什么样、身上有什么"的状态并在校验后修改它。
 *
 * 状态内容：身份档案（姓名/性别/年龄/种族/出身/所属/斗气属性/天赋/外貌）、境界（境界+段位）、
 * 金币、称号、功法、斗技、行囊（含装备中标记）、制作台（配方 + 进行中/已完成的炼制）、
 * 目标（主线/支线、约定）和一份操作流水。
 *
 * 所有权边界（防双写）：纳戒只记主角自身——境界、功法、斗技、物品、炼制、目标、金币。
 * 世界时钟/名声/通缉在世界台账，NPC 档案与好感在人物簿，纳戒一律不碰。
 *
 * 所有修改都走 apply()：单条操作要么通过校验生效，要么带着原因被拒绝，
 * 绝不抛异常打断调用方。面板手动操作与模型指令走同一条路，规则完全一致。
 */

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
const DEFAULT_MAX_ITEMS = 60;
const DEFAULT_MAX_RECIPES = 30;
const DEFAULT_MAX_CRAFTS = 30;
const DEFAULT_MAX_GOALS = 20;
const DEFAULT_MAX_TITLES = 6;
const DEFAULT_MAX_LOG = 40;
const DEFAULT_MAX_OPS = 12;
const OPID_MEMORY = 200;

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
        items: cleanList(source.items, 'b'),
        recipes: cleanList(source.recipes, 'r'),
        crafts: cleanList(source.crafts, 'c'),
        goals: cleanList(source.goals, 'g'),
        log: (Array.isArray(source.log) ? source.log : []).slice(-DEFAULT_MAX_LOG),
        updatedAt: text(source.updatedAt) || now(),
    };
}

export function createSelfRuntime({
    maxTechniques = DEFAULT_MAX_TECHNIQUES,
    maxSkills = DEFAULT_MAX_SKILLS,
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
    maxItems = clampInt(maxItems, 10, 500, DEFAULT_MAX_ITEMS);
    maxRecipes = clampInt(maxRecipes, 5, 200, DEFAULT_MAX_RECIPES);
    maxCrafts = clampInt(maxCrafts, 5, 200, DEFAULT_MAX_CRAFTS);
    maxGoals = clampInt(maxGoals, 5, 100, DEFAULT_MAX_GOALS);
    maxTitles = clampInt(maxTitles, 2, 20, DEFAULT_MAX_TITLES);
    maxLog = clampInt(maxLog, 5, 200, DEFAULT_MAX_LOG);
    maxOps = clampInt(maxOps, 1, 32, DEFAULT_MAX_OPS);
    let state = initialState(now);
    const seq = { t: 0, s: 0, b: 0, r: 0, c: 0, g: 0 };
    let opIdMemory = [];
    let lastFloor = null; // 最近一次由模型落账的楼层：{ floor, undo }，同楼重 roll 时用来回滚

    // 每种操作归属的清单；id 前缀 t/s/b/r/c/g 各自独立编号。
    const LIST_OF_KIND = Object.freeze({
        addTechnique: 'techniques', updateTechnique: 'techniques', removeTechnique: 'techniques',
        addSkill: 'skills', updateSkill: 'skills', removeSkill: 'skills',
        addItem: 'items', updateItem: 'items', removeItem: 'items',
        addRecipe: 'recipes', removeRecipe: 'recipes',
        startCraft: 'crafts', finishCraft: 'crafts',
        addGoal: 'goals', finishGoal: 'goals', removeGoal: 'goals',
    });
    const ID_PREFIX_OF_KIND = Object.freeze({ addTechnique: 't', addSkill: 's', addItem: 'b', addRecipe: 'r', startCraft: 'c', addGoal: 'g' });
    const ENTRY_LABELS = Object.freeze({ techniques: '功法', skills: '斗技', items: '行囊', recipes: '配方', crafts: '炼制', goals: '目标' });

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
        const cap = { techniques: maxTechniques, skills: maxSkills, items: maxItems, recipes: maxRecipes, crafts: maxCrafts, goals: maxGoals }[key];
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
            return { ok: true, summary: `境界：${before.realm || '（空）'}${before.stage || ''} → ${rawRealm}${stage}`, undo: { op: 'setRealm', realm: before.realm, stage: before.stage } };
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
            return { ok: true, summary: `称号 -${body}`, undo: { op: 'addTitle', text: body } };
        }
        // —— 清单新增：功法/斗技/行囊/配方/目标 ——
        if (kind === 'addTechnique' || kind === 'addSkill' || kind === 'addItem' || kind === 'addRecipe' || kind === 'addGoal') {
            if (kind === 'addGoal') {
                const body = text(op.text);
                if (!body) return { ok: false, reason: 'text_missing' };
                if (body.length > MAX_GOAL_TEXT) return { ok: false, reason: 'text_too_long' };
                const entry = cleanEntry({ ...op, name: body }, 'g', seq.g + 1);
                // 撤销恢复时带原编号；新登记才发新号。恢复原编号时序号计数器同步前进，避免重复发号。
                if (!text(op.id)) entry.id = nextId(kind);
                else seq.g = Math.max(seq.g, Number(String(entry.id).replace(/\D/g, '')) || 0);
                state.goals.push(entry);
                prune('goals');
                return { ok: true, id: entry.id, summary: `目标 +${entry.id}（${entry.priority}）：${entry.text}${entry.due ? `（期限：${entry.due}）` : ''}`, undo: { op: 'removeGoal', id: entry.id } };
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
            if (kind === 'addItem') pieces.push(`×${entry.count}`);
            if (entry.note) pieces.push(`（${entry.note}）`);
            return { ok: true, id: entry.id, summary: `${ENTRY_LABELS[key]} +${entry.id}：${pieces.join('·')}`, undo: { op: { addTechnique: 'removeTechnique', addSkill: 'removeSkill', addItem: 'removeItem', addRecipe: 'removeRecipe' }[kind], id: entry.id } };
        }
        // —— 清单修改 ——
        if (kind === 'updateTechnique' || kind === 'updateSkill' || kind === 'updateItem') {
            const entry = findEntry(kind, text(op.id));
            if (!entry) return { ok: false, reason: 'id_not_found' };
            const before = {};
            const name = op.name === undefined ? undefined : text(op.name);
            if (name !== undefined && name) {
                if (name.length > MAX_NAME_TEXT) return { ok: false, reason: 'name_too_long' };
                before.name = entry.name;
                entry.name = name;
            }
            for (const field of ['grade', 'type', 'craft', 'progress', 'source', 'note', 'materials', 'category']) {
                if (op[field] === undefined) continue;
                const cap = field === 'note' ? MAX_NOTE_TEXT : field === 'materials' ? MAX_MATERIALS_TEXT : field === 'source' ? MAX_SOURCE_TEXT : field === 'grade' ? MAX_GRADE_TEXT : MAX_TYPE_TEXT;
                before[field] = entry[field];
                entry[field] = text(op[field]).slice(0, cap);
            }
            if (op.equipped !== undefined) {
                before.equipped = entry.equipped;
                entry.equipped = op.equipped === true;
            }
            if (op.count !== undefined) {
                const count = intIn(op.count, 0, MAX_COUNT);
                if (count === null) return { ok: false, reason: 'bad_count' };
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
        if (kind === 'removeTechnique' || kind === 'removeSkill' || kind === 'removeItem' || kind === 'removeRecipe' || kind === 'removeGoal') {
            const entry = findEntry(kind, text(op.id));
            if (!entry) return { ok: false, reason: 'id_not_found' };
            const key = listKeyOf(kind);
            // removeItem 带数量是"用掉一部分"：数量扣到 0 才真正移除。
            if (kind === 'removeItem' && op.count !== undefined && entry.count > 1) {
                const take = intIn(op.count, 1, entry.count);
                if (take === null) return { ok: false, reason: 'bad_count' };
                const before = entry.count;
                entry.count -= take;
                return { ok: true, id: entry.id, summary: `行囊 ${entry.name}×${before} → ${entry.count}`, undo: { op: 'updateItem', id: entry.id, count: before } };
            }
            state[key] = state[key].filter(item => item.id !== entry.id);
            const addOpOf = { removeTechnique: 'addTechnique', removeSkill: 'addSkill', removeItem: 'addItem', removeRecipe: 'addRecipe', removeGoal: 'addGoal' };
            const restoreOp = kind === 'removeGoal'
                ? { op: 'addGoal', id: entry.id, text: entry.text, priority: entry.priority, due: entry.due, source: entry.source, note: entry.note }
                : { op: addOpOf[kind], ...structuredClone(entry) };
            return { ok: true, id: entry.id, summary: `移除 ${entry.id}：${kind === 'removeGoal' ? entry.text : entry.name}`, undo: restoreOp };
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
            return { ok: true, id: goal.id, summary: `目标达成 ${goal.id}：${goal.text}`, undo: { op: 'updateGoal', id: goal.id, done: before } };
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
        return { ok: false, reason: 'unknown_op' };
    }

    function apply(operations, { source = 'llm', floor = null, day = null } = {}) {
        const floorKey = Number.isInteger(floor) && floor >= 0 ? floor : null;
        const fromModel = source === 'llm' || source === 'decide';
        if (Number.isInteger(day) && day >= 1) state.day = Math.min(99999, day);
        // 同一楼重新生成（重 roll/换 swipe）：先把上一版指令原样撤销，再执行新指令，避免重复记账。
        if (fromModel && floorKey !== null && lastFloor && lastFloor.floor === floorKey) {
            for (const undo of [...lastFloor.undo].reverse()) runOne(undo);
            state.log.push({ at: now(), source: 'revert', summaries: [`第 ${floorKey + 1} 楼重新生成：已撤销上一版纳戒指令`], rejected: 0 });
            state.log = state.log.slice(-maxLog);
        }
        const list = Array.isArray(operations) ? operations.slice(0, maxOps) : [];
        const applied = [];
        const rejected = [];
        const undoSteps = [];
        const duplicate = [];
        for (const op of list) {
            const opId = text(op?.opId);
            if (opId && opIdMemory.includes(opId)) {
                duplicate.push(opId);
                continue;
            }
            const result = runOne(op);
            if (result.ok) {
                rememberOpId(opId);
                applied.push(result);
                if (result.undo) undoSteps.push(result.undo);
            } else {
                rejected.push({ op: text(op?.op), reason: result.reason });
            }
        }
        if (fromModel && floorKey !== null) lastFloor = { floor: floorKey, undo: undoSteps };
        if (applied.length) {
            state.updatedAt = now();
            state.log.push({ at: now(), source, summaries: applied.map(item => item.summary), rejected: rejected.length });
            state.log = state.log.slice(-maxLog);
        }
        return { status: rejected.length && !applied.length ? 'rejected' : applied.length ? 'applied' : 'noop', applied, rejected, duplicate };
    }

    function snapshot() {
        return structuredClone(state);
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
            items: state.items.reduce((total, item) => total + item.count, 0),
            equipped: state.items.filter(item => item.equipped).length,
            recipes: state.recipes.length,
            crafting: state.crafts.filter(job => job.status === 'open').length,
            goals: state.goals.filter(goal => !goal.done).length,
        };
    }

    function restore(raw) {
        state = normalizeState(raw, now);
        for (const [prefix, list] of [['t', state.techniques], ['s', state.skills], ['b', state.items], ['r', state.recipes], ['c', state.crafts], ['g', state.goals]]) {
            seq[prefix] = Math.max(0, ...list.map(item => Number(String(item.id).replace(/\D/g, '')) || 0));
        }
        opIdMemory = [];
        lastFloor = null;
        return { status: 'restored', ...status() };
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

    return Object.freeze({ apply, snapshot, status, restore, reset, note, journal, craftLine, config: Object.freeze({ maxTechniques, maxSkills, maxItems, maxRecipes, maxCrafts, maxGoals, maxTitles, maxLog, maxOps }) });
}

export { PROFILE_FIELDS, PRIORITIES };
