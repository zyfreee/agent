import assert from 'node:assert/strict';
import { MEMORY_CONSOLIDATE_PROMPT, MEMORY_CONSOLIDATE_JSON_SCHEMA, buildConsolidateUser, parseConsolidation } from './memory-consolidate.js';

// 1. 提示词契约：只输出 JSON、字段齐全、不许发明
for (const keyword of ['"text"', '"related"', '"aliases"', '"weight"', '只输出', '300 字', '小记忆']) {
    assert.ok(MEMORY_CONSOLIDATE_PROMPT.includes(keyword), `总结提示词缺少：${keyword}`);
}
assert.equal(MEMORY_CONSOLIDATE_JSON_SCHEMA.required[0], 'text');

// 2. user 组装：清单带编号/天数/层级/引文/钥匙/依据 + 世界天数 + JSON 收尾
{
    const user = buildConsolidateUser({
        entries: [
            { id: 'm1', tier: 'small', day: 2, text: '穆蛇拦路被赶跑', quote: '把灵石留下。', related: ['穆蛇', '坊市'], aliases: [], basis: '第 2 楼' },
            { id: 'm2', tier: 'small', day: 4, text: '掌柜藏着血莲', quote: '', related: ['坊市掌柜'], aliases: ['掌柜'], basis: '' },
        ],
        day: 6,
    });
    assert.ok(user.includes('1. m1（第2天）[小记忆] 穆蛇拦路被赶跑「把灵石留下。」 关联：穆蛇、坊市（依据：第 2 楼）'), `第一条格式不对：\n${user}`);
    assert.ok(user.includes('2. m2（第4天）[小记忆] 掌柜藏着血莲 关联：坊市掌柜、掌柜'), `第二条格式不对：\n${user}`);
    assert.ok(user.includes('【世界时间】第 6 天'));
    assert.ok(user.includes('只输出 JSON：{"text":"…","basis":"…","related":[…],"aliases":[…],"quote":"…","weight":"major|minor","tag":""}。'), '收尾要有完整 JSON 格式提醒');
    // 空清单也要能拼（防御路径，正常不会走到）
    assert.ok(buildConsolidateUser({ entries: [] }).includes('没有可总结的小记忆'));
}

// 3. 解析：正常、缺 text、超长、字段收窄
{
    const ok = parseConsolidation('前言 {"text":"坊市不太平","basis":"由 m1、m2 总结","related":["穆蛇","坊市掌柜"],"aliases":["掌柜","云岚宗"],"quote":"把灵石留下。","weight":"minor","tag":"thread"} 后记');
    assert.equal(ok.status, 'ok');
    assert.equal(ok.big.text, '坊市不太平');
    assert.equal(ok.big.weight, 'minor');
    assert.equal(ok.big.tag, 'thread');
    assert.deepEqual(ok.big.related, ['穆蛇', '坊市掌柜']);
    assert.deepEqual(ok.big.aliases, ['掌柜', '云岚宗']);

    // weight 缺省按 major（大记忆默认关键）；tag 不认识的置空
    const defaults = parseConsolidation('{"text":"某事"}');
    assert.equal(defaults.status, 'ok');
    assert.equal(defaults.big.weight, 'major');
    assert.equal(defaults.big.tag, '');
    assert.deepEqual(defaults.big.related, [], 'related 缺失不打回，由 runtime 拿小记忆钥匙兜底');

    assert.equal(parseConsolidation('不是 JSON').status, 'invalid');
    assert.equal(parseConsolidation('{"basis":"没有 text"}').error, '总结缺少 text');
    assert.equal(parseConsolidation(`{"text":"${'长'.repeat(301)}"}`).error, '总结 text 超过 300 字');
    // 数组里混入非字符串：过滤而不是作废
    const messy = parseConsolidation('{"text":"某事","related":["甲", 3, "乙", "丙", "丁", "戊"]}');
    assert.deepEqual(messy.big.related, ['甲', '乙', '丙', '丁']);
}
