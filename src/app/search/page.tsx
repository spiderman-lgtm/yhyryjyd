import LinkInput from '@/components/LinkInput';
import ProductCard from '@/components/ProductCard';
import WebResults from '@/components/WebResults';
import { Reveal, Stagger, StaggerItem } from '@/components/Motion';
import { searchProducts } from '@/lib/feeds';

export const dynamic = 'force-dynamic';

export function generateMetadata({ searchParams }: { searchParams: { q?: string } }) {
  return { title: `${searchParams.q ? `${searchParams.q} — ` : ''}Search — DealRadar` };
}

export default function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams.q || '').trim().slice(0, 120);
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
            <h2 className="mb-1 text-xl font-bold">From stores across the web</h2>
            <p className="mb-3 text-sm text-ink-soft">Tap a product to open its DealRadar page and start tracking its price.</p>
            <WebResults q={q} />
          </section>
        </>
      )}
    </div>
  );
}
