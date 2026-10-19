# Dukaan ka AI Manager — Structure

> WhatsApp Business mein baitha AI jo poori dukaan chalata hai.
> **AI = dimaag** (samajhta hai customer kya bol raha hai) · **viaSocket embed = haath** (order save, payment link, reminder — sab backend mein execute).

---

## 1. Ye app kya karega (scope)

| # | Feature | Trigger | Brain (AI) | Hands (viaSocket) | Result |
|---|---------|---------|------------|-------------------|--------|
| 1 | **Order lena** | Customer WhatsApp: "2 cake chahiye kal ke liye" | Intent = `ORDER`, items + qty + date nikaale, catalog se price calculate kare | Order sheet mein row add, customer ko confirm message | Order confirmed, owner ne kuch type nahi kiya |
| 2 | **Payment link + auto "paid"** | Order confirm hua | — | Razorpay/Cashfree payment link banaye → WhatsApp pe bheje; payment webhook aate hi order `PAID` mark | Owner ko hisaab nahi rakhna |
| 3 | **Delivery/pickup reminder** | Scheduler: delivery time − 2 ghante | Friendly reminder text likhe | WhatsApp template message bheje | No-show kam |
| 4 | **Udhaar recovery** | Daily scan: `due_date` nikal gaya, `PAID` nahi | Tone choose kare (polite → firm) | Day 1 polite, Day 3 reminder + link, Day 7 owner ko escalate | Paisa wapas, owner ko awkward baat nahi karni |
| 5 | **Mahine ka hisaab** | Cron: mahine ki last date, 9 PM | Data ko 1 line summary mein convert kare | Sheet se aggregate → owner ko WhatsApp | "Is mahine 340 order, ₹85,000 collect, 3 log due" |
| 6 | **Add any app (App Analyzer)** | Owner bole "mujhe Shiprocket bhi jodna hai" | viaSocket plugin-validator rubric se analyse kare | Agar use case genuine (GO) → viaSocket embed se connect flow | Sirf kaam ke apps judte hain, kachra nahi |

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
| **WhatsApp Gateway** | Incoming messages ka webhook, outgoing text/template messages | Meta WhatsApp Cloud API (ya BSP: Gupshup/Interakt/AiSensy) |
| **AI Brain** | Intent detection (`ORDER`, `QUERY`, `PAYMENT_STATUS`, `CANCEL`, `SMALLTALK`), entity extraction (item, qty, date, time), reply drafting, tone control | LLM with tool calling; system prompt me dukaan ka catalog + policies |
| **State / Rules engine** | Order lifecycle, reminders ka schedule, udhaar escalation ladder | Backend DB (Postgres/SQLite) + cron |
| **viaSocket Embed** | Saare external actions: Sheets row, payment link, payment webhook, reminders, reports, naye apps | viaSocket embed SDK + flows per owner |
| **App Analyzer** | Owner jo naya app jodna chahe, uska viaSocket rubric se GO/CONDITIONAL/NO-GO | LLM + `docs/APP_ANALYZER.md` prompt |
| **Owner dashboard** (optional) | Catalog edit, connected apps, monthly view | Single page (`index.html` style) |

---

## 3. Data model (minimum)

```text
Shop        { id, owner_phone, name, type(bakery|boutique|tuition|…), currency, timezone }
CatalogItem { id, shop_id, name, aliases[], price, unit, lead_time_hours }
Customer    { id, shop_id, phone, name, credit_limit }
Order       { id, shop_id, customer_id, items[{item_id, qty, price}], total,
              fulfil_at, mode(pickup|delivery), status, payment_link_id, paid_at, due_date }
Reminder    { id, order_id, kind(fulfilment|udhaar_1|udhaar_2|escalate), send_at, sent_at }
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
| `payment_received` | Razorpay `payment_link.paid` webhook | Find order row by id → set `PAID` → callback backend → WhatsApp "Thank you, payment mila ✅" | Razorpay → Sheets → backend |
| `send_reminder` | Backend scheduler | Send WhatsApp template (`order_reminder`, `udhaar_polite`, `udhaar_firm`) | WhatsApp |
| `escalate_to_owner` | Udhaar > 7 din | WhatsApp owner with list + one-tap "call" | WhatsApp |
| `monthly_report` | Cron last day 21:00 | Aggregate rows → AI writes one-liner → WhatsApp owner | Sheets → AI → WhatsApp |
| `connect_new_app` | App Analyzer verdict = GO | Open viaSocket embed auth for that app → create owner's flow from template | Any viaSocket app |

> Rule: **AI kabhi directly external app ko touch nahi karta.** Har action viaSocket flow ke through jaata hai — audit trail, retries, aur owner-level auth ek jagah.

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
- Price **sirf catalog se**, AI khud price invent nahi karega.
- Order confirm tabhi jab customer "haan/ok/confirm" bole.
- Confidence low ho ya complaint ho → `handoff_to_owner`.
- Udhaar reminders: max 1/din, raat 9 baje ke baad nahi.

---

## 6. App Analyzer (owner koi bhi app add kare)

Owner bolta hai: *"Shiprocket bhi jod do"* → analyzer viaSocket **plugin-validator** rubric chalata hai, dukaan context ke saath:

- **Verdict:** GO / CONDITIONAL / NO-GO
- **Score /100:** Dukaan fit 20 · Real automation demand 20 · Technical fit (API/webhook) 15 · Available on viaSocket 15 · Better than manual/WhatsApp-native 10 · Data & trust risk 10 · Evidence 10
- **Connector:** BUILD / PARTNER-BUILD / NOT REQUIRED / NO
- **3 use cases** — strictly `Trigger → Action → Result`, dukaan-specific
- **Biggest risk** + **Success / Kill condition**

Sirf **GO** pe app connect hota hai. CONDITIONAL → owner se 1 sawaal. NO-GO → reason ke saath mana.
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
    │   ├── scheduler.ts     # reminders, udhaar ladder, monthly cron
    │   ├── viasocket.ts     # calls to viaSocket flow webhooks
    │   └── analyzer.ts      # /api/analyze-app
    └── db/schema.sql
```

---

## 8. Deploy on embarko.ai

1. **Phase 1 (abhi):** `index.html` static page deploy karo — use case + analyzer demo.
2. **Phase 2:** `server/` ko embarko pe service ki tarah deploy karo. Env vars:
   `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`, `LLM_API_KEY`, `VIASOCKET_EMBED_TOKEN`, `VIASOCKET_FLOW_*` (har flow ka webhook URL), `DATABASE_URL`.
3. WhatsApp webhook URL = `https://<your-app>.embarko.ai/webhook/whatsapp`.
4. Razorpay webhook → viaSocket `payment_received` flow URL.

## 9. Build order (MVP → v1)

1. WhatsApp inbound → AI → reply (no actions) ✔ catalog-based pricing
2. `save_order` + `create_payment_link` + `payment_received`
3. Fulfilment reminders
4. Udhaar ladder + escalation
5. Monthly one-liner
6. App Analyzer + `connect_new_app`
