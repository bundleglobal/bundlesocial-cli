import type { Command } from "commander";
import type { AnalyticsGetSocialAccountAnalyticsData } from "bundlesocial";
import { safeAction } from "../program";
import { createContext, resolveTeamId } from "../context";
import { emitResult, errorSummary } from "../output";
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
    .description("Get engagement metrics for a single post by its bundle.social id.")
    .argument("<post-id>", "post id")
    .option("-p, --platform <platform>", "limit to a single platform (e.g. instagram, tiktok, youtube)")
    .action(
      safeAction(async (postId: string, opts: { platform?: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const response = await ctx.client.analytics.analyticsGetPostAnalytics({
          postId,
          platformType: opts.platform ? normalizeAnalyticsPlatform(opts.platform) : undefined,
        });
        emitResult(response, ctx.pretty);
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
