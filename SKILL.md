---
name: bundlesocial-cli
version: 1.0.0
description: Post and schedule content to 15+ social platforms (X, Instagram, TikTok, LinkedIn, YouTube, Facebook, Pinterest, Reddit, Threads, Bluesky, Mastodon, Discord, Slack, Google Business Profile, Snapchat) through the bundle.social API. JSON in, JSON out.
homepage: https://bundle.social
repository: https://github.com/bundleglobal/bundlesocial-cli
license: MIT
requires_env:
  - BUNDLESOCIAL_API_KEY
optional_env:
  - BUNDLESOCIAL_API_URL
  - BUNDLESOCIAL_TEAM_ID
commands:
  - bundle-social
install: npx skills add bundleglobal/bundlesocial-cli
---

# bundle.social CLI skill

**Use this skill to publish, schedule, list, inspect and pull analytics for social-media posts across 15+ platforms via [bundle.social](https://bundle.social).** It wraps the `bundlesocial-cli` npm package, which speaks JSON on stdout — parse stdout, ignore stderr (stderr is human progress text only).

## Setup

1. The user needs a bundle.social account and an API key from <https://bundle.social/dashboard/organization/api-keys>.
2. Set `BUNDLESOCIAL_API_KEY` in the environment.
3. If the user's organization has more than one team, also set `BUNDLESOCIAL_TEAM_ID` (find ids via `integrations:list` or `doctor`). With a single team this is automatic.
4. Run the CLI with `npx bundlesocial-cli <command>` (or `bundle-social <command>` if installed globally).
5. First thing to run when unsure: `npx bundlesocial-cli doctor` — it reports key validity, connectivity, the resolved team, connected integrations and the posting quota as JSON.

## Output & error contract

- Success → exit 0, one JSON value on stdout.
- Failure → exit non-zero, `{"error":{"code":"…","message":"…","details":…}}` on stdout. Read `code` to decide recovery (see "Failure modes" below).
- `--pretty` makes output human-readable (a table/tree) — **do not** use `--pretty` when you need to parse the output.
- Status lines like `Uploading media file: …` go to **stderr** — never parse them.

## Command reference

All commands accept the global flags `--api-key <key>`, `--api-url <url>`, `--team-id <id>`, `--pretty` (before or after the command name). Run `bundle-social <command> --help` for the canonical option list.

| Command | What it does |
|---|---|
| `integrations:list` | List connected social accounts (`id`, `type`, `username`, `channels`). Use it to discover integration ids and what platforms are available. |
| `integrations:tools` | List the read-only platform helper methods callable via `integrations:trigger`. |
| `integrations:trigger <method> [--data '<json>']` | Call a helper: `reddit:flairs` (`{"subreddit":"r/..."}`), `reddit:requirements`, `youtube:categories` (`{"regionCode":"US"}`), `youtube:playlists`, `youtube:regions`, `linkedin:mentions` (`{"q":"...","scope":"organizations"}`), `instagram:locations` (`{"q":"..."}`), `instagram:audio` (`{"audioType":"music","searchQuery":"..."}`), `instagram:business-discovery` (`{"username":"..."}`), `gbp:location`, `gbp:categories` (`{"languageCode":"en","regionCode":"US"}`), `tiktok:trending-music`. Use these to get values the API needs (flair ids, category ids, mention URNs, …). |
| `integrations:connect -p <platform> --redirect-url <url>` | Start an OAuth connect flow; returns a `url` to redirect the user to. `--server-url` (Mastodon/Bluesky), `--instagram-connection-method`, `--with-business-scope` (Facebook/Instagram/YouTube — also unlocks YouTube monetization analytics), `--disable-auto-login`, `--tiktok-force-login`, `--force-browser-oauth`, `--data`/`--data-file`. |
| `integrations:disconnect -p <platform>` | Disconnect that platform's account from the team. |
| `integrations:set-channel -p <platform> --channel-id <id>` / `integrations:unset-channel -p <platform>` | Pick / clear the channel/page to post to (FACEBOOK, INSTAGRAM, LINKEDIN, YOUTUBE, GBP). |
| `integrations:refresh-channels -p <platform>` | Refresh the cached channels (DISCORD, SLACK, REDDIT, PINTEREST, …). |
| `integrations:portal-link -p <platform...> [--redirect-url <url>] [--expires-in <min>] [--data '<json>']` | Create a hosted portal link for the user to connect/manage accounts; returns a `url`. |
| `integrations:check -p <platform>` / `integrations:refresh-profile -p <platform>` | Run a connection check / refresh cached profile info. |
| `integrations:by-type <type>` | Fetch the connected account for a platform on the team. |
| `integrations:copy --from-team-id <id> --to-team-id <id> -p <platform...> [--reset-channel]` | Copy connected accounts between teams. |
| `integrations:to-delete [--page <n>] [--page-size <n>]` | List accounts scheduled for deletion. |
| `posts:create` | Publish a post **now** (or `--draft`). |
| `posts:schedule` | Schedule a post for a future ISO-8601 `--date`. |
| `posts:update <id>` | Update a post — only the fields you pass change (title, date, status, content, media, platform settings, platforms). If you change content without `-i`/`-p`, the post's current platforms are reused. |
| `posts:list` | List recent posts, newest first, with filters. |
| `posts:get <id>` | Fetch one post by id. |
| `posts:delete <id>` | Delete a post by id. |
| `posts:retry <id>` | Re-attempt a post that ended in `ERROR`. |
| `posts:get-by-reference-key <key>` | Fetch a post by the `--reference-key` you set on it, instead of its bundle.social id. |
| `posts:reconnect-candidates -p <platform> [--limit <n>] [--offset <n>]` | List draft/scheduled posts that lost their social account after a disconnect. |
| `posts:reconnect -p <platform> [--post-id <id...>]` | Reattach those posts to the newly connected account of that platform (all candidates by default). |
| `posts:import -p <platform> --count <n> [--with-analytics] [--import-carousels] [--surface <s>] [--media-type <t>]` | Start an async import of an account's recent posts (post history). Platforms: FACEBOOK, INSTAGRAM, THREADS, TIKTOK, YOUTUBE, LINKEDIN, PINTEREST, REDDIT, MASTODON, BLUESKY. |
| `posts:imports [-p <platform>]` / `posts:import:get <importId>` | List post-history import statuses / fetch one. |
| `posts:import:posts -p <platform> [--limit <n>] [--offset <n>]` | List imported posts (with analytics) for an account. |
| `posts:import:delete-posts --id <id...>` / `posts:import:retry <importId>` | Bulk-delete imported posts / retry a failed import. |
| `posts:csv --file <path>` | Upload a CSV for an async bulk post import. |
| `posts:csv:list [--limit <n>] [--offset <n>]` / `posts:csv:get <importId>` / `posts:csv:status <importId>` / `posts:csv:rows <importId> [--status SUCCESS\|FAILED]` | Track a CSV bulk import. |
| `comments:create --post-id <id> -c "..." [-c "..." ...]` | Comment on a post; repeat `-c` for a chain of replies (X-style thread via comments). Comment-capable platforms: TIKTOK, YOUTUBE, INSTAGRAM, FACEBOOK, THREADS, LINKEDIN, REDDIT, MASTODON, DISCORD, SLACK, BLUESKY. Optional `--date`, `--delay <minutes>`, `--draft`, `-i`/`-p` (defaults to the post's platforms). Use `--imported-post-id <id>` instead of `--post-id` to comment on a post from `posts:import` (then `-p` is required), and `--fetched-parent-comment-id <id>` to reply to a comment from `comments:import`. |
| `comments:list [--post-id <id>]` / `comments:get <id>` / `comments:update <id>` / `comments:delete <id>` | List/fetch/update/delete comments. `comments:update` mirrors `posts:update` — only the fields you pass change. |
| `comments:import --post-id <id> -p <platform>` | Start an async import of a post's comments. Platforms: FACEBOOK, INSTAGRAM, LINKEDIN, YOUTUBE, TIKTOK, REDDIT, THREADS, MASTODON, BLUESKY. |
| `comments:imports [--post-id <id>] [--status <s>]` / `comments:import:get <importId>` | List comment-import jobs / fetch one. |
| `comments:import:comments --post-id <id> [-p <platform>] [--social-account-id <id>]` | List the comments fetched for a post via `comments:import`. |
| `comments:retry <id>` | Re-attempt a comment that ended in `ERROR`. |
| `comments:import:action <commentId> --action <DELETE\|HIDE\|UNHIDE\|LIKE\|UNLIKE\|APPROVE\|REJECT> [--reason <text>] [--ban-author]` | Moderate a comment pulled in by `comments:import`. Support varies by platform; `DELETE` and `HIDE` are the widely available ones. |
| `media:upload <path-or-url>` | Upload an image/video/document from a local path or public URL → returns the upload object (use its `id`). |
| `media:upload-large <path>` | Upload a large local file (>90 MB) via the chunked init → PUT → finalize flow. |
| `media:list [--type <t>] [--status USED\|UNUSED]` / `media:get <id>` / `media:delete <id>` / `media:delete-many --id <id...>` | List/fetch/delete uploaded media. |
| `analytics:post [id] [--imported-post-id <id>] [--raw]` | Engagement metrics for one post — a post you created, or one pulled in by `posts:import` via `--imported-post-id` (`--raw` = unprocessed provider payload). |
| `analytics:account -p <platform> [--raw]` | Analytics snapshots for a connected social account (`--raw` = unprocessed provider payload). |
| `analytics:bulk -p <platform> --post-id <id...>` | Analytics for up to 60 posts in one request. |
| `analytics:refresh [--post-id <id>] [-p <platform>]` | Force-refresh analytics for a post (`--post-id`) or a connected account (`-p`). |
| `analytics:summary` | Org-level usage quotas + latest per-integration analytics snapshot. |
| `teams:list` / `teams:get <id>` / `teams:create --name <name>` / `teams:update <id>` / `teams:delete <id>` | Manage the teams in your organization. |
| `org:get` | Fetch your organization — id, name, plan limits, feature flags, teams. |
| `org:usage [--page <n>] [--page-size <n>] [--social-account-type <p>] [--social-account-id <id>]` | Posts/comments/uploads usage + per-account imports breakdown. |
| `org:daily-limits --social-account-id <id> [--date <yyyy-mm-dd>]` | One account's daily post/comment allowance (used/limit/remaining) for a day. Check it before bulk-scheduling. |
| `platforms:describe [platform] [--operation post\|comment]` | Look up the exact per-platform `data.<PLATFORM>` field schema for posts **and** comments — name, type, required flag, notes, capabilities and a ready-to-use example. Omit the platform for all 15. Offline — no API key needed. **Run it before composing a non-trivial `--platform-settings` / `--data` object.** |
| `doctor` | Self-diagnostic JSON. |

### Composing a post (`posts:create` / `posts:schedule` / `posts:update`)

- `-c, --content "<text>"` — the post text, used for every targeted platform.
- `-i, --integration-id <value>` (repeatable) — **target**. `<value>` is either a platform name/alias (preferred for agents — no lookup needed) or a connected integration id from `integrations:list`.
- `-p, --platform <name>` (repeatable) — same as `-i` but only accepts platform names.
- `-m, --media <ref>` (repeatable) — a public `https://` URL or a local file path. The CLI uploads it and attaches the resulting id. (You can also `media:upload` first and reference ids via `--data`.)
- `--platform-settings '<json>'` — per-platform options. Two accepted shapes:
  - **keyed by platform** (recommended): `'{"TIKTOK":{"privacy":"PUBLIC_TO_EVERYONE"},"YOUTUBE":{"type":"SHORT","privacyStatus":"PUBLIC","madeForKids":false}}'`
  - **flat**, applied to every targeted platform: `'{"type":"REEL"}'`
- `--data '<json>'` — advanced escape hatch: the entire post `data` object verbatim (`{"PLATFORM":{...}}`). Overrides `-c`/`-m`/`--platform-settings`. Targeted platforms are inferred from its keys unless you also pass `-i`/`-p`.
- `--data-file <path>` — same as `--data` but read from a JSON file (prefer this over giant inline JSON; avoids shell-escaping).
- `--title "<text>"` — optional; defaults to the first line of `--content`. Also the YouTube video title.
- `--reference-key "<key>"` — your own identifier for the post; fetch it later with `posts:get-by-reference-key` instead of storing bundle.social ids.
- `--first-comment "<text>"` or `--first-comment '{"INSTAGRAM":"…"}'` — a comment published as soon as the post goes live. Plain text applies to every comment-capable target; the JSON form targets specific platforms. Comment-capable platforms only.
- `--draft` (create only) — save without publishing.
- `-d, --date <iso8601>` — required for `posts:schedule`; on `posts:update` it changes the publish date. E.g. `2026-06-01T09:00:00Z`.
- `--status <DRAFT|SCHEDULED>` (update only) — move a post between draft and scheduled.

**Tip:** before posting to Reddit, run `integrations:trigger reddit:requirements --data '{"subreddit":"r/<sub>"}'` and `reddit:flairs` — set `sr` and (if required) `flairId` in `--platform-settings`. Same for YouTube `categoryId` (`youtube:categories`).

Platform name aliases: `x`/`twitter`, `tiktok`, `youtube`/`yt`, `instagram`/`ig`, `facebook`/`fb`, `threads`, `linkedin`/`li`, `pinterest`/`pin`, `reddit`, `mastodon`, `discord`, `slack`, `bluesky`/`bsky`, `gbp`/`google-business`, `snapchat`/`snap`.

## Per-platform composition notes

When you target a platform, put platform-specific fields under that platform's key in `--platform-settings` (or `--data`). bundle.social fills the rest. The **exhaustive field reference for every platform** (every accepted `data.<PLATFORM>` field, with types, required fields and minimal JSON examples) is in [`PROVIDER_SETTINGS.md`](./PROVIDER_SETTINGS.md), or query it on demand with `platforms:describe <platform>` (offline, no API key) — check one before composing anything non-trivial. The summary below covers the constraints you hit most often:

- **X / Twitter (`x`)** — `text` ~280 chars (longer if the connected account is X Premium). Up to 4 images **or** 1 video/GIF. Optional `replySettings`: `EVERYONE | FOLLOWING | MENTIONED_USERS | SUBSCRIBERS | VERIFIED`. Threads: post the first tweet, then add replies as comments. No analytics surface.
- **TikTok (`tiktok`)** — **`privacy` is effectively required**: `PUBLIC_TO_EVERYONE | MUTUAL_FOLLOW_FRIENDS | FOLLOWER_OF_CREATOR | SELF_ONLY`. `type`: `VIDEO` (1 video) or `IMAGE` (photo carousel; set `photoCoverIndex`). Optional disclosure flags `isBrandContent` / `isOrganicBrandContent`. Video: MP4/MOV/WEBM, up to ~10 min, ≥540p, portrait 9:16 recommended.
- **Instagram (`instagram`)** — `type`: `POST` (single image, carousel via `carouselItems`, or feed video), `REEL` (single video; `shareToFeed` true/false; `thumbnailOffset` ms), `STORY` (image or short video). Square ≥1080×1080 or portrait 4:5; Reels 9:16 up to 90s. Personal/Creator/Business accounts via Facebook or direct Instagram login. Optional `altText`, `collaborators`, `tagged`, `locationId`.
- **LinkedIn (`linkedin`)** — works for a personal profile or a company page depending on which the user connected. `text` ~3000 chars. Images, single video, or a document/PDF. Optional first comment.
- **YouTube (`youtube`)** — `type`: `SHORT` (vertical ≤60s) or `VIDEO` (full upload). Provide `title` (the post `--title` maps here), description (`text`), `privacyStatus`: `PUBLIC | UNLISTED | PRIVATE`, and `madeForKids` (boolean, required). One video upload.
- **Facebook (`facebook`)** — `type`: `POST` (text + images/video, optional `link`, optional `mediaTitle` for videos), `REEL` (single video), `STORY`. Posts to a Facebook Page. Optional `mediaItems` with `altText`.
- **Pinterest (`pinterest`)** — **`boardName` is required.** One image (or video). Optional `link` (where the Pin points), `altText`, `title`, `description`, `note`.
- **Reddit (`reddit`)** — **`sr` (subreddit, e.g. `r/test`) is required.** `text` is the body for self posts; attach an image/video or set a `link`. Some subreddits require a flair (`flairId`) — fetch options first if a post is rejected for that reason.
- **Threads (`threads`)** — `text` ~500 chars. Up to ~10 images or 1 video; per-item `altText` via `mediaItems`. Optional `topicTag`, `replyControl`, `allowlistedCountryCodes`, `crosspostToInstagramStory`. `poll`, `gif` and `linkAttachment` work on **text-only** posts (and poll/gif are mutually exclusive).
- **Bluesky (`bluesky`)** — `text` ~300 chars. Up to 4 images. No analytics surface.
- **Mastodon (`mastodon`)** — `text` length depends on the connected instance (commonly ~500 chars). Up to 4 images **or** 1 video. The user picks the instance when connecting.
- **Discord (`discord`)** — posts to a channel/webhook on a connected server. `text` ≤2000 chars; attachments allowed. No analytics surface.
- **Slack (`slack`)** — posts a message to a connected channel. Text + attachments. No analytics surface.
- **Google Business Profile (`gbp`)** — posts a local update to a connected business location. Short text + optional image/CTA. (Set up the location in the dashboard.)
- **Snapchat (`snapchat`)** — `type`: `STORY` (image or video) or `SPOTLIGHT` (video only, optional `description` ≤160 chars, `locale`, `skipSaveToProfile`). Video 5–180s, ≥540×960, ≤100 MB. Requires a Public Profile; no comments surface.

AI/partnership disclosure flags: `isAiGenerated` on X, Instagram, Pinterest and TikTok; `containsSyntheticMedia` on YouTube; `isPaidPartnership` + `brandedContentSponsors` (≤2 usernames, Facebook-Login accounts) on Instagram; `isBrandContent` / `isOrganicBrandContent` on TikTok; `hasPaidProductPlacement` on YouTube.

General media limits: images JPG/PNG/WEBP/GIF, video MP4/MOV/WEBM (up to 5 GB via `media:upload-large`). Large videos can take a while to process server-side after upload — a freshly created post may sit in `PROCESSING` before going `POSTED`.

## Worked workflows

### 1. Post the same text to several platforms now
```
bundle-social posts:create -c "We just shipped dark mode 🌙" -i x -i bluesky -i mastodon -i threads
```
Parse stdout for the new post `id` and `status`.

### 2. Schedule an image post to Instagram + X for tomorrow 9am UTC
```
bundle-social posts:schedule \
  -c "New look, who dis?" \
  -i instagram -i x \
  -m ./assets/banner.png \
  --platform-settings '{"INSTAGRAM":{"type":"POST","altText":"Our new banner"}}' \
  -d 2026-06-01T09:00:00Z
```

### 3. Publish a TikTok video and a YouTube Short from the same file
```
bundle-social posts:create \
  -c "Behind the scenes of launch week" \
  --title "Launch week BTS" \
  -i tiktok -i youtube \
  -m ./clips/bts.mp4 \
  --platform-settings '{"TIKTOK":{"type":"VIDEO","privacy":"PUBLIC_TO_EVERYONE"},"YOUTUBE":{"type":"SHORT","privacyStatus":"PUBLIC","madeForKids":false}}'
```

### 4. Reusable media, then a Reddit self-post with an image
```
UPLOAD=$(bundle-social media:upload ./assets/chart.png)
ID=$(printf '%s' "$UPLOAD" | jq -r .id)
bundle-social posts:create --data "{\"REDDIT\":{\"sr\":\"r/dataisbeautiful\",\"text\":\"Our 2026 growth, visualized\",\"uploadIds\":[\"$ID\"]}}"
```

### 5. Discover integrations, then check what's scheduled and how a post performed
```
bundle-social integrations:list                       # find integration ids / available platforms
bundle-social posts:list --status SCHEDULED --limit 20
bundle-social analytics:post <post-id>                # engagement for one post
bundle-social analytics:summary                       # quota usage + per-account snapshots
```

### More examples
Ready-to-run `data` templates and shell recipes ship with the package in [`examples/`](./examples/README.md) — `data/*.json` files for `--data-file` (Instagram carousel, TikTok video, YouTube Short, Reddit-with-flair, multi-platform launch) and `scripts/*.sh` (post-and-first-comment, schedule-campaign, reddit-prepared-post).

## Failure modes & recovery

Match on `error.code`:

- `MISSING_API_KEY` — `BUNDLESOCIAL_API_KEY` is not set. Tell the user to create one at `details.dashboardUrl` and set the env var.
- `TEAM_ID_REQUIRED` — the org has multiple teams. `details.teams` lists them; ask the user which, then set `BUNDLESOCIAL_TEAM_ID` or pass `--team-id`.
- `NO_TEAMS` — the org has no teams; the user must create one in the dashboard.
- `NO_TARGET` — `posts:create`/`posts:schedule`/`comments:create` was called without `-i`/`-p` (or a `--data` with platform keys, or a post with no usable platforms). Add a target.
- `NO_CONTENT` — `comments:create` was called without any `-c`. Add at least one.
- `NOTHING_TO_UPDATE` — `posts:update` was called with no fields to change. Pass at least one of `--title/--date/--status/--content/--media/--platform-settings/--data/--data-file/--reference-key/--first-comment/--integration-id`.
- `COMMENTS_NOT_SUPPORTED` — `--first-comment` (or a comment command) targeted a platform without a comments API. Drop that platform or use the JSON form of `--first-comment` to target only comment-capable ones.
- `UNKNOWN_PLATFORM` — a `-i`/`-p`/`--platform` value isn't a recognised platform name. Use one of the aliases above, or pass an integration id from `integrations:list`.
- `INTEGRATION_NOT_FOUND` — the integration id doesn't exist on this team. `details.availableIntegrations` lists valid ones; the user may need to connect the account in the dashboard first.
- `COMMENTS_NOT_SUPPORTED` — you targeted X/Twitter, Pinterest or Google Business for a comment. Drop those platforms (comments aren't available there).
- `UNKNOWN_INTEGRATION_TOOL` / `MISSING_PARAMS` — bad `integrations:trigger` method or missing required params. Run `integrations:tools` to see the method ids and required params.
- `INVALID_JSON` — `--platform-settings`, `--data` or an `integrations:trigger --data` isn't valid JSON. Fix the quoting (wrap the whole JSON in single quotes in a shell).
- `INVALID_DATE` — `--date`/`--from`/`--to` isn't ISO-8601. Use e.g. `2026-06-01T09:00:00Z`.
- `MEDIA_NOT_FOUND` / `FILE_NOT_FOUND` — the `-m` media path / `--data-file` path doesn't exist (or the media URL wasn't `http(s)://`). Check the path; large files may also exceed limits — surface `details`.
- `HTTP_400` / `HTTP_422` — the API rejected the request, usually a missing required platform field (Reddit `sr`, Pinterest `boardName`, TikTok `privacy`, YouTube `madeForKids`/`privacyStatus`) or content that violates a platform rule. `details.body` has the specifics — read it, fix the `--platform-settings`, retry.
- `HTTP_401` / `HTTP_403` — bad/insufficient API key, or the org lacks API access. Run `doctor`; the user may need to roll the key or upgrade the plan.
- `HTTP_404` — the post/upload id doesn't exist.
- `HTTP_429` — rate limited / monthly post quota exhausted. Check `analytics:summary` (or `doctor`) for remaining quota; back off and retry later, or the user upgrades their plan.
- `HTTP_5xx` — transient server error. Retry with backoff; if it persists, point the user at <https://status.bundle.social>.
- `UNEXPECTED_ERROR` — anything else. Set `BUNDLESOCIAL_DEBUG=1` to get a stack trace in `details` and report it.

If a post was created but a platform later errors (status `ERROR` when you `posts:get` it), the per-platform error is in the post's data. Try `posts:retry <id>` for a transient failure; for a bad field, `posts:update <id> --platform-settings '{...}'` to fix it (or create a new post).
