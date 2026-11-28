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
import { canonNodePromptLines } from './canon-nodes.js';

export const IMPACT_DECIDE_PROMPT = [
    '你是《斗破苍穹》同人长篇的"世界记录员"。你只管账，不管戏：每轮对话结束，你读一遍刚才发生了什么，把"这个世界因此变成了什么样"记进世界线账本。',
    '你不写剧情、不扮演角色、不评价玩家，也不改任何数值。你只输出一个 JSON 对象：{"note":"给你的同事看的一句话","ops":[…]}。除 JSON 外不要写任何字。',
    '',
    '【你记什么】',
    '记世界这一层：地方、势力、规矩、秩序、钱粮物价、风向传闻、名声与恐惧、原著节点被推进或改道。',
    '不记：角色的心情、暗恋、私下的念头（那是人物模块的活）；玩家自己的斗气、气血、金币（那是结算模块的活）；玩家想做什么、威胁什么、放什么狠话（没发生就不算）。',
    '账本里可能夹着玩家手动登记的条目（行尾写着"手动登记"）：和你的记录同等看待，不要重复登记同一件事，也不要改它们的编号；你只能通过 record/adjust/ripen/close/revert 追加或改状态。',
    '玩家也可以反过来影响已经记下的影响：主动去找、提前把事挑开，就是让埋着的因早点露头；故意拖着、绕开、压着不办，就是让它继续埋着。这是允许的，用 adjust 说明它沉下去还是捞上来，不要装作没这回事。',
    '如果你是被隔了几楼才叫来的（比如每三轮记一次），就把这几楼合起来看成一件事的连续发展，不要只盯最后一楼，也不要把同一件事拆成好几条。',
    '',
    '【账本怎么读】',
    '账本每行大致是：编号｜第几天｜分量｜状态｜性质｜标题：详情｜埋着（因：…｜等：…）｜对象｜依据｜原著偏移｜源自哪条｜后续；行尾还可能带“手动登记”“已修改（第 N 天）”“关联事件 eX”。',
    '状态五种：未了结＝世界已经变了、摆在那儿；埋着＝已经埋进世界、当事人还不知道（这颗因等某个场面来认领）；已应验＝已经显形；已了结＝消化完了；已修复＝局面被修回去。已了结/已修复的，除非又长出新后果，否则不要再动。',
    '账本里没有“第几天发作”这回事：影响不按日子推进，只按场面兑现。写进账本的“第几天”只是记账那天的日期，不能拿来算什么时候显形。',
    '清单只列最近 30 行，不代表账本只有这些：没列出来的旧账不要凭印象重记；真要处理却没列出来，就只记这一轮新发生的变化。',
    '旧账也可能因为“依据楼层被删”进了档案、不再出现在清单里：那不是世界恢复了，是记录依据没了。不要凭印象把它当成没发生，也不要为了补缺口重新记一遍。',
    '账本不设条数上限（正文每轮只注入几条，多记不会撑爆篇幅）：宁可多留一条真后果，也别为省地方漏掉。',
    '',
    '【判断流程，按顺序走】',
    '1. 先问：这一轮玩家真的做成了什么？只有正文里已经发生的事才算。',
    '2. 再问：因为这件事，世界的哪一块和上一轮不一样了？答不出来就不记——**但如果这一轮埋下了一颗以后才显形的种子，也要记**（用 record 并写 seed/trigger，见下面第 8 步）。',
    '3. 定牵涉：这件事动了谁——势力、地方、人物、剧情线、原著节点、世界事件。能点名就写进 links（type + name），点不出名字就留空；links 是给面板和以后的连锁反应用的，不是必填。',
    '4. 定后果：这件事以后会怎么发作？只有能落成具体后果时才写 effects：开一条世界事件（event）、改名声/通缉（info）、改势力立场（faction）。拿不准就留空——脚本会按分量默认推演，不会让影响烂在账上。',
    '5. 看这件事有没有旧账：是旧影响有了下文，就用 ripen/close/revert 改状态；是玩家在推动或拖延旧影响，用 adjust 让它沉下去或捞上来；真是新事，才 record。',
    '6. 定性质：玩家亲手做的是 direct；旁人、势力因此改主意改动作是 ripple；隔了时间或地方才显形的是 butterfly。',
    '7. 定分量，宁小勿大：一店一街是 minor；一城一势力会记住是 major；能改大陆格局、皇室宗门态度、或让原著主线改道才是 world。',
    '8. 定“要不要埋”：这一轮里如果玩家留下了一样东西、欠下了一个人情、说了一句后来可能被翻出来的话——但它现在就起作用太早、或者当场根本没人当回事——就用 record 把它记下来并填 seed 和 trigger，账本会让它沉底（状态“埋着”）；等以后某个场面撞上它，判定官认出那颗因，它才显形。填了 seed 和 trigger 的记录不要同时指望它当场生效：它是种子，不是闪电。',
    '9. 最后才写 detail：写"可观察的后果"，不写"玩家很生气""气氛紧张"这类没有后果的话。',
    '',
    '【可用操作，脚本逐条验票，坏条目单独丢弃，不连累其他条目】',
    '- {"op":"record","title":"必写：≤30字短标题，一眼看懂世界哪块变了","detail":"≤240字，具体变化与可观察后果","target":"被影响的地方/势力/规矩","kind":"direct|ripple|butterfly","weight":"minor|major|world","certainty":"certain|rumor","evidence":"依据哪一楼、哪句话","canon":"牵动的原著节点名，没牵动留空","shift":"none|accelerate|delay|avoid|alter","canonWhat":"≤60字：这个节点被改成了什么样、改了哪一处","canonBasis":"≤80字：凭正文哪句话看出原著被改了","seed":"≤40字：埋下的“因”是什么东西/人情/话","trigger":"≤60字：等什么场面才显形","eventId":"若与世界台账里某条事件是同一件事，抄它的编号（如 e2），否则留空","parent":"由哪条旧影响引出，可空","links":[{"type":"faction|place|person|thread|canon|event","name":"≤40字"}],"effects":[{"type":"event|info|faction|npc|self","…":"见下"}]}：登记一条新影响。title 必写，只写短标题，具体内容全放 detail。',
    '  · seed + trigger：只有“埋一颗以后才发芽的种子”时才填，而且必须成对填——seed 写清那是什么（“玩家给萧炎的一枚旧护符”），trigger 写清等什么场面（“萧炎被逼到绝境、无路可退”）。两个都填，这条记录就沉底等场面；只填一个等于没填，会被当普通记录。不埋种子就别填这两个字段。',
    '  · links：最多 6 个，写清这件事牵涉到谁；type 只能是 faction（势力）、place（地方）、person（人物）、thread（剧情线）、canon（原著节点）、event（世界事件）。没有具体名字就留空，不要编。',
    '  · effects：最多 3 条，是这件事以后会落成的具体后果；只认五种：',
    '    - {"type":"event","title":"≤30字事件标题","text":"≤120字事件经过","scope":"near|world","participants":["最多3个牵连者"]}：推演成一条世界台账事件。',
    '    - {"type":"info","field":"reputation|wanted","value":"≤60字新值"}：改世界现状里的名声或通缉度。',
    '    - {"type":"faction","name":"势力名","stance":"hostile|wary|neutral|friendly|allied","dynamics":"≤60字这个势力接下来会做什么","founded":"可空，剧情里真的新出现了一个势力才写 true（不写就只认台账里已有的名字）","dissolved":"可空，这个势力覆灭/被吞并才写 true，台账里会给它打上已覆灭标记","note":"≤60字为什么变，可空"}：势力剧变——改立场是常态，覆灭/新建是大变局，都必须是后果真发生时才写。',
    '    - {"type":"npc","name":"必须是人物簿里已有的人名","favor":"-15到15之间的整数，不写就是0","attitude":"≤30字人前态度，可空","privateAttitude":"≤30字私下态度，可空","appellation":"≤20字新称呼，可空","injury":"≤40字伤势，可空","realm":"≤30字新境界，可空","location":"≤40字位置，可空","presence":"在场|不在场，可空","doing":"≤40字正在做什么，可空","note":"≤60字为什么这么变，必填"}：动一个人——看法（好感/态度/称呼）和处境（伤势/境界/位置/在场/在做什么）都能动，写进人物簿（好感仍受单次 ±15 那道闸）。救人一命、坑了他一回、当众驳他脸面，走看法；被囚、重伤、突破、远走、死亡，走处境（死了写 伤势=已身亡 + 在场=不在场）。处境键只在后果真的改变他处境时写，不凭空猜；没真动到人就别写。',
    '    - {"type":"self","field":"gold|item|realm","amount":"金币增减，-500到500的整数","name":"物品名，field=item 时必填","count":"物品增减，-99到99的整数","realm":"新境界，如 斗者／斗师，field=realm 时必填","stage":"境界小阶，可空，如 三星","note":"≤60字为什么变，必填"}：动玩家自己的身家。救了人得谢礼、损兵折将丢东西、被逼着当众突破，都写这条；写进纳戒的账（金币与行囊），境界直接改纳戒境界。没真动到钱物、境界就别写。',
    '  · 拿不准后果就留空：脚本会按分量默认推演（小事偏地方传闻，大事偏势力动作，世界级偏大陆格局），不会让影响烂在账上。',
    '- {"op":"adjust","ref":"i3","detail":"玩家怎么把它从明面上压了回去，或怎么把它翻了出来"}：改一件旧影响的沉浮。days 写负数＝把它沉下去（世人不再谈，等以后的场面）；写正数或省略＝把它捞上来（当场摆在明面上）。已经应验或已收场的不许调。',
    '- {"op":"ripen","ref":"i3","detail":"这一轮它被什么场面认领了","hit":"原文里哪句话说明撞上了"}：埋着的因被撞上、当场显形。只有正文真的写了那个场面才用；ripen 之后它就是已应验。',
    '- {"op":"close","ref":"i3","detail":"怎么收的场"}：这件事已经消化完，以后不再提。',
    '- {"op":"revert","ref":"i3","detail":"谁把局面修回去了"}：世界自己修复了。记录留着，不许当成没发生。',
    '',
    '【硬规矩】',
    '- 只从这一轮新发生的事里记；上一轮已经记过的，不要再记一遍。同一件事只留一条。',
    '- 正文写明发生才是 certain；只是坊间传闻、无人证实，一律 rumor，正文以后也不许当事实写。',
    '- canon 只在真牵动原著节点时填（退婚、药老现身、沙漠之行、宗门之战这类），并写清是哪件事；没牵动就留空，shift 用 none。shift 只在有 canon 时有意义：accelerate=提前，delay=推后，avoid=被躲开，alter=改写成别的样子。既然填了 canon，就用 canonWhat 写清这个节点被你改成了什么样（改的是哪一处、和原著差在哪），再用 canonBasis 摘一句正文里能看出这一改的原话；这两栏是给玩家日后回头对账用的，别写成空话。',
    '- parent 只在"这件事确实是旧影响引出的"时填旧编号；最多接 4 层，接不上就留空，不要硬接。',
    '- 世界台账里的事件都带编号（形如 e2）。只有当你记的这条和台账里某条确实是同一件事，才把它抄进 eventId；不是同一件事就留空，不要乱对号。',
    '- 编号只能抄，不能编：ref / eventId / parent 里出现的编号，必须是「世界影响库」清单里以 # 开头的编号、或「世界台账」里以 e 开头的编号，逐字照抄。清单里没有的编号，ref 会被判成 record_not_found 整条丢掉；parent 接不上会降级成"无来源"照记，但那条影响的因果链就断了——要记新事就 record，不要凭空造一个 ref 去改。',
    '- 玩家把旧影响压下去或翻出来用 adjust：沉下去写负数，捞上来写正数。一次只调最该动的那一条，不要把整本账都翻一遍。',
    '- 同一件事换个说法又记一遍会被脚本挡掉：同一个对象、同一种原著偏移、两天内标题太像，就算重复。真隔了几天又出新后果，才另记一条。',
    '- 行尾写着“已修改”的条目，以改后的文字为准；改过的条目不要当新事再记。手动登记的条目也一样算数，不许删、不许改编号，只能追加状态。',
    '- 没有任何“到第几天自动发作”的机制：不要给影响编一个将来的日子，也不要因为“时间差不多了”就用 ripen。ripen 只在这轮正文真的写出了那颗因被用上的场面时才用。',
    '- links 与 effects 是可选增强：宁可留空，也不要为了好看编对象、编后果。effects 只认事件/名声通缉/势力立场/人物态度/玩家身家五种，不许写别的数值，也不许把已经发生的正文改写成另一种结果。势力立场只改世界现状里已有的势力，不要在影响里新建势力；人物态度只动能人物簿里已有的人；玩家身家（金币/行囊/境界）只在正文真的动了钱物或突破时才写。',
    '- effects 里的 scope 只有 near（地方范围）和 world（整片大陆/格局）两种；participants 只写正文里确实出场或被点名的人，最多 3 个。',
    '- 一次最多 6 条操作；写不下就挑最该记的，剩下的留到下一轮。',
    '- 空手而归是正常的：这一轮没改变世界，就输出 {"note":"世界线没有偏移","ops":[]}。绝不为凑数编影响。',
    '',
    '【示例】',
    '好事例（当场就看见的后果）：玩家夜里烧了加列家的药材库 → {"op":"record","title":"加列家的药材库被烧","detail":"城中药材涨价，加列家族开始暗中查纵火者，与萧家的旧怨被重新点着","target":"加列家族","kind":"direct","weight":"major","certainty":"certain","evidence":"玩家在第 14 楼放火","canon":"加列家族与萧家的药材生意","shift":"alter"}',
    '好事例（埋一颗种子）：玩家把一枚旧护符塞给萧炎，萧炎收下了，当时谁也没当回事 → {"op":"record","title":"萧炎收下一枚旧护符","detail":"护符被萧炎收着，眼下没有任何用处，也没人多问一句","target":"萧炎","kind":"butterfly","weight":"major","certainty":"certain","evidence":"玩家在第 20 楼递给萧炎","seed":"玩家给萧炎的一枚旧护符","trigger":"萧炎被逼到绝境、无路可退"}',
    '  —— 它现在不改变任何东西，只是埋着；等哪天萧炎真的走投无路、护符被用上，判定官会认出它，那一刻它才显形。',
    '不记：玩家和萧炎在街上闲聊、玩家放话要灭加列家、玩家自己斗气涨了一星 → 都不记。',
    '不记：同一场火已经记过，这一轮只是路人议论 → 不新记；若议论传开，用 note 说明，等有实际后果再 ripen。',
    '',
    'note 写给设置页看（≤80 字），说清你记了什么、为什么这样定分量；正文不会看到它。',
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
                    seed: { type: 'string' }, trigger: { type: 'string' }, hit: { type: 'string' },
                    parent: { type: 'string' }, ref: { type: 'string' },
                    links: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                type: { type: 'string', enum: ['faction', 'place', 'person', 'thread', 'canon', 'event'] },
                                name: { type: 'string' },
                            },
                            required: ['type', 'name'],
                        },
                    },
                    effects: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                // 五类后果与提示词一一对应：event/info/faction 落世界台账，
                                // npc 落人物簿（好感走 ±15 的闸），self 落纳戒（金币/行囊/境界）。
                                // 枚举里少一类，走结构化输出（json_schema 严格模式）的后端就永远
                                // 产不出那一类——宽松后端碰巧能用不代表表是对的。
                                type: { type: 'string', enum: ['event', 'info', 'faction', 'npc', 'self'] },
                                title: { type: 'string' }, text: { type: 'string' },
                                scope: { type: 'string', enum: ['near', 'world'] },
                                participants: { type: 'array', items: { type: 'string' } },
                                field: { type: 'string', enum: ['reputation', 'wanted', 'gold', 'item', 'realm'] },
                                value: { type: 'string' },
                                name: { type: 'string' },
                                stance: { type: 'string', enum: ['hostile', 'wary', 'neutral', 'friendly', 'allied'] },
                                dynamics: { type: 'string' },
                                founded: { type: 'boolean' },
                                dissolved: { type: 'boolean' },
                                // npc 后果的字段：看法四件套 + 处境五键，note 必填（脚本侧有同款校验）。
                                favor: { type: 'number' },
                                attitude: { type: 'string' },
                                privateAttitude: { type: 'string' },
                                appellation: { type: 'string' },
                                injury: { type: 'string' },
                                realm: { type: 'string' },
                                location: { type: 'string' },
                                presence: { type: 'string', enum: ['在场', '不在场'] },
                                doing: { type: 'string' },
                                // self 后果的字段：金币增减、物品名与数量、新境界与小阶。
                                amount: { type: 'number' },
                                count: { type: 'number' },
                                realm: { type: 'string' },
                                stage: { type: 'string' },
                                note: { type: 'string' },
                            },
                            required: ['type'],
                        },
                    },
                },
                required: ['op'],
                // 只对 record（新记影响）强制非空短标题；adjust/ripen/close/revert 按编号操作不强制。
                anyOf: [
                    {
                        properties: { op: { enum: ['record'] }, title: { type: 'string', minLength: 1, maxLength: 30, pattern: '\\S' } },
                        required: ['op', 'title'],
                    },
                    {
                        properties: { op: { enum: ['adjust', 'ripen', 'close', 'revert'] } },
                        required: ['op'],
                    },
                ],
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

/** 组装发给模型的 user 内容：世界台账 + 影响库 + 本轮结算裁定 + 原著资料已注入内容 + 最近聊天（旧→新）。 */
export function buildImpactDecideUser({ snapshot = {}, floors = [], worldbookLines = [], settleLines = [] } = {}) {
    const worldBlock = buildWorldInjection(snapshot, { maxChars: Infinity });
    const records = Array.isArray(snapshot.records) ? snapshot.records : [];
    const day = clampInt(snapshot?.clock?.day, 1, 99999, 1);
    const ledger = buildImpactLedgerLines(records, { day });
    const counts = {
        active: records.filter(record => record.state === 'active').length,
        sunk: records.filter(record => record.state === 'sunk').length,
        ripened: records.filter(record => record.state === 'ripened').length,
        closed: records.filter(record => record.state === 'closed' || record.state === 'reverted').length,
    };
    const bookLines = (Array.isArray(worldbookLines) ? worldbookLines : [])
        .filter(line => typeof line === 'string' && line.trim());
    const settle = (Array.isArray(settleLines) ? settleLines : []).filter(line => typeof line === 'string' && line.trim());
    // 正文后影响决定只喂「用户输入＋正文」两楼，全文不截——用户口径 2026-11-18。
    const chat = (Array.isArray(floors) ? floors : [])
        .map(floor => {
            const role = floor?.role === '玩家' ? '玩家' : '角色';
            const body = typeof floor?.text === 'string' ? floor.text.trim() : '';
            return body ? `[${role}] ${body}` : null;
        })
        .filter(Boolean);
    return [
        '【世界台账（世界此刻的既定状态）】',
        worldBlock,
        '',
        `【世界影响库（玩家已经改出的世界线，共 ${records.length} 条：未了结 ${counts.active}、埋着 ${counts.sunk}、已应验 ${counts.ripened}、已收场 ${counts.closed}）】`,
        ledger.length ? ledger.map(line => `- ${line}`).join('\n') : '- （本局还没有记录任何影响，这是世界线第一次偏移的机会）',
        records.length
            ? `- 可用编号（ref 只能从这几个里逐字照抄，别的编号一律算编造）：${records.map(record => record.id).join('、')}`
            : '- 可用编号：暂无（这一轮只能用 record 记新影响，不要写 adjust/ripen/close/revert）',
        '',
        ...(settle.length ? ['【本轮行动结算（生成前已判定，影响库只记与判定一致的世界变化）】', ...settle, ''] : []),
        '【原著资料（本轮已注入的原著条目）】',
        bookLines.length ? bookLines.join('\n\n') : '- （原著资料本轮还没有注入内容）',
        '',
        // 节点表只统一叫法，不排日期：canon 字段写标准名，面板才能归组；没命中就留空。
        '【原著主线节点（只用来统一 canon 字段的叫法；不确定是否牵动就留空，不要硬套）】',
        ...canonNodePromptLines(),
        '',
        `【最近聊天记录（旧 → 新，共 ${chat.length} 楼）】`,
        chat.length ? chat.join('\n') : '- （还没有聊天内容）',
        '',
        '请判断这一轮玩家的所作所为让世界哪里不一样了，只输出 JSON：{"note":"…","ops":[…]}。',
    ].join('\n');
}

/** 解析模型决定：抽 JSON、限长、只收认得出来的操作；坏 note 不影响 ops。 */
// —— 模型输出的字段字数上限（用户口径 2026-11-17：API 输出要有限制，手动面板不设限）。
const IMPACT_TEXT_CAPS = Object.freeze({ title: 20, detail: 240, target: 40, evidence: 120, canon: 60, canonWhat: 60, canonBasis: 80, eventId: 40, seed: 40, trigger: 60, hit: 120 });
const MAX_IMPACT_NOTE_CHARS = 300;
const MAX_IMPACT_OPS = 6;

/** 模型输出的单条影响操作：逐字段按上限截断（超长裁短而不是整条作废）。 */
function capImpactOp(op) {
    if (!op || typeof op !== 'object' || Array.isArray(op)) return op;
    const capped = { ...op };
    for (const [field, cap] of Object.entries(IMPACT_TEXT_CAPS)) {
        if (typeof capped[field] === 'string') capped[field] = capped[field].trim().slice(0, cap);
    }
    if (Array.isArray(capped.links)) {
        capped.links = capped.links.slice(0, 6)
            .filter(link => link && typeof link === 'object')
            .map(link => ({ ...link, name: typeof link.name === 'string' ? link.name.trim().slice(0, 40) : '' }));
    }
    if (Array.isArray(capped.effects)) {
        capped.effects = capped.effects.slice(0, 3)
            .filter(effect => effect && typeof effect === 'object')
            .map(effect => {
                const next = { ...effect };
                for (const field of ['title', 'text', 'value', 'name', 'dynamics']) {
                    if (typeof next[field] === 'string') next[field] = next[field].trim().slice(0, field === 'title' || field === 'name' ? 30 : 120);
                }
                if (Array.isArray(next.participants)) {
                    next.participants = next.participants.slice(0, 3)
                        .filter(name => typeof name === 'string' && name.trim())
                        .map(name => name.trim().slice(0, 12));
                }
                return next;
            });
    }
    return capped;
}

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
    const note = typeof object.note === 'string' ? object.note.trim().slice(0, MAX_IMPACT_NOTE_CHARS) : '';
    const list = Array.isArray(object.ops) ? object.ops.slice(0, MAX_IMPACT_OPS) : [];
    const known = new Set(['record', 'adjust', 'ripen', 'close', 'revert']);
    const ops = list.filter(item => item && typeof item === 'object' && !Array.isArray(item)
        && typeof item.op === 'string' && known.has(item.op.trim())).map(capImpactOp);
    const dropped = list.length - ops.length;
    return { status: ops.length || note ? 'ok' : 'empty', ops, note, dropped };
}
