import { NextResponse } from 'next/server';
import { read } from '@/lib/db';
import { STORE_DOMAINS, hostOf } from '@/lib/stores';

export const dynamic = 'force-dynamic';

const cache = new Map<string, { body: ArrayBuffer; type: string } | null>();

// Only stores DealRadar shows, so this cannot be used to fetch arbitrary sites.
function allowed(domain: string) {
  if (Object.values(STORE_DOMAINS).includes(domain)) return true;
  return read((d) => Object.values(d.store_coupons).some((c) => hostOf(c.url) === domain));
}

async function fetchIcon(host: string) {
  const res = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
  if (!res.ok) return null;
  return { body: await res.arrayBuffer(), type: res.headers.get('content-type') || 'image/png' };
}

// A store's own logo (its site icon), fetched once and cached.
export async function GET(_: Request, { params }: { params: { domain: string } }) {
  const domain = params.domain.toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) || !allowed(domain)) return new NextResponse(null, { status: 404 });
  if (!cache.has(domain)) {
    // Some sites only give a full-size icon on their www address; keep the bigger one.
    const found = (await Promise.all([fetchIcon(domain), fetchIcon(`www.${domain}`)].map((p) => p.catch(() => null)))).filter((x) => !!x);
    const best = found.sort((a, b) => b.body.byteLength - a.body.byteLength)[0] ?? null;
    if (cache.size > 300) cache.clear();
    cache.set(domain, best && best.body.byteLength > 100 ? best : null);
  }
  const icon = cache.get(domain);
  if (!icon) return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=3600' } });
  return new NextResponse(icon.body, { headers: { 'Content-Type': icon.type, 'Cache-Control': 'public, max-age=604800, immutable' } });
}
