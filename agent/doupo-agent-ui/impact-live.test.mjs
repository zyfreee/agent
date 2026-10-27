import assert from 'node:assert/strict';

/**
 * 活链路冒烟：世界影响库 -> 正文注入 -> 聊天存档 -> 恢复。
 * 不碰网络与真实酒馆：只伪造 getContext 提供的最小上下文。
 */
const injected = new Map();
const context = {
    chat: [
        { is_user: true, mes: '我把加列家族的药材库烧了。' },
        { is_user: false, mes: '火光冲天，乌坦城的人都在传是加列家得罪了什么人。' },
    ],
    chatMetadata: {},
    extensionSettings: {},
    setExtensionPrompt(key, text) { if (text) injected.set(key, text); else injected.delete(key); },
    extension_prompt_types: { IN_CHAT: 1 },
    extension_prompt_roles: { SYSTEM: 0 },
    async saveMetadata() { /* 内存存档，测试里不需要落盘 */ },
};
globalThis.SillyTavern = { getContext: () => context };

const { agentImpactRuntime, doupoAgent } = await import('./index.js');
// index.js 是模块单例，其他测试可能已经往库里记过东西；本测试从空库开始，不依赖执行顺序。
agentImpactRuntime.reset();

// 空库：不注入、不占预算，也不留空标题。
assert.equal((await doupoAgent.impactInjection()).status, 'empty');
assert.equal(injected.has('doupo_impact'), false);

// 记一条世界级影响：正文注入里出现“本局世界线”，但不带编号和依据（正文不该看到“因为玩家说过”）。
const applied = agentImpactRuntime.apply([
    {
        op: 'record',
        title: '加列家族的药材库被烧',
        detail: '城中药材价格翻倍，家族开始追查纵火者',
        target: '加列家族',
        kind: 'direct',
        weight: 'major',
        certainty: 'certain',
        evidence: '第 1 楼玩家纵火',
        canon: '加列家族的药材生意',
        shift: 'alter',
    },
], { source: 'manual', day: 1 });
assert.equal(applied.status, 'applied');
assert.equal(agentImpactRuntime.status().total, 1);
const result = await doupoAgent.impactInjection();
assert.equal(result.status, 'injected');
const text = injected.get('doupo_impact');
assert.match(text, /世界影响/);
assert.match(text, /加列家族的药材库被烧/);
assert.match(text, /原著·改写/);
assert.doesNotMatch(text, /#i1/);
assert.doesNotMatch(text, /第 1 楼玩家纵火/);

// 手动改写：改过的内容要覆盖旧账，注入跟着变。
const revised = agentImpactRuntime.apply([
    { op: 'edit', ref: 'i1', title: '加列家族的药材库一夜被烧', weight: 'world' },
], { source: 'manual', day: 2 });
assert.equal(revised.status, 'applied');
const revisedResult = await doupoAgent.impactInjection();
assert.equal(revisedResult.status, 'injected');
assert.match(injected.get('doupo_impact'), /一夜被烧/);
assert.match(injected.get('doupo_impact'), /★/);

// 存档往返：库跟着聊天走，清空内存后能从 chatMetadata 读回同一条世界线。
context.chatMetadata.doupo_agent_impact = agentImpactRuntime.snapshot();
agentImpactRuntime.reset();
assert.equal(agentImpactRuntime.status().total, 0);
const restored = doupoAgent.impactRestoreFromChat();
assert.equal(restored.status, 'restored');
assert.equal(agentImpactRuntime.status().total, 1);
assert.equal(agentImpactRuntime.list()[0].title, '加列家族的药材库一夜被烧');

// 收场的影响不再注入正文；但记录还在库里，不算没发生。
const closed = agentImpactRuntime.apply([{ op: 'close', ref: 'i1', detail: '加列家族压下消息，暗中查人' }], { source: 'manual', day: 3 });
assert.equal(closed.status, 'applied');
assert.equal(agentImpactRuntime.list({ state: 'closed' }).length, 1);
assert.equal((await doupoAgent.impactInjection()).status, 'empty');
assert.equal(injected.has('doupo_impact'), false);

delete globalThis.SillyTavern;
console.log('impact live wiring tests passed');
