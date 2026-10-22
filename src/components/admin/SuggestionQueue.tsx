'use client';

import { useMemo, useState } from 'react';
import type { CouponSuggestion } from '@/lib/db';

const SOURCES: Record<CouponSuggestion['source'], { label: string; tone: string }> = {
  shopper: { label: 'From a shopper', tone: 'bg-violet-50 text-violet-700' },
  'amazon-coupons': { label: 'Amazon coupons page', tone: 'bg-amber-50 text-amber-700' },
  'product-offers': { label: 'Found on a product', tone: 'bg-sky-50 text-sky-700' },
};

// Offers waiting for the owner: approve to publish on the Coupons page, or reject.
export default function SuggestionQueue({ initial, checkedAt, onApproved }: { initial: CouponSuggestion[]; checkedAt: string | null; onApproved: () => void }) {
  const [items, setItems] = useState(initial);
  const [source, setSource] = useState<CouponSuggestion['source'] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const shown = useMemo(() => items.filter((s) => !source || s.source === source), [items, source]);
  const counts = useMemo(() => Object.fromEntries((Object.keys(SOURCES) as CouponSuggestion['source'][]).map((k) => [k, items.filter((s) => s.source === k).length])), [items]);

  async function act(action: 'approve' | 'reject', ids: string[]) {
    setBusy(action);
    setMsg(null);
    const res = await fetch('/api/admin/suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ids }) });
    const data = await res.json().catch(() => ({}));
    setBusy('');
    if (!res.ok) return setMsg({ ok: false, text: data.error || 'Could not do that.' });
    const failed = new Set<string>((data.errors ?? []).map((e: { id: string }) => e.id));
    setItems((xs) => xs.filter((x) => !ids.includes(x.id) || failed.has(x.id)));
    setPicked(new Set());
    if (action === 'approve') {
      setMsg({ ok: !failed.size, text: `${data.approved} coupon${data.approved === 1 ? '' : 's'} published${failed.size ? `; ${failed.size} need fixing first (${data.errors[0].error})` : ''}.` });
      onApproved();
    } else setMsg({ ok: true, text: `${ids.length} rejected.` });
  }

  async function check() {
    setBusy('check');
    setMsg(null);
    const res = await fetch('/api/admin/suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'check' }) });
    const data = await res.json().catch(() => ({}));
    setBusy('');
    if (!res.ok) return setMsg({ ok: false, text: data.error || 'Could not check the stores.' });
    setMsg({ ok: !data.errors?.length, text: `${data.added} new offer${data.added === 1 ? '' : 's'} found.${data.errors?.length ? ` ${data.errors.join(' ')}` : ''}` });
    if (data.added) setTimeout(() => window.location.reload(), 900);
  }

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/70 to-indigo-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Suggested coupons <span className="rounded-full bg-violet-600 px-2 py-0.5 text-xs font-bold text-white">{items.length}</span></h3>
          <p className="text-xs text-ink-soft">
            From shoppers and the stores’ own offer pages. Nothing goes live until you approve it.
            {checkedAt && ` Stores last checked ${new Date(checkedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`}
          </p>
        </div>
        <button onClick={check} disabled={!!busy} className="btn-ghost bg-white px-3 py-1.5">{busy === 'check' ? 'Checking stores…' : 'Check stores now'}</button>
      </div>

      {items.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <button onClick={() => setSource(null)} className={!source ? 'chip-on' : 'chip-off'}>All ({items.length})</button>
          {(Object.keys(SOURCES) as CouponSuggestion['source'][]).filter((k) => counts[k]).map((k) => (
            <button key={k} onClick={() => setSource(k)} className={source === k ? 'chip-on' : 'chip-off'}>{SOURCES[k].label} ({counts[k]})</button>
          ))}
          <span className="flex-1" />
          {picked.size > 0 && (
            <>
              <button onClick={() => act('approve', [...picked])} disabled={!!busy} className="btn-primary px-3 py-1">Approve {picked.size}</button>
              <button onClick={() => act('reject', [...picked])} disabled={!!busy} className="btn-ghost px-3 py-1">Reject {picked.size}</button>
            </>
          )}
          {picked.size === 0 && shown.length > 1 && <button onClick={() => setPicked(new Set(shown.map((s) => s.id)))} className="text-xs font-semibold text-violet-700 hover:underline">Select all shown</button>}
        </div>
      )}
      {msg && <p className={`mt-2 text-sm ${msg.ok ? 'text-deal' : 'text-red-600'}`}>{msg.text}</p>}

      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">No suggestions waiting. New ones arrive as shoppers submit coupons and when the stores are checked (every 6 hours).</p>
      ) : (
        <ul className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
          {shown.map((s) => (
            <li key={s.id} className="flex items-start gap-3 rounded-lg border border-white bg-white/90 p-2.5 text-sm shadow-sm">
              <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} className="mt-1" aria-label={`Select ${s.title}`} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {s.image ? <img src={s.image} alt="" className="h-12 w-12 shrink-0 rounded object-contain" /> : null}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${SOURCES[s.source].tone}`}>{SOURCES[s.source].label}</span>
                  <span className="font-semibold">{s.store}</span>
                  {s.discount_text && <span className="text-xs font-bold text-deal">{s.discount_text}</span>}
                  {s.code && <span className="rounded border border-dashed border-brand px-1.5 font-mono text-xs text-brand-dark">{s.code}</span>}
                </div>
                <div className="line-clamp-2">{s.title}</div>
                {s.description && <div className="line-clamp-1 text-xs text-ink-mute">{s.description}</div>}
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline">Open offer ↗</a>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button onClick={() => act('approve', [s.id])} disabled={!!busy} className="rounded-lg bg-deal px-3 py-1 text-xs font-semibold text-white hover:opacity-90">Approve</button>
                <button onClick={() => act('reject', [s.id])} disabled={!!busy} className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-ink-soft hover:border-red-300 hover:text-red-600">Reject</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
