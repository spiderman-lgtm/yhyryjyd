import Link from 'next/link';
import PasswordReset from '@/components/PasswordReset';
import { userForResetToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reset password — DealRadar' };

export default function ResetPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token ?? '';
  if (!userForResetToken(token))
    return (
      <div className="card mx-auto max-w-sm p-6 sm:p-8">
        <h1 className="text-2xl font-bold">This link has expired</h1>
        <p className="mt-2 text-sm text-ink-soft">Reset links work for 1 hour and only once.</p>
        <Link href="/forgot" className="btn-primary mt-6 w-full py-3">Send me a new link</Link>
      </div>
    );
  return <PasswordReset mode="reset" token={token} />;
}
