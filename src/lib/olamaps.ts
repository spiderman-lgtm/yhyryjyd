import 'server-only';

// Ola Maps (maps.olakrutrim.com): Indian place search, a point's address and road routes, free up to its monthly
// limit. Used when OLA_MAPS_API_KEY is set and Google Maps is not working.

export type OPlace = { name: string; area?: string; lat: number; lng: number };

const key = () => (process.env.OLA_MAPS_API_KEY || '').trim() || null;
export const olaMapsOn = () => !!key();
const API = 'https://api.olamaps.io';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${API}${path}${sep}api_key=${encodeURIComponent(key()!)}`, {
    ...init,
    headers: { 'X-Request-Id': crypto.randomUUID(), ...(init.headers || {}) },
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || body?.status === 'error') throw new Error(`Ola Maps ${res.status}: ${body?.error_message || body?.message || body?.reason || 'error'}`);
  return body as T;
}

const split = (addr: string) => {
  const [name, ...rest] = addr.split(',').map((x) => x.trim());
  return { name, area: rest.filter((x) => x && x !== 'India').slice(0, 3).join(', ') };
};

export async function suggest(q: string, near?: { lat: number; lng: number } | null): Promise<OPlace[]> {
  const r = await call<{ predictions?: { description: string; structured_formatting?: { main_text?: string; secondary_text?: string }; geometry?: { location: { lat: number; lng: number } } }[] }>(
    `/places/v1/autocomplete?input=${encodeURIComponent(q)}${near ? `&location=${near.lat},${near.lng}&radius=40000` : ''}`,
  );
  return (r.predictions || [])
    .filter((p) => p.geometry?.location)
    .slice(0, 6)
    .map((p) => ({
      name: p.structured_formatting?.main_text || split(p.description).name,
      area: p.structured_formatting?.secondary_text || split(p.description).area,
      lat: p.geometry!.location.lat,
      lng: p.geometry!.location.lng,
    }));
}

export async function reverse(lat: number, lng: number): Promise<OPlace | null> {
  const r = await call<{ results?: { formatted_address: string }[] }>(`/places/v1/reverse-geocode?latlng=${lat},${lng}`);
  const addr = r.results?.[0]?.formatted_address;
  return addr ? { ...split(addr), lat, lng } : null;
}

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

export async function route(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = await call<{ routes?: { overview_polyline?: string; legs?: { distance: number; duration: number }[] }[] }>(
    `/routing/v1/directions?origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&mode=driving&overview=full`,
    { method: 'POST' },
  );
  const best = r.routes?.[0];
  const leg = best?.legs?.[0];
  if (!leg) return null;
  return { km: leg.distance / 1000, min: Math.max(leg.duration / 60, (leg.distance / 1000 / 18) * 60), line: best!.overview_polyline ? decode(best!.overview_polyline) : [] };
}
