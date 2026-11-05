import assert from 'node:assert/strict';
import { createSelfRuntime } from '../self/self-runtime.js';
import { createSelfMvuBridge } from './self-mvu.js';
import { applyDeclaredPatch, arbitrateFrame, createMvuArbiter, extractUpdateBlock, frameMatchesProjection } from './mvu-arbiter.js';

const STAMP = '2026-11-03T00:00:00.000Z';

function ledgerFixture() {
    return {
        schemaVersion: 1,
        day: 20,
        gold: 500,
        profile: { name: '墨白', gender: '男', age: '十七', race: '人族', origin: '旧书铺独子', affiliation: '暂无', attribute: '雷', talent: '过目不忘', appearance: '瘦高个' },
        realm: { realm: '斗者', stage: '三星' },
        titles: ['乌坦城书痴'],
        techniques: [{ id: 't1', name: '焚决', grade: '黄阶低级', type: '修炼功法', progress: '第三层' }],
        skills: [{ id: 's1', name: '八极崩', grade: '黄阶高级', type: '攻击' }],
        equipment: [{ id: 'e1', name: '玄重尺', grade: '凡品', type: '武器' }],
        items: [
            { id: 'b1', name: '回气丹', category: '丹药', count: 3, equipped: false },
            { id: 'b2', name: '贴身玉佩', category: '饰品', count: 1, equipped: true },
        ],
        recipes: [{ id: 'r1', name: '回气散', craft: '炼药', grade: '一品' }],
        crafts: [{ id: 'c1', name: '凝血散', craft: '炼药', count: 1, status: 'open', startDay: 18, endDay: 21 }],
        goals: [
            { id: 'g1', title: '三年之约雪前耻', text: '三年之约，云岚宗一雪前耻', priority: '主线', due: '三年后', done: false },
        ],
        log: [],
        updatedAt: STAMP,
    };
}

function runtimeWith(fixture) {
    const runtime = createSelfRuntime({ now: () => STAMP });
    runtime.restore(structuredClone(fixture));
    return runtime;
}

// —— extractUpdateBlock ——

{
    const message = [
        '萧炎盘膝而坐，斗气在体内缓缓流转。',
        '<UpdateVariable>',
        '<Analysis>',
        '斗破纳戒.境界: Y',
        '</Analysis>',
        "_.set('斗破纳戒.境界', '斗者', '斗师');//突破成功",
        "_.set('斗破纳戒.金币', 500, 320);//买了聚气散",
        "_.set('别人的变量.好感度', 10, 20);//与本卡无关",
        '</UpdateVariable>',
    ].join('\n');
    const found = extractUpdateBlock(message);
    assert.ok(found, '有块可抽');
    assert.equal(found.sets.length, 2, '只解析纳戒命名空间的 _.set');
    assert.equal(found.sets[0].path, '境界');
    assert.equal(found.sets[0].reason, '突破成功');
    assert.equal(found.sets[1].path, '金币');
    assert.equal(extractUpdateBlock('没有块的正文'), null);
    assert.equal(extractUpdateBlock(''), null);
}

// —— JSON Patch（新版申报格式）——

{
    const message = [
        '林澈把铜板收进钱袋。',
        '<UpdateVariable>',
        '<Analysis>$(IN ENGLISH, no more than 80 words)',
        '- time passed: one afternoon',
        '- dramatic updates allowed: no',
        '- bag gained one item; gold is copper coins, not written',
        '</Analysis>',
        '<JSONPatch>',
        '[',
        '  { "op": "replace", "path": "/斗破纳戒/行囊", "value": "益气散×2、止血草×1" },',
        '  { "op": "delta", "path": "/斗破纳戒/金币", "value": 0 },',
        '  { "op": "replace", "path": "/别的命名空间/好感度", "value": 99 },',
        '  { "op": "remove", "path": "/斗破纳戒/炼制" }',
        ']',
        '</JSONPatch>',
        '</UpdateVariable>',
    ].join('\n');
    const found = extractUpdateBlock(message);
    assert.ok(found, 'JSON Patch 楼层有块可抽');
    assert.equal(found.patchError, '', 'Patch 可解析');
    assert.equal(found.patch.length, 3, '跨命名空间操作被忽略');
    assert.deepEqual(found.patch[0], { op: 'replace', path: '/斗破纳戒/行囊', field: '行囊', sub: '', value: '益气散×2、止血草×1' });
    assert.deepEqual(found.patch[1], { op: 'delta', path: '/斗破纳戒/金币', field: '金币', sub: '', value: 0 });
    assert.deepEqual(found.patch[2], { op: 'remove', path: '/斗破纳戒/炼制', field: '炼制', sub: '' });

    // JSON Pointer 转义 + 深路径 + move + 非数组/畸形
    const weird = '<UpdateVariable><JSONPatch>[{"op":"insert","path":"/斗破纳戒/行囊/-","value":"聚气散×3"},{"op":"move","from":"/斗破纳戒/称号","to":"/斗破纳戒/丹方"}]</JSONPatch></UpdateVariable>';
    const weirdFound = extractUpdateBlock(weird);
    assert.equal(weirdFound.patch.length, 2);
    assert.equal(weirdFound.patch[0].field, '行囊');
    assert.equal(weirdFound.patch[0].sub, '-');
    assert.equal(weirdFound.patch[1].op, 'move');
    assert.equal(weirdFound.patch[1].from, '/斗破纳戒/称号');
    const escaped = extractUpdateBlock('<UpdateVariable><JSONPatch>[{"op":"replace","path":"/斗破纳戒/~1深处/~0字段","value":1}]</JSONPatch></UpdateVariable>');
    assert.equal(escaped.patch[0].field, '/深处');
    assert.equal(escaped.patch[0].sub, '~字段');
    const notArray = extractUpdateBlock('<UpdateVariable><JSONPatch>{"op":"replace"}</JSONPatch></UpdateVariable>');
    assert.equal(notArray.patchError, 'JSONPatch 不是数组');
    const malformed = extractUpdateBlock('<UpdateVariable><Analysis>分析在但 Patch 畸形</Analysis><JSONPatch>[{op:broken}]</JSONPatch></UpdateVariable>');
    assert.ok(malformed.patchError.length > 0, '畸形 Patch 记录错误');
    assert.equal(malformed.patch.length, 0);

    // 旧 _.set 与新 JSON Patch 同楼共存：两边都解析
    const mixed = [
        '<UpdateVariable>',
        "_.set('斗破纳戒.金币', 113, 53);//旧格式",
        '<JSONPatch>[{"op":"replace","path":"/斗破纳戒/行囊","value":"益气散×2、回气丹×1"}]</JSONPatch>',
        '</UpdateVariable>',
    ].join('\n');
    const mixedFound = extractUpdateBlock(mixed);
    assert.equal(mixedFound.sets.length, 1);
    assert.equal(mixedFound.patch.length, 1);
    assert.equal(mixedFound.patch[0].field, '行囊');
}

// —— arbitrateFrame：逐字段裁决 ——

{
    // 一致：帧与账本投影相同 → clean
    const ledger = ledgerFixture();
    const { buildSelfMvuPayload } = await import('./self-mvu.js');
    const verdict = arbitrateFrame({ namespace: buildSelfMvuPayload(ledger), ledger });
    assert.equal(verdict.status, 'clean');
    assert.equal(verdict.ops.length, 0);
    assert.equal(verdict.reverts.length, 0);
}

{
    // 帧上更新时间对不上 → stale（同步断档/模型乱写时间都不仲裁，外壳重同步）
    const ledger = ledgerFixture();
    const verdict = arbitrateFrame({ namespace: { 金币: 1, 更新时间: '2020-01-01T00:00:00.000Z' }, ledger });
    assert.equal(verdict.status, 'stale');
}

{
    // 档案字段：合法采纳成 setProfile；超上限整字段回滚
    const ledger = ledgerFixture();
    const verdict = arbitrateFrame({
        namespace: { 更新时间: STAMP, 外貌: '瘦高个，眉目清俊，常穿青衫' },
        ledger,
    });
    assert.equal(verdict.status, 'ops');
    assert.deepEqual(verdict.ops, [{ op: 'setProfile', field: 'appearance', text: '瘦高个，眉目清俊，常穿青衫' }]);
    const bad = arbitrateFrame({ namespace: { 更新时间: STAMP, 斗气属性: '雷与火双修的罕见变异属性体系' }, ledger });
    assert.equal(bad.ops.length, 0);
    assert.equal(bad.reverts.length, 1);
    assert.equal(bad.reverts[0].field, '斗气属性');
}

{
    // 境界：沿晋升链前进一步采纳；跳两级回滚；回退采纳；坏境界名回滚
    const ledger = ledgerFixture();
    const up = arbitrateFrame({ namespace: { 更新时间: STAMP, 境界: '斗师', 段位: '一星' }, ledger });
    assert.deepEqual(up.ops, [{ op: 'setRealm', realm: '斗师', stage: '一星' }]);
    const jump = arbitrateFrame({ namespace: { 更新时间: STAMP, 境界: '斗王' }, ledger });
    assert.equal(jump.ops.length, 0);
    assert.equal(jump.reverts.length, 1);
    const down = arbitrateFrame({ namespace: { 更新时间: STAMP, 境界: '斗之气', 段位: '七段' }, ledger });
    assert.deepEqual(down.ops, [{ op: 'setRealm', realm: '斗之气', stage: '七段' }]);
    const fake = arbitrateFrame({ namespace: { 更新时间: STAMP, 境界: '剑仙' }, ledger });
    assert.equal(fake.ops.length, 0);
    assert.equal(fake.reverts.length, 1);
    // 只改段位：境界沿用账本值
    const stageOnly = arbitrateFrame({ namespace: { 更新时间: STAMP, 段位: '五星' }, ledger });
    assert.deepEqual(stageOnly.ops, [{ op: 'setRealm', realm: '斗者', stage: '五星' }]);
    const badStage = arbitrateFrame({ namespace: { 更新时间: STAMP, 段位: '十二星' }, ledger });
    assert.equal(badStage.ops.length, 0);
    assert.equal(badStage.reverts.length, 1);
}

{
    // 金币：合法数字采纳成 setGold；非整数/负数回滚
    const ledger = ledgerFixture();
    const ok = arbitrateFrame({ namespace: { 更新时间: STAMP, 金币: 320 }, ledger });
    assert.deepEqual(ok.ops, [{ op: 'setGold', amount: 320 }]);
    const bad = arbitrateFrame({ namespace: { 更新时间: STAMP, 金币: -50 }, ledger });
    assert.equal(bad.reverts.length, 1);
    const bad2 = arbitrateFrame({ namespace: { 更新时间: STAMP, 金币: 12.5 }, ledger });
    assert.equal(bad2.reverts.length, 1);
}

{
    // 称号：整清单语义——新增/消失翻译成 add/remove
    const ledger = ledgerFixture();
    const verdict = arbitrateFrame({ namespace: { 更新时间: STAMP, 称号: '乌坦城书痴、坊市新贵' }, ledger });
    assert.deepEqual(verdict.ops, [
        { op: 'addTitle', text: '坊市新贵' },
    ]);
    const removed = arbitrateFrame({ namespace: { 更新时间: STAMP, 称号: '' }, ledger });
    assert.deepEqual(removed.ops, [{ op: 'removeTitle', text: '乌坦城书痴' }]);
    const overlong = arbitrateFrame({ namespace: { 更新时间: STAMP, 称号: '一个长到不像话的称号远远超过十六个字的限制' }, ledger });
    assert.equal(overlong.reverts.length, 1);
}

{
    // 功法：新增/进阶/消失按名对账
    const ledger = ledgerFixture();
    const verdict = arbitrateFrame({
        namespace: { 更新时间: STAMP, 功法: '焚决·黄阶低级·第五层、狂狮怒罡·玄阶中级' },
        ledger,
    });
    assert.equal(verdict.ops.length, 2);
    assert.deepEqual(verdict.ops[0], { op: 'updateTechnique', id: 't1', progress: '第五层' });
    assert.deepEqual(verdict.ops[1], { op: 'addTechnique', name: '狂狮怒罡', grade: '玄阶中级', type: '', progress: '', source: 'MVU通道' });
    const gone = arbitrateFrame({ namespace: { 更新时间: STAMP, 功法: '' }, ledger });
    assert.deepEqual(gone.ops, [{ op: 'removeTechnique', id: 't1' }]);
    // 坏条目（没名字）→ 整字段回滚
    const bad = arbitrateFrame({ namespace: { 更新时间: STAMP, 功法: '焚决·黄阶低级·第三层、·没有名字' }, ledger });
    assert.equal(bad.ops.length, 0);
    assert.equal(bad.reverts.length, 1);
}

{
    // 天材地宝：新增/更新/消失按名对账，与功法装备同构
    const ledger = ledgerFixture();
    const verdict = arbitrateFrame({
        namespace: { 更新时间: STAMP, 天材地宝: '青莲地心火·异火榜第十九·异火' },
        ledger,
    });
    assert.deepEqual(verdict.ops, [{ op: 'addTreasure', name: '青莲地心火', grade: '异火榜第十九', type: '异火', progress: '', source: 'MVU通道' }]);
    const updated = arbitrateFrame({
        namespace: { 更新时间: STAMP, 天材地宝: '青莲地心火·异火榜第十五·异火' },
        ledger,
    });
    assert.deepEqual(updated.ops, [{ op: 'addTreasure', name: '青莲地心火', grade: '异火榜第十五', type: '异火', progress: '', source: 'MVU通道' }], '新名字不匹配 → 当新增（账本里还没有）');
    const withTreasure = { ...ledgerFixture(), treasures: [{ id: 'z1', name: '青莲地心火', grade: '异火榜第十九', type: '异火' }] };
    const upgraded = arbitrateFrame({
        namespace: { 更新时间: STAMP, 天材地宝: '青莲地心火·异火榜第十五·异火' },
        ledger: withTreasure,
    });
    assert.deepEqual(upgraded.ops, [{ op: 'updateTreasure', id: 'z1', grade: '异火榜第十五' }]);
    const gone = arbitrateFrame({ namespace: { 更新时间: STAMP, 天材地宝: '' }, ledger: withTreasure });
    assert.deepEqual(gone.ops, [{ op: 'removeTreasure', id: 'z1' }]);
}

{
    // 行囊：带数量新增（丹/散归丹药）、数量变化、消失；穿戴中装备不归行囊管
    const ledger = ledgerFixture();
    const verdict = arbitrateFrame({
        namespace: { 更新时间: STAMP, 行囊: '回气丹×1、聚气散×2、储物袋' },
        ledger,
    });
    assert.equal(verdict.ops.length, 3);
    assert.deepEqual(verdict.ops[0], { op: 'updateItem', id: 'b1', count: 1 });
    assert.deepEqual(verdict.ops[1], { op: 'addItem', name: '聚气散', category: '丹药', count: 2, source: 'MVU通道' });
    assert.deepEqual(verdict.ops[2], { op: 'addItem', name: '储物袋', category: '杂物', count: 1, source: 'MVU通道' });
}

{
    // 丹方/器谱：按类别分链；缺席即移除
    const ledger = ledgerFixture();
    const verdict = arbitrateFrame({
        namespace: { 更新时间: STAMP, 丹方: '回气散·一品、凝血散·二品' },
        ledger,
    });
    assert.deepEqual(verdict.ops, [
        { op: 'addRecipe', name: '凝血散', craft: '炼药', grade: '二品', note: 'MVU通道' },
    ]);
    const forget = arbitrateFrame({ namespace: { 更新时间: STAMP, 丹方: '' }, ledger });
    assert.deepEqual(forget.ops, [{ op: 'removeRecipe', id: 'r1' }]);
}

{
    // 炼制：新开工带天数；从清单消失按炼成收尾；标（炸炉）按失败收尾
    const ledger = ledgerFixture();
    const verdict = arbitrateFrame({
        namespace: { 更新时间: STAMP, 炼制: '凝血散×1（剩 2 天）、回气散×2（剩 2 天）' },
        ledger,
    });
    assert.equal(verdict.ops.length, 1);
    assert.deepEqual(verdict.ops[0], { op: 'startCraft', name: '回气散', craft: '炼药', count: 2, days: 2, note: 'MVU通道申报开工' });
    const done = arbitrateFrame({ namespace: { 更新时间: STAMP, 炼制: '' }, ledger });
    assert.deepEqual(done.ops, [{ op: 'finishCraft', id: 'c1', result: 'success', note: 'MVU通道炼制结束' }]);
    const boom = arbitrateFrame({ namespace: { 更新时间: STAMP, 炼制: '凝血散（炸炉）' }, ledger });
    assert.deepEqual(boom.ops, [{ op: 'finishCraft', id: 'c1', result: 'fail', note: 'MVU通道炼制结束' }]);
}

{
    // 目标：★主线带期限与完整内容；从清单消失按达成收尾；超长标题整字段回滚
    const ledger = ledgerFixture();
    const verdict = arbitrateFrame({
        namespace: { 更新时间: STAMP, 目标: '★三年之约雪前耻（三年后）；·凑齐焚决后续：找到焚决后半部（月底前）' },
        ledger,
    });
    assert.equal(verdict.ops.length, 1);
    assert.deepEqual(verdict.ops[0], {
        op: 'addGoal', title: '凑齐焚决后续', text: '找到焚决后半部', priority: '支线', due: '月底前',
    });
    const finished = arbitrateFrame({ namespace: { 更新时间: STAMP, 目标: '' }, ledger });
    assert.deepEqual(finished.ops, [{ op: 'finishGoal', id: 'g1' }]);
    const badTitle = arbitrateFrame({
        namespace: { 更新时间: STAMP, 目标: '这是一个超过三十个字的目标标题用来验证超长标题依然整条不该被收录进来（三年后）' },
        ledger,
    });
    assert.equal(badTitle.reverts.length, 1);
    assert.equal(badTitle.ops.length, 0);
    // 新版 [主线]/[支线] 括号前缀：剥前缀、识别优先级，标题不再带括号残留
    // （fixture 里开放目标 g1 不在新清单 → 同步按达成收尾）
    const bracketed = arbitrateFrame({
        namespace: { 更新时间: STAMP, 目标: '[主线] 拜见谷尼：前往特米尔拍卖场面见谷尼（今日）' },
        ledger,
    });
    assert.deepEqual(bracketed.ops, [
        { op: 'addGoal', title: '拜见谷尼', text: '前往特米尔拍卖场面见谷尼', priority: '主线', due: '今日' },
        { op: 'finishGoal', id: 'g1' },
    ]);
    const bracketedZhi = arbitrateFrame({
        namespace: { 更新时间: STAMP, 目标: '★三年之约雪前耻（三年后）；[支线] 明早补货：与周管事写清货单（明早）' },
        ledger,
    });
    assert.deepEqual(bracketedZhi.ops, [
        { op: 'addGoal', title: '明早补货', text: '与周管事写清货单', priority: '支线', due: '明早' },
    ]);
}

{
    // 载荷里没有的字段（旧 [InitVar] 骨架、模型随手写的陌生键）：不当清空、不回滚，
    // 下次整帧同步时自然被账本清单覆盖掉。
    const ledger = ledgerFixture();
    const legacy = arbitrateFrame({ namespace: { 更新时间: STAMP, 剧情日: '03月15日', 好感度: 10 }, ledger });
    assert.equal(legacy.status, 'clean');
    assert.equal(legacy.reverts.length, 0);
}

// 非字符串不能被当成清空；每种链条与档案字段都应回滚，账本不受影响。
{
    const ledger = ledgerFixture();
    ledger.treasures = [{ id: 'z1', name: '青莲地心火', grade: '异火', type: '火种' }];
    ledger.recipes.push({ id: 'r2', name: '玄铁尺', craft: '炼器', grade: '一品' });
    const profileFields = { 姓名: 'name', 性别: 'gender', 年龄: 'age', 种族: 'race', 出身: 'origin', 所属: 'affiliation', 斗气属性: 'attribute', 天赋: 'talent', 外貌: 'appearance' };
    const fields = [...Object.keys(profileFields), '功法', '斗技', '装备', '天材地宝', '行囊', '称号', '丹方', '器谱', '炼制', '目标'];
    const failures = new Set();
    for (const field of fields) {
        for (const value of [null, undefined, [], {}, false, true, 0, 42]) {
            for (const saved of [ledger, { ...ledger, profile: {}, titles: [], techniques: [], skills: [], equipment: [], treasures: [], items: [], recipes: [], crafts: [], goals: [] }]) {
                const verdict = arbitrateFrame({ namespace: { 更新时间: STAMP, [field]: value }, ledger: saved });
                if (verdict.ops.length || verdict.reverts.length !== 1 || verdict.reverts[0].field !== field) failures.add(field);
            }
        }
        const cleared = arbitrateFrame({ namespace: { 更新时间: STAMP, [field]: '' }, ledger });
        assert.equal(cleared.reverts.length, 0, `${field} 的合法空字符串仍应采纳`);
        assert.ok(cleared.ops.length, `${field} 的合法空字符串仍应生成清空/结束操作`);
        if (profileFields[field]) assert.deepEqual(cleared.ops, [{ op: 'setProfile', field: profileFields[field], text: '' }]);
    }
    assert.deepEqual([...failures], [], '非字符串字段必须回滚，不能清除档案、移除清单或结束目标/炼制');
    const runtime = runtimeWith(ledger);
    const before = runtime.snapshot();
    const mixed = arbitrateFrame({ namespace: { 更新时间: STAMP, 姓名: null, 行囊: {}, 金币: 450 }, ledger: before });
    assert.deepEqual(mixed.ops, [{ op: 'setGold', amount: 450 }], '合法字段不应被同帧坏字段阻塞');
    runtime.apply(mixed.ops, { source: 'mvu', floor: 6, day: 21 });
    assert.deepEqual(runtime.snapshot().profile, before.profile, '坏类型不应擦除实际档案');
    assert.deepEqual(runtime.snapshot().items, before.items, '坏类型不应删除实际行囊');
}

// —— 采纳的操作喂给真 runtime：账本按预期变化 ——

{
    const ledger = ledgerFixture();
    const verdict = arbitrateFrame({
        namespace: {
            更新时间: STAMP,
            境界: '斗师', 段位: '一星',
            金币: 320,
            功法: '焚决·黄阶低级·第五层、狂狮怒罡·玄阶中级',
            行囊: '回气丹×1、聚气散×2',
            目标: '★三年之约雪前耻（三年后）；·凑齐焚决后续：找到焚决后半部',
        },
        ledger,
    });
    assert.equal(verdict.status, 'ops');
    const runtime = runtimeWith(ledger);
    const result = runtime.apply(verdict.ops, { source: 'mvu', floor: 5, day: 21 });
    assert.equal(result.status, 'applied');
    const snapshot = runtime.snapshot();
    assert.equal(snapshot.realm.realm, '斗师');
    assert.equal(snapshot.realm.stage, '一星');
    assert.equal(snapshot.gold, 320);
    assert.deepEqual(snapshot.techniques.map(item => [item.name, item.grade, item.progress].filter(Boolean).join('·')), ['焚决·黄阶低级·第五层', '狂狮怒罡·玄阶中级']);
    assert.equal(snapshot.items.find(item => item.name === '回气丹').count, 1);
    assert.ok(snapshot.items.find(item => item.name === '聚气散' && item.count === 2));
    assert.equal(snapshot.goals.filter(goal => !goal.done).length, 2);
    // 同楼重 roll：runtime 的 lastFloor 机制对 source mvu 同样生效——
    // 空操作重进同楼等于把上一版采纳整体撤销（金币/境界/功法/行囊/新增目标回到采纳前）。
    runtime.apply([], { source: 'mvu', floor: 5, day: 21 });
    const rolledBack = runtime.snapshot();
    assert.equal(rolledBack.gold, 500);
    assert.equal(rolledBack.realm.realm, '斗者');
    assert.equal(rolledBack.techniques.length, 1);
    assert.equal(rolledBack.techniques[0].progress, '第三层');
    assert.equal(rolledBack.items.find(item => item.name === '回气丹').count, 3);
    assert.equal(rolledBack.goals.filter(goal => !goal.done).length, 1);
}

// OPT-010: ownership and exact reply are checked after every asynchronous wait.
{
    const runtime = runtimeWith(ledgerFixture());
    const chat = [{ mes: '<UpdateVariable>x</UpdateVariable>', is_user: false, swipe_id: 0 }];
    let owner = 1, reads = 0;
    const arbiter = createMvuArbiter({ selfRuntime: runtime,
        selfMvu: { readLatest: async () => { reads++; return { ok: true, namespace: { 更新时间: STAMP, 金币: 1 } }; } },
        getContext: () => ({ chat }), capture: () => owner, isCurrent: token => token === owner,
        sleep: async () => { owner++; },
    });
    assert.equal((await arbiter.runArbitration()).status, 'stale');
    assert.equal(reads, 0);
    const swipe = createMvuArbiter({ selfRuntime: runtime, selfMvu: fakeMvu(), getContext: () => ({ chat }),
        sleep: async () => { chat[0].swipe_id++; },
    });
    assert.equal((await swipe.runArbitration()).status, 'stale');
}

// —— 异步外壳 ——

function fakeContext(chat) {
    return { chat };
}

function fakeMvu({ namespace = null, ok = true } = {}) {
    const calls = { syncs: [] };
    return {
        calls,
        readLatest: async () => (ok ? { ok: true, namespace } : { ok: false, reason: '帧坏了' }),
        sync: async state => {
            calls.syncs.push(structuredClone(state));
            return { ok: true, wrote: true };
        },
    };
}

{
    // 无申报块：快速路径，不等待也不读帧
    const runtime = runtimeWith(ledgerFixture());
    const mvu = fakeMvu();
    const arbiter = createMvuArbiter({
        selfRuntime: runtime, selfMvu: mvu,
        getContext: () => fakeContext([{ mes: '普通剧情', is_user: false }]),
        waitMs: 0,
    });
    assert.deepEqual(await arbiter.runArbitration(), { status: 'no_block' });
    assert.equal(mvu.calls.syncs.length, 0);
}

{
    // 有申报块 + 帧一致：unchanged（帧用归一后的账本快照投影——restore 会把穿戴物挪进装备栏）
    const ledger = ledgerFixture();
    const runtime = runtimeWith(ledger);
    const { buildSelfMvuPayload } = await import('./self-mvu.js');
    const mvu = fakeMvu({ namespace: buildSelfMvuPayload(runtime.snapshot()) });
    const arbiter = createMvuArbiter({
        selfRuntime: runtime, selfMvu: mvu,
        getContext: () => fakeContext([{ mes: '剧情\n<UpdateVariable>_.set(\'斗破纳戒.金币\', 500, 500);</UpdateVariable>', is_user: false }]),
        waitMs: 0,
    });
    const result = await arbiter.runArbitration();
    assert.equal(result.status, 'unchanged');
    assert.equal(result.diffs, 0);
}

{
    // 有申报块 + 模型改金币/境界：采纳进账本
    const ledger = ledgerFixture();
    const runtime = runtimeWith(ledger);
    const mvu = fakeMvu({ namespace: { 更新时间: STAMP, 金币: 320, 境界: '斗师', 段位: '一星' } });
    let persisted = 0;
    const arbiter = createMvuArbiter({
        selfRuntime: runtime, selfMvu: mvu,
        getContext: () => fakeContext([{ mes: '剧情 _.set 断句\n<UpdateVariable>\n_.set(\'斗破纳戒.金币\', 500, 320);//买药\n</UpdateVariable>', is_user: false }]),
        waitMs: 0,
        persistSelf: () => { persisted += 1; },
        worldDay: () => 21,
    });
    const result = await arbiter.runArbitration();
    assert.equal(result.status, 'applied');
    assert.equal(result.applied, 2);
    assert.equal(persisted, 1);
    assert.equal(runtime.snapshot().gold, 320);
    assert.equal(runtime.snapshot().realm.realm, '斗师');
}

{
    // 命名空间被清（重置助手）→ 重同步账本
    const runtime = runtimeWith(ledgerFixture());
    const mvu = fakeMvu({ namespace: null });
    const arbiter = createMvuArbiter({
        selfRuntime: runtime, selfMvu: mvu,
        getContext: () => fakeContext([{ mes: '<UpdateVariable>_.set(\'斗破纳戒.金币\', 1, 2);</UpdateVariable>', is_user: false }]),
        waitMs: 0,
    });
    const result = await arbiter.runArbitration();
    assert.deepEqual(result, { status: 'no_namespace', resynced: true });
    assert.equal(mvu.calls.syncs.length, 1);
}

{
    // 帧时间戳对不上（同步断档）→ stale + 重同步，不动账本
    const ledger = ledgerFixture();
    const runtime = runtimeWith(ledger);
    const before = runtime.snapshot();
    const mvu = fakeMvu({ namespace: { 更新时间: '2020-01-01T00:00:00.000Z', 金币: 1 } });
    const arbiter = createMvuArbiter({
        selfRuntime: runtime, selfMvu: mvu,
        getContext: () => fakeContext([{ mes: '<UpdateVariable>x</UpdateVariable>', is_user: false }]),
        waitMs: 0,
    });
    const result = await arbiter.runArbitration();
    assert.equal(result.status, 'stale');
    assert.equal(mvu.calls.syncs.length, 1);
    assert.equal(runtime.snapshot().gold, before.gold, 'stale 轮不采纳任何申报');
}

{
    // 用户楼层不算申报源：最新楼是玩家消息 → no_reply
    const runtime = runtimeWith(ledgerFixture());
    const mvu = fakeMvu();
    const arbiter = createMvuArbiter({
        selfRuntime: runtime, selfMvu: mvu,
        getContext: () => fakeContext([{ mes: '<UpdateVariable>x</UpdateVariable>', is_user: true }]),
        waitMs: 0,
    });
    assert.equal((await arbiter.runArbitration()).status, 'no_reply');
}

{
    // 读帧失败：静默上报，不落账
    const runtime = runtimeWith(ledgerFixture());
    const mvu = fakeMvu({ ok: false });
    const arbiter = createMvuArbiter({
        selfRuntime: runtime, selfMvu: mvu,
        getContext: () => fakeContext([{ mes: '<UpdateVariable>x</UpdateVariable>', is_user: false }]),
        waitMs: 0,
    });
    const result = await arbiter.runArbitration();
    assert.equal(result.status, 'unavailable');
    assert.equal(runtime.snapshot().gold, 500);
}

// 真桥联通检查：createSelfMvuBridge 的 readLatest 被 shell 调用（形状存在即可）
{
    const bridge = createSelfMvuBridge();
    assert.equal(typeof bridge.readLatest, 'function');
}

// OPT-006: regeneration diffs and apply use the same pre-floor baseline.
{
    const runtime = runtimeWith({ ...ledgerFixture(), items: [] });
    const chat = [{ mes: '<UpdateVariable>x</UpdateVariable>', is_user: false }];
    let namespace = { 更新时间: runtime.snapshot().updatedAt, 行囊: '回气丹×3' };
    const arbiter = createMvuArbiter({ selfRuntime: runtime,
        selfMvu: { readLatest: async () => ({ ok: true, namespace }) },
        getContext: () => ({ chat }), sleep: async () => {},
    });
    assert.equal((await arbiter.runArbitration()).status, 'applied');
    namespace = { 更新时间: runtime.snapshot().updatedAt, 行囊: '回气丹×2' };
    assert.equal((await arbiter.runArbitration()).status, 'applied');
    assert.equal(runtime.snapshot().items[0].count, 2);
    assert.equal((await arbiter.runArbitration()).status, 'unchanged');
    namespace = { 更新时间: runtime.snapshot().updatedAt, 行囊: '' };
    await arbiter.runArbitration();
    assert.equal(runtime.snapshot().items.length, 0, 'regeneration back to pre-floor empty state still rolls back');
}

// OPT-036: unsupported same-name mutations are explicit reverts, not clean.
{
    const ledger = ledgerFixture();
    for (const namespace of [
        { 丹方: '回气散·二品' },
        { 炼制: '凝血散×9（剩 4 天）' },
        { 目标: '·三年之约雪前耻：新内容（后天）' },
    ]) {
        const verdict = arbitrateFrame({ namespace: { 更新时间: STAMP, ...namespace }, ledger });
        assert.equal(verdict.status, 'ops');
        assert.equal(verdict.ops.length, 0);
        assert.equal(verdict.reverts.length, 1);
    }
}

// OPT-038: oversized frames are rejected whole, never silently truncated.
{
    const ledger = ledgerFixture();
    const namespace = { 更新时间: STAMP, 行囊: Array.from({ length: 13 }, (_, i) => `测试物${i}×1`).join('、') };
    const verdict = arbitrateFrame({ namespace, ledger });
    assert.equal(verdict.ops.length, 0);
    assert.ok(verdict.reverts.some(row => /12/.test(row.reason)));
}

// —— MVU 兜底：帧未动但有合规申报 → 扩展自己解析申报走同一套裁决 ——

// 纯函数：只认 replace/add 的纳戒整字段；未知字段/更新时间/子路径/其他操作不套；不改入参。
{
    const projection = { 更新时间: STAMP, 金币: 500, 行囊: '回气丹×3', 姓名: '墨白' };
    const synthetic = applyDeclaredPatch(projection, [
        { op: 'replace', field: '金币', value: 320 },
        { op: 'add', field: '行囊', value: '回气丹×1' },
        { op: 'replace', field: '更新时间', value: 'x' },
        { op: 'replace', field: '别人的字段', value: 1 },
        { op: 'remove', field: '金币' },
        { op: 'replace', field: '行囊', sub: '0', value: 'x' },
        { op: 'move', field: '金币', from: '/斗破纳戒/行囊' },
    ]);
    assert.deepEqual(synthetic, { 更新时间: STAMP, 金币: 320, 行囊: '回气丹×1', 姓名: '墨白' });
    assert.notEqual(synthetic, projection, '不改入参');
    assert.equal(applyDeclaredPatch(projection, [{ op: 'replace', field: '别人的字段', value: 1 }]), null);
    assert.equal(applyDeclaredPatch(null, [{ op: 'replace', field: '金币', value: 1 }]), null);
    // 帧匹配：投影没有的字段不算差异（旧骨架），金币不同算差异
    assert.equal(frameMatchesProjection({ ...projection, 旧骨架字段: 'x' }, ledgerFixture()), true);
    assert.equal(frameMatchesProjection({ ...projection, 金币: 499 }, ledgerFixture()), false);
}

// 兜底落账：MVU 缺席（帧=账本投影）+ JSONPatch 申报 → 合成应然帧，采纳进账本。
{
    const ledger = ledgerFixture();
    const runtime = runtimeWith(ledger);
    const { buildSelfMvuPayload } = await import('./self-mvu.js');
    const mvu = fakeMvu({ namespace: buildSelfMvuPayload(runtime.snapshot()) });
    let persisted = 0;
    const arbiter = createMvuArbiter({
        selfRuntime: runtime, selfMvu: mvu,
        getContext: () => fakeContext([{ mes: '剧情\n<UpdateVariable><Analysis>x</Analysis><JSONPatch>[{"op":"replace","path":"/斗破纳戒/金币","value":320},{"op":"replace","path":"/斗破纳戒/行囊","value":"回气丹×1、聚气散×2"}]</JSONPatch></UpdateVariable>', is_user: false }]),
        waitMs: 0, persistSelf: () => { persisted += 1; }, worldDay: () => 21,
    });
    const result = await arbiter.runArbitration();
    assert.equal(result.status, 'applied');
    assert.equal(result.fallback, true);
    assert.equal(runtime.snapshot().gold, 320);
    assert.ok(runtime.snapshot().items.find(item => item.name === '聚气散' && item.count === 2));
    assert.equal(runtime.snapshot().items.find(item => item.name === '回气丹').count, 1);
    assert.equal(persisted, 1);
}

// MVU 正常（帧已动）→ 兜底静默，绝不双重执行。
{
    const ledger = ledgerFixture();
    const runtime = runtimeWith(ledger);
    const mvu = fakeMvu({ namespace: { 更新时间: STAMP, 金币: 320, 行囊: '回气丹×1、聚气散×2' } });
    const arbiter = createMvuArbiter({
        selfRuntime: runtime, selfMvu: mvu,
        getContext: () => fakeContext([{ mes: '剧情\n<UpdateVariable><JSONPatch>[{"op":"replace","path":"/斗破纳戒/金币","value":320}]</JSONPatch></UpdateVariable>', is_user: false }]),
        waitMs: 0, worldDay: () => 21,
    });
    const result = await arbiter.runArbitration();
    assert.equal(result.status, 'applied');
    assert.equal(result.fallback, undefined);
    assert.equal(runtime.snapshot().gold, 320);
}

// 补丁里只有未知字段/更新时间 → 不兜底，维持 unchanged。
{
    const ledger = ledgerFixture();
    const runtime = runtimeWith(ledger);
    const { buildSelfMvuPayload } = await import('./self-mvu.js');
    const mvu = fakeMvu({ namespace: buildSelfMvuPayload(runtime.snapshot()) });
    const arbiter = createMvuArbiter({
        selfRuntime: runtime, selfMvu: mvu,
        getContext: () => fakeContext([{ mes: '剧情\n<UpdateVariable><JSONPatch>[{"op":"replace","path":"/别人的变量/好感度","value":99},{"op":"replace","path":"/斗破纳戒/更新时间","value":"bad"}]</JSONPatch></UpdateVariable>', is_user: false }]),
        waitMs: 0,
    });
    const result = await arbiter.runArbitration();
    assert.equal(result.status, 'unchanged');
    assert.equal(result.fallback, undefined);
}

// 坏类型申报照套进合成帧，由逐字段守卫如实回滚——账本一字不动。
{
    const ledger = ledgerFixture();
    const runtime = runtimeWith(ledger);
    const { buildSelfMvuPayload } = await import('./self-mvu.js');
    const mvu = fakeMvu({ namespace: buildSelfMvuPayload(runtime.snapshot()) });
    const arbiter = createMvuArbiter({
        selfRuntime: runtime, selfMvu: mvu,
        getContext: () => fakeContext([{ mes: '剧情\n<UpdateVariable><JSONPatch>[{"op":"replace","path":"/斗破纳戒/行囊","value":{"bad":true}}]</JSONPatch></UpdateVariable>', is_user: false }]),
        waitMs: 0,
    });
    const result = await arbiter.runArbitration();
    assert.equal(result.status, 'reverted');
    assert.equal(result.fallback, true);
    assert.ok(result.reverts.some(row => row.field === '行囊'));
    assert.equal(runtime.snapshot().items.find(item => item.name === '回气丹').count, 3, '账本不动');
}

// 同楼重 roll：sync 会把账本写回帧（真实桥行为），兜底再合成也是零差分 → 幂等。
{
    const ledger = ledgerFixture();
    const runtime = runtimeWith(ledger);
    const { buildSelfMvuPayload } = await import('./self-mvu.js');
    let namespace = buildSelfMvuPayload(runtime.snapshot());
    const mvu = {
        readLatest: async () => ({ ok: true, namespace }),
        sync: async state => { namespace = structuredClone(state); return { ok: true, wrote: true }; },
    };
    const message = '剧情\n<UpdateVariable><JSONPatch>[{"op":"replace","path":"/斗破纳戒/金币","value":320},{"op":"replace","path":"/斗破纳戒/行囊","value":"回气丹×1、聚气散×2"}]</JSONPatch></UpdateVariable>';
    const arbiter = createMvuArbiter({
        selfRuntime: runtime, selfMvu: mvu,
        getContext: () => fakeContext([{ mes: message, is_user: false }]),
        waitMs: 0, worldDay: () => 21,
        persistSelf: () => { namespace = buildSelfMvuPayload(runtime.snapshot()); },
    });
    const first = await arbiter.runArbitration();
    assert.equal(first.status, 'applied');
    assert.equal(first.fallback, true);
    const second = await arbiter.runArbitration();
    assert.equal(second.status, 'unchanged');
    assert.equal(runtime.snapshot().gold, 320);
    assert.equal(runtime.snapshot().items.filter(item => item.name === '聚气散').length, 1);
}
// —— 真机回归：模型在块里写格式说明散文（带出没闭合的 <JSONPatch> 开标签，
// 正好吞掉真申报的闭合标签）不能废掉真申报 —— 真实形状取自 2026-11-05 拍卖场回合。
{
    const message = [
        '剧情。',
        '<UpdateVariable>',
        '<Analysis>照规矩申报喵！输出格式 <JSONPatch>`！</Analysis>',
        '',
        '---',
        '### 维度④：场景分镜喵',
        '<JSONPatch>',
        '[{"op":"replace","path":"/斗破纳戒/金币","value":320}]',
        '</JSONPatch>',
        '</UpdateVariable>',
    ].join('\n');
    const found = extractUpdateBlock(message);
    assert.equal(found.patch.length, 1, '散文里的未闭合开标签之后，真申报仍要被解析出来');
    assert.equal(found.patch[0].field, '金币');
    assert.equal(found.patch[0].value, 320);
    assert.equal(found.patchError, '');
    // 成对的完整散标（自己的开闭）也照旧跳过
    const paired = extractUpdateBlock([
        '剧情。',
        '<UpdateVariable>',
        '<Analysis>格式 <JSONPatch>`示例`</JSONPatch> 见下</Analysis>',
        '<JSONPatch>[{"op":"replace","path":"/斗破纳戒/金币","value":1}]</JSONPatch>',
        '</UpdateVariable>',
    ].join('\n'));
    assert.equal(paired.patch.length, 1);
    assert.equal(paired.patch[0].value, 1);
    assert.equal(extractUpdateBlock('剧情。<UpdateVariable><Analysis>只有说明，没有 JSONPatch</Analysis></UpdateVariable>').patch.length, 0);
}

// —— 真机回归：模型自造目标标签（[探索]）剥掉当支线，不再把标签并进标题整字段报废 ——
{
    const ledger = ledgerFixture();
    ledger.goals = [];
    const verdict = arbitrateFrame({
        namespace: { 更新时间: STAMP, 目标: '[探索] 前往特米尔拍卖场打探丹药与药材行情' },
        ledger,
    });
    assert.equal(verdict.status, 'ops');
    assert.deepEqual(verdict.ops.map(op => [op.op, op.title, op.priority]), [['addGoal', '前往特米尔拍卖场打探丹药与药材行情', '支线']]);
    // 主线/支线的严格前缀照旧生效，★ 仍是主线
    const verdict2 = arbitrateFrame({
        namespace: { 更新时间: STAMP, 目标: '[主线] 三年之约：雪前耻（三年后）' },
        ledger,
    });
    assert.deepEqual(verdict2.ops.map(op => [op.op, op.priority, op.due]), [['addGoal', '主线', '三年后']]);
    // 21–30 字的真实标题（真机拍卖场回合原句）应放行；31 字仍然整字段报废
    const long = '在特米尔拍卖场向谷尼大师打探丹药与药材行情';
    assert.equal(long.length, 21);
    const verdict3 = arbitrateFrame({ namespace: { 更新时间: STAMP, 目标: `[探索] ${long}` }, ledger });
    assert.deepEqual(verdict3.ops.map(op => [op.op, op.title]), [['addGoal', long]]);
    const tooLong = arbitrateFrame({ namespace: { 更新时间: STAMP, 目标: `[探索] ${long}再补上足够多的字数确保超过三十个字的硬上限` }, ledger });
    assert.equal(tooLong.status, 'ops');
    assert.equal(tooLong.ops.length, 0);
    assert.ok(tooLong.reverts.length >= 1);
}
console.log('mvu-arbiter tests passed');
