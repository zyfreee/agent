const EFFECTS = new Set(['set', 'add', 'remove']);
function text(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空文本`);
    return value.trim();
}
function valueType(value) { return value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value; }

/** Cross-module consistency gate for uncommitted turn candidates. */
export function createQualityGate({ maxChanges = 200, maxIssues = 100, contracts } = {}) {
    if (!Number.isInteger(maxChanges) || maxChanges < 1 || maxChanges > 2000) throw new RangeError('maxChanges 超出范围');
    if (!Number.isInteger(maxIssues) || maxIssues < 1 || maxIssues > 500) throw new RangeError('maxIssues 超出范围');
    if (contracts !== undefined && typeof contracts?.validateValue !== 'function') throw new TypeError('contracts 必须提供 validateValue 接口');
    function review({ sessionId, branchId, stateVersion, allowedPlayerActions = [], changes = [], claims = [], visibleFactIds = [], approvedChangeIds = [] } = {}) {
        sessionId = text(sessionId, 'sessionId'); branchId = text(branchId, 'branchId'); stateVersion = text(stateVersion, 'stateVersion');
        for (const [value, name] of [[allowedPlayerActions, 'allowedPlayerActions'], [changes, 'changes'], [claims, 'claims'], [visibleFactIds, 'visibleFactIds'], [approvedChangeIds, 'approvedChangeIds']]) {
            if (!Array.isArray(value)) throw new TypeError(`${name} 必须是数组`);
        }
        if (changes.length > maxChanges || claims.length > maxChanges || visibleFactIds.length > 10000 || approvedChangeIds.length > 10000) return { status: 'rejected', reason: 'input_limit', issues: [] };
        const allowedActions = new Set(allowedPlayerActions.filter(item => typeof item === 'string'));
        const visible = new Set(visibleFactIds.filter(item => typeof item === 'string'));
        const approved = new Set(approvedChangeIds.filter(item => typeof item === 'string'));
        const issues = [];
        const add = issue => { if (issues.length < maxIssues) issues.push(issue); };
        const seenFields = new Map();
        for (const change of changes) {
            if (!change || typeof change !== 'object' || Array.isArray(change)) { add({ code: 'invalid_change' }); continue; }
            if (change.sessionId !== sessionId || change.branchId !== branchId || change.stateVersion !== stateVersion) add({ code: 'scope_or_version_mismatch', changeId: change.id ?? null });
            if (!EFFECTS.has(change.type ?? change.effectType)) add({ code: 'unsupported_effect', changeId: change.id ?? null });
            const targetId = change.targetId;
            const field = change.field ?? change.effect?.field;
            if (typeof targetId !== 'string' || !targetId.trim() || typeof field !== 'string' || !field.trim()) { add({ code: 'missing_target_or_field', changeId: change.id ?? null }); continue; }
            const key = `${targetId}\u0000${field}`;
            if (seenFields.has(key)) add({ code: 'multiple_writers_same_field', targetId, field, changeIds: [seenFields.get(key), change.id ?? null] });
            else seenFields.set(key, change.id ?? null);
            if (contracts) {
                const fieldContract = contracts.get?.(targetId)?.fields?.find(item => item.id === field);
                if (!fieldContract) { add({ code: 'unregistered_contract_field', changeId: change.id ?? null, targetId, field }); continue; }
                const hasValue = Object.hasOwn(change, 'value') || Object.hasOwn(change.effect ?? {}, 'value');
                const proposedValue = Object.hasOwn(change, 'value') ? change.value : change.effect?.value;
                if (!hasValue) { add({ code: 'missing_change_value', changeId: change.id ?? null }); continue; }
                const validation = contracts.validateValue({ objectId: targetId, fieldId: field, value: proposedValue, writer: change.writer });
                if (validation.status !== 'accepted') { add({ code: validation.reason === 'not_sole_writer' ? 'unauthorized_field_writer' : 'contract_value_invalid', changeId: change.id ?? null, reason: validation.reason }); continue; }
            }
            if (change.origin === 'player' && change.playerAction === true) {
                const authorization = `${change.actionTargetId ?? targetId}:${change.actionMethod ?? ''}`;
                if (!allowedActions.has(authorization)) add({ code: 'player_action_outside_authorization', changeId: change.id ?? null, authorization });
            }
        }
        for (const claim of claims) {
            if (!claim || typeof claim !== 'object' || Array.isArray(claim)) { add({ code: 'invalid_claim' }); continue; }
            if (claim.kind === 'fact') {
                const refs = claim.factIds;
                if (!Array.isArray(refs) || refs.length === 0) { add({ code: 'fact_claim_missing_reference', claimId: claim.id ?? null }); continue; }
                for (const id of refs) if (!visible.has(id)) add({ code: 'claim_uses_hidden_fact', claimId: claim.id ?? null, factId: id });
            }
            if (claim.changeId && !approved.has(claim.changeId)) add({ code: 'claim_uses_unapproved_change', claimId: claim.id ?? null, changeId: claim.changeId });
        }
        const blocking = issues.some(issue => issue.code !== 'claim_uses_hidden_fact');
        return { status: blocking ? 'needs_review' : 'candidate', sessionId, branchId, stateVersion, issues, acceptedChanges: blocking ? [] : structuredClone(changes), committed: false,
            note: blocking ? '发现范围、授权或字段冲突；所有变化都必须返回总控重新核准。' : issues.length ? '存在事实引用告警，需核对可见范围；无其他一致性冲突。' : '结构一致性检查通过；仍须由总控与正式状态写入者提交。' };
    }
    return Object.freeze({ review });
}
