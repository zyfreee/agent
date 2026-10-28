# 斗破苍穹 · 卡面（封面 + 身份创建）

首楼那张卡面：上半截是简介和「需要的东西」，点「开始创建身份」翻六页填玩家信息，确认后把身份写进斗破 Agent 的纳戒，并把第一句话发出去。

由两块组成，各管各的：

| 文件 | 是什么 | 干什么 |
| --- | --- | --- |
| `regex.json` | 两条酒馆正则 | 把首楼的 `[DPC_COVER]` 换成可见卡面；另一条拦住提示词，不让整页 HTML 进模型 |
| `opening-script.json` | 一条酒馆助手脚本 | 依赖体检、六页表单、预览、提交、写纳戒 |
| `page.html` | 卡面的 HTML + CSS | 只这一份源，改完重跑 `build.mjs` |
| `script.js` | 脚本源码 | 同上 |

`regex.json` / `opening-script.json` / `first-mes.txt` / `preview.html` 都是编译产物，别直接改，改 `page.html` 和 `script.js` 后重跑：

```bash
node cover/build.mjs     # 重新生成产物
node cover/test.mjs      # 22 项离线自检
```

`preview.html` 只是拿来在浏览器里看排版的离线页，不参与导入。

## 装进卡里

1. **正则**：酒馆 → 角色 → 该角色 → 「正则」→ 导入 `cover/regex.json`（或者复制里面两条，逐条新建）。两条都要，缺一条模型就会吃到整页 HTML。
2. **脚本**：酒馆助手（JS-Slash-Runner）→ 脚本库 → 新建 → 导入 `cover/opening-script.json`；也可以只把 `script.js` 的内容粘进去。要挂到这张卡上。
3. **首楼**：把角色卡的「第一条消息」改成一行 `[DPC_COVER]`（内容见 `cover/first-mes.txt`）。
4. 开一个新聊天，首楼就会显示卡面。

## 六页都问什么

| 页 | 内容 | 去处 |
| --- | --- | --- |
| 1 · 身份 | 姓名（必填）、性别、年龄 | 纳戒 `profile` |
| 2 · 来历 | 种族、出身、所属 | 纳戒 `profile` |
| 3 · 修为与处境 | 境界 + 段位、此刻在哪、此刻的处境 | 境界进纳戒；后两项进 `opening`，同时喂给人物簿的「玩家此刻」 |
| 4 · 开局 | 从哪个时间点开始、想怎么开场 | 只进 `opening`，影响这一句话怎么写 |
| 5 · 天赋与外貌 | 天赋（60 字）、外貌（160 字） | 纳戒 `profile` |
| 6 · 确认 | 预览第一句话 + 档案摘要 | 确认后才会发出去 |

前五页都能「上一步」回去改，中途「先不填了」退回封面，草稿留着，下次点「开始创建身份」接着填。

## 它靠什么判断「需要的东西」有没有到位

卡面里每条需求带一个 `data-need` 名字，脚本按名字打勾或打感叹号：

| `data-need` | 判断方式 |
| --- | --- |
| `client` | `getTavernVersion()` 是否 ≥ 1.18.0 |
| `helper` | 酒馆助手有没有把变量接口挂上来 |
| `bridge` | `window.doupoAgent` 在不在（斗破 Agent 扩展有没有启用） |
| `worldbook` | 当前角色的 `data.extensions.world` 有没有填 |
| `model` | `context.onlineStatus` 是不是断的 |
| `library` | 固定显示「以后再说」 |

判断不出来的一律留空，不瞎打勾。

## 后面要往「需要的东西」里加条目

只改 `cover/page.html` 里 `data-dpc-needs` 那个 `<ul>`，照抄一行的结构：

```html
<li data-p="item" data-need="随便一个名字"><span data-p="mark">·</span><span data-p="need">要写给人看的话<span data-p="note">小字补充</span></span></li>
```

然后重跑 `node cover/build.mjs`。

- 想让新条目**自动打勾**，还得在 `cover/script.js` 的 `probeNeeds()` 里给它加一行判断（返回 `'ok'` / `'warn'` / `null`）。
- 不加也行：名字对不上就一直是那个灰点，当纯说明用。

## 后面要往向导里加一页

在 `cover/script.js` 里动三处，不用碰 HTML：

1. `STEP_TITLES` 数组里加标题（末页「确认」必须留在最后）。
2. `stepHtml()` 里按序号加一个分支，控件上写 `data-field` / `data-realm` / `data-opening` 之一。
3. 如果是新字段，往 `PROFILE_FIELDS`（进纳戒）或 `OPENING_FIELDS` + `OPENING_CAPS`（只影响开场话术）里加名字。

`collect()` 和 `syncDraftFields()` 是按属性名收值的，不用改。加完记得 `SCHEMA` +1 并在 `normalizeDraft()` 里给旧草稿一条迁移路径，否则老聊天里的半截草稿会被丢掉。

## 提交后发生什么

1. 身份写进聊天变量 `dpc_player`（换聊天各存各的）。
2. 调 `doupoAgent.selfApplyPersisted([...])` 把八项身份和境界写进纳戒**并落盘**（`agent/doupo-agent-ui/index.js` 里新加的那个入口；只调 `selfApply` 不落盘，刷新就没了）。
3. 调 `doupoAgent.npcLedgerSetPlayerContext(...)`，让人物簿知道「玩家此刻」在哪、什么境界、叫什么——这条线只认 `name` / `realm` / `location` / `status` 四项，多喂没用。
4. 把拼好的第一句话通过 `/setinput` + `/trigger` 走酒馆正常发送链发出去。没有斜杠接口时，降级成写进输入框让用户自己按发送。

## 点了没反应？按顺序查这四样

卡面是「正则画出来的静态 HTML」+「脚本接管按钮」两半。**只导了正则，卡面能看，但按钮永远不会动**——因为没有任何代码在听点击。

1. **看卡面底部那行小字**。现在卡面最下面加了一句自检提示：「若这行字一直不消失：卡面脚本没接管……」。脚本一旦挂上就会把这行删掉。
   - 这行还在 → 脚本没跑，查第 2、3 条。
   - 这行没了但按钮还是不动 → 脚本跑起来了，是别的问题，把浏览器控制台（F12）的报错发我。
2. **酒馆助手（JS-Slash-Runner）装了没、启用没**。没装的话卡面只是张图，一切交互都不会有。酒馆 → 扩展 → 确认 JS-Slash-Runner 是绿的。
3. **脚本导进去并挂到这张卡上了没**。酒馆助手 → 脚本库 → 应该有名字叫「斗破卡面 · 身份创建」的一条，且**启用**。导入 `cover/opening-script.json` 是「导入脚本」，不是导入正则；如果你之前只导了 `regex.json`，就是这里缺的。
4. **首楼是不是真的一行 `[DPC_COVER]`**。首楼得是这一行标记，正则才认得出。若首楼是你自己写的别的话，把标记加进去（或直接改角色卡的第一条消息，内容见 `cover/first-mes.txt`）。

另外：**已经开过的旧聊天，首楼内容是定死的**。改了角色卡的第一条消息只影响新开的聊天。旧聊天里要看到卡面，得新开一个聊天。

想不装酒馆先看效果：用浏览器直接打开 `cover/preview.html`。这一页把 `script.js` 也塞进去了，点「开始创建身份」能翻页、能填、能预览，跟卡里跑的是同一份脚本（区别只是没有酒馆的变量接口，填的东西存在浏览器本地）。如果这里点得动、卡里点不动，那就一定是上面第 2/3 条的问题。

## 已知边界

- 卡面所有选择器都是 `data-*`：酒馆会给消息里的 class 加 `custom-` 前缀，class 靠不住。
- 提交过一次后，草稿里 `committed: true`，「需要的东西」全部标为已就绪，首楼再打开直接进最后一屏。
- `opening` 那四项不写进纳戒档案，只存在聊天变量和那条开局消息里。以后想让 Agent 长期记住「现在在哪」，得走人物簿那条线或另外加档案字段。
- 只在离线自检和扩展单测里验证过，没有在真实酒馆里点过。
