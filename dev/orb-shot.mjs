// 无头 Chrome 冒烟：打开 dev/orb-smoke.html，点球 → 点「世界运转」→ 点「全部」→ 截图。
// 用法：node dev/orb-shot.mjs [页面地址] [输出目录]
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const url = process.argv[2] ?? 'http://127.0.0.1:8123/dev/orb-smoke.html';
const outDir = path.resolve(process.argv[3] ?? 'dev/shots');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9333;

await mkdir(outDir, { recursive: true });
const proc = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=1440,900', '--hide-scrollbars', '--user-data-dir=' + path.join(outDir, '.profile'), 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
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
    if (result.result?.exceptionDetails) throw new Error(JSON.stringify(result.result.exceptionDetails));
    return result.result?.result?.value;
};
const shot = async name => {
    const result = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(outDir, `${name}.png`), Buffer.from(result.result.data, 'base64'));
    console.log('shot', name);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url });
await sleep(2500);

const state = await evaluate(`(() => ({
  ready: Boolean(document.getElementById('orb-ready')),
  orb: Boolean(document.querySelector('.dai-orb')),
  state: document.querySelector('.dai-orb')?.dataset.state,
}))()`);
console.log('load', state);

await evaluate(`document.querySelector('.dai-orb-ball').click()`);
await sleep(600);
await shot('01-expanded');

await evaluate(`document.querySelector('.dai-orb-icon[data-orb-item="world"]').click()`);
await sleep(600);
await shot('02-world-panel');

const groups = await evaluate(`[...document.querySelectorAll('.dai-orb-group')].map(group => ({
  title: group.querySelector('.dai-orb-group-title')?.textContent,
  shown: group.querySelectorAll('.dai-orb-entry').length,
  all: group.querySelector('.dai-orb-group-all')?.textContent ?? null,
}))`);
console.log('groups', JSON.stringify(groups));

await evaluate(`document.querySelector('.dai-orb-group-all').click()`);
await sleep(700);
await shot('03-all-popup');

const popup = await evaluate(`(() => {
  const pop = document.querySelector('.dai-orb-pop-list');
  if (!pop) return null;
  const body = pop.querySelector('.dai-orb-pop-list-body');
  return { head: pop.querySelector('.dai-orb-pop-name')?.textContent, rows: body.querySelectorAll('.dai-orb-entry').length, scrollable: body.scrollHeight > body.clientHeight, overflowY: getComputedStyle(body).overflowY };
})()`);
console.log('popup', JSON.stringify(popup));

// 副窗里点一条，看详情小卡会不会贴着副窗弹出来。
await evaluate(`document.querySelector('.dai-orb-pop-list .dai-orb-entry.is-clickable')?.click()`);
await sleep(600);
await shot('04-detail-from-all');

// 人物簿：同样点「全部」
await evaluate(`document.querySelector('.dai-orb-icon[data-orb-item="npcledger"]').click()`);
await sleep(600);
await shot('05-npc-panel');
await evaluate(`document.querySelector('.dai-orb-group-all')?.click()`);
await sleep(600);
await shot('06-npc-all');

// 长清单：灌 30 个人，副窗应该自己在里面滑，不撑破屏幕。
await evaluate(`(async () => {
  const mod = await import('/agent/doupo-agent-ui/index.js');
  mod.doupoAgent.npcLedger.load({ records: Array.from({ length: 30 }, (_, i) => ({ name: '路人' + i, favor: i - 10, presence: i % 2 ? '在场' : '不在场', importance: i % 5 === 0 ? '重要' : '不重要', identity: '第 ' + i + ' 号路人' })) });
})()`);
await sleep(500);
// 上一步已经开着人物簿窗，再点同一个图标只会关窗：先收起长条，重新展开后再开窗。
await evaluate(`document.querySelector('.dai-orb[data-state="expanded"] .dai-orb-ball')?.click()`);
await sleep(400);
await evaluate(`document.querySelector('.dai-orb-ball').click()`);
await sleep(400);
await evaluate(`document.querySelector('.dai-orb-icon[data-orb-item="npcledger"]')?.click()`);
await sleep(500);
await evaluate(`document.querySelector('.dai-orb-group-all')?.click()`);
await sleep(700);
await shot('07-long-list');
const longList = await evaluate(`(() => {
  const pop = document.querySelector('.dai-orb-pop-list');
  const body = pop.querySelector('.dai-orb-pop-list-body');
  const rect = pop.getBoundingClientRect();
  return { rows: body.querySelectorAll('.dai-orb-entry').length, scrollable: body.scrollHeight > body.clientHeight, height: Math.round(rect.height), viewport: innerHeight, bottomInside: Math.round(rect.bottom) <= innerHeight };
})()`);
console.log('long list', JSON.stringify(longList));

// Esc 逐层退：先副窗，再长条。
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
await sleep(400);
const afterEsc = await evaluate(`({ popup: Boolean(document.querySelector('.dai-orb-pop-list')), state: document.querySelector('.dai-orb')?.dataset.state })`);
console.log('after esc 1', JSON.stringify(afterEsc));
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
await sleep(400);
const afterEsc2 = await evaluate(`({ popup: Boolean(document.querySelector('.dai-orb-pop-list')), state: document.querySelector('.dai-orb')?.dataset.state })`);
console.log('after esc 2', JSON.stringify(afterEsc2));

ws.close();
proc.kill();
