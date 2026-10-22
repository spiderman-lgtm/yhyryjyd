import Link from 'next/link';
import GiftCardGrid, { type GiftCardView } from '@/components/GiftCardGrid';
import { Reveal, Stagger, StaggerItem } from '@/components/Motion';
import { isOwner } from '@/lib/auth';
import { couponDomain, liveGiftCards } from '@/lib/storecoupons';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Gift cards — DealRadar',
  description: 'Discounted gift cards for Flipkart, Myntra, AJIO, Swiggy and more. Buy at a discount, pay with it at checkout and save extra.',
};

const STEPS = [
  ['Buy at a discount', 'Pick a store’s gift card here — it costs less than its value.'],
  ['Add it to your account', 'The code arrives instantly by email. Add it to your wallet on that store.'],
  ['Pay with it', 'Shop as usual and pay with the gift card balance. Most coupon codes still apply on top.'],
];

export default function GiftCardsPage() {
  const cards: GiftCardView[] = liveGiftCards().map((c) => ({ id: c.id, store: c.store, title: c.title, discount_text: c.discount_text, description: c.description, logo_url: c.logo_url, domain: couponDomain(c) }));
  const owner = isOwner();
  return (
    <div className="relative space-y-10">
      <div aria-hidden className="pointer-events-none absolute -top-10 left-1/4 -z-10 h-80 w-80 rounded-full bg-violet-300/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute right-0 top-64 -z-10 h-80 w-80 rounded-full bg-orange-200/40 blur-3xl" />

      <Reveal>
        <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-violet-600 via-indigo-600 to-sky-500 px-6 py-10 text-white shadow-2xl shadow-indigo-900/20 sm:px-12">
          <div aria-hidden className="absolute -right-12 -top-16 h-72 w-72 rounded-full bg-white/20 blur-3xl" />
          <div aria-hidden className="absolute -bottom-24 left-1/4 h-72 w-72 rounded-full bg-fuchsia-300/30 blur-3xl" />
          <div className="relative max-w-2xl">
            <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">🎁 Save more on every order</span>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">Gift cards</h1>
            <p className="mt-2 text-white/85">Buy gift cards for your favourite stores at a discount, then pay with them — extra savings on top of the sale price.</p>
          </div>
        </section>
      </Reveal>

      {cards.length > 0 ? (
        <GiftCardGrid cards={cards} />
      ) : (
        <div className="rounded-3xl border border-white/70 bg-white/70 p-10 text-center text-ink-soft backdrop-blur-md">
          Gift card deals are coming soon.
          {owner && (
            <>
              {' '}
              <Link href="/admin#coupons" className="font-semibold text-indigo-700 underline">Add them in Automation → Coupons</Link> with the category “Gift card”.
            </>
          )}
        </div>
      )}

      <section>
        <Reveal><h2 className="mb-4 text-2xl font-extrabold">How gift cards save you money</h2></Reveal>
        <Stagger className="grid gap-4 sm:grid-cols-3">
          {STEPS.map(([t, d], i) => (
            <StaggerItem key={t}>
              <div className="h-full rounded-3xl border border-white/70 bg-white/70 p-5 shadow-sm backdrop-blur-md">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 font-black text-white">{i + 1}</div>
                <h3 className="mt-3 font-bold">{t}</h3>
                <p className="mt-1 text-sm text-ink-soft">{d}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
        <p className="mt-3 text-xs text-ink-mute">Paying with a gift card usually means that order cannot use a bank-card offer. Compare both before you pay.</p>
      </section>
    </div>
  );
}
