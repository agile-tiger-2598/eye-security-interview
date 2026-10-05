import type { SQL } from "bun";
import { fromBunSql, PgBoss } from "pg-boss";

import { createHeyeringClient } from "../lib/heyering/client.ts";
import {
  createImportProducer,
  type ImportProducer,
} from "./import-producer.ts";
import { registerPipelineWorkers } from "./queues.ts";

export interface Pipeline {
  readonly imports: ImportProducer;
  stop(): Promise<void>;
}

export interface PipelineOptions {
  enrichmentConcurrency: number;
  heyeringApiToken: string;
  heyeringApiUrl: string | URL;
  requestTimeoutMs: number;
}

export async function startPipeline(
  database: SQL,
  options: PipelineOptions,
): Promise<Pipeline> {
  const boss = new PgBoss({
    db: fromBunSql(database),
    useListenNotify: true,
  });

  boss.on("error", function (error) {
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        event: "queue_error",
      }),
    );
  });

  boss.on("warning", function (warning) {
    console.warn(
      JSON.stringify({
        event: "queue_warning",
        warning,
      }),
    );
  });

  try {
    await boss.start();

    const client = createHeyeringClient({
      apiToken: options.heyeringApiToken,
      baseUrl: options.heyeringApiUrl,
    });

    await registerPipelineWorkers(database, boss, client, {
      enrichmentConcurrency: options.enrichmentConcurrency,
      requestTimeoutMs: options.requestTimeoutMs,
    });
  } catch (error: unknown) {
    await boss.stop({ graceful: true, timeout: 30_000 });
    throw error;
  }

  return {
    imports: createImportProducer(database, boss),
    stop() {
      return boss.stop({ graceful: true, timeout: 30_000 });
    },
  };
}
