'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/lib/api-client';

export default function AlertActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const act = async (op: 'cancel' | 'extend') => {
    await callApi(`/api/alerts/${id}`, { body: { op } });
    setConfirm(false);
    router.refresh();
  };
  // "Stop all" ends the alert on every channel, so it asks once.
  if (confirm)
    return (
      <div className="w-fit rounded-xl border border-red-200 bg-red-50 p-3 text-sm">
        <b>Stop all alerts for this product?</b>
        <div className="mt-2 flex gap-2">
          <button onClick={() => act('cancel')} className="btn-ghost py-1.5 text-red-600">Yes, stop all</button>
          <button onClick={() => setConfirm(false)} className="btn-ghost py-1.5">Keep</button>
        </div>
      </div>
    );
  return (
    <div className="flex gap-2 sm:flex-col sm:items-end">
      {status !== 'cancelled' && <button onClick={() => act('extend')} className="btn-ghost py-1.5">{status === 'active' ? 'Extend' : 'Watch again'}</button>}
      {status === 'active' && <button onClick={() => setConfirm(true)} className="btn-ghost py-1.5 text-red-600">Stop all</button>}
    </div>
  );
}
