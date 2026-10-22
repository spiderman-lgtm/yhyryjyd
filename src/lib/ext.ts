import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

// Store names the extension may report offers for, and the only domains their links may use.
export const OFFER_DOMAINS: Record<string, RegExp> = {
  Amazon: /(^|\.)amazon\.in$/,
  Flipkart: /(^|\.)flipkart\.com$/,
  Myntra: /(^|\.)myntra\.com$/,
  AJIO: /(^|\.)ajio\.com$/,
  Meesho: /(^|\.)meesho\.com$/,
  Croma: /(^|\.)croma\.com$/,
  'Tata CLiQ': /(^|\.)tatacliq\.com$/,
  'Reliance Digital': /(^|\.)reliancedigital\.in$/,
  'Vijay Sales': /(^|\.)vijaysales\.com$/,
  Nykaa: /(^|\.)nykaa\.com$/,
  JioMart: /(^|\.)jiomart\.com$/,
  Zepto: /(^|\.)(zeptonow|zepto)\.com$/,
  Blinkit: /(^|\.)blinkit\.com$/,
  Instamart: /(^|\.)swiggy\.com$/,
  BigBasket: /(^|\.)bigbasket\.com$/,
};

const hits = new Map<string, number[]>();

export function rateLimited(req: NextRequest, perHour: number): NextResponse | null {
  const who = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anon';
  const recent = (hits.get(who) ?? []).filter((t) => Date.now() - t < 3600_000);
  if (recent.length >= perHour) return NextResponse.json({ error: 'Too many requests — try again later.' }, { status: 429 });
  recent.push(Date.now());
  hits.set(who, recent);
  if (hits.size > 20000) hits.delete(hits.keys().next().value!);
  return null;
}
