// 把 dev/floor-dress/doupo-floor-dress.js 写进角色卡的 chara + ccv3 两份 tEXt 块。
// 用法：node dev/floor-dress/embed-into-card.mjs --dry     （只看，不改）
//       node dev/floor-dress/embed-into-card.mjs --apply   （先备份再写回）
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { crc32 } from 'node:zlib';

const CARD = 'E:/SillyTavern-Launcher/SillyTavern/data/default-user/characters/斗破苍穹1.png';
const SCRIPT = 'C:/Users/86158/Desktop/异界转生录/doupo/dev/floor-dress/doupo-floor-dress.js';
// 备份名带完整时间戳：早先只截到分钟，同一分钟内连写两次会撞名、被「已存在就跳过」吞掉。
const BACKUP = `E:/SillyTavern-Launcher/backup-doupo-card-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 17)}.png`;
const SCRIPT_NAME = '斗破 · 楼层美化';
const APPLY = process.argv.includes('--apply');

const buf = readFileSync(CARD);
const next = readFileSync(SCRIPT, 'utf8');
const nextVersion = (next.match(/__DPD_VERSION__ = '(v[\d.]+)'/) || [])[1];
if (!nextVersion) {
    console.error('源文件里找不到 __DPD_VERSION__，停手');
    process.exit(1);
}

// ---- PNG 块遍历 ----
function walkChunks(buffer) {
    const chunks = [];
    let off = 8;
    while (off < buffer.length) {
        const len = buffer.readUInt32BE(off);
        const type = buffer.toString('latin1', off + 4, off + 8);
        const dataStart = off + 8;
        chunks.push({ type, data: buffer.subarray(dataStart, dataStart + len), off, len });
        off = dataStart + len + 4;
    }
    return chunks;
}

function buildTextChunk(keyword, payload) {
    const keyBuf = Buffer.from(keyword, 'latin1');
    const body = Buffer.concat([keyBuf, Buffer.from([0]), payload]);
    const out = Buffer.alloc(8 + body.length + 4);
    out.writeUInt32BE(body.length, 0);
    out.write('tEXt', 4, 'latin1');
    body.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
}

const chunks = walkChunks(buf);
const cardChunks = [];
for (const chunk of chunks) {
    if (chunk.type !== 'tEXt') continue;
    const nul = chunk.data.indexOf(0);
    const keyword = chunk.data.toString('latin1', 0, nul);
    if (keyword !== 'chara' && keyword !== 'ccv3') continue;
    const json = JSON.parse(Buffer.from(chunk.data.subarray(nul + 1).toString('latin1'), 'base64').toString('utf8'));
    cardChunks.push({ keyword, chunk, json });
}
if (!cardChunks.length) { console.error('没找到 chara / ccv3'); process.exit(1); }

for (const item of cardChunks) {
    const data = item.json.data ?? item.json;
    const scripts = data?.extensions?.tavern_helper?.scripts;
    const target = Array.isArray(scripts) ? scripts.find(script => String(script?.name ?? '').trim() === SCRIPT_NAME) : null;
    console.log(item.keyword, '| scripts', scripts?.length ?? 0, '| 目标脚本', target ? `${(target.content || '').length} 字符` : '缺失');
    if (!target) { console.error('缺目标脚本，停手'); process.exit(1); }
    const before = target.content || '';
    console.log('   改前版本', (before.match(/__DPD_VERSION__ = '([^']+)'/) || [])[1] ?? '?', '| 改后版本', (next.match(/__DPD_VERSION__ = '([^']+)'/) || [])[1]);
    target.content = next;
}

if (!APPLY) {
    console.log('dry run：不改文件。加 --apply 才会写回。');
    process.exit(0);
}

if (existsSync(BACKUP)) {
    console.log('备份已存在，跳过复制', BACKUP);
} else {
    copyFileSync(CARD, BACKUP);
    console.log('备份 →', BACKUP);
}

// 重建 PNG：替换掉两块 tEXt，其余原样
const outParts = [buf.subarray(0, 8)];
const replaced = new Set();
for (const chunk of chunks) {
    if (chunk.type === 'tEXt') {
        const nul = chunk.data.indexOf(0);
        const keyword = chunk.data.toString('latin1', 0, nul);
        const hit = cardChunks.find(item => item.keyword === keyword);
        if (hit && !replaced.has(keyword)) {
            const payload = Buffer.from(JSON.stringify(hit.json), 'utf8').toString('base64');
            outParts.push(buildTextChunk(keyword, Buffer.from(payload, 'latin1')));
            replaced.add(keyword);
            continue;
        }
        if (hit) continue; // 同一 keyword 出现两次时只留一份
    }
    outParts.push(buf.subarray(chunk.off, chunk.off + 12 + chunk.len));
}
const outBuf = Buffer.concat(outParts);
writeFileSync(CARD, outBuf);
console.log('已写回', CARD, '| 新大小', outBuf.length, '（原', buf.length, '）');
