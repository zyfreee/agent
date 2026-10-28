import { VOLUME_INDEX } from './volume-index.generated.js';

const MAX_ENTRIES = 4000;
const CATALOG_SUMMARY_CHARS = 30;
const TOKEN_MIN = 2;

/**
 * 尾部括号配对。世界书 comment 有嵌套写法：
 *   美杜莎女王（彩鳞）（人物-美杜莎女王（彩鳞））
 *   别离小医仙，黑岩城立名（故事线-042）
 * 用正则截取会漏掉嵌套那 46 条，必须从右往左数括号深度。
 */
export function parseComment(comment) {
    const text = typeof comment === 'string' ? comment.trim() : '';
    const end = text.lastIndexOf('）');
    if (end < 0) return null;
    let depth = 0;
    for (let i = end; i >= 0; i -= 1) {
        if (text[i] === '）') depth += 1;
        else if (text[i] === '（') {
            depth -= 1;
            if (depth === 0) {
                const inner = text.slice(i + 1, end);
                const dash = inner.indexOf('-');
                if (dash < 0) return null;
                const rawName = inner.slice(dash + 1).trim();
                const isSeq = /^\d+$/.test(rawName);
                return {
                    outer: text.slice(0, i).trim(),
                    category: inner.slice(0, dash).trim() || '未分类',
                    // 故事线是「标题（故事线-042）」，破折号后是序号；其余是「题名（类别-名字）」。
                    name: isSeq ? text.slice(0, i).trim() : rawName,
                    seq: isSeq ? Number(rawName) : null,
                };
            }
        }
    }
    return null;
}

function tokenize(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return [];
    const pieces = new Set([text]);
    for (const part of text.split(/[·・\/|、,，;；\s]+/u)) {
        const clean = part.trim();
        if (clean.length >= TOKEN_MIN) pieces.add(clean);
    }
    // 中文名常被缩写到两三个字（青莲地 → 青莲 / 青莲地），只对足够长的名字派生。
    for (const piece of [...pieces]) {
        const plain = piece.replace(/[（(][^（()）]*[)）]/gu, '').trim();
        if (plain.length >= 4) {
            pieces.add(plain.slice(0, 2));
            pieces.add(plain.slice(0, 3));
        }
    }
    return [...pieces];
}

const SUMMARY_LABEL = /^(原著范围|承接|前情|接续|上一条|下一条|涉及|备注|来源|正文|简介|概况|介绍|作用|用途|外貌|性格|背景|来历|身份|特点|规则|构成|基本信息|外形|实力|基本原理|体系构成|效果|限制|代价|等级|关系|认知与秘密|现状|图谋|能力|组织构成|宗旨与作风|对外关系|实力与根基|重要历史|重要经历|内部生活|环境与风貌|内部布局|当地生活|特色与资源|出入与危险|学习与成长|实际表现|限制与例外|新增|使用与限制|代价与限制|获取|使用方法)[：:]\s*/u;
const SUMMARY_META_ONLY = new Set(['原著范围', '前情', '备注', '来源', '上一条', '下一条', '涉及']);

/**
 * 目录里那一列只显示 30 字，所以先按行剥标签再拼，不能先合并空白——
 * 一旦合并，`[^。！？\n]*` 会跨过整条正文，把 34 条只有一句长话的条目吃成空摘要。
 */
function summarize(content) {
    if (typeof content !== 'string' || !content.trim()) return '';
    const kept = [];
    for (const raw of content.split('\n')) {
        let line = raw.trim();
        if (!line) continue;
        // 标题和正文可能在同一行：「【物品：青莲地心火】简介：…」
        line = line.replace(/^【[^】]{0,40}】\s*/u, '').trim();
        if (!line) continue;
        const label = SUMMARY_LABEL.exec(line);
        if (label) {
            if (SUMMARY_META_ONLY.has(label[1])) continue;
            line = line.slice(label[0].length).trim();
            if (!line) continue;
        }
        kept.push(line);
    }
    const text = kept.join(' ').replace(/\s+/gu, ' ').trim();
    if (!text) return '';
    // 目录只要一句，够模型认出这条是什么就行。
    const firstSentence = /^([^。！？]{4,})/u.exec(text);
    // 摘要不设字数上限：取条目自己的第一句，模型按原句判断这条是什么。
    return firstSentence ? firstSentence[1] : text;
}

function phaseFromContent(content) {
    if (typeof content !== 'string') return null;
    const hit = /卷\s*0*([0-9]{1,2})/u.exec(content);
    if (!hit) return null;
    const volume = Number(hit[1]);
    return Number.isInteger(volume) && volume >= 1 && volume <= 21 ? volume : null;
}

/**
 * 原著资料索引：把当前世界书变成可被脚本 O(1) 查询的六张表。
 * 索引本身不做取舍，也不猜；选条由模型给 uid，这里只负责“查得到”和“查不到”。
 */
export function createFactsIndex({ volumeIndex = VOLUME_INDEX } = {}) {
    const byUid = new Map();
    const byName = new Map();
    const byToken = new Map();
    const byCategory = new Map();
    const byVolume = new Map();
    let missingVolume = 0;
    let unparsedComment = 0;

    function addTo(map, key, value) {
        if (!map.has(key)) map.set(key, new Set());
        map.get(key).add(value);
    }

    function clear() {
        byUid.clear();
        byName.clear();
        byToken.clear();
        byCategory.clear();
        byVolume.clear();
        missingVolume = 0;
        unparsedComment = 0;
    }

    /**
     * @param book `loadWorldInfo` 的原始返回值：{ entries: { [uid]: { uid, comment, key, content, disable } } }
     */
    function load(book) {
        clear();
        const raw = book && typeof book === 'object' && book.entries && typeof book.entries === 'object'
            ? Object.values(book.entries)
            : [];
        let skipped = 0;
        for (const entry of raw.slice(0, MAX_ENTRIES)) {
            if (!entry || typeof entry !== 'object') { skipped += 1; continue; }
            const uid = Number(entry.uid);
            const content = typeof entry.content === 'string' ? entry.content.trim() : '';
            if (!Number.isInteger(uid) || !content) { skipped += 1; continue; }
            const parsed = parseComment(entry.comment);
            if (!parsed) unparsedComment += 1;
            const category = parsed?.category ?? '未分类';
            const name = parsed?.name || (typeof entry.comment === 'string' ? entry.comment.trim() : String(uid));
            // 「药尘（药老）」这种写法：外层简称与括号里的别名都要能被查到。
            const aliases = new Set();
            if (parsed?.outer && parsed.outer !== name) aliases.add(parsed.outer);
            for (const match of name.matchAll(/[（(]([^（()）]+)[)）]/gu)) {
                const alias = match[1].trim();
                if (alias) aliases.add(alias);
            }
            const aliasList = [...aliases].filter(alias => alias && alias !== name);
            const keys = Array.isArray(entry.key) ? entry.key.map(String).filter(Boolean) : [];
            // 故事线带「原著范围：卷NN」，这是作者写死的归属；卷号索引是按名字在分卷正文里
            // 匹配出来的，跨卷提及时会把一条卷 01 的剧情算到卷 01–21，所以故事线以声明为准。
            const declared = category === '故事线' ? /原著范围：\s*卷\s*0*([0-9]{1,2})/u.exec(content) : null;
            const declaredVolume = declared ? Number(declared[1]) : null;
            const fromIndex = volumeIndex?.[uid];
            let volumes = Array.isArray(fromIndex) && fromIndex.length ? [...fromIndex] : [];
            if (Number.isInteger(declaredVolume) && declaredVolume >= 1 && declaredVolume <= 21) {
                volumes = [declaredVolume];
            } else if (!volumes.length) {
                const fallback = phaseFromContent(content);
                if (fallback) volumes.push(fallback);
                else missingVolume += 1;
            }
            // 非故事线：索引可能漏掉作者声明的首卷（名字在正文写法不同），这里是并集，
            // 保证「原著范围」写到的卷一定查得到；索引多出来的卷来自真实的跨卷提及。
            if (category !== '故事线') {
                const declaredLine = /原著范围：[^\n]*/u.exec(content)?.[0] ?? '';
                const declaredVolumes = [...new Set([...declaredLine.matchAll(/卷\s*0*([0-9]{1,2})/gu)]
                    .map(match => Number(match[1]))
                    .filter(volume => Number.isInteger(volume) && volume >= 1 && volume <= 21))];
                volumes = [...new Set([...volumes, ...declaredVolumes])].sort((a, b) => a - b);
            }
            const record = Object.freeze({
                uid,
                category,
                name,
                seq: parsed?.seq ?? null,
                aliases: Object.freeze(aliasList),
                keys: Object.freeze([...new Set([...keys, name, ...aliasList])]),
                content,
                summary: summarize(content),
                volumes: Object.freeze(volumes),
                disabled: entry.disable === true,
                chars: content.length,
            });
            byUid.set(uid, record);
            for (const alias of [name, ...aliasList]) addTo(byName, alias, uid);
            for (const token of new Set([...tokenize(name), ...aliasList.flatMap(tokenize), ...keys.flatMap(tokenize)])) addTo(byToken, token, uid);
            addTo(byCategory, category, uid);
            for (const volume of volumes) addTo(byVolume, volume, uid);
        }
        return { ...stats(), skipped };
    }

    function stats() {
        const categories = {};
        for (const [category, uids] of byCategory) categories[category] = uids.size;
        const volumes = {};
        for (const [volume, uids] of byVolume) volumes[volume] = uids.size;
        const ambiguous = [...byName.entries()].filter(([, uids]) => uids.size > 1).map(([name]) => name);
        return {
            total: byUid.size,
            categories,
            volumes,
            ambiguousNames: ambiguous,
            missingVolume,
            unparsedComment,
            tokens: byToken.size,
        };
    }

    function get(uid) { return byUid.get(Number(uid)) ?? null; }
    function findByName(name) { return [...(byName.get(String(name)) ?? [])].map(get).filter(Boolean); }

    function volumesOf(uid) { return get(uid)?.volumes ?? []; }
    function categoryOf(uid) { return get(uid)?.category ?? null; }
    function entriesOfCategory(category) { return [...(byCategory.get(String(category)) ?? [])].map(get).filter(Boolean); }

    /**
     * 目录外兜底：模型给名字（或关键词），脚本只负责把可能的条目捞出来，排序与取舍都交回模型。
     * 命中优先：标题全等 = key 全等 > 标题包含 > key 互相包含。
     */
    function searchByName(terms, { limit = 12 } = {}) {
        const list = Array.isArray(terms) ? terms : [terms];
        const hits = new Map();
        for (const raw of list) {
            const term = typeof raw === 'string' ? raw.trim() : '';
            if (term.length < 2) continue;
            for (const entry of byUid.values()) {
                const keys = Array.isArray(entry.keys) ? entry.keys : [];
                let rank = 0;
                if (entry.name === term || keys.includes(term)) rank = 3;
                else if (entry.name.includes(term)) rank = 2;
                else if (keys.some(key => typeof key === 'string' && key.length >= 3 && (key.includes(term) || term.includes(key)))) rank = 1;
                if (!rank) continue;
                const previous = hits.get(entry.uid);
                if (!previous || rank > previous.rank) hits.set(entry.uid, { entry, rank });
            }
        }
        return [...hits.values()]
            .sort((left, right) => right.rank - left.rank
                || left.entry.name.length - right.entry.name.length
                || left.entry.uid - right.entry.uid)
            .slice(0, limit)
            .map(hit => hit.entry);
    }

    /**
     * 用“故事线标题原文出现在正文里”反推进度卷：标题是玩家不可能自己造的四到二十几字，误判率低。
     * 只认故事线，人物/物品名满篇都是，拿来推卷号会一直停在第一卷。
     */
    function guessVolume(text, { maxVolume = 21, minNameLength = 4 } = {}) {
        const body = typeof text === 'string' ? text : '';
        if (!body.trim()) return null;
        let guessed = null;
        for (const entry of byUid.values()) {
            if (entry.category !== '故事线' || entry.name.length < minNameLength) continue;
            if (!entry.volumes.length || !body.includes(entry.name)) continue;
            const volume = Math.min(...entry.volumes);
            if (guessed === null || volume > guessed) guessed = volume;
        }
        return guessed !== null && guessed <= maxVolume ? guessed : null;
    }

    /** 词表命中只用于“候选展示”，永远不替模型做取舍。 */
    function matchTokens(text, { limit = 40, volume = null } = {}) {
        const body = typeof text === 'string' ? text : '';
        if (!body) return [];
        const hits = new Map();
        for (const token of byToken.keys()) {
            if (!token || !body.includes(token)) continue;
            for (const uid of byToken.get(token)) {
                if (volume !== null && !volumesOf(uid).includes(volume)) continue;
                const current = hits.get(uid) ?? { uid, tokens: [] };
                current.tokens.push(token);
                hits.set(uid, current);
            }
        }
        return [...hits.values()]
            .sort((a, b) => b.tokens.length - a.tokens.length || a.uid - b.uid)
            .slice(0, Math.max(1, limit));
    }

    /**
     * 一卷的目录行：uid|类别|标题|摘要。模型只在这张表里点名，脚本按 uid 取正文。
     * 卷号不存在时返回空数组，由调用方决定降级到别的取法，不在这里猜。
     * 实测最大一卷 146 条，默认上限 200，避免静默截断。
     */
    function catalog(volume, { limit = 200 } = {}) {
        const ids = byVolume.get(Number(volume));
        if (!ids) return [];
        return [...ids]
            .sort((a, b) => a - b)
            .slice(0, Math.max(1, limit))
            .map(get)
            .filter(Boolean)
            .map(entry => `${entry.uid}|${entry.category}|${entry.name}|${entry.summary}`);
    }

    /** 全量目录只给“卷号未知”的降级路径用，调用方必须自己控预算。 */
    function fullCatalog({ limit = 400 } = {}) {
        return [...byUid.keys()]
            .sort((a, b) => a - b)
            .slice(0, Math.max(1, limit))
            .map(get)
            .filter(Boolean)
            .map(entry => `${entry.uid}|${entry.category}|${entry.name}|${entry.summary}`);
    }

    /** 某卷的条目总数，用于判断目录有没有被上限截断。 */
    function volumeSize(volume) { return byVolume.get(Number(volume))?.size ?? 0; }

    /**
     * 带预算的目录：分「本卷新增」和「前情」两段。
     * - 本卷新增（该条目最早出现在这一卷）给摘要；
     * - 前情（后面几卷的续篇条目）只给标题，省一半字；
     * - 故事线条目一律只给标题，它们的摘要是剧情复述，容易把答案直接写进提示词。
     * 返回 truncated 供调用方记录，不静默丢行。
     */
    function catalogFor(volume, { maxRows = 160, maxPrev = 60, maxSummaryChars = 24 } = {}) {
        const current = Number(volume);
        const ids = byVolume.get(current);
        if (!ids) return { lines: [], firstCount: 0, prevCount: 0, truncated: false, total: 0 };
        const sorted = [...ids].sort((a, b) => a - b);
        const entries = sorted.map(get).filter(Boolean);
        const isFirst = entry => entry.volumes[0] === current;
        const first = entries.filter(isFirst);
        // 只铺“本卷新增”和“前情”；后面才第一次出现的条目一律不上目录，
        // 它们出现在本卷多半是增补/伏笔，列出来等于把剧透递到模型手里。
        // 前情上限 60 条（全书单卷实测最多 50 条），按首发卷、再按 uid 排。
        const prev = entries
            .filter(entry => !isFirst(entry) && entry.volumes[0] < current)
            .sort((left, right) => (left.volumes[0] - right.volumes[0]) || (left.uid - right.uid));
        const line = (entry, withSummary) => {
            const head = `${entry.uid}|${entry.category}|${entry.name}`;
            // 前情行标明首发卷，模型才知道它是旧内容、不是本卷新增，不会被当成剧透。
            if (!withSummary) return `${head}|卷${String(entry.volumes[0]).padStart(2, '0')} 前情`;
            // 故事线不给摘要（摘要是剧情复述），但保留第四列，模型按固定列数解析不会错位。
            if (entry.category === '故事线') return `${head}|—`;
            const summary = entry.summary;
            return `${head}|${summary}`;
        };
        const rows = [
            ...first.map(entry => line(entry, true)),
            ...prev.slice(0, maxPrev).map(entry => line(entry, false)),
        ];
        const lines = rows.slice(0, Math.max(1, maxRows));
        return {
            lines,
            firstCount: first.length,
            prevCount: Math.min(prev.length, maxPrev),
            truncated: rows.length > lines.length,
            total: entries.length,
        };
    }

    return Object.freeze({ load, clear, stats, get, findByName, searchByName, volumesOf, categoryOf, entriesOfCategory, matchTokens, catalog, fullCatalog, volumeSize, catalogFor, guessVolume });
}
