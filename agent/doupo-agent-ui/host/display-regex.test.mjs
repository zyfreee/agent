import assert from 'node:assert/strict';
import { DISPLAY_REGEX_SCRIPTS, ensureDisplayRegexScripts, transformUserFloor } from './display-regex.js';

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

const rendered = transformUserFloor(REAL_FLOOR);
assert.ok(rendered.startsWith('<div class="dpz-round">'), '楼层应以输入卡片开头');
assert.ok(rendered.includes('>趁天还没黑，先去镇口探探去黑土坊的路况，把明天的货单理清楚。</p></div>'), '正文应原样进卡片');
for (const noise of ['以下是用户的本轮输入', '本轮用户输入', '既定事实记忆', '时间约束词', 'now=刚刚']) {
    assert.ok(!rendered.includes(noise), `渲染层不应再出现提示词家什：${noise}`);
}
assert.equal(rendered.trim(), rendered, '卡片外不应残留空白');

// 输入段内的空行要被压成单换行：markdown 的 HTML 块遇到空行会截断，卡片会散架。
const paragraphed = transformUserFloor(
    '以下是用户的本轮输入：\n<本轮用户输入>\n第一段，去黑土坊。\n\n第二段，顺便探路。\n</本轮用户输入>',
);
assert.ok(paragraphed.includes('第一段，去黑土坊。\n第二段，顺便探路。'), '空行应压成单换行');
assert.ok(!paragraphed.includes('\n\n'), '整楼渲染结果不应再有空行');

// 单个换行（无空行）要原样保留；楼层末尾的召回导语与约束词表整段收走。
const multiline = transformUserFloor(
    '以下是用户的本轮输入：\n<本轮用户输入>\n第一行\n第二行\n</本轮用户输入>\n\n以下输入的代码为既定事实记忆的对应索引编码，并已按时间距离分组。\n\n[时间约束词]\nnow=刚刚|刚才',
);
assert.ok(multiline.includes('第一行\n第二行'), '普通换行不动');
assert.ok(!multiline.includes('时间约束词'), '导语之后的家什全收走');

// 没有 DB 包装的普通楼层一个字都不动。
assert.equal(transformUserFloor('你好，喝杯茶再走。'), '你好，喝杯茶再走。');
assert.equal(transformUserFloor(''), '');

// 卡片与收纳的替换串必须是无换行的单行（HTML 块里换行没事，但模板带空行会被 markdown 截断）；
// 空行守护的替换串本来就是单个换行，另断言。
for (const script of DISPLAY_REGEX_SCRIPTS.slice(1)) {
    assert.ok(!script.replaceString.includes('\n'), `${script.scriptName} 的替换串不应含换行`);
}
assert.equal(DISPLAY_REGEX_SCRIPTS[0].replaceString, '\n', '空行守护就是把空行换成一个换行');
for (const script of DISPLAY_REGEX_SCRIPTS) {
    assert.match(script.findRegex, /^\/[\s\S]+\/g$/, `${script.scriptName} 的 findRegex 应带 /…/g 包裹`);
    assert.deepEqual(script.placement, [1], '只作用于用户输入楼位');
    assert.equal(script.markdownOnly, true, '只改渲染');
    assert.equal(script.promptOnly, false, '提示词不受影响');
    assert.equal(script.runOnEdit, false, '编辑楼层时看到原文');
}

// 注册：缺哪条补哪条，按 守护→卡片→收纳 的顺序追加；同名已存在（含手改）一律不碰。
const fresh = [];
const first = ensureDisplayRegexScripts(fresh);
assert.equal(first.status, 'ready');
assert.deepEqual(first.added, DISPLAY_REGEX_SCRIPTS.map(script => script.scriptName));
assert.deepEqual(fresh.map(script => script.scriptName), first.added);

const second = ensureDisplayRegexScripts(fresh);
assert.deepEqual(second.added, [], '重复注册不新增');

const edited = [{ ...DISPLAY_REGEX_SCRIPTS[1], replaceString: '用户自己的改法' }];
const result = ensureDisplayRegexScripts(edited);
assert.deepEqual(result.added, ['斗破Agent · 输入段空行守护', '斗破Agent · 召回导语收纳']);
assert.equal(edited.find(script => script.scriptName === '斗破Agent · 本轮输入卡片').replaceString, '用户自己的改法', '用户手改的脚本不覆盖');
assert.equal(edited.length, 3, '只补缺的两条');

assert.deepEqual(ensureDisplayRegexScripts(undefined), { status: 'unavailable', added: [] });
assert.deepEqual(ensureDisplayRegexScripts('nope'), { status: 'unavailable', added: [] });

console.log('display regex tests passed');
