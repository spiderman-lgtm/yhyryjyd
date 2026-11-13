# SquadForge — project notes (how to pick this work up again)

If the chat is lost, this file plus the code in this repo is everything you need.

## Where things are

| What | Where |
|---|---|
| Live app | https://squadforge.embarko.app |
| Code | GitHub `spiderman-lgtm/yhyryjyd`, folder `squadforge/`, branch `claude/great-dirac-j7igf8` |
| Original Claude Code session | https://claude.ai/code/session_01MZTWFGNiLtgZCTdQyXNZjD (also listed in claude.ai/code → your sessions) |
| Hosting | Embarko, app name `squadforge`. Env vars and schedules are in Embarko → App setup. Schedules come from `embarko.json`. |
| Integrations | viaSocket (Slack, M91, Gmail, Google Sheets) on the Integrations page. Org and project IDs are in `.env` (not committed) and in the Embarko env vars. |

Secrets (deploy token, viaSocket embed secret, admin password, API keys) are **not** in this repo. They live in Embarko env vars and in `~/.embarko/credentials` on the machine that deploys.

## What the app does (for a team lead)

- Reads the team Slack channel and turns it into a dashboard, daily alerts and weekly reports. Eight agents: Scout (reads Slack), Tracker (requests), Sprout/Growth, Inspector (reviews), Analyst, Herald (7 PM alert), Scribe (weekly report), Commander (instructions + M91).
- **Daily standup:** 11:00 AM Mon–Sat it posts "Good morning team" in the channel. Its thread is the day's update thread.
  - First reply: yesterday's tally per person (actions + triggers vs the target, default 10; growth work listed separately; who posted no update). The lead is not counted.
  - The full version goes to the lead by DM.
  - M91 alert to each person with their own numbers.
- **During the day:** status words in request threads move requests (r&d / started / stuck + reason / completed). A teammate posting an app with its list ("Archbee done — actions: create doc, … triggers: new doc …") is counted and reviewed automatically. Inspector replies in the thread with what is right, the mistakes and what is missing.
- **7 PM:** summary to the lead. M91 alert to anyone without an update.
- **Monday 9:30:** weekly report with value delivered plus each person's week: actions + triggers, days the target was met, updates, reviews passed, mistakes and the most common mistakes.
- **Website plug requests** ("Request for plug : … plug Name: Archbee … user Need: New App") become client requests titled "Archbee — New App". This works even when a bot or workflow posts them.
- **Commander:** an instruction to the channel, optionally polished by AI. "Important" also sends M91: to the tagged people, or to the whole team if nobody is tagged.
- **Dashboard:**
  - Greeting scene with birds.
  - Big "Things need you" card (decisions, submissions, outcomes to verify, analyses, evidence) with "Start here".
  - Test checklist and value KPIs.
- **Other pages:**
  - **Manager view:** a read-only page for the boss. It gives the week in sentences, what the lead did, shipped, blocked with reasons, in progress and a 4-week trend, and can be saved as a PDF. Invite the boss with the **Manager** role in Settings → Workspace.
  - **History:** every change, with who and why.
  - **Workspaces:** one per team, with separate data. Create one with "Create account" and switch from the top bar.
- **Test teammates:** start a Slack message with `[Aarav]` and it counts as Aarav's. This lets one person test everything.

## Principles agreed with the lead

- Value, not volume. Never a ranking, never a penalty. "Stuck is context, never a fault."
- The 10 actions + triggers a day is a target shown as met / not yet.
- Ask before building anything new, and explain what it will become.
- All text in English. Quiet Place cream/sage pixel theme, with a dark/light toggle.

## Tech

- Node 24, plain `http` server, no framework.
- `node:sqlite`, one database file per workspace in `DATA_DIR` (persists across deploys).
- Frontend is vanilla JS in `public/`.
- Main files:
  - `src/server.js`: routes, auth, workspaces, cron.
  - `src/agents/*`: agents. `standup.js` is the daily rhythm.
  - `src/parser.js`: Slack text rules.
  - `src/manager.js`, `src/history.js`, `src/checklist.js`, `src/workspaces.js`.
- Tests: `npm test` (node:test).
- Deploy: tar the `squadforge/` folder (without `node_modules`, `.env` and `data`), then POST it to `https://ship.embarko.ai/apps` with the deploy token and headers `X-App-Name: squadforge` and `X-App-Id: cmwagmnlm0068gk67u6k2jxql`. Poll `/apps/squadforge/status` until `live`.

## Still open

- `ANTHROPIC_API_KEY` is not set in Embarko yet. Inspector reviews and AI wording need it.
- Real Slack test: the test channel is `#testing-team`. Add teammates and their phone numbers for M91.
- Store key records in the lead's viaSocket DB as well. Needs: the DB/table link, an API key (in Embarko env, not chat) and docs.
- Front-page video with a voice-over. A walkthrough video exists; still to decide on an English or Hinglish voice, either text-to-speech or the lead's own recording.
- Client Signups feature (separate channel and weekly report). The plan was shared; it needs a sample message.
- Ideas not built yet: setup guide, loading skeletons, empty-state art, phone layout, celebration moments, workspace colours.
