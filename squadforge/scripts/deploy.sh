#!/usr/bin/env bash
# Deploy SquadForge to Embarko — only what is committed AND pushed, so the live app always matches GitHub.
# Token: $EMBARKO_TOKEN, or ~/.embarko/credentials. Run from anywhere: npm run deploy
set -euo pipefail
cd "$(dirname "$0")/.."
APP_NAME=squadforge
APP_ID=$(node -p "require('./embarko.json').appId")

if [ -n "$(git status --porcelain -- .)" ]; then echo "✋ Uncommitted changes in squadforge/ — commit first."; exit 1; fi
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git fetch -q origin "$BRANCH" || true
if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo none)" ]; then echo "✋ $BRANCH is not pushed to GitHub — push first."; exit 1; fi
npm test --silent >/dev/null 2>&1 || { echo "✋ Tests are failing — run npm test."; exit 1; }

TOKEN="${EMBARKO_TOKEN:-}"
if [ -z "$TOKEN" ] && [ -f ~/.embarko/credentials ]; then
  TOKEN=$(grep -o '"[^"]*token[^"]*"[^"]*"[^"]*"' ~/.embarko/credentials 2>/dev/null | head -1 | sed 's/.*: *"\(.*\)"/\1/' || true)
  [ -z "$TOKEN" ] && TOKEN=$(tr -d '\n' < ~/.embarko/credentials | sed 's/.*=\s*//' || true)
fi
[ -z "$TOKEN" ] && { echo "✋ No Embarko token (set EMBARKO_TOKEN)."; exit 1; }

TAR=$(mktemp -t squadforge-XXXX.tar.gz)
PREFIX=$(git rev-parse --show-prefix); TREE="HEAD${PREFIX:+:${PREFIX%/}}"
git -C "$(git rev-parse --show-toplevel)" archive --format=tar.gz -o "$TAR" "$TREE"   # exactly the committed files, nothing local
[ "$(tar tzf "$TAR" | grep -c "^package.json$")" = "1" ] || { echo "✋ Archive looks wrong (no package.json at the top)"; exit 1; }
echo "📦 $(git rev-parse --short HEAD) · $(du -h "$TAR" | cut -f1)"
code=$(curl -s --max-time 600 -o /dev/null -w "%{http_code}" -X POST https://ship.embarko.ai/apps \
  -H "Authorization: Bearer $TOKEN" -H "X-App-Name: $APP_NAME" -H "X-App-Id: $APP_ID" -H "X-Agent-Name: claude-code" -F "source=@$TAR")
rm -f "$TAR"
[ "$code" = "202" ] || [ "$code" = "200" ] || { echo "✋ Upload failed (HTTP $code)"; exit 1; }
for i in $(seq 1 60); do
  st=$(curl -s "https://ship.embarko.ai/apps/$APP_NAME/status" -H "Authorization: Bearer $TOKEN" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  case "$st" in live) echo "✅ live — https://$APP_NAME.embarko.app"; exit 0;; fail*|error) echo "✋ deploy $st"; exit 1;; esac
  sleep 10
done
echo "⏳ still building — check the Embarko dashboard"; exit 1
