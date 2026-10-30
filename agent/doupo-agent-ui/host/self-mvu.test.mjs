import assert from 'node:assert/strict';
import { buildSelfMvuPayload, createSelfMvuBridge, hasSelfMvuContent } from './self-mvu.js';

const fullSelf = {
    schemaVersion: 1,
    day: 12,
    gold: 3200,
    profile: { name: '墨白', gender: '男', age: '十七', race: '人族', origin: '旧书铺独子', affiliation: '暂无', attribute: '雷', talent: '过目不忘', appearance: '瘦高个' },
    realm: { realm: '斗者', stage: '三星' },
    titles: ['乌坦城书痴'],
    updatedAt: '2026-10-30T00:00:00.000Z',
};

// 载荷：档案九字段 + 境界/段位 + 金币/剧情日数字 + 更新时间
const payload = buildSelfMvuPayload(fullSelf);
assert.deepEqual(payload, {
    姓名: '墨白', 性别: '男', 年龄: '十七', 种族: '人族', 出身: '旧书铺独子', 所属: '暂无',
    斗气属性: '雷', 天赋: '过目不忘', 外貌: '瘦高个',
    境界: '斗者', 段位: '三星', 金币: 3200, 剧情日: 12, 更新时间: '2026-10-30T00:00:00.000Z',
});
assert.equal(hasSelfMvuContent(payload), true, '满快照有内容');

const emptyPayload = buildSelfMvuPayload({});
assert.deepEqual({ ...emptyPayload, 金币: emptyPayload.金币, 剧情日: emptyPayload.剧情日 }, {
    姓名: '', 性别: '', 年龄: '', 种族: '', 出身: '', 所属: '', 斗气属性: '', 天赋: '', 外貌: '',
    境界: '', 段位: '', 金币: 0, 剧情日: 1, 更新时间: '',
}, '空快照给默认值，不抛异常');
assert.equal(hasSelfMvuContent(emptyPayload), true, '空纳戒也有剧情日 1，值得写一次立住命名空间');
assert.equal(hasSelfMvuContent(null), false);
assert.equal(hasSelfMvuContent({ 姓名: '  ' }), false, '纯空白不算内容');
assert.equal(hasSelfMvuContent({ 姓名: '墨白' }), true);
assert.equal(hasSelfMvuContent({ 金币: 5 }), true, '正数金币算内容');
assert.equal(hasSelfMvuContent({ 剧情日: 0 }), false, '剧情日 0 不算内容');

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
    // 空快照：写最小载荷（剧情日 1 立住命名空间），不抛异常
    const fake = createFakeMvu();
    globalThis.window.Mvu = fake.mvu;
    const bridge = createSelfMvuBridge();
    const result = await bridge.sync({});
    assert.equal(result.ok, true);
    assert.equal(result.wrote, true);
    assert.equal(fake.calls.writes.length, 1);
    assert.equal(fake.calls.writes[0]['斗破纳戒'].剧情日, 1);
    assert.equal(fake.calls.writes[0]['斗破纳戒'].姓名, '');
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

// 本文件为了测 locateMvu 给进程装了假 window：用完必须摘掉，
// 否则同进程后续测试文件（impact-flow / index-lifecycle 等）拿到残缺 window 直接炸。
delete globalThis.window;

console.log('self-mvu tests passed');
