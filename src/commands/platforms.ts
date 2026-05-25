import type { Command } from "commander";
import { safeAction } from "../program";
import { CliError, emitResult } from "../output";
import {
  MEDIA_NOTES,
  PLATFORM_REFERENCE,
  type PlatformReferenceEntry,
} from "../platform-reference";
import { PLATFORMS, tryNormalizePlatform } from "../platforms";

type Operation = "post" | "comment";

/** Narrow an entry to a single operation, or return it whole. */
function projectEntry(entry: PlatformReferenceEntry, operation?: Operation): Record<string, unknown> {
  const base = {
    platform: entry.platform,
    label: entry.label,
    aliases: entry.aliases,
    capabilities: entry.capabilities,
    notes: entry.notes,
  };
  if (operation === "post") {
    return { ...base, post: entry.post };
  }
  if (operation === "comment") {
    return {
      ...base,
      comment: entry.comment ?? {
        supported: false,
        message: `Comments are not available on ${entry.label} via the bundle.social API.`,
      },
    };
  }
  return { ...base, post: entry.post, ...(entry.comment ? { comment: entry.comment } : {}) };
}

export function registerPlatformsCommands(program: Command): void {
  program
    .command("platforms:describe")
    .summary("describe a platform's per-platform field schema")
    .description(
      "Look up the exact per-platform `data.<PLATFORM>` fields the bundle.social API accepts — for posting AND commenting — so you can build a correct `--data` / `--platform-settings` object instead of guessing.\n" +
        "Pass a <platform> (name or alias, e.g. reddit, x, gbp) for one platform, or omit it for every platform. " +
        "Use --operation post|comment to narrow the output. Each field lists its name, type, whether it is required and notes; each platform also reports its capabilities and a ready-to-use example. " +
        "This command is offline — it needs no API key.",
    )
    .argument("[platform]", "platform name/alias to describe (e.g. reddit, x, tiktok, gbp); omit for all")
    .option("--operation <op>", "which operation to describe: post | comment (omit for both)")
    .action(
      safeAction(async (platform: string | undefined, opts: { operation?: string }, command: Command) => {
        const pretty = Boolean(command.optsWithGlobals().pretty);

        let operation: Operation | undefined;
        if (opts.operation !== undefined) {
          const value = opts.operation.trim().toLowerCase();
          if (value !== "post" && value !== "comment") {
            throw new CliError("INVALID_OPERATION", `--operation must be "post" or "comment", got "${opts.operation}".`);
          }
          operation = value;
        }

        if (platform) {
          const normalized = tryNormalizePlatform(platform);
          if (!normalized) {
            throw new CliError(
              "UNKNOWN_PLATFORM",
              `Unknown platform "${platform}". Supported: ${PLATFORMS.join(", ")} (aliases like "x" and "gbp" are accepted too).`,
              { supportedPlatforms: PLATFORMS },
            );
          }
          emitResult(
            { platform: projectEntry(PLATFORM_REFERENCE[normalized], operation), mediaNotes: MEDIA_NOTES },
            pretty,
          );
          return;
        }

        emitResult(
          {
            platforms: PLATFORMS.map((name) => projectEntry(PLATFORM_REFERENCE[name], operation)),
            mediaNotes: MEDIA_NOTES,
            hint: 'Pass a <platform> (e.g. reddit) to focus on one, or --operation post|comment to narrow the output.',
          },
          pretty,
        );
      }),
    );
}
