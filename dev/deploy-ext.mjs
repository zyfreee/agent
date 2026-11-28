// 把项目源里的扩展文件复制到酒馆部署目录，复制完立刻用 SHA256 校验。
// 只复制清单里列出来的文件：漏一个就会出现“改了没反应”的假象（这一条踩过）。
// 清单在 dev/ext-files.mjs，与 dev/compare-deploy.mjs 共用同一份。
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { EXT_FILES, EXT_ROOT } from './ext-files.mjs';

const root = process.cwd();

const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex').toUpperCase();

let bad = 0;
for (const [srcRel, dstRel] of EXT_FILES) {
    const src = path.join(root, srcRel);
    const dst = path.join(EXT_ROOT, dstRel);
    mkdirSync(path.dirname(dst), { recursive: true });
    copyFileSync(src, dst);
    const same = hash(src) === hash(dst);
    if (!same) bad++;
    console.log((same ? 'OK  ' : 'BAD ') + dstRel);
}
console.log(bad === 0 ? '部署完成，全部一致' : `${bad} 个文件校验失败`);
