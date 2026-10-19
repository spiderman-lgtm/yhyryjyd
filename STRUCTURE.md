# ShikshaFlow — School / Coaching Institute SaaS (powered by viaSocket)

ShikshaFlow is a school and coaching management app. Staff work in the app as usual: they collect fees,
mark attendance, take admissions and publish results. Every important action in the app sends an
**event** to a **viaSocket flow**, and the flow talks to the outside world: WhatsApp, payment links,
Google Sheets, CRM and email.

The app keeps the source of truth (students, parents, fees, marks). viaSocket handles the
integrations. Adding a new integration means adding a new flow, not new backend code.

---

## 1. High-level architecture

```
┌──────────────────────────── ShikshaFlow (deployed on embarko.ai) ────────────────────────────┐
│                                                                                              │
│  Admin / Teacher UI  ──►  App backend (API)  ──►  Database (students, parents, fees, ...)   │
│                                │                                                             │
│                                ▼                                                             │
│                        Event Dispatcher  ── signs payload, retries, logs to event_log       │
│                                │                                                             │
│  Scheduler (daily cron) ───────┤  e.g. "fees due in 3 days / overdue today"                  │
│                                │                                                             │
│  App Analyzer (/api/analyze-app) ── Claude + viaSocket skills (see §5)                      │
└────────────────────────────────┼─────────────────────────────────────────────────────────────┘
                                 │  HTTPS webhook (one URL per flow)
                                 ▼
┌──────────────────────────────── viaSocket flows ─────────────────────────────────────────────┐
│  F1 Fee Reminder      F2 Absent Alert      F3 Admission Sync      F4 Result Broadcast         │
└──────┬───────────────────┬────────────────────┬────────────────────────┬─────────────────────┘
       ▼                   ▼                    ▼                        ▼
  Razorpay / Cashfree   WhatsApp (Interakt /  Google Sheets +         WhatsApp bulk + Gmail /
  + WhatsApp + SMS      AiSensy) + SMS        Zoho CRM / LeadSquared  SMTP email
```

## 2. App modules

| Module | What it does | Event it emits |
|---|---|---|
| Students & Parents | Student profile, class/batch, parent name, phone (WhatsApp), email | – |
| Fees | Fee plans, installments, due dates, payments, receipts | `fee.due`, `fee.overdue`, `fee.paid` |
| Attendance | Daily or per-lecture attendance by teacher | `attendance.absent` |
| Admissions | Public enquiry/admission form | `admission.submitted` |
| Exams & Results | Exams, marks entry, publish result | `result.published` |
| Integrations | List of connected apps, flow status, **Add App** analyzer | `integration.requested` |
| Event Log | Every event sent, viaSocket response, retries | – |

## 3. Data model (minimum)

```
institute(id, name, whatsapp_sender, timezone)
student(id, institute_id, name, roll_no, class, batch, status)
parent(id, student_id, name, phone_e164, email, preferred_lang)   -- 'hi' | 'en'
fee_installment(id, student_id, amount, due_date, status, payment_link, paid_at)
attendance(id, student_id, date, period, status)                  -- present | absent | late
admission(id, institute_id, student_name, parent_name, phone, email, class, source, created_at)
exam(id, institute_id, name, class, published_at)
result(id, exam_id, student_id, marks_json, total, percentage, grade, report_card_url)
integration(id, institute_id, app_name, category, team, verdict, flow_webhook_url, status)
event_log(id, event, payload_json, flow, http_status, attempts, created_at)
```

## 4. The 4 core flows

All payloads share one envelope:

```json
{ "event": "fee.due", "event_id": "evt_01H...", "institute_id": "inst_12",
  "occurred_at": "2026-10-19T09:00:00+05:30", "data": { ... } }
```

`event_id` is the idempotency key, so a retry never sends a parent the same message twice.

### F1 · Fee due → reminder + payment link
- **Trigger:** daily scheduler (9:00 AM IST) finds installments due in 3 days, due today, or overdue,
  and emits `fee.due` / `fee.overdue`.
- **viaSocket steps:**
  1. Webhook trigger receives `{student, parent, amount, due_date, installment_id}`.
  2. Razorpay → *Create Payment Link* (amount, `reference_id = installment_id`, parent phone/email).
  3. WhatsApp (Interakt/AiSensy) → send the approved template `fee_reminder` with the link.
  4. Fallback: if WhatsApp fails, MSG91 → SMS with the link.
  5. HTTP → `POST /api/fees/{id}/link` stores the link in the app.
- **Close the loop:** Razorpay `payment_link.paid` webhook → viaSocket → `POST /api/fees/{id}/paid`
  → WhatsApp receipt to the parent.

### F2 · Attendance marked absent → instant WhatsApp alert
- **Trigger:** teacher saves attendance; the app emits one `attendance.absent` event per absent student.
- **viaSocket steps:** webhook → filter (`status == absent`, skip holidays and already-alerted) →
  WhatsApp template `absent_alert` → optional Google Sheet log for the monthly report.
- **Target:** parent gets the message within 1–2 minutes of attendance being marked.

### F3 · New admission form → Google Sheet + CRM
- **Trigger:** public admission form submit → `admission.submitted`.
- **viaSocket steps:**
  1. Google Sheets → *Add Row* in the "Admissions 2026-27" sheet.
  2. Zoho CRM / LeadSquared → *Create or Update Lead*, deduplicated on phone.
  3. WhatsApp → thank-you message to the parent, plus internal alert to the counsellor.

### F4 · Exam result published → bulk WhatsApp / email
- **Trigger:** admin clicks **Publish**; the app emits one `result.published` event per student,
  or one batch event that viaSocket loops over.
- **viaSocket steps:** webhook → loop over students → WhatsApp template `result_published`
  with marks summary and report-card link → Gmail/SMTP email with the PDF report card →
  delay or throttle between batches to stay inside WhatsApp rate limits.

## 5. "Add App" analyzer (any new app a user wants to connect)

When an institute wants a new app (Tally, Google Classroom, Zoom, a transport GPS app, and so on),
the request goes through this pipeline before anyone builds a flow:

```
User enters: app name / URL  +  "what should happen" (use case in plain words)
        │
        ▼
1. Identify & categorize   → viaSocket skill: app-category-identification
                             returns App, Team, Category, Reason, Source
        │
        ▼
2. Validate the opportunity → viaSocket skill: plugin-validator
                             connector verdict (BUILD / PARTNER-BUILD / NOT REQUIRED / NO),
                             realistic Trigger → Action → Result use cases
        │
        ▼
3. Genuineness checks (app side)
   • Is it a real, verifiable product with a public API or a viaSocket plugin?
   • Is the use case related to school/coaching operations (fees, attendance,
     admissions, exams, classes, transport, staff, communication)?
   • Does it have a clear trigger and action?
   • Does it duplicate an existing flow?
   • Is it free of spam or abuse (scraping, bulk unsolicited marketing, lending/betting)?
        │
        ▼
4. Verdict
   ✅ GENUINE      → generate a use-case card + flow blueprint; status "ready to build"
   🟡 NEEDS REVIEW → app unknown or use case unclear; goes to the admin queue
   ❌ REJECTED     → reason shown to the user
```

**Backend contract** (`POST /api/analyze-app`):

```json
// request
{ "app": "Google Classroom", "url": "https://classroom.google.com",
  "use_case": "When homework is posted, send WhatsApp to parents" }

// response
{ "app": "Google Classroom", "team": "Rahul", "category": "Education",
  "verdict": "GENUINE", "score": 86,
  "checks": { "verified_app": true, "school_relevant": true, "clear_trigger_action": true,
              "duplicate": false, "abuse_risk": false },
  "use_case": { "trigger": "New coursework posted", "actions": ["WhatsApp to parents"],
                "result": "Parents know about homework the same day" } }
```

Implementation: the endpoint calls Claude with the two viaSocket skills loaded and returns the JSON
above. `index.html` ships an **offline version** of this analyzer, with a catalog of known apps and
rule-based checks, so the page works as a standalone demo before the backend exists.

## 6. Proposed folder structure

```
/
├── index.html              # Use-case showcase + Add App analyzer (static, deployable now)
├── STRUCTURE.md            # This document
├── backend/                # (next step)
│   ├── api/                # students, fees, attendance, admissions, results, analyze-app
│   ├── events/dispatcher   # sign + POST to viaSocket webhooks, retries, event_log
│   └── scheduler/          # daily fee-due job
└── flows/                  # exported viaSocket flow notes / webhook URLs per flow
    ├── f1-fee-reminder.md
    ├── f2-absent-alert.md
    ├── f3-admission-sync.md
    └── f4-result-broadcast.md
```

## 7. Configuration (environment variables)

```
VIASOCKET_FEE_REMINDER_WEBHOOK=
VIASOCKET_ABSENT_ALERT_WEBHOOK=
VIASOCKET_ADMISSION_SYNC_WEBHOOK=
VIASOCKET_RESULT_BROADCAST_WEBHOOK=
WEBHOOK_SIGNING_SECRET=        # HMAC header on every outgoing event
ANTHROPIC_API_KEY=             # for /api/analyze-app
```

Keep the secrets in embarko.ai's environment settings, never in the repo.

## 8. Deploying on embarko.ai

- **Phase 1 (now):** `index.html` is a single static file with no build step. Deploy it as a
  static site to share the use cases and analyzer demo.
- **Phase 2:** add `backend/` and set the variables from §7 in the embarko.ai project settings.
- **Phase 3:** point each viaSocket webhook trigger at the deployed URLs and turn on the scheduler.

## 9. WhatsApp templates to get approved first

| Template | Sample (Hinglish) |
|---|---|
| `fee_reminder` | Namaste {{parent}}, {{student}} ki ₹{{amount}} fees {{due_date}} tak due hai. Pay karein: {{link}} |
| `absent_alert` | {{student}} aaj ({{date}}) class mein absent hai. Koi sawaal ho to {{institute}} se sampark karein. |
| `admission_thanks` | {{parent}} ji, {{student}} ke admission form ke liye dhanyavaad. Hamari team jaldi call karegi. |
| `result_published` | {{exam}} ka result aa gaya hai: {{student}} – {{percentage}}% ({{grade}}). Report card: {{link}} |
