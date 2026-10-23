import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));

for (const relativePath of [manifest.js, manifest.css, 'settings.html']) {
    const file = path.join(root, relativePath);
    const info = await stat(file);
    assert.equal(info.isFile(), true, `清单或标准模板文件不存在：${relativePath}`);
}

const entry = await readFile(path.join(root, manifest.js), 'utf8');
for (const hook of ['onActivate', 'onInstall', 'onUpdate', 'onDelete', 'onEnable', 'onDisable', 'onClean']) {
    assert.match(entry, new RegExp(`\\b${hook}\\b`), `根入口缺少生命周期导出：${hook}`);
}

const rootStyle = await readFile(path.join(root, manifest.css), 'utf8');
const nestedStyle = await readFile(path.join(root, 'agent/doupo-agent-ui/host/style.css'), 'utf8');
assert.equal(rootStyle, nestedStyle, '清单样式与模块备用样式必须保持一致');
console.log('extension package layout checks passed');
