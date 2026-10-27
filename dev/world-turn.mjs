/**
 * 单轮完整跑：和酒馆里同样的时序。
 * 输入固定为"萧炎在府中听到纳兰嫣然要来的消息"；
 * 模型回复从 dev/model-reply.txt 读（原样解析，废话和代码块都容忍），
 * 解析 → 台账执行 → 打印决定结果与下一轮注入快照。
 * 跑法：node dev/world-turn.mjs
 */
import { readFileSync } from 'node:fs';
import { createWorldRuntime, formatClock } from '../agent/doupo-agent-ui/world/world-runtime.js';
import { buildWorldInjection, WORLD_HEADER } from '../agent/doupo-agent-ui/world/world-ops.js';
import { buildDecideUser, parseDecision, WORLD_DECIDE_PROMPT } from '../agent/doupo-agent-ui/world/world-decide.js';
import { createFactsIndex } from '../agent/doupo-agent-ui/narrative/facts-index.js';

const chat = [
    { is_user: true, mes: '我在府中练功，听到下人议论纳兰嫣然要来乌坦城的消息。' },
    { is_user: false, mes: '你正催动着一丝微弱的斗气，院外忽然传来下人们的窃窃私语——"云岚宗的少宗主要来了""听说是为退婚的事"。纳兰嫣然要来乌坦城？你的手顿在了半空。' },
];

// ── 1. 酒馆侧准备：真世界书建索引（与扩展同一条路） ──
const book = JSON.parse(readFileSync(new URL('../世界书/斗破世界书.json', import.meta.url), 'utf8'));
const factsIndex = createFactsIndex();
factsIndex.load(book);

// ── 2. 世界台账：全新开局（新聊天，什么都没有） ──
const world = createWorldRuntime({ maxOps: 12, now: () => '本轮时刻' });
console.log('═══ 开局台账 ═══');
console.log(formatClock(world.snapshot().clock), JSON.stringify(world.snapshot().info), '事件 0 · 流水 0');

// ── 3. 生成结束：组装决定上下文（模型收到的 user 内容） ──
const recentText = chat.map(m => m.mes).join('\n');
const hits = factsIndex.matchTokens(recentText, { limit: 12, volume: null });
const bookLines = hits.map(hit => { const entry = factsIndex.get(hit.uid); return entry ? `${entry.uid}|${entry.category}|${entry.name}|${entry.summary}` : null; }).filter(Boolean);
const user = buildDecideUser({ snapshot: world.snapshot(), floors: chat.map(m => ({ role: m.is_user ? '玩家' : '角色', text: m.mes })), worldbookLines: bookLines });
console.log('\n═══ 决定上下文（user） ═══');
console.log(user.slice(0, 1400), user.length > 1400 ? '\n…（截断）' : '');
console.log(`\n（system = WORLD_DECIDE_PROMPT，${WORLD_DECIDE_PROMPT.length} 字）`);

// ── 4. 模型回复：从文件原样读入（含废话与代码块，模拟真实输出） ──
const modelRaw = readFileSync(new URL('./model-reply.txt', import.meta.url), 'utf8');
console.log('\n═══ 模型原始回复（dev/model-reply.txt 原样） ═══');
console.log(modelRaw.trim());

// ── 5. 脚本解析 + 执行 ──
const decision = parseDecision(modelRaw);
console.log('\n═══ 解析结果 ═══');
console.log(`状态 ${decision.status} · 操作 ${decision.ops.length} 条${decision.dropped ? ` · 坏条目丢弃 ${decision.dropped}` : ''}`);
const replyIndex = 1; // 最新 AI 楼层
const result = world.apply(decision.ops, { source: 'decide', floor: replyIndex });
console.log('\n═══ 执行结果（面板「模型决定」卡看到的） ═══');
console.log(`模型说明：${decision.note || '（无）'}`);
for (const item of result.applied) console.log(`  ✓ ${item.summary}`);
for (const item of result.rejected) console.log(`  ✗ ${item.op}：${item.reason}`);
if (!result.applied.length) world.note(decision.note || '模型判断本轮世界无变化。', { source: 'decide' });

// ── 6. 持久化 + 下一轮注入快照 ──
console.log('\n═══ 台账现状（将存入 chatMetadata.doupo_agent_world） ═══');
const snap = world.snapshot();
console.log(`${formatClock(snap.clock)} · ${JSON.stringify(snap.info)}`);
console.log(`事件：身边 ${snap.nearEvents.length} · 大事 ${snap.worldEvents.length} · 流水 ${snap.log.length} 条`);
console.log('\n═══ 下一轮注入（doupo_world 通道，正文模型会看到） ═══');
console.log(`${WORLD_HEADER}\n${buildWorldInjection(world.snapshot(), { maxChars: 900 })}`);
