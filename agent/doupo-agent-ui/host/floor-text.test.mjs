import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanFloorText, cleanFloorEntries, regexHiddenFloorBound, stripThinkingBlocks, setCharacterRegexScriptsSource } from './floor-text.js';
import { VEIL_VISIBLE_FLOORS, VEIL_SCRIPT_ID, VEIL_SCRIPT_NAME, DISPLAY_REGEX_SCRIPTS } from './display-regex.js';

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

// 默认楼数跟随正则：提示词侧清空、显示侧清空、自家帷幕三种"整楼隐藏"形态都认，取最早深度。
test('regexHiddenFloorBound 统计启用且整楼隐藏的正则，取最小有效深度', () => {
    const hide = { scriptName: '远楼层隐藏', disabled: false, placement: [1, 2], minDepth: 5, promptOnly: true, replaceString: '' };
    assert.equal(regexHiddenFloorBound([hide]), 5);
    // 停用的不算
    assert.equal(regexHiddenFloorBound([{ ...hide, disabled: true }]), null);
    // 显示侧清空（markdownOnly 且替换为空）也算隐藏——屏幕看不见的楼功能调用同样不喂
    assert.equal(regexHiddenFloorBound([{ ...hide, markdownOnly: true, promptOnly: false }]), 5);
    // 显示侧美化（替换非空）不是隐藏，不算
    assert.equal(regexHiddenFloorBound([{ ...hide, markdownOnly: true, promptOnly: false, replaceString: '（略）' }]), null);
    // 提示词侧改写（替换非空）不算
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

// 自家「旧楼层隐去」帷幕：每楼钉标记不删内容，屏幕上 CSS 收走最近窗口外的整楼——
// 有效可见窗口＝保留楼数（VEIL_VISIBLE_FLOORS，与 style.css 的 -n+3 同源）。
test('帷幕脚本按屏幕保留楼数推断可见窗口，停用即失效', () => {
    const veil = { id: VEIL_SCRIPT_ID, scriptName: VEIL_SCRIPT_NAME, disabled: false, placement: [1, 2], minDepth: 0, markdownOnly: true, promptOnly: false, replaceString: '<div class="dpz-floor-veil"></div>\n\n$1' };
    assert.equal(VEIL_VISIBLE_FLOORS, 4, '与 style.css 的 -n+4 保持一致');
    assert.equal(regexHiddenFloorBound([veil]), 4);
    // 帷幕停用＝想看全史，不再跟随
    assert.equal(regexHiddenFloorBound([{ ...veil, disabled: true }]), null);
    // 手改过起跑深度：起跑之前的楼永远可见，窗口取 max(保留楼数, 起跑深度)
    assert.equal(regexHiddenFloorBound([{ ...veil, minDepth: 6 }]), 6);
    // 帷幕与提示词侧清空并存：取更小的窗口
    const promptHide = { scriptName: '远楼层隐藏', disabled: false, placement: [1, 2], minDepth: 10, promptOnly: true, replaceString: '' };
    assert.equal(regexHiddenFloorBound([promptHide, veil]), 4);
    // 替换为空的怪异帷幕（不该出现）退回普通清空逻辑，minDepth 0 不产生窗口
    assert.equal(regexHiddenFloorBound([{ ...veil, replaceString: '' }]), null);
    // 全套自装脚本（帷幕 + 远楼层不进提示词）落在卡上时，推断窗口就是帷幕保留楼数
    assert.equal(regexHiddenFloorBound(DISPLAY_REGEX_SCRIPTS), 4);
});

// 显示侧清空类正则补进功能喂料：变量申报、召回导语这类"屏幕上被收走的家什"不再漏给功能模型。
test('喂料清洗套用显示侧清空脚本，美化类绝不进喂料', async () => {
    const cardScripts = [
        { scriptName: '斗破Agent · 变量申报收纳', disabled: false, placement: [1, 2], minDepth: null, markdownOnly: true, promptOnly: false, findRegex: '/<UpdateVariable>[\\s\\S]*?<\\/UpdateVariable>/g', replaceString: '' },
        { scriptName: '斗破Agent · 本轮输入卡片', disabled: false, placement: [1], minDepth: null, markdownOnly: true, promptOnly: false, findRegex: '/以下是用户的本轮输入：/g', replaceString: '<div class="dpz-round">$1</div>' },
        { scriptName: '旧楼层清空（显示侧）', disabled: false, placement: [1, 2], minDepth: 4, markdownOnly: true, promptOnly: false, findRegex: '/<hidden>[\\s\\S]*?<\\/hidden>/g', replaceString: '' },
    ];
    setCharacterRegexScriptsSource(() => cardScripts);
    try {
        // AI 楼的变量申报块被显示侧清空脚本剥掉（提示词侧引擎只覆盖用户楼）
        const ai = await cleanFloorText({ mes: '正文。<UpdateVariable>{"x":1}</UpdateVariable>结尾。', is_user: false }, 2);
        assert.equal(ai, '正文。结尾。');
        // 美化类（替换成 HTML）绝不进喂料
        const user = await cleanFloorText({ mes: '以下是用户的本轮输入：出招', is_user: true }, 2);
        assert.equal(user, '以下是用户的本轮输入：出招');
        // 深度门槛：minDepth 4 的清空脚本对 depth 2 不生效，对 depth 5 生效
        const near = await cleanFloorText({ mes: '甲<hidden>密</hidden>乙', is_user: false }, 2);
        assert.equal(near, '甲<hidden>密</hidden>乙');
        const far = await cleanFloorText({ mes: '甲<hidden>密</hidden>乙', is_user: false }, 5);
        assert.equal(far, '甲乙');
        // maxDepth/minDepth 为 null＝不设界：Number(null)=0 不能当成 0 楼界限（引擎同款判空）
        const noBounds = { scriptName: '全程清空', disabled: false, placement: [1, 2], minDepth: null, maxDepth: null, markdownOnly: true, promptOnly: false, findRegex: '/<UpdateVariable>[\\s\\S]*?<\\/UpdateVariable>/g', replaceString: '' };
        setCharacterRegexScriptsSource(() => [noBounds]);
        assert.equal(await cleanFloorText({ mes: '甲<UpdateVariable>x</UpdateVariable>乙', is_user: false }, 1), '甲乙', 'maxDepth null 不该把 depth 1 挡掉');
        assert.equal(await cleanFloorText({ mes: '甲<UpdateVariable>x</UpdateVariable>乙', is_user: false }, 0), '甲乙', 'depth 0 照常生效');
        // 楼位不命中的不生效（用户楼脚本不套 AI 楼）
        const userOnly = { scriptName: '仅用户楼清空', disabled: false, placement: [1], minDepth: null, markdownOnly: true, promptOnly: false, findRegex: '/甲/g', replaceString: '' };
        setCharacterRegexScriptsSource(() => [userOnly]);
        assert.equal(await cleanFloorText({ mes: '甲乙', is_user: false }, 1), '甲乙');
        assert.equal(await cleanFloorText({ mes: '甲乙', is_user: true }, 1), '乙');
    } finally {
        setCharacterRegexScriptsSource(null);
    }
});
