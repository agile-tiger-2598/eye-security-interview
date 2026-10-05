import { Hono } from "hono";

export function createApp(): Hono {
  const app = new Hono();

  app.post("/imports", (c) => {
    return c.json({});
  });

  app.get("/imports/:id", (c) => {
    return c.json({});
  });

  app.get("/healthz", (c) => {
    return c.json({ status: "ok" });
  });

  return app;
}
