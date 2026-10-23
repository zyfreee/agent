import { readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const directory = path.dirname(fileURLToPath(import.meta.url));

async function findTests(currentDirectory) {
    const entries = await readdir(currentDirectory, { withFileTypes: true });
    const tests = [];
    for (const entry of entries) {
        const fullPath = path.join(currentDirectory, entry.name);
        if (entry.isDirectory()) tests.push(...await findTests(fullPath));
        else if (entry.isFile() && entry.name.endsWith('.test.mjs')) tests.push(fullPath);
    }
    return tests;
}

const tests = (await findTests(directory)).sort();
if (!tests.length) throw new Error('未发现模块测试');
let failures = 0;
for (const test of tests) {
    const label = path.relative(directory, test).replaceAll(path.sep, '/');
    try {
        await import(pathToFileURL(test).href);
    } catch (error) {
        failures++;
        console.error(`FAIL ${label}:`, error);
    }
}
console.log(`\n模块测试汇总：${tests.length - failures}/${tests.length} 通过`);
if (failures) process.exitCode = 1;
