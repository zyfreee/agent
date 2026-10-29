/**
 * 记忆运行时：保存"主角记得什么"的总账并在校验后修改它。
 *
 * 两层记忆（按"分量"切，不是按寿命切——记忆是资产，永久保留、按需召回，绝不自动过期）：
 * - small 小记忆：轻量记录的近事杂事，注入时靠"关联"命中场景优先找回；
 * - big 大记忆：值得一直记住的事（恩怨/秘密/伏笔/大事），常驻注入；
 *   tag 是可选标签（恩怨/情报/伏笔/大事记），只便于查看，不影响记账。
 * - promote：小记忆后来发现分量够重，转入大记忆。
 * 了结（resolve）与删除（forget）只由书记官或玩家主动做，脚本从不自动动账。
 *
 * 所有权边界（防双写）：目标约定归纳戒、任务归世界台账、世界事件归世界、
 * NPC 档案与好感归人物簿、原著设定归事实库——记忆一律不碰。
 *
 * 所有修改都走 apply()：单条操作要么通过校验生效，要么带着原因被拒绝，
 * 绝不抛异常打断调用方。面板手动操作与模型指令走同一条路，规则完全一致。
 */

const TIERS = Object.freeze(['small', 'big']);
export const TIER_LABELS = Object.freeze({ small: '小记忆', big: '大记忆' });
export const TAG_LABELS = Object.freeze({ grudge: '恩怨', intel: '情报', thread: '伏笔', milestone: '大事记' });
const WEIGHTS = Object.freeze(['major', 'minor']);

const MAX_TEXT = 300;
const MAX_BASIS = 80;
const MAX_NOTE = 120;
const MAX_QUOTE = 60;
const MAX_RELATED = 4;
const MAX_ALIASES = 4;
const MAX_RELATED_TEXT = 30;
const MAX_DAY = 99999;
const DEFAULT_MAX_ENTRIES = 60;
const DEFAULT_MAX_LOG = 40;
const DEFAULT_MAX_OPS = 8;
const Opid_MEMORY = 200;

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function intIn(value, min, max) {
    const num = Number(value);
    return Number.isInteger(num) && num >= min && num <= max ? num : null;
}

function clampInt(value, min, max, fallback) {
    const num = Number(value);
    return Number.isInteger(num) && num >= min && num <= max ? num : fallback;
}

function initialState(now) {
    return {
        schemaVersion: 2,
        entries: [],
        log: [],
        updatedAt: now(),
    };
}

/** 逐条清洗；text 缺失整条丢弃，坏字段截断而不是作废。 */
function normalizeOneEntry(raw, seq) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const body = text(raw.text);
    if (!body) return null;
    const related = (Array.isArray(raw.related) ? raw.related : [])
        .map(item => text(item).slice(0, MAX_RELATED_TEXT))
        .filter(Boolean)
        .slice(0, MAX_RELATED);
    const tier = TIERS.includes(raw.tier) ? raw.tier : 'big';
    return {
        id: text(raw.id) || `m${seq}`,
        tier,
        text: body.slice(0, MAX_TEXT),
        quote: text(raw.quote).slice(0, MAX_QUOTE),
        basis: text(raw.basis).slice(0, MAX_BASIS),
        related,
        aliases: (Array.isArray(raw.aliases) ? raw.aliases : [])
            .map(item => text(item).slice(0, MAX_RELATED_TEXT))
            .filter(Boolean)
            .slice(0, MAX_ALIASES),
        weight: WEIGHTS.includes(raw.weight) ? raw.weight : 'minor',
        tag: TAG_LABELS[raw.tag] ? raw.tag : '',
        day: clampInt(raw.day, 1, MAX_DAY, 1),
        done: raw.done === true,
        resolvedDay: clampInt(raw.resolvedDay, 1, MAX_DAY, null),
        note: text(raw.note).slice(0, MAX_NOTE),
        // 召回统计：纯强度数据（排练效应），不镜像到数据库，随聊天存档走。
        recallCount: Math.min(9999, Math.max(0, intIn(raw.recallCount, 0, 9999) ?? (Number(raw.recallCount) > 9999 ? 9999 : 0))),
        lastRecallDay: clampInt(raw.lastRecallDay, 1, MAX_DAY, null),
    };
}

function normalizeState(raw, now) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const entries = (Array.isArray(source.entries) ? source.entries : [])
        .map((item, index) => normalizeOneEntry(item, index + 1))
        .filter(Boolean)
        .slice(-DEFAULT_MAX_ENTRIES);
    return {
        schemaVersion: 2,
        entries,
        log: (Array.isArray(source.log) ? source.log : []).slice(-DEFAULT_MAX_LOG),
        updatedAt: text(source.updatedAt) || now(),
    };
}

export function createMemoryRuntime({ maxEntries = DEFAULT_MAX_ENTRIES, maxLog = DEFAULT_MAX_LOG, maxOps = DEFAULT_MAX_OPS, now = () => new Date().toISOString() } = {}) {
    maxEntries = clampInt(maxEntries, 10, 200, DEFAULT_MAX_ENTRIES);
    maxLog = clampInt(maxLog, 5, 200, DEFAULT_MAX_LOG);
    maxOps = clampInt(maxOps, 1, 32, DEFAULT_MAX_OPS);
    let state = initialState(now);
    let seq = 0;
    let opIdMemory = [];
    let lastFloor = null;
    // 记忆不自带时钟，记于日/到期扫尾都按调用方传入的世界天数（apply 的 day）。
    let currentDay = 1;

    function stateDay() {
        return currentDay;
    }

    function findEntry(id) {
        return state.entries.find(entry => entry.id === id) ?? null;
    }

    function nextId() {
        seq += 1;
        return `m${seq}`;
    }

    function entriesOf(tier) {
        return state.entries.filter(entry => entry.tier === tier);
    }

    /** 上限清理：已了结的先走，小记忆比大记忆先走，一般比关键先走，最老先走。 */
    function prune() {
        if (state.entries.length <= maxEntries) return;
        const ranked = [...state.entries].sort((a, b) =>
            (b.done === true) - (a.done === true)
            || (a.tier === 'big') - (b.tier === 'big')
            || (b.weight === 'minor') - (a.weight === 'minor')
            || a.day - b.day);
        const doomed = new Set(ranked.slice(0, state.entries.length - maxEntries).map(entry => entry.id));
        state.entries = state.entries.filter(entry => !doomed.has(entry.id));
    }

    function rememberOpId(opId) {
        if (!opId) return;
        opIdMemory.push(opId);
        if (opIdMemory.length > Opid_MEMORY) opIdMemory = opIdMemory.slice(-Opid_MEMORY);
    }

    /** 单条操作校验 + 执行；返回结果对象，绝不抛出。undo 供同楼重 roll 撤销。 */
    function runOne(op) {
        if (!op || typeof op !== 'object' || Array.isArray(op)) return { ok: false, reason: 'bad_op_shape' };
        const kind = text(op.op);
        if (kind === 'remember' || kind === 'memorize') {
            const tier = kind === 'remember' ? 'small' : 'big';
            const body = text(op.text);
            if (!body) return { ok: false, reason: 'text_missing' };
            if (body.length > MAX_TEXT) return { ok: false, reason: 'text_too_long' };
            const related = (Array.isArray(op.related) ? op.related : [])
                .map(item => text(item).slice(0, MAX_RELATED_TEXT))
                .filter(Boolean)
                .slice(0, MAX_RELATED);
            // related 是日后"按需召回"的钥匙：没有关联的记忆永远召不回来。
            if (!related.length) return { ok: false, reason: 'related_missing' };
            if (Array.isArray(op.related) && op.related.length > MAX_RELATED) return { ok: false, reason: 'related_too_many' };
            const day = op.day === undefined ? stateDay() : intIn(op.day, 1, MAX_DAY);
            if (day === null) return { ok: false, reason: 'bad_day' };
            const tag = TAG_LABELS[op.tag] ? op.tag : '';
            const quote = text(op.quote).slice(0, MAX_QUOTE);
            const aliases = (Array.isArray(op.aliases) ? op.aliases : [])
                .map(item => text(item).slice(0, MAX_RELATED_TEXT))
                .filter(Boolean)
                .slice(0, MAX_ALIASES);
            // 同层同文的未了结条目不重记，防止模型一轮里反复登记同一件事。
            if (state.entries.some(entry => entry.tier === tier && entry.done !== true && entry.text === body)) {
                return { ok: false, reason: 'duplicate_text' };
            }
            const entry = {
                id: nextId(),
                tier,
                text: body,
                quote,
                basis: text(op.basis).slice(0, MAX_BASIS),
                related,
                aliases,
                weight: WEIGHTS.includes(op.weight) ? op.weight : 'minor',
                tag,
                day,
                done: false,
                resolvedDay: null,
                note: '',
                recallCount: 0,
                lastRecallDay: null,
            };
            state.entries.push(entry);
            prune();
            const relatedNote = `（关联：${related.join('、')}）`;
            return { ok: true, id: entry.id, summary: `${TIER_LABELS[tier]} +${entry.id}（第 ${day} 天）：${body}${relatedNote}`, undo: { op: '_removeMemory', id: entry.id } };
        }
        if (kind === 'promote') {
            const entry = findEntry(text(op.id));
            if (!entry) return { ok: false, reason: 'entry_not_found' };
            if (entry.tier === 'big') return { ok: false, reason: 'entry_already_big' };
            const before = { tier: entry.tier, tag: entry.tag };
            entry.tier = 'big';
            entry.tag = TAG_LABELS[op.tag] ? op.tag : entry.tag;
            return { ok: true, id: entry.id, summary: `转大记忆 ${entry.id}：${entry.text}`, undo: { op: '_retier', id: entry.id, ...before } };
        }
        if (kind === 'resolveMemory') {
            const entry = findEntry(text(op.id));
            if (!entry) return { ok: false, reason: 'entry_not_found' };
            if (entry.done) return { ok: false, reason: 'entry_already_done' };
            const before = { done: entry.done, resolvedDay: entry.resolvedDay, note: entry.note };
            entry.done = true;
            entry.resolvedDay = stateDay();
            entry.note = text(op.note).slice(0, MAX_NOTE);
            const notePart = entry.note ? `（${entry.note}）` : '';
            return { ok: true, id: entry.id, summary: `记忆了结 ${entry.id}：${entry.text}${notePart}`, undo: { op: '_restoreDone', id: entry.id, ...before } };
        }
        if (kind === 'reopenMemory') {
            const entry = findEntry(text(op.id));
            if (!entry) return { ok: false, reason: 'entry_not_found' };
            if (!entry.done) return { ok: false, reason: 'entry_not_done' };
            const before = { done: entry.done, resolvedDay: entry.resolvedDay, note: entry.note };
            entry.done = false;
            entry.resolvedDay = null;
            return { ok: true, id: entry.id, summary: `记忆重开 ${entry.id}：${entry.text}`, undo: { op: '_restoreDone', id: entry.id, ...before } };
        }
        if (kind === 'forgetMemory') {
            const id = text(op.id);
            const entry = findEntry(id);
            if (!entry) return { ok: false, reason: 'entry_not_found' };
            state.entries = state.entries.filter(item => item.id !== id);
            return { ok: true, id, summary: `忘记${TIER_LABELS[entry.tier]} ${id}：${entry.text}`, undo: { op: '_restoreEntry', entry } };
        }
        // 内部撤销操作：只由同楼重 roll 的回滚调用，不写进模型指南。
        if (kind === '_removeMemory') {
            const id = text(op.id);
            const before = state.entries.length;
            state.entries = state.entries.filter(item => item.id !== id);
            return before === state.entries.length ? { ok: false, reason: 'entry_not_found' } : { ok: true, summary: `撤销新增 ${id}` };
        }
        if (kind === '_retier') {
            const entry = findEntry(text(op.id));
            if (!entry) return { ok: false, reason: 'entry_not_found' };
            entry.tier = TIERS.includes(op.tier) ? op.tier : entry.tier;
            entry.tag = TAG_LABELS[op.tag] ? op.tag : entry.tag;
            return { ok: true, summary: `恢复 ${entry.id} 层级` };
        }
        if (kind === '_restoreDone') {
            const entry = findEntry(text(op.id));
            if (!entry) return { ok: false, reason: 'entry_not_found' };
            entry.done = op.done === true;
            entry.resolvedDay = op.resolvedDay === null || op.resolvedDay === undefined ? null : intIn(op.resolvedDay, 1, MAX_DAY);
            entry.note = text(op.note).slice(0, MAX_NOTE);
            return { ok: true, summary: `恢复 ${entry.id} 了结状态` };
        }
        if (kind === '_restoreEntry') {
            const restored = normalizeOneEntry(op.entry, state.entries.length + 1);
            if (!restored) return { ok: false, reason: 'entry_not_found' };
            if (findEntry(restored.id)) restored.id = nextId(); // 删除后同号已被占用，换号避免双份
            state.entries.push(restored);
            prune();
            return { ok: true, summary: `恢复记忆 ${restored.id}` };
        }
        return { ok: false, reason: 'unknown_op' };
    }

    function apply(operations, { source = 'llm', floor = null, day = null } = {}) {
        const floorKey = Number.isInteger(floor) && floor >= 0 ? floor : null;
        const fromModel = source === 'llm' || source === 'decide';
        const dayKey = intIn(day, 1, MAX_DAY);
        if (dayKey !== null) currentDay = dayKey;
        // 同一楼重新生成（重 roll/换 swipe）：先把上一版指令原样撤销，再执行新指令，避免重复记账。
        if (fromModel && floorKey !== null && lastFloor && lastFloor.floor === floorKey) {
            for (const undo of [...lastFloor.undo].reverse()) runOne(undo);
            state.log.push({ at: now(), source: 'revert', summaries: [`第 ${floorKey + 1} 楼重新生成：已撤销上一版记忆指令`], rejected: 0 });
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
                if (result.undo) {
                    if (Array.isArray(result.undo)) undoSteps.push(...result.undo);
                    else undoSteps.push(result.undo);
                }
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

    /** 召回记账：被想起过的记忆强度回涨（排练效应）；纯统计，不写流水、不镜像数据库。 */
    function markRecalled(ids, { day = null } = {}) {
        const dayKey = intIn(day, 1, MAX_DAY) ?? currentDay;
        let touched = 0;
        for (const id of Array.isArray(ids) ? ids : []) {
            const entry = findEntry(text(id));
            if (!entry) continue;
            entry.recallCount = clampInt((entry.recallCount ?? 0) + 1, 0, 9999, 0);
            entry.lastRecallDay = dayKey;
            touched += 1;
        }
        if (touched) state.updatedAt = now();
        return { status: 'marked', touched };
    }

    function snapshot() {
        return structuredClone(state);
    }

    function status() {
        const byTier = {};
        for (const tier of TIERS) {
            const list = entriesOf(tier);
            byTier[tier] = { open: list.filter(entry => !entry.done).length, total: list.length };
        }
        return { byTier, open: state.entries.filter(entry => !entry.done).length, total: state.entries.length };
    }

    function restore(raw) {
        state = normalizeState(raw, now);
        seq = Math.max(0, ...state.entries.map(entry => Number(String(entry.id).replace(/\D/g, '')) || 0));
        opIdMemory = [];
        lastFloor = null;
        return { status: 'restored', ...status() };
    }

    function reset() {
        state = initialState(now);
        seq = 0;
        opIdMemory = [];
        lastFloor = null;
        return { status: 'reset', ...status() };
    }

    /** 不改记忆、只往流水里记一笔（模型判断无变化、解析失败这类"决定结果"）。 */
    function note(message, { source = 'decide' } = {}) {
        state.log.push({ at: now(), source, summaries: [String(message).slice(0, MAX_TEXT)], rejected: 0 });
        state.log = state.log.slice(-maxLog);
        return { status: 'noted' };
    }

    return Object.freeze({ apply, snapshot, status, restore, reset, note, markRecalled, tiers: TIERS, tierLabels: TIER_LABELS, tagLabels: TAG_LABELS, config: Object.freeze({ maxEntries, maxLog, maxOps }) });
}
