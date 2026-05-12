import { Command } from "commander";
import pkg from "../package.json";
import { emitError } from "./output";
import { registerIntegrationsCommands } from "./commands/integrations";
import { registerPostsCommands } from "./commands/posts";
import { registerCommentsCommands } from "./commands/comments";
import { registerMediaCommands } from "./commands/media";
import { registerAnalyticsCommands } from "./commands/analytics";
import { registerDoctorCommand } from "./commands/doctor";

export const VERSION: string = pkg.version;

/**
 * A commander action callback. commander invokes it with the positional args
 * first, then the command's parsed options, then the Command instance — the
 * arity differs per command, so this stays loosely typed at the boundary.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CommanderAction = (...args: any[]) => unknown | Promise<unknown>;

/**
 * Wrap a command action so any thrown error becomes the JSON error envelope on
 * stdout with a non-zero exit code, honouring `--pretty` for the stderr line.
 */
export function safeAction(fn: CommanderAction): (...args: unknown[]) => Promise<void> {
  return async (...args: unknown[]) => {
    const command = args[args.length - 1] as Command;
    const pretty = Boolean(command.optsWithGlobals().pretty);
    try {
      await fn(...args);
    } catch (error) {
      emitError(error, pretty);
    }
  };
}

/**
 * Global options. Added to the root program AND to every subcommand so they
 * work whether placed before or after the command name
 * (`bundle-social --pretty posts:list` and `bundle-social posts:list --pretty`).
 */
function addGlobalOptions(command: Command): Command {
  return command
    .option("--api-key <key>", "bundle.social API key (overrides BUNDLESOCIAL_API_KEY)")
    .option("--api-url <url>", "API base URL (overrides BUNDLESOCIAL_API_URL; default https://api.bundle.social)")
    .option("--team-id <id>", "team id to operate on (overrides BUNDLESOCIAL_TEAM_ID)")
    .option("--pretty", "render a human-readable table/tree instead of JSON");
}

const DESCRIPTION = `bundle.social CLI — post to 14+ social platforms from your shell, CI, cron or AI agent.

Output is JSON on stdout by default (one object per command); status messages go to stderr.
Use --pretty for a human-readable table/tree. Errors are emitted as { "error": { "code", "message", "details"? } } on stdout with a non-zero exit code.

Auth: set BUNDLESOCIAL_API_KEY (create one at https://bundle.social/dashboard/organization/api-keys) or pass --api-key.
Most commands operate on a team: set BUNDLESOCIAL_TEAM_ID or pass --team-id (skipped automatically if your organization has exactly one team).`;

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("bundle-social")
    .description(DESCRIPTION)
    .version(VERSION, "-v, --version", "print the CLI version")
    .showHelpAfterError("(run with --help for usage)")
    .enablePositionalOptions();
  addGlobalOptions(program);

  registerIntegrationsCommands(program);
  registerPostsCommands(program);
  registerCommentsCommands(program);
  registerMediaCommands(program);
  registerAnalyticsCommands(program);
  registerDoctorCommand(program);

  for (const subcommand of program.commands) {
    addGlobalOptions(subcommand);
  }

  program.addHelpText(
    "after",
    `
Examples:
  $ bundle-social doctor
  $ bundle-social integrations:list --pretty
  $ bundle-social posts:create -c "Hello from the CLI" -i x -i bluesky
  $ bundle-social posts:create -c "Launch day" -i tiktok -m ./demo.mp4 --platform-settings '{"TIKTOK":{"privacy":"PUBLIC_TO_EVERYONE"}}'
  $ bundle-social posts:schedule -c "Tomorrow 9am UTC" -i linkedin -d 2026-06-01T09:00:00Z
  $ bundle-social posts:list --status SCHEDULED --limit 10 --pretty
  $ bundle-social media:upload https://example.com/banner.png
  $ bundle-social analytics:post post_123
  $ bundle-social analytics:summary --from 2026-05-01 --to 2026-06-01

Docs: https://docs.bundle.social   SDK: https://www.npmjs.com/package/bundlesocial`,
  );

  return program;
}
