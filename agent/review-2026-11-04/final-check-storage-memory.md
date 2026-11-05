# storage / memory 最终证据复核

原始P1共14项：保留13项，MU-04降为P2，共1项需纠正严重级别。另纠正feature_status的swipe子断言1处，不计入P1。

仅写本报告和同名JSON，未改源码、存档、配置、原始报告或生成件。

## MU-01 — confirmed / P1

源报告标题：收养布尔护栏放行后整账覆盖，退役项与本地新账不受保护

混合退役m1/外来m9让some放行，整份restore后m1复活、本地m2丢失、retiredIds清空。源码及内存复核成立。

依据：index.js:724-733,834-839,882-887,907-914；host/db-tables.js:953-958

入口：默认DB开启；需宿主DB及混合旧/新表。

## MU-02 — confirmed / P1

源报告标题：restore只按存活条目续号，复用退役ID

新增m1→忘记→restore→新增，当前entries=m1且retiredIds=[m1]。seq只看存活entries；恢复入口可达。

依据：memory/memory-runtime.js:131-133,393-397；index.js:201-202,242-243,882-884

入口：默认恢复后自动决定或面板新增可达。

## MU-03 — confirmed / P1

源报告标题：总结提交未核对输入版本，可把等待期间删除的事实重新写回

总结等待只验证聊天身份，未验证账本输入。捕获m1/m2后忘记m1，旧摘要仍成功，仅consumed m2但正文带m1事实。

依据：index.js:127-137,4185-4209,4217,6504-6505；memory/memory-runtime.js:324-327,371-378；host/host-storage.js:236

入口：默认总结阈值6；等待中操作面板可达。仅验证结构，不调用模型。

## MU-04 — downgrade / P2

源报告标题：决定承诺12条，runtime默认只执行8条，余项静默消失

原证据漏掉index514显式maxOps:12，4147复用该实例；parser允许12。合法12条实测parsed12、生产配置applied12、无参工厂applied8。默认P1不成立，降为无参工厂合同P2；未找到生产无参创建入口。

依据：index.js:514,4147；memory/memory-decide.js:16,101-115；memory/memory-runtime.js:35,113-115,276

入口：默认路径不触发8条截断；仅无参工厂边界。

## SS-01 — confirmed / P1

源报告标题：整栈消耗保留零数量，重载或数据库往返复活一件

全栈3-3留count0，restore变1。入口需收窄：inline用updateItem/无count删除，面板数量0也用updateItem；带count removeItem经默认面板手动决定或独立通道可达，核心持久化错误保留P1。

依据：self/self-runtime.js:96-108,398-405；self/self-decide.js:30,51-58；host/mvu-arbiter.js:293-313；index.js:1354,6414-6416,6441

入口：默认手动决定可达；不是默认inline自动消耗必触发。

## SS-02 — confirmed / P1

源报告标题：update 校验失败前已改字段，拒绝结果不代表账本未变

update先改name再校验count。name已变/count=-1返回bad_count而名字已变。inline及面板预检不代表手动决定有预检；决定schema count仅number，拒绝处理仍须原子。

依据：self/self-runtime.js:353-390；self/self-decide.js:51-58；index.js:1342-1355,6414-6416,6441

入口：默认手动决定/显式独立通道混合非法count可达；非声称正常inline产生负数。

## SS-03 — confirmed / P1

源报告标题：撤销不是完整逆操作，且失败被当成已撤销

默认MVU首次setRealm后同楼新版只改金币，撤销空境界失败仍保留斗者，已复现。数量0撤销换ID源码成立；稳定opId子例仅API合同，不是默认模型输出。

依据：self/self-runtime.js:263-271,377-383,493-508；host/mvu-arbiter.js:225-244,493；index.js:335-356

入口：默认inline同楼回复变化可达；限制opId子例范围。

## SS-04 — confirmed / P1

源报告标题：MVU 重生成先按旧版结果做差分，runtime 随后撤销导致引用失效

第一版丹3、第二版丹2生成update b1；apply撤第一版先删b1，update拒id_not_found，行囊空。已组合当前生产函数复现。

依据：host/mvu-arbiter.js:293-313,479-493；self/self-runtime.js:496-497；index.js:335-356,530-536

入口：默认inline、MVU可用且同楼重生成可达。

## SS-05 — confirmed / P1

源报告标题：恢复丢掉同楼撤销基线，刷新后重新生成重复累计

restore清lastFloor/opIdMemory；加10→restore→同楼加10得到20。必须限制作用域：默认inline金币setGold，同值重放为clean不翻倍；但默认面板手动决定及独立通道允许addGold/addItem，仍是核心恢复正确性P1。

依据：self/self-runtime.js:553-561；self/self-decide.js:26,30；host/mvu-arbiter.js:241-244,293-313；index.js:792,1354,6441

入口：默认手动决定可达；不得推广为默认inline所有状态重复累计。

## SS-06 — confirmed / P1

源报告标题：没有本地存档时新空戒时间戳阻止数据库恢复，随后反向覆盖数据库

无本地档reset产生now，旧DB guard拒绝；随后无论收养与否都mirror当前空戒。DB11月3日/本地11月4日返回false。覆写为源码条件链，不宣称真实档已损坏。

依据：self/self-runtime.js:70-87,565-566；index.js:714-719,790-809；host/db-bridge.js:171-208

入口：默认DB开启且宿主可用、本地元数据缺失、DB较旧非空可达。

## SS-07 — confirmed / P1

源报告标题：数据库异步写入及延迟回拉没有聊天身份护栏

桥无聊天epoch，切聊天不取消debounce/await任务，index收养await后无continuation。明确CRUD=false后fallback：A挂起→切B→释放，B出现A物；A回调排队→切B，handler收到A view。

依据：host/db-bridge.js:131-148,171-175,200-227,242-256,271-277；index.js:214-215,229-243,805-810,909-914

入口：默认DB开启且当前聊天型API可用；真实API绑定行为未验证。

## SS-08 — confirmed / P1

源报告标题：仲裁等待后仍使用旧聊天楼号，能向新聊天落账

仲裁sleep/readLatest后不复核聊天/回复，index外层continuation仅管清pending。等待中切B/reset，读与B时间戳一致金币123帧，B落123并persist一次；时间戳守卫不阻止该场景。

依据：host/mvu-arbiter.js:385-391,464-497；index.js:335-361,530-536

入口：默认inline、MVU可用，等待期切聊天可达；非所有跨聊天帧必过时间戳。

## SS-09 — confirmed / P1

源报告标题：多个镜像同时协调同一旧视图，产生重号行或旧快照覆盖新账

ensure不串行mirror，persistSelf不await。明确CRUD=false触发fallback：旧count1挂起，新count2先完成，释放旧写入后最终count1。本轮确认旧覆盖新，不声称重号行已另行复现。

依据：host/db-bridge.js:69-128,171-227；index.js:796-797,848-854,885-887

入口：默认DB开启；连续镜像交错且CRUD失败可达。

## SS-10 — confirmed / P1

源报告标题：数据库镜像不是完整快照，但收养会整份替换并丢掉未入表字段

补读DDL证实斗技无progress、制作无count、多类无note/source；编解码不保留，收养整份restore。内存roundtrip：skillProgress/itemNote/craftCount缺失，craftNote保留，不能误称所有备注都丢。

依据：host/db-tables.js:140-153,188-254,607-621,683-701；index.js:805-825

入口：默认DB开启；投影字段差异通过时间戳guard可触发其他未入表字段丢失。

## SS-feature-swipe — reject / not_a_finding

源报告标题：feature_status / 同楼重新生成/撤销/去重

拒绝auto floor不绑定新swipe身份这一子断言：1306检查旧continuation.current()，127-137包含reply/tail的swipe_id、mes及对象身份；换swipe后旧continuation失效，不被already_decided挡住。1347空决定不调用apply([])仍真实，本轮不新增发现。

依据：index.js:127-137,1303-1308,1347-1354

## 补读与边界

- C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/host/host-storage.js：完整补读1-435，默认设置/mergeSettings；436以后未重读。
- C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/host/db-tables.js：完整补读91-334生产表定义；589-625、658-726、922-964及往返必要函数。
- C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/index.js：127-146、195-245、335-370、500-537、711-919、1294-1356、4090-4228及必要面板调用。
- C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/memory/memory-runtime.js：仅原P1限额、ID、恢复、总结生产段。
- C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/self/self-runtime.js：仅原P1清洗、update/remove、撤销、restore/reset生产段。
- C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/host/db-bridge.js：生产1-297；默认接线、异步/回退/debounce边界。
- C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/host/mvu-arbiter.js：仅原P1差分、时间戳和异步外壳。

未重读测试全文或重跑整套测试。只运行纯逻辑与内存假宿主，不访问真实存档/配置或模型。DB最终反例使用明确CRUD失败，证实fallback跨聊天串写与旧覆盖新；早期失败夹具不作为结论依据，重号行本轮未另证。真实API是否固定源聊天仍未验证。当前工作树无完整起止锁定；最终index/memory-runtime哈希与原报告相同。

复核到此停止，不新增发现或扩大建议，不进入实现。完整coverage/findings/reviewed_findings及最终哈希见同名JSON。
