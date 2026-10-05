import { UploadStatusResponse } from "@eye-security-interview/contracts";
import type { SQL } from "bun";
import type { Env, Handler } from "hono";
import { z } from "zod";

export function status(sql: SQL): Handler<Env, "/imports/:id"> {
  return async function statusHandler(c) {
    const importId = ImportId.safeParse(c.req.param("id"));

    if (!importId.success) {
      return c.json({ error: "Upload job ID must be a UUID" }, 400);
    }

    const upload = await findImportById(sql, importId.data);

    if (!upload) {
      return c.json({ error: "Upload job not found" }, 404);
    }

    return c.json(upload);
  };
}

async function findImportById(sql: SQL, id: string) {
  const rows = await sql`
    SELECT
      id AS job_id,
      status,
      total_records,
      successful_records,
      failed_records
    FROM imports
    WHERE id = ${id}
  `;
  const row = rows.at(0);

  return row ? UploadStatusResponse.parse(row) : undefined;
}

const ImportId = z.uuid();
