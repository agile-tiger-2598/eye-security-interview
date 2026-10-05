import { z } from "zod";

export const UploadStatus = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
]);

export type UploadStatus = z.infer<typeof UploadStatus>;

export const UploadStatusResponse = z
  .object({
    job_id: z.uuid(),
    status: UploadStatus,
    total_records: z.number().int().nonnegative(),
    successful_records: z.number().int().nonnegative(),
    failed_records: z.number().int().nonnegative(),
  })
  .strict();

export type UploadStatusResponse = z.infer<typeof UploadStatusResponse>;
