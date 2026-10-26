const LAYERS = new Set(['full', 'summary', 'mention']);
const MIN_KEY = 2;
const DEFAULT_RECALL_LIMIT = 40;
const DEFAULT_BUDGET = 1200;
const SUMMARY_FALLBACK = 60;
const SUMMARY_LABEL = /^(原著范围|承接|前情|接续|上一条|下一条|涉及|备注|来源|正文|简介|概况|介绍|作用|用途|外貌|性格|背景|来历|身份|特点|规则|构成|基本信息|外形|实力|基本原理|体系构成|效果|限制|代价|等级)[：:]\s*/u;
const SUMMARY_META_ONLY = new Set(['原著范围', '前情', '备注', '来源', '上一条', '下一条', '涉及']);
const EXCERPT_CHARS = 200;
const VOLUME_MARK = /^〔[^〕]*卷\s*0*([0-9]{1,2})/u;

/**
 * 条目正文里带〔卷04 增补〕这类分段标记，当前只到卷 01 时后面的段全是剧透。
 * 按卷号机械裁剪（不判断内容），没有标记的条目原样返回。
 */
function trimToVolume(content, volume) {
    if (!Number.isInteger(volume) || volume < 1) return content;
    if (typeof content !== 'string' || !content.includes('〔')) return content;
    const kept = [];
    let block = null;
    for (const line of content.split('\n')) {
        const hit = VOLUME_MARK.exec(line.trim());
        if (hit) block = Number(hit[1]);
        if (block !== null && block > volume) continue;
        kept.push(line);
    }
    return kept.join('\n').replace(/\n{3,}/gu, '\n\n').trim();
}

/**
 * 注入的“摘要层”：目录那 30 字摘要常断在半句话，这里改成按行剥掉
 * 标题行与标签后给完整正文；不设字数上限，只有预算放不下时才按整句裁。
 */
function excerptOf(content) {
    if (typeof content !== 'string' || !content.trim()) return '';
    const kept = [];
    for (const raw of content.split('\n')) {
        let line = raw.trim();
        if (!line) continue;
        line = line.replace(/^【[^】]{0,40}】\s*/u, '');
        const label = SUMMARY_LABEL.exec(line);
        if (label) {
            if (SUMMARY_META_ONLY.has(label[1])) continue;
            line = line.slice(label[0].length).trim();
            if (!line) continue;
        }
        kept.push(line);
    }
    return kept.join(' ').replace(/\s+/gu, ' ').trim();
}

/** 预算放不下时按整句裁：优先在句号、叹号、问号、分号处断，不在词中间断。 */
function fitBySentence(text, room) {
    if (!text || room <= 0) return '';
    let out = '';
    for (const part of text.split(/(?<=[。！？；])/u)) {
        if ((out + part).length > room) break;
        out += part;
    }
    if (out) return out.length < text.length ? `${out}…` : out;
    if (room <= 24) return '';
    return `${text.slice(0, room - 1)}…`;
}

/** Strips punctuation, whitespace and case so Chinese keys survive matched noise. */
function norm(value) {
    return typeof value === 'string' ? value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '') : '';
}

/** Rough token estimate: one CJK character is about one token. */
function estimateTokens(text) {
    if (typeof text !== 'string' || !text) return 0;
    let cjk = 0;
    let other = 0;
    for (const ch of text) {
        if (/[\u3400-\u9fff\uf900-\ufaff]/.test(ch)) cjk++;
        else other++;
    }
    return cjk + Math.ceil(other / 4);
}

/**
 * Share of a key's characters present anywhere in the text.
 * Tolerates one wrong character in a two-to-four character name, which exact
 * substring matching drops and pinyin matching would need a dictionary for.
 */
function charHitRatio(key, text) {
    if (!key || !text) return 0;
    const seen = new Set(text);
    let hit = 0;
    for (const ch of key) if (seen.has(ch)) hit++;
    return hit / key.length;
}

function uniqueKeys(values) {
    const out = [];
    const seen = new Set();
    for (const value of values) {
        if (typeof value !== 'string') continue;
        const key = value.trim();
        if (!key || key.length < MIN_KEY || seen.has(key)) continue;
        seen.add(key);
        out.push(key);
    }
    return out;
}

/** Worldbook comments arrive as「名字（类别-名字）」; keep the readable head. */
function headName(comment) {
    if (typeof comment !== 'string') return '';
    return comment.split(/[（(]/)[0].trim();
}

function normalizeEntry(raw, index) {
    if (!raw || typeof raw !== 'object') return null;
    const content = typeof raw.content === 'string' ? raw.content.trim() : (typeof raw.text === 'string' ? raw.text.trim() : '');
    if (!content) return null;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `set-${index + 1}`;
    const name = (typeof raw.name === 'string' && raw.name.trim())
        || headName(raw.comment)
        || id;
    const keys = uniqueKeys([
        name,
        ...(Array.isArray(raw.aliases) ? raw.aliases : []),
        ...(Array.isArray(raw.keywords) ? raw.keywords : []),
        ...(Array.isArray(raw.key) ? raw.key : []),
    ]);
    // 「异火·青莲地心火」这种带分隔符的名字，分隔后每一段也要能吃进去；
    // 长名字还要能用前两个字/三个字叫出来（青莲 / 青莲地），玩家很少写全名。
    const derived = [];
    const push = piece => {
        const value = piece.trim();
        if (value.length >= MIN_KEY && !keys.includes(value) && !derived.includes(value)) derived.push(value);
    };
    for (const key of keys) {
        for (const part of key.split(/[·・\/|]/)) push(part);
    }
    for (const key of [...keys, ...derived]) {
        const plain = key.replace(/[·・\/|]/g, '').trim();
        if (plain.length >= 4) {
            push(plain.slice(0, 2));
            push(plain.slice(0, 3));
        }
    }
    const allKeys = derived.length ? [...keys, ...derived] : keys;
    const summary = typeof raw.summary === 'string' && raw.summary.trim()
        ? raw.summary.trim()
        : content.replace(/\s+/g, ' ').slice(0, 120);
    const phase = Number.isInteger(raw.phase) ? raw.phase : (Number.isInteger(raw.volume) ? raw.volume : null);
    return Object.freeze({
        id,
        name,
        keys: allKeys,
        content,
        summary,
        phase,
        type: raw.type === 'passage' ? 'passage' : 'proposition',
    });
}

/**
 * Setting supply: the only component allowed to decide which original-work
 * entries reach the main generation prompt.
 *
 * It owns four steps and no prose: recall (wide, script only), assemble
 * (budget cut), audit (post-generation drift check). Selection itself is done
 * by the model through `candidates`, never by string equality alone.
 */
export function createSettingSupply({ countTokens = estimateTokens } = {}) {
    const entries = new Map();

    function register(list) {
        const items = Array.isArray(list) ? list : [list];
        let added = 0;
        let skipped = 0;
        for (const raw of items) {
            const entry = normalizeEntry(raw, entries.size);
            if (!entry) { skipped++; continue; }
            entries.set(entry.id, entry);
            added++;
        }
        return { added, skipped, total: entries.size };
    }

    function clear() {
        entries.clear();
        return { total: 0 };
    }

    function size() {
        return entries.size;
    }

    function list() {
        return [...entries.values()].map(entry => ({ id: entry.id, name: entry.name, phase: entry.phase, keys: entry.keys.slice() }));
    }

    /**
     * Wide recall. Returns compact candidates only, so the prompt never carries
     * entry bodies and the model can never invent an id that is not on the list.
     */
    function recall({ input, recentTexts = [], activeIds = [], asOf = null, limit = DEFAULT_RECALL_LIMIT } = {}) {
        const zones = [];
        const primary = norm(typeof input === 'string' ? input : '');
        if (primary) zones.push({ text: primary, weight: 1 });
        const recent = norm((Array.isArray(recentTexts) ? recentTexts : []).filter(item => typeof item === 'string').join(' '));
        if (recent) zones.push({ text: recent, weight: 0.4 });
        if (!zones.length) return { candidates: [], scanned: 0 };

        const active = new Set(Array.isArray(activeIds) ? activeIds : []);
        const candidates = [];
        let scanned = 0;
        for (const entry of entries.values()) {
            if (Number.isInteger(asOf) && Number.isInteger(entry.phase) && entry.phase > asOf) continue;
            scanned++;
            let score = 0;
            const matchedBy = [];
            for (const zone of zones) {
                for (const key of entry.keys) {
                    const needle = norm(key);
                    if (!needle) continue;
                    if (zone.text.includes(needle)) {
                        score += (120 + needle.length * 10) * zone.weight;
                        matchedBy.push(key);
                        continue;
                    }
                    const ratio = charHitRatio(needle, zone.text);
                    if (ratio >= 0.5) {
                        score += 40 * ratio * (needle.length / 2) * zone.weight;
                        matchedBy.push(`${key}~`);
                    }
                }
            }
            if (active.has(entry.id)) {
                score += 30;
                matchedBy.push('active');
            }
            if (score <= 0) continue;
            candidates.push({
                id: entry.id,
                name: entry.name,
                keys: entry.keys.slice(),
                score,
                matchedBy: [...new Set(matchedBy)].slice(0, 8),
                brief: entry.summary.slice(0, 60),
            });
        }
        candidates.sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));
        return { candidates: candidates.slice(0, Math.max(1, limit)), scanned };
    }

    /**
     * Renders the text that goes into the prompt. budget 为 0/空/Infinity 时不限字数：
     * 选中几条就注入几条全文，降到摘要层只发生在设了上限的时候。
     */
    function assemble(chosen, { budget = 0, volume = null } = {}) {
        const raw = Number(budget);
        const unlimited = !Number.isFinite(raw) || raw <= 0;
        const cap = unlimited ? Infinity : Math.floor(raw);
        const seen = new Set();
        const picked = [];
        let used = 0;
        const dropped = [];
        const render = (entry, layer) => {
            if (layer === 'mention') return `[${entry.id}] ${entry.name}`;
            // 世界书条目只带正文、没有单独摘要；摘要层按正文剥标签后截，
            // 绝不能渲染成 undefined，也不能断在半句话上。
            const fallback = layer === 'summary' ? excerptOf(entry.content) : '';
            const body = layer === 'full'
                ? trimToVolume(entry.content, volume)
                : layer === 'summary' ? (excerptOf(entry.content) || entry.summary || fallback || entry.name) : entry.name;
            return `[${entry.id}] ${entry.name}：${body}`;
        };
        const queue = [];
        for (const item of Array.isArray(chosen) ? chosen : []) {
            const id = typeof item?.id === 'string' ? item.id : '';
            if (!entries.has(id) || seen.has(id)) continue;
            seen.add(id);
            queue.push({ id, entry: entries.get(id), wanted: LAYERS.has(item?.layer) ? item.layer : 'summary' });
        }
        for (const [index, { id, entry, wanted }] of queue.entries()) {
            // 预算按“还没处理的条目数”均分：第一条的摘要不能吃掉全部额度，把后面的挤掉。
            const allowance = unlimited ? Infinity : Math.max(0, Math.floor((cap - used) / (queue.length - index)));
            const ladder = unlimited
                ? ['full']
                : wanted === 'full' ? ['full', 'summary', 'mention'] : wanted === 'summary' ? ['summary', 'mention'] : ['mention'];
            let line = '';
            let layer = wanted;
            for (const candidateLayer of ladder) {
                const text = render(entry, candidateLayer);
                // 标题行很小，只要整体还没超预算就保留，不能被均分额度挤掉。
                const budgetOk = candidateLayer === 'mention' ? used + countTokens(text) <= cap : countTokens(text) <= allowance;
                if (budgetOk) { line = text; layer = candidateLayer; break; }
                // 摘要层放不下时按整句裁，不设固定字数；裁不出可用内容再降到下一层。
                if (candidateLayer === 'summary') {
                    const head = `[${entry.id}] ${entry.name}：`;
                    const fitted = fitBySentence(excerptOf(entry.content), allowance - countTokens(head));
                    if (fitted) { line = `${head}${fitted}`; layer = 'summary'; break; }
                }
            }
            if (!line) { dropped.push({ id, reason: 'over_budget' }); continue; }
            used += countTokens(line);
            picked.push({ id, layer });
        }
        const lines = picked.map(({ id, layer }) => render(entries.get(id), layer));
        return {
            text: lines.join('\n'),
            usedIds: picked.map(item => item.id),
            layers: picked,
            droppedIds: dropped.map(item => item.id),
            tokens: used,
            budget: unlimited ? 0 : cap,
        };
    }

    /**
     * Post-generation check: an entry name showing up in prose that was never
     * injected is drift, whether or not the model reported it in claims.
     */
    function audit(text, injectedIds = [], restrictIds = []) {
        const body = norm(typeof text === 'string' ? text : '');
        if (!body) return { ok: true, issues: [] };
        const injected = new Set(Array.isArray(injectedIds) ? injectedIds : []);
        const restrict = new Set(Array.isArray(restrictIds) ? restrictIds : []);
        const issues = [];
        for (const entry of entries.values()) {
            if (restrict.size && !restrict.has(entry.id)) continue;
            if (injected.has(entry.id)) continue;
            const hit = entry.keys.find(key => key.length >= 2 && body.includes(norm(key)));
            if (hit) issues.push({ id: entry.id, name: entry.name, key: hit, kind: 'unapproved_setting_use' });
        }
        return { ok: issues.length === 0, issues };
    }

    return Object.freeze({ register, clear, size, list, recall, assemble, audit });
}
