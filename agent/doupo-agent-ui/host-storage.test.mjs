import assert from 'node:assert/strict';
import { createHostStorage, DEFAULT_SETTINGS } from './host-storage.js';

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
assert.equal((await storage.saveSettings()).status, 'saved');
assert.equal(context.saveSettingsDebouncedCalls, 1);
assert.equal((await storage.saveChatState({ stateVersion: 'v1', state: { hp: 10 } })).status, 'saved');
assert.deepEqual(storage.chatState().value, { stateVersion: 'v1', state: { hp: 10 } });
assert.equal(context.saveMetadataCalls, 1);
assert.equal((await storage.clean()).status, 'cleaned');
assert.equal(context.extensionSettings.doupo_agent_ui, undefined);
assert.equal(context.chatMetadata.doupo_agent_state, undefined);
console.log('host storage tests passed');
