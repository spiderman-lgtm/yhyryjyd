import { NextResponse, type NextRequest } from 'next/server';
import { viewerUid } from '@/lib/auth';
import { rateLimited } from '@/lib/ext';
import { addSuggestions } from '@/lib/offerfeed';
import { cleanCoupon } from '@/lib/storecoupons';
import { storeDomain } from '@/lib/stores';
import { read } from '@/lib/db';
import { askCoupon } from '@/lib/ops-alerts';

export const dynamic = 'force-dynamic';

// A shopper sends a coupon; it waits in Admin until the owner approves it.
export async function POST(req: NextRequest) {
  const limited = rateLimited(req, 10);
  if (limited) return limited;
  const b = await req.json().catch(() => ({}));
  if (b.website) return NextResponse.json({ ok: true }); // filled only by bots
  const store = String(b.store ?? '').trim();
  const domain = storeDomain(store);
  const c = cleanCoupon({
    store,
    title: b.title,
    discount_text: b.discount_text,
    code: b.code,
    description: b.description,
    category: b.category,
    expires_at: b.expires_at,
    url: b.url || (domain ? `https://www.${domain}/` : ''),
  });
  if ('error' in c) return NextResponse.json({ error: c.error.replace('Offer link must be', 'Add the offer link — it must be') }, { status: 400 });
  if (!c.code && !b.url) return NextResponse.json({ error: 'Add the coupon code, or a link to the offer.' }, { status: 400 });
  const key = `shopper:${c.store.toLowerCase()}:${(c.code || c.title).toLowerCase()}`;
  const added = addSuggestions([
    {
      key,
      source: 'shopper',
      store: c.store,
      title: c.title,
      discount_text: c.discount_text,
      code: c.code,
      description: c.description,
      url: c.url,
      image: null,
      category: c.category,
      expires_at: c.expires_at,
      submitted_by: viewerUid() || null,
    },
  ]);
  // The owner can approve or reject it straight from the phone (M91).
  const s = added ? read((d) => Object.values(d.coupon_suggestions).find((x) => x.key === key && x.status === 'pending')) : null;
  if (s) void askCoupon({ id: s.id, store: s.store, title: s.title, code: s.code, discount_text: s.discount_text, url: s.url });
  return NextResponse.json({ ok: true });
}
