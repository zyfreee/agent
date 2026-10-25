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
assert.equal((await storage.clean()).status, 'cleaned');
assert.equal(context.extensionSettings.doupo_agent_ui, undefined);
assert.equal(context.chatMetadata.doupo_agent_state, undefined);
// Migrate pre-theme settings without discarding the user's existing nested fields.
context.extensionSettings.doupo_agent_ui = {
    schemaVersion: 3, ui: { compact: true }, llm: { model: 'existing-model', apiKey: 'fixture-key' },
};
assert.equal(storage.settings().value.ui.theme, 'black');
assert.equal(storage.settings().value.schemaVersion, 4);
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
console.log('host storage tests passed');
