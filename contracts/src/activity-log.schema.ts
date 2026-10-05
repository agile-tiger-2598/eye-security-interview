import { z } from "zod";

export const ActivityLog = z
  .object({
    id: z.coerce.number().int().positive(),
    asset_name: z.string().trim().min(1),
    ip: z.ipv4(),
    created_utc: z.string().regex(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/),
    source: z.string().trim().min(1),
    category: z.string().trim().min(1),
  })
  .strict();

export type ActivityLog = z.infer<typeof ActivityLog>;
