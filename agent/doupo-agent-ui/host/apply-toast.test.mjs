import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyResultToToasts, rejectionToToast, npcLedgerResultToToasts } from './orb-toast.js';

// 世界运转/剧情/记忆/世界影响：一条落账摘要一条胶囊，主语与图标按账本走
const memory = applyResultToToasts({ applied: [{ summary: '小记忆 +m12（第 95 天）：破屋清点纳戒' }, { summary: '   ' }, {}] }, { kind: 'memory', source: '正文后' });
assert.equal(memory.length, 1, '空摘要与空条目不入列');
assert.equal(memory[0].title, '记忆');
assert.equal(memory[0].icon, 'letter');
assert.equal(memory[0].tone, 'good');
assert.equal(memory[0].text, '小记忆 +m12（第 95 天）：破屋清点纳戒');
assert.equal(memory[0].detail, '正文后');

const world = applyResultToToasts({ applied: [{ summary: '身边事件 +e60（第 17 天）「内宅封门核腰牌」' }] }, { kind: 'world' });
assert.equal(world[0].title, '世界运转');
assert.equal(world[0].icon, 'ledger');

const plot = applyResultToToasts({ applied: [{ summary: '线索 +t3「药老残魂」' }] }, { kind: 'plot' });
assert.equal(plot[0].title, '剧情');
assert.equal(plot[0].icon, 'arrow');

const impact = applyResultToToasts({ applied: [{ summary: '影响 r9：云岚宗三骑入城' }] }, { kind: 'impact' });
assert.equal(impact[0].title, '世界影响');
assert.equal(impact[0].icon, 'flame');

const fallback = applyResultToToasts({ applied: [{ summary: 'x' }] }, { kind: 'nope' });
assert.equal(fallback[0].icon, 'ring', '未知账本回落通用图标');
assert.equal(fallback[0].title, '');

// merge=true：整轮合成一条（世界运转一轮记 6 条不再刷屏），点名去重
const mergedWorld = applyResultToToasts({
    applied: [
        { summary: '时间推进 12:20→13:05' },
        { summary: '身边事件 +e69「货栈管事想找你」' },
        { summary: '势力更新 萧家：声望下降' },
        { summary: '势力更新 萧家：长老换人' },
    ],
}, { kind: 'world', source: '正文后', merge: true });
assert.equal(mergedWorld.length, 1, '世界运转整轮只出一条胶囊');
assert.equal(mergedWorld[0].title, '世界运转');
assert.equal(mergedWorld[0].text, '4 项 · 时间推进 12:20→13:05 · 身边事件 +e69 · 势力更新 萧家', '点名主干并去重');
assert.equal(mergedWorld[0].detail, '正文后');
const single = applyResultToToasts({ applied: [{ summary: '时间推进 12:20→13:05' }] }, { kind: 'world', merge: true });
assert.equal(single[0].text, '时间推进 12:20→13:05', '只有一条时原样给全文');
assert.equal(applyResultToToasts({ applied: [{ summary: 'x' }] }, { kind: 'memory', merge: true })[0].text, 'x', 'merge 不影响条数语义');
assert.equal(applyResultToToasts({ applied: [{ summary: 'a' }, { summary: 'b' }] }, { kind: 'memory' }).length, 2, '记忆默认仍逐条');

assert.deepEqual(applyResultToToasts({ status: 'noop', applied: [] }, { kind: 'plot' }), [], '没有落账就没有胶囊');
assert.deepEqual(applyResultToToasts(null, { kind: 'world' }), []);

// 被拒收 → 红色感叹号；原因去重、最多列三条；没有拒收返回 null
const rejected = rejectionToToast({
    rejected: [{ reason: 'title_missing' }, { reason: 'title_missing' }, { reason: 'duplicate_title' }, { reason: 'details_missing' }, { reason: 'nope' }],
}, { kind: 'impact', source: '正文后' });
assert.equal(rejected.icon, 'warn');
assert.equal(rejected.tone, 'bad');
assert.equal(rejected.title, '世界影响');
assert.equal(rejected.text, '5 条没记成（title_missing、duplicate_title、details_missing）');
assert.equal(rejected.detail, '正文后');
assert.equal(rejectionToToast({ applied: [] }), null, '没有拒收不弹');
assert.equal(rejectionToToast({ rejected: [{ reason: 'bad' }] }).title, '记录', '未知账本用通用主语');

// 人物簿：语气看「记成没记成」，不看好感正负——好感 -2 的成功建档必须是绿色
const npcCreated = npcLedgerResultToToasts({ applied: [{ name: '刀疤护卫队长', created: true, favor: -2, fields: ['身份', '性格标签'] }] }, { source: '正文后' });
assert.equal(npcCreated.length, 1);
assert.equal(npcCreated[0].tone, 'good', '新建档一律绿色，好感为负也不染红');
assert.equal(npcCreated[0].icon, 'plus');
assert.ok(npcCreated[0].text.includes('新档案'), npcCreated[0].text);
assert.ok(npcCreated[0].text.includes('好感 -2'), npcCreated[0].text);
const npcFavorDown = npcLedgerResultToToasts({ applied: [{ name: '药老', created: false, favor: -3 }] }, {});
assert.equal(npcFavorDown[0].tone, 'info', '老档案掉好感走中性，不报错色');
assert.equal(npcFavorDown[0].icon, 'person');
const npcFavorUp = npcLedgerResultToToasts({ applied: [{ name: '药老', created: false, favor: 3 }] }, {});
assert.equal(npcFavorUp[0].tone, 'good', '好感上涨仍是绿色');

// 渲染层要有 warn 图标，否则红色感叹号会退化成圆点
const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
assert.ok(source.includes("warn: '<path"), 'index.js 要注册 warn 图标');
assert.ok(source.includes("notifyApply('memory', result"), '记忆落账要弹窗');
assert.ok(source.includes("notifyApply('world', result"), '世界运转落账要弹窗');
assert.ok(source.includes("notifyApply('plot', result"), '剧情落账要弹窗');
assert.ok(source.includes("notifyApply('impact', result"), '世界影响落账要弹窗');
assert.ok(source.includes('function notifyFailure('), '失败要有红色提示');

console.log('apply toast tests passed');
