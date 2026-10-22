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

// The pincode at a map position, for "Use my current location".
async function pinAt(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`, {
      headers: { 'User-Agent': 'DealRadar/1.0 (https://dealradar.embarko.app)' },
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    });
    const code = String((await res.json())?.address?.postcode ?? '').replace(/\s/g, '');
    return isPin(code) ? code : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  let pin = String(b.pin ?? '').trim();
  let here: string | null = null;
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!pin && Number.isFinite(lat) && Number.isFinite(lng)) {
    if (lat < 6 || lat > 37.5 || lng < 68 || lng > 97.5) return NextResponse.json({ error: 'That location is outside India.' }, { status: 400 });
    pin = (await pinAt(lat, lng)) ?? '';
    if (!pin) return NextResponse.json({ error: 'Could not find the pincode for your location. Type it instead.' }, { status: 422 });
    here = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  }
  if (!isPin(pin)) return NextResponse.json({ error: 'Enter a 6-digit Indian pincode.' }, { status: 400 });
  const [area, found] = await Promise.all([areaFor(pin), here ? Promise.resolve(null) : pointFor(pin)]);
  // The shopper's exact position is more precise than the pincode's centre, for stores that locate by it.
  const point = here ?? found;
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
