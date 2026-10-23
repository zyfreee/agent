import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
for (const page of ['llm', 'facts', 'action', 'world', 'npc', 'impact', 'runtime']) {
    assert.match(entry, new RegExp(`data-settings-page="${page}"`), `缺少独立页面：${page}`);
    assert.match(entry, new RegExp(`data-settings-section="${page}"`), `缺少页面内容：${page}`);
}
for (const setting of ['llm.provider', 'facts.maxEntries', 'action.requireConfirmation', 'world.tickMinutes', 'npc.maxCandidates', 'impact.maxChainDepth', 'budget.maxModules', 'status.showHistory']) {
    assert.match(entry, new RegExp(`data-setting="${setting.replace('.', '\\.')}`), `缺少设置绑定：${setting}`);
}
assert.match(entry, /activeSettingsPage/);
assert.match(entry, /function selectPage|const selectPage/);
assert.match(entry, /#extensions_settings/);
assert.match(entry, /new MutationObserver/);
assert.match(entry, /inlineSettingsGeneration/);
console.log(`settings template smoke checks passed: ${directory}`);
