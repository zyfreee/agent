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
 */

let enginePromise = null;

function loadRegexEngine() {
    if (!enginePromise) {
        // 从 host/ 回到 scripts/extensions/ 需要五级；工作区没有这个相对位置，import 失败走兜底。
        enginePromise = import('../../../../../regex/engine.js').catch(() => null);
    }
    return enginePromise;
}

/** 套正则后的楼层正文；message 非 {mes,is_user} 形状或引擎不可用时原样返回。 */
export async function cleanFloorText(message, depth = undefined) {
    const raw = typeof message?.mes === 'string' ? message.mes : '';
    try {
        const engine = await loadRegexEngine();
        if (!engine?.getRegexedString || !engine?.regex_placement) return raw;
        const placement = message?.is_user === true ? engine.regex_placement.USER_INPUT : engine.regex_placement.AI_OUTPUT;
        return engine.getRegexedString(raw, placement, { isPrompt: true, depth });
    } catch {
        return raw;
    }
}

/** 批量清洗：entries = [{ role, text, isUser, depth }] → [{ role, text }]，顺序不变。
 *  清洗后变成空的楼层（被"远楼层隐藏"正则整楼清掉的）直接剔除，不留空槽。 */
export async function cleanFloorEntries(entries) {
    const list = Array.isArray(entries) ? entries : [];
    const cleaned = await Promise.all(list.map(entry => cleanFloorText({ mes: entry.text, is_user: entry.isUser === true }, entry.depth)));
    return list.map((entry, index) => ({ role: entry.role, text: cleaned[index] })).filter(floor => floor.text.trim());
}

/** 从角色卡自带的正则脚本里找"启用的、在提示词阶段把远楼层整楼替换成空"的最早 minDepth
 *  （＝主提示词还能看到几楼）。找不到返回 null。
 *  placement 沿用 regex_placement 数值：1=USER_INPUT、2=AI_OUTPUT；
 *  只管显示的（markdownOnly 且非 promptOnly）与替换不为空的都不算隐藏楼层。
 *  只喂角色脚本（character.data.extensions.regex_scripts），全局正则不参与。 */
export function regexHiddenFloorBound(scripts) {
    const list = Array.isArray(scripts) ? scripts : (Array.isArray(scripts?.scripts) ? scripts.scripts : []);
    let bound = null;
    for (const script of list) {
        if (!script || script.disabled === true) continue;
        const placements = Array.isArray(script.placement) ? script.placement : [script.placement];
        if (!placements.includes(1) && !placements.includes(2)) continue;
        if (script.markdownOnly === true && script.promptOnly !== true) continue;
        if (String(script.replaceString ?? '').trim() !== '') continue;
        const depth = Number(script.minDepth);
        if (Number.isInteger(depth) && depth > 0 && (bound === null || depth < bound)) bound = depth;
    }
    return bound;
}
