/**
 * 全局人物关系图：人物簿档案里「对他人」三元组的有向边汇总层。
 *
 * 档案里的 others 是每个人自己的视角（≤12 条、纯文本、非对称）；这里把它们收进
 * 一张跨档案的 edges 表，做三件档案层做不到的事：
 * 1. 对称校验——A 视 B 为同盟、B 却视 A 为敌对，这类单边矛盾要报出来；
 * 2. 第二跳注入——「你盟友的敌人，对你大概率也警惕」，档案层看不到别人的 others；
 * 3. 关系扩散——冷藏扫描与传闻触达沿边走一跳，不靠名字硬匹配。
 *
 * 边是有向的（A→B 与 B→A 各存一条），单边关系本身是合法信息（单恋、暗恋、
 * 单方面记仇）；只有「强绑定关系只有一边」「立场互相矛盾」才算要报的异常。
 * 脚本只做格式收纳，不判内容对错；删除人物时边要跟着清。
 */

export const RELATION_STANCES = Object.freeze(['血亲', '师徒', '同门', '同盟', '友好', '中立', '警惕', '敌对']);
/** 强绑定立场：只有一边时要报 asymmetry（血亲/师徒不该只有一方认账）。 */
const BONDS = new Set(['血亲', '师徒', '同门', '同盟', '友好']);
const HOSTILE = new Set(['敌对', '警惕']);

const NAME_MAX = 40;
const RELATION_MAX = 40;
const BASIS_MAX = 80;
const MAX_HOP_LINES = 6;
const MAX_HOP2_LINES = 4;

/** 档案「对他人」三元组是自由文本：把常见写法折成八档立场，折不出的落「中立」。 */
const STANCE_SYNONYMS = Object.freeze([
    [/血亲|亲人|父|母|兄|弟|姐|妹|子|女|兄弟|兄妹|母子|父子/, '血亲'],
    [/师徒|师父|师尊|老师|弟子|徒弟|导师/, '师徒'],
    [/同门|师兄|师姐|师弟|师妹|同僚|同乡/, '同门'],
    [/同盟|盟友|结盟|盟约|并肩|伙伴|挚友|生死之交/, '同盟'],
    [/友好|交好|亲近|朋友|好友|友善|恩人|感激/, '友好'],
    [/敌对|仇|死敌|结仇|仇敌|怨恨|敌视|死契/, '敌对'],
    [/警惕|忌惮|戒备|提防|怀疑|提防|防备|不满|冷淡/, '警惕'],
]);

function stanceOfText(...texts) {
    const haystack = texts.filter(Boolean).join(' ');
    if (!haystack) return null;
    for (const [pattern, stance] of STANCE_SYNONYMS) if (pattern.test(haystack)) return stance;
    return null;
}

function cleanName(value) {
    return typeof value === 'string' ? value.trim().slice(0, NAME_MAX).replace(/^[\s【\[「『(（]+|[\s】\]」』)）]+$/g, '') : '';
}

function cleanText(value, limit) {
    return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function edgeKey(from, to) {
    return `${from.toLowerCase()}\u0000${to.toLowerCase()}`;
}

/** 收一条边：from/to 必须有且不能自指；立场不在表里就沿用旧值或落「中立」。 */
function normalizeEdge(raw, previous = null) {
    const from = cleanName(raw?.from ?? raw?.who ?? raw?.姓名);
    const to = cleanName(raw?.to ?? raw?.对方 ?? raw?.target);
    if (!from || !to) return null;
    if (from.toLowerCase() === to.toLowerCase()) return null;
    const relation = cleanText(raw?.relation ?? raw?.关系, RELATION_MAX);
    const attitude = cleanText(raw?.attitude ?? raw?.态度, 80);
    const stanceInput = cleanText(raw?.stance ?? raw?.立场, 12);
    const stance = RELATION_STANCES.includes(stanceInput) ? stanceInput
        : stanceOfText(relation, attitude)
            ?? (previous?.stance && previous.from === from && previous.to === to ? previous.stance : '中立');
    const basis = cleanText(raw?.basis ?? raw?.依据, BASIS_MAX);
    const dayRaw = Number(raw?.day);
    const day = Number.isInteger(dayRaw) && dayRaw >= 1 && dayRaw <= 99999 ? dayRaw : (previous?.day ?? null);
    const floorRaw = Number(raw?.floor);
    const floor = Number.isInteger(floorRaw) && floorRaw >= 0 ? floorRaw : (previous?.floor ?? null);
    return { from, to, relation: relation || previous?.relation || '', stance, basis: basis || previous?.basis || '', day, floor };
}

export function createNpcRelations({ maxEdges = 240, now = () => new Date().toISOString() } = {}) {
    if (!Number.isInteger(maxEdges) || maxEdges < 1) throw new RangeError('maxEdges 必须是正整数');
    const edges = new Map();
    let changes = 0;
    const stamp = () => {
        const value = now();
        return value instanceof Date ? value.toISOString() : String(value);
    };

    /** 批量收边：认得的 upsert，认不得的逐条拒绝；同一批里重复边后写的赢。 */
    function upsert(input) {
        const list = Array.isArray(input) ? input : [input];
        const result = { status: 'applied', applied: [], rejected: [] };
        for (const raw of list) {
            const key = edgeKey(cleanName(raw?.from ?? raw?.who ?? raw?.姓名), cleanName(raw?.to ?? raw?.对方 ?? raw?.target));
            const previous = edges.get(key) ?? null;
            const edge = normalizeEdge(raw, previous);
            if (!edge) { result.rejected.push({ ...(raw && typeof raw === 'object' ? raw : {}), reason: 'invalid_edge' }); continue; }
            const key2 = edgeKey(edge.from, edge.to);
            const next = { ...edge, version: (previous?.version ?? 0) + 1, updatedAt: stamp() };
            if (!previous && edges.size >= maxEdges) { result.rejected.push({ from: edge.from, to: edge.to, reason: 'relations_full' }); continue; }
            edges.set(key2, next);
            changes += 1;
            result.applied.push({ from: next.from, to: next.to, relation: next.relation, stance: next.stance });
        }
        if (!result.applied.length && result.rejected.length) result.status = 'rejected';
        return result;
    }

    function remove(name) {
        const clean = cleanName(name).toLowerCase();
        if (!clean) return { status: 'skipped', removed: 0 };
        let removed = 0;
        for (const [key, edge] of [...edges]) {
            if (edge.from.toLowerCase() === clean || edge.to.toLowerCase() === clean) {
                edges.delete(key);
                removed += 1;
            }
        }
        if (removed) changes += 1;
        return { status: removed ? 'removed' : 'not_found', removed };
    }

    function removeEdge(from, to) {
        const key = edgeKey(cleanName(from), cleanName(to));
        if (!edges.has(key)) return { status: 'not_found' };
        edges.delete(key);
        changes += 1;
        return { status: 'removed' };
    }

    function list() {
        return [...edges.values()]
            .sort((a, b) => (b.day ?? 0) - (a.day ?? 0) || a.from.localeCompare(b.from, 'zh') || a.to.localeCompare(b.to, 'zh'))
            .map(edge => structuredClone(edge));
    }

    /** 与某人有关的所有边（出向+入向）。 */
    function forPerson(name) {
        const clean = cleanName(name).toLowerCase();
        if (!clean) return [];
        return list().filter(edge => edge.from.toLowerCase() === clean || edge.to.toLowerCase() === clean);
    }

    /** 两个人之间的边：两个方向都查，标 direction。 */
    function between(a, b) {
        const left = cleanName(a).toLowerCase();
        const right = cleanName(b).toLowerCase();
        if (!left || !right) return [];
        return list().filter(edge => {
            const from = edge.from.toLowerCase();
            const to = edge.to.toLowerCase();
            return (from === left && to === right) || (from === right && to === left);
        }).map(edge => ({ ...edge, direction: edge.from.toLowerCase() === left ? 'outbound' : 'inbound' }));
    }

    /** 给一串种子人物（本楼在场/注入名单），返回一跳与二跳关系链的行文本。 */
    function hopLines(names, { hop1 = MAX_HOP_LINES, hop2 = MAX_HOP2_LINES } = {}) {
        const seeds = (Array.isArray(names) ? names : [names]).map(cleanName).filter(Boolean);
        if (!seeds.length) return [];
        const lowerSeeds = new Set(seeds.map(name => name.toLowerCase()));
        const byName = new Map();
        for (const edge of edges.values()) {
            if (!byName.has(edge.from.toLowerCase())) byName.set(edge.from.toLowerCase(), []);
            if (!byName.has(edge.to.toLowerCase())) byName.set(edge.to.toLowerCase(), []);
            byName.get(edge.from.toLowerCase()).push(edge);
            byName.get(edge.to.toLowerCase()).push(edge);
        }
        const edgeLine = edge => `${edge.from}—${edge.stance}${edge.relation ? `（${edge.relation}）` : ''}—${edge.to}`;
        const lines = [];
        const seenEdge = new Set();
        // 一跳：种子自己的边，两边都可能挂在种子上。
        const first = [];
        for (const seed of seeds) {
            for (const edge of byName.get(seed.toLowerCase()) ?? []) {
                const key = edgeKey(edge.from, edge.to);
                if (seenEdge.has(key)) continue;
                seenEdge.add(key);
                first.push(edge);
            }
        }
        lines.push(...first.slice(0, hop1).map(edgeLine));
        // 二跳：种子的邻居的边（邻居不是种子才往下走），只挑有立场的，防噪声。
        const second = [];
        const neighbors = new Map();
        for (const edge of first) {
            const out = lowerSeeds.has(edge.from.toLowerCase()) ? edge.to : edge.from;
            if (!lowerSeeds.has(out.toLowerCase())) neighbors.set(out.toLowerCase(), out);
        }
        for (const neighbor of neighbors.values()) {
            for (const edge of byName.get(neighbor.toLowerCase()) ?? []) {
                if (second.length >= hop2) break;
                const key = edgeKey(edge.from, edge.to);
                if (seenEdge.has(key)) continue;
                if (lowerSeeds.has(edge.from.toLowerCase()) || lowerSeeds.has(edge.to.toLowerCase())) continue;
                seenEdge.add(key);
                second.push(`${edgeLine(edge)}【${neighbor}的关系】`);
            }
        }
        lines.push(...second);
        return lines;
    }

    /** 对称体检：强绑定只有一边、或两边立场互相矛盾，都列出来给人看。 */
    function asymmetries() {
        const problems = [];
        const seen = new Set();
        for (const edge of edges.values()) {
            const key = edgeKey(edge.from, edge.to);
            if (seen.has(key)) continue;
            seen.add(key);
            const reverse = edges.get(edgeKey(edge.to, edge.from)) ?? null;
            if (BONDS.has(edge.stance) && !reverse) {
                problems.push({ type: 'one_sided_bond', edge: structuredClone(edge), reverse: null, note: `${edge.from} 视 ${edge.to} 为${edge.stance}，对方档案里没有对应记录` });
                continue;
            }
            if (!reverse) continue;
            seen.add(edgeKey(reverse.from, reverse.to));
            const conflict = (BONDS.has(edge.stance) && HOSTILE.has(reverse.stance)) || (HOSTILE.has(edge.stance) && BONDS.has(reverse.stance));
            if (conflict) {
                problems.push({ type: 'stance_conflict', edge: structuredClone(edge), reverse: structuredClone(reverse), note: `${edge.from}→${edge.to} 是${edge.stance}，${edge.to}→${edge.from} 却是${reverse.stance}` });
            }
        }
        return problems;
    }

    function status() {
        return { total: edges.size, changes, problems: asymmetries().length };
    }

    function snapshot() {
        return structuredClone({ version: 1, savedAt: stamp(), edges: [...edges.values()], changes });
    }

    function restore(raw) {
        edges.clear();
        let skipped = 0;
        const source = raw && typeof raw === 'object' ? raw : {};
        for (const item of Array.isArray(source.edges) ? source.edges : []) {
            const edge = normalizeEdge(item, null);
            if (!edge) { skipped += 1; continue; }
            if (edges.size >= maxEdges) { skipped += 1; continue; }
            const key = edgeKey(edge.from, edge.to);
            edges.set(key, { ...edge, version: Number.isInteger(item?.version) && item.version > 0 ? item.version : 1, updatedAt: cleanText(item?.updatedAt, 32) || stamp() });
        }
        changes = Number.isSafeInteger(source.changes) && source.changes >= 0 ? source.changes : 0;
        return { status: 'restored', total: edges.size, skipped };
    }

    function clear() {
        edges.clear();
        changes += 1;
        return { status: 'cleared' };
    }

    return Object.freeze({ upsert, remove, removeEdge, list, forPerson, between, hopLines, asymmetries, status, snapshot, restore, clear });
}
