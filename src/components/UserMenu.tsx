'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export default function UserMenu({ name, email, owner }: { name: string; email: string; owner: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="grid h-9 w-9 place-items-center rounded-full bg-ink text-sm font-bold text-white" title={email}>
        {(name || email).charAt(0).toUpperCase()}
      </button>
      {open && (
        <div className="card absolute right-0 top-11 w-56 p-2 text-sm shadow-lg">
          <div className="border-b border-slate-100 px-3 py-2">
            <div className="font-semibold">{name}</div>
            <div className="truncate text-xs text-ink-mute">{email}</div>
          </div>
          <Link href="/dashboard" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 hover:bg-slate-50">Dashboard</Link>
          {owner && <Link href="/admin" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 hover:bg-slate-50">Admin</Link>}
          <Link href="/alerts" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 hover:bg-slate-50">My alerts</Link>
          <Link href="/cart" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 hover:bg-slate-50">My cart</Link>
          <button
            className="block w-full rounded-lg px-3 py-2 text-left text-red-600 hover:bg-red-50"
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              setOpen(false);
              router.push('/');
              router.refresh();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
