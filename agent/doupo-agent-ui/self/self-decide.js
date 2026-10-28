/**
 * 纳戒决定：LLM 决定脚本执行的核心。
 * 模型输入 = 聊天记录 + 世界书条目 + 纳戒现状；输出 = 一条 note + 一组操作；
 * 脚本逐条校验执行（self-runtime），结果原样呈现到面板。
 *
 * 提示词可在设置里改写（self.decidePrompt，留空用 SELF_DECIDE_PROMPT）。
 */

import { buildSelfInjection } from './self-ops.js';
import { extractJson } from '../host/llm-client.js';

const MAX_FLOORS = 12;
const FLOOR_CHARS = 800;
const MAX_BOOK_LINES = 40;
const MAX_NOTE_CHARS = 300;
const MAX_OPS = 12;

/** 默认决定提示词（system）。改写时保持"只输出 JSON"与操作字段名不变，否则脚本解析不到。 */
export const SELF_DECIDE_PROMPT = [
    '你是《斗破苍穹》同人角色卡的贴身账房。你只做一件事：读聊天记录、世界书资料和纳戒（主角的自身状态与随身之物），决定主角这一轮之后自身发生了什么变化，输出能被脚本严格执行的 JSON。',
    '只输出一个 JSON 对象：{"note":"一句话说明为什么这么决定","ops":[…]}。不要输出解释、标题或代码块以外的文字。',
    '纳戒只记主角自己：身份信息（姓名/性别/年龄/种族/出身/所属/天赋/外貌）、境界与段位、金币、称号、功法、斗技、行囊物品、炼药炼器的配方与进度、目标约定。世界的事件、别人的档案不归你管，一律不记。',
    '可用操作（脚本逐条校验，写错字段或越界的条目会被丢弃，不影响其他条目）：',
    '- {"op":"setProfile","field":"name|gender|age|race|origin|affiliation|talent|appearance","text":"≤60字"}：身份信息。年龄只在剧情明确过去了一段时间后才改，不要每轮硬加。',
    '- {"op":"setRealm","realm":"斗者","stage":"三星"}：境界突破。斗气大陆的阶梯是 斗之气(一~九段)→斗者→斗师→大斗师→斗灵→斗王→斗皇→斗宗→斗尊→斗圣→斗帝(各一~九星)；境界必须剧情真到位才写，一场战斗一次突破就够了。',
    '- {"op":"setGold","amount":3200} 或 {"op":"addGold","amount":-500}：金币收支，买卖、赏金、被勒索都对得上账。',
    '- {"op":"addTitle","text":"≤16字"} / {"op":"removeTitle","text":"…"}：称号得失。',
    '- {"op":"addTechnique","name":"焚决","grade":"黄阶低级","type":"修炼功法","progress":"第三层","source":"药老所赠"}：获得功法（含身法、炼药术）；{"op":"updateTechnique","id":"t1","progress":"第四层"}：进阶；{"op":"removeTechnique","id":"t1"}：废弃或被夺。',
    '- {"op":"addSkill","name":"八极崩","grade":"黄阶高级","type":"攻击","source":"…"}：获得斗技；updateSkill/removeSkill 同上。',
    '- {"op":"addItem","name":"回气丹","category":"丹药","grade":"一品","count":3,"source":"…"}：获得物品（category：丹药|材料|武器|防具|杂物|关键物）；{"op":"updateItem","id":"b1","count":2} 或 {"op":"removeItem","id":"b1","count":1}：消耗；{"op":"updateItem","id":"b1","equipped":true}：穿上/脱下装备。同名同类别会自动并账。',
    '- {"op":"addRecipe","name":"回气丹","craft":"炼药","grade":"一品","materials":"…"}：掌握配方；{"op":"removeRecipe","id":"r1"}。',
    '- {"op":"startCraft","name":"回气散","craft":"炼药","days":3,"note":"缺一味凝骨草"}：开工炼制；{"op":"finishCraft","id":"c1","result":"success","note":"成丹三枚"}：出炉（fail=炸炉）。炼成后必须再补一条 addItem 把成品记进行囊。',
    '- {"op":"addGoal","text":"三年之约，云岚宗一雪前耻","priority":"主线","due":"三年后"}：立下目标或约定；{"op":"finishGoal","id":"g1"}：达成；{"op":"removeGoal","id":"g1"}：放弃或作废。',
    '记账规则：变化必须从最近剧情里有依据地长出来（战斗获胜、交易成交、有人赠予、炼制出炉），id 只能用纳戒清单里已有的编号；没有依据的不要记，也不要照搬原著桥段——剧情真走到那一步才记。',
    '- 一次最多 12 条操作，写不下就留到下一轮。',
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
                    op: { type: 'string', enum: ['setProfile', 'setRealm', 'setGold', 'addGold', 'addTitle', 'removeTitle', 'addTechnique', 'updateTechnique', 'removeTechnique', 'addSkill', 'updateSkill', 'removeSkill', 'addItem', 'updateItem', 'removeItem', 'addRecipe', 'removeRecipe', 'startCraft', 'finishCraft', 'addGoal', 'finishGoal', 'removeGoal'] },
                    field: { type: 'string' },
                    text: { type: 'string' },
                    realm: { type: 'string' }, stage: { type: 'string' },
                    amount: { type: 'number' },
                    name: { type: 'string' }, grade: { type: 'string' }, type: { type: 'string' },
                    progress: { type: 'string' }, source: { type: 'string' }, note: { type: 'string' },
                    category: { type: 'string' }, count: { type: 'number' }, equipped: { type: 'boolean' },
                    materials: { type: 'string' }, craft: { type: 'string' },
                    id: { type: 'string' }, result: { type: 'string', enum: ['success', 'fail'] },
                    days: { type: 'number' },
                    priority: { type: 'string', enum: ['主线', '支线'] }, due: { type: 'string' },
                },
                required: ['op'],
            },
        },
    },
    required: ['ops'],
});

/** 组装发给模型的 user 内容：纳戒现状 + 相关世界书条目 + 最近聊天（旧→新）。 */
export function buildSelfDecideUser({ snapshot = {}, floors = [], worldbookLines = [] } = {}) {
    const selfBlock = buildSelfInjection(snapshot, { maxChars: 1600 });
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
        '【纳戒现状（主角此刻的自身状态与随身之物）】',
        selfBlock,
        '',
        `【世界书资料（与本轮聊天相关的条目，共 ${bookLines.length} 条）】`,
        bookLines.length ? bookLines.map(line => `- ${line}`).join('\n') : '- （本轮没有命中的世界书条目）',
        '',
        `【最近聊天记录（旧 → 新，共 ${chat.length} 楼）】`,
        chat.length ? chat.join('\n') : '- （还没有聊天内容）',
        '',
        '请决定主角自身的变化，只输出 JSON：{"note":"…","ops":[…]}。',
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
    const list = Array.isArray(object.ops) ? object.ops.slice(0, MAX_OPS) : [];
    const ops = list.filter(item => item && typeof item === 'object' && !Array.isArray(item) && typeof item.op === 'string' && item.op.trim());
    const dropped = list.length - ops.length;
    return { status: ops.length || note ? 'ok' : 'empty', ops, note, dropped };
}
