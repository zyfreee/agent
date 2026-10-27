import assert from 'node:assert/strict';
import { createNpcLedger, favorLabel, NPC_FIELDS, FAVOR_MIN, FAVOR_MAX, FAVOR_REASON_MAX, FAVOR_STEP_MAX } from './npc-ledger.js';

// 1) 建档：一人一条，姓名是主键，别名能把后来的写法指回同一份档案。
{
    const ledger = createNpcLedger();
    const first = ledger.apply({ 人物: [{ 姓名: '萧炎', 别名: ['炎帝'], 身份: '萧家少主', 在场: '在场', 重要: '重要' }] }, { floor: 3, day: 1 });
    assert.equal(first.status, 'applied');
    assert.deepEqual(first.created, ['萧炎']);
    const record = ledger.get('萧炎');
    assert.equal(record.identity, '萧家少主');
    assert.deepEqual(record.aliases, ['炎帝']);
    assert.equal(record.presence, '在场');
    assert.equal(record.importance, '重要');
    assert.equal(record.source, '正文');
    assert.equal(record.firstFloor, 3);

    const second = ledger.apply({ 人物: [{ 姓名: '炎帝', 态度: '多了几分欣赏' }] }, { floor: 4, day: 1 });
    assert.deepEqual(second.created, []);
    assert.equal(second.applied[0].name, '萧炎', '别名必须指回原档案，不能再建一份');
    assert.equal(ledger.status().total, 1);
    assert.equal(ledger.get('萧炎').attitude, '多了几分欣赏');
}

// 2) 好感只记增减、单次最多 ±10：模型写 +95 也只记 +10，理由压到 15 字以内。
{
    const ledger = createNpcLedger();
    ledger.apply({ 人物: [{ 姓名: '萧炎', 好感: '+95', 理由: '救下萧家满门上下老小' }] }, { floor: 5, day: 2 });
    assert.equal(ledger.get('萧炎').favor, FAVOR_STEP_MAX, '单次超过 ±10 要压回 ±10');
    assert.equal(ledger.get('萧炎').favorLog[0].delta, FAVOR_STEP_MAX);
    assert.ok(ledger.get('萧炎').favorLog[0].reason.length <= FAVOR_REASON_MAX, '理由必须压到 15 字以内');

    for (let round = 0; round < 12; round += 1) {
        ledger.apply({ 人物: [{ 姓名: '萧炎', 好感: 10, 理由: '又帮一次' }] }, { floor: 6 + round, day: 2 });
    }
    assert.equal(ledger.get('萧炎').favor, FAVOR_MAX, '累计到上限要停在 100，不能溢出');
    assert.equal(favorLabel(FAVOR_MAX), '生死之交');
    assert.ok(ledger.get('萧炎').favorLog.every(entry => Math.abs(entry.delta) <= FAVOR_STEP_MAX), '每条流水都不能超过 ±10');

    ledger.apply({ 人物: [{ 姓名: '萧炎', 好感: '-200', 理由: '翻脸' }] }, { floor: 30, day: 2 });
    assert.equal(ledger.get('萧炎').favorLog.at(-1).delta, -FAVOR_STEP_MAX, '负向也压到 -10');
    assert.equal(ledger.get('萧炎').favor, FAVOR_MAX - FAVOR_STEP_MAX);
    assert.equal(ledger.get('萧炎').favorLog.at(-1).floor, 30);
}

// 3) 流水只追加不覆盖，改一次版本号加一。
{
    const ledger = createNpcLedger();
    ledger.apply({ 人物: [{ 姓名: '萧战', 身份: '萧家族长' }] }, { floor: 2, day: 1 });
    const before = ledger.get('萧战').version;
    ledger.apply({ 人物: [{ 姓名: '萧战', 流水: ['主持族会，压下二长老的质疑'] }] }, { floor: 8, day: 3 });
    const record = ledger.get('萧战');
    assert.ok(record.version > before);
    assert.equal(record.log.at(-1).text, '主持族会，压下二长老的质疑');
    assert.equal(record.log.at(-1).floor, 8);
    assert.equal(record.log.at(-1).day, 3);
    assert.equal(record.log.length, 1);
}

// 4) 认不出的键原地忽略，不报错、不写库。
{
    const ledger = createNpcLedger();
    const result = ledger.apply({ 人物: [{ 姓名: '萧战', 斗气化马: '是', 境界: '斗王' }] }, { floor: 1 });
    assert.deepEqual(result.ignored, ['斗气化马']);
    assert.equal(ledger.get('萧战').realm, '斗王');
    assert.equal(Object.prototype.hasOwnProperty.call(ledger.get('萧战'), '斗气化马'), false);
}

// 5) 四象限：在场×重要给全档；在场×不重要给一行；不在场×重要给一行带位置；不在场×不重要不出现。
{
    const ledger = createNpcLedger();
    ledger.apply({
        人物: [
            { 姓名: '萧炎', 身份: '萧家少主', 境界: '斗师', 在场: '在场', 重要: '重要', 好感: '+30', 态度: '把这小子当自家人' },
            { 姓名: '阿福', 身份: '萧家管事', 在场: '在场', 重要: '不重要' },
            { 姓名: '云韵', 身份: '云岚宗宗主', 位置: '魔兽山脉', 在场: '不在场', 重要: '重要', 好感: '-20' },
            { 姓名: '路人乙', 身份: '街边小贩', 在场: '不在场', 重要: '不重要' },
        ],
    }, { floor: 9, day: 4 });
    const view = ledger.injection({ budget: 4000 });
    assert.ok(view.text.startsWith('【人物簿·本楼已记】'));
    assert.ok(view.text.includes('身份：萧家少主'), '在场×重要要给全字段');
    assert.ok(view.text.includes('修为：斗师'));
    assert.ok(view.text.includes('阿福'), '在场×不重要的也要露一行');
    assert.ok(view.text.includes('云韵'), '不在场×重要的要露一行');
    assert.ok(view.text.includes('魔兽山脉'), '不在场的人要带上他在哪');
    assert.equal(view.text.includes('路人乙'), false, '不在场又不重要的人不注入');
    assert.deepEqual(view.used.sort(), ['云韵', '萧炎', '阿福'].sort());
    assert.equal(view.counts.full, 1);
}

// 6) 超预算先降级成一行，不硬截断半句话。
{
    const ledger = createNpcLedger();
    const people = [];
    for (let index = 0; index < 8; index += 1) {
        people.push({ 姓名: `角色${index}`, 身份: '门中弟子', 在场: '在场', 重要: '重要', 正在做什么: '在大殿里候着，等宗主发话' });
    }
    ledger.apply({ 人物: people }, { floor: 2 });
    const view = ledger.injection({ budget: 200 });
    assert.ok(view.text.length <= 200);
    assert.ok(view.degraded.length > 0, '预算不够时应该降级而不是直接截断');
    assert.ok(view.used.length >= 2);
}

// 7) 导出、再载入：档案不丢，字段还能对上。
{
    const ledger = createNpcLedger();
    ledger.apply({ 人物: [{ 姓名: '药老', 身份: '炼药师', 伤势: '魂魄残破' }, { 姓名: '萧薰儿', 好感: '+12' }] }, { floor: 4, day: 2 });
    const dump = ledger.exportAll();
    assert.equal(dump.version, 1);
    assert.equal(dump.records.length, 2);

    const reloaded = createNpcLedger();
    const loaded = reloaded.load({ ...dump, lastFloor: 4 });
    assert.equal(loaded.status, 'loaded');
    assert.equal(loaded.total, 2);
    assert.equal(reloaded.get('药老').injury, '魂魄残破');
    assert.equal(reloaded.get('萧薰儿').favor, 10, '相对 +12 的单次增减按 ±10 收');
    assert.equal(reloaded.get('萧薰儿').favorLog.length, 1);
    assert.equal(loaded.skipped, 0);

    const broken = createNpcLedger();
    assert.equal(broken.load({ records: [null, 'obviously not a record', {}] }).skipped, 3);
}

// 8) 删除、清空、列人。
{
    const ledger = createNpcLedger();
    ledger.apply({ 人物: [{ 姓名: '萧炎' }, { 姓名: '萧薰儿' }] }, { floor: 1 });
    assert.equal(ledger.remove('萧炎').status, 'removed');
    assert.equal(ledger.get('萧炎'), null);
    assert.equal(ledger.remove('萧炎').status, 'not_found');
    assert.deepEqual(ledger.names(), ['萧薰儿']);
    assert.equal(ledger.clear().status, 'cleared');
    assert.equal(ledger.status().total, 0);
    assert.equal(ledger.injection().text, '');
}

// 9) 空补丁、坏补丁都不炸。
{
    const ledger = createNpcLedger();
    assert.equal(ledger.apply(null).status, 'empty');
    assert.equal(ledger.apply({ 人物: [] }).status, 'empty');
    assert.equal(ledger.apply({ 人物: [{ 身份: '没有名字的人' }] }).skipped[0].reason, 'missing_name');
    assert.equal(ledger.apply({ 人物: [{ 姓名: '萧炎', 境界: '不变' }] }).applied[0].fields.length, 0, '“不变”不能写进档案');
    assert.equal(ledger.describe('不存在的人'), '');
}

// 10) 字段表本身要被页面和提示词共用。
{
    assert.ok(NPC_FIELDS.length >= 30);
    const labels = NPC_FIELDS.map(field => field.label);
    for (const label of ['身份', '境界', '态度', '所在位置', '秘密', '重要度']) assert.ok(labels.includes(label), `缺字段：${label}`);
    assert.equal(favorLabel(0), '冷淡');
    assert.equal(favorLabel(-100), '死敌');
}

// 11) 衣着与随身物品的四段式：名称/部位/品阶/状态、名称/数量/来源/藏着，回读不能被洗掉。
{
    const ledger = createNpcLedger();
    ledger.apply({
        人物: [{
            姓名: '萧战',
            衣着: [{ 名称: '白袍', 部位: '外袍', 品阶: '玄阶', 状态: '旧' }],
            随身物品: [{ 名称: '玉牌', 数量: 2, 来源: '族库', 藏着: true }],
        }],
    }, { floor: 2, day: 1 });
    const record = ledger.get('萧战');
    assert.equal(record.clothes[0].part, '外袍');
    assert.equal(record.clothes[0].grade, '玄阶');
    assert.equal(record.clothes[0].state, '旧');
    assert.equal(record.items[0].count, 2);
    assert.equal(record.items[0].source, '族库');
    assert.equal(record.items[0].hidden, true);
    const text = ledger.describe(record, 'full');
    assert.ok(text.includes('外袍·玄阶·旧'), '衣着四段要显示出来');
    assert.ok(text.includes('×2'), '数量要显示出来');
    assert.ok(text.includes('藏着'), '藏着的标记要显示出来');

    // 走一遍导出/导入（normalizeRecord 会重新洗一次），四段仍要在。
    const again = createNpcLedger();
    again.load(ledger.exportAll());
    const copy = again.get('萧战');
    assert.equal(copy.clothes[0].grade, '玄阶');
    assert.equal(copy.items[0].source, '族库');
}

// 13) 只填空模式：世界书抄档不许覆盖正文已经记下的东西；没记过的才补。
{
    const ledger = createNpcLedger();
    ledger.apply({ 人物: [{ 姓名: '萧战', 身份: '萧家族长', 在场: '在场', 好感: '+7', 理由: '护住族人', 流水: ['主持族会'] }] }, { floor: 2, day: 1 });
    const before = ledger.get('萧战');
    assert.equal(before.gender, '');

    const result = ledger.apply({ 人物: [{ 姓名: '萧战', 性别: '男', 身份: '萧家退隐长老', 境界: '斗皇', 好感: '+50', 理由: '改写', 流水: ['不该出现'] }] }, { floor: null, day: 1, source: '世界书', fillEmpty: true });
    assert.equal(result.status, 'applied');
    const after = ledger.get('萧战');
    assert.equal(after.gender, '男', '空着的字段要补上');
    assert.equal(after.realm, '斗皇');
    assert.equal(after.identity, '萧家族长', '已有的身份不能被抄档覆盖');
    assert.equal(after.favor, 7, '好感不能被动');
    assert.deepEqual(after.log.map(entry => entry.text), ['主持族会'], '流水不能被动');

    // 只填空只在“在场/重要”还是默认值时才动这两个。
    assert.equal(after.presence, '在场');
    const result2 = ledger.apply({ 人物: [{ 姓名: '萧炎', 姓名注: '', 在场: '不在场', 重要度: '重要' }] }, { floor: null, day: 1, source: '世界书', fillEmpty: true });
    assert.equal(result2.status, 'applied');
    assert.equal(ledger.get('萧炎').presence, '不在场');
}

// 14) missing() 报出还空着的字段，面板「重抽」和“只填空”都靠它。
{
    const ledger = createNpcLedger();
    ledger.apply({ 人物: [{ 姓名: '云韵', 身份: '云岚宗宗主', 性别: '女' }] }, { floor: 1, day: 1 });
    const missing = ledger.missing('云韵');
    assert.ok(Array.isArray(missing));
    assert.ok(!missing.includes('身份'), '已填的字段不该算缺');
    assert.ok(!missing.includes('性别'));
    assert.ok(missing.includes('年龄'), '空字段要算缺');
    assert.ok(missing.length >= 20, '新档应该缺一大片');
    assert.ok(ledger.missing('查无此人').length === 0, '找不到人就返回空数组');

    const full = createNpcLedger();
    full.apply({ 人物: [{ 姓名: '萧炎', 身份: '少主', 性别: '男', 年龄: '十六', 境界: '斗者' }] }, { floor: 1, day: 1 });
    assert.ok(full.missing('萧炎').length < missing.length);
}

console.log('npc-ledger 测试通过');
