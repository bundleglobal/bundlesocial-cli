import type { Command } from "commander";
import { safeAction } from "../program";
import { createContext, resolveTeamId } from "../context";
import { emitResult } from "../output";
import { uploadMediaRef } from "../media";

export function registerMediaCommands(program: Command): void {
  program
    .command("media:upload")
    .summary("upload a media file")
    .description("Upload a media file (image, video or document) from a local path or a public https:// URL. Returns the upload object — its `id` can be passed to posts:create / posts:schedule via --data.")
    .argument("<path-or-url>", "local file path or a public https:// URL")
    .action(
      safeAction(async (ref: string, _opts: unknown, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);
        emitResult(await uploadMediaRef(ctx, teamId, ref), ctx.pretty);
      }),
    );
}
