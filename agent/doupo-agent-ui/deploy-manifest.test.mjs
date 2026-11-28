import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 部署清单完整性闸。
 *
 * 为什么要有这道闸：`host/api-presets.js` 曾经不在 `dev/ext-files.mjs` 的清单里，
 * 于是酒馆里那份一直停在 2026-11-18 的旧版本——源码改了、测试全绿、部署脚本也报
 * 「全部一致」，可玩家看到的还是旧行为。同类事故还包括扩展根 README 被映射成了
 * 项目根那份介绍。这两件事都不是代码 bug，是清单漏项，所以用测试盯住清单本身。
 *
 * 在酒馆部署目录里跑（没有 dev/ 与完整源码树）时自动跳过，不误报。
 */
const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const manifestPath = path.join(repoRoot, 'dev', 'ext-files.mjs');

if (!existsSync(manifestPath)) {
    console.log('deploy manifest tests skipped（不在项目源目录里跑）');
} else {
    const manifest = readFileSync(manifestPath, 'utf8');
    const entries = [...manifest.matchAll(/\['([^']+)',\s*'([^']+)'\]/g)].map(m => [m[1], m[2]]);
    assert.ok(entries.length > 100, `清单条目太少（${entries.length}），像是被截断了`);

    const sources = new Set(entries.map(([src]) => src));
    // 按「部署到哪」判断有没有覆盖：host/style.css 与扩展根 style.css 同源（都来自项目根
    // style.css，manifest 的 css 指扩展根那份、模块里又有一份备用样式），源路径相同但目标不同，
    // 所以完整性要看第二列。
    const destinations = new Set(entries.map(([, dst]) => dst));

    // 1. 扩展根那几个固定文件必须在清单里：manifest.json 的 js/css 就指这几个，
    //    漏一个酒馆就加载不到扩展（症状是"面板根本不出现"，比旧版还难查）。
    for (const required of ['index.js', 'manifest.json', 'style.css', 'settings.html']) {
        assert.ok(sources.has(required), `扩展根文件 ${required} 不在部署清单里`);
    }

    // 2. 扩展根的 README 必须来自 agent/doupo-agent-ui/README.md（扩展文档），
    //    不是项目根那份「这是什么项目」的介绍。
    assert.ok(
        entries.some(([src, dst]) => dst === 'README.md' && src === 'agent/doupo-agent-ui/README.md'),
        '扩展根 README 必须映射自 agent/doupo-agent-ui/README.md',
    );

    // 3. 运行时文件一个都不能漏：agent/ 下除测试/文档/临时目录之外的 .js/.mjs/.css/.json
    //    全都要在清单第二列（部署目标）里。这是 api-presets.js 那次事故的正面防线。
    const skipDir = new Set(['node_modules', 'shots', 'review-2026-11-04', '.tmp', 'tools']);
    const runtime = [];
    const walk = dir => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.name.startsWith('.')) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { if (!skipDir.has(entry.name)) walk(full); continue; }
            if (entry.name.endsWith('.test.mjs')) continue;
            if (!/\.(js|mjs|css|json)$/.test(entry.name)) continue;
            runtime.push(path.relative(repoRoot, full).replace(/\\/g, '/'));
        }
    };
    walk(path.join(repoRoot, 'agent'));

    const missing = runtime.filter(file => !destinations.has(file));
    assert.deepEqual(
        missing,
        [],
        `这些运行时文件没进部署清单，改了也不会到酒馆里：\n  ${missing.join('\n  ')}`,
    );

    // 4. 清单第一列的源文件都得真实存在（防止改名后留下死条目，部署脚本会静默跳过）。
    const ghost = entries.map(([src]) => src).filter(src => !existsSync(path.join(repoRoot, src)));
    assert.deepEqual(ghost, [], `清单里有不存在的源文件：\n  ${ghost.join('\n  ')}`);

    console.log('deploy manifest tests passed');
}
