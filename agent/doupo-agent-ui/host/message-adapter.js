/**
 * Delivers the narration into the live chat and reports whether the host
 * actually made it visible. The commit gate treats that report as evidence.
 * A placeholder message can be written first and rewritten in place once the
 * narration is ready, so long generations do not look frozen.
 */
export function createMessageAdapter({ getContext, now = () => Date.now(), capture = () => null, isCurrent = () => true } = {}) {
    if (typeof getContext !== 'function') throw new TypeError('getContext 必须是函数');

    function indexOf(messageId) {
        const index = Number.parseInt(String(messageId ?? ''), 10);
        return Number.isInteger(index) && index >= 0 ? index : -1;
    }

    function chatOf(context) {
        return Array.isArray(context?.chat) ? context.chat : [];
    }

    // The supplied owner must bind chat/branch/epoch, not the last reply: delivery intentionally changes it.
    function currentFor(context) {
        const owner = capture();
        const chat = context?.chat;
        return () => isCurrent(owner) && getContext()?.chat === chat;
    }

    function payloadFor(text, taskId, extra = {}) {
        return {
            name: 'Agent',
            is_user: false,
            is_system: false,
            mes: text,
            send_date: now(),
            extra: { doupo_agent: { taskId: String(taskId ?? ''), ...extra } },
        };
    }

    async function update({ messageId, text } = {}) {
        if (typeof text !== 'string' || !text.trim()) throw new TypeError('消息正文必须是非空文本');
        const context = getContext();
        if (!context) return { ok: false, reason: 'host_unavailable', observed: false };
        const current = currentFor(context);
        if (!current()) return { ok: false, reason: 'stale', observed: false };
        const index = indexOf(messageId);
        const message = index >= 0 ? chatOf(context)[index] : null;
        if (!message) return { ok: false, reason: 'message_not_found', observed: false };
        message.mes = text;
        message.extra = { ...(message.extra ?? {}), doupo_agent: { ...(message.extra?.doupo_agent ?? {}), placeholder: false } };
        let rendered = false;
        let saved = false;
        try {
            if (typeof context.updateMessageBlock === 'function') { await context.updateMessageBlock(index, message); rendered = true; }
            else if (typeof context.renderMessage === 'function') { await context.renderMessage(index); rendered = true; }
        } catch { /* Array mutation alone is not visibility evidence. */ }
        if (!current()) return { ok: false, reason: 'stale', observed: false, rendered, saved };
        try { if (typeof context.saveChat === 'function') { await context.saveChat(); saved = true; } } catch { /* Report failure, do not open commit gate. */ }
        const observed = current() && rendered && saved && chatOf(getContext())[index] === message && message.mes === text;
        return { ok: observed, method: 'update', messageId: String(index), observed, rendered, saved };
    }

    async function discard({ messageId } = {}) {
        const context = getContext();
        const index = indexOf(messageId);
        if (!context || index < 0 || !chatOf(context)[index]) return { ok: false, reason: 'message_not_found' };
        const current = currentFor(context);
        if (!current()) return { ok: false, reason: 'stale' };
        try {
            if (typeof context.deleteMessage === 'function') await context.deleteMessage(index);
            else chatOf(context).splice(index, 1);
            if (!current()) return { ok: false, reason: 'stale' };
            try { await context.saveChat?.(); } catch { /* 同上 */ }
            if (!current()) return { ok: false, reason: 'stale' };
            return { ok: true, messageId: String(index) };
        } catch (error) {
            return { ok: false, reason: String(error?.message ?? error) };
        }
    }

    async function deliver({ text, taskId, messageId, placeholder = false } = {}) {
        if (typeof text !== 'string' || !text.trim()) throw new TypeError('消息正文必须是非空文本');
        if (indexOf(messageId) >= 0 && !placeholder) return update({ messageId, text });
        const context = getContext();
        if (!context) return { ok: false, reason: 'host_unavailable', observed: false };
        const current = currentFor(context);
        if (!current()) return { ok: false, reason: 'stale', observed: false };
        const payload = payloadFor(text, taskId, placeholder ? { placeholder: true } : {});
        payload.name = typeof context.name2 === 'string' && context.name2 ? context.name2 : payload.name;

        const before = new Set(chatOf(context));
        async function receipt(method, result) {
            if (!current()) return { ok: false, method, reason: 'stale', observed: false };
            const chat = chatOf(getContext());
            const returned = indexOf(result?.messageId ?? result?.index);
            const candidates = chat.map((row, index) => ({ row, index })).filter(({ row }) => !before.has(row) && row?.mes === text);
            const match = returned >= 0 ? candidates.find(({ index }) => index === returned)
                : candidates.length === 1 ? candidates[0] : null;
            let saved = false;
            try { if (typeof context.saveChat === 'function') { await context.saveChat(); saved = true; } } catch { /* No durable receipt. */ }
            const observed = current() && !!match && saved && chatOf(getContext())[match.index] === match.row;
            return { ok: observed, method, ...(match ? { messageId: String(match.index) } : {}), observed, saved };
        }
        if (typeof context.addOneMessage === 'function') {
            return receipt('addOneMessage', await context.addOneMessage(payload));
        }
        if (typeof context.sendMessage === 'function') {
            return receipt('sendMessage', await context.sendMessage(text, { name: payload.name }));
        }
        if (typeof context.executeSlashCommandsWithOptions === 'function') {
            return receipt('slash', await context.executeSlashCommandsWithOptions(`/send ${text}`, { showsystemMessage: false }));
        }

        return { ok: false, reason: 'no_message_api', observed: false };
    }

    function canDeliver() {
        const context = getContext();
        return typeof context?.addOneMessage === 'function' || typeof context?.sendMessage === 'function' || typeof context?.executeSlashCommandsWithOptions === 'function';
    }

    return Object.freeze({ deliver, update, discard, canDeliver });
}
