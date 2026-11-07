import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DISPLAY_REGEX_SCRIPTS, ensureScopedDisplayRegexScripts, stripGlobalDisplayRegexScripts, isDoupoCard, transformUserFloor } from './display-regex.js';

// 夹具取自真实聊天存档（斗破卡面测试 2026-10-31@18h28m37s）里被数据库改写过的用户楼层。
const REAL_FLOOR = [
    '以下是用户的本轮输入：',
    '<本轮用户输入>',
    '趁天还没黑，先去镇口探探去黑土坊的路况，把明天的货单理清楚。',
    '</本轮用户输入>',
    '',
    '以下输入的代码为既定事实记忆的对应索引编码，并已按时间距离分组。注意，请参考这些过去记忆保持剧情连续性，不在正文里直接引用编码，并自然融入对应的时间约束词：',
    '',
    '[时间约束词]',
    'now=刚刚|刚才|眼下|此刻|这会儿',
    'today=今天早些时候|今天稍早|白天的时候|今天',
    'days=这两天|这几天|近几天|前些天',
    'weeks=前阵子|这阵子|早些时候',
    'months=半个月前|上个月|之前|不久前|前些日子',
    'seasons=几个月前|小半年前|当时|那阵子|上次',
    'years=一年前|去年|前几年|这几年|几年前|那几年|好多个月前',
    'old=很久以前|过去|那阵子|早些时候|当时|上次',
    'unknown=有一次|曾经|某次|上次',
].join('\n');

// 帷幕标记：旧楼层隐去的抓手。每楼楼首都钉一个（内容原样保留），收不收由 style.css 按位置算。
const VEIL_MARK = '<div class="dpz-floor-veil"></div>';

// 渲染结构：标记 + 空行 + 卡片。空行是 markdown 块分隔，标记之后的 markdown 照常渲染。
const rendered = transformUserFloor(REAL_FLOOR);
assert.ok(rendered.startsWith(`${VEIL_MARK}\n\n<div class="dpz-round">`), '楼层应为 帷幕标记+卡片 结构');
assert.ok(rendered.includes('>趁天还没黑，先去镇口探探去黑土坊的路况，把明天的货单理清楚。</p></div>'), '正文应原样进卡片');
for (const noise of ['以下是用户的本轮输入', '本轮用户输入', '既定事实记忆', '时间约束词', 'now=刚刚']) {
    assert.ok(!rendered.includes(noise), `渲染层不应再出现提示词家什：${noise}`);
}
assert.deepEqual(
    rendered.split('\n\n'),
    [VEIL_MARK, rendered.slice(VEIL_MARK.length + 2)],
    '空行只该有标记与卡片之间这一处',
);
assert.equal(rendered.trim(), rendered, '卡片外不应残留空白');

// 输入段内的空行要被压成单换行：markdown 的 HTML 块遇到空行会截断，卡片会散架。
const paragraphed = transformUserFloor(
    '以下是用户的本轮输入：\n<本轮用户输入>\n第一段，去黑土坊。\n\n第二段，顺便探路。\n</本轮用户输入>',
);
assert.ok(paragraphed.includes('第一段，去黑土坊。\n第二段，顺便探路。'), '空行应压成单换行');
assert.deepEqual(
    paragraphed.split('\n\n'),
    [VEIL_MARK, paragraphed.slice(VEIL_MARK.length + 2)],
    '标记之外不应再有空行',
);

// 单个换行（无空行）要原样保留；楼层末尾的召回导语与约束词表整段收走。
const multiline = transformUserFloor(
    '以下是用户的本轮输入：\n<本轮用户输入>\n第一行\n第二行\n</本轮用户输入>\n\n以下输入的代码为既定事实记忆的对应索引编码，并已按时间距离分组。\n\n[时间约束词]\nnow=刚刚|刚才',
);
assert.ok(multiline.includes('第一行\n第二行'), '普通换行不动');
assert.ok(!multiline.includes('时间约束词'), '导语之后的家什全收走');
assert.deepEqual(multiline.split('\n\n'), [VEIL_MARK, multiline.slice(VEIL_MARK.length + 2)], '空行仍只有标记分隔一处');

// AI 楼：不套卡片，但帷幕标记照钉，正文一字不动（placement=2 走 AI 楼位）。
const AI_FLOOR = '<think_nya>斗气在经脉里转了三周天，药老的声音在识海里响起。</think_nya>\n萧炎抬眼望向陨落山脉的方向。<comment>斗气：斗者三星</comment>';
assert.equal(
    transformUserFloor(AI_FLOOR, { placement: 2 }),
    `${VEIL_MARK}\n\n${AI_FLOOR}`,
    'AI 楼只钉标记，正文一字不动',
);

// MVU 变量申报块是给仲裁器读的家什（英文 Analysis/JSONPatch），不该出现在玩家看的楼层里；
// 夹具取自真实验收聊天（2026-11-05@02h40m48s 第 2 楼）的申报块样式。
const AI_UPDATE_BLOCK = [
    '<game>',
    '伙计侧过身子，右手平伸着朝大堂中间空着的一张干净八仙桌引了引。',
    '</game>',
    '<UpdateVariable>',
    '<Analysis>',
    'Time passed is negligible (just pushing open the door and surveying the inn, a few minutes). Dramatic updates disallowed.',
    '</Analysis>',
    '<JSONPatch>',
    '[]',
    '</JSONPatch>',
    '</UpdateVariable>',
    '<comment>呼喵~！本喵严格按照要求写好啦喵！</comment>',
    '<StatusPlaceHolderImpl/>',
].join('\n');
const aiWithUpdate = transformUserFloor(AI_UPDATE_BLOCK, { placement: 2, depth: 5 });
assert.ok(aiWithUpdate.startsWith(`${VEIL_MARK}\n\n<game>`), 'AI 楼仍以帷幕标记起头');
assert.ok(!aiWithUpdate.includes('UpdateVariable'), '变量申报块在 AI 楼显示层整块收走');
assert.ok(!aiWithUpdate.includes('Time passed is negligible'), '英文分析不再可见');
assert.ok(aiWithUpdate.includes('<comment>呼喵~！本喵严格按照要求写好啦喵！</comment>'), 'comment 不在本次收纳范围');
assert.ok(aiWithUpdate.includes('<StatusPlaceHolderImpl/>'), '状态栏占位符交给卡面渲染，不动');
assert.ok(!aiWithUpdate.includes('\n\n\n'), '收块后不残留连续空行');
assert.ok(!transformUserFloor(AI_UPDATE_BLOCK, { placement: 1, depth: 0 }).includes('Time passed is negligible'), '用户楼里的申报块同样收纳');
assert.ok(!transformUserFloor(AI_UPDATE_BLOCK, { placement: 2, depth: 40 }).includes('UpdateVariable'), '任意深度的旧楼也收纳');

// 没有 DB 包装的普通楼层：钉标记，内容不动；空楼没得钉（引擎对空串也不跑正则）。
assert.equal(transformUserFloor('你好，喝杯茶再走。'), `${VEIL_MARK}\n\n你好，喝杯茶再走。`);
assert.equal(transformUserFloor(''), '');

// 帷幕收口规则必须真的在 style.css 里：带标记又不在最近三块的整楼 display:none，位置动态算。
// 归一化行尾：Windows 检出（autocrlf）会把样式变 CRLF，样式文本断言按 LF 写，先统一。
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
assert.ok(
    css.includes('#chat > .mes:has(.dpz-floor-veil):not(:nth-last-child(-n+3))'),
    '收口规则应按位置动态隐藏（:has + :nth-last-child）',
);
assert.ok(css.includes('.custom-dpz-floor-veil'), '酒馆会给楼层内 class 加 custom- 前缀，两组选择器都要有');
assert.ok(css.includes('display: none;'), '收口就是把整楼 display:none');

// 卡片与收纳的替换串必须是无换行的单行（HTML 块里换行没事，但模板带空行会被 markdown 截断）；
// 空行守护的替换串本来就是单个换行；帷幕替换串自带标记与正文间的一处空行分隔，另断言。
for (const script of DISPLAY_REGEX_SCRIPTS.slice(1, 4)) {
    assert.ok(!script.replaceString.includes('\n'), `${script.scriptName} 的替换串不应含换行`);
}
assert.equal(DISPLAY_REGEX_SCRIPTS[0].replaceString, '\n', '空行守护就是把空行换成一个换行');
assert.equal(DISPLAY_REGEX_SCRIPTS[3].replaceString, '', '申报收纳就是把整块删掉');
assert.equal(DISPLAY_REGEX_SCRIPTS[4].replaceString, `${VEIL_MARK}\n\n$1`, '帷幕替换串 = 标记 + 空行分隔 + 原文');
for (const script of DISPLAY_REGEX_SCRIPTS) {
    assert.match(script.findRegex, /^\/[\s\S]+\/g$/, `${script.scriptName} 的 findRegex 应带 /…/g 包裹`);
    assert.equal(script.markdownOnly, true, '只改渲染');
    assert.equal(script.promptOnly, false, '提示词不受影响');
    assert.equal(script.runOnEdit, false, '编辑楼层时看到原文');
    assert.equal(script.disabled, false, '默认启用');
}
for (const script of DISPLAY_REGEX_SCRIPTS.slice(0, 3)) {
    assert.deepEqual(script.placement, [1], '前三条只作用于用户输入楼位');
}
assert.deepEqual(DISPLAY_REGEX_SCRIPTS[3].placement, [1, 2], '申报收纳用户楼与 AI 楼都收（仅显示层）');
assert.deepEqual(DISPLAY_REGEX_SCRIPTS[4].placement, [1, 2], '帷幕用户楼与 AI 楼都钉');
assert.equal(DISPLAY_REGEX_SCRIPTS[4].minDepth, 0, '帷幕每楼都钉，收不收由位置动态算，不看渲染时刻的深度');

// 卡片局部补装：缺哪条补哪条，按 守护→卡片→收纳→申报收纳→帷幕 的顺序追加；同名已存在（含手改）一律不碰。
// 夹具里的两条卡面脚本取自真实卡片（斗破卡面测试.png data.extensions.regex_scripts）的形状。
const COVER_A = { id: 'cover-a', scriptName: '【试运行·测试卡】[卡面]斗破封面', findRegex: '/[\\s\\S]+/g', replaceString: 'x', placement: [2], markdownOnly: true, promptOnly: false, runOnEdit: false, disabled: false };
const COVER_B = { id: 'cover-b', scriptName: '【试运行·测试卡】[卡面]封面不进提示词', findRegex: '/x/g', replaceString: '', placement: [2], markdownOnly: true, promptOnly: false, runOnEdit: false, disabled: false };
{
    const first = ensureScopedDisplayRegexScripts([COVER_A, COVER_B]);
    assert.equal(first.status, 'ready');
    assert.deepEqual(first.added, DISPLAY_REGEX_SCRIPTS.map(script => script.scriptName), '卡上没有我们的脚本时五条全补');
    assert.deepEqual(first.scripts.slice(0, 2), [COVER_A, COVER_B], '卡片自己的局部正则原样保序在前');
    assert.deepEqual(first.scripts.slice(2).map(script => script.scriptName), first.added, '我们的五条按定义顺序追加在后');
    assert.deepEqual(first.scripts[6].placement, [1, 2], '补装出来的楼位照定义拷贝');

    // 纯函数不改入参：writeExtensionField 是整表替换，原数组不能被顺手改掉
    const original = [COVER_A, COVER_B];
    ensureScopedDisplayRegexScripts(original);
    assert.equal(original.length, 2, '入参数组不被改动');

    const second = ensureScopedDisplayRegexScripts(first.scripts);
    assert.deepEqual(second.added, [], '重复补装不新增');
    assert.equal(second.scripts.length, first.scripts.length, '幂等后条数不变');

    const ours = first.scripts[2];
    ours.placement.push(9);
    assert.deepEqual(DISPLAY_REGEX_SCRIPTS[0].placement, [1], '定义不被补装侧的数组改动波及');

    const edited = ensureScopedDisplayRegexScripts([{ ...DISPLAY_REGEX_SCRIPTS[1], replaceString: '用户自己的改法' }]);
    assert.deepEqual(
        edited.added,
        ['斗破Agent · 输入段空行守护', '斗破Agent · 召回导语收纳', '斗破Agent · 变量申报收纳', '斗破Agent · 旧楼层隐去'],
        '只补缺的四条',
    );
    assert.equal(edited.scripts.find(script => script.scriptName === '斗破Agent · 本轮输入卡片').replaceString, '用户自己的改法', '用户手改的脚本不覆盖');
    assert.equal(edited.scripts.length, 5, '同名不覆盖，总数不变');

    const fromNothing = ensureScopedDisplayRegexScripts(undefined);
    assert.equal(fromNothing.status, 'ready', '卡还没带局部正则就从空表起步');
    assert.equal(fromNothing.scripts.length, 5, '起步补全五条');
}

// 全局回收：老版本装进全局列表的五条（id 带 doupo-agent- 前缀）被摘走，用户自己的全局正则原样保序。
{
    const ours = DISPLAY_REGEX_SCRIPTS.map(script => ({ ...script }));
    const users = [
        { id: 'host-custom-1', scriptName: '斗破纳戒 · 去除变量更新', findRegex: '/x/g', replaceString: '', placement: [1], markdownOnly: true, promptOnly: false, runOnEdit: false, disabled: false },
        { id: 'host-custom-2', scriptName: '别家的脚本', findRegex: '/y/g', replaceString: '', placement: [2], markdownOnly: true, promptOnly: false, runOnEdit: false, disabled: false },
    ];
    const noId = [{ scriptName: '没有 id 的脚本', findRegex: '/z/g', replaceString: '' }];
    const store = [...users, ...ours, ...noId];
    const stripped = stripGlobalDisplayRegexScripts(store);
    assert.equal(stripped.status, 'ready');
    assert.deepEqual(stripped.removed, ours.map(script => script.scriptName), '恰好回收本扩展的五条');
    assert.deepEqual(
        stripped.kept.map(script => script.scriptName),
        [...users.map(script => script.scriptName), '没有 id 的脚本'],
        '用户的与无名脚本原样保序',
    );
    assert.equal(store.length, 8, '入参数组不被改动（写回由调用方负责）');
    const clean = stripGlobalDisplayRegexScripts(users);
    assert.deepEqual(clean.removed, [], '没有本扩展脚本时空转');
    assert.deepEqual(clean.kept, users, '空转时原数组直接返回');
    assert.deepEqual(stripGlobalDisplayRegexScripts(undefined), { status: 'unavailable', kept: [], removed: [] });
    assert.deepEqual(stripGlobalDisplayRegexScripts('nope'), { status: 'unavailable', kept: [], removed: [] });
}

// 斗破卡识别：卡内嵌酒馆助手脚本名或世界书名任一命中即认；别的卡绝不写入。
{
    const doupoByScript = { data: { extensions: { tavern_helper: { scripts: [{ name: '斗破卡面 · 身份创建' }, { name: '斗破纳戒 · 变量结构' }] } } } };
    const doupoByBook = { data: { character_book: { name: '斗破世界书' } } };
    const otherCard = { data: { extensions: { tavern_helper: { scripts: [{ name: '别家脚本' }] } }, character_book: { name: '别家世界书' } } };
    assert.equal(isDoupoCard(doupoByScript), true, '按内嵌脚本名认卡');
    assert.equal(isDoupoCard(doupoByBook), true, '按世界书名认卡');
    assert.equal(isDoupoCard(otherCard), false, '别的卡不认');
    assert.equal(isDoupoCard(null), false);
    assert.equal(isDoupoCard(undefined), false);
    assert.equal(isDoupoCard('nope'), false);
}

console.log('display regex tests passed');
