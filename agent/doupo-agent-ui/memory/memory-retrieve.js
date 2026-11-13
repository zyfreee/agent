/**
 * 记忆混合检索打分（确定性，零网络）：把 MemPalace 的 hybrid 检索思路移植到纯本地——
 * 召回钥匙命中 + 引文/标题命中 + bigram 词面包含 + 时间邻近 + 可选的向量相似度融合，
 * 合成一个分数，供召回目录排序与关键词兜底共用。
 *
 * 两条铁律：
 * - "triggered"（场景信号）与"底分"分开：只有钥匙/引文/标题/词面/向量任一命中场景才算
 *   triggered，层级与分量只是底分——兜底注入只收 triggered 条目（没勾到就不注，与旧
 *   recallHits 语义一致）；目录则全体可见（它是给召回模型看的菜单，只排先后）。
 * - superseded（软覆盖）条目整体排除：被新事实覆盖的旧账默认不进目录、不进兜底。
 */

// 打分权重：全部集中在一个常量表里，调参不用翻函数体。
const SCORE = Object.freeze({
    bigTier: 1.2,          // 大记忆底分（长期事实天然更该在场）
    majorWeight: 0.8,      // 关键分量底分
    importanceScale: 0.15, // 重要度分量：每偏离中值 5 一档（1-10 → -0.6 ~ +0.75），Generative Agents 检索三因子之一
    perKey: 2.5,           // 每个命中钥匙的加分
    keyCap: 5,             // 钥匙加分封顶
    quoteHit: 3,           // 引文原句出现在场景（逐字回响，最强的信号之一）
    titleHit: 1.5,         // 标题出现在场景
    overlapFloor: 0.55,    // bigram 词面包含率的起评线
    overlapScale: 6,       // 超出起评线部分的放大系数
    overlapCap: 2.5,       // 词面加分封顶
    temporalScale: 1.5,    // 时间邻近满分
    temporalDecayDays: 45, // 距今 45 天外时间分归零
    vectorFloor: 0.35,     // 向量相似度起评线
    vectorScale: 10,
    vectorCap: 4,
});

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

/** 一条记忆的全部召回钥匙：related + 用户补的别名，去重。 */
export function recallKeys(entry) {
    const keys = new Set();
    for (const name of [...(entry?.related ?? []), ...(entry?.aliases ?? [])]) {
        const key = text(name);
        if (key) keys.add(key);
    }
    return [...keys];
}

function bigrams(value) {
    const body = text(value).replace(/\s+/g, '');
    const set = new Set();
    for (let i = 0; i < body.length - 1; i++) set.add(body.slice(i, i + 2));
    return set;
}

/** bigram Dice 相似度：对称场景用（矛盾检测比对两段等长文本）。 */
export function textSimilarity(a, b) {
    const left = bigrams(a);
    const right = bigrams(b);
    if (!left.size || !right.size) return 0;
    let shared = 0;
    for (const gram of left) if (right.has(gram)) shared += 1;
    return (2 * shared) / (left.size + right.size);
}

/** bigram 词面包含率：短文本（记忆）被长文本（场景）改述/引用的程度。 */
function containment(entryGrams, sceneGrams) {
    if (!entryGrams.size || !sceneGrams) return 0;
    let shared = 0;
    for (const gram of entryGrams) if (sceneGrams.has(gram)) shared += 1;
    return shared / entryGrams.size;
}

function sequenceOf(id) {
    return typeof id === 'string' && /^m\d+$/.test(id) ? Number(id.slice(1)) : 0;
}

function isSuperseded(entry) {
    return Boolean(text(entry?.supersededBy));
}

/**
 * 混合打分：返回 [{ entry, score, triggered, overlap }] 按分数降序（平局 day 新→旧、编号新→旧）。
 * vectorSim 是可选注入的 Map/对象（编号 → 相似度 0~1），由调用方在向量检索可用时算好传进来。
 * advanced=false（完整版/简略版口径）：退回学这些仓库之前的旧行为——只有召回钥匙整词命中才算
 * 勾到，排序＝大记忆优先 → 关键优先 → day 新→旧（big=2/major=1 底分 + 现有平局链正好复刻旧序）；
 * 引文/标题/bigram 词面/时间邻近/重要度分量/向量全部不参与。
 */
export function scoreEntries(snapshot = {}, { sceneText = '', currentDay = null, vectorSim = null, advanced = true } = {}) {
    const scene = typeof sceneText === 'string' ? sceneText : '';
    const sceneGrams = advanced && scene ? bigrams(scene) : null;
    const day = advanced && Number.isInteger(currentDay) && currentDay > 0 ? currentDay : null;
    const vectorFor = entry => {
        if (!advanced) return 0;
        const raw = vectorSim instanceof Map ? vectorSim.get(entry.id) : vectorSim?.[entry.id];
        const value = Number(raw);
        return Number.isFinite(value) ? value : 0;
    };
    const entries = (Array.isArray(snapshot?.entries) ? snapshot.entries : []).filter(entry => entry && !isSuperseded(entry));
    const scored = [];
    for (const entry of entries) {
        const importance = advanced && Number.isFinite(Number(entry.importance)) ? Number(entry.importance) : (entry.weight === 'major' ? 7 : 5);
        let score = advanced
            ? (entry.tier === 'big' ? SCORE.bigTier : 0)
                + (entry.weight === 'major' ? SCORE.majorWeight : 0)
                + (importance - 5) * SCORE.importanceScale
            : (entry.tier === 'big' ? 2 : 0)
                + (entry.weight === 'major' ? 1 : 0);
        let triggered = false;
        const keys = recallKeys(entry).filter(key => scene.includes(key));
        if (keys.length) {
            if (advanced) score += Math.min(keys.length * SCORE.perKey, SCORE.keyCap);
            triggered = true;
        }
        const quote = text(entry.quote);
        if (advanced && quote.length >= 6 && scene.includes(quote)) {
            score += SCORE.quoteHit;
            triggered = true;
        }
        const title = text(entry.title);
        if (advanced && title.length >= 2 && scene.includes(title)) {
            score += SCORE.titleHit;
            triggered = true;
        }
        const overlap = containment(bigrams([text(entry.text), text(entry.note)].join('')), sceneGrams);
        if (advanced && overlap >= SCORE.overlapFloor) {
            score += Math.min((overlap - SCORE.overlapFloor) * SCORE.overlapScale, SCORE.overlapCap);
            triggered = true;
        }
        if (day !== null && Number.isFinite(Number(entry.day))) {
            const gap = Math.abs(day - Number(entry.day));
            if (gap < SCORE.temporalDecayDays) score += SCORE.temporalScale * (1 - gap / SCORE.temporalDecayDays);
        }
        const vector = vectorFor(entry);
        if (vector >= SCORE.vectorFloor) {
            score += Math.min((vector - SCORE.vectorFloor) * SCORE.vectorScale, SCORE.vectorCap);
            triggered = true;
        }
        scored.push({ entry, score, triggered, overlap: advanced ? Math.round(overlap * 100) / 100 : 0 });
    }
    scored.sort((a, b) => b.score - a.score
        || (Number(b.entry.day) || 0) - (Number(a.entry.day) || 0)
        || sequenceOf(b.entry.id) - sequenceOf(a.entry.id));
    return scored;
}

/**
 * 场景触发的候选条目（兜底注入与目录洪泛截断共用）：只有 triggered 的条目才算
 * "这一轮真的勾到了"，底分再高也不凑数；没有场景文本返回空。
 */
export function topCandidates(snapshot = {}, options = {}, { limit = 12 } = {}) {
    const scene = typeof options?.sceneText === 'string' ? options.sceneText : '';
    if (!scene) return [];
    const cap = Number.isInteger(limit) && limit >= 1 && limit <= 40 ? limit : 12;
    return scoreEntries(snapshot, options)
        .filter(item => item.triggered)
        .slice(0, cap)
        .map(item => item.entry);
}

/** 写入查重阈值（MemPalace check_duplicate 的 0.85-0.87 档）：共享钥匙且词面相似到这个程度的
 *  新记忆视为旧账复述，落账前直接拒绝——重复从"事后体检"变成"写入时拦住"。 */
export const DEDUP_SIMILARITY = 0.85;

/** 共钥匙的相关记忆（A-MEM 链接思路，详情跳转与查重共用）：与 entry 的召回钥匙有交集、
 *  排除自身与已覆盖条目，day 降序，limit 截断。纯函数，entries 传账本全量。 */
export function relatedMemories(entry, entries = [], { limit = 6 } = {}) {
    const keys = new Set(recallKeys(entry));
    if (!keys.size) return [];
    const id = text(entry?.id);
    const cap = Number.isInteger(limit) && limit >= 1 ? limit : 6;
    return (Array.isArray(entries) ? entries : [])
        .filter(item => item && !isSuperseded(item) && text(item.id) !== id)
        .filter(item => recallKeys(item).some(key => keys.has(key)))
        .sort((a, b) => (Number(b.day) || 0) - (Number(a.day) || 0))
        .slice(0, cap);
}
