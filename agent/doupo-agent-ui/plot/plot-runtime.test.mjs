import assert from 'node:assert/strict';
import { createPlotRuntime } from './plot-runtime.js';

// —— setPlan：滚动计划的更新与钳制 ——
{
    const runtime = createPlotRuntime();
    const result = runtime.apply([{ op: 'setPlan', goal: '三年之约前在乌坦城站稳', next: '去市场打听炼药师大会的风声' }], { today: 3 });
    assert.equal(result.status, 'applied');
    assert.equal(result.applied.length, 1);
    const status = runtime.status();
    assert.equal(status.plan.goal, '三年之约前在乌坦城站稳');
    assert.equal(status.plan.next, '去市场打听炼药师大会的风声');
    assert.equal(status.day, 3, 'apply 喂进来的世界天数要落进账本');
    // 超长钳制：goal 截到 60、next 截到 120
    runtime.apply([{ op: 'setPlan', goal: '长'.repeat(80), next: '长'.repeat(200) }], { today: 4 });
    assert.equal(runtime.status().plan.goal.length, 60);
    assert.equal(runtime.status().plan.next.length, 120);
    // 两个字段都没给：拒绝
    const nothing = runtime.apply([{ op: 'setPlan' }]);
    assert.equal(nothing.status, 'rejected');
    assert.equal(nothing.rejected[0].reason, 'plan_nothing_to_update');
    // 只更新一个字段：另一个保持旧值
    runtime.apply([{ op: 'setPlan', next: '闭关冲击斗者' }], { today: 5 });
    assert.equal(runtime.status().plan.goal.length, 60, '没写的字段保持旧值');
    assert.equal(runtime.status().plan.next, '闭关冲击斗者');
}

// —— addThread：标题/依据必填、类型缺省、dueDays 换算 ——
{
    const runtime = createPlotRuntime();
    const missing = runtime.apply([{ op: 'addThread', detail: '没有标题', basis: '第3楼' }]);
    assert.equal(missing.rejected[0].reason, 'title_missing');
    const tooLong = runtime.apply([{ op: 'addThread', title: '长'.repeat(17), basis: '依据' }]);
    assert.equal(tooLong.rejected[0].reason, 'title_too_long');
    const noBasis = runtime.apply([{ op: 'addThread', title: '神秘的玉简' }]);
    assert.equal(noBasis.rejected[0].reason, 'basis_missing');
    const badDays = runtime.apply([{ op: 'addThread', title: '神秘的玉简', basis: '第3楼拍卖会所得', dueDays: 91 }]);
    assert.equal(badDays.rejected[0].reason, 'bad_days');
    const ok = runtime.apply([{ op: 'addThread', title: '神秘的玉简', kind: 'suspense', detail: '玉简上的文字无人能解', basis: '第3楼拍卖会所得', dueDays: 10 }], { today: 3 });
    assert.equal(ok.status, 'applied');
    assert.equal(ok.applied[0].id, 'f1');
    const snapshot = runtime.snapshot();
    assert.equal(snapshot.threads[0].kind, 'suspense');
    assert.equal(snapshot.threads[0].day, 3);
    assert.equal(snapshot.threads[0].dueDay, 12, 'dueDays=10 从第3天起算到第12天');
    assert.equal(snapshot.threads[0].status, 'open');
    // kind 写错或缺省都落 foreshadow
    runtime.apply([{ op: 'addThread', title: '云岚宗的旧账', basis: '第4楼退婚结怨' }], { today: 4 });
    assert.equal(runtime.snapshot().threads[1].kind, 'foreshadow');
}

// —— 重复防线：同文换说法（同标题 / 相似标题 / 两天窗口） ——
{
    const runtime = createPlotRuntime();
    runtime.apply([{ op: 'addThread', title: '神秘的玉简', basis: '第3楼拍卖会所得' }], { today: 3 });
    const dup = runtime.apply([{ op: 'addThread', title: '神秘的玉简', basis: '又一次提到玉简' }], { today: 4 });
    assert.equal(dup.rejected[0].reason, 'duplicate_title', '开放中的同标题直接拒绝');
    const similar = runtime.apply([{ op: 'addThread', title: '神秘的玉佩', basis: '第4楼又得了块玉佩' }], { today: 4 });
    assert.equal(similar.rejected[0].reason, 'duplicate_similar', '两天窗口内 bigram 重合过线也算重复');
    // 已回收的线不再挡新线：同名可以重埋
    runtime.apply([{ op: 'resolveThread', id: 'f1', outcome: '玉简内容揭晓' }], { today: 6 });
    const replanted = runtime.apply([{ op: 'addThread', title: '神秘的玉简', basis: '第7楼又出现一块' }], { today: 7 });
    assert.equal(replanted.status, 'applied', '回收后同名线索允许重埋');
    assert.equal(replanted.applied[0].id, 'f2', '发号器继续前进不回头');
}

// —— resolve / drop / update：只动开放中的线 ——
{
    const runtime = createPlotRuntime();
    runtime.apply([{ op: 'addThread', title: '伽南学院的邀请', detail: '入学试炼的请帖', basis: '第2楼使者登门' }], { today: 2 });
    const notFound = runtime.apply([{ op: 'resolveThread', id: 'f9' }]);
    assert.equal(notFound.rejected[0].reason, 'thread_not_found');
    const resolve = runtime.apply([{ op: 'resolveThread', id: 'f1', outcome: '试炼通过正式入学' }], { today: 9 });
    assert.equal(resolve.status, 'applied');
    const snapshot = runtime.snapshot();
    assert.equal(snapshot.threads[0].status, 'resolved');
    assert.equal(snapshot.threads[0].resolvedDay, 9);
    assert.equal(snapshot.threads[0].outcome, '试炼通过正式入学');
    const again = runtime.apply([{ op: 'dropThread', id: 'f1' }]);
    assert.equal(again.rejected[0].reason, 'thread_not_open', '已回收的线不能再作废');
    // updateThread：推进详情与延期
    runtime.apply([{ op: 'addThread', title: '城东失窃的幕后', basis: '第5楼巡卫盘查' }], { today: 5 });
    const updated = runtime.apply([{ op: 'updateThread', id: 'f2', detail: '线索指向米特尔家族旁支', dueDays: 14 }], { today: 8 });
    assert.equal(updated.status, 'applied');
    const after = runtime.snapshot().threads.find(thread => thread.id === 'f2');
    assert.equal(after.detail, '线索指向米特尔家族旁支');
    assert.equal(after.dueDay, 21, 'updateThread 的 dueDays 从当前天起算');
    const nothing = runtime.apply([{ op: 'updateThread', id: 'f2', detail: '线索指向米特尔家族旁支' }]);
    assert.equal(nothing.rejected[0].reason, 'thread_nothing_to_update');
}

// —— 同楼重 roll：先撤销上一版再落新账 ——
{
    const runtime = createPlotRuntime();
    const first = runtime.apply([
        { op: 'addThread', title: '神秘的玉简', basis: '第3楼' },
        { op: 'setPlan', goal: '查明玉简来历', next: '去找药老请教' },
    ], { source: 'decide', floor: 5, today: 3 });
    assert.equal(first.status, 'applied');
    assert.equal(runtime.snapshot().threads.length, 1);
    // 同一楼重新生成：上一版的线索与计划全部撤销，再执行新指令
    const second = runtime.apply([
        { op: 'addThread', title: '云岚宗的仇', basis: '第3楼退婚' },
        { op: 'setPlan', goal: '应对云岚宗', next: '闭关备战' },
    ], { source: 'decide', floor: 5, today: 3 });
    assert.equal(second.status, 'applied');
    const snapshot = runtime.snapshot();
    assert.equal(snapshot.threads.length, 1, '上一版的线索已撤销');
    assert.equal(snapshot.threads[0].title, '云岚宗的仇');
    assert.equal(snapshot.plan.goal, '应对云岚宗', '上一版的计划已回滚');
    assert.ok(snapshot.log.some(entry => entry.source === 'revert'), '撤销要记进流水');
    // 换楼层：正常追加，不触发撤销
    runtime.apply([{ op: 'addThread', title: '药老的真实身份', basis: '第6楼' }], { source: 'decide', floor: 6, today: 6 });
    assert.equal(runtime.snapshot().threads.length, 2);
}

// —— restore / reset / note / 上限 ——
{
    const runtime = createPlotRuntime();
    runtime.apply([{ op: 'addThread', title: '神秘的玉简', basis: '第3楼' }], { today: 3 });
    const restored = createPlotRuntime();
    restored.restore(runtime.snapshot());
    assert.equal(restored.snapshot().threads[0].title, '神秘的玉简');
    assert.equal(restored.status().threads.open, 1);
    // 恢复后新线索接着旧编号发号
    const next = restored.apply([{ op: 'addThread', title: '云岚宗的仇', basis: '第4楼' }], { today: 4 });
    assert.equal(next.applied[0].id, 'f2');
    // note 只记流水不改账
    const before = restored.snapshot();
    restored.note('模型判断本轮剧情线无变化。', { source: 'decide' });
    const after = restored.snapshot();
    assert.equal(after.threads.length, before.threads.length);
    assert.equal(after.log.length, before.log.length + 1);
    // 开放线索上限：第 13 条开放线被拒（threads_full），回收一条后又能再立
    const capped = createPlotRuntime();
    for (let index = 1; index <= 12; index += 1) {
        const result = capped.apply([{ op: 'addThread', title: `线索乙${index}号`, basis: '测试依据' }], { today: index });
        assert.equal(result.status, 'applied', `第 ${index} 条应立得住`);
    }
    const full = capped.apply([{ op: 'addThread', title: '线索乙13号', basis: '测试依据' }], { today: 13 });
    assert.equal(full.rejected[0].reason, 'threads_full', '开放线索最多 12 条，超了要拒');
    capped.apply([{ op: 'resolveThread', id: 'f1', outcome: '交代清楚' }], { today: 13 });
    const afterResolve = capped.apply([{ op: 'addThread', title: '线索乙13号', basis: '测试依据' }], { today: 13 });
    assert.equal(afterResolve.status, 'applied', '回收一条后空位让出来');
    // reset 清账
    assert.equal(capped.reset().status, 'reset');
    assert.equal(capped.status().threads.total, 0);
}

// —— ops 上限与坏形状：拒绝但不炸 ——
{
    const runtime = createPlotRuntime({ maxOps: 3 });
    const result = runtime.apply([
        { op: 'addThread', title: '线索甲一号', basis: '依据' },
        { op: 'addThread', title: '线索甲二号', basis: '依据' },
        { op: 'addThread', title: '线索甲三号', basis: '依据' },
        { op: 'addThread', title: '线索甲四号', basis: '依据' },
        '垃圾数据',
        null,
        { op: 'unknownThing' },
    ], { today: 2 });
    assert.equal(result.applied.length, 3, '一次最多 3 条，多余的不执行');
    assert.equal(result.rejected.length, 0, '被上限截掉的条目不算被拒');
    const bad = runtime.apply([null, { op: 'unknownThing' }]);
    assert.equal(bad.rejected.length, 2, '坏形状逐条带原因拒绝');
}
