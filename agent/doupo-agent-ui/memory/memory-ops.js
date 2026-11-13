/**
 * 记忆指令通道：把"本场勾得起来的记忆"拼成给模型看的注入文本，并从模型回复里
 * 取出 ```memory 代码块解析成受控操作。
 *
 * 注入分两条路：主路由召回决定（memory-recall.js，LLM 挑选）给出条目；召回决定没跑/
 * 失败/关着时退回兜底召回——只有被场景真正勾到（钥匙/引文/标题/词面/向量任一命中）的
 * 记忆才注入，排序走 memory-retrieve.js 的混合分数（钥匙命中 → 词面包含 → 时间邻近，
 * 大记忆与关键分量作底分）。相关性判定是确定性的，不靠模型现挑。
 *
 * 约定与 world/self 一致：模型每轮最多输出一个代码块，块内每行一条 JSON 操作；
 * 脚本逐行解析，坏行跳过并记录，好行交给 memory-runtime 校验执行。
 */

import { TIER_LABELS, TAG_LABELS } from './memory-runtime.js';
import { recallKeys, textSimilarity, topCandidates } from './memory-retrieve.js';

// 召回钥匙与文本相似度工具住在 memory-retrieve.js（召回目录与兜底共用），这里转发保持旧导入路径可用。
export { recallKeys, textSimilarity };

const DEFAULT_MAX_CHARS = 900;
const RECALL_LIMIT = 12;
const DEFAULT_MAX_OPS = 8;
const CONFLICT_SIMILARITY = 0.6;
const FENCE_RE = /```memory[^\S\n]*\n([\s\S]*?)```/g;
const OP_LINE_RE = /^[ \t]*\{[ \t]*"op"[ \t]*:/;

export const MEMORY_HEADER = '【记忆存储·本场召回】以下是本场剧情勾出来的记忆（按需召回），正文不得与之矛盾。新记忆由扩展在后台自动登记，你不需要也不允许代劳；回复只写剧情本身——禁止在正文的任何位置输出指令块、JSON、代码块或数据表。';

export const MEMORY_GUIDE = [
    '【记忆指令通道】若本轮剧情里有值得记住的事，在回复的最末尾输出一个 memory 代码块，每行一条 JSON：',
    '```memory',
    '{“op”:”remember”,”title”:”穆蛇坊市勒索被赶跑”,”text”:”穆蛇在坊市拦路勒索被萧炎打跑”,”note”:”穆蛇扬言叫人来报复，坊市商户人心惶惶”,”basis”:”第 6 楼坊市冲突”,”related”:[“穆蛇”,”坊市”],”quote”:”把灵石留下，人可以走。”}',
    '```',
    '只记小记忆（remember）：轻量记录的近事杂事，weight 用 minor，不必重要才记，保持主角”记得这几天发生过什么”；title 必写——1~14 字短标题（名词短语），列表主页只显示标题，缺标题或超过 14 字的条目会被脚本整条丢弃；related 是日后召回的钥匙，必写 1-4 个人名/地名/物名。大记忆不用你登记——小记忆攒够后脚本会自动总结成大记忆。',
    'quote 可选：剧情里最有味道的一句原话（≤60字），召回时会以「」原样带回正文；没有合适的就空着，不要编造没出现过的对白。',
    '可用操作：remember(title必写≤14字短标题,text≤60字一句简明记忆,note≤200字细节补充,basis≤80字出处,related必写≤4个,quote≤60字)；forgetMemory(id)（记错删除）；supersede(id,by)（旧记忆被本轮新事明确覆盖时标记，不删除，恢复由玩家做）。id 用上面召回列表里的编号。text 只写一眼能看懂的一句话，细节、背景、后续影响写进 note；记忆不是任务：没有“了结”状态，旧事也永远保留召回权。',
    '只记玩家看得到的事（主角亲历/得知，或正文实际演到的情节），用中性记事口吻写清"谁/在哪/发生了什么"，不要写成"我"的第一人称日记；text 保持一句话的简短，长细节交给 note；必须有剧情依据（basis 写清从哪楼/谁/什么事来）；不记原著设定、不替人物簿记 NPC 档案与好感、不记该归纳戒目标或世界任务的事；没有新记忆就完全不要输出这个区块。',
].join('\n');

function clampInt(value, min, max, fallback) {
    const num = Number(value);
    return Number.isInteger(num) && num >= min && num <= max ? num : fallback;
}

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * 兜底召回：场景信号触发的记忆按混合分数排序（memory-retrieve.scoreEntries）。
 * 主召回路是 memory-recall.js 的召回决定，这里只在召回决定没跑/失败/关着时兜底；
 * 向量相似度（vectorSim）与当前天数（currentDay）由调用方可选传入。
 * advanced=false（完整版/简略版口径）退回旧行为：召回钥匙整词命中才算，大记忆优先 → 关键优先 → 新的优先。
 */
export function recallHits(snapshot = {}, { sceneText = '', limit = RECALL_LIMIT, currentDay = null, vectorSim = null, advanced = true } = {}) {
    return topCandidates(snapshot, { sceneText, currentDay, vectorSim, advanced }, { limit: clampInt(limit, 1, 40, RECALL_LIMIT) });
}

function entryLine(entry) {
    const mark = entry.weight === 'major' ? '★' : '·';
    const tier = TIER_LABELS[entry.tier] ?? '记忆';
    const tag = entry.tag && TAG_LABELS[entry.tag] ? `[${TAG_LABELS[entry.tag]}]` : '';
    const superseded = text(entry.supersededBy) ? `（已替代→${text(entry.supersededBy)}）` : '';
    const quote = text(entry.quote) ? `「${text(entry.quote)}」` : '';
    const related = recallKeys(entry).length ? `（关联：${recallKeys(entry).join('、')}）` : '';
    const basis = text(entry.basis) ? `（依据：${text(entry.basis)}）` : '';
    const note = text(entry.note) ? `（细节：${text(entry.note)}）` : '';
    return `${mark}(${entry.id} 第${entry.day}天)[${tier}]${tag}${superseded} ${entry.text}${note}${quote}${related}${basis}`;
}

/**
 * 显式条目渲染：抬头/结尾也计入预算，只接受完整条目，并返回实际使用的条目与编号。
 * 单条超预算则跳过，继续尝试后面的较短条目；没有完整条目时不输出空抬头。
 */
export function renderMemoryEntriesDetail(entries = [], { maxChars = DEFAULT_MAX_CHARS, prefix = '', suffix = '' } = {}) {
    const cap = Number.isSafeInteger(maxChars) && maxChars >= 0 ? maxChars : DEFAULT_MAX_CHARS;
    prefix = typeof prefix === 'string' ? prefix : '';
    suffix = typeof suffix === 'string' ? suffix : '';
    const picked = [];
    const lines = [];
    let used = prefix.length + suffix.length;
    for (const entry of Array.isArray(entries) ? entries : []) {
        if (!entry) continue;
        const line = entryLine(entry);
        const cost = line.length + (lines.length ? 1 : 0);
        if (used + cost > cap) continue;
        picked.push(entry);
        lines.push(line);
        used += cost;
    }
    return { text: picked.length ? prefix + lines.join('\n') + suffix : '', entries: picked, usedIds: picked.map(entry => entry.id) };
}

/** 兼容原调用方：只返回注入正文字符串。 */
export function renderMemoryEntries(entries = [], options = {}) {
    return renderMemoryEntriesDetail(entries, options).text;
}

/**
 * 关键词兜底注入：recallHits 命中列表渲染成注入正文。
 * sceneText 用最近几楼正文（调用方拼好传入）；没传或全不命中 → 返回空串（本轮不注记忆）。
 */
export function buildMemoryInjection(snapshot = {}, { maxChars = DEFAULT_MAX_CHARS, sceneText = '' } = {}) {
    return renderMemoryEntries(recallHits(snapshot, { sceneText }), { maxChars });
}

// ---------- 矛盾提醒：同钥匙 + 文本高相似（确定性 bigram Dice，不调模型） ----------

/**
 * 在记忆里找疑似重复/矛盾对：共享至少一个召回钥匙，且内容 bigram 相似度达标。
 * 返回 [{ a, b, similarity }]，a.id < b.id；只提醒不拦账，由书记官/玩家自己定夺。
 * 已被软覆盖（supersededBy）的旧账不再参与矛盾提醒——它已经被承认过时了。
 */
export function findMemoryConflicts(entries = [], { threshold = CONFLICT_SIMILARITY } = {}) {
    const open = (Array.isArray(entries) ? entries : []).filter(entry => entry && !text(entry.supersededBy));
    const conflicts = [];
    for (let i = 0; i < open.length; i++) {
        for (let j = i + 1; j < open.length; j++) {
            const a = open[i];
            const b = open[j];
            if (a.tier === b.tier && a.id === b.id) continue;
            const sharedKey = recallKeys(a).some(key => recallKeys(b).includes(key));
            if (!sharedKey) continue;
            const score = textSimilarity(a.text, b.text);
            if (score >= clampInt(threshold * 100, 10, 99, 60) / 100) {
                conflicts.push({ a: a.id, b: b.id, similarity: Math.round(score * 100) / 100 });
            }
        }
    }
    return conflicts;
}

/** 从回复里找 memory 指令块；找不到 fenced 块时容忍裸行（部分模型不吃代码块语法）。 */
export function extractOpsBlock(reply) {
    const source = typeof reply === 'string' ? reply : '';
    if (!source) return null;
    const fenced = [...source.matchAll(FENCE_RE)];
    if (fenced.length) {
        const body = fenced.at(-1)[1];
        return { raw: body, fenced: true, count: fenced.length };
    }
    const lines = source.split('\n');
    let best = [];
    let current = [];
    for (const line of lines) {
        if (OP_LINE_RE.test(line)) { current.push(line.trim()); continue; }
        if (current.length > best.length) best = current;
        current = [];
    }
    if (current.length > best.length) best = current;
    return best.length ? { raw: best.join('\n'), fenced: false, count: 1 } : null;
}

/** 逐行解析指令块：好行进 ops，坏行进 parseErrors，不因一行坏账整块作废。 */
export function parseOps(raw, { maxOps = DEFAULT_MAX_OPS } = {}) {
    const cap = clampInt(maxOps, 1, 32, DEFAULT_MAX_OPS);
    const lines = typeof raw === 'string' ? raw.split('\n') : [];
    const ops = [];
    const parseErrors = [];
    lines.forEach((line, index) => {
        const body = line.trim();
        if (!body || body.startsWith('```')) return;
        try {
            const parsed = JSON.parse(body);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.op === 'string' && parsed.op.trim()) {
                if (ops.length < cap) ops.push(parsed);
            } else {
                parseErrors.push({ line: index + 1, reason: 'not_an_op' });
            }
        } catch (error) {
            parseErrors.push({ line: index + 1, reason: String(error?.message ?? error) });
        }
    });
    return { ops, parseErrors };
}

/** 把指令块从楼层正文里剥掉，玩家只看到干净的剧情。 */
export function stripOpsBlock(reply) {
    const source = typeof reply === 'string' ? reply : '';
    if (!source) return source;
    let cleaned = source.replace(FENCE_RE, '').replace(/\n{3,}/g, '\n\n');
    const kept = [];
    for (const line of cleaned.split('\n')) {
        if (OP_LINE_RE.test(line)) continue;
        kept.push(line);
    }
    cleaned = kept.join('\n').replace(/[ \t]+$/u, '').replace(/\n{3,}/g, '\n\n');
    return cleaned.trim() === '' ? source : cleaned.trimEnd();
}
