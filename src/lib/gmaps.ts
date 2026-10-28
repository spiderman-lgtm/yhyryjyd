import 'server-only';

// Google Maps, the map Rapido and Uber book on: place search, the point of a place, the name of a point, and the
// road route with live traffic. Used when GOOGLE_MAPS_API_KEY is set (Places API (New), Routes API and
// Geocoding API enabled on the key); otherwise DealRadar uses OpenStreetMap.

export type GPlace = { id?: string; name: string; area?: string; lat: number; lng: number };

const key = () => (process.env.GOOGLE_MAPS_API_KEY || '').trim() || null;
export const googleMapsOn = () => !!key();

async function call<T>(url: string, init: RequestInit & { mask?: string } = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key()!, ...(init.mask ? { 'X-Goog-FieldMask': init.mask } : {}), ...(init.headers || {}) },
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Maps ${res.status}: ${body?.error?.message || body?.error_message || 'error'}`);
  return body as T;
}

// Suggestions while typing; each needs place() for its point, as Google sends ids, not coordinates.
export async function suggest(q: string, near?: { lat: number; lng: number } | null): Promise<GPlace[]> {
  const r = await call<{ suggestions?: { placePrediction?: { placeId: string; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }; text?: { text: string } } }[] }>(
    'https://places.googleapis.com/v1/places:autocomplete',
    {
      method: 'POST',
      body: JSON.stringify({
        input: q,
        includedRegionCodes: ['in'],
        languageCode: 'en',
        ...(near ? { locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 30000 } } } : {}),
      }),
    },
  );
  return (r.suggestions || [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p)
    .slice(0, 6)
    .map((p) => ({ id: p.placeId, name: p.structuredFormat?.mainText?.text || p.text?.text || 'Place', area: p.structuredFormat?.secondaryText?.text || '', lat: 0, lng: 0 }));
}

export async function place(id: string): Promise<GPlace> {
  const r = await call<{ displayName?: { text: string }; formattedAddress?: string; location: { latitude: number; longitude: number } }>(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=en`,
    { mask: 'displayName,formattedAddress,location' },
  );
  const name = r.displayName?.text || r.formattedAddress || 'Place';
  return { id, name, area: (r.formattedAddress || '').replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},?\\s*`), ''), lat: r.location.latitude, lng: r.location.longitude };
}

export async function reverse(lat: number, lng: number): Promise<GPlace | null> {
  const r = await call<{ results?: { formatted_address: string }[] }>(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key()}&language=en&region=in`);
  const addr = r.results?.[0]?.formatted_address;
  if (!addr) return null;
  const [name, ...rest] = addr.split(',').map((x) => x.trim());
  return { name, area: rest.filter((x) => x !== 'India').join(', '), lat, lng };
}

// Google's encoded polyline, as [lat, lng] points.
function decode(s: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < s.length) {
    for (const which of [0, 1]) {
      let shift = 0, result = 0, b: number;
      do {
        b = s.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += d;
      else lng += d;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

// The road route with live traffic. Two-wheelers take their own (often shorter) roads in India.
export async function route(a: { lat: number; lng: number }, b: { lat: number; lng: number }, mode: 'DRIVE' | 'TWO_WHEELER' = 'DRIVE') {
  const r = await call<{ routes?: { distanceMeters: number; duration: string; polyline?: { encodedPolyline: string } }[] }>('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    mask: 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: a.lat, longitude: a.lng } } },
      destination: { location: { latLng: { latitude: b.lat, longitude: b.lng } } },
      travelMode: mode,
      routingPreference: 'TRAFFIC_AWARE',
      regionCode: 'IN',
    }),
  });
  const best = r.routes?.[0];
  if (!best) return null;
  return { km: best.distanceMeters / 1000, min: parseInt(best.duration, 10) / 60, line: best.polyline ? decode(best.polyline.encodedPolyline) : [] };
}
