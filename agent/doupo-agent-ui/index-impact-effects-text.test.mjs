import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

// 设置页「落成什么后果」那个多行输入框：手填的每一行要能变成 effects，
// 也要能把账本里的 effects 原样拼回去给玩家改。人物态度与玩家身家是 P2 新加的两类，
// 这条测试盯的是「面板手填 / 手改」和「记录员写下的」走同一套白名单，不出现第二套口径。
const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function extract(start, end) {
    assert.equal(source.split(start).length, 2, `unique entry: ${start}`);
    const from = source.indexOf(start), to = source.indexOf(end, from);
    assert.ok(to > from, `boundary: ${end}`);
    return source.slice(from, to);
}

const parseCode = extract('function parseImpactEffectsText(value)', 'function impactEffectsText(effects)');
const textCode = extract('function impactEffectsText(effects)', 'const IMPACT_REASON_TEXT');

function api() {
    return runInNewContext(`${parseCode}\n${textCode}\n({ parse: parseImpactEffectsText, text: impactEffectsText })`, {
        IMPACT_STANCE_BY_TEXT: { 敌对: 'hostile', 警惕: 'wary', 中立: 'neutral', 友好: 'friendly', 同盟: 'allied' },
        IMPACT_STANCE_TEXT_BY_VALUE: { hostile: '敌对', wary: '警惕', neutral: '中立', friendly: '友好', allied: '同盟' },
    });
}

function plain(value) {
    return JSON.parse(JSON.stringify(value ?? null));
}

await test('IMP-EFF-1 人物态度行：好感/态度/私下态度/称呼与理由都认', () => {
    const { parse } = api();
    const effects = plain(parse('人物 萧炎 好感+12 态度=拿你当能托底的人 称呼=兄台｜死巷里救了他一命'));
    assert.equal(effects.length, 1);
    assert.equal(effects[0].type, 'npc');
    assert.equal(effects[0].name, '萧炎');
    assert.equal(effects[0].favor, 12);
    assert.equal(effects[0].attitude, '拿你当能托底的人');
    assert.equal(effects[0].appellation, '兄台');
    assert.equal(effects[0].note, '死巷里救了他一命');
});

await test('IMP-EFF-2 玩家身家三种写法：金币、物品、境界', () => {
    const { parse } = api();
    const effects = plain(parse(['金币 +120｜药老给的谢礼', '金币 -30｜置办行头', '物品 玄铁片 +2｜货栈里捡的', '物品 三株药材 -1｜被抢了', '境界 斗师 三星｜被逼着当众突破'].join('\n')));
    assert.deepEqual(effects, [
        { type: 'self', field: 'gold', amount: 120, note: '药老给的谢礼' },
        { type: 'self', field: 'gold', amount: -30, note: '置办行头' },
        { type: 'self', field: 'item', name: '玄铁片', count: 2, note: '货栈里捡的' },
        { type: 'self', field: 'item', name: '三株药材', count: -1, note: '被抢了' },
        { type: 'self', field: 'realm', realm: '斗师', stage: '三星', note: '被逼着当众突破' },
    ]);
});

await test('IMP-EFF-3 老的三种仍照旧，不会被新分支抢走', () => {
    const { parse } = api();
    const effects = plain(parse(['事件 药材涨价｜城中药材一日三涨｜乌坦城', '名声 小有名气', '通缉 20', '势力 云岚宗 敌对 盯上了萧家'].join('\n')));
    assert.deepEqual(effects.map(item => item.type), ['event', 'info', 'info', 'faction']);
    assert.equal(effects[3].stance, 'hostile');
});

await test('IMP-EFF-4 写回文本再读回来，意思不变（面板「手改」必须可逆）', () => {
    const { parse, text } = api();
    const original = parse(['人物 萧炎 好感+12 态度=拿你当能托底的人｜救了他一命', '金币 +120｜谢礼', '物品 玄铁片 +2｜捡的', '境界 斗师 三星｜破阶'].join('\n'));
    const rebuilt = plain(parse(text(original)));
    assert.deepEqual(rebuilt, plain(original));
});

await test('IMP-EFF-5 无关行不会被认成后果（宁可不记，也不要瞎记）', () => {
    const { parse } = api();
    assert.deepEqual(plain(parse('随便写点什么\n\n   \n玩家很高兴')), []);
});
