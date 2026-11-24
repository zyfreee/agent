// 观世牌预览截图：无头 Chrome 打开已由 serve.mjs 托管的预览页，截图并核对 DOM�?// 前置：另开一个终端跑 node dev/floor-dress/serve.mjs 8124
// 用法：node dev/floor-dress/world-card-shot.mjs
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const outDir = path.join(repo, 'dev', 'shots');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9334;
const previewUrl = 'http://127.0.0.1:8124/dev/floor-dress/world-card-preview.html';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

await mkdir(outDir, { recursive: true });
const proc = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=1100,1400', '--hide-scrollbars', '--user-data-dir=' + path.join(outDir, '.profile-wc'), 'about:blank',
], { stdio: 'ignore' });

let targets;
for (let i = 0; i < 40; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.length) break; } catch { /* 还没起来 */ }
    await sleep(250);
}
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
    if (result.result?.exceptionDetails) throw new Error(JSON.stringify(result.result.exceptionDetails.exception?.description ?? result.result.exceptionDetails));
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

console.log('version', await evaluate(`globalThis.__DPD_VERSION__ ?? null`));
console.log('errors', JSON.stringify(await evaluate(`globalThis.__DPD_ERRORS__ ?? []`)));


const audit = await evaluate(`(() => {
  const card = document.querySelector('#chat .dpd-world-card');
  if (!card) return { card: false };
  const now = [...card.querySelectorAll('.dpd-now-item')].map(item => ({ label: item.querySelector('small')?.textContent, value: item.querySelector('b')?.textContent }));
  const tabs = [...card.querySelectorAll('.dpd-world-tab')].map(tab => ({
    key: tab.dataset.wtab,
    label: tab.firstChild?.textContent ?? '',
    badge: tab.querySelector('small')?.textContent ?? '',
    selected: tab.getAttribute('aria-selected') === 'true',
  }));
  const views = [...card.querySelectorAll('.dpd-wsec-view')].map(view => ({
    key: view.dataset.wview,
    hidden: view.hidden,
    rows: [...view.querySelectorAll('.dpd-wrow')].map(row => ({
      title: row.querySelector('b')?.textContent,
      badges: [...row.querySelectorAll('.dpd-badge')].map(b => b.textContent),
      sub: row.querySelector('.dpd-wrow-sub')?.textContent ?? '',
    })),
    more: view.querySelector('.dpd-wsec-more')?.textContent ?? '',
  }));
  return { card: true, folded: card.classList.contains('is-folded'), now, tabs, views, fullBtn: !!card.querySelector('.dpd-full-btn-float'), rect: Math.round(card.getBoundingClientRect().height) };
})()`);
console.log('audit', JSON.stringify(audit, null, 1));

await shot('world-card-01-default');

// 逐个签点过去截一张，确认四个签都能换页
for (const key of ['events', 'factions', 'people']) {
  await evaluate(`document.querySelector('#chat .dpd-world-tab[data-wtab="${key}"]').click()`);
  await sleep(400);
  await shot('world-card-02-tab-' + key);
  console.log('tab ' + key, await evaluate(`(() => {
    const card = document.querySelector('#chat .dpd-world-card');
    return { selected: card.querySelector('.dpd-world-tab[aria-selected="true"]')?.dataset.wtab ?? null,
             visible: [...card.querySelectorAll('.dpd-wsec-view')].filter(v => !v.hidden).map(v => v.dataset.wview).join(','),
             rect: Math.round(card.getBoundingClientRect().height) };
  })()`));
}
console.log('stored', await evaluate(`localStorage.getItem('doupo-dress-world-tab')`));

ws.close();
proc.kill();
