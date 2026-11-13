import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanFloorText, cleanFloorEntries, regexHiddenFloorBound, stripThinkingBlocks } from './floor-text.js';

// 工作区没有酒馆本体的正则引擎（../../../../../regex/engine.js 不存在），
// 懒加载失败必须安静退回原文——部署到酒馆后才走 getRegexedString。
test('正则引擎不可用时退回原文，绝不抛异常', async () => {
    assert.equal(await cleanFloorText({ mes: '原始正文', is_user: false }, 0), '原始正文');
    assert.equal(await cleanFloorText({ mes: '玩家说的话', is_user: true }, 1), '玩家说的话');
    assert.equal(await cleanFloorText({ mes: '' }), '');
    assert.equal(await cleanFloorText(null), '');
    assert.equal(await cleanFloorText({ mes: '正文', is_user: false }), '正文', '不传 depth 也照常退回');
});

test('批量清洗保序且只留 role/text', async () => {
    const out = await cleanFloorEntries([
        { role: '玩家', text: '甲', isUser: true, depth: 1 },
        { role: '角色', text: '乙', isUser: false, depth: 0 },
    ]);
    assert.deepEqual(out, [{ role: '玩家', text: '甲' }, { role: '角色', text: '乙' }]);
    assert.deepEqual(await cleanFloorEntries([]), []);
    assert.deepEqual(await cleanFloorEntries(null), []);
});

test('stripThinkingBlocks 剥闭合与未闭合的思维链幻括号', () => {
    assert.equal(stripThinkingBlocks('<thinking>\n引用输入原文\n</thinking>\n正文第一句'), '\n正文第一句');
    assert.equal(stripThinkingBlocks('<THINKING>大写标签</THINKING>正文'), '正文', '大小写不敏感');
    assert.equal(stripThinkingBlocks('<thinking>没闭合就一直剥到文末'), '');
    assert.equal(stripThinkingBlocks('普通正文原样保留'), '普通正文原样保留');
    assert.equal(stripThinkingBlocks(''), '');
    assert.equal(stripThinkingBlocks(null), '', '非字符串安全返回空串');
    assert.equal(stripThinkingBlocks(undefined), '');
    assert.equal(stripThinkingBlocks('<thinking>甲</thinking>中间<thinking>乙</thinking>尾'), '中间尾', '多个块都剥');
});

// 头部截断的喂料预算不再被 thinking 占用：决定链要能看到失败正文（BUG 1 的根因）。
test('批量清洗先剥 thinking 再进喂料预算', async () => {
    const floors = await cleanFloorEntries([
        { role: '角色', text: '<thinking>\n- 输入原文: 掏一枚金币把凝血草买下来\n</thinking>\n<content>掌柜摇头把金币推回：一枚金币远远不够。</content>', isUser: false, depth: 0 },
    ]);
    assert.equal(floors.length, 1);
    assert.ok(floors[0].text.includes('掌柜摇头把金币推回'), '失败正文进入喂料');
    assert.ok(!floors[0].text.includes('掏一枚金币把凝血草买下来'), 'thinking 里引用的输入原文被剥掉');
    assert.ok(!floors[0].text.includes('<thinking>'), '标签本身不残留');
});

// 默认楼数跟随正则：只认"启用的、提示词侧、整楼替换成空、带 minDepth"的脚本，取最早的深度。
test('regexHiddenFloorBound 只统计启用且整楼隐藏的提示词正则，取最小 minDepth', () => {
    const hide = { scriptName: '远楼层隐藏', disabled: false, placement: [1, 2], minDepth: 5, promptOnly: true, replaceString: '' };
    assert.equal(regexHiddenFloorBound([hide]), 5);
    // 停用的不算
    assert.equal(regexHiddenFloorBound([{ ...hide, disabled: true }]), null);
    // 只管显示的（markdownOnly 且非 promptOnly）不算
    assert.equal(regexHiddenFloorBound([{ ...hide, markdownOnly: true, promptOnly: false }]), null);
    // 替换不为空（改写而非隐藏）不算
    assert.equal(regexHiddenFloorBound([{ ...hide, replaceString: '（略）' }]), null);
    // 不落用户/AI 楼层的不算
    assert.equal(regexHiddenFloorBound([{ ...hide, placement: [0] }]), null);
    // 没填 minDepth 的不算
    assert.equal(regexHiddenFloorBound([{ ...hide, minDepth: null }]), null);
    // 多条取最早深度；数组形态与 {scripts:[…]} 形态都认
    const hide2 = { ...hide, minDepth: 10 };
    assert.equal(regexHiddenFloorBound([hide2, hide]), 5);
    assert.equal(regexHiddenFloorBound({ scripts: [hide] }), 5);
    assert.equal(regexHiddenFloorBound([]), null);
    assert.equal(regexHiddenFloorBound(null), null);
});
