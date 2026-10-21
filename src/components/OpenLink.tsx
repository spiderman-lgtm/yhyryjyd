'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const STEPS = ['Reading the product page', 'Checking the price', 'Building the price history'];

export default function OpenLink({ url }: { url: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2500);
    fetch('/api/product', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.id) router.replace(`/p/${d.id}`);
        else setError(d.error || 'Could not open that product.');
      })
      .catch(() => setError('Could not open that product.'))
      .finally(() => clearInterval(t));
    return () => clearInterval(t);
  }, [url, router]);

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      {error ? (
        <div className="card p-8">
          <h1 className="text-xl font-bold">We couldn’t open that link</h1>
          <p className="mt-2 text-sm text-ink-soft">{error}</p>
          <Link href="/" className="btn-primary mt-5">Try another link</Link>
        </div>
      ) : (
        <>
          <motion.div
            className="mx-auto h-20 w-20 rounded-3xl bg-gradient-to-br from-orange-400 to-pink-500 shadow-xl shadow-orange-500/30"
            animate={{ rotate: [0, 90, 180, 270, 360], borderRadius: ['24px', '40px', '24px', '40px', '24px'] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <h1 className="mt-8 text-2xl font-extrabold">{STEPS[step]}…</h1>
          <p className="mt-2 break-all text-sm text-ink-mute">{url}</p>
        </>
      )}
    </div>
  );
}
