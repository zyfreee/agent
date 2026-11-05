# UI / dashboard / settings / display 只读审查

根目录：`C:/Users/86158/Desktop/异界转生录/doupo`

## Routing Decision

- full-scan / general，限定 UI 分片；AUDIT → bounded SWEEP → REPORT。
- HEAD `1dee86edb89a8f6efc4b8bbd8192a3a9c1017748`，审查既有脏工作树，不是只看 HEAD。其他分片未冻结，行号对应读取时版本。
- 只写本报告和同名 JSON，不改源码、存档、配置。不使用浏览器或图片，不作视觉或真实运行通过声明。
- 不重复 entry 已负责的 enabled=false 仍写账、HMR 清理不一致。
- 当前 ORB_ITEMS/buildOrbPanels **实际有 12 项**，不是旧注释中的 11 项；新增行动结算不能漏审。设置内容有 13 个 section。

## Findings

共 **11 项：P1 × 1，P2 × 10**。P3 只列为瘦身建议。离线测试通过不抵消以下可达路径和反例。

### 1. P1 — 人物簿导入可能覆盖切换后的聊天

- 文件：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/index.js:6678`
- 功能/触发：A 聊天点击导入并确认，在文件选择器或 `file.text()` 等待期间切到 B，再完成读取。
- 证据：6667–6690 在打开文件选择器前确认；6678 `await file.text()` 后，6681 直接 `agentNpcLedger.load`，6683 `persistNpcLedger`，没有聊天、分支、epoch 复查。2290–2294 保存当前 ledger；127–137 已有 `captureAgentContinuation`，该入口未使用。
- 影响：A 的授权可能用于替换 B 的当前人物簿并进入当前保存路径。属于可达的数据覆盖路径；未进行真实聊天复现。
- 建议：打开文件选择器前绑定聊天/分支及续接令牌；change 和 await 后都核对。目标过期则中止，不得改写当前聊天。覆盖确认与目标聊天绑定。
- 验收：延迟 file.text 模拟 A→B，断言 B ledger 和持久化调用均零变更；同聊导入仍成功；读文件期间同聊历史变化按约定拒绝。

### 2. P2 — 原著摘要忽略嵌套开关

- 文件：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/host/control-dashboard.js:54`
- 功能/触发：`setting.enabled=false`，旧 `enableFactsLibrary=true` 或默认开启。
- 证据：第 3 行声明路径 `setting.enabled`，第 54 行却访问 `settings[key]`，没有按路径取值。纯函数反例实际输出“已开启”。测试 58–64 只使用新字段 true，未覆盖相反值。
- 影响：已关闭的原著注入仍显示开启，误导功能控制和排查。
- 建议：按路径读取新字段，仅真正缺省时回退旧字段。
- 验收：新旧字段相反、新字段 false 且旧字段缺省，均应优先采用新字段。

### 3. P2 — 总控“模型与连接”设置按钮进入空白页

- 文件：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/index.js:5655`
- 功能/触发：点击该模块卡的“设置”。
- 证据：control-dashboard.js:10 模块 id 为 llm；5655 直接写入 data-settings-page；6104–6106 未校验页面便隐藏所有其他 section。实际模型页为 hub，没有 llm；settings-template.test.mjs:22 明确禁止 llm 页。
- 影响：所有内容 section 被隐藏，呈空白页；侧栏可恢复。
- 建议：显式映射 llm→hub；未知页面回退 overview。
- 验收：逐一点击 8 张总控卡，均恰好显示一个存在的 section；未知 id 不得空白。

### 4. P2 — “恢复跟随默认”没有主动保存

- 文件：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/index.js:6245`
- 功能/触发：自定义 settle.resultPrompt 后点 data-settle-follow-default，再重载扩展。
- 证据：6244–6248 只 updateSetting、syncSettingsForm、renderSettleResultCard；5789–5815 不调用 saveSettings；通用 input 路径 6957 才 await 保存，该按钮没有派发 input 或直接保存。
- 影响：内存看似恢复，实际本路径没有主动交给宿主保存；重载可能恢复旧值，后续其他保存可能偶然掩盖。
- 建议：复用统一异步保存，明确反馈结果；保留空字符串代表“跟随默认”，不要保存默认全文。
- 验收：mock 保存接口，点击必须提交空值；重建 storage 后仍跟随默认；保存拒绝有反馈。

### 5. P2 — API 方案保存失败被吞，但 UI 宣称已保存

- 文件：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/index.js:3754`
- 功能/触发：新增、复制、删除、字段编辑或清绑定时，saveSettings 拒绝或返回未保存。
- 证据：3752–3755 fire-and-forget 且 catch 为空；3835–3837 返回内存 updateSettings 结果；6922、6933 根据 ready 显示“方案已保存”。3789 清绑定也吞失败。
- 影响：地址、密钥、绑定仅内存改变也被宣称成功，重启丢失且无排查信号。不据此宣称密钥泄露。
- 建议：保存完成结果驱动反馈，处理非 saved/reject，并区分内存更新和持久完成。
- 验收：saved/unavailable/reject 和连续编辑乱序；成功文案只对应最后一次真实保存成功。

### 6. P2 — 悬浮详情条目不能用键盘激活

- 文件：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/index.js:5183`
- 功能/触发：键盘 Tab 浏览事件、人物、记忆、影响、原著等带 ref 条目。
- 证据：5183 使用 div；5192 只设 role=button，5193 只有 click，没有 tabIndex 和 Enter/Space。5255 “全部”副窗复用该组件。
- 影响：指针可打开的核心信息详情对纯键盘用户不可达，角色声明与行为不符。
- 建议：优先使用原生 button 和合规子结构，或补齐 tabIndex/键盘语义；关闭后恢复触发器焦点。
- 验收：DOM 测试 Tab 顺序、Enter/Space、click 均只触发一次；辅助技术另作真实验收。

### 7. P2 — 弹窗缺少完整焦点和对话框语义

- 文件：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/index.js:4677`
- 功能/触发：打开设置或只读/表单弹窗，Tab 或关闭。
- 证据：5917–5919 主设置声明 aria-modal；4677–4697 子 dialog 为普通 div，没有 dialog role 或标题关联。4720 只尝试聚焦 input/textarea/select，纯只读内容不迁焦；4723–4737 关闭不恢复焦点；6963–6967 只处理 Escape，没有 Tab 圈定。
- 影响：焦点可能留在被遮挡内容、逃到聊天区；辅助技术不能正确识别子对话框，Esc 也依赖当前焦点所在。
- 建议：子 dialog 增加角色和标题关联，打开聚焦可交互项/容器，圈定当前模态焦点并恢复触发器；背景 inert 需真实宿主验收。
- 验收：只读/表单弹窗的初始焦点、Tab/Shift+Tab、Esc、关闭返回。没有视觉通过声明。

### 8. P2 — “全部”列表刷新会关闭详情

- 文件：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/index.js:5087`
- 功能/触发：“全部”中打开详情，后台状态事件调用 refreshOpenOrbPanel。
- 证据：5087 先 openOrbListPopup；5220 无条件 closeOrbItemPopup；5089 才检查已经关闭的 orbItemPopElement/ref，无法更新详情。
- 影响：后台刷新使正在阅读的详情突然消失，违背 5086 同步更新副窗和详情的意图。
- 建议：保存详情 ref，刷新列表后按有效引用重建详情；仅切栏目或目标失效才关闭。
- 验收：全部→详情→状态事件组合，详情仍在且内容更新；目标删除时明确关闭/提示。

### 9. P2 — “全部”把截断的 200 条当成总数

- 文件：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/host/orb-hud.js:98`
- 功能/触发：任意栏目有超过 200 条原始记录。
- 证据：65 行 FULL_CAP=200；97–99 先 slice 再将 total 设为截断后长度；index.js:5234 显示该总数，5255 只铺 all，无分页和截断提示。
- 影响：用户误认为只有 200 条，无法访问第 201 条以后。限制 DOM 本身有益，问题是总数和“全部”语义。
- 建议：保留真实 total，增加 truncated/hasMore、分页或完整设置页入口，保留渲染上限。
- 验收：201/1000 条时总数真实、预览仍 4 条、DOM 有界且后续内容有入口。

### 10. P2 — 旧世界书读取结果覆盖新选择的索引

- 文件：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/index.js:8707`
- 功能/触发：导入 A 等待时改选/导入 B，A 最后返回。
- 证据：8703 捕获 name；8707 await；8712–8715 无选书名、请求序号或聊天续接复查便 clear/register/load 全局供应与索引。6868–6873 允许期间改选。
- 影响：设置显示 B，实际索引被后到的 A 替换，后续检索及面板不一致。
- 建议：所有选书导入共享提交序号，提交前核对当前选书与续接身份；过期请求不得清空当前索引。
- 验收：延迟 A/B 使 A 后到，最终只能保留 B；切聊天或取消后旧请求不得提交。

### 11. P2 — 失效投影仍接受动作意图（当前未接入实际 UI）

- 文件：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/host/ui-state.js:46`
- 功能/触发：readState 为 stale/failed/loading，但 stateVersion 仍相等。
- 证据：35–49 只检查存在和版本；纯函数探针 stale+use_item 返回 accepted=true。项目 JS 检索只见 index.js:27 import、469 export 和模块自身定义，未见实际 UI 使用。
- 影响：未来消费者可能把不可用投影当可操作；当前不是已证明的实际执行漏洞，accepted 也不等于 executed。
- 建议：接入前定义只读/变更动作允许的 readState，至少变更意图要求 ready。
- 验收：逐 readState 验 use_item/start_action；stale/failed/loading 拒绝，ready 正常，版本/重复保护不回归。

## 逐功能状态

| 功能 | 状态 | 已核对与边界 |
|---|---|---|
| 总控 | 有缺陷 | nested 开关、llm 导航；scope 过滤/固定元数据稳定 |
| 世界运转 | partial | 完整投影；推进 1–365 天、apply/persist 路径已读；事件/势力/人物/任务细交互未全读 |
| 纳戒 | partial | 身份/境界/行囊/装备/炼制/目标完整投影；手动选择器已定位，实体编辑/装备确认未逐条读取 |
| 记忆存储 | partial | 大小记忆、注入和 ref 完整投影；决定/召回/合并入口已读；晋升/遗忘/分页未全读 |
| 人物簿 | 有缺陷 | 导入跨聊天 P1；导出只 JSON.stringify ledger；编辑/删除/经历等部分绑定核对 |
| 冷藏推进 | partial | 名单/新近标签/草稿完整投影；确认/丢弃和勾选入口已读；扫描与内部授权未复审 |
| 世界影响 | partial | 状态及进行中投影；新增/编辑/保存/关闭/撤销/遗忘/归档绑定清单已定位；表单/二次确认未全读 |
| 原著资料 | 有缺陷 | 异步旧书覆盖；选书/保存/默认提示词已核对；详情浏览器长列表实现未读 |
| 行动结算 | 有缺陷 | 手动按钮明确 force+preview，不占正式注入；审核/候选/对账语义清楚；跟随默认缺保存 |
| 数据镜像 | 静态投影已读 | bridge 异常/开关/MVU 投影；实际同步归其他分片 |
| 运行日志 | 静态投影已读 | 固定标签、倒序、读取 40 条；来源的跨聊天隔离未复审 |
| 开放世界 | 静态绑定已核对 | 正式 read/sync、确认/取消链已读；无 scope 明确不可用；runtime 不复审 |
| API 设置/11 连接选择 | 有缺陷 | 新增/复制/删除、密钥 password 转义、模型 datalist、删除清绑定有接线；保存成功反馈不可靠 |
| 设置持久/迁移绑定 | partial | 通用 input 先 update 后 await save，sequence 防旧文案；两条保存路径缺口；默认落点测试通过；schema 迁移内部未读 |
| 外观/显示美化用户控制 | partial | 三主题迁移、compact/showOrb 绑定；同名正则不覆盖，保留用户 disabled；四条默认全局安装，帷幕隐藏三楼外内容，通过正则面板停用并重进聊天恢复，非专属即时开关 |
| 弹窗/键盘/刷新 | 有缺陷 | role button、焦点和组合刷新问题；外点与 Esc 分层关闭存在；无视觉验收 |
| 长列表性能 | partial | 预览 4、full 200、rows 10 有上限；截断未提示；全量 sort/map 后 cap，每次收集所有 runtime，未测 CPU/布局，不宣称性能通过 |
| 敏感值 DOM/导入导出 | 有限静态核对 | key 转义后在 password value 属性，headers 为明文 textarea；这是编辑 DOM，不是加密边界；未见本范围全设置导出；人物簿 JSON 不含 API 配置；消毒器/真实错误日志未全审 |

## 逐文件 Coverage

以下路径基于 `C:/Users/86158/Desktop/异界转生录/doupo`。reviewed 只表示源码阅读，不等于真实 UI 通过。JSON 为可合并结构版。

| 文件 | 状态 | 范围和原因 |
|---|---|---|
| agent/doupo-agent-ui/host/control-dashboard.js | reviewed | 全部 1–81 |
| agent/doupo-agent-ui/host/orb-hud.js | reviewed | 全部 1–716，12 个面板 |
| agent/doupo-agent-ui/host/display-regex.js | reviewed | 全部 1–133 |
| agent/doupo-agent-ui/host/ui-state.js | reviewed | 全部 1–78，另查实际调用 |
| agent/doupo-agent-ui/host/control-dashboard.test.mjs | reviewed | 全部 1–68；执行通过 |
| agent/doupo-agent-ui/host/ui-state.test.mjs | reviewed | 全部 1–36；执行通过 |
| agent/doupo-agent-ui/host/orb-hud.test.mjs | partial | 全断言/注释检索，不是全部 533 行夹具/控制流；整文件执行通过 |
| agent/doupo-agent-ui/host/display-regex.test.mjs | partial | 1–112 已读，113–129 未逐行读；整文件执行通过 |
| agent/doupo-agent-ui/settings-template.test.mjs | reviewed | 全部 1–179；执行通过；主要为字符串断言 |
| agent/doupo-agent-ui/settings.html | reviewed | 全部 15 行 |
| settings.html | partial | 与备用模板相等由测试验证，未独立逐行读 |
| agent/doupo-agent-ui/host/style.css | partial | 131、176–177、318–320、490–496、574–578、623–625、809–818、935–937 等针对交互/减弱动态/帷幕抽查，不是 1003 行全读 |
| style.css | partial | 与 host/style.css 字节完全一致；仅一致性和对应选择器核对 |
| agent/doupo-agent-ui/index.js | partial | 详见下一段；其余未通读 |
| agent/doupo-agent-ui/host/host-storage.js | unread | 设置迁移与持久内部归 storage 分片，仅测试间接验证默认路径 |
| agent/doupo-agent-ui/host/host-storage.test.mjs | unread | 本轮未单独读取或执行 |
| agent/doupo-agent-ui/host/api-presets.js | unread | 未复审归一化内部，仅核对 index UI 管理 |
| agent/doupo-agent-ui/index-chat-lifecycle.test.mjs | unread | 本轮未读/执行，生命周期归 entry |
| dev/shots | excluded | 禁止图片/浏览器 |

index.js 已读/定向摘录范围：127–146、174–185、2290–2295、3730–3855、3870–3909、4677–4753、4982–5135、5182–5259、5595–5888、5912–5928、6100–6218、6222–6298、6507–6536、6650–6704、6840–6973、7291–7315、8647–8672、8701–8730、8778–8825。6147–6865 另检索全部 handler 选择器、await 和 confirm；4489 后定位函数清单。**其他 UI 细节、长模板、self/NPC/profile/impact 编辑与列表渲染、部分异步 wrapper 仅定位或未读，不能宣称全功能审完。**

读取快照 index SHA256：`76ed8e8b1f0cdb56141d0b1859ff9be54c039d4c23f26640509063ca29fa481a`。

## 离线验证

执行 `node --test --test-reporter=tap`，目标为以下五个文件，最后一次明确 TAP 运行结果为 **5 个文件级 subtest 通过，0 失败，退出 0，总时长 100.3896 ms**。

- host/control-dashboard.test.mjs
- host/orb-hud.test.mjs
- host/ui-state.test.mjs
- host/display-regex.test.mjs
- settings-template.test.mjs

额外纯函数反例，未修改源码：

```text
setting.enabled=false, enableFactsLibrary=true -> facts.configuration: 已开启
readState=stale, matching stateVersion, action=use_item -> accepted: true
```

settings-template 大量使用字符串匹配，因此离线通过不能反证页面导航、保存完成、焦点或异步导入问题。未新增测试文件，没有全仓测试或浏览器验收。

## 稳定项

- Dashboard 明确按 session/branch/已知 taskIds 过滤；未知 scope 不显示跨聊天审计；固定失败原因不直接展示模型输出。
- normalizeTheme 对 black/white/beige 迁移及非法值回退明确。
- 12 个面板保持只读投影；行动结算区分注入候选和已确认落账/对账。
- 显示正则的 markdownOnly/promptOnly/runOnEdit/楼位，以及同名不覆盖用户开关，已有离线断言。
- 多数已查详情用 textContent；API 模板转义；不能仅凭 password 属性宣称加密或对同源脚本保密。
- 两份 CSS 字节一致，不等于真实宿主选择器或渲染已通过。

## Refactor Signals / Slimming Opportunities

- 保存和异步提交存在多个旁路：3752–3755、6244–6248、6678–6683、8707–8715。适合后续按行为分步局部修，不建议入口整体重写。
- **P3 候选**：host/style.css:176–177 完全重复的 focus-visible 规则；获准后可去重，两份 CSS 必须同步。
- host 和根 CSS 当前是镜像。先查打包/部署所有者，再考虑单源生成；不能直接删其中一份。
- ui-state 虽未连接实际 UI，仍是导出接口，可能有外部消费者；不是已证明死代码，不删除。

## Do Not Touch Yet

- enabled=false 仍写账、HMR 清理不一致归 entry，不重复登记。
- 业务 runtime、存档、配置、构建/发布产物不改。
- 默认全局隐藏旧楼层是当前显式策略，且有正则面板停用方式；无相反契约，不直接列为缺陷或擅改默认。
- 密钥进入设置编辑 DOM 是功能边界，不仅凭 value 属性宣称 XSS/泄密。
- 未完整读取的按钮只标 partial，不以绑定选择器存在当交互通过。

## Verification Gates / 未验证

1. 加入针对 findings 的纯函数、DOM、延迟 Promise 回归：切聊天导入、旧世界书晚返回、所有卡片导航、保存失败、焦点键盘、组合弹窗刷新、真实总数。
2. storage 分片核对 schema 迁移、API 绑定默认和保存真实语义，本轮不重复内部审查。
3. 真实 SillyTavern 的 12 信息窗、13 设置 section、正则关闭/重载、隐藏历史查找、焦点/滚动/状态新鲜度仍待验收。
4. 未验证真实正则引擎、HTML 消毒器和 custom- 类名前缀行为；纯 transform 不是宿主渲染证据。
5. 无浏览器、图片、屏幕阅读器、CPU/布局性能基准或全仓测试。

## Gate Recommendation

建议只将**人物簿导入跨聊天隔离**作为下一次候选：结构决策 Local Fix；执行决策 Local Fix Only；Optimization Eligibility 为 Needs Gate。一条行为路径、1–2 文件、目标小于 80 行，需另获用户授权，本轮不进入 CHANGE。

行为合同：导入授权绑定发起聊天；切聊或失效后零写入；同聊正常导入保留覆盖确认。最小门禁为延迟读文件切聊天测试和同聊回归。禁止扩大到业务 runtime、存档迁移、总控 enabled 或全局清理。

## A0 receipt

主技能 code-quality-workflow；已加载 audit-and-sweep 与 A0。手工最小路由，未运行确定性库 router，未查询库 snapshot 版本，不伪造版本或设计候选。目标是两份证据报告；红线为不源码/不存档/不配置/不浏览器/不图片、不重复 entry 既有两问题；验收是 coverage、功能状态、发现证据和未验证边界齐全，离线结果单列。

## Residual Risk

本分片 source coverage 仍为 partial，不代表全仓或全 UI 验收完成。既有工作树修改保留。本轮仅写授权的 ui-dashboard.json 和 ui-dashboard.md；无视觉或真实运行通过声明。
