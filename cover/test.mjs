/* 无浏览器自检：喂一段首楼文本，确认正则真的能出卡面、换掉标记，
 * 并检查页面里的选择器都是 data-*（消息楼里 class 会被加 custom- 前缀）。
 * 跑：node cover/test.mjs
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = name => readFile(join(here, name), 'utf8');

const failures = [];
const checks = [];
function check(name, ok, detail = '') {
  checks.push(`${ok ? '通过' : '失败'} · ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
}

const regexes = JSON.parse(await read('regex.json'));
const page = await read('page.html');
const script = await read('script.js');
const firstMes = await read('first-mes.txt');

// 1) 显示正则：标记 → 卡面
const display = regexes.find(item => item.id === 'dpc-cover-mount');
const prompt = regexes.find(item => item.id === 'dpc-cover-prompt');
check('正则组里两条脚本齐全', Boolean(display && prompt));

const parse = item => {
  const match = /^\/(.*)\/([gimsuy]*)$/.exec(item.findRegex);
  if (!match) throw new Error(`findRegex 不是 /pattern/flags 形式：${item.findRegex}`);
  return new RegExp(match[1], match[2]);
};

const displayRe = parse(display);
const firstMesOut = firstMes.replace(displayRe, display.replaceString);
check('首楼标记被替换成卡面', firstMesOut.includes('data-dpc="cover"'), `输出 ${firstMesOut.length} 字符`);
check('标记不残留', !firstMesOut.includes('[DPC_COVER]'));
check('displayOnly 不写回聊天记录', display.markdownOnly === true && display.promptOnly === false);
check('显示正则 placement 是 AI 输出', JSON.stringify(display.placement) === '[2]');

// 2) 提示词正则：同一段文本到模型那边只剩一句说明
const promptRe = parse(prompt);
const promptOut = firstMes.replace(promptRe, prompt.replaceString);
check('提示词里不含卡面 HTML', !promptOut.includes('data-dpc'), promptOut.trim());
check('提示词正则设了 promptOnly', prompt.promptOnly === true && prompt.markdownOnly === false);
check('两条正则命中同一处', prompt.findRegex === display.findRegex);

// 3) 页面结构：只留 data-* 协议，class 一律不当作挂载点
const dataAttrs = [...page.matchAll(/\sdata-[a-z-]+/g)].map(m => m[0].trim());
check('页面用了 data-* 协议', dataAttrs.length > 20, `${dataAttrs.length} 处`);
const classUse = [...page.matchAll(/\sclass="([^"]*)"/g)].map(m => m[1]);
check('页面没有依赖 class 作选择器', classUse.length === 0, classUse.join(' / ') || '无 class');
const idUse = [...page.matchAll(/\sid="([^"]*)"/g)].map(m => m[1]);
check('页面没有依赖 id 作选择器', idUse.length === 0, idUse.join(' / ') || '无 id');

// 4) 脚本与页面协议对得上
// 页面里的是“静态卡面”协议；向导那些属性由脚本自己渲染，所以两边取并集再比。
const scriptTemplates = [...script.matchAll(/data-[a-z-]+/g)].map(m => m[0]);
const known = new Set([...dataAttrs, ...scriptTemplates]);
const missing = [];
for (const match of script.matchAll(/\[(data-[a-z-]+)[\]=]/g)) {
  const attr = match[1];
  if (!known.has(attr) && attr !== 'data-dpc-ready') missing.push(attr);
}
check('脚本引用的 data-* 两边都定义过', missing.length === 0, [...new Set(missing)].join('、') || '全部对齐');

// 静态卡面自己必须有的挂载点：缺了脚本就找不到入口。
const required = ['data-dpc="cover"', 'data-dpc-start', 'data-dpc-skip', 'data-dpc-msg', 'data-dpc-needs', 'data-dpc-read', 'data-dpc-view', 'data-dpc-actions'];
check('静态卡面的必需挂载点齐全', required.every(attr => page.includes(attr)), required.join('、'));

// 5) 脚本自带可扩展清单 + 与纳戒字段对齐
const profileFields = /const PROFILE_FIELDS = \[([^\]]*)\]/.exec(script);
const fields = profileFields ? profileFields[1].split(',').map(item => item.trim().replace(/'/g, '')) : [];
check('身份字段与纳戒八项一致', fields.join(',') === 'name,gender,age,race,origin,affiliation,talent,appearance', fields.join(','));

const openingFields = /const OPENING_FIELDS = \[([^\]]*)\]/.exec(script);
const opens = openingFields ? openingFields[1].split(',').map(item => item.trim().replace(/'/g, '')) : [];
check('开局字段与纳戒八项不重叠', opens.length === 4 && opens.every(field => !fields.includes(field)), opens.join(','));
check('开局设定是独立一页而不是塞进档案', /STEP_TITLES = \['身份', '来历', '修为与处境', '开局', '天赋与外貌', '确认'\]/.test(script));

// 7) 草稿迁移：旧版本记录不能因为加字段就整份丢掉
check('草稿带版本迁移分支', /version !== 1 && version !== SCHEMA/.test(script) && /version === 1 && step === 3/.test(script));
check('开局设定参与预览与提交', /o\.location\.trim\(\)/.test(script) && /o\.request\.trim\(\)/.test(script) && /data-opening/.test(script));
check('人物簿“玩家此刻”只喂它认的四项', /name: String\(record\.profile\.name/.test(script) && /location: String\(opening\.location/.test(script) && /status: String\(opening\.status/.test(script));

// 6) 模板注入：用户输入先转义再进 innerHTML
check('向导模板对用户输入做了转义', /function esc\(/.test(script) && /esc\(identity\./.test(script));
check('提交只走斜杠接口或输入框两条路', /setinput/.test(script) && /#send_textarea/.test(script));
check('没有直接调用裸生成', !/\bgenerate\s*\(/.test(script));

console.log(checks.join('\n'));
console.log(`\n共 ${checks.length} 项，失败 ${failures.length} 项`);
if (failures.length) {
  console.log(`失败项：${failures.join('、')}`);
  process.exitCode = 1;
}
