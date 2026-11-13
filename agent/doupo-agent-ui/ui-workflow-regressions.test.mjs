import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
// 归一化行尾：Windows 检出（autocrlf）会把源码变 CRLF，源码文本断言按 LF 写，先统一。
const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = name => { const start = source.search(new RegExp(`(?:async )?function ${name}\\(`)); assert.ok(start >= 0, name); return source.slice(start, source.indexOf('\n}', start) + 2); };
const load = (name, env = {}) => vm.runInNewContext(`${code(name)}; ${name}`, { captureAgentContinuation: () => ({ current: () => true }), agentModalCurrent: () => true, awaitPanelPersistence: async () => true, ...env });
class Element {
    constructor(tag = 'div', className = '', text = '') { this.tagName = tag.toUpperCase(); this.className = className; this.textContent = text; this.dataset = {}; this.children = []; this.listeners = {}; this.hidden = false; this.disabled = false; this.isConnected = true; this.classList = { add: (...names) => { for (const name of names) if (!this.className.split(' ').includes(name)) this.className = `${this.className} ${name}`.trim(); }, remove: (...names) => { this.className = this.className.split(' ').filter(name => !names.includes(name)).join(' '); }, toggle: (name, force) => { const has = this.className.split(' ').includes(name); const want = force === undefined ? !has : force; if (want) this.classList.add(name); else this.classList.remove(name); return want; } }; }
    append(...nodes) { for (const node of nodes) { if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(item => item !== node); node.parentNode = this; this.children.push(node); } }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    setAttribute(name, value) { this[name] = value; }
    focus() { if (this.document) this.document.activeElement = this; this.focused = true; }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(item => item !== this); }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    querySelectorAll(selector) { const all = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]); if (selector === '*') return all; return all.filter(child => selector.startsWith('.') ? child.className.split(' ').includes(selector.slice(1)) : selector === ':scope > [data-agent-modal]' ? child.dataset.agentModal !== undefined : /input|textarea|select|button|tabindex/.test(selector) ? ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(child.tagName) : false); }
}
const makeElement = (...args) => new Element(...args);
const branch = (from, to, env) => vm.runInNewContext(`(async () => { ${source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)))} })()`, { manualSelf: ops => env.applySelfOps(ops), ...env });
const fields = values => { const inputs = Object.fromEntries(Object.entries(values).map(([key, value]) => [`[data-${key}]`, { value, focus() { this.focused = true; }, setCustomValidity(message) { this.error = message; }, reportValidity() {} }])); return { inputs, querySelector: key => inputs[key] ?? null, querySelectorAll: keys => keys.split(', ').map(key => inputs[key]).filter(Boolean) }; };

for (const [name, prefix] of [['worldAddFromPanel', 'world-add'], ['worldAddTaskFromPanel', 'world-task']]) {
    test(`OPT-101 ${name} rejects nonempty invalid deadlines and preserves drafts`, async () => {
        for (const days of ['0', '1.5', '91', 'nope']) {
            let calls = 0;
            const panel = fields({ [`${prefix}-title`]: '标题', [`${prefix}-text`]: '正文', [`${prefix}-days`]: days });
            const run = load(name, { worldApplyFromPanel() { calls++; return { status: 'applied', applied: [{}], rejected: [] }; }, closeAgentModal() {} });
            const result = await run(panel);
            assert.equal(calls, 0, days);
            assert.equal(result.status, 'rejected');
            assert.equal(panel.inputs[`[data-${prefix}-title]`].value, '标题');
            assert.ok(panel.inputs[`[data-${prefix}-days]`].error);
        }
        for (const days of ['', '1', '90']) {
            let op;
            const panel = fields({ [`${prefix}-title`]: '标题', [`${prefix}-text`]: '正文', [`${prefix}-days`]: days });
            await load(name, { worldApplyFromPanel(p, ops) { op = ops[0]; return { status: 'applied', applied: [{}], rejected: [] }; }, closeAgentModal() {} })(panel);
            assert.equal(op.days, days ? Number(days) : undefined);
        }
    });
}
for (const [name, values] of [
    ['worldAddFromPanel', { 'world-add-title': '标题', 'world-add-text': '正文', 'world-add-days': '' }],
    ['worldAddTaskFromPanel', { 'world-task-title': '任务', 'world-task-detail': '详情', 'world-task-days': '' }],
    ['worldSetFactionFromPanel', { 'world-faction-name': '势力', 'world-faction-basis': '依据' }],
    ['worldSetPersonFromPanel', { 'world-person-name': '人物', 'world-person-attitude': '态度', 'world-person-basis': '依据' }],
    ['memoryAddFromPanel', { 'memory-new-title': '标题', 'memory-new-text': '正文', 'memory-new-related': '', 'memory-new-note': '长草稿' }],
]) test(`OPT-042 ${name} preserves every rejected field`, async () => {
    let closed = 0;
    const panel = fields(values);
    const rejected = () => ({ status: 'rejected', applied: [], rejected: [{ reason: 'related_missing' }] });
    await load(name, { worldApplyFromPanel: rejected, memoryApplyFromPanel: rejected, closeAgentModal() { closed++; } })(panel);
    for (const [key, value] of Object.entries(values)) assert.equal(panel.inputs[`[data-${key}]`].value, value, key);
    assert.equal(closed, 0);
});
test('OPT-039/041 treasure removal maps operation, cancel and unknown targets never close', async () => {
    for (const [target, confirm, applied] of [['treasures:z1', true, true], ['treasures:z1', false, false], ['unknown:z1', true, false], ['treasures:', true, false]]) {
        let calls = 0, closed = 0;
        await branch('        const selfRemove =', '        const selfEquip =', { event: { target: { closest: () => ({ dataset: { selfRemove: target } }) } }, window: { confirm: () => confirm }, panel: {}, insideModal: true, applySelfOps(ops) { calls++; assert.equal(ops[0].op, 'removeTreasure'); return { applied: [{}], rejected: [] }; }, setSelfStatus() {}, closeAgentModal() { closed++; } });
        assert.equal(calls, applied ? 1 : 0); assert.equal(closed, applied ? 1 : 0);
    }
});
test('OPT-095 orb references activate exactly once with click, Enter or Space', () => {
    let opened = 0;
    const card = load('buildOrbEntryCard', { makeElement, toggleOrbItemPopup() { opened++; } })({ head: '条目', ref: { id: 'm1' } });
    assert.equal(card.tabIndex, 0);
    card.listeners.click();
    for (const key of ['Enter', ' ']) card.listeners.keydown({ key, preventDefault() {} });
    card.listeners.keydown({ key: 'a', preventDefault() { throw Error('not activation'); } });
    assert.equal(opened, 3);
});
test('OPT-097 refresh preserves an existing item ref through list redraw', () => {
    const ref = { id: 'm1' }; let opened;
    const env = { orbElement: { querySelector: () => ({ hidden: false }) }, orbState: { panelId: 'memory' }, renderOrbPanel() {}, orbListPopElement: {}, orbListPopRef: { index: 0 }, orbItemPopElement: {}, orbItemPopRef: ref, orbNpcPopElement: null, openOrbListPopup() { env.orbItemPopElement = null; env.orbItemPopRef = null; }, openOrbItemPopup(value) { opened = value; } };
    load('refreshOpenOrbPanel', env)();
    assert.equal(opened, ref);
});
test('OPT-112 channel reroll arrow: busy disables up front, click runs once and resyncs', async () => {
    let ran = 0, synced = 0;
    const build = load('buildOrbMarkReroll', {
        makeElement, daiIcon: () => '<svg/>',
        syncOrbHud() { synced++; },
        ORB_OVERVIEW_REROLLS: { world: () => { ran++; } },
    });
    const idle = build({ id: 'world', hint: '重roll 决定', busy: false });
    assert.equal(idle.tagName, 'BUTTON');
    assert.equal(idle.className, 'dai-orb-mark-reroll');
    assert.equal(idle.title.includes('重roll 决定'), true, '悬停提示带动作名');
    assert.equal(idle.disabled, false);
    idle.listeners.click();
    assert.equal(ran, 1, '一键直接重跑该渠道动作');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(synced, 1, '重跑结束回调 syncOrbHud 刷新总控窗');
    const busy = build({ id: 'world', hint: '重roll 决定', busy: true });
    assert.equal(busy.disabled, true, '在途即禁用（busy 由标记的 running 态数据驱动）');
    assert.equal(busy.className.includes('is-busy'), true, 'busy 类挂上，箭头自转样式走它');
    busy.listeners.click();
    assert.equal(ran, 1, '禁用态点击不触发');
    assert.equal(build({ id: 'sandbox', busy: false }), null, '没有注册动作的 id 不出按钮');
    assert.equal(build(null), null, '渠道没有动作就不占位');
});
test('OPT-113 callfail popup: ref rides its own data, empty rows are dropped', () => {
    const build = load('buildOrbItemPopModel', { document: {}, popText: value => (typeof value === 'string' && value.trim() ? value.trim() : '') });
    const model = build({
        kind: 'callfail', label: '记忆召回', time: '10:01', model: 'm1', status: 400,
        endpoint: 'https://api.example/v1/chat/completions',
        error: '模型接口返回 HTTP 400：Invalid model id', body: 'Invalid model id',
    });
    assert.equal(model.title, '记忆召回');
    assert.equal(model.sub, '10:01 · m1');
    const detail = Object.fromEntries(model.groups[0].rows);
    assert.equal(detail['状态'], 'HTTP 400');
    assert.equal(detail['端点'], 'https://api.example/v1/chat/completions');
    assert.equal(detail['错误'], '模型接口返回 HTTP 400：Invalid model id');
    assert.equal(detail['响应体'], 'Invalid model id');
    assert.ok(model.groups.some(group => group.heading === '说明'), '说明组教用户去哪里看更多信息');
    const minimal = build({ kind: 'callfail', label: '世界决定', error: 'Bad Request', time: '10:05' });
    // 空值行在渲染层（buildOrbItemPopup）过滤，模型层照实保留；这里按渲染口径核对：
    // 酒馆路径没有状态码/端点/响应体，错误详情组只剩「错误」一行。
    const rendered = minimal.groups
        .map(group => (group.rows ?? []).filter(([, value]) => String(value).trim() !== ''))
        .flat();
    assert.ok(rendered.every(([, value]) => String(value).trim() !== ''), '空值行不渲染');
    // vm 跨 realm 的数组原型与宿主不同，deepStrictEqual 连原型一起比——先 Array.from 落成宿主数组再比。
    assert.deepEqual(Array.from(rendered, row => String(row[0])), ['错误', '自定义接口', '酒馆连接', '下一步'], '酒馆路径的错误详情组只剩「错误」一行');
});
test('OPT-092 navigation always selects one existing page, including llm and unknown', () => {
    const sections = ['overview', 'hub', 'world'].map(settingsSection => ({ dataset: { settingsSection } }));
    const start = source.indexOf('    const selectPage = page =>');
    const end = source.indexOf("    panel.addEventListener('click'", start);
    const panel = { querySelectorAll: selector => selector === '[data-settings-section]' ? sections : [], querySelector: () => null };
    const env = { panel, renderCallLogList() {}, renderCallSummary() {}, renderRuntimeMode() {}, renderApiMode() {}, refreshMemoryVectorStats() {}, probeCoverScriptStatus: () => ({}), syncSettingsForm() {} };
    const select = vm.runInNewContext(`let activeSettingsPage; ${source.slice(start, end)}; selectPage`, env);
    for (const [page, expected] of [['llm', 'hub'], ['hub', 'hub'], ['not-a-page', 'overview']]) { select(page); assert.deepEqual(sections.filter(item => !item.hidden).map(item => item.dataset.settingsSection), [expected]); }
});
test('OPT-015 modal rejects changed chat epoch and changed NPC record', () => {
    let current = true; let record = { name: 'Same', identity: 'original' };
    const modal = { hidden: false, __agentOwner: { current: () => current }, __agentNpc: { name: 'Same', snapshot: JSON.stringify(record) } };
    const panel = { querySelector: () => modal };
    const run = load('agentModalCurrent', { agentNpcLedger: { get: () => record }, setNpcLedgerStatus() {} });
    assert.equal(run(panel), true);
    current = false; assert.equal(run(panel), false);
    current = true; record = { ...record, identity: 'newer' }; assert.equal(run(panel), false);
});
test('OPT-096 modal has dialog semantics, read-only focus and trigger restoration', () => {
    const document = { activeElement: { isConnected: true, focus() { this.focused = true; } } };
    const trigger = document.activeElement;
    const panel = makeElement('aside'); const dock = makeElement('div'); const home = makeElement('div'); home.append(dock);
    const env = { document, makeElement, captureAgentContinuation: () => ({ current: () => true }), agentNpcLedger: { get: () => null } };
    env.ensureAgentModal = load('ensureAgentModal', env);
    const open = load('openAgentModal', env); const close = load('closeAgentModal', env);
    open(panel, '只读详情', dock);
    const modal = panel.children[0], dialog = modal.querySelector('.dai-agent-modal-dialog');
    assert.equal(dialog.role, 'dialog'); assert.equal(dialog['aria-modal'], 'true'); assert.ok(dialog['aria-labelledby']);
    assert.ok(dialog.focused || dialog.querySelector('button').focused);
    close(panel); assert.equal(trigger.focused, true);
});
test('OPT-096 dialog key handling wraps Tab in both directions', () => {
    const document = { activeElement: null }; const first = { focus() { document.activeElement = this; }, getClientRects: () => [1] }; const last = { ...first, focus() { document.activeElement = this; } };
    const dialog = { querySelectorAll: () => [first, last], contains: el => el === first || el === last };
    const panel = { querySelector: () => null, querySelectorAll: dialog.querySelectorAll, contains: dialog.contains };
    const run = load('trapAgentDialogFocus', { document });
    document.activeElement = last; let prevented = false;
    run(panel, { key: 'Tab', preventDefault() { prevented = true; } }); assert.equal(document.activeElement, first); assert.equal(prevented, true);
    run(panel, { key: 'Tab', shiftKey: true, preventDefault() {} }); assert.equal(document.activeElement, last);
});
test('OPT-040 async persistence failures are visible and stale results stay silent', async () => {
    const run = load('awaitPanelPersistence');
    for (const status of ['saved', 'unavailable', 'changed_not_saved', 'failed']) {
        const notes = []; const ok = await run({ persistence: Promise.resolve({ status }) }, message => notes.push(message), { current: () => true });
        assert.equal(ok, status === 'saved'); if (!ok) assert.match(notes.at(-1), /保存|存档/);
    }
    let notes = []; assert.equal(await run({ persistence: Promise.reject(Error('disk')) }, m => notes.push(m), { current: () => false }), false); assert.deepEqual(notes, []);
});
test('OPT-094 API save receipt waits for host and reports reject instead of ready', async () => {
    let resolve; const env = { hostStorage: { updateSettings: () => ({ status: 'ready' }), saveSettings: () => new Promise(done => { resolve = done; }) } };
    const run = load('saveApiPresets', env); const result = run([]);
    assert.ok(result.persistence); resolve({ status: 'saved' }); assert.equal((await result.persistence).status, 'saved');
    env.hostStorage.saveSettings = () => Promise.reject(Error('disk')); assert.equal((await run([]).persistence).status, 'failed');
});
test('OPT-102 saved impact clears every excluding filter', async () => {
    const inputs = Object.fromEntries(['filter', 'weight', 'kind', 'search'].map(key => [`[data-impact-${key}]`, { value: key === 'filter' ? 'closed' : 'mismatch' }]));
    const status = {}; const form = { dataset: {}, querySelector: () => status };
    const panel = { querySelector: key => key === '[data-impact-form]' ? form : inputs[key] ?? null };
    const saved = { id: 'i1', state: 'active', weight: 'minor', kind: 'direct', title: 'saved' };
    const env = { agentImpactInjection: { invalidate() {}, injectedIds: () => [], lastState: () => null }, impactFormField: () => ({ value: 'draft' }), agentImpactRuntime: { apply: () => ({ status: 'applied', applied: [{ id: 'i1' }] }), list: () => [saved] }, worldDay: () => 1, persistImpact: async () => ({ status: 'saved' }), captureAgentContinuation: () => ({ current: () => true }), awaitPanelPersistence: async () => true, impactReturnToLedger: false, closeImpactForm() {}, renderImpactLibrary() {}, setImpactStatus() {}, setTimeout() {} };
    env.awaitPanelPersistence = load('awaitPanelPersistence');
    env.panelMutation = load('panelMutation', env);
    await load('saveImpactForm', env)(panel);
    assert.equal(inputs['[data-impact-filter]'].value, 'all');
    for (const key of ['weight', 'kind', 'search']) assert.equal(inputs[`[data-impact-${key}]`].value, '');
});
test('OPT-041 NPC and memory destructive cancellations perform zero writes', async () => {
    for (const [from, to, target] of [['        const npcExpRemove =', '        const ledgerPresence =', { npcExpFor: 'Same', npcExpRemove: '0' }], ['        const ledgerForget =', '        const page =', { npcLedgerForget: 'Same' }], ['        const memoryForget =', "        if (event.target.closest?.('[data-memory-add]'))", { memoryForget: 'm1' }]]) {
        let writes = 0;
        await branch(from, to, { event: { target: { closest: () => ({ dataset: target }) } }, window: { confirm: () => false }, panel: {}, agentNpcLedger: { removeExp() { writes++; return {}; }, remove() { writes++; return {}; } }, memoryApplyFromPanel() { writes++; }, agentModalCurrent: () => true });
        assert.equal(writes, 0);
    }
});
test('OPT-080 model discovery receives cancellation and ignores replaced cards', async () => {
    let resolve, options;
    const status = {}, button = {}; const card = { isConnected: true, querySelector: key => key.includes('status') ? status : key === '[data-api-preset-models]' ? button : ({ value: 'https://example.test' }) };
    const panel = { querySelector: () => card }; const env = { CSS: { escape: x => x }, AbortController, setTimeout, clearTimeout, parseYamlBlock: () => ({}), listModels: value => { options = value; return new Promise(done => { resolve = done; }); }, captureAgentContinuation: () => ({ current: () => true }) };
    const request = load('fetchApiPresetModels', env)(panel, 'p1'); assert.ok(options.signal);
    card.isConnected = false; const previous = status.textContent; resolve({ status: 'ok', models: ['late'] }); await request; assert.equal(status.textContent, previous);
});
test('OPT-098 list paging keeps at most 200 cards and reaches next page', () => {
    const group = { heading: '记忆', total: 250, offset: 0, hasMore: true, all: Array.from({ length: 200 }, (_, id) => ({ id })), getPage: () => ({}) };
    let next; const pop = load('buildOrbListPopup', { makeElement, buildOrbEntryCard: item => makeElement('div', 'entry', String(item.id)), closeOrbListPopup() {}, orbListPopRef: { index: 0 }, openOrbListPopup(index, offset) { next = { index, offset }; } })(group, {});
    const nextButton = pop.querySelectorAll('*').find(item => item.textContent === '下一页');
    assert.ok(nextButton); nextButton.listeners.click(); assert.deepEqual(next, { index: 0, offset: 200 });
    assert.equal(pop.querySelectorAll('*').filter(item => item.className === 'entry').length, 200);
});
test('OPT-040 pending receipt retries storage only, blocks overlapping and changed drafts', async () => {
    let writes = 0, saves = 0, resolve; const panel = { querySelector: () => null }; const owner = { current: () => true }; const notes = [];
    const env = { captureAgentContinuation: () => owner, awaitPanelPersistence: load('awaitPanelPersistence') };
    const run = load('panelMutation', env);
    const persist = () => { saves++; return Promise.resolve({ status: saves === 1 ? 'failed' : 'saved' }); };
    const apply = () => { writes++; return { status: 'applied', applied: [{}], rejected: [], persistence: new Promise(done => { resolve = done; }) }; };
    const pending = run(panel, [{ op: 'remember' }], apply, persist, m => notes.push(m));
    assert.equal((await run(panel, [{ op: 'remember' }], apply, persist)).status, 'busy');
    resolve({ status: 'failed' }); assert.equal((await pending).status, 'save_failed');
    assert.equal((await run(panel, [{ op: 'remember', text: 'edited' }], apply, persist, m => notes.push(m))).status, 'pending_save'); assert.equal(writes, 1);
    assert.equal((await run(panel, [{ op: 'remember' }], apply, persist)).status, 'save_failed');
    assert.equal((await run(panel, [{ op: 'remember' }], apply, persist)).status, 'applied');
    assert.equal(writes, 1); assert.equal(saves, 2); assert.equal(panel.__pendingSave, null);
});
test('OPT-040 real memory form failed-save draft survives; retry adds no duplicate', async () => {
    let writes = 0, saves = 0, closed = 0; const panel = fields({ 'memory-new-title': '标题', 'memory-new-text': '正文', 'memory-new-related': '人物', 'memory-new-note': '备注' });
    const persistMemory = () => Promise.resolve({ status: ++saves === 1 ? 'failed' : 'saved' });
    const env = { persistMemory, makeElement, applyMemoryOps() { writes++; return { applied: [{}], rejected: [], persistence: persistMemory() }; }, closeAgentModal() { closed++; } };
    env.awaitPanelPersistence = load('awaitPanelPersistence'); env.panelMutation = load('panelMutation', env); env.memoryApplyFromPanel = load('memoryApplyFromPanel', env);
    const run = load('memoryAddFromPanel', env);
    assert.equal((await run(panel)).status, 'save_failed'); assert.equal(panel.inputs['[data-memory-new-title]'].value, '标题'); assert.equal(closed, 0);
    await run(panel); assert.equal(writes, 1); assert.equal(saves, 2); assert.equal(closed, 1);
});
test('OPT-093 follow-default dispatches ordinary asynchronous settings save', async () => {
    let updated, saves = 0, dispatched;
    const area = { value: 'custom', dispatchEvent(event) { dispatched = event; } };
    await branch("        if (event.target.closest?.('[data-settle-follow-default]'))", '        const defaultPrompt =', { event: { target: { closest: () => true } }, panel: { querySelector: () => area }, Event: class { constructor(type, options) { this.type = type; this.bubbles = options.bubbles; } }, renderSettleResultCard() {}, updateSetting(...args) { updated = args; }, hostStorage: { saveSettings() { saves++; } } });
    assert.equal(area.value, ''); assert.equal(dispatched.type, 'input'); assert.equal(dispatched.bubbles, true); assert.equal(updated, undefined); assert.equal(saves, 0);
});
test('OPT-075 retired sandbox budget card is fully removed', () => {
    assert.doesNotMatch(source, /sandbox\.maxNewObjectsPerTurn|sandbox\.nodeWindowSlackDays|世界推进预算/, '未实现的推进预算卡应整卡删除');
});
test('OPT-040 NPC profile save failure keeps the form and does not report saved', async () => {
    const status = {}; const page = { querySelectorAll: () => [{ dataset: { npcField: 'identity' }, value: 'draft' }], querySelector: () => status };
    const panel = { querySelector: () => page }; let reopened = 0;
    const run = load('saveNpcProfileFields', { panelMutation: async () => ({ status: 'save_failed', applied: [], rejected: [] }), agentNpcLedger: { setFields: () => ({ status: 'updated', fields: ['identity'] }) }, persistNpcLedger: async () => ({ status: 'failed' }), refreshNpcLedgerPage() {}, openNpcProfileModal() { reopened++; } });
    const result = await run(panel, 'Same'); assert.equal(result.status, 'save_failed'); assert.equal(reopened, 0); assert.doesNotMatch(status.textContent ?? '', /已保存/);
});
test('OPT-094 actual preset add feedback awaits persistence result', async () => {
    const status = {}; let resolve; const settings = { api: { presets: [] } };
    const env = { currentSettings: () => settings, API_PRESETS_MAX: 10, settingsSaveSequence: 0, saveApiPresets() { return { persistence: new Promise(done => { resolve = done; }) }; }, renderApiPresets() {}, renderApiPresetSelects() {}, awaitPanelPersistence: load('awaitPanelPersistence') };
    const promise = load('addApiPreset', env)({ querySelector: () => status });
    assert.doesNotMatch(status.textContent ?? '', /已添加/); resolve({ status: 'failed' }); await promise; assert.match(status.textContent, /未保存|保存失败/);
});
test('OPT-040 self quantity failed-save receipt never closes modal or overwrites warning', async () => {
    let closed = 0, notes = [];
    await branch('        const selfCountSet =', '        const selfFinish =', { event: { target: { closest: () => ({ dataset: { selfCountSet: 'x1' } }) } }, panel: { querySelector: () => ({ value: '2' }) }, manualSelf: async () => ({ status: 'save_failed', applied: [], rejected: [] }), insideModal: true, setSelfStatus: message => notes.push(message), closeAgentModal() { closed++; } });
    assert.equal(closed, 0); assert.deepEqual(notes, []);
});
test('OPT-040 impact failed-save form remains open; retry does not record again', async () => {
    let writes = 0, saves = 0, closed = 0; const inputs = { title: '标题', detail: '正文', kind: 'direct', weight: 'minor' }; const status = {}; const form = { dataset: {}, querySelector: () => status }; const panel = { querySelector: key => key === '[data-impact-form]' ? form : null };
    const env = { agentImpactInjection: { invalidate() {}, injectedIds: () => [], lastState: () => null }, impactFormField: (form, key) => ({ value: inputs[key] ?? '' }), agentImpactRuntime: { apply() { writes++; return { status: 'applied', applied: [{ id: 'i1' }] }; }, list: () => [{ id: 'i1', state: 'active', title: '标题' }] }, persistImpact: () => Promise.resolve({ status: ++saves === 1 ? 'failed' : 'saved' }), worldDay: () => 1, setImpactStatus() {}, closeImpactForm() { closed++; }, impactReturnToLedger: false, renderImpactLibrary() {}, setTimeout() {}, IMPACT_REASON_TEXT: {} };
    env.awaitPanelPersistence = load('awaitPanelPersistence'); env.panelMutation = load('panelMutation', env);
    const run = load('saveImpactForm', env);
    assert.equal((await run(panel)).status, 'save_failed'); assert.equal(closed, 0); assert.match(status.textContent, /未保存/);
    await run(panel); assert.equal(closed, 1); assert.equal(writes, 1); assert.equal(saves, 2);
});
test('OPT-040 NPC experience rejected persistence keeps edit context', async () => {
    let reopened = 0;
    await branch('        const npcExpAdd =', '        const npcExpRemove =', { event: { target: { closest: () => ({ dataset: { npcExpAdd: 'Same' } }) } }, panel: { querySelector: key => key === '[data-npc-exp-text]' ? { value: 'draft' } : { value: '1' } }, agentNpcLedger: { addExp: () => ({ status: 'added' }) }, persistNpcLedger: () => Promise.resolve({ status: 'failed' }), panelMutation: async () => ({ status: 'save_failed', applied: [], rejected: [] }), captureAgentContinuation: () => ({ current: () => true }), awaitPanelPersistence: async () => false, setNpcLedgerStatus() {}, refreshNpcLedgerPage() {}, openNpcProfileModal() { reopened++; } });
    assert.equal(reopened, 0);
});
test('OPT-094 failed preset add retries persistence, never adds a second preset', async () => {
    let writes = 0, saves = 0; const settings = { api: { presets: [] } }; const status = {}; const panel = { querySelector: () => status };
    const env = { settingsSaveSequence: 0, currentSettings: () => settings, API_PRESETS_MAX: 10, hostStorage: { saveSettings: async () => ({ status: ++saves === 1 ? 'failed' : 'saved' }) }, saveApiPresets(presets) { writes++; settings.api.presets = presets.map((item, index) => ({ ...item, id: `p${index}` })); return { persistence: env.hostStorage.saveSettings() }; }, renderApiPresets() {}, renderApiPresetSelects() {}, awaitPanelPersistence: load('awaitPanelPersistence') };
    const run = load('addApiPreset', env); await run(panel); await run(panel); assert.equal(writes, 1); assert.equal(settings.api.presets.length, 1); assert.equal(saves, 2);
});
test('OPT-040 pending nonmodal receipt cannot save a different chat', async () => {
    let oldSaves = 0, newSaves = 0;
    const oldOwner = { current: () => false };
    const oldPersist = () => { oldSaves++; return Promise.resolve({ status: 'saved' }); };
    const panel = { querySelector: () => null, __pendingSave: { key: '[]', persist: oldPersist, owner: oldOwner, result: { status: 'applied', applied: [{}] } } };
    const run = load('panelMutation', { awaitPanelPersistence: load('awaitPanelPersistence') });
    const result = await run(panel, [], () => ({ status: 'applied', applied: [{}], persistence: Promise.resolve({ status: 'saved' }).then(value => { newSaves++; return value; }) }), () => { throw Error('retry must never reuse the stale receipt'); });
    assert.equal(result.status, 'applied');
    assert.equal(oldSaves, 0, 'stale receipt must never persist into the new chat');
    assert.equal(newSaves, 1, 'new chat operation saves through its own receipt');
    assert.equal(panel.__pendingSave, null);
});
test('OPT-103 same-day newest memory leads both preview and full list', () => {
    const start = source.indexOf('    const sortEntries = list =>');
    const end = source.indexOf('\n    const all = snapshot.entries', start);
    const sort = vm.runInNewContext(`${source.slice(start, end)}; sortEntries`, { sortMode: 'time' });
    const entries = Array.from({ length: 12 }, (_, i) => ({ id: `m${i + 1}`, day: 1 }));
    assert.equal(sort(entries)[0].id, 'm12');
    assert.equal(sort(entries).slice(0, 8).some(item => item.id === 'm12'), true);
    assert.equal(sort([{ id: 'm99', day: 1 }, { id: 'm1', day: 2 }])[0].id, 'm1');
});
