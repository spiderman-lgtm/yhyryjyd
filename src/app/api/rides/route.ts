import { NextResponse, type NextRequest } from 'next/server';
import { fares, geocode, route } from '@/lib/rides';
import { rateLimited } from '@/lib/ext';

export const dynamic = 'force-dynamic';

const clean = (v: string | null, n = 120) => (v || '').replace(/\s+/g, ' ').trim().slice(0, n);

export async function GET(req: NextRequest) {
  const limited = rateLimited(req, 60);
  if (limited) return limited;
  const sp = req.nextUrl.searchParams;
  const from = clean(sp.get('from'));
  const to = clean(sp.get('to'));
  const city = clean(sp.get('city'), 60);
  // A point picked on the map (or from the suggestions) comes with its coordinates; typed text is looked up.
  const point = (k: 'from' | 'to', name: string) => {
    const lat = Number(sp.get(`${k}_lat`));
    const lng = Number(sp.get(`${k}_lng`));
    return lat >= 6 && lat <= 37 && lng >= 68 && lng <= 98 ? { name: name || 'Pinned location', lat, lng } : null;
  };
  if (from.length < 2 && !point('from', from)) return NextResponse.json({ error: 'Choose where you start.' }, { status: 400 });
  if (to.length < 2 && !point('to', to)) return NextResponse.json({ error: 'Choose where you are going.' }, { status: 400 });
  try {
    const a = point('from', from) ?? (await geocode(from, city));
    if (!a) return NextResponse.json({ error: `Could not find “${from}”. Pick it from the suggestions or drop the pin on the map.` }, { status: 404 });
    const b = point('to', to) ?? (await geocode(to, city));
    if (!b) return NextResponse.json({ error: `Could not find “${to}”. Pick it from the suggestions or drop the pin on the map.` }, { status: 404 });
    const trip = await route(a, b);
    if (trip.km < 0.3) return NextResponse.json({ error: 'Start and destination are the same place.' }, { status: 400 });
    if (trip.km > 150) return NextResponse.json({ error: 'These places are more than 150 km apart — check the city.' }, { status: 400 });
    return NextResponse.json({ from: a, to: b, km: Math.round(trip.km * 10) / 10, min: Math.round(trip.min), road: trip.road, line: trip.line ?? [], ...fares(a, b, trip, city) });
  } catch (e) {
    console.error('[rides]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not look up these places right now. Please try again.' }, { status: 502 });
  }
}
