import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Reporting only: production files are read and hash-checked, never written.
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../..');
process.chdir(root);
const out = 'agent/review-2026-11-04';
const read = name => JSON.parse(fs.readFileSync(`${out}/${name}.json`, 'utf8'));
const baseNames = ['core-request', 'entry-lifecycle', 'facts-settle-history', 'host-api-package', 'memory-unified', 'npc', 'self-storage', 'world-impact-sandbox', 'ui-dashboard', 'final-ui-detail', 'coordinator-final'];
if (fs.existsSync(`${out}/final-ui-world-memory.json`)) baseNames.push('final-ui-world-memory');
const reports = baseNames.map(name => ({ name, data: read(name) }));
const checks = ['final-check-high-risk', 'final-check-storage-memory'].map(name => ({ name, data: read(name) }));
const normalize = file => String(file ?? '').replaceAll('\\', '/').replace(new RegExp(`^${root.replaceAll('\\', '/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`, 'i'), '').replace(/^\.\//, '');
const raw = reports.flatMap(({ name, data }) => (data.findings ?? []).map((f, index) => ({ ...f, sourceReport: `${name}.json`, sourceIndex: index + 1, originalSeverity: f.severity })));
const decisions = checks.flatMap(({ name, data }) => (data.reviewed_findings ?? []).map(x => ({ ...x, checkReport: `${name}.json` })));
for (const f of raw) {
  f.file = normalize(f.file);
  const decision = decisions.find(d => (path.basename(d.source_report ?? '') === f.sourceReport) && ((d.source_finding_id && d.source_finding_id === f.id) || d.title === f.title || d.source_report_title === f.title));
  if (decision) {
    f.reviewDecision = decision;
    f.severity = decision.final_severity ?? decision.severity ?? f.severity;
    f.applicablePath = decision.applicable_path ?? decision.default_reachability ?? f.reachability ?? '';
  }
  f.confidence = f.certainty ?? f.determinism ?? f.evidence_kind ?? f.confidence ?? '源码可达路径/分项内存验证，详见证据；未作真实宿主验收';
  f.applicablePath ||= f.reachability ?? '';
}
const apiChinese = [
  ['消息未落地，回执仍称已观察到', '宿主sendMessage/slash返回undefined且没有新增消息，或渲染保存失败。', '未确认可见的正文仍可能打开状态提交门，内容与状态证据脱节。', '取得稳定宿主消息身份并回读确认；区分数组修改、显示确认和保存结果。', '无操作/undefined发送、并发插入、渲染保存失败都不得伪造observed；成功路径另验真实宿主。'],
  ['并发采样覆盖不能还原原始宿主设置', '两个跟随酒馆的调用临时覆盖同一个采样设置并交错完成。', '原温度0.7经A=0.2/B=0.9交错完成后残留0.2，污染后续调用。', '在现有客户端统一持有临时设置生命周期或串行化该共享区，不新建provider框架。', '两种完成顺序、失败/取消/超时和正文重叠，最终均准确恢复原设置。'],
  ['静默调用取消只结束本地等待，底层仍可能运行', '预先取消或quiet超时；busy已释放而实际生成未结束。', '预取消仍启动请求，迟到事件及费用不能靠本地拒绝消除；真实事件误分类尚未验。', '调用前检查abort，使用已验证宿主取消能力，底层结束前保留所有权，退避等待也可取消。', '预取消零调用；延迟quiet超时后晚事件不启动普通记账；不能承诺不受控远端必然停止。'],
  ['鉴权头按大小写敏感合并，未实现覆盖语义', '默认authorization与用户Authorization同时存在。', 'Headers可合并成两份Bearer值而不是覆盖，网关可能拒绝；非密钥泄漏结论。', '用大小写不敏感的逻辑头名执行最后写入覆盖，发送和模型清单统一。', 'Authorization及x-api-key大小写组合最终仅一个有效值；使用假凭据不联网。'],
  ['YAML接受半份文档并静默改变流式值类型', '多键flow map、数组值或中间垃圾行等被迷你解析器部分接受。', '界面所填参数被漏项或改成字符串，调用者不知道只解析了前半份。', '要求全量消费，明确拒绝不支持语法并显示错误；新增解析依赖另行审批。', 'flow map/list、嵌套、垃圾尾行、注释和引号测试；非法文档不得部分套用。'],
  ['拉取模型没有截止时间，按钮可能永久等待', '网关fetch或response.json一直不返回，UI没有传取消signal。', '按钮停在禁用和拉取中；不是已测到某次真实网络超时。', '请求头和响应体都设截止时间；面板替换/销毁可取消，迟到结果不更新旧卡。', 'never-fetch、never-json、取消和迟到响应都恢复UI；成功正常列模型。'],
  ['空写入清理失败却记录已清理', '已有注入，空write调用clear时宿主抛错。', '容器保留旧文本，但诊断cleared=true，旧注入可能继续参与生成。', '传播clear失败状态，成功重试前不标清理完成。', '空写清理失败、重试成功及幂等清理，与实际提示词容器对照。'],
  ['安装文档中的当前清单路径已过时', '按INSTALL排查当前根manifest引用时。', '文档指向模块内路径，与根转发入口合同不一致；不是证明安装已坏。', '说明根入口、实现路径、备用模板及双CSS关系，不删除兼容入口。', '解析manifest与安装文档逐项对照，package/template测试通过。'],
];
for (const f of raw.filter(f => f.sourceReport === 'host-api-package.json')) {
  const t = apiChinese[f.sourceIndex - 1];
  f.originalEnglishTitle = f.title;
  [f.title, f.trigger, f.risk, f.recommendation, f.verification] = t;
}
const entryChinese = [
  { trigger: '关闭启用Agent总控后，正常正文产生started→ended→rendered事件。', evidence: '生成结束分支只看quiet和世界子开关，不检查全局enabled。完整假宿主事件序列在enabled=false下仍产生1次模型调用并保存世界metadata；界面5957行承诺关闭后不运行、不写状态。', risk: '总停止开关不能兑现，可能继续耗模型额度并改游戏状态。', recommendation: '在现有生命周期所有者统一检查总开关，关闭时使飞行提交失效；仍允许安全清理临时注入。', verification: '启动前关闭应零调用零写；请求/MVU/DB等待中关闭应阻止晚到写入；重启仅保留一份监听和一条处理链。' },
  { trigger: '上轮后台静默调用未结束时，又产生新的玩家和AI回复。', evidence: 'started/rendered/ended在isQuietBusy时跳过；旧continuation又因末条变化失效。假宿主新增第二轮后释放旧世界请求，2条回复只产生1次请求且世界未保存，没有补偿队列。', risk: '旧回复和新回复都可能漏记，聊天剧情与世界/纳戒/记忆逐渐分离。', recommendation: '在现有入口保留有界、按聊天的待处理回复队列或最新版本，后台结束后排空；旧结果明确丢弃，不能无限quiet自激励。', verification: '延迟第一轮、产生第二轮再释放：旧结果不写，新回复最终恰处理一次；切聊天取消旧队列，无无限请求。' },
  { trigger: '世界调用完成，纳戒/MVU仍等待时立即启动记忆决定。', evidence: '342-356行只把纳戒Promise赋给run而不await；369行马上启动记忆。内存探针在纳戒未完成时已经开始第三次记忆请求，与366行及README顺序承诺不一致。', risk: '记忆流程不能被认为已看到刚落下的新账；具体影响取决于消费者实际读取哪些状态。', recommendation: '明确依赖图，只等待真实前置任务；独立人物工作仍可并行，失败应明确部分完成。', verification: '延迟纳戒提交后验证记忆所读版本；纳戒失败时不误报所有前置成功；避免全局盲目串行。' },
  { trigger: '开发环境import.meta.hot触发dispose后重新加载。', evidence: '正式onDisable会解绑hostLifecycleBindings、invalidate epoch并disposeOrbHud；HMR分支只丢弃绑定数组，没有执行对称清理。生产是否使用HMR未证实。', risk: '开发热重载可能残留旧监听、单例或晚到回调；不是已证实发布实例故障。', recommendation: '热清理复用现有对称停用合同，避免另维护第二份不一致路径。', verification: '假HMR加载→dispose→重载后监听/单例回到基线，旧请求不得写入。' },
  { trigger: '维护者依README决定数据库所有权或启用已退役合并模式。', evidence: 'README101称表=账本/表优先，120称chatMetadata为真账、DB仅镜像；159-172仍说可开合并，189又说已退役。', risk: '维护或修账按相反合同进行，容易再次引入覆盖和恢复错误。', recommendation: '先冻结实际字段所有权，再分开记录默认运行、可选旧链和退役兼容返回，更新旧验收数字但不冒充运行证据。', verification: '逐个设置/API对应实际消费者，文档不互相矛盾；兼容入口行为不变。' },
];
for (const f of raw.filter(f => f.sourceReport === 'entry-lifecycle.json')) Object.assign(f, entryChinese[f.sourceIndex - 1]);
for (const f of raw.filter(f => f.sourceReport === 'coordinator-final.json')) {
  f.trigger = '早卷选中的条目同时包含后卷增补；默认resolveInjection或目录失败后的fallback。';
  f.evidence = 'resolveVolume返回{current,next,source}，gatherSettings172把整个对象当volume传入；setting-supply15-16只对整数裁剪。真实createTurnStages.resolveInjection合成样例：当前1、建议1，仍出现卷05未来秘密。fallback226完全不传volume。';
  f.risk = '含后卷增补的正文在锁定早卷时仍可能进入默认提示词；结算全文通道是另一条独立漏裁路径。';
  f.recommendation = '正常与fallback组装都传明确的标量卷边界，进度来源另存；手动锁定时禁自动推进。不改原著资料或削弱组件裁剪。';
  f.verification = '真实stages.resolveInjection正常/失败降级路径，full/summary/fitted混卷样例均不得含未来段；manual1/suggested10仍1，auto单卷推进另测。';
}
const excludedFindings = [];
const findings = [];
for (const f of raw) {
  if (f.sourceReport === 'final-ui-world-memory.json' && f.id === 'FWM-01') {
    const owner = raw.find(x => x.sourceReport === 'final-ui-detail.json' && x.id === 'UID-07');
    if (owner) {
      owner.title = '校验拒绝后仍清空记忆及世界登记草稿';
      owner.additionalEvidence = [...(owner.additionalEvidence ?? []), f];
      owner.evidence += ' 世界事件7337-7339、任务7356-7358、势力7757-7761、人物7777-7779也在成功检查前清空；该补充为静态路径，未运行UI。';
      owner.verification += ' 同时覆盖世界事件/任务/势力/人物登记失败保留草稿。';
    }
    excludedFindings.push({ ...f, disposition: '并入UID-07拒绝后丢草稿主题；保留世界四种登记写点静态证据，不重复计数。' });
    continue;
  }
  if (f.sourceReport === 'memory-unified.json' && f.id === 'MU-04') {
    excludedFindings.push({ ...f, disposition: '不计当前生产缺陷；index.js:514 已显式 maxOps:12，:4147 使用该实例；无参工厂默认8仅列公共库契约观察。原报告默认P1表述驳回。' });
    continue;
  }
  if (f.sourceReport === 'memory-unified.json' && f.id === 'MU-13') {
    excludedFindings.push({ ...f, disposition: '并入 entry-lifecycle README所有权/退役文档项，避免重复计数。' });
    continue;
  }
  if (f.sourceReport === 'ui-dashboard.json' && /旧世界书读取结果覆盖新选择/.test(f.title)) {
    const owner = raw.find(x => x.sourceReport === 'facts-settle-history.json' && /世界书异步重载/.test(x.title));
    if (owner) owner.additionalEvidence = [f];
    excludedFindings.push({ ...f, disposition: '并入 facts-settle-history 世界书异步重载项；自动同步与手动导入必须一起验，保留两个写点证据。' });
    continue;
  }
  findings.push(f);
}
const order = ['entry-lifecycle', 'self-storage', 'final-ui-detail', 'memory-unified', 'npc', 'facts-settle-history', 'coordinator-final', 'world-impact-sandbox', 'host-api-package', 'core-request', 'ui-dashboard', 'final-ui-world-memory'];
findings.sort((a, b) => Number(a.severity.slice(1)) - Number(b.severity.slice(1)) || order.indexOf(a.sourceReport.replace('.json', '')) - order.indexOf(b.sourceReport.replace('.json', '')) || a.sourceIndex - b.sourceIndex);
findings.forEach((f, i) => { f.checklistId = `OPT-${String(i + 1).padStart(3, '0')}`; });
const counts = findings.reduce((a, f) => (a[f.severity] = (a[f.severity] ?? 0) + 1, a), {});
const inventory = read('inventory');
const allCoverage = [...reports, ...checks].flatMap(({ name, data }) => (data.coverage ?? []).map(c => ({ ...c, path: normalize(c.path), sourceReport: `${name}.json` })));
const jointReviewed = new Map([
  ['agent/doupo-agent-ui/host/host-storage.js', '分项436-626 + 最终复核完整补读1-435，合并覆盖完整；不等于持久化实机通过。'],
  ['agent/doupo-agent-ui/host/db-tables.js', '原分项核心335-545及589-964，补查91-334，协调补读1-90与540-590；表定义/辅助/编解码合并覆盖完整。'],
]);
const coverage = inventory.files.map(f => {
  const evidence = allCoverage.filter(c => c.path === f.path);
  let status = evidence.some(c => c.status === 'reviewed') ? 'reviewed' : evidence.some(c => c.status === 'partial') ? 'partial' : evidence.some(c => c.status === 'excluded') ? 'excluded' : 'unread';
  let note = '';
  if (jointReviewed.has(f.path)) { status = 'reviewed'; note = jointReviewed.get(f.path); }
  if (f.path === 'agent/doupo-agent-ui/.tmp-hub.txt') { status = 'excluded'; note = '已读的旧静态UI片段，未发现生产引用；不计当前运行时审查；未授权删除。'; }
  if (f.path === 'agent/doupo-agent-ui/index.js') { status = 'partial'; note = '多分片按功能追踪并补查界面，长设置markup有结构清单但未逐字人工读全，不能称8826行逐行全审。'; }
  const exists = fs.existsSync(f.path);
  const actualHash = exists ? crypto.createHash('sha256').update(fs.readFileSync(f.path)).digest('hex') : null;
  return { ...f, status, note, inputUnchanged: actualHash === f.sha256, evidence };
});
const coverageCounts = coverage.reduce((a, f) => (a[f.status] = (a[f.status] ?? 0) + 1, a), {});
const tests = read('syntax-check');
const functional = reports.flatMap(({ name, data }) => (data.feature_status ?? data.functional_status ?? data.function_status ?? []).map(feature => ({ sourceReport: `${name}.json`, ...feature })));
const report = {
  date: '2026-11-04', mode: 'full-scan', focus: 'general', scopeStatus: '所有功能域已覆盖，部分文件/测试夹具/长入口仍为partial；不是逐行全仓完成或真实宿主验收',
  root, head: inventory.head, routing: 'AUDIT→SWEEP→REPORT；只写报告，无实现修改授权',
  counts, findings, excludedFindings, reviewedDecisions: decisions, coverageCounts, coverage,
  functional, tests: { modules: '77/77 文件级通过；baseline-tests.log和final-tests.log', syntax: tests },
  realRuntime: '本轮未使用浏览器/模型/真实存档；以前一轮验收不替代本轮新增反例',
  inputChanged: coverage.filter(c => !c.inputUnchanged).map(c => c.path),
  corrections: ['MU-04默认12→8丢操作不适用生产入口，移出当前缺陷', 'self-storage中auto防重不绑定swipe措辞错误：index1306+127-137已覆盖', 'CR-02 legacy并发及sandbox跨重载降为P2', '结算收益为审核预测/注入，不是已证实真实金币重复发放', '合成未来卷样例证明路径，不声称实际1111条原著正文已逐条审过或已泄露', '某分片声称未冻结只代表自身未锁定；协调172文件SHA256已反复核对未改'],
};
fs.writeFileSync(`${out}/optimization-checklist.json`, JSON.stringify(report, null, 2));
const clean = value => String(value ?? '').replaceAll('|', '／').replaceAll('\n', ' ');
const link = f => `${f.file}:${f.line ?? 1}`;
const sourceLabel = {
  'core-request.json': '核心调度/旧版回合与请求API', 'entry-lifecycle.json': '默认入口/总控生命周期',
  'facts-settle-history.json': '原著检索/行动判定/历史', 'host-api-package.json': '模型连接/消息/注入与发布',
  'memory-unified.json': '记忆/召回/总结', 'npc.json': '人物簿/冷藏/NPC API',
  'self-storage.json': '纳戒/MVU/数据库与恢复', 'world-impact-sandbox.json': '世界/影响/沙盒',
  'ui-dashboard.json': '总控界面/设置/HUD', 'final-ui-detail.json': '纳戒与人物界面补查',
  'coordinator-final.json': '最终跨模块复核', 'final-ui-world-memory.json': '世界/影响/记忆界面补查',
};
let md = `# Agent 系统逐功能优化清单\n\n> 2026-11-04 · 只读审查结果，**本清单均未实施**。审查的是当前工作树，不是只看旧提交。\n\n## 一、先说结论\n\n当前不宜优先加功能或整体重写。先解决账本一致性、异步提交归属和保存反馈，再做可维护性与性能优化。\n\n- 清单共 **${findings.length} 项：P1 ${counts.P1 ?? 0}、P2 ${counts.P2 ?? 0}、P3 ${counts.P3 ?? 0}**；没有确认P0。优先级按本次复核口径，不表示每项都在默认路径每轮触发。\n- 建立了 **${inventory.files.length} 个文件**的输入清单与SHA256；最终输入变化 **${report.inputChanged.length}**。源码/配置/世界书/真实存档未改，未生成新回复。\n- 离线模块测试 **77/77 文件通过**，语法 **158/158 脚本通过**。这些不能抵消新增的失败反例，也不是行/分支覆盖率。\n- 覆盖：reviewed ${coverageCounts.reviewed ?? 0}、partial ${coverageCounts.partial ?? 0}、excluded ${coverageCounts.excluded ?? 0}、unread ${coverageCounts.unread ?? 0}。reviewed表示相应源码已读，不代表该功能真实宿主验收。\n- **每个功能域已经建立检查项，但不是整仓每一行都审完**：8826行入口、部分测试夹具仍有partial；CSS是静态检查，没有视觉验收。精确文件表见[覆盖清单](coverage.md)。\n\n### 优先级和证据怎么读\n\n- **P1**：已证实的核心行为/数据一致性缺陷，触发条件成立时应先修。\n- **P2**：非阻断缺陷、特定API/长期边界或结构/验证缺口；不是“可不管”，只是分批处理。\n- **P3**：低影响文案/小清理。\n- “内存复现”使用真实项目函数和假宿主，不触碰真实游戏数据；“源码可达”证明代码路径，宿主具体时序仍需另验。\n- 同类跨聊天问题保留独立写点（facts/影响/DB/MVU/NPC/文件导入），单修一处不算其余已修。\n\n## 二、建议的实施顺序（不是批量开改授权）\n\n| 批次 | 先做什么 | 为什么 | 退出验收 |\n|---|---|---|---|\n| A | 总控停止合同、纳戒数量/原子更新、装备转移及非空渲染 | 最直接影响费用、物品和正常操作 | 关总控零调用零写；数量守恒；拒绝前后快照相同；非空装备不报错 |\n| B | 同楼重生成的基线/撤销/持久化，MVU差分统一基线 | 对应物品丢失、重复金币和刷新后行为不一致 | 获得2→消耗1→只改目标仍剩1→换swipe→刷新→重roll，结果准确且ID稳定 |\n| C | DB冷恢复、并发镜像、回拉字段所有权及全部异步跨聊天写点 | 不让修好的新账再次被旧帧/空镜像冲掉 | A→B→A各await注入延迟，错误会话零写；投影往返不丢字段；最终最新版本唯一 |\n| D | 记忆退休ID/回拉合并/总结版本/召回缓存与目录 | 防止遗忘内容复活或有账却召不回 | 删除/总结/恢复不复活；9把以上钥匙可召回；目录大时新小记忆仍可见 |\n| E | 原著卷号真正端到端裁剪、选条白名单、行动证据区间、人物补全白名单 | 组件通过不等于集成安全，避免未来信息和错人物 | 捕获真实提交前的system/user；早卷无后卷段；重叠动作不重复批准；只写目标人物允许字段 |\n| F | 人物重roll/冷藏草稿、世界任务撤销、影响ID和成熟状态 | 长期剧情连续性与恢复 | 重roll/恢复/确认/放弃对应唯一版本；任务期限/成熟状态一致 |\n| G | 保存反馈、模型取消/采样所有权、预算记录、UI键盘和长列表 | 让失败可见，减少悬挂和误操作 | 失败不称已保存/已清理；取消后零新调用；临时采样准确恢复；键盘可达 |\n| H | legacy/API提交、旧文档/兼容代码/可维护性、基于测量的性能 | 不把可选路径当主链，也不因旧而随便删 | 明确外部消费者和迁移政策后再过删除门；真实耗时/提示词预算不退化 |\n\n首个可批准的小修复建议：**总控关闭仍写账**（入口+一个生命周期测试，目标80行以内）。纳戒数据修复是另一项工作，先修代码再核对旧存档，不凭正文批量补物。\n\n## 三、按功能的检查结论与优化方向\n\n| 功能域 | 已细分检查的功能 | 结论与方向 |\n|---|---|---|\n| 入口与调度 | 启停、重复注册、两事件屏障、quiet防递归、忙碌重叠、跨聊失效、后台依赖 | 有全局关闭和漏记缺口；需要有界排队/明确依赖，不是把所有任务盲目并行或全串行 |\n| 纳戒基本账 | 身份、境界、金币、称号、功法、斗技、装备、天材地宝、行囊 | 数量归零、拒绝原子性、撤销/恢复是优先；非空装备UI有异常；穿脱要守恒 |\n| 制作与目标 | 配方、开工、成功/失败、数量/期限、主支线、完成/移除 | 制作计数和备注需往返保真；MVU同名属性更新不能假clean；不擅自改变成丹需另addItem的当前合同 |\n| MVU | 正文申报、读帧、类型、时间戳、差分、整帧同步 | 旧帧/缺帧不等于真实新申报；1200ms等待不是归属证明；重roll必须同一基线 |\n| DB与存储 | 建表、迁移、最小CRUD、fallback、收养、外改回拉、本地缺失、并发 | 投影不能冒充全量账本；重建空壳不得压过旧持久账；每条异步链绑定聊天和版本 |\n| 记忆 | 登记、大小记忆、去重、退休、总结、钥匙、目录、缓存、降级、注入记录 | ID、退休/回拉、总结并发、缓存和目录饥饿存在缺陷；默认生产maxOps12已确认，不误报只8 |\n| 人物簿 | 字段、好感、在场/重要、档案补全、手改、导入导出、经历与精简 | 好感限幅基础稳定；补全要规范目标及白名单；旧草稿/旧弹窗/文件导入分别补归属 |\n| NPC自主API | decision guard、plan、conflict、reassessment、outcome、commit gate | 多为公开内存API，不是已接通默认全自动自治；状态版本和终态/字段接力有缺口 |\n| 冷藏推进 | 勾选基线、日期/事件命中、预览、确认、放弃、恢复 | 基础先预览后确认保留；草稿ID与按姓名批量确认有缺陷，需版本和时段约束 |\n| 世界 | 时钟/季节、预定/传闻/到期、事件、任务、势力/人物、重roll | 更新应先验后改；任务期限和opId撤销要完整；多操作组合仍需更强恢复测试 |\n| 世界影响 | record、链、成熟、关闭/修复、归档/找回、场记、缓存/预算 | 归档ID共享空间、成熟水位/回滚、场记跨聊与过期cache需先修 |\n| 原著设定 | 原生/插件分流、索引、卷、目录、lookup、预算、注入/清理 | 标量裁剪组件有效但真实调用类型错误；结算另取全文也漏裁；多入口加载需同源token |\n| 行动结算 | v1/v2解析、多动作、依赖、批准、字段/物品ID、累计资源、只读核对 | 核验预测不等于落账；原文区间身份要修，既有数值/白名单门不删除 |\n| 历史与旧回合 | classify、candidate invalidation、stateStore版本、两段提交、回滚、占位 | 与默认领域账本不是同一恢复系统；保存证据/回滚基线/终结日志/API候选仍有缺口 |\n| 模型与API | 命名方案、协议、主体/头、YAML、超时/取消/重试、采样、调用记录 | 临时共享采样竞争、quiet取消、大小写头、YAML部分消费及模型列表悬挂需按条修 |\n| UI与发布 | 13设置页、12信息窗、详情/分页、保存文案、默认恢复、键盘/焦点、样式与导入件 | 功能接线缺陷优先于重做皮肤；真假保存/清理反馈必须区分；生成导入件与源码一致性需门禁 |\n\n逐个子功能的原始评估（含稳定项、证据和未验范围）见[功能明细](features.md)，不是把“没发现新问题”写成全面通过。\n\n## 四、完整优化待办\n\n每项为待修复或待验收，均未实现。原始编号和文件保留，最终优先级以本清单为准。\n\n`;
for (const severity of ['P1', 'P2', 'P3']) {
  const selected = findings.filter(f => f.severity === severity);
  md += `### ${severity}（${selected.length}项）\n\n`;
  for (const f of selected) {
    md += `#### ☐ ${f.checklistId} · ${f.title}\n\n- **模块/位置**：${sourceLabel[f.sourceReport] ?? f.sourceReport}；\`${link(f)}\`。\n- **触发与适用路径**：${f.trigger ?? f.behavior ?? '见下方证据'}${f.applicablePath ? `；${f.applicablePath}` : ''}\n- **影响**：${f.risk}\n- **证据**：${f.evidence}\n- **建议的最小改动**：${f.recommendation}\n- **验收条件**：${f.verification}\n- **依据/边界**：${f.confidence}；原始报告[${f.sourceReport}](${f.sourceReport})${f.id ? `，原编号${f.id}` : ''}。`;
    if (f.reviewDecision) md += ` 最终复核：${f.reviewDecision.verdict}，${f.reviewDecision.reason}`;
    if (/行动依据未绑定/.test(f.title)) md += ' **数值20是审核预测，不是已证明真实金币重复发放。**';
    if (f.additionalEvidence && /世界书异步重载/.test(f.title)) md += ' 另合并UI手动导入写点：index.js:8707-8715；不能只保护自动sync。';
    if (f.additionalEvidence && /登记草稿/.test(f.title)) md += ' 合并了世界事件/任务/势力/人物登记丢草稿的静态路径，按不同表单分别验收。';
    md += '\n\n';
  }
}
md += `## 五、性能、可维护性与瘦身建议（未实现）\n\n1. **先测再优化耗时。** 以前真实一轮生成前串行小调用约48秒只能作为历史样本；本次无新性能测量。按功能记录请求开始/结束、输入输出大小、等待/取消/重试、落账与保存耗时，先定位慢项。\n2. **建立依赖图而非盲目并行。** 只并行无状态依赖的只读工作；世界→纳戒/MVU→记忆等依赖需明确版本。缓存key包括聊天/分支、输入指纹、账本/设置/模式版本，过期可解释。\n3. **长记忆与长期清单必须可检索。** 不用删除永久记忆换性能；目录按场景预筛、两层配额/分页，UI保留渲染上限但显示真实总数与后续入口。先用100/1000/10000条离线数据测CPU和提示词量。\n4. **逐步收敛唯一写入口。** 数据变更返回“内存已变/保存成功/镜像成功”不同状态；按聊天串行/合并最新镜像；别再新建另一套状态库弥补现有双权威。\n5. **index拆分进入后续重构门，不现在重写。** 8826行是可维护信号，不是缺陷证据；已有重复生命周期/保存/模态归属缺口可支撑按单功能提取，但必须先补行为回归、保持对外API和保存格式。\n6. **瘦身候选而非删除授权。** 旧unified纯函数/恒假分支、旧.tmp-hub片段、重复CSS规则、旧版资料查询/impact-engine等先查直接/动态引用、外部导入、公开命名空间和文档/测试；保留retired兼容返回，不能因默认不用就整包删。根入口/双CSS/双settings模板有部署合同，先查生成所有者。\n7. **测试从“文件通过数”升级为合同矩阵。** 补组合与集成测试：拒绝零副作用、跨聊天各await、重roll/刷新/回拉、源数据改动时旧总结、所有UI按钮与有效页面、注入实际IDs与最终文本。不要把字符串模板测试当真实交互。\n8. **观测性单独补。** 持久记录操作拒绝原因、旧结果被丢弃原因、缓存命中依据、部分成功与最终保存状态；日志不记密钥/完整私聊。当前无证据时宁可“待核对”，不报“已保存”。\n9. **发布单独验。** 提交的DB初始化JSON与buildBridgeSheets应深相等；报告/真实聊天备份/browser profile不得混入分发包。本轮不生成、不清理、不发布。\n\n## 六、暂时不要动什么\n\n- 不恢复已删的旧sandbox模块，不因为方案稿存在就把尚未实现功能判为回归。\n- 不取消记忆永久保留、模型不直接升大记忆、人物好感限幅、真实字段白名单、只读reconcile和消息证据等现有护栏。\n- 不用默认值捏造HP/斗气/库存，不凭正文一句话补旧存档物品。\n- 不同时修所有OPT项，不为消除报告改API方案、模型、世界书开关、存档格式或依赖。\n- 不把legacy/API问题描述成默认链每轮必触发；也不因不是默认路径就删除公开合同。\n\n## 七、最终裁决与报告更正\n\n`;
for (const x of excludedFindings) md += `- **${x.sourceReport}${x.id ? `/${x.id}` : ''}**：${x.disposition}\n`;
md += '- **self-storage功能描述更正**：自动去重已用continuation.current()检查swipe；“未绑定swipe”错误。不影响无变化分支/撤销基线等独立问题。\n- **CR-02和sandbox模式**：最终由P1降P2；legacy并发不是默认双重落账，缺正式模式的全局回退是显式策略，不能直接说越权。\n- **原著裁剪**：setting-supply标量测试通过仍成立，但主链传卷对象、fallback漏参数和结算全文是跨模块缺口；不能说防剧透已端到端修好。\n- **各分片的快照声明**：其作者没有全局锁不代表源码实际变化；协调者已对172输入哈希复核，最终结果见snapshot-integrity.json。\n\n## 八、覆盖、验证与后续门\n\n- [机器清单与最终裁决](optimization-checklist.json)保留所有来源和适用路径。\n- [逐文件覆盖](coverage.md)区分reviewed/partial/excluded/unread；未读的删除旧文件不计当前172库存。\n- [功能逐项状态](features.md)保留分项证据与局限，不等于全部真机通过。\n- [最终模块日志](final-tests.log)、[语法日志](syntax-check.json)、[原始确定性合并](merged-raw-final.json)。\n- **本轮没有真实浏览器/模型/存档写入，不能宣称console零错、视觉通过、全部跨聊天时序或旧档恢复已实机验收。** 现有报告只列建议，未修复任何OPT项。\n- 后续需用户选择有界修复批次并过GATE；每项先失败回归→局部修→聚焦+全测试→必要真实宿主验收。涉及旧档恢复/结构迁移另行备份和确认。\n';
fs.writeFileSync(`${out}/优化清单.md`, md);
let cov = '# Agent审查覆盖清单\n\n范围：inventory.json记录的172个当前输入文件。reviewed=相关源码完整阅读/联合补读；partial=只读所列范围；excluded=不属当前运行时审查；并非测试覆盖率/真实验收。\n\n';
cov += `最终统计：${JSON.stringify(coverageCounts)}。全部输入哈希未改：${report.inputChanged.length === 0}。\n\n`;
cov += '| 文件 | 类型 | 行数 | 最终状态 | 说明/证据 |\n|---|---|---:|---|---|\n';
for (const c of coverage) cov += `| \`${c.path}\` | ${c.kind} | ${c.lines} | ${c.status} | ${clean(c.note || c.evidence.filter(x => x.status === c.status).map(x => `${x.sourceReport}: ${x.evidence || x.reason}`).join('；'))} |\n`;
cov += '\n## 剩余边界\n\nindex.js仍partial：各功能路径已追踪，长模板结构化盘点不等于逐字审阅；部分测试fixture只跑过/抽断言。生成volume索引仅验证格式与消费者，未逐条核验原著资料真实性。CSS未做真实渲染和设备测试。具体原始范围在optimization-checklist.json的coverage.evidence中保留；一个分片的unread不覆盖另一个分片已读证据。\n';
fs.writeFileSync(`${out}/coverage.md`, cov);
let feat = '# 功能逐项审查明细\n\n这些状态为分项静态/内存检查，不是所有功能真机通过。最终优先级、误报与合并以优化清单.md为准。\n\n';
for (const { name, data } of reports) {
  feat += `## ${sourceLabel[`${name}.json`] ?? name}\n\n`;
  const list = data.feature_status ?? data.functional_status ?? data.function_status ?? [];
  for (const item of list) {
    const title = item.feature ?? item.function ?? item.name ?? item.area ?? item.capability ?? item.module ?? '功能项';
    feat += `### ${title}\n\n`;
    for (const [k, v] of Object.entries(item)) {
      if (['feature', 'function', 'name', 'area', 'capability'].includes(k)) continue;
      feat += `- **${k}**：${typeof v === 'string' ? v : JSON.stringify(v)}\n`;
    }
    feat += '\n';
  }
  feat += fs.existsSync(`${out}/${name}.md`) ? `详见[原始分片](${name}.md)和[JSON](${name}.json)。\n\n` : `详见[原始JSON分片](${name}.json)。\n\n`;
}
feat += '## 已裁决的描述更正\n\n- memory MU-04不适用生产入口，入口maxOps12。\n- self自动去重已经绑定swipe-aware continuation，原feature描述不准确。\n- 多数autonomy/conflict/legacy能力只是公开API或可选路径，不能算默认自动自治已运行。\n- reviewed状态只说明阅读；所有模块仍保留真实宿主/模型语义/保存落盘门。\n';
fs.writeFileSync(`${out}/features.md`, feat);
console.log(JSON.stringify({ findings: findings.length, counts, coverageCounts, inputChanges: report.inputChanged, output: `${out}/优化清单.md` }, null, 2));
