import {
  EnrichmentCategory,
  type EnrichmentCategory as EnrichmentCategoryData,
} from "./contracts.ts";

export function normalizeEnrichmentCategory(
  input: string,
): EnrichmentCategoryData | undefined {
  const normalized = input.toLowerCase().replaceAll(/[^a-z]/g, "");
  const category = CATEGORY_ALIASES[normalized] ?? normalized;
  const result = EnrichmentCategory.safeParse(category);

  return result.success ? result.data : undefined;
}

// assumption: all data we receive is as unclean as the example data, otherwise these should fail.
const CATEGORY_ALIASES: Readonly<Record<string, EnrichmentCategoryData>> = {
  compromisedriveby: "drivebycompromise",
  explaoitpublicfacing: "exploitpublicfacingapplication",
  exploitpublicfacing: "exploitpublicfacingapplication",
  externalremoteservice: "externalremoteservices",
  phising: "phishing",
  validaaccounts: "validaccounts",
};
