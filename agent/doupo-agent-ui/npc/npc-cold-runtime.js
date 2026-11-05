/**
 * 冷藏人物推进台：只准备“该不该补这一段时间”的预览，不直接改人物簿。
 * 时间永远取世界台账的当前日；确认后由入口把补丁交回人物簿。
 */

const MAX_SELECTED = 20;
const MAX_EVENT_IDS = 120;
const MAX_PREVIEWS = 20;

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

function eventTouches(event, record) {
    const body = eventText(event).toLowerCase();
    return namesOf(record).some(name => name && body.includes(name));
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
        weight: text(event.weight, 20),
        done: event.done === true,
    };
}

function initialState() {
    return { schemaVersion: 1, selected: [], sync: {}, previews: [], updatedAt: '' };
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
    return { schemaVersion: 1, selected, sync, previews, updatedAt: text(source.updatedAt, 80) };
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

    function candidates({ day, records = [], worldSnapshot = {}, floors = [] } = {}) {
        const toDay = dayOf(day, dayOf(worldSnapshot?.clock?.day));
        const events = [...(worldSnapshot?.nearEvents ?? []), ...(worldSnapshot?.worldEvents ?? [])].map(cleanEvent).filter(Boolean);
        const byName = new Map((Array.isArray(records) ? records : []).map(record => [record?.name, record]));
        const result = [];
        for (const name of state.selected) {
            const record = byName.get(name) || records.find(item => namesOf(item).includes(name.toLowerCase()));
            if (!record) continue;
            const previous = state.sync[name] || { lastDay: 0, eventIds: [], lastFloor: -1 };
            const relevant = events.filter(event => eventTouches(event, record));
            const known = new Set(previous.eventIds);
            const newEvents = relevant.filter(event => !known.has(event.id) && (previous.lastDay === 0 || event.day > previous.lastDay || event.day === toDay));
            const dayMoved = previous.lastDay > 0 && toDay > previous.lastDay;
            // 第一次勾选只建立“从今天开始”的基线，不把过去的旧事件补演成今天的经历。
            if (!previous.lastDay) {
                state.sync[name] = { lastDay: toDay, eventIds: relevant.map(event => event.id).slice(-MAX_EVENT_IDS), lastFloor: -1 };
                state.updatedAt = now();
                continue;
            }
            if (!dayMoved && !newEvents.length) continue;
            result.push({
                id: `cold-${++sequence}`,
                name: record.name,
                record: structuredClone(record),
                fromDay: Math.max(1, previous.lastDay || toDay),
                toDay,
                previousDay: previous.lastDay,
                eventIds: newEvents.map(event => event.id),
                events: newEvents,
                floors: Array.isArray(floors) ? floors.slice(-4) : [],
                reason: newEvents.length ? `发现 ${newEvents.length} 条牵连到${record.name}的事件` : `世界已从第 ${previous.lastDay || toDay} 天走到第 ${toDay} 天`,
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
        };
        state.previews = state.previews.map(item => item.id === preview.id ? { ...item, status: 'confirmed' } : item.name === clean && item.status === 'pending' ? { ...item, status: 'stale' } : item);
        state.updatedAt = now();
        return { status: 'marked', previewId: preview.id, value: structuredClone(state.sync[clean]) };
    }

    function discard(id) {
        const key = text(id, 80);
        state.previews = state.previews.map(item => item.id === key ? { ...item, status: 'discarded' } : item);
        state.updatedAt = now();
        return { status: 'discarded', id: key };
    }

    function get(name) {
        const clean = cleanName(name);
        return clean ? structuredClone(state.sync[clean] || { lastDay: 0, eventIds: [], lastFloor: -1 }) : null;
    }

    function status() {
        return { selected: [...state.selected], sync: structuredClone(state.sync), previews: structuredClone(state.previews) };
    }

    function snapshot() { return structuredClone(state); }
    function restore(raw) {
        state = normalizeState(raw);
        sequence = Math.max(sequence, ...state.previews.map(item => Number(/^cold-(\d+)$/.exec(item.id)?.[1]) || 0));
        return { status: 'restored', ...status() };
    }
    function reset() { state = initialState(); return { status: 'reset', ...status() }; }

    return Object.freeze({ select, deselect, clearSelection, candidates, rememberPreview, validatePreview, mark, discard, get, status, snapshot, restore, reset });
}

export const NPC_COLD_RUNTIME_VERSION = 1;
