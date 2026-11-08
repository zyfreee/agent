/**
 * 记忆运行时：保存"主角记得什么"的总账并在校验后修改它。
 *
 * 两层记忆（按"分量"切，不是按寿命切——记忆是资产，永久保留、按需召回，绝不自动过期）：
 * - small 小记忆：轻量记录的近事杂事，注入时靠"关联"命中场景优先找回；
 * - big 大记忆：值得一直记住的事（恩怨/秘密/伏笔/大事），常驻注入；
 *   tag 是可选标签（恩怨/情报/伏笔/大事记），只便于查看，不影响记账。
 * - promote：小记忆后来发现分量够重，转入大记忆。
 * 删除（forget）只由书记官或玩家主动做，脚本从不自动动账；账本无上限，脚本绝不自动丢账。
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

// 字段不再设字数/条数上限（正文、标题、依据、细节、引文、召回钥匙一律原样入库）：
// 详略由提示词引导，注入侧各有字数预算兜底；只保留 day 的合理性边界。
const MAX_DAY = 99999;
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
        // 只数“手改”的序号：面板/手动 apply（source=manual）才递增，模型落账（llm/decide）不算。
        // 记忆召回缓存键带它——重roll时模型落账不改它（照旧复用），手改立刻失效重召回。
        manualVersion: 0,
        entries: [],
        log: [],
        retiredIds: [],
        retiredSeqRanges: [],
        externalRetiredIds: [],
        legacy_gap: false,
        updatedAt: now(),
    };
}

/** 逐条清洗；text 缺失整条丢弃，其余字段原样保留（不再截断，钥匙不限量）。 */
function normalizeOneEntry(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const body = text(raw.text);
    if (!body) return null;
    const related = (Array.isArray(raw.related) ? raw.related : [])
        .map(item => text(item))
        .filter(Boolean);
    const tier = TIERS.includes(raw.tier) ? raw.tier : 'big';
    return {
        id: text(raw.id),
        tier,
        text: body,
        title: text(raw.title),
        quote: text(raw.quote),
        basis: text(raw.basis),
        related,
        aliases: (Array.isArray(raw.aliases) ? raw.aliases : [])
            .map(item => text(item))
            .filter(Boolean),
        weight: WEIGHTS.includes(raw.weight) ? raw.weight : 'minor',
        tag: TAG_LABELS[raw.tag] ? raw.tag : '',
        day: clampInt(raw.day, 1, MAX_DAY, 1),
        note: text(raw.note),
        // 记录来源楼层（聊天数组绝对位）：删楼时"对应的记忆跟着删、后续楼层前移"全靠它。
        floor: Number.isInteger(raw.floor) && raw.floor >= 0 ? raw.floor : null,
    };
}

const MAX_RETIRED_IDS = 200;

// Internal counter only: persisted IDs stay exact decimal strings, including legacy large IDs.
function identitySequence(id) {
    return /^m\d+$/.test(id) ? BigInt(id.slice(1)) : 0n;
}

function identityHighWater(ids) {
    let high = 0n;
    for (const id of ids) {
        const value = identitySequence(id);
        if (value > high) high = value;
    }
    return high;
}

function canonicalSequence(id) {
    return typeof id === 'string' && /^m[1-9]\d*$/.test(id) ? id.slice(1) : null;
}

function tombstoneMetadata(source, ids) {
    if (source.retiredSeqRanges !== undefined && !Array.isArray(source.retiredSeqRanges)) throw new Error('bad_retirement_metadata');
    if (source.externalRetiredIds !== undefined && !Array.isArray(source.externalRetiredIds)) throw new Error('bad_retirement_metadata');
    const ranges = [];
    for (const pair of source.retiredSeqRanges ?? []) {
        if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(n => typeof n === 'string' && /^[1-9]\d*$/.test(n)) || BigInt(pair[0]) > BigInt(pair[1])) throw new Error('bad_retirement_metadata');
        ranges.push(pair.map(n => BigInt(n)));
    }
    const external = new Set(source.externalRetiredIds ?? []);
    if ([...external].some(id => typeof id !== 'string' || !id.trim() || id !== id.trim() || canonicalSequence(id))) throw new Error('bad_retirement_metadata');
    for (const id of ids) {
        const seq = canonicalSequence(id);
        if (seq) ranges.push([BigInt(seq), BigInt(seq)]);
        else external.add(id);
    }
    ranges.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
    const merged = [];
    for (const range of ranges) {
        const last = merged.at(-1);
        if (last && range[0] <= last[1] + 1n) { if (range[1] > last[1]) last[1] = range[1]; }
        else merged.push([...range]);
    }
    if (merged.length > MAX_RETIRED_IDS || external.size > MAX_RETIRED_IDS) throw new Error('capacity_exceeded');
    return { retiredSeqRanges: merged.map(pair => pair.map(String)), externalRetiredIds: [...external] };
}

function normalizeState(raw, now) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    // 账本无上限：条目全量保留，不做封顶清理。
    const entries = (Array.isArray(source.entries) ? source.entries : [])
        .map(item => normalizeOneEntry(item))
        .filter(Boolean);
    const retired = [];
    for (const id of Array.isArray(source.retiredIds) ? source.retiredIds : []) {
        const key = text(id);
        if (key && !retired.includes(key)) retired.push(key);
    }
    const metadata = tombstoneMetadata(source, retired);
    let high = identityHighWater([...entries.map(entry => entry.id), ...retired, ...metadata.retiredSeqRanges.map(pair => `m${pair[1]}`)]);
    const reserved = new Set([...entries.map(entry => entry.id), ...retired]);
    const seen = new Set();
    for (const entry of entries) {
        if (!entry.id || seen.has(entry.id)) {
            do { high += 1n; entry.id = `m${high}`; } while (reserved.has(entry.id));
            reserved.add(entry.id);
        }
        seen.add(entry.id);
    }
    return {
        schemaVersion: 2,
        manualVersion: intIn(source.manualVersion, 0, 9999999) ?? 0,
        entries,
        log: (Array.isArray(source.log) ? source.log : []).slice(-DEFAULT_MAX_LOG),
        retiredIds: retired.slice(-MAX_RETIRED_IDS),
        ...metadata,
        legacy_gap: source.legacy_gap === true || !Array.isArray(source.retiredSeqRanges) || !Array.isArray(source.externalRetiredIds),
        updatedAt: text(source.updatedAt) || now(),
    };
}

export function createMemoryRuntime({ maxLog = DEFAULT_MAX_LOG, maxOps = DEFAULT_MAX_OPS, now = () => new Date().toISOString() } = {}) {
    maxLog = clampInt(maxLog, 5, 200, DEFAULT_MAX_LOG);
    maxOps = clampInt(maxOps, 1, 32, DEFAULT_MAX_OPS);
    let state = initialState(now);
    let seq = 0n;
    let opIdMemory = [];
    let lastFloor = null;
    // 记忆不自带时钟，记于日按调用方传入的世界天数（apply 的 day）。
    let currentDay = 1;

    function stateDay() {
        return currentDay;
    }

    function findEntry(id) {
        return state.entries.find(entry => entry.id === id) ?? null;
    }

    function isRetired(id) {
        if (typeof id !== 'string') return false;
        const canonical = canonicalSequence(id);
        if (!canonical) return state.externalRetiredIds.includes(id);
        const value = BigInt(canonical);
        return state.retiredSeqRanges.some(([a, b]) => value >= BigInt(a) && value <= BigInt(b));
    }

    function nextId() {
        let id;
        do { seq += 1n; id = `m${seq}`; } while (findEntry(id) || isRetired(id));
        return id;
    }

    function entriesOf(tier) {
        return state.entries.filter(entry => entry.tier === tier);
    }

    function rememberOpId(opId) {
        if (!opId) return;
        opIdMemory.push(opId);
        if (opIdMemory.length > Opid_MEMORY) opIdMemory = opIdMemory.slice(-Opid_MEMORY);
    }

    /** 单条操作校验 + 执行；返回结果对象，绝不抛出。undo 供同楼重 roll 撤销。 */
    function runOne(op, floorKey = null) {
        if (!op || typeof op !== 'object' || Array.isArray(op)) return { ok: false, reason: 'bad_op_shape' };
        const kind = text(op.op);
        if (kind === 'remember' || kind === 'memorize') {
            const tier = kind === 'remember' ? 'small' : 'big';
            const body = text(op.text);
            if (!body) return { ok: false, reason: 'text_missing' };
            // title 是列表主页面的短标题，必填：没给标题的条目不收；字数不限。
            const title = text(op.title);
            const related = (Array.isArray(op.related) ? op.related : [])
                .map(item => text(item))
                .filter(Boolean);
            // related 是日后"按需召回"的钥匙：没有关联的记忆永远召不回来；数量不限。
            if (!related.length) return { ok: false, reason: 'related_missing' };
            if (!title) return { ok: false, reason: 'title_missing' };
            const day = op.day === undefined ? stateDay() : intIn(op.day, 1, MAX_DAY);
            if (day === null) return { ok: false, reason: 'bad_day' };
            const tag = TAG_LABELS[op.tag] ? op.tag : '';
            const quote = text(op.quote);
            const aliases = (Array.isArray(op.aliases) ? op.aliases : [])
                .map(item => text(item))
                .filter(Boolean);
            // 同层同文的条目不重记，防止模型一轮里反复登记同一件事。
            if (state.entries.some(entry => entry.tier === tier && entry.text === body)) {
                return { ok: false, reason: 'duplicate_text' };
            }
            const entry = {
                id: nextId(),
                tier,
                text: body,
                title,
                quote,
                basis: text(op.basis),
                related,
                aliases,
                weight: WEIGHTS.includes(op.weight) ? op.weight : 'minor',
                tag,
                day,
                note: text(op.note),
                floor: Number.isInteger(floorKey) && floorKey >= 0 ? floorKey : null,
            };
            state.entries.push(entry);
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
        if (kind === 'setWeight') {
            const entry = findEntry(text(op.id));
            if (!entry) return { ok: false, reason: 'entry_not_found' };
            const weight = WEIGHTS.includes(op.weight) ? op.weight : null;
            if (!weight) return { ok: false, reason: 'bad_weight' };
            if (entry.weight === weight) return { ok: false, reason: 'weight_unchanged' };
            const before = { weight: entry.weight };
            entry.weight = weight;
            return { ok: true, id: entry.id, summary: `${entry.id} 分量改为${weight === 'major' ? '关键' : '一般'}`, undo: { op: '_restoreWeight', id: entry.id, ...before } };
        }
        if (kind === 'forgetMemory') {
            const id = text(op.id);
            const entry = findEntry(id);
            if (!entry) return { ok: false, reason: 'entry_not_found' };
            const retired = retire([id]);
            if (!retired.ok) return retired;
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
        if (kind === '_restoreWeight') {
            const entry = findEntry(text(op.id));
            if (!entry) return { ok: false, reason: 'entry_not_found' };
            entry.weight = WEIGHTS.includes(op.weight) ? op.weight : entry.weight;
            return { ok: true, summary: `恢复 ${entry.id} 分量` };
        }
        if (kind === '_restoreEntry') {
            const restored = normalizeOneEntry(op.entry);
            if (!restored) return { ok: false, reason: 'entry_not_found' };
            if (!restored.id || findEntry(restored.id)) restored.id = nextId(); // 换号避免双份
            const unretired = unretire(restored.id);
            if (!unretired.ok) return unretired;
            const restoredSequence = identitySequence(restored.id);
            if (restoredSequence > seq) seq = restoredSequence;
            state.entries.push(restored);
            return { ok: true, summary: `恢复记忆 ${restored.id}` };
        }
        return { ok: false, reason: 'unknown_op' };
    }

    /** 退役登记：被删除/被并入的编号记一笔，数据库存储帧重放把这些行复活时，收养守卫认得它们。 */
    function retire(ids) {
        const keys = [...new Set((Array.isArray(ids) ? ids : []).map(text).filter(Boolean))];
        let metadata;
        try { metadata = tombstoneMetadata(state, keys); }
        catch (error) { return { ok: false, reason: String(error?.message ?? error) }; }
        Object.assign(state, metadata);
        state.retiredIds = [...new Set([...state.retiredIds, ...keys])].slice(-MAX_RETIRED_IDS);
        return { ok: true };
    }

    function unretire(id) {
        const canonical = canonicalSequence(id);
        const ranges = [];
        for (const [a, b] of state.retiredSeqRanges) {
            const value = canonical ? BigInt(canonical) : null;
            if (value === null || value < BigInt(a) || value > BigInt(b)) ranges.push([a, b]);
            else {
                if (value > BigInt(a)) ranges.push([a, String(value - 1n)]);
                if (value < BigInt(b)) ranges.push([String(value + 1n), b]);
            }
        }
        if (ranges.length > MAX_RETIRED_IDS) return { ok: false, reason: 'capacity_exceeded' };
        state.retiredSeqRanges = ranges;
        state.externalRetiredIds = state.externalRetiredIds.filter(key => key !== id);
        state.retiredIds = state.retiredIds.filter(key => key !== id);
        return { ok: true };
    }

    function apply(operations, { source = 'llm', floor = null, day = null } = {}) {
        const floorKey = Number.isInteger(floor) && floor >= 0 ? floor : null;
        const fromModel = source === 'llm' || source === 'decide';
        const dayKey = intIn(day, 1, MAX_DAY);
        const beforeDay = currentDay;
        if (dayKey !== null) currentDay = dayKey;
        // 同一楼重新生成（重 roll/换 swipe）：先把上一版指令原样撤销，再执行新指令，避免重复记账。
        if (fromModel && floorKey !== null && lastFloor && lastFloor.floor === floorKey) {
            const beforeRollback = structuredClone(state);
            const beforeSeq = seq;
            for (const undo of [...lastFloor.undo].reverse()) {
                if (!runOne(undo).ok) {
                    state = beforeRollback;
                    seq = beforeSeq;
                    currentDay = beforeDay;
                    return { status: 'rejected', applied: [], rejected: [{ op: 'revert', reason: 'rollback_failed' }], duplicate: [] };
                }
            }
            opIdMemory = opIdMemory.filter(id => !lastFloor.opIds.includes(id));
            state.log.push({ at: now(), source: 'revert', summaries: [`第 ${floorKey + 1} 楼重新生成：已撤销上一版记忆指令`], rejected: 0 });
            state.log = state.log.slice(-maxLog);
        }
        const list = Array.isArray(operations) ? operations.slice(0, maxOps) : [];
        const applied = [];
        const rejected = [];
        const undoSteps = [];
        const revertedOpIds = [];
        const duplicate = [];
        for (let op of list) {
            const opId = text(op?.opId);
            if (opId && opIdMemory.includes(opId)) {
                duplicate.push(opId);
                continue;
            }
            // 大记忆收紧：书记官只记小记忆。模型通道里 memorize 一律按小记忆落账（内容与分量
            // 保留，不丢账），promote 停用——大记忆由"小记忆攒够自动总结"生成，不再由决定直转。
            // 面板手动操作不受限（手动登记/转大是玩家自己的决定）。
            if (fromModel && op && typeof op === 'object' && !Array.isArray(op)) {
                if (op.op === 'memorize') op = { ...op, op: 'remember' };
                else if (op.op === 'promote') {
                    rejected.push({ op: 'promote', reason: 'promote_retired' });
                    continue;
                }
            }
            const result = runOne(op, floorKey);
            if (result.ok) {
                rememberOpId(opId);
                applied.push(result);
                if (result.undo) {
                    if (opId) revertedOpIds.push(opId);
                    if (Array.isArray(result.undo)) undoSteps.push(...result.undo);
                    else undoSteps.push(result.undo);
                }
            } else {
                rejected.push({ op: text(op?.op), reason: result.reason });
            }
        }
        if (fromModel && floorKey !== null) lastFloor = { floor: floorKey, undo: undoSteps, opIds: revertedOpIds };
        if (applied.length) {
            if (source === 'manual') state.manualVersion += 1;
            state.updatedAt = now();
            state.log.push({ at: now(), source, summaries: applied.map(item => item.summary), rejected: rejected.length });
            state.log = state.log.slice(-maxLog);
        }
        return { status: rejected.length && !applied.length ? 'rejected' : applied.length ? 'applied' : 'noop', applied, rejected, duplicate };
    }

    /**
     * 小记忆总结成大记忆（脚本自己的入口，不进模型操作字典）：
     * 把给定的小记忆整批提炼成一条大记忆，原条目退役删除——"转化"，不是复制。
     * 召回钥匙尽量保全：模型选的 related 优先，这批小记忆的其余钥匙落进 aliases。
     * 大记忆只此一条入口（decide 不再直写），fail 一律带原因返回，绝不抛异常。
     */
    function consolidate({ ids = [], big = {}, day = null, source = 'auto' } = {}) {
        const wanted = (Array.isArray(ids) ? ids : []).map(id => text(id)).filter(Boolean);
        const consumed = state.entries.filter(entry => entry.tier === 'small' && wanted.includes(entry.id));
        if (!consumed.length) return { ok: false, reason: 'nothing_to_consolidate' };
        const body = text(big?.text);
        if (!body) return { ok: false, reason: 'text_missing' };
        // 大记忆的标题也必填：列表主页只显示标题，没有标题的总结不收。
        const bigTitle = text(big?.title);
        if (!bigTitle) return { ok: false, reason: 'title_missing' };
        // 同文大记忆不重记：同一天重跑总结的保险。
        if (state.entries.some(entry => entry.tier === 'big' && entry.text === body)) return { ok: false, reason: 'duplicate_text' };
        // 钥匙不设上限、超限不再拒并：模型总结挑选的 related 优先排前，
        // 其余钥匙（模型 aliases + 这批小记忆的全部钥匙并集）原样收进 aliases，召回路径一条不丢。
        const chosenRelated = (Array.isArray(big?.related) ? big.related : [])
            .map(item => text(item))
            .filter(Boolean);
        const chosenAliases = (Array.isArray(big?.aliases) ? big.aliases : [])
            .map(item => text(item))
            .filter(Boolean);
        const unionKeys = [];
        for (const entry of consumed) {
            for (const key of [...(entry.related ?? []), ...(entry.aliases ?? [])]) {
                if (key && !unionKeys.includes(key)) unionKeys.push(key);
            }
        }
        const related = [];
        for (const key of chosenRelated) {
            if (!related.includes(key)) related.push(key);
        }
        const aliases = [];
        for (const key of [...chosenAliases, ...unionKeys]) {
            if (related.includes(key) || aliases.includes(key)) continue;
            aliases.push(key);
        }
        // 模型一个钥匙没挑、这批小记忆也没钥匙 → 合出来的大记忆谁也召不回，才拒并。
        if (!related.length && !aliases.length) return { ok: false, reason: 'related_missing' };
        const dayKey = intIn(day, 1, MAX_DAY) ?? stateDay();
        const idList = consumed.map(entry => entry.id);
        const basis = text(big?.basis) || `由 ${idList.join('、')} 总结`;
        const retired = retire(idList);
        if (!retired.ok) return retired;
        const entry = {
            id: nextId(),
            tier: 'big',
            text: body,
            title: bigTitle,
            quote: text(big?.quote),
            basis,
            related,
            aliases,
            weight: WEIGHTS.includes(big?.weight) ? big.weight : 'major',
            tag: TAG_LABELS[big?.tag] ? big.tag : '',
            day: dayKey,
            note: '',
        };
        state.entries = state.entries.filter(item => !idList.includes(item.id));
        state.entries.push(entry);
        if (source === 'manual') state.manualVersion += 1;
        state.updatedAt = now();
        const summary = `小记忆 ×${idList.length}（${idList.join('、')}）总结成大记忆 ${entry.id}：${body}`;
        state.log.push({ at: now(), source: 'consolidate', summaries: [summary], rejected: 0 });
        state.log = state.log.slice(-maxLog);
        return { ok: true, id: entry.id, summary, consumed: idList, entry };
    }

    function snapshot() {
        return structuredClone(state);
    }

    function status() {
        const byTier = {};
        for (const tier of TIERS) {
            byTier[tier] = { total: entriesOf(tier).length };
        }
        return { byTier, total: state.entries.length, legacy_gap: state.legacy_gap };
    }

    function restore(raw) {
        let restored;
        try { restored = normalizeState(raw, now); }
        catch (error) { return { status: 'rejected', reason: String(error?.message ?? error) }; }
        state = restored;
        seq = identityHighWater([...state.entries.map(entry => entry.id), ...state.retiredIds, ...state.retiredSeqRanges.map(pair => `m${pair[1]}`)]);
        opIdMemory = [];
        lastFloor = null;
        return { status: 'restored', ...status() };
    }

    function reset() {
        state = initialState(now);
        seq = 0n;
        opIdMemory = [];
        lastFloor = null;
        return { status: 'reset', ...status() };
    }

    /** 不改记忆、只往流水里记一笔（模型判断无变化、解析失败这类"决定结果"）。流水是状态行，非记忆内容，留个防炸长度。 */
    function note(message, { source = 'decide' } = {}) {
        state.log.push({ at: now(), source, summaries: [String(message).slice(0, 500)], rejected: 0 });
        state.log = state.log.slice(-maxLog);
        return { status: 'noted' };
    }

    /** 删楼层联动：该楼记的记忆跟着删，后面楼层的依据楼层整体前移。
     *  lastFloor 指向被删楼时一并作废——回滚指针没了个体的落点，留着会撤错账。 */
    function dropFloor(removedIndex) {
        const index = Number.isInteger(removedIndex) && removedIndex >= 0 ? removedIndex : null;
        if (index === null) return { status: 'rejected', removed: 0, shifted: 0 };
        const removedEntries = state.entries.filter(entry => entry.floor === index);
        const shiftedEntries = state.entries.filter(entry => Number.isInteger(entry.floor) && entry.floor > index);
        if (!removedEntries.length && !shiftedEntries.length && !(lastFloor && Number.isInteger(lastFloor.floor) && lastFloor.floor >= index)) {
            return { status: 'noop', removed: 0, shifted: 0 };
        }
        state.entries = state.entries
            .filter(entry => entry.floor !== index)
            .map(entry => Number.isInteger(entry.floor) && entry.floor > index ? { ...entry, floor: entry.floor - 1 } : entry);
        if (lastFloor && Number.isInteger(lastFloor.floor)) {
            if (lastFloor.floor === index) lastFloor = null;
            else if (lastFloor.floor > index) lastFloor = { ...lastFloor, floor: lastFloor.floor - 1 };
        }
        state.log.push({ at: now(), source: 'floor_delete', summaries: [`第 ${index + 1} 楼已删：删除对应记忆 ${removedEntries.length} 条，${shiftedEntries.length} 条依据楼层前移`], rejected: 0 });
        state.log = state.log.slice(-maxLog);
        state.updatedAt = now();
        return { status: 'applied', removed: removedEntries.length, shifted: shiftedEntries.length };
    }

    return Object.freeze({ apply, consolidate, dropFloor, snapshot, status, manualVersion: () => state.manualVersion, restore, reset, note, isRetired, tiers: TIERS, tierLabels: TIER_LABELS, tagLabels: TAG_LABELS, config: Object.freeze({ maxLog, maxOps }) });
}
