import assert from 'node:assert/strict';
import { createImpactRuntime } from '../impact/impact-runtime.js';
import { createPlotRuntime } from '../plot/plot-runtime.js';
import { createWorldRuntime } from '../world/world-runtime.js';
import { buildWorldOps, defaultEventOf, impactBasis, worldWeightOf, impactMarkHits } from '../impact/impact-executor.js';
import { createImpactExecutor } from '../impact/impact-executor.js';
import { buildWorldInjection } from '../world/world-ops.js';

assert.equal(worldWeightOf('world'), 'major', '世界级影响落到世界台账只能算大事');
assert.equal(worldWeightOf('major'), 'major');
assert.equal(worldWeightOf('minor'), 'minor');

const record = {
    id: 'i3', day: 12, floor: 11, title: '药材涨价', detail: '加列家囤药，城中药材一日三涨', target: '加列家族', kind: 'ripple', weight: 'world',
    certainty: 'certain', links: [{ type: 'faction', name: '加列家族' }, { type: 'person', name: '萧炎' }],
    effects: [
        { type: 'event', title: '药价飞涨', text: '乌坦城药材价格失控', scope: 'world', participants: ['加列家族', '萧炎'] },
        { type: 'info', field: 'reputation', value: '加列家囤积居奇' },
        { type: 'faction', name: '加列家族', stance: 'wary', dynamics: '收紧药材' },
    ],
};

const ops = buildWorldOps(record);
assert.equal(ops.length, 3);
assert.deepEqual(ops[0], { op: 'addEvent', title: '药价飞涨', text: '乌坦城药材价格失控', scope: 'world', participants: ['加列家族', '萧炎'], weight: 'major', basis: '影响#i3' });
assert.equal(impactBasis(record), '影响#i3', '依据写短标记：世界台账的 basis 有长度上限，长 id 会被截断');
assert.deepEqual(ops[1], { op: 'setInfo', field: 'reputation', text: '加列家囤积居奇' });
assert.deepEqual(ops[2], { op: 'setFaction', name: '加列家族', stance: 'wary', dynamics: '收紧药材', basis: '影响#i3' });

const fallback = defaultEventOf({ ...record, effects: [] });
assert.equal(fallback.scope, 'world', '世界级影响默认落世界事件');
assert.deepEqual(fallback.participants, ['萧炎', '加列家族'], '人物牵涉与对象都进参与人');

const rippleOnly = buildWorldOps({ ...record, effects: [], weight: 'minor' });
assert.equal(rippleOnly.length, 1, '涟漪即使没写后果也补一条默认事件');
assert.equal(rippleOnly[0].op, 'addEvent');
assert.equal(rippleOnly[0].scope, 'near');

// 势力动向不带立场时，沿用台账里现有的立场，别把「警惕」压成「中立」
const stanceOps = buildWorldOps(
    { ...record, effects: [{ type: 'faction', name: '云岚宗', dynamics: '盯梢萧家' }] },
    { factionList: [{ name: '云岚宗', stance: 'wary' }] },
);
assert.equal(stanceOps[0].stance, 'wary', '没写立场时沿用台账现有立场');

const direct = buildWorldOps({ ...record, kind: 'direct', weight: 'minor', effects: [], links: [] });
assert.deepEqual(direct, [], '玩家亲手做的小事、又没牵任何势力/地方，就不硬推');
const directLinked = buildWorldOps({ ...record, kind: 'direct', weight: 'minor', effects: [] });
assert.equal(directLinked.length, 1, '亲手做的事只要牵了势力/地方，也要在世界里留一条事件');
assert.equal(directLinked[0].scope, 'near');

// —— 执行器：发酵 → 写世界台账 → 标记应验；重复运行不重复落事件 ——
const world = createWorldRuntime();
const runtime = createImpactRuntime({ autoLatent: true });
const executor = createImpactExecutor({ runtime, world, worldDay: () => 20, maxPerRun: 3 });

const pending = runtime.apply([{
    op: 'record', title: '药价飞涨', detail: '加列家囤药，城中药材一日三涨', target: '加列家族', kind: 'ripple', weight: 'major',
    links: [{ type: 'person', name: '萧炎' }],
    effects: [{ type: 'event', title: '药价飞涨', text: '乌坦城药材价格失控', scope: 'near', participants: ['萧炎'] }],
}], { source: 'decide', floor: 11, day: 10 }).applied[0].record;
assert.equal(executor.pending().length, 0, '光记下账、判定官还没认领，就不往世界里推');

// 判定官撞上场面：落 ripen 之后才进待办。
runtime.apply([{ op: 'ripen', ref: pending.id, detail: '药价终于压不住', hit: '药铺门口吵成一团' }], { source: 'reply', day: 20 });
const latent = runtime.list().find(row => row.id === pending.id);
assert.equal(executor.pending().length, 1);
const run = executor.run({ day: 20 });
assert.equal(run.changed, true);
assert.equal(run.rows.length, 1);
assert.equal(run.rows[0].status, 'materialized');
assert.equal(run.rows[0].impact.applied[0].record.outcomeEventId, 'e1');
const event = world.snapshot().nearEvents.find(item => item.id === 'e1');
assert.ok(event, '世界台账里应出现这条事件');
assert.equal(event.title, '药价飞涨');
assert.equal(event.basis, `影响#${latent.id}`);

const after = runtime.list().find(row => row.id === latent.id);
assert.equal(after.materialized, true);
assert.equal(after.outcomeEventId, 'e1');

const again = executor.run({ day: 20 });
assert.equal(again.changed, false, '同一条影响只推一次');
assert.equal(world.snapshot().nearEvents.length, 1);

// 势力后果只认台账里已有的势力：拿不准就跳过并留提示，不能凭空新建一个势力。
const warnings = [];
const skipped = buildWorldOps(
    { ...record, links: [], effects: [{ type: 'faction', name: '云岚宗', stance: 'wary', dynamics: '收紧药材' }] },
    { withDefaultEvent: false, factionNames: ['加列家族'], warnings },
);
assert.deepEqual(skipped, [], '不存在的势力不落补丁');
assert.equal(warnings.length, 1);
assert.ok(warnings[0].includes('云岚宗'));
const kept = buildWorldOps(
    { ...record, links: [], effects: [{ type: 'faction', name: '加列家族', stance: 'wary', dynamics: '收紧药材' }] },
    { withDefaultEvent: false, factionNames: ['加列家族'], warnings: [] },
);
assert.equal(kept.length, 1, '台账里已有的势力照常改立场');

// 删影响时要能把它落成的世界事件一起撤掉（撤销一致性）。
const removed = executor.rollback(latent);
assert.equal(removed.status, 'removed');
assert.equal(removed.eventId, 'e1');
assert.equal(world.snapshot().nearEvents.some(item => item.id === 'e1'), false, '世界事件应随影响一起撤掉');
assert.equal(executor.rollback({ id: latent.id, materialized: false }).status, 'noop', '没落成过的影响没有可撤的事件');

// 每次最多推 maxPerRun 条：剩下的留在待办里，下一轮继续。
for (let index = 1; index <= 4; index++) {
    runtime.apply([{ op: 'record', title: `第二批${index}`, detail: 'd', target: `城${index}`, kind: 'ripple', weight: 'minor' }], { source: 'manual', day: 24 });
    runtime.apply([{ op: 'ripen', ref: `#i${index + 1}`, detail: `第 ${index} 件事摊开了` }], { source: 'manual', day: 24 });
}
const slow = createImpactExecutor({ runtime, world, worldDay: () => 25, maxPerRun: 1 });
const slowRun = slow.run({ day: 25 });
assert.equal(slowRun.rows.length, 1, '一轮只推一条');
assert.equal(slow.pending(25).length >= 1, true, '其余留在待办');

// 并进同类事件时按“并账前那条事件有没有别家依据”认领：空依据的可以认，
// 别人早挂着依据的不能抢人账，否则删这条影响会把世界台账里别人早就在的事件一起删掉。
const mergeWorld = createWorldRuntime();
mergeWorld.apply([{ op: 'addEvent', scope: 'near', title: '坊市哄抢药材', text: '药材一日三涨，小铺被挤兑', weight: 'minor' }], { source: 'panel', floor: 8 });
const mergeRuntime = createImpactRuntime({ autoLatent: false });
const legacy = mergeRuntime.apply([{ op: 'record', title: '坊市哄抢药材', detail: '药材一日三涨，小铺被挤兑', target: '乌坦城坊市', kind: 'ripple', weight: 'minor' }], { source: 'manual', day: 17 }).applied[0].record;
mergeRuntime.apply([{ op: 'ripen', ref: legacy.id }], { source: 'manual', day: 17 });
const mergeExecutor = createImpactExecutor({ runtime: mergeRuntime, world: mergeWorld, worldDay: () => 17 });
const mergedRun = mergeExecutor.run({ day: 17 });
const merged = mergeRuntime.list().find(item => item.id === legacy.id);
assert.equal(mergedRun.rows[0].status, 'materialized');
assert.equal(merged.outcomeEventId, 'e1', '并进自己名下那条空事件可以认领，但依据得是自己的标记');
assert.equal(mergedRun.rows[0].mergedInto, '');
assert.equal(mergeExecutor.rollback(merged).status, 'removed');

// 但并进“别人的旧事件”就不一样：那条本来挂着别家的依据，认领它等于抢人账，删影响会连带删掉别人的事件。
const foreignWorld = createWorldRuntime();
foreignWorld.apply([{ op: 'addEvent', scope: 'near', title: '坊市哄抢药材', text: '药材一日三涨，小铺被挤兑', weight: 'minor', basis: '承接e9' }], { source: 'panel' });
const foreignRuntime = createImpactRuntime({ autoLatent: false });
const foreign = foreignRuntime.apply([{ op: 'record', title: '坊市哄抢药材', detail: '药材一日三涨，小铺被挤兑', target: '乌坦城坊市', kind: 'ripple', weight: 'minor' }], { source: 'manual', day: 17 }).applied[0].record;
foreignRuntime.apply([{ op: 'ripen', ref: foreign.id }], { source: 'manual', day: 17 });
const foreignExecutor = createImpactExecutor({ runtime: foreignRuntime, world: foreignWorld, worldDay: () => 17 });
const foreignRun = foreignExecutor.run({ day: 17 });
const foreignAfter = foreignRuntime.list().find(item => item.id === foreign.id);
assert.equal(foreignAfter.outcomeEventId, '', '别人早就挂着依据的事件不能算这条影响落成的');
assert.equal(foreignExecutor.rollback(foreignAfter).status, 'noop', '没认领事件就不能删它');
assert.equal(foreignWorld.snapshot().nearEvents.length, 1, '别人的事件还在');

// 玩家把世界事件删了：对账要把“已落成”退回待落成，再跑就重新落一条，而不是永远空转。
const ownedWorld = createWorldRuntime();
const ownedRuntime = createImpactRuntime({ autoLatent: false });
const owned = ownedRuntime.apply([{ op: 'record', title: '药材囤积', detail: '加列家暗中收货', target: '加列家族', kind: 'ripple', weight: 'minor', effects: [{ type: 'event', title: '药材囤积', text: '加列家暗中收货', scope: 'near' }] }], { source: 'manual', day: 17 }).applied[0].record;
ownedRuntime.apply([{ op: 'ripen', ref: owned.id }], { source: 'manual', day: 17 });
const ownedExecutor = createImpactExecutor({ runtime: ownedRuntime, world: ownedWorld, worldDay: () => 17 });
ownedExecutor.run({ day: 17 });
const claimed = ownedRuntime.list().find(item => item.id === owned.id);
assert.equal(claimed.outcomeEventId, 'e1', '自己推出来的事件要记下编号');
ownedWorld.apply([{ op: 'removeEvent', id: 'e1' }], { source: 'panel' });
const reconcile = ownedExecutor.reconcile(17);
assert.equal(reconcile.fixed.length, 1);
assert.equal(reconcile.fixed[0].status, 'reverted');
const reverted = ownedRuntime.list().find(item => item.id === owned.id);
assert.equal(reverted.materialized, false, '事件没了，落成标记跟着退回');
assert.equal(reverted.outcomeEventId, '');
const rerun = ownedExecutor.run({ day: 17 });
assert.equal(rerun.rows[0]?.status, 'materialized', '退回后能重新落成');
assert.equal(ownedRuntime.list().find(item => item.id === owned.id).outcomeEventId !== '', true);
assert.equal(ownedExecutor.reconcile(17).fixed.length, 0, '对账完再对一次是干净的');

// —— 传闻口径：压成传闻的影响落成时按 rumor 分量、不点名参与人 ——
const rumorOps = buildWorldOps({ ...record, certainty: 'rumor', effects: [] });
assert.equal(rumorOps[0].weight, 'rumor', '传闻落成按 rumor 分量');
assert.deepEqual(rumorOps[0].participants, [], '传闻不点名参与人');
assert.ok(rumorOps[0].text.startsWith('（风闻）'), '传闻正文带风闻字样');
const certainOps = buildWorldOps({ ...record, certainty: 'certain', effects: [] });
assert.equal(certainOps[0].weight, 'major');

// —— 剧情线联动：牵涉的线索按影响编号推进，找不到线索就只报警告 ——
const plotRuntime = createPlotRuntime({ now: () => '2026-11-25T00:00:00.000Z' });
const threadId = plotRuntime.apply([{ op: 'addThread', title: '药价飞涨', kind: 'conflict', basis: '坊市囤药', detail: '药价翻倍', dueDays: 10 }], { source: 'decide', today: 10 }).applied[0].id;
const dueBefore = plotRuntime.snapshot().threads.find(item => item.id === threadId).dueDay;
const plotWarnings = [];
const plotOps = buildWorldOps(
    { ...record, effects: [], links: [{ type: 'thread', name: '药价飞涨' }, { type: 'thread', name: '不存在的线索' }] },
    { plot: plotRuntime, warnings: plotWarnings },
);
const threadOps = plotOps.filter(op => op.op === 'applyThread');
assert.equal(threadOps.length, 1, '只推找到的那条线索');
assert.equal(threadOps[0].id, threadId);
assert.equal(threadOps[0].spanDays, -1, '有到期日的线索按天提前');
assert.ok(plotWarnings.some(text => text.includes('不存在的线索')), '找不到的线索要留警告');

const plotExecutor = createImpactExecutor({ runtime: createImpactRuntime({ autoLatent: true }), world: createWorldRuntime(), plot: plotRuntime, worldDay: () => 19, maxPerRun: 3 });
const pr = plotExecutor.run({ day: 19 });
void pr;
const dueAfter = plotRuntime.snapshot().threads.find(item => item.id === threadId).dueDay;
assert.equal(dueAfter, dueBefore, '没有可落成的影响时不动线索');

// —— 剧情账本用「函数」传进来也要能推进 ——
// index.js 里 agentPlotRuntime 声明在执行器之后，只能写成 plot: () => agentPlotRuntime；
// 这条保证那种传法不是空转（曾经写死实例导致落成时 plot 是 undefined，线索永远不动）。
{
    const lazyPlot = createPlotRuntime({ now: () => '2026-11-25T00:00:00.000Z' });
    const lazyId = lazyPlot.apply([{ op: 'addThread', title: '药材断货', kind: 'conflict', basis: '坊市缺货', detail: '药铺挂出缺货牌', dueDays: 9 }], { source: 'decide', today: 12 }).applied[0].id;
    const lazyDue = lazyPlot.snapshot().threads.find(item => item.id === lazyId).dueDay;
    const lazyRuntime = createImpactRuntime({ autoLatent: true });
    const lazyRecord = lazyRuntime.apply([{
        op: 'record', title: '药铺挂出缺货牌', detail: '萧战锁了库房', target: '乌坦城药铺', kind: 'direct', weight: 'major',
        links: [{ type: 'thread', name: '药材断货' }], effects: [{ type: 'event', title: '药铺挂出缺货牌', text: '乌坦城药铺门口挂出缺货牌' }],
    }], { source: 'manual', day: 12, floor: 12 });
    assert.equal(lazyRecord.status, 'applied', `记录应成功：${JSON.stringify(lazyRecord.rejected ?? [])}`);
    const lazyRef = lazyRecord.applied[0].record.id;
    lazyRuntime.apply([{ op: 'ripen', ref: lazyRef }], { source: 'reply', day: 12 });
    const lazyExecutor = createImpactExecutor({ runtime: lazyRuntime, world: createWorldRuntime(), plot: () => lazyPlot, worldDay: () => 12, maxPerRun: 3 });
    const lazyRun = lazyExecutor.run({ day: 12 });
    const lazyRow = lazyRun.rows.find(row => row.id === lazyRef);
    assert.ok(lazyRow, '待落成的影响要被处理');
    assert.equal(lazyRow.status, 'materialized', '落成成功');
    assert.ok(Array.isArray(lazyRow.threadTouched) && lazyRow.threadTouched.length === 1, '函数传参也要推进剧情线');
    assert.equal(lazyPlot.snapshot().threads.find(item => item.id === lazyId).dueDay, lazyDue - 1, '线索到期日提前一天');
}

// 回响：落成时把“推进了哪条剧情线、波及了谁”写进影响自己的 echoes，
// 以后看账本不用再读剧情线 detail 里的字符串反推。
{
    const runtime = createImpactRuntime();
    const world = createWorldRuntime();
    const plot = createPlotRuntime();
    plot.apply([{ op: 'addThread', title: '货栈三株药材', kind: 'foreshadow', detail: '药材压在加列家货栈', basis: '药老随口一提', dueDays: 12 }], { source: 'decide', today: 10 });
    const threadId = plot.snapshot().threads[0].id;
    const executor = createImpactExecutor({ runtime, world, plot, worldDay: () => 10 });
    runtime.apply([{
        op: 'record', title: '断货消息传出', detail: '玩家把缺货的事传到别家', target: '加列家', kind: 'butterfly', weight: 'major',
        links: [{ type: 'thread', name: '货栈三株药材' }, { type: 'person', name: '萧炎' }],
    }], { source: 'manual', day: 10 });
    const impactId = runtime.list({})[0].id;
    runtime.apply([{ op: 'ripen', ref: impactId }], { source: 'reply', day: 10 });
    const row = executor.run({ day: 10 }).rows.find(item => item.id === impactId);
    assert.equal(row.status, 'materialized', '落成成功');
    const stored = runtime.list({})[0].echoes;
    assert.ok(Array.isArray(stored) && stored.length === 2, `回响要存两条：${JSON.stringify(stored)}`);
    assert.equal(stored[0].kind, 'thread');
    assert.equal(stored[0].id, threadId, '剧情线回响带编号');
    assert.match(stored[0].note, /到期第 \d+ 天 → \d+ 天/, '回响里留一句推进到了哪一天');
    assert.equal(stored[1].kind, 'npc');
    assert.equal(stored[1].id, '萧炎', '人物回响带人名');
    // 撤销落成要能一起退回，否则账本挂着一条不存在的推进。
    const snapshot = runtime.snapshot();
    assert.ok(Array.isArray(snapshot.records[0].echoes), '存档里也带着回响');
    assert.equal(snapshot.records[0].echoes.length, 2);
}

// 人物后果（P1）：动到人的那条不写成世界 op，交给人物簿落账；
// 名字不在人物簿里就跳过并留一条警告——绝不凭空给没出现过的人建档。
{
    const runtime = createImpactRuntime();
    const world = createWorldRuntime();
    const record = {
        id: 'i9', day: 8, floor: 7, title: '当街救下萧炎', detail: '玩家在死巷里把萧炎捞了出来', target: '萧炎', kind: 'butterfly', weight: 'major',
        certainty: 'certain',
        effects: [
            { type: 'npc', name: '萧炎', favor: 12, attitude: '把你当救命恩人', note: '死巷里救了他一命' },
            { type: 'npc', name: '路人甲', favor: 5, note: '没这个人' },
        ],
    };
    const warnings = [];
    const ops = buildWorldOps(record, { npcNames: ['萧炎'], warnings });
    assert.equal(ops.filter(op => op.op !== 'applyThread').length, 0, '只有人物后果时不写世界 op');
    assert.equal(ops.npcTouches.length, 1, '只认人物簿里已有的人');
    assert.equal(ops.npcTouches[0].name, '萧炎');
    assert.equal(ops.npcTouches[0].favor, 12);
    assert.equal(ops.npcTouches[0].basis, '影响#i9');
    assert.ok(warnings.some(text => text.includes('路人甲')), '不在人物簿的人要留警告');

    // 落到执行器：row 里带 npcTouches，回响里出现这个人物，且不带“牵涉”以外的重复项。
    const executor = createImpactExecutor({ runtime, world, npcs: () => [{ name: '萧炎' }], worldDay: () => 8 });
    runtime.apply([{
        op: 'record', title: '当街救下萧炎', detail: '玩家在死巷里把萧炎捞了出来', target: '萧炎', kind: 'butterfly', weight: 'major',
        links: [{ type: 'person', name: '萧炎' }],
        effects: [{ type: 'npc', name: '萧炎', favor: 12, note: '死巷里救了他一命' }],
    }], { source: 'manual', day: 8 });
    const id = runtime.list({})[0].id;
    runtime.apply([{ op: 'ripen', ref: id }], { source: 'reply', day: 8 });
    const row = executor.run({ day: 8 }).rows.find(item => item.id === id);
    assert.equal(row.status, 'materialized', '只动到人的影响也要能落成');
    assert.equal(row.npcTouches.length, 1);
    const echoes = runtime.list({})[0].echoes ?? [];
    assert.equal(echoes.filter(item => item.kind === 'npc' && item.id === '萧炎').length, 1, '同一个人只记一条回响');
    assert.match(echoes.find(item => item.kind === 'npc').note ?? '', /救了他一命/, '回响带一句为什么');
}


// 身家后果（P2）：动玩家自己的钱/东西/境界也不写成世界 op，交给纳戒落账。
{
    const runtime = createImpactRuntime();
    const world = createWorldRuntime();
    const record = {
        id: 'i11', day: 9, floor: 8, title: '货栈里摸走一包玄铁片', detail: '玩家顺手把散落的玄铁片收进纳戒', target: '乌坦城货栈', kind: 'direct', weight: 'minor',
        certainty: 'certain',
        effects: [
            { type: 'self', field: 'gold', amount: 120, note: '掌柜给的压惊钱' },
            { type: 'self', field: 'item', name: '玄铁片', count: 2, note: '散在货栈地上' },
        ],
    };
    const ops = buildWorldOps(record, { npcNames: [], warnings: [] });
    assert.equal(ops.filter(op => op.op !== 'applyThread').length, 0, '只有身家后果时不写世界 op');
    assert.equal(ops.selfTouches.length, 2);
    assert.equal(ops.selfTouches[0].field, 'gold');
    assert.equal(ops.selfTouches[0].basis, '影响#i11');
    assert.equal(ops.selfTouches[1].name, '玄铁片');

    // 落到执行器：row 里带 selfTouches，且不会因为“没有世界 op”被默认事件顶掉。
    const executor = createImpactExecutor({ runtime, world, npcs: () => [], worldDay: () => 9 });
    runtime.apply([{
        op: 'record', title: '货栈里摸走一包玄铁片', detail: '玩家顺手把散落的玄铁片收进纳戒', target: '乌坦城货栈', kind: 'direct', weight: 'minor',
        effects: [{ type: 'self', field: 'gold', amount: 120, note: '掌柜给的压惊钱' }],
    }], { source: 'manual', day: 9 });
    const id = runtime.list({})[0].id;
    runtime.apply([{ op: 'ripen', ref: id }], { source: 'reply', day: 9 });
    const row = executor.run({ day: 9 }).rows.find(item => item.id === id);
    assert.equal(row.status, 'materialized', '只动到身家的影响也要能落成');
    assert.equal(row.selfTouches.length, 1);
    assert.equal(row.selfTouches[0].amount, 120);
    const events = world.snapshot().nearEvents ?? [];
    assert.equal(events.length, 0, '有身家后果时不再兜底造一条世界事件');
}

// —— 编号边界匹配：i1 不许认领 i12/i100 的痕迹。裸 includes 在一局超过 10 条影响后全部错账 ——
assert.equal(impactMarkHits('影响#i12', 'i1'), false, '编号后跟数字不算同一条');
assert.equal(impactMarkHits('影响#i100', 'i1'), false, '三位数同理');
assert.equal(impactMarkHits('影响#i1', 'i1'), true);
assert.equal(impactMarkHits('影响#i1。', 'i1'), true, '中文标点算边界');
assert.equal(impactMarkHits('（影响#i1）', 'i1'), true, '括号算边界');
assert.equal(impactMarkHits('世界影响 i1', 'i1'), true, '兼容旧写法');
assert.equal(impactMarkHits('世界影响 i12', 'i1'), false);
assert.equal(impactMarkHits('受「某事」推动，见 影响#i1；', 'i1'), true);
assert.equal(impactMarkHits('随便什么都没有', 'i1'), false);
assert.equal(impactMarkHits('影响#i1', ''), false, '编号为空不匹配');
assert.equal(impactMarkHits('', 'i1'), false);

// —— 人物簿为空时：人物后果一律跳过并留警告。开局人物簿一条没有时最容易凭空建档（脏档重灾区）——
{
    const runtime = createImpactRuntime();
    const world = createWorldRuntime();
    const executor = createImpactExecutor({ runtime, world, npcs: () => [], worldDay: () => 3 });
    runtime.apply([{
        op: 'record', title: '打赏店小二', detail: '玩家赏了小二一锭银子', target: '店小二', kind: 'direct', weight: 'minor',
        effects: [{ type: 'npc', name: '店小二', favor: 5, note: '出手大方' }],
    }], { source: 'manual', day: 3 });
    const id = runtime.list({})[0].id;
    runtime.apply([{ op: 'ripen', ref: id }], { source: 'reply', day: 3 });
    const row = executor.run({ day: 3 }).rows.find(item => item.id === id);
    assert.equal(row.status, 'materialized', '没有人物后果也有身家/世界面可落，不影响其余流程');
    assert.equal(row.npcTouches.length, 0, '人物簿为空时人物后果一律跳过');
    assert.ok(row.warnings.some(text => text.includes('人物')), '空名单拦截要留警告');
}

// —— 处境后果随 npcTouches 出来：落账时折进人物簿的处境格（伤势/位置/在场/在做什么） ——
{
    const runtime = createImpactRuntime();
    const world = createWorldRuntime();
    const executor = createImpactExecutor({ runtime, world, npcs: () => [{ name: '萧战' }], worldDay: () => 4 });
    runtime.apply([{
        op: 'record', title: '云岚宗掳走萧战', detail: '萧战被押往云岚宗', target: '萧战', kind: 'direct', weight: 'major',
        effects: [{ type: 'npc', name: '萧战', favor: -3, injury: '内伤未愈', location: '云岚宗监狱', presence: '不在场', doing: '被囚禁', note: '被掳' }],
    }], { source: 'manual', day: 4 });
    const id = runtime.list({})[0].id;
    runtime.apply([{ op: 'ripen', ref: id }], { source: 'reply', day: 4 });
    const row = executor.run({ day: 4 }).rows.find(item => item.id === id);
    assert.equal(row.status, 'materialized');
    assert.equal(row.npcTouches.length, 1);
    assert.equal(row.npcTouches[0].injury, '内伤未愈');
    assert.equal(row.npcTouches[0].location, '云岚宗监狱');
    assert.equal(row.npcTouches[0].presence, '不在场');
    assert.equal(row.npcTouches[0].doing, '被囚禁');
}

// —— 势力剧变：覆灭带 status 落进世界台账并打注入标记；新建要 founded 明示；覆灭不存在的势力被拦 ——
{
    const runtime = createImpactRuntime();
    const world = createWorldRuntime();
    world.apply([{ op: 'setFaction', name: '加列家族', stance: 'wary' }], { source: 'manual' });
    const executor = createImpactExecutor({ runtime, world, worldDay: () => 9 });
    runtime.apply([{
        op: 'record', title: '乌坦城势力洗牌', detail: '加列家被吞并，商会新立', target: '乌坦城', kind: 'direct', weight: 'major',
        effects: [
            { type: 'faction', name: '加列家族', dissolved: true, dynamics: '被萧家吞并', note: '覆灭' },
            { type: 'faction', name: '乌坦城商会', founded: true, stance: 'neutral', dynamics: '新贵入场', note: '新出现' },
            { type: 'faction', name: '不存在的宗门', dissolved: true, note: '编造' },
        ],
    }], { source: 'manual', day: 9 });
    const id = runtime.list({})[0].id;
    runtime.apply([{ op: 'ripen', ref: id }], { source: 'reply', day: 9 });
    const row = executor.run({ day: 9 }).rows.find(item => item.id === id);
    assert.equal(row.status, 'materialized');
    const dissolved = world.snapshot().factions.find(faction => faction.name === '加列家族');
    assert.equal(dissolved.status, 'dissolved', '覆灭标记落进世界台账');
    assert.ok(dissolved.dissolvedDay, '覆灭日记账');
    assert.ok(world.snapshot().factions.some(faction => faction.name === '乌坦城商会'), 'founded 明示时允许新建势力');
    assert.ok(row.warnings.some(text => text.includes('不存在的宗门')), '覆灭不存在的势力要拦下并警告');
    const injection = buildWorldInjection(world.snapshot(), { maxChars: Infinity });
    assert.match(injection, /已覆灭/, '势力注入要带已覆灭标记，正文不能当活势力写');
}

console.log('impact executor tests passed');
