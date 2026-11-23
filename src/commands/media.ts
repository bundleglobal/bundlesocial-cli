import fs from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import type { UploadGetListData } from "bundlesocial";
import { safeAction } from "../program";
import { createContext, resolveTeamId } from "../context";
import { CliError, emitResult } from "../output";
import { uploadLargeFile, uploadMediaRef } from "../media";

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
    .summary("upload a media file straight to storage")
    .description(
      "Upload a local media file straight to storage with the init → signed PUT → finalize flow, at any size up to 5 GB. media:upload and posts:create already switch to it above 90 MB. Supported types: jpg, jpeg, png, gif, mp4, mov, pdf. Returns the finalized upload object.",
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
        emitResult(await uploadLargeFile(ctx, teamId, absolutePath, buffer), ctx.pretty);
      }),
    );
}
