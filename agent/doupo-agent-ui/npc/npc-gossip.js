/**
 * 传闻触达（gossip）：world 台账的 rumor 事件沿关系图跳一跳，到达不在场的人物。
 *
 * 世界系统的 rumor 目前只防正文误写；这里让传闻真的「传」：不在场、但与传闻里
 * 出场人物有关系的人，会经关系人听到这则消息，再按各自性格决定信不信、改不改
 * 态度。输出仍是人物簿补丁形状（好感限 ±3、可带情绪、流水一句话），由入口先出
 * 草稿、逐条确认后走 applyNpcLedgerPayload(source='传闻') 落账——模型不直接写账。
 * 取材规则沿世界台账：rumor 未证实，正文不得当事实；这里传的也只是「他听说了」。
 */

const RUMOR_TEXT_MAX = 300;
const TARGET_MAX = 6;
const HEARD_MAX = 3;

export const GOSSIP_PROMPT = `你是这部小说的「消息风闻官」。有几个不在场的人，经各自的关系人听到了一些传闻；你只做一件事：判断传闻在每个人心里激起什么反应，写成人物簿补丁。

【规矩】
1. 只写收到传闻清单里的人；没收到的人一个字段都不要写。
2. 传闻未经证实：好感增减最多 ±3，且必须先过「他的性格吃不吃这套」——多疑的人对传闻将信将疑，淡漠的人懒得理会，与传闻当事人有旧怨/旧好的人才会有明显反应。拿不准就只写「流水」，别动好感。
3. 流水：一句话记「他从谁那里听说了什么」（≤60字），这是记录不是认定。
4. 情绪：可以给一个短期情绪（警惕、不安、幸灾乐祸、恼怒……一个词），三天自动消散。
5. 态度：只有传闻确实改变他对玩家的看法时才微调一句；不许把传闻当事实写成结论。
6. 依据：写清楚听到渠道（从谁、什么关系），不许编渠道。
7. 不许发明清单之外的传闻内容；不许替玩家或在场人物写任何东西。
8. 只输出 JSON，不要解释、不要 Markdown 代码块、不要前后缀。

【输出格式】
{"人物":[{"姓名":"纳兰嫣然","好感":-2,"好感理由":"传闻对他不利","依据":"从表姐处听说，表姐与云岚宗有旧","情绪":"不安","流水":"从表姐那里听说他在魔兽山脉连败两名斗者","态度":"对他多了一分忌惮"}]}

所有收到传闻的人都波澜不惊时，输出 {"人物":[]}。`;

/**
 * 拼给传播员的材料：传闻清单 + 每个目标「是谁、什么性格、经谁听到什么」。
 * 目标由入口按关系图挑好（不在场、与传闻出场人物有一跳边）。
 */
export function buildGossipUser({ rumors = [], targets = [], day = null, maxChars = 5000 } = {}) {
    const blocks = [];
    const rumorLines = (Array.isArray(rumors) ? rumors : [])
        .map(rumor => {
            const dayBit = Number.isFinite(Number(rumor?.day)) ? `第${Number(rumor.day)}天` : '第?天';
            const body = typeof rumor?.text === 'string' ? rumor.text.slice(0, RUMOR_TEXT_MAX) : '';
            return body ? `[${dayBit}] ${body}${rumor?.basis ? `（来历：${String(rumor.basis).slice(0, 80)}）` : ''}` : '';
        })
        .filter(Boolean);
    blocks.push(rumorLines.length ? `【传闻清单】（都是未证实的消息）\n${rumorLines.join('\n')}` : '【传闻清单】\n（没有传闻，输出 {"人物":[]}）');
    const targetBlocks = (Array.isArray(targets) ? targets : []).slice(0, TARGET_MAX).map(target => {
        const record = target?.record ?? {};
        const bits = [record.name || '（未知名）'];
        if (record.identity) bits.push(record.identity);
        if (Array.isArray(record.traits) && record.traits.length) bits.push(`性格：${record.traits.join('、')}`);
        if (record.taboo) bits.push(`雷区：${record.taboo}`);
        if (record.attitude) bits.push(`对玩家现状：${record.attitude}`);
        bits.push(`好感 ${record.favor ?? 0}`);
        const heard = (Array.isArray(target?.heard) ? target.heard : []).slice(0, HEARD_MAX)
            .map(item => {
                const from = typeof item?.from === 'string' ? item.from : '';
                const via = typeof item?.via === 'string' && item.via ? `（${item.via}）` : '';
                const text = typeof item?.rumor === 'string' ? item.rumor.slice(0, 120) : '';
                return from && text ? `从${from}${via}处听说：${text}` : '';
            })
            .filter(Boolean);
        const lines = [bits.join('｜'), ...(heard.length ? [`【听到渠道】\n${heard.join('\n')}`] : ['【听到渠道】\n（没有可用的传闻渠道）'])];
        return lines.join('\n');
    }).filter(Boolean);
    blocks.push(targetBlocks.length ? `【收到传闻的人】\n${targetBlocks.join('\n\n')}` : '【收到传闻的人】\n（没有目标，输出 {"人物":[]}）');
    if (Number.isFinite(Number(day))) blocks.push(`【世界时间】第 ${Number(day)} 天`);
    const body = blocks.join('\n\n');
    return body.length > maxChars ? body.slice(0, maxChars) : body;
}

/** 传播员的幅度上限：入口在落账前把好感增减压回这个带内，比人物簿的 ±10 更紧。 */
export const GOSSIP_FAVOR_STEP_MAX = 3;
