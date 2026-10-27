'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/lib/api-client';

// Buttons on the magic-link page: per alert Pause / Delete, or Stop everything / This wasn't me.
export default function ManageActions({ k, v, t, alertId, everything }: { k: string; v: string; t: string; alertId?: string; everything?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'' | 'stop_all' | 'not_me'>('');
  const act = async (op: string) => {
    setBusy(op);
    setError('');
    const { ok, data } = await callApi('/api/manage', { body: { k, v, t, op, alert_id: alertId } });
    setBusy('');
    if (!ok) return setError(data.error || 'Could not do that.');
    setConfirm('');
    router.refresh();
  };
  if (everything)
    return confirm ? (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3">
        <b>{confirm === 'not_me' ? 'Block every DealRadar alert to this address?' : 'Stop every DealRadar alert to this address?'}</b>
        <div className="mt-2 flex gap-2">
          <button disabled={!!busy} onClick={() => act(confirm)} className="btn-ghost py-1.5 text-red-600">{busy ? '…' : 'Yes, stop everything'}</button>
          <button onClick={() => setConfirm('')} className="btn-ghost py-1.5">Keep</button>
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    ) : (
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setConfirm('stop_all')} className="btn-ghost py-1.5 text-red-600">Stop everything</button>
        <button onClick={() => setConfirm('not_me')} className="btn-ghost py-1.5">This wasn't me</button>
      </div>
    );
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex gap-2">
        <button disabled={!!busy} onClick={() => act('pause')} className="btn-ghost px-3 py-1.5 text-xs">{busy === 'pause' ? '…' : 'Pause'}</button>
        <button disabled={!!busy} onClick={() => act('delete')} className="btn-ghost px-3 py-1.5 text-xs text-red-600">{busy === 'delete' ? '…' : 'Delete'}</button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
