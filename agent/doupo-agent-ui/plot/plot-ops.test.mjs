import assert from 'node:assert/strict';
import { buildPlotInjection, PLOT_HEADER } from './plot-ops.js';

const snapshot = {
    schemaVersion: 1,
    day: 12,
    plan: { goal: '三年之约前在乌坦城站稳', next: '去市场打听炼药师大会的风声', updatedAt: '2026-01-01' },
    threads: [
        { id: 'f1', title: '神秘的玉简', kind: 'suspense', detail: '玉简上的文字无人能解', basis: '第3楼拍卖会所得', day: 3, dueDay: 12, status: 'open', resolvedDay: null, outcome: '' },
        { id: 'f2', title: '云岚宗的仇', kind: 'conflict', detail: '退婚结怨', basis: '第4楼退婚', day: 4, dueDay: null, status: 'open', resolvedDay: null, outcome: '' },
        { id: 'f3', title: '城东失窃的幕后', kind: 'suspense', detail: '线索指向米特尔家族旁支', basis: '第5楼巡卫盘查', day: 5, dueDay: 3, status: 'open', resolvedDay: null, outcome: '' },
        { id: 'f4', title: '已回收的旧线', kind: 'foreshadow', detail: '早就收了', basis: '第1楼', day: 1, dueDay: null, status: 'resolved', resolvedDay: 8, outcome: '' },
        { id: 'f5', title: '已作废的旧线', kind: 'foreshadow', detail: '剧情绕开了', basis: '第2楼', day: 2, dueDay: null, status: 'dropped', resolvedDay: 9, outcome: '' },
    ],
    log: [],
};

// —— 注入文本：计划两行在前、只含开放线索、超期/悬置标记对 ——
const injected = buildPlotInjection(snapshot);
assert.ok(injected.startsWith('本幕目标：三年之约前在乌坦城站稳'), '计划第一行');
assert.ok(injected.includes('下一步：去市场打听炼药师大会的风声'), '计划第二行');
assert.ok(injected.includes('未回收线索（推进用 updateThread、回收用 resolveThread、作废用 dropThread）'));
// 超期的（f3 dueDay=3 < today=12）排最前，带超期标记
assert.ok(injected.indexOf('(f3') < injected.indexOf('(f1'), '超期线索排最前');
assert.ok(injected.includes('(f3 第5天埋·悬念) 「城东失窃的幕后」：线索指向米特尔家族旁支（已超期未回收）（已悬 7 天）（依据：第5楼巡卫盘查）'), '超期行带悬置天数');
assert.ok(injected.includes('(f1 第3天埋·悬念) 「神秘的玉简」：玉简上的文字无人能解（第 12 天前回收）（已悬 9 天）（依据：第3楼拍卖会所得）'), '未超期的带回收窗口与悬置天数');
assert.ok(injected.includes('(f2 第4天埋·恩怨) 「云岚宗的仇」：退婚结怨（已悬 8 天）'), '恩怨行带类型标签');
assert.ok(!injected.includes('已回收的旧线'), '已回收的不进注入');
assert.ok(!injected.includes('已作废的旧线'), '已作废的不进注入');
assert.ok(PLOT_HEADER.includes('剧情前瞻'));
assert.ok(PLOT_HEADER.includes('禁止在正文的任何位置输出指令块'), '抬头要管住正文的手');

// —— 悬置天数按 snapshot.day 算：没喂 day 时不标悬置 ——
{
    const noDay = buildPlotInjection({ ...snapshot, day: null });
    assert.ok(!noDay.includes('已悬'), '没有世界天数就没有悬置标记');
    assert.ok(noDay.includes('本幕目标'), '计划照常注入');
}

// —— 空账：返回空串，调用方据此清通道 ——
assert.equal(buildPlotInjection({}), '');
assert.equal(buildPlotInjection({ plan: {}, threads: [] }), '');
assert.equal(buildPlotInjection({ plan: { goal: '', next: '' }, threads: [{ status: 'resolved', title: '旧线' }] }), '');

// —— 预算裁剪：先丢线索保计划；线索丢光时栏头一起退场，计划行永远保留 ——
{
    const fat = {
        day: 10,
        plan: { goal: '本幕目标占住头两行', next: '下一步不能被挤掉' },
        threads: Array.from({ length: 8 }, (_, index) => ({
            id: `f${index + 1}`, title: `线索${index + 1}`, kind: 'foreshadow',
            detail: `这条线索的内容比较长，用来撑预算——第 ${index + 1} 条。`.repeat(3),
            basis: `第${index + 1}楼`, day: index + 1, dueDay: null, status: 'open', resolvedDay: null, outcome: '',
        })),
    };
    const trimmed = buildPlotInjection(fat, { maxChars: 300 });
    assert.ok(trimmed.length <= 320, `预算内：${trimmed.length}`);
    assert.ok(trimmed.includes('本幕目标占住头两行'), '计划行永远保留');
    assert.ok(trimmed.includes('下一步不能被挤掉'), '下一步永远保留');
    assert.ok(trimmed.includes('线索1'), '悬置最久的线索优先保留');
    assert.ok(!trimmed.includes('线索8'), '最新的线索先被挤掉');
    // 预算小到只剩计划：栏头与线索全部退场
    const minimal = buildPlotInjection(fat, { maxChars: 120 });
    assert.ok(minimal.includes('本幕目标占住头两行'));
    assert.ok(!minimal.includes('未回收线索'), '线索栏头随最后一行一起退场');
}
