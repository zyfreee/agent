# 总入口与生命周期只读审查

功能：启动/停用、总开关、宿主事件、跨聊天失效、后台依赖、静默递归保护、legacy边界、热重载与全局桥。

## 已证实问题

### P1 关闭Agent总控后自动链仍调用模型并写账
- 位置：`agent/doupo-agent-ui/index.js:317`
- 条件：settings.enabled=false / normal generated reply
- 证据：Generation-end branch checks quiet/world subfeature flags but never global enabled. Mock host with enabled:false and full started→ended→rendered sequence produced llmCalls=1 and persistedWorld=true. UI line5957 promises关闭后不会运行回合也不会写入状态.
- 影响：User cannot rely on master stop control; unexpected quota use and state mutation.
- 最小建议：At the existing lifecycle owner gate both task start and late commit on the master enabled contract; invalidate in-flight work when switched off. Keep safe injection cleanup.
- 验收：enabled=false must produce zero calls and no metadata writes; disabling during delayed LLM/MVU/DB operation must prevent late mutation; re-enable restores one listener/chain.
- 证据等级：reproduced_offline

### P1 后台静默调用期间下一轮可能永久漏记
- 位置：`agent/doupo-agent-ui/index.js:277`
- 条件：New player/AI reply arrives while prior background request remains pending
- 证据：started/rendered/ended ignore while isQuietBusy. Prior continuation also invalidates when chat tail changes. Isolated host: append next user+reply before resolving prior world call → replyCount2, requests1, persistedWorld=false; no queued retry. Source comments lines301-302 acknowledge omission but no compensation exists.
- 影响：Both old and new replies may remain unaccounted; world/self/memory state diverges from chat.
- 最小建议：Maintain a bounded per-chat pending latest reply at the existing lifecycle owner, drain after background chain ends; use reply/version identity and explicit skipped reason. Do not silently drop overlapping normal generations.
- 验收：Delay first bookkeeping, produce second normal reply, then release first: current reply must be processed exactly once, stale result discarded, no infinite quiet recursion; switch chat cancels old queue.
- 证据等级：reproduced_offline

### P2 记忆决定没有等待纳戒记账完成
- 位置：`agent/doupo-agent-ui/index.js:369`
- 条件：afterWorld launches self and memory concurrently despite dependency comment
- 证据：self run assigned at342-356 then not awaited. memory launch at369 starts immediately. Mock world resolution started self and memory requests while self unresolved (3 total). Comment line366 and README132 promise later consumers see newly posted account.
- 影响：Memory decision can observe state before self/MVU commit; chronological dependency is not enforced. Actual prompt/state impact requires each consumer contract audit.
- 最小建议：State explicit dependency graph; await only true prerequisites, keep independent NPC work parallel. Do not add blanket global serialization.
- 验收：Delayed self completion test should prove memory reads intended committed state and failed self produces explicit partial result rather than assumed success.
- 证据等级：reproduced_offline

### P2 热重载清理与正式停用清理不一致
- 位置：`agent/doupo-agent-ui/index.js:7166`
- 条件：import.meta.hot dispose
- 证据：onDisable removes lifecycle handlers and invalidates continuations at7102-7124; HMR dispose instead drops hostLifecycleBindings=[] at7189 without removing registered listeners, does not invalidate epoch or disposeOrbHud.
- 影响：Development hot reload can leave old listeners/singletons and late callbacks; HMR applicability not proven for production deployment.
- 最小建议：Have hot disposal reuse the existing symmetric cleanup contract; no production rewrite or new framework.
- 验收：Fake HMR/load-dispose-load should show listener and singleton counts return to baseline; no stale request commit.
- 证据等级：source_path_development_only

### P2 文档同时宣称数据库与扩展各自为真账本
- 位置：`agent/doupo-agent-ui/README.md:101`
- 条件：State ownership documentation and retired paths
- 证据：README101 says表=账本/表优先;120 sayschatMetadata真账本、DB仅镜像;159-172 still document merged mode while189 declares it retired. These contracts give incompatible implementation/repair guidance.
- 影响：Maintenance can reintroduce authority inversion, unsafe restore or resurrect retired settings.
- 最小建议：After deciding actual write ownership, document default runtime vs legacy API separately; mark archival behavior explicitly, update acceptance numbers without treating docs as code proof.
- 验收：Map each documented setting/API to consumer and real path, examples and contract tests agree.
- 证据等级：source_contract_contradiction

## 稳定/暂不动
- 不放松已有scope/epoch/reply身份校验；它仍能阻止过期LLM结果串档。
- started/ended/rendered屏障已有两种事件顺序回归，未来监听器的异步后处理边界仍需实机验证。
- public doupoAgent API、legacy回合和HMR不能因默认路径不使用就直接删除。

## 覆盖与缺口
- partial: agent/doupo-agent-ui/index.js — Coordinator directly reviewed lines 1-714, 735-855 and 7060-7240 plus symbol searches; domain/UI sections assigned separately. Not a complete line-by-line entry review.
- reviewed: agent/doupo-agent-ui/index-lifecycle.test.mjs — Read complete test; checks absent-host lifecycle but no enabled=false generation behavior.
- reviewed: agent/doupo-agent-ui/index-chat-lifecycle.test.mjs — Read complete 145-line behavioral regression; covers delayed stale responses and event barrier but not busy next-turn compensation or dependent module completion.
- partial: agent/doupo-agent-ui/README.md — Read lines 1-240 for functionality and architecture contracts; remaining cold-runtime acceptance rows not yet read.
- partial: agent/doupo-agent-ui/.tmp-hub.txt — Legacy UI fragment; first 20 lines inspected and excluded from active runtime audit pending reference/deletion checks.

本轮未修改实现，未访问真实宿主/存档，不生成模型回复。