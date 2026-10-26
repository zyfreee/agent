const KINDS = Object.freeze(['rumor', 'commission']);
const KNOWLEDGE = Object.freeze(['witnessed', 'reported', 'inferred']);
const TRUTH = Object.freeze(['true', 'false', 'unknown']);
const RELIABILITY = Object.freeze(['reliable', 'uncertain', 'unknown']);
const OPEN_STATES = new Set(['open']);

function need(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}

function clip(value, limit) { return String(value ?? '').trim().slice(0, limit); }

/**
 * 没有主线时的动机与信息源：传闻带来源与可信度，委托带期限与失败后果。
 * 信息分三档（亲见／转述／推测），传闻可能是错的，而且是有依据的错。
 */
export function createSandboxLeads({ maxOpen = 12, now = () => new Date().toISOString() } = {}) {
    if (!Number.isInteger(maxOpen) || maxOpen < 1 || maxOpen > 64) throw new RangeError('maxOpen 必须在 1 到 64 之间');
    const leads = new Map();
    let sequence = 0;

    const scopeOf = ({ sessionId, branchId } = {}) => `${need(sessionId, 'sessionId')}\u0000${need(branchId, 'branchId')}`;

    function add({ sessionId, branchId, kind = 'rumor', text, source, knowledge = 'reported', truth = 'unknown', issuer, deadlineDay = null, reward = '', failureConsequence = '' } = {}) {
        scopeOf({ sessionId, branchId });
        if (!KINDS.includes(kind)) throw new TypeError(`不支持的线索类型：${kind}`);
        if (!KNOWLEDGE.includes(knowledge)) throw new TypeError(`不支持的信息档位：${knowledge}`);
        if (!TRUTH.includes(truth)) throw new TypeError(`不支持的真伪标记：${truth}`);
        const name = need(source?.name, '线索来源');
        const reliability = source?.reliability ?? 'unknown';
        if (!RELIABILITY.includes(reliability)) throw new TypeError(`不支持的可信度：${reliability}`);
        let deadline = deadlineDay;
        let from = null;
        if (kind === 'commission') {
            from = need(issuer, '委托发布方');
            if (!Number.isInteger(deadlineDay) || deadlineDay < 0) throw new RangeError('委托必须带非负整数期限 deadlineDay');
        } else if (deadlineDay !== null && (!Number.isInteger(deadlineDay) || deadlineDay < 0)) throw new RangeError('deadlineDay 必须是非负整数或 null');
        if (kind === 'rumor') deadline = deadlineDay;
        const open = [...leads.values()].filter(lead => lead.sessionId === sessionId && lead.branchId === branchId && OPEN_STATES.has(lead.state));
        if (open.length >= maxOpen) return { status: 'rejected', reason: 'lead_limit_reached', maxOpen, open: open.map(lead => lead.id) };
        const lead = {
            id: `lead-${++sequence}`, sessionId, branchId, kind,
            text: clip(need(text, '线索内容'), 500),
            source: { name: clip(name, 80), reliability },
            knowledge, truth, issuer: from, deadlineDay: deadline,
            reward: clip(reward, 200), failureConsequence: clip(failureConsequence, 200),
            state: 'open', createdAt: now(), history: [],
        };
        leads.set(lead.id, lead);
        return { status: 'candidate', committed: false, lead: structuredClone(lead) };
    }

    /** 到期只生成建议，不动状态；委托过期后不自动续发。 */
    function expire({ sessionId, branchId, day } = {}) {
        scopeOf({ sessionId, branchId });
        if (!Number.isInteger(day) || day < 0) throw new RangeError('day 必须是非负整数');
        const updates = [];
        const proposals = [];
        for (const lead of leads.values()) {
            if (lead.sessionId !== sessionId || lead.branchId !== branchId) continue;
            if (lead.state !== 'open' || lead.kind !== 'commission' || lead.deadlineDay === null) continue;
            if (day <= lead.deadlineDay) continue;
            updates.push({ leadId: lead.id, toState: 'expired', day, reason: 'deadline_passed' });
            proposals.push({ id: `${lead.id}@expired@${day}`, leadId: lead.id, kind: lead.kind, fromState: lead.state, toState: 'expired', day, failureConsequence: lead.failureConsequence, committed: false });
        }
        return { status: proposals.length ? 'candidate' : 'empty', day, proposals, updates, committed: false };
    }

    function settle({ sessionId, branchId, leadId, toState = 'closed', reason = '' } = {}) {
        scopeOf({ sessionId, branchId });
        const lead = leads.get(need(leadId, 'leadId'));
        if (!lead) return { status: 'rejected', reason: 'unknown_lead' };
        if (lead.sessionId !== sessionId || lead.branchId !== branchId) return { status: 'rejected', reason: 'scope_mismatch' };
        if (lead.state !== 'open') return { status: 'rejected', reason: 'already_settled', state: lead.state };
        if (toState !== 'closed' && toState !== 'expired') throw new TypeError('结算状态只能是 closed 或 expired');
        lead.state = toState;
        lead.history.push({ toState, reason: clip(reason, 200), at: now() });
        return { status: 'candidate', committed: false, lead: structuredClone(lead) };
    }

    function list({ sessionId, branchId } = {}) {
        const scope = scopeOf({ sessionId, branchId });
        return [...leads.values()].filter(lead => `${lead.sessionId}\u0000${lead.branchId}` === scope).map(lead => structuredClone(lead));
    }

    function clear() { leads.clear(); sequence = 0; }
    return Object.freeze({ add, expire, settle, list, clear, kinds: KINDS, knowledge: KNOWLEDGE, truth: TRUTH, reliability: RELIABILITY });
}

export { KINDS as LEAD_KINDS, KNOWLEDGE as LEAD_KNOWLEDGE, TRUTH as LEAD_TRUTH, RELIABILITY as LEAD_RELIABILITY };
