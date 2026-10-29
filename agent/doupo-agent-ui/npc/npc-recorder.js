/**
 * 人物记录员：生成结束后的一次独立小调用。
 *
 * 给它“最近两楼正文 + 人物簿索引”，它只回一张补丁清单；脚本负责把补丁记进档案。
 * 这里只管“怎么问”和“怎么把回答变成补丁”，不碰存储，也不做依据核验——
 * 用户要的是“模型怎么写就怎么记”，所以提示词只约束形状，不约束判断。
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

export const NPC_RECORD_PROMPT = `你是这部小说的「人物记录员」。正文已经写完，你只做一件事：把这一楼里人物的变化，记成一张补丁清单。

【能改的字段】（键名照抄，不要造新键）
${fieldMenu()}

【特殊键】
姓名：必填，写正文里出现的那个称呼；别名/称号另起键写。
好感：只写“本次增减”，整数，正数=变好，负数=变坏；单次最多 ±10，超过会被脚本压回 ±10。不要写累计值，累计由脚本算。
好感理由：不超过 ${FAVOR_REASON_MAX} 个字，写清“因为什么”，例：护住族人、当众打脸、救命之恩。
流水：一句话记“他做了什么/发生了什么”，会原样追加到流水里，不要覆盖旧记录。
经历：只记“这个人从此不一样了”的重大转变——心智改变、态度反转、立场易帜、身份更替、结下死契或深仇这类。一件一行，写成完整的一句话；普通小事写“流水”，不要写进经历。
在场：true 或 false；同时尽量给位置和正在做什么。
重要：true 或 false。主角身边的关键人物为 true，路人龙套为 false。
设定：想一次改多个字段时，把字段塞进这个对象里，例：{"设定":{"境界":"斗皇","伤势":"左臂旧伤未愈"}}。
衣着：可以多件，一件写成 {"名称":"白袍","部位":"外袍","品阶":"玄阶","状态":"旧"}；换衣服就整条重写。
随身物品：一件写成 {"名称":"玉牌","数量":2,"来源":"族库","藏着":true}；“藏着”表示不想让人看见。

【规矩】
1. 只写这一楼真正发生的变化。没变化的字段一律不写，不要复述旧设定。
2. 这一楼没出现的人物、没被提到的人物，不要写进清单。
3. 第一次出现的新人物，至少写姓名 + 一句能立住的特征，其余留空，后面再补；如果下面的【世界书参考】里正好有这个人的条目，就按条目把设定填上，条目没写的仍留空。
4. 新人物建档时，性别、年龄、出身、身份、师承、境界、外貌、性格……各写各的键，一项一个字段；不要把“男、十八岁、萧家族长”这类信息全塞进「身份」，否则人物信息面板没法逐格填。
5. 不许编造正文里没有的事；拿不准就少写，宁缺毋滥。
6. 只输出 JSON，不要解释、不要 Markdown 代码块、不要前后缀。

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
