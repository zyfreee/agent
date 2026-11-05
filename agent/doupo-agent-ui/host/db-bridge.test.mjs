import assert from 'node:assert/strict';
import { createDbBridge } from './db-bridge.js';
import { sameSelfState, sameMemoryState, buildBridgeSheets } from './db-tables.js';

const sampleSelf = {
    schemaVersion: 1,
    day: 3,
    profile: { name: '萧炎', gender: '男', age: '16', race: '', origin: '萧家', affiliation: '', talent: '', appearance: '' },
    realm: { realm: '斗之气', stage: '三段' },
    gold: 120,
    titles: ['萧家少主'],
    techniques: [],
    skills: [],
    items: [{ id: 'b1', name: '回气丹', category: '丹药', grade: '一品', count: 2, equipped: false, source: '' }],
    recipes: [],
    crafts: [],
    goals: [],
    log: [],
    updatedAt: '2026-10-29T00:00:00.000Z',
};

/** 内存版数据库脚本：只实现桥用到的方法，行语义与真机一致（第 0 行表头、row_id 在首列）。 */
function createFakeApi() {
    const calls = { importTemplate: 0, importTable: 0, crudFails: false, callbacks: [] };
    let template = null;
    let data = null;
    const findSheet = name => {
        for (const key of Object.keys(data ?? {})) {
            if (key.startsWith('sheet_') && data[key]?.name === name) return data[key];
        }
        return null;
    };
    const api = {
        getTableTemplate: ({ scope } = {}) => (scope === 'global' ? template : template),
        importTemplateFromData: async tmpl => {
            calls.importTemplate += 1;
            template = JSON.parse(JSON.stringify(tmpl));
            data = JSON.parse(JSON.stringify(tmpl));
            return { success: true, message: 'ok' };
        },
        exportTableAsJson: () => (data ? JSON.parse(JSON.stringify(data)) : {}),
        importTableAsJson: async jsonString => {
            calls.importTable += 1;
            data = JSON.parse(jsonString);
            return true;
        },
        updateRow: async (table, rowIndex, patch) => {
            if (calls.crudFails) return false;
            const sheet = findSheet(table);
            const row = sheet?.content?.[rowIndex];
            if (!row) return false;
            const headers = sheet.content[0];
            for (const [column, value] of Object.entries(patch)) {
                const index = headers.indexOf(column);
                if (index >= 0) row[index] = value;
            }
            return true;
        },
        insertRow: async (table, rowData) => {
            if (calls.crudFails) return -1;
            const sheet = findSheet(table);
            if (!sheet) return -1;
            const headers = sheet.content[0];
            const row = headers.map(() => '');
            row[0] = String(sheet.content.length);
            for (const [column, value] of Object.entries(rowData)) {
                const index = headers.indexOf(column);
                if (index >= 0) row[index] = value;
            }
            sheet.content.push(row);
            return sheet.content.length - 1;
        },
        deleteRow: async (table, rowIndex) => {
            if (calls.crudFails) return false;
            const sheet = findSheet(table);
            if (!sheet?.content?.[rowIndex]) return false;
            sheet.content.splice(rowIndex, 1);
            return true;
        },
        registerTableUpdateCallback: callback => { calls.callbacks.push(callback); },
    };
    return { api, calls, setData: view => { data = view; } };
}

// OPT-009: expired ensure/CRUD/debounce never dispatch into the next owner.
{
    const { api, calls } = createFakeApi();
    globalThis.window = { AutoCardUpdaterAPI: api };
    let release;
    const blocked = new Promise(resolve => { release = resolve; });
    const rawImport = api.importTemplateFromData;
    api.importTemplateFromData = async (...args) => { await blocked; return rawImport(...args); };
    let owner = 1;
    const bridge = createDbBridge({ capture: () => owner, isCurrent: token => token === owner });
    const pending = bridge.mirrorSelf(sampleSelf);
    await Promise.resolve();
    owner += 1;
    bridge.onChatChanged();
    release();
    assert.equal((await pending).ok, false, 'expired ensure must not continue with CRUD');
    assert.equal(api.exportTableAsJson().sheet_dpProfile.content.length, 1);
    let adopted = 0;
    bridge.onExternalChange(() => { adopted += 1; });
    calls.callbacks[0]({}, {});
    bridge.onChatChanged();
    await new Promise(resolve => setTimeout(resolve, 520));
    assert.equal(adopted, 0, 'old debounced view must be discarded');
    const settings = { enabled: false };
    const disabled = createDbBridge({ getSettings: () => settings });
    assert.equal((await disabled.mirrorSelf(sampleSelf)).ok, false);
    assert.equal(await disabled.adoptSelf(), null);
    delete globalThis.window;
}

// OPT-011: mirror calls reconcile sequentially, including failed CRUD fallback.
{
    const { api, calls } = createFakeApi();
    globalThis.window = { AutoCardUpdaterAPI: api };
    const bridge = createDbBridge();
    await bridge.ensure();
    calls.crudFails = true;
    let release, started;
    const entered = new Promise(resolve => { started = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const raw = api.insertRow;
    let first = true;
    api.insertRow = async (...args) => {
        if (first) { first = false; started(); await gate; }
        return raw(...args);
    };
    const older = bridge.mirrorSelf(sampleSelf);
    await entered;
    const newer = bridge.mirrorSelf({ ...sampleSelf, gold: 987 });
    await new Promise(resolve => setTimeout(resolve, 5));
    release();
    await Promise.all([older, newer]);
    assert.equal((await bridge.adoptSelf()).gold, 987, 'latest queued snapshot must win');
    delete globalThis.window;
}

// 1. 没有数据库脚本：全部静默跳过，状态 missing
{
    delete globalThis.window;
    const bridge = createDbBridge({ getSettings: () => undefined });
    assert.deepEqual(await bridge.mirrorSelf(sampleSelf), { ok: false, skipped: true });
    assert.equal(await bridge.adoptSelf(), null);
    assert.equal(bridge.status().status, 'missing');
}

// 2. 全链路：模板补齐 → CRUD 镜像 → 收养往返 → 二次镜像零操作
{
    const { api, calls } = createFakeApi();
    globalThis.window = { AutoCardUpdaterAPI: api };
    const bridge = createDbBridge({ getSettings: () => undefined });
    const first = await bridge.mirrorSelf(sampleSelf);
    assert.equal(first.ok, true, `首次镜像应成功：${bridge.status().message}`);
    assert.equal(first.fallback, false);
    assert.equal(calls.importTemplate, 1, '冷聊天应导入一次桥接表模板');
    assert.ok(first.ops >= 3, `应有跨表写入（档案+称号+行囊）：${first.ops}`);

    const adopted = await bridge.adoptSelf();
    assert.ok(adopted, '镜像后应能从表里收养');
    assert.ok(sameSelfState(adopted, sampleSelf), '收养状态应与原状态等值');

    const second = await bridge.mirrorSelf(sampleSelf);
    assert.equal(second.ok, true);
    assert.equal(second.ops, 0, '无变化时不应再写');

    // 改金币再镜像：一次 updateRow；收养跟着变
    const changed = JSON.parse(JSON.stringify(sampleSelf));
    changed.gold = 999;
    const third = await bridge.mirrorSelf(changed);
    assert.equal(third.ok, true);
    assert.equal(third.ops, 1);
    assert.equal((await bridge.adoptSelf()).gold, 999);
    assert.equal(bridge.status().status, 'ready');

    // 记忆同链路：模板导入一次覆盖全部 10 张表，小/大两张记忆表走同一套 CRUD
    const sampleMemory = {
        schemaVersion: 2,
        entries: [
            { id: 'm1', tier: 'small', text: '穆蛇之辱', quote: '把灵石留下。', basis: '测试', related: ['穆蛇'], aliases: ['穆老大'], weight: 'minor', tag: '', day: 2, note: '' },
            { id: 'm2', tier: 'big', text: '欠药老一条命', quote: '', basis: '', related: ['药老'], aliases: ['药尘'], weight: 'major', tag: 'grudge', day: 3, note: '' },
        ],
        log: [],
        updatedAt: '2026-10-29T00:00:00.000Z',
    };
    const memoryMirror = await bridge.mirrorMemory(sampleMemory);
    assert.equal(memoryMirror.ok, true);
    const memoryAdopted = await bridge.adoptMemory();
    assert.ok(sameMemoryState(memoryAdopted, sampleMemory));
    // 改分量+备注 → 一次 updateRow
    const memoryChanged = JSON.parse(JSON.stringify(sampleMemory));
    memoryChanged.entries[0].weight = 'major';
    memoryChanged.entries[0].note = '穆蛇扬言报复';
    const changedMirror = await bridge.mirrorMemory(memoryChanged);
    assert.equal(changedMirror.ok, true);
    assert.equal(changedMirror.ops, 1);
    const reAdopted = await bridge.adoptMemory();
    assert.equal(reAdopted.entries[0].weight, 'major');
    assert.equal(reAdopted.entries[0].note, '穆蛇扬言报复');

    // 设置关掉：跳过
    const offBridge = createDbBridge({ getSettings: () => ({ enableDbBridge: false }) });
    assert.deepEqual(await offBridge.mirrorSelf(sampleSelf), { ok: false, skipped: true });
    delete globalThis.window;
}

// 2b. 旧版目标表升级：ensure 原位迁移并回导模板（老行保留），随后镜像/收养走新结构
{
    const { api, calls, setData } = createFakeApi();
    const legacyView = {
        mate: { type: 'chatSheets', version: 1 },
        sheet_dpGoalsOld: {
            name: '纳戒·目标',
            content: [
                ['row_id', '编号', '内容', '优先级', '期限', '达成'],
                ['1', 'g1', '三年之约，云岚宗一雪前耻', '主线', '三年后', '否'],
            ],
        },
    };
    api.getTableTemplate = () => JSON.parse(JSON.stringify(legacyView));
    setData(JSON.parse(JSON.stringify(legacyView)));
    globalThis.window = { AutoCardUpdaterAPI: api };
    const bridge = createDbBridge({ getSettings: () => undefined });
    const withGoals = {
        ...sampleSelf,
        goals: [{ id: 'g1', title: '三年之约', name: '三年之约', text: '三年之约，云岚宗一雪前耻', priority: '主线', due: '三年后', done: false }],
    };
    const mirrored = await bridge.mirrorSelf(withGoals);
    assert.equal(mirrored.ok, true, `旧表升级镜像应成功：${bridge.status().message}`);
    assert.equal(calls.importTemplate, 1, '迁移过的模板要回导一次才落库');
    const adopted = await bridge.adoptSelf();
    assert.ok(adopted, '升级后应能收养');
    assert.equal(adopted.goals.length, 1, '升级不丢目标行');
    assert.equal(adopted.goals[0].title, '三年之约', '标题列已补出');
    assert.equal(adopted.goals[0].text, '三年之约，云岚宗一雪前耻', '完整内容原样保留');
    assert.equal(adopted.goals[0].done, false);
    delete globalThis.window;
}

// 3. CRUD 全被拒（冷聊天无楼层锚点的近似）：自动走全量导入兜底
{
    const { api, calls } = createFakeApi();
    globalThis.window = { AutoCardUpdaterAPI: api };
    const bridge = createDbBridge({ getSettings: () => undefined });
    calls.crudFails = true;
    const result = await bridge.mirrorSelf(sampleSelf);
    assert.equal(result.ok, true, 'CRUD 失败应兜底成功');
    assert.equal(result.fallback, true);
    assert.equal(calls.importTable, 1, '兜底应调用一次 importTableAsJson');
    const adopted = await bridge.adoptSelf();
    assert.ok(sameSelfState(adopted, sampleSelf), '兜底导入后应能完整收养');
    delete globalThis.window;
}

// 4. 外部表格变更回调：去抖后转发一次
{
    const { api, calls } = createFakeApi();
    globalThis.window = { AutoCardUpdaterAPI: api };
    const bridge = createDbBridge({ getSettings: () => undefined });
    let received = 0;
    let lastView = null;
    bridge.onExternalChange(view => { received += 1; lastView = view; });
    await bridge.ensure(); // 触发注册
    assert.equal(calls.callbacks.length, 1);
    const view = api.exportTableAsJson();
    calls.callbacks[0](view, { persisted: true });
    calls.callbacks[0](view, { persisted: true }); // 去抖窗口内的第二次应合并
    await new Promise(resolve => setTimeout(resolve, 700));
    assert.equal(received, 1, '去抖后只转发一次');
    assert.ok(lastView && typeof lastView === 'object');
    delete globalThis.window;
}

// 6. 优雅降级：模板导入被数据库预检拒绝、但十张桥接表都已就位 → 按就绪处理，镜像照常
{
    const { api, calls } = createFakeApi();
    // 预置完整当前结构 + 一张退役世界表：merge 只报 removed，导入必败，应走降级
    const preset = JSON.parse(JSON.stringify(buildBridgeSheets()));
    preset.sheet_dpWorldState = { name: '世界·现状', content: [['row_id', '剧情日']] };
    await api.importTemplateFromData(preset, {});
    api.importTemplateFromData = async () => ({ success: false, message: '完整 replay candidate DDL/表头预检失败: 旧归档连坐' });
    globalThis.window = { AutoCardUpdaterAPI: api };
    const bridge = createDbBridge({ getSettings: () => undefined });
    // 先单独 ensure：降级消息在这里看（镜像成功后状态消息会被「镜像完成」覆盖）
    await bridge.ensure();
    assert.ok(bridge.status().message.includes('桥接表就绪'), `降级消息应说明就绪：${bridge.status().message}`);
    assert.ok(bridge.status().message.includes('预检拒绝'), '降级消息应说明模板级清理被暂拒');
    const mirror = await bridge.mirrorSelf(sampleSelf);
    assert.equal(mirror.ok, true, `降级路径下镜像应成功：${bridge.status().message}`);
    assert.equal(bridge.status().status, 'ready', '降级后状态应为 ready 而非 error');
    delete globalThis.window;
}

// 7. 降级不适用：桥接表真的缺失（导入失败且补不了）→ 仍是 error
{
    const { api } = createFakeApi();
    api.importTemplateFromData = async () => ({ success: false, message: '预检拒绝' });
    await api.importTemplateFromData({ mate: { type: 'chatSheets', version: 1 } }, {});
    globalThis.window = { AutoCardUpdaterAPI: api };
    const bridge = createDbBridge({ getSettings: () => undefined });
    const mirror = await bridge.mirrorSelf(sampleSelf);
    assert.equal(mirror.ok, false, '缺表且导入失败时镜像应失败');
    assert.equal(bridge.status().status, 'error', '缺表时状态保持 error');
    delete globalThis.window;
}

// 5. 聊天模板里有外来表（DDL 注释与表头不一致）：导入包先净化、外来表随包保留。
// 数据库脚本的 merge 导入是整包替换，且按「注释 = 表头」校验整包——少带外来表等于删表。
{
    const { api, calls } = createFakeApi();
    let importedPayload = null;
    const rawImport = api.importTemplateFromData;
    api.importTemplateFromData = async (tmpl, options) => {
        importedPayload = tmpl ? JSON.parse(JSON.stringify(tmpl)) : null;
        return rawImport(tmpl, options);
    };
    // 预置一个带全角注释外来表 + 退役世界表的聊天模板（模拟旧版桥接与另一张卡留下的表）
    await api.importTemplateFromData({
        mate: { type: 'chatSheets', version: 1 },
        sheet_foreign: {
            name: '背包与货币',
            content: [['row_id', '进度(%)']],
            sourceData: { ddl: 'CREATE TABLE bag ( -- 背包与货币\n  row_id INTEGER PRIMARY KEY, -- 行号\n  progress TEXT, -- 进度（%）\n);' },
        },
        sheet_dpWorldState: { name: '世界·现状', content: [['row_id', '剧情日']] },
    }, {});
    calls.importTemplate = 0;
    globalThis.window = { AutoCardUpdaterAPI: api };
    const bridge = createDbBridge({ getSettings: () => undefined });
    // 先单独 ensure：退役剔除的导入汇报在这里看（镜像成功后状态消息会被「镜像完成」覆盖）
    await bridge.ensure();
    assert.ok(bridge.status().message.includes('移除退役桥接表'), `ensure 汇报应说明退役表被移除：${bridge.status().message}`);
    const mirror = await bridge.mirrorSelf(sampleSelf);
    assert.equal(mirror.ok, true, `外来表存在时镜像应成功：${bridge.status().message}`);
    assert.equal(calls.importTemplate, 1);
    assert.ok(importedPayload?.sheet_foreign, '外来表必须随包携带（整包替换语义下少带等于删表）');
    assert.ok(importedPayload.sheet_foreign.sourceData.ddl.includes('-- 进度(%)'), '外来表 DDL 应先净化再导入');
    assert.ok(importedPayload.sheet_dpProfile, '桥接表在导入包里');
    assert.ok(!('sheet_dpWorldState' in importedPayload), '退役世界表不再随包携带（整包替换语义下等于从聊天模板移除）');
    assert.equal(bridge.status().status, 'ready');
    delete globalThis.window;
}
