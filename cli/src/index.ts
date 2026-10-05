import { runIndex } from "./commands/index.ts";
import { runStatus } from "./commands/status.ts";
import { runUpload } from "./commands/upload.ts";
import { UsageError } from "./lib/arg-parse.ts";

try {
  await run(Bun.argv.slice(2));
} catch (error: unknown) {
  if (!(error instanceof UsageError)) {
    throw error;
  }

  console.error(`Error: ${error.message}`);
  process.exitCode = 2;
}

async function run(args: readonly string[]) {
  const [command, ...commandArgs] = args;

  if (!command || command === "--help" || command === "-h") {
    runIndex();
    return;
  }

  switch (command) {
    case "upload":
      await runUpload(commandArgs);
      return;
    case "status":
      await runStatus(commandArgs);
      return;
    default:
      throw new UsageError(
        `Unknown command "${command}". Run "cli --help" for usage.`,
      );
  }
}
