import { NextResponse } from 'next/server';
import { guard, errorJson } from '@/lib/admin-guard';
import { activateFlows } from '@/lib/flows';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  const denied = guard();
  if (denied) return denied;
  try {
    return NextResponse.json({ flows: await activateFlows() });
  } catch (e) {
    return errorJson(e);
  }
}
