import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import { currentUser, googleEnabled, safeNext } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in — DealRadar' };

export default function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  const next = safeNext(searchParams.next);
  if (currentUser()) redirect(next === '/' ? '/dashboard' : next);
  return <AuthForm mode="login" next={next} google={googleEnabled()} error={searchParams.error} />;
}
