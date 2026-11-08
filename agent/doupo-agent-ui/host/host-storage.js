import { normalizeTheme } from './control-dashboard.js';
import { normalizeInertia } from '../sandbox/sandbox-mode.js';
import { normalizeApiPresets } from './api-presets.js';

const SETTINGS_KEY = 'doupo_agent_ui';
const CHAT_KEY = 'doupo_agent_state';
const WORLD_KEY = 'doupo_agent_world';
const IMPACT_KEY = 'doupo_agent_impact';
const NPC_KEY = 'doupo_agent_npc';
const NPC_COLD_KEY = 'doupo_agent_npc_cold';
const SELF_KEY = 'doupo_agent_self';
const MEMORY_KEY = 'doupo_agent_memory';

const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    enableFactsLibrary: true,
    enableActionResolution: true,
    enableWorldProgress: true,
    enableNpcAutonomy: true,
    // 人物簿：NPC 全信息母库，按聊天存一份，生成后由记录员追加变化。
    enableNpcLedger: true,
    // 纳戒：主角自身状态与随身之物的母库，按聊天存一份，生成后由决定调用追加变化。
    enableSelfLedger: true,
    // 记忆：主角的四类叙事记忆（恩怨/情报/伏笔/大事记）母库，按聊天存一份，生成后由决定调用追加变化。
    enableMemoryLedger: true,
    // 数据库桥接：纳戒/世界台账镜像到「龙血玄黄·数据库」的表格（表=账本，扩展面板=前端）。
    // 脚本没装或被关时自动停用，照旧走聊天存档。
    enableDbBridge: true,
    enablePlayerImpact: true,
    enableSandboxMode: false,
    showStatusPanel: true,
    showOrb: true,
    debug: false,
    // 调用版本：'full' = 完整版（每个功能各一路调用，行为与旧版一致）；'lite' = 简略版
    // （备料三路并成一次「素材总挑选」、记账五路并成一次「总结算」，其余管线不动）。
    apiMode: 'full',
    // 功能读取楼层数：0（或留空）＝跟随"当前角色卡自带的提示词侧整楼隐藏正则"的 minDepth
    // （只看角色脚本，不看全局正则）；卡上没有这类正则时回落 8。
    // 正整数＝手动钉死，优先于正则跟随。
    readFloors: 0,
    // 简略版两条合并通道各自的 API设置方案绑定；空 = 跟随酒馆主连接。
    lite: Object.freeze({
        pickApiPreset: '',
        settleApiPreset: '',
    }),
    settle: Object.freeze({
        // 行动结算的分类判定（丹药/修炼/伤害/通用）独立调用用的连接与参数。
        mode: 'tavern', // 'tavern' = 跟随酒馆当前设置；'custom' = 用下面这套自定义连接
        baseUrl: '', // 自定义接口地址（选 custom 才用得上；留空沿用“模型与连接”页）
        apiKey: '', // 自定义接口密钥（留空沿用“模型与连接”页）
        provider: '', // 'openai' / 'anthropic'（留空按接口地址判断）
        model: '', // 自定义模型名（选 custom 才用得上；留空沿用全局模型名）
        temperature: 0.2, // 判定要稳；0 = 不指定，沿用酒馆/全局
        maxTokens: 0, // 0 = 不指定
        topP: 0, // 0 = 不指定
        presencePenalty: 0, // 0 = 不指定
        frequencyPenalty: 0, // 0 = 不指定
        // 各类别的提示词覆盖存 settle.prompt.<类别id>（嵌套对象），留空用内置默认。
        prompt: Object.freeze({}),
        // 玩家自定义判定：[{ id, name, prompt }]，页面"＋"按钮添加；只走提示词判定，脚本不做类别内复核。
        customCategories: Object.freeze([]),
        // API设置方案绑定：填了方案 id 就整套走方案，下面的手动字段全部让位；空 = 手动配置（老行为）。
        apiPreset: '',
        // 行动结算·最终判定：生成前直判本轮行动结果并注入正文提示词（开关 + 独立方案绑定 + 提示词覆盖）。
        resultEnabled: true, // 关掉就不判定也不注入；总开关 enableActionResolution 关了同样整路跳过
        resultApiPreset: '', // API设置方案绑定：非空时最终判定整套走方案；空＝跟随酒馆主连接
        resultPrompt: '', // 判定提示词覆盖，留空用内置默认
    }),
    llm: Object.freeze({
        // API设置方案绑定：非空时正文/默认调用整套用方案（连接+参数+附加参数），手动字段让位。
        apiPreset: '',
        provider: 'openai-compatible',
        baseUrl: '',
        apiKey: '',
        model: '',
        temperature: 0.7,
        maxTokens: 2048,
        timeoutMs: 60000,
        // 采样参数：0 = 不指定，沿用接口自己的设置；只对自定义接口生效。
        topP: 0,
        presencePenalty: 0,
        frequencyPenalty: 0,
        useSillyTavernConnection: true,
        // 空回重试：接口通但没内容时自动再问几次；0 = 不重试。间隔单位是秒，
        // 站点有 RPM 限制就调大（总控页"模型调用体检"卡里改）。
        emptyRetry: 1,
        emptyRetryWait: 0.6,
        // 'tavern' = 直接用酒馆当前 API；'custom' = 走下面的独立接口。
        mode: 'tavern',
        // 全局统管：开着的期间，扩展发起的每一次模型调用都走这套全局自定义连接，
        // 各功能页里选的"跟随酒馆 / 自定义"连同各自填的地址模型都暂时让位。
        governAll: false,
    }),
    budget: Object.freeze({
        maxModules: 8,
        totalTimeoutMs: 90000,
        maxNpcDecisions: 3,
    }),
    ui: Object.freeze({
        compact: false,
        theme: 'gilt',
        placeholder: false,
        // 旧“扩展自己写正文”入口默认关闭：正文交回酒馆主生成，原著设定只做注入。
        legacyTurn: false,
    }),
    facts: Object.freeze({
        sourceMode: 'registered',
        maxEntries: 12,
        includeUnverified: false,
        // 自动判定的进度卷（面板留空时生效）；面板填了以面板为准。
        currentVolume: null,
        currentVolumeSource: null,
    }),
    action: Object.freeze({
        requireConfirmation: true,
        maxCandidates: 5,
        showCostPreview: true,
    }),
    setting: Object.freeze({
        enabled: true,
        // 0 = 自动判定；1-21 = 手动锁定的剧情卷。
        progress: 0,
        maxCandidates: 40,
        maxItems: 8,
        injectionBudget: 0,
        worldbook: '',
        // 扫描到过的世界书名称：刷新后下拉框仍能直接选，不用再扫一遍。
        worldbookOptions: Object.freeze([]),
        entries: Object.freeze([]),
        // 原著选条（含卷外点选）用的连接：跟随酒馆 / 自定义接口。留空参数沿用全局。
        mode: 'tavern',
        baseUrl: '',
        apiKey: '',
        provider: '',
        model: '',
        // 选条/卷外点选自己的采样参数；0 = 不指定，沿用酒馆或全局。
        temperature: 0,
        maxTokens: 0,
        topP: 0,
        presencePenalty: 0,
        frequencyPenalty: 0,
        // API设置方案绑定：非空时选条/卷外点选整套走方案。
        apiPreset: '',
    }),
    injection: Object.freeze({
        enabled: true,
        depth: 0,
        maxChars: 0,
    }),
    prompt: Object.freeze({
        select: '',
        lookup: '',
    }),
    world: Object.freeze({
        autoAdvance: false,
        tickMinutes: 30,
        preserveUnconfirmed: true,
        // 世界事件系统：模型回复里带 world 指令块，脚本核验后记账。
        eventEnabled: true,
        eventInject: true,
        eventBudget: 0, // 0 = 用内置默认（900 字）
        eventGuide: '', // 指令指南正文，留空用内置默认
        // LLM 决定：独立决定调用，读聊天记录+世界书+台账，输出严格 JSON 由脚本执行。
        decideEnabled: true,
        decideAuto: true, // 每轮生成后自动决定；关闭则只认正文里的指令块
        decideMode: 'tavern', // 'tavern' = 跟随酒馆当前设置；'custom' = 用下面这套自定义连接
        decideBaseUrl: '', // 自定义接口地址（选 custom 才用得上；留空沿用“模型与连接”页）
        decideApiKey: '', // 自定义接口密钥（留空沿用“模型与连接”页）
        decideProvider: '', // 'openai' / 'anthropic'（留空按接口地址判断）
        decideModel: '', // 独立接口模式生效；酒馆连接沿用当前模型
        decideTemperature: 0, // 0 = 沿用 LLM 页温度
        decideMaxTokens: 0, // 0 = 沿用 LLM 页输出上限
        decideTopP: 0, // 0 = 不指定
        decidePresencePenalty: 0, // 0 = 不指定
        decideFrequencyPenalty: 0, // 0 = 不指定
        decideMaxFloors: 0, // 喂给决定模型的最近楼层数（0 = 跟随全局读楼默认，即角色正则）
        decidePrompt: '', // 决定提示词，留空用内置默认
        decideApiPreset: '', // API设置方案绑定：非空时世界决定整套走方案
    }),
    npc: Object.freeze({
        maxCandidates: 3,
        requireConfirmation: true,
        allowConflicts: true,
        // 人物簿：记录员在生成后跑一次，按需注入正文提示词。参数全部可改，留空/0 就沿用全局。
        ledgerAuto: true, // 每轮生成后自动记账
        ledgerEvery: 1, // 1 = 每轮；3 = 每三轮（省调用，代价是中间两轮要等下次记账）
        ledgerInject: true, // 注入正文提示词
        ledgerBudget: 900, // 注入字数预算，0 = 内置默认
        ledgerFloors: 0, // 记录员看最近几楼（0 = 跟随全局读楼默认，即角色正则）
        ledgerMaxFull: 6, // 全字段最多写几个人
        ledgerMode: 'tavern', // 'tavern' = 跟随酒馆当前设置；'custom' = 用下面这套自定义连接
        ledgerBaseUrl: '', // 自定义接口地址（选 custom 才用得上；留空沿用“模型与连接”页）
        ledgerApiKey: '', // 自定义接口密钥（留空沿用“模型与连接”页）
        ledgerProvider: '', // 'openai' / 'anthropic'（留空按接口地址判断）
        ledgerModel: '', // 记录员模型名，留空沿用“模型与连接”页
        ledgerTemperature: 0.3, // 记账要稳；0 = 不显式指定，沿用接口默认
        ledgerMaxTokens: 1600, // 0 = 沿用“模型与连接”页的上限
        ledgerTopP: 0, // 0 = 不指定
        ledgerPresencePenalty: 0, // 0 = 不指定
        ledgerFrequencyPenalty: 0, // 0 = 不指定
        ledgerPrompt: '', // 记录员提示词覆盖，留空用内置默认
        ledgerApiPreset: '', // API设置方案绑定：非空时记录员整套走方案
        extractApiPreset: '', // API设置方案绑定：非空时档案抄录整套走方案
        expApiPreset: '', // API设置方案绑定：非空时经历精简整套走方案
        // 冷藏推进台：用户点扫描后才运行；只跟随正文世界日，不自动推进。
        coldMode: 'tavern',
        coldBaseUrl: '',
        coldApiKey: '',
        coldProvider: '',
        coldModel: '',
        coldTemperature: 0.2,
        coldMaxTokens: 1400,
        coldTopP: 0,
        coldPresencePenalty: 0,
        coldFrequencyPenalty: 0,
        coldPrompt: '',
        coldApiPreset: '', // API设置方案绑定：非空时冷藏推进员整套走方案
        // 经历精简提示词覆盖，留空用内置默认。
        expCondensePrompt: '',
    }),
    self: Object.freeze({
        // 纳戒注入：生成前把主角自身状态写进提示词。
        inject: true,
        injectBudget: 900, // 注入字数预算，0 = 内置默认
        // 申报通道：inline=模型在正文末尾顺手输出变量申报（MVU 解析、仲裁器裁决，零额外请求）；
        // independent=生成结束后扩展另发一次决定请求，正文保持干净。切换时同步启停世界书申报条目。
        mvuChannel: 'inline',
        // LLM 决定：独立决定调用，读聊天记录+世界书+纳戒，输出严格 JSON 由脚本执行。
        // 纳戒决定与记忆决定是两条独立调用，各用各的连接方案与喂料（模型设置页各一张卡）。
        decideEnabled: true,
        decideAuto: true, // 每轮生成后自动决定；关闭则只认正文里的 self 指令块
        decideApiPreset: '', // API设置方案绑定：非空时纳戒决定整套走方案；空＝跟随酒馆主连接
        decideMaxFloors: 0, // 纳戒决定喂最近几楼聊天（与记忆决定各自一份；0 = 跟随全局读楼默认，即角色正则）
        decidePrompt: '', // 决定提示词，留空用内置默认
        guide: '', // 降级模式（关自动决定）随现状注入的指令指南，留空用内置默认
    }),
    memory: Object.freeze({
        // 记忆注入：生成前把召回决定的挑选结果（或关键词兜底）写进提示词。
        inject: true,
        injectBudget: 800, // 注入字数预算，0 = 内置默认
        // LLM 决定：独立决定调用，读聊天记录+世界书+记忆总账，输出严格 JSON 由脚本执行。
        decideEnabled: true,
        decideAuto: true, // 每轮生成后自动决定；关闭则只认正文里的 memory 指令块
        // LLM 召回：用户输入之后、生成之前，召回员按记忆目录+上下文挑要注入的旧记忆编号。
        recallEnabled: true,
        recallAuto: true, // 生成拦截器里自动召回；关闭则注入退回关键词匹配
        recallPrompt: '', // 召回提示词，留空用内置默认
        consolidateAfter: 6, // 小记忆攒够这个数就自动总结成一条大记忆；0 = 关闭
        // 决定连接与参数：纳戒决定、记忆决定、合并决定、记忆总结共用这一套（模型设置页一张卡）。
        decideMode: 'tavern', // 'tavern' = 跟随酒馆当前设置；'custom' = 用下面这套自定义连接
        decideBaseUrl: '', // 自定义接口地址（选 custom 才用得上；留空沿用"模型与连接"页）
        decideApiKey: '', // 自定义接口密钥（选 custom 才用得上；留空沿用"模型与连接"页）
        decideProvider: '', // 'openai' / 'anthropic'（留空按接口地址判断）
        decideModel: '', // 决定模型名，留空沿用"模型与连接"页
        decideTemperature: 0, // 0 = 沿用 LLM 页温度
        decideMaxTokens: 0, // 0 = 沿用 LLM 页输出上限
        decideTopP: 0, // 0 = 不指定
        decidePresencePenalty: 0, // 0 = 不指定
        decideFrequencyPenalty: 0, // 0 = 不指定
        decideMaxFloors: 0, // 喂给决定/召回模型的最近楼层数（0 = 跟随全局读楼默认，即角色正则）
        decidePrompt: '', // 决定提示词，留空用内置默认
        guide: '', // 降级模式（关自动决定）随现状注入的指令指南，留空用内置默认
        decideApiPreset: '', // API设置方案绑定：非空时记忆决定整套走方案
        recallApiPreset: '', // API设置方案绑定：非空时记忆召回整套走方案
        consolidateApiPreset: '', // API设置方案绑定：非空时记忆总结整套走方案
    }),
    impact: Object.freeze({
        trackResources: true,
        showExplanation: true,
        maxChainDepth: 3,
        // 世界影响总览页只铺最近几条；全量去“世界账本”弹窗里看。
        recentCount: 5,
        // 世界影响库：记录玩家把世界线改成了什么样，并在正文提示词里提醒叙事模型。
        inject: true, // 是否把已发生的影响注入正文提示词
        injectBudget: 800, // 注入字数预算
        injectSmart: true, // 注入前先让模型挑“这一幕用得上”的影响；关掉则脚本按分量/日期直接挑
        injectMaxLines: 8, // 模型最多挑几条
        injectFloors: 0, // 场记判断“这一幕用得上什么”时看最近几楼（含玩家这句话；0 = 跟随全局读楼默认，即角色正则）
        injectModel: '', // 挑选员模型名；mode 选 custom 才用得上
        injectMode: 'tavern', // 'tavern' = 跟随酒馆当前设置；'custom' = 用下面这套自定义连接
        injectBaseUrl: '', // 自定义接口地址（选 custom 才用得上；留空沿用“模型与连接”页）
        injectApiKey: '', // 自定义接口密钥（留空沿用“模型与连接”页）
        injectProvider: '', // 'openai' / 'anthropic'（留空按接口地址判断）
        // 'shared' = 记录员与场记共用一个模型；'split' = 各配各的
        modelMode: 'shared',
        decideMode: 'tavern', // 记录员的连接：跟随酒馆 / 自定义
        maxRecords: 0, // 账本上限，0 = 不限；注入只挑几条，不需要为了正文缩库
        decideEnabled: true, // 是否启用“世界记录员”
        decideAuto: true, // 生成结束后自动记录
        decideEvery: 1, // 每几轮生成记录一次：1 = 每轮，3 = 每三轮
        decideMaxFloors: 0, // 喂给记录员的最近楼层数（0 = 跟随全局读楼默认，即角色正则）
        decideModel: '', // 记录员模型名；decideMode 选 custom 才用得上，留空沿用全局模型名
        decideBaseUrl: '', // 自定义接口地址（选 custom 才用得上；留空沿用“模型与连接”页）
        decideApiKey: '', // 自定义接口密钥（留空沿用“模型与连接”页）
        decideProvider: '', // 'openai' / 'anthropic'（留空按接口地址判断）
        injectTemperature: 0.2, // 场记温度；0 = 不显式指定
        injectMaxTokens: 500, // 场记输出上限；0 = 不显式指定
        injectTopP: 0, // 0 = 不显式指定
        injectPresencePenalty: 0, // 0 = 不显式指定
        injectFrequencyPenalty: 0, // 0 = 不显式指定
        decideTemperature: 0, // 0 = 不显式指定
        decideMaxTokens: 0, // 0 = 不显式指定
        decideTopP: 0, // 0 = 不显式指定
        decidePresencePenalty: 0, // 0 = 不显式指定
        decideFrequencyPenalty: 0, // 0 = 不显式指定
        prompt: '', // 记录员提示词，留空用内置默认
        injectPrompt: '', // 场记提示词，留空用内置默认
        decideApiPreset: '', // API设置方案绑定：非空时记录员整套走方案
        injectApiPreset: '', // API设置方案绑定：非空时场记整套走方案（shared 时随记录员绑定）
    }),
    sandbox: Object.freeze({
        inertia: 'medium',
        canonCharactersAutonomous: true,
        allowMidgameSwitch: true,
        playerGoalsEnabled: true,
        maxActiveGoals: 4,
        maxNewObjectsPerTurn: 2,
        nodeWindowSlackDays: 7,
    }),
    status: Object.freeze({
        showHistory: true,
        showCapabilityBadge: true,
    }),
    // 悬浮球位置：拖到哪记到哪；null = 用 CSS 默认的右上位置。
    orb: Object.freeze({
        x: null,
        y: null,
    }),
    // API设置：把接口配置（地址/密钥/模型/采样参数/附加参数）存成命名方案，
    // 模型设置页各功能直接选。方案结构见 host/api-presets.js 的 normalizeApiPreset；
    // 密钥只存扩展设置（本地 settings.json），与 llm.apiKey 同口径，不进聊天消息。
    api: Object.freeze({
        presets: Object.freeze([]),
    }),
    schemaVersion: 13,
});

function clone(value) {
    return structuredClone(value);
}

// 纳戒与记忆合并共用的决定连接/参数键：统一存 memory.decide*，self 侧同名键已废弃。
// （schemaVersion 11 起纳戒决定重新独立成路，见 migrateSelfDecideSplit；这里只负责清历史死键。）
const SELF_DECIDE_SHARED_KEYS = Object.freeze([
    'decideMode', 'decideBaseUrl', 'decideApiKey', 'decideProvider', 'decideModel',
    'decideTemperature', 'decideMaxTokens', 'decideTopP', 'decidePresencePenalty', 'decideFrequencyPenalty',
]);
// 合并决定（unifiedActive）已退役：纳戒走 MVU 变量通道，记忆走独立决定。旧开关键清掉。
const SELF_RETIRED_KEYS = Object.freeze(['decideMerged']);

/**
 * 旧版手填连接字段 → API设置方案 的一次性迁移（schemaVersion 10 起，模型设置页不再有手填字段，
 * 语义变为“每个功能选一个方案，不绑＝跟随酒馆主连接”）。
 * 每张连接卡 mode=custom 且填了地址的，把整套字段搬成方案并绑定；字段完全相同的卡共用一个方案（按签名去重）。
 * 幂等性靠“搬完把该组 mode 落回 tavern”保证：重跑时没有 mode=custom 的组，无事可做；
 * 因此迁移一旦保存过，用户后来删掉的方案不会被重新造出来；已绑了方案的组也跳过（以绑定为准）。
 */
const LEGACY_API_GROUPS = Object.freeze([
    { binding: 'llm.apiPreset', name: '全局连接（迁移）', group: 'llm', prefix: '', modeKey: 'mode' },
    { binding: 'setting.apiPreset', name: '原著选条（迁移）', group: 'setting', prefix: '', modeKey: 'mode' },
    { binding: 'settle.apiPreset', name: '行动结算判定（迁移）', group: 'settle', prefix: '', modeKey: 'mode' },
    { binding: 'world.decideApiPreset', name: '世界决定（迁移）', group: 'world', prefix: 'decide', modeKey: 'decideMode' },
    { binding: 'npc.ledgerApiPreset', name: '人物簿记录员（迁移）', group: 'npc', prefix: 'ledger', modeKey: 'ledgerMode' },
    { binding: 'npc.coldApiPreset', name: '冷藏推进员（迁移）', group: 'npc', prefix: 'cold', modeKey: 'coldMode' },
    { binding: 'memory.decideApiPreset', name: '纳戒与记忆决定（迁移）', group: 'memory', prefix: 'decide', modeKey: 'decideMode' },
    { binding: 'impact.decideApiPreset', name: '影响记录员（迁移）', group: 'impact', prefix: 'decide', modeKey: 'decideMode' },
    { binding: 'impact.injectApiPreset', name: '影响场记（迁移）', group: 'impact', prefix: 'inject', modeKey: 'injectMode', onlyWhenSplit: true },
]);
const LEGACY_PRESET_FIELDS = Object.freeze(['baseUrl', 'apiKey', 'provider', 'model', 'temperature', 'maxTokens', 'topP', 'presencePenalty', 'frequencyPenalty']);

function migrateLegacyApiPresets(merged) {
    const api = merged.api && typeof merged.api === 'object' ? merged.api : {};
    const presets = Array.isArray(api.presets) ? api.presets.filter(item => item && typeof item === 'object') : [];
    const bySignature = new Map();
    for (const preset of presets) {
        bySignature.set(LEGACY_PRESET_FIELDS.map(field => String(preset[field] ?? '')).join('|'), preset.id);
    }
    for (const spec of LEGACY_API_GROUPS) {
        const cfg = merged[spec.group];
        if (!cfg || typeof cfg !== 'object') continue;
        if (spec.onlyWhenSplit && cfg.modelMode !== 'split') continue;
        if (cfg[spec.modeKey] !== 'custom') continue;
        const field = name => (spec.prefix ? cfg[`${spec.prefix}${name[0].toUpperCase()}${name.slice(1)}`] : cfg[name]);
        const baseUrl = String(field('baseUrl') ?? '').trim();
        if (!baseUrl) continue;
        const [bindingGroup, bindingKey] = spec.binding.split('.');
        if (merged[bindingGroup]?.[bindingKey]) continue; // 已绑了方案：以用户绑定为准，不动
        const raw = { name: spec.name };
        for (const fieldName of LEGACY_PRESET_FIELDS) raw[fieldName] = field(fieldName);
        const signature = LEGACY_PRESET_FIELDS.map(name => String(raw[name] ?? '')).join('|');
        let presetId = bySignature.get(signature);
        if (!presetId) {
            presetId = `pmig${Date.now().toString(36)}${presets.length.toString(36)}${Math.floor(Math.random() * 36).toString(36)}`;
            presets.push({ id: presetId, ...raw });
            bySignature.set(signature, presetId);
        }
        merged[bindingGroup][bindingKey] = presetId;
        // 手填字段已经搬进方案：模式落回 tavern，旧值不再被任何兜底逻辑读到（字段值保留，方案里才是正本）。
        cfg[spec.modeKey] = 'tavern';
    }
    merged.api.presets = presets;
}

function mergeSettings(current = {}) {
    const source = current && typeof current === 'object' ? current : {};
    const nested = ['llm', 'budget', 'ui', 'facts', 'setting', 'injection', 'prompt', 'action', 'world', 'npc', 'impact', 'sandbox', 'status', 'settle', 'self', 'memory', 'lite', 'api'];
    const merged = { ...clone(DEFAULT_SETTINGS), ...source };
    for (const key of nested) {
        const incoming = source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) ? source[key] : {};
        merged[key] = { ...clone(DEFAULT_SETTINGS[key]), ...incoming };
    }
    merged.ui.theme = normalizeTheme(merged.ui.theme);
    merged.sandbox.inertia = normalizeInertia(merged.sandbox.inertia);
    // 决定连接并成一套后，老配置纳戒侧单独填过、记忆侧还是默认值的，把纳戒那份搬过来当共用，
    // 免得升级后纳戒的连接悄悄丢掉；两侧都填过以记忆侧为准（集中页那张卡一直是它）。
    // 必须跑在方案迁移之前：搬完 memory 侧才有 mode=custom + 地址，下面的方案迁移才接得住。
    // 搬完（或没得搬）都把纳戒侧的死键清掉：旧值不再躺在存档里，也不会下次加载又被搬一遍。
    const oldSelf = source.self && typeof source.self === 'object' ? source.self : {};
    for (const key of SELF_DECIDE_SHARED_KEYS) {
        if (merged.memory[key] === DEFAULT_SETTINGS.memory[key]
            && oldSelf[key] !== undefined && oldSelf[key] !== DEFAULT_SETTINGS.memory[key]) {
            merged.memory[key] = oldSelf[key];
        }
        delete merged.self[key];
    }
    for (const key of SELF_RETIRED_KEYS) delete merged.self[key];
    // 旧版只有 useSillyTavernConnection 开关：没写过 mode 的老配置按老开关迁移，避免默默跳回酒馆连接。
    if (source.llm && typeof source.llm === 'object' && source.llm.mode === undefined && source.llm.useSillyTavernConnection === false) {
        merged.llm.mode = 'custom';
    }
    // 旧手填连接搬成方案（只跑一次），再整体清洗：垃圾条目丢掉、id 去重、超上限截断。
    if (!Array.isArray(merged.api.presets)) merged.api.presets = [];
    migrateLegacyApiPresets(merged);
    merged.api.presets = normalizeApiPresets(merged.api.presets);
    // schemaVersion 11：纳戒决定从“与记忆共用一套”拆回独立一路（合并决定退役后就是两条独立调用）。
    // 拆分前共用卡上的绑定与喂料复制给纳戒做起点，否则升级后纳戒决定会悄悄掉回跟随酒馆；
    // 版本门保证只对老存档跑一次，之后两侧各改各的互不影响。
    // 喂料以老存档 self 侧已填过的值为准（古档纳戒侧本来就有自己的数值），没有才从记忆侧带过来。
    if (Number(source.schemaVersion ?? 0) < 11) {
        merged.self.decideApiPreset = merged.self.decideApiPreset || merged.memory.decideApiPreset || '';
        if (oldSelf.decideMaxFloors === undefined) merged.self.decideMaxFloors = merged.memory.decideMaxFloors;
        if (oldSelf.decideMaxEntries === undefined) merged.self.decideMaxEntries = merged.memory.decideMaxEntries;
    }
    // schemaVersion 12：功能读楼数的默认语义改成“跟随角色卡正则”（0/留空＝跟随，正整数才钉死）。
    // 老存档里躺着旧默认数值（8/6/2/10），正整数永远优先，正则跟随就会被挡死；只清与旧默认完全
    // 相等的值，玩家手调过的原样保留。
    if (Number(source.schemaVersion ?? 0) < 12) {
        const legacyFloorDefaults = [
            [null, 'readFloors', 8],
            ['world', 'decideMaxFloors', 6],
            ['npc', 'ledgerFloors', 2],
            ['self', 'decideMaxFloors', 6],
            ['memory', 'decideMaxFloors', 6],
            ['impact', 'injectFloors', 6],
            ['impact', 'decideMaxFloors', 10],
        ];
        for (const [group, key, legacy] of legacyFloorDefaults) {
            const holder = group ? merged[group] : merged;
            if (holder && Number(holder[key]) === legacy) holder[key] = 0;
        }
    }
    // schemaVersion 13：「世界书条目上限」（world/self/memory/impact.decideMaxEntries）退役——决定调用
    // 改为直接读角色卡世界书里打开的条目，不再按聊天匹配原著库（原著知识走世界书常驻与原著资料注入）。
    // 存量键一律清掉，不再躺在存档里。
    if (Number(source.schemaVersion ?? 0) < 13) {
        for (const group of ['world', 'self', 'memory', 'impact']) {
            if (merged[group]) delete merged[group].decideMaxEntries;
        }
    }
    merged.schemaVersion = DEFAULT_SETTINGS.schemaVersion;
    return merged;
}

function contextOf(getContext) {
    return typeof getContext === 'function' ? getContext() : undefined;
}

/** Small adapter for SillyTavern's durable extension/chat scopes. */
export function createHostStorage({ getContext } = {}) {
    function settings() {
        const context = contextOf(getContext);
        if (!context || typeof context !== 'object') return { status: 'unavailable', value: clone(DEFAULT_SETTINGS) };
        const all = context.extensionSettings && typeof context.extensionSettings === 'object' ? context.extensionSettings : null;
        if (!all) return { status: 'unavailable', value: clone(DEFAULT_SETTINGS) };
        const current = all[SETTINGS_KEY] && typeof all[SETTINGS_KEY] === 'object' ? all[SETTINGS_KEY] : {};
        all[SETTINGS_KEY] = mergeSettings(current);
        return { status: 'ready', value: clone(all[SETTINGS_KEY]) };
    }

    function updateSettings(patch = {}) {
        const context = contextOf(getContext);
        const all = context?.extensionSettings;
        if (!all || typeof all !== 'object') return { status: 'unavailable', value: clone(DEFAULT_SETTINGS) };
        const current = all[SETTINGS_KEY] && typeof all[SETTINGS_KEY] === 'object' ? all[SETTINGS_KEY] : {};
        const incoming = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
        const nested = ['llm', 'budget', 'ui', 'facts', 'setting', 'injection', 'prompt', 'action', 'world', 'npc', 'impact', 'sandbox', 'status', 'settle', 'self', 'memory', 'lite', 'api'];
        const mergedPatch = { ...current, ...incoming };
        for (const key of nested) {
            if (incoming[key] && typeof incoming[key] === 'object' && !Array.isArray(incoming[key])) {
                mergedPatch[key] = { ...(current[key] && typeof current[key] === 'object' ? current[key] : {}), ...incoming[key] };
            }
        }
        // settle.prompt.<类别id> 是二层嵌套：上面的单层合并会用补丁里的 prompt 整个替换旧的，
        // 这里从 current.settle.prompt 补一层合并，保证改一个类别不会丢掉其他类别已保存的提示词。
        if (incoming.settle && typeof incoming.settle === 'object' && incoming.settle.prompt && typeof incoming.settle.prompt === 'object' && !Array.isArray(incoming.settle.prompt)) {
            const before = current.settle && current.settle.prompt && typeof current.settle.prompt === 'object' && !Array.isArray(current.settle.prompt) ? current.settle.prompt : {};
            mergedPatch.settle = { ...mergedPatch.settle, prompt: { ...before, ...incoming.settle.prompt } };
        }
        all[SETTINGS_KEY] = mergeSettings(mergedPatch);
        return { status: 'ready', value: clone(all[SETTINGS_KEY]) };
    }

    async function saveSettings() {
        const context = contextOf(getContext);
        if (typeof context?.saveSettingsDebounced !== 'function') return { status: 'unavailable' };
        await context.saveSettingsDebounced();
        return { status: 'saved' };
    }

    function chatState() {
        const context = contextOf(getContext);
        const metadata = context?.chatMetadata;
        if (!metadata || typeof metadata !== 'object') return { status: 'unavailable', value: undefined };
        return { status: 'ready', value: metadata[CHAT_KEY] ? clone(metadata[CHAT_KEY]) : undefined };
    }

    async function saveChatState(value) {
        const context = contextOf(getContext);
        if (!context?.chatMetadata || typeof context.chatMetadata !== 'object') return { status: 'unavailable' };
        context.chatMetadata[CHAT_KEY] = clone(value);
        if (typeof context.saveMetadata !== 'function') return { status: 'changed_not_saved' };
        await context.saveMetadata();
        return { status: 'saved' };
    }

    /** 世界台账：跟着聊天走，换聊天读到的就是那一局的世界。 */
    function worldState() {
        const context = contextOf(getContext);
        const metadata = context?.chatMetadata;
        if (!metadata || typeof metadata !== 'object') return { status: 'unavailable', value: undefined };
        return { status: 'ready', value: metadata[WORLD_KEY] && typeof metadata[WORLD_KEY] === 'object' ? clone(metadata[WORLD_KEY]) : undefined };
    }

    async function saveWorldState(value) {
        const context = contextOf(getContext);
        if (!context?.chatMetadata || typeof context.chatMetadata !== 'object') return { status: 'unavailable' };
        if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'rejected' };
        context.chatMetadata[WORLD_KEY] = clone(value);
        if (typeof context.saveMetadata !== 'function') return { status: 'changed_not_saved' };
        await context.saveMetadata();
        return { status: 'saved' };
    }

    /** 世界影响库：同样跟着聊天走，每个聊天各记一条世界线。 */
    function impactState() {
        const context = contextOf(getContext);
        const metadata = context?.chatMetadata;
        if (!metadata || typeof metadata !== 'object') return { status: 'unavailable', value: undefined };
        return { status: 'ready', value: metadata[IMPACT_KEY] && typeof metadata[IMPACT_KEY] === 'object' ? clone(metadata[IMPACT_KEY]) : undefined };
    }

    async function saveImpactState(value) {
        const context = contextOf(getContext);
        if (!context?.chatMetadata || typeof context.chatMetadata !== 'object') return { status: 'unavailable' };
        if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'rejected' };
        context.chatMetadata[IMPACT_KEY] = clone(value);
        if (typeof context.saveMetadata !== 'function') return { status: 'changed_not_saved' };
        await context.saveMetadata();
        return { status: 'saved' };
    }

    /** 人物簿：同样跟着聊天走；一局一个人物簿，换聊天各记各的。 */
    function npcLedgerState() {
        const context = contextOf(getContext);
        const metadata = context?.chatMetadata;
        if (!metadata || typeof metadata !== 'object') return { status: 'unavailable', value: undefined };
        return { status: 'ready', value: metadata[NPC_KEY] && typeof metadata[NPC_KEY] === 'object' ? clone(metadata[NPC_KEY]) : undefined };
    }

    async function saveNpcLedgerState(value) {
        const context = contextOf(getContext);
        if (!context?.chatMetadata || typeof context.chatMetadata !== 'object') return { status: 'unavailable' };
        if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'rejected' };
        context.chatMetadata[NPC_KEY] = clone(value);
        if (typeof context.saveMetadata !== 'function') return { status: 'changed_not_saved' };
        await context.saveMetadata();
        return { status: 'saved' };
    }

    /** 冷藏推进台：记录选中的人物和每人的上次同步位置，不和人物档案混在一起。 */
    function npcColdState() {
        const context = contextOf(getContext);
        const metadata = context?.chatMetadata;
        if (!metadata || typeof metadata !== 'object') return { status: 'unavailable', value: undefined };
        return { status: 'ready', value: metadata[NPC_COLD_KEY] && typeof metadata[NPC_COLD_KEY] === 'object' ? clone(metadata[NPC_COLD_KEY]) : undefined };
    }

    async function saveNpcColdState(value) {
        const context = contextOf(getContext);
        if (!context?.chatMetadata || typeof context.chatMetadata !== 'object') return { status: 'unavailable' };
        if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'rejected' };
        context.chatMetadata[NPC_COLD_KEY] = clone(value);
        if (typeof context.saveMetadata !== 'function') return { status: 'changed_not_saved' };
        await context.saveMetadata();
        return { status: 'saved' };
    }

    /** 纳戒：同样跟着聊天走；一局一份主角自身状态，换聊天各记各的。 */
    function selfState() {
        const context = contextOf(getContext);
        const metadata = context?.chatMetadata;
        if (!metadata || typeof metadata !== 'object') return { status: 'unavailable', value: undefined };
        return { status: 'ready', value: metadata[SELF_KEY] && typeof metadata[SELF_KEY] === 'object' ? clone(metadata[SELF_KEY]) : undefined };
    }

    async function saveSelfState(value) {
        const context = contextOf(getContext);
        if (!context?.chatMetadata || typeof context.chatMetadata !== 'object') return { status: 'unavailable' };
        if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'rejected' };
        context.chatMetadata[SELF_KEY] = clone(value);
        if (typeof context.saveMetadata !== 'function') return { status: 'changed_not_saved' };
        await context.saveMetadata();
        return { status: 'saved' };
    }

    /** 记忆：同样跟着聊天走；一局一份主角记忆总账，换聊天各记各的。 */
    function memoryState() {
        const context = contextOf(getContext);
        const metadata = context?.chatMetadata;
        if (!metadata || typeof metadata !== 'object') return { status: 'unavailable', value: undefined };
        return { status: 'ready', value: metadata[MEMORY_KEY] && typeof metadata[MEMORY_KEY] === 'object' ? clone(metadata[MEMORY_KEY]) : undefined };
    }

    async function saveMemoryState(value) {
        const context = contextOf(getContext);
        if (!context?.chatMetadata || typeof context.chatMetadata !== 'object') return { status: 'unavailable' };
        if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'rejected' };
        context.chatMetadata[MEMORY_KEY] = clone(value);
        if (typeof context.saveMetadata !== 'function') return { status: 'changed_not_saved' };
        await context.saveMetadata();
        return { status: 'saved' };
    }

    async function clean() {
        const context = contextOf(getContext);
        if (context?.extensionSettings && typeof context.extensionSettings === 'object') delete context.extensionSettings[SETTINGS_KEY];
        if (context?.chatMetadata && typeof context.chatMetadata === 'object') {
            delete context.chatMetadata[CHAT_KEY];
            delete context.chatMetadata[WORLD_KEY];
            delete context.chatMetadata[IMPACT_KEY];
            delete context.chatMetadata[NPC_KEY];
            delete context.chatMetadata[NPC_COLD_KEY];
            delete context.chatMetadata[SELF_KEY];
            delete context.chatMetadata[MEMORY_KEY];
        }
        if (typeof context?.saveSettingsDebounced === 'function') await context.saveSettingsDebounced();
        if (typeof context?.saveMetadata === 'function') await context.saveMetadata();
        return { status: 'cleaned' };
    }

    return Object.freeze({ settings, updateSettings, saveSettings, chatState, saveChatState, worldState, saveWorldState, impactState, saveImpactState, npcLedgerState, saveNpcLedgerState, npcColdState, saveNpcColdState, selfState, saveSelfState, memoryState, saveMemoryState, clean, keys: Object.freeze({ SETTINGS_KEY, CHAT_KEY, WORLD_KEY, IMPACT_KEY, NPC_KEY, NPC_COLD_KEY, SELF_KEY, MEMORY_KEY }) });
}

export { DEFAULT_SETTINGS };
