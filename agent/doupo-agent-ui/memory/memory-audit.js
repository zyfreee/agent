/** 记忆体检（MemPalace audit/organization score 的模拟）：纯本地统计账本健康度，
 *  不发任何模型调用——
 *  - pairs：疑似重复/矛盾对（复用 findMemoryConflicts；调用方已算好可直接传入免重算）；
 *  - deadKeys：孤立钥匙——只被一条在用记忆引用、且认领不到任何台账实体（人物簿/世界）
 *    的"关联/别名"，多半是笔误或写错的名号，提示玩家修正；
 *  - coverage：目录覆盖——当前字数预算下召回员目录里实际能看到几条在用记忆。
 *  纯函数、零 DOM；任何输入异常都降级为空统计。 */

import { recallKeys } from './memory-retrieve.js';
import { findMemoryConflicts } from './memory-ops.js';

const MIN_KEY_LENGTH = 2;

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function intOr(value, fallback = 0) {
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : fallback;
}

/** 钥匙 ↔ 台账实体名：全等永远算认领；两边都 ≥2 字才做双向包含（与 person-view 同判定）。 */
function namesConnect(key, name) {
    const a = key.toLowerCase();
    const b = name.toLowerCase();
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length < 2 || b.length < 2) return false;
    return a.includes(b) || b.includes(a);
}

/** 目录文本里的在用编号：行格式固定 `- 编号|层|标题（钥匙）`。 */
export function catalogedIds(catalogText) {
    const ids = new Set();
    for (const match of String(catalogText ?? '').matchAll(/^- (\S+?)\|/gm)) ids.add(match[1]);
    return ids;
}

export function auditMemory({ snapshot = {}, pairs = null, catalogText = '', catalogBudget = 0, knownNames = [] } = {}) {
    const all = Array.isArray(snapshot?.entries) ? snapshot.entries.filter(Boolean) : [];
    const open = all.filter(entry => !text(entry.supersededBy));
    // 冲突对：caller 已算过就不再重跑 O(n²)。
    const conflictPairs = Array.isArray(pairs) ? pairs : findMemoryConflicts(all);
    // 钥匙 → 引用它的在用条目；只被一条引用且无人认领的即孤立钥匙。
    const keyIds = new Map();
    for (const entry of open) {
        for (const key of recallKeys(entry)) {
            if (!keyIds.has(key)) keyIds.set(key, []);
            keyIds.get(key).push(text(entry.id) || '（未编号）');
        }
    }
    const known = (Array.isArray(knownNames) ? knownNames : []).map(text).filter(Boolean);
    const deadKeys = [];
    for (const [key, ids] of keyIds) {
        if (ids.length !== 1 || key.length < MIN_KEY_LENGTH) continue;
        if (known.some(name => namesConnect(key, name))) continue;
        deadKeys.push({ key, ids });
    }
    deadKeys.sort((a, b) => a.key.localeCompare(b.key, 'zh'));
    const cataloged = open.filter(entry => catalogedIds(catalogText).has(text(entry.id))).length;
    return {
        pairs: conflictPairs,
        deadKeys,
        coverage: { cataloged, total: open.length, budgetChars: Math.max(0, intOr(catalogBudget)) },
        superseded: all.length - open.length,
        major: open.filter(entry => entry.weight === 'major').length,
    };
}
