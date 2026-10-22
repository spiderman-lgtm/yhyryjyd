import { NextResponse } from 'next/server';
import { findUserByEmail, normalizeEmail, recordFailure, resetToken, tooManyAttempts, validEmail } from '@/lib/auth';
import { queueMail, resetEmail } from '@/lib/alerts';
import { sendQueuedMailNow } from '@/lib/flows';
import { appUrl } from '@/lib/config';

export const dynamic = 'force-dynamic';

// Emails a reset link. The reply is the same whether or not the address has an account,
// so the form cannot be used to find out who is signed up.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const email = normalizeEmail(String(b.email || ''));
  if (!validEmail(email)) return NextResponse.json({ error: 'Enter the email you signed up with.' }, { status: 400 });
  const key = `forgot:${email}`;
  if (tooManyAttempts(key)) return NextResponse.json({ error: 'Too many reset emails asked for. Try again in 15 minutes.' }, { status: 429 });
  recordFailure(key);

  const user = findUserByEmail(email);
  if (user) {
    const { subject, html } = resetEmail(user.name, `${appUrl()}/reset?token=${encodeURIComponent(resetToken(user))}`);
    queueMail(user.email, subject, html);
    sendQueuedMailNow().catch((e) => console.error('reset email:', e instanceof Error ? e.message : e));
  }
  return NextResponse.json({ ok: true });
}
