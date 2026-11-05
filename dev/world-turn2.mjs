/**
 * 连跑两轮：验证「这一轮登记的事件，下一轮注入里到底有没有」。
 * 第一轮用 dev/model-reply.txt，第二轮用 dev/model-reply-2.txt；
 * 台账在两次之间不重建（等于同一个聊天存进 chatMetadata 再读回来）。
 * 跑法：node dev/world-turn2.mjs
 */
import { readFileSync } from 'node:fs';
import { createWorldRuntime, formatClock } from '../agent/doupo-agent-ui/world/world-runtime.js';
import { buildWorldInjection, WORLD_HEADER } from '../agent/doupo-agent-ui/world/world-ops.js';
import { buildDecideUser, parseDecision } from '../agent/doupo-agent-ui/world/world-decide.js';
import { createFactsIndex } from '../agent/doupo-agent-ui/narrative/facts-index.js';

const book = JSON.parse(readFileSync(new URL('../世界书/斗破世界书.json', import.meta.url), 'utf8'));
const factsIndex = createFactsIndex();
factsIndex.load(book);

const world = createWorldRuntime({ maxOps: 12, now: () => '本轮时刻' });

// floor 必须像真实链路那样一楼一号（扩展里取的是 lastReplyIndex）：
// 同一楼层再 apply 一次会被当成同楼重 roll，先把上一版指令撤销。
const turns = [
    {
        name: '第 1 轮',
        floor: 1,
        chat: [
            { is_user: true, mes: '我在府中练功，听到下人议论纳兰嫣然要来乌坦城的消息。' },
            { is_user: false, mes: '你正催动着一丝微弱的斗气，院外忽然传来下人们的窃窃私语——"云岚宗的少宗主要来了""听说是为退婚的事"。纳兰嫣然要来乌坦城？你的手顿在了半空。' },
        ],
        reply: './model-reply.txt',
    },
    {
        name: '第 2 轮',
        floor: 3,
        chat: [
            { is_user: true, mes: '我换了身衣服出门，去城里打听云岚宗来人的消息。' },
            { is_user: false, mes: '街上人声比往日嘈杂。茶摊上有人说云岚宗的信使今早已进了萧府，米铺老板正在挂新的价牌。' },
        ],
        reply: './model-reply-2.txt',
    },
];

for (const turn of turns) {
    console.log(`\n\n════════════════════════════════════════════════════════════`);
    console.log(`══════════════════════ ${turn.name} ══════════════════════`);
    console.log(`════════════════════════════════════════════════════════════`);

    // 本轮开始时的台账（= 上一轮存进 chatMetadata 后读回来的状态）
    const before = world.snapshot();
    console.log(`\n── 本轮开始时台账 ──`);
    console.log(`${formatClock(before.clock)} · 身边 ${before.nearEvents.length} · 大事 ${before.worldEvents.length} · 流水 ${before.log.length}`);

    // 组装决定上下文
    const recentText = turn.chat.map(m => m.mes).join('\n');
    const hits = factsIndex.matchTokens(recentText, { limit: 12, volume: null });
    const bookLines = hits.map(hit => { const entry = factsIndex.get(hit.uid); return entry ? `${entry.uid}|${entry.category}|${entry.name}|${entry.summary}` : null; }).filter(Boolean);
    const user = buildDecideUser({
        snapshot: world.snapshot(),
        floors: turn.chat.map(m => ({ role: m.is_user ? '玩家' : '角色', text: m.mes })),
        worldbookLines: bookLines,
    });
    console.log(`\n── 模型看到的台账段（user 前 200 字）──`);
    console.log(user.slice(0, 200).replace(/\n/g, '\n   '));

    // 模型回复 → 解析 → 执行
    const modelRaw = readFileSync(new URL(turn.reply, import.meta.url), 'utf8');
    const decision = parseDecision(modelRaw);
    const result = world.apply(decision.ops, { source: 'decide', floor: turn.floor });
    console.log(`\n── 本轮执行（${decision.ops.length} 条操作）──`);
    for (const item of result.applied) console.log(`  ✓ ${item.summary}`);
    for (const item of result.rejected) console.log(`  ✗ ${item.op}：${item.reason}`);

    // 下一轮注入
    console.log(`\n── 下一轮注入（doupo_world 通道，正文模型会看到的全文）──`);
    console.log(`${WORLD_HEADER}\n${buildWorldInjection(world.snapshot(), { maxChars: 900 })}`);
}
