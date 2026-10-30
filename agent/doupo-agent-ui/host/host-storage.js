import { normalizeTheme } from './control-dashboard.js';
import { normalizeInertia } from '../sandbox/sandbox-mode.js';

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
    }),
    llm: Object.freeze({
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
        // 'tavern' = 直接用酒馆当前 API；'custom' = 走下面的独立接口。
        mode: 'tavern',
    }),
    budget: Object.freeze({
        maxModules: 8,
        totalTimeoutMs: 90000,
        maxNpcDecisions: 3,
    }),
    ui: Object.freeze({
        compact: false,
        theme: 'black',
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
        decideMaxFloors: 6, // 喂给决定模型的最近楼层数
        decideMaxEntries: 12, // 世界书相关条目上限
        decidePrompt: '', // 决定提示词，留空用内置默认
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
        ledgerFloors: 2, // 记录员看最近几楼
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
        // 经历精简提示词覆盖，留空用内置默认。
        expCondensePrompt: '',
    }),
    self: Object.freeze({
        // 纳戒注入：生成前把主角自身状态写进提示词。
        inject: true,
        injectBudget: 900, // 注入字数预算，0 = 内置默认
        // LLM 决定：独立决定调用，读聊天记录+世界书+纳戒，输出严格 JSON 由脚本执行。
        decideEnabled: true,
        decideAuto: true, // 每轮生成后自动决定；关闭则只认正文里的 self 指令块
        decideMerged: false, // 合并决定（纳戒+记忆共用一次调用）；开合并时召回归数据库条目，扩展自带记忆注入关闭
        decideMode: 'tavern', // 'tavern' = 跟随酒馆当前设置；'custom' = 用下面这套自定义连接
        decideBaseUrl: '', // 自定义接口地址（选 custom 才用得上；留空沿用“模型与连接”页）
        decideApiKey: '', // 自定义接口密钥（选 custom 才用得上；留空沿用“模型与连接”页）
        decideProvider: '', // 'openai' / 'anthropic'（留空按接口地址判断）
        decideModel: '', // 决定模型名，留空沿用“模型与连接”页
        decideTemperature: 0, // 0 = 沿用 LLM 页温度
        decideMaxTokens: 0, // 0 = 沿用 LLM 页输出上限
        decideTopP: 0, // 0 = 不指定
        decidePresencePenalty: 0, // 0 = 不指定
        decideFrequencyPenalty: 0, // 0 = 不指定
        decideMaxFloors: 6, // 喂给决定模型的最近楼层数
        decideMaxEntries: 12, // 世界书相关条目上限
        decidePrompt: '', // 决定提示词，留空用内置默认
        guide: '', // 降级模式（关自动决定）随现状注入的指令指南，留空用内置默认
    }),
    memory: Object.freeze({
        // 记忆注入：生成前把主角未了结的记忆写进提示词。
        inject: true,
        injectBudget: 800, // 注入字数预算，0 = 内置默认
        // LLM 决定：独立决定调用，读聊天记录+世界书+记忆总账，输出严格 JSON 由脚本执行。
        decideEnabled: true,
        decideAuto: true, // 每轮生成后自动决定；关闭则只认正文里的 memory 指令块
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
        decideMaxFloors: 6, // 喂给决定模型的最近楼层数
        decideMaxEntries: 12, // 世界书相关条目上限
        decidePrompt: '', // 决定提示词，留空用内置默认
        guide: '', // 降级模式（关自动决定）随现状注入的指令指南，留空用内置默认
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
        injectFloors: 6, // 场记判断“这一幕用得上什么”时看最近几楼（含玩家这句话）
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
        decideMaxFloors: 10, // 喂给记录员的最近楼层数
        decideMaxEntries: 30, // 相关世界书条目上限
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
    schemaVersion: 8,
});

function clone(value) {
    return structuredClone(value);
}

function mergeSettings(current = {}) {
    const source = current && typeof current === 'object' ? current : {};
    const nested = ['llm', 'budget', 'ui', 'facts', 'setting', 'injection', 'prompt', 'action', 'world', 'npc', 'impact', 'sandbox', 'status', 'settle', 'self', 'memory'];
    const merged = { ...clone(DEFAULT_SETTINGS), ...source };
    for (const key of nested) {
        const incoming = source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) ? source[key] : {};
        merged[key] = { ...clone(DEFAULT_SETTINGS[key]), ...incoming };
    }
    merged.ui.theme = normalizeTheme(merged.ui.theme);
    merged.sandbox.inertia = normalizeInertia(merged.sandbox.inertia);
    // 旧版只有 useSillyTavernConnection 开关：没写过 mode 的老配置按老开关迁移，避免默默跳回酒馆连接。
    if (source.llm && typeof source.llm === 'object' && source.llm.mode === undefined && source.llm.useSillyTavernConnection === false) {
        merged.llm.mode = 'custom';
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
        const nested = ['llm', 'budget', 'ui', 'facts', 'setting', 'injection', 'prompt', 'action', 'world', 'npc', 'impact', 'sandbox', 'status', 'settle', 'self', 'memory'];
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
