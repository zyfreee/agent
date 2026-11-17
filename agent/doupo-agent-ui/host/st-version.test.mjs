import assert from 'node:assert/strict';
import test from 'node:test';
import { MIN_ST_VERSION, parseStVersion, compareStVersions, isSupportedStVersion, detectStVersion, isTauriTavern } from './st-version.js';

test('版本门：解析三段/两段/带尾巴的版本号，坏值不认', () => {
    assert.equal(MIN_ST_VERSION, '1.14.0');
    assert.deepEqual(parseStVersion('1.14.0'), [1, 14, 0]);
    assert.deepEqual(parseStVersion('1.13'), [1, 13, 0]);
    assert.deepEqual(parseStVersion('1.12.11'), [1, 12, 11]);
    assert.deepEqual(parseStVersion('2.0.0'), [2, 0, 0]);
    assert.deepEqual(parseStVersion('1.14.0-rc1'), [1, 14, 0]);
    assert.equal(parseStVersion('UNKNOWN'), null);
    assert.equal(parseStVersion(''), null);
    assert.equal(parseStVersion(123), null);
    assert.equal(parseStVersion(null), null);
});

test('版本门：逐段比较，缺段按 0 补齐', () => {
    assert.equal(compareStVersions([1, 13, 0], [1, 13, 0]), 0);
    assert.equal(compareStVersions([1, 12, 11], [1, 13, 0]), -1);
    assert.equal(compareStVersions([1, 13], [1, 12, 99]), 1);
    assert.equal(compareStVersions([1, 13, 1], [1, 13, 0]), 1);
    assert.equal(compareStVersions([2, 0, 0], [1, 19, 0]), 1);
});

test('版本门：1.14 达标，1.13 不达标，认不出一律不达标', () => {
    assert.equal(isSupportedStVersion('1.14.0'), true);
    assert.equal(isSupportedStVersion('1.14'), true);
    assert.equal(isSupportedStVersion('1.14.5'), true);
    assert.equal(isSupportedStVersion('1.16.0'), true);
    assert.equal(isSupportedStVersion('1.19.0'), true);
    assert.equal(isSupportedStVersion('1.13.0'), false);
    assert.equal(isSupportedStVersion('1.13'), false);
    assert.equal(isSupportedStVersion('1.12.11'), false);
    assert.equal(isSupportedStVersion('UNKNOWN'), false);
    assert.equal(isSupportedStVersion(''), false);
});

test('版本门：/version 的 pkgVersion 探测，拿不到就放行返回 null', async () => {
    const ok = await detectStVersion({ fetchImpl: async () => ({ ok: true, json: async () => ({ agent: 'SillyTavern:1.14.0', pkgVersion: '1.14.0' }) }) });
    assert.equal(ok, '1.14.0');
    assert.equal(await detectStVersion({ fetchImpl: async () => ({ ok: true, json: async () => ({ agent: 'SillyTavern:UNKNOWN' }) }) }), null, '没有 pkgVersion 就探测失败');
    assert.equal(await detectStVersion({ fetchImpl: async () => ({ ok: false, json: async () => ({}) }) }), null, 'HTTP 失败探测不达标');
    assert.equal(await detectStVersion({ fetchImpl: async () => { throw new Error('离线'); } }), null, '网络失败放行');
    assert.equal(await detectStVersion({ fetchImpl: undefined }), null, '没有 fetch 就放行');
    // 新旧酒馆的 /version 响应里 pkgVersion 都是版本字符串，1.19 的形状也认得。
    const modern = await detectStVersion({ fetchImpl: async () => ({ ok: true, json: async () => ({ pkgVersion: '1.19.0', gitBranch: 'release' }) }) });
    assert.equal(isSupportedStVersion(modern), true);
    // TauriTavern 同形：pkgVersion 是内嵌前端基线（bridge.rs 的 SILLYTAVERN_COMPAT_VERSION），
    // 另有 tauriVersion 才是它自己的发行版本——基线 ≥1.14，版本门放行。
    const tt = await detectStVersion({ fetchImpl: async () => ({ ok: true, json: async () => ({ agent: 'SillyTavern:1.19.0:TauriTavern', pkgVersion: '1.19.0', tauriVersion: '0.9.2' }) }) });
    assert.equal(tt, '1.19.0');
    assert.equal(isSupportedStVersion(tt), true);
});

test('平台检测：认 TauriTavern 的 __TAURITAVERN__ ABI，普通环境不认', () => {
    assert.equal(isTauriTavern({ __TAURITAVERN__: { abiVersion: 2, ready: true } }), true);
    assert.equal(isTauriTavern({ __TAURITAVERN__: null }), false, '占位 null 不算平台命中');
    assert.equal(isTauriTavern({}), false);
    assert.equal(isTauriTavern(globalThis), false, '测试环境没有平台 ABI');
    assert.equal(isTauriTavern(undefined), false);
});
