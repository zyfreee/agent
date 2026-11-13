import assert from 'node:assert/strict';
import { CONSISTENCY_PROMPT, buildConsistencyUser, parseConsistencyReply } from './npc-consistency.js';

// 提示词：检查项要覆盖人设要点，且写明只报不写。
{
    assert.ok(CONSISTENCY_PROMPT.includes('称呼'), '检查项要有称呼连续性');
    assert.ok(CONSISTENCY_PROMPT.includes('雷区'), '检查项要有雷区');
    assert.ok(CONSISTENCY_PROMPT.includes('不重写正文'), '体检是旁路：不改档案不重写正文');
    assert.ok(CONSISTENCY_PROMPT.includes('引正文原句'), '每条违反要引原文作证据');
}

// 材料：档案只给体检用得上的字段 + 最近正文 + 世界时间。
{
    const user = buildConsistencyUser({
        profiles: [{ record: { name: '萧战', traits: ['威严'], speech: '低沉简短', favor: 20, appellation: '萧家小子', realm: '斗皇', injury: '左臂旧伤' } }],
        floors: [{ role: '角色', text: '萧战笑道：小友此言差矣' }],
        day: 3,
    });
    assert.ok(user.includes('【萧战】'));
    assert.ok(user.includes('说话：低沉简短'));
    assert.ok(user.includes('称呼你：「萧家小子」'));
    assert.ok(user.includes('修为：斗皇'));
    assert.ok(user.includes('萧战笑道'));
    assert.ok(user.includes('第 3 天'));
    const empty = buildConsistencyUser({ profiles: [], floors: [] });
    assert.ok(empty.includes('输出 {"检查":[]}'), '空材料要引导模型输出空结果');
}

// 解析：fence 包裹、空清单、坏输出、无姓名/无违反的条目丢弃。
{
    const ok = parseConsistencyReply('```json\n{"检查":[{"姓名":"萧战","违反":[{"字段":"称呼","问题":"正文叫了小友","原文":"小友此言差矣"}]}]}\n```');
    assert.equal(ok.status, 'ok');
    assert.equal(ok.results.length, 1);
    assert.equal(ok.results[0].name, '萧战');
    assert.equal(ok.results[0].violations[0].quote, '小友此言差矣');
    assert.deepEqual(parseConsistencyReply('{"检查":[]}').results, [], '没有违反就是空结果');
    assert.equal(parseConsistencyReply('没话').status, 'invalid');
    assert.equal(parseConsistencyReply('').status, 'empty');
    assert.equal(parseConsistencyReply('{"人物":[]}').status, 'invalid', '只认检查数组，别的形状不硬折');
    const partial = parseConsistencyReply('{"检查":[{"姓名":"","违反":[{"问题":"x"}]},{"姓名":"李四","违反":[]}]}');
    assert.equal(partial.results.length, 0, '没姓名或没违反的条目丢弃');
}

console.log('npc-consistency 测试通过');
