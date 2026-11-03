import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/store.js';
import { makeDocs } from '../src/samples.js';

const NOW = new Date(Date.UTC(2026, 10, 3, 12));
const person = { name: 'Ada Brennan', email: 'ada@example.com', address: '5 Mill Lane, Bath BA1 1AA', commitment: 120_000 };
const store = () => createStore({ now: () => NOW, extractor: 'rules', env: {} });

test('a clean submission is approved automatically', async () => {
  const s = store();
  const inv = s.invite(person);
  await s.submit(inv.token, person, await makeDocs(person, NOW));
  assert.equal(inv.status, 'approved');
  assert.equal(inv.decision.by, 'automatic');
});

test('a failing submission goes to review and waits for a person', async () => {
  const s = store();
  const inv = s.invite(person);
  await s.submit(inv.token, person, await makeDocs({ ...person, billAgeDays: 200 }, NOW));
  assert.equal(inv.status, 'review');
  assert.throws(() => s.decide(inv.id, { decision: 'rejected', note: ' ' }), /needs a note/);
  s.decide(inv.id, { decision: 'approved', by: 'Sam' });
  assert.equal(inv.status, 'approved');
  assert.match(inv.timeline.at(-1).text, /^Approved by Sam/);
});

test('decisions only apply to cases in review', async () => {
  const s = store();
  const inv = s.invite(person);
  assert.throws(() => s.decide(inv.id, { decision: 'approved' }), /cannot decide on a case that is invited/);
  await s.submit(inv.token, person, await makeDocs(person, NOW));
  assert.throws(() => s.decide(inv.id, { decision: 'rejected', note: 'x' }), /cannot decide on a case that is approved/);
});

test('an invite can be used once', async () => {
  const s = store();
  const inv = s.invite(person);
  const docs = await makeDocs(person, NOW);
  await s.submit(inv.token, person, docs);
  await assert.rejects(s.submit(inv.token, person, docs), /already submitted/);
});

test('a submission that fails to read leaves the invite untouched, so the investor can try again', async () => {
  const s = store();
  const inv = s.invite(person);
  const docs = await makeDocs(person, NOW);
  await assert.rejects(s.submit(inv.token, person, { ...docs, address: Buffer.from('not a pdf') }));
  assert.equal(inv.status, 'invited');
  assert.equal(inv.form, null);
  assert.deepEqual(inv.docs, {});
  await s.submit(inv.token, person, docs);
  assert.equal(inv.status, 'approved');
});

test('two submissions racing on one invite: only one is processed', async () => {
  const s = store();
  const inv = s.invite(person);
  const docs = await makeDocs(person, NOW);
  const results = await Promise.allSettled([s.submit(inv.token, person, docs), s.submit(inv.token, person, docs)]);
  assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(inv.timeline.filter((t) => t.text.startsWith('Submitted')).length, 1);
});

test('a submission without the form fields is refused with a clear message, and changes nothing', async () => {
  const s = store();
  const inv = s.invite(person);
  const docs = await makeDocs(person, NOW);
  for (const form of [undefined, {}, { ...person, address: ' ' }, { ...person, commitment: 'abc' }, { ...person, commitment: -5 }])
    await assert.rejects(s.submit(inv.token, form, docs), /form needs a name, an address and a positive commitment/);
  await assert.rejects(s.submit(inv.token, person, null), /files/);
  assert.equal(inv.status, 'invited');
});
