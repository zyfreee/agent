/**
 * 记忆决定：LLM 决定脚本执行的核心。
 * 模型输入 = 聊天记录 + 世界书条目 + 本场召回的记忆；输出 = 一条 note + 一组操作；
 * 脚本逐条校验执行（memory-runtime），结果原样呈现到面板。
 *
 * 提示词可在设置里改写（memory.decidePrompt，留空用 MEMORY_DECIDE_PROMPT）。
 */

import { buildMemoryInjection } from './memory-ops.js';
import { extractJson } from '../host/llm-client.js';

const MAX_FLOORS = 12;
const FLOOR_CHARS = 800;
const MAX_BOOK_LINES = 40;
const MAX_NOTE_CHARS = 300;
const MAX_OPS = 12;

/** 默认决定提示词（system）。改写时保持"只输出 JSON"与操作字段名不变，否则脚本解析不到。 */
export const MEMORY_DECIDE_PROMPT = [
    '你是《斗破苍穹》同人角色卡的书记官。你只做一件事：读聊天记录、世界书资料和本场召回的主角记忆，决定主角这一轮"新记住了什么、了结了什么"，输出能被脚本严格执行的 JSON。',
    '只输出一个 JSON 对象：{"note":"一句话说明为什么这么决定","ops":[…]}。不要输出解释、标题或代码块以外的文字。',
    '记忆分两层，都永久保存、按需召回（related 字段是日后召回的钥匙，所以必写 1-4 个人名/地名/物名）：',
    '- remember=小记忆：轻量记录的近事杂事——谁说过什么、主角干了什么小事、当下的小恩小怨小动静。weight 用 minor，不必重要才记，保持主角"记得这几天发生过什么"。',
    '- memorize=大记忆：值得一直记住的事——恩怨、秘密、伏笔、重大转折。weight 用 major，tag 可选（grudge恩怨/intel情报/thread伏笔/milestone大事记，只是查看标签，拿不准就空着）。',
    '- quote 可选：本轮里最有味道的一句原话（≤60字），日后召回会原样带回；只准摘聊天里真实出现过的对白，没有就空着。',
    '- promote(id)：小记忆后来发现分量够重（比如当年的小事成了大事），转成大记忆，召回时优先。',
    '- resolveMemory(id,note≤120字)：了结——报仇了/报恩了/情报过时作废/伏笔回收。id 只能用召回列表里已有的编号。',
    '- reopenMemory(id)：了结错了，重新挂起；forgetMemory(id)：记错了或已无意义，整条删除。',
    '记账规则：只记主角亲身经历或得知的事，变化必须从最近聊天里有依据地长出来；text≤300字，basis 必写（一句话说清从哪楼/谁/什么事来），related 必写 1-4 个（本场出现的人名/地名/物名，作为召回钥匙）；related 为空的操作会被脚本拒绝。',
    '所有权边界（不要越界记账）：主角的目标约定、境界物品归纳戒管；玩家接的任务归世界任务；正在发生的市井/势力动态归世界事件；NPC 的档案与好感归人物簿。记忆只收"值得记住的叙事事实"。',
    '- 一次最多 12 条操作，写不下就留到下一轮。',
    '主角这轮没有新记忆、也没有了结旧记忆，就输出 {"note":"本轮无新记忆","ops":[]}，绝不为凑数而编记忆。',
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
                    op: { type: 'string', enum: ['remember', 'memorize', 'promote', 'resolveMemory', 'reopenMemory', 'forgetMemory'] },
                    text: { type: 'string' }, basis: { type: 'string' }, note: { type: 'string' }, quote: { type: 'string' },
                    related: { type: 'array', items: { type: 'string' } },
                    weight: { type: 'string', enum: ['major', 'minor'] },
                    tag: { type: 'string', enum: ['grudge', 'intel', 'thread', 'milestone'] },
                    id: { type: 'string' },
                },
                required: ['op'],
            },
        },
    },
    required: ['ops'],
});

/** 组装发给模型的 user 内容：本场召回的记忆 + 相关世界书条目 + 最近聊天（旧→新）。 */
export function buildDecideUser({ snapshot = {}, floors = [], worldbookLines = [] } = {}) {
    const sceneText = (Array.isArray(floors) ? floors : []).map(floor => (typeof floor?.text === 'string' ? floor.text : '')).join('\n');
    const memoryBlock = buildMemoryInjection(snapshot, { maxChars: 1200, sceneText }) || '（本场没有勾起任何旧记忆）';
    const bookLines = (Array.isArray(worldbookLines) ? worldbookLines : [])
        .filter(line => typeof line === 'string' && line.trim())
        .slice(0, MAX_BOOK_LINES);
    const chat = (Array.isArray(floors) ? floors : [])
        .slice(-MAX_FLOORS)
        .map(floor => {
            const role = floor?.role === '玩家' ? '玩家' : '角色';
            const body = typeof floor?.text === 'string' ? floor.text.trim().slice(0, FLOOR_CHARS) : '';
            return body ? `[${role}] ${body}` : null;
        })
        .filter(Boolean);
    return [
        '【主角记忆（本场召回，related 命中最近剧情才出现）】',
        memoryBlock,
        '',
        `【世界书资料（与本轮聊天相关的条目，共 ${bookLines.length} 条）】`,
        bookLines.length ? bookLines.map(line => `- ${line}`).join('\n') : '- （本轮没有命中的世界书条目）',
        '',
        `【最近聊天记录（旧 → 新，共 ${chat.length} 楼）】`,
        chat.length ? chat.join('\n') : '- （还没有聊天内容）',
        '',
        '请决定主角的新记忆与了结，只输出 JSON：{"note":"…","ops":[…]}。',
    ].join('\n');
}

/** 解析模型决定：抽 JSON、限长、逐条交给 runtime 校验；坏 note 不影响 ops。 */
export function parseDecision(raw) {
    let object;
    try {
        object = extractJson(raw);
    } catch (error) {
        return { status: 'invalid', ops: [], note: '', error: String(error?.message ?? error) };
    }
    if (!object || typeof object !== 'object' || Array.isArray(object)) {
        return { status: 'invalid', ops: [], note: '', error: '决定不是 JSON 对象' };
    }
    const note = typeof object.note === 'string' ? object.note.trim().slice(0, MAX_NOTE_CHARS) : '';
    const list = Array.isArray(object.ops) ? object.ops.slice(0, MAX_OPS) : [];
    const ops = list.filter(item => item && typeof item === 'object' && !Array.isArray(item) && typeof item.op === 'string' && item.op.trim());
    const dropped = list.length - ops.length;
    return { status: ops.length || note ? 'ok' : 'empty', ops, note, dropped };
}
