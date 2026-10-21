---
name: viasocket-apps
description: >-
  Integrate Gmail into this product through the viaSocket Apps API: render a connect
  button, capture the user's connection, populate pickers with their real data, run
  Gmail actions from the backend, and subscribe to Gmail events. Use whenever the
  task involves connecting a third-party app for an end user, reading the choices a field
  accepts, running an action in that app, or receiving its events.
---

# Gmail via the viaSocket Apps API

> Source: https://flow.viasocket.com/documentation/rowo0bqrhj5g.md?format=http. Public, no sign-in. Fetch it again for the
> latest version of this file; it is generated from the live catalog.
> Part of viaSocket. Start at the skill, https://flow.viasocket.com/documentation/skill.md — setup, every capability, the rules. Every document: https://flow.viasocket.com/documentation/index.md.

viaSocket owns the integration with the app. Your code never talks to the app, never holds
its credentials and never refreshes its tokens — you make the five calls below and we do
that part. Your user authorises through the app’s own consent screen.

What that buys you, concretely:

- **Credentials you never see.** Each user’s Gmail tokens live encrypted in viaSocket’s vault and are
  refreshed there; a leak of your database leaks no third-party access.
- **One contract for Gmail and 2,300 other apps.** The same five calls, the same `{ label, value }` options,
  the same event handler shape, whichever app the user connects next.
- **Triggers done for you.** Polling where the app has no webhooks, de-duplication, renewal, delivery.
- **A runtime for your logic, not just a proxy.** An event handler is JavaScript we run in an isolated
  sandbox per event, with every app this user connected one `fetch` away and no secret in the code. So
  "when X, do Y" needs no server of yours, no deploy and nothing public, and `update-subscribed-event`
  swaps a live handler in place rather than shipping a release.
- **Real data for pickers.** `list-options` returns the user’s own channels, sheets and boards,
  searchable where the app’s list is large.
- **This file is generated from the live catalog.** Every id and field is current; refetch it rather than
  trusting a copy.

This file calls the HTTP API directly, through one small client you write yourself (below).
Any language works; the examples are JavaScript.

## What you are building

1. A **connect button** in your UI — Gmail's icon and name on it — that opens Gmail's consent screen and gives you an `auth_id`.
2. **Pickers** in your UI filled with the user's real Gmail data, one call per field.
3. **Actions** — enable the app once for a `script_id`, then run them from your backend.
4. **Events** — when something happens in the app, a short handler of yours runs on our
   servers: it runs an action in another app, calls your API, or both. Your server is not in the path.
5. **Whole automations** — a trigger and ordered JavaScript steps across Gmail and the user's other apps,
   written by your code or your coding agent and run on our VM, with nothing hosted on your side; the
   same flows the prebuilt UI builds. Its three calls and the step shape: https://flow.viasocket.com/documentation/automations.md
   They take each action’s `action_id` and each trigger’s `trigger_id`, printed under it below — not its version id.
6. **An assistant in your UI** — a chat we run for each of your users: threads and history kept, your
   prompt, your own endpoints as its tools (one of them can run a Gmail action from Step 3, so the
   assistant acts in the user's Gmail). https://flow.viasocket.com/documentation/ai.md

> Enabling is only for actions. A trigger subscription needs the `auth_id` and nothing
> else, so an integration that only listens for events never calls `/embed/enable`.

## Finished when

An integration is finished when every line below is **decided for this use case and the report to
the developer says how**. Nothing here says what to build; it says what must not be left undecided.
"Integrate Gmail" covers all of it for the actions and events in play, whether or not the
developer named each one.

- **Who connects.** Your own user, with a Connect button carrying Gmail's icon and the `auth_id` stored per user. In a two-sided product your customer connects, never their visitor.
- **Where each value comes from.** Every value a sample below writes as `<…>` — a field marked "list-options",
  or a choice between fixed values with no `default` — has one source, chosen for the use case and named in the
  report: fixed by you in code, only when one value serves every user of the product; chosen by your user once,
  on screen — a picker filled from their account, or a choice between the fixed values; or filled per run by your
  assistant, as a tool parameter. A value that depends on the user’s own account — their workspace, personal or
  shared, admin or not — is the user’s to choose, never fixed and never the first value because it came first.
  A free-text box for an id is a fourth choice, and one that needs a reason.
- **Every row of the table.** Each field of an action’s or trigger’s table is in the product — shown to the user with its
  `what it is` text as label and hint, or fixed in code with the reason in the report. A `required: yes` row
  is never dropped because its key looks technical; a boolean whose key says nothing is still a question
  the user answers.
- **Who picks the action.** You, in code; your user, from a list; or your assistant, from tool
  definitions — each one an action's schema below with the fixed fields removed. With the prebuilt UI's
  `chatbot: true` your user decides per flow which actions the assistant may use and which fields it fills.
- **Where it runs.** Actions from your backend on the app’s `script_id`; events through a `code`
  handler on viaSocket, with the subscription record saved. The browser never holds a `script_id`.
- **Proof.** `viasocket-check.mjs` (under "Prove it before you report") ran and its output is in the report; one real call
  was made and its actual response is there too; with a browser at hand, the Connect popup was opened and showed
  Gmail by name.

## Rules that are not negotiable

1. **The signing secret and the embed token are server-side only.** Sign the token on your
   backend; hand the frontend only what one popup needs.
2. **A `script_id` is a credential.** Anyone holding it can run that app as that user.
   Store it like a password and never ship it to the browser.
3. **Ids are fetched, never guessed.** Repository ids, channel ids, sheet ids — every one
   comes from `POST /embed/list-options`. A hardcoded id fails confusingly, not clearly.
4. **`existingFields` is not optional when a field depends on another.** Options are scoped
   by it; `{}` for a dependent field returns nothing useful.
5. **A nested key is addressed by its whole path.** `inputData` nests — `{ destination: {
   channel_id } }` — and the API addresses that field as `destination.channel_id`. So
   `fieldKey` is the **full dotted path**, never the leaf, and `existingFields` carries the
   value **nested exactly as inputData does**, never flattened:

   ```json
   { "fieldKey": "destination.thread_ts",
     "existingFields": { "destination": { "thread_channel_id": "C082WLRJLAA" } } }
   ```

   A leaf `fieldKey`, or a flat `"destination.thread_channel_id"` key in `existingFields`,
   matches no field: the call succeeds and returns nothing. Every field table below writes
   its keys in this full form, and the `inputData` sample beside each one shows the object
   those paths nest into. **Keys are case-sensitive and differ between actions of this app**
   (Google Sheets: `spreadsheet_Id` in one action, `spreadSheet_id` in another, `spreadsheet_id` in
   a third). A key from another action matches nothing, silently. Copy each key from the table
   of the action you are calling, character for character; never type one from memory. The
   parameter that carries it is `fieldKey` — not `blockKey`, not `field`.
6. **Normalise the list-options response.** Some fields wrap their list under `data.data`
   (with an `offset` you ignore); a plain field returns the array as `data`. Items are always
   `{ label, value }` — show the label, send the value. One helper, both shapes, no paging.
   A connection that cannot be read (revoked, or another user's `auth_id`) is answered with **200 and `success: true`**, the failure nested as `data.response.status` 400 and `data.response.data.message`. Treat that as the error it is; never render it as an empty list.
   A field marked **searchable** (`enableSearchApi` in the schema) takes what the user typed as
   `existingFields._searchText`, inside existingFields next to the dependency values. The field
   tables mark it.
7. **One `unique_identifier` per end user, forever.** Connections and subscriptions are
   isolated by it. Change it and the user appears to have lost their connection.
8. **A field of type `object` is not a single choice.** Fetch it like any other field —
   the response is the same `{ label, value }` list — then use *every* option’s `value` as a
   key, **verbatim**, and supply a value for each: `{ "<option value>": "<your value>" }`. The
   value is opaque: `name@longtext` is the whole key, however much it looks like a name plus a
   type. Never send the label, a lowercased label, or the value with a suffix removed.
9. **Enable only when you need actions, and never twice.** Subscribing to an event needs
   the connection and nothing more. Before enabling, look the flows up (see “Managing what
   a user already has”) — the `script_id` you want may already exist.
10. **A subscription needs a handler: `code`, a string of JavaScript we run on viaSocket’s
    servers each time the event fires.** It is what makes “when X happens in this app, do Y”
    work with no server of yours in the path. In scope there: `axios`, `fetch`, and `context`;
    the event is `context.req.body`. It stands alone: no `import`/`require`, nothing from this
    codebase; anything of yours it needs (a `script_id`, a picked id, an API key) is baked into
    the string when you subscribe. `webhook` is the edge case, not the default: pass it only
    when the product wants raw events pushed to a public endpoint of its own. Never both.
11. **Two ids, and the call names which.** The version id runs an action, lists options and
    subscribes; the `action_id` / `trigger_id` is for the connect popup, automations and the prebuilt UI. Both are
    printed under every action and trigger below.
12. **The `service_id` is `rowo0bqrhj5g`, used exactly so.** Never Gmail's name or slug in its place, never
    the id with a name joined on (`rowo0bqrhj5g_gmail`); an `auth_id` is one opaque value, passed whole.

**Two ids per action and trigger, and they look alike.** Every action has an `action_id` and an
`action_version_id`; every trigger a `trigger_id` and a `trigger_version_id`. Both are `row…` strings
and nothing tells them apart by eye. The catalog API and every app’s document name each one as the
call that takes it, so copy same-name to same-name and never the other.

| The call | Takes |
| --- | --- |
| Run an action, `list-options`, `subscribe-event` | `action_version_id` / `trigger_version_id` |
| An automation’s `trigger_id` and each step’s `action_id`; the prebuilt UI’s `open: { actionId }` / `{ triggerId }` and `filteredServices`; the connect popup’s `filteredActions` | `action_id` / `trigger_id` |

**A `service_id` is used exactly as returned.** It is the bare `row…` string the search, the app
list (`rowid`) and the catalog (`service.service_id`) give — `rowo0bqrhj5g` for Gmail, `rowbu58rc`
for Slack. Never build one: not the app’s name or slug (`gmail`), not the id with a name joined on
(`rowbu58rc_gmail`), not an id read off another value. An `auth_id` does end in `_<service_id>`
(`auth2FvZLyE0_rowo0bqrhj5g`); that is one opaque value — pass it whole, never split it, never
compose one. The popup, the enable call and the prebuilt UI reject anything else, some of them
silently: an unknown app, a blank screen, a 400.

## A test connection, while building

Running an action, fetching a trigger’s real event and proving the token all need a connection, and
only a person can make one: the app’s sign-in runs in a browser. Ask the developer once, early, and
read the `auth_id` back yourself; never ask them to paste ids.

1. Tell the developer: “Open https://flow.viasocket.com/integrations/9096/projGXC7JJAV/apps-api, choose Gmail, click
   Connect and sign in with a test account. Tell me when it shows an `auth_id`.” That page connects as the
   test user `apps-api-test-user` — the identifier shown at the top of it.
2. Sign an embed token for `unique_identifier` `apps-api-test-user` and call `GET https://flow-api.viasocket.com/embed/authentications`
   with it. The entry whose `id` ends in `_<service_id>` is that app’s connection, and its `id` is the `auth_id`.
3. With it: enable the app once for a `script_id`; run the action once against a test target (a test channel, a
   test sheet) and keep its real response — that, not the sample printed under the action, is what a later step
   maps from; fetch a trigger’s real event with the sample call.

The test connection is for building. Its `auth_id` and `script_id` never go into the product’s code or config;
the product’s users make their own through its Connect button.

## Environment

```bash
# Your org signing secret, from the viaSocket Setup page. Backend only.
VIASOCKET_EMBED_SECRET=...

# Fixed for this integration.
VIASOCKET_ORG_ID=9096
VIASOCKET_PROJECT_ID=projGXC7JJAV
VIASOCKET_API_URL=https://flow-api.viasocket.com
VIASOCKET_RUN_URL=https://flow.sokt.io
VIASOCKET_SERVICE_ID=rowo0bqrhj5g   # Gmail
```

## Calling it

One server-side module, no dependency beyond a JWT library. Every call except the connect popup goes through it,
and every example further down uses these function names.

```js
import jwt from 'jsonwebtoken'

const API = process.env.VIASOCKET_API_URL
const RUN = process.env.VIASOCKET_RUN_URL

/**
 * uniqueIdentifier is YOUR stable id for the signed-in end user (a user id, an email hash).
 * It is not a token: it becomes the unique_identifier claim of the embed token this signs.
 * Sign on demand, per request, on the server; never cache it in the browser.
 */
export function embedToken(uniqueIdentifier) {
  return jwt.sign(
    {
      org_id: process.env.VIASOCKET_ORG_ID,
      project_id: process.env.VIASOCKET_PROJECT_ID,
      unique_identifier: uniqueIdentifier
    },
    process.env.VIASOCKET_EMBED_SECRET
  )
}

async function call(path, uniqueIdentifier, body, method = "POST") {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", authorization: embedToken(uniqueIdentifier) },
    body: body === undefined ? "" : JSON.stringify(body)
  })
  const payload = await response.json()
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || `viaSocket ${path} failed with ${response.status}`)
  }
  return payload.data
}

/** Needed only to run actions. Once per (user, app) — store the script_id. */
export async function enableApp(uniqueIdentifier, authId, serviceId = process.env.VIASOCKET_SERVICE_ID) {
  const data = await call(`/embed/enable/${serviceId}/${authId}`, uniqueIdentifier)
  return data.script_id
}

/** Every flow this user has: one per enabled app, one per trigger subscription. */
export async function listUserFlows(uniqueIdentifier) {
  const response = await fetch(`${API}/projects/${process.env.VIASOCKET_PROJECT_ID}/integrations`, {
    headers: { authorization: embedToken(uniqueIdentifier) }
  })
  const payload = await response.json()
  return payload.data?.flows || []
}

/** The script_id of an app this user already enabled, or null. Saves enabling twice. */
export async function findEnabledApp(uniqueIdentifier, serviceId = process.env.VIASOCKET_SERVICE_ID) {
  const flows = await listUserFlows(uniqueIdentifier)
  return flows.find((flow) => flow.service_id === serviceId && flow.status === "active")?.id || null
}

/** status 0 deletes a flow (an enabled app, or a subscription), 2 pauses it, 1 resumes or restores it. */
export async function setFlowStatus(uniqueIdentifier, scriptId, status = 0) {
  return call(`/embed/updatestatus/${scriptId}?status=${status}`, uniqueIdentifier, undefined, "PUT")
}

/** Every app this user has connected — enough to render your own "connected accounts" screen. */
export async function listConnections(uniqueIdentifier) {
  return call("/embed/authentications", uniqueIdentifier, undefined, "GET")
}

/** Disconnects an app. Disable the flows built on it first, or they break. */
export async function revokeConnection(uniqueIdentifier, authId) {
  return call(`/embed/authentications/revoke/${authId}`, uniqueIdentifier, undefined, "DELETE")
}

/**
 * Step 3. The values one field accepts, scoped by what is already chosen.
 *
 * fieldKey is the field's full path ("destination.channel_id" for a nested one), and
 * existingFields is shaped like inputData — nested, never flattened to dotted keys.
 */
export async function listOptions(uniqueIdentifier, actionVersionId, fieldKey, existingFields = {}, authId, { searchText } = {}) {
  const data = await call(`/embed/list-options/${actionVersionId}`, uniqueIdentifier, {
    fieldKey,
    auth_id: authId,
    // Searchable fields take what the user typed inside existingFields, next to the dependency values.
    existingFields: searchText ? { ...existingFields, _searchText: searchText } : existingFields
  })
  // A connection that cannot be read (revoked, another user's auth_id) is answered with 200 and
  // success: true, the failure nested in data. Surface it; an empty picker hides the cause.
  if (data && !Array.isArray(data) && data.response && Number(data.response.status) >= 400) {
    throw new Error(data.response.data?.message || "list-options failed")
  }
  // Two shapes, one helper: some fields wrap the list under data.data. No paging: take the list.
  const options = Array.isArray(data) ? data : data.data
  return { options }
}

/** Step 4. No token — the script_id is the credential. */
export async function runAction(scriptId, actionVersionId, inputData) {
  const response = await fetch(`${RUN}/func/${scriptId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action_version_id: actionVersionId, inputData })
  })
  const payload = await response.json()
  // The run URL answers in viaSocket's envelope { success, data } — or with the action's own body at the
  // top level, which may itself carry a `success` key (Slack's "Find Public channel" returns
  // { success, channels }). It is the envelope only when `data` is present.
  const isEnvelope = payload && typeof payload === "object" && typeof payload.success === "boolean" && "data" in payload
  if (isEnvelope ? !payload.success : payload?.success === false) throw new Error(payload.message || payload.error?.message || "Action failed")
  return isEnvelope ? payload.data : payload
}

/**
 * Step 5. `delivery` is { code: script } — a handler we run per event (rule 10, Triggers) — or,
 * as the edge case, { webhook: url } — we POST raw events to a public URL of yours. One or the other.
 */
export async function subscribeEvent(uniqueIdentifier, triggerVersionId, authId, inputData, delivery, meta = {}) {
  const data = await call(`/embed/subscribe-event/${triggerVersionId}`, uniqueIdentifier, {
    auth_id: authId,
    inputData,
    ...delivery,
    meta
  })
  // data.script_id is the subscription; data.inputData.hookUrl is the hook we created.
  return data.script_id
}

export async function updateSubscription(uniqueIdentifier, subscriptionScriptId, changes) {
  return call(`/embed/update-subscribed-event/${subscriptionScriptId}`, uniqueIdentifier, changes, "PUT")
}
```

## Step 1 — the connect button (frontend)

The only browser-side piece. The button carries Gmail's own icon (the `<img>` below; its URL is also under
“## Gmail”) and its name, so the user recognises what they are connecting; leave the icon out only for a reason
the report names. The `serviceId` is `rowo0bqrhj5g` exactly — never Gmail's name or slug, never the id with a name joined on.

**The popup is opened only by `openViasocketConnection`, from the connect script.** Never build a
viasocket URL for it by hand, never `window.open` one, never put the auth page in an iframe: the
script registers the token, hands the session over, opens the right page for the environment and
listens for the result on both of the paths it can arrive by. A URL guessed from this document
opens a page that does not exist, and the user sees "Page not found" in the popup. In your code,
the only `viasocket.com` strings are the connect script URL and the API base.

```html
<button id="connect-app" class="your-button">
  <img src="https://stuff.thingsofbrand.com/gmail.com/images/imge_idrA5FDGTH_1763454052978.svg" alt="" width="20" height="20" />
  Connect Gmail
</button>

<script type="module">
  // Before the click: the token from your backend’s endpoint, which answers { token }. The click then
  // opens the popup at once, so no popup blocker stops it.
  const { token: embedToken } = await fetch("/api/viasocket/token").then((r) => r.json())

  document.getElementById("connect-app").onclick = () =>
    openViasocketConnection(embedToken, "rowo0bqrhj5g", {
      // The action_ids and trigger_ids this product uses (listed under each action and
      // trigger below): the popup asks only for their scopes. Omit to offer every action.
      filteredActions: ["<action_id>"],
      skipActionSelection: true // straight to the app’s consent screen, no list first
    })

  window.addEventListener("message", async (event) => {
    if (event.data?.type === "viasocket_connection_success") {
      // The connection id IS the auth_id every later call takes. Hand it to your
      // backend, which enables the app and stores the script_id it gets back.
      const authId = event.data.data.id
      await fetch("/api/viasocket/connected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId: event.data.serviceId, authId })
      })
      showConnected()
    } else if (event.data?.type === "viasocket_connection_error") {
      showError(event.data.error?.message)
    } else if (event.data?.type === "viasocket_connection_closed") {
      // Best-effort: the popup seems closed and nothing was created. Leave the button as it was;
      // if the user did finish on the app’s sign-in page, a success message still follows.
    }
  })
</script>

<script id="viasocket-connect-script" src="https://flow.viasocket.com/connect.js"></script>
```

**What the popup asks for.** With the `action_id`s and `trigger_id`s this product uses (each is
listed under its action or trigger below), Gmail's consent screen asks only for their
scopes, and `skipActionSelection` opens it directly. Without the list the popup offers every Gmail
action and trigger and the user decides which to grant; a connection granted for more actions than
the product uses is not an error, only a longer consent screen.

**When the connection expires.** `GET https://flow-api.viasocket.com/embed/authentications` shows it with
`isExpired: true`. Open the same popup with its `auth_id` to sign in again — `openViasocketConnection(embedToken, "rowo0bqrhj5g", { authId })`:
the popup updates that connection in place and the same `auth_id` comes back, so the stored `auth_id`,
the app’s `script_id` and its subscriptions keep working. A product shows this as a Reconnect button
beside the expired connection.

Then, on your backend, for that user:

```js
// Only if you are going to run actions — subscribing to events needs just the authId.
let scriptId = await findEnabledApp(uniqueIdentifier, 'rowo0bqrhj5g')
if (!scriptId) scriptId = await enableApp(uniqueIdentifier, authId)
// store scriptId against (uniqueIdentifier, "rowo0bqrhj5g")
```

## Gmail

- `service_id`: `rowo0bqrhj5g`
- icon: https://stuff.thingsofbrand.com/gmail.com/images/imge_idrA5FDGTH_1763454052978.svg
- auth: Auth2.0
- 9 actions, 3 triggers

## How to render a picker for any field

This is the part that is not obvious. To show the user a dropdown of Gmail values —
repositories, channels, boards, spreadsheets — you do **not** need the action you intend to
run. You need *any* action or trigger that exposes that field, and you call list-options on
that one's `action_version_id`. The field key is the same wherever it appears.

This table gives the cheapest source for every fetchable field of this app: the action with
the fewest prerequisites. Use it to build pickers before you have decided which action the
user is ultimately running.

Every key below is the **full path**, which is exactly what `fieldKey` takes. Where one has a
dot in it the field lives inside an object, so its value is nested under that path in both
`existingFields` and `inputData`.

| field key | label | needs first | search | call list-options on | (that action) |
| --- | --- | --- | --- | --- | --- |
| `from` | From | — | — | `rowwj0sfmhub` | Send Email |
| `labelIds` | Label | — | — | `rowwj0sfmhub` | Send Email |
| `searchFields.label` | Label | — | — | `rowst14zwfdw` | New Email Arrives |
| `config.label` | Label | — | — | `rowgbuc47mad` | Modify Email Labels |
| `label` | Filter Mail by label | — | — | `row0c62qpq3t` | New Attachment |
| `searchFields.labelIds` | Label | — | — | `rowndcp2jy8p` | Search_Email_Messages |

"searchable": the field has `enableSearchApi`; send what the user typed, debounced, as `existingFields._searchText` — inside existingFields, next to the dependency values. A new text starts a new list.

Worked example — a picker for `from`:

```js
// Send Email is just the cheapest place this field appears.
const { options } = await listOptions(uniqueIdentifier, 'rowwj0sfmhub', 'from', {}, authId)

// options is [{ label, value }] — render label, submit value.
renderSelect(options)
```

## Rendering a form for any action

Only when the end user configures an action themselves. A fixed feature needs a control only for
the values its sample writes as `<…>` — a picker from the field index above, or a choice between
fixed values — not a form. Every action and trigger below is described by the same
field schema, so one renderer serves all of them: give it an `action_version_id`, it draws the
form and produces `inputData`.

| column in the tables below | render as | behaviour |
| --- | --- | --- |
| type `string`, `number`, `date`, `html`, `markdown` | text input (number/date typed) | free text from your user |
| type `boolean` | yes / no | send `true` / `false` |
| type `dropdown` | single select | options from the `value comes from` column |
| type `multiselect` | multi select | send an array of values |
| type `object` | a card containing its child fields (the keys with a dot prefix) | nest the children under the parent key in `inputData` |
| type `dictionary` | key / value rows | send an object |
| type `aifield` | free text | a description the platform turns into structured input; send a string |
| `what it is` | the label and the hint | the first part is the label on the control, the rest its hint; `Yes = true` names the choices a user reads; `default` is the initial value. Every row is shown, or fixed in code with a reason — a `required: yes` row is never dropped because its key looks technical |
| `value comes from: one of …` | static options | those literal values; with no `default`, the sample writes the key as `<one of: …>` — a choice made before the call, the user’s when the right value depends on their account |
| `value comes from: list-options` | select that fetches on open | await listOptions(uniqueIdentifier, versionId, fieldKey, existingFields, authId); show `label`, send `value` |
| `list-options (searchable)` | the same, with a search box | debounce typing and send it as `existingFields._searchText`; a new text starts a new list |
| `needs first` / `list-options after X` | disabled until X has a value | put X's current value in `existingFields`, nested exactly as `inputData`; clear this field when X changes |
| `only applies when …` | hidden unless the condition holds | leave hidden fields out of `inputData` entirely |
| `after X has a value` | the form’s order: shown once X is filled | fill X first — it is the field this one depends on, usually a picker; in a complete `inputData` the key is present |
| `required: yes` | validation | block submit while empty and visible |

`fieldKey` for a fetch is always the full dotted path in the table. The result is the same
`inputData` shape as the sample under each action; submit it unchanged.

The complete recipe — the raw schema and where to get it, the eight rules, a framework-free
form engine and a React skin with paging and search — is its own document. Fetch it when you
build the form:

```http
GET https://flow.viasocket.com/documentation/form-renderer.md
```

This app's raw schema: `POST https://flow.sokt.io/func/scriK4LFg2kc` with `{"service_id":"rowo0bqrhj5g"}` → `{ service, actions, triggers }`, each action and trigger with its two ids and its `input_schema`.

## Actions

Run any of these with `runAction(scriptId, action_version_id, inputData)` — the `action_version_id` printed first under the action, never its `action_id`.

**What a call returns is known only by making it.** The samples below were written by each connector’s author, and some actions have none;
neither is a live response. Before any code reads a field of a result — a step mapping from `context.res`, a handler using a second
app’s return, the product storing an id — run the action once on the test connection (section “A test connection, while building”)
and map from what actually came back. A read action is safe to run as it is; a write action goes against a test target.

**A `<…>` in a sample is a value still owed, never one to send.** `<id from list-options>` is fetched; `<one of: …>` is a
choice between the fixed values in the table — the user’s, on screen, when the right value depends on their own account
(their workspace, personal or shared, admin or not); yours, in code, only when one value serves every user. A `default` in
the table is the form’s initial value, not that decision.


### Create Email Draft

- `action_version_id`: `rowramm1dluq` — for the run call and `list-options`
- `action_id`: `rowo62gexkpc` — for the connect popup's `filteredActions` (Step 1), an automation step’s `action_id` and the prebuilt UI’s `open: { actionId }`. Never in place of the version id above, nor the other way round
- Save an email draft in Gmail with recipients, subject, plain or HTML message, and optional attachments (file URLs or Google Drive files).
- fetch first: `from`

| key | type | required | what it is | value comes from | only applies when |
| --- | --- | --- | --- | --- | --- |
| `to` | string | yes | To — Enter the recipient's email address. For multiple recipients, separate addresses with commas. | your user |  |
| `cc` | string | no | CC — Enter email addresses to send a copy of the email. Separate multiple addresses with commas. | your user |  |
| `bcc` | string | no | BCC — Enter email addresses to send a blind copy of the email. Separate multiple addresses with commas. | your user |  |
| `replyTo` | string | no | Reply-To — Enter the reply-to email address. | your user |  |
| `from` | dropdown | no | From — Select the sender's email address. | list-options |  |
| `fromName` | string | no | From Name — Enter the sender's display name. | your user |  |
| `subject` | string | yes | Subject | your user |  |
| `messageType` | dropdown | yes | Message Type — Select the format of the email message. — Plain Text = "text", HTML = "html" | one of "text", "html" |  |
| `messageBody` | string | yes | Message Body (Plain Text) — Enter the plain text body of the email. | your user | only when messageType = "text" |
| `htmlBody` | html | yes | Message Body (HTML) — Enter the HTML body of the email. | your user | only when messageType = "html" |
| `attachments` | string | no | Attachments — Add file URLs to attach. Separate multiple URLs with commas. | your user |  |

```js
const result = await runAction(scriptId, 'rowramm1dluq', {
  "to": "<to>",
  "cc": "<cc>",
  "bcc": "<bcc>",
  "replyTo": "<replyTo>",
  "from": "<id from list-options>",
  "fromName": "<fromName>",
  "subject": "<subject>",
  "messageType": "<one of: text | html>",
  "messageBody": "<messageBody>",
  "htmlBody": "<htmlBody>",
  "attachments": "<attachments>"
})
```

A sample of what this call returns, as the connector’s author wrote it; a live response can differ. Run the action once on the test connection before a later step maps from it:

```json
{
  "data": {
    "id": "d-123",
    "message": {
      "id": "m-123",
      "labelIds": [
        "DRAFT"
      ],
      "threadId": "t-123"
    }
  },
  "draftId": "r-123",
  "message": "Draft created",
  "success": true,
  "threadId": "t-123"
}
```

### Get Email Attachment

- `action_version_id`: `rowd1cj5r1q0` — for the run call and `list-options`
- `action_id`: `row050uf6o48` — for the connect popup's `filteredActions` (Step 1), an automation step’s `action_id` and the prebuilt UI’s `open: { actionId }`. Never in place of the version id above, nor the other way round
- Retrieve attachments from an email by Message ID and return attachment details (filename, MIME type, size) and accessible URLs.

| key | type | required | what it is | value comes from | only applies when |
| --- | --- | --- | --- | --- | --- |
| `messageId` | string | yes | Message ID — Enter the unique Message/thread ID of the email containing the attachment you want to retrieve. | your user |  |

```js
const result = await runAction(scriptId, 'rowd1cj5r1q0', {
  "messageId": "<messageId>"
})
```

A sample of what this call returns, as the connector’s author wrote it; a live response can differ. Run the action once on the test connection before a later step maps from it:

```json
{
  "attachmentCount": 1,
  "attachmentDetails": [
    {
      "url": "https://example.com/file.txt",
      "size": 12345,
      "filename": "file.txt",
      "mimeType": "text/plain",
      "attachmentId": "sampleId"
    }
  ]
}
```

### Get Gmail Message by ID

- `action_version_id`: `rowodx4ucmph` — for the run call and `list-options`
- `action_id`: `row8s689orsm` — for the connect popup's `filteredActions` (Step 1), an automation step’s `action_id` and the prebuilt UI’s `open: { actionId }`. Never in place of the version id above, nor the other way round
- Retrieve a single Gmail message by message ID, returning headers, plain and HTML body, attachments, and thread info.

| key | type | required | what it is | value comes from | only applies when |
| --- | --- | --- | --- | --- | --- |
| `message_id` | string | yes | Message ID — Enter the message ID returned by the Search_Email_Messages or List_all_Mails action. | your user |  |

```js
const result = await runAction(scriptId, 'rowodx4ucmph', {
  "message_id": "<message_id>"
})
```

A sample of what this call returns, as the connector’s author wrote it; a live response can differ. Run the action once on the test connection before a later step maps from it:

```json
{
  "cc": "",
  "id": "18c7f4d8e2a1b345",
  "to": "customer@example.com",
  "bcc": "",
  "body": {
    "html": "<p>Thanks for reaching out.</p>",
    "plain": "Thanks for reaching out."
  },
  "from": "sender@example.com",
  "subject": "Paperform submission",
  "emailUrl": "https://mail.google.com/mail/u/0/#inbox/18c7f4d8e2a1b345",
  "labelIds": [
    "INBOX",
    "UNREAD"
  ],
  "threadId": "18c7f4d8e2a1b346",
  "historyId": "12345",
  "attachmentCount": 1,
  "latestReplyDate": "2026-09-29T05:07:31.000Z",
  "originalSentDate": "2026-09-28T05:07:31.000Z",
  "attachmentDetails": [
    {
      "size": 12034,
      "partId": "2",
      "filename": "invoice.pdf",
      "mimeType": "application/pdf",
      "attachmentId": "ANGjdJ-example"
    }
  ],
  "numOfMessagesInThread": 2
}
```

### Get Thread Replies

- `action_version_id`: `rowsesarjlu2` — for the run call and `list-options`
- `action_id`: `rowy64fw443v` — for the connect popup's `filteredActions` (Step 1), an automation step’s `action_id` and the prebuilt UI’s `open: { actionId }`. Never in place of the version id above, nor the other way round
- Retrieve all messages in a thread excluding those sent from the specified email address.

| key | type | required | what it is | value comes from | only applies when |
| --- | --- | --- | --- | --- | --- |
| `thread_id` | string | yes | Thread ID — Enter the Mail thread ID. You can find it in the New Email trigger payload. | your user |  |

```js
const result = await runAction(scriptId, 'rowsesarjlu2', {
  "thread_id": "<thread_id>"
})
```

A sample of what this call returns, as the connector’s author wrote it; a live response can differ. Run the action once on the test connection before a later step maps from it:

```json
{
  "replies": [
    {
      "date": "2026-07-17T10:07:08Z",
      "from": "user@example.com",
      "messageId": "m2",
      "plainBody": "Thanks"
    }
  ],
  "threadId": "THREAD_1",
  "repliesCount": 1,
  "totalMessages": 2,
  "originalMessage": {
    "date": "2026-07-16T04:12:45Z",
    "from": "noreply@example.com",
    "subject": "Verification",
    "threadId": "THREAD_1",
    "messageId": "m1",
    "plainBody": "Short plain text"
  }
}
```

### List_all_Mails

- `action_version_id`: `rowgko0n0edh` — for the run call and `list-options`
- `action_id`: `row6xm9ah3xx` — for the connect popup's `filteredActions` (Step 1), an automation step’s `action_id` and the prebuilt UI’s `open: { actionId }`. Never in place of the version id above, nor the other way round
- Added optional multi-select System Labels filter (Spam/Important/Categories/etc.) mapped to Gmail system label IDs and applied via labelIds param with backward-compatible behavior.

| key | type | required | what it is | value comes from | only applies when |
| --- | --- | --- | --- | --- | --- |
| `max` | number | no | Max Records — Enter the maximum number of emails to return. | your user |  |
| `pageToken` | string | no | Page Token — Enter the token from the previous response to get the next page. | your user |  |

```js
const result = await runAction(scriptId, 'rowgko0n0edh', {
  "max": 0,
  "pageToken": "<pageToken>"
})
```

A sample of what this call returns, as the connector’s author wrote it; a live response can differ. Run the action once on the test connection before a later step maps from it:

```json
{
  "id": "abc123",
  "to": "recipient@example.com",
  "from": "example@example.com",
  "subject": "Your Subject Here",
  "labelIds": [
    "INBOX",
    "UNREAD"
  ]
}
```

### Modify Email Labels

- `action_version_id`: `rowgbuc47mad` — for the run call and `list-options`
- `action_id`: `rowipwdvvbek` — for the connect popup's `filteredActions` (Step 1), an automation step’s `action_id` and the prebuilt UI’s `open: { actionId }`. Never in place of the version id above, nor the other way round
- Add or remove labels on a message or thread; target by thread ID, message ID, or search filters.
- fetch first: `config.label`

| key | type | required | what it is | value comes from | only applies when |
| --- | --- | --- | --- | --- | --- |
| `config` | object | no |  | its child keys, the rows below |  |
| `config.operation` | dropdown | yes | Operation — Select whether to add or remove the selected label(s) from the matched message or thread(s). — Enter add to add labels, or remove to remove labels. — Add Label = "add", Remove Label = "remove" — default "add" | one of "add", "remove" |  |
| `config.label` | multiselect | yes | Label — Select one or more Gmail labels. Sent, Draft and Chat are managed by Gmail and not listed. Spam and Trash cannot be added together. — Enter the Label ID(s) manually. You can get the label IDs from actions like List Labels. Sent, Draft and Chat are n… | list-options |  |
| `config.useThreadId` | dropdown | yes | Filter By — Select 'Use Message ID' to update specific messages, 'Use Thread ID' to update entire threads, or 'Search Email' to find threads using filter conditions. — Enter use_message to identify by Message ID, use_thread to identify by Thread ID, or sear… | one of "use_message", "use_thread", "search_email" |  |
| `config.messageId` | string | yes | Message IDs — Enter one or more Gmail Message IDs, separated by commas. Only these messages are updated; other messages in the same thread are not affected. Multiple IDs are updated in a single batch call (up to 1000 per call). Use the 'List Emails' and 'Se… | your user | only when config.useThreadId = "use_message" |
| `config.threadId` | string | yes | Thread IDs — Enter the Gmail Thread ID. Use the 'List Emails' action to get all Threads along with their IDs | your user | only when config.useThreadId = "use_thread" |
| `config.from` | string | no | From | your user | only when config.useThreadId = "search_email" |
| `config.to` | string | no | To | your user | only when config.useThreadId = "search_email" |
| `config.cc` | string | no | CC | your user | only when config.useThreadId = "search_email" |
| `config.bcc` | string | no | BCC | your user | only when config.useThreadId = "search_email" |
| `config.subject` | string | no | Subject — Enter the subject text to search for matching threads. | your user | only when config.useThreadId = "search_email" |
| `config.matchHandling` | dropdown | yes | Match Handling — Select whether to apply the label operation to only the most recent matching thread or all matching threads. — Enter recent to apply to the most recent match only, or all to apply to all matching mails. — Apply to Most Recent Match Only = "… | one of "recent", "all" | only when config.useThreadId = "search_email" |
| `config.maxMatches` | number | yes | Matching Threads — Enter the maximum number of matching threads to process in a single run. Recommended maximum: 25, to avoid rate limits. | your user | applies when config.useThreadId === "search_email" && config.matchHandling === 'all' |

```js
const result = await runAction(scriptId, 'rowgbuc47mad', {
  "config": {
    "operation": "add",
    "label": [
      "<id from list-options>"
    ],
    "useThreadId": "search_email",
    "from": "<from>",
    "to": "<to>",
    "cc": "<cc>",
    "bcc": "<bcc>",
    "subject": "<subject>",
    "matchHandling": "recent",
    "maxMatches": 0
  }
})
```

A sample of what this call returns, as the connector’s author wrote it; a live response can differ. Run the action once on the test connection before a later step maps from it:

```json
{
  "results": [
    {
      "status": "success",
      "labelIds": [
        "Label_8310433811936292840",
        "IMPORTANT",
        "SENT",
        "Label_3859301108852197983",
        "INBOX",
        "Label_5015927466667266057"
      ],
      "threadId": "19f4b420bbb37f7d",
      "messageCount": 2
    }
  ],
  "operation": "add",
  "appliedLabels": [
    "Label_3859301108852197983",
    "Label_5015927466667266057",
    "Label_8310433811936292840"
  ],
  "totalLabelsApplied": 3,
  "totalThreadsProcessed": 1
}
```

### Reply To Thread

- `action_version_id`: `rowxvyjgbn1y` — for the run call and `list-options`
- `action_id`: `rowpco656a3b` — for the connect popup's `filteredActions` (Step 1), an automation step’s `action_id` and the prebuilt UI’s `open: { actionId }`. Never in place of the version id above, nor the other way round
- Reply to an existing email thread — choose recipients (sender/all/specific), send text or HTML, add attachments, and apply labels.
- fetch first: `labelIds`

| key | type | required | what it is | value comes from | only applies when |
| --- | --- | --- | --- | --- | --- |
| `threadId` | string | yes | Thread ID — Enter the Gmail Thread ID to reply to. This is available from a Gmail trigger or a previous Find Email action. | your user |  |
| `replyMode` | dropdown | yes | Reply Mode — Select how you want to address this reply. Reply to sender only is recommended for automated workflows to avoid unintended mass replies. — Enter 'sender' to reply to the original sender only, 'all' to reply to all recipients, or 'specific' to e… | one of "sender", "all", "specific" |  |
| `to` | string | yes | To — Enter recipient email addresses separated by commas, e.g. john@example.com, jane@example.com | your user | only when replyMode = "specific" |
| `cc` | string | no | CC — Enter CC email addresses separated by commas, e.g. john@example.com, jane@example.com | your user | applies when replyMode === 'specific' \|\| replyMode === 'all' |
| `bcc` | string | no | BCC — Enter BCC email addresses separated by commas, e.g. john@example.com, jane@example.com | your user | applies when replyMode === 'specific' \|\| replyMode === 'all' |
| `messageType` | dropdown | yes | Message Body Format — Select how you want to compose the message body. — Enter 'text' for plain text or 'html' for HTML formatted content. — Plain Text = "text", HTML = "html" — default "text" | one of "text", "html" |  |
| `messageBody` | string | yes | Message Body — Enter your email content in plain text. | your user | only when messageType = "text" |
| `htmlBody` | html | yes | HTML Body — Enter your email content in HTML. HTML will be rendered as formatted content in the email. | your user | only when messageType = "html" |
| `fromName` | string | no | Sender Name — Enter a display name to show as the sender. If left blank, only your email address will appear. | your user |  |
| `attachments` | string | no | Attachments — Enter attachment URLs separated by commas, e.g. https://example.com/file1.pdf, https://example.com/file2.pdf | your user |  |
| `labelIds` | multiselect | no | Labels — Select Gmail labels to organise the sent reply in your mailbox. — Enter Gmail label IDs as an array. You can get label IDs from actions like List Labels or Find Label. | list-options |  |

```js
const result = await runAction(scriptId, 'rowxvyjgbn1y', {
  "threadId": "<threadId>",
  "replyMode": "sender",
  "cc": "<cc>",
  "bcc": "<bcc>",
  "messageType": "text",
  "messageBody": "<messageBody>",
  "fromName": "<fromName>",
  "attachments": "<attachments>",
  "labelIds": [
    "<id from list-options>"
  ]
})
```

A sample of what this call returns, as the connector’s author wrote it; a live response can differ. Run the action once on the test connection before a later step maps from it:

```json
{
  "id": "msg_1",
  "labelIds": [
    "SENT_LABEL"
  ],
  "threadId": "thr_1"
}
```

### Search_Email_Messages

- `action_version_id`: `rowndcp2jy8p` — for the run call and `list-options`
- `action_id`: `rowr1h03w5cx` — for the connect popup's `filteredActions` (Step 1), an automation step’s `action_id` and the prebuilt UI’s `open: { actionId }`. Never in place of the version id above, nor the other way round
- Search emails (manual or AI), resolve custom labels by name or ID, and return message details, attachments, and a next-page token.
- fetch first: `searchFields.labelIds`

| key | type | required | what it is | value comes from | only applies when |
| --- | --- | --- | --- | --- | --- |
| `search_mode` | dropdown | yes | Search Mode — Select how you want to search emails. — Enter manual or ai to choose the search mode. — Manual Search = "manual", AI Search = "ai" — default "manual" | one of "manual", "ai" |  |
| `ai_query` | aifield | yes | Describe Your Search — Enter a plain English description of the emails you want to find. | your user | only when search_mode = "ai" |
| `includeReplies` | boolean | no | Include Replies — Select yes to also return new replies that arrive later under the same label/filter, or no to return only the first email of each conversation. — Enter true to include replies in the thread, false to return only the first email of each con… | one of true, false |  |
| `query` | multiselect | yes | Search By — Select the fields you want to filter emails by. — Enter the field values to filter by, such as senderEmail, to, cc, bcc, subject, label, or domain. | one of "senderEmail", "to", "cc", "bcc", "subject", "label", "domain" | only when search_mode = "manual" |
| `searchFields` | object | no | Search Keywords — Enter search value for selected fields. | its child keys, the rows below | applies when search_mode === 'manual' && (query.includes('senderEmail') \|\| query.includes('subject') \|\| query.includes('label') \|\| query.includes('to') \|\| query.includes('cc') \|\| query.includes('bcc') \|\| query.includes('domain')) |
| `searchFields.senderEmail` | string | yes | From | your user | applies when query.includes('senderEmail') |
| `searchFields.to` | string | yes | To — Enter the recipient email address to search emails sent to a specific person. | your user | applies when query.includes('to') |
| `searchFields.cc` | string | yes | CC | your user | applies when query.includes('cc') |
| `searchFields.bcc` | string | yes | BCC | your user | applies when query.includes('bcc') |
| `searchFields.subject` | string | yes | Subject — Enter the subject keyword to search emails containing this text in the subject line. | your user | applies when query.includes('subject') |
| `searchFields.labelIds` | multiselect | yes | Label — Select one or more labels, or enter system or custom label names and IDs. All entries are resolved to Gmail label IDs automatically. — Enter label names or IDs. System labels (e.g. INBOX) and custom labels are resolved to their Gmail label IDs autom… | list-options | applies when query.includes('label') |
| `searchFields.domain` | string | yes | Domain — Enter the domain name to search emails from any sender at this domain. | your user | applies when query.includes('domain') |
| `searchFields.operator` | dropdown | no | Match Condition — Choose how filters should be combined. Match All (AND) = all conditions must match. Match Any (OR) = any one condition can match. — Enter AND to match all filters, or OR to match any filter. — Match All (AND) = "AND", Match Any (OR) = "OR"… | one of "AND", "OR" | applies when query && query.length > 1 |
| `pagination` | object | no | Pagination — Enter pagination settings to control the number of results and continue fetching next pages. | its child keys, the rows below |  |
| `pagination.maxResults` | number | no | Max Records — Enter the maximum number of emails to return. | your user |  |
| `pagination.pageToken` | string | no | Next Page Token — Enter the page token to fetch the next set of records. | your user |  |
| `select_response_fields` | multiselect | no | Fields to Include in Response — Select the fields you want to include in the response. If none are selected, all fields will be returned. — Enter the field names to include in the response. If empty, all fields are returned. | one of "id", "labelIds", "threadId", "numOfMessagesInThread", "to", "cc", "bcc", "from", "subject", "body", "attachmentCount", "attachmentDetails", "historyId", "emailUrl", "latestReplyDate", "originalSentDate" |  |

```js
const result = await runAction(scriptId, 'rowndcp2jy8p', {
  "search_mode": "manual",
  "includeReplies": false,
  "query": [
    "<one of: senderEmail | to | cc | bcc | …>"
  ],
  "searchFields": {
    "senderEmail": "<senderEmail>",
    "to": "<to>",
    "cc": "<cc>",
    "bcc": "<bcc>",
    "subject": "<subject>",
    "labelIds": [
      "<id from list-options>"
    ],
    "domain": "<domain>",
    "operator": "AND"
  },
  "pagination": {
    "maxResults": 0,
    "pageToken": "<pageToken>"
  },
  "select_response_fields": [
    "<one of: id | labelIds | threadId | numOfMessagesInThread | …>"
  ]
})
```

A sample of what this call returns, as the connector’s author wrote it; a live response can differ. Run the action once on the test connection before a later step maps from it:

```json
{
  "emails": [
    {
      "cc": "",
      "id": "msg_1",
      "to": "user@example.com",
      "bcc": "",
      "body": {
        "html": "<p>Short body</p>",
        "plain": "Short body"
      },
      "from": "sender@example.com",
      "subject": "Test",
      "emailUrl": "https://mail.google.com/mail/u/0/#inbox/msg_1",
      "labelIds": [
        "INBOX",
        "Label_123"
      ],
      "threadId": "thread_1",
      "historyId": "12345",
      "attachmentCount": 0,
      "latestReplyDate": "2026-05-22T00:00:00Z",
      "originalSentDate": "2026-05-20T00:00:00Z",
      "attachmentDetails": "No attachment found in this mail",
      "numOfMessagesInThread": 0
    }
  ],
  "totalResults": 1
}
```

### Send Email

- `action_version_id`: `rowwj0sfmhub` — for the run call and `list-options`
- `action_id`: `rowogelpy0h6` — for the connect popup's `filteredActions` (Step 1), an automation step’s `action_id` and the prebuilt UI’s `open: { actionId }`. Never in place of the version id above, nor the other way round
- send a new email message.
- fetch first: `from`, `labelIds`

| key | type | required | what it is | value comes from | only applies when |
| --- | --- | --- | --- | --- | --- |
| `to` | string | yes | To — Separate multiple addresses with commas, e.g. john@example.com, jane@example.com | your user |  |
| `cc` | string | no | CC — Separate multiple addresses with commas, e.g. john@example.com, jane@example.com | your user |  |
| `bcc` | string | no | BCC | your user |  |
| `subject` | string | yes | Subject | your user |  |
| `from` | dropdown | no | From | list-options |  |
| `fromName` | string | no | Sender Name | your user |  |
| `replyTo` | string | no | Reply To — Replies will be directed to this address instead of the sender's. | your user |  |
| `messageBody` | html | yes | Message Body — Enter your email content in plain text or HTML. HTML will be rendered as formatted content in the email. For example, use <b>bold</b> for bold text, <p>paragraph</p> for paragraphs, or <a href='https://example.com'>click here</a> for links | your user |  |
| `attachments` | string | no | Attachments — Separate multiple URLs with commas, e.g. https://example.com/file1.pdf, https://example.com/file2.pdf | your user |  |
| `labelIds` | multiselect | no | Label — Assign Gmail labels to organise the sent message in your mailbox. — You can find the label Id from the action \"List Label\" or \"Find Label\" | list-options |  |

```js
const result = await runAction(scriptId, 'rowwj0sfmhub', {
  "to": "<to>",
  "cc": "<cc>",
  "bcc": "<bcc>",
  "subject": "<subject>",
  "from": "<id from list-options>",
  "fromName": "<fromName>",
  "replyTo": "<replyTo>",
  "messageBody": "<messageBody>",
  "attachments": "<attachments>",
  "labelIds": [
    "<id from list-options>"
  ]
})
```

A sample of what this call returns, as the connector’s author wrote it; a live response can differ. Run the action once on the test connection before a later step maps from it:

```json
{
  "id": "m_1",
  "labelIds": [
    "SENT"
  ],
  "threadId": "t_1"
}
```

## Triggers

Subscribing to an event means telling us **what to do when it fires**. That is a `code` handler:
a short script we run on our servers per event, with the event in `context.req.body`. Your server
is not in the path; the handler does the work itself. Decide from what the product wants:

| When the event fires, the product wants… | Handler |
| --- | --- |
| something to happen in another app the user connected (“new mail → post to Slack”) | **Template A**: run that app’s action |
| its own backend to know (“new mail → save it in our database”) | **Template B**: call your own API, with your own auth header baked in |
| both | one handler doing A, then B |
| raw events pushed to a public, unauthenticated endpoint of yours | `webhook: url` instead of `code` — the edge case; confirm with the developer before choosing it |

**See the real event before mapping it.** Whichever handler you write maps keys of the event. Fetch one
real event of the trigger first — for the connection the handler will run on (the developer’s own Gmail
connection while building, the user’s at setup):

```bash
curl -X POST 'https://flow.sokt.io/func/scrijZpnr8zJ?action_id=<trigger_id>&auth_id=<auth_id>&authType=Auth2.0' \
  -H 'Content-Type: application/json' \
  -d '{"context":{"inputData":{}}}'
# → one real event of this trigger for this connection: exactly what context.req.body holds when it fires
```

It answers with **one real event of that trigger for that connection**, as the app delivers it —
the object a handler reads as `context.req.body`, and that an automation’s steps read at
`context.req.body` when the trigger fires. Map from its keys, not from the trigger’s name or the
catalog’s generic `sample_output`: the same event has `From.email` in one app and `sender` in
another, and only this call shows which, for this account, with this `inputData`.

- The query key is `action_id`, but it takes the trigger’s **`trigger_id`** (never its
  `trigger_version_id`, which answers `{ "success": true, "message": "No response" }` and nothing
  else). `auth_id` is the connection to read from — the developer’s own test connection while
  building, the end user’s at setup; `NoAuth` for an app without sign-in. `authType` is the
  catalog’s `service.auth_type` for the app.
- The body is `{ "context": { "inputData": … } }` with the trigger’s own fields, shaped as its table
  says; a required field left out answers 400 with the trigger’s message naming the accepted values.
- `viasocket_help`, when present, is a note from viaSocket about the sample (that nothing matched
  yet and this is a stand-in; that one item of a feed is shown). Read it, drop it, never map it.
- `{ "response": { "status": 400, "data": { "message": "Auth data not found" } } }` means the
  `auth_id` cannot be read: wrong, revoked, or another user’s.
- No token: the `auth_id` is the credential, so this is a server-side or terminal call, never one
  from the browser.

Each trigger below prints this call with its own `trigger_id` and `inputData`; a `<one of: …>` in that `inputData` is a choice between the table’s fixed values, made before the call — the user’s, on screen, when the right value depends on their account; yours in code only when one value serves everyone.

**Template A — run an action in another app.** The other app has its own document: fetch it for the
action’s `action_version_id` and fields, and enable that app once for this user at setup (its Step 1)
to get its `script_id`. Values the action needs picked (a channel, a sheet) are fetched with
`list-options` at setup too. Bake all of them into the string. The run URL takes no token: the
`script_id` is the credential, so the handler needs no secret. Map event keys from the sample
under each trigger below.

```js
// A string, not a function: it is sent to viaSocket and executed there.
// ${…} below are YOUR variables, baked in per user at subscribe time.
const handler = `
  const event = context.req.body
  const response = await fetch("https://flow.sokt.io/func/${otherAppScriptId}", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action_version_id: "${otherAppActionVersionId}", // from the other app’s document
      inputData: {
        // that action’s fields, mapped from this event (keys as in the sample below)
        channel_id: "${channelIdPickedAtSetup}",
        text: "New mail from " + event.from + ": " + event.subject
      }
    })
  })
  const result = await response.json()
  // Envelope { success, data }, or the action's own body (which may carry its own success key).
  if ("data" in result ? !result.success : result.success === false) throw new Error(result.message || "action failed")
  return "data" in result ? result.data : result
`
```

**Template B — tell your own product.** Call your API from the handler with your own auth header
baked in. Your endpoint stays protected; nothing has to be public.

```js
const handler = `
  const event = context.req.body
  await axios.post("https://your-app.com/api/viasocket-events", { event, user_id: "${uniqueIdentifier}" }, {
    headers: { authorization: "Bearer ${apiKeyForThisUser}" }
  })
  return { delivered: true }
`
```

Then subscribe with it, on the trigger’s `trigger_version_id` — printed first under each trigger
below, never its `trigger_id`. Each trigger shows this call with its own `inputData`:

```js
await subscribeEvent(uniqueIdentifier, '<trigger_version_id>', authId, inputData, { code: handler }, { user_id: uniqueIdentifier })
```

The edge case, only when the developer wants raw events on a public endpoint of theirs: pass
`webhook: 'https://your-app.com/webhooks/viasocket'` instead of `code`. We POST every event there
with `meta` attached, unauthenticated, so use `meta` to identify the user and treat the body as untrusted.

**Record every subscription you create.** The response gives you only the `script_id`, and
`listFlows` later returns id, title and status — not the `inputData` or the handler. So the only
way to know later *what* a user is subscribed to, with which settings and doing what, is your own
record, keyed by your user and the trigger. Save it in the same transaction as the subscribe call:

```json
{
  "unique_identifier": "<your user id>",
  "service_id": "rowo0bqrhj5g",
  "trigger_version_id": "<the trigger subscribed to>",
  "script_id": "<from the subscribe response>",
  "auth_id": "<the connection used>",
  "inputData": { "...": "exactly what was sent" },
  "delivery": { "code": "<the handler string>" },
  "created_at": "<timestamp>"
}
```

Check this record before subscribing again (same user, same trigger, same `inputData` means it
already exists), use its `script_id` to pause, resume, update or remove the subscription, and show
it to the user as “what is connected”. For a `webhook` subscription store `{ "webhook": "<url>" }`
as the delivery instead.

**How often we check.** Some triggers are polled rather than pushed. For those, `inputData` may
carry `scheduledTime`, the minutes between checks, as a string: `"5"` or `"15"`. Leave it out for
the default. It sits beside the event’s own fields:

```json
{ "channel_id": ["<id from list-options>"], "scheduledTime": "5" }
```


### New Attachment

- `trigger_version_id`: `row0c62qpq3t` — for `subscribe-event` and `list-options`
- `trigger_id`: `row2x9mwjvr5` — for the connect popup's `filteredActions` (Step 1), an automation’s `trigger_id` and the prebuilt UI’s `open: { triggerId }`. Never in place of the version id above, nor the other way round
- Retrieve recent Gmail messages (optionally filtered by label) that contain attachments, upload those attachments to Viasocket, and return message and attachment details.
- fetch first: `label`

| key | type | required | what it is | value comes from | only applies when |
| --- | --- | --- | --- | --- | --- |
| `label` | multiselect | yes | Filter Mail by label — Select or Enter the label Id. | list-options |  |

```js
// Subscribe once per user. Save the record described under Triggers: script_id, inputData, handler.
const subscriptionId = await subscribeEvent(
  uniqueIdentifier,
  'row0c62qpq3t',
  authId,
  {
    "label": [
      "<id from list-options>"
    ]
  },
  { code: handler }, // what to do when it fires — a handler from the templates above
  { user_id: uniqueIdentifier }
)
```

Before mapping its keys, fetch one real event for a connection (the developer’s own while building — `auth_id` from
`GET /embed/authentications` with their test user’s token). What comes back is exactly what `context.req.body` holds:

```bash
curl -X POST 'https://flow.sokt.io/func/scrijZpnr8zJ?action_id=row2x9mwjvr5&auth_id=<auth_id>&authType=Auth2.0' \
  -H 'Content-Type: application/json' \
  -d '{"context":{"inputData":{"label":["<id from list-options>"]}}}'
# → one real event of this trigger for this connection: exactly what context.req.body holds when it fires
```

A sample of the event as the connector’s author recorded it. Map from the sample call above, made for the real connection, not from this:

```json
{
  "date": "Sample date",
  "rawId": "sample-id",
  "bodyPlain": "Sample body content",
  "rawSizeEstimate": 123,
  "rawPayloadHeaders": {
    "To": "Sample Receiver",
    "From": "Sample Sender",
    "Subject": "Sample subject"
  }
}
```

### New Email Arrives

- `trigger_version_id`: `rowst14zwfdw` — for `subscribe-event` and `list-options`
- `trigger_id`: `row9ls2itxoc` — for the connect popup's `filteredActions` (Step 1), an automation’s `trigger_id` and the prebuilt UI’s `open: { triggerId }`. Never in place of the version id above, nor the other way round
- Runs when new email arrives. Filter by label, sender, or subject and choose to include or ignore replies.
- fetch first: `searchFields.label`

| key | type | required | what it is | value comes from | only applies when |
| --- | --- | --- | --- | --- | --- |
| `thread` | dropdown | yes | Email Trigger Behavior — Select whether the flow triggers only for the first email in a conversation, or also for later replies. — Enter first_email_only or include_replies. — Only the first email = "first_email_only", Include new replies as well = "include… | one of "first_email_only", "include_replies" |  |
| `query` | multiselect | no | Search By — Select the filters to apply. An email must match every selected filter; within each filter, any one value is enough. — Enter an array of filters. Supported values are subject, senderEmail and label. — Subject = "subject", Sender Email = "senderE… | one of "subject", "senderEmail", "label" |  |
| `searchFields` | object | no | Filter Values — Enter the values for the filters selected in Search By. | its child keys, the rows below | applies when ['senderEmail', 'subject', 'label'].some(k => [].concat(query ?? []).flatMap(v => String(v.value ?? v).replace(/[ [ ]"']/g, '').split(',')).map(v => v.trim()).includes(k)) |
| `searchFields.senderEmail` | string[] | yes | Sender Email — Enter one or more sender email addresses. An email from any listed sender matches. | your user | applies when [].concat(query ?? []).flatMap(v => String(v.value ?? v).replace(/[ [ ]"']/g, '').split(',')).map(v => v.trim()).includes('senderEmail') |
| `searchFields.subject` | string[] | yes | Subject — Enter one or more subject keywords. See the matching rules below. | your user | applies when [].concat(query ?? []).flatMap(v => String(v.value ?? v).replace(/[ [ ]"']/g, '').split(',')).map(v => v.trim()).includes('subject') |
| `searchFields.label` | multiselect | yes | Label — Select one or more labels. An email with any selected label matches. — Enter an array of label IDs. Use the List Labels or Find Label action to get them. | list-options | applies when [].concat(query ?? []).flatMap(v => String(v.value ?? v).replace(/[ [ ]"']/g, '').split(',')).map(v => v.trim()).includes('label') |

```js
// Subscribe once per user. Save the record described under Triggers: script_id, inputData, handler.
const subscriptionId = await subscribeEvent(
  uniqueIdentifier,
  'rowst14zwfdw',
  authId,
  {
    "thread": "first_email_only",
    "query": [
      "<one of: subject | senderEmail | label>"
    ],
    "searchFields": {
      "senderEmail": [
        "<senderEmail>"
      ],
      "subject": [
        "<subject>"
      ],
      "label": [
        "<id from list-options>"
      ]
    }
  },
  { code: handler }, // what to do when it fires — a handler from the templates above
  { user_id: uniqueIdentifier }
)
```

Before mapping its keys, fetch one real event for a connection (the developer’s own while building — `auth_id` from
`GET /embed/authentications` with their test user’s token). What comes back is exactly what `context.req.body` holds:

```bash
curl -X POST 'https://flow.sokt.io/func/scrijZpnr8zJ?action_id=row9ls2itxoc&auth_id=<auth_id>&authType=Auth2.0' \
  -H 'Content-Type: application/json' \
  -d '{"context":{"inputData":{"thread":"first_email_only","query":["<one of: subject | senderEmail | label>"],"searchFields":{"senderEmail":["<senderEmail>"],"subject":["<subject>"],"label":["<id from list-options>"]}}}}'
# → one real event of this trigger for this connection: exactly what context.req.body holds when it fires
```

A sample of the event as the connector’s author recorded it. Map from the sample call above, made for the real connection, not from this:

```json
{
  "To": {
    "name": null,
    "email": "recipient@example.com"
  },
  "From": {
    "name": "Sender Name",
    "email": "sender@example.com"
  },
  "date": "2026-08-29T02:09:18-04:00",
  "rawId": "1a04c23716ee14f9",
  "subject": "Sample subject",
  "threadId": "1a04c23716ee14f9",
  "bodyPlain": "Short preview text.",
  "messageUrl": "https://mail.google.com/mail/u/0/#inbox/1a04c23716ee14f9",
  "rawLabelIds": [
    "UNREAD",
    "INBOX"
  ],
  "attachmentCount": 1,
  "rawInternalDate": 1787983758000,
  "rawSizeEstimate": 409434,
  "attachmentDetails": [
    {
      "url": "https://storage.example.com/att/1",
      "size": 12345,
      "filename": "doc.pdf",
      "mimeType": "application/pdf"
    }
  ],
  "rawPayloadHeaders": {
    "Date": "Sat, 29 Aug 2026 02:09:18 -0400",
    "From": "Sender <sender@example.com>",
    "Subject": "Sample subject"
  },
  "rawPayloadMimeType": "multipart/mixed"
}
```

### New Email Sent

- `trigger_version_id`: `rowpw1i7ci9h` — for `subscribe-event` and `list-options`
- `trigger_id`: `row3otsjmkon` — for the connect popup's `filteredActions` (Step 1), an automation’s `trigger_id` and the prebuilt UI’s `open: { triggerId }`. Never in place of the version id above, nor the other way round
- Runs the workflow automatically whenever a new email appears in the Sent mailbox or in a specified label.
- fetch first: `searchFields.label`

| key | type | required | what it is | value comes from | only applies when |
| --- | --- | --- | --- | --- | --- |
| `query` | multiselect | no | Search By — Select search criteria (Subject, Recipient Email, or Label). The result will check all the filter conditions and trigger if any of the conditions match. — Only supported values are ["subject","recipientEmail", "label"] enter in the array. — Subj… | one of "subject", "recipientEmail", "label" |  |
| `searchFields` | object | no | Search Keywords — Enter search value for selected fields. | its child keys, the rows below | applies when Array.isArray(query) && (query.includes('recipientEmail') \|\| query.includes('subject') \|\| query.includes('label')) |
| `searchFields.recipientEmail` | string[] | yes | Recipient Email — Enter the Recipient Email Address the mail was sent to. | your user | applies when Array.isArray(query) && query.includes('recipientEmail') |
| `searchFields.subject` | string[] | yes | Subject — Enter the Subject. | your user | applies when Array.isArray(query) && query.includes('subject') |
| `searchFields.label` | multiselect | yes | Filter Mail by label — Select or Enter a label Id. Only emails carrying every selected label will trigger this flow. — You can find the label Id from the action "List Label" or "Find Label" | list-options | applies when Array.isArray(query) && query.includes('label') |
| `thread` | dropdown | yes | Email trigger behavior — Choose whether the flow should trigger for every email you send, or only when you start a brand new conversation. — Two values supported: 'include_replies' and 'first_email_only' — Include replies you send = "include_replies", Only … | one of "include_replies", "first_email_only" |  |

```js
// Subscribe once per user. Save the record described under Triggers: script_id, inputData, handler.
const subscriptionId = await subscribeEvent(
  uniqueIdentifier,
  'rowpw1i7ci9h',
  authId,
  {
    "query": [
      "<one of: subject | recipientEmail | label>"
    ],
    "searchFields": {
      "recipientEmail": [
        "<recipientEmail>"
      ],
      "subject": [
        "<subject>"
      ],
      "label": [
        "<id from list-options>"
      ]
    },
    "thread": "include_replies"
  },
  { code: handler }, // what to do when it fires — a handler from the templates above
  { user_id: uniqueIdentifier }
)
```

Before mapping its keys, fetch one real event for a connection (the developer’s own while building — `auth_id` from
`GET /embed/authentications` with their test user’s token). What comes back is exactly what `context.req.body` holds:

```bash
curl -X POST 'https://flow.sokt.io/func/scrijZpnr8zJ?action_id=row3otsjmkon&auth_id=<auth_id>&authType=Auth2.0' \
  -H 'Content-Type: application/json' \
  -d '{"context":{"inputData":{"query":["<one of: subject | recipientEmail | label>"],"searchFields":{"recipientEmail":["<recipientEmail>"],"subject":["<subject>"],"label":["<id from list-options>"]},"thread":"include_replies"}}}'
# → one real event of this trigger for this connection: exactly what context.req.body holds when it fires
```

A sample of the event as the connector’s author recorded it. Map from the sample call above, made for the real connection, not from this:

```json
{
  "date": "2026-09-01T00:00:00Z",
  "rawId": "msg-1",
  "rawSizeEstimate": 123,
  "rawPayloadHeaders": {
    "To": "to@example.com",
    "From": "from@example.com",
    "Subject": "Hi"
  }
}
```

## Managing what a user already has

All four are scoped to the `unique_identifier` in the token, so they answer for one end user.

| call | what it is for |
| --- | --- |
| `GET https://flow-api.viasocket.com/projects/projGXC7JJAV/integrations` | Every flow this user has. Match `service_id` to find an app they already enabled, and to recover a `script_id`. |
| `PUT https://flow-api.viasocket.com/embed/updatestatus/<script_id>?status=0` | Turn off an enabled app or a trigger subscription: `status=0` deletes it, `status=2` pauses it, `status=1` resumes or restores it. |
| `GET https://flow-api.viasocket.com/embed/authentications` | Every app this user has connected. |
| `DELETE https://flow-api.viasocket.com/embed/authentications/revoke/<auth_id>` | Disconnect an app. Disable its flows first. |

The flows list:

```json
{ "success": true, "data": { "flows": [
  {
    "title": "rowqm5xi2",
    "status": "active",
    "webhook": "https://flow.sokt.io/func/scriRx0PKDEG",
    "auth_id": "auth2c38gFVg_rowqm5xi2",
    "service_id": "rowqm5xi2",
    "id": "scriRx0PKDEG"
  }
] } }
```

`id` is the `script_id`. The list carries no `inputData` and no handler, so a subscription is not
identifiable from it alone: match `id` against the subscription records you saved (Triggers section).

The other two responses:

- `updatestatus` returns the **entire flow record** — its generated script, its whole
  `json_script`, its metadata. Ignore all of it and check `data.status`: `"0"` deleted,
  `"1"` active, `"2"` paused.
- `revoke` returns `{ "success": true, "message": "Successfully deleted authentication data",
  "data": [] }`. The empty array is normal; success is the signal.

## Prove it before you report

Reading code cannot show whether an id names a real app, whether a version id sits where the call takes the
`action_id`, or whether a viasocket URL was built by hand. A script can — no browser needed:

```bash
curl -fsSL https://flow.viasocket.com/viasocket-check.mjs -o viasocket-check.mjs
node viasocket-check.mjs src        # the folders holding the integration; no dependencies, Node 18+
```

It finds every viaSocket id and URL in the code and checks each against the live catalog; it reads no `.env`
file and prints no line of code. Fix every FAIL, keep it as a test (`npm test`, CI) so a later edit that swaps
an id fails there and not in front of a user, and paste its output in the report. With
`VIASOCKET_TEST_EMBED_TOKEN` set to a token signed for a test user it also proves the token.

Then make one real call — run the action; for an event, the sample call, then the event made to happen once —
and report what actually came back, not what the code should return. With a browser at hand, click Connect:
the popup shows Gmail's own name and its actions or consent screen; "Page not found", a blank page or
another app is a failure to report, not to work around.

Last, read your own diff for what no script sees, and answer each in the report: the Connect button carries
Gmail's icon and name; `closed` from the popup is treated as "nothing yet", not a result; every field key
was copied from the action's table, none typed from a label; the secret and every `script_id` are server-side only.

## When it goes wrong

| symptom | cause |
| --- | --- |
| 401 / invalid token | Signed with the wrong secret, or the payload is missing `org_id` / `project_id` / `unique_identifier`. |
| Empty option list | `existingFields` is missing something this field depends on, or the `auth_id` belongs to a different `unique_identifier`. |
| Empty option list on a nested field | `fieldKey` was the leaf instead of the full path, or `existingFields` was flattened to dotted keys instead of nested. Both match nothing, and neither errors. |
| A field is ignored, or the record is created empty | An option’s `value` was altered before being used as a key (`name` sent for `name@longtext`), or a key was typed from a label. Keys are each option’s `value`, verbatim. |
| Empty option list, key looks right | Its casing is from another action of this app (`spreadsheet_id` vs `spreadsheet_Id`), or the request said `blockKey` instead of `fieldKey`. Compare with this action’s table, character for character. |
| `options.map is not a function` | The wrapped shape (`data.data`) was not normalised. |
| Picker empty, response is 200 with `data.response.status` 400 | The connection cannot be read: revoked, or the `auth_id` belongs to another `unique_identifier`. The message is in `data.response.data.message`; reconnect the app. |
| App rejects the action | An id was hardcoded instead of fetched, or two mutually exclusive keys were both sent — see the "only applies when" column. |
| The connect popup says "Unknown app", or the listener gets `viasocket_connection_error` naming the id | The `serviceId` was not the bare `service_id` (`rowo0bqrhj5g`): Gmail's name, its slug, the id with a name joined on, or an id from another environment. Pass it exactly as this file prints it; `viasocket-check.mjs` catches this before a user does. |
| The popup shows "Page not found" | The popup was opened to a URL built by hand, not by `openViasocketConnection`. Load the connect script from the URL in Step 1 and let it open the popup; nothing else opens it. |
| A step or the product reads `undefined` from an action’s result | The response shape was taken from the sample, or guessed where there was none. Run the action once on the test connection and map from its actual response. |
| A handler reads `undefined` from the event | Its keys were guessed from the trigger’s name or another app’s sample. Run the sample call under Triggers for this connection and map from what it returns; drop `viasocket_help`. |
| The sample call answers `{ "success": true, "message": "No response" }` | Its `action_id` was the `trigger_version_id`. It takes the `trigger_id`. |
| Handler never runs | The subscription was created against a different `auth_id`, or `inputData` did not match the event (wrong label, wrong sheet). |
| Handler runs, the action inside it fails | The `script_id` baked into the handler belongs to another user, or that app was never enabled for this user; or the `inputData` keys do not match the other app’s document. Read the response `message`. |
| Someone asks for a webhook URL | Nobody needs one for “when X, do Y”: the handler does Y itself. A webhook is only for pushing raw events to a public endpoint the product chose to expose. |
| The same event fires twice | Subscribed twice for one user. Check the saved subscription record before subscribing; remove the duplicate with its `script_id`. |
| Connection appears lost | A different `unique_identifier` was used for the same end user. |
| Two script_ids for one app | `enableApp` ran without checking `findEnabledApp` first. |
