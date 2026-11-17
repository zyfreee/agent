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

// 版本适配面：清单门与运行时门要同一口径，旧版宿主的自启/版本门兜底必须在入口里。
assert.equal(manifest.minimum_client_version, '1.14.0', '适配下限：manifest 与 host/st-version.js、README 三处同口径');
const versionModule = await readFile(path.join(root, 'agent/doupo-agent-ui/host/st-version.js'), 'utf8');
assert.match(versionModule, /MIN_ST_VERSION = '1\.14\.0'/, '运行时版本门与清单下限不一致');
assert.match(versionModule, /isTauriTavern/, 'TauriTavern 是受支持平台，版本门要有平台检测兜底');
const nestedEntry = await readFile(path.join(root, 'agent/doupo-agent-ui/index.js'), 'utf8');
assert.match(nestedEntry, /function bootOnce/, '1.14–1.16 的加载器不接 hooks 字段，实现入口必须有自启兜底');
assert.match(nestedEntry, /enforceStVersionGate/, '旧宿主不查清单版本门，实现入口必须有运行时版本自查');
assert.match(nestedEntry, /isTauriTavern\(\)/, '版本门要放行 TauriTavern 平台');

console.log('extension package layout checks passed');
