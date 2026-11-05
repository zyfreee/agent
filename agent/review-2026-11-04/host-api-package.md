# host-api-package 只读审计分片

## Routing Decision

- 根目录 `C:/Users/86158/Desktop/异界转生录/doupo`；`full-scan / general`，只代表本分片，不代表全仓完整审查。
- HEAD `1dee86edb89a8f6efc4b8bbd8192a3a9c1017748`。审的是已有修改/未跟踪文件的工作区，非纯 HEAD；其他分片可能同时工作，未声称冻结整个目录。
- 只写本 `.md` 和同目录 `host-api-package.json`。未改源码、配置、存档；未读真实用户 settings/secrets；无浏览器、网络、真实模型调用。
- A0 receipt：`code-quality-workflow`，`ST-A0`，资料快照 `2026-08-18`，无设计候选；目标、禁区、验收沿用用户授权，不扩展实施。

## Findings

### Must Fix Now

#### P1 — 消息未落地，回执仍称已观察到

- 文件 `agent/doupo-agent-ui/host/message-adapter.js:81`，相关 `79-86`、`37-44`。
- 触发：宿主 `sendMessage` 或 slash 返回 `undefined`、但未新增消息；实现仍返回 `observed:true` 并合成本地 ID。纯内存复现 `chat:[] + sendMessage:async()=>undefined`，结果成功/已观察，`chat.length` 仍为 0。
- `update` 在渲染、保存均抛错时，也仅凭自身对数组的赋值返回 `observed:true`，已复现。此处不声称已在真实宿主发生持久化丢失。
- 契约证据：README `agent/doupo-agent-ui/README.md:195` 要求回读确认、否则不提交；入口 `index.js:685` 使用该适配器；`core/commit-recovery.js:35,55-56` 以 observed 推进提交。
- 风险：未证实显示的正文可以打开状态提交门，内容与状态证据脱节。
- 建议：获得稳定宿主消息身份并回读确认；不认识的结果返回未确认，区分数组修改、显示确认和保存结果。
- 验收：补专用适配器测试，覆盖无操作/undefined send、slash、渲染/保存失败、成功新增/更新、并发插入；确认未观察消息不得提交状态。真实 API 另行验收。

#### P1 — 并发采样覆盖不能还原原始宿主设置

- 文件 `agent/doupo-agent-ui/host/llm-client.js:65`，相关 `53-69,496-511`。
- 每次调用独立保存“当前”共享设置，再无条件恢复；跨 await 的覆盖窗口没有统一所有者或串行化。
- 协调者已复核的纯内存复现：原 temperature `.7`；A 临时 `.2`，B 临时 `.9`；先 A 完成再 B，最终 `.2`，非 `.7`。本分片交叉核实源码，未重复运行该复现。
- 风险：并发后台调用互相污染采样，随后主生成也可能沿用残留值；未声称写入真实设置文件。
- 建议：临时设置整个生命周期统一持有/串行化；或使用已证实可用的单次参数，避免共享修改。
- 验收：两种完成顺序、部分参数交叠、失败/超时/取消及正文重叠；最终准确恢复原设置，各调用不继承别人的临时值。

### P2 — quiet 取消仅结束本地等待，底层仍可能运行

- 文件 `host/llm-client.js:504`，相关 `255-269,496-511,610`。
- `generateQuietPrompt/generateRaw` 先调用，`withTimeout` 才检查 signal；协调者已复核预先 aborted 仍启动生成，本分片核实源码。
- quiet 超时/取消没有底层取消回调，finally 却立即减 busy、恢复采样；成功路径的 500ms grace 在抛错时跳过。入口 `index.js:277,282,303` 使用 busy 区分静默事件。
- 风险：取消后仍耗模型工作；迟到事件可能被视为正文事件。真实宿主迟到事件误分类尚未运行复现，不能当作已经发生。重试 sleep 同样不订阅 abort，可能延迟取消。
- 建议/验收：生成前检查 abort；底层操作真实结束前保持所有权，使用受支持的取消机制；退避等待可取消。预取消应零调用，deferred quiet 超时后发迟到事件不得触发普通轮收尾。

### P2 — 鉴权头按大小写敏感合并，违背覆盖语义

- 文件 `host/llm-client.js:294`，相关 `316,324,534`；`api-presets.test.mjs:34-37` 接受大写 `Authorization`。
- 代码默认生成小写 `authorization`，附加参数用对象 assign/spread。实际客户端注入假 fetch 后，将传入头构造成 `Headers`，得到 `Bearer default-test, Bearer override-test`，并非覆盖值。未联网，均为合成假凭据。
- 风险：常见大写鉴权头成为重复/合并值，网关可能拒绝。不是已证实的密钥泄漏。
- 建议：按 HTTP 头大小写不敏感合并，两条模型接口统一使用最后写入值。
- 验收：Authorization 各种大小写、x-api-key 大小写、模型列表请求；逻辑头名应只有一个有效值。现有测试只测小写覆盖。

### P2 — YAML 接受半份文档，并静默改变流式值类型

- 文件 `host/api-presets.js:197`，相关 `179-181`。调用者忽略 parseBlock 的已消费行号。
- 内存结果：`{top_k: 20, top_p: 0.9}` → `{top_k:'20, top_p: 0.9'}`；`stop: [a, b]` → `{stop:'[a, b]'}`；`top_k: 20\njunk\ntop_p: 0.9` → `{top_k:20}`。
- 风险：界面看似填了参数，请求却漏项或发送错误类型；解析失败返回 null 的说明无法覆盖“部分成功”。
- 建议：要求全量消费，明确拒绝不支持语法并显示错误；若选择成熟解析器，先单独审批依赖，不在审计内替换。
- 验收：多键 flow map、嵌套 flow、垃圾尾行、列表对象续行、转义引号/注释、科学计数；非法输入不得部分套用。

### P2 — 拉取模型没有截止时间，按钮可能永久等待

- 文件 `host/llm-client.js:326-328`；入口 `index.js:3852-3860,3884-3885`。
- listModels 无计时器，只有可选调用者 signal；UI 不传 signal，开始禁用按钮，仅 finally 恢复。永不兑现的 fetch fixture 保持 pending；25ms 观察不等于超时证据，缺失截止时间由源码证明。
- 风险：慢网关/卡住响应体导致按钮一直禁用，状态停留在拉取中。
- 建议/验收：对请求头及 body 读取都设置截止时间，面板销毁/替换可取消；never-fetch、never-json、取消与迟到返回测试，必须恢复 UI 且不更新旧卡片。

### P2 — 空写入清理失败，却记录 cleared:true

- 文件 `host/prompt-injection.js:85-86`，相关 `clear:75-76`。
- 纯内存宿主先写 `old`，再对清空抛错：`write({text:' '})` 返回 empty，last 标记 cleared=true，容器仍是 old。单测分别检查 clear 失败，但未测组合路径。
- 风险：旧注入可能继续附带在后续提示词，设置页却显示清理成功。
- 建议/验收：传播 clear 的 failed/unsupported，保留未清理诊断；失败后重试成功才能标记已清理。测试空写失败、重试成功、重复清理幂等。

### P3 — 安装文档“当前清单引用”已过时

- 文件 `INSTALL.md:19-20`；实际 `manifest.json:8,19` 是根 `index.js/style.css`，文档写模块内路径。
- 根入口转发使现状不必然坏，但故障排查/发布检查可能定位错文件。
- 建议：写清根入口及其模块实现/备用样式关系；不删除兼容入口。验收与解析 manifest 对照，并运行 package/template 测试。

## 逐文件 Coverage

| 路径 | 状态 | 本次证据/剩余 |
|---|---|---|
| `host/llm-client.js` | partial | 1-110、190-726；连接与请求生命周期完整追踪，111-189 提示词/规范化未完整逐行审 |
| `host/llm-client.test.mjs` | partial | 运行通过；检查主要段落/标签，不冒充678行全部断言已审 |
| `host/api-presets.js` | reviewed | 全310行，YAML/参数/方案与头路径 |
| `host/api-presets.test.mjs` | partial | 运行通过；1-121分段检查，长断言片段部分截断 |
| `host/message-adapter.js` | reviewed | 全99行；投递/更新/丢弃/能力，内存反例；未发现独立 message 测试文件名 |
| `host/prompt-injection.js` | reviewed | 全119行；幂等键、预算、位置角色、清理/恢复 |
| `host/prompt-injection.test.mjs` | reviewed | 全73行且执行通过 |
| `host/capability-preflight.js` | reviewed | 全29行；基础事件能力与版本格式 |
| `host/capability-preflight.test.mjs` | reviewed | 全17行且执行通过 |
| 根 `manifest.json/index.js/settings.html/INSTALL.md` | reviewed | 22/12/15/34行全部读取 |
| `extension-package.test.mjs` | reviewed | 全23行且执行通过 |
| `demo-turn.mjs` | reviewed | 全173行，未执行；固定模型逻辑+内存存档+合成投递确认 |
| `run-tests.mjs` | reviewed | 全32行，未执行全runner；顺序import、累计失败、进程退出码 |
| 根 `README.md` | partial | 连接、API Key、版本及离线/实机验收段落；非全篇 |
| 模块 `README.md` | partial | 连接/方案/适配器/测试/运行边界段落；非全部玩法文档 |
| 模块 `index.js` | partial | 8826行中仅相关连接/投递/注入/事件/停用调用方；详见JSON coverage |
| `core/commit-recovery.js` | reviewed | 全82行，仅为确认 observed→提交证据门 |
| 根 `.gitignore` | reviewed | 源码发布忽略规则；不能证明已跟踪/已发布内容安全 |
| `host/host-storage.js` | unread | 归其他分片，未碰真实设置/秘密 |
| 模块 `settings.html/settings-template.test.mjs` | unread | 未做模板副本相等/完整UI契约验收 |
| dev/真实设置/秘密/存档内容 | excluded | 明确禁止或不在分片；不据此泛报安全 |

以上 host/ 与包工具相对路径基于 `C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/`；根路径已特别注明。JSON 提供每文件机器可合并状态、理由和证据，不覆盖这些 partial/unread。

## 逐功能状态

- **连接优先级**：governAll 且全局 custom 完整时最高，并清空单次 overrides；否则单次 hint → mode → 旧布尔。自定义调用缺项继承全局（包括空白 key）；tavern 无 quiet 时可能回落完整全局端点，或仅凭 context 判为 configured。是源码实际行为，不把注释的“只看 quiet”当完整验证。未绑定方案返回 undefined 后仍取全局 mode，与旧设置迁移/UI的组合尚未完整审验。
- **协议/参数**：OpenAI 拼 `/chat/completions`；Anthropic 拼 `/v1/messages`、x-api-key、独立 system、拼文本块。仅 provider 明确 anthropic 才走该协议，空白按 OpenAI；“自动判断”未证明。主体合并→排除→头覆盖顺序稳定，头大小写问题见上。方案 0=不指定、非负惩罚范围是既有规范化，不单凭负数支持差异报缺陷。
- **密钥路径**：方案中 key 经清洗进入 custom，请求头鉴权；自定义方案空 key 按现有注释/测试继承全局。未读取任何真实 key；不把此设计擅自判为泄漏。日志有80条上限、副本读取，不主动记录提示词/回复，但会收集截断错误文本，任意远端错误的脱敏未验证。
- **超时/取消/重试/quiet事件**：custom 测试证明截止时间覆盖 json body 且 abort controller；quiet 与并发问题见上。emptyRetry 无天花板是测试560明确约定，不独立报bug；长等待不响应取消已并入生命周期边界。busy 在入口事件监听中确有使用，但迟到事件真机语义未验。
- **消息**：addOneMessage→sendMessage→slash；前者对长度/末条文本检查，后者无条件确认。update/discard 是数字下标、无task身份校验；已标注 stale-index/切聊天测试门，未证明可达错误调用，不额外夸大。
- **注入**：固定key覆盖，SYSTEM/IN_CHAT、scan=false、深度0..100、usedIds最多24；正常空写清空，预算<=0有意不限。换聊天/生成结束有清理调用。停用/仍在飞的interceptor等完整生命周期未验，不宣称全部幂等通过。
- **能力/版本**：ready只代表 getter+事件on/removeListener+event_types，不保证LLM/消息/注入支持或最低版本。坏semver变null但仍ready是明确测试。manifest最低1.18；raw生成写明1.19且运行时守卫，不能据此认定最低版本错误。
- **runner/demo/package**：runner跳过.tmp/node_modules，按文件排序共享进程import，失败计数设退出码，无独立套件隔离/超时；不据此宣称当前套件污染。demo合成observed回执不能当真实适配器证明。包测试只检查路径、文本hook名、样式相等，不是宿主生命周期或私有数据发布门。
- **文档发布契约**：README明确离线≠实机验收，保留。模块README195仍写createChatMessages，与当前适配器实现不符，已作为投递契约差异证据。根.gitignore排除.env、原著目录、生成/临时产物，但未检查发布档案/全部跟踪内容，不做“已无私有数据”结论。

## Refactor or Slimming Signals

- 请求与模型列表重复处理头，存在同一大小写缺陷；可在单独授权后做小范围统一，不上升为新provider框架。
- quiet设置/忙碌状态跨调用生命周期缺统一所有权，优先修行为，不重写客户端。
- 根入口、镜像样式/模板、旧连接兼容路径有manifest/文档/测试依赖，不能凭重复就删除。无已完成删除安全证明。

## Do Not Touch Yet

不删兼容入口/模板/旧布尔，不改全局key继承与重试上限产品约定，不读真实配置/日志来寻找秘密，不以静态包检查替代安装验收；本轮无任何实现授权。

## Verification Gates

- 已执行且通过：`host/llm-client.test.mjs`、`host/api-presets.test.mjs`、`host/prompt-injection.test.mjs`、`host/capability-preflight.test.mjs`、`extension-package.test.mjs`，**5/5测试模块**，不是全仓断言数量。
- 本分片内存复现：YAML三个反例、无消息却确认、更新渲染/保存失败仍确认、失败清理伪成功、实际客户端头大小写合并；假fetch/假凭据，无网络。
- 协调者提供并已复核：预取消quiet仍启动、并发temperature最终恢复错误；本分片源码印证，未重复复现。
- 未执行：全runner、demo、浏览器/真实LLM、宿主安装和版本API核验、完整模板测试、发布私有数据清单门。用户禁止的真机工作不越界代做。

## Gate Recommendation / Optimization Eligibility

只选 **message-adapter投递确认** 作为首个候选：`Local Fix / Local Fix Only`，目标1条确认路径、通常1-2文件、80行以内；先建立失败基线，再补无消息不得提交的回归。禁止扩展到manifest、配置、存档或其他游戏模块。其余缺陷单独排队，不批量开改；广泛重构/删减为 **Reject Optimization**，无重写理由。

## Residual Risk

该分片仍有partial/unread，不是完整仓库扫描；当前测试通过未覆盖上述反例。真实消息API/事件次序/最低版本兼容、停用后的注入及请求收尾、全部密钥存储/导出消费者、最终发布内容均未验。保留现有工作区修改，仅有两个授权报告为本轮有意写入。
