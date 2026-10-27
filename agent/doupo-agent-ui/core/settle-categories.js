/**
 * 行动结算的判定类别：每一类 = 一套默认提示词（设置页可改）+ 一组脚本复核规则。
 *
 * 流程：interpret 先给行动一个类别（category）和初步 effects → 模型拿着该类别的
 * 提示词独立判一次 → 脚本先过通用筛子（normalizeInterpretation），再过本文件
 * checkEffects 的类别复核，两道都没拦住的效果才进规则裁判算账。
 *
 * 类别贴着默认状态字段写（player.hp/douqi/gold/reputation/realm/location），
 * 加类别 = 在 SETTLE_CATEGORIES 里加一个对象，页面折叠区随之自动多一项。
 */

const REALM_LADDER = Object.freeze(['斗之气', '斗者', '斗师', '大斗师', '斗灵', '斗王', '斗皇', '斗宗', '斗尊', '斗圣', '斗帝']);
const CN_DIGITS = Object.freeze({ 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 });

export const SETTLE_CATEGORIES = Object.freeze([
    {
        id: 'alchemy',
        label: '丹药判定',
        summary: '服用丹药、炼药、药力发作与中毒',
        hint: '默认规则含"只动 hp/douqi/gold、单次增减限幅、丹药不得直接改境界"。',
        prompt: [
            '你是《斗破苍穹》同人文字游戏的丹药判定器，只判定与丹药相关的一轮行动：服用丹药、炼药、药力发作、中毒。',
            '只输出一个 JSON 对象：{"effects":[{"targetId":"…","field":"…","type":"set|add|remove","value":数值,"allowNegative":false,"reason":"依据"}],"outcome":"判定结果一句话"}。不要输出解释、标题或代码块以外的文字。',
            'effects 只允许写 player.hp、player.douqi、player.gold，且一律用 add 增减：hp/douqi 单次增减不超过 300，gold 单次增减不超过 1000；负向变化（药毒、花销）要带 allowNegative:true。',
            '丹药不得直接改写境界（realm），突破只能由修炼判定完成；也不写 location/reputation。',
            '幅度要和丹药品阶挂钩：普通回气丹恢复斗气 10~30，疗伤药恢复 hp 20~50，越高级幅度越大但必须在 reason 里写清药名与来历；玩家没有该丹药时只写花销或不写，并在 outcome 里说明。',
            '没有需要记下的变化就输出 {"effects":[],"outcome":"丹药判定：本轮无可记变化"}，绝不为凑数而编效果。',
        ].join('\n'),
    },
    {
        id: 'cultivation',
        label: '修炼判定',
        summary: '修炼吸纳、斗气增减、冲击境界与突破',
        hint: '默认规则含"境界阶梯：同境界≤3星、突破须九段/九星圆满、禁止跳级"。',
        prompt: [
            '你是《斗破苍穹》同人文字游戏的修炼判定器，只判定修炼吸纳、斗气涨落、冲击境界这一类行动。',
            '只输出一个 JSON 对象：{"effects":[…],"outcome":"…"}（字段结构：targetId/field/type/value/allowNegative/reason）。不要输出解释、标题或代码块以外的文字。',
            'effects 只允许写 player.douqi（add，单次增减不超过 100）和 player.realm（set，整体设定为新境界写法，如"斗之气四段"）。',
            '境界阶梯：斗之气一至九段；其后斗者、斗师、大斗师、斗灵、斗王、斗皇、斗宗、斗尊、斗圣、斗帝各一至九星。同一境界一次至多推进三星；突破大境界只允许从九段/九星圆满出发；跳过大境界一律不写。',
            'douqi 不足、没有修炼过程描写或剧情依据不足时，不写突破：只给少量斗气增长或不写，并在 outcome 里说明差在哪。',
            '没有需要记下的变化就输出 {"effects":[],"outcome":"修炼判定：本轮无可记变化"}。',
        ].join('\n'),
    },
    {
        id: 'combat',
        label: '伤害判定',
        summary: '战斗、斗技、比试的攻防与消耗',
        hint: '默认规则含"hp 只减不增、单次伤害≤500、斗技消耗≤200、越级对抗幅度从高"。',
        prompt: [
            '你是《斗破苍穹》同人文字游戏的伤害判定器，只判定战斗、斗技、比试这一轮的攻防结果。',
            '只输出一个 JSON 对象：{"effects":[…],"outcome":"…"}（字段结构：targetId/field/type/value/allowNegative/reason）。不要输出解释、标题或代码块以外的文字。',
            'effects 只允许写 player.hp、player.douqi、player.reputation，且一律用 add 增减：受创写 hp 的负向 add（带 allowNegative:true），单次伤害不超过 500；斗技消耗写 douqi 的负向 add，单次不超过 200；名声变化单次不超过 50。',
            '战斗中 hp 与 douqi 只减不增：回血、回气归丹药判定，不要在这里写正向恢复。',
            '幅度要和双方境界差距、斗技品阶挂钩：越级挑战伤害从高、消耗从高，被碾压时伤害也从高；没有实际交手描写就不写伤害，只在 outcome 里说明。',
            '战斗中不写境界变化（realm），突破归修炼判定；只有当众胜负、立威扬名时才写 reputation。',
            '没有需要记下的变化就输出 {"effects":[],"outcome":"伤害判定：本轮无可记变化"}。',
        ].join('\n'),
    },
    {
        id: 'general',
        label: '通用判定',
        summary: '赶路、购物、打听、交际等其余行动',
        hint: '默认规则含"只动 gold/reputation/location，hp/douqi/realm 一律不写"。',
        prompt: [
            '你是《斗破苍穹》同人文字游戏的通用行动判定器，判定不涉及丹药、修炼、战斗的行动：赶路、购物、打听、交际、探索等。',
            '只输出一个 JSON 对象：{"effects":[…],"outcome":"…"}（字段结构：targetId/field/type/value/allowNegative/reason）。不要输出解释、标题或代码块以外的文字。',
            'effects 只允许写 player.gold（add，单次增减不超过 1000）、player.reputation（add，单次不超过 50，有明确扬名或结怨依据才写）、player.location（set，只写实际抵达的地点）。',
            '不写 hp、douqi、realm：体力斗气恢复归丹药与修炼判定，境界归修炼判定。',
            '没有需要记下的变化就输出 {"effects":[],"outcome":"通用判定：本轮无可记变化"}，绝不为凑数而编效果。',
        ].join('\n'),
    },
]);

const CATEGORY_MAP = new Map(SETTLE_CATEGORIES.map(category => [category.id, category]));

/** 类别 id → 类别对象；不认识返回 null。 */
export function resolveCategory(id) {
    return typeof id === 'string' ? CATEGORY_MAP.get(id.trim()) ?? null : null;
}

/** 境界写法解析：'斗之气三段' → { realm: 0, sub: 3 }；认不出返回 null。从后往前匹配，保证'大斗师'不被当成'斗师'。 */
export function parseRealm(text) {
    const raw = String(text ?? '').trim();
    if (!raw) return null;
    for (let index = REALM_LADDER.length - 1; index >= 0; index -= 1) {
        const name = REALM_LADDER[index];
        if (!raw.includes(name)) continue;
        const matched = raw.match(/[0-9]+|[一二三四五六七八九]/);
        if (!matched) return null;
        const body = matched[0];
        const sub = /^[0-9]+$/.test(body) ? Number(body) : CN_DIGITS[body];
        if (!Number.isInteger(sub) || sub < 1 || sub > 9) return null;
        return { realm: index, sub };
    }
    return null;
}

/** 修炼判定的境界推进校验：ok 为 false 时 reason 说明为什么不行。 */
export function realmStep(from, to) {
    const fromParsed = parseRealm(from);
    const toParsed = parseRealm(to);
    if (!fromParsed || !toParsed) return { ok: false, reason: '无法识别境界写法（需形如"斗之气三段""斗者二星"）' };
    if (toParsed.realm < fromParsed.realm) return { ok: false, reason: '境界不能倒退' };
    if (toParsed.realm === fromParsed.realm) {
        const delta = toParsed.sub - fromParsed.sub;
        if (delta < 0) return { ok: false, reason: '境界不能倒退' };
        if (delta > 3) return { ok: false, reason: '同境界一次至多推进三星' };
        return { ok: true };
    }
    if (toParsed.realm > fromParsed.realm + 1) return { ok: false, reason: '不允许跳越大境界' };
    if (fromParsed.sub < 9) return { ok: false, reason: '突破大境界需当前境界九段/九星圆满' };
    return { ok: true };
}

function numeric(effect) {
    const value = Number(effect?.value);
    return Number.isFinite(value) ? value : null;
}

function key(effect) {
    return `${effect?.targetId ?? ''}.${effect?.field ?? ''}`;
}

const ALCHEMY_FIELDS = { 'player.hp': 300, 'player.douqi': 300, 'player.gold': 1000 };
const COMBAT_FIELDS = { 'player.hp': 500, 'player.douqi': 200, 'player.reputation': 50 };

const CHECKS = {
    alchemy(effect) {
        const limit = ALCHEMY_FIELDS[key(effect)];
        if (!limit) return key(effect) === 'player.realm' ? '丹药不能直接改境界，突破归修炼判定' : `丹药判定不改写 ${key(effect)}`;
        if (effect.type !== 'add') return '丹药判定只按增减（add）写入，不直接设定';
        const value = numeric(effect);
        if (value === null) return '增减必须是数字';
        if (Math.abs(value) > limit) return `单次增减不超过 ${limit}`;
        return null;
    },
    cultivation(effect, state) {
        const field = key(effect);
        if (field === 'player.douqi') {
            if (effect.type !== 'add') return '修炼判定只按增减（add）写入 douqi';
            const value = numeric(effect);
            if (value === null) return 'douqi 增减必须是数字';
            if (Math.abs(value) > 100) return '修炼判定单次增减不超过 100';
            return null;
        }
        if (field === 'player.realm') {
            if (effect.type !== 'set') return '境界只能整体设定（set）';
            const from = state?.player?.realm ?? '斗之气三段';
            const step = realmStep(from, effect.value);
            return step.ok ? null : step.reason;
        }
        return `修炼判定不改写 ${field}`;
    },
    combat(effect) {
        const field = key(effect);
        const limit = COMBAT_FIELDS[field];
        if (!limit) return field === 'player.realm' ? '战斗中不写境界变化，突破归修炼判定' : `伤害判定不改写 ${field}`;
        if (effect.type !== 'add') return '伤害判定只按增减（add）写入';
        const value = numeric(effect);
        if (value === null) return '增减必须是数字';
        if (field !== 'player.reputation' && value > 0) return '战斗中 hp/douqi 只减不增，恢复归丹药判定';
        if (Math.abs(value) > limit) return `单次${field === 'player.hp' ? '伤害' : '变化'}不超过 ${limit}`;
        return null;
    },
    general(effect) {
        const field = key(effect);
        if (field === 'player.gold' || field === 'player.reputation') {
            if (effect.type !== 'add') return `${field === 'player.gold' ? 'gold' : 'reputation'} 只按增减（add）写入`;
            const value = numeric(effect);
            if (value === null) return '增减必须是数字';
            if (Math.abs(value) > (field === 'player.gold' ? 1000 : 50)) return '单次增减超限';
            return null;
        }
        if (field === 'player.location') {
            if (effect.type !== 'set') return '所在地只能整体设定（set）';
            if (String(effect.value ?? '').trim().length > 30) return '地点写法不超过 30 字';
            return null;
        }
        return `通用判定不改写 ${field}（hp/douqi 归丹药与修炼判定，realm 归修炼判定）`;
    },
};

/** 类别复核：逐条检查 effects，通过的留下，不通过的带原因丢弃；未识别类别不设限（保持旧行为）。 */
export function checkEffects(categoryId, effects, state = {}) {
    const category = resolveCategory(categoryId);
    const list = Array.isArray(effects) ? effects : [];
    if (!category) return { effects: list, rejected: [] };
    const kept = [];
    const rejected = [];
    list.forEach((effect, index) => {
        const reason = category.check ? category.check(effect, state) : null;
        if (reason) rejected.push({ index, reason });
        else kept.push(effect);
    });
    return { effects: kept, rejected };
}

// 给每个类别挂上对应的复核函数（保持 SETTLE_CATEGORIES 可被结构化展示）。
const CHECK_BY_ID = new Map(Object.entries(CHECKS));
for (const category of SETTLE_CATEGORIES) {
    Object.defineProperty(category, 'check', { value: CHECK_BY_ID.get(category.id), enumerable: false });
}
