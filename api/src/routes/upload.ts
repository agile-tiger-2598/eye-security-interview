import { Readable } from "node:stream";

import type { SQL } from "bun";
import { ActivityLog } from "@eye-security-interview/contracts";
import { CsvError, parse } from "csv-parse";
import type { Handler, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

import type { Environment } from "../lib/config.ts";
import { createImport } from "../lib/queries.ts";

class InvalidUploadError extends Error {}
class UploadRecordLimitError extends Error {}

export function upload(
  environment: Environment,
  sql: SQL,
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
      let totalRecords: number;

      try {
        totalRecords = await countActivityLogs(
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

      const response = await createImport(sql, totalRecords);
      return c.json(response, 202);
    },
  ];
}

async function countActivityLogs(request: Request, recordLimit: number) {
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
  let totalRecords = 0;

  for await (const row of rows) {
    if (totalRecords >= recordLimit) {
      throw new UploadRecordLimitError(
        `CSV cannot contain more than ${recordLimit} records`,
      );
    }

    if (!ActivityLog.safeParse(row).success) {
      throw new InvalidUploadError(
        `CSV record ${totalRecords + 1} does not match the activity log contract`,
      );
    }

    totalRecords += 1;
  }

  if (totalRecords === 0) {
    throw new InvalidUploadError("CSV must contain at least one record");
  }

  return totalRecords;
}
