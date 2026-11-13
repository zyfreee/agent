// 校验安装副本的模块图：从 index.js 出发，所有相对导入必须能在盘上解析。
// 用途：防止「仓库里 import 了新文件、但只拷了部分文件进酒馆目录」的 404 断链（实跑踩过一次）。
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[2] ?? path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const entry = path.join(root, 'index.js');
const seen = new Set();
const missing = [];

function walk(file) {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/from\s+'(\.[^']+)'/g)) {
        const target = path.resolve(path.dirname(file), match[1]);
        if (!existsSync(target)) {
            missing.push(`${match[1]}  (来自 ${path.relative(root, file)})`);
            continue;
        }
        if (target.endsWith('.js') && statSync(target).isFile()) walk(target);
    }
}

walk(entry);
console.log(`已扫描模块数: ${seen.size}`);
if (missing.length) {
    console.error(`缺失 ${missing.length} 个:\n${missing.join('\n')}`);
    process.exit(1);
}
console.log('所有相对导入均可解析 ✓');
