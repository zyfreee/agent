// 观世牌折叠行为复核：点分区标题能否收起、收起状态会不会被 5 秒轮询刷回来。
// 前置：node dev/floor-dress/serve.mjs 8124
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const outDir = path.join(repo, 'dev', 'shots');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9335;
const previewUrl = 'http://127.0.0.1:8124/dev/floor-dress/world-card-preview.html';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

await mkdir(outDir, { recursive: true });
const proc = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=1100,1400', '--hide-scrollbars', '--user-data-dir=' + path.join(outDir, '.profile-fold'), 'about:blank',
], { stdio: 'ignore' });

let targets;
for (let i = 0; i < 60; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets?.length) break; } catch { /* 还没起来 */ }
    await sleep(250);
}
if (!targets?.length) throw new Error('CDP 没起来');
const page = targets.find(target => target.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
});
const send = (method, params = {}) => new Promise(resolve => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.result?.exceptionDetails) throw new Error(result.result.exceptionDetails.exception?.description ?? 'eval failed');
    return result.result?.result?.value;
};
const shot = async name => {
    const result = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(outDir, `${name}.png`), Buffer.from(result.result.data, 'base64'));
    console.log('shot', name);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: previewUrl });
await sleep(3000);

const stateOf = () => evaluate(`(() => {
  const card = document.querySelector('#chat .dpd-world-card');
  return { selected: card.querySelector('.dpd-world-tab[aria-selected="true"]')?.dataset.wtab ?? null,
           visible: [...card.querySelectorAll('.dpd-wsec-view')].filter(v => !v.hidden).map(v => v.dataset.wview).join(','),
           h: Math.round(card.getBoundingClientRect().height) };
})()`);
console.log('初始', JSON.stringify(await stateOf()));

// 点「势力」签（真实点击，走签页切换）
await evaluate(`document.querySelector('#chat .dpd-world-tab[data-wtab="factions"]').click()`);
await sleep(400);
console.log('点势力后', JSON.stringify(await stateOf()));
console.log('localStorage', await evaluate(`localStorage.getItem('doupo-dress-world-tab')`));
await shot('world-card-04-tab-factions');

// 等 6 秒（跨过一次 5 秒轮询），看选中的签会不会被重绘刷回任务
await sleep(6500);
console.log('轮询 6 秒后', JSON.stringify(await stateOf()));
await shot('world-card-05-after-poll');

// 刷新页面，看选中的签是否记住
await send('Page.reload');
await sleep(3000);
console.log('刷新后', JSON.stringify(await stateOf()));

ws.close();
proc.kill();
