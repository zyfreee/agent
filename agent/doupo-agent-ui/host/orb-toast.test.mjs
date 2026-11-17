import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrbToasts, npcLedgerResultToToasts, selfResultToToasts } from './orb-toast.js';

function fakeClock() {
    let current = 1_000_000;
    return { now: () => current, advance: ms => { current += ms; } };
}

test('消息弹窗：入列、到点清算、点掉、清空，溢出挤掉最老的', () => {
    const clock = fakeClock();
    const toasts = createOrbToasts({ max: 3, seconds: 8, now: clock.now });
    assert.equal(toasts.push([{ icon: 'person', title: '云香', text: '好感 +3', tone: 'good' }, { text: '' }, { text: '金币+50', tone: 'good' }]), 2, '空 text 不入列');
    assert.equal(toasts.active().length, 2);
    assert.equal(toasts.active()[0].title, '云香');

    // 第 3 条进入后还在上限内，第 4 条把最老的挤掉
    toasts.push({ text: '境界：斗者 → 斗师', tone: 'good' });
    toasts.push({ text: '移除 b3：回气丹', tone: 'bad' });
    const active = toasts.active();
    assert.equal(active.length, 3);
    assert.equal(active[0].text, '金币+50', '云香那条最老，被挤掉');

    // 到点清算：8 秒寿命，第 7 秒还在，第 8 秒整列退场
    clock.advance(7000);
    assert.equal(toasts.active().length, 3);
    clock.advance(1000);
    assert.equal(toasts.active().length, 0);
    assert.equal(toasts.nextExpiry(), null);

    // 手动点掉与清空
    toasts.push([{ text: '一' }, { text: '二' }]);
    const list = toasts.active();
    assert.equal(toasts.dismiss(list[0].id), true);
    assert.equal(toasts.active().length, 1);
    assert.equal(toasts.dismiss(9999), false);
    toasts.clear();
    assert.equal(toasts.active().length, 0);
});

test('消息弹窗：nextExpiry 报最近到期时刻，push 返回入列数', () => {
    const clock = fakeClock();
    const toasts = createOrbToasts({ seconds: 5, now: clock.now });
    assert.equal(toasts.push({ text: '一' }), 1);
    clock.advance(2000);
    assert.equal(toasts.push({ text: '二' }), 1);
    assert.equal(toasts.nextExpiry(), 1_000_000 + 5000, '第一条先到期');
    clock.advance(3000);
    assert.equal(toasts.active().length, 1, '第一条到期退场');
    assert.equal(toasts.nextExpiry(), 1_000_000 + 7000);
});

test('人物簿结果 → 弹窗：同人合并、好感定色、建档打头、好感标签去重', () => {
    const result = {
        status: 'applied',
        applied: [
            { name: '云香', fields: ['好感+3', '流水'], favor: 3, created: false },
            { name: '云香', fields: ['经历'], favor: 1, created: false },
            { name: '药老', fields: ['好感-5', '情绪'], favor: -5, created: false },
            { name: '小医仙', fields: ['好感+2', '流水', '经历'], favor: 2, created: true },
            { name: '路人甲', fields: ['在场'], favor: 0, created: false },
        ],
    };
    const toasts = npcLedgerResultToToasts(result, { source: '正文' });
    assert.equal(toasts.length, 4);
    assert.deepEqual(toasts[0], { icon: 'person', title: '云香', text: '好感 +4 · 流水 · 经历', tone: 'good', detail: '正文' }, '两次补丁合并，好感标签不重复');
    assert.equal(toasts[1].tone, 'bad');
    assert.equal(toasts[2].icon, 'plus', '建档换加号图标');
    assert.equal(toasts[2].text, '新档案 · 好感 +2 · 流水 · 经历');
    assert.equal(toasts[3].tone, 'info', '只有字段变化没有好感＝中性');
});

test('纳戒结果 → 弹窗：金币看正负、境界喜、移除红、新增绿、其余中性', () => {
    const result = {
        status: 'applied',
        applied: [
            { summary: '金币+50：100 → 150' },
            { summary: '金币-20：150 → 130' },
            { summary: '金币：130 → 200' },
            { summary: '境界：斗者 → 斗师' },
            { summary: `移除 b3：回气丹` },
            { summary: '行囊 +b4：凝血散 ×2' },
            { summary: '姓名：（空）→ 萧炎' },
            { summary: '' },
        ],
    };
    const toasts = selfResultToToasts(result, { source: 'decide' });
    assert.equal(toasts.length, 7, '空摘要不弹');
    assert.deepEqual([toasts[0].tone, toasts[0].icon], ['good', 'balance']);
    assert.deepEqual([toasts[1].tone, toasts[1].icon], ['bad', 'balance']);
    assert.deepEqual([toasts[2].tone, toasts[2].icon], ['info', 'balance'], 'setGold 没写增减，中性');
    assert.deepEqual([toasts[3].tone, toasts[3].icon], ['good', 'flame']);
    assert.deepEqual([toasts[4].tone, toasts[4].icon], ['bad', 'ledger']);
    assert.deepEqual([toasts[5].tone, toasts[5].icon], ['good', 'ring']);
    assert.equal(toasts[6].tone, 'info', '身份改动中性');
});
