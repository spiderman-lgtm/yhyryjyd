import Link from 'next/link';
import CouponCard, { type CouponView } from '@/components/CouponCard';
import { Reveal, Stagger, StaggerItem } from '@/components/Motion';
import StoreLogo from '@/components/StoreLogo';
import StoreIcon from '@/components/StoreIcon';
import { isOwner } from '@/lib/auth';
import type { CouponCategory, StoreCoupon } from '@/lib/db';
import { couponDirectory } from '@/lib/feeds';
import { PLATFORM_NAMES } from '@/lib/scraper';
import { CATEGORY_LABELS, couponDomain, couponStores, liveCoupons, liveGiftCards, storeSlug } from '@/lib/storecoupons';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Coupons & offers — DealRadar',
  description: 'Working coupon codes and deals for AJIO, Myntra, Flipkart, Amazon and more. Show the code, copy it and shop.',
};

const view = (c: StoreCoupon): CouponView => ({
  id: c.id,
  store: c.store,
  slug: storeSlug(c.store),
  logo_url: c.logo_url,
  domain: couponDomain(c),
  title: c.title,
  discount_text: c.discount_text,
  code: c.code,
  description: c.description,
  expires_at: c.expires_at,
  exclusive: c.exclusive,
  clicks: c.clicks,
});

const rank = (a: StoreCoupon, b: StoreCoupon) => Number(b.featured) - Number(a.featured) || b.clicks - a.clicks || Date.parse(b.created_at) - Date.parse(a.created_at);

export default function CouponsPage({ searchParams }: { searchParams: { store?: string; cat?: string; q?: string } }) {
  const all = liveCoupons();
  const stores = couponStores(all);
  const q = (searchParams.q ?? '').trim().toLowerCase().slice(0, 60);
  const store = stores.find((s) => s.slug === searchParams.store) ?? null;
  const cat = (Object.keys(CATEGORY_LABELS) as CouponCategory[]).includes(searchParams.cat as CouponCategory) ? (searchParams.cat as CouponCategory) : null;
  const owner = isOwner();
  const gifts = liveGiftCards().length;

  const matches = all
    .filter((c) => !store || storeSlug(c.store) === store.slug)
    .filter((c) => !q || `${c.store} ${c.title} ${c.description} ${c.code ?? ''}`.toLowerCase().includes(q));
  const cats = (Object.keys(CATEGORY_LABELS) as CouponCategory[])
    .map((k) => ({ k, n: matches.filter((c) => c.category === k).length }))
    .filter((x) => x.n > 0);
  const shown = matches.filter((c) => !cat || c.category === cat).sort(rank);
  const top = stores[0];
  const productOffers = store || q || cat ? [] : couponDirectory();
  const href = (p: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ store: store?.slug ?? null, q: q || null, cat, ...p })) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `/coupons?${s}` : '/coupons';
  };

  return (
    <div className="space-y-10">
      <Reveal>
        <section className="hero-bg relative overflow-hidden rounded-[2rem] px-6 py-8 ring-1 ring-orange-100 sm:px-10">
          <div className="blob blob-a" />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div>
              {store ? (
                <div className="flex items-center gap-4">
                  <StoreLogo store={store.store} logo={store.logo_url} domain={store.domain} size="lg" />
                  <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">{store.store} coupons & offers</h1>
                    <p className="mt-1 text-ink-soft">{store.count} working offer{store.count > 1 ? 's' : ''} · <Link href="/coupons" className="font-semibold text-brand hover:underline">All stores</Link></p>
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Coupons & offers</h1>
                  <p className="mt-1 text-ink-soft">
                    {all.length ? `${all.length} working codes and deals from ${stores.length} store${stores.length > 1 ? 's' : ''}.` : 'Working codes and deals from your favourite stores.'} Tap “Show code”, copy it, shop.
                  </p>
                </>
              )}
            </div>
            <form action="/coupons" className="flex w-full max-w-sm gap-2">
              {store && <input type="hidden" name="store" value={store.slug} />}
              <input name="q" defaultValue={q} placeholder="Search stores or offers" aria-label="Search coupons" className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand" />
              <button className="btn-primary px-4">Search</button>
            </form>
          </div>
        </section>
      </Reveal>

      {!store && !q && gifts > 0 && (
        <Link href="/gift-cards" className="group flex items-center gap-4 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-4 text-white shadow-lg shadow-indigo-900/20 transition hover:-translate-y-0.5">
          <span className="text-3xl" aria-hidden="true">🎁</span>
          <span className="flex-1">
            <span className="block font-bold">Save more with gift cards</span>
            <span className="text-sm text-white/80">{gifts} store gift card{gifts > 1 ? 's' : ''} at a discount — pay with them for extra savings.</span>
          </span>
          <span className="font-semibold transition group-hover:translate-x-1">View ›</span>
        </Link>
      )}

      {!store && !q && stores.length > 0 && (
        <section>
          <Reveal><h2 className="mb-4 text-2xl font-extrabold">Popular stores</h2></Reveal>
          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <Link href={`/coupons?store=${top.slug}`} className="group relative flex flex-col justify-between overflow-hidden rounded-2xl bg-ink p-5 text-white shadow-xl transition hover:-translate-y-1">
              <div>
                <div className="text-lg font-black uppercase text-yellow-300">Most popular</div>
                <div className="font-semibold">Store of the month</div>
              </div>
              <div className="my-6 grid place-items-center">
                <StoreLogo store={top.store} logo={top.logo_url} domain={top.domain} size="lg" />
              </div>
              <div className="flex justify-between border-t border-white/15 pt-3 text-xs">
                <span>{top.count} offer{top.count > 1 ? 's' : ''}</span>
                <span>{top.clicks} used</span>
              </div>
            </Link>
            <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {stores.slice(0, 12).map((s) => (
                <StaggerItem key={s.slug}>
                  <Link href={`/coupons?store=${s.slug}`} className="card flex h-full flex-col items-center gap-2 p-3 text-center transition hover:-translate-y-1 hover:shadow-md">
                    <StoreLogo store={s.store} logo={s.logo_url} domain={s.domain} />
                    <span className="text-sm font-semibold">{s.store}</span>
                    <span className="text-xs text-ink-mute">{s.count} offer{s.count > 1 ? 's' : ''}</span>
                  </Link>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>
      )}

      <section>
        <Reveal>
          <h2 className="mb-3 text-2xl font-extrabold">{store ? `All ${store.store} offers` : q ? `Results for “${q}”` : 'Today’s top coupons & offers'}</h2>
        </Reveal>
        {cats.length > 1 && (
          <div className="mb-4 flex flex-wrap gap-2">
            <Link href={href({ cat: null })} className={!cat ? 'chip-on' : 'chip-off'}>Most used</Link>
            {cats.map((x) => (
              <Link key={x.k} href={href({ cat: x.k })} className={cat === x.k ? 'chip-on' : 'chip-off'}>
                {CATEGORY_LABELS[x.k]} ({x.n})
              </Link>
            ))}
          </div>
        )}
        {shown.length > 0 ? (
          <Stagger className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {shown.slice(0, store ? 200 : 60).map((c) => (
              <StaggerItem key={c.id}>
                <CouponCard c={view(c)} showStoreLink={!store} />
              </StaggerItem>
            ))}
          </Stagger>
        ) : (
          <div className="card p-10 text-center text-ink-soft">
            {q ? 'No offers match that search.' : 'No coupons added yet.'}
            {owner && (
              <>
                {' '}
                <Link href="/admin#coupons" className="font-semibold text-brand underline">Add coupons in Automation → Coupons</Link>
              </>
            )}
          </div>
        )}
      </section>

      {productOffers.length > 0 && (
        <section>
          <Reveal>
            <h2 className="text-2xl font-extrabold">Bank & card offers on products</h2>
            <p className="mb-4 mt-1 text-sm text-ink-soft">Offers DealRadar found while checking products in the last 7 days. They apply automatically when you pay with the card shown.</p>
          </Reveal>
          {productOffers.map((g) => {
            return (
              <div key={g.platform} className="mb-6">
                <h3 className="mb-3 flex items-center gap-2 text-lg font-bold">
                  <StoreIcon store={PLATFORM_NAMES[g.platform]} className="h-7 w-7 rounded-lg text-xs" />
                  {PLATFORM_NAMES[g.platform]}
                </h3>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {g.coupons.slice(0, 6).map((c, i) => (
                    <div key={i} className="card flex h-full flex-col gap-1.5 p-4">
                      <div className="text-lg font-extrabold text-deal">{c.discount_text || c.title}</div>
                      <div className="text-sm font-medium">{c.title}</div>
                      {c.conditions && <p className="text-xs text-ink-mute">{c.conditions}</p>}
                      <Link href={`/p/${c.product.id}`} className="line-clamp-1 text-xs text-ink-soft hover:underline">On: {c.product.title}</Link>
                      <div className="mt-auto flex gap-2 pt-2">
                        {c.code && <span className="rounded-lg border-2 border-dashed border-brand bg-brand-light px-2 py-1 font-mono text-xs font-bold text-brand-dark">{c.code}</span>}
                        <a href={`/api/buy/${c.product.id}`} target="_blank" rel="noopener" className="btn-dark flex-1 py-2 text-sm">Shop on {PLATFORM_NAMES[g.platform]} →</a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
