## [1.0.1](https://github.com/bundleglobal/bundlesocial-cli/compare/v1.0.0...v1.0.1) (2026-05-17)


### Bug Fixes

* build before release ([12ea959](https://github.com/bundleglobal/bundlesocial-cli/commit/12ea959d0e2d62884b4a3348fec3bc492c5f6267))

# 1.0.0 (2026-05-17)


### Bug Fixes

* semantic release ([2db1b25](https://github.com/bundleglobal/bundlesocial-cli/commit/2db1b25e220bc0e0bd7eb640d8edbed660e4d762))


### Features

* additional methods ([d5e785a](https://github.com/bundleglobal/bundlesocial-cli/commit/d5e785a28de359cf2005ab35841c2d858798d4fb))
* bundle.social CLI v1 ([6edabda](https://github.com/bundleglobal/bundlesocial-cli/commit/6edabda023616c3f98fec63392c867cc424ad1bd))
* update comment ([8d9831c](https://github.com/bundleglobal/bundlesocial-cli/commit/8d9831ce6d91d05d2c65b6a03dd735c28e60a3fc))

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
