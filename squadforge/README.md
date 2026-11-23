# ⚒️ SquadForge

An AI command center for a team lead. It reads the team's daily work from a Slack channel, tracks client requests, reviews apps, and sends a 7 PM daily alert and a Monday weekly report. The menu has **🌊 Live Flow** (work moving between the agents, each request's journey, today's timeline) next to **📊 Dashboard** (metrics), plus Requests, Reviews, Growth, Reports, Commander, **🔌 Integrations** and Settings.

## Agents

| Agent | What it does | When |
|---|---|---|
| 🔭 Scout | Reads the Slack channel and its threads, and hands each message to the right agent | Every 10 min (8am–10pm IST) |
| 🎯 Tracker | Client requests: New → R&D → Started → Stuck (with reason) → Completed, plus time taken and difficulty | With Scout |
| 🌱 Sprout | Growth posts: support requests, app listings, blogs, newsletters, credentials. When credentials arrive, it tags the developer in the stuck request's thread | With Scout |
| 🔍 Inspector | When someone writes "review", it reviews against your instructions, posts the mistakes in the same thread, and tracks error rate | As soon as a review is requested |
| 📊 Analyst | Morning plan vs. evening work; counts actions, triggers and apps | Before 7 PM |
| 📢 Herald | 7 PM daily alert (who did how much, who didn't post an update) + 11:30 morning reminder | 7:00 PM, 11:30 AM |
| 📜 Scribe | Monday weekly team report + your personal report | Monday 9:30 AM |
| ⚔️ Commander | Posts your message in the channel (with tags) and, if important, sends an MSG91 SMS | Whenever you send one |

## How to write in Slack

- **Client request (you):** a top-level message like `Client request: Kommo CRM plugin @member`. You can also tag someone in the thread to assign it.
- **Member status (in the request thread):** `r&d`, `started`, `stuck - API doc missing`, `completed`, or `status: stuck - reason`. Hinglish phrases are understood too, and with an AI key so is any natural wording.
- **Review:** `review please` in the thread (with the plugin details/JSON). Inspector replies in the same thread.
- **Standup:** a morning and an evening thread (the parent message contains a word like "morning", "evening" or "EOD"). Members post their updates as replies. Writing `3 actions, 2 triggers` in the evening update gets counted.
- Keywords can be changed in Settings.

## Accounts

Anyone can **Create an account** on the sign-in page (name, email, password of 8+ characters; stored as a salted scrypt hash). Emails listed in `ADMIN_EMAILS` get the full admin dashboard; everyone else is a viewer of Live Flow and Village. Admins can also sign in with `ADMIN_PASSWORD` plus their admin email.

## Env vars (Embarko → App setup)

| Var | Required | What |
|---|---|---|
| `ADMIN_PASSWORD` | ✅ | Admin login password (full access) |
| `ADMIN_EMAILS` | ✅ | Comma-separated admin emails; only these can log in as admin and manage Integrations |
| `VIEWER_PASSWORD` | optional | Read-only access to Live Flow + Village only, to share with a manager or the team |
| `SLACK_BOT_TOKEN` | if not using Integrations | Slack app bot token (`xoxb-…`). Not needed once Slack is connected on the Integrations page |
| `SLACK_CHANNEL_ID` | ✅ | Team channel ID (or set it in Settings / Integrations) |
| `LEAD_SLACK_USER_ID` | ✅ | Your Slack user ID; reports arrive by DM (or set it in Settings / Integrations) |
| `ANTHROPIC_API_KEY` | for AI | Inspector, smart classification, difficulty, weekly summary |
| `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` | for SMS | DLT template variables `##name##`, `##message##` |
| `VIASOCKET_ORG_ID`, `VIASOCKET_PROJECT_ID`, `VIASOCKET_EMBED_SECRET` | for Integrations | viaSocket keys (connect Slack/Gmail/Sheets) |
| `WEBHOOK_SECRET` | optional | For `/webhooks/publish` |
| `CLAUDE_MODEL` | optional | default `claude-opus-5-5` |

**Slack app scopes (bot token only):** `channels:history`, `groups:history`, `channels:read`, `groups:read`, `chat:write`, `users:read`, `im:write`. Don't forget to add the bot to the channel (`/invite @YourBot`).

## Automatic publish counts (from a viaSocket flow)

```
POST https://<app>.embarko.app/webhooks/publish
Header: X-Webhook-Secret: <WEBHOOK_SECRET>
Body: { "slack_user_id": "U123", "kind": "action", "plugin": "Kommo", "name": "Create Lead", "count": 1 }
```
`kind` = `action` | `trigger` | `app`. You can also send `member` (the member's name).

## Running locally

```
npm install
npm start      # http://localhost:3000
npm test
```

Data lives in SQLite under `DATA_DIR` (Embarko keeps it across redeploys, but does not back it up).
