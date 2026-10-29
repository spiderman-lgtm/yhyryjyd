# viaSocket Plug Auditor

An agent skill that audits a complete viaSocket Developer Hub plug (connection, actions, triggers, input fields,
perform code, components) against the app's official API docs, and reports only evidence-backed issues with exact
change locations and code fixes.

| File | What it is |
| ---- | ---------- |
| `skills/SKILL-PLUG-AUDIT.md` | The agent. Same input block and conventions as viaSocket's `SKILL-PLUG-CREATION.md`. |
| `skills/audit-report.schema.json` | Schema of the machine-readable block every report ends with. |
| `scripts/score-audit.mjs` | Re-applies the evidence gate and computes the independent score deterministically. No dependencies. |
| `examples/audit-prompt.md` | Copy-paste invocation. |

## Run an audit

Paste `examples/audit-prompt.md` into an agent connected to the viaSocket MCP (`https://connect.viasocket.com/mcp`),
with your app's values. The skill URL must be reachable by the agent (public repo raw URL, or host the file next to the
other plug skills). Without the MCP, add `PROXY_AUTH_TOKEN` from a secret store; it is never echoed or written anywhere.

`MODE: report` (default) is read-only: the only non-GET call is the Developer Hub dry run of saved read-only code.
`MODE: fix` produces the report, asks which findings to apply, applies them to draft versions only, re-tests and
re-scores. It never publishes.

## Check a report

```bash
node scripts/score-audit.mjs path/to/report.md
```

Accepts the JSON or the full Markdown report (it reads the last `json` block). Exits 1 when a finding lacks evidence,
uses a confidence weaker than `likely`, sits in a category marked not verified, or when anything that looks like a
secret appears in the report.

```bash
npm test
```

## How it avoids invented issues

- **Evidence gate.** Every finding needs the plug's own config/code **plus** an API doc quote with a deep link, a
  viaSocket KB rule, a dry-run result, or production analytics. Anything weaker goes to *Limitations* and never
  affects the score. The scorer enforces this.
- **The API decides.** If the API has no webhooks, pagination or filter, the plug lacking it is recorded as correct in
  the coverage matrix, not as a bug.
- **Disprove before keeping.** The agent re-reads the full code, inputjson, mapped components and docs changelog to
  explain the behaviour away before a finding stands.
- **One root cause, one finding.** The same defect in six actions is one finding with six locations and one deduction.
- **Nothing claimed untested.** Write actions and webhook subscribe/unsubscribe are never executed; they are labelled
  "not executed". Categories that could not be checked are `not_verified` and drop out of the total, with a coverage %
  shown next to the score.

## Scores

- **Existing**: read from what viaSocket stores (`verificationstatus` per version, any review score in version
  `metadata`, plug `verified`, badges). viaSocket does not currently store a numeric score on plugs, so this is
  usually **Unavailable**, with the statuses listed.
- **Independent**: weighted categories (API coverage 20, input schema 20, request/response 15, auth & security 10,
  triggers & pagination 15, error handling 10, testing 10); each starts at 100 minus one deduction per finding
  (P0 40 / P1 20 / P2 8 / P3 2 when confirmed, half when likely). The letter grade is capped at D while a confirmed P0
  is open and at C while a confirmed P1 is open.
- **DH review gate**: the 20 checks of viaSocket's `plug-review.md`, rated as that file says. It predicts whether the
  plug passes viaSocket's publish review (all ≥ 90).

## Sources the agent uses

- Plug data: Developer Hub API (`plugins`, `oauth_details`, `actions`, `action_version`, `reusable_components`,
  component mappings).
- Production signals: Analytics API (run and error counts per version, failures by status code, failed-run logs, read
  for error shape only).
- Rules: `https://flow.viasocket.com/documentation/plugs/knowledge-base/` (`plug-review.md`, `perform-code.md`,
  connection and input-field KBs).
- App API: OpenAPI/Swagger first, then the official reference; third-party pages are not evidence.
