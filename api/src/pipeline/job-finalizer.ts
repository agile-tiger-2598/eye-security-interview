import type { SQL } from "bun";
import type { Db, Job, PgBoss } from "pg-boss";
import { z } from "zod";

import type { AnalyticsEvent } from "../lib/heyering/contracts.ts";
import { withTransaction } from "./lib/with-transaction.ts";
import {
  type AnalyticsJobData,
  ANALYTICS_QUEUE,
  type EnrichmentJobData,
  ENRICHMENT_QUEUE,
  type PipelineJobData,
} from "./queue-data.ts";

export interface PipelineJobFinalizer {
  markProcessing(importId: string): Promise<void>;

  completeEnrichment(
    job: Job<EnrichmentJobData>,
    event: AnalyticsEvent,
  ): Promise<void>;

  completeAnalytics(jobs: readonly Job<AnalyticsJobData>[]): Promise<void>;

  failEnrichment(
    queue: string,
    jobs: readonly Job<EnrichmentJobData>[],
    reason: string,
  ): Promise<void>;

  failAnalytics(
    queue: string,
    jobs: readonly Job<AnalyticsJobData>[],
    reason: string,
  ): Promise<void>;
}

export function createPipelineJobFinalizer(
  database: SQL,
  boss: PgBoss,
): PipelineJobFinalizer {
  const queueDatabase = boss.getDb();

  return {
    async markProcessing(importId) {
      await queueDatabase.executeSql(
        `
          UPDATE imports
          SET status = 'processing', updated_at = now()
          WHERE id = $1
            AND status = 'pending'
        `,
        [importId],
      );
    },

    async completeEnrichment(job, event) {
      await withTransaction(database, async function (transaction) {
        const analyticsJobId = await boss.send(
          ANALYTICS_QUEUE,
          {
            event,
            importId: job.data.importId,
            recordId: job.data.recordId,
          } satisfies AnalyticsJobData,
          { db: transaction },
        );

        if (!analyticsJobId) {
          throw new Error("Analytics queue rejected a record job");
        }

        await completeJobs(boss, transaction, ENRICHMENT_QUEUE, [job]);
      });
    },

    async completeAnalytics(jobs) {
      await withTransaction(database, async function (transaction) {
        await completeJobs(boss, transaction, ANALYTICS_QUEUE, jobs);
        await incrementImports(transaction, jobs, "successful");
      });
    },

    async failEnrichment(queue, jobs, reason) {
      await withTransaction(database, async function (transaction) {
        await completeJobs(boss, transaction, queue, jobs);
        await insertFailures(
          transaction,
          jobs,
          "enrichment",
          reason,
          function (job) {
            return job.data.activityLog;
          },
        );
        await incrementImports(transaction, jobs, "failed");
      });
    },

    async failAnalytics(queue, jobs, reason) {
      await withTransaction(database, async function (transaction) {
        await completeJobs(boss, transaction, queue, jobs);
        await insertFailures(
          transaction,
          jobs,
          "analytics",
          reason,
          function (job) {
            return job.data.event;
          },
        );
        await incrementImports(transaction, jobs, "failed");
      });
    },
  };
}

async function completeJobs(
  boss: PgBoss,
  transaction: Db,
  queue: string,
  jobs: readonly Job<PipelineJobData>[],
) {
  const response = await boss.complete(
    queue,
    jobs.map(function (job) {
      return { id: job.id, retryCount: job.retryCount };
    }),
    null,
    { db: transaction },
  );
  const completion = CompletionResponse.parse(response);

  if (completion.affected !== jobs.length) {
    throw new Error(
      `Could not complete all claimed ${queue} jobs (${completion.affected}/${jobs.length})`,
    );
  }
}

async function insertFailures<Data extends PipelineJobData>(
  database: Db,
  jobs: readonly Job<Data>[],
  stage: "analytics" | "enrichment",
  reason: string,
  payload: (job: Job<Data>) => object,
) {
  for (const job of jobs) {
    await database.executeSql(
      `
        INSERT INTO import_failures (
          import_id,
          record_id,
          stage,
          payload,
          reason
        )
        VALUES ($1, $2, $3, $4::jsonb, $5)
      `,
      [job.data.importId, job.data.recordId, stage, payload(job), reason],
    );
  }
}

async function incrementImports(
  database: Db,
  jobs: readonly Job<PipelineJobData>[],
  outcome: "failed" | "successful",
) {
  const recordsByImport = new Map<string, number>();

  for (const job of jobs) {
    recordsByImport.set(
      job.data.importId,
      (recordsByImport.get(job.data.importId) ?? 0) + 1,
    );
  }

  for (const [importId, recordCount] of recordsByImport) {
    const successfulIncrement = outcome === "successful" ? recordCount : 0;
    const failedIncrement = outcome === "failed" ? recordCount : 0;

    const result = await database.executeSql(
      `
        UPDATE imports
        SET
          successful_records = successful_records + $2,
          failed_records = failed_records + $3,
          status = CASE
            WHEN successful_records + failed_records + $2 + $3 = total_records
              THEN CASE
                WHEN failed_records + $3 > 0 THEN 'failed'
                ELSE 'completed'
              END
            ELSE 'processing'
          END,
          updated_at = now()
        WHERE id = $1
        RETURNING id
      `,
      [importId, successfulIncrement, failedIncrement],
    );

    if (result.rows.length !== 1) {
      throw new Error(`Import ${importId} no longer exists`);
    }
  }
}

const CompletionResponse = z.object({
  affected: z.number().int().nonnegative(),
});
