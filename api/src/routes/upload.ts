import { Readable } from "node:stream";

import {
  ActivityLog,
  type ActivityLog as ActivityLogData,
} from "@eye-security-interview/contracts";
import { CsvError, parse } from "csv-parse";
import type { Handler, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

import type { Environment } from "../lib/config.ts";
import type { ImportProducer } from "../pipeline/import-producer.ts";

class InvalidUploadError extends Error {}
class UploadRecordLimitError extends Error {}

export function upload(
  environment: Environment,
  imports: ImportProducer,
): [MiddlewareHandler, Handler] {
  return [
    bodyLimit({
      maxSize: environment.UPLOAD_BODY_LIMIT_BYTES,
      onError(c) {
        return c.json(
          {
            error: `CSV body exceeds ${environment.UPLOAD_BODY_LIMIT_BYTES} bytes`,
          },
          413,
        );
      },
    }),
    async function uploadHandler(c) {
      let records: readonly ActivityLogData[];

      try {
        records = await parseActivityLogs(
          c.req.raw,
          environment.UPLOAD_RECORD_LIMIT,
        );
      } catch (error: unknown) {
        if (error instanceof UploadRecordLimitError) {
          return c.json({ error: error.message }, 413);
        }

        if (error instanceof InvalidUploadError || error instanceof CsvError) {
          return c.json({ error: error.message }, 400);
        }

        throw error;
      }

      const response = await imports.submit(records);
      return c.json(response, 202);
    },
  ];
}

async function parseActivityLogs(request: Request, recordLimit: number) {
  if (!request.body) {
    throw new InvalidUploadError("CSV body is required");
  }

  const rows = Readable.fromWeb(request.body).pipe(
    parse({
      bom: true,
      columns: true,
      delimiter: ";",
    }),
  );
  const records: ActivityLogData[] = [];
  const recordIds = new Set<number>();

  for await (const row of rows) {
    if (records.length >= recordLimit) {
      throw new UploadRecordLimitError(
        `CSV cannot contain more than ${recordLimit} records`,
      );
    }

    const result = ActivityLog.safeParse(row);

    if (!result.success) {
      throw new InvalidUploadError(
        `CSV record ${records.length + 1} does not match the activity log contract`,
      );
    }

    if (recordIds.has(result.data.id)) {
      throw new InvalidUploadError(
        `CSV contains duplicate record id ${result.data.id}`,
      );
    }

    recordIds.add(result.data.id);
    records.push(result.data);
  }

  if (!records.length) {
    throw new InvalidUploadError("CSV must contain at least one record");
  }

  return records;
}
