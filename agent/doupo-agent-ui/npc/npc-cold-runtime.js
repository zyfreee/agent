/**
 * 冷藏人物推进台：只准备“该不该补这一段时间”的预览，不直接改人物簿。
 * 时间永远取世界台账的当前日；确认后由入口把补丁交回人物簿。
 */

const MAX_SELECTED = 20;
const MAX_EVENT_IDS = 120;
const MAX_PREVIEWS = 20;
/** 单人单次推进喂给模型的新事件上限：按重要度挑，不再靠整包尾部硬截。 */
const MAX_CANDIDATE_EVENTS = 12;
const MAX_NOTE_CHARS = 120;

function text(value, limit = 240) {
    return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function dayOf(value, fallback = 1) {
    const day = Number(value);
    return Number.isInteger(day) && day >= 1 ? day : fallback;
}

function cleanName(value) {
    return text(value, 80).replace(/^[\s【\[「『(（]+|[\s】\]」』)）]+$/g, '');
}

function namesOf(record) {
    return [record?.name, ...(record?.aliases ?? []), ...(record?.titles ?? [])]
        .map(cleanName).filter(Boolean).map(value => value.toLowerCase());
}

function eventText(event) {
    return [event?.text, event?.basis].map(value => text(value, 300)).filter(Boolean).join('；');
}

/** 名字护栏：单字（「熏」「炎」）容易撞任意文本，长度不足 2 的名字不参与匹配。 */
function matchable(value) {
    const name = text(value, 80).toLowerCase();
    return name.length >= 2 ? name : null;
}

/** 参与者比对：点名条目等于或包含名字（模型可能写「年轻的萧炎」这类带修饰的称呼）。 */
function participantHit(event, names) {
    const keys = names.map(matchable).filter(Boolean);
    if (!keys.length) return false;
    const list = Array.isArray(event?.participants) ? event.participants : [];
    return list.some(entry => {
        const key = matchable(entry);
        return key ? keys.some(name => key === name || key.includes(name)) : false;
    });
}

/** 正文里每个名字的全部出现位置，供长名优先判断。 */
function occurrences(body, names) {
    const hits = [];
    for (const name of names) {
        const key = matchable(name);
        if (!key) continue;
        let at = body.indexOf(key);
        while (at !== -1) {
            hits.push({ name: key, at, len: key.length });
            at = body.indexOf(key, at + 1);
        }
    }
    return hits;
}

/** 命中被别人更长的名字整个盖住的，不算独立出现——「萧炎鼎」里不再替「萧炎」背书。 */
function ownOccurrences(body, names, otherNames = []) {
    return occurrences(body, names).filter(hit => !occurrences(body, otherNames)
        .some(other => other.len > hit.len && other.at <= hit.at && hit.at + hit.len <= other.at + other.len));
}

function bodyHit(event, names, otherNames = []) {
    return ownOccurrences(eventText(event).toLowerCase(), names, otherNames).length > 0;
}

/** 事件牵连判定，三档证据由强到弱：
 *  ① 点名：世界主持人登记事件时写下的 participants，最可靠；
 *  ② 正文/依据子串（长名优先护栏、单字不参与）；
 *  ③ 关系一跳：点名或正文提到关系人也算牵连——师徒/亲属出事，本人不该原地装死。 */
function eventTouches(event, record, extraNames = [], otherNames = []) {
    const own = namesOf(record);
    if (participantHit(event, own)) return { touched: true, via: null, how: '点名' };
    if (bodyHit(event, own, otherNames)) return { touched: true, via: null, how: '正文提及' };
    const extras = Array.isArray(extraNames) ? extraNames : [];
    const via = extras.find(name => participantHit(event, [name]) || bodyHit(event, [name]));
    return via ? { touched: true, via, how: '经关系牵连' } : { touched: false, via: null };
}

function cleanEvent(event) {
    if (!event || typeof event !== 'object') return null;
    const id = text(event.id, 60);
    const body = text(event.text, 300);
    if (!id || !body) return null;
    return {
        id,
        day: dayOf(event.day),
        scope: event.scope === 'world' ? 'world' : 'near',
        text: body,
        basis: text(event.basis, 120),
        participants: (Array.isArray(event.participants) ? event.participants : []).map(item => text(item, 20)).filter(Boolean),
        weight: text(event.weight, 20),
        done: event.done === true,
    };
}

/** 事件行的挑选权重：大事最要紧，传闻次之，普通垫底；同档新的在前。 */
const WEIGHT_RANK = Object.freeze({ major: 0, rumor: 1, minor: 2 });

/** 从确认/放弃的补丁里提一句给下次扫描衔接的摘要（字段变化 + 最后一条流水）。 */
function noteFromPatch(patch) {
    const entry = (Array.isArray(patch?.人物) ? patch.人物 : []).find(item => item && typeof item === 'object') ?? {};
    const parts = [];
    for (const [key, value] of Object.entries(entry)) {
        if (key === '姓名' || key === '流水' || key === '经历') continue;
        if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) continue;
        parts.push(`${key}:${typeof value === 'string' ? value.trim().slice(0, 20) : '…'}`);
        if (parts.length >= 3) break;
    }
    const log = Array.isArray(entry.流水) ? entry.流水 : [];
    const last = typeof log[log.length - 1] === 'string' ? log[log.length - 1].trim() : '';
    if (last) parts.push(last.slice(0, 60));
    return parts.join('；').slice(0, MAX_NOTE_CHARS);
}

function initialState() {
    return { schemaVersion: 1, selected: [], sync: {}, previews: [], lastUndo: null, updatedAt: '' };
}

function normalizeState(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const selected = [...new Set((Array.isArray(source.selected) ? source.selected : []).map(cleanName).filter(Boolean))].slice(0, MAX_SELECTED);
    const sync = {};
    if (source.sync && typeof source.sync === 'object') {
        for (const [key, item] of Object.entries(source.sync)) {
            const name = cleanName(key);
            if (!name || !item || typeof item !== 'object') continue;
            sync[name] = {
                lastDay: Number.isInteger(Number(item.lastDay)) && Number(item.lastDay) >= 1 ? Number(item.lastDay) : 0,
                eventIds: [...new Set((Array.isArray(item.eventIds) ? item.eventIds : []).map(value => text(value, 60)).filter(Boolean))].slice(-MAX_EVENT_IDS),
                lastFloor: Number.isInteger(Number(item.lastFloor)) && Number(item.lastFloor) >= 0 ? Number(item.lastFloor) : -1,
                lastNote: text(item.lastNote, MAX_NOTE_CHARS),
            };
        }
    }
    const previews = (Array.isArray(source.previews) ? source.previews : []).filter(item => item && typeof item === 'object').slice(-MAX_PREVIEWS).map(item => ({
        id: text(item.id, 80), name: cleanName(item.name), fromDay: dayOf(item.fromDay), toDay: dayOf(item.toDay), status: text(item.status, 20),
        previousDay: dayOf(item.previousDay, dayOf(item.fromDay)),
        ...(Number.isInteger(item.baseVersion) ? { baseVersion: item.baseVersion } : {}),
        patch: item.patch && typeof item.patch === 'object' ? structuredClone(item.patch) : { 人物: [] },
        eventIds: [...new Set((Array.isArray(item.eventIds) ? item.eventIds : []).map(value => text(value, 60)).filter(Boolean))].slice(0, MAX_EVENT_IDS),
    })).filter(item => item.id && item.name);
    const undo = source.lastUndo && typeof source.lastUndo === 'object' && !Array.isArray(source.lastUndo)
        && text(source.lastUndo.previewId, 80) && cleanName(source.lastUndo.name)
        && source.lastUndo.records && typeof source.lastUndo.records === 'object' && !Array.isArray(source.lastUndo.records)
        ? {
            previewId: text(source.lastUndo.previewId, 80),
            name: cleanName(source.lastUndo.name),
            day: dayOf(source.lastUndo.day),
            previousDay: dayOf(source.lastUndo.previousDay),
            records: structuredClone(source.lastUndo.records),
        }
        : null;
    return { schemaVersion: 1, selected, sync, previews, lastUndo: undo, updatedAt: text(source.updatedAt, 80) };
}

export function createNpcColdRuntime({ now = () => new Date().toISOString() } = {}) {
    let state = initialState();
    let sequence = 0;

    function select(names) {
        const incoming = Array.isArray(names) ? names : [names];
        for (const value of incoming.map(cleanName).filter(Boolean)) {
            if (!state.selected.includes(value) && state.selected.length < MAX_SELECTED) state.selected.push(value);
        }
        state.updatedAt = now();
        return { status: 'selected', selected: [...state.selected] };
    }

    function deselect(name) {
        const clean = cleanName(name);
        state.selected = state.selected.filter(item => item !== clean);
        state.updatedAt = now();
        return { status: 'deselected', selected: [...state.selected] };
    }

    function clearSelection() {
        state.selected = [];
        state.updatedAt = now();
        return { status: 'cleared', selected: [] };
    }

    function candidates({ day, records = [], worldSnapshot = {}, floors = [], relationsByPerson = {} } = {}) {
        const toDay = dayOf(day, dayOf(worldSnapshot?.clock?.day));
        const events = [...(worldSnapshot?.nearEvents ?? []), ...(worldSnapshot?.worldEvents ?? [])].map(cleanEvent).filter(Boolean);
        const byName = new Map((Array.isArray(records) ? records : []).map(record => [record?.name, record]));
        const result = [];
        for (const name of state.selected) {
            const record = byName.get(name) || records.find(item => namesOf(item).includes(name.toLowerCase()));
            if (!record) continue;
            // 关系一跳扩散：relationsByPerson[姓名] 是这个人的一跳关系人名单（由入口按关系图解析），
            // 事件点名或正文提到关系人也算牵连——师徒/亲属出事，本人不该原地装死。
            const extraNames = Array.isArray(relationsByPerson?.[record.name]) ? relationsByPerson[record.name] : [];
            // 其他建档人物的名字索引：短名命中若整个落在别人更长的名字里，不算本人被提到。
            const otherNames = [];
            for (const other of records) {
                if (!other || other.name === record.name) continue;
                otherNames.push(...namesOf(other));
            }
            const previous = state.sync[name] || { lastDay: 0, eventIds: [], lastFloor: -1, lastNote: '' };
            const relevant = events.filter(event => eventTouches(event, record, extraNames, otherNames).touched);
            const known = new Set(previous.eventIds);
            // 新事件按重要度挑满上限：大事在前、传闻次之、普通垫底，同档新的在前——
            // 间隔多日变局大时也不至于把要紧的事挤掉（过去靠整包尾部硬截，后排事件会静默丢失）。
            const newEvents = relevant
                .filter(event => !known.has(event.id) && (previous.lastDay === 0 || event.day > previous.lastDay || event.day === toDay))
                .sort((a, b) => (WEIGHT_RANK[a.weight] ?? 2) - (WEIGHT_RANK[b.weight] ?? 2) || b.day - a.day)
                .slice(0, MAX_CANDIDATE_EVENTS);
            const dayMoved = previous.lastDay > 0 && toDay > previous.lastDay;
            // 第一次勾选只建立“从今天开始”的基线，不把过去的旧事件补演成今天的经历。
            if (!previous.lastDay) {
                state.sync[name] = { lastDay: toDay, eventIds: relevant.map(event => event.id).slice(-MAX_EVENT_IDS), lastFloor: -1, lastNote: '' };
                state.updatedAt = now();
                continue;
            }
            if (!dayMoved && !newEvents.length) continue;
            const touches = newEvents.map(event => eventTouches(event, record, extraNames, otherNames));
            const viaName = touches.map(item => item.via).find(Boolean) ?? null;
            const named = touches.some(item => item.how === '点名');
            result.push({
                id: `cold-${++sequence}`,
                name: record.name,
                record: structuredClone(record),
                fromDay: Math.max(1, previous.lastDay || toDay),
                toDay,
                previousDay: previous.lastDay,
                lastNote: previous.lastNote ?? '',
                eventIds: newEvents.map(event => event.id),
                events: newEvents,
                floors: Array.isArray(floors) ? floors.slice(-4) : [],
                reason: newEvents.length
                    ? `发现 ${newEvents.length} 条牵连到${record.name}的事件${named ? '（事件点名）' : ''}${viaName ? `（经关系牵连：${viaName}）` : ''}`
                    : `世界已从第 ${previous.lastDay || toDay} 天走到第 ${toDay} 天`,
            });
        }
        return result;
    }

    function rememberPreview(preview) {
        if (!preview?.id || !preview?.name) return;
        sequence = Math.max(sequence, Number(/^cold-(\d+)$/.exec(preview.id)?.[1]) || 0);
        state.previews = [...state.previews.filter(item => item.id !== preview.id), {
            id: preview.id, name: preview.name, fromDay: dayOf(preview.fromDay), toDay: dayOf(preview.toDay), status: 'pending',
            previousDay: dayOf(preview.previousDay, dayOf(preview.fromDay)),
            ...(Number.isInteger(preview.baseVersion ?? preview.record?.version) ? { baseVersion: preview.baseVersion ?? preview.record.version } : {}),
            patch: preview.patch && typeof preview.patch === 'object' ? structuredClone(preview.patch) : { 人物: [] },
            eventIds: [...new Set((Array.isArray(preview.eventIds) ? preview.eventIds : []).map(value => text(value, 60)).filter(Boolean))].slice(0, MAX_EVENT_IDS),
        }].slice(-MAX_PREVIEWS);
        state.updatedAt = now();
    }

    function validatePreview(previewId, { recordVersion } = {}) {
        const preview = state.previews.find(item => item.id === previewId);
        if (!preview || preview.status !== 'pending') return { status: 'stale', reason: 'preview_not_pending' };
        const previous = state.sync[preview.name];
        if (!previous || previous.lastDay !== (preview.previousDay ?? preview.fromDay) || preview.toDay < previous.lastDay) return { status: 'stale', reason: 'cursor_mismatch' };
        if (preview.baseVersion !== undefined && preview.baseVersion !== recordVersion) return { status: 'stale', reason: 'record_version_mismatch' };
        return { status: 'ready', preview: structuredClone(preview) };
    }

    function mark(name, { previewId, day, eventIds = [], floor = -1, status = 'confirmed' } = {}) {
        const clean = cleanName(name);
        if (!clean) return { status: 'rejected', reason: 'name_missing' };
        const matches = state.previews.filter(item => item.name === clean && item.status === 'pending' && item.toDay === day && JSON.stringify(item.eventIds) === JSON.stringify(eventIds));
        if (!previewId && matches.length !== 1) return { status: 'rejected', reason: 'ambiguous_preview' };
        const preview = state.previews.find(item => item.id === (previewId ?? matches[0].id));
        if (preview?.name !== clean || status !== 'confirmed') return { status: 'rejected', reason: 'preview_mismatch' };
        const check = validatePreview(preview.id, { recordVersion: preview.baseVersion });
        if (check.status !== 'ready') return { status: 'rejected', reason: check.reason };
        const previous = state.sync[clean];
        state.sync[clean] = {
            lastDay: preview.toDay,
            eventIds: [...new Set([...previous.eventIds, ...preview.eventIds])].slice(-MAX_EVENT_IDS),
            lastFloor: Number.isInteger(Number(floor)) && Number(floor) >= 0 ? Number(floor) : previous.lastFloor,
            // 留痕：确认了什么记一句，下次扫描喂回去衔接（RecurrentGPT 式的“上一步显式带出”）。
            lastNote: noteFromPatch(preview.patch) || previous.lastNote || '',
        };
        state.previews = state.previews.map(item => item.id === preview.id ? { ...item, status: 'confirmed' } : item.name === clean && item.status === 'pending' ? { ...item, status: 'stale' } : item);
        state.updatedAt = now();
        return { status: 'marked', previewId: preview.id, value: structuredClone(state.sync[clean]) };
    }

    function discard(id) {
        const key = text(id, 80);
        const preview = state.previews.find(item => item.id === key);
        state.previews = state.previews.map(item => item.id === key ? { ...item, status: 'discarded' } : item);
        // 放弃的草稿也留一句痕：下次扫描模型知道上次推演过什么、被玩家否了，避免原样复读。
        if (preview && state.sync[preview.name]) {
            const note = noteFromPatch(preview.patch);
            state.sync[preview.name].lastNote = note ? `${note}（上次草稿被放弃）` : '上次草稿被放弃（没有可衔接的内容）';
            state.sync[preview.name].lastNote = state.sync[preview.name].lastNote.slice(0, MAX_NOTE_CHARS);
        }
        state.updatedAt = now();
        return { status: 'discarded', id: key };
    }

    /** 撤销最近一次确认：游标退回 previousDay、已见事件号从游标移除、草稿状态回到 pending。 */
    function unmark(previewId) {
        const preview = state.previews.find(item => item.id === text(previewId, 80));
        if (!preview || preview.status !== 'confirmed') return { status: 'rejected', reason: 'preview_not_confirmed' };
        const previous = state.sync[preview.name];
        if (!previous || previous.lastDay !== preview.toDay) return { status: 'rejected', reason: 'cursor_mismatch' };
        previous.lastDay = preview.previousDay;
        previous.eventIds = previous.eventIds.filter(id => !preview.eventIds.includes(id));
        state.previews = state.previews.map(item => item.id === preview.id ? { ...item, status: 'pending' } : item);
        state.updatedAt = now();
        return { status: 'unmarked', previewId: preview.id, value: structuredClone(previous) };
    }

    /** 确认前把受影响人物的整档快照交进来，撤销时按它原样写回人物簿（只保留最近一次）。 */
    function rememberUndo(undo) {
        const previewId = text(undo?.previewId, 80);
        const name = cleanName(undo?.name);
        if (!previewId || !name || !undo.records || typeof undo.records !== 'object' || Array.isArray(undo.records)) {
            return { status: 'rejected', reason: 'bad_undo_shape' };
        }
        state.lastUndo = {
            previewId,
            name,
            day: dayOf(undo.day),
            previousDay: dayOf(undo.previousDay),
            records: structuredClone(undo.records),
        };
        state.updatedAt = now();
        return { status: 'remembered', previewId };
    }

    function getUndo() {
        return state.lastUndo ? structuredClone(state.lastUndo) : null;
    }

    function clearUndo() {
        state.lastUndo = null;
        state.updatedAt = now();
        return { status: 'cleared' };
    }

    function get(name) {
        const clean = cleanName(name);
        return clean ? structuredClone(state.sync[clean] || { lastDay: 0, eventIds: [], lastFloor: -1, lastNote: '' }) : null;
    }

    function status() {
        return { selected: [...state.selected], sync: structuredClone(state.sync), previews: structuredClone(state.previews), lastUndo: structuredClone(state.lastUndo) };
    }

    function snapshot() { return structuredClone(state); }
    function restore(raw) {
        state = normalizeState(raw);
        sequence = Math.max(sequence, ...state.previews.map(item => Number(/^cold-(\d+)$/.exec(item.id)?.[1]) || 0));
        return { status: 'restored', ...status() };
    }
    function reset() { state = initialState(); return { status: 'reset', ...status() }; }

    return Object.freeze({ select, deselect, clearSelection, candidates, rememberPreview, validatePreview, mark, discard, unmark, rememberUndo, getUndo, clearUndo, get, status, snapshot, restore, reset });
}

/** 有界并发：最多 limit 路同时跑，结果按原顺序返回；worker 自己兜错误（返回失败标记而不是抛出）。 */
export async function mapWithLimit(items, limit, worker) {
    const list = Array.isArray(items) ? items : [];
    const results = new Array(list.length);
    let cursor = 0;
    const lanes = Array.from({ length: Math.max(1, Math.min(Math.max(1, limit), list.length)) }, async () => {
        while (cursor < list.length) {
            const index = cursor;
            cursor += 1;
            results[index] = await worker(list[index], index);
        }
    });
    await Promise.all(lanes);
    return results;
}

/** 外来补丁过滤：模型在补丁里写了名单外的人就丢弃并计数，不再把别人的字段并到目标头上。
 *  姓名缺省的条目保留（老行为：视为目标本人的补丁），统一改写成本人主键。 */
export function filterColdPatches(patches, record) {
    const own = namesOf(record);
    const list = Array.isArray(patches) ? patches.filter(item => item && typeof item === 'object') : [];
    const kept = [];
    const droppedNames = [];
    for (const item of list) {
        const stated = cleanName(item.姓名).toLowerCase();
        if (stated && own.length && !own.includes(stated)) {
            droppedNames.push(cleanName(item.姓名));
            continue;
        }
        kept.push({ ...item, 姓名: record.name });
    }
    return { kept, droppedNames };
}

export const NPC_COLD_RUNTIME_VERSION = 1;
