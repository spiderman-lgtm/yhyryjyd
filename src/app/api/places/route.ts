import { NextResponse, type NextRequest } from 'next/server';
import { rateLimited } from '@/lib/ext';
import * as gmaps from '@/lib/gmaps';

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
  // Google Maps (what the ride apps use) when its key is set: suggestions, a suggestion's point (?id=), a point's name.
  if (gmaps.googleMapsOn()) {
    const id = (sp.get('id') || '').slice(0, 300);
    try {
      if (id) return NextResponse.json({ places: [await gmaps.place(id)] });
      if (reverse) {
        const p = await gmaps.reverse(lat, lng);
        return NextResponse.json({ places: p ? [p] : [] });
      }
      if (q.length < 2) return NextResponse.json({ places: [] });
      return NextResponse.json({ places: await gmaps.suggest(q, near ? { lat, lng } : null), provider: 'google' });
    } catch (e) {
      console.error('[places] google:', e instanceof Error ? e.message : e);
      // Falls through to OpenStreetMap so the search keeps working.
    }
  }
  if (!reverse && q.length < 2) return NextResponse.json({ places: [] });
  const url = reverse
    ? `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=en`
    : // Near the shopper: a strong pull towards their area (zoom 13 ≈ a city), more results to re-rank below.
      `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=12&lang=en&bbox=68,6,98,37${near ? `&lat=${lat}&lon=${lng}&zoom=13&location_bias_scale=0.1` : ''}`;
  const key = url;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return NextResponse.json(hit.data);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!res.ok) throw new Error(`Photon answered ${res.status}`);
    const body = (await res.json()) as { features?: Feature[] };
    let places = (body.features || []).filter((f) => f.properties.countrycode === 'IN' || !f.properties.countrycode).map(toPlace);
    // Places in the shopper's own city first (within 40 km), nearest first; farther ones after, as they came.
    if (near && !reverse) {
      const km = (p: { lat: number; lng: number }) => Math.hypot((p.lat - lat) * 111, (p.lng - lng) * 111 * Math.cos((lat * Math.PI) / 180));
      const local = places.filter((p) => km(p) <= 40).sort((a, b) => km(a) - km(b));
      places = [...local, ...places.filter((p) => km(p) > 40)].slice(0, 6);
    } else places = places.slice(0, 6);
    const data = { places };
    cache.set(key, { at: Date.now(), data });
    if (cache.size > 3000) cache.delete(cache.keys().next().value!);
    return NextResponse.json(data);
  } catch (e) {
    console.error('[places]', e instanceof Error ? e.message : e);
    return NextResponse.json({ places: [], error: 'Place search is busy — try again in a moment.' });
  }
}
