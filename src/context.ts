import { Bundlesocial, OpenAPI } from "bundlesocial";
import { CliError } from "./output";

export const DEFAULT_API_URL = "https://api.bundle.social";
export const DASHBOARD_API_KEYS_URL = "https://bundle.social/dashboard/organization/api-keys";
export const DASHBOARD_SOCIAL_ACCOUNTS_URL = "https://bundle.social/dashboard/general/social-accounts";

/** Global options shared by every command (parsed by commander on the root program). */
export interface GlobalOptions {
  apiKey?: string;
  apiUrl?: string;
  teamId?: string;
  pretty?: boolean;
}

export interface CliContext {
  client: Bundlesocial;
  apiUrl: string;
  pretty: boolean;
  /** Team id explicitly provided via `--team-id` or `BUNDLESOCIAL_TEAM_ID`, if any. */
  explicitTeamId?: string;
}

export function resolveApiUrl(opts: GlobalOptions): string {
  return opts.apiUrl ?? process.env.BUNDLESOCIAL_API_URL ?? DEFAULT_API_URL;
}

export function resolveApiKey(opts: GlobalOptions): string {
  const apiKey = opts.apiKey ?? process.env.BUNDLESOCIAL_API_KEY;
  if (!apiKey) {
    throw new CliError(
      "MISSING_API_KEY",
      `No API key found. Set the BUNDLESOCIAL_API_KEY environment variable (or pass --api-key). Create an API key in the bundle.social dashboard: ${DASHBOARD_API_KEYS_URL}`,
      { dashboardUrl: DASHBOARD_API_KEYS_URL },
    );
  }
  return apiKey;
}

export function resolveExplicitTeamId(opts: GlobalOptions): string | undefined {
  return opts.teamId ?? process.env.BUNDLESOCIAL_TEAM_ID ?? undefined;
}

export function createClient(apiKey: string, apiUrl: string): Bundlesocial {
  return new Bundlesocial(apiKey, { ...OpenAPI, BASE: apiUrl });
}

/** Build the context used by every command action. Throws if no API key is configured. */
export function createContext(opts: GlobalOptions): CliContext {
  const apiUrl = resolveApiUrl(opts);
  const apiKey = resolveApiKey(opts);
  return {
    client: createClient(apiKey, apiUrl),
    apiUrl,
    pretty: Boolean(opts.pretty),
    explicitTeamId: resolveExplicitTeamId(opts),
  };
}

/**
 * Determine which team to operate on. Uses `--team-id` / `BUNDLESOCIAL_TEAM_ID`
 * when set; otherwise falls back to the organization's only team. Throws a
 * clear error (listing teams) when the organization has more than one.
 */
export async function resolveTeamId(ctx: CliContext): Promise<string> {
  if (ctx.explicitTeamId) return ctx.explicitTeamId;
  const organization = await ctx.client.organization.organizationGetOrganization();
  const teams = organization.teams ?? [];
  if (teams.length === 1) return teams[0].id;
  if (teams.length === 0) {
    throw new CliError(
      "NO_TEAMS",
      "This organization has no teams yet. Create one in the bundle.social dashboard first.",
    );
  }
  throw new CliError(
    "TEAM_ID_REQUIRED",
    `This organization has ${teams.length} teams. Pick one with --team-id or the BUNDLESOCIAL_TEAM_ID environment variable.`,
    { teams: teams.map((team) => ({ id: team.id, name: team.name })) },
  );
}
