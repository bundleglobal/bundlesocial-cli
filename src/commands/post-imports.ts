import type { Command } from "commander";
import type { PostImportCreateData, PostImportGetImportedPostsData } from "bundlesocial";
import { safeAction } from "../program";
import { createContext, resolveTeamId } from "../context";
import { CliError, emitResult } from "../output";
import { normalizePlatform } from "../platforms";

type PostImportBody = NonNullable<PostImportCreateData["requestBody"]>;
type PostImportPlatform = PostImportBody["socialAccountType"];
type ImportedPostsPlatform = PostImportGetImportedPostsData["socialAccountType"];

const SURFACES = ["PROFILE_GRID", "NON_GRID", "STORY", "ALL"] as const;
const MEDIA_TYPES = ["VIDEO", "IMAGE"] as const;

export function registerPostImportsCommands(program: Command): void {
  program
    .command("posts:import")
    .summary("start a post-history import")
    .description(
      "Start an async import of a connected account's recent posts (post history) into bundle.social, optionally with analytics. Supported: FACEBOOK, INSTAGRAM, THREADS, TIKTOK, YOUTUBE, LINKEDIN, PINTEREST, REDDIT, MASTODON, BLUESKY.",
    )
    .requiredOption("-p, --platform <platform>", "platform to import from (e.g. instagram, tiktok)")
    .requiredOption("--count <n>", "how many recent posts to import")
    .option("--with-analytics", "also fetch analytics for the imported posts")
    .option("--import-carousels", "import carousel posts (Instagram)")
    .option("--surface <surface>", `Instagram only: ${SURFACES.join(" | ")}`)
    .option("--media-type <type>", `Instagram only: ${MEDIA_TYPES.join(" | ")}`)
    .action(
      safeAction(
        async (
          opts: {
            platform: string;
            count: string;
            withAnalytics?: boolean;
            importCarousels?: boolean;
            surface?: string;
            mediaType?: string;
          },
          command: Command,
        ) => {
          const ctx = createContext(command.optsWithGlobals());
          const teamId = await resolveTeamId(ctx);
          const count = Number(opts.count);
          if (!Number.isFinite(count) || count <= 0) throw new CliError("INVALID_COUNT", "--count must be a positive number.");
          const requestBody: PostImportBody = {
            teamId,
            socialAccountType: normalizePlatform(opts.platform) as PostImportPlatform,
            count,
            ...(opts.withAnalytics ? { withAnalytics: true } : {}),
            ...(opts.importCarousels ? { importCarousels: true } : {}),
            ...(opts.surface ? { surface: opts.surface.trim().toUpperCase() as PostImportBody["surface"] } : {}),
            ...(opts.mediaType ? { mediaType: opts.mediaType.trim().toUpperCase() as PostImportBody["mediaType"] } : {}),
          };
          emitResult(await ctx.client.postImport.postImportCreate({ requestBody }), ctx.pretty);
        },
      ),
    );

  program
    .command("posts:imports")
    .summary("list post-history import statuses")
    .description("List post-history import statuses for the team, optionally filtered by platform.")
    .option("-p, --platform <platform>", "limit to a single platform")
    .action(
      safeAction(async (opts: { platform?: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);
        emitResult(
          await ctx.client.postImport.postImportGetStatus({
            teamId,
            socialAccountType: opts.platform ? (normalizePlatform(opts.platform) as PostImportPlatform) : undefined,
          }),
          ctx.pretty,
        );
      }),
    );

  program
    .command("posts:import:get")
    .summary("fetch a post-history import")
    .description("Fetch a single post-history import by its id.")
    .argument("<importId>", "import id")
    .action(
      safeAction(async (importId: string, _opts: unknown, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        emitResult(await ctx.client.postImport.postImportGetById({ importId }), ctx.pretty);
      }),
    );

  program
    .command("posts:import:posts")
    .summary("list imported posts (with analytics)")
    .description("List the imported posts (with analytics) for a connected account on the team.")
    .requiredOption("-p, --platform <platform>", "platform whose imported posts to list")
    .option("--limit <n>", "max number of posts to return")
    .option("--offset <n>", "number of posts to skip")
    .action(
      safeAction(async (opts: { platform: string; limit?: string; offset?: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);
        const query: PostImportGetImportedPostsData = {
          teamId,
          socialAccountType: normalizePlatform(opts.platform) as ImportedPostsPlatform,
          limit: opts.limit !== undefined ? Number(opts.limit) : undefined,
          offset: opts.offset !== undefined ? Number(opts.offset) : undefined,
        };
        emitResult(await ctx.client.postImport.postImportGetImportedPosts(query), ctx.pretty);
      }),
    );

  program
    .command("posts:import:delete-posts")
    .summary("bulk-delete imported posts")
    .description("Bulk-delete imported posts (and their analytics) by id. Pass --id once per post.")
    .requiredOption("--id <id...>", "imported post id; repeatable")
    .action(
      safeAction(async (opts: { id: string[] }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);
        emitResult(
          await ctx.client.postImport.postImportDeleteImportedPosts({ requestBody: { teamId, postIds: opts.id } }),
          ctx.pretty,
        );
      }),
    );

  program
    .command("posts:import:retry")
    .summary("retry a failed post-history import")
    .description("Retry a failed post-history import by its id.")
    .argument("<importId>", "import id")
    .action(
      safeAction(async (importId: string, _opts: unknown, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);
        emitResult(await ctx.client.postImport.postImportRetryImport({ importId, requestBody: { teamId } }), ctx.pretty);
      }),
    );
}
