/**
 * 纳戒指令通道：把主角自身状态拼成给模型看的注入文本，并从模型回复里
 * 取出 ```self 代码块解析成受控操作。
 *
 * 约定：模型每轮最多输出一个代码块，块内每行一条 JSON 操作；
 * 脚本逐行解析，坏行跳过并记录，好行交给 self-runtime 校验执行。
 */


// —— 模型输出的字段字数上限（用户口径 2026-11-17：API 输出要有限制，手动输入不设限）。
// 只在解析层（parseOps / parseSelfDecision）生效；运行时与手动面板不截断。
const MODEL_TEXT_CAPS = Object.freeze({
    name: 30, grade: 16, type: 12, craft: 12, progress: 16, source: 60,
    note: 120, effect: 160, materials: 160, category: 12,
    title: 20, text: 80, due: 20, realm: 12, stage: 12, field: 12, reason: 60, result: 12,
});
const MODEL_PROFILE_TEXT_CAP = 60;
const MODEL_APPEARANCE_CAP = 160;
const MODEL_ATTRIBUTE_CAP = 12;
export const SELF_MODEL_OPS_MAX = 200;

/** 模型输出的单条操作：逐字段按上限截断（超长裁短而不是整条作废）。 */
export function capSelfOp(op) {
    if (!op || typeof op !== 'object' || Array.isArray(op)) return op;
    const capped = { ...op };
    for (const [field, cap] of Object.entries(MODEL_TEXT_CAPS)) {
        if (typeof capped[field] === 'string') capped[field] = capped[field].trim().slice(0, cap);
    }
    if (capped.field === 'appearance') capped.text = String(capped.text ?? '').slice(0, MODEL_APPEARANCE_CAP);
    else if (capped.field === 'attribute') capped.text = String(capped.text ?? '').slice(0, MODEL_ATTRIBUTE_CAP);
    else if (typeof capped.text === 'string') capped.text = capped.text.slice(0, MODEL_PROFILE_TEXT_CAP);
    return capped;
}

const FENCE_RE = /```self[^\S\n]*\n([\s\S]*?)```/g;
const OP_LINE_RE = /^[ \t]*\{[ \t]*"op"[ \t]*:/;

export const SELF_HEADER = '【主角纳戒】以下是主角此刻的自身状态与随身之物，正文必须与之保持一致；改变它们只能靠剧情里的真实行动。';

export const SELF_GUIDE = [
    '【纳戒指令通道】若本轮剧情让主角自身发生了需要记下的变化（突破境界、获得/失去功法斗技、物品进出、炼药进度、金币收支、身份信息更新、目标变化），在回复的最末尾输出一个 self 代码块，每行一条 JSON：',
    '```self',
    '{"op":"setRealm","realm":"斗者","stage":"三星"}',
    '{"op":"addSkill","name":"吸掌","grade":"玄阶低级","type":"攻击","source":"药老口传","note":"药老随手传的入门斗技","effect":"贴身爆发，一丈内隔空摄物伤人"}',
    '{"op":"addItem","name":"回气丹","category":"丹药","grade":"一品","count":3,"source":"坊市药铺购得","note":"瓷瓶装，色泽温润","effect":"服用后缓缓恢复斗气"}',
    '```',
    '可用操作：setProfile(field:name|gender|age|race|origin|affiliation|talent|appearance,text≤60字，attribute≤12字)；setRealm(realm≤12字,stage≤12字，如 斗者+三星)；setGold(amount≥0)/addGold(amount，可为负)；addTitle/removeTitle(text≤16字)；addTechnique/addSkill(name,grade,type,progress,source,note,effect)；updateTechnique/updateSkill(id,…字段)；removeTechnique/removeSkill(id)；addEquipment(name,grade,type,source,note,effect)/updateEquipment(id,…字段)/removeEquipment(id)；addTreasure(name,grade,type,source,note,effect)/updateTreasure(id,…字段)/removeTreasure(id)；addItem(name,category,grade,count,note,effect)/updateItem(id,count,grade,note,effect)/removeItem(id,count)；addRecipe(name,craft,grade,materials,note,effect)/removeRecipe(id)；startCraft(name,craft,days,note)/finishCraft(id,result:success|fail,note)；addGoal(title必写≤20字短标题,text≤80字完整内容,priority:主线|支线,due)/finishGoal(id)/removeGoal(id)。目标 title 只写短标题，完整内容放 text，两者不要重复；缺 title 的条目会被脚本整条拒绝。id 只能用纳戒清单里已有的编号。',
    '记账规则：只记主角自己身上的变化，有据可依（从最近剧情里长出来），不要照搬原著桥段；境界突破必须剧情真到位，不轻易写；获得功法斗技、丹药、装备要有来源。穿在身上的装备用 addEquipment 记进装备栏（type：武器|防具|饰品|其他），脱下、损毁或被夺用 removeEquipment，行囊只放没在用的东西；天材地宝（异火、妖丹、灵矿、先天灵物之类）用 addTreasure 单独记进天材地宝栏（type：异火|灵物|矿石|其他），易主或耗尽用 removeTreasure；炼制成功后要用 addItem 把成品记进行囊（成品是穿的就记装备栏）。',
    '详情纪律：正文里对一件东西的描述必须原样抄进字段里——effect（效果）写「有什么用、什么威力」：功法斗技写威力与修习层次，装备写防护/攻击效果，天材地宝写能力，丹药写药效；note（备注）写外观、来历与零散补充；grade（品阶写全，如「玄阶中品」而不是「玄阶」）、source（来源：第几楼、谁给的、哪买的）、progress（功法修习进度），正文里有就都要填上；addRecipe 把主要材料写进 materials。只交名字（note、effect、grade、source、progress 全空）的新条目会被脚本整条拒绝——金币扣了货没入账就是烂账；grade/source 写了但 note、effect 还空的条目会被标「详情待补」，之后要补全。旧条目信息不全而正文这轮提到它时，顺手用 update 操作把缺的详情补全（纳戒现状里标了「详情待补」的就是缺详情的旧条目）。只记这一轮的变化，之前楼里已经记过账的交易不要重复入账；买卖两讫，扣金币必须同轮把货记上。',
    '没有需要记下的变化就完全不要输出这个区块；正文照常写给玩家看，指令只是记账。',
].join('\n');

function clampInt(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isInteger(num) || num < min || num > max) return fallback;
    return num;
}

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * 纳戒快照 → 注入文本；身份与境界永远保留，超预算从目标、进行中炼制、行囊往上丢。
 * withIds=true 时条目前带编号（t1·焚决）：决定模型要靠它引用 update/remove 的 id；
 * 正文注入保持默认关，省字数。
 */
export function buildSelfInjection(snapshot = {}, { maxChars = Infinity, withIds = false } = {}) {
    // 注入字数默认不限制（用户拍板的口径）：有限正数才截断，不再有 200 下限与 4000 天花板。
    const cap = Number.isFinite(Number(maxChars)) && Number(maxChars) > 0 ? Math.floor(Number(maxChars)) : Infinity;
    const profile = snapshot.profile ?? {};
    const realmState = snapshot.realm ?? {};
    const today = clampInt(snapshot.day, 1, 99999, 1);
    const lines = [];
    const identityBits = [text(profile.name) || '（未命名）'];
    if (text(profile.gender)) identityBits.push(text(profile.gender));
    if (text(profile.age)) identityBits.push(text(profile.age));
    const identityExtra = [['race', '种族'], ['origin', '出身'], ['affiliation', '所属'], ['attribute', '斗气属性'], ['talent', '天赋']]
        .map(([field, label]) => (text(profile[field]) ? `${label}：${text(profile[field])}` : ''))
        .filter(Boolean);
    lines.push(`身份：${identityBits.join('，')}${identityExtra.length ? `；${identityExtra.join('；')}` : ''}`);
    const realmBody = text(realmState.realm);
    if (realmBody) lines.push(`境界：${realmBody}${text(realmState.stage) || ''}`);
    if (Number.isInteger(snapshot.gold) && snapshot.gold > 0) lines.push(`金币：${snapshot.gold}`);
    if (Array.isArray(snapshot.titles) && snapshot.titles.length) lines.push(`称号：${snapshot.titles.join('、')}`);
    const idOf = item => (withIds && item?.id ? `${item.id}·` : '');
    // 决定喂料（withIds）里把详情缺口亮出来：详情纪律说"旧条目信息不全就顺手 update 补全"，
    // 先让模型看得见哪条缺——只影响决定喂料，正文注入（withIds=false）不带记账噪声。
    const gapOf = item => (withIds && !text(item?.note) && !text(item?.effect) ? '（详情待补）' : '');
    const entryLine = item => `${idOf(item)}${item.name}${item.grade ? `（${item.grade}${item.progress ? `·${item.progress}` : ''}）` : item.progress ? `（${item.progress}）` : ''}${gapOf(item)}`;
    if (Array.isArray(snapshot.techniques) && snapshot.techniques.length) lines.push(`功法：${snapshot.techniques.map(entryLine).join('、')}`);
    if (Array.isArray(snapshot.skills) && snapshot.skills.length) lines.push(`斗技：${snapshot.skills.map(entryLine).join('、')}`);
    const gear = [
        ...(Array.isArray(snapshot.equipment) ? snapshot.equipment : []),
        ...(Array.isArray(snapshot.items) ? snapshot.items : []).filter(item => item.equipped === true),
    ];
    if (gear.length) lines.push(`装备：${gear.map(item => `${idOf(item)}${item.name}${item.grade ? `（${item.grade}${item.type ? `·${item.type}` : ''}）` : item.type ? `（${item.type}）` : ''}${gapOf(item)}`).join('、')}`);
    if (Array.isArray(snapshot.treasures) && snapshot.treasures.length) {
        lines.push(`天材地宝：${snapshot.treasures.map(item => `${idOf(item)}${item.name}${item.grade ? `（${item.grade}${item.type ? `·${item.type}` : ''}）` : item.type ? `（${item.type}）` : ''}${gapOf(item)}`).join('、')}`);
    }
    const items = Array.isArray(snapshot.items) ? snapshot.items : [];
    const bag = items.filter(item => item.equipped !== true).sort((a, b) => b.count - a.count);
    if (bag.length) {
        // 行囊全量展示，不设条数上限（用户口径 2026-11-17）
        lines.push(`行囊：${bag.map(item => `${idOf(item)}${item.name}${item.count > 1 ? `×${item.count}` : ''}`).join('、')}`);
    }
    const openCrafts = (Array.isArray(snapshot.crafts) ? snapshot.crafts : []).filter(job => job.status === 'open');
    if (openCrafts.length) {
        lines.push(`进行中：${openCrafts.map(job => `${idOf(job)}${job.craft || '炼制'}·${job.name}${job.count > 1 ? `×${job.count}` : ''}${job.endDay !== null && job.endDay !== undefined ? (job.endDay >= today ? `（剩 ${job.endDay - today + 1} 天）` : '（已超期）') : ''}`).join('；')}`);
    }
    const openGoals = (Array.isArray(snapshot.goals) ? snapshot.goals : []).filter(goal => goal.done !== true);
    if (openGoals.length) {
        const sorted = [...openGoals].sort((a, b) => (a.priority === '主线' ? 0 : 1) - (b.priority === '主线' ? 0 : 1));
        // 目标行：短标题当名字，完整内容跟在后面——标题一眼扫，细节不丢。
        lines.push(`目标：${sorted.map(goal => `${idOf(goal)}${goal.priority === '主线' ? '★' : '·'}${goal.title || goal.text}${goal.text && goal.title && goal.text !== goal.title ? `：${goal.text}` : ''}${goal.due ? `（${goal.due}）` : ''}`).join('；')}`);
    }
    let output = lines.join('\n');
    const appearance = text(profile.appearance);
    if (appearance) {
        const withAppearance = `${output}\n外貌：${appearance}`;
        if (withAppearance.length <= cap) output = withAppearance;
    }
    // 超预算从末尾往上丢：目标/进行中先丢，行囊压缩，身份境界功法斗技保住。
    while (output.length > cap && lines.length > 1) {
        lines.pop();
        output = lines.join('\n');
    }
    return output;
}

/** 从回复里找 self 指令块；找不到 fenced 块时容忍裸行（部分模型不吃代码块语法）。 */
export function extractOpsBlock(reply) {
    const source = typeof reply === 'string' ? reply : '';
    if (!source) return null;
    const fenced = [...source.matchAll(FENCE_RE)];
    if (fenced.length) {
        const body = fenced.at(-1)[1];
        return { raw: body, fenced: true, count: fenced.length };
    }
    const lines = source.split('\n');
    let best = [];
    let current = [];
    for (const line of lines) {
        if (OP_LINE_RE.test(line)) { current.push(line.trim()); continue; }
        if (current.length > best.length) best = current;
        current = [];
    }
    if (current.length > best.length) best = current;
    return best.length ? { raw: best.join('\n'), fenced: false, count: 1 } : null;
}

/** 逐行解析指令块：好行进 ops，坏行进 parseErrors，不因一行坏账整块作废。
 *  条数不设上限（用户口径 2026-11-17）：模型给多少条合法操作就收多少条。 */
export function parseOps(raw, { maxOps = SELF_MODEL_OPS_MAX } = {}) {
    const cap = maxOps === undefined ? SELF_MODEL_OPS_MAX : clampInt(maxOps, 1, 500, SELF_MODEL_OPS_MAX);
    const lines = typeof raw === 'string' ? raw.split('\n') : [];
    const ops = [];
    const parseErrors = [];
    lines.forEach((line, index) => {
        const body = line.trim();
        if (!body || body.startsWith('```')) return;
        try {
            const parsed = JSON.parse(body);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.op === 'string' && parsed.op.trim()) {
                if (ops.length < cap) ops.push(capSelfOp(parsed));
            } else {
                parseErrors.push({ line: index + 1, reason: 'not_an_op' });
            }
        } catch (error) {
            parseErrors.push({ line: index + 1, reason: String(error?.message ?? error) });
        }
    });
    return { ops, parseErrors };
}

/** 把指令块从楼层正文里剥掉，玩家只看到干净的剧情。 */
export function stripOpsBlock(reply) {
    const source = typeof reply === 'string' ? reply : '';
    if (!source) return source;
    let cleaned = source.replace(FENCE_RE, '').replace(/\n{3,}/g, '\n\n');
    const kept = [];
    for (const line of cleaned.split('\n')) {
        if (OP_LINE_RE.test(line)) continue;
        kept.push(line);
    }
    cleaned = kept.join('\n').replace(/[ \t]+$/u, '').replace(/\n{3,}/g, '\n\n');
    return cleaned.trim() === '' ? source : cleaned.trimEnd();
}
