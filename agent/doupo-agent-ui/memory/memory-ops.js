/**
 * 记忆指令通道：把"本场勾得起来的记忆"拼成给模型看的注入文本，并从模型回复里
 * 取出 ```memory 代码块解析成受控操作。
 *
 * 注入是纯按需召回：记忆永久保存在账里，只有召回钥匙（related + 别名 aliases）出现在
 * 最近剧情里才会被召回——排序 = 大记忆优先 → 关键优先 → 强度优先（被想起过几次、
 * 最近一次何时）→ 新的优先；命中列表由调用方交给 runtime.markRecalled 记强度（排练效应）。
 * 相关性判定是确定性的整词匹配（sceneText 含钥匙项），不靠模型现挑。
 *
 * 约定与 world/self 一致：模型每轮最多输出一个代码块，块内每行一条 JSON 操作；
 * 脚本逐行解析，坏行跳过并记录，好行交给 memory-runtime 校验执行。
 */

import { TIER_LABELS, TAG_LABELS } from './memory-runtime.js';

const DEFAULT_MAX_CHARS = 900;
const RECALL_LIMIT = 12;
const DEFAULT_MAX_OPS = 8;
const CONFLICT_SIMILARITY = 0.6;
const FENCE_RE = /```memory[^\S\n]*\n([\s\S]*?)```/g;
const OP_LINE_RE = /^[ \t]*\{[ \t]*"op"[ \t]*:/;

export const MEMORY_HEADER = '【主角记忆·本场召回】以下是本场剧情勾出来的主角记忆（按需召回），正文不得与之矛盾；新记忆靠文末 memory 指令登记。';

export const MEMORY_GUIDE = [
    '【记忆指令通道】若本轮剧情让主角"记下了一件值得记住的事"或"了结了一件旧事"，在回复的最末尾输出一个 memory 代码块，每行一条 JSON：',
    '```memory',
    '{"op":"remember","text":"穆蛇在坊市拦路勒索被萧炎打跑","basis":"第 6 楼坊市冲突","related":["穆蛇","坊市"],"quote":"把灵石留下，人可以走。"}',
    '{"op":"memorize","text":"欠药老一条命","basis":"第 3 楼药老出手相救","related":["药老"],"weight":"major","tag":"grudge","quote":"这条命，是老夫捡回来的。"}',
    '```',
    '两层记忆都永久保存、按需召回（related 是日后召回的钥匙，必写 1-4 个人名/地名/物名）：remember=小记忆（轻量记录的近事杂事，weight 用 minor）；memorize=大记忆（值得一直记住的事，weight 用 major，tag 可选：grudge恩怨/intel情报/thread伏笔/milestone大事，拿不准就空着）；promote(id)=小记忆分量够重了，转成大记忆（召回时优先）。',
    'quote 可选：剧情里最有味道的一句原话（≤60字），召回时会以「」原样带回正文；没有合适的就空着，不要编造没出现过的对白。',
    '可用操作：remember(text≤300字,basis≤80字,related必写≤4个,quote≤60字)；memorize(text≤300字,basis必写,related必写≤4个,weight:major|minor,tag,quote≤60字)；promote(id)；resolveMemory(id,note≤120字)（报仇了/报恩了/情报过时/伏笔回收）；reopenMemory(id)；forgetMemory(id)（记错删除）。id 用上面召回列表里的编号。',
    '只记"主角亲身经历或得知"的事，且必须有剧情依据（basis 写清从哪楼/谁/什么事来）；不记原著设定、不替人物簿记 NPC 档案与好感、不记该归纳戒目标或世界任务的事；没有新记忆就完全不要输出这个区块。',
].join('\n');

function clampInt(value, min, max, fallback) {
    const num = Number(value);
    return Number.isInteger(num) && num >= min && num <= max ? num : fallback;
}

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

/**
 * 按需召回：related/aliases 整词命中 sceneText 的未了结记忆，按强度排序。
 * 排序 = 大记忆优先 → 关键优先 → 被想起过的优先（recallCount）→ 最近想起的优先 → 新的优先。
 */
export function recallHits(snapshot = {}, { sceneText = '', limit = RECALL_LIMIT } = {}) {
    const scene = typeof sceneText === 'string' ? sceneText : '';
    if (!scene) return [];
    const hits = (Array.isArray(snapshot.entries) ? snapshot.entries : [])
        .filter(entry => entry?.done !== true)
        .filter(entry => recallKeys(entry).some(key => scene.includes(key)));
    const byRecall = (a, b) => (b.tier === 'big') - (a.tier === 'big')
        || (b.weight === 'major') - (a.weight === 'major')
        || (clampInt(b.recallCount, 0, 9999, 0) - clampInt(a.recallCount, 0, 9999, 0))
        || (clampInt(b.lastRecallDay, 1, 99999, 0) - clampInt(a.lastRecallDay, 1, 99999, 0))
        || b.day - a.day;
    return [...hits].sort(byRecall).slice(0, clampInt(limit, 1, 40, RECALL_LIMIT));
}

function entryLine(entry) {
    const mark = entry.weight === 'major' ? '★' : '·';
    const tier = TIER_LABELS[entry.tier] ?? '记忆';
    const tag = entry.tag && TAG_LABELS[entry.tag] ? `[${TAG_LABELS[entry.tag]}]` : '';
    const quote = text(entry.quote) ? `「${text(entry.quote)}」` : '';
    const related = recallKeys(entry).length ? `（关联：${recallKeys(entry).join('、')}）` : '';
    const basis = text(entry.basis) ? `（依据：${text(entry.basis)}）` : '';
    return `${mark}(${entry.id} 第${entry.day}天)[${tier}]${tag} ${entry.text}${quote}${related}${basis}`;
}

/**
 * 按需召回注入：召回列表渲染成注入正文；超预算从尾部丢。
 * sceneText 用最近几楼正文（调用方拼好传入）；没传或全不命中 → 返回空串（本轮不注记忆）。
 */
export function buildMemoryInjection(snapshot = {}, { maxChars = DEFAULT_MAX_CHARS, sceneText = '' } = {}) {
    const cap = clampInt(maxChars, 200, 4000, DEFAULT_MAX_CHARS);
    const picked = recallHits(snapshot, { sceneText });
    if (!picked.length) return '';
    let textOut = picked.map(entryLine).join('\n');
    while (textOut.length > cap && picked.length > 1) {
        picked.pop();
        textOut = picked.map(entryLine).join('\n');
    }
    return textOut;
}

// ---------- 矛盾提醒：同钥匙 + 文本高相似（确定性 bigram Dice，不调模型） ----------

function bigrams(value) {
    const body = text(value).replace(/\s+/g, '');
    const set = new Set();
    for (let i = 0; i < body.length - 1; i++) set.add(body.slice(i, i + 2));
    return set;
}

function similarity(a, b) {
    const left = bigrams(a);
    const right = bigrams(b);
    if (!left.size || !right.size) return 0;
    let shared = 0;
    for (const gram of left) if (right.has(gram)) shared += 1;
    return (2 * shared) / (left.size + right.size);
}

/**
 * 在未了结记忆里找疑似重复/矛盾对：共享至少一个召回钥匙，且内容 bigram 相似度达标。
 * 返回 [{ a, b, similarity }]，a.id < b.id；只提醒不拦账，由书记官/玩家自己定夺。
 */
export function findMemoryConflicts(entries = [], { threshold = CONFLICT_SIMILARITY } = {}) {
    const open = (Array.isArray(entries) ? entries : []).filter(entry => entry?.done !== true);
    const conflicts = [];
    for (let i = 0; i < open.length; i++) {
        for (let j = i + 1; j < open.length; j++) {
            const a = open[i];
            const b = open[j];
            if (a.tier === b.tier && a.id === b.id) continue;
            const sharedKey = recallKeys(a).some(key => recallKeys(b).includes(key));
            if (!sharedKey) continue;
            const score = similarity(a.text, b.text);
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
