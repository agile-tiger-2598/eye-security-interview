import type { SQL } from "bun";
import { Hono } from "hono";

import type { Environment } from "./lib/config.ts";
import { status } from "./routes/status.ts";
import { upload } from "./routes/upload.ts";

export function createApp(environment: Environment, sql: SQL) {
  const app = new Hono();
  app.post("/imports", ...upload(environment, sql));
  app.get("/imports/:id", status(sql));
  app.get("/healthz", (c) => c.json({ status: "ok" }));
  return app;
}
