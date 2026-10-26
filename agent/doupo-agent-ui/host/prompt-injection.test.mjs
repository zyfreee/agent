import assert from 'node:assert/strict';
import { createPromptInjection, PROMPT_INJECTION_KEY, DEFAULT_MAX_CHARS } from '../host/prompt-injection.js';

function makeContext() {
    const writes = [];
    return {
        writes,
        extension_prompt_types: { IN_PROMPT: 0, IN_CHAT: 1, BEFORE_PROMPT: 2 },
        extension_prompt_roles: { SYSTEM: 0, USER: 1, ASSISTANT: 2 },
        setExtensionPrompt(...args) { writes.push(args); },
    };
}

// No host channel: the module must report it instead of pretending to inject.
const absent = createPromptInjection({ getContext: () => ({}) });
assert.equal(absent.inspect().status, 'unsupported');
assert.equal(absent.write({ text: '原文' }).status, 'unsupported');
assert.equal(absent.clear().status, 'unsupported');

// Missing context getter is a programming error, not a silent no-op.
assert.throws(() => createPromptInjection({}), /getContext/);
assert.throws(() => createPromptInjection({ getContext: () => ({}), key: '  ' }), /key/);

const context = makeContext();
const injection = createPromptInjection({ getContext: () => context });
assert.equal(injection.key, PROMPT_INJECTION_KEY);
assert.equal(injection.inspect().status, 'ready');

const written = injection.write({ text: '  【物品：青莲地心火】生于塔戈尔沙漠。  ', usedIds: ['1041'] }, { depth: 1 });
assert.equal(written.status, 'injected');
assert.equal(written.position, 1);
assert.equal(written.role, 0);
assert.equal(written.depth, 1);
assert.deepEqual(written.usedIds, ['1041']);
assert.equal(context.writes.length, 1);
const [key, text, position, depth, scan, role] = context.writes[0];
assert.equal(key, PROMPT_INJECTION_KEY);
assert.equal(text, '【物品：青莲地心火】生于塔戈尔沙漠。');
assert.equal(position, 1);
assert.equal(depth, 1);
assert.equal(scan, false, '注入内容不得参与世界书扫描');
assert.equal(role, 0);

// Depth is clamped, never trusted blindly.
assert.equal(injection.write({ text: 'x' }, { depth: -5 }).depth, 0);
assert.equal(injection.write({ text: 'x' }, { depth: 999 }).depth, 100);

// Budget cut keeps the head and says so.
const long = '甲'.repeat(DEFAULT_MAX_CHARS + 10);
const truncated = injection.write({ text: long });
assert.equal(truncated.truncated, true);
assert.equal(truncated.chars <= DEFAULT_MAX_CHARS + 32, true);
assert.equal(context.writes.at(-1)[1].includes('已按预算截断'), true);

const custom = injection.write({ text: '乙'.repeat(50) }, { maxChars: 10 });
assert.equal(custom.truncated, true);
assert.equal(custom.chars < 60, true);

// Empty text clears instead of leaving a stale injection behind.
const before = context.writes.length;
assert.equal(injection.write({ text: '   ' }).status, 'empty');
assert.equal(context.writes.length, before + 1);
assert.equal(context.writes.at(-1)[1], '');

assert.equal(injection.clear().status, 'cleared');
assert.equal(context.writes.at(-1)[1], '');

// A throwing host must surface as failed, not break the generation.
const throwing = createPromptInjection({ getContext: () => ({ ...makeContext(), setExtensionPrompt() { throw new Error('host down'); } }) });
assert.equal(throwing.write({ text: 'x' }).status, 'failed');
assert.equal(throwing.clear().status, 'failed');

console.log('prompt injection tests passed');
