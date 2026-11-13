/**
 * 人物记录员：生成结束后的一次独立小调用。
 *
 * 给它“最近两楼正文 + 人物簿索引”，它只回一张补丁清单；脚本负责把补丁记进档案。
 * 这里只管“怎么问”和“怎么把回答变成补丁”，不碰存储，也不做依据核验——
 * 但建档门槛钉在提示词里（用户要求：路过的商贩这类背景龙套不进人物簿），
 * 模型必须先过【谁能建档】筛选，再谈写什么字段。
 */

import { NPC_FIELDS, FAVOR_REASON_MAX, favorLabel } from './npc-ledger.js';

const MAX_FLOOR_CHARS = 1400;

/** 记录员看到的字段清单，和档案格式同源，改格式不用改两处。 */
function fieldMenu() {
    const groups = new Map();
    for (const field of NPC_FIELDS) {
        if (!groups.has(field.group)) groups.set(field.group, []);
        groups.get(field.group).push(field.label);
    }
    return [...groups.entries()].map(([group, labels]) => `${group}：${labels.join('、')}`).join('\n');
}

export const NPC_RECORD_PROMPT = `你是这部小说的「人物记录员」。正文已经写完，你只做一件事：把这一楼里值得记进人物簿的变化，记成一张补丁清单。人物簿不是出场名单——只有"忘了他，接下来的剧情就会断线"的人才配立档。

【谁能建档】先把这一楼出现的人挨个过一遍这道门槛，过不了的直接无视，一个字段都不要写：
- 有名字或稳定称呼，并且这一楼和玩家或主线发生了实际交集：正经对话、交易、冲突、施救或结怨、给了信息/任务/物品、态度发生了看得见的变化；
- 或者虽然还没交手，但明显是会再登场、剧情留了钩子的角色（有身份、有立场、有未完的事）。
以下一律不建档——写进清单就是污染人物簿：
- 纯背景龙套：吆喝的商贩、店小二、守卫、围观人群、路人甲。哪怕正文给了他一两句台词，只要没和玩家发生实际交集、也不留后续钩子，就不记；
- 只有泛称的无名之辈（"商贩""老者""青年""守卫"这类叫法，没名字、没交集）；
- 只被人提了一句名字、本人没出场也没发生任何事的。
拿不准就自问两句：他下一轮还会再出现吗？忘了他，接下来哪句话会写错？两个答案都是"不会"，就不记。

【能改的字段】（键名照抄，不要造新键）
${fieldMenu()}

【特殊键】
姓名：必填，写正文里出现的那个称呼；别名/称号另起键写。
好感：只写“本次增减”，整数，正数=变好，负数=变坏；单次最多 ±10，超过会被脚本压回 ±10。不要写累计值，累计由脚本算。
好感理由：不超过 ${FAVOR_REASON_MAX} 个字，写清“因为什么”，例：护住族人、当众打脸、救命之恩。
依据：好感单次超过 ±5、或写了「经历」时必写一句（不超过 80 字）：正文里哪句话支撑了这个变化。普通小改动不用写。
情绪：这个人这一楼冒出来的短期情绪（感激、恼怒、警惕、愧疚、畏惧、心疼……一个词），可选；三天后自动消散。长期态度走「态度」，别写进情绪。
流水：一句话记“他做了什么/发生了什么”，会原样追加到流水里，不要覆盖旧记录。
经历：只记“这个人从此不一样了”的重大转变——心智改变、态度反转、立场易帜、身份更替、结下死契或深仇这类。一件一行，写成完整的一句话；普通小事写“流水”，不要写进经历。
在场：true 或 false；同时尽量给位置和正在做什么。
重要：true 或 false。只对过了门槛建档的人打标：主角身边的关键人物为 true，其余为 false。
设定：想一次改多个字段时，把字段塞进这个对象里，例：{"设定":{"境界":"斗皇","伤势":"左臂旧伤未愈"}}。
衣着：可以多件，一件写成 {"名称":"白袍","部位":"外袍","品阶":"玄阶","状态":"旧"}；换衣服就整条重写。
随身物品：一件写成 {"名称":"玉牌","数量":2,"来源":"族库","藏着":true}；“藏着”表示不想让人看见。

【规矩】
1. 只写这一楼真正发生的变化。没变化的字段一律不写，不要复述旧设定。
2. 这一楼没出现的人物、没被提到的人物，不要写进清单；出现了但没过【谁能建档】门槛的，同样不要写——背景龙套一个字段都不许给。
3. 过了门槛、且是第一次出现的新人物，至少写姓名 + 一句能立住的特征，其余留空，后面再补；如果下面的【世界书参考】里正好有这个人的条目，就按条目把设定填上，条目没写的仍留空。
4. 新人物建档时，性别、年龄、出身、身份、师承、境界、外貌、性格……各写各的键，一项一个字段；不要把“男、十八岁、萧家族长”这类信息全塞进「身份」，否则人物信息面板没法逐格填。
5. 不许编造正文里没有的事；拿不准就少写，宁缺毋滥。
6. 玩家是独立于原著剧情的当事人：除非正文里玩家明确自报了姓名或身份，不要把玩家识别、建档或改名成世界书里的原著人物（例如萧炎、萧薰儿、药老）。【世界书参考】只用于"正文里实际点到的那个人/地方"的条目，不要把参考条目里的原著主角套到玩家头上。
7. 只输出 JSON，不要解释、不要 Markdown 代码块、不要前后缀。

【输出格式】
{"人物":[{"姓名":"萧战","性别":"男","年龄":"四十五岁","出身":"萧家","身份":"萧家族长","师承":"萧家先祖","境界":"斗皇","态度":"对后辈多了几分认可","位置":"萧家议事厅","在场":true,"重要":true,"好感":3,"好感理由":"护住族人","流水":"主持族会，压下二长老的质疑","经历":"亲眼看见萧炎击败加列奥后，从轻视转为忌惮，开始暗中调查他的底细"}]}

这一楼没有任何人物变化时，输出 {"人物":[]}。`;

const FIELD_SCHEMA = Object.freeze(Object.fromEntries(
    NPC_FIELDS.map(field => [field.label, field.type === 'list'
        ? { type: 'array', items: { type: 'string' } }
        : field.type === 'enum'
            ? { type: 'string', enum: [...field.options] }
            : { type: 'string' }]),
));

export const NPC_RECORD_JSON_SCHEMA = Object.freeze({
    type: 'object',
    properties: {
        人物: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                    ...FIELD_SCHEMA,
                    姓名: { type: 'string' },
                    好感: { type: 'number' },
                    好感理由: { type: 'string' },
                    依据: { type: 'string' },
                    情绪: { type: 'string' },
                    在场: { type: 'boolean' },
                    重要: { type: 'boolean' },
                    流水: { type: 'string' },
                    经历: { type: 'string' },
                },
                required: ['姓名'],
            },
        },
    },
    required: ['人物'],
});

function clampText(value, limit) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return '';
    return raw.length > limit ? `${raw.slice(0, limit)}…` : raw;
}

/** 人物簿索引：让人物记录员知道“谁已经建过档、现在什么状态”，避免重复造人和写错好感的起点。 */
export function ledgerLines(records = [], { limit = 60 } = {}) {
    return records.slice(0, limit).map(record => {
        const bits = [record.name];
        bits.push(record.presence === '在场' ? '在场' : '不在场');
        bits.push(record.importance === '重要' ? '重要' : '普通');
        bits.push(`好感${record.favor}${favorLabel(record.favor) ? `（${favorLabel(record.favor)}）` : ''}`);
        if (record.identity) bits.push(record.identity);
        if (record.location) bits.push(`在${record.location}`);
        if (record.appellation) bits.push(`称呼玩家「${record.appellation}」`);
        return bits.join('｜');
    });
}

/**
 * 拼给记录员的这一轮材料：最近楼层 + 人物簿索引 + 当前世界第几天。
 * 楼层只截最近一两楼——记录员是记账，不是回顾全书。
 */
export function buildNpcRecordUser({ floors = [], records = [], playerName = '', day = null, worldbookLines = [], playerContext = null, maxChars = 6000 } = {}) {
    const blocks = [];
    const chatLines = [];
    for (const floor of floors) {
        const text = clampText(floor?.text, MAX_FLOOR_CHARS);
        if (!text) continue;
        chatLines.push(`【${floor.role === '玩家' ? (playerName || '玩家') : '角色'}】${text}`);
    }
    if (chatLines.length) blocks.push(`【最近楼层】\n${chatLines.join('\n')}`);
    const book = Array.isArray(worldbookLines) ? worldbookLines.filter(line => typeof line === 'string' && line.trim()) : [];
    if (book.length) blocks.push(`【世界书参考】（正文里点到的人物/地方，新建档时可以先照着填，条目没写的留空）\n${book.join('\n')}`);
    const context = playerContextLine(playerContext);
    if (context) blocks.push(`【玩家此刻】${context}`);
    const index = ledgerLines(records);
    if (index.length) blocks.push(`【人物簿索引】（已建档的人，只作参照，不要重复建档）\n${index.join('\n')}`);
    else blocks.push('【人物簿索引】\n（还是空的，这一轮出现的每个人都要新建档案）');
    if (Number.isFinite(Number(day))) blocks.push(`【世界时间】第 ${Number(day)} 天`);
    const body = blocks.join('\n\n');
    return body.length > maxChars ? body.slice(0, maxChars) : body;
}

/** 玩家此刻在哪、什么境界——由外部“个人信息”模块接进来；没接就没有这一行。 */
export function playerContextLine(context) {
    if (!context || typeof context !== 'object') return '';
    const bits = [];
    if (context.location) bits.push(`在${context.location}`);
    if (context.realm) bits.push(`境界${context.realm}`);
    if (context.status) bits.push(context.status);
    if (context.name) bits.push(`他叫${context.name}`);
    return bits.filter(Boolean).join('，');
}

/**
 * 从世界书条目里补档案：只给“这个人 + 条目正文 + 还空着的字段”，
 * 让模型只填看得见的，输出仍然是同一张补丁形状。
 */
export function buildNpcExtractUser({ record = null, entries = [], day = null, maxChars = 5000 } = {}) {
    const blocks = [];
    const name = typeof record?.name === 'string' ? record.name.trim() : '';
    const bits = [`目标人物：${name || '（没给名字）'}`];
    if (Array.isArray(record?.aliases) && record.aliases.length) bits.push(`别名：${record.aliases.join('、')}`);
    if (Array.isArray(record?.titles) && record.titles.length) bits.push(`称号：${record.titles.join('、')}`);
    const current = typeof record === 'object' && record ? Object.entries(record)
        .filter(([key, value]) => ['identity', 'realm', 'origin', 'master', 'gender', 'age', 'look', 'traits', 'clothes'].includes(key) && value && (!Array.isArray(value) || value.length))
        .map(([key, value]) => `${key}=${Array.isArray(value) ? value.map(item => item?.name ?? item).join('、') : value}`) : [];
    if (current.length) bits.push(`已经记下的（不要改）：${current.join('；')}`);
    blocks.push(bits.join('\n'));
    const missing = Array.isArray(record?.missing) ? record.missing : [];
    if (missing.length) blocks.push(`【还空着的字段】（只填这些）\n${missing.join('、')}`);
    const body = Array.isArray(entries)
        ? entries.map(entry => {
            const title = [entry?.uid ? `#${entry.uid}` : '', entry?.category || '', entry?.name || ''].filter(Boolean).join('|');
            const content = clampText(entry?.content || entry?.summary || '', 1800);
            return content ? `【${title}】\n${content}` : '';
        }).filter(Boolean)
        : [];
    if (body.length) blocks.push(`【世界书条目】\n${body.join('\n\n')}`);
    else blocks.push('【世界书条目】\n（没找到这个人的条目，那就什么都别写，输出 {"人物":[]}）');
    if (Number.isFinite(Number(day))) blocks.push(`【世界时间】第 ${Number(day)} 天`);
    const text = blocks.join('\n\n');
    return text.length > maxChars ? text.slice(0, maxChars) : text;
}

export const NPC_EXTRACT_PROMPT = `你是这部小说的「档案抄录员」。有人给了你几段这部作品的设定条目，你要把它们里面关于某个人的硬信息，抄进这个人的人物档案里。

【规矩】
1. 只抄条目里明写的东西；条目没写的，一个字都别编，也不要“合理推测”。
2. 只填【还空着的字段】里列出来的；已经记下的字段不要动、不要重复写。
3. 好感、态度、在场这些“关系类”的不要写——它们只由正文里发生的事决定。
4. 条目互相矛盾时，取更具体、更新的那条；实在拿不准就跳过这个字段。
5. 只输出 JSON，不要解释、不要 Markdown 代码块。

【输出格式】
{"人物":[{"姓名":"萧战","境界":"斗皇","身份":"萧家族长","师承":"萧家先祖","出身":"萧家"}]}

一条能用的都没有时，输出 {"人物":[]}。`;


function stripFence(raw) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) return '';
    const fenced = value.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
    if (fenced && fenced[1]) return fenced[1].trim();
    return value.replace(/^\uFEFF/, '').trim();
}

function sliceJson(value) {
    const start = value.search(/[[{]/);
    if (start < 0) return '';
    const open = value[start];
    const close = open === '[' ? ']' : '}';
    const end = value.lastIndexOf(close);
    if (end <= start) return '';
    return value.slice(start, end + 1);
}

/** 重试附言：解析失败退回模型重问时，追加在 system 末尾的一句话。 */
export const NPC_RECORD_RETRY_SYSTEM_NOTE = '\n\n【补记】上一次的输出无法解析，被退回重做。这次只输出一个合法 JSON，形状照【输出格式】，不要解释、不要 Markdown 代码块、不要前后缀。';

/**
 * 拼重试材料：原材料 + 上次的坏输出 + 拒绝原因，让模型只改格式不改内容。
 * 坏输出最多带 600 字——够它对出自己写了什么，不至于把上下文撑爆。
 */
export function buildRecordRetryUser({ user = '', raw = '', reason = '', maxChars = 7000 } = {}) {
    const body = String(user);
    const clipped = clampText(raw, 600);
    const note = `【上次输出（无法解析）】\n${clipped}\n【问题】${reason || 'JSON 不合法'}\n请重新输出这一楼的人物变化：只输出 JSON，其他一个字都不要。`;
    const merged = `${body}\n\n${note}`;
    return merged.length > maxChars ? `${merged.slice(0, maxChars)}\n（材料过长被截断；以上一次输出错误为准，只输出合法 JSON。）` : merged;
}

/** 解析记录员回答：认不出就直说认不出，不猜、不修补成半截数据。 */
export function parseNpcRecordReply(raw) {
    const cleaned = stripFence(raw);
    if (!cleaned) return { status: 'empty', reason: '模型没有返回内容' };
    const json = sliceJson(cleaned);
    if (!json) return { status: 'invalid', reason: '回答里没有 JSON', raw: cleaned.slice(0, 400) };
    let payload;
    try {
        payload = JSON.parse(json);
    } catch (error) {
        return { status: 'invalid', reason: `JSON 解析失败：${error?.message ?? error}`, raw: json.slice(0, 400) };
    }
    const patches = Array.isArray(payload) ? payload
        : Array.isArray(payload?.人物) ? payload.人物
            : Array.isArray(payload?.记录) ? payload.记录
                : payload && typeof payload === 'object' && (payload.姓名 || payload.name) ? [payload]
                    : null;
    if (!patches) return { status: 'invalid', reason: 'JSON 里没有“人物”数组', raw: json.slice(0, 400) };
    return { status: 'ok', patches, raw: json };
}

/** 经历精简：合并同一个人雷同的转变条目，保留关键节点，输出仍是经历清单。 */
export const EXP_CONDENSE_PROMPT = `你是这部小说的「人物传记整理人」。某人的人物档案里积累了一批“经历”（重大转变），现在要把它们精简：合并重复、归并同一件事的多次反复，保留时间顺序和所有关键转折。

【规矩】
1. 每条经历仍然是一句完整的话，说清“他经历了什么、从此哪里不一样”。
2. 同一件事的多次进展（先忌惮→再敌视→终成死敌）可以合并成一条，但不要丢掉最终状态。
3. 不许发明清单里没有的转变；拿不准的原文保留。
4. 条数减到原来的三分之一左右；不到 5 条的清单不必硬压，原样返回也行。
5. 只输出 JSON，不要解释、不要 Markdown 代码块。

【输出格式】
{"经历":[{"day":12,"text":"亲眼看见萧炎击败加列奥后，从轻视转为忌惮，开始暗中调查他的底细"}]}

day 是这条转变发生的世界天数（合并时取最早那条的）；清单里没有的就写 null。`;

/** 拼给精简调用的材料：这个人是谁 + 现有经历清单。 */
export function buildExpCondenseUser({ name = '', summary = '', entries = [] } = {}) {
    const blocks = [`人物：${name || '（未知名）'}`];
    if (summary) blocks.push(`档案一句话：${String(summary).slice(0, 120)}`);
    const lines = (Array.isArray(entries) ? entries : []).map((entry, index) => {
        const day = Number.isFinite(Number(entry?.day)) && entry.day !== null ? `第${Number(entry.day)}天` : '第?天';
        return `${index + 1}. [${day}] ${entry?.text ?? ''}`;
    }).filter(line => !line.endsWith('] '));
    blocks.push(lines.length ? `【现有经历】\n${lines.join('\n')}` : '【现有经历】\n（空的，输出 {"经历":[]}）');
    return blocks.join('\n\n');
}

/** 解析精简回答：只认 {"经历":[{day,text}]}，其余原样报错。 */
export function parseExpCondenseReply(raw) {
    const cleaned = stripFence(raw);
    if (!cleaned) return { status: 'empty', reason: '模型没有返回内容' };
    const json = sliceJson(cleaned);
    if (!json) return { status: 'invalid', reason: '回答里没有 JSON', raw: cleaned.slice(0, 400) };
    let payload;
    try {
        payload = JSON.parse(json);
    } catch (error) {
        return { status: 'invalid', reason: `JSON 解析失败：${error?.message ?? error}`, raw: json.slice(0, 400) };
    }
    const entries = Array.isArray(payload?.经历) ? payload.经历
        : Array.isArray(payload?.exp) ? payload.exp
            : Array.isArray(payload) ? payload
                : null;
    if (!entries) return { status: 'invalid', reason: 'JSON 里没有“经历”数组', raw: json.slice(0, 400) };
    return { status: 'ok', entries };
}
