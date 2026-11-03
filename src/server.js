import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createStore } from './store.js';
import { makeDocs, DEMO_INVESTORS } from './samples.js';
import { FUND, REQUIRED_DOCS } from './fund.js';

const store = createStore();
const port = Number(process.env.PORT) || 3000;

// Demo seed: three submitted investors, one open invite.
for (const p of DEMO_INVESTORS) {
  const inv = store.invite(p);
  if (p.submit) await store.submit(inv.token, p, await makeDocs(p));
}

const summary = ({ id, name, email, status, form, checks, timeline }) => ({
  id, name, email, status, commitment: form?.commitment ?? null,
  failed: checks.filter((c) => !c.ok).length, total: checks.length, updated: timeline.at(-1)?.at,
});
const detail = (inv) => ({
  ...summary(inv), link: inv.status === 'invited' ? `/#/form/${inv.token}` : null, form: inv.form, checks: inv.checks, decision: inv.decision, timeline: inv.timeline,
  docs: Object.fromEntries(Object.entries(inv.docs).map(([slot, d]) => [slot, { type: d.type, extractor: d.extractor, fields: d.fields }])),
});

async function json(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}

const routes = [
  ['GET', /^\/$/, async () => [200, await readFile(new URL('../public/index.html', import.meta.url)), 'text/html; charset=utf-8']],
  ['GET', /^\/api\/fund$/, async () => [200, { ...FUND, requiredDocs: REQUIRED_DOCS }]],
  ['GET', /^\/api\/investors$/, async () => [200, store.list().map(summary)]],
  ['GET', /^\/api\/investors\/(\w+)$/, async (_, [id]) => {
    const inv = store.get(id);
    return inv ? [200, detail(inv)] : [404, { error: 'not found' }];
  }],
  ['POST', /^\/api\/investors\/(\w+)\/decision$/, async (req, [id]) => [200, detail(store.decide(id, await json(req)))]],
  ['POST', /^\/api\/invites$/, async (req) => {
    const inv = store.invite(await json(req));
    return [200, { id: inv.id, link: `/#/form/${inv.token}` }];
  }],
  ['GET', /^\/api\/form\/([\w-]+)$/, async (_, [token]) => {
    const inv = store.byToken(token);
    return inv ? [200, { name: inv.name, email: inv.email, status: inv.status, fund: FUND.name }] : [404, { error: 'unknown invite' }];
  }],
  // Sample documents for the person invited, so the form can be tried without real files.
  ['GET', /^\/api\/form\/([\w-]+)\/sample$/, async (_, [token]) => {
    const inv = store.byToken(token);
    if (!inv) return [404, { error: 'unknown invite' }];
    const p = DEMO_INVESTORS.find((d) => d.name === inv.name) ?? { name: inv.name, email: inv.email, address: '21 Station Road, York YO1 6HT', commitment: 100_000 };
    const docs = await makeDocs(p);
    const files = Object.fromEntries(Object.entries(docs).map(([slot, b]) => [slot, b.toString('base64')]));
    return [200, { form: { name: p.name, email: p.email, address: p.address, commitment: p.commitment }, files }];
  }],
  ['POST', /^\/api\/form\/([\w-]+)$/, async (req, [token]) => {
    const { form, files } = await json(req);
    const buffers = Object.fromEntries(Object.entries(files ?? {}).map(([slot, b64]) => [slot, Buffer.from(b64, 'base64')]));
    const inv = await store.submit(token, form, buffers);
    return [200, { status: inv.status }];
  }],
];

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  try {
    for (const [method, re, handler] of routes) {
      const m = req.method === method && path.match(re);
      if (!m) continue;
      const [status, body, type = 'application/json'] = await handler(req, m.slice(1));
      res.writeHead(status, { 'content-type': type });
      return res.end(type === 'application/json' ? JSON.stringify(body) : body);
    }
    res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found"}');
  } catch (err) {
    res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: err.message }));
  }
}).listen(port, () => console.log(`investor-onboarding running at http://localhost:${port}`));
