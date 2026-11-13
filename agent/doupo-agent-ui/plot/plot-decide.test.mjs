import assert from 'node:assert/strict';
import { PLOT_DECIDE_PROMPT, PLOT_JSON_SCHEMA, buildPlotDecideUser, parsePlotDecision } from './plot-decide.js';

// —— 提示词契约：操作清单、边界规则、无变化口径都要写死在提示词里 ——
assert.ok(PLOT_DECIDE_PROMPT.includes('"op":"setPlan"'), '提示词要列出 setPlan');
assert.ok(PLOT_DECIDE_PROMPT.includes('"op":"addThread"'), '提示词要列出 addThread');
assert.ok(PLOT_DECIDE_PROMPT.includes('"op":"updateThread"'), '提示词要列出 updateThread');
assert.ok(PLOT_DECIDE_PROMPT.includes('"op":"resolveThread"'), '提示词要列出 resolveThread');
assert.ok(PLOT_DECIDE_PROMPT.includes('"op":"dropThread"'), '提示词要列出 dropThread');
assert.ok(PLOT_DECIDE_PROMPT.includes('各有自己的账'), '边界规则要写明不越界');
assert.ok(PLOT_DECIDE_PROMPT.includes('"ops":[]'), '无变化口径要写明');
assert.ok(PLOT_JSON_SCHEMA.properties.ops.items.properties.op.enum.includes('setPlan'), 'schema 枚举要含 setPlan');
assert.equal(PLOT_JSON_SCHEMA.required[0], 'ops');

// —— buildPlotDecideUser：账本现状 + 世界时钟 + 最近聊天（旧→新），超长截断 ——
const snapshot = {
    schemaVersion: 1,
    day: 12,
    plan: { goal: '三年之约前在乌坦城站稳', next: '去市场打听炼药师大会的风声', updatedAt: '2026-01-01' },
    threads: [
        { id: 'f1', title: '神秘的玉简', kind: 'suspense', detail: '玉简上的文字无人能解', basis: '第3楼拍卖会所得', day: 3, dueDay: 12, status: 'open', resolvedDay: null, outcome: '' },
        { id: 'f2', title: '云岚宗的仇', kind: 'conflict', detail: '退婚结怨', basis: '第4楼', day: 4, dueDay: null, status: 'resolved', resolvedDay: 9, outcome: '已经了结' },
        { id: 'f3', title: '城东失窃的幕后', kind: 'suspense', detail: '线索指向米特尔家族旁支', basis: '第5楼巡卫盘查', day: 5, dueDay: 3, status: 'open', resolvedDay: null, outcome: '' },
    ],
    log: [],
};
const floors = [
    { role: '玩家', text: '我去拍卖会看了一眼。' },
    { role: '角色', text: '拍下一块玉简，上面的文字无人能解。' },
];
const user = buildPlotDecideUser({ snapshot, clockText: '第 12 天 08:20', floors });
assert.ok(user.includes('【剧情账本（当前滚动计划与开放线索）】'));
assert.ok(user.includes('本幕目标：三年之约前在乌坦城站稳'), '计划要进决定喂料');
assert.ok(user.includes('(f1 第3天埋·悬念) 「神秘的玉简」'), '开放线索要进决定喂料');
assert.ok(user.includes('已超期未回收'), '超期标记要跟进去，模型才知道该收了');
assert.ok(!user.includes('云岚宗的仇'), '已回收的线索不进决定喂料');
assert.ok(user.includes('【世界时钟】\n第 12 天 08:20'), '世界时钟要进决定喂料');
assert.ok(user.includes('[玩家] 我去拍卖会看了一眼。'), '聊天旧→新');
assert.ok(user.includes('只输出 JSON'));
// 空账本：给占位行，不空着发
const emptyUser = buildPlotDecideUser({ snapshot: {}, clockText: '', floors: [] });
assert.ok(emptyUser.includes('账本还是空的'), '空账本要有占位说明');
assert.ok(emptyUser.includes('（还没有聊天内容）'));
// 楼层截断：正文超 800 字截掉
const longUser = buildPlotDecideUser({ snapshot, clockText: '', floors: [{ role: '角色', text: '长'.repeat(900) }] });
assert.ok(longUser.includes('长'.repeat(800)));
assert.ok(!longUser.includes('长'.repeat(801)), '单楼正文按 800 字截断');

// —— parsePlotDecision：抽 JSON、坏输出分类、坏条目过滤 ——
{
    const ok = parsePlotDecision('前置废话 {"note":"更新计划","ops":[{"op":"setPlan","goal":"站稳乌坦城"},{"op":"addThread","title":"神秘的玉简","basis":"第3楼"}]} 后置废话');
    assert.equal(ok.status, 'ok');
    assert.equal(ok.note, '更新计划');
    assert.equal(ok.ops.length, 2);
    assert.equal(ok.dropped, 0);
    // 代码块包着的 JSON 也能抽；note 有内容就算 ok，note 与 ops 全空才是 empty
    const fenced = parsePlotDecision('```json\n{"note":"无变化","ops":[]}\n```');
    assert.equal(fenced.status, 'ok');
    assert.equal(fenced.ops.length, 0);
    const trulyEmpty = parsePlotDecision('```json\n{"note":"","ops":[]}\n```');
    assert.equal(trulyEmpty.status, 'empty');
    // 坏条目过滤：非对象/缺 op 的条目丢掉并计数
    const mixed = parsePlotDecision('{"note":"n","ops":[{"op":"dropThread","id":"f1"},"垃圾",42,{"nope":1}]}');
    assert.equal(mixed.status, 'ok');
    assert.equal(mixed.ops.length, 1);
    assert.equal(mixed.dropped, 3);
    // ops 超 8 条截断
    const many = parsePlotDecision(JSON.stringify({ note: '', ops: Array.from({ length: 12 }, () => ({ op: 'dropThread', id: 'f1' })) }));
    assert.equal(many.ops.length, 8);
    // 彻底坏输出
    const invalid = parsePlotDecision('这不是 JSON');
    assert.equal(invalid.status, 'invalid');
    assert.ok(invalid.error);
    const notObject = parsePlotDecision('[1,2,3]');
    assert.equal(notObject.status, 'invalid');
    // 空输入
    assert.equal(parsePlotDecision('').status, 'invalid');
}

// —— 结算裁定喂料：剧情账本必须看到本轮判定的成败（BUG 1） ——
const settleUser = buildPlotDecideUser({ snapshot, clockText: '第 12 天', floors, settleLines: ['- 药铺购凝血草：失败（骰16-2 对难度 11）'] });
assert.ok(settleUser.includes('【本轮行动结算（生成前已判定，计划与线索须与判定一致）】'), '喂料带结算节');
assert.ok(settleUser.includes('药铺购凝血草'));
assert.ok(!emptyUser.includes('【本轮行动结算'), '没有结算时不出这一节');
