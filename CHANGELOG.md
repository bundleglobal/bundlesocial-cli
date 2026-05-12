# Changelog

All notable changes to `bundlesocial-cli` are documented here. This file is
maintained automatically by [semantic-release](https://semantic-release.gitbook.io/).

## 1.0.0

Initial release.

- `integrations:list` — list connected social-media integrations
- `integrations:tools` / `integrations:trigger <method>` — discover platform-specific values (subreddit flairs, YouTube categories/playlists/regions, LinkedIn mentions, Instagram locations, Google Business categories, TikTok trending music)
- `posts:create` — publish a post immediately
- `posts:schedule` — schedule a post for a future date
- `posts:update <id>` — update an existing post (only the fields you pass change)
- `posts:list` — list recent posts with filters
- `posts:get <id>` — fetch a single post
- `posts:delete <id>` — delete a post
- `posts:retry <id>` — retry a post that ended in ERROR
- `comments:create` — post a comment, or a chain of comments (X-style thread via comments)
- `comments:list` / `comments:get <id>` / `comments:delete <id>`
- `media:upload <path-or-url>` — upload media from a file or URL
- `analytics:post <id>` — engagement metrics for a single post
- `analytics:summary` — organization-level analytics summary
- `doctor` — diagnose API key, connectivity, integrations and quotas
- `--data-file <path>` on `posts:create` / `posts:schedule` / `posts:update` — read the post `data` object from a JSON file
- JSON output by default (stdout), human status on stderr, `--pretty` for tables
- `SKILL.md` for OpenClaw and other agent runtimes; `PROVIDER_SETTINGS.md` (exhaustive per-platform field reference); `examples/` (data templates + shell recipes)
