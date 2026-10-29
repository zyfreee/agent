import assert from 'node:assert/strict';
import { buildWorldInjection, extractOpsBlock, parseOps, stripOpsBlock, OPS_GUIDE, WORLD_HEADER, seasonOf } from '../world/world-ops.js';

const snapshot = {
    clock: { day: 5, minute: 500, label: '三年之约倒计时' },
    info: { era: '萧家废物时期', location: '乌坦城', weather: '晴', reputation: '乌坦城小有名气', wanted: '被米特尔家族记恨' },
    nearEvents: [
        { id: 'e3', day: 5, text: '城东三家铺子夜里失窃', basis: '最近几楼提到的失窃传闻', weight: 'minor', pinned: false, done: false },
        { id: 'e1', day: 2, text: '已了结的旧事', done: true },
        { id: 'e4', day: 5, text: '限期比武报名', endDay: 7, done: false },
        { id: 'e5', day: 5, text: '今日到期悬赏', endDay: 4, done: false },
        { id: 'e6', day: 5, text: '有人在收异火消息', weight: 'rumor', done: false },
        { id: 'e8', day: 9, text: '帝国炼药师大会开幕', weight: 'major', location: '帝都', done: false },
    ],
    tension: "storm",
    factions: [
        { name: '云岚宗', stance: 'hostile', dynamics: '因拒婚震怒', basis: '退婚现场', day: 1, updatedDay: 3 },
        { name: '米特尔家族', stance: 'friendly', dynamics: '', day: 1, updatedDay: 2 },
    ],
    people: [
        { name: '药老', attitude: '严厉但护短', basis: '出手相护', day: 1, updatedDay: 2 },
    ],
    tasks: [
        { id: 't1', title: '三年之约前变强', detail: '从三段斗之气到斗者', basis: '与纳兰嫣然的约定', day: 1, endDay: 12, status: 'active' },
        { id: 't2', title: '已完成的旧任务', status: 'done' },
    ],
    worldEvents: [
        { id: 'e9', day: 3, text: '云岚宗与纳兰家密谈退婚', weight: 'major', done: false, pinned: true },
    ],
};

// —— 注入文本：时钟、现状、双域事件；已了结的不出现；依据跟在事件后 ——
const injected = buildWorldInjection(snapshot);
assert.ok(injected.includes('第 5 天 08:20'), injected);
assert.ok(injected.includes('（春季）'), '时钟行带季节');
assert.equal(seasonOf(1), '春');
assert.equal(seasonOf(91), '夏');
assert.equal(seasonOf(181), '秋');
assert.equal(seasonOf(271), '冬');
assert.equal(seasonOf(361), '春', '跨年轮转');
assert.ok(OPS_GUIDE.includes('四季轮转'), '指南写明季节规则');
assert.ok(OPS_GUIDE.includes('预定事件'), '指南写明预定事件');
assert.ok(OPS_GUIDE.includes('setTension'), '指南写明氛围操作');
assert.ok(injected.includes('三年之约倒计时'));
assert.ok(injected.includes('时期：萧家废物时期；所在地：乌坦城；天气：晴；名声：乌坦城小有名气；通缉度：被米特尔家族记恨'));
assert.ok(injected.includes('身边事件'));
assert.ok(injected.includes('(e3 第5天) 城东三家铺子夜里失窃（依据：最近几楼提到的失窃传闻）'));
assert.ok(injected.includes('(e4 第5天) 限期比武报名（剩 3 天）'), '剩余天数按 clock.day 算');
assert.ok(injected.includes('(e5 第5天) 今日到期悬赏（今日到期）'));
assert.ok(injected.includes('？(e6 第5天) 有人在收异火消息（传闻·未证实）'), '传闻事件要带未证实标记');
assert.ok(injected.includes('(e8 第9天) 帝国炼药师大会开幕（地点：帝都）（预定：第9天）'), '未来事件带地点与预定标');
assert.ok(injected.includes('世界大事'));
assert.ok(injected.includes('当前任务（进行中，达成用 completeTask、作废用 deleteTask）'), '任务栏要进注入');
assert.ok(injected.includes('◆(t1 第1天接) 三年之约前变强：从三段斗之气到斗者（剩 8 天）（来源：与纳兰嫣然的约定）'), '任务行带详情/时限/来源');
assert.ok(!injected.includes('已完成的旧任务'), '已完成任务不进注入');
assert.ok(injected.includes('势力动向（改变态度或动向用 setFaction）'), '势力栏进注入');
assert.ok(injected.includes('- 云岚宗：敌对（因拒婚震怒）（依据：退婚现场）'), '势力行带态度/动向/依据');
assert.ok(injected.includes('- 米特尔家族：友好'), '友好势力也在');
assert.ok(injected.includes('相关人物（改变态度用 setPerson）'), '人物栏进注入');
assert.ok(injected.includes('- 药老：严厉但护短（依据：出手相护）'), '人物行带态度/依据');
assert.ok(injected.includes('世界氛围：风波（危机频发）'), '氛围行进注入');
assert.ok(injected.includes('(e9 第3天) 云岚宗与纳兰家密谈退婚 [置顶]'));
assert.ok(!injected.includes('已了结的旧事'));

// —— 预算截断：保住时钟行，事件从末尾丢（预算下限 200）——
const fat = {
    clock: { day: 5, minute: 500 },
    info: {},
    nearEvents: Array.from({ length: 8 }, (_, index) => ({ id: `n${index}`, day: index + 1, text: `身边事件${index}：`.padEnd(20, '长') + '内容足够长会撑爆预算', done: false })),
    worldEvents: Array.from({ length: 6 }, (_, index) => ({ id: `w${index}`, day: index + 1, text: `世界大事${index}：`.padEnd(20, '长') + '内容足够长会撑爆预算', done: false })),
};
const tiny = buildWorldInjection(fat, { maxChars: 200 });
assert.ok(tiny.startsWith('时钟：'), tiny);
assert.ok(tiny.length <= 200);
assert.ok(!tiny.includes('身边事件'));
assert.ok(!tiny.includes('世界大事'));

// 空快照也有可用的时钟行（缺字段按 0 点渲染）
const blank = buildWorldInjection({});
assert.ok(blank.startsWith('时钟：第 1 天 00:00'), blank);

// —— 指令块提取：fenced 优先取最后一个 ——
const reply = [
    '萧炎握紧了拳头。',
    '```world',
    '{"op":"advance","minutes":30}',
    '```',
    '正文中间不会干扰。',
    '```world',
    '{"op":"addEvent","scope":"world","text":"加玛皇室炼药师大会提前"}',
    '{"op":"resolveEvent","id":"e3"}',
    '```',
].join('\n');
const found = extractOpsBlock(reply);
assert.equal(found.fenced, true);
assert.ok(found.raw.includes('炼药师大会提前'));
assert.ok(!found.raw.includes('advance'));

// —— 裸行容错：模型不吃代码块语法时仍可解析 ——
const bare = '剧情正文。\n{"op":"advance","days":1}\n{"op":"setInfo","field":"weather","text":"雨"}\n收尾一句。';
const bareFound = extractOpsBlock(bare);
assert.equal(bareFound.fenced, false);
assert.equal(parseOps(bareFound.raw).ops.length, 2);

// —— 解析：坏行跳过、好行保留、超量截断 ——
const parsed = parseOps([
    '{"op":"advance","minutes":10}',
    'not json',
    '{"nope":1}',
    '{"op":"addEvent","scope":"near","text":"正常行"}',
    '{"op":"pinEvent","id":"e9","pinned":false}',
    '{"op":"resolveEvent","id":"e1"}',
].join('\n'));
assert.equal(parsed.ops.length, 4);
assert.deepEqual(parsed.ops.map(op => op.op), ['advance', 'addEvent', 'pinEvent', 'resolveEvent']);
assert.equal(parsed.parseErrors.length, 2);
const capped = parseOps('{"op":"advance","minutes":1}\n'.repeat(20), { maxOps: 8 });
assert.equal(capped.ops.length, 8);

// —— 剥离：fenced 与裸行都清干净，正文原样保留 ——
const cleaned = stripOpsBlock(reply);
assert.ok(!cleaned.includes('```world'));
assert.ok(!cleaned.includes('addEvent'));
assert.ok(cleaned.startsWith('萧炎握紧了拳头。'));
assert.ok(cleaned.includes('正文中间不会干扰。'));
const cleanedBare = stripOpsBlock(bare);
assert.ok(!cleanedBare.includes('"op"'));
assert.ok(cleanedBare.startsWith('剧情正文。'));
assert.ok(cleanedBare.endsWith('收尾一句。'));
// 只有指令块的极端楼层：返回原文而不是清成空串
const onlyOps = '```world\n{"op":"advance","minutes":5}\n```';
assert.equal(stripOpsBlock(onlyOps), onlyOps);

// —— 指南与抬头可直接进提示词 ——
assert.ok(OPS_GUIDE.includes('```world'));
assert.ok(OPS_GUIDE.includes('basis'));
assert.ok(OPS_GUIDE.includes('有依据地长出来'), '指南必须写明事件要有依据');
assert.ok(OPS_GUIDE.includes('不要把原著桥段照搬成事件'), '指南必须写明不照搬原著');
assert.ok(WORLD_HEADER.startsWith('【世界现状】'));

console.log('world ops tests passed');
