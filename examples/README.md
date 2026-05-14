# Examples

Copy-paste recipes for `bundlesocial-cli`. Set `BUNDLESOCIAL_API_KEY` first (and
`BUNDLESOCIAL_TEAM_ID` if your organization has more than one team):

```bash
export BUNDLESOCIAL_API_KEY="sk_live_..."
# export BUNDLESOCIAL_TEAM_ID="team_..."
npx bundlesocial-cli doctor
```

## `data/` — post `data` objects for `--data-file`

Each `*.json` here is a complete `data` object (keyed by platform) that you pass
with `--data-file`. Replace the `REPLACE_WITH_UPLOAD_ID` / `REPLACE_*`
placeholders first — upload media with `media:upload` and use the returned `id`:

```bash
ID=$(npx bundlesocial-cli media:upload ./clip.mp4 | jq -r .id)
# edit examples/data/tiktok-video.json: "uploadIds": ["$ID"]
npx bundlesocial-cli posts:create --data-file examples/data/tiktok-video.json
# or schedule it:
npx bundlesocial-cli posts:schedule --data-file examples/data/multi-platform-launch.json -d 2026-06-01T09:00:00Z
```

The targeted platforms are inferred from the object's keys, so you don't need
`-i`/`-p` when using `--data-file`.

- `instagram-carousel.json` — a multi-image Instagram feed post.
- `tiktok-video.json` — a TikTok video with the required privacy level.
- `youtube-short.json` — a YouTube Short with title/description/`madeForKids`.
- `reddit-with-flair.json` — a Reddit self-post with a subreddit and a flair id.
- `multi-platform-launch.json` — the same announcement to X, LinkedIn, Bluesky and Threads.
- `x-thread-via-comments.md` — recipe: X threads use the comments API, not `data`.

## `scripts/` — end-to-end shell recipes

- `post-and-first-comment.sh` — publish a post, then add a first comment to it.
- `schedule-campaign.sh` — schedule several `--data-file` posts at given dates.
- `reddit-prepared-post.sh` — fetch a subreddit's requirements + flairs, then post with the right flair.
- `import-history.sh` — import an account's recent posts (with analytics), poll the import, then list the imported posts.

```bash
bash examples/scripts/post-and-first-comment.sh
```

Every script prints the JSON the CLI returns; pipe through `jq` to drill in.
