# 世界 / 影响 / 沙盒审查分片

## Routing Decision

- **模式**：`full-scan / general`，只读 `AUDIT → SWEEP → REPORT`，没有进入实现阶段。
- **根目录**：`C:/Users/86158/Desktop/异界转生录/doupo`。
- **快照**：2026-11-04；HEAD `1dee86edb89a8f6efc4b8bbd8192a3a9c1017748`，审查对象为当前脏工作树，不是 HEAD。范围内已有用户修改，8 个旧沙盒文件已删除，未恢复它们。
- **写入边界**：仅本 Markdown 和同名 JSON。未修改实现、配置、真实存档；未浏览器、未真实模型调用。内存假 `generateQuietPrompt` 不联网。
- **A0 回执**：工程技能 `code-quality-workflow`；路由同名；加载 `ST-A0`；资料快照 `2026-08-18`；设计候选为空。目标、红线、验收均沿用本次指令。
- **结论**：3 项 P1、11 项 P2；没有 P0/P3。11 个现存范围测试文件全部通过，但新增内存反例证明边界有缺陷，不能将“测试通过”解释成生产验收通过。

## Findings

### Must Fix Now

#### F01 · P1 · 挂起的场记结果可在换聊天后写入新会话

- **位置**：`agent/doupo-agent-ui/index.js:3228-3288`，重点 `3258`。换聊天清理在 `233-239`。
- **触发**：A 会话调用影响选条，响应挂起；切换到 B 并清空/恢复 B 的通道与台账后，A 的旧响应返回。
- **证据**：`await pickImpactsForPrompt` 之后直接写缓存和全局提示通道，没有会话、账本版本或模式代次复验。纯内存实际输出 `injected`，`doupo_impact` 为 `【世界影响 · 本局世界线】\n· A会话私有事实写入B`。世界/影响记录员在 `4032/4450` 的 continuation 检查不覆盖此场记路径。
- **影响**：新会话正文携带上一会话世界事实。停用、编辑或手动改账期间的迟到响应也有相同覆盖路径。
- **建议**：复用现有 continuation（异步结果是否仍属于当前场景的凭据），增加账本版本与模式代次校验；相同签名的挂起请求合并，陈旧响应不写缓存和通道。
- **验收**：延迟假场记，发出 `CHAT_CHANGED` 并恢复 B 后释放 A；A 必须 stale，B 通道不受影响。另测停用、改账、重生成和两个同时调用。

#### F02 · P1 · 存档恢复忽略归档最大编号，影响 ID 碰撞

- **位置**：`impact/impact-runtime.js:679-684`，重点 `681`；`unarchive` 在 `467-475`。
- **触发**：最大影响编号只存在归档，不在活跃库；保存恢复后新记一条，再找回旧归档条。
- **证据**：`seq` 只从 `state.records` 接续。内存 `i1 → forget → snapshot/restore → record → unarchive i1` 后得到两条不同内容的 `id=i1`。找回时未检查活跃库重复 ID。
- **影响**：`ref`、`parent` 和选条 Map 定位歧义；按 ID 的删除或集合操作可能误伤多条。
- **建议**：活跃和归档共同决定编号接续；恢复/找回校验唯一性，不能为消除碰撞就静默改写旧引用。
- **验收**：最大号只在归档、活跃库为空/非空、反复保存恢复再新增/找回，全部编号唯一且已有引用含义不变。

#### F03 · P1 · “正式沙盒口径”只有内存记录，旧档缺字段时直接采用全局开关

- **位置**：`sandbox/sandbox-mode.js:24-25,93-94`；`index.js:7237-7245,6947`。
- **触发**：已确认分支模式与全局设置不同后重载；或全局开放世界已开，打开没有模式记录的旧主线存档。
- **证据**：模块只有 Map，无快照/恢复接口。入口对 `agentSandboxMode` 的引用没有保存/恢复接线，sync 仅由设置改动调用；没有记录时 `sandboxModeActive()` 直接读全局 `enableSandboxMode`。新建模式实例读取原 scope 实际为空。方案 `60-70` 的正式状态和老档默认主线合同没有落地。
- **影响**：续聊丢失确认结果、惯性和切换历史；旧档可能未经本局确认进入开放世界。
- **建议**：通过既有聊天存储保存/恢复模式、惯性和历史；新开局初始化与旧档缺字段分开处理，后者默认主线，不把全局设置等同正式授权。
- **验收**：A 主线、B 沙盒分别确认，重建模块与重开聊天保持各自模式；旧档缺字段且全局开关开启仍主线；确认切换不回退事实、代价和关系。

### Refactor Signals / 已确认 P2

#### F04 · 模式确认只存任务版本，不复验，也不作废旧口径候选

- **位置**：`sandbox/sandbox-mode.js:50,55-67`；`index.js:5703-5709,127-137,4032,4450`。
- **触发/证据**：sync 保存 taskId/stateVersion，但 confirm 仅按 scope 取 pending，不接收/比较当前任务版本；内存旧 task/v1 的申请无需当前版本即可 switched。确认入口不调用失效逻辑，continuation 不含模式。
- **影响**：跨回合迟到确认与切换前生成的旧口径决定，可能在新模式继续生效。
- **建议**：确认时检查任务/分支/状态版本，模式切换递增代次并废弃此前未提交决定和选条，复用现有门控。
- **验收**：v1 申请后推进 v2，再确认应拒绝或要求重新确认；旧模式假请求挂起，切换后释放不落账，新模式正常落账。

#### F05 · updateTask 返回拒绝前已修改任务详情

- **位置**：`world/world-runtime.js:455-458`；人物同类结构在 `525-528`。
- **触发/证据**：任务原 detail=旧；提交 detail=不应写入、days=0，返回 `rejected/bad_days`，snapshot 的 detail 却已改变。原因是先写 detail，再验 days。
- **影响**：界面声称未生效却修改正式状态，没有成功流水/撤销与一致保存语义。
- **建议**：先在候选对象完成所有校验和变化检测，再一次写入。人物相同 attitude 但新 basis 也存在先改后判无变化的结构，需同类回归，但不因此无边界重写。
- **验收**：非法期限混合合法详情后完整业务状态不变；人物仅 basis 变化应明确成功或完全无副作用。

#### F06 · 任务更新的同楼撤销遗漏原到期日

- **位置**：`world/world-runtime.js:453-463`，重点 `463`。
- **触发/证据**：原第 2 天到期，同楼更新 days=10 后该楼重生成成空操作；detail 回到旧值，`endDay` 实际仍为 10。虽然保存了 beforeEndDay，undo 只带 detail。
- **影响**：新正文没有延期，任务仍获得旧版本额外期限。
- **建议**：撤销精确恢复绝对 endDay 和 detail，包括原本无期限的 null，不用当前日期反推 days。
- **验收**：同楼更新 detail+days 后重生成空操作，两个字段完全恢复；增加跨天和 null 场景。

#### F07 · 同楼先撤销、再按旧 opId 去重，重放结果消失

- **位置**：`world/world-runtime.js:620-634`；`impact/impact-runtime.js:538-552` 同结构。
- **触发/证据**：同 floor=3 两次相同 addEvent/opId=x；第二次先撤掉第一次，opIdMemory 却仍有 x，新操作跳过，结果 `noop, duplicate=[x]`、事件列表为空。
- **影响**：幂等重试从一次有效退化为零次；影响运行时同样有这条可达路径。
- **建议**：识别相同批次纯重试，或撤销时同步撤回该批次去重记忆；先统一行为矩阵，不直接造公共基类。
- **验收**：world/impact 各测同楼同 ID、同楼新内容、跨楼同 ID，结果保持一次或明确替换，不能删空。

#### F08 · 当日找回的逾期归档条被成熟扫描水位跳过

- **位置**：`impact/impact-runtime.js:203,467-475,543,684`。
- **触发/证据**：第 1 天记 ripen=2 后归档，第 5 天 unarchive，再同日空 apply；实际 `active=1,due=1,ripened=0,dueIds=[]`。apply 先扫到期再找回，之后 `day<=sweptDay` 永远跳过本日。restore 也直接把水位设为存档日。
- **影响**：到日子仍要额外等一天或手动处理，面板成熟状态与正文到期判断不一致。
- **建议**：恢复/新增待扫条使扫描失效，或按需扫 active 到期条，不仅按日期假定库内容没变；恢复时同步世界时钟。
- **验收**：当天找回过期条、恢复当日应成熟 active 存档，无需再推进游戏日即可成熟，流水只记一次。

#### F09 · 自动成熟不属于同楼撤销，时钟回滚后仍已发酵

- **位置**：`impact/impact-runtime.js:203-216,538-543,547-567`。
- **触发/证据**：第 1 天记 ripen=2，floor3/day5 空 apply 成熟；同楼改为 day1 空 apply，仍 ripened，ripenedDay=3。sweepDue 直接改状态，结果只有 dueIds，没有 undoSteps。
- **影响**：正文重生成成没有跨日，影响仍提前应验；与世界事件的到期撤销行为不一致。
- **建议**：将本轮时钟导致的成熟纳入对应楼可逆变更，区分既有提交成熟与本次新成熟。
- **验收**：世界推进触发成熟后同楼改为不推进，该影响回 active 并清成熟日；其他楼已确认成熟不被抹除。

#### F10 · schema 重复 level 键把势力档次限制成氛围枚举

- **位置**：`world/world-decide.js:64,67`；调用 `index.js:4029`。
- **触发/证据**：JavaScript 后一个 level 覆盖前一个；实际 schema 的 level 只有 `calm/rising/storm`，不能表达提示词里的“加玛帝国一流”。现有测试只查键是否存在。
- **影响**：严格结构化输出连接可能不能返回合法势力档次，或被迫填氛围值。没有真实调用提供商，不能断言所有连接必现。
- **建议**：按操作区分 setFaction.level 与 setTension.level 的 schema，消除重复键。
- **验收**：离线 schema 校验中，势力实力自由文本有效，氛围 rising 有效、bad 无效。真实接口待另行授权。

#### F11 · 场记缓存键不能区分多轮相同开头和世界变化

- **位置**：`index.js:3241-3250`。
- **触发/证据**：长聊达到固定 recent floors 数量，账本 version/day 不变，两幕玩家输入前 80 字相同但后文、地点或角色回复不同。签名不含真实楼号、正文内容、地点、world 版本及 prompt 参数，因此可相同并直接复用旧注入。原两轮测试因账本 version 改变而未覆盖。
- **影响**：新场景沿用上一幕的选条，改模型提示设置也可能不立即生效。
- **建议**：准确键包含 scope、回复/草稿身份、相关世界版本和生成参数；与飞行请求共享键，不序列化无限账本。
- **验收**：固定账本/day，足量最近楼后使用同前 80 字不同后文/地点/回复，必须重选；同一幕重复拦截仍只调用一次假模型。

#### F12 · 待发酵安排绕过台账预算，全部送入场记

- **位置**：`impact/impact-select.js:104,110,127-128`；`index.js:1972`。
- **触发/证据**：账本不限条数，积累大量待成熟安排。主台账有 1800 字/30 行限制，pending 却直接全量 map/join。内存测量：1 条输入 339 字符，1000 条输入 29243 字符。
- **影响**：输入成本和长度随库存线性增长，可能超上下文或增加延迟；未测真实模型耗时。
- **建议**：待发酵区共用总字符/条数预算，优先当前场景关联及临近到期条，明确省略数量；不能为省提示词删账本。
- **验收**：0/1/1000/10000 条输入均满足确定上限，关键条保留，省略可见，存储记录不减少。

#### F13 · 新增对象预算、节点宽限设置没有现行链消费者

- **位置**：`index.js:6093-6094,4038`；`sandbox/sandbox-world.js:47-49`；`world/world-runtime.js:417-432`。
- **触发/证据**：设置沙盒新增对象预算为 0 或改节点宽限。生产检索字段仅命中界面，当前 sandbox 只有 mode/world 提示，节点/线索引擎工作树已删除；世界决定仍直接最多 12 操作 apply，没有沙盒新增预算。界面“窗口开始/结束自动发生”的惯性说明也与现行动态提示的强/中/弱世界运转口径不同。
- **影响**：无效设置让玩家误以为新增对象与节点窗口受硬约束；不能把方案 SB03–05、SB10、SB12 当通过。
- **建议**：先如实标注未实现，或经授权隐藏无效设置/旧窗口说明。完整预算/节点应另行定范围，不擅自恢复已删除模块。
- **验收**：若提供预算，0/1 下不越界，超额有明确队列/拒绝；若不提供，界面不再宣称可调。节点窗口行为独立验收，关键词测试不算数。

#### F14 · 世界级传闻失去未证实标记，台账没有 certainty

- **位置**：`impact/impact-ops.js:23-24,43-46,97-117`。
- **触发/证据**：runtime 合法的 weight=world、certainty=rumor 组合。impactMark 先返回 ★，永远到不了 ？；脚本注入只用该标记，场记/记录员台账从未输出 certainty。标题/详情即使没“传闻”二字也合法。
- **影响**：高影响传闻的未证实边界丢失，下游可能当成事实，不能依赖生成文字碰巧自带“坊间传”。
- **建议**：权重与可信度独立表达，如 ★？或明确“传闻·未证实”；台账始终传递可信度，不自动升级 certain。
- **验收**：world/major/minor × certain/rumor 矩阵，脚本注入、台账和 picks 路径都保留未证实语义，普通世界级事实仍有 ★。

## 每功能状态

| 功能 | 状态与证据 |
|---|---|
| 时钟、分钟进位、四季 | 离线正常路径通过。累计超过 99999 天的格式化/恢复边界未测，不单列猜测缺陷。 |
| 事件双域、标题、地点、预定、置顶、了结 | 正常测试通过；事件容量裁剪后的完整撤销未验证。 |
| 任务 CRUD、期限、存档 | 正常测试通过；F05/F06 确认。逾期任务继续 active 并显示已逾期，不将未规定的自动失败当 bug。 |
| 势力档案与人物 | 留空保旧、更新、恢复通过；F10 schema 问题；人物仅依据变化需回归。 |
| 世界传闻与到期事件 | 未证实标记、到期扫除、单次推进重生成恢复已有测试通过；多次时钟操作组合撤销未验。 |
| 重生成与幂等 | 简单同楼路径通过；F06/F07/F09 边界失败。刷新后 lastFloor 恢复不在既有测试。 |
| 影响登记、修复、因果链、相似去重 | 正常 record/adjust/ripen/close/revert、链深与 260 条无淘汰测试通过。 |
| 影响选条、成熟、档案找回 | 正常两轮与内存存档通过；F01/F02/F08/F09/F11/F12 确认。 |
| 影响可信度 | F14 确认，不等于世界事件传闻实现也有此问题。 |
| 沙盒模式确认/续聊 | 同实例确认取消与分支隔离通过；F03/F04 确认。 |
| 沙盒剧情来源与主链绑定 | 开放世界跳过扩展设定索引，正文换内置基线，世界决定另附惯性/自主性。没有证明宿主原生世界书也被禁用。 |
| 节点、探索与目标 | 当前范围无六态节点、可达性/在场/亲见转述推测、目标失败取舍等完整实现；设计方案明确未冻结，作为未实现/未验证差距，不一律报回归。 |
| 预算与并发 | ops/picks 数量有界；world/impact 记录员有 busy+continuation；场记跨聊、输入预算、沙盒对象预算存在上述问题。全局 quiet 队列问题由入口分片负责，不重复归属。 |

## 文件覆盖

下列路径均相对根目录；JSON 提供同一 inventory。`reviewed` 仅代表源码完整审阅，不等于真实宿主验收。

| 文件 | coverage | 证据/边界 |
|---|---|---|
| agent/doupo-agent-ui/world/world-decide.js | reviewed | 完整 144 行，提示/schema/输入/解析。 |
| agent/doupo-agent-ui/world/world-decide.test.mjs | reviewed | 完整 71 行，离线通过。 |
| agent/doupo-agent-ui/world/world-ops.js | reviewed | 完整 217 行，注入/排序/预算/提取。 |
| agent/doupo-agent-ui/world/world-ops.test.mjs | reviewed | 完整 154 行，离线通过。 |
| agent/doupo-agent-ui/world/world-runtime.js | reviewed | 完整 699 行，状态与撤销，内存反例。 |
| agent/doupo-agent-ui/world/world-runtime.test.mjs | reviewed | 完整 322 行，离线通过。 |
| agent/doupo-agent-ui/impact/impact-decide.js | reviewed | 完整 176 行，决定合同与喂料。 |
| agent/doupo-agent-ui/impact/impact-decide.test.mjs | reviewed | 完整 72 行，离线通过。 |
| agent/doupo-agent-ui/impact/impact-ops.js | reviewed | 完整 155 行，台账/注入/可信度/节奏。 |
| agent/doupo-agent-ui/impact/impact-ops.test.mjs | reviewed | 完整 86 行，离线通过。 |
| agent/doupo-agent-ui/impact/impact-runtime.js | reviewed | 完整 732 行，登记/成熟/档案/恢复与反例。 |
| agent/doupo-agent-ui/impact/impact-runtime.test.mjs | reviewed | 完整 284 行，离线通过。 |
| agent/doupo-agent-ui/impact/impact-select.js | reviewed | 完整 218 行，选条过滤/预算，输入规模测量。 |
| agent/doupo-agent-ui/impact/impact-select.test.mjs | reviewed | 完整 136 行，离线通过。 |
| agent/doupo-agent-ui/sandbox/sandbox-mode.js | reviewed | 完整 97 行，模式确认/历史/内存寿命。 |
| agent/doupo-agent-ui/sandbox/sandbox-mode.test.mjs | reviewed | 完整 71 行，离线通过；未覆盖重载。 |
| agent/doupo-agent-ui/sandbox/sandbox-world.js | reviewed | 完整 55 行，基线/惯性/自主性；未核原著。 |
| agent/doupo-agent-ui/sandbox/sandbox-world.test.mjs | reviewed | 完整 54 行，关键词/4000字上限通过。 |
| agent/doupo-agent-ui/impact-flow.test.mjs | reviewed | 完整 170 行，固定 JSON 假模型两轮通过。 |
| agent/doupo-agent-ui/impact-live.test.mjs | reviewed | 完整 83 行，内存宿主冒烟通过，非真酒馆。 |
| agent/09-沙盒模式功能方案.md | reviewed | 完整 274 行；建议/未冻结边界单列。 |
| agent/doupo-agent-ui/index.js | partial | 读 90–155、210–242、285–345、365–384、470–490、730–770、1930–2085、3180–3335、3345–3357、3580–3630、3920–4055、4375–4485、5680–5778、7100–7140、7230–7250；相关引用与6090–6094设置经搜索。未读其余约8千行入口，不冒充全读。 |
| agent/doupo-agent-ui/sandbox/sandbox-engine.js | unread | 当前工作树删除，未读 HEAD 旧版。 |
| agent/doupo-agent-ui/sandbox/sandbox-engine.test.mjs | unread | 当前工作树删除，未读 HEAD 旧版。 |
| agent/doupo-agent-ui/sandbox/sandbox-goals.js | unread | 当前工作树删除，未读 HEAD 旧版。 |
| agent/doupo-agent-ui/sandbox/sandbox-goals.test.mjs | unread | 当前工作树删除，未读 HEAD 旧版。 |
| agent/doupo-agent-ui/sandbox/sandbox-leads.js | unread | 当前工作树删除，未读 HEAD 旧版。 |
| agent/doupo-agent-ui/sandbox/sandbox-leads.test.mjs | unread | 当前工作树删除，未读 HEAD 旧版。 |
| agent/doupo-agent-ui/sandbox/sandbox-nodes.js | unread | 当前工作树删除，未读 HEAD 旧版。 |
| agent/doupo-agent-ui/sandbox/sandbox-nodes.test.mjs | unread | 当前工作树删除，未读 HEAD 旧版。 |

现存范围 21 文件完整读取；入口 partial；8 个已删除旧文件 unread。完整仓库和入口其他内容不属于本分片完成声明。

## Tests / Verification Gates

执行 `node --test`，对象为 `agent/doupo-agent-ui` 下 world/impact/sandbox 的全部 `*.test.mjs` 与两根 impact 测试，共 **11 个文件，11 通过，0 失败，约 2.77 秒**。测试均使用 Node 内存或固定 JSON，不访问真实模型。额外通过 stdin 执行内存反例，没有新建测试脚本或写真实聊天。

修复前必须保留该基线，并补齐各发现所述回归。最低优先级顺序：

1. 跨聊天迟到场记不得写入新通道。
2. 归档 ID 唯一，保存恢复不碰撞。
3. 模式恢复、旧档默认口径与陈旧确认拒绝。
4. 拒绝无副作用、任务绝对期限撤销、opId 同楼组合。
5. 同日找回成熟与时钟回滚成熟一致性。
6. 输入规模上限与权重/可信度矩阵。

## Refactor or Slimming Signals

- **world：Refactor Backlog**。原子校验、撤销字段、幂等与撤销顺序三项有共同状态生命周期证据。先按行为局部修，不重写运行时。
- **impact：Local Fix**。先修 ID 唯一，再分别验证恢复/成熟水位；不能仅因缺陷多就推导需要推倒重写。
- **sandbox：Refactor Backlog**。模式正式记录、确认版本、异步候选代次应接既有存储与门控，不新增平行总控。
- **重复逻辑**：两个 runtime 的 lastFloor/undo/opIdMemory 有相同失败，先共享测试矩阵；现阶段未证明公共基类能降低维护成本。
- **瘦身候选而非可删代码**：无消费者的旧节点宽限设置/窗口说明，适合经授权标注或隐藏；未完成配置迁移、发布和动态引用检查，不判定为 Dead Code。

## Do Not Touch Yet

- 旧档事件短标题补全、任务/影响旧长标题恢复有兼容合同；新增上限与恢复上限不同不是重复错误。
- 正文 world 代码块与独立 decide 是可配置双通道，有调用与测试，不能删其一。
- 影响档案、手动修改标记、真实账本完整性不因提示词预算而删减。
- 八个已删除沙盒文件不恢复，不把 HEAD 旧模块回灌当前工作树。
- 方案明确为建议且未冻结，不将七项功能全部追认为实现承诺。
- core/request/host 的实现、存储和动态注册未全审，不能给出全仓删除安全结论。

## Gate Recommendation / Optimization Eligibility

**Eligible for Gate Review**，当前不获实现授权，仅推荐一个最小候选：影响存档恢复的 ID 唯一性。

- 结构决策 **Local Fix**；执行建议 **Local Fix Only**。
- 合同：活跃/归档共享唯一接续编号，保存恢复不改变既有 parent/ref 含义。
- 预算：一个行为路径、1–2 文件，目标少于 80 变更行。
- 基线：11/11 测试通过，ID 碰撞反例失败。
- 验收：归档最大号、空/非空活跃库、往返与找回矩阵。
- 删除安全：不涉及删除；禁止静默重编号破坏引用。
- 禁止范围：真实存档、配置/schema扩展、整模块重写、顺带修其他问题。任何实现须另行明确授权。

## Residual Risk / 未验证

- 无真实酒馆、浏览器、模型提供商、打包安装或完整仓库测试证据；离线通过不等于最终运行验收。
- host LLM 队列、网络重试/超时和保存失败持久性由其他分片；入口分片已负责总控关闭仍调用、self/memory未串行、quiet忙时丢轮，本分片不重复认领。
- 原生酒馆世界书是否仍注入未验证；这里只证明扩展自有原著索引路径被跳过。
- 内置沙盒基线的原著出处和全部知识准确性未验证；关键词测试不证明设定正确。
- 六态节点、可达性/在场、知识亲见/转述/推测、目标失败/取舍、超预算队列、切回主线重新对齐没有本分片运行验收。
- 容量裁剪完整撤销、跨刷新同楼重生成、多个时钟操作组合撤销、99999天边界、真实并发事件次序未执行专项验收。
