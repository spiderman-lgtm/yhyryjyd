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
  if (from.length < 2 || to.length < 2) return NextResponse.json({ error: 'Enter where you start and where you are going.' }, { status: 400 });
  try {
    const a = await geocode(from, city);
    if (!a) return NextResponse.json({ error: `Could not find “${from}”${city ? ` in ${city}` : ''}. Try a nearby landmark or area name.` }, { status: 404 });
    const b = await geocode(to, city);
    if (!b) return NextResponse.json({ error: `Could not find “${to}”${city ? ` in ${city}` : ''}. Try a nearby landmark or area name.` }, { status: 404 });
    const trip = await route(a, b);
    if (trip.km > 150) return NextResponse.json({ error: 'These places are more than 150 km apart — check the city.' }, { status: 400 });
    return NextResponse.json({ from: a, to: b, km: Math.round(trip.km * 10) / 10, min: Math.round(trip.min), road: trip.road, ...fares(a, b, trip, city) });
  } catch (e) {
    console.error('[rides]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not look up these places right now. Please try again.' }, { status: 502 });
  }
}
