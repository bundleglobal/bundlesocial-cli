import util from "node:util";
import chalk from "chalk";
import { ApiError } from "bundlesocial";
import { renderPretty } from "./pretty";

/** An error with a stable machine-readable `code`, surfaced as the CLI error envelope. */
export class CliError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.details = details;
  }
}

/** Thrown to unwind to the process boundary with a specific exit code. */
export class CliExit extends Error {
  readonly exitCode: number;

  constructor(exitCode: number) {
    super(`exit ${exitCode}`);
    this.name = "CliExit";
    this.exitCode = exitCode;
  }
}

export interface NormalizedError {
  code: string;
  message: string;
  details?: unknown;
}

export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof CliError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  if (error instanceof ApiError) {
    const body = error.body as Record<string, unknown> | string | undefined;
    const message =
      (typeof body === "object" && body && typeof body.message === "string" && body.message) ||
      (typeof body === "object" && body && typeof body.error === "string" && body.error) ||
      error.statusText ||
      error.message ||
      `HTTP ${error.status}`;
    return {
      code: `HTTP_${error.status}`,
      message,
      details: { status: error.status, url: error.url, body: error.body },
    };
  }
  if (error instanceof Error) {
    return {
      code: "UNEXPECTED_ERROR",
      message: error.message || "Unexpected error",
      details: process.env.BUNDLESOCIAL_DEBUG ? { stack: error.stack } : undefined,
    };
  }
  return { code: "UNEXPECTED_ERROR", message: String(error) };
}

/** A short one-line summary of any error, for embedding inside larger results. */
export function errorSummary(error: unknown): string {
  if (error instanceof ApiError) return `HTTP ${error.status}${error.statusText ? ` ${error.statusText}` : ""}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Write a human-readable status line to stderr. Never goes to stdout. */
export function logStatus(message: string): void {
  process.stderr.write(`${message}\n`);
}

/** Emit the (single) command result. JSON to stdout by default; a table/tree with `--pretty`. */
export function emitResult(data: unknown, pretty: boolean): void {
  if (pretty) {
    process.stdout.write(`${renderPretty(data)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  }
}

/** Emit the error envelope to stdout, optionally a styled line to stderr, then exit non-zero. */
export function emitError(error: unknown, pretty: boolean): never {
  const normalized = normalizeError(error);
  if (pretty) {
    process.stderr.write(`${chalk.red(`✖ ${normalized.code}`)} ${normalized.message}\n`);
    if (normalized.details !== undefined) {
      process.stderr.write(`${util.inspect(normalized.details, { depth: null, colors: true })}\n`);
    }
  }
  process.stdout.write(`${JSON.stringify({ error: normalized }, null, 2)}\n`);
  throw new CliExit(1);
}
