import 'server-only';
import type { TravelOption } from './travel';

// Amadeus flight offers (developers.amadeus.com): airline fares for a route and date. Used when AMADEUS_CLIENT_ID
// and AMADEUS_CLIENT_SECRET are set. AMADEUS_ENV=production uses live fares; otherwise Amadeus's test system, whose
// fares are sample data.

const id = () => (process.env.AMADEUS_CLIENT_ID || '').trim();
const secret = () => (process.env.AMADEUS_CLIENT_SECRET || '').trim();
export const amadeusOn = () => !!(id() && secret());
const host = () => (process.env.AMADEUS_ENV === 'production' ? 'https://api.amadeus.com' : 'https://test.api.amadeus.com');
export const amadeusLive = () => process.env.AMADEUS_ENV === 'production';

let token: { value: string; until: number } | null = null;
async function auth(): Promise<string> {
  if (token && Date.now() < token.until) return token.value;
  const res = await fetch(`${host()}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id(), client_secret: secret() }),
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  const b: any = await res.json().catch(() => ({}));
  if (!res.ok || !b.access_token) throw new Error(`Amadeus sign-in ${res.status}: ${b.error_description || b.error || 'error'}`);
  token = { value: b.access_token, until: Date.now() + (Number(b.expires_in) - 60) * 1000 };
  return token.value;
}

const hhmm = (iso: string) => iso.slice(11, 16);
const dur = (iso: string) => iso.replace(/^PT/, '').replace('H', 'h ').replace('M', 'm').trim();

export async function flightOffers(from: string, to: string, date: string, bookUrl: string): Promise<TravelOption[]> {
  const q = new URLSearchParams({ originLocationCode: from, destinationLocationCode: to, departureDate: date, adults: '1', currencyCode: 'INR', max: '15' });
  const res = await fetch(`${host()}/v2/shopping/flight-offers?${q}`, { headers: { Authorization: `Bearer ${await auth()}` }, signal: AbortSignal.timeout(20_000), cache: 'no-store' });
  const b: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Amadeus ${res.status}: ${b.errors?.[0]?.detail || b.errors?.[0]?.title || 'error'}`);
  const carriers: Record<string, string> = b.dictionaries?.carriers ?? {};
  const seen = new Set<string>();
  return (b.data || [])
    .map((o: any): TravelOption | null => {
      const it = o.itineraries?.[0];
      const segs = it?.segments || [];
      if (!segs.length) return null;
      const first = segs[0];
      const last = segs[segs.length - 1];
      const name = `${carriers[first.carrierCode] ?? first.carrierCode} ${first.carrierCode}${first.number}`.replace(/\b\w+\b/g, (w) => (w.length > 2 && w === w.toUpperCase() && /^[A-Z]+$/.test(w) ? w[0] + w.slice(1).toLowerCase() : w));
      return {
        name,
        detail: segs.length === 1 ? 'Non-stop' : `${segs.length - 1} stop${segs.length > 2 ? 's' : ''} via ${segs.slice(0, -1).map((s: any) => s.arrival.iataCode).join(', ')}`,
        depart: hhmm(first.departure.at),
        arrive: hhmm(last.arrival.at),
        duration: dur(it.duration || ''),
        price: Math.round(Number(o.price?.grandTotal ?? o.price?.total)),
        site: 'Airline fare',
        url: bookUrl,
      };
    })
    .filter((o: TravelOption | null): o is TravelOption => !!o && o.price > 0)
    .filter((o: TravelOption) => (seen.has(o.name + o.depart) ? false : (seen.add(o.name + o.depart), true)))
    .sort((a: TravelOption, b: TravelOption) => a.price - b.price);
}
