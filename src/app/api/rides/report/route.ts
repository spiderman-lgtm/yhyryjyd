import { NextResponse, type NextRequest } from 'next/server';
import { reportFare } from '@/lib/rides';
import { rateLimited } from '@/lib/ext';
import { viewerUid } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// "The app showed ₹X": corrects that city's estimates for everyone.
export async function POST(req: NextRequest) {
  const limited = rateLimited(req, 60);
  if (limited) return limited;
  const b = await req.json().catch(() => ({}));
  const estimate = Number(b.estimate);
  const actual = Number(b.actual);
  const city = String(b.city || '').toLowerCase().trim().slice(0, 40);
  if (!city || !(estimate > 0) || !(actual > 0) || actual > 20000) return NextResponse.json({ error: 'Enter the price your app showed.' }, { status: 400 });
  const who = viewerUid() || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anon';
  const error = reportFare({ city, app: String(b.app || '').slice(0, 20), label: String(b.label || '').slice(0, 60), estimate, actual, who });
  return error ? NextResponse.json({ error }, { status: 400 }) : NextResponse.json({ ok: true });
}
