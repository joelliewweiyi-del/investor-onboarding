// In-memory onboarding state. Restarting the server resets it to the demo seed.
import { randomUUID } from 'node:crypto';
import { processPdf } from 'doc-trace';
import { SCHEMAS_ONBOARDING } from './fund.js';
import { runChecks } from './checks.js';

export function createStore({ now = () => new Date(), extractor = 'auto', env = process.env } = {}) {
  const investors = new Map();

  const log = (inv, text) => inv.timeline.push({ at: now().toISOString(), text });

  function invite({ name, email }) {
    if (!name || !email) throw new Error('name and email are required');
    const inv = { id: randomUUID().slice(0, 8), token: randomUUID(), name, email, status: 'invited', timeline: [], form: null, docs: {}, checks: [], decision: null };
    log(inv, `Invited ${email}`);
    investors.set(inv.id, inv);
    return inv;
  }

  // files: { [slot]: Buffer }. Runs every document through doc-trace, then the onboarding checks.
  async function submit(token, form, files) {
    const inv = [...investors.values()].find((i) => i.token === token);
    if (!inv) throw new Error('unknown invite');
    if (inv.status !== 'invited' || inv.submitting) throw new Error('already submitted');
    const ok = (v) => typeof v === 'string' && v.trim() !== '';
    if (!form || !ok(form.name) || !ok(form.address) || !(Number(form.commitment) > 0))
      throw new Error('the form needs a name, an address and a positive commitment');
    if (!files || typeof files !== 'object') throw new Error('files must be an object of documents by slot');
    // Read everything first; the case changes only when every document was read.
    inv.submitting = true;
    let docs;
    try {
      docs = {};
      for (const [slot, bytes] of Object.entries(files)) {
        docs[slot] = await processPdf(bytes, { schemas: SCHEMAS_ONBOARDING, extractor, env });
      }
    } finally {
      inv.submitting = false;
    }
    inv.form = { name: form.name, email: form.email, address: form.address, commitment: Number(form.commitment) };
    inv.docs = docs;
    inv.checks = runChecks(inv.form, inv.docs, now());
    const failed = inv.checks.filter((c) => !c.ok);
    log(inv, `Submitted form and ${Object.keys(files).length} documents`);
    if (failed.length === 0) {
      inv.status = 'approved';
      inv.decision = { by: 'automatic', note: `all ${inv.checks.length} checks passed` };
      log(inv, `Approved automatically: all ${inv.checks.length} checks passed`);
    } else {
      inv.status = 'review';
      log(inv, `Sent to review: ${failed.length} of ${inv.checks.length} checks failed`);
    }
    return inv;
  }

  // Only a case in review takes a human decision. A rejection needs a note for the investor.
  function decide(id, { decision, note, by }) {
    const inv = investors.get(id);
    if (!inv) throw new Error('unknown investor');
    if (inv.status !== 'review') throw new Error(`cannot decide on a case that is ${inv.status}`);
    if (!['approved', 'rejected'].includes(decision)) throw new Error('decision must be approved or rejected');
    if (decision === 'rejected' && !note?.trim()) throw new Error('a rejection needs a note');
    inv.status = decision;
    inv.decision = { by: by || 'reviewer', note: note?.trim() || '' };
    log(inv, `${decision === 'approved' ? 'Approved' : 'Rejected'} by ${inv.decision.by}${inv.decision.note ? `: ${inv.decision.note}` : ''}`);
    return inv;
  }

  return {
    invite, submit, decide,
    list: () => [...investors.values()],
    get: (id) => investors.get(id),
    byToken: (token) => [...investors.values()].find((i) => i.token === token),
  };
}
