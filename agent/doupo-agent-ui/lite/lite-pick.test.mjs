import assert from 'node:assert/strict';
import test from 'node:test';
import {
    LITE_PICK_PROMPT, parseLitePickReply, impactPickLines, buildLitePickUser, createLitePick, collectFloors,
} from './lite-pick.js';

test('parse accepts the merged three-bucket reply and clamps each bucket', () => {
    const parsed = parseLitePickReply('{"note":"按场景挑","facts":[3,"3",5],"impact":["i1","i1","i9"],"memory":["m1"]}');
    assert.equal(parsed.status, 'ok');
    assert.deepEqual(parsed.facts, ['3', '5'], '编号去重并统一成字符串');
    assert.deepEqual(parsed.impact, ['i1', 'i9']);
    assert.deepEqual(parsed.memory, ['m1']);
    assert.equal(parsed.note, '按场景挑');
    const empty = parseLitePickReply('{"note":"这轮都没得挑","facts":[],"impact":[],"memory":[]}');
    assert.equal(empty.status, 'ok');
    assert.deepEqual(empty.facts, []);
    const broken = parseLitePickReply('这不是JSON');
    assert.equal(broken.status, 'invalid');
    assert.ok(broken.error);
});

test('impact pick lines keep id, day, weight, status and title-detail on one line', () => {
    const lines = impactPickLines([
        { id: 'i3', day: 4, weight: 'major', status: '未了结', title: '药材库被烧', detail: '城中药材涨价' },
        { id: 'i4', title: '无详情', detail: '' },
    ]);
    assert.equal(lines[0], 'i3|第4天|major|未了结|药材库被烧：城中药材涨价');
    assert.equal(lines[1], 'i4|minor|未了结|无详情');
});

test('user message carries input, clock and the three candidate sections', () => {
    const user = buildLitePickUser({
        input: '去坊市买药材', day: 5,
        floors: [{ role: '玩家', text: '去坊市买药材' }, { role: '角色', text: '坊市人声鼎沸' }],
        factsLines: ['12|人物|萧炎|主角'], impactLines: ['i1|第4天|minor|未了结|药材涨价'], memoryCatalog: '- m1|小|坊市遇旧（坊市）',
    });
    assert.match(user, /【本轮玩家输入】\n去坊市买药材/);
    assert.match(user, /第 5 天/);
    assert.match(user, /12\|人物\|萧炎\|主角/);
    assert.match(user, /i1\|第4天\|minor\|未了结\|药材涨价/);
    assert.match(user, /m1\|小\|坊市遇旧/);
    assert.match(user, /"facts":\[…\],"impact":\[…\],"memory":\[…\]/);
});

test('collectFloors walks newest-first and returns oldest-first without system floors', async () => {
    const floors = await collectFloors([
        { is_user: true, mes: '问' }, { is_system: true, mes: 'sys' }, { mes: '答' }, { is_user: true, mes: '再问' },
    ], 2);
    assert.deepEqual(floors.map(floor => floor.text), ['答', '再问']);
    assert.deepEqual(floors.map(floor => floor.role), ['角色', '玩家']);
});

test('factory runs one merged call per round key and shares it across consumers', async () => {
    let key = 'A';
    const calls = [], failures = [];
    const pick = createLitePick({
        mode: () => 'lite',
        keyOf: () => key,
        worldDay: () => 5,
        factsIndex: { stats: () => ({ total: 1 }), matchTokens: () => [{ uid: 12 }], get: uid => ({ uid, category: '人物', name: '萧炎', summary: '主角' }) },
        sandboxActive: () => false,
        volumeOf: () => 1,
        impactRecords: () => [{ id: 'i1', day: 4, weight: 'minor', status: '未了结', title: '药材涨价', detail: '坊市' }],
        memorySnapshot: () => ({ entries: [{ id: 'm1', tier: 'small', day: 3, title: '坊市遇旧', related: ['坊市'] }] }),
        maxFloors: () => 4, maxEntries: () => 8,
        complete: async args => { calls.push(args); return '{"note":"挑好了","facts":[12],"impact":["i1"],"memory":["m1"]}'; },
        overrides: () => ({ connection: 'tavern' }),
        onFailure: (channel, reason) => failures.push([channel, reason]),
    });
    assert.deepEqual(await pick.run({ chat: [{ is_user: true, mes: '问' }] }), await pick.run({ chat: [{ is_user: true, mes: '问' }] }), '同键复用同一结果');
    assert.equal(calls.length, 1, '一轮只发一次合并调用');
    assert.equal(calls[0].label, '素材总挑选');
    assert.match(calls[0].user, /12\|人物\|萧炎\|主角/);
    assert.match(calls[0].user, /i1\|第4天/);
    key = 'B';
    const second = await pick.run({ chat: [{ is_user: true, mes: '新输入' }] });
    assert.equal(second.status, 'ok');
    assert.equal(calls.length, 2, '轮次变了重新调用');
});

test('full mode never calls, sandbox keeps impact and memory but drops facts candidates', async () => {
    const calls = [];
    const deps = {
        mode: () => 'full',
        keyOf: () => 'A',
        worldDay: () => 1,
        factsIndex: { stats: () => ({ total: 1 }), matchTokens: () => [{ uid: 12 }], get: () => ({ uid: 12, category: '人物', name: '萧炎', summary: '主角' }) },
        impactRecords: () => [], memorySnapshot: () => ({ entries: [] }),
        maxFloors: () => 4, maxEntries: () => 8,
        complete: async args => { calls.push(args); return '{"facts":[],"impact":[],"memory":[]}'; },
        overrides: () => ({ connection: 'tavern' }),
        onFailure: () => {},
    };
    assert.equal((await createLitePick(deps).run({ chat: [{ is_user: true, mes: '问' }] })).status, 'disabled');
    assert.equal(calls.length, 0, '完整版不经过合并挑选');
    const sandbox = createLitePick({ ...deps, mode: () => 'lite', sandboxActive: () => true });
    const result = await sandbox.run({ chat: [{ is_user: true, mes: '问' }] });
    assert.equal(result.status, 'empty');
    assert.doesNotMatch(calls[0].user, /萧炎/, '沙盒口径不给原著候选');
    assert.match(calls[0].user, /影响账本是空的/);
});

test('consumers off keeps that part out of the prompt and the result; all off skips the call', async () => {
    const calls = [], failures = [];
    const deps = {
        mode: () => 'lite', keyOf: () => 'A', worldDay: () => 1,
        factsIndex: { stats: () => ({ total: 1 }), matchTokens: () => [{ uid: 12 }], get: () => ({ uid: 12, category: '人物', name: '萧炎', summary: '主角' }) },
        sandboxActive: () => false, volumeOf: () => 1,
        impactRecords: () => [{ id: 'i1', day: 4, weight: 'minor', status: '未了结', title: '药材涨价', detail: '坊市' }],
        memorySnapshot: () => ({ entries: [{ id: 'm1', tier: 'small', day: 3, title: '坊市遇旧', related: ['坊市'] }] }),
        maxFloors: () => 4, maxEntries: () => 8,
        complete: async args => { calls.push(args); return '{"note":"只挑这两路","facts":[12],"impact":["i1"],"memory":["m1"]}'; },
        overrides: () => ({ connection: 'tavern' }),
        onFailure: (channel, reason) => failures.push([channel, reason]),
    };
    // 记忆召回关：提示词不带记忆目录，结果里 memory 恒为空
    const noMemory = createLitePick({ ...deps, consumers: () => ({ facts: true, impact: true, memory: false }) });
    const result = await noMemory.run({ chat: [{ is_user: true, mes: '问' }] });
    assert.equal(result.status, 'ok');
    assert.deepEqual(result.memory, [], '关掉的路不产出结果');
    assert.doesNotMatch(calls[0].user, /记忆目录/, '提示词里不带那一路的候选');
    assert.match(calls[0].user, /12\|人物\|萧炎/);
    assert.match(calls[0].user, /i1\|第4天/);
    assert.deepEqual(failures, []);
    // 全关：整次调用不发，也不登记失败
    const allOff = createLitePick({ ...deps, consumers: () => ({ facts: false, impact: false, memory: false }) });
    const off = await allOff.run({ chat: [{ is_user: true, mes: '问' }] });
    assert.equal(off.status, 'disabled');
    assert.deepEqual(off.facts, []);
    assert.equal(calls.length, 1, '全关不发调用');
    assert.deepEqual(failures, [], '开关主动关闭不是备料失败，不登记');
    // 不传 consumers 时按全开跑（兼容旧调用）
    const open = createLitePick(deps);
    assert.equal((await open.run({ chat: [{ is_user: true, mes: '问' }] })).status, 'ok');
    assert.equal(calls.length, 2);
});

test('failure is registered once and cached for the round, reroll with a new key retries', async () => {
    const calls = [], failures = [];
    let key = 'A';
    let shouldFail = true;
    const pick = createLitePick({
        mode: () => 'lite', keyOf: () => key, worldDay: () => 1,
        factsIndex: { stats: () => ({ total: 0 }), matchTokens: () => [], get: () => null },
        sandboxActive: () => false, volumeOf: () => null,
        impactRecords: () => [], memorySnapshot: () => ({ entries: [] }),
        maxFloors: () => 4, maxEntries: () => 8,
        complete: async () => { calls.push(1); if (shouldFail) throw new Error('接口超时'); return '{"facts":[],"impact":[],"memory":[]}'; },
        overrides: () => ({ connection: 'tavern' }),
        onFailure: (channel, reason) => failures.push([channel, reason]),
    });
    const failed = await pick.run({ chat: [{ is_user: true, mes: '问' }] });
    assert.equal(failed.status, 'failed');
    await pick.run({ chat: [{ is_user: true, mes: '问' }] });
    assert.equal(calls.length, 1, '同轮失败结果也缓存，不连发三次');
    assert.deepEqual(failures, [['素材总挑选', '接口超时']], '失败只登记一次');
    key = 'B'; shouldFail = false;
    const recovered = await pick.run({ chat: [{ is_user: true, mes: '重roll' }] });
    assert.equal(recovered.status, 'empty');
    assert.equal(calls.length, 2);
});

test('prompt tells the three jobs apart and forbids invented ids', () => {
    assert.match(LITE_PICK_PROMPT, /facts/);
    assert.match(LITE_PICK_PROMPT, /只能挑清单里的编号/);
    assert.match(LITE_PICK_PROMPT, /忘了就会写矛盾/);
});
