// 真酒馆：验证「上次记录 / 落成 / 本幕注入」三条回执刷新后还在。
// 做法：往聊天存档的 doupo_agent_state 里塞一份 impactLastRun（形状与代码写出来的一致），
// 刷新页面再看面板 —— 如果面板说的话变了，说明 hydrate 生效。
// 验证完立刻把原始 chatMetadata 原样写回，不留痕迹。
//   用法：node dev/st-live-verify-lastrun.mjs --chat="<聊天名>"
import { spawn } from 'node:child_process';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { statSync } from 'node:fs';

const args = process.argv.slice(2);
const chatArg = (args.find(a => a.startsWith('--chat=')) ?? '').slice('--chat='.length);
const CHAR_NAME = '斗破苍穹';

const outDir = path.resolve('dev/shots/st-live');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9366;
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

await mkdir(outDir, { recursive: true });
const proc = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=1600,1000', '--hide-scrollbars',
    '--user-data-dir=' + path.join(outDir, '.profile-verify'), 'http://127.0.0.1:8000/',
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
const shot = async name => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(outDir, `${stamp}-${name}.png`);
    await writeFile(file, Buffer.from(r.result.data, 'base64'));
    console.log('shot', path.basename(file), statSync(file).size + 'B');
};
await send('Runtime.enable');
await send('Page.enable');

const waitReady = async () => {
    for (let i = 0; i < 200; i++) {
        let n = 0;
        try { n = await ev(`(window.SillyTavern?.getContext?.()?.characters ?? []).length`); } catch { n = 0; }
        if (typeof n === 'number' && n > 0) return;
        await sleep(500);
    }
    throw new Error('SillyTavern 没起来');
};
const openChat = async () => {
    const opened = await ev(`(async () => {
      const ctx = window.SillyTavern.getContext();
      const list = ctx.characters ?? [];
      const target = list.find(c => c.name === ${JSON.stringify(CHAR_NAME)}) ?? list.find(c => String(c.name).includes(${JSON.stringify(CHAR_NAME)}));
      if (!target) return { error: 'char not found' };
      await ctx.selectCharacterById(list.indexOf(target));
      return { picked: target.name };
    })()`);
    console.log('OPEN CHAR', JSON.stringify(opened));
    await sleep(3500);
    if (chatArg) {
      const r = await ev(`(async () => { try { await window.SillyTavern.getContext().openCharacterChat(${JSON.stringify(chatArg)}); return 'opened'; } catch (e) { return 'throw: ' + String(e && e.message || e); } })()`);
      console.log('OPEN CHAT', r);
      await sleep(4000);
    }
};
const dumpPanel = async () => ev(`(() => {
  const panel = document.querySelector('.dai-orb-panel');
  if (!panel) return null;
  return {
    summary: panel.querySelector('.dai-orb-panel-head small')?.textContent ?? null,
    rows: [...panel.querySelectorAll('.dai-orb-row')].map(r => r.textContent),
  };
})()`);
const openImpact = async () => {
    await ev(`(() => { const orb = document.querySelector('.dai-orb'); if (!orb) return; if (orb.dataset.state !== 'expanded') orb.querySelector('.dai-orb-ball')?.click(); })()`);
    await sleep(600);
    await ev(`document.querySelector('.dai-orb-icon[data-orb-item="impact"]')?.click()`);
    await sleep(1200);
};

await waitReady();
await sleep(2500);
await openChat();
console.log('CUR', JSON.stringify(await ev(`(() => { const c = window.SillyTavern.getContext(); return { chatId: c.chatId, chatLen: (c.chat ?? []).length }; })()`)));

// 1) 存下原始 chatMetadata（整个对象），验证完原样写回。
const original = await ev(`(() => { const ctx = window.SillyTavern.getContext(); return ctx.chatMetadata ?? null; })()`);
await writeFile(path.join(outDir, `${stamp}-original-metadata.json`), JSON.stringify(original, null, 2));
console.log('saved original metadata, keys =', Object.keys(original ?? {}).join(','));

const before = await (async () => { await openImpact(); const d = await dumpPanel(); await shot('01-before'); return d; })();
console.log('\n=== PANEL (before) ===\n' + JSON.stringify(before, null, 2));

// 2) 塞一份 impactLastRun（形状照代码写出来的那种），保存。
const wrote = await ev(`(async () => {
  const ctx = window.SillyTavern.getContext();
  const meta = ctx.chatMetadata;
  const key = 'doupo_agent_state';
  const state = (meta[key] && typeof meta[key] === 'object') ? { ...meta[key] } : {};
  state.impactLastRun = {
    record: { at: new Date().toISOString(), source: 'auto', note: '坊市那笔账', applied: [{ id: 'i1' }], rejected: [{ ref: 'i9', reason: 'evidence_not_found' }], due: [], dropped: [], materialized: 1, chain: 1, materializeError: null, warnings: [], day: 1 },
    materialize: { at: new Date().toISOString(), day: 1, rows: [{ status: 'materialized' }], chain: [{ id: 'i2' }], reconciled: [], threads: ['线索因世界影响推进 f1「加列货栈换防反常」：到期第 6 天 → 5 天'], error: null },
    injection: { status: 'injected', via: 'llm', usedIds: ['i1'], note: '' },
  };
  meta[key] = state;
  await ctx.saveMetadata();
  return { wrote: true, keys: Object.keys(state) };
})()`);
console.log('WROTE', JSON.stringify(wrote));

// 3) 刷新页面，重新打开聊天，看面板。
await send('Page.reload', { ignoreCache: true });
await sleep(1500);
await waitReady();
await sleep(3000);
await openChat();
const after = await (async () => { await openImpact(); const d = await dumpPanel(); await shot('02-after-reload'); return d; })();
console.log('\n=== PANEL (after reload) ===\n' + JSON.stringify(after, null, 2));

// 命令行走的也是这三个值，一起看一眼。
const statusText = await ev(`(async () => {
  try { return await window.SillyTavern.getContext().executeSlashCommands('/impact status'); }
  catch (e) { return 'throw: ' + String(e && e.message || e); }
})()`);
console.log('\n=== /impact status ===\n' + String(statusText));

// 4) 原样写回原始 chatMetadata。
const restored = await ev(`(async () => {
  const ctx = window.SillyTavern.getContext();
  const saved = ${JSON.stringify(original)};
  ctx.chatMetadata = saved;
  await ctx.saveMetadata();
  return { restored: true, hasImpactLastRun: Boolean(ctx.chatMetadata?.doupo_agent_state?.impactLastRun) };
})()`);
console.log('RESTORED', JSON.stringify(restored));

ws.close();
proc.kill();
