// The (made-up) fund this onboarding is for, and the document types it asks for.
import { SCHEMAS } from 'doc-trace';

export const FUND = {
  name: 'Harbourline Property Fund I',
  currency: 'GBP',
  minimumCommitment: 100_000,
  addressProofMaxAgeDays: 90,
};

const amount = /(GBP \d{1,3}(?:,\d{3})*(?:\.\d+)?)/;

export const SCHEMAS_ONBOARDING = {
  id: SCHEMAS.id,
  address: {
    detect: /\b(utility bill|bank statement|council tax)\b/i,
    fields: [
      { key: 'holder', label: 'Account holder', pattern: /^Account holder: (.+)$/ },
      { key: 'address', label: 'Address', pattern: /^Address: (.+)$/ },
      { key: 'issued', label: 'Issue date', pattern: /^Issue date: (.+)$/ },
    ],
  },
  subscription: {
    detect: /\bsubscription agreement\b/i,
    fields: [
      { key: 'investor', label: 'Investor', pattern: /^Investor: (.+)$/ },
      { key: 'commitment', label: 'Commitment', pattern: new RegExp('^Commitment: ' + amount.source + '$') },
      { key: 'signedBy', label: 'Signed by', pattern: /^Signed by the investor: ([A-Za-z].*)$/ },
      { key: 'signedOn', label: 'Signed on', pattern: /^Date signed: (\d.*)$/ },
    ],
  },
};

export const REQUIRED_DOCS = [
  { slot: 'id', label: 'Passport or ID card' },
  { slot: 'address', label: 'Proof of address' },
  { slot: 'subscription', label: 'Signed subscription agreement' },
];
