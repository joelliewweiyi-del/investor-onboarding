// Synthetic investor documents, dated relative to `now` so the demo never goes stale.
// Every name, address and number here is made up.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { FUND } from './fund.js';
import { addDays, formatDate } from './dates.js';

async function pdf(lines) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  lines.forEach((line, i) => page.drawText(line, { x: 56, y: 780 - i * 20, size: 11, font }));
  return Buffer.from(await doc.save());
}

const money = (n) => `${FUND.currency} ${n.toLocaleString('en-GB')}`;

// `p` is the investor as the documents describe them. Overrides make a document wrong on purpose.
export async function makeDocs(p, now = new Date()) {
  const [given, ...rest] = p.name.split(' ');
  const surname = rest.pop();
  const givenNames = [given, ...rest].join(' ');
  return {
    id: await pdf([
      'IDENTITY DOCUMENT (SPECIMEN, NOT VALID)',
      '',
      'Document type: Passport',
      `Document number: ${p.docNumber ?? 'P' + String(p.name.length * 7919).padStart(7, '0')}`,
      `Surname: ${surname}`,
      `Given names: ${givenNames}`,
      `Date of birth: ${p.birthDate ?? '4 May 1979'}`,
      `Date of expiry: ${formatDate(addDays(now, p.idExpiresInDays ?? 1500))}`,
    ]),
    address: await pdf([
      'UTILITY BILL',
      '',
      'Riverside Energy Ltd',
      `Account holder: ${p.billName ?? p.name}`,
      `Address: ${p.address}`,
      `Issue date: ${formatDate(addDays(now, -(p.billAgeDays ?? 20)))}`,
      '',
      'Amount due: GBP 84.12',
    ]),
    subscription: await pdf([
      'SUBSCRIPTION AGREEMENT',
      '',
      `Fund: ${FUND.name}`,
      `Investor: ${p.subscriptionName ?? p.name}`,
      `Commitment: ${money(p.signedCommitment ?? p.commitment)}`,
      '',
      'The investor confirms they have read the offering memorandum.',
      '',
      `Signed by the investor: ${p.unsigned ? '' : p.name}`,
      `Date signed: ${p.unsigned ? '' : formatDate(addDays(now, -3))}`,
    ]),
  };
}

// The demo investors. Each one shows a different path through the checks.
export const DEMO_INVESTORS = [
  { name: 'Daniel Osei', email: 'daniel@example.com', address: '14 Rosewood Lane, Bristol BS8 4QT', commitment: 250_000, submit: true },
  { name: 'Priya Raman', email: 'priya@example.com', address: '3 Elm Court, Leeds LS6 2AB', commitment: 150_000, billAgeDays: 160, submit: true },
  { name: 'Tomasz Nowak', email: 'tomasz@example.com', address: '88 Harbour Road, Cardiff CF10 5BZ', commitment: 500_000, idExpiresInDays: -45, unsigned: true, submit: true },
  { name: 'Sofia Marchetti', email: 'sofia@example.com', address: '7 Queen Street, Edinburgh EH2 1JE', commitment: 200_000, submit: false },
];
