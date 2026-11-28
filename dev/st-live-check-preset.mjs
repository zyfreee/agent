// 真酒馆：只读核对「方案通道开关已删」在页面里是否真的生效。
//   node dev/st-live-check-preset.mjs
// 打开角色 → 打开设置面板 → 进「API设置」页 → 抓方案卡的 DOM 文本 + 是否存在 tavern 复选框。
import { spawn } from 'node:child_process';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { statSync } from 'node:fs';

const CHAR_NAME = '斗破苍穹';
const outDir = path.resolve('dev/shots/st-live');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9372;
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

await mkdir(outDir, { recursive: true });
spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=1600,1000', '--hide-scrollbars',
    '--user-data-dir=' + path.join(outDir, '.profile-preset'), 'http://127.0.0.1:8000/',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets;
for (let i = 0; i < 80; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.some(t => String(t.url).includes('8000'))) break; } catch { /* 等 */ }
    await sleep(300);
}
const page = targets.find(t => String(t.url).includes('8000')) ?? targets[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
const logs = [];
ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.consoleAPICalled') {
        const text = (m.params.args ?? []).map(a => a.value ?? a.description ?? '').join(' ');
        if (text && /doupo|斗破/.test(text)) logs.push(`[${m.params.type}] ${text}`);
    }
    if (m.method === 'Runtime.exceptionThrown') {
        logs.push(`[exception] ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? ''}`);
    }
});
const send = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr, awaitPromise = true) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(String(JSON.stringify(r.result.exceptionDetails)).slice(0, 400));
    return r.result?.result?.value;
};
const shot = async name => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(outDir, `${stamp}-${name}.png`);
    await writeFile(file, Buffer.from(r.result.data, 'base64'));
    console.log('shot', path.basename(file), statSync(file).size + 'B');
};
await send('Runtime.enable');
await send('Page.enable');

for (let i = 0; i < 160; i++) {
    let n = 0;
    try { n = await ev(`(window.SillyTavern?.getContext?.()?.characters ?? []).length`); } catch { n = 0; }
    if (typeof n === 'number' && n > 0) break;
    await sleep(500);
}
await sleep(2500);

console.log('=== OPEN CHARACTER ===');
console.log(JSON.stringify(await ev(`(async () => {
  const ctx = window.SillyTavern.getContext();
  const list = ctx.characters ?? [];
  const target = list.find(c => c.name === ${JSON.stringify(CHAR_NAME)}) ?? list.find(c => String(c.name).includes(${JSON.stringify(CHAR_NAME)}));
  if (!target) return { error: 'char not found' };
  await ctx.selectCharacterById(list.indexOf(target));
  return { picked: target.name };
})()`)));
await sleep(1500);

// 打开扩展设置面板（走悬浮球的齿轮图标）
console.log('=== OPEN SETTINGS ===');
console.log(JSON.stringify(await ev(`(() => {
  const gear = document.querySelector('.dai-orb-icon[data-orb-item="system"]');
  if (!gear) return { error: 'no gear icon' };
  gear.click();
  return { clicked: true };
})()`)));
await sleep(1200);

// 找到「API设置」页签并点开
console.log('=== OPEN API PAGE ===');
console.log(JSON.stringify(await ev(`(() => {
  const tabs = [...document.querySelectorAll('.dai-tab, .dai-nav-item, [data-dai-page]')];
  const labels = tabs.map(t => (t.textContent || '').trim().slice(0, 20)).filter(Boolean);
  const api = tabs.find(t => /API设置|接口方案/.test(t.textContent || ''));
  if (api) api.click();
  return { labels, clickedApi: !!api };
})()`)));
await sleep(1500);

console.log('=== PRESET CARDS ===');
const out = await ev(`(() => {
  const cards = [...document.querySelectorAll('.dai-api-preset')];
  return {
    cardCount: cards.length,
    tavernCheckbox: document.querySelectorAll('[data-api-preset-field="tavern"]').length,
    tavernWordCount: (document.body.innerText.match(/走酒馆通道/g) || []).length,
    cards: cards.map(card => ({
      name: (card.querySelector('summary b')?.textContent || '').trim(),
      small: (card.querySelector('summary small')?.textContent || '').trim(),
      fields: [...card.querySelectorAll('[data-api-preset-field]')].map(el => el.dataset.apiPresetField),
      hasUrl: !!card.querySelector('[data-api-preset-field="baseUrl"]'),
      urlValue: card.querySelector('[data-api-preset-field="baseUrl"]')?.value ?? null,
    })),
  };
})()`);
console.log(JSON.stringify(out, null, 2));
await shot('preset-cards');

console.log('=== CONSOLE (doupo) ===');
console.log(logs.join('\n'));
ws.close();
process.exit(0);
