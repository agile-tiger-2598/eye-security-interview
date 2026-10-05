import type { SQL } from "bun";
import type { Env, Handler } from "hono";

import { findImportById } from "../lib/queries.ts";

export function status(sql: SQL): Handler<Env, "/imports/:id"> {
  return async function statusHandler(c) {
    const upload = await findImportById(sql, c.req.param("id"));

    if (!upload) {
      return c.json({ error: "Upload job not found" }, 404);
    }

    return c.json(upload);
  };
}
