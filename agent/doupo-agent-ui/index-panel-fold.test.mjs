import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// 归一化行尾：Windows 检出（autocrlf）会把源码变 CRLF，源码文本断言按 LF 写，先统一。
const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const extract = (start, end) => {
    const from = source.indexOf(start);
    assert.ok(from >= 0, `extract ${start}`);
    const to = end === undefined ? source.length : source.indexOf(end, from);
    assert.ok(to > from, `extract ${start} .. ${end}`);
    return source.slice(from, to);
};

// 取出四份折叠规格（真实对象，不是源码文本），后续断言都对着真值跑。
// vm 里只序列化成字符串、本地再 parse：vm Realm 的对象/数组原型与本地不同，deepEqual 会误报。
const foldCode = extract('const ADVANCED_FOLD_SPECS', 'function applyAdvancedFolds');
const foldGlobals = JSON.parse(runInNewContext(`${foldCode}; JSON.stringify({ SPECS: ADVANCED_FOLD_SPECS, PROMOTE: ADVANCED_PROMOTE_TOGGLES, CARD_ROWS: ADVANCED_CARD_FOLD_ROWS, INPUTS: ADVANCED_FOLD_INPUTS })`, {}));

test('OPT-062 面板折叠：每页只留启用开关，子开关与调参行进折叠区', () => {
    const { SPECS, PROMOTE, CARD_ROWS, INPUTS } = foldGlobals;

    // 折叠规格逐页钉死（四调口径：一页一启用，低频项收折）。JSON 字符串对比避开 Realm/原型差异。
    const expectedSpecs = JSON.stringify({
        overview: ['模型调用体检', '卡面脚本'],
        hub: ['功能读取楼层数'],
        facts: ['检索库状态', '检索库 · 条目浏览', '注入通道', '正文核验（事实审计）'],
        action: ['行动结算注入', '类别规则与自定义判定'],
        world: ['模型决定（LLM 决定脚本执行）', '接一个任务', '登记势力', '登记人物', '登记事件'],
        npc: ['NPC 自由对话', '主动联系（他来找你）'],
        npcledger: ['一致性体检', '手动记账', '冷藏推进台'],
        self: ['模型决定（LLM 决定脚本执行）', '身份档案', '登记功法', '登记斗技', '登记装备', '记录天材地宝', '放入物品', '记配方', '开工炼制', '立目标'],
        memory: ['模型决定（LLM 决定脚本执行）', '召回决定（LLM 挑选注入哪些记忆）', '记忆注入', '记忆体检', '按人整合', '手动登记'],
        impact: ['记录与注入', '记一条世界影响'],
    });
    assert.equal(JSON.stringify(SPECS), expectedSpecs);

    // 卡面标题型开关（dai-feature-toggle）绝不能进 INPUTS：那是卡片标题开关，整行搬走会把标签拆坏。
    const ftogglePaths = [];
    const ftoggleRe = /<div class="dai-feature-toggle">/g;
    let m;
    while ((m = ftoggleRe.exec(source))) {
        const chunk = source.slice(m.index, m.index + 1500);
        const block = chunk.slice(0, chunk.indexOf('</div>'));
        const path = block.match(/data-setting="([^"]+)"/)?.[1];
        if (path) ftogglePaths.push(path);
    }
    assert.ok(ftogglePaths.includes('settle.resultEnabled') && ftogglePaths.includes('plot.decideEnabled'),
        'FTOGGLE 采样必须抓到已知的卡面开关（settle.resultEnabled / plot.decideEnabled）');
    const leaked = ftogglePaths.filter(path => INPUTS.includes(path));
    assert.deepEqual(leaked, [], '卡面标题开关不得进行级折叠清单');

    // 行级折叠清单：每条路径都必须真实存在于模板（防拼写漂移）。
    for (const path of INPUTS) {
        assert.ok(source.includes(`data-setting="${path}"`), `INPUTS 路径 ${path} 在模板里不存在`);
    }
    // 提升的启用开关不进行级折叠（提升＝可见，不是折叠）。
    for (const spec of PROMOTE) {
        assert.ok(!INPUTS.includes(spec.path), `${spec.path} 是提升项，不应同时在折叠清单里`);
    }

    // 提升/卡内折叠的锚点与选择器都要真实存在。
    assert.deepEqual(PROMOTE.map(spec => spec.path), ['npc.chatEnabled', 'npc.reachoutEnabled']);
    for (const spec of PROMOTE) {
        assert.ok(source.includes(`data-setting="${spec.anchor}"`), `提升锚点 ${spec.anchor} 不存在`);
    }
    for (const selector of CARD_ROWS) {
        const needle = selector.replace(/^\[|\]$/g, '');
        assert.ok(source.includes(needle), `卡内折叠选择器 ${selector} 在模板里不存在`);
    }
    assert.ok(CARD_ROWS.some(selector => selector.includes('memory.embedding.baseUrl')), '语义检索配置行必须在卡内折叠清单里');

    // 语义检索整卡不再整卡收折（四调口径：启用语义检索在模型设置页可见）。
    assert.ok(!SPECS.hub.includes('语义检索'), 'hub 折叠规格不应再收「语义检索」整卡');

    // applyAdvancedFolds 的执行顺序是功能约束：提升 → 整卡 → 卡内行 → 页级行。
    // 终点取末尾的赋值语句（开头守卫行也含同名字符串，不能当终点）。
    const fn = extract('function applyAdvancedFolds', "panel.dataset.advancedFoldsApplied = 'true';");
    const promoteAt = fn.indexOf('ADVANCED_PROMOTE_TOGGLES');
    const specAt = fn.indexOf('ADVANCED_FOLD_SPECS))');
    const cardAt = fn.indexOf('ADVANCED_CARD_FOLD_ROWS');
    const inputsAt = fn.indexOf('ADVANCED_FOLD_INPUTS)');
    for (const [name, at] of [['提升', promoteAt], ['整卡', specAt], ['卡内行', cardAt], ['页级行', inputsAt]]) {
        assert.ok(at >= 0, `applyAdvancedFolds 缺少${name}阶段`);
    }
    assert.ok(promoteAt < specAt, '提升必须在整卡收折之前（否则开关跟着卡一起进折叠区）');
    assert.ok(specAt < cardAt && cardAt < inputsAt, '卡内行折叠在整卡之后、页级行之前');

    // 三个折叠条创建点共用同一份摘要文案（样式与语义一致）。
    const summaries = fn.split('<summary>高级设置 · 低频项').length - 1;
    assert.equal(summaries, 3, '折叠条摘要文案应恰好出现在三处（整卡/卡内行/页级行）');
});
