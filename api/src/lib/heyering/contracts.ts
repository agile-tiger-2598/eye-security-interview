import { z } from "zod";

export const EnrichmentCategory = z.enum([
  "contentinjection",
  "drivebycompromise",
  "exploitpublicfacingapplication",
  "externalremoteservices",
  "hardwareadditions",
  "phishing",
  "replicationthroughremovablemedia",
  "supplychaincompromise",
  "trustedrelationship",
  "validaccounts",
]);

export type EnrichmentCategory = z.infer<typeof EnrichmentCategory>;

export const EnrichmentRequest = z
  .object({
    id: z.number().int().positive().optional(),
    asset: z.string().trim().min(1),
    ip: z.string().trim().min(1),
    category: EnrichmentCategory,
  })
  .strict();

export type EnrichmentRequest = z.infer<typeof EnrichmentRequest>;

export const EnrichmentResponse = z
  .object({
    asn: z.string().trim().min(1),
    category: z.string().trim().min(1),
    correlationId: z.number().int(),
  })
  .strict();

export type EnrichmentResponse = z.infer<typeof EnrichmentResponse>;

export const AnalyticsCategory = z.enum([
  "T1659",
  "T1189",
  "T1190",
  "T1133",
  "T1200",
  "T1566",
  "T1091",
  "T1195",
  "T1199",
  "T1078",
]);

export type AnalyticsCategory = z.infer<typeof AnalyticsCategory>;

export const AnalyticsEvent = z
  .object({
    id: z.number().int().positive().optional(),
    asset: z.string().trim().min(1),
    ip: z.string().trim().min(1),
    category: AnalyticsCategory,
    asn: z.string().trim().min(1),
    correlationId: z.number().int(),
  })
  .strict();

export type AnalyticsEvent = z.infer<typeof AnalyticsEvent>;

export const AnalyticsRequest = z.array(AnalyticsEvent).min(1).max(20);

export type AnalyticsRequest = z.infer<typeof AnalyticsRequest>;

export const AnalyticsResponse = z
  .object({
    status: z.enum(["ok", "error"]),
    itemsIngested: z.number().int().nonnegative(),
  })
  .strict();

export type AnalyticsResponse = z.infer<typeof AnalyticsResponse>;
