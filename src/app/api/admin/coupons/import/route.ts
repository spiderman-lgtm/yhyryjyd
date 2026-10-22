import { NextResponse } from 'next/server';
import { guard } from '@/lib/admin-guard';
import { write, type StoreCoupon } from '@/lib/db';
import { cleanCoupon, parseCsv } from '@/lib/storecoupons';

export const dynamic = 'force-dynamic';

// Adds every valid row of a CSV; rows with problems are reported back by line number.
export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const csv = typeof b.csv === 'string' ? b.csv.slice(0, 2_000_000) : '';
  const rows = parseCsv(csv).slice(0, 2000);
  if (!rows.length) return NextResponse.json({ error: 'No rows found. The first line must be the column names.' }, { status: 400 });
  const errors: { line: number; error: string }[] = [];
  const good: StoreCoupon[] = [];
  rows.forEach((r, i) => {
    const c = cleanCoupon(r);
    if ('error' in c) errors.push({ line: i + 2, error: c.error });
    else good.push(c);
  });
  const added = write((d) => {
    let n = 0;
    for (const c of good) {
      // The same store and code (or title, for deals) replaces the earlier row instead of duplicating it.
      const dup = Object.values(d.store_coupons).find(
        (x) => x.store.toLowerCase() === c.store.toLowerCase() && (c.code ? x.code === c.code : !x.code && x.title === c.title),
      );
      d.store_coupons[dup?.id ?? c.id] = dup ? { ...c, id: dup.id, clicks: dup.clicks, created_at: dup.created_at } : c;
      n++;
    }
    return n;
  });
  return NextResponse.json({ added, errors });
}
