---
name: viasocket-integrations
description: >-
  Connect third-party apps (Gmail, Slack, GitHub, HubSpot, Stripe, Google Sheets and 2,300+ more)
  to this product through viaSocket.
---

# viaSocket integrations

org_id: 4160
project_id: projfJ7dZJJM
VIASOCKET_EMBED_SECRET: in .env only, never committed

Token (HS256, no exp):
{ "org_id": "4160", "project_id": "projfJ7dZJJM", "unique_identifier": "<uid>" }

Connect popup: openViasocketConnection(embedToken, service_id) → auth_id via message event
Enable (actions only): POST https://flow-api.viasocket.com/embed/enable/<service_id>/<auth_id>
Run action: POST https://flow.sokt.io/func/<script_id> { action_version_id, inputData }
List options: POST https://flow-api.viasocket.com/embed/list-options/<action_version_id>
