import type { Command } from "commander";
import { safeAction } from "../program";
import { createContext, listAllTeams, resolveTeamId, type CliContext } from "../context";
import { CliError, emitResult } from "../output";
import { API_ACTIONS, describeApiAction, findApiAction, runApiAction, searchApiActions } from "../api-actions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A team id or an exact team name (case-insensitive); nothing falls back to --team-id or the only team. */
async function resolveTeam(ctx: CliContext, value?: string): Promise<string> {
  if (!value) return resolveTeamId(ctx);
  if (UUID_RE.test(value)) return value;
  const teams = await listAllTeams(ctx.client);
  const match = teams.filter((team) => team.id === value || team.name?.trim().toLowerCase() === value.toLowerCase());
  if (match.length === 1) return match[0].id;
  throw new CliError(match.length ? "TEAM_AMBIGUOUS" : "TEAM_NOT_FOUND", `No single team with id or name "${value}".`, {
    teams: teams.map((team) => ({ id: team.id, name: team.name })),
  });
}

function parseParams(data: string | undefined, pairs: string[]): Record<string, unknown> {
  let params: Record<string, unknown> = {};
  if (data) {
    try {
      params = JSON.parse(data);
    } catch {
      throw new CliError("INVALID_JSON", "--data must be a JSON object.");
    }
    if (!params || typeof params !== "object" || Array.isArray(params)) {
      throw new CliError("INVALID_JSON", "--data must be a JSON object.");
    }
  }
  for (const pair of pairs) {
    const index = pair.indexOf("=");
    if (index < 1) throw new CliError("INVALID_PARAM", `--param must look like key=value (got "${pair}").`);
    const raw = pair.slice(index + 1);
    // Numbers, booleans, arrays and objects are written as JSON; anything else stays a string.
    let value: unknown = raw;
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw;
    }
    params[pair.slice(0, index)] = value;
  }
  return params;
}

const collect = (value: string, previous: string[] = []) => [...previous, value];

export function registerApiCommands(program: Command): void {
  program
    .command("api:actions")
    .summary("list every API action")
    .description(
      `List the ${API_ACTIONS.length} bundle.social API actions, including ones no dedicated command covers (editing or deleting published posts per platform, YouTube playlists, Google Business profile and reviews, Facebook recommendations, direct messages, automations, credits). Pass words to search; a narrow search shows each action's parameters. Run one with api:call.`,
    )
    .argument("[query...]", 'words to match, e.g. "youtube playlist"')
    .option("--read-only", "only actions that read data")
    .option("--writes", "only actions that change data")
    .action(
      safeAction(async (query: string[], opts: { readOnly?: boolean; writes?: boolean }, command: Command) => {
        const { pretty } = command.optsWithGlobals() as { pretty?: boolean };
        const readOnly = opts.readOnly ? true : opts.writes ? false : undefined;
        const matches = searchApiActions(query.join(" "), { readOnly });
        const detailed = query.length > 0 && matches.length <= 25;
        emitResult({ total: matches.length, actions: matches.map((action) => describeApiAction(action, detailed)) }, Boolean(pretty));
      }),
    );

  program
    .command("api:call")
    .summary("run any API action")
    .description(
      'Run one API action by id (see api:actions). Pass parameters as JSON with --data and/or one --param key=value per field; path, query and body fields go side by side. teamId takes a team id or name and defaults to --team-id or the only team. Example: bundlesocial api:call misc.youtube-edit-video --param postId=post_123 --param title="New title"',
    )
    .argument("<action>", "action id, e.g. misc.google-business-get-reviews")
    .option("--data <json>", "parameters as a JSON object")
    .option("--param <key=value>", "one parameter; repeatable", collect, [])
    .action(
      safeAction(async (actionId: string, opts: { data?: string; param: string[] }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const action = findApiAction(actionId);
        const result = await runApiAction(ctx.client, action, parseParams(opts.data, opts.param), (value) =>
          resolveTeam(ctx, value),
        );
        emitResult(result ?? { ok: true }, ctx.pretty);
      }),
    );

  program
    .command("credits:balance")
    .summary("prepaid credit balance")
    .description("The organization's prepaid credit balance for X (Twitter) pay-per-use actions: settled funds, holds and the available amount.")
    .action(
      safeAction(async (_opts: unknown, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        emitResult(await ctx.client.credit.creditGetCreditBalance(), ctx.pretty);
      }),
    );

  program
    .command("credits:quote")
    .summary("price planned X actions")
    .description(
      "Price planned X (Twitter) actions before running them. Pass the quote fields with --data or --param (see `bundlesocial api:actions quote`).",
    )
    .option("--data <json>", "quote fields as a JSON object")
    .option("--param <key=value>", "one field; repeatable", collect, [])
    .action(
      safeAction(async (opts: { data?: string; param: string[] }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const result = await runApiAction(
          ctx.client,
          findApiAction("credit.quote-billable-usage"),
          parseParams(opts.data, opts.param),
          (value) => resolveTeam(ctx, value),
        );
        emitResult(result, ctx.pretty);
      }),
    );
}
