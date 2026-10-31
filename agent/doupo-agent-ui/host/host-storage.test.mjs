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
// 旧配置迁移：只写过 useSillyTavernConnection 的老配置按老开关落到 mode，不被默认 tavern 覆盖。
const legacyCustom = { extensionSettings: { doupo_agent_ui: { llm: { useSillyTavernConnection: false, baseUrl: 'https://x/v1', model: 'm' } } } };
assert.equal(createHostStorage({ getContext: () => legacyCustom }).settings().value.llm.mode, 'custom');
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
assert.equal(selfSettings.decideMode, undefined, '决定连接已并到记忆侧，self 不该再有 decideMode');
assert.equal(selfSettings.decideMaxFloors, undefined);
assert.equal(selfSettings.decideMaxEntries, undefined);
assert.equal(selfSettings.decidePrompt, '');
assert.equal(selfSettings.guide, '');
freshStorage.updateSettings({ self: { injectBudget: 1200, decidePrompt: '' } });
assert.equal(freshStorage.settings().value.self.injectBudget, 1200);
assert.equal(freshStorage.settings().value.self.decideEnabled, true, '改预算不丢决定开关');
// 决定连接并成一套：老配置纳戒侧单独填过、记忆侧还是默认值 → 纳戒那份搬进 memory.decide* 当共用，
// 且纳戒侧死键清掉（下次加载不会再被搬一遍）；两侧都填过以记忆侧为准。
const selfCustomLegacy = { extensionSettings: { doupo_agent_ui: { self: { decideMode: 'custom', decideBaseUrl: 'https://ring.example/v1', decideApiKey: 'ring-key', decideModel: 'ring-model', decideTemperature: 0.3, decideMaxFloors: 9 }, memory: {} } } };
const migrated = createHostStorage({ getContext: () => selfCustomLegacy }).settings().value;
assert.equal(migrated.memory.decideMode, 'custom', '纳戒侧自定义连接搬成共用');
assert.equal(migrated.memory.decideBaseUrl, 'https://ring.example/v1');
assert.equal(migrated.memory.decideApiKey, 'ring-key');
assert.equal(migrated.memory.decideModel, 'ring-model');
assert.equal(migrated.memory.decideTemperature, 0.3);
assert.equal(migrated.memory.decideMaxFloors, 9);
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
console.log('host storage tests passed');
