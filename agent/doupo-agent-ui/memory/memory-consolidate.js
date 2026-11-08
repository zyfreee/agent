/**
 * 记忆总结：小记忆攒够阈值后的独立小调用。
 * 读一批小记忆 → 提炼成一条大记忆 → 被并入的小记忆整批退役（runtime.consolidate 落账）。
 * 这里只管"怎么问"和"怎么把回答变成一条大记忆草稿"；合并取舍交给模型，
 * 校验与落账在 memory-runtime.consolidate，一条不合法就整体不落账（宁可不并，不留半截）。
 */

import { extractJson } from '../host/llm-client.js';
import { TIER_LABELS } from './memory-runtime.js';

/** 默认总结提示词（system）。改写时保持"只输出 JSON"与字段名不变，否则解析不到。 */
export const MEMORY_CONSOLIDATE_PROMPT = [
    '你是这部小说的「传记整理人」。记忆库里攒了一批小记忆（轻量近事），现在要把它们提炼成一条大记忆：合并重复、归并同一件事的多次进展、保留时间顺序和关键转折，让这一条大记忆能替代这批小记忆长期保存。',
    '只输出一个 JSON 对象：{"title":"…","text":"…","basis":"…","related":[…],"aliases":[…],"quote":"…","weight":"major|minor","tag":""}。不要输出解释、标题或代码块以外的文字。各字段不限字数、不限条数。',
    '【规矩】',
    '1. title 必写：4~14 字短标题（名词短语，概括这批小记忆合成的这件大事，如「黑土坊交割首胜」）。记忆列表主页面只显示标题。',
    '2. text ≤300 字：一段话说清"发生了什么、为什么值得长期记住"；关键人名、地名、恩怨对象与结果必须保留，不许丢。',
    '3. related 必写：把钥匙总结一遍——从这批小记忆的关联/别名里挑日后召回价值最高的钥匙（反复出现的人名/地名优先），按重要度从高到低排，数量不限。',
    '4. aliases：没写进 related 的其余钥匙原样放这里，召回时与 related 同权；脚本会把这批小记忆的全部钥匙并集兜底收进来，一条不丢。',
    '5. basis ≤80 字：写清"由哪些天的小记忆总结而来"。',
    '6. quote 可选（≤60 字）：这批记忆里最有味道的一句原话，只准摘小记忆引文里真实出现过的对白，没有就空着。',
    '7. weight：这批事够得上值得长期记住的大事就 major，只是一段有内容的经历就 minor。',
    '8. tag 可选：grudge恩怨/intel情报/thread伏笔/milestone大事记，拿不准就空着。',
    '9. 不许发明小记忆里没有的事；合并时以更晚的发展为准，但不要丢掉恩怨的起点。',
    '只输出 JSON。',
].join('\n');

/** 给酒馆 generateQuietPrompt 的结构化输出约束；解析端并不依赖它，只是提高严格度。 */
export const MEMORY_CONSOLIDATE_JSON_SCHEMA = Object.freeze({
    type: 'object',
    properties: {
        title: { type: 'string', minLength: 1, maxLength: 14, pattern: '\\S' },
        text: { type: 'string' },
        basis: { type: 'string' },
        related: { type: 'array', items: { type: 'string' } },
        aliases: { type: 'array', items: { type: 'string' } },
        quote: { type: 'string' },
        weight: { type: 'string', enum: ['major', 'minor'] },
        tag: { type: 'string', enum: ['grudge', 'intel', 'thread', 'milestone'] },
    },
    required: ['title', 'text'],
});

/** 组装发给模型的 user 内容：待总结的小记忆清单（带召回钥匙与引文）+ 世界天数。 */
export function buildConsolidateUser({ entries = [], day = null } = {}) {
    const blocks = [];
    const lines = (Array.isArray(entries) ? entries : []).map((entry, index) => {
        const tier = TIER_LABELS[entry?.tier] ?? '记忆';
        const quote = typeof entry?.quote === 'string' && entry.quote.trim() ? `「${entry.quote.trim()}」` : '';
        const keys = [...(Array.isArray(entry?.related) ? entry.related : []), ...(Array.isArray(entry?.aliases) ? entry.aliases : [])]
            .filter(key => typeof key === 'string' && key.trim());
        const basis = typeof entry?.basis === 'string' && entry.basis.trim() ? `（依据：${entry.basis.trim()}）` : '';
        const title = typeof entry?.title === 'string' && entry.title.trim() ? `（标题：${entry.title.trim()}）` : '';
        const note = typeof entry?.note === 'string' && entry.note.trim() ? `（细节：${entry.note.trim()}）` : '';
        const dayText = Number.isFinite(Number(entry?.day)) ? `第${Number(entry.day)}天` : '第?天';
        return `${index + 1}. ${entry?.id ?? '?'}（${dayText}）[${tier}] ${typeof entry?.text === 'string' ? entry.text.trim() : ''}${quote}${keys.length ? ` 关联：${keys.join('、')}` : ''}${basis}${title}${note}`;
    });
    blocks.push(lines.length ? `【待总结的小记忆】\n${lines.join('\n')}` : '【待总结的小记忆】\n（空的，没有可总结的小记忆）');
    if (Number.isFinite(Number(day))) blocks.push(`【世界时间】第 ${Number(day)} 天`);
    blocks.push('请把它们提炼成一条大记忆，只输出 JSON：{"title":"…","text":"…","basis":"…","related":[…],"aliases":[…],"quote":"…","weight":"major|minor","tag":""}。');
    return blocks.join('\n\n');
}

const VALID_TAGS = new Set(['grudge', 'intel', 'thread', 'milestone']);

/**
 * 解析总结回答：抽出一条大记忆草稿。related 缺钥匙不打回——
 * runtime.consolidate 会拿这批小记忆的全部钥匙兜底。
 */
export function parseConsolidation(raw) {
    let object;
    try {
        object = extractJson(raw);
    } catch (error) {
        return { status: 'invalid', error: String(error?.message ?? error) };
    }
    if (!object || typeof object !== 'object' || Array.isArray(object)) {
        return { status: 'invalid', error: '总结不是 JSON 对象' };
    }
    const text = typeof object.text === 'string' ? object.text.trim() : '';
    if (!text) return { status: 'invalid', error: '总结缺少 text' };
    const title = typeof object.title === 'string' ? object.title.trim() : '';
    if (!title) return { status: 'invalid', error: '总结缺少 title' };
    const pickNames = value => (Array.isArray(value) ? value : [])
        .filter(item => typeof item === 'string' && item.trim())
        .map(item => item.trim());
    return {
        status: 'ok',
        big: {
            title,
            text,
            basis: typeof object.basis === 'string' ? object.basis.trim() : '',
            related: pickNames(object.related),
            aliases: pickNames(object.aliases),
            quote: typeof object.quote === 'string' ? object.quote.trim() : '',
            weight: object.weight === 'minor' ? 'minor' : 'major',
            tag: VALID_TAGS.has(object.tag) ? object.tag : '',
        },
    };
}
