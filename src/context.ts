import { Bundlesocial, OpenAPI, type TeamGetListResponse } from "bundlesocial";
import { CliError, logStatus } from "./output";

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

export type TeamListItem = TeamGetListResponse["items"][number];

/** Page size used when listing every team (the API has no hard max; 100 keeps requests small). */
export const TEAM_LIST_PAGE_SIZE = 100;
/** Safety cap on pages fetched by `listAllTeams` (100 x 100 = 10,000 teams). */
export const TEAM_LIST_MAX_PAGES = 100;

/**
 * Fetch every team in the organization via the paginated `GET /team` endpoint.
 * Replaces the deprecated `teams` array on `GET /organization` (removed 2026-11-15).
 */
export async function listAllTeams(
  client: Bundlesocial,
  options: { pageSize?: number; maxPages?: number } = {},
): Promise<TeamListItem[]> {
  const pageSize = options.pageSize ?? TEAM_LIST_PAGE_SIZE;
  const maxPages = options.maxPages ?? TEAM_LIST_MAX_PAGES;
  const teams: TeamListItem[] = [];
  for (let page = 0; page < maxPages; page++) {
    const { items = [], total } = await client.team.teamGetList({ offset: teams.length, limit: pageSize });
    teams.push(...items);
    // Stop on a short/empty page too, so a wrong `total` can never loop forever.
    if (items.length < pageSize || teams.length >= total) return teams;
  }
  logStatus(`Warning: stopped listing teams after ${maxPages} pages (${teams.length} teams); results may be incomplete.`);
  return teams;
}

/**
 * Determine which team to operate on. Uses `--team-id` / `BUNDLESOCIAL_TEAM_ID`
 * when set; otherwise falls back to the organization's only team. Throws a
 * clear error (listing teams) when the organization has more than one.
 */
export async function resolveTeamId(ctx: CliContext): Promise<string> {
  if (ctx.explicitTeamId) return ctx.explicitTeamId;
  const teams = await listAllTeams(ctx.client);
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
