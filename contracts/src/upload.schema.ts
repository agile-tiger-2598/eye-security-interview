import { z } from "zod";

export const UploadResponse = z
  .object({
    job_id: z.uuid(),
  })
  .strict();

export type UploadResponse = z.infer<typeof UploadResponse>;
