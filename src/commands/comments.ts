import type { Command } from "commander";
import type {
  CommentCreateData,
  CommentGetListData,
  CommentImportCreateData,
  CommentImportGetFetchedCommentsData,
  CommentImportGetListData,
} from "bundlesocial";
import { safeAction } from "../program";
import { createContext, resolveTeamId, type CliContext } from "../context";
import { CliError, emitResult } from "../output";
import { COMMENT_PLATFORMS, type CommentPlatform, isCommentPlatform, normalizePlatform } from "../platforms";
import { resolveTargetPlatforms, toIsoDate } from "../post-data";

type CommentImportPlatform = NonNullable<CommentImportCreateData["requestBody"]>["socialAccountType"];

type CommentCreateBody = NonNullable<CommentCreateData["requestBody"]>;
type CommentData = NonNullable<CommentCreateBody["data"]>;
type CommentSocialAccountTypes = NonNullable<CommentCreateBody["socialAccountTypes"]>;

interface CreateCommentOptions {
  postId: string;
  content?: string[];
  integrationId?: string[];
  platform?: string[];
  date?: string;
  delay?: string;
  draft?: boolean;
}

function assertCommentPlatforms(platforms: string[]): CommentPlatform[] {
  const bad = platforms.filter((platform) => !isCommentPlatform(platform));
  if (bad.length > 0) {
    throw new CliError(
      "COMMENTS_NOT_SUPPORTED",
      `Comments are not available for ${bad.join(", ")}. Supported: ${COMMENT_PLATFORMS.join(", ")}.`,
    );
  }
  return platforms as CommentPlatform[];
}

async function resolveCommentPlatforms(
  ctx: CliContext,
  teamId: string,
  postId: string,
  rawTargets: string[],
): Promise<CommentPlatform[]> {
  if (rawTargets.length > 0) {
    return assertCommentPlatforms(await resolveTargetPlatforms(ctx.client, teamId, rawTargets));
  }
  // No explicit targets: comment on every platform the post was published to that supports comments.
  const post = await ctx.client.post.postGet({ id: postId });
  const fromPost = Object.keys(post.data ?? {}).filter(isCommentPlatform);
  if (fromPost.length === 0) {
    throw new CliError(
      "NO_TARGET",
      "Could not determine comment platforms from the post — pass --integration-id / --platform (comment-capable platforms only).",
    );
  }
  return fromPost;
}

function buildCommentData(platforms: CommentPlatform[], text: string): CommentData {
  const data: Record<string, { text: string }> = {};
  for (const platform of platforms) data[platform] = { text };
  return data as unknown as CommentData;
}

export function registerCommentsCommands(program: Command): void {
  program
    .command("comments:create")
    .summary("post a comment (or a chain of comments) on a post")
    .description(
      "Post one or more comments on an existing post. Pass --content multiple times to create a chain (the first replies to the post, each subsequent one replies to the previous comment) — useful for X-style threads via comments. Comments are supported on TIKTOK, YOUTUBE, INSTAGRAM, FACEBOOK, THREADS, LINKEDIN, REDDIT, MASTODON, DISCORD, SLACK, BLUESKY.",
    )
    .requiredOption("--post-id <id>", "id of the post to comment on")
    .option("-c, --content <text...>", "comment text; repeat to create a chain of replies")
    .option("-i, --integration-id <id...>", "target: a connected integration id OR a comment-capable platform name/alias. Repeatable. Defaults to the post's platforms.")
    .option("-p, --platform <platform...>", "alias for --integration-id that only accepts platform names. Repeatable.")
    .option("--date <iso8601>", "when to post the (first) comment, ISO 8601 (default: now)")
    .option("--delay <minutes>", "for a chain, minutes to wait between each comment", "0")
    .option("--draft", "create the comment(s) as DRAFT instead of posting")
    .action(
      safeAction(async (opts: CreateCommentOptions, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);
        const contents = (opts.content ?? []).filter((text) => text.trim().length > 0);
        if (contents.length === 0) throw new CliError("NO_CONTENT", "Provide at least one --content for the comment.");

        const rawTargets = [...(opts.integrationId ?? []), ...(opts.platform ?? [])];
        const platforms = await resolveCommentPlatforms(ctx, teamId, opts.postId, rawTargets);
        const status: CommentCreateBody["status"] = opts.draft ? "DRAFT" : "SCHEDULED";
        const delayMinutes = Number(opts.delay ?? "0");
        const baseDate = opts.date ? new Date(toIsoDate(opts.date, "--date")) : new Date();

        const created = [];
        let parentCommentId: string | undefined;
        for (let index = 0; index < contents.length; index += 1) {
          const text = contents[index];
          const postDate = new Date(baseDate.getTime() + index * delayMinutes * 60_000).toISOString();
          const comment = await ctx.client.comment.commentCreate({
            requestBody: {
              teamId,
              internalPostId: opts.postId,
              ...(parentCommentId ? { internalParentCommentId: parentCommentId } : {}),
              status,
              postDate,
              socialAccountTypes: platforms as CommentSocialAccountTypes,
              data: buildCommentData(platforms, text),
              text,
            },
          });
          created.push(comment);
          parentCommentId = comment.id;
        }
        emitResult(created.length === 1 ? created[0] : created, ctx.pretty);
      }),
    );

  program
    .command("comments:list")
    .summary("list comments")
    .description("List comments for the team, optionally filtered by post, status and platform.")
    .option("--post-id <id>", "only comments on this post")
    .option("--limit <n>", "max number of comments to return (default 20)", "20")
    .option("--offset <n>", "number of comments to skip")
    .option("--status <status>", "filter by status: DRAFT | SCHEDULED | POSTED | ERROR | DELETED | PROCESSING | RETRYING")
    .option("--platform <platform...>", "filter by comment-capable platform name/alias. Repeatable.")
    .option("-q, --query <text>", "free-text search over comment content")
    .option("--order <ASC|DESC>", "sort direction (default DESC)")
    .option("--order-by <field>", "sort field: createdAt | updatedAt | deletedAt")
    .action(
      safeAction(
        async (
          opts: {
            postId?: string;
            limit?: string;
            offset?: string;
            status?: string;
            platform?: string[];
            query?: string;
            order?: string;
            orderBy?: string;
          },
          command: Command,
        ) => {
          const ctx = createContext(command.optsWithGlobals());
          const teamId = await resolveTeamId(ctx);
          const platforms = assertCommentPlatforms((opts.platform ?? []).map(normalizePlatform));
          const query: CommentGetListData = {
            teamId,
            postId: opts.postId,
            limit: opts.limit !== undefined ? Number(opts.limit) : 20,
            offset: opts.offset !== undefined ? Number(opts.offset) : undefined,
            status: opts.status ? (opts.status.trim().toUpperCase() as CommentGetListData["status"]) : undefined,
            platforms: platforms.length > 0 ? (platforms as CommentGetListData["platforms"]) : undefined,
            q: opts.query,
            order: opts.order ? (opts.order.trim().toUpperCase() as CommentGetListData["order"]) : undefined,
            orderBy: opts.orderBy ? (opts.orderBy as CommentGetListData["orderBy"]) : undefined,
          };
          emitResult(await ctx.client.comment.commentGetList(query), ctx.pretty);
        },
      ),
    );

  program
    .command("comments:get")
    .summary("fetch a single comment")
    .description("Fetch a single comment by its bundle.social id.")
    .argument("<id>", "comment id")
    .action(
      safeAction(async (id: string, _opts: unknown, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        emitResult(await ctx.client.comment.commentGet({ id }), ctx.pretty);
      }),
    );

  program
    .command("comments:delete")
    .summary("delete a comment")
    .description("Delete a comment by its bundle.social id.")
    .argument("<id>", "comment id")
    .action(
      safeAction(async (id: string, _opts: unknown, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        emitResult(await ctx.client.comment.commentDelete({ id }), ctx.pretty);
      }),
    );

  program
    .command("comments:import")
    .summary("start importing comments for a post")
    .description(
      "Start an async import of the comments on a post for one platform. Supported: FACEBOOK, INSTAGRAM, LINKEDIN, YOUTUBE, TIKTOK, REDDIT, THREADS, MASTODON, BLUESKY.",
    )
    .requiredOption("--post-id <id>", "id of the post whose comments to import")
    .requiredOption("-p, --platform <platform>", "platform to import comments from")
    .action(
      safeAction(async (opts: { postId: string; platform: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);
        emitResult(
          await ctx.client.comment.commentImportCreate({
            requestBody: {
              teamId,
              postId: opts.postId,
              socialAccountType: normalizePlatform(opts.platform) as CommentImportPlatform,
            },
          }),
          ctx.pretty,
        );
      }),
    );

  program
    .command("comments:imports")
    .summary("list comment imports")
    .description("List comment-import jobs for the team, optionally filtered by post and status.")
    .option("--post-id <id>", "only imports for this post")
    .option("--status <status>", "filter: PENDING | FETCHING | RETRYING | COMPLETED | SKIPPED | FAILED | RATE_LIMITED")
    .option("--limit <n>", "max number of imports to return")
    .option("--offset <n>", "number of imports to skip")
    .action(
      safeAction(async (opts: { postId?: string; status?: string; limit?: string; offset?: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);
        const query: CommentImportGetListData = {
          teamId,
          postId: opts.postId,
          status: opts.status ? (opts.status.trim().toUpperCase() as CommentImportGetListData["status"]) : undefined,
          limit: opts.limit !== undefined ? Number(opts.limit) : undefined,
          offset: opts.offset !== undefined ? Number(opts.offset) : undefined,
        };
        emitResult(await ctx.client.comment.commentImportGetList(query), ctx.pretty);
      }),
    );

  program
    .command("comments:import:get")
    .summary("fetch a comment import")
    .description("Fetch a single comment-import job by its id.")
    .argument("<importId>", "comment import id")
    .action(
      safeAction(async (importId: string, _opts: unknown, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        emitResult(await ctx.client.comment.commentImportGetById({ importId }), ctx.pretty);
      }),
    );

  program
    .command("comments:import:comments")
    .summary("list fetched comments for a post")
    .description("List the comments fetched (via comments:import) for a post, optionally filtered by platform / connected account.")
    .requiredOption("--post-id <id>", "id of the post")
    .option("-p, --platform <platform>", "limit to a single platform")
    .option("--social-account-id <id>", "limit to a single connected account id")
    .option("--limit <n>", "max number of comments to return")
    .option("--offset <n>", "number of comments to skip")
    .action(
      safeAction(
        async (
          opts: { postId: string; platform?: string; socialAccountId?: string; limit?: string; offset?: string },
          command: Command,
        ) => {
          const ctx = createContext(command.optsWithGlobals());
          const teamId = await resolveTeamId(ctx);
          const query: CommentImportGetFetchedCommentsData = {
            teamId,
            postId: opts.postId,
            platform: opts.platform
              ? (normalizePlatform(opts.platform) as CommentImportGetFetchedCommentsData["platform"])
              : undefined,
            socialAccountId: opts.socialAccountId,
            limit: opts.limit !== undefined ? Number(opts.limit) : undefined,
            offset: opts.offset !== undefined ? Number(opts.offset) : undefined,
          };
          emitResult(await ctx.client.comment.commentImportGetFetchedComments(query), ctx.pretty);
        },
      ),
    );
}
