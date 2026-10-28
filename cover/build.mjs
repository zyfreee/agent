/* 把 cover/page.html 编译成酒馆正则脚本 + 酒馆助手脚本条目。
 * 跑：node cover/build.mjs
 * 好处：卡面 HTML 只有 page.html 一份，改完重跑，不用手抄进 JSON。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = name => readFile(join(here, name), 'utf8');

const MARKER = '[DPC_COVER]';

/** 消息楼先过 Markdown 再净化：空行会把 HTML 块切断，所以整块压成连续行。 */
function compact(html) {
  return html
    .split('\n')
    .map(line => line.replace(/\s+$/, ''))
    .filter(line => line.length > 0)
    .join('\n');
}

const page = compact(await read('page.html'));
const script = await read('script.js');

const displayScript = {
  id: 'dpc-cover-mount',
  scriptName: '[卡面]斗破封面',
  findRegex: '/\\[DPC_COVER\\]/g',
  replaceString: page,
  trimStrings: [],
  placement: [2],
  disabled: false,
  markdownOnly: true,
  promptOnly: false,
  runOnEdit: true,
  substituteRegex: 0,
  minDepth: 0,
  maxDepth: null,
};

const promptScript = {
  id: 'dpc-cover-prompt',
  scriptName: '[卡面]封面不进提示词',
  findRegex: displayScript.findRegex,
  replaceString: '（开场卡面：玩家在此处创建了角色身份，具体信息见玩家随后发出的第一条消息。）',
  trimStrings: [],
  placement: [2],
  disabled: false,
  markdownOnly: false,
  promptOnly: true,
  runOnEdit: true,
  substituteRegex: 0,
  minDepth: 0,
  maxDepth: null,
};

const helperScript = {
  type: 'script',
  enabled: true,
  name: '斗破卡面 · 身份创建',
  id: 'dpc-cover-script',
  content: script,
  info: '封面上的“开始创建身份”向导：依赖体检、六页表单、预览、提交；提交后把身份写进纳戒并接上人物簿的“玩家此刻”。',
  button: { enabled: false, buttons: [] },
  data: {},
  export_with: { data: false, button: false },
};

// 离线预览页：把卡面塞进一个普通 HTML，方便在浏览器里直接看排版。
// 顺手把 script.js 也塞进来，所以这一页的按钮是能点的：走的是同一份脚本，
// 只是变量接口不在，草稿落到 localStorage 里。
const preview = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>卡面预览 · 斗破苍穹</title>
<style>
  body { margin: 0; padding: 24px 12px 60px; background: #efe9dc; }
  [data-preview-note] { max-width: 620px; margin: 0 auto 18px; font: 13px/1.7 system-ui, sans-serif; color: #6a6157; }
  [data-preview-note] b { color: #2c2721; }
</style>
</head>
<body>
<p data-preview-note><b>这是离线试跑页，不是酒馆里的真卡面。</b>排版、点「开始创建身份」、翻页、确认，都是同一份脚本在跑，所以这里能点。区别只有一个：这里没有酒馆的变量接口，填的东西存在浏览器本地；真发消息那一步也不会发出去（会提示你手动手动发）。改完 <code>page.html</code> 或 <code>script.js</code> 后重跑 <code>node cover/build.mjs</code> 再刷新。</p>
${await read('page.html')}
<script>
${script}
</script>
</body>
</html>
`;

await writeFile(join(here, 'regex.json'), `${JSON.stringify([displayScript, promptScript], null, 2)}\n`, 'utf8');
await writeFile(join(here, 'opening-script.json'), `${JSON.stringify(helperScript, null, 2)}\n`, 'utf8');
await writeFile(join(here, 'first-mes.txt'), `${MARKER}\n`, 'utf8');
await writeFile(join(here, 'preview.html'), preview, 'utf8');

console.log(`page.html ${page.length} 字符 → regex.json`);
console.log(`script.js ${script.length} 字符 → opening-script.json`);
console.log(`page.html → preview.html（离线看排版用）`);
console.log(`findRegex: ${displayScript.findRegex}`);
