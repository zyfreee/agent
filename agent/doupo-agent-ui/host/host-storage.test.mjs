import assert from 'node:assert/strict';
import { createHostStorage, DEFAULT_SETTINGS } from '../host/host-storage.js';

const context = {
    extensionSettings: {},
    chatMetadata: {},
    saveSettingsDebouncedCalls: 0,
    saveMetadataCalls: 0,
    saveSettingsDebounced() { this.saveSettingsDebouncedCalls++; },
    async saveMetadata() { this.saveMetadataCalls++; },
};
const storage = createHostStorage({ getContext: () => context });
assert.deepEqual(storage.settings().value, DEFAULT_SETTINGS);
context.extensionSettings.doupo_agent_ui.debug = true;
assert.equal(storage.settings().value.debug, true);
assert.equal(storage.settings().value.llm.model, '');
assert.equal(storage.updateSettings({ llm: { model: 'test-model' }, enableWorldProgress: false }).value.llm.model, 'test-model');
assert.equal(storage.settings().value.llm.maxTokens, 2048);
assert.equal(storage.settings().value.enableWorldProgress, false);
assert.equal((await storage.saveSettings()).status, 'saved');
assert.equal(context.saveSettingsDebouncedCalls, 1);
assert.equal((await storage.saveChatState({ stateVersion: 'v1', state: { hp: 10 } })).status, 'saved');
assert.deepEqual(storage.chatState().value, { stateVersion: 'v1', state: { hp: 10 } });
assert.equal(context.saveMetadataCalls, 1);
// 世界台账：独立于回合快照的聊天级存取；坏值拒绝写入。
assert.equal(storage.worldState().value, undefined);
assert.equal((await storage.saveWorldState({ clock: { day: 5 } })).status, 'saved');
assert.deepEqual(storage.worldState().value, { clock: { day: 5 } });
assert.equal((await storage.saveWorldState('junk')).status, 'rejected');
assert.equal((await storage.saveWorldState(null)).status, 'rejected');
// 世界影响库：和世界台账一样按聊天独立存一份，坏值拒绝写入。
assert.equal(storage.impactState().value, undefined);
assert.equal((await storage.saveImpactState({ day: 3, records: [] })).status, 'saved');
assert.deepEqual(storage.impactState().value, { day: 3, records: [] });
assert.equal((await storage.saveImpactState('junk')).status, 'rejected');
// 纳戒：同样按聊天独立存一份，坏值拒绝写入。
assert.equal(storage.selfState().value, undefined);
assert.equal((await storage.saveSelfState({ day: 5, realm: { realm: '斗者' } })).status, 'saved');
assert.deepEqual(storage.selfState().value, { day: 5, realm: { realm: '斗者' } });
assert.equal((await storage.saveSelfState('junk')).status, 'rejected');
assert.equal(context.saveMetadataCalls, 4);
assert.equal((await storage.clean()).status, 'cleaned');
assert.equal(context.extensionSettings.doupo_agent_ui, undefined);
assert.equal(context.chatMetadata.doupo_agent_state, undefined);
assert.equal(context.chatMetadata.doupo_agent_world, undefined);
assert.equal(context.chatMetadata.doupo_agent_impact, undefined);
assert.equal(context.chatMetadata.doupo_agent_self, undefined);
// Migrate pre-theme settings without discarding the user's existing nested fields.
context.extensionSettings.doupo_agent_ui = {
    schemaVersion: 3, ui: { compact: true }, llm: { model: 'existing-model', apiKey: 'fixture-key' },
};
assert.equal(storage.settings().value.ui.theme, 'gilt');
assert.equal(storage.settings().value.schemaVersion, DEFAULT_SETTINGS.schemaVersion);
assert.equal(storage.settings().value.sandbox.inertia, 'medium');
assert.equal(storage.updateSettings({ sandbox: { inertia: 'nonsense', maxActiveGoals: 6 } }).value.sandbox.inertia, 'medium');
assert.equal(storage.settings().value.sandbox.maxActiveGoals, 6);
assert.equal(DEFAULT_SETTINGS.enableSandboxMode, false);
for (const theme of ['graphite', 'parchment', 'gilt']) {
    const updated = storage.updateSettings({ ui: { theme } }).value;
    assert.equal(updated.ui.theme, theme);
    assert.equal(updated.ui.compact, true);
    assert.equal(updated.llm.model, 'existing-model');
    await storage.saveSettings();
    assert.equal(createHostStorage({ getContext: () => context }).settings().value.ui.theme, theme);
}
assert.equal(storage.updateSettings({ ui: { theme: 'invalid' } }).value.ui.theme, 'gilt');
assert.equal(storage.updateSettings({ llm: { temperature: 0.4 } }).value.llm.model, 'existing-model');
assert.equal(storage.settings().value.llm.apiKey, 'fixture-key');
assert.equal(createHostStorage().settings().status, 'unavailable');
assert.equal(createHostStorage().updateSettings({ ui: { theme: 'white' } }).status, 'unavailable');
assert.equal((await createHostStorage().saveSettings()).status, 'unavailable');
await assert.rejects(createHostStorage({ getContext: () => ({ saveSettingsDebounced() { throw new Error('fixture save failure'); } }) }).saveSettings(), /fixture save failure/);
// 旧配置迁移：只写过 useSillyTavernConnection 的老配置按老开关落到 mode，不被默认 tavern 覆盖；
// 落到 custom 且配齐了地址/模型的，接着被方案迁移搬成方案并绑定（手填字段不再存在，模式落回 tavern）。
const legacyCustom = { extensionSettings: { doupo_agent_ui: { llm: { useSillyTavernConnection: false, baseUrl: 'https://x/v1', model: 'm' } } } };
const legacyCustomMigrated = createHostStorage({ getContext: () => legacyCustom }).settings().value;
assert.equal(legacyCustomMigrated.llm.mode, 'tavern', '老开关迁移成 custom 后，方案迁移接手并落回 tavern');
const legacyLlmPreset = legacyCustomMigrated.api.presets.find(item => item.id === legacyCustomMigrated.llm.apiPreset);
assert.equal(legacyLlmPreset?.baseUrl, 'https://x/v1', '老开关配置搬成方案');
assert.equal(legacyLlmPreset?.model, 'm');
const legacyTavern = { extensionSettings: { doupo_agent_ui: { llm: { useSillyTavernConnection: true } } } };
assert.equal(createHostStorage({ getContext: () => legacyTavern }).settings().value.llm.mode, 'tavern');
// 已显式写过 mode 的配置不被老开关反向覆盖。
const explicitMode = { extensionSettings: { doupo_agent_ui: { llm: { mode: 'tavern', useSillyTavernConnection: false } } } };
assert.equal(createHostStorage({ getContext: () => explicitMode }).settings().value.llm.mode, 'tavern');
// 结算设置：settle 二层嵌套合并——改一个类别提示词不丢其他类别，模型/温度覆盖正常。
const settleContext = { extensionSettings: {} };
const settleStorage = createHostStorage({ getContext: () => settleContext });
assert.equal(settleStorage.settings().value.settle.temperature, 0.2);
assert.deepEqual(settleStorage.settings().value.settle.prompt, {});
settleStorage.updateSettings({ settle: { prompt: { alchemy: '丹药规则A' } } });
assert.equal(settleStorage.settings().value.settle.prompt.alchemy, '丹药规则A');
settleStorage.updateSettings({ settle: { prompt: { cultivation: '修炼规则B' } } });
assert.equal(settleStorage.settings().value.settle.prompt.alchemy, '丹药规则A', '改 cultivation 不丢 alchemy');
assert.equal(settleStorage.settings().value.settle.prompt.cultivation, '修炼规则B');
settleStorage.updateSettings({ settle: { temperature: 0.5 } });
assert.equal(settleStorage.settings().value.settle.temperature, 0.5);
assert.equal(settleStorage.settings().value.settle.prompt.alchemy, '丹药规则A', '改温度不丢提示词');
// 自定义判定：数组整存整取，和类别提示词互不干扰。
assert.deepEqual(settleStorage.settings().value.settle.customCategories, []);
settleStorage.updateSettings({ settle: { customCategories: [{ id: 'cabc1', name: '炼器判定', prompt: '规则' }] } });
assert.deepEqual(settleStorage.settings().value.settle.customCategories, [{ id: 'cabc1', name: '炼器判定', prompt: '规则' }]);
settleStorage.updateSettings({ settle: { temperature: 0.3 } });
assert.equal(settleStorage.settings().value.settle.customCategories.length, 1, '改温度不丢自定义判定');
settleStorage.updateSettings({ settle: { prompt: { alchemy: '改写' } } });
assert.equal(settleStorage.settings().value.settle.customCategories[0].name, '炼器判定', '改提示词不丢自定义判定');
// 纳戒设置：独立嵌套块合并，注入与决定开关默认齐备；决定连接已并入 memory.decide*，self 侧不再有。
const freshContext = { extensionSettings: {} };
const freshStorage = createHostStorage({ getContext: () => freshContext });
const selfSettings = freshStorage.settings().value.self;
assert.equal(freshStorage.settings().value.enableSelfLedger, true);
assert.equal(selfSettings.inject, true);
assert.equal(selfSettings.injectBudget, 900);
assert.equal(selfSettings.decideEnabled, true);
assert.equal(selfSettings.decideAuto, true);
assert.equal(selfSettings.decideMode, undefined, '旧的手填决定连接键不该再有（连接走方案）');
assert.equal(selfSettings.decideMerged, undefined, '合并决定已退役，开关键清掉');
assert.equal(selfSettings.decideApiPreset, '', '纳戒决定自己的方案绑定，默认不绑＝跟随酒馆');
assert.equal(selfSettings.decideMaxFloors, 6, '纳戒决定自己的喂楼数（v11 起与记忆分开）');
assert.equal(selfSettings.decideMaxEntries, 12, '纳戒决定自己的条目上限');
assert.equal(selfSettings.decidePrompt, '');
assert.equal(selfSettings.guide, '');
freshStorage.updateSettings({ self: { injectBudget: 1200, decidePrompt: '' } });
assert.equal(freshStorage.settings().value.self.injectBudget, 1200);
assert.equal(freshStorage.settings().value.self.decideEnabled, true, '改预算不丢决定开关');
// 决定连接并成一套（历史迁移）：老配置纳戒侧单独填过、记忆侧还是默认值 → 纳戒那份搬进 memory.decide*，
// 随后方案迁移把它搬成方案并绑定；纳戒侧死键清掉；纳戒自己的喂楼数留在纳戒侧（v11 起两边各一份）。
const selfCustomLegacy = { extensionSettings: { doupo_agent_ui: { self: { decideMode: 'custom', decideBaseUrl: 'https://ring.example/v1', decideApiKey: 'ring-key', decideModel: 'ring-model', decideTemperature: 0.3, decideMaxFloors: 9 }, memory: {} } } };
const migrated = createHostStorage({ getContext: () => selfCustomLegacy }).settings().value;
assert.equal(migrated.memory.decideMode, 'tavern', '共用键搬完、方案迁移接手后模式落回 tavern');
const ringPreset = migrated.api.presets.find(item => item.id === migrated.memory.decideApiPreset);
assert.equal(ringPreset.baseUrl, 'https://ring.example/v1', '纳戒侧手填连接经共用键搬进方案');
assert.equal(ringPreset.temperature, 0.3);
assert.equal(migrated.memory.decideMaxFloors, 6, '喂楼数不再共用：记忆侧保持默认');
assert.equal(migrated.self.decideMaxFloors, 9, '纳戒侧自己的喂楼数保留');
assert.equal(migrated.self.decideApiPreset, migrated.memory.decideApiPreset, '拆分起点：纳戒绑定继承共用方案');
assert.equal(migrated.memory.decideMaxEntries, 12, '记忆侧默认值没动');
assert.equal(migrated.self.decideMode, undefined, '纳戒侧死键清掉');
assert.equal(migrated.self.decideBaseUrl, undefined);
// 迁移后把共用卡改回跟随酒馆，不会被纳戒侧残留旧值再搬回去。
const migratedContext = { extensionSettings: { doupo_agent_ui: {} } };
migratedContext.extensionSettings.doupo_agent_ui = JSON.parse(JSON.stringify(migrated));
migratedContext.extensionSettings.doupo_agent_ui.memory.decideMode = 'tavern';
migratedContext.extensionSettings.doupo_agent_ui.memory.decideBaseUrl = '';
migratedContext.extensionSettings.doupo_agent_ui.memory.decideApiKey = '';
migratedContext.extensionSettings.doupo_agent_ui.memory.decideModel = '';
assert.equal(createHostStorage({ getContext: () => migratedContext }).settings().value.memory.decideMode, 'tavern', '共用卡改回跟随酒馆不被旧值打回');
// 两侧都配过：记忆侧（集中页一直管的那张卡）赢，纳戒侧让位。
const bothCustom = { extensionSettings: { doupo_agent_ui: { self: { decideMode: 'custom', decideBaseUrl: 'https://ring.example/v1' }, memory: { decideMode: 'custom', decideBaseUrl: 'https://memory.example/v1', decideApiKey: 'mem-key', decideModel: 'mem-model' } } } };
const bothMigrated = createHostStorage({ getContext: () => bothCustom }).settings().value;
assert.equal(bothMigrated.memory.decideBaseUrl, 'https://memory.example/v1', '两侧都配过以记忆侧为准');
assert.equal(bothMigrated.memory.decideModel, 'mem-model');
// 记忆侧配过、纳戒侧没配过：原样保留。
const memoryOnly = { extensionSettings: { doupo_agent_ui: { self: {}, memory: { decideMode: 'custom', decideBaseUrl: 'https://memory.example/v1', decideApiKey: 'mem-key', decideModel: 'mem-model' } } } };
const memoryOnlyMigrated = createHostStorage({ getContext: () => memoryOnly }).settings().value;
assert.equal(memoryOnlyMigrated.memory.decideBaseUrl, 'https://memory.example/v1', '记忆侧已有配置不被空纳戒覆盖');
// API设置方案：数组整存整取（updateSettings 嵌套合并后 normalize 清洗），绑定键默认空＝手动配置。
const apiContext = { extensionSettings: {} };
const apiStorage = createHostStorage({ getContext: () => apiContext });
assert.deepEqual(apiStorage.settings().value.api.presets, []);
assert.equal(apiStorage.settings().value.llm.apiPreset, '');
assert.equal(apiStorage.settings().value.settle.apiPreset, '');
assert.equal(apiStorage.settings().value.world.decideApiPreset, '');
assert.equal(apiStorage.settings().value.npc.ledgerApiPreset, '');
assert.equal(apiStorage.settings().value.npc.coldApiPreset, '');
assert.equal(apiStorage.settings().value.memory.decideApiPreset, '');
assert.equal(apiStorage.settings().value.impact.decideApiPreset, '');
assert.equal(apiStorage.settings().value.impact.injectApiPreset, '');
apiStorage.updateSettings({ api: { presets: [{ id: 'p1', name: '深修直连', baseUrl: 'https://x/v1', model: 'm', includeBody: 'top_k: 20' }, 'junk', { nope: true }] } });
const storedPresets = apiStorage.settings().value.api.presets;
assert.equal(storedPresets.length, 1, '字符串垃圾与全空对象丢掉，正常方案保留');
assert.equal(storedPresets[0].id, 'p1');
assert.equal(storedPresets[0].includeBody, 'top_k: 20');
apiStorage.updateSettings({ settle: { temperature: 0.4 } });
assert.equal(apiStorage.settings().value.api.presets.length, 1, '改别的组不丢方案');
apiStorage.updateSettings({ llm: { apiPreset: 'p1' } });
assert.equal(apiStorage.settings().value.llm.apiPreset, 'p1', '功能绑定方案键往返');
// 旧手填连接 → 方案迁移（schemaVersion 10）：mode=custom 且填了地址的卡整体搬成方案并绑定，
// 字段完全相同的卡去重共用一个方案；搬完该组 mode 落回 tavern（重跑无事可做）；已绑方案的组跳过。
const legacyContext = { extensionSettings: { doupo_agent_ui: {
    schemaVersion: 9,
    llm: { mode: 'custom', baseUrl: 'https://global.example/v1', apiKey: 'gk', model: 'gm', temperature: 0.7, maxTokens: 2048 },
    memory: { decideMode: 'custom', decideBaseUrl: 'https://api.deepseek.com/v1', decideApiKey: 'dk', decideModel: 'dm', decideTemperature: 0.2 },
    world: { decideMode: 'custom', decideBaseUrl: 'https://api.deepseek.com/v1', decideApiKey: 'dk', decideModel: 'dm', decideTemperature: 0.2 },
    npc: { ledgerMode: 'custom', ledgerBaseUrl: 'https://ledger.example/v1', ledgerApiKey: 'lk', ledgerModel: 'lm' },
    impact: { modelMode: 'shared', decideMode: 'custom', decideBaseUrl: 'https://impact.example/v1', decideApiKey: 'ik', decideModel: 'im', injectMode: 'custom', injectBaseUrl: 'https://inject.example/v1', injectApiKey: 'jk', injectModel: 'jm' },
} } };
const legacyMigrated = createHostStorage({ getContext: () => legacyContext }).settings().value;
assert.equal(legacyMigrated.schemaVersion, 11);
assert.equal(legacyMigrated.api.presets.length, 4, 'llm / memory+world 共用 / npc / impact.decide = 4 个方案');
const memoryPreset = legacyMigrated.api.presets.find(item => item.id === legacyMigrated.memory.decideApiPreset);
assert.equal(memoryPreset.baseUrl, 'https://api.deepseek.com/v1');
assert.equal(memoryPreset.apiKey, 'dk');
assert.equal(memoryPreset.model, 'dm');
assert.equal(memoryPreset.temperature, 0.2);
assert.equal(legacyMigrated.world.decideApiPreset, legacyMigrated.memory.decideApiPreset, '相同配置去重共用一个方案');
assert.notEqual(legacyMigrated.llm.apiPreset, legacyMigrated.memory.decideApiPreset);
assert.equal(legacyMigrated.impact.decideApiPreset, legacyMigrated.api.presets.find(item => item.baseUrl === 'https://impact.example/v1').id);
assert.equal(legacyMigrated.impact.injectApiPreset, '', 'modelMode=shared 时不给场记单独迁方案（场记跟记录员）');
assert.equal(legacyMigrated.memory.decideMode, 'tavern', '搬完模式落回 tavern');
assert.equal(legacyMigrated.memory.decideBaseUrl, 'https://api.deepseek.com/v1', '字段值保留（方案里是正本）');
// 已绑了方案的组：以绑定为准，不重复造方案
const boundContext = { extensionSettings: { doupo_agent_ui: {
    memory: { decideMode: 'custom', decideBaseUrl: 'https://x/v1', decideApiKey: 'k', decideModel: 'm' },
    api: { presets: [{ id: 'pmine', name: '我的方案', baseUrl: 'https://mine/v1' }] },
} } };
boundContext.extensionSettings.doupo_agent_ui.memory.decideApiPreset = 'pmine';
const boundMigrated = createHostStorage({ getContext: () => boundContext }).settings().value;
assert.equal(boundMigrated.memory.decideApiPreset, 'pmine', '已绑定的组不被迁移覆盖');
assert.equal(boundMigrated.api.presets.length, 1);
// 迁移已保存过（mode 全部 tavern）：删掉方案后重载不会复生
const reRunContext = { extensionSettings: { doupo_agent_ui: JSON.parse(JSON.stringify(legacyMigrated)) } };
reRunContext.extensionSettings.doupo_agent_ui.memory.decideApiPreset = '';
reRunContext.extensionSettings.doupo_agent_ui.api.presets = [];
const reRun = createHostStorage({ getContext: () => reRunContext }).settings().value;
assert.equal(reRun.api.presets.length, 0, 'mode 已落回 tavern，删掉的迁移方案不会复生');
// schemaVersion 11 拆分：纳戒决定从共用卡拆回独立一路——v10 存档的 memory 绑定与喂料复制给 self 做起点；
// 版本门保证只跑一次：升级后两侧各改各的，互不回写。
const v10Context = { extensionSettings: { doupo_agent_ui: {
    schemaVersion: 10,
    memory: { decideApiPreset: 'pA', decideMaxFloors: 8, decideMaxEntries: 20 },
} } };
const v11Migrated = createHostStorage({ getContext: () => v10Context }).settings().value;
assert.equal(v11Migrated.schemaVersion, 11);
assert.equal(v11Migrated.self.decideApiPreset, 'pA', '纳戒决定继承拆分前的共用绑定');
assert.equal(v11Migrated.self.decideMaxFloors, 8);
assert.equal(v11Migrated.self.decideMaxEntries, 20);
const rebindContext = { extensionSettings: { doupo_agent_ui: JSON.parse(JSON.stringify(v11Migrated)) } };
rebindContext.extensionSettings.doupo_agent_ui.memory.decideApiPreset = 'pB';
rebindContext.extensionSettings.doupo_agent_ui.memory.decideMaxFloors = 3;
const rebind = createHostStorage({ getContext: () => rebindContext }).settings().value;
assert.equal(rebind.self.decideApiPreset, 'pA', '拆分后记忆侧改动不回写纳戒');
assert.equal(rebind.self.decideMaxFloors, 8, '拆分后记忆侧喂料改动不回写纳戒');
console.log('host storage tests passed');
