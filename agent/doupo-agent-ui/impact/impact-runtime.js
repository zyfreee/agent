/**
 * 世界影响库：记录"玩家把这个世界改成了什么样"，是蝴蝶效应的账本。
 *
 * 一条记录 = 一件被世界记住的后果：谁在什么时候、因为玩家的什么动作、
 * 世界哪一块变了、依据在哪一楼、算不算原著走向的偏移、要不要等几天再发酵。
 *
 * 所有修改都走 apply()：模型提出的操作逐条校验，要么生效要么带着原因被拒绝，
 * 绝不抛异常打断调用方。面板手动登记与模型决定走同一条路，规则完全一致。
 * 这里只记账，不写正文、不改数值——正文怎么写由叙事层决定，数值由回合状态决定。
 */

import { titleSimilarity, SIMILAR_WINDOW_DAYS, SIMILAR_SCORE } from '../core/text-similarity.js';
import { readFloorReplay, writeFloorReplay } from '../core/floor-replay.js';

const KINDS = Object.freeze(['direct', 'ripple', 'butterfly']);
const WEIGHTS = Object.freeze(['minor', 'major', 'world']);
const CERTAINTIES = Object.freeze(['certain', 'rumor']);
const SHIFTS = Object.freeze(['none', 'accelerate', 'delay', 'avoid', 'alter']);
/**
 * 一条影响的一生：
 * active   —— 世界已经变了，这一轮就看得见；
 * sunk     —— 埋进世界里了，本人此刻还不知道；等某个场合撞上才显形（蝴蝶效应的本体）；
 * ripened  —— 已应验（世界台账里落了成）；
 * closed / reverted —— 收场 / 修复。
 * 没有“到第 N 天自动发作”：发不发、何时发，只看剧情撞没撞上。
 */
const STATES = Object.freeze(['active', 'sunk', 'ripened', 'closed', 'reverted']);
const SOURCES = Object.freeze(['decide', 'reply', 'manual']);
const MAX_SEED_CHARS = 40;
const MAX_TRIGGER_CHARS = 60;
const MAX_HIT_CHARS = 120;
// 原著偏移的另外两段：具体改写什么（≤60 字）、凭正文哪句话改的（≤80 字）。
// 节点名与怎么改（shift）另有两栏，四段合起来才说清「动了原著哪一处、往哪儿动、动了什么、凭什么」。
const MAX_CANON_WHAT = 60;
const MAX_CANON_BASIS = 80;
/** 一条影响落成后最多挂多少条“回响”痕迹：够看出它一路推到了哪里，又不至于把账本撑大。 */
const MAX_ECHOES = 12;
/** 回响痕迹的种类：剧情线被推动 / 人物被波及 / 世界事件被牵出。 */
export const ECHO_KINDS = Object.freeze(['thread', 'npc', 'event']);

/**
 * 回响：影响落成之后，它在世界上留下的后续痕迹。
 * 只在落成那一刻由执行器写进来（谁被推到了、推到第几天），之后只读不改；
 * 世界事件、余波子影响、人物簿里的痕迹在展示时反查，不重复存。
 */
function cleanEchoes(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const kind = ECHO_KINDS.includes(item.kind) ? item.kind : 'event';
        const id = text(item.id);
        if (!id) continue;
        if (out.some(echo => echo.kind === kind && echo.id === id)) continue;
        out.push({
            kind,
            id: id.slice(0, 40),
            title: text(item.title).slice(0, 40),
            day: clampInt(item.day, 1, 99999, null),
            ...(text(item.note).trim() ? { note: text(item.note).slice(0, 80) } : {}),
        });
        if (out.length >= MAX_ECHOES) break;
    }
    return out;
}

/** 影响牵涉到的对象类型：势力/地方/人物/剧情线/原著节点/世界事件。 */
export const LINK_TYPES = Object.freeze(['faction', 'place', 'person', 'thread', 'canon', 'event']);
/** 后果补丁的类型：开一条世界事件、改世界信息（名声/通缉）、改势力立场、动某个人对你的态度、改玩家自己的账（钱/东西/境界）。 */
export const EFFECT_TYPES = Object.freeze(['event', 'info', 'faction', 'npc', 'self']);
/** 动玩家自己：金币增减、行囊一件东西的得失、境界功法推进。 */
export const EFFECT_SELF_FIELDS = Object.freeze(['gold', 'item', 'realm']);
const MAX_LINKS = 6;
const MAX_LINK_NAME = 40;
const MAX_EFFECTS = 3;
const MAX_EFFECT_TEXT = 120;
const MAX_EFFECT_PARTICIPANTS = 3;
// 一次影响最多把一个人的好感推动 ±15：跟人物簿那道闸（FAVOR_STEP_MAX）同宽，
// 不给“因为是世界影响”开后门；超出的部分直接钳到边上，不报错。
const MAX_EFFECT_FAVOR = 15;
// 一条影响最多动玩家 ±500 金币：够让“救了他一命得一笔谢礼”落地，
// 又不至于一次把家底翻倍（纳戒自己有上限，这里只是第二道闸）。
const MAX_EFFECT_GOLD = 500;
const EFFECT_INFO_FIELDS = Object.freeze(['reputation', 'wanted']);
const EFFECT_STANCES = Object.freeze(['hostile', 'wary', 'neutral', 'friendly', 'allied']);
// 潜伏期那一套（按分量自动排 4/10/20 天）已经拿掉了：世界影响不再由时间驱动，
// 埋下的因要不要显形，只由“这一轮剧情有没有撞上”判断。见 STATES 里的 sunk。

const MAX_RIPEN_DAYS = 999999;
// 判“疑似同一件事”的时间窗：同一个对象、同一种改写、这几天里换了说法又记一遍。
// 参数与相似度算法在世界事件账（world-runtime）共用同一份（core/text-similarity.js）。

// 0 = 不限：账本本身不因为“条数多”而丢东西（注入只挑几条，用不着为了正文缩库）。
const DEFAULT_MAX_RECORDS = 0;
const DEFAULT_MAX_ARCHIVE = 0;
const DEFAULT_MAX_LOG = 999999;
const DEFAULT_MAX_OPS = 6;
const DEFAULT_MAX_CHAIN = 4;
const OPID_MEMORY = 200;

const STATE_RANK = Object.freeze({ active: 0, sunk: 1, ripened: 2, closed: 3, reverted: 4 });
const WEIGHT_RANK = Object.freeze({ world: 0, major: 1, minor: 2 });

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function intIn(value, min, max) {
    const num = Number(value);
    if (!Number.isInteger(num) || num < min || num > max) return null;
    return num;
}

function clampInt(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isInteger(num) || num < min || num > max) return fallback;
    return num;
}

/** 同一个对象、同一种改写、几天内标题高度相似：当成同一件事的重复登记。 */
function looksLikeSameEvent(records, candidate) {
    return records.find(record => record.target === candidate.target
        && record.shift === candidate.shift
        && Math.abs(record.day - candidate.day) <= SIMILAR_WINDOW_DAYS
        && titleSimilarity(record.title, candidate.title) >= SIMILAR_SCORE) || null;
}

/** 牵涉对象：{type,name}，最多 6 个，名称 ≤40 字；不认识的类型直接丢。 */
function cleanLinks(raw) {
    const rows = Array.isArray(raw) ? raw : [];
    const seen = new Set();
    const out = [];
    for (const item of rows) {
        if (out.length >= MAX_LINKS) break;
        if (!item || typeof item !== 'object') continue;
        const type = LINK_TYPES.includes(item.type) ? item.type : '';
        const name = text(item.name);
        if (!type || !name) continue;
        const key = `${type}:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ type, name: name.slice(0, MAX_LINK_NAME) });
    }
    return out;
}

/** 后果补丁：只认白名单里的五种（世界事件/名声通缉/势力立场/人物态度/玩家身家），参数逐项夹紧；坏补丁丢弃，不影响整条记录。 */
function cleanEffects(raw) {
    const rows = Array.isArray(raw) ? raw : [];
    const out = [];
    for (const item of rows) {
        if (out.length >= MAX_EFFECTS) break;
        if (!item || typeof item !== 'object') continue;
        if (item.type === 'event') {
            const title = text(item.title);
            const body = text(item.text);
            if (!title && !body) continue;
            out.push({
                type: 'event',
                title: (title || body).slice(0, 30),
                text: body.slice(0, MAX_EFFECT_TEXT),
                scope: item.scope === 'world' ? 'world' : 'near',
                participants: cleanParticipants(item.participants),
            });
        } else if (item.type === 'info') {
            const field = EFFECT_INFO_FIELDS.includes(item.field) ? item.field : '';
            const value = text(item.value);
            if (!field || !value) continue;
            out.push({ type: 'info', field, value: value.slice(0, 60) });
        } else if (item.type === 'npc') {
            // 动一个人：看法四件套（好感/人前态度/私下态度/称呼）+ 处境五键（伤势/境界/位置/在场/正在做什么）。
            // 处境键让"剧变"真能落到人身上——被囚、重伤、突破、死亡这些不再只能指望正文写到、记录员记到。
            // 只认人物簿里已有的名字（执行器再核一次），好感幅度钳在 ±MAX_EFFECT_FAVOR，理由必填。
            const name = text(item.name);
            const note = text(item.note ?? item.reason);
            if (!name || !note) continue;
            const favor = clampInt(item.favor, -MAX_EFFECT_FAVOR, MAX_EFFECT_FAVOR, 0);
            const attitude = text(item.attitude);
            const privateAttitude = text(item.privateAttitude ?? item.private ?? '');
            const appellation = text(item.appellation);
            const injury = text(item.injury ?? item.伤势);
            const realm = text(item.realm ?? item.境界);
            const location = text(item.location ?? item.位置);
            const doing = text(item.doing ?? item.正在做什么);
            const presenceRaw = text(item.presence ?? item.在场);
            const presence = presenceRaw === '在场' || presenceRaw === 'true' ? '在场'
                : presenceRaw === '不在场' || presenceRaw === 'false' ? '不在场' : '';
            if (!favor && !attitude && !privateAttitude && !appellation && !injury && !realm && !location && !doing && !presence) continue;
            out.push({
                type: 'npc',
                name: name.slice(0, 20),
                favor,
                attitude: attitude.slice(0, 30),
                privateAttitude: privateAttitude.slice(0, 30),
                appellation: appellation.slice(0, 20),
                // 处境类截短：这是"一眼看清他现在怎么样"的格子，不是叙事。
                injury: injury.slice(0, 40),
                realm: realm.slice(0, 30),
                location: location.slice(0, 40),
                doing: doing.slice(0, 40),
                ...(presence ? { presence } : {}),
                note: note.slice(0, 60),
            });
        } else if (item.type === 'self') {
            // 动玩家自己的账：金币增减、行囊一件东西的得失、境界推进。
            // 这三样是主角的身家，改动必须有理由（note 必填）——没有理由的钱物变动是烂账。
            // 幅度在这里先钳死：金币 ±MAX_EFFECT_GOLD、物品数量 ±99、境界只收两段文本。
            const field = EFFECT_SELF_FIELDS.includes(item.field) ? item.field : '';
            const note = text(item.note ?? item.reason);
            if (!field || !note) continue;
            if (field === 'gold') {
                // 超出上限的部分钳到边上，不整条丢：模型常常顺手写个大数，按 500 落地比“什么都没发生”合理。
                const raw = clampInt(item.amount, -999999999, 999999999, 0);
                const amount = Math.max(-MAX_EFFECT_GOLD, Math.min(MAX_EFFECT_GOLD, raw));
                if (!amount) continue;
                out.push({ type: 'self', field: 'gold', amount, note: note.slice(0, 60) });
            } else if (field === 'item') {
                const name = text(item.name);
                const raw = clampInt(item.count, -999999999, 999999999, 0);
                const count = Math.max(-99, Math.min(99, raw));
                if (!name || !count) continue;
                out.push({ type: 'self', field: 'item', name: name.slice(0, 30), count, note: note.slice(0, 60) });
            } else {
                const realm = text(item.realm);
                if (!realm) continue;
                out.push({ type: 'self', field: 'realm', realm: realm.slice(0, 20), stage: text(item.stage).slice(0, 12), note: note.slice(0, 60) });
            }
        } else if (item.type === 'faction') {
            const name = text(item.name);
            // 立场可以留空：执行器会沿用台账里现有的立场，只改动态描述。
            // founded＝剧情里真的新出现了一个势力（执行器放行新建，没写就只认台账里已有的）；
            // dissolved＝这个势力覆灭/被吞并（执行器改成台账里的存亡标记，名字保留）。
            const stance = EFFECT_STANCES.includes(item.stance) ? item.stance : '';
            if (!name) continue;
            const founded = item.founded === true || item.新建 === true;
            const dissolved = item.dissolved === true || item.覆灭 === true;
            const note = text(item.note ?? item.reason);
            out.push({
                type: 'faction',
                name: name.slice(0, 30),
                stance,
                dynamics: text(item.dynamics).slice(0, 60),
                ...(founded ? { founded: true } : {}),
                ...(dissolved ? { dissolved: true } : {}),
                ...(note ? { note: note.slice(0, 60) } : {}),
            });
        }
    }
    return out;
}

function cleanParticipants(raw) {
    const rows = Array.isArray(raw) ? raw : [];
    const out = [];
    for (const item of rows) {
        if (out.length >= MAX_EFFECT_PARTICIPANTS) break;
        const name = text(item);
        if (name) out.push(name.slice(0, 12));
    }
    return out;
}

function initialState(now) {
    return {
        schemaVersion: 1,
        day: 1,
        version: 0,
        // 只数“手改”的序号：面板/手动 apply 才递增，模型落账（decide/reply）不算。
        // 判定官那一轮的注入签名带它——重roll时模型落账不改它（复用判定），手改立刻失效重判。
        manualVersion: 0,
        // 上次叫记录员时停在哪个楼层：记录节奏按它数“之后又生成了几楼”，没记到东西也算数过。
        decidedFloor: -1,
        records: [],
        archive: [],
        log: [],
        // 曝光计数：{ 影响编号: 被摆到判定官面前的次数 }。
        // 埋着的因不砍条数、改按分数排队，靠这个数做“曝光公平”——老没露面的往前排，
        // 露过太多次还一次没撞上的往后挪，免得一条戏永远占着位置。
        exposure: {},
        updatedAt: now(),
    };
}

/** 只保留认识的字段并逐条清洗；坏记录丢弃，不让整份存档作废。 */
function cleanRecord(raw, index) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const title = text(raw.title);
    if (!title) return null;
    const echoes = cleanEchoes(raw.echoes);
    // 原著偏移拆成四段：节点（canon）/ 怎么改（shift）/ 具体改了什么（canonWhat）/ 凭什么（canonBasis）。
    // 旧档把三段塞在一个 canon 字符串里（“三年之约｜accelerate｜玩家提前破关”），
    // 读进来时就地拆开，面板与注入不用再各自猜。
    const canonRaw = text(raw.canon);
    const canonParts = canonRaw.split(/[｜|]/).map(part => part.trim()).filter(Boolean);
    const canonNode = canonParts[0] ?? '';
    const legacyShift = canonParts[1] && SHIFTS.includes(canonParts[1]) ? canonParts[1] : 'none';
    const legacyWhat = canonParts[1] && !SHIFTS.includes(canonParts[1]) ? canonParts.slice(1).join('｜') : (canonParts[2] ?? '');
    const shiftRaw = SHIFTS.includes(raw.shift) ? raw.shift : '';
    return {
        id: text(raw.id) || `i${index + 1}`,
        day: clampInt(raw.day, 1, 99999, 1),
        floor: clampInt(raw.floor, 0, 9999999, null),
        title,
        detail: text(raw.detail),
        target: text(raw.target),
        kind: KINDS.includes(raw.kind) ? raw.kind : 'direct',
        weight: WEIGHTS.includes(raw.weight) ? raw.weight : 'minor',
        certainty: CERTAINTIES.includes(raw.certainty) ? raw.certainty : 'certain',
        evidence: text(raw.evidence),
        canon: canonNode,
        // 与世界台账里的事件对上号时记事件编号（如 e2），面板/账本里能互相点过去。
        eventId: text(raw.eventId),
        // 旧档里 shift 常常是 'none' 而偏移写在 canon 串里：新字段只在真写了偏移时才算数，
        // 否则回落到串里那段，不然旧档的“加速/延后”会在读档时被抹成不牵动。
        shift: canonNode ? (shiftRaw && shiftRaw !== 'none' ? shiftRaw : legacyShift) : 'none',
        // 具体改了原著哪一处、凭正文哪句话改的：只在牵动了节点时才有意义，没牵动就留空。
        canonWhat: canonNode ? text(raw.canonWhat).slice(0, MAX_CANON_WHAT) || legacyWhat.slice(0, MAX_CANON_WHAT) : '',
        canonBasis: canonNode ? text(raw.canonBasis).slice(0, MAX_CANON_BASIS) : '',
        // 牵涉对象与后果补丁：回答“改到了谁、以后会怎么发作”，也供世界台账消费。
        links: cleanLinks(raw.links),
        effects: cleanEffects(raw.effects),
        // 蝴蝶效应的三件套：seed=埋下去的因（实物/人情/一句话），trigger=要等什么场合才显形，
        // hit=真显形那一刻的凭证（谁在什么场合用上了它）。sunk 的记录全靠这三个字段活着。
        seed: text(raw.seed).slice(0, MAX_SEED_CHARS),
        trigger: text(raw.trigger).slice(0, MAX_TRIGGER_CHARS),
        hit: text(raw.hit).slice(0, MAX_HIT_CHARS),
        // 回响：落成那一刻推到了哪条剧情线、波及了谁。只在有货时出现，旧档读进来不会多出空数组。
        ...(echoes.length ? { echoes } : {}),
        // latent 是旧版“按分量自动排潜伏期”的标记，现在不再产生，只保留读旧档；materialized=后果已推进世界台账。
        latent: raw.latent === true,
        materialized: raw.materialized === true,
        materializedDay: clampInt(raw.materializedDay, 1, 99999, null),
        outcomeEventId: text(raw.outcomeEventId),
        state: STATES.includes(raw.state) ? raw.state : 'active',
        // ripenDay 留作旧档兼容：新版不再排期、不再对外显示，也不参与任何判定。
        ripenDay: clampInt(raw.ripenDay, 1, 99999, null),
        ripenedDay: clampInt(raw.ripenedDay, 1, 99999, null),
        resolution: text(raw.resolution),
        resolvedDay: clampInt(raw.resolvedDay, 1, 99999, null),
        parent: text(raw.parent),
        depth: clampInt(raw.depth, 0, 32, 0),
        source: SOURCES.includes(raw.source) ? raw.source : 'decide',
        // 手动改过（改内容或调整时间）：账本里标黄，方便一眼看出哪些不是原账。
        edited: raw.edited === true,
        editedDay: clampInt(raw.editedDay, 1, 99999, null),
        archivedReason: text(raw.archivedReason),
        createdAt: text(raw.createdAt),
    };
}

function normalizeState(raw, now) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const records = (Array.isArray(source.records) ? source.records : []).map(cleanRecord).filter(Boolean);
    return {
        schemaVersion: 1,
        day: clampInt(source.day, 1, 99999, 1),
        version: clampInt(source.version, 0, 9999999, 0),
        manualVersion: clampInt(source.manualVersion, 0, 9999999, 0),
        decidedFloor: clampInt(source.decidedFloor, 0, 9999999, -1),
        records,
        archive: (Array.isArray(source.archive) ? source.archive : []).map(cleanRecord).filter(Boolean).slice(-DEFAULT_MAX_ARCHIVE),
        log: (Array.isArray(source.log) ? source.log : []).slice(-DEFAULT_MAX_LOG),
        exposure: cleanExposure(source.exposure),
        updatedAt: text(source.updatedAt) || now(),
    };
}

/**
 * 曝光计数只留还埋在土里的那些编号：兑现或收场之后这个数就没用了，
 * 留着会让存档越积越脏。上限按账本容量给个宽松值，坏数据一律丢掉不报错。
 */
function cleanExposure(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    for (const [key, value] of Object.entries(raw)) {
        const id = text(key);
        const count = clampInt(value, 0, 9999, null);
        if (!id || count === null) continue;
        out[id] = count;
    }
    return out;
}

/** 留最该留的：没消化、分量重、新的；已了结、旧的先挪进档案。 */
function rankRecord(record) {
    return STATE_RANK[record.state] * 1e6 + WEIGHT_RANK[record.weight] * 1e5 - record.day * 10;
}

export function createImpactRuntime({ maxRecords = DEFAULT_MAX_RECORDS, maxArchive = DEFAULT_MAX_ARCHIVE, maxLog = DEFAULT_MAX_LOG, maxOps = DEFAULT_MAX_OPS, maxChainDepth = DEFAULT_MAX_CHAIN, autoLatent = false, now = () => new Date().toISOString() } = {}) {
    maxRecords = clampInt(maxRecords, 0, 100000, DEFAULT_MAX_RECORDS);
    maxArchive = clampInt(maxArchive, 0, 100000, DEFAULT_MAX_ARCHIVE);
    maxLog = clampInt(maxLog, 1, 999999, DEFAULT_MAX_LOG);
    maxOps = clampInt(maxOps, 1, 24, DEFAULT_MAX_OPS);
    maxChainDepth = clampInt(maxChainDepth, 0, 8, DEFAULT_MAX_CHAIN);
    let state = initialState(now);
    let seq = 0;
    let opIdMemory = [];
    let lastFloor = null; // 最近一次由模型回复落账的楼层：{ floor, undo }，同楼重 roll 时用来回滚

    function find(id) {
        // 台账行以「#i3」开头，模型很容易连着井号一起抄回来——去掉前缀再比对，
        // 否则一条本来正确的引用会被判成 record_not_found 整条丢掉。
        const key = text(id).replace(/^[#＃\s]+/, '');
        if (!key) return null;
        return state.records.find(record => record.id === key) || null;
    }

    function nextId() {
        seq += 1;
        return `i${seq}`;
    }

    /** 库满时把最该淘汰的记录挪进档案：不删除，只是不再注入、不再参与决定。maxRecords 为 0 表示不限。 */
    function prune() {
        if (!maxRecords || state.records.length <= maxRecords) return [];
        const doomed = [...state.records]
            .sort((a, b) => rankRecord(b) - rankRecord(a))
            .slice(0, state.records.length - maxRecords);
        const doomedIds = new Set(doomed.map(record => record.id));
        state.records = state.records.filter(record => !doomedIds.has(record.id));
        state.archive.push(...doomed.map(record => ({ ...record })));
        if (maxArchive) state.archive = state.archive.slice(-maxArchive);
        return doomed.map(record => record.id);
    }

    function rememberOpId(opId) {
        if (!opId) return;
        opIdMemory.push(opId);
        if (opIdMemory.length > OPID_MEMORY) opIdMemory = opIdMemory.slice(-OPID_MEMORY);
    }

    function logEntry(source, summaries, rejected = 0) {
        state.log.push({ at: now(), source, summaries, rejected });
        state.log = state.log.slice(-maxLog);
    }

    /** 到了发酵日就自动翻牌：模型定"几天后发作"，脚本到点执行，不需要人再点一次。 */
    function sweepDue(day, undoSteps) {
        // 时间不再驱动世界影响：旧档里还挂着发酵日的记录，就地改成“埋着等场面”，
        // 既不按日期翻牌，也不丢账。返回空数组，调用方无须处理。
        void day;
        void undoSteps;
        for (const record of state.records) {
            if (record.ripenDay === null) continue;
            if (record.state === 'active') {
                record.state = 'sunk';
                // 旧档是按天数排期的，没有 seed/trigger：直接沉底会变成判定官永远认不了的死账
                // （no_seed_or_trigger 驳回），明面注入也不再出现——两头死。用标题/描述合成一对，
                // 让它保住“能被场面认领”的资格；玩家嫌合成的不好，随时可以手动改写。
                if (!record.seed) record.seed = text(record.title).slice(0, MAX_SEED_CHARS);
                if (!record.trigger) record.trigger = text(record.detail || record.title).slice(0, MAX_TRIGGER_CHARS);
            }
            record.ripenDay = null;
            record.latent = false;
        }
        return [];
    }

    function summaryOf(record) {
        const size = record.weight === 'world' ? '世界级' : record.weight === 'major' ? '大事' : '小事';
        const canon = record.canon ? `；原著偏移：${record.canon}` : '';
        return `影响 +${record.id}（第 ${record.day} 天｜${size}｜${record.target}）：${record.title}${canon}`;
    }

    /** 单条操作校验 + 执行；绝不抛出。undo 是反向操作，供同楼重 roll 撤销。 */
    function runOne(op, { gameDay = state.day, floorKey = null, source = 'decide' } = {}) {
        if (!op || typeof op !== 'object' || Array.isArray(op)) return { ok: false, reason: 'bad_op_shape' };
        const kind = text(op.op);

        if (kind === 'record') {
            const title = text(op.title);
            if (!title) return { ok: false, reason: 'title_missing' };
            const detail = text(op.detail);
            if (!detail) return { ok: false, reason: 'detail_missing' };
            const target = text(op.target);
            if (!target) return { ok: false, reason: 'target_missing' };
            const evidence = text(op.evidence);
            // canon 允许旧写法（“节点｜shift｜改了什么”一整串）：拆出节点、偏移、改了什么三段，
            // 新写的四段（canon/shift/canonWhat/canonBasis）优先。
            const canonRaw = text(op.canon);
            const canonParts = canonRaw.split(/[｜|]/).map(part => part.trim()).filter(Boolean);
            const canon = canonParts[0] ?? '';
            const legacyShift = canonParts[1] && SHIFTS.includes(canonParts[1]) ? canonParts[1] : 'none';
            const legacyWhat = canonParts[1] && !SHIFTS.includes(canonParts[1]) ? canonParts.slice(1).join('｜') : (canonParts[2] ?? '');
            const eventId = text(op.eventId);
            const parentGiven = text(op.parent);
            let parent = parentGiven;
            let depth = 0;
            let parentNote = '';
            if (parentGiven) {
                const upstream = find(parentGiven);
                if (upstream) {
                    depth = upstream.depth + 1;
                    if (depth > maxChainDepth) return { ok: false, reason: 'chain_too_deep' };
                } else {
                    // 模型抄了一个台账里没有的编号：这条影响本身是好的，别整条丢掉，
                    // 只把接不上的父节点去掉，并在摘要里说明，方便事后核对。
                    parent = '';
                    parentNote = `（父影响 ${parentGiven} 不存在，已按无来源记下）`;
                }
            }
            // 同一楼里反复登记同一件事只算一次；没楼号时退回"同一天同一对象同标题"。
            const duplicated = state.records.some(record => record.title === title
                && (floorKey !== null ? record.floor === floorKey : record.day === gameDay && record.target === target));
            if (duplicated) return { ok: false, reason: 'duplicate_record' };
            let ripenDay = null;
            let latent = false;
            if (op.ripen !== undefined && op.ripen !== null) {
                // 旧版“几天后发作”的写法：现在只剩兼容——天数照收但不排期，否则旧提示词会自动把时间又排回来。
                if (intIn(op.ripen, 1, MAX_RIPEN_DAYS) === null) return { ok: false, reason: 'bad_ripen' };
            }
            const kindValue = KINDS.includes(op.kind) ? op.kind : 'direct';
            const weightValue = WEIGHTS.includes(op.weight) ? op.weight : 'minor';
            const seed = text(op.seed).slice(0, MAX_SEED_CHARS);
            const trigger = text(op.trigger).slice(0, MAX_TRIGGER_CHARS);
            const hit = text(op.hit).slice(0, MAX_HIT_CHARS);
            // 埋线：既写了“因”又写了“等什么场面”，就是一颗埋进世界的种子，此刻谁也看不出它将来会怎样。
            // 只有 seed 没 trigger（或反过来）的，按当场可见的普通影响记，别让它挂着一个永远等不到的条件。
            const embed = op.state === 'sunk' || op.embed === true || (seed && trigger);
            const stateValue = embed && seed && trigger ? 'sunk' : 'active';
            const shiftValue = canon ? ((SHIFTS.includes(op.shift) && op.shift) || legacyShift) : 'none';
            // 具体改了哪一处：新写的 canonWhat 优先，其次旧写法里的第三段。
            const canonWhat = canon ? (text(op.canonWhat).slice(0, MAX_CANON_WHAT) || legacyWhat.slice(0, MAX_CANON_WHAT)) : '';
            const canonBasis = canon ? text(op.canonBasis).slice(0, MAX_CANON_BASIS) : '';
            if (looksLikeSameEvent(state.records, { title, target, shift: shiftValue, day: gameDay })) {
                return { ok: false, reason: 'duplicate_similar' };
            }
            const record = {
                id: nextId(),
                day: gameDay,
                floor: floorKey,
                title,
                detail,
                target,
                kind: kindValue,
                weight: weightValue,
                certainty: CERTAINTIES.includes(op.certainty) ? op.certainty : 'certain',
                evidence,
                canon,
                eventId,
                shift: shiftValue,
                canonWhat,
                canonBasis,
                links: cleanLinks(op.links),
                effects: cleanEffects(op.effects),
                seed,
                trigger,
                hit,
                latent,
                materialized: false,
                materializedDay: null,
                outcomeEventId: '',
                state: stateValue,
                ripenDay,
                ripenedDay: null,
                resolution: '',
                resolvedDay: null,
                parent,
                depth,
                source: SOURCES.includes(source) ? source : 'decide',
                edited: false,
                editedDay: null,
                archivedReason: '',
                createdAt: now(),
            };
            state.records.push(record);
            const archived = prune();
            const ripenNote = stateValue === 'sunk' ? `，埋下（因：${seed}｜等：${trigger}）` : '';
            const archiveNote = archived.length ? `；已归档 ${archived.join('、')}` : '';
            return { ok: true, id: record.id, record, summary: `${summaryOf(record)}${ripenNote}${archiveNote}${parentNote}`, undo: { op: '_removeRecord', id: record.id } };
        }

        if (kind === 'ripen' || kind === 'close' || kind === 'revert') {
            const record = find(text(op.ref));
            if (!record) return { ok: false, reason: 'record_not_found' };
            if (record.state === 'closed' || record.state === 'reverted') return { ok: false, reason: 'record_inactive' };
            if (kind === 'ripen' && record.state === 'ripened') return { ok: false, reason: 'already_ripened' };
            const before = {
                op: '_restoreRecord',
                id: record.id,
                state: record.state,
                ripenedDay: record.ripenedDay,
                resolution: record.resolution,
                resolvedDay: record.resolvedDay,
                hit: record.hit,
            };
            const note = text(op.detail) || record.resolution;
            if (kind === 'ripen') {
                // 应验的那一条要带上“凭证”：哪个场合、什么动作把埋下的因认领了。
                const hit = text(op.hit);
                record.state = 'ripened';
                record.ripenedDay = gameDay;
                record.resolution = note;
                if (hit) record.hit = hit.slice(0, MAX_HIT_CHARS);
            } else {
                record.state = kind === 'close' ? 'closed' : 'reverted';
                record.resolvedDay = gameDay;
                record.resolution = note;
            }
            const verb = kind === 'ripen' ? '应验' : kind === 'close' ? '了结' : '修复';
            return { ok: true, id: record.id, record, summary: `影响${verb} ${record.id}：${record.title}${note ? `（${note}）` : ''}`, undo: before };
        }

        // 手动改一条已经记下的影响：只改内容与埋线，不改“是否收场”（那用 ripen/close/revert）。
        if (kind === 'edit') {
            const record = find(text(op.ref));
            if (!record) return { ok: false, reason: 'record_not_found' };
            const next = { ...record };
            if (op.seed !== undefined) next.seed = text(op.seed).slice(0, MAX_SEED_CHARS);
            if (op.trigger !== undefined) next.trigger = text(op.trigger).slice(0, MAX_TRIGGER_CHARS);
            if (op.hit !== undefined) next.hit = text(op.hit).slice(0, MAX_HIT_CHARS);
            if (op.state !== undefined && STATES.includes(op.state)) {
                next.state = op.state;
            } else if ((next.seed && next.trigger) && (record.state === 'active' || record.state === 'sunk')) {
                // 手改补上因与条件（或删掉其中一个），沉浮跟着变：成对就埋着，拆开就摆回明面。
                next.state = next.seed && next.trigger ? 'sunk' : 'active';
            }
            if (op.title !== undefined) {
                const title = text(op.title);
                if (!title) return { ok: false, reason: 'title_missing' };
                next.title = title;
            }
            if (op.detail !== undefined) {
                const detail = text(op.detail);
                if (!detail) return { ok: false, reason: 'detail_missing' };
                next.detail = detail;
            }
            if (op.target !== undefined) {
                const target = text(op.target);
                if (!target) return { ok: false, reason: 'target_missing' };
                next.target = target;
            }
            if (op.evidence !== undefined) {
                const evidence = text(op.evidence);
                next.evidence = evidence;
            }
            if (op.canon !== undefined) {
                // 手改也认旧写法：一整串“节点｜shift｜改了什么”拆开存，别把三样挤在一个字段里。
                const canonRaw = text(op.canon);
                const canonParts = canonRaw.split(/[｜|]/).map(part => part.trim()).filter(Boolean);
                next.canon = canonParts[0] ?? '';
                if (canonParts[1] && SHIFTS.includes(canonParts[1])) next.shift = canonParts[1];
                const what = canonParts[1] && !SHIFTS.includes(canonParts[1])
                    ? canonParts.slice(1).join('｜')
                    : (canonParts[2] ?? '');
                if (what) next.canonWhat = what.slice(0, MAX_CANON_WHAT);
            }
            if (op.canonWhat !== undefined) next.canonWhat = text(op.canonWhat).slice(0, MAX_CANON_WHAT);
            if (op.canonBasis !== undefined) next.canonBasis = text(op.canonBasis).slice(0, MAX_CANON_BASIS);
            if (op.eventId !== undefined) {
                const eventId = text(op.eventId);
                next.eventId = eventId;
            }
            if (op.kind !== undefined) {
                if (!KINDS.includes(op.kind)) return { ok: false, reason: 'bad_kind' };
                next.kind = op.kind;
            }
            if (op.weight !== undefined) {
                if (!WEIGHTS.includes(op.weight)) return { ok: false, reason: 'bad_weight' };
                next.weight = op.weight;
            }
            if (op.certainty !== undefined) {
                if (!CERTAINTIES.includes(op.certainty)) return { ok: false, reason: 'bad_certainty' };
                next.certainty = op.certainty;
            }
            if (op.shift !== undefined) {
                if (!SHIFTS.includes(op.shift)) return { ok: false, reason: 'bad_shift' };
                next.shift = next.canon ? op.shift : 'none';
            } else if (!next.canon) {
                next.shift = 'none';
            }
            if (op.links !== undefined) next.links = cleanLinks(op.links);
            if (op.effects !== undefined) next.effects = cleanEffects(op.effects);
            // ripen 字段（旧版“还有几天发酵”）已经不用了：写法上仍接受，但不再存、不再排期。
            if (op.ripen !== undefined && op.ripen !== null && intIn(op.ripen, 1, MAX_RIPEN_DAYS) === null) {
                return { ok: false, reason: 'bad_ripen' };
            }
            next.ripenDay = null;
            const duplicated = state.records.some(other => other !== record
                && other.title === next.title && other.target === next.target && other.day === record.day);
            if (duplicated) return { ok: false, reason: 'duplicate_record' };
            const alike = looksLikeSameEvent(state.records.filter(other => other !== record),
                { title: next.title, target: next.target, shift: next.shift, day: record.day });
            if (alike) return { ok: false, reason: 'duplicate_similar' };
            const before = structuredClone(record);
            // 手动改过的账标黄：改内容与调时间都算，便于和模型原账区分。
            next.edited = true;
            next.editedDay = gameDay;
            Object.assign(record, next);
            return { ok: true, id: record.id, record, summary: `影响改写 ${record.id}：${record.title}`, undo: { op: '_restoreEdit', id: record.id, before } };
        }

        // 手动把一条影响挪一挪：沉下去（埋着等场面）或者捞上来（当场就让人看见）。
        // 旧版是“提前/延后几天”，那套时间驱动已经退场，days 参数只为兼容旧调用而保留。
        if (kind === 'adjust') {
            const record = find(text(op.ref));
            if (!record) return { ok: false, reason: 'record_not_found' };
            if (record.state === 'closed' || record.state === 'reverted') return { ok: false, reason: 'record_inactive' };
            if (record.state === 'ripened') return { ok: false, reason: 'already_ripened' };
            const wanted = op.state === 'sunk' || op.state === 'active'
                ? op.state
                : (Number(op.days) < 0 ? 'sunk' : 'active');
            const before = {
                op: '_restoreRecord',
                id: record.id,
                state: record.state,
                ripenedDay: record.ripenedDay,
                resolution: record.resolution,
                resolvedDay: record.resolvedDay,
                ripenDay: record.ripenDay,
                edited: record.edited,
                editedDay: record.editedDay,
            };
            record.state = wanted;
            record.ripenDay = null;
            record.edited = true;
            record.editedDay = gameDay;
            const note = wanted === 'sunk' ? '改成埋着等场面' : '捞上来，当场可见';
            return { ok: true, id: record.id, record, summary: `影响${wanted === 'sunk' ? '下沉' : '浮出'} ${record.id}：${record.title}（${note}）`, undo: before };
        }

        // 手动删除：不真删，挪进档案，后面还能找回来。
        if (kind === 'forget') {
            const id = text(op.ref);
            const at = state.records.findIndex(record => record.id === id);
            if (at < 0) return { ok: false, reason: 'record_not_found' };
            const [record] = state.records.splice(at, 1);
            const archived = { ...structuredClone(record), archivedReason: 'deleted' };
            state.archive.push(archived);
            if (maxArchive && state.archive.length > maxArchive) state.archive.splice(0, state.archive.length - maxArchive);
            return { ok: true, id, record: archived, summary: `删除影响 ${id}：${record.title}（已进档案，可恢复）`, undo: { op: '_restoreArchived', id, record: structuredClone(record), index: at } };
        }

        // 从档案里找回来：库里满了就先别硬塞，避免刚恢复又被容量淘汰。
        if (kind === 'unarchive') {
            const id = text(op.ref);
            const at = state.archive.findIndex(record => record.id === id);
            if (at < 0) return { ok: false, reason: 'archive_not_found' };
            if (find(id)) return { ok: false, reason: 'duplicate_id' };
            if (maxRecords && state.records.length >= maxRecords) return { ok: false, reason: 'library_full' };
            const [record] = state.archive.splice(at, 1);
            const cleaned = cleanRecord({ ...record, archivedReason: '' }, state.records.length);
            if (!cleaned) return { ok: false, reason: 'bad_restore' };
            state.records.push(cleaned);
            return { ok: true, id, record: cleaned, summary: `从档案恢复影响 ${id}：${cleaned.title}`, undo: { op: '_rearchive', id, index: at, reason: record.archivedReason || 'pruned' } };
        }

        // 后果已推进世界台账：记下事件编号，避免同一件事被重复推演。
        // 只由脚本在“发酵之后”调用，模型指南里不出现。
        if (kind === 'materialize') {
            const record = find(text(op.ref));
            if (!record) return { ok: false, reason: 'record_not_found' };
            if (record.materialized) return { ok: false, reason: 'already_materialized' };
            if (record.state !== 'ripened') return { ok: false, reason: 'record_not_ripened' };
            const before = {
                op: '_restoreRecord',
                id: record.id,
                state: record.state,
                ripenedDay: record.ripenedDay,
                resolution: record.resolution,
                resolvedDay: record.resolvedDay,
                materialized: record.materialized,
                materializedDay: record.materializedDay,
                outcomeEventId: record.outcomeEventId,
                hit: record.hit,
                ...(record.echoes ? { echoes: structuredClone(record.echoes) } : {}),
            };
            record.materialized = true;
            record.materializedDay = gameDay;
            record.outcomeEventId = text(op.eventId);
            // 回响随落成一次写定：这是“这条影响到底推到了哪里”的第一手证据，
            // 之后看账本不用再靠读剧情线的 detail 字符串反推。
            const echoes = cleanEchoes(op.echoes);
            if (echoes.length) record.echoes = echoes;
            const note = text(op.detail);
            if (note) record.resolution = note;
            else if (!record.resolution) record.resolution = `第 ${gameDay} 天应验`;
            return { ok: true, id: record.id, record, summary: `影响应验 ${record.id}：${record.title}`, undo: before };
        }

        // 内部撤销：世界那边那条事件已经没了（玩家删事件/事件被并账），落成标记跟着退回。
        // 只由脚本对账时调用，不写进模型指南。
        // 掩盖/坐实：同一条影响在“确凿”与“传闻”之间来回换。掩盖过的以后再落成，世界里推的是传闻口径。
        if (kind === 'rumorize') {
            const record = find(text(op.ref));
            if (!record) return { ok: false, reason: 'record_not_found' };
            const next = op.certainty === undefined ? (record.certainty === 'rumor' ? 'certain' : 'rumor') : op.certainty;
            if (!CERTAINTIES.includes(next)) return { ok: false, reason: 'bad_certainty' };
            if (next === record.certainty) return { ok: false, reason: 'certainty_unchanged' };
            const before = structuredClone(record);
            record.certainty = next;
            record.edited = true;
            record.editedDay = gameDay;
            return {
                ok: true,
                id: record.id,
                record,
                summary: next === 'rumor' ? `影响 ${record.id} 已压成传闻：${record.title}` : `影响 ${record.id} 已坐实：${record.title}`,
                undo: { op: '_restoreEdit', id: record.id, before },
            };
        }

        if (kind === 'unmaterialize') {
            const record = find(text(op.ref));
            if (!record) return { ok: false, reason: 'record_not_found' };
            if (!record.materialized) return { ok: false, reason: 'already_unmaterialized' };
            const before = {
                op: '_restoreRecord',
                id: record.id,
                state: record.state,
                ripenedDay: record.ripenedDay,
                resolution: record.resolution,
                resolvedDay: record.resolvedDay,
                materialized: record.materialized,
                materializedDay: record.materializedDay,
                outcomeEventId: record.outcomeEventId,
                hit: record.hit,
                ...(record.echoes ? { echoes: structuredClone(record.echoes) } : {}),
            };
            record.materialized = false;
            record.materializedDay = null;
            record.outcomeEventId = '';
            // 退回待落成时把回响一起摘掉：那是上一次落成的痕迹，留着会和“还没落成”自相矛盾。
            delete record.echoes;
            const note = text(op.detail);
            if (note) record.resolution = note;
            return { ok: true, id: record.id, record, summary: `影响退回待落成 ${record.id}：${record.title}`, undo: before };
        }

        // 内部撤销操作：只由同楼重 roll 的回滚调用，不写进模型指南。
        if (kind === '_removeRecord') {
            const id = text(op.id);
            const at = state.records.findIndex(record => record.id === id);
            if (at < 0) return { ok: false, reason: 'record_not_found' };
            // 已落成的影响不随同楼重 roll 删除：它的后果已经落进世界/人物簿/纳戒
            // （好感、金币没有幂等闸，删了记录防重闸就认不出“这件事已经落过账”，
            // 新版重记一条会再落一次——好感 +15 变 +30、金币 +500 变 +1000）。
            // 保留原账：重记会被 duplicate_record / duplicate_similar 挡住；
            // 玩家真不要了，用删除（forget）把世界事件一起撤。
            if (state.records[at].materialized) return { ok: true, summary: `影响 ${id} 已落成，重 roll 保留原账` };
            state.records.splice(at, 1);
            return { ok: true, summary: `撤销影响 ${id}` };
        }
        if (kind === '_restoreRecord') {
            const record = find(text(op.id));
            if (!record) return { ok: false, reason: 'record_not_found' };
            record.state = STATES.includes(op.state) ? op.state : 'active';
            record.ripenedDay = clampInt(op.ripenedDay, 1, 99999, null);
            record.resolution = text(op.resolution);
            record.resolvedDay = clampInt(op.resolvedDay, 1, 99999, null);
            if (op.materialized !== undefined) record.materialized = op.materialized === true;
            if (op.materializedDay !== undefined) record.materializedDay = clampInt(op.materializedDay, 1, 99999, null);
            if (op.outcomeEventId !== undefined) record.outcomeEventId = text(op.outcomeEventId);
            // 调整状态也可能改 state/改动标记，撤销时要一并还回去。
            if (op.ripenDay !== undefined) record.ripenDay = clampInt(op.ripenDay, 1, 99999, null);
            if (op.hit !== undefined) record.hit = text(op.hit).slice(0, MAX_HIT_CHARS);
            // 回响也得能跟着落成一起退回去，否则撤销落成后账本还挂着一条不存在的“推进”。
            if (op.echoes !== undefined) {
                const echoes = cleanEchoes(op.echoes);
                if (echoes.length) record.echoes = echoes;
                else delete record.echoes;
            }
            if (op.edited !== undefined) record.edited = op.edited === true;
            if (op.editedDay !== undefined) record.editedDay = clampInt(op.editedDay, 1, 99999, null);
            return { ok: true, summary: `恢复影响 ${record.id}` };
        }
        if (kind === '_restoreEdit') {
            const id = text(op.id);
            const at = state.records.findIndex(record => record.id === id);
            if (at < 0) return { ok: false, reason: 'record_not_found' };
            const cleaned = cleanRecord({ ...op.before, id }, at);
            if (!cleaned) return { ok: false, reason: 'bad_restore' };
            state.records[at] = cleaned;
            return { ok: true, summary: `恢复影响 ${id} 的改写` };
        }
        if (kind === '_restoreArchived') {
            const id = text(op.id);
            const at = state.archive.findIndex(record => record.id === id);
            if (at >= 0) state.archive.splice(at, 1);
            const cleaned = cleanRecord({ ...op.record, id, archivedReason: '' }, state.records.length);
            if (!cleaned) return { ok: false, reason: 'bad_restore' };
            const index = Math.min(Math.max(0, clampInt(op.index, 0, 99999, state.records.length)), state.records.length);
            state.records.splice(index, 0, cleaned);
            return { ok: true, summary: `找回影响 ${id}` };
        }
        if (kind === '_rearchive') {
            const id = text(op.id);
            const at = state.records.findIndex(record => record.id === id);
            if (at < 0) return { ok: false, reason: 'record_not_found' };
            const [record] = state.records.splice(at, 1);
            const archived = cleanRecord({ ...record, id, archivedReason: text(op.reason) || 'deleted' }, state.archive.length);
            if (!archived) return { ok: false, reason: 'bad_restore' };
            state.archive.push(archived);
            if (maxArchive && state.archive.length > maxArchive) state.archive.splice(0, state.archive.length - maxArchive);
            return { ok: true, summary: `影响 ${id} 退回档案` };
        }
        return { ok: false, reason: 'unknown_op' };
    }

    function apply(operations, { source = 'decide', floor = null, day = null } = {}) {
        const floorKey = Number.isInteger(floor) && floor >= 0 ? floor : null;
        const gameDay = intIn(day, 1, 99999) ?? state.day;
        const fromModel = source === 'decide' || source === 'reply';
        // 同一楼重新生成（重 roll/换 swipe）：先把上一版影响处理原样撤销，再执行新版，避免重复记账。
        if (fromModel && floorKey !== null && lastFloor && lastFloor.floor === floorKey) {
            for (const undo of [...lastFloor.undo].reverse()) runOne(undo, { gameDay, floorKey, source: 'revert' });
            opIdMemory = opIdMemory.filter(id => !lastFloor.opIds.includes(id));
            logEntry('revert', [`第 ${floorKey + 1} 楼重新生成：已撤销上一版世界影响`]);
        }
        state.day = gameDay;
        const undoSteps = [];
        const dueIds = sweepDue(gameDay, undoSteps);
        const list = Array.isArray(operations) ? operations.slice(0, maxOps) : [];
        const applied = [];
        const rejected = [];
        const opIds = [];
        const duplicate = [];
        for (const op of list) {
            const opId = text(op?.opId);
            if (opId && opIdMemory.includes(opId)) {
                duplicate.push(opId);
                continue;
            }
            const result = runOne(op, { gameDay, floorKey, source });
            if (result.ok) {
                rememberOpId(opId);
                if (opId) opIds.push(opId);
                applied.push(result);
                if (result.undo) {
                    if (Array.isArray(result.undo)) undoSteps.push(...result.undo);
                    else undoSteps.push(result.undo);
                }
            } else {
                rejected.push({ op: text(op?.op), reason: result.reason });
            }
        }
        // Restoring an archived overdue record must mature in this same call, not on the next turn.
        dueIds.push(...sweepDue(gameDay, undoSteps));
        if (fromModel && floorKey !== null) lastFloor = { floor: floorKey, undo: undoSteps, opIds };
        // “记录节奏”要按“上次叫过记录员之后又生成了几楼”算，没记到东西也算叫过一次。
        if (fromModel && floorKey !== null) state.decidedFloor = floorKey;
        if (applied.length) {
            state.version += 1;
            if (source === 'manual') state.manualVersion += 1;
            state.updatedAt = now();
            logEntry(source, applied.map(item => item.summary), rejected.length);
        } else if (dueIds.length) {
            state.version += 1;
            if (source === 'manual') state.manualVersion += 1;
            state.updatedAt = now();
        }
        return {
            status: rejected.length && !applied.length ? 'rejected' : applied.length ? 'applied' : 'noop',
            applied,
            rejected,
            duplicate,
            due: dueIds,
            version: state.version,
        };
    }

    function list({ state: wanted = '', kind = '', weight = '', canon = '', target = '', dayFrom = null, dayTo = null, limit = 0 } = {}) {
        const from = intIn(dayFrom, 1, 99999);
        const to = intIn(dayTo, 1, 99999);
        const rows = state.records.filter(record => {
            if (wanted && record.state !== wanted) return false;
            if (kind && record.kind !== kind) return false;
            if (weight && record.weight !== weight) return false;
            if (canon && !record.canon.includes(canon)) return false;
            if (target && !record.target.includes(target)) return false;
            if (from !== null && record.day < from) return false;
            if (to !== null && record.day > to) return false;
            return true;
        });
        rows.sort((a, b) => (WEIGHT_RANK[a.weight] - WEIGHT_RANK[b.weight]) || (b.day - a.day));
        return limit > 0 ? rows.slice(0, limit) : rows;
    }

    /** 还埋在世界里、没显形的记录：由“判定官”在每轮生成前扫一遍，判断这一轮有没有撞上。 */
    function pendingRipen(day = state.day) {
        // 名字沿用旧接口（注入与测试都在用），语义已改成“沉底未显形的埋线”。
        void day;
        return state.records.filter(record => record.state === 'sunk');
    }

    /** 沉底未应验的埋线（同 pendingRipen，另给一个语义清楚的名字）。 */
    function sunkRecords() {
        return state.records.filter(record => record.state === 'sunk');
    }

    function snapshot() {
        return structuredClone(state);
    }

    /** 存档用快照：业务状态 + 撤销上一版所需的重放基线，让刷新后重 roll 也能回滚。 */
    function snapshotWithReplay() {
        return { ...structuredClone(state), _runtime: writeFloorReplay({ opIds: opIdMemory, lastFloor }) };
    }

    /** 档案：容量清出与被手动删除的都在这里，面板可只读展示并挑回来。 */
    function archived(limit = 0) {
        const rows = [...state.archive].sort((left, right) => (right.day - left.day) || String(left.id).localeCompare(String(right.id)));
        return limit > 0 ? rows.slice(0, limit) : rows;
    }

    function status() {
        const count = wanted => state.records.filter(record => record.state === wanted).length;
        return {
            day: state.day,
            version: state.version,
            manualVersion: state.manualVersion,
            decidedFloor: state.decidedFloor,
            total: state.records.length,
            active: count('active'),
            sunk: count('sunk'),
            ripened: count('ripened'),
            closed: count('closed'),
            reverted: count('reverted'),
            edited: state.records.filter(record => record.edited).length,
            // 兼容旧字段：现在没有“到期”这回事，恒为 0，免得旧调用方误读成有定时任务。
            due: 0,
            archived: state.archive.length,
        };
    }

    /**
     * 曝光计数：哪几条埋着的因被摆到判定官面前过、各几次。
     * 只回埋着的——兑现/收场之后这个数没意义，查询时顺手过滤，省得调用方自己筛。
     */
    function exposureOf() {
        const sunk = new Set(state.records.filter(record => record.state === 'sunk').map(record => record.id));
        const out = {};
        for (const [id, count] of Object.entries(state.exposure ?? {})) {
            if (sunk.has(id)) out[id] = count;
        }
        return out;
    }

    /**
     * 记一次曝光：这一轮把哪几条埋着的因摆给了判定官。
     * 这不是“账本变化”，不进流水、不动 manualVersion——它只影响下一轮谁先被看到；
     * 但版本号要动，否则面板显示会停在旧数字上。
     */
    function noteExposure(ids) {
        const list = Array.isArray(ids) ? ids : [];
        const sunk = new Set(state.records.filter(record => record.state === 'sunk').map(record => record.id));
        let touched = 0;
        for (const raw of list) {
            const id = text(raw);
            if (!id || !sunk.has(id)) continue;
            state.exposure[id] = clampInt(state.exposure[id], 0, 9999, 0) + 1;
            touched += 1;
        }
        if (touched) {
            state.version += 1;
            state.updatedAt = now();
        }
        return { status: touched ? 'noted' : 'noop', touched };
    }

    /**
     * 楼层被删：这一楼记下的账进档案（不真删，可恢复），它后面楼层的“依据楼层”整体前移一位。
     * 楼层号是账本和聊天对齐的坐标，删楼后不挪，后面所有记录的“依据”都会指错地方。
     */
    function dropFloor(floor, { reason = 'floor_deleted' } = {}) {
        const target = Number(floor);
        if (!Number.isInteger(target) || target < 0) return { status: 'rejected', reason: 'bad_floor', removed: 0, shifted: 0 };
        const doomed = state.records.filter(record => record.floor === target);
        let shifted = 0;
        if (doomed.length) {
            const ids = new Set(doomed.map(record => record.id));
            state.records = state.records.filter(record => !ids.has(record.id));
            state.archive.push(...doomed.map(record => ({ ...structuredClone(record), archivedReason: reason })));
            if (maxArchive) state.archive = state.archive.slice(-maxArchive);
        }
        for (const record of state.records) {
            if (record.floor !== null && record.floor > target) {
                record.floor -= 1;
                shifted += 1;
            }
        }
        for (const record of state.archive) {
            if (record.floor !== null && record.floor > target) record.floor -= 1;
        }
        // 记账指针跟着楼层挪：被删的那层不能再用作“上次记录员来的地方”，否则节奏闸会数错。
        let pointerMoved = false;
        if (lastFloor && lastFloor.floor === target) lastFloor = null;
        else if (lastFloor && lastFloor.floor > target) lastFloor = { ...lastFloor, floor: lastFloor.floor - 1 };
        if (state.decidedFloor > target) { state.decidedFloor -= 1; pointerMoved = true; }
        if (doomed.length || shifted || pointerMoved) {
            state.version += 1;
            state.updatedAt = now();
            const words = [];
            if (doomed.length) words.push(`第 ${target + 1} 楼被删：${doomed.length} 条影响移入档案`);
            if (shifted) words.push(`其余 ${shifted} 条影响的依据楼层前移一位`);
            if (pointerMoved) words.push('记账楼层前移一位');
            logEntry('manual', words);
        }
        return { status: doomed.length || shifted || pointerMoved ? 'applied' : 'noop', removed: doomed.length, shifted, version: state.version };
    }

    function restore(raw) {
        const next = normalizeState(raw, now);
        const all = [...next.records, ...next.archive];
        if (new Set(all.map(record => record.id)).size !== all.length) return { status: 'rejected', reason: 'duplicate_id' };
        state = next;
        seq = all.reduce((max, record) => Math.max(max, Number(String(record.id).replace(/\D/g, '')) || 0), 0);
        // 重放基线跟着存档回来：没有（旧档/被手改）就当不能撤销，与本条之前的旧行为一致。
        const replay = readFloorReplay(raw?._runtime);
        opIdMemory = replay?.opIds ?? [];
        lastFloor = replay?.lastFloor ?? null;
        if (sweepDue(state.day, []).length) {
            state.version += 1;
            state.updatedAt = now();
        }
        return { status: 'restored', ...status() };
    }

    function reset() {
        state = initialState(now);
        seq = 0;
        opIdMemory = [];
        lastFloor = null;
        return { status: 'reset', ...status() };
    }

    /** 不改库、只往流水里记一笔（模型判断无变化、解析失败这类"决定结果"）。 */
    function note(message, { source = 'decide' } = {}) {
        logEntry(source, [String(message)]);
        return { status: 'noted' };
    }

    /** 设置页改上限时热更新；数值越界照构造时的范围夹紧，不抛错。 */
    function configure(patch = {}) {
        if (!patch || typeof patch !== 'object') return { status: 'rejected', reason: 'bad_patch' };
        if (patch.maxRecords !== undefined) maxRecords = clampInt(patch.maxRecords, 0, 100000, maxRecords);
        if (patch.maxArchive !== undefined) maxArchive = clampInt(patch.maxArchive, 0, 100000, maxArchive);
        if (patch.maxLog !== undefined) maxLog = clampInt(patch.maxLog, 5, 200, maxLog);
        if (patch.maxOps !== undefined) maxOps = clampInt(patch.maxOps, 1, 24, maxOps);
        if (patch.maxChainDepth !== undefined) maxChainDepth = clampInt(patch.maxChainDepth, 0, 8, maxChainDepth);
        // autoLatent 已经废掉：时间不再驱动世界影响。设置里仍可能传这个键，收下但不起作用，免得旧存档报错。
        if (patch.autoLatent !== undefined) autoLatent = false;
        return { status: 'configured', config: config() };
    }

    function config() {
        return { maxRecords, maxArchive, maxLog, maxOps, maxChainDepth, autoLatent: false };
    }

    return Object.freeze({
        apply,
        list,
        archived,
        pendingRipen,
        sunkRecords,
        snapshot,
        snapshotWithReplay,
        status,
        exposureOf,
        noteExposure,
        manualVersion: () => state.manualVersion,
        dropFloor,
        restore,
        reset,
        note,
        configure,
        config,
    });
}
