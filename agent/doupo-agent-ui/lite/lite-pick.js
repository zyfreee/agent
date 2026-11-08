// 简略版·素材总挑选：备料阶段原本的三次模型调用（原著选条、记忆召回、场记挑选）
// 合并成一次调用——模型拿着同一份最近聊天，把三路素材一次挑完，输出一个 JSON。
// 完整版逐路挑选的行为原样保留；这里只是并成一路的另一个版本。
// 从 index.js 摘成依赖注入工厂：候选与调用都由调用方注入，测试直接喂桩比行为。

import { extractJson } from '../host/llm-client.js';
import { cleanFloorEntries } from '../host/floor-text.js';
import { buildRecallCatalog } from '../memory/memory-recall.js';

const MAX_FLOORS = 12;
const FLOOR_CHARS = 800;
const MAX_FACTS_LINES = 40;
const MAX_NOTE_CHARS = 300;
const MAX_FACTS = 24;
const MAX_IMPACT = 12;
const MAX_MEMORY = 12;

/**
 * 素材总挑选提示词（system）按需组装：功能开关关了哪路，提示词里就不带那路的岗位标准与输出桶；
 * 行动判定跟着行动结算的总闸走。全部关闭时返回空串（那次调用整轮不发）。
 */
export function buildLitePickPrompt({ facts = true, impact = true, memory = true } = {}) {
    const jobs = [];
    if (facts) jobs.push([
        '【原著设定（facts，填候选清单里的条目编号 uid）】',
        '标准：本轮聊天里实际提到或直接相关的人、势力、地点、物品、功法才挑；本卷故事线背景可以带；正文没碰到的章节设定不挑。候选给的是编号|类别|名称|摘要，只能挑清单里的编号。',
    ]);
    if (impact) jobs.push([
        '【世界影响（impact，填影响账本清单里的编号 i1、i2…）】',
        '标准：这一幕用得上的旧账才挑——玩家正处在它波及的地方、正在跟它打交道、或它该在本轮显形。跟本轮场景无关的旧影响不挑；一条都挑不出来是正常结果。',
    ]);
    if (memory) jobs.push([
        '【旧记忆（memory，填记忆目录里的编号 m1、m2…）】',
        '标准：忘了就会写矛盾、写断线的旧记忆才召回——久别的人、先前的约定、悬而未决的恩怨；本轮场景正文里已经演到的近事不用重复召回。',
    ]);
    if (!jobs.length) return '';
    const keys = [
        facts && '"facts":[…原著条目编号…]', impact && '"impact":[…影响编号…]',
        memory && '"memory":[…记忆编号…]',
    ].filter(Boolean).join(',');
    const CN = ['', '一', '二', '三'];
    return [
        `你是《斗破苍穹》同人角色卡的素材总管。正文生成之前，你读一遍最近聊天（含玩家刚发的新输入），同时替${CN[jobs.length]}个岗位干活，输出一个 JSON：`,
        `{"note":"一句话总说明",${keys}}。`,
        '不要输出解释、标题或代码块以外的文字；素材某一路这轮没有可挑的就给空数组，绝不为凑数硬挑。',
        '',
        ...jobs.flatMap(([head, ...rules]) => [head, ...rules, '']),
        '素材宁可少挑：素材是给正文模型压场用的，多而杂会稀释正文。',
    ].join('\n');
}

/** 全开时的完整提示词（兼容旧引用与单测）。 */
export const LITE_PICK_PROMPT = buildLitePickPrompt();

/** 结构化输出约束；解析端不依赖它，只用来提高严格度。 */
export const LITE_PICK_JSON_SCHEMA = Object.freeze({
    type: 'object',
    properties: {
        note: { type: 'string' },
        facts: { type: 'array', items: { type: ['string', 'number'] } },
        impact: { type: 'array', items: { type: 'string' } },
        memory: { type: 'array', items: { type: 'string' } },
    },
    required: ['facts', 'impact', 'memory'],
});

const cleanList = (value, cap) => {
    const list = Array.isArray(value) ? value : [];
    const out = [];
    for (const item of list) {
        if (item === null || item === undefined) continue;
        const key = String(item).trim();
        if (!key || out.includes(key)) continue;
        out.push(key);
        if (out.length >= cap) break;
    }
    return out;
};

/** 解析挑选结果：抽 JSON、三桶各自去重限长；note 坏了不影响三桶。 */
export function parseLitePickReply(raw) {
    let object;
    try {
        object = extractJson(raw);
    } catch (error) {
        return { status: 'invalid', facts: [], impact: [], memory: [], note: '', error: String(error?.message ?? error) };
    }
    if (!object || typeof object !== 'object' || Array.isArray(object)) {
        return { status: 'invalid', facts: [], impact: [], memory: [], note: '', error: '挑选结果不是 JSON 对象' };
    }
    return {
        status: 'ok',
        facts: cleanList(object.facts, MAX_FACTS),
        impact: cleanList(object.impact, MAX_IMPACT),
        memory: cleanList(object.memory, MAX_MEMORY),
        note: typeof object.note === 'string' ? object.note.trim().slice(0, MAX_NOTE_CHARS) : '',
    };
}

/** 影响账本一行：编号|天|分量|状态|标题：详情（截断），与场记挑选的清单同口径。 */
export function impactPickLines(records = [], { maxLines = 30, detailChars = 48 } = {}) {
    const list = Array.isArray(records) ? records.filter(Boolean) : [];
    return list.slice(0, maxLines).map(record => {
        const title = String(record?.title ?? '').trim();
        const detail = String(record?.detail ?? '').trim().slice(0, detailChars);
        return [
            String(record?.id ?? '?'),
            record?.day !== undefined ? `第${record.day}天` : '',
            String(record?.weight ?? 'minor'),
            record?.status ? String(record.status) : '未了结',
            detail ? `${title}：${detail}` : title,
        ].filter(Boolean).join('|');
    });
}

/** 组装发给模型的 user 内容：玩家输入 + 最近聊天 + 只带还开着的岗位的候选清单。 */
export function buildLitePickUser({ input = '', floors = [], factsLines = [], impactLines = [], memoryCatalog = '', day = null, sections = {} } = {}) {
    const chat = (Array.isArray(floors) ? floors : [])
        .slice(-MAX_FLOORS)
        .map(floor => {
            const role = floor?.role === '玩家' ? '玩家' : '角色';
            const body = typeof floor?.text === 'string' ? floor.text.trim().slice(0, FLOOR_CHARS) : '';
            return body ? `[${role}] ${body}` : null;
        })
        .filter(Boolean);
    const wantFacts = sections.facts !== false;
    const wantImpact = sections.impact !== false;
    const wantMemory = sections.memory !== false;
    const factList = wantFacts ? (Array.isArray(factsLines) ? factsLines : []).filter(line => typeof line === 'string' && line.trim()).slice(0, MAX_FACTS_LINES) : [];
    const impactList = wantImpact ? (Array.isArray(impactLines) ? impactLines : []).filter(line => typeof line === 'string' && line.trim()) : [];
    const keys = [
        wantFacts && '"facts":[…]', wantImpact && '"impact":[…]', wantMemory && '"memory":[…]',
    ].filter(Boolean).join(',');
    const CN = ['', '一', '二', '三'];
    const jobNames = [wantFacts && '原著', wantImpact && '影响', wantMemory && '记忆'].filter(Boolean).join('／');
    return [
        input ? `【本轮玩家输入】\n${String(input).trim().slice(0, FLOOR_CHARS)}` : null,
        '',
        day !== null && day !== undefined ? `（世界时钟：第 ${day} 天）` : null,
        '',
        wantFacts ? `【原著设定候选（编号|类别|名称|摘要，共 ${factList.length} 条）】` : null,
        wantFacts ? (factList.length ? factList.map(line => `- ${line}`).join('\n') : '- （本轮没有命中的原著条目）') : null,
        wantFacts ? '' : null,
        wantImpact ? `【世界影响账本（编号|天|分量|状态|标题：详情，共 ${impactList.length} 条）】` : null,
        wantImpact ? (impactList.length ? impactList.map(line => `- ${line}`).join('\n') : '- （影响账本是空的）') : null,
        wantImpact ? '' : null,
        wantMemory ? '【记忆目录（编号|层|标题（钥匙））】' : null,
        wantMemory ? (typeof memoryCatalog === 'string' && memoryCatalog.trim() ? memoryCatalog : '（记忆库还是空的）') : null,
        wantMemory ? '' : null,
        `【最近聊天记录（旧 → 新，共 ${chat.length} 楼）】`,
        chat.length ? chat.join('\n') : '- （还没有聊天内容）',
        '',
        `请替${jobNames || '零个岗位'}各干各的活，只输出 JSON：{"note":"…",${keys}}。`,
    ].filter(line => line !== null).join('\n');
}

/** 收集最近几楼聊天（旧→新，跳过系统楼），与各决定通道同一套口径。
 *  楼层按主提示词同款口径套角色卡正则（被隐藏的块不进挑选员），因此是异步的。 */
export async function collectFloors(chat, max = MAX_FLOORS, floorChars = FLOOR_CHARS) {
    const list = Array.isArray(chat) ? chat : [];
    const raws = [];
    for (let cursor = list.length - 1; cursor >= 0 && raws.length < max; cursor -= 1) {
        const message = list[cursor];
        if (!message || typeof message.mes !== 'string' || !message.mes.trim()) continue;
        if (message.is_system === true) continue;
        raws.unshift({
            role: message.is_user === true ? '玩家' : '角色',
            text: message.mes.trim(),
            isUser: message.is_user === true,
            depth: list.length - 1 - cursor,
        });
    }
    const cleaned = await cleanFloorEntries(raws);
    return cleaned.map(floor => ({ ...floor, text: floor.text.slice(0, floorChars) }));
}

/**
 * 素材总挑选协调器：一轮只调一次模型，四个消费方（影响注入、记忆召回、原著选条、行动判定）共享结果。
 * 每个消费方的功能开关关了，提示词里就不带那一路的候选与标准；全关时整次调用不发。
 * 缓存键由调用方注入（口径与影响注入签名一致：作用域+轮次键+设置），重 roll 复用、改设置作废。
 */
export function createLitePick({
    mode, keyOf, worldDay, factsIndex, sandboxActive, volumeOf,
    impactRecords, memorySnapshot, maxFloors = () => 8, maxEntries = () => 12,
    complete, overrides, onFailure,
    consumers = () => ({ facts: true, memory: true, impact: true }),
}) {
    let cache = null; // { key, result }
    let inflight = null; // { key, promise }

    async function run({ chat = null } = {}) {
        if (mode() !== 'lite') return { status: 'disabled' };
        const jobs = consumers() ?? {};
        const enabled = {
            facts: jobs.facts === true, memory: jobs.memory === true, impact: jobs.impact === true,
        };
        if (!enabled.facts && !enabled.memory && !enabled.impact) {
            return { status: 'disabled', facts: [], impact: [], memory: [], note: '' };
        }
        const list = Array.isArray(chat) ? chat : [];
        const key = keyOf(list);
        if (cache && cache.key === key) return cache.result;
        if (inflight && inflight.key === key) return inflight.promise;
        const promise = (async () => {
            const floors = await collectFloors(list, maxFloors());
            if (!floors.length) return { status: 'no_input', facts: [], impact: [], memory: [], note: '' };
            const recentText = floors.map(floor => floor.text).join('\n');
            const latestInput = [...floors].reverse().find(floor => floor.isUser)?.text ?? '';
            // 原著候选：脚本先用关键词把整库缩到几十条，模型只在这份候选里点名（与决定通道同一套口径）。
            let factLines = [];
            if (enabled.facts && !sandboxActive() && maxEntries() > 0 && factsIndex?.stats?.().total > 0) {
                const hits = factsIndex.matchTokens(recentText, { limit: maxEntries(), volume: volumeOf() ?? null });
                factLines = hits.map(hit => {
                    const entry = factsIndex.get?.(hit.uid);
                    return entry ? `${entry.uid}|${entry.category}|${entry.name}|${entry.summary}` : null;
                }).filter(Boolean);
            }
            const impactList = enabled.impact ? impactPickLines(impactRecords?.() ?? []) : [];
            const catalog = enabled.memory ? buildRecallCatalog(memorySnapshot?.() ?? {}, { sceneText: recentText }) : '';
            const raw = await complete({
                label: '素材总挑选',
                system: buildLitePickPrompt(enabled),
                user: buildLitePickUser({
                    input: latestInput, floors, factsLines: factLines, impactLines: impactList,
                    memoryCatalog: catalog, day: worldDay?.() ?? null,
                    sections: enabled,
                }),
                jsonSchema: LITE_PICK_JSON_SCHEMA,
                overrides: overrides(),
            });
            const parsed = parseLitePickReply(raw);
            if (parsed.status === 'invalid') {
                const message = `素材总挑选输出无法解析：${parsed.error}`;
                onFailure?.('素材总挑选', message);
                return { status: 'failed', facts: [], impact: [], memory: [], note: message };
            }
            return {
                ...parsed,
                // 关掉的那路即使模型多嘴给了结果也不产出：开关语义是整路不参与。
                facts: enabled.facts ? parsed.facts : [],
                impact: enabled.impact ? parsed.impact : [],
                memory: enabled.memory ? parsed.memory : [],
                status: parsed.facts.length || parsed.impact.length || parsed.memory.length ? 'ok' : 'empty',
            };
        })();
        inflight = { key, promise };
        try {
            const result = await promise;
            cache = { key, result };
            return result;
        } catch (error) {
            const message = String(error?.message ?? error);
            onFailure?.('素材总挑选', message);
            const result = { status: 'failed', facts: [], impact: [], memory: [], note: message };
            cache = { key, result };
            return result;
        } finally {
            if (inflight?.key === key) inflight = null;
        }
    }

    return {
        run,
        /** 换聊天/重读存档后调用：本局挑选缓存作废。 */
        invalidate() { cache = null; inflight = null; },
        lastState: () => cache?.result ?? null,
    };
}
