import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import { currentUser, googleEnabled, safeNext } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Create account — DealRadar' };

export default function SignupPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  const next = safeNext(searchParams.next);
  if (currentUser()) redirect(next === '/' ? '/dashboard' : next);
  return <AuthForm mode="signup" next={next} google={googleEnabled()} error={searchParams.error} />;
}
