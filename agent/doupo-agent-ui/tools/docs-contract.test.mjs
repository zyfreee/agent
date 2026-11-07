import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ALL_TABLE_DEFS, SELF_TABLE_DEFS, MEMORY_TABLE_DEFS, buildBridgeSheets } from '../host/db-tables.js';

// Read-only contract checks: never run the generator, import into a host, or touch saves.
const read = relative => readFile(new URL(relative, import.meta.url), 'utf8');
const checks = {
    async ownership() {
        const doc = await read('../README.md');
        assert.doesNotMatch(doc, /表\s*=\s*账本|以表为准|表优先收养/);
        for (const key of ['doupo_agent_world', 'doupo_agent_self', 'doupo_agent_memory', 'doupo_agent_npc', 'doupo_agent_npc_cold', 'doupo_agent_impact']) {
            assert.ok(doc.includes(key), `README must identify the chatMetadata ledger ${key}`);
        }
        assert.match(doc, /持久状态权威.*chatMetadata/);
        assert.match(doc, /受保护收养/);
        assert.match(doc, /dbBridgeAdopt\(\)/);
        assert.match(doc, /未映射字段/);
        assert.match(doc, /MVU.*申报.*仲裁/);
        assert.match(doc, /世界运转不连数据库/);
        assert.ok(doc.includes(`${ALL_TABLE_DEFS.length} 张`));
        assert.ok(doc.includes(`纳戒 ${SELF_TABLE_DEFS.length} 张`));
        assert.ok(doc.includes(`记忆 ${MEMORY_TABLE_DEFS.length} 张`));
    },
    async retired() {
        const doc = await read('../README.md');
        assert.doesNotMatch(doc, /self\.decideMerged` 开关开启后|合并决定开启时|返回 `delegated`|63\/63|128 个/);
        assert.match(doc, /self\.mvuChannel.*退役/);
        assert.doesNotMatch(doc, /默认 `self\.mvuChannel='inline'`/);
        assert.match(doc, /ui\.legacyTurn/);
        assert.match(doc, /unifiedActive\(\).*false/);
        assert.match(doc, /unifiedDecide\(\).*retired/);
        assert.match(doc, /cited.*不再.*消费/);
        assert.match(doc, /离线.*不代表.*真实酒馆/);
    },
    async packaging() {
        const manifest = JSON.parse(await read('../../../manifest.json'));
        const install = await read('../../../INSTALL.md');
        const rootDoc = await read('../../../README.md');
        assert.match(install, new RegExp('`' + manifest.js.replaceAll('.', '\\.') + '`（根转发入口'));
        assert.match(install, new RegExp('`' + manifest.css.replaceAll('.', '\\.') + '`（根样式'));
        for (const doc of [install, rootDoc]) {
            assert.match(doc, /agent\/doupo-agent-ui\/index\.js/);
            assert.match(doc, /agent\/doupo-agent-ui\/host\/style\.css/);
            assert.match(doc, /agent\/doupo-agent-ui\/settings\.html/);
            assert.match(doc, /extension-package\.test\.mjs/);
            assert.match(doc, /settings-template\.test\.mjs/);
        }
    },
    async generated() {
        const actual = JSON.parse(await read('../../斗破Agent数据库桥接表.json'));
        assert.deepEqual(actual, buildBridgeSheets(), 'Import JSON must exactly match the current table source');
        assert.equal(Object.keys(actual).filter(key => key.startsWith('sheet_')).length, ALL_TABLE_DEFS.length);
        for (const def of ALL_TABLE_DEFS) {
            const sheet = actual[def.key];
            assert.deepEqual(sheet.content, [def.headers]);
            assert.equal(sheet.sourceData.ddl, def.ddl);
            assert.equal(sheet.updateConfig.updateFrequency, 0);
            if (MEMORY_TABLE_DEFS.includes(def)) {
                assert.equal(sheet.exportConfig.enabled, false);
                assert.ok(!sheet.content[0].some(column => ['已了结', '了结日'].includes(column)));
            }
        }
        const generator = await read('./build-db-template.mjs');
        assert.doesNotMatch(generator, /纳戒 8 \+ 记忆 2 = 10/);
        assert.match(generator, /ALL_TABLE_DEFS/);
    },
};

const selected = process.argv[2];
assert.ok(!selected || Object.hasOwn(checks, selected), `Unknown docs contract: ${selected}`);
for (const [name, check] of Object.entries(checks)) {
    if (selected && name !== selected) continue;
    await check();
    console.log(`docs contract ${name}: passed (read-only)`);
}
