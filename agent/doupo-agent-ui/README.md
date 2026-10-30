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
3. **操作集**：`advance`（天/分钟）、`setClock`、`addEvent`（scope near|world、basis 依据必写、weight minor|major|rumor、days 有效天数≤90）、`resolveEvent`、`pinEvent`、`setInfo`（weather/location/era/reputation 名声/wanted 通缉度）、`addTask`（title/detail/basis/days 时限）、`completeTask`、`deleteTask`、`updateTask`、`setFaction`（势力名/stance 敌对|警惕|中立|友好|同盟/动向/依据，按名字 upsert）、`deleteFaction`、`setPerson`（人物名/态度/依据）、`deletePerson`、`setTension`（世界氛围 calm 平静|rising 升温|storm 风波）。事件可带 `location`（事发地点）；决定规则要求事件符合所在地特征（魔兽山脉是兽袭与药草，帝都是权贵与阴谋），氛围决定每轮投放事件的频率与烈度。任务规则：玩家承诺或接下的事、人物托付、剧情给出的明确目标才立任务；任务栏会注入给正文模型，完成后 completeTask、作废 deleteTask、进展 updateTask。势力与人物只在剧情真的接触或关系变化时更新，不照世界书预登记。季节为推导值：一年 360 天四季轮转，注入的时钟行与面板都显示季节，环境描写要跟季节对上；固定大会/仪式用 addEvent 带未来 day 登记成预定事件（注入标「预定：第X天」）；advance 一次跨 7 天以上（闭关、赶路）时，决定模型必须补 1-3 条跳跃期间的动向事件，出关时世界不是原地等你。`advance`（天/分钟）、`setClock`、`addEvent`（scope near|world、basis 依据必写、weight minor|major|rumor、days 有效天数≤90）、`resolveEvent`、`pinEvent`、`setInfo`（weather/location/era/reputation 名声/wanted 通缉度）、`addTask`（title/detail/basis/days 时限）、`completeTask`、`deleteTask`、`updateTask`。任务规则：玩家承诺或接下的事、人物托付、剧情给出的明确目标才立任务；任务栏会注入给正文模型，完成后 completeTask、作废 deleteTask、进展 updateTask。
4. **事件取材规则**（提示词里写死，可改写）：事件从聊天记录里有依据地长出来，题材不拘（市井琐事、势力动作、传闻），basis 必须写清从哪来；没有依据不记，不把世界书里的原著桥段照搬成事件。**rumor=传闻**：未证实消息，正文不得当事实写，查证后 resolveEvent 了结并另记真相或戳穿。**机遇与危机**（拍卖会、药草成熟、仇家寻上门、势力清洗）属于世界主动投放的 major 事件：偶尔来一件、必须有依据。**名声/通缉度**只在剧情真有对应行为时更新，注入的现状行会显示。
5. **到期清扫**：时限事件推进过线自动了结并留流水；注入列表显示"剩 N 天"。
6. **持久化**：台账整体存 `chatMetadata.doupo_agent_world`，随聊天保存；切聊天自动恢复。
7. **面板**：全部集中在设置页「世界运转」——世界时间与现状卡（时钟、手动推天/设钟，时期/所在地/天气/名声/通缉度五个信息字段手动设定）、双栏事件（剩余天数、传闻标记、了结/置顶）、**任务卡（进行中/已逾期/已完成全部列出，详情完整展示，每条可手动完成/删除，也可自己接任务）**、手动登记事件（范围/分量含传闻/依据/有效期）、模型决定卡、指令指南与决定提示词改写、指令流水。手动操作与模型决定走同一套校验。

上限保护：单批最多 12 条操作（解析截断 12、运行时执行上限 12，已对齐）、事件单栏最多 60 条（先清已了结、再清未置顶最老的，置顶永不清理）、事件文本 300 字、信息字段 80 字、单次推进最多 365 天；同栏同文的进行中事件不重记（`duplicate_text`）。


## 悬浮球（`host/orb-hud.js`）

屏幕右侧挂一颗小球；点一下，球竖直拉伸成一根胶囊长条（顶上和底部都是半圆），条上从上到下排八个图标：总控 ⌂、世界运转 ◌、纳戒 ◉、人物簿 ☰、冷藏推进 ❄、世界影响 ⌁、原著资料 ▤、沙盒模式 ◈。点图标弹出对应功能的**只读信息窗**——世界运转只有时钟/时期/所在地/天气/名声/通缉度与双栏事件、任务；纳戒只有身份/境界/金币/行囊/炼制/目标；人物簿只有档案计数与人物一览（好感刻度照搬）；其余各窗同理。没有按钮、没有输入框，改状态仍走设置面板。

交互：再点同一个图标关信息窗（长条保留）；点球或按 Esc 或点页面其他地方收起整条；换图标直接换窗。信息窗在回合状态事件到达时自动刷新。设置页「总控」的**显示悬浮球**开关（`showOrb`，默认开）控制显隐；配色跟随界面颜色三主题。

分工：`host/orb-hud.js` 是纯逻辑（图标清单 `ORB_ITEMS`、展开/收起状态机 `createOrbState`、八个信息窗的数据投影 `buildOrbPanels`），全部输入可为 undefined、不碰 DOM；挂载、动画与事件接线在 `index.js`（`mountOrbHud`/`syncOrbHud`/`collectOrbData`），样式在 `host/style.css` 的「悬浮球」段。哪路运行时没就绪，对应的窗就显示「暂无」，不会报错。`dev/orb-smoke.html` 是离线冒烟页：静态服务器打开后自动激活扩展并灌演示数据。


## 目录

- `core/`：协调器、回合管线、六阶段实现、编排器、状态库、提交恢复、质量门、数据合同、审计与账本。
- `world/`：世界事件系统——台账运行时（时钟/双栏事件/指令校验）、指令解析与注入文本、随聊天的存取。
- `memory/`：主角记忆——小记忆/大记忆两层（按需召回，永不过期）的台账运行时、召回注入、指令解析、决定提示词、随聊天的存取。
- `self/`：纳戒——主角自身状态与随身之物的运行时（身份/境界/功法/斗技/行囊/制作台/目标）、指令解析与注入文本、决定提示词、随聊天的存取。
- `narrative/`：事实库、正文核验、历史事件适配与恢复。
- `request/`：请求分类、路由、行动结算、世界推进。
- `npc/`：NPC 计划、决定守卫、冲突协调与提交门禁；`npc-ledger.js` 人物簿（档案与好感台账）、`npc-recorder.js` 生成后的记录员提示词与补丁解析、`npc-cold-runtime.js` 冷藏选择/日期游标/预览台、`npc-cold-recorder.js` 冷藏推进提示词。
- `host/`：宿主能力预检、设置与存档、模型客户端、消息投递、状态持久化、控制台视图与样式、数据库桥接（纳戒/世界台账 ↔ 龙血玄黄·数据库）、悬浮球纯逻辑（`orb-hud.js`）。
- `index.js`：浏览器入口；`run-tests.mjs`：递归运行全部模块测试；`demo-turn.mjs`：离线跑完整一轮。

## 人物簿（`npc/npc-ledger.js`）

正文落地后，人物记录员做一次独立小调用：读最近两楼正文 + 人物簿索引 + 命中的世界书条目，只回一张补丁清单（`{"人物":[{"姓名":"萧炎","好感":3,"理由":"挡了一掌"}]}`），合并交给脚本——好感只记增减，**单次最多 ±10**（模型写 +95 也只记 +10，跨轮累加、±100 封顶），流水只追加、改一次版本号加一、认不出的字段原地忽略、坏 JSON 直说不动档案。下一次生成前按“在场/不在场 × 重要/不重要”四象限挑人写进正文提示词：在场且重要给全字段，其余给一行，又不在场又不重要就不注入；超预算从最不重要的人开始降级成一行，不硬截断。档案跟着聊天存 `chatMetadata['doupo_agent_npc']`，设置页「人物簿」可开关、调节奏、看档案、手动记账；名单里点「改在场 / 改不在场」「标重要 / 降普通」可直接纠正四象限，下一轮照新档位注入。记录员这一路小调用的连接（跟随酒馆 / 自定义接口地址、密钥、协议）和生成参数（模型、温度、输出上限、top_p、两个惩罚项）全在「记录员参数」里填，填 0 或留空即沿用全局。

**按世界书重抽**：正文只写了半截的人，可以点「按世界书重抽：只填空着的字段」——脚本按姓名/别名/称号去原著设定库逐条找，只把还空着的字段补上，正文记下的身份、好感、流水一律不动；“设定库里没找到”会点名报出来。单个人行里的「重抽」是覆盖式重写：身份/外貌/身体/性格/资产按世界书重来，好感、流水、态度、处境、秘密不动（弹窗确认后执行）。

**玩家处境接线口**：记录员要知道“玩家此刻在哪、什么境界”才分得清“萧炎赶来”是赶去哪。这项不自己猜，等外部接：`doupoAgent.npcLedgerSetPlayerContext(() => ({ location: '萧家后院', realm: '斗者三星' }))`，没接就不注入这一行。

**冷藏推进台**：在人物名单左侧勾选需要“留在后台生活”的人，时间只看世界台账当前是第几天。点“扫描需要推进的人物”后，脚本只挑姓名/别名/称号确实出现在新事件里的冷藏人物；模型只收到原档案、实际日期差、相关事件和最近正文参考，先生成草稿。草稿会停在面板里，逐份点“确认写回人物簿”才调用人物簿的唯一写入口；点“放弃”不会改档案。第一次勾选只建立当天基线，不会把过去的事件硬补给人物；同一天没有新牵连事件不会调用模型；冷藏台不会推进世界钟、不会替其他人写档、不会自动运行。冷藏状态存 `chatMetadata['doupo_agent_npc_cold']`，与人物档案分开。

冷藏推进员可在人物簿页单独设置连接、模型、温度、输出上限、top_p、两个惩罚项和提示词；默认提示词要求“只按明写依据、好感单次最多 ±10、只出 JSON 草稿”。这套参数在「人物簿」页与「模型与提示词」集中页各有一份、走同一个 `data-setting` 通道；选“跟随酒馆”时接口地址、密钥与模型名会置灰，免得以为填了会生效。

## 纳戒（`self/`）

主角自身的总账，和人物簿（记别人）、世界台账（记世界）互不重叠：身份档案（姓名/性别/年龄/种族/出身/所属/天赋/外貌）、境界与段位（斗之气→…→斗帝）、金币、称号、功法、斗技、行囊（含装备中标记，同名同类别自动并账）、制作台（已掌握配方 + 炼制进度，按世界时钟倒数、显示超期）、目标约定（主线标星、达成退场）。

1. **决定调用**（`self/self-decide.js`）：与世界决定同构——生成结束后读**最近聊天 + 相关世界书条目 + 纳戒现状**，输出 `{"note":"…","ops":[…]}(≤12 条)` 由脚本逐条校验执行；`self.decideAuto` 关掉后退回“只认正文 ```self 指令块”的降级模式。决定提示词（`self.decidePrompt`）与降级指令指南（`self.guide`）都可改写：留空用内置默认、所见即模型所收，「纳戒」页和「模型与提示词」集中页各有一份、改动互通。提示词写死契约：变化必须有剧情依据、境界突破要真到位、炼成后必须补一条 `addItem` 把成品记进行囊、年龄只在剧情明确过去时间后才改。
2. **操作集**：`setProfile`（八个身份字段）、`setRealm`、`setGold`/`addGold`、`addTitle`/`removeTitle`、`addTechnique`/`updateTechnique`/`removeTechnique`、`addSkill`/`updateSkill`/`removeSkill`、`addItem`/`updateItem`/`removeItem`、`addRecipe`/`removeRecipe`、`startCraft`/`finishCraft`、`addGoal`/`finishGoal`/`removeGoal`。
3. **注入**（`self/self-ops.js`）：生成前把纳戒现状写进独立注入通道 `doupo_self`，与世界、影响、人物簿、原著设定四路互不清空；超预算从目标、进行中炼制、行囊往上丢，身份与境界永远保留。
4. **脚本执行**（`self/self-runtime.js`）：越界数值、未知操作、超长文本只拒绝不炸；同楼重 roll 先撤销上一版指令再落新账；撤销恢复保留原编号且发号器同步前进；行囊扣到 0 自动移除条目。
5. **持久化**：整份纳戒存 `chatMetadata.doupo_agent_self`，随聊天保存，切聊天自动恢复。
6. **面板**：设置页「纳戒」按子页签分六页——基本信息（身份字段逐格手改、境界突破、金币、称号、流水）、功法、斗技、行囊（装备/卸下、改数量）、制作台（配方 + 开工/成丹/炸炉）、目标（立目标/达成/移除）。手动操作与模型决定走同一套校验，改完立即记进流水。
7. **所有权边界（防双写）**：世界时钟/事件/名声通缉归「世界运转」，NPC 档案与好感归「人物簿」，纳戒只记主角自己；决定提示词里同样写明不越界。

## 数据库桥接（`host/db-bridge.js` + `host/db-tables.js`）

可选把纳戒与世界台账镜像到**「龙血玄黄·数据库」**（酒馆助手脚本，`window.AutoCardUpdaterAPI`）的表格里：**表 = 账本，扩展面板 = 前端**。数据库脚本没装或在设置里关掉（`enableDbBridge`，默认开）时全部调用静默跳过，照旧走聊天存档，零回归。

- **表结构**（`db-tables.js`，13 张，uid 固定）：纳戒 8 张（主角档案单行表含境界/金币/剧情日、称号、功法、斗技、行囊、配方、炼制台、目标）+ 世界 3 张（现状单行表、事件、任务）+ 记忆 2 张（小记忆、大记忆）。每张表的 `initNode/insertNode/updateNode/deleteNode` 全是「禁止操作。」，`updateConfig.updateFrequency=0` 让它们退出数据库自己的 AI 填表调度——数据库 AI 既不会被拉着跑、跑了也写不进，唯一写者是本扩展，无双写。
- **模板自愈**：换聊天/启动时读当前聊天模板，缺桥接表就用 `importTemplateFromData` 以 `dataMode:'merge'` 补进当前聊天（每个聊天至多一次）。注意数据库脚本的 merge 导入是**整包替换**：外来表必须随包携带才不会丢；而它又按「DDL 注释 = 表头」逐列校验整包，所以导入前会把注释与表头对不上的外来表 DDL 按表头重建（`sanitizeForeignDdl`，表名/表说明/行内容/updateConfig 不动，桥接表永不改写）——外来表的行数据与结构不受影响，只是 DDL 注释被对齐；旧语义模板带 0=沿用UI 时不置新语义标记，避免误禁外来表的自动更新。
- **模板文件**：`agent/斗破Agent数据库桥接表.json` 由 `tools/build-db-template.mjs` 从 `db-tables.js` 生成（13 张表，含 mate 结构、「禁止操作。」节点与 updateConfig，写前结构自检）。可以在数据库脚本的「导入模板」里手动导入这份文件先看表（导入全局预设后切换，或聊天作用域导入）；不导也行——扩展每个聊天会自动补。改表流程：改 `db-tables.js` → `node tools/build-db-template.mjs` 重新生成。
- **镜像**（写）：`persistSelf/persistWorld` 在存聊天档案后顺手镜像——先 `exportTableAsJson` 读最新表，reconcile 出最小差异（删除按原索引从大到小 → 逐行 updateRow → 追加 insertRow），桥接表按「编号」对行，编号为空的手工行不删不碰。
- **收养**（读）：换聊天恢复后从表里拉一次，表里有账就**以表为准**盖回 runtime（本地操作流水保留）；表为空不动。`doupoAgent.dbBridgeAdopt()` 可手动重拉。
- **外部手改回拉**：注册 `registerTableUpdateCallback`，用户在数据库可视化器里改单元格 → 去抖 500ms → 表与账不一致就按表收养并刷新面板；扩展自己的写入用时间窗屏蔽防回环。
- **冷聊天兜底**：CRUD 写入需要数据库在当前聊天已有楼层锚点；全被拒时自动改走 `importTableAsJson` 全量导入（锚定最新 AI 楼层），仍失败则记入桥状态、数据留在聊天存档不丢。
- **状态查看**：设置页「纳戒」卡底部的「数据库桥接」行（已连接/未检测到脚本/异常+原因），或 `doupoAgent.dbBridgeStatus()`。

注意：桥接表一旦建立，请勿在数据库脚本里改这 13 张表的表头或 DDL——列名与 `db-tables.js` 里的编解码一一对应（有单测锁定）；改列要走代码。

## 纳戒 → MVU 变量同步（`host/self-mvu.js`）

可选把主角档案/境界/金币/剧情日投影到 **MVU（MagVarUpdate）的 `stat_data.斗破纳戒`**（顶层平键，整体覆盖），给状态栏、EJS 模板和 MVU 生态当只读镜像。MVU 主脚本没装或被关时静默跳过，零回归。

- **写入协议**：MVU 官方的「读帧 → 改帧 → 整帧写回」——`getMvuData({type:'message',message_id:'latest'})` 取该楼变量帧，改 `stat_data.斗破纳戒`，`replaceMvuData` 写回。不要用 `setMvuVariable` 做持久化：源码里它只改内存树、不落盘。stat_data 里别人的键原样保留，缺失的 stat_data 自动建。
- **触发**：`persistSelf`（纳戒决定落账/面板改动）与换聊天恢复后各同步一次；`doupoAgent.selfMvuSync()` / `selfMvuStatus()` 可手动触发与查看。
- **与数据库桥的分工**：纳戒真账本在扩展（chatMetadata），数据库表和 MVU 变量是两个并列的下游镜像；数据库脚本对 MVU 只有读（它把 stat_data 塞进自己的 EJS 上下文），写 MVU 的责任在扩展。
- **不启用 MVU 的"深度分析"**：那是让 MVU 另调一个模型从正文提取变量的可选功能；纳戒数据的更新走扩展决定＋代码投影，零额外模型调用。

## 主角记忆（`memory/`）

主角视角的记忆总账，与各账本所有权互斥（目标约定归纳戒、任务归世界、事件归世界台账、NPC 档案好感归人物簿、原著设定归事实库——记忆一律不碰，决定提示词里写死了这条边界）。**记忆是资产：永久保存、按需召回，脚本从不过期任何记忆**，了结/删除只由书记官或玩家主动做。分两层，按分量切而不是按寿命切：

- **小记忆**（`small`）：轻量记录的近事杂事，不必重要才记，保持主角"记得这几天发生过什么"；
- **大记忆**（`big`）：值得一直记住的事（恩怨/秘密/伏笔/大事），召回优先级更高；`tag` 是可选标签（恩怨/情报/伏笔/大事记），只便于查看；
- **转大**（`promote`）：小记忆分量够了转成大记忆。
- **召回钥匙**：`related`（1-4 个人名/地名/物名）必填——没有钥匙的记忆永远召不回来，运行时直接拒绝。

1. **决定调用**（`memory/memory-decide.js`）：与世界/纳戒决定同构——生成结束后（排在世界、影响、纳戒之后，吃得到刚落的新账）读**最近聊天 + 相关世界书条目 + 本场召回的记忆**，输出 `{"note":"…","ops":[…]}(≤12 条)` 由脚本逐条校验执行；`memory.decideAuto` 关掉后退回"只认正文 ```memory 指令块"的降级模式。决定提示词（`memory.decidePrompt`）与降级指南（`memory.guide`）可改写，「主角记忆」页有完整编辑。
2. **操作集**：`remember`（小记忆）、`memorize`（大记忆）、`promote`、`resolveMemory`（了结，note≤120）、`reopenMemory`（重开）、`forgetMemory`（记错删除）；公共字段 text≤300、basis 必写≤80、related 必写≤4、quote≤60（当时的一句原话，召回时以「」带回）、weight major|minor。同层同文未了结不重记；上限 60 条，清理只影响"已了结 → 小记忆 → 一般 → 最老"，大记忆保到最后。
3. **强度与召回**（`memory/memory-ops.js`）：召回钥匙 = `related` + `aliases`（面板补的别名，药老/药尘一把抓）；生成前用**最近四楼正文**整词比对，命中的才进独立通道 `doupo_memory`。排序 = 大记忆 → 关键 → **强度**（被想起过的优先，`markRecalled` 记 recallCount/lastRecallDay，纯排练效应、不写流水、不镜像数据库）→ 新的优先；超预算从尾部丢；全不命中什么都不注。`findMemoryConflicts` 用 bigram 相似度在同钥匙记忆里找疑似重复/矛盾，面板标 ⚠ 只提醒不拦账。
4. **脚本执行**（`memory/memory-runtime.js`）：越界数值、未知操作、缺 related 只拒绝不炸；同楼重 roll 先撤销上一版指令再落新账；opId 去重防重复喂入。
5. **持久化**：整份记忆（含召回统计）存 `chatMetadata.doupo_agent_memory`；数据库桥接开启时镜像到「龙血玄黄·数据库」的两张表（小记忆/大记忆，含引文/别名/标签列），换聊天表优先收养，外部手改回拉——机制与纳戒/世界完全一致（见「数据库桥接」）。召回统计是运行时强度数据，不进数据库表。
6. **面板**：设置页「主角记忆」——总览、**排序切换（按生成时间 / 按重要性）**、**按关联过滤**（下场对手戏前按人扫旧账）、大记忆/小记忆两栏清单（转大/了结/删除/重开、引文与别名展示、⚠ 矛盾标记）、已了结、手动登记（层级+标签+关联+别名+引文）、召回开关与预算、决定开关、提示词改写、指令流水。手动操作与模型决定走同一套校验。
7. **命名空间**：`doupoAgent.memoryStatus()/memorySnapshot()/memoryApplyPersisted()/memoryDecide()/memoryRestoreFromChat()`。

## 模型与提示词（集中页）

扩展会发的每一次独立模型调用都收在设置页「模型与提示词」：全局连接（正文与默认调用，含 temperature/maxTokens/等待上限/top_p/两个惩罚项的完整参数）加七路功能模型——行动结算分类判定、世界决定、人物簿记录员、冷藏推进员、纳戒决定、世界影响记录员与场记（shared/split）、原著设定选条（跟随全局）。每路都是同一套“跟随酒馆 / 自定义”二选一，自定义带接口地址、密钥、协议、模型名（可点“拉取模型”从列表选）和采样参数，填 0 或留空即沿用全局。可改写提示词也都在这一页（四类判定、世界决定、降级指令指南、记录员、冷藏推进员、纳戒决定、影响记录员、场记、选条/卷外点选），打开就显示当前生效的全文，清空恢复内置默认。同一套设置在功能页与集中页各有一份，走同一个 `data-setting` 通道，两边改动即时互通；切页时全量重同步。NPC 决策与沙盒推进没有独立参数，跟随全局连接。

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
- `doupoAgent.npcColdRuntime` / `doupoAgent.npcColdSelect(name)` / `doupoAgent.npcColdDeselect(name)` / `doupoAgent.npcColdPreview()` / `doupoAgent.npcColdConfirm(id)` / `doupoAgent.npcColdDiscard(id)` / `doupoAgent.npcColdStatus()`：冷藏人物选择、扫描草稿、确认写回、放弃草稿和状态查看。
- `doupoAgent.selfRuntime` / `doupoAgent.selfApply(ops, { floor, day })` / `doupoAgent.selfDecide()` / `doupoAgent.selfApplyFromLatestReply()` / `doupoAgent.selfStatus()` / `doupoAgent.selfSnapshot()` / `doupoAgent.selfJournal()`：纳戒的运行时、手动落账、手动决定、正文指令块解析、状态与流水。

## 冷藏推进台验收边界

离线测试只证明模块逻辑：选择、日期游标、候选筛选、草稿确认与提示词渲染。**冷藏推进台还没有在真实酒馆里跑过一次完整流程**，下面把“已证明”和“待验收”分开写。

### 已验证（离线，可复现）

- `npc/npc-cold-runtime.test.mjs`：第一次勾选只建当天基线、不补旧事件；世界第 3 天时只对牵连事件出 1 条候选且只带该事件；确认后同一份快照不再出候选；`restore` 后选择列表保留；提示词含「单次最多 ±10」和「第 3 天 → 第 4 天」日期差。
- `node agent/doupo-agent-ui/run-tests.mjs`：63/63 通过（含本模块）。
- `node --check`：`agent/` 下 128 个 `.js`/`.mjs` 全部通过。
- 清单结构：`validate-extension-manifest.mjs --root .` 通过。

### 待执行验收（真实酒馆，尚未执行）

| 编号 | 场景 | 通过条件 |
| --- | --- | --- |
| NC01 | 勾选两名冷藏人物后点「扫描需要推进的人物」 | 只对姓名/别名/称号出现在新事件里的人出草稿，未被牵连者不出现 |
| NC02 | 同一天连续点两次扫描 | 没有新牵连事件时不发起模型请求（Console 或计费侧应无新调用） |
| NC03 | 世界日从第 3 天推进到第 4 天后再扫描 | 草稿覆盖第 3→4 天，且不重复已确认过的旧事件 |
| NC04 | 确认一份草稿 | 人物簿出现对应的流水/好感变化，且只经人物簿唯一写入口写入一次 |
| NC05 | 放弃一份草稿 | 人物簿不变；该人物下次扫描仍能重新出草稿 |
| NC06 | 刷新页面、切换聊天再切回 | 冷藏选择与未确认草稿从 `chatMetadata['doupo_agent_npc_cold']` 恢复，不串到别的聊天 |
| NC07 | 把推进员连接改成「跟随酒馆」 | 接口地址/密钥/模型名输入框置灰，扫描仍走酒馆当前连接 |
| NC08 | 自定义连接但把模型名留空 | 行为与跟随酒馆一致，不报“连接未配置” |

以上均为待执行测试，不代表已通过。

### 当前证据

本轮只做了离线校验与文档整理：没有安装到真实酒馆、没有发起真实模型请求、没有在真实聊天楼层里确认写回与重 roll。代码里“不推进世界钟、不替未勾选的人写档、不自动运行”这三条断言，目前也只在模块层验证过，尚未在真实宿主里复现。
