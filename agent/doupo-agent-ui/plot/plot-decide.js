/**
 * 剧情决定：LLM 滚动维护"剧情前瞻"的核心。
 * 模型输入 = 最近聊天 + 世界时钟 + 剧情账本现状（计划 + 开放线索）；输出 = 一条 note + 一组操作；
 * 脚本逐条校验执行（plot-runtime），结果原样呈现到面板。
 *
 * 分工边界（提示词里写死）：这里只管叙事层——本幕目标、下一步走向、未回收线索；
 * 世界事件、任务、人物态度、纳戒各有自己的账，越界操作会被脚本拒绝。
 *
 * 提示词可在设置里改写（plot.decidePrompt，留空用 PLOT_DECIDE_PROMPT）。
 */

import { extractJson } from '../host/llm-client.js';
import { buildPlotInjection } from './plot-ops.js';

const MAX_FLOORS = 12;
const FLOOR_CHARS = 800;
const MAX_NOTE_CHARS = 200;
const MAX_OPS = 8;

/** 默认决定提示词（system）。改写时保持"只输出 JSON"与操作字段名不变，否则脚本解析不到。 */
export const PLOT_DECIDE_PROMPT = [
    '你是《斗破苍穹》同人角色卡的剧情账房。你只做一件事：读最近聊天和剧情账本，维护两样东西——滚动计划（本幕目标、下一步走向）和线索账（伏笔/悬念/恩怨），输出能被脚本严格执行的 JSON。',
    '只输出一个 JSON 对象：{"note":"一句话说明这轮剧情判断","ops":[…]}。不要输出解释、标题或代码块以外的文字。',
    '可用操作（脚本逐条校验，写错字段或越界的条目会被丢弃，不影响其他条目）：',
    '- {"op":"setPlan","goal":"本幕目标≤60字：当前这段剧情要把什么事推向什么结果","next":"下一步走向≤120字：下一两轮正文该往哪写"}：滚动计划。计划要从当前剧情自然长出来，不要凭空另起炉灶；目标没变就只更新 next，两个都写也行。',
    '- {"op":"addThread","title":"必写：不超过16字短标题，一眼看懂是哪条线","kind":"foreshadow伏笔|suspense悬念|conflict恩怨","detail":"不超过200字：线索内容——埋了什么、等什么来收","basis":"必写：从哪来（哪楼/谁/什么事埋下的）","dueDays":预期回收窗口≤90}：登记线索。伏笔=已经埋下等回收的钩子（信物、来历、一句意味深长的话）；悬念=玩家正等答案的谜（幕后黑手、玉简内容）；恩怨=人物间没了的账（仇家记恨、亏欠人情）。没有依据不记，正文随口一提的小事不记。',
    '- {"op":"updateThread","id":"f3","detail":"最新进展"}：给已登记的线索推进阶段——传闻升级、恩怨发酵都走它；id 必须是台账里已有的线索。',
    '- {"op":"resolveThread","id":"f3","outcome":"≤80字怎么回收的"}：线索回收——伏笔揭晓、悬念揭底、恩怨了结时用；id 只能用台账里已有的编号。',
    '- {"op":"dropThread","id":"f3","outcome":"≤80字为什么放弃"}：线索作废——剧情明确绕开了这条线、或它已随剧情自然失效时用，不硬凑回收。',
    '计划规则：每轮看情况更新——剧情推进到新阶段、或下一步和账上写的对不上了才改；没变化就不动，绝不为凑数而改。本幕目标写"事"不写"景"（如"三年之约前在乌坦城站稳"），下一步写"下一两轮具体往哪推"。',
    '线索规则：正文里埋的钩子、玩家追问未解的谜、人物间未了的恩怨才登记；basis 必须一句话写清从哪来。注入列表里会标悬置天数——悬置越久越该找机会回收或推进，但回收必须有剧情依据，不要硬收；到期（dueDays 设过的）还没动静的线索，要么在 updateThread 里给它新进展，要么在 note 里说明为什么继续悬着。',
    '边界：世界事件、任务、人物态度、主角状态各有自己的账，这里一律不管——不要输出那些域的操作，也不要把任务当线索重复登记（任务在任务栏，玩家接下的事走任务系统）。',
    '没有需要记下的变化就输出 {"note":"本轮剧情线无变化","ops":[]}，绝不为凑数而编线索。',
].join('\n');

/** 给酒馆 generateQuietPrompt 的结构化输出约束；解析端并不依赖它，只是提高严格度。 */
export const PLOT_JSON_SCHEMA = Object.freeze({
    type: 'object',
    properties: {
        note: { type: 'string' },
        ops: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    op: { type: 'string', enum: ['setPlan', 'addThread', 'updateThread', 'resolveThread', 'dropThread'] },
                    goal: { type: 'string' }, next: { type: 'string' },
                    title: { type: 'string' }, kind: { type: 'string', enum: ['foreshadow', 'suspense', 'conflict'] },
                    detail: { type: 'string' }, basis: { type: 'string' },
                    dueDays: { type: 'number' }, id: { type: 'string' }, outcome: { type: 'string' },
                },
                required: ['op'],
                anyOf: [
                    {
                        properties: { op: { enum: ['addThread'] }, title: { type: 'string', minLength: 1, maxLength: 16, pattern: '\\S' }, basis: { type: 'string', minLength: 1 } },
                        required: ['op', 'title', 'basis'],
                    },
                    {
                        properties: { op: { enum: ['setPlan', 'updateThread', 'resolveThread', 'dropThread'] } },
                        required: ['op'],
                    },
                ],
            },
        },
    },
    required: ['ops'],
});

/** 组装发给模型的 user 内容：剧情账本现状 + 世界时钟 + 本轮结算裁定 + 最近聊天（旧→新）。 */
export function buildPlotDecideUser({ snapshot = {}, clockText = '', floors = [], settleLines = [] } = {}) {
    const ledgerBlock = buildPlotInjection(snapshot, { maxChars: 1200 });
    const settle = (Array.isArray(settleLines) ? settleLines : []).filter(line => typeof line === 'string' && line.trim());
    const chat = (Array.isArray(floors) ? floors : [])
        .slice(-MAX_FLOORS)
        .map(floor => {
            const role = floor?.role === '玩家' ? '玩家' : '角色';
            const body = typeof floor?.text === 'string' ? floor.text.trim().slice(0, FLOOR_CHARS) : '';
            return body ? `[${role}] ${body}` : null;
        })
        .filter(Boolean);
    return [
        '【剧情账本（当前滚动计划与开放线索）】',
        ledgerBlock || '- （账本还是空的：还没有计划，也没有登记过线索）',
        '',
        '【世界时钟】',
        clockText ? clockText : '- （世界台账还没有时钟）',
        '',
        ...(settle.length ? ['【本轮行动结算（生成前已判定，计划与线索须与判定一致）】', ...settle, ''] : []),
        `【最近聊天记录（旧 → 新，共 ${chat.length} 楼）】`,
        chat.length ? chat.join('\n') : '- （还没有聊天内容）',
        '',
        '请维护剧情账本，只输出 JSON：{"note":"…","ops":[…]}。',
    ].join('\n');
}

/** 解析模型决定：抽 JSON、限长、过滤坏条目；坏 note 不影响 ops。 */
export function parsePlotDecision(raw) {
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
