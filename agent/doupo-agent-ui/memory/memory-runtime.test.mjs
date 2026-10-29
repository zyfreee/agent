import assert from 'node:assert/strict';
import { createMemoryRuntime, TIER_LABELS, TAG_LABELS } from './memory-runtime.js';

const NOW = () => '2026-10-29T00:00:00.000Z';

// 两层固定：小记忆/大记忆，永不自动过期
assert.deepEqual(Object.keys(TIER_LABELS), ['small', 'big']);
assert.deepEqual(Object.values(TIER_LABELS), ['小记忆', '大记忆']);
assert.deepEqual(Object.values(TAG_LABELS), ['恩怨', '情报', '伏笔', '大事记']);

// 1. remember / memorize：编号、related 必填（召回钥匙）、quote/aliases、去重
{
    const rt = createMemoryRuntime({ now: NOW });
    const small = rt.apply([{ op: 'remember', text: '穆蛇在坊市被打跑', basis: '第 6 楼', related: ['穆蛇', '坊市'], aliases: ['穆蛇老大'], quote: '把灵石留下，人可以走。' }], { source: 'panel', day: 6 });
    assert.equal(small.status, 'applied');
    const entry = rt.snapshot().entries[0];
    assert.equal(entry.id, 'm1');
    assert.equal(entry.tier, 'small');
    assert.deepEqual(entry.related, ['穆蛇', '坊市']);
    assert.deepEqual(entry.aliases, ['穆蛇老大']);
    assert.equal(entry.quote, '把灵石留下，人可以走。');
    assert.equal(entry.day, 6);
    assert.equal(entry.recallCount, 0);
    assert.equal(entry.lastRecallDay, null);
    const big = rt.apply([{ op: 'memorize', text: '欠药老一条命', basis: '第 3 楼', related: ['药老'], weight: 'major', tag: 'grudge' }], { source: 'panel', day: 3 });
    assert.equal(big.status, 'applied');
    assert.equal(rt.snapshot().entries[1].tier, 'big');
    assert.equal(rt.snapshot().entries[1].tag, 'grudge');
    // related 缺失 → 拒绝（没有钥匙的记忆召不回来）；别名救不了空的 related
    assert.equal(rt.apply([{ op: 'remember', text: '没有关联' }]).rejected[0].reason, 'related_missing');
    assert.equal(rt.apply([{ op: 'remember', text: '也没有', aliases: ['别名'] }]).rejected[0].reason, 'related_missing');
    // 同层同文未了结 → 拒绝
    const dup = rt.apply([{ op: 'remember', text: '穆蛇在坊市被打跑', basis: '又来', related: ['穆蛇'] }], { source: 'panel', day: 7 });
    assert.equal(dup.rejected[0].reason, 'duplicate_text');
    // 大记忆里同文不受小记忆影响（分层去重）
    const crossTier = rt.apply([{ op: 'memorize', text: '穆蛇在坊市被打跑', basis: '升级记', related: ['穆蛇'] }], { source: 'panel', day: 7 });
    assert.equal(crossTier.status, 'applied');
    // 文本超长 / 关联超量 / 坏 day / 引文截断
    assert.equal(rt.apply([{ op: 'remember', text: 'x'.repeat(301), related: ['a'] }]).status, 'rejected');
    assert.equal(rt.apply([{ op: 'remember', text: 'ok', related: ['一', '二', '三', '四', '五'] }]).status, 'rejected');
    assert.equal(rt.apply([{ op: 'remember', text: 'ok', related: ['a'], day: 0 }]).status, 'rejected');
    const capped = rt.apply([{ op: 'remember', text: '引文测试', related: ['a'], quote: '长'.repeat(80) }], { source: 'panel', day: 7 });
    assert.equal(capped.status, 'applied');
    assert.equal(rt.snapshot().entries.at(-1).quote.length, 60);
}

// 1½. markRecalled：召回记账（排练效应），不写流水
{
    const rt = createMemoryRuntime({ now: NOW });
    rt.apply([{ op: 'remember', text: '一条会被想起的记忆', related: ['某地'] }], { source: 'panel', day: 5 });
    const logBefore = rt.snapshot().log.length;
    const marked = rt.markRecalled(['m1'], { day: 9 });
    assert.equal(marked.touched, 1);
    let entry = rt.snapshot().entries[0];
    assert.equal(entry.recallCount, 1);
    assert.equal(entry.lastRecallDay, 9);
    rt.markRecalled(['m1'], { day: 12 });
    entry = rt.snapshot().entries[0];
    assert.equal(entry.recallCount, 2);
    assert.equal(entry.lastRecallDay, 12);
    assert.equal(rt.snapshot().log.length, logBefore, '召回记账不追加指令流水');
    assert.equal(rt.markRecalled(['不存在的']).touched, 0);
}

// 2. promote：小转大（可顺带补标签）；undo 供同楼重 roll
{
    const rt = createMemoryRuntime({ now: NOW });
    rt.apply([{ op: 'remember', text: '掌柜藏着血莲', basis: '第 8 楼', related: ['坊市掌柜'] }], { source: 'panel', day: 8 });
    const promoted = rt.apply([{ op: 'promote', id: 'm1', tag: 'intel' }], { source: 'panel', day: 9 });
    assert.equal(promoted.status, 'applied');
    let entry = rt.snapshot().entries[0];
    assert.equal(entry.tier, 'big');
    assert.equal(entry.tag, 'intel');
    assert.equal(rt.apply([{ op: 'promote', id: 'm1' }]).rejected[0].reason, 'entry_already_big');
    // 同楼重 roll：撤销 promote
    rt.apply([{ op: 'remember', text: '一条新小记忆', related: ['某地'] }], { source: 'decide', floor: 10, day: 10 });
    rt.apply([{ op: 'promote', id: 'm2' }], { source: 'decide', floor: 11, day: 10 });
    assert.equal(rt.snapshot().entries[1].tier, 'big');
    rt.apply([{ op: 'remember', text: '换个说法的小记忆', related: ['某地'] }], { source: 'decide', floor: 11, day: 10 });
    assert.equal(rt.snapshot().entries[1].tier, 'small', '同楼重 roll 应撤销 promote');
}

// 3. resolve / reopen / forget：了结与重开，无任何自动过期
{
    const rt = createMemoryRuntime({ now: NOW });
    rt.apply([{ op: 'memorize', text: '云韵留了半句话', basis: '第 9 楼', related: ['云韵'], tag: 'thread' }], { source: 'panel', day: 9 });
    rt.apply([{ op: 'resolveMemory', id: 'm1', note: '她把话说完了' }], { source: 'panel', day: 15 });
    let entry = rt.snapshot().entries[0];
    assert.equal(entry.done, true);
    assert.equal(entry.resolvedDay, 15);
    assert.equal(entry.note, '她把话说完了');
    // 天数大跨步也不会动它——没有过期机制
    rt.apply([{ op: 'remember', text: '随便一条', related: ['某地'] }], { source: 'panel', day: 300 });
    entry = rt.snapshot().entries[0];
    assert.equal(entry.done, true, '已了结只由了结造成');
    assert.equal(entry.note, '她把话说完了');
    rt.apply([{ op: 'reopenMemory', id: 'm1' }]);
    assert.equal(rt.snapshot().entries[0].done, false);
    rt.apply([{ op: 'forgetMemory', id: 'm1' }], { source: 'panel', day: 300 });
    assert.equal(rt.snapshot().entries.length, 1);
    assert.ok(rt.snapshot().log.at(-1).summaries[0].includes('忘记大记忆'));
    assert.equal(rt.apply([{ op: 'nope' }]).rejected[0].reason, 'unknown_op');
}

// 4. opId 去重
{
    const rt = createMemoryRuntime({ now: NOW });
    const ops = [{ op: 'remember', text: '一次就好', related: ['某地'], opId: 'batch-1' }];
    assert.equal(rt.apply(ops, { source: 'panel', day: 1 }).status, 'applied');
    const second = rt.apply(ops, { source: 'panel', day: 1 });
    assert.equal(second.status, 'noop');
    assert.equal(second.duplicate.length, 1);
}

// 5. 上限清理：已了结先走、小记忆先走、一般先走、最老先走（runtime 下限 10）
{
    const rt = createMemoryRuntime({ maxEntries: 10, maxOps: 12, now: NOW });
    const ops = [{ op: 'memorize', text: '关键大记忆', weight: 'major', related: ['甲'] }];
    for (let day = 2; day <= 10; day++) ops.push({ op: 'remember', text: `小记忆${day}`, related: [`地${day}`] });
    rt.apply(ops, { source: 'panel', day: 1 });
    assert.equal(rt.snapshot().entries.length, 10);
    rt.apply([{ op: 'resolveMemory', id: 'm2' }], { source: 'panel', day: 2 }); // 小记忆2 已了结
    rt.apply([{ op: 'remember', text: '进一条目', related: ['新地'] }], { source: 'panel', day: 11 });
    let texts = rt.snapshot().entries.map(entry => entry.text);
    assert.equal(texts.length, 10);
    assert.ok(!texts.includes('小记忆2'), '已了结的最先被清');
    rt.apply([{ op: 'remember', text: '进二条目', related: ['新地'] }], { source: 'panel', day: 12 });
    texts = rt.snapshot().entries.map(entry => entry.text);
    assert.ok(!texts.includes('小记忆3'), '最老的小记忆先清');
    assert.ok(texts.includes('关键大记忆'), '大记忆保到最后');
}

// 6. restore / reset / note：编号续接、坏数据清洗、召回统计随存档走（坏 tier 回落 big）
{
    const rt = createMemoryRuntime({ now: NOW });
    rt.apply([{ op: 'remember', text: '存量小记忆', related: ['旧地'] }], { source: 'panel', day: 2 });
    rt.markRecalled(['m1'], { day: 3 });
    const other = createMemoryRuntime({ now: NOW });
    other.restore(rt.snapshot());
    const added = other.apply([{ op: 'remember', text: '新小记忆', related: ['新地'] }], { source: 'panel', day: 3 });
    assert.equal(added.applied[0].id, 'm2', 'restore 后编号续接不撞号');
    assert.equal(other.snapshot().entries[0].recallCount, 1, '召回统计随存档保留');
    other.restore({ entries: [{ text: 'x'.repeat(400), tier: '坏层', related: Array(9).fill('名'), quote: '长'.repeat(99), recallCount: 99999, lastRecallDay: 8 }], });
    const cleaned = other.snapshot().entries;
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].tier, 'big', '坏层级回落大记忆');
    assert.equal(cleaned[0].text.length, 300);
    assert.equal(cleaned[0].related.length, 4);
    assert.equal(cleaned[0].quote.length, 60);
    assert.equal(cleaned[0].recallCount, 9999, '召回次数夹到上限');
    other.reset();
    assert.equal(other.snapshot().entries.length, 0);
    other.note('书记官判断无新记忆', { source: 'decide' });
    assert.equal(other.snapshot().log.length, 1);
}
