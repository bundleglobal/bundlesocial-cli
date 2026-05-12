import { CliError } from "./output";

/**
 * Every platform bundle.social can post to. Mirrors the `socialAccountTypes`
 * enum in the bundle.social API.
 */
export const PLATFORMS = [
  "TIKTOK",
  "YOUTUBE",
  "INSTAGRAM",
  "FACEBOOK",
  "TWITTER",
  "THREADS",
  "LINKEDIN",
  "PINTEREST",
  "REDDIT",
  "MASTODON",
  "DISCORD",
  "SLACK",
  "BLUESKY",
  "GOOGLE_BUSINESS",
] as const;

export type Platform = (typeof PLATFORMS)[number];

/**
 * Platforms for which the API exposes analytics. TWITTER/X, DISCORD and SLACK
 * are intentionally absent — the API does not return analytics for them.
 */
export const ANALYTICS_PLATFORMS = [
  "TIKTOK",
  "YOUTUBE",
  "INSTAGRAM",
  "FACEBOOK",
  "THREADS",
  "REDDIT",
  "PINTEREST",
  "MASTODON",
  "LINKEDIN",
  "BLUESKY",
  "GOOGLE_BUSINESS",
] as const;

export type AnalyticsPlatform = (typeof ANALYTICS_PLATFORMS)[number];

/**
 * Platforms on which the API can post comments. TWITTER/X, PINTEREST and
 * GOOGLE_BUSINESS are intentionally absent — the API does not post comments
 * for them.
 */
export const COMMENT_PLATFORMS = [
  "TIKTOK",
  "YOUTUBE",
  "INSTAGRAM",
  "FACEBOOK",
  "THREADS",
  "LINKEDIN",
  "REDDIT",
  "MASTODON",
  "DISCORD",
  "SLACK",
  "BLUESKY",
] as const;

export type CommentPlatform = (typeof COMMENT_PLATFORMS)[number];

export function isCommentPlatform(platform: string): platform is CommentPlatform {
  return (COMMENT_PLATFORMS as readonly string[]).includes(platform);
}

const ALIASES: Record<string, Platform> = {
  X: "TWITTER",
  TWITTER: "TWITTER",
  TIKTOK: "TIKTOK",
  TT: "TIKTOK",
  YOUTUBE: "YOUTUBE",
  YT: "YOUTUBE",
  INSTAGRAM: "INSTAGRAM",
  IG: "INSTAGRAM",
  INSTA: "INSTAGRAM",
  FACEBOOK: "FACEBOOK",
  FB: "FACEBOOK",
  THREADS: "THREADS",
  LINKEDIN: "LINKEDIN",
  LI: "LINKEDIN",
  PINTEREST: "PINTEREST",
  PIN: "PINTEREST",
  REDDIT: "REDDIT",
  MASTODON: "MASTODON",
  MASTO: "MASTODON",
  DISCORD: "DISCORD",
  SLACK: "SLACK",
  BLUESKY: "BLUESKY",
  BSKY: "BLUESKY",
  GOOGLE_BUSINESS: "GOOGLE_BUSINESS",
  "GOOGLE-BUSINESS": "GOOGLE_BUSINESS",
  GBP: "GOOGLE_BUSINESS",
  GOOGLEBUSINESS: "GOOGLE_BUSINESS",
  GMB: "GOOGLE_BUSINESS",
};

/** Returns the canonical platform for an alias, or `undefined` if unknown. */
export function tryNormalizePlatform(input: string): Platform | undefined {
  return ALIASES[input.trim().toUpperCase().replace(/\s+/g, "_")];
}

/** Like {@link tryNormalizePlatform} but throws a friendly CliError on miss. */
export function normalizePlatform(input: string): Platform {
  const platform = tryNormalizePlatform(input);
  if (!platform) {
    throw new CliError(
      "UNKNOWN_PLATFORM",
      `Unknown platform "${input}". Supported: ${PLATFORMS.join(", ")} (aliases like "x" and "gbp" are accepted too).`,
    );
  }
  return platform;
}

/** Resolve a platform name and assert that the API has analytics for it. */
export function normalizeAnalyticsPlatform(input: string): AnalyticsPlatform {
  const platform = normalizePlatform(input);
  if (!(ANALYTICS_PLATFORMS as readonly string[]).includes(platform)) {
    throw new CliError(
      "ANALYTICS_NOT_SUPPORTED",
      `Analytics are not available for ${platform}. Supported: ${ANALYTICS_PLATFORMS.join(", ")}.`,
    );
  }
  return platform as AnalyticsPlatform;
}

export function isAnalyticsPlatform(platform: string): platform is AnalyticsPlatform {
  return (ANALYTICS_PLATFORMS as readonly string[]).includes(platform);
}
