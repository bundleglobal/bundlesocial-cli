#!/usr/bin/env bash
# Schedule a batch of posts from --data-file JSON files at given ISO-8601 dates.
#
# Edit the CAMPAIGN array below (one "ISO_DATE|path/to/data.json" entry per line),
# then run:
#   BUNDLESOCIAL_API_KEY=sk_live_... bash examples/scripts/schedule-campaign.sh
#
# Each line's JSON is a `data` object keyed by platform (see examples/data/*.json);
# the targeted platforms are inferred from its keys.
set -euo pipefail

CLI=${BUNDLESOCIAL_CLI:-"npx --yes bundlesocial-cli"}

CAMPAIGN=(
  "2026-06-01T09:00:00Z|examples/data/multi-platform-launch.json"
  "2026-06-02T15:30:00Z|examples/data/instagram-carousel.json"
  "2026-06-03T12:00:00Z|examples/data/youtube-short.json"
)

for entry in "${CAMPAIGN[@]}"; do
  DATE=${entry%%|*}
  FILE=${entry#*|}
  if [[ ! -f "$FILE" ]]; then
    echo "✖ missing data file: $FILE" >&2
    exit 1
  fi
  echo "→ scheduling $FILE for $DATE…" >&2
  $CLI posts:schedule --data-file "$FILE" -d "$DATE"
done

echo "→ done. recent scheduled posts:" >&2
$CLI posts:list --status SCHEDULED --limit 20 --pretty
