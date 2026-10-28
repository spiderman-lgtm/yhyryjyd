import Link from 'next/link';
import RideCompare from '@/components/RideCompare';
import TravelCompare from '@/components/TravelCompare';

export const metadata = {
  title: 'Compare ride, bus, train & flight prices — DealRadar',
  description: 'Rapido, Ola, Uber and Namma Yatri fares for any trip in your city, and bus, train and flight fares between cities across redBus, IRCTC, MakeMyTrip, ixigo and more.',
};

const MODES = [
  { k: 'ride', icon: '🛺', t: 'Ride' },
  { k: 'bus', icon: '🚌', t: 'Bus' },
  { k: 'train', icon: '🚆', t: 'Train' },
  { k: 'flight', icon: '✈️', t: 'Flight' },
] as const;

export default function TravelPage({ searchParams }: { searchParams: { mode?: string; from?: string; to?: string; city?: string; vehicle?: string } }) {
  const mode = (MODES.find((m) => m.k === searchParams.mode)?.k ?? 'ride') as (typeof MODES)[number]['k'];
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 px-6 py-10 text-white shadow-2xl shadow-teal-900/20 sm:px-12">
        <div aria-hidden className="absolute -right-10 -top-16 h-72 w-72 rounded-full bg-white/20 blur-3xl" />
        <div className="relative max-w-2xl">
          <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">New · Travel compare</span>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">Cheapest way to get there</h1>
          <p className="mt-2 text-white/85">Rides on Rapido, Ola, Uber and Namma Yatri, and buses, trains and flights across every booking site — side by side.</p>
        </div>
      </section>
      <nav className="flex gap-2 overflow-x-auto" aria-label="Travel type">
        {MODES.map((m) => (
          <Link key={m.k} href={`/rides?mode=${m.k}`} className={`flex shrink-0 items-center gap-2 rounded-2xl border-2 px-5 py-2.5 font-bold transition ${mode === m.k ? 'border-brand bg-brand-light text-brand-dark' : 'border-slate-200 bg-white hover:border-slate-300'}`} aria-current={mode === m.k ? 'page' : undefined}>
            <span aria-hidden="true">{m.icon}</span> {m.t}
          </Link>
        ))}
      </nav>
      {mode === 'ride' ? (
        <RideCompare initial={{ from: searchParams.from ?? '', to: searchParams.to ?? '', city: searchParams.city ?? '', vehicle: searchParams.vehicle }} />
      ) : (
        <TravelCompare mode={mode} />
      )}
    </div>
  );
}
