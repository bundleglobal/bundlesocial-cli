#!/usr/bin/env bash
# Publish a post, then add a first comment to it (on the post's comment-capable platforms).
#
# Usage:
#   BUNDLESOCIAL_API_KEY=sk_live_... bash examples/scripts/post-and-first-comment.sh "linkedin reddit" "Hello world" "Pinned: read more → https://bundle.social"
#
# Args:
#   $1  space-separated platforms or integration ids   (default: "linkedin")
#   $2  post text                                      (default: "Hello from bundlesocial-cli")
#   $3  first-comment text                             (default: "Pinned 👇")
#
# Note: comments are supported on TIKTOK, YOUTUBE, INSTAGRAM, FACEBOOK, THREADS,
# LINKEDIN, REDDIT, MASTODON, DISCORD, SLACK, BLUESKY — not X/Twitter, Pinterest
# or Google Business. comments:create with no -i defaults to the post's platforms
# (filtered to the comment-capable ones), so a post to "x linkedin" comments on "linkedin".
set -euo pipefail

CLI=${BUNDLESOCIAL_CLI:-"npx --yes bundlesocial-cli"}
PLATFORMS=${1:-linkedin}
POST_TEXT=${2:-"Hello from bundlesocial-cli"}
COMMENT_TEXT=${3:-"Pinned 👇"}

ITARGS=()
for p in $PLATFORMS; do ITARGS+=(-i "$p"); done

echo "→ creating post…" >&2
POST_JSON=$($CLI posts:create "${ITARGS[@]}" -c "$POST_TEXT")
echo "$POST_JSON"
POST_ID=$(printf '%s' "$POST_JSON" | jq -r '.id')

echo "→ commenting on $POST_ID…" >&2
$CLI comments:create --post-id "$POST_ID" -c "$COMMENT_TEXT"
