import 'server-only';
import { NextResponse } from 'next/server';
import { isAdmin } from './session';

export function guard(): NextResponse | null {
  if (!process.env.ADMIN_KEY) return NextResponse.json({ error: 'ADMIN_KEY is not configured on the server.' }, { status: 503 });
  if (!isAdmin()) return NextResponse.json({ error: 'Sign in to admin first.' }, { status: 401 });
  return null;
}

export function errorJson(e: unknown, status = 502) {
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
}
