import { z } from "zod";

export function parseEnvironment(input: unknown): Environment {
  return environmentSchema.parse(input);
}

export type Environment = z.infer<typeof environmentSchema>;

const environmentSchema = z.object({
  API_HOST: z.string().trim().min(1),
  API_PORT: z.coerce.number().int().min(1).max(65_535),
  DATABASE_URL: z.url(),
  ENRICHMENT_CONCURRENCY: z.coerce.number().int().min(1).max(100),
  HEYERING_API_TOKEN: z.string().trim().min(1),
  HEYERING_API_URL: z.url(),
  HEYERING_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive(),
  UPLOAD_BODY_LIMIT_BYTES: z.coerce.number().int().positive(),
  UPLOAD_RECORD_LIMIT: z.coerce.number().int().positive(),
});
