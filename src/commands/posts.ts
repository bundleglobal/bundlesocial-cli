import type { Command } from "commander";
import type {
  PostCreateData,
  PostGetListData,
  PostGetReconnectSocialAccountCandidatesData,
  PostReconnectSocialAccountData,
  PostUpdateData,
} from "bundlesocial";
import { safeAction } from "../program";
import { createContext, resolveTeamId, type CliContext } from "../context";
import { CliError, emitResult } from "../output";
import { COMMENT_PLATFORMS, isCommentPlatform, normalizePlatform, type Platform } from "../platforms";
import { uploadMediaRefs } from "../media";
import { buildPostData, deriveTitle, parseJsonObject, resolveDataArgument, resolveTargetPlatforms, toIsoDate } from "../post-data";

type PostCreateBody = NonNullable<PostCreateData["requestBody"]>;
type PostData = PostCreateBody["data"];
type PostUpdateBody = NonNullable<PostUpdateData["requestBody"]>;
type ReconnectPlatform = NonNullable<PostReconnectSocialAccountData["requestBody"]>["type"];
type PostFirstComment = NonNullable<NonNullable<PostCreateBody["firstComment"]>>;

interface ComposeOptions {
  content?: string;
  integrationId?: string[];
  platform?: string[];
  media?: string[];
  platformSettings?: string;
  data?: string;
  dataFile?: string;
  title?: string;
  referenceKey?: string;
  firstComment?: string;
}

/**
 * Split `--first-comment` into the per-platform `firstComment` object the API
 * expects. Accepts a platform-keyed JSON object (`{"INSTAGRAM":"…"}`) or plain
 * text applied to every comment-capable platform the post targets.
 */
function buildFirstComment(raw: string | undefined, platforms: Platform[]): PostFirstComment | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    const parsed = parseJsonObject(trimmed, "--first-comment");
    const result: PostFirstComment = {};
    for (const [key, value] of Object.entries(parsed)) {
      const platform = normalizePlatform(key);
      if (!isCommentPlatform(platform)) {
        throw new CliError(
          "COMMENTS_NOT_SUPPORTED",
          `A first comment is not supported on ${platform}. Supported: ${COMMENT_PLATFORMS.join(", ")}.`,
        );
      }
      if (typeof value !== "string") {
        throw new CliError("INVALID_JSON", `--first-comment.${key} must be a string.`);
      }
      result[platform] = value;
    }
    return result;
  }
  const targets = platforms.filter(isCommentPlatform);
  if (targets.length === 0) {
    throw new CliError(
      "COMMENTS_NOT_SUPPORTED",
      `None of the targeted platforms support comments, so --first-comment has no effect. Supported: ${COMMENT_PLATFORMS.join(", ")}.`,
    );
  }
  const result: PostFirstComment = {};
  for (const platform of targets) result[platform] = raw;
  return result;
}

/** Shared options for composing/editing a post (`posts:create` / `posts:schedule` / `posts:update`). */
function addComposeOptions(command: Command): Command {
  return command
    .option("-c, --content <text>", "post text, applied to every targeted platform")
    .option(
      "-i, --integration-id <id...>",
      "target: a connected integration id OR a platform name/alias (x, tiktok, instagram, youtube, facebook, threads, linkedin, pinterest, reddit, mastodon, discord, slack, bluesky, gbp, snapchat). Repeatable.",
    )
    .option("-p, --platform <platform...>", "alias for --integration-id that only accepts platform names. Repeatable.")
    .option("-m, --media <ref...>", "media to attach: a public https:// URL or a local file path. Uploaded automatically. Repeatable.")
    .option(
      "--platform-settings <json>",
      'per-platform options as JSON, either keyed by platform `{"TIKTOK":{"privacy":"PUBLIC_TO_EVERYONE"}}` or a flat object applied to all targeted platforms',
    )
    .option("--data <json>", "advanced: the full post `data` object as JSON; overrides --content/--media/--platform-settings")
    .option("--data-file <path>", "advanced: read the full post `data` object from a JSON file (alternative to --data)")
    .option("--title <text>", "post title (defaults to the first line of --content)")
    .option("--reference-key <key>", "your own identifier for this post; look it up later with posts:get-by-reference-key")
    .option(
      "--first-comment <text|json>",
      'comment published right after the post goes live: plain text (applied to every comment-capable target) or JSON keyed by platform, e.g. \'{"INSTAGRAM":"more below 👇"}\'',
    );
}

interface ComposedPost {
  ctx: CliContext;
  teamId: string;
  platforms: Platform[];
  data: PostData;
  title: string;
}

async function composePost(globalOptions: Record<string, unknown>, opts: ComposeOptions): Promise<ComposedPost> {
  const ctx = createContext(globalOptions);
  const teamId = await resolveTeamId(ctx);
  const dataArg = resolveDataArgument(opts.data, opts.dataFile);

  const rawTargets = [...(opts.integrationId ?? []), ...(opts.platform ?? [])];
  let platforms: Platform[];
  if (rawTargets.length > 0) {
    platforms = await resolveTargetPlatforms(ctx.client, teamId, rawTargets);
  } else if (dataArg) {
    // No explicit targets: derive them from the keys of the `data` object.
    platforms = Object.keys(dataArg).map((key) => normalizePlatform(key));
  } else {
    throw new CliError(
      "NO_TARGET",
      'Specify at least one target with --integration-id / --platform (a platform name like "x" or a connected integration id).',
    );
  }
  if (platforms.length === 0) {
    throw new CliError("NO_TARGET", "Could not determine any target platform for this post.");
  }

  const mediaUploadIds = await uploadMediaRefs(ctx, teamId, opts.media ?? []);
  const data = buildPostData(platforms, {
    content: opts.content,
    mediaUploadIds,
    platformSettings: opts.platformSettings,
    data: dataArg,
  });

  return { ctx, teamId, platforms, data: data as unknown as PostData, title: opts.title ?? deriveTitle(opts.content) };
}

export function registerPostsCommands(program: Command): void {
  addComposeOptions(
    program
      .command("posts:create")
      .summary("publish a post immediately")
      .description("Publish a post immediately to one or more connected integrations. Use --draft to save it as a draft instead."),
  )
    .option("--draft", "save as a DRAFT instead of publishing now")
    .action(
      safeAction(async (opts: ComposeOptions & { draft?: boolean }, command: Command) => {
        const { ctx, teamId, platforms, data, title } = await composePost(command.optsWithGlobals(), opts);
        const requestBody: PostCreateBody = {
          teamId,
          title,
          postDate: new Date().toISOString(),
          status: opts.draft ? "DRAFT" : "SCHEDULED",
          socialAccountTypes: platforms,
          data,
        };
        if (opts.referenceKey !== undefined) requestBody.referenceKey = opts.referenceKey;
        const firstComment = buildFirstComment(opts.firstComment, platforms);
        if (firstComment) requestBody.firstComment = firstComment;
        const post = await ctx.client.post.postCreate({ requestBody });
        emitResult(post, ctx.pretty);
      }),
    );

  addComposeOptions(
    program
      .command("posts:schedule")
      .summary("schedule a post for a future date")
      .description("Schedule a post to be published at a given date/time on one or more connected integrations."),
  )
    .requiredOption("-d, --date <iso8601>", "when to publish, ISO 8601 (e.g. 2026-06-01T09:00:00Z)")
    .action(
      safeAction(async (opts: ComposeOptions & { date: string }, command: Command) => {
        const postDate = toIsoDate(opts.date, "--date");
        const { ctx, teamId, platforms, data, title } = await composePost(command.optsWithGlobals(), opts);
        const requestBody: PostCreateBody = {
          teamId,
          title,
          postDate,
          status: "SCHEDULED",
          socialAccountTypes: platforms,
          data,
        };
        if (opts.referenceKey !== undefined) requestBody.referenceKey = opts.referenceKey;
        const firstComment = buildFirstComment(opts.firstComment, platforms);
        if (firstComment) requestBody.firstComment = firstComment;
        const post = await ctx.client.post.postCreate({ requestBody });
        emitResult(post, ctx.pretty);
      }),
    );

  addComposeOptions(
    program
      .command("posts:update")
      .summary("update an existing post")
      .description(
        "Update an existing post by id — change its title, publish date, status (DRAFT/SCHEDULED), targeted integrations and/or per-platform content. Only the fields you pass are changed. If you change content/media without -i/-p the post's current platforms are reused.",
      ),
  )
    .argument("<id>", "post id")
    .option("-d, --date <iso8601>", "new publish date, ISO 8601")
    .option("--status <status>", "new status: DRAFT | SCHEDULED")
    .action(
      safeAction(async (id: string, opts: ComposeOptions & { date?: string; status?: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);
        const dataArg = resolveDataArgument(opts.data, opts.dataFile);
        const wantsDataChange =
          opts.content !== undefined || (opts.media?.length ?? 0) > 0 || opts.platformSettings !== undefined || dataArg !== undefined;
        const rawTargets = [...(opts.integrationId ?? []), ...(opts.platform ?? [])];

        let platforms: Platform[] | undefined;
        if (rawTargets.length > 0) {
          platforms = await resolveTargetPlatforms(ctx.client, teamId, rawTargets);
        } else if (dataArg) {
          platforms = Object.keys(dataArg).map((key) => normalizePlatform(key));
        } else if (wantsDataChange) {
          const existing = await ctx.client.post.postGet({ id });
          platforms = Object.keys(existing.data ?? {}) as Platform[];
          if (platforms.length === 0) {
            throw new CliError("NO_TARGET", "Could not determine the post's platforms — pass --integration-id / --platform.");
          }
        }

        const requestBody: PostUpdateBody = {};
        if (opts.title !== undefined) requestBody.title = opts.title;
        if (opts.referenceKey !== undefined) requestBody.referenceKey = opts.referenceKey;
        if (opts.firstComment !== undefined) {
          const targets = platforms ?? (Object.keys((await ctx.client.post.postGet({ id })).data ?? {}) as Platform[]);
          requestBody.firstComment = buildFirstComment(opts.firstComment, targets);
        }
        if (opts.date) requestBody.postDate = toIsoDate(opts.date, "--date");
        if (opts.status) requestBody.status = opts.status.trim().toUpperCase() as PostUpdateBody["status"];
        if (platforms && platforms.length > 0) requestBody.socialAccountTypes = platforms as PostUpdateBody["socialAccountTypes"];
        if (wantsDataChange && platforms && platforms.length > 0) {
          const mediaUploadIds = await uploadMediaRefs(ctx, teamId, opts.media ?? []);
          requestBody.data = buildPostData(platforms, {
            content: opts.content,
            mediaUploadIds,
            platformSettings: opts.platformSettings,
            data: dataArg,
          }) as unknown as PostUpdateBody["data"];
        }
        if (Object.keys(requestBody).length === 0) {
          throw new CliError(
            "NOTHING_TO_UPDATE",
            "Nothing to update — pass at least one of --title, --date, --status, --content, --media, --platform-settings, --data, --data-file, --reference-key, --first-comment, --integration-id/--platform.",
          );
        }
        emitResult(await ctx.client.post.postUpdate({ id, requestBody }), ctx.pretty);
      }),
    );

  program
    .command("posts:list")
    .summary("list recent posts")
    .description("List recent posts for the team, newest first, with optional filters.")
    .option("--limit <n>", "max number of posts to return (default 20)", "20")
    .option("--offset <n>", "number of posts to skip")
    .option("--status <status>", "filter by status: DRAFT | SCHEDULED | POSTED | ERROR | DELETED | PROCESSING | REVIEW | RETRYING")
    .option("--platform <platform...>", "filter by platform name/alias. Repeatable.")
    .option("--from <iso8601>", "only posts with postDate on/after this date")
    .option("--to <iso8601>", "only posts with postDate on/before this date")
    .option("-q, --query <text>", "free-text search over post titles/content")
    .option("--order <ASC|DESC>", "sort direction (default DESC)")
    .option("--order-by <field>", "sort field: createdAt | updatedAt | postDate | postedDate | deletedAt")
    .action(
      safeAction(
        async (
          opts: {
            limit?: string;
            offset?: string;
            status?: string;
            platform?: string[];
            from?: string;
            to?: string;
            query?: string;
            order?: string;
            orderBy?: string;
          },
          command: Command,
        ) => {
          const ctx = createContext(command.optsWithGlobals());
          const teamId = await resolveTeamId(ctx);
          const platforms = (opts.platform ?? []).map(normalizePlatform);
          const query: PostGetListData = {
            teamId,
            limit: opts.limit !== undefined ? Number(opts.limit) : 20,
            offset: opts.offset !== undefined ? Number(opts.offset) : undefined,
            status: opts.status ? (opts.status.trim().toUpperCase() as PostGetListData["status"]) : undefined,
            platforms: platforms.length > 0 ? (platforms as PostGetListData["platforms"]) : undefined,
            postDateFrom: opts.from ? toIsoDate(opts.from, "--from") : undefined,
            postDateTo: opts.to ? toIsoDate(opts.to, "--to") : undefined,
            q: opts.query,
            order: opts.order ? (opts.order.trim().toUpperCase() as PostGetListData["order"]) : undefined,
            orderBy: opts.orderBy ? (opts.orderBy as PostGetListData["orderBy"]) : undefined,
          };
          emitResult(await ctx.client.post.postGetList(query), ctx.pretty);
        },
      ),
    );

  program
    .command("posts:get")
    .summary("fetch a single post")
    .description("Fetch a single post by its bundle.social id.")
    .argument("<id>", "post id")
    .action(
      safeAction(async (id: string, _opts: unknown, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        emitResult(await ctx.client.post.postGet({ id }), ctx.pretty);
      }),
    );

  program
    .command("posts:delete")
    .summary("delete a post")
    .description("Delete a post by its bundle.social id.")
    .argument("<id>", "post id")
    .action(
      safeAction(async (id: string, _opts: unknown, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        emitResult(await ctx.client.post.postDelete({ id }), ctx.pretty);
      }),
    );

  program
    .command("posts:retry")
    .summary("retry a failed post")
    .description("Retry publishing a post that ended in the ERROR state.")
    .argument("<id>", "post id")
    .action(
      safeAction(async (id: string, _opts: unknown, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        emitResult(await ctx.client.post.postRetry({ id }), ctx.pretty);
      }),
    );

  program
    .command("posts:get-by-reference-key")
    .summary("fetch a post by your own reference key")
    .description(
      "Fetch a single post using the `referenceKey` you set when creating it (see posts:create --reference-key) instead of the bundle.social post id.",
    )
    .argument("<referenceKey>", "your reference key for the post")
    .action(
      safeAction(async (referenceKey: string, _opts: unknown, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        emitResult(await ctx.client.post.postGetByReferenceKey({ referenceKey }), ctx.pretty);
      }),
    );

  program
    .command("posts:reconnect-candidates")
    .summary("list posts waiting to be reattached to a reconnected account")
    .description(
      "List draft/scheduled posts that lost their link to a social account after a disconnect and can be reattached to a newly connected account of the same platform.",
    )
    .requiredOption("-p, --platform <platform>", "platform of the reconnected account")
    .option("--limit <n>", "max number of posts to return")
    .option("--offset <n>", "number of posts to skip")
    .action(
      safeAction(async (opts: { platform: string; limit?: string; offset?: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);
        const query: PostGetReconnectSocialAccountCandidatesData = {
          teamId,
          type: normalizePlatform(opts.platform) as PostGetReconnectSocialAccountCandidatesData["type"],
          limit: opts.limit !== undefined ? Number(opts.limit) : undefined,
          offset: opts.offset !== undefined ? Number(opts.offset) : undefined,
        };
        emitResult(await ctx.client.post.postGetReconnectSocialAccountCandidates(query), ctx.pretty);
      }),
    );

  program
    .command("posts:reconnect")
    .summary("reattach posts to a reconnected account")
    .description(
      "Attach a newly connected social account to the posts that lost their link to the previous account of that platform. Without --post-id every candidate is reattached (see posts:reconnect-candidates).",
    )
    .requiredOption("-p, --platform <platform>", "platform of the reconnected account")
    .option("--post-id <id...>", "only reattach these posts. Repeatable. Defaults to every candidate.")
    .action(
      safeAction(async (opts: { platform: string; postId?: string[] }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);
        emitResult(
          await ctx.client.post.postReconnectSocialAccount({
            requestBody: {
              teamId,
              type: normalizePlatform(opts.platform) as ReconnectPlatform,
              ...(opts.postId && opts.postId.length > 0 ? { postIds: opts.postId } : {}),
            },
          }),
          ctx.pretty,
        );
      }),
    );
}
