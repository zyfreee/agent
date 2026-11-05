# P1 最终复核（限定范围）

日期：2026-11-04。根目录：`C:/Users/86158/Desktop/异界转生录/doupo`。

只读复核 `core-request.json`、`npc.json`、`facts-settle-history.json`、`world-impact-sandbox.json` 的 **12 个 P1**。审当前 dirty worktree，不是仅 HEAD，也不是不可变发布快照。没有重做全仓审查，没有裁决原报告 P2/P3；只写本文件及 `final-check-high-risk.json`，不改源码、配置、存档、生成物或原报告。

## 总结

- **confirmed：10；downgrade：2；reject：0。** 最终保留 10 个 P1、2 个 P2。
- 没有新增 finding，也没有完全重复项。JSON 的 `coverage`、`findings` 均为空；逐项裁决在 `reviewed_findings`，不是把原问题再登记一遍。
- 降级不等于删除 legacy 缺陷。并发交付只在显式旧链/API 边界得到证实；沙盒确实缺少正式模式持久化，但“缺记录就采用设置”是当前显式策略，不能仅凭未冻结方案称为未授权切换。
- 所有以下相对源码引用均相对于 `C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/`。

## 逐项裁决

### FC-01 / CR-01 — confirmed，P1

**保存失败仍宣告已保存。适用于可选 legacy 回合和公开 runTurn，不是默认酒馆正文存档链。**

- `core/orchestrator.js:197-211` 在提交后调用 save，只检查 committed，未检查 persisted 就发布 `completed_saved`。
- `host/state-persistence.js:23-43` 确有 saveMetadata 同步抛错返回 failed 的真实路径；`index.js:686-688` 接入该适配器。
- `index.js:8778-8785` 的 `ui.legacyTurn` 限制面板旧链，不会修复其单请求错误。按钮禁重入也无关。
- 本轮以真实 orchestrator/state-store/recovery 配内存流水线复现 `completed / failed / completed_saved`，没有真实保存。

**补验收：** 在实际旧链入口测试 saved/failed/unavailable/抛错及无保存器合同；失败不得宣告已保存。重试保存不得重放行动或推进版本。异步宿主保存兑现及真实落盘另验。

### FC-02 / CR-02 — downgrade，P1 → P2

**交付后 prepare 失败会留下孤立正文，但不是已证实的默认链并发落账故障。**

- `core/orchestrator.js:182-194` 先 deliver 后 prepare，失败直接返回，无正文补偿，缺口真实。
- `core/commit-recovery.js:20-22` 的版本比较已阻止旧候选提交；`index.js:8782-8789,8799-8802` 已禁用面板 run/retry 双按钮。
- `index.js:8771-8774` 的包装及公开 API 没有同分支队列；缺口适用于显式 API 并发或其他写者推进同一状态版本，不在默认 `doupoFactsInterceptor` 正文链。
- 内存并发复现两份交付、一项完成、一项 `prepare_commit/stale_state`，本次仅新增一条历史，不能表述成双重状态落账。

**补验收：** 用真实 pipeline 与消息适配器替身加屏障测试同分支并发/其他写者；失败正文应撤销或明确待核对且不作为已执行事实。先确定公开 API 是否承诺此并发用法；正式支持或实际入口稳定可达时再升 P1。不删旧链。

### FC-03 / NPC-01 — confirmed，P1

**精简草稿在换聊天后晚到，确认可覆盖当前同名人物经历。**

- `index.js:140-145,228-240` 的切聊天保护会清 pending，但 `index.js:3116-3129` 未捕获 continuation，旧回答能重新填全局槽。
- `index.js:3156-3166` 只验人物名，直接替换当前账本经历并保存，无聊天/经历版本核对。
- VM 提取真实精简与确认函数，配真实 npc-ledger：A 请求后换 B 账本、清 pending，再释放 A；确认使 B 同名人物的 `B original` 变成 `A condensed`。DOM/保存都是内存替身。
- 这是手动精简后确认的真实面板路径，不是无人确认自动覆盖，也不是仅自治计划 API。

**补验收：** A→B、A→B→A、同名人物、请求中新增/手改经历、取消及双请求交错；旧草稿不得可确认，正常确认只写一次。最后验真实 UI 与分聊天保存。

### FC-04 / NPC-02 — confirmed，P1

**补全/重抽的错人物和字段保护绕过真实存在，continuation 不负责此类保护。**

- `index.js:2205-2219` 虽有 continuation 校验，但 `{...patch, 姓名:目标}` 不是规范目标绑定；保护只过滤顶层中文键。
- `npc/npc-ledger.js:403-415` 展开嵌套组且姓名首值胜出；`:416-418,444-448` 支持英文 favor 与在场。`:550-575` 的 overwrite 路径可以落这些变化。
- `npc/npc-recorder.js:218-234` 解析不先规范成限定目标白名单；传递 JSON schema 不等于本地解析器强制验证。
- 真实入口函数+真实 parser/ledger，抽 A 返回 `{name:B,设定:{态度:unexpected,在场:true},favor:10}`，结果 A 好感 0，B 好感 10、态度 unexpected、在场。
- fillEmpty 能挡好感累加和已有字段覆盖，不能解决填错目标/空字段；不应把它说成完全无防护。

**补验收：** 中英姓名键顺序、分组/fields、别名人物、多 patch、overwrite/fillEmpty 矩阵；规范化后仅允许目标静态字段。不得只继续扩顶层黑名单。

### FC-05 / facts index.js:3336 — confirmed，P1

**默认事实注入晚回可写入新聊天。**

- `index.js:3588-3598` 的非 quiet 默认拦截器调用 prepare；`:3336-3340` await 后直接写当前全局 facts 通道并保存。
- `index.js:228-244` 清通道不能取消旧 continuation；`:149-156` 保存读取的是当下聊天 metadata。
- `index.js:3558-3562` 的 token/fresh 是 settle 专属门，不包围 facts 写入。quiet 早退也不解决普通请求切聊天。
- VM 执行真实 prepare，延迟 resolveInjection；A 等待后 scope 改 B，释放后得到 `[[B,A private]]`。证明提交点缺口，不声称所有真实宿主都允许每一种切聊天时序。

**补验收：** 实际入口延迟 A→B→B 完成→A 返回、A→B→A、停止/禁用、同 scope 后发胜出；旧任务不得 write/persist，也不得 clear 新通道。宿主捕获实际 prompt 与 metadata 最终确认。

### FC-06 / facts index.js:8686 — confirmed，P1

**世界书同步去抖序号没有保护内部索引提交。**

- `index.js:8479-8488` 前后序号检查只挡调度/过期 UI，sync 内的写入已发生。
- `index.js:8683-8692` 捕获书名后 await，无书名/请求序号复核即 clear/register/load；`:8684,8687` 空名/失败直接返回而保留旧库。
- `index.js:217,6950` 启动和设置变更均可调度此读取，500ms 去抖不取消在飞 loader。
- VM 真实函数复现 B(uid2)先完成、A(uid1)后完成，索引写序 `[2,1]`；随后 unset 不清空。

**补验收：** A 慢 B 快、A 失败 B 成功、A→空名/空书/不存在；supply/index 始终同源且最后有效请求胜出。明确失败时清库还是显式停用，不允许旧库静默冒充新来源。

### FC-07 / facts index.js:3507 — confirmed，P1

**结算额外取条目全文，没有复用主 facts 的分卷裁剪。**

- `index.js:3504-3509` 只给 matchTokens 传 volume，get 后把 `entry.content` 全文传结算。
- `settle/settle-adjudicate.js:179-193` 仅字数 clip；`narrative/setting-supply.js:15-26` 的分段 trim 不在这条链。
- `index.js:3533,3556-3567` 把材料发给结算模型；fresh 检查只验变化，不验未来段。
- 本轮真实 buildSettleResultUser 合成正文仍包含 future-secret；索引匹配→get→content 无裁剪由源码核实。本轮未重跑完整检索 fixture，未读真实世界书正文，不声称当前 1111 条资料已实际泄露。
- 适用条件是非沙盒、早卷可命中含后卷增补的条目，且秘密位于字数保留范围。条目卷归属过滤不是段落过滤。

**补验收：** 真实 collectSettleMaterials 完整 system/user：锁 1 不含卷 9 秘密、锁 9 可含；lookup/摘要/通道也不能把未来段带回。明确未知卷和无标记策略。

### FC-08 / facts settle-adjudicate.js:464 — confirmed，P1

**证据身份规则同时允许重叠重复批准、误拒相同文字的独立行动。保留 P1，但不是已证明真实金币重复发放。**

- `settle/settle-adjudicate.js:451-465` 用首次 indexOf 与 fingerprint Set，不跟踪原文出现区间。
- `index.js:3565-3574` parse→review→render 注入正文；`:540-555`（settle 文件）只读核对，不是直接落账。
- 真实 parse/review：`我打工获得报酬` 配 `我打工`、`打工获得报酬` 两证据，两项批准，expected gold 20；`打工；打工` 配两次同证据，仅一项批准，expected gold 10。实际账本未改。
- 输入包含性、顺序、累计资源与行动原子门存在，但不能区分重叠区间和后续独立同文位置。这是同一 finding 的两面，不另拆 P1。

**补验收：** 重叠/包含区间最多一次授权；同文两独立位置可分别处理；逆序/前向依赖/同区间复用仍拒绝。验批准结果及最终注入，不把 expectedState 称作真实已保存状态。

### FC-09 / facts facts-library.js:129（现 130）— confirmed，P1

**结构化资料公共 API 返回已拒事实，非默认世界书通道，但不因此删去公共合同缺陷。**

- `narrative/facts-library.js:81-89` 接受 rejected；`:126-135,151-152` 只排 needs-review，rejected 仍生成 supported/conflict。
- `index.js:476,4537` 注册 facts-query 并公开 facts 库，没有在该边界看到调用方复核状态过滤。
- 直接 API 复现注册→rejected→query，返回 `supported / rejected`。
- 只适用于显式结构化资料及使用其已登记来源的模块，不是默认世界书选条。sourceIds、作品线/realm 限制不能代替复核状态过滤。

**补验收：** query/queryForActor 都排 rejected/needs-review，且不产生 supported/conflict；current/confirmed/corrected 按合同保留。补适配器集成，不借机重写资料库。

### FC-10 / world index.js:3258 — confirmed，P1

**默认影响场记晚回可以写入新聊天，其他记录员的守卫不包围它。**

- `index.js:3303-3306` 默认 prepare 先 await 场记；`:3233,3258-3288` 捕获旧 snapshot，await 后写全局缓存/影响通道。
- `index.js:228-239,2050-2054` 换聊天清通道与缓存并恢复账本，旧 snapshot 仍可晚回。
- `index.js:4032,4405` 的 continuation 是世界决定/影响记录员的，不覆盖此函数。
- VM 真实场记函数延迟 picks，A→B 后释放，写入 `[[B,A world private]]`。
- 适用于 injectSmart 有在飞选条的默认准备链及公开 impactInjection；纯同步 script 选条没有该 await 窗口。

**补验收：** 实际入口延迟场记切聊天恢复 B，再释放 A，应 stale 且不 write/cache/clear；停用、改账、重roll、同 scope 并发及切模式同测，最后捕获真实 prompt。

### FC-11 / world impact-runtime.js:681 — confirmed，P1

**归档与活跃库的 ID 空间在恢复后碰撞，真实调用方没有补救。**

- `impact/impact-runtime.js:679-684` seq 只扫描 records；`:467-475` unarchive 未检查已有同 ID。
- `index.js:2050-2054` 聊天恢复直接调用 runtime.restore，不补编号、不做冲突门。
- 真实 runtime 内存复现 record i1→forget→snapshot/新实例 restore→新增→unarchive，得到 `[i1,i1]`。
- 默认影响账本恢复后新增/找回可达，不是未接线旧 API；相似内容去重和 limits 不保护共享 ID 空间。

**补验收：** 最高编号仅在归档、空/非空活跃库、反复恢复新增/找回，全 ID 唯一且旧 parent/ref 不变；旧碰撞快照应显式处理，不能静默重编号破坏引用。

### FC-12 / world sandbox-mode.js:24 — downgrade，P1 → P2

**正式模式不持久化真实存在；“旧档缺字段必须主线”不能从未冻结方案推成已生效授权合同。**

- `sandbox/sandbox-mode.js:19-20` 同时写续聊一致和首次按当前设置采用；`:24-25,39-42,93-94` 仅 Map、首次采用，无 snapshot/restore。
- `index.js:7237-7245` 明确正式记录优先，缺记录按全局开关。
- `index.js:5720-5748,5763-5769,6947` 仅对显式任务 scope/设置变更同步，未有模式宿主持久化接线。
- 真实模块 A 主线→确认沙盒，同实例 sandbox；重建 read(A)=empty。证明正式记录丢失，不能把常见同设置重载说成必然换模式。
- **驳回的只是部分论据：** 缺记录回全局本身就是实现策略，不能仅引用建议稿断言未经授权。仍保留已确认模式/惯性/历史跨重建缺失的 P2，不整项删除。

**补验收：** 先冻结首次/旧档缺字段与分支模式合同；A 主线/B 沙盒确认后重载、换聊天维持模式/惯性/历史，再测相反全局开关、取消/未确认。无需恢复已删 sandbox 模块或补节点功能。

## 明显重复、误报与表达收窄

1. **FC-05 与 FC-10 是同类，不是同项。** 都在 prepare 链，却有不同 await、缓存、通道和独立公开入口；单修一处，另一处仍能跨聊天回写。可合为修复主题，不删 finding。
2. **FC-03/05/06/10 共有旧响应提交所有权主题，但四个不同写者。** 经历整单确认、facts 注入、来源索引、impact 注入需各自验收，不能互相代替。
3. **CR-01 与 CR-02 非重复。** 保存完成误报和交付后准备失败是不同边界。
4. **潜在误报/过度严重性：** CR-02 若表述为默认链双重落账则过度；沙盒“缺记录采用设置必为越权”依据不足。两项降 P2。
5. **措辞收窄：** 结算 gold 20 是审核预测/注入结果，不是本轮已证明真实重复入账；未来卷是合成路径可泄露，不是实际资料正文已审出剧透。结构化 facts 是显式 API，不是默认世界书链。

## 验证边界与交付

- 执行了两个成功的 Node stdin 内存批次；真实源函数通过 VM 提取，状态/账本模块直接 ESM 调用，网络 fetch 为拒绝替身。其余宿主、DOM、模型返回、保存均为内存替身。
- 初始 harness 受 Windows 编码、字符串转义/命令长度限制出现失败；只计最终成功批次，不把失败尝试当通过测试。
- 未跑全仓测试、构建、生成器，未浏览器、真实模型、真实保存或修改代码。没有创建 repro 脚本文件。工具临时输出由宿主管理，不是项目生成物。
- 没有重审真实世界书正文、未复跑原报告所有测试；P2/P3 未裁决。局部复现不替代酒馆事件时序、消息证据、实际提示词和保存落盘验收。
- A0 收据：路线 `code-quality-workflow`，已读 `ST-A0`、`audit-and-sweep.md`、`plugin-runtime.md`，库快照 `2026-08-18`；无候选设计选择、无修复授权。

交付文件（绝对路径）：

- `C:/Users/86158/Desktop/异界转生录/doupo/agent/review-2026-11-04/final-check-high-risk.json`
- `C:/Users/86158/Desktop/异界转生录/doupo/agent/review-2026-11-04/final-check-high-risk.md`
