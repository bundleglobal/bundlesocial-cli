# Recipe: an X / Twitter thread

X threads aren't a `data` shape — you publish the first tweet as a post, then add
each subsequent tweet as a **comment** on that post. (`comments:create` chains
each reply under the previous one.)

```bash
# 1) the first tweet
POST=$(npx bundlesocial-cli posts:create -i x -c "1/ A short thread on why we rebuilt our publishing pipeline 🧵")
ID=$(printf '%s' "$POST" | jq -r .id)

# 2) the rest of the thread (each -c is the next tweet; --delay staggers them)
npx bundlesocial-cli comments:create --post-id "$ID" -i x \
  -c "2/ The old pipeline had a 6% error rate. Most of it was platform edge cases we kept rediscovering." \
  -c "3/ We moved every platform behind one normalized interface and pushed retries + verbose errors into the layer." \
  -c "4/ Result: <2% error rate, and adding a platform is now a day, not a week." \
  -c "5/ Writeup: https://bundle.social/blog"
```

Notes:
- Comments are supported on TIKTOK, YOUTUBE, INSTAGRAM, FACEBOOK, THREADS,
  LINKEDIN, REDDIT, MASTODON, DISCORD, SLACK, BLUESKY — so the same pattern works
  for Threads/Bluesky/Mastodon reply chains too.
- `--delay <minutes>` adds a gap between each comment; `--draft` stages them
  without posting.
- The CLI's `comments:create` is text-only — for per-comment media use the
  SDK (`comment.commentCreate` with `data.<PLATFORM>.uploadIds`). Most threads
  are text-only anyway.
