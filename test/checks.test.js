import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processPdf } from 'doc-trace';
import { runChecks } from '../src/checks.js';
import { SCHEMAS_ONBOARDING } from '../src/fund.js';
import { makeDocs } from '../src/samples.js';

const NOW = new Date(Date.UTC(2026, 10, 3, 12));
const BASE = { name: 'Ada Brennan', email: 'ada@example.com', address: '5 Mill Lane, Bath BA1 1AA', commitment: 120_000 };

// Generates the investor's documents (optionally made wrong), reads them with doc-trace, runs the checks.
async function check(person, form = BASE) {
  const files = await makeDocs({ ...BASE, ...person }, NOW);
  const docs = {};
  for (const [slot, bytes] of Object.entries(files)) {
    if (person.drop === slot) continue;
    docs[slot] = await processPdf(bytes, { schemas: SCHEMAS_ONBOARDING, extractor: 'rules', env: {} });
  }
  const checks = runChecks(form, docs, NOW);
  return { checks, failed: checks.filter((c) => !c.ok).map((c) => `${c.slot}: ${c.name}`) };
}

test('a clean application passes every check, each with its quote', async () => {
  const { checks, failed } = await check({});
  assert.deepEqual(failed, []);
  assert.equal(checks.length, 12);
  const named = checks.filter((c) => c.name !== 'No field contradicts the document');
  assert.ok(named.every((c) => c.evidence.length > 0), 'every rule cites the document');
});

test('an expired passport fails only the validity check', async () => {
  const { failed, checks } = await check({ idExpiresInDays: -1 });
  assert.deepEqual(failed, ['id: Document is valid today']);
  assert.match(checks.find((c) => c.name === 'Document is valid today').detail, /^expired on /);
});

test('proof of address older than 90 days fails; 90 days exactly passes', async () => {
  assert.deepEqual((await check({ billAgeDays: 91 })).failed, ['address: Issued in the last 90 days']);
  assert.deepEqual((await check({ billAgeDays: 90 })).failed, []);
});

test('an address that differs from the form fails', async () => {
  assert.deepEqual((await check({ address: '9 Other Street, Bath BA2 2BB' })).failed, ['address: Address matches the form']);
});

test('an unsigned agreement fails because the signature cannot be read', async () => {
  const { failed, checks } = await check({ unsigned: true });
  assert.deepEqual(failed, ['subscription: Signed and dated by the investor']);
  assert.match(checks.find((c) => c.name === 'Signed and dated by the investor').detail, /can't read Signed by/);
});

test('a commitment below the minimum fails, even when the form agrees', async () => {
  const { failed } = await check({ commitment: 50_000 }, { ...BASE, commitment: 50_000 });
  assert.deepEqual(failed, ['subscription: Commitment meets the minimum']);
});

test('an agreement signed for a different amount than the form fails', async () => {
  assert.deepEqual((await check({ signedCommitment: 200_000 })).failed, ['subscription: Commitment matches the form']);
});

test('a document for someone else fails the name checks', async () => {
  const { failed } = await check({ billName: 'Ada Brenan', subscriptionName: 'A. Brennan' });
  assert.deepEqual(failed, ['address: Name matches the form', 'subscription: Investor matches the form']);
});

test('a missing document fails as not uploaded', async () => {
  assert.deepEqual((await check({ drop: 'address' })).failed, ['address: Proof of address received']);
});

test('the wrong document in a slot fails the type check', async () => {
  const files = await makeDocs(BASE, NOW);
  const read = (b) => processPdf(b, { schemas: SCHEMAS_ONBOARDING, extractor: 'rules', env: {} });
  const docs = { id: await read(files.address), address: await read(files.address), subscription: await read(files.subscription) };
  const failed = runChecks(BASE, docs, NOW).filter((c) => !c.ok);
  assert.deepEqual(failed.map((c) => [c.slot, c.name, c.detail]), [['id', 'Right type of document', 'this is the proof of address, not the passport or ID card']]);
});
