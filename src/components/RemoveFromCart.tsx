'use client';

import { useRouter } from 'next/navigation';
import { callApi } from '@/lib/api-client';

export default function RemoveFromCart({ productId }: { productId: string }) {
  const router = useRouter();
  return (
    <button
      className="text-sm text-ink-mute underline hover:text-red-600"
      onClick={async () => {
        await callApi('/api/cart', { method: 'DELETE', body: { product_id: productId } });
        router.refresh();
      }}
    >
      Remove
    </button>
  );
}
