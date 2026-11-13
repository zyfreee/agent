/**
 * 人物一致性体检：正文写完后的一次旁路小调用——拿人物档案（含性格/雷区/说话风格/
 * 境界/称呼）对照最近正文，只报「写违反档案的地方」，不改档案、不拦正文。
 *
 * 与叙述门的分工：叙述门核「事实有没有依据」（防编造），这里核「写法合不合人设」
 * （防 OOC）。结果进审计流水与人物簿面板，供人工复查；模型惯性跑偏时这里最先看见。
 */

const PROFILE_TEXT_MAX = 400;
const FLOOR_TEXT_MAX = 900;

export const CONSISTENCY_PROMPT = `你是这部小说的「人物体检员」。给你几个人物的档案和最近正文，你只做一件事：找出正文描写与档案相违反的地方。不改档案、不评价文笔、不重写正文。

【检查项】（只报有把握的违反）
- 说话风格/口头禅：语气与档案写法明显不符；
- 雷区：人物当众做了档案写明他会忌讳/绝不去做的事；
- 称呼：对玩家的称呼与档案里的「当前称呼」对不上；
- 境界/伤势连续性：境界凭空跳档、档案里的伤势凭空消失；
- 态度：对玩家的言行与档案态度方向明显相反（好感为负却谄媚、生死之交却形同路人）。

【规矩】
1. 只报正文里明写、且与档案明写相冲突的项；拿不准就不报，宁缺毋滥。
2. 每条违反要引正文原句（≤60字）作证据；引不出原文的不报。
3. 档案里没写的方面不算违反——档案空白不是错误。
4. 只输出 JSON，不要解释、不要 Markdown 代码块、不要前后缀。

【输出格式】
{"检查":[{"姓名":"萧战","违反":[{"字段":"称呼","问题":"正文里叫了『小友』，档案写当前称呼是『萧家小子』","原文":"萧战捋须笑道：小友此言差矣"}]}]}

没有发现违反时，输出 {"检查":[]}。`;

/**
 * 拼体检材料：每个人物挑体检用得上的字段拼成短档案 + 最近正文。
 * 档案只给「性格组 + 对玩家组 + 身体硬信息」，不给资产流水——体检不关心那些。
 */
export function buildConsistencyUser({ profiles = [], floors = [], day = null, maxChars = 6000 } = {}) {
    const blocks = [];
    const profileLines = (Array.isArray(profiles) ? profiles : []).map(profile => {
        const record = profile?.record ?? {};
        const lines = [`【${record.name || '（未知名）'}】`];
        const person = [Array.isArray(record.traits) && record.traits.length ? `性格：${record.traits.join('、')}` : '',
            record.speech ? `说话：${record.speech}` : '', record.catchphrase ? `口头禅：${record.catchphrase}` : '',
            record.taboo ? `雷区：${record.taboo}` : ''].filter(Boolean).join('｜');
        if (person) lines.push(person);
        const bond = [`好感 ${record.favor ?? 0}`, record.attitude ? `态度：${record.attitude}` : '',
            record.appellation ? `称呼你：「${record.appellation}」` : '', record.stage ? `关系：${record.stage}` : ''].filter(Boolean).join('｜');
        if (bond) lines.push(bond);
        const body = [record.realm ? `修为：${record.realm}` : '', record.injury ? `伤势：${record.injury}` : ''].filter(Boolean).join('｜');
        if (body) lines.push(body);
        return lines.join('\n');
    }).filter(Boolean);
    blocks.push(profileLines.length ? `【人物档案】\n${profileLines.join('\n\n')}` : '【人物档案】\n（空的，输出 {"检查":[]}）');
    const chatLines = (Array.isArray(floors) ? floors : []).map(floor => {
        const text = typeof floor?.text === 'string' ? floor.text.slice(0, FLOOR_TEXT_MAX) : '';
        return text ? `【${floor.role === '玩家' ? '玩家' : '角色'}】${text}` : '';
    }).filter(Boolean);
    blocks.push(chatLines.length ? `【最近正文】\n${chatLines.join('\n')}` : '【最近正文】\n（空的，输出 {"检查":[]}）');
    if (Number.isFinite(Number(day))) blocks.push(`【世界时间】第 ${Number(day)} 天`);
    const body = blocks.join('\n\n');
    return body.length > maxChars ? body.slice(0, maxChars) : body;
}

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

/** 解析体检回答：只认 {"检查":[{姓名,违反:[{字段,问题,原文}]}]}，其余报 invalid。 */
export function parseConsistencyReply(raw) {
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
    const entries = Array.isArray(payload?.检查) ? payload.检查 : Array.isArray(payload) ? payload : null;
    if (!entries) return { status: 'invalid', reason: 'JSON 里没有「检查」数组', raw: json.slice(0, 400) };
    const results = [];
    for (const entry of entries) {
        const name = typeof entry?.姓名 === 'string' ? entry.姓名.trim().slice(0, 40) : '';
        const violations = (Array.isArray(entry?.违反) ? entry.违反 : []).map(item => ({
            field: typeof item?.字段 === 'string' ? item.字段.trim().slice(0, 20) : '',
            problem: typeof item?.问题 === 'string' ? item.问题.trim().slice(0, 120) : '',
            quote: typeof item?.原文 === 'string' ? item.原文.trim().slice(0, 80) : '',
        })).filter(item => item.problem);
        if (name && violations.length) results.push({ name, violations });
    }
    return { status: 'ok', results, raw: json };
}

export { PROFILE_TEXT_MAX, FLOOR_TEXT_MAX };
