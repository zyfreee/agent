/**
 * 世界影响库：记录"玩家把这个世界改成了什么样"，是蝴蝶效应的账本。
 *
 * 一条记录 = 一件被世界记住的后果：谁在什么时候、因为玩家的什么动作、
 * 世界哪一块变了、依据在哪一楼、算不算原著走向的偏移、要不要等几天再发酵。
 *
 * 所有修改都走 apply()：模型提出的操作逐条校验，要么生效要么带着原因被拒绝，
 * 绝不抛异常打断调用方。面板手动登记与模型决定走同一条路，规则完全一致。
 * 这里只记账，不写正文、不改数值——正文怎么写由叙事层决定，数值由回合状态决定。
 */

const KINDS = Object.freeze(['direct', 'ripple', 'butterfly']);
const WEIGHTS = Object.freeze(['minor', 'major', 'world']);
const CERTAINTIES = Object.freeze(['certain', 'rumor']);
const SHIFTS = Object.freeze(['none', 'accelerate', 'delay', 'avoid', 'alter']);
const STATES = Object.freeze(['active', 'ripened', 'closed', 'reverted']);
const SOURCES = Object.freeze(['decide', 'reply', 'manual']);

const MAX_TITLE_TEXT = 60;
const MAX_DETAIL_TEXT = 240;
const MAX_TARGET_TEXT = 40;
const MAX_EVIDENCE_TEXT = 120;
const MAX_CANON_TEXT = 60;
const MAX_EVENT_TEXT = 40;
const MAX_RIPEN_DAYS = 365;
// 判“疑似同一件事”的时间窗：同一个对象、同一种改写、这几天里换了说法又记一遍。
const SIMILAR_WINDOW_DAYS = 2;
const SIMILAR_SCORE = 0.65;

// 0 = 不限：账本本身不因为“条数多”而丢东西（注入只挑几条，用不着为了正文缩库）。
const DEFAULT_MAX_RECORDS = 0;
const DEFAULT_MAX_ARCHIVE = 0;
const DEFAULT_MAX_LOG = 40;
const DEFAULT_MAX_OPS = 6;
const DEFAULT_MAX_CHAIN = 4;
const OPID_MEMORY = 200;

const STATE_RANK = Object.freeze({ active: 0, ripened: 1, closed: 2, reverted: 3 });
const WEIGHT_RANK = Object.freeze({ world: 0, major: 1, minor: 2 });

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

/** 标题比对只看“字”：去掉标点空白，按双字片段算重合度，挡住“换了说法就再记一条”。 */
function bigrams(value) {
    const chars = [...value];
    const set = new Set();
    for (let index = 0; index + 1 < chars.length; index += 1) set.add(chars[index] + chars[index + 1]);
    if (!set.size && chars.length) set.add(chars[0]);
    return set;
}

function titleSimilarity(left, right) {
    const a = bigrams(String(left).replace(/[\s\p{P}\p{S}]/gu, ''));
    const b = bigrams(String(right).replace(/[\s\p{P}\p{S}]/gu, ''));
    if (!a.size || !b.size) return 0;
    let shared = 0;
    for (const piece of a) if (b.has(piece)) shared += 1;
    return (2 * shared) / (a.size + b.size);
}

/** 同一个对象、同一种改写、几天内标题高度相似：当成同一件事的重复登记。 */
function looksLikeSameEvent(records, candidate) {
    return records.find(record => record.target === candidate.target
        && record.shift === candidate.shift
        && Math.abs(record.day - candidate.day) <= SIMILAR_WINDOW_DAYS
        && titleSimilarity(record.title, candidate.title) >= SIMILAR_SCORE) || null;
}

function initialState(now) {
    return {
        schemaVersion: 1,
        day: 1,
        version: 0,
        // 上次叫记录员时停在哪个楼层：记录节奏按它数“之后又生成了几楼”，没记到东西也算数过。
        decidedFloor: -1,
        records: [],
        archive: [],
        log: [],
        updatedAt: now(),
    };
}

/** 只保留认识的字段并逐条清洗；坏记录丢弃，不让整份存档作废。 */
function cleanRecord(raw, index) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const title = text(raw.title).slice(0, MAX_TITLE_TEXT);
    if (!title) return null;
    return {
        id: text(raw.id) || `i${index + 1}`,
        day: clampInt(raw.day, 1, 99999, 1),
        floor: clampInt(raw.floor, 0, 9999999, null),
        title,
        detail: text(raw.detail).slice(0, MAX_DETAIL_TEXT),
        target: text(raw.target).slice(0, MAX_TARGET_TEXT),
        kind: KINDS.includes(raw.kind) ? raw.kind : 'direct',
        weight: WEIGHTS.includes(raw.weight) ? raw.weight : 'minor',
        certainty: CERTAINTIES.includes(raw.certainty) ? raw.certainty : 'certain',
        evidence: text(raw.evidence).slice(0, MAX_EVIDENCE_TEXT),
        canon: text(raw.canon).slice(0, MAX_CANON_TEXT),
        // 与世界台账里的事件对上号时记事件编号（如 e2），面板/账本里能互相点过去。
        eventId: text(raw.eventId).slice(0, MAX_EVENT_TEXT),
        shift: SHIFTS.includes(raw.shift) ? raw.shift : 'none',
        state: STATES.includes(raw.state) ? raw.state : 'active',
        ripenDay: clampInt(raw.ripenDay, 1, 99999, null),
        ripenedDay: clampInt(raw.ripenedDay, 1, 99999, null),
        resolution: text(raw.resolution).slice(0, MAX_EVIDENCE_TEXT),
        resolvedDay: clampInt(raw.resolvedDay, 1, 99999, null),
        parent: text(raw.parent),
        depth: clampInt(raw.depth, 0, 32, 0),
        source: SOURCES.includes(raw.source) ? raw.source : 'decide',
        // 手动改过（改内容或调整时间）：账本里标黄，方便一眼看出哪些不是原账。
        edited: raw.edited === true,
        editedDay: clampInt(raw.editedDay, 1, 99999, null),
        archivedReason: text(raw.archivedReason).slice(0, 20),
        createdAt: text(raw.createdAt),
    };
}

function normalizeState(raw, now) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const records = (Array.isArray(source.records) ? source.records : []).map(cleanRecord).filter(Boolean);
    return {
        schemaVersion: 1,
        day: clampInt(source.day, 1, 99999, 1),
        version: clampInt(source.version, 0, 9999999, 0),
        decidedFloor: clampInt(source.decidedFloor, 0, 9999999, -1),
        records,
        archive: (Array.isArray(source.archive) ? source.archive : []).map(cleanRecord).filter(Boolean).slice(-DEFAULT_MAX_ARCHIVE),
        log: (Array.isArray(source.log) ? source.log : []).slice(-DEFAULT_MAX_LOG),
        updatedAt: text(source.updatedAt) || now(),
    };
}

/** 留最该留的：没消化、分量重、新的；已了结、旧的先挪进档案。 */
function rankRecord(record) {
    return STATE_RANK[record.state] * 1e6 + WEIGHT_RANK[record.weight] * 1e5 - record.day * 10;
}

export function createImpactRuntime({ maxRecords = DEFAULT_MAX_RECORDS, maxArchive = DEFAULT_MAX_ARCHIVE, maxLog = DEFAULT_MAX_LOG, maxOps = DEFAULT_MAX_OPS, maxChainDepth = DEFAULT_MAX_CHAIN, now = () => new Date().toISOString() } = {}) {
    maxRecords = clampInt(maxRecords, 0, 100000, DEFAULT_MAX_RECORDS);
    maxArchive = clampInt(maxArchive, 0, 100000, DEFAULT_MAX_ARCHIVE);
    maxLog = clampInt(maxLog, 5, 200, DEFAULT_MAX_LOG);
    maxOps = clampInt(maxOps, 1, 24, DEFAULT_MAX_OPS);
    maxChainDepth = clampInt(maxChainDepth, 0, 8, DEFAULT_MAX_CHAIN);
    let state = initialState(now);
    let seq = 0;
    let opIdMemory = [];
    let lastFloor = null; // 最近一次由模型回复落账的楼层：{ floor, undo }，同楼重 roll 时用来回滚
    let sweptDay = state.day;

    function find(id) {
        const key = text(id);
        if (!key) return null;
        return state.records.find(record => record.id === key) || null;
    }

    function nextId() {
        seq += 1;
        return `i${seq}`;
    }

    /** 库满时把最该淘汰的记录挪进档案：不删除，只是不再注入、不再参与决定。maxRecords 为 0 表示不限。 */
    function prune() {
        if (!maxRecords || state.records.length <= maxRecords) return [];
        const doomed = [...state.records]
            .sort((a, b) => rankRecord(b) - rankRecord(a))
            .slice(0, state.records.length - maxRecords);
        const doomedIds = new Set(doomed.map(record => record.id));
        state.records = state.records.filter(record => !doomedIds.has(record.id));
        state.archive.push(...doomed.map(record => ({ ...record })));
        if (maxArchive) state.archive = state.archive.slice(-maxArchive);
        return doomed.map(record => record.id);
    }

    function rememberOpId(opId) {
        if (!opId) return;
        opIdMemory.push(opId);
        if (opIdMemory.length > OPID_MEMORY) opIdMemory = opIdMemory.slice(-OPID_MEMORY);
    }

    function logEntry(source, summaries, rejected = 0) {
        state.log.push({ at: now(), source, summaries, rejected });
        state.log = state.log.slice(-maxLog);
    }

    /** 到了发酵日就自动翻牌：模型定"几天后发作"，脚本到点执行，不需要人再点一次。 */
    function sweepDue(day) {
        if (!Number.isInteger(day) || day <= sweptDay) return [];
        const ripened = [];
        for (const record of state.records) {
            if (record.state !== 'active' || record.ripenDay === null) continue;
            if (record.ripenDay > day) continue;
            record.state = 'ripened';
            record.ripenedDay = record.ripenDay;
            ripened.push(record);
        }
        sweptDay = day;
        if (ripened.length) {
            logEntry('sweep', ripened.map(record => `到期发酵 ${record.id}：${record.title}`));
        }
        return ripened.map(record => record.id);
    }

    function summaryOf(record) {
        const size = record.weight === 'world' ? '世界级' : record.weight === 'major' ? '大事' : '小事';
        const canon = record.canon ? `；原著偏移：${record.canon}` : '';
        return `影响 +${record.id}（第 ${record.day} 天｜${size}｜${record.target}）：${record.title}${canon}`;
    }

    /** 单条操作校验 + 执行；绝不抛出。undo 是反向操作，供同楼重 roll 撤销。 */
    function runOne(op, { gameDay = state.day, floorKey = null, source = 'decide' } = {}) {
        if (!op || typeof op !== 'object' || Array.isArray(op)) return { ok: false, reason: 'bad_op_shape' };
        const kind = text(op.op);

        if (kind === 'record') {
            const title = text(op.title);
            if (!title) return { ok: false, reason: 'title_missing' };
            if (title.length > MAX_TITLE_TEXT) return { ok: false, reason: 'title_too_long' };
            const detail = text(op.detail);
            if (!detail) return { ok: false, reason: 'detail_missing' };
            if (detail.length > MAX_DETAIL_TEXT) return { ok: false, reason: 'detail_too_long' };
            const target = text(op.target);
            if (!target) return { ok: false, reason: 'target_missing' };
            if (target.length > MAX_TARGET_TEXT) return { ok: false, reason: 'target_too_long' };
            const evidence = text(op.evidence);
            if (evidence.length > MAX_EVIDENCE_TEXT) return { ok: false, reason: 'evidence_too_long' };
            const canon = text(op.canon);
            if (canon.length > MAX_CANON_TEXT) return { ok: false, reason: 'canon_too_long' };
            const eventId = text(op.eventId);
            if (eventId.length > MAX_EVENT_TEXT) return { ok: false, reason: 'event_too_long' };
            const parent = text(op.parent);
            let depth = 0;
            if (parent) {
                const upstream = find(parent);
                if (!upstream) return { ok: false, reason: 'parent_not_found' };
                depth = upstream.depth + 1;
                if (depth > maxChainDepth) return { ok: false, reason: 'chain_too_deep' };
            }
            // 同一楼里反复登记同一件事只算一次；没楼号时退回"同一天同一对象同标题"。
            const duplicated = state.records.some(record => record.title === title
                && (floorKey !== null ? record.floor === floorKey : record.day === gameDay && record.target === target));
            if (duplicated) return { ok: false, reason: 'duplicate_record' };
            let ripenDay = null;
            if (op.ripen !== undefined && op.ripen !== null) {
                const span = intIn(op.ripen, 1, MAX_RIPEN_DAYS);
                if (span === null) return { ok: false, reason: 'bad_ripen' };
                ripenDay = gameDay + span;
            }
            const shiftValue = canon && SHIFTS.includes(op.shift) ? op.shift : 'none';
            if (looksLikeSameEvent(state.records, { title, target, shift: shiftValue, day: gameDay })) {
                return { ok: false, reason: 'duplicate_similar' };
            }
            const record = {
                id: nextId(),
                day: gameDay,
                floor: floorKey,
                title,
                detail,
                target,
                kind: KINDS.includes(op.kind) ? op.kind : 'direct',
                weight: WEIGHTS.includes(op.weight) ? op.weight : 'minor',
                certainty: CERTAINTIES.includes(op.certainty) ? op.certainty : 'certain',
                evidence,
                canon,
                eventId,
                shift: shiftValue,
                state: 'active',
                ripenDay,
                ripenedDay: null,
                resolution: '',
                resolvedDay: null,
                parent,
                depth,
                source: SOURCES.includes(source) ? source : 'decide',
                edited: false,
                editedDay: null,
                archivedReason: '',
                createdAt: now(),
            };
            state.records.push(record);
            const archived = prune();
            const ripenNote = ripenDay !== null ? `，第 ${ripenDay} 天起发酵` : '';
            const archiveNote = archived.length ? `；已归档 ${archived.join('、')}` : '';
            return { ok: true, id: record.id, record, summary: `${summaryOf(record)}${ripenNote}${archiveNote}`, undo: { op: '_removeRecord', id: record.id } };
        }

        if (kind === 'ripen' || kind === 'close' || kind === 'revert') {
            const record = find(text(op.ref));
            if (!record) return { ok: false, reason: 'record_not_found' };
            if (record.state === 'closed' || record.state === 'reverted') return { ok: false, reason: 'record_inactive' };
            if (kind === 'ripen' && record.state === 'ripened') return { ok: false, reason: 'already_ripened' };
            const before = {
                op: '_restoreRecord',
                id: record.id,
                state: record.state,
                ripenedDay: record.ripenedDay,
                resolution: record.resolution,
                resolvedDay: record.resolvedDay,
            };
            const note = text(op.detail).slice(0, MAX_EVIDENCE_TEXT) || record.resolution;
            if (kind === 'ripen') {
                record.state = 'ripened';
                record.ripenedDay = gameDay;
                record.resolution = note;
            } else {
                record.state = kind === 'close' ? 'closed' : 'reverted';
                record.resolvedDay = gameDay;
                record.resolution = note;
            }
            const verb = kind === 'ripen' ? '发酵' : kind === 'close' ? '了结' : '修复';
            return { ok: true, id: record.id, record, summary: `影响${verb} ${record.id}：${record.title}${note ? `（${note}）` : ''}`, undo: before };
        }

        // 手动改一条已经记下的影响：只改内容与发酵安排，不改“是否收场”（那用 ripen/close/revert）。
        if (kind === 'edit') {
            const record = find(text(op.ref));
            if (!record) return { ok: false, reason: 'record_not_found' };
            const next = { ...record };
            if (op.title !== undefined) {
                const title = text(op.title);
                if (!title) return { ok: false, reason: 'title_missing' };
                if (title.length > MAX_TITLE_TEXT) return { ok: false, reason: 'title_too_long' };
                next.title = title;
            }
            if (op.detail !== undefined) {
                const detail = text(op.detail);
                if (!detail) return { ok: false, reason: 'detail_missing' };
                if (detail.length > MAX_DETAIL_TEXT) return { ok: false, reason: 'detail_too_long' };
                next.detail = detail;
            }
            if (op.target !== undefined) {
                const target = text(op.target);
                if (!target) return { ok: false, reason: 'target_missing' };
                if (target.length > MAX_TARGET_TEXT) return { ok: false, reason: 'target_too_long' };
                next.target = target;
            }
            if (op.evidence !== undefined) {
                const evidence = text(op.evidence);
                if (evidence.length > MAX_EVIDENCE_TEXT) return { ok: false, reason: 'evidence_too_long' };
                next.evidence = evidence;
            }
            if (op.canon !== undefined) {
                const canon = text(op.canon);
                if (canon.length > MAX_CANON_TEXT) return { ok: false, reason: 'canon_too_long' };
                next.canon = canon;
            }
            if (op.eventId !== undefined) {
                const eventId = text(op.eventId);
                if (eventId.length > MAX_EVENT_TEXT) return { ok: false, reason: 'event_too_long' };
                next.eventId = eventId;
            }
            if (op.kind !== undefined) {
                if (!KINDS.includes(op.kind)) return { ok: false, reason: 'bad_kind' };
                next.kind = op.kind;
            }
            if (op.weight !== undefined) {
                if (!WEIGHTS.includes(op.weight)) return { ok: false, reason: 'bad_weight' };
                next.weight = op.weight;
            }
            if (op.certainty !== undefined) {
                if (!CERTAINTIES.includes(op.certainty)) return { ok: false, reason: 'bad_certainty' };
                next.certainty = op.certainty;
            }
            if (op.shift !== undefined) {
                if (!SHIFTS.includes(op.shift)) return { ok: false, reason: 'bad_shift' };
                next.shift = next.canon ? op.shift : 'none';
            } else if (!next.canon) {
                next.shift = 'none';
            }
            if (op.ripen !== undefined) {
                // 改写只动“什么时候发酵”，不动“有没有已经发酵过”：
                // 已经应验的事改个错别字，不该被当成没发生。
                if (op.ripen === null) {
                    next.ripenDay = null;
                } else {
                    const span = intIn(op.ripen, 1, MAX_RIPEN_DAYS);
                    if (span === null) return { ok: false, reason: 'bad_ripen' };
                    next.ripenDay = gameDay + span;
                }
            }
            const duplicated = state.records.some(other => other !== record
                && other.title === next.title && other.target === next.target && other.day === record.day);
            if (duplicated) return { ok: false, reason: 'duplicate_record' };
            const alike = looksLikeSameEvent(state.records.filter(other => other !== record),
                { title: next.title, target: next.target, shift: next.shift, day: record.day });
            if (alike) return { ok: false, reason: 'duplicate_similar' };
            const before = structuredClone(record);
            // 手动改过的账标黄：改内容与调时间都算，便于和模型原账区分。
            next.edited = true;
            next.editedDay = gameDay;
            Object.assign(record, next);
            return { ok: true, id: record.id, record, summary: `影响改写 ${record.id}：${record.title}`, undo: { op: '_restoreEdit', id: record.id, before } };
        }

        // 玩家推动/拖延一件已经记下的影响：负数提前、正数往后推；提前到今天就算当场应验。
        if (kind === 'adjust') {
            const record = find(text(op.ref));
            if (!record) return { ok: false, reason: 'record_not_found' };
            if (record.state === 'closed' || record.state === 'reverted') return { ok: false, reason: 'record_inactive' };
            if (record.state === 'ripened') return { ok: false, reason: 'already_ripened' };
            const days = intIn(op.days, -MAX_RIPEN_DAYS, MAX_RIPEN_DAYS);
            if (days === null || days === 0) return { ok: false, reason: 'bad_days' };
            if (record.ripenDay === null && days < 0) return { ok: false, reason: 'no_schedule' };
            const before = {
                op: '_restoreRecord',
                id: record.id,
                state: record.state,
                ripenedDay: record.ripenedDay,
                resolution: record.resolution,
                resolvedDay: record.resolvedDay,
                ripenDay: record.ripenDay,
                edited: record.edited,
                editedDay: record.editedDay,
            };
            let note;
            if (record.ripenDay === null) {
                record.ripenDay = gameDay + days;
                note = `第 ${record.ripenDay} 天起才发作`;
            } else {
                const nextDay = record.ripenDay + days;
                if (nextDay <= gameDay) {
                    record.ripenDay = gameDay;
                    record.state = 'ripened';
                    record.ripenedDay = gameDay;
                    record.resolution = text(op.detail).slice(0, MAX_EVIDENCE_TEXT) || '玩家把这件事提前了';
                    note = '已经当场应验';
                } else {
                    record.ripenDay = Math.min(nextDay, gameDay + MAX_RIPEN_DAYS);
                    note = `改到第 ${record.ripenDay} 天发作`;
                }
            }
            record.edited = true;
            record.editedDay = gameDay;
            const word = days < 0 ? '提前' : '延后';
            return { ok: true, id: record.id, record, summary: `影响${word} ${record.id}：${record.title}（${note}）`, undo: before };
        }

        // 手动删除：不真删，挪进档案，后面还能找回来。
        if (kind === 'forget') {
            const id = text(op.ref);
            const at = state.records.findIndex(record => record.id === id);
            if (at < 0) return { ok: false, reason: 'record_not_found' };
            const [record] = state.records.splice(at, 1);
            const archived = { ...structuredClone(record), archivedReason: 'deleted' };
            state.archive.push(archived);
            if (maxArchive && state.archive.length > maxArchive) state.archive.splice(0, state.archive.length - maxArchive);
            return { ok: true, id, record: archived, summary: `删除影响 ${id}：${record.title}（已进档案，可恢复）`, undo: { op: '_restoreArchived', id, record: structuredClone(record), index: at } };
        }

        // 从档案里找回来：库里满了就先别硬塞，避免刚恢复又被容量淘汰。
        if (kind === 'unarchive') {
            const id = text(op.ref);
            const at = state.archive.findIndex(record => record.id === id);
            if (at < 0) return { ok: false, reason: 'archive_not_found' };
            if (maxRecords && state.records.length >= maxRecords) return { ok: false, reason: 'library_full' };
            const [record] = state.archive.splice(at, 1);
            const cleaned = cleanRecord({ ...record, archivedReason: '' }, state.records.length);
            if (!cleaned) return { ok: false, reason: 'bad_restore' };
            state.records.push(cleaned);
            return { ok: true, id, record: cleaned, summary: `从档案恢复影响 ${id}：${cleaned.title}`, undo: { op: '_rearchive', id, index: at, reason: record.archivedReason || 'pruned' } };
        }

        // 内部撤销操作：只由同楼重 roll 的回滚调用，不写进模型指南。
        if (kind === '_removeRecord') {
            const id = text(op.id);
            const at = state.records.findIndex(record => record.id === id);
            if (at < 0) return { ok: false, reason: 'record_not_found' };
            state.records.splice(at, 1);
            return { ok: true, summary: `撤销影响 ${id}` };
        }
        if (kind === '_restoreRecord') {
            const record = find(text(op.id));
            if (!record) return { ok: false, reason: 'record_not_found' };
            record.state = STATES.includes(op.state) ? op.state : 'active';
            record.ripenedDay = clampInt(op.ripenedDay, 1, 99999, null);
            record.resolution = text(op.resolution).slice(0, MAX_EVIDENCE_TEXT);
            record.resolvedDay = clampInt(op.resolvedDay, 1, 99999, null);
            // 调整时间也可能改 state/发酵日/改动标记，撤销时要一并还回去。
            if (op.ripenDay !== undefined) record.ripenDay = clampInt(op.ripenDay, 1, 99999, null);
            if (op.edited !== undefined) record.edited = op.edited === true;
            if (op.editedDay !== undefined) record.editedDay = clampInt(op.editedDay, 1, 99999, null);
            return { ok: true, summary: `恢复影响 ${record.id}` };
        }
        if (kind === '_restoreEdit') {
            const id = text(op.id);
            const at = state.records.findIndex(record => record.id === id);
            if (at < 0) return { ok: false, reason: 'record_not_found' };
            const cleaned = cleanRecord({ ...op.before, id }, at);
            if (!cleaned) return { ok: false, reason: 'bad_restore' };
            state.records[at] = cleaned;
            return { ok: true, summary: `恢复影响 ${id} 的改写` };
        }
        if (kind === '_restoreArchived') {
            const id = text(op.id);
            const at = state.archive.findIndex(record => record.id === id);
            if (at >= 0) state.archive.splice(at, 1);
            const cleaned = cleanRecord({ ...op.record, id, archivedReason: '' }, state.records.length);
            if (!cleaned) return { ok: false, reason: 'bad_restore' };
            const index = Math.min(Math.max(0, clampInt(op.index, 0, 99999, state.records.length)), state.records.length);
            state.records.splice(index, 0, cleaned);
            return { ok: true, summary: `找回影响 ${id}` };
        }
        if (kind === '_rearchive') {
            const id = text(op.id);
            const at = state.records.findIndex(record => record.id === id);
            if (at < 0) return { ok: false, reason: 'record_not_found' };
            const [record] = state.records.splice(at, 1);
            const archived = cleanRecord({ ...record, id, archivedReason: text(op.reason) || 'deleted' }, state.archive.length);
            if (!archived) return { ok: false, reason: 'bad_restore' };
            state.archive.push(archived);
            if (maxArchive && state.archive.length > maxArchive) state.archive.splice(0, state.archive.length - maxArchive);
            return { ok: true, summary: `影响 ${id} 退回档案` };
        }
        return { ok: false, reason: 'unknown_op' };
    }

    function apply(operations, { source = 'decide', floor = null, day = null } = {}) {
        const floorKey = Number.isInteger(floor) && floor >= 0 ? floor : null;
        const gameDay = intIn(day, 1, 99999) ?? state.day;
        const fromModel = source === 'decide' || source === 'reply';
        // 同一楼重新生成（重 roll/换 swipe）：先把上一版影响处理原样撤销，再执行新版，避免重复记账。
        if (fromModel && floorKey !== null && lastFloor && lastFloor.floor === floorKey) {
            for (const undo of [...lastFloor.undo].reverse()) runOne(undo, { gameDay, floorKey, source: 'revert' });
            logEntry('revert', [`第 ${floorKey + 1} 楼重新生成：已撤销上一版世界影响`]);
        }
        state.day = gameDay;
        const dueIds = sweepDue(gameDay);
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
            const result = runOne(op, { gameDay, floorKey, source });
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
        // “记录节奏”要按“上次叫过记录员之后又生成了几楼”算，没记到东西也算叫过一次。
        if (fromModel && floorKey !== null) state.decidedFloor = floorKey;
        if (applied.length) {
            state.version += 1;
            state.updatedAt = now();
            logEntry(source, applied.map(item => item.summary), rejected.length);
        } else if (dueIds.length) {
            state.version += 1;
            state.updatedAt = now();
        }
        return {
            status: rejected.length && !applied.length ? 'rejected' : applied.length ? 'applied' : 'noop',
            applied,
            rejected,
            duplicate,
            due: dueIds,
            version: state.version,
        };
    }

    function list({ state: wanted = '', kind = '', weight = '', canon = '', target = '', dayFrom = null, dayTo = null, limit = 0 } = {}) {
        const from = intIn(dayFrom, 1, 99999);
        const to = intIn(dayTo, 1, 99999);
        const rows = state.records.filter(record => {
            if (wanted && record.state !== wanted) return false;
            if (kind && record.kind !== kind) return false;
            if (weight && record.weight !== weight) return false;
            if (canon && !record.canon.includes(canon)) return false;
            if (target && !record.target.includes(target)) return false;
            if (from !== null && record.day < from) return false;
            if (to !== null && record.day > to) return false;
            return true;
        });
        rows.sort((a, b) => (WEIGHT_RANK[a.weight] - WEIGHT_RANK[b.weight]) || (b.day - a.day));
        return limit > 0 ? rows.slice(0, limit) : rows;
    }

    /** 还没到发酵日的记录：决定模块用它提醒"这些事还没发作，可以留到以后"。 */
    function pendingRipen(day = state.day) {
        const key = intIn(day, 1, 99999) ?? state.day;
        return state.records.filter(record => record.state === 'active' && record.ripenDay !== null && record.ripenDay > key);
    }

    function snapshot() {
        return structuredClone(state);
    }

    /** 档案：容量清出与被手动删除的都在这里，面板可只读展示并挑回来。 */
    function archived(limit = 0) {
        const rows = [...state.archive].sort((left, right) => (right.day - left.day) || String(left.id).localeCompare(String(right.id)));
        return limit > 0 ? rows.slice(0, limit) : rows;
    }

    function status() {
        const count = wanted => state.records.filter(record => record.state === wanted).length;
        return {
            day: state.day,
            version: state.version,
            decidedFloor: state.decidedFloor,
            total: state.records.length,
            active: count('active'),
            ripened: count('ripened'),
            closed: count('closed'),
            reverted: count('reverted'),
            edited: state.records.filter(record => record.edited).length,
            due: state.records.filter(record => record.state === 'active' && record.ripenDay !== null && record.ripenDay <= state.day).length,
            archived: state.archive.length,
        };
    }

    /**
     * 楼层被删：这一楼记下的账进档案（不真删，可恢复），它后面楼层的“依据楼层”整体前移一位。
     * 楼层号是账本和聊天对齐的坐标，删楼后不挪，后面所有记录的“依据”都会指错地方。
     */
    function dropFloor(floor, { reason = 'floor_deleted' } = {}) {
        const target = Number(floor);
        if (!Number.isInteger(target) || target < 0) return { status: 'rejected', reason: 'bad_floor', removed: 0, shifted: 0 };
        const doomed = state.records.filter(record => record.floor === target);
        let shifted = 0;
        if (doomed.length) {
            const ids = new Set(doomed.map(record => record.id));
            state.records = state.records.filter(record => !ids.has(record.id));
            state.archive.push(...doomed.map(record => ({ ...structuredClone(record), archivedReason: reason })));
            if (maxArchive) state.archive = state.archive.slice(-maxArchive);
        }
        for (const record of state.records) {
            if (record.floor !== null && record.floor > target) {
                record.floor -= 1;
                shifted += 1;
            }
        }
        for (const record of state.archive) {
            if (record.floor !== null && record.floor > target) record.floor -= 1;
        }
        // 记账指针跟着楼层挪：被删的那层不能再用作“上次记录员来的地方”，否则节奏闸会数错。
        let pointerMoved = false;
        if (lastFloor && lastFloor.floor === target) lastFloor = null;
        else if (lastFloor && lastFloor.floor > target) lastFloor = { ...lastFloor, floor: lastFloor.floor - 1 };
        if (state.decidedFloor > target) { state.decidedFloor -= 1; pointerMoved = true; }
        if (doomed.length || shifted || pointerMoved) {
            state.version += 1;
            state.updatedAt = now();
            const words = [];
            if (doomed.length) words.push(`第 ${target + 1} 楼被删：${doomed.length} 条影响移入档案`);
            if (shifted) words.push(`其余 ${shifted} 条影响的依据楼层前移一位`);
            if (pointerMoved) words.push('记账楼层前移一位');
            logEntry('manual', words);
        }
        return { status: doomed.length || shifted || pointerMoved ? 'applied' : 'noop', removed: doomed.length, shifted, version: state.version };
    }

    function restore(raw) {
        state = normalizeState(raw, now);
        seq = Math.max(0, ...state.records.map(record => Number(String(record.id).replace(/\D/g, '')) || 0));
        opIdMemory = [];
        lastFloor = null;
        sweptDay = state.day;
        return { status: 'restored', ...status() };
    }

    function reset() {
        state = initialState(now);
        seq = 0;
        opIdMemory = [];
        lastFloor = null;
        sweptDay = state.day;
        return { status: 'reset', ...status() };
    }

    /** 不改库、只往流水里记一笔（模型判断无变化、解析失败这类"决定结果"）。 */
    function note(message, { source = 'decide' } = {}) {
        logEntry(source, [String(message).slice(0, MAX_DETAIL_TEXT)]);
        return { status: 'noted' };
    }

    /** 设置页改上限时热更新；数值越界照构造时的范围夹紧，不抛错。 */
    function configure(patch = {}) {
        if (!patch || typeof patch !== 'object') return { status: 'rejected', reason: 'bad_patch' };
        if (patch.maxRecords !== undefined) maxRecords = clampInt(patch.maxRecords, 0, 100000, maxRecords);
        if (patch.maxArchive !== undefined) maxArchive = clampInt(patch.maxArchive, 0, 100000, maxArchive);
        if (patch.maxLog !== undefined) maxLog = clampInt(patch.maxLog, 5, 200, maxLog);
        if (patch.maxOps !== undefined) maxOps = clampInt(patch.maxOps, 1, 24, maxOps);
        if (patch.maxChainDepth !== undefined) maxChainDepth = clampInt(patch.maxChainDepth, 0, 8, maxChainDepth);
        return { status: 'configured', config: config() };
    }

    function config() {
        return { maxRecords, maxArchive, maxLog, maxOps, maxChainDepth };
    }

    return Object.freeze({
        apply,
        list,
        archived,
        pendingRipen,
        snapshot,
        status,
        dropFloor,
        restore,
        reset,
        note,
        configure,
        config,
    });
}
