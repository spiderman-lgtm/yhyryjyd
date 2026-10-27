'use client';

export type ApiReply<T> = { ok: boolean; status: number; data: T & { error?: string } };

// Calls DealRadar's own API from the browser. A dropped connection, a timeout or a reply that is not JSON (the
// host restarting or overloaded) comes back as a plain message, instead of "Failed to fetch" or a button that
// never stops spinning.
export async function callApi<T = Record<string, any>>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<ApiReply<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 30_000);
  const hasBody = init.body !== undefined;
  try {
    const res = await fetch(path, {
      method: init.method ?? (hasBody ? 'POST' : 'GET'),
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({ error: res.ok ? undefined : 'DealRadar is busy right now. Please try again in a minute.' }));
    // Signed out (or the session ran out) and the shopper did something: sign in, then come back here.
    if (res.status === 401 && data?.login && hasBody) window.location.href = `${data.login}?next=${encodeURIComponent(location.pathname + location.search)}`;
    return { ok: res.ok, status: res.status, data };
  } catch {
    const error = ctrl.signal.aborted ? 'This is taking longer than usual. Please try again.' : 'Could not reach DealRadar. Check your connection and try again.';
    return { ok: false, status: 0, data: { error } as T & { error?: string } };
  } finally {
    clearTimeout(timer);
  }
}
