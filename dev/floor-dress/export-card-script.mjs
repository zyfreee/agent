// 从角色卡 PNG 里导出酒馆助手脚本到项目目录，方便用编辑器看、改、比对。
// 用法：node dev/floor-dress/export-card-script.mjs [脚本名] [输出文件]
//       node dev/floor-dress/export-card-script.mjs "斗破 · 楼层美化" dev/floor-dress/card-floor-dress-current.js
import { readFileSync, writeFileSync } from 'node:fs';

const CARD = 'E:/SillyTavern-Launcher/SillyTavern/data/default-user/characters/斗破苍穹1.png';
const SCRIPT_NAME = process.argv[2] || '斗破 · 楼层美化';
const OUT = process.argv[3] || 'C:/Users/86158/Desktop/异界转生录/doupo/dev/floor-dress/card-floor-dress-current.js';

function walkChunks(buffer) {
    const chunks = [];
    let off = 8;
    while (off < buffer.length) {
        const len = buffer.readUInt32BE(off);
        const type = buffer.toString('latin1', off + 4, off + 8);
        const dataStart = off + 8;
        chunks.push({ type, data: buffer.subarray(dataStart, dataStart + len) });
        off = dataStart + len + 4;
    }
    return chunks;
}

const chunks = walkChunks(readFileSync(CARD));
let found = null;
for (const chunk of chunks) {
    if (chunk.type !== 'tEXt') continue;
    const nul = chunk.data.indexOf(0);
    const keyword = chunk.data.toString('latin1', 0, nul);
    if (keyword !== 'chara' && keyword !== 'ccv3') continue;
    const raw = chunk.data.subarray(nul + 1).toString('latin1');
    // 卡里两种写法都见过：base64 的 JSON，或直接裸 JSON。
    let json = null;
    try { json = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); } catch { /* 下一步试裸 JSON */ }
    if (!json) { try { json = JSON.parse(raw); } catch { continue; } }
    const data = json.data ?? json;
    const scripts = data?.extensions?.tavern_helper?.scripts;
    if (!Array.isArray(scripts)) continue;
    const target = scripts.find(script => String(script?.name ?? '').trim() === SCRIPT_NAME);
    if (target) found = { keyword, content: String(target.content || '') };
    console.log(`${keyword} | 脚本 ${scripts.length} 条 | 命中 ${target ? '是' : '否'}`);
    if (found) break;
}

if (!found) {
    console.error(`卡里没找到脚本「${SCRIPT_NAME}」`);
    process.exit(1);
}
writeFileSync(OUT, found.content, 'utf8');
const version = (found.content.match(/__DPD_VERSION__ = '([^']+)'/) || [])[1] ?? '?';
console.log(`已导出 ${found.content.length} 字符（${version}）→ ${OUT}`);
