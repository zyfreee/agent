// 比对项目源与酒馆部署目录里扩展文件的 SHA256。
// 清单在 dev/ext-files.mjs，与 dev/deploy-ext.mjs 共用同一份，避免两边各记一张表、慢慢记岔。
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { EXT_FILES, EXT_ROOT } from './ext-files.mjs';

const root = process.cwd();

const hash = file => {
    try { return createHash('sha256').update(readFileSync(file)).digest('hex').toUpperCase(); }
    catch { return null; }
};

let bad = 0;
for (const [srcRel, dstRel] of EXT_FILES) {
    const src = path.join(root, srcRel);
    const dst = path.join(EXT_ROOT, dstRel);
    const a = hash(src);
    const b = hash(dst);
    let size = '';
    try { size = statSync(src).size; } catch { /* ignore */ }
    const same = a && b && a === b;
    if (!same) bad++;
    console.log((same ? 'SAME' : 'DIFF').padEnd(6), String(size).padStart(8), dstRel);
    if (!same) console.log(`         src ${a}\n         dst ${b}`);
}
console.log(bad === 0 ? '全部一致' : `${bad} 个文件不一致`);
