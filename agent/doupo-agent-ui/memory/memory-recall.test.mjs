import assert from 'node:assert/strict';
import { buildRecallCatalog, buildRecallUser, parseRecallDecision, recallEntriesFromIds, MEMORY_RECALL_PROMPT, RECALL_JSON_SCHEMA } from './memory-recall.js';

// —— 提示词与 schema：脚本解析依赖的契约必须齐 ——
assert.ok(MEMORY_RECALL_PROMPT.includes('"ids"'), '提示词必须写明 ids 输出');
assert.ok(MEMORY_RECALL_PROMPT.includes('只输出 JSON'));
assert.ok(MEMORY_RECALL_PROMPT.includes('绝不编造编号'), '提示词必须防编号');
assert.ok(MEMORY_RECALL_PROMPT.includes('不得与之矛盾'), '提示词要写明召回即硬约束');
assert.ok(MEMORY_RECALL_PROMPT.includes('按顺序过三步'), '提示词要有三步判定法');
assert.ok(MEMORY_RECALL_PROMPT.includes('【不要召回】'), '提示词要写明不召回清单');
assert.ok(MEMORY_RECALL_PROMPT.includes('【优先带上】'), '提示词要写明优先级');
assert.equal(RECALL_JSON_SCHEMA.required.includes('ids'), true);
assert.equal(RECALL_JSON_SCHEMA.properties.ids.items.type, 'string');

// —— 目录：大记忆在前、各层新→旧，行格式 编号|层|标题（钥匙）——
const snapshot = {
    entries: [
        { id: 'm1', tier: 'big', title: '穆蛇坊市结怨', text: '正文一', related: ['穆蛇', '坊市'], aliases: [], day: 3 },
        { id: 'm2', tier: 'big', title: '洗骨草扣货', text: '正文二', related: [], aliases: ['药老'], day: 6 },
        { id: 'm3', tier: 'small', title: '坊市打听异火', text: '正文三', related: ['异火'], day: 5 },
        { id: 'm4', tier: 'small', title: '', text: '无标题的小记忆', related: [], aliases: [], day: 2 },
    ],
};
const catalog = buildRecallCatalog(snapshot);
const catalogLines = catalog.split('\n');
assert.deepEqual(catalogLines.map(line => line.replace(/^- /, '').split('|')[0]), ['m2', 'm1', 'm3', 'm4'], '大记忆按天新→旧在前，小记忆随后');
assert.ok(catalogLines[0].includes('m2|大记忆|洗骨草扣货（药老）'), catalogLines[0]);
assert.ok(catalogLines[2].includes('m3|小记忆|坊市打听异火（异火）'), catalogLines[2]);
assert.ok(catalogLines[3].includes('m4|小记忆|无标题的小记忆'), '没标题回退正文');

// 超预算从尾部丢，至少保住一行
const fat = { entries: Array.from({ length: 50 }, (_, index) => ({ id: `m${index + 1}`, tier: 'big', title: `记忆${index}`, text: 'x', related: [], day: index + 1 })) };
const tight = buildRecallCatalog(fat, { maxChars: 300 });
assert.ok(tight.length <= 300);
assert.equal(tight.split('\n').length < 50, true, '超预算要丢行');

// OPT-049: scene matches in either tier survive flooded catalogs within the hard budget.
const flooded = { entries: [
    ...Array.from({ length: 300 }, (_, i) => ({ id: `b${i}`, tier: 'big', title: `无关大记忆${i}`, related: ['背景'], day: i + 2 })),
    { id: 'old-big', tier: 'big', title: '旧约', related: ['古约'], day: 1 },
    { id: 'new-small', tier: 'small', title: '新事', related: ['某人'], aliases: ['小名'], day: 999 },
] };
const relevantCatalog = buildRecallCatalog(flooded, { maxChars: 4000, sceneText: '小名回来追问古约。' });
assert.ok(relevantCatalog.includes('- new-small|小记忆|'), 'unique relevant new small survives big flood');
assert.ok(relevantCatalog.includes('- old-big|大记忆|'), 'unique relevant oldest big survives recency flood');
assert.ok(relevantCatalog.length <= 4000);
const fair = buildRecallCatalog(flooded, { maxChars: 200 });
assert.ok(fair.includes('- new-small|小记忆|'), 'without scene reserve visibility for both tiers');
assert.ok(fair.length <= 200);
assert.ok(buildRecallUser({ snapshot: flooded, floors: [{ role: '玩家', text: '小名回来追问古约。' }] }).includes('- old-big|大记忆|'), 'user builder forwards bounded scene');
const hugeLabels = { entries: [
    { id: 'large-label', tier: 'big', title: '巨'.repeat(1000), related: [], day: 1 },
    { id: 'small-label', tier: 'small', title: '小'.repeat(1000), related: [], day: 2 },
] };
const bounded = buildRecallCatalog(hugeLabels, { maxChars: 200, sceneText: '不相关' });
assert.ok(bounded.length <= 200 && bounded.includes('- large-label|') && bounded.includes('- small-label|'), 'truncate labels, not complete ID prefixes');
assert.ok(bounded.includes('…'));
for (const maxChars of [NaN, -1, 0, 'bad', 200.5]) {
    assert.ok(buildRecallCatalog(flooded, { maxChars }).length <= 4000, 'invalid budget defaults to finite cap');
}
// Infinity＝不限制（设置层把「0＝不限制」换算成 Infinity 传进来）：全部条目进目录，不再按 4000 截。
const unlimitedCatalog = buildRecallCatalog(flooded, { maxChars: Infinity });
assert.ok(unlimitedCatalog.split('\n').length >= flooded.entries.length, 'unlimited budget keeps every entry line');
assert.ok(buildRecallUser({ snapshot: flooded, floors: [], catalogChars: Infinity }).includes('- old-big|大记忆|'), 'user builder forwards unlimited budget');
assert.equal(buildRecallCatalog({ entries: [{ id: 'x'.repeat(500), tier: 'big', title: 'a', related: [] }] }, { maxChars: 200 }), '', 'do not emit partial IDs when prefix cannot fit');
// 空库
assert.equal(buildRecallCatalog({}), '（记忆库还是空的）');

// —— 混合分数序：有场景时目录按 memory-retrieve 分数排，场景触发的排最前 ——
const ranked = { entries: [
    { id: 'm1', tier: 'big', title: '旧账', text: '无关内容', related: ['旧账'], day: 9 },
    { id: 'm2', tier: 'small', title: '近事', text: '萧炎突破斗者', related: ['突破'], day: 8 },
] };
const sceneCatalog = buildRecallCatalog(ranked, { maxChars: 4000, sceneText: '萧炎要突破了。', currentDay: 8 });
assert.ok(sceneCatalog.indexOf('- m2|') < sceneCatalog.indexOf('- m1|'), '场景触发+时间贴近的排到目录前部');
const dayCatalog = buildRecallCatalog({ entries: [
    { id: 'm1', tier: 'small', title: '上周的事', text: '无关内容', related: [], day: 2 },
    { id: 'm2', tier: 'small', title: '今天的事', text: '别的内容', related: [], day: 8 },
] }, { maxChars: 4000, sceneText: '与谁都不沾边的一天。', currentDay: 8 });
assert.ok(dayCatalog.indexOf('- m2|') < dayCatalog.indexOf('- m1|'), '无信号时时间邻近让近事靠前');

// —— superseded（软覆盖）不进目录、不回场 ——
const supersededSnap = { entries: [
    { id: 'm1', tier: 'big', title: '旧账', text: '旧内容', related: ['旧账'], day: 3, supersededBy: 'm2' },
    { id: 'm2', tier: 'small', title: '新账', text: '新内容', related: ['旧账'], day: 4 },
] };
assert.equal(buildRecallCatalog(supersededSnap).includes('- m1|'), false, '被覆盖的旧账不进目录');
assert.equal(buildRecallCatalog(supersededSnap, { sceneText: '旧账旧内容都在场景里。' }).includes('- m1|'), false, '有场景也不复活被覆盖的旧账');
assert.deepEqual(recallEntriesFromIds(supersededSnap, ['m1', 'm2']).map(entry => entry.id), ['m2'], '召回编号对账跳过被覆盖条目');

// —— candidates 外部候选序优先（index.js 向量融合分数直接传入） ——
const candidateCatalog = buildRecallCatalog(ranked, { maxChars: 4000, candidates: [{ entry: ranked.entries[1] }, ranked.entries[0]] });
assert.ok(candidateCatalog.indexOf('- m2|') < candidateCatalog.indexOf('- m1|'), '外部候选序直接采用');
const candidateMissing = buildRecallCatalog(ranked, { maxChars: 4000, candidates: ['mX'] });
assert.equal(candidateMissing.split('\n').length, 2, '候选里没有的条目按旧序补齐，不丢账');
assert.equal(buildRecallUser({ snapshot: supersededSnap, floors: [{ role: '玩家', text: '旧账旧内容都在场景里。' }] }).includes('- m1|'), false, 'user 组装继承软覆盖过滤');

// —— user 组装：三段式，楼层含最新玩家输入且旧→新 ——
const floors = [
    { role: '角色', text: '萧炎握紧了拳头。' },
    { role: '玩家', text: '我去坊市找穆蛇算账。' },
];
const user = buildRecallUser({ snapshot, floors, worldbookLines: ['123|物品|青莲地心火|异火榜第十九'] });
assert.ok(user.includes('【记忆目录'), user.slice(0, 60));
assert.ok(user.includes('m2|大记忆'));
assert.ok(user.includes('【原著资料（本轮已注入的原著条目）】'));
assert.ok(user.includes('123|物品|青莲地心火|异火榜第十九'));
assert.ok(user.includes('最后一楼是玩家刚发的新输入'));
assert.ok(user.includes('[玩家] 我去坊市找穆蛇算账。'));
assert.ok(user.indexOf('萧炎握紧了拳头') < user.indexOf('我去坊市找穆蛇算账'), '聊天旧→新');

// 空输入也有可读结构
const emptyUser = buildRecallUser({});
assert.ok(emptyUser.includes('（记忆库还是空的）'));
assert.ok(emptyUser.includes('（还没有聊天内容）'));

// —— 解析：正常 / fenced / 坏 JSON / 非对象 / 超量截断 / 去重 / 坏类型丢弃 ——
const good = parseRecallDecision('{"note":"穆蛇再登场","ids":["m1","m3"]}');
assert.equal(good.status, 'ok');
assert.equal(good.note, '穆蛇再登场');
assert.deepEqual(good.ids, ['m1', 'm3']);

const fenced = parseRecallDecision('说明\n```json\n{"note":"n","ids":["m2"]}\n```');
assert.equal(fenced.status, 'ok');
assert.deepEqual(fenced.ids, ['m2']);

assert.equal(parseRecallDecision('完全不是 JSON').status, 'invalid');
assert.equal(parseRecallDecision('["数组"]').status, 'invalid');
assert.equal(parseRecallDecision('{"note":"没有要召回的","ids":[]}').status, 'empty');
assert.equal(parseRecallDecision('{"note":"n"}').status, 'invalid', 'missing ids is not an explicit empty decision');
for (const ids of [null, 42, 'm1', {}, [null, 7, '', '  ']]) {
    assert.equal(parseRecallDecision(JSON.stringify({ ids })).status, 'invalid', `bad ids ${JSON.stringify(ids)}`);
}
assert.equal(parseRecallDecision('{"ids":["m99"]}', { snapshot }).status, 'invalid', 'all unknown IDs must trigger fallback');
const mixed = parseRecallDecision('{"ids":["m99","m1","m1","m3"]}', { snapshot });
assert.equal(mixed.status, 'ok');
assert.deepEqual(mixed.ids, ['m1', 'm3']);
assert.equal(mixed.dropped, 2);
assert.equal(parseRecallDecision('{"ids":[]}', { snapshot: {} }).status, 'empty', 'explicit empty remains authoritative even with an empty ledger');
assert.equal(parseRecallDecision('{"ids":["m1"]}', { snapshot: {} }).status, 'invalid');
assert.equal(parseRecallDecision('{"ids":["m1"]}', { maxIds: -1 }).status, 'ok', 'invalid cap must not manufacture empty success');
assert.deepEqual(parseRecallDecision('{"ids":["m99","m1"]}', { snapshot, maxIds: 1 }).ids, ['m1'], 'unknown IDs do not consume known-ID capacity');

const overflow = parseRecallDecision(JSON.stringify({ note: 'n', ids: Array.from({ length: 30 }, (_, index) => `m${index + 1}`) }));
assert.equal(overflow.ids.length, 25, '编号上限 25');
assert.equal(overflow.dropped, 5);

const deduped = parseRecallDecision('{"note":"n","ids":["m1","m1","m2","",7,null]}');
assert.deepEqual(deduped.ids, ['m1', 'm2'], '去重、空串与非字符串丢弃');
assert.equal(deduped.dropped, 4);

// —— 编号对账：账里没有的编号丢弃，顺序保持模型给的 ——
const picked = recallEntriesFromIds(snapshot, ['m3', 'm99', 'm1', 'm3']);
assert.deepEqual(picked.map(entry => entry.id), ['m3', 'm1'], '坏号跳过、重复由 parse 去重后这里也不重复');
assert.equal(recallEntriesFromIds(snapshot, []).length, 0);

console.log('memory recall tests passed');

// —— advanced=false（完整版/简略版口径）：目录退回旧洪泛序（大/小交替），不走混合分数排序 ——
{
    const entries = [
        { id: 'm1', tier: 'small', title: '词面命中的新事', text: '穆蛇在坊市拦路勒索被赶跑了', related: [], day: 9 },
        { id: 'm2', tier: 'big', title: '大记忆旧事', text: '旧事一桩', related: [], day: 2 },
    ];
    const scene = '穆蛇在坊市拦路勒索被赶跑了。';
    assert.ok(buildRecallCatalog({ entries }, { sceneText: scene, maxChars: 4000 }).startsWith('- m1|'), '进阶版：词面命中的条目排到目录最前');
    assert.ok(buildRecallCatalog({ entries }, { sceneText: scene, maxChars: 4000, advanced: false }).startsWith('- m2|'), '旧口径：大/小交替洪泛序，不按分数排');
}
