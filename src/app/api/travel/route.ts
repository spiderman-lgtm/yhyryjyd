import { NextResponse, type NextRequest } from 'next/server';
import { CITIES, findCity, liveFares, ownOffers, sites, withCoupons, type Mode } from '@/lib/travel';
import { rateLimited } from '@/lib/ext';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get('cities')) return NextResponse.json({ cities: CITIES });
  const limited = rateLimited(req, 60);
  if (limited) return limited;
  const mode = sp.get('mode') as Mode;
  if (!['bus', 'train', 'flight'].includes(mode)) return NextResponse.json({ error: 'Choose bus, train or flight.' }, { status: 400 });
  const from = findCity(sp.get('from') || '');
  const to = findCity(sp.get('to') || '');
  if (!from || !to) return NextResponse.json({ error: 'Pick both cities from the list.' }, { status: 400 });
  if (from === to) return NextResponse.json({ error: 'From and To are the same city.' }, { status: 400 });
  if (mode === 'flight' && (!from.air || !to.air)) return NextResponse.json({ error: `${!from.air ? from.name : to.name} has no airport in our list — try a nearby city.` }, { status: 400 });
  if (mode === 'train' && (!from.rail || !to.rail)) return NextResponse.json({ error: `${!from.rail ? from.name : to.name} has no station in our list — try a nearby city.` }, { status: 400 });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('date') || '') ? sp.get('date')! : new Date(Date.now() + 86400_000 + 5.5 * 3600_000).toISOString().slice(0, 10);
  const links = sites(mode, from, to, date);
  // Coupons the owner added for these sites are always shown; the web search adds what it finds.
  const own = ownOffers(links.map((l) => l.name));
  try {
    const live = await liveFares(mode, from, to, date);
    const offers = [...own, ...live.offers.filter((w) => !own.some((o) => o.code && o.code === w.code))];
    return NextResponse.json({ from, to, date, links, offers, options: withCoupons(live.options, offers) });
  } catch (e) {
    console.error('[travel]', e instanceof Error ? e.message : e);
    return NextResponse.json({ from, to, date, links, offers: own, options: [], note: 'Live fares could not be fetched right now — compare on each site below.' });
  }
}
