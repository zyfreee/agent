// 极简静态服务器：给 dev/ 下的预览页用（后台跑着，截图脚本只连 CDP）。
// 用法：node dev/floor-dress/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const port = Number(process.argv[2] ?? 8124);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json; charset=utf-8' };

createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const file = path.join(repo, decodeURIComponent(url.pathname));
    if (!file.startsWith(repo)) { res.writeHead(403).end(); return; }
    try {
        const body = await readFile(file);
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
        res.end(body);
    } catch {
        res.writeHead(404).end('not found');
    }
}).listen(port, '127.0.0.1', () => console.log('serving', repo, 'on', port));
