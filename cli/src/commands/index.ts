const HELP = `Usage: cli <command> [options]

Commands:
  upload <csv-file>  Upload activity logs
  status <job-id>    Show the status of an upload job

Options:
  -h, --help         Show this help message

Run "cli <command> --help" for command-specific help.`;

export function runIndex() {
  console.log(HELP);
  return;
}
