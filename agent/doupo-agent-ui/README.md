# 斗破同人 Agent · 酒馆扩展

一个跑在 SillyTavern 里的文字游戏总控：玩家说一句话，扩展负责解析意图、结算行动、写正文、过两道审核、把正文发进对话，并把状态写进当前会话。所有能力都通过 `doupoAgent` 命名空间对外提供。

## 一轮是怎么跑完的

1. **解析**：把玩家消息交给模型，得到结构化意图（类型、任务、明确行动、效果、天数）。
2. **授权**：分类器判断这轮是闲聊、查询、明确行动还是时间推进；行动必须由玩家自己说清楚才放行。
3. **计划**：路由器只把任务分给白名单模块（资料查询 / 行动结算 / 世界推进 / 沙盒），越权请求直接拒绝。
4. **六阶段管线**：`classify → plan → gather → adjudicate → compose → validate`，每阶段有超时与输出上限，总预算 90 秒。
5. **两道门**：质量门核对作用域、字段登记、唯一写入者与玩家授权；叙述门核对正文里的每条事实是否有依据。
6. **两段式提交**：先把正文发进对话并确认消息可见，再提交状态；提交成功后状态版本 +1，并写入 `chatMetadata`，刷新页面后仍在。

任何一步失败都不会写状态：被拦下来的回合，版本号保持原样，对话里也不会出现正文。

## 原著设定怎么进提示词（默认路径）

正文默认交回酒馆自己生成，扩展只负责在生成前把“这一轮真正需要的原著条目”塞进提示词：

1. **建索引**（启动时、切聊天时自动跑）：`setting.worldbook` 填世界书名，扩展用 `loadWorldInfo` 只读它，按 `comment` 里的「题名（类别-名字）」拆出类别、名字、别名；卷号来自 `世界书/tools/build-volume-index.mjs` 生成的 `narrative/volume-index.generated.js`。
2. **发目录**：当前卷的条目按 `uid|类别|标题|摘要` 排成目录（故事线只给标题，前情只给标题、不铺后续卷）。
3. **模型点名**：一次 `generateQuietPrompt` 静默生成，只回 JSON `{"need":[{"uid":11,"why":"..."}],"no_match":false}`；`jsonSchema` 一并传给酒馆。
4. **脚本取货**：uid 必须在目录里，越界丢弃，最多 6 条；按 `injectionBudget` 预算裁到整条或摘要。
4½. **卷外兜底**：目录里没有、但模型判断必须用到的，它把名字写进 `"lookup"`；脚本全库搜（标题、key），把候选带卷号列出来再问它一次，只接受候选里的 uid。没给名字或全库搜不到，就不发这次额外调用。
5. **注入**：`setExtensionPrompt(key, text, IN_CHAT, depth=0, scan=false, SYSTEM)`，生成结束或中断时清空；文字不进聊天记录、不写世界书。
6. **对账**：正文里出现“没注入过的条目名”记一条 `unapproved_setting_use` 审计，不拦生成。

世界书侧的分工是硬边界：**启用中的条目仍归酒馆原生注入**（28 条体系 + 1 条原著分卷汇总），插件导入时会把它们跳过，只接管关闭的 1132 条明细——同一段设定永远只走一条路。`node 世界书/tools/worldbook-disable.mjs --write` 负责把明细全部关掉，只留启用层；`node 世界书/tools/add-volume-index-entry.mjs --write` 会按 `原著分卷/卷NN_标题.txt` 重建那条常驻的《原著分卷汇总》（constant、order 100）。两个脚本都默认干跑，写前留带时间戳的备份。

插件只读不写：注入走 `setExtensionPrompt`，从不调用 `saveWorldInfo`，世界书的启用状态、文件和酒馆其它功能都不受影响。

设置页「原著设定」里的对应关系：检索库状态显示已索引条数、七分类分布、缺卷号条数和当前卷目录行数；「世界书名称」可手填，点“扫描可选世界书”会尝试列出酒馆里的世界书名字（酒馆版本不支持时回退为手填）；改动名称后会自动重同步索引，也可点“从世界书导入”手动重建。下面的「注入通道」控制是否注入、插入深度和最大字数。

手动“结算这一轮”的旧链路仍在，但默认关闭（`ui.legacyTurn`），避免和酒馆主生成抢正文。

选条提示词（模型看到的 system 指令）写在设置 `prompt.select`：留空用内置默认，`MAX_PICKS` 会替换成当前上限，改完下一轮生效，不用重启。

当前卷有两种来源：面板“当前剧情卷”填了就是手动锁定；留空时走自动判定——模型在选条 JSON 里顺带给的 `volume`，加上“正文里出现故事线标题原文”这一条兜底，取较大值，且一轮最多前进一卷。判定结果写回 `facts.currentVolume`，运行状态卡会显示当前卷、来源和自动值。

## 世界事件系统（world/）

世界时间和事件由模型自己下指令、脚本核验后记账——“LLM 决定脚本执行”的落地版：

1. **生成前注入**（`doupoFactsInterceptor` 里，独立于原著设定通道）：把世界现状写进扩展提示词 key `doupo_world`——时钟（第几天 几点）、时期/所在地/天气、进行中的身边事件（最多 8 条）和世界大事（最多 6 条），末尾附指令规则。有 `world.eventInject` 开关和 `world.eventBudget` 字数预算（默认 900，超了先丢事件保时钟）。
2. **模型下指令**：回复最末尾输出一个 ```world 代码块，每行一条 JSON：`advance`（天/分钟）、`setClock`、`addEvent`（scope: near|world，**basis 必填式地写依据**，`days`=有效天数）、`resolveEvent`、`pinEvent`、`setInfo`（weather/location/era）。没有变化就不输出。
   事件取材规则写死在指南里：事件从最近剧情里有依据地长出来（正在发生的事、玩家行动引出的动静、所在地点合理的动态），题材不拘——市井琐事、势力动作、传闻都行；`basis` 一句话写明从哪来（哪楼/谁/什么事），没有依据的事不记，也不把原著桥段照搬成事件。有时限的事（限期比武、悬赏、药效、期限任务）带上 `days`（≤90），**时间推进过线自动了结**，注入列表显示“剩 N 天”，正文里的时间压力要和它对得上。
   指南正文可在设置里改写（`world.eventGuide`，留空用内置默认），按自己的玩法调整事件规则。
3. **生成后执行**（`GENERATION_ENDED`）：取最新 AI 楼层的指令块逐行解析，交给 `world/world-runtime.js` 校验执行——越界数值、未知操作、超长文本只拒绝不炸；执行结果记进流水（面板可见）。指令块随后从楼层正文剥掉，玩家只看剧情。同一楼重 roll 会先撤销它上一版指令再落新账，不重复记账。
4. **持久化**：世界台账整体存 `chatMetadata.doupo_agent_world`，随聊天保存；切聊天自动恢复那一份，读不到按开局初始化（第 1 天 08:00）。
5. **面板**：两处 UI——顶栏「世界」按钮点开**世界状态浮层**（时钟、现状、双栏事件、最近流水，了结/置顶一键可做）；设置页「世界运转」是完整台账：时钟与手动调整（推进 1/7/自定义天、直接设为第 N 天）、双栏事件（显示剩余天数、了结/置顶）、手动登记事件（范围/分量/依据/有效期）、指令指南改写、指令流水。手动操作与模型指令走同一套校验。

上限保护：单批最多 8 条指令、事件单栏最多 60 条（先清已了结、再清未置顶最老的，置顶永不清理）、事件文本 300 字、信息字段 80 字、单次推进最多 365 天。

## 目录

- `core/`：协调器、回合管线、六阶段实现、编排器、状态库、提交恢复、质量门、数据合同、审计与账本。
- `world/`：世界事件系统——台账运行时（时钟/双栏事件/指令校验）、指令解析与注入文本、随聊天的存取。
- `narrative/`：事实库、正文核验、历史事件适配与恢复。
- `request/`：请求分类、路由、行动结算、世界推进。
- `npc/`：NPC 计划、决定守卫、冲突协调与提交门禁。
- `host/`：宿主能力预检、设置与存档、模型客户端、消息投递、状态持久化、控制台视图与样式。
- `index.js`：浏览器入口；`run-tests.mjs`：递归运行全部模块测试；`demo-turn.mjs`：离线跑完整一轮。

## 三个宿主适配器

- **模型**（`host/llm-client.js`）：默认复用酒馆当前连接（`generateQuietPrompt`），也可以填 OpenAI 兼容接口地址、密钥和模型名。没配好时这一轮直接返回“模型连接未配置”，不会静默跳过。
- **消息**（`host/message-adapter.js`）：用 `createChatMessages` 把正文写进当前对话，再回读聊天列表确认最后一条就是它；确认不到就不提交状态。
- **存档**（`host/state-persistence.js`）：状态、历史与版本号存在 `chatMetadata['doupo_agent_state_v1']`，按会话与分支隔离，切换聊天会重新载入。

## 怎么用

- 设置面板“总控”页点 **结算这一轮**：取当前对话里最后一条玩家消息，跑完整条链并在面板里显示结果。
- 关掉“启用 Agent 总控”后不会执行任何回合，也不会写状态。
- 命令行：

```bash
node agent/doupo-agent-ui/run-tests.mjs   # 全部模块测试
node agent/doupo-agent-ui/demo-turn.mjs   # 离线演示完整一轮（含被拦截的越权写入）
```

## 数据合同

`doupoAgent.contracts` 登记对象、字段、类型、唯一写入者和允许读取者，开局自带 `player` 与 `world` 两张表。质量门只接受已登记字段的写入，写入者必须与该字段登记的 writer 一致，所以模型编出来的字段（比如 `player.luck`）会被直接拒绝，而不是悄悄写进状态。

## 主要接口

- `doupoAgent.runTurn({ sessionId, branchId, input, triggerMessageId })`：跑一轮，返回 `completed / needs_clarification / rejected / failed / save_uncertain / disabled / unavailable`。
- `doupoAgent.inspectTurnState({ sessionId, branchId })`：读当前状态与版本。
- `doupoAgent.pipeline` / `doupoAgent.stages` / `doupoAgent.orchestrator`：直接使用管线、阶段或编排器。
- `doupoAgent.router` / `doupoAgent.quality` / `doupoAgent.narrative` / `doupoAgent.commits`：路由、质量门、叙述门与提交恢复。
- `doupoAgent.facts` / `doupoAgent.actions` / `doupoAgent.world` / `doupoAgent.npcs` / `doupoAgent.sandbox`：资料、行动、世界、NPC 与沙盒能力。
