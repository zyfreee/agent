import assert from 'node:assert/strict';
import { getRequiredCapabilities, probeHostCapabilities } from './capability-preflight.js';

const absent = probeHostCapabilities({ root: {} });
assert.equal(absent.status, 'degraded');
assert.deepEqual(absent.missing, ['host-context', 'event-source', 'event-types']);
assert.equal(absent.fallback.includes('不声称'), true);
const handlers = { on() {}, removeListener() {} };
const ready = probeHostCapabilities({ root: { SillyTavern: { getContext: () => ({ version: '1.18.0', eventSource: handlers, event_types: { MESSAGE_EDITED: 'edited' } }) } } });
assert.equal(ready.status, 'ready');
assert.equal(ready.versions.sillytavern, '1.18.0');
assert.deepEqual(ready.missing, []);
const malformedVersion = probeHostCapabilities({ root: { SillyTavern: { getContext: () => ({ version: '01.18.0', eventSource: handlers, event_types: { MESSAGE_EDITED: 'edited' } }) } } });
assert.equal(malformedVersion.status, 'ready');
assert.equal(malformedVersion.versions.sillytavern, null);
assert.deepEqual(getRequiredCapabilities().map(item => item.id), ['host-context', 'event-source', 'event-types']);
console.log('capability preflight tests passed');
