/**
 * OPT-020 入口对抗测试：只读提取 index.js 里 runNpcLedgerExtract 的白名单段，
 * 在 VM 里用真实 normalizePatch 执行，证明英文键、嵌套组、别名/错目标、favor、
 * 在场等绕过都会被“先规范化 + allowed 键集合过滤 + 强制目标姓名”拦下。
 * 本测试不改 index：段文本变了就大声失败，不允许静默漂移。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createNpcLedger, normalizePatch, NPC_FIELDS } from './npc-ledger.js';

const indexSource = readFileSync(fileURLToPath(new URL('../index.js', import.meta.url)), 'utf8');

function extractSegment(startMarker, endMarker) {
    const start = indexSource.indexOf(startMarker);
    assert.notEqual(start, -1, `index.js 里找不到白名单段起点：${startMarker}`);
    const end = indexSource.indexOf(endMarker, start);
    assert.notEqual(end, -1, `index.js 里找不到白名单段终点：${endMarker}`);
    return indexSource.slice(start, end + endMarker.length);
}

// 段一：受保护字段集合。段二：规范化 + allowed 过滤 + 强制目标姓名的补丁映射。
const protectedSegment = extractSegment('const NPC_EXTRACT_PROTECTED = new Set([', ']);');
const mappingSegment = `${extractSegment('const allowed = new Set(NPC_FIELDS', 'return { 姓名: record.name, fields };')}\n});`;
for (const anchor of ['normalizePatch(patch', 'allowed.has(key)', 'NPC_EXTRACT_PROTECTED.has(field.label)']) {
    assert.ok(mappingSegment.includes(anchor), `白名单段缺关键锚点 ${anchor}，index 实现漂移，需人工复核`);
}
const sandboxSegment = `${protectedSegment}\n${mappingSegment}\nreturn patches;`;

/** 在 VM 里跑 index 原文段落，拿到映射后的补丁。 */
function extractPatches(patches, targetName) {
    const context = vm.createContext({ NPC_FIELDS, NPC_EXTRACT_PROTECTED: undefined, normalizePatch, record: { name: targetName }, parsed: { patches } });
    return new vm.Script(`(function () { "use strict";\n${sandboxSegment}\n})()`, { filename: 'index-runNpcLedgerExtract-segment.js' }).runInContext(context);
}

// 对抗载荷：英文姓名键指向别人、英文 favor、嵌套组里的态度/在场、fields 组、别名人物、多补丁。
const adversarial = [
    { name: 'B', 身份: '伪装目标', favor: 10, favorReason: '英文好感', log: ['英文流水'], exp: [{ text: '英文经历' }], presence: '不在场', importance: '重要', 设定: { 态度: 'unexpected', 在场: true, 境界: '斗王' }, fields: { 态度: 'nested-fields', 好感: 99 } },
    { 姓名: '炎帝', identity: '别名绕过', 在场: '在场', 态度: '别名态度' },
    { 姓名: 'B', name: 'C', 身份: '多补丁' },
];

// 1) 对照组：没有 index 白名单段、直接落账时，这些绕过真的会发生（证明测试有牙）。
{
    const raw = createNpcLedger();
    raw.apply(adversarial.map(patch => ({ ...patch })), { floor: 1 });
    assert.ok(raw.find('B') || raw.find('C'), '对照组：错目标人物会被建出来');
    assert.equal(raw.get('B')?.favor, 10, '对照组：英文 favor 会直接累加');
    assert.equal(raw.get('B')?.presence, '在场', '对照组：在场会被改写');
}

// 2) 真实入口段 + overwrite 重抽：只能改目标允许的静态字段，其余一律不落地。
{
    const ledger = createNpcLedger();
    ledger.apply({ 姓名: '萧炎', 别名: ['炎帝'], 身份: '萧家少主', 态度: '原有态度', favor: 3 }, { floor: 1 });
    const seeded = ledger.get('萧炎');
    const patches = extractPatches(adversarial, '萧炎');
    assert.equal(patches.length, 3);
    assert.ok(patches.every(patch => patch.姓名 === '萧炎'), '每个补丁都被强制绑定到目标姓名');
    const result = ledger.apply({ 人物: patches }, { floor: null, day: 2, source: '世界书', fillEmpty: false });
    assert.deepEqual(ledger.names(), ['萧炎'], '错目标 B/C 不会被建出来');
    const record = ledger.get('萧炎');
    assert.equal(record.identity, '多补丁', '允许的静态字段按 overwrite 落账');
    assert.equal(record.realm, '斗王', '嵌套组里的允许字段放行');
    assert.equal(record.favor, 3, '好感不许被英文键或嵌套组动');
    assert.deepEqual(record.favorLog, seeded.favorLog, '好感流水不新增任何条目');
    assert.deepEqual(record.log, seeded.log, '流水不许被世界书抄档写入');
    assert.deepEqual(record.exp, seeded.exp, '经历不许被世界书抄档写入');
    assert.equal(record.attitude, '原有态度', '态度受保护');
    assert.equal(record.presence, seeded.presence, '在场受保护：保持抽取前状态');
    assert.equal(record.importance, seeded.importance, '重要度受保护：保持抽取前状态');
    assert.ok(result.applied.every(item => item.name === '萧炎'));
    assert.equal(ledger.get('炎帝')?.identity, '多补丁', '别名仍指向同一份档案，不另建人');
}

// 3) fillEmpty 补空路径：已有静态字段不动，空字段才填，保护集合同样生效。
{
    const ledger = createNpcLedger();
    ledger.apply({ 姓名: '萧炎', 别名: ['炎帝'], 身份: '萧家少主' }, { floor: 1 });
    const patches = extractPatches(adversarial, '萧炎');
    ledger.apply({ 人物: patches }, { floor: null, day: 2, source: '世界书', fillEmpty: true });
    const record = ledger.get('萧炎');
    assert.equal(record.identity, '萧家少主', '补空不覆盖已记下的身份');
    assert.equal(record.realm, '斗王', '空字段允许补');
    assert.equal(record.favor, 0, '补空同样不许带好感');
    assert.equal(record.presence, '不在场', '记录员初始在场状态不被抄档改写');
    assert.deepEqual(ledger.names(), ['萧炎']);
}

console.log('npc-ledger-extract-guard: ok');
