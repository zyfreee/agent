# Agent审查覆盖清单

范围：inventory.json记录的172个当前输入文件。reviewed=相关源码完整阅读/联合补读；partial=只读所列范围；excluded=不属当前运行时审查；并非测试覆盖率/真实验收。

最终统计：{"reviewed":132,"excluded":1,"partial":39}。全部输入哈希未改：true。

| 文件 | 类型 | 行数 | 最终状态 | 说明/证据 |
|---|---|---:|---|---|
| `INSTALL.md` | documentation | 35 | reviewed | host-api-package.json: Read all 34 lines; Git clone installation, template fallback and outdated current manifest references. |
| `README.md` | documentation | 74 | reviewed | coordinator-final.json: Read complete 1-74; compared current settings/default runtime and package docs. |
| `agent/09-沙盒模式功能方案.md` | documentation | 275 | reviewed | world-impact-sandbox.json: 完整274行；明确是建议且未冻结（4、215、217-229、255-259行）；不把全部建议当已承诺实现 |
| `agent/doupo-agent-ui/.tmp-hub.txt` | documentation | 151 | excluded | 已读的旧静态UI片段，未发现生产引用；不计当前运行时审查；未授权删除。 |
| `agent/doupo-agent-ui/README.md` | documentation | 253 | reviewed | coordinator-final.json: Read 1-240 in inventory stage and 234-253 at final review; contradictory legacy/unified/DB authority and past acceptance wording retained as documentation finding. |
| `agent/doupo-agent-ui/core/agent-modules.js` | source | 35 | reviewed | core-request.json: 完整读取34行；显式适配器白名单、注册失败撤销、dispose。 |
| `agent/doupo-agent-ui/core/agent-modules.test.mjs` | test | 35 | partial | core-request.json: 离线完整执行通过；抽查注册/计划/撤销断言。 |
| `agent/doupo-agent-ui/core/audit-log.js` | source | 25 | reviewed | core-request.json: 完整读取24行；白名单/字段投影/容量/过滤；setting_drift内存复现。 |
| `agent/doupo-agent-ui/core/audit-log.test.mjs` | test | 22 | partial | core-request.json: 完整执行通过；抽查上限、事件和清空断言。 |
| `agent/doupo-agent-ui/core/commit-recovery.js` | source | 83 | reviewed | core-request.json: 完整读取82行；prepare/证据/取消/commit/reconcile/容量，内存复现。；host-api-package.json: Read all 82 lines solely to trace observed evidence contract: markMessage advances journal on observed=true; commit refuses unverified message. |
| `agent/doupo-agent-ui/core/commit-recovery.test.mjs` | test | 45 | reviewed | core-request.json: 完整读取44行并离线执行；错误消息、取消、证据丢失和版本冲突。 |
| `agent/doupo-agent-ui/core/coordinator.js` | source | 80 | reviewed | core-request.json: 完整读取79行；activeTask、终态与会话/分支/版本隔离。 |
| `agent/doupo-agent-ui/core/coordinator.test.mjs` | test | 30 | partial | core-request.json: 完整执行通过；抽查状态/事件/非法输入。 |
| `agent/doupo-agent-ui/core/data-contract.js` | source | 82 | reviewed | core-request.json: 完整读取81行；字段唯一/type/writer/readers、显式迁移注册与候选输出。 |
| `agent/doupo-agent-ui/core/data-contract.test.mjs` | test | 23 | partial | core-request.json: 完整执行通过；抽查writer/type/迁移断言。 |
| `agent/doupo-agent-ui/core/facts-pipeline.test.mjs` | test | 213 | partial | core-request.json: 完整执行通过；人物簿过滤、目录注入、全过滤和兼容路径断言。 |
| `agent/doupo-agent-ui/core/impact-engine.js` | source | 95 | reviewed | core-request.json: 完整读取94行；条件/推测/归因/版本/容量/清分支；未证明生产调用可达性。 |
| `agent/doupo-agent-ui/core/impact-engine.test.mjs` | test | 38 | partial | core-request.json: 完整执行通过；事件去重、容量、清分支断言。 |
| `agent/doupo-agent-ui/core/module-runner.js` | source | 188 | reviewed | core-request.json: 完整读取187行；登记、计划、启用、依赖、状态权限、预算与取消。 |
| `agent/doupo-agent-ui/core/module-runner.test.mjs` | test | 108 | partial | core-request.json: 完整执行通过；计划/依赖/超时/取消等断言存在。 |
| `agent/doupo-agent-ui/core/operation-ledger.js` | source | 56 | reviewed | core-request.json: 完整读取55行；去重、重试、终态、关联身份、容量和查询。 |
| `agent/doupo-agent-ui/core/operation-ledger.test.mjs` | test | 27 | partial | core-request.json: 完整执行通过；操作去重/状态和输入断言。 |
| `agent/doupo-agent-ui/core/orchestrator.js` | source | 257 | reviewed | core-request.json: 完整读取256行；解释→授权→流水线→交付→准备→提交→保存及恢复回滚，内存复现。 |
| `agent/doupo-agent-ui/core/orchestrator.test.mjs` | test | 165 | partial | core-request.json: 完整执行通过；现有测试未捕获保存失败、占位早退或并发交付。 |
| `agent/doupo-agent-ui/core/quality-gate.js` | source | 64 | reviewed | core-request.json: 完整读取63行；字段合同/type/writer、双写、授权和claims处理。 |
| `agent/doupo-agent-ui/core/quality-gate.test.mjs` | test | 33 | partial | core-request.json: 完整执行通过；合同类型/未注册字段和candidate断言。 |
| `agent/doupo-agent-ui/core/settle-categories.js` | source | 237 | reviewed | core-request.json: 完整读取236行，含四类提示词、境界解析/阶梯、效果字段及幅度复核。 |
| `agent/doupo-agent-ui/core/settle-categories.test.mjs` | test | 98 | partial | core-request.json: 完整执行通过；类别完整性、效果过滤和非数组断言。 |
| `agent/doupo-agent-ui/core/state-store.js` | source | 100 | reviewed | core-request.json: 完整读取99行；seed/CAS/幂等/分支/追加式回滚/read复制。 |
| `agent/doupo-agent-ui/core/state-store.test.mjs` | test | 27 | partial | core-request.json: 完整执行通过；版本/提交/缺分支/参数边界断言。 |
| `agent/doupo-agent-ui/core/turn-pipeline.js` | source | 264 | reviewed | core-request.json: 完整读取263行；六阶段、输出限额、预算、候选防篡改、提交/取消/计划失效。 |
| `agent/doupo-agent-ui/core/turn-pipeline.test.mjs` | test | 152 | partial | core-request.json: 完整执行通过；候选提交/失效/质量拒绝/防篡改断言。 |
| `agent/doupo-agent-ui/core/turn-stages.js` | source | 534 | reviewed | core-request.json: 完整读取533行；设定注入、资料、规则裁定、时间、正文与汇总；对照index具体接线。；coordinator-final.json: Owner read complete source; coordinator independently reviewed90-115,140-175,190-269 and reproduced real resolveInjection→gather→assemble volume mismatch. |
| `agent/doupo-agent-ui/core/turn-state.js` | source | 113 | reviewed | core-request.json: 完整读取112行；默认合同、初始状态、字段提示、复制应用变化和摘要。 |
| `agent/doupo-agent-ui/core/turn-state.test.mjs` | test | 53 | partial | core-request.json: 完整执行通过；默认合同/初始状态/复制变更断言。 |
| `agent/doupo-agent-ui/demo-turn.mjs` | source | 174 | reviewed | host-api-package.json: Read all 173 lines; static interpreter/composer and in-memory persistence; deliver acknowledgement is a synthetic stub. Not executed; does not validate live adapters. |
| `agent/doupo-agent-ui/extension-package.test.mjs` | test | 24 | reviewed | host-api-package.json: Read all 23 lines and ran successfully; referenced files, textual hooks and root/nested style equality only, not host import/runtime or private-data packaging.；coordinator-final.json: Read complete, package checks executed as full baseline and final runner. |
| `agent/doupo-agent-ui/host/api-presets.js` | source | 310 | reviewed | host-api-package.json: Read all 310 lines; traced preset normalization, YAML/scalars/blocks/flow parsing, header and override conversion; reproduced malformed/flow YAML cases in memory. |
| `agent/doupo-agent-ui/host/api-presets.test.mjs` | test | 122 | partial | host-api-package.json: Inspected tests across 1-121 and ran module successfully; current tests cover simple YAML/JSON, IDs/limits, normalization, positive overrides and malformed first-line handling, not complete-consumption/flow-nested cases. |
| `agent/doupo-agent-ui/host/capability-preflight.js` | source | 29 | reviewed | host-api-package.json: Read all 29 lines; required event surface, semver parsing and ready/degraded semantics. Version is descriptive, not compatibility enforcement. |
| `agent/doupo-agent-ui/host/capability-preflight.test.mjs` | test | 18 | reviewed | host-api-package.json: Read all 17 lines and ran successfully; missing host and malformed-version behavior intentionally tested. |
| `agent/doupo-agent-ui/host/control-dashboard.js` | source | 82 | reviewed | ui-dashboard.json: Full text 1-81; scope filtering, themes, module configuration and navigation consumer traced. |
| `agent/doupo-agent-ui/host/control-dashboard.test.mjs` | test | 69 | reviewed | ui-dashboard.json: Full text 1-68 read; executed successfully. |
| `agent/doupo-agent-ui/host/db-bridge.js` | source | 298 | reviewed | self-storage.json: 全 297 行；ensure/模板整包、CRUD/fallback、adopt、callback debounce、onChatChanged；R6/R8/R12。 |
| `agent/doupo-agent-ui/host/db-bridge.test.mjs` | test | 289 | partial | self-storage.json: 离线完整执行通过；预检拒绝为测试日志，非测试失败；新增 R6/R8/R12 未落测试文件。 |
| `agent/doupo-agent-ui/host/db-tables.js` | source | 965 | reviewed | 原分项核心335-545及589-964，补查91-334，协调补读1-90与540-590；表定义/辅助/编解码合并覆盖完整。 |
| `agent/doupo-agent-ui/host/db-tables.test.mjs` | test | 564 | partial | self-storage.json: 离线完整执行通过；未运行会写初始化件的 build-db-template。 |
| `agent/doupo-agent-ui/host/display-regex.js` | source | 134 | reviewed | ui-dashboard.json: Full text 1-133; four definitions, registration ownership, display-only flags and transform helper. |
| `agent/doupo-agent-ui/host/display-regex.test.mjs` | test | 130 | partial | ui-dashboard.json: Fixtures, display flags, CSS contract and beginning of idempotent-registration assertions read; whole file executed successfully. |
| `agent/doupo-agent-ui/host/host-storage.js` | source | 627 | reviewed | 分项436-626 + 最终复核完整补读1-435，合并覆盖完整；不等于持久化实机通过。 |
| `agent/doupo-agent-ui/host/host-storage.test.mjs` | test | 235 | partial | self-storage.json: 离线完整执行通过；真实 saveMetadata 的写盘/报错不在本次权限范围。 |
| `agent/doupo-agent-ui/host/llm-client.js` | source | 727 | reviewed | coordinator-final.json: Final coordinator read 106-192 supplements owner read1-110 and190-726; all source sections covered. No real API calls. |
| `agent/doupo-agent-ui/host/llm-client.test.mjs` | test | 679 | partial | host-api-package.json: Executed successfully offline; inspected quiet lifecycle, raw generation, custom body timeout/cancel, parameter tests, extras and retry cases including intentionally uncapped retry contract at 560. |
| `agent/doupo-agent-ui/host/message-adapter.js` | source | 99 | reviewed | host-api-package.json: Read all 99 lines; inspected deliver/update/discard/canDeliver and fabricated acknowledgement paths; pure-memory send/update repros. No dedicated *message*test.mjs found under module tree. |
| `agent/doupo-agent-ui/host/mvu-arbiter.js` | source | 503 | reviewed | self-storage.json: 全 502 行；JSONPatch/旧 _.set 仅审计、时间戳、各链解析和差分、异步落账；R4/R7/R14。 |
| `agent/doupo-agent-ui/host/mvu-arbiter.test.mjs` | test | 532 | partial | self-storage.json: 离线完整执行通过；R4/R7/R14 为额外内存复现，不在原通过结论之内。 |
| `agent/doupo-agent-ui/host/orb-hud.js` | source | 717 | reviewed | ui-dashboard.json: Full text 1-716; all 12 current panel projections, refs, caps, ordering and settlement wording. |
| `agent/doupo-agent-ui/host/orb-hud.test.mjs` | test | 534 | partial | ui-dashboard.json: All assertion/comment matches inspected; whole file executed successfully. |
| `agent/doupo-agent-ui/host/prompt-injection.js` | source | 120 | reviewed | host-api-package.json: Read all 119 lines; channel/inspect/restore/clear/write, stable prompt key, depth/budget/scan flags; reproduced failed clear followed by falsely cleared metadata. |
| `agent/doupo-agent-ui/host/prompt-injection.test.mjs` | test | 74 | reviewed | host-api-package.json: Read all 73 lines and ran successfully; absence, flags, depth, truncation, clear and throwing-host tests. Missing empty-write clear-failure assertion. |
| `agent/doupo-agent-ui/host/self-mvu.js` | source | 200 | reviewed | self-storage.json: 全 199 行；完整中文字段载荷、get/replace 整帧写、fallback、latest 目标及状态接口。 |
| `agent/doupo-agent-ui/host/self-mvu.test.mjs` | test | 197 | partial | self-storage.json: 离线完整执行通过；未执行宿主 MVU，fallback 落盘及整帧并发仍缺运行时证据。 |
| `agent/doupo-agent-ui/host/state-persistence.js` | source | 57 | reviewed | self-storage.json: 全 56 行；按 session／branch 保存 orchestrator 快照，history 截 40；不保存 selfRuntime 私有 lastFloor/opIdMemory；saveMetadata 未 await。 |
| `agent/doupo-agent-ui/host/style.css` | ui | 1004 | partial | ui-dashboard.json: 131,176-177,318-320,490-496,574-578,623-625,809-818,935-937 inspected; byte-identical to root style.css.；final-ui-world-memory.json: 保守只计实际返回并读取的原始行范围。全文件Read因超过token限制被拒绝，后续压缩全量输出被持久化，不能把命令执行当作全文已读。 |
| `agent/doupo-agent-ui/host/ui-state.js` | source | 79 | reviewed | ui-dashboard.json: Full text 1-78; projection/version/action transitions and limits; JS caller search found import/export but no live UI use. |
| `agent/doupo-agent-ui/host/ui-state.test.mjs` | test | 37 | reviewed | ui-dashboard.json: Full text 1-36 read; executed successfully; stale readState missing from assertions. |
| `agent/doupo-agent-ui/impact-flow.test.mjs` | test | 171 | reviewed | world-impact-sandbox.json: 完整170行；假generateQuietPrompt、两轮记录与选条、顺序缓存与手改失效；离线通过 |
| `agent/doupo-agent-ui/impact-live.test.mjs` | test | 84 | reviewed | world-impact-sandbox.json: 完整83行；纯getContext内存冒烟，不是真酒馆；注入/修改/元数据恢复通过 |
| `agent/doupo-agent-ui/impact/impact-decide.js` | source | 177 | reviewed | world-impact-sandbox.json: 完整176行；记录/adjust/ripen/close/revert、传闻与因果层数提示、schema和喂料 |
| `agent/doupo-agent-ui/impact/impact-decide.test.mjs` | test | 73 | reviewed | world-impact-sandbox.json: 完整72行；离线执行通过；输入数量/每楼裁剪、坏JSON、操作过滤 |
| `agent/doupo-agent-ui/impact/impact-ops.js` | source | 156 | reviewed | world-impact-sandbox.json: 完整155行；影响摘要、注入/台账排序与预算、记录节奏 |
| `agent/doupo-agent-ui/impact/impact-ops.test.mjs` | test | 87 | reviewed | world-impact-sandbox.json: 完整86行；离线执行通过；现有预算允许保留超长首行，未测试world级rumor |
| `agent/doupo-agent-ui/impact/impact-runtime.js` | source | 733 | reviewed | world-impact-sandbox.json: 完整732行；登记去重/链深、成熟、编辑/调期、归档恢复、删楼、恢复与版本；复现ID碰撞/恢复过期条未成熟/成熟不可回滚 |
| `agent/doupo-agent-ui/impact/impact-runtime.test.mjs` | test | 285 | reviewed | world-impact-sandbox.json: 完整284行；离线执行通过；正常登记/成熟/同楼/归档/删楼；缺归档最高号恢复和成熟撤销 |
| `agent/doupo-agent-ui/impact/impact-select.js` | source | 219 | reviewed | world-impact-sandbox.json: 完整218行；选条输入、存在性/收场/去重校验、未成熟标记、输入输出预算；1000待发酵条输入测量 |
| `agent/doupo-agent-ui/impact/impact-select.test.mjs` | test | 137 | reviewed | world-impact-sandbox.json: 完整136行；离线执行通过；假JSON选条、数量与输出预算、依赖方向 |
| `agent/doupo-agent-ui/index-chat-lifecycle.test.mjs` | test | 146 | reviewed | entry-lifecycle.json: Read complete 145-line behavioral regression; covers delayed stale responses and event barrier but not busy next-turn compensation or dependent module completion.；coordinator-final.json: Read complete1-145 and ran full module runner; covers swipe-aware continuation, contradicting one raw report feature-status statement. |
| `agent/doupo-agent-ui/index-lifecycle.test.mjs` | test | 21 | reviewed | entry-lifecycle.json: Read complete test; checks absent-host lifecycle but no enabled=false generation behavior.；coordinator-final.json: Read complete1-20 and ran full module runner. |
| `agent/doupo-agent-ui/index.js` | source | 8826 | partial | 多分片按功能追踪并补查界面，长设置markup有结构清单但未逐字人工读全，不能称8826行逐行全审。 |
| `agent/doupo-agent-ui/memory/memory-consolidate.js` | source | 105 | reviewed | memory-unified.json: 全文1-104；输入title/note/quote/keys保全、输出字段与失败分支 |
| `agent/doupo-agent-ui/memory/memory-consolidate.test.mjs` | test | 69 | partial | memory-unified.json: 68行；输入备注/标题已测试，未覆盖异步提交输入变化与9把钥匙 |
| `agent/doupo-agent-ui/memory/memory-decide.js` | source | 117 | reviewed | memory-unified.json: 全文1-116；提示词/schema/user/解析12条合同与runtime对照 |
| `agent/doupo-agent-ui/memory/memory-decide.test.mjs` | test | 81 | partial | memory-unified.json: 80行；parser12条测试未联合runtime8条上限 |
| `agent/doupo-agent-ui/memory/memory-ops.js` | source | 204 | reviewed | memory-unified.json: 全文1-203；召回/渲染预算、矛盾提醒、解析剥离；真实注入边界追踪 |
| `agent/doupo-agent-ui/memory/memory-ops.test.mjs` | test | 133 | partial | memory-unified.json: 132行；预算断言只验证裁尾/至少首条，不验证最终宿主字符串与诊断记录 |
| `agent/doupo-agent-ui/memory/memory-recall.js` | source | 141 | reviewed | memory-unified.json: 全文1-140；目录、用户输入、ID过滤与空/坏返回合同 |
| `agent/doupo-agent-ui/memory/memory-recall.test.mjs` | test | 88 | partial | memory-unified.json: 87行；72行明确固化缺ids当empty；无跨聊天cache测试 |
| `agent/doupo-agent-ui/memory/memory-runtime.js` | source | 418 | reviewed | memory-unified.json: 全文1-417；操作、清洗、恢复、退休、同楼撤销、总结与调用侧；离线边界复现 |
| `agent/doupo-agent-ui/memory/memory-runtime.test.mjs` | test | 214 | partial | memory-unified.json: 213行；现有测试通过，缺ID复用、同楼opId、退休窗口及账本版本边界 |
| `agent/doupo-agent-ui/narrative/facts-index.js` | source | 363 | reviewed | facts-settle-history.json: 通读 1-362；索引、嵌套注释、别名、卷归属、catalog/search/matchTokens；catalog 截断内存复现。 |
| `agent/doupo-agent-ui/narrative/facts-index.test.mjs` | test | 67 | reviewed | facts-settle-history.json: 读取 1-66；离线执行通过；覆盖嵌套名、卷回退、重载清空。 |
| `agent/doupo-agent-ui/narrative/facts-library.js` | source | 176 | reviewed | facts-settle-history.json: 通读 1-175；来源登记/修订、复核、范围查询、角色已知限制；3 个独立内存复现。 |
| `agent/doupo-agent-ui/narrative/facts-library.test.mjs` | test | 56 | reviewed | facts-settle-history.json: 读取 1-55；离线通过；未覆盖 rejected 排除、修订来源元数据刷新、过滤前 limit。 |
| `agent/doupo-agent-ui/narrative/facts-select.js` | source | 293 | reviewed | facts-settle-history.json: 通读 1-292；规则/schema/解析/目录调用/二次 lookup/预算；未展示 UID 内存复现。 |
| `agent/doupo-agent-ui/narrative/facts-select.test.mjs` | test | 248 | reviewed | facts-settle-history.json: 审查断言与场景并离线执行 247 行测试文件通过；动态 picks、目录外白名单和 malformed 防御。 |
| `agent/doupo-agent-ui/narrative/history-events.js` | source | 126 | reviewed | facts-settle-history.json: 通读 1-125；载荷、失效、已提交分支、scope 刷新、解绑；旧 scope 内存复现。 |
| `agent/doupo-agent-ui/narrative/history-events.test.mjs` | test | 87 | reviewed | facts-settle-history.json: 读取 1-86 并离线通过；事件 mock、候选失效、切分支、提交后 unresolved。 |
| `agent/doupo-agent-ui/narrative/history-operation.js` | source | 42 | reviewed | facts-settle-history.json: 通读 1-41；显式 rewrite/reevaluate 与 mappingEvidence；未知事件拒绝。 |
| `agent/doupo-agent-ui/narrative/history-operation.test.mjs` | test | 24 | reviewed | facts-settle-history.json: 读取 1-23 并离线通过；显式分类与 payload/context 拒绝。 |
| `agent/doupo-agent-ui/narrative/history-restore.js` | source | 65 | reviewed | facts-settle-history.json: 通读 1-64；分支隔离、版本门、克隆、checkpoint 上限、恢复日志阻挡；确认仅内存候选恢复。 |
| `agent/doupo-agent-ui/narrative/history-restore.test.mjs` | test | 32 | reviewed | facts-settle-history.json: 读取 1-31 并离线通过；实际 createStateStore 内存 capture/restore/stale/recovery gate。 |
| `agent/doupo-agent-ui/narrative/narrative-guard.js` | source | 79 | reviewed | facts-settle-history.json: 通读 1-78；claims 引用范围、任务/状态缓存、NPC计划版本失效；明确非自然语言语义证明。 |
| `agent/doupo-agent-ui/narrative/narrative-guard.test.mjs` | test | 36 | reviewed | facts-settle-history.json: 完整读取 35 行并离线通过；缓存重放为测试明确契约、隐藏事实拒绝、清理。 |
| `agent/doupo-agent-ui/narrative/setting-supply.js` | source | 345 | reviewed | facts-settle-history.json: 通读 1-344；召回、按卷裁剪、逐层预算、整句裁剪、audit；预算测试与消费者接线核查。；coordinator-final.json: Owner full source review, coordinator checked trimToVolume1-27, assemble260 and direct scalar/object fixtures. |
| `agent/doupo-agent-ui/narrative/setting-supply.test.mjs` | test | 230 | reviewed | facts-settle-history.json: 审查测试场景与断言并离线执行通过；含 5 个 node:test 用例，非线性 counter、separator、ellipsis、未来卷摘要与无限预算。 |
| `agent/doupo-agent-ui/narrative/volume-index.generated.js` | generated | 5 | reviewed | facts-settle-history.json: 读生成头；1111 个 uid→卷数组，整数卷 1-21、升序无重复、格式坏行 0；来源世界书/tools/build-volume-index.mjs；消费者 facts-index.js。 |
| `agent/doupo-agent-ui/narrative/worldbook-source.js` | source | 98 | reviewed | facts-settle-history.json: 通读 1-97；loader.call(context)、异常/空名/不存在降级、MAX_ENTRIES、native/disabled 分流；无独立同名测试。 |
| `agent/doupo-agent-ui/npc/npc-autonomy.js` | source | 132 | reviewed | npc.json: Read all 131 lines; planning budgets/dedup, guard handoff, plan register/adjust/transition/listeners; terminal-plan revival repro. |
| `agent/doupo-agent-ui/npc/npc-autonomy.test.mjs` | test | 52 | reviewed | npc.json: Read all 51 lines and executed node successfully; planning, review, plan updates, transition terminal check and observer events. |
| `agent/doupo-agent-ui/npc/npc-cold-recorder.js` | source | 48 | reviewed | npc.json: Read all 47 lines; target/time/event/floor prompt construction; tested indirectly by cold-runtime test. |
| `agent/doupo-agent-ui/npc/npc-cold-runtime.js` | source | 190 | reviewed | npc.json: Read all 189 lines; selected/sync/event IDs, first baseline, previews, mark/discard/restore; collision and bulk-confirm memory repros. |
| `agent/doupo-agent-ui/npc/npc-cold-runtime.test.mjs` | test | 37 | reviewed | npc.json: Read all 36 lines and executed node successfully; baseline/events/mark/restore and prompt assertions. |
| `agent/doupo-agent-ui/npc/npc-commit-gate.js` | source | 46 | reviewed | npc.json: Read all 45 lines; state/branch/candidate/plan version and active-status checks; no commit/persistence inside gate. |
| `agent/doupo-agent-ui/npc/npc-commit-gate.test.mjs` | test | 18 | reviewed | npc.json: Read all 17 lines and executed node successfully; state/plan version rejection and ready path. |
| `agent/doupo-agent-ui/npc/npc-conflict.js` | source | 63 | reviewed | npc.json: Read all 62 lines; authority/rank/represents/intent grouping; traced output into actual outcome bridge. |
| `agent/doupo-agent-ui/npc/npc-conflict.test.mjs` | test | 21 | reviewed | npc.json: Read all 20 lines and executed node successfully; override, equal authority, missing/stale authority. |
| `agent/doupo-agent-ui/npc/npc-decision-guard.js` | source | 91 | reviewed | npc.json: Read all 90 lines; authority, knowledge IDs, allowed intent/action, pause, replay, plan maps and clearBranch; cross-state replay repro. |
| `agent/doupo-agent-ui/npc/npc-decision-guard.test.mjs` | test | 44 | reviewed | npc.json: Read all 43 lines and executed node successfully; hidden knowledge, authority, plan conflicts, action permission and clearBranch. |
| `agent/doupo-agent-ui/npc/npc-ledger.js` | source | 869 | reviewed | npc.json: Read all 868 lines; traced normalize/apply/manual/load/exp/injection and favor bounds; in-memory null-date, injection-drop and unchanged-version repros. |
| `agent/doupo-agent-ui/npc/npc-ledger.test.mjs` | test | 283 | reviewed | npc.json: Read all 282 lines and executed node successfully; asserts grouped patches, alias, favor, fillEmpty, source stamps, load and injection. |
| `agent/doupo-agent-ui/npc/npc-outcome-bridge.js` | source | 70 | reviewed | npc.json: Read all 69 lines; coordinated action/world candidates, missing metadata and synthesized world process ID; in-memory bridge probes. |
| `agent/doupo-agent-ui/npc/npc-outcome-bridge.test.mjs` | test | 19 | reviewed | npc.json: Read all 18 lines and executed node successfully; test supplies actionDefaults and manually restores process rather than actual direct chain. |
| `agent/doupo-agent-ui/npc/npc-plan-reassessment.js` | source | 73 | reviewed | npc.json: Read all 72 lines; evidence shape, plan versions, pending/cleared scopes, request/adjust/transition and audit hook. |
| `agent/doupo-agent-ui/npc/npc-plan-reassessment.test.mjs` | test | 40 | reviewed | npc.json: Read all 39 lines and executed node successfully; duplicate/version/evidence/terminal/clear paths. |
| `agent/doupo-agent-ui/npc/npc-recorder.js` | source | 284 | reviewed | npc.json: Read all 283 lines; prompt/schema, extract/record user builders, JSON parsing, exp condensation. |
| `agent/doupo-agent-ui/npc/npc-recorder.test.mjs` | test | 167 | reviewed | npc.json: Read all 166 lines and executed node successfully; parser, prompt and request construction; no exp async lifecycle coverage. |
| `agent/doupo-agent-ui/request/action-resolver.js` | source | 78 | reviewed | core-request.json: 完整读取77行；explicit、授权列表、规则/条件/效果、资源边界和幂等缓存。 |
| `agent/doupo-agent-ui/request/action-resolver.test.mjs` | test | 43 | partial | core-request.json: 完整执行通过；规则版本/数量、候选与边界断言。 |
| `agent/doupo-agent-ui/request/request-classifier.js` | source | 43 | reviewed | core-request.json: 完整读取42行；类别/任务一致性、澄清、历史与系统操作、确认分流。 |
| `agent/doupo-agent-ui/request/request-classifier.test.mjs` | test | 29 | partial | core-request.json: 完整执行通过；read_only、置信度和空输入断言。 |
| `agent/doupo-agent-ui/request/request-router.js` | source | 162 | reviewed | core-request.json: 完整读取161行；prepare/计划/去重、候选归属与提交、能力/NPC失效；内存复现。 |
| `agent/doupo-agent-ui/request/request-router.npc-invalidation.test.mjs` | test | 25 | reviewed | core-request.json: 完整读取24行并完整执行；计划版本失效和候选移除。；npc.json: Read all 24 lines; NOT executed. Plan-change invalidation only; not evidence of default autonomy execution. |
| `agent/doupo-agent-ui/request/request-router.test.mjs` | test | 125 | partial | core-request.json: 完整执行通过；候选篡改、计划版本、能力降级及禁用行动降级断言。 |
| `agent/doupo-agent-ui/request/world-simulator.js` | source | 62 | reviewed | core-request.json: 完整读取61行；范围/版本/时间/过程、冲突、幂等与提案输出。 |
| `agent/doupo-agent-ui/request/world-simulator.test.mjs` | test | 40 | partial | core-request.json: 完整执行通过；partial提案、过程去重和冲突断言。 |
| `agent/doupo-agent-ui/run-tests.mjs` | source | 33 | reviewed | host-api-package.json: Read all 32 lines; recursive sorted .test.mjs discovery, skips .tmp/node_modules, sequential dynamic imports, counts failures and sets exitCode. Whole runner not executed because unreviewed suites are outside this bounded slice.；self-storage.json: 全 32 行；发现实际测试为 import 执行。未运行全仓 runner，仅同方式导入本切片 9 个测试。；coordinator-final.json: Read complete, ran baseline and final77/77 file-level module imports. |
| `agent/doupo-agent-ui/sandbox/sandbox-mode.js` | source | 98 | reviewed | world-impact-sandbox.json: 完整97行；Map记录、sync/confirm/cancel、模式口径与历史；确认无版本复验、无持久化接口 |
| `agent/doupo-agent-ui/sandbox/sandbox-mode.test.mjs` | test | 72 | reviewed | world-impact-sandbox.json: 完整71行；离线执行通过；同一实例分支隔离/确认取消/副本/历史上限；不覆盖重载 |
| `agent/doupo-agent-ui/sandbox/sandbox-world.js` | source | 56 | reviewed | world-impact-sandbox.json: 完整55行；静态基线与动态惯性/人物自主提示；未按真实来源核验世界设定 |
| `agent/doupo-agent-ui/sandbox/sandbox-world.test.mjs` | test | 55 | reviewed | world-impact-sandbox.json: 完整54行；离线执行通过；关键词和4000字上限，不证明剧情行为或原著正确性 |
| `agent/doupo-agent-ui/self/goal-data.js` | source | 58 | reviewed | self-storage.json: 全 57 行；追踪 addGoal、恢复、数据库 decode 共用 normalizeGoal，明确 title/text 分离与截断边界。 |
| `agent/doupo-agent-ui/self/self-decide.js` | source | 128 | reviewed | self-storage.json: 全 127 行；决定提示、JSON schema、输入截断及 12 条操作限制、解析状态。 |
| `agent/doupo-agent-ui/self/self-decide.test.mjs` | test | 64 | partial | self-storage.json: 离线完整执行通过；提示/schema/解析路径已对应源码。 |
| `agent/doupo-agent-ui/self/self-ops.js` | source | 160 | reviewed | self-storage.json: 全 159 行；注入预算、条目编号、行囊上限、fence/裸 JSON 提取、解析/剥离。 |
| `agent/doupo-agent-ui/self/self-ops.test.mjs` | test | 93 | partial | self-storage.json: 离线完整执行通过；输出提取/预算测试已定位。 |
| `agent/doupo-agent-ui/self/self-runtime.js` | source | 589 | reviewed | self-storage.json: 全 588 行；逐类操作、去重、容量、ID、撤销、同楼重生成、restore/reset、流水；R1-R5/R10-R11/R15 内存证据。 |
| `agent/doupo-agent-ui/self/self-runtime.test.mjs` | test | 241 | partial | self-storage.json: 离线完整执行通过；现有断言不能排除本报告新复现边界。 |
| `agent/doupo-agent-ui/settings-template.test.mjs` | test | 180 | reviewed | ui-dashboard.json: Full text 1-179 read; whole file executed successfully. Primarily textual assertions, not DOM interaction tests. |
| `agent/doupo-agent-ui/settings.html` | ui | 16 | reviewed | ui-dashboard.json: All 15 lines read; inline entry and status; root/fallback equality asserted by executed test. |
| `agent/doupo-agent-ui/settle/settle-adjudicate.js` | source | 598 | reviewed | facts-settle-history.json: 通读 1-597；输入/上下文预算、JSON抽取、v1/v2、结构诊断、行动原子审核、物品身份、累计资源/境界、渲染、reconcile；重复/重叠 evidence 内存复现。 |
| `agent/doupo-agent-ui/settle/settle-adjudicate.test.mjs` | test | 505 | reviewed | facts-settle-history.json: 审查测试用例与断言并离线执行，44 cases 全通过；缺 evidence 区间/重复动作场景。 |
| `agent/doupo-agent-ui/settle/settle-integration.test.mjs` | test | 382 | reviewed | facts-settle-history.json: 读取实际入口 fixture 与完整集成断言 1-381，内存宿主测试通过；显式 fetch 拒绝且 networkCalls=0；preview/cache/scope/live state/STOPPED/reconcile。 |
| `agent/doupo-agent-ui/settle/settle-session.js` | source | 54 | reviewed | facts-settle-history.json: 通读 1-53；epoch/sequence/token 引用、busy/cache/force/fail、quiet end helper；不承担事实注入所有权。 |
| `agent/doupo-agent-ui/settle/settle-session.test.mjs` | test | 229 | reviewed | facts-settle-history.json: 审查场景与断言并离线通过；同长度 fingerprint、A晚于B、force、失败释放、调用方 fresh guard。 |
| `agent/doupo-agent-ui/tools/build-db-template.mjs` | source | 64 | reviewed | self-storage.json: 全 63 行；只静态读结构自检与 writeFileSync 输出位置；未执行。当前注释 10 表与实际 12 表不一致，但不是本报告核心缺陷。 |
| `agent/doupo-agent-ui/unified/unified-decide.js` | source | 205 | reviewed | memory-unified.json: 全文1-204；旧三桶合同、schema与纯函数解析，生产引用搜索 |
| `agent/doupo-agent-ui/unified/unified-decide.test.mjs` | test | 126 | partial | memory-unified.json: 125行；只验证旧纯函数，不证明生产仍使用合并决定 |
| `agent/doupo-agent-ui/world/world-decide.js` | source | 145 | reviewed | world-impact-sandbox.json: 完整144行；提示词、schema、喂料、解析和12操作上限；发现level重复定义 |
| `agent/doupo-agent-ui/world/world-decide.test.mjs` | test | 72 | reviewed | world-impact-sandbox.json: 完整71行；离线执行通过；schema测试只检查字段存在，未检查level语义 |
| `agent/doupo-agent-ui/world/world-ops.js` | source | 218 | reviewed | world-impact-sandbox.json: 完整217行；时钟/季节、事件传闻、势力人物任务注入、整块预算和指令提取 |
| `agent/doupo-agent-ui/world/world-ops.test.mjs` | test | 155 | reviewed | world-impact-sandbox.json: 完整154行；离线执行通过；预算、任务/势力/传闻展示、裸行和fenced解析 |
| `agent/doupo-agent-ui/world/world-runtime.js` | source | 700 | reviewed | world-impact-sandbox.json: 完整699行；时钟、事件/到期、任务、势力/人物、恢复、撤销、opId、容量；内存复现3种失败 |
| `agent/doupo-agent-ui/world/world-runtime.test.mjs` | test | 323 | reviewed | world-impact-sandbox.json: 完整322行；离线执行通过；现有到期/重roll/恢复/容量正常路径；缺任务期限撤销及同楼opId组合 |
| `agent/mvu/README.md` | documentation | 23 | reviewed | self-storage.json: 全 22 行；作为声明而非线上安装事实；旧初始化件已标废弃。 |
| `agent/mvu/纳戒MVU套件.json` | data | 174 | reviewed | self-storage.json: 五条全部字段静态遍历，规则和输出格式正文完整阅读；初始化禁用，YAML/字符串整表和 JSONPatch 通道。未导入。 |
| `agent/mvu/纳戒变量结构脚本.js` | source | 65 | reviewed | self-storage.json: 全 64 行静态阅读；命名空间、字段类型、预填、clamp、注册入口；远程 import 不加载不执行。 |
| `agent/斗破Agent数据库桥接表.json` | data | 428 | reviewed | self-storage.json: 427 行 JSON 结构全对象解析及与 buildBridgeSheets() 内存结果深比较；12 表；定位旧记忆列/导出开关差异，不执行脚本不重新生成。 |
| `agent/斗破纳戒MVU初始化.json` | data | 48 | reviewed | self-storage.json: 全 48 行静态结构审查；旧版平键 [值,说明] 形式、disable=true，README 已标归档；不把它当当前命名空间初始化执行。 |
| `index.js` | source | 13 | reviewed | host-api-package.json: Read all 12 lines; lifecycle named exports and modular re-export. |
| `manifest.json` | data | 23 | reviewed | host-api-package.json: Read all 22 lines; v0.2.1, minimum_client_version 1.18.0, root entry/style, interceptor global, hooks and empty dependencies. |
| `settings.html` | ui | 16 | reviewed | host-api-package.json: Read all 15 lines; static root template and declared extension-settings storage; no actual user settings read. |
| `style.css` | ui | 1004 | partial | ui-dashboard.json: Exact byte equality with host/style.css verified. |

## 剩余边界

index.js仍partial：各功能路径已追踪，长模板结构化盘点不等于逐字审阅；部分测试fixture只跑过/抽断言。生成volume索引仅验证格式与消费者，未逐条核验原著资料真实性。CSS未做真实渲染和设备测试。具体原始范围在optimization-checklist.json的coverage.evidence中保留；一个分片的unread不覆盖另一个分片已读证据。
