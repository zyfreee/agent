/**
 * 斗破 · 楼层美化（酒馆助手脚本版 v3 · 古卷装·沉浸版）
 *
 * 做什么：只往楼层里“添”装饰，不写任何聊天数据——
 *   ① 观世牌：最新回复正文上方一张古卷整卡（时辰 / 所在 / 天气 / 大势，点开看世界风云）；
 *   ② 开炉·备料：玩家输入楼下的签面板（拾卷 / 翻忆 / 过秤）——正文动笔前的所有准备；
 *   ③ 收炉·落账：正文下方的签面板（纳戒 / 记人 / 归档 / 留痕）——正文写完后的所有账目；
 *   ④ 楼缝：玩家楼与回复楼之间一道鎏金细线，接缝处一粒会呼吸的异火；
 *   ⑤ 对话上色：正文里成对的中文引号句子染主题色，带一层微光；
 *   ⑥ 正文章回排版：段距 / 首行缩进 / 重点字 / 引文块 / 鎏金分隔线，可选书卷衬线字体；
 *   ⑦ 楼头与周边：名牌鎏金渐字、头像斗气圈、主题滚动条 / 选区、输入框聚焦的玉牒光；
 *   ⑧ 炼字浮牌：生成期间角落一枚小火苗「炼字中」，落笔完自动退场；
 *   ⑨ 整体窗景：聊天窗整窗换装——案台深底、卷轴纸面、楼块隐入纸面、顶栏与输入区随色；
 *   ⑩ 斗破焰装：案台暖光、纸面烛光晕染 + 卷轴内框、章首焰字下沉、
 *      卷尾落款（斗气大陆 · 第 X 天 · 所在，读真实世界账）。
 *
 * 怎么工作的：
 *   - 只在斗破卡上生效（按世界书名 / 卡内置脚本名 / 卡名判定），换卡自动全部撤掉；
 *   - 配色跟随 agent 面板选的主题（暗金 / 玄铁 / 米纸，只读它的设置，不改动 agent 任何东西）；
 *   - 数据全部只读：纳戒走楼层变量（stat_data.斗破纳戒），其余走聊天元数据里
 *     agent 已落库的账（doupo_agent_state / _world / _npc / _memory / _impact）。
 *
 * 不想用了：酒馆助手 → 脚本库 → 把这个脚本关掉即可；楼面上残留的旧卡
 * 切一下聊天或刷新就消失。
 */
(async () => {
    'use strict';
    if (window.__DOUPO_FLOOR_DRESS__) return;
    window.__DOUPO_FLOOR_DRESS__ = true;

    // ==== 手动微调（一般不用动）====
    const CONFIG = {
        strip: true,            // ① 观世牌（正文上方）
        settle: true,           // ② 开炉·备料（玩家楼下：拾卷/翻忆/过秤）
        post: true,             // ③ 收炉·落账（正文下：纳戒/记人/归档/留痕）
        dress: true,            // ④⑤ 楼缝异火 + 对话上色
        prose: true,            // ⑥ 正文章回排版（段距/首行缩进/重点字/引文块/分隔线）
        proseSerif: true,       // ⑥ 附：正文用书卷衬线字体（不习惯衬线就关这项）
        chrome: true,           // ⑦ 周边（名牌/头像圈/滚动条/选区/输入框聚焦光）
        crafting: true,         // ⑧ 生成中的「炼字」浮牌
        window: true,           // ⑨ 整体窗景：聊天窗整窗换装（案台+卷轴面+顶栏+输入区随色）
        flavor: true,           // ⑩ 斗破焰装：案台暖光/纸面晕染/章首焰字/卷尾落款
        followAgentTheme: true, // 跟随 agent 面板的主题（暗金/玄铁/米纸）
        fallbackTheme: 'gilt',
        pollMs: 5000,           // 兜底轮询：防止“手动预览结算”这类不触发楼层重绘的更新被漏掉
    };
    const PRE_HEADER = { seal: '备', title: '开炉 · 备料', caption: '备齐这三样，正文才开炉' };
    const POST_HEADER = { seal: '录', title: '收炉 · 落账', caption: '纳戒 · 记人 · 归档 · 留痕，记好这几笔才算收尾' };

    // ---- 宿主解析：页面直注与酒馆助手脚本 iframe 两种环境都兼容 ----
    const hostWindow = (() => {
        try {
            const parent = window.parent;
            if (parent && parent !== window && parent.document && parent.document.getElementById('chat')) return parent;
        } catch { /* 跨域不可达就当页面级 */ }
        return window;
    })();
    const doc = hostWindow.document;
    const helper = hostWindow.TavernHelper ?? window.TavernHelper ?? null;
    const getContext = () => hostWindow.SillyTavern?.getContext?.() ?? {};
    // 版本戳：控制台敲 __DPD_VERSION__ 就能确认页面跑的是哪一版
    hostWindow.__DPD_VERSION__ = 'v6.14';
    try { console.info('[斗破美化] v6.14 已加载（弹窗撤内部流水；观世牌只留「全」印）'); } catch { /* 忽略 */ }

    const THEME_NAMES = new Set(['gilt', 'graphite', 'parchment']);
    const normalizeTheme = value => (THEME_NAMES.has(value) ? value : 'gilt');
    const ACTION_STATUS_TEXT = { success: '成功', partial: '部分成功', failure: '失败', insufficient: '条件不足', not_executed: '未执行' };
    const BADGE_KIND = { success: 'ok', partial: 'warn', failure: 'bad', insufficient: 'dim', not_executed: 'dim' };
    const STRIP_DETAIL_FIELDS = ['行囊', '天材地宝', '丹方', '称号', '目标'];
    // 时间戳：账本里两种格式都有（毫秒数 / ISO 字符串），统一成短时光
    const fmtClock = at => {
        const ms = Number(at);
        if (!Number.isFinite(ms) || ms <= 0) return '';
        const d = new Date(ms);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };
    const fmtStamp = iso => {
        const d = new Date(iso);
        if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
        return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };
    // 世界书条目名常带「（故事线-XXX）」后缀：拆成主名 + 小徽
    const splitEntryTitle = title => {
        const text = String(title ?? '').trim();
        const m = text.match(/^(.*?)（([^（]*)）$/);
        return m ? { main: m[1].trim() || text, sub: m[2].trim() } : { main: text, sub: '' };
    };

    function readAgentTheme() {
        if (!CONFIG.followAgentTheme) return normalizeTheme(CONFIG.fallbackTheme);
        try {
            const ui = getContext()?.extensionSettings?.doupo_agent_ui?.ui;
            return normalizeTheme(ui?.theme);
        } catch { return 'gilt'; }
    }

    function isDoupoCard(character) {
        if (!character || typeof character !== 'object') return false;
        const book = character?.data?.character_book?.name ?? character?.character_book?.name;
        if (String(book ?? '').trim() === '斗破世界书') return true;
        const scripts = character?.data?.extensions?.tavern_helper?.scripts ?? character?.extensions?.tavern_helper?.scripts;
        if (Array.isArray(scripts) && scripts.some(item => String(item?.name ?? '').trim() === '斗破纳戒 · 变量结构')) return true;
        const name = String(character?.name ?? '');
        const avatar = String(character?.avatar ?? '');
        return name.includes('斗破苍穹') || avatar.includes('斗破苍穹');
    }

    function doupoActive() {
        const context = getContext();
        const id = Number(context?.characterId);
        const character = Array.isArray(context?.characters) ? context.characters[id] : null;
        return isDoupoCard(character);
    }

    function scopeKey() {
        const context = getContext();
        return JSON.stringify({
            sessionId: String(context?.chatId || 'current-chat'),
            branchId: String(context?.chatMetadata?.branch_id || 'main'),
            characterId: context?.characterId ?? null,
        });
    }

    // ---- 纯函数：把数据折成展示用的小对象（与 agent 侧同名逻辑同源）----
    function buildStripFields(najie, worldMeta) {
        if (!najie || typeof najie !== 'object') return null;
        const read = key => {
            const raw = najie[key];
            return raw === null || raw === undefined ? '' : String(raw).trim();
        };
        const main = [];
        const gold = read('金币');
        if (gold !== '') main.push({ label: '钱袋', value: gold, numeric: true });
        const gongfa = read('功法');
        if (gongfa) {
            const parts = gongfa.split('·').map(part => part.trim()).filter(Boolean);
            const shortGongfa = parts.length > 2 ? `${parts[0]} · ${parts[parts.length - 1]}` : gongfa;
            main.push({ label: '功法', value: shortGongfa.slice(0, 18) });
        }
        const equipment = read('装备');
        if (equipment) main.push({ label: '兵刃', value: equipment.split('·')[0].trim().slice(0, 12) });
        const affiliation = read('所属');
        if (affiliation) main.push({ label: '所在', value: affiliation.replace(/学员$/, '').slice(0, 16) });
        if (!main.length) return null;
        const detail = STRIP_DETAIL_FIELDS.map(label => ({ label, value: read(label) || '暂无' }));
        return { name: read('姓名').slice(0, 10), main, detail, updatedAt: read('更新时间'), world: buildWorldLine(worldMeta) };
    }

    /** 世界运转 → 腰牌上的一行「世况」：何时 · 何地 · 何天气。 */
    function buildWorldLine(worldMeta) {
        if (!worldMeta || typeof worldMeta !== 'object') return null;
        const clock = worldMeta.clock ?? {};
        const info = worldMeta.info ?? {};
        const day = Number(clock.day);
        const minute = Number(clock.minute);
        const time = Number.isFinite(day) && Number.isFinite(minute) && minute >= 0
            ? `第 ${day} 天 ${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}`
            : '';
        const where = String(info.location ?? '').replace(/（[^）]*）\s*$/, '').trim();
        const weather = String(info.weather ?? '').trim();
        const when = time || (Number.isFinite(day) ? `第 ${day} 天` : '');
        if (!when && !where && !weather) return null;
        return { when, where: where.slice(0, 24), weather: weather.slice(0, 14) };
    }

    function buildSettleSummary(record) {
        if (!record || typeof record !== 'object' || !Array.isArray(record.actions)) return null;
        const rows = [];
        for (const action of record.actions.slice(0, 8)) {
            const label = String(action?.label ?? '').trim();
            if (!label) continue;
            const consequences = Array.isArray(action?.consequences)
                ? action.consequences.filter(item => typeof item === 'string' && item.trim())
                : [];
            const outcome = String(action?.outcome ?? '').trim();
            // 主行给第一条结果；剩下的后续与完整结局长句收进注脚行
            const main = consequences[0]?.trim() || (outcome ? outcome.slice(0, 80) : '');
            const rest = (consequences.length > 1 ? consequences.slice(1) : (outcome && consequences[0] ? [outcome] : []))
                .map(item => item.trim()).filter(Boolean).join('；').slice(0, 110);
            const statusKey = String(action?.status ?? '');
            rows.push({
                label: label.slice(0, 16),
                badge: ACTION_STATUS_TEXT[statusKey] ?? '',
                badgeKind: BADGE_KIND[statusKey] ?? 'dim',
                detail: main,
                sub: rest,
            });
        }
        if (!rows.length) return null;
        const effects = Array.isArray(record.effects) ? record.effects.filter(item => item && typeof item === 'object') : [];
        return {
            count: rows.length,
            rows,
            tag: effects.length ? `账目变动 ${effects.length} 项` : '无金币 / 物品变动',
            note: typeof record.note === 'string' ? record.note.trim().slice(0, 110) : '',
        };
    }

    /** 原著卷宗节：本轮挑了哪些条目（主名 + 线别徽）、注入多少字、何时注入。 */
    function buildFactsSection(facts, titles) {
        const section = { key: 'facts', label: '拾卷', summary: '○ 本轮未注入原著资料', detail: null, open: false, full: openFactsPopup };
        if (!facts || typeof facts !== 'object') return section;
        const ids = Array.isArray(facts.usedIds) ? facts.usedIds.map(String) : [];
        const when = fmtClock(facts.at);
        if (facts.status === 'injected' && ids.length) {
            section.summary = `✓ 注入 ${ids.length} 条 · ${Number(facts.chars) || '?'} 字${when ? ` · ${when}` : ''}`;
            section.detail = {
                kind: 'entries',
                entries: ids.map(id => {
                    const record = titles.get(id) || null;
                    const t = splitEntryTitle((record && record.title) || `条目 ${id}`);
                    return { id, title: t.main, sub: t.sub };
                }),
                more: 0,
                truncated: !!facts.truncated,
            };
        } else if (typeof facts.note === 'string' && facts.note.trim()) {
            section.summary = `· 本轮卷宗挑选未完成${when ? ` · ${when}` : ''}`;
            section.detail = { kind: 'note', note: facts.note.trim().slice(0, 130) };
        }
        return section;
    }

    /** 记忆节：召回了什么素材就列什么；没料就把原因写明白。 */
    function buildMemorySection(memory) {
        const section = { key: 'memory', label: '翻忆', summary: '○ 本轮无记忆素材', detail: null, open: false, full: openMemoryInjPopup };
        if (!memory || typeof memory !== 'object') return section;
        const when = fmtClock(memory.at);
        const entries = Array.isArray(memory.entries) ? memory.entries : [];
        const ids = Array.isArray(memory.ids) ? memory.ids.filter(Boolean) : [];
        if (memory.status === 'injected' && (entries.length || ids.length)) {
            section.summary = `✓ 注入 ${entries.length || ids.length} 条${Number(memory.chars) ? ` · ${Number(memory.chars)} 字` : ''}${when ? ` · ${when}` : ''}`;
            const rows = entries.map((entry, index) => {
                const text = typeof entry === 'string' ? entry : String(entry?.summary ?? entry?.text ?? entry?.title ?? '').trim();
                const id = typeof entry === 'object' && entry?.id != null ? entry.id : ids[index];
                return { label: id != null ? `#${id}` : '', status: '', detail: text.slice(0, 110) || '（无摘要）' };
            });
            if (rows.length) section.detail = { kind: 'list', rows };
        } else if (typeof memory.note === 'string' && memory.note.trim()) {
            section.summary = `· 素材挑选未完成${when ? ` · ${when}` : ''}`;
            section.detail = { kind: 'note', note: memory.note.trim().slice(0, 130) };
        }
        return section;
    }

    /** 记人节：最近一次记账记了谁、动了哪些字段，顺带交代人物簿底数。 */
    function buildNpcSection(npcMeta) {
        const section = { key: 'npc', label: '记人', summary: '○ 人物簿还没有记账', detail: null, full: openNpcPopup };
        if (!npcMeta || typeof npcMeta !== 'object') return section;
        const records = Array.isArray(npcMeta.records) ? npcMeta.records : [];
        const names = records.map(item => String(item?.name ?? '').trim()).filter(Boolean);
        const reply = npcMeta?._runtime?.lastReply ?? null;
        let fingerprint = null;
        try {
            fingerprint = typeof reply?.afterFingerprint === 'string' ? JSON.parse(reply.afterFingerprint) : reply?.afterFingerprint;
        } catch { fingerprint = null; }
        const changes = Number(fingerprint?.changes) || 0;
        const change = fingerprint?.lastChange ?? null;
        const floor = Number(change?.floor) || Number(reply?.floor) || Number(npcMeta?.lastFloor) || 0;
        if (!reply && !names.length) return section;
        section.summary = reply
            ? `✓ 第 ${floor} 楼记了${change?.name ? ` ${String(change.name).slice(0, 10)}` : ''} · 变更 ${changes} 处 · 人物簿 ${records.length} 人`
            : `○ 人物簿 ${records.length} 人，本轮没跑记账`;
        const rows = [];
        if (change?.name) {
            const fields = Array.isArray(change.fields) ? change.fields.filter(Boolean) : [];
            rows.push({ label: String(change.name).slice(0, 12), status: '', detail: fields.join(' · ').slice(0, 90) || '有更新' });
        }
        if (names.length) {
            rows.push({ label: '人物簿', status: '', detail: `${records.length} 人：${names.slice(0, 8).join(' · ')}${names.length > 8 ? ' 等' : ''}`.slice(0, 110) });
        }
        if (rows.length) section.detail = { kind: 'list', rows };
        return section;
    }

    /** 归档节：记忆流水最近一笔——记了什么、拒了什么、何时记的。 */
    function buildMemoryArchiveSection(memoryMeta) {
        const section = { key: 'archive', label: '归档', summary: '○ 记忆还没有流水', detail: null, full: openArchivePopup };
        const log = Array.isArray(memoryMeta?.log) ? memoryMeta.log : [];
        const last = log[log.length - 1];
        if (!last) return section;
        const lines = Array.isArray(last.summaries) ? last.summaries.filter(item => typeof item === 'string' && item.trim()) : [];
        const added = lines.filter(line => line.includes('+m')).length;
        const when = fmtStamp(last.at);
        const sourceText = { decide: '决定', consolidate: '总结', manual: '手动' }[String(last.source ?? '').trim()] || String(last.source ?? '').trim();
        if (added > 0) section.summary = `✓ 新记 ${added} 条小记忆${when ? ` · ${when}` : ''}`;
        else if (lines.length) section.summary = `○ 与已有记忆重复，不另记${when ? ` · ${when}` : ''}`;
        if (lines.length) {
            const foot = [
                sourceText ? `来源：${sourceText}` : '',
                Number(last.rejected) > 0 ? `拒收 ${Number(last.rejected)} 条` : '',
                log.length ? `累计 ${log.length} 次` : '',
            ].filter(Boolean).join(' · ');
            section.detail = { kind: 'list', rows: lines.slice(0, 4).map(line => ({ label: '', status: '', detail: line.slice(0, 110) })), note: foot || null };
        }
        return section;
    }

    /** 留痕节：世界影响最近一笔——偏没偏移、何时、累计多少次。 */
    function buildImpactSection(impactMeta) {
        const section = { key: 'impact', label: '留痕', summary: '○ 世界还没有留痕记录', detail: null, full: openImpactPopup };
        const log = Array.isArray(impactMeta?.log) ? impactMeta.log : [];
        const last = log[log.length - 1];
        if (!last) return section;
        const lines = Array.isArray(last.summaries) ? last.summaries.filter(item => typeof item === 'string' && item.trim()) : [];
        const noShift = lines.some(line => /没有偏移|无偏移|没有变化/.test(line));
        const when = fmtStamp(last.at);
        if (noShift) section.summary = `✓ 世界线没有偏移${when ? ` · ${when}` : ''}`;
        else if (lines.length) section.summary = `✓ 世界有变化，见明细${when ? ` · ${when}` : ''}`;
        if (lines.length) {
            section.detail = { kind: 'list', rows: lines.slice(0, 4).map(line => ({ label: '', status: '', detail: line.slice(0, 110) })), note: log.length ? `累计 ${log.length} 次留痕` : null };
        }
        return section;
    }

    const TENSION_TEXT = { rising: '暗流渐起', falling: '风浪渐息', calm: '表面平静' };

    /** 观世节：世界运转的当下面貌（时刻、所在、天气、大势、世界事件）。 */
    function buildWorldSection(worldMeta) {
        const section = { label: '观世', summary: '○ 世界账还没有开', detail: null };
        if (!worldMeta || typeof worldMeta !== 'object') return section;
        const clock = worldMeta.clock ?? {};
        const info = worldMeta.info ?? {};
        const day = Number(clock.day);
        const minute = Number(clock.minute);
        const time = Number.isFinite(day) && Number.isFinite(minute) && minute >= 0
            ? `第 ${day} 天 ${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}`
            : '';
        const where = String(info.location ?? '').replace(/（[^）]*）\s*$/, '').trim();
        if (time || where) section.summary = `✓ ${[time, where].filter(Boolean).join(' · ')}`;
        const rows = [];
        const weather = String(info.weather ?? '').trim();
        if (weather) rows.push({ label: '', status: '', detail: `天气：${weather}` });
        const tension = TENSION_TEXT[String(worldMeta.tension ?? '').trim()] || String(worldMeta.tension ?? '').trim();
        if (tension) rows.push({ label: '', status: '', detail: `大势：${tension}` });
        const events = Array.isArray(worldMeta.worldEvents) ? worldMeta.worldEvents.slice(0, 3) : [];
        for (const event of events) {
            const title = String(event?.title ?? '').trim();
            if (title) rows.push({ label: '', status: '', detail: `${title}（第 ${Number(event?.day) || '?'} 天起）` });
        }
        if (rows.length) section.detail = { kind: 'list', rows };
        return section;
    }

    function collectQuoteRanges(text) {
        if (typeof text !== 'string') return [];
        const ranges = [];
        let index = 0;
        for (;;) {
            const start = text.indexOf('“', index);
            if (start < 0) break;
            const end = text.indexOf('”', start + 1);
            if (end < 0) break;
            if (end - start >= 2) ranges.push([start, end]);
            index = end + 1;
        }
        return ranges;
    }

    // ---- 样式：与 agent 面板同源的设计 token，单独注入不依赖扩展 ----
    // v6.10：换独立样式 id——角色卡里还嵌着一份旧拷贝（同名「斗破 · 楼层美化」），
    // 它每次 sync 都往旧 id 里刷旧 CSS，跟库里新版互刷打架。分开 id 后互不相干。
    const STYLE_ID = 'doupo-floor-dress-style-69';
    const VPLOCK_ID = 'doupo-vp-lock-style';
    const STYLE_TEXT = `
#chat.doupo-dress[data-dress-theme="gilt"] { --dpd-accent: #d9a72b; --dpd-hi: #f6dd9a; --dpd-line: rgba(217, 167, 43, 0.38); --dpd-soft: rgba(217, 167, 43, 0.12); --dpd-surface: #221b10; --dpd-ink: #f0e6cd; --dpd-muted: #ab966f; --dpd-good: #9cc78c; --dpd-dialogue: #f6dd9a; }
#chat.doupo-dress[data-dress-theme="graphite"] { --dpd-accent: #3ecfa5; --dpd-hi: #b7f0dd; --dpd-line: rgba(62, 207, 165, 0.34); --dpd-soft: rgba(62, 207, 165, 0.1); --dpd-surface: #121b17; --dpd-ink: #ddebe3; --dpd-muted: #83a695; --dpd-good: #43b06d; --dpd-dialogue: #b7f0dd; }
#chat.doupo-dress[data-dress-theme="parchment"] { --dpd-accent: #b4452f; --dpd-hi: #7d2f20; --dpd-line: rgba(180, 69, 47, 0.4); --dpd-soft: rgba(180, 69, 47, 0.08); --dpd-surface: #fbf6ea; --dpd-ink: #3c3122; --dpd-muted: #8a7458; --dpd-good: #4a7a3a; --dpd-dialogue: #eac9a8; }
/* 楼缝：一线鎏金，接缝处一粒会呼吸的异火 */
#chat.doupo-dress > .mes[is_user="true"] + .mes[is_user="false"] { position: relative; }
#chat.doupo-dress > .mes[is_user="true"] + .mes[is_user="false"]::before { content: ''; position: absolute; top: 0; left: 6%; right: 6%; height: 1px; background: linear-gradient(90deg, transparent, var(--dpd-line) 18%, var(--dpd-line) 82%, transparent); pointer-events: none; }
#chat.doupo-dress > .mes[is_user="true"] + .mes[is_user="false"]::after { content: ''; position: absolute; top: -5px; left: 50%; width: 10px; height: 10px; margin-left: -5px; border-radius: 0 50% 50% 50%; transform: rotate(45deg); background: linear-gradient(135deg, var(--dpd-hi) 0%, var(--dpd-accent) 55%, transparent 140%); box-shadow: 0 0 9px var(--dpd-soft), 0 0 20px var(--dpd-soft); animation: dpd-flicker 2.8s ease-in-out infinite; pointer-events: none; }
#chat.doupo-dress .mes_text .dpd-dialogue { color: var(--dpd-dialogue); text-shadow: 0 0 16px var(--dpd-soft); }
/* 卡座：观世牌与签面板共用的「古卷」底——绢纹、双框、顶部一道鎏金光梁 */
#chat .dpd-world-card, #chat .dpd-pre-card { position: relative; overflow: hidden; border-radius: 0.7rem; border: 1px solid var(--dpd-line, rgba(217, 167, 43, 0.38)); background: radial-gradient(130% 105% at 50% 0%, var(--dpd-soft, rgba(217, 167, 43, 0.12)), transparent 62%), repeating-linear-gradient(115deg, rgba(255, 255, 255, 0.016) 0 2px, transparent 2px 7px), var(--dpd-surface, #221b10); box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), inset 0 0 0 1px rgba(255, 255, 255, 0.03); color: var(--dpd-ink, #f0e6cd); font-family: inherit; animation: dpd-rise 0.45s cubic-bezier(0.22, 0.7, 0.3, 1) both; }
#chat .dpd-world-card::before, #chat .dpd-pre-card::before { content: ''; position: absolute; top: 0; left: 9%; right: 9%; height: 1px; background: linear-gradient(90deg, transparent, var(--dpd-accent) 30%, var(--dpd-hi) 50%, var(--dpd-accent) 70%, transparent); opacity: 0.6; pointer-events: none; }
#chat .dpd-strip-corner { position: absolute; width: 0.62rem; height: 0.62rem; pointer-events: none; opacity: 0.95; }
#chat .dpd-strip-corner.tl { top: 4px; left: 4px; border-top: 2px solid var(--dpd-accent); border-left: 2px solid var(--dpd-accent); border-top-left-radius: 4px; }
#chat .dpd-strip-corner.tr { top: 4px; right: 4px; border-top: 2px solid var(--dpd-accent); border-right: 2px solid var(--dpd-accent); border-top-right-radius: 4px; }
#chat .dpd-strip-corner.bl { bottom: 4px; left: 4px; border-bottom: 2px solid var(--dpd-accent); border-left: 2px solid var(--dpd-accent); border-bottom-left-radius: 4px; }
#chat .dpd-strip-corner.br { bottom: 4px; right: 4px; border-bottom: 2px solid var(--dpd-accent); border-right: 2px solid var(--dpd-accent); border-bottom-right-radius: 4px; }
/* 印：实心「盖下去」的印——暗金主题是鎏金印，米纸主题是朱印 */
#chat .dpd-strip-seal { width: 2.5rem; height: 2.5rem; flex: none; border-radius: 0.5rem; display: grid; place-items: center; font: 600 1.15rem/1 "Noto Serif SC", "STZhongsong", serif; color: var(--dpd-surface, #221b10); background: linear-gradient(160deg, var(--dpd-hi, #f6dd9a) -25%, var(--dpd-accent, #d9a72b) 70%); border: 1px solid var(--dpd-line); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), inset 0 0 0 2px rgba(255, 255, 255, 0.12), 0 0 14px var(--dpd-soft), 0 2px 6px rgba(0, 0, 0, 0.25); }
#chat .dpd-strip-head { display: flex; align-items: center; gap: 0.65rem; }
#chat .dpd-strip-title { display: flex; flex-direction: column; gap: 0.16rem; min-width: 0; }
#chat .dpd-strip-title b, #chat .dpd-pre-head b { font-family: "Noto Serif SC", "STZhongsong", serif; font-weight: 600; letter-spacing: 0.12em; background: linear-gradient(180deg, var(--dpd-hi), var(--dpd-accent)); -webkit-background-clip: text; background-clip: text; color: var(--dpd-accent); -webkit-text-fill-color: transparent; filter: drop-shadow(0 0 6px var(--dpd-soft)); }
#chat .dpd-strip-title b { font-size: 1.05rem; line-height: 1.2; }
#chat .dpd-strip-title small { color: var(--dpd-muted); font-size: 0.7rem; letter-spacing: 0.06em; }
#chat .dpd-strip-chev { margin-left: auto; flex: none; width: 1.6rem; height: 1.6rem; border-radius: 50%; display: grid; place-items: center; color: var(--dpd-muted); border: 1px solid var(--dpd-line); background: var(--dpd-soft); font-size: 0.68rem; transition: transform 0.15s ease, color 0.15s ease; }
/* 数据签：玉牌形，前缀一粒菱形火屑 */
#chat .dpd-strip-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.62rem; }
#chat .dpd-chip { display: inline-flex; align-items: center; gap: 0.36rem; padding: 0.28rem 0.68rem; border-radius: 0.42rem; background: linear-gradient(180deg, var(--dpd-soft), transparent 150%); border: 1px solid var(--dpd-line); font-size: 0.8rem; line-height: 1.4; }
#chat .dpd-chip::before { content: ''; width: 0.32rem; height: 0.32rem; flex: none; transform: rotate(45deg); background: var(--dpd-accent); box-shadow: 0 0 5px var(--dpd-soft); }
#chat .dpd-chip small { color: var(--dpd-muted); font-size: 0.66rem; letter-spacing: 0.14em; }
#chat .dpd-chip b { font-weight: 600; color: var(--dpd-ink); letter-spacing: 0.02em; }
#chat .dpd-chip.is-gold b { color: var(--dpd-accent); font-size: 0.95rem; }
/* 卡侧竖排水印：斗气大陆 */
#chat .dpd-card-mark { position: absolute; top: 50%; right: 0.34rem; transform: translateY(-50%); writing-mode: vertical-rl; font: 500 0.58rem/1 "Noto Serif SC", "STZhongsong", serif; letter-spacing: 0.42em; color: var(--dpd-accent); opacity: 0.3; pointer-events: none; }
/* 签面板：开炉·备料 / 收炉·落账 共用（古卷卡座样式见上） */
#chat .dpd-pre-card { margin: 0.7rem 0 0.2rem; padding: 0.62rem 0.95rem 0.6rem; font-size: 0.8rem; }
#chat .dpd-pre-head { display: flex; align-items: center; flex-wrap: wrap; gap: 0.35rem 0.55rem; margin-bottom: 0.15rem; }
#chat .dpd-pre-seal { width: 1.75rem; height: 1.75rem; flex: none; border-radius: 0.4rem; display: grid; place-items: center; font: 600 0.82rem/1 "Noto Serif SC", "STZhongsong", serif; color: var(--dpd-surface, #221b10); background: linear-gradient(160deg, var(--dpd-hi, #f6dd9a) -25%, var(--dpd-accent, #d9a72b) 70%); border: 1px solid var(--dpd-line); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 0 10px var(--dpd-soft), 0 1px 4px rgba(0, 0, 0, 0.22); }
#chat .dpd-pre-head b { font-size: 0.95rem; line-height: 1.2; }
#chat .dpd-pre-head small { font-size: 0.7rem; color: var(--dpd-muted); }
#chat .dpd-pre-tabs { display: flex; gap: 0.15rem; margin: 0.42rem 0 0; border-bottom: 1px solid var(--dpd-line); }
#chat .dpd-pre-tab { appearance: none; border: 0; background: transparent; color: var(--dpd-muted); font: 600 0.8rem/1 "Noto Serif SC", "STZhongsong", serif; letter-spacing: 0.14em; padding: 0.5rem 0.9rem 0.55rem; cursor: pointer; position: relative; transition: color 0.15s ease; }
#chat .dpd-pre-tab:hover { color: var(--dpd-ink); }
#chat .dpd-pre-tab::after { content: ''; position: absolute; left: 18%; right: 18%; bottom: -1px; height: 2px; background: linear-gradient(90deg, transparent, var(--dpd-accent), transparent); opacity: 0; transition: opacity 0.18s ease; }
#chat .dpd-pre-tab[aria-selected="true"] { color: var(--dpd-accent); text-shadow: 0 0 10px var(--dpd-soft); }
#chat .dpd-pre-tab[aria-selected="true"]::after { opacity: 1; box-shadow: 0 0 8px var(--dpd-soft); }
#chat .dpd-pre-tab small { margin-left: 0.3rem; font: 700 0.6rem/1 system-ui, sans-serif; }
#chat .dpd-pre-tab[aria-selected="true"] small { color: var(--dpd-good); }
#chat .dpd-pre-view { padding: 0.45rem 0.15rem 0.3rem; }
#chat .dpd-pre-view[hidden] { display: none; }
#chat .dpd-pre-summary { font-size: 0.76rem; color: var(--dpd-ink); padding: 0 0.1rem 0.5rem; letter-spacing: 0.02em; }
#chat .dpd-pre-summary i { font-style: normal; margin-right: 0.24rem; color: var(--dpd-muted); }
#chat .dpd-pre-summary i.is-ok { color: var(--dpd-good); text-shadow: 0 0 8px var(--dpd-soft); }
/* 观世牌：正文上方的一整张古卷卡（卡座样式见上） */
#chat .dpd-world-card { display: block; width: 100%; text-align: left; margin: 0.7rem 0 0; padding: 0.72rem 0.95rem 0.78rem; }
#chat button.dpd-strip-head-btn { display: flex; width: 100%; align-items: center; gap: 0.65rem; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; padding: 0; cursor: pointer; }
#chat .dpd-world-card .dpd-strip-head-btn[aria-expanded="true"] .dpd-strip-chev { transform: rotate(180deg); color: var(--dpd-accent); }
#chat .dpd-world-detail { margin: 0.6rem 0 0; padding: 0.55rem 0.1rem 0.1rem; border-top: 1px dashed var(--dpd-line); color: var(--dpd-ink); font-size: 0.78rem; }
#chat .dpd-world-detail[hidden] { display: none; }
/* 明细行：竹简一样的短行 */
#chat .dpd-pre-detail { padding: 0 0.05rem 0.1rem; display: grid; gap: 0.3rem; }
#chat .dpd-pre-detail[hidden] { display: none; }
#chat .dpd-pre-detail ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.3rem; }
#chat .dpd-pre-detail li { display: flex; flex-wrap: wrap; gap: 0.5rem; font-size: 0.76rem; line-height: 1.6; align-items: baseline; padding: 0.34rem 0.55rem; border-radius: 0.4rem; background: linear-gradient(90deg, var(--dpd-soft), transparent 85%); border-left: 2px solid var(--dpd-line); }
#chat .dpd-badge { flex: none; font-style: normal; font-size: 0.62rem; font-weight: 700; line-height: 1.1; padding: 0.16rem 0.4rem; border-radius: 0.3rem; letter-spacing: 0.08em; border: 1px solid var(--dpd-line); background: transparent; transform: translateY(-1px); }
#chat .dpd-badge.is-ok { color: var(--dpd-good); border-color: var(--dpd-good); }
#chat .dpd-badge.is-warn { color: var(--dpd-accent); border-color: var(--dpd-line); }
#chat .dpd-badge.is-bad { color: #b23c2e; border-color: rgba(178, 60, 46, 0.55); }
#chat .dpd-badge.is-dim { color: var(--dpd-muted); border-color: var(--dpd-line); }
#chat .dpd-row-sub { flex-basis: 100%; color: var(--dpd-muted); font-size: 0.68rem; line-height: 1.5; padding-left: 0.12rem; }
#chat .dpd-entry-sub { margin-left: 0.4rem; font-size: 0.62rem; line-height: 1.4; color: var(--dpd-muted); border: 1px solid var(--dpd-line); border-radius: 0.3rem; padding: 0.05rem 0.32rem; opacity: 0.85; }
#chat .dpd-pre-detail li::before { content: '◆'; color: var(--dpd-accent); font-size: 0.55rem; flex: none; transform: translateY(-1px); }
#chat .dpd-pre-detail li b { flex: none; font-weight: 600; color: var(--dpd-accent); }
#chat .dpd-pre-detail li span { color: var(--dpd-ink); }
#chat .dpd-pre-entries { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 0.3rem 0.5rem; }
#chat .dpd-pre-note { font-size: 0.7rem; color: var(--dpd-muted); line-height: 1.6; border-top: 1px dashed var(--dpd-line); padding-top: 0.4rem; margin-top: 0.15rem; }
/* 动效：入场浮起 + 异火呼吸；系统开了「减少动态效果」就全部静止 */
@keyframes dpd-rise { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }
@keyframes dpd-flicker { 0%, 100% { transform: rotate(45deg) scale(1); opacity: 0.85; } 30% { transform: rotate(45deg) scale(1.14); opacity: 1; } 55% { transform: rotate(45deg) scale(0.94); opacity: 0.78; } 78% { transform: rotate(45deg) scale(1.07); opacity: 0.95; } }
@media (prefers-reduced-motion: reduce) {
  #chat .dpd-world-card, #chat .dpd-pre-card { animation: none; }
  #chat.doupo-dress > .mes[is_user="true"] + .mes[is_user="false"]::after { animation: none; }
}
/* —— 页面级主题 token：正文排版 / 周边 / 思考条挂 body 上，#chat 外的部件也能用 —— */
/* 视口锁：美化开着时 document 一寸都不能滚——表情面板等在文档尾部多出的占位高度
   一旦被（焦点/锚点这类浏览器原生行为）滚进视野，整个界面就会被顶上去半截，
   窗口下面露出案台底色，看起来就是「整个聊天悬在半空」。 */
html.doupo-vp-lock, html.doupo-vp-lock body { overflow: hidden !important; }
body.doupo-dress-page[data-dress-theme="gilt"] { --dpd-accent: #d9a72b; --dpd-hi: #f6dd9a; --dpd-line: rgba(217, 167, 43, 0.38); --dpd-soft: rgba(217, 167, 43, 0.12); --dpd-surface: #221b10; --dpd-ink: #f0e6cd; --dpd-muted: #ab966f; --dpd-good: #9cc78c; --dpd-dialogue: #f6dd9a; }
body.doupo-dress-page[data-dress-theme="graphite"] { --dpd-accent: #3ecfa5; --dpd-hi: #b7f0dd; --dpd-line: rgba(62, 207, 165, 0.34); --dpd-soft: rgba(62, 207, 165, 0.1); --dpd-surface: #121b17; --dpd-ink: #ddebe3; --dpd-muted: #83a695; --dpd-good: #43b06d; --dpd-dialogue: #b7f0dd; }
body.doupo-dress-page[data-dress-theme="parchment"] { --dpd-accent: #b4452f; --dpd-hi: #7d2f20; --dpd-line: rgba(180, 69, 47, 0.4); --dpd-soft: rgba(180, 69, 47, 0.08); --dpd-surface: #fbf6ea; --dpd-ink: #3c3122; --dpd-muted: #8a7458; --dpd-good: #4a7a3a; --dpd-dialogue: #eac9a8; }
/* ⑥ 正文章回排版：段距拉开、段段首行缩进、重点字染hi色、引文块当批注、横线当鎏金纹 */
body.doupo-dress-page #chat .mes_text { line-height: 1.92; }
body.doupo-dress-page #chat .mes_text p { margin: 0.7em 0; }
body.doupo-dress-page #chat .mes_text:not(:has(.custom-dpz-floor-veil)) p + p { text-indent: 2em; }
body.doupo-dress-page #chat .mes_text b, body.doupo-dress-page #chat .mes_text strong { color: var(--dpd-hi); font-weight: 600; }
body.doupo-dress-page #chat .mes_text hr { border: 0; height: 1px; margin: 1.1em 12%; background: linear-gradient(90deg, transparent, var(--dpd-accent), transparent); opacity: 0.55; }
body.doupo-dress-page #chat .mes_text blockquote { margin: 0.8em 0; padding: 0.5em 0.9em; border-left: 2px solid var(--dpd-accent); background: linear-gradient(90deg, var(--dpd-soft), transparent 85%); border-radius: 0.35rem; color: var(--dpd-ink); }
body.doupo-dress-page #chat .mes_text code { background: var(--dpd-soft); border: 1px solid var(--dpd-line); border-radius: 0.3rem; padding: 0.05em 0.35em; color: var(--dpd-accent); }
${CONFIG.proseSerif ? `body.doupo-dress-page #chat .mes_text { font-family: "Noto Serif SC", "Source Han Serif SC", "STZhongsong", "SimSun", serif; }` : ''}
/* ⑦ 楼头与周边：名牌鎏金、头像斗气圈、主题滚动条与选区、输入玉牒聚焦光 */
body.doupo-dress-page #chat .mes .name_text { font: 600 0.94rem/1.2 "Noto Serif SC", "STZhongsong", serif; letter-spacing: 0.08em; background: linear-gradient(180deg, var(--dpd-hi), var(--dpd-accent)); -webkit-background-clip: text; background-clip: text; color: var(--dpd-accent); -webkit-text-fill-color: transparent; }
body.doupo-dress-page #chat .mes .avatar img { box-shadow: 0 0 0 1px var(--dpd-line), 0 0 0 3px var(--dpd-soft), 0 0 10px var(--dpd-soft); }
body.doupo-dress-page #chat::-webkit-scrollbar { width: 8px; }
body.doupo-dress-page #chat::-webkit-scrollbar-thumb { background: var(--dpd-line); border-radius: 4px; }
body.doupo-dress-page #chat::-webkit-scrollbar-thumb:hover { background: var(--dpd-accent); }
body.doupo-dress-page #chat::-webkit-scrollbar-track { background: transparent; }
body.doupo-dress-page #chat ::selection { background: var(--dpd-accent); color: var(--dpd-surface); }
body.doupo-dress-page #send_textarea { caret-color: var(--dpd-accent); border: 1px solid transparent; border-radius: 0.5rem; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
body.doupo-dress-page #send_textarea:focus { border-color: var(--dpd-line); box-shadow: 0 0 0 1px var(--dpd-soft), 0 0 14px var(--dpd-soft); outline: none; }
body.doupo-dress-page #send_textarea::placeholder { color: var(--dpd-muted); opacity: 0.85; }
/* ⑧ 炼字浮牌：生成期间角落一枚呼吸的小火苗 */
body.doupo-dress-page .dpd-crafting-badge { position: fixed; right: 1.1rem; bottom: 5.4rem; z-index: 1200; display: flex; align-items: center; gap: 0.5rem; padding: 0.46rem 0.75rem; border-radius: 0.55rem; background: var(--dpd-surface); border: 1px solid var(--dpd-line); box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35), 0 0 12px var(--dpd-soft); color: var(--dpd-ink); font: 500 0.74rem/1 "Noto Serif SC", "STZhongsong", serif; letter-spacing: 0.12em; pointer-events: none; opacity: 0; transform: translateY(6px); transition: opacity 0.25s ease, transform 0.25s ease; }
body.doupo-crafting .dpd-crafting-badge { opacity: 1; transform: none; }
body.doupo-dress-page .dpd-crafting-flame { width: 0.55rem; height: 0.55rem; flex: none; border-radius: 0 50% 50% 50%; transform: rotate(45deg); background: linear-gradient(135deg, var(--dpd-hi), var(--dpd-accent)); box-shadow: 0 0 8px var(--dpd-soft); animation: dpd-flicker 1.6s ease-in-out infinite; }
/* ⑨ 整体窗景：聊天窗整窗换装——案台深底，聊天柱是一整张卷轴面，楼块隐入纸面，
   顶栏与输入区随色；只换颜色底纹，不动任何结构，预设的东西一概不碰 */
body.doupo-dress-page.doupo-window[data-dress-theme="gilt"] { --dpd-desk: #15100a; --dpd-desk2: #1e1710; --dpd-paper: #211a12; --dpd-paper2: #191410; --dpd-scroll-line: rgba(217, 167, 43, 0.45); --dpd-prose: #f0e6cd; --dpd-prose-dialogue: #f6dd9a; --dpd-prose-glow: 0 0 16px rgba(217, 167, 43, 0.12); --dpd-user-tint: rgba(217, 167, 43, 0.05); --dpd-card-surface: #262017; }
body.doupo-dress-page.doupo-window[data-dress-theme="graphite"] { --dpd-desk: #0d1412; --dpd-desk2: #121b17; --dpd-paper: #14201b; --dpd-paper2: #101815; --dpd-scroll-line: rgba(62, 207, 165, 0.4); --dpd-prose: #ddebe3; --dpd-prose-dialogue: #b7f0dd; --dpd-prose-glow: 0 0 16px rgba(62, 207, 165, 0.1); --dpd-user-tint: rgba(62, 207, 165, 0.045); --dpd-card-surface: #17231e; }
body.doupo-dress-page.doupo-window[data-dress-theme="parchment"] { --dpd-desk: #261c12; --dpd-desk2: #33261a; --dpd-paper: #f6efdd; --dpd-paper2: #eee3c8; --dpd-scroll-line: rgba(180, 69, 47, 0.4); --dpd-prose: #3c3122; --dpd-prose-dialogue: #a8522f; --dpd-prose-glow: none; --dpd-user-tint: rgba(180, 69, 47, 0.045); --dpd-card-surface: #fffdf4; }
body.doupo-dress-page.doupo-window { background: radial-gradient(130% 100% at 50% 0%, var(--dpd-desk2), var(--dpd-desk) 72%) !important; }
/* 顶栏与输入区给一层实底案台色（原先是透明——别人导入后输入框、发送键和左下角功能键
   全都悬空飘在背景上；实底随主题变色，既留换装观感又落回桌面） */
body.doupo-dress-page.doupo-window #top-bar, body.doupo-dress-page.doupo-window #form_sheld { background: var(--dpd-desk) !important; }
body.doupo-dress-page.doupo-window #sheld { background: linear-gradient(180deg, var(--dpd-paper), var(--dpd-paper2)) !important; box-shadow: inset 2px 0 0 var(--dpd-scroll-line), inset -2px 0 0 var(--dpd-scroll-line), 0 0 44px rgba(0, 0, 0, 0.45); }
body.doupo-dress-page.doupo-window #chat { background: transparent !important; }
body.doupo-dress-page.doupo-window #chat > .mes { background: transparent !important; }
body.doupo-dress-page.doupo-window #chat > .mes[is_user="true"] { background: linear-gradient(90deg, var(--dpd-user-tint), transparent 62%) !important; }
body.doupo-dress-page.doupo-window #chat .mes_text { color: var(--dpd-prose); }
body.doupo-dress-page.doupo-window #chat .mes_text .dpd-dialogue { color: var(--dpd-prose-dialogue); text-shadow: var(--dpd-prose-glow); }
body.doupo-dress-page.doupo-window #chat .mes .ch_name { color: var(--dpd-prose); }
body.doupo-dress-page.doupo-window #chat .dpd-world-card, body.doupo-dress-page.doupo-window #chat .dpd-pre-card { --dpd-surface: var(--dpd-card-surface); }
body.doupo-dress-page.doupo-window #send_textarea { color: var(--dpd-prose) !important; }
/* ⑩ 斗破焰装：案台暖光 + 纸面烛光晕染 + 章首焰字 + 卷尾落款
   （余烬粒子已删：飘动的光点在别的机器上像悬浮杂物，案台只留一层静态暖光） */
body.doupo-dress-page.doupo-window.doupo-blaze { background: radial-gradient(60% 34% at 50% 104%, rgba(255, 122, 40, 0.15), transparent 70%), radial-gradient(130% 100% at 50% 0%, var(--dpd-desk2), var(--dpd-desk) 72%) !important; }
/* #sheld 原版是 absolute（顶栏下、贴合窗口底），绝不能改 position——
   改成 relative 会掉进文档流、再吃一层原版 top 偏移，把输入区挤出窗口；
   它本身就是 positioned 元素，::before/::after 装饰与 z-index 直接生效。 */
body.doupo-blaze #sheld { z-index: 1; }
/* 卡内旧拷贝还在刷 position:relative——双类选择器压过它，把原版的 absolute 钉回去 */
body.doupo-dress-page.doupo-blaze #sheld { position: absolute; }
/* 纸面氛围：不用任何字——顶上一束烛光、底部一道沉影、边缘轻轻收晕；卷轴面加一道内框细线 */
body.doupo-blaze #sheld::before { content: ''; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(52% 32% at 50% 0%, rgba(255, 190, 120, 0.12), transparent 72%), radial-gradient(85% 40% at 50% 104%, rgba(118, 66, 26, 0.12), transparent 74%), radial-gradient(125% 92% at 50% 46%, transparent 62%, rgba(88, 48, 18, 0.08) 100%); }
body.doupo-blaze #sheld::after { content: ''; position: absolute; inset: 6px; border: 1px solid var(--dpd-line); border-radius: 0.55rem; opacity: 0.4; pointer-events: none; }
body.doupo-blaze .dpd-dropcap { float: left; font: 700 2.6em/0.86 "Noto Serif SC", "STZhongsong", serif; margin: 0.05em 0.13em 0 0; color: var(--dpd-accent); text-shadow: 0 0 16px var(--dpd-soft); }
.dpd-tail-seal { display: flex; align-items: center; justify-content: center; gap: 0.7rem; margin: 0.95rem 0 0.1rem; padding-top: 0.55rem; border-top: 1px dashed var(--dpd-line); color: var(--dpd-muted); font: 500 0.72rem/1 "Noto Serif SC", "STZhongsong", serif; letter-spacing: 0.32em; }
.dpd-tail-seal i { width: 0.34rem; height: 0.34rem; flex: none; transform: rotate(45deg); background: var(--dpd-accent); box-shadow: 0 0 7px var(--dpd-soft); }
body.doupo-blaze #chat::-webkit-scrollbar-thumb { background: linear-gradient(180deg, var(--dpd-accent), var(--dpd-hi)); }
/* —— v6.13 全账弹窗：签上的「全」印点开一张大卷轴，账本全量分节铺开（像悬浮球的明细弹层） —— */
/* 弹窗挂在 body 上（#chat 外），主题 token 走 body.doupo-dress-page 那套；所以这里不掺 #chat 前缀 */
.dpd-view-head { display: flex; align-items: flex-start; gap: 0.5rem; }
.dpd-view-head .dpd-pre-summary { flex: 1 1 auto; min-width: 0; }
.dpd-pre-summary.is-clickable { cursor: pointer; border-radius: 0.35rem; }
.dpd-pre-summary.is-clickable:hover { color: var(--dpd-accent); }
.dpd-full-btn { flex: none; appearance: none; width: 1.5rem; height: 1.5rem; border-radius: 0.4rem; display: grid; place-items: center; cursor: pointer; border: 1px solid var(--dpd-line); background: linear-gradient(160deg, var(--dpd-soft), transparent 130%); color: var(--dpd-accent); font: 700 0.66rem/1 "Noto Serif SC", "STZhongsong", serif; letter-spacing: 0.08em; transition: color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease; }
.dpd-full-btn:hover, .dpd-full-btn.is-active { color: var(--dpd-surface, #221b10); background: linear-gradient(160deg, var(--dpd-hi, #f6dd9a) -25%, var(--dpd-accent, #d9a72b) 70%); box-shadow: 0 0 10px var(--dpd-soft); }
#chat .dpd-world-card .dpd-full-btn-float { position: absolute; top: 0.5rem; right: 1.4rem; z-index: 2; }
#dpd-popup-layer { position: fixed; inset: 0; z-index: 3000; display: grid; place-items: center; padding: 1rem; background: rgba(8, 5, 2, 0.52); }
#dpd-popup-layer[hidden] { display: none; }
.dpd-popup { position: relative; width: min(46rem, 100vw - 2rem); max-height: min(38rem, 100dvh - 2rem); display: flex; flex-direction: column; overflow: hidden; border-radius: 0.8rem; border: 1px solid var(--dpd-line); background: radial-gradient(130% 105% at 50% 0%, var(--dpd-soft), transparent 62%), var(--dpd-card-surface, var(--dpd-surface, #221b10)); color: var(--dpd-ink); box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55), 0 0 24px var(--dpd-soft); animation: dpd-rise 0.3s cubic-bezier(0.22, 0.7, 0.3, 1) both; }
.dpd-popup::before { content: ''; position: absolute; top: 0; left: 9%; right: 9%; height: 1px; background: linear-gradient(90deg, transparent, var(--dpd-accent) 30%, var(--dpd-hi) 50%, var(--dpd-accent) 70%, transparent); opacity: 0.6; pointer-events: none; }
.dpd-popup .dpd-strip-corner { position: absolute; width: 0.62rem; height: 0.62rem; pointer-events: none; opacity: 0.95; }
.dpd-popup .dpd-strip-corner.tl { top: 4px; left: 4px; border-top: 2px solid var(--dpd-accent); border-left: 2px solid var(--dpd-accent); border-top-left-radius: 4px; }
.dpd-popup .dpd-strip-corner.tr { top: 4px; right: 4px; border-top: 2px solid var(--dpd-accent); border-right: 2px solid var(--dpd-accent); border-top-right-radius: 4px; }
.dpd-popup .dpd-strip-corner.bl { bottom: 4px; left: 4px; border-bottom: 2px solid var(--dpd-accent); border-left: 2px solid var(--dpd-accent); border-bottom-left-radius: 4px; }
.dpd-popup .dpd-strip-corner.br { bottom: 4px; right: 4px; border-bottom: 2px solid var(--dpd-accent); border-right: 2px solid var(--dpd-accent); border-bottom-right-radius: 4px; }
.dpd-popup-head { display: flex; align-items: center; gap: 0.6rem; padding: 0.66rem 0.9rem 0.55rem; border-bottom: 1px solid var(--dpd-line); }
.dpd-popup .dpd-pre-seal { width: 1.9rem; height: 1.9rem; flex: none; border-radius: 0.45rem; display: grid; place-items: center; font: 600 0.9rem/1 "Noto Serif SC", "STZhongsong", serif; color: var(--dpd-surface, #221b10); background: linear-gradient(160deg, var(--dpd-hi, #f6dd9a) -25%, var(--dpd-accent, #d9a72b) 70%); border: 1px solid var(--dpd-line); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 0 10px var(--dpd-soft), 0 1px 4px rgba(0, 0, 0, 0.22); }
.dpd-popup-title { display: flex; flex-direction: column; gap: 0.14rem; min-width: 0; }
.dpd-popup-title b { font-family: "Noto Serif SC", "STZhongsong", serif; font-weight: 600; letter-spacing: 0.12em; font-size: 1.02rem; background: linear-gradient(180deg, var(--dpd-hi), var(--dpd-accent)); -webkit-background-clip: text; background-clip: text; color: var(--dpd-accent); -webkit-text-fill-color: transparent; filter: drop-shadow(0 0 6px var(--dpd-soft)); }
.dpd-popup-title small { color: var(--dpd-muted); font-size: 0.68rem; letter-spacing: 0.05em; }
.dpd-popup-close { margin-left: auto; flex: none; appearance: none; width: 1.7rem; height: 1.7rem; border-radius: 50%; border: 1px solid var(--dpd-line); background: var(--dpd-soft); color: var(--dpd-muted); font-size: 0.78rem; display: grid; place-items: center; cursor: pointer; transition: color 0.15s ease, box-shadow 0.15s ease; }
.dpd-popup-close:hover { color: var(--dpd-accent); box-shadow: 0 0 10px var(--dpd-soft); }
.dpd-popup-body { overflow-y: auto; padding: 0.55rem 0.95rem 0.85rem; font-size: 0.8rem; display: grid; gap: 0.2rem; }
.dpd-popup-body::-webkit-scrollbar { width: 8px; }
.dpd-popup-body::-webkit-scrollbar-thumb { background: var(--dpd-line); border-radius: 4px; }
.dpd-popup-body::-webkit-scrollbar-thumb:hover { background: var(--dpd-accent); }
.dpd-popup-body::-webkit-scrollbar-track { background: transparent; }
.dpd-pp-section { display: grid; gap: 0.4rem; padding-top: 0.45rem; }
.dpd-pp-section + .dpd-pp-section { border-top: 1px dashed var(--dpd-line); margin-top: 0.4rem; padding-top: 0.72rem; }
.dpd-pp-title { font: 600 0.84rem/1.3 "Noto Serif SC", "STZhongsong", serif; color: var(--dpd-accent); letter-spacing: 0.14em; display: flex; align-items: baseline; gap: 0.45rem; }
.dpd-pp-title::before { content: '◆'; font-size: 0.55rem; }
.dpd-pp-title small { color: var(--dpd-muted); font: 400 0.66rem/1.3 system-ui, sans-serif; letter-spacing: 0.04em; }
.dpd-pp-kv { display: grid; grid-template-columns: repeat(auto-fill, minmax(13.5rem, 1fr)); gap: 0.3rem 0.7rem; }
.dpd-pp-row { display: flex; gap: 0.5rem; align-items: baseline; font-size: 0.78rem; line-height: 1.7; padding: 0.3rem 0.55rem; border-radius: 0.4rem; background: linear-gradient(90deg, var(--dpd-soft), transparent 85%); border-left: 2px solid var(--dpd-line); min-width: 0; }
.dpd-pp-row b { flex: none; color: var(--dpd-accent); font-weight: 600; font-size: 0.72rem; letter-spacing: 0.06em; }
.dpd-pp-row > span { min-width: 0; word-break: break-word; white-space: pre-wrap; }
.dpd-pp-num { font-weight: 700; color: var(--dpd-ink); }
.dpd-pp-num.is-pos { color: var(--dpd-good); }
.dpd-pp-num.is-neg { color: #b23c2e; }
.dpd-pp-empty { color: var(--dpd-muted); font-size: 0.76rem; line-height: 1.6; padding: 0.3rem 0.1rem; }
.dpd-pp-note { color: var(--dpd-muted); font-size: 0.7rem; line-height: 1.6; }
.dpd-pp-fold { border: 1px solid var(--dpd-line); border-radius: 0.5rem; background: linear-gradient(180deg, var(--dpd-soft), transparent 140%); overflow: hidden; min-width: 0; }
.dpd-pp-fold > summary { list-style: none; cursor: pointer; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.45rem; padding: 0.44rem 0.65rem; font-size: 0.78rem; user-select: none; }
.dpd-pp-fold > summary::-webkit-details-marker { display: none; }
.dpd-pp-fold > summary::before { content: '◆'; color: var(--dpd-accent); font-size: 0.55rem; transition: transform 0.15s ease; }
.dpd-pp-fold[open] > summary::before { transform: rotate(45deg); }
.dpd-pp-fold > summary b { color: var(--dpd-ink); font-weight: 600; }
.dpd-pp-fold > summary small { color: var(--dpd-muted); font-size: 0.66rem; }
.dpd-pp-fold-body { display: grid; gap: 0.32rem; padding: 0.45rem 0.7rem 0.6rem; border-top: 1px dashed var(--dpd-line); }
.dpd-popup .dpd-badge { flex: none; font-style: normal; font-size: 0.62rem; font-weight: 700; line-height: 1.1; padding: 0.16rem 0.4rem; border-radius: 0.3rem; letter-spacing: 0.08em; border: 1px solid var(--dpd-line); background: transparent; transform: translateY(-1px); }
.dpd-popup .dpd-badge.is-ok { color: var(--dpd-good); border-color: var(--dpd-good); }
.dpd-popup .dpd-badge.is-warn { color: var(--dpd-accent); border-color: var(--dpd-line); }
.dpd-popup .dpd-badge.is-bad { color: #b23c2e; border-color: rgba(178, 60, 46, 0.55); }
.dpd-popup .dpd-badge.is-dim { color: var(--dpd-muted); border-color: var(--dpd-line); }
@media (prefers-reduced-motion: reduce) { .dpd-popup { animation: none; } }
`;

    function ensureStyle() {
        let style = doc.getElementById(STYLE_ID);
        if (!style) {
            style = doc.createElement('style');
            style.id = STYLE_ID;
            (doc.head ?? doc.documentElement).append(style);
        }
        style.textContent = STYLE_TEXT;
    }

    // ---- DOM 组装 ----
    const chatElement = () => doc.getElementById('chat');
    const floorElement = index => chatElement()?.querySelector(`.mes[mesid="${index}"]`) ?? null;

    function lastAiIndex(chat) {
        for (let index = chat.length - 1; index >= 0; index--) {
            const message = chat[index];
            if (message?.mes && message.is_user !== true && message.is_system !== true) return index;
        }
        return -1;
    }

    async function readNajie(chat, index) {
        const getVariables = window.TavernHelper?.getVariables ?? helper?.getVariables ?? null;
        if (typeof getVariables === 'function') {
            try {
                const vars = await getVariables.call(helper ?? window.TavernHelper, { type: 'message', message_id: index });
                const najie = vars?.stat_data?.['斗破纳戒'];
                if (najie && typeof najie === 'object') return najie;
            } catch { /* 落到本地兜底 */ }
        }
        const local = chat[index]?.variables?.stat_data?.['斗破纳戒'];
        return local && typeof local === 'object' ? local : null;
    }

    function clearStrip(floorEl) {
        floorEl?.querySelectorAll(':scope .dpd-floor-strip, :scope .dpd-world-card, :scope .dpd-floor-strip-detail').forEach(el => el.remove());
    }

    /** 观世牌：世界运转的当下面貌，挂在正文上方；一张整卡，明细在卡肚里展开。 */
    function ensureWorldCard(floorEl, spec) {
        if (!floorEl) return;
        const anchor = floorEl.querySelector('.mes_text');
        if (!anchor) return;
        const parent = anchor.parentElement ?? floorEl;
        clearStrip(floorEl);
        if (!spec) return;
        const card = doc.createElement('aside');
        card.className = 'dpd-world-card';
        const mark = doc.createElement('i');
        mark.className = 'dpd-card-mark';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = '斗气大陆';
        card.append(mark);
        for (const pos of ['tl', 'tr', 'bl', 'br']) {
            const corner = doc.createElement('i');
            corner.className = `dpd-strip-corner ${pos}`;
            corner.setAttribute('aria-hidden', 'true');
            card.append(corner);
        }
        const fullBtn = doc.createElement('button');
        fullBtn.type = 'button';
        fullBtn.className = 'dpd-full-btn dpd-full-btn-float';
        fullBtn.textContent = '全';
        fullBtn.title = '世界全账（天时 · 风云 · 任务 · 势力 · 流水）';
        fullBtn.setAttribute('aria-label', '展开世界全账');
        fullBtn.dataset.popupKey = 'world';
        fullBtn.addEventListener('click', event => {
            event.stopPropagation();
            if (typeof spec.full === 'function') spec.full();
        });
        card.append(fullBtn);
        const head = doc.createElement('div');
        head.className = 'dpd-strip-head';
        const seal = doc.createElement('span');
        seal.className = 'dpd-strip-seal';
        seal.setAttribute('aria-hidden', 'true');
        seal.textContent = '世';
        const title = doc.createElement('span');
        title.className = 'dpd-strip-title';
        const name = doc.createElement('b');
        name.textContent = '观世';
        const caption = doc.createElement('small');
        caption.textContent = '天时 · 所在 · 风云——点「全」看世界全账';
        title.append(name, caption);
        head.append(seal, title);
        card.append(head);
        const chips = doc.createElement('span');
        chips.className = 'dpd-strip-chips';
        for (const field of spec.chips) {
            const chip = doc.createElement('span');
            chip.className = 'dpd-chip';
            const label = doc.createElement('small');
            label.textContent = field.label;
            chip.append(label);
            const value = doc.createElement('b');
            value.textContent = field.value;
            chip.append(value);
            chips.append(chip);
        }
        card.append(chips);
        parent.insertBefore(card, anchor);
    }

    /** 世界账本 → 观世牌的料：时辰/所在/天气/大势 四签，外加世界事件明细。 */
    function buildWorldCardFields(worldMeta) {
        if (!worldMeta || typeof worldMeta !== 'object') return null;
        const clock = worldMeta.clock ?? {};
        const info = worldMeta.info ?? {};
        const day = Number(clock.day);
        const minute = Number(clock.minute);
        const time = Number.isFinite(day) && Number.isFinite(minute) && minute >= 0
            ? `第 ${day} 天 ${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}`
            : (Number.isFinite(day) ? `第 ${day} 天` : '');
        const chips = [];
        if (time) chips.push({ label: '时辰', value: time });
        const where = String(info.location ?? '').replace(/（[^）]*）\s*$/, '').trim();
        if (where) chips.push({ label: '所在', value: where.slice(0, 20) });
        const weather = String(info.weather ?? '').trim();
        if (weather) chips.push({ label: '天气', value: weather.slice(0, 14) });
        const tension = TENSION_TEXT[String(worldMeta.tension ?? '').trim()] || String(worldMeta.tension ?? '').trim();
        if (tension) chips.push({ label: '大势', value: tension.slice(0, 10) });
        if (!chips.length) return null;
        const rows = [];
        const events = Array.isArray(worldMeta.worldEvents) ? worldMeta.worldEvents.slice(0, 4) : [];
        for (const event of events) {
            const title = String(event?.title ?? '').trim();
            if (title) rows.push({ label: '', status: '', detail: `${title}（第 ${Number(event?.day) || '?'} 天起）` });
        }
        return { chips, rows };
    }

    function clearPre(floorEl) {
        floorEl?.querySelectorAll(':scope .dpd-pre-card').forEach(el => el.remove());
    }

    function buildPreDetail(section) {
        if (!section.detail) return null;
        const detail = doc.createElement('div');
        detail.className = 'dpd-pre-detail';
        if (section.detail.kind === 'entries') {
            const list = doc.createElement('ul');
            list.className = 'dpd-pre-entries';
            for (const entry of section.detail.entries) {
                const li = doc.createElement('li');
                li.append(doc.createTextNode(String(entry?.title ?? '')));
                if (entry?.sub) {
                    const sub = doc.createElement('small');
                    sub.className = 'dpd-entry-sub';
                    sub.textContent = entry.sub;
                    li.append(sub);
                }
                list.append(li);
            }
            if (section.detail.more > 0) {
                const more = doc.createElement('li');
                more.textContent = `……另外 ${section.detail.more} 条`;
                list.append(more);
            }
            detail.append(list);
            if (section.detail.truncated) {
                const note = doc.createElement('div');
                note.className = 'dpd-pre-note';
                note.textContent = '本轮按预算截断，只注入了装得下的部分。';
                detail.append(note);
            }
        } else if (section.detail.kind === 'list') {
            const list = doc.createElement('ul');
            for (const row of section.detail.rows) {
                const li = doc.createElement('li');
                if (row.badge) {
                    const badge = doc.createElement('i');
                    badge.className = `dpd-badge is-${row.badgeKind ?? 'dim'}`;
                    badge.textContent = row.badge;
                    badge.setAttribute('aria-hidden', 'true');
                    li.append(badge);
                }
                if (row.label) {
                    const label = doc.createElement('b');
                    label.textContent = row.label;
                    li.append(label);
                }
                if (row.detail) {
                    const text = doc.createElement('span');
                    text.textContent = row.detail;
                    li.append(text);
                }
                if (row.sub) {
                    const sub = doc.createElement('small');
                    sub.className = 'dpd-row-sub';
                    sub.textContent = row.sub;
                    li.append(sub);
                }
                list.append(li);
            }
            detail.append(list);
            if (section.detail.note) {
                const note = doc.createElement('div');
                note.className = 'dpd-pre-note';
                note.textContent = section.detail.note;
                detail.append(note);
            }
        } else if (section.detail.kind === 'note') {
            const note = doc.createElement('div');
            note.className = 'dpd-pre-note';
            note.textContent = section.detail.note;
            detail.append(note);
        }
        return detail;
    }

    /** 楼层切换签面板（生成前 / 正文后共用）：三枚签，点签换内容。 */
    let panelSeq = 0;
    function ensureTabsPanel(floorEl, sections, header) {
        if (!floorEl) return;
        const anchor = floorEl.querySelector('.mes_text');
        if (!anchor) return;
        const parent = anchor.parentElement ?? floorEl;
        clearPre(floorEl);
        if (!sections || !sections.length) return;
        panelSeq += 1;
        const uid = `dpd-p${panelSeq}`;
        const card = doc.createElement('aside');
        card.className = 'dpd-pre-card';
        for (const pos of ['tl', 'tr', 'bl', 'br']) {
            const corner = doc.createElement('i');
            corner.className = `dpd-strip-corner ${pos}`;
            corner.setAttribute('aria-hidden', 'true');
            card.append(corner);
        }
        const head = doc.createElement('header');
        head.className = 'dpd-pre-head';
        const seal = doc.createElement('span');
        seal.className = 'dpd-pre-seal';
        seal.setAttribute('aria-hidden', 'true');
        seal.textContent = header.seal;
        const title = doc.createElement('b');
        title.textContent = header.title;
        const caption = doc.createElement('small');
        caption.textContent = header.caption;
        head.append(seal, title, caption);
        card.append(head);
        const tablist = doc.createElement('div');
        tablist.className = 'dpd-pre-tabs';
        tablist.setAttribute('role', 'tablist');
        tablist.setAttribute('aria-label', header.title);
        const views = [];
        let defaultIndex = sections.findIndex(section => section.summary.startsWith('✓'));
        if (defaultIndex < 0) defaultIndex = 0;
        sections.forEach((section, index) => {
            const tab = doc.createElement('button');
            tab.type = 'button';
            tab.className = 'dpd-pre-tab';
            tab.setAttribute('role', 'tab');
            tab.id = `${uid}-tab-${index}`;
            tab.setAttribute('aria-controls', `${uid}-view-${index}`);
            tab.append(doc.createTextNode(section.label));
            const glyph = section.summary.startsWith('✓') ? '✓' : section.summary.startsWith('·') ? '!' : '·';
            const mark = doc.createElement('small');
            mark.textContent = glyph;
            mark.setAttribute('aria-hidden', 'true');
            tab.append(mark);
            const view = doc.createElement('div');
            view.className = 'dpd-pre-view';
            view.setAttribute('role', 'tabpanel');
            view.id = `${uid}-view-${index}`;
            view.setAttribute('aria-labelledby', tab.id);
            const summary = doc.createElement('div');
            summary.className = 'dpd-pre-summary';
            const lead = section.summary.slice(0, 1);
            if (lead === '✓' || lead === '○' || lead === '·') {
                const statusMark = doc.createElement('i');
                statusMark.className = lead === '✓' ? 'is-ok' : '';
                statusMark.textContent = lead;
                statusMark.setAttribute('aria-hidden', 'true');
                summary.append(statusMark, doc.createTextNode(section.summary.slice(1).trimStart()));
            } else {
                summary.textContent = section.summary;
            }
            const viewHead = doc.createElement('div');
            viewHead.className = 'dpd-view-head';
            viewHead.append(summary);
            if (typeof section.full === 'function') {
                const fullBtn = doc.createElement('button');
                fullBtn.type = 'button';
                fullBtn.className = 'dpd-full-btn';
                fullBtn.textContent = '全';
                fullBtn.title = `展开「${section.label}」全账`;
                fullBtn.setAttribute('aria-label', `展开${section.label}全账`);
                fullBtn.dataset.popupKey = section.key || section.label;
                fullBtn.addEventListener('click', event => {
                    event.stopPropagation();
                    section.full();
                });
                viewHead.append(fullBtn);
                summary.classList.add('is-clickable');
                summary.addEventListener('click', () => section.full());
            }
            view.append(viewHead);
            const detail = buildPreDetail(section);
            if (detail) view.append(detail);
            views.push({ tab, view });
            tablist.append(tab);
        });
        function select(index) {
            views.forEach((item, i) => {
                item.tab.setAttribute('aria-selected', i === index ? 'true' : 'false');
                item.view.hidden = i !== index;
            });
        }
        views.forEach(item => {
            item.tab.addEventListener('click', () => select(views.indexOf(item)));
        });
        card.append(tablist);
        views.forEach(item => card.append(item.view));
        select(Math.min(defaultIndex, sections.length - 1));
        parent.append(card);
    }

    // —— 全账弹窗（v6.13）：像悬浮球那样——签上的「全」印点开一张大卷轴，账本全量分节铺开。
    // 数据在点开的瞬间现读（readAgentState / readChatKey / readNajie），永远是最新的账；
    // 原文一寸不截，行数一条不裁，分区铺开，点条目可再展开。
    const POPUP_LAYER_ID = 'dpd-popup-layer';
    let popupChatId = null;
    let popupOpenKey = null;

    function ensurePopupLayer() {
        let layer = doc.getElementById(POPUP_LAYER_ID);
        if (!layer) {
            layer = doc.createElement('div');
            layer.id = POPUP_LAYER_ID;
            layer.hidden = true;
            layer.addEventListener('click', event => { if (event.target === layer) closePopup(); });
            (doc.body ?? doc.documentElement).append(layer);
        }
        return layer;
    }

    function closePopup() {
        const layer = doc.getElementById(POPUP_LAYER_ID);
        if (layer) layer.hidden = true;
        popupOpenKey = null;
        doc.querySelectorAll('.dpd-full-btn.is-active').forEach(btn => btn.classList.remove('is-active'));
    }

    function openFullPopup(key, title, caption, seal, build) {
        const layer = ensurePopupLayer();
        if (!layer) return;
        if (popupOpenKey === key && !layer.hidden) { closePopup(); return; }
        layer.textContent = '';
        const card = doc.createElement('section');
        card.className = 'dpd-popup';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-label', title);
        for (const pos of ['tl', 'tr', 'bl', 'br']) {
            const corner = doc.createElement('i');
            corner.className = 'dpd-strip-corner ' + pos;
            corner.setAttribute('aria-hidden', 'true');
            card.append(corner);
        }
        const head = doc.createElement('header');
        head.className = 'dpd-popup-head';
        const sealEl = doc.createElement('span');
        sealEl.className = 'dpd-pre-seal';
        sealEl.setAttribute('aria-hidden', 'true');
        sealEl.textContent = seal;
        const titleEl = doc.createElement('div');
        titleEl.className = 'dpd-popup-title';
        titleEl.append(ppEl('b', '', title));
        if (caption) titleEl.append(ppEl('small', '', caption));
        const closeBtn = doc.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'dpd-popup-close';
        closeBtn.textContent = '✕';
        closeBtn.title = '收起';
        closeBtn.setAttribute('aria-label', '收起全账');
        closeBtn.addEventListener('click', closePopup);
        head.append(sealEl, titleEl, closeBtn);
        card.append(head);
        const body = doc.createElement('div');
        body.className = 'dpd-popup-body';
        card.append(body);
        layer.append(card);
        layer.hidden = false;
        popupOpenKey = key;
        doc.querySelectorAll('.dpd-full-btn.is-active').forEach(btn => btn.classList.remove('is-active'));
        doc.querySelectorAll('.dpd-full-btn[data-popup-key="' + key + '"]').forEach(btn => btn.classList.add('is-active'));
        const finish = content => {
            body.textContent = '';
            body.append(content || ppEmpty('这一栏眼下没有账。'));
        };
        try {
            const maybe = build();
            if (maybe && typeof maybe.then === 'function') {
                body.textContent = '';
                body.append(ppEmpty('正在翻账……'));
                maybe.then(finish).catch(error => finish(ppEmpty('读账失败：' + String(error?.message || error))));
            } else {
                finish(maybe);
            }
        } catch (error) {
            finish(ppEmpty('读账失败：' + String(error?.message || error)));
        }
    }

    // —— 弹窗里的小构件：一等一的原文，不再截断 ——
    function ppEl(tag, className, text) {
        const el = doc.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined && text !== null && String(text) !== '') el.textContent = text;
        return el;
    }

    function ppText(value) { return value === null || value === undefined ? '' : String(value).trim(); }

    function ppEmpty(text) { return ppEl('div', 'dpd-pp-empty', text); }
    function ppNote(text) { return ppEl('div', 'dpd-pp-note', text); }

    function ppSection(title, caption) {
        const section = ppEl('section', 'dpd-pp-section');
        const head = ppEl('div', 'dpd-pp-title');
        head.append(doc.createTextNode(title));
        if (caption) head.append(ppEl('small', '', caption));
        section.append(head);
        return section;
    }

    function ppRow(label, value) {
        const row = ppEl('div', 'dpd-pp-row');
        if (label) row.append(ppEl('b', '', label));
        const span = ppEl('span');
        const text = value === null || value === undefined ? '' : String(value).trim();
        span.textContent = text || '（空）';
        row.append(span);
        return row;
    }

    function ppKv(pairs) {
        const grid = ppEl('div', 'dpd-pp-kv');
        for (const [label, value] of pairs) {
            const text = value === null || value === undefined ? '' : String(value).trim();
            if (!text && value !== 0) continue;
            grid.append(ppRow(label, value));
        }
        return grid;
    }

    function ppBadge(text, kind) {
        return ppEl('i', 'dpd-badge ' + (kind ? 'is-' + kind : 'is-dim'), text || '');
    }

    function ppNum(value) {
        const num = Number(value);
        const span = ppEl('span', 'dpd-pp-num' + (Number.isFinite(num) && num < 0 ? ' is-neg' : Number.isFinite(num) && num > 0 ? ' is-pos' : ''));
        span.textContent = Number.isFinite(num) ? String(num) : String(value ?? '');
        return span;
    }

    function ppFold(summaryParts, bodyNodes, open) {
        const fold = doc.createElement('details');
        fold.className = 'dpd-pp-fold';
        if (open) fold.open = true;
        const summary = ppEl('summary');
        for (const part of summaryParts) summary.append(part);
        fold.append(summary);
        const body = ppEl('div', 'dpd-pp-fold-body');
        for (const node of bodyNodes) body.append(node);
        fold.append(body);
        return fold;
    }

    const TASK_STATUS_TEXT = { active: '进行中', done: '已了结', dropped: '作废', pending: '未启动' };
    const TASK_STATUS_KIND = { active: 'warn', done: 'ok', dropped: 'dim', pending: 'dim' };
    const STANCE_TEXT = { neutral: '中立', friendly: '友善', hostile: '敌对', wary: '戒备', allied: '结好' };
    const IMPACT_STATE_TEXT = { active: '生效中', archived: '已归档', ripened: '已熟成', resolved: '已了结' };

    // —— 世界全账：天时 / 任务 / 事件 / 势力 / 人物见闻 / 流水 ——
    function buildWorldFull(worldMeta) {
        if (!worldMeta || typeof worldMeta !== 'object') return ppEmpty('世界账还没有开——下一轮生成后这里会有世界的当下与风云。');
        const root = doc.createDocumentFragment();
        const clock = worldMeta.clock ?? {};
        const info = worldMeta.info ?? {};
        const day = Number(clock.day);
        const minute = Number(clock.minute);
        const time = Number.isFinite(day) && Number.isFinite(minute) && minute >= 0
            ? '第 ' + day + ' 天 ' + Math.floor(minute / 60) + ':' + String(minute % 60).padStart(2, '0')
            : (Number.isFinite(day) ? '第 ' + day + ' 天' : '');
        const tension = TENSION_TEXT[String(worldMeta.tension ?? '').trim()] || String(worldMeta.tension ?? '').trim();
        const nowSec = ppSection('当下', '世界此刻的天时地利');
        nowSec.append(ppKv([
            ['时辰', time], ['所在', info.location], ['天气', info.weather], ['大势', tension],
            ['声望', info.reputation], ['通缉', info.wanted], ['纪元', info.era],
            ['更新', fmtStamp(worldMeta.updatedAt)],
        ]));
        root.append(nowSec);
        const tasks = Array.isArray(worldMeta.tasks) ? worldMeta.tasks : [];
        const taskSec = ppSection('任务', tasks.length ? tasks.length + ' 笔' : '');
        if (!tasks.length) taskSec.append(ppEmpty('任务簿还是空的。'));
        for (const task of tasks) {
            const statusKey = String(task?.status ?? '').trim();
            const statusText = TASK_STATUS_TEXT[statusKey] || statusKey || '未知';
            taskSec.append(ppFold(
                [ppEl('b', '', ppText(task?.title) || '（无题）'), ppBadge(statusText, TASK_STATUS_KIND[statusKey] || 'dim')],
                [
                    ppRow('详情', task?.detail),
                    ppKv([
                        ['起于', task?.day != null && task.day !== '' ? '第 ' + Number(task.day) + ' 天' : ''],
                        ['期限', task?.endDay != null && task.endDay !== '' ? '第 ' + Number(task.endDay) + ' 天' : ''],
                        ['了结', task?.doneDay != null && task.doneDay !== '' ? '第 ' + Number(task.doneDay) + ' 天' : ''],
                    ]),
                    ppRow('依据', task?.basis),
                ],
                statusKey === 'active',
            ));
        }
        root.append(taskSec);
        const events = [];
        for (const event of (Array.isArray(worldMeta.worldEvents) ? worldMeta.worldEvents : [])) events.push({ event, scope: 'world' });
        for (const event of (Array.isArray(worldMeta.nearEvents) ? worldMeta.nearEvents : [])) events.push({ event, scope: 'near' });
        const eventSec = ppSection('事件风云', events.length ? events.length + ' 件（世界 + 身边）' : '');
        if (!events.length) eventSec.append(ppEmpty('还没有记下事件。'));
        for (const pair of events) {
            const event = pair.event;
            const scope = pair.scope;
            const done = event?.done === true || event?.resolvedDay != null;
            eventSec.append(ppFold(
                [
                    ppEl('b', '', ppText(event?.title) || '（无题）'),
                    ppBadge(scope === 'world' ? '世界' : '近地', scope === 'world' ? 'warn' : 'dim'),
                    ppBadge(done ? '已了' : '进行', done ? 'ok' : 'warn'),
                ],
                [
                    ppRow('经过', event?.text),
                    ppKv([
                        ['起于', event?.day != null && event.day !== '' ? '第 ' + Number(event.day) + ' 天' : ''],
                        ['至', event?.endDay != null && event.endDay !== '' ? '第 ' + Number(event.endDay) + ' 天' : ''],
                        ['了结于', event?.resolvedDay != null && event.resolvedDay !== '' ? '第 ' + Number(event.resolvedDay) + ' 天' : ''],
                        ['地点', event?.location],
                    ]),
                    ppRow('了结记', event?.resolvedNote),
                    ppRow('依据', event?.basis),
                ],
            ));
        }
        root.append(eventSec);
        const factions = Array.isArray(worldMeta.factions) ? worldMeta.factions : [];
        const factionSec = ppSection('势力', factions.length ? factions.length + ' 家' : '');
        if (!factions.length) factionSec.append(ppEmpty('还没有记下势力。'));
        for (const faction of factions) {
            const stance = STANCE_TEXT[String(faction?.stance ?? '').trim()] || String(faction?.stance ?? '').trim();
            factionSec.append(ppFold(
                [ppEl('b', '', ppText(faction?.name) || '（无名）'), ppBadge(stance || '未知', 'dim'), ppEl('small', '', ppText(faction?.type))],
                [
                    ppKv([
                        ['等级', faction?.level], ['领袖', faction?.leader], ['长老', faction?.elders],
                        ['成员', faction?.members], ['所在', faction?.location], ['立场', stance],
                        ['更新', faction?.updatedDay != null && faction.updatedDay !== '' ? '第 ' + Number(faction.updatedDay) + ' 天' : ''],
                    ]),
                    ppRow('家底', faction?.assets),
                    ppRow('动向', faction?.dynamics),
                    ppRow('关系', faction?.relations),
                    ppRow('依据', faction?.basis),
                ],
            ));
        }
        root.append(factionSec);
        const people = Array.isArray(worldMeta.people) ? worldMeta.people : [];
        const peopleSec = ppSection('人物见闻', people.length ? people.length + ' 条' : '');
        if (!people.length) peopleSec.append(ppEmpty('还没有记下人物见闻。'));
        for (const person of people) {
            peopleSec.append(ppFold(
                [ppEl('b', '', ppText(person?.name) || '（无名）')],
                [
                    ppRow('观感', person?.attitude),
                    ppKv([
                        ['记于', person?.day != null && person.day !== '' ? '第 ' + Number(person.day) + ' 天' : ''],
                        ['更新', person?.updatedDay != null && person.updatedDay !== '' ? '第 ' + Number(person.updatedDay) + ' 天' : ''],
                    ]),
                    ppRow('依据', person?.basis),
                ],
            ));
        }
        root.append(peopleSec);
        return root;
    }

    // —— 拾卷全账：本轮注入的卷宗条目 + 世界书原文 ——
    function buildFactsFull(facts, titles) {
        if (!facts || typeof facts !== 'object') return ppEmpty('本轮没有注入原著卷宗。');
        const root = doc.createDocumentFragment();
        const ids = Array.isArray(facts.usedIds) ? facts.usedIds.map(String) : [];
        const summarySec = ppSection('本轮备料');
        summarySec.append(ppKv([
            ['状态', facts.status === 'injected' ? '已注入' : facts.cleared ? '已清理' : ppText(facts.status)],
            ['条数', ids.length || ''], ['字数', Number(facts.chars) || ''], ['注入深度', facts.depth ?? ''],
            ['截断', facts.truncated ? '是（按预算装了部分）' : ''],
            ['时间', fmtClock(facts.at)], ['清理', facts.cleared ? '生成后已清出提示词' : ''],
        ]));
        root.append(summarySec);
        const listSec = ppSection('卷宗条目', ids.length ? ids.length + ' 条 · 点开看世界书原文' : '');
        if (!ids.length) listSec.append(ppEmpty('本轮没有用到卷宗条目。'));
        for (const id of ids) {
            const record = titles ? titles.get(id) : null;
            const t = splitEntryTitle((record && record.title) || '条目 ' + id);
            listSec.append(ppFold(
                [ppEl('b', '', t.main), ppEl('small', '', t.sub || 'uid ' + id)],
                record && record.content ? [ppRow('原文', record.content)] : [ppNote('（世界书里读不到这条的原文）')],
            ));
        }
        root.append(listSec);
        return root;
    }

    // —— 翻忆全账：本轮注入的记忆素材 ——
    function buildMemoryInjFull(memory) {
        if (!memory || typeof memory !== 'object') return ppEmpty('本轮没有注入记忆素材。');
        const root = doc.createDocumentFragment();
        const SOURCE_TEXT = { recall: '召回决定', keyword: '关键词兜底', manual: '手动' };
        const entries = Array.isArray(memory.entries) ? memory.entries : [];
        const ids = Array.isArray(memory.ids) ? memory.ids.filter(Boolean) : [];
        const summarySec = ppSection('本轮翻忆');
        summarySec.append(ppKv([
            ['状态', memory.status === 'injected' ? '已注入' : ppText(memory.status)],
            ['来源', SOURCE_TEXT[String(memory.source ?? '').trim()] || ppText(memory.source)],
            ['条数', entries.length || ids.length || ''], ['字数', Number(memory.chars) || ''],
            ['时间', fmtClock(memory.at)], ['清理', memory.cleared ? '生成后已清出提示词' : ''],
        ]));
        if (ppText(memory.reason)) summarySec.append(ppRow('缘由', memory.reason));
        root.append(summarySec);
        const listSec = ppSection('记忆条目', (entries.length || ids.length) ? (entries.length || ids.length) + ' 条' : '');
        if (!entries.length && !ids.length) listSec.append(ppEmpty('本轮没有勾回任何记忆。'));
        entries.forEach((entry, index) => {
            const text = typeof entry === 'string' ? entry : String(entry?.text ?? entry?.summary ?? entry?.title ?? '').trim();
            const id = typeof entry === 'object' && entry?.id != null ? entry.id : ids[index];
            if (typeof entry === 'string') {
                listSec.append(ppFold([ppEl('b', '', id != null ? '#' + id : '记忆')], [ppRow('内容', text)]));
                return;
            }
            listSec.append(ppFold(
                [
                    ppEl('b', '', ppText(entry?.title) || (id != null ? '#' + id : '（无题）')),
                    ppEl('small', '', entry?.day != null ? '第 ' + Number(entry.day) + ' 天' : ''),
                    ppBadge(ppText(entry?.tier) || ppText(entry?.tag), 'warn'),
                    ppBadge(ppText(entry?.weight), 'dim'),
                ],
                [
                    ppRow('正文', text),
                    ppRow('引文', entry?.quote),
                    ppRow('依据', entry?.basis),
                    ppKv([
                        ['别名', Array.isArray(entry?.aliases) ? entry.aliases.join('、') : ''],
                        ['关联', Array.isArray(entry?.related) ? entry.related.join('、') : ''],
                    ]),
                    ppRow('备注', entry?.note),
                ],
                index === 0,
            ));
        });
        if (!entries.length) {
            for (const id of ids) listSec.append(ppRow('#' + id, '（本轮注入时没带上全文，只有编号）'));
        }
        root.append(listSec);
        return root;
    }

    function fmtSettleEffect(effect) {
        if (!effect || typeof effect !== 'object') return String(effect ?? '');
        const field = ppText(effect.field) || '账目';
        const value = effect.value;
        const num = Number(value);
        const type = ppText(effect.type);
        const shown = Number.isFinite(num) ? (num > 0 && type === 'add' ? '+' : '') + num : ppText(value);
        const target = ppText(effect.targetId);
        const reason = ppText(effect.reason);
        return (target && target !== 'player' ? '【' + target + '】' : '') + field + ' ' + shown + (reason ? '（' + reason + '）' : '');
    }

    // —— 过秤全账：行动裁定 / 账目变动 / 驳回 / 对账 ——
    function buildSettleFull(record) {
        if (!record || typeof record !== 'object' || !Array.isArray(record.actions) || !record.actions.length) return ppEmpty('本轮没有结算记录。');
        const root = doc.createDocumentFragment();
        const summarySec = ppSection('本轮过秤');
        summarySec.append(ppKv([
            ['状态', record.status === 'injected' ? '已注入' : record.status === 'preview' ? '仅预览' : ppText(record.status)],
            ['摘要', record.summary], ['分类', record.category],
            ['判定输入楼', Number.isInteger(record.userFloor) ? '第 ' + (record.userFloor + 1) + ' 楼' : ''],
            ['落账', record.persistence === 'saved' ? '已落账' : ppText(record.persistence)],
            ['时间', fmtClock(record.at)],
        ]));
        if (ppText(record.note)) summarySec.append(ppRow('裁断说明', record.note));
        if (ppText(record.outcome)) summarySec.append(ppRow('总体结局', record.outcome));
        root.append(summarySec);
        const actionSec = ppSection('行动裁定', record.actions.length + ' 项');
        for (const action of record.actions) {
            const statusKey = String(action?.status ?? '').trim();
            const consequences = Array.isArray(action?.consequences) ? action.consequences.filter(item => typeof item === 'string' && item.trim()) : [];
            const bodyNodes = [ppRow('证据', action?.evidence), ppRow('结局', action?.outcome)];
            for (const line of consequences) bodyNodes.push(ppRow('后续', line));
            for (const effect of (Array.isArray(action?.effects) ? action.effects : [])) bodyNodes.push(ppRow('账目变动', fmtSettleEffect(effect)));
            if (Array.isArray(action?.penalties) && action.penalties.length) bodyNodes.push(ppRow('判罚', action.penalties.join('；')));
            if (Array.isArray(action?.modifiers) && action.modifiers.length) bodyNodes.push(ppRow('修正', action.modifiers.join('；')));
            if (Array.isArray(action?.dependsOn) && action.dependsOn.length) bodyNodes.push(ppRow('依赖', action.dependsOn.join('、')));
            actionSec.append(ppFold(
                [
                    ppEl('b', '', ppText(action?.label) || '（无题）'),
                    ppBadge(ACTION_STATUS_TEXT[statusKey] || statusKey, BADGE_KIND[statusKey] || 'dim'),
                    ppEl('small', '', ppText(action?.difficulty)),
                    action?.approved === false ? ppBadge('未通过', 'bad') : null,
                ].filter(Boolean),
                bodyNodes,
            ));
        }
        root.append(actionSec);
        const recordEffects = Array.isArray(record.effects) ? record.effects : [];
        if (recordEffects.length) {
            const effectSec = ppSection('账目变动', recordEffects.length + ' 笔');
            for (const effect of recordEffects) {
                const row = ppEl('div', 'dpd-pp-row');
                row.append(ppEl('b', '', ppText(effect?.field) || '变动'));
                const span = ppEl('span');
                span.append(ppNum(effect?.value));
                if (ppText(effect?.reason)) span.append(doc.createTextNode('（' + ppText(effect.reason) + '）'));
                row.append(span);
                effectSec.append(row);
            }
            root.append(effectSec);
        }
        if (Array.isArray(record.rejected) && record.rejected.length) {
            const rejectSec = ppSection('驳回');
            for (const item of record.rejected) rejectSec.append(ppRow('', typeof item === 'string' ? item : JSON.stringify(item)));
            root.append(rejectSec);
        }
        if (record.reconciliation || (Array.isArray(record.diagnostics) && record.diagnostics.length)) {
            const diagSec = ppSection('对账与诊断');
            if (record.reconciliation && typeof record.reconciliation === 'object') {
                const diffs = Array.isArray(record.reconciliation.differences) ? record.reconciliation.differences : [];
                diagSec.append(ppFold(
                    [ppEl('b', '', '对账'), ppBadge(ppText(record.reconciliation.status), 'dim')],
                    [ppRow('差异', diffs.length ? diffs.map(item => (typeof item === 'string' ? item : JSON.stringify(item))).join('\n') : '（无）')],
                ));
            }
            for (const line of (Array.isArray(record.diagnostics) ? record.diagnostics : [])) {
                diagSec.append(ppRow('', typeof line === 'string' ? line : JSON.stringify(line)));
            }
            root.append(diagSec);
        }
        return root;
    }

    const NAJIE_IDENTITY_FIELDS = ['姓名', '性别', '年龄', '种族', '出身', '所属', '斗气属性', '天赋', '境界', '段位'];
    const NAJIE_CARRY_FIELDS = ['功法', '斗技', '装备', '天材地宝', '行囊', '丹方', '器谱', '炼制'];

    // —— 纳戒全账：楼层变量原文全量 ——
    function buildNajieFull(najie) {
        if (!najie || typeof najie !== 'object') return ppEmpty('纳戒还没有账——最新楼层变量里还没有「斗破纳戒」。');
        const root = doc.createDocumentFragment();
        const read = key => { const raw = najie[key]; return raw === null || raw === undefined ? '' : String(raw).trim(); };
        const identitySec = ppSection('身份');
        identitySec.append(ppKv(NAJIE_IDENTITY_FIELDS.map(label => [label, read(label)])));
        root.append(identitySec);
        const accountSec = ppSection('账');
        if (read('金币')) {
            const goldRow = ppEl('div', 'dpd-pp-row');
            goldRow.append(ppEl('b', '', '金币'));
            const span = ppEl('span');
            span.append(ppNum(read('金币')));
            span.append(doc.createTextNode(' 枚'));
            goldRow.append(span);
            accountSec.append(goldRow);
        }
        if (read('称号')) accountSec.append(ppRow('称号', read('称号')));
        if (!accountSec.querySelector('.dpd-pp-row')) accountSec.append(ppEmpty('钱袋和称号都还空着。'));
        root.append(accountSec);
        const carrySec = ppSection('随身', '原文全量，不再截断');
        for (const label of NAJIE_CARRY_FIELDS) {
            if (!read(label)) continue;
            carrySec.append(ppFold([ppEl('b', '', label)], [ppRow('', read(label))]));
        }
        if (!carrySec.querySelector('.dpd-pp-fold')) carrySec.append(ppEmpty('行囊与身上都空着。'));
        root.append(carrySec);
        const extraSec = ppSection('其余');
        if (read('目标')) extraSec.append(ppRow('目标', read('目标')));
        if (read('外貌')) extraSec.append(ppRow('外貌', read('外貌')));
        if (read('更新时间')) extraSec.append(ppRow('更新', fmtStamp(read('更新时间'))));
        if (!extraSec.querySelector('.dpd-pp-row')) extraSec.append(ppEmpty('没有其余条目。'));
        root.append(extraSec);
        return root;
    }

    // —— 记人全账：人物簿全部在册，一人一折 ——
    function buildNpcBody(record) {
        const nodes = [];
        nodes.push(ppKv([
            ['性别', record?.gender], ['年龄', record?.age], ['身份', record?.identity],
            ['所在', record?.location], ['在场', record?.presence], ['怎么称呼我', record?.appellation],
            ['境界', record?.realm ? record.realm + (ppText(record?.stage) ? '·' + ppText(record.stage) : '') : ''],
            ['斗气', record?.qi || record?.douqi], ['体格', record?.physique],
            ['伤势', record?.injury], ['暗伤', record?.hiddenWound], ['寿数', record?.lifespan],
            ['来历', record?.origin], ['师承', record?.master], ['分量', record?.importance],
            ['来源', record?.source],
            ['初见', record?.firstFloor != null && Number.isFinite(Number(record.firstFloor)) ? '第 ' + Number(record.firstFloor) + ' 楼' : ''],
            ['最近', record?.lastFloor != null && Number.isFinite(Number(record.lastFloor)) ? '第 ' + Number(record.lastFloor) + ' 楼' : ''],
        ]));
        const longRows = [
            ['样貌', record?.look || record?.shownLook],
            ['穿着', Array.isArray(record?.clothes) ? record.clothes.join('、') : record?.clothes],
            ['配饰', record?.accessories],
            ['言语', record?.speech], ['口头禅', record?.catchphrase], ['忌讳', record?.taboo],
            ['对玩家的态度', record?.attitude], ['表面态度', record?.publicAttitude], ['心里态度', record?.privateAttitude],
            ['眼下在做什么', record?.doing], ['想要', record?.want], ['怕', record?.fear],
            ['随身', Array.isArray(record?.storage) ? record.storage.join('、') : record?.storage],
        ];
        for (const pair of longRows) {
            if (ppText(pair[1])) nodes.push(ppRow(pair[0], pair[1]));
        }
        const moneyBits = [
            record?.money ? '钱：' + ppText(record.money) : '',
            record?.property ? '产：' + ppText(record.property) : '',
            record?.debt ? '债：' + ppText(record.debt) : '',
        ].filter(Boolean).join('；');
        if (moneyBits) nodes.push(ppRow('钱产', moneyBits));
        const traits = Array.isArray(record?.traits) ? record.traits.filter(item => ppText(item)) : [];
        if (traits.length) nodes.push(ppRow('脾性', traits.join('；')));
        const secret = record?.secret;
        if (secret && typeof secret === 'object' && ppText(secret.what)) {
            nodes.push(ppRow('私隐', ppText(secret.what) + (ppText(secret.hideFrom) ? '（瞒着 ' + ppText(secret.hideFrom) + '）' : '')));
        }
        const items = Array.isArray(record?.items) ? record.items : [];
        for (const item of items) {
            if (item && typeof item === 'object') {
                nodes.push(ppRow('随身物', ppText(item.name) + (Number(item.count) > 1 ? '×' + Number(item.count) : '') + (ppText(item.source) ? '（' + ppText(item.source) + '）' : '') + (ppText(item.detail) ? '：' + ppText(item.detail) : '')));
            } else if (ppText(item)) {
                nodes.push(ppRow('随身物', item));
            }
        }
        const logs = Array.isArray(record?.log) ? record.log : [];
        if (logs.length) {
            nodes.push(ppFold(
                [ppEl('b', '', '经历'), ppEl('small', '', logs.length + ' 笔')],
                logs.map(entry => ppRow(entry && typeof entry === 'object' && entry.floor != null ? '第 ' + Number(entry.floor) + ' 楼' : '', typeof entry === 'string' ? entry : entry?.text)),
            ));
        }
        const favorLogs = Array.isArray(record?.favorLog) ? record.favorLog : [];
        if (favorLogs.length) {
            nodes.push(ppFold(
                [ppEl('b', '', '好感账'), ppEl('small', '', favorLogs.length + ' 笔')],
                favorLogs.map(entry => {
                    if (typeof entry === 'string') return ppRow('', entry);
                    const row = ppEl('div', 'dpd-pp-row');
                    row.append(ppEl('b', '', entry?.floor != null ? '第 ' + Number(entry.floor) + ' 楼' : ''));
                    const span = ppEl('span');
                    span.append(ppNum(entry?.delta));
                    if (ppText(entry?.reason)) span.append(doc.createTextNode(' ' + ppText(entry.reason)));
                    row.append(span);
                    return row;
                }),
            ));
        }
        const moods = Array.isArray(record?.moods) ? record.moods : [];
        for (const mood of moods) {
            if (mood && typeof mood === 'object') {
                nodes.push(ppRow('情绪', ppText(mood.label) + (mood.expiresDay != null ? '（约至第 ' + Number(mood.expiresDay) + ' 天）' : '') + (ppText(mood.reason) ? '：' + ppText(mood.reason) : '')));
            } else if (ppText(mood)) {
                nodes.push(ppRow('情绪', mood));
            }
        }
        const exps = Array.isArray(record?.exp) ? record.exp : [];
        for (const exp of exps) nodes.push(ppRow('经历账', typeof exp === 'string' ? exp : (ppText(exp?.text) || JSON.stringify(exp))));
        return nodes;
    }

    function buildNpcFull(npcMeta) {
        const records = Array.isArray(npcMeta?.records) ? npcMeta.records : [];
        if (!records.length) return ppEmpty('人物簿还没有记账。');
        const root = doc.createDocumentFragment();
        const recentFloor = Math.max(...records.map(record => Number(record?.lastFloor) || 0));
        const introSec = ppSection('人物簿', records.length + ' 人 · 默认展开最近记账的一位');
        for (const record of records) {
            const favor = Number(record?.favor);
            const favorBadge = Number.isFinite(favor) && favor !== 0 ? ppBadge('好感 ' + (favor > 0 ? '+' : '') + favor, favor > 0 ? 'ok' : 'bad') : ppBadge('好感 0', 'dim');
            const presence = ppText(record?.presence);
            introSec.append(ppFold(
                [
                    ppEl('b', '', ppText(record?.name) || '（无名）'),
                    ppEl('small', '', ppText(record?.identity).slice(0, 24)),
                    favorBadge,
                    presence ? ppBadge(presence, presence === '在场' ? 'ok' : 'dim') : null,
                ].filter(Boolean),
                buildNpcBody(record),
                Number(record?.lastFloor) === recentFloor,
            ));
        }
        root.append(introSec);
        return root;
    }

    // —— 归档全账：大记忆全库 + 流水 + 底数 ——
    function buildMemoryArchiveFull(memoryMeta) {
        if (!memoryMeta || typeof memoryMeta !== 'object') return ppEmpty('记忆账还没有开。');
        const root = doc.createDocumentFragment();
        const entries = Array.isArray(memoryMeta.entries) ? memoryMeta.entries : [];
        const memorySec = ppSection('大记忆', entries.length + ' 条现存');
        if (!entries.length) memorySec.append(ppEmpty('还没有现存的大记忆。'));
        entries.forEach((entry, index) => {
            if (!entry || typeof entry !== 'object') return;
            memorySec.append(ppFold(
                [
                    ppEl('b', '', ppText(entry.title) || '#' + ppText(entry.id)),
                    ppEl('small', '', (entry.day != null ? '第 ' + Number(entry.day) + ' 天' : '') + (entry.id != null ? ' · #' + entry.id : '')),
                    ppBadge(ppText(entry.tier) || ppText(entry.tag), 'warn'),
                    ppBadge(ppText(entry.weight), 'dim'),
                ],
                [
                    ppRow('正文', entry.text),
                    ppRow('引文', entry.quote),
                    ppRow('依据', entry.basis),
                    ppKv([
                        ['别名', Array.isArray(entry.aliases) ? entry.aliases.join('、') : ''],
                        ['关联', Array.isArray(entry.related) ? entry.related.join('、') : ''],
                        ['分量', entry.importance ?? ''],
                    ]),
                    ppRow('备注', entry.note),
                ],
                index === 0,
            ));
        });
        root.append(memorySec);
        const statsSec = ppSection('底数');
        statsSec.append(ppKv([
            ['现存大记忆', entries.length],
            ['已退休编号', Array.isArray(memoryMeta.retiredIds) ? memoryMeta.retiredIds.length + ' 条' : ''],
            ['外部退休', Array.isArray(memoryMeta.externalRetiredIds) ? memoryMeta.externalRetiredIds.length + ' 条' : ''],
            ['断档', memoryMeta.legacy_gap ? '有（早期楼层没记上的部分）' : '无'],
            ['更新', fmtStamp(memoryMeta.updatedAt)],
        ]));
        root.append(statsSec);
        return root;
    }

    // —— 留痕全账：生效中的世界影响 + 流水 ——
    function buildImpactFull(impactMeta) {
        if (!impactMeta || typeof impactMeta !== 'object') return ppEmpty('世界影响账还没有开。');
        const root = doc.createDocumentFragment();
        const records = Array.isArray(impactMeta.records) ? impactMeta.records : [];
        const recordSec = ppSection('生效中的影响', records.length + ' 条');
        if (!records.length) recordSec.append(ppEmpty('眼下没有挂着的影响。'));
        for (const record of records) {
            const stateText = IMPACT_STATE_TEXT[String(record?.state ?? '').trim()] || ppText(record?.state);
            const shiftText = String(record?.shift ?? '').trim() === 'none' ? '无偏移' : ppText(record?.shift);
            recordSec.append(ppFold(
                [
                    ppEl('b', '', ppText(record?.title) || '（无题）'),
                    ppBadge(stateText || '未知', String(record?.state) === 'archived' ? 'dim' : 'warn'),
                    ppBadge(shiftText, String(record?.shift) === 'none' ? 'ok' : 'bad'),
                    ppEl('small', '', (record?.day != null ? '第 ' + Number(record.day) + ' 天' : '') + (record?.floor != null ? ' · 第 ' + Number(record.floor) + ' 楼' : '')),
                ],
                [
                    ppRow('详情', record?.detail),
                    ppRow('依据', record?.evidence),
                    ppKv([
                        ['目标', record?.target], ['种类', record?.kind], ['分量', record?.weight],
                        ['把握', record?.certainty], ['来源', record?.source], ['了结', record?.resolution],
                        ['熟成于', record?.ripenDay != null && record.ripenDay !== '' ? '第 ' + Number(record.ripenDay) + ' 天' : ''],
                        ['事件号', record?.eventId],
                    ]),
                    ppRow('归档缘由', record?.archivedReason),
                ],
                true,
            ));
        }
        root.append(recordSec);
        return root;
    }

    // —— 各签的弹窗入口：点开瞬间现读最新账 ——
    function openWorldPopup() {
        openFullPopup('world', '世界全账', '天时 · 风云 · 任务 · 势力 · 流水', '世', () => buildWorldFull(readChatKey('doupo_agent_world')));
    }
    function openFactsPopup() {
        const facts = (readAgentState() ?? {}).factsLastInjection ?? null;
        openFullPopup('facts', '拾卷全账', '本轮注入的原著卷宗 · 点条目看世界书原文', '卷', async () => {
            const titles = await lookupEntryTitles((facts?.usedIds ?? []).map(String));
            return buildFactsFull(facts, titles);
        });
    }
    function openMemoryInjPopup() {
        openFullPopup('mem-inj', '翻忆全账', '本轮注入的记忆素材 · 全文', '忆', () => buildMemoryInjFull((readAgentState() ?? {}).memoryLastInjection ?? null));
    }
    function openSettlePopup() {
        openFullPopup('settle', '过秤全账', '本轮行动裁定与账目变动 · 全文', '秤', () => buildSettleFull((readAgentState() ?? {}).settleLastAdjudication ?? null));
    }
    function openNajiePopup() {
        openFullPopup('najie', '纳戒全账', '主角此刻的自身与随身 · 原文全量', '纳', async () => {
            const chat = Array.isArray(getContext()?.chat) ? getContext().chat : [];
            const index = lastAiIndex(chat);
            const najie = await readNajie(chat, index);
            return buildNajieFull(najie);
        });
    }
    function openNpcPopup() {
        openFullPopup('npc', '记人全账', '人物簿全部在册 · 点人名看全档案', '人', () => buildNpcFull(readChatKey('doupo_agent_npc')));
    }
    function openArchivePopup() {
        openFullPopup('archive', '归档全账', '记忆账全部大记忆与流水', '档', () => buildMemoryArchiveFull(readChatKey('doupo_agent_memory')));
    }
    function openImpactPopup() {
        openFullPopup('impact', '留痕全账', '世界影响的生效与流水', '痕', () => buildImpactFull(readChatKey('doupo_agent_impact')));
    }
    doc.addEventListener('keydown', event => { if (String(event?.key ?? '') === 'Escape') closePopup(); });


    let worldbookCache = { chatId: null, map: null };
    async function lookupEntryTitles(ids) {
        const wanted = (ids ?? []).map(String).filter(Boolean);
        if (!wanted.length) return new Map();
        const chatId = String(getContext()?.chatId || '');
        if (worldbookCache.chatId !== chatId || !worldbookCache.map) {
            worldbookCache = { chatId, map: new Map() };
            try {
                const context = getContext();
                const character = Array.isArray(context?.characters) ? context.characters[Number(context?.characterId)] : null;
                const bookName = String(character?.data?.character_book?.name ?? character?.character_book?.name ?? '').trim() || '斗破世界书';
                const getLorebookEntries = helper?.getLorebookEntries ?? null;
                if (typeof getLorebookEntries === 'function') {
                    const entries = await getLorebookEntries.call(helper, bookName);
                    worldbookCache.map = new Map((entries ?? []).map(entry => [String(entry?.uid), { title: String(entry?.comment ?? '').trim(), content: String(entry?.content ?? '').trim() }]));
                }
            } catch { worldbookCache.map = new Map(); }
        }
        return worldbookCache.map;
    }

    /** 对话句上色：只在文本节点外套 span，不碰标签结构；已上过色的楼层跳过。 */
    function paintQuotes(floorEl) {
        if (!CONFIG.dress || !floorEl) return;
        const textHost = floorEl.querySelector('.mes_text');
        if (!textHost) return;
        if (textHost.querySelector('.dpd-dialogue')) return;
        const walker = doc.createTreeWalker(textHost, NodeFilter.SHOW_TEXT, {
            acceptNode: node => {
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (parent.closest('.dpd-dialogue, .dpd-world-card, .dpd-floor-strip, .dpd-floor-strip-detail, .dpd-settle-card, script, style, textarea')) return NodeFilter.FILTER_REJECT;
                return node.nodeValue && node.nodeValue.includes('“') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            },
        });
        const targets = [];
        while (walker.nextNode()) targets.push(walker.currentNode);
        for (const node of targets) {
            const text = node.nodeValue ?? '';
            const ranges = collectQuoteRanges(text);
            if (!ranges.length) continue;
            const fragment = doc.createDocumentFragment();
            let cursor = 0;
            for (const [start, end] of ranges) {
                if (start > cursor) fragment.append(doc.createTextNode(text.slice(cursor, start)));
                const span = doc.createElement('span');
                span.className = 'dpd-dialogue';
                span.textContent = text.slice(start, end + 1);
                fragment.append(span);
                cursor = end + 1;
            }
            if (cursor < text.length) fragment.append(doc.createTextNode(text.slice(cursor)));
            node.replaceWith(fragment);
        }
    }

    /** 炼字浮牌：生成期间挂一枚小火苗在角落，落笔完自动退场（显隐走 body 类，牌只建一次）。 */
    function ensureCraftBadge() {
        if (!doc.body || doc.body.querySelector(':scope > .dpd-crafting-badge')) return;
        const badge = doc.createElement('div');
        badge.className = 'dpd-crafting-badge';
        badge.setAttribute('aria-hidden', 'true');
        const flame = doc.createElement('i');
        flame.className = 'dpd-crafting-flame';
        badge.append(flame, doc.createTextNode('炼字中 · 笔落如焰'));
        doc.body.append(badge);
    }

    /** 卷尾落款文案：斗气大陆 · 第 X 天 · 所在（世界账里读出来的真实数据）。 */
    function buildTailText(worldMeta) {
        if (!worldMeta || typeof worldMeta !== 'object') return '斗气大陆';
        const clock = worldMeta.clock ?? {};
        const info = worldMeta.info ?? {};
        const day = Number(clock.day);
        const where = String(info.location ?? '').replace(/（[^）]*）\s*$/, '').trim();
        const parts = ['斗气大陆'];
        if (Number.isFinite(day)) parts.push(`第 ${day} 天`);
        if (where) parts.push(where.slice(0, 16));
        return parts.join(' · ');
    }

    /** 卷尾落款：正文收笔处压一枚印——正文末、收炉卡之前。 */
    function ensureTailSeal(lastFloor, text) {
        if (!lastFloor) return;
        const anchor = lastFloor.querySelector('.mes_text');
        if (!anchor) return;
        const parent = anchor.parentElement ?? lastFloor;
        let tail = parent.querySelector(':scope > .dpd-tail-seal');
        if (!tail) {
            tail = doc.createElement('div');
            tail.className = 'dpd-tail-seal';
            tail.setAttribute('aria-hidden', 'true');
            parent.insertBefore(tail, anchor.nextSibling);
        }
        if (tail.dataset.sig !== text) {
            tail.dataset.sig = text;
            tail.textContent = '';
            tail.append(doc.createElement('i'), doc.createTextNode(text), doc.createElement('i'));
        }
    }

    function clearTail(floorEl) {
        floorEl?.querySelectorAll(':scope .dpd-tail-seal').forEach(el => el.remove());
    }

    /** 章首焰字：把每层正文第一段的首字包进焰色下沉字（只动显示层，不碰聊天数据）。
     *  Chromium 的 ::first-letter 配渐变/浮动不渲染，所以用包 span 的笨办法。 */
    function ensureDropcap(textHost) {
        if (!textHost || textHost.querySelector(':scope .dpd-dropcap')) return;
        const p = textHost.querySelector(':scope > p');
        if (!p) return;
        const node = p.firstChild;
        if (!node || node.nodeType !== Node.TEXT_NODE) return;
        const text = node.nodeValue ?? '';
        const ch = text[0] ?? '';
        if (!/[\u4e00-\u9fffA-Za-z]/.test(ch)) return;
        const span = doc.createElement('span');
        span.className = 'dpd-dropcap';
        span.textContent = ch;
        node.nodeValue = text.slice(1);
        p.insertBefore(span, node);
    }

    // ---- 同步主循环：算出“应该长什么样”，与现状不一致才动手（幂等，不会自我循环）----
    const state = { stripFloor: null, stripSig: '', settleFloor: null, settleSig: '', postFloor: null, postSig: '', tailFloor: null, tailSig: '', dressOn: false, lastChatId: '', hadFloors: false, openGraceUntil: 0, pinned: true, userGestured: 0, stickFlash: 0, graceTimer: 0, vpLock: false };

    function readAgentState() {
        try {
            return getContext()?.chatMetadata?.doupo_agent_state ?? null;
        } catch { return null; }
    }

    function readChatKey(key) {
        try {
            return getContext()?.chatMetadata?.[key] ?? null;
        } catch { return null; }
    }

    async function sync() {
        const chatEl = chatElement();
        if (!chatEl) return;
        ensureStyle();
        // 换聊天就收起全账弹窗：内容是旧聊天的账，留着只会误导。
        const chatIdNow = String(getContext()?.chatId || '');
        if (popupChatId !== null && popupChatId !== chatIdNow) closePopup();
        popupChatId = chatIdNow;
        // 贴底跟随：进聊天/出新楼时插卡不该把视口撂在半空。贴底状态由滚动事件维护
        // （只有玩家真实手势才会解除）；换聊天侦测在 MutationObserver 里提前做，
        // 这里的宽限/补针都建立在它之上。
        const nearBottom = state.pinned !== false;
        // 先贴一次再干活：进门第一眼不等卷宗查询——查询 await 会拖 1 秒多，视口就悬在楼顶
        const earlyDistance = chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight;
        if (nearBottom && earlyDistance > 6) {
            state.stickFlash = Date.now();
            chatEl.scrollTop = chatEl.scrollHeight;
        }
        const active = doupoActive();
        const theme = readAgentTheme();
        const dressOn = active && CONFIG.dress;
        chatEl.classList.toggle('doupo-dress', dressOn);
        if (dressOn) chatEl.dataset.dressTheme = theme;
        else delete chatEl.dataset.dressTheme;

        // 页面级开关：正文排版 / 周边 / 炼字牌 / 整体窗景 / 斗破焰装都挂在 body 上（输入框这类在 #chat 外面）
        const pageOn = active && (CONFIG.prose || CONFIG.chrome || CONFIG.crafting || CONFIG.window || CONFIG.flavor);
        const body = doc.body;
        if (body) {
            body.classList.toggle('doupo-dress-page', pageOn);
            body.classList.toggle('doupo-window', pageOn && CONFIG.window);
            body.classList.toggle('doupo-blaze', pageOn && CONFIG.flavor);
            if (pageOn) body.dataset.dressTheme = theme;
            else delete body.dataset.dressTheme;
            // 视口锁：美化开着就锁死 document 滚动（悬空的根修，详见 CSS 里的注释）。
            // 单独成元素、每次 sync 重写一遍——就算别的旧拷贝把主样式刷了，锁也保证在。
            doc.documentElement.classList.toggle('doupo-vp-lock', pageOn);
            state.vpLock = pageOn;
            let lockStyle = doc.getElementById(VPLOCK_ID);
            if (!lockStyle) {
                lockStyle = doc.createElement('style');
                lockStyle.id = VPLOCK_ID;
                (doc.head ?? doc.documentElement).append(lockStyle);
            }
            lockStyle.textContent = pageOn
                ? 'html.doupo-vp-lock, html.doupo-vp-lock body { overflow: hidden !important; }'
                : '';
            const crafting = pageOn && CONFIG.crafting && !!doc.getElementById('mes_stop')?.offsetParent;
            body.classList.toggle('doupo-crafting', crafting);
            if (pageOn && CONFIG.crafting) ensureCraftBadge();
        }

        const context = getContext();
        const chat = Array.isArray(context?.chat) ? context.chat : [];
        const lastIndex = lastAiIndex(chat);
        const lastFloor = lastIndex >= 0 ? floorElement(lastIndex) : null;

        // ① 观世牌：世界运转的当下，挂在正文上方
        let stripSig = '';
        if (active && CONFIG.strip && lastFloor) {
            const worldCard = buildWorldCardFields(readChatKey('doupo_agent_world'));
            stripSig = `${lastIndex}|${JSON.stringify(worldCard)}`;
            if (state.stripFloor !== lastFloor || state.stripSig !== stripSig
                || (lastFloor && !lastFloor.querySelector(':scope .dpd-world-card'))) {
                if (state.stripFloor && state.stripFloor !== lastFloor) clearStrip(state.stripFloor);
                worldCard.full = openWorldPopup;
                ensureWorldCard(lastFloor, worldCard);
                state.stripFloor = lastFloor;
                state.stripSig = stripSig;
            }
        } else if (state.stripFloor) {
            clearStrip(state.stripFloor);
            state.stripFloor = null;
            state.stripSig = '';
        }

        // ①乙 斗破焰装：卷尾落款压在正文收笔处（案台暖光/纸面晕染走 body 类，不逐楼动手）
        if (active && CONFIG.flavor && lastFloor) {
            const tailText = buildTailText(readChatKey('doupo_agent_world'));
            const tailSig = `${lastIndex}|${tailText}`;
            if (state.tailFloor !== lastFloor || state.tailSig !== tailSig
                || !lastFloor.querySelector(':scope .dpd-tail-seal')) {
                if (state.tailFloor && state.tailFloor !== lastFloor) clearTail(state.tailFloor);
                ensureTailSeal(lastFloor, tailText);
                state.tailFloor = lastFloor;
                state.tailSig = tailSig;
            }
        } else if (state.tailFloor) {
            clearTail(state.tailFloor);
            state.tailFloor = null;
            state.tailSig = '';
        }

        // ② 生成前准备面板：卷宗 / 记忆 / 结算 三节，挂在最新输入楼下
        let settleSig = '';
        if (active && CONFIG.settle) {
            const agentState = readAgentState();
            const record = agentState?.settleLastAdjudication ?? null;
            const usable = record && record.scope === scopeKey()
                && Array.isArray(record.actions) && record.actions.length
                && Number.isInteger(record.userFloor) ? record : null;
            // 锚永远钉最新输入楼，判定记录只在「它判的就是最新输入」时才供过秤的料。
            // 旧版先信记录里的 userFloor：本轮判定没跑（无行动/判定失败，记录不更新）
            // 或删楼后索引漂移，卡就会留在上一楼——看起来「备料卡跑到最新输入的上面」。
            let anchorIndex = -1;
            for (let index = chat.length - 1; index >= 0; index--) {
                if (chat[index]?.is_user === true) { anchorIndex = index; break; }
            }
            const freshRecord = usable && usable.userFloor === anchorIndex ? usable : null;
            const anchorFloor = anchorIndex >= 0 ? floorElement(anchorIndex) : null;
            const settleSummary = anchorFloor && freshRecord ? buildSettleSummary(freshRecord) : null;
            const titles = await lookupEntryTitles(agentState?.factsLastInjection?.usedIds ?? []);
            const sections = [
                buildFactsSection(agentState?.factsLastInjection ?? null, titles),
                buildMemorySection(agentState?.memoryLastInjection ?? null),
            ];
            const statusLabel = freshRecord?.status === 'injected' ? ' · 已注入' : freshRecord?.status === 'preview' ? ' · 仅预览' : '';
            sections.push({
                key: 'settle',
                full: openSettlePopup,
                label: '过秤',
                summary: settleSummary
                    ? `✓ ${settleSummary.count} 项行动 · ${settleSummary.tag}${statusLabel}`
                    : '○ 本轮没有结算记录',
                open: !!settleSummary,
                detail: settleSummary ? { kind: 'list', rows: settleSummary.rows, note: settleSummary.note || null } : null,
            });
            settleSig = `${anchorIndex}|${JSON.stringify(sections)}`;
            if (state.settleFloor !== anchorFloor || state.settleSig !== settleSig
                || (anchorFloor && !anchorFloor.querySelector(':scope .dpd-pre-card'))) {
                const previous = state.settleFloor;
                if (previous && previous !== anchorFloor) clearPre(previous);
                ensureTabsPanel(anchorFloor, sections, PRE_HEADER);
                state.settleFloor = anchorFloor;
                state.settleSig = settleSig;
            }
        } else if (state.settleFloor) {
            clearPre(state.settleFloor);
            state.settleFloor = null;
            state.settleSig = '';
        }

        // ③ 正文后落账面板：记人 / 归档 / 留痕，挂在最新回复楼下
        let postSig = '';
        if (active && CONFIG.post && lastFloor) {
            const najie = await readNajie(chat, lastIndex);
            const najieFields = buildStripFields(najie);
            const najieSection = { key: 'najie', label: '纳戒', summary: '○ 纳戒还没有账', detail: null, full: openNajiePopup };
            if (najieFields) {
                najieSection.summary = `✓ ${najieFields.main.map(field => `${field.label ? field.label + ' ' : ''}${field.value}`).join(' · ').slice(0, 46)}`;
                // 主签 + 全部随身明细（行囊/天材地宝/丹方/称号/目标），不再只挑两条
                const rows = najieFields.main.map(field => ({ label: field.label || '', status: '', detail: field.value }));
                for (const item of najieFields.detail) rows.push({ label: item.label, status: '', detail: item.value });
                najieSection.detail = { kind: 'list', rows, note: najieFields.updatedAt ? `纳戒账本 · 更新于 ${najieFields.updatedAt.slice(0, 16).replace('T', ' ')}` : null };
            }
            const sections = [
                najieSection,
                buildNpcSection(readChatKey('doupo_agent_npc')),
                buildMemoryArchiveSection(readChatKey('doupo_agent_memory')),
                buildImpactSection(readChatKey('doupo_agent_impact')),
            ];
            postSig = `${lastIndex}|${JSON.stringify(sections)}`;
            if (state.postFloor !== lastFloor || state.postSig !== postSig
                || !lastFloor.querySelector(':scope .dpd-pre-card')) {
                const previous = state.postFloor;
                if (previous && previous !== lastFloor) clearPre(previous);
                ensureTabsPanel(lastFloor, sections, POST_HEADER);
                state.postFloor = lastFloor;
                state.postSig = postSig;
            }
        } else if (state.postFloor) {
            clearPre(state.postFloor);
            state.postFloor = null;
            state.postSig = '';
        }

        // ④ 对话上色
        if (dressOn && lastFloor) paintQuotes(lastFloor);
        // ④乙 章首焰字：每层正文首字落一枚焰色下沉字
        if (active && CONFIG.flavor) {
            chatEl.querySelectorAll(':scope > .mes .mes_text').forEach(host => ensureDropcap(host));
        }
        // 收尾贴底：这轮 sync 动手前原本贴底就回贴底，别让插卡把视口撂在半空
        const stuckDistance = chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight;
        if (nearBottom && stuckDistance > 6) {
            const stickLog = (hostWindow.__DPD_STICK_LOG__ = hostWindow.__DPD_STICK_LOG__ || []);
            stickLog.push({ t: Date.now() % 1000000, dist: Math.round(stuckDistance), action: 'stick' });
            if (stickLog.length > 40) stickLog.shift();
            state.stickFlash = Date.now();
            chatEl.scrollTop = chatEl.scrollHeight;
        }
        state.dressOn = dressOn;
    }

    // 错误别静默：记录到宿主 window 并在控制台可见，方便排查。
    function noteError(error) {
        try {
            const bag = (hostWindow.__DPD_ERRORS__ = hostWindow.__DPD_ERRORS__ || []);
            bag.push(String(error?.message || error));
            if (bag.length > 20) bag.splice(0, bag.length - 20);
            (hostWindow.console || console).warn('[斗破美化]', error);
        } catch { /* 忽略 */ }
    }

    let pendingTimer;
    const requestSync = (delay = 150) => {
        clearTimeout(pendingTimer);
        pendingTimer = setTimeout(() => { sync().catch(noteError); }, Math.max(0, Number(delay) || 0));
    };

    // 触发点：楼层任何重排（新楼层、编辑、切换聊天、TH 渲染）都算；兜底再加一个慢轮询。
    const chatEl = chatElement();
    if (chatEl) {
        // 贴底状态只认玩家的真实手势：滚轮/触摸/翻页键才算「你在翻」，ST 自己的
        // 程序滚动和内容增高一律不算——不然进门加载期能把贴底误关成悬空死锁。
        const noteUserGesture = () => { state.userGestured = Date.now(); };
        chatEl.addEventListener('wheel', noteUserGesture, { passive: true });
        chatEl.addEventListener('touchstart', noteUserGesture, { passive: true });
        doc.addEventListener('keydown', event => {
            if (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(String(event?.key ?? ''))) noteUserGesture();
        });
        chatEl.addEventListener('scroll', () => {
            const distance = chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight;
            // 关键防线：自己贴底赋值触发的 scroll 事件带 stickFlash 标记，一律算程序滚动，
            // 不参与「手势解除贴底」的判定——不然玩家加载期碰了下滚轮/在输入框按了↑↓，
            // 下一拍补针就会把跟随误关成永久悬空。
            const selfScroll = Date.now() - (state.stickFlash ?? 0) < 120;
            if (!selfScroll && Date.now() - (state.userGestured ?? 0) < 500) state.pinned = distance <= 140;
            const stickLog = (hostWindow.__DPD_STICK_LOG__ = hostWindow.__DPD_STICK_LOG__ || []);
            stickLog.push({ t: Date.now() % 1000000, dist: Math.round(distance), pinned: state.pinned === true, top: Math.round(chatEl.scrollTop), self: selfScroll ? 1 : 0 });
            if (stickLog.length > 40) stickLog.shift();
        }, { passive: true });
    }

    // 进门宽限（v6.8）：换聊天、从欢迎页进聊天、脚本重跑时聊天已挂好，三条路都走这里。
    // 宽限期内视口钉在底部，楼层边渲染边按回去；只有玩家真实手势才解除。
    function beginEntryGrace() {
        const chatIdNow = String(getContext()?.chatId || '');
        const hasFloors = !!chatElement()?.querySelector('.mes');
        // 两条进门路径都认：聊天 id 变了，或者楼层从无到有（欢迎页进来时 chatId 可能早就挂着旧值）
        const changed = state.lastChatId !== chatIdNow || (hasFloors && !state.hadFloors);
        state.hadFloors = hasFloors;
        if (!changed) return false;
        state.lastChatId = chatIdNow;
        state.openGraceUntil = Date.now() + 12000;
        state.pinned = true;
        state.userGestured = 0;
        [300, 900, 2000, 3500, 6000, 9000].forEach(delay => requestSync(delay));
        clearInterval(state.graceTimer);
        state.graceTimer = setInterval(() => {
            if (Date.now() > state.openGraceUntil || state.pinned === false) { clearInterval(state.graceTimer); return; }
            const el = chatElement();
            if (!el) return;
            const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
            if (distance > 6) {
                state.stickFlash = Date.now();
                el.scrollTop = el.scrollHeight;
            }
        }, 400);
        return true;
    }

    if (chatEl && typeof MutationObserver === 'function') {
        new MutationObserver(() => {
            // 换聊天侦测提前到 observer：聊天一换、宽限立刻生效，楼层边渲染边钉，
            // 不等 sync（sync 有 150ms 延迟还带卷宗查询，进门那半秒等不得）。
            beginEntryGrace();
            // 宽限期内楼层边渲染边钉：刚冒头的漂移当场按回去
            if (state.pinned !== false && Date.now() < state.openGraceUntil) {
                const distance = chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight;
                if (distance > 6) {
                    state.stickFlash = Date.now();
                    chatEl.scrollTop = chatEl.scrollHeight;
                }
            }
            requestSync();
        }).observe(chatEl, { childList: true, subtree: true });
    }
    setInterval(() => requestSync(0), CONFIG.pollMs);
    // —— 换卡清理器：本脚本由酒馆助手按卡启停，切走卡后脚本被杀、sync 循环没法再撤类名，
    // 视口锁与窗景类会残留在宿主页面上（别卡也要穿斗破产饰）。这里把清理器挂到宿主的
    // eventSource 上——宿主持有函数引用，脚本死后 CHAT_CHANGED 照常触发它；新聊天不是
    // 斗破卡就摘掉全部装扮痕迹。重进卡时本脚本重新运行、按槽位替换旧清理器，锁与美化
    // 由 fresh sync 重新披上。
    function installCardSwitchCleanup() {
        try {
            const context = hostWindow.SillyTavern?.getContext?.();
            if (!context?.eventSource || typeof context.eventSource.on !== 'function') return;
            const eventName = context.event_types?.CHAT_CHANGED;
            if (typeof eventName !== 'string' || !eventName) return;
            const cleanup = () => {
                try {
                    const current = hostWindow.SillyTavern?.getContext?.();
                    const character = Array.isArray(current?.characters) ? current.characters[current.characterId] : null;
                    if (isDoupoCard(character)) return; // 回到斗破卡：脚本重跑自会披挂，不用别人拆
                    doc.documentElement.classList.remove('doupo-vp-lock');
                    if (doc.body) {
                        doc.body.classList.remove('doupo-dress-page', 'doupo-window', 'doupo-blaze', 'doupo-crafting');
                        delete doc.body.dataset.dressTheme;
                        doc.body.querySelectorAll(':scope > .dpd-crafting-badge').forEach(badge => badge.remove());
                    }
                    const chatEl = doc.getElementById('chat');
                    if (chatEl) {
                        chatEl.classList.remove('doupo-dress');
                        delete chatEl.dataset.dressTheme;
                    }
                    const lockStyle = doc.getElementById(VPLOCK_ID);
                    if (lockStyle) lockStyle.textContent = '';
                    const mainStyle = doc.getElementById(STYLE_ID);
                    if (mainStyle) mainStyle.remove();
                } catch { /* 清理失败不影响别卡 */ }
            };
            const previous = hostWindow.__doupoDressLeaveCleanup__;
            if (previous) {
                try { context.eventSource.removeListener(eventName, previous); } catch { /* 忽略 */ }
            }
            hostWindow.__doupoDressLeaveCleanup__ = cleanup;
            context.eventSource.on(eventName, cleanup);
        } catch { /* 登记失败不影响本卡装扮 */ }
    }

    // 视口锁看门狗：美化开着时 document 滚动永远不该发生——谁（焦点/锚点/表情图加载）
    // 把页面滚出半截就立刻拉回顶上。html 锁死后浏览器的原生滚动会改滚 body
    // （overflow:hidden 的容器仍可被程序性滚动），所以三个滚动容器一起盯、一起归零。
    const keepViewportPinned = () => {
        if (!state.vpLock) return;
        const htmlEl = doc.documentElement;
        const bodyEl = doc.body;
        const drifted = (hostWindow.scrollY || 0) !== 0 || (hostWindow.scrollX || 0) !== 0
            || (bodyEl?.scrollTop || 0) !== 0 || (bodyEl?.scrollLeft || 0) !== 0
            || (htmlEl?.scrollTop || 0) !== 0 || (htmlEl?.scrollLeft || 0) !== 0;
        if (!drifted) return;
        try {
            hostWindow.scrollTo(0, 0);
            if (htmlEl) { htmlEl.scrollTop = 0; htmlEl.scrollLeft = 0; }
            if (bodyEl) { bodyEl.scrollTop = 0; bodyEl.scrollLeft = 0; }
        } catch { /* 忽略 */ }
    };
    doc.addEventListener('scroll', keepViewportPinned, { passive: true, capture: true });
    setInterval(keepViewportPinned, 400);
    installCardSwitchCleanup();
    await sync().catch(noteError);
    // 脚本重跑/晚挂载时聊天可能已经渲染完，observer 等不到下一次变更——
    // 主动补几次进门判定，别让「脚本后到」的窗口悬在半空。
    [400, 1200, 3000].forEach(delay => setTimeout(() => {
        try { beginEntryGrace(); } catch { /* 忽略 */ }
    }, delay));
})();
