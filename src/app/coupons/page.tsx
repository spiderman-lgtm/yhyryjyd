import Link from 'next/link';
import CopyCode from '@/components/CopyCode';
import { Reveal, Stagger, StaggerItem } from '@/components/Motion';
import { couponDirectory } from '@/lib/feeds';
import { PLATFORM_NAMES } from '@/lib/scraper';
import { STORES } from '@/lib/stores';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Coupons & offers — DealRadar', description: 'Coupon codes and bank offers found by DealRadar for Amazon, Flipkart, Myntra and more.' };

export default function CouponsPage({ searchParams }: { searchParams: { store?: string } }) {
  const groups = couponDirectory();
  const active = groups.find((g) => g.platform === searchParams.store)?.platform ?? null;
  const shown = active ? groups.filter((g) => g.platform === active) : groups;

  return (
    <div className="space-y-6">
      <Reveal>
        <h1 className="text-3xl font-extrabold tracking-tight">Coupons & offers</h1>
        <p className="mt-1 text-ink-soft">Codes and bank offers DealRadar found in the last 7 days. Open a product and tap “Buy” to search live offers for it.</p>
      </Reveal>

      {groups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Link href="/coupons" className={!active ? 'chip-on' : 'chip-off'}>All stores</Link>
          {groups.map((g) => (
            <Link key={g.platform} href={`/coupons?store=${g.platform}`} className={active === g.platform ? 'chip-on' : 'chip-off'}>
              {PLATFORM_NAMES[g.platform]} ({g.coupons.length})
            </Link>
          ))}
        </div>
      )}

      {shown.length === 0 && (
        <div className="card p-10 text-center text-ink-soft">
          No coupons collected yet. They appear here after shoppers tap “Buy” on a product.{' '}
          <Link href="/" className="font-semibold text-brand underline">Check a product</Link>
        </div>
      )}

      {shown.map((g) => {
        const color = STORES.find((s) => s.slug === g.platform)?.color ?? '#0f172a';
        return (
          <section key={g.platform}>
            <h2 className="mb-3 flex items-center gap-2 text-xl font-bold">
              <span className="grid h-8 w-8 place-items-center rounded-lg text-sm font-black text-white" style={{ background: color }}>{PLATFORM_NAMES[g.platform][0]}</span>
              {PLATFORM_NAMES[g.platform]}
            </h2>
            <Stagger className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {g.coupons.map((c, i) => (
                <StaggerItem key={i}>
                  <div className="card flex h-full flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-extrabold text-deal">{c.discount_text || c.title}</div>
                        <div className="text-sm font-medium">{c.title}</div>
                      </div>
                      {c.code ? <CopyCode code={c.code} /> : <span className="rounded-lg bg-deal-light px-2 py-1 text-xs font-bold text-deal">No code needed</span>}
                    </div>
                    {c.conditions && <p className="text-xs text-ink-mute">{c.conditions}</p>}
                    <div className="mt-auto flex items-center justify-between pt-1 text-xs">
                      <Link href={`/p/${c.product.id}`} className="line-clamp-1 text-ink-soft underline">Found for: {c.product.title}</Link>
                      <a href={c.source_url} target="_blank" rel="noopener noreferrer nofollow" className="shrink-0 pl-2 text-ink-mute underline">source</a>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </section>
        );
      })}
    </div>
  );
}
