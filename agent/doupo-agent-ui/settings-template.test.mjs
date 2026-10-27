import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_SETTINGS } from './host/host-storage.js';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('./', import.meta.url));
const template = await readFile(new URL('../../settings.html', import.meta.url), 'utf8');
const fallbackTemplate = await readFile(new URL('./settings.html', import.meta.url), 'utf8');
const entry = await readFile(new URL('./index.js', import.meta.url), 'utf8');

assert.match(template, /class="inline-drawer"/);
assert.match(template, /class="[^"]*dai-inline-open[^"]*"/);
assert.equal(fallbackTemplate, template, '相对路径备用模板必须与根目录标准模板一致');
assert.match(entry, /renderExtensionTemplateAsync\('third-party\/agent', 'settings'\)/);
assert.match(entry, /new URL\('\.\/settings\.html', import\.meta\.url\)/);
assert.match(entry, /#extensions_settings2/);
assert.match(entry, /data-settings-page="overview"/);
for (const page of ['llm', 'facts', 'action', 'world', 'npc', 'npcledger', 'impact', 'sandbox', 'runtime']) {
    assert.match(entry, new RegExp(`data-settings-page="${page}"`), `缺少独立页面：${page}`);
    assert.match(entry, new RegExp(`data-settings-section="${page}"`), `缺少页面内容：${page}`);
}
for (const setting of ['llm.provider', 'facts.maxEntries', 'action.requireConfirmation', 'world.tickMinutes', 'npc.maxCandidates', 'impact.maxChainDepth', 'impact.decideTemperature', 'impact.decideMaxTokens', 'impact.decideTopP', 'impact.injectTemperature', 'impact.injectMaxTokens', 'impact.injectPresencePenalty', 'enableSandboxMode', 'sandbox.inertia', 'sandbox.maxActiveGoals', 'budget.maxModules', 'status.showHistory', 'setting.progress', 'injection.depth', 'ui.legacyTurn', 'prompt.select']) {
    assert.match(entry, new RegExp(`data-setting="${setting.replace('.', '\\.')}`), `缺少设置绑定：${setting}`);
}
assert.match(entry, /activeSettingsPage/);
assert.match(entry, /data-module-list/);
for (const theme of ['white', 'black', 'beige']) {
    assert.match(entry, new RegExp(`type="radio"[^>]+value="${theme}"[^>]+data-setting="ui\\.theme"`));
}
assert.match(entry, /await hostStorage\.saveSettings\(\)/);
assert.match(entry, /settingsSaveSequence/);
assert.match(entry, /function selectPage|const selectPage/);
assert.match(entry, /#extensions_settings/);
assert.match(entry, /new MutationObserver/);
assert.match(entry, /inlineSettingsGeneration/);
// 面板上每个 data-setting 都必须在默认设置里有落点，避免页面开关写好了却没有对应状态。
const boundPaths = [...entry.matchAll(/data-setting="([a-zA-Z0-9_.]+)"/g)].map(match => match[1]);
assert.ok(boundPaths.length >= 20, `绑定数量异常：${boundPaths.length}`);
for (const path of new Set(boundPaths)) {
    let node = DEFAULT_SETTINGS;
    for (const key of path.split('.')) {
        assert.ok(node && Object.prototype.hasOwnProperty.call(node, key), `设置项没有默认值：${path}`);
        node = node[key];
    }
}
assert.ok(boundPaths.includes('sandbox.inertia'));
// 沙盒开关必须真的写到正式模式记录，否则只是留在设置里的开关。
assert.match(entry, /data-sandbox-status/);
assert.match(entry, /function syncSandboxModeFromSettings/);
assert.match(entry, /agentSandboxMode\.sync\(\{/);
assert.match(entry, /agentSandboxMode\.read\(\{/);
console.log(`settings template smoke checks passed: ${directory}`);
