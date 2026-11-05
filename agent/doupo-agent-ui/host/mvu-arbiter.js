/**
 * MVU 仲裁器：模型经 <UpdateVariable> 通道申报纳戒变化（MVU 框架把它们写进
 * stat_data.斗破纳戒），本模块在每轮生成结束后读帧差分，按纳戒业务规则逐字段裁决——
 * 合法的申报翻译成 self-runtime 操作落账（账本仍是唯一真相源），违规的申报直接
 * 无视（下次同步时账本会把帧里那些字段写回去，等于回滚）。
 *
 * 为什么以帧为输入：MVU 自己负责解析模型的 _.set 并写帧，扩展不重复解析执行；
 * 帧差分天然只看到"模型这一轮改了什么"（扩展自己的写发生在仲裁之后的 sync 里）。
 * 每轮至多一次差分；账本投影（buildSelfMvuPayload）与帧一致即无事发生。
 *
 * 兜底（MVU 缺席/失效时）：帧与账本投影完全一致（MVU 一笔没写）而申报块里带合规
 * JSONPatch 时，由扩展把补丁套到投影上合成"应然帧"，走同一套差分裁决。MVU 正常时
 * 帧会动，兜底自动静默，绝不双重执行；补丁只认 replace/add 的整字段写入（remove/
 * move/delta/子路径不在此列——清空写空串、改动写整清单是申报约定）。
 *
 * 申报约定（[mvu_update]变量输出格式条目里同样写给模型）：新版是 JSON Patch
 * （RFC 6902 变体：replace/delta/insert/remove/move，路径 /斗破纳戒/字段），旧版
 * _.set('斗破纳戒.路径', 旧值, 新值);//理由 保留兼容——两种都只是 MVU 的输入，
 * 真正执行写帧的是 MVU 框架；本模块对块的解析仅用于审计与存在性判断。
 * - 链式字段（功法/斗技/装备/行囊/称号/丹方/器谱/炼制/目标）写"整张新清单"：
 *   新增=清单里多一项，修改=改那一项，删除/完成=清单里不再出现；
 * - 境界只能沿晋升链向前一步或任意回退；金币写绝对值；更新时间系统维护，别写。
 */

import { buildSelfMvuPayload } from './self-mvu.js';
import { GOAL_TITLE_MAX as imported_GOAL_TITLE_MAX } from '../self/goal-data.js';

export const NAMESPACE = '斗破纳戒';

const UPDATE_BLOCK_RE = /<UpdateVariable>[\s\S]*?<\/UpdateVariable>/g;
const SET_LINE_RE = /_\.set\(\s*(['"])((?:(?!\1).)*)\1\s*,\s*((?:(?!;\/\/).)*)\)\s*(?:;|；)?\s*(?:\/\/(.*))?/;

const REALM_CHAIN = Object.freeze(['斗之气', '斗者', '斗师', '大斗师', '斗灵', '斗王', '斗皇', '斗宗', '斗尊', '斗圣', '斗帝']);
const STAGE_RE = /^[一二三四五六七八九]\s*[段星]$/;

const PROFILE_FIELD_OF = Object.freeze({
    姓名: 'name', 性别: 'gender', 年龄: 'age', 种族: 'race', 出身: 'origin',
    所属: 'affiliation', 斗气属性: 'attribute', 天赋: 'talent', 外貌: 'appearance',
});
const PROFILE_CAPS = Object.freeze({
    name: 60, gender: 60, age: 60, race: 60, origin: 60,
    affiliation: 60, attribute: 12, talent: 60, appearance: 160,
});

const GOLD_MAX = 999999999;
const TITLE_MAX = 16;
const TITLES_MAX = 6;
// 目标标题上限与自账本共用同一份定义（self/goal-data.js），两处各写各的总有一天对不上。
const GOAL_TITLE_MAX = imported_GOAL_TITLE_MAX;
const GOAL_TEXT_MAX = 80;
const GOAL_DUE_MAX = 20;
const NAME_MAX = 30;
const GRADE_MAX = 16;
const REST_MAX = 16;
const BAG_MAX = 60;
const RECIPES_MAX = 30;
const CRAFTS_MAX = 30;
const GOALS_MAX = 20;
const TECHNIQUES_MAX = 40;
const EQUIPMENT_MAX = 12;
const TREASURES_MAX = 12;

/** 每个链式字段的解析约定：分隔符、每段含义、条目上限。 */
const CHAIN_FIELDS = Object.freeze({
    功法: { sep: '、', parts: ['name', 'grade', 'progress'], cap: TECHNIQUES_MAX, len: 600 },
    斗技: { sep: '、', parts: ['name', 'grade', 'type'], cap: TECHNIQUES_MAX, len: 600 },
    装备: { sep: '、', parts: ['name', 'grade', 'type'], cap: EQUIPMENT_MAX, len: 400 },
    天材地宝: { sep: '、', parts: ['name', 'grade', 'type'], cap: TREASURES_MAX, len: 400 },
    行囊: { sep: '、', kind: 'bag', cap: BAG_MAX, len: 800 },
    称号: { sep: '、', kind: 'titles', cap: TITLES_MAX, len: 160 },
    丹方: { sep: '、', parts: ['name', 'grade'], kind: 'recipe', craft: '炼药', cap: RECIPES_MAX, len: 500 },
    器谱: { sep: '、', parts: ['name', 'grade'], kind: 'recipe', craft: '炼器', cap: RECIPES_MAX, len: 500 },
    炼制: { sep: '、', kind: 'craft', cap: CRAFTS_MAX, len: 500 },
    目标: { sep: '；', kind: 'goals', cap: GOALS_MAX, len: 500 },
});

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function decodePointerSegment(segment) {
    return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * 解析块内 <JSONPatch> 数组（新版申报格式）：只保留 斗破纳戒 命名空间的操作，
 * JSON Pointer 解码（~1→/ ~0→~），字段取路径第二段、余段并入 sub（如 行囊 下的 "-"）。
 * 模型会在块里写格式说明散文，带出的 <JSONPatch> 开标签可能没闭合——一旦某个
 * 开标签配到的段落解析失败，就从该开标签之后继续找下一个开标签重试（散标吞掉
 * 真申报的开标签时也能恢复）；全部失败才报错。返回 { patch, patchError }。
 */
export function parseJsonPatch(block) {
    const body = typeof block === 'string' ? block : '';
    if (!body) return { patch: [], patchError: '' };
    const OPEN_RE = /<JSONPatch>/gi;
    let patchError = '';
    let sawTag = false;
    let cursor = 0;
    while (cursor <= body.length) {
        OPEN_RE.lastIndex = cursor;
        const open = OPEN_RE.exec(body);
        if (!open) break;
        sawTag = true;
        const contentStart = open.index + open[0].length;
        const rest = body.slice(contentStart);
        const closeAt = rest.search(/<\/JSONPatch>/i);
        if (closeAt < 0) break;
        const content = rest.slice(0, closeAt);
        let ops;
        try {
            ops = JSON.parse(content.trim());
        } catch (error) {
            patchError = String(error?.message ?? error).slice(0, 120);
            cursor = contentStart; // 从这个开标签之后继续找，散标吞不掉真申报
            continue;
        }
        if (!Array.isArray(ops)) {
            patchError = 'JSONPatch 不是数组';
            cursor = contentStart;
            continue;
        }
        const patch = [];
        for (const entry of ops) {
            if (!entry || typeof entry !== 'object') continue;
            const op = text(entry.op);
            if (!op) continue;
            // RFC 6902 的 move 用 from/to 表达，没有 path——按目的地(to)归命名空间
            const path = typeof entry.path === 'string' ? entry.path
                : (op === 'move' && typeof entry.to === 'string' ? entry.to : '');
            const segments = path.split('/').slice(1).map(decodePointerSegment);
            if (segments[0] !== NAMESPACE) continue; // 其他命名空间一律忽略
            const record = { op, path, field: segments[1] ?? '', sub: segments.slice(2).join('/') };
            if (entry.value !== undefined) record.value = entry.value;
            if (typeof entry.from === 'string') record.from = entry.from;
            patch.push(record);
        }
        return { patch, patchError: '' };
    }
    return { patch: [], patchError: sawTag ? patchError : '' };
}

function sameScalar(a, b) {
    if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
    return text(a) === text(b);
}

/** 从回复正文里抽 <UpdateVariable> 块（取最后一个），解析纳戒命名空间的申报供审计：
 * 旧版 _.set 行进 sets，新版 JSON Patch 进 patch（跨命名空间操作被忽略）。 */
export function extractUpdateBlock(source) {
    const body = typeof source === 'string' ? source : '';
    if (!body) return null;
    const blocks = [...body.matchAll(UPDATE_BLOCK_RE)];
    if (!blocks.length) return null;
    const block = blocks.at(-1)[0];
    const sets = [];
    for (const line of block.split('\n')) {
        const match = SET_LINE_RE.exec(line.trim());
        if (!match) continue;
        const path = match[2].trim();
        if (!path.startsWith(`${NAMESPACE}.`)) continue;
        sets.push({
            path: path.slice(NAMESPACE.length + 1),
            args: match[3].trim(),
            reason: text(match[4]).slice(0, 120),
        });
    }
    const { patch, patchError } = parseJsonPatch(block);
    return { block, sets, patch, patchError };
}

/** 帧与账本投影逐字段比对（差分语义同 arbitrateFrame：投影没有的字段不算差异）。 */
export function frameMatchesProjection(frame, ledger) {
    if (!frame || typeof frame !== 'object') return false;
    const projection = buildSelfMvuPayload(ledger);
    for (const [field, value] of Object.entries(frame)) {
        if (field === '更新时间') {
            if (text(value) !== text(projection.更新时间)) return false;
            continue;
        }
        const projected = projection[field];
        if (projected === undefined) continue;
        if (!sameScalar(projected, value)) return false;
    }
    return true;
}

/** 兜底用：把申报补丁套到账本投影上，合成"MVU 本应写出的帧"。只认纳戒命名空间里
 *  replace/add 的整字段写入；未知字段、更新时间、子路径与其他操作一律不套。
 *  返回合成帧（不改动入参），一个字段都没套上时返回 null。坏类型照套——由
 *  arbitrateFrame 的逐字段守卫如实记为回滚，不在这里悄悄吞掉。 */
export function applyDeclaredPatch(projection, patch) {
    if (!projection || typeof projection !== 'object' || !Array.isArray(patch)) return null;
    const synthetic = { ...projection };
    let used = 0;
    for (const entry of patch) {
        if (entry.op !== 'replace' && entry.op !== 'add') continue;
        if (entry.sub) continue;
        const field = entry.field;
        if (!field || field === '更新时间') continue;
        if (!PROFILE_FIELD_OF[field] && !CHAIN_FIELDS[field] && field !== '金币' && field !== '境界' && field !== '段位') continue;
        if (entry.value === undefined) continue;
        synthetic[field] = entry.value;
        used += 1;
    }
    return used ? synthetic : null;
}

// —— 链条解析：坏条目整条记为 malformed，调用方决定整字段回滚 ——

function splitChain(value, spec) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return { items: [], malformed: 0 };
    if (raw.length > spec.len) return { items: [], malformed: 1 };
    const items = [];
    let malformed = 0;
    for (const piece of raw.split(spec.sep)) {
        const item = piece.trim();
        if (!item) continue;
        const parsed = parseChainItem(item, spec);
        if (parsed) items.push(parsed);
        else malformed += 1;
    }
    return { items, malformed };
}

function parseChainItem(item, spec) {
    if (spec.kind === 'titles') return item.length <= TITLE_MAX ? { name: item } : null;
    if (spec.kind === 'bag') {
        const match = /^(.*?)(?:\s*[×xX]\s*(\d+))?$/.exec(item);
        const name = text(match?.[1]);
        if (!name || name.length > NAME_MAX) return null;
        const count = Number(match?.[2]);
        return { name, count: Number.isInteger(count) && count >= 1 ? Math.min(count, 999999) : 1 };
    }
    if (spec.kind === 'craft') {
        const match = /^(.*?)\s*(?:[×xX]\s*(\d+))?\s*(?:（([^（）]*)）)?$/.exec(item);
        const name = text(match?.[1]);
        if (!name || name.length > NAME_MAX) return null;
        const count = Number(match?.[2]);
        const tail = text(match?.[3]);
        const days = /剩\s*(\d+)\s*天/.exec(tail);
        return {
            name,
            count: Number.isInteger(count) && count >= 1 ? Math.min(count, 999999) : 1,
            days: days ? Math.min(Number(days[1]), 365) : null,
            failed: /失败|炸炉/.test(tail),
        };
    }
    if (spec.kind === 'goals') {
        let priority = '支线';
        let stripped = item.trim();
        // 优先级前缀：新版 [主线]/[支线] 照认；模型自造的其他短标签（[探索] 这类）剥掉当支线，
        // 不再把标签并进标题撑爆 20 字上限整字段报废；旧版 ★/☆ 照认（·• 仅当作装饰剥掉）。
        const strict = /^[（\[(［]\s*(主线|支线)\s*[)\]）］]\s*/.exec(stripped);
        if (strict) {
            priority = strict[1];
            stripped = stripped.slice(strict[0].length);
        } else {
            const loose = /^[（\[(［]\s*([^\])］）]{1,6})\s*[)\]）］]\s*/.exec(stripped);
            if (loose) stripped = stripped.slice(loose[0].length);
        }
        if (/^[★]/.test(stripped)) priority = '主线';
        stripped = stripped.replace(/^[★☆·•]\s*/, '');
        const withDue = /^(.*?)(?:（([^（）]*)）)?$/.exec(stripped);
        const head = text(withDue?.[1]);
        if (!head) return null;
        const due = text(withDue?.[2]);
        const parts = head.split(/[：:]/);
        const title = text(parts[0]);
        const body = text(parts.slice(1).join('：'));
        if (!title || title.length > GOAL_TITLE_MAX || body.length > GOAL_TEXT_MAX || due.length > GOAL_DUE_MAX) return null;
        return { title, text: body, priority, due };
    }
    // 名·品级·进度/类型 通用解析：第二段固定品级，其余并入最后一段；任一段超长即坏条目。
    const parts = item.split('·');
    const name = text(parts[0]);
    if (!name || name.length > NAME_MAX) return null;
    const rest = parts.slice(1).map(part => text(part));
    if (rest.some(part => part.length > GRADE_MAX)) return null;
    const parsed = { name, grade: rest[0] ?? '' };
    const tailKey = spec.parts[2];
    if (tailKey) parsed[tailKey] = rest.slice(1).join('·').slice(0, REST_MAX);
    return parsed;
}

// —— 逐字段仲裁：返回 ops（采纳成 runtime 操作）或 null（整字段回滚） ——

function opsForProfile(field, value) {
    const key = PROFILE_FIELD_OF[field];
    const body = typeof value === 'string' ? value.trim() : '';
    if (body.length > PROFILE_CAPS[key]) return null;
    return [{ op: 'setProfile', field: key, text: body }];
}

function realmIndex(realm) {
    return REALM_CHAIN.indexOf(text(realm));
}

function opsForRealm(realm, stage, ledger) {
    realm = text(realm);
    stage = text(stage);
    if (!realm || realm.length > 12 || !REALM_CHAIN.includes(realm)) return null;
    if (stage && (stage.length > 12 || !STAGE_RE.test(stage))) return null;
    const current = text(ledger.realm?.realm);
    if (current) {
        const from = realmIndex(current);
        const to = realmIndex(realm);
        if (from >= 0 && to > from + 1) return null; // 晋升链一次只能前进一步，回退不限
    } else if (realmIndex(realm) > 1) {
        return null; // 空戒初始化最多从斗者起步
    }
    return [{ op: 'setRealm', realm, stage }];
}

function opsForGold(value) {
    const amount = Number(value);
    if (!Number.isInteger(amount) || amount < 0 || amount > GOLD_MAX) return null;
    return [{ op: 'setGold', amount }];
}

function opsForTitles(value, ledger) {
    const spec = CHAIN_FIELDS.称号;
    const { items, malformed } = splitChain(value, spec);
    if (malformed || items.length > spec.cap) return null;
    const names = items.map(item => item.name);
    const ops = [];
    for (const name of names) if (!ledger.titles.includes(name)) ops.push({ op: 'addTitle', text: name });
    for (const name of ledger.titles) if (!names.includes(name)) ops.push({ op: 'removeTitle', text: name });
    return ops;
}

/** 功法/斗技/装备：按名对账——新增/字段变化/消失，翻译成 add/update/remove。 */
function opsForNamedList(field, value, ledger) {
    const spec = CHAIN_FIELDS[field];
    const { items, malformed } = splitChain(value, spec);
    if (malformed || items.length > spec.cap) return null;
    const listKey = { 功法: 'techniques', 斗技: 'skills', 装备: 'equipment', 天材地宝: 'treasures' }[field];
    const addOp = { 功法: 'addTechnique', 斗技: 'addSkill', 装备: 'addEquipment', 天材地宝: 'addTreasure' }[field];
    const updateOp = { 功法: 'updateTechnique', 斗技: 'updateSkill', 装备: 'updateEquipment', 天材地宝: 'updateTreasure' }[field];
    const removeOp = { 功法: 'removeTechnique', 斗技: 'removeSkill', 装备: 'removeEquipment', 天材地宝: 'removeTreasure' }[field];
    const known = new Map((ledger[listKey] ?? []).map(entry => [entry.name, entry]));
    const ops = [];
    const seen = new Set();
    for (const item of items) {
        seen.add(item.name);
        const twin = known.get(item.name);
        if (!twin) {
            ops.push({
                op: addOp, name: item.name,
                grade: item.grade ?? '', type: item.type ?? '', progress: item.progress ?? '',
                source: 'MVU通道',
            });
            continue;
        }
        const changed = {};
        for (const key of ['grade', 'type', 'progress']) {
            if (item[key] !== undefined && text(item[key]) !== text(twin[key])) changed[key] = item[key];
        }
        if (Object.keys(changed).length) ops.push({ op: updateOp, id: twin.id, ...changed });
    }
    for (const entry of ledger[listKey] ?? []) {
        if (!seen.has(entry.name)) ops.push({ op: removeOp, id: entry.id });
    }
    return ops;
}

function opsForBag(value, ledger) {
    const spec = CHAIN_FIELDS.行囊;
    const { items, malformed } = splitChain(value, spec);
    if (malformed || items.length > spec.cap) return null;
    const bag = (ledger.items ?? []).filter(item => item.equipped !== true);
    const known = new Map(bag.map(entry => [entry.name, entry]));
    const ops = [];
    const seen = new Set();
    for (const item of items) {
        seen.add(item.name);
        const twin = known.get(item.name);
        if (!twin) {
            const category = /[丹散膏丸]$/.test(item.name) ? '丹药' : '杂物';
            ops.push({ op: 'addItem', name: item.name, category, count: item.count, source: 'MVU通道' });
        } else if (twin.count !== item.count) {
            ops.push({ op: 'updateItem', id: twin.id, count: item.count });
        }
    }
    for (const entry of bag) {
        if (!seen.has(entry.name)) ops.push({ op: 'removeItem', id: entry.id });
    }
    return ops;
}

function opsForRecipes(field, value, ledger) {
    const spec = CHAIN_FIELDS[field];
    const { items, malformed } = splitChain(value, spec);
    if (malformed || items.length > spec.cap) return null;
    const known = new Map((ledger.recipes ?? []).filter(entry => entry.craft === spec.craft).map(entry => [entry.name, entry]));
    const ops = [];
    const seen = new Set();
    for (const item of items) {
        seen.add(item.name);
        const twin = known.get(item.name);
        if (twin && text(twin.grade) !== text(item.grade)) return null;
        if (!twin) ops.push({ op: 'addRecipe', name: item.name, craft: spec.craft, grade: item.grade ?? '', note: 'MVU通道' });
    }
    for (const entry of ledger.recipes ?? []) {
        if (entry.craft === spec.craft && !seen.has(entry.name)) ops.push({ op: 'removeRecipe', id: entry.id });
    }
    return ops;
}

function opsForCrafts(value, ledger) {
    const spec = CHAIN_FIELDS.炼制;
    const { items, malformed } = splitChain(value, spec);
    if (malformed || items.length > spec.cap) return null;
    const open = (ledger.crafts ?? []).filter(job => job.status === 'open');
    const known = new Map(open.map(job => [job.name, job]));
    const ops = [];
    const kept = new Set();
    for (const item of items) {
        if (item.failed) continue; // 标了炸炉的视为结束，走下面的消失分支
        kept.add(item.name);
        const twin = known.get(item.name);
        const remaining = twin && Number.isInteger(twin.endDay) ? twin.endDay - (ledger.day || 1) + 1 : null;
        if (twin && (item.count !== (twin.count || 1) || item.days !== remaining)) return null;
        if (!twin) {
            ops.push({ op: 'startCraft', name: item.name, craft: '炼药', count: item.count, days: item.days ?? undefined, note: 'MVU通道申报开工' });
        }
    }
    for (const job of open) {
        if (kept.has(job.name)) continue;
        const failed = items.find(item => item.name === job.name && item.failed);
        ops.push({ op: 'finishCraft', id: job.id, result: failed ? 'fail' : 'success', note: 'MVU通道炼制结束' });
    }
    return ops;
}

function opsForGoals(value, ledger) {
    const spec = CHAIN_FIELDS.目标;
    const { items, malformed } = splitChain(value, spec);
    if (malformed || items.length > spec.cap) return null;
    const open = (ledger.goals ?? []).filter(goal => goal.done !== true);
    const known = new Map(open.map(goal => [goal.title || goal.text, goal]));
    const ops = [];
    const kept = new Set();
    for (const item of items) {
        kept.add(item.title);
        const twin = known.get(item.title);
        if (twin && ((item.text && item.text !== text(twin.text)) || item.priority !== twin.priority || item.due !== text(twin.due))) return null;
        if (!twin) {
            ops.push({ op: 'addGoal', title: item.title, text: item.text || item.title, priority: item.priority, due: item.due });
        }
    }
    for (const goal of open) {
        if (!kept.has(goal.title || goal.text)) ops.push({ op: 'finishGoal', id: goal.id });
    }
    return ops;
}

/**
 * 帧差分 → 裁决。status：
 * - 'stale'：帧上的更新时间跟账本对不上（同步断档/重置/模型乱写时间），整轮不仲裁，外壳负责重同步；
 * - 'clean'：帧与账本投影一致（或模型没申报任何变化）；
 * - 'ops'：有可落账的采纳与/或回滚（reverts 里每项 {field, from, to, reason}）。
 */
export function arbitrateFrame({ namespace, ledger, currentLedger = ledger } = {}) {
    const frame = namespace && typeof namespace === 'object' ? namespace : null;
    const projection = buildSelfMvuPayload(ledger);
    if (!frame) return { status: 'clean', diffs: [], ops: [], reverts: [] };
    const frameStamp = text(frame.更新时间);
    if (frameStamp !== buildSelfMvuPayload(currentLedger).更新时间) {
        return { status: 'stale', diffs: [], ops: [], reverts: [], reason: '更新时间与账本不一致，先重同步' };
    }
    const diffs = [];
    const ops = [];
    const reverts = [];
    const note = (field, from, to, reason) => reverts.push({ field, from, to, reason });
    const pushOps = (field, from, to, result) => {
        if (result === null) {
            note(field, from, to, '不符合纳戒规则');
            return;
        }
        ops.push(...result);
    };
    let realmHandled = false;
    for (const [field, value] of Object.entries(frame)) {
        if (field === '更新时间') continue;
        const projected = projection[field];
        if (projected === undefined) continue; // 帧里有、载荷没这字段（旧骨架）→ 不当成清空
        // 这些字段只接受字符串；坏类型不能被 text()/splitChain() 当成空值清账。
        if ((PROFILE_FIELD_OF[field] || CHAIN_FIELDS[field]) && typeof value !== 'string') {
            diffs.push({ field, from: projected, to: value });
            note(field, projected, value, '字段必须是字符串');
            continue;
        }
        if (sameScalar(projected, value)) continue;
        diffs.push({ field, from: projected, to: value });
        if (PROFILE_FIELD_OF[field]) { pushOps(field, projected, value, opsForProfile(field, value)); continue; }
        if (field === '境界' || field === '段位') {
            // 境界与段位是一对：任一变化都按整体裁决一次；帧上没报的那半沿用账本现值。
            if (realmHandled) continue;
            realmHandled = true;
            const fromRealm = text(ledger.realm?.realm);
            const fromStage = text(ledger.realm?.stage);
            const toRealm = frame.境界 === undefined ? fromRealm : text(frame.境界);
            const toStage = frame.段位 === undefined ? fromStage : text(frame.段位);
            if (toRealm !== fromRealm || toStage !== fromStage) {
                diffs.push({ field: '境界/段位', from: `${fromRealm}${fromStage}`, to: `${toRealm}${toStage}` });
                const realmOps = opsForRealm(toRealm, toStage, ledger);
                if (realmOps === null) note('境界/段位', `${fromRealm}${fromStage}`, `${toRealm}${toStage}`, '不符合晋升链');
                else ops.push(...realmOps);
            }
            continue;
        }
        if (field === '金币') { pushOps(field, projected, value, opsForGold(value)); continue; }
        const spec = CHAIN_FIELDS[field];
        if (!spec) { note(field, projected, value, '未知字段'); continue; }
        const result = spec.kind === 'titles' ? opsForTitles(value, ledger)
            : spec.kind === 'bag' ? opsForBag(value, ledger)
                : spec.kind === 'recipe' ? opsForRecipes(field, value, ledger)
                    : spec.kind === 'craft' ? opsForCrafts(value, ledger)
                        : spec.kind === 'goals' ? opsForGoals(value, ledger)
                            : opsForNamedList(field, value, ledger);
        pushOps(field, projected, value, result);
    }
    if (ops.length > 12) {
        return { status: 'ops', diffs, ops: [], reverts: [{ field: '整帧', reason: '单帧超过12条操作，整帧拒绝并恢复账本' }] };
    }
    return { status: ops.length || reverts.length ? 'ops' : 'clean', diffs, ops, reverts };
}

function defaultSleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** 异步外壳：生成结束后跑一次——发现申报块等 MVU 应用完，读帧裁决，采纳走 runtime 落账。 */
export function createMvuArbiter({
    selfRuntime,
    selfMvu,
    getContext,
    worldDay = () => 1,
    persistSelf = () => {},
    waitMs = 1200,
    sleep = defaultSleep,
    capture = () => null,
    isCurrent = () => true,
} = {}) {
    async function runArbitration({ source = 'auto' } = {}) {
        const owner = capture();
        if (!selfRuntime || !selfMvu || !isCurrent(owner)) return { status: 'disabled' };
        const context = typeof getContext === 'function' ? getContext() : getContext;
        const chat = Array.isArray(context?.chat) ? context.chat : [];
        let index = -1;
        for (let cursor = chat.length - 1; cursor >= 0; cursor -= 1) {
            const message = chat[cursor];
            if (!message || typeof message.mes !== 'string' || !message.mes.trim()) continue;
            if (message.is_user === true || message.is_system === true) continue;
            index = cursor;
            break;
        }
        if (index < 0) return { status: 'no_reply' };
        const blockInfo = extractUpdateBlock(chat[index].mes);
        if (!blockInfo) return { status: 'no_block' };
        const reply = chat[index];
        const signature = JSON.stringify([reply.mes, reply.swipe_id, reply.send_date]);
        const current = () => {
            const now = typeof getContext === 'function' ? getContext() : getContext;
            const latest = now?.chat?.[index];
            return isCurrent(owner) && now?.chat?.length === index + 1 && !!latest
                && JSON.stringify([latest.mes, latest.swipe_id, latest.send_date]) === signature;
        };
        const target = { messageId: index, isCurrent: current };
        if (!current()) return { status: 'stale' };
        await sleep(waitMs); // 给 MVU 留出解析 _.set 并写帧的时间
        if (!current()) return { status: 'stale' };
        const read = await selfMvu.readLatest(target);
        if (!current()) return { status: 'stale' };
        if (!read.ok) return { status: 'unavailable', reason: read.reason };
        const ledger = selfRuntime.snapshot();
        if (!read.namespace) {
            await selfMvu.sync(ledger, target);
            if (!current()) return { status: 'stale' }; // 命名空间被清（重置助手/新装）→ 先把账本写回去
            return { status: 'no_namespace', resynced: true };
        }
        // 兜底判定：MVU 一笔没写（帧=账本投影）而申报块带合规补丁 → 用合成帧走同一套裁决。
        // MVU 正常时帧已动，这里保持静默；同楼重 roll 时基线侧也用同一补丁合成，保证整楼贡献口径一致。
        let namespaceFor = () => read.namespace;
        let fallback = false;
        if (blockInfo.patch.length && frameMatchesProjection(read.namespace, ledger)) {
            const synthetic = applyDeclaredPatch(buildSelfMvuPayload(ledger), blockInfo.patch);
            if (synthetic) {
                fallback = true;
                namespaceFor = base => applyDeclaredPatch(buildSelfMvuPayload(base), blockInfo.patch) ?? read.namespace;
            }
        }
        const currentVerdict = arbitrateFrame({ namespace: namespaceFor(ledger), ledger });
        let baseline = ledger;
        try { baseline = selfRuntime.baselineForFloor?.(index) ?? ledger; }
        catch { return { status: 'rejected', reason: 'rollback_failed' }; }
        const verdict = currentVerdict.status === 'clean' || currentVerdict.status === 'stale'
            ? currentVerdict : arbitrateFrame({ namespace: namespaceFor(baseline), ledger: baseline, currentLedger: ledger });
        if (verdict.status === 'stale') {
            await selfMvu.sync(ledger, target);
            if (!current()) return { status: 'stale' };
            return { status: 'stale', resynced: true, reason: verdict.reason };
        }
        const rollbackOnly = verdict.status === 'clean' && currentVerdict.ops.length > 0;
        if (verdict.status === 'clean' && !rollbackOnly) return { status: 'unchanged', diffs: verdict.diffs.length, ...(fallback ? { fallback: true } : {}) };
        let applied = 0;
        let rejected = 0;
        if (verdict.ops.length || rollbackOnly) {
            const result = selfRuntime.apply(verdict.ops, { source: 'mvu', floor: index, day: worldDay() });
            applied = result.applied.length;
            rejected = result.rejected.length;
        }
        if (applied || rollbackOnly || verdict.reverts.length) persistSelf(); // 落账后同步：采纳的字段进帧，回滚的字段被账本写回
        return {
            status: applied ? 'applied' : 'reverted', applied, rejected, reverts: verdict.reverts, diffs: verdict.diffs.length,
            ...(fallback ? { fallback: true } : {}),
        };
    }

    return Object.freeze({ runArbitration });
}
