import assert from 'node:assert/strict';
import { createAuditLog } from '../core/audit-log.js';
const log = createAuditLog({ maxEntries: 2 });
log.record({ taskId: 't1', sessionId: 's', branchId: 'b', stateVersion: 'v1', event: 'task_start', outcome: 'processing', timestamp: 1, prompt: 'hidden', secret: 'credential', narrative: 'private' });
log.record({ taskId: 't1', sessionId: 's', branchId: 'b', stateVersion: 'v1', event: 'stage_start', stage: 'gather', outcome: 'processing', timestamp: 2 });
log.record({ taskId: 't1', sessionId: 's', branchId: 'b', stateVersion: 'v1', event: 'candidate_ready', outcome: 'candidate_ready', timestamp: 3, npcId: 'captain', planId: 'escort', planVersion: 1, currentPlanVersion: 2 });
const rows = log.list();
assert.equal(rows.length, 2);
assert.equal(rows[0].event, 'stage_start');
assert.equal(rows[1].planVersion, 1);
assert.equal(rows[1].currentPlanVersion, 2);
assert.equal(Object.hasOwn(rows[0], 'prompt'), false);
assert.equal(Object.hasOwn(rows[0], 'secret'), false);
rows[0].stage = 'tampered';
assert.equal(log.list()[0].stage, 'gather');
assert.throws(() => log.record({ taskId: 'x', sessionId: 's', branchId: 'b', stateVersion: 'v1', event: 'model_prompt' }), /不允许/);
log.record({ taskId: 'history-task', sessionId: 's', branchId: 'b', stateVersion: 'v1', event: 'history_candidate_invalidated', outcome: 'history_invalidated' });
assert.equal(log.list()[1].event, 'history_candidate_invalidated');
assert.throws(() => log.list({ limit: 0 }), /limit/);
log.record({ taskId: 'drift-fixture', sessionId: 's', branchId: 'b', stateVersion: 'v1', event: 'setting_drift', outcome: 'detected', prompt: 'private fixture', narrative: 'private fixture' });
assert.equal(log.list().at(-1).event, 'setting_drift');
assert.equal(Object.hasOwn(log.list().at(-1), 'narrative'), false);
assert.equal(log.clear(), 2);
// 回合流水事件：现行每轮管线的七个里程碑都在白名单里，一个不多一个不少。
const turnLog = createAuditLog();
for (const [event, outcome] of [
    ['turn_mvu_arbitrate', 'applied·帧未动兜底'],
    ['turn_memory_decide', 'ok'],
    ['turn_npc_record', 'not_due'],
    ['turn_world_decision', 'ok'],
    ['turn_impact_decide', 'ok'],
    ['turn_settle_adjudicate', 'recorded·4项'],
    ['turn_facts_inject', 'injected'],
]) {
    turnLog.record({ taskId: 'turn-fixture', sessionId: 's', branchId: 'b', stateVersion: 'v1', event, outcome });
}
assert.equal(turnLog.list({ taskId: 'turn-fixture' }).length, 7, '七个回合事件全部入账');
assert.equal(turnLog.list({ taskId: 'turn-fixture' })[0].outcome, 'applied·帧未动兜底', '兜底标记照原样入账');
assert.throws(() => turnLog.record({ taskId: 'x', sessionId: 's', branchId: 'b', stateVersion: 'v1', event: 'turn_bogus' }), /不允许/, '未登记的回合事件仍被拒');
console.log('audit log tests passed');
