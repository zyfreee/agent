import assert from 'node:assert/strict';
import { createNpcLedger, favorLabel, normalizePatch, normalizeRecord, NPC_FIELDS, FAVOR_MIN, FAVOR_MAX, FAVOR_STEP_MAX, recentExpLines } from './npc-ledger.js';

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

// 2) 好感只记增减、单次最多 ±15：模型写 +95 也只记 +15；理由不截断（用户口径 2026-11-17）。
{
    const ledger = createNpcLedger();
    ledger.apply({ 人物: [{ 姓名: '萧炎', 好感: '+95', 理由: '救下萧家满门上下老小' }] }, { floor: 5, day: 2 });
    assert.equal(ledger.get('萧炎').favor, FAVOR_STEP_MAX, '单次超过 ±15 要压回 ±15');
    assert.equal(ledger.get('萧炎').favorLog[0].delta, FAVOR_STEP_MAX);
    assert.equal(ledger.get('萧炎').favorLog[0].reason, '救下萧家满门上下老小', '长理由原样保留');

    for (let round = 0; round < 12; round += 1) {
        ledger.apply({ 人物: [{ 姓名: '萧炎', 好感: 10, 理由: '又帮一次' }] }, { floor: 6 + round, day: 2 });
    }
    assert.equal(ledger.get('萧炎').favor, FAVOR_MAX, '累计到上限要停在 100，不能溢出');
    assert.equal(favorLabel(FAVOR_MAX), '生死之交');
    assert.ok(ledger.get('萧炎').favorLog.every(entry => Math.abs(entry.delta) <= FAVOR_STEP_MAX), '每条流水都不能超过 ±15');

    ledger.apply({ 人物: [{ 姓名: '萧炎', 好感: '-200', 理由: '翻脸' }] }, { floor: 30, day: 2 });
    assert.equal(ledger.get('萧炎').favorLog.at(-1).delta, -FAVOR_STEP_MAX, '负向也压到 -15');
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

// OPT-059（2026-11-19 口径）：简档不再压缩、不填预算＝全量完整档案；填了预算才整条让位，绝不拦腰截断。
{
    const ledger = createNpcLedger();
    ledger.apply({ 人物: ['A', 'B'].map(name => ({ name, identity: '身'.repeat(200), presence: '在场', importance: '重要' })) });
    const view = ledger.injection();
    assert.deepEqual(view.used.sort(), ['A', 'B']);
    assert.deepEqual(view.degraded, []);
    assert.deepEqual(view.omitted, []);
    assert.equal(view.counts.full, 2); assert.equal(view.counts.brief, 0);
    for (const name of view.used) assert.match(view.text, new RegExp(name));
    assert.ok(view.text.includes('身'.repeat(200)), '长身份字段原样进注入');
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

// 注入三参数默认不限制（schemaVersion 15 口径）：不传 budget/maxFull/maxBrief 时该注入的人全量进提示词，
// 不再有 900/6/14 的隐式截流；显式传 Infinity 同效，0/留空在设置层已换算成 Infinity，填正数才截流。
{
    const ledger = createNpcLedger();
    const people = [];
    for (let index = 0; index < 9; index += 1) {
        people.push({ 姓名: `弟子${index}`, 身份: '门中弟子', 在场: '在场', 重要: '重要', 正在做什么: '在大殿里候着，等宗主发话' });
    }
    ledger.apply({ 人物: people }, { floor: 3 });
    const unlimited = ledger.injection();
    assert.equal(unlimited.counts.full, 9, '默认不传上限：在场×重要全给全字段');
    assert.equal(unlimited.degraded.length, 0);
    assert.equal(unlimited.omitted.length, 0);
    assert.equal(unlimited.truncated, false);
    assert.equal(unlimited.chars, unlimited.text.length);
    const explicitInfinity = ledger.injection({ budget: Infinity, maxFull: Infinity, maxBrief: Infinity });
    assert.equal(explicitInfinity.chars, unlimited.chars, '显式 Infinity 与默认同效');
    assert.deepEqual(explicitInfinity.used, unlimited.used);
    const capped = ledger.injection({ budget: 400 });
    assert.ok(capped.degraded.length > 0 || capped.omitted.length > 0, '填了正数才按数截流');
    assert.ok(capped.chars < unlimited.chars);
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
    assert.equal(reloaded.get('萧薰儿').favor, 12, '相对 +12 落在 ±15 闸内，原样记');
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

// —— 删楼自愈：基线与楼层戳指向已不存在的楼时全部作废，档案内容原样保留 ——
{
    const ledger = createNpcLedger({ now: () => 'fixed' });
    ledger.apply({ 人物: [{ 姓名: '掌柜', favor: 1, 流水: ['收摊'] }, { 姓名: '工头', favor: 1 }] }, { floor: 62, day: 9 });
    ledger.apply({ 人物: [{ 姓名: '药老', favor: 1 }] }, { floor: 39, day: 9 });
    // 旧聊天（65+ 楼）在 63 楼成功记过一次账，留下回写基线；然后聊天被删到只剩 43 楼
    const recorded = ledger.recordReply({ 人物: [{ 姓名: '掌柜', favor: 2 }] }, { floor: 63, day: 12 });
    assert.equal(recorded.status, 'applied');
    // 没删楼时（63 ≤ 63）不动任何东西
    const intact = ledger.dropStaleFloors(63);
    assert.deepEqual(intact, { dropped: false, floor: null, cleared: 0 });
    // 删到 42 楼封顶：基线（63）作废，掌柜与工头的过期楼层戳（62）清掉，药老（39 ≤ 42）保留
    const healed = ledger.dropStaleFloors(42);
    assert.equal(healed.dropped, true, '回写基线作废');
    assert.equal(healed.floor, 63);
    assert.equal(healed.cleared, 2, '掌柜与工头的过期楼层标记清掉');
    assert.equal(ledger.get('工头').lastFloor, null);
    assert.equal(ledger.get('工头').firstFloor, null, '建档楼层同样过期，一并清掉（否则 normalize 会复活）');
    assert.equal(ledger.get('药老').lastFloor, 39, '没过期的楼层戳不动');
    assert.equal(ledger.get('掌柜').favor, 3, '档案内容原样保留（1 + 63 楼记的 +2）');
    // 基线没了之后，新楼可以直接落账（不再被 reply_baseline_missing 拦）
    const freshRecord = ledger.recordReply({ 人物: [{ 姓名: '掌柜', favor: 1 }] }, { floor: 42, day: 15 });
    assert.equal(freshRecord.status, 'applied', '过期基线作废后新账可落');
    // 幂等：再清一遍没有变化
    assert.deepEqual(ledger.dropStaleFloors(42), { dropped: false, floor: null, cleared: 0 });
    // 非法入参原样返回
    assert.deepEqual(ledger.dropStaleFloors(-1), { dropped: false, floor: null, cleared: 0 });
}

// —— 序列化残渣防线：模型把整组人物对象误写进「别名」（名册误写）时，对象条目整条拒收；
//    text() 会把对象摊成「name：…；age：…」的长串，进了别名既污染档案，还会被 findKey
//    拿去做人物匹配（把别人认成本人）。已入库的残渣串在读档/再保存时一并洗掉（自愈）。——
{
    const ledger = createNpcLedger({ now: () => 'fixed' });
    const dump1 = 'name：灵灵；age：12岁；identity：雪魔的妹妹；clothes：0：name：浅蓝色连帽卫衣；part：上';
    const dump2 = 'name：萧炎；gender：男；origin：萧家；identity：萧家族长；realm：五星大斗师；favor：16；attitud';
    ledger.apply({ name: '雅妃', 别名: [{ 姓名: '灵灵', age: '12岁' }, dump1, dump2, '云韵', '雅姐'] }, { source: '手填', floor: 5 });
    assert.deepEqual(ledger.get('雅妃').aliases, ['云韵', '雅姐'], '对象条目与序列化残渣串都不进别名，正常别名保留');
    // 手填再保存同款残渣串（编辑表单回填后原样存回）也被洗掉
    ledger.setFields('雅妃', { aliases: [dump1, dump2, '云韵'] }, { source: '手填' });
    assert.deepEqual(ledger.get('雅妃').aliases, ['云韵'], 'setFields 同样拒收序列化残渣');
}
{
    // 读档自愈：朋友存档里已入库的残渣串，换聊天 load 时洗掉，好感等其余字段原样保留。
    const ledger = createNpcLedger({ now: () => 'fixed' });
    const dump = 'name：灵灵；age：12岁；identity：雪魔的妹妹；clothes：0：name：浅蓝色连帽卫衣；part：上';
    ledger.load({ records: [{ 姓名: '雅妃', aliases: [dump, '云韵'], favor: 16, identity: '米特尔拍卖场首席拍卖师' }] });
    assert.deepEqual(ledger.get('雅妃').aliases, ['云韵'], 'load 时把已入库的序列化残渣洗掉');
    assert.equal(ledger.get('雅妃').favor, 16);
    assert.equal(ledger.get('雅妃').identity, '米特尔拍卖场首席拍卖师');
    // 单个英文键写法不误伤（阈值 ≥2）
    const ledger2 = createNpcLedger({ now: () => 'fixed' });
    ledger2.load({ records: [{ 姓名: '药老', aliases: ['药尘', '炎帝：萧炎的老师'] }] });
    assert.deepEqual(ledger2.get('药老').aliases, ['药尘', '炎帝：萧炎的老师'], '单个英文键写法不误伤');
}
{
    // 名册对象整体塞进「别名」（对象而非数组）也被拒收，不再产出 [object Object]
    const ledger = createNpcLedger({ now: () => 'fixed' });
    ledger.apply({ name: '雅妃', 别名: { 灵灵: { age: '12岁' }, 萧薰儿: { age: '十五岁' } } }, { source: '手填' });
    assert.deepEqual(ledger.get('雅妃').aliases, [], '对象整体不序列化进别名');
}

console.log('npc-ledger 测试通过');

// —— 往来概要：随补丁落账、注入替代近事、restore 往返不丢 ——
{
    const ledger = createNpcLedger({ now: () => 'fixed' });
    ledger.apply({ name: 'B', identity: '药铺掌柜', presence: '在场', importance: '重要', log: ['卖了凝血散'], 往来概要: '连着三天和玩家做药材生意，开始留意这个少年' });
    const record = ledger.exportAll().records.find(item => item.name === 'B');
    assert.equal(record.logSummary, '连着三天和玩家做药材生意，开始留意这个少年');
    const injected = ledger.injection({ maxFull: 5, maxBrief: 5 }).text;
    assert.ok(injected.includes('往来：连着三天和玩家做药材生意'), '有概要时注入往来概要');
    assert.ok(!injected.includes('近事：'), '概要在场时近事被替代');
    const saved = JSON.parse(JSON.stringify(ledger.exportAll()));
    const reloaded = createNpcLedger({ now: () => 'fixed' });
    reloaded.load(saved);
    assert.equal(reloaded.exportAll().records.find(item => item.name === 'B').logSummary, '连着三天和玩家做药材生意，开始留意这个少年', 'restore 往返不丢概要');
}
{
    const ledger = createNpcLedger({ now: () => 'fixed' });
    ledger.apply({ name: 'C', identity: '守门人', presence: '在场', importance: '重要', log: ['登记了来意'] });
    const injected = ledger.injection({ maxFull: 5, maxBrief: 5 }).text;
    assert.ok(injected.includes('近事：登记了来意'), '没有概要时回退近事');
}
// —— 近事只带最近 3 条并带天数戳：流水只增不减，全量倒进提示词长聊必炸；不带天数模型分不清先后 ——
{
    const ledger = createNpcLedger({ now: () => 'fixed' });
    ledger.apply({ name: 'D', identity: '药铺伙计', presence: '在场', importance: '重要', log: ['第一天上门问价'] }, { day: 1, floor: 1 });
    ledger.apply({ name: 'D', log: ['第二天的争吵'] }, { day: 2, floor: 2 });
    ledger.apply({ name: 'D', log: ['第三天的和解'] }, { day: 3, floor: 3 });
    ledger.apply({ name: 'D', log: ['第四天又翻了脸'] }, { day: 4, floor: 4 });
    ledger.apply({ name: 'D', log: ['第五天上门赔罪'] }, { day: 5, floor: 5 });
    const injected = ledger.injection({ maxFull: 5, maxBrief: 5 }).text;
    assert.ok(!injected.includes('第一天上门问价'), '近事只带最近 3 条，最旧的要截掉');
    assert.ok(!injected.includes('第二天的争吵'), '最近 3 条以外的同样截掉');
    assert.ok(injected.includes('第3天第三天的和解'), '留下的近事要带天数戳');
    assert.ok(injected.includes('第5天第五天上门赔罪'), '最新一条在列');
}

// 世界影响的回响：记录员把「影响#i12」写进「世界影响」键，以前这个键不在别名表里，
// 会被 normalizePatch 当未知键丢掉（打断链）；现在要能落成 impactRefs，且只追加不重复。
{
    const ledger = createNpcLedger({ now: () => 'fixed' });
    const first = ledger.apply({ name: '萧炎', '世界影响': '影响#i12', log: ['被点了名'] }, { day: 7, floor: 5 });
    assert.equal(first.status, 'applied');
    assert.deepEqual(first.ignored, [], '「世界影响」不能再被当未知键丢掉');
    const record = ledger.get('萧炎');
    assert.ok(Array.isArray(record.impactRefs), '档案要存 impactRefs');
    assert.deepEqual(record.impactRefs, [{ id: 'i12', day: 7, floor: 5 }]);
    // 第二轮：旧编号不重复记，新编号追加。
    ledger.apply({ name: '萧炎', '世界影响': ['影响 i12', 'i13'] }, { day: 9 });
    const after = ledger.get('萧炎').impactRefs;
    assert.equal(after.length, 2, `同一编号不能记两遍：${JSON.stringify(after)}`);
    assert.deepEqual(after.map(item => item.id), ['i12', 'i13']);
    assert.equal(after[1].day, 9, '没写当天的编号用补丁那天补上');
    // 存档往返不能把痕迹洗掉：normalizeRecord 之后 fingerprint 必须仍然一致。
    const snapshot = JSON.parse(JSON.stringify(ledger.exportAll()));
    const back = createNpcLedger({ now: () => 'fixed' });
    back.load(snapshot);
    assert.deepEqual(back.get('萧炎').impactRefs.map(item => item.id), ['i12', 'i13'], '读档后回响还在');
    // 旧存档里没有这个键的人，读档时不能凭空多出空数组，否则 fingerprint 对不上整本会被拒。
    const legacy = normalizeRecord({ name: '路人乙', log: ['路过'] });
    assert.equal('impactRefs' in legacy, false, '没有痕迹的旧档不写这个键');
    const legacyBook = { records: [{ name: '路人乙', log: ['路过'] }], changes: 0, lastChange: null };
    const legacyLedger = createNpcLedger({ now: () => 'fixed' });
    assert.doesNotThrow(() => legacyLedger.load(JSON.parse(JSON.stringify(legacyBook))), '没有 impactRefs 的旧存档要能读进来');
    assert.deepEqual(legacyLedger.get('路人乙').log.map(item => item.text), ['路过']);
}

// —— 动向盖章与出口把关（“20楼打坐、40楼被囚”根治）——
// 处境写入盖楼层+天章；注入时章旧于最后经历＝旧动向绝迹，近况顶上。
{
    const ledger = createNpcLedger({ now: () => 'fixed' });
    // 第20楼：坊市打坐（处境落账＝盖章）
    ledger.apply({ 人物: [{ 姓名: '青袍客', 位置: '坊市', 正在做什么: '打坐调息', 在场: '在场', 重要: '重要' }] }, { floor: 20, day: 10 });
    assert.deepEqual(ledger.get('青袍客').situationStamp, { floor: 20, day: 10 }, '处境字段写入要盖楼层+天章');
    // 第21楼：只改态度——不盖新章
    ledger.apply({ 人物: [{ 姓名: '青袍客', 态度: '多了几分忌惮' }] }, { floor: 21, day: 11 });
    assert.equal(ledger.get('青袍客').situationStamp.floor, 20, '非处境字段不盖新章');
    // 第40楼：经历写被囚禁，但没动处境字段
    ledger.apply({ 人物: [{ 姓名: '青袍客', 经历: '在坊市北巷被云岚宗执法队锁拿，押入地牢' }] }, { floor: 40, day: 25 });
    // 第41楼：注入——旧动向与旧位置绝迹（此人还在场，走全档：处境只留在场与否，经历行兜底真相）
    const view = ledger.injection({ budget: 4000 });
    assert.equal(view.text.includes('打坐'), false, '经历比章新：旧动向不许再吐给正文');
    assert.equal(view.text.includes('处境：在坊市'), false, '旧位置不随处境行吐出');
    assert.ok(view.text.includes('处境：在场'), '过时全档处境只留在场与否');
    assert.ok(view.text.includes('经历：第25天在坊市北巷被云岚宗执法队锁拿'), '全档经历行兜底真相');
    // 冷藏推进/记录员守规矩的正面情形：经历与处境同楼落账 → 章不旧于经历，新动向照常吐
    ledger.apply({ 人物: [{ 姓名: '青袍客', 位置: '云岚宗地牢', 正在做什么: '拖着锁链清扫牢房', 在场: '不在场', 经历: '被云岚宗正式收押' }] }, { floor: 41, day: 26 });
    const fresh = ledger.injection({ budget: 4000 });
    assert.ok(fresh.text.includes('拖着锁链清扫牢房'), '章与经历同楼：新动向照常注入');
    assert.ok(fresh.text.includes('在云岚宗地牢'), '新位置照常注入');
}
{
    // 全档（在场×重要）同样过出口：过时处境只留在场与否，经历行兜底真相
    const ledger = createNpcLedger({ now: () => 'fixed' });
    ledger.apply({ 人物: [{ 姓名: '打坐人', 位置: '静室', 正在做什么: '打坐', 在场: '在场', 重要: '重要' }] }, { floor: 10, day: 5 });
    ledger.apply({ 人物: [{ 姓名: '打坐人', 经历: '走火入魔，昏迷被人抬走' }] }, { floor: 30, day: 20 });
    const view = ledger.injection({ budget: 4000 });
    assert.ok(view.text.includes('【打坐人】'), '全档给在场重要人物');
    assert.ok(view.text.includes('处境：在场'), '过时全档处境只留在场与否');
    assert.equal(view.text.includes('正在打坐'), false, '全档同样不吐旧动向');
    assert.equal(view.text.includes('在静室'), false, '全档同样不吐旧位置');
    assert.ok(view.text.includes('走火入魔'), '经历行兜底真相');
}
{
    // 旧档没有章但有经历：保守当过时；面板手填动向带上当前楼层 → 盖章认新鲜
    const ledger = createNpcLedger({ now: () => 'fixed' });
    ledger.apply({ 人物: [{ 姓名: '老档人', 位置: '乌坦城', 正在做什么: '打坐', 重要: '重要', 经历: '远走他乡' }] }, { floor: 5, day: 3 });
    const snapshot = JSON.parse(JSON.stringify(ledger.exportAll()));
    for (const record of snapshot.records) delete record.situationStamp;
    const restored = createNpcLedger({ now: () => 'fixed' });
    restored.load(snapshot);
    let view = restored.injection({ budget: 4000 });
    assert.equal(view.text.includes('打坐'), false, '旧档无章但有经历：保守当过时，旧动向不吐');
    assert.ok(view.text.includes('近况：第3天远走他乡'), '近况顶上');
    restored.setFields('老档人', { doing: '在集市替人看摊' }, { floor: 50, day: 30 });
    view = restored.injection({ budget: 4000 });
    assert.ok(view.text.includes('在集市替人看摊'), '手填动向盖章后按新鲜注入');
}
{
    // 楼层缺失时退回天数比较：章的日子旧于经历日子＝过时，新章救回来
    const ledger = createNpcLedger({ now: () => 'fixed' });
    ledger.apply({ 人物: [{ 姓名: '比天者', 正在做什么: '闭关', 重要: '重要' }] }, { floor: null, day: 31 });
    ledger.apply({ 人物: [{ 姓名: '比天者', 经历: '闭关中被仇家寻上门' }] }, { floor: null, day: 32 });
    let view = ledger.injection({ budget: 4000 });
    assert.equal(view.text.includes('正在闭关'), false, '天数比较：经历日子更新＝旧动向不吐');
    assert.ok(view.text.includes('近况：第32天闭关中被仇家寻上门'), '近况顶上');
    ledger.apply({ 人物: [{ 姓名: '比天者', 正在做什么: '疗伤' }] }, { floor: null, day: 33 });
    view = ledger.injection({ budget: 4000 });
    assert.ok(view.text.includes('疗伤'), '新章救回：动向按新鲜注入');
    // 单行档（不重要的人）同样把关：过时丢动向补近况
    const lineLedger = createNpcLedger({ now: () => 'fixed' });
    lineLedger.apply({ 人物: [{ 姓名: '龙套甲', 正在做什么: '打铁', 在场: '在场' }] }, { floor: 2, day: 1 });
    lineLedger.apply({ 人物: [{ 姓名: '龙套甲', 经历: '被逐出铁铺' }] }, { floor: 3, day: 2 });
    const lineView = lineLedger.injection({ budget: 4000 });
    assert.equal(lineView.text.includes('打铁'), false, '单行档旧动向不吐');
    assert.ok(lineView.text.includes('近况：第2天被逐出铁铺'), '单行档过时补近况');
}
{
    // recentExpLines：条数与超长裁短（记录员/体检材料共用的这一个出口）
    const record = { exp: [{ day: 1, text: '一'.repeat(80) }, { day: 2, text: '二'.repeat(80) }, { day: 3, text: '三'.repeat(80) }] };
    const lines = recentExpLines(record, { count: 2 });
    assert.equal(lines.length, 2);
    assert.ok(lines[0].startsWith('第2天'), '取最近两条');
    assert.ok(lines.every(line => line.length <= 51), '每条裁到 50 字加省略号');
}
