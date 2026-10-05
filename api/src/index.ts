import { SQL } from "bun";

import { createApp } from "./app.ts";
import { parseEnvironment } from "./lib/config.ts";

const environment = parseEnvironment(Bun.env);
const database = new SQL(environment.DATABASE_URL);

const app = createApp(environment, database);

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
