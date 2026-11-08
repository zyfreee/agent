import assert from 'node:assert/strict';
import test from 'node:test';
import {
    LITE_SETTLE_PROMPT, buildLiteSettlePrompt, LITE_SETTLE_JSON_SCHEMA, parseLiteSettleReply, buildLiteSettleUser, createLiteSettle,
} from './lite-settle.js';
import { parseDecision } from '../world/world-decide.js';
import { parseImpactDecision } from '../impact/impact-decide.js';
import { parseSelfDecision } from '../self/self-decide.js';
import { parseDecision as parseMemoryDecision } from '../memory/memory-decide.js';
import { parseNpcRecordReply } from '../npc/npc-recorder.js';

// 五个分节用真解析器路由：lite 输出的每一节必须被对应单路解析器原样接受。
const parsers = {
    world: parseDecision, impact: parseImpactDecision, self: parseSelfDecision,
    memory: parseMemoryDecision, npc: parseNpcRecordReply,
};

const GOOD_REPLY = JSON.stringify({
    note: '战斗与记账',
    npc: { 人物: [{ 姓名: '萧战', 好感: 2, 流水: '主持会议' }] },
    world: { note: '过了半日', ops: [{ op: 'advance', minutes: 30 }] },
    impact: { note: '药材涨价发酵', ops: [{ op: 'ripen', ref: 'i1', detail: '涨价传开' }] },
    self: { note: '买入凝骨草', ops: [{ op: 'addItem', name: '凝骨草', category: '材料', count: 2 }] },
    memory: { note: '记下采购', ops: [{ op: 'remember', title: '坊市买凝骨草', text: '在坊市买到凝骨草两株', basis: '本轮正文', related: ['坊市', '凝骨草'] }] },
});

test('prompt assembles only the ledgers whose gate is on', () => {
    const full = buildLiteSettlePrompt();
    assert.match(full, /第一册·人物/);
    assert.match(full, /第五册·记忆/);
    assert.match(full, /五本账一次记完/);
    const noMemory = buildLiteSettlePrompt({ memory: false });
    assert.doesNotMatch(noMemory, /第五册·记忆/);
    assert.match(noMemory, /四本账一次记完/);
    assert.doesNotMatch(noMemory, /"memory"/, '关掉的账连输出键都不出现');
    assert.equal(buildLiteSettlePrompt({ npc: false, world: false, impact: false, self: false, memory: false }), '', '全关返回空串，那次调用整轮不发');
    assert.equal(LITE_SETTLE_PROMPT, buildLiteSettlePrompt(), '默认导出＝全开');
    assert.ok(LITE_SETTLE_JSON_SCHEMA.required.includes('memory'));
});

test('parse splits the merged reply into per-ledger sections', () => {
    const parsed = parseLiteSettleReply(GOOD_REPLY);
    assert.equal(parsed.status, 'ok');
    assert.equal(parsed.note, '战斗与记账');
    assert.deepEqual(Object.keys(parsed.sections).sort(), ['impact', 'memory', 'npc', 'self', 'world']);
    // 每一节送进对应单路解析器都必须能解析：这是 lite 与完整版落账口径一致的关键。
    assert.equal(parsers.world(JSON.stringify(parsed.sections.world)).ops.length, 1);
    assert.equal(parsers.impact(JSON.stringify(parsed.sections.impact)).ops[0].op, 'ripen');
    assert.equal(parsers.self(JSON.stringify(parsed.sections.self)).ops[0].op, 'addItem');
    assert.equal(parsers.memory(JSON.stringify(parsed.sections.memory)).ops[0].title, '坊市买凝骨草');
    assert.equal(parsers.npc(JSON.stringify(parsed.sections.npc)).patches[0].姓名, '萧战');
    const partial = parseLiteSettleReply('{"note":"只有世界","world":{"ops":[]}}');
    assert.equal(partial.status, 'ok');
    assert.deepEqual(Object.keys(partial.sections), ['world']);
    assert.equal(parseLiteSettleReply('没有JSON').status, 'invalid');
    assert.equal(parseLiteSettleReply('{"note":"空的"}').status, 'invalid', '一个分节都没有按无效处理');
});

test('user message carries only the open ledgers with the clock and chat tail', () => {
    const user = buildLiteSettleUser({
        floors: [{ role: '玩家', text: '买药材' }, { role: '角色', text: '掌柜报价' }], day: 7,
        bookLines: ['12|人物|萧炎|主角'],
        npcLines: ['萧战|在场|重要|好感10'], worldBlock: '第7天·乌坦城',
        impactLines: ['i1|第6天|minor|未了结|direct|药材涨价：坊市'], selfBlock: '金币 100',
        memoryLines: ['m1|小|旧事'], consolidateLines: ['m2|小|待整合'],
    });
    assert.match(user, /第 7 天/);
    assert.match(user, /萧战\|在场\|重要\|好感10/);
    assert.match(user, /第7天·乌坦城/);
    assert.match(user, /i1\|第6天/);
    assert.match(user, /金币 100/);
    assert.match(user, /待整合/);
    assert.match(user, /【最近聊天记录（旧 → 新，共 2 楼/);
    // 关掉人物与记忆：整段现状块和输出键都消失
    const trimmed = buildLiteSettleUser({
        floors: [{ role: '玩家', text: '买药材' }], day: 7,
        npcLines: ['萧战|在场|重要|好感10'], selfBlock: '金币 100',
        memoryLines: ['m1|小|旧事'], consolidateLines: ['m2|小|待整合'],
        sections: { npc: false, memory: false },
    });
    assert.doesNotMatch(trimmed, /人物簿现状/);
    assert.doesNotMatch(trimmed, /现有记忆清单/);
    assert.doesNotMatch(trimmed, /待整合/);
    assert.doesNotMatch(trimmed, /"npc"/);
    assert.doesNotMatch(trimmed, /"memory"/);
    assert.match(trimmed, /请把世界、影响、纳戒本账一次记完/);
});

function harness({ reply = GOOD_REPLY, continuation = true, mode = () => 'lite', floor = 3, available = () => true, gates } = {}) {
    const calls = { completes: [], statuses: [], persists: [], audits: [], refreshes: [] };
    let current = continuation;
    const chat = [
        { is_user: true, mes: '买药材' }, { mes: '掌柜报价' }, { is_user: true, mes: '成交' }, { mes: '正文' },
    ];
    const deps = {
        mode, getContext: () => ({ chat }), lastReplyIndex: list => floor, capture: () => ({ current: () => current }),
        available, worldDay: () => 7, gates,
        floorsMax: () => 6, entriesMax: () => 8,
        complete: async args => { calls.completes.push(args); return reply; },
        overrides: () => ({ connection: 'tavern' }),
        factsIndex: { stats: () => ({ total: 1 }), matchTokens: () => [{ uid: 12 }], get: uid => ({ uid, category: '人物', name: '萧炎', summary: '主角' }) },
        sandboxActive: () => false, volumeOf: () => 1,
        npc: {
            list: () => [{ name: '萧战', presence: true, importance: '重要', favor: 10 }],
            parse: parsers.npc,
            apply: (patches, context) => { calls.npcApply = { patches, context }; return { status: 'applied', created: ['新人物'], changed: 1, skipped: [] }; },
            persist: () => calls.persists.push('npc'), refresh: () => calls.refreshes.push('npc'),
            status: text => calls.statuses.push(['npc', text]),
        },
        world: {
            parse: parsers.world, snapshotText: () => '第7天·乌坦城',
            apply: (ops, context) => { calls.worldApply = { ops, context }; return { applied: [{ summary: '时间推进' }], rejected: [] }; },
            note: () => {}, persist: () => calls.persists.push('world'), refresh: () => calls.refreshes.push('world'),
            status: text => calls.statuses.push(['world', text]),
        },
        impact: {
            parse: parsers.impact, records: () => [{ id: 'i1', day: 6, weight: 'minor', status: '未了结', kind: 'direct', title: '药材涨价', detail: '坊市' }],
            apply: (ops, context) => { calls.impactApply = { ops, context }; return { applied: [{ summary: '发酵' }], rejected: [], due: [] }; },
            note: () => {}, persist: () => calls.persists.push('impact'), refresh: () => calls.refreshes.push('impact'),
            status: text => calls.statuses.push(['impact', text]),
        },
        self: {
            parse: parsers.self, snapshot: () => ({ gold: 100 }),
            baselineForFloor: () => null, snapshotText: snapshot => `金币 ${snapshot.gold}`,
            apply: (ops, context) => { calls.selfApply = { ops, context }; return { applied: [{ summary: '入袋' }], rejected: [] }; },
            note: () => {}, persist: () => calls.persists.push('self'), refresh: () => calls.refreshes.push('self'),
            status: text => calls.statuses.push(['self', text]),
        },
        memory: {
            settings: () => ({ consolidateAfter: 0 }), snapshot: () => ({ entries: [{ id: 'm1', tier: 'small', day: 3, title: '旧事' }] }),
            parse: parsers.memory, capOps: (ops, max) => ({ ops: ops.slice(0, max) }),
            apply: (ops, context) => { calls.memoryApply = { ops, context }; return { applied: [{ summary: '记下' }], rejected: [] }; },
            consolidate: args => { calls.consolidate = args; return { ok: true, summary: '已整合' }; },
            note: () => {}, persist: () => calls.persists.push('memory'), refresh: () => calls.refreshes.push('memory'),
            status: text => calls.statuses.push(['memory', text]), consolidateStatus: () => {},
        },
        runConsolidation: () => { calls.consolidationRun = true; },
        onNpcCreated: names => { calls.npcCreated = names; },
        audit: note => calls.audits.push(note),
    };
    const api = createLiteSettle(deps);
    return { api, calls, deps, chat, setCurrent: value => { current = value; }, setFloorText: text => { chat[floor] = { mes: text }; } };
}

test('one merged call routes all five sections through their own runtimes', async () => {
    const h = harness();
    const result = await h.api.run({ source: 'auto' });
    assert.equal(result.status, 'ok');
    assert.equal(h.calls.completes.length, 1);
    assert.equal(h.calls.completes[0].label, '总结算');
    assert.match(h.calls.completes[0].system, /第五册·记忆/, 'system 按全开闸门组装');
    assert.match(h.calls.completes[0].user, /第7天·乌坦城/);
    assert.match(h.calls.completes[0].user, /萧战\|在场/);
    assert.deepEqual(h.calls.npcApply.context, { source: '正文', floor: 3, day: 7, replay: false });
    assert.equal(h.calls.worldApply.ops[0].op, 'advance');
    assert.equal(h.calls.worldApply.context.floor, 3);
    assert.equal(h.calls.impactApply.ops[0].ref, 'i1');
    assert.equal(h.calls.impactApply.context.day, 7);
    assert.equal(h.calls.selfApply.ops[0].name, '凝骨草');
    assert.deepEqual(h.calls.memoryApply.ops, [{ op: 'remember', title: '坊市买凝骨草', text: '在坊市买到凝骨草两株', basis: '本轮正文', related: ['坊市', '凝骨草'] }], '记忆侧只收前 1 条');
    assert.equal(h.calls.persists.length, 5, '五本账各自持久化');
    assert.ok(h.calls.statuses.length >= 5);
    assert.deepEqual(h.calls.npcCreated, ['新人物'], '新人物照样触发世界书补录');
    assert.ok(h.calls.consolidationRun, '记忆决定后的自动总结钩子保留');
    assert.deepEqual(h.calls.audits, ['战斗与记账']);
    assert.equal((await h.api.run({ source: 'auto' })).status, 'already_decided', '同楼同正文不重算');
    assert.equal(h.calls.completes.length, 1);
});

test('same-floor reroll with changed reply passes replay to the npc ledger', async () => {
    const h = harness();
    await h.api.run({ source: 'auto' });
    h.setFloorText('正文改写版');
    await h.api.run({ source: 'auto' });
    assert.equal(h.calls.completes.length, 2, '重roll后重新总结算');
    assert.equal(h.calls.npcApply.context.replay, true, '同楼重记先撤上一份人物贡献');
});

test('a broken section never blocks the other four ledgers', async () => {
    const broken = JSON.stringify({
        note: '人物节坏掉',
        npc: '不是对象，直接丢',
        world: { note: '过了半日', ops: [{ op: 'advance', minutes: 30 }] },
        impact: { ops: [{ op: 'record', title: '药材涨价', detail: '坊市断货', target: '坊市', weight: 'minor', certainty: 'certain', evidence: '第3楼' }] },
        self: { ops: [{ op: 'addGold', amount: 50 }] },
        memory: { ops: [{ op: 'remember', title: '买药', text: '买到凝骨草', basis: '本轮正文', related: ['凝骨草'] }] },
    });
    const h = harness({ reply: broken });
    const result = await h.api.run({ source: 'auto' });
    assert.equal(result.status, 'ok');
    assert.match(String(result.report.npc), /absent|invalid/);
    assert.equal(h.calls.worldApply.ops.length, 1, '其余四本账照常落账');
    assert.equal(h.calls.impactApply.ops[0].op, 'record');
    assert.equal(h.calls.selfApply.ops[0].amount, 50);
    assert.equal(h.calls.memoryApply.ops[0].title, '买药');
});

test('stale continuation after the model wait applies nothing at all', async () => {
    const h = harness({ continuation: false });
    h.setCurrent(true);
    const task = h.api.run({ source: 'auto' });
    h.setCurrent(false);
    const result = await task;
    assert.equal(result.status, 'stale');
    assert.equal(h.calls.worldApply, undefined);
    assert.equal(h.calls.npcApply, undefined);
    assert.equal(h.calls.persists.length, 0);
});

test('model or connection failures report failed and skip every ledger', async () => {
    const h = harness({ reply: '中途断流' });
    const result = await h.api.run({ source: 'auto' });
    assert.equal(result.status, 'invalid');
    assert.equal(h.calls.worldApply, undefined);
    const unavailable = harness({ reply: GOOD_REPLY, available: () => false });
    assert.equal((await unavailable.api.run({ source: 'auto' })).status, 'not_configured');
});

test('consolidate candidates merge the fresh small memory into the same call', async () => {
    const reply = JSON.stringify({
        note: '顺带整合',
        npc: { 人物: [] }, world: { ops: [] }, impact: { ops: [] }, self: { ops: [] },
        memory: { note: '记下并整合', ops: [{ op: 'remember', title: '买药', text: '买到凝骨草', basis: '本轮正文', related: ['凝骨草'] }],
            consolidate: { ids: ['m9'], title: '坊市进货', text: '坊市进货一线', related: ['坊市'] } },
    });
    const h = harness({ reply });
    h.deps.memory.settings = () => ({ consolidateAfter: 2 });
    h.deps.memory.snapshot = () => ({ entries: [{ id: 'm9', tier: 'small', day: 2, title: '待整合' }] });
    await h.api.run({ source: 'auto' });
    assert.ok(h.calls.consolidate, '阈值到了才整合');
    assert.deepEqual(h.calls.consolidate.ids, ['m9'], '新落账的小记忆由工厂并入（本例正文楼层没有新增 small）');
    assert.equal(h.calls.consolidate.big.title, '坊市进货');
});

test('feature switches gate their own section: off means never recorded', async () => {
    // 人物簿与世界两路关着：总结算照常调用，但只有 impact/self/memory 三本账落账。
    const gates = { npc: () => false, world: () => false, impact: () => true, self: () => true, memory: () => true };
    const h = harness({ gates });
    const result = await h.api.run({ source: 'auto' });
    assert.equal(result.status, 'ok');
    assert.equal(result.report.npc, 'disabled');
    assert.equal(result.report.world, 'disabled');
    assert.equal(h.calls.npcApply, undefined, '关掉的功能不落账');
    assert.equal(h.calls.worldApply, undefined);
    assert.equal(h.calls.impactApply.ops[0].ref, 'i1', '开着的照常落账');
    assert.equal(h.calls.selfApply.ops[0].name, '凝骨草');
    assert.equal(h.calls.memoryApply.ops[0].title, '坊市买凝骨草');
    assert.equal(h.calls.persists.length, 3, '只持久化开着的账本');
    // 关掉的账：提示词里不带现状块，也不带输出键
    assert.doesNotMatch(h.calls.completes[0].system, /第一册·人物/, 'system 不带关掉的字典');
    assert.doesNotMatch(h.calls.completes[0].user, /人物簿现状/, 'user 不带关掉的现状');
    assert.doesNotMatch(h.calls.completes[0].user, /"npc"/, '输出键里没有关掉的账');
    assert.match(h.calls.completes[0].system, /第三册·影响/, '开着的照常在');
    // 五路全关：整次调用都不必发。
    const allOff = harness({ gates: { npc: () => false, world: () => false, impact: () => false, self: () => false, memory: () => false } });
    assert.equal((await allOff.api.run({ source: 'auto' })).status, 'disabled');
    assert.equal(allOff.calls.completes.length, 0);
});

test('gates can be passed as a function returning the map (wiring form)', async () => {
    // 接线里传的是 liteSettleGates 函数本身：工厂必须现调它拿映射，否则 every() 恒真恒 disabled。
    const h = harness({ gates: () => ({ npc: () => true, world: () => true, impact: () => true, self: () => true, memory: () => true }) });
    const result = await h.api.run({ source: 'auto' });
    assert.equal(result.status, 'ok');
    assert.equal(h.calls.npcApply.patches[0].姓名, '萧战');
    const offFn = harness({ gates: () => ({ npc: () => false, world: () => false, impact: () => false, self: () => false, memory: () => false }) });
    assert.equal((await offFn.api.run({ source: 'auto' })).status, 'disabled');
    assert.equal(offFn.calls.completes.length, 0);
});

test('function gates are re-read on every run: toggling a switch lands on the next round', async () => {
    // 线上形态：index.js 只建一次工厂，liteSettleGates() 的返回值随启用开关实时变。
    // 门控若在创建时把布尔快照死，开关就永远管不到总结算（实机抓到的回归）。
    let gateMap = { npc: true, world: true, impact: true, self: true, memory: true };
    const h = harness({ gates: () => ({ ...gateMap }) });
    await h.api.run({ source: 'auto' });
    assert.ok(h.calls.memoryApply, '全开时记忆照记');
    // 模拟用户关掉人物簿与记忆召回后重 roll：下一轮就要按新门控裁剪。
    gateMap = { npc: false, world: true, impact: true, self: true, memory: false };
    h.setFloorText('正文改写版');
    const second = await h.api.run({ source: 'auto' });
    assert.equal(second.status, 'ok');
    assert.equal(second.report.npc, 'disabled', '关掉的人物分路按关闭算');
    assert.equal(second.report.memory, 'disabled', '关掉的记忆分路按关闭算');
    assert.match(second.report.world, /^(applied|empty)/, '开着的照常结算');
    assert.doesNotMatch(h.calls.completes[1].system, /第一册·人物/, 'system 不带关掉的字典');
    assert.doesNotMatch(h.calls.completes[1].system, /第五册·记忆/, 'system 不带关掉的字典');
    assert.doesNotMatch(h.calls.completes[1].user, /"npc"/, '输出键里没有人物');
    assert.doesNotMatch(h.calls.completes[1].user, /"memory"/, '输出键里没有记忆');
    assert.match(h.calls.completes[1].system, /第三册·影响/, '开着的照常在');
    assert.equal(h.calls.persists.length, 8, '第二轮只持久化 world/impact/self 三本（5+3）');
});

test('full mode never enters the merged settle', async () => {
    const h = harness({ mode: () => 'full' });
    assert.equal((await h.api.run({ source: 'auto' })).status, 'disabled');
    assert.equal(h.calls.completes.length, 0);
});
