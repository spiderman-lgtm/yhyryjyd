'use client';

import { useState } from 'react';
import { callApi } from '@/lib/api-client';

// The shopper's delivery pincode. Comparisons use it where a store prices or stocks by location.
export default function LocationPin({ pin, area }: { pin: string | null; area: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(pin ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { ok, data } = await callApi('/api/pincode', { body: { pin: value } });
    if (!ok) {
      setBusy(false);
      return setError(data.error || 'Could not save that pincode.');
    }
    window.location.reload(); // every price on the page is re-read for the new location
  }

  async function clear() {
    setBusy(true);
    await callApi('/api/pincode', { method: 'DELETE' });
    window.location.reload();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
      {editing ? (
        <form onSubmit={save} className="flex flex-wrap items-center gap-2">
          <span aria-hidden="true">📍</span>
          <input
            autoFocus
            inputMode="numeric"
            maxLength={6}
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
            placeholder="Delivery pincode"
            aria-label="Delivery pincode"
            className="w-32 rounded-lg border border-slate-300 px-2 py-1 font-semibold tracking-widest outline-none focus:border-brand"
          />
          <button disabled={busy || value.length !== 6} className="btn-primary px-3 py-1 text-xs disabled:opacity-50">{busy ? 'Saving…' : 'Check prices'}</button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-ink-mute hover:underline">Cancel</button>
          {pin && <button type="button" onClick={clear} className="text-xs text-red-600 hover:underline">Remove</button>}
          {error && <span className="w-full text-xs text-red-600">{error}</span>}
        </form>
      ) : (
        <button onClick={() => setEditing(true)} className="flex w-full items-center gap-2 text-left">
          <span aria-hidden="true">📍</span>
          {pin ? (
            <span className="min-w-0 flex-1">
              Delivering to <b>{pin}</b>
              {area && <span className="text-ink-mute"> · {area}</span>}
            </span>
          ) : (
            <span className="min-w-0 flex-1 text-ink-soft">Add your pincode for prices &amp; stock at your location</span>
          )}
          <span className="text-xs font-semibold text-brand">{pin ? 'Change' : 'Add'}</span>
        </button>
      )}
      {pin && !editing && (
        <p className="mt-1.5 text-xs text-ink-mute">
          Croma checks stock and price at {pin}. For Zepto, Blinkit &amp; Instamart at this address, use the{' '}
          <a href="/extension" className="font-semibold text-brand hover:underline">DealRadar extension</a> on this product.
        </p>
      )}
    </div>
  );
}
