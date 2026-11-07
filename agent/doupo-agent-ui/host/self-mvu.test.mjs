import assert from 'node:assert/strict';
import { buildSelfMvuPayload, createSelfMvuBridge, hasSelfMvuContent } from './self-mvu.js';

const fullSelf = {
    schemaVersion: 1,
    day: 12,
    gold: 3200,
    profile: { name: '墨白', gender: '男', age: '十七', race: '人族', origin: '旧书铺独子', affiliation: '暂无', attribute: '雷', talent: '过目不忘', appearance: '瘦高个' },
    realm: { realm: '斗者', stage: '三星' },
    techniques: [
        { id: 't1', name: '焚决', grade: '黄阶低级', type: '修炼功法', progress: '第三层' },
        { id: 't2', name: '', grade: '坏条目' },
    ],
    skills: [{ id: 's1', name: '八极崩', grade: '黄阶高级', type: '攻击' }],
    equipment: [{ id: 'e1', name: '玄重尺', grade: '凡品', type: '武器' }, { id: 'e2', name: '储物袋', grade: '', type: '' }],
    items: [
        { id: 'b1', name: '回气丹', category: '丹药', count: 3, equipped: false },
        { id: 'b2', name: '凝血散', category: '丹药', count: 1, equipped: false },
        { id: 'b3', name: '贴身玉佩', category: '饰品', count: 1, equipped: true },
    ],
    titles: ['乌坦城书痴'],
    recipes: [
        { id: 'r1', name: '回气散', craft: '炼药', grade: '一品' },
        { id: 'r2', name: '玄铁护腕图', craft: '炼器', grade: '二品' },
    ],
    crafts: [
        { id: 'c1', name: '凝血散', craft: '炼药', count: 2, status: 'open', startDay: 10, endDay: 14 },
        { id: 'c2', name: '回气散', craft: '炼药', count: 1, status: 'success', startDay: 5, endDay: 7 },
    ],
    goals: [
        { id: 'g2', title: '凑齐焚决后续', text: '凑齐焚决后续功法', priority: '支线', due: '', done: false },
        { id: 'g1', title: '三年之约雪前耻', text: '三年之约，云岚宗一雪前耻', priority: '主线', due: '三年后', done: false },
        { id: 'g3', title: '已完成的旧约', text: '已完成的旧约', priority: '主线', due: '', done: true },
        { id: 'g4', title: '', text: '', priority: '支线', done: false },
    ],
    updatedAt: '2026-10-30T00:00:00.000Z',
};

// 载荷：档案九字段 + 境界/段位 + 清单链（功法斗技装备天材地宝行囊称号丹方器谱炼制）+ 未完成目标
// + 金币数字 + 更新时间。23 字段是模型经 MVU 通道申报纳戒变化的完整面。
// （剧情日不进 MVU：世界运转的时钟注入里已经有；已达成目标退场不进状态栏）
const payload = buildSelfMvuPayload(fullSelf);
assert.deepEqual(payload, {
    姓名: '墨白', 性别: '男', 年龄: '十七', 种族: '人族', 出身: '旧书铺独子', 所属: '暂无',
    斗气属性: '雷', 天赋: '过目不忘', 外貌: '瘦高个',
    境界: '斗者', 段位: '三星',
    功法: '焚决·黄阶低级·第三层',
    斗技: '八极崩·黄阶高级·攻击',
    装备: '玄重尺·凡品·武器、储物袋',
    天材地宝: '',
    行囊: '回气丹×3、凝血散',
    称号: '乌坦城书痴',
    丹方: '回气散·一品',
    器谱: '玄铁护腕图·二品',
    炼制: '凝血散×2（剩 3 天）',
    目标: '★三年之约雪前耻（三年后）；·凑齐焚决后续',
    金币: 3200, 更新时间: '2026-10-30T00:00:00.000Z',
});
assert.equal(hasSelfMvuContent(payload), true, '满快照有内容');
assert.equal('剧情日' in payload, false, '剧情日不再进 MVU 载荷');

const emptyPayload = buildSelfMvuPayload({});
assert.deepEqual(emptyPayload, {
    姓名: '', 性别: '', 年龄: '', 种族: '', 出身: '', 所属: '', 斗气属性: '', 天赋: '', 外貌: '',
    境界: '', 段位: '', 功法: '', 斗技: '', 装备: '', 天材地宝: '', 行囊: '', 称号: '', 丹方: '', 器谱: '', 炼制: '', 目标: '',
    金币: 0, 更新时间: '',
}, '空快照给默认值，不抛异常');
assert.equal(hasSelfMvuContent(emptyPayload), false, '空纳戒无内容，sync 按无内容跳过');
assert.equal(hasSelfMvuContent(null), false);
assert.equal(hasSelfMvuContent({ 姓名: '  ' }), false, '纯空白不算内容');
assert.equal(hasSelfMvuContent({ 姓名: '墨白' }), true);
assert.equal(hasSelfMvuContent({ 金币: 5 }), true, '正数金币算内容');
assert.equal(hasSelfMvuContent({ 目标: '★三年之约' }), true, '只有目标也算内容');

// 主路径 fake：读帧 → 改帧 → replaceMvuData 整帧写回（真机语义）
function createFakeMvu({ throwOnWrite = false, withSetMvuVariable = false } = {}) {
    const calls = { writes: [] };
    let statData = {};
    const mvu = {
        getMvuData: async () => ({ stat_data: JSON.parse(JSON.stringify(statData)) }),
        replaceMvuData: async (data) => {
            if (throwOnWrite) throw new Error('MVU 写入失败');
            calls.writes.push(JSON.parse(JSON.stringify(data.stat_data)));
            statData = JSON.parse(JSON.stringify(data.stat_data));
        },
    };
    if (withSetMvuVariable) {
        mvu.setMvuVariable = async (data, name, value, options) => {
            calls.writes.push({ via: 'set', name, value: JSON.parse(JSON.stringify(value)), reason: options?.reason ?? '' });
            data.stat_data[name] = JSON.parse(JSON.stringify(value));
        };
    }
    return { mvu, calls, getStatData: () => statData };
}

globalThis.window = {};

{
    // MVU 缺席：静默跳过
    const bridge = createSelfMvuBridge();
    const result = await bridge.sync(fullSelf);
    assert.deepEqual(result, { ok: false, skipped: true, reason: 'missing' });
    assert.equal(bridge.status().present, false);
    const read = await bridge.readLatest();
    assert.deepEqual(read, { ok: false, reason: 'missing' }, '读帧同样静默');
}

{
    // readLatest：读到命名空间 / 命名空间缺失给 null / 读帧异常静默
    const bridge = createSelfMvuBridge();
    globalThis.window.Mvu = {
        getMvuData: async () => ({ stat_data: { 斗破纳戒: { 姓名: '墨白' }, 别人的: 1 } }),
    };
    const ok = await bridge.readLatest();
    assert.deepEqual(ok, { ok: true, namespace: { 姓名: '墨白' } });
    globalThis.window.Mvu = { getMvuData: async () => ({ stat_data: {} }) };
    const empty = await bridge.readLatest();
    assert.deepEqual(empty, { ok: true, namespace: null });
    globalThis.window.Mvu = { getMvuData: async () => { throw new Error('帧坏了'); } };
    const bad = await bridge.readLatest();
    assert.equal(bad.ok, false);
    assert.match(bad.reason, /帧坏了/);
}

{
    // 主路径：写进 stat_data.斗破纳戒，stat_data 里别人的键原样保留
    const fake = createFakeMvu();
    fake.getMvuData; // noop 占位
    globalThis.window.Mvu = {
        getMvuData: async () => ({ stat_data: { 别人的变量: { hp: 10 } } }),
        replaceMvuData: async (data) => { fake.calls.writes.push(JSON.parse(JSON.stringify(data.stat_data))); },
    };
    const bridge = createSelfMvuBridge();
    const result = await bridge.sync(fullSelf);
    assert.equal(result.ok, true);
    assert.equal(result.wrote, true);
    assert.deepEqual(fake.calls.writes[0]['别人的变量'], { hp: 10 }, '别人的 stat_data 键原样保留');
    assert.equal(fake.calls.writes[0]['斗破纳戒'].姓名, '墨白');
    assert.equal(fake.calls.writes[0]['斗破纳戒'].金币, 3200);
    const st = bridge.status();
    assert.equal(st.present, true);
    assert.equal(st.lastError, '');
    assert.ok(st.lastSyncAt);
}

{
    // 空快照：无内容跳过，不写帧也不抛异常
    const fake = createFakeMvu();
    globalThis.window.Mvu = fake.mvu;
    const bridge = createSelfMvuBridge();
    const result = await bridge.sync({});
    assert.deepEqual(result, { ok: true, skipped: true, reason: 'empty' });
    assert.equal(fake.calls.writes.length, 0, '空纳戒不占变量写');
}

{
    // stat_data 缺失时自动建
    const fake = createFakeMvu();
    globalThis.window.Mvu = {
        getMvuData: async () => ({}),
        replaceMvuData: async (data) => { fake.calls.writes.push(JSON.parse(JSON.stringify(data.stat_data ?? {}))); },
    };
    const bridge = createSelfMvuBridge();
    const result = await bridge.sync(fullSelf);
    assert.equal(result.ok, true);
    assert.equal(fake.calls.writes[0]['斗破纳戒'].姓名, '墨白');
}

{
    // 写失败：记状态不抛异常
    const fake = createFakeMvu({ throwOnWrite: true });
    globalThis.window.Mvu = fake.mvu;
    const bridge = createSelfMvuBridge();
    const result = await bridge.sync(fullSelf);
    assert.equal(result.ok, false);
    assert.match(result.error, /MVU 写入失败/);
    assert.match(bridge.status().lastError, /MVU 写入失败/);
}

{
    // 只有 setMvuVariable 的环境（没有 replaceMvuData）：回退路径可用
    const fake = createFakeMvu({ withSetMvuVariable: true });
    globalThis.window.Mvu = { getMvuData: fake.mvu.getMvuData, setMvuVariable: fake.mvu.setMvuVariable };
    const bridge = createSelfMvuBridge();
    const result = await bridge.sync(fullSelf);
    assert.equal(result.ok, true);
    assert.equal(fake.calls.writes.length, 1);
    assert.equal(fake.calls.writes[0].via, 'set');
    assert.equal(fake.calls.writes[0].name, '斗破纳戒');
}

{
    // 原生降级：没有 Mvu 框架时走酒馆助手原生楼层变量读写，帧结构与 MVU 时代逐字段一致
    delete globalThis.window.Mvu;
    let frame = { initialized_lorebooks: { 斗破世界书: [] }, stat_data: { 别人的: 1 } };
    const nativeCalls = { writes: 0, lastTarget: null };
    globalThis.window.TavernHelper = {
        getVariables: async options => {
            nativeCalls.lastTarget = options;
            return frame ? JSON.parse(JSON.stringify(frame)) : null;
        },
        replaceVariables: async (data, options) => {
            nativeCalls.writes++;
            nativeCalls.lastTarget = options;
            frame = JSON.parse(JSON.stringify(data));
        },
    };
    const bridge = createSelfMvuBridge();
    const result = await bridge.sync(fullSelf);
    assert.equal(result.ok, true);
    assert.equal(result.wrote, true);
    assert.equal(result.layer, 'native', '无 Mvu 时报告原生层');
    assert.deepEqual(frame.initialized_lorebooks, { 斗破世界书: [] }, '别人的 initialized_lorebooks 原样保留');
    assert.deepEqual(frame.stat_data['别人的'], 1, '别人的 stat_data 键原样保留');
    assert.equal(frame.stat_data['斗破纳戒'].姓名, '墨白');
    assert.equal(frame.stat_data['斗破纳戒'].金币, 3200);
    assert.deepEqual(nativeCalls.lastTarget, { type: 'message', message_id: 'latest' });
    const st = bridge.status();
    assert.equal(st.present, true);
    assert.equal(st.layer, 'native');
    assert.equal(st.lastError, '');
    const read = await bridge.readLatest();
    assert.deepEqual(read, { ok: true, namespace: frame.stat_data['斗破纳戒'] }, 'readLatest 原生降级可用');
}

{
    // 原生降级：全新楼层没有变量帧时，建出与 MVU 同构的帧（initialized_lorebooks + stat_data）
    let frame = null;
    globalThis.window.TavernHelper = {
        getVariables: async () => null,
        replaceVariables: async data => { frame = JSON.parse(JSON.stringify(data)); },
    };
    const bridge = createSelfMvuBridge();
    const result = await bridge.sync(fullSelf);
    assert.equal(result.ok, true);
    assert.deepEqual(Object.keys(frame).sort(), ['initialized_lorebooks', 'stat_data'], '新建帧与 MVU 帧同构');
    assert.deepEqual(frame.initialized_lorebooks, {});
    assert.equal(frame.stat_data['斗破纳戒'].姓名, '墨白');
}

{
    // 双层全无才算缺席：只有空 window（无 Mvu 无 TavernHelper）时仍静默 missing
    delete globalThis.window.TavernHelper;
    const bridge = createSelfMvuBridge();
    assert.deepEqual(await bridge.sync(fullSelf), { ok: false, skipped: true, reason: 'missing' });
    assert.deepEqual(await bridge.readLatest(), { ok: false, reason: 'missing' });
    assert.equal(bridge.status().layer, 'none');
}

{
    // Mvu 存在时优先 Mvu 路径，原生层退位
    globalThis.window.Mvu = { getMvuData: async () => ({ stat_data: {} }), replaceMvuData: async () => {} };
    const bridge = createSelfMvuBridge();
    assert.equal(bridge.status().layer, 'mvu');
    const result = await bridge.sync(fullSelf);
    assert.equal(result.layer, 'mvu');
}
delete globalThis.window.TavernHelper;

// OPT-010: pin the target and discard a read whose owner expired.
{
    let owner = 1, writes = 0;
    const tree = { stat_data: { 其他: 1 } };
    const ids = [];
    globalThis.window.Mvu = {
        getMvuData: async options => { ids.push(options.message_id); owner++; return tree; },
        replaceMvuData: async () => { writes++; },
    };
    const bridge = createSelfMvuBridge({ capture: () => owner, isCurrent: token => token === owner });
    assert.equal((await bridge.sync(fullSelf, { messageId: 7 })).ok, false);
    assert.equal(writes, 0);
    assert.deepEqual(tree, { stat_data: { 其他: 1 } }, 'stale read must not mutate shared host tree');
    assert.deepEqual(ids, [7]);
}

// 本文件为了测 locateMvu 给进程装了假 window：用完必须摘掉，
// 否则同进程后续测试文件（impact-flow / index-lifecycle 等）拿到残缺 window 直接炸。
delete globalThis.window;

console.log('self-mvu tests passed');
