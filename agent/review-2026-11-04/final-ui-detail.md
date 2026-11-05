# index.js UI 功能补充审查（2026-11-04）

## Routing Decision

只读聚焦补审，不修复、不重新全仓审查。只生成本文件及同名 JSON。既有脏工作树保持不动。与 `ui-dashboard.json` 及必要业务报告的全部 findings 去重。

新增 **7 项：P1 3 项、P2 4 项**。证据为源码可达链和离线原函数探针，不是浏览器或真实酒馆验收。

## Findings

### UID-01 · P1 · 非空装备槽渲染调用未定义函数

- 位置：`agent/doupo-agent-ui/index.js:1747`。
- 触发：装备栏至少一件，或旧行囊残留 `equipped=true`。
- 证据：`renderEquipmentFigure` 调用 `bodyFigureSlotOf`，全 index 只有这一次命中，导入列表和仓库 JS/MJS 搜索没有定义。1842 调渲染，1914 在整页流水刷新前无 catch 调用。提取原函数传入一条武器，抛出 `ReferenceError: bodyFigureSlotOf is not defined`。
- 影响：空装备可绕过，非空则中断纳戒页刷新。手动操作在 `applySelfOps` 中先提交保存、再刷新，可能已落账却不执行后面的完成提示和弹窗关闭。
- 最小建议：补齐或正确接入槽位解析；不是重写页面。
- 验证门：空、一件、多件、未知类型均不抛；穿上后状态反馈、关闭和流水继续执行。

### UID-02 · P1 · 穿戴转移整栈删除，第二步失败也当成功

- 位置：`agent/doupo-agent-ui/index.js:6387`。
- 证据：先 `removeItem(id)`，没有数量；再 `addEquipment`，也没有数量。6391 只判断 `applied.length`。必要调用合同显示，无 count 的 removeItem 删除整条；同名 addEquipment 返回 duplicate，批量 apply 不回滚前面成功项。
- 原函数分支加真实 self runtime 的内存反例：
  - 行囊武器 ×3 → 行囊空、装备 ×1，2 项 applied，丢失余量。
  - 已有同名装备时，再穿行囊同名武器 ×3 → 行囊空、原装备不变；1 applied、1 duplicate rejected，界面仍说“已穿上”。
- 影响：整栈或余量损失，并把部分成功状态交给保存。
- 最小建议：UI 转移以数量守恒、全成或全不成为约定；只移一件、预检冲突、失败保留源物，不能以 applied 非空代表转移成功。
- 验证门：堆叠、重复同名、卸回合并、目标容量边界；失败两侧不变，成功总数守恒。
- 去重边界：本项是 UI 转移命令构造，不重报 self-storage 的重生成撤销等问题。

### UID-03 · P1 · 切聊天保留旧人物弹窗，操作新聊天同名档案

- 位置：`agent/doupo-agent-ui/index.js:3049`。
- 触发：A 打开 Same 的档案编辑或经历弹窗，切到也有 Same 的 B，再保存或删除。
- 证据：CHAT_CHANGED 的 228–253 失效 continuation、恢复共享 ledger 并刷新列表，但不关闭模态或重建动态 profile。2766 只存姓名，没有聊天/版本。3049–3076 读取旧 DOM 全部字段，调用当前全局 ledger 的 setFields。6789–6812 和 6852–6858 同样按姓名、下标操作当前账。
- 离线反例：保留 A 的控件，把真实内存 ledger 换成 B，再调用原保存函数；B.identity 从 `B identity` 变成 `A stale edit`，持久提交调用 1 次。
- 影响：无需悬挂模型请求即可跨聊天覆盖同名人物；旧经历下标也可能删掉 B 的不同内容。
- 最小建议：变更弹窗绑定 chat/branch、epoch 与记录版本；切聊关闭并失效旧操作，提交前复查。静态停靠草稿也应明确归属。
- 验证门：A→B、A→B→A，旧控件保存/删除零跨作用域写入；同聊后台版本变更不被整表覆盖。
- 已证与未知：函数写错当前账已由探针证明；聊天事件不关闭模态来自源码。真实宿主是否额外自动关闭扩展模态尚未验收。
- 去重边界：不是已报的文件导入或经历精简异步请求入口。

### UID-04 · P2 · 天材地宝“移除”缺少操作映射

- 位置：`agent/doupo-agent-ui/index.js:6364`。
- 证据：1583–1586 生成 `treasures:id` 移除按钮；6364 的映射没有 treasures，虽 runtime 已有 removeTreasure。6366 不执行 apply，6370 仍关闭弹窗。
- 原分支探针：`treasures:z1` → apply 调用 0、关闭弹窗 true。
- 影响：条目没有删除，也没有失败提示。
- 最小建议：接上现有 removeTreasure；未知类型/编号不要静默关闭。
- 验证门：有效条目删除一次并保存；未知目标显示失败，其他清单删除不回归。

### UID-05 · P2 · 手动账本操作不等待保存结果

- 位置：`agent/doupo-agent-ui/index.js:3079`；关联 848–855、921–927、2290–2306。
- 证据：持久包装只吞 Promise 拒绝，调用方不 await；人物保存立即显示“已保存”并重建弹窗，补丁和冷藏勾选也直接报告完成。host-storage 的保存合同明确有 unavailable、changed_not_saved 及拒绝分支。
- 原函数探针：保存返回 unavailable 或 reject，均仍返回 updated、重建编辑页，没有保存失败反馈。
- 影响：内存更新被当作持久完成，重载可能丢账而无提示。探针不证明实际硬盘丢失，只证明 UI 不等待、不反映失败。
- 最小建议：区分内存更新、保存中、持久完成与失败；失败时保留可恢复输入和重试能力。
- 验证门：saved/unavailable/changed_not_saved/reject 四类；延迟保存切聊不污染新聊天反馈。
- 去重边界：仅新增核对的纳戒、人物、经历、冷藏、记忆账本路径，不重复已有 API 方案设置保存 finding。

### UID-06 · P2 · 破坏性删除一击提交，缺少确认或可见撤销

- 位置：`agent/doupo-agent-ui/index.js:6854`。
- 证据：档案按钮只标 is-danger，直接 remove、persist。ledger 的 remove 直接 `records.delete`，不归档。经历 ×、纳戒移除/称号 ×、记忆删除的实际处理链也无确认；通用模态委托仅开关弹窗。运行时内部 undo 不是玩家手动删除的可见恢复入口。
- 影响：整档含经历/流水的误删立即进入保存，关闭弹窗不能恢复。这是数据保护缺口，不是审美要求。
- 最小建议：至少对整档及不可恢复内容做具名确认或可靠撤销；取消零写入。称号、数量归零等较轻操作按明确策略分级，不要求所有动作统一弹确认。
- 验证门：取消时 remove/save 均为 0；确认只删目标；若采用撤销，约定窗口能恢复完整内容。

### UID-07 · P2 · 记忆登记被拒绝后仍清空草稿

- 位置：`agent/doupo-agent-ui/index.js:7407`，由范围内 6506 追入。
- 证据：7391–7402 提交后，7403–7405 对 related_missing 只改 placeholder；7407–7410 无条件清空标题、正文、依据、关联、别名、原文、备注。只有关闭弹窗受 rejected 条件控制。
- 原函数探针：输入有效标题/正文、返回 related_missing 拒绝，七个文本字段仍被清空。
- 影响：没有成功登记时，长文草稿已丢，不能只补漏字段再试。
- 最小建议：仅成功后清空；拒绝时保留全部输入并定位缺失字段，不改业务校验。
- 验证门：关联缺失、正文超长等拒绝后原值不变；成功才清空一次并关闭。

## Coverage

`agent/doupo-agent-ui/index.js` **仍为 partial**。

完整逐行新增读取闭区间：**1450–1935、2530–3104、6299–6506、6705–6839，共 1404 行**。

必要调用点完整摘读：

`1–110, 115–153, 216–263, 840–866, 918–929, 1140–1194, 1240–1264, 1295–1319, 1330–1372, 1400–1449, 2163–2270, 2290–2316, 2418–2448, 2524–2529, 3105–3173, 3965–3983, 4670–4755, 6018, 6025, 6140–6198, 6840–6905, 6950–6973, 7330–7415, 7440–7478`。

6060–6066 只抽查表单 input/select/option 属性，不计为长 markup 整行完整读取。全文件符号搜索不等于全文审查。

必要依赖均为 partial：

- self-runtime：1–88、170–188、304–350、393–410、491–532、570–588，只核对 UI 调用合同。
- npc-ledger：20–105、596–613、634–692，字段元数据和写入 API。
- host-storage：1–12、536–604，仅持久保存返回值合同。
- memory-runtime：213–265，仅删除与内部撤销。
- self-ops：只检索 24–25、66–74 装备相关合同。
- ui-dashboard.json：全文已读；self-storage、npc、entry-lifecycle、memory-unified、world-impact-sandbox 只解析并读取全部 findings 以去重，不声称这些报告全文复审。
- 浏览器、图片、dev/shots：排除。

## feature_status：逐功能六项核对

下列六项分别是：**来源；校验/API；保存；反馈；切聊/异步；删除确认**。JSON 保留对应独立字段及 limits。

### 纳戒身份、境界、金币、称号与初始化

- 来源：snapshot/status 的 profile、realm/stage、gold、titles；初始化读取 data-self-init。
- 校验/API：setProfile/setRealm/setGold/addTitle/removeTitle；金币整数非负；初始化只提非空，金币正数取整。
- 保存：applySelfOps→persistSelf→saveSelfState，另发 DB/MVU 镜像；不等保存，UID-05。
- 反馈：applied/rejected；称号成功清输入；刷新回写身份/境界/金币控件，无 dirty 标记。
- 切聊/异步：操作同步读取当前账，切聊刷新；初始化停靠表单未清，宿主保存时序未验。
- 删除确认：称号 × 无；身份清空由显式设置提交。字段长度/上限属既有业务分片。

### 功法、斗技、装备、天材地宝、行囊、丹方、目标

- 来源：八类 snapshot 清单；固定字段和目标 title/text；行囊按穿戴/数量、目标按完成/优先级排序。
- 校验/API：各类 add 操作委托 runtime；新增数量只有正整数才传，否则省略走默认；改数量要求非负整数，0 表示移除。
- 保存：统一 applySelfOps/persistSelf；UID-05。
- 反馈：缺值 —、失效编号提示；天材地宝删除缺接线 UID-04。
- 切聊/异步：详情持 list/id 而无聊天作用域，旧模态可能指向新聊同 id 条目。
- 删除确认：移除、数量归零无；craft 无删除按钮，不把不存在功能当缺陷。

### 装备槽位、空槽挑选与穿脱

- 来源：equipment 合并旧 items.equipped；七身体槽位。
- 校验/API：picker 仅武器/防具/饰品匹配三个槽；穿上两操作、卸下两操作，旧 equipped 只翻标记。
- 保存：统一落账保存；转移没有全成功判断。
- 反馈：applied 非空即成功；UID-01 渲染异常、UID-02 数量/失败路径。
- 切聊/异步：闭包和 id 未绑定聊天。
- 删除确认：穿脱不是要求额外确认，而应保证失败不丢源数据。头/手/腰/足无 picker 候选是能力边界，未以美观另报问题。

### 炼制开工、成丹、炸炉、目标达成

- 来源：crafts 的 status/count/startDay/endDay 和 goals 的 done/title/text。
- 校验/API：名称必填，count/days 正整数才传；finishCraft/finishGoal；出炉不自动入包且有提醒。
- 保存：applySelfOps/persistSelf，UID-05。
- 反馈：成功清空关闭、拒绝显示原因。
- 切聊/异步：直接入口无 await，旧模态仍未绑定作用域。
- 删除确认：完成/达成立即提交，目标移除无确认；craft 不提供移除。无效开工参数省略而非表单错误，未新造业务 finding。

### 纳戒手动决定、默认提示词恢复

- 来源：当前聊天、原著与快照；按钮触发决定。
- 校验/API：开关、连接、busy 预检及输出解析；默认提示词派发 input。
- 保存：决定保存不等待；通用设置 await saveSettings 并有序号保护。
- 反馈：按钮禁用至 finally，失败有状态。
- 切聊/异步：capture continuation，模型返回与错误时复验 current。
- 删除确认：不适用。未运行模型，unified 退役语义不重复复审。

### 记忆分页、分量、晋升、删除、手填

- 来源：按钮 tier/delta/id/nextWeight；表单七文本字段及 tier/tag/weight。
- 校验/API：页码非负；setWeight/promote/forgetMemory；标题正文空值早退，其余委托 runtime。
- 保存：applyMemoryOps/persistMemory，UID-05。
- 反馈：拒绝写流水；手填拒绝仍清草稿 UID-07。
- 切聊/异步：直接入口同步；镜像异步属业务分片。
- 删除确认：无，UID-06。只追必要调用，不宣称分页整页已全审。

### 人物列表、总簿筛选搜索、最近活动

- 来源：ledger list/status；姓名、别名、称号、身份；最近活动按 log 最大楼层。
- 校验/API：在场/不在场/重要筛选；input 重置60条，每次更多加80。
- 保存：只读无须保存；状态按钮另列。
- 反馈：空簿/无匹配分开提示，更多显示真实剩余条数。
- 切聊/异步：刷新当前列表；注入记录来源未复审。
- 删除确认：列表不直接删，开详情后 UID-06。未做性能测量，计数跨聊保留不作缺陷。

### 人物三页完整档案与编辑

- 来源：NPC_FIELDS 按 bundle 分组；别名、称号、在场、位置在抬头/chips；重要度有独立按钮，虽其索引组不在编辑表单。
- 校验/API：enum/list/text/things/triples/secret 控件与解析；setFields 处理所有页面控件，清空即清空。
- 保存：persistNpcLedger，UID-05。
- 反馈：updated 重开 basic，unchanged/失效有提示；先写的“已保存”节点随重建被移除。
- 切聊/异步：未绑定聊天与记录版本，UID-03。
- 删除确认：整档无，UID-06。竖线格式可逆性未探测，列未知而非已证问题。

### 人物经历添加、删除、精简与流水

- 来源：exp 逆序、day、原下标；流水逆序最多30，最新标记取当前聊天楼层。
- 校验/API：正文必填，正整数日期否则当前世界日；addExp/removeExp；精简解析后预览，确认 replaceExp。
- 保存：添加、删除、确认后调用保存但不等待。
- 反馈：成功重开经历页，空正文改 placeholder；not_found/invalid_index 没有明确失败反馈。
- 切聊/异步：旧表单/下标 UID-03；精简跨聊已在 npc.json 报告，不新增。
- 删除确认：经历 × 无，精简有确认替换和放弃。同聊追加/裁剪后旧下标删除目标待专测。

### 人物 JSON 补丁、在场/重要切换、世界书重抽

- 来源：JSON textarea、当前 record、原著条目。
- 校验/API：JSON 语法/空 payload 校验；applyNpcLedgerPayload；切换由当前 record 算 next；重抽最多8人。
- 保存：有创建/变更才保存；重抽 filled 后保存。
- 反馈：语法、空、忽略字段消息；完成清空关闭；重抽禁用按钮、改文案、finally 恢复。
- 切聊/异步：重抽有 continuation 检查；部分成功后切聊提前返回的保存边界未另复现。
- 删除确认：单人重抽有覆盖确认；tooltip 说只补空，真实执行以确认和 overwrite:true 为准。英文键/嵌套保护绕过为 npc.json 既有发现。

### 冷藏名单、勾选、草稿投影

- 来源：selected、pending 预览、patch JSON、世界日、最近冷藏流水及标签。
- 校验/API：select/deselect；默认提示词派 input；草稿按钮携 preview.id，提交内部由旧分片覆盖。
- 保存：persistNpcCold，UID-05。
- 反馈：勾选消息与人物 list 立即更新；handler 未直接刷 bench/summary，后续 refreshNpcLedgerPage 才同步，此处只作观察未另报 finding。
- 切聊/异步：恢复当前 runtime 后刷新；扫描业务不复审。
- 删除确认：取消选择不是删人物；草稿有确认/放弃。

### 模态停靠与事件/设置保存

- 来源：单一 modal、dock.__dockHome，panel 的 click/input/change 委托。
- 校验/API：打开搬节点，关闭恢复隐藏；普通按钮不触发表单原生 submit 校验，按 handler 校验。
- 保存：默认提示词派 input，通用设置等待保存并区分不可用/失败。
- 反馈：关闭、背板、Escape 分层；焦点/语义为已有报告发现。
- 切聊/异步：没有关闭动态模态 UID-03；延迟保存反馈仍需宿主验收。
- 删除确认：关闭只关 UI，不撤销已提交账本操作。未使用浏览器、图片或辅助技术。

## 去重

- ui-dashboard.json：不重复导入串聊天、API 方案持久反馈、结算跟随默认、对话框/键盘/刷新、世界书索引等已有发现。
- npc.json：不重复精简跨聊天、重抽英文/嵌套保护绕过、重生成不撤销、日期与冷藏 runtime 问题。
- self-storage.json：不重复逐字段非原子校验、撤销、MVU/DB 异步与恢复问题。
- entry-lifecycle.json：不重复总控关闭仍运行、quiet 漏记、HMR 清理与自动链时序。
- memory-unified.json：不重复召回、退役 ID、数据库收养和合并版本问题。

## Verification

已执行：原函数提取 U1、U2-stack、U2-duplicate、U3、U4、U5-unavailable/reject、U6；修正探针自身问题后均得到上述反例。只创建内存 self/NPC 账本，无模型、宿主、网络或存档写入，未增加测试文件。

探针自身/工具异常单列：首轮 U4 对只读 getter 赋值造成 TypeError，改用可写 context 后重跑通过，不是产品错误；一次 Python 规范输出受 GBK 编码影响，改 UTF-8 后补读。首次报告生成命令被截断，在执行前 SyntaxError，未产生文件；随后用专用 Write 写两报告。

未执行：浏览器、图片、真实 SillyTavern、DOM 布局/焦点、全仓测试、持久恢复实测。

## Refactor / Slimming / Do Not Touch Yet

多个 UI 写入口重复缺聊天作用域和保存结果处理，但只建议独立局部修复，不建议重写，也没有据此建议删除代码。当前不进入 CHANGE。

- 不改实现、配置、存档、测试和已有报告。
- 不把静态按钮存在或投影完整当运行验收。
- 不以图标、风格、身体槽位品类不足新增审美问题。
- 业务 runtime 的独立分片保持原所有权。

## Gate Recommendation / 未知与剩余风险

结构建议 Local Fix，执行建议 Local Fix Only，但仅报告授权。优先为 UID-03 独立门控：绑定聊天分支/epoch，切聊失效模态，A→B 与 A→B→A 零跨账写入；1–2 文件、目标小于80行，另需实施授权。装备渲染/转移及保存反馈分别门控。

仍需：

1. 装备空/非空、同名冲突、堆叠守恒、卸下保真专项回归。
2. 旧人物、同 id 条目、经历下标的聊天/版本隔离回归。
3. 保存四类结果与拒绝草稿保留回归。
4. 真实宿主切聊模态、saveMetadata 时序、按钮委托、删除取消/恢复验收。

index 其余代码仍 partial；长 markup 仅属性抽查。竖线格式可逆性、同聊后台改动后的整表保存、经历裁剪后旧下标删除未专门动态探测，不并入已证 finding。保存探针不证明实际磁盘丢失。

## A0 receipt / Snapshot

- 主技能：code-quality-workflow；已加载 consult-tavernweave-library 最小路由。
- 路由：deterministic router，code-quality-workflow、write、limit 1；快照版本 2026-08-18。
- 已读：ST-A0、audit-and-sweep、plugin-runtime；没有设计候选。
- 目标/红线/验收：指定四段1404行、必要调用点、去重、coverage/findings/feature_status，index 保持 partial；不浏览器、不图片、不修实现/配置/存档，只写两报告。
- HEAD：`1dee86edb89a8f6efc4b8bbd8192a3a9c1017748`。
- index SHA-256：`76ed8e8b1f0cdb56141d0b1859ff9be54c039d4c23f26640509063ca29fa481a`，与先前 ui-dashboard 相同，开始/探针结束一致。

这是固定范围 UI 补审，不是全 UI、全仓验收或修复。
