import { NextResponse, type NextRequest } from 'next/server';
import { askAI } from '@/lib/viasocket';
import { affiliateUrl } from '@/lib/coupons';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Hit = { title: string; store: string; price: number; url: string; image: string | null };
const cache = new Map<string, { at: number; items: Hit[] }>();
const quota = new Map<string, number[]>();

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'store', 'price', 'url', 'image'],
        properties: {
          title: { type: 'string' },
          store: { type: 'string' },
          price: { type: 'number', description: 'current selling price in INR' },
          url: { type: 'string', description: "product page URL on the store's own website" },
          image: { type: ['string', 'null'] },
        },
      },
    },
  },
};

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim().slice(0, 120);
  if (q.length < 2) return NextResponse.json({ items: [] });
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return NextResponse.json({ items: hit.items.map((i) => ({ ...i, buy: affiliateUrl(i.url) })) });
  // Each uncached search spends AI credits, so one visitor gets 20 an hour.
  const who = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.cookies.get('dr_uid')?.value || 'anon';
  const used = (quota.get(who) ?? []).filter((t) => Date.now() - t < 3600_000);
  if (used.length >= 20) return NextResponse.json({ items: [], error: 'You have searched a lot — try again in a little while, or paste a product link.' });
  quota.set(who, [...used, Date.now()]);
  try {
    const r = await askAI<{ items: Hit[] }>({
      thread_id: `search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      prompt:
        'You are a shopping search engine for India. Search Amazon.in, Flipkart, Myntra, AJIO, Meesho, Croma, Tata CLiQ, Reliance Digital, ' +
        'Nykaa and JioMart for the query and return up to 12 relevant products with their current price from the store’s own page, the ' +
        'product page URL and the image URL. Mix stores where possible. Never guess prices.',
      message: `Query: ${q}\nToday: ${new Date().toISOString().slice(0, 10)}`,
      schemaName: 'search',
      schema: SCHEMA,
    });
    const items = (r?.items || [])
      .filter((i) => i.price > 0 && /^https?:\/\//.test(i.url) && !/google\.|bing\./.test(i.url))
      .map((i) => ({ ...i, title: i.title.slice(0, 160), store: i.store.slice(0, 40), price: Math.round(i.price), image: i.image && /^https?:\/\//.test(i.image) ? i.image : null }));
    cache.set(key, { at: Date.now(), items });
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    return NextResponse.json({ items: items.map((i) => ({ ...i, buy: affiliateUrl(i.url) })) });
  } catch {
    return NextResponse.json({ items: [], error: 'Web search is unavailable right now.' });
  }
}
