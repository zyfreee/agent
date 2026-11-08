import assert from 'node:assert/strict';
import { MEMORY_CONSOLIDATE_PROMPT, MEMORY_CONSOLIDATE_JSON_SCHEMA, buildConsolidateUser, parseConsolidation } from './memory-consolidate.js';

// 1. 提示词契约：只输出 JSON、字段齐全、不许发明；正文/标题有字数要求，钥匙总结不限量
for (const keyword of ['"title"', '"text"', '"related"', '"aliases"', '"weight"', '只输出', '300 字', '把钥匙总结', '小记忆']) {
    assert.ok(MEMORY_CONSOLIDATE_PROMPT.includes(keyword), `总结提示词缺少：${keyword}`);
}
assert.ok(MEMORY_CONSOLIDATE_PROMPT.includes('title 必写'), '总结要给大记忆起短标题（主页面只显示标题）');
assert.deepEqual(MEMORY_CONSOLIDATE_JSON_SCHEMA.required, ['title', 'text'], '标题与正文都必须由模型给出');
assert.ok('title' in MEMORY_CONSOLIDATE_JSON_SCHEMA.properties, 'schema 要放行 title 字段');

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
    assert.ok(user.includes('只输出 JSON：{"title":"…","text":"…","basis":"…","related":[…],"aliases":[…],"quote":"…","weight":"major|minor","tag":""}。'), '收尾要有完整 JSON 格式提醒');
    // 空清单也要能拼（防御路径，正常不会走到）
    assert.ok(buildConsolidateUser({ entries: [] }).includes('没有可总结的小记忆'));
}

// 保存的标题与 note 是原始记忆的一部分，不能在小记忆退役前丢给总结模型。
{
    const user = buildConsolidateUser({ entries: [{
        id: 'm3', tier: 'small', day: 5, title: '  药铺赊账约定  ', text: '掌柜允诺赊药',
        note: '  只限三日，暗号是青竹；逾期须双倍偿还。  ', related: ['掌柜'],
    }] });
    assert.ok(user.includes('标题：药铺赊账约定'), '总结输入必须保留已存标题');
    assert.ok(user.includes('细节：只限三日，暗号是青竹；逾期须双倍偿还。'), '总结输入必须保留 note 的期限、暗号与代价');
    const absent = buildConsolidateUser({ entries: [{ id: 'm4', text: '正文', title: {}, note: [] }, { id: 'm5', text: '旧条目', title: ' ', note: ' ' }] });
    assert.ok(!absent.includes('[object Object]') && !absent.includes('标题：') && !absent.includes('细节：'), '缺失、空白与非字符串补充字段不应污染输入');
}

// 3. 解析：正常、缺 text、超长放行、钥匙不限量
{
    const ok = parseConsolidation('前言 {"title":"坊市风波初起","text":"坊市不太平","basis":"由 m1、m2 总结","related":["穆蛇","坊市掌柜"],"aliases":["掌柜","云岚宗"],"quote":"把灵石留下。","weight":"minor","tag":"thread"} 后记');
    assert.equal(ok.status, 'ok');
    assert.equal(ok.big.title, '坊市风波初起', '短标题进大记忆草稿');
    assert.equal(ok.big.text, '坊市不太平');
    assert.equal(ok.big.weight, 'minor');
    assert.equal(ok.big.tag, 'thread');
    assert.deepEqual(ok.big.related, ['穆蛇', '坊市掌柜']);
    assert.deepEqual(ok.big.aliases, ['掌柜', '云岚宗']);

    // title 必填：缺标题整条打回，由调用方保留小记忆重试
    assert.equal(parseConsolidation('{"text":"某事"}').error, '总结缺少 title');
    // weight 缺省按 major（大记忆默认关键）；tag 不认识的置空
    const defaults = parseConsolidation('{"title":"某事","text":"某事"}');
    assert.equal(defaults.status, 'ok');
    assert.equal(defaults.big.title, '某事');
    assert.equal(defaults.big.weight, 'major');
    assert.equal(defaults.big.tag, '');
    assert.deepEqual(defaults.big.related, [], 'related 缺失不打回，由 runtime 拿小记忆钥匙兜底');

    assert.equal(parseConsolidation('不是 JSON').status, 'invalid');
    assert.equal(parseConsolidation('{"basis":"没有 text"}').error, '总结缺少 text');
    // 正文/标题不再限长：超长照样通过，原样入库
    const long = parseConsolidation(`{"title":"${'标'.repeat(30)}","text":"${'长'.repeat(301)}"}`);
    assert.equal(long.status, 'ok', '超长正文放行');
    assert.equal(long.big.text.length, 301);
    assert.equal(long.big.title.length, 30);
    // 数组里混入非字符串：过滤而不是作废；数量不限
    const messy = parseConsolidation('{"title":"标题","text":"某事","related":["甲", 3, "乙", "丙", "丁", "戊"]}');
    assert.deepEqual(messy.big.related, ['甲', '乙', '丙', '丁', '戊']);
}
