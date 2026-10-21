'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const ERRORS: Record<string, string> = {
  google_off: 'Google sign-in is not switched on yet. Use your email and password.',
  google_cancelled: 'Google sign-in was cancelled.',
  google_failed: 'Google sign-in did not work. Please try again.',
};

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

export default function AuthForm({ mode, next, google, error: initialError }: { mode: 'login' | 'signup'; next: string; google: boolean; error?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ? ERRORS[initialError] ?? '' : '');
  const isSignup = mode === 'signup';
  const q = next !== '/' ? `?next=${encodeURIComponent(next)}` : '';

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch(`/api/auth/${isSignup ? 'signup' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      return setError(data.error || 'Something went wrong.');
    }
    router.push(next === '/' ? '/dashboard' : next);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-bold">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {isSignup ? 'Keep your price alerts and cart on every device.' : 'Sign in to see your alerts and cart.'}
        </p>

        {google && (
          <>
            <a href={`/api/auth/google?next=${encodeURIComponent(next)}`} className="btn-ghost mt-6 w-full py-3">
              <GoogleIcon /> Continue with Google
            </a>
            <div className="my-5 flex items-center gap-3 text-xs text-ink-mute">
              <span className="h-px flex-1 bg-slate-200" /> or with email <span className="h-px flex-1 bg-slate-200" />
            </div>
          </>
        )}

        <form onSubmit={submit} className={`space-y-3 ${google ? '' : 'mt-6'}`}>
          {isSignup && (
            <div>
              <label className="label" htmlFor="au-name">Name</label>
              <input id="au-name" name="name" className="input" autoComplete="name" required />
            </div>
          )}
          <div>
            <label className="label" htmlFor="au-email">Email</label>
            <input id="au-email" name="email" type="email" className="input" autoComplete="email" required />
          </div>
          <div>
            <label className="label" htmlFor="au-pass">Password</label>
            <input id="au-pass" name="password" type="password" className="input" minLength={isSignup ? 8 : undefined} autoComplete={isSignup ? 'new-password' : 'current-password'} required />
            {isSignup && <p className="mt-1 text-xs text-ink-mute">At least 8 characters.</p>}
          </div>
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
          <button className="btn-primary w-full py-3" disabled={busy}>{busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}</button>
        </form>
      </div>
      <p className="mt-4 text-center text-sm text-ink-soft">
        {isSignup ? 'Already have an account? ' : 'New to DealRadar? '}
        <Link href={`/${isSignup ? 'login' : 'signup'}${q}`} className="font-semibold text-brand underline">{isSignup ? 'Sign in' : 'Create an account'}</Link>
      </p>
    </div>
  );
}
