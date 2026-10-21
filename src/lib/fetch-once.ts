'use client';

const cache = new Map<string, Promise<any>>();

// One request per URL per page, shared by every component that asks. Slow AI searches can outlast
// the host's proxy while the server keeps working, so a failed attempt is retried once.
export function fetchOnce<T>(url: string): Promise<T> {
  let p = cache.get(url);
  if (!p) {
    p = (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(String(res.status));
          return (await res.json()) as T;
        } catch (e) {
          if (attempt >= 1) throw e;
        }
      }
    })();
    cache.set(url, p);
    p.catch(() => cache.delete(url));
  }
  return p;
}
