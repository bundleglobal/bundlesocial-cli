import fs from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import type { UploadGetListData, UploadInitLargeUploadData } from "bundlesocial";
import { safeAction } from "../program";
import { createContext, resolveTeamId } from "../context";
import { CliError, emitResult, logStatus } from "../output";
import { uploadMediaRef } from "../media";

type LargeUploadMime = NonNullable<UploadInitLargeUploadData["requestBody"]>["mimeType"];

const LARGE_UPLOAD_MIME_BY_EXT: Record<string, LargeUploadMime> = {
  ".jpg": "image/jpg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
};

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

  program
    .command("media:list")
    .summary("list uploaded media")
    .description("List uploaded media for the team, optionally filtered by type and usage status.")
    .option("--type <type>", "filter by type: image | video | document")
    .option("--status <status>", "filter by usage: USED | UNUSED")
    .action(
      safeAction(async (opts: { type?: string; status?: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);
        const query: UploadGetListData = {
          teamId,
          type: opts.type ? (opts.type.trim().toLowerCase() as UploadGetListData["type"]) : undefined,
          status: opts.status ? (opts.status.trim().toUpperCase() as UploadGetListData["status"]) : undefined,
        };
        emitResult(await ctx.client.upload.uploadGetList(query), ctx.pretty);
      }),
    );

  program
    .command("media:get")
    .summary("fetch a single upload")
    .description("Fetch a single uploaded media object by its id.")
    .argument("<id>", "upload id")
    .action(
      safeAction(async (id: string, _opts: unknown, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        emitResult(await ctx.client.upload.uploadGet({ id }), ctx.pretty);
      }),
    );

  program
    .command("media:delete")
    .summary("delete an upload")
    .description("Delete an uploaded media object by its id.")
    .argument("<id>", "upload id")
    .action(
      safeAction(async (id: string, _opts: unknown, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        emitResult(await ctx.client.upload.uploadDelete({ id }), ctx.pretty);
      }),
    );

  program
    .command("media:delete-many")
    .summary("delete several uploads")
    .description("Delete several uploaded media objects at once. Pass --id once per upload.")
    .requiredOption("--id <id...>", "upload id; repeatable")
    .action(
      safeAction(async (opts: { id: string[] }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        emitResult(await ctx.client.upload.uploadDeleteMany({ requestBody: { ids: opts.id } }), ctx.pretty);
      }),
    );

  program
    .command("media:upload-large")
    .summary("upload a large media file (>90 MB)")
    .description(
      "Upload a large local media file (>90 MB) using the chunked init → PUT → finalize flow. Supported types: jpg, jpeg, png, gif, mp4, pdf. Returns the finalized upload object.",
    )
    .argument("<path>", "local file path")
    .action(
      safeAction(async (filePath: string, _opts: unknown, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);
        const absolutePath = path.resolve(filePath);
        let buffer: Buffer;
        try {
          buffer = await fs.readFile(absolutePath);
        } catch {
          throw new CliError("MEDIA_NOT_FOUND", `Could not read media file "${filePath}".`, { path: absolutePath });
        }
        const ext = path.extname(absolutePath).toLowerCase();
        const mimeType = LARGE_UPLOAD_MIME_BY_EXT[ext];
        if (!mimeType) {
          throw new CliError(
            "UNSUPPORTED_MEDIA_TYPE",
            `Large uploads only support ${Object.keys(LARGE_UPLOAD_MIME_BY_EXT).join(", ")} files (got "${ext || "no extension"}").`,
          );
        }
        const fileName = path.basename(absolutePath);
        logStatus(`Initializing large upload: ${absolutePath} (${mimeType}, ${buffer.byteLength} bytes)`);
        const init = await ctx.client.upload.uploadInitLargeUpload({ requestBody: { teamId, fileName, mimeType } });
        logStatus(`Uploading ${buffer.byteLength} bytes to storage…`);
        const putResponse = await fetch(init.url, {
          method: "PUT",
          headers: { "Content-Type": mimeType, "Content-Length": String(buffer.byteLength) },
          body: buffer,
        });
        if (!putResponse.ok) {
          throw new CliError(
            "LARGE_UPLOAD_FAILED",
            `Upload to storage failed (HTTP ${putResponse.status} ${putResponse.statusText}).`,
            { status: putResponse.status },
          );
        }
        logStatus("Finalizing large upload…");
        emitResult(
          await ctx.client.upload.uploadFinalizeLargeUpload({ requestBody: { teamId, path: init.path } }),
          ctx.pretty,
        );
      }),
    );
}
