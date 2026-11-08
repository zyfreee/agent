// 简略版·总结算：生成后原本的五次模型调用（人物记录、世界决定、影响决定、纳戒决定、记忆决定）
// 合并成一次调用——模型读一遍同样的聊天与各账本现状，五个账一次记完，输出一个 JSON；
// 脚本再把每一节送进各自的解析器与 runtime，逐条校验落账，坏条目照旧单条丢弃不连累别节。
// 完整版五条链的行为原样保留；这里只是并成一路的另一个版本。
// 五个侧的操作字典直接从各自单路提示词切片复用：单路提示词改了字典，这里自动跟新。

import { extractJson } from '../host/llm-client.js';
import { cleanFloorEntries } from '../host/floor-text.js';
import { WORLD_DECIDE_PROMPT } from '../world/world-decide.js';
import { IMPACT_DECIDE_PROMPT } from '../impact/impact-decide.js';
import { SELF_DECIDE_PROMPT } from '../self/self-decide.js';
import { MEMORY_DECIDE_PROMPT } from '../memory/memory-decide.js';
import { NPC_RECORD_PROMPT } from '../npc/npc-recorder.js';

const MAX_FLOORS = 12;
const FLOOR_CHARS = 800;
const MAX_BOOK_LINES = 40;
const MAX_NOTE_CHARS = 300;

/** 从单路提示词里切出操作字典段：从 marker 首次出现处取到结尾。 */
function sliceDict(prompt, marker) {
    const text = Array.isArray(prompt) ? prompt.join('\n') : String(prompt);
    const at = text.indexOf(marker);
    return at >= 0 ? text.slice(at) : text;
}

const WORLD_DICT = sliceDict(WORLD_DECIDE_PROMPT, '可用操作');
const IMPACT_DICT = sliceDict(IMPACT_DECIDE_PROMPT, '【可用操作');
const SELF_DICT = sliceDict(SELF_DECIDE_PROMPT, '可用操作');
const MEMORY_DICT = sliceDict(MEMORY_DECIDE_PROMPT, '- ops 里恰好');
const NPC_DICT = sliceDict(NPC_RECORD_PROMPT, '【谁能建档】');

/**
 * 总结算提示词（system）按闸门组装：功能开关关了哪本账，就不带那侧的操作字典与输出键，
 * 模型只记还开着的账。全部关闭时返回空串（那次调用整轮不发）。
 */
export function buildLiteSettlePrompt({ npc = true, world = true, impact = true, self = true, memory = true } = {}) {
    const books = [];
    if (npc) books.push(['═══ 第一册·人物（npc.人物，输出 {"人物":[…]}）═══', NPC_DICT]);
    if (world) books.push(['═══ 第二册·世界（world.ops，输出 {"note":"…","ops":[…]}）═══', WORLD_DICT]);
    if (impact) books.push(['═══ 第三册·影响（impact.ops，输出 {"note":"…","ops":[…]}）═══', IMPACT_DICT]);
    if (self) books.push(['═══ 第四册·纳戒（self.ops，输出 {"note":"…","ops":[…]}）═══', SELF_DICT]);
    if (memory) books.push(['═══ 第五册·记忆（memory.ops，输出 {"note":"…","ops":[…],"consolidate":{…可选…}}）═══', MEMORY_DICT]);
    if (!books.length) return '';
    const keys = [
        npc && '"npc":{"人物":[…]}', world && '"world":{"note":"…","ops":[…]}', impact && '"impact":{"note":"…","ops":[…]}',
        self && '"self":{"note":"…","ops":[…]}', memory && '"memory":{"note":"…","ops":[…],"consolidate":{…可选…}}',
    ].filter(Boolean).join(',');
    const CN = ['', '一', '二', '三', '四', '五'];
    return [
        `你是《斗破苍穹》同人角色卡的总账房（${[npc && '人物记录员', world && '世界主持人', impact && '世界记录员', self && '贴身账房', memory && '书记官'].filter(Boolean).join('+')}）。正文已经写完，你读一遍最近聊天、各账本现状和世界书资料，把${CN[books.length]}本账一次记完，输出能被脚本严格执行的一个 JSON：`,
        `{"note":"一句话总说明",${keys}}。`,
        '只输出这一个 JSON 对象，不要输出解释、标题或代码块以外的文字。某一侧这轮没有变化就给空清单/空数组（如 "ops":[]、"人物":[]），绝不为凑数而记账。',
        '所有权边界：主角的目标约定、境界物品归 self；NPC 的档案与好感归 npc；市井/势力/时间的推进归 world；世界被改成什么样（后果账）归 impact；本轮正文的叙事总结归 memory。一件事只记在它该在的那一册，不要跨册重复。',
        `npc${world ? '、world' : ''}${impact ? '、impact' : ''}${self ? '、self' : ''}${memory ? '、memory' : ''} 各键都必须出现（没有变化就空着），脚本按键取数。`,
        '',
        ...books.flatMap(([head, dict]) => [head, dict, '']),
        `最后再强调一遍：只输出一个 JSON 对象，${CN[books.length]}个键都在，各侧没有变化就空数组/空清单；各操作字典里的字段名、短标题上限、最多条数全部照旧执行。`,
    ].join('\n');
}

/** 全开时的完整提示词（兼容旧引用与单测）。 */
export const LITE_SETTLE_PROMPT = buildLiteSettlePrompt();

/** 结构化输出约束；解析端不依赖它，只用来提高严格度。 */
export const LITE_SETTLE_JSON_SCHEMA = Object.freeze({
    type: 'object',
    properties: {
        note: { type: 'string' },
        npc: { type: 'object', properties: { 人物: { type: 'array', items: { type: 'object' } } } },
        world: { type: 'object', properties: { note: { type: 'string' }, ops: { type: 'array', items: { type: 'object' } } } },
        impact: { type: 'object', properties: { note: { type: 'string' }, ops: { type: 'array', items: { type: 'object' } } } },
        self: { type: 'object', properties: { note: { type: 'string' }, ops: { type: 'array', items: { type: 'object' } } } },
        memory: {
            type: 'object',
            properties: {
                note: { type: 'string' },
                ops: { type: 'array', items: { type: 'object' } },
                consolidate: { type: 'object' },
            },
        },
    },
    required: ['npc', 'world', 'impact', 'self', 'memory'],
});

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** 解析总结算：抽 JSON、按桶取节；某一节缺了或形状不对只影响那一节，其他照常落账。 */
export function parseLiteSettleReply(raw) {
    let object;
    try {
        object = extractJson(raw);
    } catch (error) {
        return { status: 'invalid', note: '', sections: {}, error: String(error?.message ?? error) };
    }
    if (!object || typeof object !== 'object' || Array.isArray(object)) {
        return { status: 'invalid', note: '', sections: {}, error: '总结算不是 JSON 对象' };
    }
    const sections = {};
    if (isObject(object.npc)) sections.npc = object.npc;
    if (isObject(object.world)) sections.world = object.world;
    if (isObject(object.impact)) sections.impact = object.impact;
    if (isObject(object.self)) sections.self = object.self;
    if (isObject(object.memory)) sections.memory = object.memory;
    return {
        status: Object.keys(sections).length ? 'ok' : 'invalid',
        note: typeof object.note === 'string' ? object.note.trim().slice(0, MAX_NOTE_CHARS) : '',
        sections,
        error: Object.keys(sections).length ? '' : 'JSON 里没有任何可识别的账本分节',
    };
}

/** 人物簿索引行：编号|姓名|在场|重要|好感，与单路记录员的输入同口径。 */
function npcLedgerIndex(records = [], { maxLines = 60 } = {}) {
    const list = Array.isArray(records) ? records.filter(Boolean) : [];
    return list.slice(0, maxLines).map(record => [
        record?.name ?? '?',
        record?.presence === false ? '不在场' : '在场',
        record?.importance === '重要' ? '重要' : '',
        `好感${Number(record?.favor) || 0}`,
    ].filter(Boolean).join('|'));
}

/** 影响账本行：与单路记录员看到的清单同口径（决定员要读发酵安排与状态）。 */
function impactDecideLines(records = [], { maxLines = 30 } = {}) {
    const list = Array.isArray(records) ? records.filter(Boolean) : [];
    return list.slice(0, maxLines).map(record => [
        String(record?.id ?? '?'),
        record?.day !== undefined ? `第${record.day}天` : '',
        String(record?.weight ?? 'minor'),
        record?.status ? String(record.status) : '未了结',
        String(record?.kind ?? 'direct'),
        [String(record?.title ?? ''), String(record?.detail ?? '').slice(0, 60)].filter(Boolean).join('：'),
    ].filter(Boolean).join('|'));
}

/** 记忆现有清单行：只列标题，防止模型把已记近事换个措辞重记。 */
function memoryIndexLines(snapshot = {}, { maxLines = 60 } = {}) {
    const entries = Array.isArray(snapshot?.entries) ? snapshot.entries : [];
    return entries.slice(0, maxLines)
        .map(entry => `${entry.id}|${entry.tier === 'big' ? '大' : '小'}|${String(entry.title || entry.text || '').trim().slice(0, 24)}`)
        .filter(line => line.length > 4);
}

/** 组装发给模型的 user 内容：只带还开着的账本现状 + 相关世界书 + 最近聊天（旧→新）。 */
export function buildLiteSettleUser({
    floors = [], day = null, bookLines = [],
    npcLines = [], worldBlock = '', impactLines = [], selfBlock = '', memoryLines = [], consolidateLines = [],
    sections = {},
} = {}) {
    const chat = (Array.isArray(floors) ? floors : [])
        .slice(-MAX_FLOORS)
        .map(floor => {
            const role = floor?.role === '玩家' ? '玩家' : '角色';
            const body = typeof floor?.text === 'string' ? floor.text.trim().slice(0, FLOOR_CHARS) : '';
            return body ? `[${role}] ${body}` : null;
        })
        .filter(Boolean);
    const book = (Array.isArray(bookLines) ? bookLines : []).filter(line => typeof line === 'string' && line.trim()).slice(0, MAX_BOOK_LINES);
    const wantNpc = sections.npc !== false;
    const wantWorld = sections.world !== false;
    const wantImpact = sections.impact !== false;
    const wantSelf = sections.self !== false;
    const wantMemory = sections.memory !== false;
    return [
        `【世界时钟】${day !== null && day !== undefined ? `第 ${day} 天` : '（未知）'}`,
        '',
        wantNpc ? `【人物簿现状（姓名|在场|重要|好感，共 ${npcLines.length} 人）】` : null,
        wantNpc ? (npcLines.length ? npcLines.map(line => `- ${line}`).join('\n') : '- （人物簿还是空的）') : null,
        wantNpc ? '' : null,
        wantWorld ? '【世界台账（时间、事件、势力、任务与氛围）】' : null,
        wantWorld ? (typeof worldBlock === 'string' && worldBlock.trim() ? worldBlock : '- （世界台账还是空的）') : null,
        wantWorld ? '' : null,
        wantImpact ? `【世界影响账本（编号|天|分量|状态|性质|标题：详情，共 ${impactLines.length} 条）】` : null,
        wantImpact ? (impactLines.length ? impactLines.map(line => `- ${line}`).join('\n') : '- （影响账本是空的）') : null,
        wantImpact ? '' : null,
        wantSelf ? '【纳戒现状（主角此刻的自身状态与随身之物）】' : null,
        wantSelf ? (typeof selfBlock === 'string' && selfBlock.trim() ? selfBlock : '- （纳戒还是空的）') : null,
        wantSelf ? '' : null,
        wantMemory ? `【现有记忆清单（这些已经记过，共 ${memoryLines.length} 条）】` : null,
        wantMemory ? (memoryLines.length ? memoryLines.map(line => `- ${line}`).join('\n') : '- （还是空的）') : null,
        wantMemory && consolidateLines.length ? '【待整合小记忆（memory 侧顺带：把它们整批总结成 1 条大记忆，输出 consolidate 字段）】' : null,
        wantMemory && consolidateLines.length ? consolidateLines.map(line => `- ${line}`).join('\n') : null,
        '',
        `【世界书资料（与本轮聊天相关的条目，共 ${book.length} 条）】`,
        book.length ? book.map(line => `- ${line}`).join('\n') : '- （本轮没有命中的世界书条目）',
        '',
        `【最近聊天记录（旧 → 新，共 ${chat.length} 楼；记账对象=最后一楼正文）】`,
        chat.length ? chat.join('\n') : '- （还没有聊天内容）',
        '',
        `请把${[wantNpc && '人物', wantWorld && '世界', wantImpact && '影响', wantSelf && '纳戒', wantMemory && '记忆'].filter(Boolean).join('、') || '零'}本账一次记完，只输出 JSON：{"note":"…"${wantNpc ? ',"npc":{"人物":[…]}' : ''}${wantWorld ? ',"world":{"note":"…","ops":[…]}' : ''}${wantImpact ? ',"impact":{"note":"…","ops":[…]}' : ''}${wantSelf ? ',"self":{"note":"…","ops":[…]}' : ''}${wantMemory ? ',"memory":{"note":"…","ops":[…]}' : ''}}。各清单里条目前的编号就是对应操作要用的 id，只能用清单里已有的。`,
    ].filter(line => line !== null).join('\n');
}

/**
 * 总结算协调器：一轮只调一次模型，五个账本按节路由进各自的解析器与 runtime。
 * 落账、镜像全在各自 runtime 与桥里（与完整版共用），这里只做调用、分节与状态播报。
 */
export function createLiteSettle({
    mode, getContext, lastReplyIndex, capture, available, worldDay,
    floorsMax = () => 8, entriesMax = () => 12,
    complete, overrides, factsIndex, sandboxActive, volumeOf,
    npc, world, impact, self, memory, runConsolidation, onNpcCreated, audit,
    // 各功能自己的启用/自动开关（与完整版各记账链同口径）：关了哪个，对应分节就不落账。
    // gates 支持三种传法：函数（接线现读设置，值可以是函数或布尔）/「名字 => 函数或布尔」映射。
    // 统一折成「名字 => 布尔」的现读 thunk，模型侧与分节路由都只认布尔。
    // 函数形态（接线传 liteSettleGates 这类）每次都要现读：启用开关随开随关，
    // 下一轮调用就得生效，绝不能在工厂创建时把布尔值快照死；这里只在创建时
    // 探一次「键名集合」，值全部走现读。
    gates = {},
}) {
    const probe = typeof gates === 'function' ? (gates() ?? {}) : null;
    const names = probe ? Object.keys(probe) : Object.keys(gates ?? {});
    const gateMap = Object.fromEntries(names.map(name => [name, () => {
        try {
            if (probe !== null) {
                const map = gates?.() ?? {};
                if (!map) return true;
                const gate = map[name];
                return typeof gate === 'function' ? gate() !== false : gate !== false;
            }
            const gate = (gates ?? {})[name];
            return typeof gate === 'function' ? gate() !== false : gate !== false;
        } catch { return true; }
    }]));
    let running = null; // continuation 去重
    let settled = null; // { floor, identity, continuation } 楼层防重

    const floorIdentity = (chat, index) => JSON.stringify([chat[index]?.mes, chat[index]?.swipe_id]);

    async function run({ source = 'auto' } = {}) {
        if (mode() !== 'lite') return { status: 'disabled' };
        // 有闸门且全关才整次跳过；没传闸门＝默认全开（每节照常落账）。
        const gateValues = Object.values(gateMap);
        if (gateValues.length && gateValues.every(gate => gate() === false)) return { status: 'disabled' };
        if (running) return { status: 'busy' };
        const chat = Array.isArray(getContext()?.chat) ? getContext().chat : [];
        const index = lastReplyIndex(chat);
        if (index < 0) return { status: 'no_reply' };
        const identity = floorIdentity(chat, index);
        if (source === 'auto' && settled?.floor === index && settled.continuation.current() && settled.identity === identity) {
            return { status: 'already_decided' };
        }
        if (available() !== true) return { status: 'not_configured' };
        const continuation = capture();
        running = continuation;
        try {
            const floors = [];
            const rawFloors = [];
            for (let cursor = chat.length - 1; cursor >= 0 && rawFloors.length < floorsMax(); cursor -= 1) {
                const message = chat[cursor];
                if (!message || typeof message.mes !== 'string' || !message.mes.trim()) continue;
                if (message.is_system === true) continue;
                rawFloors.unshift({ role: message.is_user === true ? '玩家' : '角色', text: message.mes, isUser: message.is_user === true, depth: chat.length - 1 - cursor });
            }
            floors.push(...await cleanFloorEntries(rawFloors));
            if (!floors.length) return { status: 'no_input' };
            // 各功能的启用/自动开关先算好：关了哪本账，提示词里就不带那侧的现状与字典。
            const gate = {
                npc: gateMap.npc?.() !== false,
                world: gateMap.world?.() !== false,
                impact: gateMap.impact?.() !== false,
                self: gateMap.self?.() !== false,
                memory: gateMap.memory?.() !== false,
            };
            if (!gate.npc && !gate.world && !gate.impact && !gate.self && !gate.memory) return { status: 'disabled' };
            const recentText = floors.map(floor => floor.text).join('\n');
            const book = !sandboxActive() && entriesMax() > 0 && factsIndex?.stats?.().total > 0
                ? factsIndex.matchTokens(recentText, { limit: entriesMax(), volume: volumeOf() ?? null })
                : [];
            const bookLines = book.map(hit => {
                const entry = factsIndex.get?.(hit.uid);
                return entry ? `${entry.uid}|${entry.category}|${entry.name}|${entry.summary}` : null;
            }).filter(Boolean);
            // 待整合小记忆：与记忆决定同一口径——"本轮再记一条就到阈值"提前一轮备战。
            const memorySettings = memory.settings();
            const memorySnapshot = memory.snapshot();
            const smalls = (Array.isArray(memorySnapshot?.entries) ? memorySnapshot.entries : []).filter(entry => entry.tier === 'small');
            const threshold = Number(memorySettings?.consolidateAfter);
            const consolidateCandidates = gate.memory && Number.isInteger(threshold) && threshold > 0 && smalls.length >= 1 && smalls.length + 1 >= threshold ? smalls : [];
            // 纳戒按楼层基线读现状：同楼重 roll 时 apply 会先撤销上一版贡献再落新账。
            let selfSnapshot = self.snapshot();
            try { selfSnapshot = self.baselineForFloor?.(index) ?? selfSnapshot; } catch { /* 无基线按当前快照 */ }
            const raw = await complete({
                label: '总结算',
                system: buildLiteSettlePrompt(gate),
                user: buildLiteSettleUser({
                    floors,
                    day: worldDay(),
                    bookLines,
                    npcLines: gate.npc ? npcLedgerIndex(npc.list()) : [],
                    worldBlock: gate.world ? world.snapshotText() : '',
                    impactLines: gate.impact ? impactDecideLines(impact.records()) : [],
                    selfBlock: gate.self ? self.snapshotText(selfSnapshot) : '',
                    memoryLines: gate.memory ? memoryIndexLines(memorySnapshot) : [],
                    consolidateLines: gate.memory ? consolidateCandidates.map(entry => `${entry.id}|${String(entry.title || entry.text || '').trim().slice(0, 24)}`) : [],
                    sections: gate,
                }),
                jsonSchema: LITE_SETTLE_JSON_SCHEMA,
                overrides: overrides(),
            });
            if (!continuation.current()) return { status: 'stale' };
            const parsed = parseLiteSettleReply(raw);
            if (parsed.status === 'invalid') return { status: 'invalid', error: parsed.error };
            const day = worldDay();
            const replay = settled?.floor === index;
            const report = {
                npc: gate.npc ? 'absent' : 'disabled', world: gate.world ? 'absent' : 'disabled',
                impact: gate.impact ? 'absent' : 'disabled', self: gate.self ? 'absent' : 'disabled',
                memory: gate.memory ? 'absent' : 'disabled',
            };
            // 人物侧：补丁清单照旧整包交给人物簿（replay 语义与完整版记录员一致）。
            if (parsed.sections.npc && gate.npc) {
                const section = parsed.sections.npc;
                const parsedNpc = npc.parse(JSON.stringify(section));
                if (parsedNpc.status === 'invalid') {
                    report.npc = `invalid：${parsedNpc.reason}`;
                    npc.status(`总结算的人物清单读不懂，档案没动：${parsedNpc.reason}`);
                } else if (parsedNpc.status === 'empty') {
                    report.npc = 'empty';
                    npc.status('这一轮没有人物变化。');
                } else {
                    const result = npc.apply(parsedNpc.patches, { source: '正文', floor: index, day, replay });
                    if (['applied', 'ignored', 'empty'].includes(result.status)) {
                        const words = [];
                        if (result.created?.length) words.push(`新进 ${result.created.length} 人（${result.created.join('、')}）`);
                        if (result.changed) words.push(`更新 ${result.changed} 人`);
                        if (result.skipped?.length) words.push(`跳过 ${result.skipped.length} 条`);
                        npc.status(words.length ? `第 ${index + 1} 楼记完：${words.join('，')}。` : '这一轮没有人物变化。');
                        npc.refresh();
                        report.npc = result.status;
                        if (result.created?.length) onNpcCreated?.(result.created.slice(0, 4));
                    } else {
                        report.npc = String(result.status);
                        npc.status(`这一轮的人物变化没有落账：${result.reason ?? result.status}`);
                    }
                    npc.persist();
                }
            }
            // 世界侧：世界台账推进。
            if (parsed.sections.world && gate.world) {
                const decision = world.parse(JSON.stringify(parsed.sections.world));
                if (decision.status === 'invalid') {
                    report.world = `invalid：${decision.error}`;
                    world.status(`总结算的世界分节无法解析：${decision.error}`);
                } else {
                    const result = world.apply(decision.ops, { source: 'decide', floor: index });
                    if (!result.applied.length) world.note(decision.note || parsed.note || '模型判断本轮世界无变化。', { source: 'decide' });
                    world.persist();
                    world.status(decision.note ? `总结算·世界：${decision.note}` : '总结算·世界台账已更新。');
                    world.refresh();
                    report.world = `applied:${result.applied.length}`;
                }
            }
            // 影响侧：世界线偏移记账。
            if (parsed.sections.impact && gate.impact) {
                const decision = impact.parse(JSON.stringify(parsed.sections.impact));
                if (decision.status === 'invalid') {
                    report.impact = `invalid：${decision.error}`;
                    impact.status(`总结算的影响分节无法解析：${decision.error}`);
                } else {
                    const result = impact.apply(decision.ops, { source: 'decide', floor: index, day });
                    if (!result.applied.length) impact.note(decision.note || '世界线没有偏移。', { source: 'decide' });
                    impact.persist();
                    impact.status(result.applied.length
                        ? `总结算·影响：记录 ${result.applied.length} 条世界影响${result.due?.length ? `，${result.due.length} 条旧影响发酵` : ''}`
                        : '总结算·世界线没有新的偏移。');
                    impact.refresh();
                    report.impact = `applied:${result.applied.length}`;
                }
            }
            // 纳戒侧：主角自身变化。
            if (parsed.sections.self && gate.self) {
                const decision = self.parse(JSON.stringify(parsed.sections.self));
                if (decision.status === 'invalid') {
                    report.self = `invalid：${decision.error}`;
                    self.status(`总结算的纳戒分节无法解析：${decision.error}`);
                } else if (decision.status === 'empty' || !decision.ops.length) {
                    self.note(decision.note || '本轮纳戒无变化', { source: 'decide' });
                    self.status(decision.note || '本轮纳戒无变化。');
                    self.persist();
                    report.self = 'empty';
                } else {
                    const result = self.apply(decision.ops, { source: 'decide', floor: index, day });
                    self.persist();
                    self.status(`${decision.note || '纳戒已更新'}${result.rejected.length ? `（拒收 ${result.rejected.length} 条）` : ''}`);
                    self.refresh();
                    report.self = `applied:${result.applied.length}`;
                }
            }
            // 记忆侧：本轮总结 + 可选合并整合。
            if (parsed.sections.memory && gate.memory) {
                const section = parsed.sections.memory;
                const decision = memory.parse(JSON.stringify(section));
                if (decision.status === 'invalid') {
                    report.memory = `invalid：${decision.error}`;
                    memory.status(`总结算的记忆分节无法解析：${decision.error}`);
                } else {
                    const capped = memory.capOps(decision.ops, 1);
                    const result = memory.apply(capped.ops, { source: 'decide', floor: index, day });
                    if (!result.applied.length) memory.note(decision.note || '模型判断本轮无新记忆。', { source: 'decide' });
                    if (consolidateCandidates.length && section.consolidate) {
                        const allowed = new Set(consolidateCandidates.map(entry => entry.id));
                        const ids = (section.consolidate.ids || []).map(String).filter(id => allowed.has(id));
                        const newSmallIds = (memory.snapshot().entries || [])
                            .filter(entry => entry.tier === 'small' && entry.floor === index)
                            .map(entry => entry.id);
                        for (const id of newSmallIds) if (!ids.includes(id)) ids.push(id);
                        const merged = memory.consolidate({ ids, big: section.consolidate, day });
                        if (merged.ok) memory.consolidateStatus(`已总结（与总结算同一次调用）：${merged.summary}`);
                        else memory.note(`合并整合没有落账：${merged.reason}（小记忆原样保留，稍后单独再试）`, { source: 'consolidate' });
                    }
                    memory.persist();
                    memory.status(`总结算·记忆：${decision.note || '本轮记忆已更新。'}`);
                    memory.refresh();
                    runConsolidation?.({ source: 'auto' });
                    report.memory = `applied:${result.applied.length}`;
                }
            }
            settled = { floor: index, identity, continuation };
            audit?.(String(parsed.note || '总结算完成'));
            return { status: 'ok', report, note: parsed.note };
        } catch (error) {
            if (!continuation.current()) return { status: 'stale' };
            return { status: 'failed', reason: String(error?.message ?? error) };
        } finally {
            if (running === continuation) running = null;
        }
    }

    return {
        run,
        /** 换聊天/重读存档后调用：楼层防重记录作废。 */
        invalidate() { settled = null; },
        lastState: () => settled ? { floor: settled.floor, identity: settled.identity } : null,
    };
}
