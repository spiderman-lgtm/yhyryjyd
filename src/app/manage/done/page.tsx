import Link from 'next/link';

export const metadata = { title: 'DealRadar', robots: { index: false } };

export default function Done({ searchParams }: { searchParams: { msg?: string } }) {
  return (
    <div className="card mx-auto max-w-lg space-y-3 p-6 text-center">
      <p className="font-semibold">{searchParams.msg || 'Done.'}</p>
      <Link href="/alerts" className="font-semibold text-brand underline">My alerts</Link>
    </div>
  );
}
