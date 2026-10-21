'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AdminLogin() {
  const router = useRouter();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  return (
    <form
      className="card mx-auto max-w-sm space-y-3 p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
        if (res.ok) router.refresh();
        else setError((await res.json()).error || 'Sign-in failed');
      }}
    >
      <h1 className="text-lg font-bold">DealRadar admin</h1>
      <label className="label" htmlFor="admin-key">Admin key</label>
      <input id="admin-key" type="password" className="input" value={key} onChange={(e) => setKey(e.target.value)} autoFocus />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-dark w-full">Sign in</button>
    </form>
  );
}
