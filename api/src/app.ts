import type { SQL } from "bun";
import { Hono } from "hono";

import type { Environment } from "./lib/config.ts";
import { status } from "./routes/status.ts";
import { upload } from "./routes/upload.ts";
import type { ImportProducer } from "./pipeline/import-producer.ts";

export function createApp(
  environment: Environment,
  sql: SQL,
  imports: ImportProducer,
) {
  const app = new Hono();
  app.post("/imports", ...upload(environment, imports));
  app.get("/imports/:id", status(sql));
  app.get("/healthz", (c) => c.json({ status: "ok" }));
  return app;
}
