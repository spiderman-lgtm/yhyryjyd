import { read } from '@/lib/db';
import { manageOk, isBlocked, type Kind } from '@/lib/contacts';
import { dateShort, inr } from '@/lib/format';
import ManageActions from '@/components/ManageActions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Manage my alerts · DealRadar', robots: { index: false } };

const showPhone = (p: string) => (/^91\d{10}$/.test(p) ? `+91 ${p.slice(2, 7)} ${p.slice(7)}` : `+${p}`);

// Reached from the link in every alert message: every active alert going to this email or number, no sign-in.
export default function ManagePage({ searchParams }: { searchParams: { k?: string; v?: string; t?: string } }) {
  const kind = searchParams.k as Kind;
  const value = searchParams.v || '';
  const t = searchParams.t || '';
  if (!manageOk(kind, value, t)) {
    return <div className="card mx-auto max-w-lg p-6 text-center text-sm">That link is not valid. Open the newest message from DealRadar and use its link.</div>;
  }
  const label = kind === 'email' ? value : showPhone(value);
  const rows = read((d) =>
    Object.values(d.alerts)
      .filter((a) => a.status === 'active' && (kind === 'email' ? a.email === value && a.channels.includes('email') : (a.phone === value && a.channels.includes('whatsapp')) || ((a.m91_phone || a.phone) === value && a.channels.includes('m91'))))
      .map((a) => ({ id: a.id, until: a.expires_at, p: d.products[a.product_id] }))
      .filter((r) => r.p),
  );
  const blocked = isBlocked(kind, value);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Manage my alerts</h1>
        <p className="text-sm text-ink-soft">Price alerts DealRadar sends to <b>{label}</b>.</p>
      </div>
      {blocked ? (
        <div className="card p-5 text-sm">✓ DealRadar sends nothing to {label}. Nobody can set alerts to it again unless its owner verifies it.</div>
      ) : rows.length === 0 ? (
        <div className="card p-5 text-sm text-ink-soft">No active alerts go to {label}.</div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="card flex items-center gap-4 p-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center">{r.p.image ? <img src={r.p.image} alt="" className="max-h-full max-w-full object-contain" /> : '🛍️'}</div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 font-medium">{r.p.title}</p>
                <p className="text-xs text-ink-mute">Now {inr(r.p.price)} · watching until {dateShort(r.until)}</p>
              </div>
              <ManageActions k={kind} v={value} t={t} alertId={r.id} />
            </li>
          ))}
        </ul>
      )}
      {!blocked && (
        <div className="card space-y-3 p-5 text-sm">
          <p>
            <b>Stop everything</b> — no more DealRadar alerts to {label}, from anyone. Nobody can add it again unless its owner verifies it.
          </p>
          <ManageActions k={kind} v={value} t={t} everything />
        </div>
      )}
    </div>
  );
}
