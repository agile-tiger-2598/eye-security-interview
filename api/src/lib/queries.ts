import type { SQL } from "bun";
import {
  UploadResponse,
  UploadStatusResponse,
} from "@eye-security-interview/contracts";

export async function createImport(sql: SQL, totalRecords: number) {
  const rows = await sql`
    INSERT INTO imports (total_records)
    VALUES (${totalRecords})
    RETURNING id AS job_id
  `;

  return UploadResponse.parse(rows.at(0));
}

export async function findImportById(sql: SQL, id: string) {
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
