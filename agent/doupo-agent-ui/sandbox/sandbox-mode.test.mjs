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
assert.match(described.text, /开放世界口径/);
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
const switched = mode.confirm({ ...scope, taskId: 'task-2', stateVersion: 'v8', reason: '玩家决定回到主线' });
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
    limited.confirm({ ...scope, taskId: `t${index}`, stateVersion: `v${index}` });
}
assert.equal(limited.read(scope).history.length, 2);
// OPT-065: snapshots contain only one scope; pending switches are never persisted.
{
    const a = { sessionId: 'A', branchId: 'main' };
    const b = { sessionId: 'B', branchId: 'fork' };
    const source = createSandboxMode();
    source.sync({ ...a, enabled: false });
    source.sync({ ...b, enabled: false });
    source.sync({ ...b, enabled: true, taskId: 'tb', stateVersion: 'vb', inertia: 'strong' });
    source.confirm({ ...b, taskId: 'tb', stateVersion: 'vb' });
    const savedA = source.snapshot(a);
    const savedB = source.snapshot(b);
    const target = createSandboxMode();
    assert.equal(target.restore(savedA, a).status, 'restored');
    target.restore(savedB, b);
    assert.equal(target.read(a).mode, 'mainline');
    assert.equal(target.read(b).mode, 'sandbox');
    assert.equal(target.read(b).history.length, 1);
    assert.equal(target.read(b).inertia, 'strong');
    savedB.record.mode = 'mainline';
    assert.equal(target.read(b).mode, 'sandbox', 'restore must copy');
    source.sync({ ...a, enabled: true, taskId: 'ta', stateVersion: 'va' });
    target.restore(source.snapshot(a), a);
    assert.equal(target.confirm({ ...a, taskId: 'ta', stateVersion: 'va' }).reason, 'no_pending_switch');
    const before = target.read(b);
    assert.equal(target.restore({ schemaVersion: 999, record: {} }, b).status, 'rejected');
    assert.deepEqual(target.read(b), before);
    assert.equal(target.restore(null, a).status, 'empty');
    assert.equal(target.read(a).status, 'empty');
    assert.equal(target.sync({ ...a, enabled: true }).mode, 'sandbox', 'preserve existing first adoption policy');
    assert.equal(target.read(b).mode, 'sandbox', 'restoring A must not clear B');
}

// OPT-066: confirmation must be bound to the current task/state and original mode settings.
{
    const r = createSandboxMode();
    r.sync({ ...scope, enabled: false });
    r.sync({ ...scope, enabled: true, taskId: 't1', stateVersion: 'v1', canonCharactersAutonomous: false });
    assert.equal(r.confirm(scope).reason, 'stale_switch_context');
    assert.equal(r.confirm({ ...scope, taskId: 't2', stateVersion: 'v1' }).reason, 'stale_switch_context');
    assert.equal(r.confirm({ ...scope, taskId: 't1', stateVersion: 'v2' }).reason, 'stale_switch_context');
    assert.equal(r.read(scope).mode, 'mainline');
    assert.equal(r.confirm({ ...scope, taskId: 't1', stateVersion: 'v1' }).status, 'switched');
    assert.equal(r.read(scope).canonCharactersAutonomous, false);
    r.sync({ ...scope, enabled: false, taskId: 't3', stateVersion: 'v3' });
    r.sync({ ...scope, enabled: true, inertia: 'weak' });
    assert.equal(r.confirm({ ...scope, taskId: 't3', stateVersion: 'v3' }).reason, 'no_pending_switch');
}

// 开关随开随关：followSwitch 直接换向，不申请不确认，历史保留、待确认作废。
{
    const r = createSandboxMode();
    r.sync({ ...scope, enabled: true, inertia: 'strong' });
    r.sync({ ...scope, enabled: false, taskId: 't9', stateVersion: 'v9', inertia: 'medium' });
    assert.equal(r.read(scope).mode, 'sandbox', '待确认期间口径不变');
    const flipped = r.followSwitch({ ...scope, sandbox: false, inertia: 'weak' });
    assert.equal(flipped.status, 'ready');
    assert.equal(r.read(scope).mode, 'mainline', '开关关了＝主线，立刻生效');
    assert.equal(r.read(scope).inertia, 'weak');
    assert.equal(r.confirm({ ...scope, taskId: 't9', stateVersion: 'v9' }).reason, 'no_pending_switch', '换向作废待确认变更');
    const back = r.followSwitch({ ...scope, sandbox: true });
    assert.equal(back.mode, 'sandbox', '开关开了＝开放世界，立刻生效');
    assert.equal(back.inertia, 'medium', '没填惯性按默认中；接线层每次都带设置值');
    const fresh = createSandboxMode();
    const created = fresh.followSwitch({ ...scope, sandbox: true, inertia: 'strong', canonCharactersAutonomous: false });
    assert.equal(created.mode, 'sandbox');
    assert.equal(created.inertia, 'strong');
    assert.equal(created.canonCharactersAutonomous, false);
    assert.equal(fresh.read(scope).history.length, 0, '换向不走确认历史');
    const round = createSandboxMode();
    round.sync({ ...scope, enabled: true, inertia: 'strong' });
    round.followSwitch({ ...scope, sandbox: false });
    const restored = createSandboxMode();
    assert.equal(restored.restore(round.snapshot(scope), scope).status, 'restored', '换向后的快照仍可跨重载恢复');
    assert.equal(restored.read(scope).mode, 'mainline');
}

console.log('sandbox mode tests passed');
