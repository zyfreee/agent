import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// 归一化行尾：Windows 检出（autocrlf）会把源码变 CRLF，源码文本断言按 LF 写，先统一。
const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const start = 'const BODY_FIGURE_SLOTS = Object.freeze([';
const end = '/** 空槽位 →';
for (const marker of [start, end]) assert.equal(source.split(marker).length, 2, `unique extraction boundary: ${marker}`);
const figureSource = source.slice(source.indexOf(start), source.indexOf(end));
assert.ok(figureSource.trimEnd().endsWith('return wrap;\n}'));
for (const name of ['figureGradeClass', 'renderEquipmentFigure']) assert.equal(figureSource.split(`function ${name}(`).length, 2);
const elementSource = source.match(/^function makeElement\(tag, className, value\) \{[\s\S]*?^\}/gm);
assert.equal(elementSource?.length, 1, 'extract the actual makeElement exactly once');
const document = { createElement: tag => ({
    tag, className: '', textContent: '', dataset: {}, style: {}, children: [], events: {},
    append(...nodes) { this.children.push(...nodes); },
    addEventListener(name, callback) { this.events[name] = callback; },
    click() { this.events.click?.(); },
}) };
const render = runInNewContext(`${elementSource[0]}\n${figureSource}\nrenderEquipmentFigure`, { document });
const walk = node => [node, ...node.children.flatMap(walk)];
const text = node => node.textContent + node.children.map(text).join('');
const single = { name: '练习剑', type: '武器', grade: '玄阶', category: '防具' };
const multiple = ['头盔', '饰品', '防具', '手套', '腰带', '靴', '武器', '武器'].map((type, i) => ({ name: `装备${i}`, type }));
const unknown = { name: '武器头盔', type: '未分类', category: '武器' };
const legacy = [{ name: '旧剑', category: '武器', equipped: true }, { name: '旧甲', type: '', category: '防具', equipped: true }];
const cases = [
    [[], {}], [[single], { weapon: [single] }],
    [multiple, { head: [multiple[0]], accessory: [multiple[1]], body: [multiple[2]], hands: [multiple[3]], waist: [multiple[4]], feet: [multiple[5]], weapon: multiple.slice(6) }],
    [[unknown], {}], [legacy, { weapon: [legacy[0]], body: [legacy[1]] }],
];
for (const compact of [false, true]) for (const [items, expected] of cases) {
    const opened = [], equipped = [];
    const figure = render(items, { compact, onOpen: item => opened.push(item), onEquip: slot => equipped.push(slot) });
    assert.equal(figure.className, `dai-body-figure${compact ? ' dai-body-figure--compact' : ''}`);
    const cells = figure.children[0].children;
    assert.equal(cells.length, 7);
    assert.deepEqual(cells.map(cell => [cell.dataset.slot, cell.style.gridColumn, cell.style.gridRow]), [
        ['head', '2', '1'], ['accessory', '1', '2'], ['body', '2', '2'], ['weapon', '3', '2'], ['hands', '1', '3'], ['waist', '2', '3'], ['feet', '2', '4'],
    ]);
    for (const cell of cells) {
        const entries = expected[cell.dataset.slot] ?? [];
        assert.equal(cell.className.includes('is-empty'), !entries.length);
        const buttons = walk(cell).filter(node => node.tag === 'button');
        assert.deepEqual(buttons.map(node => node.textContent), entries.length ? entries.map(item => item.name) : ['＋ 装备']);
        for (const button of buttons) {
            button.click();
            if (entries.length) assert.equal(opened.at(-1), entries[buttons.indexOf(button)]);
            else assert.equal(equipped.at(-1).id, cell.dataset.slot);
        }
        if (entries[0] === single) assert.ok(cell.className.includes('is-azure'));
    }
    assert.equal(opened.length, Object.values(expected).flat().length);
    assert.equal(equipped.length, 7 - Object.keys(expected).length);
    assert.equal(figure.children[1].textContent, !items.length ? '还没有穿戴任何装备。' : `穿戴中 ${items.length} 件${items.includes(unknown) ? '（另有 1 件类型未定位，列表里看）' : ''}`);
    const display = render(items, { compact });
    assert.equal(walk(display).filter(node => node.tag === 'button').length, 0);
    for (const item of Object.values(expected).flat()) assert.ok(walk(display).some(node => node.tag === 'b' && node.textContent === item.name));
    if (items.includes(unknown)) assert.ok(!text(display.children[0]).includes(unknown.name));
}
console.log('equipment figure behavioral tests passed (normal/compact, empty/single/multiple/unknown/legacy, callbacks)');
