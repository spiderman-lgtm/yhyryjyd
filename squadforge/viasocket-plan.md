# SquadForge × viaSocket — plan

Status: **proposed, waiting for yes**

## What the lead will see

- A new **🔌 Integrations** page with a Connect button per app (Slack, Gmail, Google Sheets).
- After Slack is connected, SquadForge reads the team channel and replies in threads through that connection.
  The Slack bot token is no longer needed (it stays as a fallback).
- Monday report also goes by email to the manager, and a row per member is added to a Google Sheet.
- Menu: the Process/Data switch goes away. **🌊 Live Flow** becomes a normal menu item next to **📊 Dashboard**.

## Who is the viaSocket user

One viaSocket end user per SquadForge workspace: id `squadforge-lead`, only the admin login can connect or
disconnect. The viewer login never sees Integrations. Every `script_id` and `auth_id` stays in the server's SQLite,
never in the browser.

## Actions

| app | action (key, version) | inputData key | who supplies it | when |
|---|---|---|---|---|
| slack | `Get_Messages_from_Slack` `V11` | `channel_id` | lead, from a list of their channels | once, right after Connect |
| slack | `Get_Messages_from_Slack` `V11` | time range | SquadForge (since last read, e.g. "last 2 hours") | per run (every 10 min) |
| slack | `Get_Messages_from_Slack` `V11` | include thread replies | SquadForge (`Yes`) | constant |
| slack | `Get_Thread_Replies` `V10` | `channel`, `parent_message_ts` | SquadForge (saved channel; the request's thread) | per run |
| slack | `Send_Message_as_Thread` `V11` | `channel`, `thread_ts`, message | SquadForge (Inspector feedback, unblock note) | per run |
| slack | `Send_Message` `V107` | channel, message, tagged users | SquadForge (Commander message, reminders; text from the lead or the agents) | per run |
| slack | `Send_Direct_Message` `V3` | `userId` | lead, from a list of workspace users ("this is me") | once, right after Connect |
| slack | `Send_Direct_Message` `V3` | message | SquadForge (7 PM alert, morning reminder, Monday report) | per run |
| gmail | `Send_Email` `V55` | to | lead types the manager's email | once, on the Integrations page |
| gmail | `Send_Email` `V55` | subject, body | SquadForge (Monday report) | per run |
| google-sheets | `Add_Multiple_Rows` `V15` | spreadsheet, sheet | lead, from a list of their spreadsheets and sheets | once, right after Connect |
| google-sheets | `Add_Multiple_Rows` `V15` | rows | SquadForge (one row per member: week, actions, triggers, apps, requests, error rate, missed updates) | per run (Monday) |

Exact inputData keys for message/subject/body/rows are read from `listActions` after the yes and pinned here.

**Who picks the action:** SquadForge's code, every time, from the event (new sync → read; Inspector done → thread
reply; 7 PM → DM; Monday → DM + email + sheet). The lead only switches each output on or off on the Integrations page.

**Events:** none subscribed. Slack is read by Scout every 10 minutes with `Get_Messages_from_Slack`, as today.

## Testing

Each action runs once on the lead's real connection before the screen that uses it is built: messages go to a
test channel or a DM to the lead, the email to the lead's own address, rows to a new sheet named "viaSocket test".

## Next (not in this plan)

- Jira / ClickUp / Trello: a task for each client request, closed when it completes.
- Real-time Slack (subscribe `New_Message_in_Channels`) instead of 10-minute reads.

## M91 (added, confirmed by the lead)

| app | action (key, version) | value | who supplies it | when |
|---|---|---|---|---|
| m91 | `Send_Direct_Alert` `V4` | To (phone) | member's phone from Settings | once per member |
| m91 | `Send_Direct_Alert` `V4` | Title, Description | the lead's message (first line / full text) | per run |
| m91 | `Send_Direct_Alert` `V4` | Severity | SquadForge: High when "Important" is ticked (Low for the test) | per run |
| m91 | `Send_Direct_Alert` `V4` | Custom Alert ID | SquadForge (`sf-<broadcast>-<member>`) | per run |
| m91 | `Send_Direct_Alert` `V4` | Response buttons | constant "On it" (SHARED), "Seen" (PERSONAL) | constant |
| m91 | `Invite_Direct_Recipient` `V3` | To, From | member's phone / "SquadForge" | when the lead clicks Invite |
| m91 | `Get_Direct_Alert_by_ID` `V3` | Alert ID, Phone | SquadForge | to read responses |

Who picks the action: SquadForge's code (Important ticked → direct alert per tagged member).
Field keys are read at run time from the public catalog's form schema and matched by label (viasocket.com docs are not reachable from the build session); the first run logs the keys found.
Status: built, UNTESTED until the lead connects M91 and sends the test alert.
