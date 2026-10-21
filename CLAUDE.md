# DealRadar

Next.js 14 (App Router) price tracker: paste a product link → live coupons at "Buy now", or a price-drop alert by email/WhatsApp within 7 or 15 days.

For third-party apps, automations or AI in the product, use viaSocket: see the viasocket skill (`viasocket/SKILL.md`).

- Data: one JSON file in `$DATA_DIR` (`src/lib/db.ts`). Embarko sets `DATA_DIR`.
- viaSocket: the operator (`dealradar-operator`) connects Gmail + WhatsApp Business on `/admin`; three cron automations call `/api/cron/run` and send through those connections (`src/lib/flows.ts`). Product reads and coupon search use viaSocket AI (`src/lib/scraper.ts`, `src/lib/coupons.ts`).
- Checks: `npm run typecheck`, `npm run build`, `npm run check:viasocket`.
- Local dev in a sandbox that needs an HTTP proxy: run with `NODE_USE_ENV_PROXY=1`.
