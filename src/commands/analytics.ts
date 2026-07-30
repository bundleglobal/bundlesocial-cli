import type { Command } from "commander";
import type { AnalyticsGetSocialAccountAnalyticsData } from "bundlesocial";
import { safeAction } from "../program";
import { createContext, resolveTeamId } from "../context";
import { CliError, emitResult, errorSummary } from "../output";
import { isAnalyticsPlatform, normalizeAnalyticsPlatform } from "../platforms";

type AnalyticsPlatform = AnalyticsGetSocialAccountAnalyticsData["platformType"];

function withinRange(value: string | null | undefined, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  if (from && time < new Date(from).getTime()) return false;
  if (to && time > new Date(to).getTime()) return false;
  return true;
}

export function registerAnalyticsCommands(program: Command): void {
  program
    .command("analytics:post")
    .summary("engagement metrics for a single post")
    .description(
      "Get engagement metrics for a single post — either a post you created (its bundle.social id) or one pulled in by posts:import (--imported-post-id). Use --raw for the unprocessed provider payload.",
    )
    .argument("[post-id]", "post id (omit when using --imported-post-id)")
    .option("--imported-post-id <id>", "analytics for an imported (post-history) post instead of a bundle.social post")
    .option("-p, --platform <platform>", "limit to a single platform (e.g. instagram, tiktok, youtube)")
    .option("--raw", "return the raw provider analytics payload instead of the normalized metrics")
    .action(
      safeAction(
        async (
          postId: string | undefined,
          opts: { importedPostId?: string; platform?: string; raw?: boolean },
          command: Command,
        ) => {
          const ctx = createContext(command.optsWithGlobals());
          if (!postId && !opts.importedPostId) {
            throw new CliError("NO_POST", "Pass a post id, or --imported-post-id for a post brought in by posts:import.");
          }
          const platformType = opts.platform ? normalizeAnalyticsPlatform(opts.platform) : undefined;
          const query = {
            ...(postId ? { postId } : {}),
            ...(opts.importedPostId ? { importedPostId: opts.importedPostId } : {}),
            platformType,
          };
          const response = opts.raw
            ? await ctx.client.analytics.analyticsGetPostAnalyticsRaw(query)
            : await ctx.client.analytics.analyticsGetPostAnalytics(query);
          emitResult(response, ctx.pretty);
        },
      ),
    );

  program
    .command("analytics:account")
    .summary("analytics for a connected social account")
    .description("Get analytics (follower/engagement snapshots) for a connected social account on the team. Use --raw for the unprocessed provider payload.")
    .requiredOption("-p, --platform <platform>", "platform of the social account (e.g. instagram, tiktok, youtube)")
    .option("--raw", "return the raw provider analytics payload instead of the normalized snapshots")
    .action(
      safeAction(async (opts: { platform: string; raw?: boolean }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);
        const platformType = normalizeAnalyticsPlatform(opts.platform) as AnalyticsPlatform;
        const response = opts.raw
          ? await ctx.client.analytics.analyticsGetSocialAccountAnalyticsRaw({ teamId, platformType })
          : await ctx.client.analytics.analyticsGetSocialAccountAnalytics({ teamId, platformType });
        emitResult(response, ctx.pretty);
      }),
    );

  program
    .command("analytics:bulk")
    .summary("engagement metrics for multiple posts")
    .description("Get analytics for multiple posts in one request (max 60 posts, paginated 20 per page). Pass --post-id once per post.")
    .requiredOption("-p, --platform <platform>", "platform of the posts (e.g. instagram, tiktok, youtube)")
    .requiredOption("--post-id <id...>", "post id; repeatable (max 60)")
    .option("--page <n>", "page number")
    .option("--limit <n>", "items per page")
    .action(
      safeAction(async (opts: { platform: string; postId: string[]; page?: string; limit?: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        emitResult(
          await ctx.client.analytics.analyticsGetBulkPostAnalytics({
            postIds: opts.postId,
            platformType: normalizeAnalyticsPlatform(opts.platform) as AnalyticsPlatform,
            page: opts.page !== undefined ? Number(opts.page) : undefined,
            limit: opts.limit !== undefined ? Number(opts.limit) : undefined,
          }),
          ctx.pretty,
        );
      }),
    );

  program
    .command("analytics:refresh")
    .summary("force-refresh analytics")
    .description("Force a refresh of analytics. Pass --post-id to refresh a post's analytics; otherwise pass --platform to refresh a connected social account's analytics.")
    .option("--post-id <id>", "post id to force-refresh analytics for")
    .option("-p, --platform <platform>", "platform of the social account (or, with --post-id, the post's platform)")
    .action(
      safeAction(async (opts: { postId?: string; platform?: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        if (opts.postId) {
          emitResult(
            await ctx.client.analytics.analyticsForcePostAnalytics({
              requestBody: {
                postId: opts.postId,
                platformType: opts.platform ? (normalizeAnalyticsPlatform(opts.platform) as AnalyticsPlatform) : undefined,
              },
            }),
            ctx.pretty,
          );
          return;
        }
        if (!opts.platform) {
          throw new CliError("NO_TARGET", "Pass --post-id to refresh a post, or --platform to refresh a connected social account.");
        }
        const teamId = await resolveTeamId(ctx);
        emitResult(
          await ctx.client.analytics.analyticsForceSocialAccountAnalytics({
            requestBody: { teamId, platformType: normalizeAnalyticsPlatform(opts.platform) as AnalyticsPlatform },
          }),
          ctx.pretty,
        );
      }),
    );

  program
    .command("analytics:summary")
    .summary("organization-level analytics summary")
    .description("Organization-level analytics: posts/comments/uploads usage for the org, plus the latest analytics snapshot for each connected integration on the team. Use --from / --to to pick the snapshot from a date range.")
    .option("--from <iso8601>", "start of the range used to select analytics snapshots")
    .option("--to <iso8601>", "end of the range used to select analytics snapshots")
    .action(
      safeAction(async (opts: { from?: string; to?: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);

        const [organization, team, postsUsage, commentsUsage, uploadsUsage] = await Promise.all([
          ctx.client.organization.organizationGetOrganization(),
          ctx.client.team.teamGetTeam({ id: teamId }),
          ctx.client.organization.organizationGetPostsUsage().catch(() => null),
          ctx.client.organization.organizationGetCommentsUsage().catch(() => null),
          ctx.client.organization.organizationGetUploadsUsage().catch(() => null),
        ]);

        const accounts = team.socialAccounts ?? [];
        const integrations: Array<Record<string, unknown>> = [];
        for (const account of accounts) {
          const base = { id: account.id, type: account.type, username: account.username ?? null };
          if (!isAnalyticsPlatform(account.type)) {
            integrations.push({ ...base, analytics: null, note: "analytics not available for this platform" });
            continue;
          }
          try {
            const result = await ctx.client.analytics.analyticsGetSocialAccountAnalytics({
              teamId,
              platformType: account.type as AnalyticsPlatform,
            });
            const items = (result.items ?? []).filter((item) => withinRange(item.createdAt, opts.from, opts.to));
            integrations.push({ ...base, latest: items[items.length - 1] ?? null, dataPoints: items.length });
          } catch (error) {
            integrations.push({ ...base, analytics: null, error: errorSummary(error) });
          }
        }

        emitResult(
          {
            organization: { id: organization.id, name: organization.name ?? null },
            team: { id: team.id, name: team.name },
            range: { from: opts.from ?? null, to: opts.to ?? null },
            usage: { posts: postsUsage, comments: commentsUsage, uploads: uploadsUsage },
            integrations,
          },
          ctx.pretty,
        );
      }),
    );
}
