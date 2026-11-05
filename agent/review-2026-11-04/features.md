# 功能逐项审查明细

这些状态为分项静态/内存检查，不是所有功能真机通过。最终优先级、误报与合并以优化清单.md为准。

## 核心调度/旧版回合与请求API

### 输入与请求分类

- **status**：部分可靠
- **evidence**：bounded labels、type/task一致、read_only/clarification/history_review保守分流已读。orchestrator的playerConfirmed来自模型explicitAction，不是独立用户确认；未做自然语言正确性证明。

### 行动授权

- **status**：部分可靠
- **evidence**：router白名单路由及intent目标/方法匹配；resolver explicit及可选authorizedActions。stage规范化changes未携origin/playerAction，质量门对应分支不能当独立授权证明；仍依赖上层。

### 计划与依赖

- **status**：现有测试通过
- **evidence**：runner核对登记/启用/task/stateChanging/依赖顺序；stage.plan只记录核准计划。adjudicate直接调用actions/world，不经runner.execute，单模块预算不覆盖。

### 默认原著设定注入

- **status**：有缺陷/部分验证
- **evidence**：index3336→resolveInjection→gatherSettings；目录点选、人物簿过滤、关键词回退、maxItems和assemble预算已追踪；CR-07。resolveInjection接收recentTexts但gatherSettings使用getRecentTexts(ctx)，API入参不是实际事实来源。

### 资料查询

- **status**：静态与现有测试通过
- **evidence**：gather fallback检查sourceIds，runner facts-query，提取visibleFactIds。includeUnverified条件两边均空对象，待确认空分支；不推断事实库内部过滤缺陷。

### 行动规则与分类复核

- **status**：部分可靠
- **evidence**：getRules、类别二次裁定/失败回退、四类别字段与幅度、境界推进、resolver条件效果已读；未知类别兼容放行。质量门拒绝同字段多写。未验证模型或自定义规则合理性。

### 时间推进与世界提案

- **status**：局部通过
- **evidence**：stage.resolveTime仅推进world.day，processes固定[]，不执行现实世界runtime；world-simulator独立API有范围/版本/条件阻断、幂等与冲突。未审world其他模块内部。

### 预算与取消

- **status**：有缺陷
- **evidence**：pipeline总/阶段时限及输出字节上限、runner单模块/总预算已读；CR-05。interpret/deliver/persistence在流水线计时之外，默认resolveInjection也不受pipeline预算。

### 质量门与正文声明

- **status**：部分可靠
- **evidence**：合同字段/type/writer(提供时)/多写者/claim引用可审；hidden fact为警告非阻断。sanitizeClaims删除不可信claim但不删正文，不等于任意正文事实证明；narrativeGuard内部越界未审。

### 候选完整性

- **status**：混合
- **evidence**：pipeline内部clone并比较stageResults/quality/narrative；router有CR-08。quality不验证nextState与acceptedChanges重放相等，属于受信任stage接口合同，未证明默认可利用漏洞。

### 两段提交与消息证据

- **status**：有缺陷
- **evidence**：prepare/markMessage/commit/reconcile拒绝无证据、错message/stale和重复；CR-02/06/09。orchestrator observed !==false把缺失值当观察成立，真实宿主证据契约未审。

### 持久化、恢复与回滚

- **status**：有缺陷
- **evidence**：CR-01/03。state-store回滚新版本不改写历史、read clone、分支版本冲突及幂等已读；自定义非vN版本、超大版本和fork容量未深入repro。

### 操作台账与协调状态

- **status**：部分可靠
- **evidence**：ledger有界去重/重试/上下文与版本校验；coordinator仅active任务可更新。runTurn不使用operationLedger，仅taskId去重，不承诺同trigger幂等。

### 审计与关联

- **status**：有缺陷
- **evidence**：白名单、无正文投影、容量与查询已读；CR-10。runner多条stage事件缺session参数退化unknown，router.run execute不传scope；列后续关联性验证，不与CR-10合并修。

### 影响提案

- **status**：静态/现有测试通过，生产可达性未证明
- **evidence**：impact-engine确定/条件/推测、归因/版本/深度/容量/清分支已读；index使用impact-runtime而未发现agentImpactEngine调用，不可仅凭缺index引用删库。

详见[原始分片](core-request.md)和[JSON](core-request.json)。

## 默认入口/总控生命周期

详见[原始分片](entry-lifecycle.md)和[JSON](entry-lifecycle.json)。

## 原著检索/行动判定/历史

### 世界书读取/原生与插件分流

- **status**：有缺陷
- **evidence**：worldbook-source58-88只读load；index8673-8696将disable=true交插件，避免与原生重复；异步所有权和失败失效有缺陷。
- **verification**：静态+vm竞争复现；真实loader载荷未验

### uid/别名/类别/卷索引

- **status**：基本稳定，有可观测性小缺陷
- **evidence**：facts-index嵌套括号与重载清空测试通过；1111行generated结构全通过；catalogFor前情truncated漏报。
- **verification**：离线+格式全量；资料真实性exclude

### 卷防剧透

- **status**：组件有效，跨通道不闭合
- **evidence**：setting-supply full/summary/fitted按〔卷NN〕裁剪测试通过；settle直接取全文；core fallback226未透传volume交core负责人。
- **verification**：单元测试+合成secret fixture；未审实际正文

### 目录/lookup/候选授权

- **status**：二次lookup稳定，首次目录白名单缺失
- **evidence**：lookup最多5词、12候选、剩余picks与allowedUids有效；首选同卷未展示uid仍可被接受。
- **verification**：selector mock离线，未发模型

### 注入预算/降层/整句裁剪

- **status**：已执行离线基线稳定
- **evidence**：separator和自定义counter按整段计数、ellipsis和prefix测试通过；预算0/非有限无限为明确契约，不报无上限缺陷。目录本身无字符预算，按行数是已知边界。
- **verification**：setting-supply5个node:test+既有断言通过；未测真实tokenizer

### facts注入/清理/缓存持久化

- **status**：生命周期存在缺陷
- **evidence**：结束/停止/换聊天显式clear存在；3336等待后缺所有权，可重新污染已清容器；最近2条角色消息会阻断找玩家输入。
- **verification**：真实源函数vm确定性复现，未浏览器

### 行动拆分/JSON解析/限量

- **status**：既有基线稳定，语义由模型承担
- **evidence**：v1/v2兼容、think/围栏/尾变量patch、6行动/8单项/24总量、12k输入/30k上下文、fatal/原子阻断44cases通过。
- **verification**：离线44cases；真实模型质量未验证

### 行动批准/效果

- **status**：资源和类别防线有效，证据去重有P1
- **evidence**：真实字段、itemId/category/count、不造新ID、缺hp/douqi/reputation不补值、gold/realm累计与原子回滚均有测试；证据未绑定区间。
- **verification**：44cases+2组对抗内存样例

### 多行动依赖/局部失败

- **status**：数值依赖稳定，动作身份存在缺陷
- **evidence**：前向/循环/重复ID、失败跳过、partial实际资源审核测试通过；相同文本两次动作被误拒，重叠片段能重复获批。
- **verification**：离线测试+直接review复现

### settle session/缓存/预览/异步所有权

- **status**：已执行离线基线稳定
- **evidence**：token引用+epoch、force/fail、preview不注入、等长变更、切聊天/禁用/stopped过期均实际入口mock通过；预测不落真实账。
- **verification**：settle session及integration通过，networkCalls0

### reconcile生成后只读核对

- **status**：已执行离线基线稳定，非自动修账
- **evidence**：expected仅受影响字段、真实reply变化/用户楼/scope门、物品ID重建唯一映射、歧义不分配、matched/mismatch/pending/not_applicable测试通过。
- **verification**：真实入口内存fixture；真实纳戒落账时序未验

### 历史操作分类

- **status**：显式API稳定，不是自动宿主映射
- **evidence**：仅rewrite/reevaluate和显式eventMap；必须mappingEvidence；未知swipe/regenerate不猜。index4637-4638导出，不自动绑定到默认主链操作。
- **verification**：分类测试通过；宿主版本映射未验证

### 历史恢复

- **status**：受限内存边界稳定，不恢复酒馆或默认账本
- **evidence**：history-restore只写agentStateStore的新版本，需observed/版本/已见message与journal门；index4620只显式导出；未自动capture正式主链。
- **verification**：内存stateStore测试通过；真实存档/消息恢复故意未验

### 历史失效

- **status**：模块测试有效，宿主scope接线有缺陷
- **evidence**：adapter解绑、消息触发候选失效、已提交unresolved通过；index getScope未跟随宿主CHAT_CHANGED。
- **verification**：adapter内存复现；默认主链没有任务登记，不能泛称已覆盖

### 结构化资料库/叙事claims守卫

- **status**：资料复核与角色检索有缺陷；claims结构检查稳定
- **evidence**：rejected仍supported、source元数据陈旧、actor limit过早；narrative-guard按任务缓存和claims范围符合测试契约，不保证正文语义与claims一一相符。
- **verification**：资料库3组repro；守卫测试通过

详见[原始JSON分片](facts-settle-history.json)。

## 模型连接/消息/注入与发布

### llm-client

- **module**：llm-client
- **functions**：resolveConnection/configured/availableFor/describeConnection
- **status**：Source traced + current tests pass
- **details**：governAll complete global custom wins and clears all per-call overrides at 452; otherwise per-call hint then mode then legacy boolean. Per-call custom missing fields inherit global fields, including apiKey. Tavern missing quiet function can still be considered configured if context exists, or fall back to complete global endpoint. This is narrower than availability wording; runtime acceptance and no-bind/legacy-mode UI contract remain unverified.

### llm-client

- **module**：llm-client
- **functions**：completeInner/readRequestExtras/applyRequestExtras
- **status**：Source traced; protocol fixtures pass; mixed-case header failure reproduced
- **details**：OpenAI appends /chat/completions to supplied base; Anthropic adds /v1/messages, x-api-key and standalone system, joins text content blocks. Extras body merge then exclusion then headers. No automatic provider detection beyond provider==='anthropic' observed; blank provider uses OpenAI. No network used.

### llm-client

- **module**：llm-client
- **functions**：withTimeout/applyTavernSampling/isQuietBusy
- **status**：Custom timeout/body cancellation tests pass; quiet issues confirmed by source and supplied repro
- **details**：Custom path aborts its controller and covers response body; quiet path lacks underlying cancel and has shared sampling ownership race. Grace applies only to success.

### llm-client

- **module**：llm-client
- **functions**：complete/emptyRetryPlan/callLog/clearCallLog
- **status**：Existing tests pass; boundedness/cancel gaps recorded
- **details**：Retries only empty-content failures; errors otherwise rethrow; logs capped at 80 and returned as copies. No numeric retry ceiling is intentional in test 560, so not reported as an independent defect. Wait has no abort listener and no upper wait ceiling. Error strings are logged; arbitrary remote error redaction not proven. No real secrets read.

### llm-client

- **module**：llm-client
- **functions**：listModels
- **status**：Source-confirmed missing timeout; fixture tests pass
- **details**：GET /models with optional auth/extras/signal, supports data/models arrays, caps 200. No caller signal in UI.

### llm-client

- **module**：llm-client
- **functions**：extractJson/normalizeInterpretation/buildInterpretPrompt/buildAdjudicatePrompt/buildComposePrompt/buildSettingSelectPrompt/interpret/adjudicateAction/selectSettings/compose
- **status**：Partial source review; complete client test module passed
- **details**：190-253 and 641-726 inspected; candidate IDs filtered and malformed selection returns empty; compose allows bounded raw-text fallback. Normalization/prompt sections 111-189 not fully covered; no claim of complete prompt/claims validation audit.

### api-presets

- **module**：api-presets
- **functions**：parseYamlBlock/parseBlock/parseFlowArray/parseScalar/stripComment/splitKeyValue/keyName
- **status**：Complete source; simple fixtures pass; silent partial/flow parsing failures reproduced
- **details**：Full YAML compatibility is not established; nested flow values and whole-document validation are missing.

### api-presets

- **module**：api-presets
- **functions**：normalizeApiPreset/normalizeApiPresets/presetToOverrides/headerEntries
- **status**：Source traced + test module passes
- **details**：Caps 20 presets, fields truncated, IDs regenerated on collisions; 0 means unspecified, preset penalties restricted nonnegative despite client's negative override support. Explicit existing normalization contract, not independently called a bug. Scheme/model/key fallback to global needs UI acceptance.

### message-adapter

- **module**：message-adapter
- **functions**：deliver/update/discard/canDeliver/indexOf
- **status**：Complete source; acknowledgement repro failed contract; host semantics unverified
- **details**：API precedence addOneMessage > sendMessage > slash; add branch checks length/text, fallback branches assume observed. update/discard act on numeric index without task ownership; stale-index/chat-switch acceptance is a required gate, not a separately proven caller defect. Dedicated adapter tests absent by filename inventory.

### prompt-injection

- **module**：prompt-injection
- **functions**：channel/inspect/restore/write/clear
- **status**：Complete source + tests pass; composed empty-clear failure reproduced
- **details**：Stable key overwrites rather than appends; SYSTEM/IN_CHAT, scan=false, depth 0..100, used IDs cap 24. maxChars<=0 is intentionally unlimited; notice adds characters beyond cap. Clear event integration partly inspected only.

### capability-preflight

- **module**：capability-preflight
- **functions**：probeHostCapabilities/getRequiredCapabilities/version/readPath
- **status**：Complete source + tests pass; runtime not accepted
- **details**：Checks getter, on/removeListener and event_types object; ready means basic event capability only, not LLM/message/injection support or minimum-version enforcement. Malformed semver becomes null while ready is intentionally tested. Getter throws are not caught here; no runtime throw observed.

### package

- **module**：package
- **functions**：root entry/manifest/settings template/install; extension-package test
- **status**：All scoped small files reviewed; static package check passes
- **details**：Hook names checked as text, not imported/executed in host; styles compared, templates not by this test; minimum version 1.18.0 vs generateRaw comment ST1.19 is a guarded optional feature, not a proven minimum-version bug.

### runner/demo/docs

- **module**：runner/demo/docs
- **functions**：findTests/test import loop/demo run/connection and release docs
- **status**：Source reviewed or scoped partial as coverage indicates; whole runner/demo not run
- **details**：Runner shares process/global/module cache across suites and counts files, not individual assertions. Demo's synthetic observed:true cannot serve as adapter/runtime evidence. Nested README195 says createChatMessages but implementation uses different API precedence.

详见[原始分片](host-api-package.md)和[JSON](host-api-package.json)。

## 记忆/召回/总结

### 记录与去重

- **status**：issues_confirmed
- **evidence**：同层同文去重、逐条拒绝、清洗有效；MU-04限额与MU-08同楼opId相互作用有缺陷。

### 大小记忆

- **status**：stable_with_boundaries
- **evidence**：runtime287-295模型memorize降small、promote拒绝；panel可手动memorize/promote。大小均按需召回，开头big常驻注释过时。

### 永久保留/退休

- **status**：issues_confirmed
- **evidence**：不按天过期、不封顶entries有效；forget/consolidate退休。MU-01/02/12破坏回拉恢复长期一致性。

### 总结保真

- **status**：partial
- **evidence**：输入45-61保留title/text/note/quote/keys/basis/day，非法结果不落账；MU-05丢入口。语义/引文真实性只有prompt约束，无源档持久链接，本次未发模型，不能验收内容保真。

### 总结并发

- **status**：issues_confirmed
- **evidence**：防重复总结调用及聊天continuation有效；MU-03不检账本输入版本；其他新增条目不在旧IDs中不会被本次consumed。

### cache/跨聊天

- **status**：issues_confirmed
- **evidence**：MU-06；运行中continuation阻止旧模型提交，不等于完成cache已隔离。

### 失败降级

- **status**：issues_confirmed
- **evidence**：坏JSON/连接失败/关闭/busy会关键词兜底；显式ids[]不兜底符合设计；MU-07坏形状误判空。

### 候选/预算/注入记录

- **status**：issues_confirmed
- **evidence**：最多25ID、坏号/重复过滤、关键词big/major/new排序有效；MU-09/10/11分别是记录不实/二次切断/目录饥饿。

### 独立决定接线

- **status**：issues_confirmed
- **evidence**：index4090-4163独立prompt/schema→runtime→persist→auto总结可达；MU-04。公共入口三项由总控独立报告。

### 旧合并/兼容合同

- **status**：retired_compatibility
- **evidence**：unifiedActive恒false，runUnifiedDecision只retired；4604仍公开导出，6441/6508保留恒假分支。unified纯函数仅测试/README引用，index未导入。不能把公开兼容壳一并判为死代码。

详见[原始分片](memory-unified.md)和[JSON](memory-unified.json)。

## 人物簿/冷藏/NPC API

### 人物簿写者与持久化

- **status**：默认接线，存在边界缺陷
- **evidence**：index380-384自动记录；2426-2431统一面板/正文/冷藏apply+保存；UI setFields/addExp/removeExp、load导入/clear也保存；2278-2306按聊天metadata恢复保存。
- **limits**：裸ledger及npcLedgerReplaceExp API不自动保存；保存Promise失败被吞；真实saveMetadata、保存竞态未验。

### 好感累加与限幅

- **status**：稳定/不动
- **evidence**：ledger157-168/562-570逐patch ±10，累计[-100,100]，理由15字、日志60；测试通过。
- **limits**：非逐回复事务/幂等；重复patch/手动重记仍累加，见NPC-03。

### 无依据输入

- **status**：明示宽松设计，不当作缺陷
- **evidence**：ledger6-10、recorder5-7明确不核依据/不拦上帝视角；提示词约束模型，解析不证实事实。
- **limits**：不保证无幻觉；decisionGuard只校验显式证据ID在调用者知情集合，允许空证据，不证明rationale文本。

### 档案补全/重抽

- **status**：已默认新建补空+手动接线；NPC-02
- **evidence**：index2498-2500新建后延迟补全；2163-2235世界书抄档，fillEmpty通常保护已有值。
- **limits**：顶层黑名单/姓名绑定绕过；overwrite仍传missing，完整重写行为未验。

### 经历精简/确认/取消

- **status**：已UI接线；NPC-01/10/12
- **evidence**：index3105-3169先预览再replaceExp；草稿内存单槽；取消仅modalClose属性。
- **limits**：不持久化精简草稿；缺scope和版本；关闭弹窗不等于取消在飞请求。

### 冷藏日期/事件/草稿

- **status**：手动扫描接线；NPC-04/05
- **evidence**：runtime106-139首次只建当天基线，姓名子串命中事件，去重eventIds最多120；index2342扫描、2394确认、2410放弃；台账与冷藏分开保存。
- **limits**：非自动自治，不排除在场人物；草稿无recordVersion；确认用当前worldDay而游标按toDay。延迟旧日事件/ID复用/丢弃重试未做完整矩阵。

### 重生成/跨聊天/取消

- **status**：局部守卫存在但未闭环
- **evidence**：index127-137比较epoch/scope/chat对象/回复文本/swipe；229切聊天使普通记录/补全/冷藏飞行结果stale并恢复分聊天数据。
- **limits**：精简漏守卫；已提交人物账无重roll回滚，NPC-03；GENERATION_STOPPED不等于取消所有在飞NPC任务。公共quiet/afterWorld问题归入口分片。

### autonomy

- **status**：仅公开API/内存，不是默认NPC决策
- **evidence**：index459实例与4550/4555-4562暴露；计划版本通知488-495连到候选失效。生产JS检索未见默认plan/reviewCandidate/注册计划调用链。
- **limits**：无snapshot/restore；stateVersion进计划key，跨版本续期调用者负责；NPC-07。

### conflict

- **status**：仅公开API；NPC-08
- **evidence**：index465/4552；同权复核，高权需代表范围完整，不盲从单人。
- **limits**：无默认调用；guard支持的intent集与coordinator任意非空intent不同，适配未闭环。

### reassessment

- **status**：仅公开API/内存，局部约束稳定
- **evidence**：index464/4551/4559-4561；factIds非空、计划版本、同obstacle去重及终态清理有测试。
- **limits**：pending不持久化；未验证伪造/已clear的request重传，adjust/transition不核pending成员；factIds形状不代表事实已证实。

### decision-guard

- **status**：仅公开API；NPC-06
- **evidence**：index458/4549；越界知识ID拒绝、权限/意图/动作/waiting_player/计划版本/clearBranch有测试。
- **limits**：不在默认人物记录链；guard计划与autonomy活动计划独立Map，不自动同步/保存。

### outcome

- **status**：仅公开API；NPC-08/09
- **evidence**：index468/4553；仅候选committed:false，不正式提交。
- **limits**：planId/planVersion还需调用方补全，单测成功不证明完整自治可用。

### commit-gate

- **status**：条件接线，非所有NPC写者通用门
- **evidence**：index472/487；request-router109仅存在npcCandidates数组才校验；状态版本/scope/计划版本/active检查局部稳定。
- **limits**：人物簿/精简/冷藏不走此门；ready不等于原子提交或持久化；不替调用者验证玩家暂停、执行结果和证据。

详见[原始分片](npc.md)和[JSON](npc.json)。

## 纳戒/MVU/数据库与恢复

### 身份档案、斗气属性、外貌

- **status**：部分可信
- **evidence**：self-runtime:254-261 与 restore 的长度约束；单字段基本测试通过；受混合 update/异步持久链影响。

### 境界/段位

- **status**：存在缺陷
- **evidence**：空境界撤销不成立；MVU 有境界链前进上限及段位正则；independent/panel 只做文本长度，不与 inline 共用晋升规则。是否要求独立模式同样限制尚需产品契约，不另报根因。

### 金币

- **status**：基本算术可用，重生成/恢复不可信
- **evidence**：set/add 边界及 clamp 可读；R11/R15，负数不足时 clamp0 为现行策略，不猜测交易应失败。

### 称号

- **status**：基本可用，撤销/整表替换边界待验
- **evidence**：去重、最多6、按名添加移除；容量满时新增先于删除的 MVU 顺序可能拒绝替换，未单独复现。

### 功法/斗技

- **status**：存在缺陷
- **evidence**：增改删按名/ID可追；混合 update 原子性及 DB skill.progress 保真失败；字段容量会 prune 最旧。

### 装备/天材地宝

- **status**：主路径可读，迁移/撤销待加强
- **evidence**：独立列表，旧 items.equipped=true 在 restore 迁入 equipment；实时 updateItem(equipped=true) 仍会留在 items，到重载才迁入，self-mvu 仅投影 equipment。该遗留操作在 schema 可表达，面板调用未穷尽，作为门禁不声称实际用户已中招。

### 行囊数量、同类并账、耗尽

- **status**：确认缺陷
- **evidence**：R1/R2/R4/R10；addItem 非法 count 默认1，现行宽容输入政策；同名同类别合并但 MVU bag 只按名，异类别同名往返存在歧义。

### 配方/制作台

- **status**：存在缺陷
- **evidence**：手动开工/成功失败/世界日估算、去重可读；finishCraft 不自动发成品是提示中的显式分工，不误报；DB 丢 count，MVU 同名更新忽略。

### 目标 title/text、完成、放弃、旧档兼容

- **status**：基本模型明确，MVU更新有缺口
- **evidence**：normalizeGoal 共源；addGoal 标题强制、旧档派生标题、_restoreGoal 保留 done；旧目标表原位补列保行；R14 同标题属性变更被忽略。

### 注入/解析/模型决定

- **status**：基本路径通过，容量验收未完成
- **evidence**：buildSelfInjection 身份优先、行囊12种、预算尾删；决定输入最多12楼/每楼800字，输出最多12条；所有ID并非总能进入模型可见清单。不将提示词承诺当实际生成证据。

### 同楼重新生成/撤销/去重

- **status**：确认缺陷
- **evidence**：R3/R4/R10/R11/R15；无变化决定分支 index:1347 不调用 apply([])，且 auto floor 防重不绑定新 swipe 身份，完整界面路径尚未黑盒验证。

### chatMetadata 持久化与 index 接线

- **status**：写入主路径已追踪，恢复语义有缺陷
- **evidence**：persistSelf->saveSelfState，独立生成有 continuation；self撤销元数据未持久、数据库收养空戒时间戳失败；真实 saveMetadata 可靠性未验。

### MVU镜像/输入仲裁

- **status**：确认缺陷
- **evidence**：typed 中文命名空间、时间戳比对、chain 差分可读；R4/R7/R14，异步 latest/整帧并发/fallback 写盘缺宿主门禁。

### DB adoption/镜像/fallback/跨聊天/恢复

- **status**：确认缺陷
- **evidence**：R5/R6/R8/R12/R13；顺序 CRUD 和失败全量兜底基础测试通过，但不是串行镜像，也不是聊天安全事务。

### MVU套件与两份初始化JSON契约

- **status**：静态已查；旧DB导入件不一致
- **evidence**：MVU schema/五件套23个实际键（注释说22属文案漂移）；旧平键 InitVar 已明确禁用归档；DB导入件需源一致性门禁。未执行脚本。

详见[原始分片](self-storage.md)和[JSON](self-storage.json)。

## 世界/影响/沙盒

### 时钟/季节/分钟进位

- **status**：offline_pass_with_boundaries
- **evidence**：world-runtime/ops测试通过；advance累计day超过99999后格式化/恢复边界未测，不据此单列缺陷

### 身边/世界事件、预定地点、了结置顶

- **status**：offline_pass
- **evidence**：登记/双域/去重/短标题/地点/预定/置顶/容量正常路径通过；容量裁剪后的完整撤销未验证

### 任务新增/更新/完成/删除/期限

- **status**：confirmed_defects
- **evidence**：正常CRUD/恢复通过；拒绝仍写与期限撤销失败已复现；任务逾期仍active只显示已逾期，不将未规定的自动失败当bug

### 势力/人物档案

- **status**：partial
- **evidence**：留空保旧/更新/恢复通过；level schema覆盖确认；人物仅basis变化的拒绝副作用待单独回归

### 世界传闻/到期

- **status**：offline_pass
- **evidence**：world传闻·未证实标记与到期事件扫除/单次推进重roll测试通过；多个时钟操作组合撤销未验证

### 重生成/幂等/存档往返

- **status**：confirmed_defects
- **evidence**：简单同楼路径通过；同opId重roll会删空、任务期限不恢复；持久化lastFloor不在snapshot，刷新后重roll未验证

### 影响记录、修复、因果链、相似去重

- **status**：offline_pass
- **evidence**：正常record/adjust/ripen/close/revert/chain/duplicate与260条无淘汰测试通过

### 影响选条/成熟/归档恢复

- **status**：confirmed_defects
- **evidence**：正常两轮通过；跨聊天旧选条、缓存、无界pending、成熟不撤销、同日恢复跳扫、归档ID碰撞确认

### 影响传闻

- **status**：confirmed_defect
- **evidence**：world+rumor标记优先级及台账遗漏certainty可达

### 沙盒口径切换授权与续聊

- **status**：confirmed_defects
- **evidence**：同一实例确认取消与分支隔离通过；模式不持久化、旧档回落全局、确认无版本复验

### 沙盒剧情来源与主链接线

- **status**：partial
- **evidence**：开放世界跳过扩展设定索引、正文换内置基线，世界决定另附惯性/自主性；不能证明酒馆原生世界书也被禁用；节点调度/可达性/发现知识状态未实现于当前sandbox范围

### 预算与并发

- **status**：confirmed_defects_and_gaps
- **evidence**：输出ops/picks数量有界，world/impact决定有busy+continuation；场记无旧响应门控、pending输入无界，沙盒对象预算未接线；全局quiet队列由entry分片负责

详见[原始分片](world-impact-sandbox.md)和[JSON](world-impact-sandbox.json)。

## 总控界面/设置/HUD

### 总控

- **status**：defects
- **evidence**：nested开关误读、llm导航丢页；scope过滤和固定元数据静态稳定。

### 世界运转

- **status**：partial
- **evidence**：完整投影；推进1-365天与apply/persist已读；事件、势力、人物、任务行细节未全读。

### 纳戒

- **status**：partial
- **evidence**：身份/境界/行囊/装备/炼制/目标完整投影；各手动选择器已定位，实体编辑/装备确认未逐条读取。

### 记忆存储

- **status**：partial
- **evidence**：大小记忆、注入和ref投影完整；决定/召回/合并入口已读；晋升/遗忘/分页实现未全读。

### 人物簿

- **status**：defects
- **evidence**：导入跨聊天覆盖P1；导出只JSON.stringify ledger；编辑/删除/经历等仅部分绑定核对。

### 冷藏推进

- **status**：partial
- **evidence**：名单/新近标签/草稿完整投影；确认/丢弃和勾选入口已读；扫描与内部授权未复审。

### 世界影响

- **status**：partial
- **evidence**：进行中状态投影完整；新增编辑保存关闭撤销遗忘归档绑定清单已定位；表单与确认未全读。

### 原著资料

- **status**：defects
- **evidence**：异步旧书索引覆盖；选书/保存/默认提示词已核对；详情浏览器长列表实现未读。

### 行动结算

- **status**：defects
- **evidence**：手动按钮明确force+preview；审核/候选/对账和清理语义清楚；跟随默认缺保存。

### 数据镜像

- **status**：static_projection_reviewed
- **evidence**：bridge异常/开关/MVU只读投影已读；实际同步正确性归其他分片。

### 运行日志

- **status**：static_projection_reviewed
- **evidence**：固定标签、倒序、读取40条；全部来源的按聊天隔离未复审。

### 开放世界

- **status**：static_bindings_reviewed
- **evidence**：实际为第12个信息窗之一；read/sync及确认取消链已读；无scope明确不可用；runtime内部不复审。

### API设置/11连接选择

- **status**：defects
- **evidence**：新增复制删除、password转义、datalist和清绑定有接线；成功保存反馈不可靠；迁移内部未读。

### 外观/显示美化用户控制

- **status**：partial
- **evidence**：主题迁移、compact/showOrb绑定存在；正则同名不覆盖尊重用户disabled；四条默认全局安装，帷幕隐藏三楼外内容，通过正则面板停用后重进聊天恢复，非专属即时开关。

### 可访问性/弹窗/键盘/刷新

- **status**：defects
- **evidence**：role button无键盘、子dialog焦点语义不足、全部刷新关闭详情；外点与Esc分层关闭代码存在；无视觉验收。

### 长列表性能

- **status**：partial
- **evidence**：预览4、full200、rows10有上限；截断未提示；全量sort/map后再cap且收集所有runtime，未做CPU/布局测量。

### 设置持久/迁移绑定

- **status**：partial
- **evidence**：通用input先update再await save且sequence防旧文案；两条保存路径有缺口；默认落点和模板一致性测试通过；schema迁移内部未读。

### 敏感DOM/导入导出

- **status**：limited_static_review
- **evidence**：API key转义后进入password value属性，headers为明文textarea，这是编辑器DOM不是加密边界；未见本范围全设置导出。人物簿JSON不含API配置。未全审消毒器/真实错误日志。

详见[原始分片](ui-dashboard.md)和[JSON](ui-dashboard.json)。

## 纳戒与人物界面补查

### 纳戒身份/境界/金币/称号与初始化

- **status**：static_bindings_reviewed_with_defects
- **field_source**：1854-1891 runtime.snapshot/status；profile字符串、realm/stage、gold、titles；初始化读data-self-init。
- **input_validation_and_write_api**：6312-6349 setProfile/setRealm/setGold/addTitle/removeTitle→applySelfOps；金币整数>=0；6450-6458初始化仅提交非空，金币>0向下取整。
- **save**：1144-1148→persistSelf→saveSelfState，并发DB/MVU镜像；不等保存，UID-05。
- **ui_feedback**：applied/rejected状态，成功称号清输入；刷新回写身份/境界/金币输入，没有dirty标记。
- **chat_switch_and_async**：同步读取当前runtime，252刷新当前页；初始化停靠表单切聊未清；宿主保存时序未验。
- **deletion_confirmation**：称号×无确认；身份清空由显式设置按钮提交。
- **limits**：长度/上限校验属既有业务分片，不逐项复审。

### 功法/斗技/装备/天材地宝/行囊/丹方/目标清单与详情

- **status**：defects
- **field_source**：1592-1713取snapshot八类清单；固定字段、目标title/text；items按equipped/count排序，goals按done/priority排序。
- **input_validation_and_write_api**：1423-1447各类手填op；名称/目标规则委托runtime；新增数量仅正整数才传，否则省略走默认；6410-6419改数量整数>=0，0表示移除。
- **save**：applySelfOps→persistSelf；删除成功即时提交保存，UID-05。
- **ui_feedback**：固定标签、缺值—、失效id提示；天材地宝删除无反馈UID-04。
- **chat_switch_and_async**：详情持list/id而无scope，切聊不关modal；相同id可指向新聊天条目，是UID-03同类入口。
- **deletion_confirmation**：remove/title/count0无确认；craft无移除按钮，不把不存在功能当缺陷。
- **limits**：6060-6066长markup只抽输入/选项属性。目标详情标题1589取name，头部1516取title/text，低影响文案未另列finding。

### 装备槽位/空槽挑选/穿上卸下

- **status**：defects
- **field_source**：1838-1840合并equipment与旧items.equipped；1719-1727七槽；1812-1813只匹配武器/防具/饰品到weapon/body/accessory。
- **input_validation_and_write_api**：穿上removeItem+addEquipment；卸下removeEquipment+addItem(count1)；旧equipped只翻标记。UID-01/02。
- **save**：applySelfOps提交保存；无转移事务成功判断。
- **ui_feedback**：applied非空便报穿上/卸下；源不存在有提示。
- **chat_switch_and_async**：按钮闭包/详情id未绑定聊天，动态模态切聊保持。
- **deletion_confirmation**：穿脱应保障不丢源数据；不是要求额外删除确认。
- **limits**：头/手/腰/足空槽picker没有匹配类别；记录能力边界，不以完整度或美观新增finding。

### 炼制开工/成丹/炸炉与目标达成

- **status**：static_bindings_reviewed_with_defects
- **field_source**：snapshot.crafts/status/startDay/endDay/count；goals.done/title/text。
- **input_validation_and_write_api**：1451-1473名称必填，count/days正整数才传；6421-6435 finishCraft/finishGoal；出炉不自动addItem且文案提醒。
- **save**：applySelfOps→persistSelf，UID-05。
- **ui_feedback**：成功清输入关闭，拒绝显示reason；炼成/炸炉来自status。
- **chat_switch_and_async**：入口无await；旧模态无scope绑定，异步决定另有continuation。
- **deletion_confirmation**：完工/达成即时提交；craft不提供删除，目标移除无确认。
- **limits**：负数/小数开工参数被省略而非表单错误；超上限取决于runtime，未新造业务问题。

### 纳戒手动决定/默认提示词恢复

- **status**：static_bindings_reviewed
- **field_source**：6437-6442触发runSelfDecision或unifiedActive路径；1295-1371读取当前chat、世界书与self快照。
- **input_validation_and_write_api**：开关/连接/busy预检；解析invalid/empty/applied。6472-6487默认提示词派发input。
- **save**：决定persistSelf不等待；默认设置6957 await saveSettings且sequence防旧文案。
- **ui_feedback**：按钮disabled至finally；决定失败状态可见。
- **chat_switch_and_async**：1308 capture、1341与1365验current；不重复业务决定内部审查；settings保存非聊天数据。
- **deletion_confirmation**：不适用，不删除账本。
- **limits**：未运行模型或完整决定链；unified退役语义属既有分片。

### 记忆分页/分量/晋升/删除/手填

- **status**：defects
- **field_source**：6490-6506 dataset给tier/delta/id/nextWeight；7374-7402来自七个文本字段及tier/tag/weight。
- **input_validation_and_write_api**：页码>=0；setWeight/promote/forgetMemory→applyMemoryOps；title/text为空早退，关联等委托runtime。
- **save**：1243-1247→persistMemory→saveMemoryState，保存失败反馈UID-05。
- **ui_feedback**：拒绝追加流水错误；related_missing改placeholder但草稿仍清空UID-07。
- **chat_switch_and_async**：本入口无await；跨聊天镜像属既有分片；全量分页renderer非本次完整审查范围。
- **deletion_confirmation**：6504-6505无确认，UID-06。
- **limits**：只追必要memoryApply/Add与删除按钮，不宣称记忆整页完整审查。

### 人物列表/总簿筛选搜索/最近活动

- **status**：static_projection_and_bindings_reviewed
- **field_source**：2528-2618 list/status；aliases/titles/identity/name搜索；重要优先、好感排序，recent按log最大floor。
- **input_validation_and_write_api**：filter present/absent/important；6897 input重置shown60；6716每次+80。
- **save**：只读查询无需保存；行尾状态切换另列。
- **ui_feedback**：空簿/无匹配分别提示，更多显示真实剩余条数。
- **chat_switch_and_async**：切聊refreshNpcLedgerPage重绘列表；last injection来源未复审。
- **deletion_confirmation**：列表不直接删除，开详情后UID-06。
- **limits**：shown计数跨聊保留不作缺陷；未做性能或真实DOM事件验收。

### 人物完整档案三页/编辑所有字段

- **status**：defects
- **field_source**：2762-2870按NPC_FIELDS+bundle绘固定字段；别名/称号在抬头，presence/location/importance在chips或按钮。importance的索引组不在表单但有单独切换。
- **input_validation_and_write_api**：2977-3075 enum/list/text/things/triples/secret序列化解析；setFields规范化所有控件含隐藏页，空值可清。
- **save**：3079 persistNpcLedger→saveNpcLedgerState，UID-05。
- **ui_feedback**：updated即重开basic；unchanged局部提示、not_found提示；先写的已保存status随重建被移除。
- **chat_switch_and_async**：UID-03未绑定聊天及记录版本，切聊保持旧表单。
- **deletion_confirmation**：整档删除无确认，UID-06。
- **limits**：竖线分隔无转义；含|字段可逆性未探测，列为未知，不报证实问题。

### 人物经历添加/删除/精简与流水

- **status**：defects
- **field_source**：2881-2946读取exp逆序、day及原index；流水逆序最多30；新楼标取当前chat末回复。
- **input_validation_and_write_api**：body trim必填，day正整数否则worldDay；addExp/removeExp；精简→parse→预览→replaceExp。
- **save**：add/remove/confirm后persistNpcLedger，不await。
- **ui_feedback**：成功重开exp；空输入placeholder；失败not_found/invalid_index没有明确反馈。
- **chat_switch_and_async**：手动旧表单/原下标UID-03；精简旧请求跨聊已在npc.json记录，去重不新增。
- **deletion_confirmation**：经历×无确认；精简有明确确认替换和放弃。
- **limits**：流水30条有明确注释，不宣称全部；同聊并发append/裁剪后旧下标删除目标待专测。

### 人物JSON补丁/在场重要切换/世界书重抽

- **status**：static_bindings_reviewed_with_known_defects
- **field_source**：2720-2743 textarea JSON、record.name；6816-6837当前ledger record；2163-2236世界书条目。
- **input_validation_and_write_api**：JSON语法/空payload校验→applyNpcLedgerPayload；切换从当前record算值；重抽names/overwrite，最多8人。
- **save**：created/changed才persistNpcLedger；重抽filled后保存。
- **ui_feedback**：语法/空/忽略字段消息，完成清空关闭；重抽禁用按钮并改文案、finally恢复。
- **chat_switch_and_async**：重抽2181 capture、2205/2223复验；部分更新后第二人切聊提早返回保存问题未另复现。
- **deletion_confirmation**：单人6770-6777有覆盖确认；tooltip2963却说只补空，真实语义以确认及overwrite:true为准。
- **limits**：英文键/嵌套保护绕过已由npc.json报告，不重复finding。

### 冷藏名单/勾选/草稿投影

- **status**：static_bindings_reviewed
- **field_source**：2620-2671 pending预览、patch JSON、世界日；2679-2717 selected、最近冷藏log及自行/新标签。
- **input_validation_and_write_api**：6719-6728 select/deselect当前name；默认prompt6705-6713派input；确认/放弃按钮dataset=preview.id，处理函数由旧分片覆盖。
- **save**：persistNpcCold→saveNpcColdState，UID-05。
- **ui_feedback**：6726更新勾选消息，6727仅重绘人物list；本handler未直接刷新bench/冷藏summary，后续refreshNpcLedgerPage才同步。
- **chat_switch_and_async**：切聊恢复runtime后刷新；模型扫描提交由npc分片覆盖。
- **deletion_confirmation**：deselect仅取消选择不是删人物；草稿有确认/放弃。
- **limits**：未复审冷藏业务runtime；summary即时刷新缺口仅作静态观察未另报finding。

### 模态停靠与事件/设置持久绑定

- **status**：static_bindings_reviewed_with_defects
- **field_source**：4677-4751单一modal、dock.__dockHome；panel click、input/change委托。
- **input_validation_and_write_api**：开modal搬节点，关闭恢复隐藏；普通button不触发form原生提交校验，业务按handler校验。
- **save**：默认提示词派发input，6953-6960等待保存并区分unavailable/reject。
- **ui_feedback**：关闭/背板/Escape可分层关闭；焦点/语义问题在ui-dashboard已列。
- **chat_switch_and_async**：切聊无关闭动态模态，UID-03；保存延迟反馈的实际宿主作用域待验。
- **deletion_confirmation**：关闭只关UI，不撤销已提交数据；与业务删除确认不同。
- **limits**：不重复已有焦点、键盘、列表刷新问题；无浏览器、图片、辅助技术验收。

详见[原始分片](final-ui-detail.md)和[JSON](final-ui-detail.json)。

## 最终跨模块复核

详见[原始JSON分片](coordinator-final.json)。

## 世界/影响/记忆界面补查

### HUD人物详情

- **status**：static_reviewed
- **lines**：5264-5403
- **fields**：名字/好感/别名称号/在场重要地点身份、NPC_FIELDS分组、近况经历流水。
- **save**：纯读ledger，无保存。
- **confirmation**：仅关闭；关闭按钮有aria-label。
- **budget**：近况/经历/流水各最多3条，正文无统一限字。
- **pagination**：无分页，不是完整人物历史入口。
- **readonly_boundary**：aside和文本节点展示，不写账；不是权限或防剧透边界。

### HUD通用详情

- **status**：static_reviewed
- **lines**：5405-5594
- **fields**：事件/任务/势力/人物/记忆/影响/冷藏/原著8类ref，重取活数据，消失则不弹。
- **save**：snapshot/list/get，无保存。
- **confirmation**：同条切换收起；人物与通用详情互斥。
- **budget**：标题30字，正文未裁；JS按viewport夹取坐标。
- **pagination**：详情无分页；全部列表问题沿用旧报告。
- **readonly_boundary**：只读；原著全文读取不裁卷，不等于模型防剧透控制。

### 记忆/影响模型按钮和默认提示词

- **status**：partial
- **lines**：6507-6659
- **fields**：decide/recall/consolidate/impact-record及默认恢复。
- **save**：默认恢复dispatch input走保存通道；模型入口仅追绑定、未执行。
- **confirmation**：recall/impact按钮finally解禁；decide/consolidate本段不禁用。self reset另有confirm。
- **budget**：按钮本身不建立模型预算；重复调用/总控护栏归旧运行时审查。
- **pagination**：影响每次加100，档案加60。
- **readonly_boundary**：这些按钮可能调用模型并改账，不能称整页只读；本次未执行。

### 记忆手动登记

- **status**：defects
- **lines**：7363-7413
- **fields**：标题/正文/层级/标签/分量/原句/备注/依据/关联/别名。
- **save**：applyMemoryOps→persistMemory/镜像→刷新，不等待落盘。
- **confirmation**：显式提交；拒绝留窗却清草稿。
- **budget**：HTML摘录标题14/正文300；关联、别名各截4项；运行时其他限额未全重审。
- **pagination**：不适用。
- **readonly_boundary**：登记写入，与只读详情分离。
- **finding_refs**：["FWM-01","ui-dashboard#5"]

### 记忆列表、筛选、预览与详情

- **status**：defects
- **lines**：7415-7495;7543-7648;6490-6506
- **fields**：时间/分量/标签排序、recallKeys过滤、转大/改分量/删除。
- **save**：memoryApplyFromPanel统一保存。
- **confirmation**：删除无二次确认，当前范围未见回收站/撤销UI；转大与分量即时。此为验收边界，不另立缺合同的新bug。
- **budget**：分页前全量filter/sort/findMemoryConflicts；未测复杂度或CPU。
- **pagination**：大6/小8，夹页；过滤排序重置0，主页固定第一页。
- **readonly_boundary**：详情仅click，键盘问题沿用旧号；未见全文编辑入口。
- **finding_refs**：["FWM-04","ui-dashboard#6","ui-dashboard#7"]

### 记忆注入记录

- **status**：static_reviewed_with_known_defect
- **lines**：7498-7540
- **fields**：来源、条数字数时间、清理状态及entries详情。
- **save**：memoryLastInjectionView纯读。
- **confirmation**：无修改动作。
- **budget**：未重算真实通道字数，不验证实际注入成功。
- **pagination**：entries全列，无本地分页。
- **readonly_boundary**：本轮已注入是上游状态声明，不是独立运行时证据。
- **finding_refs**：["MU-09","MU-10"]

### 世界事件、时钟与信息

- **status**：defects
- **lines**：7290-7341;7691-7737;7953-8000;6180-6221
- **fields**：near/world、分量、标题正文依据地点时限、了结置顶、clock/info。
- **save**：apply→persistWorld→可见时refresh；拒绝原因进入流水。
- **confirmation**：了结、置顶、设时钟无二次确认；本段无事件全文编辑入口。
- **budget**：推进1-365整数；期限1-90非法转undefined；事件全铺；runtime maxEvents参数10-200已定位。
- **pagination**：事件无UI分页，流水8条。
- **readonly_boundary**：详情文本只读；表单按钮改账；传闻详情标未证实。
- **finding_refs**：["FWM-01","FWM-02","ui-dashboard#5"]

### 世界任务CRUD

- **status**：defects
- **lines**：7344-7359;7895-7942;6206-6210
- **fields**：标题详情依据期限、完成删除、逾期/完成日；未见编辑表单。
- **save**：统一世界保存；拒绝仍清草稿。
- **confirmation**：完成删除无确认；本范围没有用户撤销入口。
- **budget**：HTML标题20；非法期限被省略；正文无统一渲染预算。
- **pagination**：active优先全列，无分页。
- **readonly_boundary**：详情只读；不能声称任务完整可编辑CRUD。
- **finding_refs**：["FWM-01","FWM-02","ui-dashboard#5"]

### 世界势力CRUD

- **status**：static_reviewed_with_defects
- **lines**：7740-7763;7783-7860;6211-6213
- **fields**：name/stance/basis与9个档案字段；同名更新、编辑预填。
- **save**：统一世界保存；拒绝也清表。
- **confirmation**：删除无确认；改name按新名登记非rename；留空保持原值是明确文案合同。
- **budget**：全量sort/map；具体字段HTML上限未逐一复核。
- **pagination**：无分页。
- **readonly_boundary**：详情只读，编辑写账；不能清空可选档案与留空保持合同一致，不另报bug。
- **finding_refs**：["FWM-01","world-impact-sandbox#F10"]

### 世界人物态度CRUD

- **status**：static_reviewed_with_defects
- **lines**：7765-7781;7862-7893;6214-6216
- **fields**：name/attitude必填、basis；同名更新，无预填编辑按钮。
- **save**：统一世界保存；拒绝清字段。
- **confirmation**：删除即时无确认，恢复路径未覆盖。
- **budget**：updatedDay全量排序，无UI渲染上限。
- **pagination**：无分页。
- **readonly_boundary**：详情纯文本；同名登记更新非只读。
- **finding_refs**：["FWM-01","ui-dashboard#5"]

### 影响表单与状态操作

- **status**：defects
- **lines**：6577-6629;8002-8141
- **fields**：title/detail/target/kind/weight/certainty/evidence/eventId/canon/shift共10字段。
- **save**：仅applied才persist；拒绝保留并翻译原因；不等待持久保存。
- **confirmation**：收场、修复、删除、恢复无confirm；forget可从档案恢复。
- **budget**：错误字典说明20/240/40/120/60等限额交runtime；保存设impactShown=MAX_SAFE_INTEGER撤销100条DOM上限。
- **pagination**：保存后全铺；只调整state筛选。
- **readonly_boundary**：表单改账；详情非权限隔离；未做宿主操作。
- **finding_refs**：["FWM-03","ui-dashboard#5"]

### 影响列表、最近、档案与详情

- **status**：static_reviewed_with_gaps
- **lines**：8143-8362;6593-6604;6898
- **fields**：state/weight/kind/search、parent/children、楼层删除提示、注入徽标、归档原因。
- **save**：列表纯读；恢复调用runImpactOp。
- **confirmation**：直接状态操作；档案可恢复，容量/ID安全沿用旧报告。
- **budget**：最近默认5最多20；常规100+100；档案60+60；filter全量；保存可全铺。
- **pagination**：递增加载非页码；计数换聊天是否重置未追查。
- **readonly_boundary**：详情未展示evidence、canon原文与kind；归档详情更少。完整元数据文案需要澄清，未独立报bug。
- **finding_refs**：["FWM-03","ui-dashboard#6","ui-dashboard#7"]

### 原著状态、注入记录、扫描与选择

- **status**：static_reviewed_with_known_defects
- **lines**：8364-8522;8601-8646
- **fields**：世界书索引、卷、通道、搜索、API绑定、预算；手动卷优先。
- **save**：扫描只读；rememberWorldbookOptions更新配置且吞save错误。
- **confirmation**：不改世界书文件；选择改变配置/本地索引。
- **budget**：status全书limit120、stats limit160，仅各自统计口径，不等于全量总数。
- **pagination**：名称去重，无分页。
- **readonly_boundary**：读取源世界书不写源；异步索引所有权沿用旧问题。
- **finding_refs**：["ui-dashboard#10","ui-dashboard#5"]

### 原著本地浏览器与详情

- **status**：static_reviewed
- **lines**：8524-8599
- **fields**：name/aliases/summary/content包含过滤，category与volume，uid升序。
- **save**：纯本地索引读取，无LLM无save。
- **confirmation**：用户可选择全书，不是权限或剧透隔离。
- **budget**：硬上限80并告知命中总数/前80/收窄；过滤排序先全库，未测运行时成本。
- **pagination**：无下一页，依靠关键词、类别、卷缩小且明示截断。
- **readonly_boundary**：当前卷只筛entry.volumes，不裁entry.content；跨卷全文仍可见。手动浏览边界不能冒充模型防剧透保证。
- **finding_refs**：["ui-dashboard#6","ui-dashboard#7"]

### host/style.css布局与交互规则

- **status**：partial
- **lines**：实际已读范围及未读范围见coverage
- **fields**：token作用域、hidden、断行、移动端、focus-visible、HUD状态/overflow、动效规则抽查。
- **save**：CSS不提供保存权限。
- **confirmation**：不能补足JS的焦点、键盘与确认合同。
- **budget**：viewport/overflow约束存在；orb touch-action:none作用于整体，其触摸滚动影响需实测，不能据静态样式断言失效。
- **pagination**：overflow不等于分页或DOM预算。
- **readonly_boundary**：不浏览器不图片；不作对比度、尺寸、溢出或视觉验收。未读段精确列出。
- **finding_refs**：["ui-dashboard#6","ui-dashboard#7"]

详见[原始分片](final-ui-world-memory.md)和[JSON](final-ui-world-memory.json)。

## 已裁决的描述更正

- memory MU-04不适用生产入口，入口maxOps12。
- self自动去重已经绑定swipe-aware continuation，原feature描述不准确。
- 多数autonomy/conflict/legacy能力只是公开API或可选路径，不能算默认自动自治已运行。
- reviewed状态只说明阅读；所有模块仍保留真实宿主/模型语义/保存落盘门。
