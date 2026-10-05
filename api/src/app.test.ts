import { describe, expect, it } from "bun:test";

import { createApp } from "./app.ts";

describe("API", function () {
  it("[GET] /healthz", async function () {
    const response = await createApp().request("/healthz");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok" });
  });
});
