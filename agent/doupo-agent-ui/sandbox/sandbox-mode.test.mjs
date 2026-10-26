import assert from 'node:assert/strict';
import { createSandboxMode, normalizeInertia, normalizeMode } from './sandbox-mode.js';

const scope = { sessionId: 's1', branchId: 'b1' };
const mode = createSandboxMode({ now: () => '2026-01-01T00:00:00.000Z' });

assert.equal(normalizeMode('sandbox'), 'sandbox');
assert.equal(normalizeMode('nonsense'), 'mainline');
assert.equal(normalizeInertia('weak'), 'weak');
assert.equal(normalizeInertia(undefined), 'medium');

assert.equal(mode.read(scope).status, 'empty');
assert.throws(() => mode.read({ sessionId: '', branchId: 'b1' }), /sessionId/);

const adopted = mode.sync({ ...scope, enabled: true, inertia: 'strong' });
assert.equal(adopted.status, 'adopted');
assert.equal(adopted.mode, 'sandbox');
assert.equal(adopted.inertia, 'strong');
assert.equal(adopted.committed, false);

const unchanged = mode.sync({ ...scope, enabled: true, inertia: 'weak' });
assert.equal(unchanged.status, 'unchanged');
assert.equal(mode.read(scope).inertia, 'weak');

const described = mode.describe(scope);
assert.equal(described.mode, 'sandbox');
assert.match(described.text, /沙盒口径/);
assert.match(described.text, /弱/);

const refused = mode.sync({ ...scope, enabled: false, allowMidgameSwitch: false });
assert.equal(refused.status, 'rejected');
assert.equal(refused.reason, 'midgame_switch_disabled');
assert.equal(mode.read(scope).mode, 'sandbox');

assert.throws(() => mode.sync({ ...scope, enabled: false, allowMidgameSwitch: true }), /taskId/);
const pending = mode.sync({ ...scope, taskId: 'task-1', stateVersion: 'v7', enabled: false, allowMidgameSwitch: true, inertia: 'medium' });
assert.equal(pending.status, 'confirmation_required');
assert.equal(pending.change.from, 'sandbox');
assert.equal(pending.change.to, 'mainline');
assert.equal(mode.read(scope).mode, 'sandbox', '确认前不得改变口径');

assert.equal(mode.cancelSwitch(scope).status, 'cancelled');
assert.equal(mode.confirm(scope).reason, 'no_pending_switch');

mode.sync({ ...scope, taskId: 'task-2', stateVersion: 'v8', enabled: false, allowMidgameSwitch: true });
const switched = mode.confirm({ ...scope, reason: '玩家决定回到主线' });
assert.equal(switched.status, 'switched');
assert.equal(switched.mode, 'mainline');
assert.equal(switched.history.length, 1);
assert.equal(switched.history[0].reason, '玩家决定回到主线');
assert.match(mode.describe(scope).text, /主线口径/);

const external = mode.read(scope);
external.mode = 'sandbox';
assert.equal(mode.read(scope).mode, 'mainline', '读出的对象必须是副本');

assert.equal(mode.invalidate(scope), true);
assert.equal(mode.read(scope).status, 'empty');
mode.sync({ sessionId: 's2', branchId: 'b1', enabled: true });
assert.equal(mode.read({ sessionId: 's2', branchId: 'b1' }).mode, 'sandbox');
assert.equal(mode.read(scope).status, 'empty', '不同会话分支互不影响');
mode.clear();
assert.equal(mode.read({ sessionId: 's2', branchId: 'b1' }).status, 'empty');

const limited = createSandboxMode({ maxHistory: 2 });
for (const [index, enabled] of [[1, true], [2, false], [3, true], [4, false]]) {
    limited.sync({ ...scope, taskId: `t${index}`, stateVersion: `v${index}`, enabled, allowMidgameSwitch: true });
    limited.confirm(scope);
}
assert.equal(limited.read(scope).history.length, 2);
console.log('sandbox mode tests passed');
