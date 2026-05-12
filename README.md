# bundlesocial-cli

Command-line interface for the [bundle.social](https://bundle.social) social-media API — post to 14+ platforms (X, Instagram, TikTok, LinkedIn, YouTube, Facebook, Pinterest, Reddit, Threads, Bluesky, Mastodon, Discord, Slack, Google Business Profile) from your shell, CI, cron or an AI agent.

It is a thin, scriptable wrapper over the official [`bundlesocial`](https://www.npmjs.com/package/bundlesocial) Node SDK:

- **JSON on stdout by default** — one object per command, never interleaved with logs. Status messages go to stderr.
- `--pretty` switches to a human-readable table/tree.
- Errors are emitted as `{ "error": { "code", "message", "details"? } }` on stdout with a non-zero exit code.
- Stateless: configured entirely with environment variables (no config file, no interactive prompts) — friendly to agents and CI.

> Building an agent runtime (OpenClaw, Codex, …)? See [`SKILL.md`](./SKILL.md) — drop it into your skills folder and the agent can use this CLI directly.

## Install

```bash
# one-off
npx bundlesocial-cli --help

# global
npm install -g bundlesocial-cli
bundle-social --help
```

Requires Node.js 20+.

## Authentication

Create an API key in the dashboard: <https://bundle.social/dashboard/organization/api-keys>

```bash
export BUNDLESOCIAL_API_KEY="sk_live_..."
# optional — point at staging / self-hosted:
export BUNDLESOCIAL_API_URL="https://api.bundle.social"
# optional — if your organization has more than one team:
export BUNDLESOCIAL_TEAM_ID="team_..."
```

Every env var has a flag equivalent: `--api-key`, `--api-url`, `--team-id` (these work before *or* after the command name). If the org has exactly one team, `--team-id` / `BUNDLESOCIAL_TEAM_ID` is optional and resolved automatically.

Sanity-check your setup any time:

```bash
bundle-social doctor
```

## Commands

Run `bundle-social --help` or `bundle-social <command> --help` for the authoritative reference.

### `integrations:list`

List connected social-media integrations (accounts). Scoped to the team from `--team-id` / `BUNDLESOCIAL_TEAM_ID`; without one it lists every team in the organization.

```bash
bundle-social integrations:list
bundle-social integrations:list --pretty
```

### `posts:create`

Publish a post immediately to one or more connected integrations.

```bash
# text post to X and Bluesky
bundle-social posts:create -c "Shipped a new thing today 🚀" -i x -i bluesky

# image post to Instagram + X, media uploaded automatically (URL or local file)
bundle-social posts:create -c "New banner" -i instagram -i x -m ./banner.png -m https://cdn.example.com/extra.jpg

# TikTok video with the required privacy level
bundle-social posts:create -c "Behind the scenes" -i tiktok -m ./demo.mp4 \
  --platform-settings '{"TIKTOK":{"privacy":"PUBLIC_TO_EVERYONE"}}'

# different options per platform
bundle-social posts:create -c "Launch day" -i youtube -i tiktok -m ./launch.mp4 \
  --platform-settings '{"YOUTUBE":{"type":"SHORT","privacyStatus":"PUBLIC","madeForKids":false},"TIKTOK":{"privacy":"PUBLIC_TO_EVERYONE"}}'

# save as a draft instead of publishing
bundle-social posts:create -c "WIP" -i linkedin --draft

# full control: pass the post `data` object verbatim (advanced)
bundle-social posts:create --data '{"REDDIT":{"sr":"r/test","text":"hello","uploadIds":[]}}'
```

Flags:

| Flag | Description |
|---|---|
| `-c, --content <text>` | Post text, applied to every targeted platform |
| `-i, --integration-id <id...>` | Target: a connected integration id (from `integrations:list`) **or** a platform name/alias. Repeatable. |
| `-p, --platform <platform...>` | Alias for `--integration-id` that only accepts platform names. Repeatable. |
| `-m, --media <ref...>` | Media to attach: a public `https://` URL or a local file path. Uploaded automatically. Repeatable. |
| `--platform-settings <json>` | Per-platform options as JSON — either keyed by platform (`{"TIKTOK":{...}}`) or a flat object applied to all targeted platforms |
| `--data <json>` | Advanced: the full post `data` object as JSON; overrides `--content` / `--media` / `--platform-settings` |
| `--data-file <path>` | Advanced: read the full post `data` object from a JSON file (alternative to `--data` — handy for large multi-platform campaigns) |
| `--title <text>` | Post title (defaults to the first line of `--content`) |
| `--draft` | Save as a `DRAFT` instead of publishing now |

Platform name aliases: `x`/`twitter`, `tiktok`, `youtube`/`yt`, `instagram`/`ig`, `facebook`/`fb`, `threads`, `linkedin`/`li`, `pinterest`/`pin`, `reddit`, `mastodon`, `discord`, `slack`, `bluesky`/`bsky`, `gbp`/`google-business`.

### `posts:schedule`

Same as `posts:create`, plus a required `--date`.

```bash
bundle-social posts:schedule -c "Tomorrow 9am UTC" -i linkedin -i x -d 2026-06-01T09:00:00Z
bundle-social posts:schedule -c "Reel drop" -i instagram -m ./reel.mp4 \
  --platform-settings '{"INSTAGRAM":{"type":"REEL","shareToFeed":true}}' -d 2026-06-02T15:30:00Z
```

### `posts:list`

List recent posts for the team, newest first.

```bash
bundle-social posts:list --limit 10
bundle-social posts:list --status SCHEDULED --pretty
bundle-social posts:list --platform x --platform linkedin --from 2026-05-01 --to 2026-06-01
bundle-social posts:list -q "launch" --order ASC --order-by postDate
```

Flags: `--limit <n>` (default 20), `--offset <n>`, `--status <DRAFT|SCHEDULED|POSTED|ERROR|DELETED|PROCESSING|REVIEW|RETRYING>`, `--platform <platform...>`, `--from <iso>`, `--to <iso>`, `-q, --query <text>`, `--order <ASC|DESC>`, `--order-by <createdAt|updatedAt|postDate|postedDate|deletedAt>`.

### `posts:update <id>`

Update an existing post — only the fields you pass change. If you change content/media without `-i`/`-p`, the post's current platforms are reused.

```bash
bundle-social posts:update post_abc123 --title "Revised headline" --status DRAFT
bundle-social posts:update post_abc123 -c "Updated copy" --date 2026-06-05T12:00:00Z
bundle-social posts:update post_abc123 -i x -i bluesky -c "Now also on Bluesky"
```

Flags: the `posts:create` compose flags (`-c`, `-i/-p`, `-m`, `--platform-settings`, `--data`, `--data-file`, `--title`) plus `-d, --date <iso>` and `--status <DRAFT|SCHEDULED>`.

### `posts:get <id>` / `posts:delete <id>` / `posts:retry <id>`

```bash
bundle-social posts:get post_abc123
bundle-social posts:delete post_abc123
bundle-social posts:retry post_abc123     # re-attempt a post that ended in ERROR
```

### `comments:create`

Post one or more comments on an existing post. Repeat `-c` to create a chain (the first replies to the post, each subsequent one replies to the previous comment) — useful for X-style threads-via-comments. Comments are supported on TIKTOK, YOUTUBE, INSTAGRAM, FACEBOOK, THREADS, LINKEDIN, REDDIT, MASTODON, DISCORD, SLACK, BLUESKY.

```bash
bundle-social comments:create --post-id post_abc123 -c "Great thread 👇"
# a 3-comment chain on LinkedIn, 1 minute apart, starting tomorrow 9am UTC
bundle-social comments:create --post-id post_abc123 -i linkedin --date 2026-06-01T09:00:00Z --delay 1 \
  -c "First reply" -c "Second reply" -c "Third reply"
```

Flags: `--post-id <id>` (required), `-c, --content <text...>` (repeatable), `-i, --integration-id <id...>` / `-p, --platform <platform...>` (defaults to the post's platforms), `--date <iso>`, `--delay <minutes>`, `--draft`.

### `comments:list` / `comments:get <id>` / `comments:delete <id>`

```bash
bundle-social comments:list --post-id post_abc123 --status POSTED
bundle-social comments:get cmt_abc123
bundle-social comments:delete cmt_abc123
```

### `integrations:tools` / `integrations:trigger <method>`

Discover values the API needs (subreddit flair ids, YouTube category ids, LinkedIn mention URNs, Instagram locations, Google Business categories, TikTok trending music). `integrations:tools` lists the available helper methods and their params; `integrations:trigger` calls one.

```bash
bundle-social integrations:tools
bundle-social integrations:trigger reddit:flairs --data '{"subreddit":"r/test"}'
bundle-social integrations:trigger youtube:categories --data '{"regionCode":"US"}'
bundle-social integrations:trigger linkedin:mentions --data '{"q":"Anthropic","scope":"organizations"}'
```

### `media:upload <path-or-url>`

Upload a media file (image, video or document) from a local path or a public `https://` URL. Returns the upload object — its `id` can be passed to `posts:create` / `posts:schedule` via `--data`.

```bash
bundle-social media:upload ./hero.png
bundle-social media:upload https://cdn.example.com/promo.mp4
ID=$(bundle-social media:upload ./hero.png | jq -r .id)
bundle-social posts:create --data "{\"TWITTER\":{\"text\":\"hi\",\"uploadIds\":[\"$ID\"]}}"
```

### `analytics:post <id>`

Engagement metrics for a single post.

```bash
bundle-social analytics:post post_abc123
bundle-social analytics:post post_abc123 --platform instagram
```

### `analytics:summary`

Organization-level summary: posts/comments/uploads usage for the org plus the latest analytics snapshot for each connected integration on the team.

```bash
bundle-social analytics:summary
bundle-social analytics:summary --from 2026-05-01 --to 2026-06-01 --pretty
```

(Analytics are not available for X/Twitter, Discord and Slack — those integrations are listed with `analytics: null`.)

### `doctor`

Diagnose the CLI setup: API key, connectivity, organization API access, team selection, connected integrations, posts quota. Always prints a diagnostic JSON; exits non-zero if any check fails.

```bash
bundle-social doctor
bundle-social doctor --pretty
```

## Output contract (for scripts & agents)

- **stdout** carries exactly one JSON value per command (or a table when `--pretty`). Pipe it to `jq` etc.
- **stderr** carries human-readable progress (`Uploading media file: …`) and, with `--pretty`, a styled error line. Never parse stderr.
- On error: exit code `1` and `{ "error": { "code": "…", "message": "…", "details"?: … } }` on stdout.

Common error codes: `MISSING_API_KEY`, `TEAM_ID_REQUIRED`, `NO_TARGET`, `NO_CONTENT`, `NOTHING_TO_UPDATE`, `UNKNOWN_PLATFORM`, `INTEGRATION_NOT_FOUND`, `COMMENTS_NOT_SUPPORTED`, `UNKNOWN_INTEGRATION_TOOL`, `MISSING_PARAMS`, `INVALID_JSON`, `INVALID_DATE`, `MEDIA_NOT_FOUND`, `FILE_NOT_FOUND`, `HTTP_<status>` (an error returned by the API — `details` includes the response body), `UNEXPECTED_ERROR`. Set `BUNDLESOCIAL_DEBUG=1` to include stack traces in `details`.

## References & examples

- **[`PROVIDER_SETTINGS.md`](./PROVIDER_SETTINGS.md)** — the exhaustive per-platform field reference for `--platform-settings` / `--data` (every accepted `data.<PLATFORM>` field, with types, required fields and minimal JSON examples).
- **[`SKILL.md`](./SKILL.md)** — the OpenClaw / agent skill: command reference, per-platform notes, worked workflows, failure modes. Install into an agent runtime with `npx skills add bundleglobal/bundlesocial-cli`.
- **[`examples/`](./examples/README.md)** — ready-to-run `data` JSON templates (for `--data-file`) and shell recipes (`post-and-first-comment.sh`, `schedule-campaign.sh`, `reddit-prepared-post.sh`).

## Development

```bash
npm install
npm run build       # tsup → dist/index.js (ESM, with shebang)
npm test            # vitest — smoke tests for every command against a mocked SDK
npm run typecheck
```

Releases are automated with [semantic-release](https://semantic-release.gitbook.io/) on merge to `main` (conventional commits).

Distribution: published to npm as [`bundlesocial-cli`](https://www.npmjs.com/package/bundlesocial-cli); the [`SKILL.md`](./SKILL.md) skill is registered on ClawHub (`npx skills add bundleglobal/bundlesocial-cli`) and listed in agent-tooling awesome-lists.

## License

MIT — see [LICENSE](./LICENSE).
