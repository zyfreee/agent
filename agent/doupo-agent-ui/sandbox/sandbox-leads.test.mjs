import assert from 'node:assert/strict';
import { createSandboxLeads } from './sandbox-leads.js';

const scope = { sessionId: 's1', branchId: 'b1' };
const leads = createSandboxLeads({ maxOpen: 2, now: () => '2026-01-01T00:00:00.000Z' });

assert.throws(() => leads.add({ ...scope, kind: 'weird', text: 'x', source: { name: '酒馆传言' } }), /线索类型/);
assert.throws(() => leads.add({ ...scope, text: 'x' }), /线索来源/);
assert.throws(() => leads.add({ ...scope, text: 'x', source: { name: '酒馆传言', reliability: 'certain' } }), /可信度/);

const rumor = leads.add({ ...scope, text: '城西有人见过异火', source: { name: '酒馆伙计', reliability: 'uncertain' } });
assert.equal(rumor.status, 'candidate');
assert.equal(rumor.lead.knowledge, 'reported');
assert.equal(rumor.lead.truth, 'unknown');
assert.equal(rumor.committed, false);

assert.throws(() => leads.add({ ...scope, kind: 'commission', text: '护送商队', source: { name: '商会' } }), /委托发布方/);
const commission = leads.add({ ...scope, kind: 'commission', text: '护送商队去乌坦城', source: { name: '商会管事', reliability: 'reliable' }, issuer: '米特尔商会', deadlineDay: 20, reward: '三百金币', failureConsequence: '信誉下降' });
assert.equal(commission.lead.deadlineDay, 20);
assert.equal(commission.lead.failureConsequence, '信誉下降');

const notDue = leads.expire({ ...scope, day: 20 });
assert.equal(notDue.status, 'empty');
const due = leads.expire({ ...scope, day: 21 });
assert.equal(due.status, 'candidate');
assert.equal(due.updates[0].leadId, commission.lead.id);
assert.equal(due.updates[0].toState, 'expired');

const settled = leads.settle({ ...scope, leadId: commission.lead.id, reason: '玩家绕路' });
assert.equal(settled.lead.state, 'closed');
assert.equal(leads.settle({ ...scope, leadId: commission.lead.id }).reason, 'already_settled');
assert.throws(() => leads.settle({ ...scope, leadId: rumor.lead.id, toState: 'weird' }), /结算状态/);

const closed = leads.settle({ ...scope, leadId: rumor.lead.id, toState: 'expired', reason: '传闻过期' });
assert.equal(closed.lead.state, 'expired');

const openOne = leads.add({ ...scope, text: '拍卖会名单', source: { name: '拍卖行', reliability: 'reliable' }, knowledge: 'inferred' });
const openTwo = leads.add({ ...scope, text: '旧药方', source: { name: '药铺', reliability: 'unknown' }, knowledge: 'witnessed' });
const blocked = leads.add({ ...scope, text: '再一条', source: { name: '路人' } });
assert.equal(blocked.status, 'rejected');
assert.equal(blocked.reason, 'lead_limit_reached');
assert.equal(blocked.maxOpen, 2);

assert.equal(leads.list(scope).length, 4);
assert.equal(leads.list({ sessionId: 's1', branchId: 'b2' }).length, 0);
assert.equal(leads.settle({ ...scope, leadId: openOne.lead.id, toState: 'closed' }).status, 'candidate');
assert.equal(leads.settle({ ...scope, leadId: openTwo.lead.id, toState: 'closed' }).status, 'candidate');
assert.throws(() => leads.expire({ ...scope, day: -2 }), /day/);
leads.clear();
assert.equal(leads.list(scope).length, 0);
console.log('sandbox leads tests passed');
