import { z } from "zod";

export function parseEnvironment(input: unknown): Environment {
  return environmentSchema.parse(input);
}

export type Environment = z.infer<typeof environmentSchema>;

const environmentSchema = z.object({
  API_HOST: z.string().trim().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.url(),
  UPLOAD_BODY_LIMIT_BYTES: z.coerce.number().int().positive(),
  UPLOAD_RECORD_LIMIT: z.coerce.number().int().positive(),
});
