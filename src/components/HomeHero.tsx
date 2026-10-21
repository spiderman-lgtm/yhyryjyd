import Hero3D from './Hero3D';
import LinkInput from './LinkInput';
import { CountUp, FloatIn } from './Motion';
import { siteStats } from '@/lib/feeds';

export function HomeHero({ greeting }: { greeting?: string }) {
  const stats = siteStats();
  return (
    <section className="hero-bg relative overflow-hidden rounded-[2rem] px-6 py-10 ring-1 ring-orange-100 sm:px-12 sm:py-14">
      <div className="blob blob-a" />
      <div className="blob blob-b" />
      <div className="relative grid items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
        <FloatIn>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-brand-dark ring-1 ring-orange-200 backdrop-blur">
            <span className="h-2 w-2 animate-pulse rounded-full bg-deal" /> {greeting ?? 'Tracking prices across 11 Indian stores'}
          </span>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Never overpay <span className="bg-gradient-to-r from-orange-500 to-pink-500 bg-clip-text text-transparent">online</span> again.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-ink-soft">
            Compare prices, see every price drop and hike, and get the best coupon — or let us alert you on email or WhatsApp the moment it gets cheaper.
          </p>
          <div className="mt-7">
            <LinkInput />
          </div>
          <p className="mt-3 text-xs text-ink-mute">
            Tip: add <b className="text-ink-soft">dealradar.embarko.app/</b> before any product link to open its price history.
          </p>
        </FloatIn>
        <Hero3D className="h-[300px] w-full sm:h-[420px]" />
      </div>
      <div className="relative mt-8 grid grid-cols-3 gap-3 rounded-2xl bg-white/70 p-4 text-center ring-1 ring-orange-100 backdrop-blur sm:max-w-xl">
        {/* Live counters only once they are meaningful; until then, what the product does. */}
        {stats.products >= 100 ? (
          <>
            <div><div className="text-2xl font-extrabold"><CountUp value={stats.products} /></div><div className="text-xs text-ink-mute">products tracked</div></div>
            <div><div className="text-2xl font-extrabold"><CountUp value={stats.alerts} /></div><div className="text-xs text-ink-mute">price alerts on</div></div>
          </>
        ) : (
          <>
            <div><div className="text-2xl font-extrabold"><CountUp value={15} /> min</div><div className="text-xs text-ink-mute">fastest price checks</div></div>
            <div><div className="text-2xl font-extrabold">Email + WA</div><div className="text-xs text-ink-mute">drop alerts</div></div>
          </>
        )}
        <div><div className="text-2xl font-extrabold"><CountUp value={11} /></div><div className="text-xs text-ink-mute">stores compared</div></div>
      </div>
    </section>
  );
}
