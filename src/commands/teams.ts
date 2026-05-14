import type { Command } from "commander";
import type { TeamCreateTeamData, TeamGetListData, TeamUpdateTeamData } from "bundlesocial";
import { safeAction } from "../program";
import { createContext } from "../context";
import { CliError, emitResult } from "../output";
import { resolveDataArgument } from "../post-data";

type TeamCreateBody = NonNullable<TeamCreateTeamData["requestBody"]>;
type TeamUpdateBody = NonNullable<TeamUpdateTeamData["requestBody"]>;

export function registerTeamsCommands(program: Command): void {
  program
    .command("teams:list")
    .summary("list teams in the organization")
    .description("List the teams in your organization, with optional search and pagination.")
    .option("--limit <n>", "max number of teams to return")
    .option("--offset <n>", "number of teams to skip")
    .option("-q, --query <text>", "free-text search over team names")
    .action(
      safeAction(async (opts: { limit?: string; offset?: string; query?: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const query: TeamGetListData = {
          limit: opts.limit !== undefined ? Number(opts.limit) : undefined,
          offset: opts.offset !== undefined ? Number(opts.offset) : undefined,
          search: opts.query,
        };
        emitResult(await ctx.client.team.teamGetList(query), ctx.pretty);
      }),
    );

  program
    .command("teams:get")
    .summary("fetch a single team")
    .description("Fetch a single team by id, including its organization, connected social accounts and bio.")
    .argument("<id>", "team id")
    .action(
      safeAction(async (id: string, _opts: unknown, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        emitResult(await ctx.client.team.teamGetTeam({ id }), ctx.pretty);
      }),
    );

  program
    .command("teams:create")
    .summary("create a new team")
    .description("Create a new team in your organization. Pass --name (required), optionally --avatar-url and --copy-team-id to clone another team's connected accounts.")
    .option("--name <name>", "team name")
    .option("--avatar-url <url>", "team avatar URL")
    .option("--copy-team-id <id>", "id of an existing team to copy social accounts from")
    .option("--data <json>", "advanced: the full request body as JSON; overrides the other options")
    .option("--data-file <path>", "advanced: read the full request body from a JSON file")
    .action(
      safeAction(
        async (
          opts: { name?: string; avatarUrl?: string; copyTeamId?: string; data?: string; dataFile?: string },
          command: Command,
        ) => {
          const ctx = createContext(command.optsWithGlobals());
          const dataArg = resolveDataArgument(opts.data, opts.dataFile);
          let requestBody: TeamCreateBody;
          if (dataArg) {
            requestBody = dataArg as unknown as TeamCreateBody;
          } else {
            if (!opts.name) throw new CliError("MISSING_NAME", "Provide --name for the new team (or pass --data / --data-file).");
            requestBody = {
              name: opts.name,
              ...(opts.avatarUrl !== undefined ? { avatarUrl: opts.avatarUrl } : {}),
              ...(opts.copyTeamId !== undefined ? { copyTeamId: opts.copyTeamId } : {}),
            };
          }
          emitResult(await ctx.client.team.teamCreateTeam({ requestBody }), ctx.pretty);
        },
      ),
    );

  program
    .command("teams:update")
    .summary("update a team")
    .description("Update a team by id — only the fields you pass are changed (name and/or avatar URL).")
    .argument("<id>", "team id")
    .option("--name <name>", "new team name")
    .option("--avatar-url <url>", "new team avatar URL (pass an empty string to clear)")
    .option("--data <json>", "advanced: the full request body as JSON; overrides the other options")
    .option("--data-file <path>", "advanced: read the full request body from a JSON file")
    .action(
      safeAction(
        async (id: string, opts: { name?: string; avatarUrl?: string; data?: string; dataFile?: string }, command: Command) => {
          const ctx = createContext(command.optsWithGlobals());
          const dataArg = resolveDataArgument(opts.data, opts.dataFile);
          let requestBody: TeamUpdateBody;
          if (dataArg) {
            requestBody = dataArg as unknown as TeamUpdateBody;
          } else {
            requestBody = {};
            if (opts.name !== undefined) requestBody.name = opts.name;
            if (opts.avatarUrl !== undefined) requestBody.avatarUrl = opts.avatarUrl === "" ? null : opts.avatarUrl;
            if (Object.keys(requestBody).length === 0) {
              throw new CliError("NOTHING_TO_UPDATE", "Nothing to update — pass at least one of --name, --avatar-url, --data, --data-file.");
            }
          }
          emitResult(await ctx.client.team.teamUpdateTeam({ id, requestBody }), ctx.pretty);
        },
      ),
    );

  program
    .command("teams:delete")
    .summary("delete a team")
    .description("Delete a team by its id.")
    .argument("<id>", "team id")
    .action(
      safeAction(async (id: string, _opts: unknown, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        emitResult(await ctx.client.team.teamDeleteTeam({ id }), ctx.pretty);
      }),
    );
}
