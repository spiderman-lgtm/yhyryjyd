'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import Modal from './Modal';
import { callApi } from '@/lib/api-client';

export default function CartAndEnquire({ productId, inCart: initial }: { productId: string; inCart: boolean }) {
  const router = useRouter();
  const [inCart, setInCart] = useState(initial);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  async function toggleCart() {
    const { ok } = await callApi('/api/cart', { method: inCart ? 'DELETE' : 'POST', body: { product_id: productId } });
    if (ok) {
      setInCart(!inCart);
      router.refresh(); // so My cart and the dashboard show the change right away
    }
  }

  async function enquire(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const { ok, data } = await callApi('/api/enquiry', { body: { ...body, product_id: productId } });
    setBusy(false);
    if (!ok) return setError(data.error || 'Could not send.');
    setSent(true);
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <button onClick={toggleCart} className="btn-ghost">{inCart ? '✓ In your cart' : '+ Add to cart'}</button>
      <button onClick={() => setOpen(true)} className="btn-ghost">Enquire</button>
      <Modal open={open} onClose={close} title="Ask about this product">
        {sent ? (
          <p className="rounded-xl bg-deal-light p-4 text-sm text-deal">Thanks — we have your enquiry and will reply by email.</p>
        ) : (
          <form onSubmit={enquire} className="space-y-3">
            <p className="text-sm text-ink-soft">Bulk order, a better price, or a question about the product? Tell us and we will get back to you.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="eq-name">Name</label><input id="eq-name" name="name" className="input" required /></div>
              <div><label className="label" htmlFor="eq-email">Email</label><input id="eq-email" name="email" type="email" className="input" required /></div>
              <div><label className="label" htmlFor="eq-phone">Phone (optional)</label><input id="eq-phone" name="phone" className="input" inputMode="tel" /></div>
              <div><label className="label" htmlFor="eq-budget">Your budget ₹ (optional)</label><input id="eq-budget" name="budget" type="number" min="1" className="input" /></div>
            </div>
            <div><label className="label" htmlFor="eq-msg">Message</label><textarea id="eq-msg" name="message" rows={3} className="input" /></div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className="btn-dark w-full" disabled={busy}>{busy ? 'Sending…' : 'Send enquiry'}</button>
          </form>
        )}
      </Modal>
    </div>
  );
}
