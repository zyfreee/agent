/**
 * 标题相似度：世界影响与世界事件两本账共用的“换了说法再记一遍”判定。
 *
 * 只看“字”：去掉标点空白后按双字片段（bigram）算重合度，返回 0..1。
 * 中文没有词边界，双字片段是便宜又够用的近似；单字条目退化成按字比对。
 */

function bigrams(value) {
    const chars = [...value];
    const set = new Set();
    for (let index = 0; index + 1 < chars.length; index += 1) set.add(chars[index] + chars[index + 1]);
    if (!set.size && chars.length) set.add(chars[0]);
    return set;
}

/** 标题比对：去标点空白后按双字片段算重合度，挡住“换了说法就再记一条”。 */
export function titleSimilarity(left, right) {
    const a = bigrams(String(left).replace(/[\s\p{P}\p{S}]/gu, ''));
    const b = bigrams(String(right).replace(/[\s\p{P}\p{S}]/gu, ''));
    if (!a.size || !b.size) return 0;
    let shared = 0;
    for (const piece of a) if (b.has(piece)) shared += 1;
    return (2 * shared) / (a.size + b.size);
}

/** 判“疑似同一件事”的默认参数：几天内、相似度到多少算同一件事（与世界影响同参）。 */
export const SIMILAR_WINDOW_DAYS = 2;
export const SIMILAR_SCORE = 0.65;
