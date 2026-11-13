# 正文原子事实核验（verify）· 设计稿 v1

> 状态：**v1 已实现并实跑验证**（2026-11-12，斗破苍穹1 卡真实聊天）。实跑修正三条：
> ① 调用通道改走 **`generateRaw` 独立提示词**——卡片的工具协议（soliumbra_reply）会把 `generateQuietPrompt` 劫持成 tool_calls，调用方只拿回工具返回值 `{}`；
> ② 结构化输出 schema 只写酒馆执行器认的关键字（`additionalProperties`/`description` 会坍缩成 `{}`）；
> ③ 名字比对车道实跑一楼记 40+ 条（lore 密集正文常态），降级为 `verify.nameAudit` 默认关。
> 实现落点：`narrative/verify-claims.js` + 测试、`index.js`（`runFactCheck` / `scheduleFactCheckAfter` / 设置卡 / `doupoAgent.factCheck`）、`host-storage.js`（`verify` 设置节 + `doupo_agent_verify` 台账 + `lastRun`）、`core/audit-log.js`（`turn_fact_check`）、`orb-hud.js`（核验渠道标记 + 运行日志翻译）。
> 对应方向 A（VeriScore 式三步管线收敛为单调用）。方向 B（事实库喂料）、C（冲突行注入）、D（RRF 检索）不在本稿。

## 0. 目标与非目标

**目标**：AI 楼层落地后，把正文拆成可验证的原子断言，对照三类证据逐条裁决（supported / contradicted / unverified），结果记入审计流水。先**只审计不拦截**，跑出误报率后再谈 v2 拦截。

**非目标**：
- 不动选条注入链（facts-index → facts-select → setting-supply）。
- 不做生成前拦截、不 abort 正文（本模块是纯后置观察者，永远不挡正文）。
- 不往 facts-library 登记数据（那是方向 B）。
- 不接 MVU 帧与数据库桥接。

## 1. 要抓的四类硬伤（现状 `audit()` 抓不到的）

现有唯一核验是 `setting-supply.js` 的 `audit()`：正文出现未注入条目名 → `unapproved_setting_use`，字符命中、无语义。本模块补四类语义层错误：

1. **数值/境界错**：正文写的境界、金币、数量与纳戒台账不符。
2. **关系/立场错**：好感、敌我、在场人物与人物簿不符。
3. **时序错**：季节、天数、事件先后与世界台账不符。
4. **传闻当事实**：rumor 事件被正文写成已证实。

## 2. 模块落点

| 文件 | 职责 |
|---|---|
| `narrative/verify-claims.js` | 纯逻辑：内置提示词 `VERIFY_PROMPT`、`buildVerifyUser()`、`parseVerifyReply()`、快筛判定 `shouldVerify()`、审计条目归并 |
| `narrative/verify-claims.test.mjs` | 单测，`run-tests.mjs` 自动收集 |
| `index.js` | 接线：GENERATION_ENDED 后触发、设置通道 `data-setting`、审计入账、悬浮球/运行日志投影 |
| `settings.html` + `host/style.css` | 「正文核验」设置卡 |

贴齐的既有模式：
- 决定调用结构照 `world/world-decide.js`（`WORLD_DECIDE_PROMPT` 常量 + build + parse，严格 JSON）。
- 带原因重试照 `npc/npc-recorder.js` 的 `buildRecordRetryUser`（坏 JSON → 把拒绝原因喂回去重试一次）。
- 楼层防重照世界/记忆决定同款（失败生成也会广播 GENERATION_ENDED，auto 只对没决定过的 AI 楼层跑一次，见 index.js 1386/5236 注释）。
- 提示词改写照 `world.decidePrompt` 同款：设置框打开显示当前生效正文，留空跟随内置默认，改写存 `settings.verify.prompt`。
- 连接与参数照「记录员参数」同款：跟随酒馆 / 自定义接口、模型、温度、输出上限、top_p、两个惩罚项，填 0 或留空沿用全局。

## 3. 触发条件（快筛，省调用）

`shouldVerify({ text, supply, npcNames })` 纯函数，全部命中才发起调用：

1. `settings.verify.enabled !== false` 且 `settings.verify.auto !== false`；
2. 该 AI 楼层未做过核验（楼层防重，重 roll 视为新楼层）；
3. 正文命中**任一**快筛特征：
   - 含某条目名/别名（`agentSettingSupply` 已登记的 keys）；
   - 含人物簿在册人物名/别名；
   - 含数值断言模式（境界词表「斗者|斗师|…|斗帝」+ 星级、`数字+(枚|颗|瓶|名|天|年|金币)`）。

全不命中 → 跳过且**不留审计**（避免流水被闲聊楼层刷屏）。手动「重跑核验」按钮无视快筛。

## 4. 证据喂料（单次调用内给全，不做第二轮取证）

VeriScore 原版是提取→检索→验证三步；这里检索由脚本侧完成——本轮证据天然在场，**收敛为单次调用**（提取+裁决一步），少一路调用、少一个失败点：

| 证据路 | 来源 | 上限 |
|---|---|---|
| 本轮注入条目原文 | `agentSettingSupply.recall`（本轮 usedIds 对应条目，全文） | ≤6 条，超预算按摘要层降级 |
| 世界台账现状行 | 时钟/季节/氛围/名声/通缉 + 进行中事件前 8 条（标题+剩余天数） | 500 字 |
| 纳戒现状行 | 境界/金币/行囊摘要/进行中炼制/目标 | 300 字 |
| 人物簿现状行 | 四象限在场人物（名字+好感+立场，一行一人） | 400 字 |
| facts-library 取证 | `query({query: claim 主题词, sourceIds})` 结果 | v1 接口留好，默认空库直通 |
| 上下文 | 最近 2 楼用户输入（判定"谁在说什么"） | 800 字 |

喂料与四路注入（世界/纳戒/人物簿/原著）互不清空；核验是**读方**，不写任何台账。

## 5. JSON 契约

```
{"claims":[
  {"text":"萧炎当前境界为斗者三星",      // 规范化断言，禁止逐字复制正文原句
   "subject":"萧炎","predicate":"境界","value":"斗者三星",
   "verdict":"contradicted",            // supported | contradicted | unverified
   "basis":"ledger:self.realm"}         // 依据引用：entry:<uid> | ledger:<域.字段> | rumor | none
 ],"truncated":false}
```

parse 规则（`parseVerifyReply`，照 `parseDecision` 严格度）：
- 坏 JSON / 非 `{claims:[...]}` → 返回错误、不入账；
- `verdict` 越界值该条丢弃；`text` 超 80 字截断；claims 超 12 条截断并置 `truncated:true`；
- 不可验证断言（气氛、修辞、心理）要求提示词阶段就丢弃，parse 兜底再滤一次（无 subject+predicate 的丢弃）。

## 6. 提示词契约（`VERIFY_PROMPT` 内置默认要点）

1. 只拆**可验证断言**：数值、境界、关系、立场、位置、时间、物品归属、事件先后、传闻性质；每条给 verdict，不许整篇泛泛评价。
2. **text 写规范化断言，不得逐字复制正文**（配合 `core/audit-log.js`「不存正文」约束，见 §7）。
3. rumor 类：只能判 `unverified` 且 basis 必须写 `rumor`，不许判 contradicted（传闻本来就未证实）。
4. 证据没有的判 `unverified`，不许脑补证据；`basis` 必须指向输入里实际给过的条目 id 或台账行，给不出就写 `none`。
5. 断言对象只限：主角、在场人物、世界现状；不验原著角色未登场部分的设定。

## 7. 审计流水格式（贴 `core/audit-log.js` 约束）

该模块合同是「有界、只读元数据、**不持久化正文文本**」。因此：

```
kind: 'fact_check'
entries: [{
  claimId, verdict, subject, predicate, value,
  basisRef,        // 'entry:11' | 'ledger:self.realm' | 'rumor' | 'none'
  floor, ts
}]
lastRun: { floor, ts, status, claims, nameIssues, reason }   // v1 实测补充：每次跑完必落，区分"跑了没结果"与"没跑"
```

- `claim.text` 是模型改写的断言（非正文复制），仍按 ≤80 字有界存储；
- 正文原句定位（evidenceSpan）只在**当轮面板**展示，不落账；
- 误报处置：审计列表每条可标「误报」（照 `facts-library.reviewFact` 的 confirmed/rejected 流式修订，`expectedRevision` 防并发）——标过的 subject+predicate+value 组合进豁免集，后续同断言降为不记。
- 运行日志中文翻译：`orb-hud.js` 翻译表加 `fact_check` 系条目；悬浮球总控行尾挂「核验」一路的调用标记（在途/成功/失败，与记忆召回+决定双标记同款）。

## 8. 设置卡「正文核验」

- 开关：`verify.enabled`（总开关）、`verify.auto`（自动触发；关了仍可手动）；
- 快筛开关 `verify.gate`（默认开；关了每个 AI 楼层都验）；
- 参数卡（记录员同款五项）；决定提示词改写框（所见即模型所收）；
- 审计流水只读列表：verdict 筛选、误报标记按钮、豁免集查看；
- 「重跑核验」按钮（当前楼层手动触发，无视防重与快筛）。

## 9. 失败与预算

- 坏 JSON：带原因重试一次（`buildRecordRetryUser` 模式），再失败记调用体检打叉、不入审计；
- 失败永不影响正文楼层（纯后置）；
- 输出上限默认 1000 tokens，超时 30s；与其他决定路互不挤占（各自独立调用，不走备料闸门的 abort 链）。

## 10. 测试清单（纯逻辑，不碰 DOM）

1. `shouldVerify`：快筛三特征各自命中/全不命中/开关组合；
2. `buildVerifyUser`：空台账、超长正文截断、证据预算降级；
3. `parseVerifyReply`：坏 JSON、verdict 越界、claims 截断、rumor 判 contradicted 的纠偏、逐字复制原句的拒收（与楼层正文相似度阈值）；
4. 审计归并：豁免集命中不记、楼层防重、重试后只有一份流水；
5. 误报标记：expectedRevision 冲突返回不覆盖。

## 11. 分期

- **v1（本稿）**：单调用提取+裁决、快筛、审计入账、误报豁免、设置卡与悬浮球接线、手动重跑。
- **v2**：contradicted 置信分级 → 可配置「注入下轮提醒」或触发重写；facts-library 取证真正接入（依赖方向 B 喂料）。
- **v3**：核验结果按人/按域聚合视图；方向 C（冲突行注入）搭车落地。
