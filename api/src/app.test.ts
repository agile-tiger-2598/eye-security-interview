import { sql } from "bun";
import { describe, expect, it } from "bun:test";

import { createApp } from "./app.ts";
import type { Environment } from "./lib/config.ts";
import type { ImportProducer } from "./pipeline/import-producer.ts";

const environment = {
  API_HOST: "127.0.0.1",
  API_PORT: 3000,
  DATABASE_URL: "postgres://localhost/test",
  ENRICHMENT_CONCURRENCY: 5,
  HEYERING_API_TOKEN: "test-token",
  HEYERING_API_URL: "https://api.heyering.com/",
  HEYERING_REQUEST_TIMEOUT_MS: 30_000,
  UPLOAD_BODY_LIMIT_BYTES: 10 * 1024 * 1024,
  UPLOAD_RECORD_LIMIT: 10_000,
} satisfies Environment;

const jobId = "00000000-0000-4000-8000-000000000001";

const validCsv = `id;asset_name;ip;created_utc;source;category
1;workstation;192.0.2.1;01/01/2026 12:30;endpoint;phishing
`;

const invalidCsv = `id;asset_name;ip;created_utc;source;category
invalid;workstation;192.0.2.1;01/01/2026 12:30;endpoint;phishing
`;

describe("[GET] /imports/:id", function () {
  it("rejects a malformed job ID", async function () {
    const imports: ImportProducer = {
      async submit() {
        throw new Error("Imports must not be submitted");
      },
    };

    const response = await createApp(environment, sql, imports).request(
      "/imports/not-a-uuid",
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Upload job ID must be a UUID",
    });
  });
});

describe("[POST] /imports", function () {
  it("submits valid activity logs", async function () {
    const imports: ImportProducer = {
      async submit(records) {
        expect(records).toEqual([
          {
            id: 1,
            asset_name: "workstation",
            ip: "192.0.2.1",
            created_utc: "01/01/2026 12:30",
            source: "endpoint",
            category: "phishing",
          },
        ]);

        return { job_id: jobId };
      },
    };

    const response = await createApp(environment, sql, imports).request(
      "/imports",
      {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: validCsv,
      },
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ job_id: jobId });
  });

  it("rejects invalid activity logs", async function () {
    const imports: ImportProducer = {
      async submit() {
        throw new Error("Invalid records must not be submitted");
      },
    };

    const response = await createApp(environment, sql, imports).request(
      "/imports",
      {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: invalidCsv,
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "CSV record 1 does not match the activity log contract",
    });
  });
});
