import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const directory = path.dirname(fileURLToPath(import.meta.url));
const tests = (await readdir(directory)).filter(name => name.endsWith('.test.mjs')).sort();
if (!tests.length) throw new Error('未发现模块测试');
let failures = 0;
for (const test of tests) {
    try {
        await import(new URL(`./${test}`, import.meta.url));
    } catch (error) {
        failures++;
        console.error(`FAIL ${test}:`, error);
    }
}
console.log(`\n模块测试汇总：${tests.length - failures}/${tests.length} 通过`);
if (failures) process.exitCode = 1;
