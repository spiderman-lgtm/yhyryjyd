import 'server-only';
import { read, write } from './db';
import { googleMapsOn, route as googleRoute } from './gmaps';
import { olaMapsOn, route as olaRoute } from './olamaps';

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
  ref?: number;
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
  // Photon (OpenStreetMap search built for type-ahead) copes with short local names like "LIG Square".
  const photon = await fetch(`https://photon.komoot.io/api/?limit=1&lang=en&bbox=68,6,98,37&q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000), cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const f = photon?.features?.[0];
  if (f) {
    const pr = f.properties || {};
    const place = { name: [pr.name, pr.district || pr.locality, pr.city].filter(Boolean).join(', '), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
    geoCache.set(key, place);
    return place;
  }
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
export async function route(a: Place, b: Place, mode: 'DRIVE' | 'TWO_WHEELER' = 'DRIVE'): Promise<{ km: number; min: number; road: boolean; line?: [number, number][]; google?: boolean; ola?: boolean }> {
  // Google Maps with live traffic, the same routing the ride apps price on, when its key is set.
  if (googleMapsOn()) {
    try {
      const g = await googleRoute(a, b, mode);
      if (g) return { ...g, road: true, google: true };
    } catch (e) {
      console.error('[rides] google route:', e instanceof Error ? e.message : e);
    }
  }
  if (olaMapsOn()) {
    try {
      const o = await olaRoute(a, b);
      if (o) return { ...o, road: true, ola: true };
    } catch (e) {
      console.error('[rides] ola route:', e instanceof Error ? e.message : e);
    }
  }
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=simplified&geometries=geojson`;
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
    const r = (await res.json()) as { routes?: { distance: number; duration: number; geometry?: { coordinates: [number, number][] } }[] };
    const best = r.routes?.[0];
    // OSRM's car times assume empty roads; Indian city traffic is about 1.6× slower. The line is [lat, lng] for the map.
    if (best) return { km: best.distance / 1000, min: Math.max((best.duration / 60) * 1.6, (best.distance / 1000 / 18) * 60), road: true, line: (best.geometry?.coordinates ?? []).map(([lng, lat]) => [lat, lng] as [number, number]) };
  } catch {}
  const km = straightKm(a, b) * 1.35;
  return { km, min: (km / 18) * 60, road: false };
}

// Rate cards (base fare, per km, per minute, minimum). Rapido's are fitted to its own quotes in Indore (Vijay Nagar →
// LIG Square: Bike ₹54–65, Auto ₹96–117, Cab Economy ₹104–127, Cab Premium ₹154–187); Ola and Uber run a little
// above Rapido. Shoppers' reports of the price their app showed then correct each city (see fareCorrection).
type Card = { app: RideFare['app']; domain: string; kind: RideFare['kind']; label: string; base: number; km: number; min: number; floor: number; note?: string };
const CARDS: Card[] = [
  { app: 'Rapido', domain: 'rapido.bike', kind: 'Bike', label: 'Bike', base: 30, km: 7.5, min: 0.5, floor: 35 },
  { app: 'Rapido', domain: 'rapido.bike', kind: 'Auto', label: 'Auto', base: 40, km: 16, min: 1, floor: 50 },
  { app: 'Rapido', domain: 'rapido.bike', kind: 'Cab', label: 'Cab Economy', base: 55, km: 13.5, min: 1.2, floor: 80 },
  { app: 'Rapido', domain: 'rapido.bike', kind: 'Cab XL', label: 'Cab Premium', base: 80, km: 20, min: 1.5, floor: 120 },
  { app: 'Ola', domain: 'olacabs.com', kind: 'Bike', label: 'Bike', base: 32, km: 8, min: 0.5, floor: 40 },
  { app: 'Ola', domain: 'olacabs.com', kind: 'Auto', label: 'Auto', base: 42, km: 17, min: 1, floor: 55 },
  { app: 'Ola', domain: 'olacabs.com', kind: 'Cab', label: 'Mini', base: 60, km: 16, min: 1.3, floor: 90 },
  { app: 'Ola', domain: 'olacabs.com', kind: 'Cab XL', label: 'Prime SUV', base: 100, km: 22, min: 2, floor: 150 },
  { app: 'Uber', domain: 'uber.com', kind: 'Bike', label: 'Moto', base: 31, km: 7.8, min: 0.5, floor: 38 },
  { app: 'Uber', domain: 'uber.com', kind: 'Auto', label: 'Auto', base: 42, km: 16.5, min: 1, floor: 52 },
  { app: 'Uber', domain: 'uber.com', kind: 'Cab', label: 'Uber Go', base: 60, km: 16, min: 1.4, floor: 90 },
  { app: 'Uber', domain: 'uber.com', kind: 'Cab XL', label: 'UberXL', base: 100, km: 22, min: 2, floor: 150 },
  { app: 'Namma Yatri', domain: 'nammayatri.in', kind: 'Auto', label: 'Auto (meter fare, no commission)', base: 30, km: 15, min: 0, floor: 30, note: 'In select cities' },
  { app: 'Namma Yatri', domain: 'nammayatri.in', kind: 'Cab', label: 'Cab', base: 50, km: 14, min: 1, floor: 80, note: 'In select cities' },
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

// The city a trip is in, from the place names (the last part that is not a state, PIN code or country).
export function cityOf(...names: string[]) {
  for (const n of names) {
    const parts = n.split(',').map((x) => x.trim()).filter((x) => x && !/^\d{6}$/.test(x) && !/india|pradesh|maharashtra|karnataka|gujarat|rajasthan|tamil nadu|kerala|bengal|telangana|bihar|punjab|haryana|odisha|assam|delhi ncr/i.test(x));
    // "Vijay Nagar, Indore, Madhya Pradesh" → indore; a bare "Indore, Madhya Pradesh" → indore too.
    if (parts.length > 1 || (parts.length === 1 && n.includes(','))) return parts[parts.length - 1].toLowerCase();
  }
  return '';
}

// Shoppers tell us the price their app showed; the median of the last reports for a city, app and ride type
// scales our estimate, so the estimates follow each city's real prices.
export function fareCorrection(city: string, app: string, label: string): { factor: number; reports: number } {
  const list = read((d) => (d.ride_reports ?? []).filter((r) => r.city === city && r.app === app && r.label === label).slice(-15));
  if (!list.length) return { factor: 1, reports: 0 };
  const ratios = list.map((r) => r.ratio).sort((x, y) => x - y);
  return { factor: ratios[Math.floor(ratios.length / 2)], reports: list.length };
}

export function fares(a: Place, b: Place, trip: { km: number; min: number }, city: string): { fares: RideFare[]; map: string; city: string } {
  const l = links(a, b);
  const m = METRO.test(`${city} ${a.name}`) ? 1.12 : 1;
  const hour = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }));
  const night = hour >= 23 || hour < 5;
  const town = city.trim().toLowerCase() || cityOf(a.name, b.name);
  const list: RideFare[] = CARDS.map((c) => {
    const fix = fareCorrection(town, c.app, c.label);
    // A city with reports already reflects its own prices, so the metro uplift is not added on top.
    // ref: the rate-card fare with the night charge, before the city's own correction; reports are measured against it.
    const ref = Math.max(c.floor, c.base + c.km * trip.km + c.min * trip.min) * (night ? 1.25 : 1);
    const est = ref * (fix.reports ? fix.factor : m);
    const note = [c.note, fix.reports ? `Matched to ${fix.reports} real price${fix.reports > 1 ? 's' : ''} in ${town.replace(/\b\w/g, (x) => x.toUpperCase())}` : '', night ? 'Night fare' : ''].filter(Boolean).join(' · ');
    return { app: c.app, domain: c.domain, kind: c.kind, label: c.label, low: Math.round(est * 0.91), high: Math.round(est * 1.1), ref: Math.round(ref), note: note || undefined, link: l[c.app] };
  });
  // inDrive lets the rider offer a price; drivers usually accept a little under the cab apps.
  const cab = list.filter((f) => f.kind === 'Cab' && f.app !== 'Namma Yatri');
  const avg = cab.reduce((s, f) => s + (f.low + f.high) / 2, 0) / cab.length;
  list.push({ app: 'inDrive', domain: 'indrive.com', kind: 'Cab', label: 'Car (you offer the price)', low: Math.round(avg * 0.8), high: Math.round(avg * 0.95), note: 'Suggested offer', link: l.inDrive });
  return { fares: list.sort((x, y) => x.low - y.low), map: l.map, city: town };
}

// A shopper's report of the price their app showed for a ride we estimated.
export function reportFare(r: { city: string; app: string; label: string; estimate: number; actual: number; who: string }): string | null {
  if (!CARDS.some((c) => c.app === r.app && c.label === r.label)) return 'Unknown ride type.';
  const ratio = r.actual / r.estimate;
  if (!(ratio >= 0.4 && ratio <= 2.5)) return 'That price is too far from this trip — check you entered the right ride.';
  return write((d) => {
    const list = (d.ride_reports ??= []);
    // One report per person, app and ride type an hour.
    if (list.some((x) => x.who === r.who && x.app === r.app && x.label === r.label && Date.now() - Date.parse(x.at) < 3600_000)) return 'Thanks — you already sent this one.';
    list.push({ city: r.city, app: r.app, label: r.label, ratio: Math.round(ratio * 1000) / 1000, at: new Date().toISOString(), who: r.who });
    if (list.length > 3000) list.splice(0, list.length - 3000);
    return null;
  });
}
