/* 斗破苍穹 · 卡面脚本（Tavern Helper 脚本）
 *
 * 分工：正则只负责把首楼那行标记变成可见卡面；
 *      这个脚本负责依赖体检、多页创建身份、预览、提交。
 *
 * 所有选择器都走 data-* 属性：酒馆会把消息里的 class 加 custom- 前缀，class 靠不住。
 *
 * 落点：卡内 Tavern Helper 脚本（data.extensions.tavern_helper.scripts[].content）。
 * 也可以直接粘进「酒馆助手 → 脚本库」新建脚本里试跑。
 */
(() => {
    'use strict';

    const SCHEMA = 2;
    const COVER_SELECTOR = '[data-dpc="cover"]';
    const READY_ATTR = 'data-dpc-ready';
    const BIND_KEY = '__dpcBinder';
    const DRAFT_KEY = 'dpc_opening_draft';
    const PLAYER_KEY = 'dpc_player';
    const LS_PREFIX = 'dpc-opening:';

    // 与纳戒（agent/doupo-agent-ui/self/self-runtime.js）的 PROFILE_FIELDS 对齐：
    // name / gender / age / race / origin / affiliation / talent / appearance
    const PROFILE_FIELDS = ['name', 'gender', 'age', 'race', 'origin', 'affiliation', 'talent', 'appearance'];
    const MAX_PROFILE_TEXT = 60;
    const MAX_APPEARANCE_TEXT = 160;

    // 开局设定：不进纳戒，只影响这一句话怎么发出去；其中 location / status
    // 会顺手喂给人物簿的“玩家此刻”（那条线只认 location/realm/status/name）。
    const OPENING_FIELDS = ['location', 'timepoint', 'status', 'request'];
    const OPENING_CAPS = { location: 40, timepoint: 40, status: 60, request: 160 };

    const LABELS = {
        name: '姓名', gender: '性别', age: '年龄', race: '种族',
        origin: '出身', affiliation: '所属', talent: '天赋', appearance: '外貌',
    };

    const OPENING_LABELS = {
        location: '开局地点', timepoint: '开局时间点', status: '此刻处境', request: '想要的走向',
    };

    const STEP_TITLES = ['身份', '来历', '修为与处境', '开局', '天赋与外貌', '确认'];
    const LAST_STEP = STEP_TITLES.length - 1;

    /* ---------------- 环境探测 ---------------- */

    function hostWindow() {
        try {
            if (window.parent && window.parent !== window && window.parent.document) return window.parent;
        } catch (_) { /* 跨域时退回自身 */ }
        return window;
    }

    function hostDocument() {
        try { return hostWindow().document || document; } catch (_) { return document; }
    }

    function stContext() {
        try { return hostWindow().SillyTavern?.getContext?.() || window.SillyTavern?.getContext?.() || null; } catch (_) { return null; }
    }

    function hasHelper() {
        return typeof window.getVariables === 'function' && typeof window.insertOrAssignVariables === 'function';
    }

    function slashRunner() {
        const local = typeof window.triggerSlash === 'function' ? window.triggerSlash : null;
        if (local) return local;
        try {
            const parent = hostWindow();
            if (typeof parent.triggerSlash === 'function') return parent.triggerSlash;
            if (typeof parent.TavernHelper?.triggerSlash === 'function') return parent.TavernHelper.triggerSlash;
        } catch (_) { /* 同上 */ }
        return null;
    }

    /** 扩展那条桥：装了斗破 Agent 扩展并暴露全局挂载点时才拿得到。 */
    function agentBridge() {
        try {
            const parent = hostWindow();
            return parent.doupoAgent || window.doupoAgent || null;
        } catch (_) { return null; }
    }

    function chatIdentity() {
        const context = stContext();
        const meta = context?.chatMetadata;
        const uuid = meta?.chat_id || meta?.chatId || context?.chatId || '';
        const characterId = context?.characterId ?? '';
        if (uuid) return { uuid: String(uuid), characterId, chatId: String(context?.chatId ?? '') };
        return { uuid: `fallback:${characterId}:${String(context?.chatId ?? '')}`, characterId, chatId: String(context?.chatId ?? '') };
    }

    /* ---------------- 草稿 ---------------- */

    function emptyIdentity() {
        const identity = {};
        for (const field of PROFILE_FIELDS) identity[field] = '';
        return identity;
    }

    function emptyOpening() {
        const opening = {};
        for (const field of OPENING_FIELDS) opening[field] = '';
        return opening;
    }

    function emptyDraft() {
        return {
            schemaVersion: SCHEMA,
            identity: emptyIdentity(),
            realm: { realm: '', stage: '' },
            opening: emptyOpening(),
            // view 是“现在停在哪一屏”：cover 看卡面，wizard 填表。
            view: 'cover',
            ui: { step: 0 },
            committed: false,
            updatedAt: null,
        };
    }

    function draftKey() {
        return `${LS_PREFIX}${chatIdentity().uuid}`;
    }

    function normalizeDraft(raw) {
        const draft = emptyDraft();
        if (!raw || typeof raw !== 'object') return draft;
        // 认得的旧版本照收，认不出的整份丢掉，不拿空对象糊住记录。
        const version = Number(raw.schemaVersion);
        if (version !== 1 && version !== SCHEMA) return draft;
        const identity = raw.identity && typeof raw.identity === 'object' ? raw.identity : {};
        for (const field of PROFILE_FIELDS) {
            const value = identity[field];
            draft.identity[field] = typeof value === 'string' ? value.slice(0, capOf(field)) : '';
        }
        const realm = raw.realm && typeof raw.realm === 'object' ? raw.realm : {};
        draft.realm.realm = typeof realm.realm === 'string' ? realm.realm.slice(0, 12) : '';
        draft.realm.stage = typeof realm.stage === 'string' ? realm.stage.slice(0, 12) : '';
        const opening = raw.opening && typeof raw.opening === 'object' ? raw.opening : {};
        for (const field of OPENING_FIELDS) {
            const value = opening[field];
            draft.opening[field] = typeof value === 'string' ? value.slice(0, OPENING_CAPS[field]) : '';
        }
        const step = Number(raw.ui?.step);
        // v1 只有四页，最后一页是“确认”；v2 把它挪到新的末页位置。
        const mapped = version === 1 && step === 3 ? LAST_STEP : step;
        draft.ui.step = Number.isInteger(mapped) ? Math.min(Math.max(mapped, 0), LAST_STEP) : 0;
        draft.view = raw.view === 'wizard' ? 'wizard' : 'cover';
        draft.committed = raw.committed === true;
        draft.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : null;
        return draft;
    }

    function loadDraft() {
        let raw = null;
        if (hasHelper()) {
            try { raw = window.getVariables({ type: 'chat' })?.[DRAFT_KEY] ?? null; } catch (_) { raw = null; }
        }
        if (raw === null) {
            try {
                const stored = hostWindow().localStorage?.getItem(draftKey());
                raw = stored ? JSON.parse(stored) : null;
            } catch (_) { raw = null; }
        }
        return normalizeDraft(raw);
    }

    function saveDraft(draft) {
        draft.updatedAt = new Date().toISOString();
        const payload = {
            schemaVersion: SCHEMA,
            identity: { ...draft.identity },
            realm: { ...draft.realm },
            opening: { ...draft.opening },
            view: draft.view,
            ui: { step: draft.ui.step },
            committed: draft.committed === true,
            updatedAt: draft.updatedAt,
        };
        if (hasHelper()) {
            try { window.insertOrAssignVariables({ [DRAFT_KEY]: payload }, { type: 'chat' }); return; } catch (_) { /* 落到本地兜底 */ }
        }
        try { hostWindow().localStorage?.setItem(draftKey(), JSON.stringify(payload)); } catch (_) { /* 存不了就只在内存里 */ }
    }

    function capOf(field) {
        return field === 'appearance' ? MAX_APPEARANCE_TEXT : MAX_PROFILE_TEXT;
    }

    /* ---------------- 依赖体检 ---------------- */

    function probeNeeds(draft) {
        const context = stContext();
        const results = {};

        const tavernVersion = (() => {
            try { return typeof window.getTavernVersion === 'function' ? String(window.getTavernVersion()) : ''; } catch (_) { return ''; }
        })();
        results.client = compareVersion(tavernVersion, '1.18.0');

        results.helper = hasHelper() ? 'ok' : 'warn';

        const bridge = agentBridge();
        results.bridge = bridge ? 'ok' : 'warn';

        const character = Array.isArray(context?.characters) && Number.isInteger(context?.characterId)
            ? context.characters[context.characterId] : null;
        const worldName = character?.data?.extensions?.world || character?.world || '';
        results.worldbook = String(worldName || '').trim() ? 'ok' : 'warn';

        const online = context?.onlineStatus;
        results.model = online === 'no_connection' ? 'warn' : online ? 'ok' : null;

        results.library = 'later';

        // 身份已经建过：这些都不用再管了。
        if (draft.committed) for (const key of Object.keys(results)) results[key] = 'ok';
        return results;
    }

    function compareVersion(actual, required) {
        if (!actual) return null;
        const a = actual.split(/[^\d]+/).filter(Boolean).map(Number);
        const b = required.split('.').map(Number);
        for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
            const left = a[i] || 0;
            const right = b[i] || 0;
            if (left > right) return 'ok';
            if (left < right) return 'warn';
        }
        return 'ok';
    }

    function paintNeeds(root, results) {
        for (const item of root.querySelectorAll('[data-need]')) {
            const key = item.getAttribute('data-need');
            const state = results[key];
            if (state === 'ok') {
                item.setAttribute('data-state', 'ok');
                const mark = item.querySelector('[data-p="mark"]');
                if (mark) mark.textContent = '✓';
            } else if (state === 'warn') {
                item.setAttribute('data-state', 'warn');
                const mark = item.querySelector('[data-p="mark"]');
                if (mark) mark.textContent = '!';
            }
        }
    }

    /* ---------------- 小工具 ---------------- */

    function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[ch]));
    }

    function say(root, message, tone) {
        const slot = root.querySelector('[data-dpc-msg]');
        if (!slot) return;
        slot.textContent = message || '';
        if (tone) slot.setAttribute('data-tone', tone);
        else slot.removeAttribute('data-tone');
    }

    /* ---------------- 页面搭建 ---------------- */

    function stepHtml(step, draft) {
        const identity = draft.identity;
        if (step === 0) {
            return `
<section data-p="sec">
  <label data-p="field">
    <span data-p="label">姓名（必填）</span>
    <input data-p="input" type="text" maxlength="${MAX_PROFILE_TEXT}" data-field="name"
      value="${esc(identity.name)}" placeholder="你在这片大陆上的名字" autocomplete="off">
  </label>
  <div data-p="field">
    <span data-p="label">性别</span>
    <div data-p="chips" data-group="gender">
      ${['男', '女', '不明'].map(value => `
      <button type="button" data-p="chip" data-value="${esc(value)}"
        aria-pressed="${identity.gender === value ? 'true' : 'false'}">${esc(value)}</button>`).join('')}
    </div>
  </div>
  <label data-p="field">
    <span data-p="label">年龄</span>
    <input data-p="input" type="text" maxlength="6" data-field="age"
      value="${esc(identity.age)}" placeholder="十五" autocomplete="off">
  </label>
</section>`;
        }
        if (step === 1) {
            return `
<section data-p="sec">
  <div data-p="field">
    <span data-p="label">种族</span>
    <div data-p="chips" data-group="race">
      ${['人族', '魔兽', '其他'].map(value => `
      <button type="button" data-p="chip" data-value="${esc(value)}"
        aria-pressed="${identity.race === value ? 'true' : 'false'}">${esc(value)}</button>`).join('')}
    </div>
  </div>
  <label data-p="field">
    <span data-p="label">出身</span>
    <input data-p="input" type="text" maxlength="${MAX_PROFILE_TEXT}" data-field="origin"
      value="${esc(identity.origin)}" placeholder="乌坦城萧家、加玛帝国边镇…" autocomplete="off">
  </label>
  <label data-p="field">
    <span data-p="label">所属</span>
    <input data-p="input" type="text" maxlength="${MAX_PROFILE_TEXT}" data-field="affiliation"
      value="${esc(identity.affiliation)}" placeholder="目前待着的地方或势力，可以先空着" autocomplete="off">
  </label>
</section>`;
        }
        if (step === 2) {
            return `
<section data-p="sec">
  <div data-p="field">
    <span data-p="label">当前境界（可以不填）</span>
    <div data-p="row">
      <input data-p="input" type="text" maxlength="12" data-realm="realm"
        value="${esc(draft.realm.realm)}" placeholder="斗之气" autocomplete="off">
      <input data-p="input" type="text" maxlength="12" data-realm="stage"
        value="${esc(draft.realm.stage)}" placeholder="三段" autocomplete="off">
    </div>
  </div>
  <label data-p="field">
    <span data-p="label">此刻在哪（${OPENING_CAPS.location} 字以内）</span>
    <input data-p="input" type="text" maxlength="${OPENING_CAPS.location}" data-opening="location"
      value="${esc(draft.opening.location)}" placeholder="乌坦城、魔兽山脉外围…" autocomplete="off">
  </label>
  <label data-p="field">
    <span data-p="label">此刻的处境（${OPENING_CAPS.status} 字以内）</span>
    <textarea data-p="area" maxlength="${OPENING_CAPS.status}" data-opening="status"
      placeholder="刚被退婚、正被追杀、身上没钱…">${esc(draft.opening.status)}</textarea>
  </label>
</section>`;
        }
        if (step === 3) {
            return `
<section data-p="sec">
  <label data-p="field">
    <span data-p="label">从哪个时间点开始（${OPENING_CAPS.timepoint} 字以内）</span>
    <input data-p="input" type="text" maxlength="${OPENING_CAPS.timepoint}" data-opening="timepoint"
      value="${esc(draft.opening.timepoint)}" placeholder="萧炎十五岁、三年之约刚立…" autocomplete="off">
  </label>
  <label data-p="field">
    <span data-p="label">你想怎么开场（${OPENING_CAPS.request} 字以内）</span>
    <textarea data-p="area" maxlength="${OPENING_CAPS.request}" data-opening="request"
      placeholder="想先认识药老、想直接进魔兽山脉、想从家族比试开始…">${esc(draft.opening.request)}</textarea>
  </label>
  <p data-p="note">这几项只是把开场说清楚，不写进档案，之后也能随时改口。</p>
</section>`;
        }
        if (step === 4) {
            return `
<section data-p="sec">
  <label data-p="field">
    <span data-p="label">天赋（${MAX_PROFILE_TEXT} 字以内）</span>
    <textarea data-p="area" maxlength="${MAX_PROFILE_TEXT}" data-field="talent"
      placeholder="天生斗气感应慢、记性好、体质偏火…">${esc(identity.talent)}</textarea>
  </label>
  <label data-p="field">
    <span data-p="label">外貌（${MAX_APPEARANCE_TEXT} 字以内）</span>
    <textarea data-p="area" maxlength="${MAX_APPEARANCE_TEXT}" data-field="appearance"
      placeholder="个子、衣着、眼神，随便写两句">${esc(identity.appearance)}</textarea>
  </label>
</section>`;
        }
        const rows = PROFILE_FIELDS
            .filter(field => identity[field].trim())
            .map(field => `<li><b>${LABELS[field]}</b><span>${esc(identity[field])}</span></li>`);
        const realmText = `${draft.realm.realm}${draft.realm.stage}`.trim();
        if (realmText) rows.push(`<li><b>境界</b><span>${esc(realmText)}</span></li>`);
        for (const field of OPENING_FIELDS) {
            if (draft.opening[field].trim()) rows.push(`<li><b>${OPENING_LABELS[field]}</b><span>${esc(draft.opening[field])}</span></li>`);
        }
        return `
<section data-p="sec">
  <h3 data-p="h">这就是你要发出去的第一句</h3>
  <div data-dpc-preview>${esc(buildOpeningMessage(draft)).replace(/\n/g, '<br>')}</div>
</section>
<section data-p="sec">
  <h3 data-p="h">档案摘要</h3>
  <ul data-p="sum">${rows.join('') || '<li><b>空</b><span>什么都没填</span></li>'}</ul>
</section>`;
    }

    function wizardHtml(draft) {
        const step = draft.ui.step;
        const steps = STEP_TITLES.map((title, index) =>
            `<span data-p="step"${index === step ? ' data-on' : ''}>${index + 1}. ${esc(title)}</span>`).join('');
        const back = step > 0 ? '<button type="button" data-p="btn" data-dpc-back>上一步</button>' : '';
        const next = step < LAST_STEP
            ? '<button type="button" data-p="btn" data-variant="primary" data-dpc-next>下一步</button>'
            : '<button type="button" data-p="btn" data-variant="primary" data-dpc-submit>开始</button>';
        return `
<div data-p="wiz">
  <div data-p="steps">${steps}</div>
  <h3 data-p="h">第 ${step + 1} 页 · ${esc(STEP_TITLES[step])}</h3>
  ${stepHtml(step, draft)}
  <div data-p="nav">${back}${next}
    <button type="button" data-p="link" data-dpc-cancel>先不填了</button>
  </div>
</div>`;
    }

    function committedHtml(draft) {
        const name = draft.identity.name.trim() || '无名';
        return `
<section data-p="sec">
  <h3 data-p="h">身份已建立</h3>
  <p data-p="p">${esc(name)}，${esc(draft.identity.gender || '')}${draft.identity.age ? `，${esc(draft.identity.age)} 岁` : ''}。故事已经从这里开始了。</p>
  <div data-p="actions">
    <button type="button" data-p="btn" data-dpc-reopen>再改一下</button>
  </div>
</section>`;
    }

    /* ---------------- 唯一消息构建器 ---------------- */

    /** 预览、校验、真正发出去，全都走这一个函数，避免“看着像”和“真发的”两份文本。 */
    function buildOpeningMessage(draft) {
        const i = draft.identity;
        const o = draft.opening;
        const realm = `${draft.realm.realm}${draft.realm.stage}`.trim();
        const traits = [i.gender, i.age ? `${i.age}岁` : '', i.race].filter(Boolean).join('，');
        const head = `我是${i.name.trim()}${traits ? `，${traits}` : ''}。`;
        const places = [
            i.origin.trim() ? `家在${i.origin.trim()}` : '',
            i.affiliation.trim() ? `如今在${i.affiliation.trim()}` : '',
        ].filter(Boolean).join('，');
        const lines = [head];
        if (places) lines.push(`${places}。`);
        if (realm) lines.push(`眼下的境界是${realm}。`);
        if (i.talent.trim()) lines.push(`天赋：${i.talent.trim()}`);
        if (i.appearance.trim()) lines.push(`样貌：${i.appearance.trim()}`);
        const scene = [
            o.location.trim() ? `人现在在${o.location.trim()}` : '',
            o.status.trim() ? `眼下的处境是${o.status.trim()}` : '',
        ].filter(Boolean).join('，');
        if (scene) lines.push(`${scene}。`);
        if (o.timepoint.trim()) lines.push(`我想从${o.timepoint.trim()}这个时候开始。`);
        if (o.request.trim()) lines.push(`开场我想：${o.request.trim()}`);
        lines.push('', '故事就从这里开始吧。');
        return lines.join('\n');
    }

    /* ---------------- 提交 ---------------- */

    function collect(root, draft) {
        for (const input of root.querySelectorAll('[data-field]')) {
            const field = input.getAttribute('data-field');
            if (!PROFILE_FIELDS.includes(field)) continue;
            draft.identity[field] = String(input.value ?? '').slice(0, capOf(field));
        }
        for (const input of root.querySelectorAll('[data-realm]')) {
            const key = input.getAttribute('data-realm');
            if (key === 'realm') draft.realm.realm = String(input.value ?? '').slice(0, 12);
            if (key === 'stage') draft.realm.stage = String(input.value ?? '').slice(0, 12);
        }
        for (const input of root.querySelectorAll('[data-opening]')) {
            const field = input.getAttribute('data-opening');
            if (!OPENING_FIELDS.includes(field)) continue;
            draft.opening[field] = String(input.value ?? '').slice(0, OPENING_CAPS[field]);
        }
        return draft;
    }

    function validate(draft) {
        if (!draft.identity.name.trim()) return '至少把姓名填上。';
        if (draft.identity.name.trim().length > MAX_PROFILE_TEXT) return '姓名太长了。';
        return '';
    }

    function persistPlayer(draft) {
        const record = {
            schemaVersion: SCHEMA,
            profile: { ...draft.identity },
            realm: { ...draft.realm },
            // 开局设定只在本局生效，不进纳戒档案；单独存一份，方便以后读取/复盘。
            opening: { ...draft.opening },
            committedAt: new Date().toISOString(),
            source: 'cover',
        };
        if (hasHelper()) {
            try { window.insertOrAssignVariables({ [PLAYER_KEY]: record }, { type: 'chat' }); } catch (_) { /* 忽略，提交不受阻 */ }
        }
        return record;
    }

    /** 把身份送进斗破 Agent（纳戒 + 人物簿的“玩家此刻”）。没装扩展就安静跳过。 */
    function syncAgent(record) {
        const bridge = agentBridge();
        if (!bridge) return { status: 'absent' };
        const details = [];
        try {
            const operations = [];
            for (const field of PROFILE_FIELDS) {
                const value = String(record.profile[field] ?? '').trim();
                if (value) operations.push({ op: 'setProfile', field, text: value });
            }
            const realm = `${record.realm.realm}${record.realm.stage}`.trim();
            if (realm) {
                operations.push({ op: 'setRealm', realm: record.realm.realm, stage: record.realm.stage });
            }
            // 优先用会落盘的那个：selfApply 只改内存，刷新一次就没了。
            const apply = typeof bridge.selfApplyPersisted === 'function'
                ? bridge.selfApplyPersisted
                : (typeof bridge.selfApply === 'function' ? bridge.selfApply : null);
            if (operations.length && apply) {
                details.push(apply(operations, { source: 'cover', day: null }));
            }
            if (typeof bridge.npcLedgerSetPlayerContext === 'function') {
                const opening = record.opening || {};
                bridge.npcLedgerSetPlayerContext(() => ({
                    name: String(record.profile.name || '').trim(),
                    realm: realm || '',
                    location: String(opening.location || record.profile.affiliation || record.profile.origin || '').trim(),
                    status: String(opening.status || '').trim(),
                }));
                details.push({ status: 'player_context_connected' });
            }
        } catch (error) {
            return { status: 'failed', reason: String(error?.message || error) };
        }
        const replayed = details.some(item => item && item.status === 'applied');
        return { status: details.length ? (replayed || details.length > 1 ? 'ok' : 'noop') : 'noop', details };
    }

    async function submit(root, draft, rerender) {
        draft = collect(root, draft);
        const problem = validate(draft);
        if (problem) { say(root, problem); return; }

        const message = buildOpeningMessage(draft);
        const button = root.querySelector('[data-dpc-submit]');
        if (button) button.disabled = true;
        say(root, '正在把身份写进去…');

        const record = persistPlayer(draft);
        const sync = syncAgent(record);

        const slash = slashRunner();
        if (slash) {
            try {
                // 换行在斜杠命令里要写成 {{newline}}；竖线会破坏管道，换成全角。
                const body = message.replace(/\|/g, '｜').replace(/\n/g, '{{newline}}');
                await slash(`/setinput ${body}`);
                draft.committed = true;
                draft.view = 'wizard';
                draft.ui.step = LAST_STEP;
                saveDraft(draft);
                await slash('/trigger');
                say(root, sync.status === 'ok'
                    ? '身份已写进纳戒，第一句话已经发出去了。'
                    : '第一句话已经发出去了。', 'ok');
                rerender();
                return;
            } catch (error) {
                if (button) button.disabled = false;
                say(root, `发送没成功：${String(error?.message || error)}。文字还留在输入框里，你手动按发送也行。`);
                return;
            }
        }

        // 没有斜杠接口：把文字放进输入框，剩下的交给用户按发送。
        const area = hostDocument().querySelector('#send_textarea');
        if (area) {
            area.value = message;
            area.dispatchEvent(new Event('input', { bubbles: true }));
            draft.committed = true;
            draft.view = 'wizard';
            draft.ui.step = LAST_STEP;
            saveDraft(draft);
            rerender();
            say(root, '文字已经放进输入框了，确认一下按发送就行。', 'ok');
            return;
        }
        if (button) button.disabled = false;
        say(root, '这台酒馆既没有斜杠接口也没找到输入框，没法自动开局。请把预览里那段话复制过去发出来。');
    }

    /* ---------------- 绑定 ---------------- */

    function bind(root) {
        const existing = root[BIND_KEY];
        if (existing) return existing;

        let draft = loadDraft();
        const state = { draft };

        function rerender() {
            const stage = root.querySelector('[data-dpc-view]');
            const read = root.querySelector('[data-dpc-read]');
            const actions = root.querySelector('[data-dpc-actions]');
            if (!stage) return;
            const showing = state.draft.ui.step >= 0 && state.draft.view === 'wizard';
            if (!showing) {
                stage.hidden = true;
                stage.innerHTML = '';
                if (read) read.hidden = false;
                if (actions) actions.hidden = false;
                root.setAttribute(READY_ATTR, '1');
                return;
            }
            if (read) read.hidden = true;
            if (actions) actions.hidden = true;
            stage.hidden = false;
            if (state.draft.committed && state.draft.ui.step === LAST_STEP) {
                stage.innerHTML = committedHtml(state.draft);
            } else {
                stage.innerHTML = wizardHtml(state.draft);
            }
            root.setAttribute(READY_ATTR, '1');
            wire();
        }

        function syncDraftFields() {
            // 把当前 DOM 的值收进草稿，切页/存盘都不会丢。
            for (const input of root.querySelectorAll('[data-field]')) {
                const field = input.getAttribute('data-field');
                if (PROFILE_FIELDS.includes(field)) state.draft.identity[field] = String(input.value ?? '').slice(0, capOf(field));
            }
            for (const input of root.querySelectorAll('[data-realm]')) {
                const key = input.getAttribute('data-realm');
                if (key === 'realm') state.draft.realm.realm = String(input.value ?? '').slice(0, 12);
                if (key === 'stage') state.draft.realm.stage = String(input.value ?? '').slice(0, 12);
            }
            for (const input of root.querySelectorAll('[data-opening]')) {
                const field = input.getAttribute('data-opening');
                if (OPENING_FIELDS.includes(field)) state.draft.opening[field] = String(input.value ?? '').slice(0, OPENING_CAPS[field]);
            }
            saveDraft(state.draft);
        }

        function wire() {
            for (const chip of root.querySelectorAll('[data-group] [data-p="chip"]')) {
                chip.addEventListener('click', () => {
                    const group = chip.closest('[data-group]');
                    const field = group?.getAttribute('data-group');
                    if (!PROFILE_FIELDS.includes(field)) return;
                    const value = chip.getAttribute('data-value') || '';
                    const already = state.draft.identity[field] === value;
                    state.draft.identity[field] = already ? '' : value;
                    for (const other of group.querySelectorAll('[data-p="chip"]')) {
                        other.setAttribute('aria-pressed', other === chip && !already ? 'true' : 'false');
                    }
                    saveDraft(state.draft);
                });
            }
            for (const input of root.querySelectorAll('[data-field], [data-realm], [data-opening]')) {
                input.addEventListener('input', () => syncDraftFields());
                input.addEventListener('change', () => syncDraftFields());
            }
            const back = root.querySelector('[data-dpc-back]');
            if (back) back.addEventListener('click', () => {
                syncDraftFields();
                state.draft.ui.step = Math.max(0, state.draft.ui.step - 1);
                saveDraft(state.draft);
                rerender();
            });
            const next = root.querySelector('[data-dpc-next]');
            if (next) next.addEventListener('click', () => {
                syncDraftFields();
                if (state.draft.ui.step === 0 && !state.draft.identity.name.trim()) {
                    say(root, '先把姓名填上，再往下走。');
                    return;
                }
                state.draft.ui.step = Math.min(LAST_STEP, state.draft.ui.step + 1);
                saveDraft(state.draft);
                rerender();
            });
            const submitBtn = root.querySelector('[data-dpc-submit]');
            if (submitBtn) submitBtn.addEventListener('click', () => { void submit(root, state.draft, rerender); });
            const cancel = root.querySelector('[data-dpc-cancel]');
            if (cancel) cancel.addEventListener('click', () => {
                syncDraftFields();
                // 回封面，草稿留着——下次点“开始创建身份”还能接着填。
                state.draft.view = 'cover';
                state.draft.ui.step = 0;
                saveDraft(state.draft);
                rerender();
            });
            const reopen = root.querySelector('[data-dpc-reopen]');
            if (reopen) reopen.addEventListener('click', () => {
                state.draft.committed = false;
                state.draft.view = 'wizard';
                state.draft.ui.step = 0;
                saveDraft(state.draft);
                rerender();
            });
        }

        const start = root.querySelector('[data-dpc-start]');
        if (start) start.addEventListener('click', () => {
            state.draft.view = 'wizard';
            state.draft.ui.step = state.draft.identity.name ? LAST_STEP : 0;
            saveDraft(state.draft);
            rerender();
        });
        const skip = root.querySelector('[data-dpc-skip]');
        if (skip) skip.addEventListener('click', () => {
            const slash = slashRunner();
            if (!slash) { say(root, '没有斜杠接口，直接点输入框开始就行。'); return; }
            state.draft.view = 'cover';
            slash('/setinput 我在这片大陆上醒了过来。{{newline}}{{newline}}（请从这里写起。）')
                .then(() => slash('/trigger'))
                .catch(error => say(root, `没发出去：${String(error?.message || error)}`));
        });

        const binder = {
            state,
            destroy() {
                try { delete root[BIND_KEY]; } catch (_) { root[BIND_KEY] = undefined; }
            },
        };
        root[BIND_KEY] = binder;

        if (state.draft.committed) {
            // 已经开过局的聊天，回来就直接给收尾那一屏，不用再点一遍。
            state.draft.view = 'wizard';
            state.draft.ui.step = LAST_STEP;
            rerender();
        } else {
            rerender();
        }
        return binder;
    }

    /* ---------------- 挂载与重扫 ---------------- */

    function mountAll() {
        const doc = hostDocument();
        const roots = doc.querySelectorAll(`${COVER_SELECTOR}:not([${READY_ATTR}])`);
        for (const root of roots) {
            try {
                root.setAttribute(READY_ATTR, 'pending');
                paintNeeds(root, probeNeeds(loadDraft()));
                bind(root);
                root.setAttribute(READY_ATTR, '1');
                // 脚本接上了：把那句“按钮点了没反应”的自检提示收掉。
                const boot = root.querySelector('[data-dpc-boot]');
                if (boot) boot.remove();
            } catch (error) {
                root.setAttribute(READY_ATTR, 'error');
                try { console.warn('[卡面] 绑定失败', error); } catch (_) { /* 控制台都不可用就算了 */ }
            }
        }
    }

    /** 首楼什么时候渲染出来不由我们说了算，所以既轮询也盯着 DOM 变动。 */
    function scheduleMount() {
        for (const delay of [0, 60, 200, 600, 1500, 3000]) setTimeout(mountAll, delay);
    }

    function watchDom() {
        try {
            const doc = hostDocument();
            if (!doc || typeof MutationObserver !== 'function') return;
            const observer = new MutationObserver(() => {
                if (doc.querySelector(`${COVER_SELECTOR}:not([${READY_ATTR}])`)) mountAll();
            });
            observer.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
        } catch (_) { /* 跨域拿不到父文档就只靠定时重扫 */ }
    }

    scheduleMount();
    watchDom();

    const events = window.tavern_events || (() => { try { return hostWindow().tavern_events; } catch (_) { return null; } })();
    if (events && typeof window.eventOn === 'function') {
        for (const name of ['CHARACTER_MESSAGE_RENDERED', 'MESSAGE_RECEIVED', 'USER_MESSAGE_RENDERED', 'MESSAGE_SWIPED', 'MESSAGE_UPDATED', 'CHAT_CHANGED', 'GENERATION_ENDED']) {
            const event = events[name];
            if (typeof event !== 'string' || !event) continue;
            try {
                window.eventOn(event, () => scheduleMount());
            } catch (_) { /* 老版本事件签名不同，跳过 */ }
        }
    }
})();
