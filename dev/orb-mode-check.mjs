// 查版本门：三种 apiMode 下球上哪些图标是可见的（filter hidden）。
import { spawn } from 'node:child_process';
import path from 'node:path';

const port = 9336;
const outDir = path.resolve('dev/shots');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const proc = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=1440,900', '--hide-scrollbars', '--user-data-dir=' + path.join(outDir, '.profile-mode'), 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let targets;
for (let i = 0; i < 40; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.length) break; } catch { /* wait */ }
    await sleep(250);
}
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');

for (const mode of ['advanced', 'full', 'lite']) {
    await send('Page.navigate', { url: `http://127.0.0.1:8123/dev/orb-smoke.html?mode=${mode}` });
    await sleep(3000);
    const info = await evaluate(`(() => {
      const icons = [...document.querySelectorAll('.dai-orb-icon')];
      return {
        mode: SillyTavern.getContext().extensionSettings.doupo_agent_ui.apiMode,
        visible: icons.filter(n => !n.hidden).map(n => n.dataset.orbItem),
        apiModeOnOrb: document.querySelector('.dai-orb')?.dataset.apiMode,
      };
    })()`);
    console.log(JSON.stringify(info));
}

proc.kill();
process.exit(0);
