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
for (const page of ['hub', 'facts', 'action', 'world', 'npc', 'npcledger', 'exp', 'self', 'memory', 'impact', 'sandbox', 'runtime']) {
    assert.match(entry, new RegExp(`data-settings-page="${page}"`), `缺少独立页面：${page}`);
    assert.match(entry, new RegExp(`data-settings-section="${page}"`), `缺少页面内容：${page}`);
}
assert.doesNotMatch(entry, /data-settings-page="llm"/, '「模型与连接」页已并入「模型设置」，不该再出现');
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
// 「模型设置」集中页必须真的收齐每一路独立模型调用的接口与参数，且功能页不再重复：
// 同一份 API 设置只允许出现一次（就在模型设置页），提示词则只留在各功能页。
const hubStart = entry.indexOf('data-settings-section="hub"');
const hubEnd = entry.indexOf('data-settings-section="facts"');
assert.ok(hubStart >= 0 && hubEnd > hubStart, '找不到「模型设置」集中页');
const hubMarkup = entry.slice(hubStart, hubEnd);
for (const setting of ['llm.mode', 'setting.mode', 'settle.mode', 'world.decideMode', 'npc.ledgerMode', 'npc.coldMode', 'self.decideMode', 'memory.decideMode', 'impact.decideMode', 'impact.injectMode']) {
    assert.match(hubMarkup, new RegExp(`data-setting="${setting.replace('.', '\\.')}"`), `模型设置页缺少：${setting}`);
    assert.equal(boundPaths.filter(path => path === setting).length, 1, `接口设置应只在模型设置页出现一次：${setting}`);
}
for (const prompt of ['world.decidePrompt', 'npc.ledgerPrompt', 'npc.coldPrompt', 'self.decidePrompt', 'memory.decidePrompt', 'impact.prompt', 'impact.injectPrompt']) {
    assert.doesNotMatch(hubMarkup, new RegExp(`data-setting="${prompt.replace('.', '\\.')}"`), `提示词不该在模型设置页：${prompt}`);
    assert.ok(boundPaths.includes(prompt), `功能页缺少提示词绑定：${prompt}`);
}
assert.match(entry, /data-agent-modal/, '页面应有统一弹窗容器');
assert.match(entry, /data-modal-dock=/, '添加表单应停靠进弹窗');
assert.match(entry, /data-exp-list/, '应有独立的人物经历页');
// 沙盒开关必须真的写到正式模式记录，否则只是留在设置里的开关。
assert.match(entry, /data-sandbox-status/);
assert.match(entry, /function syncSandboxModeFromSettings/);
assert.match(entry, /agentSandboxMode\.sync\(\{/);
assert.match(entry, /agentSandboxMode\.read\(\{/);
console.log(`settings template smoke checks passed: ${directory}`);
