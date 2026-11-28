/**
 * 世界影响的"发酵执行器"：影响一旦发酵，就把它推成世界上真实发生的事，而不是只换一个状态标签。
 *
 * 分工：
 * - 模型（记录员）只决定"这件事该落成什么后果"，写进 effects；
 * - 脚本（这里）负责"什么时候落、落到谁头上、落成哪条世界事件"，并且幂等——同一条影响只推一次；
 * - 世界台账（world-runtime）拿到 addEvent/setInfo/setFaction，之后世界注入、冷藏人物推进、
 *   消息风闻官都会自然读到，影响才算真的进了世界。
 *
 * 没有 effects 的影响也不烂在账上：涟漪/蝴蝶按分量给一条默认世界事件，直接改变世界级的影响也给。
 */

/** 世界台账的事件分量只有 minor/major/rumor：世界级影响落到事件上按 major 记。 */
export function worldWeightOf(weight) {
    return weight === 'world' ? 'major' : (weight === 'major' || weight === 'rumor' ? weight : 'minor');
}

/** 回响痕迹里的短注记：只留一句能读的话，超长截断，别把整段账本摘抄塞进档案。 */
function briefNote(value, cap = 80) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    return text.length > cap ? `${text.slice(0, cap - 1)}…` : text;
}

/**
 * 落成事件以短标记「影响#i6」为依据：世界台账会截断 basis（40 字上限），
 * 长编号在里面认不回来，删影响时就没法把事件一起撤掉。
 */
export function impactBasis(record) {
    const id = String(record?.id ?? '').replace(/^#/, '');
    return `影响#${id}`;
}

/**
 * 判定一段文本是不是在说某条影响：短标记「影响#i6」为主，兼容旧的「世界影响 i6」写法。
 * 匹配必须带编号边界——影响编号是 i1、i12、i100 递增，裸 includes 会让 i1 认领 i12 的一切
 * （'影响#i12'.includes('影响#i1') === true），一局超过 10 条影响后回响统计和落成回收全会错账。
 * 边界规则：编号后面不能紧跟字母或数字（中文标点、括号、句尾都算边界）。
 */
export function impactMarkHits(value, id) {
    const marked = String(id ?? '').replace(/^#/, '');
    if (!marked) return false;
    const body = String(value ?? '');
    if (!body) return false;
    const escaped = marked.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`影响\\s*[#＃]\\s*${escaped}(?![0-9A-Za-z])|世界影响\\s+${escaped}(?![0-9A-Za-z])`).test(body);
}

/** 判定一条世界事件是不是某个影响落成的：先看短标记，再兼容旧的「世界影响 X」写法。 */
export function basisMatchesImpact(basis, record) {
    return impactMarkHits(basis, String(record?.id ?? ''));
}

/**
 * 默认后果：从影响本身推一条世界事件；参与人取人物 links，没有就拿对象顶上。
 * 直接发生在世界上、并且牵了势力/地方的影响，就算玩家只记了一条没写后果，
 * 也按"这个势力/地方在别处被提起"补一条事件——记录员本来就是往世界里记账的。
 */
export function defaultEventOf(record) {
    const persons = (Array.isArray(record?.links) ? record.links : [])
        .filter(link => link.type === 'person')
        .map(link => link.name)
        .filter(Boolean);
    if (record?.target && !persons.includes(record.target)) persons.push(record.target);
    return {
        type: 'event',
        title: String(record?.title ?? '').slice(0, 30),
        text: String(record?.detail || record?.resolution || record?.title || '').slice(0, 120),
        scope: record?.weight === 'world' ? 'world' : 'near',
        participants: persons.slice(0, 3),
    };
}

/** 这条影响适不适合在没有写后果时补一条默认世界事件。 */
export function shouldDefaultEvent(record) {
    if (!record) return false;
    if (!Array.isArray(record.effects) || record.effects.length === 0) {
        if (record.kind !== 'direct' || record.weight === 'world') return true;
        return (Array.isArray(record.links) ? record.links : []).length > 0;
    }
    return false;
}

/**
 * 把一条影响翻译成世界台账操作；没有可落地的后果就返回空数组。
 * factionNames 传入时只认台账里已有的势力：记录员/玩家写错名字不能凭空造一个势力出来，
 * 该条 effect 跳过并写进 warnings，让面板和状态能说清"这条没落成"。
 */
export function buildWorldOps(record, { withDefaultEvent = true, factionNames = null, factionList = null, npcNames = null, warnings = null, plot = null } = {}) {
    // 压成传闻的影响：落成时不点名、只记“风闻”，世界里按 rumor 分量走，NPC 听到的是风声不是事实。
    const rumor = record?.certainty === 'rumor';
    const rumorize = (body) => (rumor ? `（风闻）${body}` : body);
    // 牵涉的剧情线：落成时按影响编号推到那条线索上（有到期日就提前，没到期日就补一句进展）。
    const threadLinks = (Array.isArray(record?.links) ? record.links : []).filter(link => link.type === 'thread' && link.name);
    // 记录员不说立场时（这是常态：他常只写一句动向），保留台账里现有的立场，别被 setFaction 的兜底压成 neutral。
    const stanceOf = (name) => (Array.isArray(factionList) ? (factionList.find(item => item?.name === name)?.stance ?? '') : '');
    const ops = [];
    // 动到人的后果：不写成世界台账 op，交给人物簿落账（好感/态度/称呼各走它自己的闸）。
    // 这里只做“名字必须在人物簿里”这一道核对——不凭空给没出现过的人建档。
    const npcTouches = [];
    // 动玩家自己的账（金币/行囊/境界）：也不写成世界台账 op，交给纳戒落账——
    // 纳戒那边有自己的上限与流水，这里只负责把后果翻译成纳戒认得的操作。
    const selfTouches = [];
    const effects = Array.isArray(record?.effects) ? record.effects : [];
    for (const effect of effects) {
        if (effect.type === 'self') {
            selfTouches.push({ ...effect, basis: impactBasis(record) });
            continue;
        }
        if (effect.type === 'npc') {
            const known = Array.isArray(npcNames) ? npcNames.map(item => String(item)) : null;
            if (known && !known.includes(effect.name)) {
                if (Array.isArray(warnings)) warnings.push(`人物「${effect.name}」不在人物簿里，已跳过这条人物后果（不凭空建档）`);
                continue;
            }
            npcTouches.push({ ...effect, basis: impactBasis(record) });
            continue;
        }
        if (effect.type === 'event') {
            ops.push({
                op: 'addEvent',
                scope: effect.scope === 'world' ? 'world' : 'near',
                title: effect.title || record.title,
                text: rumorize(effect.text || record.detail || record.title),
                participants: rumor ? [] : (effect.participants ?? []),
                weight: rumor ? 'rumor' : worldWeightOf(record.weight),
                basis: impactBasis(record),
            });
        } else if (effect.type === 'info') {
            ops.push({ op: 'setInfo', field: effect.field, text: effect.value });
        } else if (effect.type === 'faction') {
            const known = Array.isArray(factionList) ? factionList.map(item => item.name) : factionNames;
            const isKnown = Array.isArray(known) ? known.includes(effect.name) : false;
            // 覆灭一个台账里没有的势力＝编造，拦下；新建必须模型明写 founded:true（防止写错名凭空造势力）。
            if (effect.dissolved === true && Array.isArray(known) && !isKnown) {
                if (Array.isArray(warnings)) warnings.push(`势力「${effect.name}」不在台账里，无法标记覆灭`);
                continue;
            }
            if (effect.founded !== true && Array.isArray(known) && !isKnown) {
                if (Array.isArray(warnings)) warnings.push(`势力「${effect.name}」不在台账里，已跳过这条势力后果（真要新建请在后果里写 founded:true）`);
                continue;
            }
            // 立场留空就用台账里现有的立场：只改一句动向，不该把「警惕」悄悄降成「中立」。
            ops.push({
                op: 'setFaction',
                name: effect.name,
                stance: effect.stance || stanceOf(effect.name),
                dynamics: effect.dynamics,
                ...(effect.dissolved === true ? { status: 'dissolved' } : {}),
                basis: impactBasis(record),
            });
        }
    }
    if (!ops.length && !npcTouches.length && !selfTouches.length && withDefaultEvent && shouldDefaultEvent(record)) {
        const effect = defaultEventOf(record);
        ops.push({
            op: 'addEvent',
            scope: effect.scope,
            title: effect.title,
            text: rumorize(effect.text),
            participants: rumor ? [] : effect.participants,
            weight: rumor ? 'rumor' : worldWeightOf(record.weight),
            basis: impactBasis(record),
        });
    }
    // 牵涉的剧情线：先在 open 线索里找同名；名字差一两个字时按包含关系认（“货栈三株药材”≈“三株药材”），
    // 都找不到就把名字挂到 ops.threadUnresolved，面板/命令据此提示玩家一键建线索，不凭空造线索。
    const threadUnresolved = [];
    const threadResolved = [];
    if (plot && threadLinks.length) {
        const book = resolveBook(plot);
        const openThreads = (book?.snapshot?.()?.threads ?? []).filter(thread => thread.status === 'open');
        for (const link of threadLinks) {
            const thread = findThread(openThreads, link.name);
            if (!thread) {
                if (Array.isArray(warnings)) warnings.push(`剧情线「${link.name}」不在账上，已跳过（可在面板一键建线索）`);
                threadUnresolved.push({ name: link.name, impactId: record?.id ?? '' });
                continue;
            }
            const detail = `受「${record.title}」推动`;
            ops.push(thread.dueDay !== null
                ? { op: 'applyThread', id: thread.id, spanDays: -1, detail }
                : { op: 'applyThread', id: thread.id, detail });
            // 名字对不上（模糊命中）时也记一笔：面板据此显示“推到了哪条线索”，玩家能看出是不是推错人。
            threadResolved.push({ name: link.name, threadId: thread.id, title: thread.title, exact: thread.title === link.name });
        }
    }
    if (threadUnresolved.length) {
        Object.defineProperty(ops, 'threadUnresolved', { value: threadUnresolved, enumerable: false });
    }
    if (threadResolved.length) {
        Object.defineProperty(ops, 'threadResolved', { value: threadResolved, enumerable: false });
    }
    if (npcTouches.length) {
        Object.defineProperty(ops, 'npcTouches', { value: npcTouches, enumerable: false });
    }
    if (selfTouches.length) {
        Object.defineProperty(ops, 'selfTouches', { value: selfTouches, enumerable: false });
    }
    return ops;
}

/**
 * 剧情账本依赖可以是实例，也可以是返回实例的函数。
 * 用函数取值是为了绕开模块里的声明顺序（实例常常声明在执行器之后），
 * 顺手写成 `plot: () => agentPlotRuntime` 就够了，不用为了顺序把声明挪来挪去。
 */
function resolveBook(book) {
    return typeof book === 'function' ? book() : book;
}

/**
 * 同名优先；找不到再按“一个名字包含另一个”的相似度挑最长匹配，返回 null 表示真的没有。
 * 只做文本比对，不改剧情账本，所以玩家写错别字也不会静默造出线索。
 */
function findThread(threads, name) {
    const want = String(name ?? '').trim();
    if (!want) return null;
    const exact = threads.find(thread => thread.title === want);
    if (exact) return exact;
    let best = null;
    for (const thread of threads) {
        const title = String(thread.title ?? '');
        if (!title) continue;
        if (title.includes(want) || want.includes(title)) {
            if (!best || title.length > String(best.title).length) best = thread;
        }
    }
    return best;
}

/** 只认「这次新建出来的事件」编号：并账（merged）返回的是别人的旧事件号，不能算落成。 */
function eventIdOf(applied) {
    const hit = (Array.isArray(applied) ? applied : []).find(item => item?.ok && item.merged !== true && typeof item.id === 'string' && /^e\d+$/.test(item.id));
    return hit ? hit.id : '';
}

/**
 * 执行器本身不碰持久化：调用方拿到 changed 后自己 save world/impact。
 * 返回每条影响的处理结果，方便面板/日志说清"哪条变成了哪件事"。
 */
export function createImpactExecutor({ runtime, world, plot = null, npcs = null, worldDay = () => 1, maxPerRun = 3 } = {}) {
    function pending(day = worldDay()) {
        return runtime.list({ state: 'ripened' })
            .filter(record => !record.materialized)
            .map(record => ({ record, day }));
    }

    /** 世界台账里所有事件（含两个 scope），用来回查影响自己的落成事件。 */
    function liveEvents() {
        try {
            const snapshot = world.snapshot() ?? {};
            return [...(snapshot.nearEvents ?? []), ...(snapshot.worldEvents ?? [])];
        } catch { return []; }
    }

    /**
     * 回查一条影响真正落成的世界事件编号。
     * 并账时本影响的标记会整段替换掉旧事件的 basis，事后再看 basis 已经分不清那条事件原本是不是别人的，
     * 所以只认「记录里存下了这条事件号」的：没存号说明当时没认领（并进了别人的旧事件），
     * 删影响时不能连带把别人的事件删掉。
     */
    function eventOf(record) {
        const recorded = String(record?.outcomeEventId ?? '');
        if (!recorded) return '';
        const hit = liveEvents().find(event => !event?.done && event?.id === recorded);
        return hit ? recorded : '';
    }

    /**
     * 把陈旧的落成状态标回未落成，或补记事件号：
     * 玩家删了世界事件以后，账本不该继续挂着"已落成 e6"，否则这条影响永远不会再推。
     * 没有要修的时候什么都不动，所以可以每轮便宜地调用。
     */
    function reconcile(day = worldDay()) {
        const fixed = [];
        const live = new Map(liveEvents().map(event => [event?.id, event]));
        for (const record of runtime.list({})) {
            if (!record.materialized) continue;
            if (record.outcomeEventId && live.has(record.outcomeEventId)) continue;
            if (!record.outcomeEventId) {
                // 落成时没拿到事件号（例如后果只有改名声/改势力）：按 basis 找回真正那条并补记。
                const hit = liveEvents().find(event => !event?.done && basisMatchesImpact(event?.basis, record));
                if (!hit?.id) continue;
                const result = runtime.apply([{ op: 'materialize', ref: record.id, eventId: hit.id, detail: `补记落成世界事件 ${hit.id}` }], { source: 'reply', day });
                if (result.status === 'applied') fixed.push({ id: record.id, status: 'relinked', eventId: hit.id });
                continue;
            }
            // 原来挂的事件已经不在台账里：世界那边没了，账本这边也别再算落成。
            const fix = restoreFromMaterialized(record, day);
            if (fix) fixed.push(fix);
        }
        return { day, fixed };
    }

    function restoreFromMaterialized(record, day) {
        const detail = `原世界事件 ${record.outcomeEventId} 已不在台账里，退回待落成`;
        const result = runtime.apply([{ op: 'unmaterialize', ref: record.id, detail }], { source: 'reply', day });
        return result.status === 'applied' ? { id: record.id, status: 'reverted', eventId: record.outcomeEventId, resolution: detail } : null;
    }

    function run({ day = worldDay(), max = maxPerRun } = {}) {
        const rows = [];
        // 势力效应对照世界台账现有名单：写错的跳过，不把错名变成新势力。
        let factionNames = null;
        let factionList = null;
        try {
            const snapshotFactions = world.snapshot()?.factions ?? [];
            factionList = snapshotFactions.filter(faction => faction?.name).map(faction => ({ name: faction.name, stance: faction.stance ?? '' }));
            const names = factionList.map(faction => faction.name);
            if (names.length) factionNames = names;
        } catch { factionNames = null; }
        for (const { record } of pending(day).slice(0, Math.max(1, max))) {
            const warnings = [];
            // 人物簿现有名单：动到人的后果只认这些名字，写错名的跳过，不给没出现过的人建档。
            // 空名单也照样拦——开局人物簿一条没有时，名单为 null 会让这道闸整个失效，
            // 而 npcLedger.apply 对陌生人自动建档，人物后果就会凭空造人（曾经最容易出现脏档的洞）。
            let npcNames = null;
            try {
                const rows = typeof npcs === 'function' ? (npcs() ?? []) : [];
                npcNames = rows.map(item => String(item?.name ?? '')).filter(Boolean);
            } catch {
                npcNames = [];
                warnings.push('人物簿名单读不出来，这条影响的人物后果全部跳过');
            }
            const ops = buildWorldOps(record, { factionNames, factionList, npcNames, warnings, plot });
            const npcTouches = ops.npcTouches ?? [];
            const selfTouches = ops.selfTouches ?? [];
            // 并账会把本影响的标记写进那条旧事件，之后光看 basis 就分不清是不是自己的了；
            // 所以要在写之前先问一句“这条记录当时有没有自己的标记世界事件”。
            const ownedBefore = eventOf(record);
            const worldOps = ops.filter(op => op.op !== 'applyThread');
            const threadOps = ops.filter(op => op.op === 'applyThread');
            const worldResult = worldOps.length ? world.apply(worldOps, { source: 'impact' }) : { status: 'noop', applied: [], rejected: [] };
            // 线索操作是另一个账本：世界台账不认识 applyThread，必须交给剧情运行时。
            let threadResult = null;
            const book = resolveBook(plot);
            if (threadOps.length && book?.apply) {
                try {
                    threadResult = book.apply(threadOps, { source: 'impact' });
                    for (const item of (threadResult.rejected ?? [])) warnings.push(`剧情线推进被拒：${item.reason ?? 'unknown'}`);
                } catch (error) {
                    warnings.push(`剧情线推进失败：${error?.message ?? error}`);
                }
            }
            if (ops.length && worldResult.status === 'rejected') {
                rows.push({ id: record.id, status: 'world_rejected', world: worldResult, warnings });
                continue;
            }
            // 事件可能被并进同类旧条目（merged），也可能这条影响只改了名声/势力：都按 basis 回查真实那条。
            // 并账那条旧事件不一定是影响自己推出来的（可能早就在台账里），不能把它的编号算成落成后果：
            // 只有「并账前它没有依据、也没有挂着别的影响」的才算这次被这条影响认领，
            // 避免删影响时把世界台账里别人早就在的事件一起删掉。
            // 线索账本那边推了什么，回执里带一句“顺带推进的剧情线”，落成提示能直接说给人听。
            const threadTouched = Array.isArray(threadResult?.applied)
                ? threadResult.applied.filter(item => item?.ok).map(item => item.summary).filter(Boolean)
                : [];
            const threadMissing = ops.threadUnresolved ?? [];
            const threadResolved = ops.threadResolved ?? [];
            const mergedInto = (Array.isArray(worldResult.applied) ? worldResult.applied : []).find(item => item?.ok && item.merged === true);
            const basisBefore = String(mergedInto?.basisBefore ?? '');
            const claimed = mergedInto ? (basisBefore === '' || basisMatchesImpact(basisBefore, record)) : false;
            const eventId = eventIdOf(worldResult.applied) || ownedBefore || (claimed ? mergedInto.id : '');
            const recordedId = eventId;
            const detail = recordedId ? `已落成世界事件 ${recordedId}` : '已在世界里应验';
            // 回响：落成这一刻它到底动到了谁——推进的剧情线（含推到第几天）与被波及的人物。
            // 存成结构化痕迹，账本以后不用再靠读剧情线 detail 的字符串反推“是谁推的”。
            const echoes = [];
            for (const item of threadResolved) {
                const pushed = threadResult?.applied?.find(row => row?.ok && String(row?.id) === String(item.threadId));
                echoes.push({ kind: 'thread', id: item.threadId, title: item.title, day, note: pushed ? briefNote(pushed.summary) : '' });
            }
            for (const item of threadTouched) {
                if (!item) continue;
                const hit = threadResolved.find(row => item.includes(String(row.threadId ?? '')));
                if (hit) continue;
                echoes.push({ kind: 'thread', id: '', title: briefNote(item, 20), day, note: briefNote(item) });
            }
            // 真的被这条影响动了态度的人物先记：这不是"牵涉"，是"改过"，要带上为什么。
            for (const touch of npcTouches) {
                if (echoes.some(item => item.kind === 'npc' && item.id === touch.name)) continue;
                echoes.push({ kind: 'npc', id: touch.name, title: touch.name, day, note: briefNote(touch.note) });
            }
            for (const link of record.links ?? []) {
                if (link?.type !== 'person' || !link.name) continue;
                if (echoes.some(item => item.kind === 'npc' && item.id === link.name)) continue;
                echoes.push({ kind: 'npc', id: link.name, title: link.name, day });
            }
            const impact = runtime.apply([{ op: 'materialize', ref: record.id, eventId: recordedId, detail, ...(echoes.length ? { echoes } : {}) }], { source: 'reply', day });
            rows.push({
                id: record.id,
                status: impact.status === 'applied' ? 'materialized' : 'impact_rejected',
                world: worldResult,
                threads: threadResult,
                threadTouched,
                threadMissing,
                threadResolved,
                npcTouches,
                selfTouches,
                impact,
                eventId: recordedId,
                mergedInto: eventId && !recordedId ? eventId : '',
                warnings: warnings.concat(worldResult.warning ? [worldResult.warning] : []),
            });
        }
        return { day, rows, changed: rows.some(row => row.status === 'materialized') };
    }

    /** 撤销一条已经落成的影响：把它推出去的那条世界事件也从台账删掉，两头保持一致。 */
    function rollback(record) {
        const id = typeof record === 'string' ? record : record?.id;
        let target = typeof record === 'object' && record ? record : null;
        if (!target && id) {
            try { target = (runtime.snapshot()?.records ?? []).find(item => item.id === id) || null; } catch { target = null; }
        }
        // 事件号可能没存上（并账/只有非事件后果），顺手按 basis 回查一次，删影响时才能把事件一起撤掉。
        // 只有世界台账里那条事件带着本影响的标记才算自己推出来的：并进别人的旧事件不删。
        const recorded = String(target?.outcomeEventId ?? '');
        const own = target && recorded ? liveEvents().find(event => event?.id === recorded) : null;
        const eventId = (own ? recorded : '') || eventOf(target);
        if (!target?.materialized || !eventId) return { id: id || '', status: 'noop', eventId };
        const result = world.apply([{ op: 'removeEvent', id: eventId }], { source: 'impact' });
        return { id: target.id, status: result.status === 'applied' ? 'removed' : 'missing', eventId, world: result };
    }

    return { pending, run, rollback, reconcile, eventOf };
}
