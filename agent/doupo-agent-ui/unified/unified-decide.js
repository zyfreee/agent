/**
 * 合并决定（方法 A）：纳戒与记忆共用一次模型调用，一次调用管三件事——
 *   1) 纳戒决定（self.ops，交 self-runtime 逐条校验落账）；
 *   2) 记忆决定（memory.ops，交 memory-runtime 逐条校验落账）；
 *   3) 旧记忆选条（cited = 本轮正文实际用到的旧记忆编号，交 markRecalled 补排练计数——
 *      召回注入已交给数据库的世界书条目，扩展看不见注入动作，排练由决定顺手补记）。
 * 输出仍是"模型交稿、脚本验收"：本模块只做提示词/输入组装与解析，纯函数可单测；
 * 落账、镜像（数据库表/MVU）全在各自 runtime 与桥里，这里一行都不碰。
 *
 * 提示词内嵌两侧的完整操作字典（与 self/memory 单侧提示词同源），改写任何一侧的字段名
 * 必须三处同步：self-decide.js、memory-decide.js、这里，否则脚本解析不到。
 */

import { buildSelfInjection } from '../self/self-ops.js';
import { buildMemoryInjection } from '../memory/memory-ops.js';
import { extractJson } from '../host/llm-client.js';

const MAX_FLOORS = 12;
const FLOOR_CHARS = 800;
const MAX_BOOK_LINES = 40;
const MAX_NOTE_CHARS = 300;
const MAX_OPS = 12;
const MAX_CITED = 12;

/** 合并决定提示词（system）。两侧操作字典与单侧提示词逐字同源；输出格式是合并后的三桶 JSON。 */
export const UNIFIED_DECIDE_PROMPT = [
    '你是《斗破苍穹》同人角色卡的总管书记官（贴身账房+书记官合一）。你只做一件事：读聊天记录、世界书资料、纳戒现状和本场召回的主角记忆，同时决定两件事——主角自身发生了什么变化、主角新记住了什么——输出能被脚本严格执行的一个 JSON。',
    '只输出一个 JSON 对象：{"note":"一句话总说明","self":{"ops":[…纳戒操作…]},"memory":{"ops":[…记忆操作…]},"cited":["m1","m2"]}。不要输出解释、标题或代码块以外的文字。',
    '某一侧这轮没有变化就给空数组 ops:[]，绝不为凑数而记账；cited 填本轮聊天实际用到或呼应了的旧记忆编号（就是【主角记忆】块里条目的 id），没用到就给 []。',
    '',
    '═══ 纳戒侧（self.ops）═══',
    '纳戒只记主角自己：身份信息（姓名/性别/年龄/种族/出身/所属/斗气属性/天赋/外貌）、境界与段位、金币、称号、功法、斗技、行囊物品、炼药炼器的配方与进度、目标约定。世界的事件、别人的档案不归你管，一律不记。',
    '可用操作（脚本逐条校验，写错字段或越界的条目会被丢弃，不影响其他条目）：',
    '- {"op":"setProfile","field":"name|gender|age|race|origin|affiliation|attribute|talent|appearance","text":"≤60字，attribute（斗气属性）≤12字"}：身份信息。年龄只在剧情明确过去了一段时间后才改，不要每轮硬加。斗气属性（火/风/雷/冰/水/土/木/暗/毒/无属性等）不轻易变；无属性与特殊体质只在剧情真正揭示时写。',
    '- {"op":"setRealm","realm":"斗者","stage":"三星"}：境界突破。斗气大陆的阶梯是 斗之气(一~九段)→斗者→斗师→大斗师→斗灵→斗王→斗皇→斗宗→斗尊→斗圣→斗帝(各一~九星)；境界必须剧情真到位才写，一场战斗一次突破就够了。',
    '- {"op":"setGold","amount":3200} 或 {"op":"addGold","amount":-500}：金币收支，买卖、赏金、被勒索都对得上账。',
    '- {"op":"addTitle","text":"≤16字"} / {"op":"removeTitle","text":"…"}：称号得失。',
    '- {"op":"addTechnique","name":"焚决","grade":"黄阶低级","type":"修炼功法","progress":"第三层","source":"药老所赠"}：获得功法（含身法、炼药术）；{"op":"updateTechnique","id":"t1","progress":"第四层"}：进阶；{"op":"removeTechnique","id":"t1"}：废弃或被夺。',
    '- {"op":"addSkill","name":"八极崩","grade":"黄阶高级","type":"攻击","source":"…"}：获得斗技；updateSkill/removeSkill 同上。',
    '- {"op":"addItem","name":"回气丹","category":"丹药","grade":"一品","count":3,"source":"…"}：获得物品（category：丹药|材料|武器|防具|杂物|关键物）；{"op":"updateItem","id":"b1","count":2} 或 {"op":"removeItem","id":"b1","count":1}：消耗；{"op":"updateItem","id":"b1","equipped":true}：穿上/脱下装备。同名同类别会自动并账。',
    '- {"op":"addRecipe","name":"回气丹","craft":"炼药","grade":"一品","materials":"…"}：掌握配方；{"op":"removeRecipe","id":"r1"}。',
    '- {"op":"startCraft","name":"回气散","craft":"炼药","days":3,"note":"缺一味凝骨草"}：开工炼制；{"op":"finishCraft","id":"c1","result":"success","note":"成丹三枚"}：出炉（fail=炸炉）。炼成后必须再补一条 addItem 把成品记进行囊。',
    '- {"op":"addGoal","text":"三年之约，云岚宗一雪前耻","priority":"主线","due":"三年后"}：立下目标或约定；{"op":"finishGoal","id":"g1"}：达成；{"op":"removeGoal","id":"g1"}：放弃或作废。',
    '记账规则：变化必须从最近剧情里有依据地长出来（战斗获胜、交易成交、有人赠予、炼制出炉），id 只能用纳戒清单里已有的编号；没有依据的不要记，也不要照搬原著桥段——剧情真走到那一步才记。self.ops 一次最多 12 条，写不下就留到下一轮。',
    '',
    '═══ 记忆侧（memory.ops）═══',
    '记忆分两层，都永久保存、按需召回（related 字段是日后召回的钥匙，所以必写 1-4 个人名/地名/物名）：',
    '- remember=小记忆：轻量记录的近事杂事——谁说过什么、主角干了什么小事、当下的小恩小怨小动静。weight 用 minor，不必重要才记，保持主角"记得这几天发生过什么"。',
    '- memorize=大记忆：值得一直记住的事——恩怨、秘密、伏笔、重大转折。weight 用 major，tag 可选（grudge恩怨/intel情报/thread伏笔/milestone大事记，只是查看标签，拿不准就空着）。',
    '- quote 可选：本轮里最有味道的一句原话（≤60字），日后召回会原样带回；只准摘聊天里真实出现过的对白，没有就空着。',
    '- promote(id)：小记忆后来发现分量够重（比如当年的小事成了大事），转成大记忆，召回时优先。',
    '- forgetMemory(id)：记错了或已无意义，整条删除。记忆不是任务，没有"了结"状态；旧事也保留召回权，只是按强度与重要性排在后面。',
    '记账规则：只记主角亲身经历或得知的事，变化必须从最近聊天里有依据地长出来；text≤300字，basis 必写（一句话说清从哪楼/谁/什么事来），related 必写 1-4 个（本场出现的人名/地名/物名，作为召回钥匙）；related 为空的操作会被脚本拒绝。',
    '所有权边界（不要越界记账）：主角的目标约定、境界物品归纳戒管；玩家接的任务归世界任务；正在发生的市井/势力动态归世界事件；NPC 的档案与好感归人物簿。记忆只收"值得记住的叙事事实"。',
    'memory.ops 一次最多 12 条，写不下就留到下一轮。',
    '',
    '输出要求再强调一遍：只输出一个 JSON 对象 {"note":"…","self":{"ops":[…]},"memory":{"ops":[…]},"cited":[…]}；两侧各自"无变化就空数组"；cited 是本轮实际用到的旧记忆编号数组。',
].join('\n');

/** 纳戒操作的 JSON Schema 属性集（与 self-decide.js 的 SELF_JSON_SCHEMA 同源）。 */
const SELF_OP_PROPERTIES = Object.freeze({
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
});

/** 记忆操作的 JSON Schema 属性集（与 memory-decide.js 的 MEMORY_JSON_SCHEMA 同源）。 */
const MEMORY_OP_PROPERTIES = Object.freeze({
    op: { type: 'string', enum: ['remember', 'memorize', 'promote', 'forgetMemory'] },
    text: { type: 'string' }, basis: { type: 'string' }, note: { type: 'string' }, quote: { type: 'string' },
    related: { type: 'array', items: { type: 'string' } },
    weight: { type: 'string', enum: ['major', 'minor'] },
    tag: { type: 'string', enum: ['grudge', 'intel', 'thread', 'milestone'] },
    id: { type: 'string' },
});

/** 合并决定的结构化输出约束；解析端并不依赖它，只是提高严格度。 */
export const UNIFIED_JSON_SCHEMA = Object.freeze({
    type: 'object',
    properties: {
        note: { type: 'string' },
        self: {
            type: 'object',
            properties: {
                note: { type: 'string' },
                ops: { type: 'array', items: { type: 'object', properties: SELF_OP_PROPERTIES, required: ['op'] } },
            },
        },
        memory: {
            type: 'object',
            properties: {
                note: { type: 'string' },
                ops: { type: 'array', items: { type: 'object', properties: MEMORY_OP_PROPERTIES, required: ['op'] } },
            },
        },
        cited: { type: 'array', items: { type: 'string' } },
    },
});

/**
 * 组装发给模型的 user 内容：纳戒现状 + 本场召回的记忆 + 相关世界书条目 + 最近聊天（旧→新）。
 * 三块输入与单侧调用同构（纳戒块 = buildSelfDecideUser 的前两段，记忆块 = buildDecideUser 的记忆段），
 * 楼层只读一遍、只发一遍——这是合并调用省 token 的来源。
 */
export function buildUnifiedDecideUser({ selfSnapshot = {}, memorySnapshot = {}, floors = [], worldbookLines = [] } = {}) {
    const sceneText = (Array.isArray(floors) ? floors : [])
        .map(floor => (typeof floor?.text === 'string' ? floor.text : '')).join('\n');
    const selfBlock = buildSelfInjection(selfSnapshot, { maxChars: 1600 });
    const memoryBlock = buildMemoryInjection(memorySnapshot, { maxChars: 1200, sceneText }) || '（本场没有勾起任何旧记忆）';
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
        '【主角记忆（本场召回，related 命中最近剧情才出现）】',
        memoryBlock,
        '',
        `【世界书资料（与本轮聊天相关的条目，共 ${bookLines.length} 条）】`,
        bookLines.length ? bookLines.map(line => `- ${line}`).join('\n') : '- （本轮没有命中的世界书条目）',
        '',
        `【最近聊天记录（旧 → 新，共 ${chat.length} 楼）】`,
        chat.length ? chat.join('\n') : '- （还没有聊天内容）',
        '',
        '请同时决定纳戒与记忆，只输出 JSON：{"note":"…","self":{"ops":[…]},"memory":{"ops":[…]},"cited":["m1","m2"]}。',
    ].join('\n');
}

/**
 * 解析合并决定：抽 JSON、限长、三桶分开（selfOps/memoryOps/cited）。
 * 每条操作字段是否合法交给各自 runtime 校验（apply 时逐条验），这里只认形状；
 * 单侧为空不算失败——两桶互不牵连，解析失败才整体失败。
 */
export function parseUnifiedDecision(raw) {
    const invalid = error => ({ status: 'invalid', note: '', selfNote: '', memoryNote: '', selfOps: [], memoryOps: [], cited: [], error });
    let object;
    try {
        object = extractJson(raw);
    } catch (error) {
        return invalid(String(error?.message ?? error));
    }
    if (!object || typeof object !== 'object' || Array.isArray(object)) return invalid('决定不是 JSON 对象');
    const collectOps = section => {
        const list = Array.isArray(object?.[section]?.ops) ? object[section].ops : [];
        return list.slice(0, MAX_OPS).filter(item => item && typeof item === 'object' && !Array.isArray(item) && typeof item.op === 'string' && item.op.trim());
    };
    const note = typeof object.note === 'string' ? object.note.trim().slice(0, MAX_NOTE_CHARS) : '';
    const selfNote = typeof object.self?.note === 'string' ? object.self.note.trim().slice(0, MAX_NOTE_CHARS) : '';
    const memoryNote = typeof object.memory?.note === 'string' ? object.memory.note.trim().slice(0, MAX_NOTE_CHARS) : '';
    const cited = (Array.isArray(object.cited) ? object.cited : [])
        .filter(item => typeof item === 'string' && item.trim())
        .map(item => item.trim())
        .slice(0, MAX_CITED);
    const selfOps = collectOps('self');
    const memoryOps = collectOps('memory');
    const status = selfOps.length || memoryOps.length || cited.length || note ? 'ok' : 'empty';
    return { status, note, selfNote, memoryNote, selfOps, memoryOps, cited };
}
