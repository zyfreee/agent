// 装备人形图：身体各部位就是装备槽，穿戴中的装备按类型挂到对应位置。
// 从 index.js 摘成纯模块：只依赖 host/dom.js 的 makeElement，测试可以直接喂数据比对输出。
import { makeElement } from './dom.js';

// —— 装备人形图：身体各部位就是装备槽，穿戴中的装备按类型挂到对应位置 ——

export const BODY_FIGURE_SLOTS = Object.freeze([
    { id: 'head', label: '头部', icon: '👑', match: type => /盔|冠|帽|簪|头巾|面巾|面纱/.test(type) },
    { id: 'accessory', label: '饰品', icon: '📿', match: type => /项链|坠|挂件|佩|饰品/.test(type) },
    { id: 'body', label: '身体', icon: '👘', match: type => /防具|甲|袍|衣|衫|裙|服/.test(type) },
    { id: 'hands', label: '手部', icon: '🧤', match: type => /手套|护腕|手环|臂环|戒指/.test(type) },
    { id: 'waist', label: '腰部', icon: '🎒', match: type => /腰带|腰囊|储物袋/.test(type) },
    { id: 'feet', label: '足部', icon: '👢', match: type => /靴|鞋|足具/.test(type) },
    { id: 'weapon', label: '武器', icon: '⚔️', match: type => /武器/.test(type) },
]);

export function bodyFigureSlotOf(item) {
    const type = String(item.type || item.category || '');
    return BODY_FIGURE_SLOTS.find(slot => slot.match(type));
}

/** 品级 → 槽位左缘配色：天阶金、地阶紫、玄阶蓝、黄阶翠、其余带“品”的走灰。 */
export function figureGradeClass(grade) {
    const text = String(grade ?? '');
    if (/天阶|天品|帝品|圣品/.test(text)) return 'is-gold';
    if (/地阶|地品|灵器|宝器/.test(text)) return 'is-violet';
    if (/玄阶|玄品/.test(text)) return 'is-azure';
    if (/黄阶|黄品/.test(text)) return 'is-jade';
    if (text.includes('品')) return 'is-dull';
    return '';
}

/** 装备 → 身形槽位图：不画人形，格子就按人身上的位置摆——头在上、身体居中（胸甲位）、
    饰品/武器在肩侧、手/腰在侧下、足在最底；穿戴中的装备名称直接写进对应部位的格子。 */
export function renderEquipmentFigure(equipped, { compact = false, onOpen, onEquip } = {}) {
    const bySlot = new Map();
    const loose = [];
    for (const item of Array.isArray(equipped) ? equipped : []) {
        if (!item || typeof item !== 'object') continue;
        const slot = bodyFigureSlotOf(item);
        if (!slot) { loose.push(item); continue; }
        if (!bySlot.has(slot.id)) bySlot.set(slot.id, []);
        bySlot.get(slot.id).push(item);
    }
    const wrap = makeElement('div', `dai-body-figure${compact ? ' dai-body-figure--compact' : ''}`);
    const grid = makeElement('div', 'dai-body-slots');
    const slotCell = (slot, col, row) => {
        const items = bySlot.get(slot.id) ?? [];
        const grade = items.length ? figureGradeClass(items[0].grade) : '';
        const cell = makeElement('div', `dai-body-slot${items.length ? '' : ' is-empty'}${grade ? ` ${grade}` : ''}`);
        cell.dataset.slot = slot.id;
        cell.style.gridColumn = String(col);
        cell.style.gridRow = String(row);
        cell.append(makeElement('small', 'dai-body-slot__label', `${slot.label}`));
        if (!items.length) {
            if (onEquip) {
                const add = makeElement('button', 'dai-body-slot__name dai-body-slot__add', '＋ 装备');
                add.type = 'button';
                add.title = `从行囊挑一件${slot.label}穿上`;
                add.addEventListener('click', () => onEquip(slot));
                cell.append(add);
            } else {
                cell.append(makeElement('span', 'dai-body-slot__name', '—'));
            }
            return cell;
        }
        const names = makeElement('span', 'dai-body-slot__items');
        items.forEach(item => {
            // 设置页可点开详情；悬浮球副窗纯展示。
            const name = makeElement(onOpen ? 'button' : 'b', 'dai-body-slot__name', item.name);
            if (onOpen) {
                name.type = 'button';
                name.title = [item.grade, item.type].filter(Boolean).join('·') || item.name;
                name.addEventListener('click', () => onOpen(item));
            }
            names.append(name);
        });
        cell.append(names);
        return cell;
    };
    const slotOf = id => BODY_FIGURE_SLOTS.find(s => s.id === id);
    // 头在上；饰品/身体/武器一排（身体居中＝穿在人身上）；手/腰一排；足在最下。
    grid.append(
        slotCell(slotOf('head'), 2, 1),
        slotCell(slotOf('accessory'), 1, 2),
        slotCell(slotOf('body'), 2, 2),
        slotCell(slotOf('weapon'), 3, 2),
        slotCell(slotOf('hands'), 1, 3),
        slotCell(slotOf('waist'), 2, 3),
        slotCell(slotOf('feet'), 2, 4),
    );
    wrap.append(grid);
    const foot = makeElement('div', 'dai-body-figure__foot');
    const labeled = equipped.filter(item => item && typeof item === 'object');
    foot.textContent = labeled.length
        ? `穿戴中 ${labeled.length} 件${loose.length ? `（另有 ${loose.length} 件类型未定位，列表里看）` : ''}`
        : '还没有穿戴任何装备。';
    wrap.append(foot);
    return wrap;
}
