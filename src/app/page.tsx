import Link from 'next/link';
import LinkInput from '@/components/LinkInput';
import { read } from '@/lib/db';
import { inr } from '@/lib/format';
import { PLATFORM_NAMES } from '@/lib/scraper';

export const dynamic = 'force-dynamic';

const STEPS = [
  { n: '1', t: 'Paste the link', d: 'Any product page from Amazon, Flipkart, Myntra, AJIO or Meesho.' },
  { n: '2', t: 'Compare stores, get the coupon', d: 'See the same product on Amazon, Flipkart, Croma and more — cheapest first — plus live coupon codes and bank offers.' },
  { n: '3', t: 'Not yet? We watch the price', d: 'Pick 7 or 15 days. When it drops, you get an email or WhatsApp with the buy link.' },
];

export default function Home() {
  const recent = read((d) =>
    Object.values(d.products)
      .filter((p) => !p.last_error)
      .sort((a, b) => Date.parse(b.last_checked_at) - Date.parse(a.last_checked_at))
      .slice(0, 8),
  );

  return (
    <div className="space-y-14">
      <section className="mx-auto max-w-3xl pt-6 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          Never overpay <span className="text-brand">online</span> again.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-ink-soft">
          Paste a product link. Buy now with the best coupon — or let us alert you on email or WhatsApp the moment the price drops.
        </p>
        <div className="mt-8">
          <LinkInput />
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs text-ink-mute">
          {['Amazon', 'Flipkart', 'Myntra', 'AJIO', 'Meesho'].map((s) => (
            <span key={s} className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">{s}</span>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="card p-5">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-brand-light font-bold text-brand-dark">{s.n}</div>
            <h3 className="mt-3 font-bold">{s.t}</h3>
            <p className="mt-1 text-sm text-ink-soft">{s.d}</p>
          </div>
        ))}
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold">Recently checked</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {recent.map((p) => (
              <Link key={p.id} href={`/p/${p.id}`} className="card overflow-hidden transition hover:shadow-md">
                <div className="grid aspect-square place-items-center bg-white p-4">
                  {p.image ? <img src={p.image} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-4xl">🛍️</span>}
                </div>
                <div className="border-t border-slate-100 p-3">
                  <div className="line-clamp-2 text-sm font-medium">{p.title}</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-bold">{inr(p.price)}</span>
                    <span className="text-xs text-ink-mute">{PLATFORM_NAMES[p.platform]}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
