import { z } from "zod";

const environmentSchema = z.object({
  API_URL: z.url(),
  API_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1_000),
});

export const environment = environmentSchema.parse(Bun.env);

export type Environment = z.infer<typeof environmentSchema>;
