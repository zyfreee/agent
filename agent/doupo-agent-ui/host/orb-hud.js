/**
 * 悬浮球：屏幕边上一颗小球，点一下竖直拉长成一根胶囊长条，条上从上到下
 * 排着 Agent 各功能的图标；点图标弹出对应功能的“只读信息窗”。
 *
 * 这个模块只管纯逻辑：图标清单、展开/收起的状态机、以及把各运行时的
 * 现状折成信息窗要显示的行与条目。DOM 结构、动画与挂载在 index.js，
 * 这里不碰 document，全部输入都可能是 undefined——没接上的功能显示“暂无”。
 */

/** 长条上从上到下的图标（球帽下面第一格就是第一项）。 */
export const ORB_ITEMS = Object.freeze([
    Object.freeze({ id: 'overview', icon: '⌂', title: '总控', hint: '模块开关与最近任务' }),
    Object.freeze({ id: 'world', icon: '◌', title: '世界运转', hint: '时间、地点与事件' }),
    Object.freeze({ id: 'self', icon: '◉', title: '纳戒', hint: '主角自身与随身之物' }),
    Object.freeze({ id: 'npcledger', icon: '☰', title: '人物簿', hint: '人物档案与好感' }),
    Object.freeze({ id: 'cold', icon: '❄', title: '冷藏推进', hint: '后台人物的推进记录' }),
    Object.freeze({ id: 'impact', icon: '⌁', title: '世界影响', hint: '世界被改成了什么样' }),
    Object.freeze({ id: 'facts', icon: '▤', title: '原著资料', hint: '设定库与注入通道' }),
    Object.freeze({ id: 'sandbox', icon: '◈', title: '沙盒模式', hint: '本局的口径与惯性' }),
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
const LIST_CAP = 8;
const ROW_CAP = 10;

function text(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function row(label, value, tone) {
    return { label, value: text(value) || EMPTY, ...(tone ? { tone } : {}) };
}

function entry(head, meta, detail) {
    return { head: text(head), ...(text(meta) ? { meta: text(meta) } : {}), ...(text(detail) ? { detail: text(detail) } : {}) };
}

function clip(items, cap = LIST_CAP) {
    return (Array.isArray(items) ? items.filter(Boolean) : []).slice(0, cap);
}

function list(heading, empty, items) {
    return { heading, empty, items };
}

function capRows(rows) {
    return rows.filter(item => item.value !== EMPTY || item.tone).slice(0, ROW_CAP);
}

/** 世界运转：时钟、五个信息字段、双栏事件与任务，只读。 */
export function buildWorldPanel({ status, snapshot, clockText } = {}) {
    const info = status?.info ?? {};
    const rows = [row('时钟', clockText)];
    for (const [field, label] of [['era', '时期'], ['location', '所在地'], ['weather', '天气'], ['reputation', '名声'], ['wanted', '通缉度']]) {
        rows.push(row(label, info[field]));
    }
    const today = status?.clock?.day ?? 1;
    const eventItem = event => entry(
        event.text,
        [`第 ${event.day} 天`, event.weight === 'rumor' ? '传闻' : event.weight === 'major' ? '大事' : '',
            event.pinned ? '置顶' : '', remainingDays(event.endDay, today)].filter(Boolean).join(' · '),
        event.basis,
    );
    const near = clip((snapshot?.nearEvents ?? []).filter(event => !event.done));
    const world = clip((snapshot?.worldEvents ?? []).filter(event => !event.done));
    const taskItem = task => {
        const overdue = task.status !== 'done' && task.endDay !== null && task.endDay !== undefined && task.endDay < today;
        return entry(
            task.title,
            [task.status === 'done' ? `已完成${task.doneDay ? `于第 ${task.doneDay} 天` : ''}` : overdue ? '已逾期' : remainingDays(task.endDay, today),
                `第 ${task.day} 天接`].filter(Boolean).join(' · '),
            [task.detail, text(task.basis) ? `来源：${task.basis}` : ''].filter(Boolean).join('\n'),
        );
    };
    const tasks = clip([...(snapshot?.tasks ?? [])].sort((a, b) => rankTask(a, today) - rankTask(b, today)), 6);
    return {
        title: '世界运转', icon: '◌',
        summary: clockText || EMPTY,
        rows: capRows(rows),
        lists: [
            list('附近事件', '附近没有进行中的事件。', near.map(eventItem)),
            list('世界大事', '暂无进行中的世界大事。', world.map(eventItem)),
            list('任务', '没有立下的任务。', tasks.map(taskItem)),
        ],
    };
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

/** 纳戒：身份、境界、金币与各清单计数，只读。 */
export function buildSelfPanel({ status, snapshot } = {}) {
    const profile = status?.profile ?? {};
    const realm = `${text(status?.realm?.realm)}${text(status?.realm?.stage)}`;
    const titles = clip(snapshot?.titles ?? []);
    const items = clip([...(snapshot?.items ?? [])].sort((a, b) => (b.equipped === true) - (a.equipped === true) || b.count - a.count));
    const goals = clip([...(snapshot?.goals ?? [])].sort((a, b) => (a.done === true) - (b.done === true) || (a.priority === '主线' ? 0 : 1) - (b.priority === '主线' ? 0 : 1)), 6);
    const crafts = clip((snapshot?.crafts ?? []).filter(job => job.status === 'open'), 4);
    const rows = capRows([
        row('姓名', profile.name),
        row('性别 · 年龄', [profile.gender, profile.age].filter(Boolean).join(' · ')),
        row('境界', realm),
        row('金币', status?.gold !== undefined ? String(status.gold) : ''),
        row('称号', status?.titles ? `${status.titles} 个` : ''),
        row('功法 · 斗技', status?.techniques !== undefined ? `${status.techniques} · ${status.skills}` : ''),
        row('行囊', status?.items !== undefined ? `${status.items} 件（装备中 ${status.equipped ?? 0}）` : ''),
        row('配方 · 炼制中', status?.recipes !== undefined ? `${status.recipes} · ${status.crafting ?? 0}` : ''),
        row('进行中目标', status?.goals !== undefined ? `${status.goals} 个` : ''),
    ]);
    return {
        title: '纳戒', icon: '◉',
        summary: [`第 ${status?.day ?? '?'} 天`, text(profile.name) || '（未命名）', realm || '（无境界）'].filter(Boolean).join(' · '),
        rows,
        lists: [
            list('称号', '还没有称号。', titles.map(title => entry(title))),
            list('行囊', '行囊空空如也。', items.map(item => entry(
                `${item.equipped ? '[装备中] ' : ''}${item.name}${item.grade ? `（${item.grade}）` : ''} ×${item.count}`,
                item.category, item.note,
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
                `${goal.done ? '[已达成] ' : goal.priority === '主线' ? '★ ' : '· '}${goal.text}`,
                [goal.due, goal.source].filter(Boolean).join(' · '),
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
    const people = clip(records ?? [], 10);
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
        )))],
    };
}

/** 冷藏推进：勾选名单与待确认草稿，只读。 */
export function buildColdPanel({ status } = {}) {
    const selected = Array.isArray(status?.selected) ? status.selected : [];
    const pending = (status?.previews ?? []).filter(item => item.status === 'pending');
    const rows = capRows([
        row('冷藏中', `${selected.length} 人`),
        row('待确认草稿', `${pending.length} 份`),
    ]);
    return {
        title: '冷藏推进', icon: '❄',
        summary: selected.length ? `${selected.length} 人在后台生活，${pending.length} 份草稿待确认。` : '还没有勾选冷藏人物。',
        rows,
        lists: [
            list('冷藏名单', '没有勾选冷藏人物。', clip(selected, 12).map(name => entry(name))),
            list('待确认草稿', '没有待确认的草稿。', clip(pending).map(item => entry(
                item.name, item.id, text(item.note),
            ))),
        ],
    };
}

const IMPACT_WEIGHT = Object.freeze({ world: '世界级', major: '大事', minor: '小事' });

/** 世界影响：账本计数与进行中的影响，只读。 */
export function buildImpactPanel({ status, records } = {}) {
    const active = clip(records ?? [], 6);
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
            record.title,
            [`第 ${record.day} 天`, IMPACT_WEIGHT[record.weight] ?? '小事', record.target].filter(Boolean).join(' · '),
            record.detail,
        )))],
    };
}

/** 原著资料：检索库与注入通道现状，只读。 */
export function buildFactsPanel({ stats, worldbook, volume } = {}) {
    const rows = capRows([
        row('世界书', worldbook, worldbook ? undefined : 'warn'),
        row('索引', stats?.total ? `${stats.total} 条` : '', stats?.total ? undefined : 'warn'),
        row('当前卷', volume?.label, volume?.label ? undefined : 'warn'),
        row('卷数', stats?.volumes ? `${Object.keys(stats.volumes).length} 卷` : ''),
        row('缺卷号', stats?.missingVolume !== undefined ? `${stats.missingVolume} 条` : ''),
    ]);
    return {
        title: '原著资料', icon: '▤',
        summary: stats?.total ? `索引 ${stats.total} 条，当前${volume?.label ?? '未定卷'}。` : '检索库是空的，先在设置里导入世界书。',
        rows,
        lists: [],
    };
}

/** 沙盒模式：本局口径，只读。 */
export function buildSandboxPanel({ read } = {}) {
    if (!read || read.status !== 'ready') {
        return {
            title: '沙盒模式', icon: '◈',
            summary: '本局还没有口径记录，进入对话后建立。',
            rows: [], lists: [],
        };
    }
    const last = Array.isArray(read.history) ? read.history.at(-1) : null;
    const rows = capRows([
        row('本局口径', read.mode === 'sandbox' ? '沙盒' : read.mode === 'mainline' ? '主线' : ''),
        row('惯性', read.inertia),
        row('原著角色自主', read.canonCharactersAutonomous === false ? '否' : '是'),
        row('口径切换', last ? `共 ${read.history.length} 次，最近 ${last.from === 'sandbox' ? '沙盒' : '主线'} → ${last.to === 'sandbox' ? '沙盒' : '主线'}` : '本局没切过'),
    ]);
    return {
        title: '沙盒模式', icon: '◈',
        summary: read.mode === 'sandbox' ? '本局按沙盒口径运行。' : '本局按主线口径运行。',
        rows,
        lists: [],
    };
}

/** 总控：各模块开关与最近运行记录，只读。 */
export function buildOverviewPanel({ dashboard } = {}) {
    const modules = Array.isArray(dashboard?.modules) ? dashboard.modules : [];
    return {
        title: '总控', icon: '⌂',
        summary: dashboard ? `总控${dashboard.enabled ? '已开启' : '已暂停'} · 最近任务：${dashboard.taskLabel ?? '暂无任务'}` : '总控状态还没有载入。',
        rows: capRows(modules.map(module => row(module.title, `${module.configuration} · ${module.label}`))),
        lists: [],
    };
}

/** 一次折好八个信息窗；输入缺哪块，哪个窗就是“暂无”状态。每个功能各吃各的输入包，互不撞字段。 */
export function buildOrbPanels(input = {}) {
    return {
        overview: buildOverviewPanel(input),
        world: buildWorldPanel(input.world),
        self: buildSelfPanel(input.self),
        npcledger: buildNpcPanel(input.npcledger),
        cold: buildColdPanel(input.cold),
        impact: buildImpactPanel(input.impact),
        facts: buildFactsPanel(input.facts),
        sandbox: buildSandboxPanel(input.sandbox),
    };
}
