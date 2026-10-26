import assert from 'node:assert/strict';
import { buildControlDashboard, normalizeTheme } from './control-dashboard.js';
import { createAuditLog } from '../core/audit-log.js';

for (const theme of ['white', 'black', 'beige']) assert.equal(normalizeTheme(theme), theme);
for (const invalid of ['', null, undefined, 'unknown', {}, '__proto__']) assert.equal(normalizeTheme(invalid), 'black');
const scope = { sessionId: 'chat-a', branchId: 'branch-a', taskIds: ['task-a', 'task-b'] };
const identity = { sessionId: scope.sessionId, branchId: scope.branchId, taskId: 'task-a', stateVersion: 'v1' };
const audit = createAuditLog();
const record = (event, extra = {}) => audit.record({ ...identity, event, ...extra });
const build = extra => buildControlDashboard({ scope, records: audit.list(), ...extra });
const moduleOf = (view, id) => view.modules.find(module => module.id === id);
const empty = build();
assert.equal(empty.modules.length, 7);
assert.equal(moduleOf(empty, 'sandbox').title, '沙盒模式');
assert.equal(moduleOf(empty, 'sandbox').id, 'sandbox');
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
record('npc_plan_reassessment_requested');
assert.equal(moduleOf(build(), 'npc').state, 'waiting');
record('npc_plan_reassessment_cleared');
assert.match(moduleOf(build(), 'npc').summary, /等待下一轮重新评估/);
assert.equal(moduleOf(build(), 'impact').label, '暂无记录');
assert.match(moduleOf(build(), 'llm').summary, /还没有发出模型请求/);

// Records must match chat, branch, and explicitly known task IDs.
for (const extra of [{ sessionId: 'chat-b' }, { branchId: 'branch-b' }, { taskId: 'unrelated-task' }]) {
    record('stage_failed', { stage: 'facts-query', ...extra });
}
assert.equal(moduleOf(build(), 'facts').label, '已返回');
assert.ok(build({ scope: undefined }).modules.every(module => module.state === 'idle'));
assert.ok(build({ scope: { ...scope, taskIds: [] } }).modules.every(module => module.state === 'idle'));
const configured = build({ settings: { enabled: false, enableFactsLibrary: false, llm: { useSillyTavernConnection: false } } });
assert.equal(moduleOf(configured, 'facts').configuration, '已关闭');
assert.equal(moduleOf(configured, 'world').configuration, '已开启 · 总控已暂停');
assert.equal(moduleOf(configured, 'llm').configuration, '使用独立连接');
const tasks = [{ ...identity, status: 'completed_saved' }, { ...identity, sessionId: 'chat-b', status: 'failed_unapplied' }];
assert.equal(build({ tasks }).taskLabel, '已完成并保存');
assert.equal(moduleOf(build({ tasks }), 'facts').label, '已返回', '任务保存状态不能冒充模块运行结果');
// The facts card now follows the injection setting, falls back to the legacy toggle, and can carry the channel note.
const noteView = buildControlDashboard({
    settings: { setting: { enabled: true } }, records: [], tasks: [], scope,
    injectionNote: '注入通道：可用（IN_CHAT 深度 0）。',
});
const factsNote = noteView.modules.find(module => module.id === 'facts');
assert.equal(factsNote.title, '原著设定');
assert.equal(factsNote.configuration, '已开启');
assert.match(factsNote.summary, /注入通道/);
const legacyOnly = buildControlDashboard({ settings: { enableFactsLibrary: false }, records: [], tasks: [], scope });
assert.equal(legacyOnly.modules.find(module => module.id === 'facts').configuration, '已关闭');
console.log('control dashboard scope, metadata, states and theme tests passed');
