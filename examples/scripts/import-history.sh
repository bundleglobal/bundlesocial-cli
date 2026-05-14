#!/usr/bin/env bash
# Import a connected account's recent posts (post history) with analytics, then
# poll the import status until it stops PENDING/FETCHING and list the imported posts.
#
# Usage:
#   BUNDLESOCIAL_API_KEY=sk_live_... bash examples/scripts/import-history.sh instagram 25
#
# Args:
#   $1  platform (instagram, tiktok, youtube, facebook, threads, linkedin, pinterest, reddit, mastodon, bluesky)  (default: instagram)
#   $2  how many recent posts to import                                                                           (default: 10)
set -euo pipefail

CLI=${BUNDLESOCIAL_CLI:-"npx --yes bundlesocial-cli"}
PLATFORM=${1:-instagram}
COUNT=${2:-10}

echo "→ starting post-history import for $PLATFORM ($COUNT posts)…" >&2
IMPORT_JSON=$($CLI posts:import -p "$PLATFORM" --count "$COUNT" --with-analytics)
echo "$IMPORT_JSON"
IMPORT_ID=$(printf '%s' "$IMPORT_JSON" | jq -r '.id')

echo "→ polling import $IMPORT_ID…" >&2
for _ in $(seq 1 30); do
  STATUS=$($CLI posts:import:get "$IMPORT_ID" | jq -r '.status // "UNKNOWN"')
  echo "   status: $STATUS" >&2
  case "$STATUS" in
    PENDING|FETCHING|RETRYING) sleep 5 ;;
    *) break ;;
  esac
done

echo "→ imported posts:" >&2
$CLI posts:import:posts -p "$PLATFORM" --limit "$COUNT"
