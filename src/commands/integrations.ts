import type { Command } from "commander";
import { safeAction } from "../program";
import { createContext, resolveExplicitTeamId, resolveTeamId, type CliContext } from "../context";
import { emitResult } from "../output";
import { parseJsonObject } from "../post-data";
import { listIntegrationTools, runIntegrationTool } from "../integration-tools";

type SocialAccount = {
  id: string;
  type: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  channels?: Array<{ id: string; name?: string | null; username?: string | null; address?: string | null }> | null;
};

function mapAccounts(accounts: SocialAccount[] | undefined) {
  return (accounts ?? []).map((account) => ({
    id: account.id,
    type: account.type,
    username: account.username ?? null,
    displayName: account.displayName ?? null,
    avatarUrl: account.avatarUrl ?? null,
    channels: (account.channels ?? []).map((channel) => ({
      id: channel.id,
      name: channel.name ?? null,
      username: channel.username ?? null,
      address: channel.address ?? null,
    })),
  }));
}

async function listForTeam(ctx: CliContext, teamId: string) {
  const team = await ctx.client.team.teamGetTeam({ id: teamId });
  return { teamId: team.id, teamName: team.name, integrations: mapAccounts(team.socialAccounts) };
}

export function registerIntegrationsCommands(program: Command): void {
  program
    .command("integrations:list")
    .description("List connected social-media integrations (accounts). Scoped to --team-id / BUNDLESOCIAL_TEAM_ID when set, otherwise the whole organization.")
    .action(
      safeAction(async (_opts: unknown, command: Command) => {
        const globalOptions = command.optsWithGlobals();
        const ctx = createContext(globalOptions);

        const explicitTeamId = resolveExplicitTeamId(globalOptions);
        if (explicitTeamId) {
          emitResult(await listForTeam(ctx, explicitTeamId), ctx.pretty);
          return;
        }

        const organization = await ctx.client.organization.organizationGetOrganization();
        const teams = organization.teams ?? [];
        if (teams.length === 1) {
          emitResult(await listForTeam(ctx, teams[0].id), ctx.pretty);
          return;
        }

        const perTeam = [];
        for (const team of teams) {
          perTeam.push(await listForTeam(ctx, team.id));
        }
        emitResult({ organizationId: organization.id, organizationName: organization.name, teams: perTeam }, ctx.pretty);
      }),
    );

  program
    .command("integrations:tools")
    .summary("list available platform helper tools")
    .description(
      "List the read-only platform helper tools you can call with `integrations:trigger` — e.g. fetch subreddit flairs, YouTube categories/playlists, LinkedIn mentions, Instagram locations, Google Business categories, TikTok trending music. Each entry shows its method id and the params it accepts.",
    )
    .action(
      safeAction(async (_opts: unknown, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        emitResult({ tools: listIntegrationTools() }, ctx.pretty);
      }),
    );

  program
    .command("integrations:trigger")
    .summary("call a platform helper tool")
    .description(
      "Call one of the platform helper tools (see `integrations:tools`) — for example `integrations:trigger reddit:flairs --data '{\"subreddit\":\"r/test\"}'`. Returns the raw result. Use it to discover values the API needs (flair ids, YouTube category ids, LinkedIn mention URNs, locations, etc.).",
    )
    .argument("<method>", "tool method id, e.g. reddit:flairs (run `integrations:tools` to list them)")
    .option("--data <json>", "JSON object of parameters for the tool, e.g. '{\"subreddit\":\"r/test\"}'")
    .action(
      safeAction(async (method: string, opts: { data?: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);
        const params = opts.data ? parseJsonObject(opts.data, "--data") : {};
        emitResult(await runIntegrationTool(ctx.client, teamId, method, params), ctx.pretty);
      }),
    );
}
