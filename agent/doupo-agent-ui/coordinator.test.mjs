import assert from 'node:assert/strict';
import { createAgentCoordinator } from './coordinator.js';

const events = [];
let tick = 0;
const coordinator = createAgentCoordinator({ dispatch: event => events.push(event), now: () => `t${++tick}` });

const id = coordinator.begin({ taskId: 'turn-1', title: '测试任务', sessionId: 'chat-a', branchId: 'branch-1', stateVersion: 'v1' });
assert.equal(id, 'turn-1');
assert.equal(events.at(-1).status, 'processing');
assert.equal(events.at(-1).replace, true);

assert.equal(coordinator.update(id, 'waiting_input', { message: '需要确认' }).accepted, true);
assert.equal(events.at(-1).status, 'waiting_input');
assert.equal(coordinator.update(id, 'processing', { stateVersion: 'v0' }).reason, 'state_version_mismatch');
assert.throws(() => coordinator.begin({ taskId: 'turn-1' }), /taskId 已存在/);

coordinator.begin({ taskId: 'turn-2', sessionId: 'chat-b', branchId: 'branch-1', stateVersion: 'v1' });
assert.equal(coordinator.update(id, 'completed_saved').reason, 'not_active_task');
assert.equal(coordinator.update('turn-2', 'failed_unapplied', { impact: '无变更', nextStep: '检查后重试' }).accepted, true);
assert.equal(coordinator.update('turn-2', 'processing').reason, 'task_terminal');
assert.equal(coordinator.get('turn-2').impact, '无变更');
assert.equal(coordinator.list().length, 2);
coordinator.clear();
assert.equal(coordinator.list().length, 0);

assert.throws(() => coordinator.begin({ taskId: '' }), /taskId 必须是非空字符串/);
assert.throws(() => coordinator.update('turn-2', 'invented'), /不支持的任务状态/);
console.log('coordinator tests passed');
