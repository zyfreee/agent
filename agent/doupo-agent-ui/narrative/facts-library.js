const REALMS = new Set(['canon', 'official', 'adaptation', 'reference', 'fanon', 'unknown']);
const EVIDENCE_KINDS = new Set(['stated', 'character-claim', 'rumor', 'inference']);

function requireText(value, label) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} 必须是非空文本`);
    return value.trim();
}

function normalizeSource(source) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new TypeError('来源登记必须是对象');
    const realm = source.realm ?? 'unknown';
    if (!REALMS.has(realm)) throw new TypeError(`来源 realm 无效：${realm}`);
    return Object.freeze({
        id: requireText(source.id, '来源 id'), title: requireText(source.title, '来源标题'),
        continuity: requireText(source.continuity, '作品/改编线'), edition: requireText(source.edition, '版本'),
        realm, provenance: requireText(source.provenance, '来源说明'),
        coveredThrough: Number.isInteger(source.coveredThrough) && source.coveredThrough >= 0 ? source.coveredThrough : null,
        missing: Object.freeze(Array.isArray(source.missing) ? source.missing.map(String) : []),
    });
}

function normalizeFact(fact, sources) {
    if (!fact || typeof fact !== 'object' || Array.isArray(fact)) throw new TypeError('事实条目必须是对象');
    const source = sources.get(requireText(fact.sourceId, '来源 id'));
    if (!source) throw new Error(`事实引用了未登记来源：${fact.sourceId}`);
    const evidenceKind = fact.evidenceKind ?? 'stated';
    if (!EVIDENCE_KINDS.has(evidenceKind)) throw new TypeError(`证据性质无效：${evidenceKind}`);
    const phase = Number.isInteger(fact.phase) && fact.phase >= 0 ? fact.phase : null;
    return Object.freeze({
        id: requireText(fact.id, '事实 id'), subject: requireText(fact.subject, '对象'),
        predicate: requireText(fact.predicate, '事实类别'), text: requireText(fact.text, '事实内容'),
        aliases: Object.freeze(Array.isArray(fact.aliases) ? fact.aliases.map(String) : []),
        sourceId: source.id, sourceLabel: `${source.title} · ${source.edition}`,
        continuity: source.continuity, realm: source.realm, phase, evidenceKind,
        reviewStatus: 'current',
        location: typeof fact.location === 'string' ? fact.location : '',
        evidence: typeof fact.evidence === 'string' ? fact.evidence : '',
        polarity: fact.polarity === 'negative' ? 'negative' : 'positive',
    });
}

/** In-memory, explicitly scoped fact lookup. It does not ingest or persist source text. */
export function createFactsLibrary({ onRegister } = {}) {
    const sources = new Map();
    const facts = new Map();
    const sourceHistory = new Map();
    function registerSource(raw) {
        const source = normalizeSource(raw);
        if (sources.has(source.id)) throw new Error(`来源 id 已登记：${source.id}`);
        sources.set(source.id, source);
        sourceHistory.set(source.id, [{ revision: 1, source, changedAt: new Date().toISOString(), reason: 'initial-registration' }]);
        return source.id;
    }
    function getSource(id) {
        const source = sources.get(id);
        if (!source) return undefined;
        return { ...source, missing: [...source.missing] };
    }
    function listSourceRevisions(id) {
        return (sourceHistory.get(id) ?? []).map(item => ({ revision: item.revision, changedAt: item.changedAt, reason: item.reason, source: { ...item.source, missing: [...item.source.missing] } }));
    }
    function updateSource(id, patch, { expectedRevision, reason } = {}) {
        const history = sourceHistory.get(id);
        if (!history) return { accepted: false, reason: 'unknown_source' };
        const currentRevision = history.at(-1).revision;
        if (expectedRevision !== currentRevision) return { accepted: false, reason: 'revision_mismatch', currentRevision };
        const updated = normalizeSource({ ...sources.get(id), ...patch, id });
        const meaningfulChange = JSON.stringify(updated) !== JSON.stringify(sources.get(id));
        if (!meaningfulChange) return { accepted: true, changed: false, revision: currentRevision, affectedFactIds: [] };
        const entry = { revision: currentRevision + 1, source: updated, changedAt: new Date().toISOString(), reason: requireText(reason, '修订原因') };
        sources.set(id, updated);
        history.push(entry);
        const affectedFactIds = [];
        for (const [factId, fact] of facts) {
            if (fact.sourceId !== id) continue;
            facts.set(factId, Object.freeze({ ...fact, reviewStatus: 'needs-review', sourceRevision: entry.revision }));
            affectedFactIds.push(factId);
        }
        return { accepted: true, changed: true, revision: entry.revision, affectedFactIds };
    }
    function reviewFact(id, { expectedSourceRevision, decision, note = '' } = {}) {
        const fact = facts.get(id);
        if (!fact) return { accepted: false, reason: 'unknown_fact' };
        const sourceRevision = sourceHistory.get(fact.sourceId).at(-1).revision;
        if (expectedSourceRevision !== sourceRevision) return { accepted: false, reason: 'revision_mismatch', currentRevision: sourceRevision };
        if (!['confirmed', 'corrected', 'rejected'].includes(decision)) throw new TypeError('复核 decision 必须是 confirmed、corrected 或 rejected');
        const next = Object.freeze({ ...fact, reviewStatus: decision, reviewNote: String(note), sourceRevision });
        facts.set(id, next);
        return { accepted: true, fact: { ...next } };
    }
    function registerFact(raw) {
        const fact = normalizeFact(raw, sources);
        if (facts.has(fact.id)) throw new Error(`事实 id 已登记：${fact.id}`);
        facts.set(fact.id, fact);
        return fact.id;
    }
    const QUERY_STOP_WORDS = new Set(['什么', '怎么', '如何', '为何', '多少', '哪里', '哪儿', '这个', '那个', '请问', '一下', '是不', '不是', '我们', '你们', '他们', '一个', '可以', '没有', '就是', '还是', '这些', '那些', '知道', '告诉', '觉得', '现在', '然后']);
    function queryTokens(needle) {
        const tokens = new Set();
        for (const chunk of needle.replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/)) {
            if (!chunk) continue;
            if (/^[\u4e00-\u9fff]+$/u.test(chunk)) {
                if (chunk.length === 1) tokens.add(chunk);
                for (let index = 0; index < chunk.length - 1; index += 1) {
                    const pair = chunk.slice(index, index + 2);
                    if (!QUERY_STOP_WORDS.has(pair)) tokens.add(pair);
                }
            } else if (chunk.length >= 2) {
                tokens.add(chunk);
            }
        }
        return [...tokens].slice(0, 24);
    }
    function factTexts(fact) {
        return [fact.subject, ...(Array.isArray(fact.aliases) ? fact.aliases : []), fact.predicate, fact.text]
            .map(part => (typeof part === 'string' ? part : String(part ?? '')))
            .map(part => part.toLocaleLowerCase());
    }
    function query({ query, sourceIds, continuity, realm, asOf, limit = 12 } = {}) {
        const needle = requireText(query, '查询词').toLocaleLowerCase();
        if (!Array.isArray(sourceIds) || sourceIds.length === 0) return { status: 'needs_scope', results: [], conflicts: [], note: '必须由调用方明确提供允许查询的来源范围。' };
        if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new RangeError('limit 必须为 1 到 50');
        const allowed = new Set(sourceIds);
        const tokens = queryTokens(needle);
        const matches = [];
        for (const fact of facts.values()) {
            if (!allowed.has(fact.sourceId)) continue;
            if (continuity && fact.continuity !== continuity) continue;
            if (realm && fact.realm !== realm) continue;
            if (fact.reviewStatus === 'needs-review') continue;
            if (Number.isInteger(asOf) && (fact.phase === null || fact.phase > asOf)) continue;
            const texts = factTexts(fact);
            let score = texts.some(text => text.includes(needle)) ? 5 : 0;
            for (const token of tokens) if (texts.some(text => text.includes(token))) score += 1;
            if (score > 0) matches.push({ fact, score });
        }
        matches.sort((left, right) => right.score - left.score || String(left.fact.id).localeCompare(String(right.fact.id)));
        const groups = new Map();
        for (const { fact } of matches) {
            const key = `${fact.subject.toLocaleLowerCase()}|${fact.predicate.toLocaleLowerCase()}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(fact);
        }
        const conflicts = [...groups.values()].filter(group => new Set(group.map(item => item.polarity)).size > 1)
            .map(group => ({ subject: group[0].subject, predicate: group[0].predicate, factIds: group.map(item => item.id) }));
        const results = matches.slice(0, limit).map(item => ({ ...item.fact }));
        const sourceInfo = [...new Set(results.map(item => item.sourceId))].map(id => {
            const source = sources.get(id);
            return { id, title: source.title, edition: source.edition, continuity: source.continuity, realm: source.realm, provenance: source.provenance, coveredThrough: source.coveredThrough, missing: [...source.missing], revision: sourceHistory.get(id).at(-1).revision };
        });
        const status = matches.length > limit ? 'partial' : matches.length ? (conflicts.length ? 'conflict' : 'supported') : 'not_found';
        return { status, query: needle, results, conflicts, sources: sourceInfo,
            note: status === 'not_found' ? '当前允许来源范围内未检索到；不表示原著中不存在。' : status === 'partial' ? '结果受数量上限截断。' : '' };
    }
    function queryForActor({ actorId, knownFactIds, ...scope } = {}) {
        actorId = requireText(actorId, 'actorId');
        if (!Array.isArray(knownFactIds) || knownFactIds.length > 10000 || knownFactIds.some(id => typeof id !== 'string' || !id.trim())) throw new TypeError('knownFactIds 必须是有界文本数组');
        const knowledge = new Set(knownFactIds);
        const result = query(scope);
        if (!result.results.length) return { ...result, actorId, results: [] };
        const allowedResults = result.results.filter(fact => knowledge.has(fact.id));
        const hiddenCount = result.results.length - allowedResults.length;
        const allowedIds = new Set(allowedResults.map(fact => fact.id));
        const conflicts = result.conflicts.map(conflict => ({ ...conflict, factIds: conflict.factIds.filter(id => allowedIds.has(id)) })).filter(conflict => conflict.factIds.length > 1);
        return { ...result, actorId, status: allowedResults.length ? (conflicts.length ? 'conflict' : 'supported') : 'not_known_to_actor', results: allowedResults, conflicts, hiddenCount,
            note: allowedResults.length ? result.note : '允许来源中可能存在匹配资料，但提供的角色已知事实列表不包含它们；不得向该角色泄露。' };
    }
    function listFactsNeedingReview() {
        return [...facts.values()].filter(fact => fact.reviewStatus === 'needs-review').map(fact => ({ ...fact }));
    }
    function clear() { facts.clear(); sources.clear(); sourceHistory.clear(); }
    const api = Object.freeze({ registerSource, registerFact, getSource, listSourceRevisions, updateSource, reviewFact, listFactsNeedingReview, query, queryForActor, clear });
    onRegister?.(api);
    return api;
}
