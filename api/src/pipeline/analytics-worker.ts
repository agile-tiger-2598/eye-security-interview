import type { Job } from "pg-boss";

import {
  type HeyeringClient,
  HeyeringClientError,
} from "../lib/heyering/client.ts";
import type { AnalyticsResponse } from "../lib/heyering/contracts.ts";
import type { PipelineJobFinalizer } from "./job-finalizer.ts";
import { type AnalyticsJobData, ANALYTICS_QUEUE } from "./queue-data.ts";
import { withRequestTimeout } from "./lib/request-timeout.ts";

export interface AnalyticsWorkerDependencies {
  client: HeyeringClient;
  finalizer: PipelineJobFinalizer;
  requestTimeoutMs: number;
}

export async function processAnalyticsRecords(
  dependencies: AnalyticsWorkerDependencies,
  jobs: readonly Job<AnalyticsJobData>[],
  signal: AbortSignal,
): Promise<void> {
  if (!jobs.length) return;

  let response: AnalyticsResponse;
  const requestStartedAt = performance.now();

  const requestContext = {
    attempts: jobs.map(function (job) {
      return job.retryCount + 1;
    }),
    batch_size: jobs.length,
    import_ids: [
      ...new Set(
        jobs.map(function (job) {
          return job.data.importId;
        }),
      ),
    ],
    record_ids: jobs.map(function (job) {
      return job.data.recordId;
    }),
  };

  try {
    response = await withRequestTimeout(
      signal,
      dependencies.requestTimeoutMs,
      function (requestSignal) {
        return dependencies.client.sendAnalytics(
          jobs.map((job) => job.data.event),
          { signal: requestSignal },
        );
      },
    );
  } catch (error: unknown) {
    console.debug(
      JSON.stringify({
        ...requestContext,
        duration_ms: Math.round(performance.now() - requestStartedAt),
        error: error instanceof Error ? error.message : "Unknown error",
        event: "analytics_batch_failed",
      }),
    );

    if (!(error instanceof HeyeringClientError) || error.retryable) {
      throw error;
    }

    await dependencies.finalizer.failAnalytics(
      ANALYTICS_QUEUE,
      jobs,
      error.message,
    );
    return;
  }

  console.debug(
    JSON.stringify({
      ...requestContext,
      duration_ms: Math.round(performance.now() - requestStartedAt),
      event: "analytics_batch_completed",
      items_ingested: response.itemsIngested,
      status: response.status,
    }),
  );

  if (response.status !== "ok" || response.itemsIngested !== jobs.length) {
    throw new Error(
      `Heyering analytics accepted ${response.itemsIngested} of ${jobs.length} records with status ${response.status}`,
    );
  }

  await dependencies.finalizer.completeAnalytics(jobs);
}
