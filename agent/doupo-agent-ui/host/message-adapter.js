/**
 * Delivers the narration into the live chat and reports whether the host
 * actually made it visible. The commit gate treats that report as evidence.
 * A placeholder message can be written first and rewritten in place once the
 * narration is ready, so long generations do not look frozen.
 */
export function createMessageAdapter({ getContext, now = () => Date.now() } = {}) {
    if (typeof getContext !== 'function') throw new TypeError('getContext 必须是函数');

    function indexOf(messageId) {
        const index = Number.parseInt(String(messageId ?? ''), 10);
        return Number.isInteger(index) && index >= 0 ? index : -1;
    }

    function chatOf(context) {
        return Array.isArray(context?.chat) ? context.chat : [];
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
        const index = indexOf(messageId);
        const message = index >= 0 ? chatOf(context)[index] : null;
        if (!message) return { ok: false, reason: 'message_not_found', observed: false };
        message.mes = text;
        message.extra = { ...(message.extra ?? {}), doupo_agent: { ...(message.extra?.doupo_agent ?? {}), placeholder: false } };
        try {
            if (typeof context.updateMessageBlock === 'function') context.updateMessageBlock(index, message);
            else if (typeof context.renderMessage === 'function') context.renderMessage?.(index);
        } catch { /* 渲染失败时聊天数组已经更新，下次刷新仍能看到正文 */ }
        try { await context.saveChat?.(); } catch { /* 保存失败由宿主下次自动保存兜底 */ }
        return { ok: true, method: 'update', messageId: String(index), observed: chatOf(context)[index]?.mes === text };
    }

    async function discard({ messageId } = {}) {
        const context = getContext();
        const index = indexOf(messageId);
        if (!context || index < 0 || !chatOf(context)[index]) return { ok: false, reason: 'message_not_found' };
        try {
            if (typeof context.deleteMessage === 'function') await context.deleteMessage(index);
            else chatOf(context).splice(index, 1);
            try { await context.saveChat?.(); } catch { /* 同上 */ }
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
        const payload = payloadFor(text, taskId, placeholder ? { placeholder: true } : {});
        payload.name = typeof context.name2 === 'string' && context.name2 ? context.name2 : payload.name;

        if (typeof context.addOneMessage === 'function') {
            const before = chatOf(context).length;
            await context.addOneMessage(payload);
            const chat = chatOf(context);
            const last = chat[chat.length - 1];
            const observed = chat.length === before + 1 && typeof last?.mes === 'string' && last.mes === text;
            try { await context.saveChat?.(); } catch { /* 保存失败由宿主下次自动保存兜底 */ }
            return { ok: true, method: 'addOneMessage', messageId: observed ? String(chat.length - 1) : `local-${now()}`, observed };
        }

        if (typeof context.sendMessage === 'function') {
            const result = await context.sendMessage(text, { name: payload.name });
            return { ok: true, method: 'sendMessage', messageId: String(result?.messageId ?? result?.index ?? `local-${now()}`), observed: true };
        }

        if (typeof context.executeSlashCommandsWithOptions === 'function') {
            const result = await context.executeSlashCommandsWithOptions(`/send ${text}`, { showsystemMessage: false });
            return { ok: true, method: 'slash', messageId: String(result?.messageId ?? `slash-${now()}`), observed: true };
        }

        return { ok: false, reason: 'no_message_api', observed: false };
    }

    function canDeliver() {
        const context = getContext();
        return typeof context?.addOneMessage === 'function' || typeof context?.sendMessage === 'function' || typeof context?.executeSlashCommandsWithOptions === 'function';
    }

    return Object.freeze({ deliver, update, discard, canDeliver });
}
