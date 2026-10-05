import { setTimeout as delay } from "node:timers/promises";

import {
  UploadResponse,
  UploadStatusResponse,
} from "@eye-security-interview/contracts";
import { z } from "zod";

import { environment } from "./config.ts";

export async function upload(csv: string, signal?: AbortSignal) {
  const response = await fetch(new URL("/imports", environment.API_URL), {
    method: "POST",
    headers: { "content-type": "text/csv" },
    body: csv,
    signal: signal ?? null,
  });

  return UploadResponse.parse(await readResponse(response));
}

export async function status(jobId: string, signal?: AbortSignal) {
  const response = await fetch(
    new URL(`/imports/${encodeURIComponent(jobId)}`, environment.API_URL),
    { signal: signal ?? null },
  );

  return UploadStatusResponse.parse(await readResponse(response));
}

export async function pollStatus(
  jobId: string,
  signal?: AbortSignal,
  onStatus?: (result: UploadStatusResponse) => void,
) {
  while (true) {
    const result = await status(jobId, signal);
    onStatus?.(result);

    if (result.status === "completed" || result.status === "failed") {
      return result;
    }

    await delay(environment.API_POLL_INTERVAL_MS, undefined, { signal });
  }
}

class ApiClientError extends Error {}

async function readResponse(response: Response) {
  const body: unknown = await response.json();

  if (!response.ok) {
    const error = ApiErrorResponse.safeParse(body);
    const detail = error.success ? `: ${error.data.error}` : "";

    throw new ApiClientError(
      `API request failed with status ${response.status}${detail}`,
    );
  }

  return body;
}

const ApiErrorResponse = z.object({
  error: z.string(),
});
