// 真酒馆：在指定聊天里跑一轮（世界影响）。
//   用法：node dev/st-live-newchat.mjs --chat="斗破苍穹 - 2026-11-27@15h03m15s288ms" --send
//   不给 --chat 就只打开角色、列出它的聊天，不发消息。
import { spawn } from 'node:child_process';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { statSync } from 'node:fs';

const args = process.argv.slice(2);
const SEND = args.includes('--send');
const chatArg = (args.find(a => a.startsWith('--chat=')) ?? '').slice('--chat='.length);
const CHAR_NAME = '斗破苍穹';
const LINE = '我把断崖水穴里那几株药苗的根须用湿泥裹好，顺路去了趟百草药铺问价，出门时把加列家货栈换防的时辰记在了心里。';

const outDir = path.resolve('dev/shots/st-live');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9362;
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

await mkdir(outDir, { recursive: true });
const proc = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=1600,1000', '--hide-scrollbars',
    '--user-data-dir=' + path.join(outDir, '.profile-new'), 'http://127.0.0.1:8000/',
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
        if (text) logs.push(`[${m.params.type}] ${text}`);
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

const opened = await ev(`(async () => {
  const ctx = window.SillyTavern.getContext();
  const list = ctx.characters ?? [];
  const target = list.find(c => c.name === ${JSON.stringify(CHAR_NAME)}) ?? list.find(c => String(c.name).includes(${JSON.stringify(CHAR_NAME)}));
  if (!target) return { error: 'char not found' };
  await ctx.selectCharacterById(list.indexOf(target));
  return { picked: target.name, avatar: target.avatar, defaultChat: target.chat };
})()`);
console.log('OPEN CHAR', JSON.stringify(opened));
await sleep(3500);

const chatTarget = chatArg;
if (chatTarget) {
    const opened2 = await ev(`(async () => {
      const ctx = window.SillyTavern.getContext();
      try { await ctx.openCharacterChat(${JSON.stringify(chatArg)}); return 'opened'; }
      catch (error) { return 'throw: ' + String((error && error.message) || error); }
    })()`);
    console.log('OPEN CHAT', opened2);
    await sleep(4000);
}

const cur = () => ev(`(() => { const c = window.SillyTavern.getContext(); return { name2: c.name2, chatId: c.chatId, chatLen: (c.chat ?? []).length, domMes: document.querySelectorAll('#chat .mes').length, orb: Boolean(document.querySelector('.dai-orb')), orbMode: document.querySelector('.dai-orb')?.dataset.apiMode ?? null }; })()`);
console.log('CUR', JSON.stringify(await cur()));

const ledger = () => ev(`(async () => {
  const mod = await import('/scripts/extensions/third-party/agent/agent/doupo-agent-ui/index.js');
  const s = mod.doupoAgent.impactStatus();
  const records = (mod.agentImpactRuntime?.list?.({}) ?? []).map(r => ({
    id: r.id, title: r.title, state: r.state, weight: r.weight,
    canon: r.canon || '', shift: r.shift || '', canonWhat: r.canonWhat || '',
    effects: (r.effects ?? []).map(e => e.type + (e.field ? ':' + e.field : '') + (e.name ? ':' + e.name : '')),
    echoes: (r.echoes ?? []).length,
  }));
  let dropped = [];
  try { dropped = mod.doupoAgent.impactDroppedHits() ?? []; } catch { /* 早期版本没有这个入口 */ }
  let world = null;
  try {
    const snap = mod.agentWorldRuntime.snapshot();
    const evs = [...(snap?.nearEvents ?? []), ...(snap?.worldEvents ?? [])];
    world = { total: evs.length, impactEvents: evs.filter(e => String(e.basis ?? '').includes('影响#')).map(e => ({ id: e.id, title: e.title, weight: e.weight, basis: e.basis, scope: e.scope })) };
  } catch (error) { world = { error: String((error && error.message) || error) }; }
  let npc = null;
  try { npc = (mod.agentNpcLedger.list() ?? []).filter(r => (r.impactRefs ?? []).length).map(r => ({ name: r.name, favor: r.favor, refs: r.impactRefs })); } catch { /* 无 */ }
  let self = null;
  try { const snap = mod.agentSelfRuntime.snapshot(); self = { gold: snap.gold, items: (snap.items ?? []).length, realm: snap.realm }; } catch { /* 无 */ }
  let plot = null;
  try { plot = (mod.agentPlotRuntime.snapshot()?.threads ?? []).map(t => ({ id: t.id, title: t.title, state: t.status, due: t.dueDay })); } catch { /* 无 */ }
  return { status: s, records, dropped, world, npc, self, plot };
})()`);

const openOrbItem = async item => {
    await ev(`(() => { const orb = document.querySelector('.dai-orb'); if (!orb) return; if (orb.dataset.state !== 'expanded') orb.querySelector('.dai-orb-ball')?.click(); })()`);
    await sleep(600);
    await ev(`document.querySelector('.dai-orb-icon[data-orb-item="${item}"]')?.click()`);
    await sleep(900);
};
const closeOrb = async () => {
    await ev(`(() => { document.querySelector('.dai-orb-panel .dai-orb-panel-close')?.click(); const orb = document.querySelector('.dai-orb'); if (orb?.dataset.state === 'expanded') orb.querySelector('.dai-orb-ball')?.click(); })()`);
    await sleep(400);
};
const dumpPanel = async label => {
    const data = await ev(`(() => {
      const panel = document.querySelector('.dai-orb-panel');
      if (!panel) return null;
      return {
        title: panel.querySelector('.dai-orb-panel-head b')?.textContent ?? null,
        summary: panel.querySelector('.dai-orb-panel-head small')?.textContent ?? null,
        rows: [...panel.querySelectorAll('.dai-orb-row')].map(r => r.textContent),
        groups: [...panel.querySelectorAll('.dai-orb-group')].map(g => ({
          title: g.querySelector('.dai-orb-group-title')?.textContent ?? null,
          items: [...g.querySelectorAll('.dai-orb-entry')].map(e => e.textContent),
        })),
      };
    })()`);
    console.log(`\n=== IMPACT PANEL (${label}) ===\n` + JSON.stringify(data, null, 2));
    return data;
};

await openOrbItem('impact');
await shot('01-impact-before');
await dumpPanel('before');
const before = await ledger();
console.log('\n=== LEDGER (before) ===\n' + JSON.stringify(before, null, 2));

if (SEND) {
    await closeOrb();
    const count0 = await ev(`document.querySelectorAll('#chat .mes').length`);
    await ev(`(() => {
      const box = document.getElementById('send_textarea');
      box.focus();
      box.value = ${JSON.stringify(LINE)};
      box.dispatchEvent(new Event('input', { bubbles: true }));
      return box.value.length;
    })()`);
    await sleep(600);
    await shot('02-typed');
    await ev(`document.getElementById('send_but')?.click()`);
    console.log('\nsent, waiting for reply…');

    let last = count0;
    for (let i = 0; i < 400; i++) {
        const st = await ev(`(() => ({
          count: document.querySelectorAll('#chat .mes').length,
          streaming: Boolean(document.querySelector('#chat .mes.last_mes .mes_text.streaming, #chat .mes.streaming')),
          sending: document.getElementById('send_but')?.disabled === true,
          lastLen: (document.querySelector('#chat .mes.last_mes .mes_text')?.innerText ?? '').length,
        }))()`);
        last = st.count;
        if (i % 20 === 0) console.log(`  …${(i * 0.5).toFixed(0)}s count=${st.count} streaming=${st.streaming} sending=${st.sending} lastLen=${st.lastLen}`);
        if (st.count >= count0 + 2 && !st.streaming && !st.sending) {
            await sleep(3000);
            const again = await ev(`document.querySelectorAll('#chat .mes').length`);
            const stillStreaming = await ev(`Boolean(document.querySelector('#chat .mes.last_mes .mes_text.streaming, #chat .mes.streaming'))`);
            if (again === st.count && !stillStreaming) break;
        }
        await sleep(500);
    }
    console.log(`messages: ${count0} → ${last}`);
    await shot('03-after-reply');
    const lastMes = await ev(`(() => {
      const mes = [...document.querySelectorAll('#chat .mes')];
      const tail = mes.slice(-2).map(m => ({ isUser: m.getAttribute('is_user'), len: (m.innerText ?? '').length, head: (m.innerText ?? '').replace(/\\s+/g, ' ').slice(0, 200) }));
      return { total: mes.length, tail };
    })()`);
    console.log('LAST MES', JSON.stringify(lastMes, null, 2));
    console.log('CUR after reply', JSON.stringify(await cur()));

    await sleep(4000);
    await openOrbItem('impact');
    await shot('04-impact-after');
    await dumpPanel('after');
    const after = await ledger();
    console.log('\n=== LEDGER (after) ===\n' + JSON.stringify(after, null, 2));
    console.log('\n=== DIFF ===', JSON.stringify({
        total: [before.status.total, after.status.total],
        sunk: [before.status.sunk, after.status.sunk],
        ripened: [before.status.ripened, after.status.ripened],
        closed: [before.status.closed, after.status.closed],
        worldImpactEvents: [before.world?.impactEvents?.length, after.world?.impactEvents?.length],
        npcTouched: [before.npc?.length, after.npc?.length],
        gold: [before.self?.gold, after.self?.gold],
        dropped: [before.dropped?.length, after.dropped?.length],
        plot: [before.plot?.length, after.plot?.length],
    }));
}

const interesting = logs.filter(l => /doupo|影响|impact|判定/i.test(l)).slice(0, 40);
console.log('\n=== CONSOLE (doupo/impact) ===');
for (const l of interesting) console.log('  ', l);

ws.close();
proc.kill();
