/**
 * 楼层显示美化：把数据库改写过的用户楼层收拾成能看的样子。
 *
 * 每轮召回后，数据库会把用户楼层原文改写成三段（存档里就是这么存的）：
 *   ① 「以下是用户的本轮输入：」+ <本轮用户输入>正文</本轮用户输入>
 *   ② 召回导语「以下输入的代码为既定事实记忆的对应索引编码……」+ [时间约束词] 对照表 + 命中的记忆编码
 * 数据库一行不动（agent 适配数据库），美化全走显示层：这里注册三条「仅格式显示」的正则脚本
 * （placement=用户输入、markdownOnly=true、promptOnly=false、runOnEdit=false），只改渲染——
 * 存档原文不动、提示词不受影响，编辑楼层时看到的仍是原文。
 *   - 空行守护：输入段内的空行先压成单换行。markdown 的 HTML 块遇到空行会截断，卡片会散架。
 *   - 输入卡片：①整段包成 .dpz-round 卡片（简约玄幻：细金线 + 四角符箓，样式在 host/style.css）。
 *   - 导语收纳：②从导语起整段收走——那是提示词的家什，玩家没必要在楼层里看；
 *     记了什么去悬浮球「记忆存储」页看，命中了什么正文自己会体现。
 * 脚本落在酒馆正则扩展的全局列表（extension_settings.regex）里，正则面板可见、可改、可关；
 * 同名脚本已存在就一律不覆盖（用户手改过的为准），所以改样式直接改面板或 style.css。
 */

const ROUND_GUARD = Object.freeze({
    id: 'doupo-agent-round-input-guard',
    scriptName: '斗破Agent · 输入段空行守护',
    findRegex: '/(?<=<本轮用户输入>[^]{0,8000}?)\\n[ \\t]*\\n(?=[^]{0,8000}?<\\/本轮用户输入>)/g',
    replaceString: '\n',
    trimStrings: Object.freeze([]),
    placement: Object.freeze([1]),
    disabled: false,
    markdownOnly: true,
    promptOnly: false,
    runOnEdit: false,
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
});

const ROUND_CARD = Object.freeze({
    id: 'doupo-agent-round-input-card',
    scriptName: '斗破Agent · 本轮输入卡片',
    findRegex: '/以下是用户的本轮输入：\\s*<本轮用户输入>\\s*([^]*?)\\s*<\\/本轮用户输入>/g',
    replaceString: '<div class="dpz-round"><div class="dpz-round-head"><i>◈</i><b>本轮行动</b><i>◈</i></div><p class="dpz-round-text">$1</p></div>',
    trimStrings: Object.freeze([]),
    placement: Object.freeze([1]),
    disabled: false,
    markdownOnly: true,
    promptOnly: false,
    runOnEdit: false,
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
});

const RECALL_TAIL = Object.freeze({
    id: 'doupo-agent-recall-tail',
    scriptName: '斗破Agent · 召回导语收纳',
    findRegex: '/\\n*以下输入的代码为既定事实记忆的对应索引编码[^]*/g',
    replaceString: '',
    trimStrings: Object.freeze([]),
    placement: Object.freeze([1]),
    disabled: false,
    markdownOnly: true,
    promptOnly: false,
    runOnEdit: false,
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
});

/** 显示层脚本按序生效：守护 → 卡片 → 收纳。注册时也按这个顺序追加进全局列表。 */
export const DISPLAY_REGEX_SCRIPTS = Object.freeze([ROUND_GUARD, ROUND_CARD, RECALL_TAIL]);

const FLAGGED_REGEX = /^\/([\s\S]+)\/([a-z]*)$/;

/** 把酒馆正则格式的 "/pattern/flags" 字符串还原成 RegExp（确保全局标志，替换要扫整楼）。 */
function toRegExp(findRegex) {
    const match = FLAGGED_REGEX.exec(findRegex);
    if (!match) return new RegExp(findRegex, 'g');
    return new RegExp(match[1], match[2].includes('g') ? match[2] : `${match[2]}g`);
}

/**
 * 按注册顺序把显示层脚本套在一段用户楼层原文上，返回渲染用的 HTML。
 * 纯函数，测试与面板预览共用；真实渲染由酒馆正则扩展按同一份定义执行。
 */
export function transformUserFloor(text) {
    if (typeof text !== 'string' || !text) return '';
    return DISPLAY_REGEX_SCRIPTS.reduce(
        (current, script) => current.replace(toRegExp(script.findRegex), script.replaceString),
        text,
    );
}

/**
 * 幂等注册：缺哪条补哪条，已存在的一律不碰（尊重用户在正则面板里的手改与开关）。
 * 返回本次新增的脚本名；store 不是数组（正则扩展还没起好）时返回 unavailable。
 */
export function ensureDisplayRegexScripts(store) {
    if (!Array.isArray(store)) return { status: 'unavailable', added: [] };
    const added = [];
    for (const definition of DISPLAY_REGEX_SCRIPTS) {
        const exists = store.some(script => script && script.scriptName === definition.scriptName);
        if (!exists) {
            store.push({ ...definition, trimStrings: [], placement: [1] });
            added.push(definition.scriptName);
        }
    }
    return { status: 'ready', added };
}
