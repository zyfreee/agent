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
    const small = rt.apply([{ op: 'remember', title: '坊市穆蛇被打跑', text: '穆蛇在坊市被打跑', basis: '第 6 楼', related: ['穆蛇', '坊市'], aliases: ['穆蛇老大'], quote: '把灵石留下，人可以走。' }], { source: 'panel', day: 6 });
    assert.equal(small.status, 'applied');
    const entry = rt.snapshot().entries[0];
    assert.equal(entry.id, 'm1');
    assert.equal(entry.tier, 'small');
    assert.equal(entry.title, '坊市穆蛇被打跑', '短标题原样入库（主页面只显示它）');
    assert.deepEqual(entry.related, ['穆蛇', '坊市']);
    assert.deepEqual(entry.aliases, ['穆蛇老大']);
    assert.equal(entry.quote, '把灵石留下，人可以走。');
    assert.equal(entry.day, 6);
    assert.equal('done' in entry, false, '已了结概念已删除');
    assert.equal('recallCount' in entry, false, '强度统计已删除');
    // 超长标题整条拒绝、缺标题直接拒绝（列表主页只显示标题，新记录不静默截断）
    const longTitle = rt.apply([{ op: 'remember', title: '一二三四五六七八九十甲乙丙丁戊', text: '标题超长的记忆', related: ['药老'] }], { source: 'panel', day: 6 });
    assert.equal(longTitle.status, 'rejected');
    assert.equal(longTitle.rejected[0].reason, 'title_too_long', '超过 14 字的标题整条拒绝，不截断');
    const noTitle = rt.apply([{ op: 'remember', text: '没有标题的记忆', related: ['药老'] }], { source: 'panel', day: 6 });
    assert.equal(noTitle.rejected[0].reason, 'title_missing', '没给 title 的记忆整条拒绝');
    const big = rt.apply([{ op: 'memorize', title: '欠药老一条命', text: '欠药老一条命', basis: '第 3 楼', related: ['药老'], weight: 'major', tag: 'grudge' }], { source: 'panel', day: 3 });
    assert.equal(big.status, 'applied');
    const bigEntry = rt.snapshot().entries.find(item => item.text === '欠药老一条命');
    assert.equal(bigEntry.tier, 'big');
    assert.equal(bigEntry.tag, 'grudge');
    // related 缺失 → 拒绝（没有钥匙的记忆召不回来）；别名救不了空的 related
    assert.equal(rt.apply([{ op: 'remember', text: '没有关联' }]).rejected[0].reason, 'related_missing');
    assert.equal(rt.apply([{ op: 'remember', text: '也没有', aliases: ['别名'] }]).rejected[0].reason, 'related_missing');
    // 同层同文未了结 → 拒绝
    const dup = rt.apply([{ op: 'remember', title: '坊市穆蛇被打跑', text: '穆蛇在坊市被打跑', basis: '又来', related: ['穆蛇'] }], { source: 'panel', day: 7 });
    assert.equal(dup.rejected[0].reason, 'duplicate_text');
    // 大记忆里同文不受小记忆影响（分层去重）
    const crossTier = rt.apply([{ op: 'memorize', title: '坊市穆蛇被打跑', text: '穆蛇在坊市被打跑', basis: '升级记', related: ['穆蛇'] }], { source: 'panel', day: 7 });
    assert.equal(crossTier.status, 'applied');
    // 文本超长 / 关联超量 / 坏 day / 引文截断
    assert.equal(rt.apply([{ op: 'remember', text: 'x'.repeat(301), related: ['a'] }]).status, 'rejected');
    assert.equal(rt.apply([{ op: 'remember', text: 'ok', related: ['一', '二', '三', '四', '五'] }]).status, 'rejected');
    assert.equal(rt.apply([{ op: 'remember', title: '坏日', text: 'ok', related: ['a'], day: 0 }]).status, 'rejected');
    const capped = rt.apply([{ op: 'remember', title: '引文测试', text: '引文测试', related: ['a'], quote: '长'.repeat(80) }], { source: 'panel', day: 7 });
    assert.equal(capped.status, 'applied');
    assert.equal(rt.snapshot().entries.at(-1).quote.length, 60);
    const noted = rt.apply([{ op: 'remember', title: '备注落账', text: '备注落账', related: ['a'], note: '细'.repeat(250) }], { source: 'panel', day: 7 });
    assert.equal(noted.status, 'applied');
    assert.equal(rt.snapshot().entries.at(-1).note.length, 200, 'note 落账且截到 200');
}

// 2. promote：小转大（可顺带补标签）；undo 供同楼重 roll
{
    const rt = createMemoryRuntime({ now: NOW });
    rt.apply([{ op: 'remember', title: '掌柜藏着血莲', text: '掌柜藏着血莲', basis: '第 8 楼', related: ['坊市掌柜'] }], { source: 'panel', day: 8 });
    const promoted = rt.apply([{ op: 'promote', id: 'm1', tag: 'intel' }], { source: 'panel', day: 9 });
    assert.equal(promoted.status, 'applied');
    let entry = rt.snapshot().entries[0];
    assert.equal(entry.tier, 'big');
    assert.equal(entry.tag, 'intel');
    assert.equal(rt.apply([{ op: 'promote', id: 'm1' }], { source: 'panel' }).rejected[0].reason, 'entry_already_big');
    // 手动 promote 照常可用（大记忆收紧只限模型通道）
    rt.apply([{ op: 'remember', title: '一条新小记忆', text: '一条新小记忆', related: ['某地'] }], { source: 'panel', day: 10 });
    rt.apply([{ op: 'promote', id: 'm2' }], { source: 'panel' });
    assert.equal(rt.snapshot().entries[1].tier, 'big');
}

// 2b. 大记忆收紧：模型通道 memorize 降级为小记忆、promote 停用；手动不受限
{
    const rt = createMemoryRuntime({ now: NOW });
    const down = rt.apply([{ op: 'memorize', title: '决定想记的大事', text: '决定想记的大事', basis: '第 1 楼', related: ['某人'], weight: 'major', tag: 'grudge' }], { source: 'decide', day: 2 });
    assert.equal(down.status, 'applied');
    let entry = rt.snapshot().entries[0];
    assert.equal(entry.tier, 'small', 'decide 通道的 memorize 应降级为小记忆');
    assert.equal(entry.weight, 'major', '降级保留分量');
    const retire = rt.apply([{ op: 'promote', id: entry.id }], { source: 'decide', day: 3 });
    assert.equal(retire.status, 'rejected');
    assert.equal(retire.rejected[0].reason, 'promote_retired');
    assert.equal(rt.snapshot().entries[0].tier, 'small', 'decide 通道的 promote 应被拒');
    // llm 通道（降级指令块）同样受限
    const viaGuide = rt.apply([{ op: 'memorize', title: '指令块想记的大事', text: '指令块想记的大事', related: ['某地'] }], { source: 'llm', day: 4 });
    assert.equal(viaGuide.status, 'applied');
    assert.equal(rt.snapshot().entries[1].tier, 'small', 'llm 通道的 memorize 也应降级');
}

// 2c. consolidate：小记忆整批转化成一条大记忆，钥匙保全，原条目退役
{
    const rt = createMemoryRuntime({ now: NOW });
    rt.apply([
        { op: 'remember', title: '穆蛇拦路被赶跑', text: '穆蛇拦路被赶跑', basis: '第 2 楼', related: ['穆蛇', '坊市'], quote: '把灵石留下。' },
        { op: 'remember', title: '坊市掌柜藏着血莲', text: '坊市掌柜藏着血莲', basis: '第 4 楼', related: ['坊市掌柜'], aliases: ['掌柜'] },
        { op: 'remember', title: '云岚宗弟子进城', text: '云岚宗弟子进城', basis: '第 5 楼', related: ['云岚宗'] },
    ], { source: 'panel', day: 5 });
    const before = rt.snapshot().entries.map(entry => entry.id);
    const result = rt.consolidate({
        ids: before,
        big: { title: '坊市风波初起', text: '穆蛇拦路、掌柜藏莲、云岚宗弟子进城——坊市这几天不太平', related: ['穆蛇'], weight: 'major', tag: 'thread' },
        day: 6,
    });
    assert.equal(result.ok, true, `consolidate 应成功：${result.reason ?? ''}`);
    const snapshot = rt.snapshot();
    assert.equal(snapshot.entries.length, 1, '三条小记忆应退役成一条大记忆');
    const big = snapshot.entries[0];
    assert.equal(big.tier, 'big');
    assert.equal(big.id, result.id);
    assert.equal(big.weight, 'major');
    assert.equal(big.tag, 'thread');
    assert.ok(big.related.includes('穆蛇'), '模型选的钥匙优先');
    // 召回钥匙一张不丢：related 优先填满（≤4），溢出的落别名——related 与别名在召回里同权。
    const keys = [...big.related, ...big.aliases];
    for (const key of ['穆蛇', '坊市', '坊市掌柜', '掌柜', '云岚宗']) {
        assert.ok(keys.includes(key), `召回钥匙 ${key} 应保全在 related+aliases 里（实际 related=${big.related.join('、')} 别名=${big.aliases.join('、')}）`);
    }
    assert.ok(big.related.length <= 4 && big.aliases.length <= 4, 'related/aliases 各自不超上限');
    assert.ok(snapshot.log.some(item => item.source === 'consolidate'), '总结要写进流水');
    // 失败路径（用独立小账本，免得消费完后没有小记忆可指）：没文本、id 不存在、同文重复
    const rt2 = createMemoryRuntime({ now: NOW });
    rt2.apply([{ op: 'remember', title: '一条小记忆', text: '一条小记忆', related: ['某地'] }], { source: 'panel', day: 1 });
    assert.equal(rt2.consolidate({ ids: ['m1'], big: { text: '', related: ['a'] } }).reason, 'text_missing');
    assert.equal(rt2.consolidate({ ids: ['不存在'], big: { text: 'y', related: ['a'] } }).reason, 'nothing_to_consolidate');
    const first = rt2.consolidate({ ids: ['m1'], big: { title: '总结成的大记忆', text: '总结成的大记忆', related: ['某地'] }, day: 2 });
    assert.equal(first.ok, true);
    // 退役登记：删除/并入的编号进 retiredIds（数据库存储帧重放复活这些行时，收养守卫靠它认出僵尸）
    assert.ok(rt2.snapshot().retiredIds.includes('m1'), '并入的小记忆应进退役登记');
    const rt3 = createMemoryRuntime({ now: NOW });
    rt3.apply([{ op: 'remember', title: '要删的一条', text: '要删的一条', related: ['某地'] }], { source: 'panel', day: 1 });
    rt3.apply([{ op: 'forgetMemory', id: 'm1' }], { source: 'panel' });
    assert.ok(rt3.snapshot().retiredIds.includes('m1'), '忘记的记忆应进退役登记');
    rt3.restore(rt3.snapshot());
    assert.ok(rt3.snapshot().retiredIds.includes('m1'), 'restore 后退役登记仍在');
    // 撤销删除＝解除退役登记
    rt3.apply([{ op: '_restoreEntry', entry: { id: 'm1', tier: 'small', text: '要删的一条', related: ['某地'], day: 1 } }], { source: 'panel' });
    assert.ok(!rt3.snapshot().retiredIds.includes('m1'), '恢复记忆应解除退役登记');
    assert.equal(rt2.consolidate({ ids: [], big: { text: '总结成的大记忆', related: ['a'] } }).reason, 'nothing_to_consolidate');
    rt2.apply([{ op: 'remember', title: '又一条小记忆', text: '又一条小记忆', related: ['别处'] }], { source: 'panel', day: 3 });
    const small2 = rt2.snapshot().entries.find(entry => entry.tier === 'small');
    assert.equal(rt2.consolidate({ ids: [small2.id], big: { title: '总结成的大记忆', text: '总结成的大记忆', related: ['别处'] } }).reason, 'duplicate_text');
}

// OPT-050C: a capacity-failed undo must not partially replace a model floor.
{
    const rt = createMemoryRuntime({ now: NOW });
    const tail = Array.from({ length: 199 }, (_, i) => [String(10 + i * 2), String(10 + i * 2)]);
    rt.restore({ entries: [{ id: 'm2', text: '待撤销删除' }], retiredIds: [], retiredSeqRanges: [['1', '1'], ['3', '3'], ...tail.slice(0, 198)], externalRetiredIds: [] });
    rt.apply([{ op: 'forgetMemory', id: 'm2', opId: 'delete' }], { source: 'decide', floor: 9 });
    rt.apply([{ op: '_restoreEntry', entry: { id: 'm406', text: '补满容量' } }], { source: 'panel' });
    rt.apply([{ op: 'forgetMemory', id: 'm406' }], { source: 'panel' });
    const before = rt.snapshot();
    const retry = rt.apply([], { source: 'decide', floor: 9, day: 99 });
    assert.equal(retry.status, 'rejected');
    assert.equal(retry.rejected[0].reason, 'rollback_failed');
    assert.deepEqual(rt.snapshot(), before, 'failed floor rollback is atomic');
    assert.deepEqual(rt.apply([{ op: 'forgetMemory', id: 'm2', opId: 'delete' }], { source: 'panel' }).duplicate, ['delete'], 'failed undo does not release opId');
    rt.apply([{ op: 'remember', title: '日期未变', text: '日期未变', related: ['某地'] }], { source: 'panel' });
    assert.equal(rt.snapshot().entries.at(-1).day, 1, 'rejected rollback does not change hidden current day');
}

// OPT-050B: mutations retain all tombstones, enforce capacity atomically, undo splits exactly.
{
    const rt = createMemoryRuntime({ now: NOW });
    const add = label => rt.apply([{ op: 'remember', title: label, text: label, related: ['某地'] }], { source: 'panel' }).applied[0].id;
    for (let i = 0; i < 201; i++) rt.apply([{ op: 'forgetMemory', id: add(`记忆${i}`) }], { source: 'panel' });
    rt.restore(JSON.parse(JSON.stringify(rt.snapshot())));
    assert.equal(rt.isRetired('m1'), true, 'oldest tombstone survives201 retirements/reload');
    assert.deepEqual(rt.snapshot().retiredSeqRanges, [['1', '201']]);
    assert.equal(rt.snapshot().retiredIds.length, 200, 'bounded compatibility ring unchanged');
    assert.equal(rt.status().legacy_gap, false);
    rt.apply([{ op: '_restoreEntry', entry: { id: 'm100', text: '撤销中间删除' } }], { source: 'panel' });
    assert.deepEqual(rt.snapshot().retiredSeqRanges, [['1', '99'], ['101', '201']]);
    assert.equal(rt.isRetired('m100'), false);
    assert.equal(rt.isRetired('m99'), true);
    rt.apply([{ op: 'forgetMemory', id: 'm100' }], { source: 'panel' });
    assert.deepEqual(rt.snapshot().retiredSeqRanges, [['1', '201']], 'retiring middle merges ranges');
    rt.restore({ entries: [{ id: 'm001', text: '外部编号', tier: 'small' }], retiredIds: [], retiredSeqRanges: [['1', '1']], externalRetiredIds: [] });
    rt.apply([{ op: 'forgetMemory', id: 'm001' }], { source: 'panel' });
    assert.equal(rt.isRetired('m1'), true);
    assert.equal(rt.isRetired('m001'), true);
    rt.apply([{ op: '_restoreEntry', entry: { id: 'm001', text: '恢复外部' } }], { source: 'panel' });
    assert.equal(rt.isRetired('m1'), true, 'external undo never clears canonical tombstone');
    assert.equal(rt.isRetired('m001'), false);

    const fullRanges = Array.from({ length: 200 }, (_, i) => [String(i * 2 + 1), String(i * 2 + 1)]);
    rt.restore({ entries: [{ id: 'm500', text: '不能删除', title: '小事', related: ['某地'], tier: 'small' }], retiredIds: [], retiredSeqRanges: fullRanges, externalRetiredIds: [] });
    let before = rt.snapshot();
    assert.equal(rt.apply([{ op: 'forgetMemory', id: 'm500' }], { source: 'panel' }).rejected[0].reason, 'capacity_exceeded');
    assert.deepEqual(rt.snapshot(), before);
    assert.equal(rt.consolidate({ ids: ['m500'], big: { title: '总结', text: '总结正文', related: ['某地'] } }).reason, 'capacity_exceeded');
    assert.deepEqual(rt.snapshot(), before);
    rt.restore({ entries: [{ id: 'external-new', text: '外部满额' }], retiredIds: [], retiredSeqRanges: [], externalRetiredIds: Array.from({ length: 200 }, (_, i) => `external-${i}`) });
    before = rt.snapshot();
    assert.equal(rt.apply([{ op: 'forgetMemory', id: 'external-new' }], { source: 'panel' }).rejected[0].reason, 'capacity_exceeded');
    assert.deepEqual(rt.snapshot(), before);
    rt.restore({ entries: [], retiredIds: [], retiredSeqRanges: [['1', '3'], ...fullRanges.slice(1).map(pair => pair.map(n => String(BigInt(n) + 10n)))], externalRetiredIds: [] });
    before = rt.snapshot();
    assert.equal(rt.apply([{ op: '_restoreEntry', entry: { id: 'm2', text: '不能分裂' } }], { source: 'panel' }).rejected[0].reason, 'capacity_exceeded');
    assert.deepEqual(rt.snapshot(), before, 'undo cannot overflow by splitting into201 ranges');
}

// OPT-050A: bounded exact tombstone metadata, conservative legacy diagnostics and restore.
{
    const rt = createMemoryRuntime({ now: NOW });
    assert.equal(rt.status().legacy_gap, false);
    rt.restore({ entries: [], retiredIds: ['m1', 'm3', 'm001'] });
    assert.equal(rt.status().legacy_gap, true, 'missing metadata cannot prove historical completeness');
    assert.equal(rt.isRetired('m1'), true);
    assert.equal(rt.isRetired('m2'), false, 'never invent lower missing retirements');
    assert.equal(rt.isRetired('m001'), true, 'noncanonical ID is exact, not sequence1');
    assert.deepEqual(rt.snapshot().retiredSeqRanges, [['1', '1'], ['3', '3']]);
    assert.deepEqual(rt.snapshot().externalRetiredIds, ['m001']);
    rt.restore(JSON.parse(JSON.stringify(rt.snapshot())));
    assert.equal(rt.status().legacy_gap, true, 'legacy diagnostic survives save/reload');
    rt.restore({ entries: [], retiredIds: [], retiredSeqRanges: [['8', '9'], ['1', '3'], ['3', '7']], externalRetiredIds: ['m001'] });
    assert.deepEqual(rt.snapshot().retiredSeqRanges, [['1', '9']], 'sort and merge adjacent ranges exactly');
    assert.equal(rt.isRetired('m5'), true);
    assert.equal(rt.isRetired('m01'), false);
    for (const id of [null, undefined, {}, { toString: () => 'm1' }, [], 1, 'm1\n', ' m1']) assert.equal(rt.isRetired(id), false, 'public lookup requires exact string identity');
    assert.equal(rt.apply([{ op: 'remember', title: '高水位', text: '高水位', related: ['某地'] }], { source: 'panel' }).applied[0].id, 'm10');
    const before = rt.snapshot();
    for (const bad of [
        { retiredSeqRanges: [['0', '1']], externalRetiredIds: [] },
        { retiredSeqRanges: [['3', '2']], externalRetiredIds: [] },
        { retiredSeqRanges: [[1, 2]], externalRetiredIds: [] },
        { retiredSeqRanges: [['01', '2']], externalRetiredIds: [] },
        { retiredSeqRanges: Array.from({ length: 201 }, (_, i) => [String(i * 2 + 1), String(i * 2 + 1)]), externalRetiredIds: [] },
        { retiredSeqRanges: [], externalRetiredIds: Array.from({ length: 201 }, (_, i) => `external-${i}`) },
    ]) {
        assert.equal(rt.restore(bad).status, 'rejected', 'invalid/overcapacity restore is fail-closed');
        assert.deepEqual(rt.snapshot(), before, 'failed restore is atomic');
    }
}

// OPT-043: never retire a source whose recall keys do not fit the bounded result.
{
    const rt = createMemoryRuntime({ now: NOW });
    const keys = Array.from({ length: 9 }, (_, i) => `钥匙${i + 1}`);
    rt.apply(keys.slice(0, 8).map(key => ({ op: 'remember', title: key, text: key, related: [key] })), { source: 'panel' });
    rt.apply([{ op: 'remember', title: keys[8], text: keys[8], related: [keys[8]] }], { source: 'panel' });
    const ids = rt.snapshot().entries.map(entry => entry.id);
    const before = rt.snapshot();
    const overflow = rt.consolidate({ ids, big: { title: '九把钥匙', text: '九条旧事', related: [keys[0]] } });
    assert.equal(overflow.reason, 'recall_keys_overflow', 'reject rather than silently retire ninth recall key');
    assert.deepEqual(rt.snapshot(), before, 'failed consolidation is fully atomic, including log and tombstones');
    const result = rt.consolidate({ ids: ids.slice(0, 7), big: { title: '七条旧事', text: '七条合并', related: [keys[0]], aliases: ['新别名', '新别名'] } });
    assert.equal(result.ok, true);
    const retained = [...result.entry.related, ...result.entry.aliases];
    assert.deepEqual(new Set(retained), new Set([...keys.slice(0, 7), '新别名']));
    assert.equal(rt.snapshot().entries.some(entry => entry.id === ids[8]), true, 'unconsumed overflow source remains');
    rt.restore(JSON.parse(JSON.stringify(rt.snapshot())));
    assert.ok(rt.snapshot().entries.find(entry => entry.id === result.id).aliases.includes('新别名'), 'model alias survives reload');
    const current = rt.snapshot();
    assert.equal(rt.consolidate({ ids: [ids[7], ids[8]], big: { title: '重复钥匙', text: '重复钥匙合并', related: [keys[7], keys[7]], aliases: [keys[8], keys[8]] } }).ok, true);
    assert.equal(current.entries.length - rt.snapshot().entries.length, 1);
}

// OPT-017: restore reserves retired/live identities and repairs only absent/duplicate IDs.
{
    const add = (rt, label, op = 'remember') => rt.apply([{ op, title: label, text: label, related: ['钥匙'] }], { source: 'panel' }).applied[0].id;
    for (const kind of ['remember', 'memorize']) {
        const rt = createMemoryRuntime({ now: NOW });
        const id = add(rt, '删除最高号', kind);
        rt.apply([{ op: 'forgetMemory', id }], { source: 'panel' });
        rt.restore(JSON.parse(JSON.stringify(rt.snapshot())));
        assert.equal(add(rt, '恢复后新增', kind), 'm2', 'retired highest ID must not be reused after empty restore');
    }
    const rt = createMemoryRuntime({ now: NOW });
    const source = add(rt, '源小记忆');
    const big = rt.consolidate({ ids: [source], big: { title: '总结', text: '总结正文', related: ['钥匙'] } });
    rt.apply([{ op: 'forgetMemory', id: big.id }], { source: 'panel' });
    rt.restore(JSON.parse(JSON.stringify(rt.snapshot())));
    assert.equal(add(rt, '总结删除后新增'), 'm3');

    rt.restore({ entries: [
        { text: '缺号', related: ['甲'] },
        { id: 'm1', text: '原号', related: ['乙'] },
        { id: 'm1', text: '重复号', related: ['丙'] },
        { id: 'custom-99', text: '外部号', related: ['丁'] },
    ], retiredIds: ['m8'] });
    const restored = rt.snapshot().entries;
    assert.equal(restored[1].id, 'm1', 'reserve later explicit ID before repairing missing ID');
    assert.equal(restored[3].id, 'custom-99', 'preserve unique external ID');
    assert.deepEqual(restored.map(entry => entry.text), ['缺号', '原号', '重复号', '外部号']);
    assert.equal(new Set(restored.map(entry => entry.id)).size, 4, 'no duplicate restored identities');
    assert.ok(restored.every(entry => !rt.snapshot().retiredIds.includes(entry.id)));
    assert.equal(add(rt, '清洗后新增'), 'm11', 'only generated m<digits> participates in sequence');
    rt.restore({ entries: [{ id: 'm9007199254740993', text: '大编号' }], retiredIds: ['m9007199254740995', 'custom123456789'] });
    assert.equal(add(rt, '大编号后新增'), 'm9007199254740996', 'decimal identity must remain exact above safe integer');
    rt.restore(JSON.parse(JSON.stringify(rt.snapshot())));
    assert.equal(add(rt, '再次新增'), 'm9007199254740997');
    rt.reset();
    rt.apply([{ op: '_restoreEntry', entry: { id: 'm30', text: '显式撤销恢复' } }], { source: 'panel' });
    assert.equal(add(rt, '内部恢复后新增'), 'm31');
}

// 3. forget：删除与退役登记，无任何自动过期；了结概念已删
{
    const rt = createMemoryRuntime({ now: NOW });
    rt.apply([{ op: 'memorize', title: '云韵留了半句话', text: '云韵留了半句话', basis: '第 9 楼', related: ['云韵'], tag: 'thread' }], { source: 'panel', day: 9 });
    // 天数大跨步也不会动它——没有过期机制
    rt.apply([{ op: 'remember', title: '随便一条', text: '随便一条', related: ['某地'] }], { source: 'panel', day: 300 });
    assert.equal(rt.snapshot().entries[0].text, '云韵留了半句话', '天数跨步不清账');
    rt.apply([{ op: 'forgetMemory', id: 'm1' }], { source: 'panel', day: 300 });
    assert.equal(rt.snapshot().entries.length, 1);
    assert.ok(rt.snapshot().log.at(-1).summaries[0].includes('忘记大记忆'));
    assert.equal(rt.apply([{ op: 'nope' }]).rejected[0].reason, 'unknown_op');
    // 了结/重开操作已随概念删除：按未知操作拒绝
    assert.equal(rt.apply([{ op: 'resolveMemory', id: 'm2' }]).rejected[0].reason, 'unknown_op');
    assert.equal(rt.apply([{ op: 'reopenMemory', id: 'm2' }]).rejected[0].reason, 'unknown_op');
}

// 4. opId 去重
{
    const rt = createMemoryRuntime({ now: NOW });
    const ops = [{ op: 'remember', title: '一次就好', text: '一次就好', related: ['某地'], opId: 'batch-1' }];
    assert.equal(rt.apply(ops, { source: 'panel', day: 1 }).status, 'applied');
    const second = rt.apply(ops, { source: 'panel', day: 1 });
    assert.equal(second.status, 'noop');
    assert.equal(second.duplicate.length, 1);
}

// OPT-046: rollback releases only successfully reverted opIds of the same model floor.
for (const source of ['llm', 'decide']) {
    const rt = createMemoryRuntime({ now: NOW });
    const op = { op: 'remember', title: '稳定操作', text: '稳定操作', related: ['某地'], opId: 'stable' };
    rt.apply([op], { source, floor: 1 });
    const retry = rt.apply([op], { source, floor: 1 });
    assert.equal(retry.status, 'applied', 'same-floor retry must reapply after rollback');
    assert.equal(rt.snapshot().entries.length, 1);
    rt.apply([op], { source, floor: 1 });
    assert.equal(rt.snapshot().entries.length, 1, 'repeated rerolls keep exactly one version');
    const replacement = { ...op, opId: 'replacement', title: '新版', text: '新版' };
    rt.apply([replacement], { source, floor: 1 });
    assert.deepEqual(rt.snapshot().entries.map(entry => entry.text), ['新版']);
    const cross = rt.apply([replacement], { source, floor: 2 });
    assert.deepEqual(cross.duplicate, ['replacement'], 'cross-floor replay stays idempotent');
    assert.equal(rt.snapshot().entries.length, 1);
    rt.apply([{ ...op, opId: 'panel', text: '面板新增' }], { source: 'panel' });
    const another = { ...op, opId: 'another', text: '下一版' };
    rt.apply([another], { source, floor: 3 });
    const replaced = rt.apply([{ ...op, opId: 'panel', text: '面板重复' }, another], { source, floor: 3 });
    assert.deepEqual(replaced.duplicate, ['panel'], 'rollback must not release unrelated panel IDs');
    assert.equal(rt.snapshot().entries.length, 3);
    const id = rt.snapshot().entries[0].id;
    const forget = { op: 'forgetMemory', id, opId: 'forget' };
    rt.apply([forget], { source, floor: 4 });
    assert.equal(rt.apply([forget], { source, floor: 4 }).status, 'applied', 'undo and redo of same forget ID stays deleted');
    assert.equal(rt.snapshot().entries.some(entry => entry.id === id), false);
}

// 5. 账本无上限：超过老上限（60）也一条不丢，status 只报总数
{
    const rt = createMemoryRuntime({ maxOps: 32, now: NOW });
    for (let round = 0; round < 5; round += 1) {
        const ops = Array.from({ length: 13 }, (_, index) => {
            const n = round * 13 + index + 1;
            return { op: 'remember', title: `记忆${n}`, text: `记忆${n}`, related: [`地${n}`] };
        });
        rt.apply(ops, { source: 'panel', day: 1 });
    }
    const snapshot = rt.snapshot();
    assert.equal(snapshot.entries.length, 65, '无上限：65 条全保留');
    const status = rt.status();
    assert.equal(status.total, 65);
    assert.equal(status.byTier.small.total, 65);
    assert.equal(status.byTier.big.total, 0);
    assert.equal('open' in status, false, 'status 不再有 open/了结口径');
}

// 6. restore / reset / note：编号续接、坏数据清洗、已删概念的字段不复活（坏 tier 回落 big）
{
    const rt = createMemoryRuntime({ now: NOW });
    rt.apply([{ op: 'remember', title: '存量小记忆', text: '存量小记忆', related: ['旧地'] }], { source: 'panel', day: 2 });
    const other = createMemoryRuntime({ now: NOW });
    other.restore(rt.snapshot());
    const added = other.apply([{ op: 'remember', title: '新小记忆', text: '新小记忆', related: ['新地'] }], { source: 'panel', day: 3 });
    assert.equal(added.applied[0].id, 'm2', 'restore 后编号续接不撞号');
    // 老存档里的 done/resolvedDay/recallCount 字段（已删除的概念）恢复时整体丢弃
    other.restore({ entries: [{ text: 'x'.repeat(400), tier: '坏层', related: Array(9).fill('名'), quote: '长'.repeat(99), done: true, resolvedDay: 9, recallCount: 99999, lastRecallDay: 8 }], });
    const cleaned = other.snapshot().entries;
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].tier, 'big', '坏层级回落大记忆');
    assert.equal(cleaned[0].text.length, 300);
    assert.equal(cleaned[0].related.length, 4);
    assert.equal(cleaned[0].quote.length, 60);
    assert.equal('done' in cleaned[0], false, '老 done 字段不复活');
    assert.equal('recallCount' in cleaned[0], false, '老强度字段不复活');
    other.reset();
    assert.equal(other.snapshot().entries.length, 0);
    other.note('书记官判断无新记忆', { source: 'decide' });
    assert.equal(other.snapshot().log.length, 1);
}

// —— 删楼联动：该楼记忆删除、后续楼层前移、回滚指针作废、已删楼的重roll不再误撤 ——
{
    const rt = createMemoryRuntime({ now: NOW });
    rt.apply([{ op: 'remember', title: '客栈清点', text: '主角清点钱袋身无分文', related: ['钱袋'], basis: '第 4 楼' }], { source: 'decide', floor: 3, day: 1 });
    rt.apply([{ op: 'remember', title: '药铺购丹', text: '主角花两枚金币买回气丹', related: ['回气丹'], basis: '第 5 楼' }], { source: 'decide', floor: 4, day: 1 });
    rt.apply([{ op: 'remember', title: '拍卖场鉴丹', text: '主角到拍卖场请人鉴丹', related: ['拍卖场'], basis: '第 6 楼' }], { source: 'decide', floor: 5, day: 1 });
    let snap = rt.snapshot();
    assert.ok(snap.entries.every(entry => Number.isInteger(entry.floor) && entry.floor >= 3), 'decide 落账的条目要记来源楼层');
    assert.equal(snap.entries.find(e => e.title === '客栈清点').floor, 3);
    const dropped = rt.dropFloor(3);
    assert.equal(dropped.status, 'applied');
    assert.equal(dropped.removed, 1, '被删楼的记忆跟着删');
    assert.equal(dropped.shifted, 2, '后续依据楼层前移');
    snap = rt.snapshot();
    assert.equal(snap.entries.find(e => e.title === '客栈清点'), undefined);
    assert.equal(snap.entries.find(e => e.title === '药铺购丹').floor, 3);
    assert.equal(snap.entries.find(e => e.title === '拍卖场鉴丹').floor, 4);
    // 无该楼记忆、无楼层引用 → noop，不写流水
    const noop = rt.dropFloor(40);
    assert.equal(noop.status, 'noop');
    // 同楼重roll替换链仍然成立：floor 4 重记先撤再记
    const rerun = rt.apply([{ op: 'remember', title: '拍卖场验丹', text: '主角到拍卖场验丹成色', related: ['拍卖场'], basis: '第 5 楼' }], { source: 'decide', floor: 4, day: 1 });
    assert.equal(rerun.status, 'applied');
    snap = rt.snapshot();
    assert.equal(snap.entries.find(e => e.title === '拍卖场鉴丹'), undefined, '旧版记忆被替换');
    assert.ok(snap.entries.find(e => e.title === '拍卖场验丹'));
}

// —— 手改序号：manual/面板 apply 与手动总结递增，模型落账（llm/decide）与 auto 总结不动。 ——
{
    const rt = createMemoryRuntime({ now: NOW });
    assert.equal(rt.manualVersion(), 0, '初始手改序号为 0');
    rt.apply([{ op: 'remember', title: '模型记的', text: '模型记的账', related: ['模型'] }], { source: 'llm', floor: 3 });
    assert.equal(rt.manualVersion(), 0, '模型落账不计手改');
    rt.apply([{ op: 'remember', title: '手记的', text: '面板手记的账', related: ['手记'] }], { source: 'manual', day: 6 });
    assert.equal(rt.manualVersion(), 1, '手改递增');
    rt.consolidate({ ids: rt.snapshot().entries.filter(e => e.tier === 'small').slice(0, 1).map(e => e.id), big: { text: '自动总结的大记忆', title: '自动总结', related: ['总结'] } });
    assert.equal(rt.manualVersion(), 1, 'auto 总结不计手改');
    rt.consolidate({ ids: rt.snapshot().entries.filter(e => e.tier === 'small').slice(0, 1).map(e => e.id), big: { text: '手动总结的大记忆内容', title: '手动总结', related: ['手动'] }, source: 'manual' });
    assert.equal(rt.manualVersion(), 2, '手动总结递增');
    const restored = createMemoryRuntime({ now: NOW });
    restored.restore(rt.snapshot());
    assert.equal(restored.manualVersion(), 2, '存档往返保留手改序号');
}
console.log('memory runtime tests passed');
