// ENGINEX server — Node 22+, no npm install. Run: node server.js  ->  http://localhost:3000
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const PORT = process.env.PORT || 3000, DIR = __dirname;
// Payment gateway (optional). Moyasar = Saudi gateway (mada, Visa/Mastercard, Apple Pay).
const MOYASAR_SECRET = process.env.MOYASAR_SECRET || '';
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:' + PORT;
const BANK = {
  name: process.env.BANK_NAME || 'YOUR BANK NAME', account: process.env.BANK_ACCOUNT || 'Account holder / company',
  iban: process.env.BANK_IBAN || 'SA00 0000 0000 0000 0000 0000'
};
const db = new DatabaseSync(path.join(DIR, 'enginex.db'));
db.exec('CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sess(t TEXT PRIMARY KEY, uid TEXT NOT NULL)');
const get = (k, d) => { const r = db.prepare('SELECT v FROM kv WHERE k=?').get(k); return r ? JSON.parse(r.v) : d; };
const set = (k, v) => db.prepare('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, JSON.stringify(v));
const LOCAL = new Set(['session', 'guesttix']);          // per-browser keys, never stored on server
const PRIVATE = new Set(['orders']);                      // only via payment endpoints
const PRICES = { pro: 99, ent: 0 };                       // SAR / month; must match PLANS in index.html
const FEATURE = { boost7: { label: 'Featured ad – 7 days', price: 49 }, boost30: { label: 'Featured ad – 30 days', price: 149 } };

const send = (res, code, obj, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(type === 'application/json' ? JSON.stringify(obj) : obj); };
const body = req => new Promise(r => { let b = ''; req.on('data', c => { b += c; if (b.length > 2e6) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });
const authUser = req => { const t = (req.headers.authorization || '').replace('Bearer ', ''); const s = t && db.prepare('SELECT uid FROM sess WHERE t=?').get(t); return s ? (get('users', []).find(u => u.id === s.uid) || null) : null; };
const strip = users => users.map(({ pass, ...u }) => u);
const MIME = { '.html': 'text/html', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.js': 'text/javascript' };

function activate(order) {                                 // mark paid + apply what was bought
  const o = get('orders', []).find(x => x.id === order.id); if (!o || o.status === 'paid') return;
  o.status = 'paid'; o.paidAt = Date.now(); set('orders', get('orders', []).map(x => x.id === o.id ? o : x));
  if (o.kind === 'plan') set('users', get('users', []).map(u => u.id === o.userId ? { ...u, plan: o.item } : u));
  else if (o.kind === 'boost') set('listings', get('listings', []).map(l => l.id === o.item.split(':')[1] ? { ...l, featuredUntil: Date.now() + (o.item.startsWith('boost30') ? 30 : 7) * 864e5 } : l));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), p = url.pathname;
  try {
    if (p === '/api/state') {
      const out = {}; for (const r of db.prepare('SELECT k,v FROM kv').all()) if (!PRIVATE.has(r.k)) out[r.k] = JSON.parse(r.v);
      if (out.users) out.users = strip(out.users);
      const me = authUser(req); if (me && me.role !== 'admin') out.tickets = (out.tickets || []).filter(t => t.userId === me.id || (t.email || '') === me.email);
      return send(res, 200, { state: out, bank: BANK, gateway: !!MOYASAR_SECRET, prices: PRICES, feature: FEATURE });
    }
    if (p === '/api/login' && req.method === 'POST') {
      const { email, hash } = await body(req); const u = get('users', []).find(x => x.email.toLowerCase() === String(email).toLowerCase());
      if (!u || u.pass !== hash) return send(res, 401, { error: 'bad' });
      const t = crypto.randomBytes(24).toString('hex'); db.prepare('INSERT INTO sess VALUES(?,?)').run(t, u.id); return send(res, 200, { token: t, id: u.id });
    }
    if (p === '/api/register' && req.method === 'POST') {
      const u = (await body(req)).user, us = get('users', []);
      if (!u || us.some(x => x.email.toLowerCase() === String(u.email).toLowerCase())) return send(res, 409, { error: 'exists' });
      u.role = u.role === 'employer' ? 'employer' : 'engineer'; u.plan = 'basic'; set('users', [...us, u]);   // never allow self-made admins/plans
      const t = crypto.randomBytes(24).toString('hex'); db.prepare('INSERT INTO sess VALUES(?,?)').run(t, u.id); return send(res, 200, { token: t, id: u.id });
    }
    if (p.startsWith('/api/kv/') && req.method === 'PUT') {
      const k = decodeURIComponent(p.slice(8)); if (LOCAL.has(k) || PRIVATE.has(k)) return send(res, 400, { error: 'local' });
      const me = authUser(req), v = (await body(req)).v;
      if (k === 'users') {                                  // keep passwords server-side; block role/plan escalation by non-admins
        const old = get('users', []);
        set(k, v.map(n => { const o = old.find(x => x.id === n.id); if (!o) return n; return { ...n, pass: n.pass || o.pass, role: me?.role === 'admin' ? n.role : o.role, plan: me?.role === 'admin' ? n.plan : o.plan }; }));
        // keep old accounts that a stale client did not know about
        const ids = new Set(v.map(x => x.id)); set(k, [...get(k, []), ...old.filter(o => !ids.has(o.id) && me?.role !== 'admin')]);
        return send(res, 200, { ok: 1 });
      }
      if (k === 'listings' && me?.role !== 'admin') {       // clients may not self-grant "featured"
        const old = get('listings', []); v.forEach(l => { const o = old.find(x => x.id === l.id); l.featuredUntil = o?.featuredUntil; });
      }
      set(k, v); return send(res, 200, { ok: 1 });
    }
    if (p === '/api/pay/checkout' && req.method === 'POST') {
      const me = authUser(req); if (!me) return send(res, 401, { error: 'login' });
      const { kind, item, method } = await body(req); let amount, label;
      if (kind === 'plan' && PRICES[item]) { amount = PRICES[item]; label = 'ENGINEX ' + item + ' plan – 1 month'; }
      else if (kind === 'boost' && FEATURE[item.split(':')[0]]) { amount = FEATURE[item.split(':')[0]].price; label = FEATURE[item.split(':')[0]].label; }
      else return send(res, 400, { error: 'item' });
      const order = { id: 'ORD' + Date.now().toString(36).toUpperCase(), userId: me.id, userName: me.name, email: me.email, kind, item, label, amount, method, status: 'pending', created: Date.now() };
      set('orders', [order, ...get('orders', [])]);
      if (method === 'card' && MOYASAR_SECRET) {
        const r = await fetch('https://api.moyasar.com/v1/invoices', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(MOYASAR_SECRET + ':').toString('base64'), 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: amount * 100, currency: 'SAR', description: label, success_url: PUBLIC_URL + '/#/dashboard/billing', callback_url: PUBLIC_URL + '/api/pay/webhook', metadata: { order: order.id } }) });
        const j = await r.json(); if (!j.url) return send(res, 502, { error: 'gateway' });
        return send(res, 200, { order, redirect: j.url });
      }
      return send(res, 200, { order, bank: BANK });          // bank transfer: admin approves after checking the receipt
    }
    if (p === '/api/pay/webhook' && req.method === 'POST') {  // Moyasar callback: re-verify with the gateway, never trust the body
      const b = await body(req), id = b.id || b.data?.id; if (!id || !MOYASAR_SECRET) return send(res, 400, {});
      const r = await fetch('https://api.moyasar.com/v1/invoices/' + id, { headers: { Authorization: 'Basic ' + Buffer.from(MOYASAR_SECRET + ':').toString('base64') } });
      const j = await r.json(); const oid = j.metadata?.order; const o = get('orders', []).find(x => x.id === oid);
      if (j.status === 'paid' && o && j.amount === o.amount * 100) activate(o); return send(res, 200, { ok: 1 });
    }
    if (p === '/api/pay/orders') {
      const me = authUser(req); if (!me) return send(res, 401, {});
      return send(res, 200, get('orders', []).filter(o => me.role === 'admin' || o.userId === me.id));
    }
    if (p === '/api/pay/receipt' && req.method === 'POST') {
      const me = authUser(req), { id, ref } = await body(req); if (!me) return send(res, 401, {});
      set('orders', get('orders', []).map(o => o.id === id && o.userId === me.id ? { ...o, ref: String(ref).slice(0, 80) } : o)); return send(res, 200, { ok: 1 });
    }
    if (p === '/api/pay/decide' && req.method === 'POST') {
      const me = authUser(req); if (!me || me.role !== 'admin') return send(res, 403, {});
      const { id, approve } = await body(req); const o = get('orders', []).find(x => x.id === id); if (!o) return send(res, 404, {});
      if (approve) activate(o); else set('orders', get('orders', []).map(x => x.id === id ? { ...x, status: 'rejected' } : x));
      return send(res, 200, { ok: 1 });
    }
    // static files
    const f = path.join(DIR, p === '/' ? 'index.html' : p); if (!f.startsWith(DIR) || /server\.js|\.db/.test(p) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  } catch (e) { console.error(e); send(res, 500, { error: 'server' }); }
}).listen(PORT, () => console.log('ENGINEX running on http://localhost:' + PORT + (MOYASAR_SECRET ? '  (card payments ON)' : '  (card payments OFF – set MOYASAR_SECRET)')));
