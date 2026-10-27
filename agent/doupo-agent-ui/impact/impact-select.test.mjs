import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildImpactInjectUser, buildImpactInjectionFromPicks, parseImpactSelect, IMPACT_INJECT_PROMPT, IMPACT_SELECT_LIMITS } from './impact-select.js';

/** 一条正常的影响记录；只覆盖测试关心的字段。 */
function record(overrides) {
    return {
        id: 'i1',
        day: 3,
        floor: 1,
        title: '加列家的药材库被烧',
        detail: '城中药材涨价，加列家开始查纵火的人',
        target: '加列家族',
        kind: 'direct',
        weight: 'major',
        certainty: 'certain',
        evidence: '第 1 楼',
        canon: '加列家族的药材生意',
        shift: 'alter',
        state: 'active',
        ripenDay: 3,
        ripenedDay: 3,
        resolution: '',
        resolvedDay: null,
        parent: null,
        depth: 0,
        source: 'decide',
        ...overrides,
    };
}

const records = [
    record({}),
    record({ id: 'i2', day: 5, title: '云岚宗来人', target: '云岚宗', weight: 'world', canon: '', shift: 'none', ripenDay: 9, ripenDayNote: undefined }),
    record({ id: 'i3', day: 6, title: '旧账', target: '萧家', weight: 'minor', certainty: 'rumor', state: 'closed', resolution: '赔钱了事', resolvedDay: 7 }),
    record({ id: 'i4', day: 2, title: '修好的桥', target: '乌坦城', state: 'reverted' }),
    record({ id: 'i5', day: 7, title: '坊间传闻', target: '米特尔家族', weight: 'minor', certainty: 'rumor', canon: '', shift: 'none' }),
];

// 提示词本身要守住两条底线：只从账本挑、已收场的不挑。
assert.match(IMPACT_INJECT_PROMPT, /场记/);
assert.match(IMPACT_INJECT_PROMPT, /只挑账本上已经记下的条目/);
assert.match(IMPACT_INJECT_PROMPT, /已了结、已修复的/);
assert.match(IMPACT_INJECT_PROMPT, /一条都用不上就交空清单/);

// 组装给挑选模型的内容：世界、账本、未到期提醒、对话、玩家这一轮的话都要在。
const user = buildImpactInjectUser({
    snapshot: {
        clock: { day: 8, minute: 540, label: '上午' },
        info: { weather: '阴', location: '乌坦城', era: '萧家退婚后', reputation: '萧家名声受损', wanted: '无' },
        nearEvents: [],
        worldEvents: [],
    },
    records,
    floors: [
        { role: '玩家', text: '我去云岚宗找纳兰嫣然。' },
        { role: '角色', text: '山路上的商队都在议论加列家。' },
    ],
    draft: '我想先打听云岚宗最近的动静。',
    day: 8,
});
assert.match(user, /【此刻的世界（既定状态）】/);
assert.match(user, /【世界线账本/);
assert.match(user, /未了结 3、已发酵 0、已收场 2/);
assert.match(user, /#i1｜第 3 天/);
assert.match(user, /【还没发作的安排/);
assert.match(user, /#i2｜第 9 天才会发作｜云岚宗来人/);
assert.match(user, /【最近对话（旧 → 新，共 2 楼）】/);
assert.match(user, /\[玩家\] 我去云岚宗找纳兰嫣然。/);
assert.match(user, /【玩家这一轮说】\n我想先打听云岚宗最近的动静。/);

// 空账本也要能组装，不能因为没东西可挑就崩。
const emptyUser = buildImpactInjectUser({ records: [], floors: [], draft: '', day: 1 });
assert.match(emptyUser, /账本还是空的/);
assert.match(emptyUser, /没有等待发作的事/);
assert.match(emptyUser, /玩家还没有输入/);

// 解析：只认账本里真实存在、还没收场的编号；重复与未知编号丢弃并计数。
const parsed = parseImpactSelect(JSON.stringify({
    note: '这一幕只用到药材和云岚宗两条。',
    picks: [
        { ref: '#i1', text: '城中药材一夜涨了三成，加列家在查放火的人。' },
        { ref: 'i9', text: '账本里没有这一条' },
        { ref: 'i3', text: '已经了结的旧账' },
        { ref: 'i1', text: '重复的编号只留第一条' },
        { ref: 'i2', text: '云岚宗的长老这两天就会到乌坦城。' },
    ],
}), { records });
assert.equal(parsed.status, 'ok');
assert.deepEqual(parsed.picks.map(pick => pick.ref), ['i1', 'i2']);
assert.equal(parsed.dropped, 3);
assert.match(parsed.note, /药材/);
assert.match(parsed.picks[0].text, /药材一夜涨了三成/);

// 一条都不剩就是 empty；坏 JSON 是 invalid；超长文本被裁到上限。
assert.equal(parseImpactSelect('{"note":"用不上","picks":[]}', { records }).status, 'empty');
assert.equal(parseImpactSelect('{\n  "picks": [\n    {"ref": "i1", "text": "断在这里"', { records }).status, 'invalid');
assert.equal(parseImpactSelect('顺便说一句，这轮不用旧账。', { records }).status, 'invalid');
const longText = '药材'.repeat(200);
const trimmed = parseImpactSelect(JSON.stringify({ picks: [{ ref: 'i1', text: longText }] }), { records });
assert.equal(trimmed.picks[0].text.length, IMPACT_SELECT_LIMITS.maxLineChars);
assert.equal(parseImpactSelect(JSON.stringify({ note: 'n'.repeat(300), picks: [{ ref: 'i1', text: '短句' }] }), { records }).note.length, IMPACT_SELECT_LIMITS.maxNoteChars);

// 挑选数量有上限：给十条只收八条。
const many = Array.from({ length: 10 }, (_, index) => record({ id: `m${index}`, title: `第 ${index} 件`, target: `对象${index}` }));
const capped = parseImpactSelect(JSON.stringify({ picks: many.map(item => ({ ref: item.id, text: `第 ${item.id} 件的事` })) }), { records: many });
assert.equal(capped.picks.length, IMPACT_SELECT_LIMITS.maxPicks);

// 拼正文注入：抬头 + 每条一行；世界级带 ★、传闻带 ？；未到期写“还没发作”。
const injection = buildImpactInjectionFromPicks(records, [
    { ref: 'i1', text: '城中药材一夜涨了三成。' },
    { ref: 'i2', text: '云岚宗的长老还在路上。' },
    { ref: 'i5', text: '米特尔家的人说萧家要倒大霉。' },
], { day: 8, maxChars: 800, maxLines: 8 });
assert.match(injection, /^【世界影响 · 本局世界线】/);
assert.match(injection, /· 城中药材一夜涨了三成。/);
assert.match(injection, /★还没发作（第 9 天）：云岚宗的长老还在路上。/);
assert.match(injection, /？米特尔家的人说萧家要倒大霉。/);

// 已收场的不进注入；一条都留不下就返回空串。
assert.doesNotMatch(buildImpactInjectionFromPicks(records, [{ ref: 'i3', text: '旧账' }, { ref: 'i4', text: '修好的桥' }], { day: 8 }), /旧账|修好的桥/);
assert.equal(buildImpactInjectionFromPicks(records, [], { day: 8 }), '');

// 预算：字号很紧时只留一条，且一定保留抬头。
const tight = buildImpactInjectionFromPicks(records, [
    { ref: 'i1', text: '城中药材一夜涨了三成，加列家开始挨家盘问，街口的药铺全都关了门。' },
    { ref: 'i5', text: '米特尔家的人说萧家要倒大霉。' },
], { day: 8, maxChars: 60, maxLines: 8 });
assert.equal(tight.split('\n').length, 2);
assert.match(tight.split('\n')[1], /药材/);

// 源码自检：这个模块不该反向依赖扩展入口（避免循环导入）。
const source = await readFile(new URL('./impact-select.js', import.meta.url), 'utf8');
assert.doesNotMatch(source, /from '\.\.\/index\.js'/);

console.log('impact select tests passed');
