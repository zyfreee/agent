/**
 * 变数 Oracle：结算出现波折（部分成功/失败）时低概率翻出一条突发，
 * 参照 Mythic GM Emulator 的 random-event 思路——"出岔子时世界也在动"。
 *
 * 职责边界：只给建议文本（title/detail/weight），不直接写世界台账；
 * weight 复用世界 addEvent 的 minor|major|rumor 词表，调用方想接可直通。
 * 掷骰用注入的 rng（生产默认 crypto），保证可测可复现。
 */

const EVENT_LIST = [
    { title: '耳目窥探', detail: '有人暗中留意了你这一轮的举动', weight: 'minor' },
    { title: '仇家耳目', detail: '人群里有张熟悉又不怀好意的面孔', weight: 'minor' },
    { title: '执法巡查', detail: '执法队例行巡查经过，气氛紧了几分', weight: 'minor' },
    { title: '市井骚动', detail: '不远处起了骚动，人流涌动', weight: 'minor' },
    { title: '物件受损', detail: '随身物件在这一轮折腾里出了毛病', weight: 'minor' },
    { title: '走漏风声', detail: '这件事的风声可能已经传了出去', weight: 'rumor' },
    { title: '贵人路过', detail: '一位气度不凡的人物恰好路过此地', weight: 'minor' },
    { title: '兽吼逼近', detail: '远处传来魔兽的吼声，人心浮动', weight: 'minor' },
];

export const SETTLE_ORACLE_TABLE = Object.freeze(EVENT_LIST.map(entry => Object.freeze({ ...entry })));
export const SETTLE_ORACLE_DEFAULT_CHANCE = 0.25;

const text = value => typeof value === 'string' ? value.trim() : '';

/** 出波折后的单次变数判定：没掷中返回 null。chance ∈ [0,1]，越界回落默认。 */
export function rollSettleOracle({ rng, chance = SETTLE_ORACLE_DEFAULT_CHANCE } = {}) {
    const roll = typeof rng === 'function' ? rng() : Math.random();
    const probability = Number.isFinite(chance) ? Math.min(1, Math.max(0, chance)) : SETTLE_ORACLE_DEFAULT_CHANCE;
    if (roll >= probability) return null;
    const pick = Math.min(EVENT_LIST.length - 1, Math.floor(roll / probability * EVENT_LIST.length));
    const entry = EVENT_LIST[Math.max(0, pick)];
    return { title: text(entry.title), detail: text(entry.detail), weight: entry.weight };
}
