/**
 * 主动联系（reachout）：NPC 主动来找玩家，不打断正文。
 *
 * 决策完全在脚本侧（xiyu-ai 的三驱动思路 + Shikigami 的阈值破冰）：动机（情谊节点 /
 * 开环到期 / 风闻想分享 / 兴起）加权积累紧急度，过阈值才开口——不是定时器到点就扰人。
 * 扰民红线全在这里管：勿扰时段、每人冷却、连发没回先收敛（读空气，3 次封嘴）、
 * 每轮判断额度、同一话题素材冷却（默认 14 个世界日）、单人静音。排上队只是「他想
 * 来找你」，开场白由入口的 LLM 调用生成后 attach 回来，玩家接受才开对话。
 */

import { extractJson } from '../host/llm-client.js';
import { doingFresh, recentExpLines } from './npc-ledger.js';

const MOTIVE_ORDER = ['loop', 'favor', 'gossip', 'random'];

export const MOTIVE_LABELS = Object.freeze({
    favor: '情谊',
    loop: '旧约',
    gossip: '风闻',
    random: '兴起',
});

const TOPIC_COOLDOWN_DAYS = 14;

/** 开场白提示词：他来敲门时说第一句话——动机给足材料，说得像他自己。 */
export const NPC_REACHOUT_PROMPT = `你在为《斗破苍穹》同人小说扮演一个人物：他此刻主动来找主角（玩家），你只写他开口的第一句话和来找你的事由。他的档案、动机、没兑现的承诺都给了你。

【规矩】
1. 台词完全按档案来：性格标签、说话风格、口头禅照写；好感决定热络程度，关系阶段决定措辞。
2. 只说动身时他知道的事，不剧透、不预言、不替玩家做决定；问句要符合他的目的。
3. 动机决定内容：情谊＝单纯的惦记与近况；旧约＝他自己提当年应下的事；风闻＝忍不住想说听来的消息（只说「听说了」，不当事实）；兴起＝就他眼下正在做的事搭话。
4. reason 用一句话说清「为什么来找」（≤40 字），给玩家看的事由，不是台词。
5. topic 是这句话的素材标识（≤16 字的名词短语，比如「魔兽山脉的传闻」）：同一件事近期聊过就换个素材，别重复上次的。
6. 只输出一个 JSON 对象：{"say":"他开口说的第一句话","reason":"为什么来找你","topic":"素材标识"}。不要解释、不要 Markdown 代码块、不要前后缀。`;

export const NPC_REACHOUT_JSON_SCHEMA = Object.freeze({
    type: 'object',
    properties: {
        say: { type: 'string' },
        reason: { type: 'string' },
        topic: { type: 'string' },
    },
    required: ['say'],
    additionalProperties: false,
});

/** 拼给主动联系调用的材料：档案要点 + 动机专属材料（开环/风闻）+ 时间与渠道。
 *  位置/动向过动向出口：人都被囚了还跑来找你喝茶，就是旧动向没把关。 */
export function buildReachoutUser({ record = null, motive = 'random', loops = [], rumors = [], day = null, channel = '面对面', maxChars = 3000 } = {}) {
    const who = record && typeof record === 'object' ? record : {};
    const fresh = doingFresh(who);
    const bits = [who.name || '（未知名）'];
    if (who.identity) bits.push(who.identity);
    if (who.realm) bits.push(`境界 ${who.realm}`);
    if (fresh && who.location) bits.push(`在 ${who.location}`);
    if (Array.isArray(who.traits) && who.traits.length) bits.push(`性格：${who.traits.join('、')}`);
    if (who.speech) bits.push(`说话风格：${who.speech}`);
    if (who.catchphrase) bits.push(`口头禅：${who.catchphrase}`);
    if (who.attitude) bits.push(`对玩家现状：${who.attitude}`);
    if (fresh && who.doing) bits.push(`正在做什么：${who.doing}`);
    const recent = recentExpLines(who, { count: 1 }).join('');
    if (!fresh && recent) bits.push(`近况（动向以此为准）：${recent}`);
    bits.push(`好感 ${Number(who.favor) || 0}`);
    const blocks = [`${MOTIVE_LABELS[motive] ?? motive}｜${bits.filter(Boolean).join('｜')}`];
    const loopLines = (Array.isArray(loops) ? loops : [])
        .map(loop => {
            const promise = typeof loop?.promise === 'string' ? loop.promise.trim() : '';
            return promise ? `-「${promise}」${Number.isFinite(Number(loop?.dueDay)) && Number(loop.dueDay) > 0 ? `（说好第 ${Number(loop.dueDay)} 天前）` : ''}` : '';
        })
        .filter(Boolean);
    if (motive === 'loop') blocks.push(`【他没兑现的承诺】\n${loopLines.length ? loopLines.join('\n') : '（没有明确的旧约，按他性格找最像旧约的那件事提）'}`);
    const rumorLines = (Array.isArray(rumors) ? rumors : [])
        .map(rumor => typeof rumor === 'string' && rumor.trim() ? rumor.trim() : '')
        .filter(Boolean);
    if (motive === 'gossip') blocks.push(`【他听说的风闻（未证实）】\n${rumorLines.length ? rumorLines.join('\n') : '（没有具体风闻，就说他憋不住想找人说话）'}`);
    blocks.push(`【此刻】第 ${Number.isFinite(Number(day)) && Number(day) > 0 ? Number(day) : '?'} 天 · ${channel === '传讯' ? '传讯玉简（远程联系）' : '当面来找'}`);
    const body = blocks.join('\n\n');
    return body.length > maxChars ? body.slice(0, maxChars) : body;
}

/** 开场白解析：say 必有；reason/topic 截短，缺省空串。 */
export function parseReachoutReply(raw) {
    let data;
    try {
        data = extractJson(raw);
    } catch (error) {
        return { status: 'invalid', reason: String(error?.message ?? error) };
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { status: 'invalid', reason: '回复不是 JSON 对象' };
    const say = typeof data.say === 'string' ? data.say.trim().slice(0, 600) : '';
    if (!say) return { status: 'invalid', reason: '缺少 say（他开口的第一句话）' };
    return {
        status: 'ok',
        say,
        reason: typeof data.reason === 'string' ? data.reason.trim().slice(0, 60) : '',
        topic: typeof data.topic === 'string' ? data.topic.trim().slice(0, 24) : '',
    };
}

const IGNORE_STREAK_MAX = 3;
const BASE_URGENCY = 0.25;
const MOTIVE_WEIGHTS = Object.freeze({ favor: 1, loop: 1.2, gossip: 0.8, random: 0.6 });
const ACTOR_MAX = 100;

function cleanId(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function createNpcReachout({ maxPending = 6, now = () => new Date() } = {}) {
    if (!Number.isInteger(maxPending) || maxPending < 1 || maxPending > 50) throw new RangeError('maxPending 必须为 1 到 50');
    const actors = new Map(); // npcId → { nextOkAt, streak, urgency, topics: Map(topicKey → day) }
    const pending = new Map();
    const muted = new Set();
    const quiet = { from: 0, to: 0 };
    let seq = 0;
    let turnQuota = 0;
    let turnSpent = 0;

    const stamp = () => {
        const value = now();
        return value instanceof Date ? value.toISOString() : String(value);
    };
    const timeMs = () => {
        const value = now();
        return value instanceof Date ? value.getTime() : Date.parse(value) || 0;
    };
    const actorOf = npcId => {
        const id = cleanId(npcId);
        if (!id) return null;
        if (!actors.has(id)) {
            if (actors.size >= ACTOR_MAX) return null;
            actors.set(id, { nextOkAt: 0, streak: 0, urgency: 0, topics: new Map() });
        }
        return actors.get(id);
    };

    function inQuiet(date) {
        const { from, to } = quiet;
        if (!Number.isInteger(from) || !Number.isInteger(to) || from === to || from < 0 || from > 23 || to < 0 || to > 23) return false;
        const hour = date.getHours();
        return from < to ? hour >= from && hour < to : hour >= from || hour < to;
    }

    /**
     * 评一次「他想不想来找你」。gates 全过才积累紧急度，过阈值排队。
     * motives = { favor, loop, gossip, random } 开关；loopsDue 是此人到期的开环数。
     */
    function evaluate({ npcId, day = null, favor = 0, loopsDue = 0, hasNewRumor = false, motives = {}, randomChance = 0.15, urgencyThreshold = 2, cooldownMinutes = 30 } = {}) {
        const id = cleanId(npcId);
        if (!id) return { status: 'blocked', reason: 'invalid_npc' };
        if (muted.has(id)) return { status: 'blocked', reason: 'muted' };
        if (inQuiet(now())) return { status: 'blocked', reason: 'quiet_hours' };
        const actor = actorOf(id);
        if (!actor) return { status: 'blocked', reason: 'actor_budget' };
        for (const item of pending.values()) if (item.npcId === id) return { status: 'blocked', reason: 'already_pending' };
        if (actor.streak >= IGNORE_STREAK_MAX) return { status: 'blocked', reason: 'ignored_too_many' };
        const currentMs = timeMs();
        if (currentMs < actor.nextOkAt) return { status: 'blocked', reason: 'cooldown' };
        if (pending.size >= maxPending) return { status: 'blocked', reason: 'pending_full' };

        const contributions = [];
        if (motives?.loop !== false && Number(loopsDue) > 0) contributions.push(['loop', MOTIVE_WEIGHTS.loop]);
        if (motives?.favor !== false && Number(favor) >= 50) contributions.push(['favor', MOTIVE_WEIGHTS.favor]);
        if (motives?.gossip !== false && hasNewRumor === true) contributions.push(['gossip', MOTIVE_WEIGHTS.gossip]);
        if (motives?.random !== false && Math.random() < randomChance) contributions.push(['random', MOTIVE_WEIGHTS.random]);
        const gain = BASE_URGENCY + contributions.reduce((sum, [, weight]) => sum + weight, 0);
        actor.urgency = Number((actor.urgency + gain).toFixed(2));
        const threshold = Number.isFinite(Number(urgencyThreshold)) && Number(urgencyThreshold) > 0 ? Number(urgencyThreshold) : 2;
        if (actor.urgency < threshold) return { status: 'accumulating', urgency: actor.urgency, threshold };

        actor.urgency = 0;
        actor.nextOkAt = currentMs + Math.max(1, Number(cooldownMinutes) || 30) * 60_000;
        const top = MOTIVE_ORDER.map(motive => contributions.find(([name]) => name === motive)).find(Boolean);
        seq += 1;
        const item = {
            id: `reachout-${seq}`,
            npcId: id,
            motive: top?.[0] ?? 'random',
            urgency: Number(gain.toFixed(2)),
            day: Number.isFinite(Number(day)) && Number(day) > 0 ? Number(day) : null,
            at: stamp(),
            opening: '',
            reason: '',
            topic: '',
        };
        pending.set(item.id, item);
        return { status: 'queued', item: structuredClone(item) };
    }

    /** 开场白由入口的 LLM 调用生成后接回队列；接不上（失败）就从队列撤下。 */
    function attachMessage(id, { opening = '', reason = '', topic = '' } = {}) {
        const item = pending.get(id);
        if (!item) return { status: 'missing' };
        const text = typeof opening === 'string' ? opening.trim() : '';
        if (!text) {
            pending.delete(id);
            return { status: 'dropped', reason: 'empty_message' };
        }
        item.opening = text.slice(0, 600);
        item.reason = typeof reason === 'string' ? reason.trim().slice(0, 60) : '';
        item.topic = typeof topic === 'string' ? topic.trim().slice(0, 24) : '';
        if (item.topic && item.npcId) {
            const actor = actorOf(item.npcId);
            if (actor) {
                actor.topics.set(item.topic, item.day ?? 0);
                if (actor.topics.size > 40) actor.topics.delete(actor.topics.keys().next().value);
            }
        }
        return { status: 'attached', item: structuredClone(item) };
    }

    /** 话题素材冷却：同一件事说过一次，withinDays 个世界日内不重提（换措辞也拦）。 */
    function topicCooled(npcId, topicKey, day = null, { withinDays = TOPIC_COOLDOWN_DAYS } = {}) {
        const actor = actors.get(cleanId(npcId));
        const key = typeof topicKey === 'string' ? topicKey.trim() : '';
        if (!actor || !key) return false;
        const recorded = actor.topics.get(key);
        if (recorded === undefined) return false;
        if (!Number.isFinite(Number(day)) || Number(day) <= 0) return false;
        return Number(day) - recorded < withinDays;
    }

    function dequeue(id) {
        const item = pending.get(id);
        if (!item) return { status: 'missing' };
        pending.delete(id);
        return { status: 'removed', item };
    }

    /** 玩家明确忽略：撤下 + 加倍冷却，别让同一个人转头又来敲门。 */
    function dismiss(id, { extraCooldownMinutes = 60 } = {}) {
        const item = pending.get(id);
        if (!item) return { status: 'missing' };
        pending.delete(id);
        const actor = actorOf(item.npcId);
        if (actor) {
            const extra = Math.max(0, Number(extraCooldownMinutes) || 60) * 60_000;
            actor.nextOkAt = Math.max(actor.nextOkAt, timeMs() + extra);
            actor.urgency = Math.max(0, actor.urgency - 0.5);
        }
        return { status: 'dismissed', item };
    }

    function markReplied(npcId) {
        const actor = actors.get(cleanId(npcId));
        if (actor) actor.streak = 0;
    }

    /** 玩家没理他：读空气计数 +1，连续 IGNORE_STREAK_MAX 次先收敛（回复后清零）。 */
    function markIgnored(npcId) {
        const actor = actors.get(cleanId(npcId));
        if (actor) actor.streak += 1;
        return { streak: actor?.streak ?? 0, suppressed: (actor?.streak ?? 0) >= IGNORE_STREAK_MAX };
    }

    function setMuted(npcId, value) {
        const id = cleanId(npcId);
        if (!id) return { status: 'invalid' };
        if (value === true) muted.add(id);
        else muted.delete(id);
        return { status: 'ok', muted: muted.has(id) };
    }

    function setQuietWindow(from, to) {
        const clean = value => Number.isInteger(value) && value >= 0 && value <= 23 ? value : 0;
        quiet.from = clean(from);
        quiet.to = clean(to);
        return { ...quiet, active: quiet.from !== quiet.to };
    }

    /** 每轮判断额度：两次正文生成之间的主动判断次数上限，失败也算数。 */
    function beginTurn(quota) {
        turnQuota = Number.isInteger(quota) && quota > 0 ? quota : 0;
        turnSpent = 0;
        return { quota: turnQuota };
    }

    function spendTurn() {
        if (turnSpent >= turnQuota) return false;
        turnSpent += 1;
        return true;
    }

    function turnLeft() {
        return Math.max(0, turnQuota - turnSpent);
    }

    function pendingList() {
        return [...pending.values()].map(item => ({ ...item }));
    }

    function status() {
        return {
            pending: pending.size,
            muted: [...muted],
            quiet: { ...quiet, active: quiet.from !== quiet.to },
            quota: turnQuota,
            quotaLeft: turnLeft(),
            maxPending,
        };
    }

    function snapshot() {
        return {
            version: 1,
            seq,
            actors: [...actors.entries()].map(([id, actor]) => [id, {
                nextOkAt: actor.nextOkAt,
                streak: actor.streak,
                urgency: actor.urgency,
                topics: [...actor.topics.entries()],
            }]),
            pending: [...pending.values()],
            muted: [...muted],
            quiet: { ...quiet },
        };
    }

    function restore(value) {
        actors.clear();
        pending.clear();
        muted.clear();
        seq = 0;
        if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'reset' };
        if (Array.isArray(value.muted)) for (const id of value.muted.slice(0, ACTOR_MAX)) if (typeof id === 'string' && id.trim()) muted.add(id.trim().toLowerCase());
        if (Array.isArray(value.pending)) {
            for (const raw of value.pending.slice(0, maxPending)) {
                if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id || typeof raw.npcId !== 'string' || !raw.npcId) continue;
                pending.set(raw.id, {
                    id: raw.id,
                    npcId: raw.npcId,
                    motive: MOTIVE_LABELS[raw.motive] ? raw.motive : 'random',
                    urgency: Number(raw.urgency) || 0,
                    day: Number.isFinite(Number(raw.day)) && Number(raw.day) > 0 ? Number(raw.day) : null,
                    at: typeof raw.at === 'string' ? raw.at : stamp(),
                    opening: typeof raw.opening === 'string' ? raw.opening.slice(0, 600) : '',
                    reason: typeof raw.reason === 'string' ? raw.reason.slice(0, 60) : '',
                    topic: typeof raw.topic === 'string' ? raw.topic.slice(0, 24) : '',
                });
                seq = Math.max(seq, Number.parseInt(raw.id.replace('reachout-', ''), 10) || 0);
            }
        }
        if (Array.isArray(value.actors)) {
            for (const [id, raw] of value.actors.slice(0, ACTOR_MAX)) {
                if (typeof id !== 'string' || !id.trim() || !raw || typeof raw !== 'object') continue;
                actors.set(id, {
                    nextOkAt: Number(raw.nextOkAt) || 0,
                    streak: Number.isInteger(raw.streak) && raw.streak > 0 ? raw.streak : 0,
                    urgency: Number(raw.urgency) || 0,
                    topics: new Map((Array.isArray(raw.topics) ? raw.topics : []).filter(([key, day]) => typeof key === 'string' && key && Number.isFinite(Number(day))).slice(-40)),
                });
            }
        }
        if (value.quiet && typeof value.quiet === 'object') setQuietWindow(value.quiet.from, value.quiet.to);
        if (Number.isInteger(value.seq) && value.seq > seq) seq = value.seq;
        return { status: 'restored' };
    }

    function clear() {
        actors.clear();
        pending.clear();
        muted.clear();
        quiet.from = 0;
        quiet.to = 0;
        seq = 0;
        turnQuota = 0;
        turnSpent = 0;
    }

    return Object.freeze({
        evaluate, attachMessage, topicCooled, dequeue, dismiss, markReplied, markIgnored,
        setMuted, setQuietWindow, beginTurn, spendTurn, turnLeft, pendingList, status,
        snapshot, restore, clear,
    });
}
