/**
 * 楼层显示美化：把数据库改写过的用户楼层收拾成能看的样子。
 *
 * 每轮召回后，数据库会把用户楼层原文改写成三段（存档里就是这么存的）：
 *   ① 「以下是用户的本轮输入：」+ <本轮用户输入>正文</本轮用户输入>
 *   ② 召回导语「以下输入的代码为既定事实记忆的对应索引编码……」+ [时间约束词] 对照表 + 命中的记忆编码
 * 数据库一行不动（agent 适配数据库），美化全走显示层：这里注册五条「仅格式显示」的正则脚本
 * （placement=用户输入、markdownOnly=true、promptOnly=false、runOnEdit=false），只改渲染——
 * 存档原文不动、提示词不受影响，编辑楼层时看到的仍是原文。
 *   - 空行守护：输入段内的空行先压成单换行。markdown 的 HTML 块遇到空行会截断，卡片会散架。
 *   - 输入卡片：①整段包成 .dpz-round 卡片（简约玄幻：细金线 + 四角符箓，样式在 host/style.css）。
 *   - 导语收纳：②从导语起整段收走——那是提示词的家什，玩家没必要在楼层里看；
 *     记了什么去悬浮球「记忆存储」页看，命中了什么正文自己会体现。
 *   - 申报收纳：MVU 变量申报块 <UpdateVariable>…</UpdateVariable>（模型附在回复尾部的
 *     英文 Analysis/JSONPatch）是给仲裁器读的家什，AI 楼里原样露出过；用户楼里已有的
 *     「斗破纳戒 · 去除变量更新」只覆盖用户输入（placement=[1]），这里补 AI 楼这一侧。
 *     仅显示层，提示词照旧，仲裁器照旧从存档原文读帧。
 *   - 旧楼层隐去：给每一楼开头钉一个空帷幕标记（内容原样保留，只打点）。收不收由
 *     host/style.css 按位置动态决定——带标记又不在最近三块里的整楼 display:none。
 *     不按渲染时刻算深度：酒馆出了新楼不会重渲染旧楼，按深度清空会让“留几楼”越漂越远；
 *     按位置算就永远精准。想看全史：正则面板关掉这条脚本再重进聊天，存档一字不动。
 * 脚本落在角色卡的局部正则（character.data.extensions.regex_scripts）里，和卡绑定、随卡导出：
 * 别人把卡导入自己的酒馆，正则跟着卡走，不依赖装没装本扩展。扩展启动/换聊天时对斗破卡
 * 幂等补装（同名脚本已存在就一律不覆盖，用户手改过的为准）；老版本装进全局列表的五条
 * （id 带 doupo-agent- 前缀）由 stripGlobalDisplayRegexScripts 回收，用户自己的全局正则不碰。
 * 卡片自己的两条卡面局部正则原样保留，我们的五条追加在它们后面。
 * 局部正则要用户允许才生效（酒馆首次打开带内嵌正则的卡会弹一次确认）。
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

/** 旧楼层帷幕：内容原样保留，只在楼首钉一个空标记当“算位置”的抓手。
 *  标记用 HTML 块起头、空行隔开正文，之后的 markdown 照常渲染，一个字不受影响。
 *  placement 带上 AI 楼（2），用户楼（1）、AI 楼都算“附近三楼”窗口内的一楼。 */
const FLOOR_VEIL = Object.freeze({
    id: 'doupo-agent-floor-veil',
    scriptName: '斗破Agent · 旧楼层隐去',
    findRegex: '/([\\s\\S]+)/g',
    replaceString: '<div class="dpz-floor-veil"></div>\n\n$1',
    trimStrings: Object.freeze([]),
    placement: Object.freeze([1, 2]),
    disabled: false,
    markdownOnly: true,
    promptOnly: false,
    runOnEdit: false,
    substituteRegex: 0,
    minDepth: 0,
    maxDepth: null,
});

/** 申报块收纳：MVU 通道的家什（模型回复尾部的 <UpdateVariable> 英文块），仅显示层收走。
 *  用户楼侧已有宿主上的「斗破纳戒 · 去除变量更新」（placement=[1]）兜着，这里两边都收、
 *  只动显示；正文楼层读取（MVU 仲裁器）与提示词都不受影响。 */
const UPDATE_TAIL = Object.freeze({
    id: 'doupo-agent-update-tail',
    scriptName: '斗破Agent · 变量申报收纳',
    findRegex: '/<UpdateVariable>[\\s\\S]*?<\\/UpdateVariable>/g',
    replaceString: '',
    trimStrings: Object.freeze([]),
    placement: Object.freeze([1, 2]),
    disabled: false,
    markdownOnly: true,
    promptOnly: false,
    runOnEdit: false,
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
});

/** 显示层脚本按序生效：守护 → 卡片 → 收纳 → 申报收纳 → 帷幕。补装时也按这个顺序追加。 */
export const DISPLAY_REGEX_SCRIPTS = Object.freeze([ROUND_GUARD, ROUND_CARD, RECALL_TAIL, UPDATE_TAIL, FLOOR_VEIL]);

/** 全局列表里本扩展老版本的脚本 id 前缀：升级时只回收自己装的，用户自己的全局正则不碰。 */
const GLOBAL_ID_PREFIX = 'doupo-agent-';

/** 斗破卡的身份标记：卡内嵌的酒馆助手脚本名或世界书名，任一命中即认。换别的卡绝不写入。 */
const DOUPO_CARD_SCRIPT_MARKER = '斗破纳戒 · 变量结构';
const DOUPO_CARD_BOOK_NAME = '斗破世界书';

/** 这张卡是不是斗破卡：看内嵌酒馆助手脚本名，再看世界书名，任一命中就算。 */
export function isDoupoCard(character) {
    if (!character || typeof character !== 'object') return false;
    const scripts = character?.data?.extensions?.tavern_helper?.scripts ?? character?.extensions?.tavern_helper?.scripts;
    if (Array.isArray(scripts) && scripts.some(item => String(item?.name ?? '').trim() === DOUPO_CARD_SCRIPT_MARKER)) return true;
    const book = character?.data?.character_book?.name ?? character?.character_book?.name;
    return String(book ?? '').trim() === DOUPO_CARD_BOOK_NAME;
}

const FLAGGED_REGEX = /^\/([\s\S]+)\/([a-z]*)$/;

/** 把酒馆正则格式的 "/pattern/flags" 字符串还原成 RegExp（确保全局标志，替换要扫整楼）。 */
function toRegExp(findRegex) {
    const match = FLAGGED_REGEX.exec(findRegex);
    if (!match) return new RegExp(findRegex, 'g');
    return new RegExp(match[1], match[2].includes('g') ? match[2] : `${match[2]}g`);
}

/**
 * 按注册顺序把显示层脚本套在一段楼层原文上，返回渲染用的 HTML。
 * 门控镜像酒馆引擎 getRegexedString：只套仅显示层脚本、楼位要命中、深度在 min/max 之间；
 * 纯函数，测试与面板预览共用；真实渲染由酒馆正则扩展按同一份定义执行。
 * depth 以最新一楼为 0 往前数；placement 用 regex_placement 的值（1=用户楼，2=AI楼）。
 */
export function transformUserFloor(text, { depth = 0, placement = 1 } = {}) {
    if (typeof text !== 'string' || !text) return '';
    return DISPLAY_REGEX_SCRIPTS.reduce((current, script) => {
        if (!script.markdownOnly) return current;
        if (!script.placement.includes(placement)) return current;
        if (typeof script.minDepth === 'number' && depth < script.minDepth) return current;
        if (typeof script.maxDepth === 'number' && depth > script.maxDepth) return current;
        return current.replace(toRegExp(script.findRegex), script.replaceString);
    }, text);
}

/**
 * 幂等补装到卡片局部正则：缺哪条补哪条，已存在的一律不碰（尊重用户在正则面板里的手改与开关）。
 * 纯函数不改入参：writeExtensionField 是整表替换，返回的新数组（卡片原有条目原样保序在前）
 * 由调用方写回。existing 不是数组（卡还没带局部正则）时从空表起步。
 */
export function ensureScopedDisplayRegexScripts(existing) {
    const list = Array.isArray(existing) ? existing.slice() : [];
    const added = [];
    for (const definition of DISPLAY_REGEX_SCRIPTS) {
        const exists = list.some(script => script && script.scriptName === definition.scriptName);
        if (!exists) {
            list.push({ ...definition, trimStrings: [], placement: [...definition.placement] });
            added.push(definition.scriptName);
        }
    }
    return { status: 'ready', scripts: list, added };
}

/**
 * 回收老版本装进全局列表的本扩展脚本：只认 id 带 doupo-agent- 前缀的，其余原样保序。
 * 返回 kept（要写回全局列表的数组）与 removed（被回收的脚本名）；store 不是数组时 unavailable。
 */
export function stripGlobalDisplayRegexScripts(store) {
    if (!Array.isArray(store)) return { status: 'unavailable', kept: [], removed: [] };
    const removed = store
        .filter(script => script && typeof script.id === 'string' && script.id.startsWith(GLOBAL_ID_PREFIX))
        .map(script => String(script.scriptName ?? script.id));
    if (!removed.length) return { status: 'ready', kept: store, removed };
    return { status: 'ready', kept: store.filter(script => !(script && typeof script.id === 'string' && script.id.startsWith(GLOBAL_ID_PREFIX))), removed };
}
