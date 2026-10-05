import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { SQL } from "bun";
import { afterAll, beforeAll, beforeEach } from "bun:test";

import { createApp } from "../src/app.ts";
import type { Environment } from "../src/lib/config.ts";
import {
  AnalyticsRequest,
  EnrichmentRequest,
} from "../src/lib/heyering/contracts.ts";
import {
  startPipeline,
  type Pipeline,
  type PipelineOptions,
} from "../src/pipeline/index.ts";

export interface IntegrationTestSystem {
  readonly apiUrl: URL;
  readonly database: SQL;
  readonly heyeringRequests: readonly CapturedHeyeringRequest[];
  queueHeyeringResponse(
    endpoint: HeyeringEndpoint,
    response: FakeHeyeringResponse,
  ): void;
  restartPipeline(): Promise<void>;
}

export interface CapturedHeyeringRequest {
  readonly authorization: string | null;
  readonly body: unknown;
  readonly path: string;
  readonly receivedAtMs: number;
}

export interface FakeHeyeringResponse {
  readonly body?: unknown;
  readonly delayMs?: number;
  readonly status?: number;
}

export type HeyeringEndpoint = "analytics" | "enrichment";

export const HEYERING_API_TOKEN = "integration-test-token";

export function setupIntegrationTestSystem() {
  let apiServer: Bun.Server<undefined>;
  let database: SQL;
  let heyeringServer: ReturnType<typeof createFakeHeyeringServer>;
  let pipeline: Pipeline;
  let postgresContainer: StartedPostgreSqlContainer;
  let system: IntegrationTestSystem;

  beforeAll(async function () {
    heyeringServer = createFakeHeyeringServer();
    postgresContainer = await new PostgreSqlContainer(
      "postgres:18.6-alpine",
    ).start();

    const databaseUrl = new URL(postgresContainer.getConnectionUri());
    databaseUrl.searchParams.set("sslmode", "disable");
    await migrateDatabase(databaseUrl.href);

    database = new SQL(databaseUrl.href);
    pipeline = await startPipeline(
      database,
      createPipelineOptions(heyeringServer.url),
    );

    const environment = {
      API_HOST: "127.0.0.1",
      API_PORT: 3000,
      DATABASE_URL: databaseUrl.href,
      ENRICHMENT_CONCURRENCY: 25,
      HEYERING_ANALYTICS_RATE_LIMIT_INTERVAL_MS: 0,
      HEYERING_API_TOKEN,
      HEYERING_API_URL: heyeringServer.url.href,
      HEYERING_REQUEST_TIMEOUT_MS: 5_000,
      UPLOAD_BODY_LIMIT_BYTES: 1024 * 1024,
      UPLOAD_RECORD_LIMIT: 100,
    } satisfies Environment;
    const app = createApp(environment, database, {
      submit(records) {
        return pipeline.imports.submit(records);
      },
    });

    apiServer = Bun.serve({
      fetch: app.fetch,
      hostname: "127.0.0.1",
      port: 0,
    });

    system = {
      apiUrl: apiServer.url,
      database,
      heyeringRequests: heyeringServer.requests,
      queueHeyeringResponse(endpoint, response) {
        heyeringServer.queueResponse(endpoint, response);
      },
      async restartPipeline() {
        await pipeline.stop();
        pipeline = await startPipeline(
          database,
          createPipelineOptions(heyeringServer.url),
        );
      },
    };
  }, 120_000);

  beforeEach(function () {
    heyeringServer.clear();
  });

  afterAll(async function () {
    await apiServer.stop(true);
    await pipeline.stop();
    await database.close();
    await heyeringServer.server.stop(true);
    await postgresContainer.stop();
  }, 60_000);

  return function getTestSystem() {
    return system;
  };
}

function createFakeHeyeringServer() {
  const requests: CapturedHeyeringRequest[] = [];
  const queuedResponses: Record<HeyeringEndpoint, FakeHeyeringResponse[]> = {
    analytics: [],
    enrichment: [],
  };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      const body: unknown = await request.json();
      const endpoint =
        path === "/analytics"
          ? "analytics"
          : path === "/enrichment"
            ? "enrichment"
            : undefined;

      requests.push({
        authorization: request.headers.get("authorization"),
        body,
        path,
        receivedAtMs: performance.now(),
      });

      if (!endpoint) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }

      const queuedResponse = queuedResponses[endpoint].shift();

      if (queuedResponse?.delayMs) {
        await delay(queuedResponse.delayMs);
      }

      if (queuedResponse?.status != null) {
        return Response.json(queuedResponse.body ?? { error: "Test failure" }, {
          status: queuedResponse.status,
        });
      }

      if (endpoint === "enrichment") {
        const enrichment = EnrichmentRequest.parse(body);

        return Response.json({
          asn: "AS64500",
          category: "T1566",
          correlationId: enrichment.id ?? 0,
        });
      }

      const events = AnalyticsRequest.parse(body);
      return Response.json({ status: "ok", itemsIngested: events.length });
    },
  });

  return {
    clear() {
      requests.length = 0;
      queuedResponses.analytics.length = 0;
      queuedResponses.enrichment.length = 0;
    },
    queueResponse(endpoint: HeyeringEndpoint, response: FakeHeyeringResponse) {
      queuedResponses[endpoint].push(response);
    },
    requests,
    server,
    url: server.url,
  };
}

function createPipelineOptions(heyeringApiUrl: URL): PipelineOptions {
  return {
    analyticsRateLimitIntervalMs: 0,
    enrichmentConcurrency: 25,
    heyeringApiToken: HEYERING_API_TOKEN,
    heyeringApiUrl,
    requestTimeoutMs: 5_000,
  };
}

async function migrateDatabase(databaseUrl: string) {
  const migration = Bun.spawn(
    ["bun", "run", "dbmate", "--", "--no-dump-schema", "up"],
    {
      cwd: resolve(import.meta.dir, ".."),
      env: { ...Bun.env, DATABASE_URL: databaseUrl },
      stderr: "inherit",
      stdout: "inherit",
    },
  );

  if ((await migration.exited) !== 0) {
    throw new Error("Database migration failed");
  }
}
