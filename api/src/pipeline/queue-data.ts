import type { ActivityLog } from "@eye-security-interview/contracts";

import type { AnalyticsEvent } from "../lib/heyering/contracts.ts";

export const ENRICHMENT_QUEUE = "activity-log-enrichment";
export const ENRICHMENT_DEAD_LETTER_QUEUE = "activity-log-enrichment-failed";
export const ANALYTICS_QUEUE = "activity-log-analytics";
export const ANALYTICS_DEAD_LETTER_QUEUE = "activity-log-analytics-failed";

export interface EnrichmentJobData {
  readonly activityLog: ActivityLog;
  readonly importId: string;
  readonly recordId: string;
}

export interface AnalyticsJobData {
  readonly event: AnalyticsEvent;
  readonly importId: string;
  readonly recordId: string;
}

export type PipelineJobData = AnalyticsJobData | EnrichmentJobData;
