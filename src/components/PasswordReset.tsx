'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/lib/api-client';

// "Forgot password?" (ask for the email) and the page the emailed link opens (choose a new password).
export default function PasswordReset({ mode, token }: { mode: 'forgot' | 'reset'; token?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = Object.fromEntries(new FormData(e.currentTarget));
    if (mode === 'reset' && body.password !== body.confirm) {
      setBusy(false);
      return setError('The two passwords do not match.');
    }
    const { ok, data } = await callApi(`/api/auth/${mode}`, { body: { ...body, token } });
    setBusy(false);
    if (!ok) return setError(data.error || 'Something went wrong.');
    if (mode === 'forgot') return setSentTo(String(body.email));
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-bold">{mode === 'forgot' ? 'Forgot your password?' : 'Choose a new password'}</h1>
        {sentTo ? (
          <div className="mt-4 rounded-xl bg-deal-light p-4 text-sm text-deal">
            <b>Check your inbox.</b> If <b>{sentTo}</b> has a DealRadar account, we have sent it a link to reset the password. It works for 1 hour.
            <p className="mt-2 text-ink-soft">Nothing arrived? Look in Spam, or <button onClick={() => setSentTo('')} className="font-semibold text-brand underline">send it again</button>.</p>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-soft">
              {mode === 'forgot' ? 'Enter the email you signed up with and we will send you a link to reset it.' : 'Pick a password you have not used here before.'}
            </p>
            <form onSubmit={submit} className="mt-6 space-y-3">
              {mode === 'forgot' ? (
                <div>
                  <label className="label" htmlFor="fp-email">Email</label>
                  <input id="fp-email" name="email" type="email" className="input" autoComplete="email" required />
                </div>
              ) : (
                <>
                  <div>
                    <label className="label" htmlFor="rp-pass">New password</label>
                    <input id="rp-pass" name="password" type="password" className="input" minLength={8} autoComplete="new-password" required />
                    <p className="mt-1 text-xs text-ink-mute">At least 8 characters.</p>
                  </div>
                  <div>
                    <label className="label" htmlFor="rp-confirm">Type it again</label>
                    <input id="rp-confirm" name="confirm" type="password" className="input" minLength={8} autoComplete="new-password" required />
                  </div>
                </>
              )}
              {error && <p className="text-sm font-medium text-red-600">{error}</p>}
              <button className="btn-primary w-full py-3" disabled={busy}>{busy ? 'Please wait…' : mode === 'forgot' ? 'Send reset link' : 'Save password and sign in'}</button>
            </form>
          </>
        )}
      </div>
      <p className="mt-4 text-center text-sm text-ink-soft">
        {mode === 'reset' && error ? (
          <Link href="/forgot" className="font-semibold text-brand underline">Ask for a new reset link</Link>
        ) : (
          <>Remembered it? <Link href="/login" className="font-semibold text-brand underline">Sign in</Link></>
        )}
      </p>
    </div>
  );
}
