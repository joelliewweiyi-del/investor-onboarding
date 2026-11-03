// The onboarding rules. Each check returns the quotes it relied on, so a reviewer can see why.
// A check that needs a field doc-trace could not trace fails: unreadable never counts as passed.
import { FUND, REQUIRED_DOCS } from './fund.js';
import { daysBetween, parseDate } from './dates.js';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const amountOf = (s) => Number(String(s ?? '').replace(/[^\d.]/g, '')) || null;

// form: { name, address, commitment }. docs: { [slot]: doc-trace result }. now: Date.
export function runChecks(form, docs, now = new Date()) {
  const checks = [];

  for (const { slot, label } of REQUIRED_DOCS) {
    const doc = docs[slot];
    const add = (name, ok, detail, keys = []) => {
      const evidence = keys.map((k) => doc.fields.find((f) => f.key === k)).filter((f) => f?.status === 'traced')
        .map((f) => ({ page: f.page, quote: f.quote }));
      checks.push({ slot, name, ok, detail, evidence });
    };
    if (!doc) { checks.push({ slot, name: `${label} received`, ok: false, detail: 'not uploaded', evidence: [] }); continue; }
    if (doc.type !== slot) {
      const got = REQUIRED_DOCS.find((d) => d.slot === doc.type)?.label;
      const lc = (t) => t[0].toLowerCase() + t.slice(1);
      add('Right type of document', false, got ? `this is the ${lc(got)}, not the ${lc(label)}` : 'document type not recognised');
      continue;
    }
    const rejected = doc.fields.filter((f) => f.status === 'rejected');
    const traced = doc.fields.filter((f) => f.status === 'traced').length;
    add('No field contradicts the document', rejected.length === 0,
      rejected.length ? rejected.map((f) => `${f.label}: ${f.reason}`).join('; ') : `${traced} of ${doc.fields.length} fields traced`);

    // Field value if traced, else null. Every rule below fails when a field it needs is null.
    const v = (key) => doc.fields.find((f) => f.key === key && f.status === 'traced')?.value ?? null;
    const need = (...keys) => {
      const gone = keys.filter((k) => v(k) == null).map((k) => doc.fields.find((f) => f.key === k)?.label ?? k);
      return gone.length ? `can't read ${gone.join(', ')} from the document` : null;
    };
    const nameMatch = (key, docName) => need(key) ??
      (norm(docName) === norm(form.name) ? null : `"${docName}" does not match "${form.name}"`);

    if (slot === 'id') {
      const full = `${v('givenNames') ?? ''} ${v('surname') ?? ''}`;
      const nameErr = need('givenNames', 'surname') ?? (norm(full) === norm(form.name) ? null : `"${full.trim()}" does not match "${form.name}"`);
      add('Name matches the form', !nameErr, nameErr ?? full.trim(), ['givenNames', 'surname']);
      const expiry = parseDate(v('expiry'));
      const expErr = need('expiry') ?? (!expiry ? `can't read the date "${v('expiry')}"` : expiry <= now ? `expired on ${v('expiry')}` : null);
      add('Document is valid today', !expErr, expErr ?? `valid until ${v('expiry')}`, ['expiry']);
    }

    if (slot === 'address') {
      const nameErr = nameMatch('holder', v('holder'));
      add('Name matches the form', !nameErr, nameErr ?? v('holder'), ['holder']);
      const addrErr = need('address') ?? (norm(v('address')) === norm(form.address) ? null : `"${v('address')}" does not match "${form.address}"`);
      add('Address matches the form', !addrErr, addrErr ?? v('address'), ['address']);
      const issued = parseDate(v('issued'));
      const age = issued && daysBetween(issued, now);
      const ageErr = need('issued') ?? (!issued ? `can't read the date "${v('issued')}"` :
        age < 0 ? 'issue date is in the future' :
        age > FUND.addressProofMaxAgeDays ? `${age} days old, the limit is ${FUND.addressProofMaxAgeDays}` : null);
      add(`Issued in the last ${FUND.addressProofMaxAgeDays} days`, !ageErr, ageErr ?? `${age} days old`, ['issued']);
    }

    if (slot === 'subscription') {
      const nameErr = nameMatch('investor', v('investor'));
      add('Investor matches the form', !nameErr, nameErr ?? v('investor'), ['investor']);
      const amount = amountOf(v('commitment'));
      const amtErr = need('commitment') ?? (amount !== Number(form.commitment) ? `${v('commitment')} on the agreement, ${FUND.currency} ${Number(form.commitment).toLocaleString('en-GB')} on the form` : null);
      add('Commitment matches the form', !amtErr, amtErr ?? v('commitment'), ['commitment']);
      const minErr = need('commitment') ?? (amount < FUND.minimumCommitment ? `below the minimum of ${FUND.currency} ${FUND.minimumCommitment.toLocaleString('en-GB')}` : null);
      add('Commitment meets the minimum', !minErr, minErr ?? `minimum ${FUND.currency} ${FUND.minimumCommitment.toLocaleString('en-GB')}`, ['commitment']);
      const signErr = need('signedBy', 'signedOn') ?? (norm(v('signedBy')) === norm(form.name) ? null : `signed by "${v('signedBy')}"`);
      add('Signed and dated by the investor', !signErr, signErr ?? `${v('signedBy')}, ${v('signedOn')}`, ['signedBy', 'signedOn']);
    }
  }
  return checks;
}
