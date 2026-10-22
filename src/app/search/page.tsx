import LinkInput from '@/components/LinkInput';
import ProductCard from '@/components/ProductCard';
import WebResults from '@/components/WebResults';
import { Reveal, Stagger, StaggerItem } from '@/components/Motion';
import { redirect } from 'next/navigation';
import { searchProducts } from '@/lib/feeds';
import { asLink } from '@/lib/search';

export const dynamic = 'force-dynamic';

export function generateMetadata({ searchParams }: { searchParams: { q?: string } }) {
  return { title: `${searchParams.q ? `${searchParams.q} — ` : ''}Search — DealRadar` };
}

export default function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams.q || '').trim().slice(0, 500);
  // A pasted product link opens that product's page straight away.
  const link = q ? asLink(q) : null;
  if (link) redirect(`/${link}`);
  const local = q ? searchProducts(q) : [];
  return (
    <div className="space-y-8">
      <Reveal>
        <LinkInput initial={q} />
      </Reveal>
      {q && (
        <>
          <section>
            <h1 className="mb-3 text-2xl font-extrabold">Results for “{q}”</h1>
            {local.length > 0 ? (
              <>
                <p className="mb-3 text-sm text-ink-soft">Products with price history on DealRadar</p>
                <Stagger className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
                  {local.map((p) => (
                    <StaggerItem key={p.id}>
                      <ProductCard p={p} offMrp={p.mrp && p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0} />
                    </StaggerItem>
                  ))}
                </Stagger>
              </>
            ) : (
              <p className="text-sm text-ink-soft">No product with this name has been checked on DealRadar yet.</p>
            )}
          </section>
          <section>
            <h2 className="mb-1 flex items-center gap-2 text-xl font-bold">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 text-sm text-white">✦</span>
              Smart search across stores
            </h2>
            <p className="mb-3 text-sm text-ink-soft">Matched to your words, with key features and the lowest price marked. Tap a product to see its price history and track it.</p>
            <WebResults q={q.slice(0, 120)} />
          </section>
        </>
      )}
    </div>
  );
}
