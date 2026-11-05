# memory / unified 只读细查（2026-11-04）

## Routing Decision

AUDIT→SWEEP→REPORT；code-quality-workflow；A0 route code-quality-workflow / ST-A0 loaded（48-64重点），snapshotVersion 2026-08-18，candidates=[]。仅授权写本JSON与同名.md；未进入CHANGE，无浏览器/模型调用。

根目录：`C:/Users/86158/Desktop/异界转生录/doupo`
模式：full-scan / general；覆盖状态 **partial**。
agent/doupo-agent-ui/memory/*、unified/*生产及测试，index记忆召回/独立决定/总结/注入/旧合并接线；不重复公共入口总控、quiet漏记、未await self→memory

HEAD：`1dee86edb89a8f6efc4b8bbd8192a3a9c1017748`。审查当前有大量既有未提交修改的工作树，不是HEAD；memory-recall为已有未跟踪文件。未修改实现/配置/真实存档。
其余目标哈希已采集于工具输出；最终写前全量复核脚本因命令长度截断失败，不能宣称工作树被冻结或所有目标始终不变。失败脚本在写文件前退出。

**主要结果：4项P1、8项P2、1项P3。六份离线测试全部通过，但新增内存边界复现确认缺陷；测试通过不代表这些边界已覆盖。**

## Must Fix Now / 全部发现

### MU-01 · P1 · 收养布尔护栏放行后整账覆盖，退役项与本地新账不受保护
- 位置：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/index.js:913`
- 触发：触发：数据库混有一条新增/改文条目和退役旧行，或缺少本地独有新条目
- 证据：724-733的some只决定整批是否收养；907-914与834-839使用整份state restore且只保留log。host/db-tables.js:953-958不带retiredIds。真实guard内存抽取：incoming=[m1退役,m9外来]、local=[m2新账]、retired=[m1]返回true。
- 影响：m1复活，m2丢失，退休登记清空，persist固化错误；纯旧子集仍被挡住，不是每次回拉都失败。
- 最小建议：按ID对账过滤退役项、保留本地独有条目及退休登记；先明确表格手删与镜像冻结优先合同，不把some当整表权威。
- 验收：离线混合旧/新增/缺项回拉覆盖两个restore调用，断言不复活、不丢本地新账、不丢retiredIds。

### MU-02 · P1 · restore只按存活条目续号，复用退役ID
- 位置：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/memory/memory-runtime.js:395`
- 触发：触发：删除最高编号后恢复快照，再登记
- 证据：131-133只增seq，393-397只从entries恢复seq，不看retiredIds。复现新增m1→删除→restore→新增，entries出现新m1同时retiredIds含m1。
- 影响：同ID代表不同事实，退役守卫误拦新记忆；旧帧/召回cache可能新旧串号。
- 最小建议：至少联合存活与退役编号恢复序号；长期高水位另定合同，不通过清空退休登记绕过。
- 验收：删最高号/删空→restore→新增不得复用退役ID；覆盖大小记忆、总结后删除大记忆与存档往返。

### MU-03 · P1 · 总结提交未核对输入版本，可把等待期间删除的事实重新写回
- 位置：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/index.js:4217`
- 触发：触发：总结await期间玩家删除/改动源小记忆，聊天正文不变
- 证据：4185捕获smalls，4209只验聊天continuation（127-137无记忆版本），4217提交旧IDs与旧摘要；runtime:325-327取仍存活交集。复现捕获m1承诺+m2→删除m1→提交旧摘要，ok且consumed仅m2，大记忆仍写m1承诺。
- 影响：主动忘记的内容复活，摘要来源与实际consumed不一致。
- 最小建议：提交前比对整批源ID及内容版本，删除/修改/转层则拒绝整批重试；只新增其他条目可按明确合同允许。
- 验收：延迟Promise测试总结期间删除/恢复/改写源，必须stale/rejected且账本不受旧结果污染；保留聊天续接保护。

### MU-04 · P1 · 决定承诺12条，runtime默认只执行8条，余项静默消失
- 位置：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/memory/memory-runtime.js:276`
- 触发：触发：独立决定输出9至12条合法操作
- 证据：memory-decide.js:16,31,112-115允许12；runtime:35,113-115默认maxOps8，276 slice；index:4147未调整。内存parsed12、applied8、rejected0、total8。
- 影响：最多4条新事实不落账且不报拒绝；该楼已决定，后续不会自动补回。
- 最小建议：统一prompt/schema/parser/runtime限额，超限显式报告，不静默截断。
- 验收：9/12/13条合法操作：合同内全落账，合同外明确拒绝，面板条数与实际一致。

### MU-05 · P2 · 总结只保留八把召回钥匙且忽略模型aliases
- 位置：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/memory/memory-runtime.js:353`
- 触发：触发：源批次超过8个独立钥匙，或模型提供有价值的新别名
- 证据：337-353 union后related4/aliases4且不用big.aliases；371-373原项删除退休。consolidate parser:98确实解析aliases。内存九钥匙只余1-8，钥匙9 hits=[]，新别名也丢失。
- 影响：原记录退休后部分事实失去召回入口，内容可读不等于召回保真。
- 最小建议：制定不丢入口的分组/拆批或可扩展别名策略，处理big.aliases；超容不应悄悄退休整批。
- 验收：9个以上独立钥匙及模型别名都能定位记忆，或明确拆批保留原项。

### MU-06 · P2 · 召回缓存缺聊天作用域和输入版本，跨聊天/同长编辑可误命中
- 位置：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/index.js:936`
- 触发：触发：分支/复制聊天有相同updatedAt、楼数、最新玩家输入；或同楼数AI编辑/改召回设置
- 证据：936-945 key仅length|latestUser|ledgerAt，979-980直接返回cache；搜索cache赋值只有932/1024，140-145失效与882-889恢复不清cache。真实key内存函数对不同chat对象返回相同key。
- 影响：复用旧聊天选条或空选结果；最终按新账本ID取条，不直接泄漏旧正文，但ID相同可选错内容，空cache整轮漏召回。
- 最小建议：key纳入scope/epoch、实际喂料楼层指纹及设置版本；换聊天清cache，不只依赖毫秒updatedAt。
- 验收：A→B→A、复制存档、同长AI编辑/swipe、相同时间戳不同记忆及prompt/方案改变不得复用错误cache。

### MU-07 · P2 · 缺失/坏类型ids误判明确空召回，绕过失败降级
- 位置：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/memory/memory-recall.js:131`
- 触发：触发：合法JSON缺ids、ids非数组，或非空数组全是未知号
- 证据：schema:38-44要求ids；131非数组置[]、138返回empty。index:1018-1029只拒invalid；1101-1107把empty/ok当已决定，1109不再兜底。复现ids:42返回empty；test:72固化缺ids当empty。
- 影响：格式失败时关键词能命中的记忆也不注入。
- 最小建议：区分显式合法ids:[]与缺字段/坏类型；全未知号制定失败合同；同步修改固化旧宽容行为测试。
- 验收：显式[]保持不兜底；缺ids/坏类型invalid并降级；全未知及混合编号各有确定结果。

### MU-08 · P2 · 同楼撤销未撤销opId去重记录，相同操作重试后账变空
- 位置：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/memory/memory-runtime.js:271`
- 触发：触发：公开runtime调用者为同楼模型操作使用稳定opId并重试/重roll
- 证据：271-275先撤销上一版，283-285旧opId仍在而跳过新操作。复现floor1/opId one连续apply：第二次noop duplicate one、entries=[]。
- 影响：原记忆被撤销、新版未记；默认prompt不公开opId，主要影响集成调用，故P2。
- 最小建议：按楼保存已提交opId，撤销同步移除去重记录；或先区分幂等重试与真正替换。
- 验收：稳定opId同楼重放保一条；不同opId替换恰好一版；跨楼幂等不退化。

### MU-09 · P2 · 注入记录保存裁剪前全集，写入失败也标成功
- 位置：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/index.js:1130`
- 触发：触发：多条记忆超预算，或setExtensionPrompt抛错
- 证据：ops:88 filter复制数组，91-94只裁内部picked；index:1105错误假定外部picked变短，1130-1135保存外部全集。1125 write后1127无条件injected。复现picked仍[m1,m2]，正文仅m1。
- 影响：面板/悬浮球声称带回实际未注入的记忆，失败显示成功，误导验收。
- 最小建议：渲染返回实际IDs/条目并据此记录；检查writeResult.status，失败不得记成功。
- 验收：裁到1条后记录也仅1条；宿主写入抛错记录failed；与实际提示词比对。

### MU-10 · P2 · 预算装满正文再加抬头，最终写入从条目中间截断
- 位置：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/index.js:1125`
- 触发：触发：正文接近预算、单条很长，或召回说明很长
- 证据：ops:91剩1条就停，即使超cap；index:1124-1125追加header/note后仍同一预算；host/prompt-injection.js:90-94整串slice并追加原著设定截断标记。内存render max200输出201。
- 影响：note/引文/依据尾部可半截，期限/限制不完整；实际总字数可超过预算。
- 最小建议：统一header/note/guide/条目总预算，按完整条目裁剪，明确单条过长合同。
- 验收：预算200/800，最长正文+note+keys+basis与300字召回note组合：总字符受控、完整条目不半截、截断记录真实。

### MU-11 · P2 · 大记忆优先截尾目录，长期账本可让新小记忆不可见
- 位置：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/memory/memory-recall.js:65`
- 触发：触发：大记忆目录占满4000字，本轮唯一相关项为新small
- 证据：54-67先所有big再small、超额丢尾；index1009默认目录无场景预筛/分页。300big+1相关small复现3989字133行，无small；成功召回不走关键词兜底。
- 影响：永久存储不等于永久可召回，小记忆可持续被目录饿死。
- 最小建议：按场景可解释预筛并给两层配额，或分页检索；不按全局层级盲截。
- 验收：big填满目录时，唯一相关新small与唯一相关旧big均进候选，仍保持预算。

### MU-12 · P2 · 退休登记仅200个，超过窗口旧帧可复活最早删除的事实
- 位置：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/memory/memory-runtime.js:262`
- 触发：触发：累计超过200个不同ID退休，数据库重放更老存储帧
- 证据：91/108/255-262封顶200；index724-733只认当前retired集合。201次新增/删除复现length200且m1已不在集合。
- 影响：长期聊天重新收养已经忘记或已总结的小记忆；宿主老帧可重放范围未实测。
- 最小建议：明确退休版本/高水位或受支持帧保留范围，不只扩大魔数；与MU-02分别设验收。
- 验收：201次以上退休跨reload后重放最早帧不得复活；有界窗口必须证明宿主重放上界。

### MU-13 · P3 · 旧文档仍宣称可启用合并模式，与退役兼容合同相反
- 位置：`C:/Users/86158/Desktop/异界转生录/doupo/agent/doupo-agent-ui/README.md:162`
- 触发：触发：维护者按self.decideMerged/省调用说明配置或改三处字典
- 证据：README162-173描述可启用/delegated；同文件190已写退役。index4368恒false，4376-4379只retired；host-storage336-337清旧开关。
- 影响：误判旧模块仍在生产调用，尝试开启已删除开关。
- 最小建议：收敛文档为已退役及兼容返回值，不为满足旧文档恢复合并调用。
- 验收：文档不再称旧开关可启用；公开unifiedDecide仍retired且不调用模型。

## 功能逐项状态

- **记录与去重 — issues_confirmed**：同层同文去重、逐条拒绝、清洗有效；MU-04限额与MU-08同楼opId相互作用有缺陷。
- **大小记忆 — stable_with_boundaries**：runtime287-295模型memorize降small、promote拒绝；panel可手动memorize/promote。大小均按需召回，开头big常驻注释过时。
- **永久保留/退休 — issues_confirmed**：不按天过期、不封顶entries有效；forget/consolidate退休。MU-01/02/12破坏回拉恢复长期一致性。
- **总结保真 — partial**：输入45-61保留title/text/note/quote/keys/basis/day，非法结果不落账；MU-05丢入口。语义/引文真实性只有prompt约束，无源档持久链接，本次未发模型，不能验收内容保真。
- **总结并发 — issues_confirmed**：防重复总结调用及聊天continuation有效；MU-03不检账本输入版本；其他新增条目不在旧IDs中不会被本次consumed。
- **cache/跨聊天 — issues_confirmed**：MU-06；运行中continuation阻止旧模型提交，不等于完成cache已隔离。
- **失败降级 — issues_confirmed**：坏JSON/连接失败/关闭/busy会关键词兜底；显式ids[]不兜底符合设计；MU-07坏形状误判空。
- **候选/预算/注入记录 — issues_confirmed**：最多25ID、坏号/重复过滤、关键词big/major/new排序有效；MU-09/10/11分别是记录不实/二次切断/目录饥饿。
- **独立决定接线 — issues_confirmed**：index4090-4163独立prompt/schema→runtime→persist→auto总结可达；MU-04。公共入口三项由总控独立报告。
- **旧合并/兼容合同 — retired_compatibility**：unifiedActive恒false，runUnifiedDecision只retired；4604仍公开导出，6441/6508保留恒假分支。unified纯函数仅测试/README引用，index未导入。不能把公开兼容壳一并判为死代码。

## Coverage（逐文件）

reviewed = 全文源码阅读；partial = 只读相关范围/断言。所有测试执行不等于所有测试fixture逐行review。

- `agent/doupo-agent-ui/memory/memory-runtime.js` — **reviewed**；原因：无；证据：全文1-417；操作、清洗、恢复、退休、同楼撤销、总结与调用侧；离线边界复现
- `agent/doupo-agent-ui/memory/memory-ops.js` — **reviewed**；原因：无；证据：全文1-203；召回/渲染预算、矛盾提醒、解析剥离；真实注入边界追踪
- `agent/doupo-agent-ui/memory/memory-decide.js` — **reviewed**；原因：无；证据：全文1-116；提示词/schema/user/解析12条合同与runtime对照
- `agent/doupo-agent-ui/memory/memory-consolidate.js` — **reviewed**；原因：无；证据：全文1-104；输入title/note/quote/keys保全、输出字段与失败分支
- `agent/doupo-agent-ui/memory/memory-recall.js` — **reviewed**；原因：无；证据：全文1-140；目录、用户输入、ID过滤与空/坏返回合同
- `agent/doupo-agent-ui/unified/unified-decide.js` — **reviewed**；原因：无；证据：全文1-204；旧三桶合同、schema与纯函数解析，生产引用搜索
- `agent/doupo-agent-ui/memory/memory-runtime.test.mjs` — **partial**；原因：全部执行并读断言/分组，但fixture与辅助代码未全部逐行复核；证据：213行；现有测试通过，缺ID复用、同楼opId、退休窗口及账本版本边界
- `agent/doupo-agent-ui/memory/memory-ops.test.mjs` — **partial**；原因：全部执行并读断言/分组，未全读fixture；证据：132行；预算断言只验证裁尾/至少首条，不验证最终宿主字符串与诊断记录
- `agent/doupo-agent-ui/memory/memory-decide.test.mjs` — **partial**；原因：全部执行并读断言/分组，未全读fixture；证据：80行；parser12条测试未联合runtime8条上限
- `agent/doupo-agent-ui/memory/memory-consolidate.test.mjs` — **partial**；原因：全部执行并读断言/分组，未全读fixture；证据：68行；输入备注/标题已测试，未覆盖异步提交输入变化与9把钥匙
- `agent/doupo-agent-ui/memory/memory-recall.test.mjs` — **partial**；原因：全部执行并读断言/分组，未全读fixture；证据：87行；72行明确固化缺ids当empty；无跨聊天cache测试
- `agent/doupo-agent-ui/unified/unified-decide.test.mjs` — **partial**；原因：全部执行并读断言/分组，未全读fixture；证据：125行；只验证旧纯函数，不证明生产仍使用合并决定
- `agent/doupo-agent-ui/index.js` — **partial**；原因：仅符号定位记忆/合并相关接线，非全文件审查；公共入口三项由总控负责；证据：127-145 continuation依赖；724-733、834-839、859-945、973-1037、1083-1141、1218-1248、4090-4235、4362-4380及namespace/按钮引用
- `agent/doupo-agent-ui/host/db-tables.js` — **partial**；原因：只读记忆回读/比较边界，host分片另审；证据：922-964；回读state无retiredIds，updatedAt现场生成；title列问题留给host所有者，不重复独立发现
- `agent/doupo-agent-ui/host/prompt-injection.js` — **partial**；原因：全文作为依赖读取，但未独立审查/执行该模块专有测试；证据：1-119；80-113最终字符串截断/失败返回合同
- `agent/doupo-agent-ui/host/host-storage.js` — **partial**；原因：仅旧合并开关及配置引用搜索；证据：225-242、336-337：decideMerged退役键；未读真实配置
- `agent/doupo-agent-ui/README.md` — **partial**；原因：仅旧合并兼容合同相关段落；证据：162-173与190互相矛盾
- `agent/doupo-agent-ui/index-chat-lifecycle.test.mjs` — **partial**；原因：只做开头/符号检查，未完整阅读或执行；证据：无法由现有扫描证明cache作用域或总结并发已有覆盖
- `agent/doupo-agent-ui/host/llm-client.js` — **unread**；原因：extractJson依赖被离线导入，但未源码review；模型客户端归其他分片；证据：无
- `.tmp/ 与 agent/doupo-agent-ui/.tmp/` — **excluded**；原因：安装备份/quality-baseline不是当前生产目标；证据：无
- `dev/、真实存档、真实配置、浏览器/模型运行` — **excluded**；原因：用户明确禁止或不在本分片；证据：无

## Refactor Signals

- module：agent/doupo-agent-ui/memory/memory-runtime.js；threshold：多个一致性缺陷共用ID/账本版本所有权；evidence：MU-02/03/08/12；先局部修复，再分阶段整理版本与退休合同，不重写。
- module：agent/doupo-agent-ui/index.js；threshold：三个异步流程与镜像回拉各维护有效性；evidence：cache key、continuation、smalls快照、整账回拉互不统一；MU-01/03/06。先离线测试门，不先大拆index。

## Slimming Opportunities

- pattern：Compatibility Path；occurrences：1；suggested_handling：保留公开unifiedDecide退休壳4604；旧模块/测试/文档可进入删除安全门，未证明仓库外直接import不存在。
- pattern：Dead Code；occurrences：1；suggested_handling：index4364 unifiedDecideRunning仅声明；4368恒false使6441/6508一侧不可达。仅候选，动态/公开合同与安装包引用未完成全仓删除审查。
- pattern：Duplicate Logic；occurrences：3；suggested_handling：退役unified仍复制self/memory字典与schema；先定外部兼容合同再归档，不新增抽象层补旧架构。

## Do Not Touch Yet

- module：unified/unified-decide.js及公开unifiedDecide；reason：无内部生产调用不等于无外部import；兼容retired/no-model合同仍公开，删除安全未过门。
- module：memory-runtime稳定合同；reason：无条目上限/无按天过期、模型不能直升big与panel可手动升均应保留。
- module：公共入口总控/quiet漏记/self→memory await；reason：用户指定总控单独审查，不重复。

## Verification Gates

- check：已执行node --test六个memory/unified测试文件（显式列文件）；scope：文件级tests6、pass6、fail0；非覆盖率证明，全部fixture源码未逐行审。
- check：已执行纯内存repro，不写fixture、不访问存档、不调用complete；scope：ID复用、opId回滚、12→8丢操作、9钥匙丢失、旧总结提交、裁剪记录、坏ids、跨chat key、目录饥饿、201退休、真实混合回拉guard。
- check：待增延迟Promise/stub宿主离线回归；scope：总结期间改账、cache跨聊天、注入写入失败/最终字数、DB两个整表收养入口、公开retired返回值。
- check：真实宿主手动验收未执行（用户禁止）；scope：聊天切换/数据库旧帧重放/宿主最终提示词；先完成stub测试，再另获运行授权。

## Optimization Handoff

- module：agent/doupo-agent-ui/memory/memory-runtime.js；evidence：MU-02离线确认最高号删除后restore复用退役编号；threshold：Local Fix；suggested_gate_mode：Local Fix Only；behavior_contract_hints：restore后新ID不得与当前存活/退休ID冲突；不改schema与手动/模型分工；patch_budget：runtime与现有runtime测试，1-2文件，目标小于80变更行；如需新增持久高水位则重新过门；pre_change_baseline：现有runtime测试通过；新增删除最高号→restore→新增测试先失败；verification_gate：新增恢复续号回归+六份memory/unified测试；长期>200退休另行MU-12，不能称已一并解决；deletion_safety：本候选不删模块；unified外部合同未查明，不批准删除；forbidden_scope：当前仅报告未授权实施；不得改真实存档/配置、公开namespace、DB列、连接、其他分片及生成包

## 未验证边界 / Residual Risk

- area：摘要语义/引文保真；status：unverified；reason：禁止模型调用，仅验证输入和结构，不保证摘要完整保留事实。
- area：真实SillyTavern/旧帧/多窗口；status：unverified；reason：禁止浏览器与真实存档；触发链有源码/内存证据，无端到端验收。
- area：测试与依赖完整审查；status：partial；reason：六个测试已执行但fixture未全读；host边界、index全文件、客户端及删除安全全仓搜索未完成。
- area：退役模式外部兼容性；status：unverified；reason：内部仅测试/文档引用不足以证明外部没有直接import或依赖公开返回值。
- area：并发源码变化；status：partial；reason：不是冻结快照；写前全量复核命令截断失败，未完成最终全量hash比对。

## Optimization Eligibility

Needs Gate。只建议MU-02优先进入局部修复门；当前无实施授权，不批量改实现、不启动重写。

## 稳定项与删除安全结论

- 不按天过期、不封顶条目；模型memorize降small与promote拒绝、panel手动升big均属现有合同。
- 总结输入已包含note/title/quote/basis/keys，解析失败不会退休源条目；真实语义保真未验收。
- 聊天continuation阻止旧模型结果提交，但不覆盖账本并发版本或完成cache的作用域。
- 旧unified生产模型调用确已退役；公开namespace仍返回retired。纯函数模块/测试属于待过门的旧兼容资产，不能整体直接删除。

## 写入边界与报告校验

只写本.md和同名.json。长命令曾在写入前截断失败；之后使用专用Write写JSON，本步骤生成Markdown。未改源码/配置/真实存档。JSON集合与coverage字段校验通过；未执行浏览器、模型或真实存档读写。
