/**
 * 悬浮球：屏幕边上一颗小球，点一下竖直拉长成一根胶囊长条，条上从上到下
 * 排着 Agent 各功能的图标；点图标弹出对应功能的“只读信息窗”。
 *
 * 这个模块只管纯逻辑：图标清单、展开/收起的状态机、以及把各运行时的
 * 现状折成信息窗要显示的行与条目。DOM 结构、动画与挂载在 index.js，
 * 这里不碰 document，全部输入都可能是 undefined——没接上的功能显示“暂无”。
 * 每个栏目同时带预览（items）与全量（all）：信息窗只摆最新几条，右上角
 * 「全部」按同一个栏目弹副窗，副窗里铺 all。
 * 只从纯逻辑模块借几张贴好的标签（季节/立场/氛围/记忆标签），不引宿主层。
 */

import { STANCE_LABELS, TENSION_LABELS, eventIntro } from '../world/world-runtime.js';
import { seasonOf } from '../world/world-ops.js';
import { TAG_LABELS } from '../memory/memory-runtime.js';
import { SETTLE_CATEGORY_LABELS, SETTLE_FIELD_LABELS } from '../settle/settle-adjudicate.js';

/** 长条上从上到下的图标（球帽下面第一格就是第一项）。 */
export const ORB_ITEMS = Object.freeze([
    Object.freeze({ id: 'overview', icon: '⌂', title: '总控', hint: '模块开关与最近任务' }),
    Object.freeze({ id: 'world', icon: '◌', title: '世界运转', hint: '时间、势力与事件' }),
    Object.freeze({ id: 'self', icon: '◉', title: '纳戒', hint: '主角自身与随身之物' }),
    Object.freeze({ id: 'memory', icon: '✧', title: '记忆存储', hint: '大小记忆与本轮注入' }),
    Object.freeze({ id: 'npcledger', icon: '☰', title: '人物簿', hint: '人物档案与好感' }),
    Object.freeze({ id: 'cold', icon: '❄', title: '冷藏推进', hint: '后台人物的推进记录' }),
    Object.freeze({ id: 'impact', icon: '⌁', title: '世界影响', hint: '世界被改成了什么样' }),
    Object.freeze({ id: 'facts', icon: '▤', title: '原著资料', hint: '设定库与注入通道' }),
    Object.freeze({ id: 'settle', icon: '⚖', title: '行动结算', hint: '本轮行动的判定与注入' }),
    Object.freeze({ id: 'mirror', icon: '⇄', title: '数据镜像', hint: '数据库桥接与 MVU 同步' }),
    Object.freeze({ id: 'journal', icon: '✎', title: '运行日志', hint: 'Agent 的运行流水' }),
    Object.freeze({ id: 'sandbox', icon: '◈', title: '开放世界', hint: '本局的口径与惯性' }),
]);

const ITEM_IDS = new Set(ORB_ITEMS.map(item => item.id));

/**
 * 球的状态机：collapsed（只有球）→ expanded（长条）；长条上可以开一个信息窗。
 * 展开时自动维持上次选中的功能；收起时连信息窗一起关掉。
 */
export function createOrbState({ initial = null } = {}) {
    let collapsed = true;
    let panelId = ITEM_IDS.has(initial) ? initial : null;
    return {
        get collapsed() { return collapsed; },
        get panelId() { return panelId; },
        get expanded() { return !collapsed; },
        expand() { collapsed = false; return this.inspect(); },
        collapse() { collapsed = true; panelId = null; return this.inspect(); },
        toggle() { return collapsed ? this.expand() : this.collapse(); },
        /** 点图标：收起状态先展开；再点同一个图标关信息窗（长条保留）。 */
        select(id) {
            if (!ITEM_IDS.has(id)) return this.inspect();
            if (collapsed) collapsed = false;
            panelId = panelId === id ? null : id;
            return this.inspect();
        },
        inspect() { return { collapsed, panelId }; },
    };
}

const EMPTY = '暂无';
/** 主信息窗每栏只摆最新/最该看的几条，全量收在 list.all 里留给右上角「全部」副窗。 */
const LIST_CAP = 4;
/** 副窗最多铺多少条：运行时本身有条数上限，这里只是兜底，防止异常数据把副窗撑爆。 */
const FULL_CAP = 200;
const ROW_CAP = 10;

function text(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
}

/** 行内简介：没有短标题的长内容截断展示，全文只在详情小卡里出现。 */
function brief(value, cap) {
    const body = text(value);
    return body.length > cap ? `${body.slice(0, cap)}…` : body;
}

function row(label, value, tone) {
    return { label, value: text(value) || EMPTY, ...(tone ? { tone } : {}) };
}

function entry(head, meta, detail, ref) {
    return { head: text(head), ...(text(meta) ? { meta: text(meta) } : {}), ...(text(detail) ? { detail: text(detail) } : {}), ...(ref ? { ref } : {}) };
}

/** 条目引用：详情小卡按它回运行时里找活数据；拿不到 id 的条目不给引用（不可点）。 */
function ref(kind, id, extra) {
    if (id === undefined || id === null || id === '') return undefined;
    return { kind, id: String(id), ...(extra ?? {}) };
}

/**
 * 栏目：`items` 是主信息窗铺的预览（最新几条），`all` 是全量条目，`total` 是总条数。
 * 信息窗靠 total > items.length 决定要不要在栏目右上角挂「全部」，副窗直接铺 all。
 * 传进来的是排好序的全量，预览直接切前几条——排序只在调用处做一次。
 */
function list(heading, empty, all, cap = LIST_CAP) {
    const rows = Array.isArray(all) ? all.filter(Boolean) : [];
    const getPage = (offset = 0) => {
        offset = Number.isFinite(Number(offset)) ? Math.max(0, Math.min(Math.floor(Number(offset)), Math.max(0, rows.length - 1))) : 0;
        return { all: rows.slice(offset, offset + FULL_CAP), total: rows.length, offset, hasMore: offset + FULL_CAP < rows.length };
    };
    return { heading, empty, items: rows.slice(0, cap), ...getPage(), truncated: rows.length > FULL_CAP, ...(rows.length > FULL_CAP ? { getPage } : {}) };
}

function capRows(rows, cap = ROW_CAP) {
    return rows.filter(item => item.value !== EMPTY || item.tone).slice(0, cap);
}

/** 世界运转：时钟、五个信息字段、氛围、双栏事件、势力人物与任务，只读。 */
export function buildWorldPanel({ status, snapshot, clockText } = {}) {
    const info = status?.info ?? {};
    const dayNum = Number(snapshot?.clock?.day ?? status?.clock?.day);
    const season = Number.isInteger(dayNum) && dayNum >= 1 ? seasonOf(dayNum) : '';
    const rows = [row('时钟', clockText)];
    if (season) rows.push(row('季节', `${season}季`));
    for (const [field, label] of [['era', '时期'], ['location', '所在地'], ['weather', '天气'], ['reputation', '名声'], ['wanted', '通缉度']]) {
        rows.push(row(label, info[field]));
    }
    if (snapshot?.tension) rows.push(row('世界氛围', TENSION_LABELS[snapshot.tension] ?? ''));
    const today = status?.clock?.day ?? 1;
    const eventItem = (event, scope) => {
        // 标题优先；简介只铺正文里标题没覆盖的部分，标题就是正文第一句时不再抄一遍。
        const title = text(event.title);
        const intro = eventIntro(title, event.text);
        return entry(
            title || brief(event.text, 20),
            [`第 ${event.day} 天`, event.weight === 'rumor' ? '传闻' : event.weight === 'major' ? '大事' : '',
                event.pinned ? '置顶' : '', remainingDays(event.endDay, today)].filter(Boolean).join(' · '),
            intro ? brief(intro, 40) : event.basis,
            ref('event', event?.id, { scope }),
        );
    };
    // 主信息窗摆最新的几条：两栏都按登记日期倒序，新的在上。
    const near = [...(snapshot?.nearEvents ?? [])].filter(event => !event.done).sort(newestFirst);
    const world = [...(snapshot?.worldEvents ?? [])].filter(event => !event.done).sort(newestFirst);
    const factionItem = faction => entry(
        faction.name,
        [text(faction.type), STANCE_LABELS[faction.stance] ?? '中立', text(faction.leader) ? `首领 ${text(faction.leader)}` : '', `第 ${faction.updatedDay ?? faction.day ?? '?'} 天更新`].filter(Boolean).join(' · '),
        brief(faction.dynamics, 30),
        ref('faction', faction?.name),
    );
    const personItem = person => entry(
        person.name,
        brief(person.attitude, 24) || '态度未明',
        '',
        ref('person', person?.name),
    );
    const taskItem = task => {
        const overdue = task.status !== 'done' && task.endDay !== null && task.endDay !== undefined && task.endDay < today;
        return entry(
            brief(task.title, 24),
            [task.status === 'done' ? `已完成${task.doneDay ? `于第 ${task.doneDay} 天` : ''}` : overdue ? '已逾期' : remainingDays(task.endDay, today),
                `第 ${task.day} 天接`].filter(Boolean).join(' · '),
            '',
            ref('task', task?.id),
        );
    };
    const tasks = [...(snapshot?.tasks ?? [])].sort((a, b) => rankTask(a, today) - rankTask(b, today));
    const factions = [...(snapshot?.factions ?? [])].sort((a, b) => rankFaction(a) - rankFaction(b) || (b.updatedDay ?? 0) - (a.updatedDay ?? 0));
    const people = [...(snapshot?.people ?? [])].sort((a, b) => (b.updatedDay ?? 0) - (a.updatedDay ?? 0));
    return {
        title: '世界运转', icon: '◌',
        summary: clockText || EMPTY,
        rows: capRows(rows),
        lists: [
            list('附近事件', '附近没有进行中的事件。', near.map(event => eventItem(event, 'near'))),
            list('世界大事', '暂无进行中的世界大事。', world.map(event => eventItem(event, 'world'))),
            list('势力动向', '还没有剧情接触过的势力。', factions.map(factionItem)),
            list('相关人物', '还没有记过态度的人物。', people.map(personItem)),
            list('任务', '没有立下的任务。', tasks.map(taskItem)),
        ],
    };
}

/**
 * 事件两栏都按“最新登记”排：置顶的排最前（那是明确要留着看的），
 * 其余按日期倒序，同一天按编号倒序（e12 在 e9 前面）。
 */
function newestFirst(a, b) {
    return (b?.pinned === true) - (a?.pinned === true)
        || (Number(b?.day) || 0) - (Number(a?.day) || 0)
        || String(b?.id ?? '').localeCompare(String(a?.id ?? ''), 'zh', { numeric: true });
}

const FACTION_STANCE_RANK = Object.freeze({ hostile: 0, wary: 1, allied: 2, friendly: 3, neutral: 4 });

function rankFaction(faction) {
    return FACTION_STANCE_RANK[faction?.stance] ?? 2;
}

function remainingDays(endDay, today) {
    if (endDay === null || endDay === undefined) return '';
    return endDay < today ? '已逾期' : `剩 ${endDay - today + 1} 天`;
}

function rankTask(task, today) {
    if (task.status === 'done') return 2;
    if (task.endDay !== null && task.endDay !== undefined && task.endDay < today) return 0;
    return 1;
}

/** 主角标签九项：与纳戒账本的 profile 字段一一对应，顺序也照账本来。
 *  纳戒面板页里这些标签空着也显示「—」，悬浮球信息窗同样空着也显示「暂无」，保证两边内容齐全。 */
const SELF_PROFILE_ROWS = Object.freeze([
    Object.freeze(['name', '姓名']),
    Object.freeze(['gender', '性别']),
    Object.freeze(['age', '年龄']),
    Object.freeze(['race', '种族']),
    Object.freeze(['origin', '出身']),
    Object.freeze(['affiliation', '所属']),
    Object.freeze(['attribute', '斗气属性']),
    Object.freeze(['talent', '天赋']),
    Object.freeze(['appearance', '外貌']),
]);

/** 纳戒：主角标签、境界、金币、功法斗技与各清单，只读。 */
export function buildSelfPanel({ status, snapshot } = {}) {
    const profile = status?.profile ?? {};
    const realm = `${text(status?.realm?.realm)}${text(status?.realm?.stage)}`;
    // 各栏都带全量：主信息窗只摆前几条，右上角「全部」按同一个栏目弹副窗。
    const titles = [...(snapshot?.titles ?? [])];
    const martialItem = item => entry(
        `${item.name}${item.grade ? `（${item.grade}）` : ''}`,
        item.type,
        item.note,
    );
    const techniques = [...(snapshot?.techniques ?? [])];
    const skills = [...(snapshot?.skills ?? [])];
    const equipment = [...(snapshot?.equipment ?? [])];
    const treasures = [...(snapshot?.treasures ?? [])];
    const recipes = [...(snapshot?.recipes ?? [])];
    const items = [...(snapshot?.items ?? [])].sort((a, b) => (b.equipped === true) - (a.equipped === true) || b.count - a.count);
    const goals = [...(snapshot?.goals ?? [])].sort((a, b) => (a.done === true) - (b.done === true) || (a.priority === '主线' ? 0 : 1) - (b.priority === '主线' ? 0 : 1));
    const crafts = (snapshot?.crafts ?? []).filter(job => job.status === 'open');
    // 主角标签照账本九项全列（不过 capRows：空着也显示「暂无」，与纳戒面板对齐）；
    // 境界与各计数行走 capRows，空栏不占位。
    const rows = [
        ...SELF_PROFILE_ROWS.map(([field, label]) => row(label, profile[field])),
        ...capRows([
            row('境界', realm),
            row('金币', status?.gold !== undefined ? String(status.gold) : ''),
            row('称号', status?.titles ? `${status.titles} 个` : ''),
            row('功法 · 斗技', status?.techniques !== undefined ? `${status.techniques} · ${status.skills}` : ''),
            row('装备', status?.equipment !== undefined ? `${status.equipment} 件` : ''),
            row('天材地宝', status?.treasures !== undefined ? `${status.treasures} 件` : ''),
            row('行囊', status?.items !== undefined ? `${status.items} 件` : ''),
            row('炼丹 · 炼制中', status?.recipes !== undefined ? `${status.recipes} · ${status.crafting ?? 0}` : ''),
            row('进行中目标', status?.goals !== undefined ? `${status.goals} 个` : ''),
        ]),
    ];
    return {
        title: '纳戒', icon: '◉',
        summary: [`第 ${status?.day ?? '?'} 天`, text(profile.name) || '（未命名）', realm || '（无境界）'].filter(Boolean).join(' · '),
        rows,
        lists: [
            list('称号', '还没有称号。', titles.map(title => entry(title))),
            list('功法', '还没有修行的功法。', techniques.map(martialItem)),
            list('斗技', '还没有学会的斗技。', skills.map(martialItem)),
            list('装备', '还没有穿戴任何装备。', equipment.map(item => entry(
                `${item.name}${item.grade ? `（${item.grade}）` : ''}`,
                item.type, item.note,
            ))),
            list('天材地宝', '还没有天材地宝。', treasures.map(item => entry(
                `${item.name}${item.grade ? `（${item.grade}）` : ''}`,
                item.type, item.note,
            ))),
            list('行囊', '行囊空空如也。', items.map(item => entry(
                `${item.equipped ? '[装备中] ' : ''}${item.name}${item.grade ? `（${item.grade}）` : ''} ×${item.count}`,
                item.category, item.note,
            ))),
            list('炼丹', '还没有掌握丹方。', recipes.map(recipe => entry(
                `${recipe.name}${recipe.grade ? `（${recipe.grade}）` : ''}`,
                recipe.craft, recipe.note,
            ))),
            list('炼制中', '没有进行中的炼制。', crafts.map(job => {
                const overdue = job.endDay !== null && job.endDay !== undefined && job.endDay < (status?.day ?? 0);
                return entry(
                    `${job.craft || '炼制'}·${job.name}${job.count > 1 ? `×${job.count}` : ''}`,
                    [`第 ${job.startDay ?? '?'} 天开工`, job.endDay !== null && job.endDay !== undefined ? (overdue ? '已超期' : `剩 ${job.endDay - (status?.day ?? 0) + 1} 天`) : ''].filter(Boolean).join(' · '),
                    job.note,
                );
            })),
            list('目标', '还没有立下目标。', goals.map(goal => entry(
                `${goal.done ? '[已达成] ' : goal.priority === '主线' ? '★ ' : '· '}${goal.title || goal.text}`,
                [goal.due, goal.title && goal.text && goal.title !== goal.text ? goal.text : '', goal.source].filter(Boolean).join(' · '),
            ))),
        ],
    };
}

const FAVOR_SCALE = Object.freeze([
    Object.freeze({ min: -100, max: -60, label: '死敌' }),
    Object.freeze({ min: -59, max: -20, label: '敌意' }),
    Object.freeze({ min: -19, max: 0, label: '冷淡' }),
    Object.freeze({ min: 1, max: 20, label: '眼熟' }),
    Object.freeze({ min: 21, max: 45, label: '友善' }),
    Object.freeze({ min: 46, max: 70, label: '亲近' }),
    Object.freeze({ min: 71, max: 90, label: '信任' }),
    Object.freeze({ min: 91, max: 100, label: '生死之交' }),
]);

function favorLabel(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    for (const band of FAVOR_SCALE) if (number >= band.min && number <= band.max) return band.label;
    return number === 0 ? '冷淡' : '';
}

/** 人物簿：档案计数与人物一览，只读。 */
export function buildNpcPanel({ status, records } = {}) {
    // 人物簿的 list() 已经把“重要 / 最近活动”排前面，主窗取前几条就是最该看的几个人。
    const people = [...(records ?? [])];
    const rows = capRows([
        row('档案总数', status?.total !== undefined ? `${status.total} 人` : ''),
        row('在场', status?.present !== undefined ? `${status.present} 人` : ''),
        row('重要', status?.important !== undefined ? `${status.important} 人` : ''),
    ]);
    return {
        title: '人物簿', icon: '☰',
        summary: status?.total ? `记了 ${status.total} 人，在场 ${status.present} 人` : '还没有人物档案。',
        rows,
        lists: [list('人物一览', '还没有人物档案。正文里出现的人会记在这里。', people.map(record => entry(
            record.name,
            [`${favorLabel(record.favor)}（${Number(record.favor) || 0}）`, record.presence, record.importance].filter(Boolean).join(' · '),
            record.identity,
            ref('npc', record?.name),
        )))],
    };
}

/** 冷藏推进：勾选名单（带自行活动标签与近况）与待确认草稿，只读。 */
export function buildColdPanel({ status, records, lastFloor } = {}) {
    const selected = Array.isArray(status?.selected) ? status.selected : [];
    const pending = (status?.previews ?? []).filter(item => item.status === 'pending');
    const byName = new Map((Array.isArray(records) ? records : []).filter(record => record?.name).map(record => [record.name, record]));
    const rows = capRows([
        row('冷藏中', `${selected.length} 人`),
        row('待确认草稿', `${pending.length} 份`),
    ]);
    return {
        title: '冷藏推进', icon: '❄',
        summary: selected.length ? `${selected.length} 人在后台生活，${pending.length} 份草稿待确认。` : '还没有勾选冷藏人物。',
        rows,
        lists: [
            // 主栏目一行只放：名字＋标签（自行/新）＋@位置＋第N天；活动长内容点行弹小卡看「近况」。
            list('冷藏名单', '没有勾选冷藏人物。', selected.map(name => {
                const record = byName.get(name);
                const logEntries = Array.isArray(record?.log) ? record.log : [];
                const coldEntry = [...logEntries].reverse().find(item => item?.src === '冷藏') ?? null;
                const coldTouched = Array.isArray(record?.coldTouch?.fields) && record.coldTouch.fields.length;
                const latest = logEntries.at(-1) ?? null;
                const isNew = Boolean(coldEntry && Number.isInteger(coldEntry.floor) && Number.isInteger(lastFloor) && lastFloor - coldEntry.floor <= 1);
                const when = coldEntry?.day ?? latest?.day ?? null;
                return entry(
                    name,
                    [
                        coldEntry || coldTouched ? '自行' : '',
                        isNew ? '新' : '',
                        record?.location ? `@${record.location}` : '',
                        when !== null && when !== undefined ? `第${when}天` : '',
                    ].filter(Boolean).join(' · '),
                    undefined,
                    ref('npc', name),
                );
            })),
            list('待确认草稿', '没有待确认的草稿。', pending.map(item => entry(
                item.name, item.id, '', ref('cold', item?.id, { name: item?.name }),
            ))),
        ],
    };
}

const IMPACT_WEIGHT = Object.freeze({ world: '世界级', major: '大事', minor: '小事' });

/** 世界影响：账本计数与进行中的影响，只读。 */
export function buildImpactPanel({ status, records } = {}) {
    const active = [...(records ?? [])];
    const rows = capRows([
        row('记账日', status?.day !== undefined ? `第 ${status.day} 天` : ''),
        row('已对账到', status?.decidedFloor !== undefined ? `第 ${status.decidedFloor} 楼` : ''),
        row('进行中', status?.active !== undefined ? `${status.active} 条` : ''),
        row('待到期', status?.due !== undefined ? `${status.due} 条` : ''),
        row('已了结', status?.closed !== undefined ? `${status.closed} 条` : ''),
        row('档案', status?.archived !== undefined ? `${status.archived} 条` : ''),
    ]);
    return {
        title: '世界影响', icon: '⌁',
        summary: status?.total ? `账上 ${status.total} 条，进行中 ${status.active} 条。` : '影响账本是空的。',
        rows,
        lists: [list('进行中的影响', '没有进行中的影响。', active.map(record => entry(
            brief(record.title, 24),
            [`第 ${record.day} 天`, IMPACT_WEIGHT[record.weight] ?? '小事', record.target].filter(Boolean).join(' · '),
            '',
            ref('impact', record?.id ?? record?.title),
        )))],
    };
}

/** 原著资料：检索库与注入通道现状 + 最近一轮注入的条目，只读。 */
export function buildFactsPanel({ stats, worldbook, volume, lastInjection, entryName } = {}) {
    const inj = lastInjection && typeof lastInjection === 'object' ? lastInjection : null;
    const injTime = inj && Number.isFinite(inj.at) ? new Date(inj.at).toLocaleTimeString('zh-CN', { hour12: false }) : '';
    const injState = !inj ? ''
        : inj.status === 'failed' ? '注入失败'
        : inj.status === 'empty' ? '本轮未命中'
        : inj.status === 'injected' ? (inj.cleared ? '已清理' : '仍在提示词里')
        : '';
    const rows = capRows([
        row('世界书', worldbook, worldbook ? undefined : 'warn'),
        row('索引', stats?.total ? `${stats.total} 条` : '', stats?.total ? undefined : 'warn'),
        row('当前卷', volume?.label, volume?.label ? undefined : 'warn'),
        row('卷数', stats?.volumes ? `${Object.keys(stats.volumes).length} 卷` : ''),
        row('缺卷号', stats?.missingVolume !== undefined ? `${stats.missingVolume} 条` : ''),
    ]);
    const injRows = capRows([
        row('上次注入', inj ? `${inj.usedIds?.length ?? 0} 条 · ${inj.chars ?? 0} 字${injTime ? ` · ${injTime}` : ''}` : '', inj?.status === 'failed' ? 'warn' : undefined),
        row('状态', injState, inj?.status === 'failed' ? 'warn' : undefined),
    ]);
    const usedIds = Array.isArray(inj?.usedIds) ? inj.usedIds : [];
    return {
        title: '原著资料', icon: '▤',
        summary: inj?.status === 'injected'
            ? `上一轮注入了 ${usedIds.length} 条原著设定（${inj.chars ?? 0} 字）${inj.cleared ? '，已随生成结束清理。' : '。'}`
            : inj?.status === 'failed' ? '上一轮注入失败，详情见设置页。'
            : inj ? '上一轮没有挑中可注入的原著条目。'
            : stats?.total ? `索引 ${stats.total} 条，当前${volume?.label ?? '未定卷'}。` : '检索库是空的，先在设置里导入世界书。',
        rows: [...rows, ...injRows],
        lists: [list('注入的原著条目', '最近一轮没有注入原著条目。', usedIds.map(uid => entry(
            `#${uid} ${typeof entryName === 'function' ? (entryName(uid) || `#${uid}`) : `#${uid}`}`,
            '本轮进入正文提示词',
            '',
            ref('fact', uid),
        )))],
    };
}

/** 记忆存储：两层计数、记忆清单与「本轮已注入」区（仿原著资料的注入记录），只读。 */
export function buildMemoryPanel({ status, snapshot, lastInjection } = {}) {
    const byTier = status?.byTier ?? {};
    const all = [...(snapshot?.entries ?? [])];
    const rank = (a, b) => (b.weight === 'major') - (a.weight === 'major') || (b.day ?? 0) - (a.day ?? 0);
    const memoryItem = item => entry(
        // 主页面只放短标题（老数据没有 title 才回退截断正文）；全文在详情弹卡里。
        `${item.weight === 'major' ? '★ ' : ''}${item.title ? brief(item.title, 18) : brief(item.text, 24)}`,
        [`第 ${item.day ?? '?'} 天`, TAG_LABELS[item.tag] ?? ''].filter(Boolean).join(' · '),
        '',
        ref('memory', item?.id, { tier: item?.tier }),
    );
    const inj = lastInjection && typeof lastInjection === 'object' ? lastInjection : null;
    const injIds = Array.isArray(inj?.ids) ? inj.ids : [];
    const injTime = inj && Number.isFinite(inj.at) ? new Date(inj.at).toLocaleTimeString('zh-CN', { hour12: false }) : '';
    const injSource = inj?.source === 'recall' ? '召回决定' : inj?.source === 'keyword' ? '关键词兜底' : '';
    const injState = !inj ? ''
        : inj.status === 'empty' ? '本轮未注入'
        : inj.status === 'injected' ? (inj.cleared ? '已清理' : '仍在提示词里')
        : '';
    const rows = capRows([
        row('记忆总数', status?.total !== undefined ? `${status.total} 条` : ''),
        row('大记忆', byTier.big?.total !== undefined ? `${byTier.big.total} 条` : ''),
        row('小记忆', byTier.small?.total !== undefined ? `${byTier.small.total} 条` : ''),
        inj ? row('上次注入', `${injSource}${injSource ? ' · ' : ''}${injIds.length} 条 · ${inj.chars ?? 0} 字${injTime ? ` · ${injTime}` : ''}`) : null,
        injState ? row('注入状态', injState) : null,
    ].filter(Boolean));
    const injectedItems = (Array.isArray(inj?.entries) ? inj.entries : []).map(item => entry(
        `${item.weight === 'major' ? '★ ' : ''}${item.title ? brief(item.title, 18) : brief(item.text, 24)}`,
        [`第 ${item.day ?? '?'} 天`, '本轮已注入'].filter(Boolean).join(' · '),
        '',
        ref('memory', item?.id, { tier: item?.tier }),
    ));
    return {
        title: '记忆存储', icon: '✧',
        summary: inj?.status === 'injected'
            ? `本轮注入了 ${injIds.length} 条记忆（${injSource || '按需召回'}），${inj.cleared ? '已随生成结束清理。' : '仍在提示词里。'}`
            : inj?.status === 'empty' ? '本轮没有记忆进入正文提示词。'
            : status?.total ? `记着 ${status.total} 条记忆，大记忆 ${byTier.big?.total ?? 0} 条、小记忆 ${byTier.small?.total ?? 0} 条。` : '还没有记下任何记忆。',
        rows,
        lists: [
            list('已注入的记忆', '本轮没有记忆进入正文提示词。', injectedItems),
            list('大记忆', '还没有大记忆。', all.filter(entry => entry.tier === 'big').sort(rank).map(memoryItem)),
            list('小记忆', '还没有小记忆。', all.filter(entry => entry.tier === 'small').sort(rank).map(memoryItem)),
        ],
    };
}

const BRIDGE_LABELS = Object.freeze({ ready: '已连接', missing: '未检测到脚本', off: '已关闭', error: '异常' });

function shortTime(value) {
    if (typeof value !== 'string' || !value) return '';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

/** 数据镜像：数据库桥接与 MVU 同步的现状，只读。 */
export function buildMirrorPanel({ bridge, mvu } = {}) {
    const bridgeState = bridge?.status ? (BRIDGE_LABELS[bridge.status] ?? bridge.status) : '';
    const rows = capRows([
        row('数据库桥接', bridgeState, bridge?.status === 'error' || bridge?.status === 'missing' ? 'warn' : undefined),
        row('桥接表', bridge?.tables !== undefined && bridge?.enabled ? `${bridge.tables} 张` : ''),
        row('桥接说明', bridge?.message, bridge?.status === 'error' ? 'warn' : undefined),
        row('MVU 同步', mvu ? (mvu.present ? `已写入 ${mvu.namespace}` : '未检测到 MVU 主脚本') : ''),
        row('上次同步', shortTime(mvu?.lastSyncAt)),
        row('同步异常', mvu?.lastError, mvu?.lastError ? 'warn' : undefined),
    ]);
    return {
        title: '数据镜像', icon: '⇄',
        summary: bridgeState === '已连接' ? '纳戒与世界台账正在镜像到数据库表格。'
            : bridgeState === '已关闭' ? '数据库桥接已关闭，只走聊天存档。'
            : bridgeState === '未检测到脚本' ? '没找到数据库脚本，数据只走聊天存档。'
            : bridgeState === '异常' ? '数据库桥接出错了，数据仍在聊天存档里。'
            : '镜像状态还没有载入。',
        rows,
        lists: [],
    };
}

const JOURNAL_EVENTS = Object.freeze({
    task_start: '任务开始', stage_start: '阶段开始', stage_complete: '阶段完成', stage_failed: '阶段失败',
    task_cancelled: '任务取消', candidate_ready: '候选就绪', quality_rejected: '质量门拦截', narrative_rejected: '叙述门拦截',
    awaiting_message_evidence: '等消息确认', commit_complete: '提交完成', commit_uncertain: '提交存疑',
    npc_plan_reassessment_requested: 'NPC 计划重估', npc_plan_reassessment_duplicate: '重估重复', npc_plan_reassessment_blocked: '重估受阻',
    npc_plan_reassessment_cleared: '重估解除', npc_plan_candidates_invalidated: 'NPC 候选作废',
    narrative_candidates_invalidated: '正文候选作废', history_changed_after_commit: '提交后历史变动', history_candidate_invalidated: '历史候选作废',
    turn_mvu_arbitrate: '纳戒仲裁', turn_memory_decide: '记忆总结', turn_npc_record: '人物记账', turn_world_decision: '世界推进',
    turn_impact_decide: '影响记录', turn_settle_adjudicate: '行动结算', turn_facts_inject: '原著注入', turn_lite_settle: '总结算',
});
const JOURNAL_OUTCOMES = Object.freeze({
    completed: '完成', processing: '进行中', aborted: '中止', aborted_before_stage: '未开始就中止',
    achieved: '达成', not_achieved: '未达成', budget_exhausted: '预算耗尽', candidate_ready_not_committed: '候选未提交',
    awaiting_message_evidence: '等消息确认', quality_rejected: '被拦截', narrative_rejected: '被拦截',
    npc_plan_changed: '计划已变', npc_plan_changed_after_message: '计划已变', unapproved_setting_use: '未授权设定',
});

/** 运行日志：审计流水倒序看最近几条，只读。 */
export function buildJournalPanel({ records } = {}) {
    const recent = [...(Array.isArray(records) ? records : [])].reverse();
    const journalItem = record => entry(
        JOURNAL_EVENTS[record.event] ?? record.event,
        [JOURNAL_OUTCOMES[record.outcome] ?? record.outcome,
            record.stage ?? '',
            record.taskId ? `任务 ${record.taskId}` : '',
            shortTime(Number.isFinite(record.timestamp) ? new Date(record.timestamp).toISOString() : '')].filter(Boolean).join(' · '),
    );
    return {
        title: '运行日志', icon: '✎',
        summary: records?.length ? `审计流水记到 ${records.length} 条，最近的最上面。` : '还没有运行流水。跑过回合后这里会有记录。',
        rows: [],
        lists: [list('最近流水', '还没有运行流水。跑过回合后这里会有记录。', recent.map(journalItem))],
    };
}

/** 开放世界：本局口径，只读。 */
export function buildSandboxPanel({ read } = {}) {
    if (!read || read.status !== 'ready') {
        return {
            title: '开放世界', icon: '◈',
            summary: '本局还没有口径记录，进入对话后建立。',
            rows: [], lists: [],
        };
    }
    const last = Array.isArray(read.history) ? read.history.at(-1) : null;
    const rows = capRows([
        row('本局口径', read.mode === 'sandbox' ? '开放世界' : read.mode === 'mainline' ? '主线' : ''),
        row('惯性', read.inertia),
        row('原著角色自主', read.canonCharactersAutonomous === false ? '否' : '是'),
        row('口径切换', last ? `共 ${read.history.length} 次，最近 ${last.from === 'sandbox' ? '开放世界' : '主线'} → ${last.to === 'sandbox' ? '开放世界' : '主线'}` : '本局没切过'),
    ]);
    return {
        title: '开放世界', icon: '◈',
        summary: read.mode === 'sandbox' ? '本局按开放世界口径运行。' : '本局按主线口径运行。',
        rows,
        lists: [],
    };
}

/** 总控窗常驻的调用渠道：每轮生成前后基本都会跑的模型调用，按一轮里的发生顺序排。 */
/** 每个仪表盘模块自己名下的调用渠道：标记直接标在模块行尾，一眼看清哪路没调/在调。 */
/** 每个仪表盘模块自己名下的调用渠道：标记直接标在模块行尾，一眼看清哪路没调/在调。
 *  key 是调用流水里的登记标签（markOf 靠它对号）；short 是行尾多个记号并排时的短名，
 *  行尾只挂一个记号时不显示文字，悬停标题里始终是全名。 */
const MODULE_CHANNELS = Object.freeze({
    // 原著设定每轮的真实调用是选条员，登记标签是「事实检索」（facts-select 调 complete 时不报标签，
    // 由 index.js 兜底命名）；「场记挑选」其实是世界影响的注入挑选员，挂在影响行。
    facts: [{ key: '事实检索', short: '选条' }],
    action: [{ key: '行动结算', short: '判定' }],
    memory: [{ key: '记忆召回', short: '召回' }, { key: '记忆决定', short: '决定' }],
    world: [{ key: '世界决定', short: '决定' }],
    npc: [{ key: '人物记录', short: '记录' }],
    self: [{ key: '纳戒决定', short: '决定' }],
    impact: [{ key: '场记挑选', short: '挑选' }, { key: '影响决定', short: '决定' }],
});

/** 简略版总控不按模块拼行：直接铺两条合并调用；行内说明随各功能开关动态增减分路。 */
const LITE_OVERVIEW_ROWS = Object.freeze([
    Object.freeze({ label: '素材总挑选', kind: 'pick', all: '原著／影响／记忆', emptyText: '生成前 · 三路全关，本轮不挑' }),
    Object.freeze({ label: '行动结算', kind: 'action', all: '生成前 · 行动判定独立调用', emptyText: '已关闭，本轮不判定' }),
    Object.freeze({ label: '总结算', kind: 'settle', all: '人物／世界／影响／纳戒／记忆', emptyText: '生成后 · 五账全关，本轮不记' }),
]);

/**
 * 调用标记的数据面：在途转圈、最近一次 ✓ / ✗、没调过「无」。
 * 渠道之外的调用（档案抄录/记忆总结/冷藏推进/经历精简…）不进行列展示——在途的由
 * 摘要行「正在调用」播报，完结的结果在各自面板的状态行里看。
 */
function buildMarkOf({ calls, active }) {
    const log = Array.isArray(calls) ? calls : [];
    const inFlight = Array.isArray(active) ? active.filter(item => typeof item === 'string' && item) : [];
    const byLabel = new Map();
    for (const item of log) {
        const key = typeof item?.label === 'string' && item.label ? item.label : '未标注调用';
        if (!byLabel.has(key)) byLabel.set(key, []);
        byLabel.get(key).push(item);
    }
    return label => {
        if (inFlight.includes(label)) return { label, status: 'running', detail: '调用中' };
        const list = byLabel.get(label);
        if (!list?.length) return { label, status: 'none', detail: '未调用' };
        const last = list.at(-1);
        const time = typeof last?.at === 'string' ? new Date(last.at).toLocaleTimeString() : '';
        if (last?.ok === true) return { label, status: 'ok', detail: time };
        return { label, status: 'failed', detail: `${last?.error || '失败'}（${time}）` };
    };
}

function buildModuleMarks({ modules, calls, active }) {
    const markOf = buildMarkOf({ calls, active });
    const marks = new Map();
    for (const module of modules) {
        const channels = MODULE_CHANNELS[module?.id];
        if (Array.isArray(channels) && channels.length) {
            marks.set(module.id, channels.map(channel => {
                // 渠道兼容两种写法：旧式纯标签字符串，或 { key, short }（行尾多记号并排时用短名）。
                const key = typeof channel === 'string' ? channel : channel?.key;
                const mark = markOf(key);
                const short = typeof channel === 'object' && channel?.short ? channel.short : undefined;
                return short ? { ...mark, short } : mark;
            }));
        }
    }
    return marks;
}

/** 总控：完整版按各模块开关铺行、行尾挂自己渠道的实时标记；简略版固定三行，行的分路清单跟着各功能开关变。 */
export function buildOverviewPanel({ dashboard, calls, active, mode, litePickParts, liteSettleParts } = {}) {
    const inFlight = Array.isArray(active) ? active.filter(item => typeof item === 'string' && item) : [];
    const running = inFlight.length ? ` · 正在调用：${inFlight.join('、')}` : '';
    if (mode === 'lite') {
        const markOf = buildMarkOf({ calls, active });
        const pickParts = Array.isArray(litePickParts) ? litePickParts : null;
        const settleParts = Array.isArray(liteSettleParts) ? liteSettleParts : null;
        const actionOn = (Array.isArray(dashboard?.modules) ? dashboard.modules : []).find(module => module?.id === 'action')?.enabled === true;
        const rows = LITE_OVERVIEW_ROWS.map(row => {
            if (row.kind === 'action') {
                return { label: row.label, value: actionOn ? row.all : row.emptyText, marks: actionOn ? [markOf(row.label)] : [] };
            }
            const parts = row.kind === 'pick' ? pickParts : settleParts;
            const alive = parts === null || parts.length > 0;
            const shown = parts === null ? row.all : parts.join('／');
            return {
                label: row.label,
                value: alive ? `生成${row.kind === 'pick' ? '前' : '后'} · ${shown}${row.kind === 'pick' ? '一次挑完' : '一次记完'}` : row.emptyText,
                marks: alive ? [markOf(row.label)] : [],
            };
        });
        return {
            title: '总控', icon: '⌂',
            summary: dashboard
                ? `总控已开启 · 简略版${running} · 最近任务：${dashboard.taskLabel ?? '暂无任务'}`
                : '总控状态还没有载入。',
            rows: capRows(rows, 24),
            lists: [],
        };
    }
    const modules = Array.isArray(dashboard?.modules) ? dashboard.modules : [];
    const marks = buildModuleMarks({ modules, calls, active });
    const rows = modules.map(module => ({
        label: module.title,
        // 「暂无记录」这类旧管线状态不死不活，没跑过就只报开关状态。
        value: module.state === 'idle' ? module.configuration : `${module.configuration} · ${module.label}`,
        // 已关闭的模块标记为空数组：不显示记号，但槽位占着，「已开启」列才能对齐。
        marks: module.enabled === false ? [] : (marks.get(module.id) ?? []),
    }));
    return {
        title: '总控', icon: '⌂',
        summary: dashboard
            ? `总控${dashboard.enabled ? '已开启' : '已暂停'}${running} · 最近任务：${dashboard.taskLabel ?? '暂无任务'}`
            : '总控状态还没有载入。',
        rows: capRows(rows, 24),
        lists: [],
    };
}

const SETTLE_STATUS_LABELS = Object.freeze({
    pending: '等待判定', injected: '判定已注入', preview: '仅预览，未注入',
    write_failed: '注入写入失败', error: '判定失败', stale: '判定已过期',
    disabled: '行动结算已关闭', none: '本轮没有可结算的行动',
    no_input: '没有行动输入', busy: '判定忙碌中', unsupported: '当前环境不支持结算',
});
const SETTLE_ACTION_LABELS = Object.freeze({
    success: '成功', partial: '部分成功', failure: '失败',
    insufficient: '依据不足', not_executed: '未执行',
});
const SETTLE_RECONCILIATION_LABELS = Object.freeze({
    pending: '待对账，未确认落账', matched: '对账一致',
    mismatch: '对账不一致', not_applicable: '无需对账',
});
const settleArray = value => Array.isArray(value) ? value.filter(Boolean) : [];

/** 候选变化与对账差异共用的纯文本值；不把物品对象折成 [object Object]。 */
function settleValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'string') return text(value);
    if (!value || typeof value !== 'object') return '';
    return [text(value.name), text(value.category), text(value.itemId),
        typeof value.count === 'number' ? `数量 ${value.count}` : '',
        typeof value.value === 'number' ? String(value.value) : text(value.value)].filter(Boolean).join(' · ');
}

function settleField(item) {
    const key = text(item?.field).replace(/^player\./, '');
    const inventory = /^inventory\..+\.(count|name|category)$/.exec(key);
    const field = SETTLE_FIELD_LABELS[key] ?? (inventory ? `物品${{ count: '数量', name: '名称', category: '类别' }[inventory[1]]}` : key === 'items' ? '物品' : key || '变化');
    return [field, text(item?.name), text(item?.category), text(item?.itemId)].filter(Boolean).join(' · ');
}

function settleEffectItems(effects) {
    return settleArray(effects).map(item => {
        const value = settleValue(item.value) || '未提供';
        const change = item.type === 'set' ? `→ ${value}` : item.type === 'remove' ? `移除 ${value}`
            : `${typeof item.value === 'number' && item.value >= 0 ? '+' : ''}${value}`;
        return entry(`${settleField(item)} ${change}`, '可比对变化 · 判定候选，未确认落账', text(item.reason));
    });
}

function settleRejectedItems(rejected) {
    return settleArray(rejected).map(item => {
        const reason = typeof item === 'string' ? text(item) : text(item.reason);
        return entry(`拒收 · ${brief(reason, 30) || '未提供原因'}`, '', reason);
    });
}

function settleDifference(item) {
    if (typeof item === 'string') return text(item);
    const expected = item?.expected === null ? '未知' : settleValue(item?.expected);
    const actual = item?.actual === null ? '未知' : settleValue(item?.actual);
    return [settleField(item), expected ? `预期 ${expected}` : '', actual ? `实际 ${actual}` : '',
        text(item?.label), text(item?.reason) || text(item?.message)].filter(Boolean).join(' · ');
}

/** 行动结算只读：v2 只取审核后的 actions，绝不回退到顶层模型原文或把注入当落账。 */
export function buildSettlePanel({ lastAdjudication } = {}) {
    const record = lastAdjudication && typeof lastAdjudication === 'object' && !Array.isArray(lastAdjudication) ? lastAdjudication : null;
    if (!record) return {
        title: '行动结算', icon: '⚖',
        summary: '还没有判定过。生成前判定员会直判这一轮的行动结果并注入正文提示词。',
        rows: [], lists: [list('本轮变化', '没有数值变化。', [])],
    };
    const multi = Array.isArray(record.actions);
    const actions = settleArray(record.actions);
    const label = SETTLE_CATEGORY_LABELS[record.category] ?? '行动判定';
    const state = SETTLE_STATUS_LABELS[record.status] ?? '判定状态未明';
    const warning = ['write_failed', 'error', 'stale', 'unsupported'].includes(record.status);
    // cleared 只说明提示词通道清理，不覆盖失败、过期、预览等判定状态。
    const channel = record.cleared ? '已随生成结束清理'
        : record.status === 'injected' ? '仍在提示词里' : '未确认有有效注入';
    const reconciliation = SETTLE_RECONCILIATION_LABELS[record.reconciliation?.status] ?? '未记录对账，未确认落账';
    const effects = multi ? actions.flatMap(action => settleArray(action.effects)) : settleArray(record.effects);
    const rejected = multi ? actions.flatMap(action => settleArray(action.rejected)) : settleArray(record.rejected);
    const time = Number.isFinite(record.at) ? new Date(record.at).toLocaleTimeString('zh-CN', { hour12: false }) : '';
    const rows = capRows([
        row('状态', state, warning ? 'warn' : undefined),
        multi ? row('行动', `${actions.length} 项`) : row('判定类别', label),
        ...(!multi ? [row('结果', brief(record.outcome, 30) || '（无）'), row('判定理由', brief(record.note, 30))] : []),
        row('数值变化', `${effects.length} 条判定候选${rejected.length ? `（另有 ${rejected.length} 条被脚本拦下）` : ''}，未确认落账`),
        row('对账', reconciliation, record.reconciliation?.status === 'mismatch' ? 'warn' : undefined),
        row('注入通道', channel), row('时间', time),
    ]);
    const lists = multi ? actions.map((action, index) => {
        const actionState = SETTLE_ACTION_LABELS[action.status] ?? '行动状态未明';
        const review = action.approved === true ? '审核通过' : action.approved === false ? '审核拒收' : '未记录审核状态';
        const blocked = text(action.blockedReason);
        const title = action.approved === false ? `${SETTLE_CATEGORY_LABELS[action.category] ?? '行动判定'} · 未通过复核`
            : text(action.label) || SETTLE_CATEGORY_LABELS[action.category] || '行动判定';
        return list(`${index + 1}. ${title}`, '暂无行动详情。', [
            entry('行动状态', [actionState, review, SETTLE_CATEGORY_LABELS[action.category] ?? '行动判定'].join(' · '), action.approved === false ? '' : text(action.evidence)),
            entry('结果', '', text(action.outcome) || '（无）'),
            ...settleArray(action.consequences).map(consequence => entry('文字后果', '', text(consequence))),
            ...settleEffectItems(action.effects),
            ...settleRejectedItems(action.rejected),
            ...(blocked ? [entry('拒收原因', '', blocked)] : []),
        ]);
    }) : [
        list('本轮变化', '没有数值变化。', settleEffectItems(effects)),
        ...(rejected.length ? [list('被脚本拦下', '', settleRejectedItems(rejected))] : []),
    ];
    if (multi && !actions.length) lists.push(list('本轮行动', '没有审核后的行动记录。', []));
    const differences = settleArray(record.reconciliation?.differences);
    if (differences.length) lists.push(list('对账差异', '', differences.map(item => entry('差异', '', settleDifference(item)))));
    return {
        title: '行动结算', icon: '⚖',
        summary: record.status === 'unsupported' ? `当前环境不支持结算：${brief(record.summary, 40) || '沙盒口径下行动结算不参与，切回正式口径后恢复'}`
            : multi ? `${state} · ${actions.length} 项行动 · ${channel}。`
            : record.status === 'error' ? `上次判定失败：${brief(record.summary, 40)}`
            : record.status === 'none' ? '本轮没有可结算的行动。'
            : `${state}（${label}）：${brief(record.outcome, 40)} · ${channel}。`,
        rows, lists,
    };
}

/** 一次折好十二个信息窗；输入缺哪块，哪个窗就是“暂无”状态。每个功能各吃各的输入包，互不撞字段。 */
export function buildOrbPanels(input = {}) {
    return {
        overview: buildOverviewPanel(input),
        world: buildWorldPanel(input.world),
        self: buildSelfPanel(input.self),
        memory: buildMemoryPanel(input.memory),
        npcledger: buildNpcPanel(input.npcledger),
        cold: buildColdPanel(input.cold),
        impact: buildImpactPanel(input.impact),
        facts: buildFactsPanel(input.facts),
        settle: buildSettlePanel(input.settle),
        mirror: buildMirrorPanel(input.mirror),
        journal: buildJournalPanel(input.journal),
        sandbox: buildSandboxPanel(input.sandbox),
    };
}
