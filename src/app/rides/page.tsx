import RideCompare from '@/components/RideCompare';

export const metadata = {
  title: 'Compare Rapido, Ola, Uber & Namma Yatri fares — DealRadar',
  description: 'Enter where you start and where you are going: see bike, auto and cab fares on Rapido, Ola, Uber, Namma Yatri and inDrive side by side, then book on the cheapest.',
};

export default function RidesPage({ searchParams }: { searchParams: { from?: string; to?: string; city?: string } }) {
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 px-6 py-10 text-white shadow-2xl shadow-teal-900/20 sm:px-12">
        <div aria-hidden className="absolute -right-10 -top-16 h-72 w-72 rounded-full bg-white/20 blur-3xl" />
        <div className="relative max-w-2xl">
          <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">New · Ride fare compare</span>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">Cheapest ride, every app</h1>
          <p className="mt-2 text-white/85">Bike, auto and cab fares on Rapido, Ola, Uber, Namma Yatri and inDrive side by side. Pick the cheapest and book it in that app.</p>
        </div>
      </section>
      <RideCompare initial={{ from: searchParams.from ?? '', to: searchParams.to ?? '', city: searchParams.city ?? '' }} />
    </div>
  );
}
