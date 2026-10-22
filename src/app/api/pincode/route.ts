import { NextResponse, type NextRequest } from 'next/server';
import { isPin } from '@/lib/compare';
import { secureCookies } from '@/lib/config';

export const dynamic = 'force-dynamic';

const areas = new Map<string, string | null>();

// India Post's public directory names the area for a pincode; without it the pincode alone still works.
async function areaFor(pin: string): Promise<string | null> {
  if (areas.has(pin)) return areas.get(pin)!;
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, { signal: AbortSignal.timeout(4000), cache: 'no-store' });
    const data = await res.json();
    const po = data?.[0]?.PostOffice?.[0];
    if (data?.[0]?.Status === 'Error') return null;
    const area = po ? [po.District || po.Block, po.State].filter(Boolean).join(', ') : null;
    if (areas.size > 5000) areas.clear();
    areas.set(pin, area);
    return area;
  } catch {
    return null;
  }
}

const points = new Map<string, string | null>();

// Map position of a pincode from OpenStreetMap's public geocoder, for quick-commerce stores that locate
// by latitude and longitude. Looked up once per pincode (a shopper setting their location), then cached.
async function pointFor(pin: string): Promise<string | null> {
  if (points.has(pin)) return points.get(pin)!;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?postalcode=${pin}&country=in&format=json&limit=1`, {
      headers: { 'User-Agent': 'DealRadar/1.0 (https://dealradar.embarko.app)' },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    const hit = (await res.json())?.[0];
    const point = hit ? `${Number(hit.lat).toFixed(5)},${Number(hit.lon).toFixed(5)}` : null;
    if (points.size > 5000) points.clear();
    points.set(pin, point);
    return point;
  } catch {
    return null;
  }
}

const cookie = { sameSite: 'lax' as const, path: '/', maxAge: 60 * 60 * 24 * 365 };
const asPoint = (p: string | null | undefined) => {
  const [lat, lng] = (p || '').split(',').map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat && lng ? { lat, lng } : { lat: null, lng: null };
};

// The saved delivery location, for the browser extension.
export async function GET(req: NextRequest) {
  const pin = req.cookies.get('dr_pin')?.value ?? null;
  if (!isPin(pin)) return NextResponse.json({ pin: null, area: null, lat: null, lng: null });
  let point = req.cookies.get('dr_geo')?.value ?? null;
  const fresh = !point;
  if (fresh) point = await pointFor(pin);
  const res = NextResponse.json({ pin, area: req.cookies.get('dr_area')?.value || null, ...asPoint(point) });
  if (fresh && point) res.cookies.set('dr_geo', point, { ...cookie, secure: secureCookies() });
  return res;
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const pin = String(b.pin ?? '').trim();
  if (!isPin(pin)) return NextResponse.json({ error: 'Enter a 6-digit Indian pincode.' }, { status: 400 });
  const [area, point] = await Promise.all([areaFor(pin), pointFor(pin)]);
  const res = NextResponse.json({ pin, area, ...asPoint(point) });
  res.cookies.set('dr_pin', pin, { ...cookie, secure: secureCookies() });
  res.cookies.set('dr_area', area ?? '', { ...cookie, secure: secureCookies() });
  if (point) res.cookies.set('dr_geo', point, { ...cookie, secure: secureCookies() });
  else res.cookies.delete('dr_geo');
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete('dr_pin');
  res.cookies.delete('dr_area');
  res.cookies.delete('dr_geo');
  return res;
}
