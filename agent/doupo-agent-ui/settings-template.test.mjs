import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_SETTINGS } from './host/host-storage.js';
import { createSandboxMode } from './sandbox/sandbox-mode.js';
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
for (const page of ['apis', 'hub', 'facts', 'action', 'world', 'npc', 'npcledger', 'self', 'memory', 'impact', 'sandbox', 'runtime']) {
    assert.match(entry, new RegExp(`data-settings-page="${page}"`), `缺少独立页面：${page}`);
    assert.match(entry, new RegExp(`data-settings-section="${page}"`), `缺少页面内容：${page}`);
}
assert.doesNotMatch(entry, /data-settings-page="llm"/, '「模型与连接」页已并入「模型设置」，不该再出现');
assert.doesNotMatch(entry, /data-settings-page="exp"/, '独立「经历」页已并入人物信息面板弹窗，不该再出现');
for (const setting of ['action.requireConfirmation', 'npc.maxCandidates', 'impact.maxChainDepth', 'enableSandboxMode', 'sandbox.inertia', 'budget.maxModules', 'status.showHistory', 'setting.progress', 'injection.depth', 'prompt.select']) {
    assert.match(entry, new RegExp(`data-setting="${setting.replace('.', '\\.')}`), `缺少设置绑定：${setting}`);
}
for (const retired of ['enableFactsLibrary', 'facts.sourceMode', 'facts.maxEntries', 'facts.includeUnverified', 'enableWorldProgress', 'world.autoAdvance', 'world.tickMinutes', 'world.preserveUnconfirmed', 'ui.legacyTurn']) {
    assert.doesNotMatch(entry, new RegExp(`data-setting="${retired.replace('.', '\\.')}"`), `旧链路开关应已随退役卡删除：${retired}`);
}
assert.doesNotMatch(entry, /旧版资料查询|旧链路（手动结算）|旧版手动脉冲|data-agent-run"|data-agent-retry"/, '旧版手动结算入口应已删除');
assert.match(entry, /activeSettingsPage/);
assert.match(entry, /data-module-list/);
for (const theme of ['gilt', 'graphite', 'parchment']) {
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
// 「模型设置」页已减负成“每个功能只选一个方案”（schemaVersion 10）：
// 旧的手填字段（模式选择、地址/密钥/协议/模型名、采样参数、每卡拉取按钮）全部删除，
// 不绑方案＝跟随酒馆主连接；旧配置由 host-storage 的迁移一次性搬成方案并绑定。
const hubStart = entry.indexOf('data-settings-section="hub"');
const hubEnd = entry.indexOf('data-settings-section="facts"');
assert.ok(hubStart >= 0 && hubEnd > hubStart, '找不到「模型设置」集中页');
const hubMarkup = entry.slice(hubStart, hubEnd);
for (const legacy of ['llm.mode', 'llm.baseUrl', 'llm.apiKey', 'llm.model', 'llm.temperature', 'llm.topP', 'setting.mode', 'setting.baseUrl', 'settle.mode', 'settle.baseUrl', 'settle.temperature', 'world.decideMode', 'world.decideBaseUrl', 'world.decideTemperature', 'npc.ledgerMode', 'npc.ledgerBaseUrl', 'npc.ledgerTemperature', 'npc.coldMode', 'npc.coldBaseUrl', 'memory.decideMode', 'memory.decideBaseUrl', 'memory.decideTemperature', 'impact.modelMode', 'impact.decideMode', 'impact.decideBaseUrl', 'impact.decideTemperature', 'impact.injectMode', 'impact.injectBaseUrl', 'impact.injectTemperature']) {
    assert.doesNotMatch(entry, new RegExp(`data-setting="${legacy.replace('.', '\\.')}"`), `手填字段应已删除：${legacy}`);
}
for (const legacyButton of ['data-llm-models', 'data-facts-models', 'data-settle-models', 'data-worlddecide-models', 'data-memorydecide-models', 'data-npc-ledger-models', 'data-npc-cold-models', 'data-impact-models']) {
    assert.doesNotMatch(entry, new RegExp(legacyButton.replace(/-/g, '\\-')), `每卡拉取模型按钮应已删除（方案卡上保留）：${legacyButton}`);
}
assert.doesNotMatch(entry, /CONNECTION_MODE_TOGGLERS/, '连接模式登记表应随模式选择一起删除');
// 非连接类的运行参数保留在卡上：全局超时、世界/记忆的喂楼数（条目上限已退役——决定改读原著资料注入内容）。
for (const keep of ['llm.timeoutMs', 'world.decideMaxFloors', 'memory.decideMaxFloors']) {
    assert.match(hubMarkup, new RegExp(`data-setting="${keep.replace('.', '\\.')}"`), `模型设置页应保留运行参数：${keep}`);
}
for (const retired of ['world.decideMaxEntries', 'self.decideMaxEntries', 'memory.decideMaxEntries', 'impact.decideMaxEntries']) {
    assert.doesNotMatch(entry, new RegExp(`data-setting="${retired.replace('.', '\\.')}"`), `条目上限设置应已删除：${retired}`);
}
// API设置：方案编辑元素齐备；「模型设置」页每卡一个方案选择（纳戒决定与记忆决定是两条独立调用，各自绑定）。
const apisStart = entry.indexOf('data-settings-section="apis"');
const apisEnd = entry.indexOf('data-settings-section="hub"');
assert.ok(apisStart >= 0 && apisEnd > apisStart, '找不到「API设置」页');
const apisMarkup = entry.slice(apisStart, apisEnd);
assert.match(apisMarkup, /data-api-preset-list/, 'API设置页缺少方案列表容器');
assert.match(apisMarkup, /data-api-add-preset/, 'API设置页缺少新建方案按钮');
for (const binding of ['llm.apiPreset', 'setting.apiPreset', 'world.decideApiPreset', 'npc.ledgerApiPreset', 'npc.extractApiPreset', 'npc.expApiPreset', 'npc.coldApiPreset', 'self.decideApiPreset', 'memory.decideApiPreset', 'memory.recallApiPreset', 'memory.consolidateApiPreset', 'impact.decideApiPreset', 'impact.injectApiPreset']) {
    assert.equal(boundPaths.filter(path => path === binding).length, 1, `方案绑定下拉应只在模型设置页出现一次：${binding}`);
}
assert.match(hubMarkup, /data-api-preset-select/g ? /data-api-preset-select/ : /never/, '模型设置页缺少方案绑定下拉');
assert.equal([...hubMarkup.matchAll(/data-api-preset-select/g)].length, 17, '方案绑定下拉应恰好 17 个（完整版 14 张功能卡 + 简略版素材总挑选/总结算两张合并卡 + 简略版行动结算判定卡）');
// settle.resultApiPreset 在完整版与简略版各出现一次（同一绑定、两版各一张卡，同屏只显示其一）。
assert.equal(boundPaths.filter(path => path === 'settle.resultApiPreset').length, 2, '行动结算判定绑定应完整版/简略版各一张卡');
assert.doesNotMatch(entry, /data-setting="settle\.apiPreset"/, '分类判定已并入最终判定同一套 API，不再有独立绑定下拉');
// 绑定下拉首项＝跟随酒馆主连接（不绑方案的语义），不再是“手动配置”。
assert.match(entry, /跟随酒馆主连接（不绑方案）/, '绑定下拉首项应标明“跟随酒馆主连接”');
assert.doesNotMatch(entry, /手动配置（用下面的字段）/, '“手动配置”选项应随手填字段一起删除');
// 构建器语义：绑定了方案整套走方案，没绑＝跟随酒馆（connection: 'tavern'），不再读旧手填字段拼覆盖。
assert.match(entry, /function presetOverrides/, '缺少方案覆盖解析函数');
assert.match(entry, /presetOverrides\('memory'\) \?\? \{ connection: 'tavern' \}/, '记忆决定没绑方案时应回落跟随酒馆');
assert.match(entry, /recallOverrides: presetOverrides\('memoryRecall'\) \?\? \{ connection: 'tavern' \}/, '记忆召回没绑方案时应回落跟随酒馆');
assert.match(entry, /consolidateOverrides: presetOverrides\('memoryConsolidate'\) \?\? \{ connection: 'tavern' \}/, '记忆总结没绑方案时应回落跟随酒馆');
assert.match(entry, /overrides: presetOverrides\('settleResult'\) \?\? \{ connection: 'tavern' \}/, '行动结算（分类判定并入最终判定）没绑方案时应回落跟随酒馆');
assert.match(entry, /presetOverrides\('settleResult'\) \?\? \{ connection: 'tavern' \}/, '生成前最终判定没绑方案也应跟随酒馆');
assert.match(entry, /data-settle-follow-default/, '自定义提示词必须能显式恢复跟随默认');
assert.match(entry, /data-settle-prompt-warning/, '保留旧提示词时必须提示格式兼容边界');
assert.match(entry, /writeSettleAdjudicationForPrompt\(\{ force: true, preview: true \}\)/, '手动按钮只预览，不占用正文注入通道');
assert.match(entry, /presetOverrides\('world'\) \?\? \{ connection: 'tavern' \}/, '世界决定没绑方案时应回落跟随酒馆');
assert.match(entry, /presetOverrides\('npcCold'\) \?\? \{ connection: 'tavern' \}/, '冷藏推进员没绑方案时应回落跟随酒馆');
assert.match(entry, /return presetOverrides\('facts'\);/, '原著选条没绑方案时应回落跟随酒馆');
assert.match(entry, /function impactPlanFromPreset/, '缺少影响方案→计划转换');
// 方案卡上的“拉取模型”：按钮、取值函数、点击接线三者一个不能少（这是全扩展唯一的拉模型入口；
// 按钮由 apiPresetHtml 运行时生成，不在静态节标里）。
assert.match(entry, /data-api-preset-models/, '方案卡缺少拉取模型按钮');
assert.match(entry, /async function fetchApiPresetModels\(/, '缺少方案卡拉取函数');
assert.match(entry, /closest\?\.\('\[data-api-preset-models\]'\)/, '方案卡拉取按钮没有点击接线');
// 纳戒与记忆的决定连接合并成一套（统一存 memory.decide*，模型设置页“纳戒与记忆 · 决定模型”一张卡）：
// 纳戒侧的独立连接卡、模式下拉与拉取按钮不该再出现。
assert.doesNotMatch(entry, /data-setting="self\.decideMode"/, '纳戒决定连接已并入记忆侧共用卡，不该再有 self.decideMode 绑定');
assert.doesNotMatch(entry, /data-selfdecide-models/, '纳戒侧拉取模型按钮已随合并卡删除');
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
assert.match(entry, /agentSandboxMode\.(?:sync|followSwitch)\(\{/, '设置页的沙盒开关必须把开关状态交给模式运行时');
assert.match(entry, /agentSandboxMode\.read\(\{/);
// 光看调用名不够：开关动作要真的落到模式记录里，界面开关与提示词口径才一致。
{
    const runtime = createSandboxMode();
    const scope = { sessionId: 'settings-template', branchId: 'main' };
    assert.equal(runtime.read(scope).status, 'empty', '新会话还没写过模式记录');
    const flipped = runtime.followSwitch({ ...scope, sandbox: true, inertia: 'medium' });
    assert.equal(flipped.mode, 'sandbox', '沙盒开关必须真的写入模式记录，而不能只留在设置里');
    assert.equal(runtime.read(scope).mode, 'sandbox', '写入后读回仍是沙盒口径');
    const back = runtime.followSwitch({ ...scope, sandbox: false, inertia: 'medium' });
    assert.equal(back.mode, 'mainline', '关掉开关要回到主线口径，不能留着沙盒记录');
}
// 功能守卫：绑了方案（connection === 'custom'）直连方案端点；没绑＝跟随酒馆，只看酒馆静默
// 生成这条路通不通（availableFor('tavern')），不拿“全局连接是否配好”当代理——
// 全局选了自定义但空着时，configured() 永远是 false，跟酒馆模式的功能会被误拦在门口（世界决定同病）。
const ledgerGuard = entry.slice(entry.indexOf('async function runNpcLedgerRecord'), entry.indexOf('/** 生成前把人物档案写进正文提示词'));
assert.match(ledgerGuard, /settings\.connection !== 'custom' && agentLlmClient\.availableFor\('tavern'\) !== true/, '记录员的连接检查：custom 不查全局，tavern 只看静默生成可用');
const extractGuard = entry.slice(entry.indexOf('async function runNpcLedgerExtract'), entry.indexOf('/** 记录员这一路用哪套连接'));
assert.match(extractGuard, /overrides\.connection !== 'custom' && agentLlmClient\.availableFor\('tavern'\) !== true/, '按世界书补档的连接检查：用档案抄录自己的绑定，custom 不查全局，tavern 只看静默生成可用');
const expGuard = entry.slice(entry.indexOf('async function runExpCondense'), entry.indexOf('pendingExpCondense = request;'));
assert.match(expGuard, /overrides\.connection !== 'custom' && agentLlmClient\.availableFor\('tavern'\) !== true/, '经历精简的连接检查：用精简自己的绑定');
const worldGuard = entry.slice(entry.indexOf('async function runWorldDecision'), entry.indexOf('let memoryDecideRunning'));
assert.match(worldGuard, /settings\.overrides\.connection !== 'custom' && agentLlmClient\.availableFor\('tavern'\) !== true/, '世界决定的连接检查：custom 不查全局，tavern 只看静默生成可用');
assert.doesNotMatch(entry, /agentLlmClient\.configured\(\) !== true/, '功能守卫不许再用 configured() 当连接检查——它只反映全局卡，不代表这一路自己的连接');
// 人物信息面板默认只读：右上角铅笔切进编辑，有货的字段铺成文本行，空字段不铺一屏输入框；
// 弹窗必须 fixed 定位——absolute 在很长的设置页里居中，会把弹窗顶出屏幕外。
const styleCss = await readFile(new URL('./host/style.css', import.meta.url), 'utf8');
assert.match(entry, /npcProfileEdit/, '信息面板缺少右上角的编辑铅笔');
assert.match(entry, /dai-npc-read/, '信息面板缺少只读视图容器');
assert.match(entry, /function npcProfileReadText/, '只读视图缺少文本渲染函数');
// 只读视图必须把字段全部铺出来：有内容写内容，没内容空着画“—”，一页装不下就拆页（基本/心性/资产）。
// 曾经只铺有值的字段，玩家一看“我要的信息变少了”——空字段也得占一行，页签跟经历/流水同级。
assert.match(entry, /NPC_INFO_BUNDLES/, '信息页要按组拆成多页（基本/心性/资产）');
assert.match(styleCss, /is-empty/, '空字段要有占位样式');
assert.match(styleCss, /\.dai-agent-modal \{ position: fixed/, '弹窗必须 fixed 定位，否则在长设置页里会超出屏幕');
// 拉到的模型必须真的可点选：方案卡拉取要给模型输入框接上 datalist（模板没铺就现建），
// 否则候选拉回来只能塞进空气，状态栏“点模型名那一格就能选”成了一句空话。
assert.match(entry, /modelInput\.list/, '拉取模型要检查输入框已接的 datalist');
assert.match(entry, /createElement\('datalist'\)/, '拉取模型要能现建 datalist');
assert.match(entry, /setAttribute\('list'/, '拉取模型要把 list 属性接到输入框上');
// 原著设定页的“模型”状态行要读选条绑定的方案（setting.apiPreset），没绑就照实说跟随酒馆；
// 曾经只读全局连接，功能卡配好了状态栏还喊“未填地址·未填模型”，误导排查。
assert.match(entry, /fieldValue\(settings, 'setting\.apiPreset'\)/, '原著状态行必须读选条绑定的方案');
assert.match(entry, /跟随酒馆主连接（未绑方案）/, '原著状态行没绑方案时要标注跟随酒馆');
// 滚轮接力：悬浮层（设置面板/球）里所有滚动盒滑到头后必须把滚轮交出去，
// 逐层往外（清单→页面主区），最外层落到主界面（酒馆聊天区 #chat）；
// 原生滚动链到 fixed 弹层就断（body 不滚），不许用 overscroll-behavior: contain 把链锁死。
assert.match(entry, /function relayWheelToInterface/, '缺少滚轮接力函数');
assert.match(entry, /addEventListener\('wheel', relayWheelToInterface, \{ passive: false \}\)/, '滚轮接力要绑在 document 上且 passive:false');
assert.match(entry, /SCROLL_RELAY_SELECTOR = '\.dai-settings-panel, \.dai-orb'/, '接力范围必须盖住设置面板与悬浮球');
assert.match(entry, /getElementById\('chat'\)/, '接力终点必须是主界面聊天区 #chat');
assert.doesNotMatch(styleCss, /overscroll-behavior:\s*contain/, '滚动盒不许 contain 锁链——滑到头要交出去');
// 装备槽位图：不画人形，格子按人身上的位置摆（头在上/身体居中/足在下），
// 装备名称直接写进部位格；容器不许整体 aria-hidden——里面是可点的装备名。
// 立绘本体已摘进 host/equipment-figure.js：形状断言改读那份源码，index.js 只留接线与弹窗。
const figureSource = await readFile(new URL('./host/equipment-figure.js', import.meta.url), 'utf8');
assert.match(figureSource, /dai-body-slots/, '装备槽位图网格缺失');
assert.match(figureSource, /function figureGradeClass/, '槽位图缺少品级配色函数');
assert.match(figureSource, /dai-body-slot__label/, '槽位缺少部位标签');
assert.match(figureSource, /dai-body-slot__add/, '空槽位缺少「＋ 装备」入口');
assert.doesNotMatch(figureSource, /dai-body-figure__stage|BODY_FIGURE_ANCHORS|dai-body-figure__ghost/, '人形剪影时代的舞台/锚点/浮层应已删除');
assert.doesNotMatch(figureSource, /createElementNS\('http:\/\/www\.w3\.org\/2000\/svg'/, '人形 SVG 已删，不该再画');
assert.doesNotMatch(figureSource, /data-self-figure[^>]*aria-hidden/, '槽位图容器不许整体 aria-hidden（里面是可点装备名）');
assert.match(entry, /renderEquipmentFigure/, 'index.js 必须接线装备立绘渲染');
assert.match(styleCss, /\.dai-body-slots/, '槽位网格样式缺失');
assert.match(styleCss, /\.dai-body-slot\.is-gold/, '品级染缘样式缺失');
// 空槽位＝装备入口：设置页点「＋ 装备」要从行囊挑对口备用装备；悬浮球纯展示没有这个按钮。
assert.match(entry, /function openSelfEquipPicker/, '缺少行囊挑选弹窗');
assert.match(entry, /'武器': 'weapon', '防具': 'body', '饰品': 'accessory'/, '挑选弹窗要按类别对准部位');
// 悬浮球上的「Agent 系统」图标＝设置面板的入口；左上角旧按钮退役（挂载函数删除，面板创建不能跟着没）。
assert.match(entry, /systemIcon\.addEventListener\('click', \(\) => openSettingsPanel\(\)\)/, '悬浮球系统图标要一键打开设置面板');
assert.doesNotMatch(entry, /function mountSettingsButton/, '左上角设置按钮已退役，不该再挂载');
assert.doesNotMatch(styleCss, /\.dai-settings-button/, '旧按钮样式应随手删掉');
// 沙盒口径：惯性要真的进决定提示词；本局内切换要有确认/取消按钮。
assert.match(entry, /buildSandboxDecideNote\(\{/, '沙盒决定说明要按惯性动态生成');
assert.doesNotMatch(entry, /SANDBOX_DECIDE_NOTE/, '静态决定说明应退役');
assert.match(entry, /data-sandbox-confirm/, '缺少切换确认按钮');
assert.match(entry, /data-sandbox-cancel/, '缺少切换取消按钮');
assert.match(entry, /function syncSandboxPendingRow/, '缺少待确认提示条同步');
console.log(`settings template smoke checks passed: ${directory}`);
