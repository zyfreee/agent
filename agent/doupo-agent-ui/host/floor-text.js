/**
 * 功能调用的楼层文本读取：与酒馆主提示词同款口径套用角色卡正则（isPrompt=true）。
 *
 * 主生成管线在组装提示词时对每楼跑 getRegexedString（script.js:4506：用户楼 USER_INPUT、
 * AI 楼 AI_OUTPUT、isPrompt=true、depth=从末往前数）——角色卡用正则隐藏的块（状态栏等）
 * 因此不进主提示词。扩展的各功能调用（决定/召回/总结算/记录员/判定）此前直接读 mes 原文，
 * 那些被藏起来的块会漏进功能模型；这里统一改成同一口径，功能模型看到的楼层与主模型一致。
 *
 * 正则引擎按需懒加载（酒馆本体 scripts/extensions/regex/engine.js，本体启动时已加载，
 * 动态 import 只是复用缓存）；工作区单测或引擎不可用时退回原文，绝不抛异常阻塞记账。
 * 在引擎口径之外再补一层：显示侧"清空类"正则（替换为空的）同样从功能喂料剥掉——
 * 功能模型是来抽事实的，屏幕上被收走的家什（变量申报、召回导语）没理由再喂给它；
 * "整楼隐藏"的有效可见窗口由 regexHiddenFloorBound 统一裁决（提示词侧清空、
 * 显示侧清空与自家帷幕都算，帷幕按屏幕实际保留的楼数计）。
 */

import { toRegExp, VEIL_SCRIPT_ID, VEIL_SCRIPT_NAME, VEIL_VISIBLE_FLOORS } from './display-regex.js';

let enginePromise = null;

function loadRegexEngine() {
    if (!enginePromise) {
        // 从 host/ 回到 scripts/extensions/ 需要五级；工作区没有这个相对位置，import 失败走兜底。
        enginePromise = import('../../../../../regex/engine.js').catch(() => null);
    }
    return enginePromise;
}

/** 角色脚本源：默认从酒馆全局上下文读当前角色卡的局部正则；测试可注入替身。 */
let characterScriptsSource = null;

/** 测试或特殊宿主注入角色脚本源（返回 character.data.extensions.regex_scripts 形状）；传 null 还原默认。 */
export function setCharacterRegexScriptsSource(provider) {
    characterScriptsSource = typeof provider === 'function' ? provider : null;
}

function characterRegexScripts() {
    try {
        const injected = characterScriptsSource?.();
        if (injected !== undefined) return injected;
        const context = globalThis.SillyTavern?.getContext?.();
        const character = context?.characters?.[context?.characterId];
        return character?.data?.extensions?.regex_scripts;
    } catch {
        return undefined;
    }
}

/** 显示侧"清空类"正则（markdownOnly、替换为空）表达的是"这内容不许被看见"：
 *  提示词侧引擎只套 promptOnly，这里补上显示侧这一半——功能喂料同样剥掉。
 *  美化类（替换成 HTML）不是隐藏，绝不进喂料；帷幕只钉标记，喂料不用它改文本
 * （窗口外的整楼已经被 regexHiddenFloorBound 的可见窗口整个剔除）。 */
function applyDisplayClearScripts(text, isUser, depth) {
    const scripts = characterRegexScripts();
    if (!Array.isArray(scripts) || typeof text !== 'string' || !text) return text;
    const placement = isUser ? 1 : 2;
    let out = text;
    for (const script of scripts) {
        if (!script || script.disabled === true) continue;
        if (script.markdownOnly !== true || script.promptOnly === true) continue;
        if (script.id === VEIL_SCRIPT_ID || script.scriptName === VEIL_SCRIPT_NAME) continue;
        if (String(script.replaceString ?? '').trim() !== '') continue;
        const placements = Array.isArray(script.placement) ? script.placement : [script.placement];
        if (!placements.includes(placement)) continue;
        if (typeof depth === 'number') {
            // 判空与酒馆引擎同款：minDepth/maxDepth 为 null 表示不设界，Number(null)=0 不能当真界限用。
            const min = Number(script.minDepth);
            if (script.minDepth !== null && script.minDepth !== undefined && Number.isInteger(min) && min >= -1 && depth < min) continue;
            const max = Number(script.maxDepth);
            if (script.maxDepth !== null && script.maxDepth !== undefined && Number.isInteger(max) && max >= 0 && depth > max) continue;
        }
        out = out.replace(toRegExp(script.findRegex), '');
    }
    return out;
}

/** 套正则后的楼层正文；message 非 {mes,is_user} 形状或引擎不可用时原样返回。 */
export async function cleanFloorText(message, depth = undefined) {
    const raw = typeof message?.mes === 'string' ? message.mes : '';
    const isUser = message?.is_user === true;
    let text = raw;
    try {
        const engine = await loadRegexEngine();
        if (engine?.getRegexedString && engine?.regex_placement) {
            const placement = isUser ? engine.regex_placement.USER_INPUT : engine.regex_placement.AI_OUTPUT;
            text = engine.getRegexedString(raw, placement, { isPrompt: true, depth });
        }
    } catch {
        text = raw;
    }
    // 提示词侧引擎只认 promptOnly 脚本；显示侧"清空类"正则（变量申报收纳、召回导语收纳这类
    // 替换为空的）也是"这内容不许被看见"的表达——功能喂料同样剥掉。美化类（替换成 HTML 的）
    // 不是隐藏，不进喂料。引擎不可用时（工作区单测）这一步独立生效，照样可测。
    return applyDisplayClearScripts(text, isUser, depth);
}

/** 剥掉楼层里的思维链幻括号：部分卡的正文以 <thinking>…</thinking> 开头，里面
 *  只是卡的演出脚手架（还常引用玩家输入原文），却按头部截断挤占决定链喂料的
 *  有限字数预算——实测出现过"模型只看到 thinking 里引用的输入、没看到失败正文"
 *  的误记账。闭合与未闭合（剥到文末）都处理；大小写不敏感。 */
export function stripThinkingBlocks(text) {
    const raw = typeof text === 'string' ? text : '';
    return raw
        .replace(/<thinking>[\s\S]*?<\/thinking\s*>/gi, '')
        .replace(/<thinking>[\s\S]*$/i, '');
}

/** 批量清洗：entries = [{ role, text, isUser, depth }] → [{ role, text }]，顺序不变。
 *  先剥思维链幻括号，再套与酒馆主提示词同款的角色卡正则；清洗后变成空的楼层
 * （被"远楼层隐藏"正则整楼清掉的）直接剔除，不留空槽。 */
export async function cleanFloorEntries(entries) {
    const list = Array.isArray(entries) ? entries : [];
    const cleaned = await Promise.all(list.map(entry => cleanFloorText({ mes: stripThinkingBlocks(entry.text), is_user: entry.isUser === true }, entry.depth)));
    return list.map((entry, index) => ({ role: entry.role, text: cleaned[index] })).filter(floor => floor.text.trim());
}

/** 从角色卡自带的正则脚本里找"整楼隐藏"的有效可见窗口（＝功能调用默认最多读几楼）。找不到返回 null。
 *  认三种形态，取最小深度：
 *  ① 提示词侧清空（promptOnly 或两侧皆不勾、替换为空、带 minDepth）——主提示词看不见这些楼；
 *  ② 显示侧清空（markdownOnly、替换为空、带 minDepth）——屏幕上看不见这些楼；
 *  ③ 自家「旧楼层隐去」帷幕——每楼钉标记、CSS 按位置收走最近窗口外的整楼，有效窗口＝保留楼数。
 *  对功能喂料而言"哪一侧藏的"不重要：屏幕和主提示词都看不见的内容就不该喂给功能模型。
 *  停用脚本、美化类替换（非空改写）与不落用户/AI 楼层的都不算。只喂角色脚本，全局正则不参与。 */
export function regexHiddenFloorBound(scripts) {
    const list = Array.isArray(scripts) ? scripts : (Array.isArray(scripts?.scripts) ? scripts.scripts : []);
    let bound = null;
    const consider = depth => {
        const n = Number(depth);
        if (Number.isInteger(n) && n > 0 && (bound === null || n < bound)) bound = n;
    };
    for (const script of list) {
        if (!script || script.disabled === true) continue;
        const placements = Array.isArray(script.placement) ? script.placement : [script.placement];
        if (!placements.includes(1) && !placements.includes(2)) continue;
        const replaceEmpty = String(script.replaceString ?? '').trim() === '';
        if (script.id === VEIL_SCRIPT_ID || script.scriptName === VEIL_SCRIPT_NAME) {
            // 帷幕只钉标记不删内容，不算"清空"：有效可见窗口＝max(保留楼数, 起跑深度)——
            // minDepth 之前的楼没有标记、CSS 永远不收，天然可见。
            if (!replaceEmpty) {
                const start = Number(script.minDepth);
                consider(Number.isInteger(start) && start > VEIL_VISIBLE_FLOORS ? start : VEIL_VISIBLE_FLOORS);
            }
            continue;
        }
        if (!replaceEmpty) continue;
        consider(script.minDepth);
    }
    return bound;
}
