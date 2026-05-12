import util from "node:util";
import chalk from "chalk";
import Table from "cli-table3";

const MAX_CELL = 60;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrimitive(value: unknown): boolean {
  return value === null || ["string", "number", "boolean", "undefined"].includes(typeof value);
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return chalk.dim("—");
  if (typeof value === "boolean") return value ? chalk.green("yes") : chalk.dim("no");
  const text = isPrimitive(value) ? String(value) : JSON.stringify(value);
  return text.length > MAX_CELL ? `${text.slice(0, MAX_CELL - 1)}…` : text;
}

/** Render an array of flat-ish objects as a table. Falls back to a colored dump otherwise. */
function renderArray(rows: unknown[]): string {
  if (rows.length === 0) return chalk.dim("(empty)");
  if (!rows.every(isPlainObject)) {
    return util.inspect(rows, { depth: null, colors: true });
  }
  const objectRows = rows as Record<string, unknown>[];
  const columns: string[] = [];
  for (const row of objectRows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  const table = new Table({ head: columns.map((c) => chalk.bold(c)) });
  for (const row of objectRows) {
    table.push(columns.map((c) => stringifyCell(row[c])));
  }
  return `${table.toString()}\n${chalk.dim(`${objectRows.length} row${objectRows.length === 1 ? "" : "s"}`)}`;
}

/**
 * Best-effort human rendering used by `--pretty`. Arrays become tables, the
 * common `{ items: [...] }` list shape becomes a table, everything else is a
 * colored object dump. The default (no `--pretty`) output is always raw JSON.
 */
export function renderPretty(data: unknown): string {
  if (Array.isArray(data)) return renderArray(data);
  if (isPlainObject(data) && Array.isArray(data.items)) {
    const rest = { ...data } as Record<string, unknown>;
    delete rest.items;
    const header = Object.keys(rest).length > 0 ? `${util.inspect(rest, { depth: null, colors: true })}\n` : "";
    return `${header}${renderArray(data.items)}`;
  }
  return util.inspect(data, { depth: null, colors: true });
}
