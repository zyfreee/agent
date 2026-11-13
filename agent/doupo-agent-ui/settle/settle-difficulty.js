/**
 * 难度+骰子判定器：把"成败全凭模型自由心证"补上一把公平的尺子。
 * 参照 TTRPG 经典裁决（难度阈 + 掷骰 + 修正）与 Blades in the Dark 的
 * position 双轴：模型只报风险档位（difficulty）与带依据的修正（modifiers），
 * 脚本掷 d20 定 成功/部分成功/失败，再由结算审核器照常复核效果。
 *
 * 裁定原则——只降不升：掷骰只能把模型宣称的 success 降为 partial/failure，
 * 绝不把 failure 升成 success。insufficient/not_executed 属于执行门槛判定，
 * 不归骰子管，原样保留。战斗里对手境界高过玩家时，脚本强制抬高最低难度档。
 */

import { parseRealm } from '../core/settle-categories.js';
import { ensurePartialCost } from './settle-consequences.js';
import { rollSettleOracle } from './settle-oracle.js';

export const SETTLE_DIFFICULTIES = Object.freeze(['controlled', 'standard', 'risky', 'desperate']);
export const SETTLE_DIFFICULTY_LABELS = Object.freeze({ controlled: '受控', standard: '常规', risky: '冒险', desperate: '绝望' });
export const SETTLE_DIFFICULTY_DC = Object.freeze({ controlled: 8, standard: 11, risky: 14, desperate: 17 });
export const SETTLE_DICE_SIDES = 20;
export const SETTLE_PARTIAL_MARGIN = 4;
export const SETTLE_MODIFIER_MAX = 3;
export const SETTLE_MODIFIER_TOTAL_MAX = 4;
export const SETTLE_DICE_STATUSES = Object.freeze(['success', 'partial', 'failure']);
const STATUS_RANK = Object.freeze({ success: 2, partial: 1, failure: 0 });

const text = value => typeof value === 'string' ? value.trim() : '';

/** 生产用 rng：优先 crypto，环境没有再退 Math.random。 */
export function createSettleDiceRng() {
    const source = typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues
        ? globalThis.crypto
        : null;
    if (!source) return Math.random;
    const buffer = new Uint32Array(1);
    return () => source.getRandomValues(buffer)[0] / 2 ** 32;
}

/** 模型报的档位只认四档枚举；缺省/写错一律按『常规』。 */
export function normalizeSettleDifficulty(value) {
    return SETTLE_DIFFICULTIES.includes(value) ? value : 'standard';
}

/** 修正项逐条要依据；单条 |value|≤3、总计 [-4,+4]，越界收敛并记录。 */
export function normalizeSettleModifiers(list) {
    const kept = [];
    const notes = [];
    let total = 0;
    for (const item of Array.isArray(list) ? list : []) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) { notes.push('丢弃：修正项不是对象'); continue; }
        const reason = text(item.reason);
        if (!reason) { notes.push('丢弃：修正项缺少依据'); continue; }
        const raw = typeof item.value === 'number' && Number.isFinite(item.value) ? item.value : Number.NaN;
        if (!Number.isFinite(raw)) { notes.push(`丢弃：修正『${reason.slice(0, 20)}』数值不是有限数`); continue; }
        if (Math.abs(raw) > SETTLE_MODIFIER_MAX) { notes.push(`收敛：修正『${reason.slice(0, 20)}』${raw} 超出 ±${SETTLE_MODIFIER_MAX}，按 ±${SETTLE_MODIFIER_MAX} 计`); }
        const value = Math.sign(raw) * Math.min(SETTLE_MODIFIER_MAX, Math.abs(raw));
        total += value;
        kept.push({ reason: reason.slice(0, 80), value });
    }
    if (Math.abs(total) > SETTLE_MODIFIER_TOTAL_MAX) {
        notes.push(`收敛：修正总计 ${total} 超出 ±${SETTLE_MODIFIER_TOTAL_MAX}，按 ±${SETTLE_MODIFIER_TOTAL_MAX} 计`);
        total = Math.sign(total) * SETTLE_MODIFIER_TOTAL_MAX;
    }
    return { value: total, kept, notes };
}

/** 单行动掷骰：大暑（nat 1）必败、大顺（nat 20）必成，其余 d20+修正对难度阈。 */
export function adjudicateSettleAction({ difficulty = 'standard', modifiers = [] } = {}, { rng = Math.random } = {}) {
    const normalized = normalizeSettleDifficulty(difficulty);
    const modifier = normalizeSettleModifiers(modifiers);
    const die = 1 + Math.floor((typeof rng === 'function' ? rng() : Math.random()) * SETTLE_DICE_SIDES);
    const dc = SETTLE_DIFFICULTY_DC[normalized];
    let status;
    if (die === SETTLE_DICE_SIDES) status = 'success';
    else if (die === 1) status = 'failure';
    else if (die + modifier.value >= dc) status = 'success';
    else if (die + modifier.value >= dc - SETTLE_PARTIAL_MARGIN) status = 'partial';
    else status = 'failure';
    return { difficulty: normalized, modifier: modifier.value, modifierNotes: modifier.notes, die, dc, status };
}

/** 战斗最低难度：证据里点名的对手每高一个大境界抬一档（≥2 个大境界直接绝望）。 */
function combatRealmFloor(action, npcs, playerRealm) {
    if (action.category !== 'combat' || !Array.isArray(npcs) || !npcs.length) return null;
    const player = parseRealm(playerRealm);
    if (!player) return null;
    const evidence = text(action.evidence);
    for (const npc of npcs) {
        const name = text(npc?.name);
        if (!name || !evidence.includes(name)) continue;
        const opponent = parseRealm(npc.realm);
        if (!opponent) continue;
        const gap = opponent.realm - player.realm;
        return gap >= 2 ? 'desperate' : gap === 1 ? 'risky' : null;
    }
    return null;
}

/** 失败不得有收益：只保留真实损耗（负向数值、消耗物品、remove），set 一律不保留。 */
function isCostEffect(effect) {
    if (!effect) return false;
    if (effect.field === 'items') {
        if (effect.type === 'remove') return true;
        if (effect.type !== 'add') return false;
        const count = typeof effect.value === 'number' ? effect.value : Number(effect.value?.count ?? Number.NaN);
        return Number.isFinite(count) && count < 0;
    }
    return effect.type === 'add' && typeof effect.value === 'number' && effect.value < 0;
}

const FAILURE_OUTCOME = '判定掷骰不利，此行动未达成预期结果。';

/**
 * 对整轮已解析的行动应用骰子裁定（只降不升），部分成功补保底代价，
 * 波折时掷一次变数 Oracle。原数组不动，返回新数组与汇总。
 * dice 选项不存在时不做任何事（旧路径与既有测试保持确定性）。
 * 逐行动再设一道闸：模型没报 difficulty 就是旧契约/自定义提示词输出，
 * 完全不掷骰——跟随新契约报了档位的行动才进入裁定。
 */
export function applySettleDice(actions, { rng, npcs = null, playerRealm = '', oracleChance } = {}) {
    const list = Array.isArray(actions) ? actions : [];
    if (!rng) return { actions: list, rolled: 0, overridden: 0, oracle: null, modifierNotes: [] };
    const modifierNotes = [];
    let rolled = 0;
    let overridden = 0;
    let wavered = false;
    const next = list.map(action => {
        if (!action || typeof action !== 'object') return action;
        if (action.difficulty === undefined) return action;
        if (action.category === 'none' || !SETTLE_DICE_STATUSES.includes(action.status)) return action;
        if (Array.isArray(action.parseErrors) && action.parseErrors.length) return action;
        const floor = combatRealmFloor(action, npcs, playerRealm);
        const declared = normalizeSettleDifficulty(action.difficulty);
        const difficultyRank = value => SETTLE_DIFFICULTIES.indexOf(value);
        const effective = floor && difficultyRank(floor) > difficultyRank(declared) ? floor : declared;
        const dice = adjudicateSettleAction({ difficulty: effective, modifiers: action.modifiers }, { rng });
        modifierNotes.push(...dice.modifierNotes.map(note => `${action.id || '行动'}：${note}`));
        rolled += 1;
        const claimed = action.status;
        const entry = { ...action, difficulty: declared, dice: { difficulty: dice.difficulty, modifier: dice.modifier, die: dice.die, dc: dice.dc, status: dice.status, claimedStatus: claimed } };
        if (STATUS_RANK[dice.status] >= STATUS_RANK[claimed]) { entry.dice.override = false; return entry; }
        overridden += 1;
        wavered = true;
        entry.dice.override = true;
        entry.status = dice.status;
        if (dice.status === 'failure') {
            entry.claimedOutcome = action.outcome;
            entry.outcome = FAILURE_OUTCOME;
            entry.consequences = [];
            entry.penalties = [];
            entry.effects = (Array.isArray(action.effects) ? action.effects : []).filter(isCostEffect);
            return entry;
        }
        // 降为部分成功：效果照旧进审核，只补一条可见代价。
        ensurePartialCost(entry);
        return entry;
    });
    const oracle = wavered ? rollSettleOracle({ rng, chance: oracleChance }) : null;
    return { actions: next, rolled, overridden, oracle, modifierNotes };
}
