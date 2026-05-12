import { vi } from "vitest";
import type { Command } from "commander";

export interface CliRun {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Parsed stdout if it was a single JSON value, otherwise `undefined`. */
  json: unknown;
}

/**
 * Run the CLI in-process with the given args, capturing stdout, stderr and the
 * resulting exit code. Relies on the calling test file having mocked
 * `bundlesocial` (so no real network calls happen).
 */
export async function runCli(args: string[]): Promise<CliRun> {
  // Imported lazily so the test file's `vi.mock("bundlesocial")` is active first.
  const { buildProgram } = await import("../src/program");

  const out: string[] = [];
  const err: string[] = [];
  const outSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(((chunk: unknown) => {
      out.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
  const errSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(((chunk: unknown) => {
      err.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);

  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  let exitCode = 0;
  try {
    const program: Command = buildProgram();
    program.exitOverride();
    await program.parseAsync(["node", "bundle-social", ...args]);
    exitCode = typeof process.exitCode === "number" ? process.exitCode : 0;
  } catch (error) {
    const e = error as { name?: string; exitCode?: number; code?: string };
    if (e?.name === "CliExit") exitCode = e.exitCode ?? 1;
    else if (typeof e?.code === "string" && e.code.startsWith("commander.")) exitCode = e.exitCode ?? 1;
    else throw error;
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
    process.exitCode = previousExitCode;
  }

  const stdout = out.join("");
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = undefined;
  }
  return { stdout, stderr: err.join(""), exitCode, json };
}
