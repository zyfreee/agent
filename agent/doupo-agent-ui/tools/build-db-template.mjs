/**
 * 生成「龙血玄黄·数据库」桥接表模板 JSON（纳戒 8 + 世界 3 + 记忆 2 = 13 张）。
 *
 * 表定义的唯一来源是 host/db-tables.js——改表先改那里，再跑本脚本重新生成：
 *   node tools/build-db-template.mjs
 * 输出 ../斗破Agent数据库桥接表.json，并按数据库脚本 parseImportedTemplateData_ACU
 * 的导入解析规则做结构自检（mate / sheet_ 键 / name+content+sourceData / DDL 注释列），
 * 自检不过直接失败退出，绝不写出坏模板。
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ALL_TABLE_DEFS, buildBridgeSheets } from '../host/db-tables.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const template = buildBridgeSheets();

// ── 结构自检：对齐「龙血玄黄·数据库」导入解析的硬性要求 ──
const problems = [];
if (template.mate?.type !== 'chatSheets') problems.push('mate.type 必须是 chatSheets');
const keys = Object.keys(template).filter(key => key.startsWith('sheet_'));
if (keys.length !== ALL_TABLE_DEFS.length) problems.push(`表数量不符：${keys.length} ≠ ${ALL_TABLE_DEFS.length}`);
for (const def of ALL_TABLE_DEFS) {
    const sheet = template[def.key];
    if (!sheet?.name || !Array.isArray(sheet.content) || !sheet.sourceData) {
        problems.push(`${def.key} 缺 name/content/sourceData`);
        continue;
    }
    if (sheet.uid !== def.key) problems.push(`${def.name} uid 与键不一致`);
    if (sheet.content[0]?.join('|') !== def.headers.join('|')) problems.push(`${def.name} 表头行与定义不符`);
    for (const [index, row] of sheet.content.entries()) {
        if (!Array.isArray(row) || row.length !== def.headers.length) problems.push(`${def.name} 第 ${index} 行列数 ${row?.length} ≠ 表头 ${def.headers.length}`);
    }
    // DDL 注释列数与表头一一对应（首列 row_id 注释为 行号）
    const ddlColumns = def.ddl.split('\n')
        .filter(line => !line.trim().startsWith('CREATE') && !line.trim().startsWith(')'))
        .map(line => line.match(/^\s*(\w+)\s+\w+[^,]*,?\s*--\s*(.+)$/))
        .filter(Boolean)
        .map(match => match[2].trim());
    if (ddlColumns.length !== def.headers.length || ddlColumns[0] !== '行号') problems.push(`${def.name} DDL 注释列与表头不对应`);
    for (const node of ['initNode', 'insertNode', 'updateNode', 'deleteNode']) {
        if (sheet.sourceData[node] !== '禁止操作。') problems.push(`${def.name} 的 ${node} 必须是「禁止操作。」`);
    }
    // 更新参数：退出数据库自身 AI 自动更新调度（updateFrequency=0 + 新语义标记）
    if (template.mate?.updateConfigUiSentinel !== -1) problems.push('mate.updateConfigUiSentinel 必须是 -1');
    const uc = sheet.updateConfig;
    if (uc?.updateFrequency !== 0 || uc?.uiSentinel !== -1) {
        problems.push(`${def.name} 的 updateConfig 必须 uiSentinel=-1 且 updateFrequency=0（退出自动更新）`);
    }
}
if (new Set(ALL_TABLE_DEFS.map(def => def.englishName)).size !== ALL_TABLE_DEFS.length) problems.push('英文表名重复');
if (new Set(ALL_TABLE_DEFS.map(def => def.name)).size !== ALL_TABLE_DEFS.length) problems.push('中文表名重复');

if (problems.length) {
    console.error('模板自检未通过：\n' + problems.map(item => `- ${item}`).join('\n'));
    process.exit(1);
}

const outFile = path.resolve(here, '..', '..', '斗破Agent数据库桥接表.json');
writeFileSync(outFile, JSON.stringify(template, null, 2) + '\n', 'utf8');
console.log(`已生成 ${outFile}`);
console.log(`共 ${keys.length} 张表：${ALL_TABLE_DEFS.map(def => def.name).join('、')}`);
