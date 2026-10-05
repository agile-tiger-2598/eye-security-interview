import { argParse, UsageError } from "../lib/arg-parse.ts";
import { pollJobStatus } from "../lib/poll-job-status.ts";

const HELP = `Usage: cli status [options] <job-id>

Show the status of an upload job.

Options:
  -h, --help  Show this help message`;

export async function runStatus(args: readonly string[]) {
  const { positionals, values } = argParse({
    options: {
      help: { type: "boolean", short: "h" },
    },
    args,
    allowPositionals: true,
    strict: true,
  });

  if (values["help"]) {
    console.log(HELP);
    return;
  }

  const [jobId] = positionals;

  if (!jobId || !jobId.length || positionals.length !== 1) {
    throw new UsageError(
      'The status command requires one job ID. Run "cli status --help" for usage.',
    );
  }

  await pollJobStatus(jobId);
}
