'use client';

import { useRouter } from 'next/navigation';

export default function RemoveFromCart({ productId }: { productId: string }) {
  const router = useRouter();
  return (
    <button
      className="text-sm text-ink-mute underline hover:text-red-600"
      onClick={async () => {
        await fetch('/api/cart', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: productId }) });
        router.refresh();
      }}
    >
      Remove
    </button>
  );
}
