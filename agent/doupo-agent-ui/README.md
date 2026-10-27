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

**LLM 决定脚本执行**是主路径：生成结束后，扩展发起一次独立的模型决定调用——模型读**最近聊天 + 相关世界书条目 + 世界台账**，输出严格 JSON（`{"note":"…","ops":[…]}`，附 jsonSchema 约束），脚本逐条校验执行，结果（模型说明 + 每条操作 ✓生效/✗被拒）呈现在设置页「模型决定」卡里。

1. **决定调用**（`world/world-decide.js`）：默认提示词 `WORLD_DECIDE_PROMPT` 写死事件取材与输出契约；设置页「模型决定」卡的**决定提示词**框打开就显示当前生效的完整正文（留空时自动铺入内置默认，所见即模型所收），直接改、清空则恢复跟随默认，`world.decidePrompt` 存改写版。世界书侧输入按本轮聊天去 facts 索引匹配条目（`uid|类别|标题|摘要`，上限可设），不铺全文。模型与温度可在设置里单独覆盖（独立接口模式生效；酒馆连接沿用当前模型）。`world.decideAuto` 关掉后退回"只认正文指令块"的降级模式（指南随现状注入，回复末尾 ```world 代码块照旧解析）。
2. **脚本执行**（`world/world-runtime.js`）：越界数值、未知操作、超长文本只拒绝不炸；同楼重 roll 先撤销上一版指令（含被它到期了结的事件）再落新账。
3. **操作集**：`advance`（天/分钟）、`setClock`、`addEvent`（scope near|world、basis 依据必写、weight minor|major|rumor、days 有效天数≤90）、`resolveEvent`、`pinEvent`、`setInfo`（weather/location/era/reputation 名声/wanted 通缉度）。
4. **事件取材规则**（提示词里写死，可改写）：事件从聊天记录里有依据地长出来，题材不拘（市井琐事、势力动作、传闻），basis 必须写清从哪来；没有依据不记，不把世界书里的原著桥段照搬成事件。**rumor=传闻**：未证实消息，正文不得当事实写，查证后 resolveEvent 了结并另记真相或戳穿。**机遇与危机**（拍卖会、药草成熟、仇家寻上门、势力清洗）属于世界主动投放的 major 事件：偶尔来一件、必须有依据。**名声/通缉度**只在剧情真有对应行为时更新，注入的现状行会显示。
5. **到期清扫**：时限事件推进过线自动了结并留流水；注入列表显示"剩 N 天"。
6. **持久化**：台账整体存 `chatMetadata.doupo_agent_world`，随聊天保存；切聊天自动恢复。
7. **面板**：全部集中在设置页「世界运转」——世界时间与现状卡（时钟、手动推天/设钟，时期/所在地/天气/名声/通缉度五个信息字段手动设定）、双栏事件（剩余天数、传闻标记、了结/置顶）、手动登记事件（范围/分量含传闻/依据/有效期）、模型决定卡、指令指南与决定提示词改写、指令流水。手动操作与模型决定走同一套校验。

上限保护：单批最多 12 条操作（解析截断 12、运行时执行上限 12，已对齐）、事件单栏最多 60 条（先清已了结、再清未置顶最老的，置顶永不清理）、事件文本 300 字、信息字段 80 字、单次推进最多 365 天；同栏同文的进行中事件不重记（`duplicate_text`）。


## 目录

- `core/`：协调器、回合管线、六阶段实现、编排器、状态库、提交恢复、质量门、数据合同、审计与账本。
- `world/`：世界事件系统——台账运行时（时钟/双栏事件/指令校验）、指令解析与注入文本、随聊天的存取。
- `narrative/`：事实库、正文核验、历史事件适配与恢复。
- `request/`：请求分类、路由、行动结算、世界推进。
- `npc/`：NPC 计划、决定守卫、冲突协调与提交门禁；`npc-ledger.js` 人物簿（档案与好感台账）、`npc-recorder.js` 生成后的记录员提示词与补丁解析。
- `host/`：宿主能力预检、设置与存档、模型客户端、消息投递、状态持久化、控制台视图与样式。
- `index.js`：浏览器入口；`run-tests.mjs`：递归运行全部模块测试；`demo-turn.mjs`：离线跑完整一轮。

## 人物簿（`npc/npc-ledger.js`）

正文落地后，人物记录员做一次独立小调用：读最近两楼正文 + 人物簿索引 + 命中的世界书条目，只回一张补丁清单（`{"人物":[{"姓名":"萧炎","好感":3,"理由":"挡了一掌"}]}`），合并交给脚本——好感只记增减，**单次最多 ±10**（模型写 +95 也只记 +10，跨轮累加、±100 封顶），流水只追加、改一次版本号加一、认不出的字段原地忽略、坏 JSON 直说不动档案。下一次生成前按“在场/不在场 × 重要/不重要”四象限挑人写进正文提示词：在场且重要给全字段，其余给一行，又不在场又不重要就不注入；超预算从最不重要的人开始降级成一行，不硬截断。档案跟着聊天存 `chatMetadata['doupo_agent_npc']`，设置页「人物簿」可开关、调节奏、看档案、手动记账；名单里点「改在场 / 改不在场」「标重要 / 降普通」可直接纠正四象限，下一轮照新档位注入。记录员这一路小调用的连接（跟随酒馆 / 自定义接口地址、密钥、协议）和生成参数（模型、温度、输出上限、top_p、两个惩罚项）全在「记录员参数」里填，填 0 或留空即沿用全局。

**按世界书重抽**：正文只写了半截的人，可以点「按世界书重抽：只填空着的字段」——脚本按姓名/别名/称号去原著设定库逐条找，只把还空着的字段补上，正文记下的身份、好感、流水一律不动；“设定库里没找到”会点名报出来。单个人行里的「重抽」是覆盖式重写：身份/外貌/身体/性格/资产按世界书重来，好感、流水、态度、处境、秘密不动（弹窗确认后执行）。

**玩家处境接线口**：记录员要知道“玩家此刻在哪、什么境界”才分得清“萧炎赶来”是赶去哪。这项不自己猜，等外部接：`doupoAgent.npcLedgerSetPlayerContext(() => ({ location: '萧家后院', realm: '斗者三星' }))`，没接就不注入这一行。

## 三个宿主适配器

- **模型**（`host/llm-client.js`）：连接方式二选一（`llm.mode`）——跟随酒馆当前 API（`generateQuietPrompt`）或自定义接口；自定义接口支持 OpenAI 兼容（`/chat/completions`）与 Anthropic 兼容（`/v1/messages`，`x-api-key` 鉴权、system 独立字段、content 文本块拼接）。旧版只有 `useSillyTavernConnection` 开关的配置会按老开关自动迁移到 `mode`。没配好时这一轮直接返回“模型连接未配置”，不会静默跳过。
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
- `doupoAgent.npcLedger` / `doupoAgent.npcLedgerRecord()` / `doupoAgent.npcLedgerApply(patch)` / `doupoAgent.npcLedgerExtract({ names, overwrite })` / `doupoAgent.npcLedgerSetPlayerContext(fn)` / `doupoAgent.npcLedgerStatus()`：人物簿的查、记、手填、按世界书重抽、玩家处境接线与控制台状态。
