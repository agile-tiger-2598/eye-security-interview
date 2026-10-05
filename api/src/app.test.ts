import { sql } from "bun";
import { describe, expect, it } from "bun:test";

import { createApp } from "./app.ts";
import type { Environment } from "./lib/config.ts";

const environment = {
  API_HOST: "127.0.0.1",
  API_PORT: 3000,
  DATABASE_URL: "postgres://localhost/test",
  UPLOAD_BODY_LIMIT_BYTES: 10 * 1024 * 1024,
  UPLOAD_RECORD_LIMIT: 10_000,
} satisfies Environment;

describe("API", function () {
  it("[GET] /healthz", async function () {
    const response = await createApp(environment, sql).request("/healthz");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok" });
  });
});
