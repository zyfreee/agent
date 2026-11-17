import assert from 'node:assert/strict';
import { buildControlDashboard, normalizeTheme } from './control-dashboard.js';
import { createAuditLog } from '../core/audit-log.js';

for (const theme of ['gilt', 'graphite', 'parchment']) assert.equal(normalizeTheme(theme), theme);
for (const [legacy, mapped] of [['black', 'gilt'], ['white', 'parchment'], ['beige', 'parchment']]) assert.equal(normalizeTheme(legacy), mapped);
for (const invalid of ['', null, undefined, 'unknown', {}, '__proto__']) assert.equal(normalizeTheme(invalid), 'gilt');
const scope = { sessionId: 'chat-a', branchId: 'branch-a', taskIds: ['task-a', 'task-b'] };
const identity = { sessionId: scope.sessionId, branchId: scope.branchId, taskId: 'task-a', stateVersion: 'v1' };
const audit = createAuditLog();
const record = (event, extra = {}) => audit.record({ ...identity, event, ...extra });
const build = extra => buildControlDashboard({ scope, records: audit.list(), ...extra });
const moduleOf = (view, id) => view.modules.find(module => module.id === id);
// 旧开关已退役：facts 只读 setting.enabled，存档里残留的 enableFactsLibrary 一律忽略。
for (const legacy of [undefined, true, false]) assert.equal(moduleOf(build({ settings: { setting: { enabled: false }, enableFactsLibrary: legacy } }), 'facts').configuration, '已关闭');
assert.equal(moduleOf(build({ settings: { setting: { enabled: true }, enableFactsLibrary: true } }), 'facts').configuration, '已开启');
const empty = build();
// 剧情账本（剧情决定）是进阶版专属：默认口径（完整版）总控不显示该模块行。
assert.equal(empty.modules.length, 9, 'NPC 决策行回归总控（与其他功能一样挂行）');
assert.equal(moduleOf(empty, 'plot'), undefined);
const advancedDashboard = build({ settings: { apiMode: 'advanced' } });
assert.equal(advancedDashboard.modules.length, 10);
assert.equal(moduleOf(advancedDashboard, 'plot').title, '剧情账本');
assert.equal(moduleOf(build({ settings: { apiMode: 'advanced', plot: { enabled: false } } }), 'plot').configuration, '已关闭');
assert.equal(moduleOf(advancedDashboard, 'plot').state, 'idle');
assert.equal(moduleOf(build({ settings: { apiMode: 'lite' } }), 'plot'), undefined, '简略版总控同样不显示剧情账本行');
// NPC 决策与其他功能一样进总控：开关读 enableNpcAutonomy，计划重估等事件亮在这一行；简略版不挂。
assert.equal(moduleOf(empty, 'npc').title, 'NPC 决策', '完整版能力地图有 NPC 决策行');
assert.equal(moduleOf(empty, 'npc').id, 'npc');
assert.equal(moduleOf(empty, 'npc').enabled, true);
assert.equal(moduleOf(empty, 'npc').configuration, '已开启');
assert.equal(moduleOf(build({ settings: { apiMode: 'lite' } }), 'npc'), undefined, '简略版能力地图没有 NPC 决策行');
assert.equal(moduleOf(advancedDashboard, 'npc').title, 'NPC 决策', '进阶版同样有');
assert.equal(moduleOf(build({ settings: { enableNpcAutonomy: false } }), 'npc').configuration, '已关闭');
assert.equal(moduleOf(empty, 'sandbox').title, '开放世界');
assert.equal(moduleOf(empty, 'sandbox').id, 'sandbox');
assert.equal(moduleOf(empty, 'self').title, '纳戒');
assert.equal(moduleOf(empty, 'self').id, 'self');
assert.equal(moduleOf(empty, 'self').state, 'idle');
assert.equal(moduleOf(empty, 'memory').title, '记忆', '记忆模块补进总控清单（召回+决定的标记挂它行尾）');
assert.equal(moduleOf(empty, 'memory').configuration, '已开启');
assert.equal(moduleOf(build({ settings: { enableMemoryLedger: false } }), 'memory').configuration, '已关闭');
assert.equal(moduleOf(empty, 'llm').enabled, null, '模型与连接没有开关键，enabled 报 null');
assert.equal(moduleOf(empty, 'memory').enabled, true);
assert.equal(empty.taskLabel, '暂无任务');
assert.ok(empty.modules.every(module => module.state === 'idle' && module.timestamp === null));
record('stage_start', { stage: 'facts-query', timestamp: 123 });
assert.equal(moduleOf(build(), 'facts').state, 'processing');
record('stage_complete', { stage: 'facts-query', timestamp: 124, outcome: 'apiKey=secret-must-not-display' });
assert.equal(moduleOf(build(), 'facts').label, '已返回');
assert.match(moduleOf(build(), 'facts').summary, /等待总控统一提交/);
assert.equal(moduleOf(build(), 'facts').timestamp, 124);
assert.ok(!JSON.stringify(build()).includes('secret-must-not-display'));
record('stage_failed', { stage: 'action-resolve', outcome: 'timeout' });
assert.equal(moduleOf(build(), 'action').state, 'failed');
assert.equal(moduleOf(build(), 'action').summary, '等待超时。');
record('stage_start', { stage: 'world-advance' });
record('task_cancelled', { stage: 'world-advance' });
assert.equal(moduleOf(build(), 'world').label, '已停止');
// NPC 决策行在总控：计划重估事件直接亮在这一行。
record('npc_plan_reassessment_requested');
assert.equal(moduleOf(build(), 'npc').label, '等待重新决策', 'NPC 计划重估事件挂 NPC 决策行');
record('npc_plan_reassessment_cleared');
assert.equal(moduleOf(build(), 'npc').label, '障碍已解除', '障碍解除状态跟随最新事件');
assert.equal(moduleOf(build(), 'impact').label, '暂无记录');
assert.match(moduleOf(build(), 'llm').summary, /还没有发出模型请求/);

// Records must match chat, branch, and explicitly known task IDs.
for (const extra of [{ sessionId: 'chat-b' }, { branchId: 'branch-b' }, { taskId: 'unrelated-task' }]) {
    record('stage_failed', { stage: 'facts-query', ...extra });
}
assert.equal(moduleOf(build(), 'facts').label, '已返回');
assert.ok(build({ scope: undefined }).modules.every(module => module.state === 'idle'));
assert.ok(build({ scope: { ...scope, taskIds: [] } }).modules.every(module => module.state === 'idle'));
const configured = build({ settings: { enabled: false, setting: { enabled: false }, llm: { useSillyTavernConnection: false } } });
assert.equal(moduleOf(configured, 'facts').configuration, '已关闭');
assert.equal(moduleOf(configured, 'world').configuration, '已开启 · 总控已暂停');
assert.equal(moduleOf(configured, 'llm').configuration, '使用独立连接');
const tasks = [{ ...identity, status: 'completed_saved' }, { ...identity, sessionId: 'chat-b', status: 'failed_unapplied' }];
assert.equal(build({ tasks }).taskLabel, '已完成并保存');
assert.equal(moduleOf(build({ tasks }), 'facts').label, '已返回', '任务保存状态不能冒充模块运行结果');
// The facts card now follows the injection setting only, and can carry the channel note.
const noteView = buildControlDashboard({
    settings: { setting: { enabled: true } }, records: [], tasks: [], scope,
    injectionNote: '注入通道：可用（IN_CHAT 深度 0）。',
});
const factsNote = noteView.modules.find(module => module.id === 'facts');
assert.equal(factsNote.title, '原著设定');
assert.equal(factsNote.configuration, '已开启');
assert.match(factsNote.summary, /注入通道/);
const worldOff = buildControlDashboard({ settings: { world: { eventEnabled: false } }, records: [], tasks: [], scope });
assert.equal(worldOff.modules.find(module => module.id === 'world').configuration, '已关闭');
console.log('control dashboard scope, metadata, states and theme tests passed');
