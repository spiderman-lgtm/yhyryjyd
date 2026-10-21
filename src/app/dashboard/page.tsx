import Link from 'next/link';
import { redirect } from 'next/navigation';
import LinkInput from '@/components/LinkInput';
import { currentUser } from '@/lib/auth';
import { read } from '@/lib/db';
import { TIER_INFO } from '@/lib/alerts';
import { dateShort, inr } from '@/lib/format';
import { PLATFORM_NAMES } from '@/lib/scraper';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My dashboard — DealRadar' };

function Thumb({ src }: { src: string | null }) {
  return (
    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-white ring-1 ring-slate-100">
      {src ? <img src={src} alt="" className="max-h-full max-w-full object-contain" /> : '🛍️'}
    </div>
  );
}

export default function Dashboard() {
  const user = currentUser();
  if (!user) redirect('/login?next=/dashboard');

  const data = read((d) => {
    const alerts = Object.values(d.alerts)
      .filter((a) => a.uid === user.id && d.products[a.product_id])
      .map((a) => ({ a, p: d.products[a.product_id] }));
    const cart = Object.values(d.cart)
      .filter((c) => c.uid === user.id && d.products[c.product_id])
      .sort((x, y) => Date.parse(y.added_at) - Date.parse(x.added_at))
      .map((c) => d.products[c.product_id]);
    const owner =
      user.role === 'owner'
        ? {
            gmail: !!d.settings.gmail,
            whatsapp: !!d.settings.whatsapp?.message_template_id,
            schedules: Object.keys(d.settings.flows).length,
            enquiries: d.enquiries.length,
          }
        : null;
    const cheaper: Record<string, { store: string; price: number }> = {};
    for (const { p } of alerts) {
      const best = d.compare[p.id]?.offers.filter((o) => o.same_variant && o.in_stock && o.price < p.price).sort((x, y) => x.price - y.price)[0];
      if (best) cheaper[p.id] = { store: best.store, price: best.price };
    }
    return { alerts, cart, owner, cheaper };
  });
  const elsewhere = (id: string) =>
    data.cheaper[id] ? <div className="text-xs font-semibold text-deal">Cheaper on {data.cheaper[id].store}: {inr(data.cheaper[id].price)}</div> : null;

  const active = data.alerts.filter(({ a }) => a.status === 'active');
  const drops = active
    .filter(({ a, p }) => p.price < a.baseline_price)
    .map(({ a, p }) => ({ a, p, pct: ((a.baseline_price - p.price) / a.baseline_price) * 100 }))
    .sort((x, y) => y.pct - x.pct);
  const savings = drops.reduce((s, { a, p }) => s + (a.baseline_price - p.price), 0);
  const alerted = data.alerts.filter(({ a }) => a.last_notified_at).length;
  const endingSoon = active.filter(({ a }) => Date.parse(a.expires_at) - Date.now() < 2 * 86400_000);

  const tiles = [
    { k: 'Products watched', v: active.length, href: '/alerts' },
    { k: 'Prices dropped', v: drops.length, href: '#drops', good: drops.length > 0 },
    { k: 'You could save', v: inr(savings), href: '#drops', good: savings > 0 },
    { k: 'Alerts sent to you', v: alerted, href: '/alerts' },
    { k: 'In your cart', v: data.cart.length, href: '/cart' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Hi {user.name.split(' ')[0]}</h1>
          <p className="text-sm text-ink-soft">Here is what DealRadar is watching for you.</p>
        </div>
        {data.owner && (
          <Link href="/admin" className="btn-dark">Owner admin →</Link>
        )}
      </div>

      {data.owner && (!data.owner.gmail || !data.owner.schedules) && (
        <div className="rounded-xl bg-brand-light px-4 py-3 text-sm text-brand-dark">
          <b>Finish setup to start sending alerts:</b>{' '}
          {[!data.owner.gmail && 'connect Gmail', !data.owner.whatsapp && 'set up WhatsApp Business', !data.owner.schedules && 'activate the price-check schedules']
            .filter(Boolean)
            .join(' · ')}{' '}
          — <Link href="/admin" className="font-semibold underline">open Admin</Link>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map((t) => (
          <Link key={t.k} href={t.href} className="card p-4 transition hover:shadow-md">
            <div className="text-xs text-ink-mute">{t.k}</div>
            <div className={`mt-1 text-2xl font-extrabold ${t.good ? 'text-deal' : ''}`}>{t.v}</div>
          </Link>
        ))}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-bold">Check a new product</h2>
        <LinkInput compact />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section id="drops" className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Price drops on your watchlist</h2>
            <Link href="/alerts" className="text-sm font-semibold text-brand underline">All alerts</Link>
          </div>
          {drops.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-ink-soft">
              {active.length ? 'No drops yet — we keep checking and will message you the moment a price falls.' : 'You are not watching anything yet. Paste a product link above and choose “Track price”.'}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {drops.map(({ a, p, pct }) => (
                <li key={a.id} className="flex items-center gap-3 py-3">
                  <Thumb src={p.image} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/p/${p.id}`} className="line-clamp-1 font-medium hover:underline">{p.title}</Link>
                    <div className="text-xs text-ink-mute">{PLATFORM_NAMES[p.platform]} · was {inr(a.baseline_price)}</div>
                    {elsewhere(p.id)}
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-deal">{inr(p.price)}</div>
                    <div className="text-xs font-semibold text-deal">▼ {pct.toFixed(0)}%</div>
                  </div>
                  <a href={`/api/buy/${p.id}`} target="_blank" rel="noopener" className="btn-primary px-3 py-1.5">Buy</a>
                </li>
              ))}
            </ul>
          )}

          {active.length > drops.length && (
            <>
              <h3 className="mb-1 mt-5 text-sm font-bold text-ink-soft">Still watching</h3>
              <ul className="divide-y divide-slate-100">
                {active
                  .filter(({ a, p }) => p.price >= a.baseline_price)
                  .map(({ a, p }) => (
                    <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <Thumb src={p.image} />
                      <div className="min-w-0 flex-1">
                        <Link href={`/p/${p.id}`} className="line-clamp-1 font-medium hover:underline">{p.title}</Link>
                        <div className="text-xs text-ink-mute">{TIER_INFO[a.tier].label} · until {dateShort(a.expires_at)}</div>
                        {elsewhere(p.id)}
                      </div>
                      <div className="font-semibold">{inr(p.price)}</div>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </section>

        <div className="space-y-6">
          {endingSoon.length > 0 && (
            <section className="card border-amber-200 bg-amber-50 p-5">
              <h2 className="font-bold">Ending soon</h2>
              <p className="mb-2 text-sm text-ink-soft">These watches end within 2 days. Extend them on My alerts.</p>
              <ul className="space-y-1 text-sm">
                {endingSoon.map(({ a, p }) => (
                  <li key={a.id} className="flex justify-between gap-2">
                    <span className="line-clamp-1">{p.title}</span>
                    <span className="shrink-0 text-ink-mute">{dateShort(a.expires_at)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">Your cart</h2>
              <Link href="/cart" className="text-sm font-semibold text-brand underline">Open cart</Link>
            </div>
            {data.cart.length === 0 ? (
              <p className="text-sm text-ink-soft">Nothing saved yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.cart.slice(0, 4).map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <Thumb src={p.image} />
                    <Link href={`/p/${p.id}`} className="line-clamp-2 min-w-0 flex-1 font-medium hover:underline">{p.title}</Link>
                    <span className="font-semibold">{inr(p.price)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5 text-sm">
            <h2 className="mb-1 font-bold">Your account</h2>
            <p className="text-ink-soft">{user.email}</p>
            <p className="mt-2 text-ink-soft">Alerts go to the email or WhatsApp number you entered when you tracked each product.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
