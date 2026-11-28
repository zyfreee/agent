// 清掉上一个验证脚本留下的 impactLastRun（它只该由代码自己写，不该留着假数据）。
//   用法：node dev/st-live-clean-lastrun.mjs --chat="<聊天名>"
import { spawn } from 'node:child_process';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const args = process.argv.slice(2);
const chatArg = (args.find(a => a.startsWith('--chat=')) ?? '').slice('--chat='.length);
const CHAR_NAME = '斗破苍穹';
const outDir = path.resolve('dev/shots/st-live');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9368;

await mkdir(outDir, { recursive: true });
const proc = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=1200,800', '--user-data-dir=' + path.join(outDir, '.profile-clean'), 'http://127.0.0.1:8000/',
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
ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr, awaitPromise = true) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(String(JSON.stringify(r.result.exceptionDetails)).slice(0, 500));
    return r.result?.result?.value;
};
await send('Runtime.enable');

for (let i = 0; i < 200; i++) {
    let n = 0;
    try { n = await ev(`(window.SillyTavern?.getContext?.()?.characters ?? []).length`); } catch { n = 0; }
    if (typeof n === 'number' && n > 0) break;
    await sleep(500);
}
await sleep(2000);
await ev(`(async () => {
  const ctx = window.SillyTavern.getContext();
  const list = ctx.characters ?? [];
  const target = list.find(c => c.name === ${JSON.stringify(CHAR_NAME)}) ?? list.find(c => String(c.name).includes(${JSON.stringify(CHAR_NAME)}));
  await ctx.selectCharacterById(list.indexOf(target));
  return true;
})()`);
await sleep(3000);
if (chatArg) {
    const r = await ev(`(async () => { try { await window.SillyTavern.getContext().openCharacterChat(${JSON.stringify(chatArg)}); return 'opened'; } catch (e) { return 'throw: ' + String(e && e.message || e); } })()`);
    console.log('OPEN CHAT', r);
    await sleep(4000);
}

const result = await ev(`(async () => {
  const ctx = window.SillyTavern.getContext();
  const meta = ctx.chatMetadata;
  const state = meta?.doupo_agent_state;
  if (!state || typeof state !== 'object') return { cleaned: false, reason: 'no state' };
  const had = Object.prototype.hasOwnProperty.call(state, 'impactLastRun');
  delete state.impactLastRun;
  await ctx.saveMetadata();
  return { cleaned: true, had, keys: Object.keys(state), stillThere: Boolean(ctx.chatMetadata?.doupo_agent_state?.impactLastRun) };
})()`);
console.log('CLEAN', JSON.stringify(result));

ws.close();
proc.kill();
