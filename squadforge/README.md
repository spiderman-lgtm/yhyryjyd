# ⚒️ SquadForge

Team lead ka AI command center. Slack channel se team ka roz ka kaam padhta hai, client requests track karta hai, apps review karta hai, 7 PM alert aur Monday weekly report bhejta hai. Do mode hain: **🎬 Process** (Live Flow: kaam agents ke beech chalta hua dikhta hai, requests ka journey, aaj ka din) aur **📊 Data** (metrics, requests board, reviews, reports, settings).

## Agents

| Agent | Kaam | Kab |
|---|---|---|
| 🔭 Scout | Slack channel + threads padhta hai, har message sahi agent ko deta hai | Har 10 min (8am–10pm IST) |
| 🎯 Tracker | Client request: New → R&D → Started → Stuck (reason) → Completed, time + difficulty | Scout ke saath |
| 🌱 Sprout | Growth posts: support request, app listing, blog, newsletter, credentials. Credentials aate hi stuck request ke thread mein developer ko tag karta hai | Scout ke saath |
| 🔍 Inspector | "review" likhne pe aapke instructions se review karke galtiyan usi thread mein daalta hai, error rate track karta hai | Review maangte hi |
| 📊 Analyst | Subah ka plan vs shaam ka kaam, actions/triggers/apps count | 7 PM se pehle |
| 📢 Herald | 7 PM daily alert (kisne kitna kiya, kisne update nahi daala) + 11:30 subah ka reminder | 7:00 PM, 11:30 AM |
| 📜 Scribe | Monday weekly team report + aapki personal report | Monday 9:30 AM |
| ⚔️ Commander | Aapka message channel mein (tag ke saath) + important ho to MSG91 SMS | Jab aap bhejo |

## Slack mein kaise likhna hai

- **Client request (aap):** top-level message mein `Client request: Kommo CRM plugin chahiye @member`. Thread mein bhi tag kar sakte ho, assign ho jayega.
- **Member status (request thread mein):** `r&d`, `started`, `stuck - API doc missing hai`, `completed`. Ya `status: stuck - reason`. AI key ho to normal Hinglish bhi samajh leta hai.
- **Review:** thread mein `review please` (aur plugin ki details/JSON). Inspector feedback usi thread mein deta hai.
- **Standup:** subah aur shaam ki thread (parent mein "morning"/"evening"/"EOD" jaisa word ho). Members replies mein update daalte hain. Shaam ke update mein `3 actions, 2 triggers` likhenge to count ho jayega.
- Keywords Settings se badal sakte ho.

## Env vars (Embarko → App setup)

| Var | Zaroori | Kya |
|---|---|---|
| `ADMIN_PASSWORD` | ✅ | Admin login password (poora access) |
| `ADMIN_EMAILS` | ✅ | Comma se alag admin emails; sirf yeh admin login kar sakte hain aur Integrations chala sakte hain |
| `VIEWER_PASSWORD` | optional | Sirf 🎬 Process view (Live Flow + Village), read-only — manager/team ke saath share karne ke liye |
| `SLACK_BOT_TOKEN` | ✅ | Slack app ka bot token (`xoxb-…`) |
| `SLACK_CHANNEL_ID` | ✅ | Team channel ID (ya Settings se) |
| `LEAD_SLACK_USER_ID` | ✅ | Aapka Slack user ID; reports DM pe aati hain (ya Settings se) |
| `ANTHROPIC_API_KEY` | AI ke liye | Inspector, smart classification, difficulty, weekly summary |
| `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` | SMS ke liye | DLT template variables `##name##`, `##message##` |
| `VIASOCKET_ORG_ID`, `VIASOCKET_PROJECT_ID`, `VIASOCKET_EMBED_SECRET` | Integrations ke liye | viaSocket keys (Slack/Gmail/Sheets connect) |
| `WEBHOOK_SECRET` | optional | `/webhooks/publish` ke liye |
| `CLAUDE_MODEL` | optional | default `claude-opus-5-5` |

**Slack app scopes:** `channels:history`, `groups:history`, `channels:read`, `groups:read`, `chat:write`, `users:read`, `im:write`. Bot ko channel mein add karna mat bhoolna (`/invite @YourBot`).

## Publish count automatic (viaSocket flow se)

```
POST https://<app>.embarko.app/webhooks/publish
Header: X-Webhook-Secret: <WEBHOOK_SECRET>
Body: { "slack_user_id": "U123", "kind": "action", "plugin": "Kommo", "name": "Create Lead", "count": 1 }
```
`kind` = `action` | `trigger` | `app`. `member` (naam) bhi bhej sakte ho.

## Local chalana

```
npm install
npm start      # http://localhost:3000
npm test
```

Data SQLite mein `DATA_DIR` ke andar rehta hai (Embarko redeploy pe bhi data rakhta hai, lekin backup nahi leta).
