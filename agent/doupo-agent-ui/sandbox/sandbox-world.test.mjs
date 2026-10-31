import assert from 'node:assert/strict';
import { SANDBOX_WORLD_PROMPT, SANDBOX_DECIDE_NOTE } from './sandbox-world.js';

// 1. 开放世界哲学：口径改名、不跟剧情、世界书不在场时以本提示词为准
for (const keyword of ['【开放世界 · 斗气大陆】', '开放世界口径', '不跟随原著剧情', '不是日程表', '没有世界书条目可查时', '已发生事实']) {
    assert.ok(SANDBOX_WORLD_PROMPT.includes(keyword), `世界基线缺少开放世界关键词：${keyword}`);
}
assert.ok(!SANDBOX_WORLD_PROMPT.includes('沙盒'), '口径已改名开放世界，正文不该再出现"沙盒"字样');

// 2. 体系段与卡面世界书常驻条目同源（斗气修炼与等级体系/功法与斗技/炼药师/异火/魔兽魔核）
for (const anchor of [
    '一魂一属',                       // 灵魂单属性（体系·斗气修炼与等级体系）
    '斗之气旋', '每级九星',           // 十段凝旋 + 斗者以上每级九星
    '第七段', '脉断人亡',             // 分水岭 + 不可拔苗
    '天、地、玄、黄四阶',             // 功法斗技四阶
    '五十五万金币',                   // 价格锚点（体系·功法与斗技等级：风卷决拍卖）
    '一至九品', '药方是命根子',       // 炼药师品级与药方地位（体系·炼药师体系）
    '聚气散',                         // 丹药改命样本
    '异火榜', '二十三种',             // 异火榜规模（体系·异火与异火榜）
    '骨灵冷火第十一',                 // 具体名次锚点
    '一阶约当斗者',                   // 魔兽阶位对照（体系·魔兽与魔核）
    '化形丹',                         // 化形设定
    '一殿一塔二宗三谷四方阁',         // 中州格局（体系·中州势力格局）
    '魂殿', '丹塔', '星陨阁', '焚炎谷',
    '蛮族', '黑暗种族',               // 万族林立
    '乌坦城', '云岚宗', '黑角域',     // 地理锚点
]) {
    assert.ok(SANDBOX_WORLD_PROMPT.includes(anchor), `世界基线缺少体系锚点：${anchor}`);
}

// 3. 沙盒规则：世界运转、玩家非中心、信息距离、记账
for (const keyword of ['世界照常运转', '玩家不是世界中心', '信息有距离', '一切记账', 'rumor']) {
    assert.ok(SANDBOX_WORLD_PROMPT.includes(keyword), `沙盒规则缺少：${keyword}`);
}

// 4. 预算护栏：全文是按轮注入的，超 4000 字就该精简了
assert.ok(SANDBOX_WORLD_PROMPT.length > 800, '世界基线过短，撑不起沙盒口径');
assert.ok(SANDBOX_WORLD_PROMPT.length <= 4000, `世界基线超预算：${SANDBOX_WORLD_PROMPT.length} 字`);

// 5. 决定分支说明：口径声明 + 传闻走世界任务（rumor/resolveEvent 与世界运转契约对接）
for (const keyword of ['【开放世界口径】', '不跟随原著剧情', 'rumor', 'resolveEvent', '不要把原著桥段排成日程']) {
    assert.ok(SANDBOX_DECIDE_NOTE.includes(keyword), `决定分支说明缺少：${keyword}`);
}
assert.ok(SANDBOX_DECIDE_NOTE.length < 300, `决定分支说明太长：${SANDBOX_DECIDE_NOTE.length} 字`);

console.log('sandbox world tests passed');
