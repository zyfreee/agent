import assert from 'node:assert/strict';
import { NPC_RECORD_PROMPT, NPC_RECORD_JSON_SCHEMA, NPC_EXTRACT_PROMPT, ledgerLines, buildNpcRecordUser, buildNpcExtractUser, playerContextLine, parseNpcRecordReply } from './npc-recorder.js';
import { createNpcLedger } from './npc-ledger.js';

// 1) 记录员规则里必须写清格式、好感和“别写没出现的字段”。
{
    assert.equal(typeof NPC_RECORD_PROMPT, 'string');
    assert.ok(NPC_RECORD_PROMPT.includes('人物'), '规则里要说清输出用“人物”数组');
    assert.ok(NPC_RECORD_PROMPT.includes('好感'), '规则里要写好感只记增减');
    assert.ok(NPC_RECORD_PROMPT.includes('在场'), '规则里要留下场标记');
    assert.equal(NPC_RECORD_JSON_SCHEMA.type, 'object');
    assert.ok(NPC_RECORD_JSON_SCHEMA.properties.人物);
    assert.deepEqual(NPC_RECORD_JSON_SCHEMA.properties.人物.items.required, ['姓名']);
}

// 2) 索引行：一人一行，带在场、重要度、好感、身份、位置。
{
    const ledger = createNpcLedger();
    ledger.apply({
        人物: [
            { 姓名: '萧炎', 身份: '萧家少主', 在场: '在场', 重要: '重要', 好感: '+30', 位置: '萧家议事厅', 称呼: '小炎子' },
            { 姓名: '云韵', 身份: '云岚宗宗主', 在场: '不在场', 重要: '重要', 好感: '-10' },
        ],
    }, { floor: 3, day: 2 });
    const lines = ledgerLines(ledger.list());
    assert.equal(lines.length, 2);
    assert.ok(lines[0].includes('萧炎'));
    assert.ok(lines[0].includes('在场'));
    assert.ok(lines[0].includes('好感10'), '一条 +30 的补丁会被单次 ±10 压成 +10');
    assert.ok(lines[0].includes('萧家议事厅'));
    assert.ok(lines[0].includes('称呼玩家「小炎子」'));
    assert.ok(lines[1].includes('不在场'));
    assert.equal(ledgerLines([], { limit: 5 }).length, 0);
}

// 3) 交给记录员的内容：最近楼层 + 已经建过档的人 + 世界时间。
{
    const ledger = createNpcLedger();
    ledger.apply({ 人物: [{ 姓名: '萧战', 身份: '萧家族长', 在场: '在场', 重要: '重要' }] }, { floor: 1, day: 1 });
    const user = buildNpcRecordUser({
        floors: [
            { role: '玩家', text: '我想见族长。' },
            { role: '角色', text: '萧战端坐在主位上，抬眼看你。' },
        ],
        records: ledger.list(),
        playerName: '林三',
        day: 3,
    });
    assert.ok(user.includes('【最近楼层】'));
    assert.ok(user.includes('【林三】我想见族长。'));
    assert.ok(user.includes('【角色】萧战端坐在主位上'));
    assert.ok(user.includes('【人物簿索引】'));
    assert.ok(user.includes('萧战'));
    assert.ok(user.includes('第 3 天'));
    assert.ok(user.length <= 6000);
}

// 4) 空库时明确告诉记录员“这一轮的人都要新建”，不要让它以为库坏了。
{
    const user = buildNpcRecordUser({ floors: [{ role: '角色', text: '一位老人走来。' }], records: [], day: 1 });
    assert.ok(user.includes('还是空的'));
}

// 5) 超长楼层要被截，不把整段正文塞进小调用。
{
    const long = '斗'.repeat(4000);
    const user = buildNpcRecordUser({ floors: [{ role: '角色', text: long }], records: [], maxChars: 800 });
    assert.ok(user.length <= 800 + 200, '超长内容要压到上限附近');
    assert.ok(user.includes('斗'));
}

// 6) 解析：能吃掉 ``` 围栏、前后废话、中文键。
{
    const raw = '好的，整理如下：\n```json\n{"人物":[{"姓名":"萧炎","好感":"+5","理由":"递了一瓶药","流水":["替主角挡了一掌"]}]}\n```\n以上。';
    const parsed = parseNpcRecordReply(raw);
    assert.equal(parsed.status, 'ok');
    assert.equal(parsed.patches.length, 1);
    assert.equal(parsed.patches[0].姓名, '萧炎');
    assert.equal(parsed.patches[0].好感, '+5');
}

// 7) 解析失败要直说，不许硬修出半截数据。
{
    assert.equal(parseNpcRecordReply('').status, 'empty');
    assert.equal(parseNpcRecordReply('这一楼没什么可记的。').status, 'invalid');
    assert.equal(parseNpcRecordReply('{"人物": [{"姓名": "萧炎"').status, 'invalid');
    const noList = parseNpcRecordReply('{"其它": []}');
    assert.equal(noList.status, 'invalid');
    assert.ok(noList.reason.includes('人物'));
}

// 8) 空名单算“这楼没有可记的人”，交给上层跳过就行。
{
    const parsed = parseNpcRecordReply('{"人物": []}');
    assert.equal(parsed.status, 'ok');
    assert.equal(parsed.patches.length, 0);
}

// 9) 建新档时能带上世界书参考；没命中就整块不出现，不占字数。
{
    const withBook = buildNpcRecordUser({
        floors: [{ role: '角色', text: '萧战负手立在祠堂前。' }],
        records: [],
        worldbookLines: ['w12|人物|萧战|萧家族长，斗皇修为，性沉稳'],
    });
    assert.ok(withBook.includes('【世界书参考】'), '命中世界书时要给记录员看');
    assert.ok(withBook.includes('w12|人物|萧战|萧家族长'));
    const withoutBook = buildNpcRecordUser({ floors: [{ role: '角色', text: '萧战负手而立。' }], records: [], worldbookLines: [] });
    assert.ok(!withoutBook.includes('【世界书参考】'), '没命中就不要空标题');
    assert.ok(NPC_RECORD_PROMPT.includes('世界书参考'), '规则里要说明可以照世界书填新档');
}

// 10) 玩家此刻的位置/境界：接了才出现，没接就不占一行。
{
    assert.equal(playerContextLine(null), '');
    assert.equal(playerContextLine({}), '');
    assert.ok(playerContextLine({ location: '萧家后院', realm: '斗者三星' }).includes('萧家后院'));
    assert.ok(playerContextLine({ location: '萧家后院', realm: '斗者三星' }).includes('斗者三星'));
    const withContext = buildNpcRecordUser({
        floors: [{ role: '角色', text: '你在院里站着。' }],
        records: [],
        playerContext: { location: '萧家后院', realm: '斗者三星' },
    });
    assert.ok(withContext.includes('【玩家此刻】'));
    const without = buildNpcRecordUser({ floors: [{ role: '角色', text: '你在院里站着。' }], records: [] });
    assert.ok(!without.includes('【玩家此刻】'), '没接个人信息时不要空标题');
}

// 11) 抄档员拿到的是“这个人还缺什么 + 世界书原文”，且只填空。
{
    const ledger = createNpcLedger();
    ledger.apply({ 人物: [{ 姓名: '萧战', 身份: '萧家族长', 好感: '+5', 理由: '护住族人' }] }, { floor: 1, day: 1 });
    const record = ledger.get('萧战');
    const user = buildNpcExtractUser({
        record: { ...record, missing: ['性别', '年龄', '境界'] },
        entries: [{ uid: 'w12', category: '人物', name: '萧战', content: '萧战，萧家族长，斗皇修为，性沉稳。' }],
        day: 4,
    });
    assert.ok(user.includes('目标人物：萧战'));
    assert.ok(user.includes('【还空着的字段】'));
    assert.ok(user.includes('性别'));
    assert.ok(user.includes('境界'));
    assert.ok(user.includes('【世界书条目】'));
    assert.ok(user.includes('斗皇修为'));
    assert.ok(user.includes('第 4 天'));
    assert.ok(NPC_EXTRACT_PROMPT.includes('只填'), '抄档规则要强调只填空字段');
    assert.ok(NPC_EXTRACT_PROMPT.includes('关系类'), '抄档规则要强调关系类不写');
    assert.ok(buildNpcExtractUser({ record: { name: '萧战', aliases: [], titles: [], missing: [] }, entries: [], day: 1 }).includes('没找到这个人的条目'), '没有条目要明说，别让抄档员编');
}

// 12) 记录员规则里要写明单次好感最多 ±10。
{
    assert.ok(NPC_RECORD_PROMPT.includes('±10'), '规则要给模型一个幅度上限');
}

console.log('npc-recorder 测试通过');
