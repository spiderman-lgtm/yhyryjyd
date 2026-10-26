'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/lib/api-client';

export type ChannelKey = 'email' | 'whatsapp' | 'telegram' | 'm91';
export interface Chip {
  channel: ChannelKey;
  detail: string | null;
  on: boolean;
}

const LOOK: Record<ChannelKey, { name: string; icon: string; color: string }> = {
  email: { name: 'Email', icon: '✉', color: '#ea4335' },
  whatsapp: { name: 'WhatsApp', icon: '✆', color: '#25d366' },
  telegram: { name: 'Telegram', icon: '✈', color: '#229ed9' },
  m91: { name: 'Phone ring', icon: '📳', color: '#ef4444' },
};

// Where an alert goes, one chip per channel: ✕ stops that channel only, "Turn on" brings it back.
export default function AlertChannelChips({ id, chips: initial }: { id: string; chips: Chip[] }) {
  const router = useRouter();
  const [chips, setChips] = useState(initial);
  const [toast, setToast] = useState<ChannelKey | null>(null);
  const [confirmLast, setConfirmLast] = useState<ChannelKey | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = async (channel: ChannelKey, on: boolean) => {
    setBusy(true);
    setError('');
    const { ok, data } = await callApi<Record<string, any>>(`/api/alerts/${id}`, { body: { op: 'channel', channel, on } });
    setBusy(false);
    if (!ok) return setError(data.error || 'Could not change it.');
    setChips((cs) => cs.map((c) => (c.channel === channel ? { ...c, on } : c)));
    setToast(on ? null : channel);
    setConfirmLast(null);
    if (data.alert?.status !== 'active') router.refresh();
  };

  const stop = (channel: ChannelKey) => {
    // The last channel stops the whole alert, so ask first.
    if (chips.filter((c) => c.on).length === 1) setConfirmLast(channel);
    else void set(channel, false);
  };

  return (
    <div className="mt-2">
      <p className="text-[11px] font-extrabold tracking-wider text-ink-mute">ALERTS GO TO · TAP ✕ TO STOP ONE</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {chips.map((c) => {
          const look = LOOK[c.channel];
          return c.on ? (
            <span key={c.channel} className={`flex items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-1 text-[13px] font-semibold ${c.channel === 'm91' ? 'border-red-300 bg-red-50' : 'border-slate-300 bg-white'}`}>
              <span className="grid h-5 w-5 place-items-center rounded-full text-[11px] text-white" style={{ background: look.color }} aria-hidden="true">{look.icon}</span>
              {look.name}
              {c.detail && <span className="font-normal text-ink-soft">· {c.detail}</span>}
              <button disabled={busy} onClick={() => stop(c.channel)} title={`Stop ${look.name} alerts for this product`} className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-xs font-bold text-ink-mute hover:bg-red-100 hover:text-red-600">✕</button>
            </span>
          ) : (
            <span key={c.channel} className="flex items-center gap-1.5 rounded-full border border-dashed border-slate-300 bg-slate-50 py-1 pl-2.5 pr-3 text-[13px] text-ink-mute">
              <span className="grid h-5 w-5 place-items-center rounded-full text-[11px] text-white opacity-50 grayscale" style={{ background: look.color }} aria-hidden="true">{look.icon}</span>
              <s>{look.name}</s> · stopped
              <button disabled={busy} onClick={() => set(c.channel, true)} className="font-bold text-brand hover:underline">Turn on</button>
            </span>
          );
        })}
      </div>
      {toast && (
        <div className="mt-2 flex w-fit items-center gap-3 rounded-xl bg-ink px-4 py-2 text-sm text-white">
          🔕 {LOOK[toast].name} alerts stopped for this product.
          <button onClick={() => set(toast, true)} className="font-bold text-orange-300 hover:underline">Undo</button>
        </div>
      )}
      {confirmLast && (
        <div className="mt-2 w-fit rounded-xl border border-red-200 bg-red-50 p-3 text-sm">
          <b>This is the last one — stop all alerts for this product?</b>
          <div className="mt-2 flex gap-2">
            <button disabled={busy} onClick={() => set(confirmLast, false)} className="btn-ghost py-1.5 text-red-600">Yes, stop all</button>
            <button onClick={() => setConfirmLast(null)} className="btn-ghost py-1.5">Keep</button>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
