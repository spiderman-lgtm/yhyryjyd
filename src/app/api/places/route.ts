import { NextResponse, type NextRequest } from 'next/server';
import { rateLimited } from '@/lib/ext';

export const dynamic = 'force-dynamic';

// Place suggestions while the shopper types a pickup or drop (and the name of a point dropped on the map), from
// Photon, OpenStreetMap's type-ahead search. Results are limited to India and lean towards the shopper's area.
const UA = 'DealRadar/1.0 (ride fare compare; https://dealradar.embarko.app)';
const cache = new Map<string, { at: number; data: unknown }>();

type Feature = { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> };
const toPlace = (f: Feature) => {
  const p = f.properties;
  const area = [p.district || p.locality || p.suburb, p.city || p.county, p.state].filter((x, i, a) => x && a.indexOf(x) === i && x !== p.name);
  return { name: p.name || p.street || area[0] || 'Pinned location', area: area.join(', '), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
};

export async function GET(req: NextRequest) {
  const limited = rateLimited(req, 600);
  if (limited) return limited;
  const sp = req.nextUrl.searchParams;
  const q = (sp.get('q') || '').trim().slice(0, 100);
  const lat = Number(sp.get('lat'));
  const lng = Number(sp.get('lng'));
  const near = lat >= 6 && lat <= 37 && lng >= 68 && lng <= 98;
  const reverse = !q && near;
  if (!reverse && q.length < 2) return NextResponse.json({ places: [] });
  const url = reverse
    ? `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=en`
    : `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en&bbox=68,6,98,37${near ? `&lat=${lat}&lon=${lng}` : ''}`;
  const key = url;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return NextResponse.json(hit.data);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!res.ok) throw new Error(`Photon answered ${res.status}`);
    const body = (await res.json()) as { features?: Feature[] };
    const places = (body.features || []).filter((f) => f.properties.countrycode === 'IN' || !f.properties.countrycode).map(toPlace);
    const data = { places };
    cache.set(key, { at: Date.now(), data });
    if (cache.size > 3000) cache.delete(cache.keys().next().value!);
    return NextResponse.json(data);
  } catch (e) {
    console.error('[places]', e instanceof Error ? e.message : e);
    return NextResponse.json({ places: [], error: 'Place search is busy — try again in a moment.' });
  }
}
