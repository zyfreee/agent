/**
 * 记忆决定：LLM 决定脚本执行的核心。
 * 模型输入 = 聊天记录 + 世界书条目 + 本场召回的记忆；输出 = 一条 note + 一组操作；
 * 脚本逐条校验执行（memory-runtime），结果原样呈现到面板。
 *
 * 提示词可在设置里改写（memory.decidePrompt，留空用 MEMORY_DECIDE_PROMPT）。
 */

import { extractJson } from '../host/llm-client.js';

const MAX_FLOORS = 12;
const FLOOR_CHARS = 800;
const MAX_NOTE_CHARS = 300;
const MAX_OPS = 12;

/** 默认决定提示词（system）。改写时保持"只输出 JSON"与操作字段名不变，否则脚本解析不到。 */
export const MEMORY_DECIDE_PROMPT = [
    '你是《斗破苍穹》同人角色卡的书记官。你只做一件事：把本轮正文总结成一条小记忆，输出能被脚本严格执行的 JSON。',
    '只输出一个 JSON 对象：{"note":"一句话说明总结依据","ops":[…]}。不要输出解释、标题或代码块以外的文字。',
    '- ops 里恰好 1 条 remember：把最后一楼正文（结合玩家的本轮输入理解）总结成一句简明记忆——谁/在哪/干了什么、结果如何。本轮正文确实是纯过场、没有任何新信息时才允许空 ops。',
    '- 只总结本轮正文里实际发生的事；现有记忆清单里已有的近事绝不再写（哪怕换个措辞）——多余的小记忆会被脚本直接丢弃。',
    '- title 必写：1~14 字短标题（名词短语，概括这条记忆，如「加列家中街设卡」「洗骨草扣货待沽」）。记忆列表主页面只显示标题；缺标题或超过 14 字的条目会被脚本整条拒绝，不要拿正文原句硬凑。',
    '- text≤60字写一句简明记忆；更多细节写进 note≤200字；basis 必写（本轮正文里哪里来的）；related 必写 1-4 个（本轮出现的人名/地名/物名，作为日后召回的钥匙）；related 为空的操作会被脚本拒绝。',
    '- quote 可选：本轮里最有味道的一句原话（≤60字）；只准摘聊天里真实出现过的对白，没有就空着。',
    '- forgetMemory(id)：仅在既有记忆与本轮正文事实明显冲突时使用；记忆永久保存，没有"了结"状态。',
    '- 大记忆不用你管：小记忆攒够后脚本会自动总结成大记忆，你没有 memorize/promote 这类操作。',
    '- 例外：当输入里有【待整合小记忆】时，额外输出 consolidate 字段（一次调用两件事）——{"ids":[待整合条目的编号],"title":"≤14字大记忆短标题","text":"≤60字把这批小记忆整批总结成一条长期大事","related":[1-4个钥匙],"aliases":[其余召回钥匙]}。ids 必须来自待整合清单；没有这个输入段就不输出该字段。',
    '口吻：记忆是中性的记事，写清"谁/在哪/发生了什么"，不要写成"我"的第一人称日记。',
    '所有权边界：主角的目标约定、境界物品归纳戒管；玩家接的任务归世界任务；正在发生的市井/势力动态归世界事件；NPC 的档案与好感归人物簿。你只收本轮正文的叙事总结。',
    '只输出 JSON。',
].join('\n');

/** 给酒馆 generateQuietPrompt 的结构化输出约束；解析端并不依赖它，只是提高严格度。 */
export const MEMORY_JSON_SCHEMA = Object.freeze({
    type: 'object',
    properties: {
        note: { type: 'string' },
        ops: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    op: { type: 'string', enum: ['remember', 'forgetMemory'] },
                    title: { type: 'string' },
                    text: { type: 'string' }, basis: { type: 'string' }, note: { type: 'string' }, quote: { type: 'string' },
                    related: { type: 'array', items: { type: 'string' } },
                    weight: { type: 'string', enum: ['major', 'minor'] },
                    tag: { type: 'string', enum: ['grudge', 'intel', 'thread', 'milestone'] },
                    id: { type: 'string' },
                },
                required: ['op'],
                // 只对 remember（新记）强制非空短标题；forgetMemory 按编号删除不强制。
                anyOf: [
                    {
                        properties: { op: { enum: ['remember'] }, title: { type: 'string', minLength: 1, maxLength: 14, pattern: '\\S' } },
                        required: ['op', 'title'],
                    },
                    {
                        properties: { op: { enum: ['forgetMemory'] } },
                        required: ['op'],
                    },
                ],
            },
        },
        // 待整合小记忆在场时的一次性合并：本轮总结 + 整批提炼成大记忆同调用完成。
        consolidate: {
            type: 'object',
            properties: {
                ids: { type: 'array', items: { type: 'string' } },
                title: { type: 'string', minLength: 1, maxLength: 14, pattern: '\\S' },
                text: { type: 'string' },
                related: { type: 'array', items: { type: 'string' } },
                aliases: { type: 'array', items: { type: 'string' } },
                quote: { type: 'string' },
                basis: { type: 'string' },
                note: { type: 'string' },
                weight: { type: 'string', enum: ['major', 'minor'] },
                tag: { type: 'string', enum: ['grudge', 'intel', 'thread', 'milestone'] },
            },
            required: ['ids', 'title', 'text'],
        },
    },
    required: ['ops'],
});

/** 组装发给模型的 user 内容：本场召回的记忆 + 相关世界书条目 + 最近聊天（旧→新）。 */
export function buildDecideUser({ snapshot = {}, floors = [], consolidateIds = [] } = {}) {
    // 现有记忆全清单（只列标题）：不给模型看，它就不知道哪些近事已经记过，换个措辞重记一遍。
    const existing = (Array.isArray(snapshot?.entries) ? snapshot.entries : [])
        .map(entry => `${entry.id}|${entry.tier === 'big' ? '大' : '小'}|${String(entry.title || entry.text || '').trim().slice(0, 24)}`)
        .filter(line => line.length > 4)
        .slice(0, 60);
    const chat = (Array.isArray(floors) ? floors : [])
        .slice(-MAX_FLOORS)
        .map(floor => {
            const role = floor?.role === '玩家' ? '玩家' : '角色';
            const body = typeof floor?.text === 'string' ? floor.text.trim().slice(0, FLOOR_CHARS) : '';
            return body ? `[${role}] ${body}` : null;
        })
        .filter(Boolean);
    const consolidateSection = (Array.isArray(consolidateIds) ? consolidateIds : []).filter(Boolean);
    const wanted = new Set(consolidateSection.map(id => String(id)));
    const pendingLines = (Array.isArray(snapshot?.entries) ? snapshot.entries : [])
        .filter(entry => wanted.has(String(entry.id)))
        .map(entry => `- ${entry.id}|${String(entry.title || entry.text || '').trim().slice(0, 24)}`);
    return [
        `【现有记忆清单（这些已经记过，只总结本轮正文里的新事，共 ${existing.length} 条）】`,
        existing.length ? existing.map(line => `- ${line}`).join('\n') : '- （还是空的）',
        '',
        pendingLines.length ? '【待整合小记忆（本轮顺带：把它们整批总结成 1 条大记忆，输出 consolidate 字段）】' : null,
        pendingLines.length ? pendingLines.join('\n') : null,
        pendingLines.length ? '' : null,
        `【最近聊天记录（旧 → 新，共 ${chat.length} 楼；总结对象=最后一楼正文）】`,
        chat.length ? chat.join('\n') : '- （还没有聊天内容）',
        '',
        '请把最后一楼正文总结成一条小记忆，只输出 JSON：{"note":"…","ops":[…]}。',
    ].filter(line => line !== null).join('\n');
}

/** 每轮小记忆硬上限：remember 只收前 max 条，多余的直接丢弃。
 *  提示词已要求只写一条；这里是模型不听话时的兜底，防止"最近几楼"被换个措辞反复重记。 */
export function capRememberOps(ops, max = 1) {
    const list = Array.isArray(ops) ? ops.filter(op => op && typeof op === 'object') : [];
    const kept = [];
    let remembered = 0;
    let dropped = 0;
    for (const op of list) {
        if (op.op === 'remember') {
            remembered += 1;
            if (remembered > max) {
                dropped += 1;
                continue;
            }
        }
        kept.push(op);
    }
    return { ops: kept, dropped };
}

/** 解析模型决定：抽 JSON、限长、逐条交给 runtime 校验；坏 note 不影响 ops。 */
export function parseDecision(raw) {
    let object;
    try {
        object = extractJson(raw);
    } catch (error) {
        return { status: 'invalid', ops: [], note: '', consolidate: null, error: String(error?.message ?? error) };
    }
    if (!object || typeof object !== 'object' || Array.isArray(object)) {
        return { status: 'invalid', ops: [], note: '', consolidate: null, error: '决定不是 JSON 对象' };
    }
    const note = typeof object.note === 'string' ? object.note.trim().slice(0, MAX_NOTE_CHARS) : '';
    const list = Array.isArray(object.ops) ? object.ops.slice(0, MAX_OPS) : [];
    const ops = list.filter(item => item && typeof item === 'object' && !Array.isArray(item) && typeof item.op === 'string' && item.op.trim());
    const dropped = list.length - ops.length;
    // 待整合大记忆（形状由 schema 约束；脚本侧还会再校验 ids 与条目存在性）。
    const rawConsolidate = object.consolidate && typeof object.consolidate === 'object' && !Array.isArray(object.consolidate) ? object.consolidate : null;
    const consolidate = rawConsolidate && Array.isArray(rawConsolidate.ids) && rawConsolidate.ids.length && String(rawConsolidate.title || '').trim() && String(rawConsolidate.text || '').trim()
        ? {
            ids: rawConsolidate.ids.map(id => String(id).trim()).filter(Boolean),
            title: String(rawConsolidate.title || '').trim(),
            text: String(rawConsolidate.text || '').trim(),
            related: Array.isArray(rawConsolidate.related) ? rawConsolidate.related.map(item => String(item).trim()).filter(Boolean).slice(0, 4) : [],
            aliases: Array.isArray(rawConsolidate.aliases) ? rawConsolidate.aliases.map(item => String(item).trim()).filter(Boolean).slice(0, 8) : [],
            quote: typeof rawConsolidate.quote === 'string' ? rawConsolidate.quote.trim().slice(0, 60) : '',
            basis: typeof rawConsolidate.basis === 'string' ? rawConsolidate.basis.trim().slice(0, 120) : '',
            note: typeof rawConsolidate.note === 'string' ? rawConsolidate.note.trim().slice(0, 200) : '',
            weight: rawConsolidate.weight === 'minor' ? 'minor' : 'major',
            tag: ['grudge', 'intel', 'thread', 'milestone'].includes(rawConsolidate.tag) ? rawConsolidate.tag : '',
        }
        : null;
    return { status: ops.length || note || consolidate ? 'ok' : 'empty', ops, note, consolidate, dropped };
}
