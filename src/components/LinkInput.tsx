'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LinkInput({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/product', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      router.push(`/p/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full">
      <div className={`flex flex-col gap-2 sm:flex-row ${compact ? '' : 'rounded-2xl bg-white p-2 shadow-lg ring-1 ring-slate-200'}`}>
        <input
          className="input flex-1 border-0 text-base focus:ring-0"
          placeholder="Paste an Amazon, Flipkart, Myntra, AJIO or Meesho product link…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
          required
        />
        <button className="btn-primary px-6 py-3 text-base" disabled={busy}>
          {busy ? 'Checking price…' : 'Check price'}
        </button>
      </div>
      {busy && <p className="mt-2 text-sm text-ink-mute">Reading the product page. If the store blocks us, our AI reads it instead — this can take up to two minutes.</p>}
      {error && <p className="mt-2 text-sm font-medium text-red-600">{error}</p>}
    </form>
  );
}
