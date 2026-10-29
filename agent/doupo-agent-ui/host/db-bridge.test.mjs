import assert from 'node:assert/strict';
import { createDbBridge } from './db-bridge.js';
import { sameSelfState, sameWorldState, sameMemoryState } from './db-tables.js';

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

const sampleWorld = {
    schemaVersion: 1,
    clock: { day: 3, minute: 480, label: '' },
    info: { weather: '晴', location: '乌坦城·萧家', era: '', reputation: '', wanted: '' },
    nearEvents: [{ id: 'e1', scope: 'near', day: 2, text: '纳戒测试事件', basis: '测试', endDay: null, weight: 'minor', pinned: false, done: false, resolvedDay: null }],
    worldEvents: [],
    tasks: [],
    log: [],
    updatedAt: '2026-10-29T00:00:00.000Z',
};

/** 内存版数据库脚本：只实现桥用到的九个方法，行语义与真机一致（第 0 行表头、row_id 在首列）。 */
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

    // 世界台账同链路
    const worldMirror = await bridge.mirrorWorld(sampleWorld);
    assert.equal(worldMirror.ok, true);
    const worldAdopted = await bridge.adoptWorld();
    assert.ok(sameWorldState(worldAdopted, sampleWorld));

    // 记忆同链路：模板导入一次覆盖全部 13 张表，小/大两张记忆表走同一套 CRUD
    const sampleMemory = {
        schemaVersion: 2,
        entries: [
            { id: 'm1', tier: 'small', text: '穆蛇之辱', quote: '把灵石留下。', basis: '测试', related: ['穆蛇'], aliases: ['穆老大'], weight: 'minor', tag: '', day: 2, done: false, resolvedDay: null, note: '' },
            { id: 'm2', tier: 'big', text: '欠药老一条命', quote: '', basis: '', related: ['药老'], aliases: ['药尘'], weight: 'major', tag: 'grudge', day: 3, done: false, resolvedDay: null, note: '' },
        ],
        log: [],
        updatedAt: '2026-10-29T00:00:00.000Z',
    };
    const memoryMirror = await bridge.mirrorMemory(sampleMemory);
    assert.equal(memoryMirror.ok, true);
    const memoryAdopted = await bridge.adoptMemory();
    assert.ok(sameMemoryState(memoryAdopted, sampleMemory));
    // 了结一条 → 一次 updateRow
    const resolved = JSON.parse(JSON.stringify(sampleMemory));
    resolved.entries[0].done = true;
    resolved.entries[0].resolvedDay = 4;
    const resolvedMirror = await bridge.mirrorMemory(resolved);
    assert.equal(resolvedMirror.ok, true);
    assert.equal(resolvedMirror.ops, 1);
    assert.equal((await bridge.adoptMemory()).entries[0].done, true);

    // 设置关掉：跳过
    const offBridge = createDbBridge({ getSettings: () => ({ enableDbBridge: false }) });
    assert.deepEqual(await offBridge.mirrorSelf(sampleSelf), { ok: false, skipped: true });
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
