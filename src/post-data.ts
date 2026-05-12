import fs from "node:fs";
import type { Bundlesocial } from "bundlesocial";
import { CliError } from "./output";
import { PLATFORMS, type Platform, tryNormalizePlatform } from "./platforms";

export function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new CliError("INVALID_JSON", `${label} is not valid JSON: ${(error as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new CliError("INVALID_JSON", `${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

/** Read and parse a JSON object from a file (used by `--data-file`). */
export function readJsonObjectFromFile(filePath: string, label: string): Record<string, unknown> {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    throw new CliError("FILE_NOT_FOUND", `Could not read ${label} file: ${filePath}`, { path: filePath });
  }
  return parseJsonObject(raw, label);
}

/** Optionally read JSON: prefer `--data` (inline), then `--data-file` (path), else undefined. */
export function resolveDataArgument(dataJson: string | undefined, dataFile: string | undefined): Record<string, unknown> | undefined {
  if (dataJson) return parseJsonObject(dataJson, "--data");
  if (dataFile) return readJsonObjectFromFile(dataFile, "--data-file");
  return undefined;
}

/**
 * Resolve the `--integration-id` / `--platform` values to a unique list of
 * platforms. A value is used directly when it is a recognised platform name (or
 * alias such as `x`/`gbp`); otherwise it is treated as a connected social
 * account id and resolved to its platform via the team's integrations.
 */
export async function resolveTargetPlatforms(
  client: Bundlesocial,
  teamId: string,
  rawTargets: string[],
): Promise<Platform[]> {
  const resolved = new Set<Platform>();
  const accountIds: string[] = [];

  for (const raw of rawTargets) {
    const platform = tryNormalizePlatform(raw);
    if (platform) resolved.add(platform);
    else accountIds.push(raw.trim());
  }

  if (accountIds.length > 0) {
    const team = await client.team.teamGetTeam({ id: teamId });
    const accounts = team.socialAccounts ?? [];
    for (const id of accountIds) {
      const account = accounts.find((candidate) => candidate.id === id);
      if (!account) {
        throw new CliError(
          "INTEGRATION_NOT_FOUND",
          `No connected integration with id "${id}" in team ${teamId}. Run "bundle-social integrations:list" to see ids, or pass a platform name like "x" or "tiktok".`,
          { availableIntegrations: accounts.map((a) => ({ id: a.id, type: a.type, username: a.username })) },
        );
      }
      resolved.add(account.type as Platform);
    }
  }

  return [...resolved];
}

function isPlatformKeyedObject(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => PLATFORMS.includes(key.trim().toUpperCase() as Platform));
}

/**
 * Split `--platform-settings` into per-platform option objects. Accepts two
 * shapes: a map keyed by platform name (`{ "TIKTOK": { ... } }`) or a flat
 * object that is applied to every targeted platform.
 */
function expandPlatformSettings(
  raw: string | undefined,
  platforms: Platform[],
): Record<Platform, Record<string, unknown>> {
  const result = Object.fromEntries(platforms.map((p) => [p, {}])) as Record<Platform, Record<string, unknown>>;
  if (!raw) return result;
  const settings = parseJsonObject(raw, "--platform-settings");
  if (isPlatformKeyedObject(settings)) {
    for (const [key, value] of Object.entries(settings)) {
      const platform = key.trim().toUpperCase() as Platform;
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new CliError("INVALID_JSON", `--platform-settings.${key} must be a JSON object.`);
      }
      if (platform in result) result[platform] = { ...result[platform], ...(value as Record<string, unknown>) };
    }
    return result;
  }
  for (const platform of platforms) result[platform] = { ...settings };
  return result;
}

export interface BuildPostDataInput {
  content?: string;
  mediaUploadIds: string[];
  platformSettings?: string;
  /** Advanced escape hatch: the full `data` object (already parsed, e.g. from --data / --data-file). */
  data?: Record<string, unknown>;
}

/**
 * Build the `data` object the API expects, one entry per targeted platform,
 * merging the shared `--content`, uploaded media ids and per-platform settings.
 * Platform-specific required fields (e.g. Reddit `sr`, Pinterest `boardName`)
 * must be supplied via `--platform-settings` or `--data` / `--data-file`.
 */
export function buildPostData(platforms: Platform[], input: BuildPostDataInput): Record<string, unknown> {
  if (input.data) return input.data;
  const perPlatform = expandPlatformSettings(input.platformSettings, platforms);
  const data: Record<string, unknown> = {};
  for (const platform of platforms) {
    data[platform] = {
      ...(input.content !== undefined ? { text: input.content } : {}),
      ...(input.mediaUploadIds.length > 0 ? { uploadIds: input.mediaUploadIds } : {}),
      ...perPlatform[platform],
    };
  }
  return data;
}

/** Derive a sensible post title from the content when `--title` is not given. */
export function deriveTitle(content: string | undefined): string {
  const firstLine = (content ?? "").split("\n").map((line) => line.trim()).find((line) => line.length > 0);
  if (!firstLine) return "Untitled post";
  return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine;
}

/** Validate and normalize an ISO 8601 date string, throwing a friendly error on miss. */
export function toIsoDate(value: string, label: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new CliError("INVALID_DATE", `${label} is not a valid ISO 8601 date/time: "${value}". Example: 2026-06-01T09:00:00Z`);
  }
  return date.toISOString();
}
