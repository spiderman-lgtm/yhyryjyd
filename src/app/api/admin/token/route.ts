import { NextResponse } from 'next/server';
import { guard } from '@/lib/admin-guard';
import { embedToken } from '@/lib/viasocket';

export const dynamic = 'force-dynamic';

// The browser gets the operator's embed token only to open the Connect popup and mount the prebuilt UI.
export async function GET() {
  const denied = guard();
  if (denied) return denied;
  return NextResponse.json({ token: embedToken() });
}
