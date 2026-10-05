import type { SQL } from "bun";
import {
  type ActivityLog,
  UploadResponse as UploadResponseSchema,
  type UploadResponse,
} from "@eye-security-interview/contracts";
import type { PgBoss } from "pg-boss";

import { withTransaction } from "./lib/with-transaction.ts";
import { type EnrichmentJobData, ENRICHMENT_QUEUE } from "./queue-data.ts";

export interface ImportProducer {
  submit(records: readonly ActivityLog[]): Promise<UploadResponse>;
}

export function createImportProducer(
  database: SQL,
  boss: PgBoss,
): ImportProducer {
  return {
    async submit(records) {
      if (!records.length) {
        throw new Error("Cannot create an import without records");
      }

      return withTransaction(database, async function (transaction) {
        const importResult = await transaction.executeSql(
          `
            INSERT INTO imports (total_records)
            VALUES ($1)
            RETURNING id AS job_id
          `,
          [records.length],
        );
        const response = UploadResponseSchema.parse(importResult.rows.at(0));

        await boss.insert(
          ENRICHMENT_QUEUE,
          records.map(function (record) {
            return {
              data: {
                activityLog: record,
                importId: response.job_id,
                recordId: String(record.id),
              } satisfies EnrichmentJobData,
            };
          }),
          { db: transaction },
        );

        return response;
      });
    },
  };
}
