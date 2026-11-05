# 其他 UI 功能补充审查（2026-11-04）

## Routing Decision

只读 AUDIT → REPORT，整体为 **partial**。根据最后指令停止读取代码及运行验证，仅交接已有上下文。未修改源码、存档、配置；未启动浏览器、读取图片或发送 LLM。仅写指定 JSON / Markdown 报告，原有 dirty 工作区保持不动。

**验证状态纠正：没有成功执行的测试。** 此前两条试图验证并生成报告的大命令均在 Python 解析阶段失败，脚本未执行，其中的 VM 验证也没有运行。不能把计划、命令文本或静态推演写成验证通过。

## 先列函数 / 行数

指定范围共 **1846 行**，均已静态阅读：5259–5594、6507–6659、7290–8158、8159–8646。以下数字是函数声明起点，不冒充精确函数结束行。6507–6659 是设置面板事件分支，无新命名函数。

- HUD：5260 `positionOrbListPopup`；5269 `toggleOrbNpcPopup`；5274 `closeOrbNpcPopup`；5280 `openOrbNpcPopup`；5293 `buildOrbNpcPopup`；5383 `positionOrbPopElement`；5401 `positionOrbNpcPopup`；5413 `popText`；5417 `popDueLabel`；5422 `toggleOrbItemPopup`；5429 `closeOrbItemPopup`；5435 `openOrbItemPopup`；5448 `buildOrbItemPopup`；5479 `buildOrbItemPopModel`；5590 `positionOrbItemPopup`。
- 世界与记忆入口：7291 `applyWorldOps`；7299 `worldApplyFromPanel`；7310 `worldAdvanceFromPanel`；7315 `worldAddFromPanel`；7344 `worldAddTaskFromPanel`；7363 `memoryApplyFromPanel`；7374 `memoryAddFromPanel`。
- 记忆与共用详情：7419 `renderMemoryEntryList`；7498 `renderMemoryInjectionCard`；7543 `refreshMemoryPage`；7651 `openReadonlyDetailModal`；7669 `capDetailTitle`；7675 `introText`；7681 `wireRowDetail`。
- 世界列表：7691 `renderWorldEventList`；7740 `worldSetFactionFromPanel`；7766 `worldSetPersonFromPanel`；7784 `renderWorldFactionList`；7842 `fillWorldFactionDock`；7863 `renderWorldPeopleList`；7896 `renderWorldTaskList`；7945 `journalSourceLabel`；7953 `refreshWorldPage`。
- 影响：8030 `impactFormField`；8035 `openImpactForm`；8062 `closeImpactForm`；8073 `saveImpactForm`；8129 `runImpactOp`；8144 `renderImpactArchive`；8193 `buildImpactItem`；8265 `renderImpactRecent`；8286 `renderImpactLibrary`；8356 `openImpactLedger`。
- 原著：8364 `renderFactsStatus`；8439 `renderFactsLastInjection`；8479 `scheduleWorldbookSync`；8494 `describeSyncResult`；8502 `refreshWorldbookStats`；8532 `renderFactsBrowser`；8602 `listWorldbookNames`；8616 `renderWorldbookPicker`；8639 `rememberWorldbookOptions`。

## Findings

以下四项为新发现，均为 **P2、静态证据，未运行复现**。源码位置统一位于 `C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/index.js`。

### FWM-01 — 校验拒绝后仍清空登记草稿

- 位置：7407；同型路径 7337–7339、7356–7358、7757–7761、7777–7779。
- 证据：7403–7405 刚处理 `related_missing`，7407–7410 便无条件清空标题、正文、依据、关联、别名、原句、备注；7411 仅控制成功关窗。世界事件、任务、势力、人物也在检查成功状态前清空输入。
- 后果：用户本来只需修正一项，却丢掉已填写正文及出处，需要重填整表。
- 最小建议：仅成功时清空并关闭；拒绝时保留字段及选择，显示原因并聚焦问题字段。
- 验证缺口：未跑 VM、DOM 或真实宿主。

### FWM-02 — 非法时限静默当成未填，用户设定期限被丢弃

- 位置：7355；事件对应 7334–7337。
- 证据：非 1–90 整数映为 `undefined` 后仍继续 apply；任务 HTML 摘录5993为 `type=button`，帮助文字说明留空不限期，函数不对非空非法值报错。
- 后果：输入 0、1.5、91 等时，有意设置的期限被丢弃，改按运行时未提供 days 的默认行为处理；任务可能因此不限期。实际默认分支本轮未完整验证。
- 最小建议：区分空字符串和非法值；非空必须满足 1–90 整数，否则不调用 apply，并保留草稿。
- 验证缺口：已静态确认 UI 省略非法值，未跑实际提交及宿主约束行为。

### FWM-03 — 影响保存只调整状态筛选，仍可能被其他筛选隐藏

- 位置：8109。
- 证据：8108–8110 仅修正状态筛选；8291–8309 还按分量、性质、关键词过滤；8115–8116 找不到行就放弃高亮。8107 铺开全库也不能绕过这些过滤。
- 触发：大事筛选下新增小事，或保存内容不匹配性质/搜索条件。
- 后果：保存成功却看不到刚保存的记录，也不能滚动高亮，容易误认为失败并反复登记。
- 最小建议：检查所有筛选并提供“查看刚保存项”，或明确解除相关筛选，而非仅设置无限显示量。
- 验证缺口：静态可达路径确认，无 DOM 或隔离运行。

### FWM-04 — 同日记忆按编号升序，最新预览可能优先显示旧条目

- 位置：7600。
- 证据：7559 说明时间排序为新的在前；7600 在 day 相同时按 ID 数字升序；7628–7637 最新预览固定第一页。运行时180–195使用 nextId/day 登记新记忆，但 nextId 实现本轮未完整重读。
- 后果：按通常递增 ID，同日新记忆超过大6/小8后可能被旧项挤出主页。完整库仍能翻页查找，不是存储丢失。
- 最小建议：同日按创建顺序或编号倒序，与影响页8272同日倒序一致。
- 验证缺口：未执行排序反例；修复时需再次核实递增 ID 合同及跨日优先级。

## 旧问题引用与去重

旧 UI JSON 多数没有 `id` 字段，因此使用“报告名 # 原发现的一基序号”稳定引用，不虚构旧 ID；world-impact-sandbox 使用其 Markdown 已有 F 编号。以下不重复计入新 findings。

- **ui-dashboard#6**：悬浮详情条目不能用键盘激活。7681–7688 的 `wireRowDetail` 也只有 click，无 tabIndex / Enter / Space，作为跨功能补证。
- **ui-dashboard#7**：弹窗焦点和对话框语义不足。7651–7665 只读详情沿用 `openAgentModal`。
- **ui-dashboard#5**：保存失败被吞却给成功反馈。同类缺口补证到世界/记忆/影响：743–747、921–926、2061–2064 catch 吞错；7291–7295、1243–1247、8100–8125、8136–8140 不等待 saved。storage506–513、524–531、596–603 可返回 unavailable、changed_not_saved 或抛错。这里是跨功能同类问题，不宣称同一调用点，也不建立新保存问题 ID。
- **ui-dashboard#10**：旧世界书读取覆盖新选择索引。8479–8491 await 前后检查 sequence 不等于保护内部提交；与 facts-settle-history 第2项同因。
- **MU-09**：注入记录记全集且失败标成功。7498–7539 直接信任 record.entries / ids / status，UI 徽标不是独立实际注入证据。
- **MU-10**：预算装正文后再加抬头导致截断。UI 不重算最终预算，沿用旧执行链审查。
- **world-impact-sandbox#F10**：重复 level 键覆盖势力档次。手动势力字段走 runtime，原模型 schema 问题不重报。
- **world-impact-sandbox#F13**：对象预算与节点宽限设置无现行消费者。页面存在设置不证明执行链存在预算约束。

## feature_status — 逐功能六维交接

### HUD 人物详情 — static_reviewed（5264–5403）
- 字段：名字/好感/别名称号/在场重要地点身份、NPC_FIELDS 分组、近况经历流水。
- 保存：纯读 ledger，无保存。
- 确认：仅关闭，按钮有 aria-label。
- 预算：近况/经历/流水各3条，正文不统一限字。
- 分页：无分页，不是完整人物历史入口。
- 只读边界：aside/文本展示，不写账；不是权限或防剧透边界。

### HUD 通用详情 — static_reviewed（5405–5594）
- 字段：事件、任务、势力、人物、记忆、影响、冷藏、原著8类 ref，重取活数据，消失则不弹。
- 保存：snapshot/list/get，无保存。
- 确认：同条切换收起；人物与通用详情互斥。
- 预算：标题30字，正文未裁；JS 按 viewport 夹取坐标。
- 分页：无；全部列表问题沿用旧报告。
- 只读边界：原著全文不裁卷，不等于模型防剧透控制。

### 记忆/影响模型按钮和默认提示词 — partial（6507–6659）
- 字段：decide/recall/consolidate/record、默认恢复。
- 保存：默认恢复 dispatch input；模型入口仅追绑定、未执行。
- 确认：recall/impact 按钮 finally 解禁，decide/consolidate 本段不禁用；self reset另有confirm。
- 预算：按钮不建立模型预算，忙锁/会话所有权未重审。
- 分页：影响加100，档案加60。
- 只读边界：这些按钮可能调用模型并改账，不能称整页只读；本次未执行。

### 记忆手动登记 — defects（7363–7413）
- 字段：标题正文、层级标签分量、原句备注依据、关联别名。
- 保存：applyMemoryOps → persistMemory/镜像 → 刷新，不等落盘。
- 确认：显式提交；拒绝留窗却清稿。
- 预算：HTML摘录标题14/正文300；关联别名各4；runtime其他限额未全重审。
- 分页：不适用。
- 只读边界：登记是写入。引用 FWM-01、ui-dashboard#5。

### 记忆列表、筛选、预览与详情 — defects（7415–7495、7543–7648、6490–6506）
- 字段：时间/分量/标签排序、recallKeys过滤、转大/改分量/删除。
- 保存：memoryApplyFromPanel统一保存。
- 确认：删除无二次确认，当前范围未见回收站/撤销UI；转大、分量即时。此为验收边界，不另立缺合同的新bug。
- 预算：分页前全量filter/sort/findMemoryConflicts，未测复杂度/CPU。
- 分页：大6、小8，夹页；过滤排序重置0，主页固定第一页。
- 只读边界：详情仅click，键盘沿用旧号；未见全文编辑入口。引用 FWM-04、ui-dashboard#6/#7。

### 记忆注入记录 — static_reviewed_with_known_defect（7498–7540）
- 字段：来源、条数字数时间、清理状态、entries详情。
- 保存：memoryLastInjectionView纯读。
- 确认：无修改动作。
- 预算：不重算真实通道字数，不验证实际注入成功。
- 分页：entries全列，无本地分页。
- 只读边界：本轮已注入只是上游记录声明。引用 MU-09、MU-10。

### 世界事件、时钟与信息 — defects（7290–7341、7691–7737、7953–8000、6180–6221）
- 字段：near/world、分量、标题正文依据地点时限、了结置顶、clock/info。
- 保存：apply → persistWorld → 可见时refresh；拒绝原因进流水。
- 确认：了结、置顶、设时钟无二次确认；本段无事件全文编辑入口。
- 预算：推进1–365整数；期限1–90非法转undefined；事件全铺；runtime maxEvents参数10–200已定位。
- 分页：无UI分页，流水8条。
- 只读边界：详情只读，表单按钮改账；传闻详情标未证实。引用 FWM-01/02、ui-dashboard#5。

### 世界任务 CRUD — defects（7344–7359、7895–7942、6206–6210）
- 字段：标题详情依据期限、完成删除、逾期/完成日；未见编辑表单。
- 保存：统一世界保存；拒绝仍清草稿。
- 确认：完成删除无确认；本范围没有用户撤销入口。
- 预算：HTML标题20；非法期限被省略；正文无统一渲染预算。
- 分页：active优先全列，无分页。
- 只读边界：详情只读，不能称完整可编辑CRUD。引用 FWM-01/02、ui-dashboard#5。

### 世界势力 CRUD — static_reviewed_with_defects（7740–7763、7783–7860、6211–6213）
- 字段：name/stance/basis与9档案字段；同名更新、编辑预填。
- 保存：统一世界保存；拒绝清表。
- 确认：删除无确认；改name按新名登记非rename；留空保持原值是明确文案合同。
- 预算：全量sort/map；具体字段HTML上限未逐一复核。
- 分页：无。
- 只读边界：详情读、编辑写；可选档案不可清空与留空保持合同一致，不另报bug。引用 FWM-01、world-impact-sandbox#F10。

### 世界人物态度 CRUD — static_reviewed_with_defects（7765–7781、7862–7893、6214–6216）
- 字段：name/attitude必填、basis；同名更新，无预填编辑按钮。
- 保存：统一世界保存；拒绝清字段。
- 确认：删除即时无确认，恢复路径未覆盖。
- 预算：updatedDay全量排序，无UI渲染上限。
- 分页：无。
- 只读边界：详情纯文本；同名登记更新非只读。引用 FWM-01、ui-dashboard#5。

### 影响表单与状态操作 — defects（6577–6629、8002–8141）
- 字段：title/detail/target/kind/weight/certainty/evidence/eventId/canon/shift共10字段。
- 保存：仅applied才persist；拒绝保留并翻译原因；不等持久保存。
- 确认：收场、修复、删除、恢复无confirm；forget可档案恢复。
- 预算：字典20/240/40/120/60等限额交runtime；保存设MAX_SAFE_INTEGER撤销100条DOM上限。
- 分页：保存后全铺；只调整state筛选。
- 只读边界：表单改账，详情非权限隔离。引用 FWM-03、ui-dashboard#5。

### 影响列表、最近、档案与详情 — static_reviewed_with_gaps（8143–8362、6593–6604、6898）
- 字段：state/weight/kind/search、parent/children、楼层删除提示、注入徽标、归档原因。
- 保存：列表纯读，恢复调用runImpactOp。
- 确认：直接状态操作；档案可恢复，容量/ID安全沿用旧报告。
- 预算：最近默认5最多20；常规100+100；档案60+60；filter全量，保存可全铺。
- 分页：递增加载非页码；计数换聊天是否重置未追查。
- 只读边界：详情未显示evidence、canon原文与kind；归档更少，完整元数据文案需澄清，未独立报bug。引用 FWM-03、ui-dashboard#6/#7。

### 原著状态、注入记录、扫描与选择 — static_reviewed_with_known_defects（8364–8522、8601–8646）
- 字段：世界书索引、卷、通道、搜索、API绑定、预算；手动卷优先。
- 保存：扫描只读；rememberWorldbookOptions更新配置且吞save错误。
- 确认：不改世界书文件；选择改变配置/本地索引。
- 预算：status全书limit120、stats limit160，仅各自统计口径，不等于全量总数。
- 分页：名称去重，无分页。
- 只读边界：读取源世界书不写源；异步所有权沿用旧问题。引用 ui-dashboard#10/#5。

### 原著本地浏览器与详情 — static_reviewed（8524–8599）
- 字段：name/aliases/summary/content包含过滤，category/volume，uid升序。
- 保存：纯本地索引读取，无LLM无save。
- 确认：用户可选择全书，不是权限或剧透隔离。
- 预算：硬上限80并告知命中总数/前80/收窄；过滤排序先全库，未测成本。
- 分页：无下一页，依靠关键词类别卷收窄，截断明示。
- 只读边界：当前卷只筛entry.volumes，不裁entry.content；跨卷全文仍可见。手动浏览不能冒充模型防剧透保证。引用 ui-dashboard#6/#7。

### host/style.css 静态规则 — partial
- 字段：token作用域、hidden、断行、移动端、focus-visible、HUD状态/overflow与动效抽查。
- 保存：CSS不提供保存权限。
- 确认：不能补JS焦点、键盘与确认合同。
- 预算：viewport/overflow约束存在；orb整体touch-action:none的触摸滚动影响需实测，不能据静态样式断言失效。
- 分页：overflow不等于分页或DOM预算。
- 只读边界：无浏览器、图片、对比度、尺寸、溢出或视觉验收。引用 ui-dashboard#6/#7。

## Coverage / 仍未读范围

### CSS

总1003行，保守标partial。

- **实际已读**：1–26、94–134、165–182、267–279、310–325、463–496、563–587、607–628、686–720、752–794、806–820、855–887、917–945、966–1003。
- **仍未读**：27–93、135–164、183–266、280–309、326–462、497–562、588–606、629–685、721–751、795–805、821–854、888–916、946–965。
- 全文件Read超过token限制被拒绝；压缩全量大输出只被持久化，命令执行不算全文已读。598–606及629–654虽曾计划补读，但命令语法失败，不能计入。

### JavaScript及依赖

- 指定四段1846行已静态阅读，非完整index.js审查。
- 额外合同摘录：743–747、921–926、1243–1247、2061–2064、3644–3649、6180–6263、6300–6506、6840–6875、6880–6908。其余未在本分片完整复审。
- 5993/6080/6083长HTML只核字段/按钮摘录，不计完整模板已读。
- world-runtime仅保守计241–269、616–655；memory-runtime180–209；host-storage504–513、522–531、594–603。其他大输出不自动计入已读，具体见JSON。
- memory/world/impact其余运行时、实际预算执行器、模型和注入内部依旧报告，未重跑。
- 影响模块级分页计数在换聊天时是否重置未追查。
- 根style.css一致性沿用旧报告，本次不声称重新校验。

## Verification Gaps

本轮没有成功执行的VM、仓库测试、DOM、真实持久化、键盘、触摸或视觉检查。旧报告执行过的测试不计本轮执行。新发现均为静态路径证据，FWM-04仍需补核nextId递增合同。

## Refactor / Slimming Signals

无需重写UI。优先最小修复拒绝清稿、非法期限、筛选反馈及同日排序。未提出删除代码或扩大架构调整。

## Do Not Touch Yet

源码、存档、配置和原有dirty变更全部保持不动。旧报告正文/编号不改。删除缺确认、详情省略字段等作为明确验收边界，缺产品合同不滥报新bug。

## Gate Recommendation

Local Fix / Local Fix Only，但当前仅授权报告，未授权实现。

建议后续回归门：拒绝不清输入；保存失败不假报已持久保存；非法非空期限阻止apply；各筛选组合下可查看刚保存影响；同日超页大小的新记忆仍出现在最新预览。真实宿主/视觉测试须另获授权。

## Residual Risk

CSS与依赖合同仍partial。保存真实性、键盘焦点和异步会话所有权沿用旧问题，不因补充报告完成而关闭。未读范围已明确，不把静态阅读包装成运行时或视觉验收。

## A0 receipt

已加载code-quality-workflow与consult-tavernweave-library。目标、红线、六维验收从用户请求核对；输出授权仅本JSON和Markdown。A0/plugin-runtime/frontend参考提取的大输出持久化，未声称完整阅读；确定性router未运行。无设计候选、无视觉验收。
