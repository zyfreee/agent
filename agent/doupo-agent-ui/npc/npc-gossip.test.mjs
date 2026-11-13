import assert from 'node:assert/strict';
import { GOSSIP_PROMPT, buildGossipUser, GOSSIP_FAVOR_STEP_MAX } from './npc-gossip.js';

// 提示词：幅度上限写死、只收目标名单里的人。
{
    assert.ok(GOSSIP_PROMPT.includes('±3'), '传闻的幅度上限要写死在提示词里');
    assert.ok(GOSSIP_PROMPT.includes('人物'), '输出形状沿用人物补丁');
    assert.equal(GOSSIP_FAVOR_STEP_MAX, 3);
}

// 材料：传闻清单带天数与来历、目标带性格/雷区/现状与听到渠道、世界时间、截断。
{
    const user = buildGossipUser({
        rumors: [{ day: 5, text: '有人传他在魔兽山脉连败两名斗者', basis: '酒楼传闻' }],
        targets: [{
            record: { name: '纳兰嫣然', identity: '云岚宗少宗主', traits: ['傲气'], taboo: '退婚旧事', attitude: '忌惮', favor: -10 },
            heard: [{ from: '纳兰桀', via: '血亲（父女）', rumor: '他在魔兽山脉连败两名斗者' }],
        }],
        day: 6,
    });
    assert.ok(user.includes('【传闻清单】'));
    assert.ok(user.includes('第5天'));
    assert.ok(user.includes('酒楼传闻'));
    assert.ok(user.includes('纳兰嫣然'));
    assert.ok(user.includes('雷区：退婚旧事'));
    assert.ok(user.includes('好感 -10'));
    assert.ok(user.includes('从纳兰桀（血亲（父女））处听说'), '渠道要写清从谁、什么关系');
    assert.ok(user.includes('第 6 天'));
    const long = buildGossipUser({ rumors: [{ day: 1, text: 'x'.repeat(2000) }], targets: [], maxChars: 500 });
    assert.ok(long.length <= 500, '材料超限要截断');
    const empty = buildGossipUser({ rumors: [], targets: [] });
    assert.ok(empty.includes('没有传闻'), '没有传闻时给空清单引导');
    assert.ok(empty.includes('没有目标'));
}

console.log('npc-gossip 测试通过');
