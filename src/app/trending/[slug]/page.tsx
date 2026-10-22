import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DealCard } from '@/components/DealRow';
import { Reveal } from '@/components/Motion';
import { CATEGORIES, catalog } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { slug: string } }) {
  const c = CATEGORIES.find((x) => x.slug === params.slug);
  return c ? { title: `${c.title} deals — DealRadar`, description: `The biggest discounts on ${c.title.toLowerCase()} across Indian stores right now.` } : {};
}

export default function CategoryDeals({ params }: { params: { slug: string } }) {
  const row = catalog().find((r) => r.category.slug === params.slug);
  if (!row) notFound();
  return (
    <div className="space-y-6">
      <Reveal>
        <Link href="/trending" className="text-sm font-semibold text-indigo-700 hover:underline">← All trending deals</Link>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{row.category.title}</h1>
        <p className="mt-1 text-ink-soft">Biggest discounts first{row.fetched_at ? ` · updated ${new Date(row.fetched_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}.</p>
      </Reveal>
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-100/80 via-violet-50/80 to-sky-50/80 p-4 ring-1 ring-white/70 sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-indigo-300/40 blur-3xl" />
        <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {row.items.map((it, i) => <DealCard key={it.url} item={it} i={i % 6} />)}
        </div>
        {row.items.length === 0 && <p className="relative py-10 text-center text-ink-soft">No deals found right now — check back soon.</p>}
      </div>
    </div>
  );
}
