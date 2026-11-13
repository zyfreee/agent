import assert from 'node:assert/strict';
import { ORB_ITEMS, createOrbState, buildOrbPanels, buildWorldPanel, buildSelfPanel, buildNpcPanel, buildColdPanel, buildImpactPanel, buildFactsPanel, buildSandboxPanel, buildOverviewPanel, buildMemoryPanel, buildMirrorPanel, buildJournalPanel, buildSettlePanel } from './orb-hud.js';

// OPT-098: truthful totals and bounded pages expose every record beyond 200.
for (const count of [201, 1000]) {
    const panel = buildWorldPanel({ snapshot: { nearEvents: Array.from({ length: count }, (_, i) => ({ id: `e${i}`, title: `事件${i}`, day: i + 1 })) } });
    const section = panel.lists[0];
    assert.equal(section.total, count);
    assert.equal(section.items.length, 4);
    assert.equal(section.all.length, 200);
    assert.equal(section.truncated, true);
    const ids = new Set();
    for (let offset = 0; offset < count; offset += 200) {
        const page = section.getPage(offset);
        assert.ok(page.all.length <= 200);
        assert.equal(page.total, count);
        for (const row of page.all) ids.add(row.ref.id);
    }
    assert.equal(ids.size, count);
}

// —— 图标清单：顺序固定、id 唯一、不依赖外部输入 ——
assert.equal(ORB_ITEMS.length, 12);
assert.deepEqual(ORB_ITEMS.map(item => item.id), ['overview', 'world', 'self', 'memory', 'npcledger', 'cold', 'impact', 'facts', 'settle', 'mirror', 'journal', 'sandbox']);
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

// —— 纳戒主角标签与账本九项对齐：空着也占行显示「暂无」（与纳戒面板的「—」一致）——
for (const label of ['姓名', '性别', '年龄', '种族', '出身', '所属', '斗气属性', '天赋', '外貌']) {
    assert.equal(empty.self.rows.find(row => row.label === label)?.value, '暂无', `${label} 空着也在信息窗占行`);
}

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
        worldEvents: [{ id: 'e3', title: '迦南学院招生', text: '迦南学院招生队进了乌坦城，当街考校少年斗气', day: 3, weight: 'major', endDay: 9, done: false, pinned: true }, { id: 'e4', text: '魔炎谷寻仇的传闻', day: 4, weight: 'rumor', done: false }],
        factions: [
            { name: '魔炎谷', stance: 'hostile', dynamics: '扬言寻仇', basis: '上楼放话', day: 3, updatedDay: 4, type: '宗门', leader: '魔炎谷主' },
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
assert.equal(nearItem.head, '坊市集市开张', '没有 title 的事件拿正文顶标题位');
assert.equal(nearItem.detail, '酒馆传闻', '没标题时行内不重复铺正文，detail 留给依据');
const majorItem = world.lists[1].items[0];
assert.equal(majorItem.head, '迦南学院招生', '有 title 就用 title 当标题');
assert.equal(majorItem.detail, '迦南学院招生队进了乌坦城，当街考校少年斗气', '有标题时行内补一句正文简介');
assert.match(majorItem.meta, /大事/);
assert.match(majorItem.meta, /置顶/);
assert.equal(world.lists[2].items[0].head, '魔炎谷', '敌对势力排最前');
assert.match(world.lists[2].items[0].meta, /敌对/);
assert.match(world.lists[2].items[0].meta, /宗门/, '势力条目 meta 带类型');
assert.match(world.lists[2].items[0].meta, /首领 魔炎谷主/, '势力条目 meta 带首领');
assert.equal(world.lists[2].items[0].detail, '扬言寻仇', '行内只放动向一句，依据收进详情小卡');
assert.match(world.lists[2].items[1].meta, /警惕/, '警惕排同盟前面，照注入的立场排序');
assert.match(world.lists[2].items[2].meta, /同盟/);
assert.equal(world.lists[3].items[0].meta, '亲近');
assert.equal(world.lists[3].items[1].meta, '态度未明');
assert.equal(world.lists[4].items[0].head, '逾期任务', '逾期任务排最前');
assert.match(world.lists[4].items[0].meta, /已逾期/);
assert.match(world.lists[4].items[1].meta, /剩 4 天/);
assert.match(world.lists[4].items[2].meta, /已完成于第 3 天/);
assert.equal(world.lists[4].items[1].detail, undefined, '任务行内不再铺详情，来源与详情收进详情小卡');

// —— 纳戒：计数行 + 功法斗技装备清单 + 行囊装备中排前 + 炼制超期 ——
const self = buildSelfPanel({
    status: { day: 7, profile: { name: '萧炎', gender: '男', age: '15', race: '人族', origin: '乌坦城萧家', affiliation: '萧家', attribute: '火', talent: '过目成诵', appearance: '黑色短发，眼神倔强' }, realm: { realm: '斗者', stage: '三星' }, gold: 1200, titles: 1, techniques: 1, skills: 2, equipment: 2, treasures: 1, items: 5, equipped: 2, recipes: 1, crafting: 1, goals: 2 },
    snapshot: {
        titles: ['萧家废物'],
        techniques: [{ id: 't1', name: '焚诀', grade: '黄阶低级', type: '火属性', note: '药老所授' }],
        skills: [{ id: 's1', name: '八极崩', grade: '玄阶', type: '' }],
        equipment: [
            { id: 'e1', name: '复元甲', grade: '玄阶中品', type: '防具' },
            { id: 'e2', name: '玄重尺', grade: '', type: '武器', note: '家传重尺' },
        ],
        treasures: [{ id: 'z1', name: '青莲地心火', grade: '异火榜第十九', type: '异火', note: '塔戈沙漠所得' }],
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
// 主角标签九项照账本字段顺序全列，且排在境界/金币等计数行前面
{
    const labels = self.rows.map(row => row.label);
    assert.deepEqual(labels.slice(0, 9), ['姓名', '性别', '年龄', '种族', '出身', '所属', '斗气属性', '天赋', '外貌'], '九项主角标签照账本顺序排在最前');
    assert.equal(self.rows.find(row => row.label === '姓名').value, '萧炎');
    assert.equal(self.rows.find(row => row.label === '性别').value, '男');
    assert.equal(self.rows.find(row => row.label === '年龄').value, '15');
    assert.equal(self.rows.find(row => row.label === '种族').value, '人族');
    assert.equal(self.rows.find(row => row.label === '出身').value, '乌坦城萧家');
    assert.equal(self.rows.find(row => row.label === '所属').value, '萧家');
    assert.equal(self.rows.find(row => row.label === '斗气属性').value, '火');
    assert.equal(self.rows.find(row => row.label === '天赋').value, '过目成诵');
    assert.equal(self.rows.find(row => row.label === '外貌').value, '黑色短发，眼神倔强');
}
assert.equal(self.rows.find(row => row.label === '装备').value, '2 件', '装备栏独立计数行');
assert.equal(self.rows.find(row => row.label === '天材地宝').value, '1 件', '天材地宝独立计数行');
assert.equal(self.rows.find(row => row.label === '行囊').value, '5 件');
assert.match(self.lists[1].items[0].head, /焚诀（黄阶低级）/);
assert.equal(self.lists[1].items[0].detail, '药老所授');
assert.match(self.lists[2].items[0].head, /八极崩（玄阶）/);
assert.match(self.lists[3].items[0].head, /复元甲（玄阶中品）/, '装备栏清单排在行囊前');
assert.equal(self.lists[3].items[0].meta, '防具');
assert.equal(self.lists[3].items[1].head, '玄重尺');
assert.equal(self.lists[3].items[1].meta, '武器');
assert.equal(self.lists[3].items[1].detail, '家传重尺');
assert.equal(self.lists[4].heading, '天材地宝', '装备后天材地宝栏');
assert.match(self.lists[4].items[0].head, /青莲地心火（异火榜第十九）/);
assert.equal(self.lists[4].items[0].meta, '异火');
assert.equal(self.lists[4].items[0].detail, '塔戈沙漠所得');
assert.match(self.lists[5].items[0].head, /\[装备中\] 玄重尺/);
assert.match(self.lists[6].items[0].head, /回气丹（一品）/);
assert.match(self.lists[7].items[0].head, /炼药·回气丹×2/);
assert.match(self.lists[7].items[0].meta, /已超期/, 'endDay 已过就是超期');
assert.match(self.lists[8].items[0].head, /★ 三年之约/, '主线目标排最前');
assert.match(self.lists[8].items[2].head, /\[已达成\]/);

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
assert.equal(cold.lists.length, 2, '冷藏面板只有冷藏名单与待确认草稿两列');
assert.equal(cold.lists[1].items.length, 1);
assert.equal(cold.lists[1].items[0].head, '萧薰儿');
assert.equal(cold.lists[0].items[0].detail, undefined, '没传 records 也不炸，主栏目不铺详情');

// —— 冷藏推进：冷藏名单行带自行活动标签、简况与「新」标 ——
const coldWithRecords = buildColdPanel({
    status: { selected: ['刀疤武者', '刘医师'], previews: [] },
    records: [
        {
            name: '刀疤武者', presence: '不在场', location: '中街迎宾客栈收货点', doing: '守点验私货', identity: '加列家护卫头目',
            coldTouch: { day: 1, floor: 19, fields: ['位置', '正在做什么', '流水'], at: '2026-11-01T10:51:37Z' },
            log: [{ floor: 13, day: 1, text: '踩在木箱上挑散干地黄' }, { floor: 19, day: 1, src: '冷藏', text: '守在收货点验私货、断来路' }],
        },
        { name: '刘医师', presence: '在场', log: [] },
    ],
    lastFloor: 20,
});
assert.equal(coldWithRecords.lists[0].items.length, 2);
const scarRow = coldWithRecords.lists[0].items[0];
assert.match(scarRow.meta, /自行/, '有冷藏流水或 coldTouch 就打短标「自行」');
assert.match(scarRow.meta, /新/, '最近一两楼的自行活动标「新」');
assert.match(scarRow.meta, /@中街迎宾客栈收货点/);
assert.equal(scarRow.detail, undefined, '主栏目不铺详情，一行放名字＋标签＋地点时间，长内容点行看小卡');
const plainRow = coldWithRecords.lists[0].items[1];
assert.equal((plainRow.meta || '').includes('自行'), false, '没有自行活动就不打标');
assert.equal(plainRow.detail, undefined);

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
assert.equal(impact.lists[0].items[0].detail, undefined, '影响条目行内不铺详情，详情收进详情小卡');

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
assert.equal(sandbox.rows.find(row => row.label === '本局口径').value, '开放世界');
assert.match(sandbox.rows.find(row => row.label === '口径切换').value, /最近 主线 → 开放世界/);
assert.equal(buildSandboxPanel({ read: { status: 'empty' } }).rows.length, 0);
// 开关关＝功能不存在：面板（图标已隐藏，这是兜底）明说主线口径，不再拿“还没记录”装样子。
const sandboxOff = buildSandboxPanel({ enabled: false, read: undefined });
assert.match(sandboxOff.summary, /已关闭/);
assert.match(sandboxOff.summary, /主线/);

// —— 主角记忆：两层计数 + 关键排前 + 引文与关联 ——
const memory = buildMemoryPanel({
    status: { byTier: { big: { total: 3 }, small: { total: 5 } }, total: 8 },
    snapshot: {
        entries: [
            { id: 'm1', tier: 'big', text: '药老藏在戒指里', weight: 'major', day: 3, quote: '你且叫我老师', related: ['药老', '戒指'], tag: 'secret' },
            { id: 'm2', tier: 'big', text: '旧事', weight: 'minor', day: 1 },
            { id: 'm3', tier: 'small', title: '三年之约立誓', text: '云岚宗的约', weight: 'major', day: 2, basis: '三年之约' },
            { id: 'm4', tier: 'small', text: '路边吃过一碗面', day: 1 },
            { id: 'm5', tier: 'small', title: '加列家中街设卡', text: '正午过后车队在中街撞见加列家设卡盘查，绕羊角巷避开', weight: 'minor', day: 1 },
        ],
    },
});
assert.match(memory.summary, /记着 8 条记忆，大记忆 3 条、小记忆 5 条。/);
assert.equal(memory.rows.find(row => row.label === '大记忆').value, '3 条');
assert.equal(memory.rows.find(row => row.label === '小记忆').value, '5 条');
assert.ok(!memory.rows.some(row => row.label === '已了结'), '了结概念已删除');
assert.equal(memory.lists[1].items[0].head, '★ 药老藏在戒指里', '关键大记忆排最前');
assert.match(memory.lists[1].items[0].meta, /第 3 天/);
assert.doesNotMatch(memory.lists[1].items[0].meta, /关联/, '行内不放关联，关联收进详情小卡');
assert.equal(memory.lists[1].items[0].detail, undefined, '引文与依据不再铺在行内');
assert.equal(memory.lists[2].items[0].head, '★ 三年之约立誓', '关键小记忆排最前，有 title 用 title');
assert.equal(memory.lists[2].items[0].detail, undefined, '没有引文也不在行内给依据，依据进详情小卡');
assert.equal(memory.lists[2].items[1].head, '路边吃过一碗面', '没有 title 用正文');
assert.equal(memory.lists[2].items[2].head, '加列家中街设卡', '短标题优先，正文不进标题位');
assert.ok(!memory.lists[2].items[2].head.includes('羊角巷'), '正文细节不进主页面标题');
assert.equal(memory.lists[0].items.length, 0, '没有注入记录时已注入区为空');
const memoryEmpty = buildMemoryPanel({});
assert.equal(memoryEmpty.rows.length, 0);
assert.match(memoryEmpty.summary, /还没有记下任何记忆/);

// —— 记忆注入记录：本轮已注入区（仿原著资料） ——
const memoryInjected = buildMemoryPanel({
    status: { byTier: { big: { total: 2 }, small: { total: 1 } }, total: 3 },
    snapshot: { entries: [
        { id: 'm2', tier: 'big', title: '穆蛇坊市结怨', text: '穆蛇结怨', weight: 'major', day: 3 },
        { id: 'm1', tier: 'small', title: '面摊吃饭', text: '吃过面', weight: 'minor', day: 5 },
    ] },
    lastInjection: {
        status: 'injected', source: 'recall', note: '穆蛇再登场', ids: ['m2', 'm1'], cleared: false, chars: 704, at: Date.parse('2026-11-04T10:00:00'),
        entries: [
            { id: 'm2', tier: 'big', title: '穆蛇坊市结怨', text: '穆蛇结怨', weight: 'major', day: 3, tag: 'grudge' },
            { id: 'm1', tier: 'small', title: '面摊吃饭', text: '吃过面', weight: 'minor', day: 5 },
        ],
    },
});
assert.match(memoryInjected.summary, /本轮注入了 2 条记忆（召回决定）/);
assert.ok(!memoryInjected.summary.includes('已随生成结束清理'), '未清理时不带已清理措辞');
assert.match(memoryInjected.rows.find(row => row.label === '上次注入').value, /召回决定 · 2 条 · 704 字/);
assert.equal(memoryInjected.rows.find(row => row.label === '注入状态').value, '仍在提示词里');
assert.equal(memoryInjected.lists[0].heading, '已注入的记忆');
assert.equal(memoryInjected.lists[0].items.length, 2, '已注入列表跟随记录');
assert.equal(memoryInjected.lists[0].items[0].head, '★ 穆蛇坊市结怨');
assert.match(memoryInjected.lists[0].items[0].meta, /本轮已注入/);
const memoryInjectedCleared = buildMemoryPanel({
    status: { byTier: { big: { total: 1 }, small: { total: 0 } }, total: 1 },
    snapshot: { entries: [{ id: 'm2', tier: 'big', title: '穆蛇坊市结怨', text: 'x', weight: 'major', day: 3 }] },
    lastInjection: { status: 'injected', source: 'keyword', note: '', ids: ['m2'], cleared: true, chars: 200, at: Date.parse('2026-11-04T10:00:00'), entries: [{ id: 'm2', tier: 'big', title: '穆蛇坊市结怨', text: 'x', weight: 'major', day: 3 }] },
});
assert.match(memoryInjectedCleared.summary, /已随生成结束清理/);
assert.equal(memoryInjectedCleared.rows.find(row => row.label === '注入状态').value, '已清理');
const memoryInjectEmpty = buildMemoryPanel({
    status: { byTier: { big: { total: 0 }, small: { total: 0 } }, total: 0 },
    snapshot: { entries: [] },
    lastInjection: { status: 'empty', source: 'recall', note: '', ids: [], cleared: true, chars: 0, at: Date.parse('2026-11-04T10:00:00'), entries: [] },
});
assert.match(memoryInjectEmpty.summary, /本轮没有记忆进入正文提示词/);

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

// —— 回合流水：现行管线七个里程碑都翻成中文标签，兜底标记与行动数照显 ——
{
    const turnJournal = buildJournalPanel({
        records: [
            { taskId: 'turn', event: 'turn_mvu_arbitrate', stage: 'inline', outcome: 'applied·帧未动兜底', timestamp: Date.UTC(2026, 10, 5, 8, 0) },
            { taskId: 'turn', event: 'turn_memory_decide', outcome: 'ok', timestamp: Date.UTC(2026, 10, 5, 8, 1) },
            { taskId: 'turn', event: 'turn_settle_adjudicate', outcome: 'recorded·4项', timestamp: Date.UTC(2026, 10, 5, 8, 2) },
            { taskId: 'turn', event: 'turn_npc_record', outcome: 'not_due', timestamp: Date.UTC(2026, 10, 5, 8, 3) },
            { taskId: 'turn', event: 'turn_world_decision', outcome: 'ok', timestamp: Date.UTC(2026, 10, 5, 8, 4) },
            { taskId: 'turn', event: 'turn_impact_decide', outcome: 'ok', timestamp: Date.UTC(2026, 10, 5, 8, 5) },
            { taskId: 'turn', event: 'turn_facts_inject', outcome: 'injected', timestamp: Date.UTC(2026, 10, 5, 8, 6) },
        ],
    });
    const heads = turnJournal.lists[0].all.map(item => item.head);
    assert.deepEqual(heads, ['原著注入', '影响记录', '世界推进', '人物记账', '行动结算', '记忆总结', '纳戒仲裁'], '七个回合里程碑全翻中文，最新在最上');
    assert.equal(turnJournal.lists[0].total, 7, '总数如实上报');
    assert.match(turnJournal.lists[0].all[6].meta, /帧未动兜底/, '仲裁兜底标记照显');
    assert.match(turnJournal.lists[0].all[4].meta, /recorded·4项/, '结算行动数照显');
    assert.match(turnJournal.lists[0].all[6].meta, /inline/, '申报通道进 stage 位');
}

// —— 总控：模块行照搬仪表盘视图；没跑过的旧管线「暂无记录」不再占位 ——
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
assert.equal(overview.rows[1].value, '已开启', 'idle 模块只报开关状态，不再挂死「暂无记录」');
assert.equal(overview.rows.length, 2, '总控行数=模块行数：调用状态改挂行尾，不再铺底部列表');

// —— 总控调用标记按真实调用标签匹配：原著选条登记「事实检索」，影响行挂注入挑选员＋决定 ——
// 回归：facts 渠道曾误写成「场记挑选」（那是影响注入挑选员的标签），原著设定行因此永远显示「无」。
const markNow = new Date().toISOString();
const markView = buildOverviewPanel({
    dashboard: {
        enabled: true, taskLabel: 'x',
        modules: [
            { id: 'facts', title: '原著设定', configuration: '已开启', state: 'idle', label: '暂无记录', enabled: true },
            { id: 'memory', title: '记忆', configuration: '已开启', state: 'idle', label: '暂无记录', enabled: true },
            { id: 'impact', title: '世界影响', configuration: '已开启', state: 'idle', label: '暂无记录', enabled: true },
        ],
    },
    mode: 'advanced',
    calls: [
        { label: '事实检索', ok: true, at: markNow },
        { label: '场记挑选', ok: true, at: markNow },
        { label: '影响决定', ok: false, error: '等待超时', at: markNow },
        { label: '记忆召回', ok: true, at: markNow },
        { label: '记忆决定', ok: true, at: markNow },
    ],
    active: [],
});
const markRows = new Map(markView.rows.map(row => [row.label, row]));
assert.deepEqual(markRows.get('原著设定').marks.map(mark => mark.status), ['ok', 'none'], '原著设定行挂「事实检索＋正文核验」两渠道：选条调过打勾，核验没调过标「无」');
assert.deepEqual(markRows.get('原著设定').marks.map(mark => mark.short), ['选条', '核验'], '原著行短名＝选条/核验（核验是生成后事实审计的第二路调用）');
assert.deepEqual(markRows.get('世界影响').marks.map(mark => mark.status), ['ok', 'failed'], '世界影响行挂「场记挑选＋影响决定」两个渠道');
assert.match(markRows.get('世界影响').marks[1].detail, /等待超时/);
// 行尾多记号并排时用短名对齐（记忆＝召回/决定，影响＝挑选/决定），全名保留在悬停标题里。
assert.deepEqual(markRows.get('世界影响').marks.map(mark => mark.short), ['挑选', '决定'], '影响行短名＝挑选/决定');
const memRow = markView.rows.find(row => row.label === '记忆');
if (memRow) assert.deepEqual(memRow.marks.map(mark => mark.short), ['召回', '决定'], '记忆行短名＝召回/决定');

// —— 完整版（非进阶）不挂进阶专属渠道：正文核验运行时已关，核验记号不再永远「无」地占位 ——
const fullFactsView = buildOverviewPanel({
    dashboard: {
        enabled: true, taskLabel: 'x',
        modules: [{ id: 'facts', title: '原著设定', configuration: '已开启', state: 'idle', label: '暂无记录', enabled: true }],
    },
    calls: [{ label: '事实检索', ok: true, at: markNow }],
    active: [], mode: 'full',
});
assert.deepEqual(fullFactsView.rows[0].marks.map(mark => mark.short), ['选条'], '完整版原著行只挂选条：正文核验是进阶版专属渠道');

// —— 剧情账本的「剧情决定」标记挂在 plot 行（回归：MODULE_CHANNELS 曾漏 plot，跑了也显示「无」） ——
const plotMarkView = buildOverviewPanel({
    dashboard: {
        enabled: true, taskLabel: 'x',
        modules: [
            { id: 'plot', title: '剧情账本', configuration: '已开启', state: 'idle', label: '暂无记录', enabled: true },
        ],
    },
    calls: [{ label: '剧情决定', ok: true, at: markNow }],
    active: [], mode: 'advanced',
});
assert.deepEqual(plotMarkView.rows[0].marks.map(mark => mark.short), ['决定'], '剧情账本行挂「剧情决定」渠道');
assert.equal(plotMarkView.rows[0].marks[0].status, 'ok', '剧情决定跑过就打勾，不再永远「无」');
const fullPlotView = buildOverviewPanel({
    dashboard: {
        enabled: true, taskLabel: 'x',
        modules: [
            { id: 'plot', title: '剧情账本', configuration: '已开启', state: 'idle', label: '暂无记录', enabled: true },
        ],
    },
    calls: [{ label: '剧情决定', ok: true, at: markNow }],
    active: [], mode: 'full',
});
assert.deepEqual(fullPlotView.rows[0].marks, [], '完整版下剧情决定渠道不挂标记（模块行本身也会被隐藏）');

// —— 简略版总控：固定三行，行上的分路清单跟着各功能开关变，只显示状态不带开关 ——
const liteNow = new Date().toISOString();
const liteView = buildOverviewPanel({
    mode: 'lite',
    dashboard: { enabled: true, taskLabel: '已完成并保存', modules: [{ id: 'action', title: '行动结算', configuration: '已开启', enabled: true, state: 'idle', label: '暂无记录' }] },
    calls: [{ label: '素材总挑选', ok: true, at: liteNow }, { label: '总结算', ok: false, error: '输出无法解析', at: liteNow }],
    active: [],
    litePickParts: ['原著', '影响'],
    liteSettleParts: ['人物', '世界', '影响', '纳戒', '记忆'],
});
assert.deepEqual(liteView.rows.map(row => row.label), ['素材总挑选', '行动结算', '总结算'], '简略版总控固定三行');
assert.equal(liteView.rows[0].value, '生成前 · 原著／影响一次挑完', '关掉记忆召回，行上就少那一路');
assert.equal(liteView.rows[1].value, '生成前 · 行动判定独立调用');
assert.equal(liteView.rows[2].value, '生成后 · 人物／世界／影响／纳戒／记忆一次记完');
assert.equal(liteView.rows[0].marks[0].status, 'ok');
assert.equal(liteView.rows[2].marks[0].status, 'failed');
assert.equal(liteView.rows.every(row => row.toggle === undefined), true, '总控只看情况，不带勾选');
assert.equal(liteView.rows.some(row => row.label === '原著设定'), false, '完整版的模块行不再混进简略版总控');
assert.match(liteView.summary, /总控已开启 · 简略版/);
// 全关 → 空态文案，标记消失；行动结算开关关 → 行显示已关闭
const liteOff = buildOverviewPanel({
    mode: 'lite',
    dashboard: { enabled: true, taskLabel: 'x', modules: [{ id: 'action', title: '行动结算', configuration: '已关闭', enabled: false, state: 'idle', label: '暂无记录' }] },
    calls: [], active: [], litePickParts: [], liteSettleParts: [],
});
assert.equal(liteOff.rows[0].value, '生成前 · 三路全关，本轮不挑');
assert.equal(liteOff.rows[0].marks.length, 0);
assert.equal(liteOff.rows[1].value, '已关闭，本轮不判定');
assert.equal(liteOff.rows[2].value, '生成后 · 五账全关，本轮不记');
// 不传分路清单时按全开显示（兼容旧调用）
const liteDefault = buildOverviewPanel({ mode: 'lite', dashboard: { enabled: true, taskLabel: 'x', modules: [] }, calls: [], active: [] });
assert.equal(liteDefault.rows[0].value, '生成前 · 原著／影响／记忆一次挑完');

// —— 总控：调用标记直接挂模块行尾——在途转圈、✓、✗、没调过「无」；已关闭的模块不挂 ——
const now = new Date().toISOString();
const statusView = buildOverviewPanel({
    dashboard: {
        enabled: true, taskLabel: '暂无任务',
        modules: [
            { id: 'self', title: '纳戒', configuration: '已开启', enabled: true, state: 'idle', label: '暂无记录' },
            { id: 'memory', title: '记忆', configuration: '已开启', enabled: true, state: 'idle', label: '暂无记录' },
            { id: 'world', title: '世界运转', configuration: '已开启', enabled: true, state: 'idle', label: '暂无记录' },
            { id: 'action', title: '行动结算', configuration: '已关闭', enabled: false, state: 'idle', label: '暂无记录' },
            { id: 'llm', title: '模型与连接', configuration: '使用酒馆连接', enabled: null, state: 'idle', label: '暂无记录' },
        ],
    },
    calls: [
        { at: now, label: '纳戒决定', ok: true },
        { at: now, label: '世界决定', ok: false, error: 'HTTP 503' },
        { at: now, label: '档案抄录', ok: true },
    ],
    active: ['记忆召回'],
});
const marksOf = title => statusView.rows.find(item => item.label === title)?.marks;
assert.deepEqual(marksOf('纳戒决定'), undefined, '行标签是模块名，渠道标记在 marks 里');
const selfMarks = marksOf('纳戒');
assert.equal(selfMarks?.length, 1, '纳戒行挂一个渠道标记');
assert.equal(selfMarks[0].label, '纳戒决定');
assert.equal(selfMarks[0].status, 'ok', '最近一次成功 → 打勾');
assert.match(selfMarks[0].detail, /^\d{2}:\d{2}:\d{2}/, '成功标记带时间，悬停可看');
const memoryMarks = marksOf('记忆');
assert.equal(memoryMarks?.length, 2, '记忆行并排挂召回+决定两个标记');
assert.deepEqual(memoryMarks.map(item => item.label), ['记忆召回', '记忆决定']);
assert.equal(memoryMarks[0].status, 'running', '在途 → 转圈');
assert.equal(memoryMarks[1].status, 'none', '没调过的渠道 → 无');
const worldMarks = marksOf('世界运转');
assert.equal(worldMarks[0].status, 'failed', '最近一次失败 → 打叉');
assert.match(worldMarks[0].detail, /HTTP 503/, '失败标记带原因');
assert.deepEqual(marksOf('行动结算'), [], '已关闭的模块不显示记号，但保留空槽位对齐「已开启」列');
assert.deepEqual(marksOf('模型与连接'), [], '没有渠道的模块保留空槽位');
assert.equal(statusView.rows.find(item => item.label === '档案抄录'), undefined, '渠道清单之外的调用不占模块行');
assert.match(statusView.summary, /正在调用：记忆召回/, '摘要行播报在途调用（含渠道外调用也照播）');
const idleView = buildOverviewPanel({ dashboard: { enabled: true, taskLabel: '暂无任务', modules: [] } });
assert.doesNotMatch(idleView.summary, /正在调用/, '没有在途调用时不播报');
assert.equal(idleView.rows.every(item => !item.marks?.some(mark => mark.status === 'running')), true, '无在途时没有转圈标记');
assert.equal(idleView.rows.every(item => !Array.isArray(item.marks) || item.marks.every(mark => mark.status === 'none')), true, '没有任何调用时全部标「无」');

// —— 总控渠道标记的重roll 箭头投影：箭头挂在各自渠道上，开关/版本门控，busy 看标记 running 态 ——
{
    const rerollModules = worldEnabled => ([
        { id: 'world', title: '世界运转', configuration: '已开启', enabled: worldEnabled, state: 'idle', label: '暂无记录' },
        { id: 'facts', title: '原著设定', configuration: '已开启', enabled: true, state: 'idle', label: '暂无记录' },
        { id: 'plot', title: '剧情账本', configuration: '已开启', enabled: true, state: 'idle', label: '暂无记录' },
        { id: 'action', title: '行动结算', configuration: '已开启', enabled: true, state: 'idle', label: '暂无记录' },
        { id: 'memory', title: '记忆', configuration: '已开启', enabled: true, state: 'idle', label: '暂无记录' },
        { id: 'impact', title: '世界影响', configuration: '已开启', enabled: true, state: 'idle', label: '暂无记录' },
    ]);
    const rowOf = (view, label) => view.rows.find(item => item.label === label);
    const fullReroll = buildOverviewPanel({ dashboard: { enabled: true, taskLabel: 'x', modules: rerollModules(true) }, calls: [], active: [], mode: 'full' });
    assert.equal(fullReroll.apiMode, 'full', '总控投影带回调用版本（渲染层打徽章用）');
    assert.deepEqual(rowOf(fullReroll, '世界运转').marks[0].reroll, { id: 'world', hint: '重roll 决定', busy: false }, '世界行「决定」标记上挂重roll 箭头');
    assert.deepEqual(rowOf(fullReroll, '行动结算').marks[0].reroll, { id: 'action', hint: '重roll 判定（预览，不注入）', busy: false }, '行动结算行箭头＝预览判定');
    const fullMemoryMarks = rowOf(fullReroll, '记忆').marks;
    assert.deepEqual(fullMemoryMarks.map(mark => mark.reroll?.id ?? null), ['recall', 'memory'], '记忆行两路请求各挂一枚箭头：召回/决定各管各的');
    const fullImpactMarks = rowOf(fullReroll, '世界影响').marks;
    assert.deepEqual(fullImpactMarks.map(mark => mark.reroll?.id ?? null), ['impactpick', 'impact'], '影响行两路请求各挂一枚箭头：挑选/影响决定各管各的');
    assert.equal(rowOf(fullReroll, '原著设定').marks.length, 1, '完整版原著行只剩选条：核验渠道不占位');
    assert.equal(rowOf(fullReroll, '原著设定').marks[0].label, '事实检索');
    assert.equal(rowOf(fullReroll, '原著设定').marks[0].reroll?.id, 'factsselect', '选条路自己挂箭头：点了就是重挑一遍原著设定');
    assert.deepEqual(rowOf(fullReroll, '剧情账本').marks, [], '完整版剧情行不挂渠道（模块行本身也会被隐藏）');
    const advReroll = buildOverviewPanel({ dashboard: { enabled: true, taskLabel: 'x', modules: rerollModules(true) }, calls: [], active: [], mode: 'advanced' });
    assert.equal(advReroll.apiMode, 'advanced');
    const advFactsMarks = rowOf(advReroll, '原著设定').marks;
    assert.deepEqual(advFactsMarks.map(mark => mark.reroll?.id ?? null), ['factsselect', 'facts'], '进阶版原著行两路各挂箭头：选条/核验');
    assert.equal(rowOf(advReroll, '剧情账本').marks[0].reroll?.id, 'plot', '进阶版剧情行有箭头');
    const busyReroll = buildOverviewPanel({ dashboard: { enabled: true, taskLabel: 'x', modules: rerollModules(true) }, calls: [], active: ['世界决定'], mode: 'full' });
    assert.equal(rowOf(busyReroll, '世界运转').marks[0].status, 'running');
    assert.deepEqual(rowOf(busyReroll, '世界运转').marks[0].reroll, { id: 'world', hint: '重roll 决定', busy: true }, '标记在途 → 该渠道箭头禁用自转');
    assert.deepEqual(rowOf(busyReroll, '行动结算').marks[0].reroll.busy, false, '别的路在途不影响本行');
    const offReroll = buildOverviewPanel({ dashboard: { enabled: true, taskLabel: 'x', modules: rerollModules(false) }, calls: [], active: [], mode: 'full' });
    assert.deepEqual(rowOf(offReroll, '世界运转').marks, [], '已关闭的模块没有可重跑的调用，标记与箭头一起消失');
}
// —— 简略版三行的重roll 箭头：该路活着才给，挂在标记上 ——
{
    const liteAlive = buildOverviewPanel({
        mode: 'lite',
        dashboard: { enabled: true, taskLabel: 'x', modules: [{ id: 'action', title: '行动结算', configuration: '已开启', enabled: true, state: 'idle', label: '暂无记录' }] },
        calls: [], active: [], litePickParts: ['原著'], liteSettleParts: ['人物'],
    });
    assert.equal(liteAlive.apiMode, 'lite');
    assert.deepEqual(liteAlive.rows.map(row => row.marks[0]?.short), ['挑选', '判定', '结算'], '简略版芯片用两字短名，等宽才对得齐');
    assert.deepEqual(liteAlive.rows[0].marks[0].reroll, { id: 'litepick', hint: '重roll 挑选', busy: false }, '素材总挑选活着 → 标记挂箭头');
    assert.deepEqual(liteAlive.rows[1].marks[0].reroll, { id: 'action', hint: '重roll 判定（预览，不注入）', busy: false }, '简略版行动结算行箭头同款预览');
    assert.deepEqual(liteAlive.rows[2].marks[0].reroll, { id: 'litesettle', hint: '重roll 结算', busy: false }, '总结算活着 → 标记挂箭头');
    const liteDead = buildOverviewPanel({
        mode: 'lite',
        dashboard: { enabled: true, taskLabel: 'x', modules: [{ id: 'action', title: '行动结算', configuration: '已关闭', enabled: false, state: 'idle', label: '暂无记录' }] },
        calls: [], active: [], litePickParts: [], liteSettleParts: [],
    });
    assert.deepEqual(liteDead.rows.map(row => row.marks.length), [0, 0, 0], '全关的三行没有标记与箭头');
}

// —— 总控首行「上次失败」：置顶一眼看到，行内只留一句短话（哪路 · 状态码 · 时间），长文本收进弹卡 ——
{
    const failView = buildOverviewPanel({
        dashboard: { enabled: true, taskLabel: 'x', modules: [{ id: 'world', title: '世界运转', configuration: '已开启', enabled: true, state: 'idle', label: '暂无记录' }] },
        calls: [
            { at: '2026-11-13T10:00:00', label: '世界决定', ok: true },
            { at: '2026-11-13T10:01:00', label: '记忆召回', ok: false, status: 400, error: '模型接口返回 HTTP 400（POST https://api.example/v1/chat/completions）：Invalid model id', model: 'm1', body: 'Invalid model id' },
        ],
        active: [],
    });
    assert.equal(failView.rows[0].label, '上次失败', '失败行置顶');
    assert.equal(failView.rows[0].tone, 'warn', 'warn 色醒目');
    assert.match(failView.rows[0].value, /^记忆召回 · HTTP 400（/, '行内只留一句：哪路 · 状态码 · 时间，不长文');
    assert.ok(!failView.rows[0].value.includes('（POST'), '长文本（端点/原因）不进行内');
    assert.match(failView.rows[0].hint, /记忆召回：模型接口返回 HTTP 400/, '悬停提示带完整错误');
    assert.match(failView.rows[0].hint, /响应体：Invalid model id/, '悬停提示带响应体片段');
    assert.equal(failView.rows[1].label, '世界运转', '模块行跟在失败行后面');
    assert.equal(failView.rows[0].marks, undefined, '失败行不占标记槽位：值列占满整行，不长文换行');
    // 行带 ref：渲染层据此把整行变成可点（手机没有悬停，点击弹详情小卡）
    assert.equal(failView.rows[0].ref.kind, 'callfail');
    assert.equal(failView.rows[0].ref.label, '记忆召回');
    assert.equal(failView.rows[0].ref.status, 400, '状态码进 ref 给弹卡');
    assert.equal(failView.rows[0].ref.body, 'Invalid model id');
    assert.equal(failView.rows[0].ref.error, '模型接口返回 HTTP 400（POST https://api.example/v1/chat/completions）：Invalid model id');
    assert.equal(failView.rows[0].ref.endpoint, '', '夹具没带端点，照实为空');
    // 失败渠道标记同样带详情字段：点击可弹该路的详情小卡
    const failedMarkView = buildOverviewPanel({
        dashboard: { enabled: true, taskLabel: 'x', modules: [{ id: 'world', title: '世界运转', configuration: '已开启', enabled: true, state: 'idle', label: '暂无记录' }] },
        calls: [{ at: '2026-11-13T10:01:00', label: '世界决定', ok: false, error: 'HTTP 400：boom', model: 'm1', endpoint: 'https://x/v1/chat/completions', body: 'boom' }],
        active: [], mode: 'full',
    });
    const failedMark = failedMarkView.rows.find(row => row.label === '世界运转').marks[0];
    assert.equal(failedMark.at, '2026-11-13T10:01:00');
    assert.equal(failedMark.error, 'HTTP 400：boom');
    assert.equal(failedMark.model, 'm1');
    assert.equal(failedMark.endpoint, 'https://x/v1/chat/completions');
    assert.equal(failedMark.body, 'boom');
    // 简略版同样置顶
    const liteFail = buildOverviewPanel({
        mode: 'lite',
        dashboard: { enabled: true, taskLabel: 'x', modules: [] },
        calls: [{ at: '2026-11-13T10:01:00', label: '总结算', ok: false, error: '输出无法解析' }],
        active: [],
    });
    assert.equal(liteFail.rows[0].label, '上次失败', '简略版失败行也置顶');
    assert.equal(liteFail.rows[1].label, '素材总挑选', '简略版三行跟在后面');
    const cleanView = buildOverviewPanel({ dashboard: { enabled: true, taskLabel: 'x', modules: [] }, calls: [{ at: 'x', label: 'a', ok: true }] });
    assert.deepEqual(cleanView.rows, [], '没有失败就不加行');
    // 失败之后同一路重roll成功：行降为 muted 并缀「· 已恢复」，不再挂着警报
    const recoveredView = buildOverviewPanel({
        dashboard: { enabled: true, taskLabel: 'x', modules: [] },
        calls: [
            { at: '2026-11-13T10:01:00', label: '素材总挑选', ok: false, status: 400, error: 'HTTP 400：模型名无效' },
            { at: '2026-11-13T10:03:00', label: '素材总挑选', ok: true },
        ],
        active: [], mode: 'lite',
    });
    assert.equal(recoveredView.rows[0].label, '上次失败', '恢复后失败行仍在（留档可查）');
    assert.equal(recoveredView.rows[0].tone, 'muted', '已恢复的失败行降为 muted 灰');
    assert.match(recoveredView.rows[0].value, /· 已恢复$/, '行内缀「· 已恢复」');
    assert.equal(recoveredView.rows[0].ref.recovered, true, 'ref 带恢复标记给弹卡');
    // 别的路恢复不算数：还是 warn，不缀已恢复
    const otherRecovered = buildOverviewPanel({
        dashboard: { enabled: true, taskLabel: 'x', modules: [] },
        calls: [
            { at: '2026-11-13T10:01:00', label: '素材总挑选', ok: false, status: 400, error: 'boom' },
            { at: '2026-11-13T10:03:00', label: '总结算', ok: true },
        ],
        active: [], mode: 'lite',
    });
    assert.equal(otherRecovered.rows[0].tone, 'warn', '同一路没成功就不算恢复');
    assert.ok(!otherRecovered.rows[0].value.includes('已恢复'), '没恢复不缀已恢复');
}

// —— 主窗预览 / 副窗全量：items 只给几条，all 收全量，total 报总数 ——
const many = Array.from({ length: 40 }, (_, i) => ({ id: `e${i}`, text: `事件${i}`, day: 1, done: false, weight: 'minor' }));
const capped = buildWorldPanel({ snapshot: { nearEvents: many, worldEvents: [], tasks: [] } });
assert.equal(capped.lists[0].items.length, 4, '主信息窗每栏只铺最新 4 条');
assert.equal(capped.lists[0].all.length, 40, '全量留在 all 里给「全部」副窗');
assert.equal(capped.lists[0].total, 40, 'total 报总数，信息窗靠它决定挂不挂「全部」');
assert.equal(capped.lists[0].items[0].head, '事件39', '最新的排最前');
assert.equal(capped.lists[0].all.at(-1).head, '事件0', '副窗铺到最旧一条');
const manyPeople = Array.from({ length: 40 }, (_, i) => ({ name: `人物${i}`, favor: 0, presence: '在场', importance: '不重要' }));
const npcCapped = buildNpcPanel({ status: { total: 40, present: 40, important: 0 }, records: manyPeople });
assert.equal(npcCapped.lists[0].items.length, 4);
assert.equal(npcCapped.lists[0].all.length, 40, '人物簿副窗能翻到全部 40 人');
// 条数没超过预览上限的栏目不该挂「全部」
const few = buildNpcPanel({ status: { total: 2, present: 2, important: 0 }, records: manyPeople.slice(0, 2) });
assert.equal(few.lists[0].total, few.lists[0].items.length, '装得下就没有「全部」按钮');
// 事件两栏：置顶最前，其余按日期倒序
const ordered = buildWorldPanel({
    status: { clock: { day: 9 } },
    snapshot: {
        nearEvents: [
            { id: 'e1', text: '早的', day: 2, done: false },
            { id: 'e9', text: '晚的', day: 8, done: false },
            { id: 'e5', text: '钉住的', day: 1, done: false, pinned: true },
        ],
    },
});
assert.equal(ordered.lists[0].items[0].head, '钉住的', '置顶事件排最前');
assert.equal(ordered.lists[0].items[1].head, '晚的', '其余按登记日期倒序');

// —— 行动结算：判定记录折成信息窗（注入/无可结算/失败/空输入） ——
{
    const injected = buildSettlePanel({ lastAdjudication: {
        status: 'injected', category: 'combat', outcome: '被拳劲扫中，倒退两步。', note: '同境界切磋，幅度中等',
        effects: [{ targetId: 'player', field: 'hp', type: 'add', value: -120, allowNegative: true, reason: '拳劲' }],
        rejected: [{ index: 1, reason: '战斗中 hp/douqi 只减不增，恢复归丹药判定' }],
        at: Date.parse('2026-11-04T12:00:00'), cleared: false,
    } });
    assert.equal(injected.title, '行动结算');
    assert.match(injected.summary, /伤害判定/);
    assert.match(injected.summary, /仍在提示词里/);
    assert.ok(injected.rows.some(rowItem => rowItem.label === '判定类别' && rowItem.value === '伤害判定'));
    assert.ok(injected.rows.some(rowItem => rowItem.label === '数值变化' && rowItem.value.includes('1 条')));
    assert.equal(injected.lists[0].heading, '本轮变化');
    assert.equal(injected.lists[0].items[0].head, '生命 -120');
    assert.equal(injected.lists[1].heading, '被脚本拦下');

    const none = buildSettlePanel({ lastAdjudication: { status: 'none', category: 'none', outcome: '本轮无可结算', effects: [], rejected: [], at: 1 } });
    assert.match(none.summary, /没有可结算/);
    assert.equal(none.lists[0].items.length, 0);

    const cleared = buildSettlePanel({ lastAdjudication: { status: 'injected', category: 'general', outcome: '买了两枚回气丹', effects: [{ targetId: 'player', field: 'gold', type: 'add', value: -50 }], rejected: [], at: 1, cleared: true } });
    assert.match(cleared.summary, /已随生成结束清理/);
    assert.equal(cleared.lists[0].items[0].head, '金币 -50');

    const failed = buildSettlePanel({ lastAdjudication: { status: 'error', summary: '判定失败：接口超时', at: 1 } });
    assert.match(failed.summary, /判定失败/);
    assert.ok(failed.rows.some(rowItem => rowItem.tone === 'warn'));

    const blank = buildSettlePanel({});
    assert.match(blank.summary, /还没有判定过/);
    assert.equal(blank.rows.length, 0, '空输入不占行');
}
// —— v2：只读审核后的多行动，逐项保留顺序；顶层旧汇总不能复活拒收事实 ——
{
    const record = {
        status: 'injected', category: 'combat', outcome: '不安全顶层结果', note: '不安全模型理由', summary: '不安全模型摘要',
        effects: [{ field: 'gold', type: 'add', value: 9999 }], rejected: [{ reason: '顶层重复拒收' }],
        at: Date.parse('2026-11-04T12:00:00'), cleared: false,
        actions: [
            { id: 'a1', category: 'alchemy', label: '服用回气丹', evidence: '玩家确实服药', status: 'success', approved: true,
                outcome: '药力化开，恢复少许斗气。', consequences: ['药瓶空了', '嘴里略苦'],
                effects: [{ field: 'douqi', type: 'add', value: 20, reason: '回气丹药力' }], rejected: [] },
            { id: 'a2', category: 'cultivation', label: '不安全宣称跨境突破成功', evidence: '不安全成功依据', status: 'not_executed', approved: false,
                outcome: '突破条件不足，未执行境界变化。', consequences: [], effects: [],
                rejected: [{ reason: '跨度超过允许范围' }], blockedReason: '当前未达九星圆满' },
            { id: 'a3', category: 'general', label: '购药', status: 'partial', approved: true,
                outcome: '只购得一枚药材。', consequences: [],
                effects: [
                    { field: 'gold', type: 'add', value: -50 },
                    { field: 'items', type: 'add', itemId: 'herb-1', name: '凝血草', category: '药材', value: 1 },
                    { field: 'items', type: 'remove', value: { itemId: 'bottle-1', name: '空药瓶', category: '杂物', count: 1 } },
                    { field: 'location', type: 'set', value: '乌坦城·药铺' },
                ], rejected: ['卖家没有第二枚药材'] },
        ],
        reconciliation: { status: 'pending', differences: [] },
    };
    const before = structuredClone(record);
    const panel = buildSettlePanel({ lastAdjudication: record });
    assert.deepEqual(record, before, '展示不能改写审核记录或触发落账');
    assert.deepEqual(buildOrbPanels({ settle: { lastAdjudication: record } }).settle, panel, '保留现有 settle 入口');
    assert.match(panel.summary, /判定已注入 · 3 项行动/);
    assert.match(panel.summary, /仍在提示词里/);
    assert.ok(panel.summary.length < 90, '球摘要只报总览，不拼接多行动正文');
    assert.deepEqual(panel.lists.map(group => group.heading), ['1. 服用回气丹', '2. 修炼判定 · 未通过复核', '3. 购药']);
    const first = panel.lists[0];
    assert.deepEqual(first.all.map(item => item.head), ['行动状态', '结果', '文字后果', '文字后果', '斗气 +20']);
    assert.match(first.all[0].meta, /成功 · 审核通过 · 丹药判定/);
    assert.equal(first.all[0].detail, '玩家确实服药');
    assert.equal(first.all[1].detail, '药力化开，恢复少许斗气。');
    assert.equal(first.all[2].detail, '药瓶空了');
    assert.equal(first.all[4].detail, '回气丹药力');
    assert.match(first.all[4].meta, /判定候选，未确认落账/);
    assert.equal(first.items.length, 4, '复用原有预览上限');
    assert.equal(first.total, 5, '变化详情仍能由现有「全部」列表完整查看');
    const blocked = panel.lists[1];
    assert.match(blocked.all[0].meta, /未执行 · 审核拒收/);
    assert.equal(blocked.all[1].detail, '突破条件不足，未执行境界变化。', '使用核心提供的拒收安全结果');
    assert.equal(blocked.all[2].detail, '跨度超过允许范围');
    assert.equal(blocked.all[3].head, '拒收原因');
    assert.equal(blocked.all[3].detail, '当前未达九星圆满');
    const bought = panel.lists[2].all;
    assert.match(bought[0].meta, /部分成功/);
    assert.deepEqual(bought.slice(2, 6).map(item => item.head), [
        '金币 -50', '物品 · 凝血草 · 药材 · herb-1 +1',
        '物品 移除 空药瓶 · 杂物 · bottle-1 · 数量 1', '位置 → 乌坦城·药铺',
    ]);
    assert.equal(bought.at(-1).detail, '卖家没有第二枚药材');
    assert.match(panel.rows.find(item => item.label === '数值变化').value, /^5 条判定候选/);
    assert.equal(panel.rows.find(item => item.label === '对账').value, '待对账，未确认落账');
    assert.doesNotMatch(JSON.stringify(panel), /不安全|9999|顶层重复拒收|\[object Object\]|undefined|NaN/);
    const cleared = buildSettlePanel({ lastAdjudication: { ...record, cleared: true } });
    assert.equal(cleared.rows.find(item => item.label === '状态').value, '判定已注入');
    assert.equal(cleared.rows.find(item => item.label === '注入通道').value, '已随生成结束清理');
    assert.deepEqual(cleared.lists, panel.lists, '清理通道不能删除行动或改变判定事实');
    const noActions = buildSettlePanel({ lastAdjudication: { ...record, actions: [] } });
    assert.equal(noActions.lists[0].total, 0, '空的新记录绝不回退旧版顶层结果');
    assert.doesNotMatch(JSON.stringify(noActions), /不安全|9999|顶层重复拒收/);
}

// —— 判定状态、注入通道、生成后对账是三个互不替代的维度 ——
{
    const states = {
        pending: '等待判定', injected: '判定已注入', preview: '仅预览，未注入',
        write_failed: '注入写入失败', error: '判定失败', stale: '判定已过期',
        disabled: '行动结算已关闭', none: '本轮没有可结算的行动',
        no_input: '没有行动输入', busy: '判定忙碌中', unsupported: '当前环境不支持结算',
    };
    for (const [status, label] of Object.entries(states)) {
        for (const cleared of [false, true]) {
            for (const actions of [undefined, []]) {
                const panel = buildSettlePanel({ lastAdjudication: { status, cleared, actions } });
                assert.equal(panel.rows.find(item => item.label === '状态').value, label);
                assert.match(panel.summary, status === 'error' && !actions ? /判定失败/ : new RegExp(label));
                const channel = panel.rows.find(item => item.label === '注入通道').value;
                assert.equal(channel, cleared ? '已随生成结束清理' : status === 'injected' ? '仍在提示词里' : '未确认有有效注入');
                if (['write_failed', 'error', 'stale', 'unsupported'].includes(status)) {
                    assert.equal(panel.rows.find(item => item.label === '状态').tone, 'warn');
                }
                assert.doesNotMatch(JSON.stringify(panel), /已落账|已入账|结算已完成/);
            }
        }
    }
    // 沙盒口径挡结算要明说原因，不能只报一句"已关闭"让玩家对着开关排查。
    const sandboxPanel = buildSettlePanel({ lastAdjudication: { status: 'unsupported', actions: [], summary: '沙盒口径下行动结算不参与；切回正式口径后恢复' } });
    assert.match(sandboxPanel.summary, /当前环境不支持结算：沙盒口径/);
    assert.equal(sandboxPanel.rows.find(item => item.label === '状态').tone, 'warn');
    const sandboxBare = buildSettlePanel({ lastAdjudication: { status: 'unsupported', actions: [] } });
    assert.match(sandboxBare.summary, /切回正式口径后恢复/, '没带 summary 也有兜底说明');
    for (const [status, label] of Object.entries({ success: '成功', partial: '部分成功', failure: '失败', insufficient: '依据不足', not_executed: '未执行' })) {
        const panel = buildSettlePanel({ lastAdjudication: { status: 'preview', actions: [{ status, category: 'combat', outcome: '审核后的结果' }] } });
        assert.match(panel.lists[0].all[0].meta, new RegExp(label));
        assert.match(panel.lists[0].all[0].meta, /未记录审核状态/);
        assert.equal(panel.lists[0].all[1].detail, '审核后的结果');
    }
    for (const [status, label] of Object.entries({ pending: '待对账，未确认落账', matched: '对账一致', mismatch: '对账不一致', not_applicable: '无需对账' })) {
        const panel = buildSettlePanel({ lastAdjudication: { status: 'injected', actions: [], reconciliation: {
            status, differences: ['缺少回气丹消耗记录', { field: 'gold', expected: -50, actual: 0, reason: '数值未匹配' },
                { field: 'items', name: '凝血草', itemId: 'herb-1', expected: 1, actual: 0 }],
        } } });
        assert.equal(panel.rows.find(item => item.label === '对账').value, label);
        assert.equal(panel.rows.find(item => item.label === '对账').tone, status === 'mismatch' ? 'warn' : undefined);
        assert.deepEqual(panel.lists.at(-1).all.map(item => item.detail), [
            '缺少回气丹消耗记录', '金币 · 预期 -50 · 实际 0 · 数值未匹配', '物品 · 凝血草 · herb-1 · 预期 1 · 实际 0',
        ]);
        assert.match(panel.rows.find(item => item.label === '注入通道').value, /仍在提示词里/, '对账不改变注入通道');
    }
    const coreDifferences = buildSettlePanel({ lastAdjudication: { status: 'injected', actions: [], reconciliation: {
        status: 'mismatch', differences: [{ field: 'player.hp', expected: 80, actual: 100 },
            { field: 'inventory.herb-1.count', itemId: 'herb-1', expected: 1, actual: null, label: '同名同类别匹配歧义，未擅自分配库存' },
            { field: 'inventory.herb-1.name', itemId: 'herb-1', expected: '凝血草', actual: '回气草' }],
    } } });
    assert.deepEqual(coreDifferences.lists.at(-1).all.map(item => item.detail), [
        '生命 · 预期 80 · 实际 100', '物品数量 · herb-1 · 预期 1 · 实际 未知 · 同名同类别匹配歧义，未擅自分配库存',
        '物品名称 · herb-1 · 预期 凝血草 · 实际 回气草',
    ], '兼容核心实际差异路径、未知数值与物品匹配歧义');
    const unknown = buildSettlePanel({ lastAdjudication: { status: 'future', actions: [{ status: 'future' }] } });
    assert.match(unknown.summary, /判定状态未明/);
    assert.match(unknown.lists[0].all[0].meta, /行动状态未明/);
    assert.equal(unknown.rows.find(item => item.label === '对账').value, '未记录对账，未确认落账');
    for (const lastAdjudication of [null, [], false, '', { actions: [null, { effects: null, rejected: null, consequences: null }], reconciliation: { differences: null } }]) {
        assert.doesNotThrow(() => buildSettlePanel({ lastAdjudication }));
    }
}
console.log('orb hud state machine, panels, previews, caps and v2 settlement tests passed');
