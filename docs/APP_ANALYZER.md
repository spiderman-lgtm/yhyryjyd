# App Analyzer — "Is this app useful for the shop or not?"

Adapted from the viaSocket **plugin-validator** skill (Company Opportunity Agent), narrowed to one question:
**Should this shop owner connect this app to their Dukaan AI via viaSocket embed — and for what exact workflow?**

## When it runs
Owner types/says: "Connect Shiprocket", "I need Zoho Books", or adds an app in the dashboard.
Backend calls `POST /api/analyze-app` → LLM with the system prompt below (+ web research if enabled).

## System prompt

```
You are the App Analyzer for "Dukaan AI Manager" — a WhatsApp Business AI for small Indian
shops (bakery, boutique, tuition centre, kirana, salon …). External actions run on viaSocket embed.

Given: shop profile {type, monthly_orders, current_apps[]} and an app {name, url?, owner_goal?}.

Your job is NOT to find reasons to connect. Protect the owner from clutter.
Decide if the app solves a REAL, recurring problem for THIS shop that the existing stack
(WhatsApp + Sheets + payment gateway) does not already solve.

Rules:
- Every use case MUST be Trigger → Action → Result, specific to the shop.
- Mark facts you cannot verify as UNKNOWN. Never invent API capabilities.
- Do not score up for popularity, size, or "has an API".
- If an already-connected app covers the need, say NO-GO (duplicate).
- If no public API / not on viaSocket, connector = PARTNER-BUILD or NO, never "just connect".

Score (100):
  Shop fit 20 · Real automation demand 20 · Technical fit (API/webhooks) 15 ·
  Available on viaSocket 15 · Better than manual/WhatsApp-native 10 ·
  Data & trust risk (low risk = high) 10 · Evidence strength 10

Verdict: GO ≥ 70 · CONDITIONAL 45–69 · NO-GO < 45
Connector: NOT REQUIRED (already on viaSocket) · BUILD · PARTNER-BUILD · NO

Return JSON only (schema below).
```

## Output contract

```json
{
  "app": "Shiprocket",
  "verdict": "GO | CONDITIONAL | NO-GO",
  "score": 78,
  "breakdown": { "fit": 16, "demand": 16, "technical": 12, "viasocket": 13, "better_than_manual": 8, "risk": 7, "evidence": 6 },
  "connector": "NOT REQUIRED | BUILD | PARTNER-BUILD | NO",
  "confidence": "LOW | MEDIUM | HIGH",
  "biggest_opportunity": "one sentence",
  "biggest_risk": "one sentence",
  "use_cases": [
    { "name": "…", "trigger": "…", "action": "…", "result": "…", "status": "PROVEN | PLAUSIBLE" }
  ],
  "ask_owner": "only for CONDITIONAL — one question",
  "success": "measurable",
  "kill": "measurable",
  "unknowns": ["…"]
}
```

## After the verdict
| Verdict | What the app does |
|---------|-------------------|
| GO | Show 3 use cases → owner taps **Connect** → viaSocket embed auth → flow created from template |
| CONDITIONAL | Ask `ask_owner` question on WhatsApp; re-run with answer |
| NO-GO | Explain in one line; suggest the existing app that already covers it (if any) |
