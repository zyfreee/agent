/** 冷藏推进用的独立提示词：只处理人物被世界事件牵连后的变化，先出草稿。 */

const MAX_TEXT = 1800;
/** 分块预算：档案、事件、正文各自有顶，事件列表装不下的整条丢并计数——
 *  不再让整包尾部硬截把排在后面的事件从中间切掉。 */
const PROFILE_BUDGET = 1500;
const EVENTS_BUDGET = 3000;
const FLOORS_BUDGET = 2000;
const EVENT_LINE_CHARS = 500;

function clip(value, limit = MAX_TEXT) {
    const text = typeof value === 'string' ? value.trim() : '';
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export const NPC_COLD_PROMPT = `你是酒馆里的「冷藏人物推进员」。某个人没有出现在当前场景，但世界时间和事件继续往前走了。你只根据给出的“原人物档案、世界时间差、确实牵连到他的新事件”，推演他可能发生的变化。

【铁规矩】
1. 只处理材料里明写、确实和这个人有关的事件；没有依据就输出 {"人物":[]}。
2. 不许改变世界时间，不许替玩家做决定，不许替其他人物写档。
3. 只能写这个人的变化：位置、在做什么、伤势、修为、资产、秘密、态度、好感增减、流水等；没变化的字段不要写。
4. 好感只写这段期间的增减，单次最多 ±10；没有明确依据不要动好感。
5. 流水只写这一段期间确实发生的事；不要编造精确对话、地点或战斗结果。
6. 这是“预览草稿”，不要假装已经写入人物簿。只输出 JSON，不要解释、不要 Markdown。
7. 「上次冷藏推进留痕」只用来衔接：上次确认过的变化已经在档案里，不要复读；标着“草稿被放弃”的不要原样重写，按新事件重新推演。

【输出格式】
{"人物":[{"姓名":"萧战","位置":"乌坦城","正在做什么":"处理族中事务","流水":["得知萧炎离城后派人打听消息"]}]}

没有足够依据时：{"人物":[]}`;

export function buildNpcColdUser({ record = null, fromDay = 1, toDay = 1, events = [], floors = [], lastNote = '', maxChars = 6500 } = {}) {
    const name = typeof record?.name === 'string' ? record.name.trim() : '';
    const lines = [`【目标人物】\n${name || '（未知人物）'}`];
    if (record && typeof record === 'object') {
        const keep = ['identity', 'realm', 'injury', 'location', 'presence', 'doing', 'attitude', 'favor', 'stage', 'want', 'fear', 'secret', 'items', 'money', 'property'];
        const current = keep.map(key => {
            const value = record[key];
            if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) return '';
            return `${key}：${typeof value === 'object' ? JSON.stringify(value) : value}`;
        }).filter(Boolean);
        if (current.length) lines.push(clip(`【当前档案】\n${current.join('\n')}`, PROFILE_BUDGET));
    }
    const note = typeof lastNote === 'string' ? lastNote.trim() : '';
    if (note) lines.push(`【上次冷藏推进留痕】\n${clip(note, 120)}`);
    lines.push(`【世界时间】第 ${Number(fromDay) || 1} 天 → 第 ${Number(toDay) || 1} 天`);
    const eventLines = (Array.isArray(events) ? events : []).map(event => {
        const head = [event?.id, event?.scope === 'world' ? '世界' : '身边', `第${event?.day || '?'}天`, event?.weight].filter(Boolean).join('｜');
        const involved = Array.isArray(event?.participants) && event.participants.length ? `（涉及：${event.participants.join('、')}）` : '';
        return `【${head}】${clip(event?.text || '', EVENT_LINE_CHARS)}${involved}${event?.basis ? `（依据：${clip(event.basis, 160)}）` : ''}`;
    }).filter(Boolean);
    const packed = [];
    let used = 0;
    let droppedEvents = 0;
    for (let index = 0; index < eventLines.length; index += 1) {
        const line = eventLines[index];
        if (used + line.length + 1 > EVENTS_BUDGET) {
            droppedEvents = eventLines.length - index;
            break;
        }
        packed.push(line);
        used += line.length + 1;
    }
    lines.push(`【确实牵连到此人的新事件】\n${packed.length ? packed.join('\n') : '（没有新事件）'}${droppedEvents ? `\n（另有 ${droppedEvents} 条较次要的事件没装进来，以装进来的为准）` : ''}`);
    const floorLines = (Array.isArray(floors) ? floors : []).map(floor => `【${floor?.role || '正文'}】${clip(floor?.text || '', 1200)}`).filter(Boolean);
    if (floorLines.length) lines.push(clip(`【最近正文参考】\n${floorLines.join('\n')}`, FLOORS_BUDGET));
    const body = lines.join('\n\n');
    return body.length > maxChars ? body.slice(0, maxChars) : body;
}
