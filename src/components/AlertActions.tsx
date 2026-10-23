'use client';

import { useRouter } from 'next/navigation';
import { callApi } from '@/lib/api-client';

export default function AlertActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const act = async (op: 'cancel' | 'extend') => {
    await callApi(`/api/alerts/${id}`, { body: { op } });
    router.refresh();
  };
  return (
    <div className="flex gap-2">
      {status !== 'cancelled' && <button onClick={() => act('extend')} className="btn-ghost py-1.5">{status === 'active' ? 'Extend' : 'Watch again'}</button>}
      {status === 'active' && <button onClick={() => act('cancel')} className="btn-ghost py-1.5 text-red-600">Stop</button>}
    </div>
  );
}
