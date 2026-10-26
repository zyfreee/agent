import { parseComment } from './facts-index.js';

const MAX_ENTRIES = 2000;
const CN_DIGITS = Object.freeze({ 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 });

function parseChineseNumber(value) {
    if (typeof value !== 'string' || !value) return null;
    if (/^\d{1,3}$/.test(value)) return Number(value);
    if (value === '十') return 10;
    const [head, tail] = value.includes('十') ? value.split('十') : [null, value];
    if (head === null) return CN_DIGITS[value] ?? null;
    const tens = head === '' ? 1 : CN_DIGITS[head] ?? null;
    const ones = tail === '' ? 0 : CN_DIGITS[tail] ?? null;
    return tens === null || ones === null ? null : tens * 10 + ones;
}

/** Reads the volume marker the merge script left in entry bodies:「卷12」「«卷12 增补»」. */
function parsePhase(content) {
    if (typeof content !== 'string') return null;
    const match = content.match(/卷\s*([0-9]{1,2}|[一二三四五六七八九十]{1,3})/u);
    return match ? parseChineseNumber(match[1]) : null;
}

/** World book comments arrive as「名字（类别-名字）」, sometimes with a nested alias; keep the readable head. */
function headName(comment) {
    const parsed = parseComment(comment);
    if (parsed?.name) return parsed.name;
    return typeof comment === 'string' ? comment.split(/[（(]/u)[0].trim() : '';
}

function firstKey(raw) {
    return Array.isArray(raw?.key) && typeof raw.key[0] === 'string' ? raw.key[0].trim() : '';
}

function normalizeEntry(uid, raw) {
    if (!raw || typeof raw !== 'object') return null;
    const content = typeof raw.content === 'string' ? raw.content.trim() : '';
    if (!content) return null;
    const id = raw.uid !== undefined && raw.uid !== null ? String(raw.uid) : String(uid);
    const keys = Array.isArray(raw.key) ? raw.key.filter(value => typeof value === 'string' && value.trim()) : [];
    return {
        id,
        name: headName(raw.comment) || firstKey(raw) || id,
        content,
        keys,
        phase: parsePhase(content),
        disabled: raw.disable === true,
        // 酒馆已经会自动给主模型的条目（启用/常驻），插件不再重复注入。
        native: raw.disable !== true,
        constant: raw.constant === true,
    };
}

/**
 * Turns a SillyTavern world book into the entry list the setting supply
 * consumes. Read-only: nothing is written back to the book, and entries keep
 * their uid so the same id can be quoted back in the reply.
 */
export async function loadWorldbookEntries(context, name) {
    const loader = context?.loadWorldInfo;
    if (typeof loader !== 'function') {
        return { status: 'unsupported', entries: [], note: '当前酒馆没有 loadWorldInfo，无法从世界书导入。' };
    }
    const bookName = typeof name === 'string' && name.trim() ? name.trim() : '';
    if (!bookName) return { status: 'missing_name', entries: [], note: '先填写世界书名称，再点导入。' };
    let info;
    try {
        info = await loader.call(context, bookName);
    } catch (error) {
        return { status: 'failed', entries: [], note: `读取世界书失败：${error?.message ?? error}` };
    }
    const table = info?.entries && typeof info.entries === 'object' ? info.entries : null;
    if (!table) return { status: 'not_found', entries: [], note: `没有读到世界书「${bookName}」。` };
    const entries = [];
    let skipped = 0;
    for (const [uid, raw] of Object.entries(table)) {
        if (entries.length >= MAX_ENTRIES) break;
        const entry = normalizeEntry(uid, raw);
        if (!entry) { skipped++; continue; }
        entries.push(entry);
    }
    return {
        status: entries.length ? 'ok' : 'empty',
        name: bookName,
        entries,
        raw: table,
        skipped,
        note: entries.length ? `从「${bookName}」读到 ${entries.length} 条。` : `「${bookName}」里没有可用条目。`,
    };
}

/** Compact status line for the settings card. */
export function summarizeWorldbookEntries(entries = []) {
    const list = Array.isArray(entries) ? entries : [];
    const withPhase = list.filter(entry => Number.isInteger(entry?.phase)).length;
    return { total: list.length, withPhase, withoutPhase: list.length - withPhase };
}
