import type { Command } from "commander";
import type { OrganizationGetImportsUsageData } from "bundlesocial";
import { safeAction } from "../program";
import { createContext, resolveExplicitTeamId } from "../context";
import { emitResult } from "../output";
import { normalizePlatform } from "../platforms";

type ImportsUsagePlatform = NonNullable<OrganizationGetImportsUsageData["socialAccountType"]>;

export function registerOrgCommands(program: Command): void {
  program
    .command("org:get")
    .summary("fetch your organization")
    .description("Fetch your organization — id, name, plan limits, feature flags and the list of teams.")
    .action(
      safeAction(async (_opts: unknown, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        emitResult(await ctx.client.organization.organizationGetOrganization(), ctx.pretty);
      }),
    );

  program
    .command("org:usage")
    .summary("organization usage / quotas")
    .description(
      "Organization usage and quotas: posts, comments, uploads, and the per-social-account imports breakdown (paginated). Use --page / --page-size / --social-account-type / --social-account-id to filter the imports breakdown; the imports breakdown is scoped to --team-id / BUNDLESOCIAL_TEAM_ID when set.",
    )
    .option("--page <n>", "imports breakdown: page number")
    .option("--page-size <n>", "imports breakdown: items per page")
    .option("--social-account-type <platform>", "imports breakdown: limit to a platform (e.g. instagram, tiktok)")
    .option("--social-account-id <id>", "imports breakdown: limit to a single connected account id")
    .action(
      safeAction(
        async (
          opts: {
            page?: string;
            pageSize?: string;
            socialAccountType?: string;
            socialAccountId?: string;
          },
          command: Command,
        ) => {
          const globalOptions = command.optsWithGlobals();
          const ctx = createContext(globalOptions);
          const importsQuery: OrganizationGetImportsUsageData = {
            page: opts.page !== undefined ? Number(opts.page) : undefined,
            pageSize: opts.pageSize !== undefined ? Number(opts.pageSize) : undefined,
            teamId: resolveExplicitTeamId(globalOptions),
            socialAccountType: opts.socialAccountType
              ? (normalizePlatform(opts.socialAccountType) as ImportsUsagePlatform)
              : undefined,
            socialAccountId: opts.socialAccountId,
          };
          const [posts, comments, uploads, imports] = await Promise.all([
            ctx.client.organization.organizationGetPostsUsage().catch(() => null),
            ctx.client.organization.organizationGetCommentsUsage().catch(() => null),
            ctx.client.organization.organizationGetUploadsUsage().catch(() => null),
            ctx.client.organization.organizationGetImportsUsage(importsQuery).catch(() => null),
          ]);
          emitResult({ posts, comments, uploads, imports }, ctx.pretty);
        },
      ),
    );
}
