import assert from 'node:assert/strict';
import test from 'node:test';
import {
    NPC_CHAT_PROMPT, NPC_CHAT_JSON_SCHEMA, NPC_CHAT_RECAP_PROMPT, NPC_CHAT_RECAP_JSON_SCHEMA,
    CHAT_FAVOR_STEP_MAX, buildChatContext, buildChatUser, parseChatReply,
    parseChatRecapReply,
} from './npc-chat.js';

test('对话上下文：档案/关系/知情/开环/时间五块都拼出来，缺料写暂无', () => {
    const context = buildChatContext({
        record: {
            name: '药老', gender: '男', identity: '灵魂体', realm: '斗尊', stage: '亦师亦友',
            location: '纳戒', presence: '在场', traits: ['睿智', '毒舌'], speech: '慢条斯理带嘲',
            catchphrase: '小家伙', taboo: '提魂殿', want: '复活', doing: '沉睡', appellation: '小家伙',
            attitude: '看好他', favor: 72,
            moods: [{ text: '欣慰' }], exp: [{ text: '答应指导他修炼焚决' }], log: [{ text: '教他配药' }],
        },
        relations: [{ to: '萧战', relation: '旧友' }, { to: '云韵', relation: '' }],
        knownFacts: ['玩家在乌坦城', '纳兰嫣然退婚了'],
        loops: [{ promise: '三日后教他炼药', dueDay: 12 }],
        day: 11, playerContext: { name: '萧炎', realm: '斗者三星' }, channel: '传讯',
    });
    assert.match(context, /药老/);
    assert.match(context, /亦师亦友/);
    assert.match(context, /说话风格：慢条斯理带嘲/);
    assert.match(context, /口头禅：小家伙/);
    assert.match(context, /雷区：提魂殿/);
    assert.match(context, /萧战（旧友）、云韵/, '有关系带关系名，没有的只列名字');
    assert.match(context, /萧战（旧友）/);
    assert.match(context, /纳兰嫣然/);
    assert.match(context, /纳兰嫣然退婚了/, '知情范围进提示词');
    assert.match(context, /三日后教他炼药/);
    assert.match(context, /第 11 天/);
    assert.match(context, /传讯玉简/);
    assert.match(context, /萧炎/);

    const bare = buildChatContext({ record: { name: '路人' }, day: null, channel: '面对面' });
    assert.match(bare, /【他身边的人】（暂无已记录的关系）/);
    assert.match(bare, /【他没兑现的承诺（开环）】\n（没有）/, '开环块永远在');
    assert.match(bare, /当面交谈/);
});

test('对话用户块：历史全量进喂料、玩家最新一句在最后，没说话也给出空手牌', () => {
    const history = Array.from({ length: 15 }, (_, index) => ({ who: index % 2 ? '他' : '玩家', text: `第${index}句` }));
    const user = buildChatUser({ history, playerText: '前辈，焚决第三层卡住了', context: '【人物档案】药老' });
    assert.match(user, /【人物档案】药老/);
    assert.match(user, /第0句/, '默认不截尾：历史全量进喂料（用户口径 2026-11-19）');
    assert.match(user, /第14句/, '最早到最新一句不少');
    assert.match(user, /【玩家这次说】\n玩家：前辈，焚决第三层卡住了/);
    const silent = buildChatUser({ history: [], playerText: '', context: '' });
    assert.match(silent, /（刚开始，还没有说过话）/);
    assert.match(silent, /（玩家没有说话，只是看着他/);
});

test('单轮回复解析：say 必有，favor 越界压回 ±3，坏输出报 invalid', () => {
    assert.deepEqual(parseChatReply('{"say":"小家伙，火烧到第三层就对了。","inner":"孺子可教","favor":2,"mood":"欣慰","promise":""}'), {
        status: 'ok', say: '小家伙，火烧到第三层就对了。', inner: '孺子可教', favor: 2, mood: '欣慰', promise: '',
    });
    const clamped = parseChatReply('{"say":"滚。","favor":9}');
    assert.equal(clamped.status, 'ok');
    assert.equal(clamped.favor, CHAT_FAVOR_STEP_MAX, '好感步进压回上限');
    assert.deepEqual(parseChatReply('{"favor":1}').status, 'invalid');
    assert.deepEqual(parseChatReply('不是 JSON').status, 'invalid');
    assert.equal(parseChatReply('```json\n{"say":"裹代码壳的也能读"}\n```').status, 'ok', '裹代码壳的也能读出 say');
    assert.equal(parseChatReply('{"say":"好","favor":"很多"}').favor, 0, '非整数好感当 0');
});

test('收尾回写解析：log 必有，learned 截到 6 条，favor 压回带内', () => {
    const ok = parseChatRecapReply('{"exp":"他答应护他去迦南学院","log":"谈了焚决进境与学院的事","favor":1,"learned":["a","b","c","d","e","f","g"]}');
    assert.equal(ok.status, 'ok');
    assert.equal(ok.learned.length, 6, 'learned 最多 6 条');
    assert.equal(ok.exp, '他答应护他去迦南学院');
    assert.deepEqual(parseChatRecapReply('{"exp":"有"}').status, 'invalid', '没有流水不算回写完成');
    const clamped = parseChatRecapReply('{"log":"聊了","favor":-8}');
    assert.equal(clamped.favor, -CHAT_FAVOR_STEP_MAX);
    assert.match(NPC_CHAT_PROMPT, /只输出一个 JSON/);
    assert.match(NPC_CHAT_RECAP_PROMPT, /对话记账人/);
    assert.equal(NPC_CHAT_JSON_SCHEMA.required[0], 'say');
    assert.equal(NPC_CHAT_RECAP_JSON_SCHEMA.required[0], 'log');
    assert.equal(Object.isFrozen(NPC_CHAT_JSON_SCHEMA), true);
});

test('对话上下文：往来概要单独成行', () => {
    const context = buildChatContext({
        record: { name: '掌柜', logSummary: '连着三天做药材生意', log: [{ text: '卖了凝血散' }], exp: [], favor: 3 },
    });
    assert.ok(context.includes('往来概要：连着三天做药材生意'), context);
});
