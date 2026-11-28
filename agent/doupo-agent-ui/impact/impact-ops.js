/**
 * 世界影响的呈现层：三问、注入、台账三种排法。
 *
 * 从这一版起，账本里**没有时间线**：一条影响不再"等第 N 天发作"，它要么是
 * 埋进世界里的一颗种子（沉底的因，等某个场面来认领），要么已经显形（已应验/已落成）。
 * 所以这里所有"第 N 天发作""还有 M 天""就快到了"的排期口径全部撤掉，
 * 换成"埋着等什么场面"和"这一轮撞上了没有"。
 *
 * 三者都只读、只排版，不改库；预算到了就从尾部丢行，绝不为了字数把开头截掉。
 */

import { canonNodeLabel } from './canon-nodes.js';

const WEIGHT_LABEL = Object.freeze({ world: '世界级', major: '大事', minor: '小事' });
const STATE_LABEL = Object.freeze({ active: '未了结', sunk: '埋着', ripened: '已应验', closed: '已了结', reverted: '已修复' });
const KIND_LABEL = Object.freeze({ direct: '直接', ripple: '涟漪', butterfly: '蝴蝶' });
const SHIFT_LABEL = Object.freeze({ accelerate: '加速', delay: '延后', avoid: '避过', alter: '改写' });
const WEIGHT_RANK = Object.freeze({ world: 0, major: 1, minor: 2 });
const STATE_RANK = Object.freeze({ active: 0, sunk: 1, ripened: 2, closed: 3, reverted: 4 });
const LINK_TYPE_LABEL = Object.freeze({ faction: '势力', place: '地方', person: '人物', thread: '剧情线', canon: '原著', event: '事件' });
const STANCE_LABEL = Object.freeze({ hostile: '敌对', wary: '警惕', neutral: '中立', friendly: '友好', allied: '同盟' });

export const IMPACT_HEADER = '【世界影响 · 本局世界线】';

export { WEIGHT_LABEL, STATE_LABEL, KIND_LABEL, SHIFT_LABEL };

/** 分量标记：★=世界级，？=只是传闻，其余不标。 */
export function impactMark(record) {
    if (!record) return '';
    return `${record.weight === 'world' ? '★' : ''}${record.certainty === 'rumor' ? '？' : ''}`;
}

/**
 * 原著线当前态：把账本里牵动了原著的影响按节点收拢，同名节点取最新一条偏移——
 * 回答“这条线现在到底被改成什么样了”，不让作者自己从一条条影响里拼。
 * 修复（reverted）的不算，那等于偏移被抹平；了结（closed）的照算——戏收了，偏移既成事实。
 * 节点名走 canon-nodes 的标准名（退婚/三年之约…），没命中就用原文截短。
 */
export function canonLineSummary(records = [], { maxLines = 6 } = {}) {
    const list = (Array.isArray(records) ? records : [])
        .filter(record => record && record.canon && record.state !== 'reverted')
        .sort((a, b) => (b.day ?? 0) - (a.day ?? 0));
    const byNode = new Map();
    for (const record of list) {
        const raw = String(record.canon ?? '').trim();
        if (!raw) continue;
        const node = canonNodeLabel(raw);
        if (!node || byNode.has(node)) continue;
        const how = SHIFT_LABEL[record.shift] ?? '改写';
        const what = String(record.canonWhat ?? '').trim() || record.title;
        // 不带天数戳（注入层"没有天数这一回事"）、不带影响编号（作者注入不出现原始编号，
        // 编号是记录员/判定官材料的事）：作者只需要"这条线现在是什么状态"。
        byNode.set(node, `${node}：已${how}——${what}`);
    }
    return [...byNode.values()].slice(0, Math.max(1, maxLines));
}

/** 埋着的因，一行说清"因什么事、等什么场面"。没写因/等的老记录就退化成普通描述。 */
export function seedLine(record) {
    if (!record) return '';
    const because = record.seed ? `因：${record.seed}` : '';
    const waiting = record.trigger ? `等：${record.trigger}` : '';
    const parts = [because, waiting].filter(Boolean);
    return parts.length ? parts.join('｜') : '';
}

/** 面板/日志用的一行完整摘要。 */
export function summarizeImpact(record) {
    if (!record) return '';
    const head = `${impactMark(record)}第 ${record.day} 天｜${WEIGHT_LABEL[record.weight] ?? '小事'}｜${STATE_LABEL[record.state] ?? '未了结'}`;
    const body = record.detail ? `${record.title}：${record.detail}` : record.title;
    const seeded = record.state === 'sunk' ? seedLine(record) : '';
    const canon = record.canon ? `｜原著偏移（${SHIFT_LABEL[record.shift] ?? '改写'}）：${record.canon}` : '';
    const follow = record.resolution ? `｜后续：${record.resolution}` : '';
    return `${head}｜${body}${seeded ? `｜埋着（${seeded}）` : ''}${canon}${follow}`;
}

function byWeightThenDay(a, b) {
    return (WEIGHT_RANK[a.weight] ?? 1) - (WEIGHT_RANK[b.weight] ?? 1) || b.day - a.day;
}

/** 牵涉对象压成一行：势力·云岚宗/人物·萧战。 */
export function linksSummary(record) {
    if (!record || !Array.isArray(record.links) || !record.links.length) return '';
    return record.links.map(link => `${LINK_TYPE_LABEL[link.type] ?? link.type}·${link.name}`).join('/');
}

/** 后果补丁压成一行：事件《…》；名声→…；势力·云岚宗→敌对。 */
export function effectsSummary(record) {
    if (!record || !Array.isArray(record.effects)) return '';
    return record.effects.map(effect => {
        if (effect.type === 'event') return `事件《${effect.title}》`;
        if (effect.type === 'info') return effect.field === 'wanted' ? `通缉→${effect.value}` : `名声→${effect.value}`;
        if (effect.type === 'faction') return `势力·${effect.name}→${STANCE_LABEL[effect.stance] ?? effect.stance}`;
        if (effect.type === 'npc') {
            const bits = [`人物·${effect.name}`];
            if (Number(effect.favor)) bits.push(`好感${effect.favor > 0 ? '+' : ''}${effect.favor}`);
            if (effect.attitude) bits.push(`态度→${effect.attitude}`);
            if (effect.appellation) bits.push(`称呼→${effect.appellation}`);
            return bits.join('');
        }
        if (effect.type === 'self') {
            if (effect.field === 'gold') return `金币${effect.amount > 0 ? '+' : ''}${effect.amount}`;
            if (effect.field === 'item') return `行囊·${effect.name}${effect.count > 0 ? '+' : ''}${effect.count}`;
            if (effect.field === 'realm') return `境界→${effect.realm}${effect.stage || ''}`;
            return '';
        }
        return '';
    }).filter(Boolean).join('；');
}

/** 正文注入用的短行：不带编号、不带依据，只留"世界已经变成什么样"和"后果是什么"。 */
function injectionLine(record) {
    const ripened = record.state === 'ripened' ? '（已应验）' : '';
    const canon = record.canon ? `（原著·${SHIFT_LABEL[record.shift] ?? '改写'}）` : '';
    const follow = record.resolution ? `→ ${record.resolution}` : '';
    const consequence = effectsSummary(record);
    const tail = [follow, consequence ? `后果：${consequence}` : ''].filter(Boolean).join('；');
    return `· ${impactMark(record)}第 ${record.day} 天｜${WEIGHT_LABEL[record.weight] ?? '小事'}｜${record.title}：${record.detail}${ripened}${canon}${tail ? `｜${tail}` : ''}`;
}

/** 埋着的因：只说"这颗种子在哪儿、等什么场合"，绝不给日期，也绝不写成已经发生。 */
function buriedLine(record) {
    const target = record.target ? `·${record.target}` : '';
    const seeded = seedLine(record);
    return `· ${impactMark(record)}${record.title}${target}${seeded ? `｜${seeded}` : ''}`;
}

/**
 * 三问分解：把同一份账按「做了什么 / 对原著 / 以后」重新分组。
 * 「以后」这一栏现在只分两类：埋着的因等什么场面来认领；已应验的落到哪条事件。
 */
export function impactThreeQuestions(records, { day = 1, doneLimit = 6, futureLimit = 8, nodeLabel = null } = {}) {
    const list = (Array.isArray(records) ? records : []).filter(record => record && record.title);
    const label = typeof nodeLabel === 'function' ? nodeLabel : node => String(node ?? '').slice(0, 12);
    const done = list
        .filter(record => record.state !== 'reverted')
        .sort((a, b) => b.day - a.day || (WEIGHT_RANK[a.weight] ?? 1) - (WEIGHT_RANK[b.weight] ?? 1))
        .slice(0, doneLimit)
        .map(record => `${impactMark(record)}第 ${record.day} 天｜${KIND_LABEL[record.kind] ?? '直接'}｜${record.title}${record.target ? `·${record.target}` : ''}`);
    const canonRows = new Map();
    list.forEach(record => {
        if (!record.canon) return;
        const key = label(record.canon);
        if (!canonRows.has(key)) canonRows.set(key, { node: key, shift: record.shift || 'alter', count: 0, titles: [] });
        const row = canonRows.get(key);
        row.count += 1;
        if (row.titles.length < 2) row.titles.push(record.title);
    });
    const canon = [...canonRows.values()].map(row => `${row.node}｜${SHIFT_LABEL[row.shift] ?? '改写'}｜${row.titles.join('、')}${row.count > 2 ? ` 等 ${row.count} 处` : ''}`);
    const future = list
        .filter(record => record.state === 'sunk' || (record.state === 'ripened' && !record.materialized))
        .slice(0, futureLimit)
        .map(record => record.state === 'ripened'
            ? `已应验、还没落成｜${record.title}`
            : `埋着｜${impactMark(record)}${record.title}${seedLine(record) ? `（${seedLine(record)}）` : ''}`);
    const sunk = list.filter(record => record.state === 'sunk').length;
    const materialized = list.filter(record => record.materialized).length;
    return { done, canon, future, sunk, pending: sunk, soon: 0, materialized };
}

/**
 * 单条影响的三问：做了什么 / 对原著 / 以后会发生。
 * 三问是每条影响自己的属性，不是整页的汇总——面板展开一条、注入里带一条、说书人问一句，
 * 走的是同一个函数，口径不会各说各话。
 * children 传进来时（账本里以本条为 parent 的记录），「以后」会把已长出来的后续也列上。
 */
export function impactAnswers(record, { day = 1, children = [], nodeLabel = null } = {}) {
    if (!record || !record.title) return { done: '', canon: '', future: '' };
    const label = typeof nodeLabel === 'function' ? nodeLabel : node => String(node ?? '').slice(0, 12);
    const target = record.target ? `·${record.target}` : '';
    const links = linksSummary(record);
    const effects = effectsSummary(record);

    // 一、做了什么：性质 + 分量 + 对象 + 自己改了世界哪几样（后果补丁）。
    const doneHead = `${KIND_LABEL[record.kind] ?? '直接'}${record.certainty === 'rumor' ? '·传闻' : ''}｜第 ${record.day} 天｜${WEIGHT_LABEL[record.weight] ?? '小事'}`;
    const doneParts = [`${impactMark(record)}${record.title}${target}`];
    if (links) doneParts.push(`牵涉 ${links}`);
    if (effects) doneParts.push(`改动了 ${effects}`);
    const done = `${doneHead}｜${doneParts.join('；')}`;

    // 二、对原著：只在这条自己牵动了节点时才有第二段，没牵动就说没牵动，别拿整本账的比例冒充。
    let canon = '';
    if (record.canon) {
        // 节点名只写一次：后面那句是这条影响怎么碰到它的，再摆一遍原名只是噪音。
        const node = label(record.canon);
        const how = record.certainty === 'rumor' ? '（只是风声）' : '';
        // 四段口径：节点｜怎么改｜改成了什么样。第三段有货才写，没写就只到“怎么改”。
        const what = typeof record.canonWhat === 'string' ? record.canonWhat.trim() : '';
        canon = `${node}｜${SHIFT_LABEL[record.shift] ?? '改写'}${what ? `：${what}` : ''}${how}`;
    }

    // 三、以后：埋着的说"等什么场面来认领"，撞上了说撞上之后改了什么，落成了说落到哪条事件。
    const futureParts = [];
    if (record.materialized) {
        futureParts.push(record.outcomeEventId ? `已落成世界事件 ${record.outcomeEventId}` : '已经在世界里应验');
        if (Number.isInteger(record.materializedDay)) futureParts.push(`第 ${record.materializedDay} 天落成`);
        if (record.hit) futureParts.push(`撞上的场面：${record.hit}`);
    } else if (record.state === 'sunk') {
        const seeded = seedLine(record);
        futureParts.push(`埋着：${seeded || '埋进世界，等一个场面来认领'}`);
        futureParts.push('什么时候显形，看之后有没有那样的场合，不按日子算');
        if (record.hit) futureParts.push(`已经撞上：${record.hit}`);
    } else if (record.state === 'ripened') {
        futureParts.push('已应验，等下一次推演落进世界台账');
        if (record.hit) futureParts.push(`撞上的场面：${record.hit}`);
    } else if (record.state === 'closed') {
        futureParts.push('已了结，不再往前推');
    } else if (record.state === 'reverted') {
        futureParts.push('已被修复，世界那边的改动已撤回');
    } else {
        futureParts.push('摆在明面上：世界已经变了，还没往哪边倒');
        if (record.certainty === 'rumor') futureParts.push('目前只是风声，看之后会不会坐实');
    }
    if (Array.isArray(children) && children.length) {
        const childText = children.slice(0, 3).map(child => child.title).join('、');
        futureParts.push(`后续 ${children.length} 条：${childText}${children.length > 3 ? ' 等' : ''}`);
    }
    if (record.resolution) futureParts.push(`结果：${record.resolution}`);
    const future = futureParts.filter(Boolean).join('；');
    return { done, canon, future };
}

/**
 * 把影响库压成注入文本，分两段：
 * - 已发生：已经应验或已经摆在明面上的——正文必须当作既成事实；
 * - 埋着的：沉底的因——只有判定官认出这一轮撞上了才会显形，平时绝不写进正文。
 * 库是空的就返回空字符串，调用方据此跳过注入，不留空标题占预算。
 */
export function buildImpactInjection(records, { maxChars = Infinity, maxLines = Infinity, day = 1 } = {}) {
    return buildImpactInjectionDetail(records, { maxChars, maxLines, day }).text;
}

/**
 * 注入文本 + 回执：usedIds 是这一轮真的写进正文的那几条，设置页据此标“本轮已注入”。
 * 正文里不出现编号，但调用方需要知道用了谁，所以内容与 id 一起返回。
 * 字数/行数默认不限制（用户拍板的口径）：有限正数才截断，不填＝全量注入。
 */
export function buildImpactInjectionDetail(records, { maxChars = Infinity, maxLines = Infinity, day = 1 } = {}) {
    const list = Array.isArray(records) ? records : [];
    const happened = list
        .filter(record => record && (record.state === 'ripened' || record.state === 'active'))
        .sort(byWeightThenDay);
    const buried = list
        .filter(record => record && record.state === 'sunk')
        .sort(byWeightThenDay);
    if (!happened.length && !buried.length) return { text: '', usedIds: [] };

    const lines = [];
    const usedIds = [];
    let used = IMPACT_HEADER.length;
    const push = line => {
        if (lines.length && used + line.length + 1 > maxChars) return false;
        lines.push(line);
        used += line.length + 1;
        return true;
    };
    const section = (title, rows, makeLine) => {
        if (!rows.length) return;
        const first = makeLine(rows[0]);
        if (used + title.length + first.length + 2 > maxChars) return;
        if (!push(title)) return;
        for (const record of rows) {
            if (lines.length - 1 >= maxLines) return;
            if (!push(makeLine(record))) return;
            usedIds.push(record.id);
        }
    };
    section('已发生：', happened, injectionLine);
    section('埋着的因（等场面，不按日子）：', buried, buriedLine);
    // 原著线当前态：偏移是既定状态，跟台账一起每轮给作者看——不然“这条线被改成什么样”
    // 散在一条条影响里，了结过的更是从注入里消失，长局里作者会不知不觉写回原著走向。
    const canonLines = canonLineSummary(list, { maxLines: 6 });
    if (canonLines.length) {
        const title = '原著线当前态（每条线取最新偏移，正文必须顺着写，不许写回原著）：';
        const first = canonLines[0];
        if (used + title.length + first.length + 2 <= maxChars) {
            push(title);
            for (const line of canonLines) {
                if (lines.length - 1 >= maxLines) break;
                if (!push(line)) break;
            }
        }
    }
    return { text: [IMPACT_HEADER, ...lines].join('\n'), usedIds };
}

/** 决定模块用的台账行：带编号和状态，模型才能引用旧影响。 */
function ledgerLine(record) {
    const parts = [
        `#${record.id}`,
        `第 ${record.day} 天`,
        WEIGHT_LABEL[record.weight] ?? '小事',
        STATE_LABEL[record.state] ?? '未了结',
        record.certainty === 'rumor' ? '传闻·未证实' : '已证实',
        record.kind !== 'direct' ? KIND_LABEL[record.kind] : '',
        `${record.title}：${record.detail}`,
    ].filter(Boolean);
    if (record.state === 'sunk') {
        const seeded = seedLine(record);
        if (seeded) parts.push(`埋着（${seeded}）`);
    }
    if (record.target) parts.push(`对象：${record.target}`);
    if (record.evidence) parts.push(`依据：${record.evidence}`);
    const links = linksSummary(record);
    if (links) parts.push(`牵涉：${links}`);
    const effects = effectsSummary(record);
    if (effects) parts.push(`后果：${effects}`);
    // 原著那一笔连“改成了什么样”一起给判定官看：只说“加速”，下一轮它还会照着老节点再推一次。
    if (record.canon) parts.push(`原著·${SHIFT_LABEL[record.shift] ?? '改写'}：${record.canon}${record.canonWhat ? `（${record.canonWhat}）` : ''}`);
    if (record.eventId) parts.push(`关联事件：${record.eventId}`);
    if (record.parent) parts.push(`源自：${record.parent}`);
    if (record.hit) parts.push(`撞上的场面：${record.hit}`);
    if (record.materialized) {
        parts.push(`已应验${record.materializedDay ? `（第 ${record.materializedDay} 天）` : ''}${record.outcomeEventId ? `：事件 ${record.outcomeEventId}` : ''}`);
    }
    if (record.resolution) parts.push(`后续：${record.resolution}`);
    if (record.source === 'manual') parts.push('手动登记');
    if (record.edited) parts.push(`已修改${record.editedDay ? `（第 ${record.editedDay} 天）` : ''}`);
    return parts.join('｜');
}

export function buildImpactLedgerLines(records, { maxChars = Infinity, maxLines = Infinity, day = 1 } = {}) {
    const list = (Array.isArray(records) ? records : [])
        .filter(record => record && record.title)
        .sort((a, b) => (STATE_RANK[a.state] ?? 0) - (STATE_RANK[b.state] ?? 0) || byWeightThenDay(a, b));
    const lines = [];
    let used = 0;
    for (const record of list) {
        if (lines.length >= maxLines) break;
        const line = ledgerLine(record);
        if (lines.length && used + line.length + 1 > maxChars) break;
        lines.push(line);
        used += line.length + 1;
    }
    return lines;
}

/**
 * 记录节奏：从"上次叫记录员"的楼层往后数 AI 回复，够“每几轮”才该再叫一次。
 * lastFloor 由影响库的 decidedFloor 提供：没记到东西也算叫过一次，避免干脆每轮都跑。
 */
export function isImpactDecideDue(chat, { every = 1, lastFloor = -1 } = {}) {
    if (!Array.isArray(chat)) return false;
    const step = Number.isInteger(every) && every > 0 ? every : 1;
    let start = Number.isInteger(lastFloor) ? lastFloor + 1 : 0;
    // 上次记到的那一楼还在不在：lastFloor >= chat.length 说明聊天被倒带/删楼了，
    // 那个楼层号已经不存在，宁可从头重新数一遍，也不要从此再也不记账。
    if (start < 0 || start > chat.length) start = 0;
    // 已经记到最后一楼：这一轮没有新楼，等下一楼再说。
    // （这一行必须显式写：不写的话 start 正好等于 chat.length 时循环一次都不跑，
    //  配合调用方把超长楼层号夹成 chat.length - 1，就成了“永远不记账”的死锁。）
    if (start >= chat.length) return false;
    let replies = 0;
    for (let index = start; index < chat.length; index++) {
        const message = chat[index];
        if (!message || message.is_user || message.is_system) continue;
        replies += 1;
        if (replies >= step) return true;
    }
    return false;
}
