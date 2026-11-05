# self-storage 只读功能细查（2026-11-04）

## Routing Decision
AUDIT -> SWEEP -> REPORT；只读功能细查，不进入 CHANGE。full-scan 是请求模式，不表示完整审查已完成。

根目录：`C:/Users/86158/Desktop/异界转生录/doupo`。下文源码路径均相对此根目录。
源码快照：`1dee86edb89a8f6efc4b8bbd8192a3a9c1017748`，以当前工作区为权威。

## 主要结论
选定离线测试 **9/9 文件通过**，但新增内存复现确认核心数据正确性缺陷。共 **10 项 P1、3 项 P2**；没有把假宿主测试等同于真实酒馆验收。
优先关注：整栈消耗后恢复复活物品、重生成撤销与基线失配、DB-only 冷恢复被空戒时间戳拒绝后反向覆盖、DB/MVU 跨聊天任务无护栏及镜像并发。
这是有明确 partial 的审计切片，不是完整仓库审查完成，也不是修复完成。

## Snapshot / A0 / 写入边界
- **date**：2026-11-04
- **head**：1dee86edb89a8f6efc4b8bbd8192a3a9c1017748
- **authority**：当前工作区源码；工作区已有大量修改及未跟踪文件，不是只看 HEAD。未采用此前讨论作为根因证据。未对所有源文件做起止哈希锁定，因此并行修改仍是残余不确定性。
- **writes**：本任务仅创建本 JSON 和同名 Markdown 报告；未改实现、真实数据、配置；未运行构建器、桥接初始化脚本、浏览器或模型生成。
- **a0_receipt**：code-quality-workflow；已加载 audit-and-sweep.md；consult-tavernweave-library A0 v1.1.0 三格已核对：目标=只读审计，红线=非报告不写，验收=证据/覆盖/离线测试/内存复现。没有实施授权。

## Findings（完整列表）

### 1. [P1] 整栈消耗保留零数量，重载或数据库往返复活一件
`agent/doupo-agent-ui/self/self-runtime.js:398` · Must Fix Now
- **功能**：物品数量与归零恢复
- **触发条件**：removeItem 的 count 等于整个大于 1 的栈；或单件条目携带非法 count。
- **确定性**：确定性；无需浏览器。
- **证据/复现**：removeItem 仅在 entry.count>1 时校验 count，扣到 0 后直接返回，不移除。cleanEntry:96/108 把不合法的 0 变成 1；db-tables:693 也 Math.max(1,...)。R1：addItem count=3 -> removeItem count=3，快照仍有 count=0；restore 后 count=1。count=1 时带 0/负数/超额 count 也直接走整条移除而不校验。
- **影响**：消耗完的丹药/材料在刷新、恢复或 DB 收养后凭空回来；错误数量请求还可能删除最后一件。
- **最小建议**：数量参数先统一校验，再扣减；扣到 0 删除条目，并保存完整可逆原条目。不要只在恢复时改成 1。
- **验收**：3-3、1-1、非法 0/负/超额；快照/restore/DB 往返都无零数量残留；撤销恢复原 ID 和原数量。

### 2. [P1] update 校验失败前已改字段，拒绝结果不代表账本未变
`agent/doupo-agent-ui/self/self-runtime.js:357` · Must Fix Now
- **功能**：所有 updateTechnique/Skill/Equipment/Treasure/Item 的原子性
- **触发条件**：一个 update 操作同时包含可修改字段和非法 count。
- **确定性**：确定性；R2 已复现。
- **证据/复现**：357-372 先改 name/grade/type/等字段，373-375 才检查 count。R2：已有 b1，updateItem {name:'已变',count:-1} 返回 rejected/bad_count，但快照名字已变。此路径没有 undo、updatedAt 或成功流水。
- **影响**：面板显示拒绝却落下部分修改，时间戳和镜像的新旧判断失真，重生成也无法回退这次副作用。
- **最小建议**：对副本验证全部字段后一次提交，或在所有可能拒绝点之前完成校验。
- **验收**：每种 update 带一个合法字段和非法 count，断言被拒绝前后快照逐字相等；包含日志和 updatedAt。

### 3. [P1] 撤销不是完整逆操作，且失败被当成已撤销
`agent/doupo-agent-ui/self/self-runtime.js:496` · Must Fix Now
- **功能**：重生成撤销的境界、条目 ID 与 opId
- **触发条件**：同楼重生成包含初次 setRealm、数量零删除或复用 opId。
- **确定性**：确定性；R3/R10/R11。
- **证据/复现**：setRealm:271 的 undo 可能 realm=''，但 265 禁止空境界；同楼撤销 497 不检查结果。update count=0:382-383 删除原 id，使恢复变成 b2。opIdMemory:508 在撤销后仍保留原 opId。R3 首次设斗者后同楼 apply([]) 仍为斗者；R10 count=0 后撤销恢复成 b2；R11 相同 opId 重生成先撤回金币又被 duplicate 跳过，10 变 0。
- **影响**：换 swipe/重新生成不能恢复原账，后续引用旧 ID 失败；流水却写着已撤销。
- **最小建议**：引入仅内部可用的完整状态/条目恢复语义；撤销保留 ID 并处理 opId 归属，失败不能继续报成功。不必重写公开业务 API。
- **验收**：首次境界从空到非空再撤销；数量零删除再撤销 ID 不变；同 opId 同楼重放结果相同；撤销失败显式阻断提交。

### 4. [P1] MVU 重生成先按旧版结果做差分，runtime 随后撤销导致引用失效
`agent/doupo-agent-ui/host/mvu-arbiter.js:479` · Must Fix Now
- **功能**：同楼 MVU 清单更新与撤销的基线一致性
- **触发条件**：同一 AI 楼重新生成，第二版 MVU 差分引用第一版新建条目。
- **确定性**：确定性；R4 直接组合实际纯函数及 runtime。
- **证据/复现**：479-493 用当前已落账 ledger 生成 update/remove id 操作，再交给 selfRuntime.apply；后者 496-497 先撤销上一版本。R4：floor=1 第一版新增 b1 丹×3，第二版帧丹×2 -> 差分 updateItem b1；apply 先删 b1，再拒绝 update(id_not_found)，最终行囊为空。
- **影响**：正常重新生成可把已有物品直接清空；不只是重复记账。
- **最小建议**：仲裁和落账使用同一份重生成前基线：先恢复该楼基线再做帧差分，或把整帧提交作为一个带明确基线的事务。
- **验收**：同楼第一版新增/第二版改数量、删、新增混合；最终严格等于第二版清单，重复处理同帧不改变状态。

### 5. [P1] 恢复丢掉同楼撤销基线，刷新后重新生成重复累计
`agent/doupo-agent-ui/self/self-runtime.js:553` · Must Fix Now
- **功能**：持久化后的重生成/撤销
- **触发条件**：已有模型落账的楼在 restore/reset 后再次记账。
- **确定性**：确定性；R15。
- **证据/复现**：snapshot 只返回 state；lastFloor/opIdMemory 在闭包中，restore:560-561 清空。host-storage 保存的只是 snapshot；state-persistence 另存 orchestrator，不含这些 self 私有数据。R15：floor1 addGold 10 -> snapshot/restore -> floor1 addGold 10，金币为20。
- **影响**：刷新或重新载入后再 roll 同一楼，金币、堆叠物品等重复累计，无法恢复上一版。
- **最小建议**：按聊天/楼/回复版本持久化 self 的可回退基线及去重元数据，或能从受控操作账重建；旧档缺基线时不要宣称支持无损重生成。
- **验收**：save/load 后同楼重生成与未刷新的结果相等；包含 addGold、addItem、finishGoal、手工操作穿插；不同聊天基线不得共享。

### 6. [P1] 没有本地存档时新空戒时间戳阻止数据库恢复，随后反向覆盖数据库
`agent/doupo-agent-ui/index.js:792` · Must Fix Now
- **功能**：DB-only adoption / 冷恢复
- **触发条件**：缺少 doupo_agent_self 元数据，但当前聊天 DB 仍有更早有效账本。
- **确定性**：时间顺序满足条件时确定性；guard 已内存验证，覆盖链为静态可达证据。
- **证据/复现**：792 无 selfState 时 reset()，initialState/ reset 把 updatedAt 设为当前时间；805-808 仅采纳 DB 时间>=本地，714-719 对旧 DB 拒绝；796-797 无论是否收养都 mirrorSelf 当前状态。R13 提取实际 dbStateAdoptable：DB=11月3日、本地新空戒=11月4日，返回 false。后续 mirror 是明确可达源码路径，未对真实数据执行。
- **影响**：仅存于 DB 的原账无法被收回，并可能被新空戒镜像删掉。权限内未对真实数据验证，不能说真实存档已受损。
- **最小建议**：区分无本地存档与有本地新账；空壳初始化不应拿 now() 凌驾持久数据库；只有收养决策明确完成后才允许反向镜像。
- **验收**：本地元数据缺失+DB 非空旧时间，恢复完整 DB 且不先清表；本地确有较新账时仍拒绝冻结旧 DB；DB 无时间戳单独给恢复政策。

### 7. [P1] 数据库异步写入及延迟回拉没有聊天身份护栏
`agent/doupo-agent-ui/host/db-bridge.js:260` · Must Fix Now
- **功能**：DB 跨聊天、恢复 continuation 与外部表格事件
- **触发条件**：数据库操作未完成或外部回调在500ms防抖等待期间切换聊天。
- **确定性**：受控调度下确定性；R6/R12 已复现，adopt 支线为静态证据。
- **证据/复现**：mirror 每笔 await 后继续通过全局 API 写当前聊天，onChatChanged:271-277 仅重置标志，不取消进行中任务/500ms externalDebounce。index adoptSelfFromDb:805 await 后也没有 captureAgentContinuation 检查。R6：A mirror 首笔挂起->切B/onChatChanged->释放，B 表出现 A物。R12：A 的 callback 排队->切B，handler 在 B 执行并收到 A view（输出 B:A）。
- **影响**：旧聊天的物品、金币和回拉状态进入新聊天并持久化；现有独立 LLM continuation 防护没有覆盖此链。
- **最小建议**：bridge 捕获聊天 epoch，在 ensure/CRUD/fallback/adopt 每个 await 后拒绝过期任务；换聊天清理 debounce；回调携带并验证源聊天；index 收养同样核验 continuation。
- **验收**：A->B、A->B->A；分别在 ensure、每笔 CRUD、fallback、adopt、debounce 挂起再切换，断言新聊天及旧帧均不被过期提交。

### 8. [P1] 仲裁等待后仍使用旧聊天楼号，能向新聊天落账
`agent/doupo-agent-ui/host/mvu-arbiter.js:476` · Must Fix Now
- **功能**：MVU 输入仲裁跨聊天隔离
- **触发条件**：1200ms 等待或宿主读帧期间聊天/回复发生变化。
- **确定性**：受控调度下确定性；R7。
- **证据/复现**：464-475 捕获 context/chat/index；476 等待1200ms；477 起读取 latest、取当前共享 runtime、493 apply，但没有聊天/回复身份复核。index 外层 continuation 只用于清 pending，不阻止仲裁器写。R7 sleep 中切换 context并 reset，恢复后新聊天金币变123，status=applied。self-mvu.sync:161/166 也在 await 两端各用 latest，存在同类目标漂移待门禁。
- **影响**：上一聊天或上一回复触发的 MVU 账写入下一聊天，错误随后进入 DB/chatMetadata。
- **最小建议**：给仲裁传入并校验 continuation，捕获确切聊天和 message id，等待、读帧和写入之后都核验；self-mvu 同步也固定目标而不是动态 latest。
- **验收**：等待中切聊天、删楼/换 swipe、追加新回复、离开再回同聊天；所有旧仲裁均 stale，无任何 runtime/persist 写入。

### 9. [P1] 多个镜像同时协调同一旧视图，产生重号行或旧快照覆盖新账
`agent/doupo-agent-ui/host/db-bridge.js:171` · Must Fix Now
- **功能**：DB 并发镜像与写者屏蔽
- **触发条件**：连续手动操作、恢复对账与落账重叠，或多个异步 persistSelf 未完成。
- **确定性**：受控调度下确定性；R8。
- **证据/复现**：171-208 mirror 没有串行队列或版本，ensure 的 single-flight 只保护建表；每次 persistSelf:853 都 fire-and-forget。R8：旧快照首 insert 挂起，较新镜像执行完，再释放旧写入，DB 出现两条 b1，数量分别2和1。finally 214-215 的无条件释放也可能在另一个 writer 未完成时解除屏蔽。
- **影响**：镜像数据重复、版本回退；后续按 id 的收养/协调不再可靠。
- **最小建议**：在现有 bridge 按聊天串行化/合并最新待写快照，操作前校验版本，回调屏蔽按活动写者生命周期管理；不增加第二份账本。
- **验收**：旧/新两次 persist 在每个 CRUD await 交错；最终每 id 恰一行且值为最新快照；失败 fallback 与 self/memory 同时镜像也覆盖。

### 10. [P1] 数据库镜像不是完整快照，但收养会整份替换并丢掉未入表字段
`agent/doupo-agent-ui/host/db-tables.js:607` · Must Fix Now
- **功能**：DB adoption 中制作数量、斗技进度及附注保真
- **触发条件**：数据库与本地有任一投影字段差异且通过 adoption 时间戳条件。
- **确定性**：确定性；R5。
- **证据/复现**：desiredSelfRows:606-621 没映射 skill.progress、craft.count、多类 note 和 goal.source/note；decode:683/698-701 也没有；index:809/825 restore({...state,log}) 仅保留旧 log。R5 数据库往返 craftCount/skillProgress/itemNote 全为 undefined；restore 后制作数量默认为1。sameSelfState 也只比较这个有损投影，不能证明完整账一致。
- **影响**：用户只改 DB 某个可见字段就可连带丢掉本地其他制作数量、修炼进度和备注。
- **最小建议**：明确 DB 的字段所有权：未入表字段按稳定 id 合并保留；或另行批准可逆表结构迁移。不得直接把投影当全量母账替换。
- **验收**：每类非空字段的 snapshot->DB->adopt 无损；DB 只改金币时其他条目隐藏字段不变；craft.count>1、skill.progress、各 note/source 必测。

### 11. [P2] 合法同名目标内容/期限和配方品级更新被静默忽略
`agent/doupo-agent-ui/host/mvu-arbiter.js:358` · Refactor Signals
- **功能**：MVU 目标、配方、现有制作条目的更新语义
- **触发条件**：整表字符串保留原条目名称/标题，仅更新其他属性。
- **确定性**：确定性；R14（目标/配方），制作同名支线为静态证据。
- **证据/复现**：opsForGoals 按标题判断是否已存在，仅新建/完成，不改已有目标 body/priority/due；opsForRecipes 仅新增/删除不改 grade；opsForCrafts 对同名已有作业不改 count/days。R14 修改旧目标为主线、新内容/后天并把旧丹方一品改二品，返回 status=clean，但 diffs 长度2、ops=[]、reverts=[]；runArbitration:489 不重同步。
- **影响**：帧显示的新目标与实际注入/DB 旧目标不一致，用户误以为申报已被采纳。
- **最小建议**：明确各字段是否可更新；支持的转换为有校验操作；不支持的返回 revert 并重同步，不能叫 clean。
- **验收**：同标题目标仅改正文/期限/优先级、同名配方改品级、同名制作改数量/期限；结果要么完整采纳，要么显式回滚且帧与账一致。

### 12. [P2] 数据库初始化导入件落后于源码，仍启用旧记忆导出和废弃列
`agent/斗破Agent数据库桥接表.json:327` · Verification Gates
- **功能**：初始化 JSON 与表定义结构契约
- **触发条件**：使用仓库中该 JSON 而非当前源生成物初始化。
- **确定性**：确定性结构差异；未导入、未执行。
- **证据/复现**：R9 全对象比较 buildBridgeSheets() 与 JSON 不同；JSON:317/376 保留已了结/了结日列，327/386 exportConfig.enabled=true；源 memoryExportConfig:69 为 false，当前 memory 表定义不含旧列。实际均12表，并非构建脚本注释所说10表。
- **影响**：手动导入件在 extension ensure 修复之前具有旧表形态及额外召回开关，不能当作当前源码的可重现初始化交付。运行时能否重复注入还需宿主验证，未作实锤。
- **最小建议**：后续获授权后从唯一表源重新生成并审查 diff；添加只比较内存生成对象与提交 JSON 的只读一致性测试，本次不生成。
- **验收**：buildBridgeSheets 与初始化 JSON 深相等；表数/每列 DDL/导出默认开关一致；旧聊天迁移保行另测。

### 13. [P2] 整表申报容量高于 runtime 单批上限，尾部变化会被丢弃
`agent/doupo-agent-ui/host/mvu-arbiter.js:493` · Verification Gates
- **功能**：大量物品/技能/目标变化的批处理完整性
- **触发条件**：一次帧差分累计生成13条或更多操作。
- **确定性**：静态确定边界；未单独动态复现。
- **证据/复现**：arbitrateFrame 能从一帧生成超过12条（行囊上限60、功法40等）；runtime.apply:501 默认 operations.slice(0,12)，丢掉尾部不报告 dropped；仲裁器只统计已执行项并 persistSelf，把不曾执行的尾部字段重新写回旧值。此条为确定可达静态边界，未另跑>12的内存实例。
- **影响**：模型写了合法整表，但一轮超过12项的后半部分变化消失，用户只能看到部分成功。
- **最小建议**：在仲裁事务边界整体限流并显式拒绝，或用同一楼基线下的受控完整批处理；不能简单多次 apply 同 floor，那会互相撤销。
- **验收**：13/32/60项增删改，核对无静默丢项；整体拒绝也必须有可见原因且帧恢复一致。

## 逐功能状态

| 功能 | 状态 | 证据及边界 |
|---|---|---|
| 身份档案、斗气属性、外貌 | 部分可信 | self-runtime:254-261 与 restore 的长度约束；单字段基本测试通过；受混合 update/异步持久链影响。 |
| 境界/段位 | 存在缺陷 | 空境界撤销不成立；MVU 有境界链前进上限及段位正则；independent/panel 只做文本长度，不与 inline 共用晋升规则。是否要求独立模式同样限制尚需产品契约，不另报根因。 |
| 金币 | 基本算术可用，重生成/恢复不可信 | set/add 边界及 clamp 可读；R11/R15，负数不足时 clamp0 为现行策略，不猜测交易应失败。 |
| 称号 | 基本可用，撤销/整表替换边界待验 | 去重、最多6、按名添加移除；容量满时新增先于删除的 MVU 顺序可能拒绝替换，未单独复现。 |
| 功法/斗技 | 存在缺陷 | 增改删按名/ID可追；混合 update 原子性及 DB skill.progress 保真失败；字段容量会 prune 最旧。 |
| 装备/天材地宝 | 主路径可读，迁移/撤销待加强 | 独立列表，旧 items.equipped=true 在 restore 迁入 equipment；实时 updateItem(equipped=true) 仍会留在 items，到重载才迁入，self-mvu 仅投影 equipment。该遗留操作在 schema 可表达，面板调用未穷尽，作为门禁不声称实际用户已中招。 |
| 行囊数量、同类并账、耗尽 | 确认缺陷 | R1/R2/R4/R10；addItem 非法 count 默认1，现行宽容输入政策；同名同类别合并但 MVU bag 只按名，异类别同名往返存在歧义。 |
| 配方/制作台 | 存在缺陷 | 手动开工/成功失败/世界日估算、去重可读；finishCraft 不自动发成品是提示中的显式分工，不误报；DB 丢 count，MVU 同名更新忽略。 |
| 目标 title/text、完成、放弃、旧档兼容 | 基本模型明确，MVU更新有缺口 | normalizeGoal 共源；addGoal 标题强制、旧档派生标题、_restoreGoal 保留 done；旧目标表原位补列保行；R14 同标题属性变更被忽略。 |
| 注入/解析/模型决定 | 基本路径通过，容量验收未完成 | buildSelfInjection 身份优先、行囊12种、预算尾删；决定输入最多12楼/每楼800字，输出最多12条；所有ID并非总能进入模型可见清单。不将提示词承诺当实际生成证据。 |
| 同楼重新生成/撤销/去重 | 确认缺陷 | R3/R4/R10/R11/R15；无变化决定分支 index:1347 不调用 apply([])，且 auto floor 防重不绑定新 swipe 身份，完整界面路径尚未黑盒验证。 |
| chatMetadata 持久化与 index 接线 | 写入主路径已追踪，恢复语义有缺陷 | persistSelf->saveSelfState，独立生成有 continuation；self撤销元数据未持久、数据库收养空戒时间戳失败；真实 saveMetadata 可靠性未验。 |
| MVU镜像/输入仲裁 | 确认缺陷 | typed 中文命名空间、时间戳比对、chain 差分可读；R4/R7/R14，异步 latest/整帧并发/fallback 写盘缺宿主门禁。 |
| DB adoption/镜像/fallback/跨聊天/恢复 | 确认缺陷 | R5/R6/R8/R12/R13；顺序 CRUD 和失败全量兜底基础测试通过，但不是串行镜像，也不是聊天安全事务。 |
| MVU套件与两份初始化JSON契约 | 静态已查；旧DB导入件不一致 | MVU schema/五件套23个实际键（注释说22属文案漂移）；旧平键 InitVar 已明确禁用归档；DB导入件需源一致性门禁。未执行脚本。 |

## 执行的离线测试与内存复现

- **检查**：node --input-type=module 依次 import 指定测试文件；不执行全仓 runner
- **结果**：9/9 文件通过
- **范围**：agent/doupo-agent-ui 下；这些是脚本级 assert 测试，9表示文件数而非断言数。
  - `self/self-runtime.test.mjs`
  - `self/self-ops.test.mjs`
  - `self/self-decide.test.mjs`
  - `host/mvu-arbiter.test.mjs`
  - `host/self-mvu.test.mjs`
  - `host/db-tables.test.mjs`
  - `host/db-bridge.test.mjs`
  - `host/host-storage.test.mjs`
  - `index-chat-lifecycle.test.mjs`

- **检查**：node --input-type=module 内存 repro；无 repro 文件
- **结果**：R1零数量复活；R2拒绝仍改字段；R3空境界撤销失败；R4MVU重生成ID失效；R5DB往返丢字段；R6跨聊天DB写；R7跨聊天仲裁；R8并发镜像重号；R9导入件不一致；R10撤销换ID；R11opId重生成掉账；R12跨聊天延迟回调；R13冷恢复guard拒绝；R14合法更新被忽略；R15恢复后重复累计。
- **范围**：只内存假宿主/实际模块纯逻辑，不代表真实 ST 运行验收。

## 逐文件 Coverage
`reviewed`=本切片源码已完整阅读；`partial`=仅部分阅读，即使测试执行通过也不冒充审完；`excluded`=不存在或本次未纳入。整体 coverage_status=partial。

| 路径 | 状态 | 原因 | 证据 |
|---|---|---|---|
| agent/doupo-agent-ui/self/goal-data.js | reviewed |  | 全 57 行；追踪 addGoal、恢复、数据库 decode 共用 normalizeGoal，明确 title/text 分离与截断边界。 |
| agent/doupo-agent-ui/self/self-ops.js | reviewed |  | 全 159 行；注入预算、条目编号、行囊上限、fence/裸 JSON 提取、解析/剥离。 |
| agent/doupo-agent-ui/self/self-decide.js | reviewed |  | 全 127 行；决定提示、JSON schema、输入截断及 12 条操作限制、解析状态。 |
| agent/doupo-agent-ui/self/self-runtime.js | reviewed |  | 全 588 行；逐类操作、去重、容量、ID、撤销、同楼重生成、restore/reset、流水；R1-R5/R10-R11/R15 内存证据。 |
| agent/doupo-agent-ui/self/self-runtime.test.mjs | partial | 读过开头和断言/测试结构，并非逐行审完全部 240 行。 | 离线完整执行通过；现有断言不能排除本报告新复现边界。 |
| agent/doupo-agent-ui/self/self-ops.test.mjs | partial | 命令输出被裁剪，未逐行审完全部 92 行。 | 离线完整执行通过；输出提取/预算测试已定位。 |
| agent/doupo-agent-ui/self/self-decide.test.mjs | partial | 命令输出被裁剪，未逐行审完全部 63 行。 | 离线完整执行通过；提示/schema/解析路径已对应源码。 |
| agent/doupo-agent-ui/host/mvu-arbiter.js | reviewed |  | 全 502 行；JSONPatch/旧 _.set 仅审计、时间戳、各链解析和差分、异步落账；R4/R7/R14。 |
| agent/doupo-agent-ui/host/mvu-arbiter.test.mjs | partial | 仅定位 import、部分测试/断言，未逐行审完 531 行。 | 离线完整执行通过；R4/R7/R14 为额外内存复现，不在原通过结论之内。 |
| agent/doupo-agent-ui/host/self-mvu.js | reviewed |  | 全 199 行；完整中文字段载荷、get/replace 整帧写、fallback、latest 目标及状态接口。 |
| agent/doupo-agent-ui/host/self-mvu.test.mjs | partial | 读过测试安全性及部分断言，未逐行审完 196 行。 | 离线完整执行通过；未执行宿主 MVU，fallback 落盘及整帧并发仍缺运行时证据。 |
| agent/doupo-agent-ui/host/db-bridge.js | reviewed |  | 全 297 行；ensure/模板整包、CRUD/fallback、adopt、callback debounce、onChatChanged；R6/R8/R12。 |
| agent/doupo-agent-ui/host/db-bridge.test.mjs | partial | 读过内存假 API、开头及断言/安全性结构，未逐行审完 288 行。 | 离线完整执行通过；预检拒绝为测试日志，非测试失败；新增 R6/R8/R12 未落测试文件。 |
| agent/doupo-agent-ui/host/db-tables.js | partial | 核心编解码/协调/迁移已逐段阅读；部分表定义 DDL、常量与辅助段未完整阅读（尤其 91-334）。 | 重点 335-545、589-964 及关键前部；R5/R8/R9/R13 比较/往返；源生成视图 12 表与初始化 JSON 全对象比较。 |
| agent/doupo-agent-ui/host/db-tables.test.mjs | partial | 仅 import/断言定位和安全性检查，未逐行审完 563 行。 | 离线完整执行通过；未运行会写初始化件的 build-db-template。 |
| agent/doupo-agent-ui/host/host-storage.js | partial | 已读 436-626 的聊天存储实现；大部分默认设置及 mergeSettings 未逐行读完。 | 重点 selfState/saveSelfState/chatState/clean，按当前 context 读写并 await saveMetadata。 |
| agent/doupo-agent-ui/host/host-storage.test.mjs | partial | 仅部分断言/安全性定位，未逐行审完 234 行。 | 离线完整执行通过；真实 saveMetadata 的写盘/报错不在本次权限范围。 |
| agent/doupo-agent-ui/host/state-persistence.js | reviewed |  | 全 56 行；按 session\|branch 保存 orchestrator 快照，history 截 40；不保存 selfRuntime 私有 lastFloor/opIdMemory；saveMetadata 未 await。 |
| agent/doupo-agent-ui/host/state-persistence.test.mjs | excluded | 目录清单未发现该同名测试文件；关联 orchestrator/commit recovery 测试未纳入执行。 | 没有将不存在的直接测试计为通过。 |
| agent/doupo-agent-ui/tools/build-db-template.mjs | reviewed |  | 全 63 行；只静态读结构自检与 writeFileSync 输出位置；未执行。当前注释 10 表与实际 12 表不一致，但不是本报告核心缺陷。 |
| agent/mvu/README.md | reviewed |  | 全 22 行；作为声明而非线上安装事实；旧初始化件已标废弃。 |
| agent/mvu/纳戒变量结构脚本.js | reviewed |  | 全 64 行静态阅读；命名空间、字段类型、预填、clamp、注册入口；远程 import 不加载不执行。 |
| agent/mvu/纳戒MVU套件.json | reviewed |  | 五条全部字段静态遍历，规则和输出格式正文完整阅读；初始化禁用，YAML/字符串整表和 JSONPatch 通道。未导入。 |
| agent/斗破纳戒MVU初始化.json | reviewed |  | 全 48 行静态结构审查；旧版平键 [值,说明] 形式、disable=true，README 已标归档；不把它当当前命名空间初始化执行。 |
| agent/斗破Agent数据库桥接表.json | reviewed |  | 427 行 JSON 结构全对象解析及与 buildBridgeSheets() 内存结果深比较；12 表；定位旧记忆列/导出开关差异，不执行脚本不重新生成。 |
| agent/doupo-agent-ui/index.js | partial | 8826 行超出本切片可全读量；只审关联恢复、落账、持久、生命周期和 continuation。面板各入口未穷尽。 | 120-146、186-258、315-365、711-855、1135-1151、1285-1360；R13 提取实际 dbStateAdoptable 纯函数在内存验证。 |
| agent/doupo-agent-ui/index-chat-lifecycle.test.mjs | partial | 仅开头/结构定位并执行，不是逐行审查全部 145 行。 | 离线完整执行通过；不证明 DB/MVU 异步支线已隔离。 |
| agent/doupo-agent-ui/run-tests.mjs | reviewed |  | 全 32 行；发现实际测试为 import 执行。未运行全仓 runner，仅同方式导入本切片 9 个测试。 |

## Refactor Signals

- **module**：self/self-runtime.js + host/mvu-arbiter.js
- **threshold**：多个P1共同指向撤销基线/变更提交边界，但不构成重写授权
- **evidence**：仲裁按当前结果算差分，runtime再撤旧版本；撤销不可逆及不持久。应先确认每楼原子提交契约，再选一个局部修复。

- **module**：host/db-bridge.js + index.js
- **threshold**：并发与跨聊天数据正确性门禁未通过
- **evidence**：镜像/收养任务未绑定聊天身份或版本；LLM已有 continuation，但 DB/MVU支线没有同等护栏。

## Slimming Opportunities

- **pattern**：State Duplication
- **occurrences**：3
- **suggested_handling**：chatMetadata 母账、DB有损投影、MVU有损投影；不是删掉镜像，而是明确哪些字段允许回拉及其事务边界；Needs Gate。

- **pattern**：Compatibility Path
- **occurrences**：3
- **suggested_handling**：旧 equipped 迁移、旧目标表、旧 InitVar归档均 Do Not Touch Yet；未完成动态/外部引用安全审查，不建议删除。

## Do Not Touch Yet

- **scope**：所有实现/真实聊天/配置/导入件
- **reason**：本次无实施或数据修复授权；不能运行生成器来消除本报告差异。

- **scope**：MVU远程注册库、SillyTavern/数据库脚本真实API
- **reason**：禁止浏览器/联网执行；本报告不以本地假API证明真实宿主协议。

- **scope**：容量 prune 与格式兼容
- **reason**：代码明确采用最旧淘汰与多格式输入；可能是有意策略，需产品契约与恢复门禁后再改，不能按风格删。

## Verification Gates

- **check**：针对 R1 的只读回归测试：消耗全栈及 restore/DB往返
- **scope**：首个最小 Local Fix 候选；禁止复活任何零数量物品。

- **check**：R2-R5/R10-R11/R15 回归：原子拒绝、精确撤销、同楼/恢复幂等
- **scope**：self状态正确性；测试必须比较完整快照及ID，不只数量。

- **check**：受控调度注入暂停点：A->B->A及旧/新镜像交错
- **scope**：R6-R8/R12；ensure/CRUD/fallback/adopt/MVU read-write每个await。

- **check**：冷恢复矩阵及全字段DB roundtrip
- **scope**：R5/R13；缺本地/缺时间戳/冻结DB/较新本地/只有DB，未入表字段不得被整份覆盖。

- **check**：内存生成模板与提交JSON深比较，不写输出文件
- **scope**：R9及所有初始化字段/DDL/exportConfig。

- **check**：后续另获授权的真实 ST 集成验收
- **scope**：实际MVU事件时序、message latest定位、setMvuVariable fallback是否落盘、异步 saveMetadata、DB CRUD失败/存储帧回放；本次明确未执行。

## Optimization Handoff（仅一个候选）

- **module**：agent/doupo-agent-ui/self/self-runtime.js
- **evidence**：R1 确定性复现：整栈3-3留0，restore变1。
- **threshold**：Local Fix
- **suggested_gate_mode**：Local Fix Only
- **behavior_contract_hints**：只修 removeItem 数量校验与归零删除，合法消耗原子生效，非法消耗无副作用，撤销保留原条目ID及数量。
- **patch_budget**：一个行为路径，实现+既有测试，通常1-2文件，目标<80行；如牵出撤销整体重构则重新GATE。
- **pre_change_baseline**：本次9文件通过+R1失败；开始前重跑self-runtime.test.mjs并加入边界断言。
- **verification_gate**：全栈/单件/非法count/同楼撤销/restore及DB往返；完整快照无零栈。
- **deletion_safety**：不删除模块/兼容路径，只允许删除已耗尽的目标条目；真实数据不修改。
- **forbidden_scope**：不改DB表结构/初始化JSON/配置/index/MVU协议，不做其他13项并发批量修复；需用户明确实施授权。

## Optimization Eligibility
Needs Gate；先修数据正确性，Reject Optimization（不做纯瘦身）。

## Gate Recommendation
报告到此停止。只推荐 R1 为首个 Local Fix / Local Fix Only 候选，不授权实施。跨模块一致性问题应另立行为契约和受控调度测试，不能把本报告当批量重构批准。

## Residual Risk / 下一轮入口
- 此切片不是全仓审查；coverage 逐文件保留 partial，未将输出被裁剪或仅执行测试的文件标成 reviewed。
- 未运行全仓测试、构建、浏览器、模型生成、真实MVU、实际数据库、真实metadata写盘；不能据9/9离线通过声称交付验收完成。
- index.js UI手动入口、全部导入/动态引用、关联 orchestrator/commit-recovery 测试未穷尽；下一轮从这些 partial 行继续。
- 实际数据库API是否对单个CRUD绑定源聊天需要宿主证据；当前bridge调用接口不传聊天身份，内存受控调度证明保护缺失而非声称真实存档已串写。
- MVU setMvuVariable fallback只改内存、不替换落盘的语义目前仅有源码注释声明，未在宿主查证，因此未把它作为确定性P1。

本任务未创建 repro 文件。内存复现通过 node --input-type=module 临时输入运行；未修改任何实现以制造/消除失败。JSON 保留 merge schema 的完整 coverage、findings、证据、门禁及单候选交接。
