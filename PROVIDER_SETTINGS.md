# Per-platform settings reference

<!--
  SYNC: the per-platform field tables below are mirrored verbatim in the hosted
  docs at https://docs.bundle.social/api-reference/platform-parameters
  (source: bundlesocial-docs/api-reference/platform-parameters.mdx). When the API
  gains, removes or changes a `data.<PLATFORM>` field, update BOTH files in the
  same change. The only intended differences are this file's "How the CLI builds
  data" intro vs. that page's frontmatter / <Note> / "Media notes" section.
-->

This is the exhaustive reference for the per-platform fields you put under
`data.<PLATFORM>` — i.e. what you pass via `--platform-settings` (keyed by
platform) or `--data` / `--data-file` to `posts:create` / `posts:schedule` /
`posts:update`. It mirrors the shape the bundle.social API accepts (see the
[SDK](https://www.npmjs.com/package/bundlesocial) / [API
reference](https://docs.bundle.social) for the source of truth).

How the CLI builds `data`:

- `--content "<text>"` becomes `data.<P>.text` for every targeted platform.
- `-m, --media <url|path>` uploads the file and adds its id to `data.<P>.uploadIds`.
- `--platform-settings '{"<P>":{...}}'` is merged into `data.<P>` (a flat object
  is applied to every targeted platform instead).
- `--data` / `--data-file` replaces all of the above with the object you supply.

Conventions below: **bold** = required for that platform; everything else is
optional. `uploadIds` are ids returned by `media:upload` (or auto-filled by `-m`).
`thumbnail` (where present) is a public URL of an image already uploaded to
bundle.social — use it for video cover frames when an offset isn't enough.

---

## X / Twitter — `data.TWITTER`

| Field | Type | Notes |
|---|---|---|
| `text` | string | Post text. ~280 chars (longer if the connected account is X Premium). |
| `uploadIds` | string[] | Up to 4 images **or** 1 video/GIF. |
| `replySettings` | `EVERYONE` \| `FOLLOWING` \| `MENTIONED_USERS` \| `SUBSCRIBERS` \| `VERIFIED` | Who can reply. |
| `isAiGenerated` | boolean | Adds X's "made with AI" label to a post with AI-generated media. |

Threads: post the first tweet, then add the rest as replies with
`comments:create --post-id <id> -c "..." -c "..."` (X threads go through the
comments API, not `data`). No analytics surface for X.

```json
{ "TWITTER": { "text": "Shipping day 🚀", "replySettings": "EVERYONE" } }
```

## Bluesky — `data.BLUESKY`

| Field | Type | Notes |
|---|---|---|
| `text` | string | ~300 chars. |
| `uploadIds` | string[] | Up to 4 images, or 1 video (set `videoAlt`). |
| `tags` | string[] | Extra hashtags (without `#`), up to 8. |
| `labels` | (`!no-unauthenticated` \| `porn` \| `sexual` \| `nudity` \| `graphic-media`)[] | Self-labels / content warnings. |
| `quoteUri` | string | AT-URI of a post to quote (`at://…/app.bsky.feed.post/<rkey>`). |
| `externalUrl` / `externalTitle` / `externalDescription` | string | External link card. |
| `thumbnail` | string (URL) | Image for the external link card. |
| `videoAlt` | string | Alt text for a video embed. |

```json
{ "BLUESKY": { "text": "New post", "tags": ["launch", "indie"], "externalUrl": "https://bundle.social" } }
```

## Mastodon — `data.MASTODON`

| Field | Type | Notes |
|---|---|---|
| `text` | string | Length depends on the connected instance (commonly ~500). |
| `uploadIds` | string[] | Up to 4 images **or** 1 video. |
| `privacy` | `PUBLIC` \| `UNLISTED` \| `PRIVATE` \| `DIRECT` | Visibility. |
| `spoiler` | string | Content-warning text (collapses the post behind it). |
| `thumbnail` | string (URL) | Cover image for a video. |

```json
{ "MASTODON": { "text": "Hello fediverse", "privacy": "PUBLIC", "spoiler": "long read" } }
```

## Threads — `data.THREADS`

| Field | Type | Notes |
|---|---|---|
| `text` | string | ~500 chars. |
| `uploadIds` | string[] | Up to ~10 images, or 1 video. |
| `mediaItems` | `{ uploadId, altText? }[]` | Per-image alt text (alternative to `uploadIds`). |
| `topicTag` | string | One topic tag shown in the post header. 1–50 chars, no periods (`.`) or ampersands (`&`). |
| `replyControl` | `everyone` \| `accounts_you_follow` \| `mentioned_only` \| `parent_post_author_only` \| `followers_only` | Who can reply. Threads defaults to `everyone`. |
| `linkAttachment` | string (URL) | Link preview card. Text-only posts. |
| `poll` | `{ optionA, optionB, optionC?, optionD? }` | 2–4 options, 1–25 chars each. Text-only posts, and not together with `gif`. |
| `gif` | `{ gifId, provider?: "GIPHY" }` | GIF attachment. Text-only posts, and not together with `poll`. |
| `allowlistedCountryCodes` | string[] | Restrict visibility to these ISO 3166-1 alpha-2 codes. Requires Meta account eligibility. |
| `crosspostToInstagramStory` | boolean | Also share the post to the linked Instagram account as a Story. |
| `crosspostToInstagramStoryDarkMode` | boolean | Cross-post the Instagram Story in dark mode. |

Polls, GIFs and link attachments only work on text-only posts — Threads rejects
them when `uploadIds` is set.

```json
{ "THREADS": { "text": "Quick thought", "topicTag": "shipping", "replyControl": "everyone" } }
```

## LinkedIn — `data.LINKEDIN`

| Field | Type | Notes |
|---|---|---|
| **`text`** | string | Required. ~3000 chars. Works for a personal profile or a company page depending on which account the user connected. |
| `uploadIds` | string[] | Images, a single video, or a document/PDF. |
| `link` | string (URL) | For an article-preview post. |
| `thumbnail` | string (URL) | Cover image. |
| `mediaTitle` | string | Title for a video or document post (LinkedIn otherwise shows the post date under videos). |
| `privacy` | `CONNECTIONS` \| `PUBLIC` \| `LOGGED_IN` \| `CONTAINER` | Visibility. |
| `hideFromFeed` | boolean | Don't show in the main feed. |
| `disableReshare` | boolean | Disallow resharing. |

Mentions: discover URNs with `integrations:trigger linkedin:mentions --data '{"q":"...","scope":"organizations"}'` and put them in `text`.

```json
{ "LINKEDIN": { "text": "We just shipped X.", "privacy": "PUBLIC", "mediaTitle": "Demo" } }
```

## Facebook (Page) — `data.FACEBOOK`

| Field | Type | Notes |
|---|---|---|
| `type` | `POST` \| `REEL` \| `STORY` | Default `POST`. |
| `text` | string | Caption / message. |
| `uploadIds` | string[] | Images, or a single video. |
| `mediaItems` | `{ uploadId, altText? }[]` | Per-image alt text. |
| `link` | string (URL) | Link attachment — `type: POST` only. |
| `mediaTitle` | string | Video title — `type: POST` with a video only (not REEL/STORY). |
| `thumbnail` | string (URL) | Video cover image. |
| `nativeScheduleTime` | string (ISO 8601, local) | Schedule directly in Meta's scheduler instead of publishing now; max 30 days ahead. |

```json
{ "FACEBOOK": { "type": "POST", "text": "Look at this", "link": "https://bundle.social" } }
```

## Instagram — `data.INSTAGRAM`

| Field | Type | Notes |
|---|---|---|
| `type` | `POST` \| `REEL` \| `STORY` | `POST` = single image, carousel (`carouselItems`), or feed video; `REEL` = single video; `STORY` = image or short video. |
| `text` | string | Caption. |
| `uploadIds` | string[] | Single image/video for `POST`/`REEL`/`STORY`. Square ≥1080×1080 or portrait 4:5; Reels 9:16, up to 90s. |
| `altText` | string | Alt text for a single-image post. |
| `carouselItems` | `{ uploadId, altText?, tagged?: { username, x, y }[] }[]` | Carousel slides (for `type: POST`). |
| `thumbnailOffset` | number (ms) | Frame to use as the published video's cover. |
| `thumbnail` | string (URL) | Cover image (alternative to offset). |
| `shareToFeed` | boolean | Reels only — also show in the Feed tab. |
| `collaborators` | string[] | Usernames to invite as collaborators. |
| `tagged` | `{ username, x?, y? }[]` | People tags for a single-image post. |
| `locationId` | string | A location id — discover with `integrations:trigger instagram:locations --data '{"q":"..."}'`. |
| `autoFitImage` / `autoCropImage` | boolean | Let bundle.social fit/crop the image to a valid aspect ratio. |
| `trialParams` | `{ graduationStrategy: "MANUAL" \| "SS_PERFORMANCE" }` | Reels only — trial reels are shown to non-followers first. |
| `isPaidPartnership` | boolean | Adds the native "Paid partnership" label. Implied by `brandedContentSponsors`; use alone for a label without a named sponsor. |
| `brandedContentSponsors` | string[] | Up to 2 Instagram usernames to tag as paid-partnership sponsors. Accounts connected via Facebook Login only. |
| `musicSoundInfo` | `{ musicSoundId, musicSoundVolume?, videoOriginalSoundVolume? }` | Reels only — get an `audio_id` from `integrations:trigger instagram:audio --data '{"audioType":"music","searchQuery":"..."}'`. Volumes 0–100. |
| `isAiGenerated` | boolean | Adds Instagram's AI content label. |

Account types are connected via Facebook or directly via Instagram (`instagramConnectionMethod` on the integration).
`brandedContentSponsors` and business discovery only work for accounts connected through Facebook Login.

```json
{ "INSTAGRAM": { "type": "REEL", "text": "BTS", "shareToFeed": true, "thumbnailOffset": 1500 } }
```

```json
{ "INSTAGRAM": { "type": "POST", "text": "Carousel", "carouselItems": [
  { "uploadId": "<id1>", "altText": "slide 1" },
  { "uploadId": "<id2>", "altText": "slide 2" }
] } }
```

## TikTok — `data.TIKTOK`

| Field | Type | Notes |
|---|---|---|
| `type` | `VIDEO` \| `IMAGE` | `VIDEO` = 1 video; `IMAGE` = photo carousel. |
| **`privacy`** | `PUBLIC_TO_EVERYONE` \| `MUTUAL_FOLLOW_FRIENDS` \| `FOLLOWER_OF_CREATOR` \| `SELF_ONLY` | Effectively required by TikTok. |
| `text` | string | Caption. |
| `uploadIds` | string[] | The video, or the photos for `type: IMAGE`. Video: MP4/MOV/WEBM, ≥540p, portrait 9:16 recommended, up to ~10 min. |
| `photoCoverIndex` | number | Which photo is the cover (for `type: IMAGE`). |
| `thumbnailOffset` | number (ms) | Frame to use as the video cover. |
| `thumbnail` | string (URL) | Cover image (alternative to offset). |
| `isBrandContent` / `isOrganicBrandContent` | boolean | Disclosure: paid third-party partnership / promoting your own business. |
| `disableComments` / `disableDuet` / `disableStitch` | boolean | Interaction restrictions. |
| `isAiGenerated` | boolean | Mark the video as AI-generated. |
| `autoAddMusic` | boolean | Let TikTok add music to photos. |
| `autoScale` | boolean | Auto-scale the video. |
| `uploadToDraft` | boolean | Upload as a TikTok draft instead of publishing. |
| `musicSoundInfo` | `{ musicSoundId, musicSoundVolume?, musicSoundStart?, musicSoundEnd?, videoOriginalSoundVolume? }` | Commercial music — get a `song_clip_id` from `integrations:trigger tiktok:trending-music`. Volumes 0–100; start/end in ms. |

```json
{ "TIKTOK": { "type": "VIDEO", "text": "Launch BTS", "privacy": "PUBLIC_TO_EVERYONE", "disableStitch": true } }
```

## YouTube — `data.YOUTUBE`

| Field | Type | Notes |
|---|---|---|
| `type` | `VIDEO` \| `SHORT` | `SHORT` = vertical ≤60s; `VIDEO` = full upload. |
| `uploadIds` | string[] | One video. |
| `text` | string | The video **title** (the post `--title` flag also maps here). |
| `description` | string | Video description. |
| `thumbnail` | string (URL) | Custom thumbnail (`type: VIDEO`). |
| `privacy` | `PUBLIC` \| `UNLISTED` \| `PRIVATE` | Visibility. |
| `defaultLanguage` | string (BCP-47) | Language of the title and description, e.g. `en` or `pl`. |
| `defaultAudioLanguage` | string (BCP-47) | Language of the video's default audio track. |
| `madeForKids` | boolean | Required-ish — YouTube needs you to declare this. |
| `containsSyntheticMedia` | boolean | Mark AI-generated content. |
| `hasPaidProductPlacement` | boolean | Declare paid placements. |

(There's no `categoryId` in the post `data` itself — fetch categories with
`integrations:trigger youtube:categories --data '{"regionCode":"US"}'`; playlist
management is via the SDK's `misc.youtube*` methods / `integrations:trigger
youtube:playlists`.)

```json
{ "YOUTUBE": { "type": "SHORT", "text": "Launch BTS", "description": "Behind the scenes…", "privacy": "PUBLIC", "madeForKids": false } }
```

## Reddit — `data.REDDIT`

| Field | Type | Notes |
|---|---|---|
| **`sr`** | string | Subreddit (`r/subredditName`) or `u/username`. |
| **`text`** | string | The post title for link/text posts (Reddit's "title"). |
| `description` | string | The body for a self post. |
| `uploadIds` | string[] | An image or video. |
| `link` | string (URL) | Link post target. |
| `nsfw` | boolean | Mark NSFW. |
| `flairId` | string | Required if the subreddit requires a flair — get options with `integrations:trigger reddit:flairs --data '{"subreddit":"r/<sub>"}'`. |

Before posting, run `integrations:trigger reddit:requirements --data '{"subreddit":"r/<sub>"}'` to learn title length limits, allowed post types, and whether a flair is required.

```json
{ "REDDIT": { "sr": "r/dataisbeautiful", "text": "Our 2026 growth, visualized", "uploadIds": ["<id>"], "flairId": "<flair-id>" } }
```

## Discord — `data.DISCORD`

| Field | Type | Notes |
|---|---|---|
| **`channelId`** | string | The connected server channel (an integration "channel" id — see `integrations:list`). |
| `text` | string | Message content. ≤2000 chars. |
| `uploadIds` | string[] | Attachments. |
| `username` | string | Override the author name shown (webhook). |
| `avatarUrl` | string (URL) | Override the author avatar (webhook). |

```json
{ "DISCORD": { "channelId": "<channel-id>", "text": "New release 🎉" } }
```

## Slack — `data.SLACK`

| Field | Type | Notes |
|---|---|---|
| **`channelId`** | string | The connected workspace channel (an integration "channel" id — see `integrations:list`). |
| `text` | string | Message text. |
| `uploadIds` | string[] | Attachments. |
| `username` | string | Override the author name shown. |
| `avatarUrl` | string (URL) | Override the author avatar. |

```json
{ "SLACK": { "channelId": "<channel-id>", "text": "Standup notes…" } }
```

## Google Business Profile — `data.GOOGLE_BUSINESS`

| Field | Type | Notes |
|---|---|---|
| `text` | string | The update body. |
| `uploadIds` | string[] | Images/videos. |
| `topicType` | `STANDARD` \| `EVENT` \| `OFFER` \| `ALERT` | Post kind. |
| `languageCode` | string | Language tag like `en` / `en-US`. |
| `callToActionType` | `BOOK` \| `ORDER` \| `SHOP` \| `LEARN_MORE` \| `SIGN_UP` \| `CALL` | CTA button. |
| `callToActionUrl` | string (URL) | CTA target. |
| `eventTitle` / `eventStartDate` / `eventEndDate` | string | For `topicType: EVENT`. |
| `offerCouponCode` / `offerRedeemOnlineUrl` / `offerTermsConditions` | string | For `topicType: OFFER`. |
| `alertType` | `COVID_19` | For `topicType: ALERT`. |

Set the location up in the dashboard first; details/categories/hours are managed
via the SDK's `misc.googleBusiness*` methods (`integrations:trigger gbp:location`,
`gbp:categories`).

```json
{ "GOOGLE_BUSINESS": { "text": "Now open Saturdays!", "topicType": "STANDARD", "callToActionType": "LEARN_MORE", "callToActionUrl": "https://example.com" } }
```

## Pinterest — `data.PINTEREST`

| Field | Type | Notes |
|---|---|---|
| **`boardName`** | string | The board to pin to. |
| `uploadIds` | string[] | One image (or video). |
| `text` | string | The Pin title. |
| `description` | string | Pin description. |
| `link` | string (URL) | Where the Pin links to. |
| `altText` | string | Image alt text. |
| `note` | string | Private note (not public). |
| `thumbnail` | string (URL) | Cover image. |
| `dominantColor` | string | Hex color used as a placeholder before the image loads. |
| `isAiGenerated` | boolean | Adds Pinterest's AI disclosure label. |

```json
{ "PINTEREST": { "boardName": "Inspiration", "text": "New idea", "uploadIds": ["<id>"], "link": "https://bundle.social" } }
```

## Snapchat (Public Profile) — `data.SNAPCHAT`

| Field | Type | Notes |
|---|---|---|
| `type` | `STORY` \| `SPOTLIGHT` | Default `STORY`. |
| `uploadIds` | string[] | One image or video. Video: 5–180s, ≥540×960, up to 100 MB. Images are Story-only. |
| `text` | string | Alias for `description` (Spotlight). ≤160 chars. |
| `description` | string | Spotlight description. ≤160 chars. |
| `locale` | string | Spotlight locale in `en_US` form. Default `en_US`. |
| `skipSaveToProfile` | boolean | Spotlight only — don't save the post to the profile. |

Requires a Snapchat Public Profile. There is no comments API surface for
Snapchat; profile and content analytics are available.

```json
{ "SNAPCHAT": { "type": "SPOTLIGHT", "description": "Launch day", "locale": "en_US" } }
```

---

## Media notes (all platforms)

- Images: JPG / PNG / WEBP / GIF. Video: MP4 / MOV / WEBM, up to 5 GB via the large-upload flow.
- Upload media first (`media:upload <url|path>` → `id`), or let `-m` do it; then
  put ids in `uploadIds` (and `carouselItems[].uploadId` / `mediaItems[].uploadId`).
- Large videos can take a while to process server-side after upload — a newly
  created post may sit in `PROCESSING` before going `POSTED`. Use `posts:get <id>`
  to check status; `posts:retry <id>` for a transient platform failure.
