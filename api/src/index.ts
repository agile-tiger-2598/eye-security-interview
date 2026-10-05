import { SQL } from "bun";

import { createApp } from "./app.ts";
import { parseEnvironment } from "./lib/config.ts";
import { startPipeline } from "./pipeline/index.ts";

const environment = parseEnvironment(Bun.env);
const database = new SQL(environment.DATABASE_URL);
const pipeline = await startPipeline(database, {
  analyticsRateLimitIntervalMs:
    environment.HEYERING_ANALYTICS_RATE_LIMIT_INTERVAL_MS,
  enrichmentConcurrency: environment.ENRICHMENT_CONCURRENCY,
  heyeringApiToken: environment.HEYERING_API_TOKEN,
  heyeringApiUrl: environment.HEYERING_API_URL,
  requestTimeoutMs: environment.HEYERING_REQUEST_TIMEOUT_MS,
});
const app = createApp(environment, database, pipeline.imports);

const server = Bun.serve({
  fetch: app.fetch,
  hostname: environment.API_HOST,
  port: environment.API_PORT,
});

console.info(
  JSON.stringify({
    event: "api_started",
    url: server.url.href,
  }),
);

let shutdownPromise: Promise<void> | undefined;

process.once("SIGINT", function () {
  requestShutdown("SIGINT");
});
process.once("SIGTERM", function () {
  requestShutdown("SIGTERM");
});

function requestShutdown(signal: "SIGINT" | "SIGTERM") {
  shutdownPromise ??= shutdownAndExit(signal);
}

async function shutdownAndExit(signal: "SIGINT" | "SIGTERM") {
  console.info(JSON.stringify({ event: "shutdown_started", signal }));

  try {
    await server.stop();
    await pipeline.stop();
    await database.close();

    console.info(JSON.stringify({ event: "shutdown_completed", signal }));
    process.exit(0);
  } catch (error: unknown) {
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        event: "shutdown_failed",
      }),
    );
    process.exit(1);
  }
}
