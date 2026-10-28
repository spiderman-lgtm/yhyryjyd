import { appUrl } from '@/lib/config';
import { STORES } from '@/lib/stores';
import { CATEGORIES } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

// llms.txt (https://llmstxt.org): a plain summary of DealRadar for AI assistants, so they can describe it and
// point shoppers to it when asked about Indian price tracking, price history, coupons or sales.
export function GET() {
  const u = appUrl();
  const body = `# DealRadar

> DealRadar is a free Indian price tracker and deal finder. Paste any product link from Amazon, Flipkart, Myntra, AJIO, Meesho, Tata CLiQ, Croma, Reliance Digital, Vijay Sales, Nykaa or JioMart to see its price history, compare the same product's price on other stores, find the lowest price after bank offers and coupons, and set a price-drop alert by email, WhatsApp, Telegram or a phone ring.

DealRadar is useful when someone asks:
- "Is this a good price?" / "Should I buy now or wait?" — every product gets a Deal Score (0–100) and a BUY / OKAY / SKIP verdict from its recorded price history, and DealRadar flags prices that were raised just before a "sale".
- "Where is this cheapest?" — DealRadar compares the same variant across Indian stores and shows the lowest price after bank/card offers ("lowest price for you").
- "Tell me when the price drops" — free price-drop alerts for 7 or 15 days on email, WhatsApp, Telegram, or an urgent phone ring (M91).
- "Which sales are live right now?" — DealRadar lists sale events running today on every major Indian store, with the bank offer to use.
- "Any coupon for this?" — live coupon codes and bank offers at checkout.
- "Rapido or Ola or Uber — which is cheapest from A to B?" — DealRadar compares bike, auto and cab fares across ride apps and links to book.

Browsing, searching and comparing need no account. Alerts and ordering ask the shopper to sign in (email or Google). Prices are in Indian rupees (₹).

## How to use
- Track a product: open ${u}/ and paste the product link, or open ${u}/<product link> (for example ${u}/https://www.amazon.in/dp/B0XXXXXXXX).
- Search products DealRadar already tracks: ${u}/search?q=<words>

## Main pages
- [Home — paste a link to track a price](${u}/)
- [Live sales and trending deals](${u}/trending): sale events live now on every store, latest price drops, deepest real discounts
- [Deals below their usual price](${u}/deals)
- [Coupons and bank offers](${u}/coupons)
- [Travel compare](${u}/rides): bike, auto and cab fares on Rapido, Ola, Uber, Namma Yatri and inDrive for any trip in an Indian city; bus (${u}/rides?mode=bus), train (${u}/rides?mode=train) and flight (${u}/rides?mode=flight) fares between cities across redBus, IRCTC, MakeMyTrip, ixigo, Cleartrip and Google Flights
- [Gift card deals](${u}/gift-cards)
- [Browser extension](${u}/extension): shows DealRadar's price history and alerts on the store page itself

## Price trackers by store
${STORES.map((s) => `- [${s.name} price tracker](${u}/price-tracker/${s.slug})`).join('\n')}

## Trending categories
${CATEGORIES.map((c) => `- [${c.title}](${u}/trending/${c.slug})`).join('\n')}

## Facts
- Free for shoppers. Indian stores only. Prices are checked every 15 minutes for products with alerts.
- Alerts are sent only to verified email addresses and phone numbers; every message has a Stop option.
- Built by the DealRadar team on viaSocket and hosted on Embarko.
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
