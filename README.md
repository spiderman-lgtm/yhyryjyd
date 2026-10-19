# Dukaan ka AI Manager

WhatsApp Business mein baitha AI jo poori dukaan chalata hai — orders, payment links, auto "paid", reminders, udhaar recovery, aur mahine ka one-line hisaab.
**AI = dimaag · viaSocket = haath.**

Live: https://dukaan-ai-manager.embarko.app (landing) · `/app` (owner dashboard, `ADMIN_TOKEN` se)

## Run locally

```bash
npm install
cp .env.example .env   # optional — without it everything runs in demo mode
npm start              # http://localhost:3000/app
npm test
```

## What runs where

| Part | Real when | Demo without it |
| --- | --- | --- |
| WhatsApp | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` (+ `WHATSAPP_APP_SECRET` to verify webhooks) | dashboard simulator |
| AI brain | viaSocket AI (`VIASOCKET_*` + a public `https://` URL), or `ANTHROPIC_API_KEY` | rule-based Hinglish parser |
| Order sheet | owner connects **Google Sheets** in Apps tab and picks a sheet | local only |
| Payment links + auto paid | owner connects **Razorpay** in Apps tab | `/pay/<id>` demo page |
| Any other app | App Analyzer says GO → owner connects it → builds a flow in viaSocket's prebuilt UI | — |
| Reminders / udhaar / monthly report | Embarko schedule `embarko.json` → `GET /tasks/tick` (needs `CRON_SECRET`, set by Embarko) | in-process timer |

viaSocket needs `VIASOCKET_ORG_ID`, `VIASOCKET_PROJECT_ID`, `VIASOCKET_EMBED_SECRET` (server-side only).
The shop is one viaSocket end user (`shop.uid`, created once and kept in the data file); its connections,
`script_id`s and the Razorpay event subscription live in `DATA_DIR/db.json`, never in the browser.

## Docs

- `docs/ARCHITECTURE.md` — features, components, data model, flows
- `docs/structure-diagram.html` — 4 diagrams
- `docs/APP_ANALYZER.md` — the viaSocket plugin-validator rubric adapted for shops
- `.claude/skills/viasocket/SKILL.md` — viaSocket skill pointer (fetches the current skill each time)

## Checks

```bash
npm test
npm run check:viasocket   # every viaSocket id/URL in server/ and public/ against the live catalog
```
