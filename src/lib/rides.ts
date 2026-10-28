import 'server-only';

// Ride fares across Rapido, Ola, Uber, Namma Yatri and inDrive for a trip. None of them publishes live fares, so
// the fare is estimated from the trip's road distance and time with each service's published rate card; the
// shopper opens the app (with the trip filled in where the app allows) to see the exact price and book.

export interface Place {
  name: string;
  lat: number;
  lng: number;
}

export interface RideFare {
  app: 'Rapido' | 'Ola' | 'Uber' | 'Namma Yatri' | 'inDrive';
  domain: string;
  kind: 'Bike' | 'Auto' | 'Cab' | 'Cab XL';
  label: string;
  low: number;
  high: number;
  note?: string;
  link: string;
}

const UA = 'DealRadar/1.0 (price comparison; https://dealradar.embarko.app)';
const geoCache = new Map<string, Place | null>();
let lastGeo = 0;

// OpenStreetMap's place search; it asks for at most one request a second, so calls queue up behind each other.
export async function geocode(text: string, city: string): Promise<Place | null> {
  const q = [text.trim(), city.trim()].filter(Boolean).join(', ');
  const key = q.toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key)!;
  const wait = lastGeo + 1100 - Date.now();
  lastGeo = Math.max(Date.now(), lastGeo + 1100);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
  if (!res.ok) throw new Error(`Place search answered ${res.status}`);
  const hit = ((await res.json()) as { display_name: string; lat: string; lon: string }[])[0];
  const place = hit ? { name: hit.display_name.split(',').slice(0, 3).join(',').trim(), lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  geoCache.set(key, place);
  if (geoCache.size > 2000) geoCache.delete(geoCache.keys().next().value!);
  return place;
}

function straightKm(a: Place, b: Place) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Road distance and time from the OSRM route service; a straight line × 1.35 at city speed if it can't answer.
export async function route(a: Place, b: Place): Promise<{ km: number; min: number; road: boolean }> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`;
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
    const r = (await res.json()) as { routes?: { distance: number; duration: number }[] };
    const best = r.routes?.[0];
    // OSRM's car times assume empty roads; Indian city traffic is about 1.6× slower.
    if (best) return { km: best.distance / 1000, min: (best.duration / 60) * 1.6, road: true };
  } catch {}
  const km = straightKm(a, b) * 1.35;
  return { km, min: (km / 20) * 60, road: false };
}

// Published rate cards (base fare, per km, per minute, minimum), typical across cities.
type Card = { app: RideFare['app']; domain: string; kind: RideFare['kind']; label: string; base: number; km: number; min: number; floor: number; note?: string };
const CARDS: Card[] = [
  { app: 'Rapido', domain: 'rapido.bike', kind: 'Bike', label: 'Bike Taxi', base: 20, km: 5, min: 0.5, floor: 25 },
  { app: 'Rapido', domain: 'rapido.bike', kind: 'Auto', label: 'Auto', base: 25, km: 11, min: 1, floor: 30 },
  { app: 'Rapido', domain: 'rapido.bike', kind: 'Cab', label: 'Cab Economy', base: 50, km: 13, min: 1.5, floor: 80 },
  { app: 'Ola', domain: 'olacabs.com', kind: 'Bike', label: 'Bike', base: 20, km: 6, min: 0.5, floor: 30 },
  { app: 'Ola', domain: 'olacabs.com', kind: 'Auto', label: 'Auto', base: 30, km: 13, min: 1, floor: 35 },
  { app: 'Ola', domain: 'olacabs.com', kind: 'Cab', label: 'Mini', base: 60, km: 14, min: 1.5, floor: 90 },
  { app: 'Ola', domain: 'olacabs.com', kind: 'Cab XL', label: 'Prime SUV', base: 100, km: 19, min: 2, floor: 150 },
  { app: 'Uber', domain: 'uber.com', kind: 'Bike', label: 'Moto', base: 20, km: 5.5, min: 0.5, floor: 25 },
  { app: 'Uber', domain: 'uber.com', kind: 'Auto', label: 'Auto', base: 28, km: 12.5, min: 1, floor: 30 },
  { app: 'Uber', domain: 'uber.com', kind: 'Cab', label: 'Uber Go', base: 55, km: 14, min: 1.5, floor: 85 },
  { app: 'Uber', domain: 'uber.com', kind: 'Cab XL', label: 'UberXL', base: 100, km: 20, min: 2, floor: 150 },
  { app: 'Namma Yatri', domain: 'nammayatri.in', kind: 'Auto', label: 'Auto (meter fare, no commission)', base: 30, km: 15, min: 0, floor: 30, note: 'In select cities' },
  { app: 'Namma Yatri', domain: 'nammayatri.in', kind: 'Cab', label: 'Cab', base: 50, km: 13, min: 1, floor: 80, note: 'In select cities' },
];

// Fares run higher in the biggest metros.
const METRO = /mumbai|delhi|new delhi|gurgaon|gurugram|noida|bengaluru|bangalore|hyderabad|chennai|pune|kolkata/i;

function links(a: Place, b: Place) {
  const p = (x: Place) => `${x.lat.toFixed(6)},${x.lng.toFixed(6)}`;
  return {
    // Uber's documented universal link opens the app (or m.uber.com) with pickup and drop filled in.
    Uber:
      'https://m.uber.com/ul/?action=setPickup' +
      `&pickup[latitude]=${a.lat}&pickup[longitude]=${a.lng}&pickup[nickname]=${encodeURIComponent(a.name)}` +
      `&dropoff[latitude]=${b.lat}&dropoff[longitude]=${b.lng}&dropoff[nickname]=${encodeURIComponent(b.name)}`,
    Ola: `https://book.olacabs.com/?pickup_name=${encodeURIComponent(a.name)}&lat=${a.lat}&lng=${a.lng}&drop_name=${encodeURIComponent(b.name)}&drop_lat=${b.lat}&drop_lng=${b.lng}`,
    // Rapido, Namma Yatri and inDrive have no public trip link: they open the app's site / store page.
    Rapido: 'https://www.rapido.bike/',
    'Namma Yatri': 'https://nammayatri.in/',
    inDrive: 'https://indrive.com/',
    map: `https://www.google.com/maps/dir/?api=1&origin=${p(a)}&destination=${p(b)}&travelmode=driving`,
  };
}

export function fares(a: Place, b: Place, trip: { km: number; min: number }, city: string): { fares: RideFare[]; map: string } {
  const l = links(a, b);
  const m = METRO.test(`${city} ${a.name}`) ? 1.12 : 1;
  const hour = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }));
  const night = hour >= 23 || hour < 5;
  const list: RideFare[] = CARDS.map((c) => {
    const est = Math.max(c.floor, c.base + c.km * trip.km + c.min * trip.min) * m * (night ? 1.25 : 1);
    return { app: c.app, domain: c.domain, kind: c.kind, label: c.label, low: Math.round(est * 0.92), high: Math.round(est * 1.12), note: [c.note, night ? 'Night fare' : ''].filter(Boolean).join(' · ') || undefined, link: l[c.app] };
  });
  // inDrive lets the rider offer a price; drivers usually accept a little under the cab apps.
  const cab = list.filter((f) => f.kind === 'Cab' && f.app !== 'Namma Yatri');
  const avg = cab.reduce((s, f) => s + (f.low + f.high) / 2, 0) / cab.length;
  list.push({ app: 'inDrive', domain: 'indrive.com', kind: 'Cab', label: 'Car (you offer the price)', low: Math.round(avg * 0.8), high: Math.round(avg * 0.95), note: 'Suggested offer', link: l.inDrive });
  return { fares: list.sort((x, y) => x.low - y.low), map: l.map };
}
