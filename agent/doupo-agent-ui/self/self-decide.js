/**
 * 纳戒决定：LLM 决定脚本执行的核心。
 * 模型输入 = 聊天记录 + 世界书条目 + 纳戒现状；输出 = 一条 note + 一组操作；
 * 脚本逐条校验执行（self-runtime），结果原样呈现到面板。
 *
 * 提示词可在设置里改写（self.decidePrompt，留空用 SELF_DECIDE_PROMPT）。
 */

import { buildSelfInjection, capSelfOp, SELF_MODEL_OPS_MAX } from './self-ops.js';
import { extractJson } from '../host/llm-client.js';

const MAX_FLOORS = 12;
const FLOOR_CHARS = 800;
// 最新楼是决定的正文靶子：验药、擦拭装备这类细节段落全在中后段，800 字截断让账房
// 只看到开场就交卷——「凝气固脉」没抄进 effect、玄重尺擦了整段也不补（2026-11-17 实跑）。
// 旧楼维持短截断，总预算可控。
const HEAD_FLOOR_CHARS = 6000;
const MAX_BOOK_LINES = 40;
const MAX_NOTE_CHARS = 300;

/** 默认决定提示词（system）。改写时保持"只输出 JSON"与操作字段名不变，否则脚本解析不到。
 *  模型输出的内容字段有字数上限（用户口径 2026-11-17：API 输出要限定字数，超长在解析层裁短；
 *  手动面板不设限）。提示词把上限写给模型，让它一次写到位。 */
export const SELF_DECIDE_PROMPT = [
    '你是《斗破苍穹》同人角色卡的贴身账房。你只做一件事：读聊天记录、世界书资料和纳戒（主角的自身状态与随身之物），决定主角这一轮之后自身发生了什么变化，输出能被脚本严格执行的 JSON。',
    '只输出一个 JSON 对象：{"note":"一句话说明为什么这么决定","ops":[…]}。不要输出解释、标题或代码块以外的文字。',
    '纳戒只记主角自己：身份信息（姓名/性别/年龄/种族/出身/所属/斗气属性/天赋/外貌）、境界与段位、金币、称号、功法、斗技、装备栏（穿戴中的武器/防具/饰品）、天材地宝（异火、妖丹、灵矿、先天灵物之类）、行囊物品、炼药炼器的配方与进度、目标约定。世界的事件、别人的档案不归你管，一律不记。',
    '可用操作（脚本逐条校验，写错字段的条目会被丢弃，不影响其他条目；内容字段有字数上限，超长会被裁短，照着示例的量级写）：',
    '- {"op":"setProfile","field":"name|gender|age|race|origin|affiliation|attribute|talent|appearance","text":"≤60字，attribute（斗气属性）≤12字"}：身份信息。年龄只在剧情明确过去了一段时间后才改，不要每轮硬加。斗气属性（火/风/雷/冰/水/土/木/暗/毒/无属性等）不轻易变；无属性与特殊体质只在剧情真正揭示时写。',
    '- {"op":"setRealm","realm":"斗者","stage":"三星"}：境界突破。斗气大陆的阶梯是 斗之气(一~九段)→斗者→斗师→大斗师→斗灵→斗王→斗皇→斗宗→斗尊→斗圣→斗帝(各一~九星)；境界必须剧情真到位才写，一场战斗一次突破就够了。',
    '- {"op":"setGold","amount":3200} 或 {"op":"addGold","amount":-500}：金币收支，买卖、赏金、被勒索都对得上账。',
    '- {"op":"addTitle","text":"≤16字"} / {"op":"removeTitle","text":"…"}：称号得失。',
    '- {"op":"addTechnique","name":"焚决","grade":"黄阶低级","type":"修炼功法","progress":"第三层","source":"药老所赠","note":"卷轴古朴，火纹隐现","effect":"火属性功法，能吞噬异火进化"}：获得功法（含身法、炼药术）；{"op":"updateTechnique","id":"t1","progress":"第四层"}：进阶；{"op":"removeTechnique","id":"t1"}：废弃或被夺。',
    '- {"op":"addSkill","name":"八极崩","grade":"黄阶高级","type":"攻击","source":"药老口传","note":"药老随手传的入门斗技","effect":"贴身爆发，一丈内隔空摄物伤人"}：获得斗技；updateSkill/removeSkill 同上。',
    '- {"op":"addItem","name":"回气丹","category":"丹药","grade":"一品","count":3,"source":"穆蛇坊市药铺购得","note":"瓷瓶装，色泽温润","effect":"服用后缓缓恢复斗气"}：获得物品（category：丹药|材料|武器|防具|杂物|关键物）；{"op":"updateItem","id":"b1","count":2} 或 {"op":"removeItem","id":"b1","count":1}：消耗。同名同类别会自动并账；已经穿上/佩戴的装备改用 addEquipment 记装备栏，不要留在行囊里。',
    '- {"op":"addEquipment","name":"玄重尺","grade":"玄阶中品","type":"武器","source":"家传之物","note":"尺身沉重带斗气纹","effect":"挥动压出尺影，重压对手招架"}：获得并穿上装备（type：武器|防具|饰品|其他，进装备栏）；{"op":"updateEquipment","id":"e1","grade":"…"}：精炼、改装、修复；{"op":"removeEquipment","id":"e1"}：脱下、损毁或被夺（想收进行囊就再补一条 addItem）。',
    '- {"op":"addTreasure","name":"青莲地心火","grade":"异火榜第十九","type":"异火","source":"塔戈沙漠地底收服","note":"地底火种，莲形青焰","effect":"可吞噬异火进化，护体焚敌"}：获得天材地宝（type：异火|灵物|矿石|其他，进天材地宝栏）；{"op":"updateTreasure","id":"z1","grade":"…"}：进阶、驯化；{"op":"removeTreasure","id":"z1"}：易主、耗尽或被夺。',
    '- {"op":"addRecipe","name":"回气丹","craft":"炼药","grade":"一品","materials":"凝骨草、青灵芝、两片龙力草","effect":"恢复斗气的入门丹药"}：掌握丹方；{"op":"removeRecipe","id":"r1"}。',
    '- {"op":"startCraft","name":"回气散","craft":"炼药","days":3,"note":"缺一味凝骨草"}：开工炼制；{"op":"finishCraft","id":"c1","result":"success","note":"成丹三枚"}：出炉（fail=炸炉）。炼成后必须再补一条 addItem 把成品记进行囊。',
    '- {"op":"addGoal","title":"三年之约雪前耻","text":"三年之约，云岚宗一雪前耻，当众赢回萧家颜面","priority":"主线","due":"三年后"}：立下目标或约定。title 必写——不超过 20 字短标题，一眼看懂要做什么；完整内容放 text（≤80字），两者不要重复；缺 title 的条目会被脚本整条拒绝。{"op":"finishGoal","id":"g1"}：达成；{"op":"removeGoal","id":"g1"}：放弃或作废。',
    '详情纪律：正文里对一件东西的描述必须原样抄进字段里——effect（效果）写「有什么用、什么威力」：功法斗技写威力与修习层次，装备写防护/攻击效果，天材地宝写能力，丹药写药效；note（备注）写外观、来历与零散补充；grade（品阶写全，如「玄阶中品」而不是「玄阶」）、source（来源：第几楼、谁给的、哪买的、怎么得到的）、progress（功法修习进度），正文里有就都要填上，addRecipe 把主要材料写进 materials。这是硬要求不是建议：正文讲得再细，你不抄进字段，脚本就当它不存在。只交名字（note、effect、grade、source、progress 全空）的新条目会被脚本整条拒绝——那时金币可能已经扣了，东西却没入账，账就烂了；grade/source 写了但 note、effect 还空的条目收得进来，但会被标「详情待补」，之后还要补。纳戒现状里标了「详情待补」的旧条目，正文这轮一提到就优先用对应的 update 操作把缺的详情补全。',
    '记账规则：变化必须从最近剧情里有依据地长出来（战斗获胜、交易成交、有人赠予、炼制出炉），id 只能用纳戒清单里已有的编号；没有依据的不要记，也不要照搬原著桥段——剧情真走到那一步才记。只记「这一轮」发生的变化：纳戒现状里已有的条目、之前楼里已经记过账的交易（比如上一楼买过、金币已扣的东西）不要重复入账。买卖要两讫：这轮扣了金币就必须同轮把买到的东西记进账，别出「钱花了货没入账」的烂账。',
    '交卷前自检：纳戒现状里标「详情待补」的条目，本轮正文只要提到过它（擦拭、使用、说起都算），就必须先补上对应的 update 操作再输出；正文里新出现的东西，grade、source、note、effect 有据可查的都要抄全再交卷——检查完再输出 JSON。一次最多 12 条操作，写不下就留到下一轮。',
    '主角这一轮自身没有变化就输出 {"note":"本轮纳戒无变化","ops":[]}，绝不为凑数而记账。',
].join('\n');

/** 给酒馆 generateQuietPrompt 的结构化输出约束；解析端并不依赖它，只是提高严格度。 */
export const SELF_JSON_SCHEMA = Object.freeze({
    type: 'object',
    properties: {
        note: { type: 'string' },
        ops: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    op: { type: 'string', enum: ['setProfile', 'setRealm', 'setGold', 'addGold', 'addTitle', 'removeTitle', 'addTechnique', 'updateTechnique', 'removeTechnique', 'addSkill', 'updateSkill', 'removeSkill', 'addEquipment', 'updateEquipment', 'removeEquipment', 'addTreasure', 'updateTreasure', 'removeTreasure', 'addItem', 'updateItem', 'removeItem', 'addRecipe', 'removeRecipe', 'startCraft', 'finishCraft', 'addGoal', 'finishGoal', 'removeGoal'] },
                    field: { type: 'string' },
                    text: { type: 'string' },
                    realm: { type: 'string' }, stage: { type: 'string' },
                    amount: { type: 'number' },
                    name: { type: 'string' }, grade: { type: 'string' }, type: { type: 'string' },
                    progress: { type: 'string' }, source: { type: 'string' }, note: { type: 'string' },
                    effect: { type: 'string' },
                    category: { type: 'string' }, count: { type: 'number' }, equipped: { type: 'boolean' },
                    materials: { type: 'string' }, craft: { type: 'string' },
                    id: { type: 'string' }, result: { type: 'string', enum: ['success', 'fail'] },
                    days: { type: 'number' },
                    priority: { type: 'string', enum: ['主线', '支线'] }, due: { type: 'string' },
                    title: { type: 'string', minLength: 1, pattern: '\\S' },
                },
                required: ['op'],
                // addGoal（立目标）强制非空短标题；六种描述性新增（功法/斗技/装备/天材地宝/行囊/配方）
                // 至少带一项细节（note/effect/grade/source/progress 任一有值）——与脚本 details_missing
                // 拒绝同口径，光杆名字不合法；金币/删除/完成等按字段或编号操作不强制。
                anyOf: [
                    {
                        properties: { op: { enum: ['addGoal'] }, title: { type: 'string', minLength: 1, pattern: '\\S' } },
                        required: ['op', 'title'],
                    },
                    {
                        properties: { op: { enum: ['addTechnique', 'addSkill', 'addEquipment', 'addTreasure', 'addItem', 'addRecipe'] } },
                        required: ['op'],
                        anyOf: [
                            { required: ['effect'] },
                            { required: ['note'] },
                            { required: ['grade'] },
                            { required: ['source'] },
                            { required: ['progress'] },
                        ],
                    },
                    {
                        properties: { op: { enum: ['setProfile', 'setRealm', 'setGold', 'addGold', 'addTitle', 'removeTitle', 'updateTechnique', 'updateSkill', 'removeTechnique', 'removeSkill', 'updateEquipment', 'removeEquipment', 'updateTreasure', 'removeTreasure', 'updateItem', 'removeItem', 'removeRecipe', 'startCraft', 'finishCraft', 'finishGoal', 'removeGoal'] } },
                        required: ['op'],
                    },
                ],
            },
        },
    },
    required: ['ops'],
});

/** 找出「详情待补」（note 与 effect 全空）且本轮聊天文本里点过名的条目，连 id 与
 *  对应的 update 操作一起点名。泛泛的"顺手补全"模型总当耳旁风（玄重尺擦了整段都
 *  不补，2026-11-17 实跑）；点名+直接给出 id 和操作名，把"猜操作猜 id"这步也省掉。
 *  正文常只写短名（「玄重尺」）不带全名（「玄重尺·焰陨玄铁」），全名对不上就按
 *  「·」等分隔的短段再试。配方没有 update 操作，不点名。 */
const PENDING_UPDATE_OP_OF = Object.freeze({
    techniques: 'updateTechnique', skills: 'updateSkill', equipment: 'updateEquipment',
    treasures: 'updateTreasure', items: 'updateItem',
});

function pendingDetailNames(snapshot = {}, chatText = '') {
    const out = [];
    for (const [key, opKind] of Object.entries(PENDING_UPDATE_OP_OF)) {
        for (const item of (Array.isArray(snapshot?.[key]) ? snapshot[key] : [])) {
            const name = typeof item?.name === 'string' ? item.name.trim() : '';
            if (!name || !item.id || item.note?.trim() || item.effect?.trim()) continue;
            if (out.some(entry => entry.id === item.id)) continue;
            const hit = chatText.includes(name)
                || name.split(/[·・\-—\s]+/).some(segment => segment.length >= 2 && chatText.includes(segment));
            if (hit) out.push({ name, id: item.id, op: opKind });
        }
        if (out.length >= 6) break;
    }
    return out.slice(0, 6);
}

/** 组装发给模型的 user 内容：纳戒现状（带编号，供 update/remove 引用）+ 本轮结算裁定 + 原著资料已注入内容 + 最近聊天（旧→新）。 */
export function buildSelfDecideUser({ snapshot = {}, floors = [], worldbookLines = [], settleLines = [] } = {}) {
    // 决定喂料的纳戒现状不设字数上限（用户口径 2026-11-17）：账里有多少细节，账房就得全看得见——
    // 之前 1600 字截断会把详情卡从账房眼前截掉，正是「记录不详细」的帮凶。
    const selfBlock = buildSelfInjection(snapshot, { withIds: true });
    const bookLines = (Array.isArray(worldbookLines) ? worldbookLines : [])
        .filter(line => typeof line === 'string' && line.trim())
        .slice(0, MAX_BOOK_LINES);
    const settle = (Array.isArray(settleLines) ? settleLines : []).filter(line => typeof line === 'string' && line.trim());
    const chat = (Array.isArray(floors) ? floors : [])
        .slice(-MAX_FLOORS)
        .map((floor, index, list) => {
            const role = floor?.role === '玩家' ? '玩家' : '角色';
            const cap = index === list.length - 1 ? HEAD_FLOOR_CHARS : FLOOR_CHARS;
            const body = typeof floor?.text === 'string' ? floor.text.trim().slice(0, cap) : '';
            return body ? `[${role}] ${body}` : null;
        })
        .filter(Boolean);
    const chatText = chat.join('\n');
    const pending = pendingDetailNames(snapshot, chatText);
    return [
        '【纳戒现状（主角此刻的自身状态与随身之物）】',
        selfBlock,
        '',
        ...(settle.length ? ['【本轮行动结算（生成前已判定，记账须与此一致）】', ...settle, ''] : []),
        '【原著资料（本轮已注入的原著条目）】',
        bookLines.length ? bookLines.join('\n\n') : '- （原著资料本轮还没有注入内容）',
        '',
        `【最近聊天记录（旧 → 新，共 ${chat.length} 楼）】`,
        chat.length ? chat.join('\n') : '- （还没有聊天内容）',
        '',
        ...(pending.length ? [`【交卷自检：以下「详情待补」条目在本轮正文里出现过】${pending.map(entry => `${entry.name}（id ${entry.id}，用 ${entry.op}）`).join('、')}——正文或上面的原著资料给出了它们的效果/外观/来历/品阶细节的，必须先交对应的 update 操作补全（id 和操作名就用括号里给的），再输出其他操作；无据可考的保持原样，不要编。`, ''] : []),
        '请决定主角自身的变化，只输出 JSON：{"note":"…","ops":[…]}。纳戒现状里条目前的编号（如 t1、s2、e1、z1、b3、c1、g1）就是 update/remove 要用的 id，只能用清单里已有的。',
    ].join('\n');
}

/** 解析模型决定：抽 JSON、限长、逐条交给 runtime 校验；坏 note 不影响 ops。 */
export function parseSelfDecision(raw) {
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
    const list = Array.isArray(object.ops) ? object.ops.slice(0, SELF_MODEL_OPS_MAX) : [];
    const ops = list.filter(item => item && typeof item === 'object' && !Array.isArray(item) && typeof item.op === 'string' && item.op.trim()).map(capSelfOp);
    const dropped = list.length - ops.length;
    return { status: ops.length || note ? 'ok' : 'empty', ops, note, dropped };
}
