import 'server-only';
import { NextResponse } from 'next/server';
import { currentUser } from './auth';

export function guard(): NextResponse | null {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (user.role !== 'owner') return NextResponse.json({ error: 'Only the DealRadar owner can do this.' }, { status: 403 });
  return null;
}

export function errorJson(e: unknown, status = 502) {
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
}
