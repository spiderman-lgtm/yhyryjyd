import StoreIcon from './StoreIcon';
import { affiliateUrl } from '@/lib/coupons';
import type { FlashDeal } from '@/lib/catalog';
import { inr } from '@/lib/format';

// Deal cards: the product on the right with its discount tag, the name, today's price against the MRP, and the
// store's best coupon as an extra saving.
export default function FlashDeals({ deals, updated }: { deals: FlashDeal[]; updated: string | null }) {
  if (!deals.length) return null;
  const hours = updated ? Math.max(1, Math.round((Date.now() - Date.parse(updated)) / 3600_000)) : null;
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-extrabold">⚡ Flash deals</h2>
        {hours && <span className="text-xs text-ink-mute">Prices checked {hours === 1 ? 'within the hour' : `${hours} hours ago`}</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {deals.map((d) => (
          <a
            key={d.url}
            href={affiliateUrl(d.url)}
            target="_blank"
            rel="noopener nofollow sponsored"
            className="group relative flex flex-col overflow-hidden rounded-2xl bg-gradient-to-br from-sky-50 via-cyan-50 to-sky-100 p-3 ring-1 ring-sky-100 transition duration-300 hover:-translate-y-1 hover:shadow-xl"
          >
            <div className="flex items-start justify-between gap-2">
              <StoreIcon store={d.store} className="h-5 w-5 shrink-0 rounded text-[9px]" />
              <div className="relative h-24 w-24 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {d.image && <img src={d.image} alt="" loading="lazy" className="h-full w-full object-contain mix-blend-multiply transition-transform duration-500 group-hover:scale-105" />}
                <span className="absolute -bottom-1 -left-2 rounded-md bg-red-600 px-1.5 py-0.5 text-[11px] font-extrabold leading-tight text-white shadow">
                  {d.off}%<br />off
                </span>
              </div>
            </div>
            <div className="mt-2 text-[11px] text-ink-mute">{d.category}</div>
            <div className="line-clamp-2 text-sm font-bold leading-snug text-ink">{d.title}</div>
            <div className="mt-auto border-t border-sky-200/70 pt-2">
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-extrabold">{inr(d.price)}</span>
                <span className="text-xs text-ink-mute line-through">{inr(d.mrp)}</span>
              </div>
              {d.extra && <div className="line-clamp-1 text-[11px] font-semibold text-brand-dark">+ Extra: {d.extra}</div>}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
