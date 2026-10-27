import assert from 'node:assert/strict';

/**
 * 活链路两轮回归：玩家说话 → 记录员记账 → 下一轮开始场记挑影响 → 写进正文提示词。
 * 模型由测试假扮（generateQuietPrompt 返回固定 JSON），用来锁住：
 * ①验票会拦下坏条目；②同一轮不重复叫模型；③新的一轮必须重新挑；④手改账本后缓存作废。
 */
const roundOneUser = '萧炎压根没见过什么戒指，现在戒指在我的手里';
const roundOneReply = '演武场静了一瞬。萧炎盯着你摊开的手掌，喉结滚动了一下：“这戒指……哪来的？”';
const roundTwoUser = '我把戒指举到眼前，低声问：药老，你在里面吗？';
const roundTwoReply = '黑戒在你掌心微微发烫，一个苍老的嗓音贴着骨头响起来：“小声点，老家伙还没死透。”';

const calls = [];
const injected = new Map();
let decideRound = 0;
let pickRound = 0;

const recordRoundOne = {
    note: '玩家直接改写了纳戒归属。',
    ops: [
        {
            op: 'record',
            title: '药老的纳戒落进玩家手里',
            detail: '玩家当着萧家旁支的面摊开手掌，那枚黑色纳戒就在他指间；萧炎从没见过它。',
            target: '药老·纳戒',
            kind: 'butterfly',
            weight: 'world',
            certainty: 'certain',
            canon: '药老寄居纳戒、指点萧炎',
            shift: 'alter',
            evidence: roundOneUser,
        },
        {
            op: 'record',
            title: '演武场上开始传纳戒的闲话',
            detail: '围观子弟私下议论这东西的来历。',
            target: '萧家旁支',
            kind: 'ripple',
            weight: 'minor',
            certainty: 'rumor',
            evidence: '玩家当众亮出戒指',
            parent: 'i1',
        },
        {
            op: 'record',
            title: '萧家长老要查纳戒的来历',
            detail: '消息传到内院，长老们打算在族比后把人叫去问话。',
            target: '萧家长老',
            kind: 'direct',
            weight: 'major',
            certainty: 'certain',
            evidence: '玩家当众亮出戒指',
            ripen: 2,
        },
        { op: 'record', title: '', detail: '故意缺标题，验证验票。', target: '乌坦城' },
    ],
};

const recordRoundTwo = {
    note: '玩家把纳戒叫应了：药老提前苏醒。',
    ops: [
        {
            op: 'record',
            title: '药老提前三年苏醒，且认玩家为主',
            detail: '纳戒里的灵魂当场开口，承认自己寄居其中。',
            target: '药老·纳戒',
            kind: 'butterfly',
            weight: 'world',
            certainty: 'certain',
            canon: '药老苏醒并收萧炎为徒',
            shift: 'accelerate',
            evidence: roundTwoUser,
            parent: 'i1',
        },
        { op: 'ripen', ref: 'i3' },
        // 玩家推动旧影响：这一轮把“纳戒归属”这条旧账往后压两天再看（新影响 → 用 adjust 排期）。
        { op: 'adjust', ref: 'i1', days: 2, detail: '玩家刻意把戒指的事压了下去' },
    ],
};

const context = {
    chat: [
        { is_user: true, mes: roundOneUser },
        { is_user: false, mes: roundOneReply },
    ],
    chatMetadata: {},
    extensionSettings: {
        doupo_agent_ui: {
            llm: { mode: 'tavern', useSillyTavernConnection: true, temperature: 0.8 },
            impact: { decideEvery: 1, injectBudget: 800, injectMaxLines: 8 },
        },
    },
    setExtensionPrompt(key, text) { if (text) injected.set(key, text); else injected.delete(key); },
    extension_prompt_types: { IN_CHAT: 1 },
    extension_prompt_roles: { SYSTEM: 0 },
    async saveMetadata() { /* 内存存档即可 */ },
    async generateQuietPrompt(options) {
        const prompt = typeof options === 'string' ? options : options?.quietPrompt ?? '';
        if (prompt.includes('【最近聊天记录')) {
            decideRound += 1;
            calls.push(`记录员#${decideRound}`);
            return JSON.stringify(decideRound === 1 ? recordRoundOne : recordRoundTwo);
        }
        if (prompt.includes('【玩家这一轮说】')) {
            pickRound += 1;
            calls.push(`场记#${pickRound}`);
            const picks = pickRound === 1
                ? [
                    { ref: 'i1', text: '你摊开手掌时，那枚黑色纳戒凉得反常——萧炎盯着它，眼神里全是陌生。' },
                    { ref: '#i3', text: '内院已经递了话：族比之后，长老要亲自问这枚戒指的来历。' },
                    { ref: 'i99', text: '编出来的编号，验证过滤。' },
                ]
                : [
                    { ref: 'i4', text: '黑戒贴着你的掌心发烫，一个陌生又苍老的声音在骨头上响了一下。' },
                    { ref: 'i3', text: '内院那边已经递了话：族比之后要问这枚戒指的来历。' },
                ];
            return JSON.stringify({ note: `第 ${pickRound} 次挑选`, picks });
        }
        throw new Error(`意料之外的提示词：${prompt.slice(0, 40)}`);
    },
};
globalThis.SillyTavern = { getContext: () => context };

const { doupoAgent } = await import('./index.js');
doupoAgent.impactRuntime.reset();

const decidedOne = await doupoAgent.impactDecide({ source: 'manual' });
assert.equal(decidedOne.result.status, 'applied');
assert.equal(decidedOne.result.rejected[0].reason, 'title_missing');
assert.equal(doupoAgent.impactStatus().total, 3);
assert.equal((context.chatMetadata.doupo_agent_impact?.records ?? []).length, 3);

context.chat.push({ is_user: true, mes: roundTwoUser });
const injectOne = await doupoAgent.impactInjection();
assert.equal(injectOne.status, 'injected');
assert.ok(injectOne.usedIds.includes('i1'));
assert.ok(injectOne.usedIds.includes('i3'));
assert.deepEqual(doupoAgent.impactInjectedIds(), injectOne.usedIds);
const textOne = injected.get('doupo_impact') ?? '';
assert.match(textOne, /黑色纳戒凉得反常/);
assert.match(textOne, /还没发作（第 3 天）/);
assert.doesNotMatch(textOne, /i99/);

const beforeCache = calls.length;
await doupoAgent.impactInjection();
assert.equal(calls.length, beforeCache, '同一轮重复取注入不该再叫模型');

context.chat.push({ is_user: false, mes: roundTwoReply });
const decidedTwo = await doupoAgent.impactDecide({ source: 'manual' });
assert.equal(doupoAgent.impactStatus().total, 4);
assert.equal(doupoAgent.impactStatus().ripened, 1);
const pushed = doupoAgent.impacts.list({ limit: 50 }).find(record => record.id === 'i1');
assert.equal(pushed.ripenDay, 3, 'adjust 应该把旧账排到第 3 天');
assert.equal(pushed.edited, true);
assert.equal(doupoAgent.impactStatus().edited, 1);

context.chat.push({ is_user: true, mes: '我压低声音：前辈，您认识萧炎吗？' });
const injectTwo = await doupoAgent.impactInjection();
const textTwo = injected.get('doupo_impact') ?? '';
assert.match(textTwo, /陌生又苍老的声音/);
assert.match(textTwo, /族比之后要问这枚戒指的来历/);
assert.deepEqual(calls, ['记录员#1', '场记#1', '记录员#2', '场记#2']);

doupoAgent.impacts.apply([{ op: 'edit', ref: 'i2', title: '闲话变成当众追问', weight: 'major' }], { source: 'manual', day: 1 });
const beforeEdit = calls.length;
await doupoAgent.impactInjection();
assert.equal(calls.length, beforeEdit + 1, '手改账本后必须重新挑');

delete globalThis.SillyTavern;
console.log('impact flow tests passed');
