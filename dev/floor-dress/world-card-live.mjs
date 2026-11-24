// 真实酒馆里复核观世牌：开 127.0.0.1:8000，进斗破卡聊天，看 __DPD_VERSION__ 与牌面 DOM。
// 前置：酒馆已在跑（端口 8000）。
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const outDir = path.join(repo, 'dev', 'shots');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9336;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

await mkdir(outDir, { recursive: true });
const proc = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=1280,1500', '--hide-scrollbars', '--user-data-dir=' + path.join(outDir, '.profile-st'), 'about:blank',
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
const consoleLog = [];
ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); return; }
    if (message.method === 'Runtime.consoleAPICalled') {
        const text = (message.params.args || []).map(arg => arg.value ?? arg.description ?? '').join(' ');
        if (text.includes('斗破美化') || text.includes('斗破')) consoleLog.push(text);
    }
    if (message.method === 'Runtime.exceptionThrown') {
        consoleLog.push('EXCEPTION ' + (message.params.exceptionDetails?.exception?.description ?? '').slice(0, 200));
    }
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
await send('Page.navigate', { url: 'http://127.0.0.1:8000/' });
await sleep(6000);

console.log('title', await evaluate(`document.title`));
console.log('已开聊天', await evaluate(`(async () => {
  try { const ctx = SillyTavern.getContext(); return { char: ctx.characters?.[ctx.characterId]?.name ?? null, chatId: ctx.chatId ?? null, chatLen: ctx.chat?.length ?? 0 }; } catch (error) { return String(error); }
})()`));

// 如果还没进聊天，从「最近的聊天」里点进斗破那份
const opened = await evaluate(`(async () => {
  const ctx = SillyTavern.getContext();
  if (ctx.chat?.length > 2) return 'already';
  const recent = [...document.querySelectorAll('.chat_past')];
  if (!recent.length) return 'no-recent';
  const target = recent.find(item => (item.textContent || '').includes('斗破')) ?? recent[0];
  target.click();
  return 'clicked ' + (target.textContent || '').trim().slice(0, 30);
})()`);
console.log('进聊天', opened);
await sleep(12000);

console.log('after', await evaluate(`(async () => {
  const ctx = SillyTavern.getContext();
  return { char: ctx.characters?.[ctx.characterId]?.name ?? null, chatId: ctx.chatId ?? null, chatLen: ctx.chat?.length ?? 0, dpd: globalThis.__DPD_VERSION__ ?? null, errs: globalThis.__DPD_ERRORS__ ?? [] };
})()`));

const audit = await evaluate(`(() => {
  const cards = [...document.querySelectorAll('#chat .dpd-world-card')];
  const card = cards[cards.length - 1] ?? null;
  if (!card) return { cards: 0 };
  return {
    cards: cards.length,
    now: [...card.querySelectorAll('.dpd-now-item')].map(item => (item.querySelector('small')?.textContent ?? '') + '=' + (item.querySelector('b')?.textContent ?? '')),
    tabs: [...card.querySelectorAll('.dpd-world-tab')].map(tab => tab.dataset.wtab + (tab.getAttribute('aria-selected') === 'true' ? '*' : '') + ':' + (tab.querySelector('small')?.textContent ?? '')), views: [...card.querySelectorAll('.dpd-wsec-view')].map(v => v.dataset.wview + ':' + (v.hidden ? 'hidden' : 'shown') + ':' + v.querySelectorAll('.dpd-wrow').length),
    height: Math.round(card.getBoundingClientRect().height),
    fullBtn: !!card.querySelector('.dpd-full-btn-float'),
  };
})()`);
console.log('audit', JSON.stringify(audit));
console.log('console', JSON.stringify(consoleLog.slice(0, 12)));
await shot('world-card-live');

ws.close();
proc.kill();
