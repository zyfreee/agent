import assert from 'node:assert/strict';
import { createNpcLedger, favorLabel, normalizePatch, normalizeRecord, NPC_FIELDS, FAVOR_MIN, FAVOR_MAX, FAVOR_REASON_MAX, FAVOR_STEP_MAX } from './npc-ledger.js';

// OPT-051: replace only the owned latest floor, never restore over manual work.
{
    const make = () => createNpcLedger({ now: () => 'fixed' });
    const patch = (text, favor = 4) => ({ name: 'A', identity: text, favor, log: [text], exp: [text], presence: '在场' });
    const ledger = make(); ledger.apply({ name: 'A', identity: 'baseline', favor: 2 });
    const before = ledger.exportAll().records, beforeStatus = structuredClone(ledger.status());
    assert.equal(ledger.recordReply(patch('old'), { floor: 3, day: 2 }).status, 'applied');
    assert.equal(ledger.recordReply(patch('new', -1), { floor: 3, day: 2 }).replaced, true);
    assert.equal(ledger.get('A').favor, 1); assert.equal(ledger.get('A').identity, 'new');
    assert.deepEqual(ledger.get('A').log.map(item => item.text), ['new']);
    assert.deepEqual(ledger.get('A').exp.map(item => item.text), ['new']);
    ledger.recordReply(patch('new', -1), { floor: 3, day: 2 });
    assert.equal(ledger.get('A').favor, 1, 'manual retry never accumulates');
    assert.equal(ledger.recordReply(null, { floor: 3 }).status, 'empty');
    assert.deepEqual(ledger.exportAll().records, before); assert.deepEqual(ledger.status(), beforeStatus);
    ledger.recordReply(patch('floor3'), { floor: 3 });
    ledger.recordReply(patch('floor4', 1), { floor: 4 });
    assert.equal(ledger.get('A').favor, 7);
    ledger.recordReply(patch('floor4new', 2), { floor: 4 });
    assert.equal(ledger.get('A').favor, 8);
    const snapshot = ledger.exportAll(), status = structuredClone(ledger.status());
    assert.equal(ledger.recordReply(null, { floor: 3 }).status, 'replay_unavailable');
    assert.deepEqual(ledger.exportAll(), snapshot); assert.deepEqual(ledger.status(), status);
    const manual = make(); manual.apply({ name: 'manual before floor0', identity: 'keep' });
    assert.equal(manual.recordReply([], { floor: 0 }).status, 'empty');
    const fresh = make(); fresh.recordReply({ name: 'created', favor: 5 }, { floor: 0 });
    fresh.recordReply([], { floor: 0 }); assert.equal(fresh.status().total, 0);
    assert.equal(fresh.recordReply([], { floor: -1 }).status, 'rejected');
    assert.equal(fresh.recordReply([], {}).status, 'rejected');
    for (const edit of [book => book.setFields('A', { identity: 'manual' }), book => book.apply({ name: 'B', identity: 'manual' }), book => book.addExp('A', 'manual'), book => book.remove('A')]) {
        const book = make(); book.recordReply(patch('reply'), { floor: 2 }); edit(book);
        const saved = book.exportAll(), state = structuredClone(book.status());
        assert.equal(book.recordReply(patch('replacement'), { floor: 2 }).status, 'replay_conflict');
        assert.deepEqual(book.exportAll(), saved); assert.deepEqual(book.status(), state);
        assert.equal(book.recordReply(patch('next'), { floor: 3 }).status, 'applied', 'forward floor preserves intervening manual work');
    }
    const throwing = { get name() { throw new Error('bad payload'); } };
    assert.throws(() => ledger.recordReply(throwing, { floor: 4 }), /bad payload/);
    assert.deepEqual(ledger.exportAll(), snapshot); assert.deepEqual(ledger.status(), status);
    const exported = ledger.exportAll();
    assert.equal(exported._runtime.version, 1); assert.equal(exported._runtime.lastReply.floor, 4);
    const restored = make(); restored.load(JSON.parse(JSON.stringify(exported)));
    assert.equal(restored.recordReply(null, { floor: 4, replay: true }).status, 'empty');
    assert.equal(restored.get('A').identity, 'floor3'); assert.equal(restored.get('A').favor, 6);
    for (const corrupt of [saved => delete saved._runtime, saved => { saved._runtime.version = 2; }, saved => { saved._runtime.lastReply.floor = -1; }, saved => { saved._runtime.lastReply.before.records[0].favor = 999; }, saved => { saved._runtime.lastReply.before.records.push(saved._runtime.lastReply.before.records[0]); }, saved => { saved._runtime.lastReply.afterFingerprint = '{}'; }, saved => { saved.records[0].identity = 'external edit'; }]) {
        const saved = structuredClone(exported); corrupt(saved);
        const book = make(); book.load(saved); const before = book.exportAll(), state = structuredClone(book.status());
        assert.equal(book.recordReply(null, { floor: 4, replay: true }).status, 'replay_unavailable');
        assert.deepEqual(book.exportAll(), before); assert.deepEqual(book.status(), state);
    }
    const legacy = make(); legacy.load({ records: exported.records });
    assert.equal(legacy.recordReply(patch('old archive'), { floor: 4 }).status, 'replay_unavailable');
    assert.equal(legacy.recordReply(patch('forward'), { floor: 5 }).status, 'applied');
    // 好感带依据（basis）的落账不能被指纹校验拒掉：apply 写进 favorLog 的 basis 必须与
    // normalizeRecord 重建的同形，否则凡模型写「好感+依据」整单 invalid_reply_result。
    {
        const book = make();
        const applied = book.recordReply({ name: 'A', favor: 3, favorReason: '收下药材', basis: '本轮正文：A 收下三株药材并道谢' }, { floor: 6, day: 9 });
        assert.equal(applied.status, 'applied');
        const entry = book.get('A').favorLog.at(-1);
        assert.equal(entry.basis, '本轮正文：A 收下三株药材并道谢');
        // 落档→重载（normalizeRecord 重建）→再落账：整条链上指纹保持一致。
        const reloaded = make(); reloaded.load(JSON.parse(JSON.stringify(book.exportAll())));
        assert.equal(reloaded.get('A').favorLog.at(-1).basis, '本轮正文：A 收下三株药材并道谢');
        assert.equal(reloaded.recordReply({ name: 'A', favor: 1, favorReason: '再谢', basis: '本轮正文：临别又道一次谢' }, { floor: 7, day: 10 }).status, 'applied');
    }
    const emptyLegacy = make(); emptyLegacy.load({ records: [] });
    assert.equal(emptyLegacy.recordReply([], { floor: 4, replay: true }).status, 'replay_unavailable');
    const manualAfter = make(); manualAfter.load(exported); manualAfter.setFields('A', { identity: 'manual after load' });
    const manualSnapshot = manualAfter.exportAll();
    const manualReloaded = make(); manualReloaded.load(manualSnapshot);
    assert.equal(manualReloaded.recordReply([], { floor: 4, replay: true }).status, 'replay_unavailable');
    assert.equal(manualReloaded.get('A').identity, 'manual after load');
    const malformed = structuredClone(exported); malformed._runtime.lastReply.afterFingerprint = 'not JSON';
    const recovered = make(); assert.equal(recovered.load(malformed).status, 'loaded');
    assert.equal(recovered.recordReply([], { floor: 4, replay: true }).status, 'replay_unavailable');
    const emptyFloor = make(); emptyFloor.recordReply([], { floor: 8 });
    const emptyRestored = make(); emptyRestored.load(emptyFloor.exportAll());
    assert.equal(emptyRestored.recordReply({ name: 'new branch' }, { floor: 8, replay: true }).status, 'applied');
    const snapshotClone = ledger.exportAll(); snapshotClone._runtime.lastReply.before.records.length = 0;
    assert.deepEqual(ledger.exportAll(), snapshot, 'export metadata is detached');
    const ordinary = make(); ordinary.apply(patch('ordinary'), { floor: 1 }); ordinary.apply(patch('ordinary'), { floor: 1 });
    assert.equal(ordinary.get('A').favor, 8, 'ordinary apply remains additive');
}

// OPT-058: unknown/invalid days stay null across apply, condense and persistence.
for (const day of [null, undefined, '', '  ', 0, -1, 1.5, 100000, true, 'bad', 1, '12', 99999]) {
    const expected = [1, '12', 99999].includes(day) ? Number(day) : null;
    const ledger = createNpcLedger();
    ledger.apply({ name: 'date', exp: [{ text: 'change', day }], log: ['event'], favor: 1 }, { day, logSrc: '冷藏' });
    const record = ledger.get('date');
    assert.equal(record.exp[0].day, expected);
    assert.equal(record.log[0].day, expected);
    assert.equal(record.favorLog[0].day, expected);
    assert.equal(record.coldTouch.day, expected);
    ledger.replaceExp('date', [{ text: 'condensed', day }]);
    const restored = createNpcLedger(); restored.load(ledger.exportAll());
    assert.equal(restored.get('date').exp[0].day, expected);
    assert.equal(restored.get('date').log[0].day, expected);
    assert.equal(restored.get('date').favorLog[0].day, expected);
    assert.equal(restored.get('date').coldTouch.day, expected);
    assert.equal(normalizeRecord({ name: 'raw', exp: [{ text: 'x', day }], log: [{ text: 'x', day }], favorLog: [{ day }], coldTouch: { day } }).exp[0].day, expected);
}
{
    const ledger = createNpcLedger();
    ledger.apply({ name: 'date', exp: [{ text: 'unknown', day: null }, { text: 'missing' }, { text: 'alias', 天数: 3 }, 'context'] }, { day: 7 });
    assert.deepEqual(ledger.get('date').exp.map(item => item.day), [null, 7, 3, 7]);
    ledger.addExp('date', 'manual unknown');
    assert.equal(ledger.get('date').exp.at(-1).day, null);
}


// 0) 组键打包（模型的常见输出）：外貌/性格/对玩家/处境带着一堆子字段来时必须拆开逐个收，
// 不拆的话整组都会被当成不认识的键丢掉，信息面板就只剩空壳。
{
    const grouped = normalizePatch({
        姓名: '说书人',
        外貌: { 真实样貌: '灰袍老者，须发花白', 示人样貌: '灰袍老者，须发花白' },
        性格: { 说话风格: '压低嗓音，爱卖关子', 想要什么: '讨几个赏钱' },
        对玩家: { 态度: '打量后压低声音细说', 当前称呼: '小哥' },
        处境: { 正在做什么: '收拾摊子' },
    });
    assert.equal(grouped.fields.look, '灰袍老者，须发花白');
    assert.equal(grouped.fields.shownLook, '灰袍老者，须发花白');
    assert.equal(grouped.fields.speech, '压低嗓音，爱卖关子');
    assert.equal(grouped.fields.want, '讨几个赏钱');
    assert.equal(grouped.fields.attitude, '打量后压低声音细说');
    assert.equal(grouped.fields.appellation, '小哥');
    assert.equal(grouped.fields.doing, '收拾摊子');
    assert.deepEqual(grouped.ignored, [], '组键拆包后不许还有整组被丢');
    // “性格”是字符串时照旧进标签列表，不许拆包逻辑把它改坏。
    const stringTraits = normalizePatch({ 姓名: '测试', 性格: '高傲、记仇' });
    assert.deepEqual(stringTraits.fields.traits, ['高傲', '记仇']);
    // 外貌单发一个字符串也能认。
    assert.equal(normalizePatch({ 姓名: '测试', 外貌: '青衫少年' }).fields.look, '青衫少年');
}

// 1) 建档：一人一条，姓名是主键，别名能把后来的写法指回同一份档案。
{
    const ledger = createNpcLedger();
    const first = ledger.apply({ 人物: [{ 姓名: '萧炎', 别名: ['炎帝'], 身份: '萧家少主', 在场: '在场', 重要: '重要' }] }, { floor: 3, day: 1 });
    assert.equal(first.status, 'applied');
    assert.deepEqual(first.created, ['萧炎']);
    const record = ledger.get('萧炎');
    assert.equal(record.identity, '萧家少主');
    assert.deepEqual(record.aliases, ['炎帝']);
    assert.equal(record.presence, '在场');
    assert.equal(record.importance, '重要');
    assert.equal(record.source, '正文');
    assert.equal(record.firstFloor, 3);

    const second = ledger.apply({ 人物: [{ 姓名: '炎帝', 态度: '多了几分欣赏' }] }, { floor: 4, day: 1 });
    assert.deepEqual(second.created, []);
    assert.equal(second.applied[0].name, '萧炎', '别名必须指回原档案，不能再建一份');
    assert.equal(ledger.status().total, 1);
    assert.equal(ledger.get('萧炎').attitude, '多了几分欣赏');
}

// 2) 好感只记增减、单次最多 ±10：模型写 +95 也只记 +10，理由压到 15 字以内。
{
    const ledger = createNpcLedger();
    ledger.apply({ 人物: [{ 姓名: '萧炎', 好感: '+95', 理由: '救下萧家满门上下老小' }] }, { floor: 5, day: 2 });
    assert.equal(ledger.get('萧炎').favor, FAVOR_STEP_MAX, '单次超过 ±10 要压回 ±10');
    assert.equal(ledger.get('萧炎').favorLog[0].delta, FAVOR_STEP_MAX);
    assert.ok(ledger.get('萧炎').favorLog[0].reason.length <= FAVOR_REASON_MAX, '理由必须压到 15 字以内');

    for (let round = 0; round < 12; round += 1) {
        ledger.apply({ 人物: [{ 姓名: '萧炎', 好感: 10, 理由: '又帮一次' }] }, { floor: 6 + round, day: 2 });
    }
    assert.equal(ledger.get('萧炎').favor, FAVOR_MAX, '累计到上限要停在 100，不能溢出');
    assert.equal(favorLabel(FAVOR_MAX), '生死之交');
    assert.ok(ledger.get('萧炎').favorLog.every(entry => Math.abs(entry.delta) <= FAVOR_STEP_MAX), '每条流水都不能超过 ±10');

    ledger.apply({ 人物: [{ 姓名: '萧炎', 好感: '-200', 理由: '翻脸' }] }, { floor: 30, day: 2 });
    assert.equal(ledger.get('萧炎').favorLog.at(-1).delta, -FAVOR_STEP_MAX, '负向也压到 -10');
    assert.equal(ledger.get('萧炎').favor, FAVOR_MAX - FAVOR_STEP_MAX);
    assert.equal(ledger.get('萧炎').favorLog.at(-1).floor, 30);
}

// 3) 流水只追加不覆盖，改一次版本号加一。
{
    const ledger = createNpcLedger();
    ledger.apply({ 人物: [{ 姓名: '萧战', 身份: '萧家族长' }] }, { floor: 2, day: 1 });
    const before = ledger.get('萧战').version;
    ledger.apply({ 人物: [{ 姓名: '萧战', 流水: ['主持族会，压下二长老的质疑'] }] }, { floor: 8, day: 3 });
    const record = ledger.get('萧战');
    assert.ok(record.version > before);
    assert.equal(record.log.at(-1).text, '主持族会，压下二长老的质疑');
    assert.equal(record.log.at(-1).floor, 8);
    assert.equal(record.log.at(-1).day, 3);
    assert.equal(record.log.length, 1);
}

// 4) 认不出的键原地忽略，不报错、不写库。
{
    const ledger = createNpcLedger();
    const result = ledger.apply({ 人物: [{ 姓名: '萧战', 斗气化马: '是', 境界: '斗王' }] }, { floor: 1 });
    assert.deepEqual(result.ignored, ['斗气化马']);
    assert.equal(ledger.get('萧战').realm, '斗王');
    assert.equal(Object.prototype.hasOwnProperty.call(ledger.get('萧战'), '斗气化马'), false);
}

// 5) 四象限：在场×重要给全档；在场×不重要给一行；不在场×重要给一行带位置；不在场×不重要不出现。
{
    const ledger = createNpcLedger();
    ledger.apply({
        人物: [
            { 姓名: '萧炎', 身份: '萧家少主', 境界: '斗师', 在场: '在场', 重要: '重要', 好感: '+30', 态度: '把这小子当自家人' },
            { 姓名: '阿福', 身份: '萧家管事', 在场: '在场', 重要: '不重要' },
            { 姓名: '云韵', 身份: '云岚宗宗主', 位置: '魔兽山脉', 在场: '不在场', 重要: '重要', 好感: '-20' },
            { 姓名: '路人乙', 身份: '街边小贩', 在场: '不在场', 重要: '不重要' },
        ],
    }, { floor: 9, day: 4 });
    const view = ledger.injection({ budget: 4000 });
    assert.ok(view.text.startsWith('【人物簿·本楼已记】'));
    assert.ok(view.text.includes('身份：萧家少主'), '在场×重要要给全字段');
    assert.ok(view.text.includes('修为：斗师'));
    assert.ok(view.text.includes('阿福'), '在场×不重要的也要露一行');
    assert.ok(view.text.includes('云韵'), '不在场×重要的要露一行');
    assert.ok(view.text.includes('魔兽山脉'), '不在场的人要带上他在哪');
    assert.equal(view.text.includes('路人乙'), false, '不在场又不重要的人不注入');
    assert.deepEqual(view.used.sort(), ['云韵', '萧炎', '阿福'].sort());
    assert.equal(view.counts.full, 1);
}

// 6) 超预算先降级成一行，不硬截断半句话。
{
    const ledger = createNpcLedger();
    const people = [];
    for (let index = 0; index < 8; index += 1) {
        people.push({ 姓名: `角色${index}`, 身份: '门中弟子', 在场: '在场', 重要: '重要', 正在做什么: '在大殿里候着，等宗主发话' });
    }
    ledger.apply({ 人物: people }, { floor: 2 });
    const view = ledger.injection({ budget: 200 });
    assert.ok(view.text.length <= 200);
    assert.ok(view.degraded.length > 0, '预算不够时应该降级而不是直接截断');
    assert.ok(view.used.length >= 2);
}

// OPT-059: preserve complete visible profiles before omission; metadata matches text.
{
    const ledger = createNpcLedger();
    ledger.apply({ 人物: ['A', 'B'].map(name => ({ name, identity: '身'.repeat(200), presence: '在场', importance: '重要' })) });
    const view = ledger.injection({ budget: 300 });
    assert.deepEqual(view.used.sort(), ['A', 'B']);
    // 可行布局：A 全档 + B 简档已 ≤300，只降级 B；不得继续把 A 也降掉。
    assert.deepEqual(view.degraded, ['B']);
    assert.deepEqual(view.omitted, []);
    assert.equal(view.counts.full, 1); assert.equal(view.counts.brief, 1);
    for (const name of view.used) assert.match(view.text, new RegExp(name));
    assert.ok(view.chars <= 300);
    for (const budget of [0, 1, 10, 30, 60, 120]) {
        const small = ledger.injection({ budget });
        assert.ok(small.chars <= budget);
        assert.equal(small.counts.full + small.counts.brief, small.used.length);
        assert.deepEqual([...small.used, ...small.omitted].sort(), ['A', 'B']);
        assert.ok(small.degraded.every(name => small.used.includes(name)));
        for (const name of ['A', 'B']) assert.equal(small.text.includes(name), small.used.includes(name));
        assert.ok(!small.text || small.text.split('\n').at(-1).includes('好感'), 'never half a profile');
    }
}
{
    const ledger = createNpcLedger();
    ledger.apply({ name: 'old', presence: '在场', importance: '重要' }, { floor: 1 });
    ledger.apply({ name: 'new', presence: '在场', importance: '重要' }, { floor: 9 });
    ledger.apply({ name: 'present', presence: '在场' });
    ledger.apply({ name: 'distant', importance: '重要' });
    ledger.apply({ name: 'irrelevant' });
    const capped = ledger.injection({ budget: 4000, maxFull: 1, maxBrief: 2 });
    assert.match(capped.text, /【new】/);
    assert.deepEqual(capped.used, ['new', 'old', 'present']);
    assert.deepEqual(capped.degraded, ['old']); assert.deepEqual(capped.omitted, ['distant']);
    const briefOnly = ledger.injection({ budget: 4000, maxFull: 0, maxBrief: 2 });
    assert.deepEqual(briefOnly.used, ['new', 'old']); assert.equal(briefOnly.counts.full, 0);
    const none = ledger.injection({ budget: 4000, maxFull: 0, maxBrief: 0 });
    assert.equal(none.text, ''); assert.equal(none.used.length, 0); assert.equal(none.omitted.length, 4);
    const fullOnly = ledger.injection({ budget: 4000, maxFull: 1, maxBrief: 0 });
    assert.deepEqual(fullOnly.used, ['new']); assert.equal(fullOnly.counts.brief, 0);
}

// SELF-NPC-R6: the budget loop must stop the moment the current layout fits.
{
    const ledger = createNpcLedger();
    ledger.apply({ 人物: [{ name: 'A', identity: 'captain', look: 'x'.repeat(200), presence: '在场', importance: '重要' }, { name: 'B', identity: 'guard', look: 'y'.repeat(200), presence: '在场', importance: '重要' }] });
    const view = ledger.injection({ budget: 300, maxFull: 2, maxBrief: 1 });
    assert.deepEqual(view.used, ['A', 'B']);
    assert.deepEqual(view.omitted, []);
    assert.deepEqual(view.degraded, ['B']);
    assert.equal(view.counts.full, 1); assert.equal(view.counts.brief, 1);
    assert.ok(view.chars <= 300, `feasible layout ${view.chars} must fit budget 300`);
    assert.match(view.text, /【A】/, 'A keeps the full profile');
    assert.match(view.text, /B｜在场/, 'B stays visible as a brief line');
    const tiny = ledger.injection({ budget: 40, maxBrief: 0 });
    assert.ok(tiny.chars <= 40);
    assert.deepEqual(tiny.used, []);
    assert.deepEqual(tiny.omitted.sort(), ['A', 'B']);
    const three = createNpcLedger();
    three.apply({ 人物: ['A', 'B', 'C'].map(name => ({ name, identity: '弟子', presence: '在场', importance: '重要' })) }, { floor: 1 });
    three.apply({ name: 'C', doing: '巡场' }, { floor: 9 });
    const ranked = three.injection({ budget: 55, maxFull: 1, maxBrief: 2 });
    assert.deepEqual(ranked.used, ['C', 'A'], 'most recent important profile keeps priority');
    assert.deepEqual(ranked.omitted, ['B']);
    assert.ok(ranked.chars <= 55);
}

// OPT-104: content, not entry count, controls experience change metadata.
{
    let tick = 0;
    const ledger = createNpcLedger({ now: () => `tick-${++tick}` });
    ledger.apply({ name: 'version', exp: ['before'] });
    for (const entries of [[{ text: 'after', day: null }], [{ text: 'dated', day: 2 }], [{ text: 'one' }, { text: 'two' }], [{ text: 'short' }], []]) {
        const before = ledger.get('version'), changes = ledger.status().changes;
        ledger.replaceExp('version', entries);
        const after = ledger.get('version');
        assert.equal(after.version, before.version + 1);
        assert.notEqual(after.updatedAt, before.updatedAt);
        assert.equal(ledger.status().changes, changes + 1);
        assert.deepEqual(ledger.status().lastChange.fields, ['经历精简']);
        const unchanged = ledger.exportAll().records, changeState = structuredClone(ledger.status());
        ledger.replaceExp('version', entries);
        assert.deepEqual(ledger.exportAll().records, unchanged);
        assert.deepEqual(ledger.status(), changeState);
    }
    const restored = createNpcLedger(); restored.load(ledger.exportAll());
    assert.deepEqual(restored.get('version'), ledger.get('version'));
}

// 7) 导出、再载入：档案不丢，字段还能对上。
{
    const ledger = createNpcLedger();
    ledger.apply({ 人物: [{ 姓名: '药老', 身份: '炼药师', 伤势: '魂魄残破' }, { 姓名: '萧薰儿', 好感: '+12' }] }, { floor: 4, day: 2 });
    const dump = ledger.exportAll();
    assert.equal(dump.version, 1);
    assert.equal(dump.records.length, 2);

    const reloaded = createNpcLedger();
    const loaded = reloaded.load({ ...dump, lastFloor: 4 });
    assert.equal(loaded.status, 'loaded');
    assert.equal(loaded.total, 2);
    assert.equal(reloaded.get('药老').injury, '魂魄残破');
    assert.equal(reloaded.get('萧薰儿').favor, 10, '相对 +12 的单次增减按 ±10 收');
    assert.equal(reloaded.get('萧薰儿').favorLog.length, 1);
    assert.equal(loaded.skipped, 0);

    const broken = createNpcLedger();
    assert.equal(broken.load({ records: [null, 'obviously not a record', {}] }).skipped, 3);
}

// 8) 删除、清空、列人。
{
    const ledger = createNpcLedger();
    ledger.apply({ 人物: [{ 姓名: '萧炎' }, { 姓名: '萧薰儿' }] }, { floor: 1 });
    assert.equal(ledger.remove('萧炎').status, 'removed');
    assert.equal(ledger.get('萧炎'), null);
    assert.equal(ledger.remove('萧炎').status, 'not_found');
    assert.deepEqual(ledger.names(), ['萧薰儿']);
    assert.equal(ledger.clear().status, 'cleared');
    assert.equal(ledger.status().total, 0);
    assert.equal(ledger.injection().text, '');
}

// 9) 空补丁、坏补丁都不炸。
{
    const ledger = createNpcLedger();
    assert.equal(ledger.apply(null).status, 'empty');
    assert.equal(ledger.apply({ 人物: [] }).status, 'empty');
    assert.equal(ledger.apply({ 人物: [{ 身份: '没有名字的人' }] }).skipped[0].reason, 'missing_name');
    assert.equal(ledger.apply({ 人物: [{ 姓名: '萧炎', 境界: '不变' }] }).applied[0].fields.length, 0, '“不变”不能写进档案');
    assert.equal(ledger.describe('不存在的人'), '');
}

// 10) 字段表本身要被页面和提示词共用。
{
    assert.ok(NPC_FIELDS.length >= 30);
    const labels = NPC_FIELDS.map(field => field.label);
    for (const label of ['身份', '境界', '态度', '所在位置', '秘密', '重要度']) assert.ok(labels.includes(label), `缺字段：${label}`);
    assert.equal(favorLabel(0), '冷淡');
    assert.equal(favorLabel(-100), '死敌');
}

// 11) 衣着与随身物品的四段式：名称/部位/品阶/状态、名称/数量/来源/藏着，回读不能被洗掉。
{
    const ledger = createNpcLedger();
    ledger.apply({
        人物: [{
            姓名: '萧战',
            衣着: [{ 名称: '白袍', 部位: '外袍', 品阶: '玄阶', 状态: '旧' }],
            随身物品: [{ 名称: '玉牌', 数量: 2, 来源: '族库', 藏着: true }],
        }],
    }, { floor: 2, day: 1 });
    const record = ledger.get('萧战');
    assert.equal(record.clothes[0].part, '外袍');
    assert.equal(record.clothes[0].grade, '玄阶');
    assert.equal(record.clothes[0].state, '旧');
    assert.equal(record.items[0].count, 2);
    assert.equal(record.items[0].source, '族库');
    assert.equal(record.items[0].hidden, true);
    const text = ledger.describe(record, 'full');
    assert.ok(text.includes('外袍·玄阶·旧'), '衣着四段要显示出来');
    assert.ok(text.includes('×2'), '数量要显示出来');
    assert.ok(text.includes('藏着'), '藏着的标记要显示出来');

    // 走一遍导出/导入（normalizeRecord 会重新洗一次），四段仍要在。
    const again = createNpcLedger();
    again.load(ledger.exportAll());
    const copy = again.get('萧战');
    assert.equal(copy.clothes[0].grade, '玄阶');
    assert.equal(copy.items[0].source, '族库');
}

// 13) 只填空模式：世界书抄档不许覆盖正文已经记下的东西；没记过的才补。
{
    const ledger = createNpcLedger();
    ledger.apply({ 人物: [{ 姓名: '萧战', 身份: '萧家族长', 在场: '在场', 好感: '+7', 理由: '护住族人', 流水: ['主持族会'] }] }, { floor: 2, day: 1 });
    const before = ledger.get('萧战');
    assert.equal(before.gender, '');

    const result = ledger.apply({ 人物: [{ 姓名: '萧战', 性别: '男', 身份: '萧家退隐长老', 境界: '斗皇', 好感: '+50', 理由: '改写', 流水: ['不该出现'] }] }, { floor: null, day: 1, source: '世界书', fillEmpty: true });
    assert.equal(result.status, 'applied');
    const after = ledger.get('萧战');
    assert.equal(after.gender, '男', '空着的字段要补上');
    assert.equal(after.realm, '斗皇');
    assert.equal(after.identity, '萧家族长', '已有的身份不能被抄档覆盖');
    assert.equal(after.favor, 7, '好感不能被动');
    assert.deepEqual(after.log.map(entry => entry.text), ['主持族会'], '流水不能被动');

    // 只填空只在“在场/重要”还是默认值时才动这两个。
    assert.equal(after.presence, '在场');
    const result2 = ledger.apply({ 人物: [{ 姓名: '萧炎', 姓名注: '', 在场: '不在场', 重要度: '重要' }] }, { floor: null, day: 1, source: '世界书', fillEmpty: true });
    assert.equal(result2.status, 'applied');
    assert.equal(ledger.get('萧炎').presence, '不在场');
}

// 14) missing() 报出还空着的字段，面板「重抽」和“只填空”都靠它。
{
    const ledger = createNpcLedger();
    ledger.apply({ 人物: [{ 姓名: '云韵', 身份: '云岚宗宗主', 性别: '女' }] }, { floor: 1, day: 1 });
    const missing = ledger.missing('云韵');
    assert.ok(Array.isArray(missing));
    assert.ok(!missing.includes('身份'), '已填的字段不该算缺');
    assert.ok(!missing.includes('性别'));
    assert.ok(missing.includes('年龄'), '空字段要算缺');
    assert.ok(missing.length >= 20, '新档应该缺一大片');
    assert.ok(ledger.missing('查无此人').length === 0, '找不到人就返回空数组');

    const full = createNpcLedger();
    full.apply({ 人物: [{ 姓名: '萧炎', 身份: '少主', 性别: '男', 年龄: '十六', 境界: '斗者' }] }, { floor: 1, day: 1 });
    assert.ok(full.missing('萧炎').length < missing.length);
}

// —— 冷藏推进来源标签：logSrc 逐条盖章，load 重读后不丢 ——
{
    const coldLedger = createNpcLedger();
    coldLedger.apply({ 人物: [{ 姓名: '刀疤武者', 身份: '加列家护卫头目' }] }, { floor: 13, day: 1, source: '正文' });
    coldLedger.apply({ 人物: [{ 姓名: '刀疤武者', 位置: '中街迎宾客栈收货点', 正在做什么: '守点验私货', 流水: ['守在收货点验私货、断来路', '前日打折一名药贩的腿'] }] }, { floor: 19, day: 1, source: '冷藏推进', logSrc: '冷藏' });
    const record = coldLedger.get('刀疤武者');
    assert.equal(record.log[0].src, '冷藏', '冷藏推进的流水逐条带上自行活动标签');
    assert.equal(record.log[1].src, '冷藏', '同一笔补丁里每条流水都有标签');
    assert.equal(record.log[0].floor, 19);
    assert.equal(record.log[0].day, 1);
    assert.equal(record.location, '中街迎宾客栈收货点');
    const reloaded = createNpcLedger();
    reloaded.load([JSON.parse(JSON.stringify(record))]);
    assert.equal(reloaded.get('刀疤武者').log[0].src, '冷藏', '读旧档时标签不能丢');
    // 冷藏推进改的不止流水：动过的字段要盖章在档案上（coldTouch），读旧档不丢。
    assert.ok(Array.isArray(record.coldTouch?.fields), '冷藏推进要在档案上记动过的字段');
    assert.ok(record.coldTouch.fields.includes('所在位置'), '所在位置是被自行活动改过的');
    assert.ok(record.coldTouch.fields.includes('正在做什么'), '正在做什么是被自行活动改过的');
    assert.ok(record.coldTouch.fields.includes('流水'), '流水也算这次动过的内容');
    assert.equal(record.coldTouch.floor, 19);
    assert.equal(record.coldTouch.day, 1);
    assert.equal(reloaded.get('刀疤武者').coldTouch.fields.includes('所在位置'), true, '重读后 coldTouch 不丢');
    // 不带 logSrc 的普通记账不盖 coldTouch，也照旧不打标签。
    coldLedger.apply({ 人物: [{ 姓名: '刀疤武者', 流水: ['又巡了一趟货栈'] }] }, { floor: 20, day: 1 });
    assert.equal(coldLedger.get('刀疤武者').coldTouch.floor, 19, '正文记账不覆盖冷藏盖章');
    assert.equal(coldLedger.get('刀疤武者').log.at(-1).src, undefined, '没传 logSrc 就不盖章');
}

// 情绪层（快变量）：补丁收情绪、TTL = 世界天数 + 3、到期消散、注入行带上。
{
    const ledger = createNpcLedger({ now: () => 'fixed' });
    ledger.apply({ 人物: [{ 姓名: '萧战', 情绪: { 情绪: '恼怒', 理由: '被当众驳了面子' }, 在场: true, 重要: true }] }, { floor: 1, day: 5 });
    const record = ledger.get('萧战');
    assert.equal(record.moods.length, 1);
    assert.equal(record.moods[0].label, '恼怒');
    assert.equal(record.moods[0].reason, '被当众驳了面子');
    assert.equal(record.moods[0].expiresDay, 8, '情绪三天到期：世界天数 + 3');
    assert.ok(ledger.injection().text.includes('此刻：恼怒（被当众驳了面子）'), '注入行要带短期情绪');
    ledger.apply({ 人物: [] }, { floor: 2, day: 8 });
    assert.equal(ledger.get('萧战').moods.length, 1, '到期日当天还在');
    ledger.apply({ 人物: [] }, { floor: 3, day: 9 });
    assert.equal(ledger.get('萧战').moods.length, 0, '过期情绪落账时自动消散');
    assert.equal(ledger.decayMoods(9).status, 'decayed');
    assert.equal(ledger.decayMoods('不是天数').status, 'skipped', '非法天数不动账');
    // 手动清账 API 也要能消散
    const again = createNpcLedger({ now: () => 'fixed' });
    again.apply({ 人物: [{ 姓名: 'B', 情绪: '感激' }] }, { floor: 1, day: 1 });
    assert.equal(again.decayMoods(5).pruned, 1, '手动 decay 清掉过期情绪');
    assert.equal(again.get('B').moods.length, 0);
}

// 情绪归一化：对象里的「理由」不许污染好感理由；数组/字符串都收。
{
    const patch = normalizePatch({ 姓名: 'C', 情绪: { 情绪: '愧疚', 理由: '误会了他' }, 心情: '警惕' });
    assert.equal(patch.moods.length, 2);
    assert.equal(patch.moods[0].label, '愧疚');
    assert.equal(patch.moods[0].reason, '误会了他');
    assert.equal(patch.favorReason, '', '情绪里的「理由」不许串进好感理由');
}

// 依据审计：好感 |Δ|≥5 或写「经历」缺依据 → result.audits；带依据进 favorLog；小变动不审。
{
    const ledger = createNpcLedger({ now: () => 'fixed' });
    const first = ledger.apply({ 人物: [{ 姓名: 'A', 好感: 6 }] }, { floor: 1, day: 2 });
    assert.equal(first.audits.length, 1);
    assert.equal(first.audits[0].kind, 'favor');
    assert.equal(first.audits[0].delta, 6);
    const backed = ledger.apply({ 人物: [{ 姓名: 'A', 好感: 6, 依据: '正文里当众护住族人' }] }, { floor: 2, day: 3 });
    assert.equal(backed.audits.length, 0, '带依据的大变动不记审计');
    assert.equal(ledger.get('A').favorLog.at(-1).basis, '正文里当众护住族人');
    const exp = ledger.apply({ 人物: [{ 姓名: 'A', 经历: '立场易帜，投靠云岚宗' }] }, { floor: 3, day: 4 });
    assert.equal(exp.audits.length, 1, '经历缺依据也要记审计');
    assert.equal(exp.audits[0].kind, 'exp');
    const backedExp = ledger.apply({ 人物: [{ 姓名: 'A', 经历: '再转回萧家', 依据: '正文末段反水' }] }, { floor: 4, day: 5 });
    assert.equal(backedExp.audits.length, 0);
    const small = ledger.apply({ 人物: [{ 姓名: 'A', 好感: 2 }] }, { floor: 5, day: 6 });
    assert.equal(small.audits.length, 0, '小变动不需要依据');
}

// 关系快照：改「对他人」就交 relations 快照；互写：补丁流水提到已建档的人，对方流水也记一笔。
{
    const ledger = createNpcLedger({ now: () => 'fixed' });
    ledger.apply({ 人物: [{ 姓名: '药老', identity: '炼药师' }] }, { floor: 1, day: 1 });
    const result = ledger.apply({ 人物: [{ 姓名: '萧炎', others: [{ who: '药老', relation: '师徒', attitude: '敬重' }] }] }, { floor: 2, day: 2 });
    assert.equal(result.relations.length, 1);
    assert.equal(result.relations[0].from, '萧炎');
    assert.equal(result.relations[0].triples[0].who, '药老');
    assert.equal(result.relations[0].day, 2);
    const cold = ledger.apply({ 人物: [{ 姓名: '药老', 流水: ['在山洞里为萧炎护法'] }] }, { floor: 3, day: 3, logSrc: '冷藏', crossWrite: true });
    assert.equal(cold.crossWritten.length, 1, 'crossWrite 开启时提到别人要互写');
    assert.equal(cold.crossWritten[0].from, '药老');
    assert.equal(cold.crossWritten[0].to, '萧炎');
    const xiaoYan = ledger.get('萧炎');
    assert.equal(xiaoYan.log.at(-1).text, '药老：在山洞里为萧炎护法');
    assert.equal(xiaoYan.log.at(-1).src, '冷藏');
    // 普通正文记账不开互写：记录员本来会给人各写各的补丁，防止重复记。
    const plain = ledger.apply({ 人物: [{ 姓名: '药老', 流水: ['又和萧炎论了一次药'] }] }, { floor: 4, day: 4 });
    assert.equal(plain.crossWritten.length, 0, 'crossWrite 不开启就不互写');
}

// 情绪与互写的存档 round-trip：读旧档不丢。
{
    const ledger = createNpcLedger({ now: () => 'fixed' });
    ledger.apply({ 人物: [{ 姓名: 'B', 情绪: [{ 情绪: '警惕', 理由: '传闻' }] }] }, { floor: 1, day: 2 });
    const saved = JSON.parse(JSON.stringify(ledger.exportAll()));
    const reloaded = createNpcLedger({ now: () => 'fixed' });
    reloaded.load(saved);
    const moods = reloaded.get('B').moods;
    assert.equal(moods.length, 1);
    assert.equal(moods[0].label, '警惕');
    assert.equal(moods[0].expiresDay, 5, '读旧档时到期日不丢');
}

// 分值排序：同档内不再按插入序——刚出过事、好感波动大的人排前。
{
    const ledger = createNpcLedger({ now: () => 'fixed' });
    ledger.apply({ 人物: [{ 姓名: '路人甲', favor: 1, presence: '在场', importance: '重要' }] }, { floor: 10, day: 1 });
    ledger.apply({ 人物: [{ 姓名: '恩人乙', favor: 10, presence: '在场', importance: '重要' }] }, { floor: 9, day: 1 });
    ledger.apply({ 人物: [{ 姓名: '恩人乙', favor: 10 }] }, { floor: 9, day: 2 });
    const injected = ledger.injection({ maxFull: 2 }).text;
    const a = injected.indexOf('【路人甲】');
    const b = injected.indexOf('【恩人乙】');
    assert.ok(a >= 0 && b >= 0, '两个人都要注入');
    assert.ok(b < a, '恩人乙（近期好感波动 20）压过路人甲（只近出场）');
}

// —— B6 撤销快照：restoreSnapshots 把整档原样写回，改名/清空过的人原地跳过 ——
{
    const ledger = createNpcLedger({ now: () => 'fixed' });
    ledger.apply({ 人物: [{ 姓名: '萧战', favor: 2, location: '乌坦城' }] }, { floor: 1, day: 1 });
    const before = ledger.get('萧战');
    ledger.apply({ 人物: [{ 姓名: '萧战', favor: 8, location: '帝都' }] }, { floor: 2, day: 3 });
    const restored = ledger.restoreSnapshots({ 萧战: before });
    assert.deepEqual(restored.restored, ['萧战']);
    const back = ledger.get('萧战');
    assert.equal(back.favor, 2, '好感退回快照值');
    assert.equal(back.location, '乌坦城');
    assert.equal(back.version, before.version, '快照原样写回，版本号不自增');
    const skip = ledger.restoreSnapshots({ 不存在的人: before, 萧战: 'not-an-object' });
    assert.equal(skip.status, 'noop', '命不中或坏快照一律跳过');
}

console.log('npc-ledger 测试通过');
