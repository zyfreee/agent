import assert from 'node:assert/strict';
import { agentAuditLog, getAgentCapabilities, onActivate, onDelete, onDisable, onInstall, onUpdate, onClean, probeAgentCapabilities, recordAgentAudit } from './index.js';

assert.equal(getAgentCapabilities().status, 'unavailable');
recordAgentAudit({ event: 'task_start' });
const auditDefaults = agentAuditLog.list({ limit: 1 })[0];
assert.deepEqual({ taskId: auditDefaults.taskId, sessionId: auditDefaults.sessionId, branchId: auditDefaults.branchId, stateVersion: auditDefaults.stateVersion }, { taskId: 'unknown-task', sessionId: 'unknown-session', branchId: 'unknown-branch', stateVersion: 'unknown-version' });
// 轮次管线散落的审计没带任务名时按事件给人话兜底，运行日志不再满屏 unknown-task
recordAgentAudit({ event: 'turn_lite_settle', outcome: 'ok' });
assert.equal(agentAuditLog.list({ limit: 1 })[0].taskId, '简略总结算');
recordAgentAudit({ event: 'turn_fact_check', outcome: 'ok' });
assert.equal(agentAuditLog.list({ limit: 1 })[0].taskId, '正文核验');
const handlers = { on() {}, removeListener() {} };
const ready = probeAgentCapabilities({ root: { SillyTavern: { getContext: () => ({ version: '1.18.0', eventSource: handlers, event_types: { MESSAGE_EDITED: 'edited' } }) } } });
assert.equal(ready.status, 'ready');
assert.equal(getAgentCapabilities().status, 'ready');
onActivate();
await onInstall();
await onUpdate();
onDelete();
await onClean();
onDisable();
assert.equal(getAgentCapabilities().status, 'unavailable');
console.log('index lifecycle tests passed');
