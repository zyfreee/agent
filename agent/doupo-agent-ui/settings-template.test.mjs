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
for (const page of ['hub', 'facts', 'action', 'world', 'npc', 'npcledger', 'self', 'memory', 'impact', 'sandbox', 'runtime']) {
    assert.match(entry, new RegExp(`data-settings-page="${page}"`), `缺少独立页面：${page}`);
    assert.match(entry, new RegExp(`data-settings-section="${page}"`), `缺少页面内容：${page}`);
}
assert.doesNotMatch(entry, /data-settings-page="llm"/, '「模型与连接」页已并入「模型设置」，不该再出现');
assert.doesNotMatch(entry, /data-settings-page="exp"/, '独立「经历」页已并入人物信息面板弹窗，不该再出现');
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
assert.match(entry, /data-npc-profile/, '人物经历应并进人物信息面板弹窗');
assert.match(entry, /data-npc-exp-add/, '信息面板应能手动补经历');
assert.match(entry, /data-exp-condense/, '经历精简应挂在信息面板里');
// 沙盒开关必须真的写到正式模式记录，否则只是留在设置里的开关。
assert.match(entry, /data-sandbox-status/);
assert.match(entry, /function syncSandboxModeFromSettings/);
assert.match(entry, /agentSandboxMode\.sync\(\{/);
assert.match(entry, /agentSandboxMode\.read\(\{/);
// 连接模式的灰显联动必须一张表管全：模板里每个连接模式下拉都要登记进 CONNECTION_MODE_TOGGLERS，
// 否则当场切换“跟随酒馆/自定义”时那张卡的地址/密钥不会跟着灰显或解禁
//（曾经漏过原著资料、记忆书记官、人物簿记录员三张卡，选了自定义还灰着、跟随酒馆还能改地址）。
const registryStart = entry.indexOf('const CONNECTION_MODE_TOGGLERS');
const registryEnd = entry.indexOf(']);', registryStart);
assert.ok(registryStart >= 0 && registryEnd > registryStart, '找不到连接模式登记表 CONNECTION_MODE_TOGGLERS');
const registryKeys = [...entry.slice(registryStart, registryEnd).matchAll(/\['([a-zA-Z0-9_.]*(?:mode|Mode))',/g)].map(match => match[1]);
// 连接模式下拉的判据：选项里有“跟随酒馆”(value="tavern")。facts.sourceMode 这类业务模式下拉不算。
const modeSelects = [...new Set([...entry.matchAll(/<select[^>]*data-setting="([a-zA-Z0-9_.]+)"[^>]*>((?:(?!<\/select>).)*)<\/select>/gs)]
    .filter(match => match[2].includes('value="tavern"'))
    .map(match => match[1]))];
assert.ok(modeSelects.length >= 10, `连接模式下拉数量异常：${modeSelects.join(', ')}`);
for (const mode of modeSelects) {
    assert.ok(registryKeys.includes(mode), `连接模式 ${mode} 没登记进 CONNECTION_MODE_TOGGLERS，切换时这张卡不会联动`);
}
// “拉取模型”的取值判据：fetchModelList 传进来的名字是 'BaseUrl'/'ApiKey'。
// 曾把判据写成 name === 'Base'（永远判不中），接口地址取到密钥那一格，
// 请求变成 “sk-xxx/v1/models” 相对路径打到酒馆自己，所有卡点拉取全是 404。
assert.doesNotMatch(entry, /name === 'Base'\s*\?/, "拉取模型取值判据写错：'Base' 永远不等于传入的 'BaseUrl'，会把密钥当成接口地址发出去");
for (const path of ['llm.baseUrl', 'setting.baseUrl', 'settle.baseUrl', 'world.decideBaseUrl', 'self.decideBaseUrl', 'memory.decideBaseUrl', 'npc.ledgerBaseUrl', 'npc.coldBaseUrl']) {
    assert.match(entry, new RegExp(`name === 'BaseUrl' \\? readSettingInput\\(panel, '${path.replace('.', '\\.')}'\\)`), `拉取模型必须读 ${path}`);
}
// 每一张连接卡都必须有“拉取模型”按钮，且模板里的按钮、取值函数、点击接线三者一个不能少
//（记忆书记官、冷藏推进员曾经只有接线没有按钮，全局连接和人物簿记录员干脆两边都没有，玩家对着模型名手抄）。
for (const [button, fn] of [
    ['data-llm-models', 'fetchLlmModels'],
    ['data-facts-models', 'fetchFactsModels'],
    ['data-settle-models', 'fetchSettleModels'],
    ['data-worlddecide-models', 'fetchWorldDecideModels'],
    ['data-selfdecide-models', 'fetchSelfDecideModels'],
    ['data-memorydecide-models', 'fetchMemoryDecideModels'],
    ['data-npc-ledger-models', 'fetchNpcLedgerModels'],
    ['data-npc-cold-models', 'fetchNpcColdModels'],
]) {
    assert.match(hubMarkup, new RegExp(button.replace(/-/g, '\\-')), `模型设置页缺少拉取按钮：${button}`);
    assert.match(entry, new RegExp(`function ${fn}\\(`), `缺少拉取函数：${fn}`);
    assert.match(entry, new RegExp(`closest\\?\\.\\('\\[${button.replace(/-/g, '\\-')}\\]'\\)`), `拉取按钮没有点击接线：${button}`);
}
assert.match(hubMarkup, /data-impact-models="decide"/, '模型设置页缺少记录员拉取按钮');
assert.match(hubMarkup, /data-impact-models="inject"/, '模型设置页缺少场记拉取按钮');
// 拉到的模型必须真的可点选：fetchModelList 要给模型输入框接上 datalist（模板没铺就现建），
// 否则候选拉回来只能塞进空气，状态栏“点模型名那一格就能选”成了一句空话。
assert.match(entry, /targetInput\.list/, '拉取模型要检查输入框已接的 datalist');
assert.match(entry, /createElement\('datalist'\)/, '拉取模型要能现建 datalist');
assert.match(entry, /setAttribute\('list'/, '拉取模型要把 list 属性接到输入框上');
// 原著设定页的“模型”状态行要读选条自己的连接卡（setting.*），空项才标注沿用全局；
// 曾经只读全局连接，功能卡配好了状态栏还喊“未填地址·未填模型”，误导排查。
assert.match(entry, /const factsCfg = settings\.setting \?\? \{\};/, '原著状态行的模型信息必须读 setting 自己的连接');
assert.match(entry, /空项沿用全局/, '原著状态行要标注哪些项沿用了全局');
console.log(`settings template smoke checks passed: ${directory}`);
