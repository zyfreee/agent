/**
 * NPC 自由对话：和人物簿里的某个人当面搭话或传讯玉简。
 *
 * 上下文按「记忆块」拼（letta 的 core memory blocks 范式）：档案块（人物簿全字段）
 * 常驻、关系块（关系图一跳）、知情块（他经正文/传闻知道的事）、开环块（没兑现的
 * 承诺）、时间块（世界日 + 渠道 + 玩家近况）。模型每轮只回一个 JSON：说的话、心里
 * 话、好感微调、短期情绪、可能的新承诺。好感步进比照传闻传播的收紧口径（±3，比
 * 人物簿的 ±15 紧），脚本落账，模型不直接写账。收尾另有一次回写调用：把整段对话
 * 对人物簿的长期影响（经历 / 流水 / 好感 / 他新知道的事）抽出来。
 */

import { extractJson } from '../host/llm-client.js';
import { doingFresh } from './npc-ledger.js';

/** 单轮对话好感步进上限：面对面几句话不该比传闻搬弄是非（±3）改动更大。 */
export const CHAT_FAVOR_STEP_MAX = 3;

const SAY_MAX = 600;
const INNER_MAX = 160;
const MOOD_MAX = 12;
const PROMISE_MAX = 80;
const EXP_MAX = 120;
const LOG_MAX = 60;
const LEARNED_MAX = 6;
const LEARNED_ITEM_MAX = 80;

export const NPC_CHAT_PROMPT = `你在为《斗破苍穹》同人小说扮演一个人物：此刻他正和主角（玩家）私下交谈。人物簿档案、关系、他知道的事、没兑现的承诺都给了你——说话必须全部从这些材料里来。

【规矩】
1. 完全按档案说话：性格标签、说话风格、口头禅照写；境界/身份/与玩家的关系阶段决定语气，好感决定热络程度（冷淡的人短句带刺，亲近的人才多叮嘱几句）。
2. 只聊他知道的事：知情范围之外的事一律不知道——没听说的传闻不能当见闻说，不在他档案里的秘密不能说漏。想套玩家的话要符合他的性格和想要的东西（want）。
3. 别碰雷区：档案里写了雷区（taboo）的话题，玩家撞上去要按性格真实恼怒或回避。
4. 私下的话：私下态度（privateAttitude）可以露一点，人前态度还是要端着；当着外人时更收敛。
5. 好感微调：这轮交谈确实让他心里起了变化才给，幅度 -3～+3 的整数，多数时候是 0 或 ±1；没变化就 0。
6. 承诺：只有他这轮真的应下了什么（答应帮忙、约了时间、许了东西）才写 promise，一句话；没应就空着。
7. say 是他嘴里说出来的话，不写动作旁白、不写心理描写、不替玩家说话；心里话放 inner。
8. 只输出一个 JSON 对象，不要解释、不要 Markdown 代码块、不要前后缀。

【输出格式】
{"say":"…","inner":"他心里真正想的事（可空）","favor":0,"mood":"一个词的短期情绪（可空）","promise":"他这轮许下的承诺（可空）"}`;

export const NPC_CHAT_JSON_SCHEMA = Object.freeze({
    type: 'object',
    properties: {
        say: { type: 'string' },
        inner: { type: 'string' },
        favor: { type: 'integer' },
        mood: { type: 'string' },
        promise: { type: 'string' },
    },
    required: ['say'],
    additionalProperties: false,
});

/** 收尾回写：整段对话对人物簿的长期影响，一次抽干净。 */
export const NPC_CHAT_RECAP_PROMPT = `你是《斗破苍穹》同人小说的「对话记账人」。一段玩家与某个人物的私下对话刚刚结束，你只做一件事：把这段对话对该人物簿档案的长期影响写成 JSON。

【规矩】
1. exp（经历）：只有对话里发生了「忘了他接下来剧情就会断线」的事才写，一句话 ≤80 字；寻常寒暄留空。
2. log（流水）：一句话记这段对话本身（谁和他谈了什么），≤60 字，这是记录不是认定。
3. favor：整段对话累计的好感变化，-3～+3 的整数；单独一轮的微调已经记过账，这里只在整段确有净变化时给，通常 0。
4. learned：对话里他新知道的事（玩家告诉他的情报、他的承诺、约定的细节），每条 ≤80 字，最多 6 条；没有就空数组。
5. 只写这个人自己的档案，不写别人；拿不准就留空，不编。
6. 只输出 JSON，不要解释、不要 Markdown 代码块、不要前后缀。

【输出格式】
{"exp":"…" 或 "","log":"…","favor":0,"learned":["…"]}`;

export const NPC_CHAT_RECAP_JSON_SCHEMA = Object.freeze({
    type: 'object',
    properties: {
        exp: { type: 'string' },
        log: { type: 'string' },
        favor: { type: 'integer' },
        learned: { type: 'array', items: { type: 'string' } },
    },
    required: ['log'],
    additionalProperties: false,
});

function text(value, max) {
    if (typeof value !== 'string') return '';
    const clean = value.trim();
    return clean ? clean.slice(0, max) : '';
}

function clampFavorDelta(value, max) {
    if (!Number.isInteger(value)) return 0;
    return Math.max(-max, Math.min(max, value));
}

function relationLines(relations) {
    const lines = (Array.isArray(relations) ? relations : [])
        .map(edge => {
            const other = typeof edge?.to === 'string' ? edge.to : '';
            const relation = typeof edge?.relation === 'string' ? edge.relation : '';
            if (!other) return '';
            return relation ? `${other}（${relation}）` : other;
        })
        .filter(Boolean);
    return [...new Set(lines)];
}

/** 记忆块拼装：档案 / 关系 / 知情 / 开环 / 时间。谁没料就写「（暂无）」，块永远在。 */
export function buildChatContext({ record, relations = [], knownFacts = [], loops = [], day = null, playerContext = null, channel = '面对面' } = {}) {
    const who = record && typeof record === 'object' ? record : {};
    const blocks = [];
    // 动向过时就别拿旧账闲聊：位置/旧动向不进材料（expTail 里的经历自会说话）——
    // 人都被囚了还聊“他在哪儿打坐”，就是同一根上的衍生错。
    const fresh = doingFresh(who);
    const profile = [
        who.name || '（未知名）',
        who.gender || '',
        who.identity || '',
        who.realm ? `境界 ${who.realm}` : '',
        who.stage ? `与玩家关系阶段：${who.stage}` : '',
        fresh && who.location ? `在 ${who.location}` : '',
        who.presence || '',
    ].filter(Boolean).join('｜');
    const traits = [
        Array.isArray(who.traits) && who.traits.length ? `性格：${who.traits.join('、')}` : '',
        who.speech ? `说话风格：${who.speech}` : '',
        who.catchphrase ? `口头禅：${who.catchphrase}` : '',
        who.taboo ? `雷区：${who.taboo}` : '',
        who.want ? `想要什么：${who.want}` : '',
        who.fear ? `怕什么：${who.fear}` : '',
        fresh && who.doing ? `正在做什么：${who.doing}` : '',
        who.appellation ? `他对玩家的称呼：${who.appellation}` : '',
    ].filter(Boolean);
    const attitudes = [
        who.attitude ? `对玩家现状：${who.attitude}` : '',
        who.publicAttitude ? `人前：${who.publicAttitude}` : '',
        who.privateAttitude ? `私下：${who.privateAttitude}` : '',
    ].filter(Boolean);
    const secrets = [];
    if (who.secret?.what) secrets.push(`秘密：${String(who.secret.what)}`);
    if (Array.isArray(who.moods) && who.moods.length) {
        secrets.push(`近期情绪：${who.moods.map(mood => mood?.text).filter(Boolean).join('、')}`);
    }
    const logTail = (Array.isArray(who.log) ? who.log : [])
        .map(item => typeof item?.text === 'string' ? item.text : '').filter(Boolean);
    const expTail = (Array.isArray(who.exp) ? who.exp : [])
        .map(item => typeof item?.text === 'string' ? item.text : '').filter(Boolean);
    blocks.push([
        `【人物档案】${profile}`,
        traits.length ? traits.join('；') : '',
        attitudes.length ? attitudes.join('；') : `好感 ${Number(who.favor) || 0}`,
        secrets.length ? secrets.join('；') : '',
        expTail.length ? `最近经历：${expTail.join('；')}` : '',
        typeof who.logSummary === 'string' && who.logSummary.trim() ? `往来概要：${who.logSummary.trim()}` : '',
        logTail.length ? `最近流水：${logTail.join('；')}` : '',
    ].filter(Boolean).join('\n'));

    const relationsBlock = relationLines(relations);
    blocks.push(`【他身边的人】${relationsBlock.length ? relationsBlock.join('、') : '（暂无已记录的关系）'}`);

    const facts = (Array.isArray(knownFacts) ? knownFacts : []).map(item => text(item)).filter(Boolean);
    blocks.push(`【他知道的事（知情范围）】\n${facts.length ? facts.join('\n') : '（没有额外的知情记录：只按档案与常识说话）'}`);

    const loopLines = (Array.isArray(loops) ? loops : [])
        .map(loop => {
            const promise = typeof loop?.promise === 'string' ? loop.promise : '';
            if (!promise) return '';
            const due = Number.isFinite(Number(loop?.dueDay)) && Number(loop.dueDay) > 0 ? `（说好第 ${Number(loop.dueDay)} 天前）` : '';
            return `-${promise}${due}`;
        })
        .filter(Boolean);
    blocks.push(`【他没兑现的承诺（开环）】\n${loopLines.length ? loopLines.join('\n') : '（没有）'}`);

    const playerBits = [];
    if (playerContext?.name) playerBits.push(`玩家：${playerContext.name}`);
    if (playerContext?.realm) playerBits.push(`境界 ${playerContext.realm}`);
    blocks.push(`【对面是谁】${playerBits.length ? playerBits.join('｜') : '玩家（主角）'}`);
    blocks.push(`【此刻】第 ${Number.isFinite(Number(day)) && Number(day) > 0 ? Number(day) : '?'} 天 · ${channel === '传讯' ? '传讯玉简（远程，看不见彼此）' : '当面交谈'}`);
    return blocks.join('\n\n');
}

/** 对话历史 + 本轮玩家的话。历史截尾，玩家最新一句放最后并加重。 */
export function buildChatUser({ history = [], playerText = '', context = '', maxHistory = Infinity } = {}) {
    const tail = (Array.isArray(history) ? history : [])
        .slice(-Math.max(1, maxHistory))
        .map(item => {
            const who = item?.who === '玩家' ? '玩家' : '他';
            const line = typeof item?.text === 'string' ? item.text : '';
            return line ? `${who}：${line}` : '';
        })
        .filter(Boolean);
    const blocks = [context].filter(Boolean);
    blocks.push(`【最近的交谈】\n${tail.length ? tail.join('\n') : '（刚开始，还没有说过话）'}`);
    const fresh = typeof playerText === 'string' ? playerText.trim() : '';
    blocks.push(fresh ? `【玩家这次说】\n玩家：${fresh}` : '【玩家这次说】\n（玩家没有说话，只是看着他——他按性格先开口或等待）');
    return blocks.join('\n\n');
}

/** 单轮回复解析：say 必有；favor 越界压回 ±max，缺省 0。 */
export function parseChatReply(raw, { favorStepMax = CHAT_FAVOR_STEP_MAX } = {}) {
    let data;
    try {
        data = extractJson(raw);
    } catch (error) {
        return { status: 'invalid', reason: String(error?.message ?? error) };
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { status: 'invalid', reason: '回复不是 JSON 对象' };
    const say = text(data.say, SAY_MAX);
    if (!say) return { status: 'invalid', reason: '缺少 say（他这句话说什么）' };
    const favorRaw = typeof data.favor === 'number' && Number.isFinite(data.favor) ? Math.round(data.favor) : 0;
    return {
        status: 'ok',
        say,
        inner: text(data.inner, INNER_MAX),
        favor: clampFavorDelta(favorRaw, favorStepMax),
        mood: text(data.mood, MOOD_MAX),
        promise: text(data.promise, PROMISE_MAX),
    };
}

/** 收尾回写的喂料：档案要点 + 这段对话的往来（截尾）。 */
export function buildChatRecapUser({ record = null, history = [], channel = '面对面', maxHistory = Infinity, maxChars = Infinity } = {}) {
    const who = record && typeof record === 'object' ? record : {};
    const head = [who.name || '（未知名）', who.identity || '', who.stage ? `关系阶段：${who.stage}` : '', `好感 ${Number(who.favor) || 0}`].filter(Boolean).join('｜');
    const lines = (Array.isArray(history) ? history : [])
        .slice(-Math.max(1, maxHistory))
        .map(item => {
            const role = item?.who === '玩家' ? '玩家' : '他';
            const line = typeof item?.text === 'string' ? item.text : '';
            return line ? `${role}：${line}` : '';
        })
        .filter(Boolean);
    const body = [`【这个人】${head}`, `【这段对话（${channel === '传讯' ? '传讯玉简' : '当面'}）】\n${lines.length ? lines.join('\n') : '（没有往来）'}`].join('\n\n');
    return body;
}

/** 收尾回写解析：log 必有（寻常寒暄也要有一句流水）；learned 收成界内数组。 */
export function parseChatRecapReply(raw, { favorStepMax = CHAT_FAVOR_STEP_MAX } = {}) {
    let data;
    try {
        data = extractJson(raw);
    } catch (error) {
        return { status: 'invalid', reason: String(error?.message ?? error) };
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { status: 'invalid', reason: '回写不是 JSON 对象' };
    const log = text(data.log, LOG_MAX);
    if (!log) return { status: 'invalid', reason: '缺少 log（这段对话的流水）' };
    const learned = (Array.isArray(data.learned) ? data.learned : [])
        .map(item => text(item, LEARNED_ITEM_MAX))
        .filter(Boolean)
        .slice(0, LEARNED_MAX);
    const favorRaw = typeof data.favor === 'number' && Number.isFinite(data.favor) ? Math.round(data.favor) : 0;
    return {
        status: 'ok',
        exp: text(data.exp, EXP_MAX),
        log,
        favor: clampFavorDelta(favorRaw, favorStepMax),
        learned,
    };
}
