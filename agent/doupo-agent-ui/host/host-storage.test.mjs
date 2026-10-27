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
assert.equal(context.saveMetadataCalls, 3);
assert.equal((await storage.clean()).status, 'cleaned');
assert.equal(context.extensionSettings.doupo_agent_ui, undefined);
assert.equal(context.chatMetadata.doupo_agent_state, undefined);
assert.equal(context.chatMetadata.doupo_agent_world, undefined);
assert.equal(context.chatMetadata.doupo_agent_impact, undefined);
// Migrate pre-theme settings without discarding the user's existing nested fields.
context.extensionSettings.doupo_agent_ui = {
    schemaVersion: 3, ui: { compact: true }, llm: { model: 'existing-model', apiKey: 'fixture-key' },
};
assert.equal(storage.settings().value.ui.theme, 'black');
assert.equal(storage.settings().value.schemaVersion, 7);
assert.equal(storage.settings().value.sandbox.inertia, 'medium');
assert.equal(storage.updateSettings({ sandbox: { inertia: 'nonsense', maxActiveGoals: 6 } }).value.sandbox.inertia, 'medium');
assert.equal(storage.settings().value.sandbox.maxActiveGoals, 6);
assert.equal(DEFAULT_SETTINGS.enableSandboxMode, false);
for (const theme of ['white', 'beige', 'black']) {
    const updated = storage.updateSettings({ ui: { theme } }).value;
    assert.equal(updated.ui.theme, theme);
    assert.equal(updated.ui.compact, true);
    assert.equal(updated.llm.model, 'existing-model');
    await storage.saveSettings();
    assert.equal(createHostStorage({ getContext: () => context }).settings().value.ui.theme, theme);
}
assert.equal(storage.updateSettings({ ui: { theme: 'invalid' } }).value.ui.theme, 'black');
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
console.log('host storage tests passed');
