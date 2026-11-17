import assert from 'node:assert/strict';
import test from 'node:test';
import { createNpcReachout, NPC_REACHOUT_PROMPT, buildReachoutUser, parseReachoutReply, MOTIVE_LABELS } from './npc-reachout.js';

function fakeClock() {
    let current = new Date('2026-01-01T12:00:00');
    return { now: () => new Date(current), advance: minutes => { current = new Date(current.getTime() + minutes * 60_000); } };
}

test('主动联系：动机加权积累紧急度，过阈值才排队，没到就继续攒', () => {
    const clock = fakeClock();
    const reachout = createNpcReachout({ now: clock.now });
    const args = { npcId: '药老', favor: 72, loopsDue: 1, motives: { favor: true, loop: true, gossip: false, random: false } };
    // 0.25 基础 + 1.2(旧约) + 1(情谊) = 2.45 ≥ 阈值 2，首轮就排上
    const first = reachout.evaluate({ ...args, day: 5 });
    assert.equal(first.status, 'queued');
    assert.equal(first.item.motive, 'loop', '事由优先级 loop > favor');
    assert.equal(reachout.pendingList().length, 1);

    // 还在队列里就再喊一次 → already_pending（队列报告优先于冷却）
    assert.equal(reachout.evaluate({ ...args, day: 5 }).reason, 'already_pending');
});

test('主动联系：低于阈值的动机只攒紧急度，攒够才开口', () => {
    const clock = fakeClock();
    const reachout = createNpcReachout({ now: clock.now, maxPending: 5 });
    const args = { npcId: '萧战', favor: 10, motives: { favor: false, loop: false, gossip: false, random: false }, urgencyThreshold: 1 };
    // 每轮只有基础 0.25：攒到第 4 轮（1.0 ≥ 1）才开口
    const first = reachout.evaluate({ ...args, day: 1 });
    assert.equal(first.status, 'accumulating');
    assert.ok(first.urgency > 0 && first.urgency < 1);
    clock.advance(31);
    assert.equal(reachout.evaluate({ ...args, day: 1 }).status, 'accumulating', '0.5 < 1，继续攒');
    clock.advance(31);
    assert.equal(reachout.evaluate({ ...args, day: 2 }).status, 'accumulating', '0.75 < 1，继续攒');
    clock.advance(31);
    const fourth = reachout.evaluate({ ...args, day: 3 });
    assert.equal(fourth.status, 'queued', '0.25×4 = 1.0 ≥ 1，攒够了');
    assert.equal(fourth.item.motive, 'random', '没有事由动机时归为兴起');
});

test('主动联系：扰民红线全生效——静音/勿扰/冷却/读空气/队列满/已在队', () => {
    const clock = fakeClock();
    const reachout = createNpcReachout({ now: clock.now, maxPending: 1 });
    reachout.setMuted('海波东', true);
    assert.equal(reachout.evaluate({ npcId: '海波东', favor: 80, urgencyThreshold: 1 }).reason, 'muted');

    // 好感 80 过情谊线（≥50）只有 1.25 权重，阈值压到 1 才能单靠好感排队
    const night = createNpcReachout({ now: () => new Date('2026-01-01T02:30:00'), maxPending: 1 });
    night.setQuietWindow(23, 7);
    assert.equal(night.evaluate({ npcId: '药老', favor: 80, urgencyThreshold: 1 }).reason, 'quiet_hours', '凌晨 2 点在勿扰带内（23→7 跨午夜）');
    const day = createNpcReachout({ now: () => new Date('2026-01-01T12:30:00'), maxPending: 1 });
    assert.notEqual(day.evaluate({ npcId: '药老', favor: 80, urgencyThreshold: 1 }).reason, 'quiet_hours');
    day.setQuietWindow(9, 9);
    assert.notEqual(day.evaluate({ npcId: '云韵', favor: 80, urgencyThreshold: 1 }).reason, 'quiet_hours', 'from=to 不设勿扰');

    const clock2 = fakeClock();
    const pair = createNpcReachout({ now: clock2.now, maxPending: 1 });
    assert.equal(pair.evaluate({ npcId: '药老', favor: 80, urgencyThreshold: 1 }).status, 'queued');
    assert.equal(pair.evaluate({ npcId: '药老', favor: 80, urgencyThreshold: 1 }).reason, 'already_pending', '还在队里就不再排');
    assert.equal(pair.evaluate({ npcId: '云韵', favor: 80, urgencyThreshold: 1 }).reason, 'pending_full', '队列满先挡别人');
    pair.dismiss(pair.pendingList()[0].id);
    assert.equal(pair.evaluate({ npcId: '云韵', favor: 80, urgencyThreshold: 1 }).status, 'queued', '忽略后腾出队列');
    pair.dismiss(pair.pendingList()[0].id);
    assert.equal(pair.evaluate({ npcId: '云韵', favor: 80, urgencyThreshold: 1 }).reason, 'cooldown', '忽略加倍冷却');

    const clock3 = fakeClock();
    const air = createNpcReachout({ now: clock3.now });
    air.evaluate({ npcId: '纳兰嫣然', favor: 80, urgencyThreshold: 1 });
    air.dismiss(air.pendingList()[0].id);
    air.markIgnored('纳兰嫣然');
    air.markIgnored('纳兰嫣然');
    air.markIgnored('纳兰嫣然');
    clock3.advance(180);
    assert.equal(air.evaluate({ npcId: '纳兰嫣然', favor: 80, urgencyThreshold: 1 }).reason, 'ignored_too_many', '连着没理 3 次先封嘴');
    air.markReplied('纳兰嫣然');
    assert.notEqual(air.evaluate({ npcId: '纳兰嫣然', favor: 80, urgencyThreshold: 1 }).reason, 'ignored_too_many', '回复后读空气清零');
});

test('主动联系：额度与话题冷却，快照/恢复走一个来回', () => {
    const clock = fakeClock();
    const reachout = createNpcReachout({ now: clock.now, maxPending: 5 });
    reachout.beginTurn(2);
    assert.equal(reachout.spendTurn(), true);
    assert.equal(reachout.spendTurn(), true);
    assert.equal(reachout.spendTurn(), false, '额度用完不再判断');
    assert.equal(reachout.turnLeft(), 0);
    reachout.beginTurn(0);
    assert.equal(reachout.spendTurn(), false);

    const queued = reachout.evaluate({ npcId: '药老', favor: 80, day: 5, urgencyThreshold: 1 });
    const id = queued.item.id;
    assert.equal(reachout.attachMessage(id, { opening: '' }).status, 'dropped', '空开场白撤下队列');
    assert.equal(reachout.pendingList().length, 0);
    const again = reachout.evaluate({ npcId: '药老', favor: 80, day: 6, urgencyThreshold: 1 });
    assert.equal(again.reason, 'cooldown', '排队时就进冷却，开场白作废也不能立刻再来');

    const fresh = createNpcReachout({ now: clock.now, maxPending: 5 });
    const q2 = fresh.evaluate({ npcId: '云韵', favor: 80, day: 6, urgencyThreshold: 1 });
    fresh.attachMessage(q2.item.id, { opening: '近来可好？', reason: '惦记', topic: '魔兽山脉的传闻' });
    assert.equal(fresh.topicCooled('云韵', '魔兽山脉的传闻', 8), true, '话题冷却中（6→8 天差 2 < 14）');
    assert.equal(fresh.topicCooled('云韵', '别的', 8), false, '没提过的话题不受限');
    assert.equal(fresh.topicCooled('云韵', '魔兽山脉的传闻', 25), false, '14 个世界日后解冻');

    const snapshot = fresh.snapshot();
    const restored = createNpcReachout({ now: clock.now, maxPending: 5 });
    assert.equal(restored.restore(snapshot).status, 'restored');
    assert.equal(restored.pendingList()[0]?.npcId, '云韵');
    assert.equal(restored.pendingList()[0]?.opening, '近来可好？');
    assert.equal(restored.topicCooled('云韵', '魔兽山脉的传闻', 8), true, '话题冷却跟着快照走');
    restored.clear();
    assert.equal(restored.pendingList().length, 0);
    assert.equal(restored.restore(null).status, 'reset', '坏快照按空台开局');
});

test('主动联系：开场白提示词与解析，动机材料按需拼块', () => {
    const user = buildReachoutUser({
        record: { name: '药老', identity: '灵魂体', traits: ['睿智'], favor: 72, doing: '沉睡' },
        motive: 'loop',
        loops: [{ promise: '三日后教他炼药', dueDay: 12 }],
        day: 12,
    });
    assert.match(user, /^旧约｜/, '动机标签打头');
    assert.match(user, /三日后教他炼药/);
    assert.match(user, /第 12 天/);
    const gossipUser = buildReachoutUser({ record: { name: '云韵' }, motive: 'gossip', rumors: ['听说他在魔兽山脉连败两名斗者'], day: 3 });
    assert.match(gossipUser, /魔兽山脉的传闻|听说他在魔兽山脉/, '风闻材料只给 gossip 动机');
    assert.doesNotMatch(buildReachoutUser({ record: { name: '云韵' }, motive: 'favor', day: 3 }), /他没兑现的承诺/);
    const ok = parseReachoutReply('{"say":"小家伙，说好的炼药课，别忘了。","reason":"到点的旧约","topic":"炼药课"}');
    assert.deepEqual(ok, { status: 'ok', say: '小家伙，说好的炼药课，别忘了。', reason: '到点的旧约', topic: '炼药课' });
    assert.equal(parseReachoutReply('{"reason":"没台词"}').status, 'invalid');
    assert.equal(parseReachoutReply('乱写').status, 'invalid');
    assert.match(NPC_REACHOUT_PROMPT, /只输出一个 JSON/);
    assert.equal(MOTIVE_LABELS.loop, '旧约');
    assert.equal(MOTIVE_LABELS.gossip, '风闻');
});
