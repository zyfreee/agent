import assert from 'node:assert/strict';
import { buildWorldInjection, extractOpsBlock, parseOps, stripOpsBlock, OPS_GUIDE, WORLD_HEADER } from '../world/world-ops.js';

const snapshot = {
    clock: { day: 5, minute: 500, label: '三年之约倒计时' },
    info: { era: '萧家废物时期', location: '乌坦城', weather: '晴' },
    nearEvents: [
        { id: 'e3', day: 5, text: '城东三家铺子夜里失窃', basis: '最近几楼提到的失窃传闻', weight: 'minor', pinned: false, done: false },
        { id: 'e1', day: 2, text: '已了结的旧事', done: true },
        { id: 'e4', day: 5, text: '限期比武报名', endDay: 7, done: false },
        { id: 'e5', day: 5, text: '今日到期悬赏', endDay: 4, done: false },
    ],
    worldEvents: [
        { id: 'e9', day: 3, text: '云岚宗与纳兰家密谈退婚', weight: 'major', done: false, pinned: true },
    ],
};

// —— 注入文本：时钟、现状、双域事件；已了结的不出现；依据跟在事件后 ——
const injected = buildWorldInjection(snapshot);
assert.ok(injected.includes('第 5 天 08:20'), injected);
assert.ok(injected.includes('三年之约倒计时'));
assert.ok(injected.includes('时期：萧家废物时期；所在地：乌坦城；天气：晴'));
assert.ok(injected.includes('身边事件'));
assert.ok(injected.includes('(e3 第5天) 城东三家铺子夜里失窃（依据：最近几楼提到的失窃传闻）'));
assert.ok(injected.includes('(e4 第5天) 限期比武报名（剩 3 天）'), '剩余天数按 clock.day 算');
assert.ok(injected.includes('(e5 第5天) 今日到期悬赏（今日到期）'));
assert.ok(injected.includes('世界大事'));
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
