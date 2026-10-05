import type { Job } from "pg-boss";

import { normalizeEnrichmentCategory } from "../lib/heyering/category-normalization.ts";
import {
  type HeyeringClient,
  HeyeringClientError,
} from "../lib/heyering/client.ts";
import {
  AnalyticsCategory,
  AnalyticsEvent,
  type EnrichmentResponse,
} from "../lib/heyering/contracts.ts";
import type { PipelineJobFinalizer } from "./job-finalizer.ts";
import { type EnrichmentJobData, ENRICHMENT_QUEUE } from "./queue-data.ts";
import { withRequestTimeout } from "./lib/request-timeout.ts";

export interface EnrichmentWorkerDependencies {
  client: HeyeringClient;
  finalizer: PipelineJobFinalizer;
  requestTimeoutMs: number;
}

export async function processEnrichmentRecord(
  dependencies: EnrichmentWorkerDependencies,
  job: Job<EnrichmentJobData>,
): Promise<void> {
  await dependencies.finalizer.markProcessing(job.data.importId);

  const { activityLog } = job.data;
  const category = normalizeEnrichmentCategory(activityLog.category);

  if (!category) {
    await dependencies.finalizer.failEnrichment(
      ENRICHMENT_QUEUE,
      [job],
      "Activity log category is not supported by Heyering",
    );
    return;
  }

  let enrichment: EnrichmentResponse;
  const requestStartedAt = performance.now();

  try {
    enrichment = await withRequestTimeout(
      job.signal,
      dependencies.requestTimeoutMs,
      function (requestSignal) {
        return dependencies.client.enrich(
          {
            id: activityLog.id,
            asset: activityLog.asset_name,
            ip: activityLog.ip,
            category,
          },
          { signal: requestSignal },
        );
      },
    );
  } catch (error: unknown) {
    console.debug(
      JSON.stringify({
        attempt: job.retryCount + 1,
        duration_ms: Math.round(performance.now() - requestStartedAt),
        error: error instanceof Error ? error.message : "Unknown error",
        event: "enrichment_request_failed",
        import_id: job.data.importId,
        record_id: job.data.recordId,
      }),
    );

    if (!(error instanceof HeyeringClientError) || error.retryable) {
      throw error;
    }

    await dependencies.finalizer.failEnrichment(
      ENRICHMENT_QUEUE,
      [job],
      error.message,
    );
    return;
  }

  console.debug(
    JSON.stringify({
      attempt: job.retryCount + 1,
      duration_ms: Math.round(performance.now() - requestStartedAt),
      event: "enrichment_request_completed",
      import_id: job.data.importId,
      record_id: job.data.recordId,
    }),
  );

  const analyticsCategory = AnalyticsCategory.safeParse(enrichment.category);

  if (!analyticsCategory.success) {
    await dependencies.finalizer.failEnrichment(
      ENRICHMENT_QUEUE,
      [job],
      "Heyering enrichment returned an unsupported analytics category",
    );
    return;
  }

  const event = AnalyticsEvent.parse({
    id: activityLog.id,
    asset: activityLog.asset_name,
    ip: activityLog.ip,
    category: analyticsCategory.data,
    asn: enrichment.asn,
    correlationId: enrichment.correlationId,
  });

  await dependencies.finalizer.completeEnrichment(job, event);
}
