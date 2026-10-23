'use client';

import { useCallback, useState } from 'react';
import Modal from './Modal';
import { callApi } from '@/lib/api-client';

const CATEGORIES = [
  ['fashion', 'Fashion'],
  ['beauty', 'Beauty'],
  ['electronics', 'Electronics'],
  ['travel', 'Travel'],
  ['food', 'Food'],
  ['grocery', 'Grocery'],
  ['recharge', 'Recharge'],
  ['ott', 'OTT'],
  ['education', 'Education'],
  ['health', 'Health'],
  ['other', 'Other'],
];

// Lets a shopper share a coupon; it shows on the site once the owner approves it.
export default function SubmitCoupon({ stores }: { stores: string[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const { ok, data } = await callApi('/api/coupons/submit', { body });
    setBusy(false);
    if (!ok) return setError(data.error || 'Could not send it.');
    setDone(true);
  }

  return (
    <>
      <button onClick={() => (setDone(false), setOpen(true))} className="btn-ghost whitespace-nowrap bg-white/80 px-4 backdrop-blur">+ Submit a coupon</button>
      <Modal open={open} onClose={close} title="Share a coupon">
        {done ? (
          <div className="space-y-3 text-sm">
            <p className="rounded-xl bg-deal-light p-4 text-deal">Thank you! We will check it and add it to the Coupons page soon.</p>
            <button onClick={() => setDone(false)} className="btn-ghost w-full">Share another</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-sm text-ink-soft">Found a code that works? Share it — it goes live after a quick check.</p>
            <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="sc-store">Store *</label>
                <input id="sc-store" name="store" list="sc-stores" required className="input" placeholder="Myntra" />
                <datalist id="sc-stores">{stores.map((s) => <option key={s} value={s} />)}</datalist>
              </div>
              <div>
                <label className="label" htmlFor="sc-code">Coupon code</label>
                <input id="sc-code" name="code" className="input font-mono uppercase" placeholder="SAVE200" maxLength={40} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="sc-title">What does it give? *</label>
              <input id="sc-title" name="title" required className="input" placeholder="Flat ₹200 off on orders above ₹999" maxLength={200} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="sc-badge">Discount</label>
                <input id="sc-badge" name="discount_text" className="input" placeholder="₹200 off" maxLength={40} />
              </div>
              <div>
                <label className="label" htmlFor="sc-cat">Category</label>
                <select id="sc-cat" name="category" className="input" defaultValue="fashion">
                  {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="sc-url">Offer link</label>
              <input id="sc-url" name="url" type="url" className="input" placeholder="https://www.myntra.com/…" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="sc-exp">Valid till</label>
                <input id="sc-exp" name="expires_at" type="date" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="sc-desc">Conditions</label>
                <input id="sc-desc" name="description" className="input" placeholder="New users only" maxLength={400} />
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className="btn-dark w-full" disabled={busy}>{busy ? 'Sending…' : 'Submit coupon'}</button>
          </form>
        )}
      </Modal>
    </>
  );
}
