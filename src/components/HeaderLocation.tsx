'use client';

import { useEffect, useRef, useState } from 'react';

// The delivery pincode in the top bar, on every page. The same location is used by store comparisons
// and by the DealRadar extension's nearby check on Zepto, Blinkit, Instamart, BigBasket and JioMart.
export default function HeaderLocation({ pin, area }: { pin: string | null; area: string | null }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(pin ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/pincode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: value }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      return setError(data.error || 'Could not save that pincode.');
    }
    window.location.reload(); // prices on the page are re-read for the new location
  }

  const city = area?.split(',')[0];
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 rounded-lg px-1.5 py-1.5 text-left hover:bg-slate-100 sm:gap-1.5 sm:px-2" aria-expanded={open} aria-label="Delivery location">
        <span aria-hidden="true">📍</span>
        <span className="leading-tight">
          <span className="hidden text-[10px] font-normal text-ink-mute sm:block">Deliver to</span>
          <span className="block max-w-[9rem] truncate text-xs font-bold">
            {pin ? (
              <>
                {city && <span className="hidden sm:inline">{city} </span>}
                {pin}
              </>
            ) : (
              'Location'
            )}
          </span>
        </span>
      </button>
      {open && (
        <form onSubmit={save} className="fixed inset-x-4 top-16 z-40 whitespace-normal rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-72">
          <div className="text-sm font-bold">Your delivery location</div>
          <p className="mt-1 text-xs font-normal text-ink-mute">Prices and stock are checked at this pincode, on this site and in the DealRadar extension.</p>
          <div className="mt-3 flex gap-2">
            <input
              autoFocus
              inputMode="numeric"
              maxLength={6}
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
              placeholder="Pincode"
              aria-label="Delivery pincode"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-semibold tracking-widest outline-none focus:border-brand"
            />
            <button disabled={busy || value.length !== 6} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">{busy ? '…' : 'Save'}</button>
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          {pin && area && <p className="mt-2 text-xs font-normal text-ink-soft">Now: {pin} · {area}</p>}
        </form>
      )}
    </div>
  );
}
