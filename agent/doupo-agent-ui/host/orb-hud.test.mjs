import assert from 'node:assert/strict';
import { ORB_ITEMS, createOrbState, buildOrbPanels, buildWorldPanel, buildSelfPanel, buildNpcPanel, buildColdPanel, buildImpactPanel, buildFactsPanel, buildSandboxPanel, buildOverviewPanel, buildMemoryPanel, buildMirrorPanel, buildJournalPanel } from './orb-hud.js';

// —— 图标清单：顺序固定、id 唯一、不依赖外部输入 ——
assert.equal(ORB_ITEMS.length, 11);
assert.deepEqual(ORB_ITEMS.map(item => item.id), ['overview', 'world', 'self', 'memory', 'npcledger', 'cold', 'impact', 'facts', 'mirror', 'journal', 'sandbox']);
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

// —— 空输入：十一个窗都不炸，全是“暂无”——
const empty = buildOrbPanels({});
for (const item of ORB_ITEMS) {
    const panel = empty[item.id];
    assert.equal(panel.title, item.title);
    assert.ok(Array.isArray(panel.rows) && Array.isArray(panel.lists));
    assert.ok(panel.summary.length > 0, `${item.id} 摘要要有内容`);
}
assert.match(empty.world.summary, /暂无/);
assert.equal(empty.world.rows.find(row => row.label === '所在地'), undefined, '空字段不占行');
assert.equal(empty.world.rows.find(row => row.label === '季节'), undefined, '没载入的世界不猜季节');
assert.equal(empty.npcledger.lists[0].items.length, 0);
assert.match(empty.sandbox.summary, /还没有口径记录/);

// —— 世界运转：时钟、信息字段、氛围、势力人物、事件与任务的剩余天数 ——
const world = buildWorldPanel({
    clockText: '第 5 天 08:30',
    status: {
        clock: { day: 5, minute: 510 },
        info: { era: '斗气大陆', location: '乌坦城', weather: '晴', reputation: '', wanted: '魔炎谷通缉' },
    },
    snapshot: {
        clock: { day: 5, minute: 510 },
        tension: 'rising',
        nearEvents: [{ id: 'e1', text: '坊市集市开张', day: 4, weight: 'minor', basis: '酒馆传闻', endDay: 6, done: false, pinned: false }, { id: 'e2', text: '已了结的旧事', day: 2, done: true }],
        worldEvents: [{ id: 'e3', text: '迦南学院招生', day: 3, weight: 'major', endDay: 9, done: false, pinned: true }, { id: 'e4', text: '魔炎谷寻仇的传闻', day: 4, weight: 'rumor', done: false }],
        factions: [
            { name: '魔炎谷', stance: 'hostile', dynamics: '扬言寻仇', basis: '上楼放话', day: 3, updatedDay: 4 },
            { name: '乌坦城萧家', stance: 'allied', dynamics: '', day: 2 },
            { name: '纳兰家', stance: 'wary', day: 1 },
        ],
        people: [
            { name: '萧薰儿', attitude: '亲近', basis: '同窗', updatedDay: 4 },
            { name: '坊市管事', attitude: '', updatedDay: 3 },
        ],
        tasks: [
            { id: 't2', title: '逾期任务', status: 'active', day: 2, endDay: 4 },
            { id: 't3', title: '已完成任务', status: 'done', day: 1, doneDay: 3 },
            { id: 't1', title: '进行中任务', status: 'active', day: 4, endDay: 8, detail: '去坊市买药材', basis: '药老托付' },
        ],
    },
});
assert.equal(world.summary, '第 5 天 08:30');
assert.equal(world.rows.find(row => row.label === '季节').value, '春季', '第 5 天是春季');
assert.equal(world.rows.find(row => row.label === '所在地').value, '乌坦城');
assert.equal(world.rows.find(row => row.label === '名声'), undefined, '没填的名声不占行');
assert.equal(world.rows.find(row => row.label === '世界氛围').value, '升温');
const nearItem = world.lists[0].items[0];
assert.match(nearItem.meta, /剩 2 天/);
assert.equal(nearItem.detail, '酒馆传闻');
const majorItem = world.lists[1].items[0];
assert.match(majorItem.meta, /大事/);
assert.match(majorItem.meta, /置顶/);
assert.equal(world.lists[2].items[0].head, '魔炎谷', '敌对势力排最前');
assert.match(world.lists[2].items[0].meta, /敌对/);
assert.equal(world.lists[2].items[0].detail, '扬言寻仇\n依据：上楼放话');
assert.match(world.lists[2].items[1].meta, /警惕/, '警惕排同盟前面，照注入的立场排序');
assert.match(world.lists[2].items[2].meta, /同盟/);
assert.equal(world.lists[3].items[0].meta, '亲近');
assert.equal(world.lists[3].items[1].meta, '态度未明');
assert.equal(world.lists[4].items[0].head, '逾期任务', '逾期任务排最前');
assert.match(world.lists[4].items[0].meta, /已逾期/);
assert.match(world.lists[4].items[1].meta, /剩 4 天/);
assert.match(world.lists[4].items[2].meta, /已完成于第 3 天/);
assert.match(world.lists[4].items[1].detail, /来源：药老托付/);

// —— 纳戒：计数行 + 功法斗技配方清单 + 行囊装备中排前 + 炼制超期 ——
const self = buildSelfPanel({
    status: { day: 7, profile: { name: '萧炎', gender: '男', age: '15' }, realm: { realm: '斗者', stage: '三星' }, gold: 1200, titles: 1, techniques: 1, skills: 2, items: 5, equipped: 2, recipes: 1, crafting: 1, goals: 2 },
    snapshot: {
        titles: ['萧家废物'],
        techniques: [{ id: 't1', name: '焚诀', grade: '黄阶低级', type: '火属性', note: '药老所授' }],
        skills: [{ id: 's1', name: '八极崩', grade: '玄阶', type: '' }],
        recipes: [{ id: 'r1', name: '回气丹', grade: '一品', craft: '炼药', note: '药材三味' }],
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
assert.match(self.lists[1].items[0].head, /焚诀（黄阶低级）/);
assert.equal(self.lists[1].items[0].detail, '药老所授');
assert.match(self.lists[2].items[0].head, /八极崩（玄阶）/);
assert.match(self.lists[3].items[0].head, /\[装备中\] 玄重尺/);
assert.match(self.lists[4].items[0].head, /回气丹（一品）/);
assert.match(self.lists[5].items[0].head, /炼药·回气丹×2/);
assert.match(self.lists[5].items[0].meta, /已超期/, 'endDay 已过就是超期');
assert.match(self.lists[6].items[0].head, /★ 三年之约/, '主线目标排最前');
assert.match(self.lists[6].items[2].head, /\[已达成\]/);

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

// —— 主角记忆：两层计数 + 关键排前 + 引文与关联 ——
const memory = buildMemoryPanel({
    status: { byTier: { big: { open: 2, total: 3 }, small: { open: 3, total: 5 } }, open: 5, total: 8 },
    snapshot: {
        entries: [
            { id: 'm1', tier: 'big', text: '药老藏在戒指里', weight: 'major', day: 3, quote: '你且叫我老师', related: ['药老', '戒指'], tag: 'secret', done: false },
            { id: 'm2', tier: 'big', text: '旧事', weight: 'minor', day: 1, done: false },
            { id: 'm3', tier: 'small', text: '云岚宗的约', weight: 'major', day: 2, basis: '三年之约', done: false },
            { id: 'm4', tier: 'small', text: '了结的杂事', day: 1, done: true },
        ],
    },
});
assert.match(memory.summary, /记着 8 条记忆，大记忆 2 条、小记忆 3 条还没了结/);
assert.equal(memory.rows.find(row => row.label === '已了结').value, '3 条');
assert.equal(memory.lists[0].items[0].head, '★ 药老藏在戒指里', '关键大记忆排最前');
assert.match(memory.lists[0].items[0].meta, /第 3 天/);
assert.match(memory.lists[0].items[0].meta, /关联：药老、戒指/);
assert.equal(memory.lists[0].items[0].detail, '「你且叫我老师」');
assert.equal(memory.lists[1].items[0].head, '★ 云岚宗的约', '关键小记忆排最前');
assert.equal(memory.lists[1].items[0].detail, '三年之约', '没有引文就给依据');
const memoryEmpty = buildMemoryPanel({});
assert.equal(memoryEmpty.rows.length, 0);
assert.match(memoryEmpty.summary, /还没有记下任何记忆/);

// —— 数据镜像：桥接与 MVU 状态 ——
const mirrorReady = buildMirrorPanel({
    bridge: { status: 'ready', message: '', enabled: true, api: true, tables: 13 },
    mvu: { present: true, namespace: '斗破纳戒', lastError: '', lastSyncAt: '2026-10-31T08:30:00.000Z' },
});
assert.match(mirrorReady.summary, /正在镜像到数据库表格/);
assert.equal(mirrorReady.rows.find(row => row.label === '数据库桥接').value, '已连接');
assert.equal(mirrorReady.rows.find(row => row.label === '桥接表').value, '13 张');
assert.equal(mirrorReady.rows.find(row => row.label === 'MVU 同步').value, '已写入 斗破纳戒');
assert.match(mirrorReady.rows.find(row => row.label === '上次同步').value, /10\/31/, '时间折成短格式（月/日）');
const mirrorMissing = buildMirrorPanel({ bridge: { status: 'missing', message: '未检测到数据库脚本', enabled: true, api: false, tables: 13 }, mvu: { present: false, namespace: '斗破纳戒', lastError: '', lastSyncAt: '' } });
assert.match(mirrorMissing.summary, /没找到数据库脚本/);
assert.equal(mirrorMissing.rows.find(row => row.label === '数据库桥接').tone, 'warn');
assert.equal(mirrorMissing.rows.find(row => row.label === 'MVU 同步').value, '未检测到 MVU 主脚本');
assert.match(buildMirrorPanel({}).summary, /还没有载入/);

// —— 运行日志：流水倒序、事件与结果都翻成中文 ——
const journal = buildJournalPanel({
    records: [
        { taskId: 'task-1', event: 'task_start', outcome: 'processing', timestamp: Date.UTC(2026, 9, 31, 8, 0) },
        { taskId: 'task-1', event: 'quality_rejected', outcome: 'quality_rejected', stage: 'validate', timestamp: Date.UTC(2026, 9, 31, 8, 5) },
        { taskId: 'task-2', event: 'commit_complete', outcome: 'completed', timestamp: Date.UTC(2026, 9, 31, 9, 0) },
    ],
});
assert.match(journal.summary, /审计流水记到 3 条/);
assert.equal(journal.lists[0].items[0].head, '提交完成', '最新的排最前');
assert.equal(journal.lists[0].items[1].head, '质量门拦截');
assert.match(journal.lists[0].items[1].meta, /被拦截/);
assert.match(journal.lists[0].items[1].meta, /validate/);
assert.match(journal.lists[0].items[1].meta, /任务 task-1/);
assert.match(journal.lists[0].items[2].meta, /进行中/);
assert.match(buildJournalPanel({}).summary, /还没有运行流水/);

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
