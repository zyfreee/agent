import assert from 'node:assert/strict';
import { CANON_NODES, canonNodeById, canonNodeLabel, canonNodePromptLines, matchCanonNode } from './canon-nodes.js';

assert.ok(CANON_NODES.length >= 5);
assert.equal(canonNodeById('n1').name, '纳兰嫣然退婚');
assert.equal(canonNodeById('missing'), null);

// 关键词命中：标准名收口同一件事的不同叫法。
assert.equal(matchCanonNode('纳兰嫣然上门退婚').id, 'n1');
assert.equal(matchCanonNode('嫣然退婚')?.name, '纳兰嫣然退婚');
assert.equal(matchCanonNode('三年之约到期')?.name, '三年之约');
assert.equal(matchCanonNode('迦南学院招生提前')?.name, '迦南学院招生');
// 叠词取最长命中：不能被“云岚宗”抢走“三年之约”。
assert.equal(matchCanonNode('云岚宗三年之约').name, '三年之约');

// 未命中不硬编：原文截短返回，空值返回空串。
assert.equal(matchCanonNode('加列家换了族长'), null);
assert.equal(canonNodeLabel('加列家换了族长'), '加列家换了族长');
assert.equal(canonNodeLabel('加列家换了一位非常非常长的族长名字'), '加列家换了一位非常非常长…');
assert.equal(canonNodeLabel(''), '');
assert.equal(canonNodeLabel(null, 4), '');

// 提示词里的节点表：按 order 排序，一行一个标准名，只统一叫法不排期。
const promptLines = canonNodePromptLines();
assert.equal(promptLines.length, CANON_NODES.length);
assert.ok(promptLines[0].includes('纳兰嫣然退婚'));
assert.ok(promptLines[promptLines.length - 1].includes('药老苏醒'));
assert.ok(promptLines.every(line => line.startsWith('- ')));

console.log('impact canon node tests passed');
