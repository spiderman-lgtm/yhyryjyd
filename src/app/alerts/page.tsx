import Link from 'next/link';
import { currentUser, viewerUid } from '@/lib/auth';
import AlertActions from '@/components/AlertActions';
import { read } from '@/lib/db';
import { TIER_INFO } from '@/lib/alerts';
import { dateShort, inr } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STATUS_STYLE = { active: 'bg-deal-light text-deal', expired: 'bg-slate-100 text-ink-mute', cancelled: 'bg-red-50 text-red-600' };

export default function AlertsPage({ searchParams }: { searchParams: { msg?: string } }) {
  const uid = viewerUid();
  const rows = read((d) =>
    Object.values(d.alerts)
      .filter((a) => a.uid === uid && d.products[a.product_id])
      .sort((a, b) => (a.status === 'active' ? -1 : 1) - (b.status === 'active' ? -1 : 1) || Date.parse(b.created_at) - Date.parse(a.created_at))
      .map((a) => ({ a, p: d.products[a.product_id] })),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My price alerts</h1>
        <p className="text-sm text-ink-soft">Everything we are watching for you on this device.</p>
      </div>
      {!currentUser() && (
        <div className="rounded-xl bg-white px-4 py-3 text-sm ring-1 ring-slate-200">
          These alerts are saved on this browser only. <Link href="/signup?next=/alerts" className="font-semibold text-brand underline">Create an account</Link> or{' '}
          <Link href="/login?next=/alerts" className="font-semibold text-brand underline">sign in</Link> to keep them on every device.
        </div>
      )}
      {searchParams.msg &&<div className="rounded-xl bg-brand-light px-4 py-3 text-sm font-medium text-brand-dark">{searchParams.msg}</div>}
      {rows.length === 0 && (
        <div className="card p-10 text-center text-ink-soft">
          No alerts yet. <Link href="/" className="font-semibold text-brand underline">Paste a product link</Link> and choose “Track price”.
        </div>
      )}
      <div className="space-y-3">
        {rows.map(({ a, p }) => {
          const change = p.price - a.baseline_price;
          return (
            <div key={a.id} className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
              <Link href={`/p/${p.id}`} className="grid h-20 w-20 shrink-0 place-items-center">
                {p.image ? <img src={p.image} alt="" className="max-h-full max-w-full object-contain" /> : '🛍️'}
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[a.status]}`}>{a.status}</span>
                  <span className="text-xs text-ink-mute">{TIER_INFO[a.tier].label} · {a.window_days} days · until {dateShort(a.expires_at)}</span>
                </div>
                <Link href={`/p/${p.id}`} className="mt-1 line-clamp-1 font-medium hover:underline">{p.title}</Link>
                <div className="mt-1 text-sm text-ink-soft">
                  Now <b className="text-ink">{inr(p.price)}</b> · was {inr(a.baseline_price)}
                  {change !== 0 && <span className={change < 0 ? 'text-deal' : 'text-red-600'}> ({change < 0 ? '▼' : '▲'} {inr(Math.abs(change))})</span>}
                  {' · '}alert on {a.target_price ? `≤ ${inr(a.target_price)} or ` : ''}{a.drop_percent ? `${a.drop_percent}%+ drop` : 'any drop'}
                  {' · '}via {a.channels.join(' + ')}
                </div>
              </div>
              <AlertActions id={a.id} status={a.status} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
