#!/usr/bin/env node
import { buildProgram } from "./program";
import { CliExit } from "./output";

async function main(): Promise<void> {
  const program = buildProgram();
  // Let our own CliExit / commander's help & version control the exit code.
  program.exitOverride();
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof CliExit) {
      process.exit(error.exitCode);
    }
    // commander throws for --help, --version and usage errors; it already
    // printed the relevant text, so just translate to an exit code.
    const code = (error as { code?: string }).code;
    if (code === "commander.helpDisplayed" || code === "commander.version" || code === "commander.help") {
      process.exit(0);
    }
    if (typeof code === "string" && code.startsWith("commander.")) {
      process.exit(1);
    }
    process.stderr.write(`${(error as Error)?.stack ?? error}\n`);
    process.exit(1);
  }
}

void main();
