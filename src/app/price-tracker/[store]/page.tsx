import { notFound } from 'next/navigation';
import LinkInput from '@/components/LinkInput';
import ProductCard from '@/components/ProductCard';
import { HowItWorks } from '@/components/HomeSections';
import { Reveal, Stagger, StaggerItem } from '@/components/Motion';
import { read } from '@/lib/db';
import { dealsFeed } from '@/lib/feeds';
import { storeBySlug } from '@/lib/stores';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { store: string } }) {
  const s = storeBySlug(params.store);
  return s
    ? { title: `${s.name} Price History Tracker — DealRadar`, description: `Track ${s.name} price history, compare prices with other stores and get price-drop alerts on email and WhatsApp.` }
    : {};
}

export default function StoreTracker({ params }: { params: { store: string } }) {
  const s = storeBySlug(params.store);
  if (!s) notFound();
  const deals = dealsFeed({ platform: s.slug }).slice(0, 10);
  const recent = read((d) =>
    Object.values(d.products)
      .filter((p) => p.platform === s.slug && !p.last_error)
      .sort((a, b) => Date.parse(b.last_checked_at) - Date.parse(a.last_checked_at))
      .slice(0, 10),
  );
  const faqs = [
    [`How do I see the price history of a ${s.name} product?`, `Copy the product link from the ${s.name} app or website and paste it in the box above. DealRadar shows its price history, a Deal Score and the same product on other stores.`],
    [`Is the ${s.name} sale price really a discount?`, 'The Deal Score checks whether the price was raised just before the sale and compares today’s price with the lowest and average prices we recorded.'],
    ['How do price-drop alerts work?', 'Set a target price or a drop percentage. DealRadar re-checks the price every 15 minutes, 2 hours or daily and messages you on email or WhatsApp when it drops.'],
  ];

  return (
    <div className="space-y-12">
      <section className="hero-bg relative overflow-hidden rounded-[2rem] px-6 py-10 ring-1 ring-orange-100 sm:px-12">
        <div className="blob blob-a" />
        <Reveal className="relative max-w-2xl">
          <span className="inline-grid h-12 w-12 place-items-center rounded-2xl text-xl font-black text-white shadow-lg" style={{ background: s.color }}>{s.name[0]}</span>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight">{s.name} Price History Tracker</h1>
          <p className="mt-2 text-lg text-ink-soft">See every price drop and hike on {s.name}, compare with other stores, and get alerted when it gets cheaper.</p>
          <div className="mt-6"><LinkInput /></div>
          <p className="mt-2 text-xs text-ink-mute">Example link: {s.example}</p>
        </Reveal>
      </section>

      {deals.length > 0 && (
        <section>
          <h2 className="mb-4 text-2xl font-extrabold">Best {s.name} deals right now</h2>
          <Stagger className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {deals.map((d) => <StaggerItem key={d.product.id}><ProductCard p={d.product} belowUsual={d.belowUsual} usual={d.usual} offMrp={d.offMrp} /></StaggerItem>)}
          </Stagger>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <h2 className="mb-4 text-2xl font-extrabold">Recently tracked on {s.name}</h2>
          <Stagger className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {recent.map((p) => <StaggerItem key={p.id}><ProductCard p={p} /></StaggerItem>)}
          </Stagger>
        </section>
      )}

      <HowItWorks />

      <section className="card divide-y divide-slate-100">
        {faqs.map(([q, a]) => (
          <details key={q} className="group p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
              {q}
              <span className="text-brand transition group-open:rotate-45">+</span>
            </summary>
            <p className="mt-2 text-sm text-ink-soft">{a}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
