import assert from 'node:assert/strict';
import { ORB_ITEMS, createOrbState, buildOrbPanels, buildWorldPanel, buildSelfPanel, buildNpcPanel, buildColdPanel, buildImpactPanel, buildFactsPanel, buildSandboxPanel, buildOverviewPanel } from './orb-hud.js';

// —— 图标清单：顺序固定、id 唯一、不依赖外部输入 ——
assert.equal(ORB_ITEMS.length, 8);
assert.deepEqual(ORB_ITEMS.map(item => item.id), ['overview', 'world', 'self', 'npcledger', 'cold', 'impact', 'facts', 'sandbox']);
assert.ok(ORB_ITEMS.every(item => item.icon && item.title && item.hint));
for (const probe of [ORB_ITEMS, ORB_ITEMS[0]]) assert.equal(Object.isFrozen(probe), true);

// —— 状态机：球 ⇄ 长条 ⇄ 信息窗 ——
const orb = createOrbState();
assert.equal(orb.collapsed, true);
assert.equal(orb.panelId, null);
assert.deepEqual(orb.select('world'), { collapsed: false, panelId: 'world' }, '收起状态下点图标：先展开再开窗');
assert.deepEqual(orb.select('self'), { collapsed: false, panelId: 'self' }, '换图标直接换窗');
assert.deepEqual(orb.select('self'), { collapsed: false, panelId: null }, '再点同一个图标只关窗，长条保留');
assert.deepEqual(orb.select('nope'), { collapsed: false, panelId: null }, '陌生 id 不炸也不开窗');
assert.deepEqual(orb.collapse(), { collapsed: true, panelId: null }, '收起时连信息窗一起关');
assert.deepEqual(orb.toggle(), { collapsed: false, panelId: null });
assert.deepEqual(orb.toggle(), { collapsed: true, panelId: null });
const resumed = createOrbState({ initial: 'impact' });
assert.deepEqual(resumed.toggle(), { collapsed: false, panelId: 'impact' }, '记住上次选中的功能');
assert.deepEqual(createOrbState({ initial: 'nope' }).toggle().panelId, null);

// —— 空输入：八个窗都不炸，全是“暂无”——
const empty = buildOrbPanels({});
for (const item of ORB_ITEMS) {
    const panel = empty[item.id];
    assert.equal(panel.title, item.title);
    assert.ok(Array.isArray(panel.rows) && Array.isArray(panel.lists));
    assert.ok(panel.summary.length > 0, `${item.id} 摘要要有内容`);
}
assert.match(empty.world.summary, /暂无/);
assert.equal(empty.world.rows.find(row => row.label === '所在地'), undefined, '空字段不占行');
assert.equal(empty.npcledger.lists[0].items.length, 0);
assert.match(empty.sandbox.summary, /还没有口径记录/);

// —— 世界运转：时钟、信息字段、事件与任务的剩余天数 ——
const world = buildWorldPanel({
    clockText: '第 5 天 08:30',
    status: {
        clock: { day: 5, minute: 510 },
        info: { era: '斗气大陆', location: '乌坦城', weather: '晴', reputation: '', wanted: '魔炎谷通缉' },
    },
    snapshot: {
        nearEvents: [{ id: 'e1', text: '坊市集市开张', day: 4, weight: 'minor', basis: '酒馆传闻', endDay: 6, done: false, pinned: false }, { id: 'e2', text: '已了结的旧事', day: 2, done: true }],
        worldEvents: [{ id: 'e3', text: '迦南学院招生', day: 3, weight: 'major', endDay: 9, done: false, pinned: true }, { id: 'e4', text: '魔炎谷寻仇的传闻', day: 4, weight: 'rumor', done: false }],
        tasks: [
            { id: 't2', title: '逾期任务', status: 'active', day: 2, endDay: 4 },
            { id: 't3', title: '已完成任务', status: 'done', day: 1, doneDay: 3 },
            { id: 't1', title: '进行中任务', status: 'active', day: 4, endDay: 8, detail: '去坊市买药材', basis: '药老托付' },
        ],
    },
});
assert.equal(world.summary, '第 5 天 08:30');
assert.equal(world.rows.find(row => row.label === '所在地').value, '乌坦城');
assert.equal(world.rows.find(row => row.label === '名声'), undefined, '没填的名声不占行');
const nearItem = world.lists[0].items[0];
assert.match(nearItem.meta, /剩 2 天/);
assert.equal(nearItem.detail, '酒馆传闻');
const majorItem = world.lists[1].items[0];
assert.match(majorItem.meta, /大事/);
assert.match(majorItem.meta, /置顶/);
assert.equal(world.lists[2].items[0].head, '逾期任务', '逾期任务排最前');
assert.match(world.lists[2].items[0].meta, /已逾期/);
assert.match(world.lists[2].items[1].meta, /剩 4 天/);
assert.match(world.lists[2].items[2].meta, /已完成于第 3 天/);
assert.match(world.lists[2].items[1].detail, /来源：药老托付/);

// —— 纳戒：计数行 + 行囊装备中排前 + 炼制超期 ——
const self = buildSelfPanel({
    status: { day: 7, profile: { name: '萧炎', gender: '男', age: '15' }, realm: { realm: '斗者', stage: '三星' }, gold: 1200, titles: 1, techniques: 1, skills: 2, items: 5, equipped: 2, recipes: 3, crafting: 1, goals: 2 },
    snapshot: {
        titles: ['萧家废物'],
        items: [
            { id: 'b2', name: '回气丹', count: 3, category: '丹药', equipped: false },
            { id: 'b1', name: '玄重尺', count: 1, category: '重尺', equipped: true, grade: '凡品' },
        ],
        crafts: [{ id: 'c1', craft: '炼药', name: '回气丹', count: 2, startDay: 5, endDay: 6, status: 'open' }],
        goals: [
            { id: 'g2', text: '赚一金币', priority: '支线', done: false },
            { id: 'g1', text: '三年之约', priority: '主线', done: false },
            { id: 'g3', text: '旧目标', done: true },
        ],
    },
});
assert.match(self.summary, /第 7 天/);
assert.match(self.summary, /斗者三星/);
assert.equal(self.rows.find(row => row.label === '行囊').value, '5 件（装备中 2）');
assert.match(self.lists[1].items[0].head, /\[装备中\] 玄重尺/);
assert.match(self.lists[2].items[0].head, /炼药·回气丹×2/);
assert.match(self.lists[2].items[0].meta, /已超期/, 'endDay 已过就是超期');
assert.match(self.lists[3].items[0].head, /★ 三年之约/, '主线目标排最前');
assert.match(self.lists[3].items[2].head, /\[已达成\]/);

// —— 人物簿：好感刻度与四象限标签 ——
const npc = buildNpcPanel({
    status: { total: 3, present: 2, important: 1 },
    records: [
        { name: '萧薰儿', favor: 45, presence: '在场', importance: '重要', identity: '萧家小姐' },
        { name: '萧战', favor: 0, presence: '不在场', importance: '不重要' },
        { name: '药老', favor: 88, presence: '在场', importance: '重要' },
    ],
});
assert.match(npc.summary, /记了 3 人，在场 2 人/);
assert.match(npc.lists[0].items[0].meta, /友善（45）/);
assert.match(npc.lists[0].items[1].meta, /冷淡（0）/);
assert.match(npc.lists[0].items[2].meta, /信任（88）/);

// —— 冷藏推进：勾选与待确认草稿 ——
const cold = buildColdPanel({
    status: {
        selected: ['萧薰儿', '萧战'],
        previews: [
            { id: 'p1', name: '萧薰儿', status: 'pending', note: '第 3→4 天' },
            { id: 'p2', name: '萧战', status: 'confirmed' },
        ],
    },
});
assert.match(cold.summary, /2 人在后台生活，1 份草稿待确认/);
assert.equal(cold.lists[1].items.length, 1);
assert.equal(cold.lists[1].items[0].head, '萧薰儿');

// —— 世界影响：计数与进行中列表 ——
const impact = buildImpactPanel({
    status: { day: 6, decidedFloor: 12, total: 5, active: 2, ripened: 1, closed: 2, due: 1, archived: 3 },
    records: [
        { id: 'i1', title: '坊市涨价', day: 5, weight: 'major', target: '乌坦城坊市', detail: '药材供不应求' },
        { id: 'i2', title: '萧家声望回升', day: 4, weight: 'minor' },
    ],
});
assert.equal(impact.rows.find(row => row.label === '已对账到').value, '第 12 楼');
assert.match(impact.lists[0].items[0].meta, /大事 · 乌坦城坊市/);
assert.equal(impact.lists[0].items[0].detail, '药材供不应求');

// —— 原著资料与沙盒 ——
const facts = buildFactsPanel({
    stats: { total: 1132, volumes: { 1: 300, 2: 400 }, missingVolume: 5 },
    worldbook: '斗破世界书',
    volume: { label: '第 2 卷（手动）' },
});
assert.equal(facts.rows.find(row => row.label === '世界书').value, '斗破世界书');
assert.equal(facts.rows.find(row => row.label === '当前卷').value, '第 2 卷（手动）');
const factsEmpty = buildFactsPanel({});
assert.equal(factsEmpty.rows.find(row => row.label === '索引').tone, 'warn');
// 各功能输入包互不串：world 包里的 status 不会漏进 self 窗
const mixed = buildOrbPanels({ world: { clockText: '第 2 天 06:00' }, self: { status: { day: 9, profile: { name: '萧炎' }, realm: {} } } });
assert.equal(mixed.world.rows.find(row => row.label === '时钟').value, '第 2 天 06:00');
assert.match(mixed.self.summary, /第 9 天/);
assert.equal(mixed.self.rows.find(row => row.label === '金币'), undefined);
const sandbox = buildSandboxPanel({
    read: { status: 'ready', mode: 'sandbox', inertia: '中', canonCharactersAutonomous: true, history: [{ from: 'mainline', to: 'sandbox' }] },
});
assert.equal(sandbox.rows.find(row => row.label === '本局口径').value, '沙盒');
assert.match(sandbox.rows.find(row => row.label === '口径切换').value, /最近 主线 → 沙盒/);
assert.equal(buildSandboxPanel({ read: { status: 'empty' } }).rows.length, 0);

// —— 总控：模块行照搬仪表盘视图 ——
const overview = buildOverviewPanel({
    dashboard: {
        enabled: true, taskLabel: '已完成并保存',
        modules: [
            { id: 'facts', title: '原著设定', configuration: '已开启', state: 'completed', label: '已返回' },
            { id: 'world', title: '世界运转', configuration: '已开启', state: 'idle', label: '暂无记录' },
        ],
    },
});
assert.match(overview.summary, /总控已开启 · 最近任务：已完成并保存/);
assert.equal(overview.rows[0].value, '已开启 · 已返回');

// —— 上限：长列表裁到上限，不炸 ——
const many = Array.from({ length: 40 }, (_, i) => ({ id: `e${i}`, text: `事件${i}`, day: 1, done: false, weight: 'minor' }));
const capped = buildWorldPanel({ snapshot: { nearEvents: many, worldEvents: [], tasks: [] } });
assert.equal(capped.lists[0].items.length, 8);
const manyPeople = Array.from({ length: 40 }, (_, i) => ({ name: `人物${i}`, favor: 0, presence: '在场', importance: '不重要' }));
assert.equal(buildNpcPanel({ status: { total: 40, present: 40, important: 0 }, records: manyPeople }).lists[0].items.length, 10);

console.log('orb hud state machine, panels and caps tests passed');
