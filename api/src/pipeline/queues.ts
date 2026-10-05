import type { SQL } from "bun";
import type { Job, PgBoss } from "pg-boss";

import type { HeyeringClient } from "../lib/heyering/client.ts";
import { processAnalyticsRecords } from "./analytics-worker.ts";
import { processEnrichmentRecord } from "./enrichment-worker.ts";
import { createPipelineJobFinalizer } from "./job-finalizer.ts";
import {
  type AnalyticsJobData,
  ANALYTICS_DEAD_LETTER_QUEUE,
  ANALYTICS_QUEUE,
  type EnrichmentJobData,
  ENRICHMENT_DEAD_LETTER_QUEUE,
  ENRICHMENT_QUEUE,
  type PipelineJobData,
} from "./queue-data.ts";

export interface PipelineOptions {
  enrichmentConcurrency: number;
  requestTimeoutMs: number;
}

export async function registerPipelineWorkers(
  database: SQL,
  boss: PgBoss,
  client: HeyeringClient,
  options: PipelineOptions,
): Promise<void> {
  await createQueues(boss);

  const finalizer = createPipelineJobFinalizer(database, boss);

  await boss.work<EnrichmentJobData>(
    ENRICHMENT_QUEUE,
    {
      localConcurrency: options.enrichmentConcurrency,
      notifyPollingIntervalSeconds: 0.5,
      pollingIntervalSeconds: 0.5,
    },
    async function (jobs) {
      for (const job of jobs) {
        await processEnrichmentRecord(
          {
            client,
            finalizer,
            requestTimeoutMs: options.requestTimeoutMs,
          },
          job,
        );
      }
    },
  );

  await boss.work<AnalyticsJobData>(
    ANALYTICS_QUEUE,
    {
      batchSize: 20,
      localConcurrency: 1,
      // HACK: a more advanced rate limiting should be used here for better throughput
      pollingIntervalSeconds: 10.5,
    },
    async function (jobs) {
      const signal = combineJobSignals(jobs);

      if (!signal) return;

      await processAnalyticsRecords(
        {
          client,
          finalizer,
          requestTimeoutMs: options.requestTimeoutMs,
        },
        jobs,
        signal,
      );
    },
  );

  await boss.work<EnrichmentJobData>(
    ENRICHMENT_DEAD_LETTER_QUEUE,
    { localConcurrency: 1 },
    async function (jobs) {
      await finalizer.failEnrichment(
        ENRICHMENT_DEAD_LETTER_QUEUE,
        jobs,
        "Heyering enrichment retries were exhausted",
      );
    },
  );

  await boss.work<AnalyticsJobData>(
    ANALYTICS_DEAD_LETTER_QUEUE,
    { localConcurrency: 1 },
    async function (jobs) {
      await finalizer.failAnalytics(
        ANALYTICS_DEAD_LETTER_QUEUE,
        jobs,
        "Heyering analytics retries were exhausted",
      );
    },
  );
}

async function createQueues(boss: PgBoss) {
  await boss.createQueue(ENRICHMENT_DEAD_LETTER_QUEUE, {
    retryBackoff: true,
    retryDelay: 2,
    retryDelayMax: 60,
    retryLimit: 10,
  });
  await boss.createQueue(ANALYTICS_DEAD_LETTER_QUEUE, {
    retryBackoff: true,
    retryDelay: 2,
    retryDelayMax: 60,
    retryLimit: 10,
  });
  await boss.createQueue(ENRICHMENT_QUEUE, {
    deadLetter: ENRICHMENT_DEAD_LETTER_QUEUE,
    notify: true,
    retryBackoff: true,
    retryDelay: 2,
    retryDelayMax: 60,
    retryLimit: 5,
  });
  await boss.createQueue(ANALYTICS_QUEUE, {
    deadLetter: ANALYTICS_DEAD_LETTER_QUEUE,
    notify: false,
    retryBackoff: true,
    retryDelay: 10,
    retryDelayMax: 120,
    retryLimit: 5,
  });
}

function combineJobSignals<Data extends PipelineJobData>(
  jobs: readonly Job<Data>[],
): AbortSignal | undefined {
  const firstJob = jobs.at(0);

  if (!firstJob) return undefined;
  if (jobs.length === 1) return firstJob.signal;

  return AbortSignal.any(
    jobs.map(function (job) {
      return job.signal;
    }),
  );
}
