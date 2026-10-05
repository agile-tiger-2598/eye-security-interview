import type { UploadStatusResponse } from "@eye-security-interview/contracts";
import yoctoSpinner from "yocto-spinner";

import { pollStatus } from "./api-client.ts";

export async function pollJobStatus(jobId: string, signal?: AbortSignal) {
  const spinner = yoctoSpinner({ text: `Waiting for job ${jobId}...` }).start();

  try {
    const result = await pollStatus(jobId, signal, (status) => {
      spinner.text = formatProgress(status);
    });

    if (result.status === "failed") {
      spinner.error(formatResult(result));
    } else {
      spinner.success(formatResult(result));
    }

    return result;
  } catch (error: unknown) {
    spinner.error(`Could not get the status of job ${jobId}.`);
    throw error;
  }
}

function formatProgress(status: UploadStatusResponse) {
  const processedRecords = status.successful_records + status.failed_records;
  return `Job ${status.job_id} (${status.status}): ${processedRecords}/${status.total_records} processed.`;
}

function formatResult(status: UploadStatusResponse) {
  return `Job ${status.job_id} (${status.status}): ${status.successful_records} successful, ${status.failed_records} failed.`;
}
