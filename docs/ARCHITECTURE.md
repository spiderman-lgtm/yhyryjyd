# Dukaan AI Manager — Structure

> An AI inside WhatsApp Business that runs the whole shop.
> **AI = brain** (understands what the customer is saying) · **viaSocket embed = hands** (order save, payment link, reminder — all executed in the backend).

---

## 1. What this app does (scope)

| # | Feature | Trigger | Brain (AI) | Hands (viaSocket) | Result |
|---|---------|---------|------------|-------------------|--------|
| 1 | **Taking orders** | Customer on WhatsApp: "Need 2 cakes for tomorrow" | Intent = `ORDER`, extract items + qty + date, calculate price from the catalog | Add a row to the order sheet, send the customer a confirmation | Order confirmed, and the owner typed nothing |
| 2 | **Payment link + auto "paid"** | Order confirmed | — | Create a Razorpay/Cashfree payment link → send it on WhatsApp; mark the order `PAID` as soon as the payment webhook arrives | Owner doesn't have to keep accounts |
| 3 | **Delivery/pickup reminder** | Scheduler: delivery time − 2 hours | Write a friendly reminder text | Send a WhatsApp template message | Fewer no-shows |
| 4 | **Credit (udhaar) recovery** | Daily scan: `due_date` has passed, not `PAID` | Choose the tone (polite → firm) | Day 1 polite, Day 3 reminder + link, Day 7 escalate to the owner | Money comes back, no awkward conversation for the owner |
| 5 | **Monthly accounts** | Cron: last day of the month, 9 PM | Turn the data into a 1-line summary | Aggregate from the Sheet → WhatsApp to the owner | "This month: 340 orders, ₹85,000 collected, 3 people due" |
| 6 | **Add any app (App Analyzer)** | Owner says "I also want to connect Shiprocket" | Analyse with the viaSocket plugin-validator rubric | If the use case is genuine (GO) → connect flow via viaSocket embed | Only useful apps get connected, no clutter |

---

## 2. High-level architecture

```
 Customer (WhatsApp)                        Owner (WhatsApp / mini dashboard)
        │                                              ▲
        ▼                                              │
 ┌──────────────────────┐   webhook    ┌──────────────────────────────────┐
 │ WhatsApp Business API │ ───────────▶ │  Dukaan Backend (embarko.ai)      │
 │ (Meta Cloud API)      │ ◀─────────── │  /webhook/whatsapp                │
 └──────────────────────┘   send msg    │                                  │
                                        │  ┌────────────┐  ┌─────────────┐ │
                                        │  │ AI Brain   │  │ Rules/State │ │
                                        │  │ (LLM +     │  │ order state │ │
                                        │  │  tools)    │  │ machine     │ │
                                        │  └─────┬──────┘  └──────┬──────┘ │
                                        │        │ tool calls      │        │
                                        │        ▼                 ▼        │
                                        │  ┌──────────────────────────────┐ │
                                        │  │ viaSocket Embed (the hands)  │ │
                                        │  │ flows: save_order,           │ │
                                        │  │ create_payment_link,         │ │
                                        │  │ send_reminder, monthly_report│ │
                                        │  └──────────────┬───────────────┘ │
                                        └─────────────────┼─────────────────┘
                                                          ▼
                     Google Sheets · Razorpay/Cashfree · Calendar · Shiprocket · …
```

### Components

| Component | Responsibility | Tech suggestion |
|-----------|----------------|-----------------|
| **WhatsApp Gateway** | Webhook for incoming messages, outgoing text/template messages | Meta WhatsApp Cloud API (or a BSP: Gupshup/Interakt/AiSensy) |
| **AI Brain** | Intent detection (`ORDER`, `QUERY`, `PAYMENT_STATUS`, `CANCEL`, `SMALLTALK`), entity extraction (item, qty, date, time), reply drafting, tone control | LLM with tool calling; the shop's catalog + policies in the system prompt |
| **State / Rules engine** | Order lifecycle, reminder schedule, credit escalation ladder | Backend DB (Postgres/SQLite) + cron |
| **viaSocket Embed** | All external actions: Sheets row, payment link, payment webhook, reminders, reports, new apps | viaSocket embed SDK + flows per owner |
| **App Analyzer** | GO/CONDITIONAL/NO-GO via the viaSocket rubric for any new app the owner wants to connect | LLM + `docs/APP_ANALYZER.md` prompt |
| **Owner dashboard** (optional) | Catalog edit, connected apps, monthly view | Single page (`index.html` style) |

---

## 3. Data model (minimum)

```text
Shop        { id, owner_phone, name, type(bakery|boutique|tuition|…), currency, timezone }
CatalogItem { id, shop_id, name, aliases[], price, unit, lead_time_hours }
Customer    { id, shop_id, phone, name, credit_limit }
Order       { id, shop_id, customer_id, items[{item_id, qty, price}], total,
              fulfil_at, mode(pickup|delivery), status, payment_link_id, paid_at, due_date }
Reminder    { id, order_id, kind(pickup_reminder|reminder_polite|reminder_firm|escalation), send_at, sent_at }
ConnectedApp{ id, shop_id, app_name, verdict, score, viasocket_flow_ids[], added_at }
```

**Order status machine**

```
DRAFT ──confirm──▶ CONFIRMED ──link sent──▶ AWAITING_PAYMENT ──webhook──▶ PAID ──▶ FULFILLED
                                      │
                                      └── due_date passed ──▶ UDHAAR ──▶ (reminders) ──▶ PAID | ESCALATED
```

---

## 4. viaSocket flows (the "hands")

| Flow | Trigger | Steps | Apps |
|------|---------|-------|------|
| `save_order` | Webhook from backend (AI confirmed order) | Add row → return row id | Google Sheets |
| `create_payment_link` | Webhook from backend | Create payment link (amount, customer phone, order id in notes) → return URL | Razorpay / Cashfree |
| `payment_received` | Razorpay `payment_link.paid` webhook | Find order row by id → set `PAID` → callback backend → WhatsApp "Thank you, payment received ✅" | Razorpay → Sheets → backend |
| `send_reminder` | Backend scheduler | Send WhatsApp template (`dukaan_pickup_reminder`, `dukaan_reminder_polite`, `dukaan_reminder_firm`) | WhatsApp |
| `escalate_to_owner` | Credit overdue > 7 days | WhatsApp owner with list + one-tap "call" | WhatsApp |
| `monthly_report` | Cron last day 21:00 | Aggregate rows → AI writes one-liner → WhatsApp owner | Sheets → AI → WhatsApp |
| `connect_new_app` | App Analyzer verdict = GO | Open viaSocket embed auth for that app → create owner's flow from template | Any viaSocket app |

> Rule: **The AI never touches an external app directly.** Every action goes through a viaSocket flow — audit trail, retries, and owner-level auth in one place.

---

## 5. AI Brain — tools exposed to the LLM

```json
[
  { "name": "lookup_catalog",      "args": { "query": "string" } },
  { "name": "create_order",        "args": { "items": [{"item": "string", "qty": "number"}], "fulfil_at": "ISO datetime", "mode": "pickup|delivery" } },
  { "name": "send_payment_link",   "args": { "order_id": "string" } },
  { "name": "get_order_status",    "args": { "order_id": "string?" } },
  { "name": "cancel_order",        "args": { "order_id": "string", "reason": "string" } },
  { "name": "handoff_to_owner",    "args": { "reason": "string" } }
]
```

Guardrails:
- Prices **only from the catalog**; the AI never invents a price.
- Confirm an order only when the customer says "yes/ok/confirm".
- Low confidence or a complaint → `handoff_to_owner`.
- Credit reminders: max 1/day, never after 9 PM.

---

## 6. App Analyzer (the owner adds any app)

The owner says: *"Connect Shiprocket too"* → the analyzer runs the viaSocket **plugin-validator** rubric with the shop's context:

- **Verdict:** GO / CONDITIONAL / NO-GO
- **Score /100:** Shop fit 20 · Real automation demand 20 · Technical fit (API/webhook) 15 · Available on viaSocket 15 · Better than manual/WhatsApp-native 10 · Data & trust risk 10 · Evidence 10
- **Connector:** BUILD / PARTNER-BUILD / NOT REQUIRED / NO
- **3 use cases** — strictly `Trigger → Action → Result`, shop-specific
- **Biggest risk** + **Success / Kill condition**

An app is connected only on **GO**. CONDITIONAL → 1 question to the owner. NO-GO → declined with a reason.
Prompt: [`APP_ANALYZER.md`](./APP_ANALYZER.md). Demo: `index.html` → "Add any app" section.

---

## 7. Folder structure (target)

```
/
├── index.html               # Use-case page + live App Analyzer demo (static, deploy-ready)
├── docs/
│   ├── ARCHITECTURE.md      # This file
│   └── APP_ANALYZER.md      # Analyzer prompt + output JSON contract
└── (phase 2)
    ├── server/
    │   ├── webhook.ts       # WhatsApp inbound
    │   ├── brain.ts         # LLM + tools
    │   ├── scheduler.ts     # reminders, credit ladder, monthly cron
    │   ├── viasocket.ts     # calls to viaSocket flow webhooks
    │   └── analyzer.ts      # /api/analyze-app
    └── db/schema.sql
```

---

## 8. Deploy on embarko.ai

1. **Phase 1 (now):** deploy the `index.html` static page — use cases + analyzer demo.
2. **Phase 2:** deploy `server/` on embarko as a service. Env vars:
   `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`, `LLM_API_KEY`, `VIASOCKET_EMBED_TOKEN`, `VIASOCKET_FLOW_*` (each flow's webhook URL), `DATABASE_URL`.
3. WhatsApp webhook URL = `https://<your-app>.embarko.ai/webhook/whatsapp`.
4. Razorpay webhook → viaSocket `payment_received` flow URL.

## 9. Build order (MVP → v1)

1. WhatsApp inbound → AI → reply (no actions) ✔ catalog-based pricing
2. `save_order` + `create_payment_link` + `payment_received`
3. Fulfilment reminders
4. Credit ladder + escalation
5. Monthly one-liner
6. App Analyzer + `connect_new_app`
