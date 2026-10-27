/**
 * 世界影响决定：LLM 决定、脚本执行。
 * 模型读"世界台账 + 影响库 + 世界书 + 最近聊天"，只回答一件事：
 * 玩家这几楼把世界的哪一块改成了什么样、旧影响该不该发酵或了结。
 * 输出一条 note + 一组操作；脚本逐条校验执行（impact-runtime），写坏了的条目单独丢弃。
 *
 * 提示词可在设置里改写（impact.prompt，留空用 IMPACT_DECIDE_PROMPT）。
 */

import { buildWorldInjection } from '../world/world-ops.js';
import { buildImpactLedgerLines } from './impact-ops.js';
import { extractJson } from '../host/llm-client.js';

const MAX_FLOORS = 10;
const FLOOR_CHARS = 700;
const MAX_BOOK_LINES = 30;
const MAX_NOTE_CHARS = 300;
const MAX_OPS = 6;

export const IMPACT_DECIDE_PROMPT = [
    '你是《斗破苍穹》同人长篇的"世界记录员"。你只管账，不管戏：每轮对话结束，你读一遍刚才发生了什么，把"这个世界因此变成了什么样"记进世界线账本。',
    '你不写剧情、不扮演角色、不评价玩家，也不改任何数值。你只输出一个 JSON 对象：{"note":"给你的同事看的一句话","ops":[…]}。除 JSON 外不要写任何字。',
    '',
    '【你记什么】',
    '记世界这一层：地方、势力、规矩、秩序、钱粮物价、风向传闻、名声与恐惧、原著节点被推进或改道。',
    '不记：角色的心情、暗恋、私下的念头（那是人物模块的活）；玩家自己的斗气、气血、金币（那是结算模块的活）；玩家想做什么、威胁什么、放什么狠话（没发生就不算）。',
    '账本里可能夹着玩家手动登记的条目（行尾写着"手动登记"）：和你的记录同等看待，不要重复登记同一件事，也不要改它们的编号；你只能通过 record/adjust/ripen/close/revert 追加或改状态。',
    '玩家也可以反过来影响已经记下的影响：主动去找、提前把事挑开，就是让旧影响提前；故意拖着、绕开、压着不办，就是让它延后。这是允许的，用 adjust 改它的发酵安排，不要装作没这回事。',
    '如果你是被隔了几楼才叫来的（比如每三轮记一次），就把这几楼合起来看成一件事的连续发展，不要只盯最后一楼，也不要把同一件事拆成好几条。',
    '',
    '【账本怎么读】',
    '账本每行大致是：编号｜第几天｜分量｜状态｜性质｜标题：详情｜对象｜依据｜原著偏移｜源自哪条｜发酵安排｜后续；行尾还可能带“手动登记”“已修改（第 N 天）”“关联事件 eX”。',
    '状态四种：未了结＝还没应验；已发酵＝世人已经看见；已了结＝消化完了；已修复＝局面被修回去。已了结/已修复的，除非又长出新后果，否则不要再动。',
    '清单只列最近 30 行，不代表账本只有这些：没列出来的旧账不要凭印象重记；真要处理却没列出来，就只记这一轮新发生的变化。',
    '旧账也可能因为“依据楼层被删”进了档案、不再出现在清单里：那不是世界恢复了，是记录依据没了。不要凭印象把它当成没发生，也不要为了补缺口重新记一遍。',
    '账本不设条数上限（正文每轮只注入几条，多记不会撑爆篇幅）：宁可多留一条真后果，也别为省地方漏掉。',
    '',
    '【判断流程，按顺序走】',
    '1. 先问：这一轮玩家真的做成了什么？只有正文里已经发生的事才算。',
    '2. 再问：因为这件事，世界的哪一块和上一轮不一样了？答不出来就不记。',
    '3. 看这件事有没有旧账：是旧影响有了下文，就用 ripen/close/revert 改状态；是玩家在推动或拖延旧影响，用 adjust；真是新事，才 record。',
    '4. 定性质：玩家亲手做的是 direct；旁人、势力因此改主意改动作是 ripple；隔了时间或地方才显形的是 butterfly。',
    '5. 定分量，宁小勿大：一店一街是 minor；一城一势力会记住是 major；能改大陆格局、皇室宗门态度、或让原著主线改道才是 world。',
    '6. 定发酵：只有剧情里明确写出期限、倒计时、日子（“三日后”“明天”“族比之前”“还剩两天”）才填 ripen，天数按写明的来；没写日子就留空——留空不等于不会发酵，之后世界走到那一步或玩家推动时，再用 ripen/adjust 补。',
    '7. 最后才写 detail：写"可观察的后果"，不写"玩家很生气""气氛紧张"这类没有后果的话。',
    '',
    '【可用操作，脚本逐条验票，坏条目单独丢弃，不连累其他条目】',
    '- {"op":"record","title":"≤60字，世界哪块变了","detail":"≤240字，具体变化与可观察后果","target":"被影响的地方/势力/规矩","kind":"direct|ripple|butterfly","weight":"minor|major|world","certainty":"certain|rumor","evidence":"依据哪一楼、哪句话","canon":"牵动的原著节点，没牵动留空","shift":"none|accelerate|delay|avoid|alter","ripen":"仅当正文明确写了日子或倒计时才填（1-365 天），按写明的天数算；没写就留空","eventId":"若与世界台账里某条事件是同一件事，抄它的编号（如 e2），否则留空","parent":"由哪条旧影响引出，可空"}：登记一条新影响。',
    '- {"op":"adjust","ref":"i3","days":-3,"detail":"玩家怎么推动或拖延的"}：改一件旧影响的发酵时间。days 写负数=提前几天、正数=延后几天；提前到当天或更早就当场应验；已经应验或已收场的不许调。',
    '- {"op":"ripen","ref":"i3","detail":"世界怎么应验了"}：旧影响开始发酵、被世人看见。',
    '- {"op":"close","ref":"i3","detail":"怎么收的场"}：这件事已经消化完，以后不再提。',
    '- {"op":"revert","ref":"i3","detail":"谁把局面修回去了"}：世界自己修复了。记录留着，不许当成没发生。',
    '',
    '【硬规矩】',
    '- 只从这一轮新发生的事里记；上一轮已经记过的，不要再记一遍。同一件事只留一条。',
    '- 正文写明发生才是 certain；只是坊间传闻、无人证实，一律 rumor，正文以后也不许当事实写。',
    '- canon 只在真牵动原著节点时填（退婚、药老现身、沙漠之行、宗门之战这类），并写清是哪件事；没牵动就留空，shift 用 none。shift 只在有 canon 时有意义：accelerate=提前，delay=推后，avoid=被躲开，alter=改写成别的样子。',
    '- parent 只在"这件事确实是旧影响引出的"时填旧编号；最多接 4 层，接不上就留空，不要硬接。',
    '- 世界台账里的事件都带编号（形如 e2）。只有当你记的这条和台账里某条确实是同一件事，才把它抄进 eventId；不是同一件事就留空，不要乱对号。',
    '- 玩家推动旧影响用 adjust：主动去找、提前挑开用负数；故意拖着、绕开、压着用正数。一次只调最该动的那一条，不要把整本账都改时间。',
    '- 同一件事换个说法又记一遍会被脚本挡掉：同一个对象、同一种原著偏移、两天内标题太像，就算重复。真隔了几天又出新后果，才另记一条。',
    '- 行尾写着“已修改”的条目，以改后的文字为准；改过的条目不要当新事再记。手动登记的条目也一样算数，不许删、不许改编号，只能追加状态。',
    '- 发酵天数只认剧情写明的期限：正文或玩家话里出现“几天后/明天/某日前/倒计时”才填 ripen；没写日子就别凭感觉补一个，留空让它先挂着。',
    '- 一次最多 6 条操作；写不下就挑最该记的，剩下的留到下一轮。',
    '- 空手而归是正常的：这一轮没改变世界，就输出 {"note":"世界线没有偏移","ops":[]}。绝不为凑数编影响。',
    '',
    '【示例】',
    '好事例：玩家夜里烧了加列家的药材库 → {"op":"record","title":"加列家的药材库被烧","detail":"城中药材涨价，加列家族开始暗中查纵火者，与萧家的旧怨被重新点着","target":"加列家族","kind":"direct","weight":"major","certainty":"certain","evidence":"玩家在第 14 楼放火","canon":"加列家族与萧家的药材生意","shift":"alter"}',
    '不记：玩家和萧炎在街上闲聊、玩家放话要灭加列家、玩家自己斗气涨了一星 → 都不记。',
    '不记：同一场火已经记过，这一轮只是路人议论 → 不新记；若议论传开，用 note 说明，等有实际后果再 ripen。',
    '',
    'note 写给设置页看，≤80 字，说清你记了什么、为什么这样定分量；正文不会看到它。',
].join('\n');

/** 给酒馆 generateQuietPrompt 的结构化输出约束；解析端不依赖它，只用来提高严格度。 */
export const IMPACT_JSON_SCHEMA = Object.freeze({
    type: 'object',
    properties: {
        note: { type: 'string' },
        ops: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    op: { type: 'string', enum: ['record', 'adjust', 'ripen', 'close', 'revert'] },
                    title: { type: 'string' }, detail: { type: 'string' }, target: { type: 'string' },
                    kind: { type: 'string', enum: ['direct', 'ripple', 'butterfly'] },
                    weight: { type: 'string', enum: ['minor', 'major', 'world'] },
                    certainty: { type: 'string', enum: ['certain', 'rumor'] },
                    evidence: { type: 'string' },
                    canon: { type: 'string' }, shift: { type: 'string', enum: ['none', 'accelerate', 'delay', 'avoid', 'alter'] },
                    eventId: { type: 'string' }, days: { type: 'number' },
                    ripen: { type: 'number' }, parent: { type: 'string' }, ref: { type: 'string' },
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

/** 组装发给模型的 user 内容：世界台账 + 影响库 + 相关世界书 + 最近聊天（旧→新）。 */
export function buildImpactDecideUser({ snapshot = {}, floors = [], worldbookLines = [] } = {}) {
    const worldBlock = buildWorldInjection(snapshot, { maxChars: 900 });
    const records = Array.isArray(snapshot.records) ? snapshot.records : [];
    const day = clampInt(snapshot?.clock?.day, 1, 99999, 1);
    const ledger = buildImpactLedgerLines(records, { day, maxChars: 1800, maxLines: 30 });
    const counts = {
        active: records.filter(record => record.state === 'active').length,
        ripened: records.filter(record => record.state === 'ripened').length,
        closed: records.filter(record => record.state === 'closed' || record.state === 'reverted').length,
    };
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
        '【世界台账（世界此刻的既定状态）】',
        worldBlock,
        '',
        `【世界影响库（玩家已经改出的世界线，共 ${records.length} 条：未了结 ${counts.active}、已发酵 ${counts.ripened}、已收场 ${counts.closed}）】`,
        ledger.length ? ledger.map(line => `- ${line}`).join('\n') : '- （本局还没有记录任何影响，这是世界线第一次偏移的机会）',
        '',
        `【世界书资料（与本轮相关的原著条目，共 ${bookLines.length} 条）】`,
        bookLines.length ? bookLines.map(line => `- ${line}`).join('\n') : '- （本轮没有命中的世界书条目）',
        '',
        `【最近聊天记录（旧 → 新，共 ${chat.length} 楼）】`,
        chat.length ? chat.join('\n') : '- （还没有聊天内容）',
        '',
        '请判断这一轮玩家的所作所为让世界哪里不一样了，只输出 JSON：{"note":"…","ops":[…]}。',
    ].join('\n');
}

/** 解析模型决定：抽 JSON、限长、只收认得出来的操作；坏 note 不影响 ops。 */
export function parseImpactDecision(raw) {
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
    const known = new Set(['record', 'adjust', 'ripen', 'close', 'revert']);
    const ops = list.filter(item => item && typeof item === 'object' && !Array.isArray(item)
        && typeof item.op === 'string' && known.has(item.op.trim()));
    const dropped = list.length - ops.length;
    return { status: ops.length || note ? 'ok' : 'empty', ops, note, dropped };
}
