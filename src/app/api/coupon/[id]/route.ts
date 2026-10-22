import { NextResponse } from 'next/server';
import { absolute } from '@/lib/config';
import { write } from '@/lib/db';
import { affiliateUrl } from '@/lib/coupons';

export const dynamic = 'force-dynamic';

// Opens a coupon's offer page through the affiliate link, counting the click for "Most used".
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const url = write((d) => {
    const c = d.store_coupons[params.id];
    if (!c) return null;
    c.clicks++;
    return c.url;
  });
  return NextResponse.redirect(url ? affiliateUrl(url) : absolute('/coupons'), 302);
}
