import { createReadStream } from "node:fs";

import { ActivityLog } from "@eye-security-interview/contracts";
import { parse } from "csv-parse";
import yoctoSpinner from "yocto-spinner";

import { upload as uploadCsv } from "../lib/api-client.ts";
import { argParse, UsageError } from "../lib/arg-parse.ts";
import { pollJobStatus } from "../lib/poll-job-status.ts";

const HELP = `Usage: cli upload [options] <csv-file>

Upload activity logs from a CSV file.

Options:
  --no-wait   Exit after the upload job is submitted
  -h, --help  Show this help message`;

export async function runUpload(args: readonly string[]) {
  const { positionals, values } = argParse({
    options: {
      "no-wait": { type: "boolean" },
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

  const [csvFile] = positionals;

  if (!csvFile || !csvFile.length || positionals.length !== 1) {
    throw new UsageError(
      'The upload command requires one CSV file. Run "cli upload --help" for usage.',
    );
  }

  await executeUpload(csvFile, !!values["no-wait"]);
}

async function executeUpload(csvFile: string, noWait: boolean) {
  const spinner = yoctoSpinner({ text: "Reading CSV..." }).start();

  let jobId: string;

  try {
    const { csv, invalidRecordIds, validRecordCount } =
      await readValidCsv(csvFile);

    if (invalidRecordIds.length) {
      spinner.info(formatIgnoredRecords(invalidRecordIds));
    }

    spinner.start(`Uploading ${validRecordCount} records...`);

    const response = await uploadCsv(csv);
    jobId = response.job_id;
    spinner.success("Upload accepted.");
  } catch (error: unknown) {
    spinner.error("Upload failed.");
    throw error;
  }

  if (noWait) {
    console.log(`Job ID: ${jobId}`);
    return;
  }

  await pollJobStatus(jobId);
}

async function readValidCsv(csvFile: string) {
  // limitation: the filtered CSV is allocated in memory once.
  const csvRows: string[] = [];
  const invalidRecordIds: string[] = [];
  const recordIds = new Set<number>();

  const parsedRows = createReadStream(csvFile).pipe(
    parse({
      bom: true,
      columns(headers) {
        csvRows.push(`${headers.join(";")}\n`);
        return headers;
      },
      delimiter: ";",
      raw: true,
      record_delimiter: "\n",
      rtrim: true,
      skip_records_with_error: true,
      on_skip(_error, raw) {
        const maybeId = raw?.split(";", 1);
        invalidRecordIds.push(maybeId?.[0] ?? "invalid-record-id");
      },
    }),
  );

  let validRecordCount = 0;

  for await (const row of parsedRows) {
    const result = ActivityLog.safeParse(row.record);

    if (!result.success || recordIds.has(result.data.id)) {
      invalidRecordIds.push(row.record.id);
      continue;
    }

    recordIds.add(result.data.id);
    csvRows.push(row.raw);
    validRecordCount += 1;
  }

  return {
    csv: csvRows.join(""),
    invalidRecordIds,
    validRecordCount,
  };
}

function formatIgnoredRecords(ids: readonly string[]) {
  const count = ids.length;
  return `Ignored ${count} invalid record${count === 1 ? "" : "s"} (IDs: ${ids.join(", ")}).`;
}
