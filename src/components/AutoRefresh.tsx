'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Re-renders the page every few seconds while its data is still being gathered on the server.
export default function AutoRefresh({ every = 6000, times = 10 }: { every?: number; times?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => (++n > times ? clearInterval(t) : router.refresh()), every);
    return () => clearInterval(t);
  }, [router, every, times]);
  return null;
}
