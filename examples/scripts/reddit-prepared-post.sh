#!/usr/bin/env bash
# Post to a subreddit "properly": fetch its requirements and flairs first, then
# create the post with the right flair.
#
# Usage:
#   BUNDLESOCIAL_API_KEY=sk_live_... bash examples/scripts/reddit-prepared-post.sh r/test "My title" "My body text"
#
# Args:
#   $1  subreddit (e.g. r/test)   (default: r/test)
#   $2  post title                (default: "Hello from bundlesocial-cli")
#   $3  post body                 (default: "Posted via the bundle.social CLI.")
set -euo pipefail

CLI=${BUNDLESOCIAL_CLI:-"npx --yes bundlesocial-cli"}
SR=${1:-r/test}
TITLE=${2:-"Hello from bundlesocial-cli"}
BODY=${3:-"Posted via the bundle.social CLI."}

echo "→ requirements for $SR:" >&2
REQ=$($CLI integrations:trigger reddit:requirements --data "{\"subreddit\":\"$SR\"}")
echo "$REQ" | jq .

echo "→ flairs for $SR:" >&2
FLAIRS=$($CLI integrations:trigger reddit:flairs --data "{\"subreddit\":\"$SR\"}")
echo "$FLAIRS" | jq .

# Pick the first flair id if one exists (set FLAIR_ID yourself to choose a specific one).
FLAIR_ID=${FLAIR_ID:-$(printf '%s' "$FLAIRS" | jq -r 'if type=="array" then (.[0].id // .[0].flairId // empty) else (.flairs[0].id // empty) end' 2>/dev/null || true)}

DATA="{\"REDDIT\":{\"sr\":\"$SR\",\"text\":$(jq -Rn --arg t "$TITLE" '$t'),\"description\":$(jq -Rn --arg b "$BODY" '$b'),\"uploadIds\":[]"
if [[ -n "${FLAIR_ID:-}" && "$FLAIR_ID" != "null" ]]; then
  DATA+=",\"flairId\":\"$FLAIR_ID\""
  echo "→ using flair id: $FLAIR_ID" >&2
fi
DATA+="}}"

echo "→ creating post…" >&2
$CLI posts:create --data "$DATA"
