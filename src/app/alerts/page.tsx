import Link from 'next/link';
import { currentUser, viewerUid } from '@/lib/auth';
import AlertActions from '@/components/AlertActions';
import AlertChannelChips, { type Chip, type ChannelKey } from '@/components/AlertChannelChips';
import type { Alert } from '@/lib/db';
import { read } from '@/lib/db';
import { dateShort, inr } from '@/lib/format';
import { linkFor } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

// "+91 98765 43210" for an Indian number saved as 919876543210.
const showPhone = (p: string) => (/^91\d{10}$/.test(p) ? `+91 ${p.slice(2, 7)} ${p.slice(7)}` : `+${p}`);

// One chip per channel this alert has used, on or stopped, in a fixed order.
function chipsFor(a: Alert): Chip[] {
  const order: ChannelKey[] = ['email', 'whatsapp', 'telegram', 'm91'];
  const used = new Set<string>([...a.channels, ...(a.stopped ?? [])]);
  const detail = { email: a.email, whatsapp: a.phone ? showPhone(a.phone) : null, telegram: null, m91: a.m91_phone || a.phone ? showPhone((a.m91_phone || a.phone)!) : null };
  return order.filter((c) => used.has(c)).map((c) => ({ channel: c, detail: detail[c], on: a.channels.includes(c) }));
}

const STATUS_STYLE = { active: 'bg-deal-light text-deal', expired: 'bg-slate-100 text-ink-mute', cancelled: 'bg-red-50 text-red-600' };

export default function AlertsPage({ searchParams }: { searchParams: { msg?: string } }) {
  const uid = viewerUid();
  const rows = read((d) =>
    Object.values(d.alerts)
      .filter((a) => a.uid === uid && d.products[a.product_id])
      .sort((a, b) => (a.status === 'active' ? -1 : 1) - (b.status === 'active' ? -1 : 1) || Date.parse(b.created_at) - Date.parse(a.created_at))
      .map((a) => ({ a, p: d.products[a.product_id] })),
  );
  // Alerts waiting for the shopper to press Start in the Telegram bot.
  const tgLink = rows.some(({ a }) => a.status === 'active' && a.channels.includes('telegram') && !a.telegram_chat) ? linkFor(uid) : null;

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
                  <span className="text-xs text-ink-mute">{a.window_days}-day watch · until {dateShort(a.expires_at)}</span>
                </div>
                <Link href={`/p/${p.id}`} className="mt-1 line-clamp-1 font-medium hover:underline">{p.title}</Link>
                <div className="mt-1 text-sm text-ink-soft">
                  Now <b className="text-ink">{inr(p.price)}</b> · was {inr(a.baseline_price)}
                  {change !== 0 && <span className={change < 0 ? 'text-deal' : 'text-red-600'}> ({change < 0 ? '▼' : '▲'} {inr(Math.abs(change))})</span>}
                  {' · '}alert on {a.target_price ? `≤ ${inr(a.target_price)} or ` : ''}{a.drop_percent ? `${a.drop_percent}%+ drop` : 'any drop'}
                  {a.status !== 'active' && <>{' · '}via {a.channels.join(' + ')}</>}
                </div>
                {a.status === 'active' && <AlertChannelChips id={a.id} chips={chipsFor(a)} />}
                {tgLink && a.status === 'active' && a.channels.includes('telegram') && !a.telegram_chat && (
                  <a href={tgLink} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#229ED9] hover:underline">✈️ Connect Telegram — press Start in the bot</a>
                )}
              </div>
              <AlertActions id={a.id} status={a.status} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
