/**
 * 世界决定：LLM 决定脚本执行的核心。
 * 模型输入 = 聊天记录 + 世界书条目 + 当前世界台账；输出 = 一条 note + 一组操作；
 * 脚本逐条校验执行（world-runtime），结果原样呈现到面板。
 *
 * 提示词可在设置里改写（world.decidePrompt，留空用 WORLD_DECIDE_PROMPT）。
 */

import { buildWorldInjection } from './world-ops.js';
import { extractJson } from '../host/llm-client.js';

const MAX_FLOORS = 12;
const FLOOR_CHARS = 800;
const MAX_BOOK_LINES = 40;
const MAX_NOTE_CHARS = 300;
const MAX_OPS = 12;

/** 默认决定提示词（system）。改写时保持"只输出 JSON"与操作字段名不变，否则脚本解析不到。 */
export const WORLD_DECIDE_PROMPT = [
    '你是《斗破苍穹》同人角色卡的世界主持人。你只做一件事：读聊天记录、世界书资料和世界台账，决定世界在这一轮之后发生了什么变化，输出能被脚本严格执行的 JSON。',
    '只输出一个 JSON 对象：{"note":"一句话说明为什么这么决定","ops":[…]}。不要输出解释、标题或代码块以外的文字。',
    '可用操作（脚本逐条校验，写错字段或越界的条目会被丢弃，不影响其他条目）：',
    '- {"op":"advance","days":1} 或 {"op":"advance","minutes":30}：时间流逝。剧情里明确过了多久就推多少，不要每轮硬推。',
    '- {"op":"setClock","day":3,"minute":480,"label":"三年之约前夕"}：直接设定时钟（少用）。',
    '- {"op":"addEvent","scope":"near或world","text":"不超过120字","basis":"从哪来：哪楼/谁/什么事引出","weight":"minor或major或rumor","days":有效天数≤90}：登记事件。',
    '- {"op":"resolveEvent","id":"e5"}：了结事件，id 只能用台账里已有的编号。',
    '- {"op":"pinEvent","id":"e5","pinned":false}：置顶或取消置顶。',
    '- {"op":"setInfo","field":"weather或location或era或reputation或wanted","text":"不超过80字"}：天气/所在地/时期/名声/通缉度。',
    '事件取材规则：事件从聊天记录里有依据地长出来——正在发生的事、玩家行动引出的动静、所在地点此时合理的动态；题材不拘（市井琐事、势力动作、传闻都行），basis 必须一句话写清从哪来。没有依据的事不记，也不要把世界书里的原著桥段照搬成事件——世界书只是资料，剧情真的触到它时才用。',
    'weight 用法：rumor=传闻（未证实的消息，正文不得当事实写；玩家查证后用 resolveEvent 了结它，再另记一条真相或戳穿）；major=大事（影响走向，打星注入）；minor=普通。机缘与危机（拍卖会开锣、药草成熟、仇家寻上门、势力清洗）属于世界主动投放的 major 事件：偶尔来一件、必须有依据，不要每轮都发。',
    '名声（reputation）与通缉度（wanted）：玩家行侠仗义、立功扬名则名声上涨；作恶、树敌、招惹官府势力则通缉上涨。只在剧情真有对应行为时更新，写法自由（如"乌坦城小有名气""被迦南学院记恨"）。',
    '- 一次最多 12 条操作，写不下就留到下一轮。',
    '没有需要记下的变化就输出 {"note":"本轮世界无变化","ops":[]}，绝不为凑数而编事件。',
].join('\n');

/** 给酒馆 generateQuietPrompt 的结构化输出约束；解析端并不依赖它，只是提高严格度。 */
export const DECIDE_JSON_SCHEMA = Object.freeze({
    type: 'object',
    properties: {
        note: { type: 'string' },
        ops: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    op: { type: 'string', enum: ['advance', 'setClock', 'addEvent', 'resolveEvent', 'pinEvent', 'setInfo'] },
                    days: { type: 'number' }, minutes: { type: 'number' },
                    day: { type: 'number' }, minute: { type: 'number' }, label: { type: 'string' },
                    scope: { type: 'string', enum: ['near', 'world'] },
                    text: { type: 'string' }, basis: { type: 'string' },
                    weight: { type: 'string', enum: ['minor', 'major', 'rumor'] },
                    id: { type: 'string' }, pinned: { type: 'boolean' },
                    field: { type: 'string', enum: ['weather', 'location', 'era', 'reputation', 'wanted'] },
                },
                required: ['op'],
            },
        },
    },
    required: ['ops'],
});

function clampInt(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isInteger(num) || num < min || num > max) return fallback;
    return num;
}

/** 组装发给模型的 user 内容：台账现状 + 相关世界书条目 + 最近聊天（旧→新）。 */
export function buildDecideUser({ snapshot = {}, floors = [], worldbookLines = [] } = {}) {
    const worldBlock = buildWorldInjection(snapshot, { maxChars: 1200 });
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
        '【世界台账（当前既定状态）】',
        worldBlock,
        '',
        `【世界书资料（与本轮聊天相关的条目，共 ${bookLines.length} 条）】`,
        bookLines.length ? bookLines.map(line => `- ${line}`).join('\n') : '- （本轮没有命中的世界书条目）',
        '',
        `【最近聊天记录（旧 → 新，共 ${chat.length} 楼）】`,
        chat.length ? chat.join('\n') : '- （还没有聊天内容）',
        '',
        '请决定世界的变化，只输出 JSON：{"note":"…","ops":[…]}。',
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
