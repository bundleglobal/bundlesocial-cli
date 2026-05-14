import fs from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import type { PostCsvGetRowsData } from "bundlesocial";
import { safeAction } from "../program";
import { createContext } from "../context";
import { CliError, emitResult, logStatus } from "../output";

export function registerPostCsvCommands(program: Command): void {
  program
    .command("posts:csv")
    .summary("start a CSV bulk-post import")
    .description("Upload a CSV file for an async bulk post import. Returns the import object — track it with posts:csv:status / posts:csv:rows.")
    .requiredOption("--file <path>", "path to the CSV file to import")
    .action(
      safeAction(async (opts: { file: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const absolutePath = path.resolve(opts.file);
        let buffer: Buffer;
        try {
          buffer = await fs.readFile(absolutePath);
        } catch {
          throw new CliError("FILE_NOT_FOUND", `Could not read CSV file: ${opts.file}`, { path: absolutePath });
        }
        logStatus(`Uploading CSV: ${absolutePath} (${buffer.byteLength} bytes)`);
        const file = new File([buffer], path.basename(absolutePath), { type: "text/csv" });
        emitResult(await ctx.client.postCsv.postCsvCreate({ formData: { file } }), ctx.pretty);
      }),
    );

  program
    .command("posts:csv:list")
    .summary("list CSV import history")
    .description("List your CSV bulk-post import history, with optional pagination.")
    .option("--limit <n>", "max number of imports to return")
    .option("--offset <n>", "number of imports to skip")
    .action(
      safeAction(async (opts: { limit?: string; offset?: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        emitResult(
          await ctx.client.postCsv.postCsvGetList({
            limit: opts.limit !== undefined ? Number(opts.limit) : undefined,
            offset: opts.offset !== undefined ? Number(opts.offset) : undefined,
          }),
          ctx.pretty,
        );
      }),
    );

  program
    .command("posts:csv:get")
    .summary("fetch a CSV import")
    .description("Fetch details of a single CSV bulk-post import by its id.")
    .argument("<importId>", "import id")
    .action(
      safeAction(async (importId: string, _opts: unknown, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        emitResult(await ctx.client.postCsv.postCsvGetById({ importId }), ctx.pretty);
      }),
    );

  program
    .command("posts:csv:status")
    .summary("CSV import processing status")
    .description("Get the processing status of a CSV bulk-post import by its id.")
    .argument("<importId>", "import id")
    .action(
      safeAction(async (importId: string, _opts: unknown, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        emitResult(await ctx.client.postCsv.postCsvGetStatus({ importId }), ctx.pretty);
      }),
    );

  program
    .command("posts:csv:rows")
    .summary("CSV import row results")
    .description("Get the per-row results of a CSV bulk-post import, optionally filtered by status (SUCCESS | FAILED).")
    .argument("<importId>", "import id")
    .option("--status <status>", "filter rows: SUCCESS | FAILED")
    .option("--limit <n>", "max number of rows to return")
    .option("--offset <n>", "number of rows to skip")
    .action(
      safeAction(async (importId: string, opts: { status?: string; limit?: string; offset?: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const query: PostCsvGetRowsData = {
          importId,
          status: opts.status ? (opts.status.trim().toUpperCase() as PostCsvGetRowsData["status"]) : undefined,
          limit: opts.limit !== undefined ? Number(opts.limit) : undefined,
          offset: opts.offset !== undefined ? Number(opts.offset) : undefined,
        };
        emitResult(await ctx.client.postCsv.postCsvGetRows(query), ctx.pretty);
      }),
    );
}
